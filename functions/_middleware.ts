import { resolveOrganizer } from "./lib/auth";
import { apiError } from "./lib/http";
import type { AppPagesFunction } from "./lib/types";

export const onRequest: AppPagesFunction = async (context) => {
  if (!new URL(context.request.url).pathname.startsWith("/api/")) {
    return context.next();
  }

  try {
    context.data.organizer = await resolveOrganizer(context.request, context.env);
    return context.next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed";
    const status = message.includes("not enabled") ? 403 : 401;
    return apiError(status, status === 403 ? "FORBIDDEN" : "UNAUTHORIZED", message);
  }
};
