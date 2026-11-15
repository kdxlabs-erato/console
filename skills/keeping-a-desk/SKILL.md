---
name: keeping-a-desk
description: "Shapes a member's desk, their own repository, to what they ask to keep there and to see: what is kept goes under records/ in a shape chosen for it, what is shown is a page of their own under web/, built from the console's package and served from their machine, and the desk's AGENTS.md says both in a line each. Use when a person says 'keep what I make here', 'record this on my desk', 'I want to see that on my desk', 'add a page for it', 'what can I do with my desk?', and after console desk, whose last line names this skill. The repository itself, its remote and its first push are set up by a skill of the organization's pack; a page of the organization's console is building-a-console; a task of the board is working-the-board. Nothing is spent, and nothing leaves the desk but its own push."
license: MIT
compatibility: A shell with git and the console command (npm install -g @skillcdn/console, Node.js 24 or newer), and an agent that reads and writes files. For pages, npm; a browser the agent can drive is optional. The agent never sees a token.
metadata:
  author: skillcdn
  version: "1.1"
skillcdn:
  translations:
    ko:
      title: 데스크 가꾸기
      description: "구성원 자신의 레포인 데스크를, 거기에 남기고 싶은 것과 보고 싶은 것에 맞춰 만듭니다. 남길 것은 그에 맞는 모양으로 records/ 아래에 두고, 볼 것은 콘솔 패키지로 만들어 내 PC에서 띄우는 나만의 페이지로 web/ 아래에 두며, 데스크의 AGENTS.md가 그 둘을 한 줄씩 말합니다. '내가 만든 걸 여기에 남겨 줘', '이거 데스크에 기록해 줘', '그걸 데스크에서 보고 싶어', '페이지 하나 추가해 줘', '데스크로 뭘 할 수 있어?'라고 하거나, console desk의 마지막 줄이 이 스킬을 가리킬 때 쓰세요. 레포와 원격, 첫 푸시는 조직 팩의 스킬이 하고, 조직 콘솔의 페이지는 building-a-console, 보드의 작업은 working-the-board입니다. 비용은 들지 않고, 데스크 밖으로 나가는 것은 데스크 자신의 푸시뿐입니다."
---
# Keeping a desk

A desk is a member's own repository, a person's or an agent account's, at their own git account, private and wholly theirs. It is given its least, its instructions and a structure ([ADR-0122](/docs/adr/0122-a-desk-is-given-its-least-and-grown-by-what-its-member-asks.md)): what it keeps and what it shows is whatever its member asks for. What the member says goes in; the desk shaped to it comes out, with a line in its `AGENTS.md` for each thing it now keeps or shows, checked, committed and pushed. Nothing is made that was not asked for: no kind of record, no page, no folder.

## The structure

Every desk is these four, and nothing of the last three is there until it is used:

| Place | What it is | Who writes it |
|---|---|---|
| `AGENTS.md` | The instructions of whichever agent works in the desk; under "This desk", what the desk keeps and shows, a line each, in the member's words | `console desk` first, then the member and their agent |
| `records/` | What the member keeps: plain files in the shape that fits the thing, JSON an agent writes and the files themselves | The agent, as the member asks |
| `web/` | The member's pages: a console of their own, built from `@skillcdn/console` and served from their machine | `console desk . --web` writes its shell, one empty page, for a person and an agent account alike |
| `work/` | Checkouts of projects' repositories, each under its own agreement; the desk ignores it | `git clone` |

A session begun in a desk works from `AGENTS.md` and what it points to. This skill is read when something is to be kept or shown that the desk does not keep or show yet, and not for one more entry in a shape the desk already has.

## How the person is involved

- **Questions:** one message, for what the request leaves open: "What do you want to keep here, and what do you want to see of it?" Of a thing to keep: what they want to find again of each one, and what becomes of one afterwards, if anything. Of a thing to see: what a glance at the page should tell them. A member who does not know yet is told the structure in three lines, and nothing is made.
- **Checkpoints:** the plan, before a file is written: what is kept, where, with one entry as it will be written; what the page shows, from its top down; the line `AGENTS.md` gains. One short message; "OK", in their language, continues. Then the page, at its address with the server left up, for them to look at: "is this what you wanted to see?". The agent's own look does not stand in for theirs.
- **Go-ahead:** told to go ahead alone, the plan is reported instead of approved; the checks of phase 6 are never skipped.
- **Changes mid-run:** a shape that changes after things are kept carries them over in the same change, and its line in `AGENTS.md` is written again; a page is changed where it stands, never begun again beside.
- **An agent account** shapes its own desk: nobody is at its terminal, so it chooses the shape from what its work makes, says it in its `AGENTS.md`, and asks its manager, as a decision, only what is the manager's to choose.
- **Language:** what the member reads, the questions, the plan, a page's words, a title or a label in a record, is in the language `AGENTS.md` names, and so may be the line `AGENTS.md` gains and a folder's `README.md`; a key and a file's name stay in English.

## Requirements

| Need | How | When missing |
|---|---|---|
| The desk is a repository, with a private remote | `git status` and `git remote -v` in the desk | It is set up first, by the skill for that in the organization's pack: `console skills --search "desk setup" --limit 5`. Where the pack has none: `git init`, a private repository at the member's own git account, the first push, each on their word |
| For pages: Node.js 24 or newer with npm, and the `console` command signed in | `node --version`; `console whoami` says as whom | Say so, and keep what is to be kept: records need neither. Never look for a token |

## Workflow

Each phase ends with one line to the member; only phase 2 and the member's look at the page in phase 4 stop for them.

### Phase 1: Read the desk

`AGENTS.md`, "This desk": what the desk keeps and shows now. Then `records/` and `web/` as they are. What is there is kept: a shape is added to, a page is added to, and neither is begun again beside the one that exists.

### Phase 2: Ask, and plan

Ask what the request leaves open, then show the plan of "How the person is involved". Plan the least that gives the member what they said: one kind kept in one folder, one page for what they asked to see. A wish to keep something is no wish to see it, and a page is planned only where they asked for one.

### Phase 3: Keep

Choose the shape from what the member wants to find again, not from a form:

- **One folder under `records/` for one kind of thing**, named by a key: lowercase letters, digits and hyphens.
- **JSON an agent writes with its file tools.** A list of entries, an object each: an `id` that never changes, what the member wants to find again as fields, a day written `2026-11-15`, an address that begins with `https://`, a path to each file of its own. Nothing is generated, and git shows what changed.
- **The shape, said once,** in a `README.md` of that folder: each field, what is needed, one entry as an example. The next session writes the same from it, so it is written before the first entry.
- **The files themselves** go in a `files/` folder there, of any kind and size, by names with no part that begins with a full stop; a kind that is large is tracked with git LFS before the first is added (`git lfs track`).
- **Text is text.** What a person wrote is kept and shown as text, never as HTML.
- **A set of things made, with where each was used and how it did by day,** is a shape the package already has, with a check and a ready page: [collections.md](collections.md). Take it where the member asks for exactly that, and only then.

### Phase 4: Show

Only where the member asked to see something. Paths below are under the desk's `web/`, and `<package>/` is `node_modules/@skillcdn/console/` there, whose `README.md` is [the package's](/packages/console/README.md).

1. **The shell.** `console desk . --web`, run in the desk, writes `web/` where it holds nothing: one empty page of the member's own, on the version of the package the command is. `src/main.tsx` mounts `page` from `src/page.tsx` beside it; the page's key is `mine`, its address `/pages/mine`, and `/` opens on it. Then `npm install` and `npm run build`, which says nothing of its own where it went well and leaves `dist/index.html`; `README.md` says how the pages are built, served and stopped.
2. **A page** is one entry of the `pages` handed to `createConsole` in `src/main.tsx`: a key, which is its address (`/pages/<key>`), a label, which is its tab, and a function that renders it. What the member asks to see first goes on the empty page; another page is another entry. What the function is given: `<package>/README.md`, "Pages of your own"; what the readers of a collection answer and what the small parts take: the same file, "A desk's pages". Those two sections are read before the page is written, and the package's types are not dug through.
3. **What a page reads.** The desk's own files, with `fetch` at `/records/<path>`, each read when it is asked for; and the board, as the member, through the client the page is given. Nothing of another origin, and no token. `console serve dist --records ../records` serves both: JSON, pictures, video, sound and PDF are shown in place, anything else is a download ([records.md](/docs/specs/records.md#serving)).
4. **What a page is built from:** the console's parts, each named with the component that renders it in `<package>/src/styles/README.md`, "The catalogue" ([in the repository](/packages/console/src/styles/README.md)). A page places parts and writes no colour, border or type of its own, so that it looks as the console does. For figures there are the charts, each exported from `@skillcdn/console`, with their props in `<package>/README.md`, "Charts":
   - `Stat`, and `Stats` for a row of them: a figure with its label and, where given, its change and a sparkline.
   - `BarList`: a ranking or a comparison, each a label, a bar and a value.
   - `Chart`: columns or lines over time (`kind: "columns" | "line"`), one to a few series.
   - `Sparkline`: one figure over time, as a small line.
   - `ShareBar`: the parts of a whole in one bar, with its legend.
   - `Legend`: the series by their colours.
   - `FigureTable`: rows by columns, the numbers aligned.
5. **What is ready,** for a member who wants exactly that, in `<package>/README.md`, "A desk's pages". Each shows the collections of [collections.md](collections.md) or the member's own work on the board:
   - `deskPage()`: all of the below as one page, one more entry of `pages`, at `/pages/desk` (`DESK_PAGE_KEY`).
   - `DeskRecords`: the collections, read from `/records/` and shown whole, composed of the next four.
   - `DeskCollections`: the collections, each with its items counted by status.
   - `DeskCollectionView`: a collection's items, narrowed by status.
   - `DeskItemView`: an item with its preview, its files, where it was used and how it did by day.
   - `DeskCollectionResults`: each metric in all and by week, the ratios, and the items that did best.
   - `DeskStanding`: the decisions that wait, the open runs and the open tasks.
   - `DeskFiguresView`: what was done by week and how the runs ended, by project and by category.
   - `DeskArchive`: the closed tasks and the ended runs, found by words.
   - `readDeskRecords`: reads the collections for a page of one's own, every file bounded and parsed.
6. **Build, serve, show.** `npm run build`, which went well where it ended in 0 and `dist/index.html` is there, not by what it printed; then `npm run serve` and `http://127.0.0.1:11197/`: the page answers, and `/api/v1/me` there names the member. The page is checked with what the desk keeps, an empty state where it keeps nothing yet: no sample is made to fill it. Then the member is given the address, with the server left up, and asked whether it is what they wanted to see; the run stops there for them. The server is the agent's own to stop, by ending the process it started, once they have looked or said to: say that it was stopped, and how the pages are started again.

Where a page shows what someone else wrote, the hard rules of [building-a-console](/skills/building-a-console/SKILL.md) hold for it.

### Phase 5: Write it down

`AGENTS.md`, "This desk": one line for each thing the desk now keeps or shows, in the member's words. For what is kept: what, in which folder, and when a new entry is written. For a page: what it shows, and how it is opened. A later session records and shows from that line and the folder's `README.md` alone.

### Phase 6: Check, commit and push

- Every JSON file written is read back, and parses.
- Collections: `console desk check`, which says each problem with its file and signs in nowhere.
- Pages: `npm run build` ends in 0 and `web/dist/index.html` is there, written by it.
- Nothing secret is staged: `git status`, read in a step of its own before the commit. `web/node_modules` and `web/dist` are ignored, by a line added to the desk's `.gitignore` where it has none for them; the lockfile of `web/` is committed.
- Commit and push, without asking: the desk is the member's own, and its `AGENTS.md` says so.

Then tell the member, in one message: what is kept and where, with one entry; the page's address, and how it is started and stopped; what was left out.

## Verdicts

| Result | Verdict |
|---|---|
| What the member asked to keep is under `records/` in a shape its `README.md` says; what they asked to see is on a page that builds and shows it; `AGENTS.md` has its line for each; the checks of phase 6 passed; pushed | Done |
| A page could not be looked at with no browser, or `npm` is not there | Done, with what was not seen named |
| Something was made that the member did not ask for: a kind of record, a page, a folder | Taken out again, and said so |
| A secret in a file, a record or a commit | Stopped: the member is told, and it is rotated, not only deleted |

## What stays true of every desk

- **Private.** A desk's repository is private, at the member's own git account.
- **No secret,** in a file, a record or a commit: no token, key or password.
- **The pages never see the token.** `console serve` carries it, on the loopback alone, and no page is served anywhere else.
- **The board is the organization's.** What is done in a desk is its member's own, and is a task only where they put it on the board. Tying a record to a task, or reading the board from a page, is free: nothing asks for it and nothing forbids it. What an organization wants kept out of its members' desks, its rules say (`console rules`).
- **`/records/` is the files' address,** and no page lives under it.
- **Nothing is made unasked.** A desk says what it is for by what its member put there.
