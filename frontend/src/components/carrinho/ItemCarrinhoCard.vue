<script setup lang="ts">
// RN-03.1: item não pode ser marcado como comprado sem preço — checkbox vazio e o
// botão "digitar preço" abrem o mesmo editor inline; "escanear" delega ao pai
// (que controla o ScannerModal compartilhado). RN-03.4: exibe o código de barras
// lido, ou "sem código escaneado" quando ainda não há um.
import { computed, ref, watch } from "vue";
import Card from "../base/Card.vue";
import Chip from "../base/Chip.vue";
import Checkbox from "../base/Checkbox.vue";
import QtyStepper from "../base/QtyStepper.vue";
import Button from "../base/Button.vue";
import type { ItemCompra } from "../../services/compras";

const props = defineProps<{
  item: ItemCompra;
  // Setado pelo pai após um scan bem-sucedido vinculado a este item (RN-03.7):
  // pré-preenche e abre o editor de preço automaticamente.
  precoSugerido?: number | null;
}>();

const emit = defineEmits<{
  desmarcar: [];
  remarcar: [];
  "confirmar-preco": [valor: number];
  escanear: [];
  "ajustar-quantidade": [delta: number];
  remover: [];
}>();

const mostrandoInputPreco = ref(false);
const valorPreco = ref("");

function abrirInputPreco(valorInicial?: number | null) {
  mostrandoInputPreco.value = true;
  valorPreco.value = valorInicial != null ? String(valorInicial) : "";
}

function fecharInputPreco() {
  mostrandoInputPreco.value = false;
  valorPreco.value = "";
}

// undefined = nenhum sinal do pai; null = acabou de vincular um SKU sem preço no
// histórico (abre vazio mesmo assim); número = pré-preenche com o preço sugerido.
watch(
  () => props.precoSugerido,
  (novoValor) => {
    if (novoValor !== undefined) abrirInputPreco(novoValor);
  },
);

// Preço já salvo (item desmarcado anteriormente) é suficiente para RN-03.1 —
// não precisa reabrir o editor, só remarca comprado=true com o preço existente.
function onToggleCheck(novoValor: boolean) {
  if (!novoValor) {
    emit("desmarcar");
    return;
  }
  if (props.item.precoUnitario !== null) {
    emit("remarcar");
    return;
  }
  abrirInputPreco();
}

const precoValido = computed(() => {
  const numero = Number(valorPreco.value.replace(",", "."));
  return Number.isFinite(numero) && numero > 0;
});

function confirmarPreco() {
  if (!precoValido.value) return;
  emit("confirmar-preco", Number(valorPreco.value.replace(",", ".")));
  fecharInputPreco();
}

const precoFormatado = computed(() => {
  if (props.item.precoUnitario === null) return null;
  return Number(props.item.precoUnitario).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
});
</script>

<template>
  <Card :padded="false" class="mb-3 overflow-hidden" :class="item.comprado ? 'bg-secondary/10' : ''" data-testid="carrinho-item">
    <div class="flex items-center gap-3 p-3">
      <Checkbox :model-value="item.comprado" data-testid="carrinho-item-check" @update:model-value="onToggleCheck" />

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <Chip :variant="item.origem === 'PLANEJADO' ? 'primary' : 'secondary'">
            {{ item.origem === "PLANEJADO" ? "🏠" : "⚡" }}
          </Chip>
          <span class="truncate" :class="item.comprado ? 'text-muted line-through' : ''" data-testid="carrinho-item-nome">
            {{ item.produto.nome }}<span v-if="item.produtoSku?.marca"> ({{ item.produtoSku.marca }})</span>
          </span>
        </div>
        <p class="mt-0.5 text-xs text-muted" data-testid="carrinho-item-codigo">
          {{ item.codigoBarrasLido ? `cod: ${item.codigoBarrasLido}` : "sem código escaneado" }}
        </p>
      </div>

      <QtyStepper
        :model-value="item.quantidade"
        @update:model-value="(novaQtd) => emit('ajustar-quantidade', novaQtd - item.quantidade)"
        @remove="emit('remover')"
      />

      <div
        class="w-16 shrink-0 text-right font-mono text-sm font-bold"
        :class="precoFormatado ? 'text-success' : 'text-muted'"
        data-testid="carrinho-item-preco"
      >
        {{ precoFormatado ?? "R$—" }}
      </div>
    </div>

    <div v-if="!item.comprado && !mostrandoInputPreco" class="flex gap-2 px-3 pb-3">
      <button
        type="button"
        data-testid="carrinho-item-escanear"
        class="flex-1 rounded-sketchy border-2 border-warning px-2 py-1.5 text-center font-mono text-xs font-bold text-warning"
        @click="emit('escanear')"
      >
        📷 Escanear código
      </button>
      <button
        type="button"
        data-testid="carrinho-item-digitar-preco"
        class="flex-1 rounded-sketchy border-2 border-ink/20 px-2 py-1.5 text-center font-mono text-xs text-muted"
        @click="abrirInputPreco()"
      >
        💲 digitar preço
      </button>
    </div>

    <form
      v-if="!item.comprado && mostrandoInputPreco"
      class="flex items-center gap-2 px-3 pb-3"
      data-testid="carrinho-item-form-preco"
      @submit.prevent="confirmarPreco"
    >
      <input
        v-model="valorPreco"
        type="text"
        inputmode="decimal"
        placeholder="0,00"
        data-testid="carrinho-item-input-preco"
        class="w-24 rounded-md border-2 border-ink px-2 py-1 text-sm outline-none"
      />
      <Button
        type="submit"
        variant="secondary"
        data-testid="carrinho-item-confirmar-preco"
        :disabled="!precoValido"
      >
        confirmar
      </Button>
      <button type="button" class="text-xs text-muted underline" @click="fecharInputPreco">cancelar</button>
    </form>
  </Card>
</template>
