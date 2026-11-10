#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-police-emoji.js — checkup (Playwright, Chromium puis WebKit) : la police « KTA Emoji » dessine les emoji
// =====================================================================
// Police embarquée fonts/kta-emoji.woff2 (Twemoji réduit, css/kta-emoji.css, ui.md § Emoji dessinés par la police
// KTA Emoji). Prouve, sur l'app réelle et le relevé fictif :
//   1. la police est chargée (FontFace « KTA Emoji » à l'état loaded, document.fonts.check vrai) ;
//   2. un emoji d'un toast, d'une médaille du Profil et d'une <option> est dessiné par elle : pile calculée de
//      l'élément ouverte par « KTA Emoji », rendu canvas de l'emoji avec cette pile = rendu avec « KTA Emoji » seule
//      et ≠ rendu sans elle ; sous Chromium, police réellement employée par le nœud (CDP getPlatformFontsForNode) ;
//   3. les dessins sur canvas (légende du PNG exporté, panneau d'un point de la vue 3D) : chaque fillText qui porte
//      un emoji (espion posé avant le chargement de l'app) a une ctx.font qui nomme « KTA Emoji », police chargée
//      au moment du dessin ;
//   4. un chiffre, une lettre, # et * ne le sont PAS (rendu identique avec et sans la famille ; CDP : nœud sans emoji
//      dessiné sans Twemoji) ;
//   5. aucune requête hors du serveur local (police comprise) pendant tout le parcours.
// Captures (toast, Profil, légende PNG, panneau 3D) : $POLICE_SHOTS/<moteur>-*.png (défaut : dossier temporaire).
// KTA_MOTEURS=chromium|webkit pour n'en jouer qu'un. Usage : node scripts/smoke/checkup-police-emoji.js
// =====================================================================
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const SHOTS = process.env.POLICE_SHOTS || path.join(os.tmpdir(), "kta-checkup-police-emoji");
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const NOM_3D = "🏁 Arrivée police";

const problemes = [];
let moteur = "";
function pb(msg) { problemes.push(moteur + " : " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) {
  if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : ""));
}

// Espion des dessins de texte sur canvas, posé avant tout script de l'app : garde (police, texte, police chargée)
// de chaque fillText / strokeText qui porte un emoji.
function espion() {
  const RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
  window.__ktaDessins = [];
  ["fillText", "strokeText"].forEach(function (m) {
    const orig = CanvasRenderingContext2D.prototype[m];
    CanvasRenderingContext2D.prototype[m] = function (texte) {
      try {
        const t = String(texte);
        if (RE.test(t) && window.__ktaDessins.length < 400) {
          let charge = null;
          try { charge = document.fonts.check(this.font, t); } catch (e) { charge = null; }
          window.__ktaDessins.push({ font: this.font, texte: t, charge: charge });
        }
      } catch (e) { /* espion muet */ }
      return orig.apply(this, arguments);
    };
  });
}

// Dans la page : un texte est-il dessiné par « KTA Emoji » quand on le dessine avec `pile` ?
// → { pile, avecKta (= rendu avec « KTA Emoji » seule), sansKta (≠ rendu de la pile sans la famille) }.
function sonderRendu(arg) {
  function empreinte(font, texte) {
    const c = document.createElement("canvas");
    c.width = 160; c.height = 80;
    const x = c.getContext("2d");
    x.font = font; x.textBaseline = "middle"; x.fillStyle = "#000";
    x.fillText(texte, 8, 40);
    const d = x.getImageData(0, 0, 160, 80).data;
    let h = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]) { n++; h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11) | 0; }
    }
    return n + ":" + h;
  }
  const pile = arg.pile;
  const sans = pile.split(",").map(function (s) { return s.trim(); })
    .filter(function (s) { return !/KTA Emoji/.test(s); }).join(", ") || "sans-serif";
  const r = {};
  r.pile = pile;
  r.avec = empreinte("48px " + pile, arg.texte);
  r.kta = empreinte('48px "KTA Emoji"', arg.texte);
  r.sans = empreinte("48px " + sans, arg.texte);
  r.parKta = r.avec === r.kta && r.avec !== r.sans;
  r.pasKta = r.avec === r.sans;
  return r;
}

async function policesDuNoeud(cdp, selecteur) {
  if (!cdp) return null;
  const doc = await cdp.send("DOM.getDocument", { depth: -1 });
  const q = await cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: selecteur });
  if (!q.nodeId) return null;
  const r = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: q.nodeId });
  return r.fonts.map(function (f) { return f.familyName + (f.isCustomFont ? " (web)" : "") + " ×" + f.glyphCount; });
}
function parTwemoji(polices) {
  return !!polices && polices.some(function (p) { return /Twemoji|KTA Emoji/.test(p) && /\(web\)/.test(p); });
}

// `selCdp` : nœud rendu à interroger par CDP quand l'élément n'a pas de boîte (une <option> fermée : son <select>).
async function prouverElement(page, cdp, selecteur, nom, selCdp) {
  const info = await page.evaluate(function (sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const RE = /\p{RGI_Emoji}/v;
    const m = RE.exec(el.textContent || el.label || "");
    return { pile: getComputedStyle(el).fontFamily, emoji: m ? m[0] : null };
  }, selecteur);
  if (!info || !info.emoji) { pb(nom + " : élément ou emoji introuvable (" + selecteur + ")"); return; }
  const r = await page.evaluate(sonderRendu, { pile: info.pile, texte: info.emoji });
  verifier(/^"?KTA Emoji"?\s*,/.test(info.pile), nom + " : la pile calculée s'ouvre par « KTA Emoji »", info.pile);
  verifier(r.parKta, nom + " : " + info.emoji + " dessiné par « KTA Emoji » (canvas : pile = KTA seule ≠ sans KTA)", r);
  if (cdp) {
    const polices = await policesDuNoeud(cdp, selCdp || selecteur);
    verifier(parTwemoji(polices), nom + " : police employée par le nœud (CDP) = Twemoji embarquée", polices);
  }
}

async function ouvrirHome(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.OOMGuard && !document.getElementById("splashOverlay") && !!window.PlanRegistry &&
      window.PlanRegistry.getAll().some(function (p) { return /fictif/i.test(p.name || ""); });
  }, 30000);
  await page.waitForTimeout(1200);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.waitForTimeout(300);
}

async function parcours(nom) {
  moteur = nom;
  console.log("\n━━━ " + nom + " ━━━");
  const nav = await lancerMoteur(nom);
  if (!nav) { inf("moteur absent : sauté"); return; }
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const externes = [], erreurs = [];
  page.on("request", function (r) {
    const u = r.url();
    if (!u.startsWith(BASE) && !/^(data|blob|about):/.test(u)) externes.push(u);
  });
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) { /* stockage refusé */ } }
  }, LS_PREGATES);
  await page.addInitScript(espion);
  const cdp = nom === "chromium" ? await ctx.newCDPSession(page) : null;
  if (cdp) { await cdp.send("DOM.enable"); await cdp.send("CSS.enable"); }
  const shot = function (suffixe) { return path.join(SHOTS, nom + "-" + suffixe + ".png"); };

  try {
    await ouvrirHome(page);

    // 1. Police chargée
    const charge = await page.evaluate(async function () {
      if (window.ktaPoliceEmoji) await window.ktaPoliceEmoji.charger();
      await document.fonts.ready;
      const faces = [];
      document.fonts.forEach(function (f) { if (/KTA Emoji/.test(f.family)) faces.push(f.status); });
      return { faces: faces, check: document.fonts.check('16px "KTA Emoji"', "⚠️"),
        api: !!window.ktaPoliceEmoji };
    });
    verifier(charge.api, "window.ktaPoliceEmoji exposé");
    verifier(charge.faces.indexOf("loaded") >= 0, "FontFace « KTA Emoji » chargée", charge.faces);
    verifier(charge.check, "document.fonts.check(\"KTA Emoji\", ⚠️) vrai");

    // 2a. Toast
    await page.evaluate(function () {
      window.OOMGuard.setNiveauNotifs("all");
      window.OOMGuard.showToast("Police A1 # * 7", "warn", 15000);
    });
    await page.waitForTimeout(500);
    await prouverElement(page, cdp, "#kta-toasts .kta-toast .kta-toast-icon", "Toast ⚠️");
    if (cdp) {
      const polices = await policesDuNoeud(cdp, "#kta-toasts .kta-toast .kta-toast-msg");
      verifier(!!polices && !parTwemoji(polices), "Toast : texte « Police A1 # * 7 » dessiné sans Twemoji (CDP)",
        polices);
    }
    const toast = await page.$("#kta-toasts .kta-toast");
    if (toast) await toast.screenshot({ path: shot("toast") });

    // 4. Chiffres, lettres, # et * : jamais par la police emoji (pile du corps et pile mono)
    const piles = await page.evaluate(function () {
      const t = document.querySelector("#kta-toasts .kta-toast-msg");
      return [getComputedStyle(document.body).fontFamily, t ? getComputedStyle(t).fontFamily : ""];
    });
    for (const pile of piles.filter(Boolean)) {
      for (const car of ["7", "0", "A", "g", "#", "*"]) {
        const r = await page.evaluate(sonderRendu, { pile: pile, texte: car });
        verifier(r.pasKta, "« " + car + " » non dessiné par « KTA Emoji » (pile " + pile.slice(0, 40) + "…)", r);
      }
    }
    await page.evaluate(function () { const p = document.getElementById("kta-toasts"); if (p) p.innerHTML = ""; });

    // 2b. Profil : médailles des paliers de hauts faits
    await page.evaluate(function () { const b = document.getElementById("kta-loader-profile-bar"); if (b) b.click(); });
    await attendre(page, function () {
      return !!document.querySelector("#kta-profile-details-modal .kta-feat-badge");
    }, 15000)
      .catch(function () { /* constaté plus bas */ });
    await page.waitForTimeout(400);
    await prouverElement(page, cdp, "#kta-profile-details-modal .kta-feat-badge", "Médaille du Profil");
    const prof = await page.$("#kta-profile-details-modal .kta-readme-modal-box, #kta-profile-details-modal");
    if (prof) await prof.screenshot({ path: shot("profil") });
    await page.evaluate(function () {
      const x = document.getElementById("kta-profile-details-close");
      if (x) x.click();
    });
    await page.waitForTimeout(300);

    // 2c. <option> : une option à emoji de l'app (texte rendu par la page), sinon celles de ConfAdmin
    let selOption = await page.evaluate(function () {
      const RE = /\p{RGI_Emoji}/v;
      const o = Array.prototype.find.call(document.querySelectorAll("option"), function (x) {
        return RE.test(x.textContent);
      });
      if (!o) return null;
      o.setAttribute("data-kta-sonde", "1");
      // La liste de l'app peut être masquée (aucune boîte, rien à interroger) : on en pose une copie visible, mêmes
      // classes, dans la page ; la pile vient des mêmes règles (dont :where(select, option) de css/style.css).
      const liste = o.closest("select");
      if (liste) {
        const r = liste.getBoundingClientRect();
        let cible = liste;
        if (!r.width || !r.height) {
          cible = liste.cloneNode(true);
          cible.removeAttribute("id");
          cible.style.cssText = "position:fixed;left:8px;top:8px;z-index:200000;display:inline-block";
          document.body.appendChild(cible);
          Array.prototype.forEach.call(document.querySelectorAll("option[data-kta-sonde]"), function (x, i) {
            if (i === 0) x.removeAttribute("data-kta-sonde");
          });
        }
        cible.setAttribute("data-kta-sonde-liste", "1");
        const oc = cible.querySelector("option[data-kta-sonde]");
        if (oc) oc.selected = true;
      }
      return "option[data-kta-sonde]";
    });
    if (selOption) {
      await prouverElement(page, cdp, selOption, "<option> de l'app", "select[data-kta-sonde-liste]");
    } else {
      const p2 = await ctx.newPage();
      await p2.goto(BASE + "/confadmin.html", { waitUntil: "domcontentloaded" });
      await p2.waitForTimeout(1500);
      selOption = await p2.evaluate(function () {
        const RE = /\p{RGI_Emoji}/v;
        let o = Array.prototype.find.call(document.querySelectorAll("option"), function (x) {
          return RE.test(x.textContent);
        });
        if (!o) {   // ConfAdmin sans plan : on pose l'option du format telle que confadmin.js la rend
          const s = document.createElement("select");
          s.innerHTML = '<option value="zip">📦 ZIP</option>';
          document.body.appendChild(s);
          o = s.firstChild;
        }
        o.setAttribute("data-kta-sonde", "1");
        o.parentElement.setAttribute("data-kta-sonde-liste", "1");
        o.selected = true;
        return "option[data-kta-sonde]";
      });
      const cdp2 = cdp ? await ctx.newCDPSession(p2) : null;
      if (cdp2) { await cdp2.send("DOM.enable"); await cdp2.send("CSS.enable"); }
      await prouverElement(p2, cdp2, selOption, "<option> de ConfAdmin", "select[data-kta-sonde-liste]");
      await p2.close();
    }

    // 3a. Légende du PNG exporté (relevé fictif)
    await page.evaluate(function () {
      const p = window.PlanRegistry.getAll().find(function (x) { return /fictif/i.test(x.name || ""); });
      window.chargerPlanDuRegistre(p.id);
    });
    await attendre(page, function () {
      return !!window.PLAN_CONFIG && !!window.map && !!window.MyKTAMapExporterGenererCanvasLegende;
    }, 45000);
    await page.waitForTimeout(2500);
    await page.evaluate(function () { window.__ktaDessins.length = 0; });
    const leg = await page.evaluate(async function () {
      const r = await window.MyKTAMapExporterGenererCanvasLegende({ size: "large", scale: 2 });
      const cv = r && (r.canvas || r);
      return cv && cv.toDataURL ? cv.toDataURL("image/png") : null;
    });
    if (leg) fs.writeFileSync(shot("legende-png"), Buffer.from(leg.split(",")[1], "base64"));
    const dLeg = await page.evaluate(function () { return window.__ktaDessins.slice(); });
    verifier(dLeg.length > 0, "Légende PNG : " + dLeg.length + " texte(s) à emoji dessiné(s) sur le canvas",
      dLeg.slice(0, 3));
    const fautesLeg = dLeg.filter(function (d) { return !/KTA Emoji/.test(d.font) || d.charge !== true; });
    verifier(dLeg.length > 0 && fautesLeg.length === 0,
      "Légende PNG : ctx.font nomme « KTA Emoji », police chargée au dessin",
      fautesLeg.slice(0, 3));

    // 3b. Panneau d'un point de la vue 3D (nom avec emoji, comme un point créé « 🏁 Arrivée »)
    await page.evaluate(function () { window.__ktaDessins.length = 0; });
    const v3d = await page.evaluate(async function (nomPoi) {
      if (typeof window.ktaChargerVue3D !== "function" || !(await window.ktaChargerVue3D())) {
        return { erreur: "vue 3D absente" };
      }
      const sc = window.APP_CONFIG.scale;
      const W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
      const d = { x: W / 2, y: H / 2, cap: 90 };
      window.setEditorPoints(window.getEditorPoints().concat([{ id: nomPoi, nom: nomPoi, uid: "pt_police_3d", level: 0,
        tags: ["salle"], x: d.x + 4 * sc, y: d.y }]));
      await window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30 });
      await new Promise(function (r) { setTimeout(r, 1500); });
      return { panneaux: window.KtaVue3D.etat().panneaux.filter(function (q) { return q.nom === nomPoi; }).length };
    }, NOM_3D).catch(function (e) { return { erreur: String(e && e.message) }; });
    inf("vue 3D : " + JSON.stringify(v3d));
    const cv3d = await page.$("#kta-vue3d");
    if (cv3d) await cv3d.screenshot({ path: shot("vue3d") });
    const d3 = await page.evaluate(function (nomPoi) {
      return window.__ktaDessins.filter(function (d) { return d.texte.indexOf("🏁") >= 0 || d.texte === nomPoi; });
    }, NOM_3D);
    verifier(d3.length > 0, "Vue 3D : le panneau « " + NOM_3D + " » est dessiné sur canvas", v3d);
    const fautes3d = d3.filter(function (d) { return !/KTA Emoji/.test(d.font) || d.charge !== true; });
    verifier(d3.length > 0 && fautes3d.length === 0, "Vue 3D : ctx.font du panneau nomme « KTA Emoji », police chargée",
      fautes3d.slice(0, 3));
    if (d3.length) {
      const r = await page.evaluate(sonderRendu, { pile: d3[0].font.replace(/^.*?\d+px\s+/, ""), texte: "🏁" });
      verifier(r.parKta, "Vue 3D : 🏁 dessiné par « KTA Emoji » avec la police du panneau", r);
    }
    await page.evaluate(function () { if (window.KtaVue3D) window.KtaVue3D.fermer(); });

    // 5. Aucune requête hors du serveur local
    verifier(externes.length === 0, "aucune requête réseau externe (" + externes.length + ")", externes.slice(0, 5));
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  } catch (e) {
    pb("parcours interrompu : " + (e && e.stack || e));
  } finally {
    await nav.close();
  }
}

(async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  try {
    for (const m of moteurs()) await parcours(m);
  } finally {
    server.close();
  }
  console.log("\nCaptures : " + SHOTS);
  console.log(problemes.length ? "\n⚠️ " + problemes.length + " problème(s)"
    : "\n🎉 police KTA Emoji : chargée, employée, sans réseau");
  process.exit(problemes.length ? 1 : 0);
})();
