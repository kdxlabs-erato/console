import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run build` writes the pages into dist, which `console serve dist --records ../records`
// serves with the API and the desk's records. `npm run dev` shows the pages as their sources
// change, and sends the API and the records to `console serve --records ../records` running
// beside it without a directory.
const served = { target: "http://127.0.0.1:11197", changeOrigin: true };
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": served, "/records": served } },
});
