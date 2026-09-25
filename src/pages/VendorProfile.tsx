import { Link, useParams } from "react-router";
import { ArrowLeft, CheckCircle2, Clock3, MapPin, MessageCircle, Phone, Store } from "lucide-react";
import { landmarkLabel } from "@/lib/catalog";
import { useCatalogVendors } from "@/lib/catalog-store";
import { generateWhatsAppLink } from "@/lib/whatsapp";
import NotFound from "./NotFound";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

function VendorProfileContent() {
  const { slug } = useParams();
  const items = useCatalogVendors();
  const vendor = items.find((item) => item.slug === slug);
  if (!vendor) return <NotFound />;
  const landmark = landmarkLabel(vendor.landmark);
  const waHref = generateWhatsAppLink({ phone: vendor.phone, vendorName: vendor.name, category: vendor.category, landmark });

  return (
    <div className="min-h-dvh min-h-[100svh] bg-[#f7f8fc] pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-12">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link to="/#katalog" className={`flex min-h-12 items-center gap-2 rounded-lg px-2 text-base font-extrabold text-slate-800 hover:bg-blue-50 hover:text-blue-700 ${focusRing}`}><ArrowLeft className="size-5" />Kembali ke katalog</Link>
          <Link to="/" className={`flex min-h-12 items-center gap-2 rounded-lg px-2 text-lg font-black tracking-[-0.04em] text-slate-950 hover:bg-blue-50 ${focusRing}`}>Sumenep <span className="text-blue-600">Buku</span> Kerja</Link>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-12">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,.7fr)] lg:items-start lg:gap-10">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className={`relative aspect-[16/9] overflow-hidden bg-gradient-to-br ${vendor.accent} sm:aspect-[21/9]`} role="img" aria-label={`Ilustrasi ${vendor.name}`}>
              <div className="absolute -right-12 -top-20 size-72 rounded-full border border-white/25" /><div className="absolute -bottom-24 left-10 size-64 rounded-full border border-white/20" />
              <div className="absolute inset-0 flex items-center justify-center"><span className="flex size-24 items-center justify-center rounded-2xl border border-white/40 bg-white/20 text-3xl font-black text-white backdrop-blur-sm sm:size-32">{vendor.mark}</span></div>
              <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-extrabold text-slate-800 shadow-sm"><CheckCircle2 className="size-4 text-blue-600" />Mitra Terverifikasi</span>
            </div>
            <div className="p-5 sm:p-7">
              <span className="inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-sm font-extrabold text-blue-700">{vendor.category}</span>
              <h1 className="mt-4 text-[clamp(1.8rem,5vw,3.2rem)] font-black leading-tight tracking-[-0.05em] text-slate-950">{vendor.name}</h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">{vendor.description}</p>
              <div className="mt-6 flex flex-wrap gap-2">{vendor.tags.map((tag) => <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700">{tag}</span>)}</div>
              <div className="mt-8 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
                <Info icon={MapPin} label="Alamat" value={`${vendor.address} · dekat ${landmark}`} />
                <Info icon={Clock3} label="Jam kerja" value={vendor.hours} />
                <Info icon={Store} label="Mulai dari" value={vendor.price} />
                <Info icon={Phone} label="Kontak" value={vendor.phone.replace(/^62/, "0")} />
              </div>
            </div>
          </section>
          <aside className="lg:sticky lg:top-24">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Mulai dari sini</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Tanya langsung ke usaha ini.</h2>
              <p className="mt-3 text-base leading-7 text-slate-600">Pesan sudah disiapkan otomatis supaya Anda tidak perlu mengetik dari awal.</p>
              <a href={waHref} target="_blank" rel="noreferrer" className={`mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-base font-extrabold text-[#082f1e] shadow-sm hover:shadow-md ${focusRing}`}><MessageCircle className="size-5" />Chat WhatsApp Sekarang</a>
              <a href={`tel:${vendor.phone}`} className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-extrabold text-slate-800 hover:border-blue-300 hover:bg-blue-50 ${focusRing}`}><Phone className="size-5 text-blue-600" />Simpan Nomor Telepon</a>
              <div className="mt-5 flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold leading-6 text-slate-700"><span className="text-lg" aria-hidden="true">✎</span><span>Transaksi dan kesepakatan tetap dilakukan langsung bersama mitra.</span></div>
            </div>
          </aside>
        </div>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] lg:hidden"><a href={waHref} target="_blank" rel="noreferrer" className={`mx-auto flex min-h-12 max-w-md items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-base font-extrabold text-[#082f1e] ${focusRing}`}><MessageCircle className="size-5" />Chat WhatsApp Sekarang</a></div>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return <div className="flex min-w-0 items-start gap-3 rounded-lg bg-slate-50 p-3"><Icon className="mt-0.5 size-5 shrink-0 text-blue-600" /><div className="min-w-0"><p className="text-sm font-extrabold text-slate-900">{label}</p><p className="mt-1 text-base leading-6 text-slate-600">{value}</p></div></div>;
}

export default function VendorProfile() { return <VendorProfileContent />; }
