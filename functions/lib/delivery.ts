import type {
  DeliveryMessage,
  ProviderDeliveryResult,
} from "../../shared/delivery";
import type { Env } from "./types";

export class DeliveryProviderError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string) {
    super(message);
    this.name = "DeliveryProviderError";
    this.provider = provider;
  }
}

function isLive(env: Env): boolean {
  return env.DELIVERY_MODE === "live";
}

function developmentResult(message: DeliveryMessage): ProviderDeliveryResult {
  return {
    provider: "development",
    providerMessageId: `dev-${message.channel}-${crypto.randomUUID()}`,
  };
}

async function sendEmail(env: Env, message: DeliveryMessage): Promise<ProviderDeliveryResult> {
  if (!isLive(env)) return developmentResult(message);
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new DeliveryProviderError("resend", "RESEND_API_KEY and EMAIL_FROM are required for live email delivery.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.destination],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) {
    throw new DeliveryProviderError("resend", body.message ?? `Resend returned HTTP ${response.status}.`);
  }
  return { provider: "resend", providerMessageId: body.id ?? null };
}

async function sendSms(env: Env, message: DeliveryMessage): Promise<ProviderDeliveryResult> {
  if (!isLive(env)) return developmentResult(message);
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    throw new DeliveryProviderError(
      "twilio",
      "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are required for live SMS delivery.",
    );
  }

  const credentials = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: message.destination,
        From: env.TWILIO_FROM_NUMBER,
        Body: message.text,
      }),
    },
  );

  const body = (await response.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  if (!response.ok) {
    const code = body.code ? ` (${body.code})` : "";
    throw new DeliveryProviderError("twilio", body.message ?? `Twilio returned HTTP ${response.status}${code}.`);
  }
  return { provider: "twilio", providerMessageId: body.sid ?? null };
}

export function providerName(channel: DeliveryMessage["channel"], env: Env): string {
  if (!isLive(env)) return "development";
  return channel === "email" ? "resend" : "twilio";
}

export function sendDelivery(env: Env, message: DeliveryMessage): Promise<ProviderDeliveryResult> {
  return message.channel === "email" ? sendEmail(env, message) : sendSms(env, message);
}
