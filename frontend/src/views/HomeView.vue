<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppShell from "../components/base/AppShell.vue";
import Card from "../components/base/Card.vue";
import Chip from "../components/base/Chip.vue";
import Button from "../components/base/Button.vue";
import { useCompraStore } from "../stores/compra";
import { buscarDespensa, type GrupoDespensa } from "../services/despensa";
import { buscarAnalitico, type Analitico } from "../services/analitico";
import { ApiError } from "../lib/http";

const router = useRouter();
const compraStore = useCompraStore();

const carregando = ref(true);
const erro = ref<string | null>(null);
const grupos = ref<GrupoDespensa[]>([]);
const analitico = ref<Analitico | null>(null);
const iniciandoCompra = ref(false);

// UC-01: saudação varia pelo horário. Single-user, sem nome de família
// cadastrado — "família Silva" no wireframe é só texto de exemplo (decisão
// 2026-07-01, mercadeiro-regras-de-negocio.md §5.8).
const saudacao = computed(() => {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia!";
  if (hora < 18) return "Boa tarde!";
  return "Boa noite!";
});

// RN-01.1: contador reflete a soma de ItemDespensa ativos.
const totalDespensa = computed(() => grupos.value.reduce((soma, g) => soma + g.itens.length, 0));

const topCategorias = computed(() =>
  [...grupos.value]
    .sort((a, b) => b.itens.length - a.itens.length)
    .slice(0, 3)
    .map((g) => ({ nome: g.categoria.nome, count: g.itens.length })),
);

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Insight em destaque: maior alerta de alta de preço do mês, se houver.
const maiorAlerta = computed(() => analitico.value?.alertas.altaDePreco[0] ?? null);

async function carregar() {
  carregando.value = true;
  erro.value = null;
  try {
    const [despensaResp, analiticoResp] = await Promise.all([
      buscarDespensa(),
      buscarAnalitico("mes"),
    ]);
    grupos.value = despensaResp;
    analitico.value = analiticoResp;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      router.push({ name: "login" });
      return;
    }
    erro.value = e instanceof Error ? e.message : "Erro ao carregar a Home";
  } finally {
    carregando.value = false;
  }
}

// RN-01.3: CTA sempre habilitado, mesmo com Despensa vazia.
// RN-02.4: se já existe Compra em andamento, o backend retoma em vez de criar outra.
async function iniciarCompra() {
  iniciandoCompra.value = true;
  erro.value = null;
  try {
    await compraStore.iniciarOuRetomarCompra();
    router.push({ name: "carrinho" });
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível iniciar a compra";
  } finally {
    iniciandoCompra.value = false;
  }
}

onMounted(carregar);
</script>

<template>
  <AppShell>
    <template #footer>
      <Button
        class="w-full justify-center"
        data-testid="cta-iniciar-compra"
        :disabled="iniciandoCompra"
        @click="iniciarCompra"
      >
        {{ iniciandoCompra ? "Iniciando…" : `Iniciar Compra → (${totalDespensa})` }}
      </Button>
    </template>

    <header class="mb-4">
      <h1 class="font-display text-4xl">{{ saudacao }}</h1>
      <p class="text-sm text-muted">Bem-vindo(a) de volta ao Mercadeiro.</p>
    </header>

    <p v-if="erro" class="mb-4 rounded-sketchy border-2 border-ink bg-danger/10 p-3 text-sm text-danger">
      {{ erro }}
      <button class="ml-2 font-bold underline" @click="carregar">tentar de novo</button>
    </p>

    <p v-if="carregando" class="text-sm text-muted">Carregando…</p>

    <div v-else class="flex flex-col gap-3">
      <Card
        class="cursor-pointer transition hover:-translate-y-0.5"
        role="button"
        tabindex="0"
        data-testid="card-despensa"
        @click="router.push({ name: 'despensa' })"
        @keydown.enter="router.push({ name: 'despensa' })"
      >
        <div class="flex items-center justify-between">
          <h2 class="font-display text-2xl">🧺 Despensa</h2>
          <span class="flex items-center gap-2">
            <span class="font-mono text-2xl font-bold" data-testid="despensa-count">{{ totalDespensa }}</span>
            <span class="text-muted" aria-hidden="true">›</span>
          </span>
        </div>
        <p v-if="topCategorias.length === 0" class="mt-1 text-sm text-muted">Nenhum item pendente.</p>
        <div v-else class="mt-2 flex flex-wrap gap-2">
          <Chip v-for="cat in topCategorias" :key="cat.nome">{{ cat.nome }} ({{ cat.count }})</Chip>
        </div>
      </Card>

      <Card>
        <div class="flex items-center justify-between">
          <h2 class="font-display text-2xl">📊 Analítico</h2>
          <span class="font-mono text-lg font-bold" data-testid="analitico-total">
            {{ formatoMoeda.format(analitico?.totalGasto ?? 0) }}
          </span>
        </div>
        <p class="mt-1 text-xs text-muted">Gasto este mês</p>
        <p v-if="maiorAlerta" class="mt-2 text-sm">
          ⚠️ <strong>{{ maiorAlerta.nome }}</strong> subiu {{ maiorAlerta.percentualAlta }}%
          ({{ formatoMoeda.format(maiorAlerta.mediaHistorica) }} →
          {{ formatoMoeda.format(maiorAlerta.precoAtual) }})
        </p>
        <p v-else class="mt-2 text-sm text-muted">Nenhum alerta de preço este mês.</p>
      </Card>
    </div>
  </AppShell>
</template>
