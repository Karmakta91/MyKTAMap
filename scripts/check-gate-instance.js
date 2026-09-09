#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔑 check-gate-instance.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LA RÈGLE (KARMA, 08/09/2026) : quand une instance publie un hash valide dans
// `index.json`, il est le SEUL qui ouvre : le code communautaire ne vaut plus
// que sur une app SANS hash d'instance.
//
// 🩸 POURQUOI L'EXCLUSIVITÉ, ET PAS « l'un OU l'autre » (ma 1ʳᵉ version, corrigée
// par KARMA). Le code communautaire est distribué largement — il ouvre la prod
// qui n'héberge rien. S'il ouvrait AUSSI les instances privées, quiconque le
// connaît les ouvrirait toutes, et l'accessHash ne protégerait rien.
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

  // `u` = LS_UNLOCK (hash accepté), `k` = LS_UNLOCK_KIOSQUE (mémoire instance).
  // On les pose SÉPARÉMENT : le cas « accès communautaire hérité » a un `u` mais
  // pas de `k`, ce que l'ancien helper (u = k) ne pouvait pas exprimer.
  const jouer = (u, k, publie, repondu) => {
    const store = {};
    if (u !== undefined) store.u = u;
    if (k !== undefined) store.k = k;
    const sb = {
      HASH_VALIDE: VRAI,
      LS_UNLOCK: "u", LS_UNLOCK_KIOSQUE: "k",
      RE_HASH: /^[0-9a-f]{64}$/,
      console: { log: function () {} },
      localStorage: {
        getItem: function (kk) { return kk in store ? store[kk] : null; },
        removeItem: function (kk) { delete store[kk]; },
        setItem: function (kk, vv) { store[kk] = vv; }
      }
    };
    vm.runInNewContext(code + "; revaliderInstance(" + JSON.stringify(publie) +
      ", " + (repondu === false ? "false" : "true") + ");",
      sb, { filename: "gate.revalider.js" });
    return store;   // ce qu'il reste après revalidation
  };

  if (code) {
    // — l'utilisateur d'instance, hash inchangé : on ne le déloge pas —
    const inchange = jouer(KIOSK, KIOSK, KIOSK, true);
    t("🔑 hash d'instance inchangé : accès conservé", inchange.u === KIOSK);

    // — le déployeur a changé son mot de passe : ressaisie —
    const change = jouer(KIOSK, KIOSK, "c".repeat(64), true);
    t("🔑 hash d'instance changé : accès révoqué", change.u === undefined && change.k === undefined);

    // 🩸 LE TROU QUE KARMA A POINTÉ, CÔTÉ ÉTAT STOCKÉ. Un utilisateur entré avec
    // le CODE COMMUNAUTAIRE quand l'instance était ouverte, puis l'instance pose
    // son mot de passe. Sans révocation, son accès communautaire hérité
    // rouvrirait l'instance — exactement ce que le refus au submit ferme.
    const herite = jouer(VRAI /* code communautaire */, undefined /* aucune mémoire instance */, KIOSK, true);
    t("🩸 accès COMMUNAUTAIRE hérité + l'instance pose un mot de passe → RÉVOQUÉ",
      herite.u === undefined);

    // — l'instance RETIRE son mot de passe : l'accès instance ne vaut plus —
    const retireAccesInstance = jouer(KIOSK, KIOSK, null, true);
    t("🔑 mot de passe d'instance retiré : l'accès qui en venait est révoqué",
      retireAccesInstance.u === undefined && retireAccesInstance.k === undefined);

    // — app communautaire pure (jamais d'accessHash) : on ne touche à rien —
    const communautairePur = jouer(VRAI, undefined, null, true);
    t("app communautaire pure : l'accès communautaire est conservé", communautairePur.u === VRAI);

    // 🩸 HORS-LIGNE : `null` veut dire DEUX choses — « retiré » et
    // « injoignable ». La distinction est dans la SIGNATURE (indexRepondu).
    // Index injoignable → on n'efface RIEN, sinon une coupure réseau
    // reverrouille l'app.
    const horsLigne = jouer(KIOSK, KIOSK, null, false);
    t("🩸 INDEX INJOIGNABLE : on n'efface RIEN (sinon une coupure réseau reverrouille l'app)",
      horsLigne.u === KIOSK && horsLigne.k === KIOSK);
    t("🩸 …et la distinction est DANS LA SIGNATURE, pas dans la discipline de l'appelant",
      /function revaliderInstance\(hashPublie, indexRepondu\)/.test(GATE) &&
      /if \(indexRepondu !== true\) return;/.test(GATE));

    // — rien de stocké : aucun plantage —
    const vide = jouer(undefined, undefined, KIOSK, true);
    t("aucun état stocké : rien à faire, aucun plantage", vide.u === undefined);
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

// ═════════ 4. 🔒 LE HASH D'INSTANCE EST EXCLUSIF — EXÉCUTÉ ═════════
// 🩸 LE TROU (KARMA) : la première version acceptait le code communautaire EN
// PLUS du mot de passe d'instance. Or le code communautaire est distribué
// largement (il ouvre la prod qui n'héberge rien) : quiconque le connaît aurait
// ouvert n'importe quelle instance privée, et l'accessHash n'aurait rien
// protégé. Quand une instance publie un hash valide, il doit être le SEUL.
// On extrait la décision du vrai `_onSubmit` et on la joue sur les quatre cas.
{
  // Le cœur de la décision : de `const hashInstance = …` jusqu'aux deux lignes
  // okInstance / okCommunaute. On le rend SYNCHRONE — `_hashInstance` stubé
  // renvoie la valeur directement et l'`await` est retiré — pour jouer les
  // quatre cas sans tordre tout le garde-fou en async.
  const m = GATE.match(/const hashInstance = await _hashInstance\(\);[\s\S]*?const okCommunaute = \(![^\n]*\);/);
  t("la décision de déverrouillage est extractible", !!m);
  if (m) {
    const frag = m[0].replace("await _hashInstance()", "_hashInstance()");
    const jouer = (hashInstance, hashed) => {
      const sb = { HASH_VALIDE: VRAI, _hashInstance: function () { return hashInstance; }, hashed: hashed };
      return vm.runInNewContext("(function(){ " + frag + " return (okCommunaute || okInstance); })()",
        sb, { filename: "gate.decision.js" });
    };
    t("🔑 instance : SON mot de passe ouvre", jouer(KIOSK, KIOSK) === true);
    t("🩸 instance : le code communautaire est REFUSÉ (LE TROU FERMÉ)", jouer(KIOSK, VRAI) === false);
    t("app communautaire (pas d'accessHash) : le code communautaire ouvre", jouer(null, VRAI) === true);
    t("app communautaire : un autre mot de passe est refusé", jouer(null, KIOSK) === false);
    t("instance : un mot de passe quelconque est refusé", jouer(KIOSK, "d".repeat(64)) === false);
  }
}

// ═════════ 4b. L'INDEX EST DEMANDÉ À CHAQUE TENTATIVE (il le FAUT) ═════════
// 🩸 On ne peut plus « sauter » la requête quand la saisie égale le hash
// communautaire : elle doit justement être refusée si l'instance impose le
// sien. Donc l'index est demandé à chaque submit — la gate étant rare, c'est
// négligeable, et le SW sert l'index en cache hors-ligne.
{
  t("🔒 l'index est demandé INCONDITIONNELLEMENT au submit (plus de court-circuit sur HASH_VALIDE)",
    /const hashInstance = await _hashInstance\(\);/.test(GATE) &&
    !/if \(hashed !== HASH_VALIDE\) hashInstance = await _hashInstance\(\);/.test(GATE));
  t("🩸 le code communautaire n'ouvre QUE sans hash d'instance",
    /const okCommunaute = \(!hashInstance && hashed === HASH_VALIDE\);/.test(GATE));
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

// ═════════ 9. 🔒 AUCUNE LICENCE PRO NE CONTOURNE UN MOT DE PASSE (v1.90.9) ═════════
// v1.90.8 ne bloquait que la licence IMPORTÉE (source "local") et laissait
// passer la licence SERVEUR. KARMA a tranché (v1.90.9) : le `/Licence-pro.json`
// servi par l'instance est fetché pour TOUS les visiteurs, donc le laisser
// bypasser rendait l'`accessHash` MUET — quiconque ouvrait l'instance entrait.
// 🩸 Désormais, quand l'instance impose un mot de passe, PLUS AUCUNE source ne
// bypasse : le mot de passe est l'accès, la licence n'accorde que le MODE pro.
// On EXÉCUTE la décision de bypass extraite de main.js.
{
  const frag = MAIN.match(/let _proBypass = _proActive;[\s\S]*?_proBypass = false;[\s\S]*?\n    \}/);
  t("la décision de bypass licence est extractible de main.js", !!frag);
  if (frag) {
    const code = frag[0].replace("await window.UnlockGate.instanceRequiertMotDePasse()",
                                 "window.UnlockGate.instanceRequiertMotDePasse()");
    const jouer = (proActive, source, protegee) => {
      const sb = {
        _proActive: proActive,
        console: { log: function () {} },
        window: {
          MyKTAMapProLicense: { getSource: function () { return source; } },
          UnlockGate: { instanceRequiertMotDePasse: function () { return protegee; } }
        }
      };
      return vm.runInNewContext("(function(){ " + code + " return _proBypass; })()",
        sb, { filename: "main.bypass.js" });
    };
    t("🔒 licence LOCALE + instance protégée → PAS de bypass",
      jouer(true, "local", true) === false);
    t("🔒 licence SERVEUR + instance protégée → PAS de bypass NON PLUS (v1.90.9, le trou fermé)",
      jouer(true, "server", true) === false);
    t("licence SERVEUR + instance NON protégée → bypass (instance pro sans mot de passe : inchangé)",
      jouer(true, "server", false) === true);
    t("licence locale + instance NON protégée → bypass (app communautaire : inchangé)",
      jouer(true, "local", false) === true);
    t("pas de licence pro → pas de bypass, quoi qu'il arrive",
      jouer(false, "local", true) === false && jouer(false, "server", false) === false);
  }

  // La gate retire le bloc d'import de licence sur une instance protégée…
  t("🔒 la gate RETIRE le bloc « importer ma licence » sur instance protégée",
    /_hashInstance\(\)\.then\(function\(h\) \{[\s\S]{0,260}kta-licence-community[\s\S]{0,120}removeChild/.test(GATE));
  // …et refuse l'unlock au clic, défense en profondeur.
  t("🩸 …et refuse l'unlock même si le bloc est rendu (garde `_instanceProtegeeGate`)",
    /if \(_instanceProtegeeGate\) \{[\s\S]{0,160}return;/.test(GATE));
  t("le prédicat instanceRequiertMotDePasse est exposé",
    /instanceRequiertMotDePasse: instanceRequiertMotDePasse/.test(GATE) &&
    /async function instanceRequiertMotDePasse\(\)/.test(GATE));
  // 🩸 v1.90.9 — LE BLOCAGE NE DÉPEND PLUS DE LA SOURCE. Il ne reste AUCUN test
  // `getSource() === "local"` dans la décision de bypass : le laisser aurait
  // épargné la licence serveur, exactement le trou que KARMA a fait fermer.
  t("🩸 la décision de bypass ne discrimine plus par source (plus de test \"local\")",
    !/getSource\(\) === "local"/.test(MAIN));
  // Le message de refus existe dans les 3 langues.
  ["fr", "en", "es"].forEach(function (c) {
    const d = JSON.parse(fs.readFileSync("lang/" + c + ".json", "utf8"));
    t("🌍 message de refus traduit : " + c, typeof d["gate.licence.instanceProtegee"] === "string");
  });
}

// ═════════ 10. 🔑 INCOGNITO HÉRITE DE TOUS LES DÉVERROUILLAGES (v1.90.14) ═════════
// 🩸 BUG KARMA : en incognito sur une instance à `accessHash`, la gate se
// réaffichait. Le shim incognito relit le disque UNIQUEMENT pour les clés d'une
// whitelist (pour ne pas re-demander le mot de passe à chaque fenêtre privée).
// La v1.90.6 a ajouté `LS_UNLOCK_KIOSQUE` (mémoire du déverrouillage d'instance)
// SANS l'ajouter à cette whitelist → `isUnlocked()` lisait le hash accepté mais
// pas la mémoire d'instance → son test `v === k` échouait → re-saisie forcée.
// On EXIGE que toute clé de déverrouillage lue par la gate soit whitelistée en
// lecture disque côté incognito. Ajouter une 3ᵉ clé sans la whitelister rougira.
{
  const INCOG = fs.readFileSync("js/incognitoMode.js", "utf8");
  const iWl = INCOG.indexOf("READ_DISK_WHITELIST");
  const iFin = iWl >= 0 ? INCOG.indexOf("};", iWl) : -1;
  const whitelist = (iWl >= 0 && iFin > iWl) ? INCOG.slice(iWl, iFin) : "";
  t("la whitelist de lecture disque incognito est trouvable", whitelist.length > 0);

  // Les clés de déverrouillage que `isUnlocked()` doit pouvoir relire.
  [["LS_UNLOCK", /const LS_UNLOCK\s*=\s*"([^"]+)"/],
   ["LS_UNLOCK_KIOSQUE", /const LS_UNLOCK_KIOSQUE\s*=\s*"([^"]+)"/]].forEach(function (r) {
    const m = GATE.match(r[1]);
    t("🔑 la clé " + r[0] + " est définie dans unlockGate.js", !!m);
    if (m) {
      t("🔑 …et incognito la relit du disque (sinon la gate se réaffiche en privé) : « " + m[1] + " »",
        whitelist.indexOf('"' + m[1] + '"') >= 0);
    }
  });
}

console.log(ko === 0 ? "\n🎉 gate d'instance : deux mots de passe, et aucune promesse de trop"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
