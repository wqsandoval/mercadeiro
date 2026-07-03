export class HttpError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const notFound = (entidade: string) => new HttpError(404, `${entidade} não encontrado(a)`);
export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const conflict = (message: string) => new HttpError(409, message);
export const unauthorized = (message = "Token de autenticação ausente ou inválido") =>
  new HttpError(401, message);
