# Releasing

Releases are automated by [`.github/workflows/release.yml`](.github/workflows/release.yml).
**Pushing a version tag ships both channels** — the macOS DMG (GitHub Release) and
`sibyl-cli` (npm). No manual `gh release create` or `npm publish`.

## Cut a release

1. **Bump the version** in one PR (`chore(release): x.y.z`) and merge it:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock` (the `sibyl-desktop` entry)

2. **Tag and push:**
   ```bash
   git checkout main && git pull
   git tag v0.7.2
   git push origin v0.7.2
   ```

3. The workflow then, on a macOS (arm64) runner:
   - verifies the tag matches the bumped versions (fails loudly if you forgot to bump),
   - builds the self-contained DMG (`pnpm tauri build`),
   - creates the GitHub Release for the tag and attaches the DMG,
   - publishes `sibyl-cli` to npm (only if the DMG/release step succeeded).

Watch it under the repo's **Actions** tab. If the DMG step flakes (macOS `hdiutil` can
be finicky), just **re-run the failed job** — a fresh runner has no stale state.

## One-time setup

Add an npm **automation** token as a repo secret named **`NPM_TOKEN`**:

- npmjs.com → **Access Tokens** → *Generate New Token* → **Automation**
- GitHub → repo **Settings** → *Secrets and variables* → **Actions** → **New repository secret** → name `NPM_TOKEN`

`GITHUB_TOKEN` (for the release) is provided automatically.

## Notes

- The DMG is **Apple Silicon (arm64) only** — the runner is `macos-14`. Cross-arch/universal is tracked in [#78](https://github.com/JAYKALIA007/sibyl/issues/78).
- Stay **below 1.0.0** until the project is stable: minor bumps (`0.x.0`) for features however big, patch (`0.x.y`) for fixes.
- The app is **ad-hoc signed** (free, no Apple account); notarization (removes the Gatekeeper prompt) is tracked in [#80](https://github.com/JAYKALIA007/sibyl/issues/80) / [#81](https://github.com/JAYKALIA007/sibyl/issues/81).
