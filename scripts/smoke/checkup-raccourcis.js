#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-raccourcis.js — checkup (Playwright) : la fiche des raccourcis (touche ?) dit vrai
// =====================================================================
// Relevé fictif (sinon le premier plan de l'index), objets FICTIFS jamais écrits. Joué sous chaque moteur
// (KTA_MOTEURS, Chromium et WebKit par défaut).
// Vérifie : « ? » ouvre la fiche ; elle affiche ce que rend ShortcutsCheatsheet.lignes() (rien de plus, rien de moins),
// dont la rotation (Maj + molette) et, au dépliage de « Vue 3D », les touches de KtaVue3D.raccourcis() (vue3d.js
// chargé, three.js non) ; noms de touches lisibles (Maj, Échap) ; puis CHAQUE ligne affichée est jouée au clavier ou à
// la souris et son effet relu (outil pressé, mesure annulée, carte tournée puis redressée par le bouton nord, sommet
// déplacé, zoom, pan, bulle fermée, vue 3D : pas, cap, V, zoom, inclinaison, caméra libre, cap au clic droit, Échap…).
// Échap désarme l'outil : chacun (✏️ 📐 🛣️ ⬛ 🏛️, carte au focus ou non), après la fenêtre de nommage, la bulle, le
// panneau d'un groupe, l'appui long ; rien depuis un champ texte ; vue 3D : sa règle seule (vue d'édition, réglages).
// Une ligne sans contrôle ici = rouge : une touche ajoutée à la fiche doit être prouvée. Ouverte par-dessus la vue 3D,
// la fiche montre la Vue 3D d'abord, dépliée, et Échap la ferme sans fermer la vue.
// Gestes tactiles (section des appareils tactiles) : prouvés par checkup-rotation-manuelle.js (deux doigts),
// checkup-ajuster-sommets.js (appui long) et checkup-vue-3d.js (gestes à deux doigts de la vue d'édition).
// Usage : node scripts/smoke/checkup-raccourcis.js (SMOKE_PORT pour une autre copie) · code : js/shortcutsCheatsheet.js,
// js/vue3d.js > raccourcis · doc : docs/architecture/ui.md § Raccourcis clavier
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
let _prefixe = "";
function pb(msg) { problemes.push(_prefixe + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Lignes prouvées par un autre checkup (gestes tactiles, non jouables à la souris).
const AILLEURS = {
  "gestes.tourner": "checkup-rotation-manuelle.js",
  "gestes.sommet": "checkup-ajuster-sommets.js",
  "gestes.v3d": "checkup-vue-3d.js"
};
const joues = new Set();
function joue(id) { joues.add(id); }

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.evaluate(function () {
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaAjusterSommets &&
      !!window.HistoryManager && !!window._groupes && !!window._groupes.mesure && !!window.ShortcutsCheatsheet;
  }, 60000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    const cfg = window.APP_CONFIG;
    if (cfg.multiLevel === true) {
      cfg.activeLevel = 0;
      if (cfg.visibleLevels.indexOf(0) < 0) cfg.visibleLevels.push(0);
    }
  });
  // La vue retrouvée à la réouverture se pose après le chargement : attendue avant de fixer la nôtre.
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    window.map.setView(window.map.getCenter(), window.map.getMaxZoom() - 1, { animate: false });
    window.setRoads([]); window.setZones([]); window.setStructures([]);
    window.renderRoads();
    if (window.resetMesure) window.resetMesure();
    window.HistoryManager.reset();
    const m = window.map, H = window.APP_CONFIG.imageHeight;
    const cr0 = m.getContainer().getBoundingClientRect();
    const c = m.containerPointToLatLng([innerWidth / 2 - cr0.left, innerHeight / 2 - 40 - cr0.top]);
    const k = 1 / m.options.crs.scale(m.getZoom());
    const bx = c.lng, by = H - c.lat;
    window.__rc = {
      P: function (u, v) { return { x: bx + u * k, y: by + v * k }; },
      ecran: function (p) {
        const q = m.latLngToContainerPoint(window.convertCoord(p.x, p.y));
        const cr = m.getContainer().getBoundingClientRect();
        return [cr.left + q.x, cr.top + q.y];
      },
      clic: function (p) { m.fire("click", { latlng: window.L.latLng(H - p.y, p.x) }); },
      centre: function () { return [innerWidth / 2, innerHeight / 2 - 40]; },
      choisir: function (groupe, cle) {
        const g = window._groupes[groupe];
        if (!g || !g.btnPrincipal) return false;
        const lib = window.I18n.t(cle);
        let b = null;
        if (!g.useFlyout) {
          if (!g.subActions.some(function (x) { return !x.classList.contains("kta-hidden"); })) g.btnPrincipal.click();
          b = g.subActions.filter(function (x) { return (x.title || "").indexOf(lib) >= 0; })[0];
        } else {
          g.btnPrincipal.click();
          const fly = document.querySelector(".kta-group-flyout");
          if (!fly) return false;
          b = Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (x) {
            return x.textContent.indexOf(lib) >= 0;
          })[0];
        }
        if (!b) return false;
        b.click();
        return true;
      }
    };
  });
  await page.waitForTimeout(500);
}

// Fiche rendue : sections (id, ouverte) et lignes (data-ligne, touches lues dans les <kbd>).
function ficheRendue(page) {
  return page.evaluate(function () {
    const m = document.getElementById("kta-cheatsheet-modal");
    if (!m) return null;
    return Array.prototype.map.call(m.querySelectorAll("details.kta-cheat-section"), function (d) {
      return { id: d.dataset.section, ouverte: d.open,
        lignes: Array.prototype.map.call(d.querySelectorAll(".kta-cheat-row"), function (r) {
          return { id: r.dataset.ligne, kbd: Array.prototype.map.call(r.querySelectorAll("kbd"), function (k) {
            return k.textContent; }) };
        }) };
    });
  });
}

function sansFocus(page) {
  return page.evaluate(function () { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
}

async function sectionFiche(page) {
  console.log("— Fiche ouverte par « ? » —");
  await sansFocus(page);
  await page.keyboard.press("?");
  await page.waitForTimeout(200);
  const r = await ficheRendue(page);
  verifier(!!r, "« ? » ouvre la fiche");
  joue("global.aide");
  if (!r) return null;
  const attendu = await page.evaluate(function () {
    return window.ShortcutsCheatsheet.lignes().map(function (s) {
      return { id: s.id, ouverte: s.ouverte, lignes: s.lignes ? s.lignes.map(function (l) { return l.id; }) : null };
    });
  });
  const ordre = r.map(function (s) { return s.id + (s.ouverte ? "+" : "-"); }).join(" ");
  verifier(ordre === "outils+ carte+ global+ vue3d-", "sections au PC, vue fermée : Outils, Carte, Globales dépliées, " +
    "Vue 3D repliée (" + ordre + ")");
  const tout = function (sec) {
    return sec.filter(function (s) { return s.id !== "vue3d"; }).map(function (s) {
      return s.lignes.map(function (l) { return typeof l === "string" ? l : l.id; }).join(",");
    }).join("|");
  };
  verifier(tout(r) === tout(attendu), "la fiche affiche exactement ShortcutsCheatsheet.lignes()",
    { rendu: tout(r), attendu: tout(attendu) });
  const ligne = function (sec, id) {
    return r.filter(function (s) { return s.id === sec; })[0].lignes.filter(function (l) { return l.id === id; })[0];
  };
  const tourner = ligne("carte", "carte.tourner");
  verifier(!!tourner && tourner.kbd.join("+") === "Maj+Molette", "ligne « Tourner la carte » : Maj + Molette", tourner);
  const fermer = ligne("global", "global.fermer");
  verifier(!!fermer && fermer.kbd[0] === "Échap", "nom de touche lisible : Échap", fermer);
  const trois = await page.evaluate(function () { return !!window.KtaVue3D; });
  verifier(!trois, "vue3d.js pas chargé tant que la section Vue 3D est repliée");

  // Dépliage de la Vue 3D : vue3d.js chargé, touches listées, three.js toujours absent.
  await page.click('details[data-section="vue3d"] > summary');
  await attendre(page, function () {
    return document.querySelectorAll('details[data-section="vue3d"] .kta-cheat-row').length > 0;
  }, 15000).catch(function () {});
  const v = await page.evaluate(function () {
    const rows = Array.prototype.map.call(document.querySelectorAll('details[data-section="vue3d"] .kta-cheat-row'),
      function (x) { return x.dataset.ligne; });
    const K = window.KtaVue3D;
    return { rows: rows, api: K ? K.raccourcis().map(function (l) { return "v3d." + l.id; }) : [],
      three: window.KtaVue3D ? window.KtaVue3D.charge() : null,
      vue: (document.querySelector('[data-ligne="v3d.vue"] kbd') || {}).textContent,
      av: Array.prototype.map.call(document.querySelectorAll('[data-ligne="v3d.avancer"] kbd'), function (k) {
        return k.textContent; }) };
  });
  verifier(v.rows.length > 0 && v.rows.join() === v.api.join(), "Vue 3D dépliée : les " + v.rows.length +
    " lignes de KtaVue3D.raccourcis()", v);
  verifier(v.three === false, "…sans charger three.js", v.three);
  verifier(v.vue === "V" && v.av.join(" ") === "↑ W Z", "touches de la 3D : V, ↑ / W / Z (ZQSD et WASD)", v);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  verifier(!(await page.evaluate(function () { return window.ShortcutsCheatsheet.isOpen(); })), "Échap ferme la fiche");
  joue("global.fermer");
  return r;
}

// Outils à une touche : chaque bouton / fonction remplacé le temps du test par un compteur (rien ne s'ouvre).
async function sectionOutils(page, lignes) {
  console.log("— Outils (1 touche) —");
  for (const l of lignes) {
    const lettre = l.id.slice("outil.".length);
    const n = await page.evaluate(function (lettre) {
      const it = window.KtaShortcuts.listMapping().filter(function (x) { return x.key === lettre; })[0];
      window.__compte = 0;
      const compter = function () { window.__compte++; return true; };
      const a = it.action, restaurer = [];
      if (a.indexOf("group:") === 0) {
        const b = window._groupes[a.slice(6)].btnPrincipal;
        b.click = compter; restaurer.push(function () { delete b.click; });
      } else {
        const nom = { "fn:legende": "afficherLegende", "fn:recherche": "ouvrirRecherche" }[a];
        if (nom) { const f = window[nom]; window[nom] = compter; restaurer.push(function () { window[nom] = f; }); }
        if (a === "fn:boussole") {
          const C = window.CompassWidget, f = C.toggle; C.toggle = compter; restaurer.push(function () { C.toggle = f; });
        }
      }
      window.__restaurer = function () { restaurer.forEach(function (r) { r(); }); };
      return a;
    }, lettre);
    await sansFocus(page);
    await page.keyboard.press(lettre.toLowerCase());
    const c = await page.evaluate(function () { const c = window.__compte; window.__restaurer(); return c; });
    verifier(c === 1, "touche " + lettre + " → " + n, c);
    joue(l.id);
  }
}

async function mesure(page) {
  return page.evaluate(function () { return window.getMeasurePoints().map(function (p) { return { x: p.x, y: p.y }; }); });
}

async function sectionCarte(page) {
  console.log("— Carte et actions globales —");
  // Maj + molette tourne, le bouton nord redresse.
  await page.evaluate(function () { window.MapBearing.reset(); });
  const c = await page.evaluate(function () { return window.__rc.centre(); });
  const z0 = await page.evaluate(function () { return window.map.getZoom(); });
  await page.mouse.move(c[0] + 100, c[1] + 50);
  await page.keyboard.down("Shift");
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(60); }
  await page.keyboard.up("Shift");
  await page.waitForTimeout(600);
  let r = await page.evaluate(function () {
    const b = document.querySelector(".kta-nord-ctrl.kta-nord-visible .kta-nord-btn");
    return { b: window.MapBearing.getBearing(), src: window.MapBearing.getSource(), z: window.map.getZoom(), nord: !!b };
  });
  verifier(Math.abs(r.b) > 30 && r.src === "manuel" && r.z === z0 && r.nord,
    "Maj + molette tourne la carte (" + r.b.toFixed(1) + "°, sans zoomer), bouton nord affiché", r);
  await page.click(".kta-nord-ctrl.kta-nord-visible .kta-nord-btn");
  await page.waitForTimeout(700);
  r = await page.evaluate(function () { return { b: window.MapBearing.getBearing(), actif: window.MapBearing.isActive() }; });
  verifier(Math.abs(r.b) < 0.5, "bouton nord : carte remise droite", r);
  joue("carte.tourner");

  // Molette seule : zoom.
  await page.mouse.move(c[0], c[1]);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(700);
  const z1 = await page.evaluate(function () { return window.map.getZoom(); });
  verifier(z1 < z0, "molette : zoom (" + z0 + " → " + z1 + ")");
  // Carte touchée (focus Leaflet), puis + / − et les flèches.
  await page.mouse.click(c[0] + 160, c[1] + 120);
  await page.waitForTimeout(300);
  const f = await page.evaluate(function () { return document.activeElement === window.map.getContainer(); });
  verifier(f, "carte touchée : elle a le focus clavier");
  await page.keyboard.press("+");
  await page.waitForTimeout(500);
  const z2 = await page.evaluate(function () { return window.map.getZoom(); });
  await page.keyboard.press("-");
  await page.waitForTimeout(500);
  const z3 = await page.evaluate(function () { return window.map.getZoom(); });
  verifier(z2 > z1 && z3 < z2, "+ zoome, − dézoome (" + z1 + " → " + z2 + " → " + z3 + ")");
  joue("carte.zoom");
  const projete = function () { const q = window.map.project(window.map.getCenter()); return { x: q.x, y: q.y }; };
  const fleches = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const res = [];
  for (const k of Object.keys(fleches)) {
    const p0 = await page.evaluate(projete);
    await page.keyboard.press(k);
    await page.waitForTimeout(450);
    const p1 = await page.evaluate(projete);
    const d = [p1.x - p0.x, p1.y - p0.y];
    res.push({ k: k, d: d.map(Math.round), ok: d[0] * fleches[k][0] + d[1] * fleches[k][1] > 20 });
  }
  verifier(res.every(function (x) { return x.ok; }), "flèches : la carte se déplace dans leur sens", res);
  joue("carte.deplacer");

  // Échap : bulle fermée (carte au focus), choix d'une position annulé.
  r = await page.evaluate(function () {
    window.map.openPopup("Bulle du checkup", window.map.getCenter());
    return !!window.map._popup && window.map.hasLayer(window.map._popup);
  });
  await page.evaluate(function () { window.map.getContainer().focus(); });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const bulle = await page.evaluate(function () { return !!window.map._popup && window.map.hasLayer(window.map._popup); });
  verifier(r && !bulle, "Échap ferme la bulle d'un point", { ouverte: r, apres: bulle });
  r = await page.evaluate(function () {
    return window.ktaDemanderPositionCarte(function () {}) && window.ktaDemanderPositionCarte.estActif();
  });
  await sansFocus(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const pick = await page.evaluate(function () { return window.ktaDemanderPositionCarte.estActif(); });
  verifier(r && !pick, "Échap annule le choix d'une position sur la carte", { actif: r, apres: pick });

  // Mesure 📐 : Ctrl+Z / Ctrl+Y / Ctrl+Maj+Z, puis clic long sur un sommet (et Échap pendant l'appui).
  r = await page.evaluate(function () {
    const M = window.__rc;
    const okArme = M.choisir("mesure", "ui.subaction.mesureDistance") && window.modeMesure === true;
    [[-200, 0], [0, 0], [200, 0]].forEach(function (q) { M.clic(M.P(q[0], q[1])); });
    return okArme;
  });
  verifier(r, "📐 Distance armé, 3 points posés");
  await sansFocus(page);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(80);
  const n1 = (await mesure(page)).length;
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(80);
  const n2 = (await mesure(page)).length;
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(80);
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(80);
  const n3 = (await mesure(page)).length;
  verifier(n1 === 2 && n2 === 3 && n3 === 3, "Ctrl+Z annule un point de mesure, Ctrl+Y et Ctrl+Maj+Z le rétablissent",
    [n1, n2, n3]);
  joue("global.annuler"); joue("global.retablir");

  const avant = await mesure(page);
  // Pas le sommet du centre : l'icône du tracker y est posée par-dessus.
  const a = await page.evaluate(function (p) { return window.__rc.ecran(p); }, avant[2]);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.waitForTimeout(650);
  for (let i = 1; i <= 8; i++) { await page.mouse.move(a[0], a[1] + 60 * i / 8); await page.waitForTimeout(25); }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const apres = await mesure(page);
  const bouge = Math.hypot(apres[2].x - avant[2].x, apres[2].y - avant[2].y);
  verifier(apres.length === 3 && bouge > 1 && Math.hypot(apres[0].x - avant[0].x, apres[0].y - avant[0].y) < 1e-6,
    "clic long + glisser sur un sommet : il se déplace, seul", { bouge: bouge, n: apres.length });
  joue("carte.sommet");
  // Échap pendant un appui long : rien n'est écrit.
  const b = await page.evaluate(function (p) { return window.__rc.ecran(p); }, apres[0]);
  await page.mouse.move(b[0], b[1]);
  await page.mouse.down();
  await page.waitForTimeout(650);
  const arme = await page.evaluate(function () { return window.KtaAjusterSommets.etat().arme; });
  await page.keyboard.press("Escape");
  await page.mouse.move(b[0] + 50, b[1] + 50);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const fin = await mesure(page);
  const garde = await page.evaluate(function () { return window.modeMesure === true; });
  verifier(arme && fin.length === 3 && Math.hypot(fin[0].x - apres[0].x, fin[0].y - apres[0].y) < 1e-6 && garde,
    "Échap pendant l'appui long : le sommet reste, 📐 reste armé", { avant: apres[0], apres: fin[0], arme: garde });
  joue("carte.echap");
  await sansFocus(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  verifier(!(await page.evaluate(function () { return window.modeMesure; })),
    "…puis Échap : 📐 désarmé (appui long avant l'outil)");
  await page.evaluate(function () { window._desactiverTousLesModes(); window.resetMesure(); window.HistoryManager.reset(); });

  // Ctrl+K : recherche ouverte puis refermée.
  await sansFocus(page);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  const k1 = await page.evaluate(function () { return !!document.getElementById("kta-search-modal"); });
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  const k2 = await page.evaluate(function () { return !!document.getElementById("kta-search-modal"); });
  verifier(k1 && !k2, "Ctrl+K ouvre la recherche, Ctrl+K la referme", [k1, k2]);
  joue("global.recherche");

  // F : mode présentation, Échap en sort.
  await sansFocus(page);
  await page.keyboard.press("f");
  await page.waitForTimeout(300);
  const p1 = await page.evaluate(function () { return window.PresentationMode.isActive(); });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const p2 = await page.evaluate(function () { return window.PresentationMode.isActive(); });
  verifier(p1 && !p2, "F : mode présentation ; Échap en sort", [p1, p2]);
  joue("global.presentation");
}

// Échap désarme l'outil armé (shortcuts.js > _echapCarte), outil par outil, puis la priorité : fenêtre, bulle, panneau
// d'un groupe et champ texte prennent l'Échap avant l'outil (l'appui long : sectionCarte).
const OUTILS_ECHAP = [
  { nom: "✏️ ajout de point", groupe: "edition", flag: "modeEdition" },
  { nom: "📐 mesure", groupe: "mesure", cle: "ui.subaction.mesureDistance", flag: "modeMesure" },
  { nom: "🛣️ tracé", groupe: "traces", cle: "ui.trace.principal", flag: "modeRoad" },
  { nom: "⬛ zone", groupe: "zones", cle: "ui.zone.eau", flag: "modeZone" },
  { nom: "🏛️ structure", groupe: "structures", cle: "ui.struct.pilier1", flag: "modeStructure" }
];

function armerOutil(page, o) {
  return page.evaluate(function (o) {
    if (o.groupe === "edition") {
      if (!window.modeEdition) window._groupes.edition.btnPrincipal.click();
    } else {
      window.__rc.choisir(o.groupe, o.cle);
    }
    if (window.ktaOutilsOuverts && window.ktaOutilsOuverts()) window.ktaFermerOutils();
    return !!window[o.flag];
  }, o);
}

function etatOutil(page, o) {
  return page.evaluate(function (o) {
    const g = window._groupes[o.groupe];
    const allume = g.btnPrincipal.classList.contains("kta-group-mode-actif") ||
      (g.subActions || []).some(function (b) { return b.classList.contains("kta-actif"); });
    return { arme: !!window[o.flag], allume: allume, registre: window.ktaOutilArme() };
  }, o);
}

async function echap(page, focus) {
  if (focus === "carte") await page.evaluate(function () { window.map.getContainer().focus(); });
  else if (focus !== "garder") await sansFocus(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

async function sectionDesarmer(page) {
  console.log("— Échap désarme l'outil —");
  await page.evaluate(function () { window._desactiverTousLesModes(); window.resetMesure(); window.HistoryManager.reset(); });
  for (const o of OUTILS_ECHAP) {
    const a = await armerOutil(page, o);
    for (const focus of ["aucun", "carte"]) {
      if (focus === "carte") await armerOutil(page, o);
      await echap(page, focus);
      const e = await etatOutil(page, o);
      verifier(a && !e.arme && !e.allume && !e.registre, "Échap (focus " + focus + ") : " + o.nom + " désarmé, bouton éteint",
        { armeAvant: a, apres: e });
    }
  }
  const mes = OUTILS_ECHAP[1];

  // Fenêtre d'abord : la fenêtre de nommage d'un point (ouverte par le clic de ✏️, elle ne coupe pas l'outil) se
  // ferme, ✏️ reste armé ; Échap suivant : ✏️ désarmé.
  const edi = OUTILS_ECHAP[0];
  await armerOutil(page, edi);
  const ouverte = await page.evaluate(function () {
    window.__rc.clic(window.__rc.P(-150, 80));
    return !!document.getElementById("kta-poi-modal");
  });
  await echap(page, "aucun");
  let e = await etatOutil(page, edi);
  const fermee = !(await page.evaluate(function () { return !!document.getElementById("kta-poi-modal"); }));
  verifier(ouverte && fermee && e.arme, "Échap, fenêtre de nommage ouverte : la fenêtre se ferme, ✏️ reste armé",
    { ouverte: ouverte, fermee: fermee, etat: e });
  await echap(page, "aucun");
  e = await etatOutil(page, edi);
  verifier(!e.arme && !e.allume, "…Échap suivant : ✏️ désarmé", e);

  // Bulle : fermée d'abord, carte au focus (Leaflet) comme sans focus (shortcuts.js). Avec un outil armé, aucune bulle
  // ne s'ouvre (map.js > popupopen) : la priorité bulle > outil tient par construction.
  for (const focus of ["carte", "aucun"]) {
    await page.evaluate(function () { window.map.openPopup("Bulle du checkup", window.map.getCenter()); });
    await echap(page, focus);
    const b = await page.evaluate(function () { return !!window.map._popup && window.map.hasLayer(window.map._popup); });
    verifier(!b, "Échap, bulle ouverte (focus " + focus + ") : la bulle se ferme", { bulle: b });
  }
  await armerOutil(page, mes);
  const refus = await page.evaluate(function () {
    window.map.openPopup("Bulle du checkup", window.map.getCenter());
    return !!window.map._popup && window.map.hasLayer(window.map._popup);
  });
  verifier(!refus, "📐 armé : aucune bulle ne s'ouvre (map.js > popupopen)", { bulle: refus });
  await echap(page, "carte");
  e = await etatOutil(page, mes);
  verifier(!e.arme, "Échap carte au focus, une bulle déjà ouverte une fois : 📐 désarmé", e);

  // Panneau d'un groupe ouvert (focus dedans ou non) : il se ferme, l'outil reste armé.
  const zon = OUTILS_ECHAP[3];
  for (const focus of ["garder", "aucun"]) {
    const p = await page.evaluate(function (o) {
      window.__rc.choisir(o.groupe, o.cle);   // le type choisi ferme le panneau
      window._groupes[o.groupe].btnPrincipal.click();   // rouvert, outil armé
      const fly = document.querySelector(".kta-group-flyout");
      const btn = fly && fly.querySelector(".kta-group-flyout-btn");
      if (btn) btn.focus();
      return { panneau: !!window.ktaOutilsOuverts(), arme: !!window[o.flag] };
    }, zon);
    await echap(page, focus);
    const apres = await page.evaluate(function () { return !!window.ktaOutilsOuverts(); });
    e = await etatOutil(page, zon);
    verifier(p.panneau && p.arme && !apres && e.arme, "Échap, panneau ⬛ ouvert (" + (focus === "garder" ? "focus dedans" :
      "sans focus") + ") : le panneau se ferme, ⬛ reste armé", { avant: p, panneau: apres, etat: e });
    await echap(page, "aucun");
    e = await etatOutil(page, zon);
    verifier(!e.arme && !e.allume, "…Échap suivant : ⬛ désarmé", e);
  }

  // Champ texte : un Échap tapé dedans ne désarme rien.
  await armerOutil(page, mes);
  await page.evaluate(function () {
    const i = document.createElement("input");
    i.id = "kta-checkup-champ"; i.type = "text";
    i.style.cssText = "position:fixed;left:8px;top:8px;z-index:1;";
    document.body.appendChild(i);
    i.focus();
  });
  await echap(page, "garder");
  e = await etatOutil(page, mes);
  await page.evaluate(function () { document.getElementById("kta-checkup-champ").remove(); });
  verifier(e.arme, "Échap tapé dans un champ texte : 📐 reste armé", e);
  await echap(page, "aucun");
  e = await etatOutil(page, mes);
  verifier(!e.arme, "…Échap hors du champ : 📐 désarmé", e);
  await page.evaluate(function () { window._desactiverTousLesModes(); window.resetMesure(); window.HistoryManager.reset(); });
  joue("carte.desarmer");
}

function etat3D(page) {
  return page.evaluate(function () {
    const s = window.KtaVue3D.etat();
    return { ouvert: s.ouvert, vue: s.vue, mode: s.mode, cap: s.cap, pos: s.pos, recul: s.portee && s.portee.recul,
      incl: s.inclinaison, vise: s.camera && s.camera.vise };
  });
}

async function section3D(page) {
  console.log("— Vue 3D —");
  const ouvert = await page.evaluate(async function () {
    window.__acc = window.ktaEstAccessible;
    window.ktaEstAccessible = function () { return true; };
    const M = window.__rc, d = M.P(0, 0);
    return window.KtaVue3D.ouvrir({ depart: { x: d.x, y: d.y, cap: 0, niveau: 0 }, commandes: "pave" });
  });
  verifier(ouvert === true, "vue 3D ouverte");
  if (ouvert !== true) return;
  await page.waitForTimeout(800);
  const canvas = await page.evaluate(function () {
    const r = document.querySelector("#kta-vue3d canvas").getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });

  // « ? » par-dessus la vue : Vue 3D d'abord, dépliée ; Échap ferme la fiche, pas la vue.
  await page.keyboard.press("?");
  await page.waitForTimeout(250);
  const r = await ficheRendue(page);
  const dessus = await page.evaluate(function () {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return !!el && !!el.closest("#kta-cheatsheet-modal");
  });
  verifier(!!r && r[0].id === "vue3d" && r[0].ouverte && r[0].lignes.length > 10 && dessus,
    "« ? » dans la vue : fiche au-dessus, Vue 3D en tête et dépliée",
    r && r.map(function (s) { return s.id + (s.ouverte ? "+" : "-"); }));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const e0 = await etat3D(page);
  verifier(!(await page.evaluate(function () { return window.ShortcutsCheatsheet.isOpen(); })) && e0.ouvert,
    "Échap ferme la fiche, la vue reste ouverte");

  const lignes = await page.evaluate(function () { return window.KtaVue3D.raccourcis(); });
  const touches = {};
  lignes.forEach(function (l) { touches[l.id] = l.touches; });

  // Pas : chaque touche maintenue 300 ms déplace la place ; avancer / reculer opposés, côtés opposés et en travers.
  const deplacement = async function (code, ms, avecMaj) {
    const a = await etat3D(page);
    if (avecMaj) await page.keyboard.down("Shift");
    await page.keyboard.down(code);
    await page.waitForTimeout(ms);
    await page.keyboard.up(code);
    if (avecMaj) await page.keyboard.up("Shift");
    await page.waitForTimeout(120);
    const b = await etat3D(page);
    return { d: [b.pos.x - a.pos.x, b.pos.y - a.pos.y], cap: b.cap - a.cap };
  };
  const vecteurs = {};
  for (const id of ["avancer", "reculer", "gauche", "droite"]) {
    for (const combi of touches[id]) {
      const m = await deplacement(combi[0], 300);
      const n = Math.hypot(m.d[0], m.d[1]);
      verifier(n > 0.05, "3D : " + combi[0] + " → " + id + " (" + n.toFixed(2) + ")", m);
      vecteurs[id] = vecteurs[id] || m.d;
    }
    joue("v3d." + id);
  }
  const dot = function (p, q) { return p[0] * q[0] + p[1] * q[1]; };
  const nn = function (p) { return Math.hypot(p[0], p[1]) || 1; };
  verifier(dot(vecteurs.avancer, vecteurs.reculer) < 0 && dot(vecteurs.gauche, vecteurs.droite) < 0 &&
    Math.abs(dot(vecteurs.avancer, vecteurs.gauche)) / nn(vecteurs.avancer) / nn(vecteurs.gauche) < 0.3,
    "3D : avancer / reculer opposés, pas de côté opposés et en travers", vecteurs);
  const caps = {};
  for (const id of ["tournerGauche", "tournerDroite"]) {
    for (const combi of touches[id]) {
      const m = await deplacement(combi[0], 300);
      const dc = ((m.cap + 540) % 360) - 180;
      verifier(Math.abs(dc) > 2, "3D : " + combi[0] + " → " + id + " (" + dc.toFixed(1) + "°)");
      caps[id] = dc;
    }
    joue("v3d." + id);
  }
  verifier(caps.tournerGauche * caps.tournerDroite < 0, "3D : ← et → tournent en sens contraires", caps);
  // Maj : relue pendant le pas (etat().rapide), la distance seule varie avec la cadence du moteur.
  const rapide = async function (avecMaj) {
    if (avecMaj) await page.keyboard.down("Shift");
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(250);
    const v = await page.evaluate(function () { return window.KtaVue3D.etat().rapide; });
    await page.keyboard.up("ArrowUp");
    if (avecMaj) await page.keyboard.up("Shift");
    await page.waitForTimeout(120);
    return v;
  };
  const lent = await rapide(false), vite = await rapide(true);
  verifier(lent === false && vite === true, "3D : Maj maintenue en marchant → plus vite", { sans: lent, avec: vite });
  joue("v3d.courir");

  // V : vue d'édition.
  await page.keyboard.press("KeyV");
  await page.waitForTimeout(400);
  const ed = await etat3D(page);
  verifier(ed.vue === "plongee", "3D : V → vue d'édition", ed.vue);
  joue("v3d.vue");

  // Zoom : touches, molette.
  for (const [id, sens] of [["zoomPlus", -1], ["zoomMoins", 1]]) {
    for (const combi of touches[id]) {
      const a = (await etat3D(page)).recul;
      await page.keyboard.press(combi[0]);
      await page.waitForTimeout(100);
      const b = (await etat3D(page)).recul;
      verifier((b - a) * sens > 0, "3D : « " + combi[0] + " » → " + id + " (recul " + a + " → " + b + ")");
    }
    joue("v3d." + id);
  }
  await page.mouse.move(canvas[0], canvas[1]);
  let a = (await etat3D(page)).recul;
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(200);
  let b = (await etat3D(page)).recul;
  verifier(b < a, "3D : molette vers l'avant → plus près (" + a + " → " + b + ")");
  joue("v3d.zoomMolette");

  // Inclinaison : Pg↑ / Pg↓, Maj + molette.
  for (const [id, sens] of [["inclinerPlus", 1], ["inclinerMoins", -1]]) {
    for (const combi of touches[id]) {
      if (sens < 0) await page.keyboard.press(touches.inclinerPlus[0][0]);   // pas collé à une borne
      const i0 = (await etat3D(page)).incl;
      await page.keyboard.press(combi[0]);
      await page.waitForTimeout(100);
      const i1 = (await etat3D(page)).incl;
      verifier((i1 - i0) * sens > 0, "3D : " + combi[0] + " → " + id + " (" + i0 + "° → " + i1 + "°)");
    }
    joue("v3d." + id);
  }
  a = (await etat3D(page)).incl;
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(200);
  b = (await etat3D(page)).incl;
  verifier(b !== a, "3D : Maj + molette → inclinaison (" + a + "° → " + b + "°)");
  joue("v3d.inclinerMolette");

  // Glisser : caméra libre ; clic droit ou Ctrl + glisser : cap.
  const glisser = async function (bouton, ctrl) {
    const e1 = await etat3D(page);
    await page.mouse.move(canvas[0] - 60, canvas[1]);
    if (ctrl) await page.keyboard.down("Control");
    await page.mouse.down({ button: bouton });
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(canvas[0] - 60 + 15 * i, canvas[1] + 5 * i);
      await page.waitForTimeout(25);
    }
    await page.mouse.up({ button: bouton });
    if (ctrl) await page.keyboard.up("Control");
    await page.waitForTimeout(200);
    const e2 = await etat3D(page);
    return { cap: ((e2.cap - e1.cap + 540) % 360) - 180,
      vise: e1.vise && e2.vise ? Math.hypot(e2.vise.x - e1.vise.x, e2.vise.z - e1.vise.z) : null,
      v1: e1.vise, v2: e2.vise };
  };
  let g = await glisser("left", false);
  verifier(Math.abs(g.cap) < 0.5 && (g.vise === null ? !!g.v2 : g.vise > 0.05),
    "3D : glisser → la vue se déplace, cap gardé", g);
  joue("v3d.panner");
  g = await glisser("right", false);
  const g2 = await glisser("left", true);
  verifier(Math.abs(g.cap) > 2 && Math.abs(g2.cap) > 2, "3D : clic droit + glisser et Ctrl + glisser → la vue tourne",
    { droit: g.cap, ctrl: g2.cap });
  joue("v3d.cap");

  // Clic long + glisser sur un sommet de la mesure, vue d'édition : il se déplace (vue3d.js > _ajusterAppui).
  const somm = await page.evaluate(async function () {
    const K = window.KtaVue3D, e = K.etat(), sc = window.APP_CONFIG.scale;
    if (e.vue !== "plongee") K.basculerVue();
    let ctx = null;
    const deg = K.greffer({ nom: "rc-sommet", scene: function (c) { ctx = c; } });
    if (deg) deg();
    const v = e.camera.visee, p = { x: v.x * sc, y: v.z * sc };
    window.setMeasurePoints([{ x: p.x - 2 * sc, y: p.y }, { x: p.x, y: p.y + 1.5 * sc }, { x: p.x + 2 * sc, y: p.y }]);
    await new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(ok); }); });
    const cv = document.querySelector("#kta-vue3d canvas"), rc = cv.getBoundingClientRect();
    const q = new ctx.THREE.Vector3(p.x / sc - 2, 0, p.y / sc).project(ctx.camera);
    return { a: [rc.left + (q.x + 1) / 2 * rc.width, rc.top + (1 - q.y) / 2 * rc.height], x0: p.x - 2 * sc };
  });
  await page.mouse.move(somm.a[0], somm.a[1]);
  await page.mouse.down();
  await page.waitForTimeout(650);
  for (let i = 1; i <= 8; i++) { await page.mouse.move(somm.a[0] + 5 * i, somm.a[1] + 4 * i); await page.waitForTimeout(25); }
  await page.mouse.up();
  await page.waitForTimeout(200);
  const sommApres = await page.evaluate(function () { return window.getMeasurePoints().map(function (q) { return q.x; }); });
  verifier(sommApres.length === 3 && Math.abs(sommApres[0] - somm.x0) > 1,
    "3D : clic long + glisser sur un sommet de la mesure → il se déplace", { avant: somm.x0, apres: sommApres });
  await page.evaluate(function () { window.resetMesure(); window.HistoryManager.reset(); });
  joue("v3d.sommet");

  // Échap de la vue et de la carte ne se cumulent pas. Vue d'édition, 📐 armé : un Échap le désarme (règle de la
  // vue), la vue reste ouverte. À hauteur d'yeux, 📐 armé : Échap ferme la vue (règle de la vue), 📐 reste armé ;
  // l'Échap suivant, sur la carte, le désarme.
  const armer3D = function (vue) {
    return page.evaluate(function (vue) {
      const K = window.KtaVue3D;
      if (K.etat().vue !== vue) K.basculerVue();
      window.__rc.choisir("mesure", "ui.subaction.mesureDistance");
      if (window.ktaOutilsOuverts && window.ktaOutilsOuverts()) window.ktaFermerOutils();
      const v = document.getElementById("kta-vue3d");
      if (v) { v.setAttribute("tabindex", "-1"); v.focus(); }
      return { vue: K.etat().vue, arme: window.modeMesure === true };
    }, vue);
  };
  let c3 = await armer3D("plongee");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  let s3 = await page.evaluate(function () { return { ouvert: window.KtaVue3D.etat().ouvert, arme: !!window.modeMesure }; });
  verifier(c3.vue === "plongee" && c3.arme && s3.ouvert && !s3.arme,
    "3D, vue d'édition, 📐 armé : Échap le désarme, la vue reste ouverte (un seul effet)", { avant: c3, apres: s3 });
  // À hauteur d'yeux, 📐 armé, réglages ⚙️ ouverts : Échap ne ferme que la tuile (la carte ne désarme pas dessous).
  c3 = await armer3D("yeux");
  await page.evaluate(function () { document.querySelector("#kta-vue3d .kta-v3d-btn-reglages").click(); });
  await page.waitForTimeout(200);
  const tuile = await page.evaluate(function () { const t = document.getElementById("kta-v3d-reglages"); return !!t && !t.hidden; });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  s3 = await page.evaluate(function () {
    const t = document.getElementById("kta-v3d-reglages");
    return { tuile: !!t && !t.hidden, ouvert: window.KtaVue3D.etat().ouvert, arme: !!window.modeMesure };
  });
  verifier(c3.vue === "yeux" && c3.arme && tuile && !s3.tuile && s3.ouvert && s3.arme,
    "3D à hauteur d'yeux, 📐 armé, ⚙️ ouvert : Échap ferme la tuile seule (vue ouverte, 📐 armé)",
    { avant: c3, tuile: tuile, apres: s3 });
  await page.evaluate(function () { const v = document.getElementById("kta-vue3d"); if (v) v.focus(); });
  // Tab : le focus reste dans la vue ; Échap : la vue se ferme (rien d'autre d'ouvert).
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  const tab = await page.evaluate(function () {
    const v = document.getElementById("kta-vue3d");
    return !!v && v.contains(document.activeElement) && document.activeElement.tagName === "BUTTON";
  });
  verifier(tab, "3D : Tab → un bouton de la vue a le focus");
  joue("v3d.tab");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const fin = await page.evaluate(function () { return window.KtaVue3D.etat().ouvert; });
  verifier(!fin, "3D : Échap → la vue se ferme");
  joue("v3d.echap");
  s3 = await page.evaluate(function () { return !!window.modeMesure; });
  verifier(!s3, "3D : la vue fermée par Échap éteint 📐 (règle de la vue : vue3d.js > _quitterDessin)", { arme: s3 });
  await page.evaluate(function () { window._desactiverTousLesModes(); window.resetMesure(); window.HistoryManager.reset(); });
  await page.evaluate(function () { window.ktaEstAccessible = window.__acc; });
}

// Téléphone (pointeur grossier) : Gestes tactiles en tête et dépliés, le reste replié ; la fiche tient dans la largeur.
async function sectionTelephone(nav) {
  console.log("— Téléphone —");
  const page = await nav.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!window.ShortcutsCheatsheet && !!window.I18n && !!window.ktaAppareilTactile; },
      30000);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(function () {
      window.ShortcutsCheatsheet.ouvrir();
      const m = document.getElementById("kta-cheatsheet-modal");
      const boite = m.querySelector(".kta-readme-modal-boite"), corps = m.querySelector(".kta-readme-modal-corps");
      const rb = boite.getBoundingClientRect();
      const ordre = Array.prototype.map.call(m.querySelectorAll("details.kta-cheat-section"), function (d) {
        return d.dataset.section + (d.open ? "+" : "-");
      }).join(" ");
      const gestes = Array.prototype.map.call(m.querySelectorAll('[data-section="gestes"] .kta-cheat-row'), function (x) {
        return x.dataset.ligne; });
      const res = { tactile: window.ktaAppareilTactile(), ordre: ordre, gestes: gestes, gauche: rb.left, droite: rb.right,
        vw: innerWidth, deborde: corps.scrollWidth > corps.clientWidth + 1 };
      window.ShortcutsCheatsheet.fermer();
      return res;
    });
    verifier(r.tactile && r.ordre === "gestes+ outils- carte- global- vue3d-" && r.gestes.length === 3,
      "téléphone : Gestes tactiles en tête et dépliés, les sections clavier repliées (" + r.ordre + ")", r);
    verifier(r.gauche >= 0 && r.droite <= r.vw && !r.deborde, "téléphone : la fiche tient dans la largeur", r);
  } finally {
    await page.close();
  }
}

async function jouer(nav, moteur) {
  _prefixe = "[" + moteur + "] ";
  joues.clear();
  console.log("\n══ " + moteur + " ══");
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await ouvrirPlan(page);
    const fiche = await sectionFiche(page);
    if (fiche) {
      await sectionOutils(page, fiche.filter(function (s) { return s.id === "outils"; })[0].lignes);
      await sectionCarte(page);
      await sectionDesarmer(page);
      await section3D(page);
    }
    // Toute ligne que la fiche peut afficher (tactile compris) : jouée ici, ou prouvée par un autre checkup.
    const toutes = await page.evaluate(function () {
      const ids = [];
      window.ShortcutsCheatsheet.lignes().forEach(function (s) {
        (s.lignes || []).forEach(function (l) { ids.push(l.id); });
      });
      return ids;
    });
    const tactiles = ["gestes.tourner", "gestes.sommet", "gestes.v3d"];
    const sans = toutes.concat(tactiles).filter(function (id) { return !joues.has(id) && !AILLEURS[id]; });
    verifier(sans.length === 0, "chaque ligne de la fiche (" + toutes.length + " + " + tactiles.length +
      " gestes tactiles) est jouée ou prouvée ailleurs", sans);
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.stack || err));
  } finally {
    await page.close();
  }
  try { await sectionTelephone(nav); } catch (err) { pb("exception du harnais (téléphone) : " + (err && err.stack || err)); }
}

(async function main() {
  try {
    for (const m of moteurs()) {
      const nav = await lancerMoteur(m);
      if (!nav) { inf(m + " absent : moteur sauté"); continue; }
      try { await jouer(nav, m); } finally { await nav.close(); }
    }
  } finally {
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — chaque raccourci de la fiche fait ce qu'elle dit, 2D comme 3D.");
  process.exit(0);
})();
