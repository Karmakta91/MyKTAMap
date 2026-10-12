/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// GEOTIFF — « déposer un .tif, ne pas refaire le géoréf »
// =====================================================================
// Un plan scanné puis calé dans QGIS ressort en GeoTIFF : l'image ET son
// calage dans le MÊME fichier. Jusqu'ici le Générateur n'en faisait rien —
// `accept="image/*"` laissait entrer le .tif, `new Image()` ne le décodait
// pas (ni Chrome ni Firefox ne lisent le TIFF), et l'utilisateur devait
// re-saisir à la main deux points GPS qu'il venait de poser dans QGIS.
//
// Ce module lit les deux moitiés :
//   1. LE CALAGE — tags `ModelPixelScale` (33550) + `ModelTiepoint` (33922),
//      ou `ModelTransformation` (34264), plus `GeoKeyDirectory` (34735) pour
//      le code EPSG. C'est quelques centaines d'octets en tête de fichier.
//   2. LES PIXELS — décodés ici puis ré-encodés en PNG par le canvas du
//      navigateur (aucun encodeur à écrire : `canvas.toBlob` suffit).
//
// ⚠️ POURQUOI PAS `geotiff.js` (~300 Ko vendored) : mesuré sur un corpus réel
// de 39 plans de carrières calés sous QGIS, la totalité tient
// dans un sous-ensemble minuscule du format —
//   compression : LZW ×30, aucune ×9 · pixels : 39/39 en RGB 8/8/8
//   organisation : 39/39 en bandes (`strips`), aucune tuilée, PlanarConfig 1
//   predictor : 39/39 à 1 (aucun) · calage : 39/39 en Scale+Tiepoint
//   taille : 2,2 Mpx au maximum
// Vendorer une bibliothèque générique pour ça reviendrait à embarquer le JPEG,
// le CMYK, le BigTIFF et les palettes que personne ici n'émet. On lit le
// sous-ensemble, et on REFUSE LE RESTE EN LE NOMMANT (règle KARMA : valider
// et refuser franchement, jamais deviner en silence).
//
// 📐 LE CALAGE SE DÉDUIT EXACTEMENT. `Scale + Tiepoint` décrit une image
// nord en haut, SANS ROTATION : deux coins opposés suffisent à la décrire
// entièrement. C'est précisément ce que consomme `plan.georef` (pointA/pointB,
// similitude 2 points de `KmzExport.buildTransform`) — aucun `pointC` affine
// n'est nécessaire, et aucune approximation n'est introduite.
//
// REPROJECTION : réutilise `window.SigImport.L93` (Lambert 93, v1.82.0) et
// `window.SigImport.WEBMERC` (Web Mercator). ⚠️ Aucune copie locale de ces
// maths — il n'existe qu'UNE implémentation de chaque projection dans le
// projet, et elle est verrouillée par son garde-fou pré-commit.
//
// API : window.TiffGeoref = { estTiff, lire, EXT_ACCEPTEES, _interne }
// 100 % local, aucune surface réseau nouvelle.
// =====================================================================

(function() {
  "use strict";

  const EXT_ACCEPTEES = ".tif,.tiff";

  // Tailles des types TIFF, indexées par le code du champ `type` d'une entrée
  // d'IFD. Les trous (0, 13+) sont volontaires : un type inconnu vaut 0 et fait
  // échouer proprement le calcul de taille plutôt que de lire n'importe où.
  const TAILLE_TYPE = { 1:1, 2:1, 3:2, 4:4, 5:8, 6:1, 7:1, 8:2, 9:4, 10:8, 11:4, 12:8 };

  // Les seuls tags dont on a besoin. Tout le reste de l'IFD est ignoré.
  const T = {
    LARGEUR: 256, HAUTEUR: 257, BITS: 258, COMPRESSION: 259, PHOTO: 262,
    STRIP_OFF: 273, SPP: 277, ROWS_PER_STRIP: 278, STRIP_CNT: 279,
    PLANAR: 284, PREDICTOR: 317, COLORMAP: 320, TILE_W: 322, TILE_H: 323,
    EXTRA: 338,
    PIXEL_SCALE: 33550, TIEPOINT: 33922, TRANSFORM: 34264, GEO_KEYS: 34735
  };

  // Noms des compressions, pour que le refus DISE ce qu'il refuse. Un message
  // « format non supporté » n'apprend rien ; « compression JPEG » se règle en
  // deux clics dans QGIS.
  const NOM_COMPRESSION = {
    1: "aucune", 2: "CCITT G3", 3: "CCITT T.4", 4: "CCITT T.6", 5: "LZW",
    6: "JPEG (ancien)", 7: "JPEG", 8: "Deflate", 32773: "PackBits",
    32946: "Deflate (Adobe)", 34712: "JPEG 2000", 50000: "Zstd", 50001: "WebP"
  };

  const COMPRESSIONS_LUES = [1, 5, 8, 32946];

  // =========================================================================
  // LECTURE DE L'IFD 0
  // =========================================================================
  // Un TIFF, c'est un en-tête de 8 octets puis une liste d'entrées de 12 octets
  // (tag, type, nombre, valeur-ou-offset). On ne lit QUE l'IFD 0 : les IFD
  // suivants d'un GeoTIFF sont des aperçus réduits (« overviews »), jamais le
  // plan.
  function _lireIfd0(buf) {
    const dv = new DataView(buf);
    if (buf.byteLength < 8) throw new Error("tiff.err.tropCourt");

    const b0 = dv.getUint8(0), b1 = dv.getUint8(1);
    let le;
    if (b0 === 0x49 && b1 === 0x49) le = true;        // "II" — petit-boutiste
    else if (b0 === 0x4D && b1 === 0x4D) le = false;  // "MM" — gros-boutiste
    else throw new Error("tiff.err.pasUnTiff");

    const magic = dv.getUint16(2, le);
    // 43 = BigTIFF : offsets sur 64 bits, structure d'IFD différente. Rien à
    // bricoler — on le nomme et on s'arrête.
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
      // ⚠️ Règle TIFF : une valeur de 4 octets ou moins est écrite EN PLACE
      // dans l'entrée ; au-delà, l'entrée contient un offset.
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

  // =========================================================================
  // DÉCOMPRESSION
  // =========================================================================

  // Les 256 entrées « un octet » du dictionnaire LZW sont les mêmes à chaque
  // bande : on les alloue une fois pour toutes.
  const _SINGLETONS = (function() {
    const a = new Array(256);
    for (let i = 0; i < 256; i++) a[i] = new Uint8Array([i]);
    return a;
  })();

  // LZW variante TIFF : codes alignés MSB en tête, largeur 9 → 12 bits,
  // 256 = Clear, 257 = fin de bande. ⚠️ La largeur augmente UN CODE EN AVANCE
  // (`early change`, condition `dictLen + 1`) — c'est la particularité TIFF ;
  // avec la condition « normale » du LZW GIF, tout le flux se décale d'un bit
  // et l'image sort en bruit.
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

  // Deflate : le navigateur sait le faire nativement depuis `DecompressionStream`.
  // Le TIFF utilise le format zlib (avec en-tête), donc "deflate" et non
  // "deflate-raw". Zéro ligne de décompression à écrire.
  async function _inflate(src) {
    if (typeof DecompressionStream !== "function") throw new Error("tiff.err.deflateIndispo");
    const flux = new Blob([src]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }

  // Predictor 2 — différenciation horizontale : chaque octet est stocké comme
  // l'écart avec le même canal du pixel précédent. On ré-additionne ligne par
  // ligne (jamais à cheval sur deux lignes : chaque ligne repart de zéro).
  function _predictor2(buf, largeurOctets, spp, nbLignes) {
    for (let l = 0; l < nbLignes; l++) {
      const base = l * largeurOctets;
      for (let i = spp; i < largeurOctets; i++) {
        buf[base + i] = (buf[base + i] + buf[base + i - spp]) & 0xff;
      }
    }
    return buf;
  }

  // =========================================================================
  // DÉCODAGE DES PIXELS → RGBA
  // =========================================================================
  async function _decoderPixels(buf, ifd) {
    const t = ifd.tags;
    const g = function(tag, def) { return (t[tag] && t[tag].length) ? t[tag][0] : def; };

    const w = g(T.LARGEUR, 0), h = g(T.HAUTEUR, 0);
    if (!w || !h) throw new Error("tiff.err.dimsAbsentes");

    // ─── Refus francs et NOMMÉS ───
    if (t[T.TILE_W] || t[T.TILE_H]) throw new Error("tiff.err.tuile");

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
    // 3 = palette (nécessiterait la ColorMap + une indirection), 5 = CMYK,
    // 6 = YCbCr. Aucun des trois n'apparaît sur un plan calé par QGIS.
    if (photo !== 0 && photo !== 1 && photo !== 2) {
      const e = new Error("tiff.err.photometrie"); e.detail = String(photo); throw e;
    }
    if (photo === 2 && spp < 3) throw new Error("tiff.err.rgbIncoherent");

    const pred = g(T.PREDICTOR, 1);
    if (pred !== 1 && pred !== 2) { const e = new Error("tiff.err.predictor"); e.detail = String(pred); throw e; }

    const offs = t[T.STRIP_OFF], cnts = t[T.STRIP_CNT];
    if (!offs || !cnts || !offs.length) throw new Error("tiff.err.bandesAbsentes");

    const rps = g(T.ROWS_PER_STRIP, h);
    const octetsParLigne = w * spp;

    // ─── Assemblage des bandes ───
    const plein = new Uint8Array(octetsParLigne * h);
    let ecrit = 0;
    for (let s = 0; s < offs.length; s++) {
      const lignes = Math.min(rps, h - s * rps);
      if (lignes <= 0) break;
      const attendu = octetsParLigne * lignes;
      const brut = new Uint8Array(buf, offs[s], Math.min(cnts[s], buf.byteLength - offs[s]));

      let dec;
      if (comp === 1)                        dec = brut;
      else if (comp === 5)                   dec = _lzw(brut, attendu);
      else                                   dec = await _inflate(brut);

      if (dec.length < attendu) { const e = new Error("tiff.err.bandeCourte"); e.detail = s + " : " + dec.length + " < " + attendu; throw e; }
      if (pred === 2) _predictor2(dec, octetsParLigne, spp, lignes);
      plein.set(dec.subarray(0, attendu), ecrit);
      ecrit += attendu;
    }
    if (ecrit !== plein.length) { const e = new Error("tiff.err.pixelsManquants"); e.detail = ecrit + " / " + plein.length; throw e; }

    // ─── Vers RGBA ───
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

  // =========================================================================
  // CALAGE
  // =========================================================================

  // Le GeoKeyDirectory est une liste de quadruplets (clé, emplacement, nombre,
  // valeur). `emplacement === 0` signifie que la valeur est le quadruplet
  // lui-même — c'est toujours le cas d'un code EPSG.
  //   3072 = ProjectedCSTypeGeoKey (CRS projeté)
  //   2048 = GeographicTypeGeoKey  (CRS géographique)
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

  // Construit la fonction pixel → coordonnées du CRS du fichier.
  // Deux écritures possibles, la seconde étant rare mais légale.
  function _mondeDePixel(t) {
    const mt = t[T.TRANSFORM];
    if (mt && mt.length >= 8) {
      // Matrice 4×4 en ligne. Les termes [1] et [4] portent rotation et
      // cisaillement. Le géoréf 2 points de MyKTAMap ne sait décrire qu'une
      // image nord en haut : plutôt que d'aplatir une rotation en silence, on
      // refuse — l'utilisateur peut réexporter « nord en haut » depuis QGIS.
      const echelle = Math.max(Math.abs(mt[0]), Math.abs(mt[5])) || 1;
      if (Math.abs(mt[1]) > echelle * 1e-6 || Math.abs(mt[4]) > echelle * 1e-6) {
        throw new Error("tiff.err.rotation");
      }
      return function(px, py) { return { X: mt[0] * px + mt[3], Y: mt[5] * py + mt[7] }; };
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

  // Reprojection vers WGS84 selon le code EPSG déclaré.
  // ⚠️ Les maths vivent dans `sigImport.js` et NULLE PART AILLEURS.
  function _versWgs84(epsg) {
    const S = window.SigImport;
    if (epsg === 4326 || epsg === 4171) {
      // Déjà en degrés : X = longitude, Y = latitude.
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

  // Calage complet : tags → `plan.georef` prêt à écrire.
  //
  // 📐 CONVENTION DE REPÈRE — la source d'erreur n°1 du projet. Le y d'un plan
  // se compte depuis le HAUT de l'image (`convertCoord(x,y) = [imageHeight - y, x]`).
  // Donc :   (x=0, y=hauteur) = coin bas-gauche  = SUD-OUEST
  //          (x=largeur, y=0) = coin haut-droit  = NORD-EST
  // C'est exactement le couple que pose `sigImport.genererZipMyktamap`, et
  // c'est celui que `KmzExport.buildTransform` attend.
  function calage(ifd, w, h) {
    const t = ifd.tags;
    const epsg = _epsgDeGeoKeys(t[T.GEO_KEYS]);
    const monde = _mondeDePixel(t);
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

    const ps = t[T.PIXEL_SCALE], mt = t[T.TRANSFORM];
    const sx = ps ? Math.abs(ps[0]) : (mt ? Math.abs(mt[0]) : null);
    const sy = ps ? Math.abs(ps[1]) : (mt ? Math.abs(mt[5]) : null);

    // ⚠️ L'UNITÉ DU CRS N'EST PAS TOUJOURS LE MÈTRE AU SOL.
    //   • 4326 : l'unité est le DEGRÉ — aucune emprise en mètres à annoncer.
    //   • 3857 : l'unité s'appelle « mètre » mais c'est un mètre Mercator,
    //     gonflé de 1/cos(latitude). À la latitude de Paris (48,9°N) le facteur
    //     vaut 1,52 : un plan de 1 985 m s'afficherait « 3 019 m ». On rectifie
    //     par cos(lat), sinon on annonce un chiffre FAUX de moitié.
    //   • 2154 : conique conforme, facteur d'échelle entre 0,9998 et 1,0001 sur
    //     la métropole — l'écart est sous le millième, on ne corrige pas.
    const degres = (epsg === 4326 || epsg === 4171);
    let k = 1;
    if (epsg === 3857 || epsg === 900913 || epsg === 3785) {
      const latCentre = (llSw.lat + llNe.lat) / 2;
      k = Math.cos(latCentre * Math.PI / 180);
    }
    const mParPx = (degres || sx == null) ? null : sx * k;

    return {
      epsg: epsg,
      metresParPixel: mParPx,
      largeurM: mParPx ? mParPx * w : null,
      hauteurM: (degres || sy == null) ? null : sy * k * h,
      georef: {
        pointA: { x: 0, y: h, lat: llSw.lat, lng: llSw.lng },
        pointB: { x: w, y: 0, lat: llNe.lat, lng: llNe.lng }
      }
    };
  }

  // =========================================================================
  // API
  // =========================================================================

  function estTiff(f) {
    const nom = (typeof f === "string") ? f : ((f && f.name) || "");
    if (/\.tiff?$/i.test(nom)) return true;
    const type = (f && f.type) || "";
    return /^image\/tiff$/i.test(type);
  }

  // Lit un GeoTIFF et rend de quoi remplir le Générateur :
  //   { width, height, epsg, metresParPixel, largeurM, hauteurM,
  //     georef: {pointA, pointB}, blob (PNG), nomPng, compression }
  async function lire(file) {
    if (!file) throw new Error("tiff.err.fichierManquant");
    const buf = await file.arrayBuffer();
    const ifd = _lireIfd0(buf);

    // Le calage AVANT les pixels : s'il manque, inutile de décoder plusieurs
    // mégapixels pour finir par refuser.
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
    // Libère le bitmap tout de suite : sur mobile, deux plans enchaînés
    // suffisent à saturer si on laisse traîner les canvas.
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
    // Exposé pour le harness Node (mêmes raisons que `SigImport.L93`) : ces
    // fonctions sont testables sans DOM, `lire()` ne l'est pas.
    _interne: { lireIfd0: _lireIfd0, decoderPixels: _decoderPixels, calage: calage,
                lzw: _lzw, epsgDeGeoKeys: _epsgDeGeoKeys, TAGS: T }
  };

  console.log("[TiffGeoref] module chargé (LZW/Deflate/brut, RGB8 en bandes)");
})();
