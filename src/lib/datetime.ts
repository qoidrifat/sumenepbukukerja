/**
 * Format waktu untuk panel audit Ruang pengelola.
 *
 * Semua timestamp arrive sebagai angka milidetik dari Convex, jadi tidak ada
 * perubahan yang perlu dilakukan di sisi server — hanya cara menampilkannya.
 */

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const relativeFormatter = new Intl.RelativeTimeFormat("id-ID", {
  numeric: "always",
});

/** "27 Sep 2026, 14.32" — dengan detik untuk log yang urutannya penting. */
export function formatDateTime(timestamp?: number, withSeconds = false) {
  if (!timestamp) return "Belum ada";
  const date = new Date(timestamp);
  const parts = timeFormatter.formatToParts(date);
  const part = (type: "hour" | "minute" | "second") =>
    parts.find((item) => item.type === type)?.value ?? "00";
  const clock = `${part("hour")}.${part("minute")}`;
  return `${dateFormatter.format(date)}, ${withSeconds ? `${clock}.${part("second")}` : clock}`;
}

/** "baru saja" · "12 menit lalu" · "3 jam lalu" · "5 hari lalu". */
export function formatRelativeTime(timestamp?: number) {
  if (!timestamp) return "";
  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const distance = Math.abs(diffSeconds);
  if (distance < 45) return "baru saja";
  if (distance < 3_600) {
    return relativeFormatter.format(Math.round(diffSeconds / 60), "minute");
  }
  if (distance < 86_400) {
    return relativeFormatter.format(Math.round(diffSeconds / 3_600), "hour");
  }
  if (distance < 2_592_000) {
    return relativeFormatter.format(Math.round(diffSeconds / 86_400), "day");
  }
  return dateFormatter.format(new Date(timestamp));
}
