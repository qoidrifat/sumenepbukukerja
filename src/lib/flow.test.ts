import { describe, expect, test } from "vitest";
import { isOpenNow, searchByNeed } from "./catalog-data";
import { vendors } from "./catalog";
import {
  generateWhatsAppLink,
  generateWhatsAppMessage,
  type WhatsAppIntent,
} from "./whatsapp";

describe("resident main flow", () => {
  test("pencarian kebutuhan menemukan usaha yang relevan", () => {
    const results = searchByNeed(vendors, "servis pompa air");
    expect(results.map((vendor) => vendor.slug)).toContain("karya-jaya");
  });

  test("setiap intent WhatsApp membawa konteks yang berbeda", () => {
    const base = {
      vendorName: "Karya Jaya",
      category: "Servis Teknik",
      landmark: "Adipura",
    };
    const intents: WhatsAppIntent[] = ["general", "availability", "price", "estimate", "request"];
    const messages = intents.map((intent) =>
      generateWhatsAppMessage({
        ...base,
        intent,
        reference: "Butuh tukang dekat rumah",
      }),
    );
    expect(new Set(messages).size).toBe(intents.length);
    expect(messages.every((message) => message.includes("Karya Jaya"))).toBe(true);
    expect(messages[3]).toContain("estimasi waktu selesai");
    expect(messages[4]).toContain("Butuh tukang dekat rumah");

    const link = generateWhatsAppLink({
      ...base,
      phone: "081234567890",
      intent: "availability",
    });
    expect(link).toContain("wa.me/6281234567890");
    expect(link).toContain("text=");
  });

  test("filter buka-now membedakan status 24 jam dan tutup", () => {
    expect(isOpenNow("24 jam", "available")).toBe(true);
    expect(isOpenNow("Setiap hari · 07.00–17.00", "closed")).toBe(false);
  });
});
