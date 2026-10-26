/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// KMZ EXPORT — export géolocalisé pour Google Earth / OsmAnd / Locus / Avenza
// =========================
// Plan + annotations → .kmz (ZIP : doc.kml + files/ avec image et icônes) : GroundOverlay de l'image (ou
// superoverlay des tuiles V2), Placemark (points), LineString (tracés, jonctions, itinéraire), Polygon
// (zones), Folders par niveau si multiLevel, Folder Secours, myktamap-extras.json (légende, scénario).
// Calage : 2 points → similitude (rotation + échelle + translation) ; 3e point facultatif → affine.
// ⚠️ Deux modèles, choisis par `georef.modele` : "local" = plan tangent à l'ellipsoïde GRS80 (exact) ;
//   absent = mètres équirectangulaires à constantes fixes, gardé BIT À BIT pour les plans déjà calés
//   (jusqu'à 20 m d'écart aux coins d'un plan de 6 km, docs/ETUDE_CALAGE_PROJECTION.md).
// ⚠️ L'axe y plan est INVERSÉ (vers le bas) : on le retourne pour l'aligner sur le Nord GPS.
// Expose window.KmzExport : genererKmz(opts) → Promise<Blob>, genererKml, get/setCalibration(planId),
//   buildTransform, buildTransformCalib, planToGps, gpsToPlan (import GPX), et la géodésie partagée :
//   MODELE_LOCAL, EQUI_HISTORIQUE, metresParDegre, decalerGps, distanceM, memesPoints, modeleSaisie,
//   ecartRecalage, precisionCalage.
// Doc : docs/architecture/vue-osm.md §2.2 · Garde-fous : scripts/check-calage-projection.js,
//   scripts/check-kml-styles.js, scripts/check-kmz-superoverlay.js
// =========================

(function() {
  "use strict";

  const KMZ_CALIB_LS_PREFIX = "myktamap_kmz_calib_";
  const MIN_PLAN_DISTANCE   = 50;   // pixels (sinon precision math degueulasse)
  const MIN_GPS_DISTANCE_M  = 1;    // mètres (sinon AB GPS trop proche/identique)

  // ── Géodésie : plan tangent local (seule source de l'app) ──────────
  // ⚠️ Seules ces lignes convertissent degrés ⇄ mètres : les autres modules passent par les fonctions exposées
  // (scripts/check-calage-projection.js refuse les constantes ailleurs dans js/).
  const MODELE_LOCAL = "local";
  // Constantes du modèle historique (degré de méridien à l'ÉQUATEUR, 0,5 à 0,6 % trop court sous nos
  // latitudes) : servent encore aux plans calés sans `modele` et au KML importé (`kmzImport.js`).
  const EQUI_HISTORIQUE = Object.freeze({ mParDegLng: 111320, mParDegLat: 110540 });
  const GRS80_A = 6378137, GRS80_F = 1 / 298.257222101;
  const _E2  = GRS80_F * (2 - GRS80_F);
  const _B   = GRS80_A * (1 - GRS80_F);
  const _EP2 = (GRS80_A * GRS80_A - _B * _B) / (_B * _B);
  const _RAD = Math.PI / 180;

  function _ecef(lat, lng) {
    const p = lat * _RAD, l = lng * _RAD, sp = Math.sin(p), cp = Math.cos(p);
    const N = GRS80_A / Math.sqrt(1 - _E2 * sp * sp);
    return [N * cp * Math.cos(l), N * cp * Math.sin(l), N * (1 - _E2) * sp];
  }

  // Repère est / nord / haut tangent en (lat0, lng0). Objet de DONNÉES (pas de fonction) : un transform reste
  // clonable (structuredClone, JSON).
  function _repere(lat0, lng0) {
    const p = lat0 * _RAD, l = lng0 * _RAD;
    return { lat0: lat0, lng0: lng0, O: _ecef(lat0, lng0),
             sp: Math.sin(p), cp: Math.cos(p), sl: Math.sin(l), cl: Math.cos(l) };
  }

  // WGS84 → mètres du plan tangent. Le point est pris sur la normale à l'ellipsoïde qui coupe le plan : c'est
  // l'inverse EXACT de _versGps (une projection orthogonale perdrait d³ / 2R², 1,5 mm à 5 km).
  function _versMetres(R, lat, lng) {
    const q = _ecef(lat, lng), p = lat * _RAD, l = lng * _RAD;
    const nx = Math.cos(p) * Math.cos(l), ny = Math.cos(p) * Math.sin(l), nz = Math.sin(p);
    const ux = R.cp * R.cl, uy = R.cp * R.sl, uz = R.sp;
    let dx = q[0] - R.O[0], dy = q[1] - R.O[1], dz = q[2] - R.O[2];
    const h = -(ux * dx + uy * dy + uz * dz) / (ux * nx + uy * ny + uz * nz);
    dx += h * nx; dy += h * ny; dz += h * nz;
    return { e: -R.sl * dx + R.cl * dy, n: -R.sp * R.cl * dx - R.sp * R.sl * dy + R.cp * dz };
  }

  // Mètres du plan tangent → WGS84 : latitude de Bowring en une passe (écart < 1 µm à ces hauteurs).
  function _versGps(R, e, n) {
    const x = R.O[0] - e * R.sl - n * R.sp * R.cl;
    const y = R.O[1] + e * R.cl - n * R.sp * R.sl;
    const z = R.O[2] + n * R.cp;
    const pp = Math.hypot(x, y), th = Math.atan2(z * GRS80_A, pp * _B);
    const s = Math.sin(th), c = Math.cos(th);
    return { lat: Math.atan2(z + _EP2 * _B * s * s * s, pp - _E2 * GRS80_A * c * c * c) / _RAD,
             lng: Math.atan2(y, x) / _RAD };
  }

  // Mètres au sol par degré à cette latitude (rayons de courbure de l'ellipsoïde).
  function metresParDegre(lat) {
    const s = Math.sin(lat * _RAD), w = Math.sqrt(1 - _E2 * s * s);
    return { lat: GRS80_A * (1 - _E2) / (w * w * w) * _RAD, lng: GRS80_A / w * Math.cos(lat * _RAD) * _RAD };
  }

  // Le point à `est` / `nord` mètres de (lat, lng), dans le plan tangent en ce point.
  function decalerGps(lat, lng, est, nord) {
    return _versGps(_repere(lat, lng), est, nord);
  }

  // Distance au sol entre deux points WGS84 proches (corde, écart < 1 mm sous 20 km).
  function distanceM(a, b) {
    const p = _ecef(a.lat, a.lng), q = _ecef(b.lat, b.lng);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }

  // Même calage (A, B et C, C absent des deux côtés compris), à la précision d'une resaisie près.
  function memesPoints(g1, g2) {
    if (!g1 || !g2) return false;
    const pareil = function(p, q) {
      if (!p || !q) return !p && !q;
      return [["x", 1e-6], ["y", 1e-6], ["lat", 1e-9], ["lng", 1e-9]].every(function(k) {
        const a = Number(p[k[0]]), b = Number(q[k[0]]);
        return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= k[1];
      });
    };
    return pareil(g1.pointA, g2.pointA) && pareil(g1.pointB, g2.pointB) && pareil(g1.pointC, g2.pointC);
  }

  // Modèle d'un calage qu'on enregistre : "local", sauf si c'est le même calage historique que celui déjà en
  // place (null) — réenregistrer sans rien changer ne déplace rien en silence.
  function modeleSaisie(ancien, nouveau) {
    if (ancien && ancien.modele !== MODELE_LOCAL && memesPoints(ancien, nouveau)) return null;
    return MODELE_LOCAL;
  }

  function _coins(W, H) { return [[0, 0], [W, 0], [0, H], [W, H]]; }

  // Déplacement maximal aux 4 coins quand ce calage passe du modèle historique au modèle local (m), ou null.
  function ecartRecalage(g, W, H) {
    if (!g || !(W > 0) || !(H > 0)) return null;
    try {
      const h = Object.assign({}, g); delete h.modele;
      const tH = buildTransformCalib(h);
      const tL = buildTransformCalib(Object.assign({}, h, { modele: MODELE_LOCAL }));
      let max = 0;
      _coins(W, H).forEach(function(c) {
        max = Math.max(max, distanceM(planToGps(tH, c[0], c[1]), planToGps(tL, c[0], c[1])));
      });
      return max;
    } catch (e) { return null; }
  }

  // Précision du MODÈLE aux coins (m), hors erreur des points saisis : historique = écart au modèle exact ;
  // local = écart du plan tangent à l'ellipsoïde, d³ / 2R² à la distance d du centre du calage.
  // → { modele: "local" | "historique", ecartM } ou null.
  function precisionCalage(g, W, H) {
    if (!g || !(W > 0) || !(H > 0)) return null;
    if (g.modele !== MODELE_LOCAL) {
      const e = ecartRecalage(g, W, H);
      return e == null ? null : { modele: "historique", ecartM: e };
    }
    try {
      const t = buildTransformCalib(g);
      let max = 0;
      _coins(W, H).forEach(function(c) {
        const ll = planToGps(t, c[0], c[1]), m = _versMetres(t.repere, ll.lat, ll.lng);
        const d = Math.hypot(m.e, m.n);
        max = Math.max(max, d * d * d / (2 * GRS80_A * GRS80_A));
      });
      return { modele: "local", ecartM: max };
    } catch (e) { return null; }
  }

  // ── Math affine 2D ──────────

  // (x,y) plan → (lat,lng). planA/B {x, y} en px image, gpsA/B {lat, lng}.
  // planC/gpsC FACULTATIFS : absents → similitude 2 points ; présents → AFFINE 6 DOF (échelles X/Y +
  // cisaillement) exacte sur les 3 correspondances — corrige une déformation GLOBALE, pas les erreurs
  // locales d'un assemblage (l'affine les moyenne). C quasi colinéaire avec A-B → ignoré, repli
  // similitude + `degenereC: true` (jamais de throw pour C).
  // → { refPlan, refGps, metresParPixel, rotation, latMoyenne, affine?, affineInv?, degenereC? } ;
  // metresParPixel/rotation restent dérivés de A/B même en affine (approximation d'affichage assumée).
  // `modele` : "local" → plan tangent (_buildTransformLocal) ; toute autre valeur → modèle historique.
  function buildTransform(planA, planB, gpsA, gpsB, planC, gpsC, modele) {
    if (!planA || !planB || !gpsA || !gpsB) {
      throw new Error(window.I18n.t("kmz.err.calibIncomplete"));
    }
    if (modele === MODELE_LOCAL) return _buildTransformLocal(planA, planB, gpsA, gpsB, planC, gpsC);

    // y plan inversé → repère math avec y vers le HAUT (Nord).
    const dxPlan = planB.x - planA.x;
    const dyPlan = -(planB.y - planA.y);
    const lenPlan = Math.hypot(dxPlan, dyPlan);
    if (lenPlan < MIN_PLAN_DISTANCE) {
      throw new Error(window.I18n.t("kmz.err.planTooClose",
        { px: Math.round(lenPlan), min: MIN_PLAN_DISTANCE }));
    }

    // Mètres par projection équirectangulaire locale (valide sur quelques km).
    const dlatDeg = gpsB.lat - gpsA.lat;
    const dlngDeg = gpsB.lng - gpsA.lng;
    const latMoy = (gpsA.lat + gpsB.lat) / 2;
    const dxGps = dlngDeg * 111320 * Math.cos(latMoy * Math.PI / 180); // Est-Ouest
    const dyGps = dlatDeg * 110540;                                    // Nord-Sud
    const lenGps = Math.hypot(dxGps, dyGps);
    if (lenGps < MIN_GPS_DISTANCE_M) {
      throw new Error(window.I18n.t("kmz.err.gpsTooClose"));
    }

    const metresParPixel = lenGps / lenPlan;

    const anglePlan = Math.atan2(dyPlan, dxPlan);
    const angleGps  = Math.atan2(dyGps,  dxGps);
    const rotation  = angleGps - anglePlan;

    const t = {
      refPlan:        { x: planA.x, y: planA.y },
      refGps:         { lat: gpsA.lat, lng: gpsA.lng },
      metresParPixel: metresParPixel,
      rotation:       rotation,
      latMoyenne:     latMoy
    };

    // Point C → AFFINE (yF = -y ; mètres équirectangulaires relatifs à gpsA, latitude moyenne des 3 points).
    const _fin = function(v) { return typeof v === "number" && Number.isFinite(v); };
    if (planC && gpsC && _fin(planC.x) && _fin(planC.y) && _fin(gpsC.lat) && _fin(gpsC.lng)) {
      const x1 = planA.x, y1 = -planA.y,
            x2 = planB.x, y2 = -planB.y,
            x3 = planC.x, y3 = -planC.y;
      // 2 × aire du triangle plan quasi nulle = C colinéaire : matrice non inversible → repli 2 points.
      const det3 = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
      if (Math.abs(det3) < MIN_PLAN_DISTANCE * MIN_PLAN_DISTANCE * 0.05) {
        t.degenereC = true;
        console.warn("[KmzExport] Point C quasi colinéaire avec A-B — ignoré (repli 2 points)");
        return t;
      }
      const latMoy3 = (gpsA.lat + gpsB.lat + gpsC.lat) / 3;
      const kLng = 111320 * Math.cos(latMoy3 * Math.PI / 180), kLat = 110540;
      const E = [0, (gpsB.lng - gpsA.lng) * kLng, (gpsC.lng - gpsA.lng) * kLng];
      const N = [0, (gpsB.lat - gpsA.lat) * kLat, (gpsC.lat - gpsA.lat) * kLat];
      // Même dégénérescence côté monde.
      const detG = E[0] * (N[1] - N[2]) - N[0] * (E[1] - E[2]) + (E[1] * N[2] - E[2] * N[1]);
      if (Math.abs(detG) < MIN_GPS_DISTANCE_M * MIN_GPS_DISTANCE_M * 0.05) {
        t.degenereC = true;
        console.warn("[KmzExport] Points GPS quasi colinéaires — C ignoré (repli 2 points)");
        return t;
      }
      // Cramer : E = a·x + b·yF + e ; N = c·x + d·yF + f
      const X = [x1, x2, x3], Y = [y1, y2, y3];
      const solve = function(V) {
        const d0 = det3;
        const da = V[0] * (Y[1] - Y[2]) - Y[0] * (V[1] - V[2]) + (V[1] * Y[2] - V[2] * Y[1]);
        const db = X[0] * (V[1] - V[2]) - V[0] * (X[1] - X[2]) + (X[1] * V[2] - X[2] * V[1]);
        const dc = X[0] * (Y[1] * V[2] - Y[2] * V[1]) - Y[0] * (X[1] * V[2] - X[2] * V[1]) + V[0] * (X[1] * Y[2] - X[2] * Y[1]);
        return [da / d0, db / d0, dc / d0];
      };
      const sE = solve(E), sN = solve(N);
      const aff = { a: sE[0], b: sE[1], e: sE[2], c: sN[0], d: sN[1], f: sN[2], latMoy3: latMoy3, kLng: kLng, kLat: kLat };
      const detA = aff.a * aff.d - aff.b * aff.c;
      if (!Number.isFinite(detA) || Math.abs(detA) < 1e-12) {
        t.degenereC = true;
        console.warn("[KmzExport] Affine non inversible — C ignoré (repli 2 points)");
        return t;
      }
      aff.det = detA;
      t.affine = aff;
    }
    return t;
  }

  // Cramer sur 3 correspondances : V = a·x + b·yF + c (X, Y = pixels, yF = -y).
  function _cramer3(X, Y, V, d0) {
    const da = V[0] * (Y[1] - Y[2]) - Y[0] * (V[1] - V[2]) + (V[1] * Y[2] - V[2] * Y[1]);
    const db = X[0] * (V[1] - V[2]) - V[0] * (X[1] - X[2]) + (X[1] * V[2] - X[2] * V[1]);
    const dc = X[0] * (Y[1] * V[2] - Y[2] * V[1]) - Y[0] * (X[1] * V[2] - X[2] * V[1]) +
               V[0] * (X[1] * Y[2] - X[2] * Y[1]);
    return [da / d0, db / d0, dc / d0];
  }

  // Modèle "local" : mêmes refus et même forme de résultat que le modèle historique (metresParPixel, rotation,
  // refPlan, refGps, latMoyenne, affine?, degenereC?), en mètres du plan tangent au barycentre des points.
  function _buildTransformLocal(planA, planB, gpsA, gpsB, planC, gpsC) {
    const dxPlan = planB.x - planA.x;
    const dyPlan = -(planB.y - planA.y);
    const lenPlan = Math.hypot(dxPlan, dyPlan);
    if (lenPlan < MIN_PLAN_DISTANCE) {
      throw new Error(window.I18n.t("kmz.err.planTooClose",
        { px: Math.round(lenPlan), min: MIN_PLAN_DISTANCE }));
    }
    const _fin = function(v) { return typeof v === "number" && Number.isFinite(v); };
    let avecC = !!(planC && gpsC && _fin(planC.x) && _fin(planC.y) && _fin(gpsC.lat) && _fin(gpsC.lng));
    let degenereC = false;
    const X = avecC ? [planA.x, planB.x, planC.x] : null, Y = avecC ? [-planA.y, -planB.y, -planC.y] : null;
    let det3 = 0;
    if (avecC) {
      det3 = X[0] * (Y[1] - Y[2]) - Y[0] * (X[1] - X[2]) + (X[1] * Y[2] - X[2] * Y[1]);
      if (Math.abs(det3) < MIN_PLAN_DISTANCE * MIN_PLAN_DISTANCE * 0.05) {
        avecC = false; degenereC = true;
        console.warn("[KmzExport] Point C quasi colinéaire avec A-B — ignoré (repli 2 points)");
      }
    }
    const pts = avecC ? [gpsA, gpsB, gpsC] : [gpsA, gpsB];
    const moy = function(k) { return pts.reduce(function(s, g) { return s + g[k]; }, 0) / pts.length; };
    let R = _repere(moy("lat"), moy("lng"));
    let mA = _versMetres(R, gpsA.lat, gpsA.lng), mB = _versMetres(R, gpsB.lat, gpsB.lng);
    let mC = avecC ? _versMetres(R, gpsC.lat, gpsC.lng) : null;
    if (avecC) {
      const detG = (mB.e - mA.e) * (mC.n - mA.n) - (mC.e - mA.e) * (mB.n - mA.n);
      if (Math.abs(detG) < MIN_GPS_DISTANCE_M * MIN_GPS_DISTANCE_M * 0.05) {
        avecC = false; degenereC = true;
        console.warn("[KmzExport] Points GPS quasi colinéaires — C ignoré (repli 2 points)");
        R = _repere((gpsA.lat + gpsB.lat) / 2, (gpsA.lng + gpsB.lng) / 2);
        mA = _versMetres(R, gpsA.lat, gpsA.lng); mB = _versMetres(R, gpsB.lat, gpsB.lng); mC = null;
      }
    }
    const dxGps = mB.e - mA.e, dyGps = mB.n - mA.n;
    const lenGps = Math.hypot(dxGps, dyGps);
    if (lenGps < MIN_GPS_DISTANCE_M) {
      throw new Error(window.I18n.t("kmz.err.gpsTooClose"));
    }
    const t = {
      modele:         MODELE_LOCAL,
      repere:         R,
      refPlan:        { x: planA.x, y: planA.y },
      refGps:         { lat: gpsA.lat, lng: gpsA.lng },
      refMetres:      mA,
      metresParPixel: lenGps / lenPlan,
      rotation:       Math.atan2(dyGps, dxGps) - Math.atan2(dyPlan, dxPlan),
      latMoyenne:     R.lat0
    };
    if (degenereC) t.degenereC = true;
    if (avecC) {
      const sE = _cramer3(X, Y, [mA.e, mB.e, mC.e], det3), sN = _cramer3(X, Y, [mA.n, mB.n, mC.n], det3);
      const aff = { a: sE[0], b: sE[1], e: sE[2], c: sN[0], d: sN[1], f: sN[2] };
      aff.det = aff.a * aff.d - aff.b * aff.c;
      if (!Number.isFinite(aff.det) || Math.abs(aff.det) < 1e-12) {
        t.degenereC = true;
        console.warn("[KmzExport] Affine non inversible — C ignoré (repli 2 points)");
        return t;
      }
      t.affine = aff;
    }
    return t;
  }

  // Depuis un objet calib/georef { pointA, pointB, pointC?, modele? } (points {x, y, lat, lng}).
  // pointC incomplet → ignoré (warn) ; A/B invalides → même throw que buildTransform.
  function buildTransformCalib(g) {
    if (!g || !g.pointA || !g.pointB) {
      throw new Error(window.I18n.t("kmz.err.calibIncomplete"));
    }
    const _fin = function(v) { return typeof v === "number" && Number.isFinite(v); };
    let pC = g.pointC || null;
    if (pC && !(_fin(pC.x) && _fin(pC.y) && _fin(pC.lat) && _fin(pC.lng))) {
      console.warn("[KmzExport] pointC incomplet — ignoré");
      pC = null;
    }
    return buildTransform(
      { x: g.pointA.x, y: g.pointA.y }, { x: g.pointB.x, y: g.pointB.y },
      { lat: g.pointA.lat, lng: g.pointA.lng }, { lat: g.pointB.lat, lng: g.pointB.lng },
      pC ? { x: pC.x, y: pC.y } : null,
      pC ? { lat: pC.lat, lng: pC.lng } : null,
      g.modele
    );
  }

  function planToGps(t, x, y) {
    if (!t) return null;
    if (t.modele === MODELE_LOCAL) {
      let E, N;
      if (t.affine) {
        const f = t.affine, yF = -y;
        E = f.a * x + f.b * yF + f.e;
        N = f.c * x + f.d * yF + f.f;
      } else {
        const dx = x - t.refPlan.x, dy = -(y - t.refPlan.y);
        const cosR = Math.cos(t.rotation), sinR = Math.sin(t.rotation);
        E = t.refMetres.e + (dx * cosR - dy * sinR) * t.metresParPixel;
        N = t.refMetres.n + (dx * sinR + dy * cosR) * t.metresParPixel;
      }
      return _versGps(t.repere, E, N);
    }
    // Affine : (x, -y) → mètres E/N relatifs à refGps → degrés (exact sur A, B, C).
    if (t.affine) {
      const f = t.affine, yF = -y;
      const E = f.a * x + f.b * yF + f.e;
      const N = f.c * x + f.d * yF + f.f;
      return { lat: t.refGps.lat + N / f.kLat, lng: t.refGps.lng + E / f.kLng };
    }
    // y inversé (cf buildTransform).
    const dx = x - t.refPlan.x;
    const dy = -(y - t.refPlan.y);
    const cosR = Math.cos(t.rotation);
    const sinR = Math.sin(t.rotation);
    const dxRot = dx * cosR - dy * sinR;
    const dyRot = dx * sinR + dy * cosR;
    const dxMetres = dxRot * t.metresParPixel;
    const dyMetres = dyRot * t.metresParPixel;
    const dlngDeg = dxMetres / (111320 * Math.cos(t.latMoyenne * Math.PI / 180));
    const dlatDeg = dyMetres / 110540;
    return {
      lat: t.refGps.lat + dlatDeg,
      lng: t.refGps.lng + dlngDeg
    };
  }

  // Inverse exact de planToGps (import GPX : WGS84 → repère plan).
  function gpsToPlan(t, lat, lng) {
    if (!t) return null;
    if (t.modele === MODELE_LOCAL) {
      const m = _versMetres(t.repere, lat, lng);
      if (t.affine) {
        const f = t.affine;
        const x  = (f.d * (m.e - f.e) - f.b * (m.n - f.f)) / f.det;
        const yF = (f.a * (m.n - f.f) - f.c * (m.e - f.e)) / f.det;
        return { x: x, y: -yF };
      }
      const dxR = (m.e - t.refMetres.e) / t.metresParPixel, dyR = (m.n - t.refMetres.n) / t.metresParPixel;
      const cosR = Math.cos(-t.rotation), sinR = Math.sin(-t.rotation);
      return { x: t.refPlan.x + (dxR * cosR - dyR * sinR), y: t.refPlan.y - (dxR * sinR + dyR * cosR) };
    }
    // Inverse affine exacte (det non nul vérifié à la construction).
    if (t.affine) {
      const f = t.affine;
      const E = (lng - t.refGps.lng) * f.kLng;
      const N = (lat - t.refGps.lat) * f.kLat;
      const x  = (f.d * (E - f.e) - f.b * (N - f.f)) / f.det;
      const yF = (f.a * (N - f.f) - f.c * (E - f.e)) / f.det;
      return { x: x, y: -yF };
    }
    const dlatDeg = lat - t.refGps.lat;
    const dlngDeg = lng - t.refGps.lng;
    const dxMetres = dlngDeg * 111320 * Math.cos(t.latMoyenne * Math.PI / 180);
    const dyMetres = dlatDeg * 110540;
    const dxRot = dxMetres / t.metresParPixel;
    const dyRot = dyMetres / t.metresParPixel;
    const cosR = Math.cos(-t.rotation);  // ou cos(rotation), même valeur
    const sinR = Math.sin(-t.rotation);
    const dx = dxRot * cosR - dyRot * sinR;
    const dy = dxRot * sinR + dyRot * cosR;
    return {
      x: t.refPlan.x + dx,
      y: t.refPlan.y - dy
    };
  }

  // ── Persistance ──────────
  function _calibLsKey(planId) {
    return KMZ_CALIB_LS_PREFIX + (planId || "default");
  }

  function getCalibration(planId) {
    try {
      const raw = localStorage.getItem(_calibLsKey(planId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e) { return null; }
  }

  function setCalibration(planId, calib) {
    try { localStorage.setItem(_calibLsKey(planId), JSON.stringify(calib)); }
    catch(e) {}
  }

  // ── KML : helpers ──────────
  function _xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // 🩸 Altitude = profondeur du niveau : à 0, un relevé souterrain se pose À LA SURFACE dans Google Earth.
  // ⚠️ Un `alt` non nul ne suffit PAS : KML est en `clampToGround` par défaut et `<tessellate>1` force le
  // collage au sol — une géométrie avec altitude déclare `relativeToGround` ET renonce au tessellate.
  // `relativeToGround` et non `absolute` : la profondeur se mesure SOUS LA SURFACE ; l'altitude du terrain
  // est inconnue, l'inventer serait plus faux que zéro.
  function _coord(latlng, alt) {
    const a = Number.isFinite(alt) ? alt : 0;
    return latlng.lng.toFixed(8) + "," + latlng.lat.toFixed(8) + "," + a.toFixed(1);
  }

  // Profondeur (négative) du niveau, ou 0 si non renseignée.
  function _altNiveau(level) {
    if (!Number.isInteger(level)) return 0;
    if (typeof window.getProfondeurNiveau !== "function") return 0;
    const z = window.getProfondeurNiveau(level);
    return Number.isFinite(z) ? z : 0;
  }

  // Vide quand tout est à 0 : le KML des plans sans profondeurs ne change pas.
  function _modeAltitude(alt) {
    return (Number.isFinite(alt) && alt !== 0)
      ? "<altitudeMode>relativeToGround</altitudeMode>" : "<tessellate>1</tessellate>";
  }

  // "#RRGGBB" + alpha [0..1] → "AABBGGRR" (ordre KML).
  function _kmlColor(hex, alpha) {
    if (!hex || hex[0] !== "#") return "ff000000";
    const a = Math.round((alpha != null ? alpha : 1) * 255).toString(16).padStart(2, "0");
    const r = hex.slice(1, 3);
    const g = hex.slice(3, 5);
    const b = hex.slice(5, 7);
    return (a + b + g + r).toLowerCase();
  }

  // ── Styles KML : couleurs résolues, épaisseurs propres au KML ──────────
  // COULEURS : js/styleResolver.js (seule chose alignée sur la carte). LARGEURS et alphas de remplissage :
  // définis ICI, à l'échelle GPS (front 5 ici / 10 sur la carte, pilier 2 / 3, alpha 0,6 / 0,7) —
  // VARIANTE DÉLIBÉRÉE, pas une dérive ; les mélanger changerait le rendu dans Google Earth.
  // `{ flat: true }` : pas de motif SVG en KML, `inaccessible` retombe sur son aplat.
  const PREFIXE_CATEGORIE = { road: "traces", zone: "zones", structure: "structures" };

  function _traitsKml(categorie, cle, style) {
    if (categorie === "traces") {
      if (cle === "chemin")    return { width: 3, alpha: 1 };
      if (cle === "itinerary") return { width: 6, alpha: 1 };
      return { width: 4, alpha: 1 };
    }
    if (categorie === "zones") {
      return { width: 2, fillAlpha: (cle === "inaccessible") ? 0.65 : 0.6 };
    }
    // Structures : front (polyline) = LineString épaisse SANS remplissage ; pilier/mur = polygone.
    if (style && style.isPolyline) return { width: 5, alpha: 1 };
    return { width: 2, fillAlpha: 0.85 };
  }

  // ⚠️ Repli d'un type SANS entrée de légende (id brut d'un calque, custom supprimé) = celui de la carte :
  // zones.js / structures.js > `_resolve…Style(type) || _resolve…Style("<repli>")`, contrôlé par
  // scripts/check-kml-styles.js. Les tracés n'ont pas de repli de famille (la carte les peint en blanc,
  // comme le trait par défaut de Google Earth) : pas de style.
  const REPLI_KML = { zones: "remblais", structures: "mur" };

  // Style KML d'un type built-in OU custom ; repli de sa famille si inconnu, null pour un tracé inconnu.
  function _styleKmlDe(categorie, cle) {
    if (typeof window.ktaResolveStyle !== "function") return null;
    const s = window.ktaResolveStyle(categorie, cle, { flat: true });
    if (!s) {
      const repli = REPLI_KML[categorie];
      return (repli && repli !== cle) ? _styleKmlDe(categorie, repli) : null;
    }
    const t = _traitsKml(categorie, cle, s);
    const out = { line: s.color, width: t.width };
    if (t.alpha != null) out.alpha = t.alpha;
    // Pas de PolyStyle sur une polyline : le `fillColor` canonique des fronts ne doit pas passer en KML.
    if (s.fillColor && !s.isPolyline) {
      out.fill = s.fillColor;
      out.fillAlpha = t.fillAlpha;
    }
    return out;
  }

  function _blocStyleKml(id, s) {
    let out = '<Style id="' + id + '">';
    if (s.line) {
      out += '<LineStyle>' +
               '<color>' + _kmlColor(s.line, s.alpha != null ? s.alpha : 1) + '</color>' +
               '<width>' + s.width + '</width>' +
             '</LineStyle>';
    }
    if (s.fill) {
      out += '<PolyStyle>' +
               '<color>' + _kmlColor(s.fill, s.fillAlpha != null ? s.fillAlpha : 0.5) + '</color>' +
               '<outline>1</outline>' +
               '<fill>1</fill>' +
             '</PolyStyle>';
    }
    return out + '</Style>';
  }

  // 🩸 Un Placemark custom émet `<styleUrl>#road_cust-abc123</styleUrl>` : sans <Style> déclaré pour CE
  // type, Google Earth retombe sur son trait par défaut et la couleur est perdue. On déclare un <Style> par
  // type custom RÉELLEMENT utilisé (collectés pendant la génération, cf `_idStyleEtCollecte`).
  function _genererStylesKml(idsCustomUtilises) {
    let out = "";
    Object.keys(PREFIXE_CATEGORIE).forEach(function(prefixe) {
      const cat = PREFIXE_CATEGORIE[prefixe];
      const cles = (typeof window.ktaStyleBuiltins === "function") ? window.ktaStyleBuiltins(cat) : [];
      cles.forEach(function(cle) {
        const s = _styleKmlDe(cat, cle);
        if (s) out += _blocStyleKml(prefixe + "_" + cle, s);
      });
    });
    if (idsCustomUtilises && idsCustomUtilises.size) {
      idsCustomUtilises.forEach(function(id) {
        const sep = id.indexOf("_");
        const cat = PREFIXE_CATEGORIE[id.slice(0, sep)];
        const s   = cat ? _styleKmlDe(cat, id.slice(sep + 1)) : null;
        // Type introuvable : style de repli de sa famille ; tracé inconnu : rien émis (trait par défaut).
        if (s) out += _blocStyleKml(id, s);
      });
    }
    return out;
  }

  // Nom de fichier (et d'id de style) d'une icône : un tag libre peut porter espace, guillemet ou « / », qui
  // casseraient le XML ou le chemin dans le ZIP. Même fonction pour le fichier, le <Style> et le styleUrl.
  // ⚠️ Un tag de lettres (accents compris), chiffres, « _ » et « - » reste tel quel : kmzImport.js relit le tag
  // dans le styleUrl (aller-retour).
  function _nomIcone(tag) {
    const t = String(tag || "default");
    return /^[\p{L}\p{N}_-]+$/u.test(t) ? t : "t_" + t.replace(/[^\p{L}\p{N}_-]/gu, "_") + "_" + _hashCourt(t);
  }
  function _hashCourt(s) {
    let h = 0;
    // Math.imul + >>> 0 : repli modulo 2^32 (Math.trunc le perdrait) ; codePointAt = charCodeAt hors caractères astraux.
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.codePointAt(i)) >>> 0;
    return h.toString(36);
  }

  // Un <Style id="point_<tag>"> par tag rencontré. ⚠️ `embarquees` (Set des tags dont le fichier est DANS le
  // ZIP, cf genererKmz) : un tag sans fichier (tag inconnu, icône introuvable) pointe vers l'icône par défaut,
  // sinon Google Earth affiche une icône cassée. Sans ce Set (genererKml seul), chaque tag vise son fichier.
  function _genererStyleIconePoint(tag, embarquees) {
    const nom = _nomIcone(tag);
    const fichier = (!embarquees || embarquees.has(String(tag || "default"))) ? nom
                  : (embarquees.has("default") ? "default" : nom);
    return '<Style id="point_' + nom + '">' +
             '<IconStyle>' +
               '<Icon><href>files/icons/' + fichier + '.png</href></Icon>' +
               '<scale>0.8</scale>' +
             '</IconStyle>' +
             '<LabelStyle>' +
               '<color>ffffffff</color>' +
               '<scale>0.85</scale>' +
             '</LabelStyle>' +
           '</Style>';
  }

  // Nom d'un objet d'un type hors intégrés : le libellé de la légende (« Front niveau 2 »), sinon l'id brut
  // — jamais `Cust-m2k9x-3fa`.
  function _nomType(type) {
    const LC = window.LegendCustomization;
    if (LC && typeof LC.findCustomEntry === "function") {
      try { const e = LC.findCustomEntry(type); if (e && e.label) return String(e.label); } catch (e) {}
    }
    const s = String(type);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Géométrie d'une structure : celle de sa légende. Un type SANS légende (id brut d'un calque) n'en déclare
  // aucune : il suit sa forme réelle, ligne si ouvert, polygone si fermé (premier point = dernier, comme
  // l'anneau d'un polygone SIG importé ; le format n'a pas de drapeau `closed`).
  function _estLigneStructure(s) {
    const type = s.type;
    const connu = typeof window.ktaResolveStyle === "function" && !!window.ktaResolveStyle("structures", type);
    if (connu || typeof window.ktaResolveStyle !== "function") {
      return (typeof window.isStructurePolylineType === "function")
        ? !!window.isStructurePolylineType(type)
        : (type === "front-1" || type === "front-2");
    }
    const pts = s.points || [];
    const a = pts[0], z = pts[pts.length - 1];
    const ferme = pts.length >= 4 && !!a && !!z && a.x === z.x && a.y === z.y;
    return !ferme;
  }

  // Style résolu d'un type ({ flat: true }) avec le repli de sa famille quand il n'a pas d'entrée de légende :
  // la couleur du GeoJSON (js/geojsonExport.js) suit ainsi celle du KML et de la carte.
  function _styleResolu(categorie, cle) {
    if (typeof window.ktaResolveStyle !== "function") return null;
    const s = window.ktaResolveStyle(categorie, cle, { flat: true });
    if (s) return s;
    const repli = REPLI_KML[categorie];
    return (repli && repli !== cle) ? window.ktaResolveStyle(categorie, repli, { flat: true }) : null;
  }

  // ── Génération KML complète ──────────
  // opts = {
  //   planName, planVersion, planAuthor, imageW, imageH (px), transform (buildTransform),
  //   include: { image, points, roads, zones, structures, jonctions (multi-niveau), itineraire, dataLayers,
  //     pointTagsSet (1er tag), roadTypesSet, zoneTypesSet, structureTypesSet },
  //       ⚠️ filtres : Set | null — null = pas de filtre, Set vide = tout retirer (parent coché sans enfant)
  //   levels: Set<number> | null (null = tous),
  //   data: { editorPoints, roads, zones, structures, dataLayerItems: { points, roads, zones, structures } },
  //   imageBaseUrl (relative ou data:), imageOpacity (0-100, défaut 60), tilesOverlay?, secoursPlan?
  // } → KML complet (string).
  function genererKml(opts) {
    const t = opts.transform;
    if (!t) throw new Error(window.I18n.t("kmz.err.transformRequired"));

    const planName = opts.planName || "Plan MyKTAMap";

    let groundOverlay = "";
    // SUPEROVERLAY (plans V2) : un GroundOverlay PAR TUILE avec <Region>/<Lod> — Google Earth n'affiche que
    // le niveau adapté au zoom (recette gdal2tiles/MapTiler). Quads calculés par planToGps sur les PIXELS
    // NATIFS de chaque tuile (bornés à l'emprise : tuiles de bord rognées). drawOrder croît avec le niveau.
    if (opts.include.image && opts.tilesOverlay && Array.isArray(opts.tilesOverlay.levels)) {
      const TO = opts.tilesOverlay;
      const zVals = TO.levels.map(function(l) { return l.z; });
      const zMinP = Math.min.apply(null, zVals), zMaxP = Math.max.apply(null, zVals);
      const opPct2 = (typeof opts.imageOpacity === "number") ? opts.imageOpacity : 60;
      const a255 = Math.round(Math.max(0, Math.min(100, opPct2)) * 2.55);
      const colorTag2 = '<color>' + (a255 < 16 ? "0" : "") + a255.toString(16) + 'ffffff</color>';
      // Mosaïque (Google Earth mobile) : quelques grandes images, bornes natives fournies, sans Region.
      const mosaique = TO.mosaique === true;
      const morceaux = ['<Folder><name>' + _xmlEsc(opts.planName + (mosaique ? " — plan" : " — plan (tuiles)")) + '</name>'];
      TO.levels.forEach(function(lvl) {
        const scale = Math.pow(2, -lvl.z);
        // Lod : un niveau visible à la fois (128→512 px écran par tuile) ; le plus grossier visible de loin
        // (min 0), le plus fin sans plafond (max -1).
        const lodMin = (lvl.z === zMinP) ? 0 : 128;
        const lodMax = (lvl.z === zMaxP) ? -1 : 512;
        // 🩸 k=1 est la bande du BAS du plan (CRS.Simple : lat = H − y, cf tiling.js et _genererTuilesV2) :
        // mapper de haut en bas met chaque niveau à l'envers et les rangées partielles décalent les niveaux.
        // Mapping bas-en-haut, pixels NIVEAU convertis au natif, bornés à l'emprise.
        const lvlH = Math.ceil(opts.imageH / scale);
        const lvlW = Math.ceil(opts.imageW / scale);
        // Un sous-dossier par niveau et des tuiles NOMMÉES (sinon Google Earth mobile liste des milliers de
        // « Superposition sans titre »).
        if (!mosaique) morceaux.push('<Folder><name>' + _xmlEsc("Détail " + (lvl.z - zMinP + 1) + " (" + lvl.tiles.length + " tuiles)") + '</name>');
        lvl.tiles.forEach(function(tu) {
          let x0 = tu.col * TO.tileSize * scale;
          let x1 = Math.min(Math.min(lvlW, (tu.col + 1) * TO.tileSize) * scale, opts.imageW);
          let y1 = Math.min((lvlH - (tu.k - 1) * TO.tileSize) * scale, opts.imageH);   // bas de la tuile
          let y0 = Math.max(0, (lvlH - tu.k * TO.tileSize)) * scale;                   // haut de la tuile
          if (mosaique) { x0 = tu.nx0; y0 = tu.ny0; x1 = tu.nx1; y1 = tu.ny1; }
          const qTL = planToGps(t, x0, y0), qTR = planToGps(t, x1, y0);
          const qBR = planToGps(t, x1, y1), qBL = planToGps(t, x0, y1);
          const lats = [qTL.lat, qTR.lat, qBR.lat, qBL.lat];
          const lngs = [qTL.lng, qTR.lng, qBR.lng, qBL.lng];
          morceaux.push(
            '<GroundOverlay>' +
              '<name>' + _xmlEsc(mosaique ? "Image " + tu.k + "," + (tu.col + 1)
                : "Détail " + (lvl.z - zMinP + 1) + " — tuile " + (tu.col + 1) + "," + tu.k) + '</name>' +
              colorTag2 +
              '<drawOrder>' + (lvl.z - zMinP) + '</drawOrder>' +
              '<Icon><href>' + _xmlEsc(tu.kmzPath) + '</href></Icon>' +
              (mosaique ? '' :
              '<Region>' +
                '<LatLonAltBox>' +
                  '<north>' + Math.max.apply(null, lats).toFixed(8) + '</north>' +
                  '<south>' + Math.min.apply(null, lats).toFixed(8) + '</south>' +
                  '<east>'  + Math.max.apply(null, lngs).toFixed(8) + '</east>' +
                  '<west>'  + Math.min.apply(null, lngs).toFixed(8) + '</west>' +
                '</LatLonAltBox>' +
                '<Lod><minLodPixels>' + lodMin + '</minLodPixels><maxLodPixels>' + lodMax + '</maxLodPixels></Lod>' +
              '</Region>') +
              '<gx:LatLonQuad xmlns:gx="http://www.google.com/kml/ext/2.2">' +
                '<coordinates>' + _coord(qBL) + ' ' + _coord(qBR) + ' ' + _coord(qTR) + ' ' + _coord(qTL) + '</coordinates>' +
              '</gx:LatLonQuad>' +
            '</GroundOverlay>');
        });
        if (!mosaique) morceaux.push('</Folder>');
      });
      morceaux.push('</Folder>');
      groundOverlay = morceaux.join("");
    } else if (opts.include.image && opts.imageBaseUrl) {
      const cTL = planToGps(t, 0,          0);
      const cTR = planToGps(t, opts.imageW, 0);
      const cBR = planToGps(t, opts.imageW, opts.imageH);
      const cBL = planToGps(t, 0,          opts.imageH);

      // Opacité : <color> AABBGGRR, blanc × alpha (défaut 60 % : lisible sous le plan).
      const opPct = (typeof opts.imageOpacity === "number") ? opts.imageOpacity : 60;
      const opClamped = Math.max(0, Math.min(100, opPct));
      const alpha255 = Math.round(opClamped * 2.55);
      const alphaHex = (alpha255 < 16 ? "0" : "") + alpha255.toString(16);
      const colorTag = '<color>' + alphaHex + 'ffffff</color>';

      // gx:LatLonQuad (4 coins libres) plutôt que LatLonBox : robuste pour un plan tourné.
      // Ordre KML : SW, SE, NE, NW (= BL, BR, TR, TL en coords image).
      groundOverlay =
        '<GroundOverlay>' +
          '<name>' + _xmlEsc(planName + " — plan image") + '</name>' +
          colorTag +
          '<Icon><href>' + _xmlEsc(opts.imageBaseUrl) + '</href></Icon>' +
          '<gx:LatLonQuad xmlns:gx="http://www.google.com/kml/ext/2.2">' +
            '<coordinates>' +
              _coord(cBL) + ' ' + _coord(cBR) + ' ' + _coord(cTR) + ' ' + _coord(cTL) +
            '</coordinates>' +
          '</gx:LatLonQuad>' +
        '</GroundOverlay>';
    }

    function _passeLevel(item, levelFromItem) {
      if (!opts.levels) return true;
      const lvl = Number.isInteger(levelFromItem) ? levelFromItem : 0;
      return opts.levels.has(lvl);
    }

    const tagsRencontres = new Set(["default"]);

    // Niveaux où un point s'exporte : tous ceux d'un passage entre niveaux, sinon son seul `level`.
    function _niveauxPoint(p) {
      const PJ = window.KtaPoiJonction;
      if (PJ && PJ.estJonction(p)) return PJ.niveaux(p);
      return [Number.isInteger(p.level) ? p.level : 0];
    }

    // `copie` : passage entre niveaux répété dans le dossier d'un autre de ses niveaux (mkm:copie, sauté à
    // l'import pour ne pas doubler le point).
    function _emitPlacemark(p, layerIcon, copie) {
      const tag = (Array.isArray(p.tags) && p.tags.length > 0) ? p.tags[0] : "default";
      tagsRencontres.add(tag);
      const ll = planToGps(t, p.x, p.y);
      const nom = p.nom || p.id || "(point)";
      // Description en CDATA (Google Earth la rend en HTML : les \n bruts sont invisibles) : \n → <br/>.
      // L'import KMZ fait l'inverse (roundtrip du texte d'origine).
      const desc = p.description ? _emitDescriptionCdata(p.description) : '';
      const nv = _niveauxPoint(p);
      const dc = window.KtaPoiDanger ? window.KtaPoiDanger.dateConstat(p) : null;
      const extData = _emitExtendedDataLevel(Number.isInteger(p.level) ? p.level : null,
        { niveaux: nv.length >= 2 ? nv : null, copie: !!copie, dateConstat: dc });
      return '<Placemark>' +
               '<name>' + _xmlEsc(nom) + '</name>' +
               desc +
               extData +
               '<styleUrl>#point_' + _nomIcone(tag) + '</styleUrl>' +
               '<Point><coordinates>' + _coord(ll) + '</coordinates></Point>' +
             '</Placemark>';
    }

    // ExtendedData : méta MyKTAMap (level, fromLevel/toLevel des jonctions) pour le roundtrip
    // MKM→KMZ→MKM, relues par kmzImport.ingestPlacemarks. <Data name="mkm:…"> : ignoré par les autres
    // apps, préfixe `mkm:` contre les collisions.
    function _emitExtendedDataLevel(level, extra) {
      const parts = [];
      if (Number.isInteger(level)) {
        parts.push('<Data name="mkm:level"><value>' + level + '</value></Data>');
      }
      if (extra && Number.isInteger(extra.fromLevel)) {
        parts.push('<Data name="mkm:fromLevel"><value>' + extra.fromLevel + '</value></Data>');
      }
      if (extra && Number.isInteger(extra.toLevel)) {
        parts.push('<Data name="mkm:toLevel"><value>' + extra.toLevel + '</value></Data>');
      }
      // Passage entre niveaux : ses niveaux (« 0,-1 »). Les raccords, en pixels du plan, ne partent pas.
      if (extra && Array.isArray(extra.niveaux)) {
        parts.push('<Data name="mkm:niveaux"><value>' + extra.niveaux.join(",") + '</value></Data>');
      }
      if (extra && extra.copie) parts.push('<Data name="mkm:copie"><value>1</value></Data>');
      // POI danger : jour du constat (« AAAA-MM-JJ », déjà validé par poiDanger.js).
      if (extra && extra.dateConstat) {
        parts.push('<Data name="mkm:dateConstat"><value>' + _xmlEsc(extra.dateConstat) + '</value></Data>');
      }
      if (parts.length === 0) return '';
      return '<ExtendedData>' + parts.join('') + '</ExtendedData>';
    }

    function _emitDescriptionCdata(text) {
      const s = String(text == null ? "" : text);
      // \n → <br/> (bulle Google Earth). 🔒 Texte échappé : Google Earth rend du HTML, une note partagée
      // ne doit pas devenir du balisage — et « ]]> » ne survit pas à l'échappement.
      const html = window.ktaEsc(s).replaceAll("\n", "<br/>");
      return '<description><![CDATA[' + html + ']]></description>';
    }

    function _emitLineString(road, styleId, nomImpose) {
      if (!road.points || road.points.length < 2) return "";
      // Jonction posée au plus HAUT de ses deux étages (une seule altitude pour toute la ligne).
      const _altRoad = (road.type === "jonction")
        ? Math.max(_altNiveau(road.fromLevel), _altNiveau(road.toLevel))
        : _altNiveau(road.level);
      const coords = road.points
        .map(function(p) { return _coord(planToGps(t, p.x, p.y), _altRoad); })
        .join(" ");
      const nom = nomImpose ? nomImpose
                : road.type === "itinerary" ? "🗺️ Itinéraire"
                : road.type === "jonction"  ? "🪜 Jonction"
                : _nomType(road.type);
      const desc = road.description ? _emitDescriptionCdata(road.description) : '';
      const extData = (road.type === "jonction")
        ? _emitExtendedDataLevel(null, { fromLevel: road.fromLevel, toLevel: road.toLevel })
        : _emitExtendedDataLevel(Number.isInteger(road.level) ? road.level : null);
      return '<Placemark>' +
               '<name>' + _xmlEsc(nom) + '</name>' +
               desc +
               extData +
               '<styleUrl>#' + styleId + '</styleUrl>' +
               '<LineString>' + _modeAltitude(_altRoad) + '<coordinates>' + coords +
               '</coordinates></LineString>' +
             '</Placemark>';
    }

    function _emitPolygon(zone, styleId) {
      if (!zone.points || zone.points.length < 3) return "";
      // Ring fermé : 1er point répété à la fin.
      const ring = zone.points.slice();
      const _altZone = _altNiveau(zone.level);
      ring.push(zone.points[0]);
      const coords = ring
        .map(function(p) { return _coord(planToGps(t, p.x, p.y), _altZone); })
        .join(" ");
      // Structures : noms explicites plutôt que « Pilier-1 ».
      let nom;
      if (zone.type === "pilier-1") nom = "Pilier 1ère masse";
      else if (zone.type === "pilier-2") nom = "Pilier 2e masse";
      else if (zone.type === "mur") nom = "Mur";
      else nom = _nomType(zone.type);
      const desc = zone.description ? _emitDescriptionCdata(zone.description) : '';
      const extData = _emitExtendedDataLevel(Number.isInteger(zone.level) ? zone.level : null);
      return '<Placemark>' +
               '<name>' + _xmlEsc(nom) + '</name>' +
               desc +
               extData +
               '<styleUrl>#' + styleId + '</styleUrl>' +
               '<Polygon>' + _modeAltitude(_altZone) + '<outerBoundaryIs><LinearRing><coordinates>' +
               coords + '</coordinates></LinearRing></outerBoundaryIs></Polygon>' +
             '</Placemark>';
    }

    // Folder Secours complet (lu par Google Earth, OsmAnd, Avenza, Locus…). → { folder, styles }.
    function _emitSecoursFolder(opts, secoursPlan, palette) {
      const t = opts.transform;
      const groupes = secoursPlan.groupes || [];
      if (groupes.length === 0) return { folder: "", styles: "" };

      let styles = "";
      let folder = '<Folder><name>🚑 Secours — ' + _xmlEsc(secoursPlan.nom || "Plan de secours") + '</name>';
      const ctxDesc = [];
      if (secoursPlan.context && secoursPlan.context.incidentAt) {
        ctxDesc.push("Incident : " + secoursPlan.context.incidentAt);
      }
      ctxDesc.push(groupes.length + " équipe" + (groupes.length > 1 ? "s" : ""));
      if (secoursPlan.context && secoursPlan.context.notes) {
        ctxDesc.push("Notes : " + secoursPlan.context.notes);
      }
      folder += '<description>' + _emitDescriptionCdata(ctxDesc.join("\n")) + '</description>';

      styles += '<Style id="secours_entree">' +
                  '<IconStyle><color>ff44cc00</color><scale>1.2</scale>' +
                    '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href></Icon>' +
                  '</IconStyle>' +
                  '<LabelStyle><color>ff44cc00</color><scale>0.9</scale></LabelStyle>' +
                '</Style>';
      styles += '<Style id="secours_sortie">' +
                  '<IconStyle><color>ff0000cc</color><scale>1.2</scale>' +
                    '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon>' +
                  '</IconStyle>' +
                  '<LabelStyle><color>ff0000cc</color><scale>0.9</scale></LabelStyle>' +
                '</Style>';
      styles += '<Style id="secours_sortie_boucle">' +
                  '<IconStyle><color>ff00aaff</color><scale>1.3</scale>' +
                    '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/orange-circle.png</href></Icon>' +
                  '</IconStyle>' +
                  '<LabelStyle><color>ff00aaff</color><scale>0.9</scale></LabelStyle>' +
                '</Style>';

      // Par couleur de palette : polygone + itinéraire + étape intermédiaire (rond teinté).
      palette.forEach(function(c, idx) {
        const colorFill = _kmlColor(c.hex, 0.30);   // 30 % fill polygon
        const colorLine = _kmlColor(c.hex, 1.0);    // 100 % outline
        const colorTint = _kmlColor(c.hex, 1.0);    // tint icon intermédiaire
        styles += '<Style id="secours_zone_' + idx + '">' +
                    '<LineStyle><color>' + colorLine + '</color><width>3</width></LineStyle>' +
                    '<PolyStyle><color>' + colorFill + '</color><fill>1</fill><outline>1</outline></PolyStyle>' +
                  '</Style>';
        // Halo des tracés (trait épais semi-transparent).
        styles += '<Style id="secours_zoneroad_' + idx + '">' +
                    '<LineStyle><color>' + _kmlColor(c.hex, 0.55) + '</color><width>8</width></LineStyle>' +
                  '</Style>';
        styles += '<Style id="secours_iti_' + idx + '">' +
                    '<LineStyle><color>' + colorLine + '</color><width>5</width></LineStyle>' +
                  '</Style>';
        styles += '<Style id="secours_etape_' + idx + '">' +
                    '<IconStyle><color>' + colorTint + '</color><scale>1.0</scale>' +
                      '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon>' +
                    '</IconStyle>' +
                    '<LabelStyle><color>' + colorTint + '</color><scale>0.8</scale></LabelStyle>' +
                  '</Style>';
      });

      function _wpToGps(w) {
        return planToGps(t, w.x, w.y);
      }

      // Un Folder par équipe, découpé par CATÉGORIE (📍 Points · ⬛ Zone · 🗺️ Itinéraire) : dans Google
      // Earth / OsmAnd on coche les couches à voir.
      groupes.forEach(function(g) {
        const idx = (g.couleurIdx || 0) % palette.length;
        const couleurNom = palette[idx].nom || ("Équipe " + (idx + 1));
        let sub = '<Folder><name>🚨 ' + _xmlEsc(g.nom || couleurNom) + ' (' + _xmlEsc(couleurNom) + ')</name>';

        // Description HTML (clic sur le folder).
        const descParts = [];
        if (Array.isArray(g.membres) && g.membres.length > 0) {
          descParts.push("Membres : " + g.membres.join(", "));
        }
        if (typeof g.distanceM === "number") {
          descParts.push("Distance : " + Math.round(g.distanceM) + " m");
        }
        if (typeof g.dureeEstimeeMin === "number") {
          descParts.push("Durée estimée : ~" + Math.round(g.dureeEstimeeMin) + " min");
        }
        if (g.statut) descParts.push("Statut : " + g.statut);
        if (descParts.length > 0) {
          sub += '<description>' + _emitDescriptionCdata(descParts.join("\n")) + '</description>';
        }

        // ── Points : entrée + intermédiaires + sortie ──
        let pointsXml = "";
        let nbPoints = 0;
        if (g.entree && typeof g.entree.x === "number") {
          const ll = _wpToGps(g.entree);
          const lbl = g.entree.label || g.entree.pointId || "";
          pointsXml += '<Placemark>' +
                         '<name>📍 Entrée ' + _xmlEsc(g.nom) + (lbl ? " — " + _xmlEsc(lbl) : "") + '</name>' +
                         '<styleUrl>#secours_entree</styleUrl>' +
                         '<Point><coordinates>' + _coord(ll) + '</coordinates></Point>' +
                       '</Placemark>';
          nbPoints++;
        }
        if (Array.isArray(g.intermediaires)) {
          g.intermediaires.forEach(function(w, i) {
            if (!w || typeof w.x !== "number") return;
            const ll = _wpToGps(w);
            const lbl = w.label || w.pointId || "";
            pointsXml += '<Placemark>' +
                           '<name>▾ Étape ' + (i + 1) + ' (' + _xmlEsc(g.nom) + ')' +
                           (lbl ? " — " + _xmlEsc(lbl) : "") + '</name>' +
                           '<styleUrl>#secours_etape_' + idx + '</styleUrl>' +
                           '<Point><coordinates>' + _coord(ll) + '</coordinates></Point>' +
                         '</Placemark>';
            nbPoints++;
          });
        }
        // Sortie : rouge, orange si boucle (entrée = sortie).
        if (g.sortie && typeof g.sortie.x === "number") {
          const ll = _wpToGps(g.sortie);
          const isBoucle = g.entree && (
            (g.entree.pointId && g.sortie.pointId && g.entree.pointId === g.sortie.pointId) ||
            (Math.abs((g.entree.x || 0) - (g.sortie.x || 0)) < 0.5 &&
             Math.abs((g.entree.y || 0) - (g.sortie.y || 0)) < 0.5)
          );
          const lbl = g.sortie.label || g.sortie.pointId || "";
          const styleId = isBoucle ? "secours_sortie_boucle" : "secours_sortie";
          const namePrefix = isBoucle ? "↻ Boucle " : "🚪 Sortie ";
          pointsXml += '<Placemark>' +
                         '<name>' + namePrefix + _xmlEsc(g.nom) + (lbl ? " — " + _xmlEsc(lbl) : "") + '</name>' +
                         '<styleUrl>#' + styleId + '</styleUrl>' +
                         '<Point><coordinates>' + _coord(ll) + '</coordinates></Point>' +
                       '</Placemark>';
          nbPoints++;
        }
        if (nbPoints > 0) {
          sub += '<Folder><name>📍 Points (' + nbPoints + ')</name>' + pointsXml + '</Folder>';
        }

        // ── Zone : polygone OU halos de tracés ──
        let zoneXml = "";
        if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
          const ring = g.zonePolygon.slice();
          ring.push(g.zonePolygon[0]);   // ferme le ring
          const coords = ring.map(function(p) { return _coord(_wpToGps(p)); }).join(" ");
          zoneXml += '<Placemark>' +
                       '<name>⬛ Polygone zone ' + _xmlEsc(g.nom) + '</name>' +
                       '<styleUrl>#secours_zone_' + idx + '</styleUrl>' +
                       '<Polygon><outerBoundaryIs><LinearRing><coordinates>' +
                       coords + '</coordinates></LinearRing></outerBoundaryIs></Polygon>' +
                     '</Placemark>';
        }
        // 🩸 `zoneRoadIds` porte des EMPREINTES de géométrie, pas des `road.id` : la résolution appartient au
        // Mode Secours (SecoursMode.tracesZone).
        const tracesZone = (window.SecoursMode && typeof window.SecoursMode.tracesZone === "function")
                           ? window.SecoursMode.tracesZone(g) : [];
        if (tracesZone.length > 0) {
          tracesZone.forEach(function(road) {
            if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
            const coords = road.points.map(function(p) { return _coord(_wpToGps(p)); }).join(" ");
            zoneXml += '<Placemark>' +
                         '<name>🛣️ Tracé zone ' + _xmlEsc(g.nom) + '</name>' +
                         '<styleUrl>#secours_zoneroad_' + idx + '</styleUrl>' +
                         '<LineString><tessellate>1</tessellate><coordinates>' +
                         coords + '</coordinates></LineString>' +
                       '</Placemark>';
          });
        }
        if (zoneXml) {
          sub += '<Folder><name>⬛ Zone de recherche</name>' + zoneXml + '</Folder>';
        }

        // ── Itinéraire ──
        if (Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2) {
          const coords = g.itineraireSuggere.map(function(p) { return _coord(_wpToGps(p)); }).join(" ");
          let itiDesc = "";
          if (typeof g.distanceM === "number" && typeof g.dureeEstimeeMin === "number") {
            itiDesc = '<description>' + _emitDescriptionCdata(
              Math.round(g.distanceM) + " m — ~" + Math.round(g.dureeEstimeeMin) + " min"
            ) + '</description>';
          }
          sub += '<Folder><name>🗺️ Itinéraire</name>' +
                   '<Placemark>' +
                     '<name>🗺️ Itinéraire ' + _xmlEsc(g.nom) + '</name>' +
                     itiDesc +
                     '<styleUrl>#secours_iti_' + idx + '</styleUrl>' +
                     '<LineString><tessellate>1</tessellate><coordinates>' +
                     coords + '</coordinates></LineString>' +
                   '</Placemark>' +
                 '</Folder>';
        }

        sub += '</Folder>';
        folder += sub;
      });

      folder += '</Folder>';
      return { folder: folder, styles: styles };
    }

    // Folders : un par niveau visible si multiLevel, sinon un seul.
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const levels = mlOn ? (opts.levels ? Array.from(opts.levels).sort(function(a,b){return a-b;}) : [0])
                        : [0];

    // Ids de style des types CUSTOM rencontrés, déclarés en fin de document par `_genererStylesKml`.
    const idsStyleCustom = new Set();
    function _idStyleEtCollecte(prefixe, type) {
      const id = prefixe + "_" + type;
      // Tout type NON built-in est collecté (pas seulement `cust-`) : un id technique (« Bas ») lié à une
      // entrée de légende reçoit aussi son <Style>.
      const cat = PREFIXE_CATEGORIE[prefixe];
      const builtins = (cat && typeof window.ktaStyleBuiltins === "function")
                         ? window.ktaStyleBuiltins(cat) : [];
      if (builtins.indexOf(String(type)) === -1) idsStyleCustom.add(id);
      return id;
    }

    const pointTagsSet = (opts.include.pointTagsSet instanceof Set) ? opts.include.pointTagsSet : null;
    const roadTypesSet = (opts.include.roadTypesSet instanceof Set) ? opts.include.roadTypesSet : null;
    const zoneTypesSet = (opts.include.zoneTypesSet instanceof Set) ? opts.include.zoneTypesSet : null;
    const structureTypesSet = (opts.include.structureTypesSet instanceof Set) ? opts.include.structureTypesSet : null;

    // 1er tag (cohérent avec _emitPlacemark).
    function _firstTag(p) {
      return (Array.isArray(p.tags) && p.tags.length > 0) ? p.tags[0] : "__untagged__";
    }

    function _folderForLevel(level) {
      let body = "";
      if (opts.include.points && opts.data.editorPoints) {
        // Passage entre niveaux : dans le dossier de CHACUN de ses niveaux exportés (décision produit) ; un
        // seul exemplaire est l'original (son niveau s'il est exporté, sinon le premier), les autres des copies.
        const exportes = function(p) {
          return _niveauxPoint(p).filter(function(n) { return !opts.levels || opts.levels.has(n); });
        };
        const original = function(p, ex) {
          const lvl = Number.isInteger(p.level) ? p.level : 0;
          return ex.indexOf(lvl) >= 0 ? lvl : ex[0];
        };
        const points = opts.data.editorPoints.filter(function(p) {
          if (pointTagsSet && !pointTagsSet.has(_firstTag(p))) return false;
          if (!mlOn) return _passeLevel(p, Number.isInteger(p.level) ? p.level : 0);
          return exportes(p).indexOf(level) >= 0;
        });
        if (points.length > 0) {
          body += '<Folder><name>📍 Points (' + points.length + ')</name>';
          points.forEach(function(p) {
            body += _emitPlacemark(p, undefined, mlOn && original(p, exportes(p)) !== level);
          });
          body += '</Folder>';
        }
      }
      if (opts.include.roads && opts.data.roads) {
        const roads = opts.data.roads.filter(function(r) {
          if (r.type === "itinerary" || r.type === "jonction") return false;
          if (roadTypesSet && !roadTypesSet.has(r.type)) return false;
          return _passeLevel(r, Number.isInteger(r.level) ? r.level : 0) &&
                 (!mlOn || (Number.isInteger(r.level) ? r.level : 0) === level);
        });
        if (roads.length > 0) {
          body += '<Folder><name>🛣️ Tracés (' + roads.length + ')</name>';
          roads.forEach(function(r) {
            const styleId = _idStyleEtCollecte("road", r.type);
            body += _emitLineString(r, styleId);
          });
          body += '</Folder>';
        }
      }
      if (opts.include.jonctions && mlOn && opts.data.roads) {
        const jonctions = opts.data.roads.filter(function(r) {
          if (r.type !== "jonction") return false;
          // Une jonction va dans le folder de son fromLevel.
          const fl = Number.isInteger(r.fromLevel) ? r.fromLevel : 0;
          return fl === level;
        });
        if (jonctions.length > 0) {
          body += '<Folder><name>🪜 Jonctions (' + jonctions.length + ')</name>';
          jonctions.forEach(function(r) { body += _emitLineString(r, "road_jonction"); });
          body += '</Folder>';
        }
      }
      if (opts.include.zones && opts.data.zones) {
        const zones = opts.data.zones.filter(function(z) {
          if (zoneTypesSet && !zoneTypesSet.has(z.type)) return false;
          return _passeLevel(z, Number.isInteger(z.level) ? z.level : 0) &&
                 (!mlOn || (Number.isInteger(z.level) ? z.level : 0) === level);
        });
        if (zones.length > 0) {
          body += '<Folder><name>⬛ Zones (' + zones.length + ')</name>';
          zones.forEach(function(z) {
            const styleId = _idStyleEtCollecte("zone", z.type);
            body += _emitPolygon(z, styleId);
          });
          body += '</Folder>';
        }
      }
      // Structures : LineString pour les fronts, Polygon pour piliers/mur ; même filtre de niveau.
      if (opts.include.structures && opts.data.structures) {
        const structures = opts.data.structures.filter(function(s) {
          if (structureTypesSet && !structureTypesSet.has(s.type)) return false;
          return _passeLevel(s, Number.isInteger(s.level) ? s.level : 0) &&
                 (!mlOn || (Number.isInteger(s.level) ? s.level : 0) === level);
        });
        if (structures.length > 0) {
          body += '<Folder><name>🏛️ Structures (' + structures.length + ')</name>';
          structures.forEach(function(s) {
            const styleId = _idStyleEtCollecte("structure", s.type);
            // 🩸 Géométrie lue dans la légende (structures.js > _isPolylineType) : un test littéral front-1/front-2
            // envoyait une structure PERSONNALISÉE en ligne vers _emitPolygon, qui la jetait (2 points) ou la
            // refermait en polygone.
            if (_estLigneStructure(s)) {
              const nom = s.type === "front-1" ? "Front de taille 1ère masse"
                        : s.type === "front-2" ? "Front de taille 2e masse"
                        : _nomType(s.type);
              body += _emitLineString(s, styleId, nom);
            } else {
              body += _emitPolygon(s, styleId);
            }
          });
          body += '</Folder>';
        }
      }

      if (!body) return "";
      const folderName = mlOn ? ("🏗️ Niveau " + level) : "📚 Annotations";
      return '<Folder><name>' + folderName + '</name>' + body + '</Folder>';
    }

    let foldersByLevel = "";
    levels.forEach(function(lvl) {
      foldersByLevel += _folderForLevel(lvl);
    });

    // Itinéraire actif : hors des folders de niveau.
    let itineraireFolder = "";
    if (opts.include.itineraire && opts.data.roads) {
      const itis = opts.data.roads.filter(function(r) { return r.type === "itinerary"; });
      if (itis.length > 0) {
        itineraireFolder = '<Folder><name>🗺️ Itinéraire (' + itis.length + ')</name>';
        itis.forEach(function(r) { itineraireFolder += _emitLineString(r, "road_itinerary"); });
        itineraireFolder += '</Folder>';
      }
    }

    // Folder Secours (opts.secoursPlan) : par équipe zone (polygone ou halos), entrée (vert), étapes
    // numérotées (couleur d'équipe), sortie (rouge, orange si boucle), itinéraire. Les apps qui ignorent les
    // Folders imbriqués affichent les Placemarks à plat.
    let secoursFolder = "";
    let secoursStyles = "";
    if (opts.secoursPlan && typeof opts.secoursPlan === "object"
        && Array.isArray(opts.secoursPlan.groupes) && opts.secoursPlan.groupes.length > 0
        && Array.isArray(opts.secoursPalette) && opts.secoursPalette.length > 0) {
      const sec = _emitSecoursFolder(opts, opts.secoursPlan, opts.secoursPalette);
      secoursFolder = sec.folder;
      secoursStyles = sec.styles;
    }

    let stylesIcones = "";
    tagsRencontres.forEach(function(tag) {
      stylesIcones += _genererStyleIconePoint(tag, opts.iconesEmbarquees || null);
    });

    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<kml xmlns="http://www.opengis.net/kml/2.2">' +
        '<Document>' +
          '<name>' + _xmlEsc(planName) + '</name>' +
          '<description>' + _xmlEsc(
            "Export MyKTAMap — " + (opts.planAuthor || "KARMA") + " — " +
            new Date().toISOString().slice(0, 10) +
            " — Calibrage GPS via 2 points (rotation + scale + translation)"
          ) + '</description>' +
          _genererStylesKml(idsStyleCustom) +
          stylesIcones +
          secoursStyles +
          (groundOverlay || "") +
          foldersByLevel +
          itineraireFolder +
          secoursFolder +
        '</Document>' +
      '</kml>';
  }

  // ── Icônes embarquées ──────────
  // iconsToEmbed { tag → URL | Blob } → { tag → Blob PNG } des seules icônes LISIBLES. Cascade par tag : l'URL
  // fournie, puis l'icône du catalogue (`_ktaBuiltinIconUrls`, comme le repli de la carte), puis rien (le
  // <Style> visera alors l'icône par défaut).
  // 🩸 Le fichier s'appelle `<tag>.png` : une icône de plan en SVG, WebP ou JPEG y entrait telle quelle et
  // Google Earth ne l'affichait pas. Tout ce qui n'est pas un PNG est redessiné en PNG.
  async function _lireIcones(iconsToEmbed) {
    const out = {};
    if (!iconsToEmbed) return out;
    const catalogue = window._ktaBuiltinIconUrls || {};
    for (const tag of Object.keys(iconsToEmbed)) {
      const sources = [iconsToEmbed[tag]];
      if (catalogue[tag] && catalogue[tag] !== iconsToEmbed[tag]) sources.push(catalogue[tag]);
      for (const src of sources) {
        const png = await _iconeEnPng(src);
        if (png) { out[tag] = png; break; }
        console.warn("[KmzExport] icône « " + tag + " » illisible depuis", typeof src === "string" ? src.slice(0, 80) : "un Blob");
      }
    }
    return out;
  }

  async function _iconeEnPng(src) {
    let blob = null;
    try {
      if (src instanceof Blob) blob = src;
      else if (typeof src === "string" && src) {
        const r = await fetch(src);
        if (r.ok) blob = await r.blob();
      }
    } catch (e) { return null; }
    if (!blob || !blob.size) return null;
    const tete = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if (tete[0] === 0x89 && tete[1] === 0x50 && tete[2] === 0x4e && tete[3] === 0x47) return blob;
    // 🩸 Pas d'URL.createObjectURL sur un SVG puis drawImage sans décodage attendu : `img.decode()` d'abord.
    // Un type que le navigateur ne sait pas lire (texte d'une page 404 servie en 200) rend null.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const cote = 128;
      const w = img.naturalWidth || cote, h = img.naturalHeight || cote;
      const k = cote / Math.max(w, h);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = await new Promise(function(res) { canvas.toBlob(res, "image/png"); });
      canvas.width = canvas.height = 0;
      return png && png.size ? png : null;
    } catch (e) {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ── Génération KMZ (zip) ──────────
  // opts (en plus de genererKml) : imageBlob (null = pas de GroundOverlay), imageFilename (→ files/<basename>),
  //   iconsToEmbed { tag → URL/blob }, planCustomLegend (getSessionState() du niveau plan) et secoursPlan,
  //   embarqués dans `myktamap-extras.json` — ignoré par les apps tierces, relu par
  //   kmzImport.js > _extraireExtras vers plan-config.json > plan.customLegend : la légende voyage.
  // → Promise<Blob>.
  async function genererKmz(opts) {
    if (typeof JSZip !== "function") {
      throw new Error(window.I18n.t("kmz.err.jszipExport"));
    }
    const zip = new JSZip();
    // 🩸 Grands plans tuilés (croix rouges dans Google Earth sur iPhone) : le KML est écrit EN PREMIER
    // (certains lecteurs prennent le 1er .kml) et les images, déjà compressées, en STORE (aucun gain à les
    // dégonfler, seulement du temps et de la mémoire).
    const SANS_COMPRESSION = { compression: "STORE" };

    let imageBaseUrl = null, imageBasename = null;
    if (opts.include.image && opts.imageBlob && opts.imageFilename) {
      imageBasename = String(opts.imageFilename).split("/").pop() || "plan.png";
      imageBaseUrl = "files/" + imageBasename;
    }

    // Icônes lues AVANT le KML : il ne doit viser que des fichiers réellement embarqués.
    const icones = await _lireIcones(opts.iconsToEmbed);

    // KML d'abord : premier fichier de l'archive.
    const kml = genererKml(Object.assign({}, opts, { imageBaseUrl: imageBaseUrl,
      iconesEmbarquees: opts.iconsToEmbed ? new Set(Object.keys(icones)) : null }));
    zip.file("doc.kml", kml);

    if (imageBaseUrl) zip.folder("files").file(imageBasename, opts.imageBlob, SANS_COMPRESSION);
    // Tuiles du superoverlay V2 telles quelles (kmzPath référencé par les <Icon>).
    if (opts.include.image && opts.tilesOverlay && Array.isArray(opts.tilesOverlay.levels)) {
      opts.tilesOverlay.levels.forEach(function(lvl) {
        lvl.tiles.forEach(function(tu) { zip.file(tu.kmzPath, tu.blob, SANS_COMPRESSION); });
      });
    }

    // Toutes les icônes lues sont ajoutées ; le KML ne référence que celles utilisées.
    if (Object.keys(icones).length) {
      const filesFolder = zip.folder("files").folder("icons");
      Object.keys(icones).forEach(function(tag) {
        filesFolder.file(_nomIcone(tag) + ".png", icones[tag], SANS_COMPRESSION);
      });
    }

    // myktamap-extras.json : données MyKTAMap (customLegend, secoursPlan…) ignorées des apps tierces.
    // Wrapper extensible : d'autres extras s'ajoutent sans changer de version.
    const _hasExtras = !!(
      (opts.planCustomLegend && typeof opts.planCustomLegend === "object") ||
      (opts.secoursPlan      && typeof opts.secoursPlan      === "object")
    );
    if (_hasExtras) {
      const extras = {
        type:          "myktamap-kmz-extras",
        version:       1,
        exportedAt:    new Date().toISOString()
      };
      if (opts.planCustomLegend && typeof opts.planCustomLegend === "object") {
        extras.customLegend = opts.planCustomLegend;
      }
      if (opts.secoursPlan && typeof opts.secoursPlan === "object") {
        extras.secoursPlan = opts.secoursPlan;
      }
      zip.file("myktamap-extras.json", JSON.stringify(extras, null, 2));
    }

    return zip.generateAsync({
      type:               "blob",
      compression:        "DEFLATE",
      compressionOptions: { level: 6 },
      mimeType:           "application/vnd.google-earth.kmz"
    });
  }

  // ── Export global ──────────
  window.KmzExport = {
    buildTransform:  buildTransform,
    buildTransformCalib: buildTransformCalib,
    planToGps:       planToGps,
    gpsToPlan:       gpsToPlan,    // inverse pour import GPX
    MODELE_LOCAL:    MODELE_LOCAL,
    EQUI_HISTORIQUE: EQUI_HISTORIQUE,
    metresParDegre:  metresParDegre,
    decalerGps:      decalerGps,
    distanceM:       distanceM,
    memesPoints:     memesPoints,
    modeleSaisie:    modeleSaisie,
    ecartRecalage:   ecartRecalage,
    precisionCalage: precisionCalage,
    getCalibration:  getCalibration,
    setCalibration:  setCalibration,
    genererKml:      genererKml,
    genererKmz:      genererKmz,
    // Règles partagées avec l'export GeoJSON : mêmes libellés, géométries et couleurs que le KML.
    libelleType:       _nomType,
    estLigneStructure: _estLigneStructure,
    styleResolu:       _styleResolu
  };

  console.log("[KmzExport] Module chargé — API window.KmzExport prête");
})();
