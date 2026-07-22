interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string[]>;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody, fallbackMessage?: string) {
    super(body.error?.message ?? fallbackMessage ?? `The request failed with status ${status}.`);
    this.name = "ApiError";
    this.status = status;
    this.code = body.error?.code ?? "REQUEST_FAILED";
    this.fields = body.error?.fields ?? {};
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  const response = await fetch(path, { ...init, headers });
  const rawBody = await response.text();
  let body = {} as T & ApiErrorBody;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as T & ApiErrorBody;
    } catch {
      if (!response.ok) {
        throw new ApiError(
          response.status,
          {},
          rawBody.trim() || response.statusText || `The request failed with status ${response.status}.`,
        );
      }
      throw new Error(`Expected JSON from ${path}, but the server returned an unreadable response.`);
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body,
      response.statusText || `The request failed with status ${response.status}.`,
    );
  }
  return body;
}
