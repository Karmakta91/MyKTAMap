#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔑 check-gate-instance.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LA DEMANDE (KARMA, 08/09/2026) : « pour un mode serveur, avoir un hash perso
// pour le mot de passe de la gate. Du coup pour déverrouiller l'application on
// a soit le mdp lié au hash de la gate (celui saisi depuis toujours), soit
// celui lié au hash dans le index.json. »
//
// ⚠️ CE QUE ÇA N'EST PAS. Le hash vit dans `data/index.json`, un fichier
// PUBLIC : n'importe qui peut le télécharger et le brute-forcer hors ligne.
// C'est exactement la situation du hash communautaire, lisible sur GitHub
// depuis toujours — donc le niveau de sécurité ne BAISSE pas. Mais il ne monte
// pas non plus, et l'écrire ailleurs que dans un commentaire serait mentir :
// barrière sociale, jamais une authentification.
//
// 🩸 LES TROIS FAÇONS DE SE TROMPER, TOUTES SILENCIEUSES :
//
//   1. DEUX `null` QUI S'ÉGALENT. `isUnlocked()` compare la valeur stockée au
//      hash d'instance mémorisé. Sur un navigateur vierge, les deux valent
//      `null` — une comparaison naïve `v === k` déverrouille alors TOUT LE
//      MONDE, sans la moindre erreur visible. C'est la faute à ne pas commettre.
//   2. LE REVERROUILLAGE HORS LIGNE. Un utilisateur entré par le mot de passe
//      de l'instance doit rester entré quand l'index n'est pas joignable —
//      sinon la fonctionnalité lâche précisément là où l'app sert le plus.
//   3. UN `accessHash` FAUTIF ACCEPTÉ. Un mot de passe collé en clair, ou un
//      hash tronqué, ne doit jamais devenir une valeur comparable : il
//      ouvrirait l'app à qui tape littéralement cette chaîne.
//
// On EXÉCUTE les fonctions extraites du vrai fichier sur ces cas.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const GATE = fs.readFileSync("js/unlockGate.js", "utf8");
const MAIN = fs.readFileSync("js/main.js", "utf8");
const CA   = fs.readFileSync("confadmin.html", "utf8");

function extraire(nom) {
  const d = GATE.search(new RegExp("function\\s+" + nom + "\\s*\\([^)]*\\)\\s*\\{"));
  if (d < 0) return null;
  let prof = 0;
  for (let i = GATE.indexOf("{", d); i < GATE.length; i++) {
    if (GATE[i] === "{") prof++;
    else if (GATE[i] === "}") { prof--; if (prof === 0) return GATE.slice(d, i + 1); }
  }
  return null;
}

const VRAI = "a".repeat(64);          // faux « hash communautaire », forme valide
const KIOSK = "b".repeat(64);         // hash d'instance

// ═════════ 1. isUnlocked, EXÉCUTÉ SUR TOUTE LA MATRICE ═════════
{
  const code = extraire("isUnlocked");
  t("isUnlocked est extractible", !!code);

  const jouer = (unlock, kiosque) => {
    const sb = {
      HASH_VALIDE: VRAI,
      LS_UNLOCK: "u", LS_UNLOCK_KIOSQUE: "k",
      RE_HASH: /^[0-9a-f]{64}$/,
      localStorage: { getItem: function (k) { return k === "u" ? unlock : kiosque; } }
    };
    vm.runInNewContext(code + "; resultat = isUnlocked();", sb, { filename: "gate.isUnlocked.js" });
    return sb.resultat;
  };

  if (code) {
    t("le code communautaire ouvre, comme depuis toujours", jouer(VRAI, null) === true);
    t("🔑 le mot de passe d'instance ouvre, s'il est mémorisé", jouer(KIOSK, KIOSK) === true);
    t("un hash d'instance NON mémorisé n'ouvre pas", jouer(KIOSK, null) === false);
    t("🩸 NAVIGATEUR VIERGE : deux `null` ne s'égalent PAS (sinon l'app est grande ouverte)",
      jouer(null, null) === false);
    t("🩸 une chaîne vide non plus", jouer("", "") === false);
    t("🩸 un hash mémorisé de forme invalide est refusé", jouer("abc", "abc") === false);
    t("un hash mémorisé qui ne correspond pas au stocké est refusé", jouer(KIOSK, VRAI) === false);
  }
}

// ═════════ 2. revaliderInstance, EXÉCUTÉ ═════════
// 🩸 Le cas hors-ligne est le seul qui compte vraiment : appelée avec `null`
// parce que l'index n'a pas répondu, elle ne doit RIEN effacer.
{
  const code = extraire("revaliderInstance");
  t("revaliderInstance est extractible", !!code);

  const jouer = (memo, publie, repondu) => {
    const store = { u: memo, k: memo };
    const sb = {
      LS_UNLOCK: "u", LS_UNLOCK_KIOSQUE: "k",
      RE_HASH: /^[0-9a-f]{64}$/,
      console: { log: function () {} },
      localStorage: {
        getItem: function (k) { return k in store ? store[k] : null; },
        removeItem: function (k) { delete store[k]; }
      }
    };
    vm.runInNewContext(code + "; revaliderInstance(" + JSON.stringify(publie) +
      ", " + (repondu === false ? "false" : "true") + ");",
      sb, { filename: "gate.revalider.js" });
    return { garde: store.k === memo, deverrouille: store.u === memo };
  };

  if (code) {
    const inchange = jouer(KIOSK, KIOSK, true);
    t("🔑 hash inchangé : rien n'est touché", inchange.garde && inchange.deverrouille);

    const change = jouer(KIOSK, "c".repeat(64), true);
    t("🔑 hash changé : la mémoire est effacée (ressaisie au prochain démarrage)",
      !change.garde && !change.deverrouille);

    const retireParLeDeployeur = jouer(KIOSK, null, true);
    t("🔑 index répondu SANS accessHash : le déployeur l'a retiré, on reverrouille",
      !retireParLeDeployeur.garde);

    // 🩸 LE CAS QUI COMPTE, ET QUE CE GARDE-FOU A TROUVÉ. `null` veut dire DEUX
    // choses incompatibles : « le déployeur a retiré le mot de passe » et
    // « l'index est injoignable ». La première version ne pouvait pas les
    // distinguer et effaçait dans les deux cas : une coupure réseau
    // reverrouillait l'app. La sûreté reposait sur la discipline d'un site
    // d'appel situé à 1800 lignes de là — elle est maintenant DANS LA SIGNATURE.
    const horsLigne = jouer(KIOSK, null, false);
    t("🩸 INDEX INJOIGNABLE : on n'efface RIEN (sinon une coupure réseau reverrouille l'app)",
      horsLigne.garde && horsLigne.deverrouille);
    t("🩸 …et la distinction est DANS LA SIGNATURE, pas dans la discipline de l'appelant",
      /function revaliderInstance\(hashPublie, indexRepondu\)/.test(GATE) &&
      /if \(indexRepondu !== true\) return;/.test(GATE));

    const vide = jouer(null, KIOSK, true);
    t("aucune mémoire d'instance : rien à faire, aucun plantage", vide.garde);
  }
}

// ═════════ 3. LE HASH PUBLIÉ EST VALIDÉ AVANT USAGE ═════════
{
  t("🩸 la forme du hash est vérifiée (64 hexa) avant de servir de comparaison",
    /const RE_HASH = \/\^\[0-9a-f\]\{64\}\$\/;/.test(GATE) &&
    /if \(!RE_HASH\.test\(propre\)\) \{/.test(GATE));
  t("…et un accessHash fautif est signalé, pas avalé en silence",
    /console\.warn\("\[UnlockGate\] config\.accessHash ignoré/.test(GATE));
  t("le hash est lu dans data/index.json > config.accessHash",
    /fetch\("data\/index\.json", \{ cache: "no-store" \}\)/.test(GATE) &&
    /idx\.config \? idx\.config\.accessHash : null/.test(GATE));
}

// ═════════ 4. AUCUNE REQUÊTE POUR QUI EST DÉJÀ ENTRÉ ═════════
// 🩸 La gate s'ouvre à la première installation ou après un reset. Aller
// chercher l'index à chaque démarrage, pour tout le monde, coûterait une
// requête à des gens que ça ne concerne pas.
{
  const iSubmit = GATE.indexOf("async function _onSubmit(");
  const iAppel  = GATE.indexOf("hashInstance = await _hashInstance();");
  t("l'index n'est demandé que depuis la saisie de la gate", iAppel > iSubmit && iSubmit > 0);
  t("🩸 …et SEULEMENT si le code communautaire a échoué (chemin nominal : zéro requête)",
    /if \(hashed !== HASH_VALIDE\) hashInstance = await _hashInstance\(\);/.test(GATE));
}

// ═════════ 5. LE SUCCÈS MÉMORISE CE QU'IL FAUT ═════════
{
  t("🔑 le hash accepté est stocké (et non plus `HASH_VALIDE` en dur)",
    /localStorage\.setItem\(LS_UNLOCK, hashed\);/.test(GATE));
  t("🩸 un succès d'instance mémorise le hash d'instance (sans quoi : hors-ligne, reverrouillé)",
    /if \(okInstance\) localStorage\.setItem\(LS_UNLOCK_KIOSQUE, hashInstance\);/.test(GATE));
  t("🩸 un succès COMMUNAUTAIRE efface cette mémoire (elle ne le concerne pas)",
    /else\s+localStorage\.removeItem\(LS_UNLOCK_KIOSQUE\);/.test(GATE));
}

// ═════════ 6. LE BRANCHEMENT DANS LE BOOT ═════════
{
  t("main.js revalide après le chargement de l'index",
    /window\.UnlockGate\.revaliderInstance\([\s\S]{0,140}accessHash : null, true\);/.test(MAIN));
  // 🩸 Elle doit vivre APRÈS le `if (!r.ok) return null;` du chargeur : si on
  // la déplaçait avant, un index absent appellerait la revalidation avec null
  // et effacerait la mémoire — le reverrouillage hors-ligne, par la bande.
  const iOk  = MAIN.indexOf('console.log("[Main] data/index.json absent');
  const iRev = MAIN.indexOf("window.UnlockGate.revaliderInstance(");
  t("🩸 …et jamais quand l'index est absent (elle est APRÈS la sortie anticipée)",
    iOk > 0 && iRev > iOk);
}

// ═════════ 7. CONFADMIN NE STOCKE JAMAIS LE MOT DE PASSE ═════════
{
  t("⚙️ ConfAdmin propose un champ de mot de passe d'instance",
    CA.indexOf('id="caAccessPwd"') >= 0);
  t("🩸 …dont SEUL le hash sort dans index.json",
    /if \(_accessHash\) out\.config\.accessHash = _accessHash;/.test(CA) &&
    !/out\.config\.accessPwd/.test(CA));
  t("🩸 …et le champ n'est jamais pré-rempli à la reprise d'un index (un hash ne remonte pas)",
    !/\$\("caAccessPwd"\)\.value =/.test(CA));
  t("le hash repris est conservé tel quel quand on ne le remplace pas",
    /_accessHash = \(typeof c\.accessHash === "string"/.test(CA));
  t("🩸 un contexte non sécurisé (HTTP/file) est DIT, pas ignoré",
    /if \(!window\.crypto \|\| !window\.crypto\.subtle\)/.test(CA) &&
    /ouvre cette page en HTTPS/.test(CA));
  t("le bloc config apparaît même si le mot de passe est le seul réglage",
    /if \(so \|\| ng \|\| st \|\| _accessHash\) \{/.test(CA));
}

// ═════════ 8. ON NE PROMET PAS DE LA SÉCURITÉ ═════════
// 🩸 La seule protection réelle ici est de dire ce que ça vaut. Un déployeur
// qui croit avoir posé une authentification prendrait des risques qu'il ne
// prendrait pas autrement.
{
  t("🔒 le code dit que le hash est PUBLIC et brute-forçable",
    /brute-forcer hors ligne/.test(GATE) && /[Bb]arrière SOCIALE/.test(GATE));
  t("🔒 ConfAdmin prévient le déployeur au moment où il tape",
    /pas une authentification/i.test(CA));
  // 🩸 UNE PREMIÈRE VERSION TESTAIT `indexOf("accessHash") >= 0` : le sabotage
  // « accessHash → accessHashXX » passait au VERT, puisque la chaîne tronquée
  // reste une sous-chaîne. On exige le champ CITÉ (backticks, comme partout
  // ailleurs dans ces docs) ET la phrase qui dit ce que ça vaut — c'est cette
  // seconde partie qui compte : documenter un mot de passe sans dire qu'il est
  // brute-forçable serait pire que ne rien documenter.
  ["docs/applications/SELFHOST.md", "docs/architecture/community-server-line.md"].forEach(function (f) {
    const D = fs.readFileSync(f, "utf8");
    const nom = f.split("/").pop();
    // Cité tel quel ou qualifié (`config.accessHash`) : les deux nomment le
    // champ sans ambiguïté. Ce qui est refusé, c'est une paraphrase.
    t("📄 " + nom + " documente le champ `accessHash`",
      /`[a-z. >]*accessHash`/.test(D));
    t("📄 " + nom + " dit qu'il est PUBLIC et brute-forçable, pas une authentification",
      /public/i.test(D) && /(brute-forc|hors ligne)/i.test(D) &&
      /jamais une authentification/i.test(D));
  });
}

console.log(ko === 0 ? "\n🎉 gate d'instance : deux mots de passe, et aucune promesse de trop"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
