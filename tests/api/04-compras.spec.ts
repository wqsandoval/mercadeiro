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

test.describe.serial("Sessão de Compra — SKU", () => {
  const nomeGenericoLeite = nomeUnico("Leite SKU Compra");
  const skuElege = `${nomeGenericoLeite} Elegê`;
  const skuPiracanjuba = `${nomeGenericoLeite} Piracanjuba`;

  let compraId: string;
  let produtoIdGenericoLeite: string;
  let itemElegeId: string;

  test.afterAll(async ({ request }) => {
    if (compraId) {
      await request.post(`/compras/${compraId}/finalizar`).catch(() => undefined);
    }
  });

  test("duas SKUs diferentes do mesmo genérico coexistem como linhas separadas na mesma Compra", async ({
    request,
  }) => {
    const criarCompra = await request.post("/compras", { data: {} });
    expect(criarCompra.status()).toBe(201);
    compraId = (await criarCompra.json()).id;

    const item1 = await request.post(`/compras/${compraId}/itens`, {
      data: { nome: skuElege, tipo: "SKU", produtoGenericoNome: nomeGenericoLeite },
    });
    expect(item1.status()).toBe(201);
    const itemElege = await item1.json();
    itemElegeId = itemElege.id;
    produtoIdGenericoLeite = itemElege.produtoId;

    const item2 = await request.post(`/compras/${compraId}/itens`, {
      data: { nome: skuPiracanjuba, tipo: "SKU", produtoGenericoNome: nomeGenericoLeite },
    });
    expect(item2.status()).toBe(201);
    const itemPiracanjuba = await item2.json();

    expect(itemPiracanjuba.id).not.toBe(itemElege.id);
    expect(itemPiracanjuba.produtoId).toBe(produtoIdGenericoLeite);
  });

  test("item extra sem SKU repetido ainda soma quantidade (não duplica linha)", async ({ request }) => {
    const nomeExtra = nomeUnico("Extra Sem Sku Repetido");
    const primeira = await request.post(`/compras/${compraId}/itens`, { data: { nome: nomeExtra, quantidade: 1 } });
    const item = await primeira.json();

    const segunda = await request.post(`/compras/${compraId}/itens`, { data: { nome: nomeExtra, quantidade: 2 } });
    expect(segunda.status()).toBe(201);
    const itemSomado = await segunda.json();
    expect(itemSomado.id).toBe(item.id);
    expect(itemSomado.quantidade).toBe(3);
  });

  test("POST .../sku vincula SKU existente por produtoSkuId e retorna preço sugerido", async ({ request }) => {
    const nomeGenericoArroz = nomeUnico("Arroz SKU Compra");
    const criarSku = await request.post("/produtos-sku", {
      data: { nome: `${nomeGenericoArroz} Tio João`, produtoGenericoNome: nomeGenericoArroz },
    });
    const skuArroz = await criarSku.json();

    const itemExtra = await request.post(`/compras/${compraId}/itens`, { data: { produtoId: skuArroz.produtoId } });
    const item = await itemExtra.json();
    expect(item.produtoSkuId).toBeNull();

    const vincular = await request.post(`/compras/${compraId}/itens/${item.id}/sku`, {
      data: { produtoSkuId: skuArroz.id },
    });
    expect(vincular.status()).toBe(200);
    const resultado = await vincular.json();
    expect(resultado.item.produtoSkuId).toBe(skuArroz.id);
    expect(resultado.precoSugerido).toBeNull();

    const desvincular = await request.delete(`/compras/${compraId}/itens/${item.id}/sku`);
    expect(desvincular.status()).toBe(204);
  });

  test("POST .../sku por código de barras desconhecido sem nome retorna 404", async ({ request }) => {
    const res = await request.post(`/compras/${compraId}/itens/${itemElegeId}/sku`, {
      data: { codigoBarras: `000${Date.now()}` },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).details).toEqual({ codigoBarrasDesconhecido: true });
  });

  test("POST .../sku por código de barras desconhecido com nome cria um SKU novo", async ({ request }) => {
    const codigoBarras = `111${Date.now()}`;
    const res = await request.post(`/compras/${compraId}/itens/${itemElegeId}/sku`, {
      data: { codigoBarras, nome: skuElege, marca: "Elegê" },
    });
    expect(res.status()).toBe(200);
    const resultado = await res.json();
    expect(resultado.item.produtoSkuId).toBeTruthy();
    expect(resultado.item.produtoSku.codigoBarras).toBe(codigoBarras);
  });

  test("POST .../sku rejeita SKU de um genérico diferente do item (400)", async ({ request }) => {
    const outroGenerico = nomeUnico("Outro Genérico SKU Compra");
    const criarSkuErrado = await request.post("/produtos-sku", {
      data: { nome: nomeUnico("SKU De Outro Genérico"), produtoGenericoNome: outroGenerico },
    });
    const skuErrado = await criarSkuErrado.json();

    const res = await request.post(`/compras/${compraId}/itens/${itemElegeId}/sku`, {
      data: { produtoSkuId: skuErrado.id },
    });
    expect(res.status()).toBe(400);
  });

  test("finalizar grava PrecoHistorico.produtoSkuId para item comprado com SKU vinculado", async ({ request }) => {
    await request.patch(`/compras/${compraId}/itens/${itemElegeId}`, {
      data: { comprado: true, precoUnitario: 8.5 },
    });

    // Zera os demais itens da Compra para não travar a asserção do subtotal em outros specs.
    const compraAntes = await (await request.get(`/compras/${compraId}`)).json();
    for (const item of compraAntes.itens) {
      if (item.id !== itemElegeId && !item.comprado) {
        await request.delete(`/compras/${compraId}/itens/${item.id}`).catch(() => undefined);
      }
    }

    const finalizar = await request.post(`/compras/${compraId}/finalizar`);
    expect(finalizar.status()).toBe(200);

    const itemFinal = (await finalizar.json()).itens.find((i: { id: string }) => i.id === itemElegeId);
    const precosDoSku = await (await request.get(`/produtos-sku/${itemFinal.produtoSkuId}/precos`)).json();
    expect(precosDoSku.ultimoPreco).toBe(8.5);
  });
});

test.describe.serial("Sessão de Compra — item planejado SKU mantém o vínculo ao voltar para a Despensa", () => {
  let compraId: string;

  test.afterAll(async ({ request }) => {
    if (compraId) {
      await request.post(`/compras/${compraId}/finalizar`).catch(() => undefined);
    }
  });

  test("item planejado SKU não comprado volta para a Despensa vinculado ao mesmo SKU", async ({ request }) => {
    const nomeGenerico = nomeUnico("Manteiga SKU Despensa");
    const nomeSku = `${nomeGenerico} Aviação`;

    const adicionarNaDespensa = await request.post("/despensa", {
      data: { nome: nomeSku, tipo: "SKU", produtoGenericoNome: nomeGenerico },
    });
    expect(adicionarNaDespensa.status()).toBe(201);
    const skuId = (await adicionarNaDespensa.json()).produtoSkuId;

    const criarCompra = await request.post("/compras", { data: {} });
    compraId = (await criarCompra.json()).id;

    const finalizar = await request.post(`/compras/${compraId}/finalizar`);
    expect(finalizar.status()).toBe(200);

    const despensa = await request.get("/despensa");
    const itemNaDespensa = (await despensa.json())
      .flatMap((g: { itens: { produtoSkuId: string | null }[] }) => g.itens)
      .find((i: { produtoSkuId: string | null }) => i.produtoSkuId === skuId);
    expect(itemNaDespensa).toBeTruthy();

    await request.delete(`/despensa/${itemNaDespensa.id}`);
  });
});

test.describe.serial("Sessão de Compra — item genérico da Despensa satisfeito por SKU via scan", () => {
  let compraId: string;

  test.afterAll(async ({ request }) => {
    if (compraId) {
      await request.post(`/compras/${compraId}/finalizar`).catch(() => undefined);
    }
  });

  test("adicionar genérico na Despensa, ir pro Carrinho e satisfazer o item escaneando o código de barras de um SKU", async ({
    request,
  }) => {
    const nomeGenerico = nomeUnico("Leite Scan Despensa");
    const nomeSku = `${nomeGenerico} Elegê Semidesnatado 1L`;
    const codigoBarras = `789${Date.now()}`;

    // 1. Item genérico puro na Despensa (fluxo padrão, sem marca) — sem SKU nenhum ainda.
    const adicionarNaDespensa = await request.post("/despensa", { data: { nome: nomeGenerico } });
    expect(adicionarNaDespensa.status()).toBe(201);
    const itemDespensa = await adicionarNaDespensa.json();
    expect(itemDespensa.produtoSkuId).toBeNull();
    const produtoGenericoId = itemDespensa.produtoId;

    // 2. Um SKU já cadastrado para esse mesmo genérico, com código de barras — como se já
    // existisse no catálogo antes da compra (não precisa ter sido criado pela Despensa/Carrinho).
    const criarSku = await request.post("/produtos-sku", {
      data: { nome: nomeSku, marca: "Elegê", codigoBarras, produtoId: produtoGenericoId },
    });
    expect(criarSku.status()).toBe(201);
    const sku = await criarSku.json();

    // 3. "Ir para o Carrinho": item entra como PLANEJADO com o genérico, ainda sem SKU resolvido.
    const criarCompra = await request.post("/compras", { data: {} });
    compraId = (await criarCompra.json()).id;
    const compraInicial = await (await request.get(`/compras/${compraId}`)).json();
    const itemCarrinho = compraInicial.itens.find((i: { produtoId: string }) => i.produtoId === produtoGenericoId);
    expect(itemCarrinho).toBeTruthy();
    expect(itemCarrinho.origem).toBe("PLANEJADO");
    expect(itemCarrinho.produtoSkuId).toBeNull();

    // 4. Simula o scan: código de barras resolve para o SKU já cadastrado e vincula ao item.
    const vincular = await request.post(`/compras/${compraId}/itens/${itemCarrinho.id}/sku`, {
      data: { codigoBarras },
    });
    expect(vincular.status()).toBe(200);
    const resultado = await vincular.json();
    expect(resultado.item.produtoSkuId).toBe(sku.id);
    expect(resultado.item.produtoId).toBe(produtoGenericoId);
    expect(resultado.item.produtoSku.codigoBarras).toBe(codigoBarras);

    // 5. Marca como comprado e finaliza — preço vai para o histórico do SKU, item some da Despensa.
    const marcar = await request.patch(`/compras/${compraId}/itens/${itemCarrinho.id}`, {
      data: { comprado: true, precoUnitario: 7.49 },
    });
    expect(marcar.status()).toBe(200);

    const finalizar = await request.post(`/compras/${compraId}/finalizar`);
    expect(finalizar.status()).toBe(200);

    const precosDoSku = await (await request.get(`/produtos-sku/${sku.id}/precos`)).json();
    expect(precosDoSku.ultimoPreco).toBe(7.49);

    const despensa = await request.get("/despensa");
    const aindaNaDespensa = (await despensa.json())
      .flatMap((g: { itens: { produtoId: string | null }[] }) => g.itens)
      .find((i: { produtoId: string | null }) => i.produtoId === produtoGenericoId);
    expect(aindaNaDespensa).toBeUndefined();
  });
});
