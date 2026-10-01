import { mutation, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { requireManagementViewer, requireStaff } from "./access";
import { writeAudit } from "./audit";
import {
  assertSafeEvidence,
  decideIncident,
  sanitizeEvidence,
  shouldAggregate,
  type IncidentSeverity,
  type IncidentStatus,
  type SecurityRuleKey,
  SECURITY_RULES,
} from "../lib/security-rules";

type MutationCtx = GenericMutationCtx<DataModel>;

/**
 * Sinyal yang dilaporkan pemanggil.
 *
 * Perhatikan bentuknya: pemanggil melaporkan FAKTA ("passcode salah", IP
 * hash, jumlah kejadian di jendelanya). Pemanggil TIDAK memilih tingkat
 * keparahan, tidak memilih status, dan tidak menulis langsung ke tabel.
 * Semua keputusan itu diambil `decideIncident` dari katalog aturan, sehingga
 * dua jalur berbeda tidak mungkin memberi tingkat berbeda untuk kejadian yang
 * sama.
 */
export type IncidentSignal = {
  ruleKey: SecurityRuleKey;
  /** Jumlah kejadian di dalam jendela aturan, TERMASUK yang terbaru. */
  count: number;
  /** Nilai subjek yang sudah diturunkan - hash, label, atau slug. */
  subjectRef: string;
  route: string;
  method: string;
  userId?: DataModel["users"]["document"]["_id"];
  ipHash?: string;
  ipMasked?: string;
  sessionFingerprint?: string;
  /** Keterangan singkat. Disanitasi di sini, bukan di pemanggil. */
  evidence?: string[];
};

/**
 * Mencatat sinyal keamanan menjadi insiden.
 *
 * Fungsi ini SENGAJA berupa fungsi biasa, bukan `internalMutation`. Alasannya
 * teknis: sebagian besar deteksi terjadi DI DALAM mutation yang sedang
 * berjalan (misalnya `verifyAdminPasscode` yang gagal), dan mutation tidak
 * bisa memanggil mutation lain secara langsung. Fungsi biasa bisa dipanggil
 * dari mana saja yang sudah punya `ctx`, sedangkan `internalMutation`
 * pembungkusnya di bawah dipakai untuk action lewat scheduler.
 *
 * MELEMPAR, TIDAK DIAM. Kalau bukti memuat pola rahasia, `assertSafeEvidence`
 * melempar. Pencatatan insiden tidak boleh pernah menjadi jalur diam-diam yang
 * merusak tujuan keamanannya sendiri.
 */
export async function recordIncidentWithin(
  ctx: MutationCtx,
  signal: IncidentSignal,
): Promise<void> {
  const decision = decideIncident(signal.ruleKey, signal.count);
  if (decision.action === "ignore") return;

  const rule = SECURITY_RULES[signal.ruleKey];
  const now = Date.now();
  const evidence = sanitizeEvidence(signal.evidence ?? []);
  assertSafeEvidence(evidence);

  const existing = await ctx.db
    .query("securityIncidents")
    .withIndex("byAggregate", (q) =>
      q
        .eq("ruleKey", signal.ruleKey)
        .eq("subjectType", rule.subjectType)
        .eq("subjectRef", signal.subjectRef),
    )
    .order("desc")
    .first();

  if (
    existing &&
    shouldAggregate({
      status: existing.status,
      lastSeenAt: existing.lastSeenAt,
      now,
      windowMs: rule.windowMs,
    })
  ) {
    // Digabung, bukan dibuat baru. `count` diisi JUMLAH kejadian di jendela,
    // bukan hasil penambahan berulang: nilainya berasal dari hitungan yang
    // sudah dihitung pemanggil atas data nyata, jadi membiarkannya bertambah
    // sendiri akan membuat angkanya menggelembung setiap kali fungsi ini
    // dipanggil untuk sinyal yang sama.
    const merged = [...new Set([...(existing.evidence ?? []), ...evidence])].slice(0, 20);
    await ctx.db.patch(existing._id, {
      count: Math.max(existing.count, signal.count),
      lastSeenAt: now,
      // Tingkat hanya boleh naik. Kalau insiden yang sama kembali dengan
      // hitungan lebih kecil, itu bukan alasan menurunkan kewaspadaan.
      severity: higherSeverity(existing.severity, decision.severity),
      evidence: merged,
      route: signal.route,
      method: signal.method,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("securityIncidents", {
    ruleKey: signal.ruleKey,
    severity: decision.severity,
    status: "open",
    subjectType: rule.subjectType,
    subjectRef: signal.subjectRef,
    ...(signal.userId === undefined ? {} : { userId: signal.userId }),
    ...(signal.ipHash === undefined ? {} : { ipHash: signal.ipHash }),
    ...(signal.ipMasked === undefined ? {} : { ipMasked: signal.ipMasked }),
    ...(signal.sessionFingerprint === undefined
      ? {}
      : { sessionFingerprint: signal.sessionFingerprint }),
    route: signal.route,
    method: signal.method,
    count: signal.count,
    firstSeenAt: now,
    lastSeenAt: now,
    ...(evidence.length === 0 ? {} : { evidence }),
    createdAt: now,
    updatedAt: now,
  });
}

const ORDER: Record<IncidentSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const higherSeverity = (a: IncidentSeverity, b: IncidentSeverity): IncidentSeverity =>
  ORDER[a] >= ORDER[b] ? a : b;

/**
 * Pembungkus untuk action dan scheduler.
 *
 * Dipakai ketika sinyal datang dari `httpAction` (webhook, gerbang admin),
 * yang tidak punya `ctx.db` dan karena itu tidak bisa memanggil
 * `recordIncidentWithin` langsung.
 */
export const recordIncident = internalMutation({
  args: {
    ruleKey: v.string(),
    count: v.number(),
    subjectRef: v.string(),
    route: v.string(),
    method: v.string(),
    userId: v.optional(v.id("users")),
    ipHash: v.optional(v.string()),
    ipMasked: v.optional(v.string()),
    sessionFingerprint: v.optional(v.string()),
    evidence: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await recordIncidentWithin(ctx, {
      ...args,
      ruleKey: args.ruleKey as SecurityRuleKey,
    });
  },
});

/**
 * Sinyal khusus webhook: tandatangan provider tidak cocok.
 *
 * KENAPA TIDAK MEMAKAI `recordIncident` LANGSUNG DARI http.ts.
 *
 * Aturan ini butuh HITUNGAN, dan `httpAction` tidak bisa menghitungnya: ia
 * tidak punya `ctx.db`, hanya `ctx.runMutation`. Menghitung di dalam tindakan
 * HTTP berarti satu pembacaan database per permintaan yang gagal - tepat pada
 * saat tabelnya sedang dibanjiri permintaan palsu. Jadi penghitungannya
 * dipindahkan ke sini, dan `httpAction` hanya melaporkan satu fakta.
 *
 * YANG DIHITUNG adalah `occurrences` dari laporan error webhook, bukan baris
 * mentah. `errorReports` sudah menggabungkan kegagalan yang sama menurut
 * sidik jari, jadi satu baris dengan `occurrences: 12` berarti dua belas
 * percobaan - dan itu angka yang benar untuk dibandingkan dengan ambang.
 *
 * Bacaan dibatasi dua kali: oleh indeks `byLastSeenAt` (hanya jendela aturan)
 * dan oleh `.take(200)`. Permintaan palsu yang tak habis-habisnya tidak bisa
 * membuat fungsi ini membaca seluruh tabel.
 */
export const recordWebhookSignatureFailure = internalMutation({
  args: {
    provider: v.string(),
    route: v.string(),
  },
  handler: async (ctx, args) => {
    const rule = SECURITY_RULES.webhook_signature_failure;
    const since = Date.now() - rule.windowMs;
    const rows = await ctx.db
      .query("errorReports")
      .withIndex("byLastSeenAt", (q) => q.gte("lastSeenAt", since))
      .take(200);
    const count = rows
      .filter((row) => row.source === "webhook" && row.operation.includes("signature"))
      .reduce((total, row) => total + row.occurrences, 0);

    await recordIncidentWithin(ctx, {
      ruleKey: "webhook_signature_failure",
      count,
      subjectRef: args.provider,
      route: args.route,
      method: "POST",
      evidence: [`tanda tangan ${args.provider} tidak cocok`],
    });
  },
});

/* ------------------------------------------------------------------ */
/* Security Desk                                                       */
/* ------------------------------------------------------------------ */

const severityValidator = v.union(
  v.literal("info"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);
const statusValidator = v.union(
  v.literal("open"),
  v.literal("acknowledged"),
  v.literal("resolved"),
  v.literal("suppressed"),
);

/**
 * Daftar insiden untuk Security Desk.
 *
 * `bukaSaja` (default true) menyaring ke status yang masih perlu ditangani.
 * Itu nilai bawaan yang benar: panel keamanan yang membuka dengan daftar
 * seluruh riwayat membuat satu insiden `critical` yang baru tenggelam di
 * antara ratusan yang sudah selesai.
 */
export const listIncidents = query({
  args: {
    severity: v.optional(severityValidator),
    status: v.optional(statusValidator),
    ruleKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const status = args.status;

    const rows = status
      ? await ctx.db
          .query("securityIncidents")
          .withIndex("byStatusLastSeen", (q) => q.eq("status", status))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("securityIncidents")
          .withIndex("byLastSeenAt")
          .order("desc")
          .take(limit);

    return rows
      .filter((row) => !args.severity || row.severity === args.severity)
      .filter((row) => !args.ruleKey || row.ruleKey === args.ruleKey)
      .map((row) => ({
        ...row,
        // Label aturan dikirim bersama barisnya supaya panel tidak perlu
        // memegang salinan katalog aturan sendiri. Kalau katalog berubah,
        // yang berubah hanya satu tempat.
        ruleLabel: SECURITY_RULES[row.ruleKey as SecurityRuleKey]?.label ?? row.ruleKey,
      }));
  },
});

/** Ringkasan untuk kartu di atas daftar. */
export const incidentSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireManagementViewer(ctx);
    const aktif = await ctx.db
      .query("securityIncidents")
      .withIndex("byStatusLastSeen", (q) => q.eq("status", "open"))
      .order("desc")
      .take(500);
    const acknowledged = await ctx.db
      .query("securityIncidents")
      .withIndex("byStatusLastSeen", (q) => q.eq("status", "acknowledged"))
      .order("desc")
      .take(500);
    const semua = [...aktif, ...acknowledged];
    return {
      open: aktif.length,
      acknowledged: acknowledged.length,
      critical: semua.filter((row) => row.severity === "critical").length,
      high: semua.filter((row) => row.severity === "high").length,
      total: semua.length,
      lastSeenAt: semua.reduce((latest, row) => Math.max(latest, row.lastSeenAt), 0) || undefined,
    };
  },
});

/**
 * Menandai insiden sudah dilihat.
 *
 * `requireStaff` (bukan `requireManagementViewer`) karena ini MENULIS. Viewer
 * tetap bisa membaca panel, tapi tidak bisa mengubah status apa pun - aturan
 * yang sama sudah berlaku di seluruh aplikasi.
 */
export const acknowledgeIncident = mutation({
  args: { id: v.id("securityIncidents") },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);
    const incident = await ctx.db.get(args.id);
    if (!incident) throw new Error("Insiden tidak ditemukan");
    if (incident.status === "resolved" || incident.status === "suppressed") {
      throw new Error("Insiden ini sudah ditutup");
    }
    await ctx.db.patch(args.id, {
      status: "acknowledged",
      acknowledgedBy: userId,
      acknowledgedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      action: "security.incident_acknowledged",
      actorId: userId,
      entityId: args.id,
      newValue: "acknowledged",
      metadata: { ruleKey: incident.ruleKey, severity: incident.severity },
    });
    return args.id;
  },
});

export const resolveIncident = mutation({
  args: {
    id: v.id("securityIncidents"),
    note: v.optional(v.string()),
    /** `suppressed` berarti sinyalnya dianggap wajar untuk sementara. */
    suppressed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);
    const incident = await ctx.db.get(args.id);
    if (!incident) throw new Error("Insiden tidak ditemukan");
    const now = Date.now();
    const status: IncidentStatus = args.suppressed ? "suppressed" : "resolved";
    const note = args.note?.trim().slice(0, 500);
    // Catatan penutup ikut disanitasi: ini kolom bebas yang dibaca manusia di
    // panel, jadi ia adalah jalur masuk yang sama berbahayanya dengan bukti.
    const evidence = sanitizeEvidence(note ? [`catatan: ${note}`] : []);
    assertSafeEvidence(evidence);
    await ctx.db.patch(args.id, {
      status,
      resolvedBy: userId,
      resolvedAt: now,
      ...(note ? { resolutionNote: note } : {}),
      updatedAt: now,
    });
    await writeAudit(ctx, {
      action: "security.incident_resolved",
      actorId: userId,
      entityId: args.id,
      oldValue: incident.status,
      newValue: status,
      metadata: { ruleKey: incident.ruleKey, severity: incident.severity },
    });
    return args.id;
  },
});

/**
 * Menghapus insiden lama di luar jendela retensi.
 *
 * `internalMutation` karena pemanggilnya adalah scheduler, bukan orang. Batas
 * `max` ada supaya satu kali jalan tidak pernah menjadi penghapusan besar yang
 * tidak bisa dibatalkan dalam satu transaksi.
 */
export const pruneIncidents = internalMutation({
  args: {
    olderThan: v.number(),
    max: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const max = Math.min(Math.max(args.max ?? 200, 1), 500);
    const rows = await ctx.db
      .query("securityIncidents")
      .withIndex("byLastSeenAt")
      .order("asc")
      .take(max * 4);
    let removed = 0;
    for (const row of rows) {
      if (removed >= max) break;
      if (row.lastSeenAt >= args.olderThan) break;
      // Insiden yang masih terbuka TIDAK dihapus hanya karena umurnya. Yang
      // boleh hilang adalah riwayat yang sudah ditutup; membuang insiden yang
      // belum ditangani berarti membuang satu-satunya tanda bahwa ada yang
      // perlu diperiksa.
      if (row.status === "open" || row.status === "acknowledged") continue;
      await ctx.db.delete(row._id);
      removed += 1;
    }
    return removed;
  },
});
