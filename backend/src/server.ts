import Fastify from "fastify";
import { prisma } from "./prisma.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerAuth } from "./plugins/auth.js";
import { registerCors } from "./plugins/cors.js";
import { categoriasRoutes } from "./routes/categorias.js";
import { produtosRoutes } from "./routes/produtos.js";
import { produtosSkuRoutes } from "./routes/produtos-sku.js";
import { despensaRoutes } from "./routes/despensa.js";
import { comprasRoutes } from "./routes/compras.js";
import { supermercadosRoutes } from "./routes/supermercados.js";
import { analiticoRoutes } from "./routes/analitico.js";
import { geocodingRoutes } from "./routes/geocoding.js";

const app = Fastify({ logger: true });

registerErrorHandler(app);
await registerCors(app);
registerAuth(app);

app.get("/health", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok", database: "connected" };
});

await app.register(categoriasRoutes);
await app.register(produtosRoutes);
await app.register(produtosSkuRoutes);
await app.register(despensaRoutes);
await app.register(comprasRoutes);
await app.register(supermercadosRoutes);
await app.register(analiticoRoutes);
await app.register(geocodingRoutes);

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "0.0.0.0";

app
  .listen({ port, host })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
