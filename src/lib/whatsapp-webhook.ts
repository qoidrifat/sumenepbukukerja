// Pemetaan status pengiriman WhatsApp untuk dua provider.
// Dipakai oleh route HTTP webhook (src/convex/http.ts) dan unit test,
// sehingga logika pemetaan tidak hidup di dalam handler HTTP.

export type DeliveryStatus = "queued" | "sent" | "delivered" | "failed";

export type MetaStatusEvent = {
  providerMessageId: string;
  status: DeliveryStatus;
  errorCode?: string;
};

/** Balasan warga yang masuk lewat webhook, sudah dinormalisasi untuk dua provider. */
export type InboundMessage = {
  providerMessageId: string;
  /** Nomor pengiring saja, format digits international tanpa tanda plus. */
  from: string;
  body: string;
  /** `text`, `button`, `media`, atau tipe lain yang diteruskan Meta apa adanya. */
  kind: string;
  /** Epoch milidetik. 0 kalau provider tidak mengirim timestamp. */
  at: number;
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

/* ------------------------------------------------------------------ */
/* Pesan masuk (bukan status pengiriman)                               */
/* ------------------------------------------------------------------ */

const digits = (value: string) => value.replace(/\D/g, "");

const epochMs = (value: unknown) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
};

type MetaInboundPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { payload?: string };
        }>;
      };
    }>;
  }>;
};

/**
 * Baca pesan masuk dari payload webhook Meta.
 *
 * Webhook yang sama dipakai untuk dua hal: `value.statuses` untuk status
 * pengiriman dan `value.messages` untuk chat masuk. Hanya `statuses` yang
 * pernah dibaca, jadi semua balasan warga hilang tanpa jejak. Parser ini
 * menutup celah itu supaya dashboard bisa menampilkan status percakapan
 * secara otomatis, bukan ditandai manual.
 *
 * Pesan tanpa `id` atau tanpa nomor pengirim diabaikan: tanpa keduanya
 * tidak ada yang bisa disimpan maupun dikaitkan ke pengguna.
 */
export const parseMetaInbound = (payload: unknown): InboundMessage[] => {
  const entries = (payload as MetaInboundPayload | null)?.entry ?? [];
  const messages: InboundMessage[] = [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const from = digits(message.from ?? "");
        if (!message.id || !from) continue;
        const body = (message.text?.body ?? message.button?.payload ?? "").trim();
        messages.push({
          providerMessageId: message.id,
          from,
          body: body.slice(0, 2000),
          kind: message.type ?? "unknown",
          at: epochMs(message.timestamp),
        });
      }
    }
  }
  return messages;
};

/**
 * Baca pesan masuk dari callback Twilio.
 *
 * Twilio memakai satu endpoint untuk status pengiriman dan pesan masuk.
 * Status selalu membawa `MessageStatus`; pesan masuk tidak pernah
 * membawanya. Membedakan lewat absennya `MessageStatus` membuat keduanya
 * bisa ditangani di handler yang sama tanpa saling menimpa.
 */
export const parseTwilioInbound = (params: URLSearchParams): InboundMessage | undefined => {
  const providerMessageId = params.get("MessageSid") ?? params.get("SmsSid") ?? "";
  if (!providerMessageId) return undefined;
  if (params.get("MessageStatus") || params.get("SmsStatus")) return undefined;
  const from = digits((params.get("From") ?? "").replace(/^whatsapp:/, ""));
  if (!from) return undefined;
  const media = Number(params.get("NumMedia") ?? "0");
  return {
    providerMessageId,
    from,
    body: (params.get("Body") ?? "").trim().slice(0, 2000),
    kind: Number.isFinite(media) && media > 0 ? "media" : "text",
    at: Date.now(),
  };
};
