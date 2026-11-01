/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// vue3d.js — vue 3D à la première personne autour de la position du tracker (bêta, tuile 🧊 du menu Tracker).
// Chargé à la demande par interface.js > _tuileVue3D (avec css/vue3d.css) ; three.js (lib/three/) n'est importé
// qu'à la première ouverture. Les quatre fichiers sont précachés par sw.js (la 3D sert sous terre, hors réseau).
// Expose : window.KtaVue3D = { ouvrir(opts) → Promise<bool>, fermer() → Promise<bool recalé>, etat(),
//   mesurer(opts), basculerVue(), basculerSuivi(), incliner(deg), avancer(m), tourner(deg), suivre(),
//   placer(x, y, cap) }.
//   opts : { distanceVue (m), tuiles (bool), depart {x, y, cap}, densiteMax, stats, attenteReprise (ms) }.
// Scène (mètres : x = x image / scale, z = y image / scale, y = hauteur) : structures extrudées du sol à la
// hauteur du plan (Volume exploité), zones, tracés et itinéraire au sol, POI en panneaux ; niveau actif seul.
// Tuiles carrées construites autour de la position, jetées au loin ; lampe frontale et brouillard noir bornent
// ce qui est dessiné. Rendu seulement quand quelque chose bouge (batterie).
// ⚠️ contrat : déplacement = règle du pas du tracker, jamais une copie (tracking.js > ktaEstAccessible,
// ktaSegmentsBloquesParStructure), sur la largeur d'un corps. Le tracker n'est pas déplacé en route (décision
// produit) : à la fermeture, si le suivi est actif et qu'on s'est déplacé, « Je suis ici ? » propose de le recaler
// là (tracking.js > recalerTrackerSurPoint).
// 🩸 three.js est un module ES : import() dynamique depuis ce script classique, URL absolue (pas d'import map,
// la CSP refuse tout script en ligne). Fermer libère le contexte WebGL (forceContextLoss) : un navigateur en
// garde peu (iOS ~ 8, Chrome 16). Contexte perdu en route : on attend sa reprise (three.js recharge tout), la
// vue se ferme avec un message si elle ne revient pas.
// Doc : docs/ETUDE_VUE_3D.md, docs/architecture/tracking.md § Vue 3D · Garde-fou : scripts/smoke/checkup-vue-3d.js

(function () {
  "use strict";

  const URL_THREE = "lib/three/three.module.js";
  const DISTANCE_VUE = 30;          // m : au-delà, brouillard noir complet et tuiles masquées
  const TUILE = 16;                 // m : côté d'une tuile de géométrie
  const TUILES_PAR_IMAGE = 3;       // tuiles construites au plus par image après l'ouverture (pas d'à-coup)
  const HAUTEUR_DEFAUT = 2;         // m, comme ⛏️ Volume exploité
  const OEIL = 1.6;                 // m
  const RAYON_CORPS = 0.4;          // m : demi-largeur du corps, gardée devant et sur les côtés (un mur en ligne
                                    // de 0,4 m est dessiné à 0,2 m de son axe : on reste à 0,2 m de sa face)
  const RAILS = [0, -1, 1];         // couloirs balayés, en part de RAYON_CORPS de part et d'autre de l'axe
  const RAYONS = 12;                // rayons de RAYON_CORPS autour du point d'arrivée (un tous les 30°)
  const VITESSE = 2.8;              // m/s au pavé et au clavier (explorer, pas marcher : le tracker n'en dépend pas)
  const FACTEUR_RAPIDE = 2.5;       // pas rapide : Maj maintenue, ou ▲ maintenu plus de APPUI_LONG
  const APPUI_LONG = 600;           // ms
  const INCLINAISON = { defaut: 60, min: 15, max: 85, pas: 5 };   // ° de la vue plongeante (90 = verticale)
  const RECUL_PLONGEE = 18.4;       // m entre la caméra plongeante et le point visé, 2 m devant soi
  const ROTATION = 90;              // °/s
  const EPAISSEUR_MUR_LIGNE = 0.4;  // m
  const EPAISSEUR_FRONT = 0.3;      // m
  const LARGEUR_TRACE = 0.25;       // m
  const LARGEUR_ITI = 0.5;          // m
  const HAUTEUR_REMBLAIS = 0.6;     // part de la hauteur du plan
  const PANNEAU = { l: 1.6, h: 0.5 };   // m : taille d'un panneau de POI de près
  const HAUTEUR_MUR = 0.98;         // part de la hauteur du plan : un mur passe toujours sous pilier et front
  // Sol et ciel de carrière (plafond, à la hauteur du plan) : même teinte sable calcaire, grain procédural répété
  // (bruit dessiné dans un canvas, aucune image téléchargée). Couleur de la scène, pas de la charte de l'UI.
  const COULEUR_CALCAIRE = "#c9b48c";
  const GRAIN_TAILLE = 128;         // px du motif
  const GRAIN_METRES = 2;           // m couverts par un motif
  const ATTENTE_REPRISE = 8000;     // ms d'écran visible sans contexte avant de renoncer à la reprise
  const SEUIL_RECALAGE = 0.5;       // m d'écart avec le tracker sous lequel « Je suis ici ? » ne se pose pas

  let THREE = null;
  let _import = null;
  let _e = null;                    // état de la vue ouverte (null = fermée)
  let _dernierGl = null;            // contexte de la dernière vue fermée (checkup : libéré ou non)
  let _derniereFermeture = null;    // "utilisateur" | "contexte" (checkup)

  // Textes lus au rendu (langue courante) ; sans I18n, la clé.
  function _t(cle) { return window.I18n && typeof window.I18n.t === "function" ? window.I18n.t(cle) : cle; }

  function _toast(cle) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(_t(cle), "warn");
  }

  function _alerte(cle) {
    if (typeof window.ktaAlerte === "function") window.ktaAlerte(_t(cle), { type: "erreur" });
  }

  function _echelle() {
    const sc = Number(window.APP_CONFIG && window.APP_CONFIG.scale);
    return Number.isFinite(sc) && sc > 0 ? sc : 0;
  }

  function _chargerThree() {
    if (THREE) return Promise.resolve(THREE);
    if (!_import) {
      _import = import(new URL(URL_THREE, document.baseURI).href)
        .then(function (m) { THREE = m; return m; })
        .catch(function (err) { _import = null; throw err; });
    }
    return _import;
  }

  function _chargerCss() {
    if (document.getElementById("kta-vue3d-css")) return Promise.resolve(true);
    return new Promise(function (resolve) {
      const l = document.createElement("link");
      l.id = "kta-vue3d-css";
      l.rel = "stylesheet";
      l.href = "css/vue3d.css";
      l.addEventListener("load", function () { resolve(true); });
      l.addEventListener("error", function () { resolve(false); });
      document.head.appendChild(l);
    });
  }

  // ── Données du plan (session + calques embarqués, visibles ou non, comme le pas du tracker) ──────────

  function _tab(f) { try { return (typeof f === "function" ? f() : []) || []; } catch (err) { return []; } }

  function _niveauCourant() {
    const c = window.APP_CONFIG || {};
    if (c.multiLevel !== true) return null;
    const suivi = typeof window.getTrackingActif === "function" && window.getTrackingActif();
    const lvlTracker = typeof window.getTrackerLevel === "function";
    if (_e && _e.mode === "suivi" && suivi && lvlTracker) return window.getTrackerLevel();
    return Number.isInteger(c.activeLevel) ? c.activeLevel : 0;
  }

  function _surNiveau(o, niveau) {
    return niveau === null || (Number.isInteger(o.level) ? o.level : 0) === niveau;
  }

  function _collecter(niveau) {
    const ok = function (o) { return o && Array.isArray(o.points) && _surNiveau(o, niveau); };
    const roads = _tab(window.getRoads).filter(function (r) { return !r._preview; })
      .concat(_tab(window.getAllEmbeddedRoads));
    return {
      structures: _tab(window.getStructures).concat(_tab(window.getAllEmbeddedStructures)).filter(ok),
      zones: _tab(window.getZones).concat(_tab(window.getAllEmbeddedZones)).filter(ok),
      roads: roads.filter(ok),
      points: _tab(window.getEditorPoints).concat(_tab(window.getAllEmbeddedPoints)).filter(function (p) {
        return p && Number.isFinite(p.x) && Number.isFinite(p.y) && _surNiveau(p, niveau);
      })
    };
  }

  function _estLigne(type) {
    if (typeof window.isStructurePolylineType === "function") return window.isStructurePolylineType(type);
    return type === "mur-ligne" || type === "front-1" || type === "front-2";
  }

  // Couleur du canon (aplat, couleur choisie par l'utilisateur comprise) → THREE.Color, en cache par clé.
  function _couleur(cat, cle, champ) {
    const k = cat + "|" + cle + "|" + (champ || "");
    let c = _e.couleurs.get(k);
    if (c) return c;
    let hex = null;
    if (champ && typeof window.ktaResolveStyle === "function") {
      const s = window.ktaResolveStyle(cat, cle, { flat: true });
      hex = s && s[champ];
    }
    if (!hex && typeof window.ktaSwatchColor === "function") hex = window.ktaSwatchColor(cat, cle);
    c = new THREE.Color();
    try { c.setStyle(hex || "#888888"); } catch (err) { c.set(0x888888); }
    _e.couleurs.set(k, c);
    return c;
  }

  // ── Index des tuiles : chaque objet va dans la tuile de son centre ; la tuile retient l'emprise réelle ──────

  function _indexer(d, sc, taille) {
    const tuiles = new Map();
    const range = function (ix, iz) {
      const k = ix + "," + iz;
      let t = tuiles.get(k);
      if (!t) {
        t = { cle: k, s: [], z: [], r: [], p: [], x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, obj: null };
        tuiles.set(k, t);
      }
      return t;
    };
    const emprise = function (t, pts) {
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i].x / sc, z = pts[i].y / sc;
        if (x < t.x0) t.x0 = x; if (x > t.x1) t.x1 = x;
        if (z < t.z0) t.z0 = z; if (z > t.z1) t.z1 = z;
      }
    };
    const centre = function (pts) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      }
      return [(x0 + x1) / 2 / sc, (y0 + y1) / 2 / sc];
    };
    const cle = function (x, z) { return taille ? [Math.floor(x / taille), Math.floor(z / taille)] : [0, 0]; };
    const objets = function (liste, champ) {
      for (let i = 0; i < liste.length; i++) {
        const o = liste[i];
        if (o.points.length < 2) continue;
        const c = centre(o.points), k = cle(c[0], c[1]);
        const t = range(k[0], k[1]);
        t[champ].push(o);
        emprise(t, o.points);
      }
    };
    objets(d.structures, "s");
    objets(d.zones, "z");
    // Tracés : par segment (un tracé traverse tout le plan).
    for (let i = 0; i < d.roads.length; i++) {
      const r = d.roads[i], pts = r.points;
      for (let j = 0; j + 1 < pts.length; j++) {
        const a = pts[j], b = pts[j + 1];
        if (!a || !b) continue;
        const k = cle((a.x + b.x) / 2 / sc, (a.y + b.y) / 2 / sc);
        const t = range(k[0], k[1]);
        t.r.push({ type: r.type, a: a, b: b });
        emprise(t, [a, b]);
      }
    }
    for (let i = 0; i < d.points.length; i++) {
      const p = d.points[i], k = cle(p.x / sc, p.y / sc);
      const t = range(k[0], k[1]);
      t.p.push(p);
      emprise(t, [p]);
    }
    return tuiles;
  }

  // ── Géométrie : triangles non indexés, normales int8, couleurs uint8 (18 octets par sommet) ───────────

  function Lot() { this.p = []; this.n = []; this.c = []; }

  // Triangle orienté vers `n` (l'ordre des sommets est corrigé au besoin : face avant = côté de la normale).
  Lot.prototype.tri = function (a, b, c, n, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const t = b; b = c; c = t; }
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const nx = Math.round(n[0] * 127), ny = Math.round(n[1] * 127), nz = Math.round(n[2] * 127);
    const r = Math.round(col.r * 255), g = Math.round(col.g * 255), bl = Math.round(col.b * 255);
    for (let i = 0; i < 3; i++) { this.n.push(nx, ny, nz); this.c.push(r, g, bl); }
  };

  Lot.prototype.quad = function (a, b, c, d, n, col) { this.tri(a, b, c, n, col); this.tri(a, c, d, n, col); };

  Lot.prototype.geometrie = function () {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Int8Array(this.n), 3, true));
    g.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(this.c), 3, true));
    g.computeBoundingSphere();
    return g;
  };

  // Contour en mètres, sans doublon de fermeture ; sens rendu positif (aire > 0 en x, z).
  function _anneau(points, sc) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const x = p.x / sc, z = p.y / sc;
      const der = out[out.length - 1];
      if (der && Math.abs(der[0] - x) < 1e-6 && Math.abs(der[1] - z) < 1e-6) continue;
      out.push([x, z]);
    }
    if (out.length > 2 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-6 &&
        Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
    let aire = 0;
    for (let i = 0, j = out.length - 1; i < out.length; j = i++) aire += out[j][0] * out[i][1] - out[i][0] * out[j][1];
    if (aire < 0) out.reverse();
    return out;
  }

  function _dessus(lot, ring, y, col) {
    const v2 = ring.map(function (q) { return new THREE.Vector2(q[0], q[1]); });
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(v2, []); } catch (err) { return; }
    const haut = [0, 1, 0];
    for (let i = 0; i < tris.length; i++) {
      const a = ring[tris[i][0]], b = ring[tris[i][1]], c = ring[tris[i][2]];
      lot.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], haut, col);
    }
  }

  // Prisme : faces latérales vers l'extérieur (contour de sens positif), dessus facultatif.
  function _prisme(lot, ring, y0, y1, col, dessus) {
    if (ring.length < 3) return;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const n = [dz / l, 0, -dx / l];
      lot.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], n, col);
    }
    if (dessus) _dessus(lot, ring, y1, col);
  }

  // Mur d'épaisseur réelle le long d'une polyligne : un pavé par segment, prolongé d'une demi-épaisseur aux deux
  // bouts pour fermer les angles.
  function _murLigne(lot, points, sc, ep, h, col) {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1];
      if (!a || !b) continue;
      let ax = a.x / sc, az = a.y / sc, bx = b.x / sc, bz = b.y / sc;
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const ux = dx / l, uz = dz / l, e = ep / 2;
      ax -= ux * e; az -= uz * e; bx += ux * e; bz += uz * e;
      const nx = -uz * e, nz = ux * e;
      const ring = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
      let aire = 0;
      for (let k = 0, j = 3; k < 4; j = k++) aire += ring[j][0] * ring[k][1] - ring[k][0] * ring[j][1];
      if (aire < 0) ring.reverse();
      _prisme(lot, ring, 0, h, col, true);
    }
  }

  function _ruban(lot, a, b, sc, larg, y, col) {
    const ax = a.x / sc, az = a.y / sc, bx = b.x / sc, bz = b.y / sc;
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    if (l < 1e-6) return;
    const nx = -dz / l * larg / 2, nz = dx / l * larg / 2;
    const ex = dx / l * larg / 2, ez = dz / l * larg / 2;   // recouvrement aux jointures
    lot.quad([ax - ex + nx, y, az - ez + nz], [bx + ex + nx, y, bz + ez + nz], [bx + ex - nx, y, bz + ez - nz],
      [ax - ex - nx, y, az - ez - nz], [0, 1, 0], col);
  }

  // ⚠️ contrat (décision produit) : un mur (polygone ou en ligne) est toujours SOUS un pilier ou un front de son
  // niveau. Là où ils se chevauchent, le pilier ou le front l'emporte : le mur monte à HAUTEUR_MUR de la hauteur et
  // son matériau est reculé en profondeur (polygonOffset), d'où aucun scintillement sur les faces confondues et
  // un dessus de pilier toujours visible.
  function _estMur(type) { return type === "mur" || type === "mur-ligne"; }

  function _construireTuile(t) {
    const sc = _e.sc, h = _e.hauteur;
    const opaque = new Lot(), murs = new Lot(), transp = new Lot(), lumineux = new Lot();
    for (let i = 0; i < t.s.length; i++) {
      const s = t.s[i], col = _couleur("structures", s.type);
      const lot = _estMur(s.type) ? murs : opaque, hs = _estMur(s.type) ? h * HAUTEUR_MUR : h;
      if (_estLigne(s.type)) {
        const ep = s.type === "mur-ligne" ? EPAISSEUR_MUR_LIGNE : EPAISSEUR_FRONT;
        _murLigne(lot, s.points, sc, ep, hs, col);
      } else {
        _prisme(lot, _anneau(s.points, sc), 0, hs, col, true);
      }
    }
    for (let i = 0; i < t.z.length; i++) {
      const z = t.z[i], ring = _anneau(z.points, sc);
      if (ring.length < 3) continue;
      if (z.type === "remblais") {
        _prisme(opaque, ring, 0, h * HAUTEUR_REMBLAIS, _couleur("zones", z.type, "fillColor"), true);
      } else if (z.type === "eau") {
        _dessus(transp, ring, 0.04, _couleur("zones", z.type, "fillColor"));
      } else if (z.type === "inaccessible") {
        _dessus(opaque, ring, 0.02, _couleur("zones", z.type, "fillColor"));
        _prisme(transp, ring, 0, h, _couleur("zones", z.type, "color"), false);   // rideau visible des deux côtés
      } else {
        _dessus(opaque, ring, 0.02, _couleur("zones", z.type, "fillColor"));   // effondrement, types perso
      }
    }
    for (let i = 0; i < t.r.length; i++) {
      const r = t.r[i], col = _couleur("traces", r.type, "color");
      if (r.type === "itinerary") _ruban(lumineux, r.a, r.b, sc, LARGEUR_ITI, 0.05, col);
      else _ruban(opaque, r.a, r.b, sc, LARGEUR_TRACE, 0.03, col);
    }
    const groupe = new THREE.Group();
    const ajouter = function (lot, mat, ordre, famille) {
      const g = lot.geometrie();
      if (!g) return;
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = ordre;
      m.matrixAutoUpdate = false;
      m.userData.famille = famille;
      groupe.add(m);
    };
    ajouter(opaque, _e.mats.opaque, 0, "opaque");
    ajouter(murs, _e.mats.murs, 0, "murs");
    ajouter(lumineux, _e.mats.lumineux, 1);
    ajouter(transp, _e.mats.transp, 2);
    for (let i = 0; i < t.p.length; i++) {
      const sp = _panneau(t.p[i]);
      if (sp) groupe.add(sp);
    }
    _e.scene.add(groupe);
    t.obj = groupe;
    _e.sale = true;
  }

  function _libererTuile(t) {
    if (!t.obj) return;
    t.obj.traverse(function (o) {
      // 🩸 Un Sprite partage la géométrie de three.js : ne jamais la libérer, seulement sa texture.
      if (o.geometry && !o.isSprite) o.geometry.dispose();
      if (o.isSprite && o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      if (o.isSprite) _e.panneaux.delete(o);
    });
    _e.scene.remove(t.obj);
    t.obj = null;
  }

  // ── POI : panneau (icône + nom) toujours face à la caméra, à hauteur de tête ─────────────────────────
  // ⚠️ contrat (décision produit) : un panneau n'est JAMAIS caché par la géométrie (depthTest coupé, dessiné après
  // tout) : un POI relevé dans un pilier ou derrière reste lisible. Borné à la distance de vue, plus petit et plus
  // pâle au loin (_majPanneaux). Un POI dans un volume fermé (pilier, mur, type perso) est collé contre la face de
  // ce volume la plus proche de la caméra, pour ne pas sembler flotter dans la roche.

  function _panneau(p) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 80;
    const ctx = cv.getContext("2d");
    const nom = String(p.id || p.name || p.nom || (Array.isArray(p.tags) && p.tags[0]) || "").slice(0, 28);
    const dessiner = function (img) {
      ctx.clearRect(0, 0, 256, 80);
      ctx.fillStyle = "rgba(10,13,24,0.82)";
      ctx.fillRect(0, 0, 256, 80);
      ctx.strokeStyle = "#f4c542";
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, 253, 77);
      if (img) { try { ctx.drawImage(img, 8, 8, 64, 64); } catch (err) { /* image illisible : texte seul */ } }
      ctx.fillStyle = "#e8eaf0";
      ctx.font = "600 24px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(nom, img ? 82 : 12, 40, img ? 166 : 232);
    };
    dessiner(null);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, fog: true, depthWrite: false, depthTest: false,
      transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(PANNEAU.l, PANNEAU.h, 1);
    sp.position.set(p.x / _e.sc, Math.min(_e.oeil + 0.4, _e.hauteur - 0.3), p.y / _e.sc);
    sp.renderOrder = 10;
    sp.userData.poi = { x: p.x / _e.sc, z: p.y / _e.sc, anneau: _volumeContenant(p.x / _e.sc, p.y / _e.sc) };
    _e.panneaux.add(sp);
    let url = null;
    try {
      url = typeof window.getIconUrlForPoint === "function" ? window.getIconUrlForPoint(p) : null;
    } catch (err) { url = null; }
    if (url) {
      const img = new Image();
      img.addEventListener("load", function () {
        if (!_e || !mat.map) return;
        dessiner(img);
        tex.needsUpdate = true;
        _e.sale = true;
      });
      img.src = url;
    }
    return sp;
  }

  // Grille des volumes fermés du niveau (anneaux en mètres), faite à chaque _reindexer : un POI y trouve son pilier.
  function _grilleVolumes(structures) {
    const g = new Map(), c = 8;
    for (let i = 0; i < structures.length; i++) {
      const s = structures[i];
      if (_estLigne(s.type)) continue;
      const a = _anneau(s.points, _e.sc);
      if (a.length < 3) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      a.forEach(function (q) {
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]);
      });
      for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
        for (let gz = Math.floor(z0 / c); gz <= Math.floor(z1 / c); gz++) {
          const k = gx + "," + gz;
          if (!g.has(k)) g.set(k, []);
          g.get(k).push(a);
        }
      }
    }
    _e.volumes = { cases: g, c: c };
  }

  function _volumeContenant(x, z) {
    const v = _e.volumes;
    if (!v) return null;
    const l = v.cases.get(Math.floor(x / v.c) + "," + Math.floor(z / v.c));
    if (!l) return null;
    for (let i = 0; i < l.length; i++) {
      const a = l[i];
      let dedans = false;
      for (let j = 0, k = a.length - 1; j < a.length; k = j++) {
        const p = a[j], q = a[k];
        if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) dedans = !dedans;
      }
      if (dedans) return a;
    }
    return null;
  }

  // Point du contour le plus proche de (cx, cz), avancé de 8 cm vers lui (devant la face, pas dedans).
  function _bordProche(a, cx, cz) {
    let best = null, d = Infinity;
    for (let i = 0; i < a.length; i++) {
      const p = a[i], q = a[(i + 1) % a.length], vx = q[0] - p[0], vz = q[1] - p[1], l2 = vx * vx + vz * vz;
      const t = l2 ? Math.max(0, Math.min(1, ((cx - p[0]) * vx + (cz - p[1]) * vz) / l2)) : 0;
      const x = p[0] + t * vx, z = p[1] + t * vz, dd = Math.hypot(cx - x, cz - z);
      if (dd < d) { d = dd; best = [x, z]; }
    }
    if (d > 1e-6) { best[0] += (cx - best[0]) / d * 0.08; best[1] += (cz - best[1]) / d * 0.08; }
    return best;
  }

  // Panneaux : dans la distance de vue (comptée depuis soi), échelle 1 → 0,5 et opacité 1 → 0,4 vers la limite.
  function _majPanneaux() {
    const e = _e, cam = e.camera.position, px = e.pos.x / e.sc, pz = e.pos.y / e.sc;
    e.panneaux.forEach(function (sp) {
      const u = sp.userData.poi;
      let x = u.x, z = u.z;
      if (u.anneau) { const b = _bordProche(u.anneau, cam.x, cam.z); x = b[0]; z = b[1]; }
      const k = Math.hypot(x - px, z - pz) / e.distance;
      sp.visible = k <= 1;
      if (!sp.visible) return;
      sp.position.x = x; sp.position.z = z;
      sp.scale.set(PANNEAU.l * (1 - 0.5 * k), PANNEAU.h * (1 - 0.5 * k), 1);
      sp.material.opacity = 1 - 0.6 * k;
    });
  }

  // ── Scène ──────────────────────────────────────────────────────────────────────────────────────────

  // Motif calcaire répétable : teinte COULEUR_CALCAIRE, taches douces (bruit de valeur 8 × 8 interpolé, bouclé sur
  // les bords pour que la répétition ne se voie pas) et grain fin par pixel. ~1 ms, 64 Ko de texture.
  function _grainCalcaire() {
    const n = GRAIN_TAILLE, g = 8, cv = document.createElement("canvas");
    cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(n, n), base = new THREE.Color(COULEUR_CALCAIRE);
    let graine = 7;
    const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
    const grille = [];
    for (let i = 0; i < g * g; i++) grille.push(alea());
    const v = function (x, y) { return grille[((y + g) % g) * g + ((x + g) % g)]; };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const fx = x / n * g, fy = y / n * g, x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const haut = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
        const bas = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
        const k = 0.86 + (haut + (bas - haut) * sy) * 0.2 + (alea() - 0.5) * 0.1;
        const o = (y * n + x) * 4;
        img.data[o] = Math.min(255, base.r * 255 * k);
        img.data[o + 1] = Math.min(255, base.g * 255 * k);
        img.data[o + 2] = Math.min(255, base.b * 255 * k);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(_e.distance * 2.4 / GRAIN_METRES, _e.distance * 2.4 / GRAIN_METRES);
    tex.anisotropy = 4;
    return tex;
  }

  function _materiaux() {
    const grain = _e.grain = _grainCalcaire();
    return {
      opaque: new THREE.MeshLambertMaterial({ vertexColors: true }),
      murs: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1,
        polygonOffsetUnits: 1 }),
      lumineux: new THREE.MeshBasicMaterial({ vertexColors: true }),
      transp: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45,
        depthWrite: false, side: THREE.DoubleSide }),
      sol: new THREE.MeshLambertMaterial({ map: grain }),
      plafond: new THREE.MeshLambertMaterial({ map: grain, side: THREE.BackSide }),
      avatar: new THREE.MeshBasicMaterial({ color: 0xf4c542 })
    };
  }

  function _monterScene() {
    const e = _e;
    e.panneaux = new Set();
    e.scene = new THREE.Scene();
    e.scene.background = new THREE.Color(0x000000);
    e.scene.fog = new THREE.Fog(0x000000, e.distance * 0.45, e.distance);
    e.camera = new THREE.PerspectiveCamera(70, 1, 0.05, e.distance + 5);
    e.camera.rotation.order = "YXZ";
    e.scene.add(e.camera);
    e.mats = _materiaux();
    // Sol et plafond : un carré qui suit la position, plus grand que la distance de vue.
    const plan = new THREE.PlaneGeometry(e.distance * 2.4, e.distance * 2.4, 8, 8);
    plan.rotateX(-Math.PI / 2);
    e.sol = new THREE.Mesh(plan, e.mats.sol);
    e.plafond = new THREE.Mesh(plan, e.mats.plafond);
    e.plafond.position.y = e.hauteur;
    e.scene.add(e.sol, e.plafond);
    // Tête (porte la lampe) et silhouette visible en vue plongeante.
    e.tete = new THREE.Object3D();
    e.tete.rotation.order = "YXZ";
    e.scene.add(e.tete);
    // Lampe frontale : portée = distance de vue (au-delà, le brouillard est noir de toute façon), décroissance douce.
    e.lampe = new THREE.SpotLight(0xfff1d6, 24, e.distance, 0.62, 0.55, 1.2);
    e.lampe.position.set(0, 0.05, 0);
    e.lampe.target.position.set(0, -0.3, -1);
    e.tete.add(e.lampe, e.lampe.target);
    e.halo = new THREE.PointLight(0xfff1d6, 1.6, 4.5, 2);
    e.tete.add(e.halo);
    e.ambiance = new THREE.AmbientLight(0xffffff, 0.04);
    e.scene.add(e.ambiance);
    const cone = new THREE.ConeGeometry(0.35, 0.9, 12);
    cone.rotateX(-Math.PI / 2);
    e.avatar = new THREE.Mesh(cone, e.mats.avatar);
    e.avatar.visible = false;
    e.scene.add(e.avatar);
  }

  function _reindexer() {
    const e = _e;
    e.tuiles.forEach(_libererTuile);
    const t0 = performance.now();
    e.niveau = _niveauCourant();
    const d = _collecter(e.niveau);
    e.compte = { structures: d.structures.length, zones: d.zones.length, roads: d.roads.length,
      points: d.points.length };
    _grilleVolumes(d.structures);
    e.tuiles = _indexer(d, e.sc, e.tuilesActives ? TUILE : 0);
    e.msIndex = performance.now() - t0;
    _gererTuiles(true);
  }

  // Tuiles proches construites (toutes à l'ouverture, puis quelques-unes par image), lointaines jetées.
  function _gererTuiles(tout) {
    const e = _e, px = e.pos.x / e.sc, pz = e.pos.y / e.sc;
    const rVue = e.vue === "plongee" ? e.distance * 1.4 : e.distance;
    const rGarde = rVue + 2 * TUILE;
    let construites = 0;
    const t0 = performance.now();
    e.tuiles.forEach(function (t) {
      const dx = Math.max(t.x0 - px, 0, px - t.x1), dz = Math.max(t.z0 - pz, 0, pz - t.z1);
      const d = Math.hypot(dx, dz);
      if (d <= rVue) {
        if (!t.obj && (tout || construites < TUILES_PAR_IMAGE)) { _construireTuile(t); construites++; }
        if (t.obj && !t.obj.visible) { t.obj.visible = true; e.sale = true; }
      } else if (d > rGarde) {
        if (t.obj) { _libererTuile(t); e.sale = true; }
      } else if (t.obj && t.obj.visible) {
        t.obj.visible = false; e.sale = true;
      }
    });
    if (construites) e.msTuiles += performance.now() - t0;
  }

  function _placerCamera() {
    const e = _e, x = e.pos.x / e.sc, z = e.pos.y / e.sc, cap = e.cap * Math.PI / 180;
    e.tete.position.set(x, e.oeil, z);
    e.tete.rotation.set(e.tangage, -cap, 0);
    e.sol.position.set(x, 0, z);
    // Le carré de sol suit la position : le motif est décalé d'autant pour rester fixe sous les pieds.
    e.grain.offset.set(x / GRAIN_METRES, -z / GRAIN_METRES);
    e.plafond.position.set(x, e.hauteur, z);
    e.avatar.position.set(x, 0.45, z);
    e.avatar.rotation.set(0, -cap, 0);
    if (e.vue === "plongee") {
      const fx = Math.sin(cap), fz = -Math.cos(cap), i = e.inclinaison * Math.PI / 180;
      const vx = x + fx * 2, vz = z + fz * 2, h = RECUL_PLONGEE * Math.cos(i);
      e.camera.position.set(vx - fx * h, RECUL_PLONGEE * Math.sin(i), vz - fz * h);
      e.camera.lookAt(vx, 0, vz);
    } else {
      e.camera.position.set(x, e.oeil, z);
      e.camera.rotation.set(e.tangage, -cap, 0);
    }
    _majPanneaux();
    _majBoussole();
  }

  // Rose des vents : même convention que la boussole 2D (compass.js, rotate(-cap)), sur le cap RÉEL de la vue :
  // cap plan − calibration Nord du plan (tracking.js > _getPlanRelHeading fait l'inverse). Sans calibration, la
  // rose montre le haut du plan ; seul son libellé accessible le dit (aucun texte à l'écran, décision produit).
  function _majBoussole() {
    const e = _e;
    if (!e.rose) return;
    const reel = ((e.cap - e.nord) % 360 + 360) % 360;
    if (Math.abs(reel - e.roseAngle) < 0.5) return;
    e.roseAngle = reel;
    e.rose.style.transform = "rotate(" + (-reel).toFixed(1) + "deg)";
  }

  function _lireNord() {
    const e = _e;
    e.nordCalibre = typeof window.getPlanNorthCalibre === "function" && window.getPlanNorthCalibre() === true;
    const lire = typeof window.getPlanNorthOffset === "function" ? window.getPlanNorthOffset : null;
    e.nord = e.nordCalibre && lire ? Number(lire()) || 0 : 0;
    e.roseAngle = NaN;
    if (e.boussole) {
      const non = e.nordCalibre ? "" : " · " + _t("vue3d.nordNonCalibre");
      e.boussole.setAttribute("aria-label", _t("vue3d.boussole") + non);
    }
    e.sale = true;
  }

  // Inclinaison de la vue plongeante, bornée, retenue tant que la vue est ouverte.
  function incliner(deg) {
    if (!_e) return;
    _e.inclinaison = Math.max(INCLINAISON.min, Math.min(INCLINAISON.max, _e.inclinaison + deg));
    _e.sale = true;
  }

  function _appliquerVue() {
    const e = _e, haut = e.vue === "plongee";
    e.plafond.visible = !haut;
    e.avatar.visible = haut;
    e.ambiance.intensity = haut ? 0.9 : 0.04;
    e.scene.fog.near = haut ? e.distance : e.distance * 0.45;
    e.scene.fog.far = haut ? e.distance * 1.4 + 20 : e.distance;
    e.camera.far = haut ? e.distance * 1.4 + 30 : e.distance + 5;
    e.camera.updateProjectionMatrix();
    if (e.boutonVue) e.boutonVue.setAttribute("aria-pressed", haut ? "true" : "false");
    if (e.boutonsIncl) e.boutonsIncl.hidden = !haut;
    e.sale = true;
  }

  // ── Déplacement ────────────────────────────────────────────────────────────────────────────────────

  // Pas de `m` mètres dans la direction `angle` (° plan, 0 = haut de l'image), glisse le long d'un mur si un seul
  // axe passe. ⚠️ Le corps a une largeur : le pas est BALAYÉ par trois segments parallèles (axe et ± RAYON_CORPS),
  // prolongés de RAYON_CORPS devant, puis l'arrivée doit laisser libres RAYONS segments de RAYON_CORPS en étoile
  // (un disque autour de soi) ; tous jugés par la règle du tracker, en un lot (ktaSegmentsBloquesParStructure,
  // types perso compris). Déjà à moins de RAYON_CORPS d'une face (ouvert sur la position du tracker) : l'arrivée
  // peut garder des rayons bloqués, pas plus qu'au départ, sinon on resterait figé contre le mur.
  // 🩸 Avec le seul axe, on frôlait une face à quelques centimètres en biais ou en glissant : la caméra passait
  // alors dans le pilier (plan proche à 5 cm) et l'on voyait au travers ; et les types perso, dessinés en volume,
  // n'arrêtaient rien.
  function _pas(m, angle) {
    const e = _e, a = angle * Math.PI / 180;
    const dx = Math.sin(a) * m * e.sc, dy = -Math.cos(a) * m * e.sc;
    const essais = [[dx, dy], [dx, 0], [0, dy]];
    let auDepart = -1;   // rayons bloqués au départ, lus seulement si une arrivée en a
    const depart = function () { if (auDepart < 0) auDepart = _rayonsBloques(e.pos.x, e.pos.y); return auDepart; };
    for (let i = 0; i < essais.length; i++) {
      const sx = essais[i][0], sy = essais[i][1], l = Math.hypot(sx, sy);
      if (l < 1e-9) continue;
      const x1 = e.pos.x + sx, y1 = e.pos.y + sy;
      const n = _balayage(e.pos.x, e.pos.y, x1, y1, sx / l, sy / l);
      if (n < 0 || (n > 0 && n > depart())) continue;
      e.pos.x = x1; e.pos.y = y1;
      e.aBouge = true;
      e.sale = true;
      return true;
    }
    e.butees++;
    return false;
  }

  // → -1 si un couloir est coupé (ou l'arrivée hors plan / hors image de collision), sinon le nombre de rayons
  // bloqués autour de l'arrivée. Un seul lot de segments par essai (ktaSegmentsBloquesParStructure).
  function _balayage(x0, y0, x1, y1, ux, uy) {
    const r = RAYON_CORPS * _e.sc, fx = x1 + ux * r, fy = y1 + uy * r;
    const pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    if (pc && (fx < 0 || fy < 0 || fx > pc.imageWidth || fy > pc.imageHeight)) return -1;
    if (typeof window.ktaEstAccessible === "function" && !window.ktaEstAccessible(fx, fy)) return -1;
    if (typeof window.ktaSegmentsBloquesParStructure !== "function") return 0;
    const segs = [];
    for (let i = 0; i < RAILS.length; i++) {
      const ox = -uy * r * RAILS[i], oy = ux * r * RAILS[i];
      segs.push([x0 + ox, y0 + oy, fx + ox, fy + oy]);
    }
    _rayons(segs, x1, y1, r);
    const res = window.ktaSegmentsBloquesParStructure(segs, _niveauPas(), true);
    for (let i = 0; i < RAILS.length; i++) { if (res[i]) return -1; }
    let n = 0;
    for (let i = RAILS.length; i < res.length; i++) { if (res[i]) n++; }
    return n;
  }

  function _rayons(segs, x, y, r) {
    for (let i = 0; i < RAYONS; i++) {
      const a = i * 2 * Math.PI / RAYONS;
      segs.push([x, y, x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    return segs;
  }

  function _niveauPas() { return _e.niveau === null ? undefined : _e.niveau; }

  function _rayonsBloques(x, y) {
    if (typeof window.ktaSegmentsBloquesParStructure !== "function") return 0;
    const res = window.ktaSegmentsBloquesParStructure(_rayons([], x, y, RAYON_CORPS * _e.sc), _niveauPas(), true);
    return res.filter(Boolean).length;
  }

  function _passerEnLibre() { if (_e.mode !== "libre") { _e.mode = "libre"; _majBoutonSuivre(); } }

  function _trackerActif() {
    return typeof window.getTrackingActif === "function" && window.getTrackingActif() === true;
  }

  // Bouton 📍 = interrupteur « suivi » / « libre ». Grisé (mais touchable : il explique) tracker éteint.
  function _majBoutonSuivre() {
    const e = _e, b = e.boutonSuivre;
    if (!b) return;
    const dispo = _trackerActif();
    e.suiviDispo = dispo;
    b.setAttribute("aria-pressed", e.mode === "suivi" ? "true" : "false");
    b.classList.toggle("kta-v3d-inactif", !dispo);
    const t = !dispo ? _t("vue3d.suiviIndispo") : _t(e.mode === "suivi" ? "vue3d.passerLibre" : "vue3d.suivre");
    b.title = t;
    b.setAttribute("aria-label", t);
    // Mode écrit en clair : sans lui, rien ne disait qu'on était passé en libre ni comment revenir au suivi.
    b.textContent = e.mode === "suivi" ? "📍 " + _t("vue3d.etatSuivi") : "🕹️ " + _t("vue3d.etatLibre");
  }

  // Mode « suivi » : position du tracker et cap de l'appareil, la même source que le mode « plan orienté »
  // (tracking.js > getPlanRelHeading, offset Nord du plan compris ; mapBearing.js la lit aussi). Tracker
  // arrêté en route : retour au mode libre, là où l'on est.
  function basculerSuivi() {
    const e = _e;
    if (!e) return false;
    if (e.mode === "suivi") { _passerEnLibre(); return true; }
    if (!_trackerActif()) {
      _majBoutonSuivre();
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(_t("vue3d.suiviIndispo"), "warn");
      }
      return false;
    }
    suivre();
    return true;
  }

  function _lireTracker() {
    const e = _e;
    if (typeof window.getTrackingPosition !== "function") return;
    const p = window.getTrackingPosition();
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    // Lissage : un pas du tracker (~0,7 m d'un coup) glisse sur quelques images au lieu de sauter.
    const kx = p.x - e.pos.x, ky = p.y - e.pos.y;
    if (Math.abs(kx) + Math.abs(ky) > 0.01) {
      const saut = Math.hypot(kx, ky) > 10 * e.sc;
      e.pos.x = saut ? p.x : e.pos.x + kx * 0.25;
      e.pos.y = saut ? p.y : e.pos.y + ky * 0.25;
      e.sale = true;
    }
    if (typeof window.getPlanRelHeading === "function") {
      const c = Number(window.getPlanRelHeading());
      if (Number.isFinite(c)) {
        const dc = ((c - e.cap + 540) % 360) - 180;
        if (Math.abs(dc) > 0.2) { e.cap = (e.cap + dc * 0.3 + 360) % 360; e.sale = true; }
      }
    }
  }

  // ── Boucle ─────────────────────────────────────────────────────────────────────────────────────────

  function _image(ts) {
    const e = _e;
    if (!e) return;
    e.raf = requestAnimationFrame(_image);
    const dt = e.tsPrec ? Math.min(0.1, (ts - e.tsPrec) / 1000) : 0;
    e.tsPrec = ts;
    const k = e.touches;
    const rapide = k.Shift || (k.av && e.avDepuis > 0 && ts - e.avDepuis > APPUI_LONG);
    const vit = VITESSE * (rapide ? FACTEUR_RAPIDE : 1);
    const av = (k.av ? 1 : 0) - (k.ar ? 1 : 0), lat = (k.dr ? 1 : 0) - (k.ga ? 1 : 0);
    const rot = (k.td ? 1 : 0) - (k.tg ? 1 : 0);
    e.rapide = !!rapide && !!(av || lat);
    if (av || lat || rot) _passerEnLibre();
    if (rot) { e.cap = (e.cap + rot * ROTATION * dt + 360) % 360; e.sale = true; }
    if (av) _pas(vit * dt * av, e.cap);
    if (lat) _pas(vit * dt, e.cap + 90 * lat);
    if (_trackerActif() !== e.suiviDispo) {
      if (e.mode === "suivi" && !_trackerActif()) e.mode = "libre";
      _majBoutonSuivre();
    }
    if (e.mode === "suivi") _lireTracker();
    const niv = _niveauCourant();
    if (niv !== e.niveau) _reindexer();
    _gererTuiles(false);
    if (e.perdu) return;
    _redimensionner();
    if (!e.sale) return;
    e.sale = false;
    _placerCamera();
    e.renderer.render(e.scene, e.camera);
    e.images++;
    if (e.compteur) {
      e.compteurN++;
      if (ts - e.compteurT0 > 1000) {
        e.compteur.textContent = Math.round(e.compteurN * 1000 / (ts - e.compteurT0)) + " i/s · " +
          e.renderer.info.render.triangles + " tri · " + e.renderer.info.render.calls + " appels";
        e.compteurN = 0; e.compteurT0 = ts;
      }
    }
  }

  function _redimensionner() {
    const e = _e, w = e.cv.clientWidth, h = e.cv.clientHeight;
    if (!w || !h || (w === e.w && h === e.h)) return;
    e.w = w; e.h = h;
    e.renderer.setSize(w, h, false);
    e.camera.aspect = w / h;
    e.camera.updateProjectionMatrix();
    e.sale = true;
  }

  // ── Interface (aucun script en ligne : écouteurs posés ici) ──────────────────────────────────────────

  const TOUCHES = {
    ArrowUp: "av", KeyW: "av", KeyZ: "av", ArrowDown: "ar", KeyS: "ar",
    ArrowLeft: "tg", ArrowRight: "td", KeyA: "ga", KeyQ: "ga", KeyD: "dr", KeyE: "dr"
  };

  function _bouton(parent, cls, txt, titre, action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "kta-v3d-btn " + cls;
    b.textContent = txt;
    b.title = titre;
    b.setAttribute("aria-label", titre);
    if (action) b.dataset.v3d = action;
    parent.appendChild(b);
    return b;
  }

  function _monterDom(stats) {
    const e = _e;
    const ov = document.createElement("div");
    ov.id = "kta-vue3d";
    ov.className = "kta-vue3d";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", _t("vue3d.titre"));
    const cv = document.createElement("canvas");
    cv.className = "kta-v3d-canvas";
    ov.appendChild(cv);
    const haut = document.createElement("div");
    haut.className = "kta-v3d-haut";
    e.boutonSuivre = _bouton(haut, "kta-v3d-btn-mode", "📍", _t("vue3d.suivre"), "suivre");
    e.boutonVue = _bouton(haut, "", "🛰️", _t("vue3d.plongee"), "vue");
    _bouton(haut, "kta-v3d-fermer", "✕", _t("vue3d.fermer"), "fermer");
    ov.appendChild(haut);
    const pad = document.createElement("div");
    pad.className = "kta-v3d-pad";
    _bouton(pad, "kta-v3d-tg", "↶", _t("vue3d.tournerGauche"), "tg");
    _bouton(pad, "kta-v3d-av", "▲", _t("vue3d.avancer"), "av");
    _bouton(pad, "kta-v3d-td", "↷", _t("vue3d.tournerDroite"), "td");
    _bouton(pad, "kta-v3d-ga", "◀", _t("vue3d.pasGauche"), "ga");
    _bouton(pad, "kta-v3d-ar", "▼", _t("vue3d.reculer"), "ar");
    _bouton(pad, "kta-v3d-dr", "▶", _t("vue3d.pasDroite"), "dr");
    ov.appendChild(pad);
    // Inclinaison (vue plongeante seulement) : deux petits boutons à droite.
    const incl = document.createElement("div");
    incl.className = "kta-v3d-incl";
    incl.hidden = true;
    _bouton(incl, "kta-v3d-btn-petit", "▲", _t("vue3d.inclinaisonPlus"), "inclPlus");
    _bouton(incl, "kta-v3d-btn-petit", "▼", _t("vue3d.inclinaisonMoins"), "inclMoins");
    ov.appendChild(incl);
    e.boutonsIncl = incl;
    // Rose des vents (image de la boussole 2D, précachée).
    const bous = document.createElement("div");
    bous.className = "kta-v3d-boussole";
    bous.setAttribute("role", "img");
    bous.setAttribute("aria-label", _t("vue3d.boussole"));
    const rose = document.createElement("img");
    rose.className = "kta-v3d-rose";
    rose.src = "icon/compass.svg";
    rose.alt = "";
    rose.draggable = false;
    bous.appendChild(rose);
    ov.appendChild(bous);
    e.rose = rose; e.boussole = bous;
    if (stats) {
      e.compteur = document.createElement("div");
      e.compteur.className = "kta-v3d-stats";
      ov.appendChild(e.compteur);
    }
    document.body.appendChild(ov);
    e.ov = ov; e.cv = cv;
    _majBoutonSuivre();
  }

  function _brancher() {
    const e = _e, l = e.ecouteurs;
    const on = function (cible, type, f, opt) { cible.addEventListener(type, f, opt); l.push([cible, type, f, opt]); };
    // Boutons maintenus (déplacement) : pointerdown → actif jusqu'au relâchement ou à la sortie du bouton.
    const relacher = function () {
      ["av", "ar", "tg", "td", "ga", "dr"].forEach(function (k) { e.touches[k] = false; });
      e.avDepuis = 0;
    };
    on(e.ov, "pointerdown", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-v3d]");
      if (!b) return;
      const a = b.dataset.v3d;
      if (a === "fermer") { fermer(); return; }
      if (a === "vue") { basculerVue(); return; }
      if (a === "suivre") { basculerSuivi(); return; }
      if (a === "inclPlus" || a === "inclMoins") {
        ev.preventDefault();
        incliner(a === "inclPlus" ? INCLINAISON.pas * 2 : -INCLINAISON.pas * 2);
        return;
      }
      ev.preventDefault();
      e.touches[a] = true;
      // Appui long sur ▲ = pas rapide (pendant de Maj au clavier). Même base de temps que requestAnimationFrame.
      if (a === "av") e.avDepuis = performance.now();
    });
    on(window, "pointerup", relacher);
    on(window, "pointercancel", relacher);
    on(e.ov, "pointerout", function (ev) { if (ev.target.dataset && ev.target.dataset.v3d) relacher(); });
    // Glisser sur la scène : un doigt tourne (horizontal) et lève / baisse les yeux (vertical) ; deux doigts,
    // glissés à la verticale, inclinent la vue plongeante (vers le haut = plus rasante).
    let glisse = null;
    const doigts = new Map();
    on(e.cv, "pointerdown", function (ev) {
      doigts.set(ev.pointerId, ev.clientY);
      glisse = doigts.size === 1 ? { x: ev.clientX, y: ev.clientY } : null;
      try { e.cv.setPointerCapture(ev.pointerId); } catch (err) { /* pointeur déjà relâché */ }
    });
    on(e.cv, "pointermove", function (ev) {
      if (doigts.size >= 2 && doigts.has(ev.pointerId)) {
        const dy = ev.clientY - doigts.get(ev.pointerId);
        doigts.set(ev.pointerId, ev.clientY);
        if (e.vue === "plongee" && dy) incliner(dy * 0.15 / doigts.size);
        return;
      }
      if (!glisse) return;
      const dx = ev.clientX - glisse.x, dy = ev.clientY - glisse.y;
      glisse = { x: ev.clientX, y: ev.clientY };
      // 🩸 En suivi, le cap est celui de l'appareil : glisser ne règle que le regard haut/bas. Tourner au doigt
      // quittait le suivi au moindre toucher (un tap bouge toujours d'un pixel ou deux).
      if (dx && e.mode !== "suivi") e.cap = (e.cap + dx * 0.25 + 360) % 360;
      e.tangage = Math.max(-1, Math.min(1, e.tangage - dy * 0.004));
      e.sale = true;
    });
    const lever = function (ev) { doigts.delete(ev.pointerId); glisse = null; };
    on(e.cv, "pointerup", lever);
    on(e.cv, "pointercancel", lever);
    // Molette (PC) : incline la vue plongeante (vers soi = plus verticale).
    on(e.cv, "wheel", function (ev) {
      if (e.vue !== "plongee") return;
      ev.preventDefault();
      incliner(ev.deltaY < 0 ? INCLINAISON.pas : -INCLINAISON.pas);
    }, { passive: false });
    on(window, "kta:northOffsetChange", function () { _lireNord(); });
    on(e.cv, "contextmenu", function (ev) { ev.preventDefault(); });
    // Clavier : capturé pendant que la vue est ouverte (les raccourcis de la carte ne partent pas dessous).
    on(document, "keydown", function (ev) {
      if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); fermer(); return; }
      if (ev.code === "KeyV") { ev.stopPropagation(); basculerVue(); return; }
      if (ev.key === "PageUp" || ev.key === "PageDown") {
        ev.stopPropagation(); ev.preventDefault();
        incliner(ev.key === "PageUp" ? INCLINAISON.pas : -INCLINAISON.pas);
        return;
      }
      if (ev.key === "Shift") e.touches.Shift = true;
      const a = TOUCHES[ev.code];
      if (!a) return;
      ev.stopPropagation(); ev.preventDefault();
      e.touches[a] = true;
    }, true);
    on(document, "keyup", function (ev) {
      if (ev.key === "Shift") e.touches.Shift = false;
      const a = TOUCHES[ev.code];
      if (a) { e.touches[a] = false; ev.stopPropagation(); }
    }, true);
    on(window, "blur", relacher);
    // 🩸 Contexte perdu (mémoire graphique iOS, onglet longtemps en fond) : preventDefault demande au navigateur de
    // le rendre. On attend ATTENTE_REPRISE d'écran visible (un onglet caché n'est pas rendu avant d'être revu),
    // puis on ferme avec un message plutôt qu'un écran noir figé.
    on(e.cv, "webglcontextlost", function (ev) {
      ev.preventDefault();
      console.warn("[Vue3D] contexte WebGL perdu : attente de la reprise");
      e.perdu = true;
      e.msPerdu = 0;
      relacher();
      let t0 = performance.now();
      clearInterval(e.minuterie);
      e.minuterie = setInterval(function () {
        const t = performance.now();
        if (document.visibilityState !== "hidden") e.msPerdu += t - t0;
        t0 = t;
        if (e.perdu && e.msPerdu >= e.attenteReprise) _fermerSansContexte();
      }, Math.min(500, e.attenteReprise));
    });
    // Reprise : three.js a déjà refait son état (son écouteur passe avant celui-ci). La scène est remontée à neuf.
    // 🩸 Jamais dispose() sur les objets d'avant la perte : leurs écouteurs appartiennent à l'ancien état de
    // three.js et effaceraient sur le nouveau contexte des objets qui n'en sont pas (« object does not belong to
    // this context »). Leur mémoire GPU est morte avec l'ancien contexte ; le ramasse-miettes prend le reste.
    on(e.cv, "webglcontextrestored", function () {
      clearInterval(e.minuterie);
      e.perdu = false;
      e.reprises++;
      e.tuiles.forEach(function (t) { t.obj = null; });
      _monterScene();
      _reindexer();
      _appliquerVue();
      e.w = 0;          // taille et projection reposées à la prochaine image
      e.sale = true;
      console.log("[Vue3D] contexte WebGL repris, scène remontée");
    });
  }

  function _fermerSansContexte() {
    console.warn("[Vue3D] contexte WebGL non repris : vue fermée");
    _demonter("contexte");
    _toast("vue3d.contextePerdu");
  }

  // ── API ────────────────────────────────────────────────────────────────────────────────────────────

  // Refus avec un message (la tuile du menu fait le même test avant de charger quoi que ce soit) : sans échelle,
  // 1 px vaudrait 1 m et la scène serait fausse sans le dire.
  function ouvrir(opts) {
    const o = opts || {};
    if (_e) return Promise.resolve(true);
    if (!window.map || !window.PLAN_CONFIG || !window.APP_CONFIG) {
      _alerte("vue3d.sansPlan");
      return Promise.resolve(false);
    }
    if (!_echelle()) { _alerte("vue3d.sansEchelle"); return Promise.resolve(false); }
    return Promise.all([_chargerThree(), _chargerCss()]).catch(function (err) {
      console.warn("[Vue3D] three.js introuvable :", err && err.message);
      _alerte("vue3d.chargementImpossible");
      return null;
    }).then(function (charges) {
      if (!charges) return false;
      if (_e) return true;
      const sc = _echelle();
      const hauteur = (typeof window.getPlanHauteurGalerie === "function" && window.getPlanHauteurGalerie()) ||
        HAUTEUR_DEFAUT;
      const pos = o.depart ||
        (typeof window.getTrackingPosition === "function" ? window.getTrackingPosition() : null) ||
        { x: window.PLAN_CONFIG.plan.imageWidth / 2, y: window.PLAN_CONFIG.plan.imageHeight / 2 };
      const cap = o.depart && Number.isFinite(o.depart.cap) ? o.depart.cap
        : (typeof window.getPlanRelHeading === "function" ? Number(window.getPlanRelHeading()) || 0 : 0);
      _e = {
        sc: sc, hauteur: hauteur, oeil: Math.min(OEIL, Math.max(0.4, hauteur * 0.8)),
        distance: o.distanceVue > 0 ? o.distanceVue : DISTANCE_VUE, tuilesActives: o.tuiles !== false,
        pos: { x: pos.x, y: pos.y }, cap: cap, tangage: 0, vue: "yeux",
        mode: o.depart || !_trackerActif() ? "libre" : "suivi",
        touches: {}, ecouteurs: [], tuiles: new Map(), couleurs: new Map(), sale: true, images: 0, butees: 0,
        msIndex: 0, msTuiles: 0, compteurN: 0, compteurT0: 0, w: 0, h: 0, aBouge: false, perdu: false,
        msPerdu: 0, reprises: 0, minuterie: null, inclinaison: INCLINAISON.defaut, nord: 0, nordCalibre: false,
        roseAngle: NaN,
        attenteReprise: o.attenteReprise > 0 ? o.attenteReprise : ATTENTE_REPRISE
      };
      const t0 = performance.now();
      _monterDom(!!o.stats);
      try {
        _e.renderer = new THREE.WebGLRenderer({ canvas: _e.cv, antialias: (window.devicePixelRatio || 1) < 2,
          powerPreference: "high-performance" });
      } catch (err) {
        console.warn("[Vue3D] WebGL indisponible :", err && err.message);
        _demonter("indisponible");
        _alerte("vue3d.indisponible");
        return false;
      }
      // Densité plafonnée : au-delà de 2, le coût de remplissage (x 2,25 de 2 à 3) ne se voit pas à l'œil.
      _e.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.densiteMax > 0 ? o.densiteMax : 2));
      // Tons compressés : une face claire (pilier doré) éclairée de près ne sature pas en aplat.
      _e.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      _monterScene();
      _lireNord();
      _brancher();
      _redimensionner();
      _reindexer();
      _appliquerVue();
      _placerCamera();
      _e.msOuverture = performance.now() - t0;
      _e.raf = requestAnimationFrame(_image);
      console.log("[Vue3D] ouverte en " + Math.round(_e.msOuverture) + " ms (" + _e.tuiles.size + " tuiles)");
      return true;
    });
  }

  function _demonter(raison) {
    const e = _e;
    if (!e) return;
    _derniereFermeture = raison || "utilisateur";
    if (e.raf) cancelAnimationFrame(e.raf);
    clearInterval(e.minuterie);
    e.ecouteurs.forEach(function (x) { x[0].removeEventListener(x[1], x[2], x[3]); });
    if (e.renderer) {
      e.tuiles.forEach(_libererTuile);
      if (e.sol) e.sol.geometry.dispose();
      if (e.avatar) e.avatar.geometry.dispose();
      if (e.mats) Object.keys(e.mats).forEach(function (k) { e.mats[k].dispose(); });
      if (e.grain) e.grain.dispose();
      if (e.lampe) e.lampe.dispose();
      e.renderer.dispose();
      const gl = e.renderer.getContext();
      if (!gl.isContextLost()) e.renderer.forceContextLoss();
      _dernierGl = gl;
    }
    if (e.ov && e.ov.parentNode) e.ov.parentNode.removeChild(e.ov);
    _e = null;
  }

  // Fermeture par l'utilisateur (✕, Échap, API). Suivi actif et position 3D écartée du tracker par un
  // déplacement : « Je suis ici ? » (Oui = recalage du tracker, Non = rien ne change). Rend true si recalé.
  function fermer() {
    const e = _e;
    if (!e) return Promise.resolve(false);
    const pos = { x: e.pos.x, y: e.pos.y }, niveau = e.niveau, sc = e.sc, bouge = e.aBouge;
    _demonter("utilisateur");
    console.log("[Vue3D] fermée");
    const actif = typeof window.getTrackingActif === "function" && window.getTrackingActif() === true;
    const tr = typeof window.getTrackingPosition === "function" ? window.getTrackingPosition() : null;
    if (!bouge || !actif || !tr || typeof window.recalerTrackerSurPoint !== "function" ||
        typeof window.ktaConfirm !== "function") return Promise.resolve(false);
    if (Math.hypot(pos.x - tr.x, pos.y - tr.y) / sc < SEUIL_RECALAGE) return Promise.resolve(false);
    return window.ktaConfirm(window.ktaEsc(_t("vue3d.jeSuisIci.texte")), {
      titre: window.ktaEsc(_t("vue3d.jeSuisIci.titre")),
      okLabel: window.ktaEsc(_t("vue3d.jeSuisIci.oui")),
      cancelLabel: window.ktaEsc(_t("vue3d.jeSuisIci.non"))
    }).then(function (oui) {
      if (!oui) return false;
      window.recalerTrackerSurPoint(pos.x, pos.y, niveau === null ? undefined : niveau);
      return true;
    });
  }

  function basculerVue() {
    if (!_e) return;
    _e.vue = _e.vue === "plongee" ? "yeux" : "plongee";
    _appliquerVue();
  }

  function suivre() {
    if (!_e || !_trackerActif()) return;
    _e.mode = "suivi";
    _e.tangage = 0;
    _majBoutonSuivre();
    _e.sale = true;
  }

  // Pose la position (coordonnées plan) sans test de collision : mesures, et plus tard « aller à » un point.
  function placer(x, y, cap) {
    if (!_e || !Number.isFinite(x) || !Number.isFinite(y)) return;
    _passerEnLibre();
    _e.pos.x = x; _e.pos.y = y;
    _e.aBouge = true;
    if (Number.isFinite(cap)) _e.cap = (cap % 360 + 360) % 360;
    _e.sale = true;
  }

  function avancer(m) { if (!_e) return false; _passerEnLibre(); return _pas(m, _e.cap); }

  function tourner(deg) { if (!_e) return; _passerEnLibre(); _e.cap = (_e.cap + deg + 360) % 360; _e.sale = true; }

  function etat() {
    if (!_e) {
      return { ouvert: false, contexteLibere: _dernierGl ? _dernierGl.isContextLost() : null,
        fermeture: _derniereFermeture };
    }
    const e = _e, info = e.renderer.info;
    let construites = 0, visibles = 0;
    const yMax = { opaque: 0, murs: 0 };
    e.tuiles.forEach(function (t) {
      if (!t.obj) return;
      construites++;
      if (t.obj.visible) visibles++;
      t.obj.children.forEach(function (m) {
        const f = m.userData && m.userData.famille;
        if (f !== "opaque" && f !== "murs") return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        yMax[f] = Math.max(yMax[f], m.geometry.boundingBox.max.y);
      });
    });
    return {
      ouvert: true, contexteVivant: !e.renderer.getContext().isContextLost(), perdu: e.perdu, reprises: e.reprises,
      aBouge: e.aBouge, rapide: !!e.rapide, suiviDispo: !!e.suiviDispo, vue: e.vue, mode: e.mode,
      inclinaison: e.inclinaison,
      boussole: { angle: e.roseAngle, nord: e.nord, calibre: e.nordCalibre,
        libelle: e.boussole ? e.boussole.getAttribute("aria-label") : "",
        inclinaisonVisible: !!e.boutonsIncl && !e.boutonsIncl.hidden },
      niveau: e.niveau, hauteur: e.hauteur, distance: e.distance,
      pos: { x: e.pos.x, y: e.pos.y }, cap: e.cap, butees: e.butees, images: e.images,
      tuiles: e.tuiles.size, construites: construites, visibles: visibles, compte: e.compte, yMax: yMax,
      panneaux: Array.from(e.panneaux).map(function (sp) {
        return { visible: sp.visible && !!sp.parent && sp.parent.visible, x: sp.position.x, z: sp.position.z,
          dansVolume: !!sp.userData.poi.anneau, depthTest: sp.material.depthTest, ordre: sp.renderOrder,
          opacite: +sp.material.opacity.toFixed(2), echelle: +sp.scale.x.toFixed(2) };
      }),
      murDecale: e.mats.murs.polygonOffset === true,
      triangles: info.render.triangles, appels: info.render.calls,
      geometries: info.memory.geometries, textures: info.memory.textures,
      msOuverture: Math.round(e.msOuverture || 0), msIndex: Math.round(e.msIndex), msTuiles: Math.round(e.msTuiles)
    };
  }

  // Mesure : `images` rendus en tournant sur place (un tour complet), chacun suivi d'une lecture d'un pixel qui
  // attend la fin du travail du GPU. Temps par image = CPU + GPU, sans la synchronisation à l'écran. Un premier
  // tour non compté compile les shaders et envoie géométries et textures au GPU.
  function mesurer(opts) {
    if (!_e) return null;
    const e = _e, n = (opts && opts.images) || 120, gl = e.renderer.getContext();
    const px = new Uint8Array(4), temps = [];
    const cap0 = e.cap;
    _gererTuiles(true);
    let tri = 0, appels = 0;
    const t00 = performance.now();
    for (let i = 0; i < 12; i++) {
      e.cap = (cap0 + i * 30) % 360;
      _placerCamera();
      e.renderer.render(e.scene, e.camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    const msPremierTour = performance.now() - t00;
    for (let i = 0; i < n; i++) {
      e.cap = (cap0 + i * 360 / n) % 360;
      _placerCamera();
      const t0 = performance.now();
      e.renderer.render(e.scene, e.camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      temps.push(performance.now() - t0);
      tri = Math.max(tri, e.renderer.info.render.triangles);
      appels = Math.max(appels, e.renderer.info.render.calls);
    }
    e.cap = cap0;
    e.sale = true;
    temps.sort(function (a, b) { return a - b; });
    const moy = temps.reduce(function (s, v) { return s + v; }, 0) / n;
    return {
      images: n, msPremierTour: Math.round(msPremierTour), msMoy: +moy.toFixed(2),
      msMed: +temps[Math.floor(n / 2)].toFixed(2), msP95: +temps[Math.floor(n * 0.95)].toFixed(2),
      msMax: +temps[n - 1].toFixed(2), trianglesMax: tri, appelsMax: appels,
      memoire: { geometries: e.renderer.info.memory.geometries, textures: e.renderer.info.memory.textures }
    };
  }

  window.KtaVue3D = {
    ouvrir: ouvrir, fermer: fermer, etat: etat, mesurer: mesurer, basculerVue: basculerVue, incliner: incliner,
    basculerSuivi: basculerSuivi,
    avancer: avancer, tourner: tourner, suivre: suivre, placer: placer
  };
})();
