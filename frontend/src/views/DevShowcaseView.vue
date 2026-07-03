<script setup lang="ts">
import { ref } from "vue";
import AppShell from "../components/base/AppShell.vue";
import Card from "../components/base/Card.vue";
import Chip from "../components/base/Chip.vue";
import ProgressBar from "../components/base/ProgressBar.vue";
import Checkbox from "../components/base/Checkbox.vue";
import QtyStepper from "../components/base/QtyStepper.vue";
import CategoryHeader from "../components/base/CategoryHeader.vue";
import TabToggle from "../components/base/TabToggle.vue";
import { useCompraStore } from "../stores/compra";

// Página de desenvolvimento para validar visualmente os componentes base
// da Fase 0 (mercadeiro-tasks.json #7) antes das telas reais (Fase 2+).
const compraStore = useCompraStore();

const qty = ref(1);
const checked = ref(false);
const tab = ref("despensa");
</script>

<template>
  <AppShell>
    <template #footer>
      <div class="flex items-center justify-between font-mono text-sm font-bold">
        <span>Total parcial</span>
        <span>R$ 0,00</span>
      </div>
    </template>

    <h1 class="font-display text-4xl">Mercadeiro</h1>
    <p class="mb-4 text-sm text-muted">Showcase de componentes base — Fase 0</p>

    <div class="mb-4">
      <TabToggle
        v-model="tab"
        :disabled="!compraStore.temCompraEmAndamento"
        :tabs="[
          { key: 'despensa', label: 'Despensa' },
          { key: 'carrinho', label: 'Carrinho' },
        ]"
      />
      <p class="mt-1 text-xs text-muted">
        Toggle desabilitado sem Compra em andamento (RN-04.1).
      </p>
    </div>

    <CategoryHeader nome="Frutas" :count="2" />
    <Card class="mb-3 flex items-center gap-3">
      <Checkbox v-model="checked" />
      <span class="flex-1" :class="checked ? 'text-muted line-through' : ''">Banana</span>
      <Chip variant="primary">🏠 planejado</Chip>
      <QtyStepper v-model="qty" @remove="qty = 0" />
    </Card>

    <ProgressBar :current="3" :total="8" />

    <div class="mt-4 flex gap-2">
      <Chip variant="secondary">⚡ extra</Chip>
      <Chip variant="accent">Alerta de preço</Chip>
      <Chip>Outros</Chip>
    </div>
  </AppShell>
</template>
