/**
 * Guards mutating actions in a cluster frame: Kubernetes API writes, Helm
 * release changes and resource creation go through fetch; cordon/drain and
 * pasted kubectl/helm commands go through the terminal websocket.
 */

export interface GuardState {
  mode: "none" | "confirm" | "readonly";
  /** What the user has to type to confirm. */
  expected: string;
  label: string;
  color: string;
}

export interface MutatingAction {
  summary: string;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const IGNORED_KUBE_PATHS = /\/(selfsubject\w*|subjectaccessreviews|tokenreviews)(\/|$|\?)/;
const CLI = new Set(["kubectl", "kubectl.exe", "k", "helm", "helm.exe"]);
const MUTATING_VERBS = new Set([
  "delete", "drain", "cordon", "uncordon", "scale", "edit", "apply", "patch", "replace",
  "create", "rollout", "annotate", "label", "taint", "set", "autoscale",
  "uninstall", "upgrade", "install", "rollback",
]);
/** Flags that take a separate value, so the value is not mistaken for the verb. */
const FLAGS_WITH_VALUE = new Set(["-n", "--namespace", "--context", "--kubeconfig", "--cluster", "--user", "-s", "--server", "--kube-context"]);

/** Finds the verb of each kubectl/helm invocation in a (possibly chained) command line. */
export function mutatingVerb(commandLine: string): string | undefined {
  for (const segment of commandLine.split(/&&|\|\||;|\|/)) {
    const tokens = segment.trim().split(/\s+/);
    const cli = tokens.findIndex((t) => CLI.has(t.replace(/^.*[\\/]/, "").replace(/^["']|["']$/g, "").toLowerCase()));
    if (cli < 0) continue;
    for (let i = cli + 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (FLAGS_WITH_VALUE.has(token)) {
        i++;
        continue;
      }
      if (token.startsWith("-")) continue;
      if (MUTATING_VERBS.has(token)) return token;
      break;
    }
  }
  return undefined;
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
    return { summary: `${method} ${target}` };
  }

  const helm = path.match(/\/v2\/releases(?:\/([^/]+)\/([^/]+))?(\/rollback)?/);
  if (helm) {
    const action = helm[3] ? "rollback" : method === "DELETE" ? "uninstall" : method === "PUT" ? "upgrade" : "install";
    const name = helm[2] ? `${helm[2]} (namespace ${helm[1]})` : "new release";
    return { summary: `Helm ${action} ${name}` };
  }

  if (/\/api\/stack$/.test(path)) {
    return { summary: "Apply resources from editor" };
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
  return mutatingVerb(command) ? { summary: `Terminal: ${command}` } : undefined;
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
