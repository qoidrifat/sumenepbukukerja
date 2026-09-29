# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> Skenario A — landing, autentikasi, dashboard >> halaman publik terbuka, dan rute terlindungi menawarkan masuk sambil mempertahankan tujuan
- Location: e2e/flows.spec.ts:21:3

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - main [ref=f1e3]:
    - generic [ref=f1e4]:
      - button "Kembali" [ref=f1e5] [cursor=pointer]
      - generic [ref=f1e8]: Akun warga
    - generic [ref=f1e15]:
      - generic [ref=f1e16]:
        - button "Buka beranda Sumenep Buku Kerja" [ref=f1e17] [cursor=pointer]
        - generic [ref=f1e18]: Masuk ke Buku Kerja
        - generic [ref=f1e19]: Simpan listing favorit dan sinkronkan dari perangkat mana pun.
      - generic [ref=f1e21]:
        - generic [ref=f1e22]:
          - generic [ref=f1e23]: Email
          - textbox "Email" [ref=f1e25]:
            - /placeholder: nama@email.com
        - button "Kirim kode masuk" [ref=f1e26] [cursor=pointer]
  - region "Notifications alt+T"
```