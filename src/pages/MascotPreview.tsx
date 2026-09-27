import { useCallback, useRef, useState } from "react";

import { BrandMascot } from "@/components/brand-mascot";
import {
  MASCOT_BEHAVIOURS,
  MASCOT_CATEGORIES,
  MASCOT_CATEGORY_KEYS,
  MASCOT_CATEGORY_MOTION,
  MASCOT_GAZE,
  MASCOT_INTENSITY_LIST,
  MASCOT_INTENSITY_SCALE,
  MASCOT_SIZE_AMPLITUDE,
  MASCOT_SIZE_LIST,
  MASCOT_STATE_LIST,
  MASCOT_STATES,
  MASCOT_TONE_MOTION,
  MASCOT_TONES,
  type MascotCategoryKey,
  type MascotIntensity,
  type MascotSize,
  type MascotState,
  type MascotTone,
} from "@/lib/mascot-config";

/**
 * Preview maskot — KHUSUS dev.
 *
 * Rute ini hanya didaftarkan saat `import.meta.env.DEV`, jadi tidak pernah
 * ada di build produksi dan tidak menambah route produksi. Tujuannya satu:
 * Phase 3 (browser QA) punya satu halaman yang bisa dibuka untuk memeriksa
 * semua state, semua kategori, semua ukuran, dan kedua tema tanpa perlu
 * menavigasi seluruh aplikasi.
 *
 * Yang TIDAK ada di sini: logika bisnis, auth, data Convex. Ini alat,
 * bukan bagian dari produk.
 *
 * Phase 5 menambahkan Inspect gerak: Auto/Pause, Motion (intensitas), dan
 * tombol Simulate yang mengirim event pointer SUNGGUHAN ke elemen maskot,
 * bukan memanggil handler secara langsung. Jadi yang dilihat reviewer di
 * sini adalah perilaku yang sama dengan perilaku di produk.
 *
 * Panel "Gerak" di bawah kontrol membaca `MASCOT_BEHAVIOURS` dan
 * `MASCOT_STATES` apa adanya. Tidak ada kalimat kedua yang ditulis manual,
 * karena deskripsi yang ditulis ulang di sini akan basi begitu geraknya
 * diubah.
 */

const SIZES: MascotSize[] = MASCOT_SIZE_LIST;
const STATES: MascotState[] = MASCOT_STATE_LIST;
const TONES: MascotTone[] = ["public", "admin"];

function Panel({
  title,
  note,
  tone,
  children,
}: {
  title: string;
  note?: string;
  tone: MascotTone;
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        tone === "admin"
          ? "admin-workspace rounded-2xl border-2 border-[#121212] bg-[#fdfbf7] p-5 text-[#1a1a1a]"
          : "rounded-2xl border border-slate-200 bg-white p-5 text-slate-950"
      }
    >
      <h2 className="text-base font-black tracking-tight">{title}</h2>
      {note && (
        <p
          className={
            tone === "admin" ? "mt-1 text-sm text-[#525252]" : "mt-1 text-sm text-slate-600"
          }
        >
          {note}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Cell({
  label,
  sub,
  children,
  tone,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
  tone: MascotTone;
}) {
  return (
    <div
      className={
        tone === "admin"
          ? "flex flex-col items-center gap-2 border border-dashed border-[#121212]/30 p-3 text-center"
          : "flex flex-col items-center gap-2 border border-dashed border-slate-200 p-3 text-center"
      }
    >
      <div className="flex min-h-24 items-center justify-center">{children}</div>
      <p
        className={
          tone === "admin"
            ? "text-xs font-extrabold uppercase tracking-wide"
            : "text-xs font-bold uppercase tracking-wide text-slate-500"
        }
      >
        {label}
      </p>
      {sub && (
        <p
          className={
            tone === "admin" ? "text-[11px] text-[#525252]" : "text-[11px] text-slate-500"
          }
        >
          {sub}
        </p>
      )}
    </div>
  );
}

export default function MascotPreview() {
  const [state, setState] = useState<MascotState>("neutral");
  const [category, setCategory] = useState<MascotCategoryKey | "">("");
  const [size, setSize] = useState<MascotSize>("lg");
  const [animated, setAnimated] = useState(true);
  const [tone, setTone] = useState<MascotTone>("public");
  const [intensity, setIntensity] = useState<MascotIntensity>("normal");
  const [hovering, setHovering] = useState(false);
  /* Remount token: "Replay state" harus memutar ulang gestur masuk, dan
     satu-satunya cara jujur untuk itu adalah me-mount ulang karakter. */
  const [replay, setReplay] = useState(0);
  const soloRef = useRef<HTMLDivElement | null>(null);

  /* Elemen maskot yang benar-benar dirender. `span > div` = pembungkus
     dalam BrandMascot; wrapper di sekelilingnya hanya punya satu span. */
  const host = () => soloRef.current?.querySelector<HTMLDivElement>("span > div") ?? null;

  const pointer = (target: EventTarget, type: string, init: PointerEventInit) =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        ...init,
      }),
    );

  /* Event pointer sungguhan, bukan pemanggilan handler: `onPointerEnter`,
     `onPointerMove`, dan `whileTap` semuanya melewati jalur yang sama dengan
     yang dilalui pengguna. */
  const simulateHover = useCallback(() => {
    const el = host();
    if (!el) return;
    if (hovering) {
      pointer(el, "pointerout", { relatedTarget: document.body });
      setHovering(false);
      return;
    }
    const box = el.getBoundingClientRect();
    const init = {
      clientX: box.left + box.width * 0.78,
      clientY: box.top + box.height * 0.28,
    };
    pointer(el, "pointerover", init);
    pointer(el, "pointermove", init);
    setHovering(true);
  }, [hovering]);

  const simulateTap = useCallback(() => {
    const el = host();
    if (!el) return;
    const box = el.getBoundingClientRect();
    const init = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
    pointer(el, "pointerdown", init);
    window.setTimeout(() => pointer(window, "pointerup", init), 170);
  }, []);

  /* Angka yang ditampilkan di panel "Gerak" dihitung dari tabel yang sama
     yang dipakai `BrandMascot`, dengan urutan kali yang sama. */
  const gesture = MASCOT_STATES[state].gesture;
  const behaviour = MASCOT_BEHAVIOURS[gesture];
  const categoryMotion = category ? MASCOT_CATEGORY_MOTION[category] : { energy: 1, tempo: 1 };
  const toneMotion = MASCOT_TONE_MOTION[tone];
  const amplitudeTotal = Number(
    (
      MASCOT_SIZE_AMPLITUDE[size] *
      MASCOT_INTENSITY_SCALE[intensity] *
      categoryMotion.energy *
      toneMotion.energy
    ).toFixed(3),
  );
  const tempoTotal = Number((categoryMotion.tempo * toneMotion.tempo).toFixed(3));

  return (
    <main className="min-h-dvh min-h-[100svh] bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
            Dev only · tidak ada di build produksi
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            Brand Mascot — preview QA
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Periksa silhouette, wajah, aksesori, kontras di setiap latar, dan — sejak
            Phase 5 — gerak: gestur masuk state, hover, tap, dan reduced motion.
            Deskripsi tiap state diambil dari `MASCOT_STATES` dan
            `MASCOT_BEHAVIOURS`, jadi yang tertulis di sini adalah yang benar-benar
            dijalankan komponen.
          </p>
        </header>

        {/* Kontrol: mengubah props di sini memperbarui semua panel di bawah. */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">
            Kontrol
          </h2>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              state
              <select
                value={state}
                onChange={(e) => setState(e.target.value as MascotState)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MascotCategoryKey | "")}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">(tanpa)</option>
                {MASCOT_CATEGORY_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {MASCOT_CATEGORIES[k].category}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              size
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as MascotSize)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              tone
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as MascotTone)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 text-xs font-bold text-slate-600">
              <input
                type="checkbox"
                checked={animated}
                onChange={(e) => setAnimated(e.target.checked)}
              />
              Animation · Auto / Pause
            </label>
          </div>

          {/* Inspect. Motion = intensitas editorial (bukan reduced-motion,
              yang diuji lewat emulasi media query di qa-behaviour). */}
          <div className="mt-5 flex flex-wrap gap-8 border-t border-slate-100 pt-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Motion</p>
              <div className="mt-2 flex gap-1">
                {MASCOT_INTENSITY_LIST.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={intensity === m}
                    onClick={() => setIntensity(m)}
                    className={
                      intensity === m
                        ? "rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
                        : "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                Interaction
              </p>
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  aria-pressed={hovering}
                  onClick={simulateHover}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  {hovering ? "End hover" : "Simulate hover"}
                </button>
                <button
                  type="button"
                  onClick={simulateTap}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Simulate tap
                </button>
                <button
                  type="button"
                  onClick={() => setReplay((n) => n + 1)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Replay state
                </button>
              </div>
            </div>
          </div>

          {/* Gerak yang sedang berlaku. Semua angka dibaca dari config yang
              dipakai BrandMascot; tidak ada kalimat yang ditulis terpisah,
              jadi tidak ada deskripsi yang bisa basi. */}
          <dl className="mt-4 grid gap-x-8 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="inline font-black">state</dt>{" "}
              <dd className="inline text-slate-700">{MASCOT_STATES[state].summary}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="inline font-black">gesture</dt>{" "}
              <dd className="inline text-slate-700">
                {gesture} · role {behaviour.role} · {behaviour.loops ? "loop" : "sekali lalu tenang"} ·{" "}
                {behaviour.amplitude} — {behaviour.summary}
              </dd>
            </div>
            <div>
              <dt className="inline font-black">amplitudo</dt>{" "}
              <dd className="inline text-slate-700">
                size ×{MASCOT_SIZE_AMPLITUDE[size]} · intensitas ×{MASCOT_INTENSITY_SCALE[intensity]} ·{" "}
                kategori ×{categoryMotion.energy} · tone ×{toneMotion.energy} = ×{amplitudeTotal}
                {amplitudeTotal === 0 ? " (beku: tidak ada gerak yang digambar)" : ""}
              </dd>
            </div>
            <div>
              <dt className="inline font-black">tempo</dt>{" "}
              <dd className="inline text-slate-700">
                kategori ×{categoryMotion.tempo} · tone ×{toneMotion.tempo} = ×{tempoTotal}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="inline font-black">mata</dt>{" "}
              <dd className="inline text-slate-700">
                menyapu sendiri: {
                  gesture === "search-peek" || gesture === "empty-wait" ? "ya" : "tidak"
                } — saat pointer di atas maskot, mata mengikuti pointer. Batas ±{MASCOT_GAZE.maxX}{" "}
                unit pada satu sumbu (horizontal) saja, jadi cadangan {MASCOT_GAZE.clearance} unit ke
                spine tidak pernah habis. Sumbu vertikal tidak ada: celah mata ke mulut terlalu tipis
                untuk digerakkan.
              </dd>
            </div>
          </dl>

          {/* Panel solo: SATU-SATUNYA tempat control di atas benar-benar
              mengubah apa yang tampil. Grid di bawah sengaja memakai
              ukuran tetap supaya tetap bisa dipakai sebagai referensi
              berdampingan. Tanpa panel ini, selector di atas jadi hiasan. */}
          <div className="mt-5 flex flex-wrap items-end gap-8 rounded-xl border border-blue-200 bg-blue-50 p-5">
            <div ref={soloRef} className="flex flex-col items-center gap-2">
              <BrandMascot
                key={replay}
                state={state}
                category={category === "" ? undefined : category}
                size={size}
                animated={animated} intensity={intensity}
              />
              <p className="text-xs font-bold text-blue-800">
                {state} · {category || "tanpa kategori"} · {size}
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <BrandMascot
                state={state}
                category={category === "" ? undefined : category}
                size={size}
                tone="admin"
                animated={animated} intensity={intensity}
              />
              <p className="text-xs font-bold text-blue-800">t admin · {state}</p>
            </div>
            <p className="max-w-xs text-xs leading-5 text-blue-900">
              Kiri: public. Kanan: admin. Dua-duanya bentuknya sama — yang
              berubah hanya warna treatment, untuk mengecek apakah
              perbedaan konteksnya cukup.
            </p>
          </div>
        </section>

        {TONES.map((t) => (
          <div key={t} className="space-y-4">
            <Panel
              title={t === "public" ? "Public" : "Admin (warm brutalism)"}
              note={MASCOT_TONES[t].summary}
              tone={t}
            >
              {/* 1. Delapan state inti. */}
              <h3 className="text-sm font-bold">Delapan state inti</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {STATES.map((s) => (
                  <Cell key={s} label={s} sub={MASCOT_STATES[s].gesture} tone={t}>
                    <BrandMascot
                      state={s}
                      size="md"
                      tone={t}
                      animated={animated} intensity={intensity}
                    />
                  </Cell>
                ))}
              </div>

              {/* 2. Lima varian kategori. */}
              <h3 className="mt-6 text-sm font-bold">Lima varian kategori</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {MASCOT_CATEGORY_KEYS.map((k) => (
                  <Cell key={k} label={k} sub={MASCOT_CATEGORIES[k].category} tone={t}>
                    <BrandMascot
                      state="neutral"
                      category={k}
                      size="lg"
                      tone={t}
                      animated={animated} intensity={intensity}
                    />
                  </Cell>
                ))}
              </div>

              {/* 3. State x kategori, supaya ekspresi dan aksesori terlihat
                  bersamaan — ini yang paling sering tidak dicek. */}
              <h3 className="mt-6 text-sm font-bold">State × kategori</h3>
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {STATES.map((s) =>
                  MASCOT_CATEGORY_KEYS.map((k) => (
                    <Cell key={`${s}-${k}`} label={`${s} · ${k}`} tone={t}>
                      <BrandMascot
                        state={s}
                        category={k}
                        size="md"
                        tone={t}
                        animated={animated} intensity={intensity}
                      />
                    </Cell>
                  )),
                )}
              </div>
            </Panel>
          </div>
        ))}

        {/* 4. Skala ukuran, termasuk yang tidak menampilkan wajah/aksesori. */}
        <Panel
          title="Skala ukuran"
          note="micro dan small sengaja tanpa wajah dan aksesori. Periksa apakah hierarki bentuk masih terbaca."
          tone="public"
        >
          <div className="flex flex-wrap items-end gap-6">
            {SIZES.map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <BrandMascot
                  state="found"
                  category="culinary"
                  size={s}
                  tone="public"
                  animated={animated} intensity={intensity}
                />
                <p className="text-xs font-bold text-slate-500">{s}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* 5. Latar sulit: gelap, parchment, dan biru pekat. */}
        <Panel
          title="Latar sulit"
          note="Field-nya opaque, jadi mascot harusnya tetap terbaca di mana saja."
          tone="public"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex min-h-40 items-center justify-center rounded-xl bg-slate-900 p-4">
              <BrandMascot state="success" size="lg" tone="public" animated={animated} intensity={intensity} />
            </div>
            <div className="flex min-h-40 items-center justify-center rounded-xl bg-[#FAF7EE] p-4">
              <BrandMascot state="working" size="lg" tone="admin" animated={animated} intensity={intensity} />
            </div>
            <div className="flex min-h-40 items-center justify-center rounded-xl bg-blue-600 p-4">
              <BrandMascot state="hello" size="lg" tone="public" animated={animated} intensity={intensity} />
            </div>
          </div>
        </Panel>

        {/* 6. Padanan ukuran CategoryMascot, supaya side-by-side terlihat
              apakah keduanya benar-benar satu keluarga. */}
        <Panel
          title="Satu keluarga?"
          note="Kiri: BrandMascot (Phase 2). Kanan: CategoryMascot (Phase 1) pada ukuran yang setara."
          tone="public"
        >
          <div className="flex flex-wrap items-end gap-8">
            <div className="flex flex-col items-center gap-2">
              <BrandMascot state="neutral" category="culinary" size="lg" animated={animated} intensity={intensity} />
              <p className="text-xs font-bold text-slate-500">BrandMascot · culinary</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <BrandMascot state="neutral" size="lg" animated={animated} intensity={intensity} />
              <p className="text-xs font-bold text-slate-500">BrandMascot · netral</p>
            </div>
          </div>
        </Panel>
      </div>
    </main>
  );
}
