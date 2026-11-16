export interface TierRule {
  pattern: string;
  color: string;
  label: string;
}

export const DEFAULT_RULES = "prod=#d32f2f, dev=#2e7d32";

/**
 * Parses "pattern=color[:label], ..." into rules. The first rule whose
 * pattern (case-insensitive substring) matches wins. The label defaults to
 * the pattern in upper case.
 */
export function parseRules(text: string): TierRule[] {
  return text
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [pattern, rest = ""] = part.split("=", 2).map((s) => s.trim());
      const [color, label] = rest.split(":", 2).map((s) => s.trim());
      return { pattern, color, label: label || pattern.toUpperCase() };
    })
    .filter((rule) => rule.pattern && rule.color);
}

export function matchRule(rules: TierRule[], names: string[]): TierRule | undefined {
  const haystack = names.filter(Boolean).map((n) => n.toLowerCase());
  return rules.find((rule) =>
    haystack.some((name) => name.includes(rule.pattern.toLowerCase()))
  );
}
