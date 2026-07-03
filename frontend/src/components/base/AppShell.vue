<script setup lang="ts"></script>

<template>
  <div class="min-h-screen bg-[#efe6d8] sm:py-10">
    <div
      class="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-bg sm:min-h-0 sm:rounded-[2rem] sm:border-2 sm:border-ink sm:shadow-sketchy-lg"
    >
      <main class="flex-1 px-4 py-6 sm:px-8">
        <slot />
      </main>
      <div
        v-if="$slots.footer"
        class="sticky bottom-0 border-t-2 border-ink bg-surface p-4 sm:rounded-b-[2rem]"
      >
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
