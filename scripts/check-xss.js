#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-xss.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// 🔒 Un nom de point dans un `onclick="…"` échappé pour le JS seulement sort de
// l'attribut avec un « " » : le code s'exécute à l'ouverture de la fiche (ZIP
// de plan ou session partagés). Ce contrôle garde :
//   1. la fiche d'un point et sa section liaisons SANS gestionnaire inline ;
//   2. l'écouteur unique en capture qui exécute leurs actions ;
//   3. les filtres d'entrée de js/config.js (icônes, couleurs, libellés),
//      EXÉCUTÉS contre des charges d'attaque ;
//   4. la légende personnalisée passée par ces filtres ;
//   5. les deux chemins d'ouverture d'un plan (ZIP et site) assainis ;
//   6. aucune donnée brute dans un message ktaConfirm (rendu en HTML).
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c, detail) => { console.log((c ? "✅" : "❌") + " " + n + (c || detail === undefined ? "" : " — " + detail)); if (!c) ko++; };
const lire = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

const UTILS = lire("js/utils.js");
const LIENS = lire("js/interPlanLinks.js");
const CONFIG = lire("js/config.js");
const LEGENDE = lire("js/legendCustomization.js");

// Corps d'une fonction nommée (de « function nom( » à la ligne « } » de même retrait).
function corps(src, nom) {
  const i = src.indexOf("function " + nom + "(");
  if (i < 0) return "";
  const retrait = src.lastIndexOf("\n", i) + 1;
  const pad = src.slice(retrait, i);
  const fin = src.indexOf("\n" + pad + "}", i);
  return fin < 0 ? "" : src.slice(i, fin + pad.length + 2);
}

// ── 1. Fiche d'un point et section liaisons : aucun gestionnaire inline ──
{
  const fiche = corps(UTILS, "buildPointPopupHtml");
  t("fiche d'un point trouvée (buildPointPopupHtml)", fiche.length > 1000);
  t("🩸 fiche d'un point : aucun onclick / onerror / on…= inline", !/\bon[a-z]+=\\?["']/i.test(fiche));
  const section = corps(LIENS, "buildPopupHtml");
  t("section liaisons trouvée (InterPlanLinks.buildPopupHtml)", section.length > 500);
  t("🩸 section liaisons : aucun gestionnaire inline", !/\bon[a-z]+=\\?["']/i.test(section));
  t("🩸 le bouton « Lier » n'utilise pas data-kta-uid (réservé aux prises d'extension sur la fiche)",
    !/data-kta-uid=/.test(section));
}

// ── 2. L'écouteur unique, en capture ─────────────────────────────────
{
  t("écouteur des actions de fiche posé EN CAPTURE (la popup Leaflet arrête la propagation)",
    /document\.addEventListener\("click", _ktaPopupAction, true\)/.test(UTILS));
  const ecouteur = corps(UTILS, "_ktaPopupAction");
  const actions = ["modifier", "repositionner", "supprimer", "gps", "tts", "ici", "aller", "etape", "favori"];
  t("chaque action de la fiche a son cas dans l'écouteur",
    actions.every((a) => ecouteur.indexOf('case "' + a + '"') >= 0), actions.filter((a) => ecouteur.indexOf('case "' + a + '"') < 0));
  t("…et celles des liaisons (ipl-go / ipl-del / ipl-add)",
    ["ipl-go", "ipl-del", "ipl-add"].every((a) => ecouteur.indexOf('"' + a + '"') >= 0));
  t("🩸 l'écouteur ne fait jamais d'eval / new Function", !/\beval\(|new Function/.test(ecouteur));
}

// ── 3. Filtres d'entrée : les vraies fonctions, contre des charges ───
{
  const ctx = { console: { warn() {}, log() {} } };
  ctx.window = ctx;
  const src = ["ktaCheminIconePlausible", "nettoyerIconesConfig", "ktaCouleurSure", "ktaTexteSur", "ktaAssainirPlanConfig"]
    .map((n) => corps(CONFIG, n)).join("\n");
  let charge = true;
  try { vm.runInNewContext(src + "\nwindow.__f = { ktaCheminIconePlausible, ktaCouleurSure, ktaTexteSur, ktaAssainirPlanConfig };", ctx); }
  catch (e) { charge = false; console.log(e.message); }
  t("filtres de js/config.js chargés et exécutables", charge && !!ctx.__f);
  if (ctx.__f) {
    const F = ctx.__f;
    const iconesOk = ["icon/pa.png", "data/x/icons/puits.svg", "https://ex.org/a.webp", "blob:https://x/1",
      "data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E", "data:image/png;base64,iVBORw0K", "l'entrée.png"];
    const iconesKo = ['" onerror=alert(1) x=".png', "a<script>.png", "javascript:alert(1)//.png",
      "data:text/html,<script>alert(1)</script>.png", "x`.png", "a\\b.png", "Icône SVG intégrée à l'application"];
    t("icônes légitimes acceptées (chemins, https, blob, data:image dont SVG intégré avec « ' »)",
      iconesOk.every((v) => F.ktaCheminIconePlausible(v)), iconesOk.filter((v) => !F.ktaCheminIconePlausible(v)));
    t("🩸 icônes piégées refusées (sortie d'attribut, balise, javascript:, data: non image)",
      iconesKo.every((v) => !F.ktaCheminIconePlausible(v)), iconesKo.filter((v) => F.ktaCheminIconePlausible(v)));
    const coulOk = ["#f4c542", "#abc", "#11223344", "rgb(1, 2, 3)", "rgba(1,2,3,.5)", "hsl(120, 50%, 50%)", "red"];
    const coulKo = ["red;background:url(x)", '#fff" onmouseover="x', "expression(alert(1))", "url(javascript:x)", "#ggg", ""];
    t("couleurs légitimes acceptées", coulOk.every((v) => F.ktaCouleurSure(v) === v.trim()), coulOk.filter((v) => !F.ktaCouleurSure(v)));
    t("🩸 couleurs piégées refusées (→ null, le canon reprend la main)", coulKo.every((v) => F.ktaCouleurSure(v) === null),
      coulKo.filter((v) => F.ktaCouleurSure(v) !== null));
    t("🩸 texte : < > \" ` retirés, le reste gardé", F.ktaTexteSur('Galerie <b>"nord"</b> `x` l\'entrée') === "Galerie bnord/b x l'entrée");
    const cfg = { plan: { name: "<img src=x onerror=1>", author: 'a"b', version: "1.0" },
      icons: { ok: "icon/pa.png", ko: '" onerror=alert(1) x=".png' },
      dataLayers: [{ id: "puits", label: "<b>Puits</b>" }, { id: 'x" onclick="1', label: "piège" }],
      imageLayers: [{ id: "legende", label: "Légende" }] };
    F.ktaAssainirPlanConfig(cfg, "test");
    t("🩸 plan-config : nom / auteur sans balise ni guillemet", !/[<>"]/.test(cfg.plan.name + cfg.plan.author), cfg.plan.name + " | " + cfg.plan.author);
    t("🩸 plan-config : icône piégée retirée, légitime gardée", cfg.icons.ok === "icon/pa.png" && !("ko" in cfg.icons));
    t("🩸 plan-config : calque à l'identifiant piégé écarté, libellé nettoyé",
      cfg.dataLayers.length === 1 && cfg.dataLayers[0].label === "bPuits/b" && cfg.imageLayers.length === 1);
  }
}

// ── 4. Légende personnalisée (plan ou session) filtrée ───────────────
{
  const norm = corps(LEGENDE, "_normalize");
  t("légende : _normalize passe les couleurs par ktaCouleurSure", /ktaCouleurSure/.test(norm));
  t("légende : _normalize passe les libellés par ktaTexteSur", /ktaTexteSur/.test(norm));
  t("légende : _normalize vérifie l'icône d'un type personnalisé (ktaCheminIconePlausible)", /ktaCheminIconePlausible/.test(norm));
  t("🩸 légende : un id de type personnalisé doit être un jeton sûr", /ID_SUR\.test\(e\.id\)/.test(norm));
}

// ── 5. Les deux chemins d'ouverture d'un plan ────────────────────────
{
  t("plan importé (ZIP) : cloneAndResolvePlanConfig assainit", /ktaAssainirPlanConfig\(resolved/.test(corps(CONFIG, "cloneAndResolvePlanConfig")));
  t("plan du site : loadAppConfig assainit", /ktaAssainirPlanConfig\(config/.test(CONFIG.slice(CONFIG.indexOf("async function loadAppConfig("))));
}

// ── 6. Fenêtres de message : pas de donnée brute dans un message rendu en HTML ──
// ⚠️ window.ktaConfirm insère son message en HTML (contrat, utils.js) : toute donnée venue d'ailleurs passe
// par un échappeur (ktaEsc ou alias). Contrôle volontairement étroit (zéro faux positif), sur le 1er argument
// ou, pour une variable, sa dernière affectation avant l'appel : (a) propriété de nom (.name .label .version…)
// hors échappeur ; (b) variable au nom de donnée (nom, fichier, err, msg…) en paramètre i18n ou concaténée.
// window.ktaAlerte échappe elle-même ; son option `html` est refusée ici (l'ajouter = échapper et élargir ce contrôle).
{
  const ECHAPPEURS = /\b(?:ktaEsc|_escHtml|escapeHtml|_esc|esc)\s*\(/g;
  const NOM_BRUT = /\.\s*(?:name|nom|label|libelle|titre|title|displayName|version|message|planName|pseudo|fileName)\b/;
  const VAR_BRUTE = new RegExp("(?::|\\+)\\s*(?:nom|name|label|libelle|planName|nomPlan|pseudo|fichier|file|fileName|" +
    "version|err|error|e|msg|texte|detail)\\b(?!\\s*[.(\\[])");
  // Fin d'une expression parenthésée : index de la « ) » qui ferme l'ouvrante située en `i - 1`.
  const fermante = (s, i) => {
    for (let p = 0; i < s.length; i++) {
      if (s[i] === "(") p++;
      else if (s[i] === ")") { if (p === 0) return i; p--; }
    }
    return s.length;
  };
  const sansEchappes = (s) => {
    let r = "", i = 0, m;
    ECHAPPEURS.lastIndex = 0;
    while ((m = ECHAPPEURS.exec(s))) {
      if (m.index < i) continue;
      r += s.slice(i, m.index);
      i = fermante(s, m.index + m[0].length) + 1;
      ECHAPPEURS.lastIndex = i;
    }
    return r + s.slice(i);
  };
  // Expression qui commence en `i` et s'arrête au premier séparateur de profondeur 0 (`stop`).
  const expression = (s, i, stop) => {
    let p = 0, j = i;
    for (; j < s.length; j++) {
      const c = s[j];
      if ("([{".includes(c)) p++;
      else if (")]}".includes(c)) { if (p === 0) break; p--; } else if (stop.includes(c) && p === 0) break;
    }
    return s.slice(i, j);
  };
  const brut = (expr) => { const x = sansEchappes(expr); return NOM_BRUT.test(x) || VAR_BRUTE.test(x); };
  const enCommentaire = (src, i) => /^\s*\/\//.test(src.slice(src.lastIndexOf("\n", i) + 1, i));
  const fautifs = (src, f) => {
    const out = [];
    const re = /\bkta(Confirm|Alerte)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      if (/function\s*$/.test(src.slice(Math.max(0, m.index - 12), m.index)) || enCommentaire(src, m.index)) continue;
      const ligne = f + ":" + src.slice(0, m.index).split("\n").length + " ";
      const debut = m.index + m[0].length;
      if (m[1] === "Alerte") {
        if (/\bhtml\s*:/.test(expression(src, debut, ""))) out.push(ligne + "ktaAlerte avec l'option html");
        continue;
      }
      let arg = expression(src, debut, ",").trim();
      if (/^[A-Za-z_$][\w$]*$/.test(arg)) {   // message construit dans une variable : sa dernière affectation
        const avant = src.slice(Math.max(0, m.index - 4000), m.index);
        const aff = new RegExp("\\b" + arg.replace(/\$/g, "\\$") + "\\s*(?:\\+=|=(?!=))", "g");
        let a, der = null;
        while ((a = aff.exec(avant))) der = a;
        arg = der ? expression(avant, der.index + der[0].length, ";") : "";
      }
      if (brut(arg)) out.push(ligne + arg.replace(/\s+/g, " ").trim().slice(0, 90));
    }
    return out;
  };
  // Auto-test : sans lui, le contrôle peut passer à vide sans que personne ne le voie.
  const piege = 'window.ktaConfirm(t("k", { nom: plan.name }));\nktaConfirm("Supprimer " + f.label + " ?");\n' +
    'const msg = t("k", { v: remote.version });\nwindow.ktaConfirm(msg);\nktaConfirm(t("k", { nom: nom }));\n' +
    'ktaConfirm("Fichier " + fichier);\nwindow.ktaAlerte(x, { html: true });';
  const sain = 'window.ktaConfirm(t("k", { nom: escapeHtml(PR.displayName(p)), n: ids.length }));\n' +
    'ktaConfirm(_escHtml(t("k", { nom: pf.name })));\n' +
    'ktaConfirm(t("k", { nom: window.ktaEsc(s.nom) }), { titre: x.titre });\n' +
    'const msg = t("k", { label: window.ktaEsc(p.label), n: p.objets });\nwindow.ktaConfirm(msg);\n' +
    'window.ktaAlerte(t("k", { nom: plan.name }), { type: "erreur" });\n' +
    '// window.ktaConfirm(t("k", { nom: plan.name }))';
  t("fenêtres de message : le contrôle voit une donnée brute (auto-test, 6 pièges)",
    fautifs(piege, "test").length === 6, fautifs(piege, "test").join(" | "));
  t("fenêtres de message : le contrôle accepte un message échappé (auto-test)",
    fautifs(sain, "test").length === 0, fautifs(sain, "test").join(" | "));
  const tous = fs.readdirSync("js").filter((f) => f.endsWith(".js"))
    .reduce((acc, f) => acc.concat(fautifs(lire("js/" + f), "js/" + f)), []);
  t("🩸 ktaConfirm / ktaAlerte : aucune donnée brute dans un message rendu en HTML — ktaEsc()",
    tous.length === 0, tous.join(" | "));
}

console.log(ko ? "\n❌ check-xss : " + ko + " échec(s)" : "\n🎉 XSS : fiche sans gestionnaire inline, entrées d'un plan et d'une légende filtrées");
process.exit(ko ? 1 : 0);
