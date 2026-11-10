/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// js/ktaAddons.js — registre des add-ons livrés avec l'app (addons/<nom>/). Expose window.KtaRegistreAddons =
// { liste(), parCode(code), charger(m), actif(m), regler(nom, oui), titre(m) } : liste() lit addons/index.json puis
// chaque addons/<nom>/addon.json (à la première demande, jamais au démarrage ; promesse gardée, refaite après un
// échec), parCode() rend le manifeste qui déclare ce code de la vue 3D, charger() pose une fois le script d'entrée et
// dit s'il est arrivé. actif() / regler() : interrupteur d'APPAREIL d'un add-on visible (Configuration › Add-ons).
// Manifeste : { nom, prise: "vue3d", secret, parDefaut, code, entree, fichiers: [ "js|css|img/<fichier>" ],
// titre: { fr, en, es } }.
// 🔒 Seuls les add-ons livrés : un manifeste mal formé (nom, prise, chemin hors js/ css/ img/, entrée hors de ses
// fichiers) est écarté, jamais chargé. Le précache lit la même liste (sw.js > _assetsAddons).
// Doc : docs/architecture/addons.md · garde-fou : scripts/check-addons.js

(function () {
  "use strict";

  const INDEX = "addons/index.json";
  const RX_NOM = /^[a-z0-9-]{1,32}$/;
  const RX_FICHIER = /^(js|css|img)\/[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)+$/;
  const RX_CODE = /^[a-z0-9]{1,16}$/;
  const PRISES = ["vue3d"];
  const LS_ACTIFS = "myktamap_addons_v1";
  let _liste = null;
  const _charges = {};

  function _json(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + " : " + r.status);
      return r.json();
    });
  }

  function _valide(m, nom) {
    if (!m || typeof m !== "object" || m.nom !== nom || !RX_NOM.test(nom)) return false;
    if (PRISES.indexOf(m.prise) < 0 || !Array.isArray(m.fichiers) || !m.fichiers.length) return false;
    if (!m.fichiers.every(function (f) { return typeof f === "string" && RX_FICHIER.test(f); })) return false;
    if (m.fichiers.indexOf(m.entree) < 0 || !/\.js$/.test(m.entree)) return false;
    if (m.code !== undefined && !(typeof m.code === "string" && RX_CODE.test(m.code))) return false;
    if (m.parDefaut !== undefined && typeof m.parDefaut !== "boolean") return false;
    return true;
  }

  function liste() {
    if (_liste) return _liste;
    _liste = _json(INDEX).then(function (idx) {
      const noms = idx && Array.isArray(idx.addons) ? idx.addons.filter(function (n) { return RX_NOM.test(n); }) : [];
      return Promise.all(noms.map(function (nom) {
        return _json("addons/" + nom + "/addon.json").then(function (m) {
          if (_valide(m, nom)) return Object.freeze(Object.assign({}, m, { secret: m.secret === true }));
          console.warn("[Addons] manifeste écarté : " + nom);
          return null;
        }, function (e) { console.warn("[Addons] manifeste illisible : " + nom, e.message); return null; });
      }));
    }).then(function (ms) { return ms.filter(Boolean); }, function (e) {
      console.warn("[Addons] liste illisible :", e.message);
      _liste = null;
      return [];
    });
    return _liste;
  }

  function parCode(code) {
    return liste().then(function (ms) {
      return ms.filter(function (m) { return m.code === code; })[0] || null;
    });
  }

  // ⚠️ contrat : l'add-on s'inscrit lui-même dans window.KtaAddons[<nom>] ; charger() ne le lance pas.
  function charger(m) {
    if (window.KtaAddons && window.KtaAddons[m.nom]) return Promise.resolve(true);
    if (_charges[m.nom]) return _charges[m.nom];
    _charges[m.nom] = new Promise(function (ok) {
      const s = document.createElement("script");
      s.src = "addons/" + m.nom + "/" + m.entree;
      s.addEventListener("load", function () { ok(true); });
      s.addEventListener("error", function () {
        _charges[m.nom] = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        console.warn("[Addons] « " + m.nom + " » introuvable");
        ok(false);
      });
      document.head.appendChild(s);
    });
    return _charges[m.nom];
  }

  function _actifs() {
    try { return JSON.parse(localStorage.getItem(LS_ACTIFS) || "{}") || {}; } catch (e) { return {}; }
  }

  // Un add-on secret n'a pas d'interrupteur (absent des Réglages) : toujours actif. Un visible suit le réglage de
  // l'appareil, sinon son manifeste (allumé par défaut, décision produit ; `parDefaut: false` pour l'éteindre).
  function actif(m) {
    if (!m) return false;
    if (m.secret) return true;
    const v = _actifs()[m.nom];
    return typeof v === "boolean" ? v : m.parDefaut !== false;
  }

  function regler(nom, oui) {
    if (!RX_NOM.test(nom)) return;
    const a = _actifs();
    a[nom] = !!oui;
    try { localStorage.setItem(LS_ACTIFS, JSON.stringify(a)); } catch (e) { /* stockage refusé : non retenu */ }
  }

  function titre(m) {
    const l = window.I18n && typeof window.I18n.getLang === "function" ? window.I18n.getLang() : "fr";
    return (m.titre && (m.titre[l] || m.titre.fr)) || m.nom;
  }

  window.KtaRegistreAddons = { liste: liste, parCode: parCode, charger: charger, actif: actif, regler: regler,
    titre: titre };
})();
