import { httpRouter } from "convex/server";
import type { GenericActionCtx } from "convex/server";
import { httpAction } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { mapTwilioStatus, parseMetaStatuses } from "../lib/whatsapp-webhook";

const http = httpRouter();

auth.addHttpRoutes(http);

async function hmacHex(secret: string, body: string, algorithm: "SHA-1" | "SHA-256") {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Bandingkan panjang tetap agar perbandingan tidak bocor lewat waktu.
function sameSecret(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function validTwilioSignature(request: Request, body: string, params: URLSearchParams) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("X-Twilio-Signature");
  if (!token || !signature) return false;
  const signedPayload =
    new URL(request.url).toString() +
    [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([keyName, value]) => `${keyName}${value}`)
      .join("");
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(token),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const expected = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload)))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return sameSecret(expected, signature);
  } catch {
    return false;
  }
}

async function validMetaSignature(request: Request, body: string) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const header = request.headers.get("x-hub-signature-256");
  if (!secret || !header) return false;
  return sameSecret(`sha256=${await hmacHex(secret, body, "SHA-256")}`, header);
}

const applyMetaStatuses = async (ctx: GenericActionCtx<DataModel>, payload: unknown) => {
  let applied = 0;
  for (const event of parseMetaStatuses(payload)) {
    const matched = await ctx.runMutation(internal.whatsapp.applyDeliveryStatus, {
      providerMessageId: event.providerMessageId,
      status: event.status,
      errorCode: event.errorCode,
    });
    if (matched) applied += 1;
  }
  return applied;
};

// Satu endpoint untuk dua provider: Twilio mengirim form-encoded, Meta mengirim
// JSON. Keduanya diverifikasi signature-nya sebelum menyentuh database.
const whatsappWebhook = httpAction(async (ctx, request) => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("hub.mode") !== "subscribe") {
      return new Response("Method not allowed", { status: 405 });
    }
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!expected || !sameSecret(url.searchParams.get("hub.verify_token") ?? "", expected)) {
      return new Response("Invalid verify token", { status: 403 });
    }
    return new Response(url.searchParams.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await request.text();
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    if (!(await validMetaSignature(request, body))) {
      return new Response("Invalid signature", { status: 403 });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    const applied = await applyMetaStatuses(ctx, payload);
    return new Response(JSON.stringify({ ok: true, applied }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const params = new URLSearchParams(body);
  if (!(await validTwilioSignature(request, body, params))) {
    return new Response("Invalid signature", { status: 403 });
  }
  const providerMessageId = params.get("MessageSid") ?? params.get("SmsSid");
  const status = mapTwilioStatus(params.get("MessageStatus") ?? params.get("SmsStatus"));
  if (!providerMessageId || !status) return new Response("Ignored", { status: 200 });
  await ctx.runMutation(internal.whatsapp.applyDeliveryStatus, {
    providerMessageId,
    status,
    errorCode: params.get("ErrorCode") ?? undefined,
  });
  return new Response("OK", { status: 200 });
});

http.route({ path: "/twilio/status", method: "POST", handler: whatsappWebhook });
http.route({ path: "/webhook/whatsapp", method: "POST", handler: whatsappWebhook });
http.route({ path: "/webhook/whatsapp", method: "GET", handler: whatsappWebhook });

export default http;
