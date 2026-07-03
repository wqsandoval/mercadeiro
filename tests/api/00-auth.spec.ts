import { test, expect } from "@playwright/test";

test.describe("Autenticação (bearer token)", () => {
  // Sobrescreve o Authorization padrão da config para simular um cliente sem token.
  test.use({ extraHTTPHeaders: {} });

  test("GET /health não exige token", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
  });


  const routes = ["/categorias", "/produtos", "/despensa", "/supermercados", "/analitico"];

  for (const route of routes) {
  test(`401 ao chamar ${route} sem Authorization`, async ({ request }) => {
    const res = await request.get(route);
    expect(res.status()).toBe(401);
    expect(res.headers()["www-authenticate"]).toBe("Bearer");
    expect((await res.json()).error).toBeTruthy();
  });

  test(`401 ao chamar ${route} com token inválido`, async ({ request }) => {
    const res = await request.get(route, {
      headers: { Authorization: "Bearer token-invalido" },
    });
    expect(res.status()).toBe(401);
  });

  test(`200 ao chamar ${route} com o token configurado em API_BEARER_TOKEN`, async ({ request }) => {
    const res = await request.get(route, {
      headers: { Authorization: `Bearer ${process.env.API_BEARER_TOKEN}` },
    });
    expect(res.status()).toBe(200);
  });
}
});
