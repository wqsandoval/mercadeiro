import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { badRequest, conflict, notFound } from "../lib/http-error.js";

const criarSupermercadoSchema = z.object({
  nome: z.string().trim().min(1),
  endereco: z.string().trim().min(1).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const atualizarSupermercadoSchema = z.object({
  nome: z.string().trim().min(1).optional(),
  endereco: z.string().trim().min(1).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

export async function supermercadosRoutes(app: FastifyInstance) {
  app.get("/supermercados", async () => {
    return prisma.supermercado.findMany({ orderBy: { nome: "asc" } });
  });

  app.get("/supermercados/:id", async (request) => {
    const { id } = request.params as { id: string };
    const supermercado = await prisma.supermercado.findUnique({ where: { id } });
    if (!supermercado) throw notFound("Supermercado");
    return supermercado;
  });

  // Dedupe por nome+endereço: usado pelo fluxo de reverse geocoding (UC-03) para não
  // criar um Supermercado duplicado a cada compra no mesmo local.
  app.post("/supermercados", async (request, reply) => {
    const parsed = criarSupermercadoSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);
    const { nome, endereco, latitude, longitude } = parsed.data;

    const existente = await prisma.supermercado.findFirst({
      where: {
        nome: { equals: nome, mode: "insensitive" },
        endereco: endereco ?? null,
      },
    });
    if (existente) {
      reply.status(200);
      return existente;
    }

    const criado = await prisma.supermercado.create({
      data: { nome, endereco, latitude, longitude },
    });
    reply.status(201);
    return criado;
  });

  app.put("/supermercados/:id", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = atualizarSupermercadoSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const existente = await prisma.supermercado.findUnique({ where: { id } });
    if (!existente) throw notFound("Supermercado");

    return prisma.supermercado.update({ where: { id }, data: parsed.data });
  });

  app.delete("/supermercados/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existente = await prisma.supermercado.findUnique({ where: { id } });
    if (!existente) throw notFound("Supermercado");

    const [emCompra, emHistorico] = await Promise.all([
      prisma.compra.count({ where: { supermercadoId: id } }),
      prisma.precoHistorico.count({ where: { supermercadoId: id } }),
    ]);
    if (emCompra > 0 || emHistorico > 0) {
      throw conflict("Supermercado possui compras/histórico vinculados e não pode ser removido");
    }

    await prisma.supermercado.delete({ where: { id } });
    reply.status(204);
  });

  // Histórico de PrecoHistorico daquele mercado, agrupado por Produto, com média histórica
  // (base do ranking 3b e do comparativo 3c — tasks 38/40).
  app.get("/supermercados/:id/historico", async (request) => {
    const { id } = request.params as { id: string };
    const existente = await prisma.supermercado.findUnique({ where: { id } });
    if (!existente) throw notFound("Supermercado");

    const registros = await prisma.precoHistorico.findMany({
      where: { supermercadoId: id },
      include: { produto: true },
      orderBy: { data: "desc" },
    });

    const porProduto = new Map<
      string,
      { produto: (typeof registros)[number]["produto"]; precos: number[] }
    >();
    for (const registro of registros) {
      const grupo = porProduto.get(registro.produtoId) ?? { produto: registro.produto, precos: [] };
      grupo.precos.push(Number(registro.preco));
      porProduto.set(registro.produtoId, grupo);
    }

    return Array.from(porProduto.values()).map(({ produto, precos }) => ({
      produto,
      quantidadeRegistros: precos.length,
      precoMedio: precos.reduce((a, b) => a + b, 0) / precos.length,
      menorPreco: Math.min(...precos),
      ultimoPreco: precos[0],
    }));
  });
}
