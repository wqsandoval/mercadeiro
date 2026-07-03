import { test, expect } from "@playwright/test";
import { nomeUnico } from "./helpers";

test.describe.serial("Despensa", () => {
  const nomeItem = nomeUnico("Item Despensa");
  let itemId: string;

  test("adiciona item novo com quantidade padrão", async ({ request }) => {
    const res = await request.post("/despensa", { data: { nome: nomeItem, quantidade: 2 } });
    expect(res.status()).toBe(201);
    const item = await res.json();
    expect(item.quantidade).toBe(2);
    expect(item.produto.nome).toBe(nomeItem);
    itemId = item.id;
  });

  test("Regra 4.1: adicionar mesmo item soma quantidade em vez de duplicar", async ({ request }) => {
    const res = await request.post("/despensa", { data: { nome: nomeItem, quantidade: 3 } });
    expect(res.status()).toBe(201);
    const item = await res.json();
    expect(item.id).toBe(itemId);
    expect(item.quantidade).toBe(5);
  });

  test("RN-02.2: lista agrupada por categoria contém o item", async ({ request }) => {
    const res = await request.get("/despensa");
    expect(res.status()).toBe(200);
    const grupos = await res.json();
    const encontrado = grupos.flatMap((g: { itens: { id: string }[] }) => g.itens).find(
      (i: { id: string }) => i.id === itemId,
    );
    expect(encontrado).toBeTruthy();
    expect(encontrado.quantidade).toBe(5);
  });

  test("decrementa quantidade via delta", async ({ request }) => {
    const res = await request.patch(`/despensa/${itemId}/quantidade`, { data: { delta: -4 } });
    expect(res.status()).toBe(200);
    expect((await res.json()).quantidade).toBe(1);
  });

  test("RN-02.1: decrementar de 1 remove o item da lista", async ({ request }) => {
    const res = await request.patch(`/despensa/${itemId}/quantidade`, { data: { delta: -1 } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ removido: true, id: itemId });

    const busca = await request.get("/despensa");
    const restante = (await busca.json())
      .flatMap((g: { itens: { id: string }[] }) => g.itens)
      .find((i: { id: string }) => i.id === itemId);
    expect(restante).toBeUndefined();
  });

  test("DELETE remove item imediatamente, sem confirmação", async ({ request }) => {
    const criar = await request.post("/despensa", { data: { nome: nomeUnico("Item Para Remover") } });
    const item = await criar.json();

    const remover = await request.delete(`/despensa/${item.id}`);
    expect(remover.status()).toBe(204);

    const buscarNovamente = await request.delete(`/despensa/${item.id}`);
    expect(buscarNovamente.status()).toBe(404);
  });

  test("regressão: DELETE com Content-Type application/json e corpo vazio não retorna 500", async ({
    request,
  }) => {
    // Bug real (2026-07-03): o cliente HTTP do frontend mandava Content-Type:
    // application/json mesmo sem corpo; o Fastify rejeita isso (corpo vazio +
    // esse header é inválido) e o error handler mascarava como 500 genérico
    // em vez de refletir o statusCode 4xx que o próprio Fastify já calcula.
    // O botão "✕ remover" da Despensa silenciosamente não funcionava por causa disso.
    const criar = await request.post("/despensa", { data: { nome: nomeUnico("Item Regressao Delete") } });
    const item = await criar.json();

    const remover = await request.fetch(`/despensa/${item.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    expect(remover.status()).toBe(400);
    expect(remover.status()).not.toBe(500);
    expect((await remover.json()).error).toBeTruthy();

    // A requisição malformada não remove o item de verdade — limpa para não
    // vazar estado para outros specs (ex: contagem de itens em 04-compras).
    await request.delete(`/despensa/${item.id}`);
  });
});
