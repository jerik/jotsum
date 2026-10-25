# Conventions

Binding for everyone working in this repository, humans and agents. The
dispatcher of [agenterix](https://github.com/jerik/agenterix) appends this file
to the prompt of every run on this repository.

## A code change must be testable by hand

jotsum is a browser tool with no build step and no server. The owner tests it
by opening one file. Two commands have to keep working after every change:

```bash
npm run test:unit            # must be green
./generate-single-html.sh    # must produce a working single-file index.html
```

- **Unit tests run on plain node**, no browser, no network:
  `tests/unit/<topic>.test.js`, started through `test:unit` in `package.json`.
  A new test file has to be added to that script, otherwise nobody runs it.
- **Browser globals come from `tests/unit/mock.js`.** If a change needs a new
  one (`localStorage`, `location`, …), extend the mock there — do not write a
  test that only runs in a real browser.
- **Playwright does not run on this machine.** `playwright.config.js` records
  it: `playwright install` hangs. A Playwright test is therefore never the only
  coverage for a behavior — it is documentation of intent, and the unit suite
  is the proof. A change whose tests cannot start here counts as untested.
- **End the answer with `Verify: <command>`** — the one command that shows the
  change works, usually `npm run test:unit`. The dispatcher runs it and puts
  the result in the pull request.

## Do not commit the generated single file

`index.html` is **generated** from `jotsum.html` plus `jotsum.js` by
`generate-single-html.sh`, and it carries a build stamp. Change the two
sources; leave the artifact alone.

**The workflow owns it**, not you: `.github/workflows/create-single-html.yml`
runs the script on every push to `master` that touches `jotsum.html` or
`jotsum.js` and commits the result as "Automated file merge". GitHub Pages then
serves that file from `master:/`, so it has to stay in the repository — the
`index.html` line in `.gitignore` is a leftover and has no effect on a tracked
file.

Reason for the rule: agents work on parallel branches off the default branch.
If each branch regenerated the 37 kB artifact, every two branches would collide
in a file nobody edits by hand — and the collision would be with the bot's
commit.

## Where things live

| | |
| --- | --- |
| `jotsum.html` | markup and style — the source, not the deliverable |
| `jotsum.js` | all logic |
| `index.html` | generated single file, do not edit or regenerate |
| `tests/unit/` | the suite that actually runs here |
| `tests/` | Playwright specs — intent, not proof |
| `readme.md` | end-user documentation, English |

## Language

Everything is English: code, comments, commit messages, pull request bodies,
`readme.md`.

## Commits

Small and focused. The message says *why*; the diff says what. Never
`git push`, never `gh` — the dispatcher opens the pull request.

## When something is unclear

Pick the most reasonable reading, do the work, and state the assumption.
Nobody is watching, so do not stop to ask. If you are blocked, say so plainly:
a clear failure beats a plausible guess.

If a change alters behavior that was not asked for — a default, a filter, an
encoding — say so in the answer. In this repository that has already cost real
work: a run silently dropped the blank-line filtering in `handle_url_params()`,
and another agent's analysis was built on it.
