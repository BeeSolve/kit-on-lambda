import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function assertUnreachable(value: never, message = JSON.stringify(value)): never {
  throw Error("An unreachable state reached!\n" + message);
}

/**
 * Resolve `external` build patterns to a concrete `{ name: version }` map by
 * matching them against the packages installed in the project's `node_modules`.
 *
 * Patterns are matched as literal names or trailing-`*` prefixes, so
 * `@opentelemetry/*` matches every installed `@opentelemetry/...` package and
 * `import-in-the-middle` matches exactly that package. Node builtins and
 * `node:`-prefixed specifiers are ignored (they are provided by the runtime).
 *
 * The resolved version is read from each package's own `package.json` so the
 * generated `server/package.json` pins exactly what was used at build time.
 */
export function resolveExternalDependencies(props: {
  external: Array<string>;
  nodeModulesDir: string;
}): Record<string, string> {
  const { external, nodeModulesDir } = props;

  const patterns = external.filter(
    (pattern) => !pattern.startsWith("node:") && !isNodeBuiltin(pattern),
  );
  if (patterns.length === 0) return {};

  const installed = listInstalledPackages(nodeModulesDir);
  const resolved: Record<string, string> = {};

  for (const name of installed) {
    if (!patterns.some((pattern) => matchesPattern({ name, pattern }))) continue;
    const version = readInstalledVersion({ name, nodeModulesDir });
    if (version != null) resolved[name] = version;
  }

  for (const pattern of patterns) {
    if (pattern.endsWith("*")) continue;
    if (resolved[pattern] != null) continue;
    const version = readInstalledVersion({ name: pattern, nodeModulesDir });
    if (version != null) resolved[pattern] = version;
  }

  return resolved;
}

function matchesPattern(props: { name: string; pattern: string }): boolean {
  const { name, pattern } = props;
  if (pattern.endsWith("*")) return name.startsWith(pattern.slice(0, -1));
  return name === pattern;
}

function listInstalledPackages(nodeModulesDir: string): Array<string> {
  if (!existsSync(nodeModulesDir)) return [];

  const names: Array<string> = [];
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = join(nodeModulesDir, entry.name);
      for (const scoped of readdirSync(scopeDir, { withFileTypes: true })) {
        if (!scoped.isDirectory() && !scoped.isSymbolicLink()) continue;
        names.push(`${entry.name}/${scoped.name}`);
      }
      continue;
    }
    names.push(entry.name);
  }
  return names;
}

function readInstalledVersion(props: { name: string; nodeModulesDir: string }): string | undefined {
  const { name, nodeModulesDir } = props;
  const manifest = join(nodeModulesDir, name, "package.json");
  if (!existsSync(manifest)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed != null &&
      "version" in parsed &&
      typeof parsed.version === "string"
    ) {
      return parsed.version;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const nodeBuiltins = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

function isNodeBuiltin(specifier: string): boolean {
  const name = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
  return nodeBuiltins.has(name);
}

/**
 * Detect the package manager used by the project from lockfiles in `cwd`,
 * falling back to the `npm_config_user_agent` env var, then to `npm`.
 */
export function detectPackageManager(cwd: string): "bun" | "pnpm" | "yarn" | "npm" {
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";

  const userAgent = process.env.npm_config_user_agent ?? "";
  if (userAgent.startsWith("bun")) return "bun";
  if (userAgent.startsWith("pnpm")) return "pnpm";
  if (userAgent.startsWith("yarn")) return "yarn";
  return "npm";
}

/**
 * Build the `install` argv for a given package manager. Installs only the
 * dependencies declared in the target directory's `package.json`, without
 * touching the project lockfile.
 */
export function installCommand(manager: "bun" | "pnpm" | "yarn" | "npm"): Array<string> {
  if (manager === "bun") return ["bun", "install", "--no-save"];
  if (manager === "pnpm") return ["pnpm", "install", "--prod", "--no-lockfile"];
  if (manager === "yarn") return ["yarn", "install", "--production"];
  if (manager === "npm") return ["npm", "install", "--omit=dev", "--no-package-lock"];
  return assertUnreachable(manager);
}

export function computeRoutes(files: Array<string>): Array<string> {
  return [
    ...new Set(
      files
        .map((file) => {
          const segments = file.split("/");
          // A top-level file (e.g. `favicon.ico`) or a file one level deep
          // (e.g. `_app/version.json`) maps to an exact route. Files nested
          // deeper collapse to a two-segment wildcard (e.g. `_app/immutable/*`).
          //
          // Deliberately never emit a bare one-segment wildcard such as
          // `_app/*`: SvelteKit serves dynamic endpoints under `_app/` too
          // (e.g. remote functions at `_app/remote/*`), and a greedy `_app/*`
          // S3 route would shadow them, sending those dynamic requests to the
          // asset bucket (404/403) instead of the Lambda default behaviour.
          if (segments.length <= 2) return file;
          return `${segments[0]}/${segments[1]}/*`;
        })
        .filter((route): route is string => route != null),
    ),
  ];
}
