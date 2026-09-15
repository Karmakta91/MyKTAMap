#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📐 check-home-layout.js — le HOME PC ne dépend pas du zoom (pré-commit)
// =====================================================================
// 🩸 KARMA, 15/09/2026 : « on a encore un souci de zoom, si je dézoome ça
// rentre bien. Ça fait plusieurs fois qu'on bosse sans résoudre ce problème. »
//
// L'audit (mesures Playwright, 13 configurations de 1000 à 2400 px et de 80 à
// 125 % de zoom) a établi que ce n'était NI la largeur NI le zoom : la colonne
// Actions fait 300 px partout depuis la v1.69.0. Deux causes réelles :
//   1. HORIZONTAL — cinq outils dans deux colonnes = un orphelin, seul à
//      droite d'une cellule vide, son libellé sur deux lignes.
//   2. VERTICAL — la colonne d'un portable (1536×800) était à zéro de marge ;
//      +128 px ajoutés en deux commits ont fait passer « Charger ce plan »,
//      le bouton PRIMAIRE, dans le scroll interne de #panelZip (filet v1.88.1)
//      sans indice visuel. Le dézoom rend la fenêtre plus haute, c'est tout.
//
// Onze passes en quatre mois avaient chacune posé UNE CONSTANTE (300, 58→44,
// 520, 820…) à un endroit différent, sans jamais écrire l'invariant. Le voici,
// vérifié : « Charger ce plan » ne peut pas disparaître, un nombre impair
// d'outils ne laisse pas d'orphelin, et AUCUNE nouvelle largeur en px n'entre
// sur la colonne Actions. Ce garde lit le CSS ; la mesure au navigateur vit
// dans scripts/smoke/checkup-home-scroll.js (porte de release).
//
// Usage : node scripts/check-home-layout.js
// =====================================================================

const fs = require("fs");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const CSS = fs.readFileSync("css/style.css", "utf8").replace(/\r\n/g, "\n");

// Extrait le corps d'une règle `sel { … }` au premier niveau ou dans un média.
function regle(source, selecteur) {
  const i = source.indexOf(selecteur + " {");
  if (i < 0) return null;
  const j = source.indexOf("}", i);
  return source.slice(i + selecteur.length + 2, j);
}
// Le média « PC bas » où la colonne scrolle en interne (v1.88.1) — la seule
// zone où le bouton primaire PEUT se retrouver hors de vue.
function bloc(source, ouverture) {
  const i = source.indexOf(ouverture);
  if (i < 0) return null;
  let p = source.indexOf("{", i) + 1, prof = 1;
  while (p < source.length && prof > 0) { if (source[p] === "{") prof++; else if (source[p] === "}") prof--; p++; }
  return source.slice(i, p);
}

// ---------- 1. L'orphelin ----------
{
  const tuile = regle(CSS, ".loader-secondary-actions .loader-btn-secondary");
  t("📐 la tuile d'outil existe (grille .loader-secondary-actions)", !!tuile);
  t("🩸 un libellé plus long que la tuile se REPLIE (min-width: 0 — sinon le contenu dicte la cellule)",
    !!tuile && /min-width:\s*0;/.test(tuile));
  t("…et se coupe proprement (overflow-wrap)", !!tuile && /overflow-wrap:\s*anywhere;/.test(tuile));
  const orphelin = regle(CSS, ".loader-secondary-actions .loader-btn-secondary:nth-child(odd):last-child");
  t("🩸 le DERNIER d'une liste impaire prend toute la largeur (plus d'orphelin, à tout zoom)",
    !!orphelin && /grid-column:\s*1\s*\/\s*-1;/.test(orphelin));
  const grille = regle(CSS, ".loader-secondary-actions");
  t("la grille reste à DEUX colonnes fixes (la règle de l'orphelin n'est juste que pour deux)",
    !!grille && /grid-template-columns:\s*1fr 1fr;/.test(grille));
  t("…et aucun `auto-fit` ne vient la rendre variable (une tablette à trois colonnes casserait l'orphelin)",
    !/\.loader-secondary-actions\s*\{[^}]*auto-fit/.test(CSS));
}

// ---------- 2. Le budget vertical ----------
{
  const pcBas = bloc(CSS, "@media (min-width: 1024px) and (max-height: 820px)");
  t("📐 le média « PC bas » (≤ 820 px de haut) existe", !!pcBas);
  const scroller = pcBas && regle(pcBas, ".loader-col-actions #panelZip");
  t("🩸 #panelZip y scrolle EN INTERNE (filet v1.88.1 — c'est lui qui peut cacher le primaire)",
    !!scroller && /overflow-y:\s*auto;/.test(scroller));
  const primaire = pcBas && regle(pcBas, ".loader-col-actions #panelZip .loaderActions");
  t("🩸 « Charger ce plan » est ÉPINGLÉ en bas du scroller (position: sticky; bottom: 0)",
    !!primaire && /position:\s*sticky;/.test(primaire) && /bottom:\s*0;/.test(primaire));
  t("…avec un fond (sinon le contenu défile à travers le bouton)",
    !!primaire && /background:/.test(primaire));
  const clair = pcBas && regle(pcBas, "html.kta-theme-light .loader-col-actions #panelZip .loaderActions");
  t("…et son fond en thème CLAIR (un fond sombre sous un bouton sur carte crème = tache)",
    !!clair && /background:/.test(clair));
  t("ce qui se comprime est DÉCORATIF : la liste des formats se retire sur écran bas",
    !!pcBas && /\.loader-col-actions \.zip-drop-sig \{ display: none; \}/.test(pcBas));
  const tuilesBas = pcBas && regle(pcBas, ".loader-col-actions .loader-secondary-actions .loader-btn-secondary");
  t("les tuiles Outils passent un cran plus bas sur écran bas (cible souris, pas tactile)",
    !!tuilesBas && /min-height:\s*(3[0-9]|40)px;/.test(tuilesBas));
}

// ---------- 3. Aucune nouvelle constante en px ----------
// 🩸 C'est LA règle qui empêche le retour du bug : chaque passe précédente
// avait « réglé » le HOME en posant une largeur en px quelque part. Seul le
// rail de la grille (300px, décision v1.69.0) a le droit d'être fixe.
{
  const re = /\.loader-(?:col-actions|secondary-actions)[^{]*\{([^}]*)\}/g;
  const fautifs = [];
  let m;
  while ((m = re.exec(CSS))) {
    const corps = m[1];
    const w = corps.match(/(?:^|[^-])(width|min-width|max-width|flex-basis):\s*\d+(?:\.\d+)?px/);
    if (w) fautifs.push(m[0].split("{")[0].trim() + " → " + w[0].trim());
  }
  t("🩸 AUCUNE largeur en px sur la colonne Actions ni sur la grille Outils (le rail seul est fixe)" +
    (fautifs.length ? " — " + fautifs.join(" ; ") : ""), fautifs.length === 0);
  t("le commentaire du plancher 520 px ne prétend plus « couvrir » une hauteur mesurée à la main",
    !/Actions compactée\s+~510 px/.test(CSS));
}

console.log(ko === 0 ? "\n🎉 HOME PC : orphelin pleine largeur, primaire épinglé, pas de nouvelle constante en px"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
