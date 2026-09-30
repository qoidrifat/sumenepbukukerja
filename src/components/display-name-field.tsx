/**
 * Kolom "nama tampilan" untuk warga.
 *
 * FASE 9.2 - F-05. Aturan turunannya menghasilkan tebakan yang benar untuk
 * email berpemisah, dan tebakan yang kasar untuk email yang dirangkai
 * (`ahmanuddinfirman92` -> "Ahmanuddinfirman"). Komponen ini adalah tempat
 * koreksi itu terjadi, dan itu sebabnya komponen ini ada: tanpa kolom ini,
 * tebakan yang kasar akan selamanya jadi nama publik pengguna.
 *
 * Prinsip yang dipegang di sini:
 *  - Nama yang TERSIMPAN menang atas tebakan. Kalau tidak, koreksi hilang.
 *  - Isian tidak pernah kosong. Nama publik yang kosong membuat kartu papan
 *    kehilangan konteks dan terlihat rusak.
 *  - Sifatnya opsional dan tidak menghalangi. Tidak ada alur yang gagal
 *    karena kolom ini belum diisi.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";

import { useDisplayNameActions, useMyDisplayName } from "@/lib/catalog-store";
import { DISPLAY_NAME_MAX } from "@/lib/display-name";
import { focusRing } from "@/components/display-controls";
import { TextField } from "@/components/form-field";
import { publicInputClass } from "@/lib/public-field-classes";

export function DisplayNameField() {
  const current = useMyDisplayName();
  const { ensureDisplayName, setDisplayName } = useDisplayNameActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  // Nilai diambil sebagai primitif, bukan objek query. Dengan begitu daftar
  // dependensi berisi nilai, bukan objek yang identitasnya berubah tiap
  // render - dan aturan exhaustive-deps tidak perlu dinonaktifkan.
  const shown = current?.current ?? "";
  const stored = current?.publicName ?? null;

  // Cache tebakan sekali setelah nama tersedia. Idempoten di server: kalau
  // sudah ada nilainya, server tidak melakukan apa-apa.
  //
  // `cached` dipakai supaya pemanggilan tetap SEKALI per kunjungan, bukan
  // setiap render. Tanpa itu, `useMutation` yang identitasnya berubah tiap
  // render akan membuat efek ini berputar dan server dipanggil berulang.
  const cached = useRef(false);
  useEffect(() => {
    if (cached.current) return;
    if (!shown || stored) return;
    cached.current = true;
    void ensureDisplayName().catch(() => {
      // Gagal menyimpan hanya memastikan nama dihitung ulang lain kali.
      // Nama tetap tampil karena papan memanggilnya langsung.
    });
  }, [shown, stored, ensureDisplayName]);

  if (!shown) return null;

  const start = () => {
    setDraft(shown);
    setNotice("");
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    setNotice("");
    try {
      const applied = await setDisplayName({ name: draft });
      setNotice(applied ? `Tersimpan sebagai "${applied}".` : "Nama tampilan belum tersimpan.");
      setEditing(false);
    } catch (caught) {
      // Server menjawab dengan nilai yang benar-benar bisa dipakai, jadi
      // pesannya langsung bisa ditindaklanjuti.
      setNotice(caught instanceof Error ? caught.message : "Nama tampilan belum dapat disimpan.");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <section
        aria-labelledby="nama-tampilan-judul"
        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="nama-tampilan-judul" className="text-sm font-extrabold text-slate-800">
              Nama Anda di papan permintaan
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-950">{shown}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Nama ini yang dilihat warga lain. Nama akun Anda tidak ditampilkan di sana.
            </p>
          </div>
          <button
            type="button"
            onClick={start}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-extrabold text-slate-700 ${focusRing}`}
          >
            <Pencil className="size-4" aria-hidden="true" />
            Ubah
          </button>
        </div>
        {notice ? (
          <p className="mt-2 text-sm font-bold text-slate-700" role="status">
            {notice}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="nama-tampilan-judul" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h2 id="nama-tampilan-judul" className="text-sm font-extrabold text-slate-800">
        Nama Anda di papan permintaan
      </h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Dipakai untuk membeda permintaan antarwarga. Maksimal {DISPLAY_NAME_MAX} huruf.
      </p>
      <div className="mt-3">
        <TextField
          label="Nama tampilan"
          value={draft}
          onValueChange={setDraft}
          controlClassName={publicInputClass}
          maxLength={DISPLAY_NAME_MAX}
          hint={`Sekarang tampil sebagai "${shown}".`}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-extrabold text-white disabled:opacity-50 ${focusRing}`}
        >
          <Check className="size-4" aria-hidden="true" />
          {busy ? "Menyimpan..." : "Simpan nama"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setNotice("");
          }}
          className={`min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-extrabold text-slate-700 disabled:opacity-50 ${focusRing}`}
        >
          Batal
        </button>
      </div>
      {notice ? (
        <p className="mt-2 text-sm font-bold text-slate-700" role="alert">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
