import { describe, expect, test } from "vitest";
import { buildOtpTemplatePayload, buildTemplatePayload, buildTextPayload } from "./whatsapp-payload";

const input = { phone: "6281234567890", title: "Permintaan warga baru", body: "Bengkel motor di Kalianget." };
const options = { name: "notifikasi_buku_kerja", language: "id", titleParam: "judul", bodyParam: "isi" };

describe("buildTemplatePayload", () => {
  test("mengirim named parameter sesuai variabel di body template", () => {
    const payload = buildTemplatePayload(input, options);
    expect(payload.type).toBe("template");
    expect(payload.template.name).toBe("notifikasi_buku_kerja");
    expect(payload.template.language).toEqual({ code: "id" });
    const components = payload.template.components as Array<{
      type: string;
      parameters: Array<{ type: string; parameter_name: string; text: string }>;
    }>;
    expect(components).toHaveLength(1);
    expect(components[0].type).toBe("body");
    expect(components[0].parameters).toEqual([
      { type: "text", parameter_name: "judul", text: "Permintaan warga baru" },
      { type: "text", parameter_name: "isi", text: "Bengkel motor di Kalianget." },
    ]);
  });

  test("urutan parameter mengikuti urutan variabel di template", () => {
    const components = buildTemplatePayload(input, options).template.components as Array<{
      parameters: Array<{ parameter_name: string }>;
    }>;
    expect(components[0].parameters.map((item) => item.parameter_name)).toEqual(["judul", "isi"]);
  });

  test("nama variabel mengikuti env saat template memakai nama lain", () => {
    const components = buildTemplatePayload(input, { ...options, titleParam: "informasi", bodyParam: "keterangan" })
      .template.components as Array<{ parameters: Array<{ parameter_name: string }> }>;
    expect(components[0].parameters.map((item) => item.parameter_name)).toEqual(["informasi", "keterangan"]);
  });

  test("memotong judul dan isi yang melebihi batas Meta", () => {
    const components = buildTemplatePayload(
      { phone: input.phone, title: "x".repeat(500), body: "y".repeat(2000) },
      options,
    ).template.components as Array<{ parameters: Array<{ text: string }> }>;
    expect(components[0].parameters[0].text).toHaveLength(200);
    expect(components[0].parameters[1].text).toHaveLength(700);
  });

  test("tidak mengirim header, footer, atau tombol", () => {
    const components = buildTemplatePayload(input, options).template.components as Array<{ type: string }>;
    expect(components.map((item) => item.type)).toEqual(["body"]);
  });
});

describe("buildOtpTemplatePayload", () => {
  const otpOptions = {
    name: "verify_code_1",
    language: "id",
    codeParam: "kode",
    appNameParam: "teks",
    appName: "Sumenep Buku Kerja",
  };

  test("mengirim kode lalu nama aplikasi sesuai urutan variabel template", () => {
    const payload = buildOtpTemplatePayload({ phone: "6281234567890", code: "482913" }, otpOptions);
    expect(payload.type).toBe("template");
    expect(payload.template.name).toBe("verify_code_1");
    expect(payload.template.language).toEqual({ code: "id" });
    const components = payload.template.components as Array<{
      type: string;
      parameters: Array<{ type: string; parameter_name: string; text: string }>;
    }>;
    expect(components).toHaveLength(1);
    expect(components[0].parameters).toEqual([
      { type: "text", parameter_name: "kode", text: "482913" },
      { type: "text", parameter_name: "teks", text: "Sumenep Buku Kerja" },
    ]);
  });

  test("hanya mengirim kode bila nama aplikasi dikosongkan", () => {
    const components = buildOtpTemplatePayload({ phone: "6281234567890", code: "482913" }, {
      ...otpOptions,
      appName: "",
    }).template.components as Array<{ parameters: unknown[] }>;
    expect(components[0].parameters).toEqual([{ type: "text", parameter_name: "kode", text: "482913" }]);
  });

  test("memotong nama aplikasi yang melebihi batas Meta", () => {
    const components = buildOtpTemplatePayload({ phone: "6281234567890", code: "482913" }, {
      ...otpOptions,
      appName: "x".repeat(500),
    }).template.components as Array<{ parameters: Array<{ text: string }> }>;
    expect(components[0].parameters[1].text).toHaveLength(200);
  });
});

describe("buildTextPayload", () => {  test("menggabungkan judul dan isi untuk pesan teks bebas", () => {
    expect(buildTextPayload(input)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "6281234567890",
      type: "text",
      text: { preview_url: false, body: "Permintaan warga baru\n\nBengkel motor di Kalianget." },
    });
  });
});
