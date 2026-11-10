/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// IDENTIFIANTS STABLES — js/ktaUid.js
// =========================
// Une identité qui survit au renommage, à la conversion, à l'annulation et à l'export pour chaque objet de
// carte (point, tracé, zone, structure) : `uid` + `updatedAt` (ms). Décisions : docs/ETUDE_UID.md.
//   genUid("pt") → "pt_lq3x9a_k2f8m1" · touch(obj) · ensure(obj, t, ts) · ensureAll(arr, t, ts, vus) ·
//   cloneNeuf · sansIdentite · marquerCalqueTexte · get/setTombstones · traces de copie de calque (tombstoneCopie,
//   get/setTracesCopie, remplacerTraces, oublierTracesCopie : 🔒 jamais dans un fichier) · fusionnerCalques ·
//   preparerImport (window.KtaUid).
// ⚠️ `id` d'un point reste son NOM (photos, favoris, liaisons, Secours) ; l'identité stable est `uid`.
// 🩸 Le préfixe dit la famille À LA CRÉATION seulement (un « rd_ » peut vivre dans les zones après
//   conversion) : ne jamais déduire la famille du préfixe.
// ⚠️ Unicité PAR STOCKAGE : un objet rapatrié d'un calque garde l'uid de l'original.
// 🩸 Migration de masse : des milliers d'objets dans la même milliseconde, ~1-3 % de doublons sur 20 000 avec
//   6 caractères aléatoires — ensureAll régénère tout uid déjà vu.
// Aucun stockage ni requête ici : le module pose des champs sur des objets que d'autres enregistrent.
// Garde-fou : scripts/check-uid.js

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
    // 🩸 Math.random().toString(36).slice(2, 8) peut rendre MOINS de 6 caractères (0.5 → "i") : tirage
    // caractère par caractère.
    for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * 36)];
    return s;
  }

  function genUid(type) {
    const t = FAMILLES[type] ? type : "pt";
    return t + "_" + Date.now().toString(36) + "_" + _alea6();
  }

  function _jour(ts) {
    // Même format que l'éditeur (UTC, AAAA-MM-JJ), lu par le rapport de sortie.
    return new Date(ts).toISOString().split("T")[0];
  }

  function _estPoint(obj) {
    return obj && !Array.isArray(obj.points);
  }

  // Une modification : horodate. Ne crée jamais d'uid (rôle d'ensure, appelé par les setters et à la création).
  function touch(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const now = Date.now();
    obj.updatedAt = now;
    if (_estPoint(obj)) obj.date_update = _jour(now);
    return obj;
  }

  // Pose ce qui manque, n'écrase jamais. `ts` = horodatage de repli d'un objet ancien (dernière sauvegarde de
  // sa session), sinon maintenant.
  function ensure(obj, type, ts) {
    if (!obj || typeof obj !== "object") return obj;
    if (typeof obj.uid !== "string" || !obj.uid) obj.uid = genUid(type);
    if (typeof obj.updatedAt !== "number" || !isFinite(obj.updatedAt)) {
      obj.updatedAt = (typeof ts === "number" && isFinite(ts)) ? ts : Date.now();
    }
    return obj;
  }

  // Sur un tableau ; `vus` (Set) peut être partagé entre les familles d'un même stockage. Un uid déjà vu est
  // régénéré sur le SECOND objet (doublon de migration, ou copie d'une ancienne version). → nombre touché.
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

  // Copie pour un DOUBLON voulu (tableur « Dupliquer ») : uid neuf.
  function cloneNeuf(obj, type) {
    const c = JSON.parse(JSON.stringify(obj));
    delete c.uid;
    ensure(c, type);
    return touch(c);
  }

  // Copie sans champs d'identité (exports vers des formats étrangers).
  function sansIdentite(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const c = Object.assign({}, obj);
    delete c.uid;
    delete c.updatedAt;
    return c;
  }

  // ── Lecture d'un fichier de calque (Générateurs) ──
  // Pose les uid manquants sur toutes les familles d'un JSON de calque. Rend le texte réécrit, ou l'original
  // s'il n'est pas un JSON exploitable (jamais de fichier perdu).
  function marquerCalqueTexte(texte) {
    let d;
    try { d = JSON.parse(texte); } catch (e) { return texte; }
    if (!d || typeof d !== "object" || Array.isArray(d)) return texte;
    const vus = new Set();
    let n = 0;
    n += ensureAll(d.data, "pt", undefined, vus);
    // Calques de l'import SIG : la famille des points s'appelle « points » (racine — pas la géométrie d'un tracé).
    if (Array.isArray(d.points) && d.points.length && d.points[0] && !Array.isArray(d.points[0]) &&
        typeof d.points[0] === "object" && !("x" in d) ) n += ensureAll(d.points, "pt", undefined, vus);
    n += ensureAll(d.editorPoints, "pt", undefined, vus);
    n += ensureAll(d.roads, "rd", undefined, vus);
    n += ensureAll(d.zones, "zn", undefined, vus);
    n += ensureAll(d.structures, "st", undefined, vus);
    return n > 0 ? JSON.stringify(d) : texte;
  }

  // ── Traces de suppression ──
  // Sans elles, une synchro « le dernier gagne » ressusciterait un objet supprimé ici mais présent ailleurs.
  // Une liste par plan ouvert, en mémoire ; sessionPersist l'écrit dans le payload et la recharge. Purge après
  // 90 jours (tout appareil synchronisé a eu le temps de la recevoir).
  const TTL_TRACE = 90 * 24 * 3600 * 1000;
  let _traces = new Map();   // uid → deletedAt (ms)

  // Jamais de trace pour l'itinéraire calculé (recréé à la demande, jamais synchronisé).
  function estTransitoire(obj) {
    return !!(obj && obj.type === "itinerary");
  }

  // ── Traces de COPIE de calque ──
  // Une copie de calque (CalqueSession) porte l'uid de l'objet du fichier du calque. 🔒 Sa trace ne doit JAMAIS
  // entrer dans un fichier : emportée par un export puis passée par « Fusion de calques » ou l'import ZIP du
  // Générateur (fusionnerCalques), elle détruirait l'original. Elle vit donc à part : getTombstones() (lu par
  // les exports, les imports et le Tableur) ne la rend jamais ; seuls la synchro (getTracesCopie) et la
  // sauvegarde LOCALE de la session la lisent. Elle tombe à la restitution du calque (oublierTracesCopie).
  // Les deux listes restent disjointes : un uid tracé comme copie le reste.
  let _tracesCopie = new Map();   // uid → { d: deletedAt (ms), calque }

  function _traceValide(t) {
    return !!(t && typeof t.uid === "string" && t.uid && typeof t.deletedAt === "number" && Number.isFinite(t.deletedAt));
  }
  function tombstone(uid, ts) {
    if (typeof uid !== "string" || !uid) return;
    const d = (typeof ts === "number" && Number.isFinite(ts)) ? ts : Date.now();
    const c = _tracesCopie.get(uid);
    if (c) { c.d = d; return; }
    _traces.set(uid, d);
  }
  function tombstoneCopie(uid, calque, ts) {
    if (typeof uid !== "string" || !uid || typeof calque !== "string" || !calque) return;
    _traces.delete(uid);
    _tracesCopie.set(uid, { d: (typeof ts === "number" && Number.isFinite(ts)) ? ts : Date.now(), calque: calque });
  }
  function untombstone(uid) { _traces.delete(uid); _tracesCopie.delete(uid); }
  function estTraceCopie(uid) { return _tracesCopie.has(uid); }
  function getTombstones() {
    const out = [];
    _traces.forEach(function (d, u) { out.push({ uid: u, deletedAt: d }); });
    return out;
  }
  // Remplace la liste (restauration, import) ; entrées invalides ignorées. Un uid déjà tracé comme copie n'y entre pas.
  function setTombstones(list) {
    _traces = new Map();
    (Array.isArray(list) ? list : []).forEach(function (t) {
      if (_traceValide(t) && !_tracesCopie.has(t.uid)) _traces.set(t.uid, t.deletedAt);
    });
  }
  // [{ uid, deletedAt, calque }] — synchro et sauvegarde locale seulement (🔒 jamais un fichier).
  function getTracesCopie() {
    const out = [];
    _tracesCopie.forEach(function (v, u) { out.push({ uid: u, deletedAt: v.d, calque: v.calque }); });
    return out;
  }
  function setTracesCopie(list) {
    _tracesCopie = new Map();
    (Array.isArray(list) ? list : []).forEach(function (t) {
      if (_traceValide(t) && typeof t.calque === "string" && t.calque) {
        _traces.delete(t.uid);
        _tracesCopie.set(t.uid, { d: t.deletedAt, calque: t.calque });
      }
    });
  }
  // Remplace les DEUX listes par `list` (fusion d'une synchro, d'un import sur plan partagé), chaque trace rangée :
  // copie si elle l'était déjà ou si `calqueDe(uid)` donne un calque, sinon ordinaire.
  function remplacerTraces(list, calqueDe) {
    const avant = _tracesCopie;
    _traces = new Map();
    _tracesCopie = new Map();
    (Array.isArray(list) ? list : []).forEach(function (t) {
      if (!_traceValide(t)) return;
      const c = (avant.get(t.uid) || {}).calque || (typeof calqueDe === "function" ? calqueDe(t.uid) : null);
      if (typeof c === "string" && c) _tracesCopie.set(t.uid, { d: t.deletedAt, calque: c });
      else _traces.set(t.uid, t.deletedAt);
    });
  }
  // Restitution du calque : ses traces de copie datées au plus tard de `avant` tombent. → uids retirés.
  function oublierTracesCopie(calque, avant) {
    const borne = (typeof avant === "number" && Number.isFinite(avant)) ? avant : Infinity;
    const out = [];
    _tracesCopie.forEach(function (v, u) { if (v.calque === calque && v.d <= borne) out.push(u); });
    out.forEach(function (u) { _tracesCopie.delete(u); });
    return out;
  }
  function purge(now) {
    const n0 = _traces.size + _tracesCopie.size, limite = (typeof now === "number" ? now : Date.now()) - TTL_TRACE;
    _traces.forEach(function (d, u) { if (d < limite) _traces.delete(u); });
    _tracesCopie.forEach(function (v, u) { if (v.d < limite) _tracesCopie.delete(u); });
    return n0 - _traces.size - _tracesCopie.size;
  }

  // ── Fusion de plusieurs fichiers (sessions, doublon de fusion du Générateur) ──
  //   - Fichiers DIFFÉRENTS, même uid = le même objet : le plus récent (updatedAt) gagne ; à égalité, le
  //     fichier le plus tardif.
  //   - MÊME fichier, même uid = deux objets (copie d'une ancienne version) : le second reçoit un uid neuf.
  //   - Une trace de suppression postérieure ou égale à la dernière modification l'emporte (pas de résurrection).
  //   - Un objet sans uid est gardé tel quel.
  // → { data, roads, zones, structures, fusionnes, supprimes }.
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

  // ── Import d'un fichier de session sur un plan partagé (synchronisé par uid + traces) ──
  // `local` et `fichier` : { data, roads, zones, structures, tombstones } (uid déjà posés sur le fichier).
  //   "ajouter"   : par uid, le plus récent gagne ; un objet effacé ici (trace postérieure ou égale) ne revient pas ;
  //                 rien d'existant ne disparaît ; traces locales inchangées, celles du fichier ignorées.
  //   "remplacer" : le fichier devient le contenu ; chaque objet local absent du fichier reçoit une trace (`now`),
  //                 les traces du fichier s'ajoutent, celles d'un uid gardé tombent.
  // ⚠️ Un objet du fichier qui gagne est HORODATÉ maintenant : la synchro n'envoie que ce qui a changé après son
  //   dernier envoi (un objet d'un vieux fichier ne partirait jamais), et le serveur garde la version la plus récente.
  // L'itinéraire calculé (estTransitoire) et les aperçus (_preview) restent tels qu'ici, jamais pris au fichier.
  // Fonction pure : les objets du fichier sont copiés. → { data, roads, zones, structures, tombstones,
  //   ajoutes, misAJour, supprimes }.
  function preparerImport(local, fichier, mode, now) {
    const FAM = ["data", "roads", "zones", "structures"];
    const t0 = (typeof now === "number" && Number.isFinite(now)) ? now : Date.now();
    const horsJeu = function (o) { return estTransitoire(o) || !!(o && o._preview); };
    const copie = function (a) {
      return Array.isArray(a) ? JSON.parse(JSON.stringify(a.filter(function (o) { return o && typeof o === "object"; }))) : [];
    };
    const marquer = function (o) { touch(o); o.updatedAt = t0; return o; };
    const loc = {}, fic = {}, garde = {};
    FAM.forEach(function (f) {
      const l = (local && Array.isArray(local[f])) ? local[f].filter(function (o) { return o && typeof o === "object"; }) : [];
      garde[f] = l.filter(horsJeu);
      loc[f] = l.filter(function (o) { return !horsJeu(o); });
      fic[f] = copie(fichier && fichier[f]).filter(function (o) { return !horsJeu(o) && typeof o.uid === "string" && o.uid; });
    });
    const traces = new Map();
    const lireTraces = function (liste) {
      (Array.isArray(liste) ? liste : []).forEach(function (t) {
        if (t && typeof t.uid === "string" && t.uid && typeof t.deletedAt === "number" && Number.isFinite(t.deletedAt)) {
          traces.set(t.uid, Math.max(traces.get(t.uid) || 0, t.deletedAt));
        }
      });
    };
    lireTraces(local && local.tombstones);
    const out = { ajoutes: 0, misAJour: 0, supprimes: 0 };
    const ici = new Map();   // uid → { fam, i } (objets d'ici)
    FAM.forEach(function (f) {
      loc[f].forEach(function (o, i) { if (typeof o.uid === "string" && o.uid) ici.set(o.uid, { fam: f, i: i }); });
    });

    if (mode === "remplacer") {
      const gardes = new Set();
      FAM.forEach(function (f) {
        fic[f].forEach(function (o) {
          const p = ici.get(o.uid);
          const avant = p ? loc[p.fam][p.i] : null;
          gardes.add(o.uid);
          if (!avant) { marquer(o); out.ajoutes++; }
          else if (avant.updatedAt !== o.updatedAt || p.fam !== f) { marquer(o); out.misAJour++; }
        });
      });
      lireTraces(fichier && fichier.tombstones);
      gardes.forEach(function (u) { traces.delete(u); });
      ici.forEach(function (p, u) {
        if (!gardes.has(u)) { traces.set(u, t0); out.supprimes++; }
      });
      FAM.forEach(function (f) { out[f] = fic[f].concat(garde[f]); });
    } else {
      const res = {};
      FAM.forEach(function (f) { res[f] = loc[f].slice(); });
      const pos = new Map(ici);
      FAM.forEach(function (f) {
        fic[f].forEach(function (o) {
          const d = traces.get(o.uid);
          if (d !== undefined && d >= (o.updatedAt || 0)) return;   // effacé ici après cette version
          const p = pos.get(o.uid);
          if (!p) {
            pos.set(o.uid, { fam: f, i: res[f].length });
            res[f].push(marquer(o));
            out.ajoutes++;
            return;
          }
          const avant = res[p.fam][p.i];
          if ((o.updatedAt || 0) <= (avant.updatedAt || 0)) return;
          marquer(o);
          out.misAJour++;
          if (p.fam === f) { res[f][p.i] = o; return; }
          res[p.fam][p.i] = null;   // conversion : l'objet suit la famille de la version gagnante
          pos.set(o.uid, { fam: f, i: res[f].length });
          res[f].push(o);
        });
      });
      FAM.forEach(function (f) { out[f] = res[f].filter(Boolean).concat(garde[f]); });
    }
    out.tombstones = Array.from(traces, function (e) { return { uid: e[0], deletedAt: e[1] }; });
    return out;
  }

  window.KtaUid = {
    preparerImport: preparerImport,
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
    tombstoneCopie: tombstoneCopie,
    estTraceCopie: estTraceCopie,
    getTracesCopie: getTracesCopie,
    setTracesCopie: setTracesCopie,
    remplacerTraces: remplacerTraces,
    oublierTracesCopie: oublierTracesCopie,
    purge: purge,
    TTL_TRACE: TTL_TRACE
  };
})();
