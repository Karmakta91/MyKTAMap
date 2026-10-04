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
//     📋 Afficher les logs (déménagé ici), 📚 la BIBLIOTHÈQUE DE DOCS,
//     🏗️ ConfAdmin et 🔧 l'inspecteur Service Worker (js/swInspector.js).
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
    { path: "docs/ETUDE_GUIDAGE.md",                         titre: "🪧 Étude — guidage de l'itinéraire" },
    { path: "docs/ETUDE_UID.md",                              titre: "🆔 Étude — identifiant stable des objets" },
    { path: "docs/IA_POUR_LES_NULS.md",                      titre: "🤖 L'IA pour les nuls — méthode de travail avec une IA" },
    { path: "docs/INSTALLATION_SELFHOST.md",                 titre: "🛠️ Installation auto-hébergée" },
    { path: "docs/MATHS.md",                                 titre: "📐 Les maths de MyKTAMap" },
    { path: "docs/RELEASE_GATE.md",                          titre: "🚦 Porte de release" },
    { path: "docs/TILING.md",                                titre: "🖼️ Le tuilage (V1 / V2, plans serveur)" },
    { path: "docs/architecture/community-server-line.md",    titre: "🏛️ Frontière community / pro / serveur" },
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

  // 🐛 v1.76.3-fix (retour KARMA : « README.md contient du HTML, c'est la
  // seule doc qui s'affiche mal ») — kta_renderMd échappe TOUT le HTML par
  // design (sécurité, on n'y touche pas). Or README.md plie son journal dans
  // 32 blocs <details><summary> → texte brut illisible. On convertit donc
  // les tags STRUCTURELS courants en markdown AVANT le rendu. Seuls des noms
  // de tags précis sont visés : les pseudo-tags des exemples de code
  // (<planId>, <ISO>, <extensions>…) ne matchent pas et restent intacts.
  function _degonflerHtmlStructurel(md) {
    return md
      .replace(/<summary>\s*(?:<strong>)?([\s\S]*?)(?:<\/strong>)?\s*<\/summary>/gi, "\n### $1\n")
      .replace(/<\/?details[^>]*>/gi, "\n")
      .replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**")
      .replace(/<em>([\s\S]*?)<\/em>/gi, "*$1*")
      .replace(/<br\s*\/?>/gi, "\n")
      // Images SAME-ORIGIN (chemin relatif strict — pas d'URL externe ni de
      // schéma) : converties en marqueur inerte qui traverse l'échappement du
      // parseur, reconstituées en <img> réel APRÈS le rendu (_regonflerImages).
      // Ex. : l'architecture overview.svg en tête du README (retour KARMA).
      .replace(/<img[^>]*src="([\w][\w.\/-]*)"[^>]*alt="([^"<>§]*)"[^>]*>/gi, "\n§§IMG§$1§$2§§\n")
      .replace(/<img[^>]*src="([\w][\w.\/-]*)"[^>]*>/gi, "\n§§IMG§$1§§§\n")
      // Images restantes (externes, data:, etc.) : placeholder — on ne laisse
      // JAMAIS passer une URL non same-origin dans le HTML final.
      .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "🖼️ *$1*")
      .replace(/<img[^>]*>/gi, "🖼️")
      .replace(/<\/?(?:div|p|button|span)[^>]*>/gi, "")
      // Filet final : tags visés restés ORPHELINS (ex. un <summary> jamais
      // fermé dans le doc source) — mieux vaut les avaler que les afficher.
      .replace(/<summary>\s*/gi, "\n### ")
      .replace(/<\/?(?:summary|strong|em)>/gi, "");
  }

  // Reconstitue les <img> same-origin depuis les marqueurs posés par
  // _degonflerHtmlStructurel — appliqué au HTML DÉJÀ rendu/échappé. Le src
  // reste borné aux chemins relatifs ([\w.\/-] uniquement, vérifié deux
  // fois : au dégonflage ET ici). Fond clair : les diagrammes SVG des docs
  // sont dessinés pour fond blanc (traits sombres).
  function _regonflerImages(html) {
    return html.replace(/§§IMG§([\w][\w.\/-]*)§([^§]*)§§/g, function(_, src, alt) {
      return '<img src="' + src + '" alt="' + alt + '" loading="lazy" ' +
             'style="max-width:100%; height:auto; background:#fff; border-radius:8px; padding:6px; margin:8px 0;">';
    });
  }

  // ---- 📚 Bibliothèque de docs ----
  // 🔄 v2 (retour KARMA) : navigation en DEUX ÉCRANS comme l'Aide — d'abord
  // la LISTE des docs, clic → la doc plein cadre avec bouton ← retour.
  // Structure de modale STANDARD (entete + .kta-readme-modal-corps) : le
  // layout 2 colonnes custom de la v1 cassait (hauteur calculée dans une
  // boîte non-flex) — on ne réinvente plus le squelette des modales.
  function ouvrirBibliotheque() {
    const ov = document.createElement("div");
    ov.className = "kta-readme-modal-overlay";
    ov.style.zIndex = "100001";
    ov.innerHTML = '' +
      '<div class="kta-readme-modal-boite" style="max-width:820px; height:88vh;">' +
        '<div class="kta-readme-modal-entete">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kta-devdocs-retour" style="display:none; margin-right:8px;">←</button>' +
          '<span class="kta-readme-modal-titre" id="kta-devdocs-titre">📚 ' + t("devmode.docs.titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-devdocs-close">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" id="kta-devdocs-corps" style="font-size:13px;"></div>' +
      '</div>';
    document.documentElement.appendChild(ov);
    const corps  = ov.querySelector("#kta-devdocs-corps");
    const titre  = ov.querySelector("#kta-devdocs-titre");
    const retour = ov.querySelector("#kta-devdocs-retour");
    const fermer = function() { ov.remove(); };
    ov.querySelector("#kta-devdocs-close").addEventListener("click", fermer);
    ov.addEventListener("click", function(e) { if (e.target === ov) fermer(); });

    function montrerListe() {
      retour.style.display = "none";
      titre.textContent = "📚 " + t("devmode.docs.titre");
      corps.innerHTML = '<div class="kta-devdocs-liste">' +
        DOCS.map(function(d, i) {
          return '<button class="kta-devdocs-item" data-idx="' + i + '" type="button">' + d.titre +
                 '<span class="kta-devdocs-chemin">' + d.path + '</span></button>';
        }).join("") + '</div>';
      corps.scrollTop = 0;
    }

    function montrerDoc(doc) {
      retour.style.display = "";
      titre.textContent = doc.titre;
      corps.innerHTML = '<p style="color:#8892a4;">⏳ ' + t("devmode.docs.chargement") + '</p>';
      fetch(doc.path, { cache: "no-store" }).then(function(r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      }).then(function(md) {
        // 🐛 v1.76.3-fix (capture KARMA : la doc affichait... index.html) —
        // le serveur PWA a un fallback « fichier inconnu → index.html » en
        // 200 : un .md absent de la racine web renvoie la PAGE DE L'APP avec
        // un statut OK. On démasque le mensonge : une réponse qui commence
        // comme un document HTML n'est pas un markdown.
        if (/^\s*(<!DOCTYPE|<html)/i.test(md)) {
          throw new Error(t("devmode.docs.fallbackHtml"));
        }
        const html = (typeof window.kta_renderMd === "function")
          ? _regonflerImages(window.kta_renderMd(_degonflerHtmlStructurel(md)))
          : "<pre style='white-space:pre-wrap;'>" + (window.kta_escapeHtml ? window.kta_escapeHtml(md) : md) + "</pre>";
        corps.innerHTML = '<div class="kta-devdocs-lecture">' + html + '</div>';
        corps.scrollTop = 0;
      }).catch(function(err) {
        // Hors-ligne, ou docs/ pas FTP-é (l'upload partiel récurrent) : on le
        // DIT, on n'affiche pas une page blanche.
        corps.innerHTML = '<div style="border:1px solid rgba(255,120,80,0.5); background:rgba(255,120,80,0.08); border-radius:8px; padding:12px;">' +
          '⚠️ ' + t("devmode.docs.indisponible", { path: doc.path, err: err.message }) + '</div>';
      });
    }

    retour.addEventListener("click", montrerListe);
    corps.addEventListener("click", function(e) {
      const btn = e.target.closest(".kta-devdocs-item");
      if (btn) montrerDoc(DOCS[parseInt(btn.getAttribute("data-idx"), 10)]);
    });
    montrerListe();
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
          '<button class="loader-btn-secondary" type="button" id="kta-devmode-confadmin" style="width:100%; margin-top:8px;">🏗️ ' + t("devmode.confadmin") + '</button>' +
          '<button class="loader-btn-secondary" type="button" id="loaderSwInspectorBtn" style="width:100%; margin-top:8px;">' + t("home.inspector.swBtn") + '</button>' +
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
        document.getElementById("kta-devmode-confadmin").addEventListener("click", function() {
          // Page statique du repo, ouverte dans un onglet a part : elle a son
          // propre cycle de vie et ne doit pas remplacer la session en cours.
          try { window.open("confadmin.html", "_blank", "noopener"); }
          catch (e) { console.warn("[DevMode] Ouverture confadmin.html :", e); }
        });
        // 🔧 Inspecteur Service Worker (lot C, 03/10/2026) : déplacé ici depuis
        // ⚙️ Configuration › Système & maintenance. Pour tous, l'état du cache
        // hors-ligne est la pastille du pied de page de l'accueil.
        document.getElementById("loaderSwInspectorBtn").addEventListener("click", function() {
          if (window.SwInspector && typeof window.SwInspector.ouvrir === "function") window.SwInspector.ouvrir();
          else console.warn("[DevMode] Module SwInspector indisponible");
        });
      }
    };
    // 🐛 v3 du fix course i18n (le SMOKE a demasque la v2) : onChange ne
    // fire PAS au chargement initial du dico — uniquement setLang/reload.
    // Le pattern canonique est I18n.init().then(render) : barriere
    // idempotente, resolue en microtask si le dico est deja la (doc en tete
    // de langManager). onChange reste pose pour les changements de langue.
    if (window.I18n && typeof window.I18n.onChange === "function" && !window._devModeI18nHooked) {
      window._devModeI18nHooked = true;
      window.I18n.onChange(rendre);
    }
    if (window.I18n && typeof window.I18n.init === "function") {
      window.I18n.init().then(rendre);
      return;
    }
    rendre();
  }

  window.DevMode = {
    isActive: isActive,
    isUnlocked: isUnlocked,
    initSection: initSection,
    ouvrirBibliotheque: ouvrirBibliotheque
  };
})();
