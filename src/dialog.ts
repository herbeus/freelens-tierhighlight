import type { GuardState, MutatingAction } from "./guard";

const DIALOG_ID = "tierhighlight-confirm";

const CSS = `
#${DIALOG_ID} {
  position: fixed; inset: 0; z-index: 2147483600;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); font: 14px/1.45 var(--font-main, sans-serif);
}
#${DIALOG_ID} .box {
  width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow: auto;
  background: var(--dialogBackground, #2b2f36); color: var(--dialogTextColor, #eee);
  border-top: 6px solid var(--tier-color); border-radius: 6px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5); padding: 20px 24px;
}
#${DIALOG_ID} h2 { margin: 0 0 12px; font-size: 17px; }
#${DIALOG_ID} .badge {
  display: inline-block; padding: 0 8px; margin-right: 8px; border-radius: 4px;
  background: var(--tier-color); color: #fff; font-size: 12px; font-weight: 600;
}
#${DIALOG_ID} ul { margin: 0 0 14px; padding-left: 18px; max-height: 180px; overflow: auto; }
#${DIALOG_ID} li { font-family: var(--font-monospace, monospace); font-size: 12.5px; word-break: break-all; }
#${DIALOG_ID} code { font-weight: 600; user-select: all; }
#${DIALOG_ID} input {
  box-sizing: border-box; width: 100%; margin: 8px 0 16px; padding: 8px 10px;
  border-radius: 4px; border: 1px solid var(--inputControlBorder, #666);
  background: var(--inputControlBackground, #1e2125); color: inherit; font: inherit;
}
#${DIALOG_ID} .actions { display: flex; justify-content: flex-end; gap: 8px; }
#${DIALOG_ID} button {
  padding: 6px 14px; border-radius: 4px; border: 0; cursor: pointer; font: inherit;
  background: var(--buttonDefaultBackground, #555); color: #fff;
}
#${DIALOG_ID} button.ok { background: var(--tier-color); }
#${DIALOG_ID} button:disabled { opacity: 0.4; cursor: not-allowed; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * Asks the user to confirm mutating actions by typing the cluster name.
 * Resolves true only on an exact match followed by the confirm button/Enter.
 */
export function confirmActions(actions: MutatingAction[], state: GuardState): Promise<boolean> {
  return new Promise((resolve) => {
    document.getElementById(DIALOG_ID)?.remove();

    const input = el("input", { type: "text", spellcheck: false, autocomplete: "off", placeholder: state.expected });
    const ok = el("button", { className: "ok", disabled: true, textContent: "Execute" });
    const cancel = el("button", { textContent: "Cancel" });
    const count = actions.length === 1 ? "this change" : `these ${actions.length} changes`;

    const root = el(
      "div",
      { id: DIALOG_ID },
      el("style", { textContent: CSS }),
      el(
        "div",
        { className: "box" },
        el("h2", {}, el("span", { className: "badge", textContent: state.label }), `Confirm ${count}`),
        el("ul", {}, ...actions.map((a) => el("li", { textContent: a.summary }))),
        el("div", {}, "Type ", el("code", { textContent: state.expected }), " to continue:"),
        input,
        el("div", { className: "actions" }, cancel, ok),
      ),
    );
    root.style.setProperty("--tier-color", state.color);

    const close = (result: boolean) => {
      root.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(result);
    };
    const matches = () => input.value.trim() === state.expected;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(false);
      } else if (e.key === "Enter" && document.activeElement === input && matches()) {
        e.preventDefault();
        close(true);
      }
    };

    input.addEventListener("input", () => (ok.disabled = !matches()));
    input.addEventListener("paste", (e) => e.preventDefault());
    ok.addEventListener("click", () => matches() && close(true));
    cancel.addEventListener("click", () => close(false));
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(root);
    input.focus();
  });
}
