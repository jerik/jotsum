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

---

## At a glance

| | |
| --- | --- |
| Line result | Each line is evaluated on its own; the result appears on the right |
| Total | All line results are summed at the bottom |
| Escaping | `'2024` keeps a number out of the calculation |
| Variables | `:rate = 85`, used later as `12 * :rate` |
| Subtotals | A `---` line sums the block above it and stores it as `:SUBTOTAL-n` |
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

An apostrophe directly before a digit keeps that number out of the calculation:

```
Invoice '2024 Material 500     500
```

Only `500` is counted. The apostrophe has to sit directly in front of a digit, so words like `don't` are unaffected.

---

## Variables

A line of the form `:name = value` defines a variable. Any later line can read it as `:name`. Definition lines are greyed out and do not count towards the total.

```
:rate = 85                85
Consulting 12 * :rate   1020
Workshop 4 * :rate       340
                        1360
```

Variables are resolved in document order, so a definition has to come before its use. A name may contain dashes; 

---

## Subtotals

A line containing only `---` sums the line results since the previous `---` and stores that value as `:SUBTOTAL-1`, `:SUBTOTAL-2`, and so on.

```
Design 12 * 85           1020
Development 30 * 85      2550
---                      3570
VAT :SUBTOTAL-1 * 0.19  678.30
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

**URL.** `?text=...` fills the sheet on load, with `%0A` as the line break:

[`?text=3+apples+%2B+4+pears%0A2+bananas+*+7+melons`](https://jerik.github.io/jotsum/?text=3+apples+%2B+4+pears%0A2+bananas+*+7+melons)

**Offline.** Saving the page stores one self-contained HTML file, including the script, so it runs without a connection.

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Enter` | On the last line: new line. Otherwise: move down |
| `Ctrl + Enter` | Insert a new line below the current one |
| `Ctrl + Delete` | Remove the current line |
| `↑` / `↓` | Move between lines |

---

Source and issues on [GitHub](https://github.com/jerik/jotsum).
