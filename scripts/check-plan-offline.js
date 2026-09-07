#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 💾 check-plan-offline.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LE BESOIN (question KARMA, 07/09/2026) : « une fois un plan serveur chargé,
// il est en cache, offline ok ? » — NON, et pour trois raisons cumulées :
//
//   1. PLAFOND : le cache principal est borné à MAX_DYNAMIC_ENTRIES (800) avec
//      éviction FIFO. Un plan V2 de 20000×12000 fait 1275 tuiles, et son SEUL
//      niveau z=0 en fait 960 → le plan s'évinçait lui-même en se chargeant.
//      Hors-ligne : carte TROUÉE, pas une erreur.
//   2. PARESSE : seules les tuiles AFFICHÉES sont téléchargées (un niveau de
//      zoom sur quatre si on n'a pas zoomé).
//   3. BUMP : `activate` supprimait tout cache ≠ CACHE_NAME.
//
// D'où un cache DÉDIÉ par plan, exclu des deux mécanismes.
//
// ⚠️ L'EXIGENCE LA PLUS FACILE À CASSER, et celle que ce script protège en
// priorité : l'état affiché doit être lu du CACHE RÉEL, jamais d'un drapeau
// mémorisé. Un drapeau survit à une purge navigateur et annonce « disponible »
// sur du vide — le « bouton fantôme » que KARMA a explicitement refusé.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const SW  = fs.readFileSync("sw.js", "utf8");
const PO  = fs.readFileSync("js/planOffline.js", "utf8");
const HL  = fs.readFileSync("js/homeLoader.js", "utf8");
const IDX = fs.readFileSync("index.html", "utf8");

// 🩸 On teste du CODE, pas des commentaires (piège vécu 3 fois).
function sansCommentaires(src) {
  return src.replace(/<!--[\s\S]*?-->/g, " ")
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/^[ \t]*\/\/.*$/gm, " ");
}
const SWC = sansCommentaires(SW);
const POC = sansCommentaires(PO);
const HLC = sansCommentaires(HL);

// ───────── 1. le Service Worker préserve et sert les caches de plan ─────────
t("💾 le SW connaît un préfixe de cache de plan",
  /const PLAN_CACHE_PREFIX = "myktamap-plan-"/.test(SWC));
t("🩸 les caches de plan SURVIVENT au bump (activate ne les supprime pas)",
  /key !== CACHE_NAME && !_estCachePlan\(key\)/.test(SWC));
t("💾 un miss du cache principal va regarder les caches de plan",
  /_matchCachesPlan\(event\.request\)/.test(SWC) && /function _matchCachesPlan/.test(SWC));
t("💾 la liste des caches de plan est mémoïsée (pas un caches.keys() par requête)",
  /_planCachesMemo/.test(SWC) && /PLAN_CACHES_TTL/.test(SWC));
t("💾 …et invalidée par la page après écriture/suppression",
  /PLAN_CACHE_CHANGED/.test(SWC) && /PLAN_CACHE_CHANGED/.test(POC));
// L'éviction LRU n'ouvre que CACHE_NAME : les caches de plan lui échappent
// par construction. On le VÉRIFIE, sinon un refactor pourrait l'élargir.
t("🩸 l'éviction LRU ne touche QUE le cache principal",
  /_scheduleEviction[\s\S]{0,400}caches\.open\(CACHE_NAME\)/.test(SWC));

// ───────── 2. l'état vient du cache réel, jamais d'un drapeau ─────────
t("🩸 planOffline n'écrit AUCUN drapeau de persistance (localStorage/IDB)",
  POC.indexOf("localStorage") < 0 && POC.indexOf("indexedDB") < 0);
t("🩸 le statut est calculé en LISANT le cache (caches.keys + cache.keys)",
  /function statut/.test(POC) && /caches\.keys\(\)/.test(POC) && /cache\.keys\(\)/.test(POC));
t("🩸 sans manifeste, on ne conclut JAMAIS « complet »",
  /if \(!man \|\| !Array\.isArray\(man\.urls\)\)/.test(POC));
t("🩸 le manifeste n'est écrit qu'APRÈS la boucle (une interruption laisse « incomplet »)",
  // 🩸 `_urlManifeste(plan)` apparait AUSSI dans la definition de la fonction,
  // bien avant la boucle : on vise l ECRITURE (`cache.put(_urlManifeste`).
  POC.indexOf("await Promise.all(pool)") > 0 &&
  POC.indexOf("cache.put(_urlManifeste(plan)") > POC.indexOf("await Promise.all(pool)"));
t("🩸 seul un 200 est mis en cache (un 404 caché rendrait le plan faussement complet)",
  /r\.status === 200/.test(POC));

// ───────── 3. un seul point de vérité pour les tuiles ─────────
t("🩸 planOffline énumère les tuiles via ktaTuilesV2Urls (pas sa propre grille)",
  /window\.ktaTuilesV2Urls/.test(POC));
t("🩸 …et ne recalcule aucune grille localement",
  POC.indexOf("Math.pow(2") < 0 && POC.indexOf("tileSize") < 0);
t("💾 le module est chargé par index.html", IDX.indexOf("js/planOffline.js") >= 0);

// ───────── 4. PAS DE BOUTON FANTÔME (exigence KARMA) ─────────
// Le bloc de rendu distingue trois états ; celui du plan COMPLET ne doit
// proposer QUE « mettre à jour » et « retirer ».
{
  // 🩸 `if (st.etat === "complet")` apparait DEUX fois : d abord pour le
  // message colore, ensuite pour les boutons. La 1re version prenait la
  // mauvaise tranche et rougissait sur du code sain. On borne sur le rendu.
  const iZone = HLC.indexOf("zone.innerHTML = html;");
  const d = HLC.lastIndexOf('if (st.etat === "complet") {', iZone);
  const f = HLC.indexOf('} else if (st.etat === "incomplet") {', d);
  const brancheComplet = (d >= 0 && f > d) ? HLC.slice(d, f) : "";
  t("le rendu à trois états est trouvable", brancheComplet.length > 0);
  t("🩸 plan complet → PAS de bouton de téléchargement (il devient « mettre à jour »)",
    brancheComplet.indexOf("btnTelecharger") < 0 &&
    brancheComplet.indexOf("btnCompleter") < 0 &&
    brancheComplet.indexOf("btnMaj") >= 0);
  t("🩸 cache perdu ou partiel → le bouton revient (état « incomplet » proposé)",
    /st\.etat === "incomplet"[\s\S]{0,600}btnCompleter/.test(HLC));
  t("le bloc n'est proposé que pour les plans SERVEUR",
    /plan\.type === "server" && window\.PlanOffline/.test(HLC));
}

// ───────── 5. ON EXÉCUTE l'énumération des tuiles ─────────
// Une assertion de chaîne ne dirait rien de la grille. On charge tiling.js
// dans un vm et on compte, sur un cas dont le nombre est calculable à la main.
{
  const win = { navigator: { userAgent: "node", deviceMemory: 8 }, console: console,
                document: { createElement: () => ({ getContext: () => null }) },
                location: { href: "http://x/" } };
  win.window = win;
  let f = null;
  try {
    const ctx = vm.createContext(win);
    vm.runInContext("var window = this; var document = this.document; var navigator = this.navigator;" +
                    fs.readFileSync("js/tiling.js", "utf8"), ctx);
    f = win.ktaTuilesV2Urls;
  } catch (e) { console.log("   ↳ " + e.name + " : " + e.message); }
  t("tiling.js se charge et expose ktaTuilesV2Urls", typeof f === "function");

  if (typeof f === "function") {
    const pc = {
      plan:   { baseImage: "data/toto/data/MonPlan.png", imageWidth: 20000, imageHeight: 12000 },
      tiling: { version: 2, tileSize: 512, format: "jpeg", minNativeZoom: -3, maxNativeZoom: 0 }
    };
    const urls = f(pc);
    // 960 (z=0) + 240 + 60 + 15 = 1275, calculable à la main : c'est le chiffre
    // qui prouve que le plafond de 800 du cache principal était intenable.
    t("🩸 grille complète des 4 niveaux : 1275 tuiles (z=0 en fait 960 à lui seul)",
      urls.length === 1275);
    t("racine dérivée du dossier du baseImage",
      urls[0] === "data/toto/data/tiles/z0/x0_y-1.jpg");
    t("le dernier niveau est bien z=-3",
      urls[urls.length - 1].indexOf("/z-3/") >= 0);
    // Un plan LOCAL (baseImage en blob:) n'a pas de tuiles HTTP à pré-cacher.
    const local = f({ plan: { baseImage: "blob:http://x/abc", imageWidth: 4096, imageHeight: 4096 },
                      tiling: pc.tiling });
    t("🩸 plan LOCAL (blob:) → aucune URL (rien à pré-cacher, tout est déjà dans le ZIP)",
      Array.isArray(local) && local.length === 0);
  }
}

console.log(ko === 0 ? "\n🎉 hors-ligne : un plan serveur se télécharge en entier et l'état ne ment pas"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
