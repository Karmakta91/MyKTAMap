/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// CONFADMIN.JS — Script de confadmin.html (outil de génération de data/index.json)
// =========================
// Fichier séparé pour la CSP stricte (script-src sans 'unsafe-inline'), chargé en fin de body.
// Garde-fou : check-connexion-serveur.js (même validation que js/ktaExtensions.js).

(function() {
  "use strict";

  // ── État ──────────
  const _plans = [];        // { id, name, version, author, multiLevel, tiledV2, tags, folder }
  const _folders = [];      // { id, name, color } — dossiers déclarés par l'index
  const _FOLDER_COLORS = ["#8cb4ff", "#f4c542", "#7ed6a5", "#ff9f7a", "#c39bff", "#7fd8e6", "#ff7aa8", "#b8c4d6"];
  function _slugDossier(nom) {
    return String(nom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "dossier";
  }
  let _liaisonsReprises = null; // liaisons d'un index.json rechargé (cf _construire)
  let _links = [];          // liaisons source (objets du registre, intacts)
    const _linkSel = {};      // linkId → bool (cochée)
  const _mapping = {};      // planId d'origine → id de pack ("" = ignorer)
  const _planNamesVus = {}; // planId d'origine → dernier planName vu (affichage mapping)

  function $(id) { return document.getElementById(id); }
  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  // ⚠️ MÊMES RÈGLES QUE `PlanRegistry.setTags` (trim, 24 caractères, dédup sans casse, 12 max) : sinon ConfAdmin
  // publierait des tags que l'app rognerait en silence. Virgules ou points-virgules acceptés.
  function _normTags(v) {
    const vus = {};
    return String(v == null ? "" : v).split(/[,;]/)
      .map(function(t) { return t.trim().slice(0, 24); })
      .filter(function(t) {
        if (!t) return false;
        const k = t.toLowerCase();
        if (vus[k]) return false;
        vus[k] = true;
        return true;
      })
      .slice(0, 12);
  }

  // Même assainissement que le moteur (main.js > decouvrirPlansServeur).
  function _sanitId(s) { return String(s || "").replace(/[^a-z0-9_-]/gi, "_"); }
  // Même règle que l'app (main.js > decouvrirPlansServeur) : chemin relatif .zip, sans « .. » ni « / » initial ;
  // une saisie refusée retombe sur data/<id>.zip.
  function _zipValide(z) { return /^[\w./-]+\.zip$/i.test(z || "") && z.indexOf("..") < 0 && z.charAt(0) !== "/"; }
  function _cheminZip(p) { return _zipValide(p.zip) ? p.zip : "data/" + p.id + ".zip"; }
  function _slug(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\.zip$/i, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "plan";
  }
  function _statut(el, msg, err) {
    el.innerHTML = msg ? '<div class="kta-ca-status' + (err ? " kta-ca-err" : "") + '">' + msg + "</div>" : "";
  }

  // ── 1. Plans ──────────
  async function _lireZip(file) {
    if (typeof JSZip === "undefined") throw new Error("lib/jszip.min.js introuvable (ouvre la page depuis l'instance)");
    const zip = await JSZip.loadAsync(file);
    // plan-config.json à la racine du ZIP, sinon le moins profond (ZIP re-dossierisé).
    let entry = zip.file("plan-config.json");
    if (!entry) {
      let best = null;
      zip.forEach(function(chemin, f) {
        if (/(^|\/)plan-config\.json$/.test(chemin) && !f.dir) {
          if (!best || chemin.split("/").length < best.name.split("/").length) best = f;
        }
      });
      entry = best;
    }
    if (!entry) throw new Error("pas de plan-config.json dans « " + file.name + " »");
    const cfg = JSON.parse(await entry.async("string"));
    const plan = cfg && cfg.plan ? cfg.plan : {};
    return {
      id:         _slug(file.name),
      // Par défaut, le plan est servi tel quel : son ZIP, sous son nom s'il est sûr pour une URL.
      format:     "zip",
      zip:        /^[\w.-]+\.zip$/i.test(file.name) ? "data/" + file.name : "",
      name:       plan.name || _slug(file.name),
      version:    plan.version || "",
      author:     plan.author || "",
      multiLevel: plan.multiLevel === true,
      tiledV2:    plan.tiledV2 === true || !!cfg.tiling,  // même détection que config.js
      tags:       Array.isArray(plan.tags) ? plan.tags.join(", ") : "",
      folder:     ""
    };
  }

  async function _ajouterZips(files) {
    const errs = [];
    for (const f of files) {
      if (!/\.zip$/i.test(f.name)) continue;
      try {
        const p = await _lireZip(f);
        // Dédoublonnage de l'id.
        let base = p.id, n = 2;
        while (_plans.some(function(x) { return x.id === p.id; })) p.id = base + "-" + (n++);
        _plans.push(p);
      } catch(e) { errs.push(e.message); }
    }
    _statut($("caPlansStatus"),
      errs.length ? "⚠️ " + errs.join(" · ") : (_plans.length + " plan(s) dans la liste"), errs.length > 0);
    _renderPlans(); _renderMapping(); _renderOut();
  }

  function _renderPlans() {
    const tb = $("caPlansBody");
    $("caPlansTable").style.display = _plans.length ? "" : "none";
    tb.innerHTML = "";
    _plans.forEach(function(p, i) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td><button class="kta-ca-mv" data-mv="-1" data-i="' + i + '" title="Monter">▲</button>' +
        '<button class="kta-ca-mv" data-mv="1" data-i="' + i + '" title="Descendre">▼</button></td>' +
        '<td><input type="text" data-f="id" data-i="' + i + '" value="' + _esc(p.id) + '"></td>' +
        // Format : l'archive telle quelle (recommandé) ou un dossier décompressé (historique).
        '<td style="width:170px;"><select data-f="format" data-i="' + i + '">' +
          '<option value="zip"' + (p.format === "zip" ? " selected" : "") + '>📦 ZIP</option>' +
          '<option value="dossier"' + (p.format !== "zip" ? " selected" : "") + '>📂 Dossier</option></select>' +
          (p.format === "zip"
            ? '<input type="text" data-f="zip" data-i="' + i + '" placeholder="data/' + _esc(p.id) + '.zip" title="Chemin du ZIP sur le serveur, relatif à l\'app" value="' + _esc(p.zip || "") + '" style="margin-top:4px;">'
            : '<div class="kta-ca-chemin">' + _esc(p.path || ("data/" + p.id)) + '/</div>') + '</td>' +
        '<td><input type="text" data-f="name" data-i="' + i + '" value="' + _esc(p.name) + '"></td>' +
        '<td style="width:80px;"><input type="text" data-f="version" data-i="' + i + '" value="' + _esc(p.version) + '"></td>' +
        '<td style="width:110px;"><input type="text" data-f="author" data-i="' + i + '" value="' + _esc(p.author) + '"></td>' +
        '<td style="width:150px;">' + _selectDossier(i, p.folder) + '</td>' +
        '<td style="width:170px;"><input type="text" data-f="tags" data-i="' + i + '" placeholder="calcaire, carrière" title="Séparés par des virgules — 12 max, 24 caractères chacun" value="' + _esc(p.tags || "") + '"></td>' +
        "<td>" + (p.tiledV2 ? '<span class="kta-ca-badge">V2</span>' : "") +
                 (p.multiLevel ? '<span class="kta-ca-badge">Multi-LVL</span>' : "") + "</td>" +
        '<td><button class="kta-ca-x" data-x="' + i + '" title="Retirer">✕</button></td>';
      tb.appendChild(tr);
    });
  }

  $("caPlansBody").addEventListener("input", function(e) {
    const f = e.target.getAttribute("data-f");
    if (!f) return;
    _plans[Number(e.target.getAttribute("data-i"))][f] = e.target.value;
    _renderMapping(); _renderOut();
  });
  // La colonne Dossier est un <select> : événement change, pas input.
  $("caPlansBody").addEventListener("change", function(e) {
    const f = e.target.getAttribute("data-f");
    if (f === "format") {   // le champ de chemin change avec le format
      _plans[Number(e.target.getAttribute("data-i"))].format = e.target.value;
      _renderPlans(); _renderOut();
      return;
    }
    if (f !== "folder") return;
    _plans[Number(e.target.getAttribute("data-i"))].folder = e.target.value;
    _renderOut();
  });

  // ── Dossiers déclarés par l'index ──
  function _selectDossier(i, val) {
    return '<select data-f="folder" data-i="' + i + '"><option value="">—</option>' +
      _folders.map(function(d) { return '<option value="' + _esc(d.id) + '"' + (d.id === val ? " selected" : "") + '>' + _esc(d.name) + '</option>'; }).join("") +
      '</select>';
  }
  function _renderFolders() {
    const tb = $("caFoldersBody");
    $("caFoldersTable").style.display = _folders.length ? "" : "none";
    tb.innerHTML = "";
    _folders.forEach(function(d, i) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td><button class="kta-ca-mv" data-fmv="-1" data-i="' + i + '" title="Monter">▲</button>' +
        '<button class="kta-ca-mv" data-fmv="1" data-i="' + i + '" title="Descendre">▼</button></td>' +
        '<td style="width:160px;"><input type="text" data-df="id" data-i="' + i + '" value="' + _esc(d.id) + '"></td>' +
        '<td><input type="text" data-df="name" data-i="' + i + '" maxlength="40" value="' + _esc(d.name) + '"></td>' +
        '<td style="width:120px;"><input type="color" data-df="color" data-i="' + i + '" value="' + _esc(d.color || "#8cb4ff") + '" style="width:44px; height:28px; padding:0; border:none; background:none; cursor:pointer;"></td>' +
        '<td><button class="kta-ca-x" data-fx="' + i + '" title="Retirer le dossier (ses plans repassent sans dossier)">✕</button></td>';
      tb.appendChild(tr);
    });
  }
  $("caFoldersBody").addEventListener("input", function(e) {
    const f = e.target.getAttribute("data-df");
    if (!f) return;
    const i = Number(e.target.getAttribute("data-i"));
    const avant = _folders[i].id;
    _folders[i][f] = e.target.value;
    if (f === "id") {
      // Un id qui change entraîne les plans qui le référencent.
      const apres = _slugDossier(e.target.value);
      _folders[i].id = apres;
      _plans.forEach(function(p) { if (p.folder === avant) p.folder = apres; });
    }
    _renderPlans(); _renderOut();
  });
  $("caFoldersBody").addEventListener("click", function(e) {
    const x = e.target.getAttribute("data-fx"), mv = e.target.getAttribute("data-fmv");
    if (x != null) {
      const id = _folders[Number(x)].id;
      _folders.splice(Number(x), 1);
      _plans.forEach(function(p) { if (p.folder === id) p.folder = ""; });
    } else if (mv != null) {
      const i = Number(e.target.getAttribute("data-i")), j = i + Number(mv);
      if (j < 0 || j >= _folders.length) return;
      const t = _folders[i]; _folders[i] = _folders[j]; _folders[j] = t;
    } else return;
    _renderFolders(); _renderPlans(); _renderOut();
  });
  $("caFolderAdd").addEventListener("click", function() {
    const n = _folders.length + 1;
    let id = "dossier_" + n, k = n;
    while (_folders.some(function(d) { return d.id === id; })) id = "dossier_" + (++k);
    _folders.push({ id: id, name: "Dossier " + n, color: _FOLDER_COLORS[_folders.length % _FOLDER_COLORS.length] });
    _renderFolders(); _renderPlans(); _renderOut();
  });
  $("caFlagFoldersDefault").addEventListener("change", function() { _renderOut(); });
  $("caFlagSitePlansHidden").addEventListener("change", function() { _renderOut(); });
  $("caPlansBody").addEventListener("click", function(e) {
    const x = e.target.getAttribute("data-x"), mv = e.target.getAttribute("data-mv");
    if (x != null) { _plans.splice(Number(x), 1); }
    else if (mv != null) {
      const i = Number(e.target.getAttribute("data-i")), j = i + Number(mv);
      if (j < 0 || j >= _plans.length) return;
      const t = _plans[i]; _plans[i] = _plans[j]; _plans[j] = t;
    } else return;
    _renderPlans(); _renderMapping(); _renderOut();
  });

  const drop = $("caDrop");
  drop.addEventListener("click", function() { $("caZipInput").click(); });
  $("caZipInput").addEventListener("change", function(e) { _ajouterZips(Array.from(e.target.files || [])); e.target.value = ""; });
  ["dragover", "dragenter"].forEach(function(ev) {
    drop.addEventListener(ev, function(e) { e.preventDefault(); drop.classList.add("kta-ca-over"); });
  });
  ["dragleave", "drop"].forEach(function(ev) {
    drop.addEventListener(ev, function(e) { e.preventDefault(); drop.classList.remove("kta-ca-over"); });
  });
  drop.addEventListener("drop", function(e) { _ajouterZips(Array.from((e.dataTransfer || {}).files || [])); });

  $("caAddManual").addEventListener("click", function() {
    _plans.push({ id: "plan-" + (_plans.length + 1), format: "zip", zip: "", name: "Nouveau plan", version: "", author: "",
                  multiLevel: false, tiledV2: false, tags: "" });
    _renderPlans(); _renderMapping(); _renderOut();
  });


  // ── Reprendre un index.json existant ──────────
  // Pour modifier un parc déjà en ligne sans redéposer tous les ZIP ni retaper chaque nom (une faute sur un `id`
  // casse le chemin du plan) : l'index publié fait foi, liaisons comprises (ce navigateur ne peut pas les
  // reconstruire, cf. _construire).
  $("caLoadIndex").addEventListener("click", function() { $("caIndexInput").click(); });
  $("caIndexInput").addEventListener("change", function(e) {
    const f = (e.target.files || [])[0]; e.target.value = "";
    if (!f) return;
    const r = new FileReader();
    r.onload = function() {
      try {
        const d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.plans)) {
          _statut($("caPlansStatus"), "Format non reconnu : il manque un tableau « plans » (attendu : un data/index.json).", true);
          return;
        }
        _plans.length = 0;
        d.plans.forEach(function(x) {
          if (!x || !x.id) return;
          _plans.push({
            id:         String(x.id),
            // Format et chemin d'origine conservés (un `path` personnalisé serait perdu).
            format:     x.zip ? "zip" : "dossier",
            zip:        x.zip ? String(x.zip) : "",
            path:       x.path ? String(x.path) : "",
            name:       String(x.name || x.id),
            version:    x.version ? String(x.version) : "",
            author:     x.author  ? String(x.author)  : "",
            multiLevel: x.multiLevel === true,
            tiledV2:    x.tiledV2 === true,
            tags:       Array.isArray(x.tags) ? x.tags.join(", ") : "",
            folder:     x.folder ? String(x.folder) : ""
          });
        });
        // Dossiers déclarés ; un plan rangé dans un dossier absent devient sans dossier.
        _folders.length = 0;
        (Array.isArray(d.folders) ? d.folders : []).forEach(function(x) {
          if (!x || !x.name) return;
          _folders.push({ id: x.id ? String(x.id) : _slugDossier(x.name), name: String(x.name).slice(0, 40), color: x.color ? String(x.color) : _FOLDER_COLORS[_folders.length % _FOLDER_COLORS.length] });
        });
        _plans.forEach(function(p) { if (p.folder && !_folders.some(function(x) { return x.id === p.folder; })) p.folder = ""; });
        $("caFlagFoldersDefault").checked = !!(d.config && d.config.plansViewDefault === "folders");
        $("caFlagSitePlansHidden").checked = !!(d.config && d.config.sitePlansHiddenDefault === true);
        _renderFolders();
        const c = d.config || {};
        $("caSubtitle").value        = c.subtitle || "";
        $("caFlagServerOnly").checked = c.serverPlansOnly === true;
        $("caFlagNoGen").checked      = c.disableGenerator === true;
        // 🔒 Le hash repris est CONSERVÉ tel quel, champ vide : un hash ne redevient pas un mot de passe. Taper dans
        // le champ REMPLACE le hash.
        _accessHash = (typeof c.accessHash === "string" && /^[0-9a-f]{64}$/.test(c.accessHash.trim().toLowerCase()))
          ? c.accessHash.trim().toLowerCase() : "";
        const _etatPwd = $("caAccessPwdEtat");
        if (_etatPwd) {
          _etatPwd.textContent = _accessHash
            ? "🔑 mot de passe existant conservé (" + _accessHash.slice(0, 16) + "…) — tape ici pour le remplacer"
            : "";
        }
        // Connexion serveur reprise telle quelle, même invalide (montrée pour être corrigée ; l'export la refuse tant
        // qu'elle l'est).
        const sc = c.serverConnection;
        $("caCnxState").value = (sc && sc.state === "on") ? "on" : "off";
        $("caCnxApi").value = (sc && typeof sc.api === "string") ? sc.api : "";
        $("caCnxModules").value = (sc && Array.isArray(sc.modules)) ? sc.modules.join("\n") : "";
        $("caCnxTransparence").value = (sc && typeof sc.transparence === "string") ? sc.transparence : "";
        if (sc && sc.state === "on") $("caCnx").open = true;
        _liaisonsReprises = (d.liaisons && Array.isArray(d.liaisons.links) && d.liaisons.links.length)
          ? d.liaisons : null;
        _statut($("caPlansStatus"),
          "✅ " + _plans.length + " plan(s) repris depuis « " + f.name + " »" +
          (_liaisonsReprises ? " · " + _liaisonsReprises.links.length + " liaison(s) conservée(s) telles quelles" : "") +
          " — les ZIPs ne sont pas nécessaires pour éditer les tags.");
        _renderPlans(); _renderMapping(); _renderOut();
      } catch(err) {
        _statut($("caPlansStatus"), "Lecture impossible : " + err.message, true);
      }
    };
    r.readAsText(f);
  });

  // 🔒 SHA-256 du mot de passe d'instance, recalculé à la volée, jamais stocké : `_accessHash` ne contient QUE le
  // hash, la valeur tapée reste dans le champ (RAM, le temps de l'onglet).
  // 🩸 `crypto.subtle` n'existe qu'en contexte SÛR (https ou localhost) : en `file://` ou HTTP simple, on le DIT,
  // sinon le déployeur publierait un index sans hash en croyant avoir posé un mot de passe.
  let _accessHash = "";
  async function _majAccessHash() {
    const el = $("caAccessPwd"), etat = $("caAccessPwdEtat");
    const v = (el && el.value ? el.value : "").trim();
    if (!v) {
      _accessHash = "";
      if (etat) etat.textContent = "";
      _renderOut();
      return;
    }
    if (!window.crypto || !window.crypto.subtle) {
      _accessHash = "";
      if (etat) etat.textContent = "⚠️ Impossible de calculer le hash : ouvre cette page en HTTPS (ou depuis localhost). Le mot de passe ne sera PAS publié.";
      _renderOut();
      return;
    }
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
      _accessHash = Array.from(new Uint8Array(buf))
        .map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
      if (etat) etat.textContent = "✅ hash calculé : " + _accessHash.slice(0, 16) + "…";
    } catch (e) {
      _accessHash = "";
      if (etat) etat.textContent = "⚠️ Calcul impossible : " + (e.message || e);
    }
    _renderOut();
  }
  $("caAccessPwd").addEventListener("input", function() { _majAccessHash(); });

  // ── 2. Liaisons ──────────
  function _poserLiaisons(reg, origine) {
    const links = (reg && Array.isArray(reg.links)) ? reg.links : [];
    if (!links.length) { _statut($("caLinksStatus"), "Aucune liaison trouvée (" + origine + ")", true); return; }
    _links = links;
    links.forEach(function(l) {
      [l.a, l.b].forEach(function(s) {
        if (s && s.planId && !(s.planId in _planNamesVus)) _planNamesVus[s.planId] = s.planName || s.planId;
      });
      if (!(l.id in _linkSel)) _linkSel[l.id] = true;
    });
    _statut($("caLinksStatus"), links.length + " liaison(s) chargée(s) — " + origine);
    _renderMapping(); _renderLinks(); _renderOut();
  }

  $("caReadLocal").addEventListener("click", function() {
    try {
      const raw = localStorage.getItem("myktamap_interplan_links_v1");
      if (!raw) { _statut($("caLinksStatus"), "Rien dans ce navigateur — ouvre cette page depuis TON instance MyKTAMap (même adresse), ou charge un export de profil.", true); return; }
      _poserLiaisons(JSON.parse(raw), "profil de ce navigateur");
    } catch(e) { _statut($("caLinksStatus"), "Lecture impossible : " + e.message, true); }
  });

  $("caLoadProfile").addEventListener("click", function() { $("caProfileInput").click(); });
  $("caProfileInput").addEventListener("change", function(e) {
    const f = (e.target.files || [])[0]; e.target.value = "";
    if (!f) return;
    const r = new FileReader();
    r.onload = function() {
      try {
        const d = JSON.parse(r.result);
        // Export de profil complet (sections.preferences) OU registre brut {links:[]}.
        let reg = null;
        if (d && d.type === "myktamap-profile-export" && d.sections && d.sections.preferences) {
          reg = d.sections.preferences["myktamap_interplan_links_v1"] || null;
          if (typeof reg === "string") reg = JSON.parse(reg);
        } else if (d && Array.isArray(d.links)) {
          reg = d;
        }
        if (!reg) { _statut($("caLinksStatus"), "Format non reconnu (attendu : export de profil MyKTAMap, ou registre de liaisons)", true); return; }
        _poserLiaisons(reg, "export « " + f.name + " »");
      } catch(err) { _statut($("caLinksStatus"), "JSON invalide : " + err.message, true); }
    };
    r.readAsText(f);
  });

  function _autoMatch(planIdOrigine) {
    const nom = String(_planNamesVus[planIdOrigine] || "").toLowerCase().trim();
    const hit = _plans.find(function(p) { return p.name.toLowerCase().trim() === nom && nom; });
    return hit ? hit.id : "";
  }

  function _renderMapping() {
    const ids = Object.keys(_planNamesVus);
    $("caMapping").style.display = ids.length ? "" : "none";
    const box = $("caMappingRows");
    box.innerHTML = "";
    ids.forEach(function(pid) {
      if (!(pid in _mapping)) _mapping[pid] = _autoMatch(pid);
      // Pack retiré depuis : remise à zéro.
      if (_mapping[pid] && !_plans.some(function(p) { return p.id === _mapping[pid]; })) _mapping[pid] = _autoMatch(pid);
      const row = document.createElement("div");
      row.className = "kta-ca-map-row";
      let opts = '<option value="">— ignorer (exclure ces liaisons) —</option>';
      _plans.forEach(function(p) {
        opts += '<option value="' + _esc(p.id) + '"' + (_mapping[pid] === p.id ? " selected" : "") + ">" +
                _esc(p.name) + " (data/" + _esc(p.id) + ")</option>";
      });
      row.innerHTML = "<code>" + _esc(_planNamesVus[pid]) + "</code> →" +
        ' <select class="kta-ca-sel" data-map="' + _esc(pid) + '">' + opts + "</select>";
      box.appendChild(row);
    });
  }
  $("caMappingRows").addEventListener("change", function(e) {
    const pid = e.target.getAttribute("data-map");
    if (pid == null) return;
    _mapping[pid] = e.target.value;
    _renderLinks(); _renderOut();
  });

  function _liaisonExportable(l) {
    return !!(l.a && l.b && _mapping[l.a.planId] && _mapping[l.b.planId]);
  }
  function _coteLabel(s) {
    return _esc((s && (s.planName || s.planId)) || "?") + " · " + _esc((s && (s.pointNom || s.pointId)) || ((s && s.x) + "," + (s && s.y)));
  }

  function _renderLinks() {
    const box = $("caLinksList");
    box.innerHTML = "";
    _links.forEach(function(l) {
      const ok = _liaisonExportable(l);
      const row = document.createElement("div");
      row.className = "kta-ca-link-row" + (ok ? "" : " kta-ca-off");
      row.innerHTML = '<input type="checkbox" class="kta-ca-check" data-lk="' + _esc(l.id) + '"' +
        (ok && _linkSel[l.id] ? " checked" : "") + (ok ? "" : " disabled") + ">" +
        "<span>🌀 " + _coteLabel(l.a) + " ⇄ " + _coteLabel(l.b) +
        (ok ? "" : ' <em style="color:var(--kta-texte-3);">(plan non mappé)</em>') + "</span>";
      box.appendChild(row);
    });
  }
  $("caLinksList").addEventListener("change", function(e) {
    const id = e.target.getAttribute("data-lk");
    if (id == null) return;
    _linkSel[id] = e.target.checked;
    _renderOut();
  });

  // ── 3+4. Sortie ──────────
  function _construire() {
    const out = {};
    const so = $("caFlagServerOnly").checked, ng = $("caFlagNoGen").checked;
    const st = $("caSubtitle").value.trim();
    if (so || ng || st || _accessHash) {
      out.config = {};
      if (st) out.config.subtitle = st;
      if (so) out.config.serverPlansOnly = true;
      if (ng) out.config.disableGenerator = true;
      if (_accessHash) out.config.accessHash = _accessHash;
    }
    // Connexion serveur écrite SEULEMENT si « activée » et valide.
    const cnx = _connexionSaisie();
    if (cnx.valide && cnx.champ) { out.config = out.config || {}; out.config.serverConnection = cnx.champ; }
    // Mode Dossiers par défaut (décision produit), seulement s'il y a des dossiers.
    const fd = !!($("caFlagFoldersDefault") && $("caFlagFoldersDefault").checked) && _folders.length > 0;
    if (fd) { out.config = out.config || {}; out.config.plansViewDefault = "folders"; }
    if ($("caFlagSitePlansHidden") && $("caFlagSitePlansHidden").checked) { out.config = out.config || {}; out.config.sitePlansHiddenDefault = true; }
    // Dossiers déclarés seulement s'il y en a (index identique sinon).
    const dossiersValides = _folders.filter(function(d) { return d.id && String(d.name || "").trim(); });
    if (dossiersValides.length) {
      out.folders = dossiersValides.map(function(d, i) {
        const e = { id: d.id, name: String(d.name).trim().slice(0, 40), order: i };
        if (d.color) e.color = d.color;
        return e;
      });
    }
    out.plans = _plans.map(function(p) {
      const e = p.format === "zip" ? { id: p.id, zip: _cheminZip(p), name: p.name }
                                   : { id: p.id, path: p.path || ("data/" + p.id), name: p.name };
      if (p.version) e.version = p.version;
      if (p.author)  e.author  = p.author;
      const tg = _normTags(p.tags);
      if (tg.length) e.tags = tg;
      if (p.folder && dossiersValides.some(function(d) { return d.id === p.folder; })) e.folder = p.folder;
      if (p.multiLevel) e.multiLevel = true;
      if (p.tiledV2)    e.tiledV2    = true;
      return e;
    });
    // Liaisons : planId locaux → "server_<id>" (id PlanRegistry que decouvrirPlansServeur attribuera sur le
    // kiosque), planName = nom du pack.
    const links = _links.filter(function(l) { return _liaisonExportable(l) && _linkSel[l.id]; })
      .map(function(l) {
        function remap(s) {
          const packId = _mapping[s.planId];
          const pack = _plans.find(function(p) { return p.id === packId; });
          const ns = Object.assign({}, s);
          ns.planId   = "server_" + _sanitId(packId);
          ns.planName = pack ? pack.name : s.planName;
          return ns;
        }
        const nl = Object.assign({}, l);
        nl.a = remap(l.a); nl.b = remap(l.b);
        return nl;
      });
    // 🩸 REPRENDRE UN INDEX NE DOIT RIEN DÉTRUIRE : sans registre local, un index rechargé pour corriger un tag
    // perdrait ses liaisons en silence. Elles sont reposées telles quelles tant qu'aucune liaison locale n'est
    // sélectionnée pour les remplacer.
    if (links.length) out.liaisons = { version: 1, links: links };
    else if (_liaisonsReprises) out.liaisons = _liaisonsReprises;
    return out;
  }

  // ── Connexion serveur ──────────
  // 🩸 MÊMES RÈGLES que js/ktaExtensions.js > valider() (corps recopié à l'identique ;
  // scripts/check-connexion-serveur.js exécute les deux sur la même table de cas) : une instance valide ici et invalide dans l'app serait le pire cas.
  function ktaValiderConnexion(sc) {
    if (sc === undefined || sc === null) return { etat: "off", raison: "absent" };
    if (typeof sc !== "object" || Array.isArray(sc)) {
      return { etat: "invalide", raison: "serverConnection doit être un objet" };
    }
    if (sc.state === "off") return { etat: "off", raison: "désactivé par l'instance" };
    if (sc.state !== "on") return { etat: "invalide", raison: "state doit valoir \"on\" ou \"off\"" };

    // api : une adresse https:// (autre domaine possible) OU un chemin du MÊME site (« /api/ »), résolu à l'adresse
    // de l'app à l'appel (localhost, IP ou nom de domaine).
    if (typeof sc.api !== "string" ||
        !(/^https:\/\/[^\s/?#]+/i.test(sc.api.trim()) || /^\/(?!\/)[^\s?#]*$/.test(sc.api.trim()))) {
      return { etat: "invalide", raison: "api doit être une adresse https:// ou un chemin du même site (/api/)" };
    }
    if (!Array.isArray(sc.modules)) {
      return { etat: "invalide", raison: "modules doit être une liste" };
    }
    if (sc.modules.length > 20) {
      return { etat: "invalide", raison: "plus de 20 modules" };
    }
    for (let i = 0; i < sc.modules.length; i++) {
      const m = sc.modules[i];
      if (typeof m !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.js(\?v=[A-Za-z0-9._-]{1,32})?$/.test(m) ||
          m.indexOf("..") >= 0 || m.indexOf("//") >= 0) {
        return { etat: "invalide", raison: "module hors de l'origine de l'app : " + String(m).slice(0, 80) };
      }
    }
    // transparence (facultatif) : page de transparence de l'installation, MÊME site (chemin relatif .html, règles
    // d'un module). La pastille y mène dès que l'état n'est pas OFF.
    if (sc.transparence !== undefined && (typeof sc.transparence !== "string" ||
        !/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.html$/.test(sc.transparence) ||
        sc.transparence.indexOf("..") >= 0 || sc.transparence.indexOf("//") >= 0)) {
      return { etat: "invalide", raison: "transparence doit être une page .html du même site (ex. pro/transparence.html)" };
    }
    const v = { etat: "on", raison: "", api: sc.api.trim(), modules: sc.modules.slice() };
    if (sc.transparence) v.transparence = sc.transparence;
    return v;
  }

  function _connexionSaisie() {
    if ($("caCnxState").value !== "on") return { valide: true, champ: null, raison: "" };
    const champ = {
      state: "on",
      api: $("caCnxApi").value.trim(),
      modules: $("caCnxModules").value.split(/\r?\n/).map(function(s) { return s.trim(); }).filter(Boolean)
    };
    if ($("caCnxTransparence").value.trim()) champ.transparence = $("caCnxTransparence").value.trim();
    const v = ktaValiderConnexion(champ);
    const garde = { state: "on", api: v.api, modules: v.modules };
    if (v.transparence) garde.transparence = v.transparence;
    return v.etat === "on"
      ? { valide: true, champ: garde, raison: "" }
      : { valide: false, champ: null, raison: v.raison };
  }

  function _renderOut() {
    $("caOut").textContent = JSON.stringify(_construire(), null, 2);
    const cnx = _connexionSaisie(), etat = $("caCnxEtat");
    if (etat) {
      etat.style.color = cnx.valide ? "var(--kta-texte-3)" : "var(--kta-erreur)";
      etat.textContent = !cnx.valide
        ? "⛔ " + cnx.raison + " — index.json ne peut pas être téléchargé tant que ce n'est pas corrigé"
        : (cnx.champ ? "✅ connexion activée (les visiteurs voient son état dans le pied de page)" : "");
    }
    $("caDownload").disabled = !cnx.valide;
    $("caCopy").disabled = !cnx.valide;
  }
  $("caSubtitle").addEventListener("input", _renderOut);
  $("caFlagServerOnly").addEventListener("change", _renderOut);
  $("caFlagNoGen").addEventListener("change", _renderOut);
  $("caCnxState").addEventListener("change", _renderOut);
  $("caCnxApi").addEventListener("input", _renderOut);
  $("caCnxModules").addEventListener("input", _renderOut);
  $("caCnxTransparence").addEventListener("input", _renderOut);

  $("caDownload").addEventListener("click", function() {
    if (!_connexionSaisie().valide) return;   // 🩸 jamais d'index qui casserait la connexion
    const blob = new Blob([JSON.stringify(_construire(), null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "index.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 5000);
  });
  $("caCopy").addEventListener("click", function() {
    if (!_connexionSaisie().valide) return;
    const txt = JSON.stringify(_construire(), null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function() { $("caCopy").textContent = "✅ Copié"; setTimeout(function() { $("caCopy").textContent = "📋 Copier"; }, 1500); });
    } else {
      const ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch(e) {}
      ta.remove();
    }
  });

  _renderOut();
})();
