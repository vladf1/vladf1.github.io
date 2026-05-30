# VectorDefenceSL Canvas Port

Modern TypeScript canvas port of the original Silverlight `VectorDefenceSL` project.

## Play

Play the game here: [https://vladf1.github.io/old-projects/vector-defence-silverlight-port/](https://vladf1.github.io/old-projects/vector-defence-silverlight-port/)

## Requirements

- Node.js
- npm

## Install

```bash
cd ..
npm install
```

## Run Locally

```bash
cd ..
npm run dev:vector-defence
```

Vite will print the local URL. By default, it runs on `http://127.0.0.1:5173/` unless that port is already in use or you pass a different one.

To run on the port used during development:

```bash
cd ..
npm run dev:vector-defence -- --port 4177
```

Then open:

```text
http://127.0.0.1:4177/
```

## Build

```bash
cd ..
npm run build:vector-defence
```

The production build is written to `dist/`.

## Notes

- The original Silverlight files are not modified.
- Rendering and UI are implemented on a single HTML canvas.
- The file layout intentionally mirrors the original C# class structure where practical.
