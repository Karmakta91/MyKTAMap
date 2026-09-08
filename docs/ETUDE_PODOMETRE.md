# 👣 Étude de faisabilité — « utiliser le podomètre »

> Demande KARMA, 06/09/2026 : *« récupérer les infos d'un podomètre pour avoir non seulement une meilleure précision mais aussi la possibilité de garder le téléphone en poche, via un truc à cocher »*.
> Statut : **étude**, aucun code écrit. Décision à prendre par KARMA.

---

## 🎯 La réponse en cinq lignes

1. **Le podomètre matériel du téléphone est INACCESSIBLE depuis une page web.** Aucune API, sur aucune plateforme. Ce n'est pas une limite de MyKTAMap, c'est une limite du web.
2. **Un podomètre externe Bluetooth ne sauve pas la mise sur iPhone** : Apple ne supporte pas le Web Bluetooth et a annoncé ne pas vouloir le supporter.
3. **Mais le vrai obstacle du « téléphone en poche » n'est pas le comptage des pas — c'est le CAP.** Et ça, aucun podomètre ne le résout.
4. **Il reste un gain de précision réel et gratuit** : le détecteur de pas actuel est rudimentaire, et le corriger vaut probablement plus que n'importe quel matériel.
5. **La case à cocher a du sens** — mais elle doit s'appeler **« mode poche »**, pas « utiliser le podomètre ».

---

## 1. Ce que le web peut lire, et ce qu'il ne peut pas

| Ce qu'on voudrait | Disponible en web ? | Détail |
|---|---|---|
| **Compteur de pas matériel** (iOS `CMPedometer`, Android `TYPE_STEP_COUNTER`) | ❌ **Non, nulle part** | Aucune API web ne l'expose. Le comptage de pas est cité comme *cas d'usage* de la Generic Sensor API, mais **aucune interface `StepCounter` ou `Pedometer` n'y est standardisée** |
| Accéléromètre brut | ✅ Partout | `devicemotion` — c'est ce que MyKTAMap utilise déjà |
| Accélération **sans la gravité** | ⚠️ Chrome/Android seulement | `LinearAccelerationSensor` / `GravitySensor` (Generic Sensor API). Absent de Safari |
| Podomètre externe Bluetooth | ❌ **Pas sur iOS** | Web Bluetooth : Chromium desktop + Android oui ; **Safari macOS/iOS/iPadOS non, sans intention de le supporter**. Chrome iOS non plus — Apple impose WebKit à tous les navigateurs |
| Garder l'écran allumé | ✅ | Screen Wake Lock, iOS 16.4+ ; **dans une PWA installée, seulement à partir d'iOS 18.4** (bug Apple avant) |

**Pourquoi le podomètre matériel serait intéressant s'il était accessible** : sur iOS comme sur Android, il tourne sur un **coprocesseur basse consommation** qui continue de compter *même téléphone endormi*. C'est exactement ce que « téléphone en poche » demande. C'est aussi précisément ce que le web n'a pas.

> 🩸 **Conséquence directe** : la case « utiliser le podomètre » telle qu'imaginée — brancher l'app sur le compteur de pas du téléphone — **ne peut pas exister** dans une PWA. Il faudrait un wrapper natif (§5, option D), ce qui sort du périmètre community.

---

## 2. 🩸 Le vrai obstacle du « téléphone en poche »

**Ce n'est pas le comptage. C'est la direction.**

MyKTAMap ne fait pas du GPS : il fait du **dead-reckoning piéton**. À chaque pas détecté, il avance la position d'une longueur de pas **dans la direction du cap**. Ce cap vient de la **boussole du téléphone** (`webkitCompassHeading` sur iOS — cf. `js/tracking.js` § `_getCorrectedHeading`).

En poche, la boussole donne l'orientation **de la poche**, pas celle de la marche.

| | Téléphone en main | Téléphone en poche |
|---|---|---|
| **Comptage des pas** | Correct, mais bruité (balancement du bras, amortissement de la main) | **Meilleur** — pics plus nets et plus amples, la cuisse transmet mieux l'impact |
| **Cap** | Correct si l'utilisateur tient le téléphone face à la marche | ❌ **Faux** : décalage constant inconnu, plus une oscillation de ±20-40° par foulée (rotation de la cuisse) |

Autrement dit : **mettre le téléphone en poche améliore la moitié du problème et casse l'autre.** Un podomètre parfait ne changerait rien à ça.

### Ce qui peut sauver le cap en poche

1. **Calibrer le décalage** — « marche 10 pas tout droit » au démarrage, on apprend l'écart entre l'orientation du téléphone et la direction de marche. Valable tant que le téléphone ne bouge pas dans la poche. Un ré-empochage l'invalide.
2. **Lisser sur une foulée** — l'oscillation de la cuisse est symétrique : sa moyenne sur ~1 s est stable. Un filtre passe-bas sur le cap règle l'essentiel.
3. **S'appuyer sur `smartNav`** — c'est le levier le plus solide, et **il existe déjà**. Dans une carrière, on marche dans des galeries : le map-matching sur le graphe des tracés contraint la position bien plus fortement que la boussole. Plus le relevé est complet, moins l'erreur de cap coûte cher.

> ⚖️ **Sur un plan bien tracé, `smartNav` fait plus pour la précision en poche que n'importe quel matériel.** C'est la piste que je regarderais en premier.

---

## 3. Ce que fait le détecteur de pas aujourd'hui

`js/tracking.js` > `initMotion()` :

```js
let magnitude = Math.sqrt(acc.x² + acc.y² + acc.z²);   // gravité INCLUSE
if (magnitude > APP_CONFIG.stepThreshold &&            // 13
    (now - lastStepTime) > APP_CONFIG.stepCooldown) {  // 400 ms
  stepCount++; avancer();
}
```

Puis la distance : `stepLength` (0,70 m) × échelle, **constante**.

C'est un **détecteur à seuil sur franchissement**, avec cinq faiblesses connues :

| # | Faiblesse | Ce que ça coûte |
|---|---|---|
| 1 | **Aucun filtrage.** L'événement arrive à 50-60 Hz, le signal brut est bruité | Un choc, un coup sur le téléphone, une main qui bouge = un pas compté |
| 2 | **Franchissement, pas détection de pic.** Déclenche au premier échantillon au-dessus du seuil | Aucune notion de « vrai » pas ; c'est le cooldown qui rattrape, pas la physique |
| 3 | **Cooldown fixe (400 ms)** = seul garde-fou anti-doublon | Plafonne la cadence à 150 pas/min et **rate les pas rapprochés** en marche vive |
| 4 | **Seuil fixe (13)** | Ce qui va en main ne va pas en poche : l'amplitude y est bien plus grande. Un seuil unique ne peut pas servir les deux |
| 5 | **Longueur de pas constante (0,70 m)** | **C'est ici que se perd le plus de précision.** Un pas lent fait 0,5 m, un pas rapide 0,8 m. À 1000 pas, l'écart se chiffre en centaines de mètres |

> 🍖 Le podomètre matériel d'un téléphone fait exactement ce que fait ce code — lire un accéléromètre et compter des pics — **mais avec un filtrage et une détection de pic sérieux, calibrés par le fabricant**. L'écart de précision ne vient pas du capteur, il vient de l'algorithme.

---

## 4. 🔬 Ce qui donnerait un gain réel, sans matériel

Quatre corrections, toutes faisables en JS vanilla hors ligne, **par ordre de rendement** :

### ① Longueur de pas dérivée de la cadence *(le plus gros gain)*
La longueur d'un pas est liée à l'amplitude d'accélération de la foulée. L'estimateur de **Weinberg** est le classique du domaine :

```
longueur = k · (a_max − a_min)^(1/4)
```

`k` se calibre une fois par utilisateur (marcher une distance connue sur le plan — l'app sait déjà mesurer). Remplace une constante par une mesure.
**Gain attendu** : c'est la source d'erreur dominante aujourd'hui. `[Probable]` — non mesuré ici.

### ② Détection de pic avec hystérésis (déclencheur de Schmitt)
Un pas est compté quand le signal **monte au-dessus** d'un seuil haut *puis* **redescend sous** un seuil bas. Le double comptage disparaît **par construction**, au lieu d'être masqué par un cooldown qui plafonne la cadence.

### ③ Filtrage passe-bas avant détection
Moyenne glissante ou IIR du premier ordre, coupure ~3-5 Hz. Supprime les faux pas dus aux chocs. Quelques lignes.

### ④ Seuil adaptatif
`seuil = moyenne glissante + k · écart-type` sur 2-3 s, au lieu de 13 en dur. **C'est ce qui rend le mode poche possible sans réglage manuel** : l'algorithme s'adapte tout seul à l'amplitude du placement.

> ⚠️ Ces quatre corrections touchent le cœur du tracker. Elles demandent un harnais de test avec des **traces d'accéléromètre réelles enregistrées** — sinon on remplace un algorithme non validé par un autre algorithme non validé, en plus compliqué. C'est le vrai coût de ce lot, pas les lignes de code.

---

## 5. Les quatre options, comparées

| | Option | Faisable ? | Coût | Gain |
|---|---|---|---|---|
| **A** | **Améliorer le détecteur** (§4) + mode poche | ✅ Oui, tout de suite | ~2-3 j + enregistrement de traces de référence | **Le meilleur rapport.** Précision et mode poche d'un coup |
| **B** | Generic Sensor API sur Android (`LinearAccelerationSensor`) | ⚠️ Android/Chrome seulement | ~0,5 j | Marginal. Évite de soustraire la gravité soi-même. **Crée une fracture de plateforme** pour un gain faible |
| **C** | **Podomètre externe Bluetooth** | ❌ **Impossible sur iPhone** | Voir §6 | Nul sur iOS. Sur Android, dépendant du matériel |
| **D** | Wrapper natif (Capacitor/Cordova) pour atteindre `CMPedometer` | ⚠️ Techniquement oui | Très élevé | **Rupture d'architecture** : la PWA « page unique, sans bundler » devient une app à compiler et publier sur les stores. Hors périmètre community |

---

## 6. 💰 Le modèle et le coût d'un podomètre externe

**Réponse courte : n'en achète pas.** Sur ton iPhone, aucun podomètre Bluetooth ne peut parler à MyKTAMap — Web Bluetooth n'existe pas sur iOS et Apple a annoncé ne pas vouloir l'implémenter. L'argent serait dépensé pour un appareil que l'app ne pourra jamais lire.

Pour être complet, si le sujet revenait un jour côté **Android** :

| Piste | Ce que c'est | Ordre de prix | Le problème |
|---|---|---|---|
| **Bracelets grand public** (Xiaomi, Fitbit, Amazfit…) | Podomètre + BLE | ~30-80 € | ❌ **Protocoles propriétaires**, souvent chiffrés et liés à un compte constructeur. Pas de profil GATT ouvert : illisible sans rétro-ingénierie |
| **Arduino Nano 33 BLE** | Carte à accéléromètre + BLE, on écrit le firmware | ~25-40 € | ✅ GATT ouvert, on maîtrise tout. ❌ **C'est un projet électronique**, pas un produit : boîtier, batterie, firmware à écrire et maintenir |
| **Carte de démo Microchip Pedometer** | Traceur d'activité de référence + module BLE RN4020 | Non vérifié | Plateforme de développement, pas un objet de terrain |

> ⚠️ **Ces prix sont indicatifs et je n'ai pas pu les vérifier** — mes recherches n'ont pas retourné de tarifs 2026 fiables. À confirmer avant toute décision.

> 🩸 **Le point qui tranche** : même sur Android, un podomètre externe ne donne que le **comptage de pas**. Il ne donne pas le **cap** (§2). On achèterait donc du matériel pour améliorer la moitié du problème qui marchait déjà le mieux.

---

## 7. ✅ Recommandation

**Ne pas faire « utiliser le podomètre ». Faire « mode poche », et réparer le détecteur.**

Concrètement, par ordre :

1. **D'abord mesurer.** Ajouter un enregistreur de traces d'accéléromètre (déjà à moitié là : le mode debug loggue la magnitude à 1 Hz). Marcher 100 pas comptés à la main, en main puis en poche, et **comparer au comptage de l'app**. Sans ce chiffre, tout le reste est une opinion — y compris cette étude.
2. **Puis corriger l'algorithme** — §4, dans l'ordre ① → ④. Le ① seul vaut probablement plus que les trois autres réunis.
3. **Puis le mode poche** : case ⚙️ Paramètres « 🚶 Téléphone en poche », qui active le seuil adaptatif, le lissage du cap sur une foulée, et propose la calibration du décalage (« marche 10 pas tout droit »). Écran maintenu allumé par Wake Lock — **avec l'avertissement que ça consomme**.
4. **Ne rien acheter.**

### Ce que le mode poche ne pourra pas faire, et qu'il faut dire à l'utilisateur
- **Il ne survivra pas à l'écran verrouillé.** JS est suspendu ; c'est pour ça que le Wake Lock est nécessaire, et pourquoi la batterie en souffre.
- **Il ne corrigera pas un ré-empochage.** Sortir puis remettre le téléphone invalide la calibration du cap.
- **Sa précision dépendra du plan.** Avec `smartNav` et un réseau de tracés complet, l'erreur de cap est rattrapée. Sur un plan sans tracés, elle s'accumule.

---

## 8. Ce que je n'ai PAS vérifié

Par honnêteté sur la solidité de cette étude :

- **Aucune mesure réelle.** Je n'ai pas fait marcher un téléphone. Tous les gains annoncés au §4 sont raisonnés depuis le code et la littérature, pas mesurés. `[Probable]`, jamais `[Certain]`.
- **Les prix du §6** n'ont pas pu être confirmés pour 2026.
- **Le comportement exact d'une PWA iOS installée, écran verrouillé, `devicemotion` actif** : je n'ai pas trouvé de source qui le documente explicitement pour une PWA (les sources parlent des apps natives). À tester sur l'appareil avant de promettre quoi que ce soit.
- **La carte de démo Microchip** : pas de tarif public trouvé.

---

## Sources

- [Generic Sensor API — W3C](https://www.w3.org/TR/generic-sensor/) · [Accelerometer — W3C](https://w3c.github.io/accelerometer/) · [Sensors for the web — Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/generic-sensor)
- [Device Orientation and Motion — W3C](https://www.w3.org/TR/orientation-event/) · [Device orientation events — MDN](https://developer.mozilla.org/docs/Web/API/Device_orientation_events)
- [Web Bluetooth — Can I use](https://caniuse.com/web-bluetooth) · [Implementation status — WebBluetoothCG](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md) · [Web Bluetooth API — bug WebKit 101034](https://bugs.webkit.org/show_bug.cgi?id=101034) · [PWA Bluetooth support 2026](https://instantpwa.com/answers/pwa-bluetooth-access)
- [Screen Wake Lock API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) · [Supported in all browsers — web.dev](https://web.dev/blog/screen-wake-lock-supported-in-all-browsers) · [Screen Wake Lock PWA — Progressier](https://progressier.com/pwa-capabilities/screen-wake-lock)
- [Pedometer — Expo (CMPedometer / TYPE_STEP_COUNTER)](https://docs.expo.dev/versions/latest/sdk/pedometer/) · [Step Counter API — dotnet/maui #16712](https://github.com/dotnet/maui/issues/16712)
- [Pedometer Demo and Design Files — Microchip](https://www.microchip.com/en-us/solutions/medical/demonstrations-and-design-files/pedometer) · [Arduino Nano 33 BLE — wearables](https://zbotic.in/arduino-nano-ble-33-bluetooth-5-projects-for-wearables/)
