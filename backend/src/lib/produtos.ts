import type { Categoria, Prisma, Produto, ProdutoSku } from "@prisma/client";
import { prisma } from "../prisma.js";
import { badRequest, notFound } from "./http-error.js";

type ProdutoComCategoria = Produto & { categoria: Categoria };
type ProdutoSkuComProduto = ProdutoSku & { produto: ProdutoComCategoria };

const CATEGORIA_FALLBACK_NOME = "Outros";

export async function resolverCategoriaId(
  tx: Prisma.TransactionClient | typeof prisma,
  categoriaId?: string | null,
): Promise<string> {
  if (categoriaId) {
    const categoria = await tx.categoria.findUnique({ where: { id: categoriaId } });
    if (categoria) return categoria.id;
  }

  const fallback = await tx.categoria.findUnique({ where: { nome: CATEGORIA_FALLBACK_NOME } });
  if (!fallback) {
    throw badRequest(`Categoria de fallback "${CATEGORIA_FALLBACK_NOME}" não está seedada no banco`);
  }
  return fallback.id;
}

/**
 * Regra 4.1: um Produto genérico com nome já existente (case-insensitive) é
 * reaproveitado em vez de duplicado. Produto novo cai na categoria informada,
 * ou "Outros" se não informada / inválida.
 */
export async function encontrarOuCriarProduto(
  tx: Prisma.TransactionClient | typeof prisma,
  input: { nome: string; categoriaId?: string | null },
): Promise<{ produto: ProdutoComCategoria; criado: boolean }> {
  const nome = input.nome.trim();
  if (!nome) throw badRequest("Nome do produto é obrigatório");

  const existente = await tx.produto.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" } },
    include: { categoria: true },
  });

  if (existente) {
    return { produto: existente, criado: false };
  }

  const categoriaId = await resolverCategoriaId(tx, input.categoriaId);
  const produto = await tx.produto.create({
    data: { nome, categoriaId },
    include: { categoria: true },
  });
  return { produto, criado: true };
}

/**
 * ProdutoSku representa uma embalagem/marca específica de um Produto genérico
 * (ex: "Leite Elegê Semidesnatado 1L" para o genérico "Leite"). Dedupe prioriza
 * codigoBarras (sinal mais forte, escaneável) e cai para nome dentro do mesmo
 * genérico (case-insensitive), com backfill de código de barras em SKU
 * existente que ainda não tinha um — mesmo comportamento que existia antes ao
 * nível de Produto, agora aplicado ao SKU.
 */
export async function encontrarOuCriarProdutoSku(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    nome: string;
    marca?: string | null;
    codigoBarras?: string | null;
    produtoId?: string | null;
    produtoGenericoNome?: string | null;
    categoriaId?: string | null;
  },
): Promise<{ produtoSku: ProdutoSkuComProduto; criado: boolean }> {
  const nome = input.nome.trim();
  if (!nome) throw badRequest("Nome do SKU é obrigatório");

  if (input.codigoBarras) {
    const porCodigo = await tx.produtoSku.findUnique({
      where: { codigoBarras: input.codigoBarras },
      include: { produto: { include: { categoria: true } } },
    });
    if (porCodigo) return { produtoSku: porCodigo, criado: false };
  }

  let produtoId = input.produtoId ?? null;
  if (produtoId) {
    const produtoGenerico = await tx.produto.findUnique({ where: { id: produtoId } });
    if (!produtoGenerico) throw badRequest("Produto genérico não encontrado");
  } else {
    if (!input.produtoGenericoNome) {
      throw badRequest("produtoId ou produtoGenericoNome é obrigatório para criar um SKU");
    }
    const { produto } = await encontrarOuCriarProduto(tx, {
      nome: input.produtoGenericoNome,
      categoriaId: input.categoriaId,
    });
    produtoId = produto.id;
  }

  const existente = await tx.produtoSku.findFirst({
    where: { produtoId, nome: { equals: nome, mode: "insensitive" } },
    include: { produto: { include: { categoria: true } } },
  });

  if (existente) {
    if (input.codigoBarras && !existente.codigoBarras) {
      const atualizado = await tx.produtoSku.update({
        where: { id: existente.id },
        data: { codigoBarras: input.codigoBarras },
        include: { produto: { include: { categoria: true } } },
      });
      return { produtoSku: atualizado, criado: false };
    }
    return { produtoSku: existente, criado: false };
  }

  const produtoSku = await tx.produtoSku.create({
    data: {
      produtoId,
      nome,
      marca: input.marca ?? undefined,
      codigoBarras: input.codigoBarras ?? undefined,
    },
    include: { produto: { include: { categoria: true } } },
  });
  return { produtoSku, criado: true };
}

/**
 * Agrega um histórico de preço (já filtrado por produtoId ou produtoSkuId,
 * ordenado por data desc) no formato usado por GET /produtos/:id/precos e
 * GET /produtos-sku/:id/precos. RN-07.4: amostra pequena (<2 registros) não
 * é ocultada, só sinalizada.
 */
export function agregarHistoricoPrecos<
  T extends { preco: Prisma.Decimal; supermercadoId: string; supermercado: unknown },
>(registrosOrdenadosPorDataDesc: T[]) {
  if (registrosOrdenadosPorDataDesc.length === 0) {
    return {
      ultimoPreco: null,
      menorPreco: null,
      precoMedio: null,
      amostraPequena: true,
      porSupermercado: [] as { supermercado: T["supermercado"]; precoMedio: number; quantidadeRegistros: number }[],
    };
  }

  const precos = registrosOrdenadosPorDataDesc.map((r) => Number(r.preco));
  const porSupermercado = new Map<string, { supermercado: T["supermercado"]; precos: number[] }>();
  for (const registro of registrosOrdenadosPorDataDesc) {
    const grupo = porSupermercado.get(registro.supermercadoId) ?? {
      supermercado: registro.supermercado,
      precos: [] as number[],
    };
    grupo.precos.push(Number(registro.preco));
    porSupermercado.set(registro.supermercadoId, grupo);
  }

  return {
    ultimoPreco: precos[0],
    menorPreco: Math.min(...precos),
    precoMedio: precos.reduce((a, b) => a + b, 0) / precos.length,
    amostraPequena: registrosOrdenadosPorDataDesc.length < 2,
    porSupermercado: Array.from(porSupermercado.values()).map(({ supermercado, precos: p }) => ({
      supermercado,
      precoMedio: p.reduce((a, b) => a + b, 0) / p.length,
      quantidadeRegistros: p.length,
    })),
  };
}

/**
 * Resolve o payload genérico/SKU either-or usado por POST /despensa e
 * POST /compras/:id/itens (item extra): exatamente um entre produtoId
 * (atalho para reaproveitar um genérico existente), produtoSkuId (atalho
 * para reaproveitar um SKU existente) ou nome (cria/reaproveita por nome,
 * como genérico por padrão ou como SKU se tipo="SKU").
 */
export async function resolverReferenciaProdutoOuSku(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    produtoId?: string | null;
    produtoSkuId?: string | null;
    nome?: string | null;
    tipo?: "GENERICO" | "SKU";
    produtoGenericoNome?: string | null;
    marca?: string | null;
    codigoBarras?: string | null;
    categoriaId?: string | null;
  },
): Promise<{ produtoId: string | null; produtoSkuId: string | null }> {
  const modosInformados = [!!input.produtoId, !!input.produtoSkuId, !!input.nome].filter(Boolean).length;
  if (modosInformados !== 1) {
    throw badRequest("Informe exatamente um entre produtoId, produtoSkuId ou nome");
  }
  if (input.nome && input.tipo === "SKU" && !input.produtoGenericoNome) {
    throw badRequest("produtoGenericoNome é obrigatório para um item do tipo SKU");
  }

  if (input.produtoId) {
    const produto = await tx.produto.findUnique({ where: { id: input.produtoId } });
    if (!produto) throw notFound("Produto");
    return { produtoId: produto.id, produtoSkuId: null };
  }
  if (input.produtoSkuId) {
    const sku = await tx.produtoSku.findUnique({ where: { id: input.produtoSkuId } });
    if (!sku) throw notFound("ProdutoSku");
    return { produtoId: null, produtoSkuId: sku.id };
  }
  if (input.tipo === "SKU") {
    const { produtoSku } = await encontrarOuCriarProdutoSku(tx, {
      nome: input.nome!,
      marca: input.marca,
      codigoBarras: input.codigoBarras,
      produtoGenericoNome: input.produtoGenericoNome,
      categoriaId: input.categoriaId,
    });
    return { produtoId: null, produtoSkuId: produtoSku.id };
  }
  const { produto } = await encontrarOuCriarProduto(tx, { nome: input.nome!, categoriaId: input.categoriaId });
  return { produtoId: produto.id, produtoSkuId: null };
}

export async function buscarProdutoSkuOuFalhar(
  tx: Prisma.TransactionClient | typeof prisma,
  id: string,
): Promise<ProdutoSkuComProduto> {
  const produtoSku = await tx.produtoSku.findUnique({
    where: { id },
    include: { produto: { include: { categoria: true } } },
  });
  if (!produtoSku) throw notFound("ProdutoSku");
  return produtoSku;
}
