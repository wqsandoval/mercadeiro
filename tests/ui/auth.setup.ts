import path from "node:path";
import { test as setup } from "@playwright/test";

const authFile = path.resolve(__dirname, ".auth/user.json");

// Loga uma vez colando o token na tela de login (fluxo real do usuário) e
// salva a sessão (localStorage) em disco — os specs do project "ui-app"
// reaproveitam esse arquivo via `use.storageState`, sem logar de novo.
setup("autenticar e salvar sessão", async ({ page }) => {
  const token = process.env.API_BEARER_TOKEN;
  if (!token) throw new Error("API_BEARER_TOKEN não definido no ambiente do teste");

  await page.goto("/login");
  await page.getByPlaceholder("Token de acesso").fill(token);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await page.context().storageState({ path: authFile });
});
