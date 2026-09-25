import { Link } from "react-router";
import { ArrowRight, Bookmark, LayoutDashboard, LogOut, MapPin, MessageCircle, Search, Settings2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { landmarkLabel } from "@/lib/catalog";
import { useCatalogVendors, useCatalogActions, useFavorites } from "@/lib/catalog-store";
import { categoryActionLabel } from "@/lib/catalog-data";
import { useAuth } from "@/hooks/use-auth";
import { generateWhatsAppLink, recommendedWhatsAppIntent } from "@/lib/whatsapp";
import { useNavigate } from "react-router";
import { AnimatedContent, BorderGlow, Counter, GlassIcons, ScrollReveal } from "@/components/react-bits";
import { AccessibilityControls, InteractionHistory, MyRequestHistory, NotificationCenter } from "@/components/community-widgets";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const vendors = useCatalogVendors();
  const favorites = useFavorites();
  const { click, interaction } = useCatalogActions();
  const savedVendors = vendors.filter((vendor) => favorites.isSaved(vendor.slug));

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <main className="min-h-dvh min-h-[100svh] bg-[#f7f8fc] px-4 py-6 text-foreground sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
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
              { label: "Kelola katalog", icon: <Settings2 className="size-5" />, color: "violet", onClick: () => navigate("/admin") },
            ]}
          />
        </ScrollReveal>

        <AccessibilityControls />

        <section className="grid gap-4 sm:grid-cols-3">
          <BorderGlow className="h-full rounded-xl" intensity={0.08}>
          <Card className="h-full border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Store className="size-5" />
              </div>
              <CardTitle className="text-lg">Katalog lokal</CardTitle>
            </CardHeader>
            <CardContent>
              <Counter value={vendors.length} className="text-3xl font-black text-slate-950" />
              <p className="mt-1 text-sm text-muted-foreground">usaha tersedia</p>
            </CardContent>
          </Card>
          </BorderGlow>
          <BorderGlow className="h-full rounded-xl" glowColor="180,83,9" intensity={0.08}>
          <Card className="h-full border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Bookmark className="size-5" />
              </div>
              <CardTitle className="text-lg">Tersimpan</CardTitle>
            </CardHeader>
            <CardContent>
              <Counter value={savedVendors.length} className="text-3xl font-black text-slate-950" />
              <p className="mt-1 text-sm text-muted-foreground">listing pilihan Anda</p>
            </CardContent>
          </Card>
          </BorderGlow>
          <BorderGlow className="h-full rounded-xl" glowColor="4,120,87" intensity={0.08}>
          <Card className="h-full border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <LayoutDashboard className="size-5" />
              </div>
              <CardTitle className="text-lg">Mulai lagi</CardTitle>
            </CardHeader>
            <CardContent>
              <Link to="/#katalog" className="inline-flex min-h-12 items-center gap-2 text-base font-extrabold text-blue-700">
                Cari jasa <ArrowRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
          </BorderGlow>
        </section>

        <section>
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
                const href = generateWhatsAppLink({
                  phone: vendor.phone,
                  vendorName: vendor.name,
                  category: vendor.category,
                  landmark,
                  intent: recommendedWhatsAppIntent(vendor.category),
                });
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
                      <a href={href} target="_blank" rel="noreferrer" onClick={() => { if (vendor._id) { void click({ id: vendor._id as never, kind: "whatsapp" }).catch(() => undefined); void interaction({ vendorId: vendor._id as never, kind: "whatsapp" }).catch(() => undefined); } }} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 text-base font-extrabold text-[#082f1e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                        <MessageCircle className="size-5" />{categoryActionLabel[vendor.category]}
                      </a>
                      <Link to={`/v/${vendor.slug}`} className="flex min-h-12 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50" aria-label={`Lihat ${vendor.name}`}>
                        <ArrowRight className="size-5" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed border-slate-300 bg-white shadow-none">
              <CardContent className="flex flex-col items-center py-10 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Bookmark className="size-6" /></span>
                <h3 className="mt-4 text-xl font-black text-slate-950">Belum ada listing tersimpan</h3>
                <p className="mt-2 max-w-md text-base leading-7 text-slate-600">Klik ikon bookmark pada listing untuk menyimpannya di perangkat dan menyinkronkannya setelah Anda masuk.</p>
                <Button asChild className="mt-5 min-h-12 rounded-lg text-base">
                  <Link to="/#katalog">Jelajahi katalog <ArrowRight className="size-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          )}
          </AnimatedContent>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <InteractionHistory />
          <NotificationCenter />
        </div>
        <MyRequestHistory />
      </div>
    </main>
  );
}
