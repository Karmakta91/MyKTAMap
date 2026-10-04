#!/usr/bin/env node
// check-licence.js — licences pro SIGNÉES (04/10/2026).
// Exécute la vraie vérification de js/proLicense.js (WebCrypto de Node) sur des licences
// signées avec une clé D'ESSAI substituée à la clé publique embarquée :
//   - signature valide, non expirée, domaine couvert → acceptée ;
//   - champ altéré, signature absente, expirée, autre domaine → refusée.
// Et vérifie que la clé embarquée est PUBLIQUE (aucune composante privée « d »).
"use strict";
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };
const SRC = fs.readFileSync("js/proLicense.js", "utf8");

// 1. La clé embarquée est publique
const m = SRC.match(/var CLE_PUBLIQUE_JWK = (\{[^;]*\});/);
t("une clé publique est embarquée", !!m);
let jwk = null; try { jwk = JSON.parse(m[1]); } catch (e) { /* invalide */ }
t("🩸 clé embarquée PUBLIQUE : aucune composante privée « d »", jwk && jwk.kty === "EC" && jwk.crv === "P-256" && !("d" in jwk));
t("🩸 aucune clé privée PEM dans le code de l'app", !/PRIVATE KEY/.test(SRC));

// 2. Vérification exécutée avec une clé d'essai
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwkEssai = publicKey.export({ format: "jwk" });
function canonique(v) {
  if (Array.isArray(v)) return "[" + v.map(canonique).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).filter((k) => k !== "signature").sort().map((k) => JSON.stringify(k) + ":" + canonique(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
const signer = (l) => Object.assign({}, l, { signature: crypto.sign("sha256", Buffer.from(canonique(l)), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64") });
const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const base = { instance: "pro", license_hash: "MKTM-LIC-" + "a".repeat(32), client: "Essai", domaines: ["carto.club.org"], valid_until: demain };

const store = {};
const w = {
  console: { log() {}, warn() {}, error() {} },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  location: { hostname: "carto.club.org" },
  document: { readyState: "complete", addEventListener() {}, documentElement: { classList: { add() {}, remove() {}, toggle() {} } }, body: null },
  fetch: () => Promise.reject(new Error("pas de réseau en test")),
  AbortController, setTimeout, clearTimeout, TextEncoder, atob, Uint8Array, Promise, JSON, Date, Object, Array, String,
  crypto: globalThis.crypto, CustomEvent: function () {}, dispatchEvent() {}, addEventListener() {},
};
w.window = w;
vm.createContext(w);
vm.runInContext(SRC.replace(m[1], JSON.stringify(jwkEssai)), w, { filename: "proLicense.js" });
const verifier = w.MyKTAMapProLicense && w.MyKTAMapProLicense._verifierSignature;
t("la vérification est exposée pour les tests (_verifierSignature)", typeof verifier === "function");

(async () => {
  if (typeof verifier !== "function") process.exit(1);
  t("licence signée, domaine couvert, non expirée → acceptée", (await verifier(signer(base))) === true);
  t("licence de test « * » → acceptée partout", (await verifier(signer(Object.assign({}, base, { domaines: ["*"] })))) === true);
  const alteree = signer(base); alteree.client = "Autre client";
  t("🩸 champ modifié après signature → refusée", (await verifier(alteree)) === false);
  t("🩸 sans signature → refusée", (await verifier(base)) === false);
  t("🩸 expirée → refusée", (await verifier(signer(Object.assign({}, base, { valid_until: "2020-01-01" })))) === false);
  t("🩸 émise pour une autre adresse → refusée", (await verifier(signer(Object.assign({}, base, { domaines: ["autre.org"] })))) === false);
  const autreCle = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
  const fausse = Object.assign({}, base, { signature: crypto.sign("sha256", Buffer.from(canonique(base)), { key: autreCle, dsaEncoding: "ieee-p1363" }).toString("base64") });
  t("🩸 signée par une AUTRE clé → refusée", (await verifier(fausse)) === false);
  console.log("");
  if (ko) { console.log("⚠️ " + ko + " echec(s)"); process.exit(1); }
  console.log("🎉 licences : seules les licences signées par la clé de KARMA, valides et pour la bonne adresse, activent le mode pro");
})();
