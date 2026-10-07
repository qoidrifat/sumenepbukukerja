import { useEffect } from "react";
import { LegalArticle } from "@/components/legal-article";

/**
 * Syarat & Ketentuan Sumenep Buku Kerja.
 *
 * Seperti halaman Kebijakan Privasi, URL ini dipakai untuk dialog login dan
 * rincian aplikasi — isinya aturan operasional nyata layanan ini.
 */
export default function TermsOfService() {
  useEffect(() => {
    document.title = "Syarat & Ketentuan — Sumenep Buku Kerja";
  }, []);

  return (
    <LegalArticle
      eyebrow="Sumenep Buku Kerja"
      title="Syarat & Ketentuan"
      description="Aturan pemakaian direktori jasa lokal Sumenep: apa yang boleh, apa yang tidak, dan bagaimana kami menanganinya."
      updated="5 Oktober 2026"
    >
      <section>
        <h2>1. Layanan ini</h2>
        <p>
          Sumenep Buku Kerja mempertemukan warga dengan penyedia jasa lokal:
          katalog usaha, permintaan jasa, klaim kepemilikan listing, dan
          notifikasi WhatsApp opt-in. Layanan diberikan sebagaimana adanya,
          tanpa jaminan ketersediaan tanpa henti.
        </p>
      </section>

      <section>
        <h2>2. Akun</h2>
        <ul>
          <li>Satu orang memakai satu akun dengan satu email nyata yang bisa dipulihkan.</li>
          <li>
            Lengkapi data diri (nama, nomor WhatsApp terverifikasi, alamat)
            untuk memakai fitur warga secara penuh.
          </li>
          <li>Jagalah akses ke email Anda; aktivitas di akun Anda adalah tanggung jawab Anda.</li>
        </ul>
      </section>

      <section>
        <h2>3. Konten listing dan permintaan</h2>
        <ul>
          <li>Tulis informasi usaha yang benar dan terkini: nama, kategori, alamat, jam, dan harga.</li>
          <li>Kelola listing orang lain hanya lewat klaim terverifikasi yang disetujui pengelola.</li>
          <li>Dilarang: informasi palsu, penipuan, spam, ujaran kebencian, dan konten melanggar hukum.</li>
        </ul>
      </section>

      <section>
        <h2>4. Notifikasi</h2>
        <p>
          Notifikasi WhatsApp bersifat opt-in, maksimal tiga pesan per hari,
          dan dapat dimatikan kapan saja dari dasbor. Kode verifikasi hanya
          berlaku 10 menit dan tidak boleh dibagikan kepada siapa pun.
        </p>
      </section>

      <section>
        <h2>5. Penyalahgunaan dan penindakan</h2>
        <p>
          Spam, percobaan masuk tanpa hak, dan pengiriman pesan berlebihan
          dibatasi otomatis oleh sistem. Pelanggaran berulang dapat berujung
          pada pembatasan fitur atau penutupan akun setelah peninjauan
          pengelola.
        </p>
      </section>

      <section>
        <h2>6. Batas tanggung jawab</h2>
        <p>
          Transaksi dan komunikasi antara warga dan penyedia jasa adalah
          tanggung jawab para pihak. Kami menyediakan sarana perkenalan dan
          verifikasi identitas dasar, bukan penjaminan transaksi.
        </p>
      </section>

      <section>
        <h2>7. Perubahan dan hukum yang berlaku</h2>
        <p>
          Ketentuan ini dapat diperbarui mengikuti tanggal di atas. Perselisihan
          diselesaikan musyawarah terlebih dahulu dan tunduk pada hukum
          Republik Indonesia.
        </p>
      </section>
    </LegalArticle>
  );
}
