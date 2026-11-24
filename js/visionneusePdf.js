/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// VISIONNEUSEPDF.JS — visionneuse PDF maison (Mode Histoire, Carnet > Récits)
// =========================
// Un canvas par page, rendu quand la page approche de l'écran et libéré quand elle s'en éloigne ; zoom au pincement,
// Ctrl + molette et boutons ; plein écran (API du navigateur, sinon la visionneuse couvre la page). PDF.js
// (lib/pdfjs/, build moderne) n'est importé qu'à la première ouverture, jamais au démarrage ; sw.js le précache avec
// son worker, ses polices standard et ses décodeurs JS : la visionneuse marche hors ligne.
// Expose window.KtaVisionneusePdf : disponible() · apiManquantes() · ouvrir(hote, blob, { nom }) → Promise
//   (rejette si le document ne s'affiche pas : l'appelant retombe sur l'iframe ou « Ouvrir / Enregistrer ») ·
//   liberer(racine) (détruit toute visionneuse posée dans `racine`) · _etat() (checkup).
// ⚠️ contrat : détection de fonctionnalités, jamais l'agent utilisateur. Le build moderne appelle sans repli des API
//   récentes (Math.sumPrecise, Map.prototype.getOrInsertComputed…) : sans elles, disponible() est faux.
// 🔒 CSP inchangée : décodeurs en repli JS (useWasm: false, pas de 'wasm-unsafe-eval'), worker du même site.
// 🩸 PDF.js est un module ES : import() d'une URL absolue depuis ce script classique (comme vue3d.js et three.js).
// 🩸 Mémoire : fermer = loadingTask.destroy() (document et worker), canvas remis à 0 × 0 ; liberer() est appelé
//   par chaque appelant avant de vider son conteneur, et une visionneuse dont l'hôte a quitté la page se détruit.
// Doc : docs/architecture/session-data.md § Mode Histoire · Checkup : scripts/smoke/checkup-visionneuse-pdf.js

(function () {
  "use strict";

  const URL_LIB = "lib/pdfjs/pdf.min.js";
  const URL_WORKER = "lib/pdfjs/pdf.worker.min.js";
  const URL_POLICES = "lib/pdfjs/standard_fonts/";
  const URL_DECODEURS = "lib/pdfjs/wasm/";
  const CSS = "css/style-visionneuse-pdf.css";
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 5;
  const PAS_ZOOM = 1.25;
  const MARGE = 8;
  // Pixels d'un canvas : au-delà, la page est rendue moins fine (iOS plafonne la mémoire des canvas d'un onglet).
  const PIXELS_MAX = 4e6;

  // Appelées sans repli par pdf.min.js ou son worker (inventaire du paquet) ; une seule absente = pas de visionneuse.
  const _API = [
    ["Math.sumPrecise", function () { return typeof Math.sumPrecise === "function"; }],
    ["Map.prototype.getOrInsertComputed", function () {
      return typeof Map.prototype.getOrInsertComputed === "function" && typeof Map.prototype.getOrInsert === "function" &&
             typeof WeakMap.prototype.getOrInsertComputed === "function";
    }],
    ["Promise.try", function () { return typeof Promise.try === "function"; }],
    ["Promise.withResolvers", function () { return typeof Promise.withResolvers === "function"; }],
    ["Uint8Array.fromBase64", function () {
      return typeof Uint8Array.fromBase64 === "function" && typeof Uint8Array.prototype.toBase64 === "function" &&
             typeof Uint8Array.prototype.toHex === "function";
    }],
    ["Iterator.prototype", function () {
      return typeof Iterator === "function" && ["some", "find", "filter", "map", "toArray"].every(function (m) {
        return typeof Iterator.prototype[m] === "function";
      });
    }],
    ["URL.parse", function () { return typeof URL.parse === "function"; }],
    ["AbortSignal.any", function () { return typeof AbortSignal === "function" && typeof AbortSignal.any === "function"; }],
    ["ArrayBuffer.prototype.transferToFixedLength", function () {
      return typeof ArrayBuffer.prototype.transferToFixedLength === "function";
    }],
    ["Set.prototype.intersection", function () { return typeof Set.prototype.intersection === "function"; }],
    ["Array.prototype.toSpliced", function () {
      return typeof Array.prototype.toSpliced === "function" && typeof Array.prototype.findLast === "function";
    }],
    ["Worker", function () { return typeof Worker === "function"; }],
    ["IntersectionObserver", function () { return typeof IntersectionObserver === "function"; }]
  ];

  let _lib = null;
  let _import = null;
  const _ouvertes = new Set();

  function _t(k, p) { return window.I18n ? window.I18n.t(k, p) : k; }

  function apiManquantes() {
    return _API.filter(function (a) {
      try { return !a[1](); } catch (e) { return true; }
    }).map(function (a) { return a[0]; });
  }

  function disponible() { return apiManquantes().length === 0; }

  function _abs(chemin) { return new URL(chemin, document.baseURI).href; }

  function _chargerLib() {
    if (_lib) return Promise.resolve(_lib);
    if (!_import) {
      _import = import(_abs(URL_LIB)).then(function (m) {
        m.GlobalWorkerOptions.workerSrc = _abs(URL_WORKER);
        _lib = m;
        return m;
      }).catch(function (err) { _import = null; throw err; });
    }
    return _import;
  }

  function _bouton(action, icone, cle) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kta-vpdf-btn";
    b.setAttribute("data-vpdf", action);
    b.title = _t(cle);
    b.setAttribute("aria-label", _t(cle));
    b.innerHTML = window.ktaIcone ? window.ktaIcone(icone) : "";
    return b;
  }

  function _vider(canvas) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
    canvas.remove();
  }

  // ── Une visionneuse = un document ouvert dans un hôte ──────────────────────────────────────────
  function Visionneuse(hote, nom) {
    this.hote = hote;
    this.nom = nom || "document.pdf";
    this.detruite = false;
    this.tache = null;
    this.doc = null;
    this.tailles = [];
    this.feuilles = [];
    this.visibles = new Set();
    this.zoom = 1;
    this.gen = 0;
    this.enCours = false;
    this.plein = null;
    this.repere = null;
    this.pinch = null;
    this.ecouteurs = [];
    this._monter();
  }

  Visionneuse.prototype._ecouter = function (cible, type, fn, opts) {
    cible.addEventListener(type, fn, opts);
    this.ecouteurs.push([cible, type, fn, opts]);
  };

  Visionneuse.prototype._monter = function () {
    const self = this;
    const r = document.createElement("div");
    r.className = "kta-vpdf";
    r.setAttribute("role", "region");
    r.setAttribute("aria-label", _t("pdfvue.region", { name: this.nom }));
    const defil = document.createElement("div");
    defil.className = "kta-vpdf-defil";
    defil.tabIndex = 0;
    const pages = document.createElement("div");
    pages.className = "kta-vpdf-pages";
    defil.appendChild(pages);
    const barre = document.createElement("div");
    barre.className = "kta-vpdf-barre";
    const numero = document.createElement("span");
    numero.className = "kta-vpdf-numero";
    numero.setAttribute("aria-live", "polite");
    const taux = document.createElement("span");
    taux.className = "kta-vpdf-taux";
    barre.appendChild(numero);
    barre.appendChild(_bouton("moins", "minus", "pdfvue.zoomMoins"));
    barre.appendChild(taux);
    barre.appendChild(_bouton("plus", "plus", "pdfvue.zoomPlus"));
    barre.appendChild(_bouton("ajuster", "ratio", "pdfvue.ajuster"));
    barre.appendChild(_bouton("plein", "maximize", "pdfvue.pleinEcran"));
    const attente = document.createElement("div");
    attente.className = "kta-vpdf-attente";
    attente.textContent = _t("pdfvue.chargement");
    r.appendChild(defil);
    r.appendChild(barre);
    r.appendChild(attente);
    this.hote.appendChild(r);
    this.racine = r;
    this.defil = defil;
    this.pages = pages;
    this.barre = barre;
    this.numero = numero;
    this.taux = taux;
    this.attente = attente;

    this._ecouter(barre, "click", function (e) {
      const b = e.target.closest("[data-vpdf]");
      if (!b) return;
      const a = b.getAttribute("data-vpdf");
      if (a === "moins") self._zoomer(self.zoom / PAS_ZOOM);
      else if (a === "plus") self._zoomer(self.zoom * PAS_ZOOM);
      else if (a === "ajuster") self._zoomer(1);
      else if (a === "plein") self._basculerPlein();
    });
    let rafDefil = 0;
    this._ecouter(defil, "scroll", function () {
      if (rafDefil) return;
      rafDefil = requestAnimationFrame(function () { rafDefil = 0; self._majNumero(); });
    }, { passive: true });
    // Pincement : événements tactiles (un geste à deux doigts commencé en défilement natif reste à nous, ce que
    // les pointer events ne garantissent pas). touch-action: pan-x pan-y (CSS) retire le zoom de page au navigateur.
    this._ecouter(defil, "touchstart", function (e) { if (e.touches.length === 2) self._debutPinch(e); }, { passive: true });
    this._ecouter(defil, "touchmove", function (e) {
      if (!self.pinch || e.touches.length !== 2) return;
      e.preventDefault();
      self._suitePinch(e);
    }, { passive: false });
    const finPinch = function (e) { if (self.pinch && e.touches.length < 2) self._finPinch(); };
    this._ecouter(defil, "touchend", finPinch, { passive: true });
    this._ecouter(defil, "touchcancel", finPinch, { passive: true });
    // Safari : geste de zoom propriétaire, sinon la page entière zoome par-dessus la visionneuse.
    this._ecouter(defil, "gesturestart", function (e) { e.preventDefault(); }, { passive: false });
    this._ecouter(defil, "wheel", function (e) {
      if (!e.ctrlKey) return;   // pincement d'un pavé tactile ou Ctrl + molette
      e.preventDefault();
      self._zoomer(self.zoom * Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
    }, { passive: false });
    this._ecouter(document, "fullscreenchange", function () { self._surPleinNatif(); });
    this._ecouter(document, "webkitfullscreenchange", function () { self._surPleinNatif(); });
    // Échap ferme d'abord le plein écran de la page, pas la fenêtre qui porte la visionneuse.
    this._ecouter(document, "keydown", function (e) {
      if (e.key === "Escape" && self.plein === "page") {
        e.stopPropagation();
        e.preventDefault();
        self._quitterPlein();
      }
    }, true);
    this._ecouter(window, "resize", function () { self._mettreEnPage(); });
    this.observateur = new IntersectionObserver(function (entrees) { self._surIntersection(entrees); },
      { root: defil, rootMargin: "100% 0px" });
    this.garde = setInterval(function () {
      if (!self.hote.isConnected && self.plein !== "page") self.detruire();
    }, 3000);
  };

  Visionneuse.prototype.charger = function (blob) {
    const self = this;
    return Promise.all([
      _chargerLib(),
      blob.arrayBuffer(),
      typeof window._loadCssOnce === "function" ? window._loadCssOnce(CSS, "kta-css-visionneuse-pdf") : null
    ]).then(function (res) {
      if (self.detruite) throw self._annulee();
      const lib = res[0];
      self.tache = lib.getDocument({
        data: new Uint8Array(res[1]),
        standardFontDataUrl: _abs(URL_POLICES),
        wasmUrl: _abs(URL_DECODEURS),
        useWasm: false,
        enableXfa: false,
        stopAtErrors: false
      });
      return self.tache.promise;
    }).then(function (doc) {
      if (self.detruite) throw self._annulee();
      self.doc = doc;
      return doc.getPage(1);
    }).then(function (p1) {
      if (self.detruite) throw self._annulee();
      const vp = p1.getViewport({ scale: 1 });
      for (let i = 0; i < self.doc.numPages; i++) self.tailles.push({ w: vp.width, h: vp.height });
      self.racine.setAttribute("data-pages", String(self.doc.numPages));
      self._creerFeuilles();
      self._mettreEnPage();
      self.attente.remove();
      self._tailles(2);
      return self._premierRendu();
    });
  };

  Visionneuse.prototype._annulee = function () {
    const e = new Error("visionneuse fermée");
    e.name = "AbortError";
    return e;
  };

  // Résout au premier canvas peint : un document qui ne se rend pas fait échouer ouvrir(), donc le repli.
  Visionneuse.prototype._premierRendu = function () {
    const self = this;
    return new Promise(function (resolve, reject) {
      self._surPremier = { resolve: resolve, reject: reject };
      self._planifier();
    });
  };

  Visionneuse.prototype._creerFeuilles = function () {
    const n = this.tailles.length;
    for (let i = 1; i <= n; i++) {
      const f = document.createElement("div");
      f.className = "kta-vpdf-feuille";
      f.setAttribute("data-page", String(i));
      this.pages.appendChild(f);
      this.feuilles.push(f);
      this.observateur.observe(f);
    }
  };

  // Vraies dimensions des pages suivantes, en tâche de fond : le défilement ne saute pas sur un document mêlant
  // portrait et paysage. getPage ne rend rien.
  Visionneuse.prototype._tailles = function (i) {
    const self = this;
    if (this.detruite || !this.doc || i > this.doc.numPages) return;
    this.doc.getPage(i).then(function (p) {
      if (self.detruite) return;
      const vp = p.getViewport({ scale: 1 });
      const t = self.tailles[i - 1];
      if (Math.abs(t.w - vp.width) > 0.5 || Math.abs(t.h - vp.height) > 0.5) {
        self.tailles[i - 1] = { w: vp.width, h: vp.height };
        self._dimensionner(i);
      }
      self._tailles(i + 1);
    }).catch(function () { /* page illisible : elle garde la taille de la première */ });
  };

  Visionneuse.prototype._echelle = function () {
    const largeur = Math.max(120, this.defil.clientWidth - 2 * MARGE);
    return (largeur / (this.tailles[0] ? this.tailles[0].w : 600)) * this.zoom;
  };

  Visionneuse.prototype._dimensionner = function (i) {
    const t = this.tailles[i - 1];
    const f = this.feuilles[i - 1];
    if (!t || !f) return;
    const s = this.echelle;
    f.style.width = Math.round(t.w * s) + "px";
    f.style.height = Math.round(t.h * s) + "px";
  };

  // Toute nouvelle échelle invalide les rendus : les canvas restent affichés (étirés) jusqu'à leur remplacement.
  Visionneuse.prototype._mettreEnPage = function () {
    if (this.detruite || !this.feuilles.length) return;
    this.echelle = this._echelle();
    this.gen++;
    for (let i = 1; i <= this.feuilles.length; i++) this._dimensionner(i);
    this.taux.textContent = Math.round(this.zoom * 100) + " %";
    this.racine.setAttribute("data-zoom", String(Math.round(this.zoom * 100)));
    this._majNumero();
    this._planifier();
  };

  Visionneuse.prototype._zoomer = function (z, point) {
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    if (!this.feuilles.length || Math.abs(zoom - this.zoom) < 1e-3) return;
    const rd = this.defil.getBoundingClientRect();
    const px = point ? point.x : rd.left + rd.width / 2;
    const py = point ? point.y : rd.top + rd.height / 2;
    const avant = this.pages.getBoundingClientRect();
    const ox = px - avant.left;
    const oy = py - avant.top;
    const ratio = zoom / this.zoom;
    this.zoom = zoom;
    this._mettreEnPage();
    // Le point sous les doigts (ou le centre) reste en place.
    const apres = this.pages.getBoundingClientRect();
    this.defil.scrollLeft += apres.left + ox * ratio - px;
    this.defil.scrollTop += apres.top + oy * ratio - py;
  };

  Visionneuse.prototype._debutPinch = function (e) {
    const a = e.touches[0], b = e.touches[1];
    const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
    const rp = this.pages.getBoundingClientRect();
    this.pinch = { d0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, s: 1, x: mx, y: my };
    this.pages.style.transformOrigin = (mx - rp.left) + "px " + (my - rp.top) + "px";
  };

  // Pendant le geste : simple transformation CSS (aucun rendu) ; le rendu net vient au lâcher.
  Visionneuse.prototype._suitePinch = function (e) {
    const a = e.touches[0], b = e.touches[1];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const cible = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * d / this.pinch.d0));
    this.pinch.s = cible / this.zoom;
    this.pages.style.transform = "scale(" + this.pinch.s + ")";
  };

  Visionneuse.prototype._finPinch = function () {
    const p = this.pinch;
    this.pinch = null;
    this.pages.style.transform = "";
    this.pages.style.transformOrigin = "";
    this._zoomer(this.zoom * p.s, { x: p.x, y: p.y });
  };

  Visionneuse.prototype._majNumero = function () {
    if (!this.feuilles.length) return;
    const milieu = this.defil.scrollTop + this.defil.clientHeight / 2;
    let n = 1;
    for (let i = 0; i < this.feuilles.length; i++) {
      if (this.feuilles[i].offsetTop <= milieu) n = i + 1; else break;
    }
    this.page = n;
    this.numero.textContent = _t("pdfvue.page", { n: n, total: this.feuilles.length });
  };

  Visionneuse.prototype._surIntersection = function (entrees) {
    const self = this;
    entrees.forEach(function (en) {
      const i = Number.parseInt(en.target.getAttribute("data-page"), 10);
      if (en.isIntersecting) self.visibles.add(i);
      else {
        self.visibles.delete(i);
        self._liberePage(i);
      }
    });
    this._planifier();
  };

  Visionneuse.prototype._liberePage = function (i) {
    const f = this.feuilles[i - 1];
    if (!f) return;
    if (f._tache) { try { f._tache.cancel(); } catch (e) { /* déjà finie */ } f._tache = null; }
    _vider(f.querySelector("canvas"));
    f._gen = 0;
  };

  // Une page à la fois, la plus proche de la page courante d'abord : pas de pic de mémoire au défilement rapide.
  Visionneuse.prototype._planifier = function () {
    const self = this;
    if (this.detruite || this.enCours || !this.doc) return;
    const centre = this.page || 1;
    const aFaire = Array.from(this.visibles).filter(function (i) { return self.feuilles[i - 1]._gen !== self.gen; })
      .sort(function (a, b) { return Math.abs(a - centre) - Math.abs(b - centre); });
    if (!aFaire.length) return;
    this.enCours = true;
    this._rendre(aFaire[0]).catch(function (err) {
      if (err && err.name === "RenderingCancelledException") return;
      console.warn("[VisionneusePdf] rendu de page impossible :", err && err.message);
      if (self._surPremier) { self._surPremier.reject(err); self._surPremier = null; }
    }).then(function () {
      self.enCours = false;
      self._planifier();
    });
  };

  Visionneuse.prototype._rendre = function (i) {
    const self = this;
    const gen = this.gen;
    const f = this.feuilles[i - 1];
    return this.doc.getPage(i).then(function (page) {
      if (self.detruite || gen !== self.gen || !self.visibles.has(i)) return null;
      const vp1 = page.getViewport({ scale: 1 });
      const css = self.echelle;
      let s = css * (window.devicePixelRatio || 1);
      if (vp1.width * s * vp1.height * s > PIXELS_MAX) s = Math.sqrt(PIXELS_MAX / (vp1.width * vp1.height));
      const vp = page.getViewport({ scale: s });
      const canvas = document.createElement("canvas");
      canvas.className = "kta-vpdf-canvas";
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      const tache = page.render({ canvas: canvas, viewport: vp });
      f._tache = tache;
      return tache.promise.then(function () {
        f._tache = null;
        if (self.detruite || gen !== self.gen || !self.visibles.has(i)) { _vider(canvas); return null; }
        _vider(f.querySelector("canvas"));
        f.appendChild(canvas);
        f._gen = gen;
        if (self._surPremier) { self._surPremier.resolve(); self._surPremier = null; }
        return null;
      }, function (err) {
        f._tache = null;
        _vider(canvas);
        throw err;
      });
    });
  };

  // ── Plein écran : API du navigateur (PC, Android, iPad), sinon la visionneuse couvre la page (iPhone) ──────
  Visionneuse.prototype._basculerPlein = function () {
    const self = this;
    if (this.plein) { this._quitterPlein(); return; }
    const r = this.racine;
    const demande = r.requestFullscreen || r.webkitRequestFullscreen;
    const permis = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (demande && permis) {
      Promise.resolve().then(function () { return demande.call(r); }).catch(function () { self._pleinPage(); });
    } else {
      this._pleinPage();
    }
  };

  Visionneuse.prototype._pleinPage = function () {
    if (this.detruite || this.plein) return;
    this.repere = document.createComment("kta-vpdf");
    this.racine.parentNode.insertBefore(this.repere, this.racine);
    document.body.appendChild(this.racine);
    this.racine.classList.add("kta-vpdf-plein");
    this._etatPlein("page");
  };

  Visionneuse.prototype._quitterPlein = function () {
    if (this.plein === "natif") {
      const sortir = document.exitFullscreen || document.webkitExitFullscreen;
      if (sortir) { try { Promise.resolve(sortir.call(document)).catch(function () {}); } catch (e) { /* déjà sorti */ } }
      return;
    }
    if (this.plein !== "page") return;
    this.racine.classList.remove("kta-vpdf-plein");
    if (this.repere && this.repere.parentNode) {
      this.repere.parentNode.insertBefore(this.racine, this.repere);
      this.repere.remove();
      this.repere = null;
      this._etatPlein(null);
    } else {
      this.repere = null;
      this.detruire();   // l'hôte a disparu pendant le plein écran
    }
  };

  Visionneuse.prototype._surPleinNatif = function () {
    const el = document.fullscreenElement || document.webkitFullscreenElement;
    if (el === this.racine) this._etatPlein("natif");
    else if (this.plein === "natif") this._etatPlein(null);
  };

  Visionneuse.prototype._etatPlein = function (etat) {
    this.plein = etat;
    if (etat) this.racine.setAttribute("data-plein", etat); else this.racine.removeAttribute("data-plein");
    const b = this.barre.querySelector('[data-vpdf="plein"]');
    if (b) {
      const cle = etat ? "pdfvue.quitterPleinEcran" : "pdfvue.pleinEcran";
      b.title = _t(cle);
      b.setAttribute("aria-label", _t(cle));
      b.innerHTML = window.ktaIcone ? window.ktaIcone(etat ? "x" : "maximize") : "";
    }
    // La largeur change, donc l'échelle : on reste sur la page lue.
    const p = this.page;
    this._mettreEnPage();
    const f = p && this.feuilles[p - 1];
    if (f) this.defil.scrollTop = f.offsetTop - MARGE;
  };

  Visionneuse.prototype.detruire = function () {
    if (this.detruite) return;
    this.detruite = true;
    _ouvertes.delete(this);
    clearInterval(this.garde);
    if (this.plein === "natif") this._quitterPlein();
    if (this.observateur) this.observateur.disconnect();
    this.ecouteurs.forEach(function (e) { e[0].removeEventListener(e[1], e[2], e[3]); });
    this.ecouteurs = [];
    this.feuilles.forEach(function (f) {
      if (f._tache) { try { f._tache.cancel(); } catch (e) { /* déjà finie */ } }
      _vider(f.querySelector("canvas"));
    });
    this.feuilles = [];
    if (this.repere) { this.repere.remove(); this.repere = null; }
    this.racine.remove();
    // destroy() de la tâche détruit le document ET termine son worker.
    if (this.tache) { try { this.tache.destroy(); } catch (e) { /* déjà détruit */ } }
    this.tache = null;
    this.doc = null;
    if (this._surPremier) { this._surPremier.reject(this._annulee()); this._surPremier = null; }
  };

  // ── API publique ────────────────────────────────────────────────────────────────────────────────
  function ouvrir(hote, blob, opts) {
    if (!hote || !blob) return Promise.reject(new Error("hôte ou document absent"));
    if (!disponible()) return Promise.reject(new Error("API manquantes : " + apiManquantes().join(", ")));
    liberer(hote);
    const v = new Visionneuse(hote, opts && opts.nom);
    _ouvertes.add(v);
    return v.charger(blob).catch(function (err) {
      v.detruire();
      throw err;
    });
  }

  function liberer(racine) {
    Array.from(_ouvertes).forEach(function (v) {
      if (!racine || racine === v.hote || racine.contains(v.hote)) v.detruire();
    });
  }

  function _etat() {
    let canvas = 0;
    _ouvertes.forEach(function (v) { canvas += v.racine.querySelectorAll("canvas").length; });
    return { ouvertes: _ouvertes.size, canvas: canvas, libChargee: !!_lib };
  }

  window.KtaVisionneusePdf = {
    disponible: disponible,
    apiManquantes: apiManquantes,
    ouvrir: ouvrir,
    liberer: liberer,
    _etat: _etat
  };
})();
