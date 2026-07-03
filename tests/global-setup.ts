import { Client } from "pg";

const DEFAULT_CONNECTION_STRING =
  "postgresql://mercadeiro:mercadeiro@localhost:5432/mercadeiro?schema=public";

/**
 * Roda uma única vez antes de toda a suíte: garante que o banco tem as
 * categorias seedadas (dependência da regra "Outros" como fallback) e limpa
 * dados de execuções anteriores para que os testes partam de um estado
 * conhecido. Categorias não são truncadas — são a base fixa do seed.
 */
export default async function globalSetup(): Promise<void> {
  const connectionString = process.env.DATABASE_URL ?? DEFAULT_CONNECTION_STRING;
  const client = new Client({ connectionString });

  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Não foi possível conectar ao Postgres em "${connectionString}".\n` +
        `Rode "npm run db:up --workspace=backend" antes de executar os testes.\n` +
        `Causa: ${(err as Error).message}`,
    );
  }

  try {
    const { rows } = await client.query<{ total: number }>(
      "SELECT COUNT(*)::int AS total FROM categorias",
    );
    if (rows[0].total === 0) {
      throw new Error(
        'Nenhuma categoria seedada no banco (fallback "Outros" ausente).\n' +
          "Rode \"npm run prisma:migrate --workspace=backend\" e " +
          '"npm run prisma:seed --workspace=backend" antes de executar os testes.',
      );
    }

    await client.query(
      "TRUNCATE TABLE precos_historico, itens_compra, compras, itens_despensa, produtos_sku, produtos, supermercados RESTART IDENTITY CASCADE",
    );
  } finally {
    await client.end();
  }
}
