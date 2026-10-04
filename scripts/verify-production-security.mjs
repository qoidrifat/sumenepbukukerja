#!/usr/bin/env node
/*
 * VERIFIER PRA-DEPLOY - FASE 9.4
 * ==============================
 *
 * Gerbang kesiapan produksi untuk relay audit ruang pengelola. Berkas ini
 * memeriksa satu hal yang tidak bisa diperiksa test unit: apakah lingkungan
 * Vercel Production dan Convex Production benar-benar berisi konfigurasi yang
 * dibutuhkan, dan apakah dua rahasia relay itu konsisten lintas platform.
 *
 * ATURAN YANG TIDAK BOLEH DILANGGAR BERKAS INI
 * --------------------------------------------
 *  - Tidak pernah mencetak nilai rahasia. Tidak nilai penuh, tidak potongan,
 *    tidak awalan, tidak akhiran, tidak base64, tidak panjangnya. Panjang pun
 *    termasuk, karena panjang mempersempit tebakan.
 *  - Tidak pernah menulis nilai rahasia ke berkas, termasuk berkas sementara.
 *    Pembandingan lintas platform terjadi DI DALAM MEMORI satu proses: proses
 *    yang disuntik environment Vercel oleh `vercel env run` membaca nilai
 *    Convex lewat `convex env get --prod`, membandingkan keduanya, lalu HANYA
 *    mencetak verdict.
 *  - Tidak mengubah environment, tidak mendeploy, tidak menghubungi endpoint
 *    tulis mana pun, dan tidak menyentuh data produksi.
 *  - Tidak selalu keluar dengan kode 0. Verifier yang selalu hijau adalah
 *    verifier yang tidak memeriksa apa pun.
 *
 * KENAPA PEMBANDINGAN RAHASIA BUTUH JALUR KHUSUS
 * ----------------------------------------------
 * Vercel menyimpan environment variable dalam tiga bentuk. `plain` dan
 * `encrypted` bisa dibaca kembali oleh pemilik proyek. `sensitive` TIDAK bisa
 * dibaca kembali, bahkan oleh pemiliknya, lewat CLI maupun API. Kalau rahasia
 * relay disimpan sebagai `sensitive`, kesamaan lintas platform tidak bisa
 * dibuktikan dari sisi mana pun, dan verifier harus mengatakannya apa adanya,
 * bukan menurunkan syaratnya menjadi sekadar "variabelnya ada".
 *
 * DUA VARIABEL YANG MEMANG BOLEH DICETAK
 * --------------------------------------
 * `CONVEX_SITE_URL` dan `ADMIN_CONTEXT_ALLOWED_ORIGINS` bukan kredensial.
 * Keduanya alamat publik: host `.convex.site` sudah tertanam di bundel
 * peramban setiap pengunjung, dan daftar origin itu memang nama domain yang
 * dipublikasikan. Nilai keduanya dicetak karena validasinya butuh diperiksa
 * mata manusia. KEDUA RAHASIA TIDAK PERNAH DICETAK DALAM BENTUK APA PUN.
 *
 * KODE KELUAR
 * -----------
 *  0 = seluruh gate wajib lulus
 *  1 = ada pemeriksaan yang gagal
 *  2 = ada pemeriksaan wajib yang tidak dapat diselesaikan atau diverifikasi
 *
 * PEMAKAIAN
 * ---------
 *   node scripts/verify-production-security.mjs
 *   node scripts/verify-production-security.mjs --self-test
 *   node scripts/verify-production-security.mjs --project sumenepbukukerja
 *   node scripts/verify-production-security.mjs --vercel-cwd tmp/vercel-scratch
 *   node scripts/verify-production-security.mjs --convex-deployment prod:focused-lemur-389
 *
 * Prasyarat: `vercel` sudah login, proyek sudah ditautkan ke sebuah direktori
 * (berkas `.vercel/project.json`), dan `convex` bisa membaca deployment
 * produksi. Berkas ini SENGAJA tidak menautkan proyek sendiri: `vercel link`
 * menulis `.env.local` berisi token OIDC, dan verifier dilarang menulis
 * rahasia ke berkas.
 *
 * KENAPA DEPLOYMENT CONVEX DISEBUT EKSPLISIT
 * ------------------------------------------
 * `convex env` biasanya tahu deployment produksi dari `CONVEX_DEPLOYMENT` di
 * `.env.local`. Berkas itu milik alat lokal dan bisa ditimpa `vercel link`
 * (kejadian nyata: tautan Convex hilang, gate ini lalu melaporkan "Convex:
 * missing" padahal environment-nya ada). Nama deployment produksi BUKAN
 * rahasia - URL `https://<nama>.convex.cloud` sudah tertanam di bundel klien
 * setiap pengunjung - jadi verifier menyebutnya eksplisit dan tidak lagi
 * bergantung pada tautan lokal. Nilainya bisa ditimpa lewat
 * `--convex-deployment`; `CONVEX_DEPLOYMENT` di environment tetap dihormati
 * kalau operator memang mengisinya.
 *
 * KENAPA FUNGSI RELAY DIPROBE LANGSUNG
 * ------------------------------------
 * Seluruh aset bisa tampak segar sementara fungsi `api/admin-context` mati,
 * dan dua kegagalan nyata sudah membuktikannya: impor relatif tanpa ekstensi
 * (ERR_MODULE_NOT_FOUND) dan ekspor `default` gaya Node lama (runtime
 * menyodorkan `IncomingMessage`, `request.headers.get` bukan fungsi). Keduanya
 * menjawab 500 pada semua metode dan lolos dari pemeriksaan aset mana pun.
 * Karena itu gate ini menembak GET ke `/api/admin-context` dan menuntut 405;
 * balasan 200 berisi `index.html` berarti fungsinya tidak ada dan permintaan
 * tertelan fallback SPA.
 */

import { spawnSync } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ */
/* Konstanta                                                          */
/* ------------------------------------------------------------------ */

const PASS = "PASS";
const FAIL = "FAIL";
const UNVERIFIABLE = "UNVERIFIABLE";
const INFO = "INFO";

/** Variabel yang wajib ada di sisi Vercel Production. */
const WAJIB_VERCEL = [
  "ADMIN_CONTEXT_RELAY_SECRET",
  "SERVER_IP_HASH_SECRET",
  "CONVEX_SITE_URL",
  "ADMIN_CONTEXT_ALLOWED_ORIGINS",
];

/** Variabel yang wajib ada di sisi Convex Production. */
const WAJIB_CONVEX = [
  "ADMIN_CONTEXT_RELAY_SECRET",
  "SERVER_IP_HASH_SECRET",
  "ADMIN_CONTEXT_ALLOWED_ORIGINS",
];

/** Dua rahasia yang tugasnya berbeda dan nilainya harus berbeda. */
const RAHASIA = ["ADMIN_CONTEXT_RELAY_SECRET", "SERVER_IP_HASH_SECRET"];

/**
 * Deployment Convex produksi untuk membaca environment. Nama deployment ini
 * publik (tertanam di bundel klien sebagai host `.convex.cloud`), dan disebut
 * eksplisit supaya gate tidak bisu hanya karena `.env.local` tertimpa.
 */
const DEPLOYMENT_CONVEX_DEFAULT = "prod:focused-lemur-389";

/**
 * Satu-satunya variabel yang nilainya boleh dicetak, dan alasannya ada di
 * komentar kepala berkas: keduanya alamat publik, bukan kredensial.
 */
const BOLEH_DICETAK = ["CONVEX_SITE_URL", "ADMIN_CONTEXT_ALLOWED_ORIGINS"];

/** Nama yang tidak boleh pernah terdaftar: rahasia dengan awalan VITE_. */
const TERLARANG = ["VITE_ADMIN_CONTEXT_RELAY_SECRET", "VITE_SERVER_IP_HASH_SECRET"];

/** Penanda yang jelas hanya untuk pengembangan. */
const PENANDA_PENGEMBANGAN = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", ".local", ".test"];

/* ------------------------------------------------------------------ */
/* Utilitas                                                           */
/* ------------------------------------------------------------------ */

const hasil = (id, label, status, detail) => ({ id, label, status, detail });

/** Perbandingan waktu tetap atas hash, supaya panjang pun tidak bocor. */
function samaPersis(a, b) {
  const ha = createHash("sha256").update(String(a), "utf8").digest();
  const hb = createHash("sha256").update(String(b), "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Environment untuk proses `convex`: `CONVEX_DEPLOYMENT` selalu eksplisit.
 * Kalau operator mengisinya sendiri, hormati nilai itu; kalau tidak, pakai
 * default yang publik. Argumen CLI menang atas keduanya.
 */
function envConvex(deployment) {
  return {
    ...process.env,
    CONVEX_DEPLOYMENT: deployment ?? process.env.CONVEX_DEPLOYMENT ?? DEPLOYMENT_CONVEX_DEFAULT,
  };
}

/** Status satu nilai environment, tanpa pernah menyebut isinya. */
function statusNilai(value) {
  if (value === undefined || value === null) return "missing";
  if (typeof value !== "string") return "unreadable";
  return value.length === 0 ? "empty" : "configured";
}

/** Verdict kesamaan yang hanya bisa dihitung kalau kedua sisi terbaca. */
function verdictKesamaan(a, b) {
  if (statusNilai(a) !== "configured" || statusNilai(b) !== "configured") return "unverifiable";
  return samaPersis(a, b) ? "match" : "mismatch";
}

const pisahDaftar = (mentah) =>
  String(mentah ?? "")
    .split(",")
    .map((bagian) => bagian.trim().replace(/\/+$/, ""))
    .filter(Boolean);

/** Analisis bentuk satu origin. Tidak pernah memakai isi rahasia. */
function analisisOrigin(mentah) {
  const nilai = String(mentah ?? "").trim().replace(/\/+$/, "");
  if (!nilai) return { valid: false, alasan: "kosong", host: null, wildcard: false };
  if (nilai === "*") return { valid: false, alasan: "wildcard", host: null, wildcard: true };
  let url;
  try {
    url = new URL(nilai);
  } catch {
    return { valid: false, alasan: "bukan_url", host: null, wildcard: false };
  }
  const host = url.host.toLowerCase();
  if (url.protocol !== "https:") return { valid: false, alasan: "bukan_https", host, wildcard: false };
  if (url.pathname !== "/" || url.search.length > 0 || url.hash.length > 0) {
    return { valid: false, alasan: "ada_path_atau_query", host, wildcard: false };
  }
  if (PENANDA_PENGEMBANGAN.some((penanda) => host === penanda || host.endsWith(penanda))) {
    return { valid: false, alasan: "origin_pengembangan", host, wildcard: false };
  }
  return { valid: true, alasan: null, host, wildcard: false };
}

/* ------------------------------------------------------------------ */
/* Pemeriksaan murni (dipakai jalur nyata DAN jalur self-test)         */
/* ------------------------------------------------------------------ */

export function periksaAuthVercel(bukti) {
  const keluaran = String(bukti?.whoami ?? "").trim();
  if (bukti?.gagal) {
    return hasil("vercel.auth", "Autentikasi Vercel", FAIL, "perintah `vercel whoami` gagal");
  }
  if (!keluaran) {
    return hasil("vercel.auth", "Autentikasi Vercel", FAIL, "tidak ada identitas yang dikembalikan");
  }
  return hasil("vercel.auth", "Autentikasi Vercel", PASS, `terautentikasi sebagai ${keluaran}`);
}

export function periksaIdentitasProyek(bukti) {
  const { tertaut, projectName, projectId, orgId, diharapkan } = bukti ?? {};
  if (!tertaut) {
    return hasil(
      "vercel.proyek",
      "Identitas proyek Vercel",
      UNVERIFIABLE,
      "proyek belum ditautkan; tidak ada `.vercel/project.json` yang bisa dibaca",
    );
  }
  // Ketiganya wajib: tanpa id organisasi, nama proyek saja tidak cukup untuk
  // memastikan tautan ini menunjuk organisasi yang benar.
  if (!projectName || !projectId || !orgId) {
    return hasil(
      "vercel.proyek",
      "Identitas proyek Vercel",
      FAIL,
      "berkas tautan tidak lengkap (nama proyek, id proyek, dan id organisasi harus semuanya ada)",
    );
  }
  if (diharapkan && projectName !== diharapkan) {
    return hasil(
      "vercel.proyek",
      "Identitas proyek Vercel",
      FAIL,
      `proyek tertaut bernama lain dari yang diharapkan (diharapkan ${diharapkan})`,
    );
  }
  return hasil(
    "vercel.proyek",
    "Identitas proyek Vercel",
    PASS,
    `tertaut ke ${projectName}; id proyek dan id organisasi sama-sama ada`,
  );
}

export function periksaEnvVercel(bukti) {
  const daftar = bukti?.envs;
  if (!Array.isArray(daftar)) {
    return [
      hasil(
        "vercel.env.daftar",
        "Environment Vercel Production",
        UNVERIFIABLE,
        "daftar environment tidak bisa dibaca",
      ),
    ];
  }
  const baris = [];

  // Rahasia yang pernah didaftarkan dengan awalan VITE_ akan ikut ke bundel
  // peramban. Keberadaannya sendiri sudah pelanggaran, terlepas dari nilainya.
  const bocor = daftar.filter((entri) => TERLARANG.includes(String(entri?.key)));
  baris.push(
    bocor.length === 0
      ? hasil("vercel.env.prefiks", "Tidak ada rahasia berawalan VITE_", PASS, "tidak ada nama terlarang terdaftar")
      : hasil(
          "vercel.env.prefiks",
          "Tidak ada rahasia berawalan VITE_",
          FAIL,
          `ada ${bocor.length} nama terlarang terdaftar sebagai environment Vercel`,
        ),
  );

  for (const nama of WAJIB_VERCEL) {
    const cocok = daftar.filter((entri) => entri?.key === nama);
    if (cocok.length === 0) {
      baris.push(hasil(`vercel.env.${nama}`, `Vercel ${nama}`, FAIL, "tidak terdaftar di proyek"));
      continue;
    }
    const produksi = cocok.filter((entri) =>
      Array.isArray(entri.target) ? entri.target.includes("production") : true,
    );
    if (produksi.length === 0) {
      baris.push(
        hasil(`vercel.env.${nama}`, `Vercel ${nama}`, FAIL, "terdaftar tetapi tidak untuk production"),
      );
      continue;
    }
    const tipe = [...new Set(produksi.map((entri) => entri.type ?? "tidak-diketahui"))].join(",");
    if (RAHASIA.includes(nama) && tipe === "plain") {
      baris.push(hasil(`vercel.env.${nama}`, `Vercel ${nama}`, FAIL, "tersimpan sebagai plain, bisa dibaca siapa pun"));
      continue;
    }
    baris.push(
      hasil(`vercel.env.${nama}`, `Vercel ${nama}`, PASS, `terdaftar untuk production, tipe: ${tipe}`),
    );
  }
  return baris;
}

export function periksaEnvConvex(bukti) {
  const nama = bukti?.names;
  if (!Array.isArray(nama)) {
    return [
      hasil(
        "convex.env.daftar",
        "Environment Convex Production",
        UNVERIFIABLE,
        "daftar environment tidak bisa dibaca",
      ),
    ];
  }
  return WAJIB_CONVEX.map((key) =>
    nama.includes(key)
      ? hasil(`convex.env.${key}`, `Convex ${key}`, PASS, "terdaftar di deployment produksi")
      : hasil(`convex.env.${key}`, `Convex ${key}`, FAIL, "tidak terdaftar di deployment produksi"),
  );
}

/**
 * Konsistensi rahasia lintas platform.
 *
 * Ini gate utama fase ini, dan ia sengaja menerima VERDICT, bukan nilai.
 * Verdict hanya bisa berisi "match", "mismatch", atau "unverifiable"; tidak
 * ada bentuk lain yang bisa menyamarkan "tidak diperiksa" menjadi "lulus".
 */
export function periksaKonsistensiRahasia(bukti) {
  const ketersediaan = bukti?.ketersediaan ?? {};
  const kesamaan = bukti?.kesamaan ?? {};
  const keunikan = bukti?.keunikan ?? {};
  const baris = [];

  for (const nama of RAHASIA) {
    const sisi = ketersediaan[nama] ?? {};
    const statusVercel = sisi.vercel ?? "missing";
    const statusConvex = sisi.convex ?? "missing";

    const keduanyaTerbaca = statusVercel === "configured" && statusConvex === "configured";
    let statusTersedia;
    let detailTersedia;
    if (statusVercel === "missing" || statusConvex === "missing") {
      statusTersedia = FAIL;
      detailTersedia = `Vercel: ${statusVercel}; Convex: ${statusConvex}`;
    } else if (statusVercel === "empty" || statusConvex === "empty") {
      // Nilai kosong pada variabel yang tipe penyimpanannya seharusnya terbaca
      // adalah kegagalan nyata: relay yang menerima kunci kosong tidak menjaga
      // apa pun.
      statusTersedia = FAIL;
      detailTersedia = `variabel ada tetapi bernilai kosong (Vercel: ${statusVercel}; Convex: ${statusConvex})`;
    } else if (keduanyaTerbaca) {
      statusTersedia = PASS;
      detailTersedia = "terbaca dan tidak kosong di kedua platform";
    } else if (statusVercel === "withheld" || statusConvex === "withheld") {
      // Ditahan platform berbeda dari kosong: nilainya ada, tetapi memang tidak
      // bisa dibaca kembali. Itu keterbatasan bukti, bukan cacat konfigurasi.
      statusTersedia = UNVERIFIABLE;
      detailTersedia = `nilai ada tetapi ditahan platform (Vercel: ${statusVercel}; Convex: ${statusConvex}), jadi nilainya tidak bisa dibaca ulang`;
    } else {
      statusTersedia = UNVERIFIABLE;
      detailTersedia = `Vercel: ${statusVercel}; Convex: ${statusConvex}`;
    }
    baris.push(
      hasil(`rahasia.tersedia.${nama}`, `${nama} tersedia di kedua platform`, statusTersedia, detailTersedia),
    );

    const verdict = kesamaan[nama] ?? "unverifiable";
    if (verdict === "mismatch") {
      baris.push(
        hasil(
          `rahasia.cocok.${nama}`,
          `${nama} identik lintas platform`,
          FAIL,
          "nilai BERBEDA antara Vercel dan Convex",
        ),
      );
    } else if (verdict === "match") {
      baris.push(
        hasil(`rahasia.cocok.${nama}`, `${nama} identik lintas platform`, PASS, "nilai identik di kedua platform"),
      );
    } else {
      baris.push(
        hasil(
          `rahasia.cocok.${nama}`,
          `${nama} identik lintas platform`,
          UNVERIFIABLE,
          statusVercel === "withheld" || statusConvex === "withheld"
            ? "nilai ditahan platform (bertipe sensitif), jadi kesamaan lintas platform tidak dapat dibuktikan"
            : "salah satu nilai tidak terbaca, jadi kesamaan tidak dapat dibuktikan",
        ),
      );
    }
  }

  for (const platform of ["Convex", "Vercel"]) {
    const verdict = keunikan[platform.toLowerCase()] ?? "unverifiable";
    if (verdict === "sama") {
      baris.push(
        hasil(
          `rahasia.berbeda.${platform}`,
          `${platform}: kedua rahasia berbeda nilai`,
          FAIL,
          "kedua rahasia bernilai SAMA; satu kebocoran membuka dua tugas sekaligus",
        ),
      );
    } else if (verdict === "beda") {
      baris.push(
        hasil(`rahasia.berbeda.${platform}`, `${platform}: kedua rahasia berbeda nilai`, PASS, "terbukti berbeda"),
      );
    } else {
      baris.push(
        hasil(
          `rahasia.berbeda.${platform}`,
          `${platform}: kedua rahasia berbeda nilai`,
          UNVERIFIABLE,
          "salah satu nilai tidak terbaca di platform ini",
        ),
      );
    }
  }
  return baris;
}

export function periksaConvexSiteUrl(bukti) {
  const sisiVercel = bukti?.vercel;
  const sisiConvex = bukti?.convex;
  const baris = [];
  const statusVercel = statusNilai(sisiVercel);

  if (statusVercel === "missing") {
    baris.push(hasil("url.convex_site", "CONVEX_SITE_URL terisi dan valid", FAIL, "tidak terdaftar atau tidak terbaca"));
  } else if (statusVercel === "empty") {
    baris.push(hasil("url.convex_site", "CONVEX_SITE_URL terisi dan valid", FAIL, "bernilai kosong"));
  } else if (statusVercel !== "configured") {
    baris.push(hasil("url.convex_site", "CONVEX_SITE_URL terisi dan valid", UNVERIFIABLE, "nilai tidak terbaca"));
  } else {
    let url = null;
    try {
      url = new URL(String(sisiVercel).trim());
    } catch {
      url = null;
    }
    if (!url) {
      baris.push(hasil("url.convex_site", "CONVEX_SITE_URL terisi dan valid", FAIL, "bukan URL yang sah"));
    } else {
      const host = url.host.toLowerCase();
      const masalah = [];
      if (url.protocol !== "https:") masalah.push("bukan HTTPS");
      if (/\.convex\.cloud$/.test(host)) masalah.push("menunjuk .convex.cloud padahal router hanya dilayani .convex.site");
      if (!/\.convex\.site$/.test(host)) masalah.push("host tidak berakhiran .convex.site");
      if (url.pathname !== "/" || url.search.length > 0 || url.hash.length > 0) masalah.push("mengandung path atau query");
      baris.push(
        masalah.length === 0
          ? hasil(
              "url.convex_site",
              "CONVEX_SITE_URL terisi dan valid",
              PASS,
              `HTTPS, berakhiran .convex.site, tanpa path tambahan (${host})`,
            )
          : hasil("url.convex_site", "CONVEX_SITE_URL terisi dan valid", FAIL, masalah.join("; ")),
      );
    }
  }

  if (statusVercel === "configured" && statusNilai(sisiConvex) === "configured") {
    let hostVercel = null;
    let hostConvex = null;
    try {
      hostVercel = new URL(String(sisiVercel).trim()).host.toLowerCase();
    } catch {
      hostVercel = null;
    }
    try {
      hostConvex = new URL(String(sisiConvex).trim()).host.toLowerCase();
    } catch {
      hostConvex = null;
    }
    if (hostVercel && hostConvex) {
      baris.push(
        hostVercel === hostConvex
          ? hasil(
              "url.identitas_deployment",
              "Vercel dan Convex menunjuk deployment yang sama",
              PASS,
              `host identik di kedua sisi (deployment ${hostVercel.replace(/\.convex\.site$/, "")})`,
            )
          : hasil(
              "url.identitas_deployment",
              "Vercel dan Convex menunjuk deployment yang sama",
              FAIL,
              "host berbeda antara CONVEX_SITE_URL (Vercel) dan SITE_URL (Convex)",
            ),
      );
    } else {
      baris.push(
        hasil(
          "url.identitas_deployment",
          "Vercel dan Convex menunjuk deployment yang sama",
          UNVERIFIABLE,
          "salah satu nilai bukan URL yang sah",
        ),
      );
    }
  } else {
    baris.push(
      hasil(
        "url.identitas_deployment",
        "Vercel dan Convex menunjuk deployment yang sama",
        UNVERIFIABLE,
        `SITE_URL Convex berstatus ${statusNilai(sisiConvex)}`,
      ),
    );
  }
  return baris;
}

export function periksaOrigins(bukti) {
  const sisiVercel = bukti?.vercel;
  const sisiConvex = bukti?.convex;
  const hostProduksi = Array.isArray(bukti?.hostProduksi) ? bukti.hostProduksi : [];
  const baris = [];
  const statusVercel = statusNilai(sisiVercel);

  if (statusVercel === "missing") {
    return [
      hasil(
        "origin.daftar",
        "ADMIN_CONTEXT_ALLOWED_ORIGINS terisi",
        FAIL,
        "tidak terdaftar di Vercel; daftar kosong membuat CORS tertutup total",
      ),
    ];
  }
  if (statusVercel !== "configured") {
    return [
      hasil(
        "origin.daftar",
        "ADMIN_CONTEXT_ALLOWED_ORIGINS terisi",
        statusVercel === "empty" ? FAIL : UNVERIFIABLE,
        `nilai Vercel berstatus ${statusVercel}`,
      ),
    ];
  }

  const daftar = pisahDaftar(sisiVercel);
  if (daftar.length === 0) {
    return [hasil("origin.daftar", "ADMIN_CONTEXT_ALLOWED_ORIGINS terisi", FAIL, "daftar kosong")];
  }
  baris.push(
    hasil("origin.daftar", "ADMIN_CONTEXT_ALLOWED_ORIGINS terisi", PASS, `${daftar.length} origin terdaftar`),
  );

  const analisis = daftar.map(analisisOrigin);
  const wildcard = analisis.some((a) => a.wildcard);
  const tidakValid = analisis.filter((a) => !a.valid);
  const hosts = new Set(analisis.filter((a) => a.valid).map((a) => a.host));

  baris.push(
    wildcard
      ? hasil("origin.wildcard", "Bukan wildcard", FAIL, "daftar memuat `*`")
      : hasil("origin.wildcard", "Bukan wildcard", PASS, "tidak ada `*` di daftar"),
  );
  baris.push(
    tidakValid.length === 0
      ? hasil(
          "origin.bentuk",
          "Semua origin berbentuk sah",
          PASS,
          `${hosts.size} origin HTTPS tanpa path dan tanpa origin pengembangan`,
        )
      : hasil(
          "origin.bentuk",
          "Semua origin berbentuk sah",
          FAIL,
          [...new Set(tidakValid.map((a) => a.alasan))].join("; "),
        ),
  );

  if (hostProduksi.length === 0) {
    baris.push(
      hasil(
        "origin.domain_produksi",
        "Mencakup domain produksi",
        UNVERIFIABLE,
        "daftar domain produksi proyek tidak bisa dibaca, jadi cakupannya tidak bisa dibuktikan",
      ),
    );
  } else {
    // Alias bawaan Vercel (`*.vercel.app`) selalu ada dan bukan yang dipakai
    // pengunjung. Kalau proyek punya domain kustom, justru domain itu yang
    // wajib masuk daftar; mencakup alias internal saja tidak ada gunanya.
    const hostKustom = hostProduksi.filter((h) => !String(h).endsWith(".vercel.app"));
    const acuan = hostKustom.length > 0 ? hostKustom : hostProduksi;
    const tercakup = acuan.filter((h) => hosts.has(String(h).toLowerCase()));
    baris.push(
      tercakup.length > 0
        ? hasil(
            "origin.domain_produksi",
            "Mencakup domain produksi",
            PASS,
            `mencakup ${tercakup.length} dari ${acuan.length} domain produksi${hostKustom.length > 0 ? " kustom" : ""} proyek`,
          )
        : hasil(
            "origin.domain_produksi",
            "Mencakup domain produksi",
            FAIL,
            hostKustom.length > 0
              ? "tidak satu pun domain kustom produksi proyek ada di daftar origin"
              : "tidak satu pun domain produksi proyek ada di daftar origin",
          ),
    );
  }

  if (statusNilai(sisiConvex) === "configured") {
    const conv = new Set(pisahDaftar(sisiConvex).map((item) => item.replace(/\/+$/, "")));
    const hanyaVercel = [...hosts].filter((host) => !conv.has(`https://${host}`));
    const hanyaConvex = [...conv].filter((item) => !hosts.has(String(item).replace(/^https:\/\//, "").replace(/\/+$/, "")));
    baris.push(
      hanyaVercel.length === 0 && hanyaConvex.length === 0
        ? hasil(
            "origin.lintas_platform",
            "Daftar origin sama di Vercel dan Convex",
            PASS,
            `${hosts.size} origin identik di kedua platform`,
          )
        : hasil(
            "origin.lintas_platform",
            "Daftar origin sama di Vercel dan Convex",
            FAIL,
            `berbeda: ${hanyaVercel.length} hanya di Vercel, ${hanyaConvex.length} hanya di Convex`,
          ),
    );
  } else {
    baris.push(
      hasil(
        "origin.lintas_platform",
        "Daftar origin sama di Vercel dan Convex",
        UNVERIFIABLE,
        `nilai Convex berstatus ${statusNilai(sisiConvex)}`,
      ),
    );
  }
  return baris;
}

/**
 * Pengecualian `/api` pada rewrite SPA.
 *
 * Pola Vercel memakai sintaks path-to-regexp dengan grup regex kustom, dan
 * `new RegExp` membaca grup itu dengan arti yang sama. Simulasi ini bukan
 * pengganti perilaku runtime Vercel, jadi hasilnya dilaporkan sebagai
 * pemeriksaan bentuk, bukan sebagai bukti end-to-end.
 */
export function periksaRewrite(bukti) {
  const isi = bukti?.vercelJson;
  const baris = [];
  if (!isi || typeof isi !== "object" || !Array.isArray(isi.rewrites) || isi.rewrites.length === 0) {
    return [hasil("rewrite.ada", "Rewrite SPA terdaftar", FAIL, "vercel.json tidak memuat daftar rewrites")];
  }

  const fallback = isi.rewrites.filter((r) => r?.destination === "/index.html");
  if (fallback.length === 0) {
    return [hasil("rewrite.fallback", "Fallback SPA ada", FAIL, "tidak ada rewrite ke /index.html")];
  }
  baris.push(hasil("rewrite.fallback", "Fallback SPA ada", PASS, `${fallback.length} rewrite ke /index.html`));

  const menelanApi = [];
  const gagalKompilasi = [];
  for (const aturan of isi.rewrites) {
    const source = String(aturan?.source ?? "");
    if (!source) continue;
    let re = null;
    try {
      re = new RegExp(`^${source}$`);
    } catch {
      gagalKompilasi.push(source);
      continue;
    }
    if (re.test("/api/admin-context")) menelanApi.push(source);
  }

  if (gagalKompilasi.length > 0) {
    baris.push(hasil("rewrite.api", "Rewrite tidak menelan /api/*", FAIL, "ada pola yang tidak bisa dibaca"));
  } else if (menelanApi.length > 0) {
    baris.push(
      hasil("rewrite.api", "Rewrite tidak menelan /api/*", FAIL, "ada pola yang menelan /api/admin-context"),
    );
  } else {
    baris.push(hasil("rewrite.api", "Rewrite tidak menelan /api/*", PASS, "pola SPA mengecualikan /api/"));
  }

  baris.push(
    bukti?.adaFungsiRelay === true
      ? hasil("rewrite.fungsi_api", "Fungsi server /api/admin-context ada", PASS, "berkas fungsi ditemukan")
      : bukti?.adaFungsiRelay === false
        ? hasil("rewrite.fungsi_api", "Fungsi server /api/admin-context ada", FAIL, "berkas fungsi tidak ditemukan")
        : hasil("rewrite.fungsi_api", "Fungsi server /api/admin-context ada", UNVERIFIABLE, "tidak bisa diperiksa"),
  );
  return baris;
}

/**
 * Build Command tidak boleh menjalankan langkah yang butuh token Convex.
 *
 * Itu inti peringatan runbook: codegen Convex menghubungi jaringan dan butuh
 * access token, dan menyimpan token pribadi di dashboard pihak ketiga memberi
 * akses ke seluruh deployment. Selama perintah build tidak menyentuh codegen,
 * bentuk perintahnya sendiri (dengan atau tanpa `tsc -b`) tidak melanggar.
 */
export function periksaBuildCommand(bukti) {
  const buildVercel = String(bukti?.buildCommand ?? "");
  const buildPaket = String(bukti?.buildScript ?? "");
  const installVercel = String(bukti?.installCommand ?? "");
  const baris = [];

  if (!buildVercel) {
    baris.push(hasil("build.command", "Build Command terbaca", UNVERIFIABLE, "pengaturan build tidak bisa dibaca"));
  } else {
    const butuhToken = /convex\s+(codegen|dev)/i.test(buildVercel) || /convex\s+(codegen|dev)/i.test(buildPaket);
    baris.push(
      butuhToken
        ? hasil(
            "build.command",
            "Build Command tidak butuh token Convex",
            FAIL,
            "perintah build menjalankan codegen atau dev Convex",
          )
        : hasil(
            "build.command",
            "Build Command tidak butuh token Convex",
            PASS,
            /vite build/.test(buildVercel) || /vite build/.test(buildPaket)
              ? "menghasilkan bundel lewat `vite build`; codegen Convex tidak dijalankan saat build"
              : "tidak menyentuh codegen Convex",
          ),
    );
  }

  if (installVercel) {
    baris.push(
      /frozen-lockfile/.test(installVercel)
        ? hasil("build.install", "Install Command deterministik", PASS, "memakai --frozen-lockfile")
        : hasil(
            "build.install",
            "Install Command deterministik",
            UNVERIFIABLE,
            "tidak memakai --frozen-lockfile sehingga pemasangan tidak reprodusibel",
          ),
    );
  }
  return baris;
}

/** Semua rujukan aset di dalam sepotong HTML atau JavaScript. */
export function ekstrakAset(teks) {
  return [
    ...new Set([...String(teks ?? "").matchAll(/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g)].map((m) => m[0])),
  ].sort();
}

/**
 * Drift deployment: apakah produksi benar-benar menjalankan build dari HEAD.
 *
 * "Deployment sukses" bukan bukti kode yang dikomit sudah tayang. Tiga hal
 * diperiksa, dan ketiganya tidak bisa dibuktikan oleh status deployment:
 *
 *  1. Chunk entri yang dirujuk halaman produksi harus sama dengan chunk entri
 *     hasil build HEAD. Nama berkas Vite membawa hash isi, jadi nama yang
 *     berbeda berarti isinya berbeda.
 *  2. Manifest yang dirujuk halaman produksi sendiri tidak boleh memuat aset
 *     yang tidak diproduksi build HEAD - itu tanda halaman dan berkasnya dari
 *     dua build yang berbeda.
 *  3. Setiap aset hasil build HEAD harus benar-benar dilayani sebagai aset,
 *     bukan jatuh ke fallback SPA. Ini menutup jebakan yang sudah nyata
 *     terjadi: permintaan atas aset yang tidak ada dijawab HTTP 200 berisi
 *     `index.html`, sehingga pemeriksaan berbasis status saja akan melaporkan
 *     "ada" untuk berkas yang sebenarnya hilang.
 */
export function periksaDriftDeployment(bukti) {
  if (!bukti || !Array.isArray(bukti.entriProduksi) || !Array.isArray(bukti.entriLokal)) {
    return [
      hasil(
        "drift.entri",
        "Deployment produksi sepadan dengan build HEAD",
        UNVERIFIABLE,
        "daftar aset produksi atau hasil build HEAD tidak bisa dibaca",
      ),
    ];
  }

  const baris = [];
  const entriProduksi = [...bukti.entriProduksi].sort();
  const entriLokal = [...bukti.entriLokal].sort();
  const sebangun =
    entriProduksi.length === entriLokal.length && entriProduksi.every((nilai, i) => nilai === entriLokal[i]);

  baris.push(
    sebangun
      ? hasil(
          "drift.entri",
          "Deployment produksi sepadan dengan build HEAD",
          PASS,
          `${entriLokal.length} chunk entri produksi identik dengan hasil build HEAD`,
        )
      : hasil(
          "drift.entri",
          "Deployment produksi sepadan dengan build HEAD",
          FAIL,
          `produksi memakai ${entriProduksi.join(", ")} sedangkan build HEAD menghasilkan ${entriLokal.join(", ")}`,
        ),
  );

  if (Array.isArray(bukti.manifestProduksi)) {
    const asetLokal = new Set(bukti.asetLokal ?? []);
    const berlebih = bukti.manifestProduksi.filter((aset) => !asetLokal.has(aset));
    baris.push(
      berlebih.length === 0
        ? hasil(
            "drift.manifest",
            "Manifest produksi tidak merujuk aset di luar build HEAD",
            PASS,
            `${bukti.manifestProduksi.length} aset dirujuk halaman produksi, semuanya ada di build HEAD`,
          )
        : hasil(
            "drift.manifest",
            "Manifest produksi tidak merujuk aset di luar build HEAD",
            FAIL,
            `${berlebih.length} aset dirujuk halaman produksi tetapi tidak diproduksi build HEAD`,
          ),
    );
  }

  if (Array.isArray(bukti.asetTidakAdaDiProduksi)) {
    const hilang = bukti.asetTidakAdaDiProduksi;
    baris.push(
      hilang.length === 0
        ? hasil(
            "drift.kelengkapan",
            "Seluruh aset build HEAD dilayani di produksi",
            PASS,
            `${bukti.asetDiperiksa ?? 0} aset diperiksa satu per satu`,
          )
        : hasil(
            "drift.kelengkapan",
            "Seluruh aset build HEAD dilayani di produksi",
            FAIL,
            `${hilang.length} dari ${bukti.asetDiperiksa ?? 0} aset build HEAD tidak dilayani sebagai aset (jatuh ke fallback SPA)`,
          ),
    );
  } else {
    baris.push(
      hasil(
        "drift.kelengkapan",
        "Seluruh aset build HEAD dilayani di produksi",
        UNVERIFIABLE,
        "pemeriksaan per-aset tidak dijalankan",
      ),
    );
  }
  return baris;
}

/**
 * Kesehatan fungsi relay di produksi.
 *
 * Gate drift saja tidak cukup: seluruh aset bisa tampak segar sementara
 * fungsinya sendiri mati. Kontrak yang stabil untuk membedakan hidup dan mati:
 * GET ke `/api/admin-context` dijawab 405 oleh fungsi yang hidup. Status 500
 * berarti modul gagal dimuat atau handler melempar pada semua metode; 200
 * berisi `index.html` berarti fungsinya tidak ada dan permintaan tertelan
 * fallback SPA - jebakan yang sama seperti pada pemeriksaan aset.
 */
export function periksaKesehatanRelay(bukti) {
  const label = "Fungsi relay hidup di produksi";
  const status = bukti?.status;
  const tipe = String(bukti?.tipe ?? "");

  if (typeof status !== "number") {
    return [hasil("relay.hidup", label, UNVERIFIABLE, "GET /api/admin-context tidak bisa dihubungi")];
  }
  if (status === 405) {
    return [hasil("relay.hidup", label, PASS, `GET /api/admin-context dijawab 405 (${tipe || "tanpa tipe"})`)];
  }
  if (status === 200 && /text\/html/i.test(tipe)) {
    return [
      hasil(
        "relay.hidup",
        label,
        FAIL,
        "GET /api/admin-context dijawab 200 index.html (fungsi tidak ada; tertelan fallback SPA)",
      ),
    ];
  }
  return [hasil("relay.hidup", label, FAIL, `GET /api/admin-context dijawab ${status} ${tipe}`.trim())];
}

/**
 * Bukti bahwa rahasia tidak ikut ke bundel peramban.
 *
 * Yang bisa dibuktikan memang bukan "nilai rahasia tidak ada": nilainya berada
 * di server dan tidak pernah sampai ke mesin ini. Yang dibuktikan:
 *  - tidak ada pola `NAMA= nilai` di berkas bundel,
 *  - kode sumber tidak membaca kedua rahasia lewat import.meta.env,
 *  - modul penentu kunci hash IP tidak diimpor berkas tampilan (.tsx).
 */
export function periksaBundel(bukti) {
  const baris = [];
  const berkas = Array.isArray(bukti?.berkasBundel) ? bukti.berkasBundel : null;
  if (!berkas) {
    baris.push(
      hasil(
        "bundel.pindai",
        "Pindai bundel klien",
        UNVERIFIABLE,
        "direktori keluaran build tidak ditemukan; jalankan `vite build` lebih dulu",
      ),
    );
  } else {
    const polaNilai = /(ADMIN_CONTEXT_RELAY_SECRET|SERVER_IP_HASH_SECRET)["'`\s]*[:=]\s*["'`]([^"'`]{4,})["'`]/g;
    let adaPolaNilai = false;
    let adaNamaTerlarang = false;
    for (const satu of berkas) {
      const isi = String(satu?.isi ?? "");
      polaNilai.lastIndex = 0;
      if (polaNilai.test(isi)) adaPolaNilai = true;
      if (TERLARANG.some((nama) => isi.includes(nama))) adaNamaTerlarang = true;
    }
    baris.push(
      adaPolaNilai
        ? hasil(
            "bundel.nilai_rahasia",
            "Tidak ada pola nilai rahasia di bundel klien",
            FAIL,
            "ada pola `NAMA= nilai` di berkas bundel",
          )
        : hasil(
            "bundel.nilai_rahasia",
            "Tidak ada pola nilai rahasia di bundel klien",
            PASS,
            `memindai ${berkas.length} berkas bundel`,
          ),
    );
    baris.push(
      adaNamaTerlarang
        ? hasil(
            "bundel.nama_terlarang",
            "Tidak ada nama rahasia berawalan VITE_ di bundel",
            FAIL,
            "nama rahasia berawalan VITE_ muncul di bundel",
          )
        : hasil(
            "bundel.nama_terlarang",
            "Tidak ada nama rahasia berawalan VITE_ di bundel",
            PASS,
            "tidak ada nama terlarang",
          ),
    );
  }

  const bacaEnv = Array.isArray(bukti?.bacaImportMeta) ? bukti.bacaImportMeta : null;
  baris.push(
    bacaEnv === null
      ? hasil(
          "bundel.import_meta",
          "Rahasia tidak dibaca lewat import.meta.env",
          UNVERIFIABLE,
          "kode sumber tidak bisa dipindai",
        )
      : bacaEnv.length === 0
        ? hasil(
            "bundel.import_meta",
            "Rahasia tidak dibaca lewat import.meta.env",
            PASS,
            "tidak ada pembacaan rahasia di kode klien",
          )
        : hasil(
            "bundel.import_meta",
            "Rahasia tidak dibaca lewat import.meta.env",
            FAIL,
            `ada ${bacaEnv.length} berkas yang membacanya`,
          ),
  );

  const impor = Array.isArray(bukti?.imporIpHAshDariKomponen) ? bukti.imporIpHAshDariKomponen : null;
  baris.push(
    impor === null
      ? hasil(
          "bundel.modul_server",
          "Modul kunci hash IP tetap khusus server",
          UNVERIFIABLE,
          "kode sumber tidak bisa dipindai",
        )
      : impor.length === 0
        ? hasil(
            "bundel.modul_server",
            "Modul kunci hash IP tetap khusus server",
            PASS,
            "tidak ada berkas tampilan yang mengimpor modul kunci",
          )
        : hasil(
            "bundel.modul_server",
            "Modul kunci hash IP tetap khusus server",
            FAIL,
            `ada ${impor.length} berkas tampilan yang mengimpornya`,
          ),
  );
  return baris;
}

/* ------------------------------------------------------------------ */
/* Agregasi kode keluar                                               */
/* ------------------------------------------------------------------ */

export function hitungKodeKeluar(baris) {
  const gagal = baris.filter((b) => b.status === FAIL);
  if (gagal.length > 0) return 1;
  if (baris.some((b) => b.status === UNVERIFIABLE)) return 2;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Jalur self-test: setiap kondisi gagal wajib menghasilkan BLOCKED    */
/* ------------------------------------------------------------------ */

function fixtureDasar() {
  return {
    auth: { whoami: "contoh-operator", gagal: false },
    proyek: {
      tertaut: true,
      projectName: "sumenepbukukerja",
      projectId: "prj_contoh",
      orgId: "team_contoh",
      diharapkan: "sumenepbukukerja",
    },
    vercelEnvs: WAJIB_VERCEL.map((key) => ({
      key,
      type: RAHASIA.includes(key) ? "sensitive" : "encrypted",
      target: ["production"],
    })),
    convexNames: [...WAJIB_CONVEX],
    ketersediaan: {
      ADMIN_CONTEXT_RELAY_SECRET: { vercel: "configured", convex: "configured" },
      SERVER_IP_HASH_SECRET: { vercel: "configured", convex: "configured" },
    },
    kesamaan: {
      ADMIN_CONTEXT_RELAY_SECRET: "match",
      SERVER_IP_HASH_SECRET: "match",
    },
    keunikan: { convex: "beda", vercel: "beda" },
    siteUrlVercel: "https://focused-lemur-389.convex.site",
    siteUrlConvex: "https://focused-lemur-389.convex.site",
    originsVercel: "https://sumenepbukukerja.com,https://www.sumenepbukukerja.com",
    originsConvex: "https://sumenepbukukerja.com,https://www.sumenepbukukerja.com",
    hostProduksi: ["sumenepbukukerja.com", "www.sumenepbukukerja.com"],
    vercelJson: { rewrites: [{ source: "/((?!api/).*)", destination: "/index.html" }] },
    adaFungsiRelay: true,
    drift: {
      entriProduksi: ["assets/index-C8fdGI1g.js", "assets/react-vendor-De5cX8on.js"],
      entriLokal: ["assets/react-vendor-De5cX8on.js", "assets/index-C8fdGI1g.js"],
      manifestProduksi: ["assets/Landing-D0n4iG7t.js", "assets/index-C8fdGI1g.js"],
      asetLokal: ["assets/index-C8fdGI1g.js", "assets/Landing-D0n4iG7t.js", "assets/react-vendor-De5cX8on.js"],
      asetTidakAdaDiProduksi: [],
      asetDiperiksa: 3,
    },
    buildCommand: "`npm run build` or `vite build`",
    buildScript: "tsc -b && vite build",
    installCommand: "bun install --frozen-lockfile",
    relayProduksi: { status: 405, tipe: "application/json; charset=utf-8" },
    berkasBundel: [{ nama: "index.js", isi: "const a=1; // tanpa rahasia" }],
    bacaImportMeta: [],
    imporIpHAshDariKomponen: [],
  };
}

/** Jalankan seluruh pemeriksaan atas satu fixture. */
export function jalankanSemua(f) {
  return [
    periksaAuthVercel(f.auth),
    periksaIdentitasProyek(f.proyek),
    ...periksaEnvVercel({ envs: f.vercelEnvs }),
    ...periksaEnvConvex({ names: f.convexNames }),
    ...periksaKonsistensiRahasia({
      ketersediaan: f.ketersediaan,
      kesamaan: f.kesamaan,
      keunikan: f.keunikan,
    }),
    ...periksaConvexSiteUrl({ vercel: f.siteUrlVercel, convex: f.siteUrlConvex }),
    ...periksaOrigins({ vercel: f.originsVercel, convex: f.originsConvex, hostProduksi: f.hostProduksi }),
    ...periksaRewrite({ vercelJson: f.vercelJson, adaFungsiRelay: f.adaFungsiRelay }),
    ...periksaDriftDeployment(f.drift),
    ...periksaKesehatanRelay(f.relayProduksi),
    ...periksaBuildCommand({
      buildCommand: f.buildCommand,
      buildScript: f.buildScript,
      installCommand: f.installCommand,
    }),
    ...periksaBundel({
      berkasBundel: f.berkasBundel,
      bacaImportMeta: f.bacaImportMeta,
      imporIpHAshDariKomponen: f.imporIpHAshDariKomponen,
    }),
  ];
}

const SKENARIO_NEGATIF = [
  {
    nama: "rahasia relay hilang",
    ubah: (f) => {
      f.vercelEnvs = f.vercelEnvs.filter((e) => e.key !== "ADMIN_CONTEXT_RELAY_SECRET");
      f.ketersediaan.ADMIN_CONTEXT_RELAY_SECRET.vercel = "missing";
      f.kesamaan.ADMIN_CONTEXT_RELAY_SECRET = "unverifiable";
      f.keunikan.vercel = "unverifiable";
    },
    harusGagal: "vercel.env.ADMIN_CONTEXT_RELAY_SECRET",
  },
  {
    nama: "rahasia hash IP hilang",
    ubah: (f) => {
      f.convexNames = f.convexNames.filter((n) => n !== "SERVER_IP_HASH_SECRET");
      f.ketersediaan.SERVER_IP_HASH_SECRET.convex = "missing";
      f.kesamaan.SERVER_IP_HASH_SECRET = "unverifiable";
      f.keunikan.convex = "unverifiable";
    },
    harusGagal: "convex.env.SERVER_IP_HASH_SECRET",
  },
  {
    nama: "rahasia kosong",
    ubah: (f) => {
      f.ketersediaan.ADMIN_CONTEXT_RELAY_SECRET.convex = "empty";
      f.kesamaan.ADMIN_CONTEXT_RELAY_SECRET = "unverifiable";
      f.keunikan.convex = "unverifiable";
    },
    harusGagal: "rahasia.tersedia.ADMIN_CONTEXT_RELAY_SECRET",
  },
  {
    nama: "dua rahasia identik",
    ubah: (f) => {
      f.keunikan.convex = "sama";
      f.keunikan.vercel = "sama";
    },
    harusGagal: "rahasia.berbeda.Convex",
  },
  {
    nama: "rahasia berbeda antar platform",
    ubah: (f) => {
      f.kesamaan.ADMIN_CONTEXT_RELAY_SECRET = "mismatch";
    },
    harusGagal: "rahasia.cocok.ADMIN_CONTEXT_RELAY_SECRET",
  },
  {
    nama: "URL Convex tidak valid",
    ubah: (f) => {
      f.siteUrlVercel = "https://focused-lemur-389.convex.cloud";
      f.siteUrlConvex = "https://focused-lemur-389.convex.cloud";
    },
    harusGagal: "url.convex_site",
  },
  {
    nama: "origin produksi salah",
    ubah: (f) => {
      f.originsVercel = "https://contoh-lain.example";
      f.originsConvex = "https://contoh-lain.example";
      f.hostProduksi = ["sumenepbukukerja.com"];
    },
    harusGagal: "origin.domain_produksi",
  },
  {
    nama: "origin wildcard",
    ubah: (f) => {
      f.originsVercel = "*";
      f.originsConvex = "*";
    },
    harusGagal: "origin.wildcard",
  },
  {
    nama: "SITE_URL Convex hilang",
    ubah: (f) => {
      f.siteUrlVercel = undefined;
      f.siteUrlConvex = undefined;
    },
    harusGagal: "url.convex_site",
  },
  {
    nama: "rewrite /api salah",
    ubah: (f) => {
      f.vercelJson = { rewrites: [{ source: "/(.*)", destination: "/index.html" }] };
    },
    harusGagal: "rewrite.api",
  },
  {
    nama: "Vercel CLI tidak terautentikasi",
    ubah: (f) => {
      f.auth = { whoami: "", gagal: true };
    },
    harusGagal: "vercel.auth",
  },
  {
    nama: "rahasia bocor ke bundel klien",
    ubah: (f) => {
      f.berkasBundel = [
        { nama: "index.js", isi: 'const x = ADMIN_CONTEXT_RELAY_SECRET= "nilai-yang-seharusnya-tidak-di-sini";' },
      ];
    },
    harusGagal: "bundel.nilai_rahasia",
  },
  {
    nama: "rahasia dibaca lewat import.meta.env",
    ubah: (f) => {
      f.bacaImportMeta = ["src/lib/contoh.ts"];
    },
    harusGagal: "bundel.import_meta",
  },
  {
    nama: "modul kunci hash IP bocor ke berkas tampilan",
    ubah: (f) => {
      f.imporIpHAshDariKomponen = ["src/components/contoh.tsx"];
    },
    harusGagal: "bundel.modul_server",
  },
  {
    nama: "nilai rahasia ditahan platform (tipe sensitif)",
    ubah: (f) => {
      for (const nama of RAHASIA) {
        f.ketersediaan[nama].vercel = "withheld";
        f.kesamaan[nama] = "unverifiable";
      }
      f.keunikan.vercel = "unverifiable";
    },
    harusGagal: "rahasia.tersedia.ADMIN_CONTEXT_RELAY_SECRET",
    status: UNVERIFIABLE,
  },
  {
    nama: "daftar environment Convex tidak terbaca",
    ubah: (f) => {
      // Persis kejadian nyata: tautan lokal Convex hilang, `convex env list`
      // gagal, lalu seluruh sisi Convex jadi tidak terbaca. Gate harus bilang
      // tidak bisa diverifikasi, BUKAN menganggap variabelnya hilang begitu
      // saja - dan jelas bukan lulus.
      f.convexNames = null;
      f.ketersediaan.ADMIN_CONTEXT_RELAY_SECRET.convex = "unreadable";
      f.ketersediaan.SERVER_IP_HASH_SECRET.convex = "unreadable";
      f.kesamaan.ADMIN_CONTEXT_RELAY_SECRET = "unverifiable";
      f.kesamaan.SERVER_IP_HASH_SECRET = "unverifiable";
      f.keunikan.convex = "unverifiable";
      f.siteUrlConvex = undefined;
      f.originsConvex = undefined;
    },
    harusGagal: "convex.env.daftar",
    status: UNVERIFIABLE,
  },
  {
    nama: "relay produksi mati (500 saat modul gagal dimuat)",
    ubah: (f) => {
      f.relayProduksi = { status: 500, tipe: "text/plain; charset=utf-8" };
    },
    harusGagal: "relay.hidup",
  },
  {
    nama: "relay produksi tertelan fallback SPA (200 HTML)",
    ubah: (f) => {
      f.relayProduksi = { status: 200, tipe: "text/html; charset=utf-8" };
    },
    harusGagal: "relay.hidup",
  },
  {
    nama: "deployment produksi tertinggal dari HEAD (chunk entri berbeda)",
    ubah: (f) => {
      f.drift.entriProduksi = ["assets/index-C5-V2U-i.js", "assets/react-vendor-De5cX8on.js"];
    },
    harusGagal: "drift.entri",
  },
  {
    nama: "halaman produksi merujuk aset di luar build HEAD",
    ubah: (f) => {
      f.drift.manifestProduksi = [...f.drift.manifestProduksi, "assets/Admin-Ds06zJ0M.js"];
    },
    harusGagal: "drift.manifest",
  },
  {
    nama: "aset build HEAD tidak dilayani di produksi (jatuh ke fallback SPA)",
    ubah: (f) => {
      f.drift.asetTidakAdaDiProduksi = ["assets/index-C8fdGI1g.js"];
    },
    harusGagal: "drift.kelengkapan",
  },
  {
    nama: "proyek Vercel belum ditautkan",
    ubah: (f) => {
      f.proyek = { tertaut: false };
    },
    harusGagal: "vercel.proyek",
    // Belum ditautkan bukan kegagalan yang bisa dipastikan salah atau benar:
    // identitasnya memang tidak bisa dibaca. Itu BLOCKED lewat kode 2.
    status: UNVERIFIABLE,
  },
];

function jalankanSelfTest() {
  console.log("SELF-TEST: setiap kondisi gagal wajib menghasilkan BLOCKED");
  let menyimpang = 0;

  {
    const baris = jalankanSemua(fixtureDasar());
    const kode = hitungKodeKeluar(baris);
    const belum = baris.filter((b) => b.status === UNVERIFIABLE).map((b) => b.id);
    const ok = kode === 0;
    console.log(
      `${ok ? "OK  " : "GAGAL"} kontrol-positif (fixture lengkap) -> kode ${kode}${belum.length ? ` belum=${belum.join(",")}` : ""}`,
    );
    if (!ok) menyimpang += 1;
  }

  for (const skenario of SKENARIO_NEGATIF) {
    const f = fixtureDasar();
    skenario.ubah(f);
    const baris = jalankanSemua(f);
    const kode = hitungKodeKeluar(baris);
    const pemeriksaan = baris.find((b) => b.id === skenario.harusGagal);
    // Dua bentuk "tidak lulus" yang sah: pemeriksaan gagal (kode 1) dan
    // pemeriksaan tidak bisa diselesaikan (kode 2). Keduanya BLOCKED, dan
    // keduanya bukan hijau. Yang dilarang hanya kode 0.
    const statusDiharapkan = skenario.status ?? FAIL;
    const kodeDiharapkan = statusDiharapkan === FAIL ? 1 : 2;
    const benar = kode === kodeDiharapkan && pemeriksaan?.status === statusDiharapkan;
    console.log(
      `${benar ? "OK  " : "GAGAL"} ${skenario.nama} -> kode ${kode} (diharapkan ${kodeDiharapkan}), ${skenario.harusGagal}=${pemeriksaan?.status ?? "tidak-ada"}`,
    );
    if (!benar) menyimpang += 1;
  }

  console.log(
    menyimpang === 0
      ? `RINGKASAN: seluruh ${SKENARIO_NEGATIF.length + 1} skenario sesuai harapan`
      : `RINGKASAN: ${menyimpang} skenario TIDAK sesuai harapan`,
  );
  return menyimpang === 0 ? 0 : 1;
}

/* ------------------------------------------------------------------ */
/* Mode probe: dijalankan DI DALAM `vercel env run`                    */
/* ------------------------------------------------------------------ */

/**
 * Mode ini adalah satu-satunya tempat nilai Vercel dan nilai Convex bertemu.
 * Semua pembandingan terjadi di sini, di memori proses ini, lalu yang keluar
 * hanya verdict. Nilai rahasia tidak pernah ditulis, tidak pernah dicetak, dan
 * tidak pernah melewati batas proses.
 */
function modeProbe(argv) {
  const akar = argv.repoRoot ?? process.cwd();
  const convexBin = process.platform === "win32" ? "node_modules/.bin/convex.exe" : "node_modules/.bin/convex";
  const ambilConvex = (nama) => {
    const proses = spawnSync(convexBin, ["env", "get", nama, "--prod"], {
      cwd: akar,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      env: envConvex(argv.convexDeployment),
    });
    if (proses.status !== 0) return undefined;
    return String(proses.stdout).replace(/\r?\n$/, "");
  };

  for (const nama of [...WAJIB_VERCEL, ...TERLARANG]) {
    const nilai = process.env[nama];
    process.stdout.write(`BACA\t${nama}\t${statusNilai(nilai)}\n`);
    if (!BOLEH_DICETAK.includes(nama)) continue;
    if (statusNilai(nilai) === "configured") {
      process.stdout.write(`NILAI\t${nama}\t${String(nilai)}\n`);
    }
  }

  for (const nama of RAHASIA) {
    const sisiVercel = process.env[nama];
    const sisiConvex = ambilConvex(nama);
    process.stdout.write(`BACA_CONVEX\t${nama}\t${statusNilai(sisiConvex)}\n`);
    process.stdout.write(`SAMA\t${nama}\t${verdictKesamaan(sisiVercel, sisiConvex)}\n`);
  }

  const relayVercel = process.env[RAHASIA[0]];
  const hashVercel = process.env[RAHASIA[1]];
  process.stdout.write(
    `UNIK\tvercel\t${
      statusNilai(relayVercel) === "configured" && statusNilai(hashVercel) === "configured"
        ? samaPersis(relayVercel, hashVercel)
          ? "sama"
          : "beda"
        : "unverifiable"
    }\n`,
  );

  const siteConvex = ambilConvex("SITE_URL");
  const originsConvex = ambilConvex("ADMIN_CONTEXT_ALLOWED_ORIGINS");
  const relayConvex = ambilConvex(RAHASIA[0]);
  const hashConvex = ambilConvex(RAHASIA[1]);
  process.stdout.write(
    `UNIK\tconvex\t${
      statusNilai(relayConvex) === "configured" && statusNilai(hashConvex) === "configured"
        ? samaPersis(relayConvex, hashConvex)
          ? "sama"
          : "beda"
        : "unverifiable"
    }\n`,
  );
  process.stdout.write(`CONVEX\tsite_url\t${siteConvex ?? ""}\n`);
  process.stdout.write(`CONVEX\torigins\t${originsConvex ?? ""}\n`);
  return 0;
}

/* ------------------------------------------------------------------ */
/* Pengumpulan bukti nyata                                            */
/* ------------------------------------------------------------------ */

const ROOT = process.cwd();

function jalankan(command, args, options = {}) {
  const proses = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    windowsHide: true,
    shell: options.shell === true,
    maxBuffer: 32 * 1024 * 1024,
    env: options.env ?? process.env,
  });
  return {
    kode: proses.status,
    stdout: proses.stdout ?? "",
    stderr: proses.stderr ?? "",
    galat: proses.error ?? null,
  };
}

/**
 * Resolusi CLI Vercel yang bisa dijalankan langsung oleh proses anak.
 *
 * Di Windows, pemasangan global npm hanya menyediakan berkas shim tanpa
 * ekstensi (`vercel`) plus dua pembungkus `vercel.cmd` dan `vercel.ps1`.
 * Berkas tanpa ekstensi itu skrip shell, jadi `spawnSync` tanpa shell tidak
 * bisa menjalankannya, sementara berkas `.cmd` justru ditolak Node saat
 * dijalankan tanpa shell. Jalan yang paling tidak bergantung tebakan: cari
 * berkas JS yang memang dipanggil shim itu, lalu jalankan dengan node.
 */
let cacheVercel = null;
function resolusiVercel(eksplisit) {
  if (cacheVercel) return cacheVercel;

  const kandidat = [];
  if (eksplisit) kandidat.push(eksplisit);
  if (process.env.VERCEL_CLI_JS) kandidat.push(process.env.VERCEL_CLI_JS);
  const dariNpm = (basis) => path.join(basis, "npm", "node_modules", "vercel", "dist", "vc.js");
  if (process.env.APPDATA) kandidat.push(dariNpm(process.env.APPDATA));
  if (process.env.LOCALAPPDATA) kandidat.push(dariNpm(process.env.LOCALAPPDATA));
  if (process.env.HOME) {
    kandidat.push(dariNpm(path.join(process.env.HOME, "AppData", "Roaming")));
    kandidat.push(path.join(process.env.HOME, ".npm-global", "lib", "node_modules", "vercel", "dist", "vc.js"));
  }
  kandidat.push(
    "/usr/local/lib/node_modules/vercel/dist/vc.js",
    "/usr/lib/node_modules/vercel/dist/vc.js",
    "/opt/homebrew/lib/node_modules/vercel/dist/vc.js",
  );

  for (const satu of kandidat) {
    if (satu && existsSync(satu)) {
      cacheVercel = { command: process.execPath, prefix: [satu], asal: `berkas CLI (${path.basename(path.dirname(path.dirname(satu)))}/dist/vc.js)` };
      return cacheVercel;
    }
  }

  cacheVercel = {
    command: process.platform === "win32" ? "vercel.cmd" : "vercel",
    prefix: [],
    asal: "pembungkus shell",
    shell: true,
  };
  return cacheVercel;
}

function jalankanVercel(args, options = {}) {
  const resolusi = resolusiVercel(options.vercelJs);
  return jalankan(resolusi.command, [...resolusi.prefix, ...args], {
    ...options,
    shell: resolusi.shell === true,
  });
}

function bacaTeks(berkas) {
  try {
    return readFileSync(berkas, "utf8");
  } catch {
    return "";
  }
}

function cariTautanVercel(eksplisit) {
  if (eksplisit) {
    const dir = path.isAbsolute(eksplisit) ? eksplisit : path.join(ROOT, eksplisit);
    return existsSync(path.join(dir, ".vercel", "project.json")) ? dir : null;
  }
  const kandidat = [path.join(ROOT, ".vercel"), path.join(ROOT, "tmp", "vercel-scratch", ".vercel")];
  for (const dir of kandidat) {
    if (existsSync(path.join(dir, "project.json"))) return path.dirname(dir);
  }
  return null;
}

function daftarBerkasRekursif(dir, ekstensi) {
  const keluaran = [];
  const kunjungi = (sekarang) => {
    let isi;
    try {
      isi = readdirSync(sekarang, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entri of isi) {
      const lengkap = path.join(sekarang, entri.name);
      if (entri.isDirectory()) kunjungi(lengkap);
      else if (ekstensi.some((ek) => entri.name.endsWith(ek))) keluaran.push(lengkap);
    }
  };
  kunjungi(dir);
  return keluaran;
}

function kumpulkanBundel(dirBundel, batasBerkas, batasByte) {
  if (!existsSync(dirBundel)) return null;
  const berkas = daftarBerkasRekursif(dirBundel, [".js", ".mjs", ".css", ".html"]);
  const keluaran = [];
  for (const satu of berkas.slice(0, batasBerkas)) {
    try {
      if (statSync(satu).size > batasByte) continue;
    } catch {
      continue;
    }
    keluaran.push({ nama: path.relative(dirBundel, satu), isi: bacaTeks(satu) });
  }
  return keluaran;
}

/**
 * Environment Convex Production: NAMA saja.
 *
 * Tidak bergantung pada Vercel sama sekali, jadi tetap dijalankan walau proyek
 * Vercel belum ditautkan. Sengaja memakai `--names-only` supaya tidak ada nilai
 * yang pernah melewati pipa ini.
 */
function kumpulkanBuktiConvex(deployment) {
  const convexBin = process.platform === "win32" ? "node_modules/.bin/convex.exe" : "node_modules/.bin/convex";
  const daftar = jalankan(convexBin, ["env", "list", "--prod", "--names-only"], {
    env: envConvex(deployment),
  });
  const names =
    daftar.kode === 0
      ? String(daftar.stdout)
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
  return periksaEnvConvex({ names });
}

/** Domain kustom lebih dulu; alias bawaan Vercel hanya cadangan. */
function pilihBasisProduksi(hosts) {
  if (!Array.isArray(hosts) || hosts.length === 0) return null;
  const kustom = hosts.filter((host) => !String(host).endsWith(".vercel.app"));
  const pilih = (kustom.length > 0 ? kustom : hosts)[0];
  return pilih ? `https://${pilih}` : null;
}

async function ambilTeks(url) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    return {
      status: res.status,
      teks: await res.text(),
      tipe: res.headers.get("content-type") ?? "",
    };
  } catch {
    return null;
  }
}

/** Ambil banyak URL dengan sedikit paralel. Urutan hasil tidak dipakai. */
async function ambilBanyak(urls, sekaligus = 6) {
  const keluaran = [];
  for (let i = 0; i < urls.length; i += sekaligus) {
    const bagian = urls.slice(i, i + sekaligus);
    keluaran.push(...(await Promise.all(bagian.map((url) => ambilTeks(url)))));
  }
  return keluaran;
}

/**
 * Drift deployment. Seluruh permintaan di sini hanya GET atas aset publik yang
 * memang sudah dikirim ke setiap pengunjung; tidak ada POST, tidak ada mutasi.
 */
async function kumpulkanDriftDeployment(basis) {
  const dirAset = path.join(ROOT, "dist", "assets");
  const berkasIndeks = path.join(ROOT, "dist", "index.html");
  if (!existsSync(berkasIndeks) || !existsSync(dirAset)) return periksaDriftDeployment(null);

  const asetLokal = daftarBerkasRekursif(dirAset, [".js", ".css"])
    .map((berkas) => `assets/${path.basename(berkas)}`)
    .sort();
  const entriLokal = ekstrakAset(bacaTeks(berkasIndeks)).filter((aset) => aset.endsWith(".js"));

  const halaman = await ambilTeks(`${basis}/`);
  if (!halaman || !halaman.teks) return periksaDriftDeployment(null);
  const entriProduksi = ekstrakAset(halaman.teks).filter((aset) => aset.endsWith(".js"));

  // Manifest: baca setiap chunk entri produksi, lalu kumpulkan semua aset yang
  // dirujuknya. Jawaban HTML berarti chunk-nya tidak ada (fallback SPA), jadi
  // isinya tidak boleh diperlakukan sebagai manifest.
  const isiEntri = await ambilBanyak(entriProduksi.map((aset) => `${basis}/${aset}`));
  const manifestProduksi = [
    ...new Set(
      isiEntri
        .filter((res) => res && !/text\/html/i.test(res.tipe))
        .flatMap((res) => ekstrakAset(res.teks)),
    ),
  ].sort();

  // Kelengkapan: setiap aset build HEAD harus benar-benar dilayani sebagai
  // aset. Jawaban HTML berarti berkasnya tidak ada di deployment - jebakan yang
  // membuat pemeriksaan berbasis status HTTP saja menyesatkan.
  const batas = 80;
  const diperiksa = asetLokal.slice(0, batas);
  const jawaban = await ambilBanyak(diperiksa.map((aset) => `${basis}/${aset}`));
  const asetTidakAdaDiProduksi = diperiksa.filter((_, i) => {
    const res = jawaban[i];
    return !res || /text\/html/i.test(res.tipe);
  });

  return periksaDriftDeployment({
    entriProduksi,
    entriLokal,
    manifestProduksi,
    asetLokal,
    asetTidakAdaDiProduksi,
    asetDiperiksa: diperiksa.length,
  });
}

/**
 * Kesehatan fungsi relay: satu GET, tanpa POST, tanpa menyentuh data.
 */
async function kumpulkanKesehatanRelay(basis) {
  const jawaban = await ambilTeks(`${basis}/api/admin-context`);
  return periksaKesehatanRelay(jawaban ? { status: jawaban.status, tipe: jawaban.tipe } : null);
}

/** Pemeriksaan yang tidak butuh jaringan sama sekali. */
function kumpulkanBuktiLokal(argv) {
  const baris = [];

  let vercelJson = null;
  try {
    vercelJson = JSON.parse(bacaTeks(path.join(ROOT, "vercel.json")));
  } catch {
    vercelJson = null;
  }
  baris.push(
    ...periksaRewrite({
      vercelJson,
      adaFungsiRelay: existsSync(path.join(ROOT, "api", "admin-context.ts")),
    }),
  );

  const berkasBundel = kumpulkanBundel(path.join(ROOT, argv.dist ?? "dist"), 400, 8 * 1024 * 1024);
  const sumber = daftarBerkasRekursif(path.join(ROOT, "src"), [".ts", ".tsx"]).filter(
    (berkas) => !berkas.endsWith(".test.ts") && !berkas.endsWith(".test.tsx"),
  );
  const bacaImportMeta = sumber.filter((berkas) => {
    const isi = bacaTeks(berkas);
    return RAHASIA.some((nama) => isi.includes(`import.meta.env.${nama}`) || isi.includes(`import.meta.env?.${nama}`));
  });
  const imporIpHAshDariKomponen = sumber
    .filter((berkas) => berkas.endsWith(".tsx"))
    .filter((berkas) => bacaTeks(berkas).includes("admin-ip-hash"));

  baris.push(
    ...periksaBundel({
      berkasBundel,
      bacaImportMeta: bacaImportMeta.map((berkas) => path.relative(ROOT, berkas)),
      imporIpHAshDariKomponen: imporIpHAshDariKomponen.map((berkas) => path.relative(ROOT, berkas)),
    }),
  );
  return baris;
}

async function kumpulkanBuktiJarak(argv) {
  const baris = [];
  const catatan = [];

  // --- Autentikasi Vercel ---
  const whoami = jalankanVercel(["whoami", "--no-color"], { vercelJs: argv.vercelJs });
  const identitas = String(whoami.stdout)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !/^Vercel CLI/i.test(s) && !/^[>✓]/u.test(s));
  const auth = { whoami: identitas[0] ?? "", gagal: whoami.kode !== 0 || identitas.length === 0 };
  baris.push(periksaAuthVercel(auth));

  // --- Tautan proyek ---
  const dirVercel = cariTautanVercel(argv.vercelCwd);
  let tautan = { tertaut: false };
  if (dirVercel) {
    try {
      const isi = JSON.parse(bacaTeks(path.join(dirVercel, ".vercel", "project.json")));
      tautan = {
        tertaut: true,
        projectName: isi.projectName,
        projectId: isi.projectId,
        orgId: isi.orgId,
        diharapkan: argv.project,
      };
    } catch {
      tautan = { tertaut: true, projectName: null, projectId: null };
    }
  }
  baris.push(periksaIdentitasProyek(tautan));

  if (!dirVercel) {
    catatan.push(
      "Proyek Vercel belum ditautkan. Tautkan dulu, misalnya `vercel link --project sumenepbukukerja --cwd tmp/vercel-scratch`, lalu hapus `.env.local` yang mungkin dibuat perintah itu.",
    );
    return { baris, catatan };
  }
  if (auth.gagal) {
    catatan.push("Autentikasi Vercel gagal, jadi pemeriksaan lingkungan jarak tidak dijalankan.");
    return { baris, catatan };
  }

  const argVercel = ["--cwd", dirVercel, "--no-color", "--non-interactive"];

  // --- Nama environment production (tidak pernah memuat nilai) ---
  const envList = jalankanVercel(["env", "ls", "production", "--format", "json", ...argVercel], {
    vercelJs: argv.vercelJs,
  });
  let envs = null;
  try {
    const parsed = JSON.parse(envList.stdout);
    envs = Array.isArray(parsed) ? parsed : parsed?.envs;
  } catch {
    envs = null;
  }
  if (envs === null) catatan.push("Daftar environment Vercel tidak bisa dibaca.");
  baris.push(...periksaEnvVercel({ envs }));

  const tipeVercel = new Map();
  for (const entri of Array.isArray(envs) ? envs : []) {
    if (entri?.key) tipeVercel.set(entri.key, String(entri.type ?? ""));
  }

  // --- Pengaturan build proyek ---
  const inspect = jalankanVercel(["project", "inspect", ...argVercel], { vercelJs: argv.vercelJs });
  // CLI Vercel menuliskan laporan `project inspect` ke stderr, bukan stdout.
  // Keduanya digabung, dan yang dicari hanya baris berlabel, jadi bannernya
  // tidak mengganggu.
  const teksInspect = `${inspect.stdout}\n${inspect.stderr}`;
  const ambilBaris = (label) => {
    const barisCocok = teksInspect.split(/\r?\n/).find((s) => s.trim().startsWith(label));
    return barisCocok ? barisCocok.replace(label, "").trim() : "";
  };
  let buildScript = "";
  try {
    buildScript = JSON.parse(bacaTeks(path.join(ROOT, "package.json")))?.scripts?.build ?? "";
  } catch {
    buildScript = "";
  }
  baris.push(
    ...periksaBuildCommand({
      buildCommand: ambilBaris("Build Command"),
      buildScript,
      installCommand: ambilBaris("Install Command"),
    }),
  );

  // --- Probe di dalam `vercel env run`: satu-satunya tempat kedua sisi bertemu ---
  const berkasVerifier = fileURLToPath(import.meta.url);
  const probe = jalankanVercel(
    [
      "env",
      "run",
      "-e",
      "production",
      "--cwd",
      dirVercel,
      "--no-color",
      "--",
      process.execPath,
      berkasVerifier,
      "--probe",
      "--repo-root",
      ROOT,
      "--convex-deployment",
      argv.convexDeployment ?? DEPLOYMENT_CONVEX_DEFAULT,
    ],
    { vercelJs: argv.vercelJs },
  );

  const bacaProbe = new Map();
  const bacaConvex = new Map();
  const nilaiTerbaca = new Map();
  const sama = new Map();
  const unik = new Map();
  let convexSite = null;
  let convexOrigins = null;
  for (const barisProbe of String(probe.stdout).split(/\r?\n/)) {
    const bagian = barisProbe.split("\t");
    if (bagian[0] === "BACA" && bagian.length >= 3) bacaProbe.set(bagian[1], bagian[2]);
    else if (bagian[0] === "BACA_CONVEX" && bagian.length >= 3) bacaConvex.set(bagian[1], bagian[2]);
    else if (bagian[0] === "NILAI" && bagian.length >= 3) nilaiTerbaca.set(bagian[1], bagian[2]);
    else if (bagian[0] === "SAMA" && bagian.length >= 3) sama.set(bagian[1], bagian[2]);
    else if (bagian[0] === "UNIK" && bagian.length >= 3) unik.set(bagian[1], bagian[2]);
    else if (bagian[0] === "CONVEX" && bagian.length >= 3) {
      if (bagian[1] === "site_url") convexSite = bagian[2];
      if (bagian[1] === "origins") convexOrigins = bagian[2];
    }
  }

  if (bacaProbe.size === 0) {
    catatan.push("Probe environment Vercel tidak menghasilkan keluaran, jadi status keterbacaan tidak bisa ditentukan.");
  }

  // Status per rahasia datang dari probe, yang memang satu-satunya pihak yang
  // bisa melihat kedua sisi. Tidak ada bagian di sini yang menebak.
  const ketersediaan = {};
  const kesamaan = {};
  for (const nama of RAHASIA) {
    let statusSisiVercel = bacaProbe.get(nama) ?? "unreadable";
    // Nilai yang ditahan platform BUKAN kegagalan konfigurasi. Vercel memang
    // tidak pernah mengembalikan nilai bertipe sensitif ke proses lokal, jadi
    // hasil kosong pada tipe itu tidak membuktikan apa pun. Hanya nilai kosong
    // pada tipe yang seharusnya terbaca (plain/encrypted) yang jadi kegagalan.
    if (statusSisiVercel === "empty" && tipeVercel.get(nama) === "sensitive") {
      statusSisiVercel = "withheld";
    }
    ketersediaan[nama] = {
      vercel: statusSisiVercel,
      convex: bacaConvex.get(nama) ?? "unreadable",
    };
    kesamaan[nama] = sama.get(nama) ?? "unverifiable";
  }

  baris.push(
    ...periksaKonsistensiRahasia({
      ketersediaan,
      kesamaan,
      keunikan: {
        vercel: unik.get("vercel") ?? "unverifiable",
        convex: unik.get("convex") ?? "unverifiable",
      },
    }),
  );

  // --- URL situs dan origin ---
  const siteVercel = nilaiTerbaca.get("CONVEX_SITE_URL");
  baris.push(
    ...periksaConvexSiteUrl({
      // SITE_URL Convex hanya dipakai untuk membandingkan host, dan host itu
      // sudah publik. Kalau nilainya tidak terbaca, pemeriksaannya jadi
      // UNVERIFIABLE, bukan lulus.
      vercel: siteVercel,
      convex: convexSite && convexSite.length > 0 ? convexSite : undefined,
    }),
  );

  let hostProduksi = [];
  const alias = jalankanVercel(["alias", "ls", "--format", "json", ...argVercel], {
    vercelJs: argv.vercelJs,
  });
  try {
    const parsed = JSON.parse(alias.stdout);
    const daftarAlias = Array.isArray(parsed) ? parsed : (parsed?.aliases ?? []);
    const awalan = `${argv.project.toLowerCase()}-`;
    hostProduksi = [
      ...new Set(
        daftarAlias
          .filter((entri) => String(entri?.url ?? "").toLowerCase().startsWith(awalan))
          .map((entri) => String(entri?.alias ?? "").toLowerCase())
          .filter((nilai) => nilai.includes(".")),
      ),
    ];
  } catch {
    hostProduksi = [];
  }

  baris.push(
    ...periksaOrigins({
      vercel: nilaiTerbaca.get("ADMIN_CONTEXT_ALLOWED_ORIGINS"),
      convex: convexOrigins && convexOrigins.length > 0 ? convexOrigins : undefined,
      hostProduksi,
    }),
  );

  // --- Drift deployment: apakah produksi menjalankan build dari HEAD ---
  const basisProduksi = pilihBasisProduksi(hostProduksi);
  if (!basisProduksi) {
    catatan.push(
      "Domain produksi tidak bisa ditentukan, jadi pemeriksaan drift deployment tidak dapat dijalankan.",
    );
    baris.push(...periksaDriftDeployment(null));
    baris.push(...periksaKesehatanRelay(null));
  } else {
    baris.push(...(await kumpulkanDriftDeployment(basisProduksi)));
    baris.push(...(await kumpulkanKesehatanRelay(basisProduksi)));
  }

  return { baris, catatan };
}

/* ------------------------------------------------------------------ */
/* Argumen dan titik masuk                                            */
/* ------------------------------------------------------------------ */

function bacaArgumen(argv) {
  const keluaran = {
    project: "sumenepbukukerja",
    vercelCwd: null,
    dist: "dist",
    selfTest: false,
    probe: false,
    repoRoot: null,
    vercelJs: null,
    convexDeployment: null,
    bantuan: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--self-test") keluaran.selfTest = true;
    else if (arg === "--probe" || arg === "--emit-readability") keluaran.probe = true;
    else if (arg === "--project") keluaran.project = argv[++i] ?? keluaran.project;
    else if (arg === "--vercel-cwd") keluaran.vercelCwd = argv[++i] ?? null;
    else if (arg === "--dist") keluaran.dist = argv[++i] ?? keluaran.dist;
    else if (arg === "--repo-root") keluaran.repoRoot = argv[++i] ?? null;
    else if (arg === "--vercel-js") keluaran.vercelJs = argv[++i] ?? null;
    else if (arg === "--convex-deployment") keluaran.convexDeployment = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") keluaran.bantuan = true;
  }
  return keluaran;
}

const BANTUAN = `Verifier pra-deploy keamanan produksi (Fase 9.4).

  node scripts/verify-production-security.mjs [opsi]

Opsi:
  --project <nama>      Nama proyek Vercel yang diharapkan (default: sumenepbukukerja)
  --vercel-cwd <dir>    Direktori yang memuat .vercel/project.json (default: otomatis)
  --dist <dir>          Direktori hasil build yang dipindai (default: dist)
  --vercel-js <berkas>  Berkas dist/vc.js milik CLI Vercel (default: dicari otomatis)
  --convex-deployment <d>  Deployment Convex untuk perintah convex env (default: prod:focused-lemur-389)
  --self-test           Jalankan pengujian negatif berbasis fixture
  --help                Tampilkan bantuan ini

Kode keluar: 0 semua gate wajib lulus, 1 ada yang gagal, 2 ada yang belum bisa diverifikasi.
Berkas ini tidak pernah mencetak nilai rahasia dan tidak pernah mengubah environment.`;

async function main() {
  const argv = bacaArgumen(process.argv.slice(2));
  if (argv.probe) return modeProbe(argv);
  if (argv.bantuan) {
    console.log(BANTUAN);
    return 0;
  }
  if (argv.selfTest) return jalankanSelfTest();

  const { baris: barisJarak, catatan } = await kumpulkanBuktiJarak(argv);
  const baris = [...barisJarak, ...kumpulkanBuktiConvex(argv.convexDeployment), ...kumpulkanBuktiLokal(argv)].sort(
    (a, b) => a.id.localeCompare(b.id),
  );

  console.log("PEMERIKSAAN KEAMANAN PRA-DEPLOY - FASE 9.4");
  console.log(`Proyek: ${argv.project}`);
  console.log("");
  for (const item of baris) {
    console.log(`[${item.status.padEnd(12)}] ${item.label}`);
    if (item.detail) console.log(`${" ".repeat(15)}${item.detail}`);
  }
  for (const satu of catatan) console.log(`[CATATAN]     ${satu}`);

  const wajib = baris.filter((item) => item.status !== INFO);
  const gagal = wajib.filter((item) => item.status === FAIL);
  const belum = wajib.filter((item) => item.status === UNVERIFIABLE);
  const kode = hitungKodeKeluar(wajib);

  console.log("");
  console.log(
    `Ringkasan: ${wajib.length - gagal.length - belum.length} lulus, ${gagal.length} gagal, ${belum.length} belum dapat diverifikasi.`,
  );
  if (kode === 0) console.log("KEPUTUSAN: READY - seluruh gate wajib lulus.");
  else if (kode === 1) console.log("KEPUTUSAN: BLOCKED - ada pemeriksaan yang gagal.");
  else console.log("KEPUTUSAN: BLOCKED - ada pemeriksaan wajib yang belum dapat diverifikasi.");
  return kode;
}

const dijalankanLangsung = (() => {
  try {
    return path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (dijalankanLangsung) {
  main()
    .then((kode) => {
      process.exitCode = typeof kode === "number" ? kode : 2;
    })
    .catch((galat) => {
      // Galat tak terduga tetap harus terlihat, tetapi isinya tidak boleh
      // mencetak apa pun dari environment.
      console.error(`Verifier berhenti karena galat tak terduga (${String(galat?.name ?? "Error")}).`);
      process.exitCode = 2;
    });
}
