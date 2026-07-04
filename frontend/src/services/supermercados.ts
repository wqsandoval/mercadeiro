import { http } from "../lib/http";

export interface Supermercado {
  id: string;
  nome: string;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function listarSupermercados() {
  return http.get<Supermercado[]>("/supermercados");
}

export interface NovoSupermercado {
  nome: string;
  endereco?: string;
  latitude?: number;
  longitude?: number;
}

// Dedupe por nome+endereço já é feito no backend (200 se já existir, 201 se criar) — usado
// pelo fluxo de reverse geocoding para não duplicar supermercado a cada compra no mesmo local.
export function criarOuReaproveitarSupermercado(input: NovoSupermercado) {
  return http.post<Supermercado>("/supermercados", input);
}
