import { http } from "../lib/http";
import type { ProdutoSku } from "./despensa";

// codigoBarras é único em ProdutoSku — no máximo um resultado. Usado pelo scan de item
// extra (task 20/23) para localizar o SKU antes de decidir entre reaproveitar ou criar.
export function buscarProdutoSkuPorCodigoBarras(codigoBarras: string) {
  return http.get<ProdutoSku[]>(`/produtos-sku?codigoBarras=${encodeURIComponent(codigoBarras)}`);
}
