import { Link } from "react-router";
import { Archive, ClipboardList, FileEdit, Inbox, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminVendors, useCurrentAccess, useOpenReports, useReviewQueue } from "@/lib/catalog-store";
import { staffRoleLongLabel } from "@/lib/select-options";
import { focusRing } from "@/lib/focus-ring";

const cardClass = "h-full border-slate-200 bg-white shadow-sm";
const statGrid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";

// Tautan workspace + anchor triage admin (bagian rute, bukan kelas tema).
const triageTo = { pathname: "/admin", hash: "#admin-triage" };

const footerLinkClass = `inline-flex min-h-12 items-center gap-1.5 rounded-lg px-1 text-sm font-extrabold text-blue-700 hover:bg-blue-50 ${focusRing}`;
const actionRowClass = `flex min-h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 hover:border-blue-300 hover:bg-blue-50 ${focusRing}`;

/**
 * Ringkasan read-only untuk staff: empat angka + daftar perlu-tindakan.
 *
 * Halaman ini tidak punya mutasi; semua tindakan dilakukan di workspace.
 * Gate akses dipasang di rute (Task 5), halaman tetap null-safe saat query
 * loading dengan skeleton seukuran kartu final.
 */
export default function StaffDashboard() {
  const access = useCurrentAccess();
  const items = useAdminVendors();
  const reportsQuery = useOpenReports();
  const reviewQueue = useReviewQueue();

  if (access === undefined) {
    return (
      <main className="min-h-dvh bg-[#f7f8fc] px-4 py-6 text-foreground sm:px-6 sm:py-10 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <p
            role="status"
            className="rounded-2xl border border-slate-200 bg-white p-6 text-base font-bold text-slate-600 motion-safe:animate-pulse"
          >
            Memuat dashboard staff...
          </p>
          <div className={statGrid} aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="h-44 rounded-xl border border-slate-200 bg-white shadow-sm motion-safe:animate-pulse"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  const roleLabel = staffRoleLongLabel(typeof access.role === "string" ? access.role : "staff");
  const draftItems = (items ?? []).filter((item) => (item.status ?? "active") === "draft");
  const archivedItems = (items ?? []).filter((item) => (item.status ?? "active") === "archived");
  const reviewTotal = Array.isArray(reviewQueue) ? reviewQueue.length : reviewQueue?.total;
  const openReportCount = reportsQuery?.length;
  const topDrafts = draftItems.slice(0, 3);
  const queriesReady = items !== undefined && reportsQuery !== undefined && reviewQueue !== undefined;

  return (
    <main className="min-h-dvh bg-[#f7f8fc] px-4 py-6 text-foreground sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Ruang staff</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-4xl">
              Halo, {roleLabel}.
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
              Ringkasan baca-saja: draft menunggu, arsip, antrean review, dan laporan terbuka. Semua
              tindakan dilakukan di workspace.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/admin"
              className={`inline-flex min-h-12 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 ${focusRing}`}
            >
              Buka workspace
            </Link>
            <Link
              to="/"
              className={`inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}
            >
              Kembali ke katalog
            </Link>
          </div>
        </header>

        <section aria-label="Ringkasan" className={statGrid}>
          <Card className={`${cardClass} flex flex-col`}>
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <FileEdit className="size-5" aria-hidden="true" />
              </div>
              <CardTitle className="text-lg">Draft menunggu</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {items === undefined ? (
                <span
                  role="status"
                  aria-label="Memuat jumlah draft"
                  className="block h-9 w-20 rounded bg-slate-200 motion-safe:animate-pulse"
                />
              ) : (
                <p className="text-3xl font-black text-slate-950">{String(draftItems.length)}</p>
              )}
              <p className="mt-1 text-sm text-slate-600">listing menunggu tinjauan</p>
            </CardContent>
            <CardFooter>
              <Link to={triageTo} className={footerLinkClass}>
                Tinjau draft
              </Link>
            </CardFooter>
          </Card>

          <Card className={`${cardClass} flex flex-col`}>
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Archive className="size-5" aria-hidden="true" />
              </div>
              <CardTitle className="text-lg">Diarsipkan</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {items === undefined ? (
                <span
                  role="status"
                  aria-label="Memuat jumlah arsip"
                  className="block h-9 w-20 rounded bg-slate-200 motion-safe:animate-pulse"
                />
              ) : (
                <p className="text-3xl font-black text-slate-950">{String(archivedItems.length)}</p>
              )}
              <p className="mt-1 text-sm text-slate-600">listing nonaktif dari katalog</p>
            </CardContent>
            <CardFooter>
              <Link to="/admin" className={footerLinkClass}>
                Lihat arsip di workspace
              </Link>
            </CardFooter>
          </Card>

          <Card className={`${cardClass} flex flex-col`}>
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Inbox className="size-5" aria-hidden="true" />
              </div>
              <CardTitle className="text-lg">Antrean review</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {reviewTotal === undefined ? (
                <span
                  role="status"
                  aria-label="Memuat antrean review"
                  className="block h-9 w-20 rounded bg-slate-200 motion-safe:animate-pulse"
                />
              ) : (
                <p className="text-3xl font-black text-slate-950">{String(reviewTotal)}</p>
              )}
              <p className="mt-1 text-sm text-slate-600">klaim, foto, dan laporan menunggu</p>
            </CardContent>
            <CardFooter>
              <Link to={triageTo} className={footerLinkClass}>
                Tinjau antrean
              </Link>
            </CardFooter>
          </Card>

          <Card className={`${cardClass} flex flex-col`}>
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-700">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </div>
              <CardTitle className="text-lg">Laporan terbuka</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {openReportCount === undefined ? (
                <span
                  role="status"
                  aria-label="Memuat laporan terbuka"
                  className="block h-9 w-20 rounded bg-slate-200 motion-safe:animate-pulse"
                />
              ) : (
                <p className="text-3xl font-black text-slate-950">{String(openReportCount)}</p>
              )}
              <p className="mt-1 text-sm text-slate-600">laporan warga belum selesai</p>
            </CardContent>
            <CardFooter>
              <Link to={triageTo} className={footerLinkClass}>
                Tinjau laporan
              </Link>
            </CardFooter>
          </Card>
        </section>

        <section
          aria-label="Perlu tindakan"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-blue-700" aria-hidden="true" />
            <h2 className="text-xl font-black text-slate-950">Perlu tindakan</h2>
          </div>
          {queriesReady ? (
            topDrafts.length === 0 && (openReportCount ?? 0) === 0 && (reviewTotal ?? 0) === 0 ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Semua antrean bersih — tidak ada tindakan menunggu.
              </p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {topDrafts.map((draft) => (
                  <li key={draft._id}>
                    <Link to={triageTo} className={actionRowClass}>
                      <FileEdit className="size-4 shrink-0 text-amber-700" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{draft.name}</span>
                      <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                        Draft
                      </span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link to={triageTo} className={actionRowClass}>
                    <ShieldCheck className="size-4 shrink-0 text-red-700" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {String(openReportCount ?? 0)} laporan terbuka menunggu tinjauan
                    </span>
                  </Link>
                </li>
                <li>
                  <Link to={triageTo} className={actionRowClass}>
                    <Inbox className="size-4 shrink-0 text-blue-700" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {String(reviewTotal ?? 0)} antrean review menunggu keputusan
                    </span>
                  </Link>
                </li>
              </ul>
            )
          ) : (
            <p
              role="status"
              className="mt-4 rounded-lg bg-slate-100 p-4 text-sm font-bold text-slate-600 motion-safe:animate-pulse"
            >
              Memuat daftar tindakan...
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
