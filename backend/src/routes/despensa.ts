import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { encontrarOuCriarProduto } from "../lib/produtos.js";
import { badRequest, notFound } from "../lib/http-error.js";

const adicionarItemSchema = z.object({
  nome: z.string().trim().min(1),
  quantidade: z.number().int().min(1).default(1),
  categoriaId: z.string().optional(),
  codigoBarras: z.string().trim().min(1).optional(),
});

const ajustarQuantidadeSchema = z.object({
  delta: z.number().int().refine((v) => v !== 0, "delta não pode ser zero"),
});

export async function despensaRoutes(app: FastifyInstance) {
  // RN-02.2: itens agrupados por categoria (ordem da categoria), por ordem de inserção dentro do grupo.
  app.get("/despensa", async () => {
    const itens = await prisma.itemDespensa.findMany({
      include: { produto: { include: { categoria: true } } },
      orderBy: { createdAt: "asc" },
    });

    const categoriasOrdenadas = await prisma.categoria.findMany({ orderBy: { ordem: "asc" } });
    const grupos = categoriasOrdenadas.map((categoria) => ({
      categoria,
      itens: itens.filter((item) => item.produto.categoriaId === categoria.id),
    }));

    return grupos.filter((grupo) => grupo.itens.length > 0);
  });

  // Regra 4.1: item já existente soma quantidade em vez de duplicar linha.
  app.post("/despensa", async (request, reply) => {
    const parsed = adicionarItemSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
    const { nome, quantidade, categoriaId, codigoBarras } = parsed.data;

    const item = await prisma.$transaction(async (tx) => {
      const { produto } = await encontrarOuCriarProduto(tx, { nome, categoriaId, codigoBarras });

      const existente = await tx.itemDespensa.findUnique({ where: { produtoId: produto.id } });
      if (existente) {
        return tx.itemDespensa.update({
          where: { id: existente.id },
          data: { quantidade: existente.quantidade + quantidade },
          include: { produto: { include: { categoria: true } } },
        });
      }

      return tx.itemDespensa.create({
        data: { produtoId: produto.id, quantidade },
        include: { produto: { include: { categoria: true } } },
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
      include: { produto: { include: { categoria: true } } },
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
