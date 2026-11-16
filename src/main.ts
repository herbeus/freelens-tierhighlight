import { Main } from "@freelensapp/extensions";
import { tierHighlightStore } from "./store";

export default class TierHighlightMain extends Main.LensExtension {
  onActivate() {
    tierHighlightStore.loadExtension(this);
  }
}
