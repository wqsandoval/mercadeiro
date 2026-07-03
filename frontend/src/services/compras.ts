import { http } from "../lib/http";
import type { ItemDespensa, ProdutoSku } from "./despensa";

export type StatusCompra = "EM_ANDAMENTO" | "FINALIZADA";
export type OrigemItemCompra = "PLANEJADO" | "EXTRA";

export interface ItemCompra {
  id: string;
  compraId: string;
  produtoId: string;
  produtoSkuId: string | null;
  quantidade: number;
  precoUnitario: string | null;
  comprado: boolean;
  origem: OrigemItemCompra;
  codigoBarrasLido: string | null;
  produto: NonNullable<ItemDespensa["produto"]>;
  produtoSku: ProdutoSku | null;
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

// Vínculo de SKU a um item do Carrinho é opcional (RN-03.1 continua exigindo só preço para
// marcar comprado) — usado pelo fluxo de scan/seleção manual de marca (Fase 4).
export type VincularSkuInput =
  | { produtoSkuId: string }
  | { codigoBarras: string; nome?: string; marca?: string }
  | { nome: string; marca?: string };

export function vincularSkuAoItem(compraId: string, itemId: string, input: VincularSkuInput) {
  return http.post<{ item: ItemCompra; precoSugerido: number | null }>(
    `/compras/${compraId}/itens/${itemId}/sku`,
    input,
  );
}

export function desvincularSkuDoItem(compraId: string, itemId: string) {
  return http.delete<void>(`/compras/${compraId}/itens/${itemId}/sku`);
}
