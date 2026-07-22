import { ZodError } from "zod";

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  fields: Record<string, string[]> = {},
): Response {
  return json({ error: { code, message, fields } }, { status });
}

export function validationError(error: ZodError): Response {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "request";
    fields[path] = [...(fields[path] ?? []), issue.message];
  }
  return apiError(400, "VALIDATION_ERROR", "Check the highlighted fields.", fields);
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new TypeError("Expected an application/json request body");
  }
  return request.json();
}
