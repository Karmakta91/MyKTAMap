# MyKTAMap — conventions for building designs

MyKTAMap is an offline PWA for underground mapping (galleries, shafts, rooms) used on a phone in the dark and on a
PC. Dark theme by default, light theme optional. This design system ships **styles only**: no React components.
Build your own markup and style it with the classes and tokens below. Never invent new `kta-` class names;
reuse these, and put any layout glue in inline styles that read the tokens.

## Setup
- Everything is in `styles.css` (tokens + the app's real stylesheet). No provider, no fonts to load: system stack
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`.
- Dark is the default. For the light theme, add `kta-theme-light` to BOTH `<html>` and `<body>`: the token values
  switch; do not hard-code light colors.

## Tokens (always `var(--kta-…)`, never a literal hex)
- Grounds: `--kta-fond` (page), `--kta-surface` (cards, windows), `--kta-surface-2` (raised rows), `--kta-bordure`.
- Text: `--kta-texte` (main), `--kta-texte-2` (secondary), `--kta-texte-3` (meta, captions). Text pairs are ≥ 4.5:1.
- `--kta-accent` gold: titles accents, active state, highlights only. As TEXT use `--kta-accent-texte`.
- `--kta-interaction` blue: links, selectable controls. `--kta-primaire` (+ `--kta-primaire-survol`,
  `--kta-sur-primaire` for its text): the ONE main action of a screen, blue in both themes.
- Status: `--kta-ok`, `--kta-avert`, `--kta-erreur`, `--kta-violet`, `--kta-magenta`; tinted boxes with
  `--kta-info-fond`/`--kta-info-bord`, `--kta-accent-fond`/`--kta-accent-bord`, `--kta-ok-fond`/`--kta-ok-bord`,
  `--kta-erreur-fond`/`--kta-erreur-bord`.
- `--kta-sur-accent`: dark text on a gold or orange fill (checked chip, active tab). `--kta-tuilage-v2`: violet of
  the V2 tiling (Generator progress bars, V2 checkbox and warning) — not for anything else.
- Text color helpers: `kta-tx-info`, `kta-tx-accent`, `kta-tx-muted`, `kta-tx-warn`, `kta-tx-err`, `kta-tx-ok`.

## Class vocabulary
- Buttons: `kta-btn` + one of `kta-btn-primary` (main action), `kta-btn-ghost` (quiet), `kta-btn-danger`;
  `kta-btn-small` for dense rows. Map popups use `kta-popup-btn`.
- Window (modal): `kta-readme-modal-overlay` > `kta-readme-modal-boite` > `kta-readme-modal-header`
  (`kta-readme-modal-titre` + close button `kta-panneau-close`) + `kta-readme-modal-corps`.
- Tool panel: `kta-panneau-header` / `kta-panneau-titre` / `kta-panneau-corps`, close `kta-panneau-close`.
- Filters window sections: `kta-fp-section` > `kta-fp-section-titre` + `kta-fp-section-body`; checkbox rows
  `kta-fp-row-cb`; lists `kta-fp-list`.
- Toast: `kta-toast` (+ `kta-toast-info` / `kta-toast-error`) with `kta-toast-icon`, `kta-toast-msg`,
  `kta-toast-close`. Floating "click on the map" banner: `kta-iti-floater`.
- Plan switcher list: `kta-switcher-list` > `kta-switcher-row` (`kta-switcher-icon`, `kta-switcher-name`,
  `kta-switcher-sub`).

## Rules
- Phone first: 390 px wide, thumb reach, touch targets ≥ 32 px. Also check 1280 px.
- One main (blue) action per screen; gold is never a button fill for secondary actions.
- No emoji as section markers in new designs; no glow on static text; no cards inside cards.
- Real vocabulary: plan, galerie, niveau (level), POI, tracé (path), zone, structure, Mode Secours. UI text is French.

## Snippet
```jsx
<div className="kta-readme-modal-overlay">
  <div className="kta-readme-modal-boite" style={{ maxWidth: 420 }}>
    <div className="kta-readme-modal-header">
      <span className="kta-readme-modal-titre">Charger un plan</span>
      <button className="kta-panneau-close" type="button">✕</button>
    </div>
    <div className="kta-readme-modal-corps" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ color: "var(--kta-texte-2)", margin: 0 }}>Relevé fictif de test · 3 niveaux</p>
      <button className="kta-btn kta-btn-primary" type="button">Ouvrir le plan</button>
      <button className="kta-btn kta-btn-ghost" type="button">Annuler</button>
    </div>
  </div>
</div>
```
