export const sanitizePhoneNumber = (phone: string) => phone.replace(/\D/g, "").replace(/^0/, "62");

export type WhatsAppIntent = "general" | "availability" | "price" | "estimate" | "request";

export const generateWhatsAppMessage = ({
  vendorName,
  category,
  landmark,
  intent = "general",
  reference,
}: {
  vendorName: string;
  category: string;
  landmark: string;
  intent?: WhatsAppIntent;
  reference?: string;
}) => {
  const intro = `Halo ${vendorName}, saya melihat listing Anda di Sumenep Buku Kerja.`;
  const location = landmark === "all" ? "sekitar Sumenep" : `sekitar ${landmark}`;
  const context = {
    general: category === "Kuliner" ? "Mau tanya paket dan ketersediaan." : "Mau tanya layanan dan harga.",
    availability: "Apakah usaha sedang tersedia untuk kebutuhan hari ini?",
    price: "Mau tanya harga terbaru dan pilihan paket yang tersedia.",
    estimate: "Boleh minta estimasi waktu selesai dan cakupan pekerjaan?",
    request: `Saya melihat permintaan warga di papan lokal: "${reference ?? "kebutuhan baru"}". Boleh saya bantu?`,
  }[intent];
  return `${intro} ${context} Saya berada di ${location}.`;
};

export const generateWhatsAppLink = ({
  phone,
  vendorName,
  category,
  landmark,
  intent,
  reference,
}: {
  phone: string;
  vendorName: string;
  category: string;
  landmark: string;
  intent?: WhatsAppIntent;
  reference?: string;
}) => {
  const sanitizedNumber = sanitizePhoneNumber(phone);
  const message = generateWhatsAppMessage({ vendorName, category, landmark, intent, reference });
  return `https://wa.me/${sanitizedNumber}?text=${encodeURIComponent(message)}`;
};
