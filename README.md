# vladf1.github.io

Personal GitHub Pages site for [vladf1.github.io](https://vladf1.github.io/).

The root page is a small static homepage with links to older browser projects,
canvas experiments, rebuilds, and TypeScript ports of old Silverlight projects.

## Structure

- `index.html` - the root homepage.
- `public/favicon.ico` - site icon copied into the build.
- `canvas-experiments/` - archived browser canvas projects.
- `canvas-experiments/shared/` - ES module helpers used by bundled canvas experiments.
- `rebuilds/` - rebuilt versions of older browser projects.
- `silverlight-ports/` - TypeScript ports of old Silverlight projects.
- `public/shared/` - vendored browser globals used by the classic pages.

## Projects

The homepage links to:

- `canvas-experiments/balls/`
- `canvas-experiments/swarm/`
- `canvas-experiments/js-fireworks/`
- `canvas-experiments/spaceship/`
- `canvas-experiments/shoot-them-down/`
- `rebuilds/magic-trails/`
- `rebuilds/swarm-2/`
- `rebuilds/swarm-3/`
- `silverlight-ports/swarm/`
- `silverlight-ports/fireworks/`
- `silverlight-ports/vector-defence/`

There is also an external link to
[vector defence 2026](https://vladf1.github.io/vector-defence-2026/).

## Local Development

Install dependencies from the repository root:

```bash
npm ci
```

Run the full site locally:

```bash
npm run dev
```

Project-specific dev scripts open individual projects for convenience:

```bash
npm run dev:swarm-2
npm run dev:swarm-3
npm run dev:fireworks
npm run dev:swarm-port
npm run dev:vector-defence
```

Build the whole site:

```bash
npm run build
```

The production build is written to `dist/` and is not committed.

## Publishing

GitHub Pages publishes this repository as the user site at:

```text
https://vladf1.github.io/
```
