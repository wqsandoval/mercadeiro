<script setup lang="ts">
// RN-04.1: o toggle só fica disponível/habilitado quando existe uma Compra
// em andamento; o consumidor controla isso via a prop `disabled`.
defineProps<{
  modelValue: string;
  tabs: { key: string; label: string }[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<template>
  <div
    class="inline-flex rounded-full border-2 border-ink bg-surface p-1 font-mono text-sm"
    :class="disabled ? 'pointer-events-none opacity-40' : ''"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      class="rounded-full px-3 py-1 font-bold transition-colors"
      :class="tab.key === modelValue ? 'bg-primary text-primary-content' : 'text-muted'"
      @click="emit('update:modelValue', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
