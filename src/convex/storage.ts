import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser } from "./access";
import { imageRejection } from "../lib/image-upload";

/**
 * Pemeliharaan storage: dedup unggahan, pembersihan blob yatim, dan cadangan.
 *
 * Ketiganya berbagi pertanyaan yang sama: "blob ini masih dibutuhkan siapa?"
 * Jawabannya selalu lewat baris REFERENSI, bukan tebakan — dan setiap fungsi
 * pembersihan di sini gagal menuju TIDAK MENGHAPUS, bukan menuju menghapus.
 * Blob yang hilang tidak bisa dikembalikan; blob menggantung hanya biaya
 * beberapa KB per minggu.
 *
 * Dedup berjalan di KLIEN: peramban menghitung sha256 berkas SEBELUM unggah,
 * menanyakan peta `uploadedBlobs`, dan mengunggah hanya bila belum ada. Alur
 * unggah lama (generateUploadUrl → POST browser) tidak berubah — yang berubah
 * hanyalah blob identik tidak pernah menyentuh jaringan sama sekali, yang juga
 * berarti kuota egress unggah ikut hemat. Server tetap memvalidasi ulang
 * metadata blob saat dipakai (`imageRejection` di pemanggil), jadi klien tidak
 * bisa memalsukan jenis berkas lewat jalur ini.
 */

/** Rentan waktu blob tanpa rujukan dianggap masih proses unggah yang berjalan. */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/** Batas kerja per pemanggilan, agar satu kali cron tidak jadi operasi besar. */
const ORPHAN_BATCH = 200;

/**
 * Cari blob identik yang sudah tersimpan lewat jalur unggah kita.
 *
 * Tabel `_storage` tidak bisa diindeks dari schema kita, jadi pemetaannya
 * disimpan di `uploadedBlobs`. Mengembalikan `null` berarti "belum pernah
 * diunggah" — klien WAJIB melanjutkan alur unggah biasa.
 */
export const lookupBlobBySha = query({
  args: { sha256: v.string() },
  handler: async (ctx, args) => {
    // Pembacaan, bukan gerbang: memberitahu "berkas ini sudah pernah diunggah"
    // tidak membocorkan apa pun, karena pemanggil sudah memegang berkasnya.
    await requireUser(ctx);
    const mapped = await ctx.db
      .query("uploadedBlobs")
      .withIndex("bySha256", (q) => q.eq("sha256", args.sha256))
      .unique();
    if (!mapped) return null;
    // Peta menunjuk blob yang sudah tidak ada? Perlakukan sebagai belum ada.
    const blob = await ctx.db.system.get("_storage", mapped.storageId as never);
    if (!blob) return null;
    return { storageId: mapped.storageId, size: mapped.size };
  },
});

/**
 * Catat hasil unggahan ke peta. Idempoten: baris untuk sha yang sama tidak
 * pernah digandakan — dua unggahan identik bersamaan (race) berakhir dengan
 * satu baris peta, dan blob kalah yang tidak terpetakan dibersihkan oleh
 * `pruneOrphanStorage` setelah masa tenggangnya. Kalau blob yang sudah
 * dipetakan ternyata hilang dari `_storage`, barisnya diperbarui menunjuk blob
 * baru — peta mengikuti kenyataan, bukan sebaliknya.
 */
export const recordUploadedBlob = mutation({
  args: { sha256: v.string(), storageId: v.string(), size: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    // `requireUser` sendirinya MELOLOSKAN identitas anonim Convex Auth, karena
    // penyedia Anonymous terdaftar di `auth.ts` — itu memang desain app ini
    // (melapor dan mencatat peristiwa tanpa akun). Tapi TIDAK ADA satu pun jalur
    // unggah foto milik anonim: foto profil butuh akun, galeri butuh pemilik
    // listing, bukti klaim butuh akun warga. Peta blob menambah baris, jadi ia
    // menuntut baris `users` yang benar-benar ada — supaya pengunjung tanpa
    // akun tidak bisa mengisinya dengan sampah.
    const account = await ctx.db.get(userId);
    if (!account) throw new Error("Masuk untuk mengunggah foto");
    const sha = args.sha256.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error("Sidik berkas tidak valid");
    // Hanya blob gambar sah yang masuk peta — peta ini khusus jalur unggahan
    // foto, dan metadata yang diperiksa adalah milik STORAGE, bukan klaim klien.
    //
    // Ceknya sekarang `imageRejection`, bukan `isStoredImage` saja. Versi lama
    // hanya menolak jenis, sehingga foto 200 MB tetap masuk peta; dan peta
    // BERLAKU untuk selamanya bagi `pruneOrphanStorage`, jadi satu unggahan
    // raksasa cukup untuk membuat blob sampah yang tidak pernah dipangkas.
    // Batas ukuran di sini sama dengan batas yang dipakai `users` dan
    // `community`, jadi tidak ada aturan kedua yang bisa berbeda pendapat.
    const metadata = await ctx.db.system.get("_storage", args.storageId as never);
    if (!metadata) throw new Error("Berkas unggahan tidak ditemukan");
    const rejection = imageRejection({ size: metadata.size, contentType: metadata.contentType });
    if (rejection) throw new Error(rejection);
    const now = Date.now();
    const mapped = await ctx.db
      .query("uploadedBlobs")
      .withIndex("bySha256", (q) => q.eq("sha256", sha))
      .unique();
    if (mapped) {
      // Aturan 10 — tulis-hanya-bila-berubah: peta yang sudah menunjuk blob
      // yang sama persis (`storageId`+`size` sama) tidak di-`patch` ulang.
      // `lastUsedAt` sengaja ikut tidak ditulis: tidak ada query yang
      // memakainya untuk keputusan apa pun (`byLastUsed` nol referensi, dan
      // `pruneOrphanStorage` hanya memeriksa keberadaan baris peta), jadi
      // menulisnya tiap dedup-hit hanya menambah write tanpa mengubah
      // perilaku. Blob pengganti (race kalah atau blob lama hilang) tetap
      // menimpa peta seperti sebelumnya.
      if (mapped.storageId === args.storageId && mapped.size === metadata.size) return;
      await ctx.db.patch(mapped._id, { storageId: args.storageId, size: metadata.size, lastUsedAt: now });
      return;
    }
    await ctx.db.insert("uploadedBlobs", {
      sha256: sha,
      storageId: args.storageId,
      size: metadata.size,
      createdAt: now,
      lastUsedAt: now,
    });
  },
});

/**
 * Pembersihan blob yatim.
 *
 * Blob dianggap aman dihapus hanya jika SEMUA benar:
 *  1. lebih tua dari 24 jam (unggahan yang sedang berjalan tidak ikut);
 *  2. TIDAK terpetakan di `uploadedBlobs` (peta = "pernah dipakai jalur kita");
 *  3. tidak dirujuk `vendorPhotos` mana pun;
 *  4. tidak dirujuk `users.profileImageStorageId` mana pun;
 *  5. tidak dirujuk dokumen cadangan mana pun.
 *
 * Setiap syarat gagal menuju "skip", bukan "hapus". Idempoten: menjalankan dua
 * kali beruntun memberi hasil kedua kosong.
 */
export const pruneOrphanStorage = internalMutation({
  args: {
    /** Batas usia opsional untuk keperluan test; produksi memakai default 24 jam. */
    graceMs: v.optional(v.number()),
    /** Batas kerja per pemanggilan. */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const graceMs = Math.max(args.graceMs ?? ORPHAN_GRACE_MS, 60_000);
    const cutoff = Date.now() - graceMs;
    const take = Math.min(Math.max(args.limit ?? ORPHAN_BATCH, 1), 500);

    const candidates = await ctx.db.system
      .query("_storage")
      .filter((q) => q.lt(q.field("_creationTime"), cutoff))
      .take(take);

    let deleted = 0;
    let skipped = 0;
    let scanned = 0;

    for (const blob of candidates) {
      scanned += 1;
      const id = blob._id;
      // Referen 1: peta unggahan (blob dedup yang masih bisa dipakai ulang).
      const mapped = await ctx.db
        .query("uploadedBlobs")
        .withIndex("byStorageId", (q) => q.eq("storageId", id))
        .unique();
      if (mapped) {
        skipped += 1;
        continue;
      }
      // Referen 2: foto listing (first() — cukup tahu ada atau tidak).
      const photoRef = await ctx.db
        .query("vendorPhotos")
        .withIndex("byStorageId", (q) => q.eq("storageId", id))
        .first();
      if (photoRef) {
        skipped += 1;
        continue;
      }
      // Referen 3: foto profil. Tabel `users` sudah punya indeks
      // `byProfileImageStorageId`, jadi pemeriksaan ini satu pembacaan indeks
      // penuh. Versi lama memakai `.filter()` di atas seluruh tabel: biayanya
      // tumbuh seiring jumlah pengguna, dan tidak ada indeks yang bisa menahan
      // itu saat tabel bertambah besar.
      const userRef = await ctx.db
        .query("users")
        .withIndex("byProfileImageStorageId", (q) => q.eq("profileImageStorageId", id))
        .first();
      if (userRef) {
        skipped += 1;
        continue;
      }
      // Referen 4: dokumen cadangan mingguan.
      const backupRef = await ctx.db
        .query("backupRuns")
        .withIndex("byStorageId", (q) => q.eq("storageId", id))
        .unique();
      if (backupRef) {
        skipped += 1;
        continue;
      }
      try {
        await ctx.storage.delete(id);
        deleted += 1;
      } catch {
        // Blob sudah hilang atau sistem menolak. Bukan alasan gagalkan batch.
        skipped += 1;
      }
    }

    return { scanned, deleted, skipped, hasMore: candidates.length === take };
  },
});

/**
 * Cadangan mingguan: satu dokumen JSON per run, berisi tabel-tabel yang
 * dihapus oleh retensi atau yang tidak boleh hilang.
 *
 * `auditLogs` ikut dicadangkan padahal retensinya 30 hari: jejak audit adalah
 * bukti, bukan cache. Action (bukan mutation) karena `ctx.storage.store()`
 * hanya ada di action — mutasi hanya bisa menerima unggahan dari peramban.
 */
const BACKUP_TABLES = [
  "vendors",
  "reports",
  "auditLogs",
  "reviews",
  "serviceRequests",
  "errorReports",
] as const;

const BACKUP_ROW_LIMIT = 5_000;

export const gatherBackupTable = internalQuery({
  args: { table: v.string() },
  handler: async (ctx, args) => {
    // Nama tabel dijaga konstanta: string dari argumen TIDAK pernah jadi
    // pemilih tabel bebas.
    if (!(BACKUP_TABLES as readonly string[]).includes(args.table)) return [];
    return await ctx.db.query(args.table as never).take(BACKUP_ROW_LIMIT);
  },
});

export const runWeeklyBackup = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ weekKey: string; existing: Doc<"backupRuns"> | null }> => {
    const now = new Date();
    // Kunci ISO-mingguan (YYYY-Www) — satu cadangan per minggu; jalan ulang di
    // minggu yang sama TIDAK membuat dokumen kedua (idempoten). Kamis dipakai
    // supaya minggunya selalu milik pekan yang sama di semua zona waktu.
    const target = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const januaryFirst = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((target.getTime() - januaryFirst.getTime()) / 86_400_000 + januaryFirst.getUTCDay() + 1) / 7);
    const weekKey = `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;

    const existing = await ctx.db
      .query("backupRuns")
      .withIndex("byWeek", (q) => q.eq("weekKey", weekKey))
      .unique();
    return { weekKey, existing };
  },
});

export type WeeklyBackupResult =
  | { weekKey: string; skipped: true; backupId: string }
  | {
      weekKey: string;
      skipped: false;
      backupId: string;
      bytes: number;
      tables: Record<string, number>;
      status: "ok" | "partial";
    };

export const writeWeeklyBackup = internalAction({
  args: {},
  handler: async (ctx): Promise<WeeklyBackupResult> => {
    const gate = await ctx.runMutation(internal.storage.runWeeklyBackup, {});
    if (gate.existing) {
      return { weekKey: gate.weekKey, skipped: true as const, backupId: gate.existing._id };
    }
    const now = Date.now();
    const tables: Record<string, number> = {};
    const payload: Record<string, unknown> = { weekKey: gate.weekKey, generatedAt: new Date(now).toISOString() };
    let partial = false;

    for (const table of BACKUP_TABLES) {
      const rows = (await ctx.runQuery(internal.storage.gatherBackupTable, { table })) as unknown as unknown[];
      tables[table] = rows.length;
      payload[table] = rows;
      if (rows.length >= BACKUP_ROW_LIMIT) {
        // Tabel lebih besar dari batas: tetap dicadangkan sebagian, ditandai
        // supaya pembaca cadangan tahu isinya tidak penuh.
        partial = true;
        payload[`${table}_truncated`] = true;
      }
    }

    const json = JSON.stringify(payload);
    const storageId = await ctx.storage.store(new Blob([json], { type: "application/json" }));
    const backupId = await ctx.runMutation(internal.storage.finalizeBackup, {
      weekKey: gate.weekKey,
      storageId,
      tableCounts: tables,
      bytes: json.length,
      status: partial ? "partial" : "ok",
    });
    return {
      weekKey: gate.weekKey,
      skipped: false as const,
      backupId,
      bytes: json.length,
      tables,
      status: partial ? "partial" : "ok",
    };
  },
});

export const finalizeBackup = internalMutation({
  args: {
    weekKey: v.string(),
    storageId: v.string(),
    tableCounts: v.any(),
    bytes: v.number(),
    status: v.union(v.literal("ok"), v.literal("partial")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("backupRuns", {
      weekKey: args.weekKey,
      storageId: args.storageId,
      tableCounts: args.tableCounts,
      bytes: args.bytes,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      status: args.status,
    });
  },
});

/** Ringkasan cadangan terbaru, untuk runbook dan pemeriksaan manual. */
export const latestBackupRuns = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("backupRuns").withIndex("byWeek").order("desc").take(5);
    return rows.map((row) => ({
      weekKey: row.weekKey,
      storageId: row.storageId,
      bytes: row.bytes,
      status: row.status,
      finishedAt: row.finishedAt ?? null,
      tableCounts: row.tableCounts,
    }));
  },
});
