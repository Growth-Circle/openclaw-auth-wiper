# Changelog

## 0.1.0 - 2026-04-28

Initial public release.

- Adds safe dry-run and apply flows for wiping OpenClaw model auth state.
- Clears per-agent `auth-profiles.json`, `auth-state.json`, and `models.json` without printing secrets.
- Scrubs model/auth pins from `sessions.json` while preserving transcripts and nested session metadata.
- Removes model provider registry and default/fallback model pins from `openclaw.json`.
- Adds backup manifests, lock file protection, symlink refusal, and atomic JSON writes.
- Ships OpenClaw plugin metadata plus npm CLI distribution.
