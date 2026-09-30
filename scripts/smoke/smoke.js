#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔥 smoke.js — SMOKE NAVIGATEUR (Playwright) — le garde-fou qui CLIQUE
// =====================================================================
// Né après 3 erreurs runtime en une semaine (ReferenceError `saved` des
// Réglages, modale invisible par classe CSS fantôme, `tilesOverlay` hors
// portée) que les 14 garde-fous logiques ne pouvaient pas voir : aucun
// n'exécute l'app. Celui-ci boote l'app dans un vrai Chromium, ouvre les
// écrans, clique, et ÉCHOUE sur : toute erreur console, toute pageerror,
// tout warn « [I18n] Clé manquante », toute modale invisible.
//
// Usage : cd scripts/smoke && npm install && npm run smoke
// (premier install : télécharge Chromium ~130 Mo, une fois)
// Marche du RELEASE_GATE — lancé à la main avant release, pas en pre-commit
// (trop lent pour chaque commit).
// =====================================================================
"use strict";

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8123;
const BASE = "http://127.0.0.1:" + PORT;

// 🗺️ 26/09/2026 — LE SMOKE NE CHERCHE PLUS UN PLAN PAR SON NOM.
// `data/` reçoit des relevés réels et ne part jamais sur le dépôt : dès que
// KARMA y met un vrai plan, « Relevé fictif de test » n'est plus dans
// `data/index.json` et le smoke était ROUGE pour cette seule raison — deux
// faux échecs sur un harnais qui garde la porte de release. Il ouvre
// désormais le relevé fictif s'il est là, le PREMIER plan de l'index sinon,
// et le DIT (les mêmes checkups font ainsi depuis le 26/09).
function planDeTest() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) { return { nom: "Relevé fictif de test", fictif: true }; }
}
const PLAN = planDeTest();

// Clés localStorage pré-posées pour passer les gates (valeurs lues dans le
// code : unlockGate.HASH_VALIDE, legalGate, tutorial).
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(cat, msg) { problemes.push("[" + cat + "] " + msg); console.log("  ❌ " + cat + " : " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }

// Bruit console toléré (réseau absent en local, live-config…) — liste COURTE
// et justifiée : tout ajout doit expliquer pourquoi ce n'est pas un bug.
const BRUIT_TOLERE = [
  /Failed to load resource.*(version\.json|ping\.html|live-config)/i,  // update-checker offline : dégradation prévue
  /favicon/i,
  /Licence-pro.json/i   // sonde proLicense au boot : 404 = instance community, comportement NOMINAL
];
function estBruit(txt) { return BRUIT_TOLERE.some(function (re) { return re.test(txt); }); }

// 🎨 26/09/2026 — LE SONDAGE DES ICÔNES D'UN PLAN N'EST PAS UN DÉFAUT
// D'ASSET. `config.js > resoudreIconesPlanServeur` demande au serveur si
// chaque icône `icon/…` vit dans le dossier du plan ; pour un plan généré
// AVANT la v1.97.9 (qui déclare `iconsEmbarquees`), la réponse est 404 et le
// repli à la racine fait son travail. Ce n'est pas un fichier manquant mais
// une question posée — on les compte et on dit quoi faire, au lieu de rougir.
const RX_SONDE_ICONE = /\/data\/[^/]+\/icon\/[^/]+$/;
const sondesIcones = [];

(async function main() {
  const server = require("./server.js");
  // Playwright ≥ 1.49 lance par défaut le « headless shell », un binaire DISTINCT
  // du Chromium complet. Quand seul ce dernier est installé — téléchargement du
  // shell coupé par un proxy TLS (ERR_SSL_DECRYPTION_FAILED, vécu le 17/08/2026
  // sur le poste de KARMA alors que `chromium` lui-même passait) — on retombe
  // sur le build complet au lieu de renoncer à la marche 1bis du RELEASE_GATE.
  let navigateur;
  try {
    navigateur = await chromium.launch();
  } catch (e) {
    if (!/Executable doesn't exist/i.test(String((e && e.message) || ""))) throw e;
    console.log("[smoke] headless shell absent → repli sur le Chromium complet (channel: chromium)");
    navigateur = await chromium.launch({ channel: "chromium" });
  }
  const contexte = await navigateur.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } });
  const page = await contexte.newPage();

  page.on("response", function (r) {
    if (r.status() !== 404 || estBruit(r.url())) return;
    const u = r.url().replace(BASE, "");
    if (RX_SONDE_ICONE.test(u)) { sondesIcones.push(u); return; }
    pb("404", u);
  });
  page.on("console", function (m) {
    const txt = m.text();
    if (/Failed to load resource/.test(txt)) return;   // doublon sans URL du handler response
    if (m.type() === "error" && !estBruit(txt)) pb("console.error", txt.slice(0, 200));
    if (m.type() === "warning" && /Clé manquante/.test(txt)) pb("i18n", txt.slice(0, 160));
  });
  page.on("pageerror", function (e) { pb("pageerror", String(e).slice(0, 220)); });

  await page.addInitScript(function (pregates) {
    for (const k in pregates) localStorage.setItem(k, pregates[k]);
  }, LS_PREGATES);

  async function modaleVisible(nom, selecteur) {
    // Une modale « présente mais invisible » (classe fantôme, display:none)
    // est EXACTEMENT le bug qu'on chasse : on exige des dimensions réelles.
    const el = page.locator(selecteur).last();
    try {
      await el.waitFor({ state: "visible", timeout: 4000 });
      const box = await el.boundingBox();
      if (!box || box.width < 40 || box.height < 40) { pb("modale", nom + " : présente mais dimensions nulles (" + JSON.stringify(box) + ")"); return false; }
      ok(nom + " visible (" + Math.round(box.width) + "×" + Math.round(box.height) + ")");
      return true;
    } catch (e) {
      pb("modale", nom + " : jamais visible (" + selecteur + ")");
      return false;
    }
  }
  async function fermerModales() {
    await page.keyboard.press("Escape").catch(function () {});
    // les modales de l'app ferment aussi au clic sur ✕ — on tente les visibles
    const boutons = await page.locator(".kta-panneau-close:visible").all();
    for (const b of boutons.reverse()) { await b.click({ timeout: 1000 }).catch(function () {}); }
    await page.waitForTimeout(250);
  }

  try {
    // ───────────────────────── 1. BOOT HOME ─────────────────────────
    console.log("— 1. Boot HOME —");
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);   // i18n + homeLoader async
    const titreVisible = await page.locator("#loaderTitle, .loader-title, .loader-header").first().isVisible().catch(function () { return false; });
    if (titreVisible) ok("HOME affiché"); else pb("boot", "HOME : aucun en-tête visible");
    // 🚨 La modale Alertes peut s'ouvrir au boot (annonce non lue) et
    // recouvrir le HOME — on la ferme comme un utilisateur (« J'ai compris »).
    const alerteOuverte = await page.locator("#kta-alert-modal").isVisible().catch(function () { return false; });
    if (alerteOuverte) {
      await page.evaluate(function () {
        const b = document.getElementById("kta-alert-ok") || document.querySelector("#kta-alert-modal .kta-panneau-close");
        if (b) b.click();
      });
      await page.waitForTimeout(400);
      const encore = await page.locator("#kta-alert-modal").isVisible().catch(function () { return false; });
      if (encore) pb("boot", "la modale Alertes ne se ferme pas"); else ok("modale Alertes fermée (annonce au boot)");
    }
    const planListe = await page.getByText(PLAN.nom, { exact: false }).first().isVisible().catch(function () { return false; });
    if (planListe) ok("liste des plans peuplée (" + PLAN.nom + ")");
    else pb("boot", "aucun plan ouvrable dans data/index.json (cherché : " + PLAN.nom + ")");
    if (!PLAN.fictif) console.log("  •  ⚠️ le relevé fictif n'est pas dans data/index.json — smoke sur « " + PLAN.nom + " »");

    // ─────────────────── 2. ⚙️ CONFIGURATION (HOME) ──────────────────
    console.log("— 2. ⚙️ Configuration HOME —");
    await page.locator("#loaderConfigBtn").click();
    await page.waitForTimeout(600);
    const modeDev = await page.locator("#kta-devmode-wrap").isVisible().catch(function () { return false; });
    if (modeDev) ok("section Mode Développeur présente"); else pb("config", "section Mode Développeur absente/invisible");
    await page.evaluate(function () { const b = document.getElementById("loaderConfigClose"); if (b) b.click(); });
    await page.waitForTimeout(300);
    const configFermee = await page.locator("#loaderConfigModal").isVisible().catch(function () { return false; });
    if (configFermee) pb("config", "la modale Configuration ne se ferme pas"); else ok("Configuration fermée");

    // ───────────── 3. 📊 ÉDITEUR DE DONNÉES + modale résolution ─────────────
    console.log("— 3. Éditeur de données —");
    const edOk = await page.evaluate(function () {
      if (typeof window.ouvrirTableEditor === "function") { window.ouvrirTableEditor(); return true; }
      return false;
    });
    if (!edOk) pb("editeur", "window.ouvrirTableEditor indisponible");
    await page.waitForTimeout(500);
    await modaleVisible("accueil éditeur", "#kta-tbl-modal");
    await page.locator("#kta-tbl-src-resol").click();
    // LA modale qui fut invisible (classe CSS fantôme) : dimensions exigées
    await modaleVisible("convertisseur de résolution", ".kta-readme-modal-overlay:has(#kta-tbl-resol-go)");
    await fermerModales();   // convertisseur
    await page.evaluate(function () { const b = document.getElementById("kta-tbl-close-accueil"); if (b) b.click(); });
    await page.waitForTimeout(300);
    const overlayRestant = await page.locator(".kta-readme-modal-overlay:visible").count();
    if (overlayRestant > 0) {
      const ids = await page.locator(".kta-readme-modal-overlay:visible").evaluateAll(function (els) { return els.map(function (e) { return e.id || e.className; }); });
      pb("editeur", overlayRestant + " overlay(s) encore visible(s) : " + ids.join(" | "));
    }
    else ok("tous les overlays fermés");

    // ───────────────────── 4. CHARGER LE PLAN DE TEST ─────────────────────
    console.log("— 4. Chargement du plan " + PLAN.nom + " —");
    await page.getByText(PLAN.nom, { exact: false }).first().click();
    await page.waitForFunction(function () { return !!window.PLAN_CONFIG && !!document.getElementById("map"); }, null, { timeout: 15000 })
      .then(function () { ok("plan chargé (PLAN_CONFIG posé, #map présent)"); })
      .catch(function () { pb("plan", "le plan ne s'est pas chargé en 15 s"); });
    await page.waitForTimeout(2500);   // rendu calques + restore session

    // 🩸 29/09/2026 — le premier rendu du tuilage doit COMPTER ses tuiles. Il
    // était consommé par un rendu fantôme « z=NaN » (carte encore sans vue) :
    // `attendusPremier` restait à 0 et le repli « toutes les tuiles du premier
    // rendu ont échoué → image entière » était désarmé, en silence.
    const tuilage = await page.evaluate(function () {
      const s = window._tilingV2State;
      return s ? { niveau: s.currentLevel, attendus: s.attendusPremier } : null;
    });
    if (!tuilage) ok("plan non tuilé V2 — contrôle du premier rendu sans objet");
    else if (Number.isInteger(tuilage.niveau) && tuilage.attendus > 0) {
      ok("tuilage : premier rendu au niveau z=" + tuilage.niveau + ", " + tuilage.attendus + " tuiles attendues (repli d'erreur armé)");
    } else pb("tuilage", "premier rendu fantôme — niveau " + tuilage.niveau + ", " + tuilage.attendus + " tuile(s) attendue(s)");

    // ───────────────── 5. ⚙️ RÉGLAGES (le ReferenceError `saved`) ─────────────────
    console.log("— 5. ⚙️ Réglages carte —");
    const ouvert = await page.evaluate(function () {
      if (typeof window.afficherConfig === "function") { window.afficherConfig(); return true; }
      return false;
    });
    if (ouvert) {
      await modaleVisible("⚙️ Réglages", "#kta-cfg-modal");
      // v1.92.0 (L4) : application immédiate — l'échelle saisie est persistée
      // SANS bouton Appliquer (puis remise à sa valeur d'origine).
      const persiste = await page.evaluate(function () {
        const el = document.getElementById("cfg_scale"); if (!el) return "champ absent";
        const avant = el.value;
        el.value = "7.25"; el.dispatchEvent(new Event("change", { bubbles: true }));
        const pid = window._currentLoadedPlanId || "default";
        let prefs = {}; try { prefs = JSON.parse(localStorage.getItem("myktamap_plan_prefs_" + pid) || "{}"); } catch (e) {}
        el.value = avant; el.dispatchEvent(new Event("change", { bubbles: true }));
        return prefs.scale === 7.25 ? "ok" : "scale=" + JSON.stringify(prefs.scale);
      });
      if (persiste === "ok") ok("réglage immédiat : l'échelle est persistée à la saisie (sans Appliquer)");
      else pb("reglages", "échelle non persistée à la saisie (" + persiste + ")");
      // v1.92.0 (L4) : le géoréférencement vit dans SA sous-modale — on l'ouvre.
      if (await page.locator("#cfg_georef_open").count() > 0) {
        await page.locator("#cfg_georef_open").click();
        await page.waitForTimeout(300);
      } else pb("reglages", "bouton 🌐 Géoréférencement absent du groupe Plan");
      // le bouton du bug `saved` : présent = la section géoref s'est construite
      const estimer = await page.locator("#cfg_kmz_B_estimer").count();
      if (estimer > 0) ok("section géoref construite (bouton Estimer B présent)");
      else pb("reglages", "bouton Estimer B absent — section géoref cassée ?");
      await fermerModales();
    } else pb("reglages", "afficherConfig indisponible");

    // ───────────────────── 6. ≡ LÉGENDE ─────────────────────
    console.log("— 6. ≡ Légende —");
    const legendeOuverte = await page.evaluate(function () {
      if (typeof window.afficherLegende === "function") { window.afficherLegende(); return true; }
      return false;
    });
    if (legendeOuverte) { await modaleVisible("≡ Légende", ".kta-legende-modal, #kta-legende-modal, .kta-readme-modal-overlay"); await fermerModales(); }
    else console.log("  ℹ️ afficherLegende non exposée — étape sautée (non bloquant)");

    // ───────── 7. 📊 MODALE SESSION + section 📔 Carnet (v1.79.5) ─────────
    // Ajoutée avec les boutons 🚶/🖥️ de correction du classement : cette modale
    // n'était traversée par AUCUNE étape, donc une classe CSS fantôme ou un
    // libellé i18n manquant y passait inaperçu (c'est exactement le bug qui a
    // motivé ce harnais en v1.76.2).
    console.log("— 7. 📊 Modale Session + section Carnet —");
    const compteurs = await page.locator("#kta-refonte-counters-btn").count();
    if (compteurs > 0) {
      await page.locator("#kta-refonte-counters-btn").click();
      await modaleVisible("📊 Session", "#kta-refonte-session-modal");
      const carnet = await page.locator("#kta-refonte-session-carnet-section").count();
      if (carnet > 0) ok("section 📔 Carnet présente");
      else pb("session", "section Carnet absente de la modale Session");
      // Les boutons de classement n'existent QUE s'il y a une sortie en cours.
      // On n'exige leur présence que dans ce cas — sinon faux rouge quand le
      // carnet est désactivé.
      const sortieEnCours = await page.evaluate(function () {
        try { return !!(window.Journal && window.Journal.getCurrent && window.Journal.getCurrent()); }
        catch (e) { return false; }
      });
      if (sortieEnCours) {
        const nbT = await page.locator("#kta-refonte-session-carnet-type-terrain").count();
        const nbB = await page.locator("#kta-refonte-session-carnet-type-bureau").count();
        if (nbT > 0 && nbB > 0) ok("boutons 🚶/🖥️ de classement présents");
        else pb("session", "boutons de classement absents alors qu'une sortie est en cours");
        // Le clic doit BASCULER le classement. ⚠️ On clique sur le bouton qui
        // n'est PAS actif : une sortie de smoke démarre « bureau », donc
        // vérifier que 🖥️ est primary APRÈS avoir cliqué 🖥️ serait vrai sans
        // rien faire (tautologie — attrapée en falsifiant ce test le 17/08).
        if (nbT > 0 && nbB > 0) {
          const idT = "#kta-refonte-session-carnet-type-terrain";
          const idB = "#kta-refonte-session-carnet-type-bureau";
          const estPrimary = function (sel) {
            return page.locator(sel).evaluate(function (el) {
              return el.classList.contains("kta-btn-primary");
            }).catch(function () { return false; });
          };
          const tAvant = await estPrimary(idT);
          const cible  = tAvant ? idB : idT;     // celui qui n'est pas actif
          const autre  = tAvant ? idT : idB;
          await page.locator(cible).click();
          await page.waitForTimeout(600);
          const cibleOk = await estPrimary(cible);
          const autreOk = !(await estPrimary(autre));
          if (cibleOk && autreOk) ok("le classement bascule (cible active, autre désactivée)");
          else pb("session", "clic de classement sans bascule visible (setType échoué ? cible=" +
                             cibleOk + " autre_desactive=" + autreOk + ")");
        }
        // 🧭 « Affiner le tracé » : présent, et GRISÉ ici — le scénario ne pose
        // aucun « 📍 Je suis ici », donc il n'y a rien à affiner. Un bouton actif
        // à ce stade signalerait un compteur de tronçons faux.
        const aff = await page.locator("#kta-refonte-session-carnet-affiner").count();
        if (aff > 0) {
          const grise = await page.locator("#kta-refonte-session-carnet-affiner")
            .evaluate(function (el) { return el.disabled === true; }).catch(function () { return false; });
          if (grise) ok("bouton 🧭 Affiner présent et grisé (rien à affiner)");
          else pb("session", "bouton Affiner actif alors qu'aucun « Je suis ici » n'a été posé");
        } else pb("session", "bouton 🧭 Affiner absent de la section Carnet");
      } else {
        console.log("  ℹ️ aucune sortie en cours (carnet désactivé ?) — boutons de classement non exigés");
      }
      await fermerModales();
    } else console.log("  ℹ️ bouton compteurs absent — étape sautée (non bloquant)");

    // ───────── 8. ❓ AIDE INTÉGRÉE (hub + une sous-modale) ─────────
    // AUCUNE étape ne traversait l'Aide, alors qu'elle porte ~1 700 lignes de
    // HTML en dur. Deux incidents l'ont prouvé : une régression de langue (elle
    // s'est mise à sortir en français pour les hispanophones) et trois défauts
    // de structure — tous invisibles au harnais parce qu'il ne l'ouvrait jamais.
    console.log("— 8. ❓ Aide intégrée —");
    const aideOuverte = await page.evaluate(function () {
      if (typeof window.afficherAide === "function") { window.afficherAide(); return true; }
      return false;
    });
    if (aideOuverte) {
      await modaleVisible("❓ Aide", "#kta-aide-modal");
      // Le hub doit lister des lignes : un parsing cassé rendrait une modale
      // vide et VISIBLE — donc verte au seul test de visibilité.
      const nbLignes = await page.locator("#kta-aide-modal .kta-aide-row").count();
      if (nbLignes >= 10) ok("hub d'aide peuplé (" + nbLignes + " lignes)");
      else pb("aide", "hub d'aide quasi vide (" + nbLignes + " lignes) — parsing des sections cassé ?");

      // Les classes de typographie du lot 1 doivent EXISTER dans le CSS servi :
      // si le bloc n'était pas déployé, le texte perdrait taille et couleur
      // sans lever la moindre erreur console.
      const cssOk = await page.evaluate(function () {
        const d = document.createElement("p");
        d.className = "kta-aide-note";
        document.body.appendChild(d);
        const c = getComputedStyle(d).fontSize;
        d.remove();
        return c;
      });
      if (cssOk === "12px") ok("classes de typographie de l'Aide servies (kta-aide-note = 12px)");
      else pb("aide", "classe kta-aide-note sans effet (font-size lu : " + cssOk + ") — bloc CSS absent du fichier servi ?");

      // Ouvrir une section : c'est le chemin qui construit la sous-modale.
      await page.locator("#kta-aide-modal .kta-aide-row").nth(1).click().catch(function () {});
      await page.waitForTimeout(300);
      const sous = await page.locator(".kta-aide-submodal").count();
      if (sous > 0) ok("sous-modale d'une section s'ouvre");
      else console.log("  ℹ️ sous-modale non détectée — non bloquant (la 2e ligne peut être un lien externe)");
      await fermerModales();
    } else console.log("  ℹ️ afficherAide non exposée — étape sautée (non bloquant)");

    await page.waitForTimeout(800);   // laisser sortir les erreurs asynchrones
  } catch (e) {
    pb("smoke", "exception du scénario : " + String(e).slice(0, 300));
  } finally {
    await navigateur.close();
    server.close();
  }

  console.log("");
  if (sondesIcones.length) {
    console.log("•  ℹ️ " + sondesIcones.length + " sondage(s) d'icône en 404 — NORMAL pour un plan généré " +
                "avant la v1.97.9 : son plan-config ne déclare pas ce qu'il embarque, l'app doit donc " +
                "demander. Régénère le plan pour les faire disparaître.");
  }
  if (problemes.length) {
    console.log("⚠️ SMOKE ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 SMOKE VERT — boot, modales, plan, Réglages, Légende, Session, Aide : zéro erreur runtime.");
  process.exit(0);
})();
