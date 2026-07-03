import { defineStore } from "pinia";

const STORAGE_KEY = "mercadeiro.apiToken";

// Auth simples de app single-user: token colado manualmente (tela de login)
// e guardado em localStorage — nunca embutido no bundle de build (ver decisão
// de arquitetura: token não fica em VITE_* para não vazar em código público).
export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem(STORAGE_KEY) as string | null,
  }),
  getters: {
    estaAutenticado: (state) => !!state.token,
  },
  actions: {
    definirToken(token: string) {
      this.token = token;
      localStorage.setItem(STORAGE_KEY, token);
    },
    limparToken() {
      this.token = null;
      localStorage.removeItem(STORAGE_KEY);
    },
  },
});
