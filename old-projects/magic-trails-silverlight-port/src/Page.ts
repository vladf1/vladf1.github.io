import { ColorfulFireworks } from "./ColorfulFireworks";

export class Page {
  private readonly LayoutRoot: HTMLDivElement;
  private readonly Cover: HTMLDivElement;
  private readonly colourfulFirework: ColorfulFireworks;

  public constructor(root: HTMLElement) {
    this.LayoutRoot = document.createElement("div");
    this.LayoutRoot.id = "LayoutRoot";

    this.colourfulFirework = new ColorfulFireworks();
    this.LayoutRoot.append(this.colourfulFirework.Element);

    this.Cover = document.createElement("div");
    this.Cover.id = "Cover";
    const text = document.createElement("div");
    text.id = "CoverText";
    text.textContent = "Click to Start";
    this.Cover.append(text);
    this.Cover.addEventListener("pointerdown", this.Cover_MouseLeftButtonDown);

    this.LayoutRoot.append(this.Cover);
    root.append(this.LayoutRoot);
  }

  private Cover_MouseLeftButtonDown = (): void => {
    this.Cover.remove();
    this.colourfulFirework.Start();
  };
}
