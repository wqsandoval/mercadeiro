<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "accent" | "neutral";
  }>(),
  { variant: "neutral" },
);

const variantClasses: Record<string, string> = {
  primary: "bg-primary text-primary-content",
  secondary: "bg-secondary text-secondary-content",
  accent: "bg-accent text-accent-content",
  neutral: "bg-surface text-ink",
};
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold"
    :class="variantClasses[variant]"
  >
    <slot />
  </span>
</template>
