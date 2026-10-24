/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// tiffGeoref.js — lecture d'un GeoTIFF calé (QGIS) pour le Générateur : image + calage d'un coup.
// Le navigateur ne décode pas le TIFF : pixels décodés ici puis ré-encodés en PNG (canvas.toBlob).
// Calage : ModelPixelScale (33550) + ModelTiepoint (33922) ou ModelTransformation (34264),
//   EPSG via GeoKeyDirectory (34735) → plan.georef pointA/pointB (nord en haut), + pointC pour une
//   matrice tournée qui est une similitude ; une image étirée ou cisaillée est refusée.
// ⚠️ Sous-ensemble lu, pas de geotiff.js générique (décision produit) : IFD 0, bandes OU tuiles,
//   PlanarConfig 1, 8 bits, LZW / Deflate / brut, predictor 1-2. Tout le reste est REFUSÉ EN LE NOMMANT
//   (clé tiff.err.*), jamais deviné en silence. Les tuiles sont lues parce que l'export GeoTIFF de
//   l'app (js/geotiffExport.js) en écrit, comme QGIS en TILED=YES.
// 🩸 Projections : window.SigImport.L93 / .WEBMERC uniquement, aucune copie locale des maths.
// Expose : window.TiffGeoref { estTiff, lire, EXT_ACCEPTEES, _interne } — 100 % local.
// Garde-fous : scripts/check-geotiff.js, scripts/check-export-sig.js

(function() {
  "use strict";

  const EXT_ACCEPTEES = ".tif,.tiff";

  // Taille par code de type d'entrée d'IFD. Type inconnu → 0 : l'entrée est ignorée au lieu de
  // lire n'importe où.
  const TAILLE_TYPE = { 1:1, 2:1, 3:2, 4:4, 5:8, 6:1, 7:1, 8:2, 9:4, 10:8, 11:4, 12:8 };

  const T = {
    LARGEUR: 256, HAUTEUR: 257, BITS: 258, COMPRESSION: 259, PHOTO: 262,
    STRIP_OFF: 273, SPP: 277, ROWS_PER_STRIP: 278, STRIP_CNT: 279,
    PLANAR: 284, PREDICTOR: 317, COLORMAP: 320, TILE_W: 322, TILE_H: 323,
    TILE_OFF: 324, TILE_CNT: 325, EXTRA: 338,
    PIXEL_SCALE: 33550, TIEPOINT: 33922, TRANSFORM: 34264, GEO_KEYS: 34735
  };

  // Noms pour que le refus dise ce qu'il refuse (« compression JPEG » se règle dans QGIS).
  const NOM_COMPRESSION = {
    1: "aucune", 2: "CCITT G3", 3: "CCITT T.4", 4: "CCITT T.6", 5: "LZW",
    6: "JPEG (ancien)", 7: "JPEG", 8: "Deflate", 32773: "PackBits",
    32946: "Deflate (Adobe)", 34712: "JPEG 2000", 50000: "Zstd", 50001: "WebP"
  };

  const COMPRESSIONS_LUES = [1, 5, 8, 32946];

  // Écart relatif toléré entre une matrice de calage et une similitude (échelles, orthogonalité) : cf _matrice.
  const TOLERANCE_SIMILITUDE = 0.01;

  // ── Lecture de l'IFD 0 ───────────────────────────────────────────────────
  // En-tête de 8 octets puis entrées de 12 octets (tag, type, nombre, valeur-ou-offset).
  // Seul l'IFD 0 compte : les suivants sont des aperçus réduits (overviews).
  function _lireIfd0(buf) {
    const dv = new DataView(buf);
    if (buf.byteLength < 8) throw new Error("tiff.err.tropCourt");

    const b0 = dv.getUint8(0), b1 = dv.getUint8(1);
    let le;
    if (b0 === 0x49 && b1 === 0x49) le = true;        // "II" — petit-boutiste
    else if (b0 === 0x4D && b1 === 0x4D) le = false;  // "MM" — gros-boutiste
    else throw new Error("tiff.err.pasUnTiff");

    const magic = dv.getUint16(2, le);
    // 43 = BigTIFF (offsets 64 bits) : refusé.
    if (magic === 43) throw new Error("tiff.err.bigTiff");
    if (magic !== 42) throw new Error("tiff.err.pasUnTiff");

    const offIfd = dv.getUint32(4, le);
    if (offIfd + 2 > buf.byteLength) throw new Error("tiff.err.ifdHorsFichier");
    const nb = dv.getUint16(offIfd, le);

    const tags = {};
    for (let i = 0; i < nb; i++) {
      const p = offIfd + 2 + i * 12;
      if (p + 12 > buf.byteLength) break;
      const tag  = dv.getUint16(p, le);
      const type = dv.getUint16(p + 2, le);
      const cnt  = dv.getUint32(p + 4, le);
      const taille = (TAILLE_TYPE[type] || 0) * cnt;
      if (!taille) continue;
      // ⚠️ Valeur ≤ 4 octets écrite EN PLACE dans l'entrée ; au-delà, c'est un offset.
      const vo = (taille <= 4) ? (p + 8) : dv.getUint32(p + 8, le);
      if (vo + taille > buf.byteLength) continue;
      tags[tag] = _lireValeurs(dv, vo, type, cnt, le);
    }
    return { le: le, tags: tags };
  }

  function _lireValeurs(dv, off, type, cnt, le) {
    const out = new Array(cnt);
    for (let i = 0; i < cnt; i++) {
      switch (type) {
        case 1: case 2: case 7: out[i] = dv.getUint8(off + i); break;
        case 3:  out[i] = dv.getUint16(off + i * 2, le); break;
        case 4:  out[i] = dv.getUint32(off + i * 4, le); break;
        case 6:  out[i] = dv.getInt8(off + i); break;
        case 8:  out[i] = dv.getInt16(off + i * 2, le); break;
        case 9:  out[i] = dv.getInt32(off + i * 4, le); break;
        case 11: out[i] = dv.getFloat32(off + i * 4, le); break;
        case 12: out[i] = dv.getFloat64(off + i * 8, le); break;
        case 5:  out[i] = dv.getUint32(off + i * 8, le) / dv.getUint32(off + i * 8 + 4, le); break;
        default: out[i] = 0;
      }
    }
    return out;
  }

  // ── Décompression ────────────────────────────────────────────────────────
  // Entrées « un octet » du dictionnaire LZW, identiques pour chaque bande.
  const _SINGLETONS = (function() {
    const a = new Array(256);
    for (let i = 0; i < 256; i++) a[i] = new Uint8Array([i]);
    return a;
  })();

  // LZW TIFF : codes MSB en tête, 9 → 12 bits, 256 = Clear, 257 = fin de bande.
  // 🩸 La largeur augmente UN CODE EN AVANCE (early change, `dictLen + 1`) ; avec la condition
  // du LZW GIF, le flux se décale d'un bit et l'image sort en bruit.
  function _lzw(src, tailleMax) {
    const out = new Uint8Array(tailleMax);
    const dict = new Array(4096);
    let o = 0, dictLen = 0, largeur = 9, prec = null;
    let bit = 0;
    const nbBits = src.length * 8;

    const reset = function() {
      for (let i = 0; i < 256; i++) dict[i] = _SINGLETONS[i];
      dictLen = 258; largeur = 9; prec = null;
    };
    reset();

    while (bit + largeur <= nbBits) {
      const oct = bit >> 3, dec = bit & 7;
      const bloc = (src[oct] << 16) | ((src[oct + 1] || 0) << 8) | (src[oct + 2] || 0);
      const code = (bloc >> (24 - dec - largeur)) & ((1 << largeur) - 1);
      bit += largeur;

      if (code === 257) break;
      if (code === 256) { reset(); continue; }

      let entree;
      if (code < dictLen && dict[code]) {
        entree = dict[code];
      } else if (prec) {
        // Cas KwKwK : le code référence l'entrée qu'on est en train de créer.
        entree = new Uint8Array(prec.length + 1);
        entree.set(prec); entree[prec.length] = prec[0];
      } else {
        throw new Error("tiff.err.lzwCorrompu");
      }

      if (o + entree.length > out.length) throw new Error("tiff.err.lzwTropLong");
      out.set(entree, o); o += entree.length;

      if (prec) {
        const nouvelle = new Uint8Array(prec.length + 1);
        nouvelle.set(prec); nouvelle[prec.length] = entree[0];
        dict[dictLen++] = nouvelle;
      }
      prec = entree;
      if (dictLen + 1 >= (1 << largeur) && largeur < 12) largeur++;
    }
    return (o === out.length) ? out : out.subarray(0, o);
  }

  // Deflate natif (DecompressionStream). ⚠️ Le TIFF est en zlib avec en-tête : "deflate",
  // pas "deflate-raw".
  async function _inflate(src) {
    if (typeof DecompressionStream !== "function") throw new Error("tiff.err.deflateIndispo");
    const flux = new Blob([src]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }

  // Predictor 2 : chaque octet = écart avec le même canal du pixel précédent. Ré-addition
  // ligne par ligne (chaque ligne repart de zéro).
  function _predictor2(buf, largeurOctets, spp, nbLignes) {
    for (let l = 0; l < nbLignes; l++) {
      const base = l * largeurOctets;
      for (let i = spp; i < largeurOctets; i++) {
        buf[base + i] = (buf[base + i] + buf[base + i - spp]) & 0xff;
      }
    }
    return buf;
  }

  // Un bloc compressé (bande ou tuile) → octets bruts, prédicteur annulé.
  async function _decompresser(brut, comp, attendu, octetsParLigne, spp, nbLignes, pred, ou) {
    let dec;
    if (comp === 1)      dec = brut;
    else if (comp === 5) dec = _lzw(brut, attendu);
    else                 dec = await _inflate(brut);
    if (dec.length < attendu) {
      const e = new Error("tiff.err.bandeCourte"); e.detail = ou + " : " + dec.length + " < " + attendu; throw e;
    }
    // ⚠️ En brut, `dec` est une vue sur le fichier : copie avant d'y annuler le prédicteur.
    if (pred === 2) dec = _predictor2(comp === 1 ? dec.slice(0, attendu) : dec, octetsParLigne, spp, nbLignes);
    return dec;
  }

  // ── Décodage des pixels → RGBA ───────────────────────────────────────────
  async function _decoderPixels(buf, ifd) {
    const t = ifd.tags;
    const g = function(tag, def) { return (t[tag] && t[tag].length) ? t[tag][0] : def; };

    const w = g(T.LARGEUR, 0), h = g(T.HAUTEUR, 0);
    if (!w || !h) throw new Error("tiff.err.dimsAbsentes");

    const planar = g(T.PLANAR, 1);
    if (planar !== 1) throw new Error("tiff.err.planar");

    const comp = g(T.COMPRESSION, 1);
    if (COMPRESSIONS_LUES.indexOf(comp) === -1) {
      const e = new Error("tiff.err.compression");
      e.detail = NOM_COMPRESSION[comp] || ("code " + comp);
      throw e;
    }

    const spp = g(T.SPP, 1);
    const bits = t[T.BITS] || [8];
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] !== 8) { const e = new Error("tiff.err.bits"); e.detail = bits.join("/"); throw e; }
    }
    if (spp !== 1 && spp !== 3 && spp !== 4) {
      const e = new Error("tiff.err.canaux"); e.detail = String(spp); throw e;
    }

    const photo = g(T.PHOTO, 1);
    // Refusés : 3 = palette, 5 = CMYK, 6 = YCbCr (absents des plans calés par QGIS).
    if (photo !== 0 && photo !== 1 && photo !== 2) {
      const e = new Error("tiff.err.photometrie"); e.detail = String(photo); throw e;
    }
    if (photo === 2 && spp < 3) throw new Error("tiff.err.rgbIncoherent");

    const pred = g(T.PREDICTOR, 1);
    if (pred !== 1 && pred !== 2) { const e = new Error("tiff.err.predictor"); e.detail = String(pred); throw e; }

    const octetsParLigne = w * spp;
    const plein = new Uint8Array(octetsParLigne * h);
    const morceau = function(off, cnt) {
      return new Uint8Array(buf, off, Math.max(0, Math.min(cnt, buf.byteLength - off)));
    };

    if (t[T.TILE_W] || t[T.TILE_H]) {
      // Tuiles de taille pleine (celles du bord complétées), rangées ligne par ligne ; un index tronqué
      // est refusé (tiff.err.tuile) plutôt que de laisser des trous noirs.
      // 🩸 Le prédicteur repart à chaque ligne de TUILE (largeur tw), pas de l'image.
      const tw = g(T.TILE_W, 0), th = g(T.TILE_H, 0);
      const offs = t[T.TILE_OFF], cnts = t[T.TILE_CNT];
      const nx = tw ? Math.ceil(w / tw) : 0, ny = th ? Math.ceil(h / th) : 0;
      if (!tw || !th || !offs || !cnts || offs.length < nx * ny || cnts.length < nx * ny) {
        throw new Error("tiff.err.tuile");
      }
      const ligneTuile = tw * spp, attendu = ligneTuile * th;
      for (let ty = 0; ty < ny; ty++) {
        for (let tx = 0; tx < nx; tx++) {
          const n = ty * nx + tx;
          const dec = await _decompresser(morceau(offs[n], cnts[n]), comp, attendu, ligneTuile, spp, th, pred,
                                          "tuile " + n);
          const lignes = Math.min(th, h - ty * th), utile = Math.min(tw, w - tx * tw) * spp;
          for (let l = 0; l < lignes; l++) {
            plein.set(dec.subarray(l * ligneTuile, l * ligneTuile + utile),
                      (ty * th + l) * octetsParLigne + tx * tw * spp);
          }
        }
      }
    } else {
      const offs = t[T.STRIP_OFF], cnts = t[T.STRIP_CNT];
      if (!offs || !cnts || !offs.length) throw new Error("tiff.err.bandesAbsentes");
      const rps = g(T.ROWS_PER_STRIP, h);
      let ecrit = 0;
      for (let s = 0; s < offs.length; s++) {
        const lignes = Math.min(rps, h - s * rps);
        if (lignes <= 0) break;
        const attendu = octetsParLigne * lignes;
        const dec = await _decompresser(morceau(offs[s], cnts[s]), comp, attendu, octetsParLigne, spp, lignes, pred,
                                        String(s));
        plein.set(dec.subarray(0, attendu), ecrit);
        ecrit += attendu;
      }
      if (ecrit !== plein.length) { const e = new Error("tiff.err.pixelsManquants"); e.detail = ecrit + " / " + plein.length; throw e; }
    }

    const rgba = new Uint8ClampedArray(w * h * 4);
    const inverse = (photo === 0);   // 0 = MinIsWhite : le 0 est du BLANC
    for (let p = 0, q = 0, r = 0; p < w * h; p++, q += spp, r += 4) {
      if (spp === 1) {
        const v = inverse ? 255 - plein[q] : plein[q];
        rgba[r] = v; rgba[r + 1] = v; rgba[r + 2] = v; rgba[r + 3] = 255;
      } else {
        rgba[r] = plein[q]; rgba[r + 1] = plein[q + 1]; rgba[r + 2] = plein[q + 2];
        rgba[r + 3] = (spp === 4) ? plein[q + 3] : 255;
      }
    }
    return { width: w, height: h, rgba: rgba, compression: NOM_COMPRESSION[comp] || String(comp), spp: spp };
  }

  // ── Calage ───────────────────────────────────────────────────────────────
  // GeoKeyDirectory = quadruplets (clé, emplacement, nombre, valeur) ; emplacement 0 = valeur
  // en place (cas d'un code EPSG). 3072 = CRS projeté, 2048 = CRS géographique.
  function _epsgDeGeoKeys(gk) {
    if (!gk || gk.length < 4) return null;
    const nb = gk[3];
    let projete = null, geographique = null;
    for (let k = 0; k < nb; k++) {
      const p = 4 + k * 4;
      if (p + 3 >= gk.length) break;
      const cle = gk[p], emplacement = gk[p + 1], valeur = gk[p + 3];
      if (emplacement !== 0) continue;
      if (cle === 3072) projete = valeur;
      else if (cle === 2048) geographique = valeur;
    }
    // Un CRS projeté prime : c'est lui qui décrit les unités des tiepoints.
    return projete || geographique || null;
  }

  // Fonction pixel → coordonnées du CRS du fichier (matrice, ou Scale + Tiepoint).
  // `rotationPermise` (contrôle de l'export GeoTIFF seulement) : la matrice entière est appliquée.
  // Matrice 4×4 en ligne : X = [0]·px + [1]·py + [3], Y = [4]·px + [5]·py + [7].
  // Une matrice TOURNÉE est acceptée si c'est une SIMILITUDE (rotation + échelle uniforme) : les deux axes
  // du pixel, ramenés en mètres au sol, ont la même longueur et sont perpendiculaires, à TOLERANCE_SIMILITUDE
  // près, sans miroir. Au-delà (image étirée ou cisaillée) : refus nommé (tiff.err.rotation).
  // ⚠️ La tolérance ne perd rien : `calage` pose 3 coins (A, B, C) que l'affine de l'app reproduit
  // exactement. 1 % couvre les GeoTIFF Lambert 93 exportés par l'app (≤ 0,4 % mesurés : son calage
  // équirectangulaire n'est pas conforme) et refuse une vraie déformation.
  function _matrice(t, epsg) {
    const mt = t[T.TRANSFORM];
    if (!mt || mt.length < 8) return null;
    // Degrés → mètres au sol, mêmes constantes que KmzExport.buildTransform (latitude du pixel (0, 0)).
    let kx = 1, ky = 1;
    if (epsg === 4326 || epsg === 4171) { kx = 111320 * Math.cos(mt[7] * Math.PI / 180); ky = 110540; }
    const ax = mt[0] * kx, ay = mt[4] * ky, bx = mt[1] * kx, by = mt[5] * ky;
    const s1 = Math.hypot(ax, ay), s2 = Math.hypot(bx, by);
    const ref = Math.max(Math.abs(mt[0]), Math.abs(mt[5])) || 1;
    return {
      mt: mt,
      // Échelle par axe dans l'unité du CRS (mètre, ou degré en 4326).
      sx: Math.hypot(mt[0], mt[4]), sy: Math.hypot(mt[1], mt[5]),
      tournee: Math.abs(mt[1]) > ref * 1e-6 || Math.abs(mt[4]) > ref * 1e-6,
      similitude: s1 > 0 && s2 > 0 && Math.abs(s1 / s2 - 1) <= TOLERANCE_SIMILITUDE &&
                  Math.abs((ax * bx + ay * by) / (s1 * s2)) <= TOLERANCE_SIMILITUDE &&
                  (ax * by - ay * bx) < 0   // sans miroir : le Y monde descend quand la ligne croît
    };
  }

  // `rotationPermise` (contrôles de l'export seulement) : la matrice entière, même déformée.
  function _mondeDePixel(t, rotationPermise, epsg) {
    const m = _matrice(t, epsg);
    if (m) {
      const mt = m.mt;
      // Nord en haut (termes croisés nuls) : accepté tel qu'avant, la similitude ne concerne que la rotation.
      if (!rotationPermise && m.tournee && !m.similitude) throw new Error("tiff.err.rotation");
      return function(px, py) { return { X: mt[0] * px + mt[1] * py + mt[3], Y: mt[4] * px + mt[5] * py + mt[7] }; };
    }

    const ps = t[T.PIXEL_SCALE], tp = t[T.TIEPOINT];
    if (ps && ps.length >= 2 && tp && tp.length >= 6) {
      const sx = ps[0], sy = ps[1];
      const i = tp[0], j = tp[1], X = tp[3], Y = tp[4];
      // ⚠️ Le Y du monde DÉCROÎT quand la ligne de pixels croît : l'origine
      // image est en haut à gauche, l'origine du CRS en bas à gauche.
      return function(px, py) { return { X: X + (px - i) * sx, Y: Y - (py - j) * sy }; };
    }
    throw new Error("tiff.err.pasDeCalage");
  }

  // Reprojection vers WGS84 selon l'EPSG ; maths dans sigImport.js seulement.
  function _versWgs84(epsg) {
    const S = window.SigImport;
    if (epsg === 4326 || epsg === 4171) {
      // Degrés : X = longitude, Y = latitude.
      return function(X, Y) { return { lat: Y, lng: X }; };
    }
    if (epsg === 2154) {
      if (!S || !S.L93) throw new Error("tiff.err.sigImportManquant");
      return function(X, Y) { return S.L93.versWgs84(X, Y); };
    }
    if (epsg === 3857 || epsg === 900913 || epsg === 3785) {
      if (!S || !S.WEBMERC) throw new Error("tiff.err.sigImportManquant");
      return function(X, Y) { return S.WEBMERC.versWgs84(X, Y); };
    }
    const e = new Error("tiff.err.crsInconnu");
    e.detail = epsg ? ("EPSG:" + epsg) : "absent";
    throw e;
  }

  // Calage complet : tags → `plan.georef`.
  // 🩸 Le y d'un plan se compte depuis le HAUT (`convertCoord`) : pointA = (0, hauteur) = SUD-OUEST,
  // pointB = (largeur, 0) = NORD-EST — le couple de sigImport.genererZipMyktamap et de
  // KmzExport.buildTransform. Image TOURNÉE (similitude, cf _matrice) : + pointC = (0, 0), coin nord-ouest
  // du fichier ; avec A et B, trois coins non alignés que l'affine de l'app reproduit exactement.
  function calage(ifd, w, h) {
    const t = ifd.tags;
    const epsg = _epsgDeGeoKeys(t[T.GEO_KEYS]);
    const monde = _mondeDePixel(t, false, epsg);
    const mat = _matrice(t, epsg);
    const versLl = _versWgs84(epsg);

    const sw = monde(0, h), ne = monde(w, 0);
    const llSw = versLl(sw.X, sw.Y), llNe = versLl(ne.X, ne.Y);

    if (!isFinite(llSw.lat) || !isFinite(llSw.lng) || !isFinite(llNe.lat) || !isFinite(llNe.lng)) {
      throw new Error("tiff.err.calageNonFini");
    }
    if (Math.abs(llSw.lat) > 90 || Math.abs(llNe.lat) > 90 ||
        Math.abs(llSw.lng) > 180 || Math.abs(llNe.lng) > 180) {
      throw new Error("tiff.err.calageHorsTerre");
    }

    // Échelle par axe : longueur du vecteur colonne (une matrice tournée répartit l'échelle sur 2 termes).
    const ps = t[T.PIXEL_SCALE];
    const sx = ps ? Math.abs(ps[0]) : (mat ? mat.sx : null);
    const sy = ps ? Math.abs(ps[1]) : (mat ? mat.sy : null);

    // 🩸 L'unité du CRS n'est pas toujours le mètre au sol :
    //   4326 = degrés → pas d'emprise en mètres ; 3857 = mètre Mercator gonflé de 1/cos(lat)
    //   (×1,52 vers 49°N) → corrigé par cos(lat) ; 2154 = écart < 1/1000, non corrigé.
    const degres = (epsg === 4326 || epsg === 4171);
    let k = 1;
    if (epsg === 3857 || epsg === 900913 || epsg === 3785) {
      const latCentre = (llSw.lat + llNe.lat) / 2;
      k = Math.cos(latCentre * Math.PI / 180);
    }
    const mParPx = (degres || sx == null) ? null : sx * k;

    const georef = {
      pointA: { x: 0, y: h, lat: llSw.lat, lng: llSw.lng },
      pointB: { x: w, y: 0, lat: llNe.lat, lng: llNe.lng }
    };
    if (mat && mat.tournee) {
      const nw = monde(0, 0), llNw = versLl(nw.X, nw.Y);
      georef.pointC = { x: 0, y: 0, lat: llNw.lat, lng: llNw.lng };
    }
    return {
      epsg: epsg,
      metresParPixel: mParPx,
      largeurM: mParPx ? mParPx * w : null,
      hauteurM: (degres || sy == null) ? null : sy * k * h,
      tournee: !!(mat && mat.tournee),
      georef: georef
    };
  }

  // ── API ──────────────────────────────────────────────────────────────────
  function estTiff(f) {
    const nom = (typeof f === "string") ? f : ((f && f.name) || "");
    if (/\.tiff?$/i.test(nom)) return true;
    const type = (f && f.type) || "";
    return /^image\/tiff$/i.test(type);
  }

  // → { width, height, epsg, metresParPixel, largeurM, hauteurM, georef: {pointA, pointB},
  //     blob (PNG), nomPng, compression }
  async function lire(file) {
    if (!file) throw new Error("tiff.err.fichierManquant");
    const buf = await file.arrayBuffer();
    const ifd = _lireIfd0(buf);

    // Calage AVANT les pixels : refuser sans décoder des mégapixels pour rien.
    const w = (ifd.tags[T.LARGEUR] || [0])[0];
    const h = (ifd.tags[T.HAUTEUR] || [0])[0];
    if (!w || !h) throw new Error("tiff.err.dimsAbsentes");
    const cal = calage(ifd, w, h);

    const img = await _decoderPixels(buf, ifd);

    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext("2d");
    ctx.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);

    const blob = await new Promise(function(res, rej) {
      cv.toBlob(function(b) { b ? res(b) : rej(new Error("tiff.err.encodagePng")); }, "image/png");
    });
    // 🩸 Libère le bitmap tout de suite : sur mobile, deux plans enchaînés saturent la mémoire.
    cv.width = cv.height = 1;

    return {
      width: img.width, height: img.height,
      epsg: cal.epsg, metresParPixel: cal.metresParPixel,
      largeurM: cal.largeurM, hauteurM: cal.hauteurM,
      compression: img.compression,
      georef: cal.georef,
      blob: blob,
      nomPng: (file.name || "plan.tif").replace(/\.tiff?$/i, "") + ".png"
    };
  }

  window.TiffGeoref = {
    estTiff: estTiff,
    lire: lire,
    EXT_ACCEPTEES: EXT_ACCEPTEES,
    // Pour le harnais Node : testables sans DOM, contrairement à lire().
    _interne: { lireIfd0: _lireIfd0, decoderPixels: _decoderPixels, calage: calage,
                lzw: _lzw, epsgDeGeoKeys: _epsgDeGeoKeys, mondeDePixel: _mondeDePixel, matrice: _matrice,
                TOLERANCE_SIMILITUDE: TOLERANCE_SIMILITUDE, TAGS: T }
  };

  console.log("[TiffGeoref] module chargé (LZW/Deflate/brut, RGB8 en bandes ou tuiles)");
})();
