import { describe, expect, test } from "vitest";
import {
  mapTwilioStatus,
  parseMetaInbound,
  parseMetaStatuses,
  parseTwilioInbound,
} from "./whatsapp-webhook";

describe("parseMetaStatuses", () => {
  test("membaca event status delivered dari payload Meta Cloud API", () => {
    const events = parseMetaStatuses({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "0",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "628123", phone_number_id: "1" },
                statuses: [{ id: "wamid.ABC", status: "delivered", timestamp: "1" }],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([{ providerMessageId: "wamid.ABC", status: "delivered", errorCode: undefined }]);
  });

  test("mengabaikan event tanpa id dan status tak dikenal", () => {
    const events = parseMetaStatuses({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { status: "sent" },
                  { id: "wamid.OK", status: "dalam_uji" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([]);
  });

  test("status failed membawa kode error dan read dihitung delivered", () => {
    const events = parseMetaStatuses({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.ERR", status: "failed", errors: [{ code: 131047, title: "Re-engagement message" }] },
                  { id: "wamid.READ", status: "read" },
                  { id: "wamid.ACCEPT", status: "accepted" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { providerMessageId: "wamid.ERR", status: "failed", errorCode: "131047" },
      { providerMessageId: "wamid.READ", status: "delivered", errorCode: undefined },
      { providerMessageId: "wamid.ACCEPT", status: "queued", errorCode: undefined },
    ]);
  });

  test("payload bukan objek atau kosong tidak membuat error", () => {
    expect(parseMetaStatuses(null)).toEqual([]);
    expect(parseMetaStatuses({})).toEqual([]);
  });
});

describe("mapTwilioStatus", () => {
  test("memetakan status Twilio ke status internal", () => {
    expect(mapTwilioStatus("queued")).toBe("queued");
    expect(mapTwilioStatus("sent")).toBe("sent");
    expect(mapTwilioStatus("delivered")).toBe("delivered");
    expect(mapTwilioStatus("read")).toBe("delivered");
    expect(mapTwilioStatus("undelivered")).toBe("failed");
  });

  test("status tidak dikenal menghasilkan undefined agar callback diabaikan", () => {
    expect(mapTwilioStatus("mystery")).toBeUndefined();
    expect(mapTwilioStatus(null)).toBeUndefined();
  });
});

describe("parseMetaInbound", () => {
  const payload = (message: Record<string, unknown>) => ({
    entry: [{ changes: [{ value: { messages: [message] } }] }],
  });

  test("membaca pesan teks masuk beserta pengirim dan waktunya", () => {
    expect(
      parseMetaInbound(
        payload({
          from: "628123456789",
          id: "wamid.IN",
          timestamp: "1700000000",
          type: "text",
          text: { body: "  Halo, apakah jam buka?  " },
        }),
      ),
    ).toEqual([
      {
        providerMessageId: "wamid.IN",
        from: "628123456789",
        body: "Halo, apakah jam buka?",
        kind: "text",
        at: 1700000000000,
      },
    ]);
  });

  test("tombol tanpa text memakai payload tombol sebagai isi", () => {
    const [message] = parseMetaInbound(
      payload({ from: "628123456789", id: "wamid.BTN", type: "button", button: { payload: "SETUJU" } }),
    );
    expect(message).toMatchObject({ body: "SETUJU", kind: "button", at: 0 });
  });

  test("pesan tanpa id atau tanpa pengirim diabaikan", () => {
    expect(parseMetaInbound(payload({ from: "628123456789", type: "text" }))).toEqual([]);
    expect(parseMetaInbound(payload({ id: "wamid.NO_FROM", type: "text" }))).toEqual([]);
    expect(parseMetaInbound(null)).toEqual([]);
  });

  test("payload status pengiriman tidak dianggap pesan masuk", () => {
    expect(
      parseMetaStatuses({
        entry: [{ changes: [{ value: { statuses: [{ id: "wamid.S", status: "delivered" }] } }] }],
      }),
    ).toHaveLength(1);
    expect(
      parseMetaInbound({
        entry: [{ changes: [{ value: { statuses: [{ id: "wamid.S", status: "delivered" }] } }] }],
      }),
    ).toEqual([]);
  });
});

describe("parseTwilioInbound", () => {
  test("callback tanpa MessageStatus dibaca sebagai pesan masuk", () => {
    const message = parseTwilioInbound(
      new URLSearchParams({
        MessageSid: "SM-inbound",
        From: "whatsapp:+628123456789",
        Body: "Halo, apakah jam buka?",
        NumMedia: "0",
      }),
    );
    expect(message).toMatchObject({
      providerMessageId: "SM-inbound",
      from: "628123456789",
      body: "Halo, apakah jam buka?",
      kind: "text",
    });
  });

  test("ada MessageStatus berarti callback status, bukan chat masuk", () => {
    expect(
      parseTwilioInbound(
        new URLSearchParams({
          MessageSid: "SM-status",
          From: "whatsapp:+628123456789",
          MessageStatus: "delivered",
        }),
      ),
    ).toBeUndefined();
  });

  test("tanpa pengirim tidak ada yang bisa disimpan", () => {
    expect(parseTwilioInbound(new URLSearchParams({ MessageSid: "SM-x" }))).toBeUndefined();
    expect(parseTwilioInbound(new URLSearchParams({ From: "whatsapp:+628123" }))).toBeUndefined();
  });

  test("pesan dengan lampiran ditandai sebagai media", () => {
    expect(
      parseTwilioInbound(
        new URLSearchParams({
          MessageSid: "SM-media",
          From: "whatsapp:+628123456789",
          NumMedia: "1",
        }),
      ),
    ).toMatchObject({ kind: "media", body: "" });
  });
});
