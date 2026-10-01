import { describe, expect, test } from "vitest";
import {
  ACTIVE_STATUSES,
  SECURITY_RULES,
  SECURITY_RULE_KEYS,
  assertSafeEvidence,
  decideIncident,
  incidentAggregateKey,
  maskIp,
  sanitizeEvidence,
  shouldAggregate,
  type SecurityRuleKey,
} from "./security-rules";

describe("FASE 7 - katalog aturan deteksi", () => {
  test("sembilan aturan wajib semuanya terdaftar", () => {
    expect(SECURITY_RULE_KEYS).toHaveLength(9);
    for (const key of [
      "admin_passcode_failures",
      "admin_lockout_threshold",
      "storage_reference_invalid",
      "privileged_call_denied",
      "public_mutation_rate",
      "webhook_signature_failure",
      "invite_token_invalid",
      "session_device_change",
      "endpoint_error_burst",
    ] as SecurityRuleKey[]) {
      expect(SECURITY_RULE_KEYS).toContain(key);
    }
  });

  test("tidak ada aturan yang dibiarkan tanpa alasan atau tanpa respons", () => {
    for (const key of SECURITY_RULE_KEYS) {
      const rule = SECURITY_RULES[key];
      expect(rule.label.length, `${key} tanpa label`).toBeGreaterThan(3);
      expect(rule.rationale.length, `${key} tanpa alasan`).toBeGreaterThan(20);
      expect(rule.threshold, `${key} ambangnya tidak masuk akal`).toBeGreaterThanOrEqual(1);
      expect(rule.windowMs, `${key} jendelanya tidak masuk akal`).toBeGreaterThan(0);
      // Tingkat dasar tidak boleh lebih tinggi dari batas atasnya.
      expect(["record", "audit", "alert", "rate_limit", "block_suspect", "revoke_session"])
        .toContain(rule.response);
    }
  });
});

describe("FASE 7 - keputusan insiden dan agregasi", () => {
  test("di bawah ambang tidak menghasilkan apa pun", () => {
    expect(decideIncident("admin_passcode_failures", 0).action).toBe("ignore");
    expect(decideIncident("admin_passcode_failures", 4).action).toBe("ignore");
    expect(decideIncident("webhook_signature_failure", 2).action).toBe("ignore");
  });

  test("tepat di ambang mulai dicatat, dengan tingkat dasar", () => {
    const decision = decideIncident("admin_passcode_failures", 5);
    expect(decision.action).toBe("record");
    if (decision.action !== "record") return;
    expect(decision.severity).toBe("high");
    expect(decision.escalated).toBe(false);
    expect(decision.response).toBe("rate_limit");
  });

  test("hitungan berlipat menaikkan tingkat, tapi tidak melewati batas atas", () => {
    const atThreshold = decideIncident("admin_passcode_failures", 5);
    const doubled = decideIncident("admin_passcode_failures", 10);
    const quadrupled = decideIncident("admin_passcode_failures", 20);
    const hundreds = decideIncident("admin_passcode_failures", 500);

    if (atThreshold.action !== "record") throw new Error("ambang dasar harus tercatat");
    if (doubled.action !== "record") throw new Error("2x ambang harus tercatat");
    if (quadrupled.action !== "record") throw new Error("4x ambang harus tercatat");
    if (hundreds.action !== "record") throw new Error("500 kejadian harus tercatat");

    expect(atThreshold.severity).toBe("high");
    expect(doubled.severity).toBe("critical");
    expect(quadrupled.severity).toBe("critical");
    // Batas atasnya `critical`, jadi lonjakan besar tidak menghasilkan tingkat
    // yang tidak dikenal.
    expect(hundreds.severity).toBe("critical");
    expect(quadrupled.escalated).toBe(true);
  });

  test("aturan yang sering muncul wajar tidak pernah menjadi critical", () => {
    // 404 dan rujukan storage salah memang sering terjadi pada pengunjung sah.
    const banyak = decideIncident("storage_reference_invalid", 1_000);
    if (banyak.action !== "record") throw new Error("harus tercatat");
    expect(banyak.severity).toBe("high");
    expect(SECURITY_RULES.storage_reference_invalid.maxSeverity).toBe("high");
  });

  test("aturan berambang satu langsung tercatat", () => {
    const lockout = decideIncident("admin_lockout_threshold", 1);
    expect(lockout.action).toBe("record");
    if (lockout.action !== "record") return;
    expect(lockout.severity).toBe("critical");
  });

  test("kunci agregasi memisahkan aturan dan subjek", () => {
    const a = incidentAggregateKey({
      ruleKey: "admin_passcode_failures",
      subjectType: "ip",
      subjectRef: "ip-1",
    });
    const b = incidentAggregateKey({
      ruleKey: "admin_passcode_failures",
      subjectType: "ip",
      subjectRef: "ip-2",
    });
    const c = incidentAggregateKey({
      ruleKey: "privileged_call_denied",
      subjectType: "ip",
      subjectRef: "ip-1",
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe("admin_passcode_failures|ip|ip-1");
  });

  test("insiden aktif di dalam jendela digabung, bukan dibuat baru", () => {
    const now = 1_000_000;
    expect(
      shouldAggregate({ status: "open", lastSeenAt: now - 1_000, now, windowMs: 60_000 }),
    ).toBe(true);
    expect(
      shouldAggregate({ status: "acknowledged", lastSeenAt: now - 1_000, now, windowMs: 60_000 }),
    ).toBe(true);
    // Di luar jendela: insiden baru, supaya tidak ada satu baris abadi.
    expect(
      shouldAggregate({ status: "open", lastSeenAt: now - 120_000, now, windowMs: 60_000 }),
    ).toBe(false);
  });

  test("insiden yang sudah ditutup tidak dihidupkan lagi", () => {
    const now = 1_000_000;
    for (const status of ["resolved", "suppressed"] as const) {
      expect(
        shouldAggregate({ status, lastSeenAt: now, now, windowMs: 60_000 }),
        `${status} tidak boleh dipertambah`,
      ).toBe(false);
    }
  });

  test("hanya open dan acknowledged yang dianggap aktif", () => {
    expect(ACTIVE_STATUSES).toEqual(["open", "acknowledged"]);
  });
});

describe("FASE 7 - bukti tidak boleh menjadi kebocoran baru", () => {
  test("passcode, password, token, dan cookie disunting", () => {
    const cleaned = sanitizeEvidence([
      "passcode: 1234",
      "password=hunter2",
      "access_token=abc123def456",
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      "Cookie: session=abcdef123456",
    ]);
    const joined = cleaned.join(" ");
    expect(joined).not.toContain("1234");
    expect(joined).not.toContain("hunter2");
    expect(joined).not.toContain("abc123def456");
    expect(joined).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(joined).not.toContain("abcdef123456");
    expect(joined).toContain("[disunting]");
  });

  test("nomor telepon mentah tidak pernah ikut", () => {
    const cleaned = sanitizeEvidence([
      "handoff ke 081234567890 gagal",
      "wa.me/6281234567890",
      "+6281234567890 tidak dikenal",
    ]);
    const joined = cleaned.join(" ");
    expect(joined).not.toContain("081234567890");
    expect(joined).not.toContain("6281234567890");
  });

  test("email tidak pernah ikut", () => {
    const cleaned = sanitizeEvidence(["gagal untuk warga.sumenep@gmail.com"]);
    expect(cleaned.join(" ")).not.toContain("gmail.com");
  });

  test("secret provider dan kunci privat tidak pernah ikut", () => {
    const cleaned = sanitizeEvidence([
      "webhook memakai whsec_abcdefghijklmnop",
      "token vcp_abcdefghijklmnop dipakai",
      "-----BEGIN RSA PRIVATE KEY-----",
    ]);
    const joined = cleaned.join(" ");
    expect(joined).not.toContain("whsec_abcdefghijklmnop");
    expect(joined).not.toContain("vcp_abcdefghijklmnop");
    expect(joined).not.toContain("PRIVATE KEY");
  });

  test("bukti yang sudah bersih tetap terbaca apa adanya", () => {
    const cleaned = sanitizeEvidence([
      "tanda tangan tidak cocok di cabang meta",
      "storage id tidak ditemukan di tabel vendorPhotos",
    ]);
    expect(cleaned).toEqual([
      "tanda tangan tidak cocok di cabang meta",
      "storage id tidak ditemukan di tabel vendorPhotos",
    ]);
  });

  test("jumlah baris bukti dibatasi", () => {
    const banyak = Array.from({ length: 200 }, (_, index) => `kejadian ${index}`);
    expect(sanitizeEvidence(banyak, 20)).toHaveLength(20);
  });

  test("baris kosong dibuang", () => {
    expect(sanitizeEvidence(["", "   ", "ada isi"])).toEqual(["ada isi"]);
  });

  test("assertSafeEvidence meloloskan hasil sanitasi", () => {
    const cleaned = sanitizeEvidence([
      "passcode: 9999",
      "hubungi 081234567890",
      "email budi@gmail.com",
    ]);
    expect(() => assertSafeEvidence(cleaned)).not.toThrow();
  });

  test("assertSafeEvidence menolak nilai mentah", () => {
    expect(() => assertSafeEvidence(["passcode: 9999"])).toThrow(/passcode/);
    expect(() => assertSafeEvidence(["hubungi 081234567890"])).toThrow(/telepon/);
  });

  test("maskIp menyisakan bentuk yang dikenali manusia saja", () => {
    expect(maskIp("103.47.132.18")).toBe("103.47.x.x");
    expect(maskIp("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8::x");
    expect(maskIp(undefined)).toBeUndefined();
    expect(maskIp("")).toBeUndefined();
    expect(maskIp("bukan-ip")).toBeUndefined();
  });
});
