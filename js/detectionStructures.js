/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// detectionStructures.js — « Détecter » piliers et fronts sur une image : exemples à la pipette, cadre (deux coins)
// ou tout le plan, calcul par js/ktaDetection.js (worker), aperçu superposé, « Valider ». Ouvert depuis l'outil
// Structures et l'📊 Éditeur de données (un seul parcours, décision produit). Mode « Remplir au clic » : chaque
// toucher remplit la zone fermée par le trait (ktaDetection.js > remplir) ou, pour un type en ligne (front), suit le
// trait touché jusqu'à ses bouts ou au premier carrefour (ktaDetection.js > suivreTrait) ; aperçu cumulé, même
// « Valider » ; un toucher sur une forme ou un front, Ctrl+Z ou « Retirer le dernier » le retire.
// ⚠️ contrat : tout ce qui touche au plan passe par un CONTEXTE (ouvrir(ctx) ; absent = contextePlan(), le plan
//   ouvert) — sa forme : au-dessus de contextePlan.
// ⚠️ contrat (décision produit) : rien n'est écrit avant « Valider » ; en mode plan, UNE étape ⏪ pour tout annuler
//   (détection comme remplissage : _poserEtFermer, un seul ctx.poser).
//   Niveau de chaque structure : structures.js > ktaNiveauNouvelleStructure (même règle que le tracé à la main).
// ⚠️ contrat : couleurs retenues par plan sur l'appareil (PREFIXE + ctx.cle), jamais dans la session ni dans l'export
//   du profil (profileExportImport.js les exclut) ; retirées avec le plan (planRegistry.js > purgeAssociatedData).
// 🩸 Mode plan : image lue par tiling.js > ktaDessinerRegionPlan (calques affichés du niveau actif, tuiles V2, fond)
//   en pixels du plan ; la vue est redressée et sa rotation bloquée pendant le parcours (MapBearing.suspend).
// ⚠️ contrat (décision produit) : un niveau ≠ 0 sans image affichée (`raison` du dessin) est refusé, pipette comme
//   calcul (_lireBloc lève REFUS) ; jamais l'image du niveau 0 à sa place.
// Écarte ce qui recouvre déjà une structure du même niveau : relancer ne double rien. Réglages déduits des exemples ;
// trois curseurs (tolérance, tailles minimale et maximale) recalculent sur les blocs déjà lus. Case « Affiner les
// contours » (_affinerActif) : lissage et redressement des formes presque rectangles, Remplir comme détection.
// Expose : window.KtaDetectionUI = { ouvrir(ctx?, { cible }?), fermer, etat, contextePlan, PREFIXE }.
// Fenêtre « Détecter les galeries » (ouvrir(ctx, { cible: "traces" }) : outil Tracés, Éditeur de données,
//   Générateur) : même parcours, rien que la galerie, et des TRACÉS en sortie (section « Galeries » plus bas).
// Garde-fous : scripts/smoke/checkup-detection.js, checkup-detection-emprise.js, checkup-galeries.js,
//   checkup-remplir-front.js, scripts/check-detection.js · Doc : plans-loader.md (Détecter).

window.KtaDetectionUI = (function () {
  "use strict";

  const PREFIXE = "myktamap_detect_couleurs_v1_";
  // Case « Affiner les contours » : retenue sur l'appareil, pour tous les plans ("0" = décochée ; absente = cochée).
  const CLE_AFFINER = "myktamap_detect_affiner_v1";
  const MAX_EXEMPLES = 6;
  const FENETRE_EXEMPLE = [192, 640];  // px plan lus autour d'un toucher de pipette (puis plus grand si coupé)
  const RECALCUL_MS = 200;
  const MODE_CLIC = "detection";       // nom au registre des modes clic-carte (interface.js > ktaInscrireModeClic)             // curseur relâché : recalcul après ce délai sans autre mouvement
  // plafond de la taille maximale : la marge des blocs (au-delà, une masse est « trop grande pour un bloc »)
  const TOL_CURSEUR = [6, 60];   // bornes du curseur de tolérance (6 = plancher du moteur, reglagesDepuisExemples)
  const TAILLE_MAX_PLAFOND = window.KtaDetection ? window.KtaDetection.REGLAGES.marge : 256;
  const SURFACE_PLEINE = 4096 * 4096;   // au-delà, « Tout le plan » se calcule à mi-résolution
  // Masse A, masse B (piliers), front (trait) ; types proposés dans l'aperçu et type par défaut.
  const CLASSES = ["a", "b", "f"];
  const CLASSES_RETENUES = ["a", "b", "f", "g"];   // g : couleur de galerie (fenêtre « Détecter les galeries »)
  const TYPES = { a: ["pilier-1", "pilier-2"], b: ["pilier-1", "pilier-2"], f: ["front-1", "front-2"] };
  const DEFAUT = { a: "pilier-1", b: "pilier-2", f: "front-1" };
  const ECART_TRAIT = 3;                // px : un front détecté à moins de cet écart d'un front existant est déjà là
  const REFUS = "KtaDetectionRefus";    // nom de l'erreur levée par _lireBloc quand le contexte refuse de dessiner
  // Remplir au clic : fenêtre lue autour du toucher (px plan), puis la grande si la zone en touche le bord.
  // Plafond : ktaDetection.js > plafondRemplir (80 m de côté sur un plan à échelle connue, sinon un carré relatif à
  //   l'image, 1 024 px au moins). La grande fenêtre (4 × la marge des blocs, ou deux fois le côté du plafond + 64)
  //   laisse une zone au plafond loin de son bord ; au-delà de FENETRE_REMPLIR_MAX px, elle est lue à résolution
  //   réduite (mémoire du téléphone : jamais plus de FENETRE_REMPLIR_MAX² px lus).
  const MARGE = window.KtaDetection ? window.KtaDetection.REGLAGES.marge : 256;
  const FENETRE_REMPLIR_MAX = 4096;
  const TOUCHE_RETIRER_PX = 14;   // Remplir, galeries : rayon d'écran minimal autour d'un axe pour retirer au toucher
  const FENETRES_FRONT = [512, 2048, 4096];   // Remplir sur un front : fenêtres lues (px plan) tant qu'un bout touche le bord

  const _t = function (k, v) { return window.I18n.t(k, v); };
  const _esc = function (s) { return window.ktaEsc(s); };
  const _toast = function (msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type);
  };
  let _e = null;   // parcours ouvert : { ctx, etape, couleurs, pipette, coins, couche, bandeau, apercu, ctrl }
  let _inscrit = false;   // visée inscrite au registre des modes clic-carte (_majModeClic)

  // ── Contexte du plan ouvert (session, carte du plan, image par tiling.js) ──
  // Forme d'un contexte : { carte (L.Map, CRS.Simple), largeur, hauteur (px de l'image lue), versCarte(x, y) → LatLng,
  //   depuisCarte(latlng) → { x, y }, dessiner(ctx2d, region, echelle) → Promise<{ ok, raison? }> (raison : refus,
  //   clé detect.refus.<raison>), multi, niveau(type) →
  //   entier | null, existantes() → [{ type, points, level }], pxParM() → nombre | null, cle (couleurs retenues),
  //   poser(structures) → nombre de masquées, refuse() → bool, entrer(), sortir(), parent (reçoit le bandeau),
  //   hotes? (fenêtres sous le parcours, ignorées par l'Échap), messagePoses?(n) (texte après « Valider »),
  //   emprise?() → { x0, y0, x1, y1 } (px plan lus, bornes négatives possibles ; absent = [0, largeur] × [0, hauteur]) }.
  // ⚠️ contrat : l'emprise borne Remplir, « Tout le plan » et detecter (limites, bords du plan) ; elle est relue à
  //   chaque geste (niveau changé, calque masqué). 🩸 Niveau ≠ 0 : le calque peut déborder de l'image principale ;
  //   borné à l'image, un pilier à cheval sur son bord sortait rogné net et le débord était refusé (« hors image »).
  function contextePlan() {
    const C = window.APP_CONFIG;
    if (!window.map || !C || typeof window.ktaDessinerRegionPlan !== "function") return null;
    const multi = C.multiLevel === true;
    return {
      carte: window.map, largeur: C.imageWidth, hauteur: C.imageHeight, multi: multi,
      // niveau ≠ 0 : union des calques affichés du niveau actif ; niveau 0 : l'image (ses calques ne sont pas lus)
      emprise: function () {
        const n = multi ? (C.activeLevel || 0) : 0;
        const c = n !== 0 && typeof window.ktaEmpriseCalques === "function"
          ? window.ktaEmpriseCalques(n, { affiches: true }) : null;
        if (!c) return { x0: 0, y0: 0, x1: C.imageWidth, y1: C.imageHeight };
        return { x0: Math.floor(c.x0), y0: Math.floor(c.y0), x1: Math.ceil(c.x1), y1: Math.ceil(c.y1) };
      },
      cle: window._currentLoadedPlanId || "default", parent: document.body,
      versCarte: function (x, y) { return window.convertCoord(x, y); },
      depuisCarte: function (ll) { return { x: ll.lng, y: C.imageHeight - ll.lat }; },
      // calques du niveau actif, tuilés ou non
      dessiner: function (k, region, echelle) {
        return window.ktaDessinerRegionPlan(k, region, echelle, { niveau: multi ? (C.activeLevel || 0) : 0 });
      },
      niveau: function (type) { return window.ktaNiveauNouvelleStructure(type); },
      existantes: function () {
        return (typeof window.getStructures === "function" ? window.getStructures() : [])
          .concat(window._ktaDataStructurePolygons || []);
      },
      pxParM: function () {
        const tr = window.PLAN_CONFIG && window.PLAN_CONFIG.tracking;   // échelle écrite dans le plan seulement
        return tr && Number(tr.scale) > 0 ? Number(tr.scale) : null;
      },
      refuse: function () {
        return typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee();   // 🔒 lecture seule
      },
      entrer: function () {
        if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
        if (typeof window.ktaFermerOutils === "function") window.ktaFermerOutils();
        const B = window.MapBearing;
        if (B && typeof B.suspend === "function") B.suspend("detection");
      },
      sortir: function () {
        if (window.MapBearing && typeof window.MapBearing.resume === "function") window.MapBearing.resume("detection");
      },
      poser: _poserSession,
      // Galeries : tracés de session et des calques (masqués compris, sans copie de calque en modification)
      niveauTrace: function () { return multi ? (C.activeLevel || 0) : null; },
      tracesExistants: function () {
        const s = typeof window.getRoads === "function" ? window.getRoads() : [];
        return s.concat(typeof window.getAllEmbeddedRoads === "function" ? window.getAllEmbeddedRoads() : []);
      },
      poserTraces: _poserTracesSession
    };
  }
  // Une étape d'historique, puis la session. Rend le nombre de structures posées mais masquées (filtres, niveau).
  function _poserSession(poses) {
    const avant = window.HistoryManager ? window.HistoryManager.captureState("structures") : null;
    window.setStructures(window.getStructures().concat(poses));
    if (window.HistoryManager && avant) {
      window.HistoryManager.record(_t("detect.historique", { n: poses.length }), avant, "structures");
    }
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") window.SessionPersist.save();
    // 🩸 Les filtres de niveau et de type passent l'opacité à 0 sans retirer la couche : la couche sur la carte ne
    //   suffit pas, il faut son opacité et les niveaux affichés.
    const C = window.APP_CONFIG, multi = C.multiLevel === true;
    const vis = Array.isArray(C.visibleLevels) ? C.visibleLevels : [C.activeLevel || 0];
    return poses.filter(function (s) {
      if (multi && vis.indexOf(Number.isInteger(s.level) ? s.level : 0) < 0) return true;
      const f = typeof window.ktaFicheObjetDe === "function" ? window.ktaFicheObjetDe(s) : null;
      const op = f && f.layer && f.layer._map ? f.layer.options : null;
      return !!f && !(op && ((op.opacity === undefined ? 1 : op.opacity) > 0 || op.fillOpacity > 0));
    }).length;
  }

  // Tracés détectés : une étape d'historique (roads), puis la session. Rend le nombre de tracés posés sur un niveau
  // non affiché.
  function _poserTracesSession(poses) {
    const avant = window.HistoryManager ? window.HistoryManager.captureState("roads") : null;
    window.setRoads(window.getRoads().concat(poses));
    if (window.HistoryManager && avant) {
      window.HistoryManager.record(_t("detect.galeries.historique", { n: poses.length }), avant, "roads");
    }
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") window.SessionPersist.save();
    const C = window.APP_CONFIG;
    if (C.multiLevel !== true) return 0;
    const vis = Array.isArray(C.visibleLevels) ? C.visibleLevels : [C.activeLevel || 0];
    return poses.filter(function (r) { return vis.indexOf(Number.isInteger(r.level) ? r.level : 0) < 0; }).length;
  }

  // ── Couleurs par plan (appareil) ──
  function _planId() { return _e ? _e.ctx.cle : "default"; }
  function _lireCouleurs() {
    try {
      const o = JSON.parse(localStorage.getItem(PREFIXE + _planId()) || "null");
      const out = { a: [], b: [], f: [], g: [], curseurs: null };
      CLASSES_RETENUES.forEach(function (c) {
        if (o && Array.isArray(o[c])) {
          // ancien format : [r, g, b] seul (sans mesure de taille)
          out[c] = o[c].map(function (q) { return Array.isArray(q) ? { rgb: q } : q; })
            .filter(function (q) { return q && Array.isArray(q.rgb) && q.rgb.length === 3; }).slice(-MAX_EXEMPLES);
        }
      });
      if (o && o.curseurs && o.curseurs.tolerance > 0 && o.curseurs.taille > 0) {
        out.curseurs = { tolerance: Number(o.curseurs.tolerance), taille: Number(o.curseurs.taille),
                         tailleMax: Number(o.curseurs.tailleMax) > 0 ? Number(o.curseurs.tailleMax) : null };
      }
      return out;
    } catch (err) { return { a: [], b: [], f: [], g: [], curseurs: null }; }
  }
  function _ecrireCouleurs(c) {
    try {
      const vide = !CLASSES_RETENUES.some(function (k) { return c[k] && c[k].length > 0; });
      if (vide) localStorage.removeItem(PREFIXE + _planId());
      else {
        localStorage.setItem(PREFIXE + _planId(),
          JSON.stringify({ a: c.a, b: c.b, f: c.f, g: c.g, curseurs: c.curseurs }));
      }
    } catch (err) { console.warn("[Detection] couleurs non retenues :", err && err.name); }
  }

  // Classes de la fenêtre ouverte : galerie seule, ou masses et front.
  function _classesActives() { return _galeries() ? ["g"] : CLASSES; }
  function _aDesExemples(c) { return _classesActives().some(function (k) { return c[k].length > 0; }); }

  // ── Affiner les contours (ktaDetection.js > _affiner) ──
  // ⚠️ contrat (décision produit) : cochée par défaut ; s'applique à Remplir au clic et à la détection (recalcul de
  //   l'aperçu quand on la change) ; ce qui est déjà dans l'aperçu de Remplir reste tel quel.
  function _affinerActif() {
    try { return localStorage.getItem(CLE_AFFINER) !== "0"; } catch (err) { return true; }
  }
  function _ecrireAffiner(actif) {
    try { localStorage.setItem(CLE_AFFINER, actif ? "1" : "0"); } catch (err) {
      console.warn("[Detection] case Affiner non retenue :", err && err.name);
    }
  }
  // Tolérance du lissage pour le plan (px du plan), 0 = case décochée.
  function _toleranceAffiner() {
    return _affinerActif() ? window.KtaDetection.toleranceAffinage(_e.ctx.pxParM ? _e.ctx.pxParM() : null) : 0;
  }
  function _caseAffiner() {
    return '<label class="kta-detect-type" title="' + _esc(_t("detect.affiner.aide")) + '">' +
      '<input type="checkbox" data-detect-affiner' + (_affinerActif() ? " checked" : "") + "> " +
      _esc(_t("detect.affiner")) + "</label>";
  }

  // ── Lecture de l'image ──
  async function _lireBloc(x, y, w, h, e) {
    if (_e) _e.lectures++;
    const bw = Math.max(1, Math.round(w * e)), bh = Math.max(1, Math.round(h * e));
    const cv = document.createElement("canvas");
    cv.width = bw; cv.height = bh;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";   // fond d'image (hors charte : jamais affiché, seulement lu)
    ctx.fillRect(0, 0, bw, bh);
    if (!_e) {   // parcours fermé pendant une lecture (le calcul est déjà annulé)
      const fini = new Error("parcours fermé");
      fini.name = "AbortError";
      throw fini;
    }
    const r = await _e.ctx.dessiner(ctx, { x: x, y: y, w: w, h: h }, e);
    if (r && r.raison) throw Object.assign(new Error(r.raison), { name: REFUS, raison: r.raison });
    const d = ctx.getImageData(0, 0, bw, bh);
    // `dessine` : une image a été posée (faux : zone sans image chargée, la fenêtre reste au blanc de fond)
    return { data: d.data, w: bw, h: bh, dessine: !!(r && r.ok) };
  }
  // Exemple sous un point du plan : couleur, taille et étalement de la composante touchée (ktaDetection.js >
  // mesurerExemple), lus dans une fenêtre autour du doigt, agrandie une fois si la composante la dépasse.
  async function _exempleEn(x, y, nature) {
    let m = null;
    for (let k = 0; k < FENETRE_EXEMPLE.length; k++) {
      const n = FENETRE_EXEMPLE[k], x0 = Math.floor(x - n / 2), y0 = Math.floor(y - n / 2);
      const b = await _lireBloc(x0, y0, n, n, 1);
      // 🩸 Rien de dessiné (plan V1 : zone jamais affichée) : la fenêtre blanche passerait pour du « fond »
      if (!b.dessine) return null;
      m = window.KtaDetection.mesurerExemple(b, x - x0, y - y0, { nature: nature });
      // composante coupée par la fenêtre, ou fenêtre remplie par l'objet (son bord passe pour le fond) : plus grand
      if (!m || !(m.coupe || m.fond)) break;
    }
    return m;
  }

  // ── Doublons : recouvre une structure existante du même niveau ? ──
  function _dedans(p, pts) {
    let d = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) d = !d;
    }
    return d;
  }
  function _centre(pts) {
    let x = 0, y = 0;
    pts.forEach(function (p) { x += p.x; y += p.y; });
    return { x: x / pts.length, y: y / pts.length };
  }
  function _autreNiveau(s, niveau) {
    return _e.ctx.multi && niveau !== null && (Number.isInteger(s.level) ? s.level : 0) !== niveau;
  }
  function _existantes(niveau) {
    const out = [];
    _e.ctx.existantes().forEach(function (s) {
      if (!s || !Array.isArray(s.points) || s.points.length < 3 || _autreNiveau(s, niveau)) return;
      out.push({ points: s.points, c: _centre(s.points) });
    });
    return out;
  }
  // Fronts existants du même niveau (polylignes, session et calques) ; un front détecté est « déjà là » si ses
  // sommets et milieux de segments sont TOUS à moins d'ECART_TRAIT d'un même front existant.
  function _distSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function _existantsTraits(niveau) {
    const ligne = function (t) {
      return typeof window.isStructurePolylineType === "function" && window.isStructurePolylineType(t);
    };
    return _e.ctx.existantes().filter(function (s) {
      return s && ligne(s.type) && Array.isArray(s.points) && s.points.length >= 2 && !_autreNiveau(s, niveau);
    });
  }
  function _traitDejaPresent(m, existants) {
    const pts = [];
    m.points.forEach(function (p, i) {
      pts.push(p);
      if (i) pts.push({ x: (p.x + m.points[i - 1].x) / 2, y: (p.y + m.points[i - 1].y) / 2 });
    });
    return existants.some(function (s) {
      return pts.every(function (p) {
        for (let i = 1; i < s.points.length; i++) {
          if (_distSeg(p, s.points[i - 1], s.points[i]) <= ECART_TRAIT) return true;
        }
        return false;
      });
    });
  }
  function _dejaPresente(m, existantes) {
    const c = _centre(m.points);
    return existantes.some(function (s) { return _dedans(c, s.points) || _dedans(s.c, m.points); });
  }

  // ── Calque d'aperçu (son pane, hors registres des structures) ──
  // 🩸 Renderer SVG propre : la carte est en canvas (preferCanvas), où className ne fait rien et aucun élément ne
  //   reçoit le toucher ; l'aperçu doit être touchable objet par objet et stylé par la feuille de style.
  function _couche() {
    const map = _e.ctx.carte;
    if (!map.getPane("ktaDetection")) {
      const p = map.createPane("ktaDetection");
      p.style.zIndex = "650";
    }
    if (!_e.rendu) _e.rendu = L.svg({ pane: "ktaDetection", padding: 0.5 });
    if (!_e.couche) _e.couche = L.layerGroup().addTo(map);
    return _e.couche;
  }
  function _viderCouche() { if (_e && _e.couche) _e.couche.clearLayers(); }
  function _dessinerCadre() {
    _viderCouche();
    if (_e.coins.length !== 1) return;
    const p = _e.coins[0];
    const c = _couche();
    L.circleMarker(_e.ctx.versCarte(p.x, p.y), { pane: "ktaDetection", renderer: _e.rendu, radius: 6,
      className: "kta-detect-coin", interactive: false }).addTo(c);
  }
  // 🩸 Non interactif : en Remplir, la visée (body.kta-detect-pick-mode) arme map.js > _ktaPickCaptureClick, qui avale
  //   le clic en capture et le ré-émet à la carte ; un écouteur posé sur la forme ne reçoit jamais rien. Le toucher
  //   sur une forme est reconnu par _onClic (_retirerAuToucher), sur la carte du plan comme dans le Générateur.
  function _dessinerRemplis() {
    _viderCouche();
    const c = _couche();
    _e.remplis.forEach(function (z) {
      if (!z.lignes) {
        L.polygon(z.points.map(function (p) { return _e.ctx.versCarte(p.x, p.y); }), {
          pane: "ktaDetection", renderer: _e.rendu, interactive: false,
          className: "kta-detect-apercu kta-detect-rempli" }).addTo(c);
        return;
      }
      z.lignes.forEach(function (l) {   // front suivi : trait, et un rond à chaque bout raccordé à un front
        const ll = l.points.map(function (p) { return _e.ctx.versCarte(p.x, p.y); });
        L.polyline(ll, { pane: "ktaDetection", renderer: _e.rendu, interactive: false, weight: 6,
          className: "kta-detect-apercu kta-detect-rempli kta-detect-trait" }).addTo(c);
        [0, 1].forEach(function (k) {
          if (!l.accroches || !l.accroches[k]) return;
          L.circleMarker(ll[k ? ll.length - 1 : 0], { pane: "ktaDetection", renderer: _e.rendu, radius: 5,
            interactive: false, className: "kta-detect-accroche" }).addTo(c);
        });
      });
    });
  }
  function _dessinerApercu() {
    _viderCouche();
    const a = _e.apercu, c = _couche();
    a.objets.forEach(function (m, i) {
      const ll = m.points.map(function (p) { return _e.ctx.versCarte(p.x, p.y); });
      const opts = { pane: "ktaDetection", renderer: _e.rendu, bubblingMouseEvents: false,
        className: "kta-detect-apercu kta-detect-classe-" + m.classe + (m.trait ? " kta-detect-trait" : "") +
          (a.retires.has(i) ? " kta-detect-retire" : "") };
      const pol = m.trait ? L.polyline(ll, Object.assign({ weight: 6 }, opts)) : L.polygon(ll, opts);
      pol.on("click", function () {
        if (a.retires.has(i)) a.retires.delete(i); else a.retires.add(i);
        _dessinerApercu();
        _majBandeau();
      });
      pol.addTo(c);
    });
  }

  // ── Bandeau ──
  function _btn(act, cle, cls, vars) {
    return '<button type="button" class="kta-btn ' + (cls || "kta-btn-ghost") + '" data-detect="' + act + '">' +
      _esc(_t(cle, vars)) + "</button>";
  }
  function _pastilles(c) {
    return _e.couleurs[c].map(function (q) {
      return '<span class="kta-detect-pastille" data-rgb="' + q.rgb.join(",") + '"></span>';
    }).join("");
  }
  function _majBandeau() {
    const b = _e.bandeau;
    if (!b) return;
    let html = "";
    if (_galeries() && ["exemples", "remplir", "apercu"].indexOf(_e.etape) >= 0) {
      html = _bandeauGaleries();
    } else if (_e.etape === "exemples") {
      html = '<span class="kta-racc-info">' + _esc(_t(_e.pipette ? "detect.pipette.toucher" : "detect.exemples.aide")) +
        "</span>" + '<div class="kta-racc-actions">' +
        CLASSES.map(function (c) {
          return '<button type="button" class="kta-btn ' + (_e.pipette === c ? "kta-btn-primary" : "kta-btn-ghost") +
            '" data-detect="pipette-' + c + '">' + _esc(_t("detect.classe." + c, { n: _e.couleurs[c].length })) +
            " " + _pastilles(c) + "</button>";
        }).join("") +
        _caseAffiner() + _btn("effacer", "detect.exemples.effacer") +
        _btn("zone", "detect.exemples.suivant", "kta-btn-primary") +
        '<button type="button" class="kta-btn kta-btn-ghost" data-detect="remplir">' +
        window.ktaIcone("paint-bucket") + " " + _esc(_t("detect.remplir.bouton")) + "</button>" +
        _btn("fermer", "detect.fermer") + "</div>";
    } else if (_e.etape === "remplir") {
      const gardes = _nbStructuresRemplies(), types = _typesRemplir();
      const groupe = function (ligne) {
        return '<optgroup label="' + _esc(_t(ligne ? "detect.remplir.groupe.ligne" : "detect.remplir.groupe.ferme")) +
          '">' + types.filter(function (ty) { return ty.ligne === ligne; }).map(function (ty) {
          return '<option value="' + _esc(ty.id) + '"' + (_e.typeRemplir === ty.id ? " selected" : "") + ">" +
            _esc(ty.libelle) + "</option>";
        }).join("") + "</optgroup>";
      };
      html = '<span class="kta-racc-info">' +
        _esc(_t(_estLigne(_e.typeRemplir) ? "detect.remplir.aideTrait" : "detect.remplir.aide", { n: gardes })) +
        "</span>" + _aideRetirer() + _htmlPause() + '<div class="kta-racc-actions">' + _btnRetirerDernier() +
        '<label class="kta-detect-type">' + _esc(_t("detect.remplir.type")) +
        ' <select data-detect-remplir-type>' + groupe(false) + groupe(true) + "</select></label>" + _caseAffiner() +
        _btn("valider-remplir", "detect.valider", "kta-btn-primary", { n: gardes }) +
        _btn("exemples", "detect.retour") + _btn("fermer", "detect.fermer") + "</div>";
    } else if (_e.etape === "zone") {
      html = '<span class="kta-racc-info">' + _esc(_t(_e.coins.length ? "detect.zone.second" : "detect.zone.aide")) +
        "</span>" + _htmlPause() + '<div class="kta-racc-actions">' + _btn("tout", "detect.zone.tout", "kta-btn-primary") +
        _btn("exemples", "detect.retour") + _btn("fermer", "detect.fermer") + "</div>";
    } else if (_e.etape === "calcul") {
      html = '<span class="kta-racc-info">' + _esc(_t("detect.calcul", { i: _e.progres[0], n: _e.progres[1] })) +
        "</span>" + '<div class="kta-racc-actions">' + _btn("annuler", "detect.annuler") + "</div>";
    } else if (_e.etape === "apercu") {
      const a = _e.apercu, gardes = a.objets.length - a.retires.size;
      const sel = function (c) {
        return '<label class="kta-detect-type">' + _esc(_t("detect.classe.court." + c)) +
          ' <select data-detect-type="' + c + '">' + TYPES[c].map(function (ty) {
            return '<option value="' + ty + '"' + (a.types[c] === ty ? " selected" : "") + ">" +
              _esc(_t("struct.label." + ty)) + "</option>";
          }).join("") + "</select></label>";
      };
      const cur = function (nom, min, max) {
        return '<label class="kta-detect-curseur">' + _esc(_t("detect.curseur." + nom)) +
          ' <input type="range" data-detect-curseur="' + nom + '" min="' + min + '" max="' + max +
          '" step="1" value="' +
          _e.curseurs[nom] + '"> <span class="kta-detect-valeur">' + _e.curseurs[nom] + "</span></label>";
      };
      html = '<span class="kta-racc-info">' + _esc(_bilan()) + "</span>" +
        '<div class="kta-racc-actions">' + cur("tolerance", TOL_CURSEUR[0], TOL_CURSEUR[1]) + cur("taille", 2, 80) +
        cur("tailleMax", 4, TAILLE_MAX_PLAFOND) + _caseAffiner() + "</div>" +
        '<div class="kta-racc-actions">' +
        CLASSES.filter(function (c) { return _e.couleurs[c].length; }).map(sel).join("") +
        _btn("valider", "detect.valider", "kta-btn-primary", { n: gardes }) + _btn("zone", "detect.recommencer") +
        _btn("fermer", "detect.fermer") + "</div>";
    }
    b.innerHTML = html;
    b.querySelectorAll(".kta-detect-pastille").forEach(function (s) {
      s.style.backgroundColor = "rgb(" + s.getAttribute("data-rgb") + ")";   // couleur lue sur le plan, hors charte
    });
    const valider = b.querySelector('[data-detect="valider"]');
    if (valider && _e.apercu) valider.disabled = _e.apercu.objets.length - _e.apercu.retires.size === 0;
    const validerR = b.querySelector('[data-detect="valider-remplir"]');
    if (validerR) validerR.disabled = _nbStructuresRemplies() === 0;
    const validerG = b.querySelector('[data-detect="valider-galeries"]');
    if (validerG) validerG.disabled = _gardesGaleries() === 0;
    const retirer = b.querySelector('[data-detect="retirer-dernier"]');
    if (retirer) retirer.disabled = _nbRemplissages() === 0;
    if (_galeries()) {
      const titre = document.createElement("span");
      titre.className = "kta-detect-titre";
      titre.innerHTML = window.ktaIcone("search") + " " + _esc(_t("detect.galeries.titre"));
      b.insertBefore(titre, b.firstChild);
    }
    _majCurseur();
  }

  function _bilan() {
    const a = _e.apercu;
    return _t("detect.apercu.bilan", { n: a.objets.length, d: a.deja, m: a.ecartees, g: a.tropGrands }) + " " +
      _t("detect.apercu.aide");
  }
  // Après un recalcul : seuls le bilan et « Ajouter » changent (refaire le bandeau lâcherait le curseur tenu).
  function _majBilan() {
    const b = _e && _e.bandeau, a = _e && _e.apercu;
    if (!b || !a) return;
    const info = b.querySelector(".kta-racc-info"), valider = b.querySelector('[data-detect="valider"]');
    if (info) info.textContent = _bilan();
    if (valider) {
      valider.textContent = _t("detect.valider", { n: a.objets.length - a.retires.size });
      valider.disabled = a.objets.length - a.retires.size === 0;
    }
  }

  function _onBandeau(ev) {
    const el = ev.target.closest && ev.target.closest("[data-detect]");
    if (!el || !_e) return;
    const act = el.getAttribute("data-detect");
    if (act === "fermer") { fermer(); return; }
    if (["reprendre", "zone", "remplir", "exemples", "tout"].indexOf(act) >= 0 || act.indexOf("pipette-") === 0) {
      _e.pause = false;
    }
    if (act === "reprendre") {
      // rien d'autre : _majBandeau relance la visée, qui désarme l'outil (_majModeClic)
    } else if (act.indexOf("pipette-") === 0) {
      const c = act.slice(8);
      _e.pipette = _e.pipette === c ? null : c;
    } else if (act === "effacer") {
      _classesActives().forEach(function (c) { _e.couleurs[c] = []; });
      if (!_galeries()) _e.couleurs.curseurs = null;
      _ecrireCouleurs(_e.couleurs); _e.pipette = null;
    } else if (act === "zone") {
      if (!_aDesExemples(_e.couleurs)) { _toast(_t("detect.toast.sansExemple"), "warn"); return; }
      _e.pipette = null; _e.etape = "zone"; _e.coins = []; _e.apercu = null; _viderCouche(); _lacherExecuteur();
    } else if (act === "remplir") {
      _e.pipette = null; _e.etape = "remplir"; _e.coins = []; _e.apercu = null; _e.remplis = [];
      _choisirTypeRemplir(_typeRemplirInitial());
      _e.axes = []; _e.remplisG = [];
      _viderCouche(); _lacherExecuteur();
    } else if (act === "valider-remplir") {
      _validerRemplis(); return;
    } else if (act === "retirer-dernier") {
      _retirerDernier(); return;
    } else if (act === "valider-galeries") {
      _validerGaleries(); return;
    } else if (act === "exemples") {
      _e.etape = "exemples"; _e.coins = []; _e.remplis = []; _viderCouche();
      if (_galeries()) { _e.axes = []; _e.remplisG = []; _e.apercu = null; }
    } else if (act === "tout") {
      _toutLePlan(); return;
    } else if (act === "annuler") {
      if (_e.ctrl) _e.ctrl.abort();
      return;
    } else if (act === "valider") {
      _valider(); return;
    }
    _majBandeau();
  }
  // Curseurs : valeur affichée tout de suite, recalcul sur les blocs déjà lus après RECALCUL_MS sans mouvement.
  function _onCurseur(ev) {
    const g = ev.target.closest && ev.target.closest("[data-detect-galerie-curseur]");
    if (g && _e) { _onCurseurGalerie(g); return; }
    const el = ev.target.closest && ev.target.closest("[data-detect-curseur]");
    if (!el || !_e || !_e.apercu) return;
    const nom = el.getAttribute("data-detect-curseur");
    _e.curseurs[nom] = Number(el.value);
    const v = el.parentNode && el.parentNode.querySelector(".kta-detect-valeur");
    if (v) v.textContent = el.value;
    _e.couleurs.curseurs = { tolerance: _e.curseurs.tolerance, taille: _e.curseurs.taille,
                             tailleMax: _e.curseurs.tailleMax };
    _ecrireCouleurs(_e.couleurs);
    clearTimeout(_e.minuteur);
    _e.minuteur = setTimeout(_recalculer, RECALCUL_MS);
  }
  function _onType(ev) {
    const af = ev.target.closest && ev.target.closest("[data-detect-affiner]");
    if (af && _e) {
      _ecrireAffiner(af.checked);
      if (_e.apercu) { clearTimeout(_e.minuteur); _recalculer(); }
      return;
    }
    const r = ev.target.closest && ev.target.closest("[data-detect-remplir-type]");
    if (r && _e) { _choisirTypeRemplir(r.value); _majBandeau(); return; }
    const tg = ev.target.closest && ev.target.closest("[data-detect-galerie-type]");
    if (tg && _e) { _e.typeGalerie = tg.value; return; }
    const el = ev.target.closest && ev.target.closest("[data-detect-type]");
    if (!el || !_e || !_e.apercu) return;
    _e.apercu.types[el.getAttribute("data-detect-type")] = el.value;
  }

  // ── Carte : pipette et coins du cadre ──
  async function _onClic(ev) {
    if (!_e || !ev || !ev.latlng || _e.pause) return;   // en pause : le clic est à l'outil armé
    const pt = _e.ctx.depuisCarte(ev.latlng), x = pt.x, y = pt.y;
    if (_e.etape === "exemples" && _e.pipette) {
      const c = _e.pipette;
      let ex = null;
      try { ex = await _exempleEn(x, y, _natures()[c]); } catch (err) {
        if (err && err.name === REFUS) { _toast(_t("detect.refus." + err.raison), "warn"); return; }
        throw err;
      }
      if (!_e) return;
      if (!ex) { _toast(_t("detect.toast.horsImage"), "warn"); return; }
      if (ex.fond) {   // doigt sur le fond : pas d'exemple
        _toast(_t(_galeries() ? "detect.galeries.toast.surFond" : "detect.toast.surFond"), "warn");
        return;
      }
      _e.couleurs[c] = _e.couleurs[c].concat([ex]).slice(-MAX_EXEMPLES);
      _e.couleurs.curseurs = null;   // nouvel exemple : les réglages repartent des exemples
      _ecrireCouleurs(_e.couleurs);
      _majBandeau();
    } else if (_e.etape === "remplir") {
      if (_retirerAuToucher(x, y)) return;
      if (_galeries()) _remplirGalerieEn(x, y);
      else if (_estLigne(_e.typeRemplir)) _suivreEn(x, y);
      else _remplirEn(x, y);
    } else if (_e.etape === "zone") {
      _e.coins.push({ x: x, y: y });
      if (_e.coins.length < 2) { _dessinerCadre(); _majBandeau(); return; }
      const a = _e.coins[0], b = _e.coins[1];
      _initCurseurs();
      _lancer({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }, 1);
    }
  }

  // Emprise lue par le contexte (contextePlan > emprise), sinon l'image [0, largeur] × [0, hauteur].
  function _emprise() {
    const c = _e.ctx;
    const r = typeof c.emprise === "function" ? c.emprise() : null;
    return r && r.x1 > r.x0 && r.y1 > r.y0 ? r : { x0: 0, y0: 0, x1: c.largeur, y1: c.hauteur };
  }

  async function _toutLePlan() {
    const E = _emprise(), W = E.x1 - E.x0, H = E.y1 - E.y0;
    const grand = W * H > SURFACE_PLEINE;
    if (grand) {
      const ok = await window.ktaConfirm(_t("detect.tout.confirm"), { titre: _t("detect.titre") });
      if (!ok || !_e) return;
    }
    _initCurseurs();
    _lancer({ x: E.x0, y: E.y0, w: W, h: H }, grand ? 0.5 : 1);
  }

  async function _lancer(cadre, echelle) {
    // cadre ramené dans l'emprise : un cadre tiré au-delà ne lit que ce qui existe
    const E = _emprise(), rx = Math.max(E.x0, cadre.x), ry = Math.max(E.y0, cadre.y);
    const region = { x: rx, y: ry, w: Math.min(E.x1, cadre.x + cadre.w) - rx, h: Math.min(E.y1, cadre.y + cadre.h) - ry };
    if (region.w < 4 || region.h < 4) {
      _e.coins = []; _toast(_t("detect.toast.cadreVide"), "warn"); _majBandeau();
      return;
    }
    const fin = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
    _lacherExecuteur();
    _e.etape = "calcul"; _e.progres = [0, 1]; _e.ctrl = new AbortController(); _viderCouche(); _majBandeau();
    // Blocs gardés (worker, sinon page) : les curseurs de l'aperçu recalculent sans relire l'image.
    const ex = window.KtaDetection.executeurWorker() || window.KtaDetection.executeurLocal();
    const e = _e;
    e.ex = ex; e.region = region; e.echelle = echelle; e.bloc = fin ? 2048 : 1024;
    try {
      const res = await window.KtaDetection.detecter({
        lireBloc: _lireBloc, region: region, echelle: echelle,
        limites: E,
        classes: _galeries() ? _classesGaleries() : _classes(),
        reglages: _galeries() ? _reglagesGaleriesBlocs() : _reglages(), executeur: ex, garder: !_galeries(),
        signal: e.ctrl.signal,
        onProgres: function (i, n) { if (_e === e) { e.progres = [i, n]; _majBandeau(); } }
      });
      if (_e !== e) return;
      if (_galeries()) {
        // les réglages des galeries ne relisent pas l'image : réseau recalculé sur les axes gardés ici
        _lacherExecuteur();
        e.axes = res.axes || [];
        _construireReseau();
        e.etape = "apercu";
        _dessinerGaleries();
        return;
      }
      e.recalculable = !!res.recalculable;
      _construireApercu(res);
      e.etape = "apercu";
      _dessinerApercu();
    } catch (err) {
      if (_e !== e) return;
      e.etape = "zone"; e.coins = [];
      _lacherExecuteur();
      if (err && err.name === REFUS) _toast(_t("detect.refus." + err.raison), "warn");
      else if (!err || err.name !== "AbortError") {
        console.warn("[Detection] échec :", err);
        _toast(_t("detect.toast.echec"), "warn");
      }
    } finally {
      if (_e === e) { e.ctrl = null; _majBandeau(); }
    }
  }

  // ── Réglages : déduits des exemples (ktaDetection.js > reglagesDepuisExemples), sinon ceux des curseurs ──
  // ⚠️ contrat (décision produit) : chaque toucher de pipette mesure la composante touchée ; tolérance et taille
  //   minimale en découlent. Un curseur bougé l'emporte, retenu avec les couleurs du plan, jusqu'au prochain exemple.
  function _natures() { return { a: "masse", b: "masse", f: "trait", g: "galerie" }; }
  function _pxParM() { return _e.ctx.pxParM(); }
  function _deduits() {
    const ex = {};
    _classesActives().forEach(function (c) { ex[c] = _e.couleurs[c]; });
    return window.KtaDetection.reglagesDepuisExemples(ex, _natures());
  }
  // Classe de masse dont le curseur « Tolérance de couleur » montre la valeur : Masse A, sinon Masse B.
  function _masseRef(d) { return ["a", "b"].filter(function (c) { return d.tolerances[c] > 0; })[0] || null; }
  function _initCurseurs() {
    if (_galeries()) { _e.deduits = _deduits(); return; }
    const d = _deduits(), sauves = _e.couleurs.curseurs, ref = _masseRef(d);
    const tol = ref ? d.tolerances[ref] : 0;
    // taille maximale : déduite du plus grand exemple (× 4 en aire), plafonnée à la marge des blocs (au-delà, une masse
    // est « trop grande pour un bloc » de toute façon)
    const tMax = Math.min(TAILLE_MAX_PLAFOND, d.tailleMax || TAILLE_MAX_PLAFOND);
    _e.curseurs = sauves ? { tolerance: sauves.tolerance, taille: sauves.taille, tailleMax: sauves.tailleMax || tMax }
      : { tolerance: tol || 22, taille: d.taille || 13, tailleMax: tMax };
    _e.deduits = d;
  }
  // Tolérance par classe. ⚠️ contrat : le curseur affiche la tolérance RÉELLEMENT appliquée aux masses (celle de la
  //   classe _masseRef) ; l'autre masse garde son écart déduit à elle (même valeur quand le curseur n'a pas bougé).
  //   Les fronts gardent la leur : un exemple de Front ne change pas le curseur, le curseur ne change pas les fronts.
  // 🩸 Le curseur montrait le maximum des classes (celle d'un Front) quand les masses tournaient bien plus bas.
  function _classes() {
    const d = _e.deduits, ref = _masseRef(d);
    return CLASSES.filter(function (c) { return _e.couleurs[c].length; }).map(function (c) {
      let tol = d.tolerances[c] || 22;
      if (_natures()[c] !== "trait" && ref) {
        tol = Math.max(TOL_CURSEUR[0], Math.min(TOL_CURSEUR[1], _e.curseurs.tolerance + tol - d.tolerances[ref]));
      }
      return { id: c, nature: _natures()[c], tolerance: tol,
               couleurs: _e.couleurs[c].map(function (q) { return q.rgb; }) };
    });
  }
  function _reglages() {
    const rg = window.KtaDetection.reglagesPourTaille(_e.curseurs.taille, _pxParM());
    rg.aireMax = _e.curseurs.tailleMax >= TAILLE_MAX_PLAFOND ? 0 : _e.curseurs.tailleMax * _e.curseurs.tailleMax;
    rg.affiner = _toleranceAffiner();
    return Object.assign({ bloc: _e.bloc }, rg);
  }
  function _lacherExecuteur() {
    if (!_e) return;
    clearTimeout(_e.minuteur);
    if (_e.ex) { _e.ex.fermer(); _e.ex = null; }
    _e.recalculable = false;
  }
  // Recalcul au curseur : blocs déjà lus si l'exécuteur les a tous gardés, sinon nouvelle lecture de la zone.
  async function _recalculer() {
    const e = _e;
    if (!e || !e.apercu) return;
    if (e.calculEnCours) { e.relancer = true; return; }   // curseur bougé pendant le calcul : refait à la fin
    if (!e.recalculable || !e.ex) { _lancer(e.region, e.echelle); return; }
    e.calculEnCours = true;
    try {
      const res = await window.KtaDetection.recalculer(e.ex, { classes: _classes(), reglages: _reglages(),
        echelle: e.echelle });
      if (_e !== e) return;
      e.recalculs++;
      _construireApercu(res);
      _dessinerApercu();
      _majBilan();
    } catch (err) {
      console.warn("[Detection] recalcul :", err);
    } finally {
      e.calculEnCours = false;
      if (e.relancer && _e === e) { e.relancer = false; _recalculer(); }
    }
  }
  // Résultat → objets de l'aperçu, sans ce qui est déjà dessiné ; types choisis gardés d'un recalcul à l'autre.
  function _construireApercu(res) {
    const types = (_e.apercu && _e.apercu.types) || Object.assign({}, DEFAUT);
    const surfaces = {}, lignes = {};
    const objets = [];
    let deja = 0;
    res.masses.forEach(function (m) {
      const niv = _e.ctx.niveau(types[m.classe]), cle = String(niv);
      if (!surfaces[cle]) surfaces[cle] = _existantes(niv);
      if (_dejaPresente(m, surfaces[cle])) deja++; else objets.push({ classe: m.classe, points: m.points });
    });
    (res.traits || []).forEach(function (m) {
      const niv = _e.ctx.niveau(types[m.classe]), cle = String(niv);
      if (!lignes[cle]) lignes[cle] = _existantsTraits(niv);
      if (_traitDejaPresent(m, lignes[cle])) deja++;
      else objets.push({ classe: m.classe, points: m.points, trait: true });
    });
    _e.apercu = { objets: objets, retires: new Set(), types: types, deja: deja, tropGrands: res.tropGrands.length,
                  ecartees: res.ecartees || 0 };
  }

  // ── Remplir au clic : chaque toucher remplit la zone fermée par le trait (ktaDetection.js > remplir) ou suit le
  //    trait d'un front (ktaDetection.js > suivreTrait) ──
  // ⚠️ contrat (décision produit) : le geste suit le TYPE choisi, sans bouton à part. Type à contour fermé (pilier,
  //   mur…) : la zone fermée autour du doigt. Type en ligne (front, mur en ligne, arc ; géométrie lue par
  //   structures.js > isStructurePolylineType, types personnalisés de la légende compris) : le trait touché, suivi
  //   jusqu'à ses bouts ou au premier carrefour. Un type posé d'un clic à taille fixe (structures.js > ktaPoseUnClic :
  //   pilier à bras) n'est jamais proposé.
  // ⚠️ contrat (décision produit) : zones et fronts peuvent se mêler dans un même aperçu ; « Valider » pose les zones
  //   au dernier type FERMÉ choisi et les fronts au dernier type EN LIGNE choisi (_choisirTypeRemplir), chacun au
  //   niveau de son type.
  function _typesRemplir() {
    const ligne = function (t) {
      return typeof window.isStructurePolylineType === "function" && window.isStructurePolylineType(t);
    };
    const unClic = function (t) { return typeof window.ktaPoseUnClic === "function" && window.ktaPoseUnClic(t); };
    const LC = window.LegendCustomization, out = [];
    (window.KTA_STRUCTURE_TYPES_BUILTIN || []).forEach(function (t) {
      if (unClic(t)) return;
      let lib = null;
      try {
        if (LC && typeof LC.getLabel === "function") lib = LC.getLabel("structures", t);
      } catch (err) { lib = null; }
      out.push({ id: t, libelle: lib || _t("struct.label." + t), ligne: !!ligne(t) });
    });
    if (LC && typeof LC.listCustomEntries === "function") {
      LC.listCustomEntries("structures").forEach(function (c) {
        if (!c || !c.id || unClic(c.id)) return;
        out.push({ id: c.id, libelle: c.label || c.id, ligne: c.geometry === "polyline" || !!ligne(c.id) });
      });
    }
    return out;
  }
  function _estLigne(type) {
    return _typesRemplir().some(function (t) { return t.id === type && t.ligne; });
  }
  function _typeRemplirInitial() {
    const ids = _typesRemplir().map(function (t) { return t.id; });
    if (ids.indexOf(_e.typeRemplir) >= 0) return _e.typeRemplir;
    return ids.indexOf(_e.typeOuverture) >= 0 ? _e.typeOuverture : (ids[0] || null);
  }
  // Type choisi : celui des touchers suivants, et celui que prendront à « Valider » les remplissages de sa géométrie.
  function _choisirTypeRemplir(type) {
    const types = _typesRemplir(), premier = function (ligne) {
      const t = types.filter(function (x) { return x.ligne === ligne; })[0];
      return t ? t.id : null;
    };
    _e.typeRemplir = type;
    if (_estLigne(type)) _e.typeLigne = type; else _e.typeFerme = type;
    if (!_e.typeLigne) _e.typeLigne = premier(true);
    if (!_e.typeFerme) _e.typeFerme = premier(false);
  }
  function _remplisGardes() {
    return _e && _e.remplis ? _e.remplis : [];
  }
  // Structures que « Valider » posera : une par zone, une par morceau de front suivi.
  function _nbStructuresRemplies() {
    return _remplisGardes().reduce(function (n, z) { return n + (z.lignes ? z.lignes.length : 1); }, 0);
  }
  // Fronts du niveau `niveau` contre lesquels un front suivi est dédoublonné et raccordé : posés (session, calques)
  //   et déjà dans l'aperçu.
  function _frontsRaccord(niveau) {
    const out = _existantsTraits(niveau).map(function (s) { return { points: s.points }; });
    _remplisGardes().forEach(function (z) {
      (z.lignes || []).forEach(function (l) { out.push({ points: l.points }); });
    });
    return out;
  }

  // ── Retirer un remplissage : toucher sur la forme, Ctrl+Z (Cmd+Z) ou « Retirer le dernier » ──
  // ⚠️ contrat (décision produit) : un remplissage retiré QUITTE l'aperçu (pas d'état « retiré » à remettre) ; le
  //   retoucher au même endroit le refait. Ctrl+Z et le bouton dépilent le plus récent, un par un. Tant que la
  //   fenêtre est ouverte, Ctrl+Z est à elle (_onKey) : jamais HistoryManager ni le ⏪ global.
  // Galeries : un remplissage = les axes d'un toucher (_e.remplisG) ; _e.axes en est la concaténation.
  function _nbRemplissages() {
    if (!_e || _e.etape !== "remplir") return 0;
    return _galeries() ? _e.remplisG.length : _e.remplis.length;
  }
  function _retirerRemplissage(i) {
    if (_galeries()) {
      _e.remplisG.splice(i, 1);
      _e.axes = [].concat.apply([], _e.remplisG.map(function (g) { return g.axes; }));
      _construireReseau(); _dessinerGaleries();
    } else {
      _e.remplis.splice(i, 1);
      _dessinerRemplis();
    }
    _majBandeau();
  }
  function _retirerDernier() {
    const n = _nbRemplissages();
    if (n) _retirerRemplissage(n - 1);
    return n > 0;
  }
  // px plan pour TOUCHE_RETIRER_PX d'écran, au zoom de la carte du contexte
  function _tolTouche(x, y) {
    const m = _e.ctx.carte;
    try {
      const a = m.latLngToContainerPoint(_e.ctx.versCarte(x, y));
      const b = m.latLngToContainerPoint(_e.ctx.versCarte(x + 100, y));
      const k = Math.hypot(b.x - a.x, b.y - a.y) / 100;
      return k > 0 ? TOUCHE_RETIRER_PX / k : 0;
    } catch (err) { return 0; }
  }
  // Structures : toucher DANS la forme (jamais autour : le pilier voisin, mur commun, ne se remplirait plus).
  //   Galeries : dans la galerie remplie (rayon de ses axes), au moins TOUCHE_RETIRER_PX d'écran autour de l'axe.
  //   Le plus récent d'abord. → true si un remplissage a été retiré.
  function _retirerAuToucher(x, y) {
    const p = { x: x, y: y };
    const tol = _tolTouche(x, y);
    if (!_galeries()) {
      // front suivi : à moins de max(TOUCHE_RETIRER_PX d'écran, demi-épaisseur du trait + 1 px) de l'un de ses morceaux
      const surFront = function (z) {
        const lim = Math.max(tol, (z.ep || 0) / 2 + 1);
        return z.lignes.some(function (l) {
          for (let j = 1; j < l.points.length; j++) if (_distSeg(p, l.points[j - 1], l.points[j]) <= lim) return true;
          return false;
        });
      };
      for (let i = _e.remplis.length - 1; i >= 0; i--) {
        const z = _e.remplis[i];
        if (z.lignes ? surFront(z) : _dedans(p, z.points)) { _retirerRemplissage(i); return true; }
      }
      return false;
    }
    for (let i = _e.remplisG.length - 1; i >= 0; i--) {
      const pris = _e.remplisG[i].axes.some(function (ax) {
        for (let j = 1; j < ax.length; j++) {
          if (_distSeg(p, ax[j - 1], ax[j]) <= Math.max(ax[j - 1].r || 0, ax[j].r || 0, tol)) return true;
        }
        return ax.length === 1 && Math.hypot(x - ax[0].x, y - ax[0].y) <= Math.max(ax[0].r || 0, tol);
      });
      if (pris) { _retirerRemplissage(i); return true; }
    }
    return false;
  }
  // Ligne d'aide et bouton du mode Remplir. La moitié clavier n'est montrée qu'avec un pointeur fin (souris,
  //   pavé) : un téléphone sans clavier n'en a pas l'usage.
  function _aideRetirer() {
    const fin = !!(window.matchMedia && window.matchMedia("(any-pointer: fine)").matches);
    const mac = /Mac|iPhone|iPad/.test((navigator.platform || "") + " " + (navigator.userAgent || ""));
    let t = _t(_galeries() ? "detect.galeries.remplir.retirer" : "detect.remplir.retirer");
    if (fin) t += " · " + _t("detect.remplir.retirerClavier", { touche: mac ? "Cmd+Z" : "Ctrl+Z" });
    return '<span class="kta-detect-aide-retirer">' + _esc(t) + "</span>";
  }
  function _btnRetirerDernier() {
    return '<button type="button" class="kta-btn kta-btn-ghost" data-detect="retirer-dernier">' +
      window.ktaIcone("undo-2") + " " + _esc(_t("detect.remplir.retirerDernier")) + "</button>";
  }
  async function _remplirEn(x, y) {
    if (_e.remplissage) return;   // une lecture à la fois : un double toucher ne remplit pas deux fois
    const e = _e, E = _emprise();
    if (x < E.x0 || y < E.y0 || x >= E.x1 || y >= E.y1) { _toast(_t("detect.toast.horsImage"), "warn"); return; }
    e.remplissage = true;
    try {
      let r = null;
      const pl = window.KtaDetection.plafondRemplir(e.ctx.pxParM ? e.ctx.pxParM() : null,
        { largeur: e.ctx.largeur, hauteur: e.ctx.hauteur });
      const grande = Math.max(4 * MARGE, 2 * pl.cote + 64);
      const passes = [[384, 1], [Math.min(FENETRE_REMPLIR_MAX, grande), 1]];
      if (grande > FENETRE_REMPLIR_MAX) passes.push([grande, FENETRE_REMPLIR_MAX / grande]);
      for (let k = 0; k < passes.length; k++) {
        const n = passes[k][0], ech = passes[k][1];
        const x0 = Math.max(E.x0, Math.floor(x - n / 2)), y0 = Math.max(E.y0, Math.floor(y - n / 2));
        const x1 = Math.min(E.x1, Math.ceil(x + n / 2)), y1 = Math.min(E.y1, Math.ceil(y + n / 2));
        const b = await _lireBloc(x0, y0, x1 - x0, y1 - y0, ech);
        if (_e !== e) return;
        // 🩸 Rien de dessiné (plan V1 : zone jamais affichée) : la fenêtre blanche passerait pour un fond ouvert
        if (!b.dessine) { _toast(_t("detect.toast.horsImage"), "warn"); return; }
        r = window.KtaDetection.remplir(b, (x - x0) * ech, (y - y0) * ech, { x0: x0, y0: y0, echelle: ech,
          aireMax: pl.aireMax, coteMax: pl.coteMax, affiner: _toleranceAffiner() });
        // zone fermée, ou fenêtre déjà grande comme l'emprise : une fenêtre plus grande n'y changerait rien
        if (r.refus !== "ouvert" || (x0 === E.x0 && y0 === E.y0 && x1 === E.x1 && y1 === E.y1)) break;
      }
      if (r.refus) { _toast(_t("detect.remplir.refus." + r.refus), "warn"); return; }
      const niv = e.ctx.niveau(e.typeRemplir);
      if (_dejaPresente(r, _existantes(niv))) { _toast(_t("detect.remplir.deja"), "warn"); return; }
      const dejaListe = _remplisGardes().filter(function (z) { return !z.lignes; }).map(function (z) {
        return { points: z.points, c: _centre(z.points) };
      });
      if (_dejaPresente(r, dejaListe)) { _toast(_t("detect.remplir.dejaListe"), "warn"); return; }
      e.remplis.push({ points: r.points });
      _dessinerRemplis();
      _majBandeau();
    } catch (err) {
      if (_e !== e) return;
      if (err && err.name === REFUS) _toast(_t("detect.refus." + err.raison), "warn");
      else if (!err || err.name !== "AbortError") {
        console.warn("[Detection] remplissage :", err);
        _toast(_t("detect.toast.echec"), "warn");
      }
    } finally {
      e.remplissage = false;
    }
  }
  // Front : le trait touché, suivi jusqu'à ses bouts ou au premier carrefour (ktaDetection.js > suivreTrait), dans
  //   une fenêtre de plus en plus grande tant qu'un bout s'arrête à son bord (FENETRES_FRONT, pleine résolution).
  // ⚠️ contrat (décision produit) : un bout s'accroche exactement sur un front posé ou de l'aperçu (même niveau),
  //   jamais modifié ; ce qui le double est coupé, un front tout entier déjà là est refusé.
  // 🩸 Au-delà de la plus grande fenêtre, le front s'arrête au bord lu (toast) : un toucher plus loin le prolonge et
  //   raccorde ; une lecture à résolution réduite amincirait le trait sous le seuil des traits fins.
  // 🩸 Le suivi tourne dans le worker de la détection (_e.ex, ktaDetection.js > executeurWorker), sinon dans la page :
  //   un long front dans un réseau dense lit 4 096 px et figeait l'app plusieurs secondes. Pendant le calcul le
  //   parcours peut changer de mode : le résultat n'est gardé que dans le même mode, sur le même aperçu (vivant).
  async function _suivreEn(x, y) {
    if (_e.remplissage) return;
    const e = _e, E = _emprise(), remplis = e.remplis;
    const vivant = function () { return _e === e && e.etape === "remplir" && e.remplis === remplis; };
    if (x < E.x0 || y < E.y0 || x >= E.x1 || y >= E.y1) { _toast(_t("detect.toast.horsImage"), "warn"); return; }
    e.remplissage = true;
    try {
      let r = null;
      const existants = _frontsRaccord(e.ctx.niveau(e.typeRemplir));
      if (!e.ex) e.ex = window.KtaDetection.executeurWorker() || window.KtaDetection.executeurLocal();
      for (let k = 0; k < FENETRES_FRONT.length; k++) {
        const n = FENETRES_FRONT[k];
        const x0 = Math.max(E.x0, Math.floor(x - n / 2)), y0 = Math.max(E.y0, Math.floor(y - n / 2));
        const x1 = Math.min(E.x1, Math.ceil(x + n / 2)), y1 = Math.min(E.y1, Math.ceil(y + n / 2));
        const b = await _lireBloc(x0, y0, x1 - x0, y1 - y0, 1);
        if (!vivant() || !e.ex) return;
        if (!b.dessine) { _toast(_t("detect.toast.horsImage"), "warn"); return; }
        r = await e.ex.suivreTrait(b, x - x0, y - y0, { x0: x0, y0: y0, echelle: 1,
          affiner: _toleranceAffiner(), existants: existants });
        if (!vivant()) return;
        if (r.refus || !r.bord || (x0 === E.x0 && y0 === E.y0 && x1 === E.x1 && y1 === E.y1)) break;
      }
      if (r.refus) {
        _toast(_t(r.refus === "deja" ? "detect.remplir.frontDeja" : "detect.remplir.refus." + r.refus), "warn");
        return;
      }
      e.remplis.push({ lignes: r.traces.map(function (t) { return { points: t.points, accroches: t.accroches }; }),
                       ep: r.epaisseur, bouts: r.bouts });
      _dessinerRemplis();
      _majBandeau();
      if (r.bord) _toast(_t("detect.remplir.frontBord"), "info");
    } catch (err) {
      if (_e !== e) return;
      if (err && err.name === REFUS) _toast(_t("detect.refus." + err.raison), "warn");
      else if (!err || err.name !== "AbortError") {
        console.warn("[Detection] suivi du front :", err);
        _toast(_t("detect.toast.echec"), "warn");
      }
    } finally {
      e.remplissage = false;
    }
  }
  // Valider : les zones au dernier type fermé choisi, les fronts au dernier type en ligne choisi, chacun au niveau
  // de son type ; ce qui recouvre (zone) ou double (front, ECART_TRAIT) une structure de ce niveau n'est pas recréé.
  function _validerRemplis() {
    if (_e.ctx.refuse()) return;
    const poses = [], tf = _e.typeFerme, tl = _e.typeLigne;
    const nf = _e.ctx.niveau(tf), nl = _e.ctx.niveau(tl), existantes = _existantes(nf), fronts = _existantsTraits(nl);
    const poser = function (type, niv, points) {
      const s = { type: type, points: points.map(function (p) { return { x: p.x, y: p.y }; }) };
      if (niv !== null) s.level = niv;
      window.KtaUid.ensure(s, "st");
      window.KtaUid.touch(s);
      poses.push(s);
    };
    _remplisGardes().forEach(function (z) {
      if (z.lignes) {
        z.lignes.forEach(function (l) { if (!_traitDejaPresent(l, fronts)) poser(tl, nl, l.points); });
      } else if (!_dejaPresente(z, existantes)) poser(tf, nf, z.points);
    });
    if (!poses.length) { _toast(_t("detect.remplir.deja"), "warn"); return; }
    _poserEtFermer(poses);
  }

  // ── Validation : les structures gardées, écrites par le contexte (mode plan : une étape ⏪, puis la session) ──
  function _valider() {
    const a = _e && _e.apercu;
    if (!a || _e.ctx.refuse()) return;
    const poses = [];
    a.objets.forEach(function (m, i) {
      if (a.retires.has(i)) return;
      const s = { type: a.types[m.classe], points: m.points.map(function (p) { return { x: p.x, y: p.y }; }) };
      const niv = _e.ctx.niveau(s.type);
      if (niv !== null) s.level = niv;
      window.KtaUid.ensure(s, "st");
      window.KtaUid.touch(s);
      poses.push(s);
    });
    if (!poses.length) return;
    _poserEtFermer(poses);
  }
  // Un seul appel à ctx.poser pour toutes les structures (mode plan : UNE étape ⏪), puis le parcours se ferme.
  function _poserEtFermer(poses) {
    _lacherExecuteur();
    // Posées mais masquées (filtres, niveau) : le dire, sinon « rien n'est apparu ».
    const ctx = _e.ctx, masquees = ctx.poser(poses) || 0;
    fermer();
    _toast(ctx.messagePoses ? ctx.messagePoses(poses.length) : _t("detect.toast.poses", { n: poses.length }),
      "success");
    if (masquees) _toast(_t("detect.toast.masquees", { n: masquees }), "warn");
  }

  // ── Galeries → tracés (fenêtre « Détecter les galeries », cible "traces") ──
  // ⚠️ contrat (décision produit) : fenêtre à part, ouverte depuis l'outil Tracés, l'📊 Éditeur de données et le
  //   Générateur ; elle ne propose que la galerie (pipette), Remplir au clic, le cadre, « Tout le plan », deux
  //   réglages (simplification, branche minimale : mètres à l'échelle du plan, sinon px) et le type de tracé ; la
  //   fenêtre des structures ne propose jamais les galeries. Rien n'est écrit avant « Valider » ; mode plan : UNE
  //   étape ⏪ (catégorie roads). Calcul : ktaDetection.js > reseauGaleries, sur les axes gardés ici (un réglage
  //   bougé ne relit pas l'image) ; tracés existants du même niveau jamais modifiés, structures posées en obstacles.
  function _galeries() { return !!_e && _e.cible === "traces"; }
  function _pxParMG() { return _e.ctx.pxParM ? _e.ctx.pxParM() : null; }
  function _niveauTrace() { return typeof _e.ctx.niveauTrace === "function" ? _e.ctx.niveauTrace() : null; }
  // Tracé existant du niveau visé (jonction : l'un de ses deux niveaux) ; jamais l'itinéraire calculé.
  function _tracesExistants(niveau) {
    const l = typeof _e.ctx.tracesExistants === "function" ? _e.ctx.tracesExistants() : [];
    return l.filter(function (s) {
      if (!s || s.type === "itinerary" || !Array.isArray(s.points) || s.points.length < 2) return false;
      if (!_e.ctx.multi || niveau === null) return true;
      if (s.type === "jonction") return s.fromLevel === niveau || s.toLevel === niveau;
      return (Number.isInteger(s.level) ? s.level : 0) === niveau;
    });
  }
  // Structures posées du niveau, obstacles du calcul : contours fermés et murs en ligne (jamais un front ni un arc).
  function _obstaclesGaleries(niveau) {
    const ligne = function (t) {
      return typeof window.isStructurePolylineType === "function" && window.isStructurePolylineType(t);
    };
    const out = [];
    _e.ctx.existantes().forEach(function (s) {
      if (!s || !Array.isArray(s.points) || _autreNiveau(s, niveau)) return;
      if (s.type === "mur-ligne" && s.points.length >= 2) out.push({ points: s.points, ferme: false });
      else if (!ligne(s.type) && s.points.length >= 3) out.push({ points: s.points, ferme: true });
    });
    return out;
  }
  // Types de tracé proposés : principal, secondaire, chemin (libellés de la légende) et types personnalisés ; jamais
  // la jonction (deux niveaux) ni l'itinéraire.
  function _typesTraces() {
    const LC = window.LegendCustomization, out = [];
    ["principal", "secondaire", "chemin"].forEach(function (t) {
      let lib = null;
      try {
        if (LC && typeof LC.getSource === "function" && LC.getSource("traces", t) !== "default") {
          lib = LC.getLabel("traces", t);
        }
      } catch (err) { lib = null; }
      out.push({ id: t, libelle: lib || _t("ui.trace." + t) });   // libellés des boutons de l'outil Tracés
    });
    if (LC && typeof LC.listCustomEntries === "function") {
      LC.listCustomEntries("traces").forEach(function (c) {
        if (c && c.id) out.push({ id: c.id, libelle: c.label || c.id });
      });
    }
    return out;
  }
  function _classesGaleries() {
    const d = _e.deduits || _deduits();
    return [{ id: "g", nature: "galerie", tolerance: d.tolerances.g || 22,
              couleurs: _e.couleurs.g.map(function (q) { return q.rgb; }) }];
  }
  function _reglagesGaleriesBlocs() {
    return { bloc: _e.bloc, galerie: true, obstacles: _obstaclesGaleries(_niveauTrace()) };
  }
  // Curseurs : bornes [min, max, pas] en mètres (plan à l'échelle connue) ou en px.
  const CURSEURS_G = { simplification: { m: [0.1, 3, 0.1], px: [1, 30, 1] },
                       brancheMin: { m: [0, 10, 0.5], px: [0, 100, 1] } };
  function _valeurCurseurG(nom) {
    const k = _pxParMG(), v = _e.reglagesG[nom];
    return k ? Math.round((v / k) * 10) / 10 : Math.round(v);
  }
  function _texteCurseurG(nom) {
    const v = _valeurCurseurG(nom);
    return _pxParMG() ? window.formatDistance(v, 1) : v + " px";
  }
  function _curseursGaleries() {
    const u = _pxParMG() ? "m" : "px";
    return ["simplification", "brancheMin"].map(function (nom) {
      const b = CURSEURS_G[nom][u];
      return '<label class="kta-detect-curseur">' + _esc(_t("detect.galeries.curseur." + nom)) +
        ' <input type="range" data-detect-galerie-curseur="' + nom + '" min="' + b[0] + '" max="' + b[1] +
        '" step="' + b[2] + '" value="' + _valeurCurseurG(nom) + '"> <span class="kta-detect-valeur">' +
        _esc(_texteCurseurG(nom)) + "</span></label>";
    }).join("");
  }
  function _choixTypeGalerie() {
    return '<label class="kta-detect-type">' + _esc(_t("detect.galeries.type")) +
      ' <select data-detect-galerie-type>' + _typesTraces().map(function (ty) {
        return '<option value="' + _esc(ty.id) + '"' + (_e.typeGalerie === ty.id ? " selected" : "") + ">" +
          _esc(ty.libelle) + "</option>";
      }).join("") + "</select></label>";
  }
  function _gardesGaleries() {
    const a = _galeries() ? _e.apercu : null;
    return a && a.galeries ? a.objets.length - a.retires.size : 0;
  }
  function _texteGaleries() {
    const a = _e.apercu;
    if (_e.etape === "remplir") return _t("detect.galeries.remplir.aide", { n: _gardesGaleries() });
    return _t("detect.galeries.bilan", { n: a ? a.objets.length : 0, d: a ? a.deja : 0, a: a ? a.accroches : 0 }) +
      " " + _t("detect.galeries.apercu.aide");
  }
  function _bandeauGaleries() {
    if (_e.etape === "exemples") {
      return '<span class="kta-racc-info">' +
        _esc(_t(_e.pipette ? "detect.galeries.pipette" : "detect.galeries.exemples.aide")) + "</span>" +
        '<div class="kta-racc-actions"><button type="button" class="kta-btn ' +
        (_e.pipette === "g" ? "kta-btn-primary" : "kta-btn-ghost") + '" data-detect="pipette-g">' +
        _esc(_t("detect.galeries.classe", { n: _e.couleurs.g.length })) + " " + _pastilles("g") + "</button>" +
        _btn("effacer", "detect.exemples.effacer") + _btn("zone", "detect.exemples.suivant", "kta-btn-primary") +
        '<button type="button" class="kta-btn kta-btn-ghost" data-detect="remplir">' +
        window.ktaIcone("paint-bucket") + " " + _esc(_t("detect.remplir.bouton")) + "</button>" +
        _btn("fermer", "detect.fermer") + "</div>";
    }
    const remplir = _e.etape === "remplir";
    const retour = remplir ? _btn("exemples", "detect.retour") : _btn("zone", "detect.recommencer");
    return '<span class="kta-racc-info">' + _esc(_texteGaleries()) + "</span>" + (remplir ? _aideRetirer() : "") +
      _htmlPause() +
      '<div class="kta-racc-actions">' + _curseursGaleries() + _choixTypeGalerie() + "</div>" +
      '<div class="kta-racc-actions">' + (remplir ? _btnRetirerDernier() : "") +
      _btn("valider-galeries", "detect.valider", "kta-btn-primary", { n: _gardesGaleries() }) + retour +
      _btn("fermer", "detect.fermer") + "</div>";
  }
  // Après un réglage : seuls le texte et « Ajouter » changent (refaire le bandeau lâcherait le curseur tenu).
  function _majBilanGaleries() {
    const b = _e && _e.bandeau;
    if (!b) return;
    const info = b.querySelector(".kta-racc-info"), valider = b.querySelector('[data-detect="valider-galeries"]');
    if (info) info.textContent = _texteGaleries();
    if (valider) {
      valider.textContent = _t("detect.valider", { n: _gardesGaleries() });
      valider.disabled = _gardesGaleries() === 0;
    }
  }
  function _onCurseurGalerie(el) {
    const nom = el.getAttribute("data-detect-galerie-curseur"), k = _pxParMG(), v = Number(el.value);
    _e.reglagesG[nom] = k ? v * k : v;
    const val = el.parentNode && el.parentNode.querySelector(".kta-detect-valeur");
    if (val) val.textContent = _texteCurseurG(nom);
    clearTimeout(_e.minuteur);
    const e = _e;
    _e.minuteur = setTimeout(function () {
      if (_e !== e || !e.apercu) return;
      _construireReseau(); _dessinerGaleries(); _majBilanGaleries();
    }, RECALCUL_MS);
  }
  // Clé d'un tracé d'un calcul à l'autre (bouts à 2 px près) : un tracé retiré le reste quand un réglage bouge.
  function _cleTrace(t) {
    const a = t.points[0], b = t.points[t.points.length - 1], r = function (v) { return Math.round(v / 2); };
    return [r(a.x), r(a.y), r(b.x), r(b.y)].join(",");
  }
  function _construireReseau() {
    const niv = _niveauTrace(), ancien = _e.apercu && _e.apercu.galeries ? _e.apercu : null;
    const res = window.KtaDetection.reseauGaleries(_e.axes, {
      simplification: _e.reglagesG.simplification, brancheMin: _e.reglagesG.brancheMin,
      existants: _tracesExistants(niv), obstacles: _obstaclesGaleries(niv)
    });
    const retiresCles = ancien ? ancien.retiresCles : new Set(), retires = new Set();
    const objets = res.traces.map(function (t, i) {
      const cle = _cleTrace(t);
      if (retiresCles.has(cle)) retires.add(i);
      return { points: t.points, accroches: t.accroches, cle: cle };
    });
    _e.apercu = { galeries: true, objets: objets, retires: retires, retiresCles: retiresCles, deja: res.deja,
                  accroches: res.accroches };
  }
  function _dessinerGaleries() {
    _viderCouche();
    const a = _e.apercu, c = _couche();
    if (!a) return;
    // en Remplir, un toucher retire le remplissage entier (_onClic > _retirerAuToucher) : tracés non interactifs
    const remplir = _e.etape === "remplir";
    a.objets.forEach(function (m, i) {
      const pol = L.polyline(m.points.map(function (p) { return _e.ctx.versCarte(p.x, p.y); }), {
        pane: "ktaDetection", renderer: _e.rendu, bubblingMouseEvents: false, weight: 6, interactive: !remplir,
        className: "kta-detect-apercu kta-detect-trait kta-detect-galerie" +
          (a.retires.has(i) ? " kta-detect-retire" : "")
      });
      if (!remplir) pol.on("click", function () {
        if (a.retires.has(i)) { a.retires.delete(i); a.retiresCles.delete(m.cle); }
        else { a.retires.add(i); a.retiresCles.add(m.cle); }
        _dessinerGaleries();
        _majBilanGaleries();
      });
      pol.addTo(c);
      [0, 1].forEach(function (k) {
        if (!m.accroches[k]) return;
        const p = k ? m.points[m.points.length - 1] : m.points[0];
        L.circleMarker(_e.ctx.versCarte(p.x, p.y), { pane: "ktaDetection", renderer: _e.rendu, radius: 5,
          className: "kta-detect-accroche", interactive: false }).addTo(c);
      });
    });
  }
  // Toucher sur une galerie déjà remplie : sur un axe gardé, à moins de son rayon.
  function _dejaDansAxes(x, y) {
    return _e.axes.some(function (ax) {
      for (let i = 1; i < ax.length; i++) {
        const a = ax[i - 1], b = ax[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
        const u = L2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2)) : 0;
        if (Math.hypot(x - a.x - u * dx, y - a.y - u * dy) <= Math.max(a.r, b.r, 1)) return true;
      }
      return false;
    });
  }
  // Remplir au clic dans une galerie : fenêtre de plus en plus grande autour du toucher, jusqu'à l'emprise (au-delà
  // de FENETRE_REMPLIR_MAX px de côté, lue à résolution réduite) ; refus « ouvert » seulement sur toute l'emprise.
  async function _remplirGalerieEn(x, y) {
    if (_e.remplissage) return;
    const e = _e, E = _emprise();
    if (x < E.x0 || y < E.y0 || x >= E.x1 || y >= E.y1) { _toast(_t("detect.toast.horsImage"), "warn"); return; }
    if (_dejaDansAxes(x, y)) { _toast(_t("detect.remplir.dejaListe"), "warn"); return; }
    e.remplissage = true;
    try {
      const grand = Math.max(E.x1 - E.x0, E.y1 - E.y0);
      const passes = [[768, 1], [2048, 1],
        grand <= FENETRE_REMPLIR_MAX ? [grand, 1] : [grand, FENETRE_REMPLIR_MAX / grand]];
      let r = null;
      for (let k = 0; k < passes.length; k++) {
        const n = passes[k][0], ech = passes[k][1];
        const x0 = Math.max(E.x0, Math.floor(x - n / 2)), y0 = Math.max(E.y0, Math.floor(y - n / 2));
        const x1 = Math.min(E.x1, Math.ceil(x + n / 2)), y1 = Math.min(E.y1, Math.ceil(y + n / 2));
        const b = await _lireBloc(x0, y0, x1 - x0, y1 - y0, ech);
        if (_e !== e) return;
        if (!b.dessine) { _toast(_t("detect.toast.horsImage"), "warn"); return; }
        r = window.KtaDetection.remplirGalerie(b, (x - x0) * ech, (y - y0) * ech, { x0: x0, y0: y0, echelle: ech,
          obstacles: _obstaclesGaleries(_niveauTrace()), pxParM: _pxParMG() });
        if (r.refus !== "ouvert" || (x0 === E.x0 && y0 === E.y0 && x1 === E.x1 && y1 === E.y1)) break;
      }
      if (r.refus) {
        const cle = r.refus === "ouvert" || r.refus === "large" ? "detect.galeries.remplir." + r.refus
          : "detect.remplir.refus." + r.refus;
        _toast(_t(cle), "warn");
        return;
      }
      e.remplisG.push({ axes: r.axes });
      e.axes = e.axes.concat(r.axes);
      _construireReseau();
      _dessinerGaleries();
      _majBandeau();
    } catch (err) {
      if (_e !== e) return;
      if (err && err.name === REFUS) _toast(_t("detect.refus." + err.raison), "warn");
      else if (!err || err.name !== "AbortError") {
        console.warn("[Detection] remplissage de galerie :", err);
        _toast(_t("detect.toast.echec"), "warn");
      }
    } finally {
      e.remplissage = false;
    }
  }
  // Valider : les tracés gardés, du type choisi, au niveau actif (multi-niveau), écrits par UN appel au contexte.
  function _validerGaleries() {
    const a = _e && _e.apercu;
    if (!a || !a.galeries || _e.ctx.refuse()) return;
    const type = _e.typeGalerie, niv = _niveauTrace(), poses = [];
    a.objets.forEach(function (m, i) {
      if (a.retires.has(i)) return;
      const r = { type: type, points: m.points.map(function (p) { return { x: p.x, y: p.y }; }) };
      if (niv !== null) r.level = niv;
      window.KtaUid.ensure(r, "rd");
      window.KtaUid.touch(r);
      poses.push(r);
    });
    if (!poses.length) return;
    _lacherExecuteur();
    const ctx = _e.ctx, masques = ctx.poserTraces(poses) || 0;
    fermer();
    _toast(ctx.messagePosesTraces ? ctx.messagePosesTraces(poses.length) :
      _t("detect.galeries.poses", { n: poses.length }), "success");
    if (masques) _toast(_t("detect.galeries.masques", { n: masques }), "warn");
  }

  // ── Ouverture / fermeture ──
  // ⚠️ contrat (décision produit) : un seul détecteur ouvert. Le même (cible et carte) rouvert reste tel quel ; un
  //   autre ferme d'abord celui-ci par fermer(), le chemin d'Échap et de la croix (aperçu non validé jeté, rien
  //   écrit ; ce qui a été validé reste). Au Générateur, fermer() rend aussi sa fenêtre (ctx.sortir).
  function ouvrir(contexte, options) {
    const ctx = contexte || contextePlan();
    const cible = options && options.cible === "traces" ? "traces" : "structures";
    if (_e) {
      if (_e.cible === cible && ctx && _e.ctx.carte === ctx.carte) return true;
      fermer();
    }
    if (!ctx || !window.KtaDetection) return false;
    if (cible === "traces" && typeof ctx.poserTraces !== "function") return false;
    if (ctx.refuse()) return false;
    // type armé dans Tracés (lu avant ctx.entrer) : type de tracé proposé par la fenêtre des galeries
    const typeRoute = window.modeRoad || null;
    // type armé dans Structures (lu avant ctx.entrer, qui désarme les outils) : type proposé par « Remplir au clic »
    const typeOuverture = window.modeStructure || null;
    ctx.entrer();
    _e = { ctx: ctx, etape: "exemples", couleurs: null, pipette: null, coins: [], couche: null, apercu: null,
           ctrl: null, progres: [0, 1], lectures: 0, recalculs: 0, ex: null, curseurs: null,
           remplis: [], typeRemplir: null, typeFerme: null, typeLigne: null, typeOuverture: typeOuverture,
           remplissage: false,
           cible: cible, axes: [], remplisG: [], reglagesG: null, typeGalerie: null, pause: false };
    _e.couleurs = _lireCouleurs();
    if (cible === "traces") {
      _e.reglagesG = window.KtaDetection.reglagesGaleries(ctx.pxParM ? ctx.pxParM() : null);
      const ids = _typesTraces().map(function (t) { return t.id; });
      _e.typeGalerie = ids.indexOf(typeRoute) >= 0 ? typeRoute : "principal";
    }
    if (!_aDesExemples(_e.couleurs)) _e.pipette = cible === "traces" ? "g" : "a";
    const b = document.createElement("div");
    b.id = "kta-detect-bandeau";
    b.className = "kta-racc-bandeau kta-detect-bandeau";
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", _t(cible === "traces" ? "detect.galeries.titre" : "detect.titre"));
    b.addEventListener("click", _onBandeau);
    b.addEventListener("change", _onType);
    b.addEventListener("input", _onCurseur);
    (ctx.parent || document.body).appendChild(b);
    _e.bandeau = b;
    ctx.carte.on("click", _onClic);
    document.addEventListener("keydown", _onKey, true);
    _majBandeau();
    return true;
  }
  // Une fenêtre AFFICHÉE au-dessus du parcours (une fenêtre masquée reste parfois dans le DOM).
  // 🩸 Sauf la fenêtre qui porte le bandeau et celles que le contexte déclare sous le parcours (`ctx.hotes` : le
  //   Générateur, lui-même une fenêtre), sinon l'Échap n'y fermerait jamais le parcours.
  function _fenetreDessus() {
    const hotes = _e.ctx.hotes || [];
    const fenetres = document.querySelectorAll(".kta-readme-modal-overlay, [aria-modal='true']");
    return Array.prototype.some.call(fenetres, function (el) {
      return el.getClientRects().length > 0 && !el.contains(_e.bandeau) && hotes.indexOf(el) < 0;
    });
  }
  // ⚠️ contrat : écouteur en CAPTURE sur document, posé à l'ouverture : il passe avant celui de historyManager.js
  //   (document, bulle), que stopPropagation coupe. Ctrl+Z / Cmd+Z retire le dernier remplissage ; Ctrl+Y et
  //   Ctrl+Maj+Z sont avalés aussi (rien à refaire ici, et le ↪ global écrirait sous la fenêtre). Un champ de saisie
  //   garde son annulation native ; une fenêtre au-dessus : touche avalée, rien retiré.
  // ⚠️ Visée en pause avec un outil armé (_mettreEnPause, interface.js > ktaOutilArme) : les trois raccourcis sont à
  //   l'outil (historyManager.js annule le dernier sommet du tracé en cours), le remplissage reste. 🩸 En pause sans
  //   outil (modale, Échap de la carte) la fenêtre les garde : sinon Ctrl+Z défait le « Valider » précédent.
  function _onKey(ev) {
    if (!_e) return;
    const k = (ev.key || "").toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (k === "z" || k === "y")) {
      if (_e.pause && typeof window.ktaOutilArme === "function" && window.ktaOutilArme()) return;
      const ae = document.activeElement, tag = ae && ae.tagName;
      const saisie = tag === "TEXTAREA" || (ae && ae.isContentEditable) ||
        (tag === "INPUT" && ["range", "checkbox", "radio", "button", "submit"].indexOf(ae.type) < 0);
      if (saisie) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (k === "z" && !ev.shiftKey && !_fenetreDessus()) _retirerDernier();
      return;
    }
    if (ev.key !== "Escape" || _fenetreDessus()) return;
    ev.stopPropagation();
    fermer();
  }
  function fermer() {
    if (!_e) return;
    if (_e.ctrl) _e.ctrl.abort();
    _lacherExecuteur();
    if (_e.couche) _e.couche.remove();
    if (_e.bandeau) _e.bandeau.remove();
    const ctx = _e.ctx;
    ctx.carte.off("click", _onClic);
    document.removeEventListener("keydown", _onKey, true);
    _e = null;
    _majCurseur();
    ctx.sortir();
  }
  // Réticule rouge de précision (css/style.css > « Curseur de précision ») pendant la pipette et le cadre : le centre
  // de la croix (hotspot 14,14) est le pixel lu. ⚠️ Classe PROPRE au parcours : kta-precision-mode est recalculée par
  // interface.js > _initPrecisionCursor à chaque écriture d'un flag window.modeX, elle effacerait la nôtre.
  function _majCurseur() {
    const viser = !!_e && !_e.pause &&
      ((_e.etape === "exemples" && !!_e.pipette) || _e.etape === "zone" || _e.etape === "remplir");
    document.body.classList.toggle("kta-detect-pick-mode", viser);
    _majModeClic(viser);
  }
  // ── Un seul mode de clic à la fois ──
  // ⚠️ contrat : sur la carte du plan, la visée (pipette, cadre, Remplir) est inscrite au registre des outils
  //   (interface.js > ktaInscrireModeClic). Armer un outil de dessin, de mesure ou un point la met en pause
  //   (_mettreEnPause) ; viser de nouveau désarme l'outil (_desactiverTousLesModes). La fenêtre, les remplissages et
  //   l'aperçu restent. Ailleurs (Générateur, sa propre carte) : rien d'inscrit, aucun outil n'y prend les clics.
  // 🩸 `_inscrit` est écrit AVANT _desactiverTousLesModes : sinon la pause rappelée par le registre réinscrirait.
  function _majModeClic(viser) {
    const tenir = viser && !!_e && _e.ctx.carte === window.map;
    if (tenir === _inscrit) return;
    _inscrit = tenir;
    if (!tenir) {
      if (typeof window.ktaRetirerModeClic === "function") window.ktaRetirerModeClic(MODE_CLIC);
      return;
    }
    if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
    if (typeof window.ktaInscrireModeClic === "function") window.ktaInscrireModeClic(MODE_CLIC, _mettreEnPause);
  }
  // Un outil s'arme : pipette lâchée ; cadre et Remplir en pause (coins, remplissages et aperçu gardés).
  function _mettreEnPause() {
    if (!_e) return;
    _e.pipette = null;
    if (_e.etape === "zone" || _e.etape === "remplir") _e.pause = true;
    _majBandeau();
  }
  // Ligne et bouton « reprendre » d'une visée en pause (cadre, Remplir), sinon rien.
  function _htmlPause() {
    const remplir = _e.etape === "remplir";
    if (!_e.pause || (!remplir && _e.etape !== "zone")) return "";
    return '<span class="kta-detect-aide-retirer kta-detect-pause">' + _esc(_t("detect.pause.aide")) + "</span>" +
      '<button type="button" class="kta-btn kta-btn-primary" data-detect="reprendre">' +
      window.ktaIcone(remplir ? "paint-bucket" : "crosshair") + " " +
      _esc(_t(remplir ? "detect.remplir.bouton" : "detect.pause.cadre")) + "</button>";
  }
  // Harnais : état lisible sans DOM.
  function etat() {
    if (!_e) return null;
    const a = _e.apercu;
    const ga = _galeries() && a ? a : null;
    return { etape: _e.etape, cible: _e.cible, pause: !!_e.pause,
             exemples: { a: _e.couleurs.a.length, b: _e.couleurs.b.length, f: _e.couleurs.f.length,
                         g: _e.couleurs.g.length },
             pipette: _e.pipette, coins: _e.coins.length, curseurs: _e.curseurs, lectures: _e.lectures,
             recalculs: _e.recalculs, recalculable: !!_e.recalculable, affiner: _affinerActif(),
             tolerances: _e.deduits && _e.curseurs ? _classes().reduce(function (o, c) {
               o[c.id] = c.tolerance; return o;
             }, {}) : null,
             galeries: _galeries() ? { axes: _e.axes.length, type: _e.typeGalerie, types: _typesTraces().map(
               function (t) { return t.id; }), reglages: Object.assign({}, _e.reglagesG), enCours: !!_e.remplissage,
               remplis: _e.remplisG.length,
               n: ga ? ga.objets.length : 0, retires: ga ? ga.retires.size : 0, deja: ga ? ga.deja : 0,
               accroches: ga ? ga.accroches : 0,
               traces: ga ? ga.objets.filter(function (o, i) { return !ga.retires.has(i); }).map(function (o) {
                 return o.points;
               }) : [] } : null,
             apercu: a && !ga ? { n: a.objets.length, traits: a.objets.filter(function (o) { return o.trait; }).length,
                           retires: a.retires.size, deja: a.deja, tropGrands: a.tropGrands,
                           ecartees: a.ecartees } : null,
             remplir: _e.etape === "remplir" ? { n: _remplisGardes().length, type: _e.typeRemplir,
               types: _typesRemplir().map(function (t) { return t.id; }),
               lignes: _typesRemplir().filter(function (t) { return t.ligne; }).map(function (t) { return t.id; }),
               typeFerme: _e.typeFerme, typeLigne: _e.typeLigne, structures: _nbStructuresRemplies(),
               enCours: !!_e.remplissage,
               sommets: _remplisGardes().map(function (z) { return z.lignes ? z.lignes[0].points.length : z.points.length; }),
               fronts: [].concat.apply([], _remplisGardes().map(function (z) {
                 return (z.lignes || []).map(function (l) { return { points: l.points, accroches: l.accroches }; });
               })), bouts: _remplisGardes().map(function (z) { return z.bouts || null; }) } : null };
  }

  return { ouvrir: ouvrir, fermer: fermer, etat: etat, contextePlan: contextePlan, PREFIXE: PREFIXE };
})();
