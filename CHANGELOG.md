# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Local model switcher: choose the model from a curated catalog above the composer.
- In-app model download: pull a not-installed catalog model straight from the switcher with a live progress bar, no terminal needed.
- Docs and "Report an issue" links in the sidebar footer (the issue report is prefilled with the active model and surface).
- Add this changelog to track human-curated release notes going forward.
- README model scoreboard: results of a 38-case execution-accuracy bake-off across five local coders, explaining the catalog picks.

### Changed

- Expanded the execution-accuracy eval from 19 to 38 cases (correlated subqueries, EXCEPT/anti-joins, per-group maxima, conditional aggregation, and more).
- Trimmed the model catalog to two tiers picked by the eval: `qwen2.5-coder` (default, best value) and `qwen3-coder` (one-click accuracy upgrade). Dropped `deepseek-coder-v2`, `codestral`, and `llama3.1` as dominated or weak value.

### Fixed

- Desktop: poll `/api/health` before the first request so a cold launch no longer races the sidecar and flashes onboarding.

## [0.8.0] - 2026-07-14

### Added

- Added streaming SQL token updates to the GUI.

### Changed

- Updated the package version to `0.8.0`.

[Unreleased]: https://github.com/JAYKALIA007/sibyl/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/JAYKALIA007/sibyl/releases/tag/v0.8.0
