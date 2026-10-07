import { Link } from "react-router";
import {
  ArrowRight,
  Bookmark,
  ClipboardList,
  MapPin,
  MessageCircle,
  Store,
} from "lucide-react";
import { landmarkLabel } from "@/lib/catalog";
import {
  useCatalogVendors,
  useCatalogActions,
  useFavorites,
  useMyInteractions,
  useServiceRequests,
} from "@/lib/catalog-store";
import { categoryActionLabel } from "@/lib/catalog-data";
import { AccountMenu } from "@/components/account-menu";
import { SyncIndicator } from "@/components/sync-indicator";
import { EmptyStateCard } from "@/components/empty-state-card";
import { useAuth } from "@/hooks/use-auth";
import { recommendedWhatsAppIntent } from "@/lib/whatsapp";
import { useContactHandoff } from "@/lib/contact-handoff";
import { useNavigate } from "react-router";
import { AnimatedContent, BorderGlow } from "@/components/react-bits";
import { InteractionHistory, MyRequestHistory, PwaControls } from "@/components/community-widgets";
import { ProfileCompletionGate } from "@/components/profile-completion-gate";
import { NotificationCenter } from "@/components/community-notification-center";
import {
  DashBody,
  DashHero,
  DashSection,
  DashShell,
  DashStat,
} from "@/components/dashboard-ui";
import { dashButtonClass } from "@/lib/dash-button-class";

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function WargaDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const vendors = useCatalogVendors();
  const favorites = useFavorites();
  const { click, interaction } = useCatalogActions();
  // FASE 10: kartu koleksi memakai listing dari katalog PUBLIK, jadi tidak
  // pernah memegang nomor mentah. Tombol WhatsApp-nya lewat handoff server.
  const { openContactWithFeedback } = useContactHandoff();
  const savedVendors = vendors.filter((vendor) => favorites.isSaved(vendor.slug));
  const myRequests = useServiceRequests({ mine: true });
  const interactions = useMyInteractions();

  return (
    <DashShell>
      {/* Gate data diri warga: tampil menutupi dashboard sampai profil
          lengkap (server yang memutuskan, realtime). Staf dikecualikan di
          dalam komponennya sendiri. */}
      <ProfileCompletionGate />

      {/* Header sengaja ditulis inline, bukan lewat `DashBar`: kontrak
          `sync-indicator.test.ts` meminta indikator sinkronisasi berada di
          KIRI AccountMenu DI DALAM elemen <header> yang sama, dan urutan itu
          dibaca langsung dari berkas ini. */}
      <header className="dash-topbar">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-extrabold tracking-[-0.02em] text-slate-950">Ruang warga</span>
            <span className="hidden truncate text-xs font-bold uppercase tracking-[0.12em] text-slate-500 lg:inline">Sumenep Buku Kerja</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SyncIndicator />
            <AccountMenu />
          </div>
        </div>
      </header>

      <DashBody>
        <DashHero
          eyebrow="Ruang warga"
          title={<>Halo{user?.name ? `, ${user.name}` : ""}.</>}
          description="Simpan usaha yang sering Anda gunakan dan lanjutkan chatting dari satu tempat."
        />

        <PwaControls />

        <DashSection
          eyebrow="Ringkasan"
          title="Sekilas aktivitas Anda"
          description="Empat angka yang berubah mengikuti apa yang Anda simpan, minta, dan hubungi."
          grid="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <DashStat
            index={0}
            icon={<Store className="size-5" />}
            tone="blue"
            label="Katalog lokal"
            value={vendors.length}
            hint="usaha tersedia di sekitar Anda"
            action={
              <Link to="/#katalog" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-blue-700 hover:text-blue-900">
                Jelajahi katalog <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            }
          />
          <DashStat
            index={1}
            icon={<Bookmark className="size-5" />}
            tone="amber"
            label="Tersimpan"
            value={savedVendors.length}
            hint="listing pilihan Anda"
            action={
              <button
                type="button"
                onClick={() => scrollToSection("favorit-saya")}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-blue-700 hover:text-blue-900"
              >
                Buka favorit <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            }
          />
          <DashStat
            index={2}
            icon={<ClipboardList className="size-5" />}
            tone="emerald"
            label="Permintaan saya"
            value={myRequests?.length}
            hint="permintaan yang Anda buat"
            action={
              <button
                type="button"
                onClick={() => scrollToSection("permintaan-saya")}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-blue-700 hover:text-blue-900"
              >
                Lihat permintaan <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            }
          />
          <DashStat
            index={3}
            icon={<MessageCircle className="size-5" />}
            tone="slate"
            label="Interaksi"
            value={interactions?.length}
            hint="chatting & kunjungan terakhir Anda"
            action={
              <button
                type="button"
                onClick={() => scrollToSection("aktivitas-saya")}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-blue-700 hover:text-blue-900"
              >
                Lihat aktivitas <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            }
          />
        </DashSection>

        <DashSection
          id="favorit-saya"
          eyebrow="Daftar tersimpan"
          title="Lanjutkan dari favorit Anda"
          description="Yang Anda simpan tersimpan di perangkat ini dan ikut tersinkron setelah masuk."
          action={
            <Link to="/#katalog" className={dashButtonClass("secondary", "hidden sm:inline-flex")}>
              Cari lainnya <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          <AnimatedContent animationKey={savedVendors.map((vendor) => vendor.slug).join("-") || "kosong"}>
            {savedVendors.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {savedVendors.map((vendor) => {
                  const landmark = landmarkLabel(vendor.landmark);
                  return (
                    <BorderGlow key={vendor.slug} className="h-full rounded-xl" intensity={0.08}>
                      <article className="dash-panel dash-panel--interactive flex h-full min-w-0 flex-col p-5">
                        <div className="flex items-start gap-3">
                          <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${vendor.accent} text-sm font-black text-white`}>{vendor.mark}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold text-blue-700">{vendor.category}</p>
                            <p className="mt-1 text-xs font-bold text-slate-500">Koleksi: {favorites.collectionFor(vendor.slug)}</p>
                            <h3 className="mt-1 text-lg font-black leading-snug tracking-[-0.02em] text-slate-950">{vendor.name}</h3>
                          </div>
                        </div>
                        <p className="mt-4 line-clamp-2 text-base leading-6 text-slate-600">{vendor.description}</p>
                        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-600"><MapPin className="size-4 text-blue-600" aria-hidden="true" />{landmark}</p>
                        <div className="mt-auto grid grid-cols-[1fr_3rem] gap-2 pt-5">
                          <button
                            type="button"
                            disabled={!vendor.contactRef}
                            onClick={() => {
                              openContactWithFeedback({ contactRef: vendor.contactRef, intent: recommendedWhatsAppIntent(vendor.category) });
                              if (vendor._id) {
                                void click({ id: vendor._id as never, kind: "whatsapp" }).catch(() => undefined);
                                void interaction({ vendorId: vendor._id as never, kind: "whatsapp" }).catch(() => undefined);
                              }
                            }}
                            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-base font-extrabold text-[#082f1e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                          >
                            <MessageCircle className="size-5" aria-hidden="true" />{categoryActionLabel[vendor.category]}
                          </button>
                          <Link
                            to={`/v/${vendor.slug}`}
                            className="flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-50"
                            aria-label={`Lihat ${vendor.name}`}
                          >
                            <ArrowRight className="size-5" aria-hidden="true" />
                          </Link>
                        </div>
                      </article>
                    </BorderGlow>
                  );
                })}
              </div>
            ) : (
              <EmptyStateCard title="Belum ada favorit tersimpan" body="Klik ikon bookmark pada listing untuk menyimpannya di perangkat dan menyinkronkannya setelah Anda masuk." actionLabel="Jelajahi katalog" onAction={() => navigate("/#katalog")} />
            )}
          </AnimatedContent>
        </DashSection>

        <div id="aktivitas-saya" className="grid scroll-mt-20 gap-6 lg:grid-cols-2">
          <InteractionHistory />
          <NotificationCenter />
        </div>

        <div id="permintaan-saya" className="scroll-mt-20"><MyRequestHistory /></div>
      </DashBody>
    </DashShell>
  );
}
