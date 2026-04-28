# openclaw-auth-wiper

Safe auth reset for OpenClaw.

`openclaw-auth-wiper` is a Growthcircle.id plugin for clearing broken or stale OpenClaw model login state without wiping the rest of your OpenClaw setup.

Use it when OpenClaw keeps using an old account, a model provider token is stale, a custom provider setup is broken, or an old session keeps forcing the wrong model.

## What It Does

This plugin cleans only the model/auth layer:

- model OAuth profiles
- API-key auth profiles
- model auth routing state
- cooldown and usage state for model auth
- custom provider/model registry
- default and fallback model pins
- old session-level model/auth overrides

It does not clean your channels, gateway, memory, tools, plugins, workspace, logs, or transcripts.

## Recommended Install: ClawHub

Install the plugin from ClawHub:

```sh
openclaw plugins install clawhub:openclaw-auth-wiper
openclaw plugins enable openclaw-auth-wiper
openclaw gateway restart
```

Check that OpenClaw can see it:

```sh
openclaw plugins inspect openclaw-auth-wiper
```

If your OpenClaw build exposes plugin commands in the command palette or chat command surface, run:

```sh
auth-wiper --dry-run
```

For the final wipe, the terminal CLI is the clearest path because it prints a backup report and requires explicit confirmation:

```sh
npx openclaw-auth-wiper --dry-run
npx openclaw-auth-wiper --apply --yes
openclaw gateway restart
```

After that, sign in or configure your model provider again.

## Quick Tutorial

### 1. Preview First

Always start with a dry run:

```sh
npx openclaw-auth-wiper --dry-run
```

The dry run shows:

- which files exist
- which JSON fields will be removed
- which files are already clean
- warnings, if any

No files are changed in this step.

### 2. Apply the Wipe

When the dry-run report looks correct:

```sh
npx openclaw-auth-wiper --apply --yes
```

Without `--yes`, the CLI asks you to type `WIPE` before writing anything.

### 3. Restart OpenClaw

Restart the gateway or OpenClaw process so it reloads the cleaned config:

```sh
openclaw gateway restart
```

### 4. Login Again

Run your normal OpenClaw model setup flow again. For example, configure OpenAI Codex, Growthcircle.id, MiniMax, Ollama, or another provider from a clean state.

## NPM Install

If you prefer a global CLI:

```sh
npm install -g openclaw-auth-wiper
openclaw-auth-wiper --dry-run
openclaw-auth-wiper --apply --yes
```

You can also use `npx` without installing globally:

```sh
npx openclaw-auth-wiper --dry-run
```

## Common Use Cases

Use this plugin when:

- OpenClaw is stuck on the wrong model account.
- A provider token expired and login keeps failing.
- You switched from one model provider account to another.
- A custom provider registry entry is broken.
- Old sessions keep forcing a bad `modelOverride`, `providerOverride`, or `authProfileOverride`.
- You want members of a team or community to re-login cleanly without deleting their whole OpenClaw setup.

Do not use it as a remote token revocation tool. It removes local state only. If a credential was leaked, revoke it at the provider too.

## What Gets Cleaned

Per agent:

| File | Action |
| --- | --- |
| `~/.openclaw/agents/<agentId>/agent/auth-profiles.json` | Clears model OAuth/API-key profiles. |
| `~/.openclaw/agents/<agentId>/agent/auth-state.json` | Clears model auth routing, cooldown, and usage state. |
| `~/.openclaw/agents/<agentId>/agent/models.json` | Clears local custom provider/model registry. |
| `~/.openclaw/agents/<agentId>/sessions/sessions.json` | Removes model/auth override pins only. |

Global config in `~/.openclaw/openclaw.json`:

- `auth.profiles`
- `models.providers`
- legacy top-level `providers`
- `agents.defaults.model.primary`
- `agents.defaults.model.fallbacks`
- `agents.defaults.models`
- agent and subagent `model` pins

Session fields removed from each session:

- `providerOverride`
- `providerOverrideSource`
- `modelOverride`
- `modelOverrideSource`
- `authProfileOverride`
- `authProfileOverrideSource`
- `authProfileOverrideCompactionCount`
- `modelProvider`
- `model`

Nested session history and transcript references are preserved.

## What Is Never Touched

The default wipe does not edit or delete:

- Telegram, WhatsApp, Discord, or other channel config
- gateway token, gateway port, or bind address
- workspace files
- memory
- tools and elevated execution settings
- plugin install state and plugin allowlists
- session transcript files
- logs, media, flows, task databases, identity, devices, or credentials directories

## Backups and Recovery

Before changing anything, the CLI backs up every file it will edit.

Backup location:

```text
~/.openclaw/.auth-wiper-backups/<timestamp>/
```

Each backup folder contains:

- copied JSON files
- `manifest.json`
- file size, mode, mtime, and SHA-256 hashes

To recover manually, copy the backed-up file back to its original path, then restart OpenClaw.

Example:

```sh
cp ~/.openclaw/.auth-wiper-backups/<timestamp>/openclaw.json ~/.openclaw/openclaw.json
openclaw gateway restart
```

## Safety Defaults

`openclaw-auth-wiper` is intentionally conservative:

- Default mode is `--dry-run`.
- Secret values are never printed.
- Changed files are backed up first.
- JSON writes are atomic.
- A lock file prevents concurrent wipes.
- Symlink targets are refused.
- Only known OpenClaw auth/model paths are targeted.

## CLI Reference

| Option | Description |
| --- | --- |
| `--dry-run` | Preview changes only. This is the default. |
| `--apply` | Write the wipe. |
| `--yes`, `-y` | Skip the interactive `WIPE` confirmation. |
| `--openclaw-home <path>` | OpenClaw home. Defaults to `OPENCLAW_HOME` or `~/.openclaw`. |
| `--agent <id>` | Limit to one agent. Repeatable. |
| `--all-agents` | Target every agent directory. This is the default. |
| `--backup-dir <path>` | Override backup destination. |
| `--preserve-session-model-history` | Keep top-level session `model` and `modelProvider`, while still removing override pins. |
| `--no-lock` | Disable lock file. Use only for isolated test fixtures. |
| `--json` | Print a machine-readable report. |
| `--version` | Print package version. |
| `--help` | Print help. |

## Troubleshooting

### OpenClaw still uses the old model

Restart the gateway after applying the wipe:

```sh
openclaw gateway restart
```

Then configure/login again.

### Dry run says everything is missing

Check that OpenClaw is using the expected home directory:

```sh
npx openclaw-auth-wiper --openclaw-home ~/.openclaw --dry-run
```

If you use a custom OpenClaw home, pass that path with `--openclaw-home`.

### You only want to clean one agent

```sh
npx openclaw-auth-wiper --agent main --dry-run
npx openclaw-auth-wiper --agent main --apply --yes
```

### You want session history to keep `model` and `modelProvider`

```sh
npx openclaw-auth-wiper --preserve-session-model-history --dry-run
npx openclaw-auth-wiper --preserve-session-model-history --apply --yes
```

This still removes override pins such as `modelOverride`, `providerOverride`, and `authProfileOverride`.

## Compatibility

| Component | Support |
| --- | --- |
| OpenClaw | Designed for `2026.3.*` through latest `2026.4.*`. |
| Tested OpenClaw | `2026.4.24`, checked against npm latest `2026.4.26`. |
| Node.js | `>=20` |
| Platforms | Linux and macOS. Windows should work for JSON transforms, but file mode behavior may differ. |
| Distribution | ClawHub, npm, GitHub Releases |

## For Maintainers

Development:

```sh
npm install
npm run check
npm test
npm run build
npm pack --dry-run
```

Release checklist:

```sh
npm run prepublishOnly
npm publish --access public
git tag -a vX.Y.Z -m "openclaw-auth-wiper X.Y.Z"
git push origin main vX.Y.Z
clawhub package publish "$PWD" \
  --family code-plugin \
  --version X.Y.Z \
  --source-repo Growth-Circle/openclaw-auth-wiper \
  --source-commit "$(git rev-parse HEAD)" \
  --source-ref vX.Y.Z \
  --tags latest
```

## About Growthcircle.id

Growthcircle.id is an AI community focused on practical, current AI workflows: agent tooling, model provider integration, automation, and applied AI systems.

This plugin is part of that tooling culture: small, specific, safe utilities that help people recover faster and work cleaner.

## Security

This utility removes local OpenClaw auth/model state. It does not revoke remote provider tokens or invalidate server-side sessions.

If a secret was exposed, revoke it at the provider. If you need to report a security issue in this package, contact the maintainers privately instead of opening a public issue with sensitive details.
