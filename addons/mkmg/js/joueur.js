/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// addons/mkmg/js/joueur.js — le joueur de l'add-on « mkmg » vu par lui-même : à hauteur d'yeux, deux bras qui tiennent
// un fusil à deux coups (formes simples en 3D, accrochées à la caméra, balancement à la marche, recul au tir, éclair
// de bouche) ; en vue plongeante, une silhouette verte armée à sa place (la silhouette dorée de la vue est masquée :
// ctx.regler({ avatar: false })). Expose window.KtaAddons.mkmgJoueur = { monter, image, tir, liberer, etat }.
// ⚠️ contrat : l'arme est dessinée PAR-DESSUS la scène (sans test de profondeur, ordre de rendu fixé) : elle ne
// rentre jamais dans un pilier collé à la caméra. Rien n'est ajouté ailleurs qu'à ctx.camera (l'arme) et ctx.groupe
// (la silhouette), retirés par liberer().
// 🩸 Reprise du contexte WebGL : caméra et groupe sont neufs, les objets d'avant sont morts (jamais dispose()) :
// monter(p, ctx, true) refait tout sans rien libérer.
// Doc : docs/architecture/addons.md

(function () {
  "use strict";

  // Couleurs de la scène (pas de l'UI) : canons bleuis, bascule argentée, noyer, peau, veste verte.
  const COULEURS = { canon: 0x262b33, bouche: 0x0b0c0e, bascule: 0x83868c, laiton: 0xd8b25a, bois: 0x7a4421,
    peau: 0xc8946a, veste: 0x3f5e37, poignet: 0x2c4326, tenue: 0x3f8f4a, metal: 0x2b2d33, eclair: 0xffb347,
    coeur: 0xfff6dc };
  // Arme dans le repère de la caméra (m) : un peu à droite, en bas, devant, canons tournés vers le centre.
  const ARME = { x: 0.07, y: -0.15, z: -0.36, lacet: 0.06, balance: 0.012, rythme: 4, recul: 0.07, releve: 0.2,
    reculMs: 170, eclairMs: 70 };
  // Lumière FIXE dans le repère de la caméra (haut gauche, devant) : du relief sans dépendre de la scène.
  const LUMIERE = { dir: [-0.45, 0.8, 0.4], ambiant: 0.42, diffus: 0.78 };

  // Cylindre de a à b (repère de l'arme), rayon r0 en a, r1 en b.
  function _cylindre(T, a, b, r0, r1) {
    const va = new T.Vector3(a[0], a[1], a[2]), vb = new T.Vector3(b[0], b[1], b[2]);
    const dir = vb.clone().sub(va), l = dir.length();
    const m = new T.Mesh(new T.CylinderGeometry(r1, r0, l, 12));
    m.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    return m;
  }

  function _boite(T, l, h, p, x, y, z, rx) {
    const m = new T.Mesh(new T.BoxGeometry(l, h, p));
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    return m;
  }

  // Ellipsoïde (mains, doigts, guidon) : sphère étirée.
  function _ovoide(T, rx, ry, rz, x, y, z) {
    const m = new T.Mesh(new T.SphereGeometry(1, 12, 8));
    m.scale.set(rx, ry, rz);
    m.position.set(x, y, z);
    return m;
  }

  // Ombrage cuit dans les couleurs des sommets (diffus, plus un reflet pour le métal) : un seul matériau NON éclairé
  // pour toute l'arme. 🩸 Non éclairé : la lampe frontale, collée à la caméra, délavait bras et mains en blanc.
  function _teinter(T, m, hex, brillant) {
    m.updateMatrix();
    const n = m.geometry.attributes.normal, nm = new T.Matrix3().getNormalMatrix(m.matrix);
    const L = new T.Vector3().fromArray(LUMIERE.dir).normalize();
    const H = L.clone().add(new T.Vector3(0, 0, 1)).normalize();
    const c = new T.Color(hex), v = new T.Vector3(), out = new Float32Array(n.count * 3);
    for (let k = 0; k < n.count; k++) {
      v.fromBufferAttribute(n, k).applyMatrix3(nm).normalize();
      const d = LUMIERE.ambiant + LUMIERE.diffus * Math.max(0, v.dot(L));
      const sp = brillant ? brillant * Math.pow(Math.max(0, v.dot(H)), 28) : 0;
      out[k * 3] = Math.min(1, c.r * d + sp);
      out[k * 3 + 1] = Math.min(1, c.g * d + sp);
      out[k * 3 + 2] = Math.min(1, c.b * d + sp);
    }
    m.geometry.setAttribute("color", new T.BufferAttribute(out, 3));
    return m;
  }

  // Éclair de bouche : étoile plate face à la caméra, cœur blanc et jet, en addition (brille sur le noir).
  function _eclair(T, m) {
    const e = new T.Group(), forme = new T.Shape(), pointes = 9;
    for (let k = 0; k < pointes * 2; k++) {
      const a = k * Math.PI / pointes, r = k % 2 ? 0.022 : (k % 4 ? 0.07 : 0.1);
      if (k) forme.lineTo(Math.cos(a) * r, Math.sin(a) * r); else forme.moveTo(r, 0);
    }
    const jet = new T.Mesh(new T.ConeGeometry(0.035, 0.16, 10, 1, true), m.eclair);
    jet.rotation.x = -Math.PI / 2;
    jet.position.z = -0.07;
    const coeur = new T.Mesh(new T.CircleGeometry(0.03, 12), m.coeur);
    coeur.position.z = 0.001;
    e.add(jet, new T.Mesh(new T.ShapeGeometry(forme), m.eclair), coeur);
    e.visible = false;
    return e;
  }

  function _arme(T) {
    const dessus = { depthTest: false, depthWrite: false, toneMapped: false };
    const lum = Object.assign({ transparent: true, blending: T.AdditiveBlending, side: T.DoubleSide }, dessus);
    const m = { solide: new T.MeshBasicMaterial(Object.assign({ vertexColors: true }, dessus)),
      eclair: new T.MeshBasicMaterial(Object.assign({ color: COULEURS.eclair, opacity: 0.85 }, lum)),
      coeur: new T.MeshBasicMaterial(Object.assign({ color: COULEURS.coeur }, lum)) };
    const C = COULEURS;
    const cy = function (a, b, r0, r1, c, br) { return _teinter(T, _cylindre(T, a, b, r0, r1), c, br); };
    const bo = function (l, h, p, x, y, z, c, br, rx) { return _teinter(T, _boite(T, l, h, p, x, y, z, rx), c, br); };
    const ov = function (rx, ry, rz, x, y, z, c, br) { return _teinter(T, _ovoide(T, rx, ry, rz, x, y, z), c, br); };
    const R = 0.0115, DX = 0.0125, BOUT = -0.6;
    // ⚠️ Ordre de rendu = ordre de cette liste (le test de profondeur est coupé) : ce qui est caché par une pièce
    // (main sous le devant, détentes sous la bascule) passe AVANT elle.
    const parts = [
      // Canons juxtaposés, bouches sombres, bande, guidon en laiton.
      cy([-DX, 0, BOUT], [-DX, 0, -0.1], R, R, C.canon, 0.55),
      cy([DX, 0, BOUT], [DX, 0, -0.1], R, R, C.canon, 0.55),
      cy([-DX, 0, BOUT - 0.001], [-DX, 0, BOUT + 0.004], 0.0075, 0.0075, C.bouche, 0),
      cy([DX, 0, BOUT - 0.001], [DX, 0, BOUT + 0.004], 0.0075, 0.0075, C.bouche, 0),
      bo(0.012, 0.012, 0.46, 0, -0.008, -0.34, C.canon, 0.3),
      bo(0.009, 0.006, 0.5, 0, 0.0115, -0.35, C.canon, 0.4),
      ov(0.0035, 0.0035, 0.0035, 0, 0.0165, BOUT + 0.012, C.laiton, 0.6),
      // Bras gauche : manche, poignet, main sous le devant (qui la recouvre). Pas de doigts (décision produit).
      cy([-0.24, -0.38, 0.02], [-0.045, -0.088, -0.222], 0.045, 0.034, C.veste, 0),
      cy([-0.05, -0.094, -0.218], [-0.018, -0.062, -0.255], 0.036, 0.03, C.poignet, 0),
      ov(0.03, 0.024, 0.05, -0.01, -0.05, -0.272, C.peau, 0),
      bo(0.04, 0.026, 0.19, 0, -0.022, -0.27, C.bois, 0.12),
      // Détentes et pontet sous la bascule argentée ; clé d'ouverture dessus.
      bo(0.006, 0.02, 0.006, -0.004, -0.044, -0.06, C.canon, 0.4, 0.3),
      bo(0.006, 0.02, 0.006, 0.004, -0.044, -0.045, C.canon, 0.4, 0.3),
      bo(0.012, 0.004, 0.06, 0, -0.058, -0.05, C.bascule, 0.5),
      bo(0.048, 0.018, 0.025, 0, -0.026, -0.12, C.bascule, 0.5),
      bo(0.044, 0.046, 0.075, 0, -0.012, -0.075, C.bascule, 0.6),
      bo(0.007, 0.006, 0.04, 0.006, 0.014, -0.05, C.canon, 0.5),
      // Crosse : poignée inclinée puis talon.
      bo(0.036, 0.046, 0.12, 0, -0.04, 0.02, C.bois, 0.15, -0.28),
      bo(0.044, 0.085, 0.16, 0, -0.07, 0.15, C.bois, 0.15, -0.15),
      // Bras droit à la poignée : manche, poignet, dos de la main (la poignée dépasse à gauche).
      cy([0.2, -0.4, 0.2], [0.035, -0.09, 0.07], 0.05, 0.036, C.veste, 0),
      cy([0.046, -0.105, 0.085], [0.024, -0.075, 0.055], 0.04, 0.038, C.poignet, 0),
      ov(0.024, 0.032, 0.048, 0.016, -0.055, 0.03, C.peau, 0)
    ];
    parts.forEach(function (o) { o.material = m.solide; });
    const eclair = _eclair(T, m);
    eclair.position.set(0, 0, BOUT - 0.01);
    parts.push(eclair);
    const g = new T.Group();
    let ordre = 1000;
    parts.forEach(function (o) {
      o.traverse(function (x) { x.renderOrder = ordre++; x.frustumCulled = false; });
      g.add(o);
    });
    g.position.set(ARME.x, ARME.y, ARME.z);
    return { groupe: g, eclair: eclair, mats: m, canonTir: 0 };
  }

  function _silhouette(T, ctx) {
    const lam = function (c) { return new T.MeshLambertMaterial({ color: c }); };
    const m = { tenue: lam(COULEURS.tenue), peau: lam(COULEURS.peau), metal: lam(COULEURS.metal),
      bois: lam(COULEURS.bois) };
    const h = Math.min(1.7, ctx.hauteur * 0.85), corps = h * 0.72, g = new T.Group();
    const c = new T.Mesh(new T.CylinderGeometry(0.2, 0.25, corps, 10), m.tenue);
    c.position.y = corps / 2;
    const t = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), m.peau);
    t.position.y = corps + 0.14;
    const fusil = new T.Mesh(new T.BoxGeometry(0.07, 0.045, 0.5), m.metal);
    fusil.position.set(0.12, corps * 0.78, 0.42);
    const crosse = new T.Mesh(new T.BoxGeometry(0.06, 0.07, 0.3), m.bois);
    crosse.position.set(0.12, corps * 0.76, 0.05);
    const bras = new T.Mesh(new T.BoxGeometry(0.42, 0.08, 0.08), m.tenue);
    bras.position.set(0.05, corps * 0.8, 0.18);
    g.add(c, t, fusil, crosse, bras);
    g.visible = false;
    return { groupe: g, mats: m };
  }

  // neuf : reprise du contexte (rien d'avant n'est libéré).
  function monter(p, ctx, neuf) {
    if (!neuf) liberer(p, false);
    const T = ctx.THREE;
    p.arme = _arme(T);
    ctx.camera.add(p.arme.groupe);
    p.silh = _silhouette(T, ctx);
    ctx.groupe.add(p.silh.groupe);
    p.pasPhase = 0; p.recul = 0; p.dernierePos = ctx.pos;
    ctx.regler({ avatar: false });
  }

  function image(p, ctx, dt) {
    if (!p.arme || !p.silh) return;
    const haut = ctx.vue === "plongee", pos = ctx.pos, sc = ctx.sc;
    // Balancement : avance de phase selon la distance marchée (pas selon le temps), retour au calme à l'arrêt.
    const d = p.dernierePos ? Math.hypot(pos.x - p.dernierePos.x, pos.y - p.dernierePos.y) / sc : 0;
    p.dernierePos = pos;
    p.pasPhase += d * ARME.rythme;
    const amp = d > 0.001 ? ARME.balance : 0;
    p.ampBalance = (p.ampBalance || 0) + (amp - (p.ampBalance || 0)) * Math.min(1, dt * 8);
    p.recul = Math.max(0, p.recul - dt * 1000 / ARME.reculMs);
    const g = p.arme.groupe, a = p.ampBalance;
    g.position.set(ARME.x + Math.sin(p.pasPhase) * a, ARME.y + Math.abs(Math.cos(p.pasPhase)) * a * 0.7,
      ARME.z + p.recul * ARME.recul);
    g.rotation.set(p.recul * ARME.releve, ARME.lacet, 0);
    g.visible = !haut && !p.fin;
    if (p.arme.eclair.visible && performance.now() - p.eclairT > ARME.eclairMs) p.arme.eclair.visible = false;
    const s = p.silh.groupe, cap = ctx.cap * Math.PI / 180;
    s.visible = haut;
    s.position.set(pos.x / sc, 0, pos.y / sc);
    s.rotation.y = Math.atan2(Math.sin(cap), -Math.cos(cap));
  }

  function tir(p) {
    if (!p.arme) return;
    p.recul = 1;
    // Un canon puis l'autre ; étoile tournée au hasard pour qu'aucun éclair ne ressemble au précédent.
    const e = p.arme.eclair;
    p.arme.canonTir = 1 - p.arme.canonTir;
    e.position.x = p.arme.canonTir ? 0.0125 : -0.0125;
    e.rotation.z = Math.random() * Math.PI;
    e.visible = true;
    p.eclairT = performance.now();
  }

  function _libererObjet(o) {
    if (!o) return;
    if (o.groupe.parent) o.groupe.parent.remove(o.groupe);
    o.groupe.traverse(function (m) { if (m.geometry) m.geometry.dispose(); });
    Object.keys(o.mats).forEach(function (k) { o.mats[k].dispose(); });
  }

  // contexteMort : les objets meurent avec l'ancien contexte, on les oublie sans dispose().
  function liberer(p, contexteMort) {
    if (!contexteMort) { _libererObjet(p.arme); _libererObjet(p.silh); }
    p.arme = null; p.silh = null;
  }

  // État (checkup).
  function etat(p) {
    return { arme: !!p.arme && p.arme.groupe.visible, surCamera: !!p.arme && !!p.arme.groupe.parent &&
      p.arme.groupe.parent.isCamera === true, silhouette: !!p.silh && p.silh.groupe.visible,
      recul: +(p.recul || 0).toFixed(2), eclair: !!p.arme && p.arme.eclair.visible };
  }

  window.KtaAddons = window.KtaAddons || {};
  window.KtaAddons.mkmgJoueur = { monter: monter, image: image, tir: tir, liberer: liberer, etat: etat };
})();
