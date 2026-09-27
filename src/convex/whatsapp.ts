import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericActionCtx } from "convex/server";
import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { buildTemplatePayload, buildTextPayload } from "../lib/whatsapp-payload";

const notificationKindValidator = v.union(
  v.literal("request_created"),
  v.literal("request_status"),
  v.literal("vendor_created"),
  v.literal("vendor_updated"),
);

type NotificationKind =
  | "request_created"
  | "request_status"
  | "vendor_created"
  | "vendor_updated";
type DeliveryResult = {
  configured: boolean;
  delivered: number;
  skipped: number;
  failed: number;
};
type DeliveryRecipient = {
  userId: DataModel["users"]["document"]["_id"];
  name: string;
  phone: string;
  title: string;
  body: string;
  deliveryKey: string;
};

const areaLabels: Record<string, string> = {
  adipura: "Taman Bunga / Adipura",
  trunojoyo: "Jl. Trunojoyo",
  anom: "Pasar Anom Baru",
  keraton: "Keraton / Labang Mesem",
  jamik: "Masjid Jamik",
  kalianget: "Kalianget",
  bluto: "Bluto",
  "kota-lama": "Kota Lama",
  pragaan: "Pragaan",
};

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "62");
  return digits.length >= 10 && digits.length <= 15 ? digits : undefined;
};

const twilioConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID;
  return {
    accountSid,
    authToken,
    from: from
      ? from.startsWith("whatsapp:")
        ? from
        : `whatsapp:${from.startsWith("+") ? from : `+${from}`}`
      : undefined,
    contentSid,
    configured: Boolean(accountSid && authToken && from),
  };
};

// Meta WhatsApp Cloud API (gratis: pesan non-template gratis selama 24 jam
// customer service window). Dipakai otomatis kalau kredensial Meta terisi.
const metaConfig = () => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  return {
    accessToken,
    phoneNumberId,
    templateName,
    appSecret,
    graphVersion: process.env.META_GRAPH_VERSION ?? "v21.0",
    configured: Boolean(accessToken && phoneNumberId),
  };
};

// Twilio dan Meta bisa berdampingan. WHATSAPP_PROVIDER memaksa pilihan,
// selain itu provider terkonfigurasi yang dipakai.
const activeProvider = () => {
  const forced = process.env.WHATSAPP_PROVIDER?.toLowerCase();
  if (forced === "meta" || forced === "twilio") return forced;
  if (metaConfig().configured) return "meta";
  if (twilioConfig().configured) return "twilio";
  return "none";
};

export const getWhatsappStatus = query({
  args: {},
  handler: async (ctx) => {
    const config = twilioConfig();
    const deliveries = await ctx.db.query("whatsappDeliveries").collect();
    const counts = deliveries.reduce<Record<string, number>>((result, delivery) => {
      result[delivery.status] = (result[delivery.status] ?? 0) + 1;
      return result;
    }, {});
    const maskedFrom = config.from ? config.from.replace(/\d/g, "•") : undefined;
    const meta = metaConfig();
    return {
      configured: config.configured || meta.configured,
      provider: activeProvider(),
      twilioConfigured: config.configured,
      metaConfigured: meta.configured,
      metaPhoneNumberId: meta.phoneNumberId
        ? `…${meta.phoneNumberId.slice(-4)}`
        : undefined,
      usesTemplate: Boolean(config.contentSid || meta.templateName),
      webhookConfigured: Boolean(process.env.CONVEX_SITE_URL),
      webhookUrl: process.env.CONVEX_SITE_URL
        ? `${process.env.CONVEX_SITE_URL}/webhook/whatsapp`
        : undefined,
      maskedFrom,
      deliveryCounts: {
        queued: counts.queued ?? 0,
        sent: counts.sent ?? 0,
        delivered: counts.delivered ?? 0,
        failed: counts.failed ?? 0,
      },
    };
  },
});

export const notificationRecipients = internalQuery({
  args: {
    kind: notificationKindValidator,
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const preferences = await ctx.db.query("notificationPreferences").collect();
    const isVendorKind = args.kind === "vendor_created" || args.kind === "vendor_updated";
    const request = isVendorKind
      ? null
      : await ctx.db.get(args.entityId as DataModel["serviceRequests"]["document"]["_id"]);
    const vendor = isVendorKind
      ? await ctx.db.get(args.entityId as DataModel["vendors"]["document"]["_id"])
      : null;
    if (isVendorKind ? !vendor : !request) return [];

    let title = "Informasi Buku Kerja";
    let body = "Ada pembaruan baru di Sumenep Buku Kerja.";
    if (request) {
      const area = areaLabels[request.landmark] ?? request.landmark;
      if (args.kind === "request_created") {
        title = "Permintaan warga baru";
        body = `${request.title} — ${request.category} di ${area}.`;
      } else if (request.status === "claimed") {
        title = "Permintaan Anda ditawari";
        body = `Ada mitra yang menawarkan bantuan untuk "${request.title}".`;
      } else if (request.status === "completed") {
        title = "Permintaan selesai";
        body = `"${request.title}" telah ditandai selesai.`;
      } else {
        title = "Permintaan diperbarui";
        body = `Status "${request.title}" sekarang: ${request.status}.`;
      }
    }
    if (vendor) {
      title =
        args.kind === "vendor_created"
          ? "Listing baru di sekitar Anda"
          : vendor.featured
            ? "Listing unggulan diperbarui"
            : "Listing lokal diperbarui";
      body =
        args.kind === "vendor_created"
          ? `${vendor.name} baru tayang di ${areaLabels[vendor.landmark] ?? vendor.landmark}.`
          : `${vendor.name} di ${areaLabels[vendor.landmark] ?? vendor.landmark} memiliki informasi terbaru.`;
    }

    const recipients: DeliveryRecipient[] = [];
    for (const preference of preferences) {
      const userId = preference.userId;
      const user = await ctx.db.get(userId);
      if (
        request &&
        ((args.kind === "request_created" && userId === request.requesterId) ||
          (args.kind === "request_status" && userId !== request.requesterId))
      ) {
        continue;
      }
      if (
        preference.whatsappUpdates !== true ||
        !preference.whatsappOptInAt ||
        !normalizePhone(preference.whatsappPhone ?? "")
      ) {
        continue;
      }
      if (
        (args.kind === "request_created" && preference.requestUpdates !== true) ||
        ((args.kind === "vendor_created" || args.kind === "vendor_updated") &&
          preference.areaUpdates !== true)
      ) {
        continue;
      }
      if (args.kind === "vendor_updated" && vendor) {
        const favorites = await ctx.db
          .query("favorites")
          .withIndex("byUser", (q) => q.eq("userId", userId))
          .collect();
        if (!favorites.some((favorite) => favorite.vendorId === vendor._id)) continue;
      }

      const recent = await ctx.db
        .query("notifications")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .collect();
      const deliveries = await ctx.db
        .query("whatsappDeliveries")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .collect();
      
      const deliveryKey =
        args.kind === "request_status"
          ? `whatsapp:${args.kind}:${args.entityId}:${request?.status ?? "unknown"}`
          : `whatsapp:${args.kind}:${args.entityId}`;
      if (deliveries.some((delivery) => delivery.deliveryKey === deliveryKey)) continue;
      if (recent.some((item) => item.kind === deliveryKey)) continue;
      const recentDeliveries = deliveries.filter(
        (delivery) => now - delivery.createdAt < 24 * 60 * 60 * 1000,
      );
      // Delivery rows are the canonical rate-limit ledger. A few legacy
      // notifications may predate the queue, so count those separately rather
      // than counting the same message twice.
      const deliveryKeys = new Set(recentDeliveries.map((delivery) => delivery.deliveryKey));
      const legacyWhatsappCount = recent.filter(
        (item) =>
          item.channel === "whatsapp" &&
          now - item.createdAt < 24 * 60 * 60 * 1000 &&
          !deliveryKeys.has(item.kind),
      ).length;
      if (recentDeliveries.length + legacyWhatsappCount >= 3) continue;

      recipients.push({
        userId,
        name: user?.name ?? "Warga Sumenep",
        phone: normalizePhone(preference.whatsappPhone ?? "")!,
        title,
        body,
        deliveryKey,
      });
      if (recipients.length >= 50) break;
    }
    return recipients;
  },
});

export const preferencesForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const [user, preference] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db
        .query("notificationPreferences")
        .withIndex("byUser", (q) => q.eq("userId", args.userId))
        .unique(),
    ]);
    return {
      name: user?.name ?? "warga",
      phone: preference?.whatsappPhone,
      whatsappUpdates: preference?.whatsappUpdates ?? false,
      whatsappOptInAt: preference?.whatsappOptInAt,
    };
  },
});

const safeErrorCode = (value: unknown) => {
  const code = typeof value === "string" || typeof value === "number" ? String(value) : "provider_error";
  return code.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "provider_error";
};

export const queueWhatsappDelivery = internalMutation({
  args: {
    userId: v.string(),
    deliveryKey: v.string(),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whatsappDeliveries")
      .withIndex("byDeliveryKey", (q) => q.eq("deliveryKey", args.deliveryKey))
      .unique();
    if (existing) return { id: existing._id, shouldSend: false, status: existing.status, attempts: existing.attempts };
    const id = await ctx.db.insert("whatsappDeliveries", {
      deliveryKey: args.deliveryKey,
      userId: args.userId as DataModel["users"]["document"]["_id"],
      status: "queued",
      attempts: 0,
      title: args.title,
      body: args.body,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { id, shouldSend: true, status: "queued" as const, attempts: 0 };
  },
});

export const markWhatsappSent = internalMutation({
  args: { id: v.id("whatsappDeliveries"), providerMessageId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current || current.status === "delivered") return;
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "sent",
      attempts: current.attempts + 1,
      providerMessageId: args.providerMessageId,
      lastErrorCode: undefined,
      nextAttemptAt: undefined,
      updatedAt: now,
    });
    const notifications = await ctx.db.query("notifications").withIndex("byUser", (q) => q.eq("userId", current.userId)).collect();
    if (!notifications.some((notification) => notification.kind === current.deliveryKey)) {
      await ctx.db.insert("notifications", {
        userId: current.userId,
        kind: current.deliveryKey,
        title: current.title,
        body: current.body,
        channel: "whatsapp",
        providerMessageId: args.providerMessageId,
        read: true,
        createdAt: now,
      });
    }
  },
});

export const markWhatsappFailed = internalMutation({
  args: { id: v.id("whatsappDeliveries"), errorCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current || current.status === "delivered") return;
    const attempts = current.attempts + 1;
    const nextAttemptAt = attempts < 3 ? Date.now() + attempts * 60_000 : undefined;
    await ctx.db.patch(args.id, {
      status: "failed",
      attempts,
      lastErrorCode: safeErrorCode(args.errorCode),
      nextAttemptAt,
      updatedAt: Date.now(),
    });
    if (nextAttemptAt) {
      await ctx.scheduler.runAfter(attempts * 60_000, internal.whatsapp.retryWhatsappDelivery, { deliveryId: args.id });
    }
  },
});

export const deliveryForRetry = internalQuery({
  args: { deliveryId: v.id("whatsappDeliveries") },
  handler: async (ctx, args) => await ctx.db.get(args.deliveryId),
});

export const applyDeliveryStatus = internalMutation({
  args: {
    providerMessageId: v.string(),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("delivered"), v.literal("failed")),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db
      .query("whatsappDeliveries")
      .withIndex("byProviderMessageId", (q) => q.eq("providerMessageId", args.providerMessageId))
      .unique();
    if (!delivery) return false;
    // Provider callbacks can arrive out of order. Never regress a terminal
    // delivery back to queued/sent because an older callback was delayed.
    if (delivery.status === "delivered" && args.status !== "delivered") return true;
    if (delivery.status === "sent" && args.status === "queued") return true;
    const now = Date.now();
    const nextAttemptAt = args.status === "failed" && delivery.attempts < 3
      ? now + Math.max(1, delivery.attempts) * 60_000
      : undefined;
    await ctx.db.patch(delivery._id, {
      status: args.status,
      lastErrorCode: args.status === "failed" ? safeErrorCode(args.errorCode) : undefined,
      nextAttemptAt,
      updatedAt: now,
    });
    if (nextAttemptAt) {
      await ctx.scheduler.runAfter(Math.max(1, delivery.attempts) * 60_000, internal.whatsapp.retryWhatsappDelivery, { deliveryId: delivery._id });
    }
    return true;
  },
});

async function sendViaMeta(
  config: ReturnType<typeof metaConfig>,
  input: { phone: string; title: string; body: string },
): Promise<{ skipped: boolean; configured: boolean; messageId?: string }> {
  if (!config.configured || !config.accessToken || !config.phoneNumberId) {
    return { skipped: true, configured: false };
  }
  // Template memakai variabel bernama; WhatsApp Manager menolak `{{1}}`.
  // Nama variabel bisa disesuaikan lewat env bila template diganti.
  const payload: Record<string, unknown> = config.templateName
    ? buildTemplatePayload(input, {
        name: config.templateName,
        language: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "id",
        titleParam: process.env.WHATSAPP_TEMPLATE_PARAM_TITLE ?? "judul",
        bodyParam: process.env.WHATSAPP_TEMPLATE_PARAM_BODY ?? "isi",
      })
    : buildTextPayload(input);
  const response = await fetch(
    `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    },
  );
  const result = (await response.json()) as {
    messages?: Array<{ id?: string }>;
    error?: { code?: number; message?: string };
  };
  if (!response.ok) {
    const error = new Error("Meta menolak pesan") as Error & { providerCode?: string };
    error.providerCode = safeErrorCode(result.error?.code ?? response.status);
    throw error;
  }
  return { skipped: false, configured: true, messageId: result.messages?.[0]?.id };
}

async function sendWhatsappMessage(input: {
  phone: string;
  title: string;
  body: string;
}): Promise<{
  skipped: boolean;
  configured: boolean;
  messageId?: string;
}> {
  if (activeProvider() === "meta") return await sendViaMeta(metaConfig(), input);
  const config = twilioConfig();
  if (!config.configured || !config.accountSid || !config.authToken || !config.from) {
    return { skipped: true, configured: false };
  }
  const payload = new URLSearchParams({
    From: config.from,
    To: `whatsapp:${input.phone}`,
  });
  if (process.env.CONVEX_SITE_URL) {
    payload.set("StatusCallback", `${process.env.CONVEX_SITE_URL.replace(/\/$/, "")}/webhook/whatsapp`);
  }
  if (config.contentSid) {
    payload.set("ContentSid", config.contentSid);
    payload.set(
      "ContentVariables",
      JSON.stringify({ 1: input.title, 2: input.body }),
    );
  } else {
    payload.set("Body", `${input.title}\n\n${input.body}`);
  }
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
      signal: AbortSignal.timeout(12_000),
    },
  );
  const result = (await response.json()) as {
    sid?: string;
    message?: string;
    code?: string | number;
  };
  if (!response.ok) {
    const error = new Error("Twilio menolak pesan") as Error & { providerCode?: string };
    error.providerCode = safeErrorCode(result.code ?? response.status);
    throw error;
  }
  return { skipped: false, configured: true, messageId: result.sid };
}

async function deliver(
  ctx: GenericActionCtx<DataModel>,
  kind: NotificationKind,
  entityId: string,
): Promise<DeliveryResult> {
  const recipients: DeliveryRecipient[] = await ctx.runQuery(
    internal.whatsapp.notificationRecipients,
    { kind, entityId },
  );
  if (activeProvider() === "none") {
    return { configured: false, delivered: 0, skipped: recipients.length, failed: 0 };
  }
    let delivered = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const queued = await ctx.runMutation(internal.whatsapp.queueWhatsappDelivery, {
        userId: recipient.userId,
        deliveryKey: recipient.deliveryKey,
        title: recipient.title,
        body: recipient.body,
      });
      if (!queued.shouldSend) continue;
      try {
        const result = await sendWhatsappMessage({
          phone: recipient.phone,
          title: recipient.title,
          body: recipient.body,
        });
        if (result.skipped) continue;
        await ctx.runMutation(internal.whatsapp.markWhatsappSent, {
          id: queued.id,
          providerMessageId: result.messageId,
        });
        delivered += 1;
      } catch (error) {
        failed += 1;
        const code = error && typeof error === "object" && "providerCode" in error ? String(error.providerCode) : "provider_error";
        await ctx.runMutation(internal.whatsapp.markWhatsappFailed, { id: queued.id, errorCode: code });
      }
    }
    return { configured: true, delivered, skipped: 0, failed };
}

export const sendRequestCreatedNotifications = internalAction({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args): Promise<DeliveryResult> =>
    deliver(ctx, "request_created", args.requestId),
});

export const sendRequestStatusNotification = internalAction({
  args: {
    requestId: v.id("serviceRequests"),
    status: v.union(v.literal("claimed"), v.literal("completed"), v.literal("cancelled")),
  },
  handler: async (ctx, args): Promise<DeliveryResult> =>
    deliver(ctx, "request_status", args.requestId),
});

export const sendVendorCreatedNotifications = internalAction({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args): Promise<DeliveryResult> =>
    deliver(ctx, "vendor_created", args.vendorId),
});

export const sendVendorUpdatedNotifications = internalAction({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args): Promise<DeliveryResult> =>
    deliver(ctx, "vendor_updated", args.vendorId),
});

export const retryWhatsappDelivery = internalAction({
  args: { deliveryId: v.id("whatsappDeliveries") },
  handler: async (ctx, args) => {
    const delivery = await ctx.runQuery(internal.whatsapp.deliveryForRetry, { deliveryId: args.deliveryId });
    if (!delivery || delivery.status === "delivered" || delivery.status === "sent" || delivery.attempts >= 3 || (delivery.nextAttemptAt !== undefined && delivery.nextAttemptAt > Date.now())) return { sent: false };
    if (!twilioConfig().configured) return { sent: false };
    try {
      // The phone is intentionally stored only in the notification preference.
      const preference = await ctx.runQuery(internal.whatsapp.preferencesForUser, { userId: delivery.userId });
      const phone = normalizePhone(preference?.phone ?? "");
      if (!phone) return { sent: false };
      const sent = await sendWhatsappMessage({ phone, title: delivery.title, body: delivery.body });
      if (sent.skipped) return { sent: false };
      await ctx.runMutation(internal.whatsapp.markWhatsappSent, { id: delivery._id, providerMessageId: sent.messageId });
      return { sent: true };
    } catch (error) {
      const code = error && typeof error === "object" && "providerCode" in error ? String(error.providerCode) : "provider_error";
      await ctx.runMutation(internal.whatsapp.markWhatsappFailed, { id: delivery._id, errorCode: code });
      return { sent: false };
    }
  },
});

export const sendTestWhatsapp = action({
  args: {},
  handler: async (ctx): Promise<{ sent: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Masuk untuk menguji notifikasi WhatsApp");
    const preference = await ctx.runQuery(
      internal.whatsapp.preferencesForUser,
      { userId },
    );
    const phone = normalizePhone(preference?.phone ?? "");
    if (
      !phone ||
      preference?.whatsappUpdates !== true ||
      !preference.whatsappOptInAt
    ) {
      throw new Error("Simpan nomor lalu aktifkan notifikasi WhatsApp terlebih dahulu");
    }
    const deliveryKey = `whatsapp:test:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const queued = await ctx.runMutation(internal.whatsapp.queueWhatsappDelivery, {
      userId,
      deliveryKey,
      title: "WhatsApp aktif",
      body: "Pesan uji berhasil dikirim.",
    });
    if (!queued.shouldSend) throw new Error("Pesan uji sudah dikirim hari ini");
    try {
      const result = await sendWhatsappMessage({
        phone,
        title: "Sumenep Buku Kerja",
        body: `Halo ${preference.name}, notifikasi WhatsApp Anda sudah aktif.`,
      });
      if (result.skipped) throw new Error("Integrasi WhatsApp belum dikonfigurasi");
      await ctx.runMutation(internal.whatsapp.markWhatsappSent, { id: queued.id, providerMessageId: result.messageId });
      return { sent: true };
    } catch (error) {
      const code = error && typeof error === "object" && "providerCode" in error ? String(error.providerCode) : "provider_error";
      await ctx.runMutation(internal.whatsapp.markWhatsappFailed, { id: queued.id, errorCode: code });
      throw new Error("Integrasi WhatsApp belum dapat mengirim pesan uji");
    }
  },
});
