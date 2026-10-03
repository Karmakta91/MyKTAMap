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
const DOC_AVAILABLE_LANGS = ["fr", "en", "es"];

// ⚠️ CETTE LISTE NE CONCERNE QUE LA 📖 DOCUMENTATION (fichiers README_USER).
// L'❓ Aide intégrée N'EN A PLUS : depuis le lot 2 (01/09/2026) son contenu vit
// dans les dicos et elle suit la langue GLOBALE de l'app — sa disponibilité par
// langue est donc celle des dicos, il n'y a plus rien à tenir à jour.
// 🩸 Pourquoi c'est écrit ici : le 31/08, l'Aide lisait cette même liste. Y
// ajouter "es" pour livrer la doc espagnole a suffi à la faire basculer en
// FRANÇAIS pour les hispanophones (elle tombait sur l'anglais avant), avec un
// drapeau 🇪🇸 qui promettait un contenu inexistant. Une liste partagée entre
// « ajouter une langue = déposer un fichier » et « ajouter une langue = écrire
// 870 lignes de HTML » ne pouvait que mentir. Le lot 2 a supprimé la cause.

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

// 🔎 Recherche plein texte (audit ergonomie D27, 14/09/2026) — deux helpers
// PURS, exposés pour `check-doc-recherche.js` qui les EXÉCUTE.
// Normalisation 1:1 (même longueur en unités UTF-16) : minuscules, accents
// retirés — « Réglages » se trouve avec « reglages », et les positions restent
// celles du texte d'origine (indispensable pour surligner sans décaler).
window.ktaDocNormaliser = function(s) {
  let out = "";
  for (const ch of String(s || "")) {
    const b = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    out += (b.length === 1) ? b : ch;
  }
  return out;
};
// Toutes les occurrences (non chevauchantes) de q dans texte → [[début, fin], …]
// en indices du texte d'origine. Moins de 2 caractères utiles → rien.
window.ktaDocTrouver = function(texte, q) {
  const t = window.ktaDocNormaliser(texte);
  const n = window.ktaDocNormaliser(q).trim();
  const res = [];
  if (n.length < 2) return res;
  let i = t.indexOf(n);
  while (i !== -1) { res.push([i, i + n.length]); i = t.indexOf(n, i + n.length); }
  return res;
};

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

// 🔎 Recherche plein texte de la modale Documentation (audit ergonomie D27,
// 14/09/2026). Avant : 3 739 lignes, un sommaire caché sous 1 100 px, et
// AUCUNE recherche — l'utilisateur mobile défilait 200 écrans ou abandonnait.
// Ici : surlignage de toutes les occurrences, compteur « i / n », Entrée ou ↓
// pour la suivante, et les entrées du sommaire sans résultat s'estompent.
function _setupReadmeSearch() {
  const input  = document.getElementById("kta-readme-search");
  const count  = document.getElementById("kta-readme-search-count");
  const next   = document.getElementById("kta-readme-search-next");
  const corps  = document.querySelector("#kta-readme-modal .kta-readme-corps");
  if (!input || !corps) return;
  if (input._ktaDocSearchWired) return;   // la modale est recréée à chaque ouverture, mais on ne double jamais
  input._ktaDocSearchWired = true;
  let marks = [], cur = -1, timer = null;
  const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };

  function demarquer() {
    corps.querySelectorAll("mark.kta-doc-mark").forEach(function(m) {
      const p = m.parentNode;
      if (!p) return;
      p.replaceChild(document.createTextNode(m.textContent), m);
      p.normalize();
    });
    marks = []; cur = -1;
    document.querySelectorAll("#kta-readme-toc-sidebar .kta-readme-toc-dim").forEach(function(a) {
      a.classList.remove("kta-readme-toc-dim");
    });
    if (count) count.textContent = "";
  }
  function marquer(q) {
    const walker = document.createTreeWalker(corps, NodeFilter.SHOW_TEXT, {
      acceptNode: function(n) {
        const p = n.parentNode;
        if (!p || /^(SCRIPT|STYLE|MARK)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function(node) {
      const hits = window.ktaDocTrouver(node.nodeValue, q);
      if (!hits.length) return;
      const txt  = node.nodeValue;
      const frag = document.createDocumentFragment();
      let last = 0;
      hits.forEach(function(h) {
        if (h[0] > last) frag.appendChild(document.createTextNode(txt.slice(last, h[0])));
        const m = document.createElement("mark");
        m.className = "kta-doc-mark";
        m.textContent = txt.slice(h[0], h[1]);
        frag.appendChild(m);
        marks.push(m);
        last = h[1];
      });
      if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }
  function estomperSommaire() {
    const sidebar = document.getElementById("kta-readme-toc-sidebar");
    if (!sidebar) return;
    sidebar.querySelectorAll(".kta-readme-toc-link").forEach(function(a) {
      const id = (a.getAttribute("href") || "").slice(1);
      const h  = id ? document.getElementById(id) : null;
      if (!h) return;
      const stop = a.classList.contains("kta-readme-toc-link-h2") ? /^H2$/ : /^H[23]$/;
      let trouve = !!h.querySelector("mark.kta-doc-mark");
      let e = h.nextElementSibling;
      while (e && !trouve && !stop.test(e.tagName)) {
        if (e.querySelector && e.querySelector("mark.kta-doc-mark")) trouve = true;
        e = e.nextElementSibling;
      }
      a.classList.toggle("kta-readme-toc-dim", !trouve);
    });
  }
  function aller(i) {
    if (!marks.length) return;
    if (cur >= 0 && marks[cur]) marks[cur].classList.remove("kta-doc-mark-current");
    cur = ((i % marks.length) + marks.length) % marks.length;
    const m = marks[cur];
    m.classList.add("kta-doc-mark-current");
    try { m.scrollIntoView({ block: "center", behavior: "smooth" }); } catch(e) { m.scrollIntoView(); }
    if (count) count.textContent = t("docs.search.count", { i: cur + 1, n: marks.length });
  }
  function chercher() {
    demarquer();
    const q = input.value.trim();
    if (q.length < 2) return;
    marquer(q);
    estomperSommaire();
    if (!marks.length) { if (count) count.textContent = t("docs.search.none"); return; }
    aller(0);
  }
  input.addEventListener("input", function() { clearTimeout(timer); timer = setTimeout(chercher, 160); });
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") { e.preventDefault(); if (marks.length) aller(cur + 1); else chercher(); }
  });
  if (next) next.addEventListener("click", function() { if (marks.length) aller(cur + 1); else chercher(); });
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
      // 🔎 D27 : recherche plein texte (surlignage + sommaire estompé)
      _setupReadmeSearch();
    })
    .catch(function(err) {
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (corps) corps.innerHTML = '<p class="kta-readme-erreur">❌ ' + (window.I18n ? window.I18n.t("docs.erreurChargement") : "Impossible de charger") + ' <code>' + fichier + '</code><br><br><code>' + err.message + '</code></p>';
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

  // 8. Titres — jusqu'au niveau 5 : le Mode Secours, rangé sous « Pour aller
  //    plus loin » (##), descend à ##### (03/10/2026). Sans cette ligne, ses
  //    titres s'affichaient en brut (« ##### 📝 … »).
  md = md
    .replace(/^##### (.+)$/gm, "<h5>$1</h5>")
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
  // Audit i18n (O9) : chrome de la modale traduit (était en FR dans les 3 langues).
  const _docTxt = function(k) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k).replace(/"/g, "&quot;") : k;
  };
  const btnOnboarding = opts.hideOnboarding
    ? ''
    : '<button class="kta-readme-tutorial-btn" id="kta-readme-tutorial-btn" type="button" aria-label="' + _docTxt("docs.tutorielBtn") +
      '" title="🎓 ' + _docTxt("docs.tutorielBtn") + '">🎓</button>';
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
  // 🧩 01/10/2026 (KARMA) — un menu déroulant remplace les drapeaux : un
  // seul contrôle quel que soit le nombre de langues, et la place libérée
  // accueille le bouton 🤖 Aide IA (retiré du groupe 📚 Aide de la barre).
  const btnLang = '<select class="kta-readme-lang-select" id="kta-readme-lang-select" ' +
    'aria-label="' + _docTxt("docs.langSelect") + '" title="' + _docTxt("docs.langSelect") + '">' +
    DOC_AVAILABLE_LANGS.map(function(code) {
      const meta = _docLangMeta.filter(function(l){ return l.code === code; })[0] ||
                   { code: code, label: code.toUpperCase(), flag: code.toUpperCase() };
      return '<option value="' + code + '"' + (code === _docCurrentLang ? ' selected' : '') + '>' +
             meta.flag + ' ' + code.toUpperCase() + '</option>';
    }).join("") + '</select>';
  const btnAiia = (typeof window.afficherModaleAideIA === "function")
    ? '<button class="kta-readme-tutorial-btn" id="kta-readme-aiia-btn" type="button" ' +
      'aria-label="' + _docTxt("docs.aiiaBtn") + '" title="' + _docTxt("docs.aiiaBtn") + '">🤖</button>'
    : "";
  modal.innerHTML = `
    <div class="kta-readme-modal-boite">
      <div class="kta-readme-modal-header">
        <button class="kta-readme-toc-toggle-btn" id="kta-readme-toc-toggle" type="button" aria-label="${_docTxt("docs.tocToggle")}" title="${_docTxt("docs.tocToggle")}">📚</button>
        <span class="kta-readme-modal-titre">Documentation</span>
        ${btnLang}
        ${btnAiia}
        ${btnOnboarding}
        <button class="kta-panneau-close" id="kta-readme-close">✕</button>
      </div>
      <div class="kta-readme-search-bar">
        <input type="search" id="kta-readme-search" class="kta-readme-search" autocomplete="off" placeholder="${window.I18n.t("docs.search.placeholder")}" aria-label="${window.I18n.t("docs.search.placeholder")}">
        <span class="kta-readme-search-count" id="kta-readme-search-count" aria-live="polite"></span>
        <button type="button" class="kta-btn kta-btn-ghost kta-readme-search-next" id="kta-readme-search-next" title="${window.I18n.t("docs.search.nextTitle")}" aria-label="${window.I18n.t("docs.search.nextTitle")}">↓</button>
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

  // 🤖 Aide IA (01/10/2026) : s'ouvre PAR-DESSUS la doc, qui reste derrière.
  // Devant le verrou (overLocker), elle hérite du même z-index relevé, sinon
  // elle s'ouvrirait sous l'écran de verrouillage.
  const _readmeAiiaBtn = document.getElementById("kta-readme-aiia-btn");
  if (_readmeAiiaBtn) {
    _readmeAiiaBtn.addEventListener("click", function() {
      window.afficherModaleAideIA();
      const ia = document.getElementById("kta-aide-ia-modal");
      if (ia && modal.classList.contains("kta-readme-over-locker")) ia.classList.add("kta-readme-over-locker");
    });
  }

  // 🆕 v1.45.0 — Choix de langue de la doc (menu déroulant depuis le
  // 01/10/2026). Langue ≠ courante → persiste + rebuild la modale
  // (préserve TOC dépliable, smooth scroll… sans dupliquer le rendu). Scope
  // strictement LOCAL à la doc (ne touche pas la langue globale de l'app).
  const _readmeLangSel = document.getElementById("kta-readme-lang-select");
  if (_readmeLangSel) {
    _readmeLangSel.addEventListener("change", function() {
      const target = _readmeLangSel.value;
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
  }
}

// =========================

// AIDE — modale plein écran
// =========================
// =====================================================================
// ❓ AIDE CONTEXTUELLE (D35 de l'audit ergonomie, 14/09/2026)
// =====================================================================
// 🩸 LE CONSTAT : l'aide intégrée compte 33 sections, une par grande fonction,
// et AUCUNE modale n'y renvoie. Pour lire la bonne, il fallait quitter ce qu'on
// faisait, ouvrir le groupe ❓ Aide de la barre, puis chercher — personne ne le
// fait au milieu d'une tâche. Les infobulles `title`, elles, n'existent pas au
// doigt.
//
// LA RÈGLE : toute modale qui a une section d'aide porte un ❓ dans sa ligne de
// titre, et ce ❓ ouvre CETTE section. Le lien vit dans UNE table, confrontée au
// code par `check-aide-contextuelle.js` : chaque id doit exister dans les
// sources, chaque slug doit être une section réelle.
//
// 🎛️ DÉSACTIVABLE (KARMA) : « quelqu'un qui ne veut pas cette icône partout
// pour toujours ». Réglage GLOBAL, dans ⚙️ Configuration de l'accueil →
// 🎨 Affichage. Défaut ACTIVÉ : l'aide ne sert que si elle se voit, et celui
// qui n'en veut pas la coupe une fois.
//
// POURQUOI UN OBSERVATEUR et pas un appel dans chaque modale : elles sont une
// vingtaine, créées dans autant de fichiers, avec le même en-tête
// `.kta-readme-modal-header`. Poser le bouton à l'ajout du nœud garde la règle
// en UN endroit ; vingt appels dispersés auraient dérivé au premier oubli.

const AIDE_CTX_LS = "myktamap_aide_contextuelle";   // "0" = coupée

// id de la modale → slug de section d'aide. Une modale absente n'a pas de
// section dédiée : pas de bouton, plutôt qu'un ❓ qui ouvrirait une page à
// côté du sujet.
//
// 🩸 DEUX ERREURS CORRIGÉES LE JOUR MÊME, et ce qu'elles apprennent :
//   • 🔥 Heatmap pointait vers l'aide « Tracker » (KARMA : « pas logique, il
//     doit être avant, dans le modal tracker »). La heatmap est UNE TUILE du
//     menu Tracker : le ❓ va sur le menu, en amont, pas sur une de ses sorties.
//   • « kta-profil-modal » n'est PAS le profil de l'utilisateur : c'est le
//     PROFIL EN LONG d'un trajet (`profondeurNiveaux.js`). Le ❓ aurait ouvert
//     la page « Mode profil » — avatar et rangs — depuis un graphe d'altimétrie.
//     Un id qui EXISTE ne prouve pas qu'il désigne le bon sujet ; seul un
//     humain peut juger ce lien, et c'est pour ça qu'il vit dans une table
//     courte et relue, pas dans une heuristique.
const AIDE_PAR_MODALE = {
  "kta-cfg-modal":            "parametres",
  "kta-refonte-session-modal": "stats-session",
  "kta-export-modal":         "enregistrer",
  "kta-import-modal":         "charger-import",
  "kta-legende-modal":        "legende",
  "kta-search-modal":         "recherche",
  "kta-secours-modal":        "mode-secours",
  "kta-histoire-modal":       "histoire",
  "kta-tracker-modal":        "menu-tracker",
  "kta-planner-modal":        "creer-modifier-plan",
  "kta-jrn-modal":            "carnet",
  "kta-osm-filters-modal":    "vue-osm",
  "kta-profile-details-modal": "profil",
  "kta-plan-infos-modal":     "bibliotheque-plans",
  "kta-itinerary-modal":      "itineraire",
  "kta-sortie-urgence-modal": "sortie-urgence",
  "kta-lost-modal":           "je-suis-perdu",
  "kta-convert-modal":        "corriger",
  "kta-niv-modal":            "multi-niveau",
  "kta-jct-modal":            "multi-niveau"
};

function ktaAideContextuelleActive() {
  try { return localStorage.getItem(AIDE_CTX_LS) !== "0"; } catch(e) { return true; }
}

// Ouvre DIRECTEMENT une section d'aide, sans passer par le hub. Rend false si
// le slug est inconnu — l'appelant saura que le lien est mort au lieu d'ouvrir
// une fenêtre vide.
function ktaOuvrirAideSection(slug) {
  if (!slug || AIDE_SECTIONS.indexOf(slug) < 0) {
    console.warn("[Aide] section inconnue :", slug);
    return false;
  }
  _aideOuvrirSousModal(_aideSection(slug));
  return true;
}

function _aidePoserBouton(modal) {
  if (!modal || !modal.id) return;
  const slug = AIDE_PAR_MODALE[modal.id];
  if (!slug || !ktaAideContextuelleActive()) return;
  // Deux familles d'en-tête coexistent dans l'app : celle des modales de
  // contenu et celle du menu Tracker. Les deux accueillent le ❓ au même
  // endroit, juste avant la croix.
  const head = modal.querySelector(".kta-readme-modal-header, .kta-tracker-modal-header");
  if (!head || head.querySelector(".kta-aide-ctx-btn")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "kta-aide-ctx-btn";
  b.textContent = "❓";
  const t = (window.I18n && window.I18n.t) ? window.I18n.t("aide.ctx.btn") : "Aide";
  b.title = t; b.setAttribute("aria-label", t);
  b.addEventListener("click", function(e) {
    e.stopPropagation();
    ktaOuvrirAideSection(slug);
  });
  // Juste avant la croix : c'est là que l'œil va, et l'ordre reste le même
  // d'une modale à l'autre.
  const croix = head.querySelector(".kta-panneau-close, .kta-readme-modal-close, .kta-tracker-modal-close");
  // 🚨 26/09/2026 — `querySelector` cherche en PROFONDEUR : dans plusieurs
  // en-têtes la croix est imbriquée dans un conteneur d'actions, et
  // `head.insertBefore(b, croix)` jetait alors un `NotFoundError` (« the node
  // before which the new node is to be inserted is not a child of this node »).
  // L'exception partait d'un MutationObserver, donc **hors de tout try**, et
  // laissait la modale sans son bouton ❓ : constaté sur ≡ Légende par le
  // smoke, une fois celui-ci réparé (il s'arrêtait avant d'y arriver).
  // On insère dans le parent RÉEL de la croix : même place à l'œil, plus
  // d'hypothèse sur la profondeur du gabarit.
  if (croix && croix.parentNode) croix.parentNode.insertBefore(b, croix);
  else head.appendChild(b);
}

// Le réglage a changé : on met à jour ce qui est DÉJÀ à l'écran, sinon la case
// n'aurait d'effet qu'à la prochaine ouverture — et donnerait l'impression de
// ne rien faire.
function ktaAideContextuelleRefresh() {
  const actif = ktaAideContextuelleActive();
  Object.keys(AIDE_PAR_MODALE).forEach(function(id) {
    const m = document.getElementById(id);
    if (!m) return;
    const b = m.querySelector(".kta-aide-ctx-btn");
    if (actif && !b) _aidePoserBouton(m);
    if (!actif && b) b.remove();
  });
}

(function _aideCtxObserver() {
  if (typeof MutationObserver !== "function" || !document.documentElement) return;
  const obs = new MutationObserver(function(muts) {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!n || n.nodeType !== 1) continue;
        if (n.id && AIDE_PAR_MODALE[n.id]) _aidePoserBouton(n);
      }
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();

window.ktaOuvrirAideSection       = ktaOuvrirAideSection;
window.ktaAideContextuelleActive  = ktaAideContextuelleActive;
window.ktaAideContextuelleRefresh = ktaAideContextuelleRefresh;

function afficherAide() {
  const existing = document.getElementById("kta-aide-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id = "kta-aide-modal";
  modal.className = "kta-readme-modal-overlay";

  // 🆕 Lot 2 — le contenu vient des DICOS : l'Aide suit la langue de l'app,
  // comme le tutoriel depuis v1.79.4. Plus de booléen `aideEn`, plus de liste
  // de langues à tenir : la disponibilité par langue EST celle des dicos.
  const _aideLang = (window.I18n && typeof window.I18n.getLang === "function")
    ? window.I18n.getLang() : "fr";

  // 🆕 Lot 2 — PLUS DE SÉLECTEUR DE DRAPEAUX DANS L'AIDE. Elle suit désormais
  // la langue GLOBALE de l'app (dicos), donc un toggle local n'aurait plus de
  // sens : il piloterait "myktamap_readme_lang", une clé que l'Aide ne lit
  // plus. Même geste que le tutoriel en v1.79.4 (son toggle 🇫🇷/🇬🇧 a disparu
  // à sa migration). La 📖 Documentation garde le sien : elle reste sur des
  // FICHIERS, avec sa propre portée de langue.

  const aideTitre = window.I18n ? window.I18n.t("aide.ui.titre") : "";

  // 🆕 v1.51.0 (Lot C) : le corps n'est plus le gros scroll monolithique mais
  // un HUB de sections (cartes par catégorie + recherche) → sous-modale par
  // section. Depuis le lot 2, les sections viennent des DICOS (`aide.sec.*`),
  // plus d'un HTML en dur parsé au vol.
  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-aide-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">${aideTitre}</span>
        <button class="kta-panneau-close" id="kta-aide-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps kta-aide-corps" id="kta-aide-corps"></div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  function _closeAll() { _aideFermerSousModal(); modal.remove(); }
  document.getElementById("kta-aide-close").addEventListener("click", _closeAll);
  modal.addEventListener("click", function (e) { if (e.target === modal) _closeAll(); });

  _aideRendreHub(document.getElementById("kta-aide-corps"));
}

// =========================
// 🆕 v1.51.0 (Lot C) — Hub d'aide : sections groupées + sous-modale
// =========================
// Regroupement des sections d'aide pour le hub. `idx` = index de la section
// Rangement des sections en catégories. Depuis le lot 2 le mapping se fait par
// SLUG et non plus par index numérique — c'est ce qui a permis de voir enfin
// les 4 erreurs de rangement accumulées (cf. l'encadré sous AIDE_SECTIONS).
// Ajouter une section = 1 entrée dans AIDE_SECTIONS + 1 slug dans une
// catégorie + les clés `aide.sec.<slug>.*` dans les 3 dicos. Toute section non
// rangée retombe dans « Autres » (filet), et `check-aide-sections.js` refuse
// le commit pour qu'elle ne s'y installe pas.
// 🩸 RÉVISÉ le 01/09/2026 — trois défauts corrigés d'un coup, tous causés par
// ce mécanisme d'index numériques maintenus à la main :
//   1. la section FR « 📚 Bibliothèque de plans » n'avait pas son conteneur et
//      était COLLÉE dans « 👤 Mode profil » (un seul `.kta-aide-section` pour
//      deux titres) → le hub n'affichait qu'une ligne et « Mode profil » était
//      inatteignable ;
//   2. cette même section n'existait PAS en anglais → l'aide EN ne documentait
//      pas une feature livrée en v1.78.0, et FR/EN n'avaient donc pas le même
//      découpage alors que ces index sont COMMUNS aux deux langues ;
//   3. le commentaire annonçait « Mon carnet = index 29 » : elle était en 30.
//      L'index 29 pointait donc sur « Liaisons inter-plan », et « Mon carnet »
//      tombait dans le filet « Autres » sans que personne ne le voie.
// Les index ci-dessous ont été recalculés PAR SCRIPT depuis les titres réels,
// puis chaque ligne a été confrontée FR ↔ EN (même sujet au même index).
// 🛡️ `scripts/check-aide-sections.js` (pré-commit) verrouille tout ça : même
// nombre de sections FR/EN, exactement 1 titre par section, couverture 32/32.
// ORDRE CANONIQUE des sections. C'est lui qui fixe l'ordre d'affichage du
// filet « Autres » et qui sert de source aux clés `aide.sec.<slug>.*`.
// Un slug ne se renomme JAMAIS : un titre se reformule à chaque version, une
// clé i18n vivrait alors dans 3 dicos sous un nom qui ne veut plus rien dire.
const AIDE_SECTIONS = [
  "histoire", "sortie-urgence", "aide-doc-legende", "parametres",
  "recherche", "charger-import", "import-sig", "creer-modifier-plan",
  "bibliotheque-plans", "profil", "favoris", "historique-undo",
  "batterie", "stats-session", "inspecteur-memoire", "legende",
  "menu-tracker", "replay-tracker", "enregistrer", "tracker",
  "mode-secours", "mesure", "edition-points", "structures",
  "traces", "zones", "optimiser-plan", "code-acces",
  "astuces", "depannage", "liaisons-inter-plan", "carnet",
  // 🌍 v1.85.0 — la Vue OSM n’avait AUCUNE fiche : six fonctions y
  // vivaient sans foyer documentaire (mesure, coordonnees de surface,
  // plans par etiquette, couleurs personnalisees, travail de session,
  // ecart de calage). Un ecran entier absent de l’aide.
  "vue-osm",
  // 🧩 01/10/2026 — fiches des fonctionnalités optionnelles qui n'en avaient pas.
  "heatmap", "vibration",
  // ❓ 03/10/2026 (audit de l'aide) — fonctions qui n'avaient pas de fiche à
  // elles : noyées dans « tracker » ou « mesure », ou répétées dans trois fiches.
  "je-suis-perdu", "urgence-xl", "itineraire", "corriger", "multi-niveau"
];

// 🩸 4ᵉ DÉFAUT DU MÉCANISME D'INDEX, découvert en migrant (01/09/2026) :
// la catégorie « 🚨 Coordination secours » portait `idx: [18]` — soit la
// section **🧭 Tracker**. Le vrai Mode Secours était rangé dans « Outils
// carte ». Une erreur de rangement invisible pendant des mois : avec des
// chiffres, rien ne choque ; avec des noms, elle saute aux yeux. C'est
// précisément ce que cette migration achète.
// (Les 3 autres défauts — conteneur oublié, section absente en EN, « Mon
// carnet » orpheline — ont été corrigés au lot 0.)
// ❓ 03/10/2026 — les catégories suivent les chapitres du guide, dans l'ordre
// où l'on en a besoin. « Pour aller plus loin » reçoit ce qui est désactivé par
// défaut, le Mode Secours et les outils des créateurs de plans.
const AIDE_CATEGORIES = [
  { cle: "prise-en-main", slugs: ["aide-doc-legende", "astuces"] },
  { cle: "urgence",       slugs: ["sortie-urgence", "urgence-xl", "je-suis-perdu"] },
  { cle: "carte",         slugs: ["legende", "recherche", "vue-osm", "histoire", "liaisons-inter-plan"] },
  { cle: "reperer",       slugs: ["menu-tracker", "tracker", "itineraire", "mesure", "multi-niveau"] },
  { cle: "annoter",       slugs: ["edition-points", "traces", "zones", "structures", "corriger",
                                  "historique-undo"] },
  { cle: "donnees",       slugs: ["carnet", "stats-session", "favoris", "profil", "enregistrer",
                                  "charger-import", "import-sig", "bibliotheque-plans"] },
  { cle: "reglages",      slugs: ["parametres", "inspecteur-memoire", "depannage"] },
  { cle: "plus-loin",     slugs: ["replay-tracker", "heatmap", "batterie", "vibration", "code-acces",
                                  "mode-secours", "creer-modifier-plan", "optimiser-plan"] }
];

// Une ligne cliquable du hub (titre + chevron).
function _aideRow(section, onClick) {
  const r = document.createElement("button");
  r.type = "button";
  r.className = "kta-aide-row";
  const t = document.createElement("span");
  t.className = "kta-aide-row-titre";
  // Accepte une section (titre + raccourci) ou une simple chaîne (ligne
  // « ⌨️ Raccourcis clavier », qui n'est pas une section).
  if (typeof section === "string") t.textContent = section;
  else _aidePoserTitre(t, section);
  const chev = document.createElement("span");
  chev.className = "kta-aide-row-chevron";
  chev.textContent = "›";
  r.appendChild(t);
  r.appendChild(chev);
  r.addEventListener("click", onClick);
  return r;
}

// Construit l'objet section depuis les DICOS (plus de HTML en dur : lot 2).
// Le titre ET le corps sont des clés i18n ; le corps contient du HTML, c'est
// VOULU — ce sont des sections de documentation mises en forme, pas des
// libellés. Les classes de mise en forme viennent du CSS (lot 1).
function _aideSection(slug) {
  const t = window.I18n ? window.I18n.t("aide.sec." + slug + ".titre") : slug;
  const h = window.I18n ? window.I18n.t("aide.sec." + slug + ".html") : "";
  // ⌨️ 14/09/2026 — le raccourci clavier a sa PROPRE clé, facultative. Avant,
  // il était écrit dans le titre avec son `<span>` : posé en `textContent`, le
  // balisage s'affichait en clair (« Recherche unifiée <span class=… »). Le
  // titre est du texte, la mise en forme appartient au gabarit — règle CLAUDE.md.
  const r = (window.I18n && window.I18n.has && window.I18n.has("aide.sec." + slug + ".raccourci"))
    ? window.I18n.t("aide.sec." + slug + ".raccourci") : "";
  return { slug: slug, titre: t, raccourci: r, html: h };
}

// Pose un titre de section : le texte, puis le raccourci en petit s'il existe.
// Un seul endroit, appelé par le hub ET par la fiche — deux rendus divergeraient.
function _aidePoserTitre(el, section) {
  if (!el || !section) return;
  el.textContent = section.titre || "";
  if (!section.raccourci) return;
  const s = document.createElement("span");
  s.className = "kta-aide-mini";
  s.textContent = " (" + section.raccourci + ")";
  el.appendChild(s);
}

function _aideRendreHub(corps) {
  if (!corps) return;

  // Intro générale.
  const intro = document.createElement("p");
  intro.className = "kta-aide-intro";
  intro.innerHTML = window.I18n ? window.I18n.t("aide.intro") : "";
  corps.appendChild(intro);

  // Barre de recherche
  const search = document.createElement("input");
  search.type = "search";
  search.className = "kta-aide-hub-search";
  search.placeholder = window.I18n ? window.I18n.t("aide.ui.search") : "";
  corps.appendChild(search);

  const hub = document.createElement("div");
  hub.className = "kta-aide-hub";
  corps.appendChild(hub);

  // Ligne épinglée : cheatsheet des raccourcis clavier (ouvre ShortcutsCheatsheet).
  const libCheat = window.I18n ? window.I18n.t("aide.ui.shortcuts") : "";
  const cheatRow = _aideRow(libCheat, function() {
    if (window.ShortcutsCheatsheet && typeof window.ShortcutsCheatsheet.ouvrir === "function") {
      window.ShortcutsCheatsheet.ouvrir();
    }
  });
  cheatRow.dataset.aideTitre = window.ktaDocNormaliser(libCheat);
  hub.appendChild(cheatRow);

  // Catégories + lignes
  const used = {};
  AIDE_CATEGORIES.forEach(function(cat) {
    const rows = [];
    cat.slugs.forEach(function(slug) {
      if (AIDE_SECTIONS.indexOf(slug) < 0) return;   // slug inconnu : ignoré
      used[slug] = true;
      rows.push(_aideSection(slug));
    });
    if (!rows.length) return;
    const ct = document.createElement("div");
    ct.className = "kta-aide-cat-titre";
    ct.textContent = window.I18n ? window.I18n.t("aide.cat." + cat.cle) : cat.cle;
    hub.appendChild(ct);
    rows.forEach(function(s) {
      const r = _aideRow(s, function() { _aideOuvrirSousModal(s); });
      // 🔎 D27 (14/09/2026) : la recherche ne filtrait que les 30 TITRES —
      // chercher « CSV » ou « wake lock » ne trouvait rien alors que les mots
      // sont dans le corps des sections. Titre + contenu (balises retirées),
      // accents tolérés.
      r.dataset.aideTitre = window.ktaDocNormaliser(s.titre);
      r.dataset.aideTexte = window.ktaDocNormaliser(String(s.html || "").replace(/<[^>]+>/g, " "));
      hub.appendChild(r);
    });
  });

  // Filet de sécurité : sections non rangées (si le mapping dérive).
  // `check-aide-sections.js` interdit ce cas au commit — le filet reste pour
  // qu'une section oubliée soit ATTEIGNABLE plutôt que perdue en silence.
  const orphans = AIDE_SECTIONS.filter(function(slug) { return !used[slug]; })
                               .map(_aideSection);
  if (orphans.length) {
    const ct = document.createElement("div");
    ct.className = "kta-aide-cat-titre";
    ct.textContent = window.I18n ? window.I18n.t("aide.ui.other") : "";
    hub.appendChild(ct);
    orphans.forEach(function(s) {
      const r = _aideRow(s, function() { _aideOuvrirSousModal(s); });
      // 🔎 D27 (14/09/2026) : la recherche ne filtrait que les 30 TITRES —
      // chercher « CSV » ou « wake lock » ne trouvait rien alors que les mots
      // sont dans le corps des sections. Titre + contenu (balises retirées),
      // accents tolérés.
      r.dataset.aideTitre = window.ktaDocNormaliser(s.titre);
      r.dataset.aideTexte = window.ktaDocNormaliser(String(s.html || "").replace(/<[^>]+>/g, " "));
      hub.appendChild(r);
    });
  }

  // Message "aucun résultat"
  const empty = document.createElement("div");
  empty.className = "kta-aide-empty";
  empty.style.display = "none";
  empty.textContent = window.I18n ? window.I18n.t("aide.ui.empty") : "";
  corps.appendChild(empty);

  // Filtrage par recherche (titre + contenu, accents tolérés — D27)
  search.addEventListener("input", function() {
    const q = window.ktaDocNormaliser(search.value.trim());
    let visibles = 0;
    hub.querySelectorAll(".kta-aide-row").forEach(function(r) {
      const match = !q || (r.dataset.aideTitre || "").indexOf(q) >= 0
                       || (r.dataset.aideTexte || "").indexOf(q) >= 0;
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
function _aideOuvrirSousModal(section) {
  _aideFermerSousModal();
  const ov = document.createElement("div");
  ov.id = "kta-aide-submodal";
  ov.className = "kta-readme-modal-overlay kta-aide-submodal";
  ov.innerHTML =
    '<div class="kta-readme-modal-boite kta-aide-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<button class="kta-aide-submodal-back" type="button" id="kta-aide-back">← ' +
          (window.I18n ? window.I18n.t("aide.ui.back") : "") + "</button>" +
        '<button class="kta-panneau-close" id="kta-aide-sub-close" type="button">✕</button>' +
      "</div>" +
      '<div class="kta-readme-modal-corps kta-aide-corps" id="kta-aide-sub-corps"></div>' +
    "</div>";
  document.documentElement.appendChild(ov);
  // Le contenu vient des dicos : on reconstruit la section (titre + corps)
  // au lieu de cloner un nœud parsé depuis du HTML en dur (lot 2).
  const corps = ov.querySelector("#kta-aide-sub-corps");
  if (corps && section) {
    const bloc = document.createElement("div");
    bloc.className = "kta-aide-section";
    const t = document.createElement("div");
    t.className = "kta-aide-section-titre";
    _aidePoserTitre(t, section);
    bloc.appendChild(t);
    const c = document.createElement("div");
    c.innerHTML = section.html || "";
    while (c.firstChild) bloc.appendChild(c.firstChild);
    corps.appendChild(bloc);
  }

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
// AIDE — le contenu vit dans les DICOS (lot 2, 01/09/2026)
// =========================
// _aideHtmlFr() et _aideHtmlEn() ont été SUPPRIMÉES ici : 1 738 lignes de
// HTML en dur, dupliquées en deux langues, que personne ne pouvait traduire
// sans écrire 870 lignes de plus par langue.
// Le contenu est désormais dans lang/<code>.json :
//   aide.intro                  · le paragraphe d introduction
//   aide.sec.<slug>.titre       · le titre d une section
//   aide.sec.<slug>.html        · son corps (HTML VOULU : ce sont des
//                                 sections de doc mises en forme, et les
//                                 classes viennent du CSS depuis le lot 1)
//   aide.cat.<cle> · aide.ui.*  · titres de catégories et libellés du hub
// Ajouter une langue = traduire des clés. Plus de fonction à écrire, plus de
// liste de langues à tenir (AIDE_AVAILABLE_LANGS a disparu avec elles) :
// la disponibilité par langue EST celle des dicos, comme le tutoriel v1.79.4.
// Ordre et rangement des sections : AIDE_SECTIONS / AIDE_CATEGORIES ci-dessus.
// =========================
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

// 🆕 v1.69.0 — PROFILS DE CONTEXTE. Le template est balisé par des marqueurs
// `<!-- @@PROFIL usage,diagnostic -->` (un marqueur s'applique jusqu'au
// suivant ; "tous" = commun à tous les profils). Filtrer = garder les blocs
// du profil demandé + les blocs communs. profil null/"complet" = tout garder.
// Objectif : fichiers de ~60-120 Ko réellement lisibles en entier par les IA
// (l'ancien fichier unique de ~500 Ko était tronqué/résumé par la plupart).
function _filtrerContexteParProfil(tpl, profil) {
  const complet = !profil || profil === "complet";
  const out = [];
  let scope = ["tous"];
  for (const line of tpl.split("\n")) {
    const m = /^<!-- @@PROFIL ([a-z, ]+) -->\s*$/.exec(line);
    if (m) { scope = m[1].split(",").map(function(x) { return x.trim(); }); continue; }
    if (complet || scope.indexOf("tous") >= 0 || scope.indexOf(profil) >= 0) out.push(line);
  }
  return out.join("\n");
}

// 🆕 v1.69.0 — Bloc « état de l'installation » (opt-in, case décochée par
// défaut). Généré 100 % localement, joint au contexte pour permettre à l'IA
// un diagnostic ciblé. ANONYME PAR CONSTRUCTION : aucun nom de plan, aucun
// point/coordonnée/photo — uniquement des caractéristiques techniques.
async function _genererEtatInstallation() {
  const L = [];
  L.push("## 🔧 État de l'installation (généré localement, anonyme)");
  L.push("");
  try {
    const lang = (window.I18n && window.I18n.getLang) ? window.I18n.getLang() : "?";
    let theme = "sombre";
    try { if (localStorage.getItem("myktamap_theme_v1") === "light") theme = "clair"; } catch(e) {}
    L.push("- Version : " + ((window.__MKM__ && window.__MKM__.build) || "?") +
           " · langue app : " + lang + " · thème : " + theme);
    const standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    L.push("- Appareil : " + navigator.userAgent);
    L.push("- Écran : " + screen.width + "×" + screen.height + " (dpr " + (window.devicePixelRatio || 1) +
           ") · PWA installée : " + (standalone ? "oui" : "non") + " · en ligne : " + (navigator.onLine ? "oui" : "non"));
  } catch(e) {}
  // Stockage (quota navigateur)
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      const mo = function(n) { return Math.round((n || 0) / 1024 / 1024) + " Mo"; };
      L.push("- Stockage navigateur : " + mo(est.usage) + " utilisés / " + mo(est.quota) + " de quota");
    }
  } catch(e) {}
  // Plans (anonymisés : Plan 1..N, jamais les noms — ce sont des lieux sensibles)
  try {
    const plans = (window.PlanRegistry && window.PlanRegistry.getAll) ? window.PlanRegistry.getAll() : [];
    L.push("- Plans dans la bibliothèque : " + plans.length);
    plans.forEach(function(p, i) {
      const mode = (p.tiledV2 ? "V2" : "V1") + (p.multiLevel ? "+M-LVL" : "");
      const stock = p.storedBlob ? "mémorisé dans l'app" : (p.fsHandle ? "accès fichier permanent" : (p.type === "server" ? "serveur" : "re-sélection requise"));
      const taille = (p.sizeBytes || p.size) ? " · " + Math.round((p.sizeBytes || p.size) / 1024 / 1024) + " Mo" : "";
      L.push("  - Plan " + (i + 1) + " : " + (p.type || "?") + " · mode " + mode + " · preset perf " + (p.perfPreset || "auto") + " · " + stock + taille);
    });
  } catch(e) {}
  // Sessions persistées (tailles uniquement)
  try {
    let n = 0, tot = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf("myktamap_session_v1_") === 0) { n++; tot += (localStorage.getItem(k) || "").length; }
    }
    L.push("- Sessions sauvegardées : " + n + " (" + Math.round(tot / 1024) + " Ko au total)");
  } catch(e) {}
  // Dernières erreurs/avertissements du buffer de logs (debug.js)
  try {
    const buf = JSON.parse(localStorage.getItem("kta_debug_logs") || "[]");
    const errs = buf.filter(function(l) { return typeof l === "string" && (l.indexOf("[ERROR]") === 0 || l.indexOf("[WARN]") === 0); }).slice(-15);
    if (errs.length) {
      L.push("- Derniers avertissements/erreurs de la console (max 15) :");
      L.push("```");
      errs.forEach(function(l) { L.push(l.length > 300 ? l.slice(0, 300) + "…" : l); });
      L.push("```");
    } else {
      L.push("- Aucun avertissement/erreur récent dans le journal de logs.");
    }
  } catch(e) {}
  L.push("");
  return L.join("\n");
}

function _genererContenuContexteIA(aiContextTemplate, profil, etatBlock) {
  const dateExport = new Date().toISOString().slice(0, 10);
  const buildVersion = (window.__MKM__ && window.__MKM__.build) || "non-défini";

  // Si le template docs/AI_CONTEXT.md est dispo, on s'en sert. Sinon fallback minimal.
  if (aiContextTemplate && aiContextTemplate.trim().length > 0) {
    let contenu = _filtrerContexteParProfil(aiContextTemplate, profil)
      // Purge des commentaires HTML restants (note éditeur en tête, etc.) :
      // le contexte livré à l'IA ne doit contenir que du contenu utile.
      .replace(/<!--[\s\S]*?-->\n?/g, "")
      .replace(/\{\{DATE\}\}/g, dateExport)
      .replace(/\{\{BUILD\}\}/g, buildVersion)
      // Rétrocompat : vieux template encore en cache SW → le placeholder de la
      // doc intégrale est remplacé par un renvoi (plus jamais les ~250 Ko).
      .replace(/\{\{README_USER\}\}/g,
        "_La documentation intégrale n'est plus incluse dans ce fichier (trop volumineuse pour être lue en entier par une IA). Consulte la Documentation intégrée de l'app (bouton 📖)._");
    if (etatBlock) {
      const finDoc = contenu.indexOf("**Fin du document.**");
      contenu = (finDoc >= 0)
        ? contenu.slice(0, finDoc) + etatBlock + "\n" + contenu.slice(finDoc)
        : contenu + "\n\n---\n\n" + etatBlock;
    }
    return contenu;
  }

  // ===== Fallback ultra-minimal si AI_CONTEXT.md est introuvable =====
  return (
    "# MyKTAMap — Contexte IA (fallback minimal)\n\n" +
    "> ⚠️ Le fichier `AI_CONTEXT.md` n'a pas pu être récupéré. Réessaye depuis l'app " +
    "quand le service worker aura mis `AI_CONTEXT.md` en cache.\n\n" +
    "**Auteur** : Flavien VIDAL (alias KARMA) · **Licence** : CC BY-NC-SA 4.0 · " +
    "**Site** : https://myktamap.fr\n\n" +
    "Date d'export : " + dateExport + " · Build : " + buildVersion + "\n\n" +
    (etatBlock ? "---\n\n" + etatBlock : "")
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
          '<div class="kta-aide-section-titre">' + window.I18n.t("aiia.profil.titre") + '</div>' +
          '<div id="kta-aide-ia-profils" style="display:flex; flex-direction:column; gap:6px; font-size:13px; color:#c8d0e0;">' +
            '<label style="display:flex; gap:8px; align-items:baseline; cursor:pointer;"><input type="radio" name="ktaAiiaProfil" value="usage" checked> <span><strong>' + window.I18n.t("aiia.profil.usage") + '</strong> — ' + window.I18n.t("aiia.profil.usage.desc") + '</span></label>' +
            '<label style="display:flex; gap:8px; align-items:baseline; cursor:pointer;"><input type="radio" name="ktaAiiaProfil" value="diagnostic"> <span><strong>' + window.I18n.t("aiia.profil.diagnostic") + '</strong> — ' + window.I18n.t("aiia.profil.diagnostic.desc") + '</span></label>' +
            '<label style="display:flex; gap:8px; align-items:baseline; cursor:pointer;"><input type="radio" name="ktaAiiaProfil" value="plans"> <span><strong>' + window.I18n.t("aiia.profil.plans") + '</strong> — ' + window.I18n.t("aiia.profil.plans.desc") + '</span></label>' +
            '<label style="display:flex; gap:8px; align-items:baseline; cursor:pointer;"><input type="radio" name="ktaAiiaProfil" value="complet"> <span><strong>' + window.I18n.t("aiia.profil.complet") + '</strong> — ' + window.I18n.t("aiia.profil.complet.desc") + '</span></label>' +
          '</div>' +
          '<label style="display:flex; gap:8px; align-items:baseline; cursor:pointer; margin-top:10px; font-size:13px; color:#c8d0e0;">' +
            '<input type="checkbox" id="kta-aide-ia-etat"> <span>' + window.I18n.t("aiia.etat.label") + '</span>' +
          '</label>' +
          '<p style="color:#8892a4; line-height:1.5; font-size:11px; margin:4px 0 0 24px;">' + window.I18n.t("aiia.etat.note") + '</p>' +
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

        '<div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-aide-ia-cancel"   type="button" style="flex:1; min-width:90px;">' + window.I18n.t("aiia.btn.cancel") + '</button>' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-aide-ia-copyctx"  type="button" style="flex:2; min-width:150px;">' + window.I18n.t("aiia.btn.copyCtx") + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-aide-ia-download" type="button" style="flex:2; min-width:150px;">' + window.I18n.t("aiia.btn.download") + '</button>' +
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

  // 🆕 v1.69.0 — génération factorisée : fetch du template (seul — la doc
  // intégrale n'est plus injectée), filtrage par profil, bloc état opt-in.
  async function _genererContexte(statusEl) {
    statusEl.textContent = window.I18n.t("aiia.dl.fetching");
    let aiContextTpl = "";
    try {
      const respCtx = await fetch("docs/applications/AI_CONTEXT.md", { cache: "no-cache" });
      if (respCtx.ok) aiContextTpl = await respCtx.text();
      else console.warn("[AideIA] docs/applications/AI_CONTEXT.md HTTP " + respCtx.status);
    } catch(e) {
      console.warn("[AideIA] Erreur fetch :", e);
      statusEl.textContent = window.I18n.t("aiia.dl.offline");
    }
    const profilInput = modal.querySelector('input[name="ktaAiiaProfil"]:checked');
    const profil = profilInput ? profilInput.value : "usage";
    let etatBlock = null;
    const etatCb = document.getElementById("kta-aide-ia-etat");
    if (etatCb && etatCb.checked) {
      try { etatBlock = await _genererEtatInstallation(); }
      catch(e) { console.warn("[AideIA] État installation :", e); }
    }
    return { contenu: _genererContenuContexteIA(aiContextTpl, profil, etatBlock), profil: profil };
  }

  // 📥 Télécharger le fichier .md
  document.getElementById("kta-aide-ia-download").addEventListener("click", async function() {
    const btn = this;
    const statusEl = document.getElementById("kta-aide-ia-status");
    btn.disabled = true;
    btn.textContent = window.I18n.t("aiia.dl.generating");

    const res = await _genererContexte(statusEl);
    const blob = new Blob([res.contenu], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MyKTAMap-AI-Context-" + res.profil + "-" + ts + ".md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    statusEl.textContent = window.I18n.t("aiia.dl.done", { ko: Math.round(res.contenu.length / 1024) });
    btn.textContent = window.I18n.t("aiia.btn.download");
    btn.disabled = false;

    // Fermer la modale après 1.5s
    setTimeout(_fermer, 1500);
  });

  // 📋 Copier le contexte directement dans le presse-papiers (mobile-friendly :
  // coller dans un chat IA est bien plus simple que joindre un fichier .md).
  document.getElementById("kta-aide-ia-copyctx").addEventListener("click", async function() {
    const btn = this;
    const statusEl = document.getElementById("kta-aide-ia-status");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = window.I18n.t("aiia.dl.generating");
    try {
      const res = await _genererContexte(statusEl);
      // Copie : API clipboard d'abord, repli execCommand si elle échoue
      // (writeText peut throw même en contexte sécurisé, ex. document non focus).
      let copie = false;
      if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(res.contenu); copie = true; } catch(e) {}
      }
      if (!copie) {
        const ta = document.createElement("textarea");
        ta.value = res.contenu;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        copie = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!copie) throw new Error("clipboard + execCommand KO");
      }
      statusEl.textContent = window.I18n.t("aiia.copyCtx.ok", { ko: Math.round(res.contenu.length / 1024) });
      btn.textContent = window.I18n.t("aiia.copy.ok");
      btn.classList.add("kta-aide-ia-copy-ok");
      setTimeout(function() {
        btn.textContent = originalText;
        btn.classList.remove("kta-aide-ia-copy-ok");
        btn.disabled = false;
      }, 2000);
    } catch(e) {
      console.warn("[AideIA] Copie contexte :", e);
      statusEl.textContent = window.I18n.t("aiia.copy.fail");
      btn.textContent = originalText;
      btn.disabled = false;
    }
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
