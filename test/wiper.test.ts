import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyWipe, buildWipePlan } from "../src/wiper.js";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe("openclaw-auth-wiper", () => {
  it("wipes only OpenClaw model auth state and preserves unrelated config", async () => {
    const root = await fixtureRoot();
    const beforeConfig = await readJson(path.join(root, "openclaw.json"));
    const beforeDryRun = await fs.readFile(path.join(root, "openclaw.json"), "utf8");

    const plan = await buildWipePlan({ openClawHome: root });
    expect(plan.mode).toBe("dry-run");
    expect(plan.targets.some((target) => target.relativePath === "openclaw.json" && target.changed)).toBe(true);
    expect(await fs.readFile(path.join(root, "openclaw.json"), "utf8")).toBe(beforeDryRun);

    const result = await applyWipe({ openClawHome: root, lock: false });
    expect(result.backups.length).toBe(5);
    expect(result.backupDir).toBeTruthy();

    const config = await readJson(path.join(root, "openclaw.json"));
    expect(config.gateway).toEqual(beforeConfig.gateway);
    expect(config.channels).toEqual(beforeConfig.channels);
    expect(config.memory).toEqual(beforeConfig.memory);
    expect(config.tools).toEqual(beforeConfig.tools);
    expect(config.plugins).toEqual(beforeConfig.plugins);
    expect(config.auth?.profiles).toBeUndefined();
    expect(config.models?.mode).toBe("manual");
    expect(config.models?.providers).toBeUndefined();
    expect(config.providers).toBeUndefined();
    expect(config.agents.defaults.workspace).toBe("/workspace");
    expect(config.agents.defaults.model?.primary).toBeUndefined();
    expect(config.agents.defaults.model?.fallbacks).toBeUndefined();
    expect(config.agents.defaults.models).toBeUndefined();
    expect(config.agents.defaults.subagents.allowAgents).toEqual(["main"]);
    expect(config.agents.defaults.subagents.model).toBeUndefined();
    expect(config.agents.list[0].tools).toEqual({ profile: "full" });
    expect(config.agents.list[0].model).toBeUndefined();
    expect(config.agents.list[0].subagents.model).toBeUndefined();

    await expect(readJson(path.join(root, "agents", "main", "agent", "auth-profiles.json"))).resolves.toEqual({
      version: 3,
      profiles: {},
    });
    await expect(readJson(path.join(root, "agents", "main", "agent", "auth-state.json"))).resolves.toEqual({
      version: 2,
    });
    await expect(readJson(path.join(root, "agents", "main", "agent", "models.json"))).resolves.toEqual({
      version: 1,
      providers: {},
    });

    const sessions = await readJson(path.join(root, "agents", "main", "sessions", "sessions.json"));
    const direct = sessions["agent:main:telegram:direct:1"];
    expect(direct.providerOverride).toBeUndefined();
    expect(direct.modelOverride).toBeUndefined();
    expect(direct.authProfileOverride).toBeUndefined();
    expect(direct.modelProvider).toBeUndefined();
    expect(direct.model).toBeUndefined();
    expect(direct.origin.provider).toBe("telegram");
    expect(direct.systemPromptReport.model).toBe("growthcircle/gpt-5.5");

    const manifest = await readJson(path.join(result.backupDir!, "manifest.json"));
    expect(manifest.entries).toHaveLength(5);
    expect(JSON.stringify(manifest)).not.toContain("secret");
  });

  it("can preserve top-level session model history while removing overrides", async () => {
    const root = await fixtureRoot();
    await applyWipe({
      openClawHome: root,
      lock: false,
      preserveSessionModelHistory: true,
    });

    const sessions = await readJson(path.join(root, "agents", "main", "sessions", "sessions.json"));
    const direct = sessions["agent:main:telegram:direct:1"];
    expect(direct.modelProvider).toBe("growthcircle");
    expect(direct.model).toBe("growthcircle/gpt-5.5");
    expect(direct.providerOverride).toBeUndefined();
    expect(direct.authProfileOverride).toBeUndefined();
  });

  it("refuses symlink targets", async () => {
    const root = await fixtureRoot();
    const target = path.join(root, "outside.json");
    const link = path.join(root, "agents", "main", "agent", "auth-state.json");
    await fs.rm(link);
    await writeJson(target, { version: 1, lastGood: { provider: "secret" } });
    await fs.symlink(target, link);

    const plan = await buildWipePlan({ openClawHome: root });
    const authState = plan.targets.find((entry) => entry.relativePath.endsWith("auth-state.json"));
    expect(authState?.skippedReason).toContain("symlink");

    await applyWipe({ openClawHome: root, lock: false });
    await expect(readJson(target)).resolves.toEqual({ version: 1, lastGood: { provider: "secret" } });
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-auth-wiper-"));
  tempRoots.push(root);

  await writeJson(path.join(root, "openclaw.json"), {
    agents: {
      defaults: {
        workspace: "/workspace",
        models: {
          "growthcircle/gpt-5.5": { params: { temperature: 0.2 } },
        },
        model: {
          primary: "growthcircle/gpt-5.5",
          fallbacks: ["openai-codex/gpt-5.5"],
        },
        subagents: {
          allowAgents: ["main"],
          model: "growthcircle/gpt-5.5",
        },
      },
      list: [
        {
          id: "main",
          name: "Main",
          model: "growthcircle/gpt-5.5",
          tools: { profile: "full" },
          subagents: { model: "openai-codex/gpt-5.5", allowAgents: ["main"] },
        },
      ],
    },
    gateway: {
      auth: { token: "gateway-token-kept" },
      port: 18789,
    },
    channels: {
      telegram: { enabled: true, botToken: "telegram-token-kept" },
    },
    memory: {
      enabled: true,
    },
    tools: {
      exec: { host: "local" },
    },
    plugins: {
      entries: { "gc-provider": { enabled: true } },
    },
    auth: {
      profiles: {
        "growthcircle:default": { provider: "growthcircle", apiKey: "secret" },
      },
    },
    models: {
      mode: "manual",
      providers: {
        growthcircle: { baseUrl: "https://ai.growthcircle.id/v1", apiKey: "secret" },
      },
    },
    providers: {
      growthcircle: { baseUrl: "https://ai.growthcircle.id/v1" },
    },
  });

  await writeJson(path.join(root, "agents", "main", "agent", "auth-profiles.json"), {
    version: 3,
    profiles: {
      "growthcircle:default": { apiKey: "secret" },
    },
  });
  await writeJson(path.join(root, "agents", "main", "agent", "auth-state.json"), {
    version: 2,
    lastGood: { growthcircle: "growthcircle:default" },
    cooldown: { growthcircle: 123 },
    usageStats: { growthcircle: 10 },
  });
  await writeJson(path.join(root, "agents", "main", "agent", "models.json"), {
    version: 1,
    providers: {
      growthcircle: { apiKey: "secret", models: [{ id: "gpt-5.5" }] },
    },
  });
  await writeJson(path.join(root, "agents", "main", "sessions", "sessions.json"), {
    "agent:main:telegram:direct:1": {
      sessionId: "abc",
      providerOverride: "growthcircle",
      providerOverrideSource: "manual",
      modelOverride: "growthcircle/gpt-5.5",
      modelOverrideSource: "manual",
      authProfileOverride: "growthcircle:default",
      authProfileOverrideSource: "manual",
      authProfileOverrideCompactionCount: 1,
      modelProvider: "growthcircle",
      model: "growthcircle/gpt-5.5",
      origin: {
        provider: "telegram",
      },
      systemPromptReport: {
        provider: "growthcircle",
        model: "growthcircle/gpt-5.5",
      },
    },
  });

  return root;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function readJson(filePath: string): Promise<any> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}
