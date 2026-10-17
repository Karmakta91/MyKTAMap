#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-plan-offline.js — garde-fou pré-commit BLOQUANT du hors-ligne d'un plan serveur
// =====================================================================
// (js/planOffline.js, sw.js, js/homeLoader.js). Un plan servi n'est PAS hors-ligne par simple
// chargement : le cache principal est borné (MAX_DYNAMIC_ENTRIES, éviction FIFO : un grand plan V2
// s'évince lui-même), seules les tuiles affichées sont téléchargées, et `activate` purge tout cache
// ≠ CACHE_NAME. D'où un cache DÉDIÉ par plan, exclu de l'éviction et du bump.
// 🩸 L'exigence la plus facile à casser : l'état affiché se lit du CACHE RÉEL, jamais d'un drapeau
// mémorisé (il survit à une purge et annonce « disponible » sur du vide : pas de bouton fantôme,
// décision produit). Plusieurs contrôles EXÉCUTENT le code (vm) : une TDZ échappe à `node -c`.
// Doc : docs/TILING.md (hors-ligne d'un plan serveur).
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

// 🩸 « Le mangeur de blocs » : retirer les commentaires LIGNE À LIGNE, jamais par regex
// `/\/\*[\s\S]*?\*\//`. Un `/*` hors commentaire (chaîne `image/*`, chemin `data/**`, regex) ferait
// avaler tout jusqu'au `*/` suivant, et les assertions « X n'est PAS présent » deviendraient
// vraies par accident. Seules les lignes ENTIÈRES de commentaire partent.
function sansCommentaires(src) {
  const nl = src.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
  const out = [];
  let dansBloc = false, dansHtml = false;
  src.split(/\r?\n/).forEach(function (l) {
    const t = l.trim();
    if (dansBloc) { if (t.indexOf("*/") >= 0) dansBloc = false; out.push(""); return; }
    if (dansHtml) { if (t.indexOf("-->") >= 0) dansHtml = false; out.push(""); return; }
    if (t.indexOf("//") === 0) { out.push(""); return; }
    if (t.indexOf("/*") === 0) { if (t.indexOf("*/") < 0) dansBloc = true; out.push(""); return; }
    if (t.indexOf("<!--") === 0) { if (t.indexOf("-->") < 0) dansHtml = true; out.push(""); return; }
    out.push(l);
  });
  return out.join(nl);
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
// Les caches de plan échappent à l'éviction par construction : vérifié contre un refactor.
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
  // 🩸 `_urlManifeste(plan)` apparaît aussi dans sa définition, avant la boucle : on vise l'ÉCRITURE.
  POC.indexOf("await Promise.all(pool)") > 0 &&
  POC.indexOf("cache.put(_urlManifeste(plan)") > POC.indexOf("await Promise.all(pool)"));
t("🩸 les URLs manquantes sont retenues sur LES DEUX chemins d échec (HTTP + réseau)",
  // 🩸 Exactement 2 occurrences : une seule laisserait passer la perte d'un des deux chemins.
  POC.split("manquants.push(u)").length - 1 === 2);
t("🩸 le MANIFESTE porte la liste des manquants",
  (function () {
    // 🩸 Borné à l'écriture du manifeste : le retour de precacher() contient la même chaîne.
    const i = POC.indexOf("cache.put(_urlManifeste(plan)");
    return i >= 0 && POC.slice(i, i + 400).indexOf("manquants: manquants") >= 0;
  })());
t("🩸 l UI nomme les fichiers manquants au lieu de dire seulement « n sur N »",
  HLC.indexOf("manquantsTitre") >= 0 && HLC.indexOf("st.manquants.slice(0, 5)") >= 0);
t("🩸 l état « partiel » propose un RÉESSAI, pas un retéléchargement complet",
  (function () {
    // Tranche du bloc BOUTONS (pas celui des MESSAGES, qui parle du même état sans bouton).
    const iZ = HLC.indexOf("zone.innerHTML = html;");
    const d  = HLC.lastIndexOf("} else if (st.etat === \"partiel\") {", iZ);
    const f  = HLC.indexOf("} else if (st.etat === \"incomplet\") {", d);
    if (d < 0 || f < d) return false;
    const b = HLC.slice(d, f);
    return b.indexOf("btnReessayer") >= 0 &&
           b.indexOf("btnTelecharger") < 0 &&
           b.indexOf("btnCompleter") < 0;
  })());
t("🩸 seul un 200 est mis en cache (un 404 caché rendrait le plan faussement complet)",
  (function () {
    // 🩸 Borné à `precacher` : `verifierMaj` contient aussi un `r.status === 200`.
    const i = POC.indexOf("async function precacher");
    const j = POC.indexOf("cache.put(u, r.clone())", i);
    return i >= 0 && j > i && POC.slice(i, j).indexOf("r.status === 200") >= 0;
  })());

// ───────── 3. un seul point de vérité pour les tuiles ─────────
t("🩸 planOffline énumère les tuiles via ktaTuilesV2Urls (pas sa propre grille)",
  /window\.ktaTuilesV2Urls/.test(POC));
t("🩸 …et ne recalcule aucune grille localement",
  POC.indexOf("Math.pow(2") < 0 && POC.indexOf("tileSize") < 0);
t("💾 le module est chargé par index.html", IDX.indexOf("js/planOffline.js") >= 0);

// ───────── 4. PAS DE BOUTON FANTÔME (décision produit) ─────────
// Plan COMPLET : seulement « mettre à jour » et « retirer ».
{
  // 🩸 `if (st.etat === "complet")` apparaît DEUX fois (message, puis boutons) : borné sur le rendu.
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
  t("le bloc n'est proposé que pour les plans SERVEUR à dossier (pas un plan ZIP de l'index)",
    /plan\.type === "server" && !plan\.zip && window\.PlanOffline/.test(HLC));
}

// ───────── 4 bis. PLAN ZIP DÉCLARÉ PAR L'INDEX (`"zip": "data/x.zip"`) ─────────
// 🩸 Son hors-ligne est la copie gardée en IndexedDB, pas le cache du SW : chaque branche doit le
// savoir, sinon il retombe sur le chemin « dossier » (fetch de <path>/plan-config.json → 404).
{
  const lire = function (f) { return fs.readFileSync(f, "utf8"); };
  const HLZ = lire("js/homeLoader.js"), MZ = lire("js/main.js"), SWZ = lire("sw.js");
  t("📦 index : `zip` accepté seulement en chemin relatif .zip (ni schéma, ni « .. », ni « / » initial)",
    /\/\^\[\\w\.\/-\]\+\\\.zip\$\/i\.test\(entry\.zip\)/.test(MZ) && /entry\.zip\.indexOf\("\.\."\) < 0/.test(MZ) &&
    /zip: zip,/.test(MZ));
  t("📦 ouverture : branche dédiée AVANT la branche dossier, ouverte comme un ZIP en type « server-zip »",
    HLZ.indexOf('if (plan.type === "server" && plan.zip) {') >= 0 &&
    HLZ.indexOf('if (plan.type === "server" && plan.zip) {') < HLZ.indexOf("await window.chargerPlanServeur(plan.path, plan, presetPlan)") &&
    /typeRegistre: "server-zip"/.test(HLZ));
  t("📦 fraîcheur : requête conditionnelle (ETag / Last-Modified), 304 = copie gardée",
    /If-None-Match/.test(HLZ) && /If-Modified-Since/.test(HLZ) && /rep\.status === 304\) return \{ statut: "aJour" \}/.test(HLZ));
  t("📦 copie rangée seulement après un téléchargement FRAIS (jamais réécrite depuis elle-même)",
    /storeBlob: frais && \(!!plan\.storedBlob \|\| window\.ktaMemoriserPlanActif\(\)\)/.test(HLZ) &&
    /fromStoredBlob: !frais/.test(HLZ));
  t("📦 après ouverture : il RESTE un plan « server » (l'index peut le retirer), validateurs gardés",
    /type: _estExt \? "ext" : \(_estZipSrv \? "server" : "local"\)/.test(MZ) && /entry\.zipEtag = meta\.zipEtag/.test(MZ));
  t("📦 ligne : exclu de PlanOffline (cache SW), état = sa copie gardée",
    /p\.type === "server" && !p\.zip;/.test(HLZ) && /_telechargerZipIndex\(p, null, true, "HEAD", ctl/.test(HLZ) && /_sondesZip\[p\.id\]/.test(HLZ));
  t("📦 SW : les .zip passent au réseau, jamais rangés dans CACHE_NAME",
    /if \(\/\\\.zip\(\\\?\|\$\)\/i\.test\(reqUrl\)\) return;/.test(SWZ));
  t("📦 changement de plan, liaisons, profil, aperçu OSM : pas de fetch de dossier pour un plan ZIP",
    /plan\.type === "server" && !plan\.zip\) \{/.test(lire("js/interface.js")) &&
    (lire("js/interPlanLinks.js").match(/plan\.path && !plan\.zip/g) || []).length === 2 &&
    /path: plan\.zip \? null/.test(lire("js/homeProfile.js")) &&
    /_plan\.type === "server" && !_plan\.zip/.test(lire("js/osmHomePreview.js")));
}

// ───────── 5. ON EXÉCUTE l'énumération des tuiles ─────────
// tiling.js chargé dans un vm, sur un cas dont le nombre est calculable à la main.
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
    // 960 (z=0) + 240 + 60 + 15 = 1275 : au-delà du plafond du cache principal.
    t("🩸 grille complète des 4 niveaux : 1275 tuiles (z=0 en fait 960 à lui seul)",
      urls.length === 1275);
    t("racine dérivée du dossier du baseImage",
      urls[0] === "data/toto/data/tiles/z0/x0_y-1.jpg");
    t("le dernier niveau est bien z=-3",
      urls[urls.length - 1].indexOf("/z-3/") >= 0);
    const local = f({ plan: { baseImage: "blob:http://x/abc", imageWidth: 4096, imageHeight: 4096 },
                      tiling: pc.tiling });
    t("🩸 plan LOCAL (blob:) → aucune URL (rien à pré-cacher, tout est déjà dans le ZIP)",
      Array.isArray(local) && local.length === 0);
  }
}

// ───────── 7. FRAÎCHEUR : SAVOIR QUE LE SERVEUR A CHANGÉ ─────────
// 🩸 Le cache dédié n'est purgé par RIEN (ni éviction, ni bump) : sans sonde, il sert du périmé
// sans le dire. Le champ `version` (saisi à la main, il dérive) ne suffit pas et le plan-config
// n'a pas d'horodatage : le seul signal fiable est HTTP (ETag / Last-Modified).
{
  t("🔎 le SW laisse passer les sondes en RÉSEAU SEUL",
    /_ktacheck=1/.test(SWC) && SWC.indexOf("event.respondWith(") >= 0);
  t("🩸 …et la sortie anticipée précède la branche cache-first (sinon la sonde " +
    "serait servie du cache et répondrait toujours « rien n'a changé »)",
    SWC.indexOf("_ktacheck") < SWC.indexOf("caches.open(CACHE_NAME).then(function(c)"));
  t("🩸 la sonde n'est JAMAIS mise en cache (sinon N entrées jetables par vérification)",
    (function () {
      const i = SWC.indexOf("_ktacheck");
      const j = SWC.indexOf("return;", i);
      // 🩸 On refuse TOUTE écriture (`.put(`) : viser `cache.put` laisserait passer `c.put(...)`.
      return i >= 0 && j > i && SWC.slice(i, j).indexOf(".put(") < 0;
    })());
  t("🔎 les validateurs HTTP sont retenus au téléchargement",
    POC.indexOf("validateurs[u] = { etag:") >= 0 && POC.indexOf("version: 3") >= 0);
  t("🔎 une fonction de vérification existe et est exposée",
    /async function verifierMaj/.test(POC) && POC.indexOf("verifierMaj: verifierMaj") >= 0);
  t("🩸 les TUILES sont exclues des sondes (elles dérivent de l'image, qui l'est)",
    POC.indexOf("racineTuiles") >= 0 && POC.indexOf("u.indexOf(racine") >= 0);
  t("🔎 les requêtes sont CONDITIONNELLES (304 = corps vide)",
    POC.indexOf("If-None-Match") >= 0 && POC.indexOf("If-Modified-Since") >= 0);
  t("🩸 aucune sonde aboutie → « inconnu », jamais « à jour » sans preuve",
    /verifies === 0\) return \{ etat: "inconnu"/.test(POC));
  t("🔎 l'UI affiche les trois verdicts",
    HLC.indexOf("majDispo") >= 0 && HLC.indexOf("majAjour") >= 0 && HLC.indexOf("majInconnu") >= 0);
}


// ───────── 8. ON EXÉCUTE verifierMaj() ─────────
// planOffline.js dans un vm (`caches`, `fetch` stubés) : quatre cas, dont deux où elle doit refuser
// de conclure.
async function _verifierAvec(manifeste, reponses) {
  const vm2 = require("vm");
  const win = { console: { log: () => {}, warn: () => {} }, navigator: {}, location: { href: "http://x/" } };
  win.window = win;
  win._sondes = [];
  const faux = {
    keys: async () => [],
    match: async (u) => (String(u).indexOf("__kta_offline.json") >= 0 && manifeste)
      ? { json: async () => manifeste } : null
  };
  win.caches = { keys: async () => ["myktamap-plan-p1"], open: async () => faux };
  win.fetch = async function (u, opts) {
    win._sondes.push({ url: String(u), headers: (opts && opts.headers) || {} });
    const nu = String(u).split("?")[0];
    if (reponses[nu] === "boom") throw new Error("hors-ligne");
    return { status: reponses[nu] || 304 };
  };
  const ctx = vm2.createContext(win);
  vm2.runInContext("var window = this; var caches = this.caches; var fetch = this.fetch;" +
                   "var navigator = this.navigator;" + fs.readFileSync("js/planOffline.js", "utf8"), ctx);
  const r = await win.PlanOffline.verifierMaj({ id: "p1", path: "data/p" });
  return { r: r, sondes: win._sondes };
}

const MAN3 = {
  version: 3, planId: "p1",
  urls: ["data/p/plan-config.json", "data/p/data/img.png",
         "data/p/data/tiles/z0/x0_y-1.jpg", "data/p/data/tiles/z0/x1_y-1.jpg"],
  manquants: [],
  validateurs: {
    "data/p/plan-config.json":         { etag: "W/a1", lm: null },
    "data/p/data/img.png":             { etag: null, lm: "Mon, 01 Jan 2026 00:00:00 GMT" },
    "data/p/data/tiles/z0/x0_y-1.jpg": { etag: "W/c3", lm: null },
    "data/p/data/tiles/z0/x1_y-1.jpg": { etag: "W/d4", lm: null }
  },
  racineTuiles: "data/p/data/tiles", date: "2026-09-07T10:00:00.000Z"
};

async function _fraicheur() {
  try {
    const r = await _listerUrlsAvec({
      plan: { baseImage: "data/p/data/img.png", tiledV2: true, imageWidth: 4096, imageHeight: 4096 },
      tiling: { version: 2, tileSize: 512, minNativeZoom: -3, maxNativeZoom: 0 },
      dataLayers: [{ id: "puits", file: "data/p/data/puits.json" }],
      icons: { perso: "data/p/icon/x.png", appli: "icon/house.png" }
    });
    t("🩸 listerUrls s'EXÉCUTE sans ReferenceError (zone morte temporelle)", true);
    t("🔗 la racine SONDÉE est celle qui sert à lister les tuiles",
      r.racineTuiles === "data/p/data/tiles" &&
      r.urls.indexOf("data/p/data/tiles/z0/x0_y-1.jpg") >= 0);
    t("📄 le plan-config, l'image et les calques sont dans la liste",
      r.urls.indexOf("data/p/plan-config.json") >= 0 &&
      r.urls.indexOf("data/p/data/img.png") >= 0 &&
      r.urls.indexOf("data/p/data/puits.json") >= 0);
    t("🎨 seule l'icône PROPRE au plan est listée (celle de l'app vit à la racine)",
      r.urls.indexOf("data/p/icon/x.png") >= 0 && r.urls.indexOf("icon/house.png") < 0);
  } catch (e) {
    t("🩸 listerUrls s'EXÉCUTE sans ReferenceError — " + (e && e.message), false);
  }
  try {
    const o = await Promise.all([
      _verifierAvec(MAN3, {}),
      _verifierAvec(MAN3, { "data/p/plan-config.json": 200 }),
      _verifierAvec(MAN3, { "data/p/plan-config.json": "boom", "data/p/data/img.png": "boom" }),
      _verifierAvec({ version: 2, planId: "p1", urls: MAN3.urls, manquants: [] }, {})
    ]);
    t("tout en 304 → à jour", o[0].r.etat === "ajour" && o[0].r.verifies === 2);
    t("🩸 les TUILES ne sont pas sondées (2 sondes pour 4 fichiers)", o[0].sondes.length === 2);
    t("🩸 chaque sonde porte le marqueur qui contourne le cache du SW",
      o[0].sondes.every(function (s) { return s.url.indexOf("_ktacheck=1") >= 0; }));
    t("🔎 les en-têtes conditionnels sont bien envoyés",
      o[0].sondes.some(function (s) { return s.headers["If-None-Match"]; }) &&
      o[0].sondes.some(function (s) { return s.headers["If-Modified-Since"]; }));
    t("un 200 → mise à jour disponible, et le fichier est NOMMÉ",
      o[1].r.etat === "maj" && o[1].r.changes.length === 1 &&
      o[1].r.changes[0] === "data/p/plan-config.json");
    t("🩸 toutes les sondes échouent → « inconnu », JAMAIS « à jour »", o[2].r.etat === "inconnu");
    t("🩸 manifeste sans validateurs (v2) → « inconnu », pas de faux « à jour »", o[3].r.etat === "inconnu");
  } catch (e) {
    t("§8 verifierMaj s'exécute sans planter — " + (e && e.message), false);
  }
}



// ───────── 11. LE PLAN DE DÉMO N'EST PAS PRÉ-CACHÉ ─────────
// ~2 Mo téléchargés à l'install par tous ; et surtout 🩸 pré-caché, il est INÉVINÇABLE
// (`_staticAssetUrls`) : un test hors-ligne fait avec lui ment, alors qu'un plan utilisateur
// peut s'évincer. `data/index.json` reste pré-caché (config d'instance, minuscule).
{
  const iList = SW.indexOf("const ASSETS_TO_CACHE = [");
  const fList = SW.indexOf("];", iList);
  const liste = (iList >= 0 && fList > iList) ? SW.slice(iList, fList) : "";
  t("la liste de pré-cache est trouvable", liste.length > 0);
  t("🩸 aucun fichier du plan de démo n'est pré-caché", liste.indexOf("./data/test/") < 0);
  t("🧹 …et plus largement, aucun fichier de plan (`data/<plan>/`)",
    (liste.match(/"\.\/data\/[^"]+\/[^"]+"/g) || []).length === 0);
  t("data/index.json reste pré-caché (config d'instance, minuscule)",
    liste.indexOf("./data/index.json") >= 0);
}


// ───────── 12. LE BOUTON HORS-LIGNE SUR LA LIGNE DE PLAN ─────────
// 🩸 Mêmes règles que la fiche Infos : l'état vient du CACHE RÉEL et le bouton naît `hidden`
// (tant que l'état n'est pas lu, il n'existe pas) ; un cache purgé le repasse en « télécharger ».
{
  const HL2 = sansCommentaires(fs.readFileSync("js/homeLoader.js", "utf8"));
  // Plans SERVEUR, et ☁️ d'une installation reliée si une extension sait les garder
  // (prise plans.horsLigne) ; jamais un plan local.
  t("💾 le bouton n'est rendu que pour les plans SERVEUR (et ☁️ si une extension sait les garder)",
    /plan\.type === "server" \|\| \(plan\.type === "ext" && window\.KtaExtensions &&\s*window\.KtaExtensions\.horsLigneExtensionDisponible\(\)\) \? `<button class="plan-row-btn kta-plan-row-dl"/.test(HL2));
  t("🩸 …et il naît CACHÉ (pas de bouton fantôme avant de connaître l'état)",
    /kta-plan-row-dl" data-off="\?" hidden/.test(HL2));
  t("💾 les quatre états sont câblés",
    /absent:\s*\{/.test(HL2) && /incomplet:\s*\{/.test(HL2) &&
    /partiel:\s*\{/.test(HL2) && /complet:\s*\{/.test(HL2));
  t("🩸 plan complet → le bouton devient « mettre à jour » (↻), pas un second téléchargement",
    /complet:\s*\{ txt: "↻",\s*cle: "home\.plans\.offline\.rowUpdate"/.test(HL2));
  t("🩸 l'état est RELU après chaque rendu de liste (jamais mémorisé)",
    HL2.indexOf("_rafraichirBoutonsHorsLigne();") >= 0 &&
    /etats = await window\.PlanOffline\.statuts\(ids\)/.test(HL2));
  t("⚡ un SEUL caches.keys() pour toute la liste",
    /async function statuts\(planIds\)/.test(sansCommentaires(fs.readFileSync("js/planOffline.js", "utf8"))));
  t("🩸 le clic ne déclenche PAS le chargement du plan (stopPropagation)",
    /ev\.stopPropagation\(\);/.test(HL2) && /_lancerHorsLigneLigne\(id, dlBtn\)/.test(HL2));
  // 🩸 La boucle ne lie que `id` : référencer `plan` serait une ReferenceError au clic.
  t("🩸 le handler passe l'`id` (seule variable liée par la boucle), pas `plan`",
    HL2.indexOf("_lancerHorsLigneLigne(plan, dlBtn)") < 0);
  t("🛟 après téléchargement, on RELIT le cache au lieu de croire le résultat",
    /_rafraichirBoutonsHorsLigne\(\);[\s\S]{0,40}\}/.test(HL2));
}

// ───────── 9. 🩸 ON APPELLE LE HANDLER `fetch` DU SERVICE WORKER ─────────
// Une branche insérée avant `const reqUrl = …` = zone morte temporelle : ReferenceError à CHAQUE
// requête, le handler meurt (plus de cache ni de hors-ligne). ⚠️ `node -c` et les assertions de
// chaîne ne voient rien d'une TDZ : seul l'exécuter la voit.
{
  const vm4 = require("vm");
  const self0 = {};
  const handlers = {};
  const noop = function () {};
  self0.self = self0;
  self0.addEventListener = function (t, h) { handlers[t] = h; };
  self0.skipWaiting = noop;
  self0.clients = { claim: noop, matchAll: async () => [] };
  self0.console = { log: noop, warn: noop, error: noop };
  self0.location = { origin: "http://x", href: "http://x/" };
  self0.caches = { open: async () => ({ match: async () => null, put: async () => {},
                                        keys: async () => [], add: async () => {}, delete: async () => true }),
                   keys: async () => [], match: async () => null, delete: async () => true };
  self0.fetch = async function () { return { ok: true, status: 200, type: "basic", clone: function () { return this; } }; };
  self0.Response = function (body, init) { Object.assign(this, init || {}); this.body = body; };
  self0.Request  = function (url, init) { this.url = url; Object.assign(this, init || {}); };
  self0.URL = URL;
  self0.setTimeout = setTimeout;
  self0.indexedDB = null;

  let chargement = null;
  try {
    const ctx = vm4.createContext(self0);
    vm4.runInContext("var self = this; var caches = this.caches; var fetch = this.fetch;" +
                     "var Response = this.Response; var Request = this.Request;" +
                     "var location = this.location; var console = this.console;" +
                     "var setTimeout = this.setTimeout; var URL = this.URL;" +
                     fs.readFileSync("sw.js", "utf8"), ctx);
  } catch (e) { chargement = e; }
  t("sw.js se charge dans un vm" + (chargement ? " — " + chargement.message : ""), !chargement);
  t("il enregistre bien un handler `fetch`", typeof handlers.fetch === "function");

  if (typeof handlers.fetch === "function") {
    // Chaque URL emprunte une BRANCHE différente du handler.
    const cas = [
      ["sonde de fraîcheur",   "http://x/data/p/plan-config.json?_ktacheck=1"],
      ["page de reset",        "http://x/killsw.html"],
      ["index serveur",        "http://x/data/index.json"],
      ["dico i18n",            "http://x/lang/fr.json"],
      ["doc applicative",      "http://x/docs/applications/README_USER.md"],
      ["asset ordinaire",      "http://x/js/map.js"],
      ["tuile OSM",            "https://a.tile.openstreetmap.org/12/2048/1362.png"]
    ];
    cas.forEach(function (c) {
      let err = null;
      try {
        handlers.fetch({
          request: { url: c[1], method: "GET", destination: "", headers: { get: () => null } },
          respondWith: function (p) { if (p && typeof p.catch === "function") p.catch(function () {}); },
          waitUntil: noop
        });
      } catch (e) { err = e; }
      t("🩸 le handler fetch survit à : " + c[0] + (err ? " — " + err.name + " : " + err.message : ""), !err);
    });
  }
}


// ───────── 10. 🩸 ON EXÉCUTE listerUrls() ─────────
// Même piège TDZ (un `const` utilisé avant sa déclaration) : seule l'exécution l'attrape.
async function _listerUrlsAvec(planConfig) {
  const vm5 = require("vm");
  const win = { console: { log: () => {}, warn: () => {} }, navigator: {}, location: { href: "http://x/" } };
  win.window = win;
  win.caches = { keys: async () => [], open: async () => ({ keys: async () => [], match: async () => null }) };
  win.fetch = async function () { return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(planConfig)) }; };
  win.resolveServerPaths = function (c) { return c; };
  win.resoudreIconesPlanServeur = async function (c) { return c; };
  win.ktaResoudreRacineTuiles = async function () { return "data/p/data/tiles"; };
  win.ktaTuilesV2Urls = function (c, racine) { return [racine + "/z0/x0_y-1.jpg"]; };
  const ctx = vm5.createContext(win);
  vm5.runInContext("var window = this; var caches = this.caches; var fetch = this.fetch;" +
                   "var navigator = this.navigator;" + fs.readFileSync("js/planOffline.js", "utf8"), ctx);
  return win.PlanOffline.listerUrls({ id: "p1", path: "data/p" });
}


// ───────── 6. TROIS ÉTATS : ON EXÉCUTE statut() SUR UN FAUX CACHE ─────────
// 🩸 Un fichier déclaré mais absent du serveur donne « partiel » (nommé), jamais « incomplet » à
// vie (retéléchargement sans fin d'un fichier qui n'existe pas).
// 🩸 `async` OBLIGATOIRE : un throw de vm.runInContext doit devenir une REJECTION, pas un crash
// synchrone hors du Promise.all (un crash n'est pas un échec annoncé).
async function _statutAvecCache(entrees, manifeste) {
  const win = { console: { log: () => {}, warn: () => {} }, navigator: {}, location: { href: "http://x/" } };
  win.window = win;
  const faux = {
    keys: async () => entrees.map(u => ({ url: "http://x/" + u })),
    match: async (req) => (String(req.url).indexOf("__kta_offline.json") >= 0 && manifeste)
      ? { json: async () => manifeste } : null
  };
  win.caches = {
    keys: async () => (entrees.length ? ["myktamap-plan-p1"] : []),
    open: async () => faux
  };
  const ctx = vm.createContext(win);
  vm.runInContext("var window = this; var caches = this.caches; var navigator = this.navigator;" +
                  fs.readFileSync("js/planOffline.js", "utf8"), ctx);
  return win.PlanOffline.statut("p1");
}

const URLS10 = Array.from({ length: 10 }, (_, i) => "data/p/f" + i + ".json");
const _fichiers = n => URLS10.slice(0, n).concat(["data/p/__kta_offline.json"]);

Promise.all([
  _statutAvecCache([], null),
  _statutAvecCache(_fichiers(10), { version: 2, urls: URLS10, manquants: [], date: "2026-09-07" }),
  _statutAvecCache(_fichiers(9),  { version: 2, urls: URLS10, manquants: [URLS10[9]], date: "2026-09-07" }),
  _statutAvecCache(_fichiers(5),  { version: 2, urls: URLS10, manquants: [], date: "2026-09-07" }),
  _statutAvecCache(_fichiers(9),  { version: 1, urls: URLS10, date: "2026-09-07" })
]).then(function (r) {
  t("aucun cache → absent", r[0].etat === "absent");
  t("tout présent → complet", r[1].etat === "complet");
  t("🩸 9/10 avec le 10e ABSENT DU SERVEUR → « partiel », plus « incomplet » à vie",
    r[2].etat === "partiel" && r[2].manquants.length === 1);
  t("🩸 …et il NOMME le fichier manquant", r[2].manquants[0] === URLS10[9]);
  t("téléchargement réellement interrompu → incomplet", r[3].etat === "incomplet");
  t("manifeste v1 (sans « manquants ») → ancien calcul, jamais de faux « complet »",
    r[4].etat === "incomplet");
}).catch(function (e) {
  t("§6 statut() s'exécute sans planter — " + (e && e.message), false);
}).then(_fraicheur).then(function () {
  console.log(ko === 0 ? "\n🎉 hors-ligne : un plan serveur se télécharge en entier et l'état ne ment pas"
                       : "\n⚠️ " + ko + " echec(s)");
  process.exit(ko === 0 ? 0 : 1);
});
