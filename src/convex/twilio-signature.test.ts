/**
 * Diagnosis penandatanganan webhook Twilio (ERR-20260930-1W7KRTQ).
 *
 * Laporan produksi menyalahkan "signature tidak cocok" padahal akar
 * masalahnya adalah `TWILIO_AUTH_TOKEN` tidak pernah terpasang di environment
 * deployment: setiap permintaan Twilio yang sah gagal diverifikasi, dan
 * pesannya menunjuk ke orang yang salah untuk memperbaikinya.
 *
 * Yang dikunci di sini:
 *  1. Tiga alasan penolakan TERBEDAKAN — konfigurasi hilang, header hilang,
 *     dan signature memang salah tidak boleh tertukar.
 *  2. Pesan untuk signature tetap PERSIS sama dengan versi lama supaya
 *     sidik jari laporan yang sudah ada di panel tidak berubah.
 *  3. Verifikasi sah tetap mengikuti spesifikasi Twilio: HMAC-SHA1 atas
 *     URL lengkap + parameter yang diurutkan berdasar nama.
 */
import { createHmac } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { twilioRejectionMessage, validTwilioSignature } from "./http";

const webhookUrl = "https://focused-lemur-389.convex.site/webhook/whatsapp";
const originalToken = process.env.TWILIO_AUTH_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
  else process.env.TWILIO_AUTH_TOKEN = originalToken;
});

const sampleParams = () =>
  new URLSearchParams(
    "Body=Halo%20dari%20warga&From=6281234567890&To=whatsapp%2B14155238886",
  );

test("token tidak terpasang: ditolak sebagai konfigurasi, bukan signature salah", async () => {
  delete process.env.TWILIO_AUTH_TOKEN;
  const result = await validTwilioSignature(
    new Request(webhookUrl, { method: "POST" }),
    "Body=x",
    new URLSearchParams("Body=x"),
  );
  expect(result).toEqual({ ok: false, reason: "missing-token" });
  expect(twilioRejectionMessage("missing-token")).toContain("TWILIO_AUTH_TOKEN");
  expect(twilioRejectionMessage("missing-token")).toContain("environment");
});

test("token ada tapi permintaan tidak membawa X-Twilio-Signature", async () => {
  process.env.TWILIO_AUTH_TOKEN = "token-penguji";
  const result = await validTwilioSignature(
    new Request(webhookUrl, { method: "POST" }),
    "Body=x",
    new URLSearchParams("Body=x"),
  );
  expect(result).toEqual({ ok: false, reason: "missing-header" });
  expect(twilioRejectionMessage("missing-header")).toContain("X-Twilio-Signature");
});

test("signature memang salah: ditolak dengan pesan lama yang tidak berubah", async () => {
  process.env.TWILIO_AUTH_TOKEN = "token-penguji";
  const result = await validTwilioSignature(
    new Request(webhookUrl, {
      method: "POST",
      headers: { "X-Twilio-Signature": "abcdef012345" },
    }),
    "Body=x",
    new URLSearchParams("Body=x"),
  );
  expect(result).toEqual({ ok: false, reason: "mismatch" });
  expect(twilioRejectionMessage("mismatch")).toBe(
    "Webhook Twilio ditolak karena signature tidak cocok.",
  );
});

test("signature sah lolos: HMAC-SHA1 URL + parameter terurut", async () => {
  const secret = "token-penguji";
  process.env.TWILIO_AUTH_TOKEN = secret;
  const params = sampleParams();
  const signedPayload =
    webhookUrl +
    [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}${value}`)
      .join("");
  const signature = createHmac("sha1", secret).update(signedPayload, "utf8").digest("hex");
  const request = new Request(webhookUrl, {
    method: "POST",
    headers: { "X-Twilio-Signature": signature },
  });

  const result = await validTwilioSignature(request, params.toString(), params);
  expect(result).toEqual({ ok: true });
});
