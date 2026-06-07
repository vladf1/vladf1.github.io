# Pretty Swarm Silverlight Port

TypeScript/canvas port of `/Users/vlad/Library/CloudStorage/OneDrive-Personal/Projects/SWARM_Silverlight`.

The source mapping is intentionally direct:

- `App.xaml.cs` -> `src/App.ts`
- `MainPage.xaml` and `MainPage.xaml.cs` -> `index.html`, `src/MainPage.ts`, `src/style.css`
- `Sprite.cs` -> `src/Sprite.ts`
- `GraphicUtils.cs` -> `src/GraphicUtils.ts`

Defaults match the Silverlight project:

- `NumberOfSprites`: `2500`
- `RenderWithShapes`: `false`

The original Silverlight init params are available as query parameters:

- `?NumberOfSprites=120`
- `?RenderWithShapes=true`
