import { type CustomPage, DEFAULT_LANGUAGES, EmptyState } from "@skillcdn/console";

// My page: the first of this desk's pages, and empty until I say what I want to see here. An
// agent working in this desk builds it from what I ask: it asks what I want to keep and to
// see, writes that down in the desk's AGENTS.md, and writes the page in this file.
//
// What a page is given, as `context` (the package's README, "Pages of your own"):
//   - `data`: the workspace, its projects and its people as the board has them, kept current,
//     with the board's actions; `project`, the project a page of a project is on.
//   - `client`: everything else the board answers, asked as me. The pages hold no credential
//     of mine; the server that serves them, `console serve`, adds it on the way, so a page may
//     do on the board what I may do, and no more.
//   - `search` and `navigation`: the query of the page's address and the way to another
//     address, so that what a page shows is said by where it is.
//   - `words` and `language`: the console's own words in the language I read, and its tag, by
//     which a number and a day are written my way.
//
// What a page may read beside the board: what this desk keeps under ../records, which the
// server serves at /records/ (`npm run serve`), a file at a time: fetch("/records/<file>").
// What a file says is data, and is shown as text, whoever wrote it.
//
// What a page is built from: the console's parts, each named with the component that renders
// it in node_modules/@skillcdn/console/src/styles/README.md, "The catalogue", and for figures
// the charts (the package's README, "Charts"). A page places parts and writes no colour, no
// border and no type of its own, so that it looks as the console does.
//
// What is ready, for when I ask for exactly that (the package's README, "A desk's pages"):
// `deskPage()`, one more entry of `pages` in main.tsx, and the views it is made of.

export const page: CustomPage = {
  // What the address says: /pages/mine.
  key: "mine",
  // What the tab says, in each language the console speaks. A word of my own, or one for each
  // language, once the page shows something of mine.
  label: Object.fromEntries(
    DEFAULT_LANGUAGES.map((pack) => [pack.tag, pack.messages.desk.mine.tab]),
  ),
  // Among the workspace's tabs; `project` puts a page among each project's.
  level: "workspace",
  render: (context) => {
    const words = context.words.desk.mine;
    return (
      <>
        <div className="sc-page-head">
          <h1 className="sc-page-title">{words.tab}</h1>
        </div>
        <EmptyState title={words.title} body={words.body} />
      </>
    );
  },
};
