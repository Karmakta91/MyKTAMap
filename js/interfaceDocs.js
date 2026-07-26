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

// 🆕 v1.45.0 — Langues pour lesquelles un fichier README_USER existe RÉELLEMENT.
// fr = README_USER.md (sans suffixe, historique) ; les autres = README_USER.<code>.md.
// Ajouter une langue (ru, es…) = déposer le fichier + ajouter son code ici
// (+ l'ajouter à ASSETS_TO_CACHE du SW). 100% générique, aucun code figé.
const DOC_AVAILABLE_LANGS = ["fr", "en"];

// 🆕 v1.45.0 — Langue à PRÉSÉLECTIONNER pour la doc :
//   1. choix manuel mémorisé (myktamap_readme_lang) s'il est encore dispo ;
//   2. sinon défaut dérivé de la langue de l'app via I18n.resolveContentLang
//      (langue app si doc dispo, sinon "en", sinon "fr").
// On NE persiste PAS le défaut dérivé : tant que l'user n'a pas cliqué un
// drapeau, la doc suit la langue de l'app (décision KARMA Q1:A). La doc reste
// donc LOCALE (clé myktamap_readme_lang ≠ langue globale myktamap_app_lang).
function _getReadmeLang() {
  try {
    const saved = localStorage.getItem(README_LANG_STORAGE_KEY);
    if (DOC_AVAILABLE_LANGS.indexOf(saved) >= 0) return saved;
  } catch(e) {}
  if (window.I18n && typeof window.I18n.resolveContentLang === "function") {
    return window.I18n.resolveContentLang(DOC_AVAILABLE_LANGS);
  }
  // Fallback ultime si I18n indispo (très improbable, chargé au boot) :
  // navigator.language mappé sur une langue doc dispo, sinon FR.
  const navLang = (navigator.language || navigator.userLanguage || "").toLowerCase();
  const guess = navLang.split("-")[0];
  return (DOC_AVAILABLE_LANGS.indexOf(guess) >= 0) ? guess : "fr";
}

function _setReadmeLang(lang) {
  if (DOC_AVAILABLE_LANGS.indexOf(lang) < 0) return;
  try { localStorage.setItem(README_LANG_STORAGE_KEY, lang); } catch(e) {}
}

// 🆕 v1.46 (KARMA) — Un changement de LANGUE GLOBALE de l'app (myktamap_app_lang,
// via le sélecteur Réglages/HOME) efface le choix manuel mémorisé de la doc +
// onboarding (clé partagée myktamap_readme_lang). Effet : doc, aide ET onboarding
// re-suivent la nouvelle langue app via resolveContentLang → "en" (GB) par défaut
// quand l'app n'est plus en FR et que la langue active n'a pas de contenu dédié.
// Le toggle drapeau LOCAL (dans la doc/aide/onboarding) reste sticky TANT QUE la
// langue globale ne change pas. Enregistré une fois au chargement du module.
if (window.I18n && typeof window.I18n.onChange === "function") {
  window.I18n.onChange(function() {
    try { localStorage.removeItem(README_LANG_STORAGE_KEY); } catch (e) {}
  });
}

// Retourne le chemin du fichier README selon la langue.
// 🆕 v1.29.3 — README_USER.md + .en.md regroupés sous docs/applications/
// avec les autres docs lues par l'app (AI_CONTEXT, NETWORK_AUDIT). À la
// racine : README.md (GitHub) + CLAUDE.md (agents IA) uniquement.
// 🆕 v1.45.0 — fr = sans suffixe ; toute autre langue = README_USER.<code>.md.
function _readmePathForLang(lang) {
  return (lang === "fr")
    ? "docs/applications/README_USER.md"
    : "docs/applications/README_USER." + lang + ".md";
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
  // 🆕 v1.45.0 — Onglets de langue de la doc : UN drapeau par langue réellement
  // dispo (DOC_AVAILABLE_LANGS), la langue courante marquée .active. Générique :
  // 2 drapeaux aujourd'hui (FR/EN), 3+ dès qu'un nouveau README_USER.<code>.md
  // existe. La langue présélectionnée suit l'app si l'user n'a pas de choix
  // manuel (cf _getReadmeLang). Les méta (label/flag) viennent de I18n.available().
  const _docCurrentLang = _getReadmeLang();
  const _docLangMeta = (window.I18n && window.I18n.available) ? window.I18n.available() : [
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "en", label: "English",  flag: "🇬🇧" }
  ];
  const btnLang = '<span class="kta-readme-lang-tabs">' +
    DOC_AVAILABLE_LANGS.map(function(code) {
      const meta = _docLangMeta.filter(function(l){ return l.code === code; })[0] ||
                   { code: code, label: code.toUpperCase(), flag: code.toUpperCase() };
      const isCur = (code === _docCurrentLang);
      return '<button class="kta-readme-lang-btn' + (isCur ? ' active' : '') + '" type="button" ' +
             'data-target-lang="' + code + '" aria-label="' + meta.label + '" title="' + meta.label + '"' +
             (isCur ? ' aria-current="true"' : '') + '>' + meta.flag + '</button>';
    }).join("") + '</span>';
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
             le footer du home.
             🆕 v1.40.29 — Rétabli 📤 jsPDF (oublié historiquement) + ajout
             🌍 OSM. Cohérence stricte avec splash + loader HOME.
             🆕 v1.43.17 — Ajout 📸 html2canvas (utilisé depuis v1.42.5 pour
             la capture du rendu Leaflet OSM dans le PDF Briefing pompiers
             du Mode Secours). Cohérence stricte avec splash + loader HOME.
             🆕 v1.43.18 — &amp;nbsp; entre emoji et nom pour empêcher le wrap
             de couper une paire emoji-texte (cas du Home loader où
             le 📸 et html2canvas se retrouvaient sur des lignes différentes). -->
        <span>— 🍃&nbsp;Leaflet · 📦&nbsp;JSZip · 📤&nbsp;jsPDF · 🌍&nbsp;OSM · 🧭&nbsp;Dijkstra · 📸&nbsp;html2canvas</span>
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

  // 🆕 v1.45.0 — Handler des onglets de langue (délégation sur tous les
  // drapeaux). Clic sur une langue ≠ courante → persiste + rebuild la modale
  // (préserve TOC dépliable, smooth scroll… sans dupliquer le rendu). Scope
  // strictement LOCAL à la doc (ne touche pas la langue globale de l'app).
  modal.querySelectorAll(".kta-readme-lang-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const target = btn.getAttribute("data-target-lang");
      if (DOC_AVAILABLE_LANGS.indexOf(target) < 0) return;
      if (target === _getReadmeLang()) return; // déjà la langue courante
      _setReadmeLang(target);
      // Préserve les opts (overLocker, hideOnboarding) — reflétées dans le DOM
      // courant via les classes de la modale et la présence du bouton 🎓.
      const wasOverLocker  = modal.classList.contains("kta-readme-over-locker");
      const wasHideOnboard = !document.getElementById("kta-readme-tutorial-btn");
      modal.remove();
      afficherReadme({
        overLocker:     wasOverLocker,
        hideOnboarding: wasHideOnboard
      });
    });
  });
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

  // 🆕 v1.45.x — Aide bilingue FR/EN. Même mécanisme que afficherReadme() :
  // la langue suit l'app via _getReadmeLang() (qui respecte aussi le toggle
  // drapeau local mémorisé myktamap_readme_lang). Le contenu HTML vit dans
  // _aideHtmlFr() / _aideHtmlEn() — système doc séparé, PAS window.I18n.t.
  const _aideLang = _getReadmeLang();
  const aideEn = (_aideLang === "en");

  // Onglets de langue identiques à la modale Documentation : UN drapeau par
  // langue réellement dispo (DOC_AVAILABLE_LANGS), la langue courante .active.
  const _aideLangMeta = (window.I18n && window.I18n.available) ? window.I18n.available() : [
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "en", label: "English",  flag: "🇬🇧" }
  ];
  const btnLang = '<span class="kta-readme-lang-tabs">' +
    DOC_AVAILABLE_LANGS.map(function(code) {
      const meta = _aideLangMeta.filter(function(l){ return l.code === code; })[0] ||
                   { code: code, label: code.toUpperCase(), flag: code.toUpperCase() };
      const isCur = (code === _aideLang);
      return '<button class="kta-readme-lang-btn' + (isCur ? ' active' : '') + '" type="button" ' +
             'data-target-lang="' + code + '" aria-label="' + meta.label + '" title="' + meta.label + '"' +
             (isCur ? ' aria-current="true"' : '') + '>' + meta.flag + '</button>';
    }).join("") + '</span>';

  const aideTitre = aideEn ? "❓ Help — Button reference" : "❓ Aide — Référence des boutons";

  // 🆕 v1.51.0 (Lot C) : le corps n'est plus le gros scroll monolithique mais
  // un HUB de sections (cartes par catégorie + recherche) → sous-modale par
  // section. Les sections restent définies dans _aideHtmlFr/En (source de
  // vérité inchangée), parsées par _aideRendreHub.
  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-aide-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">${aideTitre}</span>
        ${btnLang}
        <button class="kta-panneau-close" id="kta-aide-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps kta-aide-corps" id="kta-aide-corps"></div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  function _closeAll() { _aideFermerSousModal(); modal.remove(); }
  document.getElementById("kta-aide-close").addEventListener("click", _closeAll);
  modal.addEventListener("click", function (e) { if (e.target === modal) _closeAll(); });

  // 🆕 v1.45.x — Handler des onglets de langue (délégation sur tous les
  // drapeaux). Clic sur une langue ≠ courante → persiste (scope LOCAL doc, via
  // _setReadmeLang) + rebuild la modale dans l'autre langue. Ne touche pas la
  // langue globale de l'app. Même pattern que afficherReadme().
  modal.querySelectorAll(".kta-readme-lang-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const target = btn.getAttribute("data-target-lang");
      if (DOC_AVAILABLE_LANGS.indexOf(target) < 0) return;
      if (target === _getReadmeLang()) return; // déjà la langue courante
      _setReadmeLang(target);
      _closeAll();
      afficherAide();
    });
  });

  _aideRendreHub(document.getElementById("kta-aide-corps"), aideEn);
}

// =========================
// 🆕 v1.51.0 (Lot C) — Hub d'aide : sections groupées + sous-modale
// =========================
// Regroupement des sections d'aide pour le hub. `idx` = index de la section
// dans l'ordre du document _aideHtmlFr/En (IDENTIQUE FR/EN : les 2 ont le même
// nombre de sections dans le même ordre).
// ⚠️ Si tu AJOUTES / SUPPRIMES / RÉORDONNES une section dans _aideHtmlFr ET
// _aideHtmlEn, mets À JOUR ces index. Toute section non listée ici retombe
// automatiquement dans la catégorie « Autres » (filet de sécurité).
const AIDE_CATEGORIES = [
  { fr: "🚀 Prise en main",        en: "🚀 Getting started",     idx: [2, 26, 27] },
  { fr: "🗺️ Outils carte",         en: "🗺️ Map tools",           idx: [20, 22, 23, 21, 19, 17, 14, 15, 1, 28] },
  { fr: "💾 Données & session",     en: "💾 Data & session",      idx: [16, 5, 8, 9, 11, 13, 0, 24, 6] },
  { fr: "🔍 Recherche",            en: "🔍 Search",              idx: [4] },
  { fr: "🚨 Coordination secours", en: "🚨 Rescue coordination", idx: [18] },
  { fr: "⚙️ Système & sécurité",   en: "⚙️ System & security",   idx: [3, 25, 10, 12, 7] }
];

// Une ligne cliquable du hub (titre + chevron).
function _aideRow(titre, onClick) {
  const r = document.createElement("button");
  r.type = "button";
  r.className = "kta-aide-row";
  const t = document.createElement("span");
  t.className = "kta-aide-row-titre";
  t.textContent = titre;
  const chev = document.createElement("span");
  chev.className = "kta-aide-row-chevron";
  chev.textContent = "›";
  r.appendChild(t);
  r.appendChild(chev);
  r.addEventListener("click", onClick);
  return r;
}

function _aideRendreHub(corps, en) {
  if (!corps) return;

  // Parse les sections depuis le HTML monolithique (source de vérité inchangée).
  const raw = document.createElement("div");
  raw.innerHTML = en ? _aideHtmlEn() : _aideHtmlFr();
  const secNodes = Array.prototype.slice.call(raw.querySelectorAll(".kta-aide-section"));
  const sections = secNodes.map(function(node) {
    const t = node.querySelector(".kta-aide-section-titre");
    return { titre: t ? t.textContent.trim() : "?", node: node };
  });

  // Conserve l'intro générale si présente (sinon perdue au parsing des sections).
  const intro = raw.querySelector(".kta-aide-intro");
  if (intro) corps.appendChild(intro.cloneNode(true));

  // Barre de recherche
  const search = document.createElement("input");
  search.type = "search";
  search.className = "kta-aide-hub-search";
  search.placeholder = en ? "Search a section…" : "Rechercher une section…";
  corps.appendChild(search);

  const hub = document.createElement("div");
  hub.className = "kta-aide-hub";
  corps.appendChild(hub);

  // Ligne épinglée : cheatsheet des raccourcis clavier (ouvre ShortcutsCheatsheet).
  const cheatRow = _aideRow(en ? "⌨️ Keyboard shortcuts" : "⌨️ Raccourcis clavier", function() {
    if (window.ShortcutsCheatsheet && typeof window.ShortcutsCheatsheet.ouvrir === "function") {
      window.ShortcutsCheatsheet.ouvrir();
    }
  });
  cheatRow.dataset.aideTitre = (en ? "keyboard shortcuts" : "raccourcis clavier");
  hub.appendChild(cheatRow);

  // Catégories + lignes
  const used = {};
  AIDE_CATEGORIES.forEach(function(cat) {
    const rows = [];
    cat.idx.forEach(function(i) {
      if (i < 0 || i >= sections.length) return;
      used[i] = true;
      rows.push(sections[i]);
    });
    if (!rows.length) return;
    const ct = document.createElement("div");
    ct.className = "kta-aide-cat-titre";
    ct.textContent = en ? cat.en : cat.fr;
    hub.appendChild(ct);
    rows.forEach(function(s) {
      const r = _aideRow(s.titre, function() { _aideOuvrirSousModal(s, en); });
      r.dataset.aideTitre = s.titre.toLowerCase();
      hub.appendChild(r);
    });
  });

  // Filet de sécurité : sections non catégorisées (si le mapping dérive).
  const orphans = sections.filter(function(_, i) { return !used[i]; });
  if (orphans.length) {
    const ct = document.createElement("div");
    ct.className = "kta-aide-cat-titre";
    ct.textContent = en ? "📁 Other" : "📁 Autres";
    hub.appendChild(ct);
    orphans.forEach(function(s) {
      const r = _aideRow(s.titre, function() { _aideOuvrirSousModal(s, en); });
      r.dataset.aideTitre = s.titre.toLowerCase();
      hub.appendChild(r);
    });
  }

  // Message "aucun résultat"
  const empty = document.createElement("div");
  empty.className = "kta-aide-empty";
  empty.style.display = "none";
  empty.textContent = en ? "No section found." : "Aucune section trouvée.";
  corps.appendChild(empty);

  // Filtrage par recherche (titre)
  search.addEventListener("input", function() {
    const q = search.value.trim().toLowerCase();
    let visibles = 0;
    hub.querySelectorAll(".kta-aide-row").forEach(function(r) {
      const match = !q || (r.dataset.aideTitre || "").indexOf(q) >= 0;
      r.style.display = match ? "" : "none";
      if (match) visibles++;
    });
    // masque les titres de catégorie sans aucune ligne visible
    hub.querySelectorAll(".kta-aide-cat-titre").forEach(function(ct) {
      let sib = ct.nextElementSibling, any = false;
      while (sib && sib.classList.contains("kta-aide-row")) {
        if (sib.style.display !== "none") { any = true; break; }
        sib = sib.nextElementSibling;
      }
      ct.style.display = any ? "" : "none";
    });
    empty.style.display = visibles ? "none" : "";
  });
}

// Sous-modale : contenu d'UNE section + ← Retour (z-index 100001, au-dessus du hub).
function _aideOuvrirSousModal(section, en) {
  _aideFermerSousModal();
  const ov = document.createElement("div");
  ov.id = "kta-aide-submodal";
  ov.className = "kta-readme-modal-overlay kta-aide-submodal";
  ov.innerHTML =
    '<div class="kta-readme-modal-boite kta-aide-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<button class="kta-aide-submodal-back" type="button" id="kta-aide-back">← ' +
          (en ? "Back" : "Retour") + "</button>" +
        '<button class="kta-panneau-close" id="kta-aide-sub-close" type="button">✕</button>' +
      "</div>" +
      '<div class="kta-readme-modal-corps kta-aide-corps" id="kta-aide-sub-corps"></div>' +
    "</div>";
  document.documentElement.appendChild(ov);
  const corps = ov.querySelector("#kta-aide-sub-corps");
  if (corps && section && section.node) corps.appendChild(section.node.cloneNode(true));

  document.getElementById("kta-aide-back").addEventListener("click", _aideFermerSousModal);
  document.getElementById("kta-aide-sub-close").addEventListener("click", _aideFermerSousModal);
  ov.addEventListener("click", function(e) { if (e.target === ov) _aideFermerSousModal(); });
  ov.__esc = function(e) { if (e.key === "Escape") { e.stopPropagation(); _aideFermerSousModal(); } };
  document.addEventListener("keydown", ov.__esc, true);
}

function _aideFermerSousModal() {
  const ov = document.getElementById("kta-aide-submodal");
  if (!ov) return;
  if (ov.__esc) document.removeEventListener("keydown", ov.__esc, true);
  ov.remove();
}

// =========================
// AIDE — contenu HTML FR (référence des boutons)
// =========================
// 🆕 v1.45.x — Extrait tel quel du innerHTML historique de afficherAide().
// Retourne le corps de .kta-aide-corps (sections déroulables côté UI app).
function _aideHtmlFr() {
  return `

        <p class="kta-aide-intro">
          La barre latérale droite est organisée en groupes déroulables.
          Un seul groupe peut être ouvert à la fois — cliquer sur un autre referme le précédent.
        </p>

        <!-- v1.35.5 — sections dédiées en remplacement du bloc Nouveautés
             (feedback KARMA : "intégrer dans une section cohérente ou
             dédiée, pas en bloc Nouveautés à part"). Mode Histoire et
             Mode Sortie d'urgence ont chacune leur section identifiable. -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📖 Mode Histoire — Note + PDF du plan</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            Bouton <strong>📖</strong> à gauche de la batterie 🔋 → modale 2 onglets, <strong>propre à chaque plan</strong> :
          </p>
          <ul style="font-size:13px; color:#c0c8d8; margin:0 0 8px 16px; padding:0; line-height:1.5;">
            <li><strong>📝 Note libre</strong> — carnet de notes <strong>Markdown</strong> auto-sauvegardé (titres, gras, listes, liens, citations). Mode <strong>Aperçu</strong> pour lire / <strong>✏️ Éditer</strong> pour modifier la source.</li>
            <li><strong>📚 Histoire</strong> — affiche le PDF embarqué par l'auteur du plan, ou laisse <strong>📥 importer ton propre PDF</strong> (1 par plan, remplaçable). Sur iPhone : bouton <strong>↗️ Ouvrir dans un onglet</strong> pour le plein écran natif.</li>
          </ul>
          <p style="font-size:12px; color:#8892a4; margin:0; line-height:1.5;">
            Note libre + PDF sont <strong>inclus automatiquement dans l'export de session</strong> (.mkmsession.zip) → tout voyage avec ta session pour partage ou transfert. 100 % offline.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre" style="color:#ff8a5c;">🚨 Mode Sortie d'urgence — La sortie la plus proche</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            Bouton <strong>🚨</strong> entre 📖 Mode Histoire et la batterie 🔋. Tape (ou dis « <em>sortie</em> » à la voix 🎤) et l'app :
          </p>
          <ol style="font-size:13px; color:#c0c8d8; margin:0 0 8px 16px; padding:0; line-height:1.5;">
            <li>Scanne les POIs avec tag de sortie <strong>ouverte</strong> (<code>cao</code>, <code>peo</code>, <code>eso</code>) ou <code>entrée</code>.</li>
            <li>Calcule le vrai chemin navigable via pathfinder (gère les murs et les jonctions inter-niveaux).</li>
            <li>Affiche la plus proche + bouton <strong>🧭 Tracer l'itinéraire</strong> + dépliable <strong>Voir les N autres sorties</strong>.</li>
          </ol>
          <p style="font-size:12px; color:#8892a4; margin:0; line-height:1.5;">
            Si pas de tracker actif → mode picker (clique sur ta position). Multi-niveau OK. Vibration de confirmation. Versions fermées (<code>caf</code>/<code>pef</code>/<code>esf</code>) ignorées. 100 % offline.
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
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#d32f2f;">🛡️ Plans révoqués (anti-fuite v1.42) :</strong> si un plan ZIP fuite massivement (Telegram public,
            forum, etc.), l'auteur peut le révoquer côté serveur. À l'import du ZIP, l'app calcule son <strong>empreinte SHA-256</strong>
            <em>localement</em> et la compare à la liste publique <code>denylist.json</code> téléchargée au boot.
            Si match → <strong>modale rouge bloquante</strong> avec motif + date + bouton « Compris, supprimer ce plan » qui retire
            automatiquement le plan de ta liste. Couvre aussi le générateur (« Modifier un plan existant »).
            <strong style="color:#e9a13b;">🔄 Audit auto au démarrage (v1.42.3) :</strong> les plans déjà importés sont aussi
            vérifiés ~2s après le boot. Si l'un d'eux est révoqué depuis ton dernier import, il est supprimé automatiquement
            et une <strong>modale orange</strong> t'en informe (motif + date). Privacy stricte : <strong>0 empreinte envoyée au serveur</strong>.
            Liste consultable à <code>https://myktamap.fr/denylist.json</code>.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⚙️ Paramètres</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⚙️</span><span>Réglages, calibrage de l'échelle, debug, <strong>🌐 Géoréférencement GPS</strong> — réglages <strong>par plan</strong>. Le calibrage GPS saisi ici est auto-rempli quand tu ouvres 📡 Export externe. Les 2 points de calibrage acceptent <strong>🔍 Chercher un point</strong> et <strong>📍 Cliquer carte</strong> pour saisir les coords plan (comme dans la modale Export). La <strong>🧭 Position initiale du tracker</strong> propose les mêmes deux boutons pour définir le point de départ sans saisir les coordonnées à la main.</span>
            <span class="kta-aide-icone">🎬</span><span><strong>Mode présentation</strong> — bouton <strong>« 🎬 Activer le mode présentation »</strong> placé <strong>tout en haut</strong> de la modale Réglages pour accès en 1 vue. La touche <kbd>F</kbd> y donne aussi accès sur PC. Sortie : touche <kbd>F</kbd> / <kbd>Échap</kbd> (PC) ou bouton flottant ✕ (mobile).</span>
            <span class="kta-aide-icone">🔆</span><span><strong>Garder l'écran allumé (Wake Lock)</strong> — toggle dans Réglages (et aussi dans ⚙️ Configuration loader). Empêche la mise en veille tant que l'app est ouverte. <strong>Idéal en cavité</strong> pour ne pas débloquer son téléphone toutes les 30s. Persistant entre sessions, auto-relâché en arrière-plan, ré-activé au retour. Compat Chrome 84+, Edge 84+, Safari iOS 16.4+ (PWA). Toggle masqué si la fonction n'est pas supportée (Firefox).</span>
            <span class="kta-aide-icone">☀️</span><span><strong>Thème clair / sombre</strong> — bascule entre fond beige cataphile (clair) et fond noir nuit (sombre, défaut). Activable <strong>uniquement depuis la home → Configuration → ☀️ Activer le thème CLAIR</strong>. Le toggle déclenche un rechargement complet de l'app pour éviter les bugs résiduels d'affichage. Choix conservé globalement par appareil.</span>
            <span class="kta-aide-icone">🚀</span><span>Mode Performance ULTRA (dans ⚙️ Réglages) — pour les gros plans qui crashent. Réglage PAR PLAN depuis v1.59.0 (opt-in, tes points de session restent toujours affichés)</span>
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
            (reload requis), <strong>🎯 Désactiver cercles intersections</strong> (seuil 50 vs 500), <strong>🚫 Désactiver popups
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
            <span class="kta-aide-icone">📊</span><span><strong>Éditeur de données du plan</strong> — modifie les données (points, tracés, zones) sous forme de tableau</span>
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
            <span class="kta-aide-icone">🏅</span><span><strong>Rang / badge</strong> (Touriste → Grand Maître) selon ton temps passé, tes plans explorés et tes km de galerie — <strong>anneau coloré + médaille</strong> sur la photo, et le détail (3 métriques + progression + score) dans la fiche profil</span>
            <span class="kta-aide-icone">🏆</span><span><strong>Hauts faits</strong> — <strong>38 succès</strong> à débloquer : 8 familles × 4 paliers (🥉🥈🥇👑, plans/km/temps/POIs/tracés/zones/structures) <strong>+ 6 « 🎉 Spéciaux »</strong> one-shot (Touche-à-tout, Centurion, Taupe, Multi-niveaux, Marathon, Complétiste). Toast au déblocage + grille N/38 dans la fiche profil. Score + nb de hauts faits affichables au bandeau (section 🎨 Stats du bandeau)</span>
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
          <div class="kta-aide-section-titre">🧭 Menu Tracker (plein écran)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🧭</span><span>Le bouton 🧭 Tracker ouvre un <strong>modal plein écran de grosses tuiles</strong> (au lieu de l'ancien menu latéral) — plus lisible et tactile sur mobile.</span>
            <span class="kta-aide-icone">📋</span><span>3 sections : <strong>Suivi</strong> (démarrer/arrêter, recaler, Ma position, verrou sur tracé) · <strong>Outils</strong> (boussole, itinéraire, replay, heatmap) · <strong>Urgence</strong> (rouge).</span>
            <span class="kta-aide-icone">📊</span><span>En-tête : état du suivi (actif/inactif) + distance parcourue + nombre de pas.</span>
            <span class="kta-aide-icone">✕</span><span>Fermeture : croix, clic en dehors, ou touche Échap. Toucher une tuile ferme le menu puis lance l'action.</span>
          </div>
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
            <span class="kta-aide-icone">💾</span><span>Exporter — modale avec 5 onglets : 🚀 Full · 🎨 Avancé · 🔄 Conversion · <strong>🔗 Fusion</strong> (fusionne N fichiers data layer en 1 fichier par type — aussi accessible depuis l'accueil) · <strong>📡 Export externe (KMZ + GPX)</strong>. L'export Full embarque la <strong>timeline tracker complète</strong> (parcours + timeline temporelle datée + heure de départ) → permet de transporter l'historique GPS entre appareils (heatmap multi-sessions + replay multi-appareils). Ignoré en conversion de calque.</span>
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
            Le groupe Tracker s'ouvre en <strong>modal plein écran</strong> de tuiles (cf « 🧭 Menu Tracker »)
            regroupant ses <strong>11 actions</strong>. Ordre, du haut vers le bas :
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">▶️⏹️</span><span><strong>Play / Stop</strong> — démarrer / arrêter le tracking par capteurs PDR (expérimental). Icône dynamique ▶️↔⏹️ selon l'état</span>
            <span class="kta-aide-icone">🧭</span><span><strong>Boussole</strong> — toggle du widget Nord magnétique (orientation utile en cavité)</span>
            <span class="kta-aide-icone">📍</span><span><strong>Mode recalage</strong> — clic sur la carte ou sur un point existant pour repositionner le marker. Fermeture auto après clic + retour boussole automatique</span>
            <span class="kta-aide-icone">🎯</span><span><strong>Ma position</strong> — recentre la carte sur la position courante du tracker (zoom conservé). Marche même tracker à l'arrêt</span>
            <span class="kta-aide-icone">🔓</span><span><strong>Suspendre le verrou sur tracé</strong> — désactive temporairement le verrouillage sur les tracés (30 s / 1 min / 10 min / jusqu'à réactivation), avec compte-à-rebours dans la barre du bas</span>
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
          <p style="font-size:12px; color:#8892a4; margin:14px 0 8px; line-height:1.5;">
            <strong style="color:#f4c542;">🌍 État 3 — BRIEFING SECOURS EXTERNES (Vue OSM × Mode Secours, v1.41)</strong> — coordination avec les secours externes (pompiers, GRIMP, SDIS).
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🚪</span><span>Nouveau tag built-in <strong>Point d'entrée du plan</strong> (catégorie « 🚨 Secours » dans la légende) pour marquer les entrées principales d'urgence</span>
            <span class="kta-aide-icone">📍</span><span><strong>GPS surface par équipe</strong> : champ « 📍 GPS surface » dans la fiche équipe (format « lat, lng » WGS84), pour PC secours / lieu de rdv pompiers</span>
            <span class="kta-aide-icone">🌍</span><span>Bouton <strong>🌍 Vue OSM</strong> disponible dans bandeau Édition ET dans les 3 footers Live → montrer la position du plan sur OpenStreetMap sans quitter la vue active</span>
            <span class="kta-aide-icone">🚒</span><span><strong>Briefing pompiers PDF dédié</strong> (bouton 🚒) : page A4 avec liens cliquables OSM + Google Maps + équipes + GPS surface + POI critiques (entrée plan / sortie urgence / cavages)</span>
            <span class="kta-aide-icone">📤</span><span>Page <strong>« Briefing surface »</strong> automatiquement intégrée au rapport PDF post-mission</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:14px 0 0; line-height:1.5;">
            <strong style="color:#8cb4ff;">💾 Save Offline — Vue OSM hors-ligne (v1.43)</strong> — bouton <strong>💾 Save Offline</strong> disponible dans la modale Vue OSM et dans le widget Vue OSM de l'accueil.
            Un clic télécharge les tuiles OpenStreetMap couvrant la zone du plan et les range dans le stockage local du téléphone (200 tuiles max par clic, pour respecter la politique d'usage d'OSM — relance le bouton si tu veux étendre la couverture ou faire plusieurs zooms).
            Une fois en cache, l'icône <strong>💾</strong> reste visible pour t'indiquer que la zone est sauvegardée, et la <strong>Vue OSM s'ouvre direct hors-réseau</strong> (souterrain, zone blanche, mode avion) — pas de message d'erreur, pas de tentative de connexion : l'app détecte qu'il y a du cache et affiche la carte instantanément.
            Le cache est <strong>partagé</strong> entre la Vue OSM d'accueil, la modale Vue OSM et le Mode Secours — un seul Save Offline couvre les trois.
            <span style="color:#a8b3c8;">Réflexe terrain : Save Offline avant de partir, quand tu as encore du réseau.</span>
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
            <strong style="color:#a8b3c8;">🔄 Itinéraire vivant (v1.61.0) :</strong> à chaque <strong>recalage de position</strong>
            (clic carte, « 📍 Je suis ici », arrivée par un portail), l'itinéraire actif est <strong>recalculé depuis ta
            nouvelle position</strong> (étapes restantes conservées dans l'ordre planifié, évitements respectés).
            « 📍 Je suis ici » sur un point qui est une <strong>étape de l'itinéraire</strong> = <strong>validation de
            passage</strong> (marker ✓ vert, ligne rayée dans la modale, étape exclue des prochains calculs) — dans
            <strong>n'importe quel ordre</strong>. Toutes les étapes validées → « 🎉 Itinéraire terminé », le tracé
            s'efface (le tracé tracker reste). Les validations survivent au reload (sauvegardées avec la session).
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

        <!-- 🌀 v1.57.0 — Liaisons inter-plan (section idx 28, ajoutée EN FIN
             pour ne décaler aucun index d'AIDE_CATEGORIES) -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🌀 Liaisons inter-plan (« portails »)</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            Lie un <strong>point d'un plan</strong> à un <strong>point d'un autre plan</strong> — comme un portail entre
            deux réseaux qui se touchent (deux carrières voisines, plan général ↔ plan de détail).
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>Créer</strong> : clique un point (session ou data layer) → bouton
            <strong>🌀 Lier à un autre plan</strong> → choisis le plan cible puis recherche le point d'arrivée
            (nom, id ou tag — pas besoin d'ouvrir l'autre plan). La liaison est <strong>bidirectionnelle</strong> :
            visible dans la fiche des deux points. Un point peut porter plusieurs liaisons.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>Utiliser</strong> : dans la fiche du point, ligne 🌀 → bouton <strong>➜</strong> → confirmation →
            l'app change de plan (session sauvegardée automatiquement), <strong>bascule sur le niveau du point
            d'arrivée</strong> et te dépose dessus (flash bleu). Marquage visuel au choix : donne le
            <strong>tag « Portail »</strong> au point pour son <strong>icône vortex dédiée</strong>, ou garde
            n'importe quel tag (aucun marquage).
            <strong>📍 Recalage à l'arrivée</strong> (v1.61.0) : traverser physiquement un portail (➜ d'une liaison,
            « Prendre le portail » d'un itinéraire) <strong>recale ta position tracker sur le point d'arrivée</strong> —
            la recherche multi-plans et le gestionnaire, eux, ne recalent pas (consulter ≠ se déplacer).
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>↩️ Retour</strong> (v1.58.0) : après un saut, un bouton flottant « Retour : &lt;plan&gt; »
            (15 s, bas de l'écran) te ramène au plan et à la <strong>vue exacte</strong> d'où tu venais (niveau + zoom).
            Les sauts s'empilent — 3 portails enchaînés = 3 retours possibles.
            <strong>Discret au besoin</strong> (v1.61.0) : <strong>[–]</strong> le réduit en mini-pastille ↩️
            (clic = ré-agrandir), <strong>[✕]</strong> le ferme — le choix est retenu pour les prochains sauts.
            <strong>🌐 Recherche multi-plans</strong> (v1.58.0) : cherche un point dans <strong>toute ta
            bibliothèque</strong> depuis l'accueil (bouton 🌐) ou via la recherche Ctrl+K (bouton
            « Chercher dans tous les plans ») — un clic charge le bon plan et te centre dessus.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🌀 Mes liaisons</strong> (v1.59.0) : sur l'<strong>accueil</strong>, liste toutes tes liaisons
            (état ⛔ si un plan est absent, ➜ pour y aller, 🗑️ pour supprimer).
            <strong>🕸️ Vue Graphe</strong> (v1.65.0) : bascule 📋 Liste ⇄ 🕸️ Graphe — la bibliothèque en
            réseau (plans = bulles avec badges + compteur, portails = traits dont l'épaisseur suit le nombre
            de liaisons, plans sans liaison en bande dédiée). Clic bulle = ouvrir le plan, clic trait =
            détail de la frontière, bulles déplaçables au doigt.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🧭 Itinéraire inter-plan</strong> (v1.60.0, refondu v1.64.0) : demande un trajet vers un
            point d'un <strong>autre plan</strong> (modale Itinéraire → « 🌐 Destination sur un autre plan »,
            ou bouton 🧭 dans la recherche multi-plans). L'app compare les portails au coût réel, affiche les
            étapes et la distance totale — tes <strong>points de passage de la modale sont visités d'abord</strong>,
            dans l'ordre. « <strong>🗺️ C'est parti</strong> » trace le trajet et te laisse <strong>marcher</strong> :
            la traversée se propose quand tu es AU portail (bouton flottant « 🌀 Portail suivant », ➜ du popup,
            ou « 📍 Je suis ici » sur le point-portail). Coche <strong>« 🌀 Itinéraire via plusieurs plans »</strong>
            dans la recherche multi-plans pour traverser des plans intermédiaires (A → B → C, 3 traversées max) —
            chaque arrivée trace le tronçon et propose le portail suivant. Impossible ? Le message t'explique
            pourquoi (pas de portail, plan hors-ligne, destination isolée…).
          </p>
          <p style="font-size:12px; color:#8892a4; margin:0; line-height:1.5;">
            Plan cible absent de l'appareil → la liaison s'affiche (⛔) mais « y aller » nécessite d'ajouter le plan.
            Supprimer un point supprime ses liaisons (des deux côtés). Les liaisons voyagent avec l'export de session.
            Si un filtre de tags masque le point d'arrivée, un avertissement s'affiche (le filtre n'est jamais modifié).
            Données d'un plan injoignables (hors-ligne) → l'app le signale au lieu d'un « 0 points » muet.
          </p>
        </div>
  `;
}


// =========================
// AIDE — contenu HTML EN (button reference)
// =========================
// 🆕 v1.45.x — Traduction fidèle de _aideHtmlFr(). Même structure HTML
// (classes/ids/styles inline/emojis). Valeurs-données conservées (tags
// cao/peo/eso, raccourcis E/M/Z, noms OTAN Alpha/Bravo, URLs).
function _aideHtmlEn() {
  return `

        <p class="kta-aide-intro">
          The right-hand sidebar is organized into collapsible groups.
          Only one group can be open at a time — clicking another closes the previous one.
        </p>

        <!-- v1.35.5 — sections dédiées en remplacement du bloc Nouveautés
             (feedback KARMA : "intégrer dans une section cohérente ou
             dédiée, pas en bloc Nouveautés à part"). Mode Histoire et
             Mode Sortie d'urgence ont chacune leur section identifiable. -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📖 History Mode — Map note + PDF</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>📖</strong> button to the left of the battery 🔋 → 2-tab modal, <strong>specific to each map</strong>:
          </p>
          <ul style="font-size:13px; color:#c0c8d8; margin:0 0 8px 16px; padding:0; line-height:1.5;">
            <li><strong>📝 Free note</strong> — auto-saved <strong>Markdown</strong> notebook (headings, bold, lists, links, quotes). <strong>Preview</strong> mode to read / <strong>✏️ Edit</strong> to modify the source.</li>
            <li><strong>📚 History</strong> — displays the PDF embedded by the map author, or lets you <strong>📥 import your own PDF</strong> (1 per map, replaceable). On iPhone: <strong>↗️ Open in a tab</strong> button for native full screen.</li>
          </ul>
          <p style="font-size:12px; color:#8892a4; margin:0; line-height:1.5;">
            Free note + PDF are <strong>automatically included in the session export</strong> (.mkmsession.zip) → everything travels with your session for sharing or transfer. 100% offline.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre" style="color:#ff8a5c;">🚨 Emergency Exit Mode — The nearest exit</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🚨</strong> button between 📖 History Mode and the battery 🔋. Tap it (or say "<em>exit</em>" by voice 🎤) and the app:
          </p>
          <ol style="font-size:13px; color:#c0c8d8; margin:0 0 8px 16px; padding:0; line-height:1.5;">
            <li>Scans POIs tagged as <strong>open</strong> exits (<code>cao</code>, <code>peo</code>, <code>eso</code>) or <code>entrée</code>.</li>
            <li>Computes the actual navigable path via the pathfinder (handles walls and inter-level junctions).</li>
            <li>Displays the nearest one + <strong>🧭 Plot the route</strong> button + collapsible <strong>See the N other exits</strong>.</li>
          </ol>
          <p style="font-size:12px; color:#8892a4; margin:0; line-height:1.5;">
            If no active tracker → picker mode (click your position). Multi-level OK. Confirmation vibration. Closed versions (<code>caf</code>/<code>pef</code>/<code>esf</code>) ignored. 100% offline.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📚 Help / Docs / Legend</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">❓</span><span>This help — button reference</span>
            <span class="kta-aide-icone">📖</span><span>User documentation</span>
            <span class="kta-aide-icone">🤖</span><span>AI Help — download a context file to paste into ChatGPT/Claude/Gemini/etc.</span>
            <span class="kta-aide-icone">🗺️</span><span>Legend of the map's icons</span>
            <span class="kta-aide-icone">🚨</span><span>Public alert (loader button, left of 📖) — shows the current alert, or "No alert in progress" if the situation is OK</span>
            <span class="kta-aide-icone">🔒</span><span><strong>Lock the application</strong> (loader button, right of ⚙️) — if a local access code is set, stops active modules and restarts MyKTAMap: the PIN prompt shows at startup and the code must be re-entered to resume. If no code is set, a modal invites you to create one from ⚙️ Configuration.</span>
            <span class="kta-aide-icone">🏷️</span><span>Version badge (loader footer) — click to view the update modal or the notes of the installed version. Blinks blue if a new version is available.</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff8a5c;">🚨 Public alerts:</strong> if the author broadcasts an alert (fire, closure, toxic gas...),
            a pulsing red modal appears automatically after the splash, with title, message and instructions. 3 possible levels:
            <strong>emergency</strong> (red pulse, critical situation), <strong>warning</strong> (orange) or <strong>info</strong> (blue).
            The <strong>🚨</strong> button in the loader header lets you re-read the alert at any time, OR check
            "✅ No alert in progress" if the situation has returned to normal. Once "Got it" is clicked, the modal no longer reappears
            on reload as long as the alert is the same — unless the author publishes a new one.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#d32f2f;">🛡️ Revoked maps (anti-leak v1.42):</strong> if a ZIP map leaks massively (public Telegram,
            forum, etc.), the author can revoke it server-side. When the ZIP is imported, the app computes its <strong>SHA-256 fingerprint</strong>
            <em>locally</em> and compares it against the public <code>denylist.json</code> list downloaded at boot.
            On a match → <strong>blocking red modal</strong> with reason + date + a "Got it, delete this map" button that automatically
            removes the map from your list. Also covers the generator ("Edit an existing map").
            <strong style="color:#e9a13b;">🔄 Auto audit at startup (v1.42.3):</strong> already-imported maps are also
            checked ~2s after boot. If one of them has been revoked since your last import, it is deleted automatically
            and an <strong>orange modal</strong> informs you (reason + date). Strict privacy: <strong>0 fingerprints sent to the server</strong>.
            List viewable at <code>https://myktamap.fr/denylist.json</code>.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⚙️ Settings</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⚙️</span><span>Settings, scale calibration, debug, <strong>🌐 GPS georeferencing</strong> — <strong>per-map</strong> settings. The GPS calibration entered here is auto-filled when you open 📡 External export. Both calibration points accept <strong>🔍 Search a point</strong> and <strong>📍 Click map</strong> to enter the map coordinates (as in the Export modal). The <strong>🧭 Initial tracker position</strong> offers the same two buttons to set the starting point without typing the coordinates by hand.</span>
            <span class="kta-aide-icone">🎬</span><span><strong>Presentation mode</strong> — <strong>"🎬 Enable presentation mode"</strong> button placed <strong>at the very top</strong> of the Settings modal for one-glance access. The <kbd>F</kbd> key also opens it on PC. Exit: <kbd>F</kbd> / <kbd>Esc</kbd> key (PC) or floating ✕ button (mobile).</span>
            <span class="kta-aide-icone">🔆</span><span><strong>Keep the screen on (Wake Lock)</strong> — toggle in Settings (and also in ⚙️ loader Configuration). Prevents sleep while the app is open. <strong>Ideal underground</strong> so you don't have to unlock your phone every 30s. Persistent across sessions, auto-released in the background, re-enabled on return. Compatible with Chrome 84+, Edge 84+, Safari iOS 16.4+ (PWA). Toggle hidden if the feature isn't supported (Firefox).</span>
            <span class="kta-aide-icone">☀️</span><span><strong>Light / dark theme</strong> — switches between a beige cataphile background (light) and a black night background (dark, default). Can only be enabled <strong>from the home → Configuration → ☀️ Enable LIGHT theme</strong>. The toggle triggers a full app reload to avoid residual display bugs. Choice kept globally per device.</span>
            <span class="kta-aide-icone">🚀</span><span>ULTRA Performance mode (in ⚙️ Settings) — for large maps that crash. PER-PLAN setting since v1.59.0 (opt-in, your session points always stay visible)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Contains the 🎯 button to calibrate the scale, 🐛 for detailed logs.
            <strong>The full reset is no longer here</strong> — go through ⚙️ Configuration on the home page →
            💥 Reset everything. Same for the <strong>🔐 Local access code (PIN/Face ID)</strong>
            which can only be enabled from the ⚙️ loader Configuration (by design).
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#f4c542;">🚀 ULTRA Performance mode:</strong> a section in the ⚙️ Settings modal for
            large maps / weak devices. Enable the <strong>🚀 ULTRA</strong> toggle to apply 6 aggressive optimizations at once,
            or adjust them individually: <strong>🪜 Decimate paths when zoomed out</strong>, <strong>⚡ Disable zoom/pan animations</strong>
            (reload required), <strong>🎯 Disable intersection circles</strong> (threshold 50 vs 500), <strong>🚫 Disable popups
            on data layers</strong> (use 🔍 Search instead), <strong>🐢 Slow auto-save</strong> (30s vs 1.5s),
            <strong>👁️ Render only visible paths</strong> (optimized rendering of the visible area). No optimization touches the image (already
            handled by the load-time performance mode). Global persistence on this device, kept across sessions.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🔍 Unified search <span style="font-size:10px; color:#8892a4; font-weight:400;">(Ctrl+K)</span></div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📍</span><span>Points (name, id, tag, description, state)</span>
            <span class="kta-aide-icone">🛣️</span><span>Paths (label, type, M-LVL level)</span>
            <span class="kta-aide-icone">⬛</span><span>Zones (type, level)</span>
            <span class="kta-aide-icone">🏛️</span><span>Structures (pillars, walls, faces)</span>
            <span class="kta-aide-icone">🌐</span><span><strong>GPS coordinates</strong> — paste <code>48.6808, 2.1588</code> directly (Google Maps format). If the map is georeferenced: a POI within 50 px → "Go to point"; otherwise → "Create a point here" → opens the form pre-filled at that position</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Search covers 4 categories + GPS.
            <strong>Ctrl+K keyboard shortcut</strong> (Cmd+K on Mac) to open/close instantly.
            Results grouped by category with counters. On click: centers + visual flash
            (circle for points, dashed polyline for paths, transparent polygon for zones / pillars).
            Filter by category + layer + tag.
          </p>
          <p style="font-size:12px; color:#8cb4ff; margin:6px 0 0; line-height:1.5;">
            <strong>🌐 GPS format:</strong> this same <code>lat, lng</code> format is accepted in
            <strong>⚙️ Settings → Georeferencing</strong>, in the <strong>📡 External export modal (KMZ/GPX)</strong>
            and when <strong>creating a georeferenced map</strong> — paste from Google Maps, the app splits
            the 2 values automatically.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬇️ Load / Import</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📥</span><span><strong>Import</strong> — a single button that opens a 2-card modal: 📥 <strong>MyKTAMap session</strong> (.json / .zip with photos) or 📤 <strong>External GPX</strong> (TopoDroid, OsmAnd, Avenza, Strava, Garmin… requires GPS calibration). Preview before import, Ctrl+Z to undo.</span>
            <span class="kta-aide-icone">📊</span><span>Edit a JSON file as a table</span>
            <span class="kta-aide-icone">🗂️</span><span>Switch map (back to home)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Multi-map:</strong> every map you load (server or local ZIP) is remembered
            in your personal list. When you return to the home, you find:
          </p>
          <ul style="font-size:12px; color:#8892a4; margin:4px 0 0 18px; line-height:1.6;">
            <li><strong style="color:#a8b3c8;">▶️ Resume</strong> — relaunches the last opened map in one click.</li>
            <li><strong style="color:#a8b3c8;">📅 Recent</strong> — the last 5 maps used.</li>
            <li><strong style="color:#a8b3c8;">📂 All</strong> — all your known maps.</li>
            <li><strong style="color:#a8b3c8;">🌐</strong> = server map · <strong style="color:#a8b3c8;">💾</strong> = local ZIP map.</li>
            <li><strong style="color:#a8b3c8;">💾 Export / 📂 Import</strong> your list to share or migrate it.</li>
          </ul>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Server maps</strong> — the app automatically detects maps
            published on the server and offers them in your list.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Local maps</strong> — when you click a local map, the app uses
            the persistence method chosen at the initial load:
          </p>
          <ul style="font-size:12px; color:#8892a4; margin:4px 0 0 18px; line-height:1.6;">
            <li>
              <strong style="color:#6ce28a;">✅ Saved</strong> — the ZIP is copied into the browser
              (check <strong>"💾 Save this map in the app"</strong> on import).
              Reloads in 0 clicks, works <strong>even offline</strong> and on <strong>mobile</strong>.
              Storage limit depends on the browser (~50 MB iOS, several GB Android/desktop).
            </li>
            <li>
              <strong style="color:#8cb4ff;">🔐 Permanent access</strong> — Chrome/Edge desktop only,
              via the <strong>"🔐 Allow permanent access"</strong> button. The browser keeps
              a reference to the ZIP on disk (1 click max after a refresh).
            </li>
            <li>
              <strong style="color:#c0c8d8;">📁 Re-selection</strong> — the ZIP is requested on every click
              (drag & drop or click the area). Default behavior without persistence.
            </li>
          </ul>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">📱 Mobile</strong> — prefer <strong>"💾 Save in the app"</strong>
            which works everywhere. For maximum persistence on iPhone, install the app as a
            <strong>PWA</strong> (Share → Add to Home Screen) before saving the map.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🏗️ Create / Edit a map</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🏗️</span><span>Open the map generator (direct click)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Lets you create a new map or edit an existing one from a ZIP archive.
            2 modes — <strong>🚀 Simple</strong> (just image + name + version + V2/M-LVL → ZIP ready in 30 sec)
            and <strong>⚙️ Advanced</strong> (layers, tracking, icons, GPS georef, <strong>🏷️ map legend</strong>).
            Choice remembered locally. Edit mode always forces Advanced to preserve the source map's customizations.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">👤 Profile mode</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">👤</span><span><strong>Profile banner</strong> in the loader header (above "My maps") — avatar + nickname + global mini-stats (📍 points · 🛣️ paths · ⬛ zones · 🏛️ structures + cumulative time, kept)</span>
            <span class="kta-aide-icone">🏅</span><span><strong>Rank / badge</strong> (Tourist → Grandmaster) based on your time spent, maps explored and km of gallery — <strong>colored ring + medal</strong> on the photo, and the breakdown (3 metrics + progress + score) in the profile card</span>
            <span class="kta-aide-icone">🏆</span><span><strong>Achievements</strong> — <strong>38 to unlock</strong>: 8 families × 4 tiers (🥉🥈🥇👑, maps/km/time/POIs/paths/zones/structures) <strong>+ 6 « 🎉 Special »</strong> one-shot (Jack of all trades, Centurion, Mole, Multi-level, Marathon, Completionist). Toast on unlock + N/38 grid in the profile card. Score + achievement count can be shown in the banner stats (🎨 Banner stats)</span>
            <span class="kta-aide-icone">✏️</span><span>Click the <strong>nickname</strong> or the <strong>avatar</strong> → editing modal (free nickname + profile photo upload)</span>
            <span class="kta-aide-icone">🖼️</span><span>Profile photo auto-compressed (max 512px, JPEG q88) — otherwise the default avatar = the nickname's initial in a colored circle</span>
            <span class="kta-aide-icone">📦</span><span>Profile exportable / importable — share between devices without a server</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>100% local storage</strong> in a dedicated local store — nickname + photo + dates.
            No data transmitted. Default profile empty (👤 anonymous): no existing user is forced to configure anything.
            <strong>Banner stats</strong>: from 2 stats available the banner displays them in mobile median,
            cumulative time survives reloads.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⭐ Point favorites</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⭐</span><span>Button in a POI's popup — toggle ☆ inactive / ⭐ active (amber)</span>
            <span class="kta-aide-icone">⭐</span><span>Left sidebar group (right after M-LVL) — side flyout listing the current map's favorites</span>
            <span class="kta-aide-icone">🎯</span><span>Click a favorite → centers the map + flashes an orange circleMarker for 3 s + opens the original marker's popup</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>Remembered locally per map</strong>.
            <strong>Full copy</strong> of the points (id, name, coordinates, tag, layer) — resilient if the point is moved or removed from the map.
            <strong>Not shared via exports</strong> (= a local view per device). Persistent across sessions and survives a reload.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⏪ History (Undo / Redo) <span style="font-size:10px; color:#8892a4; font-weight:400;">(Ctrl+Z / Ctrl+Y)</span></div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⏪</span><span>Undo the last action (Ctrl+Z) — up to 50 actions</span>
            <span class="kta-aide-icone">⏩</span><span>Redo the undone action (Ctrl+Y or Ctrl+Shift+Z)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Covers the 4 categories of drawable annotations —
            ✏️ points, 🛣️ paths, ⬛ zones, 🏛️ structures. Atomic granularity (1 click = 1 undoable).
            A discreet toast on every action. Sidebar buttons auto-greyed when the stack is empty.
            History not saved: starts from scratch on reload, auto-reset when switching map.
            <strong>⚠️ Photos excluded</strong> (irreversible deletion).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🪫 Battery indicator</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⚡</span><span>Header chip — charging (green)</span>
            <span class="kta-aide-icone">🪫</span><span>Header chip — discharging (color according to level)</span>
            <span class="kta-aide-icone">🔋</span><span>🔋 STATUS block of emergency mode (level + state shown large)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>3 display points</strong>: new interface header (⚡/🪫 chip next to session counters), 📋 Active session modal footer, 🔋 STATUS block of emergency mode.
            <strong>Graduated warnings</strong> via toast at 20% / 10% / 5% (once per threshold per discharge cycle).
            <strong>⚠️ Limited compatibility</strong>: the browser's battery feature is available in Chromium only (Android Chrome, PC Chrome/Edge).
            On Safari iOS and recent Firefox, it was removed for privacy reasons — the chip is then <strong>hidden</strong>, with no error message.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📊 Enriched session stats</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📊</span><span>Stats block at the top of the 📋 Active session modal</span>
            <span class="kta-aide-icone">📋</span><span>Copy the summary to the clipboard (plain text, ready for Discord / SMS / email)</span>
            <span class="kta-aide-icone">💾</span><span>TXT export — downloads a .txt file with the full summary</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Display: total annotations, breakdown by type (📍 points · 🛣️ paths · ⬛ zones · 🏛️ structures), <strong>cumulative distance</strong> of paths (auto m → km), <strong>cumulative area</strong> of zones (auto m² → ha), attached POI photos, time elapsed since the session started.
            In multi-level (M-LVL), an additional per-level breakdown is shown.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📊 Memory inspector</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📊</span><span>"📊 View memory state" button in ⚙️ loader Configuration (home) → new 📊 Inspector section</span>
            <span class="kta-aide-icone">🗂️</span><span>localStorage: MyKTAMap keys sorted by size + mini proportion bar</span>
            <span class="kta-aide-icone">💾</span><span>IndexedDB: 3 databases (handles / backups / photos) + native scan of third-party databases, count per store</span>
            <span class="kta-aide-icone">📦</span><span>PWA cache: list of caches, active cache marked (★), sample of the first 12 assets</span>
            <span class="kta-aide-icone">📈</span><span>Storage estimate: browser usage / quota with a color bar (green → yellow → red)</span>
            <span class="kta-aide-icone">🧠</span><span>Runtime: loaded map, active session (📍/🛣️/⬛/🏛️), loaded/missing JS modules</span>
            <span class="kta-aide-icone">📋</span><span>📋 Copy report button → plain markdown-like text ready to paste into Discord / email / GitHub</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            A <strong>transparency + debug</strong> tool. Shows a readable overview of everything MyKTAMap has written locally in your browser. Handy for diagnosing a bug ("my session disappears", "my photos are gone") or checking that a full reset really purged everything. <strong>Read-only, 100% local</strong> — no data transmitted.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🏷️ Customizable legend</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">✏️</span><span><strong>3-level cascade</strong>: session &gt; map &gt; MKM default (each level overrides the next)</span>
            <span class="kta-aide-icone">📐</span><span><strong>Session</strong> editing (personal, local): 🖼️ PNG Export modal → "Customize labels" or the ✏️ Edit button in the 🗺️ map-mode Legend</span>
            <span class="kta-aide-icone">🏗️</span><span><strong>Map-level</strong> editing (shared with all users of the map): map Generator in <strong>Advanced mode</strong> → "🏷️ Map legend" section</span>
            <span class="kta-aide-icone">✨</span><span>4 categories covered: 📍 icons / 🛣️ paths / ⬛ zones / 🏛️ structures — rename, hide, or add <strong>custom drawable</strong> entries</span>
            <span class="kta-aide-icone">🌍</span><span><strong>KMZ round-trip</strong>: the map legend travels with your exported KMZ → auto-restored when re-imported into another MyKTAMap instance. Ignored by Google Earth / OsmAnd / Avenza.</span>
            <span class="kta-aide-icone">📤</span><span><strong>GPX round-trip</strong>: same for GPX via the GPX file's metadata. Compatible with TopoDroid, OsmAnd, Strava, etc.</span>
            <span class="kta-aide-icone">👁️</span><span>On re-import (KMZ or GPX), the summary/preview explicitly shows "✅ Map custom legend detected: N renamed · M hidden · K customs" before generating the MyKTAMap ZIP.</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>Use case</strong>: a cataphile creating a quarry map can rename "Water" to "Bottom lake", hide the types they never use, and add their own drawable types ("Votive niche", "Stela", etc.). These customizations apply <strong>automatically</strong> to everyone who loads their map, in KMZ as well as GPX. Each user can still override their own session on top without breaking anything.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Tracker menu (full-screen)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🧭</span><span>The 🧭 Tracker button opens a <strong>full-screen modal of large tiles</strong> (instead of the old side menu) — clearer and more touch-friendly on mobile.</span>
            <span class="kta-aide-icone">📋</span><span>3 sections: <strong>Tracking</strong> (start/stop, recalibrate, My position, path lock) · <strong>Tools</strong> (compass, route, replay, heatmap) · <strong>Emergency</strong> (red).</span>
            <span class="kta-aide-icone">📊</span><span>Header: tracking state (on/off) + distance travelled + step count.</span>
            <span class="kta-aide-icone">✕</span><span>Close: cross, click outside, or Esc key. Tapping a tile closes the menu then runs the action.</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🎬 Tracker session replay</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🎬</span><span>Replay button in the 🧭 Tracker group — opens the full-screen modal</span>
            <span class="kta-aide-icone">▶️</span><span>Play / Pause / Restart / End — timeline slider + speed selector 0.5× → 10×</span>
            <span class="kta-aide-icone">⛶</span><span>Toggle compact mode (bottom sheet) ↔ normal mode — to free up the map during replay</span>
            <span class="kta-aide-icone">💾</span><span>CSV export — file with timestamp + coordinates + type (+ level in M-LVL)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            During tracking, the app records an internal <strong>timeline</strong> of events: start, each PDR step applied, each recalibration.
            On clicking 🎬, you replay your session with a moving yellow marker.
            <strong>Multi-segment trail</strong>: recalibrations (teleports) are visually skipped — no artificial straight line.
            <strong>Keyboard shortcuts</strong>: Space = play/pause · ← → = seek 1s · Esc = close.
            Not saved: starts from scratch on reload, reset when switching map.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬆️ Save</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">💾</span><span>Export — modal with 5 tabs: 🚀 Full · 🎨 Advanced · 🔄 Conversion · <strong>🔗 Merge</strong> (merges N data layer files into 1 file per type — also accessible from the home screen) · <strong>📡 External export (KMZ + GPX)</strong>. The Full export embeds the <strong>complete tracker timeline</strong> (route + dated temporal timeline + departure time) → lets you carry the GPS history between devices (multi-session heatmap + multi-device replay). Ignored in layer conversion.</span>
            <span class="kta-aide-icone">📡</span><span><strong>Tracker checkbox — Advanced mode</strong> — in the 🖼️ Image export modal, the "Tracker position" checkbox shows the path's point counter (e.g. "+ path 142 pts") to visualize what will be burned onto the image.</span>
            <span class="kta-aide-icone">🖼️</span><span>Export to PNG/JPG — modal with Quick / Advanced mode</span>
            <span class="kta-aide-icone">📤</span><span><strong>Export to printable PDF</strong> — A0 to A4 × portrait/landscape, legend positionable in a corner</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong>📤 PDF:</strong> 10 formats (A0/A1/A2/A3/A4 × portrait/landscape), choice
            of data layers + image case by case, 4-corner overlay legend with 3 sizes and 4 styles
            (including 🆕 "Pro white background" by default for paper printing). Reuses the same
            rendering chain as the advanced PNG export for perfect visual consistency.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Tracker</div>
          <p style="font-size:12px; color:#8892a4; margin:0 0 8px; line-height:1.5;">
            The Tracker group opens as a <strong>full-screen modal</strong> of tiles (see "🧭 Tracker menu")
            grouping its <strong>11 actions</strong>. Order, top to bottom:
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">▶️⏹️</span><span><strong>Play / Stop</strong> — start / stop tracking via PDR sensors (experimental). Dynamic icon ▶️↔⏹️ depending on the state</span>
            <span class="kta-aide-icone">🧭</span><span><strong>Compass</strong> — toggle of the magnetic North widget (useful orientation underground)</span>
            <span class="kta-aide-icone">📍</span><span><strong>Recalibration mode</strong> — click the map or an existing point to reposition the marker. Auto-close after click + automatic return to compass</span>
            <span class="kta-aide-icone">🎯</span><span><strong>My position</strong> — recenters the map on the tracker's current position (zoom kept). Works even when the tracker is stopped</span>
            <span class="kta-aide-icone">🔓</span><span><strong>Suspend the path lock</strong> — temporarily disables locking onto paths (30 s / 1 min / 10 min / until re-enabled), with a countdown in the bottom bar</span>
            <span class="kta-aide-icone">🗺️</span><span><strong>Compute a route</strong> — opens the route modal (waypoints, speed mode, avoidances)</span>
            <span class="kta-aide-icone">🎬</span><span><strong>Tracker session replay</strong> — full-screen modal: timeline slider + play/pause + speed 0.5×→10× + CSV export. Compact mode auto on Play to free up the map. Shortcuts Space / ← → / Esc</span>
            <span class="kta-aide-icone">🔥</span><span><strong>Density heatmap</strong> — interpolated segments + auto normalization + <strong>6 checkable sources</strong>: 🚶 Tracker timeline · ✏️ Session points · 🛣️ Paths · ⬛ Zones · 🏛️ Structures · 📊 Data layers</span>
            <span class="kta-aide-icone" style="background:rgba(255,80,80,0.18); border-radius:4px;">⛑️</span><span><strong>I'm lost</strong> — <span style="color:#ff8a5c;">RED BACKGROUND (emergency)</span> — computes a probable zone of your position from your last known position, the time elapsed and visual clues</span>
            <span class="kta-aide-icone" style="background:rgba(255,80,80,0.18); border-radius:4px;">🚨</span><span><strong>XL "panic" emergency mode</strong> — <span style="color:#ff8a5c;">RED BACKGROUND (emergency)</span> — XL display of position + compass heading + auto-focus minimap + 🔋 battery + 🗺️ route toggle</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff5555;">🚨 Visual demarcation:</strong> the last 2 buttons (⛑️ and 🚨) are placed
            at the <strong>end of the menu</strong> with a <strong>distinctive red background</strong> to separate them from the normal
            navigation functions.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff5555;">🚨 "Panic" emergency mode:</strong> a distinctive red button,
            <strong>different</strong> from ⛑️ "I'm lost" (which computes a zone). Here we assume you know where you are
            (the tracker shows it) but that <strong>you panic and need vital info in large print</strong>:
            <strong>XL position</strong> (map coords), <strong>large compass heading</strong> (direction of travel, needle
            turned), <strong>auto-focus minimap</strong> with the <strong>roads / zones / structures of the map in the background</strong>
            (useful to spot paths, exits, hazards). Automatic Wake Lock (the screen doesn't turn off).
            Sensor permissions auto-requested if not already granted. Exit via the ✕.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#ff8a5c;">⛑️ Emergency mode:</strong> a distinctive orange sub-action. You indicate where you were (search
            for an existing point, click on the map or tracker position), <strong>how long ago</strong>, and
            the app draws an orange <strong>search circle</strong> around it (radius = <strong>speed × time</strong>, with no margin).
            The speed is chosen via <strong>4 presets</strong> (selector) — <strong>same values as the route
            mode</strong> for consistency: <strong>🤕 Injured</strong> (2 km/h), <strong>🐌 Slow</strong>
            (3 km/h), <strong>🚶 Normal</strong> (5 km/h, default), <strong>🏃 Fast</strong> (7 km/h).
            Max time elapsed <strong>1h30</strong> (beyond that the zone becomes huge and irrelevant).
            You can add <strong>visual clues</strong> ("water can", "ram graffito"...) — the app searches for these words
            in the name, description and tags of the map's points; the clues that match <strong>inside the zone</strong>
            appear in pulsing purple, and their <strong>center</strong> gives a <strong>refined probable location</strong>.
            The <strong>👁️ Close</strong> button closes the modal while keeping the zone visible on the map (to explore).
            The <strong>🗑️ Clear the zone</strong> button (in the results) removes everything. Copyable text report to the
            clipboard (📋) for offline sharing (radio, SMS).
            A <strong>📚 Best practices</strong> accordion at the top of the modal gathers the essential tips
            (stay calm, retrace your steps, look for the main axes/main galleries, use a physical compass,
            save your light, warn someone if you get a signal, what not to do). ⚠️ Geometric estimate
            only — it does <strong>NOT</strong> replace a real rescue operation (guide line, compass,
            spare lamp, paper map).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🚨 Rescue Mode — Team coordination</div>
          <p style="font-size:12px; color:#8892a4; margin:0 0 8px; line-height:1.5;">
            An operational coordination tool to <strong>organize search teams</strong> in case of an underground incident
            (lost cataphile, organized rescue). <strong>3 distinct emergency modes</strong> not to be confused:
            ⛑️ <em>I'm lost</em> = YOU are looking for yourself · 🚨 <em>Panic mode</em> = YOU are panicking · 🚨 <em>Rescue Mode</em> = SOMEONE ELSE is lost and you organize the rescue.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:0 0 8px; line-height:1.5;">
            <strong style="color:#f4c542;">📝 State 1 — CREATION (Edit view)</strong> — preparation/planning of the rescue plan.
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🚨</span><span>Opens the Rescue Mode modal (multi-scenarios per map, max 10 saved, oldest first)</span>
            <span class="kta-aide-icone">➕</span><span>Scenario creation: name + incident time + context notes</span>
            <span class="kta-aide-icone">🎨</span><span><strong>Fixed 10-color NATO palette</strong>: Alpha red / Bravo blue / Charlie green / Delta yellow / Echo magenta / Foxtrot cyan / Golf orange / Hotel purple / India brown / Juliet grey</span>
            <span class="kta-aide-icone">📍</span><span>Teams with routes: <strong>entry + intermediates + exit</strong> (POI autocomplete / ID input / map click). Loop if entry=exit</span>
            <span class="kta-aide-icone">⬛</span><span>Search zone per team: polygon OR selected paths. A "POIs in zone" mini-modal auto-suggests intermediates</span>
            <span class="kta-aide-icone">🗺️</span><span><strong>Route computed automatically</strong> with avoidances between teams (anti-overlap). Warning toast if avoidance is impossible</span>
            <span class="kta-aide-icone">🏗️</span><span><strong>M-LVL level per team</strong>: ground/+1/-1 chip + editable select. Auto-creation of 1 team per level via the "🏗️ Auto" button</span>
            <span class="kta-aide-icone">🔥</span><span>Activity heatmap (tracker/POI/paths sources) to identify probable zones to search</span>
            <span class="kta-aide-icone">⛑️</span><span>Chaining I'm lost → Rescue: a button in I'm lost pre-fills the last known position + uncertainty zone + incident time</span>
            <span class="kta-aide-icone">⭐</span><span>Map favorites for quick access in the waypoint picker (max 8 chips above the search)</span>
            <span class="kta-aide-icone">🔍</span><span><strong>Ctrl+K → assign a POI to a team in 2 clicks</strong>: 📌 button in the unified search results if Rescue Mode is active</span>
            <span class="kta-aide-icone">🛑</span><span><strong>Configurable pause</strong> (shared with the main route): 0-120 min between intermediate stops, auto-recompute of durations</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">📤 3 export formats</strong>:
            <strong>📄 Printable PDF</strong> A4 1 page/team with a thumbnail map + integrated mini-legend +
            empty observation box for paper field use ·
            <strong>🌍 Geolocated cross-app KMZ</strong> (Google Earth / OsmAnd / Avenza) with 43 NATO color styles +
            map as a 60% GroundOverlay + nested folders toggleable per team ·
            <strong>📦 standalone .mkmsec.json</strong> to share between devices without the whole session
            (preview modal BEFORE injection).
          </p>
          <p style="font-size:12px; color:#8892a4; margin:14px 0 8px; line-height:1.5;">
            <strong style="color:#f4c542;">🚀 State 2 — FIELD EXECUTION (real-time Live view)</strong> — the incident is triggered, you follow the observations.
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🚀</span><span><strong>Launch the rescue plan</strong> button in the Edit view → role selection modal</span>
            <span class="kta-aide-icone">👤</span><span><strong>Surface Operator mode</strong> (PC lead): overview of multi-team cards + status + last obs + "🚨 Take over" button with automatic return</span>
            <span class="kta-aide-icone">🚨</span><span><strong>Team member mode</strong> (in the field): clickable visual stepper + observations + 7 quick statuses + photos (max 5/step) + prev/next navigation</span>
            <span class="kta-aide-icone">🚑</span><span><strong>Free rescuer mode</strong> (reinforcement without a team): loose chronological notes DESC + 7 quick buttons + auto timestamps</span>
            <span class="kta-aide-icone">⏱️</span><span>Global timer with a <strong>fair pause</strong> (excludes the cumulative pause time)</span>
            <span class="kta-aide-icone">📤</span><span><strong>Report as steps progress</strong>: 3 formats (PDF/JSON/clipboard Text) × 3 levels (operator/team member/rescuer). Reusable at any time during or after the stop</span>
            <span class="kta-aide-icone">📦</span><span><strong>PLAN COMPLETED</strong> banner in the Edit view after the stop: "📤 View historical report" + "🚀 Relaunch"</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">7+1 step statuses</strong>:
            • <em>pending (default)</em> · 🟢 <strong>All clear</strong> · 🟡 <strong>Suspicious</strong> · ⬛ <strong>Blocked</strong> ·
            🔵 <strong>Clue</strong> · 🟠 <strong>Help requested</strong> · 🟣 <strong>Forced turnaround</strong> ·
            <strong style="color:#ff5555;">🚨 Victim found</strong> (absolute emergency = flashing red card on the PC lead side).
          </p>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">📸 Photo storage dedicated to rescue mode</strong>:
            max 5 photos per step, auto JPEG q85 compression max 1920px, reused full-screen viewer.
          </p>
          <p style="font-size:12px; color:#8cb4ff; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#8cb4ff;">📥 Consolidation between devices</strong>: back from the field, each team member exports their report via
            <strong>📤 Report</strong> (team member level). The operator imports it in the Live Op view via the
            <strong>📥 Import team member report</strong> button in the footer → preview modal with conflict detection → merge (observations concatenated and dated, most
            severe status kept, photos deduplicated). Automatic save BEFORE so you can undo. A "📥 imported" chip on the merged team cards.
            <span style="color:#a8b3c8;">The QR code route was tested then dropped — scanning after WhatsApp compression was too fragile on dense codes.</span>
            ⚠️ Like everything: <strong>keep a physical compass and a paper map</strong>. The phone can fail. The 🚨 is a coordination aid, NOT a substitute for preparation.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:14px 0 8px; line-height:1.5;">
            <strong style="color:#f4c542;">🌍 State 3 — EXTERNAL RESCUE BRIEFING (OSM View × Rescue Mode, v1.41)</strong> — coordination with external rescue services (firefighters, GRIMP, SDIS).
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🚪</span><span>New built-in tag <strong>Map entry point</strong> (category "🚨 Rescue" in the legend) to mark the main emergency entries</span>
            <span class="kta-aide-icone">📍</span><span><strong>Surface GPS per team</strong>: "📍 Surface GPS" field in the team card (format "lat, lng" WGS84), for the rescue command post / firefighter meeting point</span>
            <span class="kta-aide-icone">🌍</span><span><strong>🌍 OSM View</strong> button available in the Edit banner AND in the 3 Live footers → show the map's position on OpenStreetMap without leaving the active view</span>
            <span class="kta-aide-icone">🚒</span><span><strong>Dedicated firefighter briefing PDF</strong> (🚒 button): an A4 page with clickable OSM + Google Maps links + teams + surface GPS + critical POIs (map entry / emergency exit / quarry accesses)</span>
            <span class="kta-aide-icone">📤</span><span>A <strong>"Surface briefing"</strong> page automatically integrated into the post-mission PDF report</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:14px 0 0; line-height:1.5;">
            <strong style="color:#8cb4ff;">💾 Save Offline — Offline OSM View (v1.43)</strong> — a <strong>💾 Save Offline</strong> button available in the OSM View modal and in the home's OSM View widget.
            One click downloads the OpenStreetMap tiles covering the map's area and stores them in the phone's local storage (200 tiles max per click, to respect OSM's usage policy — click the button again if you want to extend coverage or do several zoom levels).
            Once cached, the <strong>💾</strong> icon stays visible to tell you the area is saved, and the <strong>OSM View opens directly off-network</strong> (underground, no-signal area, airplane mode) — no error message, no connection attempt: the app detects there is cache and displays the map instantly.
            The cache is <strong>shared</strong> between the home OSM View, the OSM View modal and Rescue Mode — a single Save Offline covers all three.
            <span style="color:#a8b3c8;">Field reflex: Save Offline before you leave, while you still have a signal.</span>
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📐 Measurement tools</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">📐</span><span>Distance measurement — click to place points, total shown at bottom-left</span>
            <span class="kta-aide-icone">⬛</span><span><strong>Area measurement</strong> — 📏/⬛ toggle in the group, draw a polygon, the app computes the area in m² (auto ha beyond 10,000 m²)</span>
            <span class="kta-aide-icone">📏</span><span>Total length of paths — sub-action of the Paths group, floating panel with filters by type</span>
            <span class="kta-aide-icone">🗺️</span><span>Route — the shortest path between 2 or more points following the existing roads</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">📏 Total length:</strong> opens a small bottom-right panel with 3 checkboxes
            (Main / Secondary / Path). The total length of the checked paths is shown in meters,
            and the included segments are highlighted in magenta on the map. Also includes the roads of visible data
            layers. <strong>Not exported in the PNG image legend.</strong>
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">🗺️ Route:</strong> add waypoints (click on the map, search by name/id/tag, or the <strong>🧭 My position</strong> button which takes your current tracker position),
            the app computes the shortest path using the existing roads (session + data layers, <strong>even hidden layers</strong> — useful if the roads are drawn directly onto the PNG and you want to gain performance).
            The bottom-left label shows the <strong>distance</strong>, the <strong>⏱️ estimated time</strong> and the <strong>active speed mode</strong> (🤕 Injured 2 km/h / 🐌 Slow 3 km/h / 🚶 Normal 5 km/h default / 🏃 Fast 7 km/h, + 15 min of pause per intermediate point). The mode is changed via a selector in the route modal and is kept across sessions.
            The route appears in neon cyan with a distance label at bottom-left. On re-click, the modal opens in
            <strong>navigation mode</strong>: <strong>⏮️ Start</strong>, <strong>⏭️ End</strong>,
            <strong>🔁 Full loop</strong> buttons, and 🎯 per waypoint to center the map on it.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">🔄 Living route (v1.61.0):</strong> every <strong>position
            recalibration</strong> (map click, "📍 I am here", portal arrival) <strong>recalculates the active
            route from your new position</strong> (remaining stops kept in planned order, avoidances respected).
            "📍 I am here" on a point that is a <strong>route stop</strong> = <strong>passage validation</strong>
            (green ✓ marker, struck-through line in the modal, stop excluded from future calculations) — in
            <strong>any order</strong>. All stops validated → "🎉 Route complete", the path clears (the tracker
            trail stays). Validations survive reloads (saved with the session).
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#ffb266;">🚫 Avoidance constraints:</strong>
            <strong style="color:#a8b3c8;">⛔ Inaccessible Zone</strong> (Zones group) = a <em>hard</em> constraint, the route will never pass through it, never relaxed.
            <strong style="color:#a8b3c8;">🚫 Avoidance preferences</strong> (collapsible section in the route modal) = a <em>soft</em> constraint: points to avoid (search / ID / map click) + tags to avoid + margin (px, default 100). If there is no alternative path, the app computes it anyway by passing nearby and shows an orange message <em>⚠️ Unable to avoid: X, Y</em>. Preferences remembered locally per map.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">✏️ Point editing</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">✏️</span><span><strong>Enable add mode</strong> — direct click on the ✏️ icon → ON/OFF toggle. In ON, each click on the map places a new point.</span>
            <span class="kta-aide-icone">📸</span><span>Photos attached to the point (max 5) — section in the add/edit modal. 📷 Take / 🖼️ Gallery buttons</span>
            <span class="kta-aide-icone">✏️</span><span>Edit an existing point — blue button in the marker's popup (reopens the same pre-filled modal)</span>
            <span class="kta-aide-icone">🌐</span><span><strong>GPS coords in the popup</strong> — if the map is <strong>georeferenced</strong>, a point's popup automatically shows the GPS coordinates (lat/lng WGS84) computed right after the description, with a <strong>📋</strong> button to copy to the clipboard. Active for <strong>all points</strong> (session AND data layers).</span>
            <span class="kta-aide-icone">🗑️</span><span><strong>Delete a point</strong> — click the marker → popup → <strong>🗑️ Delete this point</strong> button. To undo an accidental deletion: <code>Ctrl+Z</code>.</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#f4c542;">📸 POI photos:</strong> attach up to <strong>5 photos per point</strong>
            (mobile camera via 📷 or gallery import via 🖼️). Auto JPEG q85 compression max 1920px. <strong>100% local on this device</strong>
            — never sent over the Internet. 44×44 thumbnails in the marker's popup (tap → full-screen viewer with pinch-zoom + pan +
            horizontal swipe to navigate between photos). Included in all exports (session ZIP + map generator ZIP) + restored
            automatically on re-import. A 5th 📸 counter in the header + a section in the "📊 Session details" modal.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🏛️ Structures (pillars + walls + quarry faces)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🟡</span><span>1st-mass pillar (polygon, yellow fill)</span>
            <span class="kta-aide-icone">🟠</span><span>2nd-mass pillar (polygon, orange fill) — auto-tagged level -1 in M-LVL</span>
            <span class="kta-aide-icone">🔵</span><span>Wall (polygon, blue fill)</span>
            <span class="kta-aide-icone">🟨</span><span>1st-mass quarry face (polyline, yellow stroke) — this is a LINE, not a closed polygon</span>
            <span class="kta-aide-icone">🟧</span><span>2nd-mass quarry face (polyline, orange stroke) — auto-tagged level -1 in M-LVL</span>
            <span class="kta-aide-icone">🧹</span><span>Erase (last point / last in-progress OR closed structure / 🎯 selection by map click / all)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#a8b3c8;">Mapping the underground architecture</strong>: load-bearing pillars (1st/2nd mass of
            limestone), retaining walls, and quarry faces. For polygons (pillars + walls), place at least 3 points
            then re-click the lit icon to close. For polylines (faces), place at least 2 points then re-click the
            icon to validate the line. No pathfinder effect (read-only — that's different from the ⛔ Inaccessible zone which
            blocks the route).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🛣️ Paths & Roads</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🟩</span><span>Draw a main road</span>
            <span class="kta-aide-icone">🟪</span><span>Draw a secondary road</span>
            <span class="kta-aide-icone">🟨</span><span>Draw a path</span>
            <span class="kta-aide-icone">🪜</span><span>Inter-level junction (dashed magenta) — sub-action visible only if multi-level mode is enabled. A bridge between 2 levels for the pathfinder.</span>
            <span class="kta-aide-icone">📏</span><span>Total length of paths (floating panel with filters by type)</span>
            <span class="kta-aide-icone">🧹</span><span>Erase (last point, last path or all)</span>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">⬛ Zones (fill / collapses / water / inaccessible)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">⬛</span><span>Draw a fill zone</span>
            <span class="kta-aide-icone">🟥</span><span>Draw a collapse zone</span>
            <span class="kta-aide-icone">🟦</span><span>Draw a water zone</span>
            <span class="kta-aide-icone">⛔</span><span>Draw an inaccessible zone (red/black hatching) — blocks the pathfinder</span>
            <span class="kta-aide-icone">✅</span><span>Close the current zone (at least 3 points)</span>
            <span class="kta-aide-icone">🧹</span><span>Erase (last point, last zone or all)</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            Place at least 3 points then re-click the 1st point to close the zone, or use the ✅ button.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🚀 Optimize a map</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            A light map = fast loading, smooth navigation, less risk of a mobile memory crash.
            <strong>Main tips:</strong>
          </p>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🖼️</span><span><strong>Base image</strong> ≤ 8,000 px per side, <strong>JPEG quality 85</strong> format (5-10× lighter than PNG)</span>
            <span class="kta-aide-icone">🗂️</span><span><strong>Just 1 image layer</strong> ideally — merge legends/markers into the base PNG</span>
            <span class="kta-aide-icone">🛣️</span><span><strong>Many roads</strong>? Draw them in the PNG + hide the JSON layer. The pathfinder uses the roads even when hidden</span>
            <span class="kta-aide-icone">📍</span><span><strong>Dense points</strong>? Split them into several toggleable layers (shafts / passages / electrical…)</span>
            <span class="kta-aide-icone">⚡</span><span><strong>Perf mode</strong>: 🎯 Balanced on a modern mobile, ⚡ Performance on an old device</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            More details and precise figures in the <strong>Documentation 📖</strong> (📚 Help / Docs group), "Optimize your map for performance" section.
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🔐 Local access code (PIN / Face ID)</div>
          <div class="kta-aide-grille">
            <span class="kta-aide-icone">🔐</span><span>Optional locking of the app at every startup</span>
            <span class="kta-aide-icone">🤳</span><span>Face ID / Touch ID / Windows Hello biometrics if the device supports it (native WebAuthn)</span>
            <span class="kta-aide-icone">🚫</span><span>5 failed attempts = permanent lockout. No recovery if forgotten.</span>
          </div>
          <p style="font-size:12px; color:#8892a4; margin:8px 0 0; line-height:1.5;">
            <strong style="color:#f4c542;">To be enabled from the home page only:</strong>
            ⚙️ Configuration → 🔐 Local access code → "🔐 Enable the access code" button. Enter a
            4-6 digit PIN, confirm, then accept the biometrics if offered. On the next startup, the app
            will ask for your code before opening.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:6px 0 0; line-height:1.5;">
            <strong style="color:#ff8a5c;">⚠️ Important note:</strong> this is a <strong>usage barrier</strong>,
            NOT data encryption. Photos and sessions remain in clear text in the browser's local storage.
            The PIN is hashed client-side (SHA-256 + random salt) and never sent over the Internet.
            <strong>Write down your code carefully</strong> — no recovery is possible if forgotten (no backend, no email reset).
            On lockout: the only solutions = reinstall the app (loss of session + non-saved maps) OR contact
            the author (who won't be able to do anything, consistent with the no-backend philosophy).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">💡 Tips</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>Exclusive modes</strong>: Measurement, Add point, Recalibration and Paths are mutually
            exclusive — enabling one automatically disables the others.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>Active mode</strong>: as long as a mode is active, its group stays open to allow
            direct access to the secondary actions (erasing the last point, for example).
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0; line-height:1.5;">
            <strong>Changing icon</strong>: the group's main icon reflects the active mode (for example
            🟩 on the Paths button when a main path is in progress, or 📍 on the Tracker during recalibration).
          </p>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🆘 Troubleshooting</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>📡 App stuck after a soft update</strong> (loader with no CSS, page frozen, assets badly loaded):
            the most frequent cause is an <strong style="color:#f4c542;">edge CDN serving corrupted content</strong>
            (wrong MIME, truncated asset, etc.). First reflex:
            <strong>disable your VPN, change network (4G ↔ Wi-Fi)</strong>, and retry. The GitHub Pages CDN sometimes
            has rotten regional edges — switching IP/geo zone is often enough to unstick it.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🆘 Emergency kill switch</strong>: if the app stays stuck even after changing network, open
            <code>https://&lt;domain&gt;/?killsw=1</code> in a private tab (Chrome/Safari, NOT the PWA) — this
            resets the app cache + empties all the app's technical files <strong>without touching your data</strong>
            (maps, sessions, photos, prefs preserved). Then reload normally.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🆘 Manual reset via dedicated page</strong>: if the URL param isn't enough (HTML cache stuck),
            navigate to <code>https://&lt;domain&gt;/killsw.html</code> — a standalone 100% inline page (CSS+JS),
            zero dependencies, works even if the rest of the app is broken. Three steps shown: app cache
            reset, technical files purged, ready to reload.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🔄 Optimized soft update</strong>: the
            <strong>⚙️ Configuration → 🔄 Force the update</strong> flow is designed to be 10× faster
            (from ~45s-3min to ~3-10s depending on network). The app downloads the update in the background during
            the purge; on reload, the current cache is preserved, without downloading twice.
          </p>
          <p style="font-size:12px; color:#8892a4; margin:0; line-height:1.5;">
            ⚠️ <strong>These tools delete NO user data</strong> (maps, sessions, photos, prefs, backups).
            They only purge the cache of the app's files (HTML / CSS / JS / icons). When in doubt,
            <strong>📤 Export the profile</strong> BEFORE so you have a complete backup at hand.
          </p>
        </div>

        <!-- 🌀 v1.57.0 — Inter-plan links (section idx 28, appended LAST to
             keep every AIDE_CATEGORIES index untouched — parity with FR) -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🌀 Inter-plan links ("portals")</div>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            Link a <strong>point on one plan</strong> to a <strong>point on another plan</strong> — like a portal between
            two touching networks (two neighboring quarries, overview plan ↔ detail plan).
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>Create</strong>: click a point (session or data layer) → button
            <strong>🌀 Link to another plan</strong> → pick the target plan then search the arrival point
            (name, id or tag — no need to open the other plan). The link is <strong>bidirectional</strong>:
            visible in both points' popups. A point can carry several links.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>Use</strong>: in the point's popup, 🌀 line → <strong>➜</strong> button → confirmation →
            the app switches plan (session saved automatically), <strong>switches to the arrival point's
            level</strong> and drops you on it (blue flash). Visual marking is your choice: give the point
            the <strong>"Portal" tag</strong> for its <strong>dedicated vortex icon</strong>, or keep any
            tag (no marking).
            <strong>📍 Recalibration on arrival</strong> (v1.61.0): physically crossing a portal (a link's ➜,
            a route's "Take the portal") <strong>recalibrates your tracker position onto the arrival
            point</strong> — multi-plan search and the manager do not (viewing ≠ moving).
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>↩️ Back</strong> (v1.58.0): after a jump, a floating "Back: &lt;plan&gt;" button
            (15 s, bottom of screen) brings you back to the plan and the <strong>exact view</strong> you came
            from (level + zoom). Jumps stack — 3 chained portals = 3 possible returns.
            <strong>Discreet when needed</strong> (v1.61.0): <strong>[–]</strong> shrinks it to a ↩️ mini-chip
            (click = re-expand), <strong>[✕]</strong> closes it — your choice is remembered for future jumps.
            <strong>🌐 Multi-plan search</strong> (v1.58.0): search a point across <strong>your whole
            library</strong> from the home screen (🌐 button) or via the Ctrl+K search ("Search across
            all plans" button) — one click loads the right plan and centers on it.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🌀 My links</strong> (v1.59.0): on the <strong>home screen</strong>, lists all your links
            (⛔ if a plan is missing, ➜ to go there, 🗑️ to delete).
            <strong>🕸️ Graph view</strong> (v1.65.0): toggle 📋 List ⇄ 🕸️ Graph — the library as a network
            (plans = bubbles with badges + counter, portals = lines whose thickness follows the number of
            links, unlinked plans in a dedicated strip). Click a bubble = open the plan, click a line =
            border detail, bubbles draggable.
          </p>
          <p style="font-size:13px; color:#c0c8d8; margin:0 0 8px; line-height:1.5;">
            <strong>🧭 Inter-plan route</strong> (v1.60.0, revamped v1.64.0): request a route to a point on
            <strong>another plan</strong> (Route modal → "🌐 Destination on another plan", or 🧭 button in
            the multi-plan search). The app compares portals at real cost, shows the steps and total
            distance — your <strong>modal waypoints are visited first</strong>, in order.
            "<strong>🗺️ Let's go</strong>" draws the route and lets you <strong>walk</strong>: the crossing
            is offered when you are AT the portal (floating "🌀 Next portal" button, the popup's ➜, or
            "📍 I am here" on the portal point). Check <strong>"🌀 Route across multiple plans"</strong> in
            the multi-plan search to cross intermediate plans (A → B → C, 3 crossings max) — each arrival
            draws that leg and offers the next portal. Impossible? The message tells you why (no portal,
            plan offline, destination cut off…).
          </p>
          <p style="font-size:12px; color:#8892a4; margin:0; line-height:1.5;">
            Target plan missing from this device → the link still shows (⛔) but "going there" requires adding the plan.
            Deleting a point also deletes its links (both sides). Links travel with the session export.
            If a tag filter hides the arrival point, a warning is shown (the filter is never modified).
            Plan data unreachable (offline) → the app says so instead of a silent "0 points".
          </p>
        </div>
  `;
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
        '<span class="kta-readme-modal-titre">' + window.I18n.t("aiia.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-aide-ia-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">' + window.I18n.t("aiia.concept.titre") + '</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:13px;">' +
            window.I18n.t("aiia.concept.body") +
          '</p>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">' + window.I18n.t("aiia.how.titre") + '</div>' +
          '<ol style="color:#c8d0e0; line-height:1.7; font-size:13px; padding-left:22px; margin:0;">' +
            '<li>' + window.I18n.t("aiia.how.step1") + '</li>' +
            '<li>' + window.I18n.t("aiia.how.step2") + '</li>' +
            '<li>' + window.I18n.t("aiia.how.step3") + '</li>' +
            '<li>' + window.I18n.t("aiia.how.step4") + '</li>' +
          '</ol>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">' + window.I18n.t("aiia.privacy.titre") + '</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:13px;">' +
            window.I18n.t("aiia.privacy.body") +
          '</p>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">' + window.I18n.t("aiia.prompt.titre") + '</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:12px; margin:0 0 8px 0;">' +
            window.I18n.t("aiia.prompt.intro") +
          '</p>' +
          '<div class="kta-aide-ia-prompt-wrap">' +
            '<textarea id="kta-aide-ia-prompt" class="kta-aide-ia-prompt" readonly>' +
              window.I18n.t("aiia.prompt.text") +
            '</textarea>' +
            '<button class="kta-btn kta-btn-ghost kta-aide-ia-copy-btn" id="kta-aide-ia-copy" type="button">' + window.I18n.t("aiia.btn.copy") + '</button>' +
          '</div>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">' + window.I18n.t("aiia.note.titre") + '</div>' +
          '<p style="color:#c0c8d8; line-height:1.6; font-size:13px;">' +
            window.I18n.t("aiia.note.body") +
          '</p>' +
        '</div>' +

        '<div style="display:flex; gap:10px; margin-top:14px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-aide-ia-cancel"   type="button" style="flex:1;">' + window.I18n.t("aiia.btn.cancel") + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-aide-ia-download" type="button" style="flex:2;">' + window.I18n.t("aiia.btn.download") + '</button>' +
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
      btn.textContent = window.I18n.t("aiia.copy.ok");
      btn.classList.add("kta-aide-ia-copy-ok");
      setTimeout(function() {
        btn.textContent = originalText;
        btn.classList.remove("kta-aide-ia-copy-ok");
      }, 1500);
    } catch(e) {
      console.warn("[AideIA] Copy failed :", e);
      btn.textContent = window.I18n.t("aiia.copy.fail");
      setTimeout(function() { btn.textContent = originalText; }, 2000);
    }
  });

  document.getElementById("kta-aide-ia-download").addEventListener("click", async function() {
    const btn = this;
    const statusEl = document.getElementById("kta-aide-ia-status");
    btn.disabled = true;
    btn.textContent = window.I18n.t("aiia.dl.generating");
    statusEl.textContent = window.I18n.t("aiia.dl.fetching");

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
      statusEl.textContent = window.I18n.t("aiia.dl.fetched", { tpl: tplKo, doc: docKo });
    } catch(e) {
      console.warn("[AideIA] Erreur fetch :", e);
      statusEl.textContent = window.I18n.t("aiia.dl.offline");
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

    statusEl.textContent = window.I18n.t("aiia.dl.done", { ko: Math.round(contenu.length / 1024) });
    btn.textContent = window.I18n.t("aiia.btn.download");
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
