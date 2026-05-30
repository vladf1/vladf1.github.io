# Old Fun Projects

Collection of older personal projects and modern browser ports.

## Projects

- [Balls](./balls/)
- [Click Me](./click-me/)
- [JS Fireworks](./js-fireworks/)
- [Shoot Them Down](./shoot-them-down/)
- [Spaceship](./spaceship/)
- [Swarm](./swarm/)
- [Magic Trails Silverlight Port](./magic-trails-silverlight-port/)
- [Fireworks Silverlight Port](./fireworks-silverlight-port/)
- [Swarm Silverlight Port](./swarm-silverlight-port/)
- [Vector Defence Silverlight Port](./vector-defence-silverlight-port/)

## Published Site

Each project lives in its own subfolder. GitHub Pages publishes the collection at:

```text
https://vladf1.github.io/old-projects/
```

The older HTML/JavaScript projects are static and run directly from their
folders.

## Build

The Silverlight TypeScript ports share one Vite and TypeScript toolchain from this
folder:

```bash
npm install
npm run build
```

That command writes each port's production output to its own `dist/` folder.
The `dist/` folders are ignored by git; they are local build artifacts.
