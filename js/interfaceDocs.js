/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE DOCS — modales Documentation (README), Aide (hub + aide contextuelle), Aide IA
// =========================
// Expose : afficherReadme(opts) (docs/applications/README_USER{,.en,.es}.md ; opts.hideOnboarding et
//   opts.overLocker pour l'ouvrir depuis UnlockGate / PinLock ; opts.guide : second guide d'une extension) ·
//   afficherAide() · afficherModaleAideIA() (docs/applications/AI_CONTEXT.md filtré par profil) ·
//   ktaOuvrirAideSection(slug) · ktaDocNormaliser / ktaDocTrouver (recherche plein texte, exécutées par le garde-fou).
// Dépend de : __MKM__.build, I18n (resolveContentLang, onChange), KtaExtensions.aide / .documentation,
//   ktaCopierTexte.
// ⚠️ Langue de la Documentation LOCALE (myktamap_readme_lang ≠ langue globale myktamap_app_lang) ;
//   l'Aide, elle, vit dans les dicos (aide.*) et suit la langue globale.
// Garde-fous : scripts/check-aide-sections.js, scripts/check-aide-contextuelle.js,
//   scripts/check-doc-recherche.js

// ── README : modale plein écran ──────────
// overLocker : z-index relevé au-dessus des deux gates (sinon la doc s'ouvre derrière) ;
// hideOnboarding : pas de 🎓 Tutoriel (l'utilisateur verrouillé ne peut pas s'en servir).
// Langue : détection au premier affichage, choix manuel mémorisé, repli FR si le fichier manque.
const README_LANG_STORAGE_KEY = "myktamap_readme_lang";

// Langues pour lesquelles un fichier README_USER existe RÉELLEMENT (fr = sans suffixe, autres =
// README_USER.<code>.md). Ajouter une langue = déposer le fichier + son code ici + ASSETS_TO_CACHE du SW.
const DOC_AVAILABLE_LANGS = ["fr", "en", "es"];

// 🩸 CETTE LISTE NE CONCERNE QUE LA 📖 DOCUMENTATION. L'Aide ne doit jamais la lire : y ajouter une langue
// de doc ferait basculer l'Aide sur une langue sans contenu (son contenu vient des dicos).

// Langue à PRÉSÉLECTIONNER : choix manuel mémorisé s'il est encore disponible, sinon dérivé de la langue
// de l'app (I18n.resolveContentLang : langue app si doc dispo, sinon "en", sinon "fr"). Le défaut dérivé
// n'est PAS persisté : sans clic sur un drapeau, la doc suit l'app (décision produit).
function _getReadmeLang() {
  try {
    const saved = localStorage.getItem(README_LANG_STORAGE_KEY);
    if (DOC_AVAILABLE_LANGS.indexOf(saved) >= 0) return saved;
  } catch(e) {}
  if (window.I18n && typeof window.I18n.resolveContentLang === "function") {
    return window.I18n.resolveContentLang(DOC_AVAILABLE_LANGS);
  }
  // Repli si I18n indisponible : navigator.language mappé sur une langue dispo, sinon FR.
  const navLang = (navigator.language || navigator.userLanguage || "").toLowerCase();
  const guess = navLang.split("-")[0];
  return (DOC_AVAILABLE_LANGS.indexOf(guess) >= 0) ? guess : "fr";
}

function _setReadmeLang(lang) {
  if (DOC_AVAILABLE_LANGS.indexOf(lang) < 0) return;
  try { localStorage.setItem(README_LANG_STORAGE_KEY, lang); } catch(e) {}
}

// Changer la langue GLOBALE efface le choix manuel de la doc et de l'onboarding (clé partagée
// myktamap_readme_lang) : ils re-suivent la langue app. Le choix local reste sticky tant que la langue
// globale ne change pas. Enregistré une fois au chargement.
if (window.I18n && typeof window.I18n.onChange === "function") {
  window.I18n.onChange(function() {
    try { localStorage.removeItem(README_LANG_STORAGE_KEY); } catch (e) {}
  });
}

// fr = README_USER.md ; autre langue = README_USER.<code>.md (docs/applications/).
function _readmePathForLang(lang) {
  return (lang === "fr")
    ? "docs/applications/README_USER.md"
    : "docs/applications/README_USER." + lang + ".md";
}

// Recherche plein texte : helpers PURS, exécutés par scripts/check-doc-recherche.js.
// Normalisation 1:1 (même longueur en unités UTF-16 : minuscules, accents retirés) pour que les positions
// restent celles du texte d'origine (surlignage sans décalage).
// Texte d'un fragment HTML en un passage — pas /<[^>]+>/g, quadratique sur un « < » sans « > » (Sonar S8786).
function _aideSansBalises(h) {
  const s = String(h || "");
  let out = "", i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt < 0) { out += s.slice(i); break; }
    const gt = s.indexOf(">", lt + 1);
    if (gt < 0) { out += s.slice(i); break; }
    out += s.slice(i, lt) + " ";
    i = gt + 1;
  }
  return out;
}

window.ktaDocNormaliser = function(s) {
  let out = "";
  for (const ch of String(s || "")) {
    const b = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    out += (b.length === 1) ? b : ch;
  }
  return out;
};
// Occurrences non chevauchantes de q → [[début, fin], …] (indices du texte d'origine) ; < 2 caractères → [].
window.ktaDocTrouver = function(texte, q) {
  const t = window.ktaDocNormaliser(texte);
  const n = window.ktaDocNormaliser(q).trim();
  const res = [];
  if (n.length < 2) return res;
  let i = t.indexOf(n);
  while (i !== -1) { res.push([i, i + n.length]); i = t.indexOf(n, i + n.length); }
  return res;
};

// opts.guide : « classique » | « extension » (guide d'une extension, prise KtaExtensions.documentation).
// Sans prise : guide classique direct. Avec une prise et sans opts.guide : choix des deux guides d'abord.
function afficherReadme(opts) {
  opts = opts || {};
  const existing = document.getElementById("kta-readme-modal");
  if (existing) { existing.remove(); return; }

  const lang = _getReadmeLang();
  const K = window.KtaExtensions;
  const ext = (opts.guide !== "classique" && K && typeof K.aPrise === "function" && K.aPrise("documentation"))
    ? K.documentation() : null;
  if (!ext) { _chargerReadme(_readmePathForLang(lang), Object.assign({}, opts, { guide: "classique" })); return; }
  if (opts.guide === "extension") {
    _chargerReadme(ext.fichiers[lang] || ext.fichiers.fr, Object.assign({}, opts, { titreGuide: ext.titre }));
    return;
  }
  _choisirGuide(ext, opts);
}

// Choix « Classique » / guide de l'extension, dans le gabarit des fenêtres de la Documentation.
function _choisirGuide(ext, opts) {
  const vieux = document.getElementById("kta-readme-choix");
  if (vieux) { vieux.remove(); return; }
  const t = function (k) { return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k) : k; };
  const ov = document.createElement("div");
  ov.id = "kta-readme-choix";
  ov.className = "kta-readme-modal-overlay";
  if (opts.overLocker) ov.classList.add("kta-readme-over-locker");
  const boite = document.createElement("div");
  boite.className = "kta-readme-modal-boite";
  boite.style.cssText = "max-width:420px; height:auto;";
  const entete = document.createElement("div");
  entete.className = "kta-readme-modal-header";
  const titre = document.createElement("span");
  titre.className = "kta-readme-modal-titre";
  titre.textContent = t("docs.choix.titre");
  const fermer = document.createElement("button");
  fermer.className = "kta-panneau-close";
  fermer.type = "button";
  fermer.textContent = "✕";
  entete.append(titre, fermer);
  const corps = document.createElement("div");
  corps.className = "kta-readme-modal-corps";
  corps.style.cssText = "display:flex; flex-direction:column; gap:10px; font-size:13px;";
  const bouton = function (id, libelle, guide) {
    const b = document.createElement("button");
    b.type = "button";
    b.id = id;
    b.className = "kta-btn kta-btn-primary";
    b.textContent = libelle;
    b.addEventListener("click", function () {
      ov.remove();
      afficherReadme(Object.assign({}, opts, { guide: guide }));
    });
    return b;
  };
  corps.append(bouton("kta-readme-choix-classique", "📖 " + t("docs.choix.classique"), "classique"),
    bouton("kta-readme-choix-extension", "📖 " + ext.titre, "extension"));
  boite.append(entete, corps);
  ov.appendChild(boite);
  fermer.addEventListener("click", function () { ov.remove(); });
  ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
  document.documentElement.appendChild(ov);
}

// Sommaire latéral (desktop) / en haut (mobile), H2 + sous-H3 repliables.
function _construireSommaireReadme(corpsEl) {
  const sidebar = document.getElementById("kta-readme-toc-sidebar");
  if (!sidebar || !corpsEl) return;

  const h2List = Array.from(corpsEl.querySelectorAll("h2"));
  if (h2List.length === 0) {
    sidebar.style.display = "none";
    return;
  }

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

  sidebar.querySelectorAll(".kta-readme-toc-toggle").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      const item = btn.closest(".kta-readme-toc-item");
      if (item) item.classList.toggle("collapsed");
    });
  });
}

function _setupReadmeNavigation() {
  const corpsScroll = document.getElementById("kta-readme-corps-scroll");
  const backBtn     = document.getElementById("kta-readme-back-top");
  const sidebar     = document.getElementById("kta-readme-toc-sidebar");
  if (!corpsScroll) return;

  const tocLinks = sidebar ? sidebar.querySelectorAll(".kta-readme-toc-link") : [];
  const sections = corpsScroll.querySelectorAll("h2[id], h3[id]");

  // Scroll maison : l'ancrage natif ferait défiler la page entière, pas notre conteneur.
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

  if (typeof IntersectionObserver !== "undefined" && sections.length > 0 && tocLinks.length > 0) {
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        tocLinks.forEach(function(link) {
          const isActive = link.getAttribute("href") === "#" + id;
          link.classList.toggle("active", isActive);
          // H3 actif → déplier son H2.
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

// Recherche de la Documentation : surlignage de toutes les occurrences, compteur « i / n », Entrée ou ↓
// pour la suivante, entrées du sommaire sans résultat estompées.
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
  _ouvrirReadmeModal("<p style='color:var(--kta-texte-3); text-align:center; padding:20px;'>⏳ Chargement…</p>", opts);
  fetch(fichier)
    .then(function(res) { if (!res.ok) throw new Error("HTTP " + res.status + " — " + fichier); return res.text(); })
    .then(function(md) {
      const html = _renderMarkdown(md);
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (!corps) return;
      corps.innerHTML = html;
      _construireSommaireReadme(corps);
      _setupReadmeNavigation();
      _setupReadmeSearch();
    })
    .catch(function(err) {
      const corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      if (corps) corps.innerHTML = '<p class="kta-readme-erreur">❌ ' + (window.I18n ? window.I18n.t("docs.erreurChargement") : "Impossible de charger") + ' <code>' + fichier + '</code><br><br><code>' + err.message + '</code></p>';
      const sidebar = document.getElementById("kta-readme-toc-sidebar");
      if (sidebar) sidebar.style.display = "none";
    });
}

function _renderMarkdown(md) {
  // 0. Fins de ligne normalisées : le CRLF casse les regex \n (blocs de code fenced).
  md = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 1. Blocs de code fenced protégés AVANT tout traitement.
  const codeBlocks = [];
  md = md.replace(/```[\w]*\n([\s\S]*?)```/g, function(_, code) {
    codeBlocks.push(code);
    return "%%CODE" + (codeBlocks.length - 1) + "%%";
  });

  // 2. Échapper le HTML, guillemets compris (URL et alt repartent dans des attributs).
  md = window.ktaEsc(md);

  // 3. Code inline.
  md = md.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 4. Images, avant les liens.
  md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function(_, alt, url) {
    // Images GitHub (assets) inaccessibles hors contexte : ignorées.
    if (url.includes("github.com") || url.includes("user-attachments")) {
      return '<span class="kta-readme-img-skip">📷 <em>' + (alt || "Image") + '</em></span>';
    }
    return '<img src="' + url + '" alt="' + alt + '" style="max-width:100%;border-radius:6px;margin:8px 0;">';
  });

  // 5. Liens.
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 6. Tableaux.
  md = md.replace(/((?:^\|.+\|\n?)+)/gm, function(block) {
    const lines = block.trim().split("\n").filter(function(l) { return l.trim(); });
    if (lines.length < 2) return block;

    let html = '<table class="kta-readme-table">';
    lines.forEach(function(line, i) {
      if (/^\|[\s\-:|]+\|/.test(line)) return;
      const cells = line.split("|").filter(function(_, ci) { return ci > 0 && ci < line.split("|").length - 1; });
      const tag = (i === 0) ? "th" : "td";
      html += "<tr>" + cells.map(function(c) { return "<" + tag + ">" + c.trim() + "</" + tag + ">"; }).join("") + "</tr>";
    });
    html += "</table>";
    return html;
  });

  // 7. Blockquotes.
  md = md.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  md = md.replace(/(<\/blockquote>\n?<blockquote>)/g, "<br>");

  // 8. Titres jusqu'au niveau 5 (le Mode Secours descend à #####).
  md = md
    .replace(/^##### (.+)$/gm, "<h5>$1</h5>")
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm,  "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,   "<h2>$1</h2>")
    .replace(/^# (.+)$/gm,    "<h1>$1</h1>");

  // 9. HR.
  md = md.replace(/^---$/gm, "<hr>");

  // 10. Gras / italique.
  md = md
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,         "<em>$1</em>");

  // 11. Listes.
  md = md.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
  md = md.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, "<ul>$&</ul>");

  // 12. Paragraphes (double saut de ligne). Les placeholders %%CODEN%% sont isolés dans leur bloc, sinon
  // le <p> engloberait un <pre> (HTML invalide).
  md = md.replace(/(%%CODE\d+%%)/g, "\n\n$1\n\n");
  md = md.replace(/\n{3,}/g, "\n\n");

  // Blocs block-level et placeholders gardés tels quels ; texte enveloppé de <p>, sauts simples → <br>.
  const _BLOCK_TAG = /^<(h[1-6]|ul|ol|li|table|tr|td|th|blockquote|hr|pre|div|img|figure)/i;
  const _CODE_PLACEHOLDER = /^%%CODE\d+%%$/;
  md = md.split(/\n{2,}/).map(function(block) {
    block = block.trim();
    if (!block) return "";
    if (_BLOCK_TAG.test(block)) return block;
    if (_CODE_PLACEHOLDER.test(block)) return block;
    return "<p>" + block.replace(/\n/g, "<br>") + "</p>";
  }).join("\n");

  // 13. Restaurer les blocs de code.
  md = md.replace(/%%CODE(\d+)%%/g, function(_, i) {
    const escaped = window.ktaEsc(codeBlocks[Number.parseInt(i, 10)]);
    return "<pre><code>" + escaped + "</code></pre>";
  });

  return md;
}

function _ouvrirReadmeModal(html, opts) {
  opts = opts || {};
  const modal = document.createElement("div");
  modal.id = "kta-readme-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.dataset.guide = opts.titreGuide ? "extension" : "classique";
  // Ouverte depuis un écran de verrouillage : z-index au-dessus des deux gates, sinon inaccessible.
  if (opts.overLocker) modal.classList.add("kta-readme-over-locker");
  // header / [sidebar | corps scrollable (avec retour en haut)] / footer (crédit Leaflet).
  // 🎓 masqué si hideOnboarding (ouverture depuis un verrou).
  const _docTxt = function(k) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k).replace(/"/g, "&quot;") : k;
  };
  const btnOnboarding = opts.hideOnboarding
    ? ''
    : '<button class="kta-readme-tutorial-btn" id="kta-readme-tutorial-btn" type="button" aria-label="' + _docTxt("docs.tutorielBtn") +
      '" title="🎓 ' + _docTxt("docs.tutorielBtn") + '">🎓</button>';
  // Une langue par fichier réellement disponible (DOC_AVAILABLE_LANGS), méta de I18n.available().
  const _docCurrentLang = _getReadmeLang();
  const _docLangMeta = (window.I18n && window.I18n.available) ? window.I18n.available() : [
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "en", label: "English",  flag: "🇬🇧" }
  ];
  // Menu déroulant (un seul contrôle quel que soit le nombre de langues) ; la place libérée accueille 🤖.
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
        <span class="kta-readme-modal-titre">Documentation${opts.titreGuide ? " · " + window.ktaEsc(opts.titreGuide) : ""}</span>
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

  // Sommaire : préférence mémorisée, sinon visible sur écran ≥ 1100 px.
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
      // toc-hidden true = sommaire CACHÉ.
      const isVisibleNow = !nowVisible;
      toggleBtn.classList.toggle("active", isVisibleNow);
      try { localStorage.setItem("kta_readme_toc_visible", isVisibleNow ? "true" : "false"); } catch(e) {}
    });
  }

  document.getElementById("kta-readme-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });

  // 🎓 ouvre le tutoriel PAR-DESSUS la doc (z-index plus élevé) : on la retrouve à la fermeture.
  const _readmeTutorialBtn = document.getElementById("kta-readme-tutorial-btn");
  if (_readmeTutorialBtn) {
    _readmeTutorialBtn.addEventListener("click", function() {
      if (window.Tutorial && typeof window.Tutorial.ouvrir === "function") {
        window.Tutorial.ouvrir();
      }
    });
  }

  // 🤖 Aide IA par-dessus la doc ; devant un verrou, elle hérite du z-index relevé.
  const _readmeAiiaBtn = document.getElementById("kta-readme-aiia-btn");
  if (_readmeAiiaBtn) {
    _readmeAiiaBtn.addEventListener("click", function() {
      window.afficherModaleAideIA();
      const ia = document.getElementById("kta-aide-ia-modal");
      if (ia && modal.classList.contains("kta-readme-over-locker")) ia.classList.add("kta-readme-over-locker");
    });
  }

  // Autre langue → persiste et reconstruit la modale. Portée LOCALE à la doc.
  const _readmeLangSel = document.getElementById("kta-readme-lang-select");
  if (_readmeLangSel) {
    _readmeLangSel.addEventListener("change", function() {
      const target = _readmeLangSel.value;
      if (DOC_AVAILABLE_LANGS.indexOf(target) < 0) return;
      if (target === _getReadmeLang()) return; // déjà la langue courante
      _setReadmeLang(target);
      // Opts relues dans le DOM courant (classe overLocker, présence du 🎓).
      const wasOverLocker  = modal.classList.contains("kta-readme-over-locker");
      const wasHideOnboard = !document.getElementById("kta-readme-tutorial-btn");
      modal.remove();
      afficherReadme({
        overLocker:     wasOverLocker,
        hideOnboarding: wasHideOnboard,
        guide:          modal.dataset.guide
      });
    });
  }
}

// ── Aide contextuelle ──────────
// Toute modale qui a une section d'aide porte un ❓ dans sa ligne de titre, qui ouvre CETTE section. Le
// lien vit dans UNE table (AIDE_PAR_MODALE), confrontée au code par scripts/check-aide-contextuelle.js.
// Désactivable (⚙️ Configuration de l'accueil → 🎨 Affichage), activée par défaut (décision produit).
// Un MutationObserver pose le bouton à l'ajout de chaque `.kta-readme-modal-header` : la règle reste en UN
// endroit plutôt que dans une vingtaine de modales.

const AIDE_CTX_LS = "myktamap_aide_contextuelle";   // "0" = coupée

// id de modale → slug d'aide. Pas de section dédiée → pas de ❓ (mieux qu'une page à côté du sujet).
// 🩸 Un id qui EXISTE ne prouve pas qu'il désigne le bon sujet : la heatmap est une tuile du menu Tracker
// (le ❓ va sur le menu) ; « kta-profil-modal » est le PROFIL EN LONG d'un trajet, pas le profil de
// l'utilisateur. Seul un humain juge ce lien : table courte et relue, pas d'heuristique.
const AIDE_PAR_MODALE = {
  "kta-cfg-modal":            "parametres",
  "kta-refonte-session-modal": "stats-session",
  "kta-export-modal":         "enregistrer",
  "kta-export-lanceur":       "enregistrer",
  "kta-session-export-modal": "enregistrer",
  "kta-pdf-modal":            "enregistrer",
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
  "kta-jct-modal":            "multi-niveau",
  "kta-depannage-modal":      "depannage"
};

function ktaAideContextuelleActive() {
  try { return localStorage.getItem(AIDE_CTX_LS) !== "0"; } catch(e) { return true; }
}

// Ouvre directement une section ; false si le slug est inconnu (l'appelant sait que le lien est mort).
function ktaOuvrirAideSection(slug) {
  // Section d'une rubrique d'extension (prise « aide », slug « ext-… ») : lue à l'ouverture.
  if (typeof slug === "string" && slug.indexOf("ext-") === 0) {
    const ext = (window.KtaExtensions && typeof window.KtaExtensions.aide === "function")
      ? window.KtaExtensions.aide() : null;
    const s = ext && ext.sections.find(function(x) { return x.slug === slug; });
    if (!s) { console.warn("[Aide] section d'extension inconnue :", slug); return false; }
    _aideOuvrirSousModal(s);
    return true;
  }
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
  // Deux familles d'en-tête (modales de contenu, menu Tracker) : ❓ au même endroit, avant la croix.
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
  const croix = head.querySelector(".kta-panneau-close, .kta-readme-modal-close, .kta-tracker-modal-close");
  // 🩸 `querySelector` cherche en PROFONDEUR : la croix est parfois imbriquée dans un conteneur d'actions,
  // et insérer dans `head` lève un NotFoundError — depuis un MutationObserver, donc hors de tout try, et la
  // modale reste sans ❓. On insère dans le parent RÉEL de la croix.
  if (croix && croix.parentNode) croix.parentNode.insertBefore(b, croix);
  else head.appendChild(b);
}

// Réglage changé : on met à jour ce qui est DÉJÀ à l'écran, sinon la case semble ne rien faire.
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

  // Contenu des DICOS : l'Aide suit la langue de l'app, sans sélecteur de langue local (la 📖
  // Documentation garde le sien : elle repose sur des fichiers).

  const aideTitre = window.I18n ? window.I18n.t("aide.ui.titre") : "";

  // HUB de sections (cartes par catégorie + recherche) → sous-modale par section (dicos `aide.sec.*`).
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

  function _closeAll() { _aideFermerSousModal(); _aideRetourHub(modal); modal.remove(); }
  document.getElementById("kta-aide-close").addEventListener("click", _closeAll);
  modal.addEventListener("click", function (e) { if (e.target === modal) _closeAll(); });

  _aideRendreHub(document.getElementById("kta-aide-corps"));
}

// ── Hub d'aide : sections et catégories ──────────
// Rangement par SLUG (des index numériques tenus à la main dérivaient sans que rien ne choque).
// Ajouter une section = 1 entrée dans AIDE_SECTIONS + 1 slug dans une catégorie + les clés
// `aide.sec.<slug>.*` dans les 3 dicos. Une section non rangée retombe dans « Autres » (filet) et
// scripts/check-aide-sections.js refuse le commit.
// AIDE_SECTIONS = ORDRE CANONIQUE (ordre du filet, source des clés). 🩸 Un slug ne se renomme JAMAIS :
// la clé i18n vivrait dans 3 dicos sous un nom qui ne veut plus rien dire.
const AIDE_SECTIONS = [
  "histoire", "sortie-urgence", "aide-doc-legende", "parametres",
  "recherche", "charger-import", "import-sig", "creer-modifier-plan",
  "bibliotheque-plans", "profil", "favoris", "historique-undo",
  "batterie", "stats-session", "inspecteur-memoire", "legende",
  "menu-tracker", "replay-tracker", "enregistrer", "tracker",
  "mode-secours", "mesure", "edition-points", "structures",
  "traces", "zones", "optimiser-plan", "code-acces",
  "astuces", "depannage", "liaisons-inter-plan", "carnet",
  "vue-osm",
  "heatmap", "vibration",
  "je-suis-perdu", "urgence-xl", "itineraire", "corriger", "multi-niveau"
];

// Catégories dans l'ordre des chapitres du guide. « Pour aller plus loin » reçoit ce qui est désactivé
// par défaut, le Mode Secours et les outils des créateurs de plans.
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

function _aideRow(section, onClick) {
  const r = document.createElement("button");
  r.type = "button";
  r.className = "kta-aide-row";
  const t = document.createElement("span");
  t.className = "kta-aide-row-titre";
  // Section (titre + raccourci) ou simple chaîne (ligne « ⌨️ Raccourcis clavier »).
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

// Section depuis les DICOS. Le corps contient du HTML VOULU (documentation mise en forme, classes CSS) ;
// le titre est du texte.
function _aideSection(slug) {
  const t = window.I18n ? window.I18n.t("aide.sec." + slug + ".titre") : slug;
  const h = window.I18n ? window.I18n.t("aide.sec." + slug + ".html") : "";
  // Raccourci clavier : clé PROPRE et facultative. Jamais dans le titre (posé en textContent, le
  // balisage s'afficherait en clair).
  const r = (window.I18n && window.I18n.has && window.I18n.has("aide.sec." + slug + ".raccourci"))
    ? window.I18n.t("aide.sec." + slug + ".raccourci") : "";
  return { slug: slug, titre: t, raccourci: r, html: h };
}

// Un seul endroit pour poser un titre (hub ET fiche), sinon deux rendus divergent.
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

  const intro = document.createElement("p");
  intro.className = "kta-aide-intro";
  intro.innerHTML = window.I18n ? window.I18n.t("aide.intro") : "";
  corps.appendChild(intro);

  const search = document.createElement("input");
  search.type = "search";
  search.className = "kta-aide-hub-search";
  search.placeholder = window.I18n ? window.I18n.t("aide.ui.search") : "";
  corps.appendChild(search);

  const hub = document.createElement("div");
  hub.className = "kta-aide-hub";
  corps.appendChild(hub);

  // Ligne épinglée : raccourcis clavier (ShortcutsCheatsheet).
  const libCheat = window.I18n ? window.I18n.t("aide.ui.shortcuts") : "";
  const cheatRow = _aideRow(libCheat, function() {
    if (window.ShortcutsCheatsheet && typeof window.ShortcutsCheatsheet.ouvrir === "function") {
      window.ShortcutsCheatsheet.ouvrir();
    }
  });
  cheatRow.dataset.aideTitre = window.ktaDocNormaliser(libCheat);
  hub.appendChild(cheatRow);

  // Rubrique d'une extension (prise « aide ») avant « Pour aller plus loin » ; sans extension,
  // KtaExtensions.aide() rend null.
  function ajouterRubriqueExtension() {
    const ext = (window.KtaExtensions && typeof window.KtaExtensions.aide === "function")
      ? window.KtaExtensions.aide() : null;
    if (!ext) return;
    const ct = document.createElement("div");
    ct.className = "kta-aide-cat-titre";
    ct.textContent = ext.titre;
    hub.appendChild(ct);
    ext.sections.forEach(function(s) {
      const r = _aideRow(s, function() { _aideOuvrirSousModal(s); });
      r.dataset.aideTitre = window.ktaDocNormaliser(s.titre);
      r.dataset.aideTexte = window.ktaDocNormaliser(_aideSansBalises(s.html));
      hub.appendChild(r);
    });
  }

  const used = {};
  AIDE_CATEGORIES.forEach(function(cat) {
    if (cat.cle === "plus-loin") ajouterRubriqueExtension();
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
      // Recherche sur titre + contenu (balises retirées), accents tolérés.
      r.dataset.aideTitre = window.ktaDocNormaliser(s.titre);
      r.dataset.aideTexte = window.ktaDocNormaliser(_aideSansBalises(s.html));
      hub.appendChild(r);
    });
  });

  // Filet : sections non rangées restent ATTEIGNABLES (check-aide-sections.js interdit ce cas au commit).
  const orphans = AIDE_SECTIONS.filter(function(slug) { return !used[slug]; })
                               .map(_aideSection);
  if (orphans.length) {
    const ct = document.createElement("div");
    ct.className = "kta-aide-cat-titre";
    ct.textContent = window.I18n ? window.I18n.t("aide.ui.other") : "";
    hub.appendChild(ct);
    orphans.forEach(function(s) {
      const r = _aideRow(s, function() { _aideOuvrirSousModal(s); });
      // Recherche sur titre + contenu (balises retirées), accents tolérés.
      r.dataset.aideTitre = window.ktaDocNormaliser(s.titre);
      r.dataset.aideTexte = window.ktaDocNormaliser(_aideSansBalises(s.html));
      hub.appendChild(r);
    });
  }

  const empty = document.createElement("div");
  empty.className = "kta-aide-empty";
  empty.style.display = "none";
  empty.textContent = window.I18n ? window.I18n.t("aide.ui.empty") : "";
  corps.appendChild(empty);

  // 🏷️ ancre:hub-filtre-recherche
  // Filtrage par recherche (titre + contenu, accents tolérés).
  search.addEventListener("input", function() {
    const q = window.ktaDocNormaliser(search.value.trim());
    let visibles = 0;
    hub.querySelectorAll(".kta-aide-row").forEach(function(r) {
      const match = !q || (r.dataset.aideTitre || "").indexOf(q) >= 0
                       || (r.dataset.aideTexte || "").indexOf(q) >= 0;
      r.style.display = match ? "" : "none";
      if (match) visibles++;
    });
    // Titres de catégorie sans ligne visible masqués.
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

// Fiche sur téléphone : elle REMPLACE le contenu du hub (un voile, une croix) au lieu de s'empiler dessus.
// ⚠️ « Téléphone » = largeur ≤ 600 px, ou écran tactile de moins de 500 px de haut (téléphone en paysage) :
// c'est la place qui manque pour deux fenêtres, pas le type de pointeur (une tablette garde la sous-fenêtre).
// Relu à chaque ouverture : tourner l'appareil vaut pour la fiche suivante. PC : sous-fenêtre, inchangé.
const AIDE_FICHE_EN_PLACE_MQ = "(max-width: 600px), (max-height: 500px) and (pointer: coarse)";
function _aideFicheEnPlace() {
  try { return !!(window.matchMedia && window.matchMedia(AIDE_FICHE_EN_PLACE_MQ).matches); }
  catch (e) { return false; }
}

// Section reconstruite depuis les dicos (titre + corps) : un seul rendu pour la sous-fenêtre et le hub.
function _aideBlocSection(section) {
  const bloc = document.createElement("div");
  bloc.className = "kta-aide-section";
  const t = document.createElement("div");
  t.className = "kta-aide-section-titre";
  _aidePoserTitre(t, section);
  bloc.appendChild(t);
  const c = document.createElement("div");
  c.innerHTML = section.html || "";
  while (c.firstChild) bloc.appendChild(c.firstChild);
  return bloc;
}

// 🩸 Le hub n'est pas reconstruit : il est masqué (classe sur l'overlay), ce qui garde la recherche tapée et,
// au retour, la position de défilement relevée à l'ouverture de la fiche.
function _aideOuvrirFicheDansHub(modal, section) {
  const corps = modal.querySelector("#kta-aide-corps");
  const head = modal.querySelector(".kta-readme-modal-header");
  if (!corps || !head) return false;
  _aideRetourHub(modal);
  modal.__aideScroll = corps.scrollTop;
  const fiche = document.createElement("div");
  fiche.className = "kta-aide-fiche-vue";
  fiche.appendChild(_aideBlocSection(section));
  corps.appendChild(fiche);
  const back = document.createElement("button");
  back.type = "button";
  back.id = "kta-aide-back";
  back.className = "kta-aide-submodal-back kta-aide-back-hub";
  back.textContent = "← " + (window.I18n ? window.I18n.t("aide.ui.back") : "");
  back.addEventListener("click", function() { _aideRetourHub(modal); });
  head.insertBefore(back, head.firstChild);
  modal.classList.add("kta-aide-en-fiche");
  corps.scrollTop = 0;
  // Échap revient au hub (comme la croix de la sous-fenêtre sur PC) ; l'échappement global fermerait tout.
  modal.__aideEsc = function(e) {
    if (e.key !== "Escape" && e.key !== "Esc") return;
    if (!modal.isConnected) { document.removeEventListener("keydown", modal.__aideEsc, true); return; }
    e.stopPropagation();
    e.preventDefault();
    _aideRetourHub(modal);
  };
  document.addEventListener("keydown", modal.__aideEsc, true);
  try { back.focus({ preventScroll: true }); } catch (e) { /* focus facultatif */ }
  return true;
}

function _aideRetourHub(modal) {
  if (!modal) return;
  if (modal.__aideEsc) { document.removeEventListener("keydown", modal.__aideEsc, true); modal.__aideEsc = null; }
  if (!modal.classList.contains("kta-aide-en-fiche")) return;
  modal.querySelectorAll(".kta-aide-fiche-vue, .kta-aide-back-hub").forEach(function(el) { el.remove(); });
  modal.classList.remove("kta-aide-en-fiche");
  const corps = modal.querySelector("#kta-aide-corps");
  if (corps) corps.scrollTop = modal.__aideScroll || 0;
}

// Sous-modale : UNE section + ← Retour (z-index 100001, au-dessus du hub). Sur téléphone, hub ouvert : la fiche
// prend la place du hub (_aideOuvrirFicheDansHub). Ouverte par le ❓ d'une fenêtre (sans hub) : sous-modale.
function _aideOuvrirSousModal(section) {
  _aideFermerSousModal();
  const hub = document.getElementById("kta-aide-modal");
  if (hub && section && _aideFicheEnPlace() && _aideOuvrirFicheDansHub(hub, section)) return;
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
  const corps = ov.querySelector("#kta-aide-sub-corps");
  if (corps && section) corps.appendChild(_aideBlocSection(section));

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

// ── Contenu de l'Aide : lang/<code>.json ──────────
//   aide.intro · aide.sec.<slug>.titre · aide.sec.<slug>.html (HTML voulu) · aide.cat.<clé> · aide.ui.*
// Ajouter une langue = traduire des clés. Ordre et rangement : AIDE_SECTIONS / AIDE_CATEGORIES.

// ── Aide IA : fichier de contexte téléchargeable ──────────
// Contenu dans le fichier STATIQUE docs/applications/AI_CONTEXT.md ; le JS (_genererContexte) le
// télécharge, filtre par profil, retire les commentaires HTML, remplace {{DATE}}/{{BUILD}}/{{README_USER}}
// et le propose. Enrichir le contexte = éditer ce .md, pas le code.

// Profils : marqueurs `<!-- @@PROFIL usage,diagnostic -->` (valables jusqu'au suivant ; "tous" = commun).
// On garde les blocs du profil + les communs ; profil null/"complet" = tout. But : des fichiers de
// ~60-120 Ko lisibles en entier par les IA (un fichier unique de ~500 Ko était tronqué).
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

// « État de l'installation » (opt-in, décoché par défaut), généré localement pour un diagnostic ciblé.
// 🔒 ANONYME PAR CONSTRUCTION : ni nom de plan, ni point, coordonnée ou photo — caractéristiques techniques.
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
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      const mo = function(n) { return Math.round((n || 0) / 1024 / 1024) + " Mo"; };
      L.push("- Stockage navigateur : " + mo(est.usage) + " utilisés / " + mo(est.quota) + " de quota");
    }
  } catch(e) {}
  // Plans anonymisés (Plan 1..N) : leurs noms sont des lieux sensibles.
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
  try {
    const st = window.KtaSessionStore;
    const ids = st.ids();
    const tot = ids.reduce(function(n, id) { return n + st.taille(id); }, 0);
    L.push("- Sessions sauvegardées : " + ids.length + " (" + Math.round(tot / 1024) + " Ko au total, stockage " + st.mode() + ")");
  } catch(e) {}
  // Dernières erreurs/avertissements du buffer de logs (debug.js).
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

  // Repli minimal si docs/applications/AI_CONTEXT.md est introuvable.
  if (aiContextTemplate && aiContextTemplate.trim().length > 0) {
    let contenu = _filtrerContexteParProfil(aiContextTemplate, profil)
      // Commentaires HTML purgés : l'IA ne reçoit que du contenu utile.
      .replace(/<!--[\s\S]*?-->\n?/g, "")
      .replace(/\{\{DATE\}\}/g, dateExport)
      .replace(/\{\{BUILD\}\}/g, buildVersion)
      // Vieux template en cache SW : le placeholder de la doc intégrale devient un renvoi (pas ~250 Ko).
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


// Les modales d'alerte et de mise à jour vivent dans js/interfaceAlerts.js.


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
          '<div class="kta-aide-section-titre">' + window.I18n.t("aiia.profil.titre") + '</div>' +
          '<div id="kta-aide-ia-profils" style="display:flex; flex-direction:column; gap:6px; font-size:13px; color:var(--kta-texte-2);">' +
            '<label style="display:flex; gap:8px; align-items:baseline; cursor:pointer;"><input type="radio" name="ktaAiiaProfil" value="usage" checked> <span><strong>' + window.I18n.t("aiia.profil.usage") + '</strong> — ' + window.I18n.t("aiia.profil.usage.desc") + '</span></label>' +
            '<label style="display:flex; gap:8px; align-items:baseline; cursor:pointer;"><input type="radio" name="ktaAiiaProfil" value="diagnostic"> <span><strong>' + window.I18n.t("aiia.profil.diagnostic") + '</strong> — ' + window.I18n.t("aiia.profil.diagnostic.desc") + '</span></label>' +
            '<label style="display:flex; gap:8px; align-items:baseline; cursor:pointer;"><input type="radio" name="ktaAiiaProfil" value="plans"> <span><strong>' + window.I18n.t("aiia.profil.plans") + '</strong> — ' + window.I18n.t("aiia.profil.plans.desc") + '</span></label>' +
            '<label style="display:flex; gap:8px; align-items:baseline; cursor:pointer;"><input type="radio" name="ktaAiiaProfil" value="complet"> <span><strong>' + window.I18n.t("aiia.profil.complet") + '</strong> — ' + window.I18n.t("aiia.profil.complet.desc") + '</span></label>' +
          '</div>' +
          '<label style="display:flex; gap:8px; align-items:baseline; cursor:pointer; margin-top:10px; font-size:13px; color:var(--kta-texte-2);">' +
            '<input type="checkbox" id="kta-aide-ia-etat"> <span>' + window.I18n.t("aiia.etat.label") + '</span>' +
          '</label>' +
          '<p style="color:var(--kta-texte-3); line-height:1.5; font-size:11px; margin:4px 0 0 24px;">' + window.I18n.t("aiia.etat.note") + '</p>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">' + window.I18n.t("aiia.privacy.titre") + '</div>' +
          '<p style="color:var(--kta-texte-2); line-height:1.6; font-size:13px;">' +
            window.I18n.t("aiia.privacy.body") +
          '</p>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">' + window.I18n.t("aiia.prompt.titre") + '</div>' +
          '<p style="color:var(--kta-texte-2); line-height:1.6; font-size:12px; margin:0 0 8px 0;">' +
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
          '<p style="color:var(--kta-texte-2); line-height:1.6; font-size:13px;">' +
            window.I18n.t("aiia.note.body") +
          '</p>' +
        '</div>' +

        '<div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-aide-ia-cancel"   type="button" style="flex:1; min-width:90px;">' + window.I18n.t("aiia.btn.cancel") + '</button>' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-aide-ia-copyctx"  type="button" style="flex:2; min-width:150px;">' + window.I18n.t("aiia.btn.copyCtx") + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-aide-ia-download" type="button" style="flex:2; min-width:150px;">' + window.I18n.t("aiia.btn.download") + '</button>' +
        '</div>' +
        '<div id="kta-aide-ia-status" style="margin-top:10px; font-size:12px; color:var(--kta-texte-3); min-height:18px; text-align:center;"></div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _fermer() { modal.remove(); }

  document.getElementById("kta-aide-ia-close").addEventListener("click", _fermer);
  document.getElementById("kta-aide-ia-cancel").addEventListener("click", _fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });

  document.getElementById("kta-aide-ia-copy").addEventListener("click", async function() {
    const btn = this;
    const ta = document.getElementById("kta-aide-ia-prompt");
    const originalText = btn.textContent;
    try {
      // utils.js : clipboard puis repli execCommand (HTTP local).
      if (!(await window.ktaCopierTexte(ta.value))) throw new Error("clipboard + execCommand KO");
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

  // Template seul (la doc intégrale n'est plus injectée), filtré par profil, + bloc état opt-in.
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

    setTimeout(_fermer, 1500);
  });

  // Copier le contexte (sur mobile, coller dans un chat est plus simple que joindre un .md).
  document.getElementById("kta-aide-ia-copyctx").addEventListener("click", async function() {
    const btn = this;
    const statusEl = document.getElementById("kta-aide-ia-status");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = window.I18n.t("aiia.dl.generating");
    try {
      const res = await _genererContexte(statusEl);
      // writeText peut lever même en contexte sécurisé (document sans focus) : repli execCommand.
      if (!(await window.ktaCopierTexte(res.contenu))) throw new Error("clipboard + execCommand KO");
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

// ── Exports window (afficherModaleAideIA est posée dans sa propre déclaration) ──────────
window.afficherReadme = afficherReadme;
window.afficherAide   = afficherAide;
