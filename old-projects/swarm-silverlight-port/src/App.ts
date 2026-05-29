import { MainPage } from "./MainPage";

type InitParams = {
  NumberOfSprites?: string;
  RenderWithShapes?: string;
  FadeAmount?: string;
};

export class App {
  private readonly rootVisual: MainPage;

  public constructor(root: HTMLElement) {
    this.rootVisual = new MainPage(root, this.readInitParams());
  }

  private readInitParams(): InitParams {
    const searchParams = new URLSearchParams(window.location.search);
    return {
      NumberOfSprites: searchParams.get("NumberOfSprites") ?? undefined,
      RenderWithShapes: searchParams.get("RenderWithShapes") ?? undefined,
      FadeAmount: searchParams.get("FadeAmount") ?? undefined,
    };
  }
}
