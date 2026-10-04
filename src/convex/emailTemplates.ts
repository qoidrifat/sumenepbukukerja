export function renderOtpEmailHtml(code: string, year: number): string {
  return `<body style="
  margin:0;
  padding:0;
  background:#F7F8FC;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  color:#0F172A;
">

  <!-- Preheader -->
  <div style="
    display:none;
    max-height:0;
    overflow:hidden;
    opacity:0;
    color:transparent;
  ">
    Kode verifikasi Sumenep Buku Kerja kamu adalah ${code}. Abaikan bila kamu tidak memintanya.
  </div>

  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    style="background:#F7F8FC;"
  >
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Main Card -->
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            max-width:560px;
            background:#FFFFFF;
            border-radius:20px;
            overflow:hidden;
            box-shadow:0 8px 30px rgba(15,23,42,0.08);
          "
        >

          <!-- Brand Header: logo resmi + wordmark, bukan kotak "SB". -->
          <tr>
            <td style="
              padding:28px 32px 24px;
              border-bottom:1px solid #E9EDF2;
            ">

              <table
                role="presentation"
                cellspacing="0"
                cellpadding="0"
                border="0"
              >
                <tr>

                  <td
                    valign="middle"
                    align="center"
                    bgcolor="#2563EB"
                    style="
                      width:40px;
                      height:40px;
                      background:#2563EB;
                      border-radius:12px;
                      text-align:center;
                      vertical-align:middle;
                    "
                  >
                    <img
                      src="https://sumenepbukukerja.freebuff.app/brand/icon-64.png"
                      width="28"
                      height="28"
                      alt="Logo Sumenep Buku Kerja"
                      style="
                        display:block;
                        margin:0 auto;
                        border:0;
                        outline:none;
                      "
                    />
                  </td>

                  <td valign="middle" style="padding-left:12px;">

                    <div style="
                      font-size:16px;
                      line-height:22px;
                      font-weight:800;
                      letter-spacing:-0.4px;
                      color:#0F172A;
                    ">
                      Sumenep&nbsp;<span style="color:#2563EB;">Buku</span>&nbsp;Kerja
                    </div>

                    <div style="
                      margin-top:2px;
                      font-size:12px;
                      line-height:17px;
                      color:#64748B;
                    ">
                      Jasa dekat, tanpa ribet.
                    </div>

                  </td>

                </tr>
              </table>

            </td>
          </tr>


          <!-- Content -->
          <tr>
            <td style="padding:42px 32px 36px;">

              <!-- Eyebrow -->
              <div style="
                margin-bottom:12px;
                font-size:12px;
                line-height:18px;
                font-weight:700;
                letter-spacing:0.08em;
                text-transform:uppercase;
                color:#2563EB;
              ">
                Kode verifikasi
              </div>

              <!-- Title -->
              <h1 style="
                margin:0;
                font-size:28px;
                line-height:36px;
                font-weight:760;
                letter-spacing:-0.7px;
                color:#0F172A;
              ">
                Konfirmasi akses kamu
              </h1>

              <!-- Description -->
              <p style="
                margin:14px 0 0;
                font-size:15px;
                line-height:25px;
                color:#475569;
              ">
                Gunakan kode berikut untuk melanjutkan proses di
                <strong style="color:#0F172A;">
                  Sumenep Buku Kerja
                </strong>.
              </p>


              <!-- OTP Box -->
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="margin-top:28px;"
              >
                <tr>
                  <td
                    align="center"
                    bgcolor="#F5F8FF"
                    style="
                      padding:24px 16px;
                      background:#F5F8FF;
                      border:1px solid #DCE7FF;
                      border-radius:16px;
                    "
                  >

                    <div style="
                      font-size:11px;
                      line-height:16px;
                      font-weight:700;
                      letter-spacing:0.08em;
                      text-transform:uppercase;
                      color:#6B7280;
                      margin-bottom:9px;
                    ">
                      Kode OTP
                    </div>

                    <div style="
                      font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;
                      font-size:34px;
                      line-height:42px;
                      font-weight:800;
                      letter-spacing:7px;
                      color:#0F172A;
                      padding-left:7px;
                    ">
                      ${code}
                    </div>

                  </td>
                </tr>
              </table>


              <!-- Expiry -->
              <p style="
                margin:18px 0 0;
                text-align:center;
                font-size:13px;
                line-height:20px;
                color:#64748B;
              ">
                Kode ini berlaku selama
                <strong style="color:#334155;">
                  10 menit
                </strong>.
              </p>


              <!-- Security Notice -->
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="margin-top:32px;"
              >
                <tr>

                  <td
                    valign="top"
                    bgcolor="#FFE662"
                    style="
                      width:4px;
                      background:#FFE662;
                      border-radius:4px;
                    "
                  >
                    &nbsp;
                  </td>

                  <td style="padding-left:14px;">

                    <div style="
                      font-size:13px;
                      line-height:20px;
                      font-weight:700;
                      color:#0F172A;
                    ">
                      Jaga kode ini tetap rahasia
                    </div>

                    <div style="
                      margin-top:4px;
                      font-size:13px;
                      line-height:21px;
                      color:#64748B;
                    ">
                      Sumenep Buku Kerja tidak akan pernah meminta
                      kode OTP kamu melalui WhatsApp, telepon, atau
                      pesan pribadi.
                    </div>

                  </td>

                </tr>
              </table>


              <!-- Unknown Request -->
              <p style="
                margin:30px 0 0;
                font-size:13px;
                line-height:21px;
                color:#64748B;
              ">
                Kalau kamu tidak meminta kode ini, kamu bisa
                mengabaikan email ini. Akun kamu tetap aman.
              </p>

            </td>
          </tr>


          <!-- Accent bar: batas kartu terang ke footer gelap. -->
          <tr>
            <td
              bgcolor="#2563EB"
              style="
                height:3px;
                line-height:3px;
                font-size:0;
                background:#2563EB;
              "
            >
              &nbsp;
            </td>
          </tr>

          <!-- Footer: cermin Lapis B + D footer situs di atas slate-950. -->
          <tr>
            <td
              bgcolor="#020617"
              style="
                padding:28px 32px 30px;
                background:#020617;
              "
            >

              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
              >
                <tr>
                  <td valign="middle">

                    <div style="
                      font-size:15px;
                      line-height:22px;
                      font-weight:800;
                      letter-spacing:-0.3px;
                      color:#FFFFFF;
                    ">
                      Sumenep&nbsp;<span style="color:#93C5FD;">Buku</span>&nbsp;Kerja
                    </div>

                    <div style="
                      margin-top:6px;
                      font-size:13px;
                      line-height:20px;
                      font-weight:600;
                      color:#CBD5E1;
                    ">
                      Jasa dekat, tanpa ribet.
                    </div>

                  </td>
                </tr>
              </table>

              <div style="
                margin-top:18px;
                padding-top:16px;
                border-top:1px solid #1E293B;
                font-size:12px;
                line-height:19px;
                color:#CBD5E1;
              ">
                Email otomatis dari Sumenep Buku Kerja.
                Mohon tidak membalas email ini (noreply@sumenepbukukerja.com).
              </div>

              <div style="
                margin-top:8px;
                font-size:12px;
                line-height:19px;
                color:#CBD5E1;
              ">
                © ${year} Sumenep Buku Kerja
              </div>

            </td>
          </tr>

        </table>


        <!-- Outside Card: cermin Lapis C footer situs, satu kalimat. -->
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="max-width:560px;"
        >
          <tr>
            <td
              align="center"
              style="
                padding:22px 20px 4px;
                font-size:11px;
                line-height:18px;
                color:#94A3B8;
              "
            >
              Dirancang untuk kebutuhan masyarakat Sumenep, Madura.
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;
}
