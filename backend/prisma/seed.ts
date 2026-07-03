import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Decisão 2026-07-01: lista pré-definida seedada no banco + "Outros" como fallback
// para produtos novos sem categoria conhecida (ver mercadeiro-regras-de-negocio.md §5.7).
const CATEGORIAS_PREDEFINIDAS = [
  "Frutas",
  "Verduras e Legumes",
  "Laticínios",
  "Carnes",
  "Padaria",
  "Mercearia",
  "Bebidas",
  "Congelados",
  "Higiene",
  "Limpeza",
  "Pet",
  "Outros",
];

async function main() {
  for (const [index, nome] of CATEGORIAS_PREDEFINIDAS.entries()) {
    await prisma.categoria.upsert({
      where: { nome },
      update: { ordem: index },
      create: { nome, ordem: index },
    });
  }
  console.log(`Seed concluído: ${CATEGORIAS_PREDEFINIDAS.length} categorias.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
