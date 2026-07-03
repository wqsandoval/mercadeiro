<script setup lang="ts">
import { computed } from "vue";

// RN-03.3: o progresso considera todos os itens (planejados + extras), comprados ou não.
const props = defineProps<{
  current: number;
  total: number;
}>();

const percent = computed(() => {
  if (props.total <= 0) return 0;
  return Math.min(100, Math.round((props.current / props.total) * 100));
});
</script>

<template>
  <div class="w-full">
    <div class="mb-1 flex justify-between font-mono text-sm text-muted">
      <span>{{ current }}/{{ total }} itens</span>
      <span>{{ percent }}%</span>
    </div>
    <div class="h-3 w-full rounded-full border-2 border-ink bg-surface">
      <div
        class="h-full rounded-full bg-secondary transition-[width] duration-300"
        :style="{ width: percent + '%' }"
      />
    </div>
  </div>
</template>
