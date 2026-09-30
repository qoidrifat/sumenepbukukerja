# PHASE 9.1 — Matriks Aksi Operator

Semua tindakan di bawah **tidak bisa dikerjakan oleh coding agent**. Registered
berisi tindakan, cara verifikasi, dan status saat dokumen ini dibuat. Tidak ada
nilai kredensial di sini.

Prosedur langkah demi langkah ada di `PHASE-9.1-OPERATOR-RUNBOOK.md`.

## Matriks

| Temuan | Tindakan operator | Verifikasi | Status saat ini |
|---|---|---|---|
| F-01 | Cabut kredensial OTP lama di penyedia, buat pengganti, simpan ke `VLY_EMAIL_OTP_API_KEY`, deploy ulang | OTP sign-in berhasil; kunci lama ditolak penyedia; pesan error tetap tersanitasi | `OPEN — OPERATOR ACTION REQUIRED` |
| F-08 | Hapus `STAFF_BOOTSTRAP_EMAILS` dari Keys/API keys, lalu deploy ulang | `users:bootstrapAdministratorAvailable` menjawab `{"available": false}`; 3 pengelola tetap bisa masuk dan memoderasi | `OPEN — OPERATOR ACTION REQUIRED` |
| F-09 | Tetapkan origin produksi (frontend + Convex) dan uji keenam route di kedua origin | Status per route di kedua origin cocok dengan `tmp/qa-p91-closure-evidence.json` untuk `.convex.site` | `PARTLY DONE` - dev terukur, produksi belum |
| F-11a | Pasang header keamanan (CSP, HSTS, nosniff, Referrer-Policy, frame-ancestors) di lapisan penyajian origin frontend | Header terlihat nyata di respons origin frontend; `bun run test:e2e` tetap lulus di origin itu | `BLOCKED — NO AUTHORITATIVE PRODUCTION FRONTEND ORIGIN` |
| F-11c | Isi `ADMIN_CONTEXT_ALLOWED_ORIGINS` dengan origin frontend produksi | `tmp/qa-p91-cors-allowlist-probe.mjs` (sesuaikan konstanta) menunjukkan hanya origin itu yang diizinkan; Security Desk tetap menampilkan IP sumber | `OPTIONAL` - sekarang wildcard tanpa credentials, aman dan tidak merusak apa pun |
| F-05 | Putuskan apakah `requesterName` dan koordinat listing tetap publik | `docs/security/PII-DECISION-REGISTER.md` R-1 dan R-2 terisi keputusan dan tanggal | `DECISION REQUIRED` |
| F-13 | Putuskan masa simpan metadata klaim bila ingin dipersingkat | Register keputusan terisi; kalau berubah, `data-retention.test.ts` diperbarui | `RISK ACCEPTED` |
| F-17 | Sediakan mailbox uji atau penyedia OTP khusus test untuk E2E dua sesi | `e2e/flows.spec.ts` Skenario dua sesi berjalan tanpa `skip` | `OPEN — TEST INFRASTRUCTURE GAP` |
| F-16 | Pertimbangkan CSP sebagai mitigasi utama token di `localStorage` | CSP aktif di origin frontend dan XSS tetap mustahil | `BLOCKED` - ikut F-11a |

## Ringkasan jumlah

| Kategori | Jumlah |
|---|---|
| Tindakan operator terbuka | 4 (F-01, F-08, F-09 sebagian, F-17) |
| Tindakan operator terblokir (butuh pihak ketiga) | 2 (F-11a, F-11c) |
| Keputusan produk yang menunggu | 1 grup (F-05, dengan 4 entri register) |
| Tindakan yang selesai di sisi kode, tinggal diverifikasi | 3 (F-11a route, F-11c, F-09 dev) |
| Total baris actionable | 9 |

## Yang TIDAK perlu tindakan operator

- F-02, F-03, F-04, F-06, F-12, F-14: kode sudah diperbaiki dan regression test
  sudah mengunci perbaikannya.
- F-10, F-15: risiko diterima dengan alasan tertulis di
  `PHASE-9.1-SECURITY-CLOSURE.md`.
- F-07: perlu verifikasi produksi, tetapi tidak ada tindakan yang bisa
  dilakukan operator selain menyediakan origin produksi untuk diuji. Statusnya
  `MITIGATED`, bukan `CLOSED`.
