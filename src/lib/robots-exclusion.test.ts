import { expect, test } from "vitest";
import { buildRobotsTxt } from "./sitemap";

test("rute privat tidak untuk crawler", () => {
  const robots = buildRobotsTxt("https://contoh.id");
  for (const rute of ["/admin", "/dashboard", "/warga/dashboard", "/staff/dashboard", "/auth", "/invite/"]) {
    expect(robots, `Disallow ${rute}`).toContain(`Disallow: ${rute}`);
  }
  expect(robots).toContain("Allow: /");
});
