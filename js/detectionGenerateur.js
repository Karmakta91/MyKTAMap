/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// detectionGenerateur.js — « Détecter piliers et fronts » et « Détecter les galeries » dans le Générateur
// (createConf.js) : le parcours de detectionStructures.js sur l'image SOURCE, dans une fenêtre plein écran à
// mini-carte CRS.Simple.
// Expose : window.KtaDetectionGenerateur = { ouvrir(opts) → Promise<bool> (false : rien n'a pu s'ouvrir), APERCU_MAX }.
//   opts = { image (File | Blob), multi, pxParM (nombre | null), cle (couleurs retenues), hote (fenêtre du
//   Générateur), existantes(img) → (Promise de) structures déjà là en px SOURCE, poser(structures en px SOURCE),
//   cible ("traces" : fenêtre « Détecter les galeries »), existantesTraces(img) → (Promise de) tracés déjà là en px
//   SOURCE, poserTraces(tracés en px SOURCE) }.
// ⚠️ contrat : coordonnées en pixels de l'image SOURCE, non rognée ; l'appelant les met dans le repère du plan.
// 🩸 Image décodée UNE fois (un élément Image, comme le tuilage), lue par drawImage bloc par bloc, rectangle source
//   ramené dans l'image (Safari refuse un rectangle qui déborde). Aucun canvas pleine taille.
// 🩸 Seule la carte montre un aperçu réduit (APERCU_MAX px de côté au plus) : la pipette et le calcul lisent la
//   pleine résolution.
// Garde-fou : scripts/smoke/checkup-detection-generateur.js · Doc : plans-loader.md (Détecter, Générateur).

window.KtaDetectionGenerateur = (function () {
  "use strict";

  const APERCU_MAX = 4096;
  const _t = function (k, v) { return window.I18n.t(k, v); };

  function _decoder(blob) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("image non décodable")); };
      img.src = url;
    });
  }
  // Aperçu réduit de la carte, fond blanc (une source transparente se lit aussi sur blanc : detectionStructures.js
  // > _lireBloc).
  function _apercu(img) {
    const W = img.naturalWidth, H = img.naturalHeight, k = Math.min(1, APERCU_MAX / Math.max(W, H));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff";   // fond d'image (hors charte : celui de la lecture)
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return new Promise(function (resolve) {
      c.toBlob(function (b) {
        c.width = c.height = 0;   // libère le canvas tout de suite (mémoire du téléphone)
        resolve(b ? URL.createObjectURL(b) : null);
      }, "image/jpeg", 0.85);
    });
  }

  async function ouvrir(opts) {
    if (!window.KtaDetectionUI || !window.L || !opts || !opts.image) return false;
    let dec;
    try { dec = await _decoder(opts.image); } catch (err) { return false; }
    const img = dec.img, W = img.naturalWidth, H = img.naturalHeight;
    const urlApercu = await _apercu(img);
    const existantes = opts.existantes ? ((await opts.existantes(img)) || []) : [];
    const traces = opts.cible === "traces" && opts.existantesTraces ? ((await opts.existantesTraces(img)) || []) : [];
    const titre = opts.cible === "traces" ? "detect.galeries.titre" : "gen.detect.titre";

    const ov = document.createElement("div");
    ov.className = "kta-detect-gen";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", _t(titre));
    ov.innerHTML = '<div class="kta-readme-modal-header"><span class="kta-readme-modal-titre">' +
      window.ktaIcone("search") + " " + window.ktaEsc(_t(titre)) + "</span>" +
      '<button type="button" class="kta-panneau-close" data-detect-gen="fermer" aria-label="' +
      window.ktaEsc(_t("detect.fermer")) + '">✕</button></div><div class="kta-detect-gen-carte"></div>';
    document.body.appendChild(ov);

    const carte = L.map(ov.querySelector(".kta-detect-gen-carte"), {
      crs: L.CRS.Simple, minZoom: -8, maxZoom: 3, zoomSnap: 0.25, attributionControl: false
    });
    const bornes = L.latLngBounds([0, 0], [H, W]);
    if (urlApercu) L.imageOverlay(urlApercu, bornes).addTo(carte);
    carte.fitBounds(bornes);

    let fini;
    const ferme = new Promise(function (resolve) { fini = resolve; });
    let rendu = false;
    const toutFermer = function () {
      if (rendu) return;
      rendu = true;
      carte.remove();
      ov.remove();
      if (urlApercu) URL.revokeObjectURL(urlApercu);
      URL.revokeObjectURL(dec.url);
      fini(true);
    };
    ov.querySelector('[data-detect-gen="fermer"]').addEventListener("click", function () {
      window.KtaDetectionUI.fermer();
    });

    const ctx = {
      carte: carte, largeur: W, hauteur: H, multi: !!opts.multi, cle: opts.cle || "generateur", parent: ov,
      hotes: opts.hote ? [opts.hote] : [],
      versCarte: function (x, y) { return L.latLng(H - y, x); },
      depuisCarte: function (ll) { return { x: ll.lng, y: H - ll.lat }; },
      dessiner: function (k, r, e) {
        const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
        const x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h);
        if (x1 <= x0 || y1 <= y0) return Promise.resolve({ ok: false });
        k.drawImage(img, x0, y0, x1 - x0, y1 - y0, (x0 - r.x) * e, (y0 - r.y) * e, (x1 - x0) * e, (y1 - y0) * e);
        return Promise.resolve({ ok: true });
      },
      niveau: function (type) {
        return window.ktaNiveauNouvelleStructure(type, { multiLevel: !!opts.multi, niveau: 0 });
      },
      existantes: function () { return existantes; },
      pxParM: function () { return opts.pxParM > 0 ? opts.pxParM : null; },
      refuse: function () { return false; },
      entrer: function () {},
      sortir: toutFermer,
      poser: function (poses) { opts.poser(poses); return 0; },
      messagePoses: function (n) { return _t("gen.detect.verses", { n: n }); },
      // galeries : niveau 0 du plan généré (multi-niveau), sinon aucun champ de niveau
      niveauTrace: function () { return opts.multi ? 0 : null; },
      tracesExistants: function () { return traces; },
      poserTraces: opts.poserTraces ? function (poses) { opts.poserTraces(poses); return 0; } : undefined,
      messagePosesTraces: function (n) { return _t("gen.detect.galeries.verses", { n: n }); }
    };
    if (!window.KtaDetectionUI.ouvrir(ctx, { cible: opts.cible })) { toutFermer(); return false; }
    return ferme;
  }

  return { ouvrir: ouvrir, APERCU_MAX: APERCU_MAX };
})();
