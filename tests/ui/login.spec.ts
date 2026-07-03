import { test, expect, type Page } from "@playwright/test";

const TOKEN = process.env.API_BEARER_TOKEN!;

async function login(page: Page, token: string) {
  await page.goto("/login");
  await page.getByPlaceholder("Token de acesso").fill(token);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.describe("Login e guard de rota", () => {
  test("acessar a Home sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Mercadeiro" })).toBeVisible();
  });

  test("token inválido mostra mensagem de erro e não navega", async ({ page }) => {
    await login(page, "token-claramente-invalido");
    await expect(page.getByText("Token inválido.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("token válido navega para a Home e a sessão sobrevive a um reload", async ({ page }) => {
    await login(page, TOKEN);
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByTestId("despensa-count")).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("despensa-count")).toBeVisible();
  });

  test("acessar /login já autenticado redireciona direto para a Home", async ({ page }) => {
    await login(page, TOKEN);
    await page.waitForURL((url) => url.pathname === "/");

    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);
  });
});
