import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { BrandMascot, type BrandMascotProps } from "@/components/brand-mascot";
import {
  BOOK_FOLD,
  BOOK_LEFT,
  BOOK_MICRO,
  BOOK_MICRO_FOLD,
  BOOK_RIGHT,
  DETAIL_RULES,
  EYE,
  EYE_NARROW,
  EYE_WIDE,
} from "@/lib/mascot-geometry";
import {
  MASCOT_BEHAVIOURS,
  MASCOT_BLINK,
  MASCOT_BODY_AMPLITUDE,
  MASCOT_CATEGORIES,
  MASCOT_CATEGORY_KEYS,
  MASCOT_CATEGORY_MOTION,
  MASCOT_GAZE,
  MASCOT_GAZE_DRIFT,
  MASCOT_INTENSITY_LIST,
  MASCOT_INTENSITY_SCALE,
  MASCOT_SIZE_AMPLITUDE,
  MASCOT_SIZE_DETAIL,
  MASCOT_STATE_LIST,
  MASCOT_STATES,
  MASCOT_TIMING,
  MASCOT_TONE_MOTION,
  MASCOT_TONES,
  mascotBurstMs,
  mascotGazeFromPoint,
} from "@/lib/mascot-config";

/**
 * Kontrak GERAK Brand Mascot — Phase 5.
 *
 * `brand-mascot.test.ts` mengunci anatomi, `mascot-placement.test.ts` mengunci
 * penempatan. File ini mengunci hal ketiga yang sama-sama mudah rusak
 * diam-diam: geraknya. Yang diuji di sini bukan "apakah ada animasi", tapi
 * janji-janji yang membuat animasinya pantas dipakai di produk:
 *
 *  - gestur satu-kali tidak boleh berubah jadi loop (maskot yang melambai
 *    terus ke pengguna),
 *  - gerak mata tidak boleh lebih besar dari jarak aman ke spine dan mulut,
 *  - kedip tidak boleh jadi metronom,
 *  - angka amplitudo tidak boleh jadi mubazir (state tanpa arti gerak tetap
 *    diam),
 *  - lipatan tetap menempel pada halaman kanan di SEMUA state, bukan cuma
 *    di state yang kebetulan diuji Phase 2.
 *
 * Semua batas geometri dihitung ULANG dari `mascot-geometry` di dalam test;
 * tidak ada angka yang disalin dari `mascot-config`.
 */

const render = (props: BrandMascotProps = {}) =>
  renderToStaticMarkup(createElement(BrandMascot, props));

const paths = (html: string) => [...html.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);

const gestureOf = (state: (typeof MASCOT_STATE_LIST)[number]) => MASCOT_STATES[state].gesture;

/* ------------------------------------------------------------------ */
/* 1. Gestur satu-kali vs loop                                         */
/* ------------------------------------------------------------------ */

test("setiap state menunjuk perilaku yang benar-benar punya amplitudo", () => {
  /* `MASCOT_BODY_AMPLITUDE[gesture]` punya fallback, jadi gestur yang hilang tidak
     akan terlihat sebagai error di browser — hanya sebagai state yang
     diam-diam bergerak seperti `neutral`. */
  for (const state of MASCOT_STATE_LIST) {
    expect(MASCOT_BODY_AMPLITUDE[gestureOf(state)], `${state} -> ${gestureOf(state)}`).toBeDefined();
  }
});

test("role dan loops tidak boleh saling bertentangan", () => {
  for (const [name, behaviour] of Object.entries(MASCOT_BEHAVIOURS)) {
    expect(behaviour.loops, `${name}.loops`).toBe(behaviour.role === "idle");
    expect(behaviour.amplitude.length, `${name}.amplitude`).toBeGreaterThan(0);
    expect(behaviour.summary.length, `${name}.summary`).toBeGreaterThan(0);
  }
});

test("gestur satu-kali tidak berosilasi saat diam: tidak melambai terus-menerus", () => {
  /* Inti Phase 5 §7. Kalau sebuah gestur punya amplitudo halaman di `idle`,
     halaman itu bergerak selamanya — maskot melambai ke pengguna sepanjang
     halaman hidup. Gestur burst harus menaruh amplitudonya di `burst*` saja. */
  for (const state of MASCOT_STATE_LIST) {
    const behaviour = MASCOT_BEHAVIOURS[gestureOf(state)];
    if (behaviour.role !== "burst") continue;

    const amp = MASCOT_BODY_AMPLITUDE[gestureOf(state)];
    expect(amp.idlePageLeft, `${state}: halaman kiri tidak boleh berosilasi`).toBe(0);
    expect(amp.idlePageRight, `${state}: halaman kanan tidak boleh berosilasi`).toBe(0);
    expect(
      Math.abs(amp.burstPageLeft) + Math.abs(amp.burstPageRight) + amp.burstDy,
      `${state}: gestur burst harus punya sesuatu untuk dilakukan`,
    ).toBeGreaterThan(0);
  }
});

test("gestur burst harus lebih besar dari sisa napasnya", () => {
  /* Kalau burst <= napas, "satu lompatan kecil" tidak akan terbaca sebagai
     peristiwa - pengguna hanya melihat karakter yang bergetar. */
  for (const gesture of Object.keys(MASCOT_BODY_AMPLITUDE)) {
    const behaviour = MASCOT_BEHAVIOURS[gesture as keyof typeof MASCOT_BEHAVIOURS];
    if (!behaviour || behaviour.role !== "burst") continue;

    const amp = MASCOT_BODY_AMPLITUDE[gesture];
    if (amp.idleDy === 0) continue;
    expect(amp.burstDy / amp.idleDy, `${gesture}: rasio burst terhadap napas`).toBeGreaterThan(1.3);
  }
});

test("hello, found, dan success memang gestur satu-kali", () => {
  for (const state of ["hello", "found", "success"] as const) {
    expect(MASCOT_BEHAVIOURS[gestureOf(state)].role, state).toBe("burst");
    expect(MASCOT_BODY_AMPLITUDE[gestureOf(state)].burstPageLeft !== 0 || MASCOT_BODY_AMPLITUDE[gestureOf(state)].burstDy > 2, state).toBe(
      true,
    );
  }
});

test("search dan working memang loop: artinya baru lengkap kalau terus jalan", () => {
  for (const state of ["search", "working"] as const) {
    expect(MASCOT_BEHAVIOURS[gestureOf(state)].role, state).toBe("idle");
  }
});

test("pose diam tidak pernah dikalikan skala: pose adalah identitas state", () => {
  /* `poseMotion` memakai nilai pose apa adanya. Test `brand-mascot.test.ts` §8
     sudah mengunci nilainya pada `size="md"`; di sini yang dikunci adalah
     bahwa `scale` tidak pernah ikut campur — kalau ikut, hasil render di
     `md` (0.8) akan berbeda dari nilai yang sudah diverifikasi. */
  for (const state of MASCOT_STATE_LIST) {
    const amp = MASCOT_BODY_AMPLITUDE[gestureOf(state)];
    const html = render({ state, size: "md", animated: false });
    const offsets = [...html.matchAll(/transform:translateX\((-?[\d.]+)px\)/g)].map((m) =>
      Number(m[1]),
    );
    const numeric = (a: number, b: number) => a - b;
    const expected = [amp.poseLeft, amp.poseRight, amp.poseShift].filter((v) => v !== 0);
    expect(offsets.sort(numeric), state).toEqual(expected.sort(numeric));
  }
});

/* ------------------------------------------------------------------ */
/* 2. Tangga amplitudo                                                 */
/* ------------------------------------------------------------------ */

test("lantai ukuran beku, dan md sengaja bergerak walau tabel detail bilang tidak", () => {
  /* Sebelum Phase 5 tidak ada satu pun pembaca `DETAIL_RULES[*].gesture` di
     komponen, sehingga maskot 24px dan 144px beranimasi dengan amplitudo yang
     sama. Sekarang amplitudo adalah fungsi ukuran yang eksplisit.

     `micro` dan `sm` dibuat konsisten dengan tabel detail (beku). `md` TIDAK:
     §17 meminta 96px tetap bisa membedakan state lewat gerak, hanya dengan
     amplitudo yang dikurangi. Ketidaksepakatan itu disematkan di sini supaya
     tidak bisa terlupakan - lihat juga catatan di `mascot-config.ts`. */
  expect(DETAIL_RULES[MASCOT_SIZE_DETAIL.micro].gesture).toBe(false);
  expect(DETAIL_RULES[MASCOT_SIZE_DETAIL.sm].gesture).toBe(false);
  expect(MASCOT_SIZE_AMPLITUDE.micro, "micro beku").toBe(0);
  expect(MASCOT_SIZE_AMPLITUDE.sm, "sm beku").toBe(0);

  expect(MASCOT_SIZE_AMPLITUDE.md, "md bergerak, tapi lebih kecil dari lg").toBeGreaterThan(0);
  expect(MASCOT_SIZE_AMPLITUDE.md).toBeLessThan(MASCOT_SIZE_AMPLITUDE.lg);
  expect(MASCOT_SIZE_AMPLITUDE.lg).toBeGreaterThanOrEqual(MASCOT_SIZE_AMPLITUDE.md);
  expect(MASCOT_SIZE_AMPLITUDE.hero).toBeGreaterThanOrEqual(MASCOT_SIZE_AMPLITUDE.lg);
  expect(
    MASCOT_SIZE_AMPLITUDE.hero / MASCOT_SIZE_AMPLITUDE.md,
    "ukuran tidak boleh mengubah intensitas lebih dari 1.6x",
  ).toBeLessThan(1.6);
});

test("ukuran beku tetap menggambar pose diam, hanya tanpa osilasi", () => {
  /* Yang TIDAK boleh ikut hilang saat amplitude 0 adalah pose diam: itu
     identitas state dan sudah diverifikasi di 96px. Jadi maskot 24px dan
     48px tetap bisa dibedakan per state walau tidak bergerak sama sekali -
     dan satu-satunya transform yang tersisa adalah pose itu. (Kalau benar
     benar tidak ada piksel yang bergerak, itu diukur di browser lewat
     `mascot:qa:behaviour`, bukan disimpulkan dari markup.) */
  for (const size of ["micro", "sm"] as const) {
    const html = render({ state: "search", category: "culinary", size });

    /* Bentuk tubuhnya tetap yang beku: mark penuh di `sm`, mark padat di `micro`. */
    expect(html, size).toContain(size === "micro" ? BOOK_MICRO : BOOK_LEFT);
    expect(html, size).toContain(size === "micro" ? BOOK_MICRO_FOLD : BOOK_FOLD);

    expect(html, `${size}: tidak boleh ada sumbu vertikal`).not.toMatch(/translateY\(/);
    expect(html, `${size}: tidak boleh ada scale`).not.toMatch(/scale\(/);

    const offsets = [...html.matchAll(/transform:translateX\((-?[\d.]+)px\)/g)].map((m) =>
      Number(m[1]),
    );
    /* `micro` memakai mark padat: tidak ada halaman terpisah, jadi tidak ada
       pose halaman untuk digambar. `sm` memakai mark penuh, jadi pose-nya
       harus tetap ada - itulah yang membuat state masih terbaca. */
    expect(offsets.sort((a, b) => a - b), `${size}: hanya pose diam yang tersisa`).toEqual(
      size === "micro" ? [] : [-1.2, 1.2],
    );
  }
});

test("intensitas naik monoton dan tidak pernah mematikan gerak implisit", () => {
  const values = MASCOT_INTENSITY_LIST.map((m) => MASCOT_INTENSITY_SCALE[m]);
  for (const value of values) expect(value).toBeGreaterThan(0);
  expect(values).toEqual([...values].sort((a, b) => a - b));
  expect(new Set(values).size).toBe(values.length);
  for (const motion of MASCOT_INTENSITY_LIST) {
    expect(MASCOT_INTENSITY_SCALE[motion], motion).toBeLessThanOrEqual(1.5);
  }
});

test("intensitas hanya menyentuh gerak, bukan bentuk karakter", () => {
  const hero = render({ state: "found", category: "culinary", size: "hero" });
  for (const motion of MASCOT_INTENSITY_LIST) {
    const html = render({ state: "found", category: "culinary", size: "hero", intensity: motion });
    expect(paths(html), motion).toEqual(paths(hero));
  }
});

/* ------------------------------------------------------------------ */
/* 3. Kategori dan tone sebagai pengubah, bukan pengganti              */
/* ------------------------------------------------------------------ */

test("kategori mengubah tempo tapi tidak bisa membalik arti state", () => {
  for (const key of MASCOT_CATEGORY_KEYS) {
    const motion = MASCOT_CATEGORY_MOTION[key];
    /* Band sempit: cukup untuk terasa berbeda, tidak cukup untuk membuat
       `hello` kategori A terbaca berbeda dari `hello` kategori B. */
    expect(motion.energy, `${key}.energy`).toBeGreaterThanOrEqual(0.8);
    expect(motion.energy, `${key}.energy`).toBeLessThanOrEqual(1.25);
    expect(motion.tempo, `${key}.tempo`).toBeGreaterThanOrEqual(0.8);
    expect(motion.tempo, `${key}.tempo`).toBeLessThanOrEqual(1.25);
    expect(MASCOT_CATEGORIES[key].personality.length, `${key}.personality`).toBeGreaterThan(0);
  }
});

test("lima kategori menghasilkan gerak yang tidak seragam", () => {
  const pairs = MASCOT_CATEGORY_KEYS.map(
    (k) => `${MASCOT_CATEGORY_MOTION[k].energy}/${MASCOT_CATEGORY_MOTION[k].tempo}`,
  );
  expect(new Set(pairs).size, "kategori yang geraknya identik berarti pengubahnya mubazir").toBe(
    MASCOT_CATEGORY_KEYS.length,
  );
});

test("admin lebih tenang dari public, dan tetap state yang sama", () => {
  expect(MASCOT_TONE_MOTION.admin.energy).toBeLessThan(MASCOT_TONE_MOTION.public.energy);
  expect(MASCOT_TONE_MOTION.admin.tempo).toBeGreaterThan(MASCOT_TONE_MOTION.public.tempo);

  /* Tone hanya boleh mengubah warna dan tempo. Bentuk (semua path) harus
     identik - sudah diuji di `brand-mascot.test.ts`; di sini yang dijaga
     adalah state-nya tidak ikut berubah. */
  const expressionOf = (state: (typeof MASCOT_STATE_LIST)[number]) =>
    `${MASCOT_STATES[state].eyes}/${MASCOT_STATES[state].mouth}`;
  const expressions = MASCOT_STATE_LIST.map(expressionOf);
  expect(new Set(expressions).size, "ekspresi tetap milik state").toBe(MASCOT_STATE_LIST.length);
  expect(MASCOT_TONES.admin.defaultBehaviour).toBe("focus-work");
});

test("fallback perilaku memakai tone, bukan konstanta tersembunyi", () => {
  /* `defaultBehaviour` dulu tidak pernah dibaca. Sekarang ia adalah fallback
     resmi saat gestur sebuah state tidak ada di tabel amplitudo - jadi tone
     `admin` tidak diam-diam jatuh ke perilaku publik. */
  for (const tone of ["public", "admin"] as const) {
    const fallback = MASCOT_TONES[tone].defaultBehaviour;
    expect(MASCOT_BODY_AMPLITUDE[fallback], `${tone} -> ${fallback}`).toBeDefined();
  }
});

/* ------------------------------------------------------------------ */
/* 4. Gerak mata: anggaran dihitung dari geometri beku                 */
/* ------------------------------------------------------------------ */

const eyeBox = { open: EYE, narrowed: EYE_NARROW, wide: EYE_WIDE } as const;

/** Jarak terjauh dari tepi mata ke tepi spine, di sisi mana pun. */
function spineClearance() {
  return Math.min(
    ...Object.values(eyeBox).map((e) => Math.min(44 - (e.leftX + e.width), e.rightX - 52)),
  );
}

/** Jarak tepi terjauh mata ke awal zona lipatan. */
function foldClearance() {
  return Math.min(...Object.values(eyeBox).map((e) => 67 - (e.rightX + e.width)));
}

/** Celah vertikal tersempit antara bawah mata dan tepi atas goresan mulut. */
function mouthHeadroom() {
  /* Per pasangan state, karena yang digambar selalu mata + mulut dari state
     yang sama. `closed-happy` tidak punya rect mata sama sekali. */
  let worst = Infinity;
  for (const state of MASCOT_STATE_LIST) {
    const config = MASCOT_STATES[state];
    if (config.eyes === "closed-happy") continue;
    const eyes = eyeBox[config.eyes];
    const mouth = MOUTH_SUMMARY[config.mouth];
    worst = Math.min(worst, mouth.top - (eyes.y + eyes.height));
  }
  return worst;
}

/** Tepi atas goresan mulut per bentuk, dibaca dari geometri. */
const MOUTH_SUMMARY = (() => {
  const source = readFileSync("src/lib/mascot-geometry.ts", "utf8");
  const block = source.slice(
    source.indexOf("export const MOUTHS"),
    source.indexOf("} as const", source.indexOf("export const MOUTHS")),
  );
  const out: Record<string, { top: number; strokeWidth: number }> = {};
  /* `matchAll` menyerahkan [0] = seluruh match, lalu grup tangkapannya. */
  for (const [, name, body] of block.matchAll(/(\w+): \{([\s\S]*?)\}/g)) {
    const ys = [...body.matchAll(/M[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    const strokeWidth = Number(/strokeWidth: ([\d.]+)/.exec(body)?.[1] ?? 2.2);
    if (ys.length === 0) continue;
    out[name] = { top: Math.min(...ys) - strokeWidth / 2, strokeWidth };
  }
  expect(Object.keys(out).length, "seluruh bentuk mulut harus terbaca").toBeGreaterThanOrEqual(5);
  return out;
})();

test("gerak mata horizontal tidak boleh memakan jarak aman ke spine", () => {
  const budget = spineClearance();
  expect(budget, "jarak aman geometri ke spine").toBeGreaterThan(2);
  expect(
    MASCOT_GAZE.maxX + MASCOT_GAZE.clearance,
    "maxX + clearance tidak boleh melebihi jarak aman ke spine",
  ).toBeLessThanOrEqual(budget);
});

test("gerak mata horizontal tetap menjauh dari zona lipatan", () => {
  const fold = foldClearance();
  expect(MASCOT_GAZE.maxX, "mata tidak boleh bergeser sampai menyentuh zona lipatan").toBeLessThan(
    fold,
  );
  expect(fold - MASCOT_GAZE.maxX).toBeGreaterThan(0.4);
});

test("gaze hanya satu sumbu, dan itu keputusan geometri bukan selera", () => {
  /* Celah mata ke mulut sangat tipis: pada pasangan yang benar-benar dipakai
     (`empty` -> mata open + mulut round) tinggal 0.1 unit. Karena itu lapisan
     gaze tidak punya sumbu vertikal; "hidup" vertikal dibawa badan. Kalau
     geometri wajah suatu hari memberi ruang, test ini yang akan memaksa
     keputusan itu ditinjau ulang. */
  const headroom = mouthHeadroom();
  expect(headroom, "celah mata ke mulut harus positif").toBeGreaterThan(0);
  expect(headroom, "celah terlalu tipis untuk gerak vertikal").toBeLessThan(0.5);

  const MOUTH_CLEARANCE = 0.5;
  expect(
    Math.max(0, headroom - MOUTH_CLEARANCE),
    "tidak boleh ada sumbu y selama celah mata ke mulut < 0.5 unit",
  ).toBe(0);
  expect(Object.keys(MASCOT_GAZE).sort(), "lapisan gaze sengaja tanpa maxY").toEqual([
    "clearance",
    "maxX",
  ]);
});

test("sapuan mata mandiri tetap di dalam batas yang sama", () => {
  for (const [gesture, drift] of Object.entries(MASCOT_GAZE_DRIFT)) {
    expect(
      Object.keys(MASCOT_BEHAVIOURS),
      `${gesture} harus ada di daftar perilaku`,
    ).toContain(gesture);
    expect(MASCOT_BODY_AMPLITUDE[gesture], `${gesture} harus punya amplitudo`).toBeDefined();
    expect(drift.x.length, `${gesture}.x`).toBe(drift.times.length);
    expect(drift.times[0], `${gesture}.times mulai dari 0`).toBe(0);
    expect(drift.times[drift.times.length - 1], `${gesture}.times berakhir di 1`).toBe(1);
    for (const v of drift.x) {
      expect(Math.abs(v), `${gesture}: |${v}| melebihi maxX`).toBeLessThanOrEqual(
        MASCOT_GAZE.maxX,
      );
    }
    expect(drift.duration, `${gesture}: sapuan harus lebih pelan dari micro`).toBeGreaterThan(3);
  }
});

test("gaze dari pointer selalu di dalam clamp, termasuk untuk input ekstrem", () => {
  const rect = { left: 100, width: 200 };

  expect(mascotGazeFromPoint({ clientX: 200 }, rect)).toEqual({ x: 0 });
  expect(mascotGazeFromPoint({ clientX: 1000 }, rect).x).toBe(MASCOT_GAZE.maxX);
  expect(mascotGazeFromPoint({ clientX: -1000 }, rect).x).toBe(-MASCOT_GAZE.maxX);
  expect(mascotGazeFromPoint({ clientX: 300 }, rect).x).toBe(MASCOT_GAZE.maxX);

  for (const clientX of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, 1e9]) {
    const point = mascotGazeFromPoint({ clientX }, rect);
    expect(Number.isFinite(point.x), `clientX=${clientX}`).toBe(true);
    expect(Math.abs(point.x), `clientX=${clientX}`).toBeLessThanOrEqual(MASCOT_GAZE.maxX);
  }

  /* Elemen tanpa lebar tidak punya pusat: jangan bagi nol. */
  expect(mascotGazeFromPoint({ clientX: 150 }, { left: 0, width: 0 })).toEqual({ x: 0 });
});

test("mata yang digambar tidak pernah kena transform: nilainya tetap", () => {
  /* Lapisan gaze hanya menggeser grup pembungkusnya. Kalau ada transform yang
     "dibakar" ke dalam rect mata, artinya ada nilai dari config yang bocor ke
     geometri — dan itu perubahan karakter, bukan animasi. */
  for (const state of MASCOT_STATE_LIST) {
    const html = render({ state, size: "hero" });
    const eyes = MASCOT_STATES[state].eyes;
    if (eyes === "closed-happy") continue;
    const e = eyeBox[eyes];
    expect(html, `${state}: rect mata harus persis nilai beku`).toContain(
      `x="${e.leftX}" y="${e.y}" width="${e.width}" height="${e.height}" rx="${e.radius}"`,
    );
    expect(html, `${state}: sumbu vertikal tidak boleh ada`).not.toContain("translateY");
  }
});

/* ------------------------------------------------------------------ */
/* 5. Kedip                                                            */
/* ------------------------------------------------------------------ */

test("kedip bukan metronom, dan tidak berkedip serentak", () => {
  const { times, opacity, cycleMin, cycleMax, delayMax } = MASCOT_BLINK;

  expect(times.length, "times dan opacity harus sejajar").toBe(opacity.length);
  expect(times[0]).toBe(0);
  expect(times[times.length - 1]).toBe(1);
  for (let i = 1; i < times.length; i++) {
    expect(times[i], `times naik monoton di indeks ${i}`).toBeGreaterThan(times[i - 1]);
  }
  expect(opacity[0], "mata terbuka di awal siklus").toBe(0);

  /* Jedanya harus TIDAK rata. Kalau rata, kedip jadi denyut yang bisa
     diprediksi dan itu justru menarik perhatian ke animasinya. */
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const uniqueGaps = new Set(gaps.map((g) => g.toFixed(4)));
  expect(uniqueGaps.size, "jarak antar kedip tidak boleh seragam").toBeGreaterThan(2);

  /* §13: jeda kedip ±3.5-7.5 detik. Satu siklus berisi dua kedip, jadi jeda
     rata-ratanya adalah setengah panjang siklus. */
  expect(cycleMin / 2, "kedip tidak boleh lebih sering dari ~3.5s").toBeGreaterThanOrEqual(3.5);
  expect(cycleMax / 2, "kedip tidak boleh lebih jarang dari ~7.5s").toBeLessThanOrEqual(7.5);
  expect(delayMax, "jeda awal harus tidak nol supaya tidak sinkron").toBeGreaterThan(1);
});

/* ------------------------------------------------------------------ */
/* 6. Kosakata waktu                                                   */
/* ------------------------------------------------------------------ */

test("semua durasi berada di rentang bahasa gerak Phase 5", () => {
  /* §6: micro 120-180ms, gesture 280-500ms (620ms untuk gestur yang punya
     fase settle), transisi state 350-700ms, idle 2200-4200ms. */
  expect(MASCOT_TIMING.micro * 1000).toBeGreaterThanOrEqual(120);
  expect(MASCOT_TIMING.micro * 1000).toBeLessThanOrEqual(180);
  expect(MASCOT_TIMING.gesture * 1000).toBeGreaterThanOrEqual(280);
  expect(MASCOT_TIMING.gesture * 1000).toBeLessThanOrEqual(700);
  expect(MASCOT_TIMING.transition * 1000).toBeGreaterThanOrEqual(350);
  expect(MASCOT_TIMING.transition * 1000).toBeLessThanOrEqual(700);
  expect(MASCOT_TIMING.idle * 1000).toBeGreaterThanOrEqual(2200);
  expect(MASCOT_TIMING.idle * 1000).toBeLessThanOrEqual(4200);
  expect(MASCOT_TIMING.float * 1000).toBeGreaterThanOrEqual(2200);
  expect(MASCOT_TIMING.float * 1000).toBeLessThanOrEqual(4200);
});

test("timeout burst sama dengan durasi gestur yang dijanjikan", () => {
  /* Kalau keduanya berbeda, `react` dimatikan sebelum gesturnya selesai -
     persis di tengah lambaian. Nilainya harus berasal dari satu sumber. */
  expect(mascotBurstMs(1)).toBe(MASCOT_TIMING.gesture * 1000);
  expect(mascotBurstMs(MASCOT_TONE_MOTION.admin.tempo)).toBeGreaterThan(mascotBurstMs(1));
});

/* ------------------------------------------------------------------ */
/* 7. Lipatan tetap menempel selama animasi                            */
/* ------------------------------------------------------------------ */

test("di SEMUA state, lipatan tetap di dalam grup halaman kanan", () => {
  /* Phase 2 menguji ini untuk `connect` saja. Sejak Phase 5 halaman digeser
     oleh DUA grup bersarang (pose lalu osilasi), jadi setiap state harus
     dibuktikan ulang: satu `</g>` saja yang menyelip di antara halaman dan
     lipatan akan membuat sudut terlipat tertinggal. */
  for (const state of MASCOT_STATE_LIST) {
    const html = render({ state, size: "md", animated: false });
    const page = html.indexOf(BOOK_RIGHT);
    const fold = html.indexOf(BOOK_FOLD);
    const close = html.indexOf("</g>", page);

    expect(page, `${state}: halaman kanan ada`).toBeGreaterThan(-1);
    expect(fold, `${state}: lipatan ada`).toBeGreaterThan(page);
    expect(close, `${state}: tidak ada grup yang tertutup di antara halaman dan lipatan`).toBeGreaterThan(
      fold,
    );
  }
});

test("lipatan tidak pernah menerima transform sendiri", () => {
  /* Kalau lipatan berada di grup ber-transform sendiri, ia bisa bergerak
     relatif terhadap halamannya. Ia harus selalu ikut grup yang sama. */
  for (const state of MASCOT_STATE_LIST) {
    const html = render({ state, size: "md" });
    const foldIndex = html.indexOf(BOOK_FOLD);
    const before = html.slice(Math.max(0, foldIndex - 400), foldIndex);
    expect(before, `${state}: lipatan didahului halaman kanan`).toContain(BOOK_RIGHT);
  }
});

/* ------------------------------------------------------------------ */
/* 8. Disiplin runtime                                                 */
/* ------------------------------------------------------------------ */

test("komponen tidak memasang listener atau timer yang bocor", () => {
  /* Batas Phase 5: interaksi memakai prop event React (dibersihkan React),
     `whileTap` (dibersihkan framer), satu timeout, dan satu rAF. Keduanya
     dipegang lewat ref dan dibatalkan di cleanup. `addEventListener` tidak
     boleh muncul di sini: itu akan berarti satu listener per instance, dan
     studio merender lebih dari seratus maskot sekaligus. */
  const source = readFileSync("src/components/brand-mascot.tsx", "utf8");

  expect(source, "tidak boleh ada listener manual").not.toContain("addEventListener");
  expect(source, "tidak boleh ada interval").not.toContain("setInterval");
  expect(source, "timeout harus dibersihkan").toContain("window.clearTimeout");
  expect(source, "rAF harus dibatalkan").toContain("window.cancelAnimationFrame");

  const timeouts = (source.match(/window\.setTimeout/g) ?? []).length;
  const clears = (source.match(/window\.clearTimeout/g) ?? []).length;
  expect(clears, "setiap setTimeout harus punya pasangan clearTimeout").toBeGreaterThanOrEqual(
    timeouts,
  );

  const rafs = (source.match(/window\.requestAnimationFrame/g) ?? []).length;
  const cancels = (source.match(/window\.cancelAnimationFrame/g) ?? []).length;
  expect(cancels, "setiap rAF harus punya pasangan cancel").toBeGreaterThanOrEqual(rafs);
});

test("semua pembungkus animasi tetap dekoratif: tidak ada fokus atau peran", () => {
  /* Interaksi pointer tidak boleh mengubah kontrak aksesibilitas. Maskot tetap
     tidak fokusable dan tidak diumumkan. */
  for (const state of MASCOT_STATE_LIST) {
    const html = render({ state, size: "hero" });
    expect(html, state).not.toContain("tabindex");
    expect(html, state).not.toContain("tabIndex");
    expect(html, state).toContain('aria-hidden="true"');
    expect(html, state).toContain('focusable="false"');
  }
});

test("gerak tidak pernah memindahkan maskot di luar kotaknya", () => {
  /* Semua transform hanya boleh di dalam SVG atau di pembungkus `motion.div`.
     Yang dijaga: grup yang bergeser adalah `<g>`, dan tidak ada transform
     yang dipasang ke elemen akar (yang akan menggeser layout). */
  for (const state of MASCOT_STATE_LIST) {
    const html = render({ state, size: "hero" });
    /* Pembungkus luar tidak boleh punya transform sama sekali. */
    const outer = html.slice(0, html.indexOf("<svg"));
    expect(outer, `${state}: pembungkus luar tidak boleh bergeser`).not.toMatch(
      /translate[XY]?\(|scale\(|rotate\(/,
    );
  }
});
