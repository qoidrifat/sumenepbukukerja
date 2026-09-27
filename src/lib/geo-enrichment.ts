// Geolokasi berbasis IP, opsional dan tidak pernah menjadi syarat login.
//
// Prinsipnya satu hal: login harus tetap berhasil kalau seluruh modul ini
// gagal atau tidak dikonfigurasi. Karena itu:
//   - tanpa environment, fungsi langsung keluar tanpa jaringan sama sekali;
//   - ada timeout pendek, jadi percobaan masuk tidak menggantung;
//   - semua kegagalan ditelan dan mengembalikan null.
//
// Yang dikembalikan hanya field yang benar-benar dibutuhkan audit: kota,
// wilayah, negara, dan tipe jaringan. Tidak ada koordinat presisi yang
// ditampilkan sebagai lokasi pengguna.

export type GeoLocation = {
  city: string | null;
  region: string | null;
  country: string | null;
  networkType: string | null;
};

const EMPTY: GeoLocation = { city: null, region: null, country: null, networkType: null };

const TIMEOUT_MS = 1_200;

/** True hanya bila operator benar-benar mengonfigurasi provider. */
export function geoLookupConfigured(env: Record<string, string | undefined>) {
  return Boolean(env.IP_GEOLOCATION_URL?.trim());
}

const text = (value: unknown, max = 60) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/**
 * Bentuk respons provider bisa berbeda-beda, jadi beberapa kunci umum dicoba
 * satu per satu. Hasil dinormalisasi supaya tabel audit tidak menyimpan
 * bentuk mentah dari luar.
 */
function normalize(payload: unknown): GeoLocation {
  if (!payload || typeof payload !== "object") return EMPTY;
  const root = payload as Record<string, unknown>;
  const cityBlock = (root.city ?? root.city_name ?? root.cityName) as unknown;
  const regionBlock = (root.region ?? root.regionName ?? root.region_name ?? root.state) as unknown;
  const countryBlock = (root.country ?? root.country_name ?? root.countryName ?? root.countryCode) as unknown;

  const nameOf = (value: unknown): string | null => {
    if (typeof value === "string") return text(value);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const names = record.names;
      const localized =
        names && typeof names === "object" ? (names as Record<string, unknown>).en : undefined;
      return text(localized ?? record.name ?? record.long_name);
    }
    return null;
  };

  const connectivity = (root.connection ?? root.autonomous_system) as Record<string, unknown> | undefined;

  return {
    city: nameOf(cityBlock),
    region: nameOf(regionBlock),
    country: nameOf(countryBlock),
    networkType: text(
      (root.connection_type as string) ??
        (connectivity?.type as string) ??
        (root.network as string) ??
        null,
      24,
    ),
  };
}

/**
 * Satu panggilan, satu IP, satu hasil ternormalisasi. Selalu mengembalikan
 * objek — pemanggil tidak perlu try/catch dan tidak boleh gagal karena ini.
 */
export async function lookupGeoLocation(
  ip: string,
  env: Record<string, string | undefined>,
): Promise<GeoLocation> {
  const template = env.IP_GEOLOCATION_URL?.trim();
  if (!template || !ip) return EMPTY;
  try {
    const url = template.includes("{ip}")
      ? template.replace("{ip}", encodeURIComponent(ip))
      : `${template.replace(/\/$/, "")}/${encodeURIComponent(ip)}`;
    const headers: Record<string, string> = { accept: "application/json" };
    const key = env.IP_GEOLOCATION_API_KEY?.trim();
    if (key) headers.authorization = `Bearer ${key}`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return EMPTY;
    return normalize(await response.json());
  } catch {
    // Timeout, DNS gagal, provider berubah, JSON aneh — semuanya tidak fatal.
    return EMPTY;
  }
}
