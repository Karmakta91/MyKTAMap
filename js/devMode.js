// =========================
// 🛠️ DEV MODE — Mode Développeur (v1.76.3, topo KARMA 07/08)
// =========================
// Refonte de la section « Debug » du ⚙️ Configuration HOME :
//   - Toggle « Mode Développeur » protégé par MOT DE PASSE à la première
//     activation (même principe que la gate communautaire : hash SHA-256
//     hardcodé — jamais le mdp en clair —, 5 tentatives max + lockout 60 s,
//     déverrouillage persisté par appareil) + avertissement de responsabilité.
//   - Contenu du mode : toggle logs détaillés (pilote setDebugMode global,
//     le select des Réglages plan a été SUPPRIMÉ — décision 2:b), bouton
//     📋 Afficher les logs (déménagé ici), et 📚 la BIBLIOTHÈQUE DE DOCS.
//   - 📚 Bibliothèque : tous les .md du repo (architecture, BACKLOG, MATHS,
//     RELEASE_GATE, README racine) rendus par window.kta_renderMd dans une
//     modale liste+lecture. Fetch same-origin À LA DEMANDE — pas de précache
//     SW (300+ Ko de docs dev dans le cache de tous les users : non). Hors
//     ligne ou docs/ non FTP-é → message propre.
// HOME seulement (décision 4) : rien en mode carte.
// =========================

(function() {
  "use strict";

  // Hash SHA-256 du mot de passe Mode Développeur (fourni par KARMA — pour le
  // changer : echo -n "<mdp>" | openssl dgst -sha256, et les appareils déjà
  // déverrouillés le redemanderont).
  const DEV_HASH   = "cf54ce09daddca0545b4bf38455cacc2fef9f52379d187e0023228b84077db49";
  const LS_UNLOCK  = "myktamap_devmode_unlock_v1";   // hash validé
  const LS_ACTIVE  = "myktamap_devmode_active_v1";   // "1" = mode actif
  const LS_TRIES   = "myktamap_devmode_tries_v1";    // JSON {n, until}
  const MAX_TRIES  = 5;
  const LOCK_MS    = 60000;

  // 📚 Manifest des docs lisibles (un hosting statique ne liste pas un
  // dossier). Vérifié par scripts/check-devmode-docs.js (pré-commit) : tout
  // chemin listé ici DOIT exister dans le repo — un renommage qui oublierait
  // le manifest casse le commit, pas la modale.
  const DOCS = [
    { path: "README.md",                                     titre: "📖 README (journal du projet)" },
    { path: "docs/BACKLOG.md",                               titre: "📌 BACKLOG — sujets ouverts & dettes" },
    { path: "docs/MATHS.md",                                 titre: "📐 Les maths de MyKTAMap" },
    { path: "docs/RELEASE_GATE.md",                          titre: "🚦 Porte de release" },
    { path: "docs/architecture/community-server-line.md",    titre: "🏛️ Frontière community / serveur" },
    { path: "docs/architecture/data-formats.md",             titre: "📦 Formats JSON" },
    { path: "docs/architecture/docker-selfhost.md",          titre: "🐳 Auto-hébergement Docker" },
    { path: "docs/architecture/exports.md",                  titre: "📤 Exports PNG/PDF/KMZ/GPX" },
    { path: "docs/architecture/gotchas.md",                  titre: "⚠️ Pièges connus & renommages" },
    { path: "docs/architecture/i18n.md",                     titre: "🌍 Multi-langue (i18n)" },
    { path: "docs/architecture/infra-versioning.md",         titre: "🏗️ Versioning, releases, DX" },
    { path: "docs/architecture/modal-lifecycle.md",          titre: "🪟 Cycle de vie des modales" },
    { path: "docs/architecture/multilevel-pathfinding.md",   titre: "🧭 Multi-niveau & pathfinding" },
    { path: "docs/architecture/perf-memory.md",              titre: "⚡ Perf, mémoire, tiling V2" },
    { path: "docs/architecture/plans-loader.md",             titre: "🗂️ Plans : registre & loader" },
    { path: "docs/architecture/rendering-leaflet.md",        titre: "🎨 Rendu Leaflet" },
    { path: "docs/architecture/secours.md",                  titre: "🆘 Mode Secours" },
    { path: "docs/architecture/security-legal.md",           titre: "🔒 Sécurité & légal" },
    { path: "docs/architecture/session-data.md",             titre: "💾 Session & données" },
    { path: "docs/architecture/tracking.md",                 titre: "👣 Tracker & boussole" },
    { path: "docs/architecture/ui.md",                       titre: "🖼️ UI, thème, modales" },
    { path: "docs/architecture/vue-osm.md",                  titre: "🌍 Vue OSM" }
  ];

  function t(k, p) { return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k; }

  async function _sha256(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function isUnlocked() {
    try { return localStorage.getItem(LS_UNLOCK) === DEV_HASH; } catch(e) { return false; }
  }
  function isActive() {
    try { return isUnlocked() && localStorage.getItem(LS_ACTIVE) === "1"; } catch(e) { return false; }
  }

  function _lireTries() {
    try { return JSON.parse(localStorage.getItem(LS_TRIES) || "{}"); } catch(e) { return {}; }
  }
  function _ecrireTries(o) {
    try { localStorage.setItem(LS_TRIES, JSON.stringify(o)); } catch(e) {}
  }

  // ---- Modale mot de passe (1re activation) ----
  function _demanderMdp() {
    return new Promise(function(resolve) {
      const ov = document.createElement("div");
      ov.className = "kta-readme-modal-overlay";
      ov.style.zIndex = "100002";
      ov.innerHTML = '' +
        '<div class="kta-readme-modal-boite" style="max-width:440px; height:auto; max-height:85vh;">' +
          '<div class="kta-readme-modal-entete">' +
            '<span class="kta-readme-modal-titre">🛠️ ' + t("devmode.gate.titre") + '</span>' +
            '<button class="kta-panneau-close" id="kta-dev-gate-close">✕</button>' +
          '</div>' +
          '<div class="kta-readme-modal-corps" style="font-size:13px;">' +
            '<div style="border:1px solid rgba(255,120,80,0.5); background:rgba(255,120,80,0.08); border-radius:8px; padding:10px 12px; margin-bottom:12px; line-height:1.5;">' +
              '⚠️ ' + t("devmode.gate.avertissement") +
            '</div>' +
            '<label class="kta-cfg-label" for="kta-dev-gate-input">' + t("devmode.gate.label") + '</label>' +
            '<input class="kta-cfg-input" id="kta-dev-gate-input" type="password" autocomplete="off" style="width:100%; margin-top:4px;">' +
            '<div id="kta-dev-gate-err" style="display:none; color:#ff7850; font-size:12px; margin-top:6px;"></div>' +
            '<div class="kta-conv-actions" style="margin-top:14px;">' +
              '<button class="kta-btn kta-btn-ghost"   id="kta-dev-gate-annuler">' + t("ui.confirm.cancel") + '</button>' +
              '<button class="kta-btn kta-btn-primary" id="kta-dev-gate-ok">' + t("devmode.gate.btn") + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(ov);
      const input = ov.querySelector("#kta-dev-gate-input");
      const errEl = ov.querySelector("#kta-dev-gate-err");
      const finir = function(ok) { ov.remove(); resolve(ok); };
      ov.querySelector("#kta-dev-gate-close").addEventListener("click", function() { finir(false); });
      ov.querySelector("#kta-dev-gate-annuler").addEventListener("click", function() { finir(false); });
      ov.addEventListener("click", function(e) { if (e.target === ov) finir(false); });
      const valider = async function() {
        const tries = _lireTries();
        if (tries.until && Date.now() < tries.until) {
          errEl.style.display = "";
          errEl.textContent = t("devmode.gate.lockout", { s: Math.ceil((tries.until - Date.now()) / 1000) });
          return;
        }
        const h = await _sha256(input.value || "");
        if (h === DEV_HASH) {
          try { localStorage.setItem(LS_UNLOCK, DEV_HASH); localStorage.removeItem(LS_TRIES); } catch(e) {}
          finir(true);
          return;
        }
        const n = (tries.until ? 0 : (tries.n || 0)) + 1;
        _ecrireTries(n >= MAX_TRIES ? { n: 0, until: Date.now() + LOCK_MS } : { n: n });
        errEl.style.display = "";
        errEl.textContent = (n >= MAX_TRIES)
          ? t("devmode.gate.lockout", { s: LOCK_MS / 1000 })
          : t("devmode.gate.mauvais", { rest: MAX_TRIES - n });
        input.value = "";
      };
      ov.querySelector("#kta-dev-gate-ok").addEventListener("click", valider);
      input.addEventListener("keydown", function(e) { if (e.key === "Enter") valider(); });
      setTimeout(function() { try { input.focus(); } catch(e) {} }, 30);
    });
  }

  // ---- 📚 Bibliothèque de docs ----
  function ouvrirBibliotheque() {
    const ov = document.createElement("div");
    ov.className = "kta-readme-modal-overlay";
    ov.style.zIndex = "100001";
    const liste = DOCS.map(function(d, i) {
      return '<button class="kta-devdocs-item" data-idx="' + i + '" type="button">' + d.titre + '</button>';
    }).join("");
    ov.innerHTML = '' +
      '<div class="kta-readme-modal-boite" style="max-width:980px; width:96vw; height:88vh;">' +
        '<div class="kta-readme-modal-entete">' +
          '<span class="kta-readme-modal-titre">📚 ' + t("devmode.docs.titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-devdocs-close">✕</button>' +
        '</div>' +
        '<div class="kta-devdocs-corps">' +
          '<div class="kta-devdocs-liste">' + liste + '</div>' +
          '<div class="kta-devdocs-lecture" id="kta-devdocs-lecture">' +
            '<p style="color:#8892a4;">' + t("devmode.docs.choisir") + '</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(ov);
    const fermer = function() { ov.remove(); };
    ov.querySelector("#kta-devdocs-close").addEventListener("click", fermer);
    ov.addEventListener("click", function(e) { if (e.target === ov) fermer(); });
    const lecture = ov.querySelector("#kta-devdocs-lecture");
    ov.querySelector(".kta-devdocs-liste").addEventListener("click", function(e) {
      const btn = e.target.closest(".kta-devdocs-item");
      if (!btn) return;
      ov.querySelectorAll(".kta-devdocs-item").forEach(function(b) { b.classList.remove("actif"); });
      btn.classList.add("actif");
      const doc = DOCS[parseInt(btn.getAttribute("data-idx"), 10)];
      lecture.innerHTML = '<p style="color:#8892a4;">⏳ ' + t("devmode.docs.chargement") + '</p>';
      fetch(doc.path, { cache: "no-store" }).then(function(r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      }).then(function(md) {
        const html = (typeof window.kta_renderMd === "function")
          ? window.kta_renderMd(md)
          : "<pre style='white-space:pre-wrap;'>" + (window.kta_escapeHtml ? window.kta_escapeHtml(md) : md) + "</pre>";
        lecture.innerHTML = '<div class="kta-readme-md">' + html + '</div>';
        lecture.scrollTop = 0;
      }).catch(function(err) {
        // Hors-ligne, ou docs/ pas FTP-é (l'upload partiel récurrent) : on le
        // DIT, on n'affiche pas une page blanche.
        lecture.innerHTML = '<div style="border:1px solid rgba(255,120,80,0.5); background:rgba(255,120,80,0.08); border-radius:8px; padding:12px;">' +
          '⚠️ ' + t("devmode.docs.indisponible", { path: doc.path, err: err.message }) + '</div>';
      });
    });
  }

  // ---- Section HOME (peuple le conteneur de index.html) ----
  function initSection() {
    const wrap = document.getElementById("kta-devmode-wrap");
    if (!wrap) return;
    const rendre = function() {
      const actif = isActive();
      wrap.innerHTML = '' +
        '<button class="loader-btn-secondary kta-debug-toggle" type="button" id="kta-devmode-toggle" aria-pressed="' + (actif ? "true" : "false") + '" style="width:100%;">' +
          '🛠️ ' + t("devmode.toggleLabel") + ' : <strong>' + (actif ? "ON" : "OFF") + '</strong>' +
        '</button>' +
        (actif ? (
          '<button class="loader-btn-secondary kta-debug-toggle" type="button" id="kta-devmode-logs-toggle" style="width:100%; margin-top:8px;">' +
            '🐛 ' + t("home.debug.logsLabel") + ' <strong>' + ((window.APP_CONFIG && window.APP_CONFIG.debugMode) ? "ON" : "OFF") + '</strong>' +
          '</button>' +
          '<button class="loader-btn-secondary" type="button" id="kta-devmode-logs-show" style="width:100%; margin-top:8px;">' + t("home.debug.showLogs") + '</button>' +
          '<button class="loader-btn-secondary" type="button" id="kta-devmode-docs" style="width:100%; margin-top:8px;">📚 ' + t("devmode.docs.bouton") + '</button>' +
          '<p class="kta-loader-perf-hint" style="margin-top:8px;">' + t("devmode.hint") + '</p>'
        ) : (
          '<p class="kta-loader-perf-hint" style="margin-top:8px;">' + t("devmode.hintOff") + '</p>'
        ));
      const toggle = document.getElementById("kta-devmode-toggle");
      toggle.addEventListener("click", async function() {
        if (isActive()) {
          try { localStorage.setItem(LS_ACTIVE, "0"); } catch(e) {}
          rendre();
          return;
        }
        if (!isUnlocked()) {
          const ok = await _demanderMdp();
          if (!ok) return;
        }
        try { localStorage.setItem(LS_ACTIVE, "1"); } catch(e) {}
        rendre();
      });
      if (actif) {
        document.getElementById("kta-devmode-logs-toggle").addEventListener("click", function() {
          if (typeof window.setDebugMode === "function") {
            window.setDebugMode(!(window.APP_CONFIG && window.APP_CONFIG.debugMode));
          }
          rendre();
        });
        document.getElementById("kta-devmode-logs-show").addEventListener("click", function() {
          if (typeof window.afficherLogsDebug === "function") window.afficherLogsDebug();
        });
        document.getElementById("kta-devmode-docs").addEventListener("click", ouvrirBibliotheque);
      }
    };
    rendre();
  }

  window.DevMode = {
    isActive: isActive,
    isUnlocked: isUnlocked,
    initSection: initSection,
    ouvrirBibliotheque: ouvrirBibliotheque
  };
})();
