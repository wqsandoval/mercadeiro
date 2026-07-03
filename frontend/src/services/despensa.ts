import { http } from "../lib/http";

export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
}

export interface Produto {
  id: string;
  nome: string;
  codigoBarras: string | null;
  categoriaId: string;
  categoria: Categoria;
}

export interface ItemDespensa {
  id: string;
  produtoId: string;
  quantidade: number;
  produto: Produto;
}

export interface GrupoDespensa {
  categoria: Categoria;
  itens: ItemDespensa[];
}

export function buscarDespensa() {
  return http.get<GrupoDespensa[]>("/despensa");
}

// Regra 4.1: nome já existente soma quantidade em vez de duplicar — decidido no backend.
export function adicionarItemDespensa(nome: string, quantidade = 1) {
  return http.post<ItemDespensa>("/despensa", { nome, quantidade });
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
