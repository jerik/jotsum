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

## Objective previews

Each `objective/OBJ-<n>` branch is published at
`https://jerik.github.io/jotsum/preview/OBJ-<n>/`.
The main app at `/jotsum/` is still built from `master`. Each workflow run
rebuilds all existing `objective/*` branches; deleted branches disappear from
the previews on the next run. After merging, the owner must set
**Settings → Pages → Source** to **GitHub Actions** for this workflow to publish.

Each Objective preview has its own browser storage, separate from the main app
and every other Objective. Sheets, tab selections, migration state and recovery
copies stay within that preview. Two tabs of the same Objective share its saved
sheets, with the tab behavior described below. Preview sheets do not appear in
the main app or another Objective, and vice versa.

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

Variables are resolved in document order, so a definition has to come before its use. A name starts with a letter or `_` and continues with letters, digits and `_`; it never contains a `-`. So `:1Test = 5` is not a definition. Names are case-sensitive: `:Auto = 5` does not define `:auto`, which produces "Unknown variable :auto" when used. A dash is always the operator, so in `:SUBTOTAL_1-50` the `-` is a subtraction.

A `:` in front of a digit never starts a variable. With a digit directly before and directly after it, the `:` is part of a time, and a time is text:

```
Price:100                100
Time 10:30                 0
                         100
```

`Price:100` counts as 100. `Time 10:30` yields no number and no error; like any text it shows 0.

---

## Subtotals

A separator line sums the line results since the previous separator, shows that subtotal, and stores it as `:SUBTOTAL_1`, `:SUBTOTAL_2`, and so on. A line is a separator when it starts with three or more `-` followed by a space or the end of the line.

```
Design 12 * 85           1020
Development 30 * 85      2550
---                      3570
VAT :SUBTOTAL_1 * 0.19  678.30
                       4248.30
```

A subtotal only reads lines that are already part of the total, so it is not added a second time.

Everything after the dashes is only a label:

```
Rent 800                  800
--- Miete                 800
Fee 20                     20
--- 5                      20
                          820
```

Both `--- Miete` and `--- 5` show the subtotal; the `5` counts nowhere. Without the space, `---5` is no separator but an ordinary line with a number.

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

A line with an operator but no complete expression is an error too, for example `-`, `Lunch 12 + .` or `:rate = -`. It shows `?` and does not count towards the total. Text without numbers, like `make-love-not-war`, stays free of errors.

A broken definition leaves no valid value behind, even if the variable had one before. Every line that uses the variable then shows `?` as well:

```
:rate = 85                85
Before 2 * :rate         170
:rate = -                  ?
12 * :rate                 ?
                         170
```

No hint is shown while the caret is in the line, since a half-typed line is broken more often than not. It appears once the line loses focus.

---

## Input

**Paste.** Pasting multi-line text creates one line per row and evaluates all of them.

**Saved sheets.** Sheets are saved automatically in this browser. A tab can restore its own selection after a reload when sessionStorage is available; a tab without its own selection starts empty after migration. Several sheets are kept side by side; see [Shortsaves](#shortsaves) and [Working in multiple tabs](#working-in-multiple-tabs).

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

**Delete.** The delete icon next to an entry asks for confirmation (“Delete this sheet?”) and then removes the saved sheet; there is no undo button. Deleting the sheet that is open leaves an empty sheet. Another tab still displaying it can restore it by continuing to type; see [A notice about another tab](#a-notice-about-another-tab).

**Only this browser.** Shortsaves live in the localStorage of this browser on this device. Nothing is synced, another browser or device does not see them, and clearing the site data deletes them. There is no export or import yet ([#7](https://github.com/jerik/jotsum/issues/7)).


## Working in multiple tabs

Each tab has its own sheet selection. Opening a saved sheet or choosing **New
page** in one tab does not change what another tab has open. With available
sessionStorage, that selection survives a reload in the same tab. If
sessionStorage is unavailable, the selection falls back to memory for the
current page only; it cannot be retained across a reload.

The one-time migration preserves the old saved sheet and can select it in the
tab performing the migration. After migration, a tab without its own valid
selection starts with a new empty sheet, rather than taking another tab's
selection. Existing saved sheets remain available in **Saved sheets**. A
browser's duplicate-tab feature may copy sessionStorage, so a duplicated tab
can initially have the same selection.

There is no live synchronization of the open editor. The saved-sheet list can
update when another tab saves, but your displayed text and selection stay as
they are. Changes to different sheets are saved independently. If two tabs edit
the same sheet, the last successful save wins for the whole sheet; their text
is not merged. Reloading a tab with a retained selection reads the latest saved
version of that sheet. If it has been deleted, the tab opens an empty sheet.

### A notice about another tab

When another tab changes or deletes your open sheet, a notice explains what
happened without replacing your text. The buttons currently use German labels:

| Action | Sheet changed in another tab | Sheet deleted in another tab |
| --- | --- | --- |
| **Neu laden** (reload) | Replaces your editor text with the latest saved version, including saves made after the notice appeared. Further typing saves to that same sheet. | Opens a new empty sheet. Further typing creates a new saved sheet with a new ID. |
| **Schließen** (close) | Hides the notice and keeps your text and selection. It does not save or accept the foreign version. | Hides the notice and keeps your text and its original sheet ID. It does not restore the deleted sheet by itself. |
| Continue typing, with the notice open or after closing it | Saves your current editor text over the foreign version of the same sheet. | Restores your current editor text as the same sheet under its original ID. |

Merely focusing the editor or moving the caret does not overwrite a foreign
change or restore a deleted sheet. **Neu laden** abandons your current editor
version, including any local edits that could not be saved. If the saved data
cannot be read, the editor and notice remain in place. A successful save after
continued typing dismisses the notice; a failed save leaves it visible.

### Owner review in an Objective preview (KR8: open)

KR8 remains **open until the owner explicitly confirms it**. Only the owner
decides whether the notice and its actions are understandable and unobtrusive,
and whether this documentation fits. Passing automated tests does not provide
that confirmation.

Use disposable sheets in the deployed Objective preview under review. Replace
`OBJ-<n>` in `https://jerik.github.io/jotsum/preview/OBJ-<n>/` with its actual
Objective ID. Use the same browser profile in both tabs so they share storage.
Open tab B by entering the same URL in a fresh tab, without `?text=`, rather than
using the browser's duplicate-tab command.

1. In tab A, choose **New page** and type `Owner review 10`. In tab B, select
   that sheet from **Saved sheets**. Both editors should show `Owner review 10`.
   For the independent-selection check, choose **New page** in B and type
   `Separate 20`: A must stay on `Owner review 10`. Reload both tabs and check
   that each keeps its own selection. Then select `Owner review 10` again in B.
2. **Foreign change → Neu laden:** In A, replace the line with `Remote 30`.
   In B, check that the old text remains and a change notice appears. In A,
   change it again to `Newest 40`. Click **Neu laden** in B: it must show
   `Newest 40` and dismiss the notice. Type `After reload 50` in B; reload A
   and check that the same sheet now contains `After reload 50`.
3. **Foreign change → Schließen → typing:** With both tabs on that sheet,
   change A to `Foreign 60`. In B, click **Schließen**: the notice disappears,
   but B keeps `After reload 50`. Move the caret or focus away and back; reload
   A to confirm that `Foreign 60` remains saved. Now change B to `Local 70`.
   Reload A: the same sheet must contain `Local 70`.
4. **Foreign deletion → Neu laden:** With B still on that sheet, delete it in
   A's **Saved sheets** list and confirm deletion. B must retain `Local 70`
   and show the deletion notice. Click **Neu laden** in B: an empty sheet must
   open. Type `New after deletion 80`; it must appear as a new saved sheet,
   while the deleted `Local 70` sheet stays absent.
5. **Foreign deletion → Schließen → typing:** Open `New after deletion 80`
   in both tabs, then delete it in A. In B, click **Schließen** and check that
   its text stays visible. Focus or move the caret without editing: the sheet
   must remain absent from A's list. Change B to `Restored 90`: the sheet must
   reappear in A's list. Open it in A to confirm the restored text. This
   restores the original sheet ID rather than creating a different sheet.
6. Repeat a foreign change and a foreign deletion on disposable sheets, this
   time typing in B while the notice is still open. Confirm the same overwrite
   and restoration outcomes as after **Schließen**, and that successful saving
   hides the notice.
7. Open the main app and, if available, a different Objective preview. Confirm
   that the review sheets are absent there and their sheets are absent in the
   reviewed preview. Do not clear all site data, which would also remove other
   Objectives' and the main app's saved sheets.

For explicit owner confirmation, review the sections **Objective previews**,
**Working in multiple tabs**, **A notice about another tab**, and this checklist.
Record the preview URL, the browser used, the results of the scenarios above,
and whether the notice, both actions and the consequences of continued typing
are clear and do not interfere with work. Confirm whether the README wording
matches those observations. Until the owner explicitly accepts both the UI
behavior and the documentation, KR8 stays open.

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
