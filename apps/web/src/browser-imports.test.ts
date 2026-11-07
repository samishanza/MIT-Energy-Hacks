import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Code the browser loads must never reach a Node built-in such as node:crypto.
// Vite only externalizes one with a warning, so the page loads blank at runtime
// while every test and the typecheck still pass, because they run in Node.
// This walks the runtime imports from each page's entry script.
// After adding a package.json "exports" subpath, restart the Vite dev server: a running
// one keeps the old exports and reports the subpath "is not exported under the conditions".

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WEB = join(ROOT, "apps/web");
const CODE = /\.(m?[jt]sx?)$/;
const BUILTINS = new Set(builtinModules);

type Workspace = Map<string, { dir: string; exports: Record<string, string> }>;

function workspacePackages(): Workspace {
  const found: Workspace = new Map();
  for (const group of ["packages", "apps"]) {
    for (const name of readdirSync(join(ROOT, group))) {
      const file = join(ROOT, group, name, "package.json");
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, "utf8")) as { name: string; exports?: Record<string, string> | string };
      const exports = typeof pkg.exports === "string" ? { ".": pkg.exports } : (pkg.exports ?? {});
      found.set(pkg.name, { dir: join(ROOT, group, name), exports });
    }
  }
  return found;
}

function entryScripts(): string[] {
  return readdirSync(WEB)
    .filter((file) => file.endsWith(".html"))
    .flatMap((file) =>
      [...readFileSync(join(WEB, file), "utf8").matchAll(/<script[^>]*type="module"[^>]*src="\/?([^"]+)"/g)].map((m) => join(WEB, m[1]!)),
    );
}

// Type-only imports are erased. Inline `type` specifiers still load the module under verbatimModuleSyntax.
function runtimeSpecifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
  const found: string[] = [];
  for (const m of code.matchAll(/\bimport\s+(type\s+)?[\w$*{}\s,]+?\s+from\s*["']([^"']+)["']/g)) if (!m[1]) found.push(m[2]!);
  for (const m of code.matchAll(/\bexport\s+(type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s*["']([^"']+)["']/g)) if (!m[1]) found.push(m[2]!);
  for (const m of code.matchAll(/\bimport\s*\(?\s*["']([^"']+)["']/g)) found.push(m[1]!);
  return found;
}

function resolveFile(base: string): string | undefined {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  if (base.endsWith(".js")) candidates.push(base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"));
  return candidates.find((file) => existsSync(file) && statSync(file).isFile());
}

type Resolved = { kind: "file"; file: string } | { kind: "builtin" } | { kind: "external" } | { kind: "unresolved" };

function resolveSpecifier(spec: string, from: string, workspace: Workspace): Resolved {
  if (spec.startsWith(".")) {
    const file = resolveFile(resolve(dirname(from), spec));
    return file ? { kind: "file", file } : { kind: "unresolved" };
  }
  if (spec.startsWith("node:") || BUILTINS.has(spec.split("/")[0]!)) return { kind: "builtin" };
  const parts = /^(@[^/]+\/[^/]+|[^/]+)(\/.*)?$/.exec(spec);
  const pkg = parts && workspace.get(parts[1]!);
  if (!pkg) return { kind: "external" };
  const subpath = `.${parts[2] ?? ""}`;
  let target = pkg.exports[subpath];
  if (!target) {
    for (const [pattern, value] of Object.entries(pkg.exports)) {
      const star = pattern.indexOf("*");
      if (star >= 0 && subpath.startsWith(pattern.slice(0, star)) && subpath.endsWith(pattern.slice(star + 1))) {
        target = value.replace("*", subpath.slice(star, subpath.length - (pattern.length - star - 1)));
      }
    }
  }
  const file = target && resolveFile(join(pkg.dir, target));
  return file ? { kind: "file", file } : { kind: "unresolved" };
}

function walk(entries: string[]) {
  const workspace = workspacePackages();
  const parent = new Map<string, string | null>(entries.map((file) => [file, null]));
  const queue = [...entries];
  const problems: string[] = [];
  const show = (file: string) => relative(ROOT, file).replaceAll("\\", "/");
  const chain = (file: string) => {
    const steps: string[] = [];
    for (let at: string | null | undefined = file; at; at = parent.get(at)) steps.unshift(show(at));
    return steps.join(" -> ");
  };
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (!CODE.test(file)) continue;
    for (const spec of runtimeSpecifiers(readFileSync(file, "utf8"))) {
      const found = resolveSpecifier(spec, file, workspace);
      if (found.kind === "builtin") problems.push(`${chain(file)} imports "${spec}"`);
      if (found.kind === "unresolved") problems.push(`${show(file)} imports "${spec}", which this check can't resolve`);
      if (found.kind === "file" && !parent.has(found.file)) {
        parent.set(found.file, file);
        queue.push(found.file);
      }
    }
  }
  return { visited: [...parent.keys()].map(show), problems };
}

describe("browser bundle", () => {
  const entries = entryScripts();
  const { visited, problems } = walk(entries);

  it("walks from every page's entry script into the workspace packages", () => {
    expect(entries.map((file) => relative(WEB, file).replaceAll("\\", "/")).sort()).toEqual(["src/capture/main.tsx", "src/main.tsx"]);
    expect(visited.some((file) => file.startsWith("packages/"))).toBe(true);
  });

  it("never reaches a Node built-in", () => {
    expect(
      problems,
      "Browser code reached a Node built-in. Import a Node-free subpath instead, as @eqore/sheets imports @eqore/drc/polygon rather than @eqore/drc.",
    ).toEqual([]);
  });
});
