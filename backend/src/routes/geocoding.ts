import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getGeocodingProvider } from "../geocoding/index.js";
import { badRequest } from "../lib/http-error.js";

const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function geocodingRoutes(app: FastifyInstance) {
  // Consumidor da interface GeocodingProvider (task 11a) — usado pelo Carrinho (UC-03)
  // para sugerir o supermercado a partir do GPS capturado.
  app.get("/geocoding/reverse", async (request) => {
    const parsed = reverseQuerySchema.safeParse(request.query);
    if (!parsed.success) throw badRequest("Parâmetros lat/lng inválidos", parsed.error.issues);

    const resultado = await getGeocodingProvider().reverseGeocode(parsed.data.lat, parsed.data.lng);
    if (!resultado) return { encontrado: false };
    return { encontrado: true, ...resultado };
  });
}
