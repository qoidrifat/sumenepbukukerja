import { describe, expect, test } from "vitest";
import { resolveRedirectAfterAuth } from "./auth-redirect";

describe("resolveRedirectAfterAuth", () => {
  test("path lokal diteruskan, open-redirect ditolak", () => {
    expect(resolveRedirectAfterAuth("/dashboard")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("//evil.com/x")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("https://evil.com")).toBe("/dashboard");
    expect(resolveRedirectAfterAuth(null)).toBe("/dashboard");
    expect(resolveRedirectAfterAuth("/admin", "/auth")).toBe("/admin");
  });
});
