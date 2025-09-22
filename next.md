# Next steps
- funktion um ein neues rechnungsseite aufzurufen
- die rechnungen im localstorage speichern
- aus der zwischenablage ein mehrzeiligen text "importieren". jede zeile ist eine zeile in jotsum mit automatischem calc
- nur minus oder plus zahl muss auch funktionieren in einer zeile. Bspw. -200 oder +200

# Chat GPT Suggestions
Super Projekt – ich hab’s mir angeschaut (Demo-Seite + Repo) und sehe schon ein paar mobile-Hebel. Auf der Page gibt’s z. B. den „Add line“-Button, die Versionsanzeige und den Hinweis „Just download this page for offline usage“, der Ansatz passt also gut für ein **leichtes, offline-fähiges** Tool im Browser. ([jerik.github.io][1])
Im Repo liegen `index.html`, `jotsum.html` und `jotsum.js`, plus Tests/Playwright-Config – prima Grundlage für saubere Mobile-Optimierungen. ([GitHub][2])

Hier meine kompakten, praxisnahen Verbesserungen speziell für Smartphone-Nutzung:

## 1) Mobile Meta & Farben

* In `<head>` ergänzen:

  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#111827">
  ```

  `viewport-fit=cover` + `theme-color` sorgen für nahtloses, „appiges“ Feeling (Statusbar-Farbe).

## 2) Touch-Ziele & feste Bedienleiste

* Buttons/Felder mindestens **48×48 px** Touch-Fläche.
* Eine **sticky Bottom-Bar** (Add line, Share/Export, Clear, Undo) verhindert viel Scrollen:

  ```css
  .toolbar {
    position: sticky; bottom: 0; padding: .75rem; 
    display: grid; grid-template-columns: repeat(4,1fr); gap: .5rem;
    background: color-mix(in oklab, Canvas 85%, #000 10%);
    padding-bottom: calc(env(safe-area-inset-bottom) + .75rem);
    backdrop-filter: blur(6px);
  }
  .btn { min-height: 48px; border-radius: 12px; }
  ```

  Safe-Area berücksichtigt Notch/Bottom-Home-Bar.

## 3) „Richtiges“ Mobile-Keyboard

* Für jede Eingabezeile (falls `<input>`/`<textarea>`) setzen:

  ```html
  <input
    inputmode="decimal" enterkeyhint="done"
    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
  ```

  → numerisches Keyboard, kein Autokorrektur-Chaos.
  Falls ihr `contenteditable` nutzt, ist `inputmode` tricky; dann lohnt ein **unsichtbares Input-Feld**, dem ihr bei Fokus/Enter kurz die Eingabe übergebt, um das passende Keyboard zu bekommen.

## 4) Viewport-Hüpfer auf iOS vermeiden

* 100 vh ist auf iOS problematisch. Besser:

  ```css
  .app { min-height: 100svh; }
  @supports(height: 100dvh){ .app { min-height: 100dvh; } }
  ```

  `svh/dvh` fixen das Keyboard-Resize-Flackern.

## 5) Persistenz & „Weiterarbeiten wo aufgehört“

* **Auto-Save** pro Zeile in `localStorage` (oder `IndexedDB` bei großen Texten).
  Beim Laden: letzte Session wiederherstellen, plus „Reset“-Button.

## 6) Schnelles Pasting & Debounce

* Beim Einfügen von Multi-Line-Text:

  * Parsing **debouncen** (z. B. 150 ms),
  * Reflow minimieren (DocumentFragment, dann einfügen),
  * große Pastes im `requestIdleCallback` durchnudeln, um UI nicht zu blockieren.

## 7) Teilen/Export für unterwegs

* **Web Share API** (iOS/Android) für schnellen Export:

  ```js
  async function shareResult(text){
    const payload = { title: 'jotsum', text };
    if (navigator.share) await navigator.share(payload);
    else downloadTxt(text); // Fallback
  }
  ```
* Zusätzlich Export als **.txt/.csv**, damit mobile Office/Notizen-Apps es direkt öffnen.

## 8) PWA: Installierbar + Offline ohne „Speichern“

* `manifest.webmanifest` (Name, Icons in 192/512, Start-URL `jotsum.html`).
* **Service Worker** (statisches Caching via „cache first“) → echte Offline-App statt „bitte speichern“.
  Die Seite erwähnt Offline-Nutzung bereits – mit PWA wird das für Endnutzer noch reibungsloser. ([jerik.github.io][1])

## 9) Haptik & Micro-UX

* Kurzes **Haptic/Vibration** bei Add/Remove-Line (`navigator.vibrate?.(10)`).
* **Enter-Verhalten**: Auf mobiler Tastatur mit „Done“ die Zeile berechnen + neue Zeile optional.
* **Sichtbares Feedback**: ARIA-Live-Region, die Subtotal/Total ansagt (Screenreader-freundlich).

## 10) Dark-Mode & Lesbarkeit

* `@media (prefers-color-scheme: dark)` + hohe Kontraste; **Monospace** für Zahlen, 16–18 px Base-Font.
* Markiert **erkannte Zahlen/Operatoren** per leichtem Highlight; hilft, Eingabefehler zu sehen.

## 11) Fehlerrobustheit unterwegs

* Toleranter Parser (Komma/ Punkt, `1.000,50` vs `1,000.50`), Minusstriche, Unicode-Operatoren (`×`, `–`).
* Bei Parse-Fehlern **inline-Hinweis** statt Alert (z. B. rote Wellenlinie, Tooltip).

## 12) Mobile-Tests automatisieren

* In eurer **Playwright-Config** Gerätepresets aktivieren (iPhone 15/SE, Pixel 8).
* Tests: Paste-Flow, Tastatur-Shortcuts, Offline-Modus (mit `context.route`/`service worker`), `navigator.share` Fallback.

---

### Kleine Code-Starter (kopierbar)

**Manifest (Ausschnitt)**

```json
{
  "name": "jotsum",
  "short_name": "jotsum",
  "start_url": "jotsum.html",
  "display": "standalone",
  "background_color": "#111827",
  "theme_color": "#111827",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Minimaler Service-Worker (Cache-First)**

```js
const CACHE = "jotsum-v1";
const ASSETS = ["/jotsum.html","/jotsum.js","/styles.css","/manifest.webmanifest"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener("fetch", e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
```

**ARIA-Live für Summen**

```html
<div aria-live="polite" id="totalLive" class="sr-only"></div>
<script>
function updateTotal(t){
  document.getElementById("totalLive").textContent = `Total ${t}`;
  document.getElementById("totalText").textContent = t; // sichtbare Anzeige
}
</script>
```

---

Wenn du magst, bastle ich dir die **konkreten Diffs** für `jotsum.html`/`.js` (Meta-Tags, Toolbar, PWA-Files) passend zu deiner Struktur – dann kannst du sie direkt ins Repo übernehmen.

[1]: https://jerik.github.io/jotsum/ "jotsum"
[2]: https://github.com/jerik/jotsum "GitHub - jerik/jotsum: smart online calculations - your ancillary account"

## Übergabe von Dateien

Coole Idee — ja, es gibt mehrere Wege, die Live-Page so zu öffnen, dass eine Textdatei „mitkommt“ und zeilenweise eingelesen wird. Kurz die Optionen (von „am einfachsten“ bis „mächtiger“), plus wie du’s in **jotsum** einbaust:

# 1) `?text=` Query-Parameter (kleine Inhalte)

* **Wie:** `https://jerik.github.io/jotsum/?text=3%20apples%20%2B%204%0A2*7`
* **Pro:** Kein zusätzlicher Host nötig, sofort startklar.
* **Contra:** URL-Längenlimit (praktisch \~2–4 KB, browserabhängig).
* **Implementierung (JS):**

  ```js
  const params = new URLSearchParams(location.search);
  const text = params.get('text');
  if (text) loadTextIntoJotSum(decodeURIComponent(text));
  ```

# 2) `?url=` Query-Parameter (größere Dateien per Fetch)

* **Wie:** `https://jerik.github.io/jotsum/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fuser%2Frepo%2Fbranch%2Ffile.txt`
* **Pro:** Beliebig groß, Link bleibt kurz.
* **Contra:** **CORS** muss erlauben, dass die Datei von dort gelesen werden darf. Raw-Links von GitHub/Gist funktionieren i. d. R. mit CORS.
* **Implementierung:**

  ```js
  const url = new URLSearchParams(location.search).get('url');
  if (url) {
    fetch(url).then(r => r.text()).then(loadTextIntoJotSum)
             .catch(err => alert('Laden fehlgeschlagen: ' + err));
  }
  ```
* **Tipp:** Fehlermeldung anzeigen, wenn `fetch` wegen CORS scheitert; **keine** Proxys by default.

# 3) `#text=` im URL-Fragment (Datenschutz + etwas mehr Platz)

* **Wie:** `https://jerik.github.io/jotsum/#text=...` (optional **komprimiert** + Base64)
* **Pro:** Fragment geht **nicht** an den Server; gut für sensiblere Daten.
* **Contra:** Ähnliche Größenlimits wie Query, aber du kannst komprimieren (z. B. LZ-String).
* **Implementierung (einfach):**

  ```js
  if (location.hash.startsWith('#text=')) {
    const raw = decodeURIComponent(location.hash.slice(6));
    loadTextIntoJotSum(raw);
  }
  ```

  *(Optional Kompression: LZ-String Base64 im Hash.)*

# 4) `data:`-URL über `?url=` (kompakt & ohne CORS)

* **Wie:** Generiere clientseitig `data:text/plain;base64,....` und setze sie in `?url=`.
* **Pro:** Kein CORS nötig, große Inhalte möglich (Browser-Grenzen beachtet).
* **Contra:** Sehr lange URLs, kann unpraktisch sein.

# 5) Datei-Upload / Drag-&-Drop (für lokale Files)

* **Wie:** Button „Datei öffnen…“ (`<input type="file" accept=".txt">`) + Drag\&Drop-Zone.
* **Pro:** Endnutzer-freundlich, kein Hosting/CORS.
* **Contra:** Kein „ein-Klick-Link“; Nutzer muss die Datei auswählen.
* **Implementierung:**

  ```html
  <input id="file" type="file" accept=".txt">
  <script>
  document.getElementById('file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => loadTextIntoJotSum(reader.result);
    reader.readAsText(f);
  });
  </script>
  ```

# 6) PWA „Share Target“ (fortgeschritten, mobil genial)

* **Wie:** JotSum als PWA mit `share_target` im Manifest registrieren; dann kann man in Android/iOS „Teilen → JotSum“ wählen, auch **Dateien**.
* **Pro:** Super UX auf Mobilgeräten, direkte Übergabe von Dateien/Text.
* **Contra:** Etwas Setup (Manifest + Service Worker, HTTPS hast du via GitHub Pages).

---

## Empfehlungen für JotSum (konkret)

1. **Sofort umsetzbar:** Implementiere **(1) `?text=`** und **(2) `?url=`** – damit deckst du „klein & schnell“ und „groß & extern gehostet“ ab.
2. **Nice-to-have:** **(5) Datei-Upload/Drag\&Drop** für lokale Dateien.
3. **Bonus/Privacy:** **(3) `#text=`** (optional mit Kompression), damit Inhalte nicht im Server-Log landen.
4. **Langfristig:** **(6) PWA Share Target** für mobiles „Teilen an JotSum“.

Dein Repo & die Live-Page (Stand jetzt) zeigen noch keine Parameternutzung; du kannst die obigen Snippets in `jotsum.js` integrieren und beim Start prüfen, ob `text`, `url` oder `#text=` gesetzt sind, und dann in das bestehende Eingabefeld übernehmen. Danach läuft die normale zeilenweise Verarbeitung. ([GitHub][1])

Wenn du willst, schreibe ich dir die konkreten Patches (inkl. kleiner UI-Hinweise: „Datei / Link laden“) für `jotsum.js` und `index.html`.

[1]: https://github.com/jerik/jotsum "GitHub - jerik/jotsum: smart online calculations - your ancillary account"

## zeilen diktat

Kurzfassung: Auf dem iPhone feuert **Diktat** keine/kaum *Tastatur*-Events (`keydown/keyup`). Wenn deine Berechnung nur an solche Events gekoppelt ist, passiert nichts – erst wenn du manuell tippst. Lösung: an **„echte Eingabe“-Events** hängen und notfalls einen kleinen Fallback-Watcher einbauen.

## Was du ändern solltest

1. **Nicht** (nur) auf `keydown/keyup` hören, sondern auf diese Events:

* `input` (Haupt-Event)
* `beforeinput` (liefert `event.inputType`, z. B. `insertFromDictation`)
* `change`, `paste`, `drop`, `compositionend`
* optional: throttled `selectionchange` (iOS feuert das beim Diktat oft)

2. **Debounce/Throttle**, damit bei langen Diktaten nicht dauernd gerechnet wird.

3. **Fallback**: Ein leichter „Value-Watcher“, falls iOS in seltenen Fällen kein `input` liefert.

## Beispiel (minimal & robust)

```js
// einmalig beim Initialisieren
const ta = document.querySelector('#jotsum-input'); // dein Textfeld
let lastVal = ta.value;
const recalc = (() => {
  let t;
  return () => { clearTimeout(t); t = setTimeout(() => computeAll(ta.value), 120); };
})();

// 1) Primäre Eingabe-Events
['input','beforeinput','change','paste','drop','compositionend']
  .forEach(ev => ta.addEventListener(ev, recalc, {passive:true}));

// 2) iOS-spezifisch: selectionchange (sparsam!)
let selTick = 0;
document.addEventListener('selectionchange', () => {
  // nur wenn unser Feld aktiv ist – und nicht öfter als ~5x/Sek.
  if (document.activeElement === ta && (++selTick % 6 === 0)) recalc();
}, {passive:true});

// 3) Fallback-Watcher (nur wenn Wert sich „heimlich“ ändert)
setInterval(() => {
  if (ta.value !== lastVal) {
    lastVal = ta.value;
    recalc();
  }
}, 500);
```

Optional: Wenn du mehrere Zeilenfelder hast, die gleiche Event-Liste pro Feld anhängen. In `beforeinput` kannst du außerdem gezielt auf Diktat reagieren:

```js
ta.addEventListener('beforeinput', (e) => {
  if (e.inputType === 'insertFromDictation') recalc();
}, {passive:true});
```

> TL;DR: Rechne auf `input`/`beforeinput` statt auf Tastatur-Events – und halte einen kleinen Fallback bereit. Dann werden Zeilen auch bei iOS-Diktat sofort verarbeitet.

--> Das gilt auch für Android
