import { defineStore } from "pinia";
import { ApiError } from "../lib/http";
import { buscarCompraAtual, criarOuRetomarCompra } from "../services/compras";

// RN-02.4 / RN-04.1: só existe uma Compra em andamento por vez; o toggle
// Despensa/Carrinho só fica habilitado quando esse id não é nulo.
export const useCompraStore = defineStore("compra", {
  state: () => ({
    compraEmAndamentoId: null as string | null,
  }),
  getters: {
    temCompraEmAndamento: (state) => state.compraEmAndamentoId !== null,
  },
  actions: {
    async sincronizar() {
      try {
        const compra = await buscarCompraAtual();
        this.compraEmAndamentoId = compra.id;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          this.compraEmAndamentoId = null;
          return;
        }
        throw e;
      }
    },

    // RN-02.4: cria uma nova Compra a partir da Despensa, ou retoma a que já
    // está em andamento — o backend decide, aqui só refletimos o resultado.
    async iniciarOuRetomarCompra() {
      const compra = await criarOuRetomarCompra();
      this.compraEmAndamentoId = compra.id;
      return compra;
    },
  },
});
