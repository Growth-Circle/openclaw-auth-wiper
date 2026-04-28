import type { WipeOptions } from "./wiper.js";

export type ParsedArgs = WipeOptions & {
  help: boolean;
  version: boolean;
  json: boolean;
  yes: boolean;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const options: ParsedArgs = {
    help: false,
    version: false,
    json: false,
    yes: false,
    apply: false,
    lock: true,
    agents: [],
    preserveSessionModelHistory: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--version":
      case "-v":
        options.version = true;
        break;
      case "--dry-run":
        options.apply = false;
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--yes":
      case "-y":
        options.yes = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--no-lock":
        options.lock = false;
        break;
      case "--preserve-session-model-history":
        options.preserveSessionModelHistory = true;
        break;
      case "--openclaw-home":
        options.openClawHome = readValue(argv, ++index, arg);
        break;
      case "--backup-dir":
        options.backupDir = readValue(argv, ++index, arg);
        break;
      case "--agent":
        options.agents?.push(readValue(argv, ++index, arg));
        break;
      case "--all-agents":
        options.agents = [];
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.agents?.length === 0) delete options.agents;
  return options;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
  return value;
}
