import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * Uji invarian keamanan jalur telemetry admin.
 *
 * Uji ini tidak memanggil fungsi apa pun. Semuanya membaca sumber, karena
 * yang dijaga justru hal yang tidak terlihat dari luar: nama environment yang
 * salah tempat, alamat IP mentah yang masuk ke baris atau log, dan jalur yang
 * bisa dipanggil tanpa autentikasi.
 *
 * Alasan membaca sumber, bukan memanggil: `httpAction` dan fungsi Vercel tidak
 * bisa dijalankan tanpa backend. Yang paling penting di sini justru bentuk
 * kode yang tidak boleh muncul sama sekali, dan itu memang hanya terlihat di
 * sumber.
 */

const SECRET_ENV = "ADMIN_CONTEXT_RELAY_SECRET";
const HASH_ENV = "SERVER_IP_HASH_SECRET";


/**
 * Berkas yang boleh membaca environment. Semuanya sisi server. Modul di
 * `src/lib` ikut masuk bundel peramban kalau diimpor dari komponen, jadi
 *lokasinya yang diperiksa, bukan hanya pemanggilnya.
 */
const BOLEH_AMBIL_ENVIRONMENT = [
  "api/admin-context.ts",
  "src/convex/",
  "src/lib/admin-context-relay.ts",
  "src/lib/admin-relay-signature.ts",
  "src/lib/admin-ip-hash.ts",
  "src/lib/admin-telemetry.ts",
  "src/lib/admin-passcode.ts",
  "src/lib/phone-crypto.ts",
];

/** Semua berkas sumber di bawah akar, tanpa `node_modules` dan `dist`. */
const kumpulkanBerkas = (akar: string, keluar: string[] = []): string[] => {
  for (const entri of readdirSync(akar)) {
    const jalur = join(akar, entri);
    if (entri === "node_modules" || entri === "dist" || entri === ".git") continue;
    if (statSync(jalur).isDirectory()) {
      kumpulkanBerkas(jalur, keluar);
    } else if (/\.(ts|tsx|js|mjs|html|json|css)$/.test(entri)) {
      keluar.push(jalur.replace(/\\/g, "/"));
    }
  }
  return keluar;
};

const bolehEnvironment = (file: string) => {
  if (file.includes(".test.")) return true;
  return BOLEH_AMBIL_ENVIRONMENT.some((prefix) =>
    prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix,
  );
};

/** Potong blok handler relay dari `src/convex/http.ts`. */
const blokRelay = () => {
  const http = readFileSync("src/convex/http.ts", "utf8");
  const awal = http.indexOf("const adminContextRelay");
  const akhir = http.indexOf("http.route({ path: RELAY_ROUTE");
  expect(awal).toBeGreaterThan(-1);
  expect(akhir).toBeGreaterThan(awal);
  return http.slice(awal, akhir);
};

describe("secret tidak pernah masuk ke sisi peramban", () => {
  test("nama environment untuk env hanya dibaca dari berkas sisi server", () => {
    const bermasalah: string[] = [];
    for (const file of [...kumpulkanBerkas("src"), "api/admin-context.ts"]) {
      if (bolehEnvironment(file)) continue;
      const isi = readFileSync(file, "utf8");
      // Yang dicari adalah pemakaian sebagai kunci environment, bukan teks
      // di dalam label yang dibaca operator.
      const dipakai = new RegExp(
        `process\\.env.{0,80}${SECRET_ENV}|process\\.env.{0,80}${HASH_ENV}`,
      ).test(isi);
      if (dipakai) bermasalah.push(file);
    }
    expect(bermasalah).toEqual([]);
  });

  test("nama environment yang muncul di peramban hanya boleh di Security Desk", () => {
    // Nama environment bukan rahasia, dan menampilkan nama yang harus
    // diisi justru memperbaiki status: operator melihat 
    // `SERVER_IP_HASH_SECRET belum diisi`, bukan tebakan 
    // "tidak ada kunci". Yang tidak boleh ada di peramban adalah logika
    // pemilihan kuncinya, bukan namanya.
    const bermasalah: string[] = [];
    for (const file of kumpulkanBerkas("src")) {
      if (bolehEnvironment(file)) continue;
      const isi = readFileSync(file, "utf8");
      const label = /"[^"]*(SERVER_IP_HASH_SECRET|ADMIN_CONTEXT_RELAY_SECRET)[^"]*"/;
      const bolehLabel = file.includes("admin-telemetry.ts");
      if (label.test(isi) && !bolehLabel) bermasalah.push(file);
    }
    expect(bermasalah).toEqual([]);
  });

  test("tidak ada modul peramban yang membaca environment", () => {
    const bermasalah: string[] = [];
    for (const file of kumpulkanBerkas("src")) {
      if (bolehEnvironment(file)) continue;
      if (/process\.env\[?[A-Z]/.test(readFileSync(file, "utf8"))) bermasalah.push(file);
    }
    expect(bermasalah).toEqual([]);
  });

  test("fungsi Vercel memakai secret hanya untuk menandatangani", () => {
    const sumber = readFileSync("api/admin-context.ts", "utf8");
    expect(sumber).toContain("process.env[RELAY_SECRET_ENV]");
    // Metode dan path ikut ditandatangani: tanpa itu, satu tanda tangan sah
    // untuk route relay juga sah untuk route lain yang memakai secret sama.
    expect(sumber).toContain("method: RELAY_METHOD,");
    expect(sumber).toContain("path: RELAY_ROUTE,");
    // Secret tidak boleh dipakai untuk menolak pemanggil, dan header
    // Authorization tidak boleh jadi gerbang.
    expect(sumber).not.toMatch(/request\.headers\.get\("authorization"\)/);
    expect(sumber).not.toMatch(/authorization:\s*`Bearer/);
  });

  test("secret tidak pernah ditulis ke localStorage atau sessionStorage", () => {
    const bermasalah: string[] = [];
    for (const file of kumpulkanBerkas("src")) {
      // Berkas uji ini sendiri menyebut keduanya, jadi tidak bisa dihitung
      // sebagai temuan.
      if (file.includes(".test.")) continue;
      const isi = readFileSync(file, "utf8");
      for (const penyimpanan of ["localStorage", "sessionStorage"]) {
        if (isi.includes(penyimpanan) && isi.includes(SECRET_ENV)) {
          bermasalah.push(`${file} (${penyimpanan})`);
        }
      }
    }
    expect(bermasalah).toEqual([]);
  });

  test(
    "skrip E2E tidak pernah menuliskan kredensial di source",
    () => {
      // Kredensial E2E hanya boleh dibaca dari environment. Menuliskannya di
      // source berarti kredensial ikut masuk ke version control.
      const bermasalah: string[] = [];
      for (const file of kumpulkanBerkas("e2e")) {
        const isi = readFileSync(file, "utf8");
        if (/E2E_(USER_EMAIL|USER_PASSWORD|ADMIN_PASSCODE)\s*=/.test(isi)) {
          bermasalah.push(file);
        }
      }
      expect(bermasalah).toEqual([]);
    },
  );

  test("secret tidak pernah ditulis ke query string atau URL", () => {
    const bermasalah: string[] = [];
    for (const file of kumpulkanBerkas("src")) {
      if (file.includes(".test.")) continue;
      const isi = readFileSync(file, "utf8");
      if (new RegExp(`${SECRET_ENV}=`).test(isi)) bermasalah.push(file);
      if (new RegExp(`[?&]${SECRET_ENV}`).test(isi)) bermasalah.push(file);
    }
    expect(bermasalah).toEqual([]);
  });
});

describe("alamat IP mentah tidak pernah disimpan atau dikembalikan", () => {
  test("skema tidak punya kolom untuk IP mentah", () => {
    const skema = readFileSync("src/convex/schema.ts", "utf8");
    // `ipHash` dan `ipMasked` boleh ada. Yang tidak boleh ada adalah kolom yang
    // menyimpan alamat lengkap.
    expect(skema).not.toMatch(/\bipRaw\b/);
    expect(skema).not.toMatch(/\brawIp\b/);
    expect(skema).not.toMatch(/\bipAddress\b/);
  });

  test("tabel konteks menyimpan hash berkey, bukan hash polos", () => {
    const route = blokRelay();
    expect(route).toContain("keyedHash(payload.ip, ipHashKey.secret)");
    expect(route).not.toContain("sha256Hex(payload.ip)");
    // Fail closed di produksi ikut dijaga di level sumber. Module-nya sudah
    // diuji perilakunya, tapi yang diuji di sini adalah call site-nya:
    // kalau ada satu jalur yang lupa meneruskan `production`, tidak ada yang
    // menangkapnya sampai baris audit produksi salah konfigurasi.
    expect(route).toContain("resolveIpHashSecret(process.env, { production: isProduction() })");
    expect(route).toContain("ipHashMethodFor(ipHashKey, Boolean(ipHash))");
  });

  test("argumen konteks hanya menerima bentuk turunan", () => {
    const adminGate = readFileSync("src/convex/adminGate.ts", "utf8");
    // Baris sisipnya `{ ...args }`, jadi nama kolom ada di deklarasi argumen.
    // Itulah yang dipotong, bukan baris sisipnya.
    const awal = adminGate.indexOf("export const captureSecurityContext");
    const akhir = adminGate.indexOf('await ctx.db.insert("adminSecurityContexts"');
    expect(awal).toBeGreaterThan(-1);
    expect(akhir).toBeGreaterThan(awal);
    const argumen = adminGate.slice(awal, akhir);
    expect(argumen).toContain("ipHash: v.optional(v.string())");
    expect(argumen).toContain("ipMasked: v.optional(v.string())");
    // Tidak ada kolom yang bisa menampung alamat lengkap.
    expect(argumen).not.toMatch(/\bipRaw\b/);
    expect(argumen).not.toMatch(/\bipAddress\b/);
  });

  test("bentuk jawaban netral ke peramban tidak memuat IP mentah", () => {
    const relay = readFileSync("api/admin-context.ts", "utf8");
    // IP mentah memang boleh ada di badan yang dikirim ke backend; itu satu-
    // satunya tempatnya. Yang diperiksa adalah apa yang KEMBALI ke peramban.
    const awal = relay.indexOf("const KOSONG = {");
    const akhir = relay.indexOf("};", awal);
    expect(awal).toBeGreaterThan(-1);
    const bentukNetral = relay.slice(awal, akhir);
    expect(bentukNetral).toContain("ipMasked");
    expect(bentukNetral).not.toMatch(/\bip:\s/);
    // Fungsi Vercel tidak menyamar IP apa pun, dan itu memang benar: yang
    // diterima dari backend sudah berupa bentuk tersamar. Yang diperiksa
    // adalah bahwa fungsi ini meneruskan jawaban itu apa adanya.
    expect(relay).toContain("await response.json()");
    // Tidak ada penyamaan manual di sisi Vercel; penyamaan terjadi di backend.
    expect(relay).not.toMatch(/maskIp|normalizeIp/);
  });
});

describe("kredensial tidak masuk ke payload audit", () => {
  test("tidak ada kolom passcode atau password di schema audit", () => {
    const skema = readFileSync("src/convex/schema.ts", "utf8");
    expect(skema).not.toMatch(/passcodePlain/);
    expect(skema).not.toMatch(/\bpasswordHash:\s*v\.string/);
    // Yang ada adalah hash turunan, yang memang dibutuhkan untuk verifikasi.
    expect(skema).toContain("tokenHash: v.string()");
  });

  test("token sesi disimpan sebagai referensi, bukan token mentah", () => {
    const skema = readFileSync("src/convex/schema.ts", "utf8");
    expect(skema).toContain("sessionReference: v.optional(v.string())");
    expect(skema).not.toMatch(/\bsessionToken:\s*v\.string/);
  });

  test("percobaan masuk tidak pernah menerima passcode dari klien", () => {
    const adminGate = readFileSync("src/convex/adminGate.ts", "utf8");
    const awal = adminGate.indexOf("export const recordAttempt");
    const akhir = adminGate.indexOf('await ctx.db.insert("adminPasscodeAttempts"');
    expect(awal).toBeGreaterThan(-1);
    const blok = adminGate.slice(awal, akhir);
    expect(blok).not.toMatch(/passcode\s*:/);
    expect(blok).not.toMatch(/password\s*:/);
  });
});

describe("tidak ada fingerprinting yang ditambahkan", () => {
  test("tidak ada sidik jari perangkat di sisi peramban", () => {
    const bermasalah: string[] = [];
    for (const file of kumpulkanBerkas("src")) {
      if (file.includes(".test.")) continue;
      // `image-upload.ts` memakai canvas untuk memotong dan memutar gambar
      // yang diunggah pengguna. Itu pemrosesan berkas, bukan sidik jari
      // perangkat, dan tidak pernah masuk ke event keamanan.
      if (file === "src/lib/image-upload.ts") continue;
      const isi = readFileSync(file, "utf8");
      for (const pola of [
        "UNMASKED_RENDERER",
        "hardwareConcurrency",
        "deviceMemory",
        "fonts.check",
        "getBattery",
        "AudioContext",
        "enumerateDevices",
      ]) {
        if (isi.includes(pola)) bermasalah.push(`${file} (${pola})`);
      }
    }
    expect(bermasalah).toEqual([]);
  });

  test("geolokasi tidak dipakai untuk telemetry keamanan", () => {
    // `use-user-location.ts` dan `community-widgets.tsx` memakai GPS untuk
    // menghitung jarak usaha di katalog. Itu fitur produk yang sudah lama ada,
    // berjalan sepenuhnya di peramban, dan tidak menulis apa pun ke audit
    // keamanan. Yang dilarang di sini adalah GPS yang dipakai untuk telemetry.
    const DIKECUALIKAN = new Set([
      "src/hooks/use-user-location.ts",
      "src/components/community-widgets.tsx",
    ]);
    const bermasalah: string[] = [];
    for (const file of kumpulkanBerkas("src")) {
      if (file.includes(".test.")) continue;
      if (DIKECUALIKAN.has(file)) continue;
      if (readFileSync(file, "utf8").includes("navigator.geolocation")) bermasalah.push(file);
    }
    expect(bermasalah).toEqual([]);
  });

  test("modul telemetry keamanan tidak menambah jalur lokasi baru", () => {
    for (const file of [
      "src/lib/admin-relay-signature.ts",
      "src/lib/admin-telemetry.ts",
      "api/admin-context.ts",
    ]) {
      const isi = readFileSync(file, "utf8");
      expect(isi).not.toContain("navigator.geolocation");
      expect(isi).not.toContain("getCurrentPosition");
    }
  });
});

describe("rute relay tidak bisa dipanggil tanpa bukti", () => {
  test("fungsi Vercel menutup diri tanpa secret", () => {
    const relay = readFileSync("api/admin-context.ts", "utf8");
    expect(relay).toContain("process.env[RELAY_SECRET_ENV]");
    expect(relay).toContain("if (!secret?.trim()) return json(KOSONG, cors);");
  });

  test("backend menolak permintaan tanpa tanda tangan yang sah", () => {
    const route = blokRelay();
    expect(route).toContain("verifyRelayRequest");
    expect(route).toContain("if (!signature.ok)");
    // Secret polos sebagai header Authorization sudah tidak lagi jadi jalur auth.
    expect(route).not.toMatch(/verifyRelaySecret/);
  });

  test("nonce sekali pakai dijaga dengan satu mutasi, bukan beberapa", () => {
    // Kalau pengecekan dan penyimpanan nonce dipecah, dua permintaan dengan
    // nonce sama bisa sama-sama melihat kekosongan lalu sama-sama menulis.
    const adminGate = readFileSync("src/convex/adminGate.ts", "utf8");
    const awal = adminGate.indexOf("export const claimRelayNonce");
    const akhir = adminGate.indexOf("/** Konteks dipakai sekali saja");
    expect(awal).toBeGreaterThan(-1);
    const blok = adminGate.slice(awal, akhir);
    expect((blok.match(/ctx\.db\.insert/g) ?? []).length).toBe(1);
    expect(blok).toContain("already");
  });

  test("balasan relay yang ditolak tidak membedakan penyebabnya", () => {
    // Kalau bentuk jawabannya berbeda antara "tanda tangan salah" dan "backend
    // mati", endpoint ini berubah jadi alat untuk menebak.
    const route = blokRelay();
    expect(route).toContain("const netral");
    expect(route).not.toMatch(/return json\(\{ error: reason/);
  });
});

describe("konfigurasi deploy tidak menelan endpoint api", () => {
  test("aturan rewrite mengecualikan /api/", () => {
    const konfigurasi = JSON.parse(readFileSync("vercel.json", "utf8"));
    const rewrite = konfigurasi.rewrites?.find((r: { source: string }) =>
      r.source.includes("api"),
    );
    expect(rewrite).toBeDefined();
    // Kalau pengecualiannya hilang, `/api/admin-context` dilayani index.html
    // dan gejalanya sama persis dengan "relay mati": jawaban HTML, bukan JSON.
    expect(rewrite.source).toContain("(?!api/)");
  });

  test("tidak ada rewrite lain yang lebih dulu menangkap /api/", () => {
    const konfigurasi = JSON.parse(readFileSync("vercel.json", "utf8"));
    const daftar: { source: string }[] = konfigurasi.rewrites ?? [];
    const pengecualian = daftar.findIndex((r) => r.source.includes("(?!api/)"));
    // Setiap rewrite tanpa pengecualian harus muncul setelah yang mengecualikan
    // api, kalau tidak ia akan menangkap lebih dulu.
    for (let i = 0; i < daftar.length; i += 1) {
      if (daftar[i].source.includes("api")) continue;
      expect(i).toBeGreaterThan(pengecualian);
    }
  });
});

describe("minimisasi lokasi", () => {
  test("tabel konteks keamanan tidak punya kolom koordinat sama sekali", () => {
    // Lokasi yang disimpan untuk audit cukup negara, wilayah, kota, dan zona
    // waktu. Koordinat presisi tidak menambah apa pun untuk pertanyaan "dari
    // mana percobaan ini datang", tapi cukup untuk menunjuk seseorang sampai
    // bangunan tempatnya berdiri.
    //
    // Dijaga di level skema: menambah kolom koordinat harus conscious dan uji
    // ini akan langsung merah kalau ada yang menambahkannya diam-diam.
    const skema = readFileSync("src/convex/schema.ts", "utf8");
    const awal = skema.indexOf("adminSecurityContexts: defineTable");
    expect(awal).toBeGreaterThan(-1);
    const akhir = skema.indexOf("adminPasscodeAttempts: defineTable");
    const tabel = skema.slice(awal, akhir > awal ? akhir : undefined);
    expect(tabel).not.toMatch(/\b(lat|lng|lon|latitude|longitude)\s*:/);

    // Route relay juga tidak boleh meneruskannya ke penyimpanan.
    const http = readFileSync("src/convex/http.ts", "utf8");
    const mulaiRoute = http.indexOf("const adminContextRelay");
    const route = http.slice(
      mulaiRoute,
      http.indexOf("http.route({ path: RELAY_ROUTE"),
    );
    expect(route).not.toMatch(/payload\.(latitude|longitude)/);
    expect(route).not.toMatch(/geo\.(latitude|longitude)/);
  });

  test("Security Desk menampilkan wilayah, bukan koordinat", () => {
    const panel = readFileSync("src/components/admin-security-log.tsx", "utf8");
    expect(panel).toContain("Lokasi perkiraan");
    expect(panel).toContain("Zona waktu");
    expect(panel).not.toMatch(/<Row label="(Lintang|Bujur|Latitude|Longitude)/);
  });

  test("kunci hash IP tidak pernah ikut ke bundel peramban", () => {
    // `admin-ip-hash.ts` hanya boleh diimpor dari server. Kalau ada
    // komponen yang mengimpornya, nama environment ikut ke halaman publik
    // dan pemeriksaan kebocoran tidak bisa memakai ambang nol. Yang
    // dipindahkan ke modul terpisah bukan stylisme: nilai rahasianya tetap
    // aman, tapi kebocoran nama env adalah bukti batas modul keliru.
    const peramban = kumpulkanBerkas("src").filter((file) =>
      file.includes("components") || file.endsWith(".tsx"));
    for (const file of peramban) {
      expect(readFileSync(file, "utf8"), file).not.toContain("admin-ip-hash");
    }
    const relay = readFileSync("api/admin-context.ts", "utf8");
    expect(relay).not.toContain("admin-ip-hash");
    // Yang diperiksa adalah kodenya, bukan komentarnya: nama fungsi boleh
    // disebut di komentar, tapi tidak boleh diekspor atau diimpor sebagai nilai.
    const label = readFileSync("src/lib/admin-telemetry.ts", "utf8");
    const kode = label
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(kode).not.toContain("resolveIpHashSecret");
    expect(kode).not.toContain("IP_HASH_SECRET_ENV");
    expect(kode).not.toContain("IP_HASH_FALLBACK_SECRET_ENV");
    // Impor ke modul server-only wajib bertipe, supaya hilang saat bundel.
    expect(kode).not.toMatch(/import\s*{[^}]*IpHashSecretResult/);
    expect(kode).toContain("import type { IpHashSecretResult }");
    // Yang boleh tersisa di berkas ini hanya satu penyebutan sebagai label.
    expect(label.split("SERVER_IP_HASH_SECRET").length - 1).toBe(1);
  });

});

describe("templat environment mencantumkan kunci yang wajib", () => {
  test("kedua kunci relay terdokumentasi di templat environment", () => {
    // `.env.example` adalah satu-satunya daftar yang dibaca operator saat
    // mengisi environment. Kalau kunci yang wajib ada tidak tercatat di sana,
    // kegagalan muncul sebagai Security Desk yang diam: `ipHash` kosong,
    // `telemetryStatus` `failed`, tanpa ada yang menghubungkan gejalanya dengan
    // satu environment yang belum diisi.
    const templat = readFileSync(".env.example", "utf8");
    for (const nama of ["ADMIN_CONTEXT_RELAY_SECRET", "SERVER_IP_HASH_SECRET"]) {
      expect(templat, nama).toMatch(new RegExp(`^${nama}=`, "m"));
    }
    // Nilai kosong harus tetap kosong di templat. Templat masuk repository,
    // jadi isinya hanya nama dan aturan, tidak pernah nilai.
    expect(templat).not.toMatch(/^(ADMIN_CONTEXT_RELAY_SECRET|SERVER_IP_HASH_SECRET)=\S/m);
  });
});
