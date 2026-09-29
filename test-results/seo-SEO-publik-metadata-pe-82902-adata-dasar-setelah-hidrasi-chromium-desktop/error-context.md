# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: seo.spec.ts >> SEO publik >> metadata per-listing menimpa metadata dasar setelah hidrasi
- Location: e2e/seo.spec.ts:33:3

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "Kembali ke katalog" [ref=e6] [cursor=pointer]:
          - /url: /#katalog
        - generic [ref=e9]:
          - button "Bagikan listing" [ref=e10] [cursor=pointer]
          - link "Sumenep Buku Kerja" [ref=e18] [cursor=pointer]:
            - /url: /
            - text: Sumenep
            - generic [ref=e19]: Buku
            - text: Kerja
    - main [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - generic [ref=e24]:
            - img "Ilustrasi Bengkel Bangunan Berkah" [ref=e25]:
              - generic [ref=e28]: BB
            - generic [ref=e30]:
              - generic [ref=e31]:
                - generic [ref=e32]: Servis Teknik
                - generic [ref=e33]: Tersedia
                - generic [ref=e35]: 4.9 (48)
                - generic [ref=e38]: Tercatat di katalog
              - heading "Bengkel Bangunan Berkah" [level=1] [ref=e42]:
                - generic [aria-hidden] [ref=e43]: Bengkel
                - generic [aria-hidden] [ref=e44]: Bangunan
                - generic [aria-hidden] [ref=e45]: Berkah
              - paragraph [ref=e46]: Jasa tukang,-cat, dan perbaikan rumah. Diterima pekerjaan kecil maupun besar.
              - generic [ref=e47]:
                - generic [ref=e48]: Tukang
                - generic [ref=e49]: Cat
                - generic [ref=e50]: Perbaikan rumah
              - generic [ref=e51]:
                - generic [ref=e57]:
                  - paragraph [ref=e58]: Alamat
                  - paragraph [ref=e59]: Jl. Trunojoyo No. 88, Sumenep · dekat Jl. Trunojoyo
                - generic [ref=e65]:
                  - paragraph [ref=e66]: Jam kerja
                  - paragraph [ref=e67]: Setiap hari · 07.00–17.00
                - generic [ref=e74]:
                  - paragraph [ref=e75]: Mulai dari
                  - paragraph [ref=e76]: Mulai Rp35.000
                - generic [ref=e81]:
                  - paragraph [ref=e82]: Kontak
                  - paragraph [ref=e83]: "081234567890"
              - button "Masuk untuk mengklaim usaha ini" [ref=e84] [cursor=pointer]
              - button "Laporkan listing" [ref=e86] [cursor=pointer]
          - generic [ref=e90]:
            - paragraph [ref=e91]: Catatan warga
            - heading "Pengalaman bersama Bengkel Bangunan Berkah" [level=2] [ref=e92]
            - paragraph [ref=e93]: Belum ada ulasan. Jika Anda pernah memakai layanan ini, pengalaman Anda dapat membantu warga lain.
            - generic [ref=e94]:
              - heading "Tulis ulasan" [level=3] [ref=e95]
              - generic [ref=e96]:
                - generic [ref=e97]:
                  - generic [ref=e98]: Nama Anda
                  - textbox "Nama Anda" [ref=e99]:
                    - /placeholder: Nama tampilan
                - generic [ref=e100]:
                  - generic [ref=e101]: Rating
                  - group "Rating" [ref=e102]:
                    - button "1 bintang" [ref=e103] [cursor=pointer]
                    - button "2 bintang" [ref=e106] [cursor=pointer]
                    - button "3 bintang" [ref=e109] [cursor=pointer]
                    - button "4 bintang" [ref=e112] [cursor=pointer]
                    - button "5 bintang" [pressed] [ref=e115] [cursor=pointer]
                  - generic [ref=e118]: 5 dari 5 bintang
                - generic [ref=e119]:
                  - generic [ref=e120]: Pengalaman
                  - textbox "Pengalaman" [ref=e121]:
                    - /placeholder: Ceritakan responsiveness, harga, dan hasil pekerjaan.
              - button [ref=e122] [cursor=pointer]
        - complementary [ref=e127]:
          - generic [ref=e129]:
            - paragraph [ref=e130]: Mulai dari sini
            - heading "Tanya langsung ke usaha ini." [level=2] [ref=e131]
            - paragraph [ref=e132]: Pesan sudah disiapkan otomatis supaya Anda tidak perlu mengetik dari awal.
            - link [ref=e133] [cursor=pointer]:
              - /url: https://wa.me/6281234567890?text=Halo%20Bengkel%20Bangunan%20Berkah%2C%20saya%20melihat%20listing%20Anda%20di%20Sumenep%20Buku%20Kerja.%20Apakah%20usaha%20sedang%20tersedia%20untuk%20kebutuhan%20hari%20ini%3F%20Saya%20berada%20di%20sekitar%20Jl.%20Trunojoyo.
            - generic [ref=e137]:
              - link "💰 Tanya harga" [ref=e138] [cursor=pointer]:
                - /url: https://wa.me/6281234567890?text=Halo%20Bengkel%20Bangunan%20Berkah%2C%20saya%20melihat%20listing%20Anda%20di%20Sumenep%20Buku%20Kerja.%20Mau%20tanya%20harga%20terbaru%20dan%20pilihan%20paket%20yang%20tersedia.%20Saya%20berada%20di%20sekitar%20Jl.%20Trunojoyo.
                - generic [ref=e139]: 💰
                - text: Tanya harga
              - link "Tanya estimasi" [ref=e140] [cursor=pointer]:
                - /url: https://wa.me/6281234567890?text=Halo%20Bengkel%20Bangunan%20Berkah%2C%20saya%20melihat%20listing%20Anda%20di%20Sumenep%20Buku%20Kerja.%20Boleh%20minta%20estimasi%20waktu%20selesai%20dan%20cakupan%20pekerjaan%3F%20Saya%20berada%20di%20sekitar%20Jl.%20Trunojoyo.
            - generic [ref=e144]:
              - link "Telepon mitra" [ref=e145] [cursor=pointer]:
                - /url: tel:6281234567890
              - button "Simpan listing" [ref=e148] [cursor=pointer]
            - generic [ref=e151]:
              - paragraph [ref=e152]: Simpan ke koleksi
              - generic [ref=e153]:
                - button "Untuk rumah" [ref=e154] [cursor=pointer]
                - button "Biasanya pesan" [ref=e155] [cursor=pointer]
                - button "Minggu ini" [ref=e156] [cursor=pointer]
                - button "Mendesak" [ref=e157] [cursor=pointer]
            - generic [ref=e158]:
              - generic [aria-hidden] [ref=e159]: ✎
              - generic [ref=e160]: Transaksi dan kesepakatan tetap dilakukan langsung bersama mitra.
  - region "Notifications alt+T"
```