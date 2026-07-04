<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppShell from "../components/base/AppShell.vue";
import Card from "../components/base/Card.vue";
import CategoryHeader from "../components/base/CategoryHeader.vue";
import QtyStepper from "../components/base/QtyStepper.vue";
import Button from "../components/base/Button.vue";
import ModoToggle from "../components/ModoToggle.vue";
import { useCompraStore } from "../stores/compra";
import {
  adicionarItemDespensa,
  ajustarQuantidadeDespensa,
  buscarDespensa,
  removerItemDespensa,
  type GrupoDespensa,
} from "../services/despensa";
import { ApiError } from "../lib/http";

const router = useRouter();
const compraStore = useCompraStore();

const grupos = ref<GrupoDespensa[]>([]);
const carregando = ref(true);
const erro = ref<string | null>(null);
const nomeNovoItem = ref("");
const marcaNovoItem = ref("");
const mostrarCampoMarca = ref(false);
const adicionando = ref(false);
const indoParaCarrinho = ref(false);

async function carregar() {
  carregando.value = true;
  erro.value = null;
  try {
    grupos.value = await buscarDespensa();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      router.push({ name: "login" });
      return;
    }
    erro.value = e instanceof Error ? e.message : "Erro ao carregar a Despensa";
  } finally {
    carregando.value = false;
  }
}

// Regra 4.1: mesma referência (genérico ou SKU) já existente soma quantidade em vez de duplicar
// (decidido no backend). Produto/SKU novo sem categoria conhecida cai em "Outros" (idem).
// Com o campo "+ marca" preenchido, o item vira um SKU específico do genérico digitado;
// sem marca, o comportamento é idêntico ao de sempre (item genérico).
async function adicionarItem() {
  const nome = nomeNovoItem.value.trim();
  if (!nome) return;
  const marca = marcaNovoItem.value.trim();

  adicionando.value = true;
  erro.value = null;
  try {
    if (marca) {
      await adicionarItemDespensa({
        nome: `${nome} ${marca}`,
        tipo: "SKU",
        produtoGenericoNome: nome,
        marca,
      });
    } else {
      await adicionarItemDespensa({ nome });
    }
    nomeNovoItem.value = "";
    marcaNovoItem.value = "";
    mostrarCampoMarca.value = false;
    await carregar();
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível adicionar o item";
  } finally {
    adicionando.value = false;
  }
}

// RN-02.1: o QtyStepper decide quando decrementar vira remoção (emite 'remove' em vez de
// 'update:modelValue'); aqui só refletimos o delta na API e recarregamos a lista.
async function ajustarQuantidade(itemId: string, delta: number) {
  erro.value = null;
  try {
    await ajustarQuantidadeDespensa(itemId, delta);
    await carregar();
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível atualizar a quantidade";
  }
}

// Botão ✕: remove imediatamente, sem confirmação (independente da quantidade atual).
async function removerItem(itemId: string) {
  erro.value = null;
  try {
    await removerItemDespensa(itemId);
    await carregar();
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível remover o item";
  }
}

// RN-02.3: ir para o Carrinho não remove nada da Despensa agora.
// RN-02.4: se já existe Compra em andamento, o backend retoma em vez de criar outra.
async function irParaCarrinho() {
  indoParaCarrinho.value = true;
  erro.value = null;
  try {
    await compraStore.iniciarOuRetomarCompra();
    router.push({ name: "carrinho" });
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível ir para o carrinho";
  } finally {
    indoParaCarrinho.value = false;
  }
}

onMounted(() => {
  carregar();
  // Garante que o toggle (RN-04.1) reflita o estado real do backend mesmo em
  // reload/deep-link direto para /despensa, não só após clicar em algum CTA.
  compraStore.carregarCompraAtual();
});
</script>

<template>
  <AppShell>
    <template #footer>
      <Button
        class="w-full justify-center"
        data-testid="cta-ir-para-carrinho"
        :disabled="indoParaCarrinho"
        @click="irParaCarrinho"
      >
        {{ indoParaCarrinho ? "Abrindo…" : "Ir para o Carrinho →" }}
      </Button>
    </template>

    <header class="mb-4 flex items-center justify-between">
      <h1 class="font-display text-4xl">Despensa</h1>
      <div class="flex items-center gap-3">
        <ModoToggle />
        <RouterLink to="/" class="text-sm text-muted underline">← Home</RouterLink>
      </div>
    </header>

    <form class="mb-4" @submit.prevent="adicionarItem">
      <div class="flex gap-2">
        <input
          v-model="nomeNovoItem"
          type="text"
          placeholder="O que está faltando?"
          data-testid="despensa-input"
          class="flex-1 rounded-sketchy border-2 border-ink bg-surface px-3 py-2 font-mono text-sm outline-none"
        />
        <Button
          type="submit"
          variant="secondary"
          data-testid="despensa-add"
          :disabled="adicionando || !nomeNovoItem.trim()"
        >
          {{ adicionando ? "…" : "Add" }}
        </Button>
      </div>
      <button
        type="button"
        data-testid="despensa-toggle-marca"
        class="mt-1 text-xs text-muted underline"
        @click="mostrarCampoMarca = !mostrarCampoMarca"
      >
        {{ mostrarCampoMarca ? "− marca" : "+ marca" }}
      </button>
      <input
        v-if="mostrarCampoMarca"
        v-model="marcaNovoItem"
        type="text"
        placeholder="Marca (opcional, ex: Elegê)"
        data-testid="despensa-input-marca"
        class="mt-2 w-full rounded-sketchy border-2 border-ink bg-surface px-3 py-2 font-mono text-sm outline-none"
      />
    </form>

    <p v-if="erro" class="mb-4 rounded-sketchy border-2 border-ink bg-danger/10 p-3 text-sm text-danger">
      {{ erro }}
      <button class="ml-2 font-bold underline" @click="carregar">tentar de novo</button>
    </p>

    <p v-if="carregando" class="text-sm text-muted">Carregando…</p>

    <template v-else>
      <p v-if="grupos.length === 0" class="text-sm text-muted">
        Despensa vazia. Adicione o primeiro item acima.
      </p>

      <template v-for="grupo in grupos" :key="grupo.categoria.id">
        <CategoryHeader :nome="grupo.categoria.nome" :count="grupo.itens.length" />
        <Card
          v-for="item in grupo.itens"
          :key="item.id"
          class="mb-3 flex items-center gap-3"
          data-testid="despensa-item"
        >
          <span class="flex-1">
            {{ item.produto?.nome ?? item.produtoSku?.nome }}
            <span v-if="item.produtoSku?.marca" class="text-xs text-muted">({{ item.produtoSku.marca }})</span>
          </span>
          <QtyStepper
            :model-value="item.quantidade"
            @update:model-value="(novaQtd) => ajustarQuantidade(item.id, novaQtd - item.quantidade)"
            @remove="ajustarQuantidade(item.id, -item.quantidade)"
          />
          <button
            type="button"
            aria-label="Remover item"
            data-testid="despensa-item-remover"
            class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-surface font-bold leading-none text-danger"
            @click="removerItem(item.id)"
          >
            ✕
          </button>
        </Card>
      </template>
    </template>
  </AppShell>
</template>
