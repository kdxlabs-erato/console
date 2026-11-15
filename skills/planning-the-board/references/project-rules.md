# An example of a project's rules

What an owner writes on a project's Settings page, or an agent writes with `console rules write --file <path>` when a person asked for exactly that: what differs in this project from the workspace's rules, and nothing else. Five things at most, a section only where the project has something to say: where its work lives, the skills to load first, its pages' folders, who decides what, and its language where it is another, which is the language of what people read on its board and never of a repository's own documents. An invented organization, Acme, whose project holds two repositories. What is long goes on a page the rules link to, and nothing secret goes in, since every agent reads them.

~~~markdown
# Rules of this project

Adds to the workspace's rules, for the agents at work here: what differs in this project, and nothing else.

## Where the work lives

- The repository acme/web: the web app.
- The repository acme/site: the public site, built from `content/`.
- The design file, linked from the page `guides/design`: read only.

## Skills to load first

- `engineering/skills/working-in-web/SKILL.md`, for any task in acme/web.
- `marketing/skills/release-notes/SKILL.md`, for a task in the category marketing.

## The pages

- `specs/`: what is being built, written by people. Agents read them and ask; never edit.
- `guides/local-setup` is read first, every time.

## Who decides what

- A new dependency, a change to the schema, a change to a design: `kim`, as a decision.

## Language on the board

- Korean, for what people read on this project's board: reports, tasks, pages. A repository's own documents follow the repository.
~~~

What the example leaves out, since the workspace's rules or the repository say it: how a change is committed and pushed, which is each repository's own agreement; what is decided alone and what is asked; how to report. A project whose work lives in one repository, read in the workspace's language, with no skill to load first, may need the first section alone.
