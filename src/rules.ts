export type GuardMode = "none" | "confirm" | "readonly";

export interface TierRule {
  pattern: string;
  color: string;
  label: string;
  mode: GuardMode;
}

export const DEFAULT_RULES = "prod=#d32f2f:PROD:confirm, dev=#2e7d32";

const MODES: GuardMode[] = ["none", "confirm", "readonly"];

/**
 * Parses "pattern=color[:label[:mode]], ..." into rules. The first rule whose
 * pattern (case-insensitive substring) matches wins. The label defaults to
 * the pattern in upper case, the mode to "none".
 */
export function parseRules(text: string): TierRule[] {
  return text
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [pattern, rest = ""] = part.split("=", 2).map((s) => s.trim());
      const [color, label, mode] = rest.split(":").map((s) => s.trim());
      const parsedMode = MODES.find((m) => m === mode?.toLowerCase()) ?? "none";
      return {
        pattern,
        color,
        label: label || pattern.toUpperCase(),
        mode: parsedMode,
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
