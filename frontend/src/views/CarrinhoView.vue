<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppShell from "../components/base/AppShell.vue";
import Button from "../components/base/Button.vue";
import CategoryHeader from "../components/base/CategoryHeader.vue";
import ProgressBar from "../components/base/ProgressBar.vue";
import ModoToggle from "../components/ModoToggle.vue";
import SupermercadoBadge from "../components/carrinho/SupermercadoBadge.vue";
import ItemCarrinhoCard from "../components/carrinho/ItemCarrinhoCard.vue";
import ScannerModal from "../components/carrinho/ScannerModal.vue";
import { useCompraStore } from "../stores/compra";
import { useGeolocalizacao } from "../composables/useGeolocalizacao";
import { buscarProdutoSkuPorCodigoBarras } from "../services/produtos";
import { ApiError } from "../lib/http";
import type { ItemCompra } from "../services/compras";

const router = useRouter();
const compraStore = useCompraStore();
const { coords, status: statusGps, capturar } = useGeolocalizacao();

const carregando = ref(true);
const erro = ref<string | null>(null);
const nomeItemExtra = ref("");
const adicionandoExtra = ref(false);

async function carregar() {
  carregando.value = true;
  erro.value = null;
  try {
    await compraStore.carregarCompraAtual();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      router.push({ name: "login" });
      return;
    }
    erro.value = e instanceof Error ? e.message : "Erro ao carregar o Carrinho";
  } finally {
    carregando.value = false;
  }
}

onMounted(() => {
  carregar();
  // RN-03.6: GPS roda em paralelo, sem bloquear o resto da tela — erro/negação
  // só afeta o SupermercadoBadge, que cai no fallback de seleção manual.
  capturar();
});

// Itens agrupados por categoria do genérico (produtoId aponta sempre para o
// genérico, mesmo quando o item tem um SKU vinculado — mesmo padrão da Despensa).
const grupos = computed(() => {
  const mapa = new Map<string, { categoria: ItemCompra["produto"]["categoria"]; itens: ItemCompra[] }>();
  for (const item of compraStore.itens) {
    const categoria = item.produto.categoria;
    const grupo = mapa.get(categoria.id) ?? { categoria, itens: [] };
    grupo.itens.push(item);
    mapa.set(categoria.id, grupo);
  }
  return Array.from(mapa.values());
});

const subtotalFormatado = computed(() =>
  compraStore.subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
);

// --- Item extra (task 20) ---
async function adicionarItemExtra() {
  const nome = nomeItemExtra.value.trim();
  // Defesa contra corrida: o formulário fica interativo antes de carregarCompraAtual()
  // terminar (carregando não bloqueia esta seção) — sem compra carregada ainda, não há
  // id válido para enviar (evita POST /compras/null/itens).
  if (!nome || !compraStore.compraEmAndamentoId) return;
  adicionandoExtra.value = true;
  erro.value = null;
  try {
    await compraStore.adicionarItemExtra({ nome });
    nomeItemExtra.value = "";
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível adicionar o item";
  } finally {
    adicionandoExtra.value = false;
  }
}

// --- Ajuste de quantidade / remoção / desmarcar ---
async function ajustarQuantidade(itemId: string, delta: number) {
  erro.value = null;
  try {
    await compraStore.ajustarQuantidadeItem(itemId, delta);
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível atualizar a quantidade";
  }
}

async function removerItem(itemId: string) {
  erro.value = null;
  try {
    await compraStore.removerItem(itemId);
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível remover o item";
  }
}

// Desmarcar não passa por preço — o valor salvo é preservado (RN-03.1/RN-03.2).
async function desmarcarItem(itemId: string) {
  erro.value = null;
  try {
    await compraStore.atualizarItem(itemId, { comprado: false });
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível desmarcar o item";
  }
}

// Remarcar: item já tem preço salvo de uma desmarcação anterior — RN-03.1 já está
// satisfeita sem precisar reabrir o editor de preço.
async function remarcarItem(itemId: string) {
  erro.value = null;
  try {
    await compraStore.atualizarItem(itemId, { comprado: true });
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível remarcar o item";
  }
}

// --- Preço manual (task 24) ---
async function confirmarPreco(itemId: string, valor: number) {
  erro.value = null;
  try {
    await compraStore.atualizarItem(itemId, { comprado: true, precoUnitario: valor });
    if (itemComPrecoSugerido.value?.itemId === itemId) itemComPrecoSugerido.value = null;
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível confirmar o preço";
  }
}

// --- Scanner (task 23) ---
type ContextoScanner = { tipo: "item"; itemId: string } | { tipo: "extra" };

const scannerAberto = ref(false);
const contextoScanner = ref<ContextoScanner | null>(null);
const itemComPrecoSugerido = ref<{ itemId: string; preco: number | null } | null>(null);
const pendenteNome = ref<{ codigoBarras: string; contexto: ContextoScanner } | null>(null);
const nomePendente = ref("");
const marcaPendente = ref("");

function abrirScannerParaItem(itemId: string) {
  contextoScanner.value = { tipo: "item", itemId };
  scannerAberto.value = true;
}

function abrirScannerParaExtra() {
  contextoScanner.value = { tipo: "extra" };
  scannerAberto.value = true;
}

function fecharScanner() {
  scannerAberto.value = false;
  contextoScanner.value = null;
}

// Detecção (câmera ou código digitado manualmente no ScannerModal) → resolve
// conforme o contexto: vincula SKU a um item existente (RN-03.7) ou localiza/cria
// o SKU para um item extra novo. Código desconhecido sem nome cadastrado pede o
// nome do produto antes de seguir (ver `pendenteNome` abaixo).
async function onCodigoConfirmado(codigo: string) {
  scannerAberto.value = false;
  const contexto = contextoScanner.value;
  contextoScanner.value = null;
  if (!contexto) return;

  erro.value = null;
  try {
    if (contexto.tipo === "item") {
      const resultado = await compraStore.vincularSku(contexto.itemId, { codigoBarras: codigo });
      itemComPrecoSugerido.value = { itemId: contexto.itemId, preco: resultado.precoSugerido };
    } else {
      const encontrados = await buscarProdutoSkuPorCodigoBarras(codigo);
      if (encontrados.length > 0) {
        await compraStore.adicionarItemExtra({ produtoSkuId: encontrados[0].id });
      } else {
        pendenteNome.value = { codigoBarras: codigo, contexto };
      }
    }
  } catch (e) {
    const desconhecido =
      e instanceof ApiError && e.status === 404 &&
      (e.details as { codigoBarrasDesconhecido?: boolean } | undefined)?.codigoBarrasDesconhecido;
    if (desconhecido) {
      pendenteNome.value = { codigoBarras: codigo, contexto };
    } else {
      erro.value = e instanceof Error ? e.message : "Não foi possível processar o código escaneado";
    }
  }
}

async function confirmarNomePendente() {
  if (!pendenteNome.value) return;
  const { codigoBarras, contexto } = pendenteNome.value;
  const nome = nomePendente.value.trim();
  if (!nome) return;
  const marca = marcaPendente.value.trim() || undefined;

  erro.value = null;
  try {
    if (contexto.tipo === "item") {
      const resultado = await compraStore.vincularSku(contexto.itemId, { codigoBarras, nome, marca });
      itemComPrecoSugerido.value = { itemId: contexto.itemId, preco: resultado.precoSugerido };
    } else {
      await compraStore.adicionarItemExtra({
        nome: marca ? `${nome} ${marca}` : nome,
        tipo: "SKU",
        produtoGenericoNome: nome,
        marca,
        codigoBarras,
      });
    }
    cancelarNomePendente();
  } catch (e) {
    erro.value = e instanceof Error ? e.message : "Não foi possível criar o produto";
  }
}

function cancelarNomePendente() {
  pendenteNome.value = null;
  nomePendente.value = "";
  marcaPendente.value = "";
}

function precoSugeridoPara(itemId: string): number | null | undefined {
  return itemComPrecoSugerido.value?.itemId === itemId ? itemComPrecoSugerido.value.preco : undefined;
}

// --- Finalizar (task 25) ---
function irParaFinalizar() {
  router.push({ name: "finalizar-compra" });
}
</script>

<template>
  <AppShell>
    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-xs text-muted">total parcial</div>
          <div class="font-display text-2xl font-bold" data-testid="carrinho-subtotal">{{ subtotalFormatado }}</div>
        </div>
        <Button data-testid="cta-finalizar-compra" @click="irParaFinalizar">✅ Finalizar Compra</Button>
      </div>
    </template>

    <!-- Preservado para tests/ui/home.spec.ts (RN-02.4) — a tela stub anterior expunha o
    id da Compra em andamento; mantido aqui, só visualmente oculto, para não quebrar o teste. -->
    <span class="sr-only" data-testid="carrinho-compra-id">{{ compraStore.compraEmAndamentoId }}</span>

    <header class="mb-3 flex items-center justify-between">
      <h1 class="font-display text-4xl">🛒 Carrinho</h1>
      <ModoToggle />
    </header>

    <SupermercadoBadge class="mb-3" :coords="coords" :status-gps="statusGps" />

    <form class="mb-3 flex gap-2" @submit.prevent="adicionarItemExtra">
      <input
        v-model="nomeItemExtra"
        type="text"
        placeholder="+ adicionar item extra..."
        data-testid="carrinho-item-extra-input"
        class="min-w-0 flex-1 rounded-sketchy border-2 border-ink bg-surface px-3 py-2 font-mono text-sm outline-none"
      />
      <Button
        type="submit"
        variant="secondary"
        data-testid="carrinho-item-extra-add"
        :disabled="adicionandoExtra || !nomeItemExtra.trim() || carregando"
      >
        {{ adicionandoExtra ? "…" : "Add" }}
      </Button>
      <button
        type="button"
        data-testid="carrinho-item-extra-scan"
        :disabled="carregando"
        class="flex items-center justify-center rounded-sketchy border-2 border-warning bg-warning px-3 text-lg text-primary-content disabled:opacity-40"
        @click="abrirScannerParaExtra"
      >
        📷
      </button>
    </form>

    <ProgressBar class="mb-3" :current="compraStore.progresso.atual" :total="compraStore.progresso.total" />

    <p v-if="erro" class="mb-4 rounded-sketchy border-2 border-ink bg-danger/10 p-3 text-sm text-danger">
      {{ erro }}
      <button class="ml-2 font-bold underline" @click="carregar">tentar de novo</button>
    </p>

    <p v-if="carregando" class="text-sm text-muted">Carregando…</p>

    <template v-else>
      <p v-if="grupos.length === 0" class="text-sm text-muted">Carrinho vazio. Adicione um item extra acima.</p>

      <template v-for="grupo in grupos" :key="grupo.categoria.id">
        <CategoryHeader :nome="grupo.categoria.nome" :count="grupo.itens.length" />
        <ItemCarrinhoCard
          v-for="item in grupo.itens"
          :key="item.id"
          :item="item"
          :preco-sugerido="precoSugeridoPara(item.id)"
          @desmarcar="desmarcarItem(item.id)"
          @remarcar="remarcarItem(item.id)"
          @confirmar-preco="(valor) => confirmarPreco(item.id, valor)"
          @escanear="abrirScannerParaItem(item.id)"
          @ajustar-quantidade="(delta) => ajustarQuantidade(item.id, delta)"
          @remover="removerItem(item.id)"
        />
      </template>
    </template>

    <div
      v-if="pendenteNome"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      data-testid="carrinho-nome-pendente-modal"
    >
      <form
        class="w-full max-w-sm rounded-sketchy border-2 border-ink bg-surface p-4 shadow-sketchy-lg"
        @submit.prevent="confirmarNomePendente"
      >
        <h2 class="font-display text-2xl">Código desconhecido</h2>
        <p class="mb-2 text-xs text-muted">
          Código {{ pendenteNome.codigoBarras }} não está cadastrado. Como se chama o produto?
        </p>
        <input
          v-model="nomePendente"
          type="text"
          placeholder="Nome do produto (ex: Leite)"
          data-testid="carrinho-nome-pendente-input"
          class="mb-2 w-full rounded-md border-2 border-ink px-2 py-1.5 text-sm outline-none"
        />
        <input
          v-model="marcaPendente"
          type="text"
          placeholder="Marca (opcional)"
          data-testid="carrinho-nome-pendente-marca"
          class="mb-3 w-full rounded-md border-2 border-ink px-2 py-1.5 text-sm outline-none"
        />
        <div class="flex justify-end gap-2">
          <button type="button" class="text-sm text-muted underline" @click="cancelarNomePendente">cancelar</button>
          <Button
            type="submit"
            variant="secondary"
            data-testid="carrinho-nome-pendente-confirmar"
            :disabled="!nomePendente.trim()"
          >
            confirmar
          </Button>
        </div>
      </form>
    </div>

    <ScannerModal :aberto="scannerAberto" @fechar="fecharScanner" @codigo-confirmado="onCodigoConfirmado" />
  </AppShell>
</template>
