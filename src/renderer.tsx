import React from "react";
import { Renderer } from "@freelensapp/extensions";
import { reaction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { matchRule, parseRules, DEFAULT_RULES } from "./rules";
import { tierHighlightStore } from "./store";

const { SubTitle, Input, Switch } = Renderer.Component;

const FRAME_ID = "tierhighlight-frame";
const STYLE_ID = "tierhighlight-style";

const CSS = `
#${FRAME_ID} {
  position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;
  border: 4px solid var(--tier-color);
}
#${FRAME_ID}[data-label]::after {
  content: attr(data-label);
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  padding: 1px 12px 3px; border-radius: 0 0 6px 6px;
  background: var(--tier-color); color: #fff;
  font: 600 11px/1.4 sans-serif; letter-spacing: 0.08em;
}`;

function render(color?: string, label?: string) {
  let frame = document.getElementById(FRAME_ID);
  if (!color) {
    frame?.remove();
    return;
  }
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  if (!frame) {
    frame = document.createElement("div");
    frame.id = FRAME_ID;
    document.body.appendChild(frame);
  }
  frame.style.setProperty("--tier-color", color);
  if (label) frame.dataset.label = label;
  else delete frame.dataset.label;
}

const TierHighlightPreference = observer(() => (
  <section>
    <SubTitle title="Rules" />
    <Input
      theme="round-black"
      value={tierHighlightStore.rules}
      placeholder={DEFAULT_RULES}
      onChange={(v) => {
        tierHighlightStore.rules = v;
      }}
    />
    <span style={{ marginTop: "8px", display: "block" }}>
      Comma separated <code>pattern=color[:label]</code>, matched case-insensitively
      against cluster name and kubeconfig context; first match wins. Example:{" "}
      <code>prod=#d32f2f:PROD, stag=#f9a825, dev=#2e7d32</code>
    </span>
    <div style={{ minHeight: "24px" }} />
    <Switch
      checked={tierHighlightStore.showLabel}
      onChange={() => {
        tierHighlightStore.showLabel = !tierHighlightStore.showLabel;
      }}
    >
      Show label at the top of the frame
    </Switch>
  </section>
));

export default class TierHighlightRenderer extends Renderer.LensExtension {
  private dispose?: IReactionDisposer;

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

    // Cluster views are iframes; only draw there so the frame surrounds
    // exactly the cluster being worked on and never doubles up.
    if (window.top === window) return;

    this.dispose = reaction(
      () => {
        const cluster = Renderer.Catalog.activeCluster.get();
        const rule = matchRule(parseRules(tierHighlightStore.rules), [
          cluster?.getName(),
          cluster?.spec?.kubeconfigContext,
        ]);
        return {
          color: rule?.color,
          label: tierHighlightStore.showLabel ? rule?.label : undefined,
        };
      },
      ({ color, label }) => render(color, label),
      { fireImmediately: true, equals: (a, b) => a.color === b.color && a.label === b.label }
    );
  }

  onDeactivate() {
    this.dispose?.();
    render(undefined);
  }
}
