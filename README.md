# vladf1.github.io

Personal GitHub Pages site for [vladf1.github.io](https://vladf1.github.io/).

The root page is a small static homepage with links to older browser projects,
canvas experiments, rebuilds, and TypeScript ports of old Silverlight projects.

## Structure

- `index.html` - the root homepage.
- `favicon.ico` - site icon.
- `old-projects/` - archived browser projects, rebuilds, and TypeScript canvas ports.

## Projects

The homepage links to:

- `old-projects/balls/`
- `old-projects/swarm/`
- `old-projects/js-fireworks/`
- `old-projects/magic-trails/`
- `old-projects/spaceship/`
- `old-projects/shoot-them-down/`
- `old-projects/swarm-silverlight-port/`
- `old-projects/fireworks-silverlight-port/`
- `old-projects/vector-defence-silverlight-port/`

There is also an external link to
[vector defence 2026](https://vladf1.github.io/vector-defence-2026/).

## Local Preview

Most of the site is plain static HTML and can be served from the repository root:

```bash
python3 -m http.server --bind 127.0.0.1 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

## Silverlight Port Development

The TypeScript Silverlight ports share the Vite setup in `old-projects/`.

```bash
cd old-projects
npm install
```

Run one port locally:

```bash
npm run dev:swarm
npm run dev:fireworks
npm run dev:vector-defence
```

Build all ports:

```bash
npm run build
```

The build output is written to each port's `dist/` folder and is not committed.

## Publishing

GitHub Pages publishes this repository as the user site at:

```text
https://vladf1.github.io/
```
