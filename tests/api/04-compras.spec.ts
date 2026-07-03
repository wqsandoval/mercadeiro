import { test, expect } from "@playwright/test";
import { nomeUnico } from "./helpers";

test.describe.serial("Sessão de Compra", () => {
  const produtoPlanejadoComprado = nomeUnico("Planejado Comprado");
  const produtoPlanejadoPendente = nomeUnico("Planejado Pendente");
  const produtoExtraComprado = nomeUnico("Extra Comprado");
  const produtoExtraDescartado = nomeUnico("Extra Descartado");

  let compraId: string;
  let itemPlanejadoCompradoId: string;
  let itemPlanejadoPendenteId: string;

  test.afterAll(async ({ request }) => {
    // Garante que nenhuma Compra fique em andamento para não afetar outras specs (RN-02.4).
    if (compraId) {
      await request.post(`/compras/${compraId}/finalizar`).catch(() => undefined);
    }
  });

  test("popula a Despensa com dois itens planejados", async ({ request }) => {
    const a = await request.post("/despensa", { data: { nome: produtoPlanejadoComprado } });
    const b = await request.post("/despensa", { data: { nome: produtoPlanejadoPendente } });
    expect(a.status()).toBe(201);
    expect(b.status()).toBe(201);
  });

  test("POST /compras cria sessão copiando a Despensa sem removê-la (RN-02.3)", async ({ request }) => {
    const res = await request.post("/compras", { data: {} });
    expect(res.status()).toBe(201);
    const compra = await res.json();
    // Atribuído antes das asserções abaixo: se uma delas falhar, o afterAll ainda
    // consegue finalizar a Compra e não deixa uma sessão órfã pra outros specs.
    compraId = compra.id;
    expect(compra.status).toBe("EM_ANDAMENTO");
    expect(compra.itens).toHaveLength(2);
    expect(compra.itens.every((i: { origem: string; comprado: boolean }) => i.origem === "PLANEJADO" && !i.comprado)).toBe(true);

    itemPlanejadoCompradoId = compra.itens.find(
      (i: { produto: { nome: string } }) => i.produto.nome === produtoPlanejadoComprado,
    ).id;
    itemPlanejadoPendenteId = compra.itens.find(
      (i: { produto: { nome: string } }) => i.produto.nome === produtoPlanejadoPendente,
    ).id;

    const despensa = await request.get("/despensa");
    const nomesNaDespensa = (await despensa.json())
      .flatMap((g: { itens: { produto: { nome: string } } [] }) => g.itens)
      .map((i: { produto: { nome: string } }) => i.produto.nome);
    expect(nomesNaDespensa).toContain(produtoPlanejadoComprado);
    expect(nomesNaDespensa).toContain(produtoPlanejadoPendente);
  });

  test("RN-02.4: iniciar outra Compra retoma a existente em vez de criar uma nova", async ({ request }) => {
    const res = await request.post("/compras", { data: {} });
    expect(res.status()).toBe(200);
    expect((await res.json()).id).toBe(compraId);
  });

  test("RN-03.1: marcar item comprado sem preço é rejeitado", async ({ request }) => {
    const res = await request.patch(`/compras/${compraId}/itens/${itemPlanejadoCompradoId}`, {
      data: { comprado: true },
    });
    expect(res.status()).toBe(400);
  });

  test("marcar item comprado com preço é aceito", async ({ request }) => {
    const res = await request.patch(`/compras/${compraId}/itens/${itemPlanejadoCompradoId}`, {
      data: { comprado: true, precoUnitario: 9.9 },
    });
    expect(res.status()).toBe(200);
    const item = await res.json();
    expect(item.comprado).toBe(true);
    expect(Number(item.precoUnitario)).toBe(9.9);
  });

  test("desmarcar item mantém o preço salvo", async ({ request }) => {
    const desmarcar = await request.patch(`/compras/${compraId}/itens/${itemPlanejadoCompradoId}`, {
      data: { comprado: false },
    });
    expect(desmarcar.status()).toBe(200);
    const item = await desmarcar.json();
    expect(item.comprado).toBe(false);
    expect(Number(item.precoUnitario)).toBe(9.9);

    // Remarca para o cenário de finalização abaixo.
    await request.patch(`/compras/${compraId}/itens/${itemPlanejadoCompradoId}`, {
      data: { comprado: true },
    });
  });

  test("adiciona item extra comprado e um extra descartado (RN-05.1)", async ({ request }) => {
    const extraComprado = await request.post(`/compras/${compraId}/itens`, {
      data: { nome: produtoExtraComprado },
    });
    expect(extraComprado.status()).toBe(201);
    const itemExtraComprado = await extraComprado.json();
    expect(itemExtraComprado.origem).toBe("EXTRA");

    const marcar = await request.patch(`/compras/${compraId}/itens/${itemExtraComprado.id}`, {
      data: { comprado: true, precoUnitario: 5 },
    });
    expect(marcar.status()).toBe(200);

    const extraDescartado = await request.post(`/compras/${compraId}/itens`, {
      data: { nome: produtoExtraDescartado },
    });
    expect(extraDescartado.status()).toBe(201);
    // Fica não comprado de propósito — deve ser descartado silenciosamente ao finalizar.
  });

  test("stepper de quantidade remove item extra ao chegar a zero", async ({ request }) => {
    const criar = await request.post(`/compras/${compraId}/itens`, {
      data: { nome: nomeUnico("Extra Removido Via Stepper") },
    });
    const item = await criar.json();

    const remover = await request.patch(`/compras/${compraId}/itens/${item.id}/quantidade`, {
      data: { delta: -1 },
    });
    expect(remover.status()).toBe(200);
    expect(await remover.json()).toEqual({ removido: true, id: item.id });
  });

  test("POST /compras/:id/finalizar aplica os três blocos (RN-05.1 a RN-05.4)", async ({ request }) => {
    const res = await request.post(`/compras/${compraId}/finalizar`);
    expect(res.status()).toBe(200);
    const compra = await res.json();
    expect(compra.status).toBe("FINALIZADA");
    expect(compra.finalizadaEm).toBeTruthy();

    const despensa = await request.get("/despensa");
    const nomesNaDespensa = (await despensa.json())
      .flatMap((g: { itens: { produto: { nome: string } } [] }) => g.itens)
      .map((i: { produto: { nome: string } }) => i.produto.nome);

    // Comprado planejado sai da despensa.
    expect(nomesNaDespensa).not.toContain(produtoPlanejadoComprado);
    // Não comprado planejado permanece na despensa.
    expect(nomesNaDespensa).toContain(produtoPlanejadoPendente);
    // Extra nunca entra na despensa, comprado ou não.
    expect(nomesNaDespensa).not.toContain(produtoExtraComprado);
    expect(nomesNaDespensa).not.toContain(produtoExtraDescartado);
  });

  test("RN-05.4: compra finalizada é somente leitura", async ({ request }) => {
    const editar = await request.patch(`/compras/${compraId}/itens/${itemPlanejadoPendenteId}`, {
      data: { comprado: true, precoUnitario: 1 },
    });
    expect(editar.status()).toBe(409);

    const adicionarItem = await request.post(`/compras/${compraId}/itens`, {
      data: { nome: nomeUnico("Item Pos Finalizacao") },
    });
    expect(adicionarItem.status()).toBe(409);

    const finalizarDeNovo = await request.post(`/compras/${compraId}/finalizar`);
    expect(finalizarDeNovo.status()).toBe(409);
  });
});
