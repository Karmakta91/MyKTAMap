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

const server = http.createServer(function (req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let fp = path.join(RACINE, urlPath === "/" ? "index.html" : urlPath);
  // anti-traversée
  if (!fp.startsWith(RACINE)) { res.writeHead(403); res.end(); return; }
  fs.stat(fp, function (err, st) {
    if (!err && st.isDirectory()) fp = path.join(fp, "index.html");
    fs.readFile(fp, function (err2, data) {
      if (err2) { res.writeHead(404); res.end("404 " + urlPath); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    });
  });
});

server.listen(PORT, "127.0.0.1", function () {
  console.log("[smoke-server] http://127.0.0.1:" + PORT + " ← " + RACINE);
});

module.exports = server;
