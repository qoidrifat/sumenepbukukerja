import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { AuthAdminPanel, type AuthAdminPanelProps } from "./auth-admin-panel";

/**
 * Urutan isi layar masuk ruang pengelola (Fase 9.5).
 *
 * Panel ini murni presentasi, jadi markup statis sudah cukup untuk menjaga
 * apa yang dilihat orang. Fokus test ini: matriks dua pintu (Google +
 * Email OTP) dan pembatas "atau".
 *
 * Pembatas itu tadinya dirender SESUDAH kedua tombol, padahal di cabang ini
 * tidak ada apa pun lagi di bawahnya. Jadi ia tidak memisahkan apa pun -
 * pembaca mengira masih ada pilihan ketiga, lalu mendapat baris kosong.
 * Yang benar: satu garis antara "Masuk dengan Google" dan "Masuk dengan Email"
 * HANYA bila keduanya hidup. Satu pintu tampil tanpa pembatas.
 *
 * `flex-1` pada kedua garis sebenarnya juga bisa memusatkan teks, tapi angka
 * itu ikut berubah kalau salah satu garis perlu panjang berbeda. Grid tiga
 * kolom menggabungkan lebar garis kiri dan kanan dalam satu track, jadi
 * keduanya selalu sama panjang dan teksnya selalu di titik tengah.
 */

const props: AuthAdminPanelProps = {
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
  otpEnabled: true,
  otpKnown: true,
  onGoogleSignIn: () => {},
  onOtpOpen: () => {},
  error: null,
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
  email: html.indexOf("Masuk dengan Email"),
});

/** Token dan primitive admin dibaca dari CSS asli, bukan dari ingatan test. */
const CSS = readFileSync("src/index.css", "utf8");

/**
 * Posisi kedua tombol di baris aksi langkah passcode.
 *
 * Yang dijaga adalah urutannya: tombol bunsen di kiri, aksi utama di kanan.
 * `indexOf` dipakai pada label yang sudah unik di seluruh panel, jadi tidak
 * perlu mem-parsing struktur DOM yang sudah dirender server.
 */
const posisiTombol = (html: string) => ({
  kembali: html.indexOf("Kembali ke katalog"),
  verifikasi: html.indexOf("Verifikasi passcode"),
});

/** Isi deklarasi satu blok CSS untuk pola yang diberikan. */
function blokCss(pola: RegExp): string {
  const found = pola.exec(CSS);
  expect(found?.[0], pola.source).toBeDefined();
  return found![0]!;
}

test("pembatas atau memisahkan Google dan email, bukan menggantung di bawah", () => {
  const urut = posisi(render());
  expect(urut.google).toBeGreaterThan(-1);
  expect(urut.pembatas).toBeGreaterThan(-1);
  expect(urut.pembatas).toBeGreaterThan(urut.google);
  expect(urut.pembatas).toBeLessThan(urut.email);
});

test("pembatas hanya muncul bila kedua pintu hidup", () => {
  const dua = posisi(render({ firebaseEnabled: true, otpEnabled: true }));
  expect(dua.pembatas).toBeGreaterThan(dua.google);
  expect(dua.pembatas).toBeLessThan(dua.email);
  // Satu pintu tampil tanpa pembatas yang menggantung.
  expect(render({ firebaseEnabled: true, otpEnabled: false })).not.toContain(">atau<");
  expect(render({ firebaseEnabled: false, otpEnabled: true })).not.toContain(">atau<");
  // Di layar passcode tidak ada pilihan kedua, jadi pembatas tidak boleh
  // muncul di sana dan membuat orang mengira ada langkah tambahan.
  expect(render({ passcodeGranted: false })).not.toContain(">atau<");
});

test("satu pintu mati menyembunyikan tombolnya, bukan menonaktifkannya", () => {
  // Tombol mati yang pasti gagal diklik berkali-kali tanpa terjadi apa-apa.
  const tanpaOtp = render({ firebaseEnabled: true, otpEnabled: false });
  expect(tanpaOtp).toContain("Masuk dengan Google");
  expect(tanpaOtp).not.toContain("Masuk dengan Email");
  expect(tanpaOtp).not.toMatch(/<button[^>]*disabled/);
  const tanpaGoogle = render({ firebaseEnabled: false, otpEnabled: true });
  expect(tanpaGoogle).toContain("Masuk dengan Email");
  expect(tanpaGoogle).not.toContain("Masuk dengan Google");
});

test("tidak ada sisa jalur sandi di panel", () => {
  const html = render();
  expect(html).not.toMatch(/sandi/i);
  expect(html).not.toContain("Lupa sandi");
  expect(html).not.toContain("firebasePassword");
});

test("fallback ditahan selama status OTP belum diketahui", () => {
  // Aturan yang sama dengan layar warga: `otpEnabled=false` + query belum
  // terjawab = belum tahu, bukan mati. Fallback yang flash lalu berganti
  // tombol dibaca sebagai situs rusak.
  const loading = render({ firebaseEnabled: false, otpEnabled: false, otpKnown: false });
  expect(loading).not.toContain("Pintu masuk belum siap");
  expect(loading).not.toContain("Masuk dengan Email");
  expect(loading).toContain('aria-label="Memuat opsi masuk"');
  const mati = render({ firebaseEnabled: false, otpEnabled: false, otpKnown: true });
  expect(mati).toContain("Pintu masuk belum siap di lingkungan ini.");
  expect(mati).toContain("Email OTP");
});

test("tombol Email di panel memakai ikon amplop mono sewarna teks", () => {
  // Tema ruang kerja melarang warna palet publik: ikon memakai currentColor
  // supaya selalu mengikuti warna tombolnya, bukan biru brand.
  const html = render({ firebaseEnabled: false, otpEnabled: true });
  const at = html.indexOf("Masuk dengan Email");
  const svgAt = html.indexOf("<svg", html.lastIndexOf("<button", at));
  expect(svgAt).toBeGreaterThan(-1);
  expect(svgAt).toBeLessThan(at);
  expect(html).toContain('stroke="currentColor"');
  expect(html).not.toContain("#2563EB");
});

test("tombol Email di panel memakai cincin fokus tema ruang kerja", () => {
  // Panel memakai `<button>` mentah + kelas `.admin-btn`, bukan `focusRing`
  // dari `@/lib/focus-ring`: cincinnya datang dari aturan tema. Yang
  // dikunci: aturan itu mencakup `button` dan berupa outline yang tidak
  // bisa hilang di balik background (bukan bayangan).
  expect(CSS).toMatch(/\.admin-workspace :where\(a, button[^)]*\):focus-visible/);
  const aturan = /\.admin-workspace :where\(a, button[^)]*\):focus-visible[^{]*\{[^}]*\}/.exec(CSS);
  expect(aturan?.[0]).toContain("outline: 3px solid");
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

test("kartu layar passcode memakai bingkai penuh, bukan garis shell", () => {
  // Gejalanya di produksi pada lebar >= 1024px: `.admin-shell-frame` hanya
  // memberi `border-inline-width: 2px`, jadi yang terlihat dua garis vertikal
  // panjang tanpa tutup atas dan bawah, sementara bingkai aslinya ada di
  // `.admin-panel` di dalam. Dua bingkai tidak pernah bertemu, dan kartu
  // terbaca belum selesai.
  const html = render({ passcodeGranted: false });
  expect(html).toContain("admin-shell-frame admin-frame-card");

  const bingkai = blokCss(/\.admin-workspace \.admin-frame-card \{[^}]*\}/);
  expect(bingkai).toContain("border: 2px solid var(--admin-line)");
  expect(bingkai).toContain("box-shadow: 4px 4px 0 0 var(--admin-line)");
  expect(bingkai).toContain("border-radius: 2px");

  // Panel di dalam melepas bingkainya sendiri; kalau tidak, garis kartu dan
  // garis panel jadi dua garis parallel yang sangat dekat.
  expect(blokCss(/\.admin-frame-card > \.admin-panel \{[^}]*\}/)).toContain("border: 0");
});

test("kelas bingkai kartu ditulis sesudah aturan shell frame", () => {
  // Keduanya selektor dua kelas, jadi spesifisitas sama dan urutan yang
  // menentukan. `border-inline: 0` milik shell frame akan mengalahkan
  // shorthand `border` kartu kalau kartu ditulis lebih dulu.
  const shell = CSS.indexOf(".admin-workspace .admin-shell-frame {");
  const kartu = CSS.indexOf(".admin-workspace .admin-frame-card {");
  expect(shell).toBeGreaterThan(-1);
  expect(kartu).toBeGreaterThan(shell);
});

test("baris aksi passcode: tombol bunsen di kiri, aksi utama di kanan", () => {
  const html = render({ passcodeGranted: false });
  const urut = posisiTombol(html);
  expect(urut.kembali).toBeGreaterThan(-1);
  expect(urut.verifikasi).toBeGreaterThan(-1);
  expect(urut.kembali, "Kembali ke katalog harus lebih dulu").toBeLessThan(urut.verifikasi);
});

test("kedua tombol pada baris aksi passcode sama lebar", () => {
  // `w-full sm:w-auto` pernah membuat lebarnya mengikuti isi teks, jadi
  // tombol panjang memakan hampir seluruh baris dan tombol pendek menyisakan
  // ruang kosong. Grid dua kolom dengan `w-full` memberi tepat 50% untuk
  // keduanya tanpa menghitung teks.
  const html = render({ passcodeGranted: false });
  expect(html).toContain("grid grid-cols-2 gap-2 border-t-2 border-[#121212]");
  expect(html).toContain("admin-btn admin-btn-secondary admin-btn--half w-full");
  expect(html).toContain("admin-btn admin-btn-primary admin-btn--half w-full");
  expect(html).not.toContain("sm:w-auto");
});

test("penyempitan tombol setengah tidak mengikis tinggi minimum tema", () => {
  // `.admin-btn--half` hanya boleh mengurangi ruang horizontal. Kalau ikut
  // menyentuh `min-height`, target sentuh 48px milik tema hilang tepat di
  // layar sempit - tempat tombol ini paling sempit.
  const blok = blokCss(/\.admin-workspace \.admin-btn--half \{[^}]*\}/);
  expect(blok).toContain("padding-inline");
  expect(blok).not.toContain("min-height");
  expect(blok).not.toContain("border");
});

test("kelas tombol tengah ditulis sesudah blok padding admin-btn", () => {
  // `.admin-workspace .admin-btn` menulis `padding: 0.65rem 1rem` dengan
  // selektor dua kelas. Kalau `.admin-btn--half` ditulis lebih awal, shorthand
  // itu selalu menang dan penyempitan itu sama sekali tidak terjadi - kelas
  // terlihat benar di markup, tetapi tidak mengubah apa pun.
  const dasar = CSS.indexOf(".admin-workspace .admin-btn,");
  const setengah = CSS.indexOf(".admin-workspace .admin-btn--half {");
  expect(dasar).toBeGreaterThan(-1);
  expect(setengah, "kelas tombol setengah harus ditulis setelah .admin-btn").toBeGreaterThan(
    dasar,
  );
});

test("baris identitas boleh membungkus supaya nama brand tidak terpotong", () => {
  // Lencana "Akses mengelola" memakan lebih dari separuh baris di lebar
  // bawah 430px. Tanpa `flex-wrap`, judul brand ikut ellipsis - dan nama
  // yang tidak terbaca justru bagian pertama yang disebut saat kartu
  // dikritik kurang profesional.
  expect(render()).toContain("mb-4 flex flex-wrap items-center gap-3");
});
