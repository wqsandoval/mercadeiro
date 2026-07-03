import { test, expect } from "@playwright/test";
import { nomeUnico } from "./helpers";

test.describe.serial("Analítico", () => {
  const PRECO_FINALIZADO = 12.34;
  const PRECO_EM_ANDAMENTO = 77.77;

  let baselineTotal: number;
  let compraEmAndamentoId: string | undefined;

  test.afterAll(async ({ request }) => {
    // Não deixa Compra em andamento pendurada (RN-02.4) para não afetar execuções futuras.
    if (compraEmAndamentoId) {
      await request.post(`/compras/${compraEmAndamentoId}/finalizar`).catch(() => undefined);
    }
  });

  test("400 para período inválido", async ({ request }) => {
    const res = await request.get("/analitico", { params: { periodo: "1ano" } });
    expect(res.status()).toBe(400);
  });

  test("formato básico da resposta para o período padrão (mês)", async ({ request }) => {
    const res = await request.get("/analitico");
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.periodo).toBe("mes");
    expect(typeof body.totalGasto).toBe("number");
    expect(typeof body.numeroCompras).toBe("number");
    expect(Array.isArray(body.gastoPorCategoria)).toBe(true);
    expect(Array.isArray(body.alertas.altaDePreco)).toBe(true);
    expect(Array.isArray(body.alertas.ausencia)).toBe(true);

    baselineTotal = body.totalGasto;
  });

  test("RN-06.4: compra finalizada no período soma no gasto por categoria", async ({ request }) => {
    const nomeProduto = nomeUnico("Analitico Finalizado");
    await request.post("/despensa", { data: { nome: nomeProduto } });

    const criarCompra = await request.post("/compras", { data: {} });
    const compra = await criarCompra.json();
    const item = compra.itens.find((i: { produto: { nome: string } }) => i.produto.nome === nomeProduto);

    await request.patch(`/compras/${compra.id}/itens/${item.id}`, {
      data: { comprado: true, precoUnitario: PRECO_FINALIZADO },
    });
    const finalizar = await request.post(`/compras/${compra.id}/finalizar`);
    expect(finalizar.status()).toBe(200);

    const analitico = await (await request.get("/analitico?periodo=mes")).json();
    expect(analitico.totalGasto).toBeCloseTo(baselineTotal + PRECO_FINALIZADO, 2);

    const categoriaOutros = analitico.gastoPorCategoria.find(
      (c: { categoria: string }) => c.categoria === "Outros",
    );
    expect(categoriaOutros).toBeTruthy();

    baselineTotal = analitico.totalGasto;
  });

  test("RN-06.5: compra em andamento nunca entra no cálculo, mesmo com item comprado", async ({ request }) => {
    const nomeProduto = nomeUnico("Analitico Em Andamento");
    await request.post("/despensa", { data: { nome: nomeProduto } });

    const criarCompra = await request.post("/compras", { data: {} });
    const compra = await criarCompra.json();
    compraEmAndamentoId = compra.id;
    const item = compra.itens.find((i: { produto: { nome: string } }) => i.produto.nome === nomeProduto);

    const marcar = await request.patch(`/compras/${compra.id}/itens/${item.id}`, {
      data: { comprado: true, precoUnitario: PRECO_EM_ANDAMENTO },
    });
    expect(marcar.status()).toBe(200);
    // Propositalmente não finaliza.

    const analitico = await (await request.get("/analitico?periodo=mes")).json();
    expect(analitico.totalGasto).toBeCloseTo(baselineTotal, 2);
  });
});
