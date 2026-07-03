import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { StatusCompra } from "@prisma/client";
import { prisma } from "../prisma.js";
import { badRequest } from "../lib/http-error.js";
import { calcularIntervalos, type PeriodoAnalitico } from "../lib/periodo.js";

const queryPeriodoSchema = z.object({
  periodo: z.enum(["mes", "3m", "6m"]).default("mes"),
});

async function somarGastoNoPeriodo(inicio: Date, fim: Date) {
  const itens = await prisma.itemCompra.findMany({
    where: {
      comprado: true,
      compra: { status: StatusCompra.FINALIZADA, finalizadaEm: { gte: inicio, lt: fim } },
    },
    include: { produto: { include: { categoria: true } } },
  });

  const totalGasto = itens.reduce(
    (soma, item) => soma + Number(item.precoUnitario ?? 0) * item.quantidade,
    0,
  );

  const gastoPorCategoriaMap = new Map<string, { categoria: string; total: number }>();
  for (const item of itens) {
    const categoriaId = item.produto.categoriaId;
    const valor = Number(item.precoUnitario ?? 0) * item.quantidade;
    const grupo = gastoPorCategoriaMap.get(categoriaId) ?? {
      categoria: item.produto.categoria.nome,
      total: 0,
    };
    grupo.total += valor;
    gastoPorCategoriaMap.set(categoriaId, grupo);
  }

  return {
    totalGasto,
    gastoPorCategoria: Array.from(gastoPorCategoriaMap.entries())
      .map(([categoriaId, dados]) => ({ categoriaId, ...dados }))
      .sort((a, b) => b.total - a.total),
  };
}

async function calcularAlertaAltaPreco(thresholdPercent: number) {
  const registros = await prisma.precoHistorico.findMany({
    include: { produto: true },
    orderBy: { data: "desc" },
  });

  const porProduto = new Map<string, { nome: string; precos: number[] }>();
  for (const registro of registros) {
    const grupo = porProduto.get(registro.produtoId) ?? { nome: registro.produto.nome, precos: [] };
    grupo.precos.push(Number(registro.preco));
    porProduto.set(registro.produtoId, grupo);
  }

  const alertas: Array<{
    produtoId: string;
    nome: string;
    percentualAlta: number;
    mediaHistorica: number;
    precoAtual: number;
  }> = [];

  for (const [produtoId, { nome, precos }] of porProduto) {
    // janela curta = últimas 2 ocorrências; precisa de histórico anterior para comparar.
    if (precos.length < 3) continue;
    const recentes = precos.slice(0, 2);
    const historico = precos.slice(2);

    const mediaRecente = recentes.reduce((a, b) => a + b, 0) / recentes.length;
    const mediaHistorica = historico.reduce((a, b) => a + b, 0) / historico.length;
    if (mediaHistorica <= 0) continue;

    const percentualAlta = ((mediaRecente - mediaHistorica) / mediaHistorica) * 100;
    if (percentualAlta >= thresholdPercent) {
      alertas.push({
        produtoId,
        nome,
        percentualAlta: Math.round(percentualAlta * 10) / 10,
        mediaHistorica: Math.round(mediaHistorica * 100) / 100,
        precoAtual: Math.round(recentes[0] * 100) / 100,
      });
    }
  }

  return alertas.sort((a, b) => b.percentualAlta - a.percentualAlta);
}

async function calcularAlertaAusencia(semanasLimite: number) {
  const registros = await prisma.precoHistorico.findMany({
    include: { produto: true },
    orderBy: { data: "desc" },
  });

  const porProduto = new Map<string, { nome: string; datas: Date[] }>();
  for (const registro of registros) {
    const grupo = porProduto.get(registro.produtoId) ?? { nome: registro.produto.nome, datas: [] };
    grupo.datas.push(registro.data);
    porProduto.set(registro.produtoId, grupo);
  }

  const agora = Date.now();
  const alertas: Array<{ produtoId: string; nome: string; semanasSemComprar: number }> = [];

  for (const [produtoId, { nome, datas }] of porProduto) {
    // produto "regularmente comprado" = pelo menos 2 registros históricos.
    if (datas.length < 2) continue;
    const ultimaCompra = Math.max(...datas.map((d) => d.getTime()));
    const semanasSemComprar = (agora - ultimaCompra) / (7 * 24 * 60 * 60 * 1000);
    if (semanasSemComprar > semanasLimite) {
      alertas.push({ produtoId, nome, semanasSemComprar: Math.round(semanasSemComprar * 10) / 10 });
    }
  }

  return alertas.sort((a, b) => b.semanasSemComprar - a.semanasSemComprar);
}

export async function analiticoRoutes(app: FastifyInstance) {
  // UC-06: agregações do dashboard Analítico. Limiares de alerta são configuráveis
  // via env (RN-06.2/RN-06.3), não hardcoded no frontend nem fixos como constante definitiva.
  app.get("/analitico", async (request) => {
    const parsed = queryPeriodoSchema.safeParse(request.query);
    if (!parsed.success) throw badRequest("Parâmetros inválidos", parsed.error.issues);
    const periodo: PeriodoAnalitico = parsed.data.periodo;

    const { atual, anterior } = calcularIntervalos(periodo);

    const [dadosAtuais, dadosAnteriores, numeroCompras] = await Promise.all([
      somarGastoNoPeriodo(atual.inicio, atual.fim),
      somarGastoNoPeriodo(anterior.inicio, anterior.fim),
      prisma.compra.count({
        where: {
          status: StatusCompra.FINALIZADA,
          finalizadaEm: { gte: atual.inicio, lt: atual.fim },
        },
      }),
    ]);

    const variacaoPercentual =
      dadosAnteriores.totalGasto > 0
        ? ((dadosAtuais.totalGasto - dadosAnteriores.totalGasto) / dadosAnteriores.totalGasto) * 100
        : dadosAtuais.totalGasto > 0
          ? 100
          : 0;

    const thresholdAlta = Number(process.env.PRICE_ALERT_THRESHOLD_PERCENT ?? 18);
    const semanasAusencia = Number(process.env.ABSENCE_ALERT_WEEKS ?? 6);

    const [altaDePreco, ausencia] = await Promise.all([
      calcularAlertaAltaPreco(thresholdAlta),
      calcularAlertaAusencia(semanasAusencia),
    ]);

    return {
      periodo,
      intervalo: atual,
      totalGasto: Math.round(dadosAtuais.totalGasto * 100) / 100,
      totalGastoAnterior: Math.round(dadosAnteriores.totalGasto * 100) / 100,
      variacaoPercentual: Math.round(variacaoPercentual * 10) / 10,
      numeroCompras,
      gastoPorCategoria: dadosAtuais.gastoPorCategoria.map((g) => ({
        ...g,
        total: Math.round(g.total * 100) / 100,
      })),
      alertas: { altaDePreco, ausencia },
    };
  });
}
