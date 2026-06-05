/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE DOCS — Modales doc README + AIDE + AIDE IA
// =========================
// 🆕 v1.31.0 (P3 Lot 4 — découpe interface.js) : module extrait de
// js/interface.js (3 blocs : 1308-1751, 1752-2356, 8570-8806 avant
// extraction) pour réduire le volume du fichier principal.
//
// Aucun changement de comportement runtime. Les 3 fonctions exposées
// via `window` sont strictement identiques à v1.30.1.
//
// 📋 API publique :
//   - window.afficherReadme(opts)
//        → Modale plein écran de la documentation utilisateur
//          (docs/applications/README_USER.md, FR ou EN selon toggle
//          🇫🇷/🇬🇧). opts.hideOnboarding et opts.overLocker permettent
//          d'afficher la doc depuis les écrans de verrouillage
//          (UnlockGate communautaire + PinLock local — v1.28.1).
//   - window.afficherAide()
//        → Modale plein écran "Aide" intégrée (hardcoded HTML,
//          regroupe les principales rubriques d'usage).
//   - window.afficherModaleAideIA()
//        → Modale qui propose un téléchargement du contexte IA
//          (docs/applications/AI_CONTEXT.md enrichi avec README_USER
//          + métadonnées build). Utile pour briefer un agent IA externe
//          avec un fichier autocontenu.
//
// 🔌 Dépendances externes (toutes via window.* / global fonction
//    declarations) :
//   - window.__MKM__.build               [copyright.js]
//   - window.LegendCustomization         [legendCustomization.js]
//   - fetch docs/applications/README_USER.md (+ .en.md)
//   - fetch docs/applications/AI_CONTEXT.md
//   - localStorage["myktamap_readme_lang"]  [i18n FR/EN toggle]
//
// 📍 Ordre de chargement (cf index.html) :
//   - Doit charger APRÈS interface.js (sidebar appelle window.afficherAide
//     et window.afficherReadme au runtime via clic boutons sidebar).
//     L'ordre cosmétique car les fonctions sont posées au load (avant
//     DOMContentLoaded). Place ce script après interfaceLegende.js
//     dans index.html.

// README — modale plein écran
// =========================
// 🆕 v1.28.1 : opts.hideOnboarding et opts.overLocker permettent d'afficher
// la doc depuis les écrans de verrouillage (UnlockGate communautaire au boot
// + PinLock local). Dans ce contexte :
//   - hideOnboarding masque le bouton 🎓 Tutoriel (l'user lockout ne peut pas
//     interagir avec l'app de toute façon — l'onboarding n'aurait aucun sens).
//   - overLocker boost le z-index du modal à 100200 pour passer au-dessus
//     des deux gates (UnlockGate=100100, PinLock=100002). Sans ça la modale
//     apparaît derrière et l'user voit son fond mais ne peut pas interagir.
// 🆕 v1.29.0 P0 i18n — Langue de la doc utilisateur (FR / EN).
// Décisions design KARMA 1:a 2:c 3:a 4:a 5:c :
//   - Toggle drapeaux 🇫🇷 / 🇬🇧 dans header modale Doc UNIQUEMENT (cas particulier
//     isolé, palier 0 — le reste de l'app reste FR jusqu'au palier P1+).
//   - Détection auto navigator.language au 1er affichage, sticky après.
//   - Persistance localStorage["myktamap_readme_lang"] = "fr" | "en".
//   - Fallback FR si fichier EN absent (catch fetch).
//
// Ce mécanisme est INTENTIONNELLEMENT LIMITÉ à la doc README pour le P0.
// Quand on aura un vrai système i18n (P1+), ce toggle sera remplacé par
// un sélecteur global de langue.
const README_LANG_STORAGE_KEY = "myktamap_readme_lang";

function _getReadmeLang() {
  try {
    const saved = localStorage.getItem(README_LANG_STORAGE_KEY);
    if (saved === "fr" || saved === "en") return saved;
  } catch(e) {}
  // 1er boot : auto-détection navigator.language. EN si commence par "en",
  // FR sinon (par défaut). Persiste pour stabilité aux relances.
  const navLang = (navigator.language || navigator.userLanguage || "").toLowerCase();
  const detected = navLang.startsWith("en") ? "en" : "fr";
  try { localStorage.setItem(README_LANG_STORAGE_KEY, detected); } catch(e) {}
  return detected;
}

function _setReadmeLang(lang) {
  if (lang !== "fr" && lang !== "en") return;
  try { localStorage.setItem(README_LANG_STORAGE_KEY, lang); } catch(e) {}
}

// Retourne le chemin du fichier README selon la langue active.
// 🆕 v1.29.3 — README_USER.md + .en.md regroupés sous docs/applications/
// avec les autres docs lues par l'app (AI_CONTEXT, NETWORK_AUDIT). À la
// racine : README.md (GitHub) + CLAUDE.md (agents IA) uniquement.
function _readmePathForLang(lang) {
  return (lang === "en") ? "docs/applications/README_USER.en.md" : "docs/applications/README_USER.md";
}

function afficherReadme(opts) {
  opts = opts || {};
  const existing = document.getElementById("kta-readme-modal");
  if (existing) { existing.remove(); return; }

  // 🆕 P0 i18n — détermine la langue à charger
  const lang = _getReadmeLang();
  _chargerReadme(_readmePathForLang(lang), opts);
}

// Construit le sommaire latéral (sidebar desktop / haut sur mobile) avec H2 + sous-H3 collapsibles
function _construireSommaireReadme(corpsEl) {
  const sidebar = document.getElementById("kta-readme-toc-sidebar");
  if (!sidebar || !corpsEl) return;

  const h2List = Array.from(corpsEl.querySelectorAll("h2"));
  if (h2List.length === 0) {
    sidebar.style.display = "none";
    return;
  }

  // Construire l'arbre H2 → [H3...] en parcourant le DOM dans l'ordre
  const tree = h2List.map(function(h2, idx) {
    h2.id = "kta-readme-h2-" + idx;
    const children = [];
    let next = h2.nextElementSibling;
    let h3idx = 0;
    while (next && next.tagName !== "H2") {
      if (next.tagName === "H3") {
        next.id = "kta-readme-h2-" + idx + "-h3-" + h3idx;
        children.push(next);
        h3idx++;
      }
      next = next.nextElementSibling;
    }
    return { h2: h2, children: children };
  });

  let html = '<div class="kta-readme-toc-title">📚 Sommaire</div>';
  html += '<ul class="kta-readme-toc-list">';

  tree.forEach(function(node) {
    const hasChildren = node.children.length > 0;
    html += '<li class="kta-readme-toc-item' + (hasChildren ? '' : ' kta-readme-toc-item-leaf') + '">';
    html += '<div class="kta-readme-toc-row">';
    if (hasChildren) {
      html += '<button class="kta-readme-toc-toggle" type="button" aria-label="Plier ou déplier">▾</button>';
    } else {
      html += '<span class="kta-readme-toc-bullet">•</span>';
    }
    html += '<a href="#' + node.h2.id + '" class="kta-readme-toc-link kta-readme-toc-link-h2">';
    html += node.h2.textContent;
    html += '</a>';
    html += '</div>';
    if (hasChildren) {
      html += '<ul class="kta-readme-toc-sublist">';
      node.children.forEach(function(h3) {
        html += '<li><a href="#' + h3.id + '" class="kta-readme-toc-link kta-readme-toc-link-h3">' + h3.textContent + '</a></li>';
      });
      html += '</ul>';
    }
    html += '</li>';
  });
  html += '</ul>';

  sidebar.innerHTML = html;
  sidebar.style.display = "";

  // Brancher les toggles plier/déplier
  sidebar.querySelectorAll(".kta-readme-toc-toggle").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      const item = btn.closest(".kta-readme-toc-item");
      if (item) item.classList.toggle("collapsed");
    });
  });
}

// Setup smooth scroll, active section highlighting, back-to-top
function _setupReadmeNavigation() {
  const corpsScroll = document.getElementById("kta-readme-corps-scroll");
  const backBtn     = document.getElementById("kta-readme-back-top");
  const sidebar     = document.getElementById("kta-readme-toc-sidebar");
  if (!corpsScroll) return;

  const tocLinks = sidebar ? sidebar.querySelectorAll(".kta-readme-toc-link") : [];
  const sections = corpsScroll.querySelectorAll("h2[id], h3[id]");

  // Smooth scroll personnalisé sur les liens du TOC (l'ancrage natif scrollerait la page entière, pas notre conteneur)
  tocLinks.forEach(function(link) {
    link.addEventListener("click", function(e) {
      e.preventDefault();
      const targetId = link.getAttribute("href").substring(1);
      const target = corpsScroll.querySelector("#" + (window.CSS && CSS.escape ? CSS.escape(targetId) : targetId));
      if (target) {
        const containerTop = corpsScroll.getBoundingClientRect().top;
        const targetTop    = target.getBoundingClientRect().top;
        corpsScroll.scrollTo({
          top: corpsScroll.scrollTop + (targetTop - containerTop) - 12,
          behavior: "smooth"
        });
      }
    });
  });

  // Active section highlighting via IntersectionObserver
  if (typeof IntersectionObserver !== "undefined" && sections.length > 0 && tocLinks.length > 0) {
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        tocLinks.forEach(function(link) {
          const isActive = link.getAttribute("href") === "#" + id;
          link.classList.toggle("active", isActive);
          // Si c'est un H3 actif, déplier son parent H2 pour qu'on le voie
          if (isActive && link.classList.contains("kta-readme-toc-link-h3")) {
            const parentItem = link.closest(".kta-readme-toc-item");
            if (parentItem) parentItem.classList.remove("collapsed");
          }
        });
      });
    }, {
      root: corpsScroll,
      rootMargin: "0px 0px -65% 0px",  // section "active" quand elle entre dans le tiers supérieur
      threshold: 0
    });
    sections.forEach(function(s) { observer.observe(s); });
  }

  // Bouton retour-en-haut : visible après scroll > 250px
  if (backBtn) {
    const onScroll = function() {
      backBtn.classList.toggle("visible", corpsScroll.scrollTop > 250);
    };
    corpsScroll.addEventListener("scroll", onScroll, { passive: true });
    backBtn.addEventListener("click", function() {
      corpsScroll.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

function _chargerReadme(fichier, opts) {
  opts = opts || {};
  _ouvrirReadmeModal("<p style='color:#8892a4; text-align:center; padding:20px;'>⏳ Chargement…</p>", opts);
  fetch(fichier)
    .then(function(res) { if (!res.ok) throw new Error("HTTP " + res.status + " — " + fichier); return res.text(); })
    .then(function(md) {
      const html = _renderMarkdown(md);
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (!corps) return;
      // Injection directe du HTML rendu (plus de <p> wrapper qui cassait le rendu)
      corps.innerHTML = html;
      // Construction du sommaire latéral à partir du DOM rendu
      _construireSommaireReadme(corps);
      // Activation des comportements de navigation
      _setupReadmeNavigation();
    })
    .catch(function(err) {
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (corps) corps.innerHTML = '<p class="kta-readme-erreur">❌ Impossible de charger <code>' + fichier + '</code><br><br><code>' + err.message + '</code></p>';
      // Pas de sommaire si erreur
      const sidebar = document.getElementById("kta-readme-toc-sidebar");
      if (sidebar) sidebar.style.display = "none";
    });
}

function _renderMarkdown(md) {
  // 0. Normaliser les fins de ligne — les fichiers markdown éditésur Windows ont
  //    souvent CRLF, ce qui casse les regex \n (notamment celle des fenced code blocks)
  md = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 1. Protéger les blocs de code fenced AVANT tout traitement
  const codeBlocks = [];
  md = md.replace(/```[\w]*\n([\s\S]*?)```/g, function(_, code) {
    codeBlocks.push(code);
    return "%%CODE" + (codeBlocks.length - 1) + "%%";
  });

  // 2. Échapper le HTML (hors blocs protégés)
  md = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 3. Code inline
  md = md.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 4. Images ![alt](url) — avant les liens
  md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function(_, alt, url) {
    // Ignorer les images GitHub (assets) qui ne sont pas accessibles hors contexte
    if (url.includes("github.com") || url.includes("user-attachments")) {
      return '<span class="kta-readme-img-skip">📷 <em>' + (alt || "Image") + '</em></span>';
    }
    return '<img src="' + url + '" alt="' + alt + '" style="max-width:100%;border-radius:6px;margin:8px 0;">';
  });

  // 5. Liens [texte](url)
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 6. Tableaux Markdown |---|
  md = md.replace(/((?:^\|.+\|\n?)+)/gm, function(block) {
    const lines = block.trim().split("\n").filter(function(l) { return l.trim(); });
    if (lines.length < 2) return block;

    let html = '<table class="kta-readme-table">';
    lines.forEach(function(line, i) {
      // Ignorer la ligne de séparation |---|
      if (/^\|[\s\-:|]+\|/.test(line)) return;
      const cells = line.split("|").filter(function(_, ci) { return ci > 0 && ci < line.split("|").length - 1; });
      const tag = (i === 0) ? "th" : "td";
      html += "<tr>" + cells.map(function(c) { return "<" + tag + ">" + c.trim() + "</" + tag + ">"; }).join("") + "</tr>";
    });
    html += "</table>";
    return html;
  });

  // 7. Blockquotes
  md = md.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  md = md.replace(/(<\/blockquote>\n?<blockquote>)/g, "<br>");

  // 8. Titres
  md = md
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm,  "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,   "<h2>$1</h2>")
    .replace(/^# (.+)$/gm,    "<h1>$1</h1>");

  // 9. HR
  md = md.replace(/^---$/gm, "<hr>");

  // 10. Gras / italique
  md = md
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,         "<em>$1</em>");

  // 11. Listes
  md = md.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
  md = md.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, "<ul>$&</ul>");

  // 12. Paragraphes — split sur double saut de ligne.
  //  Pré-traitement : on isole les placeholders %%CODEN%% dans leurs propres blocs
  //  pour éviter que le wrap <p> englobe un futur <pre> (HTML invalide → bug rendu).
  md = md.replace(/(%%CODE\d+%%)/g, "\n\n$1\n\n");
  md = md.replace(/\n{3,}/g, "\n\n");

  //  - les blocs commençant par une balise block-level sont gardés tels quels
  //  - les blocs qui SONT un placeholder de code fenced sont gardés tels quels
  //  - les autres blocs (texte) sont enveloppés dans <p>, les sauts simples deviennent <br>
  const _BLOCK_TAG = /^<(h[1-6]|ul|ol|li|table|tr|td|th|blockquote|hr|pre|div|img|figure)/i;
  const _CODE_PLACEHOLDER = /^%%CODE\d+%%$/;
  md = md.split(/\n{2,}/).map(function(block) {
    block = block.trim();
    if (!block) return "";
    if (_BLOCK_TAG.test(block)) return block;
    if (_CODE_PLACEHOLDER.test(block)) return block;
    return "<p>" + block.replace(/\n/g, "<br>") + "</p>";
  }).join("\n");

  // 13. Restaurer les blocs de code
  md = md.replace(/%%CODE(\d+)%%/g, function(_, i) {
    const escaped = codeBlocks[parseInt(i)]
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return "<pre><code>" + escaped + "</code></pre>";
  });

  return md;
}

function _ouvrirReadmeModal(html, opts) {
  opts = opts || {};
  const modal = document.createElement("div");
  modal.id = "kta-readme-modal";
  modal.className = "kta-readme-modal-overlay";
  // 🆕 v1.28.1 : si la modale est ouverte depuis un écran de verrouillage
  // (UnlockGate communautaire au boot ou PinLock local), classe additionnelle
  // qui boost le z-index à 100200 (au-dessus de UnlockGate=100100 et
  // PinLock=100002). Sans ça, la modale Doc apparaîtrait DERRIÈRE la gate
  // et serait inaccessible.
  if (opts.overLocker) modal.classList.add("kta-readme-over-locker");
  // Structure : header / [sidebar | corps scrollable] / footer
  // - sidebar : sommaire desktop fixe / inline en haut sur mobile (CSS @media)
  // - corps : contenu rendu, scroll-behavior: smooth, contient aussi le bouton retour-en-haut
  // - footer : crédit Leaflet (cohérence avec le splash)
  // 🆕 v1.28.1 : bouton 🎓 Onboarding masqué quand hideOnboarding=true
  // (cas d'ouverture depuis un lockeur — l'user lockout ne peut pas lancer
  // le tutoriel de toute façon, et KARMA a explicitement demandé "sans
  // l'icone Onboarding").
  const btnOnboarding = opts.hideOnboarding
    ? ''
    : '<button class="kta-readme-tutorial-btn" id="kta-readme-tutorial-btn" type="button" aria-label="(Re)voir le tutoriel d\'onboarding" title="🎓 (Re)voir le tutoriel d\'onboarding">🎓</button>';
  // 🆕 v1.29.0 P0 i18n — Toggle FR/EN dans le header (drapeaux uniquement, KARMA 1:a).
  // Le bouton montre le drapeau de la langue ALTERNATIVE (pas de celle courante) pour
  // indiquer "clique pour basculer vers ça". Convention UX classique.
  const currentLang = _getReadmeLang();
  const altLang     = (currentLang === "fr") ? "en" : "fr";
  const altFlag     = (altLang === "fr") ? "🇫🇷" : "🇬🇧";
  const altTitle    = (altLang === "fr") ? "Lire en français" : "Read in English";
  const btnLang     = '<button class="kta-readme-lang-btn" id="kta-readme-lang-btn" type="button" ' +
                        'aria-label="' + altTitle + '" title="' + altTitle + '" ' +
                        'data-target-lang="' + altLang + '">' + altFlag + '</button>';
  modal.innerHTML = `
    <div class="kta-readme-modal-boite">
      <div class="kta-readme-modal-header">
        <button class="kta-readme-toc-toggle-btn" id="kta-readme-toc-toggle" type="button" aria-label="Afficher ou masquer le sommaire" title="Afficher ou masquer le sommaire">📚</button>
        <span class="kta-readme-modal-titre">📖 Documentation</span>
        ${btnLang}
        ${btnOnboarding}
        <button class="kta-panneau-close" id="kta-readme-close">✕</button>
      </div>
      <div class="kta-readme-modal-layout" id="kta-readme-layout">
        <aside class="kta-readme-toc-sidebar" id="kta-readme-toc-sidebar"></aside>
        <div class="kta-readme-modal-corps" id="kta-readme-corps-scroll">
          <div class="kta-readme-corps">${html}</div>
        </div>
        <button class="kta-readme-back-top" id="kta-readme-back-top" type="button" aria-label="Retour en haut" title="Retour en haut">↑</button>
      </div>
      <div class="kta-readme-modal-footer">
        <span class="kta-readme-modal-by">Développé par <img src="icon/karma.png" alt="KARMA"></span>
        <!-- 🆕 v1.9.2-fix17 (KARMA "rajoute dans le footer de la doc nos
             nouvelles citations") : élargi pour citer toutes les
             dépendances/algos majeurs, en cohérence avec le splash et
             le footer du home. -->
        <span>— 🍃 Leaflet · 📦 JSZip · 🧭 Dijkstra</span>
      </div>
    </div>
  `;
  document.documentElement.appendChild(modal);

  // === ÉTAT INITIAL DU SOMMAIRE ===
  // - Pref user mémorisée si présente
  // - Sinon : visible par défaut sur écrans larges (≥ 1100px), masqué sur écrans étroits
  const layout = modal.querySelector("#kta-readme-layout");
  const toggleBtn = modal.querySelector("#kta-readme-toc-toggle");
  let tocVisible;
  try {
    const saved = localStorage.getItem("kta_readme_toc_visible");
    tocVisible = (saved !== null)
      ? (saved === "true")
      : (window.innerWidth >= 1100);
  } catch(e) {
    tocVisible = window.innerWidth >= 1100;
  }
  if (layout) layout.classList.toggle("toc-hidden", !tocVisible);
  if (toggleBtn) toggleBtn.classList.toggle("active", tocVisible);

  if (toggleBtn && layout) {
    toggleBtn.addEventListener("click", function() {
      const nowVisible = layout.classList.toggle("toc-hidden");
      // toc-hidden true = sommaire CACHÉ (logique inversée de tocVisible)
      const isVisibleNow = !nowVisible;
      toggleBtn.classList.toggle("active", isVisibleNow);
      try { localStorage.setItem("kta_readme_toc_visible", isVisibleNow ? "true" : "false"); } catch(e) {}
    });
  }

  document.getElementById("kta-readme-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });

  // 🆕 v1.21.3 (KARMA "le bouton Onboarding on peux le mettre tout en haut
  // de la doc README") : handler du bouton 🎓 dans le header → ouvre le
  // tutoriel. La modale Documentation reste ouverte derrière (le tutoriel
  // se pose par-dessus grâce à son z-index plus élevé). À la fermeture
  // du tutoriel, l'user retrouve sa doc à l'endroit où il était.
  const _readmeTutorialBtn = document.getElementById("kta-readme-tutorial-btn");
  if (_readmeTutorialBtn) {
    _readmeTutorialBtn.addEventListener("click", function() {
      if (window.Tutorial && typeof window.Tutorial.ouvrir === "function") {
        window.Tutorial.ouvrir();
      }
    });
  }

  // 🆕 v1.29.0 P0 i18n — Handler du toggle FR/EN. Persiste + ferme + ré-ouvre.
  // KARMA 4:a — scope strictement limité à la doc README. La modale est
  // détruite puis re-créée pour conserver toute la logique du bandeau Doc
  // (TOC dépliable, smooth scroll, etc.) sans avoir à dupliquer le rendu.
  const _readmeLangBtn = document.getElementById("kta-readme-lang-btn");
  if (_readmeLangBtn) {
    _readmeLangBtn.addEventListener("click", function() {
      const target = _readmeLangBtn.getAttribute("data-target-lang");
      if (target !== "fr" && target !== "en") return;
      _setReadmeLang(target);
      // Préserve les opts (overLocker, hideOnboarding) — sont déjà reflétées
      // dans le DOM courant via les classes de la modale.
      const wasOverLocker   = modal.classList.contains("kta-readme-over-locker");
      const wasHideOnboard  = !document.getElementById("kta-readme-tutorial-btn");
      modal.remove();
      afficherReadme({
        overLocker:     wasOverLocker,
        hideOnboarding: wasHideOnboard
      });
    });
  }
}

// =========================

// AIDE — modale plein écran
// =========================
function afficherAide() {
  const existing = document.getElementById("kta-aide-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id = "kta-aide-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-aide-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">❓ Aide — Référence des boutons</span>
        <button class="kta-panneau-close" id="kta-aide-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps kta-aide-corps">

        <p class="kta-aide-intro">
          La barre latérale droite est organisée en groupes déroulables.
          Un seul groupe peut être ouvert à la fois — cliquer sur un autre referme le précédent.
        </p>

        <!-- v1.34.16+ : section nouveautés sprint anti-crash iPhone -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🆕 Quoi de neuf (sprint v1.34.x)</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🍎 Stabilité iPhone renforcée</strong> — l'app libère désormais la mémoire des tuiles que tu ne regardes plus, des photos POI au changement de plan, et nettoie ses calques d'images à la sortie. Les longues sessions sur gros plan tuilé en cavité tiennent beaucoup mieux la route.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🚀 Démarrage plus fluide sur gros plan</strong> — les tuiles d'un plan tuilé ne sont plus toutes décompressées au boot : seules celles affichées sortent de l'archive, les autres attendent leur tour. Splash plus court, RAM mieux maîtrisée.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🗂️ Filtre des calques image fiabilisé</strong> — décocher un calque image puis changer de plan / recharger respecte enfin ton choix. Le bouton <strong>🔄 Tout afficher</strong> dans la modale Filtres recoche aussi les calques images en plus des données.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🔄 Mise à jour douce plus fiable</strong> — l'enchaînement <em>« Forcer la mise à jour → l'app redémarre »</em> ne reste plus bloqué à mi-chemin. La nouvelle version s'active automatiquement dans les 5 secondes.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:0; line-height:1.5;">
            ℹ️ Côté toi : rien à faire. Recharge l'app, profite. Détails techniques dans le journal des versions du dépôt.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📚 Aide / Doc / Légende</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">❓</span><span>Cette aide — référence des boutons</span>
            <span class="kta-aide-icone">📖</span><span>Documentation utilisateur</span>
            <span class="kta-aide-icone">🤖</span><span>Aide IA — télécharge un fichier contexte à coller dans ChatGPT/Claude/Gemini/etc.</span>
            <span class="kta-aide-icone">🗺️</span><span>Légende des icônes du plan</span>
            <span class="kta-aide-icone">🚨</span><span>Alerte publique (bouton du loader, à gauche du 📖) — affiche l'alerte en cours, ou "Aucune alerte en cours" si la situation est OK</span>
            <span class="kta-aide-icone">🔒</span><span><strong>Verrouiller l'application</strong> (bouton du loader, à droite du ⚙️) — si un code d'accès local est configuré, stoppe les modules actifs et relance MyKTAMap : la demande de PIN s'affiche au démarrage et le code doit être ressaisi pour reprendre. Si aucun code n'est configuré, une modale invite à en créer un depuis ⚙️ Configuration.</span>
            <span class="kta-aide-icone">🏷️</span><span>Badge version (footer du loader) — clique pour voir la modale de mise à jour ou les notes de la version installée. Clignote en bleu si une nouvelle version est dispo.</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff8a5c;">🚨 Alertes publiques :</strong> si l'auteur diffuse une alerte (incendie, fermeture, gaz toxiques...),
            une modale rouge pulsante apparaît automatiquement après le splash, avec titre, message et consignes. 3 niveaux possibles :
            <strong>emergency</strong> (rouge pulse, situation critique), <strong>warning</strong> (orange) ou <strong>info</strong> (bleu).
            Le bouton <strong>🚨</strong> dans le header du loader permet de re-consulter l'alerte à tout moment, OU de vérifier
            "✅ Aucune alerte en cours" si la situation est revenue à la normale. Une fois "J'ai compris" cliqué, la modale ne réapparaît plus
            au reload tant que l'alerte est la même — sauf si l'auteur en publie une nouvelle.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⚙️ Paramètres</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⚙️</span><span>Réglages, calibrage de l'échelle, debug, <strong>🌐 Géoréférencement GPS</strong> — réglages <strong>par plan</strong>. Le calibrage GPS saisi ici est auto-rempli quand tu ouvres 📡 Export externe. Les 2 points de calibrage acceptent <strong>🔍 Chercher un point</strong> et <strong>📍 Cliquer carte</strong> pour saisir les coords plan (comme dans la modale Export). La <strong>🧭 Position initiale du tracker</strong> propose les mêmes deux boutons pour définir le point de départ sans saisir les coordonnées à la main.</span>
            <span class="kta-aide-icone">🎬</span><span><strong>Mode présentation</strong> — bouton <strong>« 🎬 Activer le mode présentation »</strong> placé <strong>tout en haut</strong> de la modale Réglages pour accès en 1 vue. La touche <kbd>F</kbd> y donne aussi accès sur PC. Sortie : touche <kbd>F</kbd> / <kbd>Échap</kbd> (PC) ou bouton flottant ✕ (mobile).</span>
            <span class="kta-aide-icone">🔆</span><span><strong>Garder l'écran allumé (Wake Lock)</strong> — toggle dans Réglages (et aussi dans ⚙️ Configuration loader). Empêche la mise en veille tant que l'app est ouverte. <strong>Idéal en cavité</strong> pour ne pas débloquer son téléphone toutes les 30s. Persistant entre sessions, auto-relâché en arrière-plan, ré-activé au retour. Compat Chrome 84+, Edge 84+, Safari iOS 16.4+ (PWA). Toggle masqué si la fonction n'est pas supportée (Firefox).</span>
            <span class="kta-aide-icone">☀️</span><span><strong>Thème clair / sombre</strong> — bascule entre fond beige cataphile (clair) et fond noir nuit (sombre, défaut). Activable <strong>uniquement depuis la home → Configuration → ☀️ Activer le thème CLAIR</strong>. Le toggle déclenche un rechargement complet de l'app pour éviter les bugs résiduels d'affichage. Choix conservé globalement par appareil.</span>
            <span class="kta-aide-icone">🚀</span><span>Mode Performance ULTRA (dans ⚙️ Réglages) — pour les gros plans qui crashent</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Contient le bouton 🎯 pour calibrer l'échelle, 🐛 pour les logs détaillés.
            <strong>Le reset complet n'est plus ici</strong> — passe par ⚙️ Configuration sur la page d'accueil →
            💥 Tout réinitialiser. Idem pour le <strong>🔐 Code d'accès local (PIN/Face ID)</strong>
            qui n'est activable que depuis ⚙️ Configuration loader (par design).
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#f4c542;">🚀 Mode Performance ULTRA :</strong> section dans la modale ⚙️ Réglages pour les
            gros plans / appareils faibles. Active le toggle <strong>🚀 ULTRA</strong> pour appliquer 6 optims agressives d'un coup,
            ou ajuste individuellement : <strong>🪜 Décimer les tracés au dézoom</strong>, <strong>⚡ Désactiver animations zoom/pan</strong>
            (reload requis), <strong>🎯 Désactiver cercles intersections</strong> (seuil 50 vs 200), <strong>🚫 Désactiver popups
            sur calques de données</strong> (utilise 🔍 Recherche à la place), <strong>🐢 Auto-save lent</strong> (30s vs 1.5s),
            <strong>👁️ Ne rendre que les tracés visibles</strong> (affichage optimisé de la zone visible). Aucune optim ne touche à l'image (déjà
            gérée par le mode performance au chargement). Persistance globale sur cet appareil, conservée entre sessions.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🔍 Recherche unifiée <span style="font-size:10px; color:#8892a4; font-weight:400;">(Ctrl+K)</span></div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📍</span><span>Points (nom, id, tag, description, état)</span>
            <span class="kta-aide-icone">🛣️</span><span>Tracés (label, type, niveau M-LVL)</span>
            <span class="kta-aide-icone">⬛</span><span>Zones (type, niveau)</span>
            <span class="kta-aide-icone">🏛️</span><span>Structures (piliers, murs, fronts)</span>
            <span class="kta-aide-icone">🌐</span><span><strong>Coordonnées GPS</strong> — colle <code>48.6808, 2.1588</code> directement (format Google Maps). Si plan géoréférencé : POI proche dans 50 px → "Aller au point" ; sinon → "Créer un point ici" → ouvre le formulaire pré-rempli sur la position</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            La recherche couvre 4 catégories + GPS.
            <strong>Raccourci clavier Ctrl+K</strong> (Cmd+K sur Mac) pour ouvrir/fermer instantanément.
            Résultats groupés par catégorie avec compteurs. Au clic : centre + flash visuel
            (cercle pour les points, polyline dashed pour les tracés, polygon transparent pour zones / piliers).
            Filtre par catégorie + calque + tag.
          </p>
          <p style="font-size:12px; color:#8cb4ff; margin:6px 0 0; line-height:1.5;">
            <strong>🌐 Format GPS :</strong> ce même format <code>lat, lng</code> est accepté dans
            <strong>⚙️ Paramètres → Géoréférencement</strong>, dans la <strong>modale 📡 Export externe (KMZ/GPX)</strong>
            et lors de la <strong>création d'un plan géoréférencé</strong> — colle depuis Google Maps, l'app split
            automatiquement les 2 valeurs.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬇️ Charger / Import</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📥</span><span><strong>Importer</strong> — un seul bouton qui ouvre une modale à 2 cards : 📥 <strong>Session MyKTAMap</strong> (.json / .zip avec photos) ou 📤 <strong>GPX externe</strong> (TopoDroid, OsmAnd, Avenza, Strava, Garmin… nécessite calibrage GPS). Preview avant import, Ctrl+Z pour annuler.</span>
            <span class="kta-aide-icone">📊</span><span>Éditer un fichier JSON sous forme de tableau</span>
            <span class="kta-aide-icone">🗂️</span><span>Changer de plan (revenir au home)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Multi-plans :</strong> chaque plan que tu charges (serveur ou ZIP local) est mémorisé
            dans ta liste personnelle. Au retour sur le home, tu retrouves :
          </p>
          <ul style="font-size:12px; color:#8892a4; margin:4px 0 0 18px; line-height:1.6;">
            <li><strong style="color:#a8b3c8;">▶️ Reprendre</strong> — relance le dernier plan ouvert en 1 clic.</li>
            <li><strong style="color:#a8b3c8;">📅 Récents</strong> — les 5 derniers plans utilisés.</li>
            <li><strong style="color:#a8b3c8;">📂 Tous</strong> — l'ensemble de tes plans connus.</li>
            <li><strong style="color:#a8b3c8;">🌐</strong> = plan serveur · <strong style="color:#a8b3c8;">💾</strong> = plan ZIP local.</li>
            <li><strong style="color:#a8b3c8;">💾 Exporter / 📂 Importer</strong> ta liste pour la partager ou la migrer.</li>
          </ul>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Plans serveur</strong> — l'app détecte automatiquement les plans
            publiés sur le serveur et les propose dans ta liste.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Plans locaux</strong> — au clic sur un plan local, l'app utilise
            la méthode de persistance choisie au chargement initial :
          </p>
          <ul style="font-size:12px; color:#8892a4; margin:4px 0 0 18px; line-height:1.6;">
            <li>
              <strong style="color:#6ce28a;">✅ Mémorisé</strong> — le ZIP est copié dans le navigateur
              (cochez <strong>« 💾 Mémoriser ce plan dans l'app »</strong> à l'import).
              Recharge en 0 clic, fonctionne <strong>même hors-ligne</strong> et sur <strong>mobile</strong>.
              Limite de stockage selon le navigateur (~50 Mo iOS, plusieurs Go Android/desktop).
            </li>
            <li>
              <strong style="color:#8cb4ff;">🔐 Accès permanent</strong> — Chrome/Edge desktop uniquement,
              via le bouton <strong>« 🔐 Autoriser l'accès permanent »</strong>. Le navigateur garde
              une référence vers le ZIP sur le disque (1 clic max après refresh).
            </li>
            <li>
              <strong style="color:#c0c8d8;">📁 Re-sélection</strong> — le ZIP est demandé à chaque clic
              (drag & drop ou clic sur la zone). Comportement par défaut sans persistance.
            </li>
          </ul>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">📱 Mobile</strong> — préférez <strong>« 💾 Mémoriser dans l'app »</strong>
            qui fonctionne partout. Pour une persistance maximale sur iPhone, installez l'app en
            <strong>PWA</strong> (Partager → Sur l'écran d'accueil) avant de mémoriser le plan.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🏗️ Créer / Modifier un plan</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🏗️</span><span>Ouvrir le générateur de plan (clic direct)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Permet de créer un nouveau plan ou de modifier un plan existant à partir d'une archive ZIP.
            2 modes — <strong>🚀 Simple</strong> (juste image + nom + version + V2/M-LVL → ZIP prêt en 30 sec)
            et <strong>⚙️ Avancé</strong> (calques, tracking, icônes, géoréf GPS, <strong>🏷️ légende du plan</strong>).
            Choix mémorisé localement. Mode Modifier force toujours Avancé pour préserver les customs du plan source.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">👤 Mode profil</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">👤</span><span><strong>Bandeau profil</strong> en en-tête du loader (au-dessus de « Mes plans ») — avatar + surnom + mini-stats globales (📍 points · 🛣️ tracés · ⬛ zones · 🏛️ structures + temps cumulé, conservés)</span>
            <span class="kta-aide-icone">✏️</span><span>Clic sur le <strong>surnom</strong> ou l'<strong>avatar</strong> → modale d'édition (surnom libre + upload photo profil)</span>
            <span class="kta-aide-icone">🖼️</span><span>Photo profil compressée auto (max 512px, JPEG q88) — sinon avatar par défaut = initiale du surnom dans un cercle coloré</span>
            <span class="kta-aide-icone">📦</span><span>Profil exportable / importable — partage entre appareils sans serveur</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>Stockage 100 % local</strong> dans un stockage local dédié — surnom + photo + dates.
            Aucune donnée transmise. Profil par défaut vide (👤 anonyme) : aucun utilisateur existant n'est forcé de configurer.
            <strong>Stats bandeau</strong> : dès 2 stats dispo le bandeau les affiche en mobile médian,
            temps cumulé survit aux rechargements.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⭐ Favoris points</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⭐</span><span>Bouton dans la popup d'un POI — toggle ☆ inactif / ⭐ actif (ambre)</span>
            <span class="kta-aide-icone">⭐</span><span>Groupe sidebar gauche (juste après M-LVL) — flyout latéral listant les favoris du plan courant</span>
            <span class="kta-aide-icone">🎯</span><span>Clic sur un favori → centre la carte + flash circleMarker orange 3 s + ouvre la popup du marker original</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>Mémorisés localement par plan</strong>.
            <strong>Copie complète</strong> des points (id, nom, coordonnées, tag, calque) — résilience si le point est déplacé ou supprimé du plan.
            <strong>Non partagé via les exports</strong> (= vue locale par appareil). Persistant à travers les sessions et survit à un rechargement.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⏪ Historique (Undo / Redo) <span style="font-size:10px; color:#8892a4; font-weight:400;">(Ctrl+Z / Ctrl+Y)</span></div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⏪</span><span>Annuler la dernière action (Ctrl+Z) — jusqu'à 50 actions</span>
            <span class="kta-aide-icone">⏩</span><span>Rétablir l'action annulée (Ctrl+Y ou Ctrl+Shift+Z)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Couvre les 4 catégories d'annotations dessinables —
            ✏️ points, 🛣️ tracés, ⬛ zones, 🏛️ structures. Granularité atomique (1 clic = 1 annulable).
            Toast discret à chaque action. Boutons sidebar auto-grisés quand la pile est vide.
            Historique non sauvegardé : repart à zéro au rechargement, reset auto au changement de plan.
            <strong>⚠️ Photos exclues</strong> (suppression irréversible).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🪫 Indicateur de batterie</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⚡</span><span>Chip header — en charge (vert)</span>
            <span class="kta-aide-icone">🪫</span><span>Chip header — en décharge (couleur selon niveau)</span>
            <span class="kta-aide-icone">🔋</span><span>Bloc 🔋 ÉTAT du mode urgence (level + état affichés en grand)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>3 points d'affichage</strong> : en-tête nouvelle interface (chip ⚡/🪫 à côté des compteurs session), footer modale 📋 Session active, bloc 🔋 ÉTAT mode urgence.
            <strong>Warnings graduels</strong> via toast à 20 % / 10 % / 5 % (1 fois par seuil par cycle de décharge).
            <strong>⚠️ Compatibilité limitée</strong> : la fonction batterie du navigateur est dispo en Chromium uniquement (Android Chrome, PC Chrome/Edge).
            Sur Safari iOS et Firefox récents, elle a été retirée pour des raisons de confidentialité — la chip est alors <strong>masquée</strong>, sans message d'erreur.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📊 Stats session enrichies</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📊</span><span>Bloc stats en tête de la modale 📋 Session active</span>
            <span class="kta-aide-icone">📋</span><span>Copier le résumé dans le presse-papier (texte plain, prêt pour Discord / SMS / mail)</span>
            <span class="kta-aide-icone">💾</span><span>Export TXT — télécharge un fichier .txt avec le résumé complet</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Affichage : total annotations, breakdown par type (📍 points · 🛣️ tracés · ⬛ zones · 🏛️ structures), <strong>distance cumulée</strong> des tracés (auto m → km), <strong>surface cumulée</strong> des zones (auto m² → ha), photos POI attachées, durée écoulée depuis le démarrage de session.
            En multi-niveau (M-LVL), un breakdown additionnel par niveau s'affiche.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📊 Inspecteur mémoire</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📊</span><span>Bouton « 📊 Voir l'état mémoire » dans ⚙️ Configuration loader (home) → nouvelle section 📊 Inspecteur</span>
            <span class="kta-aide-icone">🗂️</span><span>localStorage : clés MyKTAMap triées par taille + mini-barre de proportion</span>
            <span class="kta-aide-icone">💾</span><span>IndexedDB : 3 bases (handles / backups / photos) + scan natif des bases tierces, count par store</span>
            <span class="kta-aide-icone">📦</span><span>Cache PWA : liste des caches, marquage du cache actif (★), échantillon 12 premiers assets</span>
            <span class="kta-aide-icone">📈</span><span>Storage estimate : usage / quota navigateur avec barre couleur (vert → jaune → rouge)</span>
            <span class="kta-aide-icone">🧠</span><span>Runtime : plan chargé, session active (📍/🛣️/⬛/🏛️), modules JS chargés/manquants</span>
            <span class="kta-aide-icone">📋</span><span>Bouton 📋 Copier le rapport → texte plain markdown-like prêt à coller dans Discord / mail / GitHub</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Outil de <strong>transparence + debug</strong>. Affiche un topo lisible de tout ce que MyKTAMap a écrit localement dans ton navigateur. Pratique pour diagnostiquer un bug (« ma session disparaît », « mes photos ne sont plus là ») ou vérifier qu'un reset complet a bien purgé tout. <strong>Lecture seule, 100 % local</strong> — aucune donnée transmise.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🏷️ Légende personnalisable</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">✏️</span><span><strong>Cascade 3 niveaux</strong> : session &gt; plan &gt; défaut MKM (chaque niveau surcharge le suivant)</span>
            <span class="kta-aide-icone">📐</span><span>Édition <strong>session</strong> (perso, locale) : modale 🖼️ Export PNG → « Personnaliser les libellés » ou bouton ✏️ Modifier dans 🗺️ Légende mode carte</span>
            <span class="kta-aide-icone">🏗️</span><span>Édition <strong>au niveau du plan</strong> (partagée avec tous les utilisateurs du plan) : Générateur de plan en <strong>mode Avancé</strong> → section « 🏷️ Légende du plan »</span>
            <span class="kta-aide-icone">✨</span><span>4 catégories couvertes : 📍 icônes / 🛣️ tracés / ⬛ zones / 🏛️ structures — renommer, masquer, ou ajouter des entrées <strong>custom dessinables</strong></span>
            <span class="kta-aide-icone">🌍</span><span><strong>Aller-retour KMZ</strong> : la légende du plan voyage avec ton KMZ exporté → restaurée auto au ré-import dans une autre instance MyKTAMap. Ignorée par Google Earth / OsmAnd / Avenza.</span>
            <span class="kta-aide-icone">📤</span><span><strong>Aller-retour GPX</strong> : pareil pour GPX via les métadonnées du fichier GPX. Compatible TopoDroid, OsmAnd, Strava, etc.</span>
            <span class="kta-aide-icone">👁️</span><span>Au ré-import (KMZ ou GPX), le résumé/preview affiche explicitement « ✅ Légende personnalisée du plan détectée : N renommés · M masqués · K customs » avant la génération du ZIP MyKTAMap.</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>Cas d'usage</strong> : un cataphile qui crée un plan d'une carrière peut renommer « Eau » en « Lac du fond », masquer les types qu'il n'utilise jamais, et ajouter ses propres types dessinables (« Niche votive », « Stèle », etc.). Ces personnalisations s'appliquent <strong>automatiquement</strong> à tous ceux qui chargeront son plan, en KMZ comme en GPX. Chaque utilisateur peut toujours surcharger sa propre session par-dessus sans rien casser.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🎬 Replay de session tracker</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🎬</span><span>Bouton Replay dans le groupe 🧭 Tracker — ouvre la modale plein écran</span>
            <span class="kta-aide-icone">▶️</span><span>Play / Pause / Restart / End — slider timeline + sélecteur de vitesse 0.5× → 10×</span>
            <span class="kta-aide-icone">⛶</span><span>Toggle mode compact (bottom sheet) ↔ mode normal — pour libérer la carte pendant le replay</span>
            <span class="kta-aide-icone">💾</span><span>Export CSV — fichier avec horodatage + coordonnées + type (+ niveau en M-LVL)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Pendant le tracking, l'app enregistre en interne une <strong>timeline</strong> des événements : démarrage, chaque pas PDR appliqué, chaque recalage.
            Au clic sur 🎬, tu rejoues ta session avec un marker mobile jaune.
            <strong>Trail multi-segments</strong> : les recalages (téléportations) sont sautés visuellement — pas de ligne droite artificielle.
            <strong>Raccourcis clavier</strong> : Espace = play/pause · ← → = seek 1s · Échap = fermer.
            Non sauvegardé : repart à zéro au rechargement, reset au changement de plan.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬆️ Enregistrer</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">💾</span><span>Enregistrer la session — modale avec 4 onglets : 🚀 Full · 🎨 Avancé · 🔄 Conversion · <strong>📡 Export externe (KMZ + GPX)</strong>. L'export Full embarque la <strong>timeline tracker complète</strong> (parcours + timeline temporelle datée + heure de départ) → permet de transporter l'historique GPS entre appareils (heatmap multi-sessions + replay multi-appareils). Ignoré en conversion de calque.</span>
            <span class="kta-aide-icone">📡</span><span><strong>Case tracker — mode Avancé</strong> — dans la modale 🖼️ Export image, la case « Position du tracker » montre le compteur de points du tracé (ex : « + tracé 142 pts ») pour visualiser ce qui sera gravé sur l'image.</span>
            <span class="kta-aide-icone">🖼️</span><span>Exporter en PNG/JPG — modale avec mode Rapide / Avancé</span>
            <span class="kta-aide-icone">📤</span><span><strong>Exporter en PDF imprimable</strong> — A0 à A4 × portrait/paysage, légende positionnable dans un coin</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>📤 PDF :</strong> 10 formats (A0/A1/A2/A3/A4 × portrait/paysage), choix
            des calques de données + image au cas par cas, légende overlay 4-coins avec 3 tailles et 4 styles
            (dont 🆕 « Pro fond blanc » par défaut pour l'impression papier). Reprend la même
            chaîne de rendu que l'export PNG avancé pour cohérence visuelle parfaite.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Tracker</div>
          <p style="font-size:12px; color:#8892a4; margin:0 0 8px; line-height:1.5;">
            Le groupe Tracker s'ouvre en panneau latéral
            pour accueillir ses ~8 sous-actions sans déborder. Ordre du menu, du haut vers le bas :
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">▶️⏹️</span><span><strong>Play / Stop</strong> — démarrer / arrêter le tracking par capteurs PDR (expérimental). Icône dynamique ▶️↔⏹️ selon l'état</span>
            <span class="kta-aide-icone">🧭</span><span><strong>Boussole</strong> — toggle du widget Nord magnétique (orientation utile en cavité)</span>
            <span class="kta-aide-icone">📍</span><span><strong>Mode recalage</strong> — clic sur la carte ou sur un point existant pour repositionner le marker. Fermeture auto après clic + retour boussole automatique</span>
            <span class="kta-aide-icone">🗺️</span><span><strong>Calculer un itinéraire</strong> — ouvre la modale itinéraire (waypoints, mode de vitesse, évitements)</span>
            <span class="kta-aide-icone">🎬</span><span><strong>Replay de session tracker</strong> — modale plein écran : slider timeline + play/pause + vitesse 0.5×→10× + export CSV. Mode compact auto au Play pour libérer la carte. Raccourcis Espace / ← → / Échap</span>
            <span class="kta-aide-icone">🔥</span><span><strong>Heatmap densité</strong> — segments interpolés + normalisation auto + <strong>6 sources cochables</strong> : 🚶 Tracker timeline · ✏️ Points session · 🛣️ Tracés · ⬛ Zones · 🏛️ Structures · 📊 Calques de données</span>
            <span class="kta-aide-icone" style="background:rgba(255,80,80,0.18); border-radius:4px;">⛑️</span><span><strong>Je suis perdu</strong> — <span style="color:#ff8a5c;">FOND ROUGE (urgence)</span> — calcule une zone probable de ta position à partir de ta dernière position connue, du temps écoulé et d'indices visuels</span>
            <span class="kta-aide-icone" style="background:rgba(255,80,80,0.18); border-radius:4px;">🚨</span><span><strong>Mode urgence XL "panique"</strong> — <span style="color:#ff8a5c;">FOND ROUGE (urgence)</span> — affichage XL position + cap boussole + minimap auto-focus + 🔋 batterie + toggle 🗺️ itinéraire</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff5555;">🚨 Démarcation visuelle :</strong> les 2 derniers boutons (⛑️ et 🚨) sont placés
            en <strong>fin de menu</strong> avec un <strong>fond rouge distinctif</strong> pour les séparer des fonctions
            de navigation normales.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff5555;">🚨 Mode urgence "panique" :</strong> bouton rouge distinctif,
            <strong>différent</strong> du ⛑️ "Je suis perdu" (qui calcule une zone). Ici on suppose que tu sais où tu es
            (le tracker l'affiche) mais que <strong>tu paniques et tu as besoin d'infos vitales en gros</strong> :
            <strong>position XL</strong> (coords plan), <strong>cap boussole en gros</strong> (sens de marche, aiguille
            tournée), <strong>minimap auto-focus</strong> avec les <strong>roads / zones / structures du plan en arrière-plan</strong>
            (utile pour repérer chemins, sorties, dangers). Wake Lock automatique (l'écran ne s'éteint pas).
            Permissions capteurs auto-demandées si pas déjà accordées. Sortie via le ✕.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff8a5c;">⛑️ Mode urgence :</strong> sous-action orange distinctive. Tu indiques où tu étais (recherche
            d'un point existant, clic sur la carte ou position tracker), <strong>depuis combien de temps</strong>, et
            l'app dessine un <strong>cercle de recherche</strong> orange autour (rayon = <strong>vitesse × temps</strong>, sans marge).
            La vitesse se choisit via <strong>4 presets</strong> (sélecteur) — <strong>mêmes valeurs que le mode
            itinéraire</strong> pour la cohérence : <strong>🤕 Blessé</strong> (2 km/h), <strong>🐌 Lente</strong>
            (3 km/h), <strong>🚶 Normale</strong> (5 km/h, défaut), <strong>🏃 Rapide</strong> (7 km/h).
            Temps écoulé max <strong>1h30</strong> (au-delà la zone devient immense et non pertinente).
            Tu peux ajouter des <strong>indices visuels</strong> ("bidon eau", "épure bélier"...) — l'app cherche ces mots
            dans le nom, la description et les tags des points du plan ; les indices qui matchent <strong>dans la zone</strong>
            apparaissent en violet pulsant, et leur <strong>centre</strong> donne une <strong>localisation probable affinée</strong>.
            Bouton <strong>👁️ Fermer</strong> ferme la modale en gardant la zone visible sur la carte (pour explorer).
            Bouton <strong>🗑️ Effacer la zone</strong> (dans les résultats) retire tout. Rapport texte copiable au
            presse-papiers (📋) pour partage offline (radio, SMS).
            Un accordion <strong>📚 Bonnes pratiques</strong> en haut de la modale regroupe les conseils essentiels
            (garde ton calme, reviens sur tes pas, cherche les axes principaux/roulages, utilise une boussole physique,
            économise ta lumière, préviens quelqu'un si tu captes du réseau, à ne pas faire). ⚠️ Estimation géométrique
            uniquement — ne remplace <strong>PAS</strong> une opération de secours réelle (fil d'Ariane, boussole,
            lampe de rechange, carte papier).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🚨 Mode Secours — Coordination d'équipes</div>
          <p style="font-size:12px; color:#8892a4; margin:0 0 8px; line-height:1.5;">
            Outil de coordination opérationnelle pour <strong>organiser des équipes de recherche</strong> en cas d'incident
            souterrain (cataphile perdu, secours organisé). <strong>3 modes urgences distincts</strong> à ne pas confondre :
            ⛑️ <em>Je suis perdu</em> = TOI tu te cherches · 🚨 <em>Mode panique</em> = TOI tu paniques · 🚨 <em>Mode Secours</em> = QUELQU'UN D'AUTRE est perdu et tu organises les secours.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:0 0 8px; line-height:1.5;">
            <strong style="color:#f4c542;">📝 État 1 — CRÉATION (vue Édition)</strong> — préparation/planning du plan de secours.
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🚨</span><span>Ouvre la modale Mode Secours (multi-scénarios par plan, max 10 sauvegardés, les plus anciens d'abord)</span>
            <span class="kta-aide-icone">➕</span><span>Création scénario : nom + heure incident + notes contexte</span>
            <span class="kta-aide-icone">🎨</span><span><strong>Palette OTAN 10 couleurs fixe</strong> : Alpha rouge / Bravo bleu / Charlie vert / Delta jaune / Echo magenta / Foxtrot cyan / Golf orange / Hotel violet / India brun / Juliet gris</span>
            <span class="kta-aide-icone">📍</span><span>Équipes avec parcours : <strong>entrée + intermédiaires + sortie</strong> (autocomplete POI / saisie ID / clic carte). Boucle si entrée=sortie</span>
            <span class="kta-aide-icone">⬛</span><span>Zone de recherche par équipe : polygone OU tracés sélectionnés. Mini-modale "POI dans zone" auto-suggère intermédiaires</span>
            <span class="kta-aide-icone">🗺️</span><span><strong>Itinéraire calculé automatiquement</strong> avec évitements entre équipes (anti-chevauchement). Toast d'avertissement si évitement impossible</span>
            <span class="kta-aide-icone">🏗️</span><span><strong>Niveau M-LVL par équipe</strong> : chip RDC/+1/-1 + select éditable. Auto-création 1 équipe par niveau via bouton « 🏗️ Auto »</span>
            <span class="kta-aide-icone">🔥</span><span>Heatmap d'activité (sources tracker/POI/tracés) pour identifier zones probables à fouiller</span>
            <span class="kta-aide-icone">⛑️</span><span>Enchaînement Je suis perdu → Secours : un bouton dans Je suis perdu pré-remplit la dernière position connue + zone d'incertitude + heure de l'incident</span>
            <span class="kta-aide-icone">⭐</span><span>Favoris du plan en accès rapide dans picker waypoint (max 8 chips au-dessus de la recherche)</span>
            <span class="kta-aide-icone">🔍</span><span><strong>Ctrl+K → assigner POI à équipe en 2 clics</strong> : bouton 📌 dans résultats recherche unifiée si Mode Secours actif</span>
            <span class="kta-aide-icone">🛑</span><span><strong>Pause configurable</strong> (partagée avec l'itinéraire principal) : 0-120 min entre arrêts intermédiaires, recalcul auto des durées</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">📤 3 formats d'export</strong> :
            <strong>📄 PDF imprimable</strong> A4 1 page/équipe avec carte miniature + mini-légende intégrée +
            cadre observations vide pour terrain papier ·
            <strong>🌍 KMZ géolocalisé cross-app</strong> (Google Earth / OsmAnd / Avenza) avec 43 styles couleur OTAN +
            plan en GroundOverlay 60% + folders nested toggleables par équipe ·
            <strong>📦 .mkmsec.json autonome</strong> pour partage entre appareils sans toute la session
            (modale preview AVANT injection).
          </p>
          <p style="font-size:12px; color:#8892a4; margin:14px 0 8px; line-height:1.5;">
            <strong style="color:#f4c542;">🚀 État 2 — EXÉCUTION TERRAIN (vue Live temps réel)</strong> — l'incident est déclenché, tu suis les observations.
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🚀</span><span>Bouton <strong>Lancer le plan de secours</strong> dans la vue Édition → modale sélection rôle</span>
            <span class="kta-aide-icone">👤</span><span><strong>Mode Opérateur surface</strong> (PC chef) : vue d'ensemble cards multi-équipes + statut + dernière obs + bouton « 🚨 Prendre la main » avec retour automatique</span>
            <span class="kta-aide-icone">🚨</span><span><strong>Mode Équipier</strong> (sur le terrain) : stepper visuel cliquable + observations + 7 statuts rapides + photos (max 5/étape) + navigation prev/next</span>
            <span class="kta-aide-icone">🚑</span><span><strong>Mode Secouriste libre</strong> (renfort sans équipe) : notes en vrac chronologiques DESC + 7 boutons rapides + timestamps auto</span>
            <span class="kta-aide-icone">⏱️</span><span>Timer global avec <strong>pause juste</strong> (exclut le temps de pause cumulé)</span>
            <span class="kta-aide-icone">📤</span><span><strong>Rapport au fil des étapes</strong> : 3 formats (PDF/JSON/Texte presse-papier) × 3 niveaux (opérateur/équipier/secouriste). Réutilisable à tout moment pendant ou après l'arrêt</span>
            <span class="kta-aide-icone">📦</span><span>Bandeau <strong>PLAN TERMINÉ</strong> dans vue Édition après arrêt : « 📤 Voir le rapport historique » + « 🚀 Relancer »</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">7+1 statuts d'étape</strong> :
            • <em>en attente (par défaut)</em> · 🟢 <strong>RAS</strong> · 🟡 <strong>Suspect</strong> · ⬛ <strong>Bloqué</strong> ·
            🔵 <strong>Indice</strong> · 🟠 <strong>Aide demandée</strong> · 🟣 <strong>Demi-tour forcé</strong> ·
            <strong style="color:#ff5555;">🚨 Victime trouvée</strong> (urgence absolue = card rouge clignotante côté PC chef).
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">📸 Stockage photo dédié au mode secours</strong> :
            max 5 photos par étape, compression auto JPEG q85 max 1920px, viewer plein écran réutilisé.
          </p>
          <p style="font-size:12px; color:#8cb4ff; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#8cb4ff;">📥 Consolidation entre appareils</strong> : au retour terrain, chaque équipier exporte son rapport via
            <strong>📤 Rapport</strong> (niveau équipier). L'opérateur l'importe dans la vue Live Op via le bouton
            <strong>📥 Importer rapport équipier</strong> du footer → modale preview avec détection des conflits → fusion (observations concaténées datées, statut le plus
            sévère retenu, photos dédupliquées). Sauvegarde automatique AVANT pour pouvoir annuler. Chip « 📥 importé » sur les cards d'équipe fusionnées.
            <span style="color:#a8b3c8;">La voie QR code a été testée puis abandonnée — le scan après compression WhatsApp était trop fragile sur les codes denses.</span>
            ⚠️ Comme tout : <strong>garde une boussole physique et une carte papier</strong>. Le téléphone peut tomber en panne. Le 🚨 est une aide à la coordination, PAS un substitut à la préparation.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📐 Outils de mesure</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📐</span><span>Mesure de distance — clic pour poser des points, total affiché en bas-gauche</span>
            <span class="kta-aide-icone">⬛</span><span><strong>Mesure de surface</strong> — toggle 📏/⬛ dans le groupe, dessine un polygone, l'app calcule l'aire en m² (auto ha au-delà de 10 000 m²)</span>
            <span class="kta-aide-icone">📏</span><span>Distance totale des tracés — sous-action du groupe Tracés, panneau flottant avec filtres par type</span>
            <span class="kta-aide-icone">🗺️</span><span>Itinéraire — chemin le plus court entre 2 points ou plus en suivant les routes existantes</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">📏 Distance totale :</strong> ouvre un petit panneau bas-droite avec 3 cases à cocher
            (Principal / Secondaire / Chemin). Le total des longueurs des tracés cochés est affiché en mètres,
            et les tronçons inclus sont surlignés en magenta sur la carte. Inclut aussi les routes des calques
            de données visibles. <strong>Pas exporté dans la légende des images PNG.</strong>
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">🗺️ Itinéraire :</strong> ajoute des waypoints (clic sur la carte, recherche par nom/id/tag, ou bouton <strong>🧭 Ma position</strong> qui prend ta position tracker actuelle),
            l'app calcule le trajet le plus court en empruntant les routes existantes (session + calques de données, <strong>même les calques masqués</strong> — utile si les routes sont dessinées en dur sur le PNG et que tu veux gagner en perf).
            Le label en bas-gauche affiche la <strong>distance</strong>, le <strong>⏱️ temps estimé</strong> et le <strong>mode de vitesse actif</strong> (🤕 Blessé 2 km/h / 🐌 Lente 3 km/h / 🚶 Normale 5 km/h défaut / 🏃 Rapide 7 km/h, + 15 min de pause par point intermédiaire). Le mode se change via un sélecteur dans la modale itinéraire et est conservé entre sessions.
            Le tracé apparaît en cyan néon avec un label de distance en bas-gauche. Au re-clic, la modale s'ouvre en
            <strong>mode navigation</strong> : boutons <strong>⏮️ Début</strong>, <strong>⏭️ Fin</strong>,
            <strong>🔁 Tour complet</strong>, et 🎯 par waypoint pour centrer la carte dessus.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#ffb266;">🚫 Contraintes d'évitement :</strong>
            <strong style="color:#a8b3c8;">⛔ Zone Inaccessible</strong> (groupe Zones) = contrainte <em>dure</em>, l'itinéraire ne passera jamais à travers, jamais relâchée.
            <strong style="color:#a8b3c8;">🚫 Préférences d'évitement</strong> (section repliable dans la modale itinéraire) = contrainte <em>souple</em> : points à éviter (recherche / ID / clic carte) + tags à éviter + marge (px, défaut 100). Si pas de chemin alternatif, l'app calcule quand même en passant à proximité et affiche un message orange <em>⚠️ Impossible d'éviter : X, Y</em>. Préférences mémorisées localement par plan.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">✏️ Édition de points</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">✏️</span><span><strong>Activer le mode ajout</strong> — clic direct sur l'icône ✏️ → toggle ON/OFF. En ON, chaque clic sur la carte pose un nouveau point.</span>
            <span class="kta-aide-icone">📸</span><span>Photos attachées au point (max 5) — section dans la modale d'ajout/édition. Boutons 📷 Prendre / 🖼️ Galerie</span>
            <span class="kta-aide-icone">✏️</span><span>Modifier un point existant — bouton bleu dans la popup du marker (relance la même modale pré-remplie)</span>
            <span class="kta-aide-icone">🌐</span><span><strong>Coords GPS dans le popup</strong> — si le plan est <strong>géoréférencé</strong>, le popup d'un point affiche automatiquement les coordonnées GPS (lat/lng WGS84) calculées juste après la description, avec un bouton <strong>📋</strong> pour copier dans le presse-papier. Actif pour <strong>tous les points</strong> (session ET calques de données).</span>
            <span class="kta-aide-icone">🗑️</span><span><strong>Supprimer un point</strong> — clic sur le marker → popup → bouton <strong>🗑️ Supprimer ce point</strong>. Pour annuler une suppression accidentelle : <code>Ctrl+Z</code>.</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#f4c542;">📸 Photos POI :</strong> attache jusqu'à <strong>5 photos par point</strong>
            (caméra mobile via 📷 ou import galerie via 🖼️). Compression auto JPEG q85 max 1920px. <strong>100 % local sur cet appareil</strong>
            — jamais envoyé sur Internet. Miniatures 44×44 dans la popup du marker (tap → viewer plein écran avec pinch-zoom + pan +
            swipe horizontal pour naviguer entre photos). Inclues dans tous les exports (session ZIP + générateur ZIP plan) + restaurées
            automatiquement au re-import. 5e compteur 📸 dans le header + section dans la modale "📊 Détails de la session".
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🏛️ Structures (piliers + murs + fronts de taille)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🟡</span><span>Pilier 1ère masse (polygone, fill jaune)</span>
            <span class="kta-aide-icone">🟠</span><span>Pilier 2e masse (polygone, fill orange) — auto-taggé niveau -1 en M-LVL</span>
            <span class="kta-aide-icone">🔵</span><span>Mur (polygone, fill bleu)</span>
            <span class="kta-aide-icone">🟨</span><span>Front de taille 1ère masse (polyligne, trait jaune) — c'est une LIGNE, pas un polygone fermé</span>
            <span class="kta-aide-icone">🟧</span><span>Front de taille 2e masse (polyligne, trait orange) — auto-taggé niveau -1 en M-LVL</span>
            <span class="kta-aide-icone">🧹</span><span>Effacer (dernier point / dernière structure en cours OU fermée / 🎯 sélection au clic carte / toutes)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Cartographie de l'architecture souterraine</strong> : piliers porteurs (1ère/2e masse de
            calcaire), murs de soutènement, et fronts d'exploitation. Pour les polygones (piliers + murs), pose au moins 3 points
            puis re-clique sur l'icône allumée pour fermer. Pour les polylignes (fronts), pose au moins 2 points puis re-clique sur
            l'icône pour valider la ligne. Aucun effet pathfinder (lecture seule — c'est différent de la zone ⛔ Inaccessible qui
            bloque l'itinéraire).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🛣️ Tracés & Routes</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🟩</span><span>Tracer une route principale</span>
            <span class="kta-aide-icone">🟪</span><span>Tracer une route secondaire</span>
            <span class="kta-aide-icone">🟨</span><span>Tracer un chemin</span>
            <span class="kta-aide-icone">🪜</span><span>Jonction interniveau (magenta pointillé) — sous-action visible uniquement si le mode multi-niveau est activé. Bridge entre 2 niveaux pour le pathfinder.</span>
            <span class="kta-aide-icone">📏</span><span>Distance totale des tracés (panneau flottant avec filtres par type)</span>
            <span class="kta-aide-icone">🧹</span><span>Effacer (dernier point, dernier tracé ou tous)</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬛ Zones (remblais / effondrements / eau / inaccessible)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⬛</span><span>Tracer une zone de remblais</span>
            <span class="kta-aide-icone">🟥</span><span>Tracer une zone d'effondrement</span>
            <span class="kta-aide-icone">🟦</span><span>Tracer une zone d'eau</span>
            <span class="kta-aide-icone">⛔</span><span>Tracer une zone inaccessible (hachures rouge/noir) — bloque le pathfinder</span>
            <span class="kta-aide-icone">✅</span><span>Fermer la zone en cours (au moins 3 points)</span>
            <span class="kta-aide-icone">🧹</span><span>Effacer (dernier point, dernière zone ou toutes)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Pose au moins 3 points puis re-clique sur le 1er point pour fermer la zone, ou utilise le bouton ✅.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🚀 Optimiser un plan</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            Plan léger = chargement rapide, navigation fluide, moins de risque de crash mémoire mobile.
            <strong>Conseils principaux :</strong>
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🖼️</span><span><strong>Image base</strong> ≤ 8 000 px de côté, format <strong>JPEG qualité 85</strong> (5-10× plus léger que PNG)</span>
            <span class="kta-aide-icone">🗂️</span><span><strong>1 seul calque image</strong> idéalement — fusionne légendes/repères dans le PNG base</span>
            <span class="kta-aide-icone">🛣️</span><span><strong>Routes nombreuses</strong> ? Dessine-les dans le PNG + masque le calque JSON. Le pathfinder utilise les routes même masquées</span>
            <span class="kta-aide-icone">📍</span><span><strong>Points denses</strong> ? Sépare-les en plusieurs calques toggleables (puits / passages / élec…)</span>
            <span class="kta-aide-icone">⚡</span><span><strong>Mode perf</strong> : 🎯 Équilibré sur mobile moderne, ⚡ Performance sur vieux device</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            Plus de détails et chiffres précis dans la <strong>Documentation 📖</strong> (groupe 📚 Aide / Doc) section "Optimiser ton plan pour la performance".
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🔐 Code d'accès local (PIN / Face ID)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🔐</span><span>Verrouillage optionnel de l'app à chaque démarrage</span>
            <span class="kta-aide-icone">🤳</span><span>Biométrie Face ID / Touch ID / Windows Hello si l'appareil le supporte (WebAuthn natif)</span>
            <span class="kta-aide-icone">🚫</span><span>5 tentatives ratées = lockout définitif. Aucune recovery en cas d'oubli.</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#f4c542;">À activer depuis la page d'accueil uniquement :</strong>
            ⚙️ Configuration → 🔐 Code d'accès local → bouton "🔐 Activer le code d'accès". Saisis un PIN
            4-6 chiffres, confirme, puis accepte la biométrie si proposée. Au prochain démarrage, l'app
            te demandera ton code avant d'ouvrir.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#ff8a5c;">⚠️ Note importante :</strong> c'est une <strong>barrière d'usage</strong>,
            PAS un chiffrement des données. Les photos et sessions restent en clair en stockage local du navigateur.
            Le PIN est haché côté client (SHA-256 + sel random) et jamais envoyé sur Internet.
            <strong>Note bien ton code</strong> — aucune recovery possible en cas d'oubli (no backend, no email reset).
            En lockout : seules solutions = réinstaller l'app (perte session + plans non mémorisés) OU contacter
            l'auteur (qui ne pourra rien faire, c'est cohérent avec la philo no-backend).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">💡 Astuces</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>Modes exclusifs</strong> : Mesure, Ajout de point, Recalage et Tracés sont mutuellement
            exclusifs — activer l'un désactive automatiquement les autres.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>Mode actif</strong> : tant qu'un mode est actif, son groupe reste ouvert pour permettre
            l'accès direct aux actions secondaires (effacer le dernier point par exemple).
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0; line-height:1.5;">
            <strong>Icône qui change</strong> : l'icône principale du groupe reflète le mode actif (par exemple
            🟩 sur le bouton Tracés quand un tracé principal est en cours, ou 📍 sur le Tracker pendant le recalage).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🆘 Dépannage</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>📡 App bloquée après une mise à jour douce</strong> (loader sans CSS, page coincée, assets mal chargés) :
            la cause la plus fréquente est un <strong style="color:#f4c542;">edge CDN qui sert un contenu corrompu</strong>
            (mauvais MIME, asset tronqué, etc.). Premier réflexe :
            <strong>désactive ton VPN, change de réseau (4G ↔ Wi-Fi)</strong>, et retente. Le CDN GitHub Pages a parfois
            des edges régionaux pourris — basculer d'IP/zone géo suffit souvent à débloquer.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🆘 Kill switch d'urgence</strong> : si l'app reste coincée même après changement de réseau, ouvre
            <code>https://&lt;domaine&gt;/?killsw=1</code> dans un onglet privé (Chrome/Safari, PAS la PWA) — ça
            réinitialise le cache de l'app + vide tous les fichiers techniques de l'app <strong>sans toucher à tes données</strong>
            (plans, sessions, photos, prefs préservés). Puis reload normal.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🆘 Reset manuel par page dédiée</strong> : si le param URL ne suffit pas (cache HTML coincé),
            navigue vers <code>https://&lt;domaine&gt;/killsw.html</code> — page standalone 100 % inline (CSS+JS),
            zéro dépendance, fonctionne même si tout le reste de l'app est cassé. Trois étapes affichées : cache de l'app
            réinitialisé, fichiers techniques purgés, prêt à recharger.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🔄 Mise à jour douce optimisée</strong> : le flow
            <strong>⚙️ Configuration → 🔄 Forcer la mise à jour</strong> est conçu pour être 10× plus rapide
            (de ~45s-3min à ~3-10s selon réseau). L'app télécharge la mise à jour en arrière-plan pendant
            la purge ; au rechargement, le cache courant est préservé, sans re-télécharger deux fois.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:0; line-height:1.5;">
            ⚠️ <strong>Ces outils ne suppriment AUCUNE donnée utilisateur</strong> (plans, sessions, photos, prefs, backups).
            Ils ne purgent que le cache des fichiers de l'app (HTML / CSS / JS / icônes). En cas de doute,
            <strong>📤 Exporter le profil</strong> AVANT pour avoir un backup complet à portée de main.
          </p>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);
  document.getElementById("kta-aide-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });
}


// =========================
// 🤖 AIDE IA — génère un fichier de contexte téléchargeable
// =========================
// Le contenu vit dans le fichier STATIQUE `docs/AI_CONTEXT.md` (depuis
// v1.8.0 — auparavant à la racine, déplacé dans docs/ avec README_USER.md).
// JS se contente de :
//   1. fetch docs/AI_CONTEXT.md (le squelette enrichi)
//   2. fetch docs/README_USER.md (la doc officielle)
//   3. remplacer les placeholders {{DATE}}, {{BUILD}}, {{README_USER}}
//   4. proposer le fichier au téléchargement
//
// Avantage : tout l'enrichissement du contexte IA se fait en éditant
// docs/AI_CONTEXT.md, sans toucher au code JS. Le SW propage automatiquement.
// =========================

function _genererContenuContexteIA(aiContextTemplate, readmeUserText) {
  const dateExport = new Date().toISOString().slice(0, 10);
  const buildVersion = (window.__MKM__ && window.__MKM__.build) || "non-défini";

  // Si le template docs/AI_CONTEXT.md est dispo, on s'en sert. Sinon fallback minimal.
  if (aiContextTemplate && aiContextTemplate.trim().length > 0) {
    return aiContextTemplate
      .replace(/\{\{DATE\}\}/g, dateExport)
      .replace(/\{\{BUILD\}\}/g, buildVersion)
      .replace(
        /\{\{README_USER\}\}/g,
        readmeUserText && readmeUserText.trim().length > 0
          ? readmeUserText
          : "_⚠️ Documentation utilisateur indisponible au moment de la génération (échec du fetch docs/applications/README_USER.md). Réessaye depuis l'app avec une connexion active ou après que le service worker ait mis le fichier en cache._"
      );
  }

  // ===== Fallback ultra-minimal si AI_CONTEXT.md est introuvable =====
  return (
    "# MyKTAMap — Contexte IA (fallback minimal)\n\n" +
    "> ⚠️ Le fichier `AI_CONTEXT.md` n'a pas pu être récupéré. Ce fichier de secours " +
    "contient uniquement la documentation utilisateur brute. Réessaye depuis l'app " +
    "quand le service worker aura mis `AI_CONTEXT.md` en cache.\n\n" +
    "**Auteur** : Flavien VIDAL (alias KARMA) · **Licence** : CC BY-NC-SA 4.0 · " +
    "**Site** : https://myktamap.fr\n\n" +
    "Date d'export : " + dateExport + " · Build : " + buildVersion + "\n\n" +
    "---\n\n" +
    (readmeUserText || "_Documentation utilisateur également indisponible._") +
    "\n"
  );
}


// =========================
// 🚨 MODALES ALERTES + MISE À JOUR — DÉPLACÉES (v1.31.0 P3 Lot 1)
// =========================
// Les 4 fonctions globales `window.afficherModaleAlerteAbsente`,
// `window.afficherSelecteurAlertes`, `window.afficherModaleAlerte`,
// `window.afficherModaleUpdateDispo` ont été extraites vers
// `js/interfaceAlerts.js` pour réduire le volume du fichier principal
// (cf. P3 Lot 1, découpe interface.js). Comportement runtime strictement
// identique à v1.30.1. Voir le header de `js/interfaceAlerts.js` pour
// la liste complète des fonctions extraites et leurs dépendances.


window.afficherModaleAideIA = function() {
  const existing = document.getElementById("kta-aide-ia-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id = "kta-aide-ia-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:600px; height:auto; max-height:90vh;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">🤖 Aide IA — Contexte téléchargeable</span>' +
        '<button class="kta-panneau-close" id="kta-aide-ia-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">💡 Concept</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:13px;">' +
            'Télécharge un fichier <strong>.md</strong> qui résume tout ce que ' +
            'l\'app permet de faire. Donne-le à <strong>n\'importe quelle IA</strong> ' +
            '(ChatGPT, Claude, Gemini, Perplexity, Le Chat, Copilot, etc.) — elle ' +
            'pourra répondre à toutes tes questions sur MyKTAMap avec un contexte ' +
            'précis et à jour.' +
          '</p>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">📋 Comment ça marche</div>' +
          '<ol style="color:#c8d0e0; line-height:1.7; font-size:13px; padding-left:22px; margin:0;">' +
            '<li>Clique <strong>📥 Télécharger le contexte</strong> en bas</li>' +
            '<li>Ouvre l\'IA de ton choix (web, app mobile, etc.)</li>' +
            '<li>Copie-colle le fichier dans le <strong>premier message</strong> de la conversation</li>' +
            '<li>Pose tes questions : <em>"Comment ajouter un point ?"</em>, <em>"Mon plan plante, que faire ?"</em>, etc.</li>' +
          '</ol>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">🔒 Confidentialité</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:13px;">' +
            'Le fichier ne contient <strong>QUE la documentation</strong> de l\'app — ' +
            '<strong>aucune donnée personnelle</strong> (pas de tes plans, points, sessions, etc.). ' +
            'Tu peux donc le partager sans risque.' +
          '</p>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">📋 Prompt prêt à coller (anti-hallucination)</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:12px; margin:0 0 8px 0;">' +
            'Colle ce texte <strong>avec</strong> le fichier .md dans le premier message de l\'IA. ' +
            'Il cadre les règles et limite les hallucinations.' +
          '</p>' +
          '<div class="kta-aide-ia-prompt-wrap">' +
            '<textarea id="kta-aide-ia-prompt" class="kta-aide-ia-prompt" readonly>' +
              'Voici la documentation officielle de l\'application MyKTAMap (fichier .md joint).\n\n' +
              'Tu vas m\'aider à l\'utiliser en suivant ces règles STRICTES :\n\n' +
              '⛔ Ne réponds QUE à partir du contenu du fichier joint.\n' +
              '⛔ Si une fonctionnalité n\'y est pas décrite, dis-le clairement — n\'invente JAMAIS.\n' +
              '⛔ N\'extrapole pas à partir d\'autres applis (Google Maps, QGIS, etc.).\n' +
              '⛔ Tu n\'as accès ni au code source, ni au site web, ni à mon application.\n' +
              '✅ Cite la section du fichier où tu trouves l\'info dans tes réponses.\n' +
              '✅ Utilise les icônes et libellés exacts mentionnés dans la doc.\n\n' +
              'Si tu as bien compris, réponds simplement « OK, prêt » et attends ma première question.' +
            '</textarea>' +
            '<button class="kta-btn kta-btn-ghost kta-aide-ia-copy-btn" id="kta-aide-ia-copy" type="button">📋 Copier</button>' +
          '</div>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">💰 Note importante</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:13px;">' +
            'L\'utilisation d\'une IA peut être <strong>payante ou limitée</strong> selon ' +
            'le service (ChatGPT gratuit avec quotas, Claude Pro, etc.). MyKTAMap reste ' +
            '<strong>gratuit</strong> — le contexte téléchargé est juste pour aider une ' +
            'IA externe à mieux te répondre.' +
          '</p>' +
        '</div>' +

        '<div style="display:flex; gap:10px; margin-top:14px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-aide-ia-cancel"   type="button" style="flex:1;">Annuler</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-aide-ia-download" type="button" style="flex:2;">📥 Télécharger le contexte (.md)</button>' +
        '</div>' +
        '<div id="kta-aide-ia-status" style="margin-top:10px; font-size:12px; color:#8892a4; min-height:18px; text-align:center;"></div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() { modal.remove(); }

  document.getElementById("kta-aide-ia-close").addEventListener("click", _fermer);
  document.getElementById("kta-aide-ia-cancel").addEventListener("click", _fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });

  // Copie du prompt dans le presse-papiers
  document.getElementById("kta-aide-ia-copy").addEventListener("click", async function() {
    const btn = this;
    const ta = document.getElementById("kta-aide-ia-prompt");
    const originalText = btn.textContent;
    try {
      // navigator.clipboard requiert HTTPS ou localhost — fallback execCommand sinon
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(ta.value);
      } else {
        ta.select();
        document.execCommand("copy");
        ta.setSelectionRange(0, 0);
        ta.blur();
      }
      btn.textContent = "✓ Copié !";
      btn.classList.add("kta-aide-ia-copy-ok");
      setTimeout(function() {
        btn.textContent = originalText;
        btn.classList.remove("kta-aide-ia-copy-ok");
      }, 1500);
    } catch(e) {
      console.warn("[AideIA] Copy failed :", e);
      btn.textContent = "❌ Échec — sélectionne manuellement";
      setTimeout(function() { btn.textContent = originalText; }, 2000);
    }
  });

  document.getElementById("kta-aide-ia-download").addEventListener("click", async function() {
    const btn = this;
    const statusEl = document.getElementById("kta-aide-ia-status");
    btn.disabled = true;
    btn.textContent = "⏳ Génération en cours...";
    statusEl.textContent = "Fetch de la documentation...";

    // Fetch en parallèle : docs/applications/AI_CONTEXT.md + README_USER.md
    // 🆕 v1.29.3 : regroupés sous docs/applications/ avec les autres docs
    // lues par l'app (NETWORK_AUDIT). À la racine : README.md + CLAUDE.md.
    let aiContextTpl = "";
    let readmeText = "";
    try {
      const [respCtx, respDoc] = await Promise.all([
        fetch("docs/applications/AI_CONTEXT.md", { cache: "no-cache" }),
        fetch("docs/applications/README_USER.md", { cache: "no-cache" })
      ]);
      if (respCtx.ok) {
        aiContextTpl = await respCtx.text();
      } else {
        console.warn("[AideIA] docs/applications/AI_CONTEXT.md HTTP " + respCtx.status);
      }
      if (respDoc.ok) {
        readmeText = await respDoc.text();
      } else {
        console.warn("[AideIA] docs/applications/README_USER.md HTTP " + respDoc.status);
      }
      const tplKo = Math.round(aiContextTpl.length / 1024);
      const docKo = Math.round(readmeText.length / 1024);
      statusEl.textContent = "Template " + tplKo + " Ko + doc " + docKo + " Ko. Génération...";
    } catch(e) {
      console.warn("[AideIA] Erreur fetch :", e);
      statusEl.textContent = "⚠️ Connexion impossible — affichage réduit.";
    }

    // Construction du contenu complet via remplacement de placeholders
    const contenu = _genererContenuContexteIA(aiContextTpl, readmeText);
    const blob = new Blob([contenu], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Nom de fichier avec timestamp
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MyKTAMap-AI-Context-" + ts + ".md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    statusEl.textContent = "✓ Fichier téléchargé (" + Math.round(contenu.length / 1024) + " Ko)";
    btn.textContent = "📥 Télécharger le contexte (.md)";
    btn.disabled = false;

    // Fermer la modale après 1.5s
    setTimeout(_fermer, 1500);
  });
};

// ==========================================
// EXPORTS WINDOW (v1.31.0 P3 Lot 4)
// ==========================================
// afficherReadme et afficherAide étaient référencés depuis interface.js
// via leur identifier non-qualifié (function declarations top-level).
// Post-extraction : on les expose via window.* pour que interface.js
// puisse continuer à les appeler via window.afficherX() (les onClick
// sidebar ont été patchés en conséquence).
// afficherModaleAideIA est DÉJÀ posée comme window.afficherModaleAideIA
// dans le bloc 3 lui-même (cf déclaration window.afficherModaleAideIA = function()...)
window.afficherReadme = afficherReadme;
window.afficherAide   = afficherAide;
