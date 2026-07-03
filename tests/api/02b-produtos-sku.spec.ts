import { test, expect } from "@playwright/test";
import { nomeUnico } from "./helpers";

test.describe("ProdutosSku", () => {
  test("cria SKU informando produtoGenericoNome (cria o genérico também)", async ({ request }) => {
    const nomeGenerico = nomeUnico("Leite");
    const nomeSku = `${nomeGenerico} Elegê Semidesnatado 1L`;

    const res = await request.post("/produtos-sku", {
      data: { nome: nomeSku, marca: "Elegê", produtoGenericoNome: nomeGenerico },
    });
    expect(res.status()).toBe(201);
    const sku = await res.json();
    expect(sku.nome).toBe(nomeSku);
    expect(sku.marca).toBe("Elegê");
    expect(sku.produto.nome).toBe(nomeGenerico);
    expect(sku.produto.categoria.nome).toBe("Outros");

    const skusDoGenerico = await request.get(`/produtos/${sku.produtoId}/skus`);
    expect(skusDoGenerico.status()).toBe(200);
    expect((await skusDoGenerico.json()).map((s: { id: string }) => s.id)).toContain(sku.id);
  });

  test("reaproveita SKU existente pelo código de barras", async ({ request }) => {
    const nomeGenerico = nomeUnico("Arroz");
    const codigoBarras = `789${Date.now()}`;

    const primeira = await request.post("/produtos-sku", {
      data: { nome: nomeUnico("Arroz Tio João 1kg"), produtoGenericoNome: nomeGenerico, codigoBarras },
    });
    expect(primeira.status()).toBe(201);
    const skuOriginal = await primeira.json();

    const segunda = await request.post("/produtos-sku", {
      data: { nome: nomeUnico("Nome Diferente"), produtoGenericoNome: nomeUnico("Genérico Diferente"), codigoBarras },
    });
    expect(segunda.status()).toBe(200);
    expect((await segunda.json()).id).toBe(skuOriginal.id);
  });

  test("reaproveita SKU existente por nome (case-insensitive) dentro do mesmo genérico", async ({ request }) => {
    const nomeGenerico = nomeUnico("Feijão");
    const nomeSku = "Feijão Carioca Camil 1kg";

    const primeira = await request.post("/produtos-sku", {
      data: { nome: nomeSku, produtoGenericoNome: nomeGenerico },
    });
    expect(primeira.status()).toBe(201);
    const skuOriginal = await primeira.json();

    const segunda = await request.post("/produtos-sku", {
      data: { nome: nomeSku.toUpperCase(), produtoId: skuOriginal.produtoId },
    });
    expect(segunda.status()).toBe(200);
    expect((await segunda.json()).id).toBe(skuOriginal.id);
  });

  test("backfill: código de barras é adicionado a SKU existente que não tinha", async ({ request }) => {
    const nomeGenerico = nomeUnico("Café");
    const nomeSku = "Café Pilão 500g";
    const codigoBarras = `456${Date.now()}`;

    const primeira = await request.post("/produtos-sku", {
      data: { nome: nomeSku, produtoGenericoNome: nomeGenerico },
    });
    const skuSemCodigo = await primeira.json();
    expect(skuSemCodigo.codigoBarras).toBeNull();

    const segunda = await request.post("/produtos-sku", {
      data: { nome: nomeSku, produtoId: skuSemCodigo.produtoId, codigoBarras },
    });
    expect(segunda.status()).toBe(200);
    const skuAtualizado = await segunda.json();
    expect(skuAtualizado.id).toBe(skuSemCodigo.id);
    expect(skuAtualizado.codigoBarras).toBe(codigoBarras);
  });

  test("GET /produtos-sku/:id/precos retorna vazio para SKU sem histórico", async ({ request }) => {
    const criar = await request.post("/produtos-sku", {
      data: { nome: nomeUnico("SKU Sem Historico"), produtoGenericoNome: nomeUnico("Genérico Sem Historico") },
    });
    const sku = await criar.json();

    const precos = await request.get(`/produtos-sku/${sku.id}/precos`);
    expect(precos.status()).toBe(200);
    expect(await precos.json()).toEqual({
      ultimoPreco: null,
      menorPreco: null,
      precoMedio: null,
      amostraPequena: true,
      porSupermercado: [],
    });
  });

  test("409 ao deletar SKU em uso na Despensa", async ({ request }) => {
    const criarSku = await request.post("/produtos-sku", {
      data: { nome: nomeUnico("SKU Em Uso"), produtoGenericoNome: nomeUnico("Genérico Em Uso") },
    });
    const sku = await criarSku.json();

    const adicionarNaDespensa = await request.post("/despensa", { data: { produtoSkuId: sku.id } });
    expect(adicionarNaDespensa.status()).toBe(201);

    const remover = await request.delete(`/produtos-sku/${sku.id}`);
    expect(remover.status()).toBe(409);

    await request.delete(`/despensa/${(await adicionarNaDespensa.json()).id}`);
  });

  test("404 ao buscar SKU inexistente", async ({ request }) => {
    const res = await request.get("/produtos-sku/id-inexistente");
    expect(res.status()).toBe(404);
  });
});
