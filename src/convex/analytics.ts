import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { requireManagementViewer } from "./access";

const eventNameValidator = v.union(
  v.literal("search_impression"),
  v.literal("listing_opened"),
  v.literal("whatsapp_clicked"),
  v.literal("share_clicked"),
  v.literal("call_clicked"),
  v.literal("request_created"),
  v.literal("request_claimed"),
  v.literal("request_completed"),
  v.literal("listing_published"),
  v.literal("listing_archived"),
  v.literal("photo_uploaded"),
  v.literal("notification_opted_in"),
  v.literal("request_matched"),
  v.literal("request_expired"),
  v.literal("request_reopened"),
);

/**
 * Batas laju peristiwa per perangkat per jam.
 *
 * Angka dipilih jauh di atas pemakaian nyata satu orang (puluhan peristiwa saat
 * menjelajah), tapi cukup rendah sehingga satu peramban yang rusak atau bermusik
 * tidak bisa mengisi kuota. Peristiwa tanpa `anonymousId` tidak ikut dibatasi.
 */
export const TRACK_ANONYMOUS_HOURLY_LIMIT = 300;
const TRACK_RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Nama peristiwa yang punya penghitung kumulatif.
 *
 * Daftarnya sengaja ditulis eksplisit, bukan diturunkan dari validator: kalau
 * diturunkan, menambah satu jenis peristiwa diam-diam menambah kolom baru di
 * dashboard tanpa ada yang memutuskan begitu.
 */
export const ANALYTICS_COUNTER_KEYS = [
  "search_impression",
  "listing_opened",
  "whatsapp_clicked",
  "share_clicked",
  "call_clicked",
  "request_created",
  "request_claimed",
  "request_completed",
  "listing_published",
  "listing_archived",
  "photo_uploaded",
  "notification_opted_in",
] as const;

/**
 * Tambah satu ke penghitung kumulatif jenis peristiwa ini.
 *
 * Dipanggil dari dalam `recordEvent`, bukan dari tiap pemanggilnya. Ada
 * belasan tempat yang mencatat peristiwa, dan menyuruh tiap tempat ikut
 * menambah penghitung berarti belasan tempat yang bisa lupa satu langkah —
 * angkanya lalu diam-diam salah tanpa ada yang tahu.
 */
async function bumpCounter(ctx: GenericMutationCtx<DataModel>, event: string) {
  const key = event.slice(0, 80);
  const existing = await ctx.db
    .query("analyticsCounters")
    .withIndex("byKey", (q) => q.eq("key", key))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { count: existing.count + 1, updatedAt: Date.now() });
    return;
  }
  await ctx.db.insert("analyticsCounters", { key, count: 1, updatedAt: Date.now() });
}

/**
 * Baca semua penghitung yang dipakai dashboard. Satu pembacaan titik per jenis
 * peristiwa — tidak peduli sudah berapa juta baris log yang menumpuk.
 */
async function readCounters(
  ctx: GenericQueryCtx<DataModel>,
): Promise<Record<string, number>> {
  const rows = await Promise.all(
    ANALYTICS_COUNTER_KEYS.map((key) =>
      ctx.db.query("analyticsCounters").withIndex("byKey", (q) => q.eq("key", key)).unique(),
    ),
  );
  return Object.fromEntries(
    ANALYTICS_COUNTER_KEYS.map((key, index) => [key, rows[index]?.count ?? 0]),
  );
}

export async function recordEvent(
  ctx: GenericMutationCtx<DataModel>,
  input: {
    event: string;
    userId?: DataModel["users"]["document"]["_id"];
    anonymousId?: string;
    vendorId?: DataModel["vendors"]["document"]["_id"];
    requestId?: DataModel["serviceRequests"]["document"]["_id"];
    metadata?: Record<string, string | number | boolean | undefined>;
  },
) {
  await bumpCounter(ctx, input.event);
  return await ctx.db.insert("analyticsEvents", {
    event: input.event.slice(0, 80),
    userId: input.userId,
    anonymousId: input.anonymousId?.slice(0, 120),
    vendorId: input.vendorId,
    requestId: input.requestId,
    metadata: input.metadata,
    createdAt: Date.now(),
  });
}

/**
 * Isi penghitung dari log yang sudah ada.
 *
 * Diperlukan sekali, saat tabel penghitung baru dibuat: tanpa ini dashboard
 * menampilkan nol untuk semua peristiwa yang terjadi sebelum tabelnya ada.
 * Idempoten — menjalankannya dua kali menghasilkan angka yang sama, karena
 * nilainya dihitung ulang dari log, bukan ditambahkan.
 */
export const backfillAnalyticsCounters = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("analyticsEvents").collect();
    const totals = new Map<string, number>();
    for (const row of events) {
      totals.set(row.event, (totals.get(row.event) ?? 0) + 1);
    }

    let written = 0;
    for (const [key, count] of totals) {
      const existing = await ctx.db
        .query("analyticsCounters")
        .withIndex("byKey", (q) => q.eq("key", key))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { count, updatedAt: Date.now() });
      } else {
        await ctx.db.insert("analyticsCounters", { key, count, updatedAt: Date.now() });
      }
      written += 1;
    }
    return { scanned: events.length, counters: written };
  },
});

export const track = mutation({
  args: {
    event: eventNameValidator,
    anonymousId: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    requestId: v.optional(v.id("serviceRequests")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    // Pembatasan laju per PERANGKAT.
    //
    // `track` dipanggil dari peramban tanpa wajib login, jadi tanpa batas ini
    // satu skrip bisa menulis ribuan baris per menit ke `analyticsEvents` dan
    // membakar kuota Function calls — bukan cuma kuota I/O.
    //
    // Batasnya dipasang pada `anonymousId` (id perangkat dari localStorage),
    // BUKAN pada "tidak masuk": penyedia Anonymous Convex Auth sudah memberi
    // `userId` kepada pengunjung tanpa akun, sehingga syarat "tidak masuk"
    // hampir tidak pernah benar dan batasnya jadi sia-sia. Batas per perangkat
    // juga lebih tepat sasaran: yang bisa disalahgunakan adalah satu peramban,
    // bukan status masuknya.
    //
    // Angkanya jauh di atas pemakaian nyata satu orang (puluhan peristiwa saat
    // menjelajah). Peristiwa yang TIDAK membawa `anonymousId` — panggilan dari
    // server sendiri, atau klien yang opting out — tidak pernah dibatasi.
    //
    // Pembacaannya BOUNDED: indeks (anonymousId, createdAt) membuat rentang satu
    // jam per perangkat, lalu `.take(limit + 1)` berhenti di-ASAP begitu batas
    // terlampaui. Tidak ada satu pun pemindaian tabel penuh di jalur ini.
    if (args.anonymousId) {
      const windowStart = Date.now() - TRACK_RATE_WINDOW_MS;
      const recent = await ctx.db
        .query("analyticsEvents")
        .withIndex("byAnonymousCreatedAt", (q) =>
          q.eq("anonymousId", args.anonymousId!).gte("createdAt", windowStart),
        )
        .take(TRACK_ANONYMOUS_HOURLY_LIMIT + 1);
      if (recent.length >= TRACK_ANONYMOUS_HOURLY_LIMIT) return null;
    }

    // Bound anonymous payloads to keep analytics useful without becoming a
    // general-purpose data store.
    const metadata = args.metadata && typeof args.metadata === "object"
      ? Object.fromEntries(Object.entries(args.metadata).slice(0, 12).map(([key, value]) => [key.slice(0, 40), typeof value === "string" ? value.slice(0, 120) : typeof value === "number" || typeof value === "boolean" ? value : undefined]).filter(([, value]) => value !== undefined))
      : undefined;
    const id = await recordEvent(ctx, {
      event: args.event,
      userId: userId ?? undefined,
      anonymousId: args.anonymousId,
      vendorId: args.vendorId,
      requestId: args.requestId,
      metadata: metadata as Record<string, string | number | boolean> | undefined,
    });
    return id;
  },
});

export const adminMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireManagementViewer(ctx);

    // Sisa tiga pembacaan penuh digantikan rentang indeks yang sama artinya:
    //  - `vendors`      → hanya yang berstatus aktif (indeks `byStatus`)
    //  - `vendorPhotos` → hanya yang `approved` (indeks `byModeration`).
    //                     Syaratnya memang persis `moderationStatus ===
    //                     "approved"`, jadi ini bukan pendekatan yang mirip,
    //                     melainkan himpunan yang sama.
    //  - `serviceRequests` → dihitung per vendor lewat indeks `byVendor`, dan
    //                     statusnya lewat `byStatus`, bukan dengan membaca
    //                     seluruh riwayat permintaan warga.
    const [counters, active, approvedPhotos, completedRequests] = await Promise.all([
      readCounters(ctx),
      ctx.db.query("vendors").withIndex("byStatus", (q) => q.eq("status", "active")).collect(),
      ctx.db
        .query("vendorPhotos")
        .withIndex("byModeration", (q) => q.eq("moderationStatus", "approved"))
        .collect(),
      ctx.db
        .query("serviceRequests")
        .withIndex("byStatus", (q) => q.eq("status", "completed"))
        .collect(),
    ]);
    const count = (event: string) => counters[event] ?? 0;
    const photoIds = new Set(approvedPhotos.filter((photo) => photo.active !== false).map((photo) => photo.vendorId));
    const byCategory = Object.fromEntries([...new Set(active.map((vendor) => vendor.category))].map((category) => [category, active.filter((vendor) => vendor.category === category).length]));
    const byArea = Object.fromEntries([...new Set(active.map((vendor) => vendor.landmark))].map((area) => [area, active.filter((vendor) => vendor.landmark === area).length]));
    const searchCount = count("search_impression");
    const whatsappCount = count("whatsapp_clicked");
    const responseValues = active.map((vendor) => vendor.responseMinutes).filter((value): value is number => typeof value === "number" && value > 0);
    // "Paling responsif" hanya masuk akal untuk listing yang benar-benar tayang:
    // listing draft atau arsip tidak bisa dihubungi warga, jadi menyebutnya
    // sebagai provider terbaik justru menyesatkan.
    //
    // Aturan 4: finalis (8 nama paling responsif) dipilih DULU, baru
    // permintaannya dihitung. Menghitung `byVendor` untuk SEMUA kandidat lalu
    // membuang semua kecuali 8 adalah pemindaian yang tidak pernah tampil di
    // dashboard.
    const providerCandidates = active.filter((vendor) => vendor.ownerId);
    const finalists = [...providerCandidates]
      .sort((a, b) => (a.responseMinutes ?? 999999) - (b.responseMinutes ?? 999999))
      .slice(0, 8);
    // Jumlah permintaan per vendor dibaca lewat indeks `byVendor` milik vendor
    // itu saja — dan hanya untuk 8 finalis di atas.
    const finalistRequestCounts = await Promise.all(
      finalists.map(async (vendor) =>
        (await ctx.db
          .query("serviceRequests")
          .withIndex("byVendor", (q) => q.eq("vendorId", vendor._id))
          .collect()).length,
      ),
    );
    const topProviders = finalists
      .map((vendor, index) => ({ id: vendor._id, name: vendor.name, responseMinutes: vendor.responseMinutes ?? 999999, requests: finalistRequestCounts[index] ?? 0 }))
      .sort((a, b) => a.responseMinutes - b.responseMinutes || b.requests - a.requests)
      .map(({ responseMinutes, ...provider }) => ({ ...provider, responseMinutes: responseMinutes === 999999 ? undefined : responseMinutes }));
    return {
      events: {
        searchImpression: count("search_impression"),
        listingOpened: count("listing_opened"),
        whatsappClicked: count("whatsapp_clicked"),
        shareClicked: count("share_clicked"),
        callClicked: count("call_clicked"),
        requestCreated: count("request_created"),
        requestClaimed: count("request_claimed"),
        requestCompleted: count("request_completed"),
        listingPublished: count("listing_published"),
        listingArchived: count("listing_archived"),
        photoUploaded: count("photo_uploaded"),
        notificationOptedIn: count("notification_opted_in"),
      },
      activeListings: active.length,
      searchToWhatsappRate: searchCount > 0 ? Math.round((whatsappCount / searchCount) * 100) : 0,
      averageResponseMinutes: responseValues.length > 0 ? Math.round(responseValues.reduce((sum, value) => sum + value, 0) / responseValues.length) : 0,
      completedRequests: completedRequests.length,
      listingsWithoutPrice: active.filter((vendor) => !vendor.price.trim()).length,
      listingsWithoutPhotos: active.filter((vendor) => !vendor.photoId && !photoIds.has(vendor._id)).length,
      listingsWithoutHours: active.filter((vendor) => !vendor.hours.trim()).length,
      byCategory,
      byArea,
      topProviders,
    };
  },
});
