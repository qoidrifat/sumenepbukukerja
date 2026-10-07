// Gate kelengkapan data diri warga di dashboard.
//
// Tampil HANYA bila: sesi ada + bukan staf + status profil belum lengkap
// (nama + nomor terverifikasi + alamat). Tanpa tombol tutup, tanpa X, tanpa
// Esc, tanpa klik-luar — dan refresh tidak mengakalinya karena visibilitas
// murni mengikuti query server (realtime): selesai = hilang sendiri.
//
// Staf/pengelola dikecualikan: mereka tidak boleh terkunci dari kerja
// operasional oleh gate warga.
import { useEffect, useRef, useState } from "react";
import { motion, useAnimation, useReducedMotion } from "framer-motion";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useCurrentAccess } from "@/lib/catalog-store";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { focusRing } from "@/lib/focus-ring";
import { dashButtonClass } from "@/lib/dash-button-class";
import { publicInputClass } from "@/lib/public-field-classes";

/** Label kolom gaya Ruang Warga: kecil, huruf besar, jarak lebar. */
const fieldLabelClass =
  "text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-slate-500";

function toUserMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "string" && data.trim()) return data;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function ProfileCompletionGate() {
  const access = useCurrentAccess();
  const status = useQuery(api.profile.myProfileStatus, {});
  const requestInboundCode = useAction(api.profile.requestInboundCode);
  const saveMyProfile = useMutation(api.profile.saveMyProfile);

  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [inboundCode, setInboundCode] = useState("");
  const [chatUrl, setChatUrl] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneWarning, setPhoneWarning] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; address?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const shakeControls = useAnimation();
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bersihkan timer konfirmasi bila gate lepas sebelum redirect jalan.
  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  // Klik "Konfirmasi ke Admin": tombol diganti animasi ceklis searah jarum
  // jam + "Konfirmasi berhasil.", BARU dibuka WhatsApp-nya setelah animasi
  // terlihat. window.open di dalam timeout masih dalam jendela aktivasi
  // pengguna; bila pemblokir menggagalkannya (null), tautan manual tampil.
  // Klik ini JUGA membuka kunci Simpan (lihat `confirmed` di bawah).
  const [confirmBlocked, setConfirmBlocked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const handleConfirm = () => {
    if (!chatUrl || confirming) return;
    setConfirmBlocked(false);
    setConfirming(true);
    setConfirmed(true);
    confirmTimer.current = setTimeout(
      () => {
        const opened = window.open(chatUrl, "_blank", "noopener");
        if (!opened) setConfirmBlocked(true);
      },
      reduceMotion ? 400 : 1100,
    );
  };

  // Staf tidak digate; loading = belum tahu = jangan kunci siapa pun.
  if (access?.isStaff === true) return null;
  if (status === undefined) return null;
  if (status.complete) return null;

  const nameValue = name ?? status.name;
  const phoneValue = phone ?? status.phone;
  const addressValue = address ?? status.address;

  // Normalisasi lokal cermin `normalizeProfilePhone` server (modul server
  // tidak boleh diimpor ke bundel klien). Dipakai hanya untuk membandingkan
  // ketikan dengan nomor yang SUDAH terverifikasi.
  const normalizedPhone = phoneValue.replace(/\D/g, "").replace(/^0/, "62");
  // Tombol Simpan terkunci sampai form lengkap DAN (nomor terverifikasi
  // webhook ATAU pengguna sudah menekan Konfirmasi ke Admin). Server tetap
  // memvalidasi ulang (sumber kebenaran); kunci di sini murni UX supaya
  // tidak bisa diklik membabi-buta.
  const verifiedNow =
    status.phoneVerified && normalizedPhone !== "" && normalizedPhone === status.phone;
  const nameOk = nameValue.trim().length >= 2;
  const addressOk = addressValue.trim().length >= 5;
  const canSave = (verifiedNow || confirmed) && nameOk && addressOk && !saving;
  const saveHint = !(verifiedNow || confirmed)
    ? "Verifikasi dulu nomor WhatsApp lewat tombol Verifikasi di atas."
    : !nameOk
      ? "Isi nama lengkap (minimal 2 huruf)."
      : !addressOk
        ? "Isi alamat domisili (minimal 5 karakter)."
        : "";

  // Minta kode inbound: server hanya menerbitkan kode + tautan chat, tidak
  // mengirim apa pun. Pengguna mengirim kode dari nomornya ke WhatsApp
  // bisnis; webhook mencocokkan dan status realtime menutup gate sendiri.
  // Kolom nomor ketat angka: huruf ditolak dengan peringatan + getaran.
  // Simbol umum nomor (`+`, spasi, strip) dibersihkan diam-diam — hanya
  // HURUF yang memicu peringatan, sesuai permintaan eksplisit.
  const handlePhoneChange = (raw: string) => {
    if (/[a-zA-Z]/.test(raw)) {
      setPhoneWarning("Nomor WhatsApp harus diisi dengan angka.");
      if (!reduceMotion) {
        void shakeControls.start({
          x: [0, -8, 8, -6, 6, 0],
          transition: { duration: 0.35, ease: "easeOut" },
        });
      }
    } else {
      setPhoneWarning(null);
    }
    setPhone(raw.replace(/\D/g, ""));
    // Nomor diganti = kode yang tampil milik nomor lama; konfirmasi ikut gugur.
    setInboundCode("");
    setChatUrl("");
    setConfirming(false);
    setConfirmed(false);
    setConfirmBlocked(false);
    setFieldErrors((prev) => ({ ...prev, phone: undefined }));
    setError(null);
  };

  // Tombol Verifikasi sengaja TIDAK dikunci saat form kosong: klik paksa
  // justru cara pengguna tahu apa yang kurang — tiap kolom kosong mendapat
  // pesannya sendiri di bawahnya ("Isi ... terlebih dahulu").
  const handleSendCode = async () => {
    const missing: { name?: string; phone?: string; address?: string } = {};
    if (nameValue.trim() === "") missing.name = "Isi nama lengkap terlebih dahulu.";
    if (phoneValue.replace(/\D/g, "") === "") missing.phone = "Isi nomor WhatsApp terlebih dahulu.";
    if (addressValue.trim() === "") missing.address = "Isi alamat domisili terlebih dahulu.";
    setFieldErrors(missing);
    if (Object.keys(missing).length > 0) return;
    setError(null);
    setSending(true);
    try {
      const issued = await requestInboundCode({
        phone: phoneValue,
        name: nameValue,
        address: addressValue,
      });
      if (issued.code) {
        setInboundCode(issued.code);
        setChatUrl(issued.chatUrl);
      } else {
        setError(
          `Kode sebelumnya masih berlaku. Minta lagi dalam ${Math.max(1, Math.ceil(issued.retryAfterMs / 1000))} detik.`,
        );
      }
    } catch (caught) {
      setError(toUserMessage(caught, "Kode belum terbit. Coba lagi sebentar lagi."));
    } finally {
      setSending(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await saveMyProfile({
        name: nameValue,
        phone: phoneValue,
        address: addressValue,
      });
      // Berhasil = status server berbalik realtime, modal lepas sendiri.
    } catch (caught) {
      setError(toUserMessage(caught, "Data diri belum tersimpan. Periksa lagi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        overlayClassName="dash-dialog-overlay"
        className="dash-dialog-content max-w-[calc(100%-1.5rem)] overflow-hidden sm:max-w-md"
      >
        <div className="border-b border-slate-200/70 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="dash-icon dash-icon--blue" aria-hidden="true">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="dash-title text-lg">
                Lengkapi data diri
              </DialogTitle>
              <DialogDescription className="dash-sub mt-1.5 text-sm">
                Satu kali saja. Data ini dipakai agar pengelola bisa menghubungimu.
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="profil-nama" className={fieldLabelClass}>Nama lengkap</Label>
            <Input
              id="profil-nama"
              type="text"
              autoComplete="name"
              value={nameValue}
              placeholder={status.nameSuggestion || "Nama lengkap"}
              onChange={(event) => {
                setName(event.target.value);
                setFieldErrors((prev) => ({ ...prev, name: undefined }));
                setError(null);
              }}
              disabled={saving}
              className={publicInputClass}
            />
            {fieldErrors.name ? (
              <p role="alert" className="flex items-center gap-2 text-sm font-bold text-red-700">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                {fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="profil-nomor" className={fieldLabelClass}>Nomor WhatsApp</Label>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <motion.span animate={shakeControls} className="block">
                <Input
                  id="profil-nomor"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel"
                  value={phoneValue}
                  placeholder="08xxxxxxxxxx"
                  onChange={(event) => handlePhoneChange(event.target.value)}
                  disabled={saving || sending}
                  className={publicInputClass}
                />
              </motion.span>
              <button
                type="button"
                onClick={() => void handleSendCode()}
                disabled={sending || saving}
                className={dashButtonClass("secondary", `whitespace-nowrap ${focusRing}`)}
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Verifikasi
              </button>
            </div>
            {fieldErrors.phone ? (
              <p role="alert" className="flex items-center gap-2 text-sm font-bold text-red-700">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                {fieldErrors.phone}
              </p>
            ) : null}
            {phoneWarning ? (
              <motion.p
                role="alert"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex items-center gap-2 text-sm font-bold text-red-700"
              >
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                {phoneWarning}
              </motion.p>
            ) : null}
          </div>

          {inboundCode ? (
            <div className="rounded-2xl border border-blue-200/70 bg-blue-50/70 p-3.5">
              {!confirming ? (
                <>
                  <p className="text-sm leading-6 text-slate-700">
                    Kirim kode ini dari nomor WhatsApp di atas lewat tombol di bawah. Begitu
                    pesanmu sampai, verifikasi selesai sendiri — tidak perlu mengetik
                    apa pun di sini.
                  </p>
                  <p className="mt-2 text-center font-mono text-2xl font-black tabular-nums tracking-[0.2em] text-slate-950">
                    {inboundCode}
                  </p>
                </>
              ) : null}
              {confirming ? (
                <div className="mt-2 flex flex-col items-center gap-1.5 rounded-lg bg-white/70 px-3 py-3">
                  <svg
                    viewBox="0 0 80 80"
                    className="size-16 overflow-visible"
                    role="img"
                    aria-label="Konfirmasi berhasil"
                  >
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke="#E2E8F0"
                      strokeWidth="4"
                    />
                    <motion.circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke="#059669"
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      transform="rotate(-90 40 40)"
                      initial={reduceMotion ? { opacity: 0 } : { pathLength: 0 }}
                      animate={reduceMotion ? { opacity: 1 } : { pathLength: 1 }}
                      transition={reduceMotion ? { duration: 0 } : { duration: 0.7, ease: "easeOut" }}
                    />
                    <motion.path
                      d="M26 41.5L35.5 51L54 30.5"
                      fill="none"
                      stroke="#059669"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={reduceMotion ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : {
                              pathLength: { delay: 0.45, duration: 0.35, ease: [0.65, 0, 0.25, 1] },
                              opacity: { delay: 0.45, duration: 0.05 },
                            }
                      }
                    />
                  </svg>
                  <p className="text-sm font-extrabold text-emerald-700" role="status">
                    Konfirmasi berhasil.
                  </p>
                </div>
              ) : (
                chatUrl ? (
                  <button
                    type="button"
                    onClick={() => handleConfirm()}
                    className={`mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white transition-colors hover:bg-emerald-800 ${focusRing}`}
                  >
                    Konfirmasi ke Admin
                  </button>
                ) : null
              )}
              {confirmBlocked ? (
                <a
                  href={chatUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-extrabold text-emerald-800 transition-colors hover:bg-emerald-50 ${focusRing}`}
                >
                  Buka WhatsApp manual
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="profil-alamat" className={fieldLabelClass}>Alamat domisili</Label>
            <Input
              id="profil-alamat"
              type="text"
              autoComplete="street-address"
              value={addressValue}
              placeholder="Jl. Contoh No. 1, Sumenep"
              onChange={(event) => {
                setAddress(event.target.value);
                setFieldErrors((prev) => ({ ...prev, address: undefined }));
                setError(null);
              }}
              disabled={saving}
              className={publicInputClass}
            />
            {fieldErrors.address ? (
              <p role="alert" className="flex items-center gap-2 text-sm font-bold text-red-700">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                {fieldErrors.address}
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="flex items-center gap-2 text-sm font-bold text-red-700">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className={dashButtonClass("primary", `w-full text-base disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`)}
          >
            {saving ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            Simpan data diri
          </button>
          {!canSave && !saving ? (
            <p className="text-center text-xs font-semibold text-slate-500" role="status">
              {saveHint}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
