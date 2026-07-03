<script setup lang="ts">
import { ref, watch } from "vue";

// RN-02.1: quantidade mínima é 1. Tocar "−" em quantidade 1 (ou digitar 0/vazio)
// não decrementa abaixo do mínimo — emite 'remove' para o consumidor excluir o item.
const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
  }>(),
  { min: 1 },
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
  remove: [];
}>();

function decrement() {
  if (props.modelValue <= props.min) {
    emit("remove");
    return;
  }
  emit("update:modelValue", props.modelValue - 1);
}

function increment() {
  emit("update:modelValue", props.modelValue + 1);
}

// Edição direta da quantidade — evita ter que clicar em "+" várias vezes para
// quantidades grandes. Texto local desacoplado do modelValue para permitir
// digitar livremente; só confirma (e chama a API, via o consumidor) no
// blur/Enter, não a cada tecla.
const textoEditado = ref(String(props.modelValue));
watch(
  () => props.modelValue,
  (novoValor) => {
    textoEditado.value = String(novoValor);
  },
);

function confirmarEdicao() {
  const texto = textoEditado.value.trim();
  if (texto === "") {
    textoEditado.value = String(props.modelValue);
    return;
  }

  const numero = Math.trunc(Number(texto));
  if (!Number.isFinite(numero)) {
    textoEditado.value = String(props.modelValue);
    return;
  }

  if (numero <= 0) {
    emit("remove");
    return;
  }

  if (numero === props.modelValue) {
    textoEditado.value = String(props.modelValue);
    return;
  }

  emit("update:modelValue", numero);
}
</script>

<template>
  <div class="inline-flex items-center gap-2 font-mono">
    <button
      type="button"
      aria-label="Diminuir quantidade"
      class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-surface font-bold leading-none active:translate-y-px"
      @click="decrement"
    >
      −
    </button>
    <input
      v-model="textoEditado"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      aria-label="Quantidade"
      class="w-10 rounded-md border-2 border-ink bg-surface text-center font-bold outline-none"
      @focus="($event.target as HTMLInputElement).select()"
      @blur="confirmarEdicao"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
    />
    <button
      type="button"
      aria-label="Aumentar quantidade"
      class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-surface font-bold leading-none active:translate-y-px"
      @click="increment"
    >
      +
    </button>
  </div>
</template>
