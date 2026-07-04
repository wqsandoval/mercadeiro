import { http } from "../lib/http";
import type { ItemDespensa, ProdutoSku } from "./despensa";
import type { Supermercado } from "./supermercados";

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
  supermercado: Supermercado | null;
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

// Item extra: mesmo either-or genérico/SKU da Despensa (RN-03.1 exige preço só para marcar comprado).
export type NovoItemExtra =
  | { produtoId: string; quantidade?: number }
  | { produtoSkuId: string; quantidade?: number }
  | { nome: string; tipo?: "GENERICO"; quantidade?: number; categoriaId?: string; codigoBarras?: string }
  | {
      nome: string;
      tipo: "SKU";
      produtoGenericoNome: string;
      marca?: string;
      codigoBarras?: string;
      quantidade?: number;
      categoriaId?: string;
    };

export function adicionarItemExtra(compraId: string, input: NovoItemExtra) {
  return http.post<ItemCompra>(`/compras/${compraId}/itens`, input);
}

export interface AtualizarItemInput {
  comprado?: boolean;
  precoUnitario?: number | null;
  codigoBarrasLido?: string;
  quantidade?: number;
}

// RN-03.1: backend rejeita comprado=true sem preço (existente ou informado nesta requisição).
export function atualizarItemCompra(compraId: string, itemId: string, input: AtualizarItemInput) {
  return http.patch<ItemCompra>(`/compras/${compraId}/itens/${itemId}`, input);
}

// RN-02.1 espelhada no Carrinho: delta que levaria a quantidade a 0 ou menos remove o item.
export function ajustarQuantidadeItemCompra(compraId: string, itemId: string, delta: number) {
  return http.patch<ItemCompra | { removido: true; id: string }>(
    `/compras/${compraId}/itens/${itemId}/quantidade`,
    { delta },
  );
}

export function removerItemCompra(compraId: string, itemId: string) {
  return http.delete<void>(`/compras/${compraId}/itens/${itemId}`);
}

export interface AtualizarCompraInput {
  supermercadoId?: string | null;
  latitude?: number;
  longitude?: number;
}

// RN-03.5: supermercado (e coords) trocáveis a qualquer momento antes de finalizar.
export function atualizarCompra(compraId: string, input: AtualizarCompraInput) {
  return http.patch<Compra>(`/compras/${compraId}`, input);
}

// Tipado já para reuso na Fase 5 (Finalizar Compra) — não é invocado pela Fase 4.
export function finalizarCompra(compraId: string) {
  return http.post<Compra>(`/compras/${compraId}/finalizar`);
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
