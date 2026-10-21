#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-extensions.js — BLOQUANT (pré-commit) : points d'extension `js/ktaExtensions.js` (contrat :
// docs/architecture/community-server-line.md §3). Le vrai module tourne dans un `vm` (faux localStorage,
// faux fetch qui COMPTE ses appels) ; le câblage est vérifié sur les fichiers réels.
// 🔒 Ne doit JAMAIS arriver :
//   1. une prise de PERMISSION (gate, import, export) qui échoue et laisse passer ;
//   2. une gate déléguée en échec qui retombe sur la gate community (ouvrirait une instance privée) ;
//   3. une requête hors des états permis ou vers une autre origine (le garde est au goulot ou n'est rien) ;
//   4. un module chargé sur une instance OFF (myktamap.fr) — règle E ;
//   5. une prise sans extension qui change quoi que ce soit (no-op) ;
//   6. des caches de modules vidés à chaque release community, ou un module greffé précaché par community.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };
const lire = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

function nouveauContexte(licence) {
  const store = {};
  const appelsFetch = [];
  const scripts = [];
  const w = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: { readyState: "complete", getElementById: () => null, addEventListener() {},
                createElement: () => ({ set src(v) { scripts.push(v); } }), head: { appendChild() {} } },
    MyKTAMapProLicense: { isPro: () => !!licence, getSource: () => licence || null },
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    // Écouteurs et événements gardés (section réseau) ; `w._fetch` remplace le réseau pour un test.
    _ecoutes: {}, _emis: [],
    addEventListener(type, fn) { (w._ecoutes[type] = w._ecoutes[type] || []).push(fn); },
    dispatchEvent(e) { w._emis.push(e && e.type); return true; },
    fetch: (url, init) => { appelsFetch.push(url); appelsFetch.dernierInit = init;
                            return w._fetch ? w._fetch(url, init) : Promise.resolve({ ok: true, url: url }); },
    URL: URL, Headers: Headers, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout
  };
  w.window = w;
  const ctx = vm.createContext(w);
  vm.runInContext("var localStorage = window.localStorage, document = window.document, CustomEvent = window.CustomEvent," +
                  " console = window.console, fetch = window.fetch;", ctx);
  vm.runInContext(lire("js/ktaExtensions.js"), ctx, { filename: "ktaExtensions.js" });
  return { K: w.KtaExtensions, w, appelsFetch, scripts };
}
const ON = { serverConnection: { state: "on", api: "https://api.exemple.org", modules: ["pro/m.js"] } };

(async function () {
  // ── 1. DÉCLARATION ──────
  {
    const { K } = nouveauContexte(null);
    t("API exposée : register, signaler, chargerModules, requete, permissions, gate, plans, journal, effacement, secours",
      ["register", "signaler", "chargerModules", "requete", "importAutorise", "exportAutorise", "gateDeleguee",
       "listerPlansExtension", "chargerPlanExtension", "publierPlan", "changementsDepuis", "effacerDonneesExtension", "secoursAppliquer"]
        .every((f) => typeof K[f] === "function") && K.API_VERSION === 1);
    t("déclaration sans nom refusée", K.register({ apiVersion: 1 }) === false);
    t("🩸 apiVersion inconnue refusée (une incompatibilité se signale, elle ne casse pas en silence)", K.register({ nom: "x", apiVersion: 2 }) === false);
    t("déclaration valide acceptée", K.register({ nom: "x", apiVersion: 1 }) === true);
    t("double déclaration refusée", K.register({ nom: "x", apiVersion: 1 }) === false);
  }

  // ── 2. SANS EXTENSION : RIEN NE CHANGE ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : import autorisé, export autorisé (aucune prise ne ferme rien)", K.importAutorise() === true && K.exportAutorise("p") === true);
    t("sans extension : pas de gate déléguée", K.gateDeleguee() === null);
    t("sans extension : aucun plan d'extension", (await K.listerPlansExtension()).length === 0);
  }

  // ── 3. PERMISSIONS : UNE ERREUR = REFUS ──────
  {
    const { K } = nouveauContexte(null);
    K.register({ nom: "pannes", apiVersion: 1, importAutorise() { throw new Error("panne"); }, exportAutorise() { throw new Error("panne"); } });
    t("🩸 importAutorise qui échoue → REFUS", K.importAutorise() === false);
    t("🩸 exportAutorise qui échoue → REFUS", K.exportAutorise("p") === false);
    const c2 = nouveauContexte(null);
    c2.K.register({ nom: "mou", apiVersion: 1, importAutorise() { return "oui"; } });
    t("🩸 permission qui ne rend pas exactement true → refus", c2.K.importAutorise() === false);
    const c3 = nouveauContexte(null);
    c3.K.register({ nom: "gate", apiVersion: 1, gate: { ouvrir() { return Promise.reject(new Error("serveur KO")); } } });
    let rejete = false;
    try { await c3.K.gateDeleguee(); } catch (e) { rejete = true; }
    t("🩸 gate déléguée en échec → la promesse REJETTE (l'appelant n'ouvre rien)", rejete);
  }

  // ── 3 bis. EXPORT LIMITÉ À SES AJOUTS ({ auteur }) ──────
  {
    const avec = (v) => { const c = nouveauContexte(null); c.K.register({ nom: "e", apiVersion: 1, exportAutorise: () => v }); return c; };
    const { K, w } = avec({ auteur: " Alice " });
    t("export limité : exportAutorise reste un REFUS pour qui ne sait pas filtrer (profil, calque)", K.exportAutorise("ext_p") === false);
    t("export limité : exportLimite rend le pseudo (nettoyé)", K.exportLimite("ext_p") === "Alice");
    w._currentLoadedPlanId = "ext_p";
    t("🔒 goulot : sans limitePermise → refusé (conversion, export du calque)", w.ktaExportPlanRefuse() === true);
    t("goulot : avec limitePermise → passe (complet, avancé)", w.ktaExportPlanRefuse({ limitePermise: true }) === false);
    t("ktaExportLimite : le pseudo du plan ouvert", w.ktaExportLimite() === "Alice");
    const tout = avec(true);
    tout.w._currentLoadedPlanId = "ext_p";
    t("true = tout : exportLimite null, rien de refusé", tout.K.exportLimite("ext_p") === null && tout.w.ktaExportPlanRefuse() === false);
    const refus = avec(false);
    refus.w._currentLoadedPlanId = "ext_p";
    t("false = refus, même avec limitePermise",
      refus.w.ktaExportPlanRefuse({ limitePermise: true }) === true && refus.w.ktaExportLimite() === null);
    const formes = [{ auteur: "" }, { auteur: "   " }, { auteur: 5 }, { auteur: "x", tout: true }, ["x"], "x", 1, null,
      Object.create({ auteur: "x" })];
    t("🔒 toute autre forme ({ auteur: '' }, autre clé, tableau, texte, nombre, prototype) → REFUS",
      formes.every((v) => { const c = avec(v); c.w._currentLoadedPlanId = "ext_p";
        return c.K.exportAutorise("ext_p") === false && c.K.exportLimite("ext_p") === null &&
          c.w.ktaExportPlanRefuse({ limitePermise: true }) === true; }));
    const panne = nouveauContexte(null);
    panne.K.register({ nom: "p", apiVersion: 1, exportAutorise() { throw new Error("x"); } });
    panne.w._currentLoadedPlanId = "ext_p";
    t("🩸 prise en erreur → refus, même avec limitePermise", panne.w.ktaExportPlanRefuse({ limitePermise: true }) === true);
    const SE = lire("js/sessionExporter.js"), CSE = lire("js/calqueSession.js"), FPN = lire("js/filterPanel.js");
    t("modal d'export : limite permise pour Complet et Avancé seulement, jamais la conversion",
      SE.indexOf('window.ktaExportPlanRefuse({ limitePermise: tab !== "conversion" })') > 0 &&
      SE.indexOf('_auteurImpose = ((tab === "full" || tab === "advanced") && typeof window.ktaExportLimite === "function")') > 0);
    t("🔒 modal d'export limité : auteur imposé, select désactivé, mention, copies de calque jamais retenues",
      SE.indexOf("(_auteurImpose ? ' disabled' : '')") > 0 && SE.indexOf('t("export.filtre.impose")') > 0 &&
      SE.indexOf("if (o._srcCalque !== undefined || _auteurDe(o) !== _auteurImpose) return false;") > 0 &&
      SE.indexOf('if (!_auteurImpose) _filtre.auteur = e.target.value') > 0 &&
      SE.indexOf('_filtre = { du: "", au: "", auteur: _auteurImpose || "" };') > 0);
    t("🔒 export limité : ni traces ni liaisons, photos des seuls points retenus",
      /if \(_auteurImpose\) \{\n\s*delete session\.tombstones;\n\s*delete session\.interPlanLinks;/.test(SE) &&
      SE.indexOf("_collecterPhotosPlan(idsPhotos)") > 0 && SE.indexOf("function _idsPhotosRetenues(points)") > 0);
    t("🔒 export d'un calque rapatrié : droit d'exporter TOUT le plan (goulot sans limitePermise)",
      /window\.ktaExportPlanRefuse\(\)\) \{\n\s*return \{ ok: false, code: "exportRefuse" \};/.test(CSE) &&
      FPN.indexOf('r.code === "exportRefuse") return Promise.resolve(false)') > 0);
  }

  // ── Réseau perdu / revenu ──────
  // 🩸 L'état suit le réseau en continu : établi au démarrage seulement, l'accueil afficherait
  // « connectée » hors réseau et l'ouverture d'un plan d'extension attendrait sans fin.
  {
    const c = nouveauContexte("server");
    c.K.appliquerConfig(ON, true);
    c.K.signaler("on");
    const ev = (type) => (c.w._ecoutes[type] || []).forEach((f) => f({ type: type }));
    ev("offline");
    t("📶 réseau coupé (événement offline) → « down » tout de suite, sans attendre le module", c.K.etat().etat === "down");
    let refus = false;
    try { await c.K.requete("/v1/x"); } catch (e) { refus = true; }
    t("📶 réseau coupé : la garde refuse avant tout envoi (l'accueil rouvre la copie gardée)", refus && c.appelsFetch.length === 0);
    ev("online");
    t("📶 réseau revenu → les modules sont prévenus (mktm:reseau-retour) pour sonder le serveur",
      c.w._emis.indexOf("mktm:reseau-retour") >= 0 && c.K.etat().etat === "on");

    const d = nouveauContexte("server");
    d.K.appliquerConfig(ON, true);
    d.K.signaler("on");
    d.w._fetch = () => Promise.reject(new TypeError("Load failed"));
    try { await d.K.requete("/v1/x"); } catch (e) { /* attendu */ }
    t("🩸 📶 un échec réseau isolé ne passe PAS en « down » (sinon la garde bloque tout jusqu'à la sonde suivante)",
      d.K.etat().etat === "on");
    const e2 = nouveauContexte("server");
    e2.K.appliquerConfig(ON, true);
    e2.K.signaler("on");
    e2.w._fetch = () => { const x = new Error("annulée"); x.name = "AbortError"; return Promise.reject(x); };
    try { await e2.K.requete("/v1/x"); } catch (e) { /* attendu */ }
    t("📶 annulation volontaire (AbortError : délai, veilleur) → l'état ne bouge pas", e2.K.etat().etat === "on");
    const off = nouveauContexte(null);
    (off.w._ecoutes.offline || []).forEach((f) => f({ type: "offline" }));
    t("📶 instance OFF : couper le réseau ne fabrique pas un « down »", off.K.etat().etat === "off");

    // signal transmis à la source de plans (le veilleur de l'accueil annule par lui)
    const p = nouveauContexte("server");
    let recu = null;
    p.K.register({ nom: "src", apiVersion: 1, plans: { lister: () => [], charger: (id, o) => { recu = o; return Promise.resolve("blob"); } } });
    const sig = { aborted: false };
    await p.K.chargerPlanExtension("a", { signal: sig, progression() {} });
    t("📶 chargerPlanExtension transmet opts.signal à l'extension", recu && recu.signal === sig);
  }

  // ── Veilleur d'inactivité de l'accueil : EXÉCUTÉ (délais réduits), pas seulement lu ──────
  {
    const HL = lire("js/homeLoader.js");
    const i = HL.indexOf("const _VEILLE_DEBUT_MS"), j = HL.indexOf("const _horsLigne");
    const src = (i >= 0 && j > i) ? HL.slice(i, j).replace("_VEILLE_DEBUT_MS = 15000", "_VEILLE_DEBUT_MS = 40")
      .replace("_VEILLE_INACTIF_MS = 20000", "_VEILLE_INACTIF_MS = 60") : "";
    t("⏱️ veilleur trouvé, délais de 15 s (départ) et 20 s (inactivité)",
      /_VEILLE_DEBUT_MS = 15000, _VEILLE_INACTIF_MS = 20000/.test(HL) && src.length > 0);
    const ctx = vm.createContext({ setTimeout, clearTimeout, AbortController, Promise, Error });
    vm.runInContext(src + "; this.V = _veilleurTelechargement;", ctx);
    const v1 = ctx.V();
    let code = null;
    try { await v1.course(new Promise(() => {})); } catch (e) { code = e.code; }
    t("⏱️ rien reçu → abandon (INACTIF) au lieu d'attendre sans fin, requête annulée", code === "INACTIF" && v1.signal.aborted);
    const v2 = ctx.V();
    let ok = null;
    const lent = new Promise((r) => {
      let n = 0;
      const tic = setInterval(() => { v2.toucher(); if (++n === 8) { clearInterval(tic); r("fini"); } }, 25);
    });
    try { ok = await v2.course(lent); } catch (e) { ok = e.code; }
    v2.arreter();
    t("⏱️ téléchargement lent mais vivant (200 ms > délai, des octets toutes les 25 ms) → jamais coupé", ok === "fini");
    t("⏱️ branches ZIP et ☁️ : veilleur + rien tenté hors ligne + message « connexion perdue »",
      (HL.match(/veille\.course\(/g) || []).length === 2 && (HL.match(/_horsLigne\(\)/g) || []).length === 2 &&
      /zipIndex\.coupe/.test(HL) && /ext\.chargement\.coupe/.test(HL) && /signal: veille\.signal/.test(HL));
  }

  // ── 4. GARDE DES REQUÊTES ──────
  {
    const off = nouveauContexte(null);
    let refus = false;
    try { await off.K.requete("/v1/x"); } catch (e) { refus = true; }
    t("🩸 instance OFF : requete refuse AVANT tout envoi (aucun fetch)", refus && off.appelsFetch.length === 0);

    const lic = nouveauContexte(null);
    lic.K.appliquerConfig(ON, true);   // « on » sans licence → licence
    refus = false;
    try { await lic.K.requete("/v1/x"); } catch (e) { refus = true; }
    t("« on » sans licence : refus, aucun fetch", refus && lic.appelsFetch.length === 0);

    const cfg = nouveauContexte("server");
    cfg.K.appliquerConfig(ON, true);
    t("« on » + licence serveur → état configurée", cfg.K.etat().etat === "configuree");
    await cfg.K.requete("/v1/sante");
    t("requête vers l'API déclarée : part", cfg.appelsFetch.length === 1 && cfg.appelsFetch[0] === "https://api.exemple.org/v1/sante");
    const ini = cfg.appelsFetch.dernierInit || {};
    t("🩸 la requête est marquée X-Kta-Ext et sans cache (le SW ne la mettra jamais en cache)",
      ini.cache === "no-store" && ini.headers && typeof ini.headers.get === "function" && ini.headers.get("X-Kta-Ext") === "1");
    refus = false;
    try { await cfg.K.requete("https://ailleurs.example.net/x"); } catch (e) { refus = true; }
    t("🩸 requête vers une AUTRE origine : refusée", refus && cfg.appelsFetch.length === 1);
    cfg.K.signaler("down");
    t("signaler(\"down\") sur une instance configurée → injoignable", cfg.K.etat().etat === "down");
    refus = false;
    try { await cfg.K.requete("/v1/x"); } catch (e) { refus = true; }
    t("injoignable : rien ne part…", refus && cfg.appelsFetch.length === 1);
    await cfg.K.requete("/v1/sante", { sonde: true });
    t("…sauf une sonde (pour détecter le retour du serveur)", cfg.appelsFetch.length === 2);
    cfg.K.signaler("on");
    t("signaler(\"on\") → connectée", cfg.K.etat().etat === "on");
    // licence REFUSÉE par le serveur : état « licence » + sa raison, jamais « down ».
    cfg.K.signaler("licence", "expiree");
    t("🩸 signaler(\"licence\", raison) → état « licence » avec la raison du serveur",
      cfg.K.etat().etat === "licence" && cfg.K.etat().raison === "expiree");
    t("signaler(<inconnu>) refusé, l'état ne bouge pas",
      cfg.K.signaler("ouvert") === false && cfg.K.etat().etat === "licence");
    cfg.K.signaler("on");
    t("signaler(\"on\") après un refus de licence → connectée", cfg.K.etat().etat === "on" && cfg.K.etat().raison !== "expiree");

    const off2 = nouveauContexte("server");
    off2.K.appliquerConfig({}, true);
    off2.K.signaler("on");
    t("🩸 un signal ne rallume JAMAIS une instance OFF", off2.K.etat().etat === "off");
  }

  // ── 4 bis. API « MÊME SITE » (/api/) ──────
  {
    const rel = nouveauContexte("server");
    rel.w.location = { origin: "https://club.exemple.org", href: "https://club.exemple.org/index.html" };
    rel.K.appliquerConfig({ serverConnection: { state: "on", api: "/api/", modules: ["pro/m.js"] } }, true);
    t("api « /api/ » acceptée (état configurée)", rel.K.etat().etat === "configuree");
    await rel.K.requete("health");
    t("requête résolue à l'adresse de l'app (localhost, IP ou domaine : peu importe)",
      rel.appelsFetch.length === 1 && rel.appelsFetch[0] === "https://club.exemple.org/api/health", rel.appelsFetch[0]);
    let refus = false;
    try { await rel.K.requete("https://autre.exemple.org/api/x"); } catch (e) { refus = true; }
    t("🩸 api même site : une adresse d'un AUTRE site reste refusée", refus && rel.appelsFetch.length === 1);
  }

  // ── 5. CHARGEUR DE MODULES (règle E) ──────
  {
    const off = nouveauContexte("server");
    off.K.appliquerConfig({}, true);
    const r = await off.K.chargerModules();
    t("🩸 instance OFF (myktamap.fr) : aucun module chargé", r.demandes === 0 && off.scripts.length === 0);
    const sansLic = nouveauContexte(null);
    sansLic.K.appliquerConfig(ON, true);
    const r2 = await sansLic.K.chargerModules();
    t("🩸 « on » sans licence serveur : aucun module chargé", r2.demandes === 0 && sansLic.scripts.length === 0);
  }

  // ── 6. JOURNAL, EFFACEMENT, SECOURS ──────
  {
    const c = nouveauContexte(null);
    c.w.getEditorPoints = () => [{ uid: "pt_a", updatedAt: 100 }, { uid: "pt_b", updatedAt: 300 }];
    c.w.getRoads = () => [{ uid: "rd_a", updatedAt: 400, type: "principal" }, { uid: "rd_i", updatedAt: 500, type: "itinerary" }];
    c.w.getZones = () => []; c.w.getStructures = () => [];
    c.w.KtaUid = { getTombstones: () => [{ uid: "zn_x", deletedAt: 250 }, { uid: "zn_y", deletedAt: 50 }] };
    const vide = c.K.changementsDepuis(0);
    t("🔒 plan pas encore prêt (chargement) : journal vide — les objets du plan quitté ne partent pas vers le nouveau",
      c.K.planPret() === false && vide.editorPoints.length === 0 && vide.roads.length === 0 && vide.tombstones.length === 0);
    c.w._currentLoadedPlanId = "ext_1";
    c.K.planCharge("ext_1");
    t("plan prêt : planPret() vrai, événement mktm:plan-pret", c.K.planPret() === true && c.w._emis.includes("mktm:plan-pret"));
    c.w._currentLoadedPlanId = "ext_2";
    t("🩸 un autre plan en cours de chargement n'est pas « prêt »", c.K.planPret() === false);
    c.w._currentLoadedPlanId = "ext_1";
    c.w.ktaPlanAffiche = () => false;
    t("plan prêt mais accueil affiché : pas prêt", c.K.planPret() === false);
    delete c.w.ktaPlanAffiche;
    c.K.quitterPlan("plan");
    t("quitterPlan : plus prêt jusqu'au prochain planCharge", c.K.planPret() === false);
    c.K.planCharge("ext_1");
    const ch = c.K.changementsDepuis(200);
    t("journal : objets modifiés après la date, et seulement eux", ch.editorPoints.length === 1 && ch.editorPoints[0].uid === "pt_b");
    t("journal : l'itinéraire calculé n'en fait pas partie", ch.roads.length === 1 && ch.roads[0].uid === "rd_a");
    t("journal : traces de suppression postérieures à la date", ch.tombstones.length === 1 && ch.tombstones[0].uid === "zn_x");
    const supprimes = [];
    c.w.PlanRegistry = { findById: (id) => ({ ext_a: { id: "ext_a", type: "ext" }, loc: { id: "loc", type: "local" }, srv: { id: "srv", type: "server" } })[id] || null,
                         remove: (id) => { supprimes.push(id); return Promise.resolve(); },
                         purgeAssociatedData: (id) => { purges.push(id); return Promise.resolve({}); } };
    const purges = [];
    const r = await c.K.effacerDonneesExtension(["ext_a", "loc", "srv"]);
    t("🩸 effacement à la déconnexion : SEULS les plans d'extension partent (jamais local ni serveur)",
      r.effaces === 1 && r.refuses === 2 && supprimes.join() === "ext_a");
    t("…avec leurs photos, sauvegardes et calage (purge du registre), toujours seulement l'extension", purges.join() === "ext_a");
    let appel = null;
    c.w.SecoursMode = { update: (id, p) => { appel = [id, p]; return true; } };
    t("Secours entrant : passe par la fusion en liste blanche existante (SecoursMode.update)",
      c.K.secoursAppliquer("sc1", { nom: "x" }) === true && appel[0] === "sc1");
  }

  // ── 6 bis. COMPTE CONNECTÉ ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : aucun compte (myktamap.fr garde son profil local)", K.compte() === null);
    K.register({ nom: "c1", apiVersion: 1, compte: () => ({ pseudo: "  karma  ", libelle: "Admin" }) });
    const c = K.compte();
    t("compte déclaré : pseudo nettoyé + libellé", c && c.pseudo === "karma" && c.libelle === "Admin");
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "c2", apiVersion: 1, compte: () => { throw new Error("x"); } });
    t("🩸 erreur de l'extension → aucun compte (la carte garde le profil local)", K2.compte() === null);
    const { K: K3 } = nouveauContexte(null);
    K3.register({ nom: "c3", apiVersion: 1, compte: () => ({ pseudo: "x".repeat(99), libelle: "y".repeat(99) }) });
    t("longueurs bornées (40 / 24)", K3.compte().pseudo.length === 40 && K3.compte().libelle.length === 24);
    const { K: K4 } = nouveauContexte(null);
    K4.register({ nom: "c4", apiVersion: 1, compte: () => ({ pseudo: "   " }) });
    t("pseudo vide → aucun compte", K4.compte() === null);
  }

  // ── 6 bis ter. RANGEMENT DIFFUSÉ + HORS LIGNE D'UN PLAN D'EXTENSION ──────
  {
    const { K, w } = nouveauContexte(null);
    w.PlanRegistry = { findById: (id) => (id === "ext_a" ? { id, type: "ext", extId: "A" } : id === "loc" ? { id, type: "local" } : null) };
    t("sans extension : rien n'est diffusé, pas de bouton hors ligne",
      (await K.rangerPlanExtension("ext_a", null)) === false && K.horsLigneExtensionDisponible() === false &&
      (await K.etatHorsLigneExtension("ext_a")) === null);
    const appels = [];
    K.register({ nom: "r1", apiVersion: 1, plans: { lister: () => Promise.resolve([]), charger: () => Promise.reject(new Error("x")),
      ranger: (id, d) => { appels.push([id, d]); return Promise.resolve(true); },
      horsLigne: { etat: () => Promise.resolve("perime"), garder: () => Promise.resolve(true) } } });
    K.associerDossiersExtension({ f_secteur: "D1" });
    t("dossier de l'installation : rangé côté serveur avec les ids de l'extension",
      (await K.rangerPlanExtension("ext_a", "f_secteur")) === true && JSON.stringify(appels[0]) === '["A","D1"]');
    t("sortir d'un dossier de l'installation : dossier null envoyé", (await K.rangerPlanExtension("ext_a", null)) === true && appels[1][1] === null);
    t("🩸 dossier créé sur l'appareil : JAMAIS diffusé", (await K.rangerPlanExtension("ext_a", "f_perso")) === false && appels.length === 2);
    t("plan local : jamais envoyé à l'extension", (await K.rangerPlanExtension("loc", "f_secteur")) === false && appels.length === 2);
    t("hors ligne d'un plan ☁️ : état et copie via l'extension",
      K.horsLigneExtensionDisponible() && (await K.etatHorsLigneExtension("ext_a")) === "perime" && (await K.garderPlanExtension("ext_a")) === true);
    const { K: K2, w: w2 } = nouveauContexte(null);
    w2.PlanRegistry = w.PlanRegistry;
    K2.register({ nom: "r2", apiVersion: 1, plans: { lister: () => [], charger: () => null, ranger: () => { throw new Error("x"); },
      horsLigne: { etat: () => "n'importe quoi", garder: () => Promise.reject(new Error("y")) } } });
    K2.associerDossiersExtension({ f_secteur: "D1" });
    t("🩸 extension en erreur : refus, état inconnu, aucune exception",
      (await K2.rangerPlanExtension("ext_a", "f_secteur")) === false && (await K2.etatHorsLigneExtension("ext_a")) === null &&
      (await K2.garderPlanExtension("ext_a")) === false);
  }

  // ── 6 bis quinquies. ACTIONS SUR LA FICHE D'UN OBJET ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : aucune action sur les fiches", K.actionsObjet("pt_x").length === 0);
    K.register({ nom: "ao", apiVersion: 1, actionsObjet: (uid) => [{ libelle: "  🕘 Historique  ", action: () => uid },
      { libelle: "", action: () => 1 }, { libelle: "sans action" }, "n'importe quoi"] });
    const l = K.actionsObjet("pt_x");
    t("actions nettoyées (libellé, fonction), formes inattendues écartées", l.length === 1 && l[0].libelle === "🕘 Historique");
    t("uid absent → aucune action", K.actionsObjet("").length === 0);
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "ao2", apiVersion: 1, actionsObjet: () => { throw new Error("x"); } });
    t("🩸 extension en erreur → aucune action, aucune exception", K2.actionsObjet("pt_x").length === 0);
    const U = lire("js/utils.js");
    t("fiches de session : l'uid de l'objet est porté par la fiche (point + tracé/zone/structure)",
      /data-kta-uid="' \+ _escAttr\(point\.uid\)/.test(U) && /data-kta-uid="' \+ _esc\(_uid\)/.test(U));
    t("🩸 observateur des fiches posé SEULEMENT quand une extension a des actions ou une info à montrer",
      /if \(ext\.actionsObjet \|\| ext\.infoObjet\) _observerFiches\(\);/.test(lire("js/ktaExtensions.js")));
    t("🩸 panneau d'extension : bouton posé SEULEMENT si une extension fournit la prise (myktamap.fr : rien)",
      /const _panneauExt = \(window\.KtaExtensions && typeof window\.KtaExtensions\.panneauExtension === "function"\)/.test(lire("js/interface.js")) &&
      /if \(_panneauExt\) \{[\s\S]{0,600}_creerGroupeAccordeon\(_cfgPanneauExt\)/.test(lire("js/interface.js")));
    t("badge d'un plan d'extension : texte échappé (8 / 160 car.), plans ☁️ seulement",
      /\.slice\(0, 8\)/.test(lire("js/ktaExtensions.js")) && /kta-plan-row-ext-badge" title="' \+ escapeHtml\(bx\.titre\) \+ '">' \+\s*escapeHtml\(bx\.texte\)/.test(lire("js/homeLoader.js")));
    t("badges : mis à jour sur place à l'événement (pas de liste redessinée)",
      /mktm:plans-badges-changes"[\s\S]{0,200}ktaMajBadgesExtension\(\)/.test(lire("js/main.js")) && /data-ext-badge-for=/.test(lire("js/homeLoader.js")));
    t("info d'objet : texte seulement (textContent), 120 caractères, jamais écrite par l'app",
      /ligne\.textContent = info;/.test(lire("js/ktaExtensions.js")) && /\.slice\(0, 120\)/.test(lire("js/ktaExtensions.js")));
  }

  // ── 6 bis nonies. LIAISONS INTER-PLAN SYNCHRONISÉES PAR UNE EXTENSION (vrai interPlanLinks.js) ──────
  {
    const { K } = nouveauContexte(null);
    const L0 = { id: "ipl_x", a: { planId: "p1" }, b: { planId: "p2" } };
    t("liaisons sans extension : aucune info, aucune action, tout est modifiable",
      K.liaisonInfo(L0) === "" && K.liaisonActions(L0).length === 0 && K.liaisonModifiable(L0) === true);
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "lz", apiVersion: 1, liaisons: { info: () => { throw new Error("x"); },
      actions: () => { throw new Error("x"); }, modifiable: () => { throw new Error("x"); } } });
    t("🩸 prise « liaisons » en erreur : pas d'info, pas d'action, et MODIFIABLE = NON (permission)",
      K2.liaisonInfo(L0) === "" && K2.liaisonActions(L0).length === 0 && K2.liaisonModifiable(L0) === false);
    const { K: K3 } = nouveauContexte(null);
    let vu = null;
    K3.register({ nom: "lz3", apiVersion: 1, liaisons: { info: (l) => { vu = l; l.id = "change"; return "  " + "i".repeat(200); },
      actions: () => [{ libelle: "A", action: () => 1 }, { libelle: "B", action: () => 2 }, { libelle: "C", action: () => 3 },
        { libelle: "sans action" }], modifiable: () => "oui" } });
    t("info en texte (80 car.), 2 actions au plus, modifiable vrai seulement si `true`",
      K3.liaisonInfo(L0).length === 80 && K3.liaisonActions(L0).length === 2 && K3.liaisonModifiable(L0) === false);
    t("🩸 l'extension reçoit une COPIE du lien (elle ne réécrit pas le registre)", vu && L0.id === "ipl_x");

    // Vrai module, faux navigateur : registre, événements émis (avec leur détail), extension facultative.
    const ipl = (ext) => {
      const store = {}, emis = [];
      const w = {
        console: { log() {}, warn() {}, error() {} },
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
        CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
        dispatchEvent(e) { emis.push(e); return true; }, addEventListener() {}, removeEventListener() {},
        KtaExtensions: ext || undefined, setTimeout: setTimeout
      };
      w.window = w;
      const ctx = vm.createContext(w);
      vm.runInContext("var localStorage = window.localStorage, CustomEvent = window.CustomEvent, console = window.console;", ctx);
      vm.runInContext(lire("js/interPlanLinks.js"), ctx, { filename: "interPlanLinks.js" });
      const ev = () => emis.filter((e) => e.type === "mktm:liaisons-changees").map((e) => e.detail);
      return { L: w.InterPlanLinks, ev, store };
    };
    const cote = (planId, uid) => ({ planId, pointUid: uid, pointId: uid, x: 1, y: 2 });
    {
      const { L, ev } = ipl(null);
      const lien = L.createLink(cote("p1", "pt_a"), cote("p2", "pt_b"));
      t("création : updatedAt posé, « creation » annoncée APRÈS l'écriture",
        typeof lien.updatedAt === "number" && ev().length === 1 && ev()[0].action === "creation" && ev()[0].ids[0] === lien.id &&
        !ev()[0].source && L.getAllLinks().length === 1);
      L.onPointMoved("p1", { uid: "pt_a", id: "pt_a", x: 5, y: 6 });
      t("point déplacé : côté recalé, « modification » annoncée",
        ev()[1].action === "modification" && L.getAllLinks()[0].a.x === 5);
      const r = L.appliquerExterne({ liens: [{ id: "ipl_ext", a: cote("p1", "pt_c"), b: cote("p3", "pt_d") }, { id: "sans_cotes" }],
        retirer: [lien.id] });
      const d = ev().slice(2);
      t("🩸 dépôt d'une extension : écrit, retiré, annoncé avec source « extension » seulement (pas de renvoi)",
        r.ecrites === 1 && r.retirees === 1 && d.length === 2 && d.every((x) => x.source === "extension") &&
        L.getAllLinks().length === 1 && L.getAllLinks()[0].id === "ipl_ext");
      L.importLinks([{ id: "ipl_imp", a: cote("p1", "pt_e"), b: cote("p4", "pt_f") }]);
      t("import d'un export : annoncé « creation » avec source « import » (pas un geste de création)",
        ev().slice(-1)[0].source === "import" && ev().slice(-1)[0].action === "creation");
      L.onPointDeleted("p1", { uid: "pt_c", id: "pt_c" });
      t("sans extension : supprimer le point retire sa liaison (« suppression » annoncée)",
        ev().slice(-1)[0].action === "suppression" && !L.getAllLinks().some((l) => l.id === "ipl_ext"));
    }
    {
      const ext = { liaisonModifiable: (l) => l.id !== "ipl_garde", liaisonInfo: () => "", liaisonActions: () => [] };
      const { L, ev } = ipl(ext);
      L.appliquerExterne({ liens: [{ id: "ipl_garde", a: cote("p1", "pt_a"), b: cote("p2", "pt_b") }] });
      const avant = ev().length;
      L.onPointDeleted("p1", { uid: "pt_a", id: "pt_a" });
      t("🩸 liaison que l'extension dit non modifiable : gardée quand son point est supprimé, rien d'annoncé",
        L.getAllLinks().length === 1 && ev().length === avant);
    }
    const IPL = lire("js/interPlanLinks.js");
    t("🩸 suppression confirmée : refusée si l'extension dit la liaison non modifiable (🗑️ masquée aussi)",
      /if \(lien && !_modifiable\(lien\)\) \{[\s\S]{0,200}ipl\.remove\.refuse/.test(IPL) &&
      /\(e\.baked \|\| !_modifiable\(e\.link\)\) \? ''/.test(IPL) && /\(_modifiable\(l\) \? '<button class="kta-popup-btn kta-ipl-del"/.test(IPL));
    t("info d'extension échappée dans la fiche et le gestionnaire", (IPL.match(/kta-ipl-ext-info">' \+ _esc\(info\)/g) || []).length === 2);
  }

  // ── 6 bis sexies. PUBLIER UN PLAN LOCAL DEPUIS SA FICHE ──────
  {
    const HLp = lire("js/homeLoader.js");
    t("fiche ℹ️ : « Publier sur l'installation » seulement pour un plan local ET si une extension sait publier",
      /plan\.type !== "ext" && plan\.type !== "server" && window\.KtaExtensions &&[\s\S]{0,120}aPrise\("publierPlan"\)/.test(HLp));
    t("…l'envoi passe par la prise (archive gardée, sinon fichier choisi)",
      /window\.KtaExtensions\.publierPlan\(\{ blob: blob/.test(HLp) && /input\.accept = "\.zip,application\/zip"/.test(HLp));
  }

  // ── 6 bis quater. PLAN PUBLIÉ : LA LISTE EST RELUE ──────
  {
    const { K, w } = nouveauContexte(null);
    const evts = [];
    w.dispatchEvent = (e) => { evts.push(e.type); return true; };
    K.register({ nom: "pub", apiVersion: 1, publierPlan: () => Promise.resolve({ id: "x" }) });
    await K.publierPlan({ blob: null, nom: "n" });
    t("publication réussie → mktm:plans-extension-changes (le plan rejoint l'accueil sans redémarrer)",
      evts.indexOf("mktm:plans-extension-changes") >= 0);
    t("…et l'accueil relit la liste à cet événement",
      /addEventListener\("mktm:plans-extension-changes"[\s\S]{0,200}_decouvrirPlansExtension\(\)/.test(lire("js/main.js")));
  }

  // ── 6 bis quater bis. NOUVELLE VERSION D'UN PLAN (prise publierVersion) ──────
  // 🔒 `autorise` est une permission : absente, fausse, mal typée ou en erreur = refus, et rien n'est envoyé.
  {
    const registre = { findById: (id) => (id === "ext_p1" ? { id: "ext_p1", type: "ext", extId: "p1" }
      : id === "local_a" ? { id: "local_a", type: "local" } : null) };
    const sans = nouveauContexte(null);
    sans.w.PlanRegistry = registre;
    let rejet = false;
    await sans.K.publierVersion({ planId: "ext_p1", blob: null, nom: "n" }).catch(() => { rejet = true; });
    t("sans extension : aucune version autorisée, publierVersion rejette (no-op)",
      sans.K.versionAutorisee("ext_p1") === false && rejet);

    const essai = async (autorise) => {
      const c = nouveauContexte(null);
      c.w.PlanRegistry = registre;
      const envois = [];
      c.K.register({ nom: "v", apiVersion: 1, publierVersion: { autorise: autorise,
        publier: (a) => { envois.push(a); return Promise.resolve({ version: 2 }); } } });
      let refus = false;
      const r = await c.K.publierVersion({ planId: "ext_p1", blob: "B", nom: "N" }).catch(() => { refus = true; });
      return { c, envois, refus, r };
    };
    const enErreur = await essai(() => { throw new Error("x"); });
    t("autorise en erreur → refus, rien d'envoyé", enErreur.c.K.versionAutorisee("ext_p1") === false &&
      enErreur.refus && enErreur.envois.length === 0);
    const malType = await essai(() => "true");
    t("autorise qui ne rend pas true (texte) → refus, rien d'envoyé", malType.refus && malType.envois.length === 0);
    const non = await essai(() => false);
    t("autorise false → refus, rien d'envoyé", non.refus && non.envois.length === 0);
    const oui = await essai((id) => id === "p1");
    t("autorise true → envoi sous l'id de l'EXTENSION (pas l'id du registre), avec le fichier et le nom",
      !oui.refus && oui.envois.length === 1 && oui.envois[0].id === "p1" && oui.envois[0].blob === "B" &&
      oui.envois[0].nom === "N" && oui.r && oui.r.version === 2);
    t("…puis mktm:plans-extension-changes (la liste se relit)", oui.c.w._emis.indexOf("mktm:plans-extension-changes") >= 0);
    t("plan local : jamais autorisé (la prise ne voit que les plans de l'extension)",
      oui.c.K.versionAutorisee("local_a") === false);

  }

  // ── 6 bis bis. PRÉSENCE (tracking à plusieurs, opt-in) ──────
  {
    const { K, w } = nouveauContexte(null);
    t("sans extension : présence inactive, pas de tuile (aPrise faux)", K.presenceActive() === false && K.aPrise("presence") === false);
    t("sans extension : basculer ne publie rien (→ false)", (await K.basculerPresence()) === false);
    t("sans carte : aucune position lue", K.positionTracker() === null);
    w.map = {};
    w.getTrackingPosition = () => ({ x: 10, y: 20 });
    w.getTrackerLevel = () => -1;
    w.getTrackingPositionEtat = () => ({ suiviActif: false, confirmee: false });
    t("🩸 ni suivi ni position confirmée → null (jamais le point de départ du plan publié)", K.positionTracker() === null);
    w.getTrackingPositionEtat = () => ({ suiviActif: true, confirmee: false });
    const p = K.positionTracker();
    t("suivi en cours → position + niveau", p && p.x === 10 && p.y === 20 && p.niveau === -1 && p.suiviActif === true);
    t("affichage sans module de rendu → 0, sans erreur", K.afficherPresences([{ id: "a", pseudo: "b", x: 1, y: 2 }]) === 0);
    let actif = false;
    K.register({ nom: "p1", apiVersion: 1, presence: { actif: () => actif, basculer: () => { actif = !actif; } } });
    t("extension déclarée : tuile proposée, bascule effective", K.aPrise("presence") && (await K.basculerPresence()) === true && K.presenceActive());
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "p2", apiVersion: 1, presence: { actif: () => { throw new Error("x"); }, basculer: () => Promise.reject(new Error("y")) } });
    t("🩸 extension en erreur → présence inactive, aucune exception", K2.presenceActive() === false && (await K2.basculerPresence()) === false);
    const IF = lire("js/interface.js");
    t("tuile 📡 du tracker : seulement si une extension a la prise « presence »",
      /X\.aPrise\("presence"\)/.test(IF) && /_groupes\.tracker\.dynamicSousActions = function/.test(IF));
    const PR = lire("js/ktaPresences.js");
    t("🩸 présences : affichage seulement (aucune requête réseau dans le module)", !/fetch\(|XMLHttpRequest|WebSocket/.test(PR));
    t("présences : coordonnées par convertCoord", /window\.convertCoord\(x, y\)/.test(PR));
    // Qui est qui : une couleur par personne, tirée de son identifiant.
    const elt = (tag) => ({ tag, attrs: {}, dataset: {}, style: {}, enfants: [], className: "", textContent: "",
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
      appendChild(c) { this.enfants.push(c); return c; } });
    const couches = [];
    const groupe = () => ({ addTo(m) { this._map = m; return this; } });
    const couche = (type, o) => ({ addTo() { couches.push(Object.assign({ type }, o)); return this; } });
    const wp = { console: { log() {}, warn() {} }, setInterval: () => 1, clearInterval() {}, map: { removeLayer() {} },
      convertCoord: (x, y) => [y, x], Date, Math, JSON, Array, String,
      document: { createElement: elt, createElementNS: (ns, tag) => elt(tag) },
      L: { layerGroup: groupe, polyline: (pts, o) => couche("trace", { o }), divIcon: (o) => o,
        marker: (ll, o) => couche("repere", { icone: o.icon }), circleMarker: () => couche("etape", {}) } };
    wp.window = wp;
    const cp = vm.createContext(wp);
    vm.runInContext("var document = window.document, L = window.L;", cp);
    vm.runInContext(PR, cp, { filename: "ktaPresences.js" });
    const P = wp.KtaPresences;
    const pal = P.palette();
    const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    // Écart perçu (CIELAB, ΔE 1976) : la distance RGB brute juge mal le vert ou le violet.
    const lab = (c) => { const v = hex(c).map((x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      const f = (q) => (q > 0.008856 ? Math.cbrt(q) : 7.787 * q + 16 / 116);
      const X = f((v[0] * 0.4124 + v[1] * 0.3576 + v[2] * 0.1805) / 0.95047), Y = f(v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722);
      const Z = f((v[0] * 0.0193 + v[1] * 0.1192 + v[2] * 0.9505) / 1.08883);
      return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
    const dist = (a, b) => { const x = lab(a), y = lab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
    const teinte = (c) => { const [r, g, b] = hex(c).map((v) => v / 255), M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m;
      if (!d) return { h: 0, s: 0 };
      const h = M === r ? ((g - b) / d + 6) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return { h: h * 60, s: d / (1 - Math.abs(M + m - 1)) }; };
    const lum = (c) => { const v = hex(c).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    t("🎨 couleurDe : déterministe (même identifiant → même couleur)",
      typeof P.couleurDe === "function" && P.couleurDe("compte-42") === P.couleurDe("compte-42") && P.couleurDe(7) === P.couleurDe("7"));
    const ids = Array.from({ length: 300 }, (_, i) => "u" + i + "-" + (i * 7919).toString(36));
    t("🎨 couleurDe : toujours dans la palette, et la palette sert presque entière (≥ 8 couleurs sur 300 comptes)",
      pal.length >= 8 && ids.every((id) => pal.indexOf(P.couleurDe(id)) >= 0) && new Set(ids.map(P.couleurDe)).size >= Math.min(8, pal.length));
    t("🎨 palette : couleurs distinctes deux à deux (ΔE ≥ 40)", pal.every((a, i) => pal.every((b, j) => i === j || dist(a, b) >= 40)));
    t("🩸 palette : jamais le jaune d'accent ni sa teinte (itinéraires)", pal.every((c) => dist(c, "#f4c542") >= 35 &&
      !(teinte(c).s > 0.4 && teinte(c).h >= 38 && teinte(c).h <= 62)));
    t("🩸 palette : jamais de rouge (urgence)", pal.every((c) => { const x = teinte(c); return !(x.s > 0.35 && (x.h < 15 || x.h > 345)) &&
      dist(c, "#b3261e") >= 35 && dist(c, "#ff8c8c") >= 35; }));
    t("🩸 palette : ni le bleu de MON tracker, ni le gris d'une position ancienne",
      pal.every((c) => dist(c, "#8cb4ff") >= 40 && dist(c, "#8892a4") >= 35));
    t("palette : lisible sur fond sombre (contraste ≥ 3 avec #0a0d18 ; le contour sombre la porte sur fond clair)",
      pal.every((c) => (lum(c) + 0.05) / (lum("#0a0d18") + 0.05) >= 3) && /"stroke", "#0a0d18"/.test(PR));
    const fill = (r) => r.icone.html.enfants[0].enfants[0].attrs.fill;
    couches.length = 0;
    P.afficher([{ id: "a1", pseudo: "Ana", x: 1, y: 2, trace: [[0, 0], [1, 1]] },
      { id: "b2", pseudo: "Bob", x: 3, y: 4, couleur: "#123abc", trace: [[0, 0], [1, 1]] },
      { id: "c3", pseudo: "<img src=x onerror=1>", x: 5, y: 6, couleur: "red" }]);
    const rep = couches.filter((c) => c.type === "repere"), tr = couches.filter((c) => c.type === "trace");
    t("🎨 sans couleur fournie : repère ET trace à couleurDe(id)", rep.length === 3 && fill(rep[0]) === P.couleurDe("a1") &&
      tr[0].o.color === P.couleurDe("a1") && rep[0].icone.html.dataset.couleur === P.couleurDe("a1"));
    t("🎨 couleur fournie par l'extension (équipe Secours) : prioritaire, repère et trace",
      fill(rep[1]) === "#123abc" && tr[1].o.color === "#123abc" && P.liste()[1].couleur === "#123abc");
    t("🩸 couleur fournie non conforme (pas #rrggbb) : ignorée → couleurDe(id)", fill(rep[2]) === P.couleurDe("c3"));
    t("repère = la forme du tracker (SVG triangle + rond), taille proche du mien (40 px contre 50)",
      rep[0].icone.html.enfants[0].tag === "svg" && rep[0].icone.html.enfants[0].enfants.map((e) => e.tag).join() === "path,circle" &&
      rep[0].icone.iconSize[0] === 40);
    const etq = rep[2].icone.html.enfants[1];
    t("🩸 pseudo toujours affiché, posé en texte (textContent), jamais interprété",
      etq.className === "kta-presence-etiquette" && etq.textContent.indexOf("<img src=x onerror=1> · ") === 0 && !/innerHTML/.test(PR));
    // « Masquer une personne » : ni repère ni trace, réversible, plus suivie, oublié en sortie de plan.
    wp.map.getZoom = () => 1; wp.map.setView = () => {};
    P.suivre("a1");
    couches.length = 0;
    t("👁️ masquerPersonne : ni repère ni trace pour elle, les autres restent", P.masquerPersonne("a1", true) === true &&
      P.personneMasquee("a1") && couches.filter((c) => c.type === "repere").length === 2 &&
      couches.filter((c) => c.type === "trace").every((c) => c.o.color !== P.couleurDe("a1")));
    t("👁️ …une personne masquée n'est plus suivie", P.suivi() === null);
    couches.length = 0;
    P.masquerPersonne("a1", false);
    t("👁️ réafficher : son repère revient", !P.personneMasquee("a1") && couches.filter((c) => c.type === "repere").length === 3);
    P.masquerPersonne("b2", true); P.reinitialiser();
    t("👁️ sortie de plan : les masquages sont oubliés", !P.personneMasquee("b2"));
  }

  // ── 6 bis ter. LECTURE SEULE et SORTIE DE PLAN ──────
  {
    const IF = lire("js/interface.js");
    const iEd = IF.indexOf('id: "edition"');
    const bloc = iEd >= 0 ? IF.slice(iEd, IF.indexOf("});", iEd)) : "";
    t("🩸 bouton ✏️ (le VRAI, interface.js) : la lecture seule l'empêche de s'armer",
      /ktaEditionRefusee\(\)\)\s*return;\s*window\.modeEdition = true;/.test(bloc));
    t("outils de dessin grisés en lecture seule : 4 groupes, clic coupé, relu à l'ouverture du plan",
      /_KTA_GROUPES_DESSIN = \["edition", "traces", "zones", "structures"\]/.test(IF) &&
      /kta-outil-lecture-seule"\)\) return;[\s\S]{0,200}stopImmediatePropagation\(\)/.test(IF) &&
      /initInterface\(\);\s*\n[^\n]*\n\s*if \(typeof window\.ktaMajOutilsLectureSeule/.test(lire("js/main.js")));
    t("🩸 clic carte de l'éditeur : refusé en lecture seule", /_editorClickHandler = function\(e\) \{[\s\S]{0,120}ktaEditionRefusee/.test(lire("js/editor.js")));
    t("🩸 fiche d'un tracé / zone / structure : lecture seule = mode lecture (ni note, ni Convertir, ni 🗑️)",
      /_modeDemande === "edit" && typeof window\.ktaEditionRefusee === "function" && window\.ktaEditionRefusee\(true\)/.test(lire("js/utils.js")));
    const CV = lire("js/convertirObjet.js");
    t("🩸 conversion / suppression / niveau d'objet : gardées à l'entrée",
      ["function convertir(", "function supprimer(", "function convertirLot(", "function ouvrir(",
       "function changerNiveau(", "function appliquerTableau("].every((f) =>
        new RegExp(f.replace("(", "\\(") + "[^\\n]*\\n\\s*if \\(typeof window\\.ktaEditionRefusee").test(CV)));
    const { K, w } = nouveauContexte(null);
    let evts = 0;
    w.addEventListener = w.addEventListener || function () {};
    w.dispatchEvent = function (e) { if (e && e.type === "mktm:plan-ferme") evts++; return true; };
    w.CustomEvent = w.CustomEvent || function (type, o) { this.type = type; this.detail = o && o.detail; };
    let reinit = 0;
    w.KtaPresences = { reinitialiser: () => { reinit++; } };
    let sansErreur = true;
    try { K.quitterPlan("accueil"); } catch (e) { sansErreur = false; }
    t("sortie de plan : présences remises à zéro, événement mktm:plan-ferme, sans erreur", sansErreur && reinit === 1 && evts === 1);
    const MA = lire("js/main.js");
    t("…appelée au changement de plan ET au retour à l'accueil",
      /KtaExtensions\.quitterPlan\("plan"\)/.test(MA) && /KtaExtensions\.quitterPlan\("accueil"\)/.test(MA));
  }

  // ── 6 bis quater. AUTEUR D'UN OBJET (filtre « Créé par » de l'export) ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : auteurObjet → null, filtre auteur non proposé", K.auteurObjet("pt_x") === null && K.aPrise("auteurObjet") === false);
    K.register({ nom: "au1", apiVersion: 1, auteurObjet: (uid) => (uid === "pt_a" ? { createur: " Bob ", modifiePar: 12 } : null) });
    const a = K.auteurObjet("pt_a");
    t("extension : auteur nettoyé (texte seulement)", a && a.createur === "Bob" && a.modifiePar === null);
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "au2", apiVersion: 1, auteurObjet: () => { throw new Error("x"); } });
    t("🩸 extension en erreur → null, aucune exception", K2.auteurObjet("pt_a") === null);
    const SE = lire("js/sessionExporter.js");
    // ⚠️ Découpe sur du CODE (jamais sur un commentaire) ; repère absent → bloc vide → échec.
    const iO = SE.indexOf("window.ouvrirExportSessionModal = function");
    const jO = iO >= 0 ? SE.indexOf("_afficherModal();", iO) : -1;
    const ouvrir = (iO >= 0 && jO > iO) ? SE.slice(iO, jO) : "";
    t("export : le filtre ne touche que les onglets Complet et Avancé, remis à zéro à l'ouverture",
      /_activeTab === "full" \|\| _activeTab === "advanced"/.test(SE) &&
      ouvrir.indexOf('_filtre = { du: "", au: "", auteur: _auteurImpose || "" };') >= 0);
  }

  // ── 6 bis quinquies. GRADES ET HAUTS FAITS (prise profilJeu) ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : grades et hauts faits actifs", K.profilJeuActif() === true);
    K.register({ nom: "pj1", apiVersion: 1, profilJeu: () => false });
    t("extension : profilJeu false → grades et hauts faits coupés", K.profilJeuActif() === false);
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "pj2", apiVersion: 1, profilJeu: () => { throw new Error("x"); } });
    t("🩸 extension en erreur → restent actifs (prise d'information), aucune exception", K2.profilJeuActif() === true);
    const HP = lire("js/homeProfile.js");
    t("profil : anneau, bloc grade, hauts faits (calcul ET grille) gardés par _jeuProfilActif ; redessin à l'arrivée d'une extension",
      (HP.match(/!_jeuProfilActif()/g) || []).length >= 4 && /mktm:extensions-changees/.test(HP));
  }

  // ── 6 bis octies. DICTIONNAIRES D'UNE EXTENSION (I18n.ajouter) ──────
  {
    const LM = lire("js/langManager.js");
    t("I18n.ajouter : exposé, ajouts gardés à part et refusionnés à chaque chargement de dico (paresseux, reload)",
      /ajouter:\s+ajouter/.test(LM) && (LM.match(/_fusionnerAjouts\(code\);/g) || []).length >= 3);
    t("🩸 I18n.ajouter : une clé de l'app n'est jamais écrasée (seules les clés posées par l'extension se remplacent)",
      /hasOwnProperty\.call\(d, k\) && !posees\[k\]\) return;/.test(LM));
  }

  // ── 6 bis septies. STATISTIQUES DU PROFIL (prise profilStats) ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : aucune statistique d'extension", (await K.profilStatsExtension()).length === 0);
    K.register({ nom: "ps1", apiVersion: 1, profilStats: () => [
      { cle: "plans-org", icone: "☁️", libelle: "Plans", valeur: 12, titre: "t" },
      { cle: "plans-org", icone: "x", libelle: "doublon", valeur: 1 },
      { cle: "mauvaise clé", libelle: "x", valeur: 1 }, { cle: "vide", libelle: "x", valeur: "" }, null
    ] });
    const l = await K.profilStatsExtension();
    t("extension : lignes nettoyées (texte, clé [\\w-] unique, valeur requise)",
      l.length === 1 && l[0].cle === "plans-org" && l[0].valeur === "12" && l[0].icone === "☁️");
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "ps2", apiVersion: 1, profilStats: () => { throw new Error("x"); } });
    t("🩸 extension en erreur → aucune ligne, aucune exception", (await K2.profilStatsExtension()).length === 0);
    const HP = lire("js/homeProfile.js");
    t("profil : score / hauts faits ni proposés ni affichés au bandeau quand le jeu est coupé ; stats d'extension en texte",
      /\(k === "score" \|\| k === "feats"\) && !_jeuProfilActif\(\)/.test(HP) && /\(_jeuProfilActif\(\)\s*\n?\s*\? '<label/.test(HP) &&
      /val\.textContent = "—"/.test(HP) && /_echapStat\(x\.valeur\)/.test(HP));
    t("profil : plans ☁️ comptés à part, noms de types ☁️ jamais dans le dictionnaire durable, cache de stats purgé avec le plan",
      /_estPlanExt/.test(HP) && /if \(!_estPlanExt\(pc\)\) _persisterNoms/.test(HP) &&
      /removeItem\("myktamap_plan_stats_v1_" \+ id\)/.test(lire("js/planRegistry.js")));
    t("profil : 💾 compte les bases IDB « kta_ / myktamap » listées par le navigateur (jamais créées) et isole ☁️",
      /indexedDB\.databases\(\)/.test(HP) && /presentes && presentes\.indexOf\(nom\) < 0/.test(HP) &&
      /n\.indexOf\("kta_"\) === 0 \|\| n\.indexOf\("myktamap"\) === 0/.test(HP) &&
      /acc\.ids\[cur\.key\]\) acc\.ext \+=/.test(HP) && /home\.profile\.stats\.dontExt/.test(HP));
    t("profil : cache de stats du plan courant recalculé (2 s) après des changements reçus",
      /dispatchEvent\(new CustomEvent\("mktm:changements-appliques"\)\)/.test(lire("js/ktaExtensions.js")) &&
      /addEventListener\("mktm:changements-appliques"[\s\S]{0,200}_persisterStatsPlanCourant\(\)[\s\S]{0,40}2000/.test(HP));
    const SG = lire("js/statsGlobales.js");
    t("stats du plan : répartition par auteur seulement avec la prise auteurObjet, noms échappés",
      /K\.aPrise\("auteurObjet"\)/.test(SG) && /_escapeHtml\(a\.nom != null/.test(SG));
  }

  // ── 6 bis sexies. ALERTES D'UNE EXTENSION (prise alertes, même modale qu'alert.json) ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : aucune alerte d'extension", (await K.alertesExtension()).length === 0 && K.aPrise("alertes") === false);
    K.register({ nom: "al1", apiVersion: 1, alertes: { lister: () => [
      { id: "a/1", level: "emergency", title: " Gaz ", message: "Évacuez", released: "2026-10-13T10:00:00Z", source: "🏢 Org", details: ["x", 3, ""] },
      { id: "b", level: "panique", title: "T", released: "2026-10-13T11:00:00Z" },
      { id: "c", title: "sans date" }, null, "texte"
    ] } });
    const l = await K.alertesExtension();
    t("extension : alertes nettoyées, id préfixé ext_, niveau inconnu → info, sans date ni texte écartées",
      l.length === 2 && l[0].id === "ext_a_1" && l[0].title === "Gaz" && l[0].details.length === 1 && l[0].source === "🏢 Org" &&
      l[1].level === "info");
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "al2", apiVersion: 1, alertes: { lister: () => { throw new Error("x"); } } });
    t("🩸 extension en erreur → aucune alerte, aucune exception", (await K2.alertesExtension()).length === 0);
    const AC = lire("js/alertChecker.js");
    t("AlertChecker : liste de l'extension fusionnée (check, bouton 🚨), relue à mktm:alertes-changees, attente bornée",
      /KtaExtensions\.alertesExtension\(\)/.test(AC) && /addEventListener\("mktm:alertes-changees"/.test(AC) &&
      /const ALERTES_DELAI_MS = 3000;/.test(lire("js/ktaExtensions.js")));
  }

  // ── 6 quinquies. MODE SECOURS RELIÉ (étude Secours, étapes 1-3) ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : aucun bouton Secours, aucun texte, tout est permis",
      K.secoursActions({ scenarioId: "s" }).length === 0 && K.secoursInfoEquipe("s", "g") === "" && K.secoursPeutAvancer("s", "g", "etape") === true);
    K.register({ nom: "se1", apiVersion: 1,
      secoursActions: () => [{ libelle: " Déclencher ", action: () => {} }, { libelle: "", action: () => {} }, { libelle: "x" }],
      secoursInfoEquipe: () => "Comptes : A ★", secoursPeutAvancer: (s, g, q) => q !== "rentree" });
    const a = K.secoursActions({ scenarioId: "s" });
    t("extension : boutons valides seulement (libellé + action)", a.length === 1 && a[0].libelle === "Déclencher");
    t("extension : info d'équipe et garde", K.secoursInfoEquipe("s", "g") === "Comptes : A ★" &&
      K.secoursPeutAvancer("s", "g", "etape") === true && K.secoursPeutAvancer("s", "g", "rentree") === false);
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "se2", apiVersion: 1, secoursPeutAvancer: () => { throw new Error("x"); }, secoursActions: () => { throw new Error("y"); } });
    t("🩸 garde en erreur → REFUS (une permission qui échoue ne laisse pas passer) ; boutons en erreur → aucun",
      K2.secoursPeutAvancer("s", "g", "etape") === false && K2.secoursActions({}).length === 0);
    const { K: K3 } = nouveauContexte(null);
    const nbSans = K3.secoursNbComptesEquipe("s", "g");
    K3.register({ nom: "se3", apiVersion: 1, secoursNbComptesEquipe: (s, g) => (g === "g" ? 3 : g === "e" ? (() => { throw new Error("z"); })() : -2) });
    t("effectif : comptes reliés = 0 sans extension, entier valide avec, 0 si négatif ou en erreur",
      nbSans === 0 && K3.secoursNbComptesEquipe("s", "g") === 3 && K3.secoursNbComptesEquipe("s", "x") === 0 &&
      K3.secoursNbComptesEquipe("s", "e") === 0);
    const SM = lire("js/secoursMode.js");
    t("Mode Secours : chaque avancée passe par la garde (étape, départ/rentrée/rappel, rentrée comptée, rappel)",
      /if \(!_peut\(scenarioId, equipeId, "etape"\)\) return null;/.test(SM) && /_peut\(scenarioId, gid, \{ departAt: "depart"/.test(SM) &&
      /if \(!_peut\(sid, gid, "rentree"\)\) return false;/.test(SM) && /if \(!_peut\(sid, null, "rappel"\)\) return false;/.test(SM));
    t("🩸 un changement reçu n'est jamais ré-émis (pas de boucle entre appareils)",
      /function _emettre\(nom, detail\) \{\n\s*if \(_appliqueDistant\) return;/.test(SM));
  }

  // ── 6 ter. ITINÉRAIRE PUBLIÉ (montré à l'équipe, opt-in) ──────
  {
    const { K, w } = nouveauContexte(null);
    t("sans extension : itinéraire non publié, pas de bouton (aPrise faux)",
      K.itinerairePublie() === false && K.aPrise("itineraire") === false);
    t("sans extension : basculer ne publie rien (→ false)", (await K.basculerItineraire()) === false);
    t("sans carte : aucun itinéraire lu", K.itineraireActuel() === null);
    w.map = {};
    w.getRoads = () => [{ type: "galerie", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }];
    t("pas d'itinéraire actif → null", K.itineraireActuel() === null);
    w.getRoads = () => [{ type: "itinerary", points: [{ x: 1, y: 2, level: -1 }, { x: 3, y: 4 }],
      waypoints: [{ x: 1, y: 2, source: "tracker" }, { x: 3, y: 4, done: true }] }];
    const it = K.itineraireActuel();
    t("itinéraire actif → points + niveau, étapes sans l'origine tracker",
      it && it.points.length === 2 && it.points[0][2] === -1 && it.points[1][2] === null &&
      it.etapes.length === 1 && it.etapes[0][2] === true);
    t("affichage sans module de rendu → 0, sans erreur", K.afficherItineraires([{ id: "a", pseudo: "b", points: [[1, 2], [3, 4]] }]) === 0);
    let pub = false;
    K.register({ nom: "i1", apiVersion: 1, itineraire: { publie: () => pub, basculer: () => { pub = !pub; } } });
    t("extension déclarée : bouton proposé, bascule effective",
      K.aPrise("itineraire") && (await K.basculerItineraire()) === true && K.itinerairePublie());
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "i2", apiVersion: 1, itineraire: { publie: () => { throw new Error("x"); }, basculer: () => Promise.reject(new Error("y")) } });
    t("🩸 extension en erreur → non publié, aucune exception",
      K2.itinerairePublie() === false && (await K2.basculerItineraire()) === false);
    const { K: K3, w: w3 } = nouveauContexte(null);
    t("itinéraire reçu sans carte → false", K3.appliquerItineraire({ points: [[0, 0], [1, 1]] }) === false);
    let pose = null;
    w3.map = {}; w3.itineraireActiverRoad = (r) => { pose = r; };
    t("🩸 itinéraire reçu invalide (un seul point) → false, rien de posé", K3.appliquerItineraire({ points: [[0, 0], ["x", 1]] }) === false && pose === null);
    t("itinéraire reçu valide → posé (points + niveau, départ en tête des étapes)",
      K3.appliquerItineraire({ points: [[0, 0, -1], [5, 5, -1]], etapes: [[5, 5, false]] }) === true &&
      pose && pose.type === "itinerary" && pose.points[0].level === -1 && pose.waypoints.length === 2);
    t("bouton 🧭 de la fenêtre Itinéraire : seulement si une extension a la prise « itineraire »",
      /X\.aPrise\("itineraire"\)/.test(lire("js/interfaceItineraire.js")));
  }

  // ── 6 ter. CHANGEMENTS REÇUS (synchro entrante) ──────
  {
    const { K, w } = nouveauContexte(null);
    t("sans plan ouvert : rien n'est appliqué (null)", K.appliquerChangements({ editorPoints: [] }) === null);
    const MA = lire("js/main.js");
    const iRestaure = MA.indexOf("window.SessionPersist.onPlanLoaded("), iPret = MA.indexOf("window.KtaExtensions.planCharge(");
    t("🩸 main.js déclare le plan prêt APRÈS la restauration de session (sinon un lot reçu est écrasé)",
      iRestaure > 0 && iPret > iRestaure && MA.indexOf("initEditor();") < iRestaure);
    t("plan pas encore prêt : rien n'est appliqué (null, lot à redemander)", K.appliquerChangements({ editorPoints: [] }) === null);
    K.planCharge();
    // Vrai moteur de fusion (ktaUid.js) + un plan ouvert simulé
    const vm2 = require("vm");
    const ctx = vm2.createContext(w);
    vm2.runInContext(lire("js/ktaUid.js"), ctx, { filename: "ktaUid.js" });
    let pts = [{ uid: "pt_aaaa1111", name: "Local", updatedAt: 100 }, { uid: "pt_bbbb2222", name: "Vieux", updatedAt: 100 }];
    let routes = [{ uid: "rd_cccc3333", type: "chemin", points: [], updatedAt: 100 }, { type: "itinerary", points: [1, 2] }];
    let sauve = 0;
    w.getEditorPoints = () => pts; w.setEditorPoints = (p) => { pts = p; };
    w.getRoads = () => routes; w.setRoads = (r) => { routes = r; };
    w.getZones = () => []; w.setZones = () => {}; w.getStructures = () => []; w.setStructures = () => {};
    w.SessionPersist = { save: () => { sauve++; } };
    const recu = { editorPoints: [{ uid: "pt_aaaa1111", name: "Distant plus récent", updatedAt: 200 }, { uid: "pt_dddd4444", name: "Nouveau", updatedAt: 150 }],
                   roads: [{ uid: "rd_cccc3333", type: "chemin", points: [], updatedAt: 50 }],
                   tombstones: [{ uid: "pt_bbbb2222", deletedAt: 300 }] };
    const res = K.appliquerChangements(recu);
    const parUid = Object.fromEntries(pts.map((p) => [p.uid, p.name]));
    t("le plus récent gagne (objet distant plus récent)", parUid.pt_aaaa1111 === "Distant plus récent");
    t("un objet nouveau arrive", parUid.pt_dddd4444 === "Nouveau");
    t("🩸 une trace de suppression distante retire l'objet", !("pt_bbbb2222" in parUid));
    t("…et elle est gardée localement (il ne ressuscitera pas)", w.KtaUid.getTombstones().some((x) => x.uid === "pt_bbbb2222"));
    t("une version distante plus ancienne ne remplace pas la locale", routes.find((r) => r.uid === "rd_cccc3333").updatedAt === 100);
    t("🩸 l'itinéraire en cours n'est jamais touché", routes.some((r) => r.type === "itinerary" && r.points.length === 2));
    t("la session est sauvegardée", sauve === 1 && res && typeof res.fusionnes === "number");
    recu.editorPoints[0].name = "modifié après coup";
    t("les objets reçus sont copiés (rien de partagé avec l'appelant)", pts.find((p) => p.uid === "pt_aaaa1111").name === "Distant plus récent");
  }

  // ── 6 ter bis. L'ÉCHO DE SES PROPRES ENVOIS NE VIDE PAS CTRL+Z ──────
  {
    const { K, w } = nouveauContexte(null); K.planCharge();
    const vm3 = require("vm");
    vm3.runInContext(lire("js/ktaUid.js"), vm3.createContext(w), { filename: "ktaUid.js" });
    let pts = [{ uid: "pt_eeee5555", name: "Le mien", updatedAt: 500 }];
    let resets = 0, ecritures = 0;
    w.getEditorPoints = () => pts; w.setEditorPoints = (p) => { pts = p; ecritures++; };
    w.getRoads = () => []; w.setRoads = () => {}; w.getZones = () => []; w.setZones = () => {};
    w.getStructures = () => []; w.setStructures = () => {};
    w.SessionPersist = { save() {} };
    w.HistoryManager = { reset() { resets++; }, canUndo: () => true, canRedo: () => false };
    K.appliquerChangements({ editorPoints: [{ uid: "pt_eeee5555", name: "Le mien", updatedAt: 500 }], roads: [], zones: [], structures: [], tombstones: [] });
    t("⏪ écho de son propre envoi (même uid, même date) → historique d'annulation gardé, rien de réécrit",
      resets === 0 && ecritures === 0);
    K.appliquerChangements({ editorPoints: [{ uid: "pt_ffff6666", name: "D'un autre", updatedAt: 600 }], roads: [], zones: [], structures: [], tombstones: [] });
    t("⏪ un vrai objet reçu (d'un autre) → l'historique repart de zéro, comme avant", resets === 1 && ecritures === 1);
  }

  // ── 6 ter ter. CALQUE OUVERT À LA MODIFICATION AILLEURS (copies marquées reçues) ──────
  {
    const { K, w } = nouveauContexte(null); K.planCharge();
    const vm4 = require("vm");
    vm4.runInContext(lire("js/ktaUid.js"), vm4.createContext(w), { filename: "ktaUid.js" });
    let pts = [{ uid: "pt_loc11111", name: "Ici", updatedAt: 100 }];
    let roads = [];
    let recalages = 0;
    w.getEditorPoints = () => pts; w.setEditorPoints = (p) => { pts = p; };
    w.getRoads = () => roads; w.setRoads = (r) => { roads = r; }; w.getZones = () => []; w.setZones = () => {};
    w.getStructures = () => []; w.setStructures = () => {};
    w.SessionPersist = { save() {} };
    w.CalqueSession = { CLE_SOURCE: "_srcCalque", resynchroniser() { recalages++; return {}; } };
    K.appliquerChangements({ editorPoints: [{ uid: "pt_aut22222", name: "Point d'un autre", updatedAt: 200 }], tombstones: [] });
    t("objet reçu sans marque de calque → pas de recalage des calques", recalages === 0);
    K.appliquerChangements({ roads: [{ uid: "rd_cop33333", type: "chemin", points: [], updatedAt: 300, _srcCalque: "c1" }], tombstones: [] });
    t("🩸 copie de calque reçue → recalage (calque d'origine masqué, Exporter/Restituer, plus de « rapatrier »)",
      recalages === 1 && roads.some((r) => r._srcCalque === "c1"));
    K.appliquerChangements({ roads: [{ uid: "rd_cop33333", type: "chemin", points: [], updatedAt: 300, _srcCalque: "c1" }], tombstones: [] });
    t("écho de la même copie (rien de nouveau) → pas de recalage, ni journal ni sauvegarde", recalages === 1);
    K.appliquerChangements({ tombstones: [{ uid: "rd_cop33333", deletedAt: 400 }] });
    t("🩸 copie d'ici supprimée par la synchro → recalage (calque libéré s'il n'a plus de copie)",
      recalages === 2 && roads.length === 0);
    K.appliquerChangements({ editorPoints: [], tombstones: [] });
    t("tour vide → pas de recalage", recalages === 2);
    delete w.CalqueSession;
    t("sans module de calques : réception normale, aucune erreur",
      !!K.appliquerChangements({ roads: [{ uid: "rd_cop44444", type: "chemin", points: [], updatedAt: 500, _srcCalque: "c1" }], tombstones: [] }));
  }

  // ── 6 ter quater. RESTITUTION D'UN CALQUE PARTAGÉE (vrai calqueSession.js) ──────
  // Une restitution n'est JAMAIS une trace de suppression : elle retire chez les autres les copies marquées du
  // calque datées au plus tard de T, et rien d'autre (un objet du calque ne porte pas la marque).
  {
    const { K, w } = nouveauContexte(null); K.planCharge();
    const vm5 = require("vm");
    const ctx5 = vm5.createContext(w);
    vm5.runInContext(lire("js/ktaUid.js"), ctx5, { filename: "ktaUid.js" });
    let pts = [{ uid: "pt_mien1111", name: "Mon point", updatedAt: 100 }];
    let roads = [];
    w.getEditorPoints = () => pts; w.setEditorPoints = (p) => { pts = p; };
    w.getRoads = () => roads; w.setRoads = (r) => { roads = r; }; w.getZones = () => []; w.setZones = () => {};
    w.getStructures = () => []; w.setStructures = () => {};
    w.SessionPersist = { save() {} };
    w.PLAN_CONFIG = { dataLayers: [{ id: "c1", file: "c1.json" }] };
    w.dataLayerGroups = { c1: { __id: "c1" } };
    const surCarte = { c1: true };
    w.map = { hasLayer: (g) => !!surCarte[g.__id], removeLayer: (g) => { surCarte[g.__id] = false; },
      addLayer: (g) => { surCarte[g.__id] = true; } };
    w.I18n = { t: (k) => k };
    vm5.runInContext(lire("js/calqueSession.js"), ctx5, { filename: "calqueSession.js" });
    const copie = (uid, maj, R) => ({ uid, type: "chemin", points: [], updatedAt: maj, _srcCalque: "c1", _srcCalqueDepuis: R });
    K.appliquerChangements({ roads: [copie("rd_cop10000", 150, 100), copie("rd_cop20000", 150, 100)], tombstones: [] });
    t("copies reçues → calque en modification, original masqué",
      w.CalqueSession.estRapatrie("c1") && surCarte.c1 === false && roads.length === 2);
    const res = K.appliquerChangements({ roads: [copie("rd_cop20000", 300, 100)], tombstones: [],
      restitutions: [{ calque: "c1", avant: 200 }] });
    t("🩸 restitution reçue : la copie datée avant T est RETIRÉE",
      !roads.some((r) => r.uid === "rd_cop10000") && res.calques.retires === 1);
    const gardee = roads.find((r) => r.uid !== "rd_cop20000");
    t("🩸 copie modifiée APRÈS T : gardée, marque retirée, uid dérivé (jamais celui du calque)",
      res.calques.gardes === 1 && !!gardee && gardee._srcCalque === undefined && gardee.updatedAt === 300 &&
      !roads.some((r) => r.uid === "rd_cop20000"));
    t("…le calque d'origine revient (plus aucune copie marquée)", !w.CalqueSession.estRapatrie("c1") && surCarte.c1 === true);
    t("🔒 la restitution ne crée AUCUNE trace de suppression", w.KtaUid.getTombstones().length === 0);
    t("mon point (sans marque) est intact", pts.length === 1 && pts[0].uid === "pt_mien1111");
    K.appliquerChangements({ roads: [copie("rd_cop10000", 150, 100)], tombstones: [] });
    t("🩸 copie périmée reçue APRÈS la restitution : retirée aussi (restitutions retenues)",
      !roads.some((r) => r.uid === "rd_cop10000") && surCarte.c1 === true);
    K.appliquerChangements({ roads: [copie("rd_cop10000", 500, 500)], tombstones: [] });
    t("nouveau rapatriement après T : la copie reste, le calque repasse en modification",
      roads.some((r) => r.uid === "rd_cop10000") && w.CalqueSession.estRapatrie("c1"));
    t("changementsDepuis : les restitutions faites ici sont exposées (aucune ici)",
      Array.isArray(K.changementsDepuis(0).restitutions) && K.changementsDepuis(0).restitutions.length === 0);
    w._currentLoadedPlanId = "ext_p1"; K.planCharge("ext_p1");
    w.PlanRegistry = { findById: (id) => (id === "ext_p1" ? { id, type: "ext", extId: "p1" } : null) };
    const rr = w.CalqueSession.restituer("c1");
    const ch = K.changementsDepuis(0).restitutions;
    t("restitution ici sur un plan d'extension → changementsDepuis la donne { calque, avant, uids }",
      rr.partagee === true && ch.length === 1 && ch[0].calque === "c1" && ch[0].avant >= 500 &&
      JSON.stringify(ch[0].uids) === JSON.stringify(["rd_cop10000"]));
    t("…et plus après son instant", K.changementsDepuis(ch[0].avant).restitutions.length === 0);
    t("🔒 restituer ne crée aucune trace", w.KtaUid.getTombstones().length === 0);
  }

  // ── 6 quater. ACTIONS DU COMPTE ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : aucune action, aucun bloc", K.actionsCompte("profil").length === 0 && K.blocActionsCompte("config", "x") === null);
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "a", apiVersion: 1, actionsCompte: (lieu) => lieu === "config"
      ? [{ libelle: "Gérer les comptes", action() {} }, { libelle: "", action() {} }, { libelle: "sans action" }, null]
      : [{ libelle: "x".repeat(99), action() {} }] });
    t("actions nettoyées (libellé vide / sans action / null écartés)", K2.actionsCompte("config").length === 1);
    t("libellé borné à 60", K2.actionsCompte("profil")[0].libelle.length === 60);
    const { K: K3 } = nouveauContexte(null);
    K3.register({ nom: "b", apiVersion: 1, actionsCompte: () => { throw new Error("x"); } });
    t("🩸 erreur de l'extension → aucune action", K3.actionsCompte("config").length === 0);
  }

  // ── 6 quinquies. DOSSIERS DE L'INSTANCE ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : dossiers inconnus (null, rien ne bouge)", (await K.dossiersExtension()) === null);
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "d", apiVersion: 1, plans: { lister: () => [], charger: () => null,
      dossiers: () => [{ id: 7, name: "  Secteur nord ", color: "#f4c542", rule: { tags: ["nord", 3] } }, { id: "x" }, null] } });
    const l = await K2.dossiersExtension();
    t("dossiers nettoyés (sans nom écartés, id en texte, règle filtrée)",
      l.length === 1 && l[0].id === "7" && l[0].name === "Secteur nord" && l[0].rule.tags.join() === "nord");
    const { K: K3 } = nouveauContexte(null);
    K3.register({ nom: "e", apiVersion: 1, plans: { lister: () => [], charger: () => null, dossiers: () => { throw new Error("x"); } } });
    t("🩸 erreur de l'extension → null (les dossiers existants ne sont pas libérés)", (await K3.dossiersExtension()) === null);
  }

  // ── 6 sexies. PHOTOS DES POINTS (prise « photos ») ──────
  {
    const { K } = nouveauContexte(null);
    t("sans extension : completerPoint → 0, completerPlan → { 0, 0 } (rien n'est appelé)",
      (await K.photosCompleterPoint("p", "pt_x")) === 0 &&
      JSON.stringify(await K.photosCompleterPlan("p")) === JSON.stringify({ ajoutees: 0, total: 0 }));
    const appels = [];
    K.register({ nom: "ph", apiVersion: 1, photos: {
      completerPoint: (p, pt) => { appels.push([p, pt]); return Promise.resolve(2); },
      completerPlan: () => Promise.resolve({ ajoutees: 3, total: 7, autre: "x" }) } });
    t("prise photos : arguments transmis, nombre rendu", (await K.photosCompleterPoint("p", "pt_x")) === 2 &&
      appels.length === 1 && appels[0][0] === "p" && appels[0][1] === "pt_x");
    t("prise photos : completerPlan nettoyé ({ ajoutees, total })",
      JSON.stringify(await K.photosCompleterPlan("p")) === JSON.stringify({ ajoutees: 3, total: 7 }));
    const { K: K2 } = nouveauContexte(null);
    K2.register({ nom: "ph2", apiVersion: 1, photos: { completerPoint: () => { throw new Error("x"); },
      completerPlan: () => Promise.reject(new Error("y")) } });
    t("🩸 extension en erreur → 0 / { 0, 0 }, aucune exception",
      (await K2.photosCompleterPoint("p", "a")) === 0 && (await K2.photosCompleterPlan("p")).ajoutees === 0);
    const { K: K3 } = nouveauContexte(null);
    K3.register({ nom: "ph3", apiVersion: 1, photos: { completerPoint: () => "beaucoup", completerPlan: () => null } });
    t("forme inattendue → 0 / { 0, 0 }", (await K3.photosCompleterPoint("p", "a")) === 0 && (await K3.photosCompleterPlan("p")).total === 0);
    const EXT = lire("js/ktaExtensions.js"), U = lire("js/utils.js"), ED = lire("js/editor.js"), PH = lire("js/photos.js");
    t("prise photos : attente bornée à 8 s, prise journalisée à la déclaration",
      /const PHOTOS_DELAI_MS = 8000;/.test(EXT) && /"outilsDev", "photos", "aide", "outilHome"(, "[a-zA-Z]+")*]/.test(EXT));

    // ── Prise « aide » : une rubrique d'extension dans l'Aide intégrée ──
    const { K: A0 } = nouveauContexte(null);
    t("aide : sans extension → null (l'aide reste celle du community)", A0.aide() === null);
    const { K: A1 } = nouveauContexte(null);
    A1.register({ nom: "a1", apiVersion: 1, aide: () => ({ titre: " 🔐 Sécurité ", sections: [
      { titre: "Clés", html: "<p onclick=\"x()\">a</p><script>alert(1)</script><a href=\"javascript:x()\">l</a>" },
      { titre: "", html: "<p>vide</p>" }, null, { titre: "Sans corps" }] }) });
    const a1 = A1.aide();
    t("aide : rubrique lue, entrées invalides écartées", a1 && a1.titre === "🔐 Sécurité" && a1.sections.length === 1 &&
      a1.sections[0].slug === "ext-0");
    t("🩸 aide : ni script, ni gestionnaire on*, ni lien javascript:", a1 && !/script|onclick|javascript:/i.test(a1.sections[0].html) &&
      /<p>a<\/p>/.test(a1.sections[0].html));
    const { K: A2 } = nouveauContexte(null);
    A2.register({ nom: "a2", apiVersion: 1, aide: () => { throw new Error("x"); } });
    const { K: A3 } = nouveauContexte(null);
    A3.register({ nom: "a3", apiVersion: 1, aide: () => ({ titre: "T", sections: "pas une liste" }) });
    t("aide : extension en erreur ou forme inattendue → null", A2.aide() === null && A3.aide() === null);
    const { K: A4 } = nouveauContexte(null);
    A4.register({ nom: "a4", apiVersion: 1, aide: () => ({ titre: "T", sections: [{ id: "cle-coffre", titre: "a", html: "" },
      { id: "Pas Bon!", titre: "b", html: "" }] }) });
    t("aide : id stable « ext-<id> » si valide, sinon le rang", A4.aide().sections.map((s) => s.slug).join() === "ext-cle-coffre,ext-1");
    t("aide : une section d'extension s'ouvre par ktaOuvrirAideSection(« ext-… »)",
      /slug\.indexOf\("ext-"\) === 0/.test(lire("js/interfaceDocs.js")));

    // ── Actions du compte en rubriques : groupe, ligne d'état, action « fin » ──
    const { K: C1 } = nouveauContexte(null);
    const f = () => {};
    C1.register({ nom: "c1", apiVersion: 1, actionsCompte: () => [
      { libelle: "Clés", action: f, groupe: "Mon compte" },
      { libelle: "Sauvegardé", type: "etat", groupe: "Données", lien: "Sauvegarder", action: f },
      { libelle: "Hors ligne", type: "etat" },
      { libelle: "Lien sans action", type: "etat", lien: "x" },
      { libelle: "Sans action" },
      { libelle: "Partir", action: f, type: "fin" }] });
    const ac = C1.actionsCompte("profil");
    t("actions du compte : groupe, état (lien seulement avec une action), fin ; entrée sans action écartée",
      ac.length === 5 && ac[0].groupe === "Mon compte" && ac[1].type === "etat" && ac[1].lien === "Sauvegarder" &&
      ac[2].action === null && !ac[3].lien && ac[3].action === null && ac[4].type === "fin");
    t("actions du compte : forme d'avant (libellé + action) inchangée",
      (() => { const { K } = nouveauContexte(null); K.register({ nom: "c2", apiVersion: 1,
        actionsCompte: () => [{ libelle: "A", action: f }] }); const a = K.actionsCompte("profil");
        return a.length === 1 && a[0].groupe === "" && a[0].type === "" && a[0].action === f; })());
    // ── Tuile d'extension dans Outils ──
    const { K: O0 } = nouveauContexte(null);
    t("outilHome : sans extension → null (aucune tuile)", O0.outilHome() === null && O0.ouvrirOutilHome() === false);
    const { K: O1 } = nouveauContexte(null);
    O1.register({ nom: "o1", apiVersion: 1, outilHome: () => ({ libelle: "  🏢 Mon organisation  " }) });
    t("outilHome : libellé lu et nettoyé", O1.outilHome() && O1.outilHome().libelle === "🏢 Mon organisation");
    const { K: O2 } = nouveauContexte(null);
    O2.register({ nom: "o2", apiVersion: 1, outilHome: () => { throw new Error("x"); } });
    const { K: O3 } = nouveauContexte(null);
    O3.register({ nom: "o3", apiVersion: 1, outilHome: () => null });
    t("outilHome : erreur ou null (non connecté) → aucune tuile", O2.outilHome() === null && O3.outilHome() === null);
    t("outilHome : forme d'origine (un objet) = une tuile dans la liste",
      O1.outilsHome().length === 1 && O1.outilsHome()[0].libelle === "🏢 Mon organisation" && !O1.outilsHome()[0].ouvrir &&
      O3.outilsHome().length === 0);
    const { K: O4 } = nouveauContexte(null);
    let ouverte = 0;
    O4.register({ nom: "o4", apiVersion: 1, outilHome: () => [{ libelle: "A" }, null, { libelle: " " },
      { libelle: "B", ouvrir: () => { ouverte++; } }, { libelle: "C", ouvrir: "pas une fonction" }, { libelle: "D" }] });
    const l4 = O4.outilsHome();
    t("outilHome : liste — entrées invalides écartées, 3 tuiles au plus, `ouvrir` gardé si c'est une fonction",
      l4.length === 3 && l4[0].libelle === "A" && l4[1].libelle === "B" && typeof l4[1].ouvrir === "function" &&
      l4[2].libelle === "C" && !l4[2].ouvrir && O4.outilHome().libelle === "A" && !("ouvrir" in O4.outilHome()));
    t("outilHome : une tuile avec `ouvrir` l'appelle au clic ; rang inconnu → false",
      O4.ouvrirOutilHome(1) === true && ouverte === 1 && O4.ouvrirOutilHome(7) === false);
    const { K: O5 } = nouveauContexte(null);
    O5.register({ nom: "o5", apiVersion: 1, outilHome: () => [{ libelle: "X", ouvrir: () => { throw new Error("x"); } }] });
    t("outilHome : `ouvrir` qui échoue → journalisé, jamais levé", O5.ouvrirOutilHome(0) === true);
    t("outilHome : le lien de « Mon profil » vise la 1re tuile du compte (sans `ouvrir`)",
      EXT.includes("tuiles.findIndex(function (o) { return !o.ouvrir; })"));
    t("outilHome : la tuile suit le compte (mktm:compte-changed) et la fenêtre montre le lieu « outils »",
      EXT.includes('addEventListener("mktm:compte-changed", _poserOutilHome)') &&
      EXT.includes('blocActionsCompte("outils", "")'));
    // ── Pastille d'extension dans l'en-tête de l'accueil ──
    const { K: P0 } = nouveauContexte(null);
    t("pastilleHome : sans extension → null (aucune pastille)", P0.pastilleHome() === null);
    const { K: P1 } = nouveauContexte(null);
    P1.register({ nom: "p1", apiVersion: 1,
      pastilleHome: () => ({ icone: " 🏢 ", titre: " Documentation pro ", url: "https://doc.example.org/pro.html" }) });
    const p1 = P1.pastilleHome();
    t("pastilleHome : icône, titre et URL https lus et nettoyés",
      !!p1 && p1.icone === "🏢" && p1.titre === "Documentation pro" && p1.url === "https://doc.example.org/pro.html");
    const refus = [
      { icone: "🏢", titre: "x", url: "http://doc.example.org/" },
      { icone: "🏢", titre: "x", url: "javascript:alert(1)" },
      { icone: "🏢", titre: "", url: "https://doc.example.org/" },
      { icone: "abcdefgh", titre: "x", url: "https://doc.example.org/" },
      { icone: "🏢", titre: "x" }
    ].every((v, k) => { const { K } = nouveauContexte(null);
      K.register({ nom: "pr" + k, apiVersion: 1, pastilleHome: () => v }); return K.pastilleHome() === null; });
    t("🔒 pastilleHome : http, javascript:, titre vide, icône trop longue ou URL absente → aucune pastille", refus);
    const { K: P2 } = nouveauContexte(null);
    P2.register({ nom: "p2", apiVersion: 1, pastilleHome: () => { throw new Error("x"); } });
    t("pastilleHome : une erreur de l'extension → aucune pastille", P2.pastilleHome() === null);
    t("pastilleHome : posée après 📖, rendue en textContent, ouverte en noopener, suit le compte",
      EXT.includes('aide.parentNode.insertBefore(b, aide.nextSibling)') && EXT.includes("b.textContent = p.icone") &&
      EXT.includes('"_blank", "noopener,noreferrer"') &&
      EXT.includes('addEventListener("mktm:compte-changed", _poserPastilleHome)'));
    // ── Prise « documentation » : un second guide dans 📖 Documentation ──
    const { K: D0 } = nouveauContexte(null);
    t("documentation : sans extension → null (guide classique direct)", D0.documentation() === null);
    const { K: D1 } = nouveauContexte(null);
    D1.register({ nom: "d1", apiVersion: 1, documentation: () => ({ titre: "  Guide B  ", fichiers: {
      fr: "ext/docs/GUIDE.md?v=1.2", en: "ext/docs/GUIDE.en.md", es: "../GUIDE.es.md", de: "https://x.org/G.md",
      it: "ext/G.html", XX: "ext/G.md" } }) });
    const d1 = D1.documentation();
    t("documentation : titre nettoyé, fichiers .md du même site gardés, le reste écarté",
      !!d1 && d1.titre === "Guide B" && JSON.stringify(d1.fichiers) ===
        JSON.stringify({ fr: "ext/docs/GUIDE.md?v=1.2", en: "ext/docs/GUIDE.en.md" }));
    const refusDoc = [
      { titre: "x", fichiers: { en: "ext/G.en.md" } },
      { titre: " ", fichiers: { fr: "ext/G.md" } },
      { titre: "x", fichiers: { fr: "//evil.org/G.md" } },
      { titre: "x", fichiers: { fr: "/ext/G.md" } },
      { titre: "x", fichiers: { fr: "ext/G.md?jeton=1" } },
      { titre: "x", fichiers: "ext/G.md" },
      null
    ].every((v, k) => { const { K } = nouveauContexte(null);
      K.register({ nom: "dr" + k, apiVersion: 1, documentation: () => v }); return K.documentation() === null; });
    t("🔒 documentation : sans fr, titre vide, autre site, chemin absolu, requête, forme inattendue ou null → rien",
      refusDoc);
    const { K: D2 } = nouveauContexte(null);
    D2.register({ nom: "d2", apiVersion: 1, documentation: () => { throw new Error("x"); } });
    t("documentation : une erreur de l'extension → null", D2.documentation() === null);
    const DOCS = lire("js/interfaceDocs.js");
    t("🩸 documentation : la fenêtre ne lit la prise que si elle existe, sinon guide classique direct (myktamap.fr)",
      DOCS.includes('K.aPrise("documentation"))') &&
      /if \(!ext\) \{ _chargerReadme\(_readmePathForLang\(lang\)/.test(DOCS));
    t("documentation : choix des deux guides, la langue changée garde le guide affiché",
      DOCS.includes('bouton("kta-readme-choix-classique"') && DOCS.includes('bouton("kta-readme-choix-extension"') &&
      DOCS.includes("guide:          modal.dataset.guide"));
    t("aide : l'Aide intégrée pose la rubrique avant « Pour aller plus loin »",
      /if \(cat\.cle === "plus-loin"\) ajouterRubriqueExtension\(\);/.test(lire("js/interfaceDocs.js")));
    t("🩸 popup et fiche d'édition n'appellent l'extension que si la prise existe (myktamap.fr : rien)",
      /K\.aPrise\("photos"\)\) \{\s*K\.photosCompleterPoint\(/.test(U) && /!K\.aPrise\("photos"\)\) return;/.test(ED));
    t("🩸 restorePhoto sans opts.source = dépôt d'une EXTENSION (source « extension » : pas de renvoi au serveur)",
      /: "extension";/.test(PH) && /_emettre\(rec\.planId, \[id\], "ajout", source\)/.test(PH));
    const purge = PH.slice(PH.indexOf("function deletePhotosForPlan("), PH.indexOf("function restorePhoto("));
    const vide = PH.slice(PH.indexOf("function clearAll("), PH.indexOf("function getStorageInfo("));
    t("🩸 purges LOCALES (plan retiré, déconnexion, réinitialisation) : AUCUN événement de suppression",
      purge.length > 0 && !/_emettre/.test(purge) && vide.length > 0 && !/_emettre/.test(vide));
    const RESTAURE = ["js/main.js", "js/interfaceImportExport.js", "js/profileExportImport.js"];
    // d'autres options peuvent suivre (`siAbsente: true` pour la fusion du réimport de session)
    t("restaurations de l'app marquées source « import » (session, plan ZIP, profil)",
      RESTAURE.every((f) => /restorePhoto\([\s\S]{0,700}?\}, \{ source: "import"(?:, \w+: \w+)* \}\)/.test(lire(f))));
  }

  // ── 6 septies. IMPORT DE SESSION SUR UN PLAN PARTAGÉ (prise importSession + vrai ktaUid.js) ──────
  {
    const { K, w } = nouveauContexte(null);
    w.PlanRegistry = { findById: (id) => (id === "ext_p1" ? { type: "ext", extId: "p1" } : { type: "local" }) };
    t("sans prise : aucun plan partagé (remplacement de l'app seule)", K.importPartage("ext_p1") === null);
    let appels = 0, rep = { remplacer: true };
    K.register({ nom: "imp", apiVersion: 1, importSession(id) { appels++; if (rep === "panne") throw new Error("x"); return id === "p1" ? rep : null; } });
    t("plan local : null, la prise n'est même pas consultée", K.importPartage("local_1") === null && appels === 0);
    t("plan partagé, remplacement permis → { remplacer: true }", K.importPartage("ext_p1").remplacer === true);
    rep = { remplacer: "oui" };
    t("🔒 remplacer non booléen → refusé (ajout seul)", K.importPartage("ext_p1").remplacer === false);
    rep = "panne";
    const e1 = K.importPartage("ext_p1");
    t("🔒 prise en erreur → plan partagé, remplacement REFUSÉ (ajout seul)", !!e1 && e1.remplacer === false);
    rep = 42;
    t("🔒 forme inattendue → ajout seul", K.importPartage("ext_p1").remplacer === false);
    rep = null;
    t("prise qui rend null → plan non partagé", K.importPartage("ext_p1") === null);

    const ctx = vm.createContext({ Date, JSON, Map, Set, Array, Object, Math, isFinite, crypto: undefined });
    ctx.window = ctx;
    vm.runInContext(lire("js/ktaUid.js"), ctx, { filename: "ktaUid.js" });
    const U = ctx.KtaUid;
    const loc = () => ({
      data: [{ uid: "pt_x", name: "X", updatedAt: 100 }, { uid: "pt_y", name: "Y", updatedAt: 100 }],
      roads: [{ uid: "rd_w", type: "galerie", points: [], updatedAt: 100 }, { type: "itinerary", points: [] }],
      zones: [], structures: [], tombstones: [{ uid: "pt_d", deletedAt: 500 }]
    });
    const fic = () => ({
      data: [{ uid: "pt_z", name: "Z", updatedAt: 50 }, { uid: "pt_x", name: "X du fichier", updatedAt: 200 },
        { uid: "pt_y", name: "Y ancien", updatedAt: 50 }, { uid: "pt_d", name: "D effacé ici", updatedAt: 400 }],
      roads: [{ type: "itinerary", points: [9] }], zones: [], structures: [], tombstones: [{ uid: "pt_q", deletedAt: 300 }]
    });
    const L1 = loc(), F1 = fic();
    const a = U.preparerImport(L1, F1, "ajouter", 9000);
    const nom = (r, u) => (r.data.find((o) => o.uid === u) || {}).name;
    t("Ajouter : rien d'existant ne disparaît (X, Y, tracé, itinéraire d'ici)", nom(a, "pt_y") === "Y" && !!nom(a, "pt_x") &&
      a.roads.length === 2 && a.roads.some((r) => r.type === "itinerary" && !r.points.length));
    t("Ajouter : nouvel objet ajouté et horodaté maintenant (sinon la synchro ne l'envoie jamais)",
      (a.data.find((o) => o.uid === "pt_z") || {}).updatedAt === 9000);
    t("Ajouter : le plus récent gagne (X du fichier), le plus ancien perd (Y d'ici gardé)",
      nom(a, "pt_x") === "X du fichier" && (a.data.find((o) => o.uid === "pt_y") || {}).updatedAt === 100);
    t("🩸 Ajouter : un objet effacé ici après sa version du fichier ne ressuscite pas", !nom(a, "pt_d"));
    t("Ajouter : traces locales inchangées, celles du fichier ignorées, aucune trace créée",
      a.tombstones.length === 1 && a.tombstones[0].uid === "pt_d" && a.supprimes === 0 && a.ajoutes === 1 && a.misAJour === 1);
    t("Ajouter : fonction pure (fichier et objets d'ici non modifiés)",
      F1.data[0].updatedAt === 50 && L1.data[0].name === "X" && L1.data.length === 2);

    const L2 = loc(), F2 = { data: [{ uid: "pt_x", name: "X", updatedAt: 100 }, { uid: "pt_z", name: "Z", updatedAt: 50 }],
      roads: [], zones: [], structures: [], tombstones: [{ uid: "pt_q", deletedAt: 300 }, { uid: "pt_x", deletedAt: 90 }] };
    const r = U.preparerImport(L2, F2, "remplacer", 9000);
    const trace = (u) => (r.tombstones.find((x) => x.uid === u) || {}).deletedAt;
    t("Remplacer : le contenu devient celui du fichier (X, Z), l'itinéraire d'ici reste",
      r.data.map((o) => o.uid).join() === "pt_x,pt_z" && r.roads.length === 1 && r.roads[0].type === "itinerary");
    t("🩸 Remplacer : chaque objet retiré (Y, tracé W) reçoit une trace datée de maintenant",
      trace("pt_y") === 9000 && trace("rd_w") === 9000 && r.supprimes === 2);
    t("Remplacer : objet identique non réhorodaté, objet nouveau horodaté",
      r.data[0].updatedAt === 100 && r.data[1].updatedAt === 9000);
    t("Remplacer : traces d'ici et du fichier gardées, sauf celle d'un objet gardé",
      trace("pt_d") === 500 && trace("pt_q") === 300 && trace("pt_x") === undefined);
    t("aucune trace pour l'itinéraire calculé", r.tombstones.every((x) => x.uid));

    const IE = lire("js/interfaceImportExport.js");
    t("câblage : la fenêtre d'import lit la prise (plan affiché) et propose les deux modes",
      /K\.importPartage\(window\._currentLoadedPlanId\)/.test(IE) && /data-kta-import-mode="' \+ val/.test(IE) &&
      /partage\.remplacer\s*\n?\s*\? _choixMode\("remplacer"/.test(IE));
    t("câblage : plan partagé → KtaUid.preparerImport, traces du fichier jamais posées telles quelles",
      /_preparerIdentitesImport\(dataParsee, !!mode\)/.test(IE) && /if \(!sansTraces\) window\.KtaUid\.setTombstones/.test(IE) &&
      /KtaUid\.preparerImport\(_etatImportLocal\(\), _etatImportFichier\(dataParsee\), mode\)/.test(IE));
    t("🔒 câblage : Remplacer relit le droit au clic et passe par ktaConfirm (nombre d'objets supprimés)",
      /const p2 = _importPartage\(\);\s*\n\s*if \(!p2 \|\| !p2\.remplacer/.test(IE) && /ktaConfirm\(_tp\("confirmRemplacer", \{ n: n \}\)/.test(IE));
    t("câblage : l'import direct (importerSessionJSON) renvoie un plan partagé vers la fenêtre",
      /if \(_importPartage\(\)\) \{ ouvrirImportSession\(file\); return; \}/.test(IE));
    const TE = lire("js/tableEditor.js");
    t("Tableur : un seul chemin (points compris) — KtaConvertir.appliquerTableau, plan partagé lu par importPartage",
      /K\.importPartage\(window\._currentLoadedPlanId\)/.test(TE) &&
      /const sim = KC\.appliquerTableau\(famille, _data, options\(\{ simuler: true \}\)\);/.test(TE) &&
      TE.indexOf("preparerImport") < 0 && TE.indexOf("_remplacerSession") < 0);
    t("🔒 Tableur « Appliquer à la session » : plan partagé, une suppression exige `remplacer` (sinon refus nommé) puis ktaConfirm",
      /if \(!partage \|\| !sim\.supprimes\) return Promise\.resolve\(appliquer\(\)\);/.test(TE) &&
      /if \(!partage\.remplacer\) \{\s*\n\s*window\.ktaAlerte\(window\.I18n\.t\("tabledit\.save\.partage\.refusObjets"/.test(TE) &&
      /window\.ktaConfirm\(window\.I18n\.t\("tabledit\.save\.partage\.confirmObjets"/.test(TE));
  }

  // ── 7. CÂBLAGE (fichiers réels) ──────
  {
    const MAIN = lire("js/main.js"), HL = lire("js/homeLoader.js"), PROF = lire("js/profileExportImport.js"),
      GEN = lire("js/createConf.js"), SW = lire("sw.js");
    const iMods = MAIN.indexOf("await window.KtaExtensions.chargerModules();");
    const iGate = MAIN.indexOf("if (!_gateDelegueeOk && window.UnlockGate && !window.UnlockGate.isUnlocked())");
    const iLic = MAIN.indexOf('if (_scBoot && _scBoot.state === "on" && window.MyKTAMapProLicense');
    t("boot : licence attendue → modules chargés → gate (ordre)", iLic > 0 && iMods > iLic && iGate > iMods);
    t("boot : une gate déléguée franchie remplace la gate community", /try \{ await _gate; _gateDelegueeOk = true;/.test(MAIN));
    t("🩸 boot : gate déléguée en échec → « Installation indisponible », JAMAIS la gate community",
      /catch \(e\) \{[\s\S]{0,400}await _ktaInstanceIndisponible\(_motifBlocage\(\)\);/.test(MAIN) &&
      /function _ktaInstanceIndisponible\(motif\) \{\s*return new Promise\(function\(\) \{/.test(MAIN));
    // 🔒 Installation sans licence valide : fermée AVANT les modules et la gate community (sinon l'app
    // s'ouvre en community sur les données du dernier utilisateur).
    const iBloc = MAIN.indexOf('if (_motifBlocage() === "licence") {');
    t("🩸 boot : licence pro absente/expirée/refusée → « Installation indisponible », AVANT modules et gate community",
      iBloc > iLic && iBloc < iMods && iBloc < iGate &&
      /if \(_motifBlocage\(\) === "licence"\) \{[\s\S]{0,300}await _ktaInstanceIndisponible\("licence"\);/.test(MAIN));
    const KE = lire("js/ktaExtensions.js"), CSS = lire("css/style.css");
    t("🩸 installation reliée (licence valide ou non) : jamais le splash ni le pied de page community",
      /classList\.toggle\("kta-instance-reliee", !!_connexion && _connexion\.etat !== "off"\)/.test(KE) &&
      /html\.kta-instance-reliee #splashLicense \.kta-licence-community \{ display: none; \}/.test(CSS) &&
      /html\.kta-instance-reliee span\.kta-licence-community \{/.test(CSS));
    const PL = lire("js/proLicense.js");
    t("🩸 licence en cache EXPIRÉE ignorée et purgée (hors ligne aussi)",
      /data\.valid_until < new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\)[\s\S]{0,80}localStorage\.removeItem\(key\)[\s\S]{0,160}return null;/.test(PL));
    t("🩸 boot : module de connexion non chargé → « Installation indisponible »",
      /else if \(_mods && _mods\.demandes > 0 && _mods\.echecs > 0\) \{[\s\S]{0,200}await _ktaInstanceIndisponible\(\);/.test(MAIN));
    t("import : le goulot du kiosque consulte la prise (import simple, multiple, profil)",
      /window\.KtaExtensions\.importAutorise === "function" &&\s*!window\.KtaExtensions\.importAutorise\(\)\) return true;/.test(MAIN));
    t("export de profil : les archives de plans passent par la prise", /window\.KtaExtensions\.exportAutorise\(p\.id\)/.test(PROF));
    t("plans d'extension : inscrits en type « ext » après la découverte serveur", /_decouvrirPlansExtension\(\)/.test(MAIN) && /type: "ext", extId:/.test(MAIN));
    // Gardé selon « Mémoriser le plan dans l'app » ; une copie déjà gardée est toujours mise à jour
    // (sinon l'ancienne passerait pour la courante).
    t("plans d'extension : ouverts via la prise, gardés selon le réglage (copie existante toujours à jour), type conservé",
      /if \(plan\.type === "ext"\) \{/.test(HL) &&
      /typeRegistre: "ext", zipFile: fichier,\s*storeBlob: !!plan\.storedBlob \|\| window\.ktaMemoriserPlanActif\(\)/.test(HL) &&
      /const _estExt = meta\.typeRegistre === "ext";/.test(MAIN) &&
      /type: _estExt \? "ext" : \(_estZipSrv \? "server" : "local"\)/.test(MAIN));
    t("plans d'extension : à l'ouverture, nom et version de l'installation gardés (pas ceux du ZIP)",
      /name: \(_existant && _existant\.name\) \? _existant\.name : planName/.test(MAIN));
    {
      const EXT = lire("js/ktaExtensions.js");
      t("multi-comptes : seules les familles touchées sont réécrites, dessin en cours repris par uid",
        /if \(touches\.roads && window\.setRoads\)/.test(EXT) && /reprendre\("setCurrentRoadByIndex"/.test(EXT));
      t("🩸 multi-comptes : l'historique d'annulation repart de zéro après une réception", /window\.HistoryManager\.reset\(\)/.test(EXT));
      t("lecture seule : prise lectureSeule, erreur = lecture seule, plan local jamais",
        /function lectureSeule\(registreId\)/.test(EXT) && /lecture seule :", e\); return true;/.test(EXT));
      // Le verrou de l'installation ne garde que la SESSION (KMZ, GPX, image, PDF, Secours, ZIP passent) ;
      // son message est important, donc jamais tu en mode « Essentielles ».
      t("export : le goulot ktaExportPlanRefuse garde la session (complet, avancé, conversion) et rien d'autre",
        /if \(tab === "full" \|\| tab === "advanced" \|\| tab === "conversion"\) \{\r?\n\s*if \(typeof window\.ktaExportPlanRefuse/.test(lire("js/sessionExporter.js")) &&
        !/ktaExportPlanRefuse/.test(lire("js/exporter.js")) && !/ktaExportPlanRefuse/.test(lire("js/pdfExport.js")) &&
        !/ktaExportPlanRefuse/.test(lire("js/secoursMode.js")));
      t("export : le refus se dit toujours (toast important, jamais tu par le réglage des notifications)",
        /showToast\(_t\("ext\.export\.refuse"\), "warn", \{ important: true \}\)/.test(EXT));
      const MAINT = lire("js/interfaceMaintenance.js");
      t("🩸 Tout réinitialiser : la session d'une installation est fermée AVANT l'effacement (prise bornée à 3 s)",
        MAINT.indexOf("avantReinitialisation()") > 0 && MAINT.indexOf("avantReinitialisation()") < MAINT.indexOf("localStorage.clear()") &&
        /r\(false\); \}, 3000\)/.test(EXT));
      t("Tout réinitialiser hors ligne : seule la marque « déconnexion en attente » survit à l'effacement",
        MAINT.indexOf("CLE_DECONNEXION_EN_ATTENTE") > MAINT.indexOf("localStorage.clear()"));
      t("session effacée / restaurée : événement mktm:session-cleared",
        /mktm:session-cleared/.test(lire("js/sessionPersist.js")) && /mktm:session-cleared/.test(lire("js/sessionBackups.js")));
    }
    {
      const SEC = lire("js/secoursMode.js");
      const del = SEC.slice(SEC.indexOf("function deleteScenario("), SEC.indexOf("function deleteScenario(") + 1200);
      t("Mode Secours : une suppression voulue émet mktm:secours-scenario-deleted (persistance d'une installation)",
        /mktm:secours-scenario-deleted/.test(del));
      const fifo = SEC.slice(SEC.indexOf("function _saveScenarios("), SEC.indexOf("function _saveScenarios(") + 1500);
      t("🩸 Mode Secours : la purge FIFO (limite locale) n'émet PAS de suppression", !/secours-scenario-deleted/.test(fifo));
    }
    t("Générateur : « Publier » seulement si une extension sait publier",
      /const peutNouveau = !!\(X && X\.aPrise\("publierPlan"\)\);/.test(GEN) &&
      /if \(X && \(peutNouveau \|\| X\.aPrise\("publierVersion"\)\) && typeof window\.ktaConfirm === "function"\)/.test(GEN));
    // 🩸 Un ZIP d'un plan de l'extension rouvert dans le Générateur devenait un SECOND plan (publierPlan) : il doit
    // devenir une nouvelle version, sous la permission de la prise ; une copie = choix explicite « nouveau » seulement.
    t("🩸 Générateur : ZIP reconnu d'un plan d'extension → publierVersion sous versionAutorisee, jamais publierPlan d'office",
      /const cible = await _planExtensionDuZip\(\);/.test(GEN) &&
      /if \(X\.versionAutorisee\(cible\.id\)\) \{[\s\S]{0,400}X\.publierVersion\(\{ planId: cible\.id, blob: blob, nom: name \}\)/.test(GEN) &&
      (GEN.match(/X\.publierPlan\(/g) || []).length === 1 &&
      /if \(choix === "nouveau"\) \{\s*await envoyer\(function\(\) \{ return X\.publierPlan\(/.test(GEN));
    t("Générateur : ZIP non reconnu ou homonymes → « Mettre à jour quel plan ☁️ ? » parmi les plans à gérer, avant tout plan neuf",
      /const aGerer = _plannerMode === "modifier" \? _plansExtAGerer\(X\) : \[\];/.test(GEN) &&
      /e\.type === "ext" && X\.versionAutorisee\(e\.id\)/.test(GEN) &&
      /X\.publierVersion\(\{ planId: idChoisi, blob: blob, nom: name \}\)/.test(GEN) &&
      /\} else if \(idChoisi === "" && peutNouveau\) \{\s*choix = "nouveau";/.test(GEN));
    t("🩸 Générateur : plusieurs homonymes → rien de présélectionné, validation inactive jusqu'au choix",
      /let valeur = ambigu \? null :/.test(GEN) && /if \(ambigu\) \{\s*liste\.selectedIndex = 0;\s*ok\.disabled = true;/.test(GEN) &&
      /return \(r && valeur !== null\) \? valeur : null;/.test(GEN));
    t("Générateur : plan d'extension reconnu à l'empreinte de l'archive gardée, sinon à un nom unique",
      /async function _planExtensionDuZip\(\) \{/.test(GEN) &&
      /e\.type === "ext"/.test(GEN) && /memes\.length === 1 \?/.test(GEN));
    t("🩸 Service Worker : une requête d'extension (X-Kta-Ext) ou authentifiée (Authorization) n'est jamais interceptée ni cachée",
      /if \(h && \(h\.get\("X-Kta-Ext"\) \|\| h\.get\("Authorization"\)\)\) return;/.test(SW) &&
      SW.indexOf('h.get("X-Kta-Ext")') < SW.indexOf("event.respondWith("));
    t("Service Worker : les caches myktamap-ext- survivent à l'activation", /const EXT_CACHE_PREFIX = "myktamap-ext-";/.test(SW) && /!_estCacheExt\(key\)/.test(SW));
    const MN = lire("js/main.js");
    t("🩸 accueil : dossiers de l'extension appliqués AVEC ceux de l'index (jamais à leur place)",
      /dossiersExtension\(\)/.test(MN) && /applyIndexFolders\(deIndex\.concat\(/.test(MN));
    const HP = lire("js/homeProfile.js");
    t("carte profil : lit KtaExtensions.compte, se redessine sur mktm:compte-changed",
      /KtaExtensions\.compte\(\)/.test(HP) && /addEventListener\("mktm:compte-changed"/.test(HP));
    t("🩸 carte profil : le compte n'est JAMAIS écrit dans le profil local", !/setSurnom\([^)]*_compte/.test(HP));
    t("modale profil : pseudo verrouillé quand un compte est connecté", /surnomInput\.readOnly = true/.test(HP));
    t("modale profil : actions du compte après la photo, avant le grade", /blocActionsCompte\("profil"/.test(HP) && /insertBefore\(blocCompte, grade\)/.test(HP));
    t("panneau Configuration : bloc « Installation » en tête", /blocActionsCompte\("config"/.test(lire("js/homeConfig.js")));
    const assets = (SW.match(/const ASSETS_TO_CACHE = \[[\s\S]*?\];/) || [""])[0];
    t("🩸 aucun module greffé (pro/) précaché par community", assets.length > 0 && !/["']\.?\/?pro\//.test(assets));
  }

  // ── 8. SERVICE WORKER : PAGES DES DOSSIERS DE MODULES EN RÉSEAU D'ABORD (vrai sw.js) ──────
  // Faux caches, faux réseau ; chaque bac = un SW qui démarre sans mémoire.
  {
    const SCOPE = "https://inst.test/";
    const SWSRC = lire("sw.js");
    const NOM_CACHE = SWSRC.match(/const CACHE_NAME = "([^"]+)"/)[1];
    const rep = (corps, status) => ({ corps, status: status || 200, ok: (status || 200) < 300, type: "basic",
      clone() { return rep(corps, status); }, text() { return Promise.resolve(corps); } });
    const bac = (modules) => {
      const magasins = {}, appels = [];
      const b = { reseau: () => Promise.reject(new Error("hors ligne")), appels, magasins };
      const abs = (r) => new URL(typeof r === "string" ? r : r.url, SCOPE).href;
      const magasin = (nom) => {
        const m = magasins[nom] = magasins[nom] || new Map();
        return {
          match(r, o) {
            const u = abs(r);
            if (o && o.ignoreSearch) {
              for (const [k, v] of m) if (k.split("?")[0] === u.split("?")[0]) return Promise.resolve(v);
            }
            return Promise.resolve(m.get(u));
          },
          put(r, x) { m.set(abs(r), x); return Promise.resolve(); },
          keys() { return Promise.resolve([...m.keys()].map((url) => ({ url }))); },
          delete(r) { return Promise.resolve(m.delete(r.url)); },
        };
      };
      const ecoutes = {};
      function Response(corps, init) { return rep(corps, init && init.status); }
      const ctx = vm.createContext({
        self: { registration: { scope: SCOPE }, location: { origin: "https://inst.test" },
          addEventListener(type, f) { ecoutes[type] = f; } },
        caches: { open: (n) => Promise.resolve(magasin(n)), has: (n) => Promise.resolve(n in magasins),
          keys: () => Promise.resolve(Object.keys(magasins)) },
        fetch: (r) => { appels.push(abs(r)); return b.reseau(abs(r)); },
        Response, URL, Set, Map, Promise, Error, Date, console: { log() {}, warn() {}, error() {} },
        // Délais du SW raccourcis ; l'éviction (30 s) n'est pas jouée.
        setTimeout: (f, ms) => (ms >= 10000 ? 0 : setTimeout(f, Math.min(ms, 20))), clearTimeout,
      });
      vm.runInContext(SWSRC, ctx, { filename: "sw.js" });
      b.principal = magasin(NOM_CACHE);
      b.principal.put(SCOPE + "data/index.json", rep(JSON.stringify({ config: { serverConnection: { state: "on", modules } } })));
      b.demander = (url, destination) => {
        let p = null;
        ecoutes.fetch({ request: { method: "GET", url: SCOPE + url, destination: destination || "", headers: { get: () => null } },
          respondWith(x) { p = Promise.resolve(x); } });
        return p ? p.then((r) => r && r.corps) : Promise.resolve("(non intercepté)");
      };
      return b;
    };
    const avec = bac(["ext/lang/fr.js?v=1", "ext/mod.js?v=2"]);
    let version = "page v1";
    avec.reseau = (u) => Promise.resolve(rep(version + " " + u));
    t("SW réveillé sans mémoire : la page d'un dossier de module vient du réseau",
      /^page v1 /.test(await avec.demander("ext/compte.html", "document")));
    version = "page v2";
    t("🩸 page modifiée sur le serveur : vue à jour au chargement suivant (plus de copie figée)",
      /^page v2 /.test(await avec.demander("ext/compte.html", "document")));
    t("feuille de style d'un sous-dossier de module : réseau d'abord", /^page v2 /.test(await avec.demander("ext/lang/x.css", "style")));
    avec.principal.put(SCOPE + "ext/docs/G.md", rep("copie figée"));
    t("🩸 guide Markdown (.md) d'un dossier de module : réseau d'abord, jamais une copie figée",
      /^page v2 /.test(await avec.demander("ext/docs/G.md")));
    avec.reseau = () => Promise.reject(new Error("hors ligne"));
    t("hors ligne : la dernière copie est servie",
      /^page v2 .*ext\/compte\.html$/.test(await avec.demander("ext/compte.html", "document")));
    avec.reseau = () => new Promise(() => {});
    t("réseau muet : la copie est servie après le délai", /^page v2 /.test(await avec.demander("ext/compte.html", "document")));
    avec.reseau = () => Promise.resolve(rep("erreur", 503));
    t("serveur en erreur (5xx) : la copie est servie", /^page v2 /.test(await avec.demander("ext/compte.html", "document")));
    avec.reseau = () => Promise.resolve(rep("absente", 404));
    t("réponse du serveur (404) : transmise telle quelle, jamais la copie", (await avec.demander("ext/compte.html", "document")) === "absente");
    avec.reseau = () => Promise.resolve(rep("invitation"));
    await avec.demander("ext/invitation.html?jeton=secret", "document");
    await new Promise((r) => setTimeout(r, 30));
    const clesPages = [...(avec.magasins["myktamap-ext-pages"] || new Map()).keys()];
    t("🔒 copie d'une page gardée SANS sa requête (un jeton ne reste pas sur l'appareil)",
      clesPages.length >= 3 && clesPages.every((k) => k.indexOf("?") < 0));
    avec.appels.length = 0;
    avec.reseau = () => Promise.reject(new Error("hors ligne"));
    avec.principal.put(SCOPE + "index.html", rep("app"));
    avec.principal.put(SCOPE + "css/style.css", rep("css app"));
    avec.principal.put(SCOPE + "ext/mod.js?v=2", rep("module"));
    t("🩸 démarrage de l'app : index.html, css/ et les modules (?v=) restent en cache d'abord, sans réseau",
      (await avec.demander("index.html", "document")) === "app" && (await avec.demander("css/style.css", "style")) === "css app" &&
      (await avec.demander("ext/mod.js?v=2", "script")) === "module" && avec.appels.length === 0);

    const sans = bac([]);
    sans.principal.put(SCOPE + "ext/compte.html", rep("copie"));
    sans.reseau = () => Promise.resolve(rep("neuf"));
    t("sans module déclaré : rien ne change (cache d'abord, aucun cache de pages créé)",
      (await sans.demander("ext/compte.html", "document")) === "copie" && !("myktamap-ext-pages" in sans.magasins));
    sans.reseau = (u) => Promise.resolve(rep(/index\.json/.test(u)
      ? JSON.stringify({ config: { serverConnection: { state: "on", modules: ["ext/mod.js?v=1"] } } }) : "neuf"));
    await sans.demander("data/index.json");
    await new Promise((r) => setTimeout(r, 30));
    t("index relu en ligne qui déclare un module : ses pages passent en réseau d'abord sans attendre un réveil",
      (await sans.demander("ext/compte.html", "document")) === "neuf");
    const racine = bac(["mod.js?v=1"]);
    racine.principal.put(SCOPE + "page.html", rep("copie"));
    racine.principal.put(SCOPE + "css/style.css", rep("css app"));
    t("🩸 module posé à la racine : l'app elle-même ne passe pas en réseau d'abord",
      (await racine.demander("page.html", "document")) === "copie" &&
      (await racine.demander("css/style.css", "style")) === "css app" && racine.appels.length === 0);
  }

  console.log("");
  if (ko) { console.log("⚠️ " + ko + " echec(s)"); process.exit(1); }
  console.log("🎉 points d'extension : neutres sans extension, fermés quand une permission échoue, jamais de repli sur la gate community");
})();
