import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Compass,
  Home,
  MapPin,
  MessageCircle,
  Search,
  Store,
  X,
} from "lucide-react";
import { categoryOptions, landmarkLabel, landmarks, type Category, type Vendor } from "@/lib/catalog";
import { useCatalogVendors } from "@/lib/catalog-store";
import { generateWhatsAppLink } from "@/lib/whatsapp";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
const brand = "Sumenep Buku Kerja";

function NotebookMark({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 ${className}`} aria-hidden="true">
      <div className="absolute inset-y-1 left-1 w-0.5 rounded-full bg-blue-200" />
      <div className="ml-1 flex size-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-extrabold text-white shadow-sm">SB</div>
    </div>
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
  const href = generateWhatsAppLink({ phone: vendor.phone, vendorName: vendor.name, category: vendor.category, landmark });
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        try {
          localStorage.setItem(`sumenep-buku-kerja-clicks:${vendor.slug}`, String(Number(localStorage.getItem(`sumenep-buku-kerja-clicks:${vendor.slug}`) ?? 0) + 1));
        } catch {
          // Analytics must never block the direct WhatsApp handoff.
        }
      }}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-center text-base font-extrabold text-[#082f1e] shadow-sm transition-[filter,box-shadow] duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${className}`}
    >
      <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
      <span>Chat WhatsApp Sekarang</span>
    </a>
  );
}

function TopNav({ active = "Beranda" }: { active?: string }) {
  const links = [
    { label: "Beranda", icon: Home, to: "/" },
    { label: "Katalog Usaha", icon: Store, to: "/#katalog" },
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
      </div>
    </header>
  );
}

function BottomNav() {
  const items = [
    { label: "Beranda", icon: Home, href: "#beranda" },
    { label: "Katalog", icon: Store, href: "#katalog" },
    { label: "Cara Pakai", icon: Compass, href: "#cara-pakai" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Navigasi bawah">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around">
        {items.map(({ label, icon: Icon, href }) => (
          <a key={label} href={href} className={`flex min-h-12 min-w-[84px] flex-col items-center justify-center gap-1 rounded-lg px-2 text-sm font-bold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${label === "Beranda" ? "text-blue-700" : ""}`}>
            <Icon className="size-5" aria-hidden="true" /><span>{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function VendorCard({ vendor, landmark }: { vendor: Vendor; landmark: string }) {
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
      <div className="flex min-h-12 items-center gap-4 p-4">
        <div className={`relative flex aspect-square w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${vendor.accent} text-lg font-black tracking-tight text-white shadow-sm`}>
          <span className="absolute -right-3 -top-4 size-16 rounded-full border border-white/25" />
          <span className="relative">{vendor.mark}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-sm font-bold text-blue-700">{vendor.category}</span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700"><span aria-hidden="true">★</span> {vendor.rating} <span className="font-medium text-slate-500">({vendor.reviews})</span></span>
          </div>
          <h3 className="text-[clamp(1.05rem,2.5vw,1.25rem)] font-extrabold leading-snug tracking-[-0.025em] text-slate-950">{vendor.name}</h3>
          <p className="mt-1 line-clamp-2 text-base leading-6 text-slate-600">{vendor.description}</p>
        </div>
        <ChevronRight className="hidden size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 sm:block" aria-hidden="true" />
      </div>
      <div className="mt-auto border-t border-slate-100 px-4 pb-4 pt-3">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-blue-600" aria-hidden="true" />{landmarkLabel(vendor.landmark)}</span>
          <span className="font-extrabold text-slate-800">{vendor.price}</span>
        </div>
        <WhatsAppButton vendor={vendor} landmark={landmark} />
      </div>
    </article>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh min-h-[100svh] w-full overflow-x-hidden bg-[#f7f8fc] pb-safe-nav lg:hidden">{children}</div>;
}

function WebShell({ children }: { children: React.ReactNode }) {
  return <div className="hidden min-h-dvh min-h-[100svh] w-full overflow-x-hidden bg-[#f7f8fc] lg:block">{children}</div>;
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
          </div>
          <h1 className="max-w-2xl text-[clamp(2.2rem,6vw,4.8rem)] font-black leading-[0.98] tracking-[-0.065em] text-slate-950">Kebutuhan harian,<br /><span className="relative inline-block text-blue-600">dekat rumah.<span className="absolute -bottom-1 left-1 h-2 w-[92%] -rotate-1 rounded-full bg-amber-200/80" aria-hidden="true" /></span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl">Buku kerja kecil untuk menemukan jasa, usaha, dan orang terdekat di sekitar Sumenep. Tanpa akun, tanpa aplikasi tambahan — langsung chat lewat WhatsApp.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onBrowse} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-base font-extrabold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2`}>Mulai cari jasa <ArrowRight className="size-5" aria-hidden="true" /></button>
            <a href="#cara-pakai" className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-extrabold text-slate-800 transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2`}>Cara kerjanya <span aria-hidden="true">↓</span></a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-slate-600">
            <span className="inline-flex items-center gap-2"><Check className="size-4 text-blue-600" />Kontak langsung</span>
            <span className="inline-flex items-center gap-2"><Check className="size-4 text-blue-600" />Tanpa biaya cari</span>
            <span className="inline-flex items-center gap-2"><Check className="size-4 text-blue-600" />Mudah dipakai</span>
          </div>
        </div>
        <div className="relative min-h-[360px] sm:min-h-[440px]">
          <div className="absolute inset-0 rotate-2 rounded-2xl border border-amber-200 bg-amber-50/70" />
          <div className="relative h-full overflow-hidden rounded-2xl border border-blue-200 bg-[#eaf1ff] p-5 shadow-sm sm:p-7">
            <div className="absolute left-0 top-0 h-full w-8 border-r border-blue-200/80 bg-blue-100/60" aria-hidden="true" />
            <div className="relative h-full rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div><p className="text-sm font-extrabold uppercase tracking-[0.16em] text-blue-600">Katalog lokal</p><p className="mt-1 text-xl font-black text-slate-950">Sekitar Sumenep</p></div>
                <div className="flex size-11 items-center justify-center rounded-xl bg-blue-600 text-white"><MapPin className="size-5" aria-hidden="true" /></div>
              </div>
              <div className="relative mt-6 h-56 overflow-hidden rounded-xl bg-[#edf3ff] sm:h-64" aria-label="Ilustrasi peta sederhana Sumenep">
                <div className="absolute inset-0 opacity-70" style={{ backgroundImage: "linear-gradient(#bdd2fb 1px, transparent 1px), linear-gradient(90deg, #bdd2fb 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
                <div className="absolute left-[16%] top-[23%] h-28 w-72 rotate-[18deg] rounded-[50%] border-[12px] border-[#a8c5ee] bg-[#d7e6ff]" />
                <div className="absolute left-[18%] top-[31%] h-1.5 w-64 rotate-[18deg] rounded-full bg-blue-400" />
                <span className="absolute left-[12%] top-[18%] rounded-full bg-slate-900 px-2 py-1 text-xs font-bold text-white">Taman Bunga</span>
                <span className="absolute right-[10%] top-[43%] rounded-full bg-slate-900 px-2 py-1 text-xs font-bold text-white">Pasar Anom</span>
                <span className="absolute bottom-[16%] left-[45%] rounded-full bg-slate-900 px-2 py-1 text-xs font-bold text-white">Masjid Jamik</span>
                <span className="absolute left-[47%] top-[46%] flex size-7 items-center justify-center rounded-full border-4 border-white bg-blue-600 text-sm text-white shadow-md">✦</span>
              </div>
              <div className="mt-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"><span className="text-xl" aria-hidden="true">💬</span><p className="text-base font-bold leading-6 text-slate-700">Pilih usaha → langsung chat. Sudah, selesai.</p></div>
            </div>
          </div>
          <div className="absolute -bottom-4 -left-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-700 shadow-sm sm:-left-5"><span className="mr-1 text-blue-600">●</span> {vendorCount} usaha siap membantu</div>
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

function Catalog({ activeLandmark, vendors }: { activeLandmark: string; vendors: Vendor[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"Semua" | Category>("Semua");
  const filtered = useMemo(() => vendors.filter((vendor) => {
    const matchesLandmark = activeLandmark === "all" || vendor.landmark === activeLandmark;
    const matchesCategory = category === "Semua" || vendor.category === category;
    const normalized = query.trim().toLowerCase();
    const matchesQuery = !normalized || [vendor.name, vendor.description, vendor.category, ...vendor.tags].join(" ").toLowerCase().includes(normalized);
    return matchesLandmark && matchesCategory && matchesQuery;
  }), [activeLandmark, category, query]);

  return (
    <section id="katalog" className="relative z-10 scroll-mt-16 bg-[#f7f8fc]">
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-14">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Katalog Usaha</p><h2 className="mt-2 text-[clamp(1.7rem,3.5vw,2.6rem)] font-black leading-tight tracking-[-0.045em] text-slate-950">Siapa yang bisa membantu hari ini?</h2><p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">Cari dan telusuri catatan usaha yang sudah dipilih warga Sumenep.</p></div>
          <label className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-700 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 lg:max-w-sm">
            <Search className="size-5 shrink-0 text-blue-600" aria-hidden="true" /><span className="sr-only">Cari usaha atau jasa</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari usaha atau jasa..." className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-500" />{query && <button type="button" onClick={() => setQuery("")} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Hapus pencarian"><X className="size-4" /></button>}
          </label>
        </div>
        <div className="-mx-1 mt-7 flex min-h-12 gap-2 overflow-x-auto px-1 pb-2 [-webkit-overflow-scrolling:touch]">
          {(["Semua", ...categoryOptions.map((item) => item.label)] as const).map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`min-h-12 shrink-0 rounded-lg border px-4 py-3 text-base font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${category === item ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"}`}>{item === "Semua" ? "Semua kategori" : `${categoryOptions.find((option) => option.label === item)?.icon} ${item}`}</button>)}
        </div>
        <div className="mt-6 flex items-center justify-between"><p className="text-base font-bold text-slate-600"><span className="text-slate-950">{filtered.length} usaha</span> ditemukan</p><span className="hidden text-sm font-semibold text-slate-500 sm:block">Diurutkan dari yang paling relevan</span></div>
        {filtered.length > 0 ? <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 2xl:grid-cols-4">{filtered.map((vendor) => <VendorCard key={vendor.slug} vendor={vendor} landmark={activeLandmark} />)}</div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm"><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-2xl" aria-hidden="true">⌕</div><h3 className="mt-4 text-xl font-black text-slate-950">Belum ada jasa yang cocok</h3><p className="mx-auto mt-2 max-w-md text-base leading-7 text-slate-600">Belum ada jasa di sekitar sini. Coba pilih patokan lain atau kata kunci yang lebih umum.</p></div>}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [{ number: "01", title: "Pilih patokan", text: "Pilih lokasi yang paling mudah bagi Anda." }, { number: "02", title: "Temukan usaha", text: "Lihat kategori, jam kerja, dan harga awal." }, { number: "03", title: "Chat langsung", text: "Klik tombol hijau dan WhatsApp terbuka dengan pesan siap kirim." }];
  return <section id="cara-pakai" className="relative z-10 border-y border-slate-200 bg-white scroll-mt-16"><div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10 lg:py-16"><div className="max-w-2xl"><p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Cara Pakai</p><h2 className="mt-2 text-[clamp(1.7rem,3.5vw,2.6rem)] font-black tracking-[-0.045em] text-slate-950">Tiga langkah, tanpa akun.</h2></div><div className="mt-8 grid gap-4 sm:grid-cols-3 lg:gap-6">{steps.map((step) => <div key={step.number} className="relative rounded-xl border border-slate-200 bg-[#f7f8fc] p-5 shadow-sm sm:p-6"><span className="text-4xl font-black tracking-[-0.08em] text-blue-200">{step.number}</span><h3 className="mt-6 text-xl font-black text-slate-950">{step.title}</h3><p className="mt-2 text-base leading-7 text-slate-600">{step.text}</p></div>)}</div></div></section>;
}

function Footer() {
  return <footer className="relative z-10 bg-slate-950 text-white"><div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-8 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-10"><div><div className="flex items-center gap-3"><NotebookMark className="border-white/20 bg-white/10" /><span className="text-xl font-black tracking-[-0.04em]">Sumenep <span className="text-blue-300">Buku</span> Kerja</span></div><p className="mt-3 max-w-sm text-base leading-7 text-slate-300">Buku kerja lokal untuk warga Sumenep. Temukan usaha, lalu hubungi langsung lewat WhatsApp.</p></div><div className="text-sm font-semibold text-slate-400 lg:text-right"><p>Dibuat untuk warga Sumenep, Madura</p><p className="mt-1">© 2025 Sumenep Buku Kerja</p></div></div></footer>;
}

function DirectoryContent() {
  const [activeLandmark, setActiveLandmark] = useState("all");
  const catalogVendors = useCatalogVendors();
  return <><TopNav /><NotebookBackdrop /><Hero vendorCount={catalogVendors.length} onBrowse={() => document.getElementById("katalog")?.scrollIntoView({ behavior: "smooth" })} /><FilterSection activeLandmark={activeLandmark} setActiveLandmark={setActiveLandmark} /><Catalog activeLandmark={activeLandmark} vendors={catalogVendors} /><HowItWorks /><Footer /><BottomNav /></>;
}

export default function Landing() {
  return <><AppShell><DirectoryContent /></AppShell><WebShell><DirectoryContent /></WebShell></>;
}
