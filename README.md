# openclaw-auth-wiper

Safe OpenClaw auth and model-state reset plugin by **Growthcircle.id**.

`openclaw-auth-wiper` clears broken or stale local model authentication without wiping the rest of OpenClaw. It targets OAuth/API-key model profiles, model routing state, custom provider registries, default/fallback model pins, and session-level model/auth pins. It does not touch channels, gateway tokens, memory, tools, plugins, workspace data, or session transcripts.

Growthcircle.id is an AI community building practical, current tooling around agents, model providers, and developer automation. This plugin exists for the real troubleshooting moment: a member switches accounts, a provider profile gets stale, or an old session keeps forcing a broken model.

## Install

From ClawHub:

```sh
openclaw plugins install clawhub:openclaw-auth-wiper
openclaw plugins enable openclaw-auth-wiper
openclaw gateway restart
```

From npm:

```sh
npm install -g openclaw-auth-wiper
```

Run without global install:

```sh
npx openclaw-auth-wiper --dry-run
```

## Quick Start

Preview first:

```sh
openclaw-auth-wiper --dry-run
```

Apply the wipe:

```sh
openclaw-auth-wiper --apply --yes
```

Target one agent:

```sh
openclaw-auth-wiper --agent main --dry-run
openclaw-auth-wiper --agent main --apply --yes
```

Use a custom OpenClaw home:

```sh
openclaw-auth-wiper --openclaw-home ~/.openclaw --dry-run
```

After apply, restart OpenClaw or the gateway, then configure/login again:

```sh
openclaw gateway restart
```

## What Gets Wiped

Per agent:

- `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`
- `~/.openclaw/agents/<agentId>/agent/auth-state.json`
- `~/.openclaw/agents/<agentId>/agent/models.json`
- `~/.openclaw/agents/<agentId>/sessions/sessions.json`

Global config:

- `openclaw.json` `auth.profiles`
- `openclaw.json` `models.providers`
- `openclaw.json` legacy top-level `providers`
- `openclaw.json` `agents.defaults.model.primary`
- `openclaw.json` `agents.defaults.model.fallbacks`
- `openclaw.json` `agents.defaults.models`
- `openclaw.json` agent and subagent model pins

Session scrub is intentionally narrow. It removes top-level session model/auth pin fields:

- `providerOverride`
- `providerOverrideSource`
- `modelOverride`
- `modelOverrideSource`
- `authProfileOverride`
- `authProfileOverrideSource`
- `authProfileOverrideCompactionCount`
- `modelProvider`
- `model`

Nested session history, transcript files, `origin.provider`, and `systemPromptReport.model` are preserved.

## What It Never Touches

The default wipe does not edit or delete:

- Telegram, WhatsApp, Discord, or other channel config
- gateway port, bind address, and gateway token
- workspace files
- memory
- tools, elevated execution, or sandbox policy
- plugin installs and plugin allowlists
- session history/transcripts
- logs, media, flows, task databases, identity, devices, or credentials directories

## Safety Model

- Default mode is `--dry-run`.
- Apply requires `--apply` and either interactive `WIPE` confirmation or `--yes`.
- Existing files are backed up before writes.
- Backups are stored under `~/.openclaw/.auth-wiper-backups/<timestamp>/` with `0700` directories and `0600` metadata where possible.
- JSON files are rewritten atomically through a temporary file and rename.
- A lock file prevents concurrent wipes.
- Symlink targets are refused.
- Reports list paths and JSON fields only. Secret values are never printed.

## CLI Options

| Option | Description |
| --- | --- |
| `--dry-run` | Preview changes only. This is the default. |
| `--apply` | Write the wipe. |
| `--yes`, `-y` | Skip interactive confirmation for `--apply`. |
| `--openclaw-home <path>` | OpenClaw home. Defaults to `OPENCLAW_HOME` or `~/.openclaw`. |
| `--agent <id>` | Limit to one agent. Repeatable. |
| `--all-agents` | Target every agent directory. This is the default. |
| `--backup-dir <path>` | Override backup destination. |
| `--preserve-session-model-history` | Keep top-level session `model` and `modelProvider`, while still removing override pins. |
| `--no-lock` | Disable lock file. Useful only for isolated test fixtures. |
| `--json` | Print a machine-readable report. |
| `--version` | Print package version. |
| `--help` | Print help. |

## OpenClaw Plugin

The package ships with `openclaw.plugin.json` and an extension entrypoint at `dist/index.js`. It avoids modern SDK-only imports so the plugin can load across OpenClaw `2026.3.*` through the latest `2026.4.*` line.

The plugin registers:

- `auth-wiper` command for preview/apply workflows
- `openclaw_auth_wiper_preview` tool for dry-run inspection only

The CLI remains the recommended path for destructive apply because it provides a direct confirmation and backup report.

## Compatibility

| Component | Policy |
| --- | --- |
| OpenClaw | Designed for `2026.3.*` through latest; tested locally with `2026.4.24` and checked against npm latest `2026.4.26`. |
| Node.js | `>=20` |
| Platforms | Linux and macOS. Windows should work for JSON transforms, but symlink and file-mode behavior may differ. |
| Package managers | npm and npx |
| Distribution | npm, GitHub Releases, ClawHub |

## Development

```sh
npm install
npm run check
npm test
npm run build
npm pack --dry-run
```

Local CLI test against a fixture:

```sh
openclaw-auth-wiper --openclaw-home /path/to/fixture --dry-run --json
```

## Release

Automated publishing is handled by `.github/workflows/release.yml` on `v*` tags:

- npm publish with `NPM_TOKEN`
- GitHub release provenance from the tag
- ClawHub publish with the `clawhub` CLI and `CLAWHUB_TOKEN` environment, when available

Manual release checklist:

```sh
npm run prepublishOnly
npm pack --dry-run
npm publish --access public
git tag -a v0.1.0 -m "openclaw-auth-wiper 0.1.0"
git push origin main v0.1.0
gh release create v0.1.0 --title "openclaw-auth-wiper v0.1.0" --notes-file RELEASE_NOTES.md
clawhub package publish "$PWD" \
  --family code-plugin \
  --version 0.1.0 \
  --source-repo Growth-Circle/openclaw-auth-wiper \
  --source-commit "$(git rev-parse HEAD)" \
  --source-ref v0.1.0 \
  --tags latest
```

## Security

This is a local cleanup utility, not a remote token revocation tool. It removes local OpenClaw auth/model state only. If a credential was exposed, revoke it at the provider as well.

Please report security issues privately to the Growthcircle.id maintainers rather than opening a public issue with sensitive details.
