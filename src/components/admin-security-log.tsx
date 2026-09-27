import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  Fingerprint,
  Globe,
  Info,
  Lock,
  MapPin,
  Monitor,
  Radio,
  ShieldCheck,
  ShieldX,
  Smartphone,
} from "lucide-react";

import { TimeStampLabel } from "@/components/admin-workspace";
import { useAdminSecurityEvents, useAdminSecuritySummary } from "@/lib/catalog-store";
import { UNKNOWN_LABEL, describeFailure } from "@/lib/security-context";
import { formatRelativeTime } from "@/lib/datetime";

type SecurityEvent = NonNullable<ReturnType<typeof useAdminSecurityEvents>>[number];

const OUTCOME_FILTERS = [
  { value: "all", label: "Semua" },
  { value: "success", label: "Berhasil" },
  { value: "failed", label: "Gagal" },
  { value: "locked", label: "Terkunci" },
] as const;

const WINDOW_FILTERS = [
  { value: "all", label: "Semua waktu" },
  { value: "24h", label: "24 jam" },
] as const;

const outcomeMeta = (outcome: SecurityEvent["outcome"]) => {
  if (outcome === "success") {
    return {
      label: "Berhasil",
      tone: "border-emerald-300 bg-emerald-50 text-emerald-900",
      Icon: ShieldCheck,
    };
  }
  if (outcome === "locked") {
    return { label: "Terkunci", tone: "border-red-400 bg-red-50 text-red-900", Icon: ShieldX };
  }
  return {
    label: "Gagal",
    tone: "border-amber-400 bg-amber-50 text-amber-900",
    Icon: AlertTriangle,
  };
};

const statusTone: Record<string, string> = {
  Normal: "border-[#121212] bg-white text-[#1A1A1A]",
  "Rate limited": "border-[#121212] bg-[#FFE662] text-[#1A1A1A]",
  Blocked: "border-[#121212] bg-[#E9B4A7] text-[#7C2D12]",
};

const deviceIcon = (deviceType: string | null) =>
  deviceType === "Mobile" || deviceType === "Tablet" ? Smartphone : Monitor;

/** Nilai boleh kosong, tapi tidak pernah menampilkan "undefined" atau tebakan. */
const value = (input: string | number | null | undefined) => {
  if (input === null || input === undefined || input === "") return UNKNOWN_LABEL;
  return String(input);
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[#EDEAE0] py-1.5 last:border-b-0 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-xs font-black uppercase tracking-[0.08em] text-[#525252] sm:w-40">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm font-bold text-[#1A1A1A]">{children}</dd>
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
    tone === "orange" ? "bg-[#FF5A26] text-white" : "bg-[#121212] text-white";
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
  const events = useAdminSecurityEvents(50);
  const summary = useAdminSecuritySummary();
  const [outcomeFilter, setOutcomeFilter] = useState<(typeof OUTCOME_FILTERS)[number]["value"]>("all");
  const [windowFilter, setWindowFilter] = useState<(typeof WINDOW_FILTERS)[number]["value"]>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  // Waktu cutoff diambil di efek, bukan saat render, supaya filter "24 jam"
  // tidak memanggil fungsi impure di jalur render. Sebelum efek berjalan,
  // `now` masih 0 sehingga semua baris tampil — tidak ada data yang hilang.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);

  const visible = useMemo(() => {
    const rows = events ?? [];
    const since = windowFilter === "24h" && now > 0 ? now - 24 * 60 * 60_000 : 0;
    return rows.filter(
      (row) =>
        (outcomeFilter === "all" || row.outcome === outcomeFilter) &&
        (since === 0 || row.createdAt >= since),
    );
  }, [events, outcomeFilter, windowFilter, now]);

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
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Total tercatat", value: summary.total, tone: "bg-white text-[#1A1A1A]" },
            { label: "Berhasil 24 jam", value: summary.succeeded24h, tone: "bg-[#DCEBD7] text-[#24533A]" },
            { label: "Gagal 24 jam", value: summary.failed24h, tone: "bg-[#FFE662] text-[#1A1A1A]" },
            { label: "Terkunci 24 jam", value: summary.locked24h, tone: "bg-[#E9B4A7] text-[#7C2D12]" },
          ].map((card) => (
            <div key={card.label} className={`border-2 border-[#121212] p-2.5 ${card.tone}`}>
              <dt className="text-xs font-bold uppercase tracking-[0.08em] opacity-80">{card.label}</dt>
              <dd className="mt-0.5 text-2xl font-black leading-none">{card.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {OUTCOME_FILTERS.map((filter) => (
          <FilterButton
            key={filter.value}
            active={outcomeFilter === filter.value}
            label={filter.label}
            tone="ink"
            onClick={() => setOutcomeFilter(filter.value)}
          />
        ))}
        <span className="mx-1 hidden h-6 w-0.5 bg-[#D6D3D1] sm:block" aria-hidden="true" />
        {WINDOW_FILTERS.map((filter) => (
          <FilterButton
            key={filter.value}
            active={windowFilter === filter.value}
            label={filter.label}
            tone="orange"
            onClick={() => setWindowFilter(filter.value)}
          />
        ))}
        <span className="ml-auto text-xs font-black text-[#525252]">
          Menampilkan {visible.length} dari {events?.length ?? 0} percobaan
        </span>
      </div>

      {!events ? (
        <p className="mt-3 text-sm text-[#525252]">Memuat jejak percobaan...</p>
      ) : visible.length === 0 ? (
        <p className="mt-3 text-sm text-[#525252]">
          {events.length === 0
            ? "Belum ada percobaan tercatat."
            : "Tidak ada percobaan yang cocok dengan filter ini."}
        </p>
      ) : (
        <ol className="mt-3 max-h-[32rem] space-y-2 overflow-auto pr-1">
          {visible.map((event) => {
            const meta = outcomeMeta(event.outcome);
            const StatusIcon = meta.Icon;
            const DeviceIcon = deviceIcon(event.deviceType);
            const isOpen = expanded === event._id;
            const location = [event.city, event.region, event.country].filter(Boolean).join(", ");
            const osLine = [event.os, event.osVersion].filter(Boolean).join(" ");
            const browserLine = [event.browser, event.browserVersion].filter(Boolean).join(" ");
            return (
              <li key={event._id} className={`border-2 ${meta.tone}`}>
                <div className="flex flex-wrap items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-black">
                      <StatusIcon className="size-4 shrink-0" aria-hidden="true" />
                      {meta.label}
                      <span className="font-bold">
                        <TimeStampLabel timestamp={event.createdAt} withSeconds />
                      </span>
                      {event.sessionLive ? (
                        <span className="inline-flex items-center gap-1 border border-[#121212] bg-[#DCEBD7] px-1.5 py-0.5 text-[0.7rem] font-black text-[#24533A]">
                          <Radio className="size-3" aria-hidden="true" />
                          Aktif sekarang
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                      <span className="inline-flex items-center gap-1">
                        <DeviceIcon className="size-4 shrink-0" aria-hidden="true" />
                        {[osLine, browserLine, event.deviceType].filter(Boolean).join(" · ") ||
                          UNKNOWN_LABEL}
                      </span>
                      {location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-4 shrink-0" aria-hidden="true" />
                          {location}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-[#525252]">
                      IP {value(event.ipMasked)} · {value(event.ipSource)}
                      {event.attemptNumber ? ` · percobaan ke-${event.attemptNumber}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex border-2 px-2 py-0.5 text-xs font-black ${
                        statusTone[event.status] ?? statusTone.Normal
                      }`}
                    >
                      {event.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : event._id)}
                      aria-expanded={isOpen}
                      className="inline-flex min-h-10 items-center gap-1 border-2 border-[#121212] bg-white px-2.5 text-xs font-black hover:bg-[#F1EDE3]"
                    >
                      {isOpen ? "Tutup" : "Lihat detail keamanan"}
                      <ChevronDown
                        className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="space-y-2 border-t-2 border-[#121212] bg-[#FDFBF7] p-3">
                    <p className="flex items-start gap-2 text-xs font-bold text-[#525252]">
                      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      Lokasi merupakan perkiraan berdasarkan IP dan tidak menunjukkan lokasi GPS
                      presisi. Tidak ada passcode, token, atau cookie yang tersimpan di sini.
                    </p>
                    <div className="grid gap-2 lg:grid-cols-2">
                      <Group title="Jaringan">
                        <Row label="IP address">{value(event.ipMasked)}</Row>
                        <Row label="IP source">{value(event.ipSource)}</Row>
                        <Row label="Tipe jaringan">{value(event.networkType)}</Row>
                      </Group>
                      <Group title="Lokasi (perkiraan)">
                        <Row label="Negara">{value(event.country)}</Row>
                        <Row label="Wilayah">{value(event.region)}</Row>
                        <Row label="Kota">{value(event.city)}</Row>
                        <Row label="Zona waktu">{value(event.timezone)}</Row>
                      </Group>
                      <Group title="Perangkat">
                        <Row label="Tipe">{value(event.deviceType)}</Row>
                        <Row label="Sistem operasi">{value(osLine)}</Row>
                        <Row label="Browser">{value(browserLine)}</Row>
                        <Row label="Platform">{value(event.platform)}</Row>
                        <Row label="Viewport">{value(event.viewport)}</Row>
                        <Row label="Device pixel ratio">
                          {value(event.devicePixelRatio)}
                        </Row>
                        <Row label="Titik sentuh">{value(event.touchPoints)}</Row>
                      </Group>
                      <Group title="Bahasa">
                        <Row label="Locale">{value(event.locale)}</Row>
                        <Row label="Accept-Language">{value(event.acceptLanguage)}</Row>
                        <Row label="User agent">{value(event.userAgent)}</Row>
                      </Group>
                      <Group title="Sesi & permintaan">
                        <Row label="Sesi">
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
                      <Group title="Autentikasi">
                        <Row label="Hasil">{meta.label}</Row>
                        <Row label="Alasan">
                          {event.failureReason ? describeFailure(event.failureReason) : "—"}
                        </Row>
                        <Row label="Akun">{value(event.emailMasked)}</Row>
                        <Row label="Status keamanan">{event.status}</Row>
                        <Row label="Percobaan dalam jendela">
                          {event.attemptsInWindow} total · {event.failedInWindow} gagal ·{" "}
                          {event.successfulInWindow} berhasil
                        </Row>
                      </Group>
                      <Group title="Aktivitas & perbandingan">
                        <Row label="Sesi aktif">
                          {event.sessionLive ? "Aktif sekarang" : "Tidak aktif"}
                        </Row>
                        <Row label="Login berhasil sebelumnya">
                          {event.previousSuccessAt ? (
                            <TimeStampLabel timestamp={event.previousSuccessAt} withSeconds />
                          ) : (
                            "Tidak ada pada sesi ini"
                          )}
                        </Row>
                        <Row label="IP dibanding sebelumnya">
                          {event.sameIpAsPrevious === null
                            ? "Tidak ada pembanding"
                            : event.sameIpAsPrevious
                              ? "IP sama"
                              : "IP berbeda"}
                        </Row>
                        <Row label="Perangkat dibanding sebelumnya">
                          {event.sameDeviceAsPrevious === null
                            ? "Tidak ada pembanding"
                            : event.sameDeviceAsPrevious
                              ? "Perangkat sama"
                              : "Perangkat berbeda"}
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

      <p className="mt-3 flex items-start gap-2 text-xs leading-6 text-[#525252]">
        <Globe className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Header IP hanya terbaca lewat jalur HTTP, jadi <code className="font-black">IP source</code>{" "}
        dapat bernilai <code className="font-black">Unknown</code> bila permintaan tidak melewati
        proxy atau CDN. Lokasi hanya terisi bila operator mengonfigurasi penyedia geolokasi.
      </p>
    </article>
  );
}
