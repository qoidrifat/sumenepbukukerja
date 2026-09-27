import { describe, expect, test } from "vitest";
import { buildOtpParameters, buildOtpTemplatePayload, buildTemplatePayload, buildTextPayload } from "./whatsapp-payload";

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

describe("buildOtpParameters", () => {
  const env = {
    code: "482913",
    appName: "Sumenep Buku Kerja",
    durationText: "5 menit",
    supportPhone: "081234567890",
    codeParam: "kode",
    appParam: "teks",
    durationParam: "teks",
    supportParam: "telepon",
    supportParam2: "telepon",
  };

  test("mengirim empat variabel untuk template pustaka Meta", () => {
    expect(buildOtpParameters(env)).toEqual([
      { name: "kode", text: "482913" },
      { name: "teks", text: "Sumenep Buku Kerja" },
      { name: "teks", text: "5 menit" },
      { name: "telepon", text: "081234567890" },
    ]);
  });

  test("menambah satu telepon bila template punya kalimat penutup", () => {
    expect(buildOtpParameters({ ...env, supportPhone2: "081234567890" })).toHaveLength(5);
    expect(buildOtpParameters({ ...env, supportPhone2: "081234567890" })[4]).toEqual({
      name: "telepon",
      text: "081234567890",
    });
  });

  test("nama variabel dapat diganti lewat env", () => {
    const parameters = buildOtpParameters({
      ...env,
      codeParam: "otp",
      appParam: "layanan",
      durationParam: "durasi",
      supportParam: "cs",
      supportParam2: "cs",
    });
    expect(parameters.map((item) => item.name)).toEqual(["otp", "layanan", "durasi", "cs"]);
  });
});

describe("buildOtpTemplatePayload", () => {
  const otpOptions = {
    name: "verify_code_2",
    language: "id",
    parameters: [
      { name: "kode", text: "482913" },
      { name: "teks", text: "Sumenep Buku Kerja" },
      { name: "teks", text: "5 menit" },
      { name: "telepon", text: "081234567890" },
    ],
  };

  test("mengirim semua variabel sesuai urutan kemunculannya di template", () => {
    const payload = buildOtpTemplatePayload({ phone: "6281234567890" }, otpOptions);
    expect(payload.type).toBe("template");
    expect(payload.template.name).toBe("verify_code_2");
    expect(payload.template.language).toEqual({ code: "id" });
    const components = payload.template.components as Array<{
      type: string;
      parameters: Array<{ type: string; parameter_name: string; text: string }>;
    }>;
    expect(components).toHaveLength(1);
    expect(components[0].parameters).toEqual([
      { type: "text", parameter_name: "kode", text: "482913" },
      { type: "text", parameter_name: "teks", text: "Sumenep Buku Kerja" },
      { type: "text", parameter_name: "teks", text: "5 menit" },
      { type: "text", parameter_name: "telepon", text: "081234567890" },
    ]);
  });

  test("nama variabel berulang tetap dikirim berurutan", () => {
    const components = buildOtpTemplatePayload({ phone: "6281234567890" }, otpOptions)
      .template.components as Array<{ parameters: Array<{ parameter_name: string; text: string }> }>;
    const teksSlots = components[0].parameters.filter((item) => item.parameter_name === "teks");
    expect(teksSlots.map((item) => item.text)).toEqual(["Sumenep Buku Kerja", "5 menit"]);
  });

  test("memotong nilai variabel yang melebihi batas Meta", () => {
    const components = buildOtpTemplatePayload({ phone: "6281234567890" }, {
      ...otpOptions,
      parameters: [{ name: "kode", text: "x".repeat(500) }],
    }).template.components as Array<{ parameters: Array<{ text: string }> }>;
    expect(components[0].parameters[0].text).toHaveLength(200);
  });

  test("template satu variabel tetap bisa dipakai", () => {
    const components = buildOtpTemplatePayload({ phone: "6281234567890" }, {
      name: "verify_code",
      language: "id",
      parameters: [{ name: "kode", text: "482913" }],
    }).template.components as Array<{ parameters: unknown[] }>;
    expect(components[0].parameters).toEqual([{ type: "text", parameter_name: "kode", text: "482913" }]);
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
