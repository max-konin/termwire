# @openbridge/opencode-plugin

A lightweight OpenCode plugin. Its job is to collect the files OpenCode
touches during the current session, so they can later be opened via
`openbridge open` / `openbridge files`.

## Why it exists

Without it, the user would have to manually hunt for the files the agent
edited. The plugin listens to OpenCode events and appends touched files to the
workspace state file — the same file the CLI reads.

## Responsibilities

- observe when OpenCode edits and reads files
- initially only **edited** and **read/mentioned** files
- append them (path relative to the workspace root) to the state file

## Design principle

Keep as little logic as possible in the plugin. It does **not** shell out to
the CLI — instead it imports the state module directly as `@openbridge/cli/state`
and writes through it to the shared state file. The single source of truth is
`/tmp/openbridge/<session>.json`.

> This information lives only for the active session; there is no persistence
> in the MVP.
