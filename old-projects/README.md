# Old Fun Projects

Collection of older personal projects and modern browser ports.

## Projects

- [Magic Trails Silverlight Port](./magic-trails-silverlight-port/)
- [Fireworks Silverlight Port](./fireworks-silverlight-port/)
- [Swarm Silverlight Port](./swarm-silverlight-port/)
- [Vector Defence Silverlight Port](./vector-defence-silverlight-port/)

## Build

Each project lives in its own subfolder. GitHub Pages publishes the collection at:

```text
https://vladf1.github.io/old-projects/
```

Project builds are copied into matching subdirectories in the Pages artifact.

The Silverlight TypeScript ports share one Vite and TypeScript toolchain from this
folder:

```bash
npm install
npm run build
```

That command writes each port's production output to its own `dist/` folder.
