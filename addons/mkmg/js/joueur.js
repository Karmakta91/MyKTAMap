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

  // Couleurs de la scène (pas de l'UI) : métal, bois, peau, veste verte.
  const COULEURS = { metal: 0x2b2d33, acier: 0x4a4e58, bois: 0x6b3f1d, peau: 0xa97d58, veste: 0x34572f,
    tenue: 0x3f8f4a, eclair: 0xffd27a };
  // Arme dans le repère de la caméra (m) : à droite, en bas, devant.
  const ARME = { x: 0.05, y: -0.16, z: -0.42, balance: 0.012, rythme: 4, recul: 0.06, releve: 0.18, reculMs: 160,
    eclairMs: 70 };

  function _cylindre(T, a, b, r0, r1, mat) {
    const va = new T.Vector3(a[0], a[1], a[2]), vb = new T.Vector3(b[0], b[1], b[2]);
    const dir = vb.clone().sub(va), l = dir.length();
    const m = new T.Mesh(new T.CylinderGeometry(r1, r0, l, 8), mat);
    m.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    return m;
  }

  function _boite(T, l, h, p, x, y, z, mat) {
    const m = new T.Mesh(new T.BoxGeometry(l, h, p), mat);
    m.position.set(x, y, z);
    return m;
  }

  // 🩸 Matériaux de l'arme NON éclairés : la lampe frontale, collée à la caméra, délavait bras et mains en blanc.
  // Dessinés par-dessus tout (depthTest coupé).
  function _matArme(T, c) {
    return new T.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, toneMapped: false });
  }

  function _arme(T) {
    const m = { metal: _matArme(T, COULEURS.metal), acier: _matArme(T, COULEURS.acier),
      bois: _matArme(T, COULEURS.bois), peau: _matArme(T, COULEURS.peau), veste: _matArme(T, COULEURS.veste),
      eclair: new T.MeshBasicMaterial({ color: COULEURS.eclair, depthTest: false, depthWrite: false,
        toneMapped: false }) };
    const g = new T.Group();
    // Du plus loin au plus près : l'ordre de rendu remplace le test de profondeur.
    const parts = [
      _cylindre(T, [-0.012, 0, -0.56], [-0.012, 0, -0.06], 0.011, 0.011, m.metal),
      _cylindre(T, [0.012, 0, -0.56], [0.012, 0, -0.06], 0.011, 0.011, m.metal),
      _boite(T, 0.006, 0.004, 0.5, 0, 0.011, -0.31, m.acier),
      _boite(T, 0.036, 0.032, 0.07, 0, -0.006, -0.03, m.acier),
      _boite(T, 0.05, 0.035, 0.16, 0, -0.024, -0.27, m.bois),
      _boite(T, 0.032, 0.05, 0.15, 0, -0.035, 0.07, m.bois),
      _cylindre(T, [-0.02, -0.05, -0.26], [-0.17, -0.34, -0.02], 0.02, 0.03, m.veste),
      _cylindre(T, [0.015, -0.06, 0.02], [0.15, -0.34, 0.12], 0.02, 0.03, m.veste),
      _boite(T, 0.045, 0.035, 0.055, -0.01, -0.042, -0.26, m.peau),
      _boite(T, 0.04, 0.04, 0.05, 0.01, -0.055, 0.02, m.peau)
    ];
    parts[5].rotation.x = -0.25;
    const eclair = new T.Mesh(new T.ConeGeometry(0.05, 0.14, 8), m.eclair);
    eclair.rotation.x = -Math.PI / 2;
    eclair.position.set(0, 0, -0.63);
    eclair.visible = false;
    parts.push(eclair);
    parts.forEach(function (o, i) { o.renderOrder = 1000 + i; o.frustumCulled = false; g.add(o); });
    g.position.set(ARME.x, ARME.y, ARME.z);
    return { groupe: g, eclair: eclair, mats: m };
  }

  function _silhouette(T, ctx) {
    const lam = function (c) { return new T.MeshLambertMaterial({ color: c }); };
    const m = { tenue: lam(COULEURS.tenue), peau: lam(COULEURS.peau), metal: lam(COULEURS.metal) };
    const h = Math.min(1.7, ctx.hauteur * 0.85), corps = h * 0.72, g = new T.Group();
    const c = new T.Mesh(new T.CylinderGeometry(0.2, 0.25, corps, 10), m.tenue);
    c.position.y = corps / 2;
    const t = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), m.peau);
    t.position.y = corps + 0.14;
    const fusil = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.75), m.metal);
    fusil.position.set(0.12, corps * 0.78, 0.3);
    const bras = new T.Mesh(new T.BoxGeometry(0.42, 0.08, 0.08), m.tenue);
    bras.position.set(0.05, corps * 0.8, 0.18);
    g.add(c, t, fusil, bras);
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
    g.rotation.set(p.recul * ARME.releve, 0, 0);
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
    p.arme.eclair.visible = true;
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
