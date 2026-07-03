import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { resolverReferenciaProdutoOuSku } from "../lib/produtos.js";
import { badRequest, notFound } from "../lib/http-error.js";

const itemDespensaInclude = {
  produto: { include: { categoria: true } },
  produtoSku: { include: { produto: { include: { categoria: true } } } },
} as const;

// Um item da Despensa referencia OU um Produto genérico (nome livre, ex: "leite")
// OU um ProdutoSku específico (nome + produtoGenericoNome, ex: "Leite Elegê Semidesnatado"
// dentro do genérico "Leite") — nunca os dois. produtoId/produtoSkuId são atalhos para
// reaproveitar um já cadastrado sem precisar redigitar o nome.
const adicionarItemSchema = z.object({
  produtoId: z.string().optional(),
  produtoSkuId: z.string().optional(),
  nome: z.string().trim().min(1).optional(),
  tipo: z.enum(["GENERICO", "SKU"]).default("GENERICO"),
  produtoGenericoNome: z.string().trim().min(1).optional(),
  marca: z.string().trim().min(1).optional(),
  codigoBarras: z.string().trim().min(1).optional(),
  quantidade: z.number().int().min(1).default(1),
  categoriaId: z.string().optional(),
});

const ajustarQuantidadeSchema = z.object({
  delta: z.number().int().refine((v) => v !== 0, "delta não pode ser zero"),
});

export async function despensaRoutes(app: FastifyInstance) {
  // RN-02.2: itens agrupados por categoria (do genérico direto ou via produtoSku.produto), por ordem de inserção dentro do grupo.
  app.get("/despensa", async () => {
    const itens = await prisma.itemDespensa.findMany({
      include: itemDespensaInclude,
      orderBy: { createdAt: "asc" },
    });

    const categoriasOrdenadas = await prisma.categoria.findMany({ orderBy: { ordem: "asc" } });
    const grupos = categoriasOrdenadas.map((categoria) => ({
      categoria,
      itens: itens.filter((item) => {
        const categoriaId = item.produto?.categoriaId ?? item.produtoSku!.produto.categoriaId;
        return categoriaId === categoria.id;
      }),
    }));

    return grupos.filter((grupo) => grupo.itens.length > 0);
  });

  // Regra 4.1: item já existente (mesmo Produto genérico OU mesmo ProdutoSku) soma quantidade em vez de duplicar linha.
  app.post("/despensa", async (request, reply) => {
    const parsed = adicionarItemSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
    const { quantidade, ...referencia } = parsed.data;

    const item = await prisma.$transaction(async (tx) => {
      const { produtoId: resolvedProdutoId, produtoSkuId: resolvedProdutoSkuId } =
        await resolverReferenciaProdutoOuSku(tx, referencia);

      const existente = resolvedProdutoId
        ? await tx.itemDespensa.findUnique({ where: { produtoId: resolvedProdutoId } })
        : await tx.itemDespensa.findUnique({ where: { produtoSkuId: resolvedProdutoSkuId! } });

      if (existente) {
        return tx.itemDespensa.update({
          where: { id: existente.id },
          data: { quantidade: existente.quantidade + quantidade },
          include: itemDespensaInclude,
        });
      }

      return tx.itemDespensa.create({
        data: { produtoId: resolvedProdutoId, produtoSkuId: resolvedProdutoSkuId, quantidade },
        include: itemDespensaInclude,
      });
    });

    reply.status(201);
    return item;
  });

  // RN-02.1: decrementar de 1 remove o item; quantidade mínima é 1.
  app.patch("/despensa/:id/quantidade", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = ajustarQuantidadeSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const existente = await prisma.itemDespensa.findUnique({ where: { id } });
    if (!existente) throw notFound("Item da despensa");

    const novaQuantidade = existente.quantidade + parsed.data.delta;
    if (novaQuantidade < 1) {
      await prisma.itemDespensa.delete({ where: { id } });
      return { removido: true, id };
    }

    return prisma.itemDespensa.update({
      where: { id },
      data: { quantidade: novaQuantidade },
      include: itemDespensaInclude,
    });
  });

  app.delete("/despensa/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existente = await prisma.itemDespensa.findUnique({ where: { id } });
    if (!existente) throw notFound("Item da despensa");

    await prisma.itemDespensa.delete({ where: { id } });
    reply.status(204);
  });
}
