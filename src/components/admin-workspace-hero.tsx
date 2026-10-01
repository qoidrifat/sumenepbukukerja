import type { LucideIcon } from "lucide-react";
import { Check, Inbox, Plus } from "lucide-react";
import { TimeStampLabel } from "@/components/admin-workspace";

/**
 * Hero meja kerja admin: judul, ajakan bertindak, dan ringkasan cepat.
 *
 * Dipisah dari `src/pages/Admin.tsx` karena blok ini UTUH secara visual tapi
 * menutup hampir seluruh state halaman — memindahkannya membuat satu
 * perubahan kecil yang bisa direview, bukan satu risalah di dalam berkas
 * 1.600 baris. Tidak ada satu pun state yang berubah: komponen ini murni
 *_presentational_, menerima angka dan callback, dan tidak memanggil hook data.
 */
export type AdminQueueShortcut<TQueue extends string = string> = {
  queue: TQueue;
  label: string;
  count: number;
  icon: LucideIcon;
};

export function AdminWorkspaceHero<TQueue extends string = string>({
  activeCount,
  actionableCount,
  latestUpdate,
  shortcuts,
  onSelectQueue,
  onCreate,
}: {
  activeCount: number;
  actionableCount: number;
  latestUpdate?: number;
  shortcuts: AdminQueueShortcut<TQueue>[];
  onSelectQueue: (queue: TQueue) => void;
  onCreate: () => void;
}) {
  return (
    <section className="admin-panel admin-panel-lg overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.6fr)]">
        <div className="p-5 sm:p-7 lg:p-9">
          <div className="inline-flex items-center gap-2 border-2 border-[#121212] bg-[#FFE662] px-3 py-2 text-sm font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#121212]">
            <span className="admin-sync-dot" aria-hidden="true" />
            Meja kerja admin
          </div>
          <h1 className="mt-5 max-w-4xl text-[clamp(2rem,5vw,4rem)] font-black uppercase leading-[0.98] tracking-[-0.06em] text-[#1A1A1A]">
            Triage katalog tanpa ribet.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#525252] sm:text-lg sm:leading-8">
            Periksa, terverifikasi, aktifkan, dan arsipkan listing dari satu
            ruang kerja yang tersinkon langsung dengan data Sumenep Buku Kerja.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={onCreate}
              className="admin-btn admin-btn-primary"
            >
              <Plus className="size-5" />
              Tambah listing
            </button>
            <a href="#admin-triage" className="admin-btn admin-btn-secondary">
              <Inbox className="size-5" />
              Buka meja triage
            </a>
          </div>
        </div>

        <div className="border-t-2 border-[#121212] bg-[#F1EDE3] p-5 sm:p-7 lg:border-l-2 lg:border-t-0 lg:p-8">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#525252]">
            Ringkasan cepat
          </p>
          <dl className="mt-5 space-y-4">
            <div className="border-b-2 border-[#121212] pb-4">
              <dt className="text-sm font-bold text-[#525252]">Listing aktif</dt>
              <dd className="mt-1 text-3xl font-black tracking-[-0.05em]">
                {activeCount}
              </dd>
            </div>
            <div className="border-b-2 border-[#121212] pb-4">
              <dt className="text-sm font-bold text-[#525252]">
                Butuh tindakan
              </dt>
              <dd className="mt-1 text-3xl font-black tracking-[-0.05em] text-[#FF5A26]">
                {actionableCount}
              </dd>
              {/*
                Shortcut ke antrean yang menyusun angka di atasnya. Tanpa ini,
                "Butuh tindakan" cuma angka: tidak ada tempat lagi untuk
                dikerjakan, dan tidak ada jalan lain menyelesaikannya.
              */}
              <ul className="mt-3 space-y-2" aria-label="Shortcut antrean kerja">
                {shortcuts.map((shortcut) => (
                  <li key={shortcut.queue}>
                    <a
                      href="#admin-triage"
                      onClick={() => onSelectQueue(shortcut.queue)}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-[2px] border-2 border-[#121212] bg-white px-3 py-1.5 text-sm transition-transform hover:bg-[#FFE662] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A26]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <shortcut.icon
                          className="size-4 shrink-0 text-[#121212]"
                          aria-hidden="true"
                        />
                        <span className="truncate font-black">{shortcut.label}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs font-black text-[#525252]">
                        {shortcut.count}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <dt className="text-sm font-bold text-[#525252]">
                Pembaruan terakhir
              </dt>
              <dd className="mt-1 text-base font-black">
                <TimeStampLabel timestamp={latestUpdate} />
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

/** Baris pemberitahuan (sukses) di bawah hero. */
export function AdminNotice({
  notice,
  onDismiss,
}: {
  notice: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mt-5 flex items-start gap-3 border-2 border-[#121212] bg-[#FFE662] px-4 py-3 shadow-[3px_3px_0_#121212]"
      role="status"
    >
      <Check className="mt-0.5 size-5 shrink-0" />
      <p className="min-w-0 flex-1 text-base font-black text-[#1A1A1A]">
        {notice}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="admin-icon-btn"
        aria-label="Tutup pemberitahuan"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
