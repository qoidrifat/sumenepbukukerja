import { describe, expect, test } from "vitest";
import { mapTwilioStatus, parseMetaStatuses } from "./whatsapp-webhook";

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
