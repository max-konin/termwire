# Releasing Termwire

## Prerequisites

Create the `@termwire` npm organization, grant publish rights, enable 2FA, and
authenticate with npm. Start from clean `master` with Bun 1.3.14, a pending
Changeset, and passing repository checks.

## Prepare

```bash
bun run version-packages
git status --short
git add -A .changeset packages bun.lock
git diff --cached
git commit -m "Version packages"
```

Stage only the expected release areas so newly generated package changelogs and
the consumed Changeset deletion are included without staging unrelated
untracked files. Review the complete staged content before committing. The
release commit must be `HEAD` before publication so Changesets creates tags for
the correct commit.

## Publish

```bash
bun run release
```

This builds, then delegates workspace discovery, publication, and local tag
creation to Changesets. It does not commit or push.

After success, inspect tags and push the release commit and tags manually:

```bash
git tag --list "@termwire/*"
git push origin master --follow-tags
```

## Retries

- After a build failure, fix and commit before retrying.
- After interrupted publication, rerun `bun run release`; registry-present
  versions are skipped.
- Verify or create missing tags at the release commit before pushing. A manually
  recreated package tag must be annotated for `--follow-tags` to push it:

  ```bash
  git tag -a "$TAG" HEAD -m "$TAG"
  test "$(git rev-list -n 1 "$TAG")" = "$(git rev-parse HEAD)"
  ```
