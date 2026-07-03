import { test, expect } from "@playwright/test";
import { nomeUnico } from "./helpers";

test.describe("Categorias", () => {
  test("lista categorias seedadas, ordenadas, incluindo fallback Outros", async ({ request }) => {
    const res = await request.get("/categorias");
    expect(res.status()).toBe(200);

    const categorias = await res.json();
    expect(categorias.length).toBeGreaterThan(0);
    expect(categorias.some((c: { nome: string }) => c.nome === "Outros")).toBe(true);

    const ordens = categorias.map((c: { ordem: number }) => c.ordem);
    expect(ordens).toEqual([...ordens].sort((a, b) => a - b));
  });

  test("cria categoria e busca por id", async ({ request }) => {
    const nome = nomeUnico("Categoria Teste");

    const criar = await request.post("/categorias", { data: { nome } });
    expect(criar.status()).toBe(201);
    const categoria = await criar.json();
    expect(categoria.nome).toBe(nome);

    const buscar = await request.get(`/categorias/${categoria.id}`);
    expect(buscar.status()).toBe(200);
    expect((await buscar.json()).nome).toBe(nome);
  });

  test("404 ao buscar categoria inexistente", async ({ request }) => {
    const res = await request.get("/categorias/id-inexistente");
    expect(res.status()).toBe(404);
  });

  test("400 ao criar categoria sem nome", async ({ request }) => {
    const res = await request.post("/categorias", { data: {} });
    expect(res.status()).toBe(400);
  });
});
