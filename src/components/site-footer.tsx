import { useCallback } from "react";
import type { MouseEvent } from "react";
import { Link } from "react-router";
import { useReducedMotion } from "framer-motion";

/**
 * Footer editorial Sumenep Buku Kerja.
 *
 * Dibangun ulang karena yang lama hanya berisi dua kalimat: tidak ada
 * navigasi, tidak ada ajakan, dan tahun hak cipta ditulis mati sebagai "2025"
 * sehingga selalu basuh satu tahun setelahnya.
 *
 * Empat lapis, dari atas:
 *
 *   A. Pita visual - gradasi hangat dengan siluet lokal, jadi penutup halaman
 *      bukan sekadar pengulangan isi. Siluetnya dibuat orisinal di sini sebagai
 *      motif dekoratif, BUKAN gambar dokumentasi arsitektur: bentuk gerbang
 *      disederhanakan dengan sengaja dan tidak dimaksudkan merekonstruksi
 *      bangunan tertentu. Karena itu `aria-hidden` dan tidak pernah jadi
 *      satu-satunya penanda identitas.
 *   B. Navigasi   - kolom brand dan kelompok tautan.
 *   C. Pita identitas lokal - satu kalimat, satu garis, tanpa animasi.
 *   D. Baris bawah - tahun dinamis dan tautan ke beranda.
 *
 * Semua tujuan tautan diverifikasi ada di router. Halaman قانون,Profil
 * sosial, nomor telepon, dan alamat kantor TIDAK pernah ada di proyek ini,
 * jadi tidak ditampilkan: tautan mati lebih buruk daripada tidak ada tautan.
 */

const TAHUN = new Date().getFullYear();

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
const focusRingGelap =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

type Anchor = { label: string; id: string };

const jelajahi: Anchor[] = [
  { label: "Katalog", id: "katalog" },
  { label: "Permintaan warga", id: "permintaan" },
  { label: "Cara Pakai", id: "cara-pakai" },
];

const akun: { label: string; to: string }[] = [{ label: "Dasbor saya", to: "/dashboard" }];

/**
 * Siluet dekoratif: perbukitan Madura, gerbang bergubuk, dan pohon ardi.
 *
 * Dua hal yang menentukan bentuk di sini.
 *
 * Pertama, posisinya DI TENGAH viewBox, bukan di kanan. Elemen ini memakai
 * `preserveAspectRatio="slice"`, jadi di layar sempit bagian kiri dan kanan
 * terpotong. Gerbang yang duduk di tengah selalu terlihat; kalau ditaruh di
 * kanan seperti pada percobaan pertama, di 390px yang terlihat hanya sisa
 * ujungnya.
 *
 * Kedua, bentuk atapnya bertingkat dan simetris, bukan tumpukan lingkaran.
 * Siluet yang tidak terbaca sebagai bangunan lebih buruk daripada tidak ada
 * ilustrasi sama sekali - ia terlihat seperti noda, bukan seperti gerbang.
 *
 * Motif ini orisinal dan sengaja disederhanakan. Ia bukan gambar dokumentasi
 * arsitektur Sumenep dan tidak dimaksudkan merekonstruksi bangunan tertentu,
 * karena itu `aria-hidden` dan tidak pernah menjadi satu-satunya penanda
 * identitas lokal.
 */
function SiluetSumenep({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 260"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor">
        {/* Perbukitan landai khas Madura. */}
        <path d="M0 260V214c150-26 268-14 392 4 128 19 232-4 356-16 128-13 226 6 336 22 122 18 232 8 356-14v50Z" />

        {/* Gerbang: atap bertingkat, makin ke atas makin sempit. */}
        <path d="M718 62h8v20h-8z" />
        <path d="M694 82h56l8 20h-72z" />
        <path d="M678 108h88l9 22h-106z" />
        <path d="M662 136h120l10 24h-140z" />
        {/* Badan gerbang: dua pilar dan sebuah ambang, jadi lubangnya terbaca. */}
        <path d="M672 160h100v12H672zM674 172h24v40h-24zM746 172h24v40h-24z" />

        {/* Sayap kiri dan kanan, lebih rendah dari badan utama. */}
        <path d="M596 186h66l-7-13h-52zM606 186h42v26h-42z" />
        <path d="M782 186h66l-7-13h-52zM796 186h42v26h-42z" />

        {/* Pohon ardi kiri. */}
        <path d="M250 176h7v36h-7z" />
        <path d="M250 148a26 26 0 1 1 0 52 26 26 0 0 1 0-52Z" />
        <path d="M226 168a18 18 0 1 1 0 36 18 18 0 0 1 0-36Z" />
        <path d="M274 168a18 18 0 1 1 0 36 18 18 0 0 1 0-36Z" />

        {/* Pohon ardi kanan, sedikit lebih kecil agar tidak berpasangan kaku. */}
        <path d="M1186 182h6v30h-6z" />
        <path d="M1186 156a22 22 0 1 1 0 44 22 22 0 0 1 0-44Z" />
        <path d="M1164 174a15 15 0 1 1 0 30 15 15 0 0 1 0-30Z" />
        <path d="M1208 174a15 15 0 1 1 0 30 15 15 0 0 1 0-30Z" />

        {/* Deretan rumah sederhana, hanya garis atap dan badan. */}
        <path d="M928 196v-22l26-16 26 16v22Z" />
        <path d="M994 196v-16l20-13 20 13v16Z" />
        <path d="M1048 196v-22l26-16 26 16v22Z" />

        {/* Perahu kecil di tengah, pengingat bahwa ini pesisir.
            Seluruhnya diletakkan DI ATAS garis bukit: kalau menempel
            pada bukit, yang terlihat hanya layarnya saja. */}
        <path d="M436 196h84l-14 14h-56z" />
        <path d="M474 196v-34l26 34z" />
        <path d="M468 196v-24l-20 24z" />
      </g>
    </svg>
  );
}
export default function SiteFooter() {
  const kurangiGerak = useReducedMotion();

  /**
   * Minta peramban melompat ke bagian halaman, lalu perbarui alamatnya.
   *
   * `scrollIntoView` dipakai, bukan tautan `href="#id"` biasa, karena
   * `Link` milik React Router hanya mengubah rute - tautan jangkar ke section
   * di halaman yang sama tidak akan bergerak sama sekali.
   */
  const keAnchor = useCallback(
    (id: string) => (acara: MouseEvent<HTMLAnchorElement>) => {
      const target = id.startsWith("#") ? null : document.getElementById(id);
      if (!target) {
        // Target belum ada di DOM: biarkan perilaku bawaan tautan yang menangani,
        // supaya tidak ada navigasi yang hilang begitu saja.
        return;
      }
      acara.preventDefault();
      target.scrollIntoView({
        behavior: kurangiGerak ? "auto" : "smooth",
        block: "start",
      });
      window.history.replaceState(null, "", id.startsWith("#") ? id : `#${id}`);
    },
    [kurangiGerak],
  );

  return (
    <footer className="relative z-10 mt-0">
      {/* Lapis A - penutup visual. */}
      <div className="relative isolate overflow-hidden bg-gradient-to-b from-[#FFFDF8] via-[#FCEFD9] to-[#F7DFB4]">
        <div className="relative z-10 mx-auto max-w-[1600px] px-4 pt-10 pb-28 sm:px-6 sm:pt-14 sm:pb-36 lg:px-10 lg:pt-20 lg:pb-52">
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-700">
            Sumenep Buku Kerja
          </p>
          <h2 className="mt-2 max-w-3xl text-[clamp(1.8rem,5vw,3.4rem)] font-black leading-[1.05] tracking-[-0.045em] text-slate-950">
            Temukan yang dekat. Dukung usaha lokal.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg sm:leading-8">
            Dari kebutuhan sehari-hari sampai kebutuhan yang lebih teknis, temukan dan hubungi
            penyedia jasa di sekitar Sumenep tanpa harus jauh-jauh.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href="#katalog"
              onClick={keAnchor("katalog")}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-700 px-6 text-base font-extrabold text-white transition-colors hover:bg-blue-800 ${focusRing}`}
            >
              Cari layanan
            </a>
            <a
              href="#permintaan"
              onClick={keAnchor("permintaan")}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-slate-950 bg-white/70 px-6 text-base font-extrabold text-slate-950 transition-colors hover:bg-white ${focusRing}`}
            >
              Ajukan kebutuhan
            </a>
          </div>
        </div>
        <SiluetSumenep className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full text-slate-950 sm:h-36 lg:h-56" />
      </div>

      {/* Lapis B, C, D - navigasi dan baris bawah. */}
      <div className="bg-slate-950 text-white">
        <div className="mx-auto max-w-[1600px] px-4 pt-12 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-14 lg:px-10 lg:pb-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
            <div className="sm:col-span-2 lg:col-span-1">
              <Link
                to="/"
                className={`inline-flex min-h-12 items-center gap-3 rounded-lg ${focusRingGelap}`}
                aria-label="Sumenep Buku Kerja, ke beranda"
              >
                <img
                  src="/brand/logo-mark.svg"
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-lg border-2 border-white/20 bg-white/10 object-contain"
                  aria-hidden="true"
                />
                <span className="text-xl font-black tracking-[-0.04em]">
                  Sumenep <span className="text-blue-300">Buku</span> Kerja
                </span>
              </Link>
              <p className="mt-4 max-w-sm text-base leading-7 text-slate-300">
                Buku kerja lokal untuk warga Sumenep. Temukan usaha di sekitar rumah, lalu hubungi
                langsung lewat WhatsApp.
              </p>
              <p className="mt-5 text-lg font-extrabold tracking-[-0.02em] text-white">
                Jasa dekat, tanpa ribet.
              </p>
            </div>

            <nav aria-label="Jelajahi">
              <p className="border-t-2 border-blue-400 pt-3 text-sm font-extrabold uppercase tracking-[0.12em] text-blue-300">
                Jelajahi
              </p>
              <ul className="mt-4 space-y-1">
                {jelajahi.map(({ label, id }) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      onClick={keAnchor(id)}
                      className={`inline-flex min-h-11 items-center rounded-lg px-1 text-base font-semibold text-slate-300 transition-colors hover:text-white ${focusRingGelap}`}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Akun">
              <p className="border-t-2 border-blue-400 pt-3 text-sm font-extrabold uppercase tracking-[0.12em] text-blue-300">
                Akun
              </p>
              <ul className="mt-4 space-y-1">
                {akun.map(({ label, to }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className={`inline-flex min-h-11 items-center rounded-lg px-1 text-base font-semibold text-slate-300 transition-colors hover:text-white ${focusRingGelap}`}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/auth"
                    className={`inline-flex min-h-11 items-center rounded-lg px-1 text-base font-semibold text-slate-300 transition-colors hover:text-white ${focusRingGelap}`}
                  >
                    Masuk atau daftar
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          {/* Lapis C - identitas lokal, sekali baca tanpa gerak. */}
          <p className="mt-12 border-t border-white/15 pt-6 text-center text-base font-semibold text-slate-300">
            Dirancang untuk kebutuhan masyarakat Sumenep, Madura.
          </p>

          {/* Lapis D - baris bawah. */}
          <div className="mt-6 flex flex-col-reverse items-center gap-3 border-t border-white/15 pt-6 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <p>© {TAHUN} Sumenep Buku Kerja</p>
            <Link
              to="/"
              className={`inline-flex min-h-11 items-center rounded-lg px-1 font-semibold text-slate-300 transition-colors hover:text-white ${focusRingGelap}`}
            >
              Kembali ke katalog
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}