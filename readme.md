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

