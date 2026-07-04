<script setup lang="ts">
// RN-03.5: badge exibe o supermercado detectado (ou já selecionado) com opção de
// trocar manualmente a qualquer momento. RN-03.6: sem GPS, a seleção manual funciona
// como fallback obrigatório, sem travar o fluxo.
import { computed, onMounted, ref, watch } from "vue";
import Card from "../base/Card.vue";
import Button from "../base/Button.vue";
import { useCompraStore } from "../../stores/compra";
import { reverseGeocode } from "../../services/geocoding";
import { criarOuReaproveitarSupermercado, listarSupermercados, type Supermercado } from "../../services/supermercados";
import type { Coordenadas, StatusGeolocalizacao } from "../../composables/useGeolocalizacao";

const props = defineProps<{
  coords: Coordenadas | null;
  statusGps: StatusGeolocalizacao;
}>();

const compraStore = useCompraStore();

const carregandoSugestao = ref(false);
const mostrandoSeletor = ref(false);
const supermercados = ref<Supermercado[]>([]);
const carregandoLista = ref(false);
const nomeNovoSupermercado = ref("");
const erro = ref<string | null>(null);

const rotuloAtual = computed(() => {
  const supermercado = compraStore.compra?.supermercado;
  if (supermercado) return supermercado.nome;
  if (props.statusGps === "carregando" || carregandoSugestao.value) return "Detectando localização…";
  return "Selecionar supermercado";
});

// Auto-seleciona a sugestão de geocoding só quando a Compra ainda não tem um
// supermercado definido — evita sobrescrever uma escolha manual já feita. Também espera
// a Compra terminar de carregar (compraEmAndamentoId) para não enviar um PATCH sem id válido.
async function buscarSugestao() {
  if (!props.coords || !compraStore.compraEmAndamentoId || compraStore.compra?.supermercadoId) return;

  carregandoSugestao.value = true;
  erro.value = null;
  try {
    const resultado = await reverseGeocode(props.coords.latitude, props.coords.longitude);
    if (!resultado.encontrado) return;

    const supermercado = await criarOuReaproveitarSupermercado({
      nome: resultado.nomeSugerido ?? "Supermercado",
      endereco: resultado.enderecoFormatado,
      latitude: props.coords.latitude,
      longitude: props.coords.longitude,
    });
    await compraStore.atualizarSupermercadoOuLocalizacao({
      supermercadoId: supermercado.id,
      latitude: props.coords.latitude,
      longitude: props.coords.longitude,
    });
  } catch {
    erro.value = "Não foi possível identificar o supermercado automaticamente";
  } finally {
    carregandoSugestao.value = false;
  }
}

// GPS e carregamento da Compra resolvem em paralelo (task 18) — observa os dois sinais,
// já que qualquer um pode chegar depois do outro; buscarSugestao() é seguro para
// rodar mais de uma vez (early-return se já há supermercado definido).
watch(() => props.coords, buscarSugestao);
watch(() => compraStore.compraEmAndamentoId, buscarSugestao);
onMounted(buscarSugestao);

async function alternarSeletor() {
  mostrandoSeletor.value = !mostrandoSeletor.value;
  if (mostrandoSeletor.value && supermercados.value.length === 0) {
    carregandoLista.value = true;
    try {
      supermercados.value = await listarSupermercados();
    } catch {
      erro.value = "Não foi possível carregar a lista de supermercados";
    } finally {
      carregandoLista.value = false;
    }
  }
}

async function selecionar(supermercado: Supermercado) {
  erro.value = null;
  try {
    await compraStore.atualizarSupermercadoOuLocalizacao({ supermercadoId: supermercado.id });
    mostrandoSeletor.value = false;
  } catch {
    erro.value = "Não foi possível selecionar o supermercado";
  }
}

async function criarNovo() {
  const nome = nomeNovoSupermercado.value.trim();
  if (!nome) return;
  erro.value = null;
  try {
    const supermercado = await criarOuReaproveitarSupermercado({ nome });
    await compraStore.atualizarSupermercadoOuLocalizacao({ supermercadoId: supermercado.id });
    nomeNovoSupermercado.value = "";
    mostrandoSeletor.value = false;
  } catch {
    erro.value = "Não foi possível criar o supermercado";
  }
}
</script>

<template>
  <div class="w-fit">
    <button
      type="button"
      data-testid="carrinho-supermercado-badge"
      :disabled="!compraStore.compraEmAndamentoId"
      class="flex items-center gap-1.5 rounded-sketchy border-2 border-warning bg-surface px-2.5 py-1 font-mono text-xs disabled:opacity-40"
      @click="alternarSeletor"
    >
      <span>📍</span>
      <span>{{ rotuloAtual }}</span>
      <span class="text-muted">▼</span>
    </button>

    <Card v-if="mostrandoSeletor" class="mt-2 w-64" data-testid="carrinho-supermercado-seletor">
      <p v-if="carregandoLista" class="text-xs text-muted">Carregando…</p>
      <ul v-else-if="supermercados.length > 0" class="space-y-1">
        <li v-for="sup in supermercados" :key="sup.id">
          <button
            type="button"
            class="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-bg"
            data-testid="carrinho-supermercado-opcao"
            @click="selecionar(sup)"
          >
            {{ sup.nome }}
          </button>
        </li>
      </ul>
      <p v-else class="text-xs text-muted">Nenhum supermercado cadastrado ainda.</p>

      <form class="mt-2 flex gap-1" @submit.prevent="criarNovo">
        <input
          v-model="nomeNovoSupermercado"
          type="text"
          placeholder="Novo supermercado…"
          data-testid="carrinho-supermercado-novo-input"
          class="min-w-0 flex-1 rounded-md border-2 border-ink px-2 py-1 text-xs outline-none"
        />
        <Button
          type="submit"
          variant="ghost"
          data-testid="carrinho-supermercado-novo-confirmar"
          :disabled="!nomeNovoSupermercado.trim()"
        >
          +
        </Button>
      </form>

      <p v-if="erro" class="mt-1 text-xs text-danger">{{ erro }}</p>
    </Card>
  </div>
</template>
