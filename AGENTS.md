# Agent Notes

- For local HTTP testing in `old-projects`, use the existing Vite setup instead of `python3 -m http.server`. The Python server can leave browsers with stale ES module responses during iterative JS work.
- For Swarm 2 specifically, run `npm run dev:swarm-2` from `old-projects`; Vite serves that page at the local root URL it prints.
