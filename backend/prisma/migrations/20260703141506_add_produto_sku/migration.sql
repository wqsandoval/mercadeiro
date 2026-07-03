-- Introduces ProdutoSku (embalagem/marca específica de um Produto genérico).
-- codigoBarras muda de Produto para ProdutoSku (identifica a embalagem, não o genérico).

-- 1. CreateTable: produtos_sku
CREATE TABLE "produtos_sku" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "marca" TEXT,
    "codigoBarras" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_sku_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "produtos_sku" ADD CONSTRAINT "produtos_sku_produtoId_fkey"
    FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "produtos_sku_codigoBarras_key" ON "produtos_sku"("codigoBarras");
CREATE INDEX "produtos_sku_produtoId_idx" ON "produtos_sku"("produtoId");
CREATE UNIQUE INDEX "produtos_sku_produtoId_nome_key" ON "produtos_sku"("produtoId", "nome");

-- 2. Data migration: preserva codigoBarras existente como um ProdutoSku antes de dropar a coluna.
-- Reaproveita o nome do genérico (não temos um nome mais específico disponível).
INSERT INTO "produtos_sku" ("id", "produtoId", "nome", "codigoBarras", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "nome", "codigoBarras", now(), now()
FROM "produtos"
WHERE "codigoBarras" IS NOT NULL;

-- 3. AlterTable: itens_despensa — produtoId vira opcional, ganha produtoSkuId opcional.
ALTER TABLE "itens_despensa" DROP CONSTRAINT "itens_despensa_produtoId_fkey";
ALTER TABLE "itens_despensa" ALTER COLUMN "produtoId" DROP NOT NULL;
ALTER TABLE "itens_despensa" ADD COLUMN "produtoSkuId" TEXT;

ALTER TABLE "itens_despensa" ADD CONSTRAINT "itens_despensa_produtoId_fkey"
    FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "itens_despensa" ADD CONSTRAINT "itens_despensa_produtoSkuId_fkey"
    FOREIGN KEY ("produtoSkuId") REFERENCES "produtos_sku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- produtoId já era único (e nulável agora) — Postgres trata NULL como distinto, então o índice
-- existente já preserva "no máx. 1 ItemDespensa por Produto genérico, NULLs ilimitados". Espelha
-- a mesma garantia para produtoSkuId:
CREATE UNIQUE INDEX "itens_despensa_produtoSkuId_key" ON "itens_despensa"("produtoSkuId");

-- Regra "exatamente um dos dois" (nem os dois nulos, nem os dois preenchidos) — sem equivalente em schema.prisma.
ALTER TABLE "itens_despensa" ADD CONSTRAINT "itens_despensa_generico_xor_sku_check"
    CHECK (("produtoId" IS NOT NULL) <> ("produtoSkuId" IS NOT NULL));

-- 4. AlterTable: itens_compra — ganha produtoSkuId opcional; dedupe passa de unique simples
-- para dois índices únicos parciais (permite duas SKUs diferentes do mesmo genérico na mesma
-- Compra, mas ainda deduplica itens sem SKU do mesmo genérico).
DROP INDEX "itens_compra_compraId_produtoId_key";

ALTER TABLE "itens_compra" ADD COLUMN "produtoSkuId" TEXT;
ALTER TABLE "itens_compra" ADD CONSTRAINT "itens_compra_produtoSkuId_fkey"
    FOREIGN KEY ("produtoSkuId") REFERENCES "produtos_sku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "itens_compra_compra_sku_key"
    ON "itens_compra"("compraId", "produtoSkuId") WHERE "produtoSkuId" IS NOT NULL;
CREATE UNIQUE INDEX "itens_compra_compra_produto_sem_sku_key"
    ON "itens_compra"("compraId", "produtoId") WHERE "produtoSkuId" IS NULL;

-- 5. AlterTable: precos_historico — ganha produtoSkuId opcional.
ALTER TABLE "precos_historico" ADD COLUMN "produtoSkuId" TEXT;
ALTER TABLE "precos_historico" ADD CONSTRAINT "precos_historico_produtoSkuId_fkey"
    FOREIGN KEY ("produtoSkuId") REFERENCES "produtos_sku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "precos_historico_produtoSkuId_idx" ON "precos_historico"("produtoSkuId");
CREATE INDEX "precos_historico_produtoSkuId_supermercadoId_idx" ON "precos_historico"("produtoSkuId", "supermercadoId");

-- 6. AlterTable: produtos — remove codigoBarras (dado já preservado no passo 2).
DROP INDEX "produtos_codigoBarras_key";
ALTER TABLE "produtos" DROP COLUMN "codigoBarras";
