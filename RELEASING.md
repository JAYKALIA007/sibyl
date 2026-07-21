# Releasing

Releases are automated by [`.github/workflows/release.yml`](.github/workflows/release.yml).
**Pushing a version tag ships both channels** — the macOS DMG (GitHub Release) and
`sibyl-cli` (npm). No manual `gh release create` or `npm publish`.

## Cut a release

1. **Bump the version** in one PR (`chore(release): x.y.z`) and merge it. Run
   `pnpm bump x.y.z`, which updates all four version files and rolls the
   `CHANGELOG.md` `Unreleased` notes into a dated version section:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock` (the `sibyl-desktop` entry)
   - `CHANGELOG.md` (`Unreleased` into the new version, with compare/tag links)

   Curate the `Unreleased` section as you go (in each feature PR) so the roll
   picks the notes up. Review the diff before committing.

2. **Tag and push:**
   ```bash
   git checkout main && git pull
   git tag v0.7.2
   git push origin v0.7.2
   ```

3. The workflow then, on a macOS (arm64) runner:
   - verifies the tag matches the bumped versions (fails loudly if you forgot to bump),
   - builds the self-contained DMG **and the signed updater archive** (`pnpm tauri build`),
   - generates `latest.json` (`scripts/updater-manifest.mjs`),
   - creates the GitHub Release for the tag and attaches the DMG, the `.app.tar.gz`,
     its `.sig`, and `latest.json`,
   - publishes `sibyl-cli` to npm (only if the DMG/release step succeeded).

   Installed desktop apps discover the release by polling
   `/releases/latest/download/latest.json`, so **all four assets must be attached** —
   a release missing `latest.json` is invisible to the updater, and one missing the
   `.sig` will be rejected by it.

Watch it under the repo's **Actions** tab. If the DMG step flakes (macOS `hdiutil` can
be finicky), just **re-run the failed job** — a fresh runner has no stale state.

## One-time setup

**npm** needs nothing: publishing uses npmjs.com **OIDC trusted publishing** (configured
on the package as `JAYKALIA007/sibyl` → `release.yml` → `npm publish`), so there is no
`NPM_TOKEN` to rotate and provenance is attached automatically. `GITHUB_TOKEN` (for the
release) is provided automatically too.

**The updater signing key** does need two secrets. Updates are verified against the
public key baked into `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); the
matching private key signs each release archive in CI. The keypair was generated with:

```bash
pnpm tauri signer generate -w ~/.tauri/sibyl-updater.key
```

which writes the private key to that path and the public key alongside it as `.pub`.
Add the private key as repo secrets:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/sibyl-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""   # empty if you set no password
```

> **Keep `~/.tauri/sibyl-updater.key` backed up somewhere safe and never commit it.**
> Losing it means you cannot sign updates that existing installs will accept: you would
> have to ship a new public key, and every user already out there would be stranded on
> their current version until they manually downloaded a fresh DMG.

## Notes

- The DMG is **Apple Silicon (arm64) only** — the runner is `macos-14`. Cross-arch/universal is tracked in [#78](https://github.com/JAYKALIA007/sibyl/issues/78).
- Stay **below 1.0.0** until the project is stable: minor bumps (`0.x.0`) for features however big, patch (`0.x.y`) for fixes.
- The app is **ad-hoc signed** (free, no Apple account), so first launch shows the Gatekeeper prompt. That is Apple code signing, which is separate from the updater's minisign key above — an ad-hoc signed app still auto-updates fine. Notarization is a deferred item in [`src-tauri/README.md`](src-tauri/README.md).
- **Updates are opt-in.** The app asks on first run and does not contact GitHub unless the user agrees; a "Check for updates" item in the sidebar covers anyone who declined.
