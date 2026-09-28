import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericActionCtx, GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { buildTemplatePayload, buildTextPayload } from "../lib/whatsapp-payload";
import {
  ERROR_CODES,
  normalizeErrorReport,
  whatsappRecommendedAction,
} from "../lib/error-reporting";

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
    templateParams: {
      title: process.env.WHATSAPP_TEMPLATE_PARAM_TITLE ?? "judul",
      body: process.env.WHATSAPP_TEMPLATE_PARAM_BODY ?? "isi",
    },
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

/**
 * Provider aktif yang tidak bisa dipakai, atau `undefined` kalau sehat.
 *
 * `activeProvider()` menghormati `WHATSAPP_PROVIDER`, jadi variabel itu bisa
 * memaksa `twilio` sementara kredensial yang terpasang milik Meta. Kondisi ini
 * sebelumnya hanya muncul sebagai "belum dikonfigurasi" saat tombol ditekan.
 */
const providerIssue = () => {
  const provider = activeProvider();
  if (provider === "none") {
    return "Provider WhatsApp belum dikonfigurasi. Isi kredensial Meta (WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID) atau Twilio (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM) di tab Keys.";
  }
  const config = provider === "meta" ? metaConfig() : twilioConfig();
  if (!config.configured) {
    return `WHATSAPP_PROVIDER memaksa ${provider}, tapi kredensial ${provider} belum lengkap.`;
  }
  return undefined;
};

/**
 * Peringatan yang tidak memblokir, tapi hampir selalu jadi penyebab tunggal
 * kegagalan notifikasi yang dikirim dari server.
 */
const templateWarning = () => {
  if (activeProvider() !== "meta" || metaConfig().templateName) return undefined;
  const params = metaConfig();
  const titleVar = "{{" + params.templateParams.title + "}}";
  const bodyVar = "{{" + params.templateParams.body + "}}";
  return [
    "WHATSAPP_TEMPLATE_NAME belum diisi, jadi pesan dikirim sebagai teks bebas. Meta hanya mengizinkan teks bebas di dalam jendela layanan 24 jam, sedangkan notifikasi dari server hampir selalu berada di luar jendela itu dan ditolak dengan kode 131008.",
    "Buat template kategori UTILITY di WhatsApp Manager dengan body persis " + JSON.stringify(titleVar + "\n\n" + bodyVar) + " (dua variabel, dipisah satu baris kosong).",
    "Bahasa template default id; set WHATSAPP_TEMPLATE_LANGUAGE bila template disetujui sebagai en_US. Bila nama variabel template Anda berbeda, set WHATSAPP_TEMPLATE_PARAM_TITLE dan WHATSAPP_TEMPLATE_PARAM_BODY.",
  ].join(" ");
};

/** Kode yang paling sering muncul, diterjemahkan ke tindakan yang harus dilakukan. */
const providerFailureHints: Record<string, string> = {
  "131008": "Meta menolak pesan teks di luar jendela layanan 24 jam.",
  "131047": "Meta menganggap pesan harus diaktifkan ulang lewat template.",
  "131009": "Nilai parameter template ditolak Meta.",
  "132000": "Jumlah parameter template tidak cocok dengan template yang disetujui.",
  "132005": "Jumlah variabel template tidak cocok.",
  "133000": "Template tidak ditemukan atau belum disetujui di WhatsApp Manager.",
  "131042": "Bisnis belum memenuhi syarat template atau pembayaran.",
  "190": "Access token Meta kedaluwarsa atau dicabut.",
  "100": "Permintaan ditolak Meta; periksa format nomor tujuan.",
  "0": "Meta menolak autentikasi; periksa access token.",
  "21211": "Nomor WhatsApp pengirim di Twilio belum terverifikasi.",
  "21614": "Nomor pengirim Twilio tidak punya kemampuan WhatsApp.",
  "6060": "Nomor pengirim Twilio tidak bisa mengirim ke nomor tujuan.",
  "not_configured": "Kredensial provider aktif belum lengkap.",
  "provider_error": "Provider menolak pesan tanpa kode yang bisa dibaca.",
  "network": "Server tidak dapat menghubungi provider WhatsApp.",
};

const describeProviderFailure = (code: string, text?: string) => {
  const hint = providerFailureHints[code] ?? "Provider menolak pesan.";
  return `${hint} Kode ${code}${text ? `, pesan provider: ${text}` : ""}.`;
};

/** Fetch provider dibungkus supaya kegagalan jaringan punya kode sendiri. */
const fetchProvider = async (url: string, init: RequestInit, summary: string) => {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw providerError(summary, "network", error instanceof Error ? error.message : String(error));
  }
};

export const getWhatsappStatus = query({
  args: {},
  handler: async (ctx) => {
    const config = twilioConfig();
    const userId = await getAuthUserId(ctx);

    // Empat angka ringkasan dibaca dari SATU dokumen penghitung, bukan dari
    // mengagregasi seluruh tabel. Ini penting justru karena query ini reaktif:
    // setiap kali satu status pengiriman berubah, ia dijalankan ulang untuk
    // semua klien yang sedang membuka dashboard. Kalau biayanya tumbuh seiring
    // panjang riwayat pengiriman, maka satu kali kirim pesan akan membakar
    // kuota I/O lebih banyak dari sebelumnya — dan makin lama makin mahal.
    const stats = await ctx.db
      .query("whatsappDeliveryStats")
      .withIndex("byKey", (q) => q.eq("key", DELIVERY_STATS_KEY))
      .unique();

    const maskedFrom = config.from ? config.from.replace(/\d/g, "•") : undefined;
    const meta = metaConfig();
    // Status pengiriman dan chat masuk bersifat pribadi, jadi hanya diambil
    // untuk pengguna yang sedang masuk. Yang dibaca hanya pengiriman milik
    // pengguna ini lewat indeks `byUser`.
    const ownDeliveries = userId
      ? (
          await ctx.db
            .query("whatsappDeliveries")
            .withIndex("byUser", (q) => q.eq("userId", userId))
            .collect()
        )
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5)
          .map((delivery) => ({
            deliveryKey: delivery.deliveryKey,
            title: delivery.title,
            status: delivery.status,
            lastErrorCode: delivery.lastErrorCode,
            attempts: delivery.attempts,
            updatedAt: delivery.updatedAt,
          }))
      : [];
    const thread = userId
      ? await ctx.db
          .query("whatsappThreads")
          .withIndex("byUser", (q) => q.eq("userId", userId))
          .unique()
      : null;
    return {
      configured: !providerIssue(),
      provider: activeProvider(),
      providerIssue: providerIssue(),
      templateWarning: templateWarning(),
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
      recent: ownDeliveries,
      thread: thread
        ? {
            lastInboundAt: thread.lastInboundAt,
            lastInboundBody: thread.lastInboundBody,
            lastInboundKind: thread.lastInboundKind,
            unread: thread.unread,
          }
        : null,
      // Bentuknya sengaja dipertahankan persis: empat angka yang sama, dengan
      // arti yang sama — jumlah baris yang saat ini berstatus itu.
      deliveryCounts: {
        queued: stats?.queued ?? 0,
        sent: stats?.sent ?? 0,
        delivered: stats?.delivered ?? 0,
        failed: stats?.failed ?? 0,
      },
    };
  },
});

/** Tandai pesan masuk terakhir sudah dibaca. Satu thread per pengguna. */
export const markWhatsappThreadRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const thread = await ctx.db
      .query("whatsappThreads")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    if (!thread || !thread.unread) return false;
    await ctx.db.patch(thread._id, { unread: false, updatedAt: Date.now() });
    return true;
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
      // Delivery rows milik warga saja yang dihitung. Baris `audience: system`
      // tidak punya `userId`, jadi tidak pernah muncul di query `byUser` ini dan
      // tidak pernah menghabiskan kuota warga.
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

/**
 * Alasan alert admin tidak bisa dikirim saat ini.
 *
 * Dicek sebelum mencoba mengirim, supaya provider yang memang tidak bisa
 * mengirim tidak pernah membakar baris delivery dan tidak pernah memunculkan
 * error yang-balJadi laporan kedua. Dilaporkan sebagai daftar, bukan error,
 * karena ini kondisi yang diketahui -- bukan kegagalan yang baru terjadi.
 */
export const adminAlertBlockers = internalQuery({
  args: {},
  handler: async () => {
    const blockers: string[] = [];
    const issue = providerIssue();
    if (issue) blockers.push(issue);
    if (activeProvider() === "meta" && !metaConfig().templateName) {
      blockers.push(
        "Template WhatsApp Utility belum disetujui, jadi Meta akan menolak pesan yang dikirim dari server (kode 131008).",
      );
    }
    return blockers;
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

/** Potong teks error provider supaya aman disimpan dan ditampilkan. */
const safeErrorText = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 300) : undefined;

type ProviderError = Error & { providerCode?: string; providerText?: string };

/**
 * Bungkus penolakan provider jadi error yang membawa kode dan pesan aslinya.
 *
 * Sebelumnya kode provider dibuang dan diganti satu kalimat generik, sehingga
 * operator tidak pernah tahu apakah masalahnya token kedaluwarsa, template
 * belum disetujui, atau nomor belum terverifikasi.
 */
const providerError = (summary: string, code: unknown, text?: string) => {
  const error = new Error(summary) as ProviderError;
  error.providerCode = safeErrorCode(code);
  error.providerText = safeErrorText(text);
  return error;
};

const errorCodeOf = (error: unknown) =>
  error && typeof error === "object" && "providerCode" in error
    ? String((error as ProviderError).providerCode)
    : "provider_error";

const errorTextOf = (error: unknown) =>
  error && typeof error === "object" && "providerText" in error
    ? safeErrorText((error as ProviderError).providerText)
    : undefined;

export const DELIVERY_STATS_KEY = "global";
export type DeliveryStatus = "queued" | "sent" | "delivered" | "failed";

/**
 * Geser hitungan status pengiriman sebanyak `delta`.
 *
 * Diekspor karena ada dua pihak yang mengubah isi `whatsappDeliveries`: alur
 * pengiriman di berkas ini, dan retensi harian di `dataRetention.ts` yang
 * menghapus baris lama. Kalau hanya salah satunya memperbarui ringkasan, dua
 * angka di dashboard akan mulai berbeda dari kenyataan tanpa ada yang tahu —
 * jadi keduanya memakai fungsi yang sama ini.
 */
export async function applyDeliveryDelta(
  ctx: GenericMutationCtx<DataModel>,
  delta: Partial<Record<DeliveryStatus, number>>,
) {
  const now = Date.now();
  const current = await ctx.db
    .query("whatsappDeliveryStats")
    .withIndex("byKey", (q) => q.eq("key", DELIVERY_STATS_KEY))
    .unique();
  const next = {
    queued: current?.queued ?? 0,
    sent: current?.sent ?? 0,
    delivered: current?.delivered ?? 0,
    failed: current?.failed ?? 0,
  };
  for (const status of Object.keys(delta) as DeliveryStatus[]) {
    // `Math.max(0, ...)` menjaga agar pengurangan tidak pernah melewati nol
    // kalau ada baris lama yang belum pernah ikut dihitung.
    next[status] = Math.max(0, next[status] + (delta[status] ?? 0));
  }
  if (current) {
    await ctx.db.patch(current._id, { ...next, updatedAt: now });
  } else {
    await ctx.db.insert("whatsappDeliveryStats", {
      key: DELIVERY_STATS_KEY,
      ...next,
      updatedAt: now,
    });
  }
}

/**
 * Pindahkan hitungan dari satu status ke status lain.
 *
 * `from` dan `to` menyatakan PERPINDAHAN, bukan penambahan. Dokumen ringkasan
 * ini menyimpan berapa baris yang SAAT INI berstatus demikian, jadi setiap
 * transisi harus mengurangi yang lama dan menambah yang baru — kalau hanya
 * ditambah, angkanya menjadi "total sepanjang masa" dan tidak lagi sama dengan
 * isi tabelnya. Kesamaan itu yang membuat angkanya bisa diaudit: tesnya
 * membandingkan dokumen ini dengan hasil pengelompokan tabel yang sesungguhnya.
 */
async function adjustDeliveryStats(
  ctx: GenericMutationCtx<DataModel>,
  from: DeliveryStatus | null,
  to: DeliveryStatus | null,
) {
  if (from === to) return;
  const delta: Partial<Record<DeliveryStatus, number>> = {};
  if (from) delta[from] = (delta[from] ?? 0) - 1;
  if (to) delta[to] = (delta[to] ?? 0) + 1;
  await applyDeliveryDelta(ctx, delta);
}

/**
 * Hitung ulang dokumen ringkasan dari isi tabel yang sebenarnya.
 *
 * Idempoten: nilainya dihitung dari tabel, bukan ditambahkan, jadi menjalankan
 * dua kali memberi angka yang sama. Dipakai sekali untuk menyelaraskan data
 * lama yang belum pernah dihitung, dan bisa dipanggil lagi kapan pun sebagai
 * jalan perbaikan kalau ada jalur tulis yang keliru mengubah sebuah status.
 */
export const backfillWhatsappStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("whatsappDeliveries").collect();
    const counts: Record<DeliveryStatus, number> = {
      queued: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
    };
    for (const row of rows) counts[row.status] += 1;

    const now = Date.now();
    const current = await ctx.db
      .query("whatsappDeliveryStats")
      .withIndex("byKey", (q) => q.eq("key", DELIVERY_STATS_KEY))
      .unique();
    if (current) {
      await ctx.db.patch(current._id, { ...counts, updatedAt: now });
    } else {
      await ctx.db.insert("whatsappDeliveryStats", {
        key: DELIVERY_STATS_KEY,
        ...counts,
        updatedAt: now,
      });
    }
    return { scanned: rows.length, ...counts };
  },
});

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
      audience: "resident",
      status: "queued",
      attempts: 0,
      title: args.title,
      body: args.body,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await adjustDeliveryStats(ctx, null, "queued");
    return { id, shouldSend: true, status: "queued" as const, attempts: 0 };
  },
});

/**
 * Baris delivery untuk kiriman sistem (alert bug ke admin).
 *
 * Sengaja TIDAK memakai `queueWhatsappDelivery`: fungsi itu selalu punya
 * `userId`, sedangkan alert admin tidak milik warga mana pun. Karena
 * `userId`-nya kosong, baris ini otomatis tidak ikut menghitung kuota tiga
 * pesan per hari -- `notificationRecipients` hanya membaca lewat indeks
 * `byUser` milik penerima tertentu.
 */
export const queueSystemDelivery = internalMutation({
  args: {
    deliveryKey: v.string(),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whatsappDeliveries")
      .withIndex("byDeliveryKey", (q) => q.eq("deliveryKey", args.deliveryKey))
      .unique();
    if (existing) {
      return { id: existing._id, shouldSend: false, status: existing.status };
    }
    const now = Date.now();
    const id = await ctx.db.insert("whatsappDeliveries", {
      deliveryKey: args.deliveryKey,
      audience: "system",
      status: "queued",
      attempts: 0,
      title: args.title,
      body: args.body,
      createdAt: now,
      updatedAt: now,
    });
    await adjustDeliveryStats(ctx, null, "queued");
    return { id, shouldSend: true, status: "queued" as const };
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
    await adjustDeliveryStats(ctx, current.status, "sent");

    // Notifikasi dalam aplikasi hanya milik warga. Alert sistem tidak boleh
    // muncul di lonceng notifikasi siapa pun.
    //
    // Sebelumnya ada DUA blok penyisipan di sini, dan keduanya membaca daftar
    // `notifications` yang sama yang diambil SEBELUM blok pertama menyisipkan.
    // Akibatnya setiap notifikasi warga tersimpan dua kali: satu baris ganda
    // yang tampil dobel di lonceng, dan satu baris tambahan tanpa pemilik untuk
    // setiap alert sistem — yang tidak pernah bisa dibaca siapa pun karena
    // selalu dibaca lewat indeks `byUser`. Blok kedua dihapus, bukan
    // dilonggarkan.
    if (!current.userId) return;
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("byUser", (q) => q.eq("userId", current.userId!))
      .collect();
    if (notifications.some((notification) => notification.kind === current.deliveryKey)) return;
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
  },
});

export const markWhatsappFailed = internalMutation({
  args: { id: v.id("whatsappDeliveries"), errorCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current || current.status === "delivered") return;
    const attempts = current.attempts + 1;
    // Pesan uji tidak dijadwalkan ulang: file selalu dikirim manual oleh pemiliknya,
    // jadi retry hanya menambah derau dan menghabiskan kuota harian. Alert sistem
    // juga tidak: kegagalannya sudah tercatat di laporan errornya sendiri, dan
    // retry diam-diam akan membuat bug yang sama_DOMAIN muncul berulang.
    const isTest = current.deliveryKey.startsWith("whatsapp:test:");
    const isSystem = current.audience === "system" || !current.userId;
    const nextAttemptAt = !isTest && !isSystem && attempts < 3 ? Date.now() + attempts * 60_000 : undefined;
    await ctx.db.patch(args.id, {
      status: "failed",
      attempts,
      lastErrorCode: safeErrorCode(args.errorCode),
      nextAttemptAt,
      updatedAt: Date.now(),
    });
    await adjustDeliveryStats(ctx, current.status, "failed");
    if (nextAttemptAt) {
      await ctx.scheduler.runAfter(attempts * 60_000, internal.whatsapp.retryWhatsappDelivery, { deliveryId: args.id });
    }
  },
});

export const reopenFailedDelivery = internalMutation({
  args: { id: v.id("whatsappDeliveries") },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current || current.status !== "failed") return false;
    await ctx.db.patch(args.id, {
      status: "queued",
      lastErrorCode: undefined,
      nextAttemptAt: undefined,
      updatedAt: Date.now(),
    });
    await adjustDeliveryStats(ctx, "failed", "queued");
    return true;
  },
});

/**
 * Nomor yang disimpan pengguna bisa ditulis `08...`, `+62...`, atau `62...`,
 * sedangkan webhook selalu mengirim bentuk digits `62...`. Satu index lookup
 * per bentuk kandidat, bukan scan penuh tabel preferensi.
 */
const phoneCandidates = (phone: string) => {
  const national = phone.startsWith("62") ? `0${phone.slice(2)}` : `0${phone.replace(/^0+/, "")}`;
  return [phone, `+${phone}`, national];
};

const preferenceForPhone = async (ctx: GenericMutationCtx<DataModel>, phone: string) => {
  for (const candidate of phoneCandidates(phone)) {
    const found = await ctx.db
      .query("notificationPreferences")
      .withIndex("byPhone", (q) => q.eq("whatsappPhone", candidate))
      .first();
    if (found) return found;
  }
  return null;
};

/**
 * Simpan satu pesan masuk dari webhook.
 *
 * Webhook sebelumnya hanya dibaca sisi status, jadi chat masuk hilang tanpa
 * jejak. Baris thread di-overwrite per nomor, bukan per pesan, supaya dashboard
 * menampilkan pesan terakhir tanpa database tumbuh tanpa batas.
 */
export const recordInboundMessage = internalMutation({
  args: {
    phone: v.string(),
    providerMessageId: v.string(),
    body: v.string(),
    kind: v.string(),
    at: v.number(),
  },
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (!phone) return null;
    // Balasan lama yang telat sampai tidak boleh menimpa pesan yang lebih baru.
    const existing = await ctx.db
      .query("whatsappThreads")
      .withIndex("byPhone", (q) => q.eq("phone", phone))
      .unique();
    const now = Date.now();
    const lastInboundAt = args.at > 0 ? args.at : now;
    if (existing && existing.lastInboundAt > lastInboundAt) return existing._id;
    const preference = await preferenceForPhone(ctx, phone);
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: preference?.userId ?? existing.userId,
        providerMessageId: args.providerMessageId,
        lastInboundAt,
        lastInboundBody: args.body,
        lastInboundKind: args.kind,
        unread: true,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("whatsappThreads", {
      phone,
      userId: preference?.userId,
      providerMessageId: args.providerMessageId,
      lastInboundAt,
      lastInboundBody: args.body,
      lastInboundKind: args.kind,
      unread: true,
      createdAt: now,
      updatedAt: now,
    });
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
    await adjustDeliveryStats(ctx, delivery.status, args.status);
    if (nextAttemptAt) {
      await ctx.scheduler.runAfter(Math.max(1, delivery.attempts) * 60_000, internal.whatsapp.retryWhatsappDelivery, { deliveryId: delivery._id });
    }
    return true;
  },
});

async function postMetaMessage(
  config: ReturnType<typeof metaConfig>,
  payload: Record<string, unknown>,
): Promise<{ messageId?: string }> {
  if (!config.configured || !config.accessToken || !config.phoneNumberId) {
    throw new Error("Integrasi WhatsApp belum dikonfigurasi");
  }
  const response = await fetchProvider(
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
    "Gagal menghubungi Graph API Meta",
  );
  const result = (await response.json()) as {
    messages?: Array<{ id?: string }>;
    error?: { code?: number; message?: string; error_subcode?: number; details?: string };
  };
  if (!response.ok) {
    throw providerError(
      "Meta menolak pesan",
      result.error?.code ?? response.status,
      result.error?.error_subcode
        ? `${result.error.message ?? "ditolak"} (subcode ${result.error.error_subcode})`
        : result.error?.message,
    );
  }
  return { messageId: result.messages?.[0]?.id };
}

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
        titleParam: config.templateParams.title,
        bodyParam: config.templateParams.body,
      })
    : buildTextPayload(input);
  const result = await postMetaMessage(config, payload);
  return { skipped: false, configured: true, messageId: result.messageId };
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
  const response = await fetchProvider(
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
    "Gagal menghubungi API Twilio",
  );
  const result = (await response.json()) as {
    sid?: string;
    message?: string;
    code?: string | number;
  };
  if (!response.ok) {
    throw providerError("Twilio menolak pesan", result.code ?? response.status, result.message);
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
  if (providerIssue()) {
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
        await ctx.runMutation(internal.whatsapp.markWhatsappFailed, { id: queued.id, errorCode: errorCodeOf(error) });
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

/**
 * Satu-satunya jalan keluar untuk pesan sistem (alert bug ke admin).
 *
 * Sengaja memakai `sendWhatsappMessage` yang sama dengan notifikasi warga:
 * satu klien WhatsApp di repo ini, satu daftar provider, satu format
 * payload, satu penanganan error. Tidak ada SDK atau jalur kedua.
 *
 * Tidak pernah memanggil pelapor error. Kegagalan pengiriman dikembalikan
 * sebagai nilai, bukan dilempar ke atas, supaya `deliverAdminAlert` bisa
 * menandainya `blocked` tanpa memicu laporan kedua.
 */
/**
 * Ringkasan harian untuk admin.
 *
 * Tiga angka saja, dan ketiganya dibaca lewat indeks dengan batas atas —
 * bukan dengan menghitung seluruh tabel. Ini Sending HARIAN, bukan laporan
 * lengkap: kalau tidak ada yang perlu diketahui, angka nol tetap dikirim,
 * karena "tidak ada apa-apa hari ini" adalah informasi yang berguna.
 */
export const adminDailySummaryCounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const since = Date.now() - 24 * 60 * 60_000;
    const [openErrors, newRequests, presence] = await Promise.all([
      ctx.db
        .query("errorReports")
        .withIndex("byStatus", (q) => q.eq("status", "open"))
        .take(1_000),
      ctx.db
        .query("serviceRequests")
        .withIndex("byCreatedAt", (q) => q.gte("createdAt", since))
        .take(1_000),
      // Tabel `adminPresence` hanya berisi pengelola yang sedang masuk, jadi
      // jumlahnya kecil; batas 200 tetap dipasang supaya tidak pernah berubah
      // menjadi pemindaian penuh kalau strukturnya nanti bertambah.
      ctx.db.query("adminPresence").take(200),
    ]);
    const activeSessions = presence.filter((row) => Date.now() - row.lastSeenAt < 15 * 60_000).length;
    return {
      openErrorReports: openErrors.length,
      newRequests: newRequests.length,
      activeAdminSessions: activeSessions,
    };
  },
});

/**
 * Kirim ringkasan harian (dipanggil cron, dan bisa dipanggil manual).
 *
 * Idempoten lewat `deliveryKey` yang memuat tanggal WIB: jalan dua kali pada
 * hari yang sama tidak menghasilkan dua pesan, dan bangun ulang cron setelah
 * kegagalan tidak mengirim ulang pesan yang sudah sampai.
 *
 * Nomor tujuan memakai `ERROR_ALERT_WHATSAPP` yang sama dengan alert error.
 * Kalau kosong, pengiriman DILEWATI dengan alasan tercatat — bukan nomor
 * cadangan yang tertulis di source, dan bukan pesan yang diam-diam hilang.
 */
export const sendAdminDailySummary = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ sent: boolean; reason?: string; summary?: { openErrorReports: number; newRequests: number; activeAdminSessions: number } }> => {
    const summary = await ctx.runQuery(internal.whatsapp.adminDailySummaryCounts, {});
    // Tanggal WIB (UTC+7) — zona waktu operasi, bukan zona server.
    const wib = new Date(Date.now() + 7 * 60 * 60_000).toISOString().slice(0, 10);
    const phone = (process.env.ERROR_ALERT_WHATSAPP ?? "").trim();
    if (!phone) {
      return { sent: false as const, reason: "ERROR_ALERT_WHATSAPP belum diisi", summary };
    }
    const body = [
      `Laporan Buku Kerja ${wib}`,
      `Laporan error belum ditangani: ${summary.openErrorReports}`,
      `Permintaan warga 24 jam: ${summary.newRequests}`,
      `Sesi admin aktif: ${summary.activeAdminSessions}`,
    ].join("\n");
    // Logika pengiriman TIDAK diduplikasi: ringkasan ini memakai action alert
    // yang sama dengan notifikasi error, lengkap dengan dedup `deliveryKey`,
    // percobaan ulang, dan pencatatan status kiriman yang sama.
    const result = await ctx.runAction(internal.whatsapp.sendAdminAlert, {
      deliveryKey: `admin-summary:${wib}`,
      phone,
      title: "Ringkasan harian Buku Kerja",
      body,
    });
    return { ...result, summary };
  },
});

export const sendAdminAlert = internalAction({
  args: {
    deliveryKey: v.string(),
    phone: v.string(),
    title: v.string(),
    body: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ sent: boolean; reason?: string; messageId?: string }> => {
    const phone = normalizePhone(args.phone);
    if (!phone) return { sent: false, reason: "nomor tujuan alert tidak valid" };
    const queued = await ctx.runMutation(internal.whatsapp.queueSystemDelivery, {
      deliveryKey: args.deliveryKey,
      title: args.title,
      body: args.body,
    });
    if (!queued.shouldSend) {
      // Percobaan sebelumnya gagal: buka lagi baris yang sama supaya jejak
      // audit tetap satu dan nomor tidak terbih dua kali.
      const reopened =
        queued.status === "failed"
          ? await ctx.runMutation(internal.whatsapp.reopenFailedDelivery, { id: queued.id })
          : false;
      if (!reopened) {
        return { sent: queued.status === "sent" || queued.status === "delivered" };
      }
    }
    try {
      const result = await sendWhatsappMessage({
        phone,
        title: args.title,
        body: args.body,
      });
      if (result.skipped) {
        await ctx.runMutation(internal.whatsapp.markWhatsappFailed, {
          id: queued.id,
          errorCode: "not_configured",
        });
        return { sent: false, reason: "provider tidak dikonfigurasi" };
      }
      await ctx.runMutation(internal.whatsapp.markWhatsappSent, {
        id: queued.id,
        providerMessageId: result.messageId,
      });
      return { sent: true, messageId: result.messageId };
    } catch (error) {
      await ctx.runMutation(internal.whatsapp.markWhatsappFailed, {
        id: queued.id,
        errorCode: errorCodeOf(error),
      });
      // Baris delivery yang sama dibuka kembali pada percobaan berikutnya,
      // bukan membuat baris baru: satu laporan, satu jejak audit.
      return { sent: false, reason: errorCodeOf(error) };
    }
  },
});

export const retryWhatsappDelivery = internalAction({
  args: { deliveryId: v.id("whatsappDeliveries") },
  handler: async (ctx, args) => {
    const delivery = await ctx.runQuery(internal.whatsapp.deliveryForRetry, { deliveryId: args.deliveryId });
    if (!delivery || delivery.status === "delivered" || delivery.status === "sent" || delivery.attempts >= 3 || (delivery.nextAttemptAt !== undefined && delivery.nextAttemptAt > Date.now())) return { sent: false };
    // Alert sistem ke admin tidak punya akun pengirim, jadi tidak bisa di-retry
    // dari preferensi warga. Tidak ada yang perlu diulang di sini.
    if (!delivery.userId) return { sent: false };
    // Sebelumnya guard ini memakai `twilioConfig()`, jadi pada instalasi yang
    // memakai Meta saja retry selalu berhenti di sini tanpa satu percobaan pun.
    if (providerIssue()) return { sent: false };
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
      await ctx.runMutation(internal.whatsapp.markWhatsappFailed, { id: delivery._id, errorCode: errorCodeOf(error) });
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
    const issue = providerIssue();
    if (issue) throw new Error(issue);
    const deliveryKey = `whatsapp:test:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const queued = await ctx.runMutation(internal.whatsapp.queueWhatsappDelivery, {
      userId,
      deliveryKey,
      title: "WhatsApp aktif",
      body: "Pesan uji berhasil dikirim.",
    });
    if (!queued.shouldSend) {
      // Percobaan yang gagal sebelumnya tidak boleh mengunci seluruh hari:
      // salah konfigurasi hampir selalu diperbaiki lalu diuji ulang di hari yang
      // sama. Baris yang sama dibuka lagi supaya jejak audit tetap satu baris.
      const reopened =
        queued.status === "failed"
          ? await ctx.runMutation(internal.whatsapp.reopenFailedDelivery, { id: queued.id })
          : false;
      if (!reopened) {
        throw new Error("Pesan uji sudah dikirim hari ini. Periksa status pengiriman di bawah sebelum mencoba lagi.");
      }
    }
    try {
      const result = await sendWhatsappMessage({
        phone,
        title: "Sumenep Buku Kerja",
        body: `Halo ${preference.name}, notifikasi WhatsApp Anda sudah aktif.`,
      });
      if (result.skipped) throw providerError("Integrasi WhatsApp belum dikonfigurasi", "not_configured");
      await ctx.runMutation(internal.whatsapp.markWhatsappSent, { id: queued.id, providerMessageId: result.messageId });
      return { sent: true };
    } catch (error) {
      const code = errorCodeOf(error);
      const userFacing = describeProviderFailure(code, errorTextOf(error));
      await ctx.runMutation(internal.whatsapp.markWhatsappFailed, { id: queued.id, errorCode: code });
      // Ini insiden yang sedang kita tangani. Dicatat lewat
      // jalur pelaporan terpusat supaya ada laporan, ada alert ke admin, dan
      // ada jejak audit -- bukan cuma kalimat merah di layar.
      const report = normalizeErrorReport(
        {
          kind: "integration",
          code: ERROR_CODES.whatsappSend,
          severity: "error",
          source: "server",
          feature: "WhatsApp Notification Settings",
          operation: "whatsapp.sendTestWhatsapp",
          route: "/dashboard",
          message: errorTextOf(error) ?? (error instanceof Error ? error.message : userFacing),
          userMessage: userFacing,
          provider: activeProvider(),
          providerCode: code,
          providerMessage: errorTextOf(error),
          userId,
          retryable: true,
          recommendedAction: whatsappRecommendedAction({
            providerCode: code,
            templateConfigured: Boolean(metaConfig().templateName),
            providerIssue: providerIssue(),
          }),
          context: { deliveryKey, stage: "send" },
        },
        Date.now(),
      );
      if (report) {
        await ctx.runMutation(internal.errorReports.recordServerError, {
          kind: "integration",
          code: ERROR_CODES.whatsappSend,
          severity: "error",
          source: "server",
          feature: report.feature,
          operation: report.operation,
          route: report.route,
          message: report.message,
          userMessage: report.userMessage,
          provider: report.provider,
          providerCode: report.providerCode,
          providerMessage: report.providerMessage,
          retryable: true,
          recommendedAction: report.recommendedAction,
          context: report.context,
          actorId: userId,
        });
      }
      // Ini pesan yang dibaca orang, jadi harus menyebut penyebab dan kodenya.
      // Kalimat generik sebelumnya membuat masalah ini mustahil didiagnosis.
      throw new Error(userFacing);
    }
  },
});
