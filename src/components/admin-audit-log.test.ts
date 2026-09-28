import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { AdminAuditLog, type AuditLogEntry } from "@/components/admin-audit-log";

/**
 * Panel "Audit log terbaru".
 *
 * Baris yang dirender di sini adalah bentuk yang BENAR-BENAR sampai ke
 * pengguna: kalau panel kembali ke `staff.role_changed` + waktu, tiga
 * pertanyaan yang paling sering muncul — siapa, dari email mana, sesi mana —
 * kembali tidak terjawab, dan tidak ada yang akan memberi tahu.
 */

const ENTRY: AuditLogEntry = {
  _id: "audit-1",
  action: "staff.role_changed",
  actorId: "users1234567890",
  actorName: "SuperAdmin Developer",
  actorEmail: "qoidrifat23@gmail.com",
  actorRole: "admin",
  sessionRef: "ses_ABCD1234",
  entityId: "user9876543210",
  oldValue: '"staff"',
  newValue: '"viewer"',
  metadata: { source: "panel" },
  createdAt: Date.UTC(2026, 8, 28, 12, 26, 56),
};

const render = (entries: AuditLogEntry[] | undefined) =>
  renderToStaticMarkup(createElement(AdminAuditLog, { entries }));

test("setiap baris menyebut pelaku, email, dan nomor sesinya", () => {
  const html = render([ENTRY]);
  expect(html).toContain("SuperAdmin Developer");
  expect(html).toContain("qoidrifat23@gmail.com");
  expect(html).toContain("ses_ABCD1234");
  // Tiga hal itu harus punya labelnya sendiri, bukan sekadar ikut terseret
  // di dalam teks lain.
  expect(html).toContain("Pelaku");
  expect(html).toContain("Nomor sesi");
  expect(html).toContain("Objek");
});

test("kode aksi tetap ditulis di bawah label bahasa manusianya", () => {
  const html = render([ENTRY]);
  expect(html).toContain("Peran pengelola diubah");
  expect(html).toContain("staff.role_changed");
});

test("nilai sebelum dan sesudah ditampilkan di balik rincian", () => {
  const html = render([ENTRY]);
  expect(html).toContain("Rincian perubahan");
  expect(html).toContain("staff");
  expect(html).toContain("viewer");
  // JSON mentah tidak boleh tampil apa adanya.
  expect(html).not.toContain("&quot;staff&quot;");
  expect(html).toContain("panel");
});

test("chip peran memakai kelas admin, bukan label karangan", () => {
  const html = render([ENTRY]);
  expect(html).toContain("admin-status admin-status-confirmed");
  expect(html).toContain(">Admin<");
});

test("baris tanpa pelaku jujur, tidak mengarang nama", () => {
  const html = render([
    { _id: "audit-2", action: "error_report.created", createdAt: Date.UTC(2026, 8, 28) },
  ]);
  expect(html).toContain("Tanpa pelaku");
  expect(html).toContain("Email tidak tercatat");
  expect(html).toContain("Tanpa sesi");
  // Tidak ada kotak rincian yang tidak berisi apa pun.
  expect(html).not.toContain("Rincian perubahan");
});

test("email pelaku tampil utuh, tidak dipotong supaya tidak bisa disalahbaca", () => {
  // Memotong email di tengah membuat dua akun berbeda terlihat sama.
  const html = render([{ ...ENTRY, actorEmail: "panjang-sekali@subdomain.sumenep.co.id" }]);
  expect(html).toContain("panjang-sekali@subdomain.sumenep.co.id");
});

test("id panjang dipotong supaya baris tidak meluber", () => {
  const html = render([ENTRY]);
  expect(html).toContain("users1234");
  expect(html).not.toContain("users1234567890");
});

test("daftar kosong dan memuat punya pesan masing-masing", () => {
  expect(render([])).toContain("Belum ada aktivitas tercatat.");
  expect(render(undefined)).toContain("Memuat audit log");
});

test("foto pelaku dirender ketika server mengirim URL-nya", () => {
  const html = render([{ ...ENTRY, actorImageUrl: "https://storage.example/foto.jpg" }]);
  expect(html).toContain('src="https://storage.example/foto.jpg"');
  expect(html).toContain('alt=""');
});

test("tanpa foto, inisial dari nama yang dipakai — bukan kotak rusak", () => {
  const html = render([{ ...ENTRY, actorImageUrl: undefined }]);
  expect(html).not.toContain("<img");
  expect(html).toContain("SD");
});

test("kartu baris memakai token admin yang sama dengan panel lain", () => {
  const html = render([ENTRY]);
  expect(html).toContain('data-slot="audit-entry"');
  expect(html).toContain("border-2 border-[#121212]");
  expect(html).toContain("rounded-[2px]");
});
