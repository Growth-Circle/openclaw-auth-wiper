import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export const VERSION = "0.1.0";

const PACKAGE_NAME = "openclaw-auth-wiper";

const SESSION_MODEL_AUTH_KEYS = [
  "providerOverride",
  "providerOverrideSource",
  "modelOverride",
  "modelOverrideSource",
  "authProfileOverride",
  "authProfileOverrideSource",
  "authProfileOverrideCompactionCount",
  "modelProvider",
  "model",
] as const;

export type WipeOptions = {
  openClawHome?: string;
  agents?: string[];
  apply?: boolean;
  backupDir?: string;
  lock?: boolean;
  preserveSessionModelHistory?: boolean;
};

export type PlannedTarget = {
  path: string;
  relativePath: string;
  kind:
    | "openclaw-config"
    | "auth-profiles"
    | "auth-state"
    | "models-registry"
    | "sessions";
  description: string;
  exists: boolean;
  changed: boolean;
  changes: string[];
  skippedReason?: string;
};

export type WipePlan = {
  packageName: string;
  version: string;
  mode: "dry-run" | "apply";
  openClawHome: string;
  agents: string[];
  targets: PlannedTarget[];
  warnings: string[];
};

export type BackupEntry = {
  originalPath: string;
  backupPath: string;
  relativePath: string;
  size: number;
  mode: string;
  mtimeMs: number;
  sha256: string;
};

export type WipeResult = WipePlan & {
  applied: boolean;
  backupDir?: string;
  backups: BackupEntry[];
};

type JsonRecord = Record<string, unknown>;

type TransformResult = {
  next: unknown;
  changes: string[];
};

type TargetSpec = {
  path: string;
  relativePath: string;
  kind: PlannedTarget["kind"];
  description: string;
  transform: (raw: unknown, options: NormalizedOptions) => TransformResult;
};

type NormalizedOptions = Required<Pick<WipeOptions, "lock" | "preserveSessionModelHistory">> & {
  openClawHome: string;
  agents?: string[];
  apply: boolean;
  backupDir?: string;
};

export function expandHome(input: string): string {
  if (input === "~") return homeDir();
  if (input.startsWith("~/")) return path.join(homeDir(), input.slice(2));
  return input;
}

export function resolveOpenClawHome(input?: string): string {
  const raw = input ?? process.env.OPENCLAW_HOME ?? path.join(homeDir(), ".openclaw");
  return path.resolve(expandHome(raw));
}

export async function buildWipePlan(options: WipeOptions = {}): Promise<WipePlan> {
  const normalized = normalizeOptions(options);
  const warnings: string[] = [];

  const rootExists = await exists(normalized.openClawHome);
  if (!rootExists) {
    warnings.push("OpenClaw home does not exist. No files will be changed.");
  }

  const agents = await resolveAgents(normalized.openClawHome, normalized.agents);
  const targets = await collectTargets(normalized, agents);
  return {
    packageName: PACKAGE_NAME,
    version: VERSION,
    mode: normalized.apply ? "apply" : "dry-run",
    openClawHome: normalized.openClawHome,
    agents,
    targets,
    warnings,
  };
}

export async function applyWipe(options: WipeOptions = {}): Promise<WipeResult> {
  const normalized = normalizeOptions({ ...options, apply: true });
  await ensureDirectory(normalized.openClawHome);

  const releaseLock = normalized.lock ? await acquireLock(normalized.openClawHome) : async () => undefined;
  try {
    const agents = await resolveAgents(normalized.openClawHome, normalized.agents);
    const targets = await collectTargets(normalized, agents);
    const changedTargets = targets.filter((target) => target.exists && target.changed && !target.skippedReason);
    const backupDir =
      normalized.backupDir ??
      path.join(normalized.openClawHome, ".auth-wiper-backups", backupStamp());
    const backups: BackupEntry[] = [];

    if (changedTargets.length > 0) {
      await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
    }

    for (const target of changedTargets) {
      const spec = targetSpecFor(normalized, agents).find((candidate) => candidate.path === target.path);
      if (!spec) continue;
      await assertTargetSafe(normalized.openClawHome, target.path);
      const raw = await readJson(target.path);
      const transformed = spec.transform(raw, normalized);
      if (transformed.changes.length === 0) continue;
      backups.push(await backupFile(normalized.openClawHome, backupDir, target.path));
      await writeJsonAtomic(target.path, transformed.next);
    }

    if (backups.length > 0) {
      await writeBackupManifest(backupDir, backups);
    }

    return {
      packageName: PACKAGE_NAME,
      version: VERSION,
      mode: "apply",
      openClawHome: normalized.openClawHome,
      agents,
      targets,
      warnings: [],
      applied: true,
      backupDir: backups.length > 0 ? backupDir : undefined,
      backups,
    };
  } finally {
    await releaseLock();
  }
}

export function formatTextReport(plan: WipePlan | WipeResult): string {
  const isResult = "applied" in plan && plan.applied;
  const lines = [
    `${PACKAGE_NAME} ${VERSION} by Growthcircle.id`,
    "",
    `Mode: ${plan.mode}${isResult ? " (completed)" : ""}`,
    `OpenClaw home: ${plan.openClawHome}`,
    `Agents: ${plan.agents.length > 0 ? plan.agents.join(", ") : "(none found)"}`,
    "",
    "Targets:",
  ];

  if (plan.targets.length === 0) {
    lines.push("- No target files found.");
  } else {
    for (const target of plan.targets) {
      const status = target.skippedReason
        ? `skipped: ${target.skippedReason}`
        : !target.exists
          ? "missing"
          : target.changed
            ? `${target.changes.length} change(s)`
            : "already clean";
      lines.push(`- ${target.relativePath}: ${status}`);
      for (const change of target.changes) {
        lines.push(`  - ${change}`);
      }
    }
  }

  if (plan.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of plan.warnings) lines.push(`- ${warning}`);
  }

  if ("backups" in plan && plan.backups.length > 0) {
    lines.push("", `Backup: ${plan.backupDir}`);
    lines.push(`Backed up ${plan.backups.length} file(s).`);
  }

  if (plan.mode === "dry-run") {
    lines.push("", "No files were changed. Run with --apply --yes to write the wipe.");
  }

  return lines.join("\n");
}

function normalizeOptions(options: WipeOptions): NormalizedOptions {
  return {
    openClawHome: resolveOpenClawHome(options.openClawHome),
    agents: options.agents?.filter(Boolean),
    apply: options.apply ?? false,
    backupDir: options.backupDir ? path.resolve(expandHome(options.backupDir)) : undefined,
    lock: options.lock ?? true,
    preserveSessionModelHistory: options.preserveSessionModelHistory ?? false,
  };
}

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
}

async function resolveAgents(root: string, explicitAgents?: string[]): Promise<string[]> {
  if (explicitAgents && explicitAgents.length > 0) return unique(explicitAgents.map(validateAgentId));
  const agentsRoot = path.join(root, "agents");
  try {
    const entries = await fs.readdir(agentsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => validateAgentId(entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function collectTargets(options: NormalizedOptions, agents: string[]): Promise<PlannedTarget[]> {
  const specs = targetSpecFor(options, agents);
  const targets: PlannedTarget[] = [];
  for (const spec of specs) {
    targets.push(await planTarget(options.openClawHome, spec));
  }
  return targets;
}

function targetSpecFor(options: NormalizedOptions, agents: string[]): TargetSpec[] {
  const root = options.openClawHome;
  const specs: TargetSpec[] = [
    {
      path: path.join(root, "openclaw.json"),
      relativePath: "openclaw.json",
      kind: "openclaw-config",
      description: "Scrub embedded model auth defaults and provider registry.",
      transform: transformOpenClawConfig,
    },
  ];

  for (const agent of agents) {
    specs.push(
      {
        path: path.join(root, "agents", agent, "agent", "auth-profiles.json"),
        relativePath: path.join("agents", agent, "agent", "auth-profiles.json"),
        kind: "auth-profiles",
        description: "Reset model OAuth/API-key profiles.",
        transform: resetAuthProfiles,
      },
      {
        path: path.join(root, "agents", agent, "agent", "auth-state.json"),
        relativePath: path.join("agents", agent, "agent", "auth-state.json"),
        kind: "auth-state",
        description: "Reset model auth routing state, cooldowns, and usage stats.",
        transform: resetAuthState,
      },
      {
        path: path.join(root, "agents", agent, "agent", "models.json"),
        relativePath: path.join("agents", agent, "agent", "models.json"),
        kind: "models-registry",
        description: "Reset local custom model provider registry.",
        transform: resetModelsRegistry,
      },
      {
        path: path.join(root, "agents", agent, "sessions", "sessions.json"),
        relativePath: path.join("agents", agent, "sessions", "sessions.json"),
        kind: "sessions",
        description: "Scrub session-level model/auth pins only.",
        transform: transformSessions,
      },
    );
  }
  return specs;
}

async function planTarget(root: string, spec: TargetSpec): Promise<PlannedTarget> {
  const base = {
    path: spec.path,
    relativePath: spec.relativePath,
    kind: spec.kind,
    description: spec.description,
  };

  const stat = await lstatIfExists(spec.path);
  if (!stat) {
    return { ...base, exists: false, changed: false, changes: [] };
  }

  if (stat.isSymbolicLink()) {
    return {
      ...base,
      exists: true,
      changed: false,
      changes: [],
      skippedReason: "refusing to touch symlink",
    };
  }

  await assertTargetSafe(root, spec.path);
  const raw = await readJson(spec.path);
  const transformed = spec.transform(raw, normalizeOptions({ openClawHome: root }));
  return {
    ...base,
    exists: true,
    changed: transformed.changes.length > 0,
    changes: transformed.changes,
  };
}

function transformOpenClawConfig(raw: unknown): TransformResult {
  const next = cloneJson(raw);
  const changes: string[] = [];
  if (!isRecord(next)) return { next, changes };

  deleteJsonPath(next, ["auth", "profiles"], changes);
  deleteJsonPath(next, ["models", "providers"], changes);
  deleteJsonPath(next, ["providers"], changes);
  deleteJsonPath(next, ["agents", "defaults", "model", "primary"], changes);
  deleteJsonPath(next, ["agents", "defaults", "model", "fallbacks"], changes);
  deleteJsonPath(next, ["agents", "defaults", "models"], changes);
  deleteJsonPath(next, ["agents", "defaults", "subagents", "model"], changes);

  const agentsList = getPath(next, ["agents", "list"]);
  if (Array.isArray(agentsList)) {
    agentsList.forEach((agent, index) => {
      if (!isRecord(agent)) return;
      deleteRecordKey(agent, "model", `agents.list[${index}].model`, changes);
      const subagents = agent.subagents;
      if (isRecord(subagents)) {
        deleteRecordKey(subagents, "model", `agents.list[${index}].subagents.model`, changes);
      }
    });
  }

  return { next, changes };
}

function transformSessions(raw: unknown, options: NormalizedOptions): TransformResult {
  const next = cloneJson(raw);
  const changes: string[] = [];
  const keys = options.preserveSessionModelHistory
    ? SESSION_MODEL_AUTH_KEYS.filter((key) => key !== "model" && key !== "modelProvider")
    : SESSION_MODEL_AUTH_KEYS;

  const scrubRecord = (record: unknown, label: string) => {
    if (!isRecord(record)) return;
    for (const key of keys) {
      deleteRecordKey(record, key, `${label}.${key}`, changes);
    }
  };

  if (Array.isArray(next)) {
    next.forEach((entry, index) => scrubRecord(entry, `sessions[${index}]`));
  } else if (isRecord(next)) {
    for (const [sessionKey, entry] of Object.entries(next)) {
      scrubRecord(entry, `sessions.${safePathToken(sessionKey)}`);
    }
  }

  return { next, changes };
}

function resetAuthProfiles(raw: unknown): TransformResult {
  const next = {
    version: versionOf(raw),
    profiles: {},
  };
  return {
    next,
    changes: jsonEqual(raw, next) ? [] : ["profiles cleared"],
  };
}

function resetAuthState(raw: unknown): TransformResult {
  const next = {
    version: versionOf(raw),
  };
  return {
    next,
    changes: jsonEqual(raw, next) ? [] : ["lastGood, cooldown, routing order, and usage stats cleared"],
  };
}

function resetModelsRegistry(raw: unknown): TransformResult {
  const next = {
    version: versionOf(raw),
    providers: {},
  };
  return {
    next,
    changes: jsonEqual(raw, next) ? [] : ["providers cleared"],
  };
}

function versionOf(raw: unknown): number | string {
  if (isRecord(raw) && (typeof raw.version === "number" || typeof raw.version === "string")) {
    return raw.version;
  }
  return 1;
}

function deleteJsonPath(root: JsonRecord, keys: string[], changes: string[]): void {
  let current: unknown = root;
  for (const key of keys.slice(0, -1)) {
    if (!isRecord(current)) return;
    current = current[key];
  }
  if (!isRecord(current)) return;
  const leaf = keys[keys.length - 1];
  deleteRecordKey(current, leaf, keys.join("."), changes);
}

function deleteRecordKey(record: JsonRecord, key: string, label: string, changes: string[]): void {
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    delete record[key];
    changes.push(label);
  }
}

function getPath(root: unknown, keys: string[]): unknown {
  let current = root;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function safePathToken(input: string): string {
  return JSON.stringify(input);
}

function cloneJson<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function validateAgentId(agentId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(agentId)) {
    throw new Error(`Invalid agent id: ${agentId}`);
  }
  return agentId;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(target: string): Promise<void> {
  const stat = await lstatIfExists(target);
  if (!stat) {
    throw new Error(`OpenClaw home does not exist: ${target}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`OpenClaw home is not a directory: ${target}`);
  }
}

async function lstatIfExists(target: string) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

async function readJson(target: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(target, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${target}. Aborting without changes.`);
    }
    throw error;
  }
}

async function assertTargetSafe(root: string, target: string): Promise<void> {
  const rootReal = await fs.realpath(root);
  const targetResolved = path.resolve(target);
  const rootResolved = path.resolve(root);
  if (!isPathInside(rootResolved, targetResolved)) {
    throw new Error(`Refusing to touch path outside OpenClaw home: ${target}`);
  }

  const stat = await lstatIfExists(target);
  if (stat?.isSymbolicLink()) {
    throw new Error(`Refusing to touch symlink: ${target}`);
  }
  if (stat) {
    const targetReal = await fs.realpath(target);
    if (!isPathInside(rootReal, targetReal)) {
      throw new Error(`Refusing to touch path resolving outside OpenClaw home: ${target}`);
    }
  }
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function writeJsonAtomic(target: string, data: unknown): Promise<void> {
  const dir = path.dirname(target);
  const base = path.basename(target);
  const stat = await fs.stat(target);
  const mode = stat.mode & 0o777;
  const temp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(temp, "wx", mode || 0o600);
    await handle.writeFile(payload, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temp, target);
    await syncDirectory(dir);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await fs.unlink(temp).catch(() => undefined);
    throw error;
  }
}

async function syncDirectory(dir: string): Promise<void> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(dir, "r");
    await handle.sync();
  } catch {
    // Directory fsync is best-effort across platforms.
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}

async function backupFile(root: string, backupDir: string, target: string): Promise<BackupEntry> {
  const relativePath = path.relative(root, target);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to back up path outside OpenClaw home: ${target}`);
  }

  const backupPath = path.join(backupDir, relativePath);
  await fs.mkdir(path.dirname(backupPath), { recursive: true, mode: 0o700 });
  await fs.copyFile(target, backupPath);
  const stat = await fs.stat(target);
  await fs.chmod(backupPath, stat.mode & 0o777);
  return {
    originalPath: target,
    backupPath,
    relativePath,
    size: stat.size,
    mode: `0${(stat.mode & 0o777).toString(8)}`,
    mtimeMs: stat.mtimeMs,
    sha256: await sha256File(target),
  };
}

async function writeBackupManifest(backupDir: string, backups: BackupEntry[]): Promise<void> {
  const manifestPath = path.join(backupDir, "manifest.json");
  const manifest = {
    packageName: PACKAGE_NAME,
    version: VERSION,
    createdAt: new Date().toISOString(),
    entries: backups,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
}

async function sha256File(target: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(target));
  return hash.digest("hex");
}

async function acquireLock(root: string): Promise<() => Promise<void>> {
  const lockPath = path.join(root, ".openclaw-auth-wiper.lock");
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(lockPath, "wx", 0o600);
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new Error(`Another auth wipe appears to be running: ${lockPath}`);
    }
    throw error;
  }
  await handle.writeFile(
    `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
    "utf8",
  );
  await handle.sync();
  return async () => {
    await handle.close().catch(() => undefined);
    await fs.unlink(lockPath).catch(() => undefined);
  };
}

function backupStamp(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
