<script setup lang="ts">
// Overlay de câmera para leitura de código de barras (task 23). Fica agnóstico do
// motivo do scan (vincular a um item existente ou criar item extra) — só emite o
// código confirmado; a resolução via API é responsabilidade de quem abre o modal.
//
// Testabilidade: não há como simular decodificação real de imagem em Playwright
// headless (o fake device de vídeo do Chromium gera um padrão sintético, não uma
// imagem de código de barras). O campo de código manual abaixo é ao mesmo tempo um
// fallback de UX legítimo (código danificado/ilegível) e a seam determinística usada
// pelo teste E2E para simular uma detecção sem depender de câmera real.
import { onBeforeUnmount, ref, watch } from "vue";
import Button from "../base/Button.vue";
import { useBarcodeScanner } from "../../composables/useBarcodeScanner";

const props = defineProps<{ aberto: boolean }>();
const emit = defineEmits<{
  fechar: [];
  "codigo-confirmado": [codigo: string];
}>();

const videoEl = ref<HTMLVideoElement | null>(null);
const codigoManual = ref("");
const semResultadoNaFoto = ref(false);
const { ativo, erro, capturando, iniciar, capturarFrame, parar } = useBarcodeScanner();

watch(
  () => props.aberto,
  async (aberto) => {
    semResultadoNaFoto.value = false;
    if (aberto) {
      codigoManual.value = "";
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (videoEl.value) {
        await iniciar(videoEl.value, (codigo) => {
          parar();
          emit("codigo-confirmado", codigo);
        });
      }
    } else {
      parar();
    }
  },
);

onBeforeUnmount(parar);

// Fallback temporário (task 23) enquanto a detecção contínua não é confiável em toda
// câmera: captura o frame atual e tenta decodificar uma única vez, com tempo pro
// usuário mirar/focar antes de disparar.
async function capturar() {
  if (!videoEl.value) return;
  semResultadoNaFoto.value = false;
  const codigo = await capturarFrame(videoEl.value);
  if (codigo) {
    parar();
    emit("codigo-confirmado", codigo);
  } else {
    semResultadoNaFoto.value = true;
  }
}

function confirmarCodigoManual() {
  const codigo = codigoManual.value.trim();
  if (!codigo) return;
  parar();
  emit("codigo-confirmado", codigo);
}

function fechar() {
  parar();
  emit("fechar");
}
</script>

<template>
  <div
    v-if="aberto"
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
    data-testid="scanner-modal"
  >
    <div class="w-full max-w-sm rounded-sketchy border-2 border-ink bg-surface p-4 shadow-sketchy-lg">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="font-display text-2xl">📷 Escanear código</h2>
        <button type="button" class="text-sm text-muted underline" data-testid="scanner-fechar" @click="fechar">
          fechar
        </button>
      </div>

      <div class="aspect-video overflow-hidden rounded-md border-2 border-ink bg-ink">
        <video ref="videoEl" class="h-full w-full object-cover" muted playsinline></video>
      </div>

      <p v-if="erro" class="mt-2 text-xs text-danger">{{ erro }}</p>
      <p v-else-if="!ativo" class="mt-2 text-xs text-muted">Iniciando câmera…</p>

      <Button
        v-if="ativo"
        class="mt-3 w-full justify-center"
        data-testid="scanner-capturar"
        :disabled="capturando"
        @click="capturar"
      >
        {{ capturando ? "Analisando…" : "📸 Capturar" }}
      </Button>
      <p v-if="semResultadoNaFoto" class="mt-1 text-xs text-danger" data-testid="scanner-sem-resultado">
        Não identificamos um código nessa foto. Tente aproximar mais, melhorar a luz, ou digite abaixo.
      </p>

      <form class="mt-3 flex gap-2" @submit.prevent="confirmarCodigoManual">
        <input
          v-model="codigoManual"
          type="text"
          inputmode="numeric"
          placeholder="não consegue escanear? digite o código"
          data-testid="scanner-codigo-manual"
          class="min-w-0 flex-1 rounded-md border-2 border-ink px-2 py-1.5 text-sm outline-none"
        />
        <Button type="submit" variant="secondary" data-testid="scanner-confirmar-manual" :disabled="!codigoManual.trim()">
          ok
        </Button>
      </form>
    </div>
  </div>
</template>
