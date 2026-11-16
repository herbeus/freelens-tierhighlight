import { Common } from "@freelensapp/extensions";
import { makeObservable, observable } from "mobx";
import { DEFAULT_RULES } from "./rules";
import type { Category } from "./guard";

export type FrameStyle = "frame" | "top";
export type LabelPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

type Model = {
  rules: string;
  showLabel: boolean;
  frameStyle: FrameStyle;
  borderWidth: number;
  labelPosition: LabelPosition;
  labelSize: number;
  tint: number;
  guardActions: Category[];
  exemptNamespaces: string;
  confirmStyle: "type" | "click";
};

const DEFAULTS: Model = {
  rules: DEFAULT_RULES,
  showLabel: true,
  frameStyle: "frame",
  borderWidth: 4,
  labelPosition: "top-center",
  labelSize: 11,
  tint: 0,
  guardActions: ["delete", "scale", "edit", "create", "helm", "node"],
  exemptNamespaces: "",
  confirmStyle: "type",
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export class TierHighlightStore extends Common.Store.ExtensionStore<Model> {
  rules = DEFAULTS.rules;
  showLabel = DEFAULTS.showLabel;
  frameStyle = DEFAULTS.frameStyle;
  borderWidth = DEFAULTS.borderWidth;
  labelPosition = DEFAULTS.labelPosition;
  labelSize = DEFAULTS.labelSize;
  tint = DEFAULTS.tint;
  guardActions = DEFAULTS.guardActions;
  exemptNamespaces = DEFAULTS.exemptNamespaces;
  confirmStyle = DEFAULTS.confirmStyle;

  constructor() {
    super({ configName: "tierhighlight-store", defaults: DEFAULTS });
    makeObservable(this, {
      rules: observable,
      showLabel: observable,
      frameStyle: observable,
      borderWidth: observable,
      labelPosition: observable,
      labelSize: observable,
      tint: observable,
      guardActions: observable,
      exemptNamespaces: observable,
      confirmStyle: observable,
    });
  }

  fromStore(data: Partial<Model>): void {
    this.rules = data.rules ?? DEFAULTS.rules;
    this.showLabel = data.showLabel ?? DEFAULTS.showLabel;
    this.frameStyle = data.frameStyle ?? DEFAULTS.frameStyle;
    this.borderWidth = clamp(data.borderWidth, 1, 20, DEFAULTS.borderWidth);
    this.labelPosition = data.labelPosition ?? DEFAULTS.labelPosition;
    this.labelSize = clamp(data.labelSize, 8, 24, DEFAULTS.labelSize);
    this.tint = clamp(data.tint, 0, 30, DEFAULTS.tint);
    this.guardActions = Array.isArray(data.guardActions) ? data.guardActions : DEFAULTS.guardActions;
    this.exemptNamespaces = data.exemptNamespaces ?? DEFAULTS.exemptNamespaces;
    this.confirmStyle = data.confirmStyle ?? DEFAULTS.confirmStyle;
  }

  toJSON(): Model {
    return {
      rules: this.rules,
      showLabel: this.showLabel,
      frameStyle: this.frameStyle,
      borderWidth: this.borderWidth,
      labelPosition: this.labelPosition,
      labelSize: this.labelSize,
      tint: this.tint,
      guardActions: [...this.guardActions],
      exemptNamespaces: this.exemptNamespaces,
      confirmStyle: this.confirmStyle,
    };
  }

  get exemptNamespaceList(): string[] {
    return this.exemptNamespaces.split(/[\s,]+/).filter(Boolean);
  }
}

export const tierHighlightStore = new TierHighlightStore();
