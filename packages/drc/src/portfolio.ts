import { compile } from './compile';
import type { CompileResult, PackSpec, Site } from './types';

export interface Scenario {
  spec: PackSpec;
  overlays: string[];
  extraPacks: number;
}

export function compilePortfolio(sites: Site[], sc: Scenario): CompileResult[] {
  return sites.map((s) => compile(sc.extraPacks ? { ...s, packs: s.packs + sc.extraPacks } : s, sc.spec, sc.overlays, 2));
}

export interface Delta {
  site: Site;
  before: CompileResult;
  after: CompileResult;
  change: 'newly-fails' | 'newly-warns' | 'recovers' | 'same';
  reasons: string[];
}

const rank = { pass: 0, warn: 1, fail: 2 } as const;

export function diffPortfolio(before: CompileResult[], after: CompileResult[]): Delta[] {
  return before.map((b, i) => {
    const a = after[i]!; // compiled from the same site list, so index-aligned
    const db = rank[b.status], da = rank[a.status];
    const change: Delta['change'] = da > db ? (a.status === 'fail' ? 'newly-fails' : 'newly-warns') : da < db ? 'recovers' : 'same';
    const was = new Set(b.checks.filter((c) => c.severity === 'fail' || c.severity === 'warn').map((c) => c.ruleId));
    const reasons = a.checks.filter((c) => (c.severity === 'fail' || c.severity === 'warn') && !was.has(c.ruleId)).map((c) => c.title);
    return { site: b.site, before: b, after: a, change, reasons };
  });
}
