// Pemetaan status pengiriman WhatsApp untuk dua provider.
// Dipakai oleh route HTTP webhook (src/convex/http.ts) dan unit test,
// sehingga logika pemetaan tidak hidup di dalam handler HTTP.

export type DeliveryStatus = "queued" | "sent" | "delivered" | "failed";

export type MetaStatusEvent = {
  providerMessageId: string;
  status: DeliveryStatus;
  errorCode?: string;
};

const metaStatusMap: Record<string, DeliveryStatus> = {
  accepted: "queued",
  sent: "sent",
  delivered: "delivered",
  read: "delivered",
  failed: "failed",
};

const twilioStatusMap: Record<string, DeliveryStatus> = {
  queued: "queued",
  accepted: "queued",
  sending: "sent",
  sent: "sent",
  delivered: "delivered",
  read: "delivered",
  failed: "failed",
  undelivered: "failed",
};

export const mapTwilioStatus = (value: string | null | undefined) =>
  value ? twilioStatusMap[value] : undefined;

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{
          id?: string;
          status?: string;
          errors?: Array<{ code?: number; title?: string }>;
        }>;
      };
    }>;
  }>;
};

/**
 * Ambil event status dari payload webhook Meta Cloud API.
 * Event tanpa `id` atau tanpa status yang dikenal diabaikan.
 * Payload berisi `errors` tanpa status tetap dianggap gagal.
 */
export const parseMetaStatuses = (payload: unknown): MetaStatusEvent[] => {
  const entries = (payload as MetaWebhookPayload | null)?.entry ?? [];
  const events: MetaStatusEvent[] = [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (!status.id) continue;
        const mapped =
          metaStatusMap[status.status ?? ""] ??
          (status.errors?.length ? ("failed" as DeliveryStatus) : undefined);
        if (!mapped) continue;
        events.push({
          providerMessageId: status.id,
          status: mapped,
          errorCode: status.errors?.[0]?.code ? String(status.errors[0].code) : undefined,
        });
      }
    }
  }
  return events;
};
