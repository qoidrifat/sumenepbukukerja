import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";

const http = httpRouter();

auth.addHttpRoutes(http);

const statusMap: Record<string, "queued" | "sent" | "delivered" | "failed"> = {
  queued: "queued",
  accepted: "queued",
  sending: "sent",
  sent: "sent",
  delivered: "delivered",
  read: "delivered",
  failed: "failed",
  undelivered: "failed",
};

async function validTwilioSignature(request: Request, body: string, params: URLSearchParams) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("X-Twilio-Signature");
  if (!token || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["verify"],
  );
  const signedPayload =
    new URL(request.url).toString() +
    [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([keyName, value]) => `${keyName}${value}`)
      .join("");
  try {
    const signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(signedPayload));
  } catch {
    return false;
  }
}

const twilioStatusWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await request.text();
  const params = new URLSearchParams(body);
  if (!(await validTwilioSignature(request, body, params))) {
    return new Response("Invalid signature", { status: 403 });
  }
  const providerMessageId = params.get("MessageSid") ?? params.get("SmsSid");
  const status = statusMap[params.get("MessageStatus") ?? params.get("SmsStatus") ?? ""];
  if (!providerMessageId || !status) return new Response("Ignored", { status: 200 });
  await ctx.runMutation(internal.whatsapp.applyDeliveryStatus, {
    providerMessageId,
    status,
    errorCode: params.get("ErrorCode") ?? undefined,
  });
  return new Response("OK", { status: 200 });
});

// Alias provider-agnostic agar URL webhook produksi bisa memakai
// https://<domain>/webhook/whatsapp selain path bawaan Twilio.
// Kedua path memakai handler dan validasi signature yang sama.
for (const path of ["/twilio/status", "/webhook/whatsapp"]) {
  http.route({ path, method: "POST", handler: twilioStatusWebhook });
}

export default http;
