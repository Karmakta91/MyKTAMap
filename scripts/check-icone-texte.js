#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-icone-texte.js — garde-fou pré-commit BLOQUANT (rejoué en CI)
// =====================================================================
// 🩸 window.ktaIcone(nom) rend du BALISAGE SVG. Posé en textContent / innerText, il s'affiche en clair
// (« <svg class="kta-ico …"> Sans point ») : l'icône va en HTML, le libellé en texte, à part.
// Refuse dans js/*.js, hors commentaires :
//   1. `.textContent = …ktaIcone(` ou `.innerText = …ktaIcone(` (même instruction) ;
//   2. l'appel d'une fonction du même fichier (déclarée `function f(…)` ou `const f = function(…)`) dont un
//      paramètre est posé en textContent / innerText, avec ktaIcone( dans cet argument.
// Limite : une valeur qui transite par une variable ou une propriété n'est pas suivie (lecture du code).
// Exception assumée : ligne marquée « icone-texte-ok ».
// Auto-test au lancement : les deux motifs sont vus sur un exemple, un usage correct ne l'est pas.
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");

function sansCommentaires(src) {
  return src.replace(/(?<![\w"'`/])\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split(/\r?\n/).map((l) => (/^\s*\/\//.test(l) ? "" : l)).join("\n");
}

function ligneDe(src, i) { return src.slice(0, i).split("\n").length; }

// → [{ ligne, motif }] pour un source JS.
function analyser(srcBrut) {
  const src = sansCommentaires(srcBrut);
  const lignesBrutes = srcBrut.split(/\r?\n/);
  const out = [];
  const garder = (i, motif) => {
    const n = ligneDe(src, i);
    if (!/icone-texte-ok/.test(lignesBrutes[n - 1] || "")) out.push({ ligne: n, motif: motif });
  };
  const direct = /\.(textContent|innerText)\s*=[^;]*ktaIcone\(/g;
  let m;
  while ((m = direct.exec(src))) garder(m.index, m[1] + " = …ktaIcone(");
  const fonctions = /(?:function\s+([\w$]+)|(?:const|let|var)\s+([\w$]+)\s*=\s*function)\s*\(([^)]*)\)\s*\{/g;
  while ((m = fonctions.exec(src))) {
    const nom = m[1] || m[2];
    const params = m[3].split(",").map((s) => s.trim()).filter(Boolean);
    const corps = src.slice(m.index, m.index + 4000);
    params.forEach((p, idx) => {
      const pose = new RegExp("\\.(textContent|innerText)\\s*=\\s*" + p.replace(/\$/g, "\\$") + "\\b");
      if (!pose.test(corps)) return;
      const appel = new RegExp("\\b" + nom.replace(/\$/g, "\\$") + "\\(", "g");
      let c;
      while ((c = appel.exec(src))) {
        if (/function\s*$/.test(src.slice(Math.max(0, c.index - 12), c.index))) continue;
        let j = c.index + c[0].length, prof = 1, cur = "";
        const args = [];
        for (; j < src.length && prof > 0; j++) {
          const ch = src[j];
          if ("([{".indexOf(ch) >= 0) prof++;
          if (")]}".indexOf(ch) >= 0) prof--;
          if (prof === 1 && ch === ",") { args.push(cur); cur = ""; continue; }
          if (prof > 0) cur += ch;
        }
        args.push(cur);
        if (args[idx] && /ktaIcone\(/.test(args[idx])) {
          garder(c.index, nom + "(…ktaIcone(…) en argument " + (idx + 1) + ", posé en textContent)");
        }
      }
    });
  }
  return out;
}

// Auto-test : le contrôle voit les deux motifs et laisse passer l'usage correct.
const essai = [
  "function _bouton(libelle, fn) { const b = document.createElement('button'); b.textContent = libelle; return b; }",
  "_bouton(window.ktaIcone('save') + ' ' + t('x'), f);",
  "el.textContent = window.ktaIcone('map') + ' Carte';",
  "el.innerHTML = window.ktaIcone('map') + ' ' + window.ktaEsc(t('y'));",
  "_bouton(t('z'), f);"
].join("\n");
const vus = analyser(essai);
if (vus.length !== 2 || !vus.some((v) => v.ligne === 2) || !vus.some((v) => v.ligne === 3)) {
  console.log("🛑 [check-icone-texte] auto-test : attendu 2 motifs (lignes 2 et 3), vu " + JSON.stringify(vus));
  process.exit(1);
}

const racine = path.join(__dirname, "..", "js");
const fautes = [];
fs.readdirSync(racine).filter((f) => f.endsWith(".js")).forEach((f) => {
  analyser(fs.readFileSync(path.join(racine, f), "utf8"))
    .forEach((v) => fautes.push("js/" + f + ":" + v.ligne + " — " + v.motif));
});
if (fautes.length) {
  console.log("🛑 [check-icone-texte] balisage SVG de ktaIcone posé en texte (il s'affichera en clair) :");
  fautes.forEach((x) => console.log("   • " + x));
  console.log("   Icône en HTML (innerHTML / ktaIcone dans un gabarit), libellé en textContent, passés à part.");
  process.exit(1);
}
console.log("✅ [check-icone-texte] aucune icône SVG posée en texte (auto-test vu : 2 motifs)");
