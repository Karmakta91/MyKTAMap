#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-toasts.js — checkup (Playwright, pas un hook pré-commit) : toasts empilés et « J'accepte » des CGU
// =====================================================================
// PC 1280 et téléphone 390, thème sombre et clair. Toasts (js/oomGuard.js > _renderToast) : 3 et 5 toasts
// d'affilée (empilement, plus récent en bas, plafond 3, une erreur part en dernier), types info / success /
// warn / error (icône, liseré), réglage « Essentielles » (défaut) et « Silence », Échap, contraste du texte
// (≥ 4,5:1) et du liseré (≥ 3:1), toasts dans l'écran et au-dessus de la carte du relevé fictif.
// CGU (js/legalGate.js > ouvrirGate) : « J'accepte » inactif mesuré (texte ≥ 3:1), consigne « Coche la case »
// présente puis retirée à la coche.
// check-notifs.js teste la décision et le code ; seul ce parcours voit la pile rendue.
// Captures : $TOASTS_SHOTS (défaut : dossier temporaire). Usage : node scripts/smoke/checkup-toasts.js
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const os = require("os");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const SHOTS = process.env.TOASTS_SHOTS || path.join(os.tmpdir(), "kta-checkup-toasts");
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const FORMATS = [
  { nom: "PC 1280", viewport: { width: 1280, height: 800 } },
  { nom: "téléphone 390", viewport: { width: 390, height: 844 }, mobile: true }
];
const THEMES = ["dark", "light"];

function planFictif() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const fictif = ((idx && idx.plans) || []).find(function (p) { return /fictif/i.test(p.name || ""); });
    return fictif ? fictif.name : null;
  } catch (e) {
    return null;
  }
}
const PLAN = planFictif();

const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail ? " " + JSON.stringify(detail) : "")); }

// État de la pile, lu dans la page : ordre DOM = ordre d'affichage (colonne).
function lirePile(page) {
  return page.evaluate(function () {
    function rgb(s) {
      const m = String(s).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map(function (x) { return parseFloat(x); });
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function lum(c) {
      const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
    const pile = document.getElementById("kta-toasts");
    if (!pile) return { n: 0, toasts: [] };
    const toasts = Array.prototype.filter.call(pile.children, function (el) {
      return !el.classList.contains("kta-toast-leaving");
    }).map(function (el) {
      const cs = getComputedStyle(el);
      const msg = el.querySelector(".kta-toast-msg");
      const fond = rgb(cs.backgroundColor), texte = rgb(getComputedStyle(msg).color), lis = rgb(cs.borderLeftColor);
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      // elementFromPoint ignore pointer-events: none (voulu sur la pile) : on le lève le temps de la mesure.
      el.style.pointerEvents = "auto";
      const dessus = document.elementFromPoint(cx, cy);
      el.style.pointerEvents = "";
      return {
        type: el.getAttribute("data-kta-type"), id: el.id, msg: msg.textContent,
        icone: el.querySelector(".kta-toast-icon").textContent,
        lisere: cs.borderLeftColor, ctTexte: Math.round(ratio(texte, fond) * 100) / 100,
        ctLisere: Math.round(ratio(lis, fond) * 100) / 100, fondOpaque: !!fond && fond.a === 1,
        haut: r.top, bas: r.bottom, gauche: r.left, droite: r.right, z: cs.zIndex,
        auDessus: !!dessus && (dessus === el || el.contains(dessus))
      };
    });
    return { n: toasts.length, toasts: toasts, vw: window.innerWidth };
  });
}

async function viderPile(page) {
  await page.evaluate(function () { const p = document.getElementById("kta-toasts"); if (p) p.innerHTML = ""; });
}
async function emettre(page, liste, niveau) {
  await page.evaluate(function (a) {
    window.OOMGuard.setNiveauNotifs(a.niveau);
    a.liste.forEach(function (t) { window.OOMGuard.showToast(t[0], t[1], t[2]); });
  }, { liste: liste, niveau: niveau });
  await page.waitForTimeout(450);   // animations d'entrée et de sortie (0,3 s / 0,25 s)
}

async function ouvrirHome(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.OOMGuard && !document.getElementById("splashOverlay"); }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.waitForTimeout(500);
}

async function scenarioToasts(page, cfg) {
  const tag = cfg.format.nom + " / " + cfg.theme;
  const W = cfg.format.viewport.width;

  // 1. Trois toasts d'affilée en « Toutes » : tous restent, dans l'ordre, le plus récent en bas
  await viderPile(page);
  await emettre(page, [["Toast un", "info"], ["Toast deux", "warn"], ["Toast trois", "error"]], "all");
  let p = await lirePile(page);
  verifier(p.n === 3, tag + " : 3 toasts d'affilée → 3 visibles (plus d'écrasement)", { n: p.n });
  verifier(p.n === 3 && p.toasts[0].msg === "Toast un" && p.toasts[2].msg === "Toast trois"
    && p.toasts[0].bas <= p.toasts[1].haut && p.toasts[1].bas <= p.toasts[2].haut,
  tag + " : empilés sans chevauchement, le plus récent en bas", p.toasts.map(function (t) { return [t.msg, t.haut, t.bas]; }));
  verifier(p.n === 3 && p.toasts[2].id === "kta-toast" && !p.toasts[0].id && !p.toasts[1].id,
    tag + " : seul le plus récent porte #kta-toast");

  // 2. Les quatre types : icône, liseré propre, contrastes
  await viderPile(page);
  await emettre(page, [["Type info", "info"], ["Type succès", "success"], ["Type avert", "warn"]], "all");
  const a = (await lirePile(page)).toasts;
  await emettre(page, [["Type erreur", "error"]], "all");
  const b = (await lirePile(page)).toasts;
  const parType = {};
  a.concat(b).forEach(function (t) { parType[t.type] = t; });
  const ICONES = { info: "ℹ️", success: "✅", warn: "⚠️", error: "❌" };
  Object.keys(ICONES).forEach(function (ty) {
    const t = parType[ty];
    verifier(!!t && t.icone === ICONES[ty], tag + " : type " + ty + " → icône " + ICONES[ty], t && t.icone);
    if (!t) return;
    verifier(t.ctTexte >= 4.5 && t.fondOpaque, tag + " : " + ty + " texte " + t.ctTexte + ":1 (≥ 4,5)");
    verifier(t.ctLisere >= 3, tag + " : " + ty + " liseré " + t.lisere + " à " + t.ctLisere + ":1 (≥ 3)");
  });
  const liseres = Object.keys(parType).map(function (k) { return parType[k].lisere; });
  verifier(new Set(liseres).size === 4, tag + " : quatre liserés distincts", liseres);
  await page.screenshot({ path: path.join(SHOTS, "types-" + cfg.slug + ".png") });

  // 3. Cinq toasts d'affilée : plafond 3, les plus anciens partis
  await viderPile(page);
  await emettre(page, [["N1", "info"], ["N2", "success"], ["N3", "warn"], ["N4", "info"], ["N5", "success"]], "all");
  p = await lirePile(page);
  verifier(p.n === 3 && p.toasts.map(function (t) { return t.msg; }).join(",") === "N3,N4,N5",
    tag + " : 5 toasts → les 3 plus récents (N3, N4, N5)", p.toasts.map(function (t) { return t.msg; }));
  verifier(p.toasts.every(function (t) { return t.gauche >= 0 && t.droite <= W && t.haut >= 50; }),
    tag + " : la pile tient dans la largeur (" + W + " px) et sous l'en-tête",
    p.toasts.map(function (t) { return [t.gauche, t.droite, t.haut]; }));
  await page.screenshot({ path: path.join(SHOTS, "cinq-" + cfg.slug + ".png") });

  // 4. Une erreur ne se fait pas chasser par des toasts de rang inférieur
  await viderPile(page);
  await emettre(page, [["E1", "error"], ["I1", "info"], ["I2", "info"], ["I3", "success"], ["I4", "warn"]], "all");
  p = await lirePile(page);
  verifier(p.n === 3 && p.toasts[0].msg === "E1" && p.toasts[2].msg === "I4",
    tag + " : au plafond, l'erreur reste (E1 + les 2 plus récents)", p.toasts.map(function (t) { return t.msg; }));

  // 5. Même message répété : une seule place
  await viderPile(page);
  await emettre(page, [["Répété", "warn"], ["Autre", "info"], ["Répété", "warn"]], "all");
  p = await lirePile(page);
  verifier(p.n === 2 && p.toasts[1].msg === "Répété", tag + " : un message répété redescend au lieu de doubler",
    p.toasts.map(function (t) { return t.msg; }));

  // 6. Réglage par défaut (« Essentielles ») : info tu, succès et warn visibles
  await viderPile(page);
  await emettre(page, [["Ess info", "info"], ["Ess succès", "success"], ["Ess warn", "warn"]], "essential");
  p = await lirePile(page);
  verifier(p.toasts.map(function (t) { return t.msg; }).join(",") === "Ess succès,Ess warn",
    tag + " : « Essentielles » → succès et warn visibles, info tu", p.toasts.map(function (t) { return t.msg; }));

  // 7. « Silence » : succès et warn tus, sauf important ; erreur visible
  await viderPile(page);
  await emettre(page, [["Sil succès", "success"], ["Sil warn", "warn"], ["Sil info", "info"],
    ["Sil succès imp", "success", { important: true }], ["Sil erreur", "error"]], "silent");
  p = await lirePile(page);
  verifier(p.toasts.map(function (t) { return t.msg; }).join(",") === "Sil succès imp,Sil erreur",
    tag + " : « Silence » → succès tu (sauf important), erreur visible", p.toasts.map(function (t) { return t.msg; }));

  // 8. Échap ferme le plus récent, pas les autres
  await viderPile(page);
  await emettre(page, [["Esc 1", "warn"], ["Esc 2", "warn"]], "all");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  p = await lirePile(page);
  verifier(p.n === 1 && p.toasts[0].msg === "Esc 1", tag + " : Échap ferme le toast le plus récent", p.toasts.map(function (t) { return t.msg; }));
  await viderPile(page);
  await page.evaluate(function () { window.OOMGuard.setNiveauNotifs("essential"); });
}

async function scenarioCgu(nav, cfg) {
  const tag = cfg.format.nom + " / " + cfg.theme;
  const ctx = await nav.newContext({ viewport: cfg.format.viewport, isMobile: !!cfg.format.mobile, hasTouch: !!cfg.format.mobile });
  const page = await ctx.newPage();
  const ls = Object.assign({}, LS_PREGATES, { "myktamap_theme_v1": cfg.theme });
  delete ls.myktamap_terms_accepted_v1;
  await page.addInitScript(function (l) {
    for (const k in l) { try { localStorage.setItem(k, l[k]); } catch (e) {} }
  }, ls);
  brancherConsole(page);
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!document.getElementById("kta-legal-accept"); }, 20000);
    await page.waitForTimeout(600);
    const m = await page.evaluate(function () {
      function rgb(s) {
        const x = String(s).match(/rgba?\(([^)]+)\)/);
        if (!x) return null;
        const p = x[1].split(",").map(function (v) { return parseFloat(v); });
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      }
      function lum(c) {
        const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      }
      function ratio(a, b) { const u = lum(a), v = lum(b); return (Math.max(u, v) + 0.05) / (Math.min(u, v) + 0.05); }
      // Fond effectif : premier ancêtre opaque (les surfaces de la charte sont opaques).
      function fond(el) {
        for (let e = el; e; e = e.parentElement) {
          const c = rgb(getComputedStyle(e).backgroundColor);
          if (c && c.a === 1) return c;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
      }
      const btn = document.getElementById("kta-legal-accept"), hint = document.getElementById("kta-legal-hint");
      const csb = getComputedStyle(btn);
      const r = hint ? hint.getBoundingClientRect() : null;
      return {
        disabled: btn.disabled, opacite: csb.opacity, texteBtn: csb.color, fondBtn: csb.backgroundColor,
        ctBtn: Math.round(ratio(rgb(csb.color), fond(btn)) * 100) / 100,
        hint: hint ? hint.textContent : null, hintVisible: !!r && r.width > 0 && r.height > 0,
        ctHint: hint ? Math.round(ratio(rgb(getComputedStyle(hint).color), fond(hint)) * 100) / 100 : 0,
        decrit: btn.getAttribute("aria-describedby")
      };
    });
    verifier(m.disabled, tag + " CGU : « J'accepte » inactif tant que la case est vide");
    verifier(m.ctBtn >= 3 && parseFloat(m.opacite) === 1,
      tag + " CGU : texte du bouton inactif " + m.texteBtn + " sur " + m.fondBtn + " = " + m.ctBtn + ":1 (≥ 3, opacité 1)");
    verifier(m.hintVisible && /case/i.test(m.hint || "") && m.decrit === "kta-legal-hint",
      tag + " CGU : consigne « " + m.hint + " » affichée, reliée au bouton");
    verifier(m.ctHint >= 4.5, tag + " CGU : consigne à " + m.ctHint + ":1 (≥ 4,5)");
    await page.screenshot({ path: path.join(SHOTS, "cgu-" + cfg.slug + ".png") });
    await page.click("#kta-legal-cb");
    await page.waitForTimeout(200);
    const apres = await page.evaluate(function () {
      const h = document.getElementById("kta-legal-hint");
      return { actif: !document.getElementById("kta-legal-accept").disabled, hintCache: !h || h.getBoundingClientRect().height === 0 };
    });
    verifier(apres.actif && apres.hintCache, tag + " CGU : case cochée → bouton actif, consigne retirée");
    await page.click("#kta-legal-accept");
    await page.waitForTimeout(400);
    verifier(!(await page.$("#kta-legal-accept")), tag + " CGU : « J'accepte » ferme la fenêtre");
  } catch (e) {
    pb(tag + " CGU : exception du harnais : " + (e && e.message));
  } finally {
    await ctx.close();
  }
}

function brancherConsole(page) {
  page.on("pageerror", function (e) { erreursConsole.push("pageerror : " + e.message); });
  page.on("console", function (m) {
    if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|Licence-pro\.json|404/i.test(m.text())) {
      erreursConsole.push(m.text());
    }
  });
}

(async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const nav = await lancerNavigateur(chromium);
  try {
    for (const format of FORMATS) {
      for (const theme of THEMES) {
        const cfg = { format: format, theme: theme, slug: (format.mobile ? "tel" : "pc") + "-" + theme };
        console.log("\n── " + format.nom + " · thème " + (theme === "dark" ? "sombre" : "clair") + " ──");
        const ctx = await nav.newContext({ viewport: format.viewport, isMobile: !!format.mobile, hasTouch: !!format.mobile });
        const page = await ctx.newPage();
        await page.addInitScript(function (l) {
          for (const k in l) { try { localStorage.setItem(k, l[k]); } catch (e) {} }
        }, Object.assign({}, LS_PREGATES, { "myktamap_theme_v1": theme }));
        brancherConsole(page);
        try {
          await ouvrirHome(page);
          verifier(await page.evaluate(function (t) {
            return document.documentElement.classList.contains("kta-theme-light") === (t === "light");
          }, theme), "thème " + theme + " appliqué");
          await scenarioToasts(page, cfg);
          // Sur la carte du relevé fictif : la pile passe au-dessus de l'en-tête et des barres latérales.
          if (PLAN) {
            await page.getByText(PLAN, { exact: false }).first().click();
            await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map; }, 30000);
            await page.waitForTimeout(3500);
            await page.evaluate(function () {
              const m = document.getElementById("kta-session-modal");
              if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
            });
            await viderPile(page);
            await emettre(page, [["Carte warn", "warn"], ["Carte succès", "success"], ["Carte erreur", "error"]], "all");
            const p = await lirePile(page);
            verifier(p.n === 3 && p.toasts.every(function (t) { return t.auDessus; }),
              cfg.format.nom + " / " + theme + " : sur la carte, les 3 toasts sont au premier plan",
              p.toasts.map(function (t) { return [t.msg, t.auDessus]; }));
            await page.screenshot({ path: path.join(SHOTS, "carte-" + cfg.slug + ".png") });
            await page.evaluate(function () { window.OOMGuard.setNiveauNotifs("essential"); });
          } else {
            inf("relevé fictif absent de data/index.json : pas de passage sur la carte");
          }
        } catch (e) {
          pb(format.nom + " / " + theme + " : exception du harnais : " + (e && e.message));
        } finally {
          await ctx.close();
        }
        await scenarioCgu(nav, cfg);
      }
    }
    // Disparition d'elle-même : un info part après 6 s, sans geste.
    console.log("\n── disparition automatique ──");
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(function (l) {
      for (const k in l) { try { localStorage.setItem(k, l[k]); } catch (e) {} }
    }, LS_PREGATES);
    brancherConsole(page);
    await ouvrirHome(page);
    await emettre(page, [["Auto info", "info"], ["Auto succès", "success"], ["Auto warn", "warn"]], "all");
    await page.waitForTimeout(6600);
    const p = await lirePile(page);
    verifier(p.n === 1 && p.toasts[0].msg === "Auto warn", "info et succès partis seuls après 6 s, le warn reste (10 s)",
      p.toasts.map(function (t) { return t.msg; }));
    await ctx.close();
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  if (erreursConsole.length) {
    erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  }
  console.log("\n  •  captures : " + SHOTS);
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — les toasts s'empilent (3 au plus), le succès a son type, « J'accepte » se lit.");
  process.exit(0);
})();
