# openclaw-auth-wiper v0.1.0

Growthcircle.id release for safe OpenClaw model auth cleanup.

## Highlights

- Dry-run first workflow for inspecting exactly which files and JSON fields will change.
- Safe apply mode with lock file, backups, backup manifest, symlink refusal, and atomic JSON writes.
- Clears local model OAuth/API-key profiles, auth routing state, and custom provider registry.
- Scrubs session-level model/auth pins without deleting session history or transcripts.
- Preserves channel config, gateway tokens, memory, tools, plugins, workspaces, logs, and databases.

## Compatibility

- OpenClaw: `2026.3.*` through latest `2026.4.*`
- Tested locally: `2026.4.24`
- Checked against npm latest: `2026.4.26`
- Node.js: `>=20`

## Install

```sh
npm install -g openclaw-auth-wiper
openclaw-auth-wiper --dry-run
```

From ClawHub:

```sh
openclaw plugins install clawhub:openclaw-auth-wiper
openclaw plugins enable openclaw-auth-wiper
openclaw gateway restart
```

## Apply

```sh
openclaw-auth-wiper --apply --yes
openclaw gateway restart
```
