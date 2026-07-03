<script setup lang="ts">
// RN-03.1: o consumidor decide se o check pode ser aplicado (ex: bloquear
// quando não há preço definido) antes de reagir ao evento 'update:modelValue'.
withDefaults(
  defineProps<{
    modelValue: boolean;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="modelValue"
    :disabled="disabled"
    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-surface disabled:opacity-40"
    :class="modelValue ? 'bg-secondary' : ''"
    @click="!disabled && emit('update:modelValue', !modelValue)"
  >
    <svg
      v-if="modelValue"
      viewBox="0 0 24 24"
      class="h-4 w-4 stroke-surface"
      fill="none"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 12l5 5L20 6" />
    </svg>
  </button>
</template>
