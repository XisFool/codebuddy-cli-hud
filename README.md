# codebuddy-cli-hud

A compact terminal HUD for the CodeBuddy Code statusLine. The host pipes session JSON into
this program on stdin every ~300ms; it prints a dashboard of at most 4 lines.

- **Zero npm dependencies** — only Node.js built-ins.
- **Node >= 18.**
- Budget: the whole run must stay well under **1500ms**.
- Always exits **0**. Any internal failure degrades silently to a shorter line, never to a
  broken statusLine.

## Install

```bash
node runtime/bin/codebuddy-hud.js --setup      # register the statusLine
node runtime/bin/codebuddy-hud.js --status     # preview with sample data
node runtime/bin/codebuddy-hud.js --uninstall  # remove the statusLine entry
```

`--setup` writes a `statusLine` entry into CodeBuddy's `settings.json` and backs up any
existing one to `settings.json.bak.codebuddy-hud`.

## Platform behaviour

| | Windows | Linux / macOS / WSL |
|---|---|---|
| Registered command | `"<...>\codebuddy-hud.cmd"` | `"/path/to/node" "/path/to/codebuddy-hud.js"` |
| Shim | `.cmd` shim generated next to the entry point | none needed |
| Executable bit | n/a | `chmod 755` best-effort, silent on failure |

On POSIX the paths are embedded in a double-quoted shell word, so `"`, `` ` ``, `$` and `\`
inside an install path are backslash-escaped and cannot be expanded by the shell.

`settings.json` lives under `~/.codebuddy` (following CodeBuddy itself); there is no XDG
handling. Override the location with `CODEBUDDY_HOME` or `CODEBUDDY_SETTINGS_PATH`.

## Unicode detection

Glyphs degrade to ASCII when the terminal cannot render Unicode. On Windows the code page is
probed via `chcp.com`. Elsewhere the decision is, in order:

1. `CODEBUDDY_HUD_FORCE_ASCII=1` → ASCII; `CODEBUDDY_HUD_FORCE_UNICODE=1` → Unicode.
2. Otherwise the first non-empty of `LC_ALL` / `LC_CTYPE` / `LANG` decides — it must contain
   `utf-8` or `utf8`. An explicit `LANG=C` therefore means ASCII.
3. If all three are unset (typical in containers and over SSH), UTF-8 is assumed — except
   when `TERM` is `dumb` or `linux`, which are known not to render it.

| Environment | Result |
|---|---|
| `LANG=en_US.UTF-8` | Unicode |
| `LANG=C` | ASCII |
| `LC_ALL=C LANG=en_US.UTF-8` | ASCII (`LC_ALL` wins) |
| no locale variables set | Unicode |
| no locale variables, `TERM=dumb` or `TERM=linux` | ASCII |
| `CODEBUDDY_HUD_FORCE_ASCII=1` | ASCII (overrides everything) |

## Latest tool activity

Line 4 can show the tool call currently in flight, e.g. `◐ Edit: auth.ts`.

The transcript at `transcript_path` is read by **tail only** — a 16KB window is scanned
backwards from EOF (up to a 256KB ceiling), never the whole file, because transcripts grow
to many megabytes. Lines can be several KB, so if a window holds no tool call the scan slides
further back rather than giving up. Measured cost is well under 1ms per invocation.

A call is `active` (◐, cyan) until a matching result id appears, then `done` (✓, dim). The
detail shown is derived from `file_path` / `path` / `notebook_path` (basename only) or from
`command` / `pattern` / `query` / `url` (first few words).

## Configuration

Defaults ship in `runtime/codebuddy-hud.config.json`. Drop a `codebuddy-hud.config.json` in
your project directory to override any part of it — the two are deep-merged.

```json
{
  "display": {
    "showToolActivity": true,
    "toolActivityTailBytes": 16384
  }
}
```

- `showToolActivity` — set `false` to hide the tool segment.
- `toolActivityTailBytes` — size of the tail window per scan step.

All external strings pass through `sanitizeTerminalText()`, so a hostile transcript cannot
inject ANSI/OSC escape sequences into your terminal.

## Development

```bash
npm test     # unit tests (node --test)
npm run verify  # end-to-end: fixtures through the real entry point
```

Both are cross-platform — the test glob is expanded by Node itself, not by the shell.
