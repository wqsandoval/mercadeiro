import { http } from "../lib/http";

export type PeriodoAnalitico = "mes" | "3m" | "6m";

export interface AlertaAltaPreco {
  produtoId: string;
  nome: string;
  percentualAlta: number;
  mediaHistorica: number;
  precoAtual: number;
}

export interface AlertaAusencia {
  produtoId: string;
  nome: string;
  semanasSemComprar: number;
}

export interface GastoPorCategoria {
  categoriaId: string;
  categoria: string;
  total: number;
}

export interface Analitico {
  periodo: PeriodoAnalitico;
  intervalo: { inicio: string; fim: string };
  totalGasto: number;
  totalGastoAnterior: number;
  variacaoPercentual: number;
  numeroCompras: number;
  gastoPorCategoria: GastoPorCategoria[];
  alertas: {
    altaDePreco: AlertaAltaPreco[];
    ausencia: AlertaAusencia[];
  };
}

// RN-01.2: a Home sempre consulta o período "mês atual", independente de
// qualquer filtro salvo na tela de Analítico (Fase 6).
export function buscarAnalitico(periodo: PeriodoAnalitico = "mes") {
  return http.get<Analitico>(`/analitico?periodo=${periodo}`);
}
