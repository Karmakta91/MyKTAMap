/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// =====================================================================
// md-mini.js — Markdown → HTML (sous-ensemble GitHub), sans dépendance
// =====================================================================
// Copie autonome du moteur du site de documentation (le dépôt community n'en dépend pas), utilisée par
// scripts/audit-html.js. Couvre titres (ancres GitHub), listes imbriquées et cases, citations, code,
// tableaux alignés, liens, images, emphase, échappements, autoliens.
// 🔒 Tout HTML brut est ÉCHAPPÉ (sauf <br>, <kbd>, <sub>, <sup>), les commentaires HTML retirés, et chaque
// lien passe par ctx.lien() qui refuse javascript:/data:/vbscript:.
// ⚠️ Directive : une ligne `<!-- kta:classe nom1 nom2 -->` pose ces classes ([a-z0-9-]) sur le bloc suivant.
"use strict";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ESC[c]); }
function desc(s) {
  return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

// Texte brut d'un titre (pour l'ancre et le sommaire)
function texteBrut(s) {
  return s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1").replace(/(\*\*|__|\*|_|~~)/g, "").replace(/<[^>]+>/g, "")
    .trim();
}
// Ancre façon GitHub : minuscules, on garde lettres/chiffres/espaces/-/_, espaces → « - »
function slugGitHub(t) {
  return texteBrut(t).toLowerCase().replace(/[\uFE00-\uFE0F\u200D]/g, "").replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/\s/g, "-");
}

const RE = {
  fence: /^( {0,3})(`{3,}|~{3,})\s*([\w+#.-]*)/,
  titre: /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/,
  hr: /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/,
  citation: /^ {0,3}>/,
  liste: /^( *)([-*+]|\d{1,9}[.)])(\s+|$)/,
  sepTable: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
  comm: /^\s*<!--/
};
const blanc = (l) => /^\s*$/.test(l);
const retrait = (l) => l.match(/^ */)[0].length;

function commenceBloc(l, suiv) {
  return RE.fence.test(l) || RE.titre.test(l) || RE.hr.test(l) || RE.citation.test(l) || RE.liste.test(l) ||
    RE.comm.test(l) || /^\s*<\/?(details|summary)\b/i.test(l) ||
    (l.includes("|") && suiv !== undefined && RE.sepTable.test(suiv) && suiv.includes("-"));
}

function Rendu(ctx) {
  this.ctx = ctx;
  this.titres = [];
  this.ids = Object.create(null);
  this.alertes = [];
}

Rendu.prototype.idUnique = function (base) {
  let id = base || "section";
  if (this.ids[id] !== undefined) { this.ids[base] += 1; id = base + "-" + this.ids[base]; }
  else this.ids[id] = 0;
  return id;
};

Rendu.prototype.blocs = function (lignes, serre) {
  const out = [];
  let classe = null, classeIdx = 0;
  const appliquer = () => {
    if (!classe || out.length <= classeIdx) return;
    out[classeIdx] = out[classeIdx].replace(/^<([a-z][a-z0-9]*)(?: class="([^"]*)")?/,
      (_, tag, c) => "<" + tag + ' class="' + (c ? c + " " : "") + classe + '"');
    classe = null;
  };
  let i = 0;
  const n = lignes.length;
  while (i < n) {
    const l = lignes[i];
    if (blanc(l)) { i++; continue; }
    const t = l.trim();
    const dir = /^<!--\s*kta:classe\s+([a-z0-9 -]+?)\s*-->$/.exec(t);
    if (dir) { appliquer(); classe = dir[1].split(/\s+/).join(" "); classeIdx = out.length; i++; continue; }
    appliquer();

    let m = RE.fence.exec(l);
    if (m) {
      const marque = m[2][0], long = m[2].length, ind = m[1].length, lang = m[3];
      const code = [];
      i++;
      const fin = new RegExp("^ {0,3}" + (marque === "`" ? "`" : "~") + "{" + long + ",}\\s*$");
      while (i < n && !fin.test(lignes[i])) { code.push(lignes[i].replace(new RegExp("^ {0," + ind + "}"), "")); i++; }
      i++;
      out.push("<pre><code" + (lang ? ' class="language-' + esc(lang) + '"' : "") + ">" + esc(code.join("\n")) +
        "</code></pre>");
      continue;
    }
    if (RE.comm.test(l)) { // commentaire HTML : retiré (y compris multi-lignes)
      while (i < n && !lignes[i].includes("-->")) i++;
      i++; continue;
    }
    m = RE.titre.exec(l);
    if (m && m[2] !== undefined) {
      const niv = m[1].length, brut = m[2] || "";
      const id = this.idUnique(slugGitHub(brut));
      this.titres.push({ niveau: niv, texte: texteBrut(brut), id });
      out.push("<h" + niv + ' id="' + esc(id) + '">' + this.enLigne(brut) +
        ' <a class="kta-ancre" href="#' + esc(id) + '" aria-label="Lien vers cette section">#</a></h' + niv + ">");
      i++; continue;
    }
    if (RE.hr.test(l)) { out.push("<hr>"); i++; continue; }
    // HTML de bloc autorisé (liste fermée, attributs reconstruits) : <details>, <summary>, <img>
    m = /^\s*<details(?:\s+id="([\w.-]+)")?(\s+open)?\s*>\s*$/i.exec(l);
    if (m) { out.push("<details" + (m[1] ? ' id="' + esc(m[1]) + '"' : "") + (m[2] ? " open" : "") + ">"); i++; continue; }
    if (/^\s*<\/details>\s*$/i.test(l)) { out.push("</details>"); i++; continue; }
    m = /^\s*<summary>(.*)<\/summary>\s*$/i.exec(l);
    if (m) { out.push("<summary>" + this.enLigne(m[1].replace(/<\/?strong>/gi, "**")) + "</summary>"); i++; continue; }
    m = /^\s*<img\s[^>]*src="([^"]+)"[^>]*>\s*$/i.exec(l);
    if (m) {
      const alt = (/alt="([^"]*)"/i.exec(l) || [])[1] || "";
      const r = this.lien(m[1], true);
      out.push(r ? '<p><img src="' + esc(r.href) + '" alt="' + esc(alt) + '" loading="lazy"></p>' : "");
      i++; continue;
    }
    if (RE.citation.test(l)) {
      const sous = [];
      while (i < n && !blanc(lignes[i]) && (RE.citation.test(lignes[i]) || !commenceBloc(lignes[i], lignes[i + 1]))) {
        sous.push(lignes[i].replace(/^ {0,3}> ?/, "")); i++;
      }
      out.push("<blockquote>" + this.blocs(sous, false) + "</blockquote>");
      continue;
    }
    if (l.includes("|") && i + 1 < n && RE.sepTable.test(lignes[i + 1]) && lignes[i + 1].includes("-")) {
      i = this.tableau(lignes, i, out); continue;
    }
    m = RE.liste.exec(l);
    if (m) { i = this.liste(lignes, i, out); continue; }
    const para = [];
    while (i < n && !blanc(lignes[i]) && (para.length === 0 || !commenceBloc(lignes[i], lignes[i + 1]))) {
      if (para.length > 0 && RE.hr.test(lignes[i])) break;
      para.push(lignes[i]); i++;
    }
    if (/^\s*<[a-zA-Z]/.test(para[0])) this.alertes.push("HTML brut échappé : " + para[0].trim().slice(0, 60));
    // 🩸 Rendu D'UN BLOC : un gras, un lien ou un code coupé par un retour à la ligne du .md reste entier.
    // Saut dur : deux espaces ou « \ » en fin de ligne.
    const html = this.enLigne(para.map((p, k) => {
      const dur = k < para.length - 1 && (/ {2,}$/.test(p) || /\\$/.test(p));
      return p.trim().replace(/\\$/, "") + (dur ? "<br>" : "");
    }).join("\n"));
    out.push(serre ? html : "<p>" + html + "</p>");
  }
  appliquer();
  return out.join("\n");
};

Rendu.prototype.tableau = function (lignes, i, out) {
  const cellules = (ligne) => {
    let s = ligne.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const res = [];
    let cur = "", code = false;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (c === "\\" && s[k + 1] === "|") { cur += "\\|"; k++; continue; }
      if (c === "`") code = !code;
      if (c === "|" && !code) { res.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    res.push(cur.trim());
    return res;
  };
  const tete = cellules(lignes[i]);
  const align = cellules(lignes[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : ""));
  const cl = (k) => (align[k] ? ' class="kta-al-' + align[k] + '"' : "");
  let h = '<div class="kta-table"><table><thead><tr>' +
    tete.map((c, k) => "<th" + cl(k) + ">" + this.enLigne(c) + "</th>").join("") + "</tr></thead><tbody>";
  i += 2;
  while (i < lignes.length && !blanc(lignes[i]) && lignes[i].includes("|")) {
    const c = cellules(lignes[i]);
    h += "<tr>" + tete.map((_, k) => "<td" + cl(k) + ">" + this.enLigne(c[k] || "") + "</td>").join("") + "</tr>";
    i++;
  }
  out.push(h + "</tbody></table></div>");
  return i;
};

Rendu.prototype.liste = function (lignes, i, out) {
  const n = lignes.length;
  const m0 = RE.liste.exec(lignes[i]);
  const ind = m0[1].length;
  const ordonnee = /\d/.test(m0[2]);
  const debut = ordonnee ? parseInt(m0[2], 10) : 1;
  const items = [];
  let lache = false;
  while (i < n) {
    const m = RE.liste.exec(lignes[i]);
    if (!m || m[1].length !== ind || /\d/.test(m[2]) !== ordonnee) break;
    const esp = m[3].length > 4 ? 1 : Math.max(m[3].length, 1);
    const decal = ind + m[2].length + esp;
    const contenu = [lignes[i].slice(Math.min(decal, lignes[i].length))];
    i++;
    while (i < n) {
      const l = lignes[i];
      if (blanc(l)) {
        let j = i + 1;
        while (j < n && blanc(lignes[j])) j++;
        if (j < n && retrait(lignes[j]) > ind && !(RE.liste.exec(lignes[j]) && retrait(lignes[j]) <= ind)) {
          for (let k = i; k < j; k++) contenu.push("");
          lache = true; i = j; continue;
        }
        break;
      }
      const r = retrait(l);
      if (r > ind) { contenu.push(l.slice(Math.min(r, decal))); i++; continue; }
      if (RE.liste.test(l)) break;
      if (!commenceBloc(l, lignes[i + 1])) { contenu.push(l.trim()); i++; continue; } // continuation paresseuse
      break;
    }
    items.push(contenu);
    // blancs entre deux items de la même liste → liste « lâche »
    let j = i;
    while (j < n && blanc(lignes[j])) j++;
    if (j > i && j < n) {
      const m2 = RE.liste.exec(lignes[j]);
      if (m2 && m2[1].length === ind && /\d/.test(m2[2]) === ordonnee) { lache = true; i = j; }
    }
  }
  const balise = ordonnee ? "ol" : "ul";
  let h = "<" + balise + (ordonnee && debut !== 1 ? ' start="' + debut + '"' : "") + ">";
  for (const it of items) {
    let coche = "";
    const tc = /^\[( |x|X)\]\s+/.exec(it[0]);
    if (tc) { coche = tc[1] === " " ? "☐ " : "☑ "; it[0] = it[0].slice(tc[0].length); }
    h += "<li>" + coche + this.blocs(it, !lache) + "</li>";
  }
  out.push(h + "</" + balise + ">");
  return i;
};

Rendu.prototype.lien = function (url, image) {
  const r = this.ctx && this.ctx.lien ? this.ctx.lien(url, image) : null;
  return r; // { href, externe } | null
};

Rendu.prototype.enLigne = function (s) {
  const ph = [];
  const mettre = (h) => "\u0001" + (ph.push(h) - 1) + "\u0002";
  // ⚠️ L'ordre des passes compte : ce qui est mis de côté (placeholder) n'est plus échappé ni retouché.
  // 1. code en ligne
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, c) =>
    mettre("<code>" + esc(c.replace(/^ (.*) $/, "$1")) + "</code>"));
  // 2. commentaires HTML en ligne · 3. échappements Markdown · 4. autoliens · 5. HTML en ligne autorisé
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, (_, c) => mettre(esc(c)));
  s = s.replace(/<(https?:\/\/[^\s>]+)>/g, (_, u) => mettre(this.baliseLien(u, esc(u))));
  s = s.replace(/<(\/?)(br|kbd|sub|sup)\s*\/?>/gi, (_, sl, t) => mettre("<" + sl + t.toLowerCase() + ">"));
  // 6. tout le reste est échappé
  s = esc(s);
  // 7. images puis liens
  s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;[^]*?&quot;)?\s*\)/g, (_, alt, url) => {
    const r = this.lien(desc(url), true);
    if (!r) return mettre('<span class="kta-img-absente">[image : ' + alt + "]</span>");
    return mettre('<img src="' + esc(r.href) + '" alt="' + alt + '" loading="lazy">');
  });
  s = s.replace(/\[((?:[^\][]|\[[^\]]*\])+)\]\(\s*([^)\s]+(?:\([^)\s]*\)[^)\s]*)?)(?:\s+&quot;[^]*?&quot;)?\s*\)/g,
    (_, txt, url) => mettre(this.baliseLien(desc(url), this.emphase(txt))));
  // 8. URL nues
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<\u0001]+[^\s<\u0001.,;:!?)\]'"])/g, (_, a, u) =>
    a + mettre(this.baliseLien(desc(u), u)));
  // 9. emphase
  s = this.emphase(s);
  // 10. restaurer (plusieurs passes : placeholders imbriqués)
  for (let k = 0; k < 5 && s.includes("\u0001"); k++) s = s.replace(/\u0001(\d+)\u0002/g, (_, x) => ph[+x]);
  return s;
};

Rendu.prototype.baliseLien = function (url, html) {
  const r = this.lien(url, false);
  if (!r) return '<span class="kta-lien-retire">' + html + "</span>";
  return '<a href="' + esc(r.href) + '"' + (r.externe ? ' class="kta-externe" target="_blank" rel="noopener noreferrer"' : "") +
    ">" + html + "</a>";
};

Rendu.prototype.emphase = function (s) {
  return s
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, "$1<strong>$2</strong>")
    .replace(/(^|[^*\p{L}\p{N}])\*(?=[^\s*])([^*]*?[^\s*])\*(?![*\p{L}\p{N}])/gu, "$1<em>$2</em>")
    .replace(/(^|[^_\p{L}\p{N}])_(?=[^\s_])([^_]*?[^\s_])_(?![_\p{L}\p{N}])/gu, "$1<em>$2</em>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
};

function rendre(md, ctx) {
  const lignes = md.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const r = new Rendu(ctx || {});
  const html = r.blocs(lignes, false);
  const h1 = r.titres.find((t) => t.niveau === 1);
  return { html, titres: r.titres, titre: h1 ? h1.texte : null, alertes: r.alertes };
}

module.exports = { rendre, esc, slugGitHub, texteBrut };
