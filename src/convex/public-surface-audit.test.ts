/// <reference types="vite/client" />
/**
 * FASE 3 - AUDIT PERMANEN ATAS SETIAP FUNGSI PUBLIK.
 *
 * Matriks otorisasi di `docs/security/AUTHORIZATION-MATRIX.md` selalu berupa
 * dokumen. Dokumen membusuk: tidak ada yang gagal ketika ada `export const`
 * baru yang ditambahkan tanpa gerbang, dan audit berikutnya harus menemukan
 * ulang semuanya dari nol.
 *
 * Test ini mengubah audit itu menjadi GERBANG yang berjalan di CI. Sumber
 * kebenarannya adalah kode itu sendiri - daftar di bawah bukan daftar yang
 * ditulis tangan, tapi hasil memindai `src/convex/*.ts` pada saat test jalan.
 *
 * Yang diuji:
 *
 *   - setiap `export const X = query|mutation|action` harus menyentuh salah
 *     satu gerbang yang membuktikan identitas, ATAU ada di daftar pengecualian
 *     alasannya ditulis di sini;
 *   - daftar pengecualian itu sendiri tidak boleh punya entri yang tidak ada
 *     lagi (fungsi dihapus => exceptions harus ikut dibersihkan);
 *   - fungsi `internal*` TIDAK boleh muncul di exception list, karena
 *     `internal` sudah tidak terjangkau peramban.
 *
 * Yang SENGAJA tidak diuji: apakah gerbang yang dipanggil sudah benar.
 * Itu urusan test perilaku per fungsi. Yang dijaga di sini hanya fakta yang
 * lebih lemah dan lebih mudah lolos dari review mata: "ada atau tidaknya
 * gerbang".
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Token yang membuktikan handler mengambil keputusan otorisasi.
 *
 * Syaratnya satu: memuat nilai yang hanya bisa didapat server - identitas
 * dari `authSessions`, peran dari `staffMembers`, atau kepemilikan baris.
 * `getAuthUserId` masuk daftar karena dipakai sebagai "boleh, tapi tetap cek
 * kepemilikan"; dipakai tanpa cek kepemilikan, test perilaku di berkas lain
 * yang menangkapnya.
 *
 * Catatan: `adminGate.callerRole` dan turunan lainnya dipakai dari dalam
 * `action` lewat `ctx.runQuery(anyApi.…)`, jadi bentuknya berbeda dari
 * import biasa - keduanya tetap dihitung di sini.
 */
const GATE_TOKENS = [
  "requireUser",
  "requireProvenIdentity",
  "requireStaff",
  "requireVendorManager",
  "requireManagementViewer",
  "requireAssignablePhoto",
  "getStaffAccess",
  "getAuthUserId",
  "getAuthUser",
  "getAuthSessionId",
  "adminGate.callerRole",
  "adminGate.callerIsOwnerAccount",
  "adminGate.passcodeConfig",
  "verifyAdminTicket",
  "acceptStaffInvite",
  "getInviteDetails",
] as const;

/**
 * Fungsi publik yang SENGAJA tanpa gerbang, beserta alasannya.
 *
 * Menambah entri di sini sama dengan menyatakan "permukaan publik ini
 * disengaja" di depan kode. Itu keputusan yang harus ditulis, bukan
 * diterima diam-diam.
 */
const INTENTIONAL_PUBLIC: Record<string, string> = {
  "users:bootstrapAdministratorAvailable":
    "Probe konfigurasi, hanya satu boolean, tidak memuat data. Tidak ada pemanggil di frontend.",
  "vendors:listActive":
    "Baca katalog publik. Hanya status `active`, dan nomor sudah hilang lewat `toPublicCatalogVendor`.",
  "vendors:getBySlug":
    "Baca profil publik. Hanya status `active`, bentuk sama dengan katalog.",
  "vendors:getImageUrl":
    "Baca URL foto. Hanya blob yang terbukti milik listing aktif atau foto galeri disetujui.",
  "vendors:ensureCatalogSeeded":
    "Bootstrap katalog kosong. Idempoten, hanya menyemai slug yang belum ada, dibatasi 200, dan sudah ikut `public_mutation_rate`.",
  "vendors:incrementClick":
    "Penghitung klik pada listing aktif. Hanya menambah satu field, sudah ada plafon per jam.",
  "vendors:recordSearch":
    "Pencatatan kata kunci pencarian. Maks 24 vendor per panggilan, sudah ada plafon per jam.",
};

const CONVEX_DIR = fileURLToPath(new URL(".", import.meta.url));

type PublicFunction = { key: string; file: string; kind: string; body: string };

/**
 * Ekstrak badan setiap fungsi publik publik.
 *
 * Hitungan kurung kurawal untuk menemukan ujung deklarasi, bukan pola
 * ekspresi reguler - badan fungsi berisi kurung kurawal di dalam string dan
 * di dalam arrow function, jadi pola biasa akan salah memotong.
 */
function readPublicFunctions(): PublicFunction[] {
  const files = readdirSync(CONVEX_DIR).filter(
    (f) => f.endsWith(".ts") && !f.startsWith("_") && !f.includes(".test."),
  );

  const found: PublicFunction[] = [];
  for (const file of files) {
    const lines = readFileSync(CONVEX_DIR + file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^export const ([A-Za-z0-9_]+) = (query|mutation|action)\(/);
      if (!match) continue;

      let depth = 0;
      let started = false;
      let end = i;
      for (let j = i; j < Math.min(lines.length, i + 600); j++) {
        for (const ch of lines[j]) {
          if (ch === "{") {
            depth++;
            started = true;
          } else if (ch === "}") {
            depth--;
          }
        }
        if (started && depth === 0) {
          end = j;
          break;
        }
      }
      found.push({
        key: `${file.replace(/\.ts$/, "")}:${match[1]}`,
        file,
        kind: match[2],
        body: lines.slice(i, end + 1).join("\n"),
      });
    }
  }
  return found;
}

const publicFunctions = readPublicFunctions();
const hasGate = (body: string) =>
  GATE_TOKENS.some((token) => new RegExp(`\\b${token.replace(/\./g, "\\.")}\\b`).test(body));

describe("audit fungsi publik", () => {
  test("pemindaian benar-benar menemukan fungsi publik", () => {
    // Kalau pemindaian ini kembali kosong karena regex-nya salah, test
    // di bawah akan hijau tanpa memeriksa apa pun. Assertion inilah yang
    // membuat kegagalan diam-diam mustahil.
    expect(publicFunctions.length).toBeGreaterThan(100);
  });

  test("tidak ada fungsi publik tanpa gerbang atau pengecualian", () => {
    const unguarded = publicFunctions
      .filter((fn) => !hasGate(fn.body) && !(fn.key in INTENTIONAL_PUBLIC))
      .map((fn) => `${fn.key} (${fn.kind}, ${fn.file})`);

    expect(
      unguarded,
      unguarded.length === 0
        ? ""
        : [
            "Fungsi publik berikut tidak memanggil gerbang otorisasi apa pun",
            "DAN tidak ada di INTENTIONAL_PUBLIC:",
            ...unguarded.map((line) => `  - ${line}`),
            "",
            "Pilih salah satu:",
            "  1. Panggil gerbang yang benar (requireUser / requireStaff /",
            "     requireManagementViewer / requireVendorManager /",
            "     requireProvenIdentity / getAuthUserId).",
            "  2. Kalau memang harus publik, tambahkan ke INTENTIONAL_PUBLIC",
            "     di test ini BESERTA alasan yang spesifik - bukan 'kebetulan'.",
            "     Lalu perbarui docs/security/AUTHORIZATION-MATRIX.md bagian 3.",
          ].join("\n"),
    ).toEqual([]);
  });

  test("daftar pengecualian tidak menyimpan fungsi yang sudah tidak ada", () => {
    // Pengecualian untuk fungsi yang sudah dihapus adalah alarm palsu: ia
    // membuat angka exception terlihat benar padahal permukaannya sudah
    // berubah. Membuat audit tidak bisa dipercaya adalah lebih buruk daripada
    // tidak punya audit.
    const actual = new Set(publicFunctions.map((fn) => fn.key));
    const stale = Object.keys(INTENTIONAL_PUBLIC).filter((key) => !actual.has(key));

    expect(
      stale,
      stale.length === 0 ? "" : `Pengecualian untuk fungsi yang tidak ada: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  test("setiap pengecualian punya alasan yang nyata", () => {
    // Alasan kosong atau satu kata tidak pernah bisa di-review. Ambang 25
    // karakter memaksa penjelasan yang menyebut apa yang dikembalikan dan
    // apa yang membatasi permukaannya.
    const weak = Object.entries(INTENTIONAL_PUBLIC)
      .filter(([, reason]) => reason.trim().length < 25)
      .map(([key, reason]) => `${key}: "${reason}"`);

    expect(weak, weak.join("\n")).toEqual([]);
  });

  test("permukaan publik yang boleh menulis selalu punya penjelasan tertulis", () => {
    // Query publik tanpa sesi itu wajar - katalog memang harus bisa dibaca
    // tamu. Mutasi publik tanpa sesi tidak: itu Anonymous write primitive.
    // Setiap mutasi di daftar pengecualian WAJIB menyebut pembatasnya.
    const writes = publicFunctions
      .filter((fn) => fn.kind === "mutation" && fn.key in INTENTIONAL_PUBLIC)
      .filter((fn) => !/plafon|kuota|batas|limit|maks|rate/i.test(INTENTIONAL_PUBLIC[fn.key]));

    expect(
      writes.map((fn) => `${fn.key}: ${INTENTIONAL_PUBLIC[fn.key]}`),
      "Mutasi publik tanpa gerbang harus menyebutkan batasnya secara eksplisit.",
    ).toEqual([]);
  });
});