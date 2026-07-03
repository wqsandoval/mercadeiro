import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { OrigemItemCompra, Prisma, StatusCompra } from "@prisma/client";
import { prisma } from "../prisma.js";
import {
  buscarProdutoSkuOuFalhar,
  encontrarOuCriarProdutoSku,
  resolverReferenciaProdutoOuSku,
} from "../lib/produtos.js";
import { badRequest, conflict, HttpError, notFound } from "../lib/http-error.js";

const itemCompraInclude = {
  produto: { include: { categoria: true } },
  produtoSku: true,
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

// Item extra: mesmo either-or genérico/SKU da Despensa (ver lib/produtos.ts#resolverReferenciaProdutoOuSku).
const adicionarItemExtraSchema = z.object({
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

// Vínculo de SKU a um item do Carrinho (opcional — RN-03.1 continua exigindo só preço para
// marcar comprado). Aceita SKU já conhecido por id, por código de barras (fluxo de scan,
// criando um SKU novo se vier "nome" e o código for desconhecido), ou por nome manual.
const vincularSkuSchema = z
  .object({
    produtoSkuId: z.string().optional(),
    codigoBarras: z.string().trim().min(1).optional(),
    nome: z.string().trim().min(1).optional(),
    marca: z.string().trim().min(1).optional(),
  })
  .refine(
    (data) => !!data.produtoSkuId || !!data.codigoBarras || !!data.nome,
    "Informe produtoSkuId, codigoBarras ou nome",
  );

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

async function buscarItemOuFalhar(compraId: string, itemId: string) {
  const item = await prisma.itemCompra.findUnique({
    where: { id: itemId },
    include: { produto: true },
  });
  if (!item || item.compraId !== compraId) throw notFound("Item da compra");
  return item;
}

/**
 * RN-03.7 estendida: preço sugerido prioriza o histórico do SKU (mesmo supermercado, depois
 * qualquer supermercado) e cai para o histórico do genérico na mesma cascata; sem nenhum
 * registro, retorna null (campo em branco).
 */
async function sugerirPreco(
  tx: Prisma.TransactionClient | typeof prisma,
  input: { produtoId: string; produtoSkuId?: string | null; supermercadoId?: string | null },
): Promise<number | null> {
  const buscarUltimo = async (where: Prisma.PrecoHistoricoWhereInput) => {
    const registro = await tx.precoHistorico.findFirst({ where, orderBy: { data: "desc" } });
    return registro ? Number(registro.preco) : null;
  };

  if (input.produtoSkuId) {
    if (input.supermercadoId) {
      const porSkuEMercado = await buscarUltimo({
        produtoSkuId: input.produtoSkuId,
        supermercadoId: input.supermercadoId,
      });
      if (porSkuEMercado !== null) return porSkuEMercado;
    }
    const porSku = await buscarUltimo({ produtoSkuId: input.produtoSkuId });
    if (porSku !== null) return porSku;
  }

  if (input.supermercadoId) {
    const porGenericoEMercado = await buscarUltimo({
      produtoId: input.produtoId,
      supermercadoId: input.supermercadoId,
    });
    if (porGenericoEMercado !== null) return porGenericoEMercado;
  }
  return buscarUltimo({ produtoId: input.produtoId });
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
      const itensDespensa = await tx.itemDespensa.findMany({ include: { produtoSku: true } });

      const novaCompra = await tx.compra.create({
        data: {
          supermercadoId: parsed.data.supermercadoId,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
        },
      });

      // RN-02.3: copia da Despensa para a Compra como planejado/não comprado, sem remover da Despensa.
      // Item de despensa SKU'd entra no carrinho já vinculado ao mesmo SKU; genérico entra só com o genérico.
      if (itensDespensa.length > 0) {
        await tx.itemCompra.createMany({
          data: itensDespensa.map((item) => ({
            compraId: novaCompra.id,
            produtoId: item.produtoId ?? item.produtoSku!.produtoId,
            produtoSkuId: item.produtoSkuId,
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
    const { quantidade, ...referencia } = parsed.data;

    const compra = await buscarCompraOuFalhar(id);
    garantirEmAndamento(compra);

    const item = await prisma.$transaction(async (tx) => {
      const { produtoId, produtoSkuId } = await resolverReferenciaProdutoOuSku(tx, referencia);

      // Dedupe: por produtoSkuId quando o item tem SKU, senão por produtoId entre os itens sem SKU
      // (espelha os dois índices únicos parciais da migration — ver schema.prisma#ItemCompra).
      const existente = produtoSkuId
        ? await tx.itemCompra.findFirst({ where: { compraId: id, produtoSkuId } })
        : await tx.itemCompra.findFirst({ where: { compraId: id, produtoId: produtoId!, produtoSkuId: null } });

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
          produtoId: produtoId ?? (await buscarProdutoSkuOuFalhar(tx, produtoSkuId!)).produtoId,
          produtoSkuId,
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

    const item = await buscarItemOuFalhar(id, itemId);

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

  // Vincula (ou cria) um ProdutoSku a um item do Carrinho — opcional, usado pelo fluxo de scan/seleção
  // manual de marca (Fase 4). Retorna o item atualizado + preço sugerido (RN-03.7) para a mesma requisição.
  app.post("/compras/:id/itens/:itemId/sku", async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const parsed = vincularSkuSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const compra = await buscarCompraOuFalhar(id);
    garantirEmAndamento(compra);
    const item = await buscarItemOuFalhar(id, itemId);

    const { produtoSkuId, codigoBarras, nome, marca } = parsed.data;

    return prisma.$transaction(async (tx) => {
      let sku;
      if (produtoSkuId) {
        sku = await buscarProdutoSkuOuFalhar(tx, produtoSkuId);
      } else if (codigoBarras) {
        const porCodigo = await tx.produtoSku.findUnique({
          where: { codigoBarras },
          include: { produto: { include: { categoria: true } } },
        });
        if (porCodigo) {
          sku = porCodigo;
        } else if (nome) {
          const { produtoSku } = await encontrarOuCriarProdutoSku(tx, {
            nome,
            marca,
            codigoBarras,
            produtoId: item.produtoId,
          });
          sku = produtoSku;
        } else {
          throw new HttpError(404, "Código de barras desconhecido", { codigoBarrasDesconhecido: true });
        }
      } else {
        const { produtoSku } = await encontrarOuCriarProdutoSku(tx, {
          nome: nome!,
          marca,
          produtoId: item.produtoId,
        });
        sku = produtoSku;
      }

      if (sku.produtoId !== item.produtoId) {
        throw badRequest(
          `Este SKU pertence a "${sku.produto.nome}", não a "${item.produto.nome}"`,
        );
      }

      const atualizado = await tx.itemCompra.update({
        where: { id: itemId },
        data: {
          produtoSkuId: sku.id,
          codigoBarrasLido: codigoBarras ?? undefined,
        },
        include: itemCompraInclude,
      });

      const precoSugerido = await sugerirPreco(tx, {
        produtoId: item.produtoId,
        produtoSkuId: sku.id,
        supermercadoId: compra.supermercadoId,
      });

      return { item: atualizado, precoSugerido };
    });
  });

  app.delete("/compras/:id/itens/:itemId/sku", async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const compra = await buscarCompraOuFalhar(id);
    garantirEmAndamento(compra);
    await buscarItemOuFalhar(id, itemId);

    await prisma.itemCompra.update({ where: { id: itemId }, data: { produtoSkuId: null } });
    reply.status(204);
  });

  app.patch("/compras/:id/itens/:itemId/quantidade", async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const parsed = ajustarQuantidadeSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const compra = await buscarCompraOuFalhar(id);
    garantirEmAndamento(compra);

    const item = await buscarItemOuFalhar(id, itemId);

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
    await buscarItemOuFalhar(id, itemId);

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
              produtoSkuId: item.produtoSkuId,
              supermercadoId: compra.supermercadoId ?? (await garantirSupermercadoGenerico(tx)),
              compraId: id,
              preco: item.precoUnitario!,
            },
          });

          if (item.origem === OrigemItemCompra.PLANEJADO) {
            // Remove o ItemDespensa de origem. O item pode ter sido vinculado a um SKU já no
            // Carrinho (scan), depois de copiado da Despensa como genérico — nesse caso a linha
            // de origem ainda está chaveada por produtoId, não por produtoSkuId, então tenta pelo
            // SKU primeiro e cai para o genérico se nada for removido.
            if (item.produtoSkuId) {
              const { count } = await tx.itemDespensa.deleteMany({ where: { produtoSkuId: item.produtoSkuId } });
              if (count === 0) {
                await tx.itemDespensa.deleteMany({ where: { produtoId: item.produtoId } });
              }
            } else {
              await tx.itemDespensa.deleteMany({ where: { produtoId: item.produtoId } });
            }
          }
        } else if (item.origem === OrigemItemCompra.PLANEJADO) {
          // Mantém/recria o ItemDespensa para itens planejados não comprados. Mesma ressalva do
          // bloco acima: um item SKU'd no Carrinho pode ter uma linha de origem ainda genérica
          // (ou vice-versa) — checa as duas chaves antes de decidir criar, para não duplicar.
          if (item.produtoSkuId) {
            const existente =
              (await tx.itemDespensa.findUnique({ where: { produtoSkuId: item.produtoSkuId } })) ??
              (await tx.itemDespensa.findUnique({ where: { produtoId: item.produtoId } }));
            if (!existente) {
              await tx.itemDespensa.create({
                data: { produtoSkuId: item.produtoSkuId, quantidade: item.quantidade },
              });
            }
          } else {
            await tx.itemDespensa.upsert({
              where: { produtoId: item.produtoId },
              update: {},
              create: { produtoId: item.produtoId, quantidade: item.quantidade },
            });
          }
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
