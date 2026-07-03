import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { OrigemItemCompra, Prisma, StatusCompra } from "@prisma/client";
import { prisma } from "../prisma.js";
import { encontrarOuCriarProduto } from "../lib/produtos.js";
import { badRequest, conflict, notFound } from "../lib/http-error.js";

const itemCompraInclude = {
  produto: { include: { categoria: true } },
} as const;

const criarCompraSchema = z.object({
  supermercadoId: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const atualizarCompraSchema = z.object({
  supermercadoId: z.string().nullable().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const adicionarItemExtraSchema = z.object({
  nome: z.string().trim().min(1),
  quantidade: z.number().int().min(1).default(1),
  categoriaId: z.string().optional(),
  codigoBarras: z.string().trim().min(1).optional(),
});

const atualizarItemSchema = z
  .object({
    comprado: z.boolean().optional(),
    precoUnitario: z.number().positive().nullable().optional(),
    codigoBarrasLido: z.string().trim().min(1).optional(),
    quantidade: z.number().int().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Nenhum campo para atualizar");

const ajustarQuantidadeSchema = z.object({
  delta: z.number().int().refine((v) => v !== 0, "delta não pode ser zero"),
});

async function buscarCompraOuFalhar(id: string) {
  const compra = await prisma.compra.findUnique({
    where: { id },
    include: {
      itens: { include: itemCompraInclude, orderBy: { createdAt: "asc" } },
      supermercado: true,
    },
  });
  if (!compra) throw notFound("Compra");
  return compra;
}

function garantirEmAndamento(compra: { status: StatusCompra }) {
  // RN-05.4: compra finalizada é somente leitura.
  if (compra.status === StatusCompra.FINALIZADA) {
    throw conflict("Compra já finalizada é somente leitura");
  }
}

export async function comprasRoutes(app: FastifyInstance) {
  app.get("/compras/atual", async () => {
    const compra = await prisma.compra.findFirst({
      where: { status: StatusCompra.EM_ANDAMENTO },
      include: {
        itens: { include: itemCompraInclude, orderBy: { createdAt: "asc" } },
        supermercado: true,
      },
    });
    if (!compra) throw notFound("Compra em andamento");
    return compra;
  });

  app.get("/compras/:id", async (request) => {
    const { id } = request.params as { id: string };
    return buscarCompraOuFalhar(id);
  });

  // RN-02.4/RN-05.5: só uma Compra EM_ANDAMENTO por vez — se já existe, retoma em vez de criar outra.
  app.post("/compras", async (request, reply) => {
    const parsed = criarCompraSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const existente = await prisma.compra.findFirst({
      where: { status: StatusCompra.EM_ANDAMENTO },
      include: {
        itens: { include: itemCompraInclude, orderBy: { createdAt: "asc" } },
        supermercado: true,
      },
    });
    if (existente) {
      reply.status(200);
      return existente;
    }

    const compra = await prisma.$transaction(async (tx) => {
      const itensDespensa = await tx.itemDespensa.findMany();

      const novaCompra = await tx.compra.create({
        data: {
          supermercadoId: parsed.data.supermercadoId,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
        },
      });

      // RN-02.3: copia da Despensa para a Compra como planejado/não comprado, sem remover da Despensa.
      if (itensDespensa.length > 0) {
        await tx.itemCompra.createMany({
          data: itensDespensa.map((item) => ({
            compraId: novaCompra.id,
            produtoId: item.produtoId,
            quantidade: item.quantidade,
            origem: OrigemItemCompra.PLANEJADO,
            comprado: false,
          })),
        });
      }

      return tx.compra.findUniqueOrThrow({
        where: { id: novaCompra.id },
        include: {
          itens: { include: itemCompraInclude, orderBy: { createdAt: "asc" } },
          supermercado: true,
        },
      });
    });

    reply.status(201);
    return compra;
  });

  // RN-03.5: supermercado trocável manualmente a qualquer momento antes de finalizar.
  app.patch("/compras/:id", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = atualizarCompraSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const compra = await buscarCompraOuFalhar(id);
    garantirEmAndamento(compra);

    return prisma.compra.update({
      where: { id },
      data: parsed.data,
      include: {
        itens: { include: itemCompraInclude, orderBy: { createdAt: "asc" } },
        supermercado: true,
      },
    });
  });

  // Item extra: origem=EXTRA, não comprado, sem preço (UC-03).
  app.post("/compras/:id/itens", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = adicionarItemExtraSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
    const { nome, quantidade, categoriaId, codigoBarras } = parsed.data;

    const compra = await buscarCompraOuFalhar(id);
    garantirEmAndamento(compra);

    const item = await prisma.$transaction(async (tx) => {
      const { produto } = await encontrarOuCriarProduto(tx, { nome, categoriaId, codigoBarras });

      const existente = await tx.itemCompra.findUnique({
        where: { compraId_produtoId: { compraId: id, produtoId: produto.id } },
      });
      if (existente) {
        return tx.itemCompra.update({
          where: { id: existente.id },
          data: { quantidade: existente.quantidade + quantidade },
          include: itemCompraInclude,
        });
      }

      return tx.itemCompra.create({
        data: {
          compraId: id,
          produtoId: produto.id,
          quantidade,
          origem: OrigemItemCompra.EXTRA,
          comprado: false,
        },
        include: itemCompraInclude,
      });
    });

    reply.status(201);
    return item;
  });

  // RN-03.1: comprado só pode ser true com preço definido (existente ou informado nesta requisição).
  app.patch("/compras/:id/itens/:itemId", async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const parsed = atualizarItemSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const compra = await buscarCompraOuFalhar(id);
    garantirEmAndamento(compra);

    const item = await prisma.itemCompra.findUnique({ where: { id: itemId } });
    if (!item || item.compraId !== id) throw notFound("Item da compra");

    const { comprado, precoUnitario, codigoBarrasLido, quantidade } = parsed.data;

    const precoFinal = precoUnitario !== undefined ? precoUnitario : item.precoUnitario;
    if (comprado === true && (precoFinal === null || precoFinal === undefined)) {
      throw badRequest("Item não pode ser marcado como comprado sem preço definido");
    }

    return prisma.itemCompra.update({
      where: { id: itemId },
      data: {
        comprado,
        precoUnitario: precoUnitario !== undefined ? precoUnitario : undefined,
        codigoBarrasLido,
        quantidade,
      },
      include: itemCompraInclude,
    });
  });

  app.patch("/compras/:id/itens/:itemId/quantidade", async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const parsed = ajustarQuantidadeSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const compra = await buscarCompraOuFalhar(id);
    garantirEmAndamento(compra);

    const item = await prisma.itemCompra.findUnique({ where: { id: itemId } });
    if (!item || item.compraId !== id) throw notFound("Item da compra");

    const novaQuantidade = item.quantidade + parsed.data.delta;
    if (novaQuantidade < 1) {
      await prisma.itemCompra.delete({ where: { id: itemId } });
      return { removido: true, id: itemId };
    }

    return prisma.itemCompra.update({
      where: { id: itemId },
      data: { quantidade: novaQuantidade },
      include: itemCompraInclude,
    });
  });

  app.delete("/compras/:id/itens/:itemId", async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const compra = await buscarCompraOuFalhar(id);
    garantirEmAndamento(compra);

    const item = await prisma.itemCompra.findUnique({ where: { id: itemId } });
    if (!item || item.compraId !== id) throw notFound("Item da compra");

    await prisma.itemCompra.delete({ where: { id: itemId } });
    reply.status(204);
  });

  // RN-05.1 a RN-05.4: classifica os três blocos e aplica efeitos de forma transacional.
  app.post("/compras/:id/finalizar", async (request) => {
    const { id } = request.params as { id: string };
    const compra = await buscarCompraOuFalhar(id);
    garantirEmAndamento(compra);

    const resultado = await prisma.$transaction(async (tx) => {
      const itens = await tx.itemCompra.findMany({ where: { compraId: id } });

      for (const item of itens) {
        const comprado = item.comprado && item.precoUnitario !== null;

        if (comprado) {
          // RN-05.2: PrecoHistorico só para itens efetivamente comprados com preço.
          await tx.precoHistorico.create({
            data: {
              produtoId: item.produtoId,
              supermercadoId: compra.supermercadoId ?? (await garantirSupermercadoGenerico(tx)),
              compraId: id,
              preco: item.precoUnitario!,
            },
          });

          if (item.origem === OrigemItemCompra.PLANEJADO) {
            await tx.itemDespensa.deleteMany({ where: { produtoId: item.produtoId } });
          }
        } else if (item.origem === OrigemItemCompra.PLANEJADO) {
          // Mantém/recria o ItemDespensa para itens planejados não comprados.
          await tx.itemDespensa.upsert({
            where: { produtoId: item.produtoId },
            update: {},
            create: { produtoId: item.produtoId, quantidade: item.quantidade },
          });
        }
        // RN-05.1: item extra não comprado é descartado silenciosamente (nenhuma ação).
      }

      return tx.compra.update({
        where: { id },
        data: { status: StatusCompra.FINALIZADA, finalizadaEm: new Date() },
        include: {
          itens: { include: itemCompraInclude, orderBy: { createdAt: "asc" } },
          supermercado: true,
        },
      });
    });

    return resultado;
  });
}

/**
 * Compra sem supermercado definido não deveria alcançar o finalizar em uso normal
 * (a UI exige seleção manual como fallback — RN-03.6). Este helper evita quebrar a
 * transação em cenários de dados incompletos, reaproveitando/criando um supermercado
 * placeholder em vez de falhar a finalização inteira.
 */
async function garantirSupermercadoGenerico(tx: Prisma.TransactionClient) {
  const nome = "Supermercado não informado";
  const existente = await tx.supermercado.findFirst({ where: { nome } });
  if (existente) return existente.id;
  const criado = await tx.supermercado.create({ data: { nome } });
  return criado.id;
}
