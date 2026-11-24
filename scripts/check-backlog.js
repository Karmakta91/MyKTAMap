#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// check-backlog.js — garde-fou pré-commit en AVERTISSEMENT (jamais bloquant), rejoué en CI
// =====================================================================
// Contrôle la forme de docs/BACKLOG.md (format décrit dans son préambule) : sections connues (Avant de traiter une
// entrée, Maintenant, Ensuite, Plus tard, Entrant), plafond de Maintenant, une entrée = une puce en gras de 3 lignes
// au plus suivie de ses métadonnées `qui · action · fini · depuis · taille` (facultatives dans Entrant), valeurs
// permises ; champs facultatifs `lot · id · après · échéance` : id unique au bon format, après vers des id connus
// et sans cycle, échéance datée. Il ne juge pas le fond : une entrée bien formée peut être périmée.
// 🩸 Une référence `après: <autre dépôt>:id` n'est vérifiée que si le backlog voisin est lisible et porte des id
// (dépôts côte à côte, ou KTA_BACKLOG_AUTRE) : en CI chaque dépôt n'a que lui, elle y est ignorée sans avertir.
// ⚠️ Contrat : le même format est lu par la vue du backlog ; changer une règle ici = changer le préambule du
// backlog dans le même commit.
// Usage : node scripts/check-backlog.js [fichier]   (défaut : docs/BACKLOG.md ; sortie 0 même s'il avertit)
//         node scripts/check-backlog.js --strict    (sortie 1 s'il avertit)
//         node scripts/check-backlog.js --sabotages (chaque défaut simulé doit être signalé ; sortie 1 sinon)
// =====================================================================
"use strict";
const fs = require("fs");
const path = require("path");

const PLAFOND_MAINTENANT = 10;
const PREAMBULE = "avant de traiter une entree";
const HORIZONS = ["maintenant", "ensuite", "plus tard", "entrant"];
const CHAMPS = ["qui", "action", "fini", "depuis", "taille"];
const FACULTATIFS = ["lot", "id", "après", "échéance"];
const RE_META = new RegExp("^\\s+`(?:" + CHAMPS.concat(FACULTATIFS).join("|") + ")\\s*:", "u");
const RE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEPOTS = ["community", "pro"];
const DEPOT = "community";
const AUTRE = {
  depot: "pro",
  fichier: process.env.KTA_BACKLOG_AUTRE || path.join(__dirname, "..", "..", "MyKTAMap-pro", "docs", "BACKLOG.md"),
};
const QUI = ["KARMA", "Claude"];
const TAILLES = ["XS", "S", "M", "L"];
const MAX_LIGNES_CORPS = 3;

// « ## 🧭 Plus tard » → « plus tard » (emoji, ponctuation et accents retirés) : le titre peut porter un pictogramme.
function nomSection(titre) {
  return titre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

// JJ/MM/AAAA réelle ; passée, sauf si futurPermis (échéance).
function dateValide(s, futurPermis) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || "");
  if (!m) return false;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1 && (futurPermis || d.getTime() <= Date.now() + 864e5);
}

// « a, pro:b » → [{ brut, depot, id, ok }] ; sans préfixe, la référence vise le dépôt du fichier lu.
function refsApres(valeur, depot) {
  return String(valeur || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean).map(function (brut) {
    const m = /^(?:([^:]*):)?(.*)$/.exec(brut);
    const d = m[1] === undefined ? depot : m[1];
    return { brut: brut, depot: d, id: m[2], ok: DEPOTS.indexOf(d) >= 0 && RE_ID.test(m[2]) };
  });
}

// Métadonnées : un bloc entre accents graves, sur une ou plusieurs lignes, champs « clé: valeur » séparés par « · ».
function lireMeta(brut) {
  const champs = {};
  brut.replace(/^`|`$/g, "").split(/\s+·\s+/).forEach(function (morceau) {
    const m = /^([\p{L}]+)\s*:\s*([\s\S]*)$/u.exec(morceau.trim());
    if (m) champs[m[1].toLowerCase()] = m[2].trim();
    else if (morceau.trim()) champs["?" + morceau.trim().slice(0, 20)] = "";
  });
  return champs;
}

// Texte du backlog → { entrees, nbMaintenant, avertissements, autreVerifie }. opts : { depot, autre }, autre = texte
// du backlog de l'autre dépôt (absent : références vers lui ignorées). Chaque entrée porte id, apres (« dépôt:id »
// des références bien formées) et echeance.
function analyser(texte, opts) {
  opts = opts || {};
  const depot = opts.depot || DEPOT;
  const lignes = texte.replace(/\r\n/g, "\n").split("\n");
  const avert = [];
  const entrees = [];
  const vues = [];
  let section = null;
  let cur = null;
  let dansCode = false;
  const fermer = function () {
    if (!cur) return;
    const meta = cur.lignes.findIndex(function (l) { return RE_META.test(l); });
    cur.corps = meta < 0 ? cur.lignes : cur.lignes.slice(0, meta);
    cur.meta = meta < 0 ? null : lireMeta(cur.lignes.slice(meta).map(function (l) { return l.trim(); }).join(" "));
    const m = cur.meta || {};
    cur.id = m.id || "";
    cur.apres = refsApres(m["après"], depot).filter(function (r) { return r.ok; })
      .map(function (r) { return r.depot + ":" + r.id; });
    cur.echeance = m["échéance"] || "";
    entrees.push(cur);
    cur = null;
  };
  lignes.forEach(function (l, i) {
    const n = i + 1;
    if (/^\s*```/.test(l)) dansCode = !dansCode;
    if (dansCode) return;
    const h = /^(#{2,6})\s+(.*)$/.exec(l);
    if (h) {
      fermer();
      if (h[1] !== "##") {
        if (section && section !== PREAMBULE) avert.push(n + ": sous-section « " + h[2] + " » dans un horizon (une entrée = une puce)");
        return;
      }
      section = nomSection(h[2]);
      vues.push(section);
      if (section !== PREAMBULE && HORIZONS.indexOf(section) < 0) avert.push(n + ": section inconnue « " + h[2] + " »");
      return;
    }
    if (!section || section === PREAMBULE || HORIZONS.indexOf(section) < 0) return;
    if (/^- /.test(l)) { fermer(); cur = { section: section, ligne: n, titre: l, lignes: [] }; return; }
    if (cur && /^\s{2,}\S/.test(l)) { cur.lignes.push(l); return; }
    if (!l.trim()) { fermer(); return; }
    fermer();
    if (/^\s*\|/.test(l)) avert.push(n + ": tableau dans « " + section + " » (une entrée = une puce)");
    else if (!/^>/.test(l)) avert.push(n + ": texte hors entrée dans « " + section + " »");
  });
  fermer();

  HORIZONS.forEach(function (h) { if (vues.indexOf(h) < 0) avert.push("section « " + h + " » absente"); });
  const ordre = vues.filter(function (s) { return HORIZONS.indexOf(s) >= 0; });
  if (ordre.join("|") !== HORIZONS.filter(function (h) { return ordre.indexOf(h) >= 0; }).join("|")) {
    avert.push("horizons dans le désordre (attendu : Maintenant, Ensuite, Plus tard, Entrant)");
  }

  entrees.forEach(function (e) {
    const ou = e.ligne + ": ";
    const titre = /^- \*\*([^*]+)\*\*/.exec(e.titre);
    e.nom = titre ? titre[1].trim() : e.titre.slice(2, 50);
    if (!titre) avert.push(ou + "entrée sans titre en gras (« - **Titre** — corps »)");
    if (1 + e.corps.length > MAX_LIGNES_CORPS) {
      avert.push(ou + "« " + e.nom + " » : corps de " + (1 + e.corps.length) + " lignes (" + MAX_LIGNES_CORPS +
        " au plus : renvoyer vers l'étude ou la doc)");
    }
    if (!e.meta) {
      if (e.section !== "entrant") avert.push(ou + "« " + e.nom + " » : métadonnées absentes (`qui: … · taille: …`)");
      return;
    }
    const exiges = e.section === "entrant" ? [] : CHAMPS;
    exiges.forEach(function (c) { if (!e.meta[c]) avert.push(ou + "« " + e.nom + " » : champ « " + c + " » manquant"); });
    Object.keys(e.meta).forEach(function (c) {
      if (CHAMPS.indexOf(c) < 0 && FACULTATIFS.indexOf(c) < 0) avert.push(ou + "« " + e.nom + " » : champ inconnu « " + c + " »");
    });
    if (e.meta.qui && QUI.indexOf(e.meta.qui) < 0) avert.push(ou + "« " + e.nom + " » : qui « " + e.meta.qui + " » (" + QUI.join(" | ") + ")");
    if (e.meta.taille && TAILLES.indexOf(e.meta.taille) < 0) avert.push(ou + "« " + e.nom + " » : taille « " + e.meta.taille + " » (" + TAILLES.join(" | ") + ")");
    if (e.meta.depuis && !dateValide(e.meta.depuis)) avert.push(ou + "« " + e.nom + " » : depuis « " + e.meta.depuis + " » (JJ/MM/AAAA, passée)");
    if (e.echeance && !dateValide(e.echeance, true)) {
      avert.push(ou + "« " + e.nom + " » : échéance « " + e.echeance + " » (JJ/MM/AAAA)");
    }
  });

  // Identifiants : format, unicité dans le fichier.
  const ids = {};
  entrees.forEach(function (e) {
    if (!e.id) return;
    const ou = e.ligne + ": « " + e.nom + " » : ";
    if (!RE_ID.test(e.id)) avert.push(ou + "id « " + e.id + " » (minuscules, chiffres et tirets)");
    else if (ids[e.id]) avert.push(ou + "id « " + e.id + " » déjà pris ligne " + ids[e.id].ligne);
    else ids[e.id] = e;
  });

  // Backlog voisin : pris en compte seulement s'il porte déjà des id (sinon il n'est pas encore à ce format).
  const autreDepot = DEPOTS.filter(function (d) { return d !== depot; })[0];
  let autre = opts.autre ? analyser(opts.autre, { depot: autreDepot }) : null;
  if (autre && !autre.entrees.some(function (e) { return RE_ID.test(e.id); })) autre = null;
  const autreIds = {};
  if (autre) autre.entrees.forEach(function (e) { if (e.id) autreIds[e.id] = e; });

  entrees.forEach(function (e) {
    if (!e.meta || !e.meta["après"]) return;
    const ou = e.ligne + ": « " + e.nom + " » : ";
    refsApres(e.meta["après"], depot).forEach(function (r) {
      if (!r.ok) avert.push(ou + "après « " + r.brut + " » (id, ou dépôt:id avec " + DEPOTS.join(" | ") + ")");
      else if (r.depot === depot && !ids[r.id]) avert.push(ou + "après « " + r.brut + " » : id inconnu");
      else if (r.depot !== depot && autre && !autreIds[r.id]) {
        avert.push(ou + "après « " + r.brut + " » : id inconnu dans le backlog " + r.depot);
      }
    });
  });

  // Cycles : graphe « dépôt:id » des deux backlogs, signalé ici s'il passe par ce dépôt.
  const graphe = {};
  const ajouter = function (d, liste) {
    liste.forEach(function (e) { if (RE_ID.test(e.id)) graphe[d + ":" + e.id] = e.apres; });
  };
  ajouter(depot, entrees);
  if (autre) ajouter(autreDepot, autre.entrees);
  const local = depot + ":";
  const court = function (x) { return x.indexOf(local) === 0 ? x.slice(local.length) : x; };
  const couleur = {};
  const pile = [];
  const visiter = function (n) {
    couleur[n] = 1;
    pile.push(n);
    graphe[n].forEach(function (s) {
      if (!graphe[s]) return;
      if (couleur[s] === 1) {
        const cycle = pile.slice(pile.indexOf(s)).concat(s);
        if (cycle.some(function (x) { return x.indexOf(local) === 0; })) {
          avert.push("cycle dans « après » : " + cycle.map(court).join(" → "));
        }
      } else if (!couleur[s]) visiter(s);
    });
    pile.pop();
    couleur[n] = 2;
  };
  Object.keys(graphe).forEach(function (n) { if (!couleur[n]) visiter(n); });

  const nbMaintenant = entrees.filter(function (e) { return e.section === "maintenant"; }).length;
  if (nbMaintenant > PLAFOND_MAINTENANT) avert.push("Maintenant : " + nbMaintenant + " entrées (plafond " + PLAFOND_MAINTENANT + ")");
  return { entrees: entrees, nbMaintenant: nbMaintenant, avertissements: avert, autreVerifie: !!autre };
}

// Défauts simulés : chacun doit produire au moins un avertissement dont le texte contient « attendu ».
function sabotages() {
  const meta = "  `qui: Claude · action: faire · fini: fait · depuis: 01/10/2026 · taille: S`";
  const metaB = "  `qui: Claude · action: faire · fini: fait · depuis: 01/10/2026 · taille: S · id: b · après: c" +
    " · échéance: 31/12/2030`";
  const metaC = "  `qui: KARMA · action: dire · fini: dit · depuis: 02/10/2026 · taille: XS · id: c · après: " +
    AUTRE.depot + ":x`";
  const sain = ["# B", "", "## Avant de traiter une entrée", "", "- règle", "", "## Maintenant", "",
    "- **A** — corps.", meta, "", "## Ensuite", "", "- **B** — corps.", metaB, "", "## Plus tard", "",
    "- **C** — corps.", metaC, "", "## Entrant", "", "- **D** — corps.", "  `id: d · après: b, " + DEPOT + ":c`",
    ""].join("\n");
  const autre = function (apres) {
    return "## Maintenant\n\n- **Y** — corps.\n  `qui: Claude · action: a · fini: f · depuis: 01/10/2026 · taille: S" +
      " · id: y" + (apres ? " · après: " + apres : "") + "`\n";
  };
  const cas = [
    ["sain", sain, null],
    ["plafond", sain.replace("## Ensuite", Array.from({ length: 11 }, function (_, k) {
      return "- **E" + k + "** — c.\n" + meta; }).join("\n") + "\n\n## Ensuite"), "plafond"],
    ["section inconnue", sain.replace("## Plus tard", "## Dettes"), "section inconnue"],
    ["champ manquant", sain.replace(" · fini: fait", ""), "« fini » manquant"],
    ["métadonnées absentes", sain.replace(meta + "\n", ""), "métadonnées absentes"],
    ["qui inconnu", sain.replace("qui: Claude", "qui: Bob"), "qui « Bob »"],
    ["taille inconnue", sain.replace("taille: S", "taille: S-M"), "taille « S-M »"],
    ["date invalide", sain.replace("01/10/2026", "2026-10-01"), "depuis « 2026-10-01 »"],
    ["corps trop long", sain.replace("- **A** — corps.", "- **A** — 1\n  2\n  3\n  4"), "corps de 4 lignes"],
    ["tableau", sain.replace("## Ensuite\n", "## Ensuite\n\n| a | b |\n|---|---|\n| c | d |\n"), "tableau"],
    ["champ inconnu", sain.replace("taille: S", "taille: S · priorité: haute"), "champ inconnu"],
    ["id dupliqué", sain.replace("id: c ·", "id: b ·"), "id « b » déjà pris"],
    ["id mal formé", sain.replace("id: d", "id: D_1"), "id « D_1 »"],
    ["après inconnu", sain.replace("après: c ·", "après: zz ·"), "après « zz » : id inconnu"],
    ["après mal formé", sain.replace("après: " + AUTRE.depot + ":x", "après: autre:x"), "après « autre:x »"],
    ["cycle", sain.replace("après: " + AUTRE.depot + ":x", "après: b"), "cycle dans « après » : "],
    ["échéance invalide", sain.replace("31/12/2030", "31/02/2030"), "échéance « 31/02/2030 »"],
    ["autre dépôt lu : id inconnu", sain, "id inconnu dans le backlog " + AUTRE.depot, { autre: autre("") }],
    ["autre dépôt lu : cycle entre dépôts", sain.replace("après: " + AUTRE.depot + ":x", "après: " + AUTRE.depot + ":y"),
      "cycle dans « après » : ", { autre: autre(DEPOT + ":c") }],
    ["autre dépôt lu sans id : ignoré", sain, null, { autre: "## Maintenant\n" }],
  ];
  let echecs = 0;
  cas.forEach(function (c) {
    const a = analyser(c[1], Object.assign({ depot: DEPOT }, c[3])).avertissements;
    const ok = c[2] === null ? a.length === 0 : a.some(function (x) { return x.indexOf(c[2]) >= 0; });
    const attendu = c[2] === null ? "sans avertissement" : "signalé";
    console.log((ok ? "✅" : "❌") + " [check-backlog] cas « " + c[0] + " » " + (ok ? attendu : "FAUX : " + a.join(" ; ")));
    if (!ok) echecs++;
  });
  return echecs;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.indexOf("--sabotages") >= 0) process.exit(sabotages() ? 1 : 0);
  const strict = args.indexOf("--strict") >= 0;
  const fichier = args.filter(function (a) { return !/^--/.test(a); })[0] ||
    path.join(__dirname, "..", "docs", "BACKLOG.md");
  if (!fs.existsSync(fichier)) { console.log("⚠️  [check-backlog] absent : " + fichier); process.exit(0); }
  const autre = fs.existsSync(AUTRE.fichier) ? fs.readFileSync(AUTRE.fichier, "utf8") : null;
  const r = analyser(fs.readFileSync(fichier, "utf8"), { depot: DEPOT, autre: autre });
  r.avertissements.forEach(function (a) { console.log("⚠️  [check-backlog] " + a); });
  const nbId = r.entrees.filter(function (e) { return e.id; }).length;
  const bilan = r.entrees.length + " entrées (" + nbId + " id), Maintenant " + r.nbMaintenant + "/" + PLAFOND_MAINTENANT +
    ", références " + AUTRE.depot + " " + (r.autreVerifie ? "vérifiées" : "non vérifiées (backlog voisin absent ou sans id)");
  if (r.avertissements.length) console.log("⚠️  [check-backlog] " + r.avertissements.length + " avertissement(s) — " + bilan);
  else console.log("✅ [check-backlog] " + bilan);
  process.exit(strict && r.avertissements.length ? 1 : 0);
}

module.exports = { analyser: analyser, nomSection: nomSection, lireMeta: lireMeta, refsApres: refsApres };
