import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronDown,
  Clock3,
  Fingerprint,
  Globe,
  Info,
  Lock,
  MapPin,
  Monitor,
  Network as NetworkIcon,
  Radio,
  ShieldCheck,
  ShieldX,
  Smartphone,
  Timer,
} from "lucide-react";

import { TimeStampLabel } from "@/components/admin-workspace";
import { SessionRevokeControl } from "@/components/admin-session-revoke";
import {
  useAdminIpActivity,
  useAdminSecurityEvents,
  useAdminSecuritySummary,
} from "@/lib/catalog-store";
import {
  SIGNAL_LABEL,
  UNKNOWN_LABEL,
  describeFailure,
  describeIpSource,
  type SecuritySignal,
} from "@/lib/security-context";
import { formatRelativeTime } from "@/lib/datetime";

type SecurityEvent = NonNullable<ReturnType<typeof useAdminSecurityEvents>>["events"][number];
type IpActivity = NonNullable<ReturnType<typeof useAdminIpActivity>>[number];

/** Lihat catatan di blok `handleSelfRevoked`: keluar dari sesi sendiri ditangani watchdog. */
const noop = () => {};

const OUTCOME_FILTERS = [
  { value: "all", label: "Semua" },
  { value: "success", label: "Berhasil" },
  { value: "failed", label: "Gagal" },
  { value: "locked", label: "Terkunci" },
] as const;

const WINDOW_FILTERS = [
  { value: "all", label: "Semua waktu" },
  { value: "1h", label: "1 jam" },
  { value: "24h", label: "24 jam" },
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
] as const;

const WINDOW_MS: Record<string, number> = {
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
};

/**
 * Filter IP dan sinyal sengaja berupa "hanya yang punya sinyal" dan bukan
 * "carineedle": panel ini untuk melihat apa yang berubah, bukan untuk
 * menjelajah data mentah.
 */
const IP_FILTERS = [
  { value: "all", label: "Semua IP" },
  { value: "new", label: "IP baru" },
  { value: "known", label: "IP dikenal" },
] as const;

const SIGNAL_FILTERS = [
  { value: "all", label: "Semua sinyal" },
  { value: "with", label: "Dengan security signal" },
] as const;

/**
 * Hierarchy_level_1 hanya menjawab: berhasil/gagal, kapan, dari perangkat apa,
 * dari lokasi mana. Metadata teknis baru muncul setelah "Lihat detail keamanan".
 *
 * Semua warna memakai token admin (src/index.css), tidak ada palette baru:
 * mint #24533A di #DCEBD7 (7.1:1), #1A1A1A di #FFE662 (14:1), #7C2D12 di
 * #E9B4A7 (5.1:1), #1A1A1A di #FF5A26 (5.7:1), putih di #121212 (18.9:1).
 * Semua lolos WCAG AA untuk teks kecil.
 */
const outcomeMeta = (outcome: SecurityEvent["outcome"]) => {
  if (outcome === "success") {
    return {
      label: "Berhasil",
      badge: "border-[#121212] bg-[#DCEBD7] text-[#24533A]",
      bar: "bg-[#24533A]",
      Icon: ShieldCheck,
    };
  }
  if (outcome === "locked") {
    return {
      label: "Terkunci",
      badge: "border-[#121212] bg-[#E9B4A7] text-[#7C2D12]",
      bar: "bg-[#121212]",
      Icon: ShieldX,
    };
  }
  return {
    label: "Gagal",
    badge: "border-[#121212] bg-[#FFE662] text-[#1A1A1A]",
    bar: "bg-[#7C2D12]",
    Icon: AlertTriangle,
  };
};

/** "Normal" sengaja tidak dirender di level 1: itu kondisi default, bukan informasi. */
const statusMeta = (status: SecurityEvent["status"]) => {
  if (status === "Rate limited") {
    return {
      label: "Rate limited",
      badge: "border-[#121212] bg-[#FF5A26] text-[#1A1A1A]",
      Icon: Timer,
    };
  }
  if (status === "Blocked") {
    return {
      label: "Blocked",
      badge: "border-[#121212] bg-[#121212] text-white",
      Icon: ShieldX,
    };
  }
  return null;
};

const deviceIcon = (deviceType: string | null) =>
  deviceType === "Mobile" || deviceType === "Tablet" ? Smartphone : Monitor;

/**
 * Nilai yang tidak ada tampil muted, bukan error. Dipakai hanya di dalam
 * detail, jadi `value` boleh mengembalikan JSX.
 */
const value = (input: string | number | null | undefined) => {
  if (input === null || input === undefined || input === "") {
    return <span className="font-medium text-[#525252]">{UNKNOWN_LABEL}</span>;
  }
  return String(input);
};

const compareLabel = (same: boolean | null, yes: string, no: string) => {
  if (same === null) return <span className="font-medium text-[#525252]">Tidak ada pembanding</span>;
  if (same) return yes;
  return no;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[#EDEAE0] py-1.5 last:border-b-0 lg:flex-row lg:gap-3">
      <dt className="shrink-0 text-[0.7rem] font-black uppercase leading-5 tracking-[0.08em] text-[#525252] lg:w-32">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm font-bold leading-5 text-[#1A1A1A]">{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-2 border-[#121212] bg-white">
      <h4 className="border-b-2 border-[#121212] bg-[#F1EDE3] px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#525252]">
        {title}
      </h4>
      <dl className="px-3 py-1">{children}</dl>
    </section>
  );
}

/** Chip kontekstual: beda perangkat/IP, atau beberapa kegagalan beruntun. */
function Chip({
  icon: Icon,
  children,
  tone = "neutral",
}: {
  icon: typeof AlertTriangle;
  children: ReactNode;
  tone?: "neutral" | "alert";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 border-2 px-1.5 py-0.5 text-[0.7rem] font-black ${
        tone === "alert"
          ? "border-[#121212] bg-[#E9B4A7] text-[#7C2D12]"
          : "border-[#121212] bg-[#F1EDE3] text-[#1A1A1A]"
      }`}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

function FilterButton({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone: "ink" | "orange";
}) {
  const activeClass =
    tone === "orange" ? "bg-[#FF5A26] text-[#1A1A1A]" : "bg-[#121212] text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 border-2 border-[#121212] px-3 text-sm font-black ${
        active ? activeClass : "bg-white text-[#1A1A1A] hover:bg-[#F1EDE3]"
      }`}
    >
      {label}
    </button>
  );
}

export function AdminSecurityLog() {
  // Paginasi kursor disimpan sebagai tumpukan path, bukan akumulasi di efek.
  // Alasannya nyata: akumulasi lewat `useEffect` membuat render pertama kosong
  // lalu diisi setelahnya, dan tidak berjalan sama sekali di render statis.
  // Tumpukan kursor merender halaman yang benar langsung di render pertama.
  const [cursorPath, setCursorPath] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursorPath[cursorPath.length - 1];
  const page = useAdminSecurityEvents(25, cursor);
  /**
   * Sesi milik perangkat ini sendiri bisa dicabut dari Security Desk. Setelah
   * server mengonfirmasi pencabutan, peramban tidak boleh tetap menampilkan
   * ruang admin yang tidak lagi didukung server — jadi keluar lewat jalur
   * watchdog yang sama dengan perangkat yang dicabut dari tempat lain.
   */
  // Pencabutan sesi sendiri TIDAK ditangani di sini dengan memuat ulang halaman.
  // Muat ulang membuang state lokal, tapi token masih tertinggal di storage dan
  // orangnya tidak diberi tahu kenapa ia terlempar keluar. Server sudah
  // menandai sesinya dicabut, jadi watchdog reaktif akan melihatnya dalam
  // hitungan milidetik dan menjalankan satu jalur keluar yang bersih: satu
  // toast, `signOut()`, baru redirect. Satu jalur keluar, bukan dua.
  const summary = useAdminSecuritySummary(24);
  const ipActivity = useAdminIpActivity(12);
  const [outcomeFilter, setOutcomeFilter] = useState<(typeof OUTCOME_FILTERS)[number]["value"]>("all");
  const [windowFilter, setWindowFilter] = useState<(typeof WINDOW_FILTERS)[number]["value"]>("all");
  const [ipFilter, setIpFilter] = useState<(typeof IP_FILTERS)[number]["value"]>("all");
  const [signalFilter, setSignalFilter] = useState<(typeof SIGNAL_FILTERS)[number]["value"]>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  // Waktu cutoff diambil di efek, bukan saat render, supaya filter waktu
  // tidak memanggil fungsi impure di jalur render. Sebelum efek berjalan,
  // `now` masih 0 sehingga semua baris tampil — tidak ada data yang hilang.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);

  const visible = useMemo(() => {
    const rows = page?.events ?? [];
    const since = windowFilter === "all" ? 0 : now - (WINDOW_MS[windowFilter] ?? 0);
    // `signals` dihitung server, tapi baris lama di database tidak punya kolom
    // itu. Default-nya kosong supaya baris legacy tetap tampil utuh, bukan
    // ikut hilang karena filter.
    const signalsOf = (row: SecurityEvent) => row.signals ?? [];
    return rows.filter(
      (row) =>
        (outcomeFilter === "all" || row.outcome === outcomeFilter) &&
        (since === 0 || row.createdAt >= since) &&
        (ipFilter === "all" ||
          (ipFilter === "new"
            ? signalsOf(row).includes("NEW_IP")
            : !signalsOf(row).includes("NEW_IP"))) &&
        (signalFilter === "all" || signalsOf(row).length > 0),
    );
  }, [page, outcomeFilter, windowFilter, ipFilter, signalFilter, now]);

  return (
    <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-[#1A1A1A]">Percobaan masuk ruang admin</h3>
          <p className="mt-1 text-sm leading-6 text-[#525252]">
            Jejak percobaan passcode pada halaman <code>/auth?returnTo=/admin</code>. Nilai
            sudah disamarkan di server dan alamat IP mentah tidak pernah disimpan.
          </p>
        </div>
        {summary?.lastEventAt ? (
          <span className="inline-flex shrink-0 items-center gap-2 border-2 border-[#121212] bg-[#F1EDE3] px-2.5 py-1 text-xs font-black">
            <Clock3 className="size-4" aria-hidden="true" />
            Percobaan terakhir {formatRelativeTime(summary.lastEventAt)}
          </span>
        ) : null}
      </div>

      {summary ? (
        <section className="mt-3 border-2 border-[#121212] bg-[#F5F0E5] p-3" aria-label="Ringkasan 24 jam terakhir">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4 className="text-xs font-black uppercase tracking-[0.12em] text-[#525252]">
              24 jam terakhir
            </h4>
            <p className="sr-only">
              Ringkasan aktivitas keamanan 24 jam terakhir beserta IP unik, perangkat
              baru, dan security signal.
            </p>
            <p className="text-xs font-bold text-[#525252]">
              Total tercatat {summary.total} percobaan
            </p>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Percobaan", value: summary.last24h, tone: "bg-white text-[#1A1A1A]" },
              { label: "Berhasil", value: summary.succeeded24h, tone: "bg-[#DCEBD7] text-[#24533A]" },
              { label: "Gagal", value: summary.failed24h, tone: "bg-[#FFE662] text-[#1A1A1A]" },
              { label: "Terkunci", value: summary.locked24h, tone: "bg-[#E9B4A7] text-[#7C2D12]" },
              { label: "IP unik", value: summary.uniqueIps, tone: "bg-white text-[#1A1A1A]" },
              { label: "IP baru", value: summary.newIps, tone: "bg-[#FFE662] text-[#1A1A1A]" },
              { label: "Perangkat baru", value: summary.newDevices, tone: "bg-white text-[#1A1A1A]" },
              { label: "Negara", value: summary.countries, tone: "bg-white text-[#1A1A1A]" },
              { label: "Security signal", value: summary.riskFlags, tone: "bg-[#E9B4A7] text-[#7C2D12]" },
            ].map((card) => (
              <div key={card.label} className={`border-2 border-[#121212] p-2 ${card.tone}`}>
                <dt className="text-xs font-bold uppercase tracking-[0.08em] opacity-80">{card.label}</dt>
                <dd className="mt-0.5 text-2xl font-black leading-none">{card.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Di mobile tombol filter jadi grid 2 kolom supaya tidak membungkus
            jadi 4 baris; dari sm ke atas kembali satu baris seperti sebelumnya. */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {OUTCOME_FILTERS.map((filter) => (
            <FilterButton
              key={filter.value}
              active={outcomeFilter === filter.value}
              label={filter.label}
              tone="ink"
              onClick={() => setOutcomeFilter(filter.value)}
            />
          ))}
        </div>
        <span className="hidden h-6 w-0.5 bg-[#D6D3D1] sm:block" aria-hidden="true" />
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {WINDOW_FILTERS.map((filter) => (
            <FilterButton
              key={filter.value}
              active={windowFilter === filter.value}
              label={filter.label}
              tone="orange"
              onClick={() => setWindowFilter(filter.value)}
            />
          ))}
        </div>
        <span className="hidden h-6 w-0.5 bg-[#D6D3D1] sm:block" aria-hidden="true" />
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {IP_FILTERS.map((filter) => (
            <FilterButton
              key={filter.value}
              active={ipFilter === filter.value}
              label={filter.label}
              tone="ink"
              onClick={() => setIpFilter(filter.value)}
            />
          ))}
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {SIGNAL_FILTERS.map((filter) => (
            <FilterButton
              key={filter.value}
              active={signalFilter === filter.value}
              label={filter.label}
              tone="orange"
              onClick={() => setSignalFilter(filter.value)}
            />
          ))}
        </div>
        <span className="ml-auto text-xs font-black text-[#525252]">
          Menampilkan {visible.length} dari {page?.total ?? 0} percobaan
        </span>
      </div>

      {!page ? (
        <p className="mt-3 text-sm text-[#525252]">Memuat jejak percobaan...</p>
      ) : visible.length === 0 ? (
        <div className="mt-3 flex flex-col items-start gap-1.5 border-2 border-dashed border-[#121212] bg-[#F5F0E5] p-4 sm:flex-row sm:items-center sm:gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center border-2 border-[#121212] bg-white">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-[#1A1A1A]">
              {page.total === 0
                ? "Belum ada percobaan masuk."
                : "Tidak ada percobaan yang cocok dengan filter ini."}
            </p>
            <p className="mt-0.5 text-xs font-bold text-[#525252]">
              {page.total === 0
                ? "Aktivitas akses admin akan muncul di sini."
                : "Ubah filter hasil, rentang waktu, atau sinyal di atas."}
            </p>
          </div>
        </div>
      ) : (
        <ol className="mt-3 max-h-[32rem] space-y-2 overflow-auto pr-1">
          {visible.map((event) => {
            const meta = outcomeMeta(event.outcome);
            const StatusIcon = meta.Icon;
            const DeviceIcon = deviceIcon(event.deviceType);
            const status = statusMeta(event.status);
            // "Blocked" selalu implisit saat hasil sudah "Terkunci", jadi tidak diulang.
            const showStatus = status !== null && !(status.label === "Blocked" && event.outcome === "locked");
            const isOpen = expanded === event._id;
            const panelId = `security-detail-${event._id}`;
            // Dedup aman: beberapa penyedia geo mengembalikan kota/wilayah yang sama.
            const location = [...new Set([event.city, event.region, event.country].filter(Boolean))].join(", ");
            const osLine = [event.os, event.osVersion].filter(Boolean).join(" ");
            const browserLine = [event.browser, event.browserVersion].filter(Boolean).join(" ");
            const deviceLine =
              [osLine, browserLine, event.deviceType].filter(Boolean).join(" · ") || UNKNOWN_LABEL;
            const localeLine = [event.timezone, event.locale].filter(Boolean).join(" · ");
            return (
              <li key={event._id} className="relative overflow-hidden border-2 border-[#121212] bg-white">
                <span className={`absolute inset-y-0 left-0 w-1.5 ${meta.bar}`} aria-hidden="true" />

                <div className="flex flex-col gap-2 p-3 pl-5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 border-2 px-2 py-0.5 text-xs font-black ${meta.badge}`}
                      >
                        <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />
                        {meta.label}
                      </span>
                      {showStatus && status ? (
                        <span
                          className={`inline-flex items-center gap-1.5 border-2 px-2 py-0.5 text-xs font-black ${status.badge}`}
                        >
                          <status.Icon className="size-3.5 shrink-0" aria-hidden="true" />
                          {status.label}
                        </span>
                      ) : null}
                      {event.sessionLive ? (
                        <span className="inline-flex items-center gap-1 border-2 border-[#121212] bg-[#DCEBD7] px-2 py-0.5 text-xs font-black text-[#24533A]">
                          <Radio className="size-3 shrink-0" aria-hidden="true" />
                          Aktif sekarang
                        </span>
                      ) : null}
                      {event.attemptNumber ? (
                        <span className="text-xs font-bold text-[#525252]">
                          percobaan ke-{event.attemptNumber}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1.5 text-xs text-[#525252]">
                      <TimeStampLabel timestamp={event.createdAt} withSeconds />
                    </p>

                    <div className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-[#1A1A1A]">
                        <DeviceIcon className="size-4 shrink-0 text-[#525252]" aria-hidden="true" />
                        <span className="min-w-0 break-words">{deviceLine}</span>
                      </p>
                      <p className="flex min-w-0 items-center gap-1.5 text-xs text-[#525252]">
                        <Globe className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">
                          {localeLine || <span className="font-medium">{UNKNOWN_LABEL}</span>}
                        </span>
                      </p>
                      <p className="flex min-w-0 items-center gap-1.5 text-xs text-[#525252]">
                        <NetworkIcon className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">
                          {event.ipMasked
                            ? `IP ${event.ipMasked}${event.ipFamily ? ` · ${event.ipFamily}` : ""}${event.proxyDetected ? " · via proxy/CDN" : ""}`
                            : <span className="font-medium">IP {UNKNOWN_LABEL}</span>}
                        </span>
                      </p>
                      <p className="flex min-w-0 items-center gap-1.5 text-xs text-[#525252]">
                        <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">
                          {location || <span className="font-medium">Lokasi {UNKNOWN_LABEL}</span>}
                        </span>
                      </p>
                    </div>

                    {(event.signals ?? []).length > 0 || event.sameIpAsPrevious === false || event.sameDeviceAsPrevious === false || event.failedInWindow > 1 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {(event.signals ?? []).map((signal: SecuritySignal) => (
                          <Chip
                            key={signal}
                            icon={AlertTriangle}
                            tone={
                              signal === "MULTIPLE_FAILED" || signal === "RAPID_RETRY" || signal === "IP_CHANGED"
                                ? "alert"
                                : "neutral"
                            }
                          >
                            {SIGNAL_LABEL[signal]}
                          </Chip>
                        ))}
                        {event.sameDeviceAsPrevious === false && !(event.signals ?? []).includes("NEW_DEVICE") ? (
                          <Chip icon={ArrowLeftRight}>Perangkat berbeda</Chip>
                        ) : null}
                        {event.sameIpAsPrevious === false && !(event.signals ?? []).includes("IP_CHANGED") ? (
                          <Chip icon={ArrowLeftRight}>IP berbeda</Chip>
                        ) : null}
                        {/* Badge kegagalan beruntun tetap tampil kalau belum
                            tercakup oleh sinyal `MULTIPLE_FAILED`. */}
                        {event.failedInWindow > 1 && !(event.signals ?? []).includes("MULTIPLE_FAILED") ? (
                          <Chip icon={AlertTriangle} tone="alert">
                            {event.failedInWindow}× gagal sebelumnya
                          </Chip>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : event._id)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="admin-btn admin-btn-quiet w-full shrink-0 gap-1 px-2.5 text-xs sm:w-auto"
                  >
                    {isOpen ? "Tutup" : "Lihat detail keamanan"}
                    <ChevronDown
                      className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                {/* Baris sendiri di bawah tombol detail, bukan di dalam baris
                    yang sama: pada 390px dua tombol bersebelahan memotong teks
                    keduanya. Lebar penuh di HP, otomatis menyempit di desktop. */}
                <div className="mt-2 flex flex-col items-stretch gap-1.5 sm:mt-0 sm:flex-row sm:items-center">
                  <SessionRevokeControl
                    attemptId={event._id}
                    sessionState={event.sessionState}
                    sessionRevokedAt={event.sessionRevokedAt}
                    deviceLabel={deviceLine}
                    loginAt={event.createdAt}
                    ipMasked={event.ipMasked}
                    onSelfRevoked={noop}
                  />
                </div>

                {isOpen ? (
                  <div id={panelId} className="space-y-2 border-t-2 border-[#121212] bg-[#FDFBF7] p-3 pl-5">
                    <p className="flex items-start gap-2 text-xs font-bold text-[#525252]">
                      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      Lokasi merupakan perkiraan berdasarkan IP dan tidak menunjukkan lokasi GPS
                      presisi. Tidak ada passcode, token, atau cookie yang tersimpan di sini.
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      <Group title="Autentikasi">
                        <Row label="Hasil">{meta.label}</Row>
                        <Row label="Alasan">
                          {event.failureReason ? describeFailure(event.failureReason) : "—"}
                        </Row>
                        <Row label="Akun">{value(event.emailMasked)}</Row>
                        <Row label="Percobaan ke-">{value(event.attemptNumber)}</Row>
                        <Row label="Status keamanan">{event.status}</Row>
                        <Row label="Percobaan dalam jendela">
                          {event.attemptsInWindow} total · {event.failedInWindow} gagal ·{" "}
                          {event.successfulInWindow} berhasil
                        </Row>
                      </Group>
                      <Group title="Jaringan">
                        <Row label="IP address">{value(event.ipMasked)}</Row>
                        <Row label="Keluarga IP">{value(event.ipFamily)}</Row>
                        <Row label="IP source">{describeIpSource(event.ipSource)}</Row>
                        <Row label="Kepercayaan sumber">
                          {event.ipTrust === "edge"
                            ? "Header edge/CDN tepercaya"
                            : event.ipTrust === "chain"
                              ? "Rantai proxy (X-Forwarded-For)"
                              : UNKNOWN_LABEL}
                        </Row>
                        <Row label="Proxy / CDN">
                          {event.proxyDetected ? "Terdeteksi" : "Tidak terdeteksi"}
                        </Row>
                        <Row label="Panjang rantai">{value(event.chainLength)}</Row>
                        <Row label="Riwayat IP">
                          {event.ipTotal} percobaan · {event.ipSuccessCount} berhasil ·{" "}
                          {event.ipFailureCount} gagal
                        </Row>
                        <Row label="IP pertama seen">
                          <TimeStampLabel timestamp={event.ipFirstSeenAt} withSeconds />
                        </Row>
                        <Row label="IP terakhir seen">
                          <TimeStampLabel timestamp={event.ipLastSeenAt} withSeconds />
                        </Row>
                        <Row label="Tipe jaringan">{value(event.networkType)}</Row>
                      </Group>
                      <Group title="Lokasi (perkiraan)">
                        <Row label="Lokasi perkiraan">{value(location)}</Row>
                        <Row label="Zona waktu">{value(event.timezone)}</Row>
                      </Group>
                      <Group title="Perangkat">
                        <Row label="Tipe">{value(event.deviceType)}</Row>
                        <Row label="Sistem operasi">{value(osLine)}</Row>
                        <Row label="Browser">{value(browserLine)}</Row>
                        <Row label="Platform">{value(event.platform)}</Row>
                        <Row label="User agent">{value(event.userAgent)}</Row>
                      </Group>
                      <Group title="Layar & input">
                        <Row label="Viewport">{value(event.viewport)}</Row>
                        <Row label="Device pixel ratio">{value(event.devicePixelRatio)}</Row>
                        <Row label="Titik sentuh">{value(event.touchPoints)}</Row>
                        <Row label="Locale">{value(event.locale)}</Row>
                        <Row label="Accept-Language">{value(event.acceptLanguage)}</Row>
                      </Group>
                      <Group title="Sesi & permintaan">
                        <Row label="Sidik sesi">
                          <span className="inline-flex items-center gap-1.5">
                            <Fingerprint className="size-4 shrink-0" aria-hidden="true" />
                            {value(event.sessionFingerprint)}
                          </span>
                        </Row>
                        <Row label="Request ID">{value(event.requestId)}</Row>
                        <Row label="Rute">{value(event.route)}</Row>
                        <Row label="Return To">{value(event.returnTo)}</Row>
                        <Row label="Referrer">{value(event.referrer)}</Row>
                      </Group>
                      <Group title="Aktivitas">
                        <Row label="Sesi aktif">
                          {event.sessionLive ? "Aktif sekarang" : "Tidak aktif"}
                        </Row>
                        <Row label="Login berhasil sebelumnya">
                          {event.previousSuccessAt ? (
                            <TimeStampLabel timestamp={event.previousSuccessAt} withSeconds />
                          ) : (
                            <span className="font-medium text-[#525252]">Tidak ada pada sesi ini</span>
                          )}
                        </Row>
                        <Row label="IP dibanding sebelumnya">
                          {compareLabel(event.sameIpAsPrevious, "IP sama", "IP berbeda")}
                        </Row>
                        <Row label="Perangkat dibanding sebelumnya">
                          {compareLabel(event.sameDeviceAsPrevious, "Perangkat sama", "Perangkat berbeda")}
                        </Row>
                      </Group>
                    </div>
                    <p className="flex items-start gap-2 text-xs font-bold text-[#525252]">
                      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      Panel ini hanya terbuka untuk peran pengelola yang sudah terdaftar di
                      server. Data diambil di server, bukan dari state browser.
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {page?.nextCursor || cursorPath.length > 1 ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {cursorPath.length > 1 ? (
            <button
              type="button"
              onClick={() => setCursorPath((path) => path.slice(0, -1))}
              className="admin-btn admin-btn-secondary inline-flex min-h-11"
            >
              Halaman sebelumnya
            </button>
          ) : null}
          {page?.nextCursor ? (
            <button
              type="button"
              onClick={() => setCursorPath((path) => [...path, page.nextCursor ?? undefined])}
              className="admin-btn admin-btn-secondary inline-flex min-h-11"
            >
              Muat lebih banyak
            </button>
          ) : null}
        </div>
      ) : null}

      {ipActivity && ipActivity.length > 0 ? (
        <section className="mt-4 border-t-2 border-[#121212] pt-3" aria-labelledby="aktivitas-ip">
          <h4
            id="aktivitas-ip"
            className="text-sm font-black uppercase tracking-[0.12em] text-[#525252]"
          >
            Aktivitas berdasarkan IP
          </h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-[#121212] text-left text-[0.7rem] uppercase tracking-[0.08em] text-[#525252]">
                  <th scope="col" className="py-1.5 pr-2">IP</th>
                  <th scope="col" className="py-1.5 pr-2">Percobaan</th>
                  <th scope="col" className="py-1.5 pr-2">Berhasil / Gagal</th>
                  <th scope="col" className="py-1.5 pr-2">Terakhir terlihat</th>
                  <th scope="col" className="py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {ipActivity.map((row: IpActivity) => (
                  <tr key={row.ipHash} className="border-b border-[#EDEAE0] align-top">
                    <td className="py-1.5 pr-2">
                      <span className="font-black text-[#1A1A1A]">{row.ipMasked ?? UNKNOWN_LABEL}</span>
                      <span className="ml-1 text-xs text-[#525252]">
                        {row.ipFamily ? `· ${row.ipFamily}` : ""}
                        {row.proxyDetected ? " · via proxy/CDN" : ""}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 font-bold">{row.attempts}</td>
                    <td className="py-1.5 pr-2 font-bold">
                      {row.success} / {row.failed}
                    </td>
                    <td className="py-1.5 pr-2 text-xs text-[#525252]">
                      <TimeStampLabel timestamp={row.lastSeenAt} withSeconds />
                    </td>
                    <td className="py-1.5">
                      {row.isNew ? (
                        <span className="border-2 border-[#121212] bg-[#FFE662] px-1.5 py-0.5 text-[0.7rem] font-black">
                          IP baru
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-[#525252]">Sudah pernah</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="mt-3 flex items-start gap-2 text-xs leading-6 text-[#525252]">
        <Globe className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Alamat IP dibaca di server dari header yang ditulis edge/CDN, bukan dari browser
        dan bukan dari layanan pihak ketiga. Sumber yang tidak bisa dipercaya
        ditulis <code className="font-black">Tidak terdeteksi</code>, tidak pernah ditebak.
        Lokasi hanya terisi bila operator mengonfigurasi penyedia geolokasi, dan
        menandai perkiraan jaringan, bukan lokasi GPS.
      </p>
    </article>
  );
}
