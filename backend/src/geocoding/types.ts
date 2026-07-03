export interface EnderecoGeocodificado {
  nomeSugerido: string;
  enderecoFormatado: string;
  latitude: number;
  longitude: number;
}

/**
 * Interface trocável de geocoding (RN-03.5/RN-03.6, task 11a).
 * Implementação inicial: Nominatim/OSM. Trocável por Google Places
 * no futuro sem alterar o código consumidor.
 */
export interface GeocodingProvider {
  reverseGeocode(lat: number, lng: number): Promise<EnderecoGeocodificado | null>;
}
