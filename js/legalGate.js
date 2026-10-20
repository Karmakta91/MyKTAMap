/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// legalGate.js — Gate « Conditions d'utilisation & avertissement légal »

// =========================
// LEGALGATE.JS — conditions d'utilisation + avertissement légal
// =========================
// Gate BLOQUANTE au premier lancement (case + « J'accepte ») : MyKTAMap est un outil de repérage, pas une
// incitation à pénétrer dans des lieux interdits (accès aux anciennes carrières de Paris prohibé par l'arrêté
// préfectoral du 2 novembre 1955 ; l'intrusion engage la seule responsabilité de l'utilisateur).
// Séquencée par js/firstRunFlow.js (étape « légal », après une alerte critique éventuelle, avant
// l'onboarding) ; relisible à tout moment (pied de page, Documentation) par ouvrirConsultation().
// ⚠️ Cadrage général traduit (clés legal.*) ; TEXTES DE LOI en FR verbatim (constantes ci-dessous, reflétées
// dans docs/applications/CGU.md).
// Expose window.LegalGate : isAccepted(), ouvrirGate() → Promise (résout à l'acceptation),
//   ouvrirConsultation(), TERMS_VERSION. 100 % local, aucune surface réseau.
// =========================

(function() {
  "use strict";

  // ⚠️ Bumper à chaque changement de fond des CGU : force un re-consentement (on stocke la version acceptée).
  const TERMS_VERSION = 1;
  const LS_KEY = "myktamap_terms_accepted_v1";

  const GATE_ID = "kta-legal-gate-overlay";
  const FULL_ID = "kta-legal-full-overlay";

  // ── Textes de loi — FR verbatim (actes officiels, hors droit d'auteur : CPI art. L.122-5 2°) ──
  // ⚠️ NE PAS traduire, NE PAS reformuler.
  // Arrêté préfectoral du 2 novembre 1955 (Préfecture de la Seine / Police) : absent de Légifrance, reproduit
  // d'après la source de référence, cité par le Sénat comme « arrêté préfectoral du 2 novembre 1955 ».
  const ARRETE_1955 = [
    { art: "Article 1er",
      txt: "Il est interdit à toute personne non munie d'une autorisation émanant de l'Inspection Générale des Carrières de la Seine d'ouvrir les portes et trappes d'accès aux escaliers et puits à échelons ou autres des anciennes carrières, de descendre dans ces ouvrages, de pénétrer et de circuler dans les vides des anciennes carrières s'étendant sous l'emprise des voies publiques de la Ville de Paris." },
    { art: "Article 2",
      txt: "Les contraventions au présent arrêté seront constatées par procès-verbal des commissaires de police et autres officiers de police judiciaire et des agents de l'Inspection Générale des Carrières ayant qualité pour verbaliser. Elles seront déférées aux tribunaux compétents." },
    { art: "Article 3",
      txt: "Le Directeur de la Police Municipale et l'Ingénieur Général des Mines, Inspecteur Général des carrières de la Seine sont chargés de l'exécution du présent arrêté qui sera inséré au recueil des Actes Administratifs et affiché dans Paris." }
  ];
  const ARRETE_1955_SIGN = "Fait à Paris le 2 novembre 1955. — Le Préfet de Police.";
  const ARRETE_1955_SRC  = "Arrêté préfectoral du 2 novembre 1955 (Préfecture de la Seine / Préfecture de Police). Acte administratif — texte public. Reproduit d'après la source de référence cataphile ; référence officielle citée par le Sénat (réponse au JO du 05/06/2025).";

  // Question écrite Sénat n° 03710 — texte officiel intégral (JO Sénat).
  const SENAT_META = {
    intitule: "Dangers liés aux explorations illicites dans les catacombes de Paris",
    num:      "Question écrite n° 03710 — 17e législature",
    auteur:   "Mme Catherine DUMAS (Paris — Les Républicains)",
    ministre: "M. le ministre d'État, ministre de l'intérieur",
    qDate:    "Question publiée au JO Sénat du 13/03/2025 (page 1080)",
    rDate:    "Réponse du Ministère de l'intérieur publiée au JO Sénat du 05/06/2025 (page 3180)",
    src:      "Source officielle : senat.fr — base des questions, qSEQ250303710. Débats parlementaires — texte public."
  };
  const SENAT_QUESTION = [
    "Mme Catherine Dumas attire l'attention de M. le ministre d'État, ministre de l'intérieur sur les dangers liés aux explorations illicites dans les catacombes de Paris.",
    "Elle note que l'accès aux catacombes est interdit depuis un arrêté préfectoral du 2 novembre 1955, pourtant de nombreux explorateurs continuent de s'y aventurer clandestinement, malgré les risques encourus. Ces explorations illégales, pratiquées par des « cataphiles », sont non seulement dangereuses mais également illégales, exposant les contrevenants à des amendes.",
    "Elle précise que ces incursions illégales posent des problèmes de sécurité publique. En 2017, deux adolescents se sont perdus pendant trois jours dans les catacombes, nécessitant une mobilisation très importante des services de secours, notamment le groupe de recherche et d'intervention en milieu périlleux (GRIMP) et la brigade des sapeurs-pompiers de Paris (BSPP).",
    "Elle constate que malgré les interdictions et les dangers connus, les explorations clandestines persistent, mettant en péril la sécurité des individus et la préservation du patrimoine souterrain de la ville. Les autorités compétentes, notamment l'Inspection générale des carrières et la brigade spécialisée de la police nationale, peinent à endiguer ce phénomène, malgré des patrouilles régulières et des actions de fermeture des accès illégaux.",
    "Elle souhaite par conséquent lui demander ce que le Gouvernement entend mettre en œuvre pour renforcer la sécurité et la protection des catacombes, prévenir les explorations illégales et préserver ce patrimoine historique unique."
  ];
  const SENAT_REPONSE = [
    "Les catacombes de Paris forment, en sous-sol de la capitale, un dédale de 280 km de galeries. Leur accès est formellement interdit par un arrêté préfectoral du 2 novembre 1955, notamment en raison de la dangerosité des lieux (risques d'égarement, d'éboulement, de chute dans des puits). Au sein de la direction de l'ordre public et de la circulation (DOPC) de la préfecture de police, le groupe d'intervention et de protection (GIP), composé de la brigade de protection et de la brigade d'intervention, est chargé de la sécurisation des carrières. Sa mission consiste en premier lieu à rechercher, reconduire en surface et verbaliser les individus se trouvant illégalement dans les carrières de Paris. Elle consiste également à mettre en place un plan de recherche par secteur en cas de signalement de personnes disparues.",
    "La brigade de protection effectue des patrouilles quasi-quotidiennes sur des vacations de journée (entre 8 heures et 20 heures) pour assurer la formation interne, procéder aux vérifications techniques et à la sécurisation générale du réseau. À cette occasion, elle est en relation avec l'inspection générale des carrières (IGC), service dépendant de la mairie de Paris. Elle est sa principale interlocutrice pour lui signaler des plaques d'accès dessoudées ou le creusement de passages appelés « chatières ». L'IGC procède en réponse au scellement de plaques d'accès et à l'injection de béton dans les galeries. La brigade de protection organise également mensuellement des missions de sécurisation en soirée et de nuit pour contrôler la fréquentation du réseau et reconduire en surface les cataphiles. La nuit (entre 21 heures et 6 heures) et les week-ends, la brigade d'intervention est déployée pour secourir des personnes égarées.",
    "En 2024, 342 contraventions ont été rédigées pour non-respect des dispositions de l'arrêté précité de 1955. 13 individus ont également été mis à disposition de l'autorité judiciaire (violation d'un terrain militaire sous le Val de Grâce, infractions à la législation sur les stupéfiants et port d'arme prohibé). Pour prendre en compte et évacuer les blessés, les militaires du groupe de recherche et d'intervention en milieu périlleux (GRIMP) de la brigade de sapeurs-pompiers de Paris sont compétents pour intervenir dans les carrières du sous-sol de la capitale. Entre 2020 et 2023, ces lieux ont généré 17 interventions des sapeurs-pompiers, permettant de porter assistance à 104 victimes. Ce sont des opérations souvent longues (3h en moyenne) qui mobilisent près d'une quinzaine de militaires et 4 véhicules de secours. Deux opérations conjointes de secours ont été réalisées par le GIP et le GRIMP en 2024 pour des personnes en difficulté.",
    "Au regard du linéaire à couvrir en sécurisation, le dispositif actuel paraît correctement dimensionné. Toutefois, l'apparition cyclique de nouvelles brèches engendre ponctuellement une hausse de fréquentation des sous-sols parisiens. Une fois les accès détectés et refermés, le nombre de visiteurs diminue fortement. Aussi, des mesures sont prises régulièrement pour réduire le nombre d'accès aux carrières, notamment avec le renforcement des dispositifs de verrouillage des puits, le scellement des plaques d'accès et la présence policière. Une faiblesse du dispositif actuel réside dans la porosité entre le réseau des carrières et des galeries techniques. Les opérateurs de réseaux peuvent se montrer réticents à supporter le coût financier des opérations de « rebouchage » des chatières. Enfin, depuis novembre 2024, l'arsenal de répression a évolué vers une verbalisation à l'aide d'un procès verbal électronique qui facilite la rédaction et le suivi du relevé d'infraction. Les infractions à l'arrêté préfectoral du 2 novembre 1955 sont ainsi passibles d'une amende forfaitaire d'un montant de 135 euros avec une majoration à 375 euros."
  ];

  // Intrusion en lieu privé — art. 226-4 du Code pénal (en vigueur depuis le 29/07/2023, loi n° 2023-668).
  // Source : Légifrance.
  const CODE_PENAL_226_4 = [
    "L'introduction dans le domicile d'autrui à l'aide de manœuvres, menaces, voies de fait ou contrainte, hors les cas où la loi le permet, est puni de trois ans d'emprisonnement et de 45 000 euros d'amende.",
    "Le maintien dans le domicile d'autrui à la suite de l'introduction mentionnée au premier alinéa, hors les cas où la loi le permet, est puni des mêmes peines.",
    "Constitue notamment le domicile d'une personne, au sens du présent article, tout local d'habitation contenant des biens meubles lui appartenant, que cette personne y habite ou non et qu'il s'agisse de sa résidence principale ou non."
  ];
  const CODE_PENAL_226_4_SRC = "Article 226-4 du Code pénal (version en vigueur depuis le 29 juillet 2023, modifié par la loi n° 2023-668 du 27 juillet 2023). Source : Légifrance.";
  const PROPRIETE_PRIVEE = "Le droit de propriété est exclusif (article 544 du Code civil) : nul ne peut pénétrer ni se maintenir sur une propriété privée sans l'autorisation de son propriétaire. Une telle intrusion engage la responsabilité civile de son auteur et, selon les circonstances (violation de domicile, dégradations, franchissement de clôture, non-respect d'un arrêté), sa responsabilité pénale.";

  // Responsabilité pour faute — Code civil art. 1240 et 1241 (en vigueur depuis le 01/10/2016, ord. n° 2016-131).
  const RESP_CIVILE = [
    "Article 1240 — Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer.",
    "Article 1241 — Chacun est responsable du dommage qu'il a causé non seulement par son fait, mais encore par sa négligence ou par son imprudence."
  ];
  // Secours : en principe gratuits (dépense obligatoire de la commune), mais la faute peut coûter cher et les
  // secours de loisir peuvent être facturés. Sources : CGCT art. L.2321-2 et L.2331-4.
  const SECOURS = [
    "Concrètement : si votre présence dans un lieu interdit ou dangereux déclenche une opération de secours (égarement, blessure, mise en danger des sauveteurs), vous vous exposez à devoir en répondre. En France, les secours sont en principe gratuits (dépense obligatoire des communes, article L.2321-2 du Code général des collectivités territoriales), mais une commune peut, par délibération et après information du public, exiger le remboursement de tout ou partie des frais de secours consécutifs à une activité sportive ou de loisir (article L.2331-4 du même code).",
    "Surtout, sur le fondement des articles 1240 et 1241 du Code civil, quiconque cause un dommage par sa faute — imprudence, négligence, intrusion illicite — est tenu de le réparer : cela peut couvrir les dégradations commises, le préjudice causé aux tiers, et les conséquences d'une intervention rendue nécessaire par votre comportement."
  ];
  const RESP_SRC = "Sources : articles 1240 et 1241 du Code civil (Légifrance) ; articles L.2321-2 et L.2331-4 du Code général des collectivités territoriales.";

  // ── i18n (cadrage général seulement) ──
  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }
  function _esc(s) { return window.ktaEsc(s); }   // échappeur unique (js/langManager.js)

  // ── État ──
  function isAccepted() {
    try {
      const v = parseInt(localStorage.getItem(LS_KEY), 10);
      return v >= TERMS_VERSION;
    } catch(e) { return false; }
  }
  function _markAccepted() {
    try { localStorage.setItem(LS_KEY, String(TERMS_VERSION)); }
    catch(e) { console.warn("[LegalGate] _markAccepted :", e); }
  }

  // ── Sous-modale : texte intégral (FR seulement) ──
  function _buildFullTextHtml() {
    let h = "";
    h += '<h3 class="kta-legal-full-h">⚖️ ' + _esc("Arrêté préfectoral du 2 novembre 1955") + '</h3>';
    ARRETE_1955.forEach(function(a) {
      h += '<p class="kta-legal-art"><strong>' + _esc(a.art) + '.</strong> ' + _esc(a.txt) + '</p>';
    });
    h += '<p class="kta-legal-sign">' + _esc(ARRETE_1955_SIGN) + '</p>';
    h += '<p class="kta-legal-src">' + _esc(ARRETE_1955_SRC) + '</p>';
    h += '<h3 class="kta-legal-full-h">🏛️ ' + _esc(SENAT_META.intitule) + '</h3>';
    h += '<p class="kta-legal-meta">' + _esc(SENAT_META.num) + '<br>' +
         '<strong>' + _esc("Auteure : ") + '</strong>' + _esc(SENAT_META.auteur) + '<br>' +
         '<strong>' + _esc("Ministre interrogé : ") + '</strong>' + _esc(SENAT_META.ministre) + '</p>';
    h += '<p class="kta-legal-meta">' + _esc(SENAT_META.qDate) + '</p>';
    h += '<h4 class="kta-legal-full-sub">' + _esc("Question") + '</h4>';
    SENAT_QUESTION.forEach(function(p) { h += '<p class="kta-legal-art">' + _esc(p) + '</p>'; });
    h += '<p class="kta-legal-meta">' + _esc(SENAT_META.rDate) + '</p>';
    h += '<h4 class="kta-legal-full-sub">' + _esc("Réponse du Ministère de l'intérieur") + '</h4>';
    SENAT_REPONSE.forEach(function(p) { h += '<p class="kta-legal-art">' + _esc(p) + '</p>'; });
    h += '<p class="kta-legal-src">' + _esc(SENAT_META.src) + '</p>';
    // Intrusion en lieu privé — Code pénal art. 226-4 + principe de propriété
    h += '<h3 class="kta-legal-full-h">🏠 ' + _esc("Intrusion en lieu privé") + '</h3>';
    h += '<h4 class="kta-legal-full-sub">' + _esc("Article 226-4 du Code pénal — violation de domicile") + '</h4>';
    CODE_PENAL_226_4.forEach(function(p) { h += '<p class="kta-legal-art">' + _esc(p) + '</p>'; });
    h += '<p class="kta-legal-art">' + _esc(PROPRIETE_PRIVEE) + '</p>';
    h += '<p class="kta-legal-src">' + _esc(CODE_PENAL_226_4_SRC) + '</p>';
    // Responsabilité pour faute + cas des secours
    h += '<h4 class="kta-legal-full-sub">' + _esc("Responsabilité en cas de dommages ou de secours") + '</h4>';
    RESP_CIVILE.forEach(function(p) { h += '<p class="kta-legal-art">' + _esc(p) + '</p>'; });
    SECOURS.forEach(function(p) { h += '<p class="kta-legal-art">' + _esc(p) + '</p>'; });
    h += '<p class="kta-legal-src">' + _esc(RESP_SRC) + '</p>';
    return h;
  }

  function _ouvrirTexteIntegral() {
    if (document.getElementById(FULL_ID)) return;
    const overlay = document.createElement("div");
    overlay.id        = FULL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.style.zIndex  = "100001";  // sous-modale au-dessus de la gate
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-legal-full-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<button class="kta-btn kta-btn-ghost kta-legal-back" id="kta-legal-full-back" type="button">' +
            _esc(_t("legal.full.back")) + '</button>' +
          '<span class="kta-readme-modal-titre">' + _esc(_t("legal.full.titre")) + '</span>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-legal-full-corps">' +
          '<p class="kta-legal-full-note">' + _esc(_t("legal.full.note")) + '</p>' +
          _buildFullTextHtml() +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    document.getElementById("kta-legal-full-back").addEventListener("click", function() {
      try { overlay.remove(); } catch(e) {}
    });
  }

  // ── Corps commun gate / consultation ──
  function _buildBodyHtml() {
    return (
      '<p class="kta-legal-intro">' + _esc(_t("legal.gate.intro")) + '</p>' +
      '<ul class="kta-legal-points">' +
        '<li>' + _esc(_t("legal.gate.pointTool")) + '</li>' +
        '<li>' + _esc(_t("legal.gate.pointInterdit")) + '</li>' +
        '<li>' + _esc(_t("legal.gate.pointResp")) + '</li>' +
        '<li>' + _esc(_t("legal.gate.pointRespect")) + '</li>' +
      '</ul>' +
      '<button class="kta-legal-readfull" id="kta-legal-readfull" type="button">📜 ' +
        _esc(_t("legal.gate.readFull")) + '</button>'
    );
  }

  // Gate BLOQUANTE : résout à l'acceptation (case cochée + bouton).
  function ouvrirGate() {
    return new Promise(function(resolve) {
      // Déjà accepté : no-op défensif (l'appelant teste déjà).
      if (isAccepted()) { resolve(true); return; }

      const overlay = document.createElement("div");
      overlay.id        = GATE_ID;
      overlay.className = "kta-readme-modal-overlay";
      overlay.style.display = "flex";
      overlay.innerHTML =
        '<div class="kta-readme-modal-boite kta-legal-boite">' +
          '<div class="kta-readme-modal-header">' +
            '<span class="kta-readme-modal-titre">⚖️ ' + _esc(_t("legal.gate.titre")) + '</span>' +
          '</div>' +
          '<div class="kta-readme-modal-corps">' +
            _buildBodyHtml() +
            '<label class="kta-legal-check" for="kta-legal-cb">' +
              '<input type="checkbox" id="kta-legal-cb"> ' +
              '<span>' + _esc(_t("legal.gate.checkbox")) + '</span>' +
            '</label>' +
          '</div>' +
          '<div class="kta-conv-actions kta-legal-actions">' +
            '<p class="kta-legal-hint" id="kta-legal-hint">' + _esc(_t("legal.gate.hint")) + '</p>' +
            '<button class="kta-btn kta-btn-primary kta-legal-accept" id="kta-legal-accept" type="button" disabled' +
              ' aria-describedby="kta-legal-hint">' +
              _esc(_t("legal.gate.accept")) + '</button>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(overlay);

      const cb     = document.getElementById("kta-legal-cb");
      const accept = document.getElementById("kta-legal-accept");
      const hint   = document.getElementById("kta-legal-hint");
      // La consigne ne parle que tant que le bouton est inactif : cochée, la case suffit.
      cb.addEventListener("change", function() {
        accept.disabled = !cb.checked;
        hint.hidden = cb.checked;
      });
      document.getElementById("kta-legal-readfull").addEventListener("click", _ouvrirTexteIntegral);
      accept.addEventListener("click", function() {
        if (!cb.checked) return;  // garde-fou
        _markAccepted();
        try { overlay.remove(); } catch(e) {}
        const full = document.getElementById(FULL_ID);
        if (full) try { full.remove(); } catch(e) {}
        console.log("[LegalGate] CGU acceptées (v" + TERMS_VERSION + ")");
        resolve(true);
      });
    });
  }

  // Consultation NON bloquante.
  function ouvrirConsultation() {
    if (document.getElementById(GATE_ID)) return;
    const overlay = document.createElement("div");
    overlay.id        = GATE_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-legal-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">⚖️ ' + _esc(_t("legal.gate.titre")) + '</span>' +
          '<button class="kta-readme-modal-close" id="kta-legal-consult-close" type="button" aria-label="✕">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          _buildBodyHtml() +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    document.getElementById("kta-legal-readfull").addEventListener("click", _ouvrirTexteIntegral);
    function _close() {
      try { overlay.remove(); } catch(e) {}
      const full = document.getElementById(FULL_ID);
      if (full) try { full.remove(); } catch(e) {}
    }
    document.getElementById("kta-legal-consult-close").addEventListener("click", _close);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
  }

  // ── Export ──
  window.LegalGate = {
    isAccepted:         isAccepted,
    ouvrirGate:         ouvrirGate,
    ouvrirConsultation: ouvrirConsultation,
    TERMS_VERSION:      TERMS_VERSION
  };

  // Lien « Conditions d'utilisation » du pied de page : écouteur, pas de onclick inline (CSP).
  document.addEventListener("click", function(e) {
    const a = e.target && e.target.closest && e.target.closest("#kta-footer-cgu");
    if (!a) return;
    e.preventDefault();
    ouvrirConsultation();
  });

  console.log("[LegalGate] Module chargé (CGU acceptées : " + isAccepted() + ")");
})();
