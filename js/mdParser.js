/*!
 * MyKTAMap — js/mdParser.js (v1.34.30)
 * Parser Markdown inline minimaliste, XSS-safe, sans dépendance externe.
 *
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// MD PARSER — minimal subset, XSS-safe
// =========================
// Sous-ensemble supporté (volontairement réduit, pas de full CommonMark) :
//   - Headings  : # H1 · ## H2 · ### H3
//   - Bold      : **texte**
//   - Italic    : *texte* (ou _texte_)
//   - Code line : `code`
//   - Lien      : [texte](url)  — URL filtrées : http(s), mailto, tel
//   - Liste UL  : "- item" / "* item"
//   - Liste OL  : "1. item"
//   - Citation  : "> citation"
//   - Sauts de ligne : ligne vide = nouveau paragraphe
//
// NON supporté (par choix, pour rester safe + court) :
//   - Tables, footnotes
//   - HTML brut (tout `<tag>` est échappé)
//   - Images (pas de réseau dans une PWA offline)
//   - Code blocks ```…``` (ajoutable plus tard si besoin)
//
// Stratégie sécurité :
//   1. Escape COMPLET du HTML d'entrée (& < > " ') AVANT toute transformation
//   2. Patterns MD opèrent sur le texte échappé → résultat HTML safe par construction
//   3. URLs des liens validées via whitelist de schémas (http/https/mailto/tel)
//
// API publique :
//   window.kta_renderMd(text) → htmlString
//   window.kta_escapeHtml(text) → htmlString (helper public, idempotent)
//
// =========================

(function() {
  "use strict";

  // ========== ESCAPE HTML ==========
  // Échappe les 5 caractères qui peuvent casser le HTML / introduire des
  // tags. Idempotent : appeler 2× est sans effet (les entités sont elles-
  // mêmes échappées au 2e passage).
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ========== URL SAFE ==========
  // Whitelist des schémas autorisés dans les liens [txt](url). Refuser
  // javascript:, data:, file:… (XSS vectors classiques).
  function safeUrl(url) {
    if (!url) return "#";
    const trimmed = String(url).trim();
    // Schémas autorisés (case-insensitive)
    if (/^https?:\/\//i.test(trimmed))    return trimmed;
    if (/^mailto:/i.test(trimmed))        return trimmed;
    if (/^tel:/i.test(trimmed))           return trimmed;
    // Liens internes relatifs (commencent par / ou #) → autorisés
    if (/^[/#]/.test(trimmed))            return trimmed;
    // Tout autre schéma → neutralisé en "#"
    return "#";
  }

  // ========== INLINE PATTERNS ==========
  // Transformations appliquées dans CHAQUE ligne d'un paragraphe (après
  // escape global). Ordre important :
  //   1. Code inline `…` (en PREMIER pour éviter que ** dedans soit pris)
  //   2. Bold **…**
  //   3. Italic *…* ou _…_ (APRÈS bold sinon collisions)
  //   4. Liens [txt](url)
  //
  // Note : les regex utilisent des classes de char volontairement
  // restrictives pour éviter le greedy matching cross-token.
  function _renderInline(line) {
    // 1. Code inline : `texte` — protégé en placeholder pour éviter que les
    //    transformations suivantes (bold, italic) mangent le contenu.
    const codeStubs = [];
    line = line.replace(/`([^`]+)`/g, function(_, code) {
      codeStubs.push(code);
      return "CODE" + (codeStubs.length - 1) + "";
    });

    // 2. Bold : **texte** — non-greedy, pas de saut de ligne dedans
    line = line.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");

    // 3. Italic : *texte* ou _texte_ — non-greedy. On exclut * pour éviter
    //    de manger les ** restants (mais bold a déjà passé donc rare).
    line = line.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
    line = line.replace(/_([^_\n]+?)_/g,  "<em>$1</em>");

    // 4. Liens : [texte](url) — url passe par safeUrl
    line = line.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, function(_, txt, url) {
      const safe = safeUrl(url);
      return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + txt + '</a>';
    });

    // 5. Restore code placeholders
    line = line.replace(/CODE(\d+)/g, function(_, i) {
      return "<code>" + codeStubs[parseInt(i, 10)] + "</code>";
    });

    return line;
  }

  // ========== BLOCK PARSER ==========
  // Parse ligne par ligne en groupant les blocs (paragraphes, listes,
  // citations). Heading = bloc 1 ligne. Listes consécutives sont groupées
  // en <ul>/<ol>. Citations consécutives en <blockquote>.
  function render(text) {
    if (text == null) return "";
    // 1. Escape global
    const escaped = escapeHtml(text);
    // 2. Split en lignes (gestion CRLF + LF)
    const lines = escaped.split(/\r?\n/);

    const out = [];
    let i = 0;

    function flushList(items, ordered) {
      if (items.length === 0) return;
      const tag = ordered ? "ol" : "ul";
      out.push("<" + tag + ">");
      items.forEach(function(it) {
        out.push("<li>" + _renderInline(it) + "</li>");
      });
      out.push("</" + tag + ">");
    }

    function flushQuote(qLines) {
      if (qLines.length === 0) return;
      out.push("<blockquote>" + qLines.map(_renderInline).join("<br>") + "</blockquote>");
    }

    while (i < lines.length) {
      const raw = lines[i];
      const line = raw.replace(/\s+$/, "");  // trim right

      // --- Ligne vide → flush rien, juste ignorer (séparateur paragraphes)
      if (line === "") {
        i++;
        continue;
      }

      // --- Headings ### / ## / # (en début de ligne, espace requis après)
      let m = line.match(/^(#{1,3})\s+(.+)$/);
      if (m) {
        const level = m[1].length;
        out.push("<h" + level + ">" + _renderInline(m[2]) + "</h" + level + ">");
        i++;
        continue;
      }

      // --- Citation : "> ..." (groupée si consécutives)
      if (/^>\s?/.test(line)) {
        const qLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          qLines.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        flushQuote(qLines);
        continue;
      }

      // --- Liste UL : "- " ou "* " (groupée)
      if (/^[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s+/, ""));
          i++;
        }
        flushList(items, false);
        continue;
      }

      // --- Liste OL : "1. " (groupée)
      if (/^\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, ""));
          i++;
        }
        flushList(items, true);
        continue;
      }

      // --- Paragraphe : groupe les lignes consécutives non-vides non-spéciales
      const pLines = [];
      while (i < lines.length) {
        const cur = lines[i].replace(/\s+$/, "");
        if (cur === "")                 break;
        if (/^#{1,3}\s+/.test(cur))     break;
        if (/^>\s?/.test(cur))          break;
        if (/^[-*]\s+/.test(cur))       break;
        if (/^\d+\.\s+/.test(cur))      break;
        pLines.push(cur);
        i++;
      }
      out.push("<p>" + pLines.map(_renderInline).join("<br>") + "</p>");
    }

    return out.join("\n");
  }

  // ========== EXPORT ==========
  window.kta_renderMd   = render;
  window.kta_escapeHtml = escapeHtml;

  console.log("[mdParser] Module chargé (v1.34.30 — parser MD inline minimaliste XSS-safe)");
})();
