<script setup lang="ts">
// Stub — tela completa do Carrinho é a Fase 4 (mercadeiro-tasks.json #18-25).
// Existe agora só como destino de navegação do CTA "Iniciar Compra" (task 14).
import AppShell from "../components/base/AppShell.vue";
import { useCompraStore } from "../stores/compra";

const compraStore = useCompraStore();
</script>

<template>
  <AppShell>
    <h1 class="font-display text-4xl">Carrinho</h1>
    <p class="mt-2 text-sm text-muted">
      Tela completa chega na Fase 4. Compra em andamento:
      <strong class="text-ink" data-testid="carrinho-compra-id">{{ compraStore.compraEmAndamentoId }}</strong>
    </p>
  </AppShell>
</template>
