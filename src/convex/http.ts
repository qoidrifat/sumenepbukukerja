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
import { contextCorsHeaders as contextCorsHeadersForEnv } from "../lib/admin-context-cors";
import {
  RELAY_ROUTE,
  RELAY_SECRET_ENV,
  normalizeRelayPayload,
  relayDisplayIp,
  type RelayPayload,
} from "../lib/admin-context-relay";
import {
  RELAY_SIGNATURE_HEADER_NONCE,
  RELAY_SIGNATURE_HEADER_SIGNATURE,
  RELAY_SIGNATURE_HEADER_TIMESTAMP,
  RELAY_TIMESTAMP_WINDOW_MS,
  keyedHash,
  verifyRelayRequest,
} from "../lib/admin-relay-signature";
import {
  buildTelemetryLog,
  deriveTelemetryStatus,
  ipHashMethodFor,
  type IpHashMethod,
  type TelemetryStatus,
} from "../lib/admin-telemetry";
import { resolveIpHashSecret } from "../lib/admin-ip-hash";
import { resolveEnvironment } from "../lib/error-reporting";
import {
  maskIpForDisplay,
  normalizeIpDetailed,
  resolveClientIp,
  sanitizeReferrer,
  sha256Hex,
  toHex as bytesToHex,
} from "../lib/security-context";
import { buildRobotsTxt, buildSitemapXml } from "../lib/sitemap";
import { CONTEXT_REQUEST_LIMIT, CONTEXT_REQUEST_WINDOW_MS } from "./adminGate";

/**
 * Tulis satu baris log telemetry yang aman.
 *
 * Isinya dibatasi daftar putih di `buildTelemetryLog`, jadi field di luar
 * daftar itu tidak punya jalan masuk ke sini sama sekali. Kegagalan
 * menulis log tidak boleh menggagalkan permintaan: menambah telemetri tidak
 * boleh menjatuhkan audit yang sedang berjalan.
 */
/**
 * Apakah deployment ini produksi.
 *
 * Dipakai untuk memutuskan apakah `SERVER_IP_HASH_SECRET` wajib ada. Urutan
 * pembacannya milik `resolveEnvironment`, jadi berkas ini tidak punya
 * definisi "apa itu produksi" sendiri yang bisa berbeda dari Security Desk.
 */
function isProduction(): boolean {
  return resolveEnvironment(process.env) === "production";
}

function logTelemetry(line: ReturnType<typeof buildTelemetryLog>) {
  try {
    console.log(JSON.stringify(line));
  } catch {
    // Log yang gagal menulis tidak boleh mengubah jawaban ke pemanggil.
  }
}

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

/**
 * Alasan penolakan webhook Twilio.
 *
 * Dipisah supaya laporan produksi menunjuk akar masalah yang benar:
 * ERR-20260930-1W7KRTQ dilaporkan sebagai "signature tidak cocok" padahal
 * `TWILIO_AUTH_TOKEN` tidak pernah terpasang — memperbaiki signature tidak
 * menyelesaikan apa pun selama tokennya kosong.
 */
export type TwilioSignatureRejection = "missing-token" | "missing-header" | "mismatch";

export type SignatureVerdict = { ok: true } | { ok: false; reason: TwilioSignatureRejection };

/**
 * Pesan penolakan per alasan.
 *
 * Pesan `mismatch` sengaja PERSIS sama dengan versi lama: sidik jari laporan
 * di panel dihitung dari teks ini, dan mengubahnya memecah riwayat yang
 * sudah ada.
 */
export const twilioRejectionMessage = (reason: TwilioSignatureRejection): string =>
  reason === "missing-token"
    ? "Webhook Twilio ditolak karena TWILIO_AUTH_TOKEN belum terpasang di environment deployment, sehingga setiap permintaan Twilio gagal diverifikasi."
    : reason === "missing-header"
      ? "Webhook Twilio ditolak karena permintaan tidak membawa header X-Twilio-Signature."
      : "Webhook Twilio ditolak karena signature tidak cocok.";

/** Tindakan yang benar untuk penolakan yang berakar pada konfigurasi. */
export const twilioRejectionAction = (reason: TwilioSignatureRejection): string | undefined =>
  reason === "missing-token"
    ? "Pasang TWILIO_AUTH_TOKEN di environment deployment Convex (bunx convex env set TWILIO_AUTH_TOKEN <token> --prod), atau matikan webhook Twilio di dashboard provider bila tidak dipakai."
    : undefined;

export async function validTwilioSignature(
  request: Request,
  body: string,
  params: URLSearchParams,
): Promise<SignatureVerdict> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("X-Twilio-Signature");
  if (!token) return { ok: false, reason: "missing-token" };
  if (!signature) return { ok: false, reason: "missing-header" };
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
    return sameSecret(expected, signature) ? { ok: true } : { ok: false, reason: "mismatch" };
  } catch {
    return { ok: false, reason: "mismatch" };
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
/** Batas badan webhook yang diterima, dalam byte. */
const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

const reportWebhookIssue = async (
  ctx: GenericActionCtx<DataModel>,
  input: {
    feature: string;
    operation: string;
    kind: "integration" | "critical" | "operation";
    code: string;
    severity: "warning" | "error" | "critical";
    message: string;
    /** Path rute yang dilaporkan, dipakai sebagai subjek `endpoint_error_burst`. */
    path?: string;
    context?: Record<string, unknown>;
    /** Tindakan perbaikan spesifik alasan, kalau ada. */
    recommendedAction?: string;
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
      recommendedAction: input.recommendedAction,
    });
  } catch (error) {
    // Reporter gagal. Dicatat di log server, lalu dihentikan di sini.
    console.warn("[ERROR_REPORT] gagal mencatat laporan webhook:", error);
  }

  /*
   * FASE 7 - TANDATANGAN WEBHOOK YANG TIDAK COCOK ADALAH SINYAL PALING KERAS
   * DI SELURUH KATALOG ATURAN.
   *
   * Alasannya sederhana: tidak ada klien sah yang gagal tiga kali. Baik Meta
   * maupun Twilio menandatangani isi permintaannya dengan secret yang hanya
   * dipegang provider dan server ini; permintaan yang tandatangannya tidak
   * cocok berarti ada pihak ketiga yang memanggil endpoint webhook tanpa
   * memegang secret itu. Yang dicoba dicapai jelas: menyuntikkan pesan masuk,
   * membaca status pengiriman, atau sekadar memaksa server bekerja.
   *
   * DITEMPATKAN SETELAH laporan error disimpan, dan itu disengaja: laporan itu
   * yang menyimpan `occurrences`, dan `recordWebhookSignatureFailure` memakai
   * angka itu sebagai hitungannya. Kalau urutannya dibalik, setiap insiden
   * akan tertinggal satu kejadian dari kenyataan.
   *
   * DIBUNGKUS try/catch terpisah supaya jalur deteksi tidak pernah bisa
   * mengubah respons HTTP yang sudah benar. Penolakan `403` tetap dikirim apa
   * pun yang terjadi pada pencatatan.
   */
  if (input.operation.includes("signature")) {
    const provider = input.operation.includes("meta")
      ? "meta"
      : input.operation.includes("twilio")
        ? "twilio"
        : "whatsapp";
    try {
      await ctx.runMutation(internal.securityIncidents.recordWebhookSignatureFailure, {
        provider,
        route: "/whatsapp/webhook",
      });
    } catch (error) {
      console.warn("[SECURITY_INCIDENT] gagal mencatat insiden tandatangan webhook:", error);
    }
  }

  /*
   * FASE 10 - `endpoint_error_burst`. Berbeda dari blok di atas, yang HANYA
   * berlaku pada kegagalan signature, ini berlaku pada SETIAP masalah yang
   * dilaporkan lewat fungsi ini: body JSON rusak, content type salah, atau
   * data provider yang tidak bisa diproses.
   *
   * Blok signature sudah menutup kasus "pihak ketiga memanggil tanpa secret".
   * Yang belum tertutup adalah "endpoint ini sedang gagal terus" - yang bisa
   * berasal dari provider yang salah konfigurasi maupun dari pemanggil yang
   * menebak. Keduanya terlihat sama dari luar, jadi keduanya dilaporkan.
   *
   * Terpisah try/catch, sama seperti di atas: jalur deteksi tidak boleh pernah
   * mengubah respons HTTP yang sudah benar.
   */
  try {
    await ctx.runMutation(internal.securityIncidents.recordEndpointErrorBurst, {
      route: input.path ?? "/whatsapp/webhook",
      feature: input.feature,
    });
  } catch (error) {
    console.warn("[SECURITY_INCIDENT] gagal mencatat insiden endpoint:", error);
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

  /*
   * FASE 10 - BATAS UKURAN BADAN.
   *
   * `request.text()` membaca SELURUH badan ke memori sebelum ada yang memeriksa
   * ukurannya. Tanpa pagar di sini, satu permintaan webhook yang sah
   * tandatangannya bisa mengirim badan raksasa dan membuat action ini keelahan
   * memori - persis pada endpoint yang tugasnya menerima kiriman dari luar.
   *
   * Batasnya longgar (256 kB) dan dibaca dari header kalau ada, karena body
   * webhook provider yang sah jauh di bawah itu. Yang dilindungi adalah* memori action, bukan pembatasan pada provider.
   */
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > WEBHOOK_MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }

  const body = await request.text();
  if (body.length > WEBHOOK_MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }
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
        path: new URL(request.url).pathname,
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
        path: new URL(request.url).pathname,
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
  const verdict = await validTwilioSignature(request, body, params);
  if (!verdict.ok) {
    await reportWebhookIssue(ctx, {
      feature: "WhatsApp Webhook",
      operation: "webhook.whatsapp.twilio.signature",
      kind: "operation",
      code: "WHATSAPP_WEBHOOK_SIGNATURE",
      severity: "warning",
      message: twilioRejectionMessage(verdict.reason),
      recommendedAction: twilioRejectionAction(verdict.reason),
      context: {
        provider: "twilio",
        path: new URL(request.url).pathname,
        rejection: verdict.reason,
      },
      path: new URL(request.url).pathname,
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
// Aturan CORS hidup di modul murni supaya fungsi Vercel di
// `api/admin-context.ts` memakai aturan yang PERSIS sama tanpa menarik
// `convex/server` ke runtime server. Di-ekspor ulang di sini supaya test yang
// sudah ada tidak perlu tahu file mana yang memegang kebenarannya.
export {
  CONTEXT_CORS_METHODS,
  CONTEXT_CORS_REQUEST_HEADERS,
  allowedContextOrigins,
  allowWildcardContextCors,
  resolveContextCorsMode,
  buildContextCorsHeaders,
} from "../lib/admin-context-cors";

/** Header CORS untuk satu request, memakai allowlist dari environment. */
const contextCorsHeaders = (request: Request) =>
  contextCorsHeadersForEnv(request.headers.get("origin"), process.env);


const adminSecurityContext = httpAction(async (ctx, request: Request) => {
  const corsHeaders = contextCorsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  try {
    const resolved = resolveClientIp(request.headers);

    /*
     * FASE 6 - BATAS PERMINTAAN, DILETAK SEBELUM PEKERJAAN BERAT.
     *
     * Resolve IP dan sha256nya harus terjadi lebih dulu justru supaya
     * perhitungannya bisa dilakukan: kunci batasnya harus berasal dari IP yang
     * diamati server, bukan dari apa pun yang dikirim klien. Tanpa itu,
     * rate limit bisa dilewati dengan mengganti header di setiap permintaan.
     *
     * Dihitung dari baris `adminSecurityContexts` yang sudah ada (lihat
     * `adminGate.contextRequestWindow`), jadi tidak ada tabel penghitung baru
     * yang harus dipelihara dan tidak ada state yang bisa tidak sinkron.
     *
     * Permintaan yang DITOLAK tidak pernah menggagalkan auth: gerbang passcode
     * tetap jalan tanpa metadata IP, hanya Security Desk yang lebih tipis.
     * Jangan sampai penolakan ini diterjemahkan UI sebagai passcode belum
     * dikonfigurasi: dua-duanya bawaan gagal, tapi maknanya sama sekali berbeda.
     */
    if (resolved.ip) {
      const ipHash = await sha256Hex(resolved.ip);
      const usage = await ctx.runMutation(internal.adminGate.contextRequestWindow, { ipHash });
      if (usage.count >= CONTEXT_REQUEST_LIMIT) {
        return Response.json(
          { error: "rate_limited", retryAfterSeconds: CONTEXT_REQUEST_WINDOW_MS / 1000 },
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              // Header ini harus ada juga di respons 429: tanpa
              // `access-control-allow-origin` yang benar, peramban tidak akan
              // membaca body-nya dan akan menampilkan error jaringan umum.
              ...corsHeaders,
              "retry-after": String(CONTEXT_REQUEST_WINDOW_MS / 1000),
            },
          },
        );
      }
    }

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
    // Kunci hash IP: punya sendiri kalau ada, kalau tidak secret relay.
    // Tanpa kunci, `ipHash` sengaja dibiarkan kosong dan metodenya
    // dicatat `unavailable` - lebih jujur daripada diam-diam memakai
    // hash polos yang bisa dicocokkan dengan daftar alamat diketahui.
    const ipHashKey = resolveIpHashSecret(process.env, { production: isProduction() });
    const ipHash =
      resolved.ip && ipHashKey.secret ? await keyedHash(resolved.ip, ipHashKey.secret) : null;
    const ipHashMethod: IpHashMethod = ipHashMethodFor(ipHashKey, Boolean(ipHash));
    const geoResolved = Boolean(geo.country || geo.city || geo.region);
    const telemetryStatus: TelemetryStatus = deriveTelemetryStatus({
      relay: "convex",
      hasIp: Boolean(resolved.ip),
      hasGeo: geoResolved,
    });
    const expiresAt = await ctx.runMutation(internal.adminGate.captureSecurityContext, {
      token,
      ipHash: ipHash ?? undefined,
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
      relay: "convex",
      telemetryStatus,
      ipHashMethod,
      country: geo.country ?? undefined,
      region: geo.region ?? undefined,
      city: geo.city ?? undefined,
      networkType: geo.networkType ?? undefined,
    });

    return Response.json(
      {
        contextId: token,
        requestId,
        relay: "convex",
        telemetryStatus,
        ipHashMethod,
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
      { headers: { "content-type": "application/json", ...corsHeaders } },
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
      { status: 200, headers: corsHeaders },
    );
  }
});

http.route({ path: ADMIN_CONTEXT_ROUTE, method: "POST", handler: adminSecurityContext });
http.route({ path: ADMIN_CONTEXT_ROUTE, method: "GET", handler: adminSecurityContext });
// Router Convex tidak meneruskan OPTIONS ke handler POST dengan sendirinya;
// tanpa baris ini preflight jatuh ke "no matching routes" dan beacon diblokir
// browser, walau request-nya sebenarnya sampai ke origin.
http.route({ path: ADMIN_CONTEXT_ROUTE, method: "OPTIONS", handler: adminSecurityContext });

/* ------------------------------------------------------------------ *
 * Relay IP dari edge Vercel
 * ------------------------------------------------------------------ */

/**
 * Menerima alamat IP yang benar-benar diamati edge, lalu menyimpannya dengan
 * perlakuan yang sama seperti route langsung di atas.
 *
 * KENAPA RUTE INI ADA - hasil pengukuran, bukan dugaan:
 * `httpAction` Convex tidak mengekspos header proxy. Disuntik `X-Forwarded-For`
 * ke route `/admin-gate/context`, jawabannya tetap `chainLength: 0` dan
 * `ipSource: "Unknown"`. Jadi route lama tidak akan pernah punya IP, dengan atau
 * tanpa konfigurasi. Edge Vercel satu-satunya pihak dalam rantai ini yang
 * melihat klien - tetapi hanya untuk permintaan yang melewatinya.
 *
 * SISI KEAMANAN:
 *  - Route ini PUBLIK dan bisa dihubungi siapa pun, jadi shared secret wajib
 *    diverifikasi lebih dulu. Tanpa secret yang sama di kedua environment, route
 *    menjawab netral dan tidak menulis apa pun.
 *  - Secret dibandingkan waktu-tetap lewat `verifyRelaySecret`.
 *  - Secret kosong berarti relay MATI, bukan terbuka tanpa password.
 *  - IP tetap tidak disimpan mentah: yang masuk hanya `ipHash` dan `ipMasked`,
 *    persis seperti sebelumnya.
 *  - Batas permintaan yang sama dengan route lama ikut dipakai, dengan kunci IP
 *    yang diamati server, bukan kiriman klien.
 */
/**
 * Menerima alamat IP yang benar-benar diamati edge, lalu menyimpannya dengan
 * perlakuan yang sama seperti route langsung di atas.
 *
 * KENAPA RUTE INI ADA - hasil pengukuran, bukan dugaan:
 * `httpAction` Convex tidak mengekspos header proxy. Disuntik `X-Forwarded-For`
 * ke route `/admin-gate/context`, jawabannya tetap `chainLength: 0` dan
 * `ipSource: "Unknown"`. Jadi route lama tidak akan pernah punya IP, dengan atau
 * tanpa konfigurasi. Edge Vercel satu-satunya pihak dalam rantai ini yang
 * melihat klien - tetapi hanya untuk permintaan yang melewatinya.
 *
 * SISI KEAMANAN, dari luar ke dalam:
 *  - Route ini PUBLIK dan bisa dihubungi siapa pun, jadi setiap permintaan harus
 *    membuktikan diri lebih dulu lewat HMAC atas timestamp, nonce, dan digest
 *    badan. Secret polos tanpa tanda tangan hanya bisa dibuktikan dengan
 *    "pemilik secret sedang bicara", dan tidak membuktikan apa pun soal isi.
 *  - Nonce diklaim sekali lalu ditolak forever lewat `claimRelayNonce`, jadi
 *    permintaan yang tertangkap tidak bisa dikirim ulang.
 *  - Perbandingan tanda tangan waktu-tetap.
 *  - Secret kosong berarti relay MATI, bukan terbuka tanpa password.
 *  - IP tetap tidak disimpan mentah: yang masuk hanya `ipHash` dan `ipMasked`,
 *    persis seperti sebelumnya. `ipHash` sekarang berkey, bukan polos.
 *  - Batas permintaan yang sama dengan route lama ikut dipakai, dengan kunci IP
 *    yang diamati server, bukan kiriman klien.
 */
const adminContextRelay = httpAction(async (ctx, request: Request) => {
  const netral = (relayTraceId: string | null = null) =>
    Response.json(
      {
        contextId: null,
        requestId: null,
        relayTraceId,
        ipMasked: null,
        ipSource: "Unknown",
        ipFamily: "unknown",
        ipTrust: "unknown",
        proxyDetected: false,
        chainLength: 0,
        geoResolved: false,
        timezone: null,
        relay: "rejected",
        telemetryStatus: "failed",
      },
      { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } },
    );

  if (request.method !== "POST") return netral();

  // Badan dibaca sebagai teks, bukan `request.json()`. Tanda tangan dihitung atas
  // byte yang benar-benar diterima; kalau badan dirakit ulang dari objek, satu
  // byte yang berbeda saja sudah cukup menggagalkan verifikasi.
  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch {
    return netral();
  }

  // Tolak bentuk apa pun yang tidak menghasilkan JSON objek sebelumHMAC
  // dihitung, supaya tidak ada kerja kripto untuk masukan acak.
  let payload: RelayPayload;
  try {
    payload = normalizeRelayPayload(JSON.parse(bodyText));
  } catch {
    return netral();
  }

  // Jejak relay dibaca dari badan supaya jawaban tetap bisa dikorelasikan
  // meski tanda tangannya ditolak. Nilainya hanya pengenal, tidak pernah
  // dipakai sebagai kredensial.
  const relayTraceId =
    typeof (JSON.parse(bodyText) as Record<string, unknown>)?.relayTraceId === "string"
      ? String((JSON.parse(bodyText) as Record<string, unknown>).relayTraceId).slice(0, 40)
      : null;

  const secret = process.env[RELAY_SECRET_ENV];
  // Metode dan path diambil dari permintaan yang benar-benar masuk, bukan dari
  // konstanta. Kalau keduanya ditulis mati di sini, verifikasi tidak lagi
  // mengikat tanda tangan ke endpoint yang benar-benar dipanggil.
  const signature = await verifyRelayRequest({
    secret,
    body: bodyText,
    method: request.method,
    path: new URL(request.url).pathname,
    timestamp: request.headers.get(RELAY_SIGNATURE_HEADER_TIMESTAMP),
    nonce: request.headers.get(RELAY_SIGNATURE_HEADER_NONCE),
    signature: request.headers.get(RELAY_SIGNATURE_HEADER_SIGNATURE),
  });
  if (!signature.ok) {
    // Alasan penolakan masuk ke log terstruktur, bukan ke jawaban. Pesan yang
    // dikembalikan selalu sama supaya endpoint ini tidak berubah jadi alat
    // untuk menebak mana yang gagal.
    logTelemetry(
      buildTelemetryLog({
        relay: "vercel-edge",
        telemetryStatus: "failed",
        geoResolved: false,
        relayTraceId,
        rejection: signature.reason,
      }),
    );
    return netral(relayTraceId);
  }

  const nonce = await ctx.runMutation(internal.adminGate.claimRelayNonce, {
    nonce: signature.nonce,
    expiresAt: signature.timestamp + RELAY_TIMESTAMP_WINDOW_MS * 2,
  });
  if (!nonce.claimed) {
    logTelemetry(
      buildTelemetryLog({
        relay: "vercel-edge",
        telemetryStatus: "failed",
        geoResolved: false,
        relayTraceId,
        rejection: nonce.reason ?? "duplicate_nonce",
      }),
    );
    return netral(relayTraceId);
  }

  try {
    const requestId = `req_${bytesToHex(crypto.getRandomValues(new Uint8Array(8)))}`;

    // Hash IP dibuat dengan kunci. Hash polos satu arah tetap bisa dicocokkan
    // dengan daftar alamat yang sudah diketahui, jadi untuk audit keamanan itu
    // bukan tidakapa-apa saja. Kalau tidak ada kunci sama sekali, `ipHash`
    // dibiarkan kosong dan metodenya dicatat `unavailable` - lebih jujur
    // daripada diam-diam memakai hash yang lemah.
    const ipHashKey = resolveIpHashSecret(process.env, { production: isProduction() });
    const ipHash =
      payload.ip && ipHashKey.secret ? await keyedHash(payload.ip, ipHashKey.secret) : null;
    const ipHashMethod: IpHashMethod = ipHashMethodFor(ipHashKey, Boolean(ipHash));

    if (ipHash) {
      const usage = await ctx.runMutation(internal.adminGate.contextRequestWindow, { ipHash });
      if (usage.count >= CONTEXT_REQUEST_LIMIT) {
        return Response.json(
          { error: "rate_limited", retryAfterSeconds: CONTEXT_REQUEST_WINDOW_MS / 1000, relayTraceId },
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "retry-after": String(CONTEXT_REQUEST_WINDOW_MS / 1000),
            },
          },
        );
      }
    }

    const token = bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
    const family = payload.ip ? normalizeIpDetailed(payload.ip).family : "unknown";
    const ipSource = payload.ip ? (payload.ipSource ?? "Vercel Edge") : "Unknown";
    const ipTrust = payload.ip ? "edge" : "unknown";
    const geoResolved = Boolean(payload.country || payload.city || payload.region);
    const telemetryStatus = deriveTelemetryStatus({
      relay: "vercel-edge",
      hasIp: Boolean(payload.ip),
      hasGeo: geoResolved,
    });
    const expiresAt = await ctx.runMutation(internal.adminGate.captureSecurityContext, {
      token,
      ipHash: ipHash ?? undefined,
      ipMasked: relayDisplayIp(payload.ip) ?? undefined,
      ipSource,
      ipFamily: family,
      ipTrust,
      proxyDetected: Boolean(payload.ip),
      chainLength: payload.ip ? 1 : 0,
      userAgent: trimUserAgent(payload.userAgent ?? undefined) ?? undefined,
      referrer: sanitizeReferrer(payload.referrer ?? undefined) ?? undefined,
      acceptLanguage: payload.acceptLanguage || undefined,
      requestId,
      relayTraceId: relayTraceId ?? undefined,
      country: payload.country ?? undefined,
      region: payload.region ?? undefined,
      city: payload.city ?? undefined,
      timezone: payload.timezone ?? undefined,
      telemetryStatus,
      ipHashMethod,
      relay: "vercel-edge",
    });

    logTelemetry(
      buildTelemetryLog({
        relay: "vercel-edge",
        telemetryStatus,
        geoResolved,
        relayTraceId,
        requestId,
        ipSource,
        ipHashMethod,
      }),
    );

    return Response.json(
      {
        contextId: token,
        requestId,
        relayTraceId,
        ipMasked: relayDisplayIp(payload.ip) ?? null,
        ipSource,
        ipFamily: family,
        ipTrust,
        proxyDetected: Boolean(payload.ip),
        chainLength: payload.ip ? 1 : 0,
        country: payload.country ?? null,
        region: payload.region ?? null,
        city: payload.city ?? null,
        timezone: payload.timezone ?? null,
        geoResolved,
        relay: "vercel-edge",
        telemetryStatus,
        ipHashMethod,
        expiresAt,
      },
      { headers: { "content-type": "application/json", "cache-control": "no-store" } },
    );
  } catch {
    // Secret benar tapi baris gagal ditulis. Jawaban tetap netral: tidak ada
    // bukti yang bisa diklaim, jadi tidak ada yang boleh ditulis sebagai
    // "berhasil".
    return netral(relayTraceId);
  }
});http.route({ path: RELAY_ROUTE, method: "POST", handler: adminContextRelay });

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
      : ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /dashboard", "Disallow: /warga/dashboard", "Disallow: /mitra/dashboard", "Disallow: /auth", ""].join("\n"),
    { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } },
  );
});

http.route({ path: "/sitemap.xml", method: "GET", handler: sitemap });
http.route({ path: "/robots.txt", method: "GET", handler: robots });

export default http;
