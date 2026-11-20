import {
  createElement,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useWords } from "../i18n/index.js";
import {
  findIcons,
  GLYPHS,
  type GlyphShape,
  ICON_GRID,
  ICON_GROUP_LIST,
  type IconName,
  type IconSection,
  iconPlace,
  iconStep,
  isIconName,
} from "../icons/index.js";
import { opensAbove } from "./picker.js";
import { cx } from "./ui.js";

// A glyph of the icon pack by its name (ADR-0142), and the way to choose one. A glyph is drawn
// from the pack's data as elements, in the colour of the text it stands in, and never from
// markup: a name that is none of the pack's draws an empty box of the same size. The picker
// offers the pack by its groups and finds a glyph by words in the reader's language.

export type IconSize = "xs" | "sm" | "md" | "lg";

export interface IconProps {
  readonly name: IconName;
  /** `xs` a caret beside a word, `sm` in a line of text, `md` where it stands by itself (the default), `lg` in an empty state or on a card. */
  readonly size?: IconSize | undefined;
  /** What the glyph says, where it stands for words; left out, it is an ornament beside words and hidden from a screen reader. */
  readonly label?: string | undefined;
  readonly className?: string | undefined;
}

/** The side a glyph is drawn at where no stylesheet says: a line of text's. */
const PLAIN_SIDE = 20;

export function Icon(props: IconProps) {
  const shapes: readonly GlyphShape[] = isIconName(props.name) ? GLYPHS[props.name] : [];
  // The measures and the stroke stand on the element too, so that a page without the console's
  // stylesheet, a prototype's, draws the glyph as the pack means it.
  const drawn = {
    className: cx("sc-icon", `sc-icon-${props.size ?? "md"}`, props.className),
    viewBox: `0 0 ${ICON_GRID} ${ICON_GRID}`,
    width: PLAIN_SIDE,
    height: PLAIN_SIDE,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    focusable: "false",
  } as const;
  // A glyph's shapes are fixed, in a fixed order: each is told apart by its place.
  const lines = shapes.map(([tag, measures], index) =>
    createElement(tag, { key: index, ...measures }),
  );
  return props.label !== undefined && props.label.length > 0 ? (
    <svg {...drawn} role="img" aria-label={props.label}>
      {lines}
    </svg>
  ) : (
    <svg {...drawn} aria-hidden="true">
      {lines}
    </svg>
  );
}

export interface IconPickerProps {
  /** The glyph chosen, or `null` for none. */
  readonly value: IconName | null;
  readonly onChange: (value: IconName | null) => void;
  /** The field's name, for the button and the list. */
  readonly label: string;
  /** What choosing none means, in the field and as the first choice; the pack's word for none when left out. */
  readonly none?: string | undefined;
  /** The button's id, where a label points at it. */
  readonly id?: string | undefined;
  readonly disabled?: boolean | undefined;
}

/** How many tiles stand on a row of a grid as the browser laid it out; one where it cannot be read. */
function columnsOf(grid: Element | null): number {
  if (grid === null || typeof getComputedStyle === "undefined") {
    return 1;
  }
  const tracks = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
  return Math.max(1, tracks);
}

/**
 * Choosing a glyph of the pack, or none: a field that shows the choice and opens the pack under
 * it, with a box to find a glyph by words, the choice of none first, and the glyphs in their
 * groups. The words typed keep the focus; the arrows move over the glyphs, Enter chooses,
 * Escape closes, and the focus is back on the field afterwards.
 */
export function IconPicker(props: IconPickerProps) {
  const all = useWords();
  const words = all.icons;
  const groupWords: Readonly<Record<string, string>> = words.groups;
  const none = props.none ?? words.none;
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [above, setAbove] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const searching = query.trim().length > 0;
  /** What is offered, section by section: none first while nothing is searched, then the groups, or what the words found. */
  const sections: readonly {
    readonly key: string;
    readonly heading: string | undefined;
    readonly icons: readonly (IconName | null)[];
  }[] = searching
    ? [{ key: "found", heading: undefined, icons: findIcons(query, words.words) }]
    : [
        { key: "none", heading: undefined, icons: [null] },
        ...ICON_GROUP_LIST.map((group) => ({
          key: group.key,
          heading: Object.hasOwn(groupWords, group.key)
            ? (groupWords[group.key] ?? group.key)
            : group.key,
          icons: group.icons,
        })),
      ];
  const choices = sections.flatMap((section) => section.icons);

  /** Opens the pack with the choice in hand, so that it is in sight and the keys go on from it. */
  const show = () => {
    setActive(iconPlace(props.value));
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery("");
    setActive(-1);
    if (refocus) {
      trigger.current?.focus();
    }
  };
  const choose = (choice: IconName | null) => {
    props.onChange(choice);
    close(true);
  };

  // Opened, the words are typed at once; the pack opens above the field only where the window
  // has no room below it and more above, measured before anything is painted.
  useLayoutEffect(() => {
    if (!open || trigger.current === null || panel.current === null) {
      return;
    }
    setAbove(
      opensAbove(
        trigger.current.getBoundingClientRect(),
        panel.current.offsetHeight,
        window.innerHeight,
      ),
    );
    field.current?.focus();
  }, [open]);

  // The choice in hand is kept in sight as the keys move it.
  useEffect(() => {
    if (open && active >= 0) {
      document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [open, active, listId]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Enter") {
      // A choice, or nothing: the form around the field is never sent by this key.
      event.preventDefault();
      const chosen = active >= 0 ? choices[active] : searching ? choices[0] : undefined;
      if (chosen !== undefined) {
        choose(chosen);
      }
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    // Left and right move the caret in the words until a glyph is in hand; Home and End too.
    const moves =
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      (active >= 0 &&
        (event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.key === "Home" ||
          event.key === "End"));
    if (!moves) {
      return;
    }
    event.preventDefault();
    // Every grid of the pack is as wide as the next, so the first says how many stand on a row.
    const columns = columnsOf(panel.current?.querySelector(".sc-icon-grid") ?? null);
    const laid: IconSection[] = sections.map((section) => ({
      size: section.icons.length,
      columns: section.key === "none" ? 1 : columns,
    }));
    const next = iconStep(laid, active, event.key);
    if (next !== undefined) {
      setActive(next);
    }
  };

  let place = 0;
  return (
    <div className="sc-icon-picker">
      <button
        type="button"
        ref={trigger}
        id={props.id}
        className="sc-input sc-icon-picker-field"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${props.label}: ${props.value ?? none}`}
        disabled={props.disabled}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            show();
          }
        }}
      >
        {props.value !== null && <Icon name={props.value} size="sm" />}
        <span className="sc-icon-picker-value">{props.value ?? none}</span>
        <Icon name="chevron-down" size="sm" className="sc-icon-picker-caret" />
      </button>
      {open && (
        // The pack under its field. A press anywhere in it keeps the focus on the words, so that
        // the bar it scrolls by and the room between its tiles close nothing.
        // biome-ignore lint/a11y/noStaticElementInteractions: the press is kept from taking the focus off the words, and does nothing else
        <div
          ref={panel}
          className={cx("sc-icon-picker-panel", above && "sc-icon-picker-panel-above")}
          onMouseDown={(event) => {
            if (event.target !== field.current) {
              event.preventDefault();
            }
          }}
        >
          <input
            ref={field}
            className="sc-input"
            type="text"
            role="combobox"
            aria-label={words.search}
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={words.search}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(-1);
            }}
            onBlur={() => close(false)}
            onKeyDown={onKeyDown}
          />
          <div className="sc-icon-picker-list" id={listId} role="listbox" aria-label={props.label}>
            {sections.map((section) => (
              // biome-ignore lint/a11y/useSemanticElements: a fieldset draws a frame and a legend of its own; a group of options is this
              <div
                key={section.key}
                className="sc-icon-picker-group"
                role="group"
                aria-label={section.heading}
              >
                {section.heading !== undefined && (
                  <p className="sc-eyebrow" aria-hidden="true">
                    {section.heading}
                  </p>
                )}
                <div className={section.key === "none" ? "sc-icon-picker-none" : "sc-icon-grid"}>
                  {section.icons.map((choice) => {
                    const at = place;
                    place += 1;
                    const chosen = choice === props.value;
                    return (
                      <div
                        key={choice ?? "none"}
                        id={`${listId}-${at}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={chosen}
                        aria-label={choice ?? none}
                        title={choice ?? undefined}
                        className={cx(
                          "sc-icon-tile",
                          choice === null && "sc-icon-tile-none",
                          at === active && "sc-icon-tile-active",
                          chosen && "sc-icon-tile-chosen",
                        )}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          choose(choice);
                        }}
                        onMouseEnter={() => setActive(at)}
                      >
                        {choice === null ? none : <Icon name={choice} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {choices.length === 0 && (
              <p className="sc-icon-picker-note sc-muted">{words.nothingFound}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
