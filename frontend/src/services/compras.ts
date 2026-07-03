import { http } from "../lib/http";
import type { ItemDespensa } from "./despensa";

export type StatusCompra = "EM_ANDAMENTO" | "FINALIZADA";
export type OrigemItemCompra = "PLANEJADO" | "EXTRA";

export interface ItemCompra {
  id: string;
  compraId: string;
  produtoId: string;
  quantidade: number;
  precoUnitario: string | null;
  comprado: boolean;
  origem: OrigemItemCompra;
  codigoBarrasLido: string | null;
  produto: ItemDespensa["produto"];
}

export interface Compra {
  id: string;
  status: StatusCompra;
  supermercadoId: string | null;
  latitude: number | null;
  longitude: number | null;
  iniciadaEm: string;
  finalizadaEm: string | null;
  itens: ItemCompra[];
}

// RN-02.4: se já existir uma Compra em andamento, o backend a retoma (200)
// em vez de criar outra (201) — o chamador não precisa diferenciar os casos.
export function criarOuRetomarCompra() {
  return http.post<Compra>("/compras", {});
}

export function buscarCompraAtual() {
  return http.get<Compra>("/compras/atual");
}
