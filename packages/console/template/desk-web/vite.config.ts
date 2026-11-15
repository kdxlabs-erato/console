import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run build` writes the pages into dist, which `console serve dist` serves with the API.
// `npm run dev` shows them as their sources change, and sends the API to `console serve`
// running beside it without a directory.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:11197", changeOrigin: true } } },
});
