export const sanitizePhoneNumber = (phone: string) => phone.replace(/\D/g, "").replace(/^0/, "62");

export const generateWhatsAppMessage = ({
  vendorName,
  category,
  landmark,
}: {
  vendorName: string;
  category: string;
  landmark: string;
}) => {
  const intro = `Halo ${vendorName}, saya melihat jasa Anda di SumenepKerja.`;
  const categoryContext = category === "Kuliner" ? "Mau tanya paket dan ketersediaan." : "Mau tanya layanan dan harga.";
  return `${intro} ${categoryContext} Saya Pills ${landmark === "all" ? "di sekitar Sumenep" : `di sekitar ${landmark}`}.`;
};

export const generateWhatsAppLink = ({
  phone,
  vendorName,
  category,
  landmark,
}: {
  phone: string;
  vendorName: string;
  category: string;
  landmark: string;
}) => {
  const sanitizedNumber = sanitizePhoneNumber(phone);
  const message = generateWhatsAppMessage({ vendorName, category, landmark });
  return `https://wa.me/${sanitizedNumber}?text=${encodeURIComponent(message)}`;
};
