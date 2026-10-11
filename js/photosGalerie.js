/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 📸 MES PHOTOS — js/photosGalerie.js (vague « Photos », 10/10/2026)
// =========================
//
// 🎯 Rôle : la galerie de TOUTES les photos de l'appareil (🧰 Outils de
// l'accueil), plan par plan, rangées par point — et le moyen de RÉCUPÉRER
// une photo dont le point a été supprimé (décision KARMA : pas un nettoyage,
// une récupération ; gardée indéfiniment, jamais effacée sans confirmation).
//
// « Sans point » = sa clé (`pointId` : uid du point, ou son nom pour les
// photos d'avant la v2.3.0) ne correspond à AUCUN point connu du plan :
// session (KtaSessionStore — objets reçus d'une installation reliée compris),
// et points des calques du plan (fichiers du plan serveur, ou archive ZIP
// gardée sur l'appareil). 🩸 Si les points du plan ne sont pas lisibles
// d'ici (archive absente, serveur injoignable, plan d'une installation pas
// encore synchronisé), on NE CONCLUT PAS : « à vérifier à l'ouverture du
// plan ». Plan ouvert : la vérité est la carte (points vivants).
//
// Actions sur un point disparu : 🔗 Rattacher (liste filtrable ou carte),
// ♻️ Recréer le point (avec sa fiche : position, niveau, type, nom — même uid,
// donc les photos le retrouvent sans changer de clé), 💾 Enregistrer (ZIP au
// format photos/_index.json des exports de session), 🗑️ Supprimer (ktaConfirm,
// nombre + taille).
//
// Signal discret : à l'ouverture d'un plan qui a des photos sans point
// (main.js > _ktaPlanifierMigrationPhotos appelle apresOuverturePlan), un
// toast « N photos sans point » ouvre la galerie sur ce plan.
//
// Installation reliée : prise `photos` (js/ktaExtensions.js) — la galerie
// demande à l'extension de compléter le plan affiché (completerPlan). Sans
// extension : rien n'est appelé, tout est local.
//
// API : window.KtaPhotosGalerie = { ouvrir(planId?), analyser(planId), apresOuverturePlan(planId) }
// =========================

(function () {
  "use strict";

  const MODAL_ID = "kta-phg-modal";
  const PICK_ID = "kta-phg-pick";
  const SIGNAL_ID = "kta-phg-signal";
  const FLOATER_ID = "kta-phg-floater";

  const _t = function (k, p) { return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k; };
  const _esc = function (s) {
    if (typeof window.ktaEsc === "function") return window.ktaEsc(s);
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  function _taille(n) {
    if (typeof window._kta_formatBytes === "function") return window._kta_formatBytes(n);
    return (n < 1048576) ? Math.round((n || 0) / 1024) + " Ko" : (n / 1048576).toFixed(1) + " Mo";
  }
  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type || "info");
  }
  function _P() { return window.MyKTAMapPhotos || null; }
  function _plan(planId) {
    return (window.PlanRegistry && typeof window.PlanRegistry.findById === "function") ? window.PlanRegistry.findById(planId) : null;
  }
  function _nomPlan(planId) { const p = _plan(planId); return (p && p.name) || String(planId); }
  function _planOuvert(planId) {
    const affiche = (typeof window.ktaPlanAffiche === "function") ? window.ktaPlanAffiche() : !!window.map;
    return affiche && window._currentLoadedPlanId === planId;
  }
  function _extPhotos() {
    const K = window.KtaExtensions;
    return !!(K && typeof K.aPrise === "function" && K.aPrise("photos"));
  }

  // ObjectURL des vignettes : révoquées à chaque redessin et à la fermeture.
  const _urls = new Set();
  function _revoquer() {
    _urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* rien */ } });
    _urls.clear();
  }

  // ─────────────────────────── POINTS D'UN PLAN ───────────────────────────
  function _pt(p, source) {
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") return null;
    const o = { id: p.id != null ? String(p.id) : "", nom: p.nom || p.id || "", x: p.x, y: p.y,
                level: p.level, tags: Array.isArray(p.tags) ? p.tags : [], source: source };
    if (typeof p.uid === "string" && p.uid) o.uid = p.uid;
    return o;
  }
  function _ajouterDepuisCalque(dj, pts) {
    (dj && Array.isArray(dj.data) ? dj.data : []).forEach(function (p) { const o = _pt(p, "data"); if (o) pts.push(o); });
  }
  async function _jsonCalque(base, file) {
    const essais = [base + "/" + file];
    if (String(file).indexOf("/") >= 0) essais.push(file);   // chemin complet depuis la racine (plans historiques)
    for (let i = 0; i < essais.length; i++) {
      try { const r = await fetch(essais[i], { cache: "no-cache" }); if (r.ok) return await r.json(); } catch (e) { /* essai suivant */ }
    }
    throw new Error("calque introuvable : " + file);
  }
  // 📦 Lecture PARTIELLE de l'archive d'un plan (12/10/2026). Avant,
  // JSZip.loadAsync(blob) chargeait TOUTE l'archive en mémoire (JSZip lit le
  // Blob entier dans un ArrayBuffer : un plan de 200 Mo = 200 Mo de RAM, sur
  // téléphone, pour lire quelques Ko de points). Ici on ne lit que la fin du
  // fichier (répertoire central) puis les seules entrées demandées, par
  // Blob.slice — le Blob d'IndexedDB reste sur le disque. Inflate par
  // DecompressionStream("deflate-raw"). Rend null si ce n'est pas faisable
  // (navigateur sans deflate-raw, ZIP64, archive chiffrée ou exotique) :
  // l'appelant retombe alors sur JSZip, comme avant.
  // → { noms: [...], a(nom), texte(nom) → Promise<string> } | null
  async function _lecteurZipPartiel(blob) {
    if (!blob || typeof blob.slice !== "function" || typeof DecompressionStream === "undefined") return null;
    try { new DecompressionStream("deflate-raw"); } catch (e) { return null; }
    const taille = blob.size;
    const finLue = Math.min(taille, 22 + 65535);
    const fin = new DataView(await blob.slice(taille - finLue, taille).arrayBuffer());
    let eocd = -1;
    for (let i = finLue - 22; i >= 0; i--) { if (fin.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return null;
    const nb = fin.getUint16(eocd + 10, true), cdTaille = fin.getUint32(eocd + 12, true);
    const cdDebut = fin.getUint32(eocd + 16, true);
    if (nb === 0xffff || cdDebut === 0xffffffff || cdTaille === 0xffffffff) return null;   // ZIP64
    if (cdDebut + cdTaille > taille) return null;
    const cd = new DataView(await blob.slice(cdDebut, cdDebut + cdTaille).arrayBuffer());
    const dec = new TextDecoder("utf-8");
    const entrees = new Map(), noms = [];
    let o = 0;
    for (let k = 0; k < nb; k++) {
      if (o + 46 > cd.byteLength || cd.getUint32(o, true) !== 0x02014b50) return null;
      const lnNom = cd.getUint16(o + 28, true);
      const nom = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + o + 46, lnNom));
      entrees.set(nom, {
        drapeaux: cd.getUint16(o + 8, true), methode: cd.getUint16(o + 10, true),
        tailleC: cd.getUint32(o + 20, true), local: cd.getUint32(o + 42, true)
      });
      noms.push(nom);
      o += 46 + lnNom + cd.getUint16(o + 30, true) + cd.getUint16(o + 32, true);
    }
    async function texte(nom) {
      const e = entrees.get(nom);
      if (!e) throw new Error("entrée absente : " + nom);
      if ((e.drapeaux & 1) || (e.methode !== 0 && e.methode !== 8)) throw new Error("entrée illisible : " + nom);
      const lh = new DataView(await blob.slice(e.local, e.local + 30).arrayBuffer());
      if (lh.getUint32(0, true) !== 0x04034b50) throw new Error("en-tête local invalide : " + nom);
      const debut = e.local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      const morceau = blob.slice(debut, debut + e.tailleC);
      if (e.methode === 0) return morceau.text();
      return new Response(morceau.stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    }
    return { noms: noms, a: function (n) { return entrees.has(n); }, texte: texte };
  }
  // Archive d'un plan : lecture partielle, sinon JSZip (archive entière en mémoire, comme avant).
  async function _ouvrirArchive(blob) {
    try {
      const l = await _lecteurZipPartiel(blob);
      if (l) return l;
    } catch (e) { console.warn("[Photos] lecture partielle de l'archive impossible, repli JSZip :", e); }
    if (!window.JSZip) return null;
    const zip = await window.JSZip.loadAsync(blob);
    return {
      noms: Object.keys(zip.files),
      a: function (n) { return !!zip.file(n); },
      texte: function (n) { return zip.file(n).async("string"); }
    };
  }
  // Points des calques d'un plan NON ouvert. ok = false si on n'a pas pu tout lire.
  async function _lireCalques(plan) {
    const pts = [];
    try {
      if (plan.type === "server" && plan.path && !plan.zip) {
        const cfg = await (await fetch(plan.path + "/plan-config.json", { cache: "no-cache" })).json();
        const layers = (cfg && cfg.dataLayers) || [];
        for (let i = 0; i < layers.length; i++) _ajouterDepuisCalque(await _jsonCalque(plan.path, layers[i].file), pts);
        return { pts: pts, ok: true };
      }
      if (!window.PlanRegistry) return { pts: pts, ok: false };
      const blob = await window.PlanRegistry.getBlob(plan.id);
      if (!blob) return { pts: pts, ok: false };
      const zip = await _ouvrirArchive(blob);
      if (!zip) return { pts: pts, ok: false };
      let cfgNom = zip.a("plan-config.json") ? "plan-config.json" : null;
      if (!cfgNom) cfgNom = zip.noms.find(function (n) { return /(^|\/)plan-config\.json$/.test(n); }) || null;
      if (!cfgNom) return { pts: pts, ok: false };
      const base = cfgNom.replace(/plan-config\.json$/, "");
      const cfg = JSON.parse(await zip.texte(cfgNom));
      const layers = (cfg && cfg.dataLayers) || [];
      for (let i = 0; i < layers.length; i++) {
        const f = layers[i].file;
        const nom = zip.a(base + f) ? base + f : (zip.a(f) ? f : null);
        if (!nom) return { pts: pts, ok: false };
        _ajouterDepuisCalque(JSON.parse(await zip.texte(nom)), pts);
      }
      return { pts: pts, ok: true };
    } catch (e) {
      console.warn("[Photos] points du plan " + plan.id + " illisibles :", e);
      return { pts: pts, ok: false };
    }
  }
  function _pointsVivants() {
    const pts = [];
    ((window.getEditorPoints && window.getEditorPoints()) || []).forEach(function (p) { const o = _pt(p, "session"); if (o) pts.push(o); });
    ((typeof window.getAllEmbeddedPoints === "function" && window.getAllEmbeddedPoints()) || []).forEach(function (p) {
      const o = _pt(p, "data"); if (o) pts.push(o);
    });
    return pts;
  }
  function _pointsSession(planId) {
    const pts = [];
    try {
      const brut = window.KtaSessionStore ? window.KtaSessionStore.lire(planId) : null;
      const s = brut ? JSON.parse(brut) : null;
      ((s && s.editorPoints) || []).forEach(function (p) { const o = _pt(p, "session"); if (o) pts.push(o); });
    } catch (e) { console.warn("[Photos] session " + planId + " illisible :", e); }
    return pts;
  }

  function _index(pts) {
    const parUid = new Map(), parNom = new Map();
    pts.forEach(function (p) {
      if (p.uid && !parUid.has(p.uid)) parUid.set(p.uid, p);
      if (p.id) { if (!parNom.has(p.id)) parNom.set(p.id, []); parNom.get(p.id).push(p); }
    });
    return { parUid: parUid, parNom: parNom };
  }
  function _trouver(ix, cle) {
    if (ix.parUid.has(cle)) return ix.parUid.get(cle);
    const l = ix.parNom.get(cle);
    return l && l.length ? l[0] : null;
  }

  // ─────────────────────────── ANALYSE ───────────────────────────
  // → { planId, complet, pts, groupes: [{ etat: "point"|"sans"|"verifier", cle, point, fiche, photos, taille }] }
  async function analyser(planId) {
    const P = _P();
    const vide = { planId: planId, complet: false, pts: [], groupes: [] };
    if (!P || typeof P.listerPlan !== "function") return vide;
    const photos = await P.listerPlan(planId);
    const plan = _plan(planId);
    let pts, complet;
    if (_planOuvert(planId)) {
      pts = _pointsVivants();
      complet = true;
      // Les calques arrivent par lots : une photo non retrouvée sur la carte est
      // cherchée aussi dans les fichiers du plan avant de la dire « sans point ».
      const ix0 = _index(pts);
      if (plan && photos.some(function (ph) { return !_trouver(ix0, String(ph.pointId || "")); })) {
        const c = await _lireCalques(plan);
        pts = pts.concat(c.pts);
      }
    } else {
      pts = _pointsSession(planId);
      if (!plan) complet = false;
      else {
        const c = await _lireCalques(plan);
        pts = pts.concat(c.pts);
        // Plan d'une installation reliée : ses objets partagés ne sont connus qu'à l'ouverture.
        complet = c.ok && plan.type !== "ext";
      }
    }
    const ix = _index(pts);
    const groupes = new Map();
    photos.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }).forEach(function (ph) {
      const cle = String(ph.pointId || "");
      const point = cle ? _trouver(ix, cle) : null;
      const etat = point ? "point" : (complet ? "sans" : "verifier");
      const k = point ? "p:" + (point.uid || ("#" + point.id + "@" + point.x + "," + point.y)) : etat + ":" + cle;
      if (!groupes.has(k)) groupes.set(k, { etat: etat, cle: point ? (point.uid || point.id) : cle, point: point, fiche: null, photos: [], taille: 0 });
      const g = groupes.get(k);
      g.photos.push(ph);
      g.taille += ph.size || 0;
      if (ph.fiche && (!g.fiche || (ph.fiche.maj || 0) >= (g.fiche.maj || 0))) g.fiche = ph.fiche;
    });
    return { planId: planId, complet: complet, pts: pts, groupes: Array.from(groupes.values()) };
  }

  // ─────────────────────────── FENÊTRE ───────────────────────────
  function fermer() {
    _revoquer();
    const m = document.getElementById(MODAL_ID);
    if (m) m.remove();
    const p = document.getElementById(PICK_ID);
    if (p) p.remove();
  }
  function _corps() {
    const m = document.getElementById(MODAL_ID);
    return m ? m.querySelector(".kta-phg-corps") : null;
  }
  function ouvrir(planId) {
    if (!_P()) { window.ktaAlerte(_t("photosgal.err.indispo"), { type: "erreur" }); return; }
    fermer();
    const ov = document.createElement("div");
    ov.id = MODAL_ID;
    ov.className = "kta-readme-modal-overlay";
    ov.innerHTML =
      '<div class="kta-readme-modal-boite kta-ipl-boite kta-phg-boite" role="dialog" aria-modal="true">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _esc(_t("photosgal.titre")) + '</span>' +
          '<button class="kta-readme-modal-close" type="button" data-phg="fermer" aria-label="' + _esc(_t("photosgal.fermer")) + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-phg-corps"></div>' +
      '</div>';
    document.documentElement.appendChild(ov);
    ov.addEventListener("click", function (e) {
      if (e.target === ov || (e.target.closest && e.target.closest('[data-phg="fermer"]'))) fermer();
    });
    if (planId) _vuePlan(planId); else _vueListe();
  }

  // ── Liste des plans ──
  async function _vueListe() {
    const corps = _corps();
    if (!corps) return;
    _revoquer();
    corps.innerHTML = '<p class="kta-ipl-hint">' + _esc(_t("photosgal.chargement")) + '</p>';
    const tout = await _P().listerTout();
    const parPlan = new Map();
    tout.forEach(function (ph) {
      const e = parPlan.get(ph.planId) || { n: 0, taille: 0 };
      e.n++; e.taille += ph.size || 0;
      parPlan.set(ph.planId, e);
    });
    // Installation reliée : ses plans peuvent avoir des photos de l'équipe pas encore sur l'appareil.
    if (_extPhotos() && window.PlanRegistry && typeof window.PlanRegistry.getAll === "function") {
      (window.PlanRegistry.getAll() || []).forEach(function (p) {
        if (p && p.type === "ext" && !parPlan.has(p.id)) parPlan.set(p.id, { n: 0, taille: 0 });
      });
    }
    if (!_corps()) return;
    const total = tout.reduce(function (a, ph) { return a + (ph.size || 0); }, 0);
    const lignes = Array.from(parPlan.keys()).sort(function (a, b) { return _nomPlan(a).localeCompare(_nomPlan(b)); });
    let html = '<p class="kta-ipl-hint">' + _esc(_t("photosgal.intro")) + '</p>';
    if (!lignes.length) {
      html += '<p class="kta-ipl-empty">' + _esc(_t("photosgal.vide")) + '</p>';
    } else {
      html += '<p class="kta-phg-total">' + _esc(_t("photosgal.total", { n: tout.length, taille: _taille(total) })) + '</p>';
      html += lignes.map(function (id) {
        const e = parPlan.get(id);
        const absent = !_plan(id);
        return '<button type="button" class="kta-ipl-plan-btn kta-phg-plan" data-plan="' + _esc(id) + '">' +
                 '<span class="kta-ipl-plan-name">' + _esc(_nomPlan(id)) + (absent ? ' <span class="kta-tx-muted">' +
                   _esc(_t("photosgal.planAbsent")) + '</span>' : '') + '</span>' +
                 '<span class="kta-ipl-plan-ver">' + _esc(_t("photosgal.planCompte", { n: e.n, taille: _taille(e.taille) })) + '</span>' +
               '</button>';
      }).join("");
    }
    corps.innerHTML = html;
    corps.querySelectorAll("[data-plan]").forEach(function (b) {
      b.addEventListener("click", function () { _vuePlan(b.getAttribute("data-plan")); });
    });
  }

  // ── Un plan ──
  let _jetonVue = 0;
  async function _vuePlan(planId) {
    const corps = _corps();
    if (!corps) return;
    const jeton = ++_jetonVue;
    _revoquer();
    const plan = _plan(planId);
    const ouvert = _planOuvert(planId);
    corps.innerHTML =
      '<div class="kta-phg-barre">' +
        '<button type="button" class="kta-btn kta-btn-ghost kta-phg-retour">' + _esc(_t("photosgal.retour")) + '</button>' +
        (plan && !ouvert ? '<button type="button" class="kta-btn kta-btn-ghost kta-phg-ouvrir">' + _esc(_t("photosgal.ouvrirPlan")) + '</button>' : '') +
      '</div>' +
      '<div class="kta-phg-plan-titre">' + _esc(_nomPlan(planId)) + '</div>' +
      '<p class="kta-ipl-hint kta-phg-etat">' + _esc(_t(_extPhotos() ? "photosgal.completer" : "photosgal.chargement")) + '</p>' +
      '<div class="kta-phg-sections"></div>';
    corps.querySelector(".kta-phg-retour").addEventListener("click", _vueListe);
    const bo = corps.querySelector(".kta-phg-ouvrir");
    if (bo) bo.addEventListener("click", function () { _allerAuPoint(planId, null); });

    if (_extPhotos() && window.KtaExtensions.photosCompleterPlan) {
      try { await window.KtaExtensions.photosCompleterPlan(planId); } catch (e) { /* journalisé par la prise */ }
    }
    if (jeton !== _jetonVue || !_corps()) return;
    const a = await analyser(planId);
    if (jeton !== _jetonVue || !_corps()) return;
    _rendrePlan(a);
  }

  function _rendrePlan(a) {
    const corps = _corps();
    if (!corps) return;
    const etat = corps.querySelector(".kta-phg-etat");
    const sections = corps.querySelector(".kta-phg-sections");
    const sans = a.groupes.filter(function (g) { return g.etat === "sans"; });
    const verif = a.groupes.filter(function (g) { return g.etat === "verifier"; });
    const avec = a.groupes.filter(function (g) { return g.etat === "point"; })
      .sort(function (x, y) { return String(x.point.nom).localeCompare(String(y.point.nom)); });
    const n = a.groupes.reduce(function (s, g) { return s + g.photos.length; }, 0);
    if (etat) etat.textContent = n ? _t("photosgal.planResume", { n: n }) : _t("photosgal.planVide");
    sections.innerHTML = "";

    if (sans.length) {
      const nb = sans.reduce(function (s, g) { return s + g.photos.length; }, 0);
      const sec = _section(_t("photosgal.sans.titre"), nb, "kta-phg-sec-sans");
      _ajouterTexte(sec, _t("photosgal.sans.explication"));
      sans.forEach(function (g) { sec.appendChild(_carte(a, g)); });
      sections.appendChild(sec);
    }
    if (verif.length) {
      const nb = verif.reduce(function (s, g) { return s + g.photos.length; }, 0);
      const sec = _section(_t("photosgal.verifier.titre"), nb, "kta-phg-sec-verif");
      _ajouterTexte(sec, _t(_plan(a.planId) ? "photosgal.verifier.explication" : "photosgal.verifier.planAbsent"));
      verif.forEach(function (g) { sec.appendChild(_carte(a, g)); });
      sections.appendChild(sec);
    }
    if (avec.length) {
      const nb = avec.reduce(function (s, g) { return s + g.photos.length; }, 0);
      const sec = _section(_t("photosgal.avec.titre"), nb, "kta-phg-sec-avec");
      avec.forEach(function (g) { sec.appendChild(_carte(a, g)); });
      sections.appendChild(sec);
    }
  }
  function _section(titre, n, cls) {
    const sec = document.createElement("div");
    sec.className = "kta-phg-section " + cls;
    const h = document.createElement("div");
    h.className = "kta-phg-section-titre";
    h.textContent = titre + " ";
    const b = document.createElement("span");
    b.className = "kta-phg-badge";
    b.textContent = String(n);
    h.appendChild(b);
    sec.appendChild(h);
    return sec;
  }
  function _ajouterTexte(parent, txt) {
    const p = document.createElement("p");
    p.className = "kta-phg-texte";
    p.textContent = txt;
    parent.appendChild(p);
  }
  function _bouton(libelle, fn, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kta-popup-btn kta-phg-action" + (cls ? " " + cls : "");
    b.textContent = libelle;
    b.addEventListener("click", fn);
    return b;
  }

  function _ligneFiche(f) {
    if (!f) return "";
    let s = _t("photosgal.fiche.position", { x: Math.round(f.x), y: Math.round(f.y) });
    if (Number.isInteger(f.niveau)) s += " · " + _t("photosgal.fiche.niveau", { n: f.niveau });
    if (f.type) s += " · " + _t("photosgal.fiche.type", { type: f.type });
    return s;
  }

  function _carte(a, g) {
    const c = document.createElement("div");
    c.className = "kta-phg-carte";
    const titre = document.createElement("div");
    titre.className = "kta-phg-carte-titre";
    const nom = g.point ? (g.point.nom || g.point.id) : (g.fiche && g.fiche.nom) || _t("photosgal.pointInconnu");
    titre.textContent = "📍 " + nom;
    c.appendChild(titre);
    const meta = document.createElement("div");
    meta.className = "kta-phg-carte-meta";
    meta.textContent = _t("photosgal.groupeCompte", { n: g.photos.length, taille: _taille(g.taille) }) +
      (g.etat !== "point" && g.fiche ? " · " + _ligneFiche(g.fiche) : "");
    c.appendChild(meta);

    const vign = document.createElement("div");
    vign.className = "kta-phg-vignettes";
    c.appendChild(vign);
    _remplirVignettes(vign, g.photos);

    const actions = document.createElement("div");
    actions.className = "kta-phg-actions";
    const ids = g.photos.map(function (p) { return p.id; });
    if (g.etat === "sans") {
      actions.appendChild(_bouton(_t("photosgal.action.rattacher"), function () { _choisirPoint(a, g); }));
      if (g.fiche) actions.appendChild(_bouton(_t("photosgal.action.recreer"), function () { _recreer(a.planId, g); }));
    }
    if (g.etat === "verifier" && _plan(a.planId) && !_planOuvert(a.planId)) {
      actions.appendChild(_bouton(_t("photosgal.ouvrirPlan"), function () { _allerAuPoint(a.planId, null); }));
    }
    if (g.etat === "point") {
      actions.appendChild(_bouton(_t("photosgal.action.voir"), function () { _allerAuPoint(a.planId, g.point); }));
    }
    actions.appendChild(_bouton(_t("photosgal.action.enregistrer"), function () { _enregistrer(a.planId, nom, g.photos); }));
    // Supprimer : photos sans point (ou d'un plan absent de l'appareil, qu'on ne peut plus vérifier).
    if (g.etat === "sans" || (g.etat === "verifier" && !_plan(a.planId))) {
      actions.appendChild(_bouton(_t("photosgal.action.supprimer"), function () { _supprimer(a.planId, nom, ids, g.taille); }, "kta-phg-danger"));
    }
    c.appendChild(actions);
    return c;
  }

  async function _remplirVignettes(conteneur, photos) {
    const P = _P();
    const liste = [];
    for (let i = 0; i < photos.length; i++) {
      const img = document.createElement("img");
      img.className = "kta-phg-vignette";
      img.alt = "";
      img.setAttribute("role", "button");
      img.setAttribute("tabindex", "0");
      img.title = _t("photosgal.voirPhoto");
      conteneur.appendChild(img);
      const item = { id: photos[i].id, _objectUrl: null };
      liste.push(item);
      const ouvrirViewer = function (ev) {
        if (ev && ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
        if (ev) ev.preventDefault();
        const vis = liste.filter(function (p) { return !!p._objectUrl; });
        if (!vis.length || !window.MyKTAMapPhotoViewer) return;
        window.MyKTAMapPhotoViewer.open(vis, Math.max(0, vis.indexOf(item)));
      };
      img.addEventListener("click", ouvrirViewer);
      img.addEventListener("keydown", ouvrirViewer);
    }
    // (la carte est insérée dans la fenêtre juste après cet appel : on ne teste
    // sa présence qu'APRÈS la première lecture)
    for (let i = 0; i < photos.length; i++) {
      const rec = await P.getPhoto(photos[i].id);
      if (!rec || !rec.blob || !conteneur.isConnected) continue;
      const u = URL.createObjectURL(rec.blob);
      _urls.add(u);
      liste[i]._objectUrl = u;
      conteneur.children[i].src = u;
    }
  }

  // ─────────────────────────── ACTIONS ───────────────────────────
  function _allerAuPoint(planId, point) {
    const IPL = window.InterPlanLinks;
    if (!IPL || typeof IPL.goTo !== "function") return;
    const confirmer = (typeof window.ktaPlanAffiche === "function") && window.ktaPlanAffiche() && !_planOuvert(planId);
    fermer();
    IPL.goTo(planId, point ? { x: point.x, y: point.y, level: point.level, label: point.nom || point.id } : null,
      { confirm: confirmer });
  }

  // Rattacher : liste filtrable des points du plan, ou la carte si le plan est ouvert.
  function _choisirPoint(a, g) {
    const ancien = document.getElementById(PICK_ID);
    if (ancien) ancien.remove();
    const vus = new Set();
    const pts = a.pts.filter(function (p) {
      const k = p.uid || ("#" + p.id + "@" + p.x + "," + p.y);
      if (vus.has(k) || !(p.uid || p.id)) return false;
      vus.add(k); return true;
    }).sort(function (x, y) { return String(x.nom).localeCompare(String(y.nom)); });
    const ov = document.createElement("div");
    ov.id = PICK_ID;
    ov.className = "kta-readme-modal-overlay";
    ov.style.zIndex = "100001";
    ov.innerHTML =
      '<div class="kta-readme-modal-boite kta-ipl-boite kta-phg-pick-boite" role="dialog" aria-modal="true">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _esc(_t("photosgal.pick.titre", { n: g.photos.length })) + '</span>' +
          '<button class="kta-readme-modal-close" type="button" data-phg="fermer-pick" aria-label="' + _esc(_t("photosgal.fermer")) + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          (_planOuvert(a.planId) ? '<button type="button" class="kta-btn kta-btn-ghost kta-phg-carte-btn">' + _esc(_t("photosgal.pick.carte")) + '</button>' : '') +
          '<input type="search" class="kta-ipl-search kta-phg-filtre" autocomplete="off">' +
          '<div class="kta-phg-pick-liste"></div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(ov);
    const filtre = ov.querySelector(".kta-phg-filtre");
    filtre.placeholder = _t("photosgal.pick.filtre");
    const liste = ov.querySelector(".kta-phg-pick-liste");
    const MAX = 200;
    function rendre() {
      const q = String(filtre.value || "").toLowerCase().trim();
      const l = pts.filter(function (p) { return !q || String(p.nom).toLowerCase().indexOf(q) >= 0; });
      liste.textContent = "";
      if (!l.length) {
        const p = document.createElement("p");
        p.className = "kta-ipl-empty";
        p.textContent = _t("photosgal.pick.aucun");
        liste.appendChild(p);
        return;
      }
      l.slice(0, MAX).forEach(function (p) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "kta-ipl-pt-btn";
        const n = document.createElement("span");
        n.className = "kta-ipl-pt-name";
        n.textContent = p.nom || p.id;
        const m = document.createElement("span");
        m.className = "kta-ipl-pt-meta";
        m.textContent = _t(p.source === "data" ? "photosgal.pick.calque" : "photosgal.pick.session") +
          (Number.isInteger(p.level) ? " · " + _t("photosgal.fiche.niveau", { n: p.level }) : "");
        b.appendChild(n); b.appendChild(m);
        b.addEventListener("click", function () { ov.remove(); _rattacherA(a.planId, g, p); });
        liste.appendChild(b);
      });
      if (l.length > MAX) {
        const p = document.createElement("p");
        p.className = "kta-ipl-hint";
        p.textContent = _t("photosgal.pick.plus", { n: l.length - MAX });
        liste.appendChild(p);
      }
    }
    filtre.addEventListener("input", rendre);
    ov.addEventListener("click", function (e) {
      if (e.target === ov || (e.target.closest && e.target.closest('[data-phg="fermer-pick"]'))) ov.remove();
    });
    const bc = ov.querySelector(".kta-phg-carte-btn");
    if (bc) bc.addEventListener("click", function () { ov.remove(); _choisirSurCarte(a.planId, g); });
    rendre();
    setTimeout(function () { try { filtre.focus(); } catch (e) { /* rien */ } }, 30);
  }

  // 📸 Limite de 5 photos par point, vérifiée AVANT de rattacher (12/10/2026) :
  // au-delà, refus expliqué — rien n'est rattaché, rien n'est supprimé, le
  // groupe reste « sans point ». Un point déjà au-delà (photos d'avant la
  // limite) garde tout : seul l'ajout est refusé. → Promise<boolean>.
  async function _placeSurPoint(planId, g, p) {
    const P = _P();
    if (!P || typeof P.placesPourPoint !== "function") return true;
    let r;
    try { r = await P.placesPourPoint(planId, { uid: p.uid, id: p.id }, g.photos.map(function (x) { return x.id; })); }
    catch (e) { console.warn("[Photos] places du point illisibles :", e); return true; }
    if (r.ok) return true;
    await window.ktaAlerte(_t("photosgal.limite.refus",
      { nom: p.nom || p.id, max: r.max, deja: r.deja, ajout: r.ajout, libres: r.libres }));
    return false;
  }

  async function _rattacherA(planId, g, p) {
    const P = _P();
    if (!(await _placeSurPoint(planId, g, p))) return;
    const n = await P.rattacher(g.photos.map(function (x) { return x.id; }), planId, p.uid || p.id, P.ficheDepuisPoint(p));
    _toast(_t("photosgal.rattache", { n: n, nom: p.nom || p.id }), "info");
    if (_corps()) _vuePlan(planId);
  }

  // Sur la carte : la fenêtre se ferme, on ouvre la fiche du point voulu.
  function _choisirSurCarte(planId, g) {
    const map = window.map;
    if (!map || typeof map.once !== "function") return;
    fermer();
    const ancien = document.getElementById(FLOATER_ID);
    if (ancien) ancien.remove();
    const fl = document.createElement("div");
    fl.id = FLOATER_ID;
    fl.className = "kta-phg-floater";
    const txt = document.createElement("span");
    txt.textContent = _t("photosgal.carte.consigne", { n: g.photos.length });
    const annuler = document.createElement("button");
    annuler.type = "button";
    annuler.className = "kta-btn kta-btn-ghost";
    annuler.textContent = _t("photosgal.carte.annuler");
    fl.appendChild(txt); fl.appendChild(annuler);
    document.body.appendChild(fl);
    const surPopup = function (e) {
      fl.remove();
      const src = e && e.popup && e.popup._source;
      if (!src || typeof src.getLatLng !== "function") return;
      const ll = src.getLatLng();
      const imgH = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
      const x = ll.lng, y = imgH - ll.lat;
      const p = _pointsVivants().find(function (q) { return Math.abs(q.x - x) < 0.01 && Math.abs(q.y - y) < 0.01 && (q.uid || q.id); });
      if (!p) { _toast(_t("photosgal.carte.pasUnPoint"), "warn"); return; }
      _placeSurPoint(planId, g, p).then(function (place) {
        if (!place) return false;
        return window.ktaConfirm(_esc(_t("photosgal.carte.confirmer", { n: g.photos.length, nom: p.nom || p.id })));
      }).then(function (ok) {
        if (!ok) return;
        const P = _P();
        P.rattacher(g.photos.map(function (q) { return q.id; }), planId, p.uid || p.id, P.ficheDepuisPoint(p)).then(function (n) {
          _toast(_t("photosgal.rattache", { n: n, nom: p.nom || p.id }), "info");
          // la fiche se rouvre : ses photos s'y affichent
          try { src.closePopup(); src.openPopup(); } catch (er) { /* rien */ }
        });
      });
    };
    map.once("popupopen", surPopup);
    annuler.addEventListener("click", function () { fl.remove(); try { map.off("popupopen", surPopup); } catch (e) { /* rien */ } });
  }

  // Recréer le point : sa fiche (position, niveau, type, nom), en un geste. Le plan doit être ouvert.
  let _apresOuverture = null;   // { planId, fn } : action à faire quand ce plan aura fini de s'ouvrir
  const RE_UID = /^[a-z]{2}_[a-z0-9]+_[a-z0-9]{6}$/;
  async function _recreer(planId, g) {
    if (!g.fiche) return;
    const ids = g.photos.map(function (p) { return p.id; });
    if (_planOuvert(planId)) { fermer(); _recreerIci(planId, g.cle, g.fiche, ids); return; }
    if (!_plan(planId)) return;
    const ok = await window.ktaConfirm(_esc(_t("photosgal.recreer.ouvrir", { plan: _nomPlan(planId) })),
      { okLabel: _esc(_t("photosgal.ouvrirPlan")) });
    if (!ok) return;
    _apresOuverture = { planId: planId, fn: function () { _recreerIci(planId, g.cle, g.fiche, ids); } };
    _allerAuPoint(planId, { x: g.fiche.x, y: g.fiche.y, level: Number.isInteger(g.fiche.niveau) ? g.fiche.niveau : undefined, nom: g.fiche.nom });
  }
  function _recreerIci(planId, cle, fiche, ids) {
    if (!_planOuvert(planId) || typeof window.getEditorPoints !== "function" || typeof window.setEditorPoints !== "function") return false;
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return false;
    const liste = (window.getEditorPoints() || []).slice();
    if (liste.some(function (p) { return p && p.uid && p.uid === cle; })) {
      _toast(_t("photosgal.recreer.dejaLa"), "warn");
      return false;
    }
    const nom = fiche.nom || _t("photosgal.pointInconnu");
    const point = {
      id: nom, nom: nom, x: fiche.x, y: fiche.y, tags: fiche.type ? [fiche.type] : [],
      etat: "Non inspectée", description: "", profondeur: null,
      date_update: new Date().toISOString().split("T")[0], source: "editor"
    };
    if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
      point.level = Number.isInteger(fiche.niveau) ? fiche.niveau : (window.APP_CONFIG.activeLevel || 0);
    }
    // Même uid que le point supprimé : ses photos (et, en installation reliée, celles du
    // serveur) le retrouvent sans changer de clé. Clé de nom (photo d'avant la v2.3.0) : uid neuf.
    const K = window.KtaUid;
    point.uid = RE_UID.test(cle) ? cle : (K ? K.genUid("pt") : undefined);
    if (!point.uid) delete point.uid;
    if (K) { K.ensure(point, "pt"); K.touch(point); }
    const H = window.HistoryManager;
    const avant = H ? H.captureState("editorPoints") : null;
    liste.push(point);
    window.setEditorPoints(liste);
    if (H && avant) H.record(_t("photosgal.undo.recreer", { nom: nom }), avant, "editorPoints");
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch (e) { /* l'auto-save prendra le relais */ }
    }
    const P = _P();
    const suite = (point.uid && point.uid !== cle)
      ? P.rattacher(ids, planId, point.uid, P.ficheDepuisPoint(point))
      : P.majFichesPoints(planId, [point]);
    Promise.resolve(suite).then(function () {
      _toast(_t("photosgal.recreer.fait", { nom: nom, n: ids.length }), "info");
    });
    if (window.InterPlanLinks && typeof window.InterPlanLinks.goTo === "function") {
      window.InterPlanLinks.goTo(planId, { x: point.x, y: point.y, level: point.level, label: nom }, { confirm: false });
    }
    console.log("[Photos] point recréé depuis sa fiche :", nom, "(" + ids.length + " photo(s))");
    return true;
  }

  // Enregistrer sur l'appareil : ZIP au format des exports de session (photos/_index.json).
  async function _enregistrer(planId, nom, photos) {
    if (typeof window.JSZip === "undefined") { window.ktaAlerte(_t("photosgal.err.zip"), { type: "erreur" }); return; }
    const P = _P();
    const zip = new window.JSZip();
    const dossier = zip.folder("photos");
    const idx = {};
    let n = 0;
    for (let i = 0; i < photos.length; i++) {
      const rec = await P.getPhoto(photos[i].id);
      if (!rec || !rec.blob) continue;
      const m = String(rec.mime || "");
      const ext = m.indexOf("png") >= 0 ? "png" : m.indexOf("webp") >= 0 ? "webp" : m.indexOf("gif") >= 0 ? "gif" : "jpg";
      const fichier = rec.id + "." + ext;
      dossier.file(fichier, rec.blob);
      idx[rec.id] = { pointId: rec.pointId, mime: rec.mime, size: rec.size, file: fichier };
      if (rec.fiche) idx[rec.id].fiche = rec.fiche;
      n++;
    }
    if (!n) return;
    dossier.file("_index.json", JSON.stringify({ version: 1, planId: planId, photos: idx }, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    // Coupe des « _ » de bord en temps linéaire (une alternative ancrée ^_+|_+$ peut revenir en arrière, Sonar S8786).
    const propre = function (s) {
      const t = String(s || "").replace(/[^\w-]+/g, "_");
      let a = 0, b = t.length;
      while (a < b && t.charAt(a) === "_") a++;
      while (b > a && t.charAt(b - 1) === "_") b--;
      return t.slice(a, b).slice(0, 40) || "photos";
    };
    const jour = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "myktamap-photos-" + propre(_nomPlan(planId)) + "-" + propre(nom) + "-" + jour + ".zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    _toast(_t("photosgal.enregistre", { n: n }), "info");
  }

  async function _supprimer(planId, nom, ids, taille) {
    const ok = await window.ktaConfirm(_esc(_t("photosgal.supprimer.confirmer", { n: ids.length, taille: _taille(taille), nom: nom })), {
      titre: _esc(_t("photosgal.supprimer.titre")), okLabel: _esc(_t("photosgal.supprimer.ok"))
    });
    if (!ok) return;
    const n = await _P().supprimerPhotos(ids);
    _toast(_t("photosgal.supprime", { n: n }), "info");
    if (_corps()) _vuePlan(planId);
  }

  // ─────────────────────────── SIGNAL À L'OUVERTURE ───────────────────────────
  // Une fois par ouverture d'un plan (oublié à la fermeture du plan).
  const _signales = new Set();
  window.addEventListener("mktm:plan-ferme", function () { _signales.clear(); });
  async function apresOuverturePlan(planId) {
    if (!planId || !_planOuvert(planId)) return;
    if (_apresOuverture && _apresOuverture.planId === planId) {
      const a = _apresOuverture;
      _apresOuverture = null;
      try { a.fn(); } catch (e) { console.warn("[Photos] action après ouverture :", e); }
    }
    if (_signales.has(planId) || !_P() || typeof _P().listerPlan !== "function") return;
    const recs = await _P().listerPlan(planId);
    if (!recs.length) return;
    const a = await analyser(planId);
    if (!_planOuvert(planId) || _signales.has(planId)) return;
    _signales.add(planId);
    const n = a.groupes.filter(function (g) { return g.etat === "sans"; })
      .reduce(function (s, g) { return s + g.photos.length; }, 0);
    if (!n) return;
    console.log("[Photos] " + n + " photo(s) sans point sur ce plan");
    if (document.getElementById(MODAL_ID)) return;
    _signaler(planId, n);
  }
  // Toast maison (il porte un bouton) : il demande la permission au goulot des notifications.
  function _signaler(planId, n) {
    const G = window.OOMGuard;
    if (G && typeof G.toastAutorise === "function" && !G.toastAutorise("warn")) return;
    const ancien = document.getElementById(SIGNAL_ID);
    if (ancien) ancien.remove();
    const el = document.createElement("div");
    el.id = SIGNAL_ID;
    el.className = "kta-phg-signal";
    el.setAttribute("role", "status");
    const txt = document.createElement("span");
    txt.textContent = _t("photosgal.signal.texte", { n: n });
    const voir = document.createElement("button");
    voir.type = "button";
    voir.className = "kta-btn kta-btn-primary";
    voir.textContent = _t("photosgal.signal.voir");
    const x = document.createElement("button");
    x.type = "button";
    x.className = "kta-phg-signal-x";
    x.setAttribute("aria-label", _t("photosgal.fermer"));
    x.textContent = "✕";
    el.appendChild(txt); el.appendChild(voir); el.appendChild(x);
    document.body.appendChild(el);
    const retirer = function () { if (el.isConnected) el.remove(); };
    voir.addEventListener("click", function () { retirer(); ouvrir(planId); });
    x.addEventListener("click", retirer);
    setTimeout(retirer, 12000);
  }

  // Bouton « 📸 Mes photos » des 🧰 Outils de l'accueil (index.html).
  function _cabler() {
    const b = document.getElementById("loaderPhotosBtn");
    if (b && !b._ktaCable) { b._ktaCable = true; b.addEventListener("click", function () { ouvrir(); }); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", _cabler);
  else _cabler();

  window.KtaPhotosGalerie = {
    ouvrir: ouvrir,
    fermer: fermer,
    analyser: analyser,
    apresOuverturePlan: apresOuverturePlan
  };
})();
