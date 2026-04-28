# openclaw-auth-wiper v0.1.1

Growthcircle.id documentation refresh for safe OpenClaw model auth cleanup.

## Highlights

- Reworked README with a simpler user-first flow.
- ClawHub-first install and verification tutorial.
- Clear dry-run, apply, restart, and login-again sequence.
- Backup and recovery instructions for manual rollback.
- Better explanation of what the wiper does and never touches.

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
