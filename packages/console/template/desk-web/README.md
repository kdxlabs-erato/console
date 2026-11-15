# __TITLE__: the pages

The pages of my desk: a console of my own, built from `@skillcdn/console` and served from this machine by `console serve`, with the token my `console` command holds, which the pages never see. It is the organization's console with the pages I add to it. There is one, mine, and it is empty until I say what I want to see: an agent working in this desk builds it from what I ask. Of the desk the pages read `../records` and nothing else.

- **Build it:** `npm install`, then `npm run build`, which says nothing of its own where it went well and leaves the pages in `dist/`.
- **Serve it:** `npm run serve`, which is `console serve dist --records ../records`, then open `http://127.0.0.1:11197/`. Ctrl+C stops it.
- **Change it:** `src/page.tsx` is my page, and its comments say what a page is given, what it may read and what it is built from (`node_modules/@skillcdn/console/README.md`, "Pages of your own"); `src/main.tsx` lists the pages, and a page more is a file beside it and an entry more. `npm run dev` beside `console serve --records ../records` shows a change as it is made.
- **Keep it current:** `@skillcdn/console` here is at the version of the `console` command that wrote these files; raise the two together.
