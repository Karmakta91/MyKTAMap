#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// ⚙️ check-reglages-immediats.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// L4 de l'audit ergonomie (décision KARMA 14/09/2026) : la modale ⚙️ Réglages
// du mode carte n'a plus de bouton « Appliquer » — chaque champ s'enregistre
// à la modification, la portée de chaque groupe est affichée, le reset ne
// touche que le plan, wake lock et vocal ne se cachent plus.
//
// 🩸 CE QUI RÉGRESSE SANS BRUIT :
//   1. Un champ qui redevient « lu au bouton » : l'utilisateur tape, ferme,
//      rien n'est gardé — exactement le défaut d'avant, invisible.
//   2. Une borne qui glisse dans `_CFG_BORNES` (ou un `>=` qui devient `>`) :
//      `setPlanTracking` refuse SEC hors PODO_BORNES → le champ passe vert et
//      rien n'est écrit. On EXÉCUTE le validateur extrait du fichier.
//   3. Le reset qui recommence à écrire `app_user_prefs` depuis un plan.
//   4. Le géoref qui perd ses handlers (sous-modale rendue sans les poser).
// Usage : node scripts/check-reglages-immediats.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

const UIC = lire("js/interfaceConfig.js");

// ---------- 1. Le validateur, exécuté ----------
{
  const i = UIC.indexOf("const _CFG_BORNES = {");
  const j = UIC.indexOf("window._ktaCfgValider = _cfgValider;", i);
  const src = (i >= 0 && j > i) ? UIC.slice(i, j + "window._ktaCfgValider = _cfgValider;".length) : "";
  t("le validateur _cfgValider / _CFG_BORNES est extractible", src.length > 0);
  if (src) {
    const sb = { window: {} };
    let err = null;
    try { vm.runInNewContext(src, sb, { filename: "cfg.valider.js" }); } catch (e) { err = e.message; }
    t("🩸 …et s'exécute sans erreur" + (err ? " — " + err : ""), !err);
    const V = sb.window._ktaCfgValider;
    if (typeof V === "function") {
      const ok = (id, v) => V(id, v).ok === true, ko = (id, v) => V(id, v).ok === false;
      t("🩸 podomètre : les bornes sont celles de PODO_BORNES (config.js) — pas [0;1.5] / [10;30] / [300;3000] → refus",
        ok("cfg_stepLength", "0.7") && ok("cfg_stepLength", "1.5") && ko("cfg_stepLength", "1.6") &&
        ok("cfg_stepThreshold", "10") && ok("cfg_stepThreshold", "30") && ko("cfg_stepThreshold", "9.9") && ko("cfg_stepThreshold", "31") &&
        ok("cfg_stepCooldown", "300") && ok("cfg_stepCooldown", "3000") && ko("cfg_stepCooldown", "299") && ko("cfg_stepCooldown", "3001"));
      t("🩸 échelle : strictement > 0, jamais de clamp (0 et négatif refusés, 0.1 accepté)",
        ko("cfg_scale", "0") && ko("cfg_scale", "-3") && ok("cfg_scale", "0.1") && ok("cfg_scale", "4.9"));
      t("🩸 départ X/Y : entiers ≥ 0 ; vide et NaN refusés (ne jamais écrire NaN — bug v1.28.0)",
        ok("cfg_startX", "345") && V("cfg_startX", "345.7").v === 345 && ko("cfg_startX", "") && ko("cfg_startY", "abc") && ko("cfg_startY", "-1"));
      t("nav intelligente : rayon [1;50], poids du cap [0;5]",
        ok("cfg_smartNavRadius", "1") && ko("cfg_smartNavRadius", "0.5") && ko("cfg_smartNavRadius", "51") &&
        ok("cfg_smartNavHeading", "0") && ok("cfg_smartNavHeading", "5") && ko("cfg_smartNavHeading", "5.1"));
      t("un id inconnu est refusé (pas d'écriture par erreur)", ko("cfg_inconnu", "1"));
      t("le résultat porte les bornes (pour le message « hors bornes »)", V("cfg_stepThreshold", "99").min === 10 && V("cfg_stepThreshold", "99").max === 30);
    }
  }
}

// ---------- 2. Plus de bouton Appliquer, tout est câblé ----------
{
  t("🩸 plus aucun bouton « Appliquer » dans le gabarit", !/onclick="appliquerConfig\(\)"/.test(UIC) && !/config\.actions\.apply/.test(UIC));
  t("🩸 appliquerConfig et _validerReglagesTracking n'existent plus", !/function appliquerConfig\(/.test(UIC) && !/function _validerReglagesTracking\(/.test(UIC) && !/window\.appliquerConfig = /.test(UIC));
  const b = UIC.slice(UIC.indexOf("function _bindReglagesImmediats()"), UIC.indexOf("// ── Fermeture"));
  t("_bindReglagesImmediats est trouvable", b.length > 0);
  // 🩸 On vérifie la FORME du câblage (l'appel `on(…)` ou la liste passée au
  // forEach), pas la simple présence de l'id : `_cfgValider("cfg_scale", …)`
  // cite l'id même quand le champ n'est plus écouté (sabotage S2).
  const LIENS = {
    cfg_scale:           'on("cfg_scale", function (el)',
    cfg_startX:          '["cfg_startX", "cfg_startY"].forEach',
    cfg_startY:          '["cfg_startX", "cfg_startY"].forEach',
    cfg_stepLength:      '[["cfg_stepLength", "stepLength"], ["cfg_stepThreshold", "stepThreshold"], ["cfg_stepCooldown", "stepCooldown"]].forEach',
    cfg_stepThreshold:   '["cfg_stepThreshold", "stepThreshold"]',
    cfg_stepCooldown:    '["cfg_stepCooldown", "stepCooldown"]',
    cfg_smartNav:        'on("cfg_smartNav", function (el)',
    cfg_smartNavRadius:  '[["cfg_smartNavRadius", "smartNavRadiusM"], ["cfg_smartNavHeading", "smartNavHeadingWeight"]].forEach',
    cfg_smartNavHeading: '["cfg_smartNavHeading", "smartNavHeadingWeight"]'
  };
  Object.keys(LIENS).forEach(function (id) {
    t("🩸 champ « " + id + " » câblé à l'application immédiate", b.indexOf(LIENS[id]) >= 0);
  });
  t("🩸 les écrivains par plan sont appelés (setPlanScale / setPlanTracking / setPlanSmartNav)",
    /window\.setPlanScale\(null, r\.v\)/.test(b) && /_cfgAppliquerPodometre\(\)/.test(b) && /window\.setPlanSmartNav\(null, /.test(b));
  const pod = UIC.slice(UIC.indexOf("function _cfgAppliquerPodometre()"), UIC.indexOf("function _cfgAppliquerPodometre()") + 400);
  t("🩸 podomètre : les 3 réglages partent ENSEMBLE à setPlanTracking", /stepLength:\s*APP_CONFIG\.stepLength/.test(pod) && /stepThreshold:\s*APP_CONFIG\.stepThreshold/.test(pod) && /stepCooldown:\s*APP_CONFIG\.stepCooldown/.test(pod));
  const dep = UIC.slice(UIC.indexOf("function _cfgAppliquerDepart()"), UIC.indexOf("function _cfgFlushDepart()"));
  t("🩸 départ : le suivi n'est replacé QUE si la paire X/Y a changé (v1.28.0 conservé)", /APP_CONFIG\.startX === rx\.v && APP_CONFIG\.startY === ry\.v\) return;/.test(dep) && /resetTrackingPosition\(\)/.test(dep));
  t("départ : débouncé puis vidé à la fermeture", /setTimeout\(function \(\) \{ if \(_cfgDepartFn\) _cfgDepartFn\(\); \}, 600\)/.test(dep) && /function _cfgFermer\(\) \{\n\s*_cfgFlushDepart\(\);/.test(UIC));
  t("les pickers du départ émettent un change (sinon la valeur posée n'est pas enregistrée)", (UIC.match(/_cfgSignalerChangement\(xEl, yEl\);/g) || []).length >= 2);
  const IM = lire("js/interfaceMaintenance.js");
  t("🩸 le calibrage d'échelle émet un change sur #cfg_scale", /champScale\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/.test(IM));
}

// ---------- 3. Fermeture ----------
{
  t("Échap ferme la modale (et d'abord la sous-modale géoref)", /e\.key !== "Escape"\) return;/.test(UIC) && /kta-cfg-georef-modal"\);\n\s*if \(sub\)/.test(UIC));
  t("croix, bouton Fermer et clic hors modale passent par _cfgFermer", /id="kta-cfg-fermer"/.test(UIC) && /croix\.addEventListener\("click", _cfgFermer\)/.test(UIC) && /if \(e\.target === modal\) _cfgFermer\(\)/.test(UIC));
}

// ---------- 4. Portée, groupes, globaux, géoref ----------
{
  t("🩸 8 groupes ouverts par _cfgGroupeDebut, badges de portée présents", (UIC.match(/\$\{_cfgGroupeDebut\("config\.group\./g) || []).length === 8 && /config\.scope\.badgePlan/.test(UIC) && /config\.scope\.badgeGlobal/.test(UIC));
  t("🩸 …et 8 fermés par _cfgGroupeFin (un de moins : un groupe avale le suivant)", (UIC.match(/\$\{_cfgGroupeFin\(\)\}/g) || []).length === 8);
  t("groupes repliables, choix mémorisé", /_bindCfgGroupes\(modal\)/.test(UIC) && /myktamap_cfg_groupes_v1/.test(UIC));
  t("les globaux de l'accueil sont LUS ici (lecture seule) avec le chemin pour les changer", /_renderCfgGlobauxLectureSeule\(\)/.test(UIC) && /_retourLoaderAvecConfirm/.test(UIC));
  t("🩸 géoref : sous-modale ENFANT de la modale, handlers posés à l'ouverture", /parent\.appendChild\(sub\);\n\s*_bindCfgGeorefHandlers\(\);/.test(UIC) && /\$\{_renderCfgGeorefLanceur\(\)\}/.test(UIC) && !/\$\{_renderCfgGeorefSection\(\)\}/.test(UIC));
}

// ---------- 5. Reset par plan, Q61, code mort ----------
{
  // Le commentaire de la fonction CITE l'ancien code fautif : on ne juge que le code.
  const r = UIC.slice(UIC.indexOf("function _resetConfigExecuter()"), UIC.indexOf("function _resetConfigExecuter()") + 2200)
               .split("\n").filter(function (l) { return !/^\s*\/\//.test(l); }).join("\n");
  t("🩸 reset : plus aucune écriture globale (sauvegarderPrefsUtilisateur) ni Object.assign(APP_CONFIG, DEFAULT_CONFIG)", !/sauvegarderPrefsUtilisateur/.test(r) && !/Object\.assign\(APP_CONFIG, DEFAULT_CONFIG\)/.test(r));
  t("reset : prefs du plan retirées, Nord remis, suivi replacé, confirmation en amont (ktaConfirm dans resetConfig)",
    /localStorage\.removeItem\("myktamap_plan_prefs_" \+ pid\)/.test(r) && /resetPlanNorthOffset\(null\)/.test(r) && /resetTrackingPosition\(\)/.test(r) &&
    /function resetConfig\(\) \{[\s\S]{0,400}ktaConfirm\(/.test(UIC));
  t("🩸 Q61 : wake lock ET vocal non supportés passent par ktaCapteurRefuse avec la raison « navigateur »", (UIC.match(/_capteurRefuse\((wlRow|voiceRow), \w+, document\.getElementById\("cfg_(wake_lock|voice)_hint"\), "config\.capteurs\.nonSupporte"\)/g) || []).length === 2);
  const U = lire("js/utils.js");
  t("utils : ktaCapteurRefuse accepte une clé de raison", /window\.ktaCapteurRefuse = function\(row, cb, hintEl, cleRaison\)/.test(U) && /cleRaison \|\| \(window\.ktaEstIos\(\)/.test(U));
  t("🩸 Q60 : code mort retiré (multi-niveau, snapDrawPx, cible géoref jamais lue)", !/function _renderMultiLevelSection/.test(UIC) && !/id="cfg_multiLevel"/.test(UIC) && !/cfg_snapDrawPx/.test(UIC) && !/_cfgGeorefClickTarget/.test(UIC));
  const PU = lire("js/perfUltra.js");
  t("🩸 perfUltra : les toggles hors ULTRA sont RELUS du stockage et acceptés par set()", /HORS_ULTRA\.forEach\(function\(k\) \{\n\s*if \(typeof parsed\[k\] === "boolean"\) out\[k\] = parsed\[k\];/.test(PU) && /TOGGLES\.indexOf\(key\) < 0 && HORS_ULTRA\.indexOf\(key\) < 0/.test(PU));
  t("perf : la case « tous les niveaux » est rendue et câblée", /cfg_perf_tousNiveaux/.test(UIC) && /"cfg_perf_tousNiveaux":\s*"tousNiveaux"/.test(UIC));
}

// ---------- 6. i18n et docs ×3 ----------
{
  const F = { fr: "README_USER.md", en: "README_USER.en.md", es: "README_USER.es.md" };
  const H = { fr: ["### ✓ Tout s'enregistre dès la modification", "🌐 Ouvrir le géoréférencement…", "| **Réglages** | ⚙️ |"],
              en: ["### ✓ Everything is saved as you change it", "🌐 Open georeferencing…", "| **Settings** | ⚙️ |"],
              es: ["### ✓ Todo se guarda en cuanto lo cambias", "🌐 Abrir la georreferenciación…", "| **Ajustes** | ⚙️ |"] };
  for (const l of ["fr", "en", "es"]) {
    const d = lire("docs/applications/" + F[l]);
    t("📖 " + l + " : la doc décrit l'écran immédiat, la sous-modale géoref et nomme le groupe", H[l].every(h => d.includes(h)));
    t("📖 " + l + " : plus de « Logs détaillés » promis dans ⚙️ Réglages", !/⚙️ (Réglages|Settings|Ajustes) → \*\*🐛/.test(d));
    const dico = JSON.parse(lire("lang/" + l + ".json"));
    t("🌍 " + l + " : clés nouvelles présentes, clés mortes retirées",
      ["config.actions.close", "config.scope.badgePlan", "config.scope.badgeGlobal", "config.globaux.titre", "config.capteurs.nonSupporte", "config.champ.horsBornes", "config.georef.openBtn", "config.confirm.resetFait", "config.perfultra.tousNiveaux.label"].every(k => typeof dico[k] === "string") &&
      ["config.actions.apply", "config.tracking.horsLimites", "config.mlvl.titre", "config.mlvl.toggle.label", "home.perf.tousNiveauxLabel"].every(k => dico[k] === undefined));
  }
  const fr = JSON.parse(lire("lang/fr.json"));
  t("🌍 T6 : le groupe de la barre s'appelle « Réglages », comme la modale", fr["ui.group.settings"] === "Réglages" && fr["config.titre"] === "⚙️ Réglages");
}

console.log("");
if (echecs) { console.log("💥 réglages immédiats : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 réglages immédiats : tout s'enregistre à la saisie, la portée est dite, le reset reste au plan");
