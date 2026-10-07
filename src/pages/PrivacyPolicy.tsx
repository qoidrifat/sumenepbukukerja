import { useEffect } from "react";
import { LegalArticle } from "@/components/legal-article";

/**
 * Kebijakan Privasi Sumenep Buku Kerja.
 *
 * Ditulis dari praktik data nyata aplikasi ini (bukan template generik),
 * karena URL halaman ini dipakai untuk dialog login dan rincian aplikasi
 * Meta/Google — isinya harus bisa dipertanggungjawabkan.
 */
export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = "Kebijakan Privasi — Sumenep Buku Kerja";
  }, []);

  return (
    <LegalArticle
      eyebrow="Sumenep Buku Kerja"
      title="Kebijakan Privasi"
      description="Bagaimana kami mengumpulkan, memakai, menyimpan, dan menghapus data Anda saat memakai direktori jasa lokal Sumenep ini."
      updated="5 Oktober 2026"
    >
      <section>
        <h2>1. Siapa kami</h2>
        <p>
          Sumenep Buku Kerja adalah direktori jasa lokal untuk warga Sumenep,
          Madura: menemukan usaha di sekitar rumah, lalu menghubungi langsung
          lewat WhatsApp. Kebijakan ini menjelaskan perlakuan data di layanan
          tersebut.
        </p>
      </section>

      <section>
        <h2>2. Data yang kami kumpulkan</h2>
        <ul>
          <li>
            <strong>Data akun:</strong> nama dan alamat email dari penyedia
            masuk yang Anda pilih (Google atau kode OTP email).
          </li>
          <li>
            <strong>Data diri warga:</strong> nama lengkap, nomor WhatsApp, dan
            alamat domisili yang Anda isi — dipakai agar pengelola bisa
            menghubungimu dan memverifikasi identitas klaim listing.
          </li>
          <li>
            <strong>Aktivitas layanan:</strong> listing yang disimpan, permintaan
            jasa, interaksi katalog, serta preferensi notifikasi Anda.
          </li>
          <li>
            <strong>Notifikasi WhatsApp (opt-in):</strong> hanya bila Anda
            mengaktifkannya, maksimal tiga pesan per hari, dan bisa dimatikan
            kapan saja dari dasbor.
          </li>
          <li>
            <strong>Data teknis diagnostik:</strong> jenis perangkat dan
            peramban, halaman yang error, dan ID laporan — tanpa kata sandi,
            token, atau isi database.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Untuk apa data dipakai</h2>
        <ul>
          <li>Membuka dan menjaga sesi masuk Anda.</li>
          <li>Menampilkan dan memverifikasi listing serta klaim usaha.</li>
          <li>Mengirim notifikasi yang Anda setujui.</li>
          <li>Mendiagnosis gangguan dan menjaga keamanan layanan.</li>
        </ul>
        <p>
          Kami tidak menjual data Anda dan tidak menampilkannya kepada pihak
          ketiga untuk pemasaran.
        </p>
      </section>

      <section>
        <h2>4. Kepada siapa data diteruskan</h2>
        <ul>
          <li>
            <strong>Meta (WhatsApp Cloud API):</strong> hanya isi notifikasi
            yang Anda setujui dan kode verifikasi — sesuai template yang
            disetujui Meta.
          </li>
          <li>
            <strong>Google (Firebase Authentication):</strong> hanya proses
            masuk bila Anda memilih masuk dengan Google.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Keamanan dan penyimpanan</h2>
        <ul>
          <li>Nomor telepon warga disimpan terenkripsi, bukan teks biasa.</li>
          <li>Akses pengelola dibatasi peran dan tercatat di log audit.</li>
          <li>
            Data operasional (sesi kedaluwarsa, kode verifikasi basi, akun
            anonim tak terpakai) dihapus otomatis secara berkala.
          </li>
          <li>
            Token sesi disimpan di penyimpanan lokal peramban Anda; keluar
            dari akun akan mengakhirinya.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Hak Anda</h2>
        <p>
          Anda dapat melihat dan mengoreksi nama tampilan, nomor, dan alamat
          dari dasbor, mematikan seluruh notifikasi kapan saja, dan meminta
          penghapusan akun beserta datanya kepada pengelola. Permintaan yang
          sah akan diproses tanpa biaya.
        </p>
      </section>

      <section>
        <h2>7. Perubahan kebijakan</h2>
        <p>
          Perubahan material akan tercermin dari tanggal pembaruan di atas.
          Pemakaian layanan yang berlanjut setelah pembaruan berarti Anda
          menyetujuinya.
        </p>
      </section>
    </LegalArticle>
  );
}
