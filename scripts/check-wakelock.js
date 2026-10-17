#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-wakelock.js — BLOQUANT (pré-commit) : option « garder l'écran allumé » (`js/wakeLock.js`, chargé
// dans un `vm`), plus les options capteur (vibration, batterie) et leur rubrique de configuration.
// ⚠️ Le module s'initialise lui-même en fin de fichier ; l'appel `init()` de `main.js` est un second filet.
// 🩸 Verrou fantôme (iOS) : posé AU BOOT sans geste, le verrou est accepté (`request()` résout,
//    `isActive()` vrai) puis ignoré, sans erreur ni `release`. Et `_acquire()` sort dès qu'un sentinel est
//    en main : aucune reprise possible. Le module relâche puis reprend lui-même au premier geste.
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };
const SRC = fs.readFileSync("js/wakeLock.js", "utf8");

// ── Harnais : un navigateur qui ment, au choix ──────
function contexte(opts) {
  opts = opts || {};
  const journal = { demandes: 0, liberations: 0, gestes: {} };
  let store = opts.pref === undefined ? null : (opts.pref ? "1" : "0");

  function sentinelle() {
    const ecoutes = {};
    return {
      released: false,
      addEventListener: (ev, fn) => { (ecoutes[ev] = ecoutes[ev] || []).push(fn); },
      release: () => { journal.liberations++; return Promise.resolve(); },
      _emettreRelease: () => (ecoutes.release || []).forEach((f) => f())
    };
  }

  const ctx = {
    console: { log() {}, warn() {} },
    setTimeout: (fn) => { journal.differe = fn; return 1; },   // exécuté à la demande
    Promise, Date, Number, Boolean, Object, Array, JSON, Math,
    localStorage: {
      getItem: () => store,
      setItem: (k, v) => { store = v; }
    },
    document: {
      hidden: !!opts.cache,
      _ecoutes: {},
      addEventListener: function (ev, fn) { (this._ecoutes[ev] = this._ecoutes[ev] || []).push(fn); },
      removeEventListener: function (ev, fn) {
        this._ecoutes[ev] = (this._ecoutes[ev] || []).filter((f) => f !== fn);
      }
    },
    navigator: {
      wakeLock: {
        request: function () {
          journal.demandes++;
          if (opts.refuse) return Promise.reject(new Error("NotAllowedError"));
          journal.derniere = sentinelle();
          return Promise.resolve(journal.derniere);
        }
      }
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "wakeLock.js" });
  return { ctx, journal };
}

const tick = () => new Promise((r) => setImmediate(r));
function geste(ctx) {
  (ctx.document._ecoutes.pointerdown || []).slice().forEach((f) => f());
}

(async function () {
  // ── 1. Surface d'API ──────
  {
    const { ctx } = contexte({});
    ["init", "isSupported", "isActive", "isEnabled", "setEnabled", "onChange"]
      .forEach((m) => t("API : WakeLock." + m + "()", typeof ctx.WakeLock[m] === "function"));
  }

  // ── 2. La préférence est relue au démarrage ──────
  {
    const { ctx, journal } = contexte({ pref: true });
    // ⚠️ Auto-initialisation en fin de fichier : la préférence est déjà relue ici.
    t("le module s'initialise seul au chargement", ctx.WakeLock.isEnabled() === true);
    await ctx.WakeLock.init();
    await tick();
    t("🩸 init : la préférence enregistrée est restaurée", ctx.WakeLock.isEnabled() === true);
    t("🩸 init : le verrou est demandé au démarrage", journal.demandes >= 1);
  }
  {
    const { ctx, journal } = contexte({ pref: false });
    await ctx.WakeLock.init();
    await tick();
    t("init : préférence à false → aucune demande", journal.demandes === 0);
    t("init : et l'option reste décochée", ctx.WakeLock.isEnabled() === false);
  }

  // ── 3. Verrou fantôme : rien ne le distingue d'un vrai, il faut relâcher puis reprendre sous geste ──
  {
    const { ctx, journal } = contexte({ pref: true });
    await ctx.WakeLock.init();
    await tick();
    const apresBoot = journal.demandes;
    t("fantôme : au boot, le verrou paraît tenu", ctx.WakeLock.isActive() === true);
    t("fantôme : un rattrapage est armé MALGRÉ ce verrou apparent",
      (ctx.document._ecoutes.pointerdown || []).length === 1);

    geste(ctx);
    await tick(); await tick();
    t("🩸 fantôme : le premier geste RELÂCHE le verrou suspect", journal.liberations >= 1);
    t("🩸 fantôme : puis en redemande un sous geste utilisateur", journal.demandes > apresBoot);
    t("fantôme : et l'option est toujours active", ctx.WakeLock.isActive() === true);
  }

  // ── 4. Le refus n'est pas définitif : retirer l'écouteur après un refus tue l'option ──
  {
    const { ctx, journal } = contexte({ pref: true, refuse: true });
    await ctx.WakeLock.init();
    await tick();
    t("refus : rien n'est acquis", ctx.WakeLock.isActive() === false);
    t("refus : un rattrapage est armé", (ctx.document._ecoutes.pointerdown || []).length === 1);
    geste(ctx);
    await tick(); await tick();
    t("🩸 refus : après un geste qui échoue, le rattrapage est RÉARMÉ",
      (ctx.document._ecoutes.pointerdown || []).length === 1);
    t("refus : et la préférence n'est pas perdue pour autant", ctx.WakeLock.isEnabled() === true);
  }

  // ── 5. Relâchement système : reprise sans attendre `visibilitychange` (qui n'arrive pas) ──
  {
    const { ctx, journal } = contexte({ pref: true });
    await ctx.WakeLock.init();
    await tick();
    const avant = journal.demandes;
    journal.derniere._emettreRelease();
    await tick();
    t("relâchement : le sentinel est libéré", ctx.WakeLock.isActive() === false);
    t("🩸 relâchement : une reprise est PROGRAMMÉE (pas d'attente d'un changement d'onglet)",
      typeof journal.differe === "function");
    journal.differe();
    await tick();
    t("🩸 relâchement : le verrou est effectivement redemandé", journal.demandes > avant);
  }

  // ── 6. Câblage ──────
  {
    const MAIN = fs.readFileSync("js/main.js", "utf8");
    const IDX  = fs.readFileSync("index.html", "utf8");
    t("🩸 câblage : `init()` est appelé au boot (il ne l'était NULLE PART)",
      /window\.WakeLock\.init\(\)/.test(MAIN));
    t("câblage : le module est chargé", /src="js\/wakeLock\.js"/.test(IDX));
    t("🩸 le rattrapage FORCE le relâchement (sinon le fantôme bloque tout)",
      /_reprendreAuPremierGeste\(true\)/.test(SRC) && /if \(forcer\) await _release\(\);/.test(SRC));
    t("les reprises automatiques sont BORNÉES (pas de boucle contre un système qui refuse)",
      /MAX_REPRISES/.test(SRC) && /_reprises < MAX_REPRISES/.test(SRC));

    // Vibration OFF par défaut (décision produit).
    // 🩸 Changer le défaut ne suffit pas : un test en `!== false` rend VRAI sur `undefined` et rallume l'option.
    const CFG = fs.readFileSync("js/config.js", "utf8");
    const UIC = fs.readFileSync("js/interfaceConfig.js", "utf8");
    const UTL = fs.readFileSync("js/utils.js", "utf8");
    t("🔕 vibration : défaut OFF", /vibrationEnabled:\s*false/.test(CFG));
    t("🩸 vibration : plus aucun test en `!== false` (il rendrait vrai sur undefined)",
      !/vibrationEnabled\s*!==\s*false/.test(CFG + UIC + UTL));
    t("vibration : la case coche sur `=== true`", /c\.vibrationEnabled === true/.test(UIC));
    // Rubrique « Fonctionnalités optionnelles » (batterie, vibration, replay, heatmap).
    // 🩸 Une option dont le capteur manque est AFFICHÉE désactivée avec la raison, jamais masquée :
    // sinon « ça n'existe pas » et « ton système refuse » se confondent.
    t("🧩 la rubrique Fonctionnalités optionnelles existe", /config\.optionnels\.titre/.test(UIC));
    // Groupe de premier niveau, pas une sous-section d'« Affichage » (décision produit).
    t("🩸 optionnels : c'est un GROUPE de 1er niveau, pas une sous-section d'Affichage",
      /config\.group\.optionnels/.test(UIC) &&
      UIC.indexOf("config.group.optionnels") > UIC.indexOf("config.group.perf") &&
      UIC.indexOf("config.group.optionnels") < UIC.indexOf("config.group.system"));
    ["fr", "en", "es"].forEach(function (l) {
      const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
      t("i18n " + l + " : config.group.optionnels", typeof D["config.group.optionnels"] === "string");
    });

    // Modale en 2 colonnes : un titre de groupe ne reste jamais seul en bas de colonne.
    {
      const CSS = fs.readFileSync("css/style.css", "utf8");
      const i = CSS.indexOf(".kta-cfg-corps .kta-cfg-group-titre");
      const b = i < 0 ? "" : CSS.slice(i, CSS.indexOf("}", i));
      t("🐛 colonnes : la règle sur les titres de groupe existe", i >= 0);
      t("🐛 colonnes : aucune coupure juste APRÈS un titre de groupe",
        /break-after:\s*avoid/.test(b));
      // 🩸 Deux corps (plan et accueil) coulent en colonnes avec les mêmes titres : la règle couvre les deux.
      t("🩸 colonnes : la règle couvre AUSSI le corps de l'accueil",
        /\.kta-loader-config-corps \.kta-cfg-group-titre/.test(CSS));
      t("colonnes : les sections restent protégées d'une coupure interne",
        /\.kta-cfg-corps \.kta-aide-section \{[\s\S]{0,160}break-inside:\s*avoid/.test(CSS));
    }
    // ⚠️ Le rendu vit dans `utils.js` (partagé avec l'accueil), pas dans interfaceConfig.
    const UTL2 = fs.readFileSync("js/utils.js", "utf8");
    t("🩸 un capteur refusé est AFFICHÉ, pas masqué",
      /window\.ktaCapteurRefuse = function/.test(UTL2) && /row\.style\.display = "";/.test(UTL2));
    t("🩸 et la raison est NOMMÉE (iOS distingué du reste)",
      /config\.capteurs\.refuseIos/.test(UTL2) && /config\.capteurs\.refuse"/.test(UTL2));
    t("la case d'un capteur refusé est désactivée, pas juste décochée",
      /cb\.disabled = true/.test(UTL2));

    // Batterie débrayable : icône ET écoute du capteur.
    t("🔋 batterie : la préférence existe, défaut OFF (🧩 01/10/2026)", /batterieEnabled:\s*false/.test(CFG));
    t("🩸 batterie : l'écoute est coupée AVANT `getBattery()` (pas seulement l'icône)",
      (function () {
        const BG = fs.readFileSync("js/batteryGuard.js", "utf8");
        const iPref = BG.indexOf("batterieEnabled !== true");
        // 🩸 Viser le SITE D'APPEL : `navigator.getBattery()` apparaît d'abord dans l'en-tête du module.
        const iGet  = BG.indexOf("navigator.getBattery().then(");
        return iPref > 0 && iGet > 0 && iPref < iGet;
      })());
    t("batterie : la case est dans la modale", /id="cfg_batterie"/.test(UIC));
    // Les options capteur vivent aussi à l'accueil : réglages d'appareil, décidés avant de descendre.
    {
      const IDX2 = fs.readFileSync("index.html", "utf8");
      const HC   = fs.readFileSync("js/homeConfig.js", "utf8");
      t("🧩 accueil : la rubrique Fonctionnalités optionnelles y est aussi", /config\.group\.optionnels/.test(IDX2));
      t("accueil : les deux cases existent",
        /id="loaderBatterieCb"/.test(IDX2) && /id="loaderVibrationCb"/.test(IDX2));
      t("accueil : elles sont câblées", /loaderBatterieCb/.test(HC) && /loaderVibrationCb/.test(HC));
      // Chaque case garde un emplacement VIDE que `ktaCapteurRefuse` remplit avec la raison d'un refus ;
      // sans lui, la case grisée reste muette.
      t("🛰️ accueil : chaque case garde l'emplacement de la raison d'un refus",
        /id="loaderVibrationHint" class="kta-cfg-raison"><\/span>/.test(IDX2) &&
        /id="loaderBatterieHint" class="kta-cfg-raison"><\/span>/.test(IDX2));
      // 🩸 Rendu « capteur refusé » partagé, pas recopié : deux copies divergent.
      t("🩸 le rendu « capteur refusé » est partagé (utils.js), pas dupliqué",
        /window\.ktaCapteurRefuse\s*=/.test(fs.readFileSync("js/utils.js", "utf8")) &&
        /window\.ktaCapteurRefuse/.test(HC) && /window\.ktaCapteurRefuse/.test(UIC));
      // L'ancrage des panneaux est un réglage GLOBAL : il vit dans la configuration de l'accueil (groupe
      // Affichage) et ne doit pas reparaître côté plan.
      t("🪟 l'ancrage des panneaux a quitté la config du mode plan",
        UIC.indexOf("cfg_panneauxAncres") < 0);
      t("🪟 et il est dans le groupe Affichage de l'accueil",
        (function () {
          const a = IDX2.indexOf('data-i18n="config.group.affichage"');
          const p = IDX2.indexOf('id="loaderPanneauxAncres"');
          // Borne haute : le groupe suivant à l'accueil.
          const q = IDX2.indexOf('data-i18n="config.group.optionnels"');
          return a > 0 && p > a && p < q;
        })());
    }
    t("batterie : sauvegardée par le chemin canonique",
      /existing\.batterieEnabled/.test(CFG));
    // Batterie OFF par défaut : `=== true`, comme tous les défauts OFF.
    t("🩸 batterie : défaut OFF donc test en `=== true`",
      /cfg\.batterieEnabled\s*=\s*DEFAULT_CONFIG\.batterieEnabled === true/.test(CFG) &&
      !/batterieEnabled\s*!==\s*false/.test(CFG + UIC));
    ["config.optionnels.titre", "config.capteurs.refuse",
     "config.capteurs.refuseIos", "config.batterie.label",
     "config.batterie.toastOn", "config.batterie.toastOff"].forEach(function (k) {
      ["fr", "en", "es"].forEach(function (l) {
        const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
        t("i18n " + l + " : " + k, typeof D[k] === "string" && D[k].length > 0);
      });
    });

    t("vibration : celui qui fait vibrer teste `=== true` aussi",
      /vibrationEnabled !== true\) return false/.test(UTL));
  }

  console.log(ko === 0 ? "\n🎉 wake lock : tout passe" : "\n⚠️ " + ko + " echec(s)");
  process.exit(ko === 0 ? 0 : 1);
})();
