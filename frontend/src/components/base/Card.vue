<script setup lang="ts">
withDefaults(
  defineProps<{
    padded?: boolean;
  }>(),
  { padded: true },
);
</script>

<template>
  <div
    class="rounded-sketchy border-2 border-ink bg-surface shadow-sketchy"
    :class="padded ? 'p-4' : ''"
  >
    <slot />
  </div>
</template>
