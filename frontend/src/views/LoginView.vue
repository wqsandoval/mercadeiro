<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Card from "../components/base/Card.vue";
import Button from "../components/base/Button.vue";
import { useAuthStore } from "../stores/auth";
import { http, ApiError } from "../lib/http";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const tokenInput = ref("");
const validando = ref(false);
const erro = ref<string | null>(null);

// Valida o token contra a API antes de aceitar — evita salvar um token
// quebrado e só descobrir no próximo clique.
async function entrar() {
  const token = tokenInput.value.trim();
  if (!token) {
    erro.value = "Cole o token de acesso.";
    return;
  }

  validando.value = true;
  erro.value = null;
  auth.definirToken(token);

  try {
    await http.get("/categorias");
    const destino = typeof route.query.redirect === "string" ? route.query.redirect : "/";
    router.push(destino);
  } catch (e) {
    auth.limparToken();
    erro.value =
      e instanceof ApiError && e.status === 401
        ? "Token inválido."
        : "Não foi possível validar o token. Verifique se a API está no ar.";
  } finally {
    validando.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[#efe6d8] p-6">
    <Card class="w-full max-w-sm">
      <h1 class="font-display text-3xl">Mercadeiro</h1>
      <p class="mb-4 text-sm text-muted">Cole o token de acesso à API para continuar.</p>

      <form class="flex flex-col gap-3" @submit.prevent="entrar">
        <input
          v-model="tokenInput"
          type="password"
          placeholder="Token de acesso"
          autocomplete="off"
          class="rounded-sketchy border-2 border-ink bg-bg px-3 py-2 font-mono text-sm outline-none"
        />
        <p v-if="erro" class="text-sm text-danger">{{ erro }}</p>
        <Button type="submit" :disabled="validando">
          {{ validando ? "Verificando…" : "Entrar" }}
        </Button>
      </form>
    </Card>
  </div>
</template>
