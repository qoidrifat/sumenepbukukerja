/**
 * Penulis insiden keamanan (FASE 7, diperluas di Fase 10).
 *
 * BERAPA KENAPA INI BERKAS TERPISAH DARI `securityIncidents.ts`.
 *
 * `securityIncidents.ts` mengimpor `requireStaff` dari `./access` untuk
 * mengotorisasi operasi Security Desk. `./access` sendiri perlu melaporkan
 * penolakan hak khusus sebagai bukti. Kalau keduanya diletakkan di satu
 * berkas, `access.ts` harus mengimpor `securityIncidents.ts`, dan kita
 * mendapat dua modul yang saling mengimpor - yang di Convex berakhir sebagai
 * fungsi yang belum terisi saat handler dijalankan.
 *
 * Pemecahannya adalah memisahkan penulisan dari operasi: berkas ini tidak
 * tahu apa pun tentang peran, sesi, atau panel. Ia hanya menulis baris
 * insiden dari fakta yang diterimanya. `./access` boleh mengimpor berkas ini
 * tanpa ikut menarik `requireStaff` bersamanya.
 *
 * Kontrak pemanggil tidak berubah: pemanggil melaporkan FAKTA, dan
 * `decideIncident` di `../lib/security-rules` yang memutuskan artinya. Tidak
 * ada pemanggil yang boleh memilih tingkat keparahan sendiri.
 */

import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import {
  assertSafeEvidence,
  decideIncident,
  sanitizeEvidence,
  shouldAggregate,
  type IncidentSeverity,
  type SecurityRuleKey,
  SECURITY_RULES,
} from "../lib/security-rules";

type MutationCtx = GenericMutationCtx<DataModel>;

/**
 * Sinyal yang dilaporkan pemanggil.
 *
 * Perhatikan bentuknya: pemanggil melaporkan FAKTA ("passcode salah", hash IP,
 * jumlah kejadian di jendelanya). Pemanggil TIDAK memilih tingkat keparahan,
 * tidak memilih status, dan tidak menulis langsung ke tabel. Semua keputusan
 * itu diambil `decideIncident` dari katalog aturan, sehingga dua jalur
 * berbeda tidak mungkin memberi tingkat berbeda untuk kejadian yang sama.
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
 * Mencatat sinyal keamanan menjadi insiden.
 *
 * Fungsi ini SENGAJA berupa fungsi biasa, bukan `internalMutation`. Alasannya
 * teknis: sebagian besar deteksi terjadi DI DALAM mutation yang sedang
 * berjalan (misalnya `verifyAdminPasscode` yang gagal), dan mutation tidak
 * bisa memanggil mutation lain secara langsung. Fungsi biasa bisa dipanggil
 * dari mana saja yang sudah punya `ctx`, sedangkan `internalMutation`
 * pembungkusnya di `securityIncidents.ts` dipakai untuk action lewat scheduler.
 *
 * MELEMPAR, TIDAK DIAM. Kalau bukti memuat pola rahasia, `assertSafeEvidence`
 * melempar. Pencatatan insiden tidak boleh pernah menjadi jalur diam-diam yang
 * merusak tujuan keamanannya sendiri. Yang melempar di sini adalah
 * `noteSecuritySignal` di bawah, yang memang tidak boleh mematikan penolakan.
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

/**
 * Satu fakta "hal ini ditolak" plus konteks subjeknya.
 *
 * Berbeda dengan `IncidentSignal`, `count` TIDAK diisi pemanggil. Yang di sini
 * adalah satu kejadian; jumlahnya dihitung sendiri dari tabel `securityDenyLog`.
 */
export type DenialSignal = {
  ruleKey: SecurityRuleKey;
  /**
   * Unit subjek yang sudah diturunkan. Untuk penolakan hak khusus ini id
   * dokumen pengguna; untuk storage id yang tidak dikenal, sidik storage-nya
   * sendiri; untuk token undangan yang tidak dikenal, satu ember bersama.
   */
  subjectType: "user" | "storage" | "invite";
  /** Nilai yang dipakai sebagai kunci pengelompokan. Bukan rahasia. */
  subjectRef: string;
  /** Nama gerbang yang menolak, misalnya `requireStaff`. */
  route: string;
  method?: string;
  userId?: DataModel["users"]["document"]["_id"];
  sessionReference?: string;
  evidence?: string[];
};

/**
 * Catat satu penolakan, lalu jadikan insiden kalau sudah cukup banyak.
 *
 * KENAPA ADA TABEL HITUNGAN KECIL (`securityDenyLog`) DAN BUKAN LANGSUNG
 * `recordIncidentWithin`.
 *
 * `recordIncidentWithin` memutuskan dari JUMLAH kejadian di dalam jendela, dan
 * jumlah itu harus berasal dari data nyata. Menulis satu baris insiden per
 * penolakan akan membuat tabel yang justru harus memberi peringatan meledak
 * justru ketika ada satu pengguna yang salah menekan tombol berulang. Tabel
 * hitungan menyelesaikan dua masalah sekaligus: satu baris kecil per
 * penolakan, dan satu baris insiden saja ketika ambang terlampaui.
 *
 * KENAPA TIDAK PERNAH MELEMPAR.
 *
 * Penolakan hak khusus adalah keputusan keamanan yang harus tetap terjadi
 * apa pun keadaannya. Kalau pencatatan bukti melempar, seluruh mutation ikut
 * gagal - termasuk penolakan itu sendiri - dan pengguna melihat "Server
 * Error" alih-alih kalimat yang tepat. Jadi kegagalan di sini dicatat ke log
 * server lalu dihentikan. Penolakannya tetap terjadi; yang hilang cuma jejaknya.
 */
export async function noteSecurityDenial(
  ctx: MutationCtx,
  signal: DenialSignal,
): Promise<void> {
  try {
    const now = Date.now();
    await ctx.db.insert("securityDenyLog", {
      subjectType: signal.subjectType,
      subjectRef: signal.subjectRef,
      ruleKey: signal.ruleKey,
      route: signal.route,
      createdAt: now,
      ...(signal.userId === undefined ? {} : { userId: signal.userId }),
      ...(signal.sessionReference === undefined
        ? {}
        : { sessionReference: signal.sessionReference }),
    });

    const rule = SECURITY_RULES[signal.ruleKey];
    const since = now - rule.windowMs;
    const rows = await ctx.db
      .query("securityDenyLog")
      .withIndex("bySubjectCreatedAt", (q) =>
        q
          .eq("subjectType", signal.subjectType)
          .eq("subjectRef", signal.subjectRef)
          .gte("createdAt", since),
      )
      .collect();

    await recordIncidentWithin(ctx, {
      ruleKey: signal.ruleKey,
      count: rows.length,
      subjectRef: signal.subjectRef,
      route: signal.route,
      method: signal.method ?? "POST",
      ...(signal.userId === undefined ? {} : { userId: signal.userId }),
      ...(signal.sessionReference === undefined
        ? {}
        : { sessionFingerprint: signal.sessionReference }),
      evidence: signal.evidence,
    });
  } catch (error) {
    console.warn("[SECURITY_INCIDENT] gagal mencatat penolakan:", error);
  }
}