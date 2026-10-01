---
name: termwire-open
description: Show the user a file in their editor instead of pasting its path. Use whenever you mention a file worth looking at — a plan, a diff, a failing test, a file you just wrote. Needs a shell created by `termwire up`.
---

# Show a file in the user's editor

```bash
termwire open <path>[:<line>]
```

- A trailing `:42` selects the line, so `src/app.ts:42` opens line 42.
- `--line 42` does the same and leaves the path alone, which is how to open a file whose
  name ends in a colon and digits.
- A relative path resolves from the working directory. The command prints the absolute
  path it opened.

The file opens in the Neovim of the user's workspace and the editor pane takes focus, so
the user is looking at the file rather than at a path they have to find.

## When it does not work

It needs `TERMWIRE_SOCKET`, which `termwire up` exports into every pane of the
workspace. Started anywhere else, it fails with `not inside a termwire workspace` — then
name the path in your answer instead and carry on.

<!-- managed by `termwire install`; delete this line to keep your own version -->
