import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      input: {
        main: "index.html",
        balls: "canvas-experiments/balls/index.html",
        clickMe: "canvas-experiments/click-me/index.html",
        jsFireworks: "canvas-experiments/js-fireworks/index.html",
        shootThemDown: "canvas-experiments/shoot-them-down/index.html",
        spaceship: "canvas-experiments/spaceship/index.html",
        classicSwarm: "canvas-experiments/swarm/index.html",
        magicTrails: "rebuilds/magic-trails/index.html",
        swarm2: "rebuilds/swarm-2/index.html",
        swarm2Benchmark: "rebuilds/swarm-2/benchmark.html",
        swarm3: "rebuilds/swarm-3/index.html",
        fireworksPort: "silverlight-ports/fireworks/index.html",
        swarmPort: "silverlight-ports/swarm/index.html",
        vectorDefencePort: "silverlight-ports/vector-defence/index.html",
      },
    },
  },
  server: {
    allowedHosts: [".trycloudflare.com"],
  },
});
