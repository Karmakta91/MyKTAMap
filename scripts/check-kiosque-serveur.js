#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-kiosque-serveur.js — BLOQUANT (pré-commit) : mode kiosque « plans serveur uniquement »
// (`serverPlansOnly`, prédicat unique `window.ktaKiosqueServeurSeul`).
// 🔒 Règle : un mode qui interdit quelque chose l'interdit au GOULOT, pas sur un bouton (une modale
//    s'ouvre depuis plusieurs endroits, ou par appel direct).
// 🩸 L'import de PROFIL restaure des ZIP : sans refus, il contourne la dropzone masquée.
// 🩸 Un profil importé peut porter `myktamap_loader_show_server_plans = false` : accueil vide, et la case
//    qui le corrige est cachée par le kiosque. Le kiosque force ces préférences, AVANT leur lecture au boot.
// On EXÉCUTE les prédicats extraits des vrais fichiers dans les deux états : un grep ne voit pas une
// condition inversée.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const MAIN = fs.readFileSync("js/main.js", "utf8");
const PEI  = fs.readFileSync("js/profileExportImport.js", "utf8");
const HPR  = fs.readFileSync("js/homeProfile.js", "utf8");

// ── 1. Le prédicat, exécuté dans les deux états ──────
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

// ── 2. Les deux préférences qui vident un kiosque ──────
{
  const i = MAIN.indexOf("if (cfg.serverPlansOnly === true) {");
  t("la branche kiosque est trouvable dans _appliquerConfigKiosque", i >= 0);
  const branche = i >= 0 ? MAIN.slice(i, MAIN.indexOf("if (cfg.disableGenerator", i)) : "";

  t("🩸 « Afficher les plans serveur » est remis à true (sinon : accueil vide, case cachée)",
    /setItem\("myktamap_loader_show_server_plans", "true"\)/.test(branche));
  t("🩸 « Ne pas charger les plans serveur » est remis à false (même impasse)",
    /setItem\("myktamap_skip_server_plans_v1", "false"\)/.test(branche));

  // 🩸 Ordre : la config kiosque (index) se charge AVANT la lecture de la pref, sinon l'accueil reste
  // vide pour ce démarrage.
  const idx  = MAIN.indexOf("const _idxServeur = await _chargerIndexServeur();");
  const pref = MAIN.indexOf("const _skipServer = (typeof window._loaderSkipServerPlans");
  t("l'index serveur et la pref de skip sont tous deux lus au boot", idx >= 0 && pref >= 0);
  t("🩸 l'index (donc la config kiosque) est chargé AVANT que la pref de skip ne soit lue",
    idx >= 0 && pref > idx);
}

// ── 3. Le refus d'import, exécuté ──────
{
  const m = PEI.match(/if \(typeof window\.ktaKiosqueServeurSeul === "function" && window\.ktaKiosqueServeurSeul\(\)\) \{[\s\S]*?\n    \}/);
  t("🔒 l'ouverture de la modale d'import interroge le prédicat kiosque", !!m);

  // refus AVANT de lire et décompresser l'archive
  const iRefus = PEI.indexOf("ktaKiosqueServeurSeul()");
  const iFic   = PEI.indexOf("const entete = new Uint8Array");
  t("🔒 …et refuse AVANT de toucher au fichier", iRefus >= 0 && iFic > iRefus);

  if (m) {
    const jouer = (kiosque) => {
      let vu = null, sorti = false;
      const sb = {
        // Refus via window.ktaAlerte ; `alert` bouchonné aussi, pour reconnaître un retour au natif.
        window: { ktaKiosqueServeurSeul: function () { return kiosque; },
                  I18n: { t: function (k) { return k; } },
                  ktaAlerte: function (msg) { vu = msg; return Promise.resolve(); } },
        alert: function (msg) { vu = msg; }
      };
      // `return` légal seulement dans une fonction : on enveloppe.
      vm.runInNewContext("(function(){ " + m[0] + " return \"suite\"; })()", sb, { filename: "pei.refus.js" });
      sorti = vm.runInNewContext("(function(){ " + m[0] + " return \"suite\"; })()", sb) !== "suite";
      return { vu: vu, sorti: sorti };
    };
    const k = jouer(true), nk = jouer(false);
    t("🩸 en kiosque : l'import s'arrête", k.sorti === true);
    t("🩸 …et le dit à l'utilisateur (pas un échec muet)", k.vu === "profileio.kiosque_refus");
    t("🩸 hors kiosque : l'import continue normalement", nk.sorti === false && nk.vu === null);
  }

  ["fr", "en", "es"].forEach(function (code) {
    const d = JSON.parse(fs.readFileSync("lang/" + code + ".json", "utf8"));
    t("🌍 message de refus traduit : " + code,
      typeof d["profileio.kiosque_refus"] === "string" && d["profileio.kiosque_refus"].length > 20);
  });
}

// ── 4. On ne propose pas ce qu'on refuse ──────
{
  // 🩸 Borne explicite sur `</button>') +` : un non-greedy `[\s\S]*?\) \+` s'arrête au PREMIER `) +` venu
  // et rend un fragment déséquilibré.
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
  // 🩸 Bouton absent : `addEventListener` sur null jetterait et tuerait tout le reste de la modale.
  t("🩸 le câblage tolère l'absence du bouton (sinon la modale entière casse)",
    /const _btnImp = document\.getElementById\("kta-profile-details-import"\);/.test(HPR) &&
    /if \(_btnImp\) \{/.test(HPR));

  // L'export de profil reste permis (décision produit).
  t("💾 l'export de profil reste accessible en kiosque (aucune condition dessus)",
    /getElementById\("kta-profile-details-export"\)\.addEventListener/.test(HPR));
}

// ── 5. Import multiple : une porte d'entrée de plus ──────
// 🩸 Son bouton vit dans Outils, HORS de `#panelZip` que le kiosque masque. On vérifie les DEUX : bouton
// masqué ET module qui refuse (ouvrir et importer).
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
