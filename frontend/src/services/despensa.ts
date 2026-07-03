import { http } from "../lib/http";

export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
}

export interface Produto {
  id: string;
  nome: string;
  categoriaId: string;
  categoria: Categoria;
}

// Embalagem/marca específica de um Produto genérico (ex: "Leite Elegê
// Semidesnatado 1L" para o genérico "Leite"). Código de barras vive aqui, não no genérico.
export interface ProdutoSku {
  id: string;
  produtoId: string;
  nome: string;
  marca: string | null;
  codigoBarras: string | null;
  produto: Produto;
}

// Referencia exatamente um entre produto (genérico) e produtoSku (SKU específico) — o outro par vem nulo.
export interface ItemDespensa {
  id: string;
  produtoId: string | null;
  produtoSkuId: string | null;
  quantidade: number;
  produto: Produto | null;
  produtoSku: ProdutoSku | null;
}

export interface GrupoDespensa {
  categoria: Categoria;
  itens: ItemDespensa[];
}

// Either-or: exatamente uma das formas abaixo. produtoId/produtoSkuId reaproveitam um já
// existente; nome cria/reaproveita por nome — genérico por padrão, ou SKU com tipo: "SKU".
export type NovoItemDespensa =
  | { produtoId: string; quantidade?: number }
  | { produtoSkuId: string; quantidade?: number }
  | { nome: string; tipo?: "GENERICO"; quantidade?: number; categoriaId?: string }
  | {
      nome: string;
      tipo: "SKU";
      produtoGenericoNome: string;
      marca?: string;
      codigoBarras?: string;
      quantidade?: number;
      categoriaId?: string;
    };

export function buscarDespensa() {
  return http.get<GrupoDespensa[]>("/despensa");
}

// Regra 4.1: mesma referência (genérico ou SKU) já existente soma quantidade em vez de duplicar — decidido no backend.
export function adicionarItemDespensa(input: NovoItemDespensa) {
  return http.post<ItemDespensa>("/despensa", input);
}

// RN-02.1: delta que levaria a quantidade a 0 ou menos remove o item (decidido no backend).
export function ajustarQuantidadeDespensa(itemId: string, delta: number) {
  return http.patch<ItemDespensa | { removido: true; id: string }>(
    `/despensa/${itemId}/quantidade`,
    { delta },
  );
}

export function removerItemDespensa(itemId: string) {
  return http.delete<void>(`/despensa/${itemId}`);
}
