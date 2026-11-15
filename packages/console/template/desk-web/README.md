# __TITLE__: the pages

The pages of my desk: a console of my own, built from `@skillcdn/console` and served from this machine by `console serve`, with the token my `console` command holds, which the pages never see. It is the organization's console with one page more, the desk: the records I keep under `../records`, what I made and what became of it, with my work on the board beside them. Of the desk the pages read `../records` and nothing else.

- **Build it:** `npm install`, then `npm run build`.
- **Serve it:** `npm run serve`, which is `console serve dist --records ../records`, then open `http://127.0.0.1:11197/`. Ctrl+C stops it.
- **Change it:** `src/main.tsx` is the whole of it, and a page of my own is one more entry of `pages` (`node_modules/@skillcdn/console/README.md`, "Pages of your own"). `npm run dev` beside `console serve --records ../records` shows a change as it is made.
- **Keep it current:** `@skillcdn/console` here is at the version of the `console` command that wrote these files; raise the two together.
