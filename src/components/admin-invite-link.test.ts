import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { InviteLinkResult } from "@/components/admin-invite-link";

/**
 * Kontrak panel "Pesan undangan" di meja kerja admin.
 *
 * Panel ini hanya muncul setelah undangan dibuat, jadi tidak ada yang bisa
 * merendernya lewat alur nyata tanpa sesi pengelola. Yang bisa dikunci di sini
 * adalah dua hal yang pernah benar-benar rusak:
 *
 *  1. Panel ini DULU menulis ulang warnanya sendiri. Begitu kelas admin di
 *     meja kerja berubah, panel ini tetap kompromi — persis kebalikan dari
 *     yang diminta. Tes di bawah memaksa panel memakai kelas admin, bukan
 *     meniru warnanya.
 *  2. Pesannya DULU membaca "bergabung ke ruang pengelola {email}" — email
 *     penerima dipakai di tempat peran seharusnya. Salah baca yang sangat
 *     jelas begitu pesannya dikirim ke orang yang benar-benar menunggu.
 */

const PROPS = {
  url: "https://sumenepbukukerja.test/invite/7f3a9c21b84d4e6f",
  email: "penerima@sumenep.co.id",
  role: "admin",
  expiresAt: Date.UTC(2026, 8, 30, 9, 0, 0),
};

const markup = () =>
  renderToStaticMarkup(
    createElement(InviteLinkResult, PROPS),
  ).split("&amp;").join("&");

test("panel memakai kelas admin, bukan warna yang ditulis ulang", () => {
  const html = markup();
  expect(html).toContain("admin-panel");
  expect(html).toContain("admin-input");
  expect(html).toContain("admin-btn admin-btn-primary");
  expect(html).toContain("admin-btn admin-btn-secondary");
  expect(html).toContain("admin-btn admin-btn-quiet");
  expect(html).toContain("admin-status");
  // `Button` generik akan menarik gaya aplikasi, bukan gaya meja kerja admin.
  expect(html).not.toMatch(/data-slot="button"/);
});

test("pita judul memakai kuning yang sama dengan dialog passcode", () => {
  const html = markup();
  expect(html).toContain("border-b-2 border-[#121212] bg-[#FFE662]");
  expect(html).toContain("Pesan undangan siap dibagikan");
});

test("isi pesan terlihat, bukan hanya tersembunyi di tombol WhatsApp", () => {
  const html = markup();
  expect(html).toContain("Isi pesan yang akan dikirim");
  expect(html).toContain("Anda telah diundang resmi menjadi Administrator Ruang Kerja");
  // Teks pesan harus benar-benar ada di DOM, bukan cuma di atribut href.
  expect(html).toContain(PROPS.url);
});

test("pesan tidak pernah memakai email penerima di tempat peran", () => {
  const html = markup();
  // Kalimat peran yang memuat email adalah kalimat yang memalukan.
  expect(html).not.toContain(`ruang pengelola ${PROPS.email}`);
  // Email penerima tetap boleh muncul di catatan masa berlaku — di situ memang
  // itu informasinya.
  expect(html).toContain(`<strong>${PROPS.email}</strong>`);
});

test("tautan WhatsApp membawa pesan yang persis sama dengan yang ditampilkan", () => {
  const html = markup();
  const href = html.match(/href="(https:\/\/wa\.me\/\?text=[^"]+)"/)?.[1];
  expect(href).toBeDefined();
  const shared = decodeURIComponent((href ?? "").replace("https://wa.me/?text=", ""));
  expect(shared).toContain("Anda telah diundang resmi menjadi Administrator Ruang Kerja");
  expect(shared).toContain(PROPS.url);
  // Urutannya harus sama: yang dilihat SuperAdmin = yang terkirim.
  expect(shared.indexOf(PROPS.url)).toBeGreaterThan(shared.indexOf("Gunakan tautan berikut"));
});

test("catatan masa berlaku dan sifat sekali pakai tetap terbaca", () => {
  const html = markup();
  expect(html).toContain("Berlaku");
  expect(html).toContain("satu kali");
  expect(html).toContain("siapa pun yang memegang tautannya bisa masuk");
});

test("setiap aksi punya label yang bisa dibaca pembaca layar", () => {
  const html = markup();
  for (const label of ["Tautan undangan", "Salin Tautan", "Kirim via WhatsApp", "Salin pesan"]) {
    expect(html).toContain(label);
  }
  // Ikon dekoratif tidak boleh ikut diumumkan.
  expect(html.match(/aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
});
