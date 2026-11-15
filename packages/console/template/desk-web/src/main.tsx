import { createConsole, customPageHref, DESK_PAGE_KEY, deskPage } from "@skillcdn/console";
// The styles ship with the package; the build bundles them next to the script.
import "@skillcdn/console/console.css";
// The Korean face of the console's pages, in the subsets a browser fetches as it needs them;
// the package's stylesheet names it first and falls through to the system's faces.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

// The dashboard of this desk: a console of my own, built from the package and served from this
// machine by `console serve`, with the token my `console` command holds, which the pages never
// see. It is the package's console with one page more, the desk: what stands now, the figures
// and the archive of my own work, read from the organization's console as I look and kept
// nowhere. A page of my own is one more entry of `pages`; the package's README says what each
// is given ("Pages of your own").

const container = document.getElementById("root");
if (container === null) {
  throw new Error("the page has no #root element");
}
// The desk is what this console opens on: the address without a path is the desk's page.
if (window.location.pathname === "/") {
  window.history.replaceState(null, "", customPageHref(DESK_PAGE_KEY));
}
// What the page is called until the server names the board: the title index.html gives it.
createConsole({ title: document.title, pages: [deskPage()] }).mount(container);
