# jotsum

jotsum lets you jot down notes with numbers, and it sums them up instantly.

It is a simple browser-based tool for quick, line-by-line calculations. You can freely mix text and numbers in each line, for example:

```
Tickets 2 * 49           98
Hotel 3 nights * 120    360
Fuel there and back      80
                        538
```

The numbers are extracted, calculated as a line result, and all line results are summed into a final total.

Try it directly in your browser: **[jerik.github.io/jotsum](https://jerik.github.io/jotsum/)** — no account, no installation. The page can be saved for offline use.

## Vorschau

Jeder Branch `objective/OBJ-<n>` wird unter
`https://jerik.github.io/jotsum/preview/OBJ-<n>/` als Vorschau veröffentlicht.
Die Hauptseite unter `/jotsum/` wird weiterhin aus `master` gebaut. Jeder
Workflow-Lauf baut alle vorhandenen `objective/*`-Branches neu; gelöschte
Branches verschwinden beim nächsten Lauf aus der Vorschau.
Nach dem Merge muss der Owner unter **Settings → Pages → Source** auf
**GitHub Actions** umstellen. Erst dann veröffentlicht dieser Workflow die Seite.

---

## At a glance

| | |
| --- | --- |
| Line result | Each line is evaluated on its own; the result appears on the right, rounded to two decimals |
| Total | All line results are summed at the bottom |
| Escaping | `'2024` keeps a number out of the calculation |
| Headings | `# Rechnung 2024` labels a section without counting its numbers |
| Variables | `:rate = 85`, used later as `12 * :rate` |
| Subtotals | A `---` line sums the block above it and stores it as `:SUBTOTAL_n` |
| Error hints | Structurally broken lines show `?` and stay out of the total |
| Input | Type, paste multiple lines at once, or pass text in the URL |

---

## Writing a calculation

A line is evaluated left to right with the usual precedence; parentheses work as expected. Text between the numbers is dropped before evaluation, so labels cost nothing.

```
Coffee beans 2 * 8.50     17
Filters 4.20            4.20
                       21.20
```

Results are shown rounded to two decimals, whole numbers without any. Only the display is rounded — the calculation keeps full precision, so three lines of `1 / 3` each show `0.33` while the total shows `1`.

An apostrophe directly before a digit keeps that number out of the calculation:

```
Invoice '2024 Material 500     500
```

Only `500` is counted. The apostrophe has to sit directly in front of a digit, so words like `don't` are unaffected.

---

## Headings

Start a line with one to six `#` characters followed by a space (for example, `# Rechnung 2024` or `## Materials`). Headings appear larger and bold, with no line result. Their numbers and expressions are excluded from the total and all subtotals. A heading does not start a new subtotal block; use `---` for that.

---

## Variables

A line of the form `:name = value` defines a variable. Any later line can read it as `:name`. Definition lines are greyed out and do not count towards the total.

```
:rate = 85                85
Consulting 12 * :rate   1020
Workshop 4 * :rate       340
                        1360
```

Variables are resolved in document order, so a definition has to come before its use. A name is made of letters, digits and underscores and cannot start with a digit, so `:1Test = 5` is not a definition. Names are case-sensitive: `:Auto = 5` does not define `:auto`, which produces "Unknown variable :auto" when used. A dash is always the operator, so `:SUBTOTAL_1-50` is a subtraction.

---

## Subtotals

A line containing only `---` sums the line results since the previous `---` and stores that value as `:SUBTOTAL_1`, `:SUBTOTAL_2`, and so on.

```
Design 12 * 85           1020
Development 30 * 85      2550
---                      3570
VAT :SUBTOTAL_1 * 0.19  678.30
                       4248.30
```

A subtotal only reads lines that are already part of the total, so it is not added a second time.

---

## When a line is broken

Text alone is not an error: `apples` evaluates to 0 by design. A line is only flagged when its structure cannot be resolved. The sum column then shows `?`, the line is marked, and the reason appears in the tooltip. The line is excluded from the total; the rest of the sheet is unaffected.

| Case | Example |
| --- | --- |
| Missing operator between two numbers | `(2+3) (4+5)` |
| Operator without a value | `5 +` |
| Unbalanced parentheses | `(2+3` |
| Undefined variable | `12 * :rate` |
| Division by zero | `10 / 0` |

No hint is shown while the caret is in the line, since a half-typed line is broken more often than not. It appears once the line loses focus.

---

## Input

**Paste.** Pasting multi-line text creates one line per row and evaluates all of them.

**Saved sheets.** Every sheet is saved automatically in this browser and restored after a reload or reopening the page. Several sheets are kept side by side; see [Shortsaves](#shortsaves).

**URL.** `?text=...` opens the given text as a sheet of its own on load, with `%0A` as the line break. It becomes a new shortsave and does not overwrite any existing one; after a reload it is not imported again:

URL input preserves blank lines (including an empty `?text=`) and is decoded once, so literal `%` text is kept. Paste drops blank lines.

[`?text=3+apples+%2B+4+pears%0A2+bananas+*+7+melons`](https://jerik.github.io/jotsum/?text=3+apples+%2B+4+pears%0A2+bananas+*+7+melons)

**Offline.** Saving the page stores one self-contained HTML file, including the script, so it runs without a connection.

---

## Shortsaves

Every sheet is a shortsave. It is saved automatically on every change; there is no save button.

**New page.** The **New page** icon in the header opens an empty sheet. All existing shortsaves are kept.

**Saved sheets.** The **Saved sheets** list shows every shortsave, named after its first line (a heading without its `#`, an empty sheet as `Untitled`). Right of the name, each entry shows the sheet's total, rounded as under the sheet; a sheet without a number shows no total, and long names are shortened. The sheet that is open is highlighted. From 900 px width the list stands next to the sheet. On narrower screens it opens as a drawer via the menu icon in the header and closes again with the same icon, a tap on the backdrop, `Escape`, or by opening an entry.

**Open and edit.** Tap or click an entry to open it. You keep editing it in place, and every change lands in the same shortsave.

**Delete.** The delete icon next to an entry asks for confirmation (“Delete this sheet?”) and then removes it for good; there is no undo. Deleting the sheet that is open leaves an empty sheet.

**Only this browser.** Shortsaves live in the localStorage of this browser on this device. Nothing is synced, another browser or device does not see them, and clearing the site data deletes them. There is no export or import yet ([#7](https://github.com/jerik/jotsum/issues/7)).

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Enter` | On the last line: new line. Otherwise: move down |
| `Ctrl + Enter` | Insert a new line below the current one |
| `Ctrl + Shift + Enter` | Insert a new line above the current one |
| `Ctrl + Delete` | Remove the current line |
| `↑` / `↓` | Move between lines |

---

Source and issues on [GitHub](https://github.com/jerik/jotsum).
