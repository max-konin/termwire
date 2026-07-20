# Releasing Termwire

This is a manual release. Create the npm organization `@termwire`, grant
publish rights, enable 2FA, and run `npm login`. Do not use `changeset publish`,
GitHub Actions, OIDC, or a long-lived `NPM_TOKEN`. Never run `bun publish` from
a package root: publish only the validated retained archive.

Start with clean `master`, Bun `1.3.14`, and `bun ci`. Verify `origin` is
`https://github.com/max-konin/termwire`; if absent, the one-time manual
bootstrap is `git remote add origin https://github.com/max-konin/termwire.git`.

```bash
bun run lint
bun test
bunx tsc --noEmit
bunx changeset status --verbose
bun run version-packages
rm bun.lock
bun install --lockfile-only
bun run build
bun run pack:check
```

`rm bun.lock` intentionally regenerates the lockfile from versioned manifests;
review it. If regeneration fails, restore `bun.lock` from Git before publication.
Review versions, changelogs, and lockfile, then create a local release commit
without pushing. Retain artifacts outside the repository and recompute every
checksum before publishing:

```bash
RELEASE_DIR=$(mktemp -d)
bun run pack:prepare "$RELEASE_DIR"
RELEASE_DIR="$RELEASE_DIR" bun -e '
const dir = process.env.RELEASE_DIR;
const artifacts = await Bun.file(`${dir}/release-artifacts.json`).json();
if (artifacts.length !== 4) throw new Error("expected four artifacts");
for (const artifact of artifacts) {
  const bytes = new Uint8Array(await Bun.file(artifact.path).arrayBuffer());
  const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (hash !== artifact.sha256) throw new Error(`checksum mismatch: ${artifact.name}`);
}
'
VERSION=$(bun -e 'console.log((await Bun.file("packages/cli/package.json").json()).version)')
artifact_path() { RELEASE_DIR="$RELEASE_DIR" PACKAGE_NAME="$1" bun -e '
const a = await Bun.file(`${process.env.RELEASE_DIR}/release-artifacts.json`).json();
const x = a.find(({ name }) => name === process.env.PACKAGE_NAME);
if (!x) throw new Error("missing artifact"); console.log(x.path);'; }
TMUX_ARCHIVE=$(artifact_path "@termwire/tmux")
NVIM_ARCHIVE=$(artifact_path "@termwire/nvim")
CLI_ARCHIVE=$(artifact_path "@termwire/cli")
PLUGIN_ARCHIVE=$(artifact_path "@termwire/opencode-plugin")
for ARCHIVE in "$TMUX_ARCHIVE" "$NVIM_ARCHIVE" "$CLI_ARCHIVE" "$PLUGIN_ARCHIVE"; do
  bun publish "$ARCHIVE" --access public --dry-run
done
for ARCHIVE in "$TMUX_ARCHIVE" "$NVIM_ARCHIVE" "$CLI_ARCHIVE" "$PLUGIN_ARCHIVE"; do
  bun publish "$ARCHIVE" --access public
done
```

Add `--otp "$NPM_OTP"` when requested. Verify each with
`npm view @termwire/tmux@"$VERSION"` (and nvim, cli, plugin). Only after all
succeed:

```bash
git push origin master
git tag "@termwire/tmux@$VERSION"; git tag "@termwire/nvim@$VERSION"
git tag "@termwire/cli@$VERSION"; git tag "@termwire/opencode-plugin@$VERSION"
git push origin "@termwire/tmux@$VERSION" "@termwire/nvim@$VERSION" "@termwire/cli@$VERSION" "@termwire/opencode-plugin@$VERSION"
```

Keep `RELEASE_DIR` until success or an explicit recovery decision, then remove
it. Never push while partial: (1) retry an unchanged unpublished package with
the same retained archive/checksum; (2) for changed unpublished content,
discard all archives, update the unpushed commit, remove `bun.lock`, regenerate
it with `bun install --lockfile-only`, prepare all four again, and continue only
unpublished packages at that version; (3) for
published content, create a new fixed-group Changeset/version and release all
four. Do not overwrite published versions.
