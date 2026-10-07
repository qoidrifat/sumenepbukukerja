import { describe, expect, test } from "vitest";
import { formatConvexError } from "./whatsapp";
import { buildTemplatePayload } from "./whatsapp-payload";

describe("buildTemplatePayload", () => {
  test("template dengan variabel mengirim dua parameter", () => {
    const payload = buildTemplatePayload(
      { phone: "6281234567890", title: "a", body: "b" },
      { name: "t", language: "id", titleParam: "judul", bodyParam: "isi" },
    );
    expect(
      // @ts-expect-error memastikan komponen benar-benar ada pada varian ini
      payload.template.components[0].parameters,
    ).toHaveLength(2);
  });

  test("template tanpa variabel tidak menyisipkan komponen (Meta menolak 132000)", () => {
    const payload = buildTemplatePayload(
      { phone: "6281234567890", title: "a", body: "b" },
      { name: "3p_direct_integration_test_template", language: "en_US", titleParam: "", bodyParam: "" },
    );
    expect(payload).not.toHaveProperty("template.components");
  });
});

describe("formatConvexError", () => {
  test("melepas pembungkus Uncaught Error dan jejak handler Convex", () => {
    expect(
      formatConvexError(
        new Error(
          "Uncaught Error: Meta menolak pesan teks di luar jendela layanan 24 jam. Kode 131008 at handler (../src/convex/whatsapp.ts:700:12) Called by client",
        ),
        "fallback",
      ),
    ).toBe("Meta menolak pesan teks di luar jendela layanan 24 jam. Kode 131008");
  });

  test("melepas amplop CONVEX, Request ID, dan penanda Server Error", () => {
    expect(
      formatConvexError(
        new Error(
          "[CONVEX A(whatsapp:sendTestWhatsapp)] [Request ID: 922580608e953084] Server Error Uncaught Error: Access token Meta kedaluwarsa atau dicabut. Kode 190, pesan provider: Authentication Error. at handler (../src/convex/whatsapp.ts:1109:4) Called by client",
        ),
        "fallback",
      ),
    ).toBe(
      "Access token Meta kedaluwarsa atau dicabut. Kode 190, pesan provider: Authentication Error.",
    );
  });

  test("pesan server tanpa pembungkus tetap utuh", () => {
    expect(
      formatConvexError(
        new Error("WHATSAPP_TEMPLATE_NAME belum diisi, jadi pesan dikirim sebagai teks bebas."),
        "fallback",
      ),
    ).toBe("WHATSAPP_TEMPLATE_NAME belum diisi, jadi pesan dikirim sebagai teks bebas.");
  });

  test("fallback dipakai saat tidak ada pesan yang bisa dibaca", () => {
    expect(formatConvexError(new Error(""), "Pesan uji belum dapat dikirim.")).toBe(
      "Pesan uji belum dapat dikirim.",
    );
    expect(formatConvexError(undefined, "Pesan uji belum dapat dikirim.")).toBe(
      "Pesan uji belum dapat dikirim.",
    );
    expect(formatConvexError({}, "Pesan uji belum dapat dikirim.")).toBe(
      "Pesan uji belum dapat dikirim.",
    );
  });

  test("string biasa dan lokasi file lokal ikut dibersihkan", () => {
    expect(
      formatConvexError(
        "Error: Pesan uji sudah dikirim hari ini. (src/convex/whatsapp.ts:640:5)",
        "fallback",
      ),
    ).toBe("Pesan uji sudah dikirim hari ini.");
  });
});
