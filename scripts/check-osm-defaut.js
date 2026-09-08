#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🌍 check-osm-defaut.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LA DÉCISION (KARMA, 08/09/2026) : « active le mode OSM par défaut […] dans
// 99 % des cas ce mode est utilisé ».
//
// 🩸 CE QU'ON RETOURNE N'EST PAS UN RÉGLAGE ORDINAIRE. Le widget OSM du HOME
// monte une carte Leaflet dont le fond vient de `tile.openstreetmap.org`. Actif
// par défaut, l'accueil contacte donc un TIERS au chargement, sans clic. C'est
// la seule chose que l'app fait sortir du navigateur, et toute sa promesse
// tient à ce que ce soit dit — pas à ce que ce soit rare.
//
// D'OÙ LES TROIS INVARIANTS TENUS ICI :
//
//   1. UN REFUS EXPLICITE NE SE RÉÉCRASE JAMAIS. La clé est tri-état : "1"
//      accepté, "0" REFUSÉ, absent jamais touché. Seul l'absent bascule. Un
//      `!== "0"` mal écrit en `=== "1"` inversé, ou un `!!localStorage…`
//      paresseux, rallumerait OSM chez quelqu'un qui l'a coupé — c'est la
//      faute qu'on ne peut pas rattraper après un déploiement.
//   2. LES DEUX LECTEURS DISENT LA MÊME CHOSE. `isOptedIn` est dupliqué dans
//      osmView.js (modale) et osmHomePreview.js (widget HOME). Divergents, on
//      obtient un widget affiché sans bouton dans la modale, ou l'inverse.
//   3. LE DÉFAUT S'ANNONCE. Tant que la clé est absente, « actif parce que
//      jamais refusé » n'est pas « actif parce que choisi » : un bandeau le
//      dit, et le valider écrit "1" — l'implicite devient explicite.
//
// COMMENT ON CONTRÔLE : on EXÉCUTE les deux fonctions extraites des vrais
// fichiers sur les quatre états de la clé. Un `grep` verrait « le test est là »
// sans jamais voir qu'il est inversé.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const VUE  = fs.readFileSync("js/osmView.js", "utf8");
const HOME = fs.readFileSync("js/osmHomePreview.js", "utf8");
const IDX  = fs.readFileSync("index.html", "utf8");

// ═════════ 1. LES DEUX LECTEURS, EXÉCUTÉS SUR LES 4 ÉTATS ═════════
// 🩸 On extrait du VRAI fichier : une copie recopiée ici testerait le garde-fou.
function extraire(src, nom) {
  const d = src.indexOf("function " + nom + "() {");
  if (d < 0) return null;
  let prof = 0;
  for (let i = src.indexOf("{", d); i < src.length; i++) {
    if (src[i] === "{") prof++;
    else if (src[i] === "}") { prof--; if (prof === 0) return src.slice(d, i + 1); }
  }
  return null;
}

const LECTEURS = [
  ["js/osmView.js (modale)",         extraire(VUE,  "isOptedIn")],
  ["js/osmHomePreview.js (widget)",  extraire(HOME, "_isOptedIn")]
];

const ETATS = [
  ["\"1\" — activé explicitement", "1",  true],
  ["\"0\" — 🩸 REFUSÉ explicitement", "0", false],
  ["absent — jamais touché",      null, true],
  ["valeur inconnue (donnée corrompue)", "oui", true]
];

const resultats = {};
LECTEURS.forEach(function (l) {
  const [nom, code] = l;
  t("le lecteur est extractible : " + nom, !!code);
  if (!code) return;
  resultats[nom] = [];
  ETATS.forEach(function (e) {
    const sb = {
      LS_OPT_IN_KEY: "myktamap_osm_view_opt_in",
      localStorage: { getItem: function () { return e[1]; } }
    };
    let vu = null, err = null;
    try {
      vm.runInNewContext(code + "; resultat = " + code.slice(9, code.indexOf("(")) + "();", sb,
                         { filename: "osm.optin.js" });
      vu = sb.resultat;
    } catch (ex) { err = ex.message; }
    resultats[nom].push(vu);
    t("  " + nom + " · " + e[0] + " → " + (err ? "EXCEPTION " + err : vu),
      !err && vu === e[2]);
  });
});

// ═════════ 2. LES DEUX LECTEURS NE DOIVENT PAS DIVERGER ═════════
{
  const cles = Object.keys(resultats);
  t("🩸 les deux lecteurs répondent À L'IDENTIQUE sur les 4 états " +
    "(sinon : widget affiché sans bouton dans la modale, ou l'inverse)",
    cles.length === 2 && resultats[cles[0]].join(",") === resultats[cles[1]].join(","));
}

// ═════════ 3. UN REFUS RESTE UN REFUS, ET S'ÉCRIT ═════════
t("🩸 setOptedIn(false) écrit bien \"0\" — sans quoi un refus s'effacerait à la purge",
  /localStorage\.setItem\(LS_OPT_IN_KEY, value \? "1" : "0"\)/.test(VUE));
t("le changement est diffusé aux écrans déjà montés (kta:osmOptInChange)",
  /dispatchEvent\(new CustomEvent\("kta:osmOptInChange"/.test(VUE));

// ═════════ 4. LE DÉFAUT S'ANNONCE ═════════
// 🩸 EXÉCUTÉ, pas grepé. Une première version testait le motif
// `=== null;` à moins de 160 caractères du nom de la fonction : un
// `return true;` glissé juste avant le laissait intact, et le sabotage
// « le bandeau s'affiche même après un choix explicite » passait au VERT.
{
  const code = extraire(HOME, "_estActifParDefaut");
  t("le détecteur de défaut est extractible", !!code);
  const vus = [];
  if (code) {
    [["1", false], ["0", false], [null, true]].forEach(function (e) {
      const sb = { LS_OPT_IN_KEY: "k", localStorage: { getItem: function () { return e[0]; } } };
      let vu = null;
      try {
        vm.runInNewContext(code + "; resultat = _estActifParDefaut();", sb, { filename: "osm.defaut.js" });
        vu = sb.resultat;
      } catch (ex) { vu = "EXCEPTION " + ex.message; }
      vus.push(vu === e[1]);
      t("  bandeau · clé " + JSON.stringify(e[0]) + " → " + vu + " (attendu " + e[1] + ")", vu === e[1]);
    });
  }
  t("🩸 le bandeau ne s'affiche QUE tant que la clé est absente (jamais après un choix)",
    vus.length === 3 && vus.every(Boolean));
}
t("🩸 …et le valider écrit un accord EXPLICITE (setOptedIn(true))",
  /window\.OsmView\.setOptedIn\(true\)/.test(HOME));
t("le bandeau est posé au montage du widget", /_afficherBandeauDefaut\(container\);/.test(HOME));
t("🩸 son texte passe par textContent, jamais innerHTML (contenu de dictionnaire)",
  /\.kta-osm-defaut-txt"\)\.textContent = t\("osm_home\.defautOn\.corps"\)/.test(HOME));

// ═════════ 5. LES BLOQUANTS RESTENT PRIORITAIRES ═════════
// 🩸 Hors-ligne strict et incognito sont des PROMESSES : un défaut ON ne doit
// pas passer devant. Ils sont testés APRÈS l'opt-in dans mount(), donc leur
// ordre relatif est ce qui compte.
{
  // 🩸 Chercher `_isStrictOfflineOn()` dans TOUT le fichier trouvait sa
  // DÉFINITION (ligne 465), toujours placée avant `mount()` : l'assertion
  // était vraie par construction, quel que soit l'ordre réel des tests. On
  // borne donc la recherche au corps de mount(), après le test d'opt-in.
  const iOpt = HOME.indexOf("if (!_isOptedIn()) {");
  const corps = iOpt > 0 ? HOME.slice(iOpt) : "";
  t("le test d'opt-in est trouvable dans mount()", iOpt > 0);
  t("🔒 le mode hors-ligne strict bloque toujours le widget, APRÈS l'opt-in",
    corps.indexOf("if (_isStrictOfflineOn()) {") > 0);
  t("🔒 le mode incognito aussi",
    corps.indexOf("if (_isIncognitoOn()) {") > 0);
}

// ═════════ 6. CE QUE L'UTILISATEUR LIT DOIT ÊTRE VRAI ═════════
// 🩸 La case annonçait « default OFF » — faux désormais — et « quand la modale
// Vue OSM est ouverte », qui était DÉJÀ faux : le widget du HOME contacte le
// même serveur sans ouvrir aucune modale. Tolérable en opt-in, plus du tout
// en défaut ON.
{
  const fr = JSON.parse(fs.readFileSync("lang/fr.json", "utf8"));
  const lib = fr["home.privacy.osmToggle"] || "";
  t("📄 la case ne prétend plus être désactivée par défaut", lib.indexOf("default OFF") < 0);
  t("📄 …et dit qu'elle est active par défaut", /par défaut/i.test(lib));
  t("🩸 …et que c'est le WIDGET DE L'ACCUEIL aussi, pas seulement la modale",
    /accueil/i.test(lib));
  t("📄 le libellé de repli d'index.html dit la même chose",
    IDX.indexOf("Activé par défaut") >= 0 && IDX.indexOf("default OFF") < 0);

  // L'audit réseau est la page où l'on promet de tout dire : le changement de
  // défaut doit y être, faute de quoi la promesse ne vaut plus rien.
  // 🩸 UNE PREMIÈRE VERSION DE CE TEST ÉTAIT VRAIE PAR ACCIDENT : elle exigeait
  // « défaut » + « tile.openstreetmap.org » + « v1.90.2 » quelque part dans le
  // fichier — trois mots qui s'y trouvaient déjà, séparément, pour d'autres
  // raisons. Elle passait au vert sur un audit qui ne disait RIEN du changement.
  // On exige donc la phrase qui engage, et elle seule.
  const PHRASE = "activée PAR DÉFAUT";
  ["docs/applications/NETWORK_AUDIT.md", "docs/applications/NETWORK_AUDIT.html"].forEach(function (f) {
    const D = fs.readFileSync(f, "utf8");
    t("🔒 " + f.split("/").pop() + " annonce noir sur blanc que la Vue OSM est active par défaut",
      D.indexOf(PHRASE) >= 0);
    t("🔒 " + f.split("/").pop() + " …et nomme le tiers contacté sans clic",
      D.indexOf("tile.openstreetmap.org") >= 0);
  });
}

console.log(ko === 0 ? "\n🎉 défaut OSM : un refus reste un refus, et le défaut s'annonce"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
