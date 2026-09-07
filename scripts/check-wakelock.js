#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔆 check-wakelock.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// L'option « garder l'écran allumé » — et la panne qui a résisté à deux
// diagnostics.
//
// ⚠️ UN DIAGNOSTIC FAUX, GARDÉ ICI POUR MÉMOIRE. J'ai d'abord annoncé que
// `WakeLock.init()` n'était appelé nulle part. C'ÉTAIT FAUX : le module
// s'initialise lui-même en fin de fichier, et le faisait déjà. La préférence
// était donc bien relue — ce que le symptôme de KARMA disait d'ailleurs sans
// ambiguïté (« je vois l'option cochée »). L'appel ajouté dans `main.js` ne
// réparait rien ; il reste comme second filet, plus tard dans le boot.
// La leçon : quand l'utilisateur décrit un symptôme, le lire jusqu'au bout
// avant de chercher une cause — celui-ci innocentait la piste choisie.
//
// 🩸 PANNE 2 — LE VERROU FANTÔME (retour KARMA, iPhone 17 Pro).
// « Je coche, ça marche ; je quitte, je relance, la case est cochée mais ça
// ne marche plus ; je décoche/recoche et ça repart. »
// La case cochée prouve que la préférence est relue. Ce qui échoue, c'est le
// verrou posé AU BOOT sans geste utilisateur : le système l'accepte —
// `request()` résout, on tient un sentinel, `isActive()` rend vrai — puis il
// l'IGNORE. Ni erreur, ni événement `release`.
//
// 🩸 ET LE FANTÔME SE VERROUILLE LUI-MÊME : `_acquire()` sort immédiatement
// quand un sentinel est en main (`if (_sentinel !== null) return true`).
// Aucune reprise n'était donc possible — jamais. Décocher/recocher réparait
// parce que c'est un RELÂCHEMENT puis une acquisition SOUS GESTE. Le module
// refait ce geste lui-même au premier contact avec l'écran.
//
// Le module est CHARGÉ dans un `vm` (pas recopié).
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };
const SRC = fs.readFileSync("js/wakeLock.js", "utf8");

// ───────── harnais : un navigateur qui ment, au choix ─────────
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
  // ───────── 1. surface d'API ─────────
  {
    const { ctx } = contexte({});
    ["init", "isSupported", "isActive", "isEnabled", "setEnabled", "onChange"]
      .forEach((m) => t("API : WakeLock." + m + "()", typeof ctx.WakeLock[m] === "function"));
  }

  // ───────── 2. 🩸 la préférence est RELUE au démarrage (panne 1) ─────────
  {
    const { ctx, journal } = contexte({ pref: true });
    // ⚠️ Le module s'initialise LUI-MEME en fin de fichier : la préférence
    // est donc déjà relue quand on arrive ici. C'est ce qui invalide mon
    // premier diagnostic (« init() n'est appelé nulle part ») — et c'est
    // cette assertion-là qui me l'a appris, en tombant.
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

  // ───────── 3. 🩸 LE VERROU FANTÔME (panne 2, LE bug de KARMA) ─────────
  // Le système accepte au boot puis ignore. Rien ne le distingue d'un vrai
  // verrou : il faut RELÂCHER puis REPRENDRE sous geste utilisateur.
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

  // ───────── 4. le refus n'est pas définitif ─────────
  // La première rédaction retirait l'écouteur une fois pour toutes : un seul
  // refus et l'option restait morte jusqu'à un décochage manuel.
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

  // ───────── 5. 🩸 relâchement système : on reprend SANS attendre ─────────
  // Le module attendait un `visibilitychange → visible` qui n'arrive jamais
  // quand le système relâche tout seul.
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

  // ───────── 6. le câblage ─────────
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

    // 🔕 v1.85.2 (KARMA « je le vois coché par défaut ») — la vibration
    // haptique est OFF par défaut.
    // 🩸 Changer le défaut NE SUFFIT PAS : tout test en `!== false` rend VRAI
    // sur `undefined` et rallumerait l'option. Même piège que
    // `showRoadIntersections` en v1.74.0, et c'est ce test-ci qui l'attrape.
    const CFG = fs.readFileSync("js/config.js", "utf8");
    const UIC = fs.readFileSync("js/interfaceConfig.js", "utf8");
    const UTL = fs.readFileSync("js/utils.js", "utf8");
    t("🔕 vibration : défaut OFF", /vibrationEnabled:\s*false/.test(CFG));
    t("🩸 vibration : plus aucun test en `!== false` (il rendrait vrai sur undefined)",
      !/vibrationEnabled\s*!==\s*false/.test(CFG + UIC + UTL));
    t("vibration : la case coche sur `=== true`", /c\.vibrationEnabled === true/.test(UIC));
    // 🛰️ v1.85.2 — LA RUBRIQUE « Options via capteur », et ce qu'elle DIT.
    // 🩸 Avant, une option dont le capteur manque était MASQUÉE : sur iPhone la
    // vibration disparaissait de la modale, sans que rien ne dise pourquoi.
    // L'utilisateur ne pouvait pas distinguer « ça n'existe pas » de « ton
    // système refuse ». On l'affiche désormais, désactivée, avec la raison.
    t("🛰️ la rubrique capteur existe", /config\.capteurs\.titre/.test(UIC));
    // 🩸 Elle doit être un GROUPE DE PREMIER NIVEAU, pas une sous-section
    // d'« Affichage » — c'est précisément l'endroit que KARMA voulait quitter,
    // et ma première version l'y avait laissée (« je vois pas où tu as mis ça »).
    t("🩸 capteurs : c'est un GROUPE de 1er niveau, pas une sous-section d'Affichage",
      /config\.group\.capteurs/.test(UIC) &&
      UIC.indexOf("config.group.capteurs") > UIC.indexOf("config.group.perf") &&
      UIC.indexOf("config.group.capteurs") < UIC.indexOf("config.group.privacy"));
    ["fr", "en", "es"].forEach(function (l) {
      const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
      t("i18n " + l + " : config.group.capteurs", typeof D["config.group.capteurs"] === "string");
    });

    // 🐛 Modale en 2 colonnes : un TITRE DE GROUPE ne doit jamais rester seul
    // en bas de colonne pendant que son contenu passe à droite. Les sections
    // avaient `break-inside`, les titres n'avaient RIEN — et un titre orphelin
    // est pire qu'un titre déplacé : il annonce un contenu absent.
    {
      const CSS = fs.readFileSync("css/style.css", "utf8");
      const i = CSS.indexOf(".kta-cfg-corps .kta-cfg-group-titre");
      const b = i < 0 ? "" : CSS.slice(i, CSS.indexOf("}", i));
      t("🐛 colonnes : la règle sur les titres de groupe existe", i >= 0);
      t("🐛 colonnes : aucune coupure juste APRÈS un titre de groupe",
        /break-after:\s*avoid/.test(b));
      // 🩸 DEUX CORPS coulent en colonnes avec les MÊMES titres. Scoper la
      // règle sur un seul laissait le bug intact de l'autre côté — c'est
      // exactement ce qui est arrivé : corrigé côté plan, toujours cassé au
      // HOME, et KARMA l'a revu sur sa capture suivante.
      t("🩸 colonnes : la règle couvre AUSSI le corps de l'accueil",
        /\.kta-loader-config-corps \.kta-cfg-group-titre/.test(CSS));
      t("colonnes : les sections restent protégées d'une coupure interne",
        /\.kta-cfg-corps \.kta-aide-section \{[\s\S]{0,160}break-inside:\s*avoid/.test(CSS));
    }
    // ⚠️ Le rendu a MIGRÉ dans `utils.js` pour être partagé avec l'accueil :
    // c'est là qu'il faut le chercher désormais, pas dans interfaceConfig.
    const UTL2 = fs.readFileSync("js/utils.js", "utf8");
    t("🩸 un capteur refusé est AFFICHÉ, pas masqué",
      /window\.ktaCapteurRefuse = function/.test(UTL2) && /row\.style\.display = "";/.test(UTL2));
    t("🩸 et la raison est NOMMÉE (iOS distingué du reste)",
      /config\.capteurs\.refuseIos/.test(UTL2) && /config\.capteurs\.refuse"/.test(UTL2));
    t("la case d'un capteur refusé est désactivée, pas juste décochée",
      /cb\.disabled = true/.test(UTL2));

    // 🔋 La batterie est débrayable — icône ET écoute du capteur.
    t("🔋 batterie : la préférence existe, défaut ON", /batterieEnabled:\s*true/.test(CFG));
    t("🩸 batterie : l'écoute est coupée AVANT `getBattery()` (pas seulement l'icône)",
      (function () {
        const BG = fs.readFileSync("js/batteryGuard.js", "utf8");
        const iPref = BG.indexOf("batterieEnabled === false");
        // 🩸 Viser le SITE D'APPEL : `navigator.getBattery()` apparaît
        // d'abord dans le COMMENTAIRE d'en-tête du module, vingt lignes
        // avant tout code. Chercher la chaîne nue rendait donc un index
        // situé AVANT la garde, et l'assertion échouait sur du code juste.
        const iGet  = BG.indexOf("navigator.getBattery().then(");
        return iPref > 0 && iGet > 0 && iPref < iGet;
      })());
    t("batterie : la case est dans la modale", /id="cfg_batterie"/.test(UIC));
    // 🛰️ Les options capteur vivent AUSSI dans la modale d'accueil : ce sont
    // des réglages d'APPAREIL, qu'on décide avant de descendre, pas des
    // réglages de plan.
    {
      const IDX2 = fs.readFileSync("index.html", "utf8");
      const HC   = fs.readFileSync("js/homeConfig.js", "utf8");
      t("🛰️ accueil : la rubrique capteur y est aussi", /config\.group\.capteurs/.test(IDX2));
      t("accueil : les deux cases existent",
        /id="loaderBatterieCb"/.test(IDX2) && /id="loaderVibrationCb"/.test(IDX2));
      t("accueil : elles sont câblées", /loaderBatterieCb/.test(HC) && /loaderVibrationCb/.test(HC));
      // 🩸 Le rendu « capteur refusé » est PARTAGÉ, pas recopié : deux copies
      // auraient fini par diverger — la dette qu'on solde à répétition ici.
      t("🩸 le rendu « capteur refusé » est partagé (utils.js), pas dupliqué",
        /window\.ktaCapteurRefuse\s*=/.test(fs.readFileSync("js/utils.js", "utf8")) &&
        /window\.ktaCapteurRefuse/.test(HC) && /window\.ktaCapteurRefuse/.test(UIC));
      // 🪟 L'ancrage des panneaux décide OÙ s'ouvre un panneau : c'est de
      // l'AFFICHAGE, pas de la navigation. Il avait atterri près du magnétisme.
      const iAff = UIC.indexOf("config.group.affichage");
      const iPan = UIC.indexOf("cfg_panneauxAncres");
      const iPerf = UIC.indexOf("config.group.perf");
      t("🪟 l'ancrage des panneaux est dans AFFICHAGE, pas dans la navigation",
        iAff > 0 && iPan > iAff && iPan < iPerf);
    }
    t("batterie : sauvegardée par le chemin canonique",
      /existing\.batterieEnabled/.test(CFG));
    t("🩸 batterie : défaut ON donc test en `!== false` (l'idiome inverse des défauts OFF)",
      /cfg\.batterieEnabled\s*=\s*DEFAULT_CONFIG\.batterieEnabled !== false/.test(CFG));
    ["config.capteurs.titre", "config.capteurs.intro", "config.capteurs.refuse",
     "config.capteurs.refuseIos", "config.batterie.label", "config.batterie.hint",
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
