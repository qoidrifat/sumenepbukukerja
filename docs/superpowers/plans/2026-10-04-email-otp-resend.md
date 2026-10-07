# Email OTP via Resend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warga masuk hanya dengan email + kode OTP 6 digit yang dikirim realtime via Resend; login sandi dihapus total.

**Architecture:** Provider Convex Auth custom `otp-email` (ConvexCredentials, pola `src/convex/auth/firebase.ts`) — action `requestCode` membuat kode, menyimpan hash SHA-256, mengirim via Resend; `authorize` memverifikasi sekali-pakai lalu menautkan user by email. Frontend: tombol `Gunakan Email` membuka Radix Dialog 2 tahap + sekuens sukses confetti.

**Tech Stack:** Convex (actions + ConvexCredentials), Resend HTTP API, Radix Dialog, `input-otp` (sudah ada), framer-motion (sudah ada), `canvas-confetti@1.9.4` (baru) + `@types/canvas-confetti@1.9.0` (baru).

**Spec:** `docs/superpowers/specs/2026-10-04-email-otp-resend-design.md`

## Global Constraints

- `RESEND_API_KEY` tidak pernah masuk repo/bundle; hanya Convex dashboard + `.env.local`; slot kosong di `.env.example`.
- Kode OTP tidak pernah tersimpan polos — hanya hash SHA-256.
- `OTP_TTL_MS = 600_000` (10 menit, sinkron tulisan "10 menit" di `resend.html:256`).
- `RESEND_COOLDOWN_MS = 60_000`, `MAX_SENDS_PER_HOUR = 5`, `MAX_VERIFY_ATTEMPTS = 5`.
- Alamat pengirim persis: `Sumenep Buku Kerja <noreply@sumenepbukukerja.com>`.
- Token template diganti dengan urutan: `{{{OTP_CODE}}}` dulu, lalu `{{OTP_CODE}}`, lalu `{{{CURRENT_YEAR}}}` (triple-brace mengandung double-brace — urutan terbalik merusak output).
- Token gerak situs: `duration: 0.32, ease: [0.22, 1, 0.36, 1]`; spring sukses `stiffness: 320, damping: 26`.
- `prefers-reduced-motion` → semua animasi jadi fade instan (pola `AnimatedContent` di `src/components/react-bits.tsx:483-501`).
- Cincin fokus wajib `focusRing` dari `@/lib/focus-ring` (jangan inline).
- Perintah kualitas tiap task: `npm run test -- <file> --run`, `npm run typecheck`, `npx eslint <file>`.

---

## File Structure

- Baru `src/lib/otp-email.ts` — konstanta + helper murni (normalisasi email, hash SHA-256 WebCrypto, render HTML email). Alasan: bisa unit-test tanpa ctx Convex, meniru pola `src/lib/admin-passcode`.
- Baru `src/convex/emailTemplates.ts` — `renderOtpEmailHtml(code, year)` berisi HTML yang dipindah verbatim dari `resend.html` dengan token diganti `${}`. Alasan: action Convex tak bisa membaca file repo; modul ini sumber kebenaran live (`resend.html` tinggal artefak preview — headernya diberi komentar penunjuk).
- Ubah `src/convex/schema.ts:57-82` — tambah tabel `emailOtpCodes` + indeks `byEmail`.
- Baru `src/convex/otpEmail.ts` — `requestCode` (action publik), `status` (query publik `{ enabled }`), mutasi internal simpan/konsumsi. Pola fetch meniru `fetchProvider` di `src/convex/whatsapp.ts:180-186` + timeout `AbortSignal.timeout(12_000)` seperti `src/convex/whatsapp.ts:1013`.
- Baru `src/convex/auth/otpEmail.ts` — provider `ConvexCredentials({ id: "otp-email", authorize })` (bentuk persis `node_modules/@convex-dev/auth/src/providers/ConvexCredentials.ts:98-107`).
- Ubah `src/convex/auth.ts:18-20` — tambah `otpEmail` ke `providers`, perbarui komentar Fase 9.2.
- Baru `src/components/email-otp-dialog.tsx` — Dialog tahap email + tahap kode + countdown (meniru `src/components/error-report-dialog.tsx:142-146`).
- Baru `src/components/otp-success.tsx` — sekuens merge → confetti → ceklis → countdown 3 dtk.
- Ubah `src/pages/Auth.tsx:718-730` — tombol jadi `Gunakan Email`; hapus total form sandi (`:557-683`), `handlePasswordSubmit` (`:254-302`), state terkait; guard `firebaseEnabled` jadi matriks Google-vs-OTP.
- Ubah `resend.html:9-33` — komentar: sumber live pindah ke `src/convex/emailTemplates.ts`.
- Ubah `.env.example` — slot `RESEND_API_KEY=` kosong di seksi relay admin.
- Tulis ulang test pengunci: `src/pages/auth-signin.test.ts`, `src/pages/auth-password-reset.test.ts`, `src/components/admin-access-gate.test.ts` (bagian OTP), `src/convex/firebase-auth-security.test.ts:206-213`.
- Baru `src/convex/otpEmail.test.ts`, `src/components/email-otp-dialog.test.ts` (pola env `JWT_PRIVATE_KEY` disalin verbatim dari `src/convex/invites.test.ts:33-57`).
- Baru `docs/security/PHASE-9.5-EMAIL-OTP-RESEND.md` — reversal Fase 9.2.

---

### Task 1: Helper murni + template email live

**Files:**
- Create: `src/lib/otp-email.ts`
- Create: `src/convex/emailTemplates.ts`
- Modify: `resend.html:9-33` (tambah 3 baris komentar penunjuk)
- Test: `src/lib/otp-email.test.ts`

**Interfaces:**
- Consumes: `resend.html` (verbatim, token `{{{OTP_CODE}}}`, `{{OTP_CODE}}`, `{{{CURRENT_YEAR}}}`)
- Produces: `OTP_TTL_MS`, `RESEND_COOLDOWN_MS`, `MAX_SENDS_PER_HOUR`, `MAX_VERIFY_ATTEMPTS`, `OTP_FROM`, `normalizeEmail(email: string): string`, `sha256Hex(value: string): Promise<string>`, `renderOtpEmailHtml(code: string, year: number): string` — dipakai Task 2 dan 3 dengan nama persis ini.

- [ ] **Step 1: Write the failing test** — buat `src/lib/otp-email.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  MAX_SENDS_PER_HOUR,
  MAX_VERIFY_ATTEMPTS,
  OTP_FROM,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  normalizeEmail,
  sha256Hex,
} from "./otp-email";
import { renderOtpEmailHtml } from "../convex/emailTemplates";

describe("otp-email constants", () => {
  test("batas sesuai kontrak global", () => {
    expect(OTP_TTL_MS).toBe(600_000);
    expect(RESEND_COOLDOWN_MS).toBe(60_000);
    expect(MAX_SENDS_PER_HOUR).toBe(5);
    expect(MAX_VERIFY_ATTEMPTS).toBe(5);
    expect(OTP_FROM).toBe("Sumenep Buku Kerja <noreply@sumenepbukukerja.com>");
  });
});

describe("normalizeEmail", () => {
  test("trim + lowercase", () => {
    expect(normalizeEmail("  Warga@Example.ID ")).toBe("warga@example.id");
  });
});

describe("sha256Hex", () => {
  test("64 hex lowercase dan stabil", async () => {
    const a = await sha256Hex("123456");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("123456")).toBe(a);
    expect(await sha256Hex("123457")).not.toBe(a);
  });
});

describe("renderOtpEmailHtml", () => {
  test("semua token terganti, tak ada sisa placeholder", () => {
    const html = renderOtpEmailHtml("482913", 2026);
    expect(html).toContain("482913");
    expect(html).toContain("2026");
    expect(html).not.toContain("OTP_CODE");
    expect(html).not.toContain("CURRENT_YEAR");
    expect(html).toContain("noreply@sumenepbukukerja.com".slice(0, 8));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/otp-email.test.ts --run`
Expected: FAIL with "Failed to resolve import" (file belum ada)

- [ ] **Step 3: Write minimal implementation** — buat `src/lib/otp-email.ts`:

```ts
export const OTP_TTL_MS = 600_000;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_SENDS_PER_HOUR = 5;
export const MAX_VERIFY_ATTEMPTS = 5;
export const OTP_FROM = "Sumenep Buku Kerja <noreply@sumenepbukukerja.com>";
export const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
```

Buat `src/convex/emailTemplates.ts`: salin SELURUH isi `resend.html:36-443` ke dalam template literal yang dikembalikan `renderOtpEmailHtml(code: string, year: number): string`, dengan tiga penggantian: `{{{OTP_CODE}}}` → `${code}`, `{{OTP_CODE}}` → `${code}`, `{{{CURRENT_YEAR}}}` → `${year}`. Escape backtick/dollar yang sudah ada di HTML bila ada (periksa: tidak ada backtick di template). Tambahkan di `resend.html:9-33` tiga baris komentar: sumber live kini `src/convex/emailTemplates.ts`; file ini hanya untuk preview browser.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/otp-email.test.ts --run`
Expected: PASS (9 tests)

- [ ] **Step 5: Typecheck + lint file baru**

Run: `npm run typecheck` lalu `npx eslint src/lib/otp-email.ts src/lib/otp-email.test.ts src/convex/emailTemplates.ts`
Expected: bersih, nol error

---

### Task 2: Dependensi confetti

**Files:**
- Modify: `package.json`, `bun.lock` (via perintah, jangan edit manual)
- Test: tidak ada file test — verifikasi via import + build (tercantum di bawah)

**Interfaces:**
- Consumes: —
- Produces: `canvas-confetti@1.9.4` + `@types/canvas-confetti@1.9.0` terinstal untuk Task 5.

- [ ] **Step 1: Install**

Run: `bun add canvas-confetti@1.9.4 && bun add -d @types/canvas-confetti@1.9.0`
Expected: `package.json` mencatat kedua versi persis; `bun.lock` diperbarui.

- [ ] **Step 2: Verifikasi impor bekerja**

Run: `node -e "import('canvas-confetti').then(m => console.log(typeof m.default))"` dari root repo
Expected: mencetak `function`. Jika gagal, JANGAN lanjut — selesaikan resolusi modul dulu.

---

### Task 3: Backend — schema, requestCode, provider, registrasi

**Files:**
- Modify: `src/convex/schema.ts` (tambah tabel setelah blok `users`, sebelum `businesses`)
- Create: `src/convex/otpEmail.ts`
- Create: `src/convex/auth/otpEmail.ts`
- Modify: `src/convex/auth.ts`
- Modify: `.env.example` (slot kosong di seksi relay admin)
- Test: `src/convex/otpEmail.test.ts`

**Interfaces:**
- Consumes dari Task 1: `OTP_TTL_MS`, `RESEND_COOLDOWN_MS`, `MAX_SENDS_PER_HOUR`, `MAX_VERIFY_ATTEMPTS`, `OTP_FROM`, `RESEND_ENDPOINT`, `normalizeEmail`, `sha256Hex`, `isValidEmail`, `renderOtpEmailHtml`.
- Produces untuk Task 4/5: action publik `api.otpEmail.requestCode({ email }) → { ok: true; retryAfterMs: number }`, query publik `api.otpEmail.status() → { enabled: boolean }`, provider id `"otp-email"` sehingga `signIn("otp-email", { email, code })` membuka sesi.

Tabel (sisipkan persis setelah indeks `byProfileImageStorageId`, sebelum `businesses`):

```ts
emailOtpCodes: defineTable({
  email: v.string(),
  codeHash: v.string(),
  expiresAt: v.number(),
  attempts: v.number(),
  consumedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("byEmail", ["email"]),
```

Aturan perilaku (wajib diimplementasi verbatim di `src/convex/otpEmail.ts`):

1. `status` = query tanpa argumen → `{ enabled: Boolean(process.env.RESEND_API_KEY?.trim()) }`. Tidak membocorkan kunci.
2. `requestCode = action({ email: v.string() })`: normalisasi → `isValidEmail` (gagal → pesan generik yang SAMA dengan sukses: `{ ok: true, retryAfterMs: RESEND_COOLDOWN_MS }`, anti user-enumeration) → hitung kiriman 1 jam terakhir via `byEmail` (≥5 → throw `ConvexError("Terlalu banyak permintaan. Coba lagi nanti.")`) → cek cooldown dari baris terbaru (<60 dtk → kembalikan `{ ok: true, retryAfterMs: sisaMs }` TANPA membuat kode baru) → `crypto.getRandomValues` 6 digit (izinkan awalan 0, padStart 6) → `sha256Hex` → `internal.otpEmail.simpanKode` (upsert baris aktif per email: hapus/tandai consumed baris lama yang belum kedaluwarsa) → POST Resend (`Authorization: Bearer ${key}`, body `{ from: OTP_FROM, to: [email], subject: "Kode verifikasi Sumenep Buku Kerja", html: renderOtpEmailHtml(kode, new Date().getFullYear()) }`, `AbortSignal.timeout(12_000)`, pola `fetchProvider`) → respons non-2xx → throw `ConvexError("Email belum terkirim. Coba lagi sebentar lagi.")` (JANGAN sertakan body provider ke klien) → kembalikan `{ ok: true, retryAfterMs: RESEND_COOLDOWN_MS }`.
3. `src/convex/auth/otpEmail.ts`:

```ts
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { MAX_VERIFY_ATTEMPTS, normalizeEmail, sha256Hex } from "../otpEmailShared";
```

STOP — koreksi: helper ada di `src/lib/otp-email.ts`, tapi file Convex tidak boleh mengimpor dari `src/lib` bila itu menarik dependensi React? `src/lib/otp-email.ts` murni (tanpa React) jadi aman diimpor Convex. Namun pola repo memisahkan (`src/lib/admin-passcode` dipakai `adminGate.ts`), jadi impor langsung `../lib/otp-email` — SALAH, path dari `src/convex/auth/` ke `src/lib/` adalah `../../lib/otp-email`. Tulis impor persis: `import { ... } from "../../lib/otp-email";`

```ts
export const otpEmail = ConvexCredentials({
  id: "otp-email",
  authorize: async (credentials, ctx) => {
    const email = normalizeEmail(String(credentials.email ?? ""));
    const code = String(credentials.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return null;
    const row = await ctx.db
      .query("emailOtpCodes")
      .withIndex("byEmail", (q) => q.eq("email", email))
      .order("desc")
      .first();
    if (!row || row.consumedAt || Date.now() > row.expiresAt) return null;
    if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
      await ctx.db.patch(row._id, { consumedAt: Date.now() });
      return null;
    }
    const ok = (await sha256Hex(code)) === row.codeHash;
    if (!ok) {
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      return null;
    }
    await ctx.db.patch(row._id, { consumedAt: Date.now(), attempts: row.attempts + 1 });
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { emailVerificationTime: Date.now() });
      return { userId: existing._id };
    }
    const userId = await ctx.db.insert("users", { email, emailVerificationTime: Date.now() });
    return { userId };
  },
});
```

4. `src/convex/auth.ts`: impor `otpEmail` dari `./auth/otpEmail`, tambah ke `providers: [Anonymous, firebase, otpEmail]`, dan допиши komentar Fase 9.2: `// FASE 9.5: provider otp-email MENGEMBALIKAN login kode — kunci Resend kini milik sendiri (bukan Freebuff).`
5. `.env.example`: tambah di bawah `SERVER_IP_HASH_SECRET=` (baris ~103): baris kosong + `## Kunci Resend milik sendiri untuk OTP email (Fase 9.5). Isi di Convex dashboard + .env.local, tidak pernah di sini.` + `RESEND_API_KEY=`.

- [ ] **Step 1: Write the failing test** — buat `src/convex/otpEmail.test.ts`, salin blok env `JWT_PRIVATE_KEY`/`CONVEX_SITE_URL` verbatim dari `src/convex/invites.test.ts:33-57` (termasuk `import.meta.glob("./**/*.ts")` dan `convexTest(schema, modules)`), lalu:

```ts
// fetch Resend dipalsukan: JANGAN sentuh jaringan di test.
const kirimSukses = async () =>
  new Response(JSON.stringify({ id: "re_uji123" }), { status: 200 });
const kirimGagal = async () => new Response("nope", { status: 429 });

test("requestCode menyimpan hash (bukan polos) + status enabled", async () => {
  // ...stub globalThis.fetch = kirimSukses, setEnv RESEND_API_KEY="re_uji",
  // panggil requestCode, baca tabel: codeHash 64-hex, tak sama dengan kode;
  // status() === { enabled: true }.
});
test("cooldown: request kedua dalam 60 dtk tidak membuat baris baru", ...);
test("authorize: kode benar → userId; salah 5x → hangus; kedaluwarsa → null; pakai-ulang → null", ...);
```

(Isi `...` dengan panggilan `t.action(api.otpEmail.requestCode, { email })` / `t.query` + baca `t.run(...)` untuk isi tabel — pola baca DB dari `invites.test.ts:60+`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/convex/otpEmail.test.ts --run`
Expected: FAIL ("Cannot find module .../otpEmail")

- [ ] **Step 3: Write minimal implementation** — schema + `otpEmail.ts` + `auth/otpEmail.ts` + registrasi + `.env.example` sesuai aturan 1–5 di atas.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/convex/otpEmail.test.ts --run`
Expected: PASS

- [ ] **Step 5: Typecheck + lint + pastikan tak ada secret bocor**

Run: `npm run typecheck`, `npx eslint src/convex/otpEmail.ts src/convex/auth/otpEmail.ts src/convex/auth.ts`, lalu `Select-String -Pattern "re_[A-Za-z0-9]" src/convex/otpEmail.ts` (harus NIHIL — tak ada kunci hardcode).
Expected: bersih semua.

---

### Task 4: Dialog OTP frontend (tahap email + tahap kode + countdown)

**Files:**
- Create: `src/components/email-otp-dialog.tsx`
- Test: `src/components/email-otp-dialog.test.ts` (assert string sumber, pola `auth-signin.test.ts`)

**Interfaces:**
- Consumes dari Task 3: `api.otpEmail.requestCode`, `api.otpEmail.status`, `signIn("otp-email", { email, code })` via `useAuth()` (bentuk persis `src/hooks/use-auth.ts:7,17`).
- Produces untuk Task 5: `<EmailOtpDialog open onOpenChange initialEmail />` + callback internal `onCodeAccepted(email, code)` yang memicu `<OtpSuccess .../>`; error memakai `role="alert"`.

Spesifikasi komponen (verbatim):

- Root: `<Dialog open={open} onOpenChange={onOpenChange}>` + `<DialogContent showCloseButton={false} className="rounded-2xl sm:max-w-md">` (meniru `error-report-dialog.tsx:142-146`) + `DialogTitle` ("Masuk dengan email") + `DialogDescription` (penjelasan 2 tahap).
- Tahap `"email"`: `<Label htmlFor>` visible + `<Input id type="email" autoComplete="email" min-h-11>` + `<Button className="min-h-12 w-full">` teks `Kirim OTP`; saat async: `disabled` + spinner `Loader2 animate-spin` (meniru `Auth.tsx:704-705`); error → `<p role="alert" className="text-sm font-bold text-red-700">` + ikon `TriangleAlert` lucide (warna saja tak cukup). Sukses kirim → tahap `"code"`, fokus otomatis ke slot pertama.
- Tahap `"code"`: `<InputOTP maxLength={6} value onChange>` + `<InputOTPGroup className="gap-3">` + 6× `<InputOTPSlot index={i} className="size-14 text-xl font-extrabold" />`; lengkap 6 digit → panggil `signIn("otp-email", { email, code })` otomatis (tanpa tombol verifikasi terpisah — satu CTA per layar, aturan `primary-action`); countdown via rantai `setTimeout` 1 dtk (BUKAN `setInterval`): teks `Tidak menerima OTP? Kirim ulang (0:59)` → `0:00` jadi `<button>Kirim OTP</button>` yang memanggil `requestCode` lagi (server menegakkan cooldown; `retryAfterMs` dipakai bila server menolak cepat).
- Semua button/input pakai `focusRing` dari `@/lib/focus-ring` (import, bukan inline — test mengunci ini).
- Props persis: `{ open: boolean; onOpenChange: (v: boolean) => void; initialEmail?: string; redirect: string }`. Setelah `signIn` sukses JANGAN navigate di sini — panggil `onVerified()` yang dirender Task 5. (Koreksi: props = `{ open, onOpenChange, initialEmail?, redirect, onVerified: () => void }`.)

- [ ] **Step 1: Write the failing test** — `src/components/email-otp-dialog.test.ts` (baca sumber seperti `auth-signin.test.ts`):

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
const src = readFileSync(new URL("./email-otp-dialog.tsx", import.meta.url), "utf8");
describe("dialog OTP", () => {
  test("memakai Dialog + InputOTP 6 slot + focusRing kanonis", () => {
    expect(src).toContain("<Dialog");
    expect(src).toContain("maxLength={6}");
    expect(src).toContain('from "@/lib/focus-ring"');
    expect(src).not.toMatch(/setInterval/);
    expect(src).toContain('role="alert"');
  });
  test("tak ada kunci/secret di sumber", () => {
    expect(src).not.toMatch(/re_[A-Za-z0-9]/);
    expect(src).not.toContain("RESEND_API_KEY");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/email-otp-dialog.test.ts --run`
Expected: FAIL (ENOENT — file belum ada)

- [ ] **Step 3: Write minimal implementation** — komponen sesuai spesifikasi di atas. Tahap sukses (`onVerified`) HANYA memanggil prop — animasinya milik Task 5.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/email-otp-dialog.test.ts --run`
Expected: PASS

- [ ] **Step 5: Lint**

Run: `npx eslint src/components/email-otp-dialog.tsx src/components/email-otp-dialog.test.ts`
Expected: bersih

---

### Task 5: Sekuens sukses premium

**Files:**
- Create: `src/components/otp-success.tsx`
- Test: `src/components/otp-success.test.ts`

**Interfaces:**
- Consumes dari Task 4: dipanggil sebagai `<OtpSuccess email={email} onDone={() => navigate(redirect)} />` setelah `onVerified`.
- Produces: TIDAK ada (ujung alur). Memanggil `canvas-confetti` dan `navigate` via prop.

Spesifikasi (verbatim, aturan ui-ux-pro-max §7):

- Fase `merging` (600ms): 6 kotak `motion.div layoutId={`otp-slot-${i}`}` (slot asli Dialog memakai `layoutId` yang sama — Tambahkan di Task 4: setiap `InputOTPSlot` dibungkus `motion.div layoutId`), `animate={{ x: targetX, scale: 0, opacity: 0 }}` stagger `0.04`, spring `stiffness: 320, damping: 26` (persis `InviteAcceptance.tsx:25`).
- Fase `burst`: SATU kotak `motion.div layoutId="otp-merged"` scale 0→1 (0.25s) lalu confetti — HANYA bila `!useReducedMotion()`:

```ts
import confetti from "canvas-confetti";
const WARNA = ["#2563EB", "#F59E0B", "#93C5FD", "#ffffff"];
confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 }, colors: WARNA });
setTimeout(() => confetti({ particleCount: 40, angle: 60, spread: 60, origin: { x: 0 }, colors: WARNA }), 250);
setTimeout(() => confetti({ particleCount: 40, angle: 120, spread: 60, origin: { x: 1 }, colors: WARNA }), 400);
```

- Fase `done`: `motion.svg` lingkaran + `motion.path` ceklis `initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}` + teks `Verifikasi OTP Berhasil` + `Halaman akan dialihkan secara otomatis dalam (3)` (rantai `setTimeout`, `aria-live="polite"`) → `onDone()`. Reduced-motion: lewati merging+burst, langsung fade ceklis.
- Test: assert sumber — mengandung `canvas-confetti`, `useReducedMotion`, `pathLength`, `aria-live`, dan TIDAK mengandung `setInterval`.

- [ ] **Steps 1–5:** pola TDD sama seperti Task 4 (test dulu → FAIL ENOENT → implementasi → PASS → eslint).

---

### Task 6: Bedah Auth.tsx + tulis ulang test pengunci + decision record

**Files:**
- Modify: `src/pages/Auth.tsx` (tombol 718-730, hapus 254-302 + 557-683 + state sandi/reset terkait, guard 695 + fallback 732-746, komentar 687-694)
- Modify: `src/pages/auth-signin.test.ts`, `src/pages/auth-password-reset.test.ts`, `src/components/admin-access-gate.test.ts`, `src/convex/firebase-auth-security.test.ts`, `src/convex/auth.ts` (komentar), `src/lib/firebase-client.ts` + testnya (hapus fungsi email-sandi yang yatim — verifikasi dulu via grep `createEmailAccount|signInWithEmail|requestPasswordReset|completePasswordReset` di luar test)
- Create: `docs/security/PHASE-9.5-EMAIL-OTP-RESEND.md`

**Interfaces:**
- Consumes dari Task 4/5: `<EmailOtpDialog/>`, `<OtpSuccess/>`.
- Produces: `/auth` final (Google + `Gunakan Email` + dialog). Matriks guard: `firebaseEnabled && otpEnabled` → keduanya; hanya satu → hanya yang tersedia (tanpa pembatas "atau"); tidak ada → fallback "Pintu masuk belum siap" yang menyebut OTP+Google (perbarui teks 733-745).

Urutan kerja di `Auth.tsx` (surgical, sesuai AGENTS.md):

1. Ganti teks `Auth.tsx:729` → `Gunakan Email`; `onClick` → `setError(null); setNotice(null); setOtpOpen(true);` (tambah state `otpOpen`, `otpEmail`, `otpDone`).
2. Render `<EmailOtpDialog open={otpOpen} onOpenChange={setOtpOpen} redirect={redirect} onVerified={() => setOtpDone(true)} />` dan bila `otpDone` → `<OtpSuccess onDone={() => navigate(redirect)} />` (dalam Dialog yang sama — JANGAN Dialog bersarang).
3. Hapus `handlePasswordSubmit`, form sandi, blok reset, `passwordMode`/`showReset`; perbarui komentar Fase 9.2 (`:687-694`) → Fase 9.5.
4. Test: `auth-signin` → urutan Google > atau > `Gunakan Email`; `auth-password-reset` → tulis ulang total (reset Firebase dihapus: kunci ketidakberadaan form reset + kata sandi, kunci keberadaan dialog OTP); `admin-access-gate` → pesan di `:146` jadi `lewat Google atau lewat email`; `firebase-auth-security` → larangan `email-otp` (provider lama) TETAP, tambah izin `otp-email`.
5. Decision record `PHASE-9.5`: reversal, kunci milik sendiri, sandi dihapus, secret opaquer.

- [ ] **Steps:** per berkas — tulis/ubah test dulu (FAIL) → implementasi → PASS → `npm run typecheck` + `npx eslint` tiap file; akhiri dengan `npm run build` + `git status` (hanya file task ini yang berubah).

---

## Self-Review

1. **Spec coverage:** §3 arsitektur → Task 3+4+5; keamanan → Task 3 (+test Task 3); animasi+reduced-motion → Task 5; testing/regresi → Task 6 + tiap task; dep baru → Task 2; decision record → Task 6; `resend.html` sinkron → Task 1. LENGKAP.
2. **Placeholder scan:** tak ada TBD/TODO/"secukupnya" — semua angka, nama file:baris, dan isi kode eksplisit. Satu koreksi yang sudah diperbaiki inline: impor helper di Task 3 (`../../lib/otp-email`, bukan `../otpEmailShared`).
3. **Konsistensi tipe:** `signIn("otp-email", { email, code })` (Task 3→4→5 konsisten); props `EmailOtpDialog` konsisten Task 4→6; `OtpSuccess` konsisten Task 5→6; `layoutId` slot konsisten Task 4→5 (catatan: Task 4 WAJIB membungkus slot dengan `motion.div layoutId` — sudah ditulis di spesifikasi Task 5 sebagai instruksi ke Task 4; eksekutor Task 4 membaca kedua task).
