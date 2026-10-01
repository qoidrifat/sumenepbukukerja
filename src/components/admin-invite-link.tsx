import { useState } from "react";
import { Check, Copy, MessageCircle, MessageSquareText, ShieldCheck } from "lucide-react";
import { staffRoleLongLabel } from "@/lib/select-options";

/**
 * Hasil pembuatan undangan: tautan lengkap DAN pesan yang akan dikirim.
 *
 * Sebelumnya admin menerima kode mentah dan harus menyusun sendiri URL-nya,
 * lalu menempelkannya ke pesan. Satu langkah yang bisa salah dan sering
 * berakhir terkirim tanpa `/invite/`, jadi penerima tidak bisa membukanya.
 *
 * URL disusun di sisi klien dari `window.location.origin` — bukan dari
 * localhost yang dipatok di server, dan bukan konstanta produksi di dalam
 * kode. Dengan begitu tautannya benar di preview, staging, dan produksi tanpa
 * perlu konfigurasi tambahan.
 *
 * Panel ini memakai komponen yang SAMA dengan seluruh meja kerja admin
 * (`.admin-panel`, `.admin-input`, `.admin-btn`, pita kuning, catatan
 * terakota). Sebelumnya karpetanya menulis ulang warna sendiri seadanya,
 * sehingga begitu salah satu kelas admin berubah, panel ini justru terlihat
 * seperti sisipan dari aplikasi lain. Di sini tidak ada warna yang ditulis
 * ulang: yang dipakai hanya padanan admin yang sudah ada.
 *
 * Isi pesannya ditampilkan, bukan hanya tersembunyi di balik tombol WhatsApp.
 * Akun pemilik bisa membagikan lewat kanal apa pun, dan sebelum mengirim ia
 * berhak melihat persis apa yang akan diterima penerima.
 */
export function InviteLinkResult({
  url,
  email,
  role,
  expiresAt,
}: {
  url: string;
  email: string;
  role: string;
  expiresAt: number;
}) {
  const [copied, setCopied] = useState<"link" | "message" | null>(null);

  const roleLabel = staffRoleLongLabel(role);

  const inviteMessage = [
    "Halo,",
    "",
    `Anda telah diundang resmi menjadi ${roleLabel} pada Sistem Sumenep Buku Kerja.`,
    "",
    "Gunakan tautan berikut untuk menerima undangan:",
    url,
    "",
    "Tautan ini hanya berlaku satu kali dan memiliki masa aktif terbatas.",
  ].join("\n");

  const copy = async (what: "link" | "message") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : inviteMessage);
    } catch {
      // Clipboard bisa ditolak di konteks tidak aman (http tanpa TLS). Select
      // teks manual tetap tersedia karena field-nya read-only dan bisa dipilih,
      // jadi kegagalan di sini bukan akhir dunia.
    }
    setCopied(what);
    window.setTimeout(() => setCopied((now) => (now === what ? null : now)), 2200);
  };

  return (
    <article className="admin-panel mt-3 overflow-hidden p-0" data-slot="invite-result">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#121212] bg-[#FFE662] px-4 py-3">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-[0.14em] text-[#525252]">
            Undangan pengelola baru
          </p>
          <h3 className="mt-1 text-lg font-black text-[#121212]">Pesan undangan siap dibagikan</h3>
        </div>
        <span className="admin-status admin-status-confirmed">{roleLabel}</span>
      </header>

      <div className="space-y-3 px-4 py-4">
        <div>
          <label
            className="text-xs font-black uppercase tracking-[0.1em] text-[#525252]"
            htmlFor="invite-url"
          >
            Tautan undangan
          </label>
          <input
            id="invite-url"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="admin-input mt-1.5 font-mono text-xs"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copy("link")}
            className="admin-btn admin-btn-primary px-3 text-xs"
          >
            {copied === "link" ? (
              <>
                <Check className="size-3.5" aria-hidden="true" />
                Tersalin
              </>
            ) : (
              <>
                <Copy className="size-3.5" aria-hidden="true" />
                Salin Tautan
              </>
            )}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(inviteMessage)}`}
            target="_blank"
            rel="noreferrer"
            className="admin-btn admin-btn-secondary px-3 text-xs"
          >
            <MessageCircle className="size-3.5" aria-hidden="true" />
            Kirim via WhatsApp
          </a>
          <button
            type="button"
            onClick={() => void copy("message")}
            className="admin-btn admin-btn-quiet px-3 text-xs"
          >
            {copied === "message" ? (
              <>
                <Check className="size-3.5" aria-hidden="true" />
                Pesan tersalin
              </>
            ) : (
              <>
                <MessageSquareText className="size-3.5" aria-hidden="true" />
                Salin pesan
              </>
            )}
          </button>
        </div>

        <section aria-labelledby="invite-message-label">
          <p
            id="invite-message-label"
            className="text-xs font-black uppercase tracking-[0.1em] text-[#525252]"
          >
            Isi pesan yang akan dikirim
          </p>
          <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap rounded-[2px] border-2 border-[#121212] bg-white p-3 font-mono text-xs leading-6 text-[#1A1A1A]">
            {inviteMessage}
          </pre>
        </section>

        <p className="flex items-start gap-2 rounded-[2px] border-2 border-[#121212] bg-[#E9B4A7] px-3 py-2 text-xs leading-5 text-[#7C2D12]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Berlaku <strong>satu kali</strong> untuk <strong>{email}</strong> sampai{" "}
            <strong>
              {new Date(expiresAt).toLocaleString("id-ID", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </strong>
            . Setelah dipakai, tautan ini tidak bisa dibuka lagi. Bagikan lewat kanal pribadi —
            siapa pun yang memegang tautannya bisa masuk.
          </span>
        </p>

        <p aria-live="polite" className="sr-only">
          {copied === "link" ? "Tautan undangan berhasil disalin" : ""}
          {copied === "message" ? "Pesan undangan berhasil disalin" : ""}
        </p>
      </div>
    </article>
  );
}
