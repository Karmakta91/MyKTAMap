#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔒 check-kiosque-serveur.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LE BUG (KARMA, 07/09/2026) :
//
//   « en mode serveur, avec générateur et import désactivés, je peux importer
//     un profil, et donc récupérer tous les ZIP ; et le pire, c'est que si ce
//     profil a une préférence de mode serveur désactivé, ça casse tout. »
//
// 🩸 CE QUE ÇA COÛTAIT, EN DEUX TEMPS.
//   1. `serverPlansOnly` masque la dropzone — mais l'import de PROFIL restaure
//      les archives ZIP. La restriction se contournait sans le vouloir, par la
//      porte d'à côté.
//   2. Pire : un profil transporte `myktamap_loader_show_server_plans`. Importé
//      sur un kiosque avec la valeur « false », il masque les plans serveur…
//      dont la case de réglage est justement CACHÉE par le mode kiosque.
//      Résultat : accueil vide, aucun plan, aucun réglage pour s'en sortir.
//      Un flag qui cache son propre remède est un piège.
//
// LA RÈGLE : **un mode qui interdit quelque chose doit l'interdire au goulot,
// pas sur un bouton.** Masquer une commande ne ferme pas une porte : la modale
// d'import se déclenche depuis au moins deux endroits.
//
// COMMENT ON CONTRÔLE : on EXÉCUTE les prédicats extraits des vrais fichiers,
// dans les deux états (kiosque / pas kiosque). Un `grep` dirait « le test est
// là » sans jamais voir qu'il est inversé.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const MAIN = fs.readFileSync("js/main.js", "utf8");
const PEI  = fs.readFileSync("js/profileExportImport.js", "utf8");
const HPR  = fs.readFileSync("js/homeProfile.js", "utf8");

// ═════════ 1. LE PRÉDICAT, EXÉCUTÉ DANS LES DEUX ÉTATS ═════════
// 🩸 Une condition inversée passerait tous les tests textuels du monde.
{
  const m = MAIN.match(/window\.ktaKiosqueServeurSeul = function\(\) \{[\s\S]*?\n\};/);
  t("🔒 le prédicat kiosque existe en un point unique (window.ktaKiosqueServeurSeul)", !!m);
  if (m) {
    const essai = (cfg) => {
      const sb = { window: { KIOSK_CONFIG: cfg } };
      vm.runInNewContext(m[0], sb, { filename: "main.kiosque.js" });
      return sb.window.ktaKiosqueServeurSeul();
    };
    t("🔒 vrai quand serverPlansOnly vaut true", essai({ serverPlansOnly: true }) === true);
    t("🔒 faux quand serverPlansOnly vaut false", essai({ serverPlansOnly: false }) === false);
    t("🔒 faux hors kiosque (pas de config d'instance)", essai(null) === false);
    t("🩸 faux sur une valeur approchante — pas de coercition (\"true\" n'est pas true)",
      essai({ serverPlansOnly: "true" }) === false);
  }
}

// ═════════ 2. LES DEUX PRÉFÉRENCES QUI VIDENT UN KIOSQUE ═════════
{
  const i = MAIN.indexOf("if (cfg.serverPlansOnly === true) {");
  t("la branche kiosque est trouvable dans _appliquerConfigKiosque", i >= 0);
  const branche = i >= 0 ? MAIN.slice(i, MAIN.indexOf("if (cfg.disableGenerator", i)) : "";

  t("🩸 « Afficher les plans serveur » est remis à true (sinon : accueil vide, case cachée)",
    /setItem\("myktamap_loader_show_server_plans", "true"\)/.test(branche));
  t("🩸 « Ne pas charger les plans serveur » est remis à false (même impasse)",
    /setItem\("myktamap_skip_server_plans_v1", "false"\)/.test(branche));

  // 🩸 L'ORDRE EST LA MOITIÉ DU FIX. La pref était lue AVANT le chargement de
  // l'index : le kiosque la remettait d'aplomb trop tard, et l'accueil restait
  // vide pour CE démarrage. Il aurait fallu relancer l'app pour voir ses plans.
  const idx  = MAIN.indexOf("const _idxServeur = await _chargerIndexServeur();");
  const pref = MAIN.indexOf("const _skipServer = (typeof window._loaderSkipServerPlans");
  t("l'index serveur et la pref de skip sont tous deux lus au boot", idx >= 0 && pref >= 0);
  t("🩸 l'index (donc la config kiosque) est chargé AVANT que la pref de skip ne soit lue",
    idx >= 0 && pref > idx);
}

// ═════════ 3. LE REFUS D'IMPORT, EXÉCUTÉ ═════════
// On extrait le test réel et on le joue dans les deux états.
{
  const m = PEI.match(/if \(typeof window\.ktaKiosqueServeurSeul === "function" && window\.ktaKiosqueServeurSeul\(\)\) \{[\s\S]*?\n    \}/);
  t("🔒 l'ouverture de la modale d'import interroge le prédicat kiosque", !!m);

  // Le refus doit vivre AVANT tout traitement du fichier, sinon on aurait déjà
  // lu et décompressé l'archive avant de dire non.
  const iRefus = PEI.indexOf("ktaKiosqueServeurSeul()");
  const iFic   = PEI.indexOf("const entete = new Uint8Array");
  t("🔒 …et refuse AVANT de toucher au fichier", iRefus >= 0 && iFic > iRefus);

  if (m) {
    const jouer = (kiosque) => {
      let vu = null, sorti = false;
      const sb = {
        window: { ktaKiosqueServeurSeul: function () { return kiosque; },
                  I18n: { t: function (k) { return k; } } },
        alert: function (msg) { vu = msg; }
      };
      // Le `return` du bloc n'est légal que dans une fonction : on l'enveloppe.
      vm.runInNewContext("(function(){ " + m[0] + " return \"suite\"; })()", sb, { filename: "pei.refus.js" });
      sorti = vm.runInNewContext("(function(){ " + m[0] + " return \"suite\"; })()", sb) !== "suite";
      return { vu: vu, sorti: sorti };
    };
    const k = jouer(true), nk = jouer(false);
    t("🩸 en kiosque : l'import s'arrête", k.sorti === true);
    t("🩸 …et le dit à l'utilisateur (pas un échec muet)", k.vu === "profileio.kiosque_refus");
    t("🩸 hors kiosque : l'import continue normalement", nk.sorti === false && nk.vu === null);
  }

  // Le message existe dans les trois dictionnaires (FR = repli universel).
  ["fr", "en", "es"].forEach(function (code) {
    const d = JSON.parse(fs.readFileSync("lang/" + code + ".json", "utf8"));
    t("🌍 message de refus traduit : " + code,
      typeof d["profileio.kiosque_refus"] === "string" && d["profileio.kiosque_refus"].length > 20);
  });
}

// ═════════ 4. ON NE PROPOSE PAS CE QU'ON REFUSE ═════════
{
  // 🩸 Borne explicite sur `</button>') +` : un `[\s\S]*?\) \+` non-greedy
  // s'arrêtait au PREMIER `) +` venu — au milieu de l'expression — et donnait
  // un fragment déséquilibré que le vm refusait. Un motif non borné avait déjà
  // détruit la recherche live du HOME de la même façon.
  const m = HPR.match(/\(\(typeof window\.ktaKiosqueServeurSeul === "function" && window\.ktaKiosqueServeurSeul\(\)\)[\s\S]*?<\/button>'\) \+/);
  t("🔒 la modale Détails profil conditionne son bouton Import au prédicat kiosque", !!m);
  if (m) {
    const jouer = (kiosque) => {
      const sb = {
        window: { ktaKiosqueServeurSeul: function () { return kiosque; } },
        _t: function (k) { return k; }
      };
      return vm.runInNewContext("(" + m[0].replace(/\) \+$/, ")") + ")", sb, { filename: "hpr.bouton.js" });
    };
    t("🔒 en kiosque : aucun bouton Import rendu", jouer(true) === "");
    t("🔒 hors kiosque : le bouton Import est bien là",
      String(jouer(false)).indexOf('id="kta-profile-details-import"') >= 0);
  }
  // 🩸 Le bouton disparaît : le câblage doit survivre à son absence, sinon
  // `addEventListener` sur null jetait et tuait TOUT le reste de la modale.
  t("🩸 le câblage tolère l'absence du bouton (sinon la modale entière casse)",
    /const _btnImp = document\.getElementById\("kta-profile-details-import"\);/.test(HPR) &&
    /if \(_btnImp\) \{/.test(HPR));

  // L'EXPORT, lui, reste : sauvegarder son carnet n'a jamais gêné personne.
  t("💾 l'export de profil reste accessible en kiosque (aucune condition dessus)",
    /getElementById\("kta-profile-details-export"\)\.addEventListener/.test(HPR));
}

// ---------- 📦 Import multiple : une porte d'entrée de plus ----------
// 🩸 KARMA, 15/09/2026 : « si en mode serveur on a coupé l'import de plan,
// il ne doit pas être affiché (comme Ajouter un plan) ». Le bouton vit dans
// les 🧰 Outils, donc HORS de `#panelZip` que le kiosque masque : sans
// traitement, un kiosque « plans serveur uniquement » laissait entrer N
// plans d'un coup. On vérifie les DEUX : le bouton masqué, ET le module qui
// refuse — masquer un bouton ne ferme pas une porte.
{
  const IMP = fs.readFileSync("js/importMasse.js", "utf8").replace(/\r\n/g, "\n");
  const app = MAIN.slice(MAIN.indexOf("function _appliquerConfigKiosque()"),
                         MAIN.indexOf("function _appliquerConfigKiosque()") + 4000);
  t("🔒 le bouton d'import multiple est masqué en kiosque",
    /loaderImportMasseBtn[\s\S]{0,120}display = "none"/.test(app));
  t("🩸 …et le module REFUSE de s'ouvrir (le masquage seul se contourne par un appel direct)",
    /function ouvrir\(\) \{[\s\S]{0,600}ktaKiosqueServeurSeul\(\)/.test(IMP));
  t("🩸 …y compris sur le chemin qui ÉCRIT (importer)",
    /async function importer\([\s\S]{0,400}ktaKiosqueServeurSeul\(\)/.test(IMP));
  t("le refus est DIT à l'utilisateur, pas seulement journalisé", /impmasse\.kiosque/.test(IMP));
  ["fr", "en", "es"].forEach(function (l) {
    const d = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
    t("🌍 " + l + " : le texte du refus kiosque", typeof d["impmasse.kiosque"] === "string");
  });
}

console.log(ko === 0 ? "\n🎉 kiosque serveur : ce qui est interdit l'est au goulot, pas sur un bouton"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
