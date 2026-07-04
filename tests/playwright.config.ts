import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Mesmo token que o backend usa para autenticar a si mesmo (API_BEARER_TOKEN
// no .env do backend) — os testes precisam enviá-lo em toda requisição.
loadEnv({ path: path.resolve(__dirname, "../backend/.env") });

const backendURL = process.env.BACKEND_URL ?? "http://localhost:3333";
const frontendURL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const bearerToken = process.env.API_BEARER_TOKEN;
if (!bearerToken) {
  throw new Error(
    "API_BEARER_TOKEN não encontrado em backend/.env — necessário para autenticar os testes.",
  );
}

const repoRoot = path.resolve(__dirname, "..");

// Sessão do frontend salva uma vez pelo projeto "ui-setup" e reaproveitada
// pelos specs autenticados (project "ui-app") — evita logar de novo a cada teste.
const authFile = path.resolve(__dirname, "ui/.auth/user.json");

export default defineConfig({
  // Testes de API e de UI compartilham um único banco Postgres com estado
  // (ex: só pode existir uma Compra em andamento por vez) — rodar em série
  // evita flakiness entre projects/specs.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: require.resolve("./global-setup.ts"),
  webServer: [
    {
      command: "npm run dev --workspace=backend",
      cwd: repoRoot,
      url: `${backendURL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run dev --workspace=frontend",
      cwd: repoRoot,
      url: frontendURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "api",
      testDir: "./api",
      use: {
        baseURL: backendURL,
        extraHTTPHeaders: { Authorization: `Bearer ${bearerToken}` },
      },
    },
    {
      name: "ui-setup",
      testDir: "./ui",
      testMatch: /auth\.setup\.ts/,
      use: { baseURL: frontendURL, ...devices["Desktop Chrome"] },
    },
    {
      // Fluxos de login/guard precisam de um contexto sem sessão salva —
      // roda à parte, sem depender do ui-setup e sem storageState.
      name: "ui-login",
      testDir: "./ui",
      testMatch: /login\.spec\.ts/,
      use: { baseURL: frontendURL, ...devices["Desktop Chrome"] },
    },
    {
      name: "ui-app",
      testDir: "./ui",
      testMatch: /(home|despensa|carrinho)\.spec\.ts/,
      use: { baseURL: frontendURL, ...devices["Desktop Chrome"], storageState: authFile },
      dependencies: ["ui-setup"],
    },
  ],
});
