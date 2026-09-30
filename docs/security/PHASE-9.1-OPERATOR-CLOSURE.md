# PHASE 9.1 — Matriks Aksi Operator

Semua tindakan di bawah **tidak bisa dikerjakan oleh coding agent**. Registered
berisi tindakan, cara verifikasi, dan status saat dokumen ini dibuat. Tidak ada
nilai kredensial di sini.

Prosedur langkah demi langkah ada di `PHASE-9.1-OPERATOR-RUNBOOK.md`.

## Matriks

| Temuan | Tindakan operator | Verifikasi | Status saat ini |
|---|---|---|---|
| F-01 | Tidak ada rotasi. Nilai `VLY_EMAIL_OTP_API_KEY` adalah kredensial **bawaan platform Freebuff**, bukan kunci privat proyek (dikonfirmasi tim Freebuff lewat kanal komunitas resmi). Jaga agar tetap terisi di Keys | OTP sign-in di `/auth` berhasil; `bun run test` tetap hijau | `RISK ACCEPTED - PLATFORM MANAGED` |
| F-08 | Hapus `STAFF_BOOTSTRAP_EMAILS` dari Keys/API keys, lalu deploy ulang | `users:bootstrapAdministratorAvailable` menjawab `{"available": false}`; 3 pengelola tetap bisa masuk dan memoderasi | `CLOSED — OPERATOR VERIFIED` |
| F-09 | Tetapkan origin produksi (frontend + Convex) dan uji keenam route di kedua origin | Status per route di kedua origin cocok dengan `tmp/qa-p91-closure-evidence.json` untuk `.convex.site` | `PARTLY DONE` - dev terukur, produksi belum |
| F-11a | Pasang header keamanan (CSP, HSTS, nosniff, Referrer-Policy, frame-ancestors) di lapisan penyajian origin frontend | Header terlihat nyata di respons origin frontend; `bun run test:e2e` tetap lulus di origin itu | `BLOCKED — NO AUTHORITATIVE PRODUCTION FRONTEND ORIGIN` |
| F-11c | Opsional: isi `ADMIN_CONTEXT_ALLOWED_ORIGINS` dengan origin frontend produksi | `tmp/qa-p91-cors-allowlist-probe.mjs` (sesuaikan konstanta) menunjukkan hanya origin itu yang diizinkan; Security Desk tetap menampilkan IP sumber | `MITIGATED` (satu label, sama dengan `SECURITY-CLOSURE.md`) - wildcard tanpa credentials sudah aman dan tidak merusak apa pun |
| F-05 | Putuskan apakah `requesterName` dan koordinat listing tetap publik | `docs/security/PII-DECISION-REGISTER.md` R-1 dan R-2 terisi keputusan dan tanggal | `DECISION REQUIRED` |
| F-13 | Putuskan masa simpan metadata klaim bila ingin dipersingkat | Register keputusan terisi; kalau berubah, `data-retention.test.ts` diperbarui | `RISK ACCEPTED` |
| F-17 | Sediakan mailbox uji atau penyedia OTP khusus test untuk E2E dua sesi | `e2e/flows.spec.ts` Skenario dua sesi berjalan tanpa `skip` | `OPEN — TEST INFRASTRUCTURE GAP` |
| F-16 | Risiko diterima. Mitigasi utama token di `localStorage` adalah CSP, jadi bagian yang tersisa ikut F-11a | CSP aktif di origin frontend dan XSS tetap mustahil | `RISK ACCEPTED` (sama dengan `SECURITY-CLOSURE.md`); bagian CSP-nya `BLOCKED` - ikut F-11a |

## Ringkasan jumlah

| Kategori | Jumlah |
|---|---|
| Tindakan operator terbuka | 1 (F-17) |
| Tindakan operator terblokir (butuh pihak ketiga) | 1 (F-11a) |
| Tindakan opsional | 1 (F-11c) |
| Keputusan produk yang menunggu | 1 grup (F-05, dengan 4 entri register) |
| Tindakan yang selesai di sisi kode, tinggal diverifikasi | 2 (F-09 dev, F-11 route) |
| Total baris actionable | 6 |

Perubahan dari versi sebelumnya: F-08 ditutup (operator sudah menghapus
`STAFF_BOOTSTRAP_EMAILS` dan hasil probe sudah diukur ulang), F-01 tidak lagi
`OPEN` (tidak ada rotasi yang bisa dilakukan), F-11c tidak lagi dihitung dua
kali, dan F-11a tidak lagi dihitung sebagai "selesai di sisi kode" sekaligus
"terblokir".

## Bukti operator F-08 (literal, tidak diringkas)

Dikeluarkan oleh `node tmp/qa-p91-closure-probe.mjs` pada 2026-09-30T19:16:22Z.
Probe ini read-only: hanya memanggil query publik dan route HTTP.

```
checked at          : 2026-09-30T19:16:22.698Z
bootstrap available : {"available":false}
staff count         : 3 | hasAnyStaff: true
errorData safe      : true
err mentions path   : true
err mentions stack  : true
catalog leaked      : []
requesterId exposed : false
PROBE_EXIT=0
```

Bacaan: allowlist benar-benar hilang, dan ketiga pengelola tetap ada. Kalau
`staff count` turun ke `0`, allowlist itu yang membuat mereka eksis dan
variabelnya harus dikembalikan - itu tidak terjadi. Dua baris `err mentions
path` / `err mentions stack` yang `true` adalah F-07, yang statusnya tetap
`MITIGATED`, bukan ikut tertutup oleh tindakan ini.

## Yang TIDAK perlu tindakan operator

- F-02, F-03, F-04, F-06, F-12, F-14: kode sudah diperbaiki dan regression test
  sudah mengunci perbaikannya.
- F-10, F-15: risiko diterima dengan alasan tertulis di
  `PHASE-9.1-SECURITY-CLOSURE.md`.
- F-07: perlu verifikasi produksi, tetapi tidak ada tindakan yang bisa
  dilakukan operator selain menyediakan origin produksi untuk diuji. Statusnya
  `MITIGATED`, bukan `CLOSED`.
