/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// mdParser.js
// Parser Markdown inline minimaliste, XSS-safe, sans dépendance externe.

// =========================
// MD PARSER — sous-ensemble Markdown minimal, XSS-safe (note libre du Mode Histoire)
// =========================
// Supporté : # / ## / ### · **gras** · *italique* / _italique_ · `code` · [texte](url) · listes « - » / « * » /
// « 1. » · « > » citation · ligne vide = paragraphe. NON supporté (choix) : tables, notes, HTML brut (échappé),
// images (PWA hors ligne), blocs ``` .
// 🔒 1. HTML d'entrée échappé ENTIÈREMENT avant toute transformation ; 2. les motifs MD opèrent sur le texte
// échappé (sortie sûre par construction) ; 3. URLs des liens sur liste blanche (http/https/mailto/tel,
// relatifs / et #), le reste → « # ».
// Expose : window.kta_renderMd(text) → html, window.kta_escapeHtml(text) → html.
// =========================

(function() {
  "use strict";

  // Échappeur unique (window.ktaEsc).
  function escapeHtml(s) { return window.ktaEsc(s); }   // échappeur unique (js/langManager.js)

  // 🔒 Liste blanche des schémas : javascript:, data:, file:… refusés (vecteurs XSS classiques).
  function safeUrl(url) {
    if (!url) return "#";
    const trimmed = String(url).trim();
    if (/^https?:\/\//i.test(trimmed))    return trimmed;
    if (/^mailto:/i.test(trimmed))        return trimmed;
    if (/^tel:/i.test(trimmed))           return trimmed;
    // Liens internes relatifs (/ ou #).
    if (/^[/#]/.test(trimmed))            return trimmed;
    return "#";
  }

  // ── Motifs en ligne (après l'échappement global) ──
  // ⚠️ Ordre : code (en premier, sinon ** dedans serait pris) → gras → italique (APRÈS le gras) → liens.
  // Classes de caractères restrictives : pas de correspondance gourmande d'un jeton à l'autre.
  function _renderInline(line) {
    // 1. Code : placeholder, pour que gras/italique ne mangent pas son contenu.
    const codeStubs = [];
    line = line.replace(/`([^`]+)`/g, function(_, code) {
      codeStubs.push(code);
      return "CODE" + (codeStubs.length - 1) + "";
    });

    // 2. Gras, non gourmand, sans saut de ligne.
    line = line.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");

    // 3. Italique, non gourmand (* exclu pour ne pas manger un ** restant).
    line = line.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
    line = line.replace(/_([^_\n]+?)_/g,  "<em>$1</em>");

    // 4. Liens : url par safeUrl.
    line = line.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, function(_, txt, url) {
      const safe = safeUrl(url);
      return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + txt + '</a>';
    });

    // 5. Placeholders de code restaurés.
    line = line.replace(/CODE(\d+)/g, function(_, i) {
      return "<code>" + codeStubs[parseInt(i, 10)] + "</code>";
    });

    return line;
  }

  // ── Blocs ──
  // Ligne par ligne : titre = bloc d'une ligne ; listes et citations consécutives groupées (<ul>/<ol>,
  // <blockquote>).
  function render(text) {
    if (text == null) return "";
    const escaped = escapeHtml(text);
    // 2. Lignes (CRLF et LF)
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

      // Ligne vide : séparateur de paragraphes.
      if (line === "") {
        i++;
        continue;
      }

      // Titres (espace requis après les #).
      let m = line.match(/^(#{1,3})\s+(.+)$/);
      if (m) {
        const level = m[1].length;
        out.push("<h" + level + ">" + _renderInline(m[2]) + "</h" + level + ">");
        i++;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const qLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          qLines.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        flushQuote(qLines);
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s+/, ""));
          i++;
        }
        flushList(items, false);
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, ""));
          i++;
        }
        flushList(items, true);
        continue;
      }

      // Paragraphe : lignes consécutives non vides et non spéciales.
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

  // ── Export ──
  window.kta_renderMd   = render;
  window.kta_escapeHtml = escapeHtml;

  console.log("[mdParser] Module chargé (v1.34.30 — parser MD inline minimaliste XSS-safe)");
})();
