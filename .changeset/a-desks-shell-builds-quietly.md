---
"@skillcdn/console": patch
---

The shell of a desk's pages, which `console desk --web` writes, builds quietly: `npm run build` says nothing of its own where it went well and leaves the pages in `dist/`, as its README now says. The bundler reported every file it wrote and warned of the size of the one script, each time, which is a screen an agent read for nothing and a warning with nothing to do about it on pages a machine serves to itself. The script is `vite build --logLevel warn`, and `vite.config.ts` sets the size warning past what the pages are; a warning of anything else, and every error, is printed as before. A shell written before keeps its script: change the two lines by hand, or write the shell again.
