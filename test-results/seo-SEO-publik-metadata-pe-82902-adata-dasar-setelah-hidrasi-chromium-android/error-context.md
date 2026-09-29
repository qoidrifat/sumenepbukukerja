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
        - button "Bagikan listing" [ref=e10] [cursor=pointer]
    - main [ref=e18]:
      - generic [ref=e19]:
        - generic [ref=e20]:
          - generic [ref=e22]:
            - img "Ilustrasi Bengkel Bangunan Berkah" [ref=e23]:
              - generic [ref=e26]: BB
            - generic [ref=e28]:
              - generic [ref=e29]:
                - generic [ref=e30]: Servis Teknik
                - generic [ref=e31]: Tersedia
                - generic [ref=e33]: 4.9 (48)
                - generic [ref=e36]: Tercatat di katalog
              - heading "Bengkel Bangunan Berkah" [level=1] [ref=e40]:
                - generic [aria-hidden] [ref=e41]: Bengkel
                - generic [aria-hidden] [ref=e42]: Bangunan
                - generic [aria-hidden] [ref=e43]: Berkah
              - paragraph [ref=e44]: Jasa tukang,-cat, dan perbaikan rumah. Diterima pekerjaan kecil maupun besar.
              - generic [ref=e45]:
                - generic [ref=e46]: Tukang
                - generic [ref=e47]: Cat
                - generic [ref=e48]: Perbaikan rumah
              - generic [ref=e49]:
                - generic [ref=e55]:
                  - paragraph [ref=e56]: Alamat
                  - paragraph [ref=e57]: Jl. Trunojoyo No. 88, Sumenep · dekat Jl. Trunojoyo
                - generic [ref=e63]:
                  - paragraph [ref=e64]: Jam kerja
                  - paragraph [ref=e65]: Setiap hari · 07.00–17.00
                - generic [ref=e72]:
                  - paragraph [ref=e73]: Mulai dari
                  - paragraph [ref=e74]: Mulai Rp35.000
                - generic [ref=e79]:
                  - paragraph [ref=e80]: Kontak
                  - paragraph [ref=e81]: "081234567890"
              - button "Masuk untuk mengklaim usaha ini" [ref=e82] [cursor=pointer]
              - button "Laporkan listing" [ref=e84] [cursor=pointer]
          - generic [ref=e88]:
            - paragraph [ref=e89]: Catatan warga
            - heading "Pengalaman bersama Bengkel Bangunan Berkah" [level=2] [ref=e90]
            - paragraph [ref=e91]: Belum ada ulasan. Jika Anda pernah memakai layanan ini, pengalaman Anda dapat membantu warga lain.
            - generic [ref=e92]:
              - heading "Tulis ulasan" [level=3] [ref=e93]
              - generic [ref=e94]:
                - generic [ref=e95]:
                  - generic [ref=e96]: Nama Anda
                  - textbox "Nama Anda" [ref=e97]:
                    - /placeholder: Nama tampilan
                - generic [ref=e98]:
                  - generic [ref=e99]: Rating
                  - group "Rating" [ref=e100]:
                    - button "1 bintang" [ref=e101] [cursor=pointer]
                    - button "2 bintang" [ref=e104] [cursor=pointer]
                    - button "3 bintang" [ref=e107] [cursor=pointer]
                    - button "4 bintang" [ref=e110] [cursor=pointer]
                    - button "5 bintang" [pressed] [ref=e113] [cursor=pointer]
                  - generic [ref=e116]: 5 dari 5 bintang
                - generic [ref=e117]:
                  - generic [ref=e118]: Pengalaman
                  - textbox "Pengalaman" [ref=e119]:
                    - /placeholder: Ceritakan responsiveness, harga, dan hasil pekerjaan.
              - button [ref=e120] [cursor=pointer]
        - complementary [ref=e125]:
          - generic [ref=e127]:
            - paragraph [ref=e128]: Mulai dari sini
            - heading "Tanya langsung ke usaha ini." [level=2] [ref=e129]
            - paragraph [ref=e130]: Pesan sudah disiapkan otomatis supaya Anda tidak perlu mengetik dari awal.
            - link [ref=e131] [cursor=pointer]:
              - /url: https://wa.me/6281234567890?text=Halo%20Bengkel%20Bangunan%20Berkah%2C%20saya%20melihat%20listing%20Anda%20di%20Sumenep%20Buku%20Kerja.%20Apakah%20usaha%20sedang%20tersedia%20untuk%20kebutuhan%20hari%20ini%3F%20Saya%20berada%20di%20sekitar%20Jl.%20Trunojoyo.
            - generic [ref=e135]:
              - link "💰 Tanya harga" [ref=e136] [cursor=pointer]:
                - /url: https://wa.me/6281234567890?text=Halo%20Bengkel%20Bangunan%20Berkah%2C%20saya%20melihat%20listing%20Anda%20di%20Sumenep%20Buku%20Kerja.%20Mau%20tanya%20harga%20terbaru%20dan%20pilihan%20paket%20yang%20tersedia.%20Saya%20berada%20di%20sekitar%20Jl.%20Trunojoyo.
                - generic [ref=e137]: 💰
                - text: Tanya harga
              - link "Tanya estimasi" [ref=e138] [cursor=pointer]:
                - /url: https://wa.me/6281234567890?text=Halo%20Bengkel%20Bangunan%20Berkah%2C%20saya%20melihat%20listing%20Anda%20di%20Sumenep%20Buku%20Kerja.%20Boleh%20minta%20estimasi%20waktu%20selesai%20dan%20cakupan%20pekerjaan%3F%20Saya%20berada%20di%20sekitar%20Jl.%20Trunojoyo.
            - generic [ref=e142]:
              - link "Telepon mitra" [ref=e143] [cursor=pointer]:
                - /url: tel:6281234567890
              - button "Simpan listing" [ref=e146] [cursor=pointer]
            - generic [ref=e149]:
              - paragraph [ref=e150]: Simpan ke koleksi
              - generic [ref=e151]:
                - button "Untuk rumah" [ref=e152] [cursor=pointer]
                - button "Biasanya pesan" [ref=e153] [cursor=pointer]
                - button "Minggu ini" [ref=e154] [cursor=pointer]
                - button "Mendesak" [ref=e155] [cursor=pointer]
            - generic [ref=e156]:
              - generic [aria-hidden] [ref=e157]: ✎
              - generic [ref=e158]: Transaksi dan kesepakatan tetap dilakukan langsung bersama mitra.
    - generic [ref=e160]:
      - button "Simpan listing" [ref=e161] [cursor=pointer]
      - link [ref=e164] [cursor=pointer]:
        - /url: https://wa.me/6281234567890?text=Halo%20Bengkel%20Bangunan%20Berkah%2C%20saya%20melihat%20listing%20Anda%20di%20Sumenep%20Buku%20Kerja.%20Apakah%20usaha%20sedang%20tersedia%20untuk%20kebutuhan%20hari%20ini%3F%20Saya%20berada%20di%20sekitar%20Jl.%20Trunojoyo.
  - region "Notifications alt+T"
```