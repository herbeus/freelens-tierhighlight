import { Common } from "@freelensapp/extensions";
import { makeObservable, observable } from "mobx";
import { DEFAULT_RULES } from "./rules";

type Model = { rules: string; showLabel: boolean };

export class TierHighlightStore extends Common.Store.ExtensionStore<Model> {
  rules = DEFAULT_RULES;
  showLabel = true;

  constructor() {
    super({
      configName: "tierhighlight-store",
      defaults: { rules: DEFAULT_RULES, showLabel: true },
    });
    makeObservable(this, { rules: observable, showLabel: observable });
  }

  fromStore({ rules, showLabel }: Partial<Model>): void {
    this.rules = rules ?? DEFAULT_RULES;
    this.showLabel = showLabel ?? true;
  }

  toJSON(): Model {
    return { rules: this.rules, showLabel: this.showLabel };
  }
}

export const tierHighlightStore = new TierHighlightStore();
