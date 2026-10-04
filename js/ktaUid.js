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

  // ── Traces de suppression (lot B, ETUDE_UID décision 8) ──
  // Sans elles, une synchro « le dernier gagne » ressusciterait un objet
  // supprimé ici mais encore présent ailleurs. Une liste par plan ouvert, en
  // mémoire ; sessionPersist l'écrit dans le payload et la recharge.
  // Purge après 90 jours : au-delà, tout appareil qui se synchronise a eu le
  // temps de la recevoir (règle d'exploitation, à confirmer côté backend).
  const TTL_TRACE = 90 * 24 * 3600 * 1000;
  let _traces = new Map();   // uid → deletedAt (ms)

  // Objets qui ne laissent JAMAIS de trace : l'itinéraire calculé (recréé à la
  // demande, jamais synchronisé).
  function estTransitoire(obj) {
    return !!(obj && obj.type === "itinerary");
  }

  function tombstone(uid, ts) {
    if (typeof uid !== "string" || !uid) return;
    _traces.set(uid, (typeof ts === "number" && isFinite(ts)) ? ts : Date.now());
  }
  function untombstone(uid) { _traces.delete(uid); }
  function getTombstones() {
    const out = [];
    _traces.forEach(function (d, u) { out.push({ uid: u, deletedAt: d }); });
    return out;
  }
  // Remplace la liste (restauration, import). Entrées invalides ignorées.
  function setTombstones(list) {
    _traces = new Map();
    (Array.isArray(list) ? list : []).forEach(function (t) {
      if (t && typeof t.uid === "string" && t.uid && typeof t.deletedAt === "number" && isFinite(t.deletedAt)) {
        _traces.set(t.uid, t.deletedAt);
      }
    });
  }
  function purge(now) {
    const n0 = _traces.size, limite = (typeof now === "number" ? now : Date.now()) - TTL_TRACE;
    _traces.forEach(function (d, u) { if (d < limite) _traces.delete(u); });
    return n0 - _traces.size;
  }

  // ── Fusion de plusieurs fichiers (lot B, décision 7) ──
  // Fusion de sessions et doublon de fusion du Générateur : même règle.
  //   - Deux objets de fichiers DIFFÉRENTS au même uid = le même objet : le plus
  //     récent (updatedAt) gagne ; à égalité, le fichier le plus tardif.
  //   - Deux objets d'un MÊME fichier au même uid = deux objets distincts (copie
  //     d'une ancienne version) : le second reçoit un uid neuf, rien n'est perdu.
  //   - Une trace de suppression (d'un des fichiers) postérieure ou égale à la
  //     dernière modification de l'objet l'emporte : il ne ressuscite pas.
  //   - Un objet sans uid est gardé tel quel (fichier d'une version antérieure).
  // Rend { data, roads, zones, structures, fusionnes, supprimes }.
  function fusionnerCalques(jsons) {
    const FAM = [["data", "pt"], ["roads", "rd"], ["zones", "zn"], ["structures", "st"]];
    const out = { data: [], roads: [], zones: [], structures: [], fusionnes: 0, supprimes: 0 };
    const position = {};   // uid → { fam, idx }
    const traces = new Map();
    (jsons || []).forEach(function (json) {
      if (!json || typeof json !== "object") return;
      (Array.isArray(json.tombstones) ? json.tombstones : []).forEach(function (t) {
        if (t && typeof t.uid === "string" && typeof t.deletedAt === "number") {
          traces.set(t.uid, Math.max(traces.get(t.uid) || 0, t.deletedAt));
        }
      });
      const vusFichier = new Set();
      FAM.forEach(function (f) {
        const src = f[0] === "data"
          ? (Array.isArray(json.data) && json.data.length ? json.data
             : (Array.isArray(json.editorPoints) ? json.editorPoints : []))
          : (Array.isArray(json[f[0]]) ? json[f[0]] : []);
        src.forEach(function (o0) {
          if (!o0 || typeof o0 !== "object") return;
          const o = o0;
          if (typeof o.uid !== "string" || !o.uid) { out[f[0]].push(o); return; }
          if (vusFichier.has(o.uid)) {
            o.uid = genUid(f[1]);
            while (vusFichier.has(o.uid) || position[o.uid]) o.uid = genUid(f[1]);
          }
          vusFichier.add(o.uid);
          const deja = position[o.uid];
          if (!deja) {
            position[o.uid] = { fam: f[0], idx: out[f[0]].length };
            out[f[0]].push(o);
            return;
          }
          out.fusionnes++;
          const ancien = out[deja.fam][deja.idx];
          if ((o.updatedAt || 0) >= (ancien.updatedAt || 0)) {
            if (deja.fam === f[0]) out[f[0]][deja.idx] = o;
            else {   // l'objet a changé de famille (conversion) : il suit la version gagnante
              out[deja.fam][deja.idx] = null;
              position[o.uid] = { fam: f[0], idx: out[f[0]].length };
              out[f[0]].push(o);
            }
          }
        });
      });
    });
    FAM.forEach(function (f) {
      out[f[0]] = out[f[0]].filter(function (o) {
        if (!o) return false;
        const d = (typeof o.uid === "string") ? traces.get(o.uid) : undefined;
        if (d !== undefined && d >= (o.updatedAt || 0)) { out.supprimes++; return false; }
        return true;
      });
    });
    return out;
  }

  window.KtaUid = {
    fusionnerCalques: fusionnerCalques,
    genUid: genUid,
    touch: touch,
    ensure: ensure,
    ensureAll: ensureAll,
    cloneNeuf: cloneNeuf,
    sansIdentite: sansIdentite,
    marquerCalqueTexte: marquerCalqueTexte,
    estTransitoire: estTransitoire,
    tombstone: tombstone,
    untombstone: untombstone,
    getTombstones: getTombstones,
    setTombstones: setTombstones,
    purge: purge,
    TTL_TRACE: TTL_TRACE
  };
})();
