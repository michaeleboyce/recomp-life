// Themed (CSS-variable) system for the glass-box mid-century boards.
const X_CSS = `
body{margin:0}
.board{width:390px;height:844px;box-sizing:border-box;background:var(--bg);color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;display:flex;flex-direction:column;overflow:hidden;position:relative}
.espresso{--bg:#1b1512;--surface:#241b16;--surface2:#33271f;--ink:#f3e9d8;--muted:#b8a892;--line:rgba(243,233,216,0.11);--accent:#e0a93b;--hot:#ef7a4a;--cool:#6dbdb3;--cta:#e0a93b;--on-cta:#1b1512;--navbg:#17110e;--tint:#a8602f}
.paper{--bg:#f3e9d8;--surface:#eadfca;--surface2:#dccfb4;--ink:#2a201a;--muted:#6b5a4c;--line:rgba(42,32,26,0.18);--accent:#a04a1f;--hot:#b8472a;--cool:#2f6f6b;--cta:#2a201a;--on-cta:#f3e9d8;--navbg:#ebdfc9;--tint:#b5653a}
.teal{--bg:#0f2d2b;--surface:#16403c;--surface2:#205650;--ink:#f3e9d8;--muted:#a9c2b8;--line:rgba(243,233,216,0.13);--accent:#f2bd4a;--hot:#ff8a5c;--cool:#8fd6cc;--cta:#ef7a4a;--on-cta:#1b1512;--navbg:#0b2422;--tint:#2f7f78}
.board a{color:inherit;text-decoration:none}
.board p,.board h1,.board h2{margin:0}
.eyebrow{font-family:'Jost',sans-serif;font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase}
.disp{font-family:'Jost',sans-serif;font-weight:800;text-transform:uppercase;line-height:0.95;letter-spacing:0.01em}
.mono{font-family:'DM Mono',monospace}
.muted{color:var(--muted)}.acc{color:var(--accent)}.hot{color:var(--hot)}.cool{color:var(--cool)}
.t1{color:var(--hot)}.t2{color:var(--accent)}.t3{color:var(--cool)}
.rel{position:relative}
.ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.tint{position:absolute;inset:0;background:var(--tint);mix-blend-mode:color}
.fade{position:absolute;inset:0;background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 50%,transparent) 0%,color-mix(in srgb,var(--bg) 8%,transparent) 34%,color-mix(in srgb,var(--bg) 86%,transparent) 78%,var(--bg) 100%)}
.arch{position:relative;overflow:hidden;border-radius:999px 999px 14px 14px;flex-shrink:0}
.stripes{display:flex;flex-direction:column;gap:3px}
.stripes i{display:block;height:4px;border-radius:2px}
.figs{display:flex;gap:4px}
.figp{background:color-mix(in srgb,var(--bg) 84%,transparent);border-radius:16px;padding:8px 8px 6px;display:flex;flex-direction:column;align-items:center;gap:4px}
.cta{display:flex;align-items:center;justify-content:center;border:0;border-radius:999px;background:var(--cta);color:var(--on-cta) !important;font:800 19px/1 'Jost',sans-serif;letter-spacing:0.14em;text-transform:uppercase;height:58px;flex-shrink:0}
.cta.alt{background:var(--surface2);color:var(--ink) !important;font-size:15px}
.pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;background:var(--surface);font-size:13px;font-weight:700;color:var(--accent) !important;white-space:nowrap}
.row{display:grid;grid-template-columns:22px minmax(0,1fr) auto 12px;align-items:center;gap:10px;min-height:52px;border-top:1px solid var(--line)}
.row .n{font-size:15px;font-weight:700;display:block}
.row .s{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.row .w{text-align:right}.row .w b{font:800 26px/1 'Jost',sans-serif}
.row .w span{display:block;font:500 11px 'DM Mono',monospace;color:var(--muted)}
.tier{font:500 11px 'DM Mono',monospace}
.chev{color:var(--muted);font-size:18px}
.tile{background:var(--surface);border-radius:16px;padding:9px 11px;display:flex;flex-direction:column;gap:1px;min-width:0}
.tile b{font:800 24px/1.05 'Jost',sans-serif}
.tile small{font-size:11px;color:var(--muted);white-space:nowrap}
.card{background:var(--surface);border-radius:20px;padding:12px 14px}
.g{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:10px;font:700 9.5px 'DM Sans',sans-serif;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap;box-sizing:border-box;vertical-align:middle}
.g.strong{background:var(--cool);color:var(--bg)}
.g.moderate{border:1.5px solid var(--cool);color:var(--cool)}
.g.limited{border:1.5px solid var(--accent);color:var(--accent)}
.g.heuristic{border:1.5px dashed var(--hot);color:var(--hot)}
.g.program{background:var(--surface2);color:var(--ink)}
.tr{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:10px;padding:8px 0;border-top:1px solid var(--line);align-items:start}
.tr .dot{width:24px;height:24px;border-radius:12px;background:var(--surface2);font:500 12px 'DM Mono',monospace;display:flex;align-items:center;justify-content:center}
.tr b.h{font-size:14px;display:block}
.tr p{font-size:12px;color:var(--muted);line-height:1.35}
.tr .val{font:800 19px/1.2 'Jost',sans-serif;text-align:right;white-space:nowrap}
.rg{position:relative;height:6px;border-radius:3px;background:var(--surface2)}
.rg i{position:absolute;top:0;bottom:0;border-radius:3px;background:var(--cool);opacity:0.55}
.rg u{position:absolute;top:-3px;width:12px;height:12px;border-radius:6px;background:var(--accent);margin-left:-6px}
.why{text-decoration:underline !important;text-decoration-style:dotted !important;text-underline-offset:3px;color:var(--accent) !important;font-weight:600}
.nav{height:72px;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:center;background:var(--navbg);font-size:11px;font-weight:600;text-align:center;color:var(--muted);flex-shrink:0;margin-top:auto}
.nav .on{color:var(--accent) !important}
.fab{justify-self:center;width:52px;height:52px;border-radius:26px;background:var(--cta);color:var(--on-cta) !important;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:500}
.top{padding:10px 12px 0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.back{height:44px;display:inline-flex;align-items:center;padding:0 8px;font-size:14px;font-weight:600;color:var(--accent) !important}
`;

const GRADES: Record<string, string> = {
  strong: "Strong", moderate: "Moderate", limited: "Limited", heuristic: "Heuristic", program: "Program rule",
};

const FIGURE_MAPS: Record<string, Record<string, string>> = {
  espresso: {
    "#294b39": "#553224", "#2b7351": "#84432a", "#31a773": "#bd5a31", "#4aefa7": "#f47c45",
    "#2e3034": "#3b2f27", "#202225": "#2b221d", "#17181b": "#211915", "#52555b": "#7d6c5b", "#07090b": "#1b1512",
  },
  paper: {
    "#294b39": "#efc9a6", "#2b7351": "#e6a070", "#31a773": "#d67440", "#4aefa7": "#b8472a",
    "#2e3034": "#dccfb4", "#202225": "#e7dcc6", "#17181b": "#cdbd9f", "#52555b": "#8a7762", "#07090b": "#f3e9d8",
  },
  teal: {
    "#294b39": "#4f5a36", "#2b7351": "#8a7a38", "#31a773": "#c79b3d", "#4aefa7": "#f7c655",
    "#2e3034": "#1f4d48", "#202225": "#173b38", "#17181b": "#122f2c", "#52555b": "#5f928c", "#07090b": "#0f2d2b",
  },
};

const PREFIX_THEME: [string, string][] = [["Mcm", "espresso"], ["Glass", "espresso"], ["Paper", "paper"], ["Atom", "teal"]];

export function recolorFor(name: string, html: string): string {
  const theme = PREFIX_THEME.find(([p]) => name.startsWith(p))?.[1];
  if (!theme) return html;
  const map = FIGURE_MAPS[theme];
  return html.replace(/#[0-9a-f]{6}/g, (hex) => map[hex] ?? hex);
}

export function expandX(html: string): string {
  return html
    .replace(/%%XHEAD (\w+) (.+?)%%/g, (_, theme, title) =>
      `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Jost:wght@500;600;700;800&display=swap" rel="stylesheet">\n<style>${X_CSS}</style>\n</helmet>\n<div class="board ${theme}">`)
    .replace(/%%XNAV (\w+) (\w+)%%/g, (_, prefix, on) => {
      const item = (key: string, label: string, href: string) =>
        `<a href="${href}"${key === on ? ' class="on"' : ""}>${label}</a>`;
      const progress = prefix === "Glass" ? "GlassAlmanac.dc.html" : "#";
      return `<nav class="nav" aria-label="Main">${item("today", "Today", `${prefix}Today.dc.html`)}${item("progress", "Progress", progress)}<a href="#" class="fab" aria-label="Quick add">+</a>${item("log", "Log", "#")}${item("more", "More", prefix === "Glass" ? "GlassModel.dc.html" : "#")}</nav>`;
    })
    .replace(/%%GRADE (\w+)%%/g, (_, key) => `<span class="g ${key}">${GRADES[key]}</span>`)
    .replace(/%%RANGE (\d+) (\d+) (\d+)%%/g, (_, lo, hi, dot) =>
      `<span class="rg" aria-hidden="true" style="display:block"><i style="left:${lo}%;width:${Number(hi) - Number(lo)}%"></i><u style="left:${dot}%"></u></span>`);
}
