import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run build` writes the pages into dist, which `console serve dist --records ../records`
// serves with the API and the desk's records. `npm run dev` shows the pages as their sources
// change, and sends the API and the records to `console serve --records ../records` running
// beside it without a directory. A build that went well says nothing of its own: it speaks from
// a warning up, and the size of the one script, which this machine serves to itself, is not
// one until it is far past what the pages are.
const served = { target: "http://127.0.0.1:11197", changeOrigin: true };
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 4000 },
  server: { proxy: { "/api": served, "/records": served } },
});
