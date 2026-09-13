# jotsum

**jotsum** lets you jot down notes with numbers, and it sums them up instantly.

It is a simple browser-based tool for quick, line-by-line calculations. You can freely mix text and numbers in each line, for example:

```
3 apples + 4 pears
```

The numbers are extracted, calculated as a subtotal, and all subtotals are summed into a final total.

**Try it directly in your browser:** [https://jerik.github.io/jotsum/](https://jerik.github.io/jotsum/)

---

## How it works

* Each line can contain both text and numbers with operators
* Subtotals are calculated per line
* All subtotals are automatically added up

---

## Paste behavior

When you paste multi-line text, each line becomes its own calculation — and the results are instantly updated.

---

## Signed numbers

Lines can end with a signed amount (positive or negative), even if there's text before it:

```
Fuel -45.50 EUR
Refund +200
```

Both lines are extracted and included in the total.

---

## Skipping numbers

Prefix a number with a single quote (`'`) to exclude it from calculations — just like in Excel. The quote works only directly before a digit; words like `don't` are unaffected:

```
Invoice '2024 Material 500       → 500
```

Only `500` is counted; `2024` is skipped.

---

## Variables

Define a variable with `:name = expression`. Later lines can use it by writing `:name`. Variable definitions are not included in the total:

```
:rate = 85
Consulting 12 * :rate            → 1020
```

---

## Subtotals

A line containing only `---` shows the sum of all values since the last `---` and stores it as `:SUBTOTAL-1`, `:SUBTOTAL-2`, etc. Subtotals themselves are not double-counted in the final total:

```
Position A 100
Position B 200
---                              → 300, saved as :SUBTOTAL-1
VAT :SUBTOTAL-1 * 0.19           → 57
```

---

## Start with a link
You don’t even need to type or paste: JotSum can take a text directly from the URL. Just add `?text=...` at the end of the link, and your notes will appear instantly. Multi-line texts are split into rows, ready for calculation. 

**Try the example**:  
[https://jerik.github.io/jotsum/?text=3+apples+%2B+4+pears%0A2+bananas+*+7+melons](https://jerik.github.io/jotsum/?text=3+apples+%2B+4+pears%0A2+bananas+*+7+melons)

---

## Keyboard shortcuts

* **Enter**: On the last line → create a new line. Otherwise → move down one line
* **Ctrl + Enter**: Insert a new line below the current one
* **Ctrl + Delete**: Remove the current line
* **Arrow Up / Down**: Move between lines

