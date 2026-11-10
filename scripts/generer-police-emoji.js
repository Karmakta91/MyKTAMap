#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// generer-police-emoji.js — refait la police « KTA Emoji » (fonts/kta-emoji.woff2) depuis Twemoji
// =====================================================================
// La police réduit Twemoji Mozilla (COLRv0, couleur lue par Safari, Chrome, Firefox, Edge ; dessins CC-BY 4.0)
// aux seuls emoji écrits dans le dépôt (PERIMETRE), séquences et U+FE0F comprises. Produit trois fichiers :
//   fonts/kta-emoji.woff2 · fonts/kta-emoji.json (manifeste : source, empreintes, séquences, plage) ·
//   css/kta-emoji.css (@font-face, unicode-range = les points de code des séquences retenues).
// ⚠️ contrat : la plage ne contient jamais un caractère de texte (chiffres, # *, lettres, ponctuation, flèches,
//   triangles ▶ ◀, © ® ™ : TEXTE) ; une séquence qui en porte un (touche 1️⃣, ▶️) reste dessinée par le système.
// Quand : après tout ajout d'emoji (check-police-emoji.js échoue et donne cette commande).
// Prérequis : Python 3 avec fontTools et brotli (pip install fonttools==4.60.1 brotli==1.1.0) ; KTA_PYTHON pour
//   un autre interpréteur. Source téléchargée depuis la release GitHub officielle (empreinte SOURCE.sha256
//   vérifiée) dans le dossier temporaire, ou --source <Twemoji.Mozilla.ttf>.
// Exporte (pour le garde-fou) : inventaire(), retenue(seq), plage(points), lireCmapWoff2(buf), SOURCE, CHEMINS.
// Usage : node scripts/generer-police-emoji.js [--source fichier.ttf]   · doc : docs/architecture/ui.md
// =====================================================================
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const RACINE = path.resolve(__dirname, "..");
const SOURCE = {
  nom: "Twemoji Mozilla",
  version: "0.7.0",
  url: "https://github.com/mozilla/twemoji-colr/releases/download/v0.7.0/Twemoji.Mozilla.ttf",
  sha256: "6d90152ee0d29e82fe2a87793af5aa4b7ad13e6538360889e141e81ed299ee8e",
  licence: "dessins Twemoji CC-BY 4.0 (Twitter, Inc. et contributeurs) ; police twemoji-colr Apache 2.0 (Mozilla)"
};
const CHEMINS = { police: "fonts/kta-emoji.woff2", manifeste: "fonts/kta-emoji.json", css: "css/kta-emoji.css" };

// Ce qui peut s'afficher dans l'app : code, dicos, styles, pages, add-ons, guides et pages servies par l'app.
const PERIMETRE = {
  dossiers: [["js", /\.js$/], ["lang", /\.json$/], ["css", /\.css$/], ["addons", /\.(js|json|css|html)$/]],
  fichiers: ["index.html", "confadmin.html", "docs/applications/README_USER.md", "docs/applications/README_USER.en.md",
    "docs/applications/README_USER.es.md", "docs/applications/CGU.md", "docs/applications/SELFHOST.md",
    "docs/applications/AI_CONTEXT.md", "docs/applications/NETWORK_AUDIT.md"]
};

// 🩸 Caractères de texte : jamais dans la plage, sinon la police prendrait un chiffre, une flèche ou un triangle
// voulu en texte (« ▶ Suivant », « ↔ », « © »). Ils restent au système, même suivis de U+FE0F.
function texte(cp) {
  return cp < 0xA0 || cp === 0xA9 || cp === 0xAE || cp === 0x2122 || cp === 0x203C || cp === 0x2049 ||
    (cp >= 0x2190 && cp <= 0x21FF) || (cp >= 0x25A0 && cp <= 0x25FF) || cp === 0x2934 || cp === 0x2935 ||
    (cp >= 0x2B05 && cp <= 0x2B07) || cp === 0x27A1;
}
const _JOINT = new Set([0x200D, 0xFE0F, 0x20E3]);
function retenue(seq) {
  return !Array.from(seq).some(function (c) { const cp = c.codePointAt(0); return !_JOINT.has(cp) && texte(cp); });
}

function _lister(dossier, motif, acc) {
  const abs = path.join(RACINE, dossier);
  if (!fs.existsSync(abs)) return acc;
  fs.readdirSync(abs, { withFileTypes: true }).forEach(function (e) {
    const rel = dossier + "/" + e.name;
    if (e.isDirectory()) _lister(rel, motif, acc);
    else if (motif.test(e.name)) acc.push(rel);
  });
  return acc;
}
function fichiersDuPerimetre() {
  const out = [];
  PERIMETRE.dossiers.forEach(function (d) { _lister(d[0], d[1], out); });
  PERIMETRE.fichiers.forEach(function (f) { if (fs.existsSync(path.join(RACINE, f))) out.push(f); });
  return out.sort();
}

// → Map séquence → [fichiers] des emoji RGI (séquences ZWJ, drapeaux, teintes, U+FE0F) du périmètre, retenus ou non.
function inventaire() {
  const m = new Map();
  fichiersDuPerimetre().forEach(function (f) {
    const src = fs.readFileSync(path.join(RACINE, f), "utf8");
    for (const x of src.matchAll(/\p{RGI_Emoji}/gv)) {
      if (!m.has(x[0])) m.set(x[0], []);
      const l = m.get(x[0]);
      if (l.indexOf(f) < 0) l.push(f);
    }
  });
  return m;
}

function points(sequences) {
  const s = new Set();
  sequences.forEach(function (q) { for (const c of q) s.add(c.codePointAt(0)); });
  return Array.from(s).sort(function (a, b) { return a - b; });
}
const _hex = function (cp) { return cp.toString(16).toUpperCase(); };
// Points de code triés → « U+26A0, U+1F4C1-1F4C2, … » (plages contiguës fusionnées).
function plage(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let j = i;
    while (j + 1 < pts.length && pts[j + 1] === pts[j] + 1) j++;
    out.push("U+" + _hex(pts[i]) + (j > i ? "-" + _hex(pts[j]) : ""));
    i = j;
  }
  return out.join(", ");
}

// cmap d'un WOFF2 (Node seul : zlib sait le Brotli) → Set des points de code. La table cmap n'est jamais
// transformée par WOFF2 (seules glyf, loca et hmtx le sont) : on la lit telle quelle dans le flux décompressé.
const _TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca",
  "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE",
  "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx",
  "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];
function lireCmapWoff2(buf) {
  if (buf.toString("latin1", 0, 4) !== "wOF2") throw new Error("pas un WOFF2");
  const nbTables = buf.readUInt16BE(12);
  let o = 48;
  const base128 = function () {
    let v = 0;
    for (let i = 0; i < 5; i++) { const b = buf[o++]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return v; }
    throw new Error("UIntBase128 invalide");
  };
  const tables = [];
  for (let i = 0; i < nbTables; i++) {
    const drapeau = buf[o++];
    let tag = _TAGS[drapeau & 0x3f];
    if ((drapeau & 0x3f) === 63) { tag = buf.toString("latin1", o, o + 4); o += 4; }
    const transfo = (drapeau >> 6) & 3;
    const longueur = base128();
    let lu = longueur;
    if ((tag === "glyf" || tag === "loca") ? transfo === 0 : transfo !== 0) lu = base128();
    tables.push({ tag: tag, lu: lu });
  }
  const flux = zlib.brotliDecompressSync(buf.subarray(o, o + buf.readUInt32BE(20)));
  let pos = 0, cmap = null;
  tables.forEach(function (t) { if (t.tag === "cmap") cmap = flux.subarray(pos, pos + t.lu); pos += t.lu; });
  if (!cmap) throw new Error("table cmap absente");
  const pts = new Set();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const off = cmap.readUInt32BE(4 + i * 8 + 4), fmt = cmap.readUInt16BE(off);
    if (fmt === 12) {
      const groupes = cmap.readUInt32BE(off + 12);
      for (let g = 0; g < groupes; g++) {
        const d = off + 16 + g * 12, a = cmap.readUInt32BE(d), b = cmap.readUInt32BE(d + 4);
        for (let c = a; c <= b; c++) pts.add(c);
      }
    } else if (fmt === 4) {
      const seg = cmap.readUInt16BE(off + 6) / 2;
      for (let s = 0; s < seg; s++) {
        const fin = cmap.readUInt16BE(off + 14 + s * 2), deb = cmap.readUInt16BE(off + 16 + seg * 2 + s * 2);
        for (let c = deb; c <= fin && c !== 0xFFFF; c++) pts.add(c);
      }
    } else if (fmt === 14) {
      // Sélecteurs de variante (U+FE0F) : la police les reconnaît.
      const nb = cmap.readUInt32BE(off + 6);
      for (let s = 0; s < nb; s++) pts.add(cmap.readUIntBE(off + 10 + s * 11, 3));
    }
  }
  return pts;
}

const sha256 = function (b) { return crypto.createHash("sha256").update(b).digest("hex"); };

function _telecharger(url, dest) {
  // Synchrone par un node enfant : le script reste une suite d'étapes lisible.
  const code = "const https=require('https'),fs=require('fs');" +
    "function g(u,n){https.get(u,{headers:{'User-Agent':'kta'}},r=>{" +
    "if(r.statusCode>=300&&r.statusCode<400&&r.headers.location&&n>0){r.resume();return g(r.headers.location,n-1);}" +
    "if(r.statusCode!==200){console.error('HTTP '+r.statusCode);process.exit(1);}" +
    "const f=fs.createWriteStream(process.argv[2]);r.pipe(f);f.on('finish',()=>f.close());})" +
    ".on('error',e=>{console.error(e.message);process.exit(1);});}g(process.argv[1],5);";
  execFileSync(process.execPath, ["-e", code, url, dest], { stdio: "inherit" });
}

function _python() {
  const essais = process.env.KTA_PYTHON ? [[process.env.KTA_PYTHON]] : [["python"], ["python3"], ["py", "-3"]];
  for (const e of essais) {
    try {
      const v = execFileSync(e[0], e.slice(1).concat(["-I", "-c", "import fontTools,brotli;print(fontTools.version)"]),
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      return { cmd: e, fonttools: v };
    } catch (err) { /* suivant */ }
  }
  console.error("❌ Python avec fontTools et brotli introuvable : pip install fonttools==4.60.1 brotli==1.1.0 " +
    "(ou KTA_PYTHON=<python.exe>)");
  process.exit(1);
}

function generer() {
  const i = process.argv.indexOf("--source");
  const src = i > 0 ? path.resolve(process.argv[i + 1])
    : path.join(os.tmpdir(), "kta-police-emoji", "Twemoji.Mozilla.ttf");
  if (i < 0 && !fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(src), { recursive: true });
    console.log("[police-emoji] téléchargement " + SOURCE.url);
    _telecharger(SOURCE.url, src);
  }
  const brut = fs.readFileSync(src);
  if (sha256(brut) !== SOURCE.sha256) {
    console.error("❌ empreinte de la source ≠ SOURCE.sha256 (" + src + ") : fichier altéré ou autre version");
    process.exit(1);
  }
  const inv = inventaire();
  const seqs = Array.from(inv.keys()).filter(retenue).sort();
  const pts = points(seqs);
  const py = _python();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kta-police-emoji-"));
  const liste = path.join(tmp, "unicodes.txt");
  fs.writeFileSync(liste, pts.map(_hex).join("\n") + "\n");
  const sortie = path.join(RACINE, CHEMINS.police);
  // SOURCE_DATE_EPOCH : horodatage fixe (date de la release), la même liste redonne le même fichier.
  execFileSync(py.cmd[0], py.cmd.slice(1).concat(["-I", "-m", "fontTools.subset", src, "--unicodes-file=" + liste,
    "--layout-features=*", "--flavor=woff2", "--drop-tables+=FFTM", "--output-file=" + sortie]),
  { stdio: "inherit", env: Object.assign({}, process.env, { SOURCE_DATE_EPOCH: "1666958563" }) });
  fs.rmSync(tmp, { recursive: true, force: true });

  const woff2 = fs.readFileSync(sortie);
  const cmap = lireCmapWoff2(woff2);
  const absents = seqs.filter(function (q) {
    return Array.from(q).some(function (c) { return !cmap.has(c.codePointAt(0)); });
  });
  if (absents.length) {
    console.error("❌ séquence(s) absente(s) de " + SOURCE.nom + " " + SOURCE.version + " : " + absents.join(" ") +
      " → choisir un autre emoji (Twemoji 14) ou monter la source");
    process.exit(1);
  }
  const p = plage(pts);
  const manifeste = {
    _role: "Manifeste de fonts/kta-emoji.woff2, écrit par scripts/generer-police-emoji.js (ne pas éditer à la main)",
    source: Object.assign({ octets: brut.length }, SOURCE),
    outil: "fontTools " + py.fonttools,
    sortie: { fichier: CHEMINS.police, octets: woff2.length, sha256: sha256(woff2) },
    sequences: seqs,
    plage: p
  };
  fs.writeFileSync(path.join(RACINE, CHEMINS.manifeste), JSON.stringify(manifeste, null, 1) + "\n");
  const css = "/*!\n * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)\n" +
    " * https://myktamap.fr — Licence CC BY-NC-SA 4.0\n" +
    " * Police : Twemoji (c) Twitter, Inc. et contributeurs, CC-BY 4.0 — via twemoji-colr (Mozilla), réduite.\n */\n" +
    "/* Écrit par scripts/generer-police-emoji.js : ne pas éditer à la main.\n" +
    "   ⚠️ contrat : unicode-range = les seuls emoji du dépôt, jamais un chiffre, # *, une lettre ni une\n" +
    "   flèche ; la famille ouvre chaque pile font-family (check-police-emoji.js). */\n" +
    "@font-face {\n  font-family: \"KTA Emoji\";\n  src: url(\"../" + CHEMINS.police + "\") format(\"woff2\");\n" +
    "  font-display: swap;\n  unicode-range: " + p + ";\n}\n";
  fs.writeFileSync(path.join(RACINE, CHEMINS.css), css);
  console.log("[police-emoji] ✅ " + seqs.length + " séquences, " + pts.length + " points de code · source " +
    brut.length + " o → " + CHEMINS.police + " " + woff2.length + " o");
  const ecartes = Array.from(inv.keys()).filter(function (q) { return !retenue(q); });
  if (ecartes.length) console.log("[police-emoji] laissés au système (caractère de texte) : " + ecartes.join(" "));
}

module.exports = { inventaire: inventaire, retenue: retenue, points: points, plage: plage, lireCmapWoff2: lireCmapWoff2,
  sha256: sha256, SOURCE: SOURCE, CHEMINS: CHEMINS, PERIMETRE: PERIMETRE, texte: texte };

if (require.main === module) generer();
