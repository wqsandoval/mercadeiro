import { test, expect, type APIRequestContext } from "@playwright/test";
import { nomeUnico } from "../api/helpers";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3333";
const TOKEN = process.env.API_BEARER_TOKEN!;
const AUTH_HEADERS = { Authorization: `Bearer ${TOKEN}` };

// RN-02.4: só pode existir uma Compra em andamento por vez — os testes de API e UI
// compartilham o mesmo banco, então cada bloco independente garante um estado limpo
// antes de começar, em vez de assumir a ordem de execução dos outros specs.
async function garantirSemCompraEmAndamento(request: APIRequestContext) {
  const res = await request.get(`${BACKEND_URL}/compras/atual`, { headers: AUTH_HEADERS });
  if (res.status() === 200) {
    const compra = await res.json();
    await request.post(`${BACKEND_URL}/compras/${compra.id}/finalizar`, { headers: AUTH_HEADERS }).catch(() => undefined);
  }
}

test.describe("Carrinho", () => {
  test("toggle Despensa/Carrinho desabilitado sem Compra em andamento (RN-04.1)", async ({ page, request }) => {
    await garantirSemCompraEmAndamento(request);
    await page.goto("/despensa");
    await expect(page.getByTestId("modo-toggle")).toHaveClass(/opacity-40/);
  });

  test.describe.serial("fluxo completo do Carrinho", () => {
    let compraId: string;
    const nomePlanejado = nomeUnico("Carrinho Planejado");
    const nomeExtra = nomeUnico("Carrinho Extra");

    test.afterAll(async ({ request }) => {
      if (compraId) {
        await request.post(`${BACKEND_URL}/compras/${compraId}/finalizar`, { headers: AUTH_HEADERS }).catch(() => undefined);
      }
    });

    test("preparação: item planejado na Despensa + Compra em andamento via API", async ({ request }) => {
      await garantirSemCompraEmAndamento(request);

      const criarDespensa = await request.post(`${BACKEND_URL}/despensa`, {
        headers: AUTH_HEADERS,
        data: { nome: nomePlanejado },
      });
      expect(criarDespensa.status()).toBe(201);

      const criarCompra = await request.post(`${BACKEND_URL}/compras`, { headers: AUTH_HEADERS, data: {} });
      expect(criarCompra.status()).toBe(201);
      compraId = (await criarCompra.json()).id;
    });

    test("toggle habilitado; alternar entre modos não altera itens (RN-04.1/RN-04.2)", async ({ page }) => {
      await page.goto("/carrinho");
      const toggle = page.getByTestId("modo-toggle");
      await expect(toggle).not.toHaveClass(/opacity-40/);

      const linhaCarrinho = page.getByTestId("carrinho-item").filter({ hasText: nomePlanejado });
      await expect(linhaCarrinho).toBeVisible();
      await expect(linhaCarrinho).toContainText("🏠");

      await toggle.getByText("🏠 Despensa").click();
      await expect(page).toHaveURL(/\/despensa/);
      const linhaDespensa = page.getByTestId("despensa-item").filter({ hasText: nomePlanejado });
      await expect(linhaDespensa).toBeVisible();
      await expect(linhaDespensa.getByLabel("Quantidade", { exact: true })).toHaveValue("1");

      await page.getByTestId("modo-toggle").getByText("Carrinho 🛒").click();
      await expect(page).toHaveURL(/\/carrinho/);
      await expect(linhaCarrinho).toBeVisible();
      await expect(linhaCarrinho.getByLabel("Quantidade", { exact: true })).toHaveValue("1");
    });

    test("adicionar item extra aparece com badge ⚡ (task 20)", async ({ page }) => {
      // Regressão (2026-07-03): preencher e clicar "Add" logo após o goto, sem esperar a
      // Compra terminar de carregar, reproduzia POST /compras/null/itens — o formulário
      // ficava interativo antes de compraStore.carregarCompraAtual() resolver. Não adicionar
      // wait/expect intermediário aqui de propósito, para manter a corrida coberta.
      await page.goto("/carrinho");
      await page.getByTestId("carrinho-item-extra-input").fill(nomeExtra);
      await page.getByTestId("carrinho-item-extra-add").click();

      const linha = page.getByTestId("carrinho-item").filter({ hasText: nomeExtra });
      await expect(linha).toBeVisible();
      await expect(linha).toContainText("⚡");
    });

    test("marcar item sem preço: valor inválido não confirma, valor válido marca comprado e atualiza subtotal/progresso (RN-03.1/03.2/03.3)", async ({
      page,
    }) => {
      await page.goto("/carrinho");
      const linha = page.getByTestId("carrinho-item").filter({ hasText: nomeExtra });
      const progressoAntes = await page.getByText(/\d+\/\d+ itens/).innerText();

      await linha.getByTestId("carrinho-item-digitar-preco").click();
      const input = linha.getByTestId("carrinho-item-input-preco");
      const confirmar = linha.getByTestId("carrinho-item-confirmar-preco");

      await input.fill("0");
      await expect(confirmar).toBeDisabled();

      await input.fill("5,90");
      await expect(confirmar).toBeEnabled();
      await confirmar.click();

      await expect(linha.getByTestId("carrinho-item-nome")).toHaveClass(/line-through/);
      await expect(linha.getByTestId("carrinho-item-preco")).toContainText("5,90");
      await expect(page.getByTestId("carrinho-subtotal")).toContainText("5,90");

      const progressoDepois = await page.getByText(/\d+\/\d+ itens/).innerText();
      expect(progressoDepois).not.toBe(progressoAntes);
    });

    test("desmarcar mantém preço salvo; reclicar remarca direto sem reabrir o editor", async ({ page }) => {
      await page.goto("/carrinho");
      const linha = page.getByTestId("carrinho-item").filter({ hasText: nomeExtra });
      const check = linha.getByTestId("carrinho-item-check");

      await check.click(); // desmarcar
      await expect(linha.getByTestId("carrinho-item-nome")).not.toHaveClass(/line-through/);
      await expect(linha.getByTestId("carrinho-item-preco")).toContainText("5,90");
      await expect(linha.getByTestId("carrinho-item-form-preco")).toHaveCount(0);

      await check.click(); // remarca sem pedir preço de novo
      await expect(linha.getByTestId("carrinho-item-nome")).toHaveClass(/line-through/);
    });

    test('"Finalizar Compra" navega para a rota stub da tela 2c (task 25)', async ({ page }) => {
      await page.goto("/carrinho");
      await page.getByTestId("cta-finalizar-compra").click();
      await expect(page).toHaveURL(/\/carrinho\/finalizar/);
    });
  });

  test.describe.serial("GPS e supermercado", () => {
    let compraId: string;

    test.afterAll(async ({ request }) => {
      if (compraId) {
        await request.post(`${BACKEND_URL}/compras/${compraId}/finalizar`, { headers: AUTH_HEADERS }).catch(() => undefined);
      }
    });

    test("badge mostra a sugestão de geocoding com GPS mockado (RN-03.5)", async ({ page, request, context }) => {
      // Regressão (2026-07-03): SupermercadoBadge só observava mudanças em `coords`; quando o
      // GPS mockado resolvia antes de compraStore.carregarCompraAtual() terminar, a sugestão
      // nunca era buscada de novo e o badge ficava travado em "Selecionar supermercado". Fixado
      // observando também compraEmAndamentoId — este teste (sem esperas manuais antes do assert
      // final) é o que cobre essa corrida.
      await garantirSemCompraEmAndamento(request);
      const criarCompra = await request.post(`${BACKEND_URL}/compras`, { headers: AUTH_HEADERS, data: {} });
      compraId = (await criarCompra.json()).id;

      await context.grantPermissions(["geolocation"]);
      await context.setGeolocation({ latitude: -23.5505, longitude: -46.6333 });

      await page.route(/\/geocoding\/reverse.*/, (route) =>
        route.fulfill({
          json: {
            encontrado: true,
            nomeSugerido: "Mercado Teste",
            enderecoFormatado: "Rua Teste, 123",
            latitude: -23.5505,
            longitude: -46.6333,
          },
        }),
      );

      await page.goto("/carrinho");
      await expect(page.getByTestId("carrinho-supermercado-badge")).toContainText("Mercado Teste");
    });

    test("troca manual de supermercado persiste após reload (RN-03.5)", async ({ page }) => {
      await page.goto("/carrinho");
      await page.getByTestId("carrinho-supermercado-badge").click();

      const nomeNovo = nomeUnico("Supermercado Manual");
      await page.getByTestId("carrinho-supermercado-novo-input").fill(nomeNovo);
      await page.getByTestId("carrinho-supermercado-novo-confirmar").click();
      await expect(page.getByTestId("carrinho-supermercado-badge")).toContainText(nomeNovo);

      await page.reload();
      await expect(page.getByTestId("carrinho-supermercado-badge")).toContainText(nomeNovo);
    });
  });

  test.describe.serial("GPS negado", () => {
    let compraId: string;

    test.afterAll(async ({ request }) => {
      if (compraId) {
        await request.post(`${BACKEND_URL}/compras/${compraId}/finalizar`, { headers: AUTH_HEADERS }).catch(() => undefined);
      }
    });

    test("sem permissão de GPS, a seleção manual de supermercado ainda funciona sem travar o fluxo (RN-03.6)", async ({
      page,
      request,
      context,
    }) => {
      await garantirSemCompraEmAndamento(request);
      const criarCompra = await request.post(`${BACKEND_URL}/compras`, { headers: AUTH_HEADERS, data: {} });
      compraId = (await criarCompra.json()).id;

      await context.clearPermissions();

      await page.goto("/carrinho");
      await expect(page.getByTestId("carrinho-supermercado-badge")).toContainText("Selecionar supermercado");

      await page.getByTestId("carrinho-supermercado-badge").click();
      const nomeNovo = nomeUnico("Supermercado Fallback");
      await page.getByTestId("carrinho-supermercado-novo-input").fill(nomeNovo);
      await page.getByTestId("carrinho-supermercado-novo-confirmar").click();
      await expect(page.getByTestId("carrinho-supermercado-badge")).toContainText(nomeNovo);
    });
  });

  test.describe.serial("Scanner — fallback de código manual", () => {
    let compraId: string;
    const nomeGenerico = nomeUnico("Carrinho Scan Item");

    test.afterAll(async ({ request }) => {
      if (compraId) {
        await request.post(`${BACKEND_URL}/compras/${compraId}/finalizar`, { headers: AUTH_HEADERS }).catch(() => undefined);
      }
    });

    test("vincular SKU via código digitado manualmente no scanner exibe o código e o editor de preço (RN-03.4/03.7)", async ({
      page,
      request,
    }) => {
      await garantirSemCompraEmAndamento(request);

      const criarDespensa = await request.post(`${BACKEND_URL}/despensa`, {
        headers: AUTH_HEADERS,
        data: { nome: nomeGenerico },
      });
      const itemDespensa = await criarDespensa.json();

      const codigoBarras = `999${Date.now()}`;
      const criarSku = await request.post(`${BACKEND_URL}/produtos-sku`, {
        headers: AUTH_HEADERS,
        data: { nome: `${nomeGenerico} Marca X`, produtoId: itemDespensa.produtoId, marca: "Marca X", codigoBarras },
      });
      expect(criarSku.status()).toBe(201);

      const criarCompra = await request.post(`${BACKEND_URL}/compras`, { headers: AUTH_HEADERS, data: {} });
      compraId = (await criarCompra.json()).id;

      await page.goto("/carrinho");
      const linha = page.getByTestId("carrinho-item").filter({ hasText: nomeGenerico });
      await expect(linha.getByTestId("carrinho-item-codigo")).toContainText("sem código escaneado");

      await linha.getByTestId("carrinho-item-escanear").click();
      await expect(page.getByTestId("scanner-modal")).toBeVisible();

      await page.getByTestId("scanner-codigo-manual").fill(codigoBarras);
      await page.getByTestId("scanner-confirmar-manual").click();

      await expect(page.getByTestId("scanner-modal")).toHaveCount(0);
      await expect(linha.getByTestId("carrinho-item-codigo")).toContainText(codigoBarras);
      // RN-03.7: vincular o SKU (achado ou não no histórico) sempre abre o editor de preço em seguida.
      await expect(linha.getByTestId("carrinho-item-form-preco")).toBeVisible();
    });
  });
});
