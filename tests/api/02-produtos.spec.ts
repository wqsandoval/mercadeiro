import { test, expect } from "@playwright/test";
import { nomeUnico } from "./helpers";

test.describe("Produtos", () => {
  test("cria produto sem categoria e cai em Outros", async ({ request }) => {
    const nome = nomeUnico("Produto Sem Categoria");

    const res = await request.post("/produtos", { data: { nome } });
    expect(res.status()).toBe(201);
    const produto = await res.json();
    expect(produto.categoria.nome).toBe("Outros");
  });

  test("RN 4.1: nome já existente (case-insensitive) reaproveita o produto", async ({ request }) => {
    const nome = nomeUnico("Produto Duplicado");

    const primeira = await request.post("/produtos", { data: { nome } });
    expect(primeira.status()).toBe(201);
    const produtoOriginal = await primeira.json();

    const segunda = await request.post("/produtos", { data: { nome: nome.toUpperCase() } });
    expect(segunda.status()).toBe(200);
    const produtoReaproveitado = await segunda.json();

    expect(produtoReaproveitado.id).toBe(produtoOriginal.id);

    const listagem = await request.get("/produtos", { params: { busca: nome } });
    expect((await listagem.json())).toHaveLength(1);
  });

  test("produto associado a categoria inválida cai em Outros", async ({ request }) => {
    const nome = nomeUnico("Produto Categoria Invalida");

    const res = await request.post("/produtos", {
      data: { nome, categoriaId: "categoria-que-nao-existe" },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).categoria.nome).toBe("Outros");
  });

  test("GET /produtos/:id/precos retorna vazio para produto sem histórico", async ({ request }) => {
    const criar = await request.post("/produtos", { data: { nome: nomeUnico("Produto Sem Historico") } });
    const produto = await criar.json();

    const precos = await request.get(`/produtos/${produto.id}/precos`);
    expect(precos.status()).toBe(200);
    expect(await precos.json()).toEqual({
      ultimoPreco: null,
      menorPreco: null,
      precoMedio: null,
      amostraPequena: true,
      porSupermercado: [],
    });
  });

  test("404 ao buscar produto inexistente", async ({ request }) => {
    const res = await request.get("/produtos/id-inexistente");
    expect(res.status()).toBe(404);
  });
});
