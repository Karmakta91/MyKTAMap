#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-gate-instance.js — garde-fou pré-commit BLOQUANT de la gate (js/unlockGate.js, main.js)
// =====================================================================
// Règle : sans hash d'instance, « Entrer » (écran Bienvenue) ouvre (aucun code en dur) ; quand une
// instance publie un `accessHash` valide dans `index.json`, SON mot de passe est le SEUL accès,
// aucune licence ne le contourne. 🔒 Le hash est PUBLIC (brute-forçable hors ligne) : barrière
// sociale, jamais une authentification, et le code comme la doc doivent le dire (§8).
// 🩸 Les pièges silencieux :
//   - deux `null` qui s'égalent : sur un navigateur vierge, `v === k` ouvrirait à tout le monde ;
//   - le reverrouillage hors ligne : index injoignable → on n'efface RIEN ;
//   - un `accessHash` fautif (clair, tronqué) ne devient jamais une valeur comparable.
// Aussi : data/reglages.json n'apporte que accueil et subtitle (§3), écran d'arrivée selon le domaine (§11).
// On EXÉCUTE (vm) les fonctions extraites du vrai fichier. Doc : docs/architecture/security-legal.md.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const GATE = fs.readFileSync("js/unlockGate.js", "utf8");
const MAIN = fs.readFileSync("js/main.js", "utf8");
// confadmin = page + son script js/confadmin.js (CSP stricte).
const CA   = fs.readFileSync("confadmin.html", "utf8") + "\n" + fs.readFileSync("js/confadmin.js", "utf8");

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

// ── 1. isUnlocked, EXÉCUTÉ SUR TOUTE LA MATRICE ──────────────────────────
// Ouvrent : accès libre, mot de passe d'instance mémorisé, ou ancien code hérité (vaut accès libre,
// jamais comparé à une saisie).
{
  const code = extraire("isUnlocked");
  t("isUnlocked est extractible", !!code);

  const jouer = (unlock, kiosque) => {
    const store = { u: unlock, k: kiosque };
    const sb = {
      ACCES_LIBRE: "libre-v1", HASH_HERITE: VRAI,
      LS_UNLOCK: "u", LS_UNLOCK_KIOSQUE: "k",
      RE_HASH: /^[0-9a-f]{64}$/,
      localStorage: { getItem: function (k) { return store[k]; }, setItem: function (k, v) { store[k] = v; } }
    };
    vm.runInNewContext(code + "; resultat = isUnlocked();", sb, { filename: "gate.isUnlocked.js" });
    return { ouvert: sb.resultat, u: store.u };
  };

  if (code) {
    t("🔓 l'accès libre (« Entrer ») ouvre", jouer("libre-v1", null).ouvert === true);
    const herite = jouer(VRAI, null);
    t("🔓 un appareil entré avec l'ANCIEN code reste ouvert (vaut « déjà choisi »)…", herite.ouvert === true);
    t("🩸 …SANS rien écrire : isUnlocked() tourne au chargement, avant la revalidation de l'instance", herite.u === VRAI);
    t("ancien code = mot de passe d'instance identique, mémorisé : ouvert", jouer(VRAI, VRAI).ouvert === true);
    t("🩸 ancien code face à une AUTRE mémoire d'instance : fermé", jouer(VRAI, KIOSK).ouvert === false);
    t("🔑 le mot de passe d'instance ouvre, s'il est mémorisé", jouer(KIOSK, KIOSK).ouvert === true);
    t("un hash d'instance NON mémorisé n'ouvre pas", jouer(KIOSK, null).ouvert === false);
    t("🩸 NAVIGATEUR VIERGE : deux `null` ne s'égalent PAS (sinon l'app est grande ouverte)",
      jouer(null, null).ouvert === false);
    t("🩸 une chaîne vide non plus", jouer("", "").ouvert === false);
    t("🩸 un hash mémorisé de forme invalide est refusé", jouer("abc", "abc").ouvert === false);
    t("un hash mémorisé qui ne correspond pas au stocké est refusé", jouer(KIOSK, VRAI).ouvert === false);
  }
  t("🩸 l'ancien hash n'apparaît qu'en migration (constante + isUnlocked), jamais face à une saisie",
    (GATE.match(/HASH_HERITE/g) || []).length === 2 && !/HASH_VALIDE/.test(GATE));
}

// ── 2. revaliderInstance, EXÉCUTÉ ────────────────────────────────────────
{
  const code = extraire("revaliderInstance");
  t("revaliderInstance est extractible", !!code);

  // `u` = LS_UNLOCK (hash accepté), `k` = LS_UNLOCK_KIOSQUE (mémoire instance), posés SÉPARÉMENT :
  // l'accès communautaire hérité a un `u` sans `k`.
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
    const inchange = jouer(KIOSK, KIOSK, KIOSK, true);
    t("🔑 hash d'instance inchangé : accès conservé", inchange.u === KIOSK);

    const change = jouer(KIOSK, KIOSK, "c".repeat(64), true);
    t("🔑 hash d'instance changé : accès révoqué", change.u === undefined && change.k === undefined);

    // 🩸 Entré par l'ancien code quand l'instance était ouverte, puis l'instance pose un mot de
    // passe : sans révocation, l'accès hérité rouvrirait l'instance.
    const herite = jouer(VRAI /* code communautaire */, undefined /* aucune mémoire instance */, KIOSK, true);
    t("🩸 accès COMMUNAUTAIRE hérité + l'instance pose un mot de passe → RÉVOQUÉ",
      herite.u === undefined);

    const retireAccesInstance = jouer(KIOSK, KIOSK, null, true);
    t("🔑 mot de passe d'instance retiré : l'accès qui en venait est révoqué",
      retireAccesInstance.u === undefined && retireAccesInstance.k === undefined);

    const communautairePur = jouer(VRAI, undefined, null, true);
    t("app communautaire pure : l'accès communautaire est conservé", communautairePur.u === VRAI);

    // 🩸 `null` veut dire « retiré » OU « injoignable » : la distinction est dans la SIGNATURE
    // (indexRepondu). Injoignable → on n'efface RIEN, sinon une coupure réseau reverrouille l'app.
    const horsLigne = jouer(KIOSK, KIOSK, null, false);
    t("🩸 INDEX INJOIGNABLE : on n'efface RIEN (sinon une coupure réseau reverrouille l'app)",
      horsLigne.u === KIOSK && horsLigne.k === KIOSK);
    t("🩸 …et la distinction est DANS LA SIGNATURE, pas dans la discipline de l'appelant",
      /function revaliderInstance\(hashPublie, indexRepondu\)/.test(GATE) &&
      /if \(indexRepondu !== true\) return;/.test(GATE));

    const vide = jouer(undefined, undefined, KIOSK, true);
    t("aucun état stocké : rien à faire, aucun plantage", vide.u === undefined);
  }
}

// ── 3. Le hash publié est validé avant usage ─────────────────────────────
{
  t("🩸 la forme du hash est vérifiée (64 hexa) avant de servir de comparaison",
    /const RE_HASH = \/\^\[0-9a-f\]\{64\}\$\/;/.test(GATE) &&
    /if \(!RE_HASH\.test\(propre\)\) \{/.test(GATE));
  t("…et un accessHash fautif est signalé, pas avalé en silence",
    /console\.warn\("\[UnlockGate\] config\.accessHash ignoré/.test(GATE));
  // La gate lit la config d'instance chargée UNE fois avant les gates (js/ktaInstance.js).
  t("le hash vient de la config d'instance partagée (config.accessHash), lue une seule fois",
    /const st = await window\.KtaInstance\.charger\(\);\s*cfg = st \? st\.config : null;/.test(GATE) &&
    /const h = cfg \? cfg\.accessHash : null;/.test(GATE));
  {
    const KI = fs.readFileSync("js/ktaInstance.js", "utf8");
    t("🏛️ ktaInstance : une seule lecture par démarrage (la promesse est mémorisée)",
      /if \(_promesse\) return _promesse;/.test(KI));
    t("🏛️ ktaInstance : délai maximal de 2 s (AbortController)", /const DELAI_MS = 2000;/.test(KI) && /ctrl\.abort\(\)/.test(KI));
    t("🩸 ktaInstance : un non-2xx (404 synthétique du SW hors ligne) = injoignable, jamais « répondu »",
      /if \(!r\.ok\) return null;/.test(KI));
    t("🩸 ktaInstance : une config rejouée de mémoire est marquée repondu: false",
      /_etat = \{ charge: true, repondu: false, index: null, config: _fusion\(memo, reglages\)/.test(KI));
    t("ktaInstance : seule la section config est mémorisée (pas la liste des plans)", /_ecrireMemo\(config\);/.test(KI));
    // 🔒 data/reglages.json (fichier posé à côté de l'index, hors Git) : accueil et subtitle SEULS, exécuté.
    const morceau = (nom) => {
      const d = KI.indexOf("function " + nom + "(");
      if (d < 0) return "";
      let p = 0;
      for (let i = KI.indexOf("{", d); i < KI.length; i++) {
        if (KI[i] === "{") p++; else if (KI[i] === "}" && --p === 0) return KI.slice(d, i + 1);
      }
      return "";
    };
    const sb = {};
    vm.runInNewContext(morceau("filtrerReglages") + morceau("_fusion") + "; F = filtrerReglages; U = _fusion;", sb,
      { filename: "instance.reglages.js" });
    const F = sb.F, U = sb.U;
    const piege = { accueil: { titre: "Club" }, subtitle: "Secteur", accessHash: KIOSK, plans: [{ id: "x" }],
      serverConnection: { state: "on", api: "/api/", modules: ["m.js"] }, liaisons: {}, serverPlansOnly: true,
      config: { accessHash: KIOSK } };
    const filtre = F(piege);
    t("🔒 reglages.json : seules accueil et subtitle sont lues (accessHash, serverConnection, plans… ignorés)",
      !!filtre && JSON.stringify(Object.keys(filtre).sort()) === '["accueil","subtitle"]');
    const eff = U({ accessHash: VRAI, subtitle: "Index", serverConnection: { state: "off" } }, F(piege));
    t("🔒 config effective : le sous-titre des réglages prime, le mot de passe et la connexion restent ceux de l'index",
      eff.subtitle === "Secteur" && eff.accessHash === VRAI && eff.serverConnection.state === "off");
    t("reglages.json mal formé : un champ faux ignoré, le reste s'applique ; rien de valable → null",
      JSON.stringify(F({ accueil: "texte", subtitle: "S" })) === '{"subtitle":"S"}' &&
      JSON.stringify(F({ accueil: { titre: "T" }, subtitle: 3 })) === '{"accueil":{"titre":"T"}}' &&
      [null, "x", [], 3, {}, { subtitle: "  " }, { accueil: [] }].every((v) => F(v) === null));
    t("sans réglages, la config de l'index est rendue telle quelle (même objet)",
      (() => { const c = { a: 1 }; return U(c, null) === c && U(null, null) === null; })());
    t("reglages.json lu avec l'index, même délai, mémoire à part ; absent (404) = aucun réglage, sans erreur",
      /Promise\.all\(\[_lireIndex\(\), _lireReglages\(\)\]\)/.test(KI) &&
      /fetch\("data\/reglages\.json", \{ cache: "no-store"/.test(KI) &&
      /if \(!r\.ok\) return \{ repondu: true, reglages: null \};/.test(KI) && !/console\.(warn|error)/.test(KI));
  }
}

// ── 4. 🔒 Le hash d'instance est EXCLUSIF (exécuté) ──────────────────────
// 🩸 Un code connu de tous accepté EN PLUS ouvrirait toutes les instances privées. Décision du vrai
// `_onSubmit`, de `const hashInstance = …` à `okInstance`, rendue synchrone (`_hashInstance` stubé).
{
  const m = GATE.match(/const hashInstance = await _hashInstance\(\);[\s\S]*?const okInstance\s*=[^\n]*;/);
  t("la décision de déverrouillage est extractible", !!m);
  if (m) {
    const frag = m[0].replace("await _hashInstance()", "_hashInstance()");
    const jouer = (hashInstance, hashed) => {
      const sb = { _hashInstance: function () { return hashInstance; }, hashed: hashed };
      return vm.runInNewContext("(function(){ " + frag + " return okInstance; })()",
        sb, { filename: "gate.decision.js" });
    };
    t("🔑 instance : SON mot de passe ouvre", jouer(KIOSK, KIOSK) === true);
    t("🩸 instance : l'ancien code communautaire est REFUSÉ (LE TROU FERMÉ)", jouer(KIOSK, VRAI) === false);
    t("🔓 sans mot de passe d'instance, AUCUNE saisie n'ouvre (plus de code en dur)", jouer(null, VRAI) === false);
    t("instance : un mot de passe quelconque est refusé", jouer(KIOSK, "d".repeat(64)) === false);
  }
}

// ── 4b. L'index est demandé à chaque tentative ───────────────────────────
{
  t("🔒 l'index est demandé INCONDITIONNELLEMENT au submit",
    /const hashInstance = await _hashInstance\(\);/.test(GATE));
  t("🩸 plus aucun code communautaire dans la décision", !/okCommunaute/.test(GATE));
}

// ── 5. Le succès mémorise ce qu'il faut ──────────────────────────────────
{
  t("🔑 le hash accepté est stocké", /localStorage\.setItem\(LS_UNLOCK, hashed\);/.test(GATE));
  t("🩸 un succès d'instance mémorise le hash d'instance (sans quoi : hors-ligne, reverrouillé)",
    /localStorage\.setItem\(LS_UNLOCK_KIOSQUE, hashInstance\);/.test(GATE));
  const memo = extraire("_memoriserAccesLibre") || "";
  t("🔓 « Entrer » mémorise l'accès libre et efface la mémoire d'instance",
    /setItem\(LS_UNLOCK, ACCES_LIBRE\)[\s\S]{0,80}removeItem\(LS_UNLOCK_KIOSQUE\)/.test(memo));
  t("🔓 « Entrer » passe par cette mémoire, sur l'écran Bienvenue comme sur sa carte de repli",
    /surEntree: function\(visite\) \{[\s\S]{0,120}_memoriserAccesLibre\(\)/.test(GATE) &&
    /btnLibre\.addEventListener\("click", function\(\) \{\s*_memoriserAccesLibre\(\)/.test(GATE));
  t("🔓 le mode de l'écran est décidé AVANT de le dessiner (hash d'instance lu d'abord)",
    /_hashInstance\(\)[^\n]*\.then\(function\(h\) \{ _monterGateMode\(h\); \}\)/.test(GATE));
  t("🔓 carte de repli libre : bouton « Entrer », pas de champ mot de passe ; carte d'instance : l'inverse",
    /\(libre\s*\?\s*'<button type="button" id="kta-unlock-libre-btn"[\s\S]{0,200}:\s*'<form id="kta-unlock-form"/.test(GATE));
  t("l'écran Bienvenue est monté avec ou sans mot de passe, en lui passant le hash d'instance",
    /if \(!repli\) \{ _monterBienvenue\(hashInstance\); return; \}/.test(GATE));
  t("🩸 écran Bienvenue introuvable (cache incomplet) → carte de repli du MÊME mode, jamais d'écran vide",
    /if \(!pret\) \{[\s\S]{0,160}_monterGateMode\(hashInstance, true\)/.test(GATE));
  // 🔒 Instance protégée sur l'écran Bienvenue : la vérification est celle de la carte (_essayerCode), rien n'y
  // mémorise l'accès libre, et la sortie ne résout la gate qu'après un code juste.
  {
    const mb = extraire("_monterBienvenue") || "";
    const prot = (mb.match(/if \(hashInstance\) \{[\s\S]*?\r?\n        return;\r?\n      \}/) || [""])[0];
    t("🔒 Bienvenue protégé : le champ passe par _essayerCode / _etatCode", /code: \{ essayer: _essayerCode, etat: _etatCode \}/.test(prot));
    t("🔒 Bienvenue protégé : « Entrer » ne mémorise JAMAIS l'accès libre (libre-v1 ouvrirait l'instance)",
      prot.length > 0 && !/_memoriserAccesLibre|ACCES_LIBRE/.test(prot));
    t("🔒 Bienvenue protégé : la gate n'est résolue qu'après un code juste",
      /surFin: function\(\) \{\s*if \(_codeAccepte\) _resoudre\(\);\s*else _monterGate\(\);/.test(prot));
    const essai = extraire("_essayerCode") || "";
    t("🔒 _codeAccepte n'est posé que dans la branche du code juste",
      (GATE.match(/_codeAccepte = true/g) || []).length === 1 &&
      /if \(okInstance\) \{[\s\S]{0,400}_codeAccepte = true;/.test(essai));
    t("🔒 un essai pendant le verrou est refusé avant tout calcul", /^[^\n]*\{\s*if \(isLockedOut\(\)\) return \{ etat: "verrou" \};/.test(essai));
    const BV = fs.readFileSync("js/bienvenue.js", "utf8");
    t("🔒 bienvenue.js : avec code, « Entrer » et la visite remontent au champ au lieu d'entrer",
      /if \(action === "entrer"\) \{ if \(code\) allerAuChamp\(false\); else entrer\(false\); \}/.test(BV) &&
      /if \(action === "visite"\) \{ if \(code\) allerAuChamp\(true\); else entrer\(true\); \}/.test(BV));
    t("🔒 bienvenue.js : l'entrée après saisie n'a lieu que sur un essai « ok »",
      (BV.match(/entrer\(visiteVoulue\)/g) || []).length === 1 &&
      /if \(r\.etat === "ok"\) \{[^}]{0,80}entrer\(visiteVoulue\);/.test(BV));
  }
  t("🩸 le verrou temporisé ne s'applique qu'à l'écran avec mot de passe", /if \(!libre && isLockedOut\(\)\)/.test(GATE));
}

// ── 6. Le branchement dans le boot ───────────────────────────────────────
// La revalidation passe AVANT la gate : une rotation de mot de passe prend effet dès ce démarrage
// (jamais en pleine session).
{
  const appels = MAIN.match(/window\.UnlockGate\.revaliderInstance\(/g) || [];
  t("main.js revalide UNE seule fois", appels.length === 1);
  t("🩸 …seulement si l'index a VRAIMENT répondu (une config rejouée de mémoire ne révoque rien)",
    /if \(_instanceBoot && _instanceBoot\.repondu && window\.UnlockGate &&[\s\S]{0,120}window\.UnlockGate\.revaliderInstance\(_instanceBoot\.config \? _instanceBoot\.config\.accessHash : null, true\);/.test(MAIN));
  const iCharge = MAIN.indexOf("await window.KtaInstance.charger() : null;");
  const iRev = MAIN.indexOf("window.UnlockGate.revaliderInstance(");
  const iGate = MAIN.indexOf("window.UnlockGate && !window.UnlockGate.isUnlocked())");   // précédé de !_gateDelegueeOk
  t("🔑 ordre du boot : config d'instance → revalidation → gate (rotation à effet immédiat)",
    iCharge > 0 && iRev > iCharge && iGate > iRev);
  t("la licence n'est attendue avant la gate que si l'instance déclare « on » (myktamap.fr non ralenti)",
    /if \(_scBoot && _scBoot\.state === "on" && window\.MyKTAMapProLicense/.test(MAIN));
  t("🩸 _chargerIndexServeur ne relit plus l'index (une seule lecture par démarrage)",
    /const st = await window\.KtaInstance\.charger\(\);\s*idx = st && st\.repondu \? st\.index : null;/.test(MAIN));
}

// ── 7. 🔒 ConfAdmin ne stocke jamais le mot de passe ─────────────────────
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

// ── 8. 🔒 On ne promet pas de la sécurité ────────────────────────────────
// Un déployeur qui croit avoir posé une authentification prend des risques : on dit ce que ça vaut.
{
  t("🔒 le code dit que le hash est PUBLIC et brute-forçable",
    /brute-forcer hors ligne/.test(GATE) && /[Bb]arrière SOCIALE/.test(GATE));
  t("🔒 ConfAdmin prévient le déployeur au moment où il tape",
    /pas une authentification/i.test(CA));
  // 🩸 Le champ CITÉ (backticks) : une simple sous-chaîne laisse passer `accessHashXX`. Et la phrase
  // qui dit ce que ça vaut : documenter un mot de passe sans dire qu'il est brute-forçable est pire
  // que ne rien documenter.
  ["docs/applications/SELFHOST.md", "docs/architecture/community-server-line.md"].forEach(function (f) {
    const D = fs.readFileSync(f, "utf8");
    const nom = f.split("/").pop();
    // Cité tel quel ou qualifié (`config.accessHash`) ; une paraphrase est refusée.
    t("📄 " + nom + " documente le champ `accessHash`",
      /`[a-z. >]*accessHash`/.test(D));
    t("📄 " + nom + " dit qu'il est PUBLIC et brute-forçable, pas une authentification",
      /public/i.test(D) && /(brute-forc|hors ligne)/i.test(D) &&
      /jamais une authentification/i.test(D));
  });
}

// ── 9. 🔒 Aucune licence pro ne contourne un mot de passe ────────────────
// 🩸 Le `/Licence-pro.json` d'une instance est servi à TOUS les visiteurs : s'il contournait la gate,
// l'`accessHash` serait muet. Instance protégée → AUCUNE source ne contourne ; la licence n'accorde
// que le MODE pro. On EXÉCUTE la décision extraite de main.js.
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

  // Pas d'import de licence par l'utilisateur (gate et profil) : il n'active rien (licence SERVEUR
  // exigée) et ne servirait qu'à passer la gate.
  const PL = fs.readFileSync("js/proLicense.js", "utf8");
  const PROF = fs.readFileSync("js/homeProfile.js", "utf8");
  t("🩸 la gate ne propose plus d'importer une licence (ni bloc, ni champ fichier)",
    !/kta-unlock-licence|type="file"|importFile/.test(GATE));
  t("🩸 le profil ne propose plus d'importer ni de retirer une licence",
    !/kta-profile-pro-input|importFile|removeLocal/.test(PROF));
  t("🩸 proLicense n'expose plus importFile / removeLocal, une licence locale ancienne est purgée",
    !/importFile:|removeLocal:/.test(PL) && /localStorage\.removeItem\(LS_KEY_LOCAL\)/.test(PL) &&
    !/_activeSource = "local"/.test(PL));
  t("le prédicat instanceRequiertMotDePasse est exposé",
    /instanceRequiertMotDePasse: instanceRequiertMotDePasse/.test(GATE) &&
    /async function instanceRequiertMotDePasse\(\)/.test(GATE));
  // 🩸 Le blocage ne dépend pas de la source : un test `getSource() === "local"` épargnerait la
  // licence serveur.
  t("🩸 la décision de bypass ne discrimine plus par source (plus de test \"local\")",
    !/getSource\(\) === "local"/.test(MAIN));
}

// ── 10. Incognito hérite de tous les déverrouillages ─────────────────────
// 🩸 Le shim incognito ne relit le disque que pour les clés de READ_DISK_WHITELIST : une clé de
// déverrouillage absente de la liste fait échouer `isUnlocked()` (`v === k`) et réafficher la gate
// en privé. ⚠️ Toute nouvelle clé lue par la gate doit y être ajoutée.
{
  const INCOG = fs.readFileSync("js/incognitoMode.js", "utf8");
  const iWl = INCOG.indexOf("READ_DISK_WHITELIST");
  const iFin = iWl >= 0 ? INCOG.indexOf("};", iWl) : -1;
  const whitelist = (iWl >= 0 && iFin > iWl) ? INCOG.slice(iWl, iFin) : "";
  t("la whitelist de lecture disque incognito est trouvable", whitelist.length > 0);

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

// ── 11. Écran d'arrivée selon le domaine (presentationComplete, exécutée) ──────
// Présentation complète sur les domaines de myktamap.fr et en local ; toute autre installation : la ville seule.
// 🩸 Une seule liste : recopiée ailleurs, elle divergerait (un domaine ajouté d'un côté seulement).
{
  const code = extraire("presentationComplete");
  const liste = GATE.match(/const HOTES_PRESENTATION = \[[^\]]*\];/);
  t("presentationComplete et sa liste sont extractibles", !!code && !!liste);
  if (code && liste) {
    const sb = {};
    vm.runInNewContext(liste[0] + code + "; f = presentationComplete;", sb, { filename: "gate.hote.js" });
    const f = sb.f;
    t("présentation complète : myktamap.fr, www., dev., localhost, 127.0.0.1 (casse et point final tolérés)",
      ["myktamap.fr", "www.myktamap.fr", "dev.myktamap.fr", "localhost", "127.0.0.1", "MyKTAMap.FR",
        "myktamap.fr."].every(f));
    t("ville seule : tout autre hôte (auto-hébergé, sous-domaine, IP, hôte vide)",
      !["club.exemple.org", "pro.myktamap.fr", "myktamap.fr.exemple.org", "exemple-myktamap.fr", "127.0.0.2",
        "192.168.1.10", "[::1]", "", null, undefined].some(f));
  }
  const autres = fs.readdirSync("js").filter((n) => n.endsWith(".js") && n !== "unlockGate.js" &&
    /dev\.myktamap\.fr/.test(fs.readFileSync("js/" + n, "utf8")));
  t("🩸 la liste des domaines de présentation n'est recopiée dans aucun autre module (" + autres.join(", ") + ")",
    autres.length === 0);
  t("l'hôte de la page décide, et les deux écrans (avec et sans code) reçoivent la ville seule",
    /presentationComplete\(typeof location !== "undefined" \? location\.hostname : ""\)/.test(GATE) &&
    (GATE.match(/villeSeule: ville,/g) || []).length === 2);
  t("textes de la ville seule : réglages puis index, par KtaExtensions.textesAccueil (une seule lecture de config.accueil)",
    /KE\.textesAccueil\(cfg, st \? st\.reglages : null\)/.test(GATE) && !/[\w)\]]\.accueil\b/.test(GATE.replace(/\/\/.*$/gm, "")));
  t("exposée (UnlockGate.presentationComplete) pour les tests", /presentationComplete: presentationComplete/.test(GATE));
}

console.log(ko === 0 ? "\n🎉 gate : le mot de passe de l'instance ou « Entrer », et aucune promesse de trop"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
