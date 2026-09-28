import { httpRouter } from "convex/server";
import type { GenericActionCtx } from "convex/server";
import { httpAction } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import {
  mapTwilioStatus,
  parseMetaInbound,
  parseMetaStatuses,
  parseTwilioInbound,
  type InboundMessage,
} from "../lib/whatsapp-webhook";
import { lookupGeoLocation } from "../lib/geo-enrichment";
import { trimUserAgent } from "../lib/admin-passcode";
import {
  maskIpForDisplay,
  resolveClientIp,
  sanitizeReferrer,
  sha256Hex,
  toHex as bytesToHex,
} from "../lib/security-context";
import { buildRobotsTxt, buildSitemapXml } from "../lib/sitemap";

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

/**
 * Catat kegagalan webhook ke pusat observability.
 *
 * Sengaja memakai `recordServerError` yang sama dengan mutasi biasa, dan
 * Sengaja tidak pernah melempar: kalau pelapor sendiri gagal, callback
 * provider tidak boleh ikut gagal dan memicu percobaan beruntun.
 */
const reportWebhookIssue = async (
  ctx: GenericActionCtx<DataModel>,
  input: {
    feature: string;
    operation: string;
    kind: "integration" | "critical" | "operation";
    code: string;
    severity: "warning" | "error" | "critical";
    message: string;
    context?: Record<string, unknown>;
  },
) => {
  try {
    await ctx.runMutation(internal.errorReports.recordServerError, {
      kind: input.kind,
      code: input.code,
      severity: input.severity,
      source: "webhook",
      feature: input.feature,
      operation: input.operation,
      message: input.message,
      context: input.context,
    });
  } catch (error) {
    // Reporter gagal. Dicatat di log server, lalu dihentikan di sini.
    console.warn("[ERROR_REPORT] gagal mencatat laporan webhook:", error);
  }
};

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

/* Webhook yang sama membawa status pengiriman dan chat masuk. Keduanya
   dicatat supaya dashboard punya status percakapan yang nyata. */
const recordInbound = async (ctx: GenericActionCtx<DataModel>, messages: InboundMessage[]) => {
  let recorded = 0;
  for (const message of messages) {
    const id = await ctx.runMutation(internal.whatsapp.recordInboundMessage, {
      phone: message.from,
      providerMessageId: message.providerMessageId,
      body: message.body,
      kind: message.kind,
      at: message.at,
    });
    if (id) recorded += 1;
  }
  return recorded;
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
      // Sering terjadi kalau secret belum cocok. Dipilih `warning`, bukan
      // `error`: tidak membangunkan admin, tapi tetap terlihat sebagai pola.
      await reportWebhookIssue(ctx, {
        feature: "WhatsApp Webhook",
        operation: "webhook.whatsapp.meta.signature",
        kind: "operation",
        code: "WHATSAPP_WEBHOOK_SIGNATURE",
        severity: "warning",
        message: "Webhook Meta ditolak karena signature tidak cocok.",
        context: { provider: "meta", path: new URL(request.url).pathname },
      });
      return new Response("Invalid signature", { status: 403 });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      await reportWebhookIssue(ctx, {
        feature: "WhatsApp Webhook",
        operation: "webhook.whatsapp.meta.parse",
        kind: "integration",
        code: "WHATSAPP_WEBHOOK_FAILED",
        severity: "error",
        message: "Body webhook Meta bukan JSON yang valid.",
        context: { provider: "meta", bytes: body.length },
      });
      return new Response("Invalid JSON", { status: 400 });
    }
    const applied = await applyMetaStatuses(ctx, payload);
    const inbound = await recordInbound(ctx, parseMetaInbound(payload));
    return new Response(JSON.stringify({ ok: true, applied, inbound }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const params = new URLSearchParams(body);
  if (!(await validTwilioSignature(request, body, params))) {
    await reportWebhookIssue(ctx, {
      feature: "WhatsApp Webhook",
      operation: "webhook.whatsapp.twilio.signature",
      kind: "operation",
      code: "WHATSAPP_WEBHOOK_SIGNATURE",
      severity: "warning",
      message: "Webhook Twilio ditolak karena signature tidak cocok.",
      context: { provider: "twilio", path: new URL(request.url).pathname },
    });
    return new Response("Invalid signature", { status: 403 });
  }
  // Twilio memakai satu endpoint untuk status pengiriman dan pesan masuk. Status
  // selalu membawa `MessageStatus`; pesan masuk tidak pernah membawanya.
  const inboundMessage = parseTwilioInbound(params);
  if (inboundMessage) {
    await recordInbound(ctx, [inboundMessage]);
    return new Response("OK", { status: 200 });
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

/**
 * Satu-satunya tempat di project ini yang bisa membaca header permintaan.
 *
 * `ctx` pada query/mutation/action Convex tidak punya properti `request`, jadi
 * IP hanya bisa ditangkap lewat `httpAction`. Route ini hanya mengumpulkan
 * metadata — tidak memverifikasi passcode, tidak menerbitkan tiket, dan
 * tidak mengubah alur autentikasi. Ia mengembalikan token sekali pakai yang
 * kemudian dipakai `verifyAdminPasscode` untuk mengambil metadata server.
 *
 * Yang dikembalikan ke browser hanya bentuk tersamar. IP mentah langsung
 * diturunkan jadi hash dan masker, lalu tidak pernah disimpan.
 */
const ADMIN_CONTEXT_ROUTE = "/admin-gate/context";

/**
 * Route ini dipanggil dari browser pada origin berbeda (aplikasi vs backend),
 * jadi harus menjawab preflight. Tanpa ini `OPTIONS` jatuh ke "no matching
 * routes" dan browser memblokir beacon sepenuhnya — gejalanya persis seperti
 * "IP selalu Unknown" padahal request-nya sebenarnya sampai.
 *
 * CATATAN LAPISAN PLATFORM (hasil audit, bukan workaround): Security
 * Desk masih bisa menampilkan `ipSource: "Unknown"` kalau platform meneruskan
 * request TANPA satu pun header edge (`cf-connecting-ip`, `x-real-ip`,
 * `true-client-ip`) dan `x-forwarded-for` hanya memuat hop proxy. Itu bukan bug
 * di sini: `resolveClientIp` sudah membaca rantai itu dan, dengan sengaja,
 * memakai entri paling KANAN (yang paling dekat dengan klien) alih-alih
 * sisi paling kiri yang paling mudah dipalsukan.
 *
 * Yang TIDAK dilakukan demi membuat Security Desk "terisi": mengarang nilai,
 * atau mempercayai header yang dikirim browser. Kalau platform formalized
 * alamat klien, header itu akan otomatis terpakai pada permintaan berikutnya —
 * tanpa perubahan kode.
 */
const CONTEXT_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-forwarded-for, x-real-ip, cf-connecting-ip, true-client-ip",
  "access-control-max-age": "600",
  "cache-control": "no-store",
};

const adminSecurityContext = httpAction(async (ctx, request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CONTEXT_CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CONTEXT_CORS_HEADERS });
  }
  try {
    const resolved = resolveClientIp(request.headers);
    const requestId = `req_${bytesToHex(crypto.getRandomValues(new Uint8Array(8)))}`;
    const userAgent = trimUserAgent(request.headers.get("user-agent") ?? undefined) ?? undefined;
    const referrer = sanitizeReferrer(request.headers.get("referer") ?? undefined) ?? undefined;
    const acceptLanguage = request.headers.get("accept-language")?.slice(0, 80) || undefined;

    // Geolokasi hanya dijalankan bila operator benar-benar mengonfigurasi
    // provider, dan tidak pernah menggagalkan login.
    const geo = resolved.ip
      ? await lookupGeoLocation(resolved.ip, process.env)
      : { city: null, region: null, country: null, networkType: null };

    const token = bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
    const expiresAt = await ctx.runMutation(internal.adminGate.captureSecurityContext, {
      token,
      ipHash: resolved.ip ? await sha256Hex(resolved.ip) : undefined,
      ipMasked: maskIpForDisplay(resolved.ip) ?? undefined,
      ipSource: resolved.source,
      ipFamily: resolved.family,
      ipTrust: resolved.trust,
      proxyDetected: resolved.proxyDetected,
      chainLength: resolved.chainLength,
      mappedFromIpv6: resolved.mappedFromIpv6,
      userAgent,
      referrer,
      acceptLanguage,
      requestId,
      country: geo.country ?? undefined,
      region: geo.region ?? undefined,
      city: geo.city ?? undefined,
      networkType: geo.networkType ?? undefined,
    });

    return Response.json(
      {
        contextId: token,
        requestId,
        // Masked saja. Browser tidak pernah melihat alamat lengkap.
        ipMasked: maskIpForDisplay(resolved.ip) ?? null,
        ipSource: resolved.source,
        ipFamily: resolved.family,
        ipTrust: resolved.trust,
        proxyDetected: resolved.proxyDetected,
        chainLength: resolved.chainLength,
        userAgent: userAgent ?? null,
        acceptLanguage: acceptLanguage ?? null,
        country: geo.country ?? null,
        region: geo.region ?? null,
        city: geo.city ?? null,
        networkType: geo.networkType ?? null,
        geoResolved: Boolean(geo.country || geo.city || geo.region),
        expiresAt,
      },
      { headers: { "content-type": "application/json", ...CONTEXT_CORS_HEADERS } },
    );
  } catch {
    // Gagal menangkap konteks bukan alasan menolak halaman auth — login tetap
    // jalan, hanya auditnya yang lebih tipis.
    return Response.json(
      {
        contextId: null,
        requestId: null,
        ipMasked: null,
        ipSource: "Unknown",
        ipFamily: "unknown",
        ipTrust: "unknown",
        proxyDetected: false,
        chainLength: 0,
      },
      { status: 200, headers: CONTEXT_CORS_HEADERS },
    );
  }
});

http.route({ path: ADMIN_CONTEXT_ROUTE, method: "POST", handler: adminSecurityContext });
http.route({ path: ADMIN_CONTEXT_ROUTE, method: "GET", handler: adminSecurityContext });
// Router Convex tidak meneruskan OPTIONS ke handler POST dengan sendirinya;
// tanpa baris ini preflight jatuh ke "no matching routes" dan beacon diblokir
// browser, walau request-nya sebenarnya sampai ke origin.
http.route({ path: ADMIN_CONTEXT_ROUTE, method: "OPTIONS", handler: adminSecurityContext });

/**
 * Sitemap dan robots.txt.
 *
 * Dipasang di origin HTTP Convex karena route di situ benar-benar dievaluasi
 * server, sedangkan halaman `/v/:slug` dirender peramban — sehingga tidak ada
 * satu pun route publik yang bisa "terindex" kalau tidak sengaja.
 *
 * Asal situs diambil dari `SITE_URL` bila diisi (domain aplikasi yang
 * sebenarnya), lalu `CONVEX_SITE_URL` sebagai cadangan. Kalau keduanya kosong,
 * sitemap dibalas dengan tetap valid tapi tanpa entri listing — lebih baik
 * daripada menebak domain yang salah dan mengarahkan crawler ke tempat yang
 * tidak ada.
 */
const siteOrigin = () =>
  (process.env.SITE_URL?.trim() || process.env.CONVEX_SITE_URL?.trim() || "").replace(/\/+$/, "");

const sitemap = httpAction(async (ctx) => {
  const origin = siteOrigin();
  const vendors = origin ? await ctx.runQuery(internal.vendors.publicSitemapVendors, {}) : [];
  return new Response(buildSitemapXml({ origin, vendors }), {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
});

const robots = httpAction(async () => {
  const origin = siteOrigin();
  return new Response(
    origin
      ? buildRobotsTxt(origin)
      : ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /dashboard", "Disallow: /auth", ""].join("\n"),
    { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } },
  );
});

http.route({ path: "/sitemap.xml", method: "GET", handler: sitemap });
http.route({ path: "/robots.txt", method: "GET", handler: robots });

export default http;
