import { useState } from "react";
import { AdminAuditLog } from "@/components/admin-audit-log";
import { AdminErrorReports } from "@/components/admin-error-reports";
import { AdminSecurityLog } from "@/components/admin-security-log";
import { AdminSessionActions } from "@/components/admin-session-actions";
import { useAuditLogs, useCurrentAccess } from "@/lib/catalog-store";

/**
 * Halaman Keamanan di `/admin/keamanan`.
 *
 * Isinya PINDAHAN verbatim dari `admin-governance.tsx` (blok panel keamanan
 * `securityOpen` + panel audit + hook `useAuditLogs`): langganan hook,
 * penerusan `open` ke `AdminSecurityLog`, dan perilaku visibility gating
 * (sesi + error hanya di-mount saat terbuka) tidak diubah — hanya tempatnya
 * yang pindah ke rute bertingkat supaya dirender di dalam `<Outlet/>`
 * milik `AdminShell`.
 */
export function KeamananPage() {
  const access = useCurrentAccess();
  const audit = useAuditLogs();
  // Panel keamanan (sesi + log + error) duduk di bawah fold dan langganannya
  // mahal. Default terbuka supaya tampilan tidak berubah; saat ditutup,
  // komponen berat tidak di-mount dan langganan security di-skip
  // (`AdminSecurityLog` meneruskan `open` sebagai `enabled` ke hook).
  const [securityOpen, setSecurityOpen] = useState(true);

  if (access === undefined) return null;

  return (
    <main className="admin-shell-frame mx-auto max-w-[1600px] px-3 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-10">
      <section className="admin-panel overflow-hidden" aria-labelledby="keamanan-title">
        <div className="border-b-2 border-[#121212] bg-[#FFE662] p-4 sm:p-6">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#525252]">Keamanan</p>
          <h2 id="keamanan-title" className="mt-1 text-2xl font-black text-[#1A1A1A]">Sesi, log keamanan, error, dan audit</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#525252]">Semua keputusan di bawah diverifikasi ulang di server. Frontend hanya menampilkan aksi; bukan sumber kebenaran role.</p>
          <button
            type="button"
            onClick={() => setSecurityOpen((value) => !value)}
            aria-expanded={securityOpen}
            aria-controls="panel-keamanan"
            className="admin-btn admin-btn-secondary mt-3"
          >
            {securityOpen ? "Sembunyikan panel keamanan" : "Tampilkan panel keamanan"}
          </button>
        </div>
        {/*
          Kartu-kartu di bawah dulu pernah terpotong di layar ponsel.

          Penyebabnya kolom grid implisit: tanpa `grid-cols-1`, track tunggal
          memakai `auto`, sehingga lebarnya ikut min-content anak terlebar (tabel
          IP `min-w-[34rem]` di panel security log menaikkannya sampai ~787px).
          Track itu lalu terpotong oleh `overflow-hidden` di `<section>` induk,
          jadi isi kartu hilang di kanan pada Android maupun iOS.

          Dua hal yang menahannya sekarang:
          - `grid-cols-1` = `minmax(0, 1fr)`, jadi track boleh menyusut di bawah
            min-content dan lebarnya mengikuti lebar layar.
          - `[&>*]:min-w-0`, karena grid item punya `min-width: auto`; tanpa ini
            track boleh menyusut tapi isinya tetap meluber keluar kartu.

          Dua-duanya perlu. Mengganti salah satu saja hanya memindahkan
          pemotongan dari kartu ke isinya.
        */}
        <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 xl:grid-cols-2 [&>*]:min-w-0">
          {/*
            Pembungkus `display: contents` supaya anak-anaknya tetap menjadi grid
            item dari grid induk — susunan kolom saat terbuka sama persis seperti
            tanpa pembungkus. `min-w-0` diwariskan di sini karena aturan
            `[&>*]:min-w-0` milik grid induk sekarang mengenai pembungkus ini,
            bukan artikelnya (lihat catatan grid-cols-1 di atas).
          */}
          <div id="panel-keamanan" className="contents [&>*]:min-w-0">
            {securityOpen ? <AdminSessionActions /> : null}

            <AdminSecurityLog open={securityOpen} />

            {securityOpen ? <AdminErrorReports /> : null}
          </div>

          <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
            <h3 className="text-lg font-black text-[#1A1A1A]">Audit log terbaru</h3>
            <p className="mt-1 text-xs leading-5 text-[#525252]">
              Setiap baris mencatat siapa yang mengubah, email dan nomor sesinya, serta nilai
              sebelum dan sesudah. Rincian metadata dibuka per baris.
            </p>
            <AdminAuditLog entries={audit ?? undefined} />
          </article>
        </div>
      </section>
    </main>
  );
}
