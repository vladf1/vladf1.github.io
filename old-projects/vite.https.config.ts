import fs from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    https: {
      cert: fs.readFileSync(".certs/swarm-3.crt"),
      key: fs.readFileSync(".certs/swarm-3.key")
    }
  }
});
