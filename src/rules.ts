import type { Category } from "./guard";

export type GuardMode = "none" | "confirm" | "readonly";

const ALL_CATEGORIES: Category[] = ["delete", "scale", "edit", "create", "helm", "node"];

export interface TierRule {
  pattern: string;
  color: string;
  label: string;
  mode: GuardMode;
  /** Overrides the guarded kinds of changes from the preferences. */
  actions?: Category[];
}

export const DEFAULT_RULES = "prod=#d32f2f:PROD:confirm, dev=#2e7d32";

const MODES: GuardMode[] = ["none", "confirm", "readonly"];

/**
 * Parses "pattern=color[:label[:mode[:actions]]], ..." into rules. The first
 * rule whose pattern (case-insensitive substring) matches wins. The label
 * defaults to the pattern in upper case, the mode to "none". actions is a
 * "+" separated list like "delete+scale+helm" or "all".
 */
export function parseRules(text: string): TierRule[] {
  return text
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [pattern, rest = ""] = part.split("=", 2).map((s) => s.trim());
      const [color, label, mode, actions] = rest.split(":").map((s) => s.trim());
      const parsedMode = MODES.find((m) => m === mode?.toLowerCase()) ?? "none";
      return {
        pattern,
        color,
        label: label || pattern.toUpperCase(),
        mode: parsedMode,
        actions: parseActions(actions),
      };
    })
    .filter((rule) => rule.pattern && rule.color);
}

export function matchRule(rules: TierRule[], names: string[]): TierRule | undefined {
  const haystack = names.filter(Boolean).map((n) => n.toLowerCase());
  return rules.find((rule) =>
    haystack.some((name) => name.includes(rule.pattern.toLowerCase()))
  );
}

function parseActions(text: string | undefined): Category[] | undefined {
  if (!text) return undefined;
  const words = text.toLowerCase().split("+").map((w) => w.trim());
  if (words.includes("all")) return [...ALL_CATEGORIES];
  const actions = ALL_CATEGORIES.filter((c) => words.includes(c));
  return actions.length ? actions : undefined;
}
