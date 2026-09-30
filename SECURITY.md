# Politique de sécurité — MyKTAMap

## Signaler une faille

**Ne pas ouvrir d'issue publique.** Utilise le signalement privé de GitHub :
onglet **Security** du dépôt → **Report a vulnerability**
(https://github.com/Karmakta91/MyKTAMap/security/advisories/new).

Merci d'indiquer : la version concernée (badge en bas de l'application ou `version.json`), le navigateur et
l'appareil, les étapes pour reproduire, et l'impact que tu as constaté.

Tu reçois un accusé de réception dès que possible. La correction est livrée dans une version de l'application ;
le signalement est rendu public une fois la correction en production, avec ton nom si tu le souhaites.

## Versions suivies

Seule la **dernière version publiée** (https://myktamap.fr, branche `main`) reçoit des correctifs.

## Ce qui nous intéresse

MyKTAMap fonctionne **sans compte et sans serveur applicatif** : les plans, relevés et données de session restent
sur l'appareil. Sont donc particulièrement utiles :

- une fuite de données locales (plans, positions, photos, relevés) vers un tiers ou vers le réseau ;
- un contournement des verrous d'accès (écran d'accès, code PIN) ;
- une injection de contenu (HTML/JS) via un plan, un fichier importé (`.zip`, `.mkmsec.json`, GeoJSON, KML/KMZ…)
  ou un dictionnaire de langue ;
- une requête réseau non documentée dans l'audit réseau (`docs/applications/NETWORK_AUDIT.md`).

Hors périmètre : les instances auto-hébergées configurées par des tiers, et les attaques qui supposent un appareil
déjà compromis.

---

## Reporting a vulnerability (English)

Please **do not open a public issue**. Use GitHub's private reporting: **Security** tab → **Report a
vulnerability**. Include the app version, browser and device, steps to reproduce and the observed impact. Only the
latest release (https://myktamap.fr, `main`) is supported.
