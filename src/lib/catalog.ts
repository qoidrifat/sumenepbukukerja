export type Category = "Servis Teknik" | "Hajatan & Acara" | "Kuliner" | "Transportasi" | "Jasa Umum";

export type Vendor = {
  slug: string;
  name: string;
  category: Category;
  description: string;
  address: string;
  landmark: string;
  price: string;
  hours: string;
  phone: string;
  rating: string;
  reviews: number;
  featured?: boolean;
  verified?: boolean;
  photoId?: string;
  status?: "draft" | "active" | "archived";
  _id?: string;
  _creationTime?: number;
  createdAt?: number;
  updatedAt?: number;
  reviewsCount?: number;
  whatsappClicks?: number;
  shareClicks?: number;
  searchImpressions?: number;
  subscriptionTier?: "free" | "featured" | "premium";
  ownerId?: string;
  businessId?: string;
  reviewItems?: Array<{ _id: string; authorName: string; rating: number; body: string; createdAt: number }>;
  accent: string;
  mark: string;
  tags: string[];
};

export const landmarks = [
  { id: "all", label: "Semua Sumenep", note: "Cari jasa di seluruh kota" },
  { id: "adipura", label: "Taman Bunga / Adipura", note: "Area pusat kota" },
  { id: "trunojoyo", label: "Jl. Trunojoyo", note: "Sekitar jalan utama" },
  { id: "anom", label: "Pasar Anom Baru", note: "Dekat pasar tradisional" },
  { id: "keraton", label: "Keraton / Labang Mesem", note: "Area keraton" },
  { id: "jamik", label: "Masjid Jamik", note: "Pusat kota" },
];

export const categoryOptions: Array<{ label: Category; icon: string; description: string }> = [
  { label: "Servis Teknik", icon: "⌁", description: "Perbaikan & instalasi" },
  { label: "Hajatan & Acara", icon: "✦", description: "Bantu acara hari besar" },
  { label: "Kuliner", icon: "♨", description: "Makanan dekat rumah" },
  { label: "Transportasi", icon: "↗", description: "Perjalanan & angkut" },
  { label: "Jasa Umum", icon: "⌂", description: "Berbagai kebutuhan lokal" },
];

export const vendors: Vendor[] = [
  {
    slug: "bangunan-berkah",
    name: "Bengkel Bangunan Berkah",
    category: "Servis Teknik",
    description: "Jasa tukang,-cat, dan perbaikan rumah. Diterima pekerjaan kecil maupun besar.",
    address: "Jl. Trunojoyo No. 88, Sumenep",
    landmark: "trunojoyo",
    price: "Mulai Rp35.000",
    hours: "Setiap hari · 07.00–17.00",
    phone: "6281234567890",
    rating: "4.9",
    reviews: 48,
    accent: "from-[#1d4ed8] to-[#60a5fa]",
    mark: "BB",
    tags: ["Tukang", "Cat", "Perbaikan rumah"],
  },
  {
    slug: "dapur-mami-sumenep",
    name: "Dapur Mami Sumenep",
    category: "Kuliner",
    description: "Nasi kotak, tumpeng, dan paket acara dengan cita rasa rumahan khas Madura.",
    address: "Kawasan Pasar Anom Baru, Sumenep",
    landmark: "anom",
    price: "Mulai Rp18.000/porsi",
    hours: "Senin–Minggu · 06.00–14.00",
    phone: "6282345678901",
    rating: "4.8",
    reviews: 73,
    accent: "from-[#c2410c] to-[#fb923c]",
    mark: "DM",
    tags: ["Nasi kotak", "Tumpeng", "Katering"],
  },
  {
    slug: "mitra-acara-melati",
    name: "Mitra Acara Melati",
    category: "Hajatan & Acara",
    description: "Bantu dekorasi ringan, tenda, kursi, dan perlengkapan acara sederhana.",
    address: "Jl. Keraton No. 12, Sumenep",
    landmark: "keraton",
    price: "Mulai Rp250.000",
    hours: "Setiap hari · 08.00–20.00",
    phone: "6283456789012",
    rating: "4.7",
    reviews: 29,
    accent: "from-[#9d174d] to-[#f472b6]",
    mark: "MA",
    tags: ["Dekorasi", "Tenda", "Perlengkapan"],
  },
  {
    slug: "suryo-trans-sumenep",
    name: "Suryo Trans Sumenep",
    category: "Transportasi",
    description: "Antar-jemput dan charter lokal untuk perjalanan penting di dalam Sumenep.",
    address: "Area Masjid Jamik, Sumenep",
    landmark: "jamik",
    price: "Mulai Rp25.000",
    hours: "Setiap hari · 05.00–22.00",
    phone: "6284567890123",
    rating: "4.9",
    reviews: 61,
    accent: "from-[#047857] to-[#34d399]",
    mark: "ST",
    tags: ["Antar-jemput", "Charter", "Local"],
  },
  {
    slug: "karya-jaya",
    name: "Karya Jaya",
    category: "Servis Teknik",
    description: "Servis pompa air, listrik, dan elektronik rumah dengan teknisi berpengalaman.",
    address: "Taman Bunga, Sumenep",
    landmark: "adipura",
    price: "Mulai Rp50.000",
    hours: "Senin–Sabtu · 07.00–18.00",
    phone: "6285678901234",
    rating: "4.8",
    reviews: 36,
    accent: "from-[#4338ca] to-[#818cf8]",
    mark: "KJ",
    tags: ["Pompa air", "Listrik", "Elektronik"],
  },
  {
    slug: "laundry-bersih-terang",
    name: "Laundry Bersih Terang",
    category: "Jasa Umum",
    description: "Cuci satuan, kiloan, dan jas. Dijemput bila berada di area pusat Sumenep.",
    address: "Jl. Trunojoyo, Sumenep",
    landmark: "trunojoyo",
    price: "Mulai Rp8.000/kg",
    hours: "Setiap hari · 07.00–19.00",
    phone: "6286789012345",
    rating: "4.6",
    reviews: 24,
    accent: "from-[#0369a1] to-[#38bdf8]",
    mark: "LB",
    tags: ["Cuci satuan", "Kiloan", "Jas"],
  },
];

export const vendorBySlug = (slug: string) => vendors.find((vendor) => vendor.slug === slug);

export const landmarkLabel = (id: string) => landmarks.find((landmark) => landmark.id === id)?.label ?? "Sumenep";
