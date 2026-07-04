<script setup lang="ts">
// Stub — tela completa de Finalizar Compra é a Fase 5 (mercadeiro-tasks.json #26-30).
// Existe agora só como destino de navegação do botão "Finalizar Compra" (task 25).
import AppShell from "../components/base/AppShell.vue";
import { useCompraStore } from "../stores/compra";

const compraStore = useCompraStore();
</script>

<template>
  <AppShell>
    <h1 class="font-display text-4xl">Finalizar Compra</h1>
    <p class="mt-2 text-sm text-muted">
      Tela completa chega na Fase 5. Compra:
      <strong class="text-ink" data-testid="finalizar-compra-id">{{ compraStore.compraEmAndamentoId }}</strong>
    </p>
  </AppShell>
</template>
