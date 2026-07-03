<script setup lang="ts">
// RN-02.2: itens são agrupados e exibidos por ordem de Categoria.
defineProps<{
  nome: string;
  count?: number;
}>();
</script>

<template>
  <div class="mt-4 mb-2 flex items-baseline justify-between first:mt-0">
    <h3 class="font-display text-2xl leading-none text-ink">{{ nome }}</h3>
    <span v-if="count !== undefined" class="font-mono text-xs text-muted">{{ count }}</span>
  </div>
</template>
