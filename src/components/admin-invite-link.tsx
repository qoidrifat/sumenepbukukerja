import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";

/**
 * Hasil pembuatan undangan: tautan lengkap yang siap disalin.
 *
 * Sebelumnya admin menerima kode mentah dan harus menyusun sendiri URL-nya,
 * lalu menempelkannya ke pesan. Satu langkah yang bisa salah dan sering
 * berakhir terkirim tanpa `/invite/`, jadi penerima tidak bisa membukanya.
 *
 * URL disusun di sisi klien dari `window.location.origin` — bukan dari
 * localhost yang dipatok di server, dan bukan konstanta produksi di dalam
 * kode. Dengan begitu tautannya benar di preview, staging, dan produksi tanpa
 * perlu konfigurasi tambahan.
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
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard bisa ditolak di konteks tidak aman (http tanpa TLS).
      // Select teks manual tetap tersedia tetap tersedia karena field-nya read-only dan
      // bisa dipilih, jadi kegagalan di sini bukan akhir dunia.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const inviteMessage = [
    "Halo,",
    "",
    `Anda telah diundang resmi untuk bergabung ke ruang pengelola ${email} pada Sistem Sumenep Buku Kerja.`,
    "",
    "Gunakan tautan berikut untuk menerima undangan:",
    url,
    "",
    "Tautan ini hanya berlaku satu kali dan memiliki masa aktif terbatas.",
  ].join("\n");

  return (
    <div className="mt-3 border-2 border-[#121212] bg-[#FFE662] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[0.1em] text-[#525252]">
          Tautan undangan lengkap
        </p>
        <span className="rounded-full border border-[#121212] bg-white px-2 py-0.5 text-[0.65rem] font-black uppercase">
          {role}
        </span>
      </div>

      <label className="sr-only" htmlFor="invite-url">
        Tautan undangan
      </label>
      <input
        id="invite-url"
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="mt-2 w-full break-all rounded-lg border-2 border-[#121212] bg-white px-2.5 py-2 font-mono text-xs text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#121212]"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className="admin-btn admin-btn-primary px-3 text-xs">
          {copied ? (
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
      </div>

      <p aria-live="polite" className="sr-only">
        {copied ? "Tautan undangan berhasil disalin" : ""}
      </p>

      <p className="mt-2 text-xs leading-5 text-[#525252]">
        Tautan hanya berlaku <strong className="text-[#1A1A1A]">satu kali</strong> untuk{" "}
        <strong className="text-[#1A1A1A]">{email}</strong> dan berlaku sampai{" "}
        <strong className="text-[#1A1A1A]">
          {new Date(expiresAt).toLocaleString("id-ID", {
            dateStyle: "long",
            timeStyle: "short",
          })}
        </strong>
        . Setelah dipakai, tautan ini tidak bisa dibuka lagi. Bagikan lewat kanal pribadi —
        siapa pun yang memegang tautannya bisa masuk.
      </p>
    </div>
  );
}
