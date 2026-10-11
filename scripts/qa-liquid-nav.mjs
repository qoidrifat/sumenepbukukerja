/* Visual QA liquid-nav: cek struktur CSS + fallback. Jalankan: node scripts/qa-liquid-nav.mjs */
import { readFileSync } from "node:fs";

const css = readFileSync("src/index.css", "utf8");
const workspace = readFileSync("src/components/admin-workspace.tsx", "utf8");
const shell = readFileSync("src/pages/admin/AdminShell.tsx", "utf8");

const checks = [
  {
    name: "Shell kaca: blur 42px + saturate 185%",
    pass: css.includes("blur(var(--liquid-blur))") && css.includes("saturate(var(--liquid-sat))"),
  },
  {
    name: "Shell kaca: cincin brutalism 2px",
    pass: css.includes("border: 2px solid var(--liquid-ring)"),
  },
  {
    name: "Shell kaca: refleksi aqua ::before",
    pass: css.includes(".liquid-nav::before") && css.includes("border-radius: 99px 99px 24px 24px"),
  },
  {
    name: "Shell kaca: glare kursor",
    pass: css.includes(".liquid-glare") && css.includes("mix-blend-mode: overlay"),
  },
  {
    name: "Sliding pill: spring 320ms",
    pass: css.includes("cubic-bezier(0.34, 1.15, 0.64, 1)") && css.includes("320ms"),
  },
  {
    name: "Item: height 46px, padding 0 16px",
    pass: css.includes("height: 46px") && css.includes("padding: 0 16px"),
  },
  {
    name: "Breakpoint ikon-only 720px",
    pass: css.includes("@media (max-width: 720px)") && css.includes(".liquid-item .liquid-lbl"),
  },
  {
    name: "Dropdown: border-radius 20px + blur 36px",
    pass: css.includes(".liquid-dropdown") && css.includes("border-radius: 20px") && css.includes("blur(36px)"),
  },
  {
    name: "Dropup mobile: liquid-dropdown--up",
    pass: css.includes(".liquid-dropdown--up") && css.includes("bottom: calc(100% + 12px)"),
  },
  {
    name: "Chevron rotasi saat expanded",
    pass: css.includes(".liquid-chev") && css.includes('aria-expanded="true"'),
  },
  {
    name: "Reduced-motion: pill snap + glare mati",
    pass: css.includes("@media (prefers-reduced-motion: reduce)") && css.includes(".liquid-pill"),
  },
  {
    name: "Fallback backdrop-filter: bg solid",
    pass: css.includes("@supports not ((backdrop-filter: blur(1px))"),
  },
  {
    name: "color-mix fallback: solid dulu",
    pass: css.includes("--liquid-bg: rgb(250 247 238 / 62%)") && css.includes("--liquid-bg: color-mix"),
  },
  {
    name: "Admin: floating pill sticky",
    pass: workspace.includes("sticky top-0") && workspace.includes("LiquidNav"),
  },
  {
    name: "Admin: dropup di mobile",
    pass: workspace.includes("useIsMobileLiquid") && workspace.includes("liquid-dropdown--up"),
  },
  {
    name: "Admin: 5 fitur NavLink + badge",
    pass: workspace.includes("Ringkasan") && workspace.includes("Katalog") && workspace.includes("badge"),
  },
  {
    name: "Shell: AdminHeader dirender",
    pass: shell.includes("<AdminHeader"),
  },
  {
    name: "Publik: AccountMenu dropup (side=top)",
    pass: readFileSync("src/components/account-menu.tsx", "utf8").includes('side="top"'),
  },
  {
    name: "Publik: TopNav liquid",
    pass: readFileSync("src/pages/Landing.tsx", "utf8").includes("liquid-nav liquid--public"),
  },
];

let fail = 0;
for (const c of checks) {
  const status = c.pass ? "PASS" : "FAIL";
  if (!c.pass) fail++;
  console.log(`[${status}] ${c.name}`);
}
console.log(`\n${checks.length - fail}/${checks.length} PASS`);
process.exit(fail ? 1 : 0);
