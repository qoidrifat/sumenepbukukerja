import { Link } from "react-router";
import {
  ArrowRight,
  Bookmark,
  ClipboardList,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Search,
  Settings2,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { landmarkLabel } from "@/lib/catalog";
import {
  useCatalogVendors,
  useCatalogActions,
  useFavorites,
  useOwnerVendors,
  useServiceRequests,
} from "@/lib/catalog-store";
import { categoryActionLabel } from "@/lib/catalog-data";
import { EmptyStateCard } from "@/components/empty-state-card";
import { useAuth } from "@/hooks/use-auth";
import { recommendedWhatsAppIntent } from "@/lib/whatsapp";
import { useContactHandoff } from "@/lib/contact-handoff";
import { useNavigate } from "react-router";
import { AnimatedContent, BorderGlow, Counter, GlassIcons, ScrollReveal } from "@/components/react-bits";
import { InteractionHistory, MyRequestHistory, PwaControls } from "@/components/community-widgets";
import { ProfileCompletionGate } from "@/components/profile-completion-gate";
import { NotificationCenter } from "@/components/community-notification-center";

export default function WargaDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const vendors = useCatalogVendors();
  const favorites = useFavorites();
  const { click, interaction } = useCatalogActions();
  // FASE 10: kartu koleksi memakai listing dari katalog PUBLIK, jadi tidak
  // pernah memegang nomor mentah. Tombol WhatsApp-nya lewat handoff server.
  const { openContactWithFeedback } = useContactHandoff();
  const savedVendors = vendors.filter((vendor) => favorites.isSaved(vendor.slug));
  const owned = useOwnerVendors();
  const myRequests = useServiceRequests({ mine: true });

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <main className="min-h-dvh min-h-[100svh] bg-[#f7f8fc] px-4 py-6 text-foreground sm:px-6 sm:py-10 lg:px-10">
      {/* Gate data diri warga: tampil menutupi dashboard sampai profil
          lengkap (server yang memutuskan, realtime). Staf dikecualikan di
          dalam komponennya sendiri. */}
      <ProfileCompletionGate />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
              Ruang warga
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-4xl">
              Halo{user?.name ? `, ${user.name}` : ""}.
            </h1>
            <p className="mt-2 text-base leading-7 text-slate-600">
              Simpan usaha yang sering Anda gunakan dan lanjutkan chatting dari satu tempat.
            </p>
          </div>
          <Button type="button" onClick={handleSignOut} variant="outline" className="min-h-12 self-start rounded-lg text-base">
            <LogOut className="size-4" />Keluar
          </Button>
        </header>

        <ScrollReveal>
          <GlassIcons
            ariaLabel="Akses cepat ruang warga"
            items={[
              { label: "Cari usaha", icon: <Search className="size-5" />, color: "blue", onClick: () => navigate("/#katalog") },
              { label: "Kelola listing", icon: <Settings2 className="size-5" />, color: "violet", onClick: () => document.getElementById("listing-saya")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
              { label: "Favorit", icon: <Bookmark className="size-5" />, color: "amber", onClick: () => document.getElementById("favorit-saya")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
              { label: "Permintaan", icon: <ClipboardList className="size-5" />, color: "emerald", onClick: () => document.getElementById("permintaan-saya")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
            ]}
          />
        </ScrollReveal>

        <PwaControls />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <BorderGlow className="h-full rounded-xl" intensity={0.08}>
          <Card className="flex h-full flex-col border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Store className="size-5" />
              </div>
              <CardTitle className="text-lg">Katalog lokal</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <Counter value={vendors.length} className="text-3xl font-black text-slate-950" />
              <p className="mt-1 text-sm text-muted-foreground">usaha tersedia</p>
            </CardContent>
          </Card>
          </BorderGlow>
          <BorderGlow className="h-full rounded-xl" glowColor="180,83,9" intensity={0.08}>
          <Card className="flex h-full flex-col border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Bookmark className="size-5" />
              </div>
              <CardTitle className="text-lg">Tersimpan</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <Counter value={savedVendors.length} className="text-3xl font-black text-slate-950" />
              <p className="mt-1 text-sm text-muted-foreground">listing pilihan Anda</p>
            </CardContent>
          </Card>
          </BorderGlow>
          <BorderGlow className="h-full rounded-xl" glowColor="4,120,87" intensity={0.08}>
          <Card className="flex h-full flex-col border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Package className="size-5" />
              </div>
              <CardTitle className="text-lg">Listing saya</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {owned === undefined ? (
                <span
                  role="status"
                  aria-label="Memuat listing saya"
                  className="block h-9 w-20 rounded bg-slate-200 motion-safe:animate-pulse"
                />
              ) : (
                <Counter value={owned.length} className="text-3xl font-black text-slate-950" />
              )}
              <p className="mt-1 text-sm text-muted-foreground">listing milik Anda</p>
            </CardContent>
            <CardFooter>
              <button type="button" onClick={() => document.getElementById("listing-saya")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex min-h-12 items-center gap-2 text-base font-extrabold text-blue-700">
                Kelola listing <ArrowRight className="size-4" />
              </button>
            </CardFooter>
          </Card>
          </BorderGlow>
          <BorderGlow className="h-full rounded-xl" glowColor="37,99,235" intensity={0.08}>
          <Card className="flex h-full flex-col border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <ClipboardList className="size-5" />
              </div>
              <CardTitle className="text-lg">Permintaan</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {myRequests === undefined ? (
                <span
                  role="status"
                  aria-label="Memuat permintaan saya"
                  className="block h-9 w-20 rounded bg-slate-200 motion-safe:animate-pulse"
                />
              ) : (
                <Counter value={myRequests.length} className="text-3xl font-black text-slate-950" />
              )}
              <p className="mt-1 text-sm text-muted-foreground">permintaan milik Anda</p>
            </CardContent>
            <CardFooter>
              <button type="button" onClick={() => document.getElementById("permintaan-saya")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex min-h-12 items-center gap-2 text-base font-extrabold text-blue-700">
                Lihat permintaan <ArrowRight className="size-4" />
              </button>
            </CardFooter>
          </Card>
          </BorderGlow>
        </section>

        <section id="favorit-saya" className="scroll-mt-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Daftar tersimpan</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.035em] text-slate-950">Lanjutkan dari favorit Anda</h2>
            </div>
            <Link to="/#katalog" className="hidden min-h-12 items-center gap-2 rounded-lg px-3 text-base font-extrabold text-blue-700 sm:flex">
              Cari lainnya <ArrowRight className="size-4" />
            </Link>
          </div>

          <AnimatedContent animationKey={savedVendors.map((vendor) => vendor.slug).join("-") || "kosong"}>
          {savedVendors.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedVendors.map((vendor) => {
                const landmark = landmarkLabel(vendor.landmark);
                return (
                  <article key={vendor.slug} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${vendor.accent} text-sm font-black text-white`}>{vendor.mark}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-blue-700">{vendor.category}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">Koleksi: {favorites.collectionFor(vendor.slug)}</p>
                        <h3 className="mt-1 text-lg font-black leading-snug text-slate-950">{vendor.name}</h3>
                      </div>
                    </div>
                    <p className="mt-4 line-clamp-2 text-base leading-6 text-slate-600">{vendor.description}</p>
                    <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-600"><MapPin className="size-4 text-blue-600" />{landmark}</p>
                    <div className="mt-auto grid grid-cols-[1fr_3rem] gap-2 pt-5">
                      <button type="button" disabled={!vendor.contactRef} onClick={() => { openContactWithFeedback({ contactRef: vendor.contactRef, intent: recommendedWhatsAppIntent(vendor.category) }); if (vendor._id) { void click({ id: vendor._id as never, kind: "whatsapp" }).catch(() => undefined); void interaction({ vendorId: vendor._id as never, kind: "whatsapp" }).catch(() => undefined); } }} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 text-base font-extrabold text-[#082f1e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
                        <MessageCircle className="size-5" />{categoryActionLabel[vendor.category]}
                      </button>
                      <Link to={`/v/${vendor.slug}`} className="flex min-h-12 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50" aria-label={`Lihat ${vendor.name}`}>
                        <ArrowRight className="size-5" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyStateCard title="Belum ada favorit tersimpan" body="Klik ikon bookmark pada listing untuk menyimpannya di perangkat dan menyinkronkannya setelah Anda masuk." actionLabel="Jelajahi katalog" onAction={() => navigate("/#katalog")} />
          )}
          </AnimatedContent>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <InteractionHistory />
          <NotificationCenter />
        </div>
        <div id="permintaan-saya" className="scroll-mt-6"><MyRequestHistory /></div>
      </div>
    </main>
  );
}
