/**
 * Guards mutating actions in a cluster frame: Kubernetes API writes, Helm
 * release changes and resource creation go through fetch; cordon/drain and
 * pasted kubectl/helm commands go through the terminal websocket.
 */

export type Category = "delete" | "scale" | "edit" | "create" | "helm" | "node";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "delete", label: "Delete (incl. evict)" },
  { id: "scale", label: "Scale" },
  { id: "edit", label: "Edit, patch, restart, label" },
  { id: "create", label: "Create and apply" },
  { id: "helm", label: "Helm install, upgrade, rollback, uninstall" },
  { id: "node", label: "Cordon, uncordon, drain, taint" },
];

export interface GuardState {
  mode: "none" | "confirm" | "readonly";
  /** What the user has to type to confirm. */
  expected: string;
  label: string;
  color: string;
  /** Kinds of changes that are guarded. */
  categories: Category[];
  /** Namespaces (glob with *) whose changes are not guarded. */
  exemptNamespaces: string[];
  /** "type": type the cluster name, "click": confirm with a button. */
  confirmStyle: "type" | "click";
}

export interface MutatingAction {
  summary: string;
  category: Category;
  namespace?: string;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const IGNORED_KUBE_PATHS = /\/(selfsubject\w*|subjectaccessreviews|tokenreviews)(\/|$|\?)/;
const CLI = new Set(["kubectl", "kubectl.exe", "k", "helm", "helm.exe"]);
const VERB_CATEGORY: Record<string, Category> = {
  delete: "delete",
  drain: "node", cordon: "node", uncordon: "node", taint: "node",
  scale: "scale", autoscale: "scale",
  edit: "edit", patch: "edit", replace: "edit", annotate: "edit", label: "edit", set: "edit", rollout: "edit",
  apply: "create", create: "create",
  install: "helm", upgrade: "helm", rollback: "helm", uninstall: "helm",
};
/** Flags that take a separate value, so the value is not mistaken for the verb. */
const FLAGS_WITH_VALUE = new Set(["-n", "--namespace", "--context", "--kubeconfig", "--cluster", "--user", "-s", "--server", "--kube-context"]);

export interface ParsedCommand {
  verb: string;
  category: Category;
  namespace?: string;
}

/** Finds the first changing kubectl/helm invocation in a (possibly chained) command line. */
export function parseCommand(commandLine: string): ParsedCommand | undefined {
  for (const segment of commandLine.split(/&&|\|\||;|\|/)) {
    const tokens = segment.trim().split(/\s+/).map((t) => t.replace(/^["']|["']$/g, ""));
    const cli = tokens.findIndex((t) => CLI.has(t.replace(/^.*[\\/]/, "").toLowerCase()));
    if (cli < 0) continue;
    const isHelm = tokens[cli].replace(/^.*[\\/]/, "").toLowerCase().startsWith("helm");

    let namespace: string | undefined;
    let verb: string | undefined;
    for (let i = cli + 1; i < tokens.length; i++) {
      const token = tokens[i];
      const nsInline = token.match(/^(?:--namespace|-n)=?(.+)$/);
      if (token === "-n" || token === "--namespace") namespace = tokens[i + 1];
      else if (nsInline && token !== "--namespace") namespace = nsInline[1];
      if (FLAGS_WITH_VALUE.has(token)) {
        i++;
        continue;
      }
      if (token.startsWith("-")) continue;
      verb ??= token;
    }
    if (!verb) continue;
    if (isHelm && (verb === "delete" || verb === "del")) return { verb, category: "helm", namespace };
    const category = VERB_CATEGORY[verb];
    if (category) return { verb, category: isHelm ? "helm" : category, namespace };
  }
  return undefined;
}

/** Kept for compatibility: the changing verb of a command line, if any. */
export function mutatingVerb(commandLine: string): string | undefined {
  return parseCommand(commandLine)?.verb;
}

export function describeRequest(method: string, rawUrl: string): MutatingAction | undefined {
  method = method.toUpperCase();
  if (!WRITE_METHODS.has(method)) return undefined;

  let path: string;
  try {
    path = decodeURIComponent(new URL(rawUrl, location.href).pathname);
  } catch {
    return undefined;
  }

  const kube = path.indexOf("/api-kube/");
  if (kube >= 0) {
    const resourcePath = path.slice(kube + "/api-kube".length);
    if (IGNORED_KUBE_PATHS.test(resourcePath)) return undefined;
    const ns = resourcePath.match(/\/namespaces\/([^/]+)\/(.+)$/);
    const target = ns ? `${ns[2]} (namespace ${ns[1]})` : resourcePath.replace(/^\/apis?\/[^/]+(\/v[^/]+)?\//, "");
    let category: Category;
    if (method === "DELETE" || /\/eviction$/.test(resourcePath)) category = "delete";
    else if (/\/scale$/.test(resourcePath)) category = "scale";
    else if (/^\/api\/v1\/nodes\//.test(resourcePath)) category = "node";
    else if (method === "POST") category = "create";
    else category = "edit";
    return { summary: `${method} ${target}`, category, namespace: ns?.[1] };
  }

  const helm = path.match(/\/v2\/releases(?:\/([^/]+)\/([^/]+))?(\/rollback)?/);
  if (helm) {
    const action = helm[3] ? "rollback" : method === "DELETE" ? "uninstall" : method === "PUT" ? "upgrade" : "install";
    const name = helm[2] ? `${helm[2]} (namespace ${helm[1]})` : "new release";
    return { summary: `Helm ${action} ${name}`, category: "helm", namespace: helm[1] };
  }

  if (/\/api\/stack$/.test(path)) {
    return { summary: "Apply resources from editor", category: "create" };
  }

  return undefined;
}

export function describeTerminalMessage(payload: unknown): MutatingAction | undefined {
  if (typeof payload !== "string" || !payload.startsWith("{")) return undefined;
  let message: { type?: string; data?: unknown };
  try {
    message = JSON.parse(payload);
  } catch {
    return undefined;
  }
  if (message.type !== "stdin" || typeof message.data !== "string") return undefined;
  // Single keystrokes are not inspected, only whole commands (menu actions, paste).
  if (message.data.length < 4 || !/[\r\n]/.test(message.data)) return undefined;
  const command = message.data.trim();
  const parsed = parseCommand(command);
  return parsed ? { summary: `Terminal: ${command}`, category: parsed.category, namespace: parsed.namespace } : undefined;
}

/** True if the action is covered by the state's categories and not in an exempt namespace. */
export function isGuarded(action: MutatingAction, state: GuardState): boolean {
  if (!state.categories.includes(action.category)) return false;
  const ns = action.namespace;
  if (!ns) return true;
  return !state.exemptNamespaces.some((pattern) =>
    new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i").test(ns)
  );
}

type Decide = (actions: MutatingAction[], state: GuardState) => Promise<boolean>;

/**
 * Collects actions that arrive close together (e.g. deleting several selected
 * items) into a single confirmation.
 */
class Batcher {
  private pending: { action: MutatingAction; resolve: (ok: boolean) => void }[] = [];
  private running?: Promise<void>;

  constructor(private readonly decide: Decide) {}

  ask(action: MutatingAction, state: GuardState): Promise<boolean> {
    return new Promise((resolve) => {
      this.pending.push({ action, resolve });
      this.running ??= this.flush(state);
    });
  }

  private async flush(state: GuardState) {
    await new Promise((r) => setTimeout(r, 50));
    const batch = this.pending;
    this.pending = [];
    const ok = await this.decide(batch.map((b) => b.action), state).catch(() => false);
    batch.forEach((b) => b.resolve(ok));
    this.running = undefined;
    if (this.pending.length) this.running = this.flush(state);
  }
}

function blockedResponse(reason: string): Response {
  const body = { kind: "Status", apiVersion: "v1", status: "Failure", code: 403, reason: "Forbidden", message: reason };
  return new Response(JSON.stringify(body), { status: 403, headers: { "content-type": "application/json" } });
}

export function installGuard(
  getState: () => GuardState,
  decide: Decide,
  notify: (message: string) => void,
): () => void {
  const batcher = new Batcher(decide);
  const originalFetch = window.fetch;
  const originalSend = window.WebSocket.prototype.send;

  const check = async (action: MutatingAction): Promise<string | undefined> => {
    const state = getState();
    if (!isGuarded(action, state)) return undefined;
    if (state.mode === "readonly") {
      return `Blocked by Tier Highlight: ${state.label} is read-only (${action.summary})`;
    }
    if (state.mode === "confirm" && !(await batcher.ask(action, state))) {
      return `Cancelled by Tier Highlight: ${action.summary} was not confirmed`;
    }
    return undefined;
  };

  window.fetch = async function guardedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const url = input instanceof Request ? input.url : String(input);
    const action = getState().mode === "none" ? undefined : describeRequest(method, url);
    if (action) {
      const blocked = await check(action);
      if (blocked) return blockedResponse(blocked);
    }
    return originalFetch.call(this, input, init);
  } as typeof window.fetch;

  window.WebSocket.prototype.send = function guardedSend(this: WebSocket, data: Parameters<WebSocket["send"]>[0]) {
    const action = getState().mode === "none" ? undefined : describeTerminalMessage(data);
    if (!action) return originalSend.call(this, data);
    void check(action).then((blocked) => {
      if (!blocked) originalSend.call(this, data);
      else notify(blocked);
    });
  };

  return () => {
    window.fetch = originalFetch;
    window.WebSocket.prototype.send = originalSend;
  };
}
