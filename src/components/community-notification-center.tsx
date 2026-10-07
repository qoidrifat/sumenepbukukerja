/**
 * Pusat notifikasi warga: preferensi kanal, nomor WhatsApp, dan log
 * pengiriman pesan uji.
 *
 * Dipisah dari `community-widgets.tsx` pada Fase 9.1 Pekerjaan 6. Panel ini
 * 326 baris dan tidak menyentuh apa pun milik daftar permintaan, papan paket,
 * atau galeri pemilik: memindahkannya berarti daftar permintaan tidak lagi
 * harus dibaca untuk mengubah preferensi notifikasi.
 *
 * Tanpa perubahan perilaku: komponen, props, dan isi JSX dipindah apa adanya.
 */
import { useState } from "react";
import { Bell, ShieldCheck } from "lucide-react";
import { focusRing } from "@/lib/focus-ring";
import { formatRelativeTime } from "@/lib/datetime";
import { FormField } from "@/components/form-field";
import { DashIcon } from "@/components/dashboard-ui";
import { formatConvexError } from "@/lib/whatsapp";
import {
  useCatalogActions,
  useCurrentAccess,
  useMyClaims,
  useNotificationPreferences,
  useNotifications,
  useWhatsappStatus,
  type NotificationPreferences,
} from "@/lib/catalog-store";

import { publicInputClass as inputClass } from "@/lib/public-field-classes";

/**
 * Label status pengiriman. Status berasal langsung dari webhook provider,
 * jadi daftar ini bukan pilihan tampilan: setiap nilai yang muncul di UI
 * harus punya kalimatnya di sini.
 */
const deliveryStatusLabel: Record<string, string> = {
  queued: "Menunggu",
  sent: "Terkirim",
  delivered: "Diterima",
  failed: "Gagal",
};

const deliveryStatusDot: Record<string, string> = {
  queued: "bg-amber-500",
  sent: "bg-blue-500",
  delivered: "bg-emerald-500",
  failed: "bg-red-500",
};

export function NotificationCenter() {
  const notifications = useNotifications();
  const preferences = useNotificationPreferences();
  const whatsappStatus = useWhatsappStatus();
  const claims = useMyClaims();
  // Diagnosis operator (nama env, kode provider, tombol uji, thread teknis)
  // hanya untuk pengelola. Default saat akses belum terjawab adalah warga:
  // lebih baik staf menunggu sekejap daripada info internal bocor sekilas.
  const access = useCurrentAccess();
  const isStaff = access?.isStaff === true;
  const {
    markNotificationsRead,
    setNotificationPreferences,
    sendTestWhatsapp,
    markWhatsappThreadRead,
  } = useCatalogActions();
  const [preferenceError, setPreferenceError] = useState("");
  const [whatsappPhoneDraft, setWhatsappPhoneDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testNotice, setTestNotice] = useState("");
  const [testFailed, setTestFailed] = useState(false);
  const unread = notifications?.filter((item) => !item.read).length ?? 0;
  const prefs: NotificationPreferences = preferences
    ? {
        whatsappUpdates: preferences.whatsappUpdates ?? false,
        areaUpdates: preferences.areaUpdates ?? false,
        requestUpdates: preferences.requestUpdates ?? false,
      }
    : { whatsappUpdates: false, areaUpdates: false, requestUpdates: false };

  const whatsappPhone =
    whatsappPhoneDraft ?? preferences?.whatsappPhone ?? "";

  const toggle = async (
    key: "whatsappUpdates" | "areaUpdates" | "requestUpdates",
  ) => {
    setPreferenceError("");
    setSaving(true);
    try {
      if (key === "whatsappUpdates") {
        await setNotificationPreferences({
          whatsappUpdates: !prefs.whatsappUpdates,
          whatsappPhone,
        });
      } else {
        await setNotificationPreferences({ [key]: !prefs[key] });
      }
    } catch (caught) {
      setPreferenceError(
        caught instanceof Error
          ? caught.message
          : "Preferensi belum dapat disimpan.",
      );
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setPreferenceError("");
    setTestNotice("");
    setTestFailed(false);
    setSaving(true);
    try {
      await sendTestWhatsapp({});
      setTestNotice("Pesan uji berhasil dikirim ke nomor WhatsApp.");
    } catch (caught) {
      setTestFailed(true);
      setTestNotice(
        formatConvexError(caught, "Pesan uji belum dapat dikirim."),
      );
    } finally {
      setSaving(false);
    }
  };

  const markThreadRead = async () => {
    setSaving(true);
    try {
      await markWhatsappThreadRead({});
    } catch (caught) {
      setPreferenceError(
        formatConvexError(caught, "Pesan masuk belum dapat ditandai dibaca."),
      );
    } finally {
      setSaving(false);
    }
  };

  const verifiedClaims = (claims ?? []).filter((claim) => claim.status === "verified");
  const pendingClaims = (claims ?? []).filter((claim) => claim.status === "pending");

  return (
    <section className="dash-panel p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DashIcon tone="amber" className="relative">
            <Bell className="size-5" aria-hidden="true" />
            {unread > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black tabular-nums text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </DashIcon>
          <div>
            <p className="dash-eyebrow">
              Pemberitahuan
            </p>
            <h2 className="dash-title mt-2 text-xl">
              Yang perlu Anda tahu
            </h2>
          </div>
        </div>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => void markNotificationsRead({})}
            className={`min-h-12 rounded-lg px-3 text-sm font-extrabold text-blue-700 hover:bg-blue-50 ${focusRing}`}
          >
            Tandai dibaca
          </button>
        ) : null}
      </div>

      <p className="dash-sub mt-3 text-sm">
        Notifikasi bersifat opt-in dan dibatasi maksimal tiga pesan WhatsApp per
        hari.{" "}
        {isStaff
          ? whatsappStatus === undefined
            ? "Status pengiriman sedang dimuat."
            : whatsappStatus.configured
              ? `Pengiriman memakai ${whatsappStatus.provider === "meta" ? "Meta Cloud API" : "Twilio"}, dan status percakapan masuk dibaca otomatis lewat webhook.`
              : "WhatsApp Business API belum dikonfigurasi; preferensi tetap dapat disimpan."
          : "Aktifkan kanal yang Anda butuhkan di bawah."}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {(
          [
            ["whatsappUpdates", "WhatsApp"],
            ["areaUpdates", "Info area (dalam aplikasi)"],
            ["requestUpdates", "Permintaan baru (dalam aplikasi)"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className={`flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 transition-colors has-checked:border-blue-300 has-checked:bg-blue-50/60 ${saving ? "opacity-70" : ""}`}
          >
            <span className="text-sm font-bold text-slate-700">{label}</span>
            <input
              type="checkbox"
              checked={prefs[key]}
              disabled={saving}
              onChange={() => void toggle(key)}
              aria-label={label}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 shadow-inner transition-colors duration-200 ease-out peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white motion-safe:transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 after:ease-out after:content-[''] motion-safe:after:transition-transform peer-checked:after:translate-x-5"
            />
          </label>
        ))}
      </div>

      {/* LABEL TIDAK LAGI MEMBUNGKUS KOLOM INI. Sebelumnya <label> membungkus
          <div> yang isinya input DAN tombol "Kirim pesan uji", dan menekan
          tombol itu ikut memicu fokus kolom - tombol yang
          mengirim pesan uji, bukan kolom yang diisi pengguna. Asosiasi
          implisit tidak bisa menyatakan "kolom ini saja" tanpa htmlFor. */}
      <FormField
        label="Nomor WhatsApp untuk notifikasi"
        className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5"
        control={({ id, describedBy }) => (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              id={id}
              aria-describedby={describedBy}
              type="tel"
              inputMode="tel"
              value={whatsappPhone}
              onChange={(event) => setWhatsappPhoneDraft(event.target.value)}
              placeholder="08xxxxxxxxxx atau 62xxxxxxxxxx"
              className={inputClass}
              autoComplete="tel"
            />
            {/* Kirim uji adalah alat diagnosis pengelola, bukan warga: saat
                template operator belum dikonfigurasi, kegagalan 131008 tampil
                sebagai kesalahan warga padahal itu salah konfigurasi server. */}
            {isStaff ? (
              <button
                type="button"
                disabled={saving || !prefs.whatsappUpdates || !whatsappStatus?.configured}
                onClick={() => void sendTest()}
                className={`min-h-12 rounded-lg bg-slate-900 px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
              >
                {saving ? "Memproses..." : "Kirim pesan uji"}
              </button>
            ) : null}
          </div>
        )}
      />

      {whatsappStatus?.recent?.length ? (
        <div className="mt-3">
          <p className="text-sm font-extrabold text-slate-800">
            Status pengiriman terakhir
          </p>
          <ul className="mt-2 space-y-1.5">
            {whatsappStatus.recent.map((item) => (
              <li
                key={item.deliveryKey}
                className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className={`size-2.5 shrink-0 rounded-full ${deliveryStatusDot[item.status] ?? "bg-slate-300"}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
                  {item.title}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-xs font-extrabold text-slate-700">
                    {deliveryStatusLabel[item.status] ?? item.status}
                  </span>
                  {item.updatedAt ? (
                    <span className="text-[11px] font-semibold text-slate-400">
                      {formatRelativeTime(item.updatedAt)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {whatsappStatus?.thread ? (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-slate-900">
              Balasan WhatsApp terakhir
            </p>
            {whatsappStatus.thread.unread ? (
              <button
                type="button"
                onClick={() => void markThreadRead()}
                className={`min-h-10 rounded-lg border border-blue-200 bg-white px-3 text-xs font-extrabold text-blue-700 hover:bg-blue-100 ${focusRing}`}
              >
                Tandai dibaca
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            {whatsappStatus.thread.lastInboundBody ||
              "Pesan masuk tanpa teks."}
          </p>
        </div>
      ) : null}

      {verifiedClaims.length > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Identitas terverifikasi untuk {verifiedClaims.map((claim) => claim.vendorName).join(", ")}.
            Anda boleh mengubah, mengarsipkan, dan mengelola listing.
          </span>
        </div>
      ) : pendingClaims.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          <p>
            Klaim {pendingClaims.map((claim) => claim.vendorName).join(", ")} sedang
            diperiksa pengelola. Anda boleh menyunting draft, tapi belum bisa
            mengubah listing yang sudah tayang sampai klaim disetujui.
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-extrabold text-amber-900">
            Verifikasi identitas usaha
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            Untuk mengelola listing yang sudah tayang, ajukan klaim di section
            &ldquo;Kelola listing Anda&rdquo; dengan nomor WhatsApp, email, alamat
            usaha, dan foto bukti. Pengelola akan memeriksa sebelum Anda bisa
            mengubah, mengarsipkan, atau menambahkan paket.
          </p>
          <a
            href="/dashboard#listing-saya"
            className={`mt-3 inline-flex min-h-12 items-center rounded-lg bg-amber-600 px-4 text-sm font-extrabold text-white hover:bg-amber-700 ${focusRing}`}
          >
            Buka kelola listing
          </a>
        </div>
      )}

      {preferenceError ? (
        <p className="mt-2 text-sm font-bold text-red-700" role="alert">
          {preferenceError}
        </p>
      ) : null}
      {testNotice ? (
        <p
          className={`mt-2 rounded-lg p-3 text-sm font-bold leading-6 ${testFailed ? "border border-red-200 bg-red-50 text-red-800" : "text-blue-700"}`}
          role={testFailed ? "alert" : "status"}
        >
          {testNotice}
        </p>
      ) : null}

      {notifications && notifications.length > 0 ? (
        <div className="mt-4 space-y-2">
          {notifications.slice(0, 5).map((item) => (
            <div
              key={item._id}
              className={`rounded-lg border p-3 ${item.read ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50"}`}
            >
              <p className="text-sm font-extrabold tracking-[-0.01em] text-slate-900">{item.title}</p>
              <p className="dash-sub mt-1 text-sm leading-5">{item.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="dash-sub mt-4 text-sm">
          Belum ada notifikasi. Pilihan di atas bisa diubah kapan saja.
        </p>
      )}
    </section>
  );
}
