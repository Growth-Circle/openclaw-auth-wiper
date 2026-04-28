#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  VERSION,
  applyWipe,
  buildWipePlan,
  formatTextReport,
} from "./wiper.js";
import { parseArgs, type ParsedArgs } from "./args.js";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      console.log(helpText());
      return 0;
    }
    if (options.version) {
      console.log(VERSION);
      return 0;
    }

    if (options.apply) {
      await confirmApply(options);
      const result = await applyWipe(options);
      printResult(result, options.json);
      return 0;
    }

    const plan = await buildWipePlan(options);
    printResult(plan, options.json);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function confirmApply(options: ParsedArgs): Promise<void> {
  if (options.yes) return;
  if (!process.stdin.isTTY) {
    throw new Error("Refusing non-interactive apply without --yes.");
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Type WIPE to clear local OpenClaw model auth state: ");
    if (answer !== "WIPE") {
      throw new Error("Confirmation failed. No files were changed.");
    }
  } finally {
    rl.close();
  }
}

function printResult(result: unknown, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatTextReport(result as Parameters<typeof formatTextReport>[0]));
}

function helpText(): string {
  return `openclaw-auth-wiper ${VERSION}

Safely wipe OpenClaw model auth, routing state, and custom provider registry.
Default mode is dry-run. Values from auth files are never printed.

Usage:
  openclaw-auth-wiper [options]

Options:
  --dry-run                         Preview changes only (default)
  --apply                           Write the wipe
  -y, --yes                         Skip confirmation prompt for --apply
  --openclaw-home <path>            OpenClaw home (default: OPENCLAW_HOME or ~/.openclaw)
  --agent <id>                      Limit to one agent; repeatable
  --all-agents                      Target every agent directory (default)
  --backup-dir <path>               Override backup destination
  --preserve-session-model-history  Keep top-level session model/modelProvider fields
  --no-lock                         Disable lock file
  --json                            Print machine-readable report
  -v, --version                     Print version
  -h, --help                        Print help

Examples:
  openclaw-auth-wiper --dry-run
  openclaw-auth-wiper --apply --yes
  openclaw-auth-wiper --agent main --apply
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
