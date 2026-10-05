#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🧩 check-extensions.js — garde-fou pré-commit BLOQUANT (v2.7.0, chantier 3)
// =====================================================================
// Les points d'extension (js/ktaExtensions.js) laissent un module greffé
// remplacer la gate d'entrée, fournir des plans, refuser un import ou un
// export, publier un plan, parler à un backend. Contrat :
// docs/architecture/community-server-line.md §3. Ce qui ne doit JAMAIS arriver :
//   1. Une prise de PERMISSION (gate, import, export) qui échoue et LAISSE
//      PASSER : une extension en panne ouvrirait ce qu'elle devait fermer.
//   2. Une gate déléguée en échec qui retombe sur la gate community : le code
//      communautaire, diffusé largement, ouvrirait une instance privée.
//   3. Une requête qui part hors des états permis, ou vers une autre origine
//      que celle déclarée : le garde est au goulot ou il n'est rien.
//   4. Un module chargé sur myktamap.fr (instance OFF) : règle E.
//   5. Une prise sans extension qui change quoi que ce soit (no-op).
//   6. Des caches de modules vidés à chaque release community, ou un module
//      greffé précaché par community.
//
// COMMENT : le vrai module tourne dans un `vm` (faux localStorage, faux fetch
// qui COMPTE ses appels) ; le câblage est vérifié sur les fichiers réels.
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
    addEventListener() {}, dispatchEvent() { return true; },
    fetch: (url, init) => { appelsFetch.push(url); appelsFetch.dernierInit = init; return Promise.resolve({ ok: true, url: url }); },
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
  // ═════════ 1. DÉCLARATION ═════════
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

  // ═════════ 2. SANS EXTENSION : RIEN NE CHANGE ═════════
  {
    const { K } = nouveauContexte(null);
    t("sans extension : import autorisé, export autorisé (aucune prise ne ferme rien)", K.importAutorise() === true && K.exportAutorise("p") === true);
    t("sans extension : pas de gate déléguée", K.gateDeleguee() === null);
    t("sans extension : aucun plan d'extension", (await K.listerPlansExtension()).length === 0);
  }

  // ═════════ 3. PERMISSIONS : UNE ERREUR = REFUS ═════════
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

  // ═════════ 4. GARDE DES REQUÊTES ═════════
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

    const off2 = nouveauContexte("server");
    off2.K.appliquerConfig({}, true);
    off2.K.signaler("on");
    t("🩸 un signal ne rallume JAMAIS une instance OFF", off2.K.etat().etat === "off");
  }

  // ═════════ 4 bis. API « MÊME SITE » (/api/) ═════════
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

  // ═════════ 5. CHARGEUR DE MODULES (règle E) ═════════
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

  // ═════════ 6. JOURNAL, EFFACEMENT, SECOURS ═════════
  {
    const c = nouveauContexte(null);
    c.w.getEditorPoints = () => [{ uid: "pt_a", updatedAt: 100 }, { uid: "pt_b", updatedAt: 300 }];
    c.w.getRoads = () => [{ uid: "rd_a", updatedAt: 400, type: "principal" }, { uid: "rd_i", updatedAt: 500, type: "itinerary" }];
    c.w.getZones = () => []; c.w.getStructures = () => [];
    c.w.KtaUid = { getTombstones: () => [{ uid: "zn_x", deletedAt: 250 }, { uid: "zn_y", deletedAt: 50 }] };
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

  // ═════════ 6 bis. COMPTE CONNECTÉ ═════════
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

  // ═════════ 6 bis ter. RANGEMENT DIFFUSÉ + HORS LIGNE D'UN PLAN ☁️ ═════════
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

  // ═════════ 6 bis quinquies. ACTIONS SUR LA FICHE D'UN OBJET ═════════
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
      /\.slice\(0, 8\)/.test(lire("js/ktaExtensions.js")) && /kta-plan-row-ext-badge" title="' \+ escapeHtml\(bx\.titre\) \+ '">' \+ escapeHtml\(bx\.texte\)/.test(lire("js/homeLoader.js")));
    t("info d'objet : texte seulement (textContent), 120 caractères, jamais écrite par l'app",
      /ligne\.textContent = info;/.test(lire("js/ktaExtensions.js")) && /\.slice\(0, 120\)/.test(lire("js/ktaExtensions.js")));
  }

  // ═════════ 6 bis sexies. PUBLIER UN PLAN LOCAL DEPUIS SA FICHE ═════════
  {
    const HLp = lire("js/homeLoader.js");
    t("fiche ℹ️ : « Publier sur l'installation » seulement pour un plan local ET si une extension sait publier",
      /plan\.type !== "ext" && plan\.type !== "server" && window\.KtaExtensions &&[\s\S]{0,120}aPrise\("publierPlan"\)/.test(HLp));
    t("…l'envoi passe par la prise (archive gardée, sinon fichier choisi)",
      /window\.KtaExtensions\.publierPlan\(\{ blob: blob/.test(HLp) && /input\.accept = "\.zip,application\/zip"/.test(HLp));
  }

  // ═════════ 6 bis quater. PLAN PUBLIÉ : LA LISTE EST RELUE ═════════
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

  // ═════════ 6 bis bis. PRÉSENCE (tracking à plusieurs, opt-in) ═════════
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
  }

  // ═════════ 6 ter. ITINÉRAIRE PUBLIÉ (montré à l'équipe, opt-in) ═════════
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
    t("bouton 🧭 de la fenêtre Itinéraire : seulement si une extension a la prise « itineraire »",
      /X\.aPrise\("itineraire"\)/.test(lire("js/interfaceItineraire.js")));
  }

  // ═════════ 6 ter. CHANGEMENTS REÇUS (synchro entrante) ═════════
  {
    const { K, w } = nouveauContexte(null);
    t("sans plan ouvert : rien n'est appliqué (null)", K.appliquerChangements({ editorPoints: [] }) === null);
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

  // ═════════ 6 quater. ACTIONS DU COMPTE ═════════
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

  // ═════════ 6 quinquies. DOSSIERS DE L'INSTANCE ═════════
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

  // ═════════ 7. CÂBLAGE (fichiers réels) ═════════
  {
    const MAIN = lire("js/main.js"), HL = lire("js/homeLoader.js"), PROF = lire("js/profileExportImport.js"),
      GEN = lire("js/createConf.js"), SW = lire("sw.js");
    const iMods = MAIN.indexOf("await window.KtaExtensions.chargerModules();");
    const iGate = MAIN.indexOf("if (!_gateDelegueeOk && window.UnlockGate && !window.UnlockGate.isUnlocked())");
    const iLic = MAIN.indexOf('if (_scBoot && _scBoot.state === "on" && window.MyKTAMapProLicense');
    t("boot : licence attendue → modules chargés → gate (ordre)", iLic > 0 && iMods > iLic && iGate > iMods);
    t("boot : une gate déléguée franchie remplace la gate community", /try \{ await _gate; _gateDelegueeOk = true;/.test(MAIN));
    t("🩸 boot : gate déléguée en échec → « Installation indisponible », JAMAIS la gate community",
      /catch \(e\) \{[\s\S]{0,400}await _ktaInstanceIndisponible\(\);/.test(MAIN) &&
      /function _ktaInstanceIndisponible\(\) \{\s*return new Promise\(function\(\) \{/.test(MAIN));
    t("🩸 boot : module de connexion non chargé → « Installation indisponible »",
      /else if \(_mods && _mods\.demandes > 0 && _mods\.echecs > 0\) \{[\s\S]{0,200}await _ktaInstanceIndisponible\(\);/.test(MAIN));
    t("import : le goulot du kiosque consulte la prise (import simple, multiple, profil)",
      /window\.KtaExtensions\.importAutorise === "function" &&\s*!window\.KtaExtensions\.importAutorise\(\)\) return true;/.test(MAIN));
    t("export de profil : les archives de plans passent par la prise", /window\.KtaExtensions\.exportAutorise\(p\.id\)/.test(PROF));
    t("plans d'extension : inscrits en type « ext » après la découverte serveur", /_decouvrirPlansExtension\(\)/.test(MAIN) && /type: "ext", extId:/.test(MAIN));
    // Gardé selon « Mémoriser le plan dans l'app » ; une copie DÉJÀ gardée est toujours mise à
    // jour (sinon l'ancienne passerait pour la version courante).
    t("plans d'extension : ouverts via la prise, gardés selon le réglage (copie existante toujours à jour), type conservé",
      /if \(plan\.type === "ext"\) \{/.test(HL) &&
      /typeRegistre: "ext", zipFile: fichier,\s*storeBlob: !!plan\.storedBlob \|\| window\.ktaMemoriserPlanActif\(\)/.test(HL) &&
      /const _estExt = meta\.typeRegistre === "ext";/.test(MAIN) && /type: _estExt \? "ext" : "local"/.test(MAIN));
    t("plans d'extension : à l'ouverture, nom et version de l'installation gardés (pas ceux du ZIP)",
      /name: \(_existant && _existant\.name\) \? _existant\.name : planName/.test(MAIN));
    {
      const EXT = lire("js/ktaExtensions.js");
      t("multi-comptes : seules les familles touchées sont réécrites, dessin en cours repris par uid",
        /if \(touches\.roads && window\.setRoads\)/.test(EXT) && /reprendre\("setCurrentRoadByIndex"/.test(EXT));
      t("🩸 multi-comptes : l'historique d'annulation repart de zéro après une réception", /window\.HistoryManager\.reset\(\)/.test(EXT));
      t("lecture seule : prise lectureSeule, erreur = lecture seule, plan local jamais",
        /function lectureSeule\(registreId\)/.test(EXT) && /lecture seule :", e\); return true;/.test(EXT));
      t("export : le goulot ktaExportPlanRefuse garde l'export de session et l'export image",
        /ktaExportPlanRefuse\(\)\) return;/.test(lire("js/sessionExporter.js")) && /ktaExportPlanRefuse\(\)\) return;/.test(lire("js/exporter.js")));
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
    t("Générateur : « Publier » seulement si une extension sait publier", /window\.KtaExtensions\.aPrise\("publierPlan"\)/.test(GEN));
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

  console.log("");
  if (ko) { console.log("⚠️ " + ko + " echec(s)"); process.exit(1); }
  console.log("🎉 points d'extension : neutres sans extension, fermés quand une permission échoue, jamais de repli sur la gate community");
})();
