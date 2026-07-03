import type { Categoria, Prisma, Produto } from "@prisma/client";
import { prisma } from "../prisma.js";
import { badRequest } from "./http-error.js";

type ProdutoComCategoria = Produto & { categoria: Categoria };

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
 * Regra 4.1: um Produto com nome já existente (case-insensitive) é reaproveitado
 * em vez de duplicado. Produto novo cai na categoria informada, ou "Outros" se
 * não informada / inválida.
 */
export async function encontrarOuCriarProduto(
  tx: Prisma.TransactionClient | typeof prisma,
  input: { nome: string; categoriaId?: string | null; codigoBarras?: string | null },
): Promise<{ produto: ProdutoComCategoria; criado: boolean }> {
  const nome = input.nome.trim();
  if (!nome) throw badRequest("Nome do produto é obrigatório");

  const existente = await tx.produto.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" } },
    include: { categoria: true },
  });

  if (existente) {
    if (input.codigoBarras && !existente.codigoBarras) {
      const atualizado = await tx.produto.update({
        where: { id: existente.id },
        data: { codigoBarras: input.codigoBarras },
        include: { categoria: true },
      });
      return { produto: atualizado, criado: false };
    }
    return { produto: existente, criado: false };
  }

  const categoriaId = await resolverCategoriaId(tx, input.categoriaId);
  const produto = await tx.produto.create({
    data: {
      nome,
      categoriaId,
      codigoBarras: input.codigoBarras ?? undefined,
    },
    include: { categoria: true },
  });
  return { produto, criado: true };
}
