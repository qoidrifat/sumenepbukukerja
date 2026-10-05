import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import { loaderRouteFor, loaderSequence } from "@/lib/mascot-loader";
import { MascotLoader } from "./mascot-loader";

/**
 * Loading screen bermaskot per rute.
 *
 * Kontrak: maskot beda per halaman, ekspresi berganti tiap 600ms
 * (4 ketuk = 2,4 detik), disiplin gerak repo (tanpa interval/listener/
 * tabindex; timeout berpasangan), dekoratif + pesan di teks.
 */

describe("peta rute ke maskot", () => {
  test("setiap rute publik punya state + caption sendiri", () => {
    expect(loaderRouteFor("/auth")).toMatchObject({ base: "hello" });
    expect(loaderRouteFor("/auth/email")).toMatchObject({ base: "hello" });
    expect(loaderRouteFor("/dashboard").base).toBe("found");
    expect(loaderRouteFor("/warga/dashboard").base).toBe("found");
    expect(loaderRouteFor("/staff/dashboard").base).toBe("found");
    expect(loaderRouteFor("/v/sate-madura").base).toBe("connect");
    expect(loaderRouteFor("/kebijakan-privasi").base).toBe("neutral");
    expect(loaderRouteFor("/syarat-ketentuan").base).toBe("neutral");
    expect(loaderRouteFor("/invite/abc").base).toBe("hello");
    expect(loaderRouteFor("/tidak-ada").base).toBe(loaderRouteFor("/").base);
  });

  test("admin satu pose tenang + tone admin", () => {
    expect(loaderRouteFor("/admin")).toMatchObject({ base: "working", tone: "admin" });
    expect(loaderSequence("working")).toEqual(["working"]);
  });

  test("koreografi selalu 4 ketuk dibuka state pembuka", () => {
    for (const base of ["search", "hello", "found", "connect", "neutral"] as const) {
      const seq = loaderSequence(base);
      expect(seq).toHaveLength(4);
      expect(seq[0]).toBe(base);
    }
  });
});

describe("disiplin gerak komponen baru", () => {
  const src = readFileSync(new URL("./mascot-loader.tsx", import.meta.url), "utf8");

  test("tanpa interval/listener/fokus; timeout berpasangan", () => {
    expect(src).not.toContain("setInterval");
    expect(src).not.toContain("addEventListener");
    expect(src).not.toContain("tabindex");
    expect(src).not.toContain("tabIndex");
    const sets = (src.match(/window\.setTimeout/g) ?? []).length;
    const clears = (src.match(/window\.clearTimeout/g) ?? []).length;
    expect(sets).toBeGreaterThan(0);
    expect(clears).toBeGreaterThanOrEqual(sets);
  });

  test("reduced-motion mematikan sirkus", () => {
    expect(src).toContain("useReducedMotion");
    expect(src).toContain("animated={!reduceMotion}");
  });
});

describe("render loader", () => {
  const render = (path: string) =>
    renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(MascotLoader)),
    );

  test("caption per rute tampil + tepat satu maskot", () => {
    const html = render("/auth");
    expect(html).toContain("Menyiapkan ruang masuk");
    expect(html.match(/<svg/g)?.length).toBe(1);
  });

  test("rute tak dikenal jatuh ke pencarian", () => {
    expect(render("/xyz")).toContain("Mencari usaha di sekitarmu");
  });
});
