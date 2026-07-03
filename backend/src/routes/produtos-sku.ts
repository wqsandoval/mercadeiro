import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { agregarHistoricoPrecos, encontrarOuCriarProdutoSku } from "../lib/produtos.js";
import { badRequest, conflict, notFound } from "../lib/http-error.js";

const produtoSkuInclude = { produto: { include: { categoria: true } } } as const;

const criarProdutoSkuSchema = z.object({
  nome: z.string().trim().min(1),
  marca: z.string().trim().min(1).optional(),
  codigoBarras: z.string().trim().min(1).optional(),
  produtoId: z.string().optional(),
  produtoGenericoNome: z.string().trim().min(1).optional(),
  categoriaId: z.string().optional(),
});

const atualizarProdutoSkuSchema = z
  .object({
    nome: z.string().trim().min(1).optional(),
    marca: z.string().trim().min(1).nullable().optional(),
    codigoBarras: z.string().trim().min(1).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Nenhum campo para atualizar");

const listarProdutoSkuQuerySchema = z.object({
  produtoId: z.string().optional(),
  codigoBarras: z.string().optional(),
  busca: z.string().optional(),
});

export async function produtosSkuRoutes(app: FastifyInstance) {
  // Marcas/embalagens cadastradas para um Produto genérico (typeahead na Despensa/Carrinho).
  app.get("/produtos/:id/skus", async (request) => {
    const { id } = request.params as { id: string };
    const produto = await prisma.produto.findUnique({ where: { id } });
    if (!produto) throw notFound("Produto");

    return prisma.produtoSku.findMany({
      where: { produtoId: id },
      include: produtoSkuInclude,
      orderBy: { nome: "asc" },
    });
  });

  // Lookup principal do fluxo de scan (RN-03.7): busca por código de barras exato ou nome.
  app.get("/produtos-sku", async (request) => {
    const parsed = listarProdutoSkuQuerySchema.safeParse(request.query);
    if (!parsed.success) throw badRequest("Parâmetros inválidos", parsed.error.issues);
    const { produtoId, codigoBarras, busca } = parsed.data;

    return prisma.produtoSku.findMany({
      where: {
        produtoId,
        codigoBarras,
        nome: busca ? { contains: busca, mode: "insensitive" } : undefined,
      },
      include: produtoSkuInclude,
      orderBy: { nome: "asc" },
    });
  });

  app.get("/produtos-sku/:id", async (request) => {
    const { id } = request.params as { id: string };
    const produtoSku = await prisma.produtoSku.findUnique({ where: { id }, include: produtoSkuInclude });
    if (!produtoSku) throw notFound("ProdutoSku");
    return produtoSku;
  });

  app.post("/produtos-sku", async (request, reply) => {
    const parsed = criarProdutoSkuSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const { produtoSku, criado } = await prisma.$transaction((tx) =>
      encontrarOuCriarProdutoSku(tx, parsed.data),
    );
    reply.status(criado ? 201 : 200);
    return produtoSku;
  });

  app.put("/produtos-sku/:id", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = atualizarProdutoSkuSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const existente = await prisma.produtoSku.findUnique({ where: { id } });
    if (!existente) throw notFound("ProdutoSku");

    return prisma.produtoSku.update({
      where: { id },
      data: parsed.data,
      include: produtoSkuInclude,
    });
  });

  // Histórico de preço do SKU, agrupado por Supermercado — equivalente a GET /produtos/:id/precos,
  // mas no nível de marca/embalagem específica (decisão: preço vive no SKU).
  app.get("/produtos-sku/:id/precos", async (request) => {
    const { id } = request.params as { id: string };
    const existente = await prisma.produtoSku.findUnique({ where: { id } });
    if (!existente) throw notFound("ProdutoSku");

    const registros = await prisma.precoHistorico.findMany({
      where: { produtoSkuId: id },
      include: { supermercado: true },
      orderBy: { data: "desc" },
    });

    return agregarHistoricoPrecos(registros);
  });

  app.delete("/produtos-sku/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existente = await prisma.produtoSku.findUnique({ where: { id } });
    if (!existente) throw notFound("ProdutoSku");

    const [emDespensa, emCompra] = await Promise.all([
      prisma.itemDespensa.count({ where: { produtoSkuId: id } }),
      prisma.itemCompra.count({ where: { produtoSkuId: id } }),
    ]);
    if (emDespensa > 0 || emCompra > 0) {
      throw conflict("ProdutoSku está em uso na Despensa ou em uma Compra e não pode ser removido");
    }

    await prisma.produtoSku.delete({ where: { id } });
    reply.status(204);
  });
}
