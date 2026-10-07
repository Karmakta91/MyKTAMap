#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🌐 server.js — serveur statique minimal pour le smoke navigateur
// =====================================================================
// Sert la RACINE DU REPO (../../) en HTTP local — le smoke a besoin d'un
// vrai serveur (Service Worker, fetch same-origin, data/index.json).
// Zéro dépendance. Utilisé par smoke.js (démarré/arrêté par lui) ; peut
// aussi être lancé seul : node scripts/smoke/server.js [port]
// =====================================================================
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..", "..");
const PORT = parseInt(process.argv[2], 10) || 8123;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md":   "text/markdown; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml",
  ".gif":  "image/gif",
  ".ico":  "image/x-icon",
  ".woff2": "font/woff2"
};

// CSP STRICTE (07/10/2026) : la politique « Report-Only » de docker/nginx-docker.conf (scripts sans
// 'unsafe-inline'), servie ici EN VIGUEUR. Un script inline oublié devient une erreur console — et le smoke
// échoue déjà sur toute erreur console. Sans upgrade-insecure-requests (le serveur local est en HTTP).
// killsw.html garde sa politique propre (script dans la page, voulu) : pas d'en-tête ici.
// SMOKE_CSP=0 : servir SANS CSP (diagnostic : un échec vient-il de la CSP ou d'ailleurs ?).
const CSP = process.env.SMOKE_CSP === "0" ? null : (function () {
  try {
    const conf = fs.readFileSync(path.join(RACINE, "docker", "nginx-docker.conf"), "utf8");
    const m = conf.match(/add_header Content-Security-Policy-Report-Only "([^"]+)"/);
    return m ? m[1].replace(/\s*upgrade-insecure-requests;?/, "").trim() : null;
  } catch (e) { return null; }
})();
if (!CSP && process.env.SMOKE_CSP !== "0") console.log("[smoke-server] ⚠️ politique CSP stricte introuvable dans docker/nginx-docker.conf : servie sans CSP");

const server = http.createServer(function (req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let fp = path.join(RACINE, urlPath === "/" ? "index.html" : urlPath);
  // anti-traversée
  if (!fp.startsWith(RACINE)) { res.writeHead(403); res.end(); return; }
  fs.stat(fp, function (err, st) {
    if (!err && st.isDirectory()) fp = path.join(fp, "index.html");
    fs.readFile(fp, function (err2, data) {
      if (err2) { res.writeHead(404); res.end("404 " + urlPath); return; }
      const h = { "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" };
      if (CSP && /\.html$/i.test(fp) && path.basename(fp) !== "killsw.html") h["Content-Security-Policy"] = CSP;
      res.writeHead(200, h);
      res.end(data);
    });
  });
});

server.listen(PORT, "127.0.0.1", function () {
  console.log("[smoke-server] http://127.0.0.1:" + PORT + " ← " + RACINE);
});

module.exports = server;
