import { test, expect } from "@playwright/test";
import { nomeUnico } from "./helpers";

test.describe.serial("Supermercados", () => {
  const nome = nomeUnico("Supermercado Teste");
  const endereco = "Rua das Flores, 123";
  let supermercadoId: string;

  test("cria supermercado", async ({ request }) => {
    const res = await request.post("/supermercados", { data: { nome, endereco } });
    expect(res.status()).toBe(201);
    supermercadoId = (await res.json()).id;
  });

  test("dedupe: criar com mesmo nome+endereço reaproveita o registro", async ({ request }) => {
    const res = await request.post("/supermercados", { data: { nome, endereco } });
    expect(res.status()).toBe(200);
    expect((await res.json()).id).toBe(supermercadoId);
  });

  test("lista supermercados inclui o criado", async ({ request }) => {
    const res = await request.get("/supermercados");
    expect(res.status()).toBe(200);
    const lista = await res.json();
    expect(lista.some((s: { id: string }) => s.id === supermercadoId)).toBe(true);
  });

  test("histórico de preço vazio para supermercado sem compras", async ({ request }) => {
    const res = await request.get(`/supermercados/${supermercadoId}/historico`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("remove supermercado sem vínculos", async ({ request }) => {
    const remover = await request.delete(`/supermercados/${supermercadoId}`);
    expect(remover.status()).toBe(204);

    const buscar = await request.get(`/supermercados/${supermercadoId}`);
    expect(buscar.status()).toBe(404);
  });
});
