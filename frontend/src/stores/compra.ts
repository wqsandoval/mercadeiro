import { defineStore } from "pinia";
import { ApiError } from "../lib/http";
import {
  ajustarQuantidadeItemCompra,
  adicionarItemExtra,
  atualizarCompra,
  atualizarItemCompra,
  buscarCompraAtual,
  criarOuRetomarCompra,
  removerItemCompra,
  vincularSkuAoItem,
  desvincularSkuDoItem,
  type AtualizarCompraInput,
  type AtualizarItemInput,
  type Compra,
  type NovoItemExtra,
  type VincularSkuInput,
} from "../services/compras";

// RN-02.4 / RN-04.1: só existe uma Compra em andamento por vez; o toggle
// Despensa/Carrinho só fica habilitado quando esse id não é nulo.
export const useCompraStore = defineStore("compra", {
  state: () => ({
    compraEmAndamentoId: null as string | null,
    compra: null as Compra | null,
    carregandoCompra: false,
  }),
  getters: {
    temCompraEmAndamento: (state) => state.compraEmAndamentoId !== null,
    itens: (state) => state.compra?.itens ?? [],
    // RN-03.2: subtotal soma só itens marcados como comprados.
    subtotal: (state) =>
      (state.compra?.itens ?? [])
        .filter((item) => item.comprado && item.precoUnitario !== null)
        .reduce((soma, item) => soma + Number(item.precoUnitario) * item.quantidade, 0),
    // RN-03.3: progresso considera todos os itens (planejados + extras), comprados ou não.
    progresso: (state) => {
      const itens = state.compra?.itens ?? [];
      return { atual: itens.filter((item) => item.comprado).length, total: itens.length };
    },
  },
  actions: {
    async sincronizar() {
      try {
        const compra = await buscarCompraAtual();
        this.compraEmAndamentoId = compra.id;
        this.compra = compra;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          this.compraEmAndamentoId = null;
          this.compra = null;
          return;
        }
        throw e;
      }
    },

    // Carrega/recarrega a Compra em andamento atual — chamado no mount de Despensa e
    // Carrinho para que o toggle (RN-04.1) reflita o estado real do backend em qualquer
    // ponto de entrada (reload, deep-link), não só logo após "Iniciar Compra".
    async carregarCompraAtual() {
      this.carregandoCompra = true;
      try {
        await this.sincronizar();
      } finally {
        this.carregandoCompra = false;
      }
    },

    // RN-02.4: cria uma nova Compra a partir da Despensa, ou retoma a que já
    // está em andamento — o backend decide, aqui só refletimos o resultado.
    async iniciarOuRetomarCompra() {
      const compra = await criarOuRetomarCompra();
      this.compraEmAndamentoId = compra.id;
      this.compra = compra;
      return compra;
    },

    async adicionarItemExtra(input: NovoItemExtra) {
      const item = await adicionarItemExtra(this.compraEmAndamentoId!, input);
      if (!this.compra) return item;
      const existente = this.compra.itens.findIndex((i) => i.id === item.id);
      if (existente >= 0) this.compra.itens.splice(existente, 1, item);
      else this.compra.itens.push(item);
      return item;
    },

    async atualizarItem(itemId: string, input: AtualizarItemInput) {
      const item = await atualizarItemCompra(this.compraEmAndamentoId!, itemId, input);
      this.substituirItem(item);
      return item;
    },

    async ajustarQuantidadeItem(itemId: string, delta: number) {
      const resultado = await ajustarQuantidadeItemCompra(this.compraEmAndamentoId!, itemId, delta);
      if ("removido" in resultado) {
        if (this.compra) this.compra.itens = this.compra.itens.filter((i) => i.id !== itemId);
      } else {
        this.substituirItem(resultado);
      }
      return resultado;
    },

    async removerItem(itemId: string) {
      await removerItemCompra(this.compraEmAndamentoId!, itemId);
      if (this.compra) this.compra.itens = this.compra.itens.filter((i) => i.id !== itemId);
    },

    async vincularSku(itemId: string, input: VincularSkuInput) {
      const resultado = await vincularSkuAoItem(this.compraEmAndamentoId!, itemId, input);
      this.substituirItem(resultado.item);
      return resultado;
    },

    async desvincularSku(itemId: string) {
      await desvincularSkuDoItem(this.compraEmAndamentoId!, itemId);
      if (this.compra) {
        const item = this.compra.itens.find((i) => i.id === itemId);
        if (item) item.produtoSkuId = null;
      }
    },

    async atualizarSupermercadoOuLocalizacao(input: AtualizarCompraInput) {
      const compra = await atualizarCompra(this.compraEmAndamentoId!, input);
      this.compra = compra;
      return compra;
    },

    substituirItem(item: Compra["itens"][number]) {
      if (!this.compra) return;
      const idx = this.compra.itens.findIndex((i) => i.id === item.id);
      if (idx >= 0) this.compra.itens.splice(idx, 1, item);
    },
  },
});
