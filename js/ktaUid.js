/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// IDENTIFIANTS STABLES — js/ktaUid.js
// =========================
//
// 🎯 Rôle : donner à chaque objet de carte (point, tracé, zone, structure) une
// identité qui survit au renommage, à la conversion, à l'annulation et à
// l'export : `uid` + `updatedAt` (ms). Décisions : docs/ETUDE_UID.md (lot A).
//
//   genUid("pt")        → "pt_lq3x9a_k2f8m1"  (préfixe de famille À LA CRÉATION)
//   touch(obj)          → updatedAt = maintenant (+ date_update jour pour un point)
//   ensure(obj, t, ts)  → pose uid / updatedAt s'ils manquent (jamais d'écrasement)
//   ensureAll(arr, t, ts, vus) → idem sur un tableau, et RÉGÉNÈRE un uid déjà vu
//
// ⚠️ Points de vigilance :
//   - `id` d'un point reste son NOM (rétro-compat photos, favoris, liaisons,
//     Secours). L'identité stable est `uid`, champ à part.
//   - Le préfixe dit la famille à la création seulement : après une conversion
//     (décision 10), un « rd_ » peut vivre dans les zones. Ne jamais déduire la
//     famille du préfixe.
//   - Unicité PAR STOCKAGE : un objet rapatrié d'un calque garde l'uid de
//     l'original (session d'un côté, base de l'autre).
//   - Migration de masse : des milliers d'objets dans la même milliseconde.
//     Avec 6 caractères aléatoires, le risque de doublon n'est plus négligeable
//     (~1-3 % sur 20 000 objets) — ensureAll régénère tout uid déjà vu.
//   - Aucun stockage ici, aucune requête : le module ne fait que poser des
//     champs sur des objets que d'autres enregistrent.

(function () {
  "use strict";

  const FAMILLES = { pt: 1, rd: 1, zn: 1, st: 1 };
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

  function _alea6() {
    let s = "";
    try {
      const c = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto : null;
      if (c) {
        const b = new Uint8Array(6);
        c.getRandomValues(b);
        for (let i = 0; i < 6; i++) s += ALPHABET[b[i] % 36];
        return s;
      }
    } catch (e) { /* repli ci-dessous */ }
    // 🩸 Math.random().toString(36).slice(2, 8) peut rendre MOINS de 6
    // caractères (0.5 → "i") : on tire caractère par caractère.
    for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * 36)];
    return s;
  }

  function genUid(type) {
    const t = FAMILLES[type] ? type : "pt";
    return t + "_" + Date.now().toString(36) + "_" + _alea6();
  }

  function _jour(ts) {
    // Même format que l'éditeur (UTC, AAAA-MM-JJ) : lu par le rapport de sortie.
    return new Date(ts).toISOString().split("T")[0];
  }

  function _estPoint(obj) {
    return obj && !Array.isArray(obj.points);
  }

  // Une modification : horodate l'objet. Ne crée jamais d'uid (c'est le rôle
  // d'ensure, appelé par les setters et à la création).
  function touch(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const now = Date.now();
    obj.updatedAt = now;
    if (_estPoint(obj)) obj.date_update = _jour(now);
    return obj;
  }

  // Pose ce qui manque, n'écrase jamais. `ts` = horodatage de repli pour un
  // objet ancien (date de dernière sauvegarde de sa session), sinon maintenant.
  function ensure(obj, type, ts) {
    if (!obj || typeof obj !== "object") return obj;
    if (typeof obj.uid !== "string" || !obj.uid) obj.uid = genUid(type);
    if (typeof obj.updatedAt !== "number" || !isFinite(obj.updatedAt)) {
      obj.updatedAt = (typeof ts === "number" && isFinite(ts)) ? ts : Date.now();
    }
    return obj;
  }

  // Sur un tableau. `vus` (Set) peut être partagé entre plusieurs familles d'un
  // même stockage. Un uid déjà vu est régénéré sur le SECOND objet : doublon de
  // migration de masse, ou copie faite par une ancienne version de l'app.
  // Rend le nombre d'objets touchés (uid posé ou régénéré).
  function ensureAll(arr, type, ts, vus) {
    if (!Array.isArray(arr)) return 0;
    const seen = vus || new Set();
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      if (!o || typeof o !== "object") continue;
      const avait = (typeof o.uid === "string" && o.uid) ? o.uid : null;
      if (avait && seen.has(avait)) {
        o.uid = genUid(type);
        while (seen.has(o.uid)) o.uid = genUid(type);
        n++;
      } else if (!avait) {
        ensure(o, type, ts);
        while (seen.has(o.uid)) o.uid = genUid(type);
        n++;
      }
      if (typeof o.updatedAt !== "number" || !isFinite(o.updatedAt)) {
        o.updatedAt = (typeof ts === "number" && isFinite(ts)) ? ts : Date.now();
      }
      seen.add(o.uid);
    }
    return n;
  }

  // Copie d'un objet pour un DOUBLON voulu (tableur « Dupliquer ») : uid neuf.
  function cloneNeuf(obj, type) {
    const c = JSON.parse(JSON.stringify(obj));
    delete c.uid;
    ensure(c, type);
    return touch(c);
  }

  // Copie sans les champs d'identité (exports vers des formats étrangers).
  function sansIdentite(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const c = Object.assign({}, obj);
    delete c.uid;
    delete c.updatedAt;
    return c;
  }

  // ── Lecture d'un fichier de calque (Générateurs) ──
  // Pose les uid manquants sur toutes les familles d'un JSON de calque, en
  // gardant ceux qui existent. Rend le texte réécrit, ou le texte d'origine
  // s'il n'est pas un JSON exploitable (jamais de fichier perdu pour ça).
  function marquerCalqueTexte(texte) {
    let d;
    try { d = JSON.parse(texte); } catch (e) { return texte; }
    if (!d || typeof d !== "object" || Array.isArray(d)) return texte;
    const vus = new Set();
    let n = 0;
    n += ensureAll(d.data, "pt", undefined, vus);
    // Calques produits par l'import SIG : la famille des points s'appelle « points »
    // (au niveau racine — à ne pas confondre avec la géométrie d'un tracé).
    if (Array.isArray(d.points) && d.points.length && d.points[0] && !Array.isArray(d.points[0]) &&
        typeof d.points[0] === "object" && !("x" in d) ) n += ensureAll(d.points, "pt", undefined, vus);
    n += ensureAll(d.editorPoints, "pt", undefined, vus);
    n += ensureAll(d.roads, "rd", undefined, vus);
    n += ensureAll(d.zones, "zn", undefined, vus);
    n += ensureAll(d.structures, "st", undefined, vus);
    return n > 0 ? JSON.stringify(d) : texte;
  }

  window.KtaUid = {
    genUid: genUid,
    touch: touch,
    ensure: ensure,
    ensureAll: ensureAll,
    cloneNeuf: cloneNeuf,
    sansIdentite: sansIdentite,
    marquerCalqueTexte: marquerCalqueTexte
  };
})();
