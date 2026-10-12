#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// 💾 check-session-store.js — les sessions passent TOUTES par KtaSessionStore
// =====================================================================
// Depuis le 10/10/2026, les sessions auto-sauvegardées vivent en IndexedDB
// (js/sessionStore.js), lues depuis la mémoire. Un module qui relirait
// `localStorage["myktamap_session_v1_<planId>"]` lirait une ANCIENNE copie
// (gardée 30 jours après la migration) ou rien du tout ; un module qui y
// écrirait verrait son écriture ignorée, ou pire, recopiée par-dessus la
// session à jour au démarrage suivant (la plus récente gagne).
// BLOQUANT. Vérifie aussi le câblage : chargement avant les modules de
// l'accueil, précache hors ligne, init attendue au démarrage.
// =====================================================================
"use strict";
const fs = require("fs");
const path = require("path");

let ko = 0;
const t = (n, c, d) => { console.log((c ? "✅" : "❌") + " [check-session-store] " + n + (c || !d ? "" : " — " + d)); if (!c) ko++; };
// Fins de ligne normalisées : copie Windows (CRLF) — sinon les commentaires ne sont pas retirés et passent pour du code.
const lire = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

// Seuls ces fichiers ont le droit de nommer la clé : le module de stockage (migration, repli),
// SessionPersist (repli sans module) et la mesure du localStorage en repli (utils.js).
const PERMIS = new Set(["sessionStore.js", "sessionPersist.js", "utils.js"]);
const fautifs = [];
fs.readdirSync("js").filter((f) => f.endsWith(".js")).forEach((f) => {
  if (PERMIS.has(f)) return;
  lire(path.join("js", f)).split("\n").forEach((l, i) => {
    const code = l.replace(/^\s*\/\/.*$/, "").replace(/^\s*\*.*$/, "");
    if (/myktamap_session_v1_/.test(code)) fautifs.push("js/" + f + ":" + (i + 1));
  });
});
t("aucun module ne lit ni n'écrit myktamap_session_v1_<planId> en direct (window.KtaSessionStore)",
  fautifs.length === 0, fautifs.join(", "));

const html = lire("index.html");
const iStore = html.indexOf('src="js/sessionStore.js"');
const iHome = html.indexOf('src="js/homeProfile.js"');
t("index.html charge js/sessionStore.js, sans defer, avant les modules de l'accueil",
  iStore > 0 && iHome > iStore && !/src="js\/sessionStore\.js"[^>]*defer/.test(html));
t("sw.js précache js/sessionStore.js (hors ligne)", /"\.\/js\/sessionStore\.js"/.test(lire("sw.js")));
t("main.js attend KtaSessionStore.init() au démarrage", /await window\.KtaSessionStore\.init\(\)/.test(lire("js/main.js")));
const sp = lire("js/sessionPersist.js");
t("SessionPersist passe par le module (ecrire / lire / retirer)",
  /_store\(\)\.ecrire\(|S\.ecrire\(/.test(sp) && /_store\(\)\.lire\(/.test(sp) && /_store\(\)\.retirer\(/.test(sp));
const st = lire("js/sessionStore.js");
t("la migration relit et compare la copie avant de la compter (copie vérifiée)", /relu !== brut/.test(st));
t("tampon de fermeture posé au pagehide", /addEventListener\("pagehide"/.test(st));

if (ko) { console.log("❌ [check-session-store] " + ko + " échec(s)"); process.exit(1); }
console.log("✅ [check-session-store] sessions : un seul chemin d'accès");
