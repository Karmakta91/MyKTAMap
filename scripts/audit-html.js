#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// audit-html.js — génère les pages d'audit réseau depuis leurs .md
// =====================================================================
// docs/applications/NETWORK_AUDIT{,_HISTORIQUE}.md → .html. ⚠️ Le .md est la SEULE source : un .html tenu
// à la main diverge (sections manquantes, débordement mobile). Le .html est un produit, régénéré au bump.
// Autonome (moteur Markdown : scripts/md-mini.js). Page sans style ni script écrit dedans (CSP
// `script-src 'self'`) : feuille docs/applications/audit.css, pied audit-pied.js (licence community / pro).
// Usage : node scripts/audit-html.js → (ré)écrit les deux .html ;
//         --check → n'écrit rien, code 1 si un .html diffère de son .md (garde-fou : check-audit-html.js).
// Reproductible : même .md → mêmes octets (aucune date, aucun hasard ; fins de ligne LF).
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const md = require("./md-mini.js");

const RACINE = path.join(__dirname, "..");
const DOSSIER = "docs/applications";

const PAGES = [
  {
    md: "NETWORK_AUDIT.md",
    html: "NETWORK_AUDIT.html",
    retour: { href: "../../index.html", texte: "← Retour à MyKTAMap" },
    pied: { href: "NETWORK_AUDIT_HISTORIQUE.html", texte: "Historique des versions de l'audit" }
  },
  {
    md: "NETWORK_AUDIT_HISTORIQUE.md",
    html: "NETWORK_AUDIT_HISTORIQUE.html",
    retour: { href: "NETWORK_AUDIT.html", texte: "← Retour à l'audit réseau" },
    pied: { href: "NETWORK_AUDIT.html", texte: "Audit réseau : l'état actuel" }
  }
];
const MD_VERS_HTML = Object.create(null);
PAGES.forEach((p) => { MD_VERS_HTML[p.md] = p.html; });

// Politique des liens : schémas dangereux refusés ; un lien vers l'autre .md d'audit vise sa page .html.
function lien(url) {
  const u = String(url).trim();
  if (/^(javascript|data|vbscript|file):/i.test(u.replace(/[\s\u0000-\u001f]/g, ""))) return null;
  if (/^https?:\/\//i.test(u)) return { href: u, externe: true };
  if (/^mailto:/i.test(u) || u.startsWith("#")) return { href: u, externe: false };
  const m = /^([^#?]*)(.*)$/.exec(u);
  const cible = MD_VERS_HTML[path.posix.basename(m[1])];
  if (cible && !m[1].includes("/")) return { href: cible + m[2], externe: false };
  return { href: u, externe: false };
}

function rendrePage(page, source) {
  const r = md.rendre(source, { lien });
  if (!r.titre) throw new Error(page.md + " : pas de titre « # » en tête");
  let corps = r.html;
  // Le h1 n'a pas d'ancre « # » (c'est le haut de la page).
  corps = corps.replace(/^(<h1 [^>]*>[\s\S]*?) <a class="kta-ancre"[^>]*>#<\/a>(<\/h1>)/, "$1$2");
  // La citation qui suit le h1 est le chapeau de la page (« À jour pour la version… ») : bloc .meta.
  corps = corps.replace(/(<\/h1>\n)<blockquote>([\s\S]*?)<\/blockquote>/, '$1<div class="meta">$2</div>');
  // Les « --- » du .md séparent les sections sur GitHub ; ici le h2 porte déjà son filet.
  corps = corps.replace(/<hr>\n(<h2 )/g, "$1");
  const titre = md.esc(r.titre);
  return [
    "<!DOCTYPE html>",
    '<html lang="fr">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="author" content="Flavien VIDAL (alias KARMA)">',
    '<meta name="copyright" content="(c) 2026 Flavien VIDAL — CC BY-NC-SA 4.0">',
    '<meta name="generator" content="scripts/audit-html.js">',
    "<title>" + titre + "</title>",
    '<link rel="icon" type="image/png" href="../../icon/mkm-full.png">',
    '<link rel="stylesheet" href="audit.css">',
    "</head>",
    "<body>",
    "<!-- GÉNÉRÉ par scripts/audit-html.js depuis " + page.md + " — ne pas éditer : modifier le .md, puis",
    "     node scripts/audit-html.js (le pre-commit refuse un .html qui ne correspond pas à son .md). -->",
    '<div class="wrap">',
    '<a class="header-back" href="' + md.esc(page.retour.href) + '">' + md.esc(page.retour.texte) + "</a>",
    corps,
    '<div class="footer">',
    '<a href="' + md.esc(page.pied.href) + '">' + md.esc(page.pied.texte) + "</a> ·",
    '<span class="kta-licence-community">© 2026 KARMA · CC BY-NC-SA 4.0 · Usage commercial interdit</span>',
    '<span class="kta-licence-pro">© 2026 MyKTAMap — édition pro · Tous droits réservés · ' +
      "✓ Licence professionnelle active</span>",
    "</div>",
    "</div>",
    '<script src="audit-pied.js"></script>',
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

// Pour le garde-fou : rend une page depuis un contenu .md donné (lu dans l'index Git, par ex.)
function generer(nomMd, source) {
  const page = PAGES.find((p) => p.md === nomMd);
  if (!page) throw new Error("page d'audit inconnue : " + nomMd);
  return rendrePage(page, String(source).replace(/^﻿/, ""));
}

const lf = (s) => String(s).replace(/\r\n?/g, "\n");

module.exports = { PAGES, DOSSIER, generer, lf };

if (require.main === module) {
  const verifier = process.argv.includes("--check");
  let ecarts = 0;
  PAGES.forEach((p) => {
    const fMd = path.join(RACINE, DOSSIER, p.md);
    const fHtml = path.join(RACINE, DOSSIER, p.html);
    const attendu = generer(p.md, fs.readFileSync(fMd, "utf8"));
    const actuel = fs.existsSync(fHtml) ? lf(fs.readFileSync(fHtml, "utf8")) : null;
    if (actuel === attendu) {
      console.log("✅ [audit-html] " + p.html + " à jour");
      return;
    }
    if (verifier) {
      ecarts++;
      console.error("❌ [audit-html] " + p.html + " ne correspond pas à " + p.md);
      return;
    }
    fs.writeFileSync(fHtml, attendu);
    console.log("✍️  [audit-html] " + p.html + " régénéré depuis " + p.md);
  });
  if (ecarts) {
    console.error("   → node scripts/audit-html.js, puis indexer les .html régénérés.");
    process.exit(1);
  }
}
