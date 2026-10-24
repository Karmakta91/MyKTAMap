# 📗 MyKTAMap — User Guide

## 📖 The story

### Where it comes from

MyKTAMap was born from a simple need: having, **in your pocket**, a cataphile map that is **reliable, offline, and doesn't leak**. Not an app store that asks for access to your contacts to display a map. Not a website that tracks you the moment you click. Not a cloud that decides tomorrow to send you a newsletter or resell your traces.

Just a `.zip` file containing the map, opened in a browser tab, that works **without a network**, and that gives you **full control** over what you do with it.

### Who it's for

For those who go down. Parisian cataphiles, amateur cavers, prudent urban explorers, rescuers trained for underground environments, heritage researchers — in short, anyone with a **legitimate and respectful** use of these places who wants a tool that doesn't put anyone in danger (neither people nor places).

The app has **no ambition to replace** old annotated paper maps, outings guided by elders, oral transmission, collective memory. It comes **as a complement**, like a digital layer superimposed on this knowledge — not a substitute.

### The philosophy

- 🌐 **100% offline by default** — the app works without a network once the map is loaded. You can launch it on a plane, in the metro, or 30 m underground.
- 🔒 **Zero telemetry** — no third-party service is called to track you. The only outside requests are the update check and, if one of your maps is GPS-calibrated, the OpenStreetMap background of the OSM View (on by default, can be turned off in ⚙️ Configuration): none of your map data goes out. The auditor can verify in `🔒 Network audit`.
- 📦 **Data ownership** — your annotations, your photos, your measurements are stored **locally**, in the browser. No one else has access to them. You can export everything at any time (`📤 Export`) and erase everything in 2 clicks (`💥 Reset everything`).
- 🤝 **Open code** — the license is `CC BY-NC-SA 4.0`. You can read the code, audit it. No black box, no marketing.
- ⚖️ **Discretion = respect** — a map shared carelessly is a weakened place. The app contains no maps by default; it is up to each user to load their own, and **not to distribute them** beyond the circle of trust.

### What the app is not

- ❌ **Not an underground GPS** — native geolocation doesn't work under rock. The app's "tracker" is a **pedometer + heading** that drifts quickly; you need to recalibrate regularly.
- ❌ **Not a safety guarantee** — the map gives the path, not the oxygen. You remain the sole judge of the risks (collapses, water, gas, fatigue).
- ❌ **Not a directory** — the app does not reference places. It displays what you give it, period.
- ❌ **Not a social network** — no account to create, no public profile, no one-click sharing. You choose who you send your `.zip` to, and how.

---

## 🙏 Acknowledgements

MyKTAMap would not exist without the work, knowledge and patience of many people. This project is carried by **one person** on the development side (KARMA), but it relies on **communities**, **open-source tools**, and **people** who took the time to pass things on.

### To the cataphile community

To the elders who surveyed the galleries with a pencil, map in hand, generation after generation. To the enthusiasts who compiled, digitized, cross-checked, verified. To those who pass it on — on outings, during initiations, whispering to a beginner "no, this way, not that way". MyKTAMap is just **one more tool** in this long chain. Without your maps, without your stories, without your vigilance, this app would have nothing to display.

### To the beta-testers in the field

To those who agreed to go down with an unstable `1.x.y-beta` version, to come back up with screenshots of bugs, to report UX friction, to propose features impossible to imagine from a desk. To the few comrades who tested every release underground, in the dark, in the cold, and who took the trouble to tell what was wrong. Your feedback shaped every hotfix — without you, the app would have remained a comfortable prototype from a couch.

### To the open-source tools

MyKTAMap relies entirely on **open-source bricks**. Without these projects, the app simply would not exist:

- 🍃 **[Leaflet](https://leafletjs.com/)** *(BSD 2-Clause)* — interactive map engine. Heart of the map display. Thanks to **Vladimir Agafonkin** and the many contributors of the project.
- 🔄 **[Leaflet.ImageOverlay.Rotated](https://github.com/IvanSanchez/Leaflet.ImageOverlay.Rotated)** *(BSD 2-Clause, vendored)* — plugin that projects an image as a parallelogram via 3 corners (CSS matrix transform). Used for the **2-anchor** calibration of image layers and for the projection of MyKTAMap plans **onto the OSM View**. Thanks to **Iván Sánchez Ortega** for this elegant plugin.
- 📦 **[JSZip](https://stuk.github.io/jszip/)** *(MIT/GPL dual)* — reading and writing of `.zip` archives on the browser side (maps, sessions, exports, partial extraction for the HOME mini-map). Thanks to **Stuart Knightley** and contributors.
- 📤 **[jsPDF](https://github.com/parallax/jsPDF)** *(MIT)* — generation of printable PDFs (A0 → A4, portrait/landscape, miniature page Rescue Mode, embed Story Mode).
- 📸 **[html2canvas](https://html2canvas.hertzen.com/)** *(MIT, vendored)* — DOM-to-image capture (canvas → PNG). Used to embed the **Leaflet OSM map** in the **« Firefighters Briefing »** PDFs of the Rescue Mode: the full graphic stack (tiles + overlays + projected plan) is captured as a frozen image and embedded in the PDF handed to external rescue teams. Thanks to **Niklas von Hertzen** and contributors.
- 🌍 **[OpenStreetMap](https://www.openstreetmap.org/) & its contributors** — licensed under **[ODbL](https://opendatacommons.org/licenses/odbl/)** for data and **[CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)** for cartography. Worldwide map data displayed in the **OSM View** (modal + HOME widget) **as soon as one of your maps is GPS-calibrated** (on by default, can be turned off in ⚙️ Configuration). The app shows the `© OpenStreetMap contributors` attribution in the corner of every OSM map, **as the ODbL license requires**. Tile hosting: **[OSM Foundation](https://wiki.osmfoundation.org/wiki/Privacy_Policy)** (non-commercial foundation, public logs policy, no advertising tracking). Without this monumental common good — built since 2004 by **thousands of volunteers** mapping the world street by street — the OSM View would not exist.
- 🧭 **Dijkstra's algorithm** (1959) — shortest path calculation for assisted itineraries. Edsger W. Dijkstra (1930-2002): thanks for this 60+ year old idea that still underpins Google Maps, OpenStreetMap routing, and every GPS in the world.
- 🌐 **[GPX 1.1 standard](https://www.topografix.com/gpx.asp)** — exchange format with TopoDroid, OsmAnd, Strava, Garmin and the outdoor ecosystem.
- 🛡️ **[Web standards](https://developer.mozilla.org/)** — Service Worker, IndexedDB, WebAuthn, FileSystemAccess API, Geolocation API. Maintained by thousands of people we will never meet and to whom we owe enormously.

> 📜 **License compliance**: vendored files (`lib/leaflet/`, `lib/leaflet-imageoverlay-rotated.js`, `lib/jszip.min.js`, `lib/jspdf.umd.min.js`, `lib/html2canvas.min.js`) keep their original license header. For network details (when each resource is contacted), see the **[Network Audit](./NETWORK_AUDIT.md)** (also accessible from the Audit modal in the app).

### To the PWA ecosystem

To the browsers (Chromium, Firefox, Safari, their mobile forks) that implement modern web standards and allow a simple page to function like a native app without depending on a store.

### To the development assistant

A good part of the code in this version was co-written with **Claude (Anthropic)**, an AI assistant that accompanied development over dozens of sessions. It's a tool just like Leaflet or JSZip — useful, honestly documented, and one that does not replace the vision or the final decisions (always on the human side).

### To you reading this guide

For taking 10 minutes to read instead of clicking blindly. This is exactly the state of mind these places require — **taking the time, understanding before acting, respecting what we don't yet master**.

> If you want to contribute — a bug report, a suggestion, a hand with the docs — go through the repo issue tracker or the usual community channels.

---

**Library & algorithm credits** — 🍃 Leaflet (interactive mapping) · 🔄 Leaflet.ImageOverlay.Rotated (2-anchor fitting + OSM View projection) · 📦 JSZip (reading/writing ZIP archives) · 📤 jsPDF (printable PDF export) · 📸 html2canvas (DOM capture for the firefighters' Briefing PDF) · 🌍 OpenStreetMap & contributors (ODbL data, OSM View can be turned off) · 🧭 Dijkstra (shortest path for itineraries) · 🌐 GPX 1.1 (outdoor exchange).

---

## 🔴 Important warnings

### 🔐 Data confidentiality — read this first

MyKTAMap is a field mapping tool that may contain sensitive information: **precise location of entrances, shafts, passages, underground structures.**

If this data were made public, it could:

- Make it easier for unprepared people to access dangerous places
- Cause overcrowding that damages these fragile spaces
- Expose users to legal proceedings
- Endanger ill-equipped people

**Rules that must absolutely be respected:**

- Never share your maps or data files outside your trusted group
- Never publish a screenshot showing coordinates or precise locations
- Never leave the app open and visible on a device that others can access

> These places belong to their history. Their preservation depends on the discretion of those who visit them.

### ⚠️ Position tracker warning

The tracker estimates your position **without GPS**, from the phone's motion sensors (accelerometer and gyroscope). It is **experimental**:

- the error grows the further you walk;
- accuracy varies a lot with the phone and how you hold it;
- level changes (stairs, ladders, shafts) are not taken into account.

**It is a visual aid, not a reliable navigation system.** Realign it (**📍 Realignment mode**, 🧭 Tracker menu) as soon as you recognise a landmark on the map. What to carry no matter what: "🆘 In an emergency underground".

### 🚨 Public alerts (real-time broadcast)

The author can broadcast **safety alerts** to the whole community: fire, access closure, toxic gases… Never commercial messages.

- **At launch**, a current alert shows up with its instructions: **pulsing red** = critical situation, must be read; **orange** = important information; **blue** = simple announcement. If there are several, a list sorts them from most to least serious.
- **Got it** puts it away: it only comes back if the author edits it or publishes a new one.
- **The 🚨 button on the home screen** (left of 📖) takes the colour of the most serious unread alert (grey if there is none), with their count when there are several. Tapping it shows every current alert again, even read ones — or **No active alert**, or **Check unavailable** when offline: a way to find out whether an old alert still stands.

### 🔒 Privacy & Network audit

**Your annotations, sessions, maps and personal data stay on your device: nothing is sent to a server or to a third-party service.**

The app only contacts its own site (loading, updates, alerts, connection test) and OpenStreetMap, which serves the background of the **OSM view** — on by default, can be turned off in ⚙️ Configuration. OpenStreetMap therefore sees the areas you look at, but none of your map data.

To check it yourself: ⚙️ Configuration (home screen) › **🔒 Privacy & Audit**:

- **📋 View the network log** — every request the app makes, live, and whether it sends data; can be copied, exported or emptied. If a request sends data, or an outside address other than OpenStreetMap shows up (in red), **tell the author**: Instagram **@karma_kta** or **contact@myktamap.fr**.
- **📖 What does the app do on the network?** — the list of addresses the app can contact and how to check with your browser (F12, Network tab). The full audit page describes the current state; what changed in each version is on its "version history" page.
- **🔌 The "Database: off" badge**, at the bottom of the home screen next to the version number, tells you whether the installation you use is linked to an online database. On myktamap.fr it says "off", and it will stay that way: this site has no database and no backend. An independent installation (club, team) can declare one: the badge then changes colour and text. Tap it to read its status and open the list above. On an installation linked to a database it says "connected" or "unreachable"; if that installation's connection module is missing, the app shows **"Installation unavailable"** and stays closed: try again later or let its administrator know. Signed in to an account of the installation, your actions (password, sign out) sit at the top of **👤 My profile**, and an administrator manages accounts from **⚙️ Configuration**. **Signing out erases** that account's data from the device (installation plans, sessions, photos): anything not yet sent is flagged first. On such an installation: the ℹ️ sheet of a local map offers **☁️ Publish this map**, then to **replace your local copy** with the ☁️ version (your annotations, photos and favourites follow); the **💾** on a ☁️ map's row keeps it on your device (**✅** = kept and up to date); in the tracker, **📡 Share my position on this map** shows your marker to others, only if you tick it (it is your position **on the map**, your tracker's: the app does not use GPS). The **👥 Team** button, on the left of the map, shows who is on the map, whether they are viewing or editing it, and their position on the map if they share it (📍 Centre, 👁 Follow, 〰 trail); on the home screen, **👥 N** on a ☁️ map means others have it open (**✏️**: being edited). In the **Route** window, **🧭 Show my route to the team** makes it visible (in yellow, read-only) to those who can see the map, updated at each step, removed when you erase it and after 24 h. On a map your access only lets you view, the drawing tools are greyed out: tapping one reminds you the map is read-only. On the sign-in screen of such an installation, the badge below the card tells you whether the database responds (tap it to check again), and the 📖 and 🆘 icons open the documentation and troubleshooting.

---

## 🚀 Getting started

### 📱 Install the application on Mobile (iPhone/Android)

MyKTAMap installs like an app, without going through the App Store or Play Store:

1. Open `myktamap.fr` in Safari (iPhone) or Chrome (Android).
2. Share button ↑ (Safari) or ⋮ menu (Chrome) → **Add to Home Screen**, then confirm.
3. Always launch the app from the icon it creates: it opens full screen, without the browser bar.

> ⚠️ **On iPhone, install the app before storing your maps**: in Safari without installing, space is small (~50 MB) and may be wiped after a long period of inactivity; once installed, the app gets about 1 GB that lasts. Android and PC offer several GB. If space runs out, a warning appears: the map stays usable, but you will have to re-select its file each time you open it.

### 📥 Install the application on PC

In Chrome, open `myktamap.fr`, click **Install** at the right of the address bar and confirm. Then launch the app from the icon created on your desktop.

### 📦 Load a map

When the app opens, the **startup screen** draws a gallery (about 4 s), then gives way to the home screen as soon as it is ready. A tap, a click or Esc skips it. If your device is set to reduce motion, it appears without animation.

The home screen offers:

- **▶️ Resume [name]** — reopens the last map you used where you left it (same place, same zoom, same level), even after closing the app; reopening a map from the list does the same. If tracking was running, the map centres on your last known position and tracking stays stopped: restart it with ▶️.
- **📚 My maps** — every map you have already opened (🌐 server or 💾 local), most recent first; maps available on the server show up there on their own. A tap reopens the map.
- **📦 Add a map** — drop your ZIP file on the area (or tap it to pick the file), then **▶️ Load this map**. The map joins your list. An **image** (`.jpg`, `.png`, `.webp`) dropped there opens the **Generator** with the image as background: you just name the map.
- **🏗️ Generate a map** — creates a map from scratch.

> 🔄 **Re-importing a regenerated map** — if your ZIP has the **same name** as a map in your list (whatever the author and version), the app asks what to do instead of overwriting it or stacking a duplicate:
> - **🔄 Update** — replaces the existing entry. Your session, notes and links between maps are kept; photos are only replaced if the new ZIP contains some.
> - **➕ Keep both** — both versions live side by side in the list.
> - **Cancel** (or ✕, Esc, tap outside) — nothing is touched. This is the default choice.

### 📡 Offline use

Once opened with a connection, MyKTAMap works **entirely offline**: the app keeps everything it needs on your device.

**To prepare an outing:**

1. Open the app **before leaving**, with a connection.
2. Load your map. It is stored in the app on first load (the **💾 Store the map in the app on first load** setting in ⚙️ Configuration, on by default): you will reopen it from **📚 My maps** without re-selecting the file.
3. Browse the map for a few seconds, then you can cut the network: the app keeps working.

The **dot** next to the version number, at the bottom of the home screen, tells you whether the app is ready: **green**, everything is saved for offline use; **red**, some files are missing — tap it with a connection to save everything (a red **📥** at the top of the home screen also reminds you). **Orange**: saving in progress, or no connection to finish it; **grey**: the status can't be checked (private browsing, incognito mode, very first load).

When a new version exists and you have a connection, the app offers to update.

---

## 🆘 In an emergency underground

🧭 **Where to start, depending on your situation:**

| Your situation | The tool | Where to find it |
|---|---|---|
| I want to **get out as fast as possible** | 🚨 Emergency exit | 🚨 button in the top bar |
| I know where I am, but I am panicking: I need **my position and heading in very large print** | 🔆 XL display | 🧭 Tracker menu, red button |
| **I no longer know where I am** | ⛑️ I'm lost | 🧭 Tracker menu, orange button |
| **Someone else is lost**, I am coordinating teams | 🚑 Rescue Mode | 🔭 Going further › 🚑 Rescue Mode |

### 🎒 The reflexes, before any tool

- **Always tell someone on the surface before going down**, with your estimated return time. That is the golden rule.
- Carry a **paper map** (or the printed map), a **physical compass** — the phone's is distorted by the ground and metal reinforcements —, an Ariadne's thread if needed, and a **headlamp with spare batteries**, plus a backup lamp.
- Underground, never rely on your phone alone: it can fail, its battery can run out, its tracker can drift.
- If you get network coverage (often near shafts and manholes), alert someone on the surface **before** your battery dies.

### 🚨 Emergency exit — find the nearest exit

To get out **right now**, without thinking: injury, low battery, lamp failure. Tap **🚨** in the top bar (on the right, next to 📖 Story Mode), or say "**sortie**" to the 🎤 voice command (available in French only; the button only appears when the app is in French).

**What the app looks for**: points marked as an open exit — **Open quarry access** (`cao`), **Open rung shaft** (`peo`), **Open service stairs** (`eso`) — as well as those tagged `entrée` and the built-in "🚪 Map entry point" tag. **Closed** variants (`caf`, `pef`, `esf`) are ignored: a point marked closed will never be suggested to you. If the map has no recognised exit, a message reminds you of these tags.

**What is shown**: the app computes the **real path** through the galleries, including from one level to another through the map's junctions. The **🚨 Emergency exit** window shows the nearest one, its distance and its level (N0, N1…), a **🧭 Plot the route** button and a **▾ Show the N other exits** fold-out, sorted by distance.

- Once the route is drawn, the **guidance banner** tells you what to do at each junction; during an emergency exit it cannot be closed, even if guidance is turned off. If you stray, its button becomes **Nearest exit from here** (see "🪧 Guidance" in the route section).
- An exit marked **Straight-line distance — route not verified** (dashed card) has no computed path: it is filed under **Unconfirmed**, and if no exit has a verified path, a red banner says so first. Beware: it may be unreachable (walls, isolated floor).

**Where the computation starts**: from your current position, as soon as tracking is on or you have located yourself once since opening the map ("📍 I am here", realignment, portal, restored session); the window tells you which. If you have **never** located yourself, the app asks **Where are you?**: tap your position on the map. That tap also realigns tracking, so the route and the XL display start from the same spot.

A vibration confirms the exit found or alerts you if there is none, even when **📳 Haptic vibration** is off. Everything is computed on your device, without network.

### 🔆 XL display

You know where you are, but you are panicking and need the essentials **in very large print**: re-orient yourself, spot a nearby shaft, check your heading, read your position out to someone. In the **🧭 Tracker** menu, the red **🔆 XL display (position + heading)** button opens a full-screen view that fits without scrolling:

- 🗺️ **A mini-map** filling almost the whole screen, tightly zoomed and centred on you, in **your legend's colours**, with your route, **the map's points and your own** (on the level shown), and the same orientation as the map in "oriented map" mode.
- 🖐️ **You can drag and pinch it** to look further. As soon as you move it, it stops following you and turns back **North up**; the **🎯 Recenter** button brings it back to you and resumes following and orientation.
- 📍 **Recognise a point?** Tap it: a bubble shows its name, type and note. **📍 I am here** realigns your tracking on it, exactly like a point's bubble on the map — the way to correct a drift without leaving the screen. The map then recentres on you.
- 🧭 **A giant compass** sitting on your position, showing your heading in real time. The first time, the browser asks for access to the orientation sensors: accept, otherwise it stays frozen.
- 🪧 **The next guidance instruction in large print** ("In 40 m, turn left"), if a route is drawn and tracking is on. On a deviation, **See the options on the map** takes you back to the banner.
- 🔋 **A status line** at the top right: your battery (if **🔋 Battery level** is enabled in ⚙️ Configuration), the tracker and compass state. The map name sits under the title.
- 📋 **Your GPS coordinates, if your map is georeferenced**: the 📋 icon at the end of the status line opens a bubble that shows them **in very large print**, readable from a metre away — the ones you read out to rescuers —, with a line saying whether it is your tracked position, your last known position, or the **map's starting position, never confirmed**. Its **📋 Copy my position** button copies the coordinates alone (`48.856600, 2.352200`), ready to paste into a text message or a maps app. ⚠️ If your position was never confirmed, the bubble says so but the message does not: tell whoever you write to as well. Map not georeferenced: no icon, no coordinates are shown.

The screen follows the app's theme, does not go to sleep while open and also fits in landscape. To leave: the big **↩️ EXIT XL DISPLAY** button, always at the bottom, or **Esc** on a computer (if a bubble is open, Esc closes the bubble first).

### ⛑️ I'm lost

You no longer know where you are. In the **🧭 Tracker** menu, the orange **⛑️ I'm lost — Emergency mode** button estimates the **area where you may be**, from your last sure position, the elapsed time and what you see around you. It is a geometric aid: it does not replace the reflexes above.

#### 📚 First, the best practices

The **📚 Best practices** fold-out block, at the top of the window, recalls them:

- **🧘 Stay calm (first)** — stop, breathe. Panic makes you lose your bearings and wastes light and energy. Eat or drink a little if you have something.
- **🗺️ Orientation** — **retrace your steps** rather than trying to reach your destination. Look for the **main passages** (haulage ways, straight galleries, railway tracks) that lead to known landmarks. Take a compass bearing at each junction. **Listen**: traffic, metro, running water point to a direction.
- **🔦 Light & resources** — switch your lamp to power saving straight away, keep your backup lamp, drink a little but ration it.
- **📡 Communication** — as soon as you get a signal, alert the surface: **📋 Copy report** prepares the message.
- **📍 If you decide to wait** — settle at an **identifiable** spot (numbered shaft, named room) and mark your location so you can be found. Stay put if **no one knows you are there**.
- **⚠️ What not to do** — don't follow water (fissures lead to dangerous passages), don't try an unknown passage because it "goes up", don't trust the tracker (it drifts, especially under stress).

These general principles replace neither training nor equipment.

#### 🎯 Estimate the area

1. **📍 Last known position** — where you were sure to be: search a map point by name, or **📍 Click map**, or **🧭 Tracker position** if tracking is on.
2. **⏱️ Elapsed time** — from 1 to 90 minutes. Beyond that, the area gets too wide: better to raise the alarm.
3. **🏃 Assumed walking speed** — the area's radius is speed × time. These speeds are the same as the route's, and your choice is kept on this device.

| Choice | Speed | Radius for 10 min |
|---|---|---|
| 🤕 **Injured** — hampered progress | 2 km/h | ~333 m |
| 🐌 **Slow** — tight squeezes, exploration | 3 km/h | ~500 m |
| 🚶 **Normal** *(default)* | 5 km/h | ~833 m |
| 🏃 **Fast** — familiar route | 7 km/h | ~1167 m |

4. **🔮 Visual clues** (optional but very useful) — what you see, separated by commas: *water jug, ram marking, broken shaft*. The app looks for them in the name, description and tags of every point on the map.
5. Tap **🎯 Compute the zone**.

**On the map**:

| Element | Meaning |
|---|---|
| **Pulsing orange circle** | The search area |
| **📍 pulsing green** | Your last known position |
| **🔮 pulsing purple** | A clue found **inside the area** — the most important |
| **· grey** | A clue found **outside the area**, set aside |
| **Inner purple circle** | Your most likely position, at the centre of the clues inside the area (if there is at least one) |

If the area exceeds the map, an orange banner says so ("you could be anywhere"): reduce the time or add clues. Changing the speed recomputes the area at once.

**Example** — you left the last known shaft 20 min ago and see a "Ram" marking and a water jug: pick the shaft, 20 min, `ram, jug`. If a "Ram marking" point falls inside the area, a purple circle points it out.

**Then**:

- **📋 Copy report** — a ready-made message (map, position, time, clues, likely position, time stamp) to send by text or radio.
- **✅ Delete the zone and save my presumed position** — removes the area and places a ⚠️ point at the likely position, which you can export like any other point.
- **🗑️ Clear the zone and close** — removes everything, without creating a point.
- **👁️ Close** (or ✕, or tap outside) — closes the window but leaves the area on the map to explore; reopening ⛑️ brings back your settings.

---

## 🗺️ Using the map

### 🧭 Interface overview

**At the top**, a fixed bar:

- the **compass rose** on the left takes you back to the home screen;
- the **map name** opens **🗂 Switch map** (see below);
- the **counters** 📍 points · 🛣️ paths · ⬛ zones · 🏛️ structures · 📸 photos open **📊 Session details**;
- on the right: **📖** Story Mode, **🌍** OSM View (georeferenced map), **🚨** Emergency exit, **🔋** battery.

**At the bottom**, a status bar groups what is in progress: 📐 measurement, 📏 total path distance, 🗺️ route (distance, time, pace — tap it to open the route) and the **🧭 tracker** light (ON · steps · distance while tracking; tap it to open the Tracker menu). It wraps onto a second line if everything doesn't fit; the ▾▴ button collapses it.

**On the sides**, the two side bars hold the tools. The interface is organized into **13 groups** spread over the **two side bars** — left: ⭐ Favorites, 📚 Help, ⚙️ Settings, ⬇️ Load, ⬆️ Save, ⏪ History; right: 🔍 Search, 🧭 Tracker, 📐 Measurement, ✏️ Edit, 🛣️ Paths, ⬛ Zones, 🏛️ Structures:

| Group | Icon | What it's for |
|---|---|---|
| **Favorites** | ⭐ | Your favorited points, one click away |
| **Help / Documentation / Legend** | 📚 | Help, documentation, icon legend |
| **Settings** | ⚙️ | Map settings: scale, North, georeferencing, tracker, display… *(direct click)* |
| **Search** | 🔍 | Find a point, a path, a zone or a structure *(direct click)* |
| **Load / Import** | ⬇️ | Import a session or a GPX (opens the file picker directly) |
| **Export** | ⬆️ | A launcher: image (PNG / JPEG, PDF, GeoTIFF), session, map update, external export (KMZ / GPX / GeoJSON) |
| **History** | ⏪ | Undo (`Ctrl+Z`) / Redo (`Ctrl+Y`) |
| **Tracker** | 🧭 | **Full-screen menu** of tiles: tracking, realignment, My position, compass, route, guidance, emergencies |
| **Measurement** | 📐 | Measure a distance or an area, clear |
| **Point editing** | ✏️ | Add your own points *(direct click — ON/OFF switch)* |
| **Paths** | 🛣️ | Draw main and secondary galleries, paths, junctions, **compute the total distance** |
| **Zones** | ⬛ | Draw backfill, collapse, water or inaccessible zones |
| **Structures** | 🏛️ | Pillars, walls and working faces |

**How it works:**

- **Only one group open at a time**; touching outside closes it.
- **While a mode is on** (measurement, adding points, path, zone, realignment), the group stays open and its icon shows the current mode. Only one mode is active at a time.
- **Opening a window on top** (Settings, Filters, Documentation…) cancels the current mode. The tracker, however, keeps running, and the form of a point you have just placed does not cancel editing.
- The Paths, Zones and Structures panels open in the centre of the screen.
- The **≡** button at the top of each bar folds it away without stopping active modes; in landscape on mobile, the bar scrolls if it overflows.

#### 📊 Session details

A click on the top counters opens the map's **dashboard**:

- at the top, **✅ Saved N s ago** (in red if saving fails);
- the totals (and the per-level breakdown on a multi-level map), then all your points, paths, zones, structures and photos;
- the other measurements: 📐 measurement, 🗺️ route and its stops, 🧭 tracking;
- **📔 Current outing**: 🏁 Close, 🧭 Refine the trail, open the logbook. If no outing is running, the **📔 Start an outing** button opens one on this map — even when “Keep a logbook of my outings” is unticked in ⚙️ Configuration (it is then the only way to record one). One outing at a time;
- **⭐ Favorites**: export this map's or all of them, import;
- **📦 Recent backups** of this map: ↻ Restore, 📆 Snapshot now, 🗑️ Clear all — every deletion asks for confirmation. Copies from **another version of this map** (re-imported or renamed) also show up, marked 📂, and are restored into the open map;
- **💾 Session memory**: your sessions live in the space the browser grants the app on your device — a share of its free space, shared with your maps, photos and backups (no more 5 MB cap since 10/10/2026; your existing sessions were moved there automatically). The gauge shows how full it is and which maps have the heaviest sessions; at 80 % the app warns you when you open a map. To free some room: export your session (📤 Export), then clear the session or photos of an old map, or remove a map you no longer need. If the browser refuses this storage (some private browsing modes), your sessions stay in the old storage capped at ~5 MB, and the gauge shows it;
- **🗑️ Clear the session**: the same clearing as the “Previous session restored” window (see 🧹 Erase and correct), at any time. On a read-only ☁️ map, the button says “Nothing to clear: this map comes from the server”;
- the **📊 Global stats** button (copyable report, CSV, PDF).

### 🗺️ Reading the map

- **Pinch** to zoom, **drag** to move around (or use the **+** / **−** buttons at the top left).
- **Tapping an icon** opens the point's popup; **double-tapping** zooms onto it (like the popup's “Go” button).
- Icons shrink as you zoom out to stay at the map's scale, on the plan as well as on the OSM maps (OSM view and the home screen map). To keep a fixed size: home ⚙️ Configuration → 🎨 Display → “📐 Scale icon size with zoom”.

#### 🌐 GPS coordinates in popups

If your map is **georeferenced**, the popup of every point (yours and the map's) shows its coordinates, for example `🌐 48.85660° N, 2.35220° E`, to about 1 m. The **📋** button copies them in `lat, lng` format, ready to paste into a maps app or a text message — handy to pass on the location of a shaft you have just added. Paths, zones and structures have no single coordinate, so no GPS line. Map not georeferenced: no line.

#### 🔄 Switching maps

The **map name** at the top opens **🗂 Switch map**: the current map, the recent maps, and **📚 View all my maps** to go back to the home screen. When you switch, your session is **saved automatically**. To close without doing anything: ✕, click outside or **Esc**.

### ≡ Filters

The **≡** button at the top right of the map opens **≡ Display filters**. Every checkbox acts on the map straight away:

| Section | What it filters |
|---|---|
| 🖼️ **Image layers** | The map image and its additional layers |
| 📊 **Data layers** | The layers shipped with the map, and **My annotations** (everything you added: unticking it hides your additions without deleting anything) |
| 🏗️ **M-LVL levels** | Multi-level maps: active level (for drawing) and visible levels — kept in sync with the Levels window |
| 🏷️ **Point tags** | The tags actually present on the map, with their count |
| 🛣️ ⬛ 🏛️ **Types** | Path, zone and structure types, including your own |

- Each section folds away, and has its **👁️ All** / **🚫 None** buttons.
- **🔄 Show all** sets tags and types back to “everything visible”, without touching levels or layers.
- At the bottom, **Active filters: …** reminds you what is filtered; the ≡ button also signals when items are hidden.
- Filters are **remembered per map**: you find them again when you come back to this map, and a message tells you so.
- What you are drawing stays visible, even if you untick its type.

*Example: to see only two kinds of shafts, 🏷️ Point tags → 🚫 None, then tick the two tags you want again.*

> 🔄 **Correcting a data layer** — a layer shipped with the map can be hidden but not edited. The **🔄 Edit** button on its row copies it into your session, where all your tools apply (for instance 🔄 Convert this object); the original hides itself (“being edited — show anyway” lets you compare). Before acting, the app tells you how much space the copy will take and how much your sessions already use. **↩️ Restore** drops your changes; **💾 Export** produces the corrected file of **that layer only**, to hand back to the map via 🏗️ Generator → “Edit a plan”, “Choose” button on the layer's row: it replaces the old content. What you drew yourself is not part of it (the app tells you how many objects are left out of the file), unless you attach it: **➕ Add drawn objects**, on the layer's row, lists your drawings on the map by family (nothing ticked in advance, “Tick all”, “Created by” filter on a connected installation); the chosen objects then go into the layer's file, and ⏪ undoes it. An added object belongs to the layer: restoring the layer removes it too, and the restore window says how many. Clearing the session restores the layers opened for editing; re-importing your session on this map puts them back in edit mode. On a connected installation, “Clear the session” lets you choose: **clear on this device only** (layers opened for editing by the team come back from the server, still being edited) or **also give the layers back to the team** (they return to their original for everyone, and edits the others have not exported on these copies are lost). On a connected installation, a layer opened for editing by another account also shows as such on your side, and restoring it restores it on every device (a copy changed since then stays, flagged as a duplicate).
>
> 🔄 **Updating the map** — to put your work into the map itself: **⬆️ Export → 🔄 Update the map**, or the button at the top of the layers in **≡ Filters**. **1.** Layers being edited are ticked: each one replaces its file. **2.** Your hand-drawn objects are grouped by tag (points, by their first tag) or by type (routes, zones, structures); for each group, choose a map layer, a **new layer** (you name it) or “Leave in the session”. **3.** The Generator opens in Edit mode, already filled with the map's current ZIP, those layers and your photos: check it, then generate (if the map's ZIP is not on the device, it asks you to drop it). With **V2 tiling**, the app warns you, then **closes the map during generation** to free memory (your session is saved): **🔄 Replace** or **☁️ Publish** reopen it in its new version, otherwise you find it again on the home screen (**Resume**). **4.** Imported map: **⬇️ Download** or **🔄 Replace the map in the app** (same map: your session, calibration and photos stay attached). Map from a linked installation: **☁️ Publish the new version** if your right allows it, otherwise you download the ZIP for the person who manages the map. Site map: download, to pass on to its administrator. After a replacement or a publication, the app offers to **hand the layers back** (to the whole team on a linked installation) and to **remove the objects you put in from your session** — otherwise they show twice; an object changed after generation stays in your session, and the app says so. Same rule if you reopen by hand in the Generator (Edit mode) the ZIP of a map from a linked installation, for example the one from its ℹ️ card: the app recognises it and offers **☁️ Publish the new version** of that map (or explains who publishes); **Publish as a new map** makes a separate copy, only if you choose it. Edited ZIP, or a name shared by several maps: the app asks **Update which map?** among the maps you manage (or “None: publish as a new map”); if several maps have that name, none is preselected: choose the right one (folder, version and opening date tell them apart).

### 🗺️ Legend

**📚 Help / Documentation / Legend → Legend** shows every icon the app recognizes (even those your map doesn't use), as well as paths and zones, sorted by category.

#### 🎨 Customizing the legend

In the Legend, **✏️ Edit**. For each path, zone or structure type:

- **Rename**: your label (“Main” → “Grand gallery”) shows everywhere — legend, popups, statistics, filters.
- **🎨 Colour**: one square per row; two for zones, pillars and walls (fill and border). The colour applies at once everywhere: map, image, PDF and KMZ exports, statistics, OSM View. **↺** restores the original colours. With no border chosen, a zone takes a darker shade of its fill; a recoloured *Inaccessible* zone loses its hatching.
- **👁️ Hide** removes the entry from the legend box only. To hide objects on the map, use **≡ Filters**.
- **➕ Add an entry** creates your own type (path, zone, structure, icon) with its colour, drawable right away. Shortcut: the **New type…** row of the Paths, Zones and Structures menus, which selects the new type.
- **🗑️ Delete** one of your types: if objects still use it, the app tells you how many before confirming.

Everything is saved **per map**, and travels with your exports (session, data layer, Advanced ZIP). If objects use a type missing from the legend, a banner at the top of the Legend counts them: they show in a fallback colour until you recreate or re-import the entry.

---

## 🔍 Unified search

The **🔍** button in the side bar, or **Ctrl+K** (`Cmd+K` on Mac), opens **🔍 Unified search**. Ctrl+K again closes it.

### ⚙️ How it works

1. Type your search: results appear as you type, **grouped by category** — 📍 Points · 🛣️ Paths · ⬛ Zones · 🏛️ Structures.
2. Pick one with **↑** / **↓** then **Enter**, or tap a result.
3. The map centres on it: a circle around a point, a highlight lasting a few seconds for a path, a zone or a structure, and its popup opens.

**What is searched**: for a point, its name, identifier, tags, description and state; for a path, a zone or a structure, its name, type and level. The search covers your additions **and** the layers shipped with the map. It ignores accents and capitals (“aeration” finds “Aération”).

**Filters below the field** (reset each time you open it):

- **Category** — Points, Paths, Zones, Structures, with their count;
- **Layers** and **Tags** — for points only.

Several choices on the same row add up (one **or** the other); across rows, they combine (one **and** the other). **✕ Clear filters** removes them.

### 🌐 Pasting GPS coordinates

On a **georeferenced** map, paste coordinates in the format `48.856600, 2.352200` (copied from a maps app):

- a point exists close by → **🎯 Go to point**;
- otherwise → **➕ Create a point here**, which opens the form of a new point at that spot.

If the position falls outside the map, or the map is not georeferenced, a message says so (with a shortcut to ⚙️ Settings → 🌐 Georeferencing).

### 🔎 Multi-map search

To search for a point in **all your maps** without opening them:

- **from the home screen**: the 🔎 search bar at the top of the screen. Results (maps and points) appear from 2 characters; **Enter** or 🔎 opens the full search;
- **from the map**: in the search, the **Search across all plans** button, which keeps what you typed.

The app reads the points of each map on the spot, showing its progress. Each result carries the **name of its map**. A click opens the right map, on the right level, centred on the point (after confirmation if a map is already open); the **↩️ Back** button takes you back to where you were.

---

## 📍 Position tracker

The tracker estimates your position **without GPS**, using the phone's motion sensors (steps and direction). All its buttons are in the **🧭 Tracker** group.

### 🧭 Tracker menu

The **🧭 Tracker** button (or the 🧭 light in the bottom bar) opens a **full-screen modal of large tiles**, in three sections. Each tile closes the modal as it acts.

| Section | Tiles |
|---|---|
| **Tracking** | ▶️ / ⏹️ Start / stop · 📍 Realignment mode · 🎯 My position (re-centres the map on you) · 🔓 Suspend trace lock |
| **Tools** | 🧭 Compass · 🗺️ Compute a route · 🪧 Itinerary guidance · 🗺️ Oriented map |
| **Emergency** (red background) | ⛑️ I'm lost · 🔆 XL display · 🚑 Rescue mode — see 🆘 In an emergency underground |

Smart navigation (trace lock), oriented map, route across multiple plans, replay and heatmap are options turned off by default → 🔭 Going further.

### ▶️ Starting tracking

1. Tap **▶️**. The first time after each reload of the app, a window reminds you that the tracker is **experimental** (it drifts) and offers **🔆 Keep screen on**, ticked by default: a screen that goes to sleep means lost steps. Confirm with **Got it — Start**.
2. On a phone, allow access to the motion sensors.
3. Your icon (a blue cone) appears at the starting point and points in your walking direction (North when tracking is stopped); a trail records your path.
4. **⏹️** stops tracking.

> ⚠️ Drift builds up: **realign yourself about every 50 m** on a landmark of the map. Metal reinforcements distort the phone's compass — keep a real compass.

### 📍 Realigning your position

As soon as you recognize a landmark:

1. Tap **📍** (the button lights up);
2. tap the spot on the map where you are.

The icon moves there, the trail restarts from there and the mode closes by itself. Another way: the **📍 I am here** button in a point's popup.

### 🧭 Compass

The **🧭** tile shows a compass rose at the top left of the map, even with the tracker stopped. Its **N** always points North, whatever the phone's orientation. Tap it to enlarge it (direction in big letters and exact angle); ✕ closes it.

**To check the sensors**, hold the phone flat, its top pointing where you walk:

| You walk towards… | The rose's N is… |
|---|---|
| North | at the top |
| East | on the left |
| South | at the bottom |
| West | on the right |

If it doesn't match, the magnetic field is disturbed (scrap metal, reinforcements): realign as soon as possible and don't trust the trail too much.

### ⚙️ Tracker settings

In **⚙️ Settings → 📍 Navigation & tracker**:

- **🧭 Tracker start position** (specific to this map): enter X / Y, or use **🔍 Pick via a point** (search by name, identifier or tag) or **📍 Click on the map**. Remember to save.
- **👣 Step detection** — **Step length (m)** (about 0.7 m), **Detection threshold** (sensitivity), **Cooldown (ms)** (minimum delay between two steps). These settings apply to **all your maps** on this device and travel with your profile.

Everything relies on the map's **scale** (⚙️ Settings → 📐 Map: scale & geolocation, 🎯 button to compute it from a real measurement): check it first.

---

## 🗺️ Computing a route

The **🗺️ Compute a route** tile of the Tracker menu computes the **shortest path** between several points, following the map's paths (yours and those shipped with the map).

1. Add your **📍 Waypoints**, in order:
   - **📍 Map click mode**: the window shrinks, tap the map to place each point, then **✓ Done**;
   - **🔍 search** for an existing point (name, identifier, tag);
   - **🧭 My position**: your current tracker position.
   The ✕ on a row removes the point.
2. **🎯 Compute route**: the route appears in cyan, with its distance and estimated time.
3. **💾 Save as route** keeps it in your session; **❌ Discard** removes it.

While a route is active, the bottom bar shows **🗺️ distance · time · pace**; tap it to reopen the window.

**🏃 Estimated walking speed** (remembered on this device):

| Pace | Speed | When |
|---|---|---|
| 🤕 **Injured** | 2 km/h | Hindered progress, rough ground |
| 🐌 **Slow** | 3 km/h | Caution, squeezes, exploration |
| 🚶 **Normal** | 5 km/h | Standard pace (default) |
| 🏃 **Fast** | 7 km/h | Brisk pace, known route |

**🛑 Pause between stops** (checkbox) adds a pause time at each intermediate stop to the estimated time.

**Route already drawn?** The window opens in navigation: **⏮️ Start**, **⏭️ End**, **🔁 Full tour**, 🎯 on each stop to view it, **🔄 Recompute route** to adjust the stops, **❌ Clear route**.

**Start or stop away from the galleries**: the stretch to the nearest gallery is drawn **dotted** and counted in the distance (there and back for a stop). Beyond **50 m**, the app warns you: it is not a known gallery, check the position. A map **with no paths at all** cannot have a route computed.

### 🔄 Living route

The route follows your realignments:

- **You realign on the route** (**📍 I am here** button of a point less than 8 m from the route, or arrival through a portal): the part already walked is removed, the stops passed are validated, the remaining distance updates. Nothing is recomputed: it is instant.
- **You realign elsewhere**: the app offers to **Recalculate** from your new position (the remaining stops keep your order and your avoidances), **Keep the route** as it is, or **🗑️ Delete the route**.
- **📍 I am here on a stop** **validates** it (green ✓ on the map, crossed-out row in the window), in whatever order you like. A realignment by clicking on the map never validates a stop.
- **All stops validated**: “🎉 Route complete”, the route disappears (your tracking trail stays).

Validated stops are kept with your session, even if the phone locks or the app reloads.

*In practice: plan me → curiosity X → curiosity Y → exit, walk, and tap 📍 I am here at each point reached.*

### 🪧 Guidance

As soon as a **route is drawn** and your position is known — tracker running, or simply an **📍 I am here** on a point — a **banner** at the top of the map tells you what to do:

- **“In 40 m, turn left”**, **“Continue for 120 m”**, then **“Now: turn left”**; underneath, the next instruction (“Then turn right”).
- It only speaks **at crossings**, always with a distance (never “the 3rd on the left”). Two close galleries: “take the left / right branch”. Level junction: “go up / down to level N”.
- Several crossings very close together count as **a single junction**, with a single instruction. From 4 galleries on, a **small diagram** shows the one to take (in gold); if a named point lies there, its name opens the instruction.
- **Off the trace at the start**: “Reach the trace: ~12 m”, with an arrow towards the nearest gallery.
- Distances are **approximate** (“~40 m”, rounded to 10 m): the position comes from the pedometer and drifts.

**Straying or turning back?** The banner turns orange (“Off the itinerary?” / “Turning back?”) and offers **I am here** (tap where you are), **Recompute from here** or **Ignore**. Nothing is recomputed without you.

**Tapping the banner** opens the **🪧 Route sheet**: all the instructions and their distances (tap a row to see the spot). It also opens from the Route window, without the tracker, to prepare an outing.

**The banner's ✕ turns guidance off**; the **🪧 Itinerary guidance** tile of the Tracker menu turns it back on, without recomputing.

> 🚨 During an **emergency exit**, the banner has no ✕ and shows even with guidance off; if you stray, it offers **Nearest exit from here**. The XL display repeats the instruction in large print.

### 🚫 Avoidance preferences

The foldable **🚫 Avoidance preferences (optional)** section of the Route window sets what the route should **go around if possible**:

- **📍 Points to avoid**: by search, by exact identifier, or **📍 Click on the map**;
- **🏷️ Tags to avoid**: tap a tag to avoid every point that carries it;
- **⬛ Zones to avoid**: tick a zone type (Water, Collapse, your types…);
- **📏 Margin**: the distance kept around avoided points.

If no other path exists, the route goes through anyway and says so: **⚠️ Cannot avoid: …**. Your preferences are remembered per map; **🗑️ Reset all avoidances** clears them.

**Inaccessible zones ⛔**, on the other hand, are **never crossed**, unless you untick **Respect impassable areas** (useful on an incomplete survey). I'm lost and Rescue mode always respect them.

---

## 🌀 Inter-plan links

A link joins **a point on one map to a point on another map** — a “portal” between two networks that touch, or between an overview map and a detail map.

**Creating a link**: in a point's popup, **🌀 Link to another plan** → choose the target map → search for the arrival point (name, identifier or tag; no need to open the other map). The link appears in the popup of **both** points. A point can carry several.

**On the map**, a linked point keeps its icon. To make it stand out, give it the **Portal** tag (vortex icon).

**Using a link**: in the popup, 🌀 row → **➜** → confirmation. The app saves your session, opens the other map, switches to the right level and drops you on the arrival point. Your **tracker is realigned there** (you physically crossed), and a route active on that map restarts from the portal. A **↩️ Back: <map>** button takes you back to the view you came from, for 15 seconds; returns stack up. On that button, **–** shrinks it to a small chip (choice remembered) and **✕** closes it and forgets the returns.

**🌀 My links** (on the home screen) lists all your links: ➜ to go to one end, 🗑️ to delete, ⛔ if a map is missing from the device. Two views:

- **List** — with, when both maps are georeferenced, the **Alignment gap**: the distance between the two ends, which mark the same real spot. It is not a distance to walk: the smaller it is, the better your georeferencing. An absurd gap almost always comes from the georeferencing of one of the two maps. The OSM View ranks these gaps from worst to best.
- **Graph** — your library as a network: one bubble per map, one line per border (thicker with more links). Tap a bubble to open the map, a line to see its links; drag the bubbles with your finger.

### 🧭 Route to another map

From the Route window (**Destination on another plan**) or a multi-map search result (🧭 button): the app picks the shortest portal, shows the route in steps and draws it on your map. Your waypoints are visited first, in order; the avoidances of each map are respected. If it is impossible, a message says why.

By default, the route crosses only one border (your map and the destination map). To go through intermediate maps (A → B → C), tick **🌀 Route across multiple plans (connected plans)** in the multi-map search, with a map open; this choice is remembered.

**Let's go** does not teleport you: you walk (stop validation and recalculation as usual), then cross at the portal with the floating **🌀 Next portal** button or the portal point's ➜. The rest is drawn on the other side. If you open the next map another way, or replace the route, the rest is dropped. The 🪧 Route sheet summarizes the following maps (“Then 🌀 portal → map: 350 m, 4 crossings”).

**Good to know**: renaming or moving a linked point updates its links; deleting a point deletes its links; links travel with the session export; those shipped with a map can be used but not edited.

---

## 🌍 OSM View

The OSM View lays your **georeferenced** maps over the OpenStreetMap map, with their points, paths, zones and structures, in your legend colours. It is **on by default**: the background map comes from OpenStreetMap, which therefore sees the areas you look at; no data from your maps leaves the device. To turn it off: ⚙️ Configuration.

- **On the home screen**, the **🌍 OSM View** widget; its **⛶** button opens the OSM mode full screen.
- **On a map**, the **🌍** button in the top bar (georeferenced maps). From a map, the OSM View only opens if the map has been **converted to tiled V2** (see “🧱 Convert to V2 tiles”); otherwise, a message explains how to convert it.
- A map only shows up once it has been **opened at least once**: that is when the app reads its georeferencing.
- **Offline**: **💾 Save Offline** downloads the tiles of the visible area in advance.
- Zooming in on a map shows more detailed images, read from the map file already on your device. Layers shipped hidden are shown and filtered like the others.

**Search**: the bar in the title row looks for a map or a point among your georeferenced maps; the map flies to it. It reads your maps, without asking the Internet anything.

**📏 Measuring**: in OSM mode, the measurement tool gives a distance and an area; they do not depend on any map calibration.

**🎯 Surface coordinates**: a click on the map gives the latitude and longitude of the point right above, with a Copy button — that is what you pass on to a team arriving from the surface. Their accuracy depends on the map's alignment.

**🗺️ Legend**: on a map, the **🗺️ Legend** button of the OSM View; on the home screen, the **🗺️** button of the banner. It is the map's legend, with your names, your colours and your own types, **read-only**: you edit it from the map (🗺️ Legend → ✏️ Edit). On the home screen, it is the legend of the map you just left, otherwise that of the displayed map you opened most recently; when several maps are displayed, a message reminds you that the others have their own.

**🗂️ Several maps at once**: the **≡** button of the banner opens a window with the display settings, the tag filter and the stack of displayed maps:

- ➕ add a map — the menu groups them by **folder** of “My maps”, and “📁 Add the whole folder” shows them all at once —, ▲▼ move it above or below, an **opacity** slider per map, ✕ remove it; ◉ marks the main map;
- on each row, 5 mini-buttons hide the image, points, paths, zones or structures of that map;
- **by label**: the labels shared by at least two of your georeferenced maps appear as chips; one click shows all their maps, a second one removes them. Beyond 3 maps, the app asks for confirmation and loads them one by one (slower on mobile).

---

## 📖 Story Mode

The **📖** button in the top bar (on the right, next to 🚨) opens your **exploration notebook**, specific to each map, in two tabs.

### 📝 Free note

One note per map, **saved as you type**. It shows formatted; **✏️ Edit** opens the text, with a toolbar (bold, italic, headings, list, link, code, quote), and **👁 Preview** goes back to the rendering. The note accepts Markdown (`**bold**`, `# Heading`, `- item`).

### 📚 PDF documents

Up to **10 PDF documents per map**: report, scanned paper map, article, topo survey…

- **📥 Import a PDF** adds one; **🗑️ Remove** deletes the one shown. The list appears as soon as there are several.
- Documents shipped with the map (📕) come first in the list. They are copied to your device the first time you open it; if you remove them, they come back the next time the map is opened.
- Warning beyond **25 MB** in total, refusal beyond **100 MB**.
- On iPhone, **↗️ Open in a tab** shows the document full screen.
- Your documents can also be viewed from **📔 My logbook → 📖 Stories**, without loading the map.

**Export**: the note and the documents go with the session export and are **added** to the map on re-import (nothing is overwritten). The **anonymized** export leaves them out. Everything stays on your device.

---

## ✏️ Add points

The **✏️** button in the sidebar turns add mode on or off. When it is on, every tap on the map places a point:

1. Press **✏️** (it lights up), then tap the spot on the map
2. Fill in the **Name** (required), the **Type** and, if you like, a **Description**
3. Confirm with **✅ Add**

**The type** sets the point's icon. Types are grouped into families — 🕳️ Shafts, 🪜 Access (**green = open, red = closed**), ⚠️ Signage, 🚨 Rescue — and the 🗺️ Legend shows them all. **— No tag (default) —** keeps the default icon. **➕ Create a new tag…** adds a type to your session: a short name in lowercase letters, digits, `_` or `-` (e.g. `fountain`); it uses the default icon.

### ✏️ Edit or reposition a point

On **your** points, the point's popup offers:

- **✏️ Edit** — reopens the window pre-filled (name, type, description, photos), then **💾 Save**. If you rename a point, its photos follow it.
- **📌 Reposition** — a banner "Click the new position for …" appears: your next tap moves the point there. The point keeps everything else (name, type, photos, level). **Cancel** in the banner gives up.

Both can be undone with ⏪ (`Ctrl+Z`). To remove a point: **🗑️ Delete this point**, in its popup (see 🧹 Erase and correct).

### 📸 Photos attached to points

Up to **5 photos per point**, kept on your device only. In the add or edit window, **📸 Photos** section:

- **📷 Take photo** opens the camera (mobile); **🖼️ From gallery** lets you pick several at once.
- Each photo is **compressed** (a photo of several MB then weighs a few hundred KB) and **cleaned**: the GPS position where it was taken, the date and the device model are removed before it enters the app.
- **Remove a photo**: the red ✕ on the thumbnail marks it for deletion, the green arrow ↺ cancels. Nothing is deleted before **💾 Save**.
- **Closing without saving** deletes the photos you had just added and cancels the deletion marks.

**Viewing them**: the point's popup shows the thumbnails — a tap opens full screen (pinch or mouse wheel to zoom, swipe to go to the next one, `← →` and `Esc` on PC). The **📸** counter in the top bar opens the session details.

**Taking them with you**: tick the 📸 photos box in ⬆️ → **🚀 Full**, **🎨 Advanced** or **🔄 Conversion**; each photo carries its point's card (name, position, level, type: enough to ♻️ recreate a vanished point). A re-imported file **adds** its photos to those on the device — a photo already there is not duplicated, and none is deleted. With **🛡️ Anonymize for public sharing**, each photo is renamed and linked to its point's anonymous code, without its card; a photo that cannot be cleaned is left out.

**📌 Photo "to assign"**: before v2.3.0, a photo was filed under its point's **name**. If several points share the same name, the app doesn't guess which one it belongs to: in the bubble of each of these points, the photo shows with a **dashed orange frame** and a **📌 Photo N: it's this point** button. Tap it in the right point's bubble. Nothing is ever deleted. Photos whose name belongs to a single point are assigned automatically, and the ones you take now follow their point even if you rename it.

**📸 My photos — and photos of a deleted point**: in the home screen's **🧰 Tools**, **📸 My photos** shows every photo on the device, map by map, grouped by point (tap = full screen). **Deleting a point does not delete its photos**: they move to the **⚠️ Without a point** group and are kept until you decide — **🔗 Attach** (to a point from the list, or **🗺️ Pick on the map** when the map is open; refused, with the number of free slots, if the point would go over 5 photos — nothing is changed then), **♻️ Recreate the point** (at its position, level, type and name; the map opens if needed), **💾 Save** (a ZIP on the device) or **🗑️ Delete** (after confirmation). **⏪ Undoing** a point deletion gives it its photos back. When a map's points cannot be read from the home screen (map missing or unreachable), its photos are **🔎 to check when the plan is opened** — never wrongly reported as without a point. When you open a map that has photos without a point, a discreet **📸 N photo(s) without a point** message offers to **View** them.

> ⚠️ Photos take up the browser's storage (from a few dozen to a few hundred MB depending on the device); a warning appears near the limit. On iPhone, the system may empty this storage when it runs out of space: export regularly. **💥 Reset everything** also deletes the photos, and deleting a photo cannot be undone.

---

## 🛣️ Draw paths

In the **🛣️ Paths** group:

- **🟩 Main road**, **🟪 Secondary road**, **🟨 Path**
- **🪜 Inter-level junction** — on a multi-level map only (see 🏗️ Multi-level mode)

Press a type, tap the map point by point, then press the type again (or **✅ Confirm the current path**) to finish.

### 📏 Total length of paths

**📏 Total distance** adds up the length of every path on the map — yours and those of the data layers, even hidden ones — with one box per type and, for each, the number of paths and their length. The total updates with each box, and the counted sections are highlighted in magenta. **✓ Close (keep highlight)** leaves the highlight on the map (press 📏 again to reopen, your boxes are kept); **❌ Clear highlight** removes it. This total stays on screen: it is not part of the image export.

---

## ⬛ Draw zones

In the **⬛ Zones** group, closed surfaces to annotate the map:

| Type | Look | Effect on the route |
|---|---|---|
| ⬛ **Backfill** | dark grey | none |
| 🟥 **Collapse** | red | none |
| 🟦 **Water** | blue | none |
| ⛔ **Inaccessible** | dark red / black hatching | **blocks** the way |

Press a type, place at least 3 points (dotted), then close the zone: **tap the first point again** (a circle surrounds it from the 3rd point on) or press **✅ Close the current zone**. Whatever order you draw in, water is shown underneath, then backfill, collapses, and inaccessible on top of everything.

### ⛔ "Inaccessible" zone — blocks the route

A ⛔ zone forbids the route from crossing it (recent collapse, deep water…): the calculation looks for another way, or fails and says so. It only blocks **its own level**, and still counts even if you hide the zones layer.

The **Respect impassable areas** box in the Route window (ticked by default) lets you relax it. **Rescue Mode** and "I'm lost" always respect it. For "avoid if possible", use the route's **🚫 Avoidance preferences** instead.

---

## 🏛️ Structures (pillars, walls, quarry faces)

For quarries: the load-bearing elements and the progress of the workings, in the **🏛️ Structures** group. They have no effect on the route.

| Type | Shape | Colour |
|---|---|---|
| 🟡 **1st-mass pillar** | closed surface | yellow |
| 🟠 **2nd-mass pillar** | closed surface | orange |
| 🔵 **Wall** (dry stone, masonry) | closed surface | blue |
| 🟨 **1st-mass quarry face** | line | yellow stroke |
| 🟧 **2nd-mass quarry face** | line | orange stroke |

Press a type, tap the points, then press the lit type again (or **✅ Close the current structure**): a pillar or a wall (3 points minimum) closes back onto its first point, a quarry face (2 points minimum) stays an open line.

On a multi-level map, **2nd-mass** elements are automatically placed **one level below the active level**; the others take the active level.

---

## 🧹 Erase and correct

The **🛣️ Paths**, **⬛ Zones** and **🏛️ Structures** groups each have a **🧹 Erase** button with the same choices:

| Choice | Effect |
|---|---|
| **↩️ Last point** | Removes the last point placed — to fix a missed tap without starting over |
| **✂️ Last path / zone / structure** | Deletes the object being drawn, otherwise the last finished one |
| **🎯 Select … to delete** | Tap the object on the map (or near its edge) to delete it |
| **🗑️ All paths / zones / structures** | Empties the whole family |

🪜 Junctions are erased like any other path.

**One specific object**: its popup has a **🗑️ Delete** button; for a point, it is **🗑️ Delete this point**. No confirmation window: everything can be undone with ⏪ (`Ctrl+Z`).

**The whole map**: when you reopen a map, the "Previous session restored" window offers **🗑️ Clear the session** (also at any time in **📊 Session details**) (points, paths, zones, structures, measurements and tracking trail; a copy stays in 📦 Backups). Points that carry a **link to another map** (portals) are kept: to remove one, delete the point itself. On a **map shared with your organisation**, the window makes you choose (nothing is ticked in advance): **↻ Cancel what this device has not sent yet (N changes)**, only if changes are waiting to be sent (offline, for example: online, everything leaves within seconds and comes back from the server), or, depending on your rights, **Delete my additions for the whole organisation** or **Delete everything for the organisation** (number of items shown first; these two cannot be undone for the others). An item whose author is unknown is never counted in "my additions": the window says how many there are, only "Delete everything" covers them.

> ℹ️ Only **your** objects can be erased. Those of the map or of a data layer are read-only: first open their layer for editing from ≡ **Filters**, then export the corrected layer.

---

## 🫧 An object's popup — note, convert, delete

A tap on **a path, a zone or a structure you drew** opens its popup:

| Item | What it's for |
|---|---|
| **Text area** | A free note — state of the passage, observation, reminder |
| **💾 Save note** | Saves the note and closes the popup |
| **🔄 Convert** | Changes the object's **type**, and if needed its **family** |
| **Level** | On a multi-level map: moves the object to another level (see 🏗️ Multi-level mode) |
| **🗑️ Delete** | Removes the object (in red, on its own row) |

An object from a data layer opens a read-only popup.

### 📍 A point's popup

A tap on a **marker** shows its name, type, note and these buttons:

| Button | What it's for |
|---|---|
| **📍 I am here** | Recalibrates tracking on this point and **confirms your position**: 🚨 Emergency exit and 🧭 Go there then start from here |
| **🧭 Go there** | Calculates a route from your position to this point |
| **➕ Route** | Adds the point as a stop on a route |
| **☆ Favorite** | Adds or removes the point from ⭐ Favorites |
| **🔊** | Reads the note aloud |
| **📋** | GPS coordinates to copy, if the map is georeferenced |
| **📸 Thumbnails** | The attached photos |
| **🌀 Links** | The inter-map links starting from this point |

On **your** points, **✏️ Edit**, **📌 Reposition** and, on a red row, **🗑️ Delete this point** are added.

### 🔄 Convert — change an object's type, or family

Typical case: on an imported survey, a **quarry face** is actually a **gallery**. The route is only calculated on paths: converting it into a path brings it into the calculation.

Only targets of the **same shape** are offered: a **line** (path, quarry face) becomes another line, a **closed surface** (zone, pillar, wall) another surface. The object keeps its geometry, its level and its note.

### 🎯 Convert several objects at once

In the conversion window, **🎯 Select several objects to convert** shows a banner:

- **tap an object** to add it (blue dotted), tap it again to remove it;
- **➕ All "type" on the displayed level** adds every object of the same type as the last one added;
- **✅ Convert (N)** opens the type choice for the whole batch; **Cancel** gives up.

The batch does not mix lines and closed surfaces (the banner refuses and explains why), but it can mix families: quarry faces and paths, all lines, become galleries together. Objects already of the right type are left as they are, and the final message counts them. A single `Ctrl+Z` undoes the whole batch.

---

## ⏪ Undo / Redo

Your **last 50 actions** on the map can be undone and redone:

- **`Ctrl+Z`** (`Cmd+Z` on Mac) undoes; **`Ctrl+Y`** or **`Ctrl+Shift+Z`** redoes;
- or the **⏪ History** group, at the bottom of the sidebar: **⏪ Undo** and **⏩ Redo** (greyed out when there is nothing to do).

A message at the bottom of the screen says what was undone or redone ("↩ Undone: Placing point …").

**What can be undone**: adding, editing, moving and deleting points; each point placed on a path, zone or structure, closing them, deleting them (including "All"); conversions.

**What cannot be undone**: deleting a photo, importing a session, position tracking, measurement.

The history is **forgotten** when you reload the page or change map, and a new action after some undos clears whatever was left to redo.

> ⌨️ On PC, **`?`** shows all shortcuts: `E` Editing, `M` Measurement, `Z` Zones, `S` Structures, `T` Tracker, `P` Paths, `L` Legend, `B` Compass, `R` or `Ctrl+K` Search, `F` presentation mode, `Esc` to close; in an open tool menu, `Tab` moves through the choices and `Enter` confirms. They do nothing while you are typing in a field.

---

## 📐 Distance and ♦️ area measurement

In the **📐 Measurement** group:

- **📐 Distance** — tap points; the total appears at the bottom left, with the length of each segment and the angles.
- **♦️ Surface** — tap at least 3 points; the area appears in m², then in hectares beyond 10,000 m².

The two measurements coexist: switching from one to the other does not erase them, and your next tap goes to the one that is lit. Their accuracy depends on the map's scale (calibrated in ⚙️ Settings). They are kept with your session.

**❌ Erase** offers **↩️ Last point** (on the lit measurement), **🗑️ The whole distance 📐**, **🗑️ The whole surface ♦️** or **Erase everything (📐 + ♦️)**.

---

## 🏗️ Multi-level mode (multi-storey quarries)

On a multi-level map, every point, path, zone and structure belongs to a **level**, and the route only goes from one level to another through a **junction** — never because two galleries cross on screen. Galleries are stacked in level order (level 0 above −1).

Numbering: **0** = reference level, **1, 2…** above, **−1, −2…** below.

### 🎯 The active level and the Levels modal

A **yellow pill** under the zoom buttons shows the **active level**. A tap opens the **🏗️ Levels** modal:

- **🎯 Active level (for drawing)** — everything you draw takes this level. **[ − ]** and **[ + ]** add a level below or above. Changing the active level **cancels the path in progress** and only shows that level.
- **👁️ Visible levels (filter)** — tick the levels to show (**All** / **Active only**). Unticking **0** also hides the map's main image, to look at one storey alone. The **🖼️ Show the base plan** box follows level 0 until you touch it; once ticked or unticked by hand, your choice wins (background kept under another storey, or removed even with 0 shown) and **Show all** sets it back to automatic (choice saved with the map's session; on a single-level map, it sits in **Image layers**). A junction stays visible if either of its two levels is.

If the map contains elements on other levels, the list extends by itself. The same settings exist in ≡ **Filters**. For image export, **🎨 Advanced → 🏗️ Levels to export** chooses the levels independently of what is displayed.

### 🔀 Changing an object's level

An object ended up on the wrong level? In the popup of a path, a zone or a structure you drew, the **Level** list (under 🔄 Convert) moves it at once; for a point, it is the **Level** list of **✏️ Edit**, saved with the rest of the form. The object's current level is always offered, even if it is outside the map's list. If the chosen level is hidden by the filter, the object disappears from the map and a message says so: the view stays on your level. **⏪** undoes it.

A junction has its own card, with its two levels (see below). No list on a layer object (🔄 Edit the layer first) or while a path is being drawn.

### 🪜 Drawing an inter-level junction

A junction links two levels at the real spot of the passage (stairs, slope, shaft, ladder):

1. **🛣️ Paths → 🪜 Inter-level junction**
2. Choose the **Start level** (your active level by default) and the **End level** (the route uses it both ways, but the first point you tap is on the start level), then **OK — Draw the junction**
3. Tap as many points as you like, then press **🪜** again to confirm

It appears in dotted magenta, with a dot at each end. **Without a junction, no route changes level.** Two staircases between the same levels = two junctions: the route takes the shorter one. It is erased like a path (🧹 Erase and correct).

**Its card**: tap a junction you drew (not while drawing) to open **🪜 Junction L0 ↔ L+1**: its **note** (💾 Save the note), the **Start (1st point)** and **End (last point)** lists with **🪜 Change the levels** (two different levels required; the route follows at once), and **🗑️ Delete**. **⏪** undoes each step. No 🔄 Convert: a junction stays a junction.

### ↕️ Stairs or shaft between levels (point)

A vertical passage **at a precise spot** (stairs, rung shaft, shaft without rungs) is placed as a point, with one of
the three types **Stairs between levels**, **Rung shaft between levels**, **Shaft without rungs between levels**
(group “↕️ Passages between levels” of the legend). The drawn junction stays for gentle slopes.

1. Place (or edit) the point and choose its type: the **↕️ Levels served** block appears
2. Tick the levels the passage connects (the point's own level is always ticked)
3. For each level, the app suggests the galleries within **5 m** (50 px on a map without scale, and it says so):
   **tick the one the passage opens onto**. Nothing is confirmed for you; a level with no nearby gallery is reported
4. Save

The point is shown on each of its levels. Its card lists its levels and connections, and draws them in dotted magenta
while it is open. **Routes only use confirmed connections.** The passage counts as **10 m per level for stairs, 20 m
for rungs**; if level depths are entered, the real depth difference is used. Guidance says “go down to level −1 **by
the ladder**”. A **shaft without rungs** is only used if you tick **🧗 Team equipped (rope)** in the Avoidances of the
route window.

🔒 These passages are **never** suggested as emergency exits nor counted as surface accesses in Rescue mode. A rung
shaft or service staircase **that reaches the surface** keeps its type (Open rung shaft, Open service staircase) and
can also tick several levels: it stays an exit.

### 🛠️ On the map creator's side

Multi-level mode, the level of each image layer and that of the elements in data layers are set by the map's creator in the Generator (see 🔭 Going further › 🏗️ Create or modify a map). On a map that has not enabled it, none of this appears; if enabled later, existing elements are on level 0.

---

## 📔 My outings and my data

### 💾 Automatic saving

Your annotations (points, paths, zones, structures, measurements) are saved on their own in the browser, on every change, **separately for each map**: coming back to a map you left brings back what you had left there.

When you reopen it (**▶️ Resume** on the home screen), a window sums up what was restored (“3 points · 1 path · 2 zones”) and offers **🗑️ Clear the session** (start this map from scratch) or **✓ Continue**. Esc or a click outside = Continue.

- The tracker's trail is not restored: restart tracking and reposition yourself.
- To keep a session aside, or move it to another device: **⬆️ Export → 💾 Full export** (see “⬆️ Save and share”).

### 📔 My logbook — the history of your outings

Automatic saving keeps a map's **state**; the **logbook** keeps its **history**: every time you use a map it becomes an **outing**, with its date, duration, distance covered, what you added, the trace of your movement (mini-map), the photos taken during the outing and a free note you can write whenever you like. Clearing a session does not touch outings already filed.

**Where to find it:** the **📔 My logbook** tile in the “🧰 Tools” card of the home screen, without loading a map. From a map: **📊 Session details** → **📔 Trip in progress** section, with the **📔 Start an outing**, **🏁 Close my trip** and **Refine track** buttons.

**🚶 Field trip or 🖥️ desk work?** The app tells them apart on its own:
- you **moved** (tracker, or a single **📍 I am here**) → **field trip**;
- you only **annotated without moving** → **desk work**, filed separately at the bottom of the logbook.

The logbook totals (outings, time, distance) only count field trips. The app got it wrong? Open the record → **Mark as field trip** (or **Mark as desk work**); the same 🚶 / 🖥️ buttons are in 📊 Session details. Your correction is never recalculated.

**When is an outing filed?**
- **Automatically**, when you leave the map: it is first **paused for 2 hours** (see “Resume” below), then filed if you covered **at least 50 m**, **or** worked **10 minutes** with at least one addition. Below that, nothing is kept: opening a map for 20 seconds does not clutter the logbook.
- **By hand**, with **🏁 Close my trip**: it is filed unconditionally and a new one starts. Handy to split a day into stages.

The **📔 Keep a logbook of my outings** switch is in **⚙️ Configuration** (home screen), on by default. Unticked, nothing opens on its own any more; you can still start an outing with **📔 Start an outing**.

#### 🏁 The distance when the pedometer saw nothing

With the phone in your pocket, the pedometer counts little. Each **📍 I am here** leaves a **timestamped marker**, and the app links these markers **by following the galleries** (not in a straight line): from A to C then from C to B, it counts A→C then C→B.

- During the outing, the figure is **cautious** (as the crow flies), so that “I am here” stays instant. The calculation through the galleries is done when the outing is filed: the distance **increases** at that moment. On a very large map, the app may keep the straight-line figure rather than freeze.
- **Refine track** runs this calculation whenever you want, and redraws the route in the record. On a very large map, the app warns that it will freeze for a few seconds and lets you decide.
- When you close the outing, the app asks **where you came out**: one click on the map and the last leg (after your last marker) enters the total. **Skip** if you are closing from home.
- If the pedometer measured between two markers, it is the one that counts, never both. A click on the map to correct your position, or crossing a link to another map, does not count as a journey.

The record tells you where the figure comes from:

| What it says | What it means |
|---|---|
| *of which 900 m calculated through the galleries between 6 markers* | Route rebuilt on your paths: reliable |
| *of which 900 m as the crow flies between 6 markers (not refined)* | Straight line: **underestimated**, sometimes by a lot |

> ⚠️ It is a **reconstruction**, not a survey: the app assumes the shortest route between two markers. Detours, dead ends and U-turns are underestimated. The redrawn route only appears in the record: your exports and the heatmap keep the trace actually recorded. Without any “I am here”, only the pedometer is left.

#### ⏱️ The duration of an outing

A **field trip** is counted **from start to finish**: phone in your pocket or app asleep, the time counts. Just below, the record gives the **time the app was open**: *3 h of outing for 12 min of app* means a pedometer that saw almost nothing. A **desk work** session keeps the usage time.

You forgot **🏁 Close my trip** when you came out? The app took the last moment it was active, often when the phone put it to sleep. Open the record → **✏️ Fix the end** and enter the real time: the duration is recalculated. The time the app was open does not change, and an end earlier than the start is refused.

#### 🔁 Interrupted outing: resume and merge

- **The phone closed the app** (a call, another app): if you come back to the same map within **45 minutes**, the outing **continues** instead of opening a new one. A message tells you so.
- **You open another map on the way**: your outing is **paused**. Come back to its map within **2 hours** and it resumes, counters and trace included; the time spent elsewhere counts in its duration. Tracking, however, stops when you change map: on resuming, the app offers **▶️ Restart tracking**.
- An outing you **closed yourself** is never resumed.

To join outings that were already split: **📔 My logbook → 🔗 Merge outings**, tick them (at least 2) → **Merge**. Durations, distances, steps and additions are added up; the duration runs from the start of the first to the end of the last; notes are stacked; photos and traces are combined; if a single piece was a field trip, the whole is.

> ⚠️ **Irreversible**: the original outings disappear. The app asks for confirmation.

#### 📖 The Stories tab

The logbook's second tab, **📖 Stories**, gathers the notes and PDFs of the **History Mode** of **all your maps, without loading any of them**: the note is shown formatted and can be **edited in place** (it is the same note as in the map), PDFs open, can be deleted (🗑️) or added (**➕ Add a PDF**). A PDF supplied in a map's ZIP appears here as soon as you have opened that map once.

**Good to know:** everything stays on your device; each outing can be deleted from its record; beyond **500 outings**, the oldest are deleted; the logbook travels with the profile export.

### 📊 Session statistics

At the top of **📊 Session details** (header of the screen, or the 📊 chip on mobile):

| Stat | Content |
|---|---|
| **Total** | Points + paths + zones + structures, with the breakdown by type |
| **Distance** | Combined length of the paths (in km beyond 1,000 m) |
| **Area** | Combined area of the zones (in ha beyond 10,000 m²) |
| **Photos** | Photos attached to points |
| **Duration** | Time elapsed since the map was opened |

On a multi-level map, a breakdown by level is added. **Copy** puts a text summary in the clipboard (for a message to your partner); **Export as TXT** downloads it.

### 👤 Profile

The **profile banner**, at the top of the home screen, shows your **avatar** (your photo, or your initial on a colour that stays the same as long as your nickname does), your **nickname** (editable) and one to three statistics. A tap opens the **👤 Profile** window: nickname, photo, **🖼️ Home wallpaper**, your **rank** and your **🏆 Achievements**.

#### 📊 Your statistics

- **Counters**: maps, sessions, favourites, session backups (10 at most per map, the oldest go), photos, and space taken by your MyKTAMap data.
- **📊 My maps**: a table, map by map, of points, paths and distance (in m or km if the map is calibrated), with a total. It fills in one map after another to spare memory. A map marked ⚠️ has not been opened yet: only its annotations are counted; open it once to complete its row.
- **📊 Breakdown by category**: pie charts across all maps (points by icon, paths, zones, structures by type). They show the original names of the types: a renaming done in a map's legend stays visible in that map's own statistics. Same rule as above: a map never opened only counts its annotations.
- **🏷️ Tag filter**, above the pie charts: one click keeps the maps carrying the tag, a second excludes them, a third resets; all the pie charts follow, and exclusion wins. The “Maps by tag” pie chart shows what you still have to tag. The filter resets each time you open the window.
- A custom type shown by an identifier (`cust-…`)? Open its map once, or tap **🔎 Find the names**: the app reads your maps without opening them one by one, after your consent; the names found are kept.
- **🎨 Home banner stats**: choose 1 to 3 stats among ⏱️ Total time, 💾 Storage and 🗺️ Plans visited, among others (by default: time and storage). The banner follows at once.

#### 📤 Exporting and importing your profile

In the Profile window, **📤 Export my profile** produces a file that carries everything to another device: map list and folders, preferences, favourites, sessions, backups, logbook, identity. You tick the sections; the estimated size is shown. The access code and the PIN are never exported.

- **History Mode PDFs**: unticked by default, because one map can carry up to 100 MB of them. Ticked, they are put back in place on import, with no duplicates if you import again.
- **Map archives**: tick the stored maps to take along (nothing is ticked by default); the export becomes a “full profile” `.zip` and the import attaches each archive to its map. Beyond about 50 MB on iPhone/iPad (500 MB elsewhere), the app asks for confirmation. If the browser deleted an archive, the export tells you which ones are missing. Maps in “re-select” mode are not listed: their ZIP is on your disk, not in the app.
- **An organisation's maps (☁️)**: neither they nor their sessions, photos, favourites or backups go into the file, and an imported profile restores none of them (the import summary says how many were ignored): you get them back by signing in to the organisation.

**📥 Import a profile** lets you choose the sections and the mode: **🔄 Merge** adds without overwriting (recommended), **♻️ Replace** first empties the ticked sections. In Merge, a map that already has its archive on the device keeps its own. Only the preferences an export produces are taken back: a file edited by hand cannot set any other setting. A reload of the app is offered at the end. On an installation that only offers its server's maps, profile import is refused (it could hide those maps); export remains possible.

---

## ⬆️ Save and share

Every export starts from the **⬆️ Export** group of the sidebar: it opens a tile launcher in four parts — **🖼️ Image**, **💾 Session**, **🗺️ Map** (🔄 Update the map, above), **🌍 External export**. Before sharing an image, a PDF or a KMZ, check that it reveals nothing sensitive (entrances, private site).

### 📤 Exporting your session

**⬆️ Export → 💾 Session** offers two tiles:

- **💾 Full export** — the whole session in one file, to import again later: points, paths, zones, structures, measurements and tracker data (position, trail, timeline: replay works after re-import). `.json`, or `.zip` if you tick the photos. The **🛡️ Anonymize for public sharing** option replaces names with codes and removes the tracker data.
- **🎨 Advanced export** — you choose: points (by icon, including “no tag”), paths, zones and structures (by type), measurements, tracker (a counter shows what it holds). Output as a **📄 Single session file** that can be re-imported, or a **📦 Multi-file ZIP** (one per category).
- **🔎 Keep only** (at the top of both) — limits points, paths, zones and structures to a **period** (date of their last change) and, on a connected installation, to their author (**Created by**); a counter shows how many go out. On another account's ☁️ map, export is still possible but limited to **your** additions: “Created by” is set to you. Tracking, measurements and notes are exported as they are.

### 🖼️ Exporting as an image

**⬆️ Export → 🖼️ Image (PNG / JPEG)**, two modes:

- **⚡ Quick export** — everything visible (map, layers, annotations, tracker), as PNG at the original resolution. One click on **Download**.
- **🎨 Advanced export** — you tick the image layers, the data layers and your annotations, and you set:
  - a **legend** placed on the map: position (one of the 4 corners, or 🎯 anywhere), style (Opaque / Semi-transparent / Watermark), size (Compact / Standard / Large), content (icons, paths, zones, tracker tag, the map's name, version, author and date); its labels can be customised;
  - the **format**: PNG, or JPEG (lighter);
  - the **resolution**: Original, ½ or ¼. The app pre-selects the largest that stays reasonable and shows the size and memory needed; on iPhone/iPad, impossible resolutions are greyed out, and when even ¼ is too large for the iPhone, a **📱 iPhone max** choice (the largest possible image) is selected by default; the size shown is the size of the image produced.
  - A preview updates live.

### 🖨️ Exporting as a printable PDF

**⬆️ Export → 🖨️ Printable PDF**: a PDF to print for the field, to send to someone without the app, or to archive.

- **Format**: A0 to A4, portrait or landscape (A4 landscape by default).
- **Content**: your annotations, the map image and its layers, the data layers, a header (title and map information).
- **Quality**: Standard ×1 (A3/A4), High definition ×2 (A0/A1, heavier file), Draft ×0.5. A0/A1 at ×2 can take 30 to 60 seconds on mobile. If the image is larger than the device can produce, the resolution is reduced and the app tells you which one you get.
- **🗺️ Legend** placed in a corner (bottom-left by default), in three sizes and four styles: **Pro (white background)** for printing (default), Dark opaque, Dark semi-transparent, Subtle watermark. It only lists what actually appears on the exported map.

The PDF carries the line “Généré par MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr” and is named `<map>_<date>.pdf`.

### 🛰️ Exporting as a georeferenced GeoTIFF (GIS)

**⬆️ Export → 🖼️ Image → 🛰️ Georeferenced GeoTIFF (GIS)**: the map as a georeferenced image. Opened in **QGIS** (or any GIS), it lands in place by itself, with nothing to type again.

- **Content**: **Scan only** (the clean background, to draw over in a GIS) or **Scan + drawings** (like the image export: visible layers, points, paths, zones, structures).
- **Projection**: **WGS84** (latitude / longitude, by default) or **Lambert 93** (the GIS reference in France).
- **Resolution**: Original, ½ or ¼; the window states the size of the image produced. On a phone it is capped at 64 Mpx (for the full resolution of a large map, export from a computer); impossible choices are greyed out and a **Max** choice appears when needed.
- **The map must be calibrated** (GPS georeferencing, see “⚙️ Settings” or the KMZ export): otherwise the **Download** button stays greyed out and the window explains what to do.

The file is named `MyKTAMap_<map>_<date>_L93.tif` (or `_WGS84.tif`). A large map takes time: the button shows the progress.

### 🌍 Exporting to another app (KMZ, GPX, GeoJSON)

**⬆️ Export → 🌍 External export** (**KMZ**, **GPX** or **GeoJSON** tile) produces:
- a **KMZ**: your map and annotations placed on the globe, for **Google Earth**, **OsmAnd**, **Locus** or **Avenza**;
- a **GPX**: points and paths, for TopoDroid, OsmAnd, Strava… and re-importable into MyKTAMap with its levels;
- a **GeoJSON**: your objects for **QGIS** or any GIS, with their type, label, name, level, note and colour.

**The map must be georeferenced**: two points whose GPS coordinates you know. The fields are pre-filled with the map's georeferencing (see “⚙️ Settings”) and are saved for this map. While you type, a **🌐 Corners preview** gives the position of the 4 corners, the scale, the rotation, and a **🔗 View center on Google Maps** link to check.

KMZ content:
- **🖼️ Map image**, with an adjustable **opacity** (60% by default) to see the satellite background through it. A very large image is reduced automatically; if that is impossible, the app asks you before exporting. For a **tiled** map, **Large images (Google Earth mobile)** (ticked by default) packs the map into a few large images — what Google Earth can display on a phone — with a **sharpness** of your choice: 1 image, 4 (default) or 16 (sharper, heavier). Unticked, the export keeps the tiles, sharp when zoomed, for Google Earth on a computer.
- **📍 Points** (by icon), **🛣️ Paths**, **⬛ Zones** and **🏛️ Structures** (by type), **🪜 Inter-level junctions**, **🗺️ Active route**, and on a multi-level map, the **🏗️ levels** to include (all by default, one folder per level).

So you can export only the shafts, or only the inaccessible zones. **Download** produces `MyKTAMap_<map>_<date>.kmz`.

> 💡 The projection is faithful on a regular map; a stretched or assembled map may drift at the edges. A **point C**, in the map's georeferencing, corrects this kind of distortion.

The **GeoJSON** uses the same boxes as the KMZ (points by icon, paths, zones and structures by type, junctions, route, levels), without the image. Choose the **projection**: **WGS84** (by default; the GeoJSON standard, for a website or a strict tool) or **Lambert 93** (the file ends in `_L93.geojson` and QGIS places it by itself).

---

## ⬇️ Load / Import

### 📥 Importing a file (session or GPX)

**⬇️ Load / Import** opens the file picker directly; the app recognises its type.

- **MyKTAMap session** (`.json`, or `.zip` with photos): it **replaces** your current session (points, tracks, zones, measurement); its photos, however, are **added** to yours, without deleting any. A preview shows what it holds; a backup of your current session is taken just before. **Import** to confirm, **Cancel** to change nothing.
- **GPX file** (TopoDroid, OsmAnd, Avenza, Strava, Garmin…): its points and paths **are added** to your session. The map must be georeferenced. A preview comes before the addition, and **Ctrl+Z** undoes it.

To change map, tap the **compass rose 🧭** (back to the home screen) or the **map title** in the top bar; your session is saved before the switch. Going back to the home screen **closes the map** to give its memory back to the device (tracking stops): **▶️ Resume** reopens it where you left it.

---

## ⚙️ My maps and settings

### 📚 Your map list

The home screen keeps every map you have loaded, from a server or from your device. Tapping the row loads the map.

| Symbol | Meaning |
|---|---|
| 🌐 | Map offered by the server |
| 💾 | ZIP map loaded from your device |
| ✅ | Map **stored in the app**: instant reload, even offline |
| 📁 | Map not stored: its ZIP must be re-selected at each load — the **💾** on its row stores it afterwards |
| 🔐 | Old “permanent access” entry: at the next re-selection, it becomes ✅ |

Storing is set in **⚙️ Configuration** (“💾 Store the map in the app on first load”, on by default).

**On each row:**
- **💾** (📁 map not stored): asks for its ZIP again, checks it is the same map and stores it, without opening it.
- **⭐** pins the map at the top of the list (click again to unpin).
- **ℹ️** opens the map's record: its information (version, author, size, mode, dates…), a local **✏️ display name** (40 characters, empty = original name), its **🏷️ Map tags** (comma-separated, 12 at most), the **Tiling for this map** for very large images that were not split, the **💾 Offline availability** of a server map, and **🗑️ Remove from list**. Removing a map does not touch the ZIP on your disk, but deletes its stored archive, its session, its georeferencing, its photos and its backups; its history PDFs stay in 📔 My logbook → 📖 Stories, unless you tick their deletion.

**Above the list:**
- **🔎 Filter by name…** filters as you type.
- **🌐 Show site maps** hides or shows again the maps placed on the site (nothing is deleted, the choice is kept).
- As soon as a map carries a tag, **filter chips** appear: tap one or more to see only those maps.

> 🌐 A server's maps may arrive already tagged. As soon as you edit a map's tags, yours are the ones that count, even empty. To get the server's tags back, remove the map from the list: it will be rediscovered with them.

#### 📁 Sorting your maps into folders

To the right of “📚 My maps”, the **All | Folders** selector. In **Folders** mode, create your folders (➕), each with a colour shown as a dot in front of the map's name. A map is in one folder only; the others go to “Unsorted”.

- **Sorting**: **☑ Select** one or more maps then “Move to…”, or **drag** the row onto a folder (with the mouse, or with a finger after a long press).
- **⋮** on a folder: rename, colour, order, delete (its maps go back to Unsorted, no map is ever deleted).
- **🏷️ Tag rule** (in ⋮): the folder takes in by itself the maps carrying those tags. In All mode, ticked chips offer **📁 Create a folder from these tags**. Sorting by hand wins over a rule; the dot is **filled** for an explicit placement, **hollow** for a rule.
- Folders travel with your profile. A server may offer some: you can neither rename nor delete them, but you can put whatever you like in them. Importing several maps offers “Put in:”.

#### 💾 Making a server map available offline

A **stored** map already works offline. A **server** map does not: only what you displayed is kept, with no guarantee, and a large map may come back **full of holes**. In its **ℹ️** record, **💾 Offline availability** section, **⬇️ Make available offline** downloads everything (image, data, all tiles at all zoom levels) into a space that survives app updates.

| What you see | What it means |
|---|---|
| **Not downloaded** + ⬇️ | Only what you displayed is kept, with no guarantee |
| **✅ Available offline** + ↻ / 🗑️ | Everything is there; **↻ Update** replaces the download button |
| **⚠️ Incomplete download** + ⬇️ | Interrupted, or files cleared by the browser: complete it |
| **✅ Available, but some files could not be found** + ↻ | The server did not provide some files; the app lists them, the map stays usable |

When the record opens, the app checks whether the server has changed: **⚠️ Update available**, **✓ Up to date**, or **Cannot check** (offline). It never says “up to date” without having checked, and if the browser has cleaned up, it offers the download again.

### ⚙️ Configuration (home screen) — the whole app

The **⚙️** button at the top of the home screen opens **⚙️ Configuration**: the settings that apply to **all your maps**. Each section folds with a tap on its title (on a phone, only the first one starts open); your choice is kept.

- **🌍 Application** — the **language**: Français, English, Español. It applies at once, guide and tutorial included; the flag in the 📖 Documentation window changes the language of the guide only. It can also be chosen on the unlock screen, and is kept in incognito mode.
- **🎨 Display**:
  - **📐 Scale icon size with zoom** (on by default): on the plan, and also in the OSM view and the home screen OSM map;
  - **❓ Help button inside windows** (on): a ❓ in the title of windows that have a help page, which opens the right page directly;
  - **🔔 Notifications**: **All**, **Essential** (default: no more messages confirming something you just did) or **Silence** (only what matters: low battery, sensor refused, errors). Server alerts and windows waiting for a decision are never muted;
  - **➕ Zoom +/− buttons on maps**: shows the + and − buttons on the plan, the home OSM widget and the OSM view. Off by default: zoom with your fingers (pinch) or the mouse wheel;
  - **🪟 Anchor tool panels to their button**: the Paths, Zones and Structures panels open next to their button instead of centred (comfortable on a large screen, not recommended on a phone);
  - **🧲 Snap while drawing** and its distance: a click close to an existing point snaps onto it, so that your galleries really join;
  - **☀️ Light theme**;
  - **🔆 Keep screen on** while the app is open. The tracker also offers to turn it on when it starts.
- **🧩 Optional features** — Replay, Heatmap, battery and vibration, all off by default: see “🔭 Going further”. This is also where **🕵️ Incognito mode** lives: it opens a new window where nothing is saved (not available on an installation linked to a database, whose server records what you do).
- **🔒 Privacy & security**:
  - **📔 Keep a logbook of my outings** (on, see “📔 My logbook”);
  - **💾 Store the map in the app on first load** (on);
  - **🔐 Local access code** (PIN, Face ID): see “🔭 Going further”;
  - **🔒 Privacy & Audit**: **📋 View the network log**, **📖 What does the app do on the network?** and the **🗺️ OSM view** box (see “🔴 Important warnings”) — the app sends none of your data; the only outside site it contacts is OpenStreetMap (the OSM View's background map), which this box turns off, and the network log shows it to you;
  - **📚 Site maps**: **🚫 Don't load the site's maps on startup**, if you only use your own maps (after a reload, they disappear from the list and the statistics).
- **🛠️ System & maintenance**:
  - **🛠️ Developer Mode** (password-protected): see “🔭 Going further”;
  - **📊 View memory state**: what the app takes up on your device, with **📋 Copy the report** to report a problem;
  - **🆘 Troubleshooting**: a window that lists, from the gentlest to the most radical, **🔄 Force the update**, **🆘 Open the Kill SW tool** (SW = *Service Worker*, the part of the app that keeps it stored for offline use) and **💥 Reset everything** — see “🆘 Troubleshooting”.

### ⚙️ Settings (in map mode) — this map

The **⚙️ Settings** button in the sidebar opens the settings of the **open map**. Each group states its scope — **📍 this map** or **🌍 all maps** — and collapses with a tap on its title.

#### ✓ Everything is saved as you change it

No Apply button: every field is saved at once (a green flash confirms it). An out-of-range value turns red, the message gives the bounds and the previous value stays. **Esc**, **✕** or **Close**: nothing is lost.

- **🌍 Application** — **Enable presentation mode** (full screen with no interface; **F** key on PC; exit with **F**, **Esc** or the floating ✕). **🏠 Set from the home screen** shows the ⚙️ Configuration settings read-only, with a button to go there (your session is kept).
- **📐 Map: scale & geolocation** *(this map)*:
  - **Scale**, with **🎯** to calibrate it (see below);
  - **🧭 North calibration**, if the top of the map is not North: an angle, or **📐 Calibrate (2 clicks)** (South then North on the map), **↺ Reset** to go back to 0. The compass always shows true North;
  - **🌐 GPS georeferencing**: its state is shown (not georeferenced, points A and B, A, B and C, B estimated) and **🌐 Open georeferencing…** opens its window. For points A and B: **🔍 Search a point** or **📍 Click on map** fills in the position on the map, then you paste the GPS coordinates in Google Maps format (`48.856600, 2.352200`). Pick them **far** from each other. **Estimate B** deduces B from A, the scale and North: an estimate, to be checked in the OSM view. The **📐 Point C (optional)**, far from the A-B line, corrects a distorted map (stretched assembly) for the OSM view, the exports and Rescue Mode. **💾 Save calibration** / **🗑️ Clear**. This georeferencing is used by the OSM view, the KMZ, GPX, GeoJSON and GeoTIFF exports and GPX import.
- **📍 Navigation & tracker** *(📍/🌍 per line)*:
  - **🧭 Tracker start position** *(this map)*: X/Y, **🔍 Pick via a point** or **📍 Click on the map**. Changing the start restarts tracking from there (the current trail is cleared);
  - **👣 Step detection** *(all maps)*: step length (0 to 1.5 m), threshold (10 to 30), delay (300 to 3,000 ms);
  - **🧭 Smart navigation** *(this map)*: see “🔭 Going further”.
- **🎨 Display** — **🎨 Background under the map** *(this map)*: black, white or neutral grey under the transparent parts of the map (default: the one the map suggests, otherwise per theme); the image export uses it; **⚪ Show circles at intersections** *(this map)*; **🎤 Voice commands (BETA)** *(all maps)*: a 🎤 button to drive the app by voice, say “help” for the list of commands; available in French only: the button only appears when the app is in French. An option your browser does not support stays visible, greyed out, with the reason.
- **🚀 Performance** *(this map)* — **🚀 ULTRA mode** for large maps that crash the phone (see “🔭 Going further”); on a multi-level map, **🏗️ Show every level at launch**.
- **🧩 Optional features** — the same boxes as in ⚙️ Configuration (options, incognito mode). Privacy is set in ⚙️ Configuration on the home screen.
- **🛠️ System & maintenance** — the map's **performance mode**, read-only.

At the bottom, **↺ Default values** (after confirmation) puts this map back to its original values (scale, start, smart navigation, circles, North), step detection back to the app's values, and moves tracking back to the start. The home screen settings do not change.

#### 🎯 Calibrating the scale

The app shows 100 m where you know there are 150?

1. Measure the distance with **📐**.
2. **⚙️ Settings → 🎯** next to the scale.
3. Enter the displayed distance (100) and the real distance (150): the new scale is shown.
4. **Apply**: it is saved at once.

The longer the measured distance, the more accurate the result.

---

## 📚 Help and documentation

### 🎓 Replaying the tutorial

The welcome tutorial can be replayed at any time: **📖 Documentation** → **🎓** button in the title row, next to the language selector.

### 🔎 Searching the documentation

At the top of the 📖 window, the **🔎 Search** field searches the whole text: results are highlighted, **Enter** or ↓ goes to the next one, the counter shows “i / n” and the table of contents fades the parts without a match. Accents do not matter: “reglages” finds “Réglages”. The search in the **❓ Help** window (📚 group) looks through the titles and content of the help pages.

### 🤖 AI Help

In **📖 Documentation**, the **🤖** button (title row) downloads a `.md` file describing everything the app does: this guide, an FAQ and instructions for the AI.

1. **📥 Download the context (.md)**.
2. Open the conversational AI of your choice (ChatGPT, Claude, Gemini, Le Chat…) and attach the file at the start of the conversation.
3. Ask your questions: *“How do I add a point?”*, *“My map crashes, why?”*.

The file only contains the documentation, none of your data: you can share it. The AI itself may be paid, depending on the service.

---

## 🆘 Troubleshooting

### 💥 The app stops abruptly

On a phone, the system closes apps that use too much memory. At the next launch, a red window **“WARNING — ABRUPT SHUTDOWN DETECTED”** explains it. To keep it from happening again:
- close other apps and unneeded tabs;
- turn on **🚀 ULTRA mode** for this map (**⚙️ Settings → 🚀 Performance**);
- export your session regularly;
- if it keeps happening on the same map, the map must be **split when it is generated**: ask its creator.

### ⚠️ A map does not load

A **“⚠️ Plan not found”** window means its data is no longer reachable: browser cleared or storage full, list imported from another device without the ZIPs, browser change, map removed from the server. Three choices:
- **🔄 Retry** (server map temporarily unreachable);
- **📁 Re-select the ZIP** (local map): if it was stored, it is stored again;
- **🗑️ Remove from list**, if you no longer have the map.

A ZIP refused when loading is probably incomplete or damaged: ask its creator for it again. A map may also have been **revoked** by its author: see “🔭 Going further → 🛡️ Revoked plans”.

### 🔍 The map image is blurry

On a very large map that was not split, the app shrinks the image so it fits in memory. For a sharp image, the map must be split when it is generated: ask its creator.

### 🧭 The tracker drifts too fast

Reposition yourself often (**📍 I am here**), check the scale (🎯 above) and the step length (**⚙️ Settings → 📍 Navigation & tracker**).

### 🔘 A mode stays active

Tap the active button (in green) again to turn it off.

### 🔑 The password is refused

On first launch, MyKTAMap simply offers **Continue**: no code is asked. Only an installation with its own password (association, club, myktamap.fr) asks for one: **that password** is the one you need, and a pro licence does not replace it. If the installation changes it, the app asks for it again at the next start; offline, your access stays valid.

### 🔄 The app does not update, or stays stuck

In this order, keeping your data:
1. **⚙️ Configuration → 🆘 Troubleshooting → 🔄 Force the update**: downloads the app again without touching your maps, sessions, preferences or codes. A connection is needed.
2. If the app stays stuck (blank page, unformatted home screen): check your connection (turn off your VPN, change network), then **⚙️ Configuration → 🆘 Troubleshooting → 🆘 Open the Kill SW tool**.
3. If the app does not even open: open the **rescue page** in a private tab of the browser (not the installed app): **https://myktamap.fr/killsw.html** (its address is also shown at the bottom of the 🆘 Troubleshooting window). It clears the app's cache **without touching your data** (maps, sessions, photos) and offers **🚀 Reload the app**.

These tools delete **no** data (stored maps, sessions, photos, logbook, preferences). As a precaution, **📤 Export my profile** first.

### 💥 Reset everything

**⚙️ Configuration → 🆘 Troubleshooting → 💥 Reset everything** puts the app back as on a first launch. **Irreversible**: it deletes your map list and their archives, your sessions and their backups, the photos, the logbook and history PDFs, your profile (rank, achievements, avatar, wallpaper), Rescue Mode scenarios, your preferences, your PIN, and the app itself (to be downloaded again).

- The first window offers **📤 Export my profile first**.
- If your installation has its own password, it warns you that it will be **asked again at restart**: make sure you know it before confirming. Otherwise, the app will simply offer **Continue**.
- Two confirmations are required. Do it **with a connection**: if you are offline, a red window warns you that the app will be unusable until the network is back.

Not to be confused with **↺ Default values** in ⚙️ Settings, which only touches the settings of the open map.

### ✉️ Problem not solved

Write to **contact@myktamap.fr**: what you were doing, your phone and browser, and a screenshot if possible (the **📊 View memory state** report helps too).

---

## 🔭 Going further

This chapter gathers what you don't need every day: the **features that are off by default** (turn them on if they help you), the **Rescue Mode**, the tools **for map creators**, then **hosting and administration** (server, pro license, revoked maps, diagnostic logs).

### 🧩 Optional features

Four secondary features are **off by default**, to keep the app light. You turn them on in the home screen's **⚙️ Configuration**, group **🧩 Optional features**, or in **⚙️ Settings** once a map is open: it is the same setting, and it applies to **every map**.

| Option | What it adds |
|---|---|
| **🎬 Tracker replay** | The 🎬 tile in the 🧭 Tracker menu: replay your tracking session |
| **🔥 Heatmap** | The 🔥 tile in the 🧭 Tracker menu: a map of how often each place is walked through |
| **🔋 Battery level** | The remaining charge at the top of the screen, and an alert at 20%, 10% and 5% |
| **📳 Haptic vibration** | A short vibration that confirms some actions |

> ⚡ Replay and Heatmap appear or disappear the next time you open the 🧭 Tracker menu. The battery setting takes effect at the **next launch** of the app.

#### ⛔ "Sensor refused"

If battery or vibration is **greyed out** with "Sensor refused by iOS" or "by this device", **your system does not give that sensor to web pages**. Apple provides neither vibration nor battery level to a website, even one installed as an app.

#### 🎬 Tracker replay

The **🎬** tile in the **🧭 Tracker** menu opens a full-screen window that **replays your tracking session**: the yellow marker walks your route again and the trail grows as it goes.

- **Controls**: time slider, ⏮ ▶️ ⏸ ⏭, speed from 0.5× to 10×. On ▶️, the window shrinks to the bottom of the screen so you can see the map (the **⛶** button switches back).
- **Keyboard**: Space = play / pause · ← → = back / forward one second · Esc = close.
- **📤 Export CSV**: a time-stamped table of positions (start, every step, every recalibration, and the level on a multi-level map), readable in a spreadsheet.
- A recalibration is a jump: no line is drawn between the old and the new position.
- The replayed session is **not kept**: it starts from zero when you reload the app or change map.

#### 🔥 Heatmap

The **🔥 Heatmap** tile in the **🧭 Tracker** menu colours the map by how often places are visited: **red = busy, blue = rarely explored**. The scale adapts to the map by itself.

- **Sources** (combinable): the tracker route, your session points, paths, zones and structures, and the map's data. Recalibrations, starts and pauses longer than 5 min produce no heat.
- **Radius** and **Intensity** are adjusted live: if everything is pale, raise the intensity; if everything is red, lower it.
- On a **multi-level map**, a **🏗️ Levels to include** row lets you keep only some of them (visible levels are pre-ticked): handy for comparing two floors.
- Uses: spotting the routes that are really used, or the under-mapped sectors to revisit in the field.

The heatmap is **purely visual**: it changes neither the map, nor your annotations, nor the exports. Close the window to hide it.

> 🚑 The **Rescue Mode** keeps its own activity heatmap, whether this option is ticked or not.

#### 🔋 Battery level

The indicator appears at the top of the screen (`⚡ 78%` while charging, `🪫 23%` while discharging, colour depending on level) and in the **XL emergency display**.

| Level | Alert |
|---|---|
| 20% | Message: consider Performance ULTRA mode to save power |
| 10% | Message: enable ULTRA and consider stopping the tracker, whose sensors are power-hungry |
| 5% | Red window **🪫 Critical battery**: save your session, note your position, consider heading back up |

Each alert shows **only once** per discharge; they reset when you put the phone back on charge.

Only **Chrome, Edge and Samsung Internet** give the battery level to web pages. On **Safari (iPhone, iPad, Mac)** and **Firefox**, the indicator stays hidden, including in the XL emergency display.

#### 📳 Haptic vibration

A short vibration confirms actions: itinerary step reached, recalibration, step validated, Rescue Mode alerts (team running late, missing members).

> 🚨 **Survival alerts always vibrate**, even with the option off: emergency exit found or not found, critical alert broadcast.

On iPhone, the option is greyed out (see "Sensor refused" above).

### 🧭 Smart navigation

The tracker estimates your position from **your steps and the compass**, which **drifts** over time. If your map contains **gallery paths**, smart navigation continuously snaps your position **onto the nearest gallery**.

**Turning it on**: **⚙️ Settings** → **📍 Navigation & tracker** → **🧭 Snap position to paths**. **Off by default**, and set **for each map**: it depends on how good that map's paths are.

- As you walk, your position follows the gallery; at a **junction**, the app picks the branch that matches your walking direction.
- If you leave the drawn galleries, the tracker goes back to classic mode, then snaps again as soon as you come back near a path.
- On a map without paths, the option has no effect.
- Two expert settings come with it: the **lateral tolerance** (distance from the path before letting go) and the **heading weight** at junctions. If something goes wrong, put them back to their defaults.

> 💡 **Manual recalibration (📍)** remains your best ally: as soon as you recognise a landmark, recalibrate, and smart navigation starts again from a sound base.

### 🗺️ "Oriented map" — the map turns with you

In the 🧭 Tracker menu, the **🗺️ Oriented map** tile makes **the map rotate** while tracking, so that your walking direction always points to the top of the screen, like a car GPS.

- **Off by default**; your choice is remembered on this device.
- The map only turns **while tracking** and straightens up when the tracker stops.
- It **follows you**: if you move it by hand, a **🎯 Recenter** button brings you back to your position.
- Text stays readable: measurements and point cards do not turn with the map.
- The map straightens up as soon as you pick a tool that needs clicks (measure, drawing, recalibration) or open a full-screen mode.

⚠️ The rotation follows your compass: **near large metal masses** (rails, reinforcement bars), it can become approximate, like the rest of the tracker.

### 🔐 Local access code (PIN / Face ID)

Lock the app at every startup with a 4 to 6 digit code, or **Face ID / Touch ID / fingerprint / Windows Hello** if your device supports it. Everything stays on the device: nothing is sent over the Internet, and **no recovery is possible if you forget it**.

> ⚠️ **This is a usage barrier, not encryption.** It prevents opening the app normally, but your photos and sessions remain readable in the browser by someone who knows how.

**Turning it on**: from the home screen, **⚙️ Configuration** → **🔐 Local access code** → **🔐 Enable access code**. Choose your code, confirm it, then accept biometrics if offered. **Write your code down** somewhere safe.

**At startup**, the lock screen follows the splash screen: biometrics start on their own (you can cancel and type your code instead), otherwise you type your code. To lock it again, close the app completely (or reload the page): the code is asked for at the next opening.

**Changing or disabling**: same section, **✏️ Change code** or **🔓 Disable**, after confirming with biometrics or the current code.

**5 wrong codes in a row** lock the app **temporarily**: 10 min, then 1 h, 6 h and 24 h with each new series. A countdown is shown and the keypad comes back by itself when the delay is over; a correct code resets everything. Failed biometric attempts do not count. A forgotten code cannot be recovered: only clearing the site's data in the browser settings lifts the lock, and it erases everything (maps, sessions, logbook).

### 🚑 Rescue mode — coordinating a search

> **Who it's for**: whoever organizes the search for a person missing underground, and the teams who go down to look for them.
>
> **When**: someone else is lost. If *you* are the one who's lost, use ⛑️ I'm lost.
>
> **Prerequisites**: the **same map** on every phone, available **offline** — there is no network underground.
>
> **Connected installation**: teams are linked to **accounts** (leader ★), the operation is **triggered** (alert on every phone, “Join my post”) and the board is shared step by step — what is ticked underground is sent when the network returns. Phone and radio remain the official channel.
>
> **Prepare it in advance**: set up one or two scenarios on your usual maps before any incident. On the day, the app has to be ready in 30 seconds.

To open it: **🧭 Tracker** menu → at the bottom, on a red background, **🚑 Rescue mode — Search plans (teams + zones)**.

#### 🧭 How it's organized

Three roles, each on their own phone:

| Role | Who | What they do |
|---|---|---|
| 👤 **Surface operator** | the command post, on the surface | prepares the scenario, follows every team, logs everything, gathers the reports |
| 🚨 **Field team** | each team that goes down | follows its route step by step, notes what it sees |
| 🚑 **Free rescuer** | a reinforcement with no assigned team | takes timestamped notes, without a route |

The cycle: **prepare** the scenario → **hand it over** to the teams before going down → **follow** the operation → **close** it and write the report.

#### 🧰 1. Preparing a scenario

##### 📝 Creating a scenario

- **➕ New scenario**: a name, the time of the incident and context notes (optional).
- **From ⛑️ I'm lost**: the **🚑 Start a rescue plan (teams + zones)** button creates a ready-made scenario — last known position, uncertainty zone (circle on the map), incident time and inferred notes. You must first have set a last known position there.
- **🗐 Duplicate** clones a scenario so you can test another hypothesis ("went east" / "went south") without touching the original.
- **10 scenarios per map** at most: beyond that, the oldest one is deleted. Never a scenario in progress, the one you have open, the most recent one, or a finished operation whose report has not yet left the phone.

A scenario is edited in three blocks: **📝 Incident context**, **🚨 Teams**, **📤 Export this scenario**. In the context block, **🔍 Analysis tools → 🔥 Show the activity heatmap** shows where activity has been recorded (tracking, points, paths): if the missing person used MyKTAMap and sent you their session, you can see where they went.

##### 👥 Teams

**➕ Add a team**, then on its card:

- **Name** (leave empty: Alpha, Bravo, Charlie…) and **🎨 Colour**, from 10 fixed colours;
- **👥 Members** (separated by commas), **👤 Leader**, **Headcount** — the headcount is what lets you count who is back at the return. Left empty, it equals the number of named members (or, on a connected installation, of linked accounts if there are more); the line below says where the figure comes from and warns if your entry is lower. Enter it when people go down without an account or a name;
- **Mandatory return**: a time set by the leader (light autonomy, shift change); it takes precedence over the estimated duration for late alerts;
- reference **Level** on a multi-level map (or "No level" if the team changes floors);
- **📍 Surface GPS** (optional, see § 4).

**🧹 Split into sectors** divides all the plan's galleries into sectors of similar length, each in one piece (a sector can go from one level to another through a shaft), and creates a "Sector N" team for each: its zone, the nearest **open access** as entry and exit, and a **full sweep** route already computed. Choose the number of sectors (6 by default); existing teams are not touched. The summary gives the sectors' length, the galleries connected to no access, and warns you if the plan has only one tagged open access (every team starts from it) or none (set the entries by hand).

On a multi-level map, **🏗️ Auto: 1 team per level** creates one team for each level that contains something. Teams can be collapsed (▾/▸, "▸ Collapse all") to keep the list readable.

##### 🗺️ Route, zone and itinerary

- **🗺️ Route**: tap **Entry**, **➕ Add an intermediate step**, then **Exit**. For each point: your map's **⭐ favorites** in one tap, the search, or **📍 Click on the map** (the point snaps to the nearest POI — point of interest of the map). Tapping a POI takes it as the point, without opening its card. Same entry and same exit = loop. From the app's search, the 📌 button assigns a point to a team in two taps.
- **⬛ Define zone**: either a **polygon** (one tap per vertex, double-tap to close), or a **selection of paths** (tap each gallery, tap again to remove it). The other teams' zones are shown dotted so you can align the boundaries. A gallery from the map is found identically on every phone that has this map; a path added by hand on a single device exists only on that device. On a multi-level map, the zone applies **to the level where you drew it** — tick "Zone on all levels" to extend it.
- **✨ Zone POIs** adds every point in the zone as steps, from nearest to farthest from the entry. If the zone holds several types of points, a window lists them with their count: untick those not to take as steps (for example plaques by the hundred). Your choice applies to every team of the scenario.
- **🧹 Route**: **Shortest path through the stops** (the classic calculation below), **Full sweep of the zone** — a circuit that goes along **every** gallery of the zone, dead ends included (there and back) —, or **Backbone** — every gallery except dead ends, for a quick reconnaissance before the search. The shortest path skips loops: with it, a third of a sector's galleries can stay unvisited. In a sweep, your steps stay, put back in the order the circuit reaches them; during **🧭 Follow my route**, a detour makes you **rejoin the circuit** where you were, without shortening it.
- **🗺️ Calc. route** computes the path through the galleries, from entry to exit via the steps, with distance and duration. It **avoids the other teams' steps and zones**; if it can't, it says so. It also lists **the steps more than 25 m from a gallery**: fix them before going down. Finally, it warns you when galleries on another level run under the zone without any route going down to them.
- **⏱️ Estimated durations** (settings specific to the scenario, sent along with it): **approach speed** outside the zone (3 km/h by default), **search speed** inside the zone (1.5 km/h), **pause per step** (0) and **red alert after** (30 min late).
- **🗺️ Show on map** displays the zones, entries, exits and routes of every team, each in its own colour.

##### 📊 Checking coverage

The **📊 Coverage** block gives, per level: the length of galleries, the share **in a zone**, the share **on a route** and the length assigned to two teams. Only the "on a route" share will actually be searched: 86 % of galleries in a zone can mean only 24 % on a route. It also lists the POIs inside a team's zone but off its route, and those visited by several teams. **🗺️ Highlight galleries off every route** shows them in red on the displayed level, to prepare the next phase. It is a reading aid: nothing is assigned automatically.

##### 📋 Several phases

An operation can run in phases, with a debrief between each — for example, phase 1: one team sweeps the main passages; phase 2: several teams search the chambers that were reported. If you don't need them, ignore them: a scenario always has one phase, and the phase buttons only appear once there are two.

In **📋 Phases**, **➕ Add a phase**: a name, then tick the **participating teams**. Teams are defined once for the whole scenario; the same team can take part in several phases. ✏️ renames or changes the teams; 🗑️ deletes, except the last phase, the active phase or a phase that has already started. During the operation, an amber badge at the top of the views shows the active phase and its rank.

#### 📤 2. Handing over before going down

- **📤 Export .mkmsec.json**: send this file to each team (messaging app, email, cable). On their phone, the team opens 🚑 Rescue mode → **📥 Import a plan**, checks the preview, then **✓ Import this scenario** — or, quicker, drops the file on **📦 Add a map** on the home screen: the app opens the right map, shows the preview, then offers to launch as “Team”. The import keeps the link with the command post: that is what will let the operator accept the team's report. If the scenario is already on the phone, choose **Replace** (recommended: keeps the link, but erases the operation entries already made on that phone) rather than **Import as a copy** (the report from that copy will be refused). The preview warns you if the file comes from another map or another version of the map.
- ⚠️ **After an app update, re-import the scenario on every phone before the operation**: otherwise the command post may fail to merge the reports.
- **Offline**: at launch, the app warns you if the map is not fully available offline on the device; download it from **ℹ️ Map info** before going down. For the surface map, open the **🌍 OSM view** while you still have a network and tap **💾 Save Offline** (details in the OSM view section).
- **📄 PDF export (1 page/team)**: one sheet per team, to print or keep on the phone — context, members, leader and headcount, mandatory return, mission, map of the zone (at the map's full resolution: gallery names stay readable even on a large map), steps, **route sheet** junction by junction (level changes included, if the route has been computed) and an "Observations" box to fill in with a pen.
- **🌍 Geolocated KMZ export**: the scenario for Google Earth, OsmAnd or Avenza — one folder per team (points, zone, route) over the map as background. Missing routes are computed before the export, and MyKTAMap reads this KMZ back along with the scenario. The map must be calibrated with two GPS points (📡 External export tab of the session export).

#### 🔦 3. In the field

##### 🚀 Launching and choosing your role

**🚀 Launch the rescue plan** (banner at the top of the scenario), then choose your role: 👤 Surface operator, 🚨 Field team (and which one), or 🚑 Free rescuer. You can change role later without losing what has been entered.

In the team role, you are **placed at your team's entry** — automatically if your position had not been confirmed yet, otherwise the app offers it ("Place me at the entry" / "Keep my position"). A single message sums up the launch.

Closing the window removes nothing: your zone and your route stay on the map (a team sees its own, the operator sees all of them), even after a reload. At the bottom of the screen, the **🚑 Rescue · Alpha · 3/8 ›** badge reminds you that the operation is running; tapping it takes you back to the steps to validate. **⏸️ Pause** freezes the timer, **▶️ Resume** restarts it: paused time is not counted.

##### 🚨 Team side

The view shows your route step by step (Entry, 1…N, Exit — the same number everywhere). At each step, **📝 observations** (saved automatically) and a **status**:

| Status | When |
|---|---|
| • Pending | not dealt with yet |
| 🟢 All clear | nothing to report |
| 🟡 Suspicious | unusual traces, noise or smell |
| ⬛ Blocked | passage impassable (collapse, water) |
| 🔵 Clue | object or trace found |
| 🟠 Help requested | people or equipment needed |
| 🟣 Forced turnaround | route abandoned, early return |
| 🚨 **Casualty found** | absolute emergency: flashing red card on the operator's side |
| ⚪ Passed, not reported | set by the app when you move on to the next step without choosing a status — a skipped step is not a searched step |

- **📸 Photo**: up to 5 per step, camera or gallery; tap a thumbnail to enlarge it.
- **Validating a step resets your position onto it** (with All clear, Suspicious, Clue, Help requested or Casualty found): without asking under 30 m, with a question beyond that. Never with Blocked or Forced turnaround: you didn't get there.
- **🧭 Follow my route (step-by-step guidance)** turns the route into a guided itinerary: the "In 40 m, turn left" banner, the route sheet and the 🔆 XL display lead you from step to step, and 🧭 tracking starts. Validated steps are ticked off; if you stray, **Recalculate** sets off again towards the next unfinished step, still avoiding the other teams' zones. When you reach a step, a message and a vibration alert you, and the 🚑 badge opens that step. The team's route must have been computed.
- Three shortcuts if something goes wrong: **🚪 Emergency exit**, **🔆 XL display**, **⛑️ I'm lost**.
- **▶️ Departure** records your departure time (otherwise, the launch time); **✅ Back** stops the clock when you come up.

##### 👤 Operator side

- At the top: **"X deployed · Y underground · Z missing at return"**. At launch, the app flags teams with no headcount: when they come back, nobody would be counted.
- One card per team: progress, latest status, latest observation. **🚨 Casualty found** → flashing red card; **🟠 Help requested** → orange; finished team → greyed out. **👁️ Details** shows all its steps.
- **Late teams**: each team has an expected return time (departure + estimated duration, or its mandatory return). Past that time, its card turns **orange**; after the margin, **red**. Late teams move to the top, the badge at the bottom changes colour, and a message and a vibration alert you.
- **✅ Back**: the app asks **how many came back up** (nothing is prefilled: count them). Below the headcount, the red alert **"N PERSON(S) MISSING"** stays on screen, badge included, until the count is corrected (**Correct the count**).
- **📢 General recall** (or **📢 Recall** for one team) marks the teams still underground as recalled, with the time. ⚠️ **The app does not alert anyone** — there is no network underground: pass the order on yourself, by radio or by voice.
- **🚨 Take over**: a team radios in? You switch to its view, on its first unfinished step, to enter things on its behalf; **👤 Back to Operator** brings you back. In that case, Follow my route, Emergency exit, XL display and I'm lost are missing: they would act on your own phone.
- **📜 Log**: everything is recorded there with the time — launch, statuses, casualty, departures, returns, recalls, imports, phases — plus your own notes (radio call, decision). It is printed as an appendix to the report.
- **Editing during the operation**: a team added as reinforcement, or whose entry, exit or steps you change, gets its steps immediately. What has been entered stays on the same step. Removing a step that already has entries asks for confirmation, and is refused if it reports Help requested or Casualty found: change its status first. Put back within the same phase, the step gets its entries back.

The 🚑 **free rescuer** has neither route nor steps: they add notes, each with a status and the time. Their report is imported like a team's, and their notes join the log.

##### 🚑 Casualty found

A step set to **Casualty found** gives a position: the step's position, level included. **📍 Refine on the map** adjusts it. A **red ✚** marks it on the map, for everyone; the operator sees it in a banner at the top of their view, and the report prints it first.

**🚑 Evacuate** opens the Emergency exit from the casualty: the map's exits and the teams' access points, ranked by actual distance ("Access No. 3 (Charlie, Delta) — to be opened from the surface" if it is closed). Before the calculation, the **stretcher options**: zones to avoid (water and rubble ticked by default) and, as a last resort, passing through inaccessible zones. If no path avoids these zones, the window says so.

#### 🚒 4. External rescue services

- **🚒 Firefighter briefing** (in every Rescue mode banner) produces a PDF for the fire service, to print or send to them before they arrive — they don't need to install anything:
  - **SURFACE ACCESS POINTS**: the map framed on the teams' access points, a numbered marker per access, and a table No. · access (entry, exit or both) · teams · GPS and clickable map link. It says which access must be opened from the surface. **Name your entries** ("Manhole on X street"), otherwise the table says "Unnamed access";
  - **LOCATION ON THE MAP**: coordinates of the map's centre, OpenStreetMap and Google Maps links;
  - **TEAMS ON SITE**: members, leader, headcount, mandatory return, surface GPS;
  - **CRITICAL POIs**: the map's access points with their level, open ones first, then closed ones (which firefighters and the relevant services can open).
  
  You choose the layers of the PDF's OSM map; the text sections are always included.
- **📍 Surface GPS** (team card): the position of the command post, the meeting point or any surface location linked to the team, as "latitude, longitude" (e.g. 48.856600, 2.352200). It appears in the briefing with a map link.
- **🚪 Plan entry point**: this tag (🚨 Rescue category of the POI editor) marks the main entrances; they appear in the critical POIs and on the OSM view.
- **🌍 OSM view**, available in the scenario banner and in all three views, shows the map on OpenStreetMap to the rescuers who arrive. The map must be georeferenced.

#### 📦 5. Closing and writing the report

##### 🏁 Closing a phase

In the operator view, **✓ Phase ended** (shown as soon as there are 2 phases). When every team in the phase has validated its exit, the button turns green and a message alerts you; the decision remains yours. Enter the **debrief** (teams back, points found, zones to explore first), then **✓ End the phase**: the phase is archived, nothing is erased, and its planned route is kept. If there is a next phase, the app offers to start it: its teams' steps are rebuilt from their **current** route — so you can adjust it during the debrief. Otherwise, it offers to stop the plan. **➕ Add a phase** is also available during the operation.

##### 📥 Importing the teams' reports

1. Back on the surface, each team taps **📤 Report** → a **.mkmsec.report.json** file, and sends it to the operator.
2. The operator, with the plan launched, taps **📥 Import team report**: the preview shows the team, the number of steps and photos, and the conflicts with what has already been entered.
3. **✓ Import and merge**: observations are appended with the date (nothing is lost), the most serious status is kept (if equal, the most recent; a casualty is never downgraded), photos are added without duplicates. The team's card shows "📥 imported".

The import is refused if the team did not exist in the operator's scenario at launch, if the file comes from another scenario, or if it is an operator's global report. A report about a phase that is already closed is filed in that phase's history, and the app tells you so. A Help requested or Casualty found report on a step you had removed puts the point back into the team's route and shows in red; otherwise, it appears under "Reports outside the route" in the report.

**Undoing an import**: a backup is made just before; restore it from **📊 Session details → 📦 Recent backups** ("Before importing team report …").

##### 📄 Final report

**📤 Report** (each view, and the scenario banner) generates the current state at any time, in three formats: **Printable PDF** (photos in an appendix), a **.mkmsec.report.json** file (photos if "📸 Include photos" is ticked), or **Copy text** for a quick message. The operator gets every team, a team gets its route, the free rescuer gets their notes.

The operator's PDF opens with the casualties, then covers each phase (planned route, steps, debrief), the reports outside the route, a "SURFACE BRIEFING" page with the map of access points, and the log as an appendix.

**⏹️ End the plan** stops the operation; the banner switches to **📦 PLAN ENDED** with **📤 View the historical report** and **🚀 Relaunch**. ⚠️ Relaunching erases the previous operation, including photos and received reports: export its report first.


### 🏗️ Create or edit a map

The **🏗️ Generate a map** button on the home screen opens the **Generator** (**📦 Create / Edit a map**), which produces a map's ZIP archive.

#### 🧙 The Generator

- **🧙 Wizard**: the Generator moves **step by step** (name, image, layers…). Optional steps are skipped in one click (**⏭ Skip**), and a **✅ Summary before generation** shows what is filled in, skipped or missing, with useful warnings (for example: without GPS georeferencing, no OSM View and no KMZ / GPX export). **🗒️ Show all** instead shows the whole form at once; your choice is remembered.
- **🚀 Simple / ⚙️ Advanced**: Simple mode keeps to the essentials (image, name, version, V2 — the image cut into tiles, see “🧱 Convert to V2 tiles” —, multi-level) and loads the default icons; Advanced mode gives access to every option.
- **📂 Load a file** accepts a **MyKTAMap ZIP** (to edit it), a **KMZ** or a **GPX** exported by MyKTAMap (the GPX gives a blank background georeferenced automatically), a **GIS export** (`.geojson`, `.kml`) or a **GeoTIFF**. Otherwise, fill in the form to create a map from scratch.

When you're ready, **📦 Generate ZIP** downloads the archive.

#### 📄 New map

- **Information**: name, version, author, **🏷️ labels** (comma-separated, 12 at most). They travel inside the ZIP and are **suggested** to whoever imports it, without replacing the labels that person has already set.
- **Main image** (required): its dimensions are read automatically, with a red warning beyond 10,000 px per side or 30 MB.
- **Collision map** (optional).
- **Tracker start position**: centred on the map automatically; **🎯 Recenter the start position** puts it back in the centre.
- **Image layers** (legends, annotations) and **data layers**: up to 10 of each. The **Additions** layer is always included.
- **Tracking parameters**: scale and **North** orientation (0 if the top of the map is North; anyone can correct it in their Settings).
- **Icons & tags**: **↺ Load defaults** pre-fills the standard icons, **+ Add a tag** creates a type of your own. The `default` and `track` tags are mandatory.
- **🏷️ Map legend**: renames, hidden entries and added entries apply to everyone who opens the map; each person can then change it for themselves.
- **🌐 GPS georeferencing** (optional): two points A and B, plus a point C for a distorted map. Without it, no OSM View and no KMZ / GPX export.
- **📖 History PDF** (optional): one or more PDFs, at the top of the list in History Mode. When editing, the map's existing ones are kept.

#### 📂 Edit an existing map

Load the map's ZIP in **📂 Load a file**: the form fills in with its configuration. Change what you want (tags, icons, layers, start position…) then **📦 Generate ZIP**. From an open map, **⬆️ Export → 🔄 Update the map** opens this mode already filled with your corrected layers and your drawings.

If the map has **photos attached to its points** on your device, the **📸 Include attached photos** box (ticked by default) packs them into the ZIP. Whoever opens that map finds the photos in the points' popups. Unticked, the ZIP is lighter, without photos.

#### 🎨 Blank image

To draw a map **without a source image**, choose **Blank image** instead of **From an image** in **🖼️ Main images**:

- **width** and **height** from 500 to 12,000 px — on iPhone / iPad, 16 Mpx at most (about 4,096 × 4,096), a larger background is generated on a computer (taken from the map when you reload a ZIP: to make an existing map's background transparent, pick **🫥 transparent** and regenerate);
- **background colour**: white, grey, black, sepia, or **🫥 transparent** (in the OSM view the background map shows through; in map mode, the background chosen in Settings);
- **🎨 Suggested background** (optional): the background shown under transparent parts in map mode — anyone can change it in ⚙️ Settings › Display;
- **🎨 Generate the blank image** installs it as the main image.

Finish the form and generate the ZIP as usual, then draw pillars, working faces, paths and points with the map tools.

> 💡 Example: in a quarry with no paper map, a 4,000 × 4,000 px black background, filled in as you explore, with the tracker as a guide.

#### 📦 Reuse another map's layers and photos

In **📊 Data layers**, **📦 Choose a data-layer ZIP…** imports someone else's annotations in one go: points, paths, zones, structures and photos. That ZIP comes from **📤 Export → 🔄 Conversion → Session to data layer**, with the 📸 photos box ticked to include them.

- The layers are created automatically; a green message gives the details.
- On an **existing** map, your layers are **kept**: those from the ZIP are added alongside without ever overwriting them, and the photos are merged.
- Generate the ZIP: when the map is opened, everyone finds the photos in the points' popups.

#### 🗺️ Start from a GeoTIFF

If you georeferenced your map in **QGIS**, export it as a **GeoTIFF** (`.tif`): the image and its georeferencing travel in the same file. Choose it as the map image, in the Generator or from the home screen: the app fills in the **GPS georeferencing**, works out the **scale** and the **extent**, then converts the image for the next steps. There is nothing to type again.

> ✅ **Accepted**: LZW, Deflate or no compression · 8 bits per channel · grey, RGB or RGBA · striped image · north up, no rotation · Lambert 93, Web Mercator or WGS84.
>
> ❌ **Refused**, with a message saying what to change in the export: BigTIFF, separate channels, palette / CMYK / YCbCr, georeferencing that distorts the image (stretched or sheared; a merely rotated image is accepted), other coordinate system.

#### 🗺️ Convert a GIS file (QGIS…)

Drop your export **on the "📦 Add a map" area of the home screen** or into the Generator: the app opens **🗺️ Convert from GIS**. Formats: `.geojson`, `.json`, `.kml`, `.kmz`. Points, paths and zones are carried over.

- **No image needed**: the app creates a blank background aligned on the file's coordinates. You can replace it with a real image later.
- **Your naming is respected**: a matching screen asks you which column holds the type, then what each value corresponds to (`CANALISATION`, `galerie_tech`…). Obvious values are pre-filled, and each one can target any family: a polygon can be a zone, a pillar, a wall or a working face.
- **One level per floor**: if the file has a level column, choose it in "Level column". A preview shows the distribution, "One colour per level" gives each floor its own tint, and the 🏷️ button renames and recolours the levels. Everything you set there is kept in the generated map. If the screen shows "Legend reset", reopen 🏷️ before generating.
- **You only give the width**: the height is calculated so that nothing overflows. Beyond a certain size, a warning appears, without blocking.

> 📐 **Coordinates**: WGS84 (EPSG:4326) or **Lambert 93** (EPSG:2154, converted automatically; a banner asks you to check the resulting position). Any other projection is refused, with the steps to follow: in QGIS, *Export → Save Features As…*, CRS **EPSG:4326**.

Good to know: holes in polygons are ignored; beyond 20,000 objects a warning is shown, and beyond 60,000 the import is refused (filter your layer in QGIS). Shapefile and GeoPackage are not read: re-export as GeoJSON.

> ⚠️ A map created from a GPX or GIS file with an earlier version of the app has a **wrong scale**, and therefore wrong distances: regenerate it from the original file. Maps made from an image are not affected.

#### 🧱 Convert to V2 tiles

For a heavy map (image over 50 MB or over 8,000 px), the **🧱 Convert to V2 tiles (performance)** box cuts the image into **tiles**: the app then only loads the pieces on screen, which greatly reduces memory use.

1. Choose a main image, or load the ZIP of the map to convert.
2. Tick it and read the warning: the conversion is heavy.
3. **📦 Generate ZIP**: a progress bar follows the cutting (1 to 5 min). The downloaded ZIP has a `_v2` suffix.
4. Import that ZIP: the map opens in V2 (purple `V2` badge).

- The **white margins** of a scanned map are trimmed automatically.
- A **transparent PNG / WebP** image keeps its transparency: in the OSM View, the map shows through your plan. For a V2 map generated before this treatment, regenerate it once to benefit.
- On a map that is **already V2**, the box is pre-ticked and the tiles are rebuilt; unticking it turns the map back into a single image.
- Drawbacks: a slight flash when the zoom level changes, and a black border when zooming very far out.

> 💻 **Do the conversion on a computer.** On a phone, the browser runs out of memory and almost certainly crashes on a large image. The V2 ZIP generated on a PC then opens effortlessly on mobile.

#### 📦 Import several maps at once

In the **🧰 Tools** section of the home screen, **📦 Import several maps** adds as many ZIP archives as you like to your list, **without opening any of them**.

1. **Choose** your files.
2. **Review** what will happen, line by line: added, already there, refused (and why), with the total size and the space left.
3. **Start**: the maps go in one by one, then a summary is shown.

- **Map already in your list**: one choice for the whole batch, leave it as it is (default), replace it or keep both.
- **📁 File into:** choose the "My maps" folder that receives the batch ("Unfiled" by default).
- **💾 Store the maps in the app** (ticked by default, like the "Store the map in the app on first load" setting): the app keeps the files, and each map then opens **without selecting its ZIP again**. Unticked, nothing is copied and the ZIP will be asked for the first time you open each map.
- **Space is checked beforehand**: if the batch does not fit, the import does not start and the app tells you how much is missing. If space runs out along the way, the import stops at once and keeps the maps already added.

### 🚀 Optimize your map

A light map loads faster, moves more smoothly and **crashes far less on mobile**. The tips below go from the most to the least effective.

#### 🖼️ The main image

It is what uses the most memory.

| Longest side | Behaviour |
|---|---|
| up to 4,000 px | ✅ Fine everywhere |
| 4,000 to 8,000 px | ⚠️ Fine on computer, limited zoom-out on mobile |
| 8,000 to 16,000 px | ⚠️ Possible crashes on mobile: convert to V2 tiles |
| beyond | ❌ Almost certain crash on mobile |

- **Resize** a huge image to 6,000 - 8,000 px per side (GIMP, Photoshop, [Squoosh](https://squoosh.app/)): a little less detail at maximum zoom, much more stability.
- **Format**: JPEG at 80 - 90% quality for a scan or a map with gradients (often 5 to 10 times lighter than a PNG, with no visible difference); WebP, lighter still; PNG only for transparency or sharp flat colours.

#### 🗂️ Layers, paths and points

- **Image layers**: each one adds memory, even when hidden. A single one is ideal; two or three of 2 MB at most remain acceptable. Rather merge legend and landmarks into the main image.
- **Paths**: beyond about fifty, moving the map can slow down. For a very large network, draw the galleries **directly into the image** and keep the path layer **hidden**: the itinerary still uses it.
- **Points**: beyond a few hundred shown at once, rendering slows down on mobile. Spread them over several data layers (shafts, passages…) that anyone can hide.

#### ✂️ Image splitting

A very large image is **cut into tiles** when it loads, so as not to saturate memory. The setting lives in the map's **ℹ️ Info**, row **🖼️ Tiling for this map**, and only appears for a map **that has not been converted to V2** (a V2 map is already cut). It is remembered for that map.

| Choice | Effect |
|---|---|
| **Auto** (default) | Cuts as soon as the image exceeds 4,096 × 4,096 px or 60 MB. ✅ The right choice in almost every case. |
| **Off** | The whole image at once, native quality on a computer. ⚠️ Can crash a phone on a very large map; a message warns you. |

#### 🚀 Performance ULTRA mode

If a large map still crashes or lags, open **⚙️ Settings** → **🚀 Performance**. **🚀 ULTRA mode (enables everything)** lightens everything that is not the image: paths, points, calculations. This setting applies **to the open map only**, on this device.

| Option | Effect | Trade-off |
|---|---|---|
| 🪜 **Decimate paths when zooming out** | Simplifies paths seen from afar | Less smooth paths when zoomed out |
| ⚡ **Disable zoom/pan animations** | Instant transitions | Reload required |
| 🎯 **Disable intersection circles** | No circles at junctions beyond 50 paths (instead of 500) | Junctions less visible |
| 🚫 **Disable popups on data layers** | No popup when clicking data-layer points | Use 🔍 Search instead |
| 🐢 **Slow auto-save (30s)** | Saves every 30 s | Up to 30 s lost if the app crashes |
| 🛡️ **Limit zoom-out on mobile** | Caps zoom-out on phones. **Ticked by default** | No full overview on mobile; reload required |

- ULTRA ticks everything; unticking it unticks everything. On top of the options above, it only draws the paths and points near the screen (slight pop-in when moving the map). You can also enable only some options, for example **🐢** for a good gain with no visible loss.
- **Your session points are always shown**, whatever the options.
- When optimizations are active, a message reminds you when the map opens: a lightened display is not a bug.
- On a multi-level map, **🏗️ Show every level at launch** (same group, outside ULTRA, ticked by default) can be unticked to open only levels -1, 0 and +1.

#### 📱 On mobile

- On iPhone, the app **installed on the home screen** handles large maps better than Safari; Android Chrome is generally more tolerant than iOS.
- iOS can close the app without warning to recover memory; the app tells you when it restarts. During heavy annotation work, **export your session** (📤 Export) every quarter of an hour.
- To diagnose a crash, see **🐛 Detailed logs** below.

#### ✅ In short

- Image in **JPEG at quality 85**, 8,000 px per side at most.
- One or two image layers at most.
- Large network: galleries **drawn into the image**, path layer hidden for the itinerary.
- Points spread over a few data layers.
- Large map: **converted to V2 tiles**; weak device: **🚀 ULTRA**.

### 📊 Plan data editor

**⬆️ Export → 📊 Plan data editor** (💾 Session section) on the map, or **📊 Data editor** on the home screen, opens a table to **view, edit and export** a map's points, paths, zones and structures.

#### 📂 Opening

- **🗺️ Current plan**: the data layers of the open map (absent from the home screen, where no map is loaded).
- **📦 Import a ZIP**: the layers of a complete map.
- **📄 Import a JSON file**: a data or session file.
- **🔄 Convert session ↔ layers**: turns your session into a **data layer** to integrate into a map (see “🏗️ Create or modify a map”). Same choice by category and by icon; **Basic** granularity (one file per category) or **Fine** (one file per type). The tracker is never converted: a drift frozen into a map would mislead its future users. Once converted, this data can no longer be edited from the app.
- **🔗 Merge layers**: combines several data layers (`.json` or `.zip`, from several sessions) into a single set per category. A preview gives the totals and flags duplicate point identifiers (kept as they are).
- **🔁 Realign data onto another scan**: moves your data files from one scan to another scan of the same map (recropped, larger, smaller). **Open the target map first**, then choose your `.json` files:
  - **By names and identifiers** (the safest, selected by default): if both versions come from the same Generator, objects that kept the same internal identifier serve first as landmarks (points, and vertices of tracks, zones and structures that kept their vertex count); then points with the same name in your files and on the open map serve as landmarks (case, accents and punctuation ignored; unique names of at least 4 characters). The app works out the scale, rotation and offset, sets aside namesakes that do not fit and reports the quality (“73 landmarks, median gap 0 px, 90% under 1 px”). Landmarks come first from the **plan's layers** (the ZIP data); your session is used only if the layers give fewer than three, and its objects still at the same position as in your file (an unconverted copy, imported earlier) are ignored. The report says where the landmarks come from, with the scale and rotation found. If most landmarks are at the same position as in your file, the app warns you (file already in this frame, or an unconverted copy) and offers to discard them. If the scan is stretched, it offers an affine transformation.
  - **Clicked landmarks** (when names are not enough): pick a point of your file in the list, then click its position on the map; at least three landmarks, far apart. Each one's gap is shown: a bad click stands out in red and is left out of the calculation.
  - **Resolutions** (last resort): only if both scans have exactly the same framing. If their proportions differ by more than 2%, the app refuses: names or landmarks are needed.
  - **👁️ Preview on the map**: your realigned data is drawn dashed over the map before downloading; the preview disappears when the tool closes. You then get `_conv.json` files.
  - From the home screen (no map open), only resolutions and landmarks typed by hand are available. Inter-map links, georeferencing and scale have to be redone on the new map.
- **🧹 Deduplicate data**: removes consecutive identical vertices from paths, zones, structures and measurements, invisible but making files heavier. You get a `_dedup.json` file and a count of what was removed; points are never touched.

If the source contains several datasets, a selector lets you choose.

#### ✏️ Editing

- **Click a cell** to edit it (except the identifier). **Tab**: next cell · **Enter**: next row · **Esc**: cancel.
- A coordinate outside the map turns **red**.
- The **Tags** cell opens a picker with icon previews; you can create a tag there.
- For paths, zones and structures, the **note**, **type** and **level** can be edited, but not the **geometry**: redraw it on the map. A type missing from the legend turns **red**.
- On a **multi-level** map, the **level** column is always there (0 when the object has no level yet) and is picked from a list of the map's levels.
- For points: search across all columns, sort by clicking the header, multiple selection (checkbox + Shift+click), **+ Add row**, **📋 Duplicate**, **🗑️ Delete**, **📍 View on map**.

#### 💾 Saving

| What you edit | **💾 Save** |
|---|---|
| **Map data** | Downloads the edited `.json` file. To apply it, re-import it in the **Generator**: the editor never changes the displayed map. |
| **Your session** | Downloads the file, or applies it right away with **✏️ Apply to the current session** (points, paths, zones and structures): only the cells you changed are applied, an untouched row changes nothing even if the file is old; a type or level change works as from the object's sheet; a row removed from the table is deleted from the session; an object deleted since the export is not recreated, unless you changed its row. A type missing from the legend is refused, with the row number. **⏪** undoes the whole operation at once. On a map shared by an installation, removing objects requires the right to delete them for everyone, and a confirmation. |

If you close with unsaved changes, the app offers to save, quit without saving, or keep editing.

### 🖥️ Hosting the app on your server

To install MyKTAMap on your own machine (PC, Raspberry Pi, NAS, club server) and serve it on your local network.

#### 🐳 With Docker

```bash
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

Then open **`https://localhost:8443/`**. The browser reports an **unrecognised certificate** (the image creates one when it starts): accept it via **"Advanced settings" → "Continue"**, then reload the page so the app works offline.

If port `8443` is already taken on your machine, change the left-hand part: `-p 9443:8443`. Updates are not automatic: you decide when to fetch the new image.

The image serves exactly the same app as the official site, from your own hardware; nothing is sent anywhere else.

> 📖 Installing Docker, keeping your maps across restarts, using your own certificate or a local domain name, updating, fixing common errors: it is all in the guide **[`docs/applications/DOCKER_INSTALL.en.md`](DOCKER_INSTALL.en.md)**.

#### 🗂️ Offering the server's maps

If your server hosts maps in `data/` (for example `data/test1/`, `data/test2/`), a `data/index.json` file makes them appear automatically in **My maps**, marked "discovered", loadable in one click:

```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Plan Test 1", "version": "V1" },
    { "id": "test2", "path": "data/test2", "name": "Plan Test 2", "version": "V1" }
  ]
}
```

The short form `{ "plans": ["test1", "test2"] }` also works; the detailed form shows the names straight away.

Even simpler: drop the map's ZIP as is (without unzipping it) and declare it with `"zip"` instead of `"path"`, for example `{ "id": "test3", "zip": "data/test3.zip", "name": "Test map 3" }`. The app downloads it when opened, keeps it on the device for offline use (according to **Store the map in the app**), and only downloads it again if it has changed. On the map's row, 💾 keeps it without opening it, ✅ shows it is kept and up to date.

> 📖 Instance subtitle, map tags, an access password of your own, read-only mode (import and Generator hidden), links between maps: your instance’s `confadmin.html` page builds this file for you — how-to in the guide **[Hosting an instance with your maps](SELFHOST.md)** (in French).

### 💼 Pro edition

The pro edition is installed by **the person who manages your installation**: they put the licence on the server, there is nothing to do on your side. Your profile then shows ✓ Pro edition active, and the startup screen "Professional edition". The app no longer offers to import a licence yourself: a licence imported on a device did not turn on any pro feature.

A licence is **signed by the author** and issued for one address and a set period. If it expires, or if the server refuses it, the app **stays closed** on the "Installation licence invalid" screen — never reopened in community mode: tell the person who manages the installation (the **💼 Discover or renew the pro licence** link on this screen presents the licence). What is kept on the device is not erased.

> ⚖️ The license is **personal**: sharing it with an unauthorised third party breaches the contract made with the author.
### 🛡️ Revoked maps

When a map has been spread outside its circle of trust (forum, public social network…), its author can **revoke** it: the app then refuses to open it, for everyone.

- **When you import a revoked map**, a red **⛔ Map revoked** window appears with the reason and the date. The map is not opened: tap **Got it, delete this map** to remove it from your list.
- **If a map already in your list is revoked later**, the app removes it at the next startup and an orange window tells you (name, reason, date); tap **Got it**.

There is nothing else to do.

> 🔒 The app downloads the public list of revoked maps and compares it **on your device**: nobody knows which maps you own. Offline, the last known list applies.

### 🐛 Detailed logs

In the home screen's **⚙️ Configuration** → **🛠️ Developer Mode** (password-protected), **🐛 Verbose logs** adds information to the browser console (tracker sensors, image splitting). Useful to report a problem. Off by default. Developer Mode also contains **🔧 View cache state (Service Worker)**: the file-by-file detail of what the offline dot sums up.

### 📖 All the documentation online

This guide, and everything around it, can also be read on **[doc.myktamap.fr](https://doc.myktamap.fr/)** (mostly in French): installing your own copy (with or without Docker), understanding what the app sends over the network, security and keys in the pro edition, and how each version is checked before it reaches you.

---

*MyKTAMap — User Guide*
*These places are fragile. Discretion is a form of respect.*
