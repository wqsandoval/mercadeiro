<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost";
    disabled?: boolean;
    type?: "button" | "submit";
  }>(),
  { variant: "primary", disabled: false, type: "button" },
);

defineEmits<{ click: [MouseEvent] }>();

const variantClasses: Record<string, string> = {
  primary: "bg-primary text-primary-content",
  secondary: "bg-secondary text-secondary-content",
  ghost: "bg-surface text-ink",
};
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="inline-flex items-center justify-center gap-2 rounded-sketchy border-2 border-ink px-4 py-2.5 font-mono text-sm font-bold shadow-sketchy transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-sketchy"
    :class="variantClasses[variant]"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
