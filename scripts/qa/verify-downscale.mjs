/**
 * Verifikasi downscale foto di browser sungguhan.
 *
 * Kenapa skrip ini ada dan bukan test Vitest: `downscaleImageIfLarge`
 * bergantung pada `createImageBitmap`, `<canvas>`, dan `canvas.toBlob` —
 * ketiganya tidak ada di lingkungan uji (`edge-runtime`). Test dengan
 * mock hanya bisa membuktikan bahwa logikanya memanggil API yang benar,
 * bukan bahwa gambarnya benar-benar mengecil dan masih bisa dibaca. Skrip ini
 * menjalankan modul ASLI di Chromium dan mengukur hasilnya.
 *
 * Jalankan: node scripts/qa/verify-downscale.mjs
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../../src/lib/image-upload.ts", import.meta.url));

const bundle = await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  globalName: "__img",
  write: false,
  target: "es2020",
});
const code = bundle.outputFiles[0].text;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><meta charset='utf-8'><body></body>");
await page.addScriptTag({ content: code });

/** Buat foto besar yang realistis: derau + gradien, bukan bidang datar. */
async function makePhoto(width, height) {
  return await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#1b3a5c");
      gradient.addColorStop(1, "#c96f3b");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < image.data.length; i += 4) {
        const n = (Math.random() * 90) | 0;
        image.data[i] = Math.min(255, image.data[i] + n);
        image.data[i + 1] = Math.min(255, image.data[i + 1] + n);
        image.data[i + 2] = Math.min(255, image.data[i + 2] + n);
      }
      ctx.putImageData(image, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            dataUrl: reader.result,
            size: blob.size,
            name: `foto-kamera-${width}x${height}.jpg`,
          });
        reader.readAsDataURL(blob);
      });
    },
    { width, height },
  );
}

async function runCase(label, width, height, expectResize) {
  const photo = await makePhoto(width, height);
  const result = await page.evaluate(async (dataUrl) => {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], "foto-kamera.jpg", { type: "image/jpeg" });
    const prepared = await window.__img.downscaleImageIfLarge(file);
    const out = prepared.file;
    // Bukti file keluaran masih gambar yang bisa dibaca: decode ulang.
    const decoded = await createImageBitmap(out);
    const rejection = window.__img.imageRejection({
      size: out.size,
      contentType: out.type,
    });
    return {
      resized: prepared.resized,
      beforeBytes: prepared.beforeBytes,
      afterBytes: prepared.afterBytes,
      outName: out.name,
      outType: out.type,
      outWidth: decoded.width,
      outHeight: decoded.height,
      decodedOk: decoded.width > 0 && decoded.height > 0,
      rejection,
      limit: window.__img.MAX_IMAGE_BYTES,
    };
  }, photo.dataUrl);

  const ratioOk = Math.abs(result.outWidth / result.outHeight - width / height) < 0.02;
  // Foto yang TIDAK dikecilkan punya kriteria berbeda: ia harus utuh, bukan
  // "hemat". Menyamakan keduanya membuat harness melaporkan kegagalan pada
  // perilaku yang justru benar.
  const verdict = expectResize
    ? result.resized &&
      result.outWidth <= 1280 &&
      ratioOk &&
      result.decodedOk &&
      result.afterBytes < result.beforeBytes &&
      result.afterBytes <= result.limit &&
      result.rejection === null
    : !result.resized &&
      result.outWidth === width &&
      result.outHeight === height &&
      result.afterBytes === result.beforeBytes &&
      result.decodedOk &&
      result.rejection === null;

  console.log(`\n[${verdict ? "LULUS" : "GAGAL"}] ${label}`);
  console.log(
    `        masuk  : ${width}x${height}, ${(result.beforeBytes / 1000).toFixed(0)} KB`,
  );
  console.log(
    `        keluar : ${result.outWidth}x${result.outHeight}, ${(result.afterBytes / 1000).toFixed(0)} KB (${result.outType}, ${result.outName})`,
  );
  console.log(
    `        hemat  : ${(100 - (result.afterBytes / result.beforeBytes) * 100).toFixed(1)}% · rasio 유지: ${ratioOk ? "ya" : "TIDAK"} · diperkecil: ${result.resized ? "ya" : "tidak"}`,
  );
  console.log(
    `        batas  : ${(result.afterBytes / 1000).toFixed(0)} KB <= ${(result.limit / 1000).toFixed(0)} KB → ${result.rejection ?? "lolos"}`,
  );
  return { ...result, verdict, ratioOk };
}

const big = await runCase("Foto kamera besar (4000x3000)", 4000, 3000, true);
const medium = await runCase("Foto sedang (1920x1440)", 1920, 1440, true);
const small = await runCase("Foto kecil (900x675) — tidak boleh diperkecil", 900, 675, false);

await browser.close();

const allPassed = big.verdict && medium.verdict && small.verdict && !small.resized;
if (!allPassed) {
  console.error("\nVERIFIKASI GAGAL: ada kriteria yang tidak terpenuhi.");
  process.exit(1);
}
console.log(
  `\nRINGKASAN: foto besar ${(big.beforeBytes / 1000).toFixed(0)} KB → ${(big.afterBytes / 1000).toFixed(0)} KB; foto kecil ${(small.beforeBytes / 1000).toFixed(0)} KB tidak disentuh. Semua kriteria terpenuhi.`,
);
