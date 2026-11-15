import { createConsole, customPageHref } from "@skillcdn/console";
// The styles ship with the package; the build bundles them next to the script.
import "@skillcdn/console/console.css";
// The Korean face of the console's pages, in the subsets a browser fetches as it needs them;
// the package's stylesheet names it first and falls through to the system's faces.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { page } from "./page.js";

// The pages of this desk: a console of my own, built from the package and served from this
// machine by `console serve`. It is the organization's console with the pages I add to it:
// `pages` below lists them, each written in a file beside this one, and a page more is a file
// more and an entry more. page.tsx is the first, and says what a page is given, what it may
// read and what it is built from.

const container = document.getElementById("root");
if (container === null) {
  throw new Error("the page has no #root element");
}
// My page is what this console opens on: the address without a path is the page's.
if (window.location.pathname === "/") {
  window.history.replaceState(null, "", customPageHref(page.key));
}
// What the page is called until the server names the board: the title index.html gives it.
createConsole({ title: document.title, pages: [page] }).mount(container);
