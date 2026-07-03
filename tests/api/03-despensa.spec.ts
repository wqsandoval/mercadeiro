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

test.describe("Despensa — genérico vs SKU", () => {
  test("adicionar por nome com tipo=SKU cria o genérico e o SKU, agrupado pela categoria do genérico", async ({
    request,
  }) => {
    const nomeGenerico = nomeUnico("Leite");
    const nomeSku = `${nomeGenerico} Elegê Semidesnatado`;

    const res = await request.post("/despensa", {
      data: { nome: nomeSku, tipo: "SKU", produtoGenericoNome: nomeGenerico, marca: "Elegê" },
    });
    expect(res.status()).toBe(201);
    const item = await res.json();
    expect(item.produto).toBeNull();
    expect(item.produtoSku.nome).toBe(nomeSku);
    expect(item.produtoSku.produto.nome).toBe(nomeGenerico);

    const despensa = await request.get("/despensa");
    const grupoOutros = (await despensa.json()).find(
      (g: { categoria: { nome: string } }) => g.categoria.nome === "Outros",
    );
    expect(grupoOutros.itens.map((i: { id: string }) => i.id)).toContain(item.id);

    await request.delete(`/despensa/${item.id}`);
  });

  test("Regra 4.1 no nível SKU: adicionar o mesmo SKU duas vezes soma quantidade", async ({ request }) => {
    const nomeGenerico = nomeUnico("Iogurte");
    const nomeSku = `${nomeGenerico} Danone Natural`;

    const primeira = await request.post("/despensa", {
      data: { nome: nomeSku, tipo: "SKU", produtoGenericoNome: nomeGenerico, quantidade: 2 },
    });
    const item = await primeira.json();

    const segunda = await request.post("/despensa", {
      data: { produtoSkuId: item.produtoSkuId, quantidade: 3 },
    });
    expect(segunda.status()).toBe(201);
    const itemSomado = await segunda.json();
    expect(itemSomado.id).toBe(item.id);
    expect(itemSomado.quantidade).toBe(5);

    await request.delete(`/despensa/${item.id}`);
  });

  test("item genérico e item SKU do mesmo genérico ficam em linhas distintas", async ({ request }) => {
    const nomeGenerico = nomeUnico("Queijo");
    const nomeSku = `${nomeGenerico} Polenghi Mussarela`;

    const generico = await request.post("/despensa", { data: { nome: nomeGenerico } });
    expect(generico.status()).toBe(201);
    const itemGenerico = await generico.json();

    const sku = await request.post("/despensa", {
      data: { nome: nomeSku, tipo: "SKU", produtoGenericoNome: nomeGenerico },
    });
    expect(sku.status()).toBe(201);
    const itemSku = await sku.json();

    expect(itemSku.id).not.toBe(itemGenerico.id);
    expect(itemSku.produtoSku.produtoId).toBe(itemGenerico.produtoId);

    await request.delete(`/despensa/${itemGenerico.id}`);
    await request.delete(`/despensa/${itemSku.id}`);
  });

  test("400 ao informar produtoId e produtoSkuId juntos, ou nenhum dos dois", async ({ request }) => {
    const ambosPreenchidos = await request.post("/despensa", {
      data: { produtoId: "id-qualquer", produtoSkuId: "outro-id-qualquer" },
    });
    expect(ambosPreenchidos.status()).toBe(400);

    const nenhumPreenchido = await request.post("/despensa", { data: { quantidade: 1 } });
    expect(nenhumPreenchido.status()).toBe(400);
  });
});
