/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// poiDanger.js — POI « danger » : date de constat et mention de non-certification
// =====================================================================
// Modèle : `dateConstat` = "AAAA-MM-JJ" (jour local où le danger a été vu), facultatif. Pré-rempli au jour même
// quand un point DEVIENT danger (création, ou changement de tag), modifiable, vide = inconnue (champ retiré). Un
// point danger existant sans date reste sans date : rien n'est inventé.
// ⚠️ Le point du mode « perdu » (lostMode.js, `source: "lostMode"`, ou id « lost_… » d'avant ce marqueur) porte
// le tag danger pour son icône : position incertaine, pas un danger constaté → ni bloc, ni date, ni mention.
// ⚠️ Fiche de tout POI danger (session ou calque) : la date, puis la mention « MyKTAMap ne certifie pas l'état
// d'un site » — un danger relevé n'est qu'un constat daté (décision produit).
// Exports : GeoJSON (propriété `dateConstat`), KMZ (`mkm:dateConstat`), GPX (`constat=` dans <cmt>), relus par
// les imports KMZ / GPX. Jamais dans l'export anonymisé (liste blanche de sessionExporter.js > _anonymiserSession).
// Expose window.KtaPoiDanger : TAGS_DANGER, estDanger, dateValide, dateConstat, jourLocal, formaterDate,
//   htmlFormulaire, brancherFormulaire, appliquer, htmlFiche.
// Doc : docs/architecture/data-formats.md (format point).

(function () {
  "use strict";

  const TAGS_DANGER = ["danger"];

  function _t(cle, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(cle, p) : cle;
  }
  function _esc(s) { return window.ktaEsc(s); }

  function _tag(pointOuTag) {
    if (typeof pointOuTag === "string") return pointOuTag;
    const p = pointOuTag;
    return (p && Array.isArray(p.tags) && p.tags.length) ? String(p.tags[0]) : "";
  }
  function _pointPerdu(p) {
    return !!p && typeof p === "object" && (p.source === "lostMode" || /^lost_d+$/.test(String(p.id || "")));
  }
  function estDanger(pointOuTag) { return !_pointPerdu(pointOuTag) && TAGS_DANGER.indexOf(_tag(pointOuTag)) >= 0; }

  // "AAAA-MM-JJ" d'un jour qui existe (le 31/02 est refusé) → la chaîne ; sinon null.
  function dateValide(s) {
    if (typeof s !== "string") return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const a = +m[1], mo = +m[2], j = +m[3];
    if (a < 1900 || a > 2200) return null;
    const d = new Date(a, mo - 1, j);
    if (d.getFullYear() !== a || d.getMonth() !== mo - 1 || d.getDate() !== j) return null;
    return m[1] + "-" + m[2] + "-" + m[3];
  }
  function dateConstat(point) { return point ? dateValide(point.dateConstat) : null; }

  // 🩸 Jour LOCAL (toISOString donnerait la veille ou le lendemain près de minuit hors UTC).
  function jourLocal(d) {
    const x = d || new Date();
    const p = function (n) { return (n < 10 ? "0" : "") + n; };
    return x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate());
  }

  function formaterDate(s) {
    const v = dateValide(s);
    if (!v) return "";
    const d = new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10));
    const loc = window.ktaLocale ? window.ktaLocale() : "fr-FR";
    return d.toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric" });
  }

  // ── Formulaire du POI (editor.js > afficherFormulaire) ──────────
  // Masqué tant que le tag n'est pas un danger. Valeur de départ : la date du point, sinon le jour même — sauf
  // pour un point DÉJÀ danger sans date (on n'invente pas un constat).
  function htmlFormulaire(tag, point) {
    if (_pointPerdu(point)) return "";
    const cache = estDanger(tag) ? "" : " hidden";
    const deja = point && estDanger(point);
    const valeur = dateConstat(point) || (deja ? "" : jourLocal());
    return '<div class="kta-poi-danger" id="kta-poi-danger"' + cache + '>' +
             '<label class="kta-cfg-label" for="kta-poi-constat">' + _esc(_t("poiDanger.constat.label")) + '</label>' +
             '<input class="kta-cfg-input" id="kta-poi-constat" type="date" value="' + _esc(valeur) + '"' +
               ' max="' + jourLocal() + '">' +
             '<p class="kta-poi-danger-aide">' + _esc(_t("poiDanger.constat.aide")) + '</p>' +
             '<p class="kta-poi-danger-mention">' + _esc(_t("poiDanger.mention")) + '</p>' +
           '</div>';
  }

  // `ctx` = { tag(): string } → { rafraichir(), lire() : { applicable, dateConstat } }.
  function brancherFormulaire(modal, ctx) {
    const bloc = modal.querySelector("#kta-poi-danger");
    if (!bloc) return { rafraichir: function () {}, lire: function () { return { applicable: false }; } };
    const champ = bloc.querySelector("#kta-poi-constat");
    function rafraichir() {
      if (estDanger(ctx.tag())) bloc.removeAttribute("hidden"); else bloc.setAttribute("hidden", "");
    }
    rafraichir();
    return {
      rafraichir: rafraichir,
      lire: function () {
        if (!estDanger(ctx.tag())) return { applicable: true, dateConstat: null };
        return { applicable: true, dateConstat: dateValide(champ ? champ.value : "") };
      }
    };
  }

  // Écrit le résultat sur le point (mutation en place) ; true si quelque chose a changé. Tag qui n'est plus un
  // danger, ou date vidée : le champ part.
  function appliquer(point, lu) {
    if (!point || !lu || !lu.applicable) return false;
    const avant = point.dateConstat;
    if (lu.dateConstat) point.dateConstat = lu.dateConstat;
    else delete point.dateConstat;
    return point.dateConstat !== avant;
  }

  // ── Fiche (popup, utils.js > buildPointPopupHtml) ──────────
  function htmlFiche(point) {
    if (!estDanger(point)) return "";
    const d = dateConstat(point);
    const ligne = d
      ? '<span class="kta-popup-danger-date">' +
          _esc(_t("poiDanger.fiche.constate", { date: formaterDate(d) })) + '</span>'
      : '<span class="kta-tx-muted">' + _esc(_t("poiDanger.fiche.sansDate")) + '</span>';
    return '<div class="kta-popup-danger">' + ligne +
             '<span class="kta-popup-danger-mention">' + _esc(_t("poiDanger.mention")) + '</span>' +
           '</div>';
  }

  window.KtaPoiDanger = {
    TAGS_DANGER: TAGS_DANGER.slice(),
    estDanger: estDanger,
    dateValide: dateValide,
    dateConstat: dateConstat,
    jourLocal: jourLocal,
    formaterDate: formaterDate,
    htmlFormulaire: htmlFormulaire,
    brancherFormulaire: brancherFormulaire,
    appliquer: appliquer,
    htmlFiche: htmlFiche
  };
})();
