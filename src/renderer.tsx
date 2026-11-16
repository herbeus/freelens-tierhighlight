import React from "react";
import { Renderer } from "@freelensapp/extensions";
import { computed, reaction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { matchRule, parseRules, DEFAULT_RULES } from "./rules";
import { tierHighlightStore, FrameStyle, LabelPosition } from "./store";
import { installGuard, GuardState, CATEGORIES, Category } from "./guard";
import { confirmActions } from "./dialog";

const { SubTitle, Input, Switch, Select, Notifications } = Renderer.Component;

const FRAME_ID = "tierhighlight-frame";
const STYLE_ID = "tierhighlight-style";

export interface FrameLook {
  color: string;
  label?: string;
  frameStyle: FrameStyle;
  borderWidth: number;
  labelPosition: LabelPosition;
  labelSize: number;
  tint: number;
}

/** CSS for the overlay frame; pure so it can be tested. */
export function frameCss(look: Omit<FrameLook, "color" | "label">): string {
  const [vertical, horizontal] = look.labelPosition.split("-") as ["top" | "bottom", "left" | "center" | "right"];
  const border = look.frameStyle === "top" ? `border-top: ${look.borderWidth}px solid var(--tier-color);` : `border: ${look.borderWidth}px solid var(--tier-color);`;
  const tint = look.tint > 0 ? `background: color-mix(in srgb, var(--tier-color) ${look.tint}%, transparent);` : "";
  const x = horizontal === "center" ? "left: 50%; transform: translateX(-50%);" : horizontal === "left" ? "left: 16px;" : "right: 16px;";
  const radius = vertical === "top" ? "0 0 6px 6px" : "6px 6px 0 0";
  return `
#${FRAME_ID} {
  position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;
  ${border} ${tint}
}
#${FRAME_ID}[data-label]::after {
  content: attr(data-label);
  position: absolute; ${vertical}: 0; ${x}
  padding: 1px 12px 3px; border-radius: ${radius};
  background: var(--tier-color); color: #fff;
  font: 600 ${look.labelSize}px/1.4 sans-serif; letter-spacing: 0.08em;
}`;
}

function render(look?: FrameLook) {
  let frame = document.getElementById(FRAME_ID);
  if (!look?.color) {
    frame?.remove();
    document.getElementById(STYLE_ID)?.remove();
    return;
  }
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = frameCss(look);
  if (!frame) {
    frame = document.createElement("div");
    frame.id = FRAME_ID;
    document.body.appendChild(frame);
  }
  frame.style.setProperty("--tier-color", look.color);
  if (look.label) frame.dataset.label = look.label;
  else delete frame.dataset.label;
}

const hint = { marginTop: "8px", display: "block" } as const;
const gap = <div style={{ minHeight: "24px" }} />;
const divider = <div style={{ height: "1px", borderTop: "thin solid var(--hrColor)", margin: "32px 0" }} />;

function numberInput(value: number, min: number, max: number, set: (n: number) => void) {
  return (
    <Input
      theme="round-black"
      type="number"
      min={min}
      max={max}
      value={String(value)}
      onChange={(v) => {
        const n = Number(v);
        if (Number.isFinite(n)) set(Math.min(max, Math.max(min, n)));
      }}
    />
  );
}

const frameStyleOptions = [
  { value: "frame" as const, label: "Frame around the whole view" },
  { value: "top" as const, label: "Bar at the top only" },
];
const positionOptions = (["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const).map(
  (value) => ({ value, label: value.replace("-", " ") })
);
const confirmOptions = [
  { value: "type" as const, label: "Type the cluster name (paste blocked)" },
  { value: "click" as const, label: "Click a button" },
];

const TierHighlightPreference = observer(() => {
  const store = tierHighlightStore;
  const toggleAction = (id: Category) => {
    store.guardActions = store.guardActions.includes(id)
      ? store.guardActions.filter((a) => a !== id)
      : [...store.guardActions, id];
  };
  return (
    <section>
      <SubTitle title="Rules" />
      <Input theme="round-black" value={store.rules} placeholder={DEFAULT_RULES} onChange={(v) => (store.rules = v)} />
      <span style={hint}>
        Comma separated <code>pattern=color[:label[:mode[:actions]]]</code>, matched case-insensitively
        against cluster name and kubeconfig context; first match wins. Mode <code>confirm</code> asks
        before a change, <code>readonly</code> blocks changes. <code>actions</code> overrides the
        guarded changes below for this rule, e.g. <code>delete+scale+helm</code> or <code>all</code>.
        Example: <code>prod=#d32f2f:PROD:confirm, stag=#f9a825:STAGE:confirm:delete+helm, dev=#2e7d32</code>
      </span>

      {divider}
      <SubTitle title="Appearance" />
      <Select
        themeName="lens"
        options={frameStyleOptions}
        value={store.frameStyle}
        onChange={(v) => v && (store.frameStyle = v.value)}
      />
      {gap}
      <SubTitle title="Border width (px)" />
      {numberInput(store.borderWidth, 1, 20, (n) => (store.borderWidth = n))}
      {gap}
      <SubTitle title="Background tint (%)" />
      {numberInput(store.tint, 0, 30, (n) => (store.tint = n))}
      <span style={hint}>Colors the whole cluster view slightly, 0 turns it off. 3 to 6 is usually enough.</span>
      {gap}
      <Switch checked={store.showLabel} onChange={() => (store.showLabel = !store.showLabel)}>
        Show label
      </Switch>
      {gap}
      <SubTitle title="Label position" />
      <Select
        themeName="lens"
        options={positionOptions}
        value={store.labelPosition}
        onChange={(v) => v && (store.labelPosition = v.value)}
      />
      {gap}
      <SubTitle title="Label font size (px)" />
      {numberInput(store.labelSize, 8, 24, (n) => (store.labelSize = n))}

      {divider}
      <SubTitle title="Guarded changes" />
      <span style={{ ...hint, marginBottom: "8px" }}>
        Applies to rules with mode confirm or readonly, unless the rule lists its own actions.
      </span>
      {CATEGORIES.map((c) => (
        <div key={c.id} style={{ marginBottom: "6px" }}>
          <Switch checked={store.guardActions.includes(c.id)} onChange={() => toggleAction(c.id)}>
            {c.label}
          </Switch>
        </div>
      ))}
      {gap}
      <SubTitle title="Confirmation" />
      <Select
        themeName="lens"
        options={confirmOptions}
        value={store.confirmStyle}
        onChange={(v) => v && (store.confirmStyle = v.value)}
      />
      {gap}
      <SubTitle title="Namespaces without guard" />
      <Input
        theme="round-black"
        value={store.exemptNamespaces}
        placeholder="e.g. sandbox, tmp-*"
        onChange={(v) => (store.exemptNamespaces = v)}
      />
      <span style={hint}>
        Comma separated, <code>*</code> as wildcard. Changes in these namespaces are neither confirmed
        nor blocked. Terminal commands count only with <code>-n</code>/<code>--namespace</code>.
      </span>
    </section>
  );
});

/** "gke_project_zone_shared-k8s-prod" -> "shared-k8s-prod" */
function shortClusterName(name: string): string {
  const parts = name.split("_").filter(Boolean);
  return parts[parts.length - 1] ?? name;
}

const activeRule = computed(() => {
  const cluster = Renderer.Catalog.activeCluster.get();
  const name = cluster?.getName() ?? "";
  const rule = matchRule(parseRules(tierHighlightStore.rules), [name, cluster?.spec?.kubeconfigContext]);
  return { rule, name };
});

function guardState(): GuardState {
  const { rule, name } = activeRule.get();
  const store = tierHighlightStore;
  const base = { categories: [] as Category[], exemptNamespaces: [] as string[], confirmStyle: store.confirmStyle };
  if (!rule || !name) return { ...base, mode: "none", expected: "", label: "", color: "" };
  return {
    mode: rule.mode,
    expected: shortClusterName(name),
    label: rule.label,
    color: rule.color,
    categories: rule.actions ?? [...store.guardActions],
    exemptNamespaces: store.exemptNamespaceList,
    confirmStyle: store.confirmStyle,
  };
}

export default class TierHighlightRenderer extends Renderer.LensExtension {
  private disposers: (() => void)[] = [];

  appPreferences = [
    {
      title: "Tier Highlight",
      components: {
        Input: () => <TierHighlightPreference />,
        Hint: () => <span />,
      },
    },
  ];

  onActivate() {
    tierHighlightStore.loadExtension(this);

    // Cluster views are iframes; only act there so the frame surrounds
    // exactly the cluster being worked on and never doubles up.
    if (window.top === window) return;

    const disposeFrame: IReactionDisposer = reaction(
      (): FrameLook | undefined => {
        const { rule } = activeRule.get();
        const store = tierHighlightStore;
        if (!rule) return undefined;
        return {
          color: rule.color,
          label: store.showLabel ? rule.label : undefined,
          frameStyle: store.frameStyle,
          borderWidth: store.borderWidth,
          labelPosition: store.labelPosition,
          labelSize: store.labelSize,
          tint: store.tint,
        };
      },
      (look) => render(look),
      { fireImmediately: true, equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
    );

    const disposeGuard = installGuard(guardState, confirmActions, (message) =>
      Notifications.error(message)
    );

    this.disposers.push(disposeFrame, disposeGuard);
  }

  onDeactivate() {
    this.disposers.splice(0).forEach((dispose) => dispose());
    render();
  }
}
