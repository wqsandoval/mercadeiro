import type { EnderecoGeocodificado, GeocodingProvider } from "./types.js";

interface NominatimReverseResponse {
  display_name?: string;
  address?: {
    shop?: string;
    supermarket?: string;
    amenity?: string;
    road?: string;
    house_number?: string;
    suburb?: string;
    city?: string;
    town?: string;
  };
}

export class NominatimProvider implements GeocodingProvider {
  constructor(private readonly baseUrl: string) {}

  async reverseGeocode(lat: number, lng: number): Promise<EnderecoGeocodificado | null> {
    const url = new URL("/reverse", this.baseUrl);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url, {
      headers: { "User-Agent": "Mercadeiro/1.0 (app de lista de compras)" },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as NominatimReverseResponse;
    if (!data.display_name) return null;

    const nomeSugerido =
      data.address?.supermarket ?? data.address?.shop ?? data.address?.amenity ?? "Supermercado";

    return {
      nomeSugerido,
      enderecoFormatado: data.display_name,
      latitude: lat,
      longitude: lng,
    };
  }
}
