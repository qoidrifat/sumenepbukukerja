import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { AuthAdminPanel, type AuthAdminPanelProps } from "./auth-admin-panel";

/**
 * Urutan isi layar masuk ruang pengelola.
 *
 * Panel ini murni presentasi, jadi markup statis sudah cukup untuk menjaga
 * apa yang dilihat orang. Fokus test ini: pembatas "atau".
 *
 * Pembatas itu tadinya dirender SESUDAH kedua tombol, padahal di cabang ini
 * tidak ada apa pun lagi di bawahnya. Jadi ia tidak memisahkan apa pun -
 * pembaca mengira masih ada pilihan ketiga, lalu mendapat baris kosong.
 * Yang benar: satu garis antara "Masuk dengan Google" dan "Gunakan email dan
 * sandi".
 *
 * `flex-1` pada kedua garis sebenarnya juga bisa memusatkan teks, tapi angka
 * itu ikut berubah kalau salah satu garis perlu panjang berbeda. Grid tiga
 * kolom menggabungkan lebar garis kiri dan kanan dalam satu track, jadi
 * keduanya selalu sama panjang dan teksnya selalu di titik tengah.
 */

const props: AuthAdminPanelProps = {
  step: "signIn",
  passcodeGranted: true,
  passcode: "",
  onPasscodeChange: () => {},
  showPasscode: false,
  onToggleShowPasscode: () => {},
  onPasscodeSubmit: () => {},
  passcodeState: { kind: "idle" },
  wasRevoked: false,
  isLoading: false,
  firebaseEnabled: true,
  passwordMode: "signIn",
  resetEmail: "",
  onResetEmailChange: () => {},
  showReset: false,
  onToggleReset: () => {},
  onTogglePasswordMode: () => {},
  onGoogleSignIn: () => {},
  onPasswordSubmit: () => {},
  onPasswordReset: () => {},
  error: null,
  notice: null,
  onGoHome: () => {},
  formatLockRemaining: () => "5 menit",
};

const render = (ubah: Partial<AuthAdminPanelProps> = {}) =>
  renderToStaticMarkup(createElement(AuthAdminPanel, { ...props, ...ubah }));

/**
 * Posisi ketiga penanda di markup hasil render.
 *
 * Yang dijaga adalah urutan kemunculannya, bukan isi setiap elemen. Menghitung
 * ulang isi tiap elemen hanya menambah pekerjaan parser tanpa menambah
 * keyakinan: satu penanda yang muncul di tempat yang salah akan langsung
 * terlihat dari urutannya.
 */
const posisi = (html: string) => ({
  google: html.indexOf("Masuk dengan Google"),
  pembatas: html.indexOf(">atau<"),
  email: html.indexOf("Gunakan email dan sandi"),
});

test("pembatas atau memisahkan Google dan email, bukan menggantung di bawah", () => {
  const urut = posisi(render());
  expect(urut.google).toBeGreaterThan(-1);
  expect(urut.pembatas).toBeGreaterThan(-1);
  expect(urut.pembatas).toBeGreaterThan(urut.google);
  expect(urut.pembatas).toBeLessThan(urut.email);
});

test("pembatas hanya muncul di langkah verifikasi email", () => {
  expect(render({ step: "signIn" })).toContain(">atau<");
  // Di layar passcode tidak ada pilihan kedua, jadi pembatas tidak boleh
  // muncul di sana dan membuat orang mengira ada langkah tambahan.
  expect(render({ passcodeGranted: false })).not.toContain(">atau<");
});

test("teks pembatas tepat di tengah dan kedua garis sama panjang", () => {
  const html = render();
  expect(html).toContain("grid-cols-[1fr_auto_1fr]");
  expect(html).toContain("items-center");
  const pembatas =
    /<div class="my-1 grid grid-cols-\[1fr_auto_1fr\][^"]*">([\s\S]*?)<\/div>/.exec(html);
  expect(pembatas?.[1]).toBeDefined();
  // Dua garis tanpa lebar eksplisit: panjangnya datang dari track grid yang
  // sama, jadi tidak mungkin salah satu lebih panjang dari yang lain.
  expect((pembatas![1]!.match(/class="h-px bg-\[#121212\]"/g) ?? []).length).toBe(2);
});

test("panel tidak memuat warna palet publik", () => {
  // Warna publik membuat layar ini terbaca sebagai situs warga, bukan sistem
  // internal. Peta warna publik adalah slate dan biru dari tema warga.
  const html = render();
  for (const warna of ["text-slate-", "bg-blue-", "border-blue-", "text-blue-"]) {
    expect(html, warna).not.toContain(warna);
  }
});
