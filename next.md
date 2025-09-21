# Next steps
- funktion um ein neues rechnungsseite aufzurufen
- die rechnungen im localstorage speichern
- aus der zwischenablage ein mehrzeiligen text "importieren". jede zeile ist eine zeile in nebenrechnung mit automatischem calc

# Chat GPT Suggestions
Super Projekt – ich hab’s mir angeschaut (Demo-Seite + Repo) und sehe schon ein paar mobile-Hebel. Auf der Page gibt’s z. B. den „Add line“-Button, die Versionsanzeige und den Hinweis „Just download this page for offline usage“, der Ansatz passt also gut für ein **leichtes, offline-fähiges** Tool im Browser. ([jerik.github.io][1])
Im Repo liegen `index.html`, `nebenrechnung.html` und `nebenrechnung.js`, plus Tests/Playwright-Config – prima Grundlage für saubere Mobile-Optimierungen. ([GitHub][2])

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
    const payload = { title: 'Nebenrechnung', text };
    if (navigator.share) await navigator.share(payload);
    else downloadTxt(text); // Fallback
  }
  ```
* Zusätzlich Export als **.txt/.csv**, damit mobile Office/Notizen-Apps es direkt öffnen.

## 8) PWA: Installierbar + Offline ohne „Speichern“

* `manifest.webmanifest` (Name, Icons in 192/512, Start-URL `nebenrechnung.html`).
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
  "name": "Nebenrechnung",
  "short_name": "Nebenrechnung",
  "start_url": "nebenrechnung.html",
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
const CACHE = "nebenrechnung-v1";
const ASSETS = ["/nebenrechnung.html","/nebenrechnung.js","/styles.css","/manifest.webmanifest"];
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

Wenn du magst, bastle ich dir die **konkreten Diffs** für `nebenrechnung.html`/`.js` (Meta-Tags, Toolbar, PWA-Files) passend zu deiner Struktur – dann kannst du sie direkt ins Repo übernehmen.

[1]: https://jerik.github.io/nebenrechnung/ "nebenrechnung"
[2]: https://github.com/jerik/nebenrechnung "GitHub - jerik/nebenrechnung: smart online calculations - your ancillary account"

