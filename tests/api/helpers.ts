/** Gera um nome único por execução para evitar colisão com a dedupe de Produto/Supermercado (RN 4.1). */
export function nomeUnico(base: string): string {
  return `${base} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}
