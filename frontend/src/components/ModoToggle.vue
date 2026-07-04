<script setup lang="ts">
// RN-04.1/RN-04.2: alterna entre Despensa e Carrinho via navegação pura (sem
// mutar nenhum item); desabilitado quando não há Compra em andamento.
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import TabToggle from "./base/TabToggle.vue";
import { useCompraStore } from "../stores/compra";

const route = useRoute();
const router = useRouter();
const compraStore = useCompraStore();

const modo = computed(() => (route.name === "carrinho" ? "carrinho" : "despensa"));

function mudarModo(valor: string) {
  if (valor === modo.value) return;
  router.push({ name: valor === "carrinho" ? "carrinho" : "despensa" });
}
</script>

<template>
  <TabToggle
    :model-value="modo"
    :disabled="!compraStore.temCompraEmAndamento"
    :tabs="[
      { key: 'despensa', label: '🏠 Despensa' },
      { key: 'carrinho', label: 'Carrinho 🛒' },
    ]"
    data-testid="modo-toggle"
    @update:model-value="mudarModo"
  />
</template>
