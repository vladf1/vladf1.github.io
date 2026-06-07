# Agent Notes

- For local HTTP testing, use the root Vite setup instead of `python3 -m http.server`. The Python server can leave browsers with stale ES module responses during iterative JS work.
- For Swarm 2 specifically, run `npm run dev:swarm-2` from the repo root; Vite opens `/rebuilds/swarm-2/`.
