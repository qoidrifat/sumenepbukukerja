import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

/**
 * Dokumen hukum publik — dibutuhkan dialog login dan rincian aplikasi
 * Meta/Google, jadi harus live, faktual, dan tertaut dari footer.
 */

const { default: PrivacyPolicy } = await import("./PrivacyPolicy");
const { default: TermsOfService } = await import("./TermsOfService");

const render = (Page: () => React.JSX.Element) =>
  renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(Page)));

describe("Kebijakan Privasi", () => {
  test("judul, tanggal, dan isi faktual operasional", () => {
    const html = render(PrivacyPolicy);
    expect(html).toContain("Kebijakan Privasi");
    expect(html).toContain("5 Oktober 2026");
    expect(html).toContain("WhatsApp");
    expect(html).toContain("terenkripsi");
    expect(html).toContain("Beranda");
  });
});

describe("Syarat & Ketentuan", () => {
  test("judul, tanggal, dan aturan operasional", () => {
    const html = render(TermsOfService);
    expect(html).toContain("Syarat");
    expect(html).toContain("Ketentuan");
    expect(html).toContain("5 Oktober 2026");
    expect(html).toContain("opt-in");
    expect(html).toContain("Beranda");
  });
});
