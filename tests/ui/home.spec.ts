import { test, expect } from "@playwright/test";
import { nomeUnico } from "../api/helpers";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3333";
const TOKEN = process.env.API_BEARER_TOKEN!;
const AUTH_HEADERS = { Authorization: `Bearer ${TOKEN}` };

test.describe("Home", () => {
  test("mostra saudação e o CTA de iniciar compra", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite)!$/ })).toBeVisible();
    await expect(page.getByTestId("cta-iniciar-compra")).toBeVisible();
  });

  test("card Despensa reflete itens reais da API (RN-01.1)", async ({ page, request }) => {
    const antes = await request.get(`${BACKEND_URL}/despensa`, { headers: AUTH_HEADERS });
    const totalAntes = (await antes.json()).flatMap((g: { itens: unknown[] }) => g.itens).length;

    const nome = nomeUnico("UI Home Item");
    const criar = await request.post(`${BACKEND_URL}/despensa`, {
      headers: AUTH_HEADERS,
      data: { nome, quantidade: 1 },
    });
    expect(criar.status()).toBe(201);

    await page.goto("/");
    await expect(page.getByTestId("despensa-count")).toHaveText(String(totalAntes + 1));
  });

  test("card Analítico mostra o gasto do mês formatado em R$", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("analitico-total")).toContainText("R$");
  });

  test("CTA Iniciar Compra cria e, num segundo clique, retoma a mesma Compra (RN-02.4)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cta-iniciar-compra").click();
    await page.waitForURL(/\/carrinho/);
    const idPrimeiroClique = await page.getByTestId("carrinho-compra-id").innerText();
    expect(idPrimeiroClique).toBeTruthy();

    await page.goto("/");
    await page.getByTestId("cta-iniciar-compra").click();
    await page.waitForURL(/\/carrinho/);
    const idSegundoClique = await page.getByTestId("carrinho-compra-id").innerText();

    expect(idSegundoClique).toBe(idPrimeiroClique);
  });
});
