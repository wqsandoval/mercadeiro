import { test, expect } from "@playwright/test";
import { nomeUnico } from "../api/helpers";

test.describe("Despensa", () => {
  test("card Despensa na Home navega para /despensa", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("card-despensa").click();
    await expect(page).toHaveURL(/\/despensa/);
    await expect(page.getByRole("heading", { name: "Despensa" })).toBeVisible();
  });

  test("adiciona item novo via input rápido", async ({ page }) => {
    const nome = nomeUnico("UI Despensa Item");
    await page.goto("/despensa");
    await page.getByTestId("despensa-input").fill(nome);
    await page.getByTestId("despensa-add").click();
    await expect(page.getByTestId("despensa-item").filter({ hasText: nome })).toBeVisible();
  });

  test("Regra 4.1: adicionar o mesmo nome de novo soma quantidade em vez de duplicar linha", async ({
    page,
  }) => {
    const nome = nomeUnico("UI Despensa Dedupe");
    await page.goto("/despensa");
    const linha = page.getByTestId("despensa-item").filter({ hasText: nome });

    await page.getByTestId("despensa-input").fill(nome);
    await page.getByTestId("despensa-add").click();
    await expect(linha).toHaveCount(1);

    await page.getByTestId("despensa-input").fill(nome);
    await page.getByTestId("despensa-add").click();
    await expect(linha).toHaveCount(1);
    await expect(linha.getByLabel("Quantidade", { exact: true })).toHaveValue("2");
  });

  test("stepper incrementa e decrementa a quantidade", async ({ page }) => {
    const nome = nomeUnico("UI Despensa Stepper");
    await page.goto("/despensa");
    await page.getByTestId("despensa-input").fill(nome);
    await page.getByTestId("despensa-add").click();

    const linha = page.getByTestId("despensa-item").filter({ hasText: nome });
    await linha.getByLabel("Aumentar quantidade").click();
    await expect(linha.getByLabel("Quantidade", { exact: true })).toHaveValue("2");

    await linha.getByLabel("Diminuir quantidade").click();
    await expect(linha.getByLabel("Quantidade", { exact: true })).toHaveValue("1");
  });

  test("digitar a quantidade diretamente atualiza o item (sem precisar clicar em + várias vezes)", async ({
    page,
  }) => {
    const nome = nomeUnico("UI Despensa Digitar Qtd");
    await page.goto("/despensa");
    await page.getByTestId("despensa-input").fill(nome);
    await page.getByTestId("despensa-add").click();

    const linha = page.getByTestId("despensa-item").filter({ hasText: nome });
    const campoQtd = linha.getByLabel("Quantidade", { exact: true });
    await campoQtd.fill("25");
    await campoQtd.blur();
    await expect(campoQtd).toHaveValue("25");

    // Persiste de verdade na API, não só no estado local do componente.
    await page.reload();
    await expect(linha.getByLabel("Quantidade", { exact: true })).toHaveValue("25");
  });

  test("digitar 0 na quantidade remove o item (mesmo comportamento do stepper, RN-02.1)", async ({
    page,
  }) => {
    const nome = nomeUnico("UI Despensa Digitar Zero");
    await page.goto("/despensa");
    await page.getByTestId("despensa-input").fill(nome);
    await page.getByTestId("despensa-add").click();

    const linha = page.getByTestId("despensa-item").filter({ hasText: nome });
    await linha.getByLabel("Quantidade", { exact: true }).fill("0");
    await linha.getByLabel("Quantidade", { exact: true }).blur();
    await expect(linha).toHaveCount(0);
  });

  test("RN-02.1: decrementar de 1 remove o item da lista", async ({ page }) => {
    const nome = nomeUnico("UI Despensa Remover Stepper");
    await page.goto("/despensa");
    await page.getByTestId("despensa-input").fill(nome);
    await page.getByTestId("despensa-add").click();

    const linha = page.getByTestId("despensa-item").filter({ hasText: nome });
    await expect(linha).toBeVisible();
    await linha.getByLabel("Diminuir quantidade").click();
    await expect(linha).toHaveCount(0);
  });

  test("regressão: botão ✕ remove o item imediatamente", async ({ page }) => {
    // Bug real (2026-07-03): o cliente HTTP mandava Content-Type: application/json
    // mesmo sem corpo no DELETE; o Fastify rejeitava e o error handler mascarava
    // como 500, então o clique no ✕ não removia nada e falhava silenciosamente.
    const nome = nomeUnico("UI Despensa Remover Botao");
    await page.goto("/despensa");
    await page.getByTestId("despensa-input").fill(nome);
    await page.getByTestId("despensa-add").click();

    const linha = page.getByTestId("despensa-item").filter({ hasText: nome });
    await expect(linha).toBeVisible();
    await linha.getByLabel("Remover item").click();
    await expect(linha).toHaveCount(0);
  });

  test("CTA Ir para o Carrinho navega sem remover itens da Despensa (RN-02.3)", async ({ page }) => {
    const nome = nomeUnico("UI Despensa Vai Pro Carrinho");
    await page.goto("/despensa");
    await page.getByTestId("despensa-input").fill(nome);
    await page.getByTestId("despensa-add").click();
    await expect(page.getByTestId("despensa-item").filter({ hasText: nome })).toBeVisible();

    await page.getByTestId("cta-ir-para-carrinho").click();
    await expect(page).toHaveURL(/\/carrinho/);

    await page.goto("/despensa");
    await expect(page.getByTestId("despensa-item").filter({ hasText: nome })).toBeVisible();
  });
});
