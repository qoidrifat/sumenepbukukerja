import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router";
import {
  ArrowRight,
  Bookmark,
  Clock3,
  Check,
  ClipboardList,
  Compass,
  Home,
  MapPin,
  MessageCircle,
  Navigation,
  Search,
  Store,
  X,
  Sparkles,
  Share2,
  LocateFixed,
  GitCompare,
  Loader2,
} from "lucide-react";
import { categoryOptions, landmarkLabel, landmarks, type Category, type Vendor } from "@/lib/catalog";
import { useCatalogActions, useCatalogVendors, useFavorites } from "@/lib/catalog-store";
import { categoryActionLabel, distanceFilterOptions, distanceKmBetween, distanceLabel, isOpenNow, needSuggestions, searchByNeed } from "@/lib/catalog-data";
import { useUserLocation, type UserLocation, type UserLocationStatus } from "@/hooks/use-user-location";
import { generateWhatsAppLink, recommendedWhatsAppIntent } from "@/lib/whatsapp";
import { CodedBrowser, CodedLogoOrbit } from "@/components/codedvisuals";
import { CategoryMascot, CategoryMascotStage } from "@/components/category-mascot";
import { BrandMascot } from "@/components/brand-mascot";
import { AccessibilityControls, AvailabilityBadge, CompareTray, RequestBoard } from "@/components/community-widgets";
import {
  AnimatedContent,
  AnimatedList,
  BlurText,
  BorderGlow,
  Counter,
  GlassIcons,
  GlassSurface,
  GlareHover,
  ScrollProgress,
  ScrollReveal,
  ShinyText,
} from "@/components/react-bits";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
const recordedSearches = new Map<string, number>();

function NotebookMark({ className = "" }: { className?: string }) {
  return (
    <img
      src="/brand/logo-mark.svg"
      alt=""
      width={44}
      height={44}
      className={`size-11 shrink-0 rounded-xl object-contain ${className}`}
      aria-hidden="true"
    />
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={`group flex min-h-12 items-center gap-3 rounded-lg ${focusRing}`} aria-label="Sumenep Buku Kerja beranda">
      <NotebookMark />
      <span className="leading-tight">
        <span className="block text-lg font-extrabold tracking-[-0.04em] text-slate-950">Sumenep <span className="text-blue-600">Buku</span> Kerja</span>
        {!compact && <span className="text-sm font-medium text-slate-600">Jasa dekat, tanpa ribet.</span>}
      </span>
    </Link>
  );
}

function WhatsAppButton({ vendor, landmark, className = "" }: { vendor: Vendor; landmark: string; className?: string }) {
  const href = generateWhatsAppLink({
    phone: vendor.phone,
    vendorName: vendor.name,
    category: vendor.category,
    landmark,
    intent: recommendedWhatsAppIntent(vendor.category),
  });
  const { click, interaction } = useCatalogActions();
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        if ("_id" in vendor) {
          void click({ id: vendor._id as never, kind: "whatsapp" }).catch(() => undefined);
          void interaction({ vendorId: vendor._id as never, kind: "whatsapp" }).catch(() => undefined);
        }
        try {
          localStorage.setItem(`sumenep-buku-kerja-clicks:${vendor.slug}`, String(Number(localStorage.getItem(`sumenep-buku-kerja-clicks:${vendor.slug}`) ?? 0) + 1));
        } catch {
          // Analytics must never block the direct WhatsApp handoff.
        }
      }}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-center text-base font-extrabold text-[#082f1e] shadow-sm transition-[filter,box-shadow] duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${className}`}
    >       <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
       <ShinyText text={categoryActionLabel[vendor.category]} color="#082f1e" shineColor="#ffffff" speed={4.5} className="font-extrabold" />
    </a>
  );
}

function TopNav({ active = "Beranda" }: { active?: string }) {
  const links = [
    { label: "Beranda", icon: Home, to: "/" },
    { label: "Katalog Usaha", icon: Store, to: "/#katalog" },
    { label: "Permintaan warga", icon: ClipboardList, to: "/#permintaan" },
    { label: "Cara Pakai", icon: Compass, to: "/#cara-pakai" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-10">
        <Brand />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigasi utama">
          {links.map(({ label, icon: Icon, to }) => (
            <a key={label} href={to} className={`flex min-h-12 items-center gap-2 rounded-lg px-4 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${active === label ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50 hover:text-blue-700"}`}>
              <Icon className="size-4" aria-hidden="true" />{label}
            </a>
          ))}
        </nav>
        <a href="#katalog" className={`hidden min-h-12 items-center justify-center rounded-lg bg-blue-600 px-5 text-base font-extrabold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 lg:flex`}>
          Cari jasa <Search className="ml-2 size-4" aria-hidden="true" />
        </a>
        <div className="hidden lg:block"><AccessibilityControls /></div>
      </div>
    </header>
  );
}

function BottomNav() {
  const items = [
    { label: "Beranda", icon: Home, href: "#beranda" },
    { label: "Katalog", icon: Store, href: "#katalog" },
    { label: "Permintaan", icon: ClipboardList, href: "#permintaan" },
    { label: "Cara Pakai", icon: Compass, href: "#cara-pakai" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Navigasi bawah">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around">
        {items.map(({ label, icon: Icon, href }) => (
          <a key={label} href={href} className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-bold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:min-w-[84px] sm:text-sm ${label === "Beranda" ? "text-blue-700" : ""}`}>
            <Icon className="size-5" aria-hidden="true" /><span className="max-w-full truncate">{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function VendorCard({ vendor, landmark, saved, onSave, onCompare }: { vendor: Vendor; landmark: string; saved: boolean; onSave: () => void; onCompare: () => void }) {
  const { click, interaction } = useCatalogActions();
  const share = async () => {
    const text = `${vendor.name} — ${vendor.description}`;
    if ("_id" in vendor) {
      void click({ id: vendor._id as never, kind: "share" }).catch(() => undefined);
      void interaction({ vendorId: vendor._id as never, kind: "share" }).catch(() => undefined);
    }
    if (navigator.share) await navigator.share({ title: vendor.name, text, url: `${window.location.origin}/v/${vendor.slug}` }).catch(() => undefined);
    else await navigator.clipboard?.writeText(`${text} ${window.location.origin}/v/${vendor.slug}`);
  };
  return (
    <BorderGlow className="h-full" glowColor="37,99,235" intensity={0.12}>
      <GlareHover className="h-full rounded-2xl" glareColor="37,99,235">
        <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
      <div className="flex min-h-12 items-center gap-4 p-4">
        <div className={`relative flex aspect-square w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${vendor.accent} text-lg font-black tracking-tight text-white shadow-sm`}>
          <span className="absolute -right-3 -top-4 size-16 rounded-full border border-white/25" />
          <span className="relative">{vendor.mark}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-sm font-bold text-blue-700">{vendor.category}</span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700"><span aria-hidden="true">★</span> {vendor.rating} <span className="font-medium text-slate-500">({vendor.reviews})</span></span>
            <AvailabilityBadge vendor={vendor} />
          </div>
          <h3 className="text-[clamp(1.05rem,2.5vw,1.25rem)] font-extrabold leading-snug tracking-[-0.025em] text-slate-950">{vendor.name}</h3>
          <p className="mt-1 line-clamp-2 text-base leading-6 text-slate-600">{vendor.description}</p>
          {vendor.featured && <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-sm font-extrabold text-amber-800"><Sparkles className="size-3.5" />Pilihan warga</span>}
        </div>
        <div className="flex shrink-0 flex-col gap-1"><button type="button" onClick={onSave} className={`flex min-h-12 min-w-12 items-center justify-center rounded-lg ${saved ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-blue-50 hover:text-blue-700"}`} aria-label={saved ? "Hapus dari tersimpan" : "Simpan listing"}><Bookmark className={`size-5 ${saved ? "fill-current" : ""}`} /></button><button type="button" onClick={onCompare} className="flex min-h-12 min-w-12 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700" aria-label="Bandingkan listing"><GitCompare className="size-5" /></button><button type="button" onClick={share} className="flex min-h-12 min-w-12 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700" aria-label="Bagikan listing"><Share2 className="size-5" /></button></div>
      </div>
      <div className="mt-auto border-t border-slate-100 px-4 pb-4 pt-3">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-slate-600">           <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-blue-600" aria-hidden="true" />{landmarkLabel(vendor.landmark)}</span>
           {vendor.distanceKm !== undefined ? <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700"><LocateFixed className="size-4" aria-hidden="true" />{distanceLabel(vendor.distanceKm)} dari Anda</span> : null}
           <span className="font-extrabold text-slate-800">{vendor.price}</span>
        </div>
        <WhatsAppButton vendor={vendor} landmark={landmark} />
      </div>
        </article>
      </GlareHover>
    </BorderGlow>
  );
}

/**
 * Satu shell untuk satu pasang DOM.
 *
 * Sebelumnya halaman dirender DUA KALI: AppShell (mobile, `lg:hidden`) dan
 * WebShell (desktop, `hidden lg:block`) sama-sama membungkus DirectoryContent
 * yang isinya identik. Bedanya cuma satu: `pb-safe-nav` untuk ruang BottomNav
 * di mobile.
 *
 * Dua salinan itu tidak cuma boros (~2.500 node DOM, bukan ~1.250), tapi
 * benar-benar merusak: `id` jadi ganda di DOM, dan `getElementById`/
 * navigasi fragment browser selalu mendarat di salinan PERTAMA - yaitu shell
 * mobile yang `display:none` di lebar desktop. Akibatnya di desktop semua
 * anchor dalam halaman (`#katalog`, `#permintaan`, `#cara-pakai`) dan tombol
 * hero "Mulai cari jasa" tidak melakukan apa-apa.
 *
 * Perbedaannya sekarang cukup satu aturan di `pb-safe-nav` (lihat index.css).
 */
function LandingShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh min-h-[100svh] w-full overflow-x-hidden bg-[#f7f8fc] pb-safe-nav">{children}</div>;
}

function NotebookBackdrop() {
  return <div className="pointer-events-none fixed inset-0 z-0 notebook-paper" aria-hidden="true" />;
}

function Hero({ onBrowse, vendorCount }: { onBrowse: () => void; vendorCount: number }) {
  return (
    <section id="beranda" className="relative z-10 overflow-hidden border-b border-slate-200 bg-white">
      <div className="mx-auto grid max-w-[1600px] items-center gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:px-10 lg:py-20">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-extrabold text-blue-700">
            <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">✓</span>
            Katalog lokal warga Sumenep
          </div>           <h1 className="max-w-2xl text-[clamp(2.2rem,6vw,4.8rem)] font-black leading-[0.98] tracking-[-0.065em] text-slate-950">Kebutuhan harian,<br /><span className="relative inline-block text-blue-600"><ShinyText text="dekat rumah." color="#2563eb" shineColor="#93c5fd" speed={4} /><span className="absolute -bottom-1 left-1 h-2 w-[92%] -rotate-1 rounded-full bg-amber-200/80" aria-hidden="true" /></span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl">Buku kerja kecil untuk menemukan jasa, usaha, dan orang terdekat di sekitar Sumenep. Tanpa akun, tanpa aplikasi tambahan — langsung chat lewat WhatsApp.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={onBrowse} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-base font-extrabold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2`}>Mulai cari jasa <ArrowRight className="size-5" aria-hidden="true" /></button>
            <a href="#permintaan" className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-5 py-3 text-base font-extrabold text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2`}><ClipboardList className="size-5" />Butuh jasa?</a>
            <a href="#cara-pakai" className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-extrabold text-slate-800 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2`}>Cara kerjanya <span aria-hidden="true">↓</span></a>
          </div>           <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-slate-600">
             <span className="inline-flex items-center gap-2"><Check className="size-4 text-blue-600" />Kontak langsung</span>
             <span className="inline-flex items-center gap-2"><Check className="size-4 text-blue-600" />Tanpa biaya cari</span>
             <span className="inline-flex items-center gap-2"><Check className="size-4 text-blue-600" />Mudah dipakai</span>
           </div>
           <p className="mt-5 text-sm font-semibold text-slate-600">
             Sudah punya akun?{" "}
             <Link to="/auth?returnTo=/dashboard" className="font-extrabold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
               Masuk untuk menyimpan favorit
             </Link>
           </p>
        </div>
        <div className="relative min-h-[390px] sm:min-h-[470px]">
          <div className="absolute inset-2 rotate-2 rounded-2xl border border-amber-200 bg-amber-50/80" aria-hidden="true" />
          <div className="relative h-full overflow-hidden rounded-2xl border border-blue-200 bg-[#eaf1ff] p-4 shadow-sm sm:p-6">
            <div className="relative h-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-1 pb-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Buku kerja digital</p>
                  <p className="mt-1 text-lg font-black text-slate-950">Cari usaha di sekitar Anda</p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <MapPin className="size-5" aria-hidden="true" />
                </div>
              </div>
              <CodedBrowser
                url="/#katalog"
                animated
                trigger="inView"
                variant="landing"
                gradient
                className="mt-2 h-[19rem] sm:h-[22rem]"
              />
              <div className="mt-1 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                <span className="text-xl" aria-hidden="true">💬</span>
                <p className="text-sm font-bold leading-6 text-slate-700 sm:text-base">Pilih usaha → tanya harga → chat langsung.</p>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-3 left-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-700 shadow-sm sm:-left-3">
            <span className="mr-1 text-blue-600">●</span> <Counter value={vendorCount} className="text-slate-950" /> usaha siap membantu
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterSection({ activeLandmark, setActiveLandmark }: { activeLandmark: string; setActiveLandmark: (value: string) => void }) {
  return (
    <section className="relative z-10 border-b border-slate-200 bg-[#f7f8fc]" aria-label="Pilih patokan lokasi">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-10 lg:py-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Pilih Patokan Lokasi</p><p className="mt-1 text-lg font-black text-slate-950">Cari yang paling dekat dengan kebutuhan Anda</p></div>
          <span className="text-sm font-bold text-slate-500">{landmarks.find((item) => item.id === activeLandmark)?.note}</span>
        </div>
        <div className="-mx-1 flex min-h-12 gap-2 overflow-x-auto px-1 pb-2 [-webkit-overflow-scrolling:touch]">
          {landmarks.map((landmark) => (
            <button key={landmark.id} type="button" onClick={() => setActiveLandmark(landmark.id)} className={`min-h-12 shrink-0 rounded-full border px-4 py-3 text-left text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${activeLandmark === landmark.id ? "border-blue-600 bg-blue-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"}`}>
              {landmark.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Catalog({
  activeLandmark,
  vendors,
  location,
  locationStatus,
  locationError,
  onRequestLocation,
  onClearLocation,
}: {
  activeLandmark: string;
  vendors: Vendor[];
  location: UserLocation | null;
  locationStatus: UserLocationStatus;
  locationError: string | null;
  onRequestLocation: () => void;
  onClearLocation: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"Semua" | Category>("Semua");
  const [openNow, setOpenNow] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [distanceLimit, setDistanceLimit] = useState<number | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const favorites = useFavorites();
  const { recordSearch } = useCatalogActions();

  const vendorsWithDistance = useMemo(() => {
    if (!location) return vendors;
    return vendors.map((vendor) => ({
      ...vendor,
      distanceKm: distanceKmBetween(location, vendor),
    }));
  }, [location, vendors]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = searchByNeed(vendorsWithDistance, query).filter((vendor) => {
      const matchesLandmark = activeLandmark === "all" || vendor.landmark === activeLandmark;
      const matchesCategory = category === "Semua" || vendor.category === category;
      const matchesOpen = !openNow || isOpenNow(vendor.hours, vendor.availability);
      const matchesQuery = !normalized || [vendor.name, vendor.description, vendor.category, ...vendor.tags].join(" ").toLowerCase().includes(normalized);
      const matchesDistance = !location || distanceLimit === null || (vendor.distanceKm !== undefined && vendor.distanceKm <= distanceLimit);
      return matchesLandmark && matchesCategory && matchesOpen && matchesQuery && matchesDistance;
    });

    if (location) {
      return [...result].sort((a, b) => {
        if (a.distanceKm === undefined) return 1;
        if (b.distanceKm === undefined) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }
    return result;
  }, [activeLandmark, category, distanceLimit, location, openNow, query, vendorsWithDistance]);

  const trackedVendorIds = useMemo(
    () => filtered.flatMap((vendor) => (vendor._id ? [vendor._id as never] : [])),
    [filtered],
  );
  const trackedVendorKey = trackedVendorIds.join(",");

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length < 2 || trackedVendorIds.length === 0) return;

    const searchKey = `${normalizedQuery}|${trackedVendorKey}`;
    const timer = window.setTimeout(() => {
      const lastRecordedAt = recordedSearches.get(searchKey) ?? 0;
      if (Date.now() - lastRecordedAt < 30 * 60 * 1000) return;
      recordedSearches.set(searchKey, Date.now());
      void recordSearch({
        vendorIds: trackedVendorIds,
        query: normalizedQuery,
      }).catch(() => undefined);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [query, recordSearch, trackedVendorIds, trackedVendorKey]);

  const handleLocationRequest = () => {
    if (!location) setDistanceLimit(5);
    onRequestLocation();
  };

  const handleClearLocation = () => {
    setDistanceLimit(null);
    onClearLocation();
  };

  return (
    <section id="katalog" className="relative z-10 scroll-mt-16 bg-[#f7f8fc]">
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-14">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Katalog Usaha</p>
            <BlurText as="h2" text="Siapa yang bisa membantu hari ini?" className="mt-2 text-[clamp(1.7rem,3.5vw,2.6rem)] font-black leading-tight tracking-[-0.045em] text-slate-950" />
            <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">Cari dan telusuri catatan usaha yang sudah dipilih warga Sumenep.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-700 shadow-sm transition-[border-color,box-shadow] focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 lg:max-w-sm">
              <motion.span
                animate={searchFocused && !reduceMotion ? { scale: 1.12, rotate: -7 } : { scale: 1, rotate: 0 }}
                transition={{ duration: 0.2 }}
                className="inline-flex shrink-0"
              >
                <Search className="size-5 text-blue-600" aria-hidden="true" />
              </motion.span>
              <span className="sr-only">Cari usaha atau jasa</span>
              <input
                value={query}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari usaha atau jasa..."
                className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-500"
              />
              {query ? <button type="button" onClick={() => setQuery("")} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Hapus pencarian"><X className="size-4" /></button> : null}
            </label>
            <motion.button
              type="button"
              onClick={() => setOpenNow((value) => !value)}
              whileHover={reduceMotion ? undefined : { y: -2 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              className={`min-h-12 shrink-0 rounded-lg border px-4 text-base font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${openNow ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700"}`}
            ><Clock3 className="mr-1 inline size-4" />Buka sekarang</motion.button>
            <motion.button
              type="button"
              onClick={() => setShowMap((value) => !value)}
              whileHover={reduceMotion ? undefined : { y: -2 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              className={`min-h-12 shrink-0 rounded-lg border px-4 text-base font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${showMap ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
            ><Navigation className="mr-1 inline size-4" />Peta</motion.button>
          </div>
        </div>

        <GlassSurface tint="blue" className="mt-5 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><LocateFixed className="size-5" aria-hidden="true" /></div>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-slate-950">Cari yang paling dekat</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Izinkan browser memakai lokasi Anda untuk menghitung jarak ke setiap listing.</p>
              </div>
            </div>
            <motion.button
              type="button"
              onClick={handleLocationRequest}
              disabled={locationStatus === "loading" || locationStatus === "unsupported"}
              whileHover={reduceMotion || locationStatus === "loading" ? undefined : { y: -2 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              className={`flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-base font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-60 ${location ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
            >
              {locationStatus === "loading" ? <Loader2 className="size-5 animate-spin" /> : <LocateFixed className="size-5" />}
              {locationStatus === "loading" ? "Mencari lokasi..." : location ? "Perbarui lokasi" : "Gunakan lokasi saya"}
            </motion.button>
          </div>
          {locationError ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold leading-6 text-red-700">{locationError}</p> : null}
          {location ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-sm font-bold text-emerald-800"><ShinyText text="Lokasi aktif" color="#047857" shineColor="#6ee7b7" speed={4} /> · akurasi sekitar {Math.round(location.accuracy)} m</p>
                <button type="button" onClick={handleClearLocation} className="min-h-12 self-start rounded-lg px-3 text-left text-sm font-extrabold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 lg:self-auto">Matikan filter lokasi</button>
              </div>
              <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch]" aria-label="Filter radius jarak">
                <button type="button" aria-pressed={distanceLimit === null} onClick={() => setDistanceLimit(null)} className={`min-h-12 shrink-0 rounded-lg border px-4 py-3 text-base font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${distanceLimit === null ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>Semua jarak</button>
                {distanceFilterOptions.map((option) => (
                  <button key={option} type="button" aria-pressed={distanceLimit === option} onClick={() => setDistanceLimit(option)} className={`min-h-12 shrink-0 rounded-lg border px-4 py-3 text-base font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${distanceLimit === option ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"}`}>≤ {option} km</button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">Jarak bersifat perkiraan berdasarkan koordinat katalog. Lokasi Anda hanya diproses di browser dan tidak disimpan di Buku Kerja.</p>
            </div>
          ) : null}
        </GlassSurface>

        <div className="-mx-1 mt-4 flex min-h-12 gap-2 overflow-x-auto px-1 pb-2 [-webkit-overflow-scrolling:touch]">{needSuggestions.map((need) => <button key={need} type="button" onClick={() => setQuery(need)} className="min-h-12 shrink-0 rounded-full border border-amber-200 bg-amber-50 px-4 py-3 text-base font-extrabold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">“{need}”</button>)}</div>
        <div className="mt-7">
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-slate-500">Pilih kategori</p>
          <GlassIcons
            ariaLabel="Filter kategori usaha"
            className="mt-3"
            items={[
              { label: "Semua", icon: <Sparkles className="size-5" />, color: "blue", selected: category === "Semua", onClick: () => setCategory("Semua") },
              ...categoryOptions.map((item) => ({
                label: item.label,
                // Maskot kategori menggantikan glyph lama; nama kategori tetap
                // jadi label tombol dan penanda `aria-pressed`.
                icon: <CategoryMascot category={item.label} size="xs" />,
                color: "slate" as const,
                selected: category === item.label,
                onClick: () => setCategory(item.label),
              })),
            ]}
          />
        </div>
        <div className="mt-6 flex items-center justify-between"><p className="text-base font-bold text-slate-600"><Counter value={filtered.length} suffix=" usaha" className="text-slate-950" /> ditemukan</p><span className="hidden text-sm font-semibold text-slate-500 sm:block">{location ? "Diurutkan dari jarak terdekat" : "Diurutkan dari yang paling relevan"}</span></div>
        {showMap ? <div className="mt-6 rounded-xl border border-blue-200 bg-[#edf3ff] p-4 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-700">Peta kasar Sumenep</p><p className="mt-1 text-base font-semibold text-slate-600">Pilih patokan di atas untuk melihat usaha yang paling relevan.</p></div><LocateFixed className="size-6 text-blue-600" /></div><div className="relative mt-4 h-56 overflow-hidden rounded-xl border border-blue-200 bg-white sm:h-72"><div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(#bdd2fb 1px, transparent 1px), linear-gradient(90deg, #bdd2fb 1px, transparent 1px)", backgroundSize: "32px 32px" }} /><div className="absolute left-[18%] top-[28%] h-32 w-3/4 rotate-12 rounded-[50%] border-[14px] border-blue-200 bg-blue-50" />{location ? <div className="absolute left-[48%] top-[46%] z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" aria-label="Lokasi Anda"><span className="size-5 rounded-full border-4 border-white bg-emerald-500 shadow-md" /><span className="rounded bg-slate-900 px-1.5 py-1 text-[10px] font-bold text-white">Anda</span></div> : null}{filtered.slice(0, 6).map((vendor, index) => <Link key={vendor.slug} to={`/v/${vendor.slug}`} className="absolute flex size-10 items-center justify-center rounded-full border-4 border-white bg-blue-600 text-sm font-black text-white shadow-md" style={{ left: `${18 + (index % 3) * 25}%`, top: `${22 + Math.floor(index / 3) * 38}%` }} aria-label={`Lihat ${vendor.name}`}><MapPin className="size-5" /></Link>)}</div></div> : null}
        {compare.length > 0 ? <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"><GitCompare className="size-5 text-blue-700" /><p className="text-base font-bold text-blue-900">{compare.length} listing dipilih untuk dibandingkan.</p><button type="button" onClick={() => setCompare([])} className="ml-auto min-h-12 rounded-lg px-3 text-base font-extrabold text-blue-700 hover:bg-blue-100">Bersihkan</button></div> : null}
        <CompareTray vendors={filtered} selected={compare} onRemove={(slug) => setCompare((current) => current.filter((item) => item !== slug))} onClear={() => setCompare([])} />
        <AnimatedContent
          animationKey={`${activeLandmark}-${category}-${openNow}-${distanceLimit ?? "all"}-${query}-${filtered.length}`}
          className="mt-6"
        >
          {filtered.length > 0 ? <AnimatedList items={filtered.map((vendor) => <VendorCard key={vendor.slug} vendor={vendor} landmark={landmarkLabel(vendor.landmark)} saved={favorites.isSaved(vendor.slug)} onSave={() => favorites.save(vendor.slug, vendor._id)} onCompare={() => setCompare((current) => current.includes(vendor.slug) ? current.filter((item) => item !== vendor.slug) : current.length < 3 ? [...current, vendor.slug] : current)} />)} ariaLabel="Daftar usaha" itemClassName="h-full" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 2xl:grid-cols-4" /> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm"><BrandMascot state="empty" size="md" className="mx-auto" /><h3 className="mt-4 text-xl font-black text-slate-950">{location && distanceLimit !== null ? "Belum ada usaha dalam radius ini" : "Belum ada jasa yang cocok"}</h3><p className="mx-auto mt-2 max-w-md text-base leading-7 text-slate-600">{location && distanceLimit !== null ? "Coba pilih radius yang lebih jauh, atau matikan filter lokasi." : "Belum ada jasa di sekitar sini. Coba pilih patokan lain atau kata kunci yang lebih umum."}</p></div>}
        </AnimatedContent>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [{ number: "01", title: "Pilih patokan", text: "Pilih lokasi yang paling mudah bagi Anda." }, { number: "02", title: "Temukan usaha", text: "Lihat kategori, jam kerja, dan harga awal." }, { number: "03", title: "Chat langsung", text: "Klik tombol hijau dan WhatsApp terbuka dengan pesan siap kirim." }];
  return <ScrollReveal><section id="cara-pakai" className="relative z-10 border-y border-slate-200 bg-white scroll-mt-16"><div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10 lg:py-16"><div className="max-w-2xl"><p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Cara Pakai</p><h2 className="mt-2 text-[clamp(1.7rem,3.5vw,2.6rem)] font-black tracking-[-0.045em] text-slate-950">Tiga langkah, tanpa akun.</h2></div><div className="mt-8 grid gap-4 sm:grid-cols-3 lg:gap-6">{steps.map((step) => <div key={step.number} className="relative rounded-xl border border-slate-200 bg-[#f7f8fc] p-5 shadow-sm sm:p-6"><span className="text-4xl font-black tracking-[-0.08em] text-blue-200">{step.number}</span><h3 className="mt-6 text-xl font-black text-slate-950">{step.title}</h3><p className="mt-2 text-base leading-7 text-slate-600">{step.text}</p></div>)}</div></div></section></ScrollReveal>;
}

function LocalCategories() {
  const categoryLogos = categoryOptions.map((category) => (
    <span className="flex size-12 items-center justify-center rounded-full bg-secondary" aria-hidden="true">
      {/* Orbit sudah bergerak sendiri, jadi maskot di dalam orbit dibuat statis. */}
      <CategoryMascot category={category.label} size="xs" animated={false} />
    </span>
  ));

  return (
    <ScrollReveal>
      <section className="relative z-10 border-b border-slate-200 bg-[#f7f8fc] py-10 sm:py-14 lg:py-16">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <div className="grid items-center gap-8 lg:grid-cols-[.9fr_1.1fr] lg:gap-14">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Satu katalog, banyak kebutuhan</p>
            <h2 className="mt-2 text-[clamp(1.7rem,3.5vw,2.6rem)] font-black tracking-[-0.045em] text-slate-950">Lima kebutuhan, satu buku kerja.</h2>
            <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">Kategori di sekitar Sumenep dirangkum dalam satu halaman agar warga lebih cepat menemukan jasa yang tepat.</p>
          </div>
          <div className="relative min-h-[21rem] overflow-hidden rounded-2xl border border-blue-200 bg-white p-3 shadow-sm sm:min-h-[24rem] sm:p-5">
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-blue-600" />
            <CodedLogoOrbit
              outerLogos={categoryLogos}
              logo={<span className="text-xl font-black tracking-[-0.04em] text-primary">SB</span>}
              animated
              trigger="inView"
              orbit
              hover
              className="h-[20rem] sm:h-[22rem]"
            />
            <div className="absolute inset-x-4 bottom-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 sm:inset-x-6 sm:bottom-5">
              <span className="text-sm font-bold text-slate-700">Pilih kategori saat mencari</span>
              <a href="#katalog" className="min-h-12 rounded-lg px-3 py-3 text-sm font-extrabold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Buka katalog</a>
            </div>
          </div>
        </div>
        {/* Kartu kategori mendapat baris penuh sendiri. Sebelumnya kartu ini
            berada di dalam kolom .9fr bersama orbit, sehingga di 1024px hanya
            tersisa ~194px per kartu - maskot besar tidak muat di samping teks
            dan ikut menyusut jadi ikon. */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4 xl:grid-cols-5">
          {categoryOptions.map((category) => (
            <article key={category.label} className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm sm:p-4">
              <CategoryMascotStage category={category.label} size="md" />
              <h3 className="mt-3 text-base font-extrabold text-slate-950 sm:mt-4">{category.label}</h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">{category.description}</p>
            </article>
          ))}
        </div>
      </div>
      </section>
    </ScrollReveal>
  );
}

function Footer() {
  return <footer className="relative z-10 bg-slate-950 text-white"><div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-8 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-10"><div><div className="flex items-center gap-3"><NotebookMark className="border-white/20 bg-white/10" /><span className="text-xl font-black tracking-[-0.04em]">Sumenep <span className="text-blue-300">Buku</span> Kerja</span></div><p className="mt-3 max-w-sm text-base leading-7 text-slate-300">Buku kerja lokal untuk warga Sumenep. Temukan usaha, lalu hubungi langsung lewat WhatsApp.</p></div><div className="text-sm font-semibold text-slate-400 lg:text-right"><p>Dibuat untuk warga Sumenep, Madura</p><p className="mt-1">© 2025 Sumenep Buku Kerja</p></div></div></footer>;
}

function DirectoryContent({
  vendors,
  location,
  locationStatus,
  locationError,
  onRequestLocation,
  onClearLocation,
}: {
  vendors: Vendor[];
  location: UserLocation | null;
  locationStatus: UserLocationStatus;
  locationError: string | null;
  onRequestLocation: () => void;
  onClearLocation: () => void;
}) {
  const [activeLandmark, setActiveLandmark] = useState("all");
  return <><ScrollProgress /><TopNav /><div className="relative z-10 px-4 pt-3 sm:px-6 lg:hidden"><AccessibilityControls /></div><NotebookBackdrop /><Hero vendorCount={vendors.length} onBrowse={() => document.getElementById("katalog")?.scrollIntoView({ behavior: "smooth" })} /><FilterSection activeLandmark={activeLandmark} setActiveLandmark={setActiveLandmark} /><Catalog activeLandmark={activeLandmark} vendors={vendors} location={location} locationStatus={locationStatus} locationError={locationError} onRequestLocation={onRequestLocation} onClearLocation={onClearLocation} /><RequestBoard /><HowItWorks /><LocalCategories /><Footer /><BottomNav /></>;
}

export default function Landing() {
  const catalogVendors = useCatalogVendors();
  const { location, status, error, requestLocation, clearLocation } = useUserLocation();
  const locationState = { vendors: catalogVendors, location, locationStatus: status, locationError: error, onRequestLocation: requestLocation, onClearLocation: clearLocation };
  return <LandingShell><DirectoryContent {...locationState} /></LandingShell>;
}
