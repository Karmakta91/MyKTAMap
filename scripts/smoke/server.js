#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// server.js — serveur statique minimal (zéro dépendance) des harnais navigateur
// =====================================================================
// Sert la racine du dépôt en HTTP local (Service Worker, fetch same-origin, data/index.json).
// Requis par smoke.js et les checkups ; seul : node scripts/smoke/server.js [port] (défaut 8123).
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

// 🔒 CSP stricte = la politique en vigueur de docker/nginx-docker.conf (1re ligne add_header CSP ; le bloc
// killsw.html vient après). Un script inline oublié devient une erreur console, qui fait échouer le smoke.
// Sans upgrade-insecure-requests (serveur local en HTTP). killsw.html garde sa propre politique (script dans
// la page, voulu) : pas d'en-tête ici. SMOKE_CSP=0 : servir SANS CSP (diagnostic).
const CSP = process.env.SMOKE_CSP === "0" ? null : (function () {
  try {
    const conf = fs.readFileSync(path.join(RACINE, "docker", "nginx-docker.conf"), "utf8");
    const m = conf.match(/add_header Content-Security-Policy "([^"]+)"/);
    if (!m) return null;
    // Une politique qui autoriserait de nouveau les scripts inline ne doit pas passer pour « stricte ».
    if (/script-src[^;]*'unsafe-inline'/.test(m[1])) {
      console.log("[smoke-server] ⛔ la CSP de docker/nginx-docker.conf autorise les scripts inline");
      process.exit(1);
    }
    return m[1].replace(/\s*upgrade-insecure-requests;?/, "").trim();
  } catch (e) { return null; }
})();
if (!CSP && process.env.SMOKE_CSP !== "0") console.log("[smoke-server] ⚠️ politique CSP stricte introuvable dans docker/nginx-docker.conf : servie sans CSP");

const server = http.createServer(function (req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let fp = path.join(RACINE, urlPath === "/" ? "index.html" : urlPath);
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
