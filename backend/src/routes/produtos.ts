import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { agregarHistoricoPrecos, encontrarOuCriarProduto, resolverCategoriaId } from "../lib/produtos.js";
import { badRequest, conflict, notFound } from "../lib/http-error.js";

const criarProdutoSchema = z.object({
  nome: z.string().trim().min(1),
  categoriaId: z.string().optional(),
});

const atualizarProdutoSchema = z.object({
  nome: z.string().trim().min(1).optional(),
  categoriaId: z.string().optional(),
});

const listarProdutosQuerySchema = z.object({
  categoriaId: z.string().optional(),
  busca: z.string().optional(),
});

export async function produtosRoutes(app: FastifyInstance) {
  app.get("/produtos", async (request) => {
    const parsed = listarProdutosQuerySchema.safeParse(request.query);
    if (!parsed.success) throw badRequest("Parâmetros inválidos", parsed.error.issues);
    const { categoriaId, busca } = parsed.data;

    return prisma.produto.findMany({
      where: {
        categoriaId,
        nome: busca ? { contains: busca, mode: "insensitive" } : undefined,
      },
      include: { categoria: true },
      orderBy: { nome: "asc" },
    });
  });

  app.get("/produtos/:id", async (request) => {
    const { id } = request.params as { id: string };
    const produto = await prisma.produto.findUnique({ where: { id }, include: { categoria: true } });
    if (!produto) throw notFound("Produto");
    return produto;
  });

  // RN 4.1: nome já existente reaproveita o registro em vez de duplicar.
  app.post("/produtos", async (request, reply) => {
    const parsed = criarProdutoSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const { produto, criado } = await encontrarOuCriarProduto(prisma, parsed.data);
    reply.status(criado ? 201 : 200);
    return produto;
  });

  app.put("/produtos/:id", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = atualizarProdutoSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const existente = await prisma.produto.findUnique({ where: { id } });
    if (!existente) throw notFound("Produto");

    const categoriaId = parsed.data.categoriaId
      ? await resolverCategoriaId(prisma, parsed.data.categoriaId)
      : undefined;

    return prisma.produto.update({
      where: { id },
      data: { ...parsed.data, categoriaId },
    });
  });

  // Histórico de preço do produto agrupado por Produto+Supermercado (task 10),
  // base para o preço sugerido no scan (RN-03.7) e para o ranking 3b.
  app.get("/produtos/:id/precos", async (request) => {
    const { id } = request.params as { id: string };
    const existente = await prisma.produto.findUnique({ where: { id } });
    if (!existente) throw notFound("Produto");

    const registros = await prisma.precoHistorico.findMany({
      where: { produtoId: id },
      include: { supermercado: true },
      orderBy: { data: "desc" },
    });

    return agregarHistoricoPrecos(registros);
  });

  app.delete("/produtos/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existente = await prisma.produto.findUnique({ where: { id } });
    if (!existente) throw notFound("Produto");

    const [emDespensa, emCompra, comSkus] = await Promise.all([
      prisma.itemDespensa.count({ where: { produtoId: id } }),
      prisma.itemCompra.count({ where: { produtoId: id } }),
      prisma.produtoSku.count({ where: { produtoId: id } }),
    ]);
    if (emDespensa > 0 || emCompra > 0) {
      throw conflict("Produto está em uso na Despensa ou em uma Compra e não pode ser removido");
    }
    if (comSkus > 0) {
      throw conflict("Produto possui SKUs cadastrados e não pode ser removido");
    }

    await prisma.produto.delete({ where: { id } });
    reply.status(204);
  });
}
