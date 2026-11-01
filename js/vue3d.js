/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// vue3d.js — vue 3D à la première personne autour de la position du tracker (prototype, aucune entrée de menu).
// Chargé à la demande (avec css/vue3d.css) ; three.js (lib/three/) n'est importé qu'à la première ouverture.
// Expose : window.KtaVue3D = { ouvrir(opts) → Promise<bool>, fermer(), etat(), mesurer(opts), basculerVue(),
//   avancer(m), tourner(deg), suivre(), placer(x, y, cap) }.
//   opts : { distanceVue (m), tuiles (bool), depart {x, y, cap}, densiteMax, stats }.
// Scène (mètres : x = x image / scale, z = y image / scale, y = hauteur) : structures extrudées du sol à la
// hauteur du plan (Volume exploité), zones, tracés et itinéraire au sol, POI en panneaux ; niveau actif seul.
// Tuiles carrées construites autour de la position, jetées au loin ; une lampe frontale et un brouillard noir
// bornent ce qui est dessiné. Rendu seulement quand quelque chose bouge (batterie).
// ⚠️ contrat : déplacement à l'écran et au clavier = règle du pas du tracker (tracking.js > ktaEstAccessible,
// ktaPasBloqueParStructure), jamais une copie ; le tracker n'est pas déplacé par la vue 3D.
// 🩸 three.js est un module ES : import() dynamique depuis ce script classique, URL absolue (pas d'import map,
// la CSP refuse tout script en ligne). Fermer libère le contexte WebGL (forceContextLoss) : un navigateur en
// garde peu (iOS ~ 8, Chrome 16) et le plus ancien est perdu sans prévenir.
// Doc : docs/ETUDE_VUE_3D.md · Garde-fou : scripts/smoke/checkup-vue-3d.js

(function () {
  "use strict";

  const URL_THREE = "lib/three/three.module.js";
  const DISTANCE_VUE = 30;          // m : au-delà, brouillard noir complet et tuiles masquées
  const TUILE = 16;                 // m : côté d'une tuile de géométrie
  const TUILES_PAR_IMAGE = 3;       // tuiles construites au plus par image après l'ouverture (pas d'à-coup)
  const HAUTEUR_DEFAUT = 2;         // m, comme ⛏️ Volume exploité
  const OEIL = 1.6;                 // m
  const RAYON_CORPS = 0.3;          // m : distance gardée devant soi contre une structure
  const VITESSE = 1.4;              // m/s, x 2.5 avec Maj
  const ROTATION = 90;              // °/s
  const EPAISSEUR_MUR_LIGNE = 0.4;  // m
  const EPAISSEUR_FRONT = 0.3;      // m
  const LARGEUR_TRACE = 0.25;       // m
  const LARGEUR_ITI = 0.5;          // m
  const HAUTEUR_REMBLAIS = 0.6;     // part de la hauteur du plan
  const COULEUR_SOL = 0x6a6a72;
  const COULEUR_PLAFOND = 0x56565e;

  let THREE = null;
  let _import = null;
  let _e = null;                    // état de la vue ouverte (null = fermée)
  let _dernierGl = null;            // contexte de la dernière vue fermée (checkup : libéré ou non)

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

  function _construireTuile(t) {
    const sc = _e.sc, h = _e.hauteur;
    const opaque = new Lot(), transp = new Lot(), lumineux = new Lot();
    for (let i = 0; i < t.s.length; i++) {
      const s = t.s[i], col = _couleur("structures", s.type);
      if (_estLigne(s.type)) {
        const ep = s.type === "mur-ligne" ? EPAISSEUR_MUR_LIGNE : EPAISSEUR_FRONT;
        _murLigne(opaque, s.points, sc, ep, h, col);
      } else {
        _prisme(opaque, _anneau(s.points, sc), 0, h, col, true);
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
    const ajouter = function (lot, mat, ordre) {
      const g = lot.geometrie();
      if (!g) return;
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = ordre;
      m.matrixAutoUpdate = false;
      groupe.add(m);
    };
    ajouter(opaque, _e.mats.opaque, 0);
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
    });
    _e.scene.remove(t.obj);
    t.obj = null;
  }

  // ── POI : panneau (icône + nom) toujours face à la caméra, à hauteur de tête ─────────────────────────

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
    const mat = new THREE.SpriteMaterial({ map: tex, fog: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(1.6, 0.5, 1);
    sp.position.set(p.x / _e.sc, Math.min(_e.oeil + 0.4, _e.hauteur - 0.3), p.y / _e.sc);
    sp.renderOrder = 3;
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

  // ── Scène ──────────────────────────────────────────────────────────────────────────────────────────

  function _materiaux() {
    return {
      opaque: new THREE.MeshLambertMaterial({ vertexColors: true }),
      lumineux: new THREE.MeshBasicMaterial({ vertexColors: true }),
      transp: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45,
        depthWrite: false, side: THREE.DoubleSide }),
      sol: new THREE.MeshLambertMaterial({ color: COULEUR_SOL }),
      plafond: new THREE.MeshLambertMaterial({ color: COULEUR_PLAFOND, side: THREE.BackSide }),
      avatar: new THREE.MeshBasicMaterial({ color: 0xf4c542 })
    };
  }

  function _monterScene() {
    const e = _e;
    e.scene = new THREE.Scene();
    e.scene.background = new THREE.Color(0x000000);
    e.scene.fog = new THREE.Fog(0x000000, e.distance * 0.35, e.distance);
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
    e.lampe = new THREE.SpotLight(0xfff1d6, 14, e.distance, 0.62, 0.55, 1.6);
    e.lampe.position.set(0, 0.05, 0);
    e.lampe.target.position.set(0, -0.3, -1);
    e.tete.add(e.lampe, e.lampe.target);
    e.halo = new THREE.PointLight(0xfff1d6, 1.2, 3.5, 2);
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
    e.plafond.position.set(x, e.hauteur, z);
    e.avatar.position.set(x, 0.45, z);
    e.avatar.rotation.set(0, -cap, 0);
    if (e.vue === "plongee") {
      const fx = Math.sin(cap), fz = -Math.cos(cap);
      e.camera.position.set(x - fx * 7, 16, z - fz * 7);
      e.camera.lookAt(x + fx * 2, 0, z + fz * 2);
    } else {
      e.camera.position.set(x, e.oeil, z);
      e.camera.rotation.set(e.tangage, -cap, 0);
    }
  }

  function _appliquerVue() {
    const e = _e, haut = e.vue === "plongee";
    e.plafond.visible = !haut;
    e.avatar.visible = haut;
    e.ambiance.intensity = haut ? 0.9 : 0.04;
    e.scene.fog.near = haut ? e.distance : e.distance * 0.35;
    e.scene.fog.far = haut ? e.distance * 1.4 + 20 : e.distance;
    e.camera.far = haut ? e.distance * 1.4 + 30 : e.distance + 5;
    e.camera.updateProjectionMatrix();
    if (e.boutonVue) e.boutonVue.setAttribute("aria-pressed", haut ? "true" : "false");
    e.sale = true;
  }

  // ── Déplacement ────────────────────────────────────────────────────────────────────────────────────

  // Pas de `m` mètres dans la direction `angle` (° plan, 0 = haut de l'image) : refusé contre une structure
  // (règle du tracker, avec une marge de RAYON_CORPS devant), glisse le long d'un mur si un seul axe passe.
  function _pas(m, angle) {
    const e = _e, a = angle * Math.PI / 180;
    const dx = Math.sin(a) * m * e.sc, dy = -Math.cos(a) * m * e.sc;
    const essais = [[dx, dy], [dx, 0], [0, dy]];
    for (let i = 0; i < essais.length; i++) {
      const sx = essais[i][0], sy = essais[i][1], l = Math.hypot(sx, sy);
      if (l < 1e-9) continue;
      const marge = RAYON_CORPS * e.sc / l;
      const x1 = e.pos.x + sx, y1 = e.pos.y + sy;
      if (!_libre(e.pos.x, e.pos.y, x1 + sx * marge, y1 + sy * marge)) continue;
      e.pos.x = x1; e.pos.y = y1;
      e.sale = true;
      return true;
    }
    e.butees++;
    return false;
  }

  function _libre(x0, y0, x1, y1) {
    const pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    if (pc && (x1 < 0 || y1 < 0 || x1 > pc.imageWidth || y1 > pc.imageHeight)) return false;
    if (typeof window.ktaEstAccessible === "function" && !window.ktaEstAccessible(x1, y1)) return false;
    if (typeof window.ktaPasBloqueParStructure !== "function") return true;
    const niv = _e.niveau === null ? undefined : _e.niveau;
    return !window.ktaPasBloqueParStructure(x0, y0, x1, y1, niv);
  }

  function _passerEnLibre() { if (_e.mode !== "libre") { _e.mode = "libre"; _majBoutonSuivre(); } }

  function _majBoutonSuivre() {
    if (_e.boutonSuivre) _e.boutonSuivre.setAttribute("aria-pressed", _e.mode === "suivi" ? "true" : "false");
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
    const vit = VITESSE * (k.Shift ? 2.5 : 1);
    const av = (k.av ? 1 : 0) - (k.ar ? 1 : 0), lat = (k.dr ? 1 : 0) - (k.ga ? 1 : 0);
    const rot = (k.td ? 1 : 0) - (k.tg ? 1 : 0);
    if (av || lat || rot) _passerEnLibre();
    if (rot) { e.cap = (e.cap + rot * ROTATION * dt + 360) % 360; e.sale = true; }
    if (av) _pas(vit * dt * av, e.cap);
    if (lat) _pas(vit * dt, e.cap + 90 * lat);
    if (e.mode === "suivi") _lireTracker();
    const niv = _niveauCourant();
    if (niv !== e.niveau) _reindexer();
    _gererTuiles(false);
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
    ov.setAttribute("aria-label", "Vue 3D");
    const cv = document.createElement("canvas");
    cv.className = "kta-v3d-canvas";
    ov.appendChild(cv);
    const haut = document.createElement("div");
    haut.className = "kta-v3d-haut";
    e.boutonSuivre = _bouton(haut, "", "📍", "Suivre ma position", "suivre");
    e.boutonVue = _bouton(haut, "", "🛰️", "Vue plongeante", "vue");
    _bouton(haut, "kta-v3d-fermer", "✕", "Fermer la vue 3D", "fermer");
    ov.appendChild(haut);
    const pad = document.createElement("div");
    pad.className = "kta-v3d-pad";
    _bouton(pad, "kta-v3d-tg", "↶", "Tourner à gauche", "tg");
    _bouton(pad, "kta-v3d-av", "▲", "Avancer", "av");
    _bouton(pad, "kta-v3d-td", "↷", "Tourner à droite", "td");
    _bouton(pad, "kta-v3d-ga", "◀", "Pas à gauche", "ga");
    _bouton(pad, "kta-v3d-ar", "▼", "Reculer", "ar");
    _bouton(pad, "kta-v3d-dr", "▶", "Pas à droite", "dr");
    ov.appendChild(pad);
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
    };
    on(e.ov, "pointerdown", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-v3d]");
      if (!b) return;
      const a = b.dataset.v3d;
      if (a === "fermer") { fermer(); return; }
      if (a === "vue") { basculerVue(); return; }
      if (a === "suivre") { suivre(); return; }
      ev.preventDefault();
      e.touches[a] = true;
    });
    on(window, "pointerup", relacher);
    on(window, "pointercancel", relacher);
    on(e.ov, "pointerout", function (ev) { if (ev.target.dataset && ev.target.dataset.v3d) relacher(); });
    // Glisser sur la scène : tourner (horizontal) et lever / baisser les yeux (vertical).
    let glisse = null;
    on(e.cv, "pointerdown", function (ev) {
      glisse = { x: ev.clientX, y: ev.clientY };
      e.cv.setPointerCapture(ev.pointerId);
    });
    on(e.cv, "pointermove", function (ev) {
      if (!glisse) return;
      const dx = ev.clientX - glisse.x, dy = ev.clientY - glisse.y;
      glisse = { x: ev.clientX, y: ev.clientY };
      if (dx) { _passerEnLibre(); e.cap = (e.cap + dx * 0.25 + 360) % 360; }
      e.tangage = Math.max(-1, Math.min(1, e.tangage - dy * 0.004));
      e.sale = true;
    });
    on(e.cv, "pointerup", function () { glisse = null; });
    on(e.cv, "contextmenu", function (ev) { ev.preventDefault(); });
    // Clavier : capturé pendant que la vue est ouverte (les raccourcis de la carte ne partent pas dessous).
    on(document, "keydown", function (ev) {
      if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); fermer(); return; }
      if (ev.code === "KeyV") { ev.stopPropagation(); basculerVue(); return; }
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
    // 🩸 Contexte perdu (mémoire graphique iOS, onglet en fond trop longtemps) : on ferme proprement et on le dit,
    // plutôt qu'un écran noir figé.
    on(e.cv, "webglcontextlost", function (ev) {
      ev.preventDefault();
      console.warn("[Vue3D] contexte WebGL perdu : vue fermée");
      e.contextePerdu = true;
      fermer();
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast("Vue 3D fermée : mémoire graphique insuffisante", "warn");
      }
    });
  }

  // ── API ────────────────────────────────────────────────────────────────────────────────────────────

  function ouvrir(opts) {
    const o = opts || {};
    if (_e) return Promise.resolve(true);
    if (!window.map || !window.PLAN_CONFIG || !window.APP_CONFIG) return Promise.resolve(false);
    return Promise.all([_chargerThree(), _chargerCss()]).then(function () {
      if (_e) return true;
      const sc = Number(window.APP_CONFIG.scale);
      const hauteur = (typeof window.getPlanHauteurGalerie === "function" && window.getPlanHauteurGalerie()) ||
        HAUTEUR_DEFAUT;
      const pos = o.depart ||
        (typeof window.getTrackingPosition === "function" ? window.getTrackingPosition() : null) ||
        { x: window.PLAN_CONFIG.plan.imageWidth / 2, y: window.PLAN_CONFIG.plan.imageHeight / 2 };
      const cap = o.depart && Number.isFinite(o.depart.cap) ? o.depart.cap
        : (typeof window.getPlanRelHeading === "function" ? Number(window.getPlanRelHeading()) || 0 : 0);
      _e = {
        sc: sc > 0 ? sc : 1, hauteur: hauteur, oeil: Math.min(OEIL, Math.max(0.4, hauteur * 0.8)),
        distance: o.distanceVue > 0 ? o.distanceVue : DISTANCE_VUE, tuilesActives: o.tuiles !== false,
        pos: { x: pos.x, y: pos.y }, cap: cap, tangage: 0, vue: "yeux", mode: o.depart ? "libre" : "suivi",
        touches: {}, ecouteurs: [], tuiles: new Map(), couleurs: new Map(), sale: true, images: 0, butees: 0,
        msIndex: 0, msTuiles: 0, compteurN: 0, compteurT0: 0, w: 0, h: 0
      };
      const t0 = performance.now();
      _monterDom(!!o.stats);
      try {
        _e.renderer = new THREE.WebGLRenderer({ canvas: _e.cv, antialias: (window.devicePixelRatio || 1) < 2,
          powerPreference: "high-performance" });
      } catch (err) {
        console.warn("[Vue3D] WebGL indisponible :", err && err.message);
        _demonter();
        return false;
      }
      // Densité plafonnée : au-delà de 2, le coût de remplissage (x 2,25 de 2 à 3) ne se voit pas à l'œil.
      _e.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.densiteMax > 0 ? o.densiteMax : 2));
      // Tons compressés : une face claire (pilier doré) éclairée de près ne sature pas en aplat.
      _e.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      _monterScene();
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

  function _demonter() {
    const e = _e;
    if (!e) return;
    if (e.raf) cancelAnimationFrame(e.raf);
    e.ecouteurs.forEach(function (x) { x[0].removeEventListener(x[1], x[2], x[3]); });
    if (e.renderer) {
      e.tuiles.forEach(_libererTuile);
      if (e.sol) e.sol.geometry.dispose();
      if (e.avatar) e.avatar.geometry.dispose();
      if (e.mats) Object.keys(e.mats).forEach(function (k) { e.mats[k].dispose(); });
      if (e.lampe) e.lampe.dispose();
      e.renderer.dispose();
      const gl = e.renderer.getContext();
      if (!e.contextePerdu && !gl.isContextLost()) e.renderer.forceContextLoss();
      _dernierGl = gl;
    }
    if (e.ov && e.ov.parentNode) e.ov.parentNode.removeChild(e.ov);
    _e = null;
  }

  function fermer() {
    if (!_e) return;
    _demonter();
    console.log("[Vue3D] fermée");
  }

  function basculerVue() {
    if (!_e) return;
    _e.vue = _e.vue === "plongee" ? "yeux" : "plongee";
    _appliquerVue();
  }

  function suivre() {
    if (!_e) return;
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
    if (Number.isFinite(cap)) _e.cap = (cap % 360 + 360) % 360;
    _e.sale = true;
  }

  function avancer(m) { if (!_e) return false; _passerEnLibre(); return _pas(m, _e.cap); }

  function tourner(deg) { if (!_e) return; _passerEnLibre(); _e.cap = (_e.cap + deg + 360) % 360; _e.sale = true; }

  function etat() {
    if (!_e) return { ouvert: false, contexteLibere: _dernierGl ? _dernierGl.isContextLost() : null };
    const e = _e, info = e.renderer.info;
    let construites = 0, visibles = 0;
    e.tuiles.forEach(function (t) { if (t.obj) { construites++; if (t.obj.visible) visibles++; } });
    return {
      ouvert: true, contexteVivant: !e.renderer.getContext().isContextLost(), vue: e.vue, mode: e.mode,
      niveau: e.niveau, hauteur: e.hauteur, distance: e.distance,
      pos: { x: e.pos.x, y: e.pos.y }, cap: e.cap, butees: e.butees, images: e.images,
      tuiles: e.tuiles.size, construites: construites, visibles: visibles, compte: e.compte,
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
    ouvrir: ouvrir, fermer: fermer, etat: etat, mesurer: mesurer, basculerVue: basculerVue,
    avancer: avancer, tourner: tourner, suivre: suivre, placer: placer
  };
})();
