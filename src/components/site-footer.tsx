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
 * Semua tujuan tautan diverifikasi ada di router. Halaman hukum, profil
 * sosial, nomor telepon, dan alamat kantor TIDAK pernah ada di proyek ini,
 * jadi tidak ditampilkan: tautan mati lebih buruk daripada tidak ada tautan.
 */

const TAHUN = new Date().getFullYear();

import { focusRing, focusRingGelap } from "@/lib/focus-ring";

type Anchor = { label: string; id: string };

const jelajahi: Anchor[] = [
  { label: "Katalog", id: "katalog" },
  { label: "Permintaan warga", id: "permintaan" },
  { label: "Cara Pakai", id: "cara-pakai" },
];

const akun: { label: string; to: string }[] = [{ label: "Dasbor saya", to: "/dashboard" }];

const hukum: { label: string; to: string }[] = [
  { label: "Kebijakan Privasi", to: "/kebijakan-privasi" },
  { label: "Syarat & Ketentuan", to: "/syarat-ketentuan" },
];

/**
 * Siluet dekoratif: panorama Kota Sumenep dalam satu garis dasar.
 *
 * Delapan ikon yang semuanya bisa dikenali sebagai Sumenep, kiri ke kanan:
 *
 *   0. Deretan rumah kampung - latar pola permukiman Taneyan Lanjhang.
 *   1. Cemara udang (Casuarina equisetifolia) sepasang - pohon yang membuat
 *      Pantai Lombang khas; ramping, berdaun jarum, mengerucut ke atas.
 *   2. Siwalan (Borassus flabellifer) - pohon ikonik Madura, batang tinggi
 *      dengan pelepah mengipasi dan tandan buah di puncaknya.
 *   3. Perahu layar - Sumenep kabupaten kepulauan, pesisir adalah bagian
 *      dari kotanya.
 *   4. Labang Mesem (1781) - gerbang Keraton Sumenep, karya Panembahan
 *      Somala dengan arsitek Lauw Piango. Atap tumpang bertingkat + mustaka,
 *      mulut gerbang tembus, dan sayap rendah di kiri-kanan.
 *   5. Masjid Agung Jamik (1779) - atap tumpang tiga tingkat, mustaka
 *      bermahkota tiga bola, menara berkupla di sisinya.
 *   6. Langghar - surau rumah panggung, inti pola Taneyan Lanjhang; berdiri
 *      di atas empat tiang dengan kolong tembus.
 *   7. Deretan rumah kampung setelahnya.
 *
 * Sinkronisasi. Semua yang berdiri di darat alasnya menempel tepat pada
 * GARIS TANAH y=169.68 (y=252 di kanvas asal), dan lambung perahu menempel
 * tepat pada GARIS AIR y=185.84 (y=276). Karena itu tak ada objek yang bisa
 * menggantung: menggeser satu bentuk akan langsung terlihat alasnya lepas
 * dari salah satu garis.
 *
 * Kedalaman atmosferik: tiga punggung bukit di belakang dengan opacity
 * 0.12 / 0.22 / 0.35 memberi kesan jarak tanpa menenggelamkan objek depan;
 * seluruh objek depan ketebalan penuh. Jendela, pintu, dan kolong diukir dari siluet depan lewat mask,
 * sehingga tampak bukit di belakangnya - bukan bidang tempel.
 *
 * Semua bentuk orisinal dan sengaja disederhanakan; bukan gambar dokumentasi
 * arsitektur dan tidak dimaksudkan merekonstruksi bangunan tertentu. Karena
 * itu `aria-hidden` dan tidak pernah menjadi satu-satunya penanda identitas
 * lokal.
 */
// --- Lapis belakang: tiga punggung bukit, makin dekat makin tebal. ---
const SILUET_BUKIT_JAUH: string[] = [
  "M 0 202 V 101 C 160 82.1467 340 84.84 520 98.3067 C 700 111.773 840 118.507 1000 119.853 C 1160 121.2 1300 107.733 1440 101 V 202 Z",
];

const SILUET_BUKIT_TENGAH: string[] = [
  "M 0 202 V 122.547 C 180 107.733 380 111.773 560 125.24 C 740 138.707 900 144.093 1060 142.747 C 1220 141.4 1340 129.28 1440 125.24 V 202 Z",
];

const SILUET_BUKIT_DEKAT: string[] = [
  "M 0 202 V 144.093 C 200 130.627 420 134.667 620 146.787 C 820 158.907 980 161.6 1140 158.907 C 1280 156.213 1380 148.133 1440 144.093 V 202 Z",
];

// --- Garis tanah (y=252 -> 169.68) dan garis air (y=276 -> 185.84). ---
const SILUET_TANAH: string[] = [
  "M 0 202 V 169.68 H 1440 V 202 Z",
  "M 0 202 V 185.84 H 1440 V 202 Z",
];

// --- 1. Kampung kiri (isi ruang, latar Taneyan Lanjhang). ---
const SILUET_KAMPUNG_KIRI: string[] = [
  "M 62 156.213 H 100 V 169.68 H 62 Z",
  "M 58 156.213 L 81 144.093 L 104 156.213 Z",
  "M 116 152.173 H 154 V 169.68 H 116 Z",
  "M 112 152.173 L 135 140.053 L 158 152.173 Z",
  "M 170 154.867 H 208 V 169.68 H 170 Z",
  "M 166 154.867 L 189 142.747 L 212 154.867 Z",
];

// --- 2. Cemara udang, ciri Pantai Lombang. ---
const SILUET_CEMARA: string[] = [
  "M 229 169.68 h 6 v -8.08 h -6 z",
  "M 206 161.6 L 232 151.5 L 258 161.6 Z",
  "M 209 151.5 L 232 140.727 L 255 151.5 Z",
  "M 213 140.727 L 232 130.627 L 251 140.727 Z",
  "M 216 130.627 L 232 120.527 L 248 130.627 Z",
  "M 219 120.527 L 232 109.753 L 245 120.527 Z",
  "M 223 109.753 L 232 99.6533 L 241 109.753 Z",
  "M 289 169.68 h 6 v -8.08 h -6 z",
  "M 271 161.6 L 292 154.193 L 313 161.6 Z",
  "M 274 154.193 L 292 146.113 L 310 154.193 Z",
  "M 276 146.113 L 292 138.707 L 308 146.113 Z",
  "M 279 138.707 L 292 131.3 L 305 138.707 Z",
  "M 282 131.3 L 292 123.22 L 302 131.3 Z",
  "M 284 123.22 L 292 115.813 L 300 123.22 Z",
];

// --- 3. Siwalan, pohon khas Madura. ---
const SILUET_SIWALAN: string[] = [
  "M 350 169.68 h 10 l -2 -51.1733 h -6 z",
  "M 355 118.507 Q 337 115.813 311 118.507 Q 337 121.2 355 118.507 Z",
  "M 355 118.507 Q 339 111.1 314 107.06 Q 336 116.487 355 118.507 Z",
  "M 355 118.507 Q 345 107.733 324 97.6333 Q 339 111.773 355 118.507 Z",
  "M 355 118.507 Q 352 105.713 338 90.9 Q 344 107.733 355 118.507 Z",
  "M 355 118.507 Q 359 106.387 355 88.88 Q 351 106.387 355 118.507 Z",
  "M 355 118.507 Q 366 107.733 372 90.9 Q 358 105.713 355 118.507 Z",
  "M 355 118.507 Q 371 111.773 386 97.6333 Q 365 107.733 355 118.507 Z",
  "M 355 118.507 Q 374 116.487 396 107.06 Q 371 111.1 355 118.507 Z",
  "M 355 118.507 Q 373 121.2 399 118.507 Q 373 115.813 355 118.507 Z",
  "M 350 121.2 a 5 3.36667 0 1 1 10 0 a 5 3.36667 0 1 1 -10 0 Z",
  "M 415 169.68 h 10 l -2 -37.7067 h -6 z",
  "M 420 131.973 Q 405 129.28 384 131.973 Q 405 134.667 420 131.973 Z",
  "M 420 131.973 Q 408 125.24 388 121.2 Q 405 129.953 420 131.973 Z",
  "M 420 131.973 Q 414 122.547 398 113.12 Q 407 125.913 420 131.973 Z",
  "M 420 131.973 Q 421 121.2 412 108.407 Q 413 122.547 420 131.973 Z",
  "M 420 131.973 Q 427 122.547 428 108.407 Q 419 121.2 420 131.973 Z",
  "M 420 131.973 Q 433 125.913 442 113.12 Q 426 122.547 420 131.973 Z",
  "M 420 131.973 Q 435 129.953 452 121.2 Q 432 125.24 420 131.973 Z",
  "M 420 131.973 Q 435 134.667 456 131.973 Q 435 129.28 420 131.973 Z",
  "M 415 134.667 a 5 3.36667 0 1 1 10 0 a 5 3.36667 0 1 1 -10 0 Z",
];

// --- 4. Perahu layar di garis air. ---
const SILUET_PERAHU: string[] = [
  "M 462 185.84 H 556 L 540 195.267 H 478 Z",
  "M 506 161.6 h 4 v 24.24 h -4 z",
  "M 506 164.293 480 185.84 506 185.84 Z",
  "M 510 164.293 538 185.84 510 185.84 Z",
];

// --- 5. Labang Mesem (1781), gerbang Keraton Sumenep. ---
const SILUET_LABANG_MESEM: string[] = [
  "M 580 150.827 H 632 V 169.68 H 580 Z",
  "M 776 150.827 H 820 V 169.68 H 776 Z",
  "M 576 150.827 H 636 L 626 141.4 H 586 Z",
  "M 772 150.827 H 824 L 814 141.4 H 774 Z",
  "M 632 134.667 H 776 V 145.44 H 632 Z",
  "M 632 145.44 H 662 V 169.68 H 632 Z",
  "M 746 145.44 H 776 V 169.68 H 746 Z",
  "M 624 129.28 H 784 V 134.667 H 624 Z",
  "M 612 129.28 H 796 L 780 113.12 H 628 Z",
  "M 636 113.12 H 772 L 758 99.6533 H 650 Z",
  "M 660 99.6533 H 748 L 736 88.88 H 672 Z",
  "M 700 88.88 h 8 l -4 -9.42667 z",
];

// --- 6. Masjid Agung Jamik (1779) + menara. ---
const SILUET_MASJID: string[] = [
  "M 846 145.44 H 994 V 169.68 H 846 Z",
  "M 840 145.44 H 1000 L 984 127.933 H 856 Z",
  "M 862 127.933 H 978 L 958 110.427 H 884 Z",
  "M 888 110.427 H 952 L 932 96.96 H 908 Z",
  "M 917 96.96 h 6 l -3 -8.08 z",
  "M 916 83.4933 a 4 2.69333 0 1 1 8 0 a 4 2.69333 0 1 1 -8 0 Z",
  "M 916 78.1067 a 4 2.69333 0 1 1 8 0 a 4 2.69333 0 1 1 -8 0 Z",
  "M 916 72.72 a 4 2.69333 0 1 1 8 0 a 4 2.69333 0 1 1 -8 0 Z",
  "M 1012 134.667 H 1038 V 169.68 H 1012 Z",
  "M 1006 130.627 H 1044 V 136.013 H 1006 Z",
  "M 1015 130.627 C 1015 119.18 1035 119.18 1035 130.627 Z",
  "M 1022 119.18 l 3 -8.75333 3 8.75333 z",
];

// --- 7. Langghar, surau rumah panggung Taneyan Lanjhang. ---
const SILUET_LANGGHAR: string[] = [
  "M 1060 156.213 h 5 v 13.4667 h -5 z M 1080 156.213 h 5 v 13.4667 h -5 z M 1100 156.213 h 5 v 13.4667 h -5 z M 1120 156.213 h 5 v 13.4667 h -5 z",
  "M 1054 152.173 H 1136 V 157.56 H 1054 Z",
  "M 1060 137.36 H 1130 V 152.173 H 1060 Z",
  "M 1052 137.36 H 1138 L 1124 126.587 H 1066 Z",
  "M 1070 126.587 H 1120 L 1110 117.16 H 1080 Z",
  "M 1099 117.16 h 4 l -2 -6.73333 z",
];

// --- 8. Deretan rumah kampung kanan. ---
const SILUET_KAMPUNG_KANAN: string[] = [
  "M 1150 152.173 H 1192 V 169.68 H 1150 Z",
  "M 1146 152.173 L 1171 140.053 L 1196 152.173 Z",
  "M 1206 156.213 H 1248 V 169.68 H 1206 Z",
  "M 1202 156.213 L 1227 144.093 L 1252 156.213 Z",
  "M 1262 150.827 H 1304 V 169.68 H 1262 Z",
  "M 1258 150.827 L 1283 138.707 L 1308 150.827 Z",
  "M 1318 157.56 H 1360 V 169.68 H 1318 Z",
  "M 1314 157.56 L 1339 145.44 L 1364 157.56 Z",
  "M 1374 153.52 H 1416 V 169.68 H 1374 Z",
  "M 1370 153.52 L 1395 141.4 L 1420 153.52 Z",
  "M 1428 156.213 H 1436 V 169.68 H 1428 Z",
  "M 1424 156.213 L 1432 144.093 L 1440 156.213 Z",
];

// --- Celah: jendela, pintu, dan kolong yang dilubangi dari siluet depan. ---
const SILUET_CELAH: string[] = [
  "M 73 168.333 L 73 160.253 Q 73 154.867 81 154.867 L 81 154.867 Q 89 154.867 89 160.253 L 89 168.333 Z",
  "M 67 169.68 L 67 164.293 Q 67 160.253 72 160.253 L 72 160.253 Q 78 160.253 78 164.293 L 78 169.68 Z",
  "M 127 168.333 L 127 160.253 Q 127 154.867 135 154.867 L 135 154.867 Q 143 154.867 143 160.253 L 143 168.333 Z",
  "M 121 165.64 L 121 160.253 Q 121 156.213 126 156.213 L 126 156.213 Q 132 156.213 132 160.253 L 132 165.64 Z",
  "M 181 168.333 L 181 160.253 Q 181 154.867 189 154.867 L 189 154.867 Q 197 154.867 197 160.253 L 197 168.333 Z",
  "M 175 168.333 L 175 162.947 Q 175 158.907 180 158.907 L 180 158.907 Q 186 158.907 186 162.947 L 186 168.333 Z",
  "M 1162 168.333 L 1162 159.58 Q 1162 153.52 1171 153.52 L 1171 153.52 Q 1180 153.52 1180 159.58 L 1180 168.333 Z",
  "M 1155 165.64 L 1155 160.253 Q 1155 156.213 1160 156.213 L 1160 156.213 Q 1166 156.213 1166 160.253 L 1166 165.64 Z",
  "M 1218 168.333 L 1218 159.58 Q 1218 153.52 1227 153.52 L 1227 153.52 Q 1236 153.52 1236 159.58 L 1236 168.333 Z",
  "M 1211 169.68 L 1211 164.293 Q 1211 160.253 1216 160.253 L 1216 160.253 Q 1222 160.253 1222 164.293 L 1222 169.68 Z",
  "M 1274 168.333 L 1274 159.58 Q 1274 153.52 1283 153.52 L 1283 153.52 Q 1292 153.52 1292 159.58 L 1292 168.333 Z",
  "M 1267 164.293 L 1267 158.907 Q 1267 154.867 1272 154.867 L 1272 154.867 Q 1278 154.867 1278 158.907 L 1278 164.293 Z",
  "M 1330 168.333 L 1330 159.58 Q 1330 153.52 1339 153.52 L 1339 153.52 Q 1348 153.52 1348 159.58 L 1348 168.333 Z",
  "M 1323 171.027 L 1323 165.64 Q 1323 161.6 1328 161.6 L 1328 161.6 Q 1334 161.6 1334 165.64 L 1334 171.027 Z",
  "M 1386 168.333 L 1386 159.58 Q 1386 153.52 1395 153.52 L 1395 153.52 Q 1404 153.52 1404 159.58 L 1404 168.333 Z",
  "M 1379 166.987 L 1379 161.6 Q 1379 157.56 1384 157.56 L 1384 157.56 Q 1390 157.56 1390 161.6 L 1390 166.987 Z",
  "M 1423 168.333 L 1423 159.58 Q 1423 153.52 1432 153.52 L 1432 153.52 Q 1441 153.52 1441 159.58 L 1441 168.333 Z",
  "M 594 165.64 L 594 156.887 Q 594 152.173 601 152.173 L 601 152.173 Q 608 152.173 608 156.887 L 608 165.64 Z",
  "M 796 165.64 L 796 156.887 Q 796 152.173 803 152.173 L 803 152.173 Q 810 152.173 810 156.887 L 810 165.64 Z",
  "M 864 165.64 L 864 155.54 Q 864 149.48 873 149.48 L 873 149.48 Q 882 149.48 882 155.54 L 882 165.64 Z",
  "M 930 165.64 L 930 155.54 Q 930 149.48 939 149.48 L 939 149.48 Q 948 149.48 948 155.54 L 948 165.64 Z",
  "M 974 165.64 L 974 155.54 Q 974 149.48 983 149.48 L 983 149.48 Q 992 149.48 992 155.54 L 992 165.64 Z",
  "M 902 168.333 L 902 156.213 Q 902 148.133 914 148.133 L 914 148.133 Q 926 148.133 926 156.213 L 926 168.333 Z",
  "M 1019 168.333 L 1019 157.56 Q 1019 153.52 1025 153.52 L 1025 153.52 Q 1031 153.52 1031 157.56 L 1031 168.333 Z",
  "M 1082 150.827 L 1082 146.113 Q 1082 140.053 1091 140.053 L 1091 140.053 Q 1100 140.053 1100 146.113 L 1100 150.827 Z",
  "M 1064 153.52 L 1064 145.44 Q 1064 140.053 1072 140.053 L 1072 140.053 Q 1080 140.053 1080 145.44 L 1080 153.52 Z",
];

function SiluetSumenep({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 202"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <mask id="sumenep-celah" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="202">
        <rect width="1440" height="202" fill="#fff" />
        <g fill="#000">
          {SILUET_CELAH.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </mask>

      <g fill="currentColor" opacity="0.12">
        {SILUET_BUKIT_JAUH.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="currentColor" opacity="0.22">
        {SILUET_BUKIT_TENGAH.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="currentColor" opacity="0.35">
        {SILUET_BUKIT_DEKAT.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      <g fill="currentColor" mask="url(#sumenep-celah)">
        {SILUET_TANAH.map((d) => (
          <path key={d} d={d} />
        ))}
        {SILUET_KAMPUNG_KIRI.map((d) => (
          <path key={d} d={d} />
        ))}
        {SILUET_CEMARA.map((d) => (
          <path key={d} d={d} />
        ))}
        {SILUET_SIWALAN.map((d) => (
          <path key={d} d={d} />
        ))}
        {SILUET_PERAHU.map((d) => (
          <path key={d} d={d} />
        ))}
        {SILUET_LABANG_MESEM.map((d) => (
          <path key={d} d={d} />
        ))}
        {SILUET_MASJID.map((d) => (
          <path key={d} d={d} />
        ))}
        {SILUET_LANGGHAR.map((d) => (
          <path key={d} d={d} />
        ))}
        {SILUET_KAMPUNG_KANAN.map((d) => (
          <path key={d} d={d} />
        ))}
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
        {/* Siluet full-bleed: menempel ke tepi kiri-kanan halaman.
            Tinggi SVG `h-auto` mengikuti aspek viewBox (1440:202) sehingga
            `slice` tidak pernah memotong mustaka/menara di monitor lebar. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0">
          <SiluetSumenep className="block h-auto w-full text-slate-950" />
        </div>
      </div>

      {/* Lapis B, C, D - navigasi dan baris bawah. */}
      <div className="bg-slate-950 text-white">
        <div className="mx-auto max-w-[1600px] px-4 pt-12 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-14 lg:px-10 lg:pb-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
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

            <nav aria-label="Hukum">
              <p className="border-t-2 border-blue-400 pt-3 text-sm font-extrabold uppercase tracking-[0.12em] text-blue-300">
                Hukum
              </p>
              <ul className="mt-4 space-y-1">
                {hukum.map(({ label, to }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className={`inline-flex min-h-11 items-center rounded-lg px-1 text-base font-semibold text-slate-300 transition-colors hover:text-white ${focusRingGelap}`}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
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