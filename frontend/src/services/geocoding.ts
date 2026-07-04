import { http } from "../lib/http";

export interface ReverseGeocodeResultado {
  encontrado: boolean;
  nomeSugerido?: string;
  enderecoFormatado?: string;
  latitude?: number;
  longitude?: number;
}

// RN-03.5: sugestão de supermercado a partir do GPS capturado ao abrir o Carrinho.
export function reverseGeocode(lat: number, lng: number) {
  return http.get<ReverseGeocodeResultado>(`/geocoding/reverse?lat=${lat}&lng=${lng}`);
}
