import { z } from "zod";

export const deliveryChannels = ["email", "sms"] as const;
export type DeliveryChannel = (typeof deliveryChannels)[number];

export const deliveryStatuses = ["sending", "sent", "failed"] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

export const deliveryPolicies = ["requested_channels", "preferred_with_fallback"] as const;
export type DeliveryPolicy = (typeof deliveryPolicies)[number];

export const deliverySources = ["manual", "scheduled"] as const;
export type DeliverySource = (typeof deliverySources)[number];

export const deliveryResultStatuses = ["sent", "failed", "skipped"] as const;
export type DeliveryResultStatus = (typeof deliveryResultStatuses)[number];

export const sendInvitesSchema = z
  .object({
    playerIds: z.array(z.string().uuid()).max(50).optional(),
    channels: z.array(z.enum(deliveryChannels)).min(1).max(2),
    policy: z.enum(deliveryPolicies).default("requested_channels"),
    requestId: z.string().uuid().optional(),
  })
  .refine(
    (value) => new Set(value.channels).size === value.channels.length,
    "Each delivery channel may only be requested once",
  );

export type SendInvitesRequest = z.infer<typeof sendInvitesSchema>;

export interface DeliveryBatchSummary {
  requested: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface DeliveryResult {
  deliveryId: string | null;
  playerId: string;
  playerName: string;
  channel: DeliveryChannel;
  destination: string | null;
  provider: string | null;
  status: DeliveryResultStatus;
  errorMessage: string | null;
}

export interface SendInvitesResponse {
  batchId: string;
  summary: DeliveryBatchSummary;
  results: DeliveryResult[];
}

export interface DeliveryMessage {
  channel: DeliveryChannel;
  destination: string;
  subject?: string;
  text: string;
  html?: string;
  idempotencyKey: string;
}

export interface ProviderDeliveryResult {
  provider: string;
  providerMessageId: string | null;
}
