import { useAuthStore } from "../stores/auth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = useAuthStore();
  const headers = new Headers(init.headers);
  // Fastify rejeita corpo vazio quando Content-Type é application/json (ex: DELETE
  // sem body) — só declara o header quando há de fato um corpo sendo enviado.
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (auth.token) headers.set("Authorization", `Bearer ${auth.token}`);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Não foi possível conectar à API");
  }

  // Token ausente/inválido: derruba a sessão local — o guard de rota redireciona ao login.
  if (res.status === 401) auth.limparToken();

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Erro ${res.status}`, body?.details);
  }

  return body as T;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
