import {
  VERSION,
  applyWipe,
  buildWipePlan,
  formatTextReport,
  type WipeOptions,
} from "./wiper.js";
import { parseArgs } from "./args.js";

export const id = "openclaw-auth-wiper";
export const name = "OpenClaw Auth Wiper";
export const version = VERSION;

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
};

type CommandContext = {
  ui?: {
    notify?: (message: string, level?: string) => void;
  };
};

type OpenClawApi = {
  logger?: Logger;
  registerCommand?: (
    name: string,
    command: {
      description: string;
      handler: (args?: unknown, context?: CommandContext) => Promise<string>;
    },
  ) => void;
  registerTool?: (tool: unknown) => void;
};

export function register(api: OpenClawApi): void {
  api.logger?.info?.(`[${id}] register`, { version });

  api.registerCommand?.("auth-wiper", {
    description: "Preview or apply a safe wipe of OpenClaw model auth state.",
    handler: async (args, context) => {
      const options = pluginArgsToOptions(args);
      const result = options.apply ? await applyWipe({ ...options, apply: true }) : await buildWipePlan(options);
      const text = formatTextReport(result);
      context?.ui?.notify?.(text, options.apply ? "warn" : "info");
      return text;
    },
  });

  api.registerTool?.({
    name: "openclaw_auth_wiper_preview",
    description:
      "Preview which OpenClaw model auth files and session model/auth pins would be wiped. This tool never writes files.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        openClawHome: {
          type: "string",
          description: "Optional OpenClaw home path. Defaults to OPENCLAW_HOME or ~/.openclaw.",
        },
        agents: {
          type: "array",
          items: { type: "string" },
          description: "Optional agent ids. Defaults to every agent directory.",
        },
      },
    },
    execute: async (input: unknown) => {
      const options = isRecord(input)
        ? {
            openClawHome: typeof input.openClawHome === "string" ? input.openClawHome : undefined,
            agents: Array.isArray(input.agents)
              ? input.agents.filter((agent): agent is string => typeof agent === "string")
              : undefined,
          }
        : {};
      const plan = await buildWipePlan(options);
      return {
        content: [{ type: "text", text: formatTextReport(plan) }],
      };
    },
  });
}

export default function openClawAuthWiper(api: OpenClawApi): void {
  register(api);
}

export { applyWipe, buildWipePlan, formatTextReport };
export type { WipeOptions };

function pluginArgsToOptions(args: unknown): WipeOptions {
  if (Array.isArray(args)) {
    return parseArgs(args.filter((arg): arg is string => typeof arg === "string"));
  }
  if (typeof args === "string") {
    return parseArgs(args.trim() ? args.trim().split(/\s+/) : []);
  }
  if (isRecord(args)) {
    return {
      apply: args.apply === true,
      openClawHome: typeof args.openClawHome === "string" ? args.openClawHome : undefined,
      agents: Array.isArray(args.agents)
        ? args.agents.filter((agent): agent is string => typeof agent === "string")
        : undefined,
      backupDir: typeof args.backupDir === "string" ? args.backupDir : undefined,
      preserveSessionModelHistory: args.preserveSessionModelHistory === true,
    };
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
