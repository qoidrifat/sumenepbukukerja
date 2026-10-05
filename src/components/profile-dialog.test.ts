import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./profile-dialog.tsx", import.meta.url), "utf8");

test("dialog terkendali pemanggil + mutation profil existing", () => {
  expect(src).toContain("export function ProfileDialog");
  expect(src).toContain("open: boolean");
  expect(src).toContain("onOpenChange: (open: boolean) => void");
  expect(src).toContain("api.users.myProfile");
  expect(src).toContain("api.users.updateMyProfile");
  expect(src).toContain("uploadWithDedup(");
  expect(src).toContain("setPending(result.storageId)");
});

test("tema publik, bukan tema admin", () => {
  expect(src).toContain('from "@/components/ui/dialog"');
  expect(src).toContain("<DialogContent");
  expect(src).toContain("focusRing");
  expect(src).not.toContain("admin-dialog");
  expect(src).not.toContain("admin-input");
  expect(src).not.toContain("admin-btn");
  expect(src).not.toContain("border-[#121212]");
});

test("menghapus foto niat eksplisit; email read-only", () => {
  expect(src).toContain("removeImage: removePhoto ? true : undefined");
  expect(src).toContain("{profile?.email}");
  expect(src).toContain("Email tidak bisa diubah di sini.");
});

test("warga tanpa peran tetap punya label", () => {
  expect(src).toContain('"Warga"');
});
