import { type FormEvent, useState } from "react";
import { fillRules, MAX_RULES_LENGTH, type RestRules } from "../api.js";
import { useLanguage, useWords } from "../i18n/index.js";
import { Writer } from "./documents.js";
import { Markdown } from "./markdown.js";
import { Button, Callout, Time } from "./ui.js";

// The rules of the board (ADR-0023, ADR-0120), as the settings pages show them. At the
// workspace: the console's rules as they hold, read and never edited, and below them what the
// organization adds, with who wrote it and when, and the ways to change it for whoever may. At
// a project: what it adds, or that it adds none. Each takes its data as props and nothing from
// the network; the rules are Markdown rendered to elements, never HTML, with `{language}`
// filled with the language the pages speak, as the command fills it with the person's.

export interface RulesViewProps {
  readonly rules: RestRules;
  /** Whose rules: the workspace's, or a project's, which add to the workspace's. */
  readonly scope: "workspace" | "project";
  /** Where what is added is written; left out, the rules are read here and not changed. */
  readonly editHref?: string | undefined;
  /** Called to put what is added away; left out, it stays. */
  readonly onArchive?: (() => void) | undefined;
  readonly busy?: boolean | undefined;
  /** Where a page of the project is read, by its path, for the links a project's rules make. */
  readonly docHref?: ((path: string) => string) | undefined;
  /** Whether the text stays folded under where it comes from, on a page where it is not the point. */
  readonly folded?: boolean | undefined;
}

export function RulesView(props: RulesViewProps) {
  const words = useWords();
  const language = useLanguage().tag;
  const { rules, scope } = props;
  if (scope === "workspace" && rules.own !== undefined && props.folded !== true) {
    return <WorkspaceRules {...props} own={rules.own} />;
  }
  const page = rules.page;
  if (rules.source === "none" || rules.body === null) {
    return (
      <div>
        <p className="sc-muted">{words.rules.none}</p>
        {props.editHref !== undefined && (
          <div className="sc-rules-actions">
            <a className="sc-button sc-button-secondary" href={props.editHref}>
              {words.rules.write}
            </a>
          </div>
        )}
      </div>
    );
  }
  const text = <Markdown source={fillRules(rules.body, language)} docHref={props.docHref} />;
  // A project's own are changed here. The workspace's come this way folded, on a project's
  // page, or whole from a console of before, which says no parts: read, and changed elsewhere.
  const changed = scope === "project";
  return (
    <div>
      {rules.source === "reference" ? (
        <Callout tone="info">{words.rules.console}</Callout>
      ) : (
        page !== null && (
          <p className="sc-rules-facts">
            {words.docs.version(page.version)} · {words.docs.writtenBy}{" "}
            <Writer by={page.updatedBy} agent={page.agent} /> <Time iso={page.updatedAt} />
          </p>
        )
      )}
      {props.folded === true ? (
        <details className="sc-rules-fold">
          <summary>{words.rules.read}</summary>
          {text}
        </details>
      ) : (
        text
      )}
      {changed && (props.editHref !== undefined || props.onArchive !== undefined) && (
        <div className="sc-rules-actions">
          {props.editHref !== undefined && (
            <a className="sc-button sc-button-secondary" href={props.editHref}>
              {words.common.edit}
            </a>
          )}
          {props.onArchive !== undefined && (
            <Button variant="ghost" onClick={props.onArchive} disabled={props.busy === true}>
              {words.common.remove}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** The workspace's rules where they are kept: the console's as they hold, then what the organization adds. */
function WorkspaceRules(props: RulesViewProps & { readonly own: string }) {
  const words = useWords();
  const language = useLanguage().tag;
  const added = props.rules.added ?? null;
  return (
    <div>
      <Callout tone="info">{words.rules.console}</Callout>
      <Markdown source={fillRules(props.own, language)} docHref={props.docHref} />
      <div className="sc-rules-added">
        <h3 className="sc-section-title">{words.rules.added}</h3>
        {added === null ? (
          <p className="sc-muted">{words.rules.nothingAdded}</p>
        ) : (
          <>
            <p className="sc-rules-facts">
              {words.docs.version(added.page.version)} · {words.docs.writtenBy}{" "}
              <Writer by={added.page.updatedBy} agent={added.page.agent} />{" "}
              <Time iso={added.page.updatedAt} />
            </p>
            <Markdown source={fillRules(added.body, language)} docHref={props.docHref} />
          </>
        )}
      </div>
      {(props.editHref !== undefined || (added !== null && props.onArchive !== undefined)) && (
        <div className="sc-rules-actions">
          {props.editHref !== undefined && (
            <a className="sc-button sc-button-secondary" href={props.editHref}>
              {added === null ? words.rules.add : words.common.edit}
            </a>
          )}
          {added !== null && props.onArchive !== undefined && (
            <Button variant="ghost" onClick={props.onArchive} disabled={props.busy === true}>
              {words.common.remove}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export interface RulesFormProps {
  /** The rules as they hold now: what the form starts from where something is written. */
  readonly rules: RestRules;
  readonly scope: "workspace" | "project";
  /** What the form starts from where nothing is written yet: a project's headings; nothing at the workspace. */
  readonly template: string;
  readonly busy?: boolean | undefined;
  readonly error?: string | undefined;
  readonly onSubmit: (input: {
    readonly body: string;
    readonly baseVersion?: number | undefined;
  }) => void;
  readonly onCancel?: (() => void) | undefined;
}

/**
 * The form what is added to the rules is written on. At the workspace it holds what the
 * organization adds and nothing of the console's rules, which are read above it: empty until
 * something is added. At a project it starts from the project's page, or from the headings.
 * It saves nothing that would change nothing.
 */
export function RulesForm(props: RulesFormProps) {
  const words = useWords();
  const language = useLanguage().tag;
  const { rules, scope } = props;
  // A console of before says the whole and no parts, and takes the whole back.
  const parts = scope === "workspace" && rules.own !== undefined;
  /** What is written now: what the organization adds, or the page as it holds; nothing where nothing is. */
  const current = parts
    ? rules.added?.body
    : rules.source === "none"
      ? undefined
      : (rules.body ?? undefined);
  const page = parts ? (rules.added?.page ?? null) : rules.page;
  const [body, setBody] = useState(current ?? props.template);
  const unchanged = body.trim() === (current ?? "").trim();
  const ready = !unchanged && body.trim().length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) {
      return;
    }
    props.onSubmit({
      body,
      ...(page === null ? {} : { baseVersion: page.version }),
    });
  };

  return (
    <form className="sc-form" onSubmit={submit}>
      {parts && rules.own !== undefined && (
        <details className="sc-rules-fold">
          <summary>{words.rules.readConsole}</summary>
          <Markdown source={fillRules(rules.own, language)} />
        </details>
      )}
      <label className="sc-field">
        <span className="sc-field-label">
          {scope === "workspace" ? words.rules.added : words.rules.form.body}
        </span>
        <textarea
          className="sc-input sc-textarea sc-doc-editor"
          value={body}
          maxLength={MAX_RULES_LENGTH}
          rows={20}
          onChange={(event) => setBody(event.target.value)}
        />
        <span className="sc-muted">
          {scope === "workspace"
            ? words.rules.form.hintAdded(MAX_RULES_LENGTH)
            : words.rules.form.hint(MAX_RULES_LENGTH)}
        </span>
      </label>
      {props.error !== undefined && (
        <p className="sc-form-error" role="alert">
          {props.error}
        </p>
      )}
      <div className="sc-form-actions">
        <Button type="submit" variant="primary" disabled={props.busy === true || !ready}>
          {words.rules.form.save}
        </Button>
        {props.onCancel !== undefined && (
          <Button variant="ghost" onClick={props.onCancel}>
            {words.common.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}
