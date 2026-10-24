/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// geotiffExport.js — export GeoTIFF du plan calé (scan seul, ou scan + dessins), écrit ici sans librairie.
// Fichier : TIFF classique (« II », 42), RGB 8 bits, TUILÉ 256 × 256, Deflate (zlib, CompressionStream) +
//   prédicteur horizontal, sinon brut ; IFD en tête du fichier. Calage :
//   · tiepoint + pixelscale (33922 / 33550) si l'affine pixel → projection est sans rotation (termes
//     croisés < 0,1 px sur toute l'image) : la forme que lit tout SIG, et l'import de l'app ;
//   · sinon ModelTransformation (34264) : l'affine exacte, rotation comprise (GDAL / QGIS la lisent ;
//     l'import de l'app la refuse en la nommant, tiff.err.rotation).
//   GeoKeys : Lambert 93 → ProjectedCSTypeGeoKey 2154 ; WGS84 → GeographicTypeGeoKey 4326 ; PixelIsArea.
// ⚠️ L'affine est AJUSTÉE (moindres carrés sur une grille) : en WGS84 elle est exacte (planToGps est
//   affine en degrés) ; en Lambert 93 la courbure laisse un écart, mesuré et rendu (`residuM`, ~0,2 m sur
//   2,5 km, ~0,75 m sur 5 km), dit à l'utilisateur au-delà de 0,5 m.
// 🩸 Jamais l'image entière en mémoire : rendu par blocs (MyKTAMapExporterGenererCanvas + `region`, tuiles
//   V2 lues par bloc), découpés en tuiles compressées aussitôt. Taille plafonnée : < 4 Go (pas de BigTIFF),
//   64 Mpx sur téléphone, 128 Mpx sans Deflate ; la résolution produite est annoncée avant l'export.
// Expose : window.GeotiffExport { afficherModale, generer, calageDisponible, _interne }
// Garde-fou : scripts/check-export-sig.js · Doc : docs/architecture/exports.md

(function() {
  "use strict";

  const TUILE = 256;
  const EPSG_L93 = 2154, EPSG_WGS84 = 4326;
  const PLAFOND_TELEPHONE = 64 * 1024 * 1024;           // px, comme l'export image
  const PLAFOND_TIFF = Math.floor(3.9e9 / 3);           // px : < 4 Go même si Deflate ne gagne rien
  const PLAFOND_SANS_DEFLATE = 128 * 1024 * 1024;       // px : 384 Mo bruts gardés en mémoire
  const RESOLS = [1, 0.5, 0.25];
  const LOT = 16;                                       // tuiles compressées en parallèle
  const ECART_SIGNALE_M = 0.5;                          // au-delà, l'écart de l'affine Lambert 93 est dit

  function t(k, p) { return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k; }

  // ── Écriture TIFF (pure, testée par scripts/check-export-sig.js) ─────────────────────────

  // Prédicteur 2 en place, ligne par ligne, de droite à gauche (chaque octet devient l'écart avec le même
  // canal du pixel précédent). 🩸 Chaque ligne de TUILE repart de zéro, comme le lit tiffGeoref.js.
  function appliquerPredicteur(u8, largeur, hauteur, canaux) {
    const ligne = largeur * canaux;
    for (let l = 0; l < hauteur; l++) {
      const base = l * ligne;
      for (let i = ligne - 1; i >= canaux; i--) u8[base + i] = (u8[base + i] - u8[base + i - canaux]) & 0xff;
    }
    return u8;
  }

  // Tuile RGB pleine (TUILE²) copiée depuis une source RGBA (ImageData) ou RGB ; hors source = 0 (les
  // tuiles du bord sont complétées, exigence TIFF).
  function extraireTuile(src, srcLargeur, srcHauteur, srcCanaux, x0, y0) {
    const out = new Uint8Array(TUILE * TUILE * 3);
    const w = Math.min(TUILE, srcLargeur - x0), h = Math.min(TUILE, srcHauteur - y0);
    for (let l = 0; l < h; l++) {
      let s = ((y0 + l) * srcLargeur + x0) * srcCanaux, d = l * TUILE * 3;
      for (let c = 0; c < w; c++, s += srcCanaux, d += 3) {
        out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2];
      }
    }
    return out;
  }

  function deflateDisponible() { return typeof CompressionStream === "function"; }

  // ⚠️ TIFF Deflate (code 8) = flux zlib AVEC en-tête : "deflate", pas "deflate-raw".
  async function _deflate(u8) {
    const flux = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }

  async function encoderTuile(rgb, compresser) {
    if (!compresser) return rgb;
    return _deflate(appliquerPredicteur(rgb, TUILE, TUILE, 3));
  }

  // GeoKeyDirectory : en-tête (version 1.1.0, N clés) puis quadruplets triés par clé.
  function geoKeys(epsg) {
    const cles = (epsg === EPSG_WGS84)
      ? [[1024, 2], [1025, 1], [2048, EPSG_WGS84], [2054, 9102]]   // géographique, degrés
      : [[1024, 1], [1025, 1], [3072, EPSG_L93], [3076, 9001]];    // projeté, mètres
    const out = [1, 1, 0, cles.length];
    cles.forEach(function(k) { out.push(k[0], 0, 1, k[1]); });
    return out;
  }

  // En-tête + IFD + valeurs longues, placés AVANT les tuiles (offsets connus dès que les tailles des tuiles
  // le sont). desc = { w, h, compression (1 | 8), octetsTuiles: [n], epsg, geo: { pixelScale, tiepoint }
  // | { matrice } } → Uint8Array dont la longueur est le décalage de la 1re tuile.
  function entete(desc) {
    const nx = Math.ceil(desc.w / TUILE), ny = Math.ceil(desc.h / TUILE), n = nx * ny;
    if (desc.octetsTuiles.length !== n) throw new Error("tuiles : " + desc.octetsTuiles.length + " ≠ " + n);
    const logiciel = "MyKTAMap\0";
    const e = [
      { tag: 256, type: 4, v: [desc.w] },
      { tag: 257, type: 4, v: [desc.h] },
      { tag: 258, type: 3, v: [8, 8, 8] },
      { tag: 259, type: 3, v: [desc.compression] },
      { tag: 262, type: 3, v: [2] },                       // RGB
      { tag: 277, type: 3, v: [3] },
      { tag: 284, type: 3, v: [1] },                       // canaux entrelacés
      { tag: 305, type: 2, v: Array.from(logiciel, function(c) { return c.codePointAt(0); }) },
      { tag: 322, type: 3, v: [TUILE] },
      { tag: 323, type: 3, v: [TUILE] },
      { tag: 324, type: 4, v: new Array(n).fill(0) },      // offsets : remplis plus bas
      { tag: 325, type: 4, v: desc.octetsTuiles.slice() },
      { tag: 34735, type: 3, v: geoKeys(desc.epsg) }
    ];
    if (desc.compression === 8) e.push({ tag: 317, type: 3, v: [2] });
    if (desc.geo.matrice) e.push({ tag: 34264, type: 12, v: desc.geo.matrice });
    else {
      e.push({ tag: 33550, type: 12, v: desc.geo.pixelScale });
      e.push({ tag: 33922, type: 12, v: desc.geo.tiepoint });
    }
    e.sort(function(a, b) { return a.tag - b.tag; });     // ⚠️ ordre croissant exigé par la norme

    const TAILLE = { 2: 1, 3: 2, 4: 4, 12: 8 };
    const debutValeurs = 8 + 2 + e.length * 12 + 4;
    let curseur = debutValeurs;
    e.forEach(function(x) {
      x.taille = TAILLE[x.type] * x.v.length;
      if (x.taille > 4) { x.off = curseur; curseur += x.taille + (x.taille & 1); }   // mot pair
    });
    const total = curseur;
    let off = total;
    const offs = e.find(function(x) { return x.tag === 324; }).v;
    desc.octetsTuiles.forEach(function(len, i) { offs[i] = off; off += len; });
    if (off > 0xFFFFFFFF) throw new Error("geotiff.err.tropGros");

    const buf = new ArrayBuffer(total), dv = new DataView(buf);
    dv.setUint8(0, 0x49); dv.setUint8(1, 0x49); dv.setUint16(2, 42, true); dv.setUint32(4, 8, true);
    dv.setUint16(8, e.length, true);
    const ecrire = function(o, type, v) {
      v.forEach(function(val, i) {
        if (type === 2) dv.setUint8(o + i, val);
        else if (type === 3) dv.setUint16(o + i * 2, val, true);
        else if (type === 4) dv.setUint32(o + i * 4, val, true);
        else dv.setFloat64(o + i * 8, val, true);
      });
    };
    e.forEach(function(x, i) {
      const p = 10 + i * 12;
      dv.setUint16(p, x.tag, true); dv.setUint16(p + 2, x.type, true); dv.setUint32(p + 4, x.v.length, true);
      if (x.taille > 4) { dv.setUint32(p + 8, x.off, true); ecrire(x.off, x.type, x.v); }
      else ecrire(p + 8, x.type, x.v);                     // valeur EN PLACE, cadrée à gauche
    });
    dv.setUint32(10 + e.length * 12, 0, true);             // pas d'IFD suivant
    return new Uint8Array(buf);
  }

  // Image RGB(A) entière → fichier TIFF (Uint8Array). Pour les petites images et le garde-fou ; le plan
  // passe par generer(), bloc par bloc, avec les mêmes entete / extraireTuile / encoderTuile.
  async function ecrireTiff(pixels, w, h, canaux, opts) {
    const nx = Math.ceil(w / TUILE), ny = Math.ceil(h / TUILE), tuiles = [];
    const comp = !!(opts && opts.compresser);
    for (let ty = 0; ty < ny; ty++) {
      for (let tx = 0; tx < nx; tx++) {
        tuiles.push(await encoderTuile(extraireTuile(pixels, w, h, canaux, tx * TUILE, ty * TUILE), comp));
      }
    }
    const tete = entete({ w: w, h: h, compression: comp ? 8 : 1, epsg: opts.epsg, geo: opts.geo,
                          octetsTuiles: tuiles.map(function(u) { return u.length; }) });
    const total = tuiles.reduce(function(s, u) { return s + u.length; }, tete.length);
    const out = new Uint8Array(total);
    out.set(tete, 0);
    let o = tete.length;
    tuiles.forEach(function(u) { out.set(u, o); o += u.length; });
    return out;
  }

  // ── Calage : affine pixel du raster → coordonnées de la projection ───────────────────────

  // Pixel (i, j) du raster = coin du pixel (PixelIsArea) = point plan (i / r, j / r). Ajustement aux moindres
  // carrés de X = a·i + b·j + c, Y = d·i + e·j + f sur une grille 9 × 9, écart max mesuré sur 17 × 17.
  function calculerGeoref(transform, r, outW, outH, epsg) {
    const KE = window.KmzExport;
    const L93 = window.SigImport && window.SigImport.L93;
    if (epsg !== EPSG_WGS84 && !L93) throw new Error("SigImport.L93 absent");
    const proj = function(i, j) {
      const ll = KE.planToGps(transform, i / r, j / r);
      if (epsg === EPSG_WGS84) return { X: ll.lng, Y: ll.lat, lat: ll.lat };
      const p = L93.versL93(ll.lat, ll.lng);
      return { X: p.x, Y: p.y, lat: ll.lat };
    };
    // Normales 3 × 3 : (u, v) = (i/outW, j/outH) centrés-réduits pour le conditionnement.
    const N = 9, A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        const u = a / (N - 1), v = b / (N - 1), q = proj(u * outW, v * outH), row = [u, v, 1];
        for (let m = 0; m < 3; m++) {
          for (let k = 0; k < 3; k++) A[m][k] += row[m] * row[k];
          bx[m] += row[m] * q.X; by[m] += row[m] * q.Y;
        }
      }
    }
    const resoudre = function(M, y) {
      const det = function(m) {
        return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
               m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      };
      const d = det(M);
      return [0, 1, 2].map(function(c) {
        const Mc = M.map(function(ligne, l) { return ligne.map(function(v, k) { return k === c ? y[l] : v; }); });
        return det(Mc) / d;
      });
    };
    const sX = resoudre(A, bx), sY = resoudre(A, by);
    // Retour aux pixels : u = i / outW, v = j / outH.
    const a = sX[0] / outW, b = sX[1] / outH, c = sX[2];
    const d = sY[0] / outW, e = sY[1] / outH, f = sY[2];

    // Écart max du modèle affine, en mètres au sol.
    let residuM = 0;
    const M = 17;
    for (let ia = 0; ia < M; ia++) {
      for (let jb = 0; jb < M; jb++) {
        const i = ia / (M - 1) * outW, j = jb / (M - 1) * outH, q = proj(i, j);
        let dX = a * i + b * j + c - q.X, dY = d * i + e * j + f - q.Y;
        if (epsg === EPSG_WGS84) { dX *= 111320 * Math.cos(q.lat * Math.PI / 180); dY *= 110540; }
        residuM = Math.max(residuM, Math.hypot(dX, dY));
      }
    }

    // Sans rotation : les termes croisés déplacent de moins de 0,1 px sur toute l'image, et l'image n'est pas
    // en miroir (X croît vers la droite, Y décroît vers le bas).
    const sansRotation = a > 0 && e < 0 && Math.abs(b) * outH < 0.1 * a && Math.abs(d) * outW < 0.1 * -e;
    const geo = sansRotation
      ? { pixelScale: [a, -e, 0], tiepoint: [0, 0, 0, c, f, 0] }
      : { matrice: [a, b, 0, c, d, e, 0, f, 0, 0, 0, 0, 0, 0, 0, 1] };
    return { geo: geo, mode: sansRotation ? "tiepoint" : "matrice", residuM: residuM,
             affine: { a: a, b: b, c: c, d: d, e: e, f: f }, epsg: epsg };
  }

  // ── Plan courant ─────────────────────────────────────────────────────────────────────────

  function _planId() { return window._currentLoadedPlanId || "default"; }

  // Transformation du calage enregistré (Export externe, Réglages, Générateur), ou null.
  function calageDisponible() {
    const KE = window.KmzExport;
    if (!KE || typeof KE.getCalibration !== "function") return null;
    const c = KE.getCalibration(_planId());
    if (!c || !c.pointA || !c.pointB) return null;
    try { return KE.buildTransformCalib(c); } catch (e) { return null; }
  }

  function _estTelephone() {
    const ios = (typeof window.ktaEstIos === "function") && window.ktaEstIos();
    return ios || /Mobi|Android|iPhone|iPad/i.test((typeof navigator !== "undefined" && navigator.userAgent) || "");
  }

  function plafondPx() {
    let p = PLAFOND_TIFF;
    if (_estTelephone()) p = Math.min(p, PLAFOND_TELEPHONE);
    if (!deflateDisponible()) p = Math.min(p, PLAFOND_SANS_DEFLATE);
    return p;
  }

  function _dims(r) {
    const pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    return { w: Math.max(1, Math.round(pc.imageWidth * r)), h: Math.max(1, Math.round(pc.imageHeight * r)) };
  }

  // Plus grand facteur (au millième) sous le plafond.
  function _facteurMax(plafond) {
    const pc = window.PLAN_CONFIG.plan;
    let r = Math.floor(Math.sqrt(plafond / (pc.imageWidth * pc.imageHeight)) * 1000) / 1000;
    while (r > 0.001) { const d = _dims(r); if (d.w * d.h <= plafond) break; r = Math.round((r - 0.001) * 1000) / 1000; }
    return Math.min(1, r);
  }

  // Options du rendu canvas d'un bloc (cf exporter.js > _publicGenererCanvas).
  function _optionsRendu(contenu) {
    if (contenu !== "dessins") {
      return { bg: "image", includeImgLayers: false, includeDataLayers: false, ann: {} };
    }
    const vis = (typeof window.MyKTAMapExporterCalquesVisibles === "function")
      ? window.MyKTAMapExporterCalquesVisibles() : { image: [], data: [] };
    const versObjet = function(ids) { const o = {}; ids.forEach(function(id) { o[id] = true; }); return o; };
    // Comme l'export image rapide : calques visibles, toutes les annotations, niveaux affichés.
    const ml = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const niveaux = (ml && Array.isArray(window.APP_CONFIG.visibleLevels)) ? new Set(window.APP_CONFIG.visibleLevels) : null;
    return {
      bg: "image",
      imageLayers: versObjet(vis.image), includeImgLayers: vis.image.length > 0,
      dataLayers: versObjet(vis.data), includeDataLayers: vis.data.length > 0,
      ann: { points: true, roads: true, zones: true, structures: true, levels: niveaux }
    };
  }

  // opts = { contenu: "scan" | "dessins", epsg: 2154 | 4326, facteur, onProgres(fraction) }
  // → { blob, w, h, facteur, octets, dureeMs, mode, residuM, compression, epsg }
  async function generer(opts) {
    const debut = Date.now();
    const transform = calageDisponible();
    if (!transform) throw new Error(t("geotiff.err.nonCale"));
    if (typeof window.MyKTAMapExporterGenererCanvas !== "function") throw new Error(t("geotiff.err.moteur"));
    const epsg = (opts.epsg === EPSG_WGS84) ? EPSG_WGS84 : EPSG_L93;
    let r = Number(opts.facteur) > 0 ? Number(opts.facteur) : 1;
    let d = _dims(r);
    const plafond = plafondPx();
    if (d.w * d.h > plafond) { r = _facteurMax(plafond); d = _dims(r); }
    const W = d.w, H = d.h;
    const georef = calculerGeoref(transform, r, W, H, epsg);
    const compresser = deflateDisponible();

    const nx = Math.ceil(W / TUILE), ny = Math.ceil(H / TUILE);
    const octetsTuiles = new Array(nx * ny);
    const ordre = [];          // index des tuiles dans l'ordre d'écriture
    const morceaux = [];       // un Blob par bloc : le navigateur peut les sortir de la mémoire vive
    const ios = (typeof window.ktaEstIos === "function") && window.ktaEstIos();
    const BLOC = ios ? 2048 : 4096;   // canvas ≤ 16 Mpx (limite WebKit)
    const rendu = _optionsRendu(opts.contenu);
    const nbBlocs = Math.ceil(W / BLOC) * Math.ceil(H / BLOC);
    let fait = 0;

    for (let by = 0; by < H; by += BLOC) {
      for (let bx = 0; bx < W; bx += BLOC) {
        const bw = Math.min(BLOC, W - bx), bh = Math.min(BLOC, H - by);
        const cv = await window.MyKTAMapExporterGenererCanvas(Object.assign({}, rendu, {
          scale: r, region: { x: bx / r, y: by / r, w: bw / r, h: bh / r }
        }));
        if (!cv || !cv.width) throw new Error(t("geotiff.err.rendu"));
        const img = cv.getContext("2d").getImageData(0, 0, Math.min(bw, cv.width), Math.min(bh, cv.height));
        cv.width = cv.height = 0;
        // Tuiles du bloc compressées par lots parallèles (la compression du navigateur n'occupe pas le fil JS).
        const travaux = [];
        for (let ty = 0; ty < bh; ty += TUILE) {
          for (let tx = 0; tx < bw; tx += TUILE) travaux.push([tx, ty]);
        }
        const parts = [];
        for (let i = 0; i < travaux.length; i += LOT) {
          const lot = travaux.slice(i, i + LOT);
          const faites = await Promise.all(lot.map(function(tt) {
            return encoderTuile(extraireTuile(img.data, img.width, img.height, 4, tt[0], tt[1]), compresser);
          }));
          faites.forEach(function(tuile, k) {
            const n = ((by + lot[k][1]) / TUILE) * nx + (bx + lot[k][0]) / TUILE;
            octetsTuiles[n] = tuile.length;
            ordre.push(n);
            parts.push(tuile);
          });
        }
        morceaux.push(new Blob(parts));
        fait++;
        if (typeof opts.onProgres === "function") opts.onProgres(fait / nbBlocs);
      }
    }

    // Les tuiles sont écrites dans l'ordre des blocs : les offsets suivent cet ordre, l'IFD les range par index.
    const tete = entete({ w: W, h: H, compression: compresser ? 8 : 1, epsg: epsg, geo: georef.geo,
                          octetsTuiles: octetsTuiles });
    const offsEnTete = _offsetsDansLOrdre(tete.length, octetsTuiles, ordre);
    _reecrireOffsets(tete, offsEnTete);
    const blob = new Blob([tete].concat(morceaux), { type: "image/tiff" });
    return { blob: blob, w: W, h: H, facteur: r, octets: blob.size, dureeMs: Date.now() - debut,
             mode: georef.mode, residuM: georef.residuM, compression: compresser ? "deflate" : "aucune",
             epsg: epsg, plafonne: r !== (Number(opts.facteur) > 0 ? Number(opts.facteur) : 1) };
  }

  // entete() range les tuiles par index ; generer() les écrit par bloc : offsets recalculés dans l'ordre réel.
  function _offsetsDansLOrdre(debut, octetsTuiles, ordre) {
    const offs = new Array(octetsTuiles.length);
    let o = debut;
    ordre.forEach(function(n) { offs[n] = o; o += octetsTuiles[n]; });
    if (o > 0xFFFFFFFF) throw new Error(t("geotiff.err.tropGros"));
    return offs;
  }

  function _reecrireOffsets(tete, offs) {
    const dv = new DataView(tete.buffer, tete.byteOffset, tete.byteLength);
    const nb = dv.getUint16(8, true);
    for (let i = 0; i < nb; i++) {
      const p = 10 + i * 12;
      if (dv.getUint16(p, true) !== 324) continue;
      const cnt = dv.getUint32(p + 4, true);
      const o = cnt > 1 ? dv.getUint32(p + 8, true) : p + 8;
      for (let k = 0; k < cnt; k++) dv.setUint32(o + k * 4, offs[k], true);
      return;
    }
    throw new Error("TileOffsets absent");
  }

  // ── Modale ───────────────────────────────────────────────────────────────────────────────

  let _modal = null, _onEchap = null;

  function _fermer() {
    if (_onEchap) { document.removeEventListener("keydown", _onEchap); _onEchap = null; }
    if (_modal) { _modal.remove(); _modal = null; }
  }

  function _radio(nom, valeur, libelle, coche, desactive) {
    return '<label class="kta-export-radio-row' + (desactive ? ' kta-disabled' : '') + '">' +
             '<input type="radio" name="' + nom + '" value="' + valeur + '"' + (coche ? ' checked' : '') +
             (desactive ? ' disabled' : '') + '>' +
             '<span>' + libelle + '</span>' +
           '</label>';
  }

  function _val(nom) {
    const el = _modal && _modal.querySelector('input[name="' + nom + '"]:checked');
    return el ? el.value : null;
  }

  function _majInfo() {
    const el = document.getElementById("kta-geotiff-info");
    if (!el) return;
    const r = Number.parseFloat(_val("geotiff_resol") || "1");
    const d = _dims(r);
    const transform = calageDisponible();
    let mpp = "";
    if (transform && transform.metresParPixel > 0) mpp = (transform.metresParPixel / r).toFixed(3);
    el.textContent = (mpp ? t("geotiff.info.taille", { w: d.w, h: d.h, mpp: mpp })
                          : t("geotiff.info.tailleSeule", { w: d.w, h: d.h })) +
      (_estTelephone() ? " " + t("geotiff.info.telephone") : "") +
      (deflateDisponible() ? "" : " " + t("geotiff.info.sansDeflate"));
  }

  function afficherModale() {
    _fermer();
    const pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    if (!pc || !pc.imageWidth) { window.ktaAlerte(t("imgexport.alert.noConfig"), { type: "erreur" }); return; }
    const cale = !!calageDisponible();

    // Résolutions : celles qui dépassent le plafond de l'appareil sont grisées ; si aucune ne tient, « Max ».
    const plafond = plafondPx();
    let choix = null;
    const lignes = RESOLS.map(function(r) {
      const d = _dims(r), tient = d.w * d.h <= plafond;
      if (tient && choix === null) choix = r;
      return { r: r, tient: tient };
    });
    let html = lignes.map(function(l) {
      const lib = l.r === 1 ? t("imgexport.format.resol.originale") : (l.r === 0.5 ? "½" : "¼");
      return _radio("geotiff_resol", l.r, lib, l.r === choix, !l.tient);
    }).join("");
    if (choix === null) {
      const rMax = _facteurMax(plafond);
      html += _radio("geotiff_resol", rMax, t("geotiff.resol.max"), true, false);
    }

    const m = document.createElement("div");
    m.id = "kta-geotiff-modal";
    m.className = "kta-readme-modal-overlay";
    m.innerHTML =
      '<div class="kta-readme-modal-boite kta-export-modal-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + t("geotiff.modal.titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-geotiff-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="font-size:13px; color:var(--kta-texte-2); margin:0 0 12px; line-height:1.5;">' +
            t("geotiff.intro") + '</p>' +
          (cale ? '' :
            '<p id="kta-geotiff-noncale" class="kta-tx-warn" style="font-size:13px; margin:0 0 12px; line-height:1.5;">' +
              t("geotiff.nonCale") + '</p>') +
          '<div class="kta-aide-section">' +
            '<div class="kta-aide-section-titre">' + t("geotiff.contenu.titre") + '</div>' +
            _radio("geotiff_contenu", "scan", t("geotiff.contenu.scan"), true, false) +
            _radio("geotiff_contenu", "dessins", t("geotiff.contenu.dessins"), false, false) +
          '</div>' +
          '<div class="kta-aide-section">' +
            '<div class="kta-aide-section-titre">' + t("geotiff.proj.titre") + '</div>' +
            _radio("geotiff_proj", String(EPSG_L93), t("geotiff.proj.l93"), false, false) +
            _radio("geotiff_proj", String(EPSG_WGS84), t("geotiff.proj.wgs84"), true, false) +
          '</div>' +
          '<div class="kta-aide-section">' +
            '<div class="kta-aide-section-titre">' + t("imgexport.format.resolution") + '</div>' +
            html +
            '<p id="kta-geotiff-info" style="font-size:11.5px; color:var(--kta-texte-3); margin:8px 0 0; line-height:1.45;"></p>' +
          '</div>' +
          '<div class="kta-conv-actions" style="margin-top:14px;">' +
            '<button class="kta-btn kta-btn-ghost" id="kta-geotiff-annuler" type="button">' + t("imgexport.btn.annuler") + '</button>' +
            // Non calé : bouton secondaire ET désactivé (aucun style « désactivé » commun aux .kta-btn).
            '<button class="kta-btn ' + (cale ? 'kta-btn-primary' : 'kta-btn-ghost') + '" id="kta-geotiff-go" type="button"' +
              (cale ? '' : ' disabled aria-describedby="kta-geotiff-noncale" style="cursor:not-allowed;"') + '>' +
              t("imgexport.btn.telecharger") + '</button>' +
          '</div>' +
          '<div id="kta-geotiff-erreur" class="kta-conv-erreur" style="display:none;"></div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(m);
    _modal = m;

    document.getElementById("kta-geotiff-close").addEventListener("click", _fermer);
    document.getElementById("kta-geotiff-annuler").addEventListener("click", _fermer);
    m.addEventListener("click", function(e) { if (e.target === m) _fermer(); });
    _onEchap = function(e) { if (e.key === "Escape") _fermer(); };
    document.addEventListener("keydown", _onEchap);
    m.querySelectorAll('input[name="geotiff_resol"]').forEach(function(el) { el.addEventListener("change", _majInfo); });
    _majInfo();

    const go = document.getElementById("kta-geotiff-go");
    go.addEventListener("click", async function() {
      const texte = go.textContent;
      go.disabled = true;
      const err = document.getElementById("kta-geotiff-erreur");
      err.style.display = "none";
      try {
        const res = await generer({
          contenu: _val("geotiff_contenu") || "scan",
          epsg: Number.parseInt(_val("geotiff_proj") || String(EPSG_WGS84), 10),
          facteur: Number.parseFloat(_val("geotiff_resol") || "1"),
          onProgres: function(f) { go.textContent = "⏳ " + Math.round(f * 100) + " %"; }
        });
        _telecharger(res);
        _fermer();
      } catch (e) {
        console.error("[GeotiffExport]", e);
        err.textContent = t("imgexport.erreur.prefixe", { msg: (e && e.message) || e });
        err.style.display = "block";
        go.disabled = false;
        go.textContent = texte;
      }
    });
  }

  function _telecharger(res) {
    const nomPlan = String((window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "plan")
      .replace(/[^a-z0-9]+/gi, "_");
    const a = document.createElement("a");
    const url = URL.createObjectURL(res.blob);
    a.href = url;
    a.download = "MyKTAMap_" + nomPlan + "_" + new Date().toISOString().slice(0, 10) + "_" +
                 (res.epsg === EPSG_WGS84 ? "WGS84" : "L93") + ".tif";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(t(res.plafonne ? "geotiff.faitPlafonne" : "geotiff.fait", {
        w: res.w, h: res.h, mo: (res.octets / 1048576).toFixed(1), s: Math.round(res.dureeMs / 1000)
      }), "success");
      // L'affine ne suit pas la courbure du Lambert 93 sur un grand plan : l'écart est dit, jamais tu.
      if (res.epsg === EPSG_L93 && res.residuM > ECART_SIGNALE_M) {
        window.OOMGuard.showToast(t("geotiff.ecartL93", { m: res.residuM.toFixed(1) }), "warn");
      }
    }
  }

  window.GeotiffExport = {
    afficherModale: afficherModale,
    generer: generer,
    calageDisponible: calageDisponible,
    // Pour le garde-fou Node et le checkup : fonctions pures, sans DOM.
    _interne: { TUILE: TUILE, entete: entete, ecrireTiff: ecrireTiff, extraireTuile: extraireTuile,
                appliquerPredicteur: appliquerPredicteur, geoKeys: geoKeys, calculerGeoref: calculerGeoref,
                offsetsDansLOrdre: _offsetsDansLOrdre, reecrireOffsets: _reecrireOffsets,
                deflateDisponible: deflateDisponible }
  };
  console.log("[GeotiffExport] module chargé");
})();
