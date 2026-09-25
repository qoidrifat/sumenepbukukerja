import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericActionCtx } from "convex/server";
import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { api } from "./_generated/api";

const notificationKindValidator = v.union(
  v.literal("request_created"),
  v.literal("request_status"),
  v.literal("vendor_updated"),
);

type NotificationKind = "request_created" | "request_status" | "vendor_updated";
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

export const getWhatsappStatus = query({
  args: {},
  handler: async () => {
    const config = twilioConfig();
    return {
      configured: config.configured,
      usesTemplate: Boolean(config.contentSid),
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
    const users = await ctx.db.query("users").collect();
    const request =
      args.kind === "request_created" || args.kind === "request_status"
        ? await ctx.db.get(args.entityId as DataModel["serviceRequests"]["document"]["_id"])
        : null;
    const vendor =
      args.kind === "vendor_updated"
        ? await ctx.db.get(args.entityId as DataModel["vendors"]["document"]["_id"])
        : null;
    if (
      (args.kind !== "vendor_updated" && !request) ||
      (args.kind === "vendor_updated" && !vendor)
    ) {
      return [];
    }

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
      title = vendor.featured ? "Listing unggulan diperbarui" : "Listing lokal diperbarui";
      body = `${vendor.name} di ${areaLabels[vendor.landmark] ?? vendor.landmark} memiliki informasi terbaru.`;
    }

    const recipients = [];
    for (const user of users) {
      if (request && user._id === request.requesterId) continue;
      const preference = await ctx.db
        .query("notificationPreferences")
        .withIndex("byUser", (q) => q.eq("userId", user._id))
        .unique();
      if (
        !preference ||
        preference.whatsappUpdates !== true ||
        !preference.whatsappOptInAt ||
        !normalizePhone(preference.whatsappPhone ?? "")
      ) {
        continue;
      }
      if (
        (args.kind === "request_created" && preference.requestUpdates !== true) ||
        (args.kind === "request_status" && preference.requestUpdates !== true) ||
        (args.kind === "vendor_updated" && preference.areaUpdates !== true)
      ) {
        continue;
      }
      if (args.kind === "vendor_updated" && vendor) {
        const favorites = await ctx.db
          .query("favorites")
          .withIndex("byUser", (q) => q.eq("userId", user._id))
          .collect();
        if (!favorites.some((favorite) => favorite.vendorId === vendor._id)) continue;
      }

      const recent = await ctx.db
        .query("notifications")
        .withIndex("byUser", (q) => q.eq("userId", user._id))
        .collect();
      const deliveryKey = `whatsapp:${args.kind}:${args.entityId}`;
      if (recent.some((item) => item.kind === deliveryKey)) continue;
      const lastDay = recent.filter(
        (item) =>
          item.channel === "whatsapp" && now - item.createdAt < 24 * 60 * 60 * 1000,
      );
      if (lastDay.length >= 3) continue;

      recipients.push({
        userId: user._id,
        name: user.name ?? "Warga Sumenep",
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

export const recordWhatsappDelivery = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      userId: args.userId,
      kind: args.kind,
      title: args.title,
      body: args.body,
      channel: "whatsapp",
      providerMessageId: args.providerMessageId,
      read: true,
      createdAt: Date.now(),
    });
  },
});

async function sendWhatsappMessage(input: {
  phone: string;
  title: string;
  body: string;
}): Promise<{
  skipped: boolean;
  configured: boolean;
  messageId?: string;
}> {
  const config = twilioConfig();
  if (!config.configured || !config.accountSid || !config.authToken || !config.from) {
    return { skipped: true, configured: false };
  }
  const payload = new URLSearchParams({
    From: config.from,
    To: `whatsapp:${input.phone}`,
  });
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
    error_message?: string;
  };
  if (!response.ok) {
    throw new Error(result.error_message || result.message || "Twilio menolak pesan");
  }
  return { skipped: false, configured: true, messageId: result.sid };
}

async function deliver(
  ctx: GenericActionCtx<DataModel>,
  kind: NotificationKind,
  entityId: string,
): Promise<DeliveryResult> {
  const recipients: DeliveryRecipient[] = await ctx.runQuery(
    api.whatsapp.notificationRecipients,
    { kind, entityId },
  );
  if (!twilioConfig().configured) {
    return { configured: false, delivered: 0, skipped: recipients.length, failed: 0 };
  }
  let delivered = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      const result = await sendWhatsappMessage({
        phone: recipient.phone,
        title: recipient.title,
        body: recipient.body,
      });
      if (result.skipped) continue;
      await ctx.runMutation(api.whatsapp.recordWhatsappDelivery, {
        userId: recipient.userId,
        kind: recipient.deliveryKey,
        title: recipient.title,
        body: recipient.body,
        providerMessageId: result.messageId,
      });
      delivered += 1;
    } catch (error) {
      failed += 1;
      console.warn("WhatsApp delivery failed", error);
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

export const sendVendorUpdatedNotifications = internalAction({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args): Promise<DeliveryResult> =>
    deliver(ctx, "vendor_updated", args.vendorId),
});

export const sendTestWhatsapp = action({
  args: {},
  handler: async (ctx): Promise<{ sent: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Masuk untuk menguji notifikasi WhatsApp");
    const preference = await ctx.runQuery(
      api.whatsapp.preferencesForUser,
      { userId },
    );
    const phone = normalizePhone(preference?.whatsappPhone ?? "");
    if (
      !phone ||
      preference?.whatsappUpdates !== true ||
      !preference.whatsappOptInAt
    ) {
      throw new Error("Simpan nomor lalu aktifkan notifikasi WhatsApp terlebih dahulu");
    }
    const result = await sendWhatsappMessage({
      phone,
      title: "Sumenep Buku Kerja",
      body: `Halo ${preference.name}, notifikasi WhatsApp Anda sudah aktif.`,
    });
    if (result.skipped) throw new Error("Integrasi WhatsApp belum dikonfigurasi");
    if (result.messageId) {
      await ctx.runMutation(api.whatsapp.recordWhatsappDelivery, {
        userId,
        kind: "whatsapp:test",
        title: "WhatsApp aktif",
        body: "Pesan uji berhasil dikirim.",
        providerMessageId: result.messageId,
      });
    }
    return { sent: true };
  },
});
