# openclaw-auth-wiper Agent Guide

Last updated: 2026-04-28

This repository publishes the Growthcircle.id OpenClaw auth/model wipe utility.
Keep the project boring, explicit, and conservative: this plugin edits files
that may contain credentials.

## Project Snapshot

- Package: `openclaw-auth-wiper`
- Plugin id: `openclaw-auth-wiper`
- CLI: `openclaw-auth-wiper`
- Runtime entrypoint: `src/index.ts`
- Wipe implementation: `src/wiper.ts`
- CLI implementation: `src/cli.ts`
- Manifest: `openclaw.plugin.json`
- Tests: `test/wiper.test.ts`
- Distribution: npm + ClawHub + GitHub releases

## Safety Rules

- Never print auth/profile/model values from target files.
- Default behavior must remain dry-run.
- Destructive writes must require explicit apply.
- Back up every changed file before writing.
- Keep target paths allowlisted.
- Refuse symlink targets.
- Do not touch channel, gateway, memory, tool, plugin, workspace, log, media,
  credential, identity, device, flow, or task database paths.
- In `sessions.json`, scrub only top-level session pin fields unless a future
  release explicitly documents a broader migration.

## Compatibility Policy

The plugin is designed for OpenClaw `2026.3.*` through latest. To keep that
range realistic, do not add mandatory imports from modern OpenClaw SDK modules.
Prefer local structural types and runtime feature detection.

Before release:

```sh
npm run check
npm test
npm run build
npm pack --dry-run
```

## Release Workflow

1. Update version in `package.json`, `openclaw.plugin.json`, and `CHANGELOG.md`.
2. Run `npm run prepublishOnly`.
3. Commit and push to `main`.
4. Create an annotated `vX.Y.Z` tag.
5. Publish npm.
6. Create GitHub release.
7. Publish ClawHub with `clawhub package publish`.

The GitHub Actions release workflow also publishes from `v*` tags when required
secrets are configured.
