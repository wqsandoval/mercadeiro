export type PeriodoAnalitico = "mes" | "3m" | "6m";

export interface IntervaloData {
  inicio: Date;
  fim: Date;
}

function inicioDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1, 0, 0, 0, 0);
}

function subtrairMeses(data: Date, meses: number): Date {
  const resultado = new Date(data);
  resultado.setMonth(resultado.getMonth() - meses);
  return resultado;
}

/**
 * RN-06.1: calcula o período selecionado e o período imediatamente anterior de
 * duração equivalente (mês atual vs. mês anterior; últimos Nm vs. os Nm antes desses).
 */
export function calcularIntervalos(
  periodo: PeriodoAnalitico,
  agora: Date = new Date(),
): { atual: IntervaloData; anterior: IntervaloData } {
  if (periodo === "mes") {
    const inicio = inicioDoMes(agora);
    return {
      atual: { inicio, fim: agora },
      anterior: { inicio: inicioDoMes(subtrairMeses(agora, 1)), fim: inicio },
    };
  }

  const meses = periodo === "3m" ? 3 : 6;
  const inicio = subtrairMeses(agora, meses);
  return {
    atual: { inicio, fim: agora },
    anterior: { inicio: subtrairMeses(agora, meses * 2), fim: inicio },
  };
}
