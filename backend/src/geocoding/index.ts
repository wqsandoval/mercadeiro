import { NominatimProvider } from "./nominatim-provider.js";
import type { GeocodingProvider } from "./types.js";

export type { GeocodingProvider, EnderecoGeocodificado } from "./types.js";

let provider: GeocodingProvider | undefined;

export function getGeocodingProvider(): GeocodingProvider {
  if (provider) return provider;

  const kind = process.env.GEOCODING_PROVIDER ?? "nominatim";
  switch (kind) {
    case "nominatim":
    default:
      provider = new NominatimProvider(
        process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org",
      );
      break;
  }
  return provider;
}
