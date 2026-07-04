import { ref } from "vue";

export interface Coordenadas {
  latitude: number;
  longitude: number;
}

export type StatusGeolocalizacao = "idle" | "carregando" | "concedida" | "negada" | "indisponivel";

// RN-03.6: GPS indisponível ou negado nunca trava o fluxo — o consumidor usa
// `status` para acionar o fallback de seleção manual de supermercado.
export function useGeolocalizacao() {
  const coords = ref<Coordenadas | null>(null);
  const status = ref<StatusGeolocalizacao>("idle");

  function capturar(): Promise<Coordenadas | null> {
    if (!("geolocation" in navigator)) {
      status.value = "indisponivel";
      return Promise.resolve(null);
    }

    status.value = "carregando";
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (posicao) => {
          coords.value = {
            latitude: posicao.coords.latitude,
            longitude: posicao.coords.longitude,
          };
          status.value = "concedida";
          resolve(coords.value);
        },
        () => {
          status.value = "negada";
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10_000 },
      );
    });
  }

  return { coords, status, capturar };
}
