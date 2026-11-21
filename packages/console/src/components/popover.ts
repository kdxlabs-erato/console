import { type RefObject, useEffect, useState } from "react";

// A list a button opens over the page, as a popover in the top layer: out of whatever around the
// button clips or stacks over what hangs out of it, a row of tabs that scrolls sideways or a tile
// of the front page, and dismissed by a click elsewhere or the escape key, as the browser does it.

/** How close to the window's edge a list may come. */
const PANEL_GUTTER_PX = 8;
/** How far below its button, or above it, off the line the button stands on, a list opens. */
const PANEL_DROP_PX = 6;
/** How far a list's edge stands before the names in it: its own padding and a link's. */
const PANEL_INSET_PX = 14;
/** The least a list is let be tall where the window is short: a few of its items, scrolled. */
const PANEL_SHORTEST_PX = 120;

/**
 * Whether the browser shows a popover. One that does not, as Safari before 17, has the list
 * shown and hidden by its button, without the browser's ways of closing it.
 */
export const POPOVERS =
  typeof HTMLElement === "undefined" || typeof HTMLElement.prototype.showPopover === "function";

/**
 * Puts a list by the button that opened it, the names in it lined up with the button's, within
 * the page's width, the scrollbar left out: the list is in the top layer, where nothing of the
 * page places it. It opens under the button, or over it where the window has no room below for
 * the whole of it and more above, as for a tile near the foot of the window; no taller than the
 * window has room for on its side, a longer list scrolling within itself.
 */
function place(button: HTMLElement | null, box: HTMLElement | null): void {
  if (button === null || box === null) {
    return;
  }
  const at = button.getBoundingClientRect();
  const { clientWidth, clientHeight } = document.documentElement;
  const room = clientWidth - box.offsetWidth - PANEL_GUTTER_PX;
  const below = clientHeight - at.bottom - PANEL_DROP_PX - PANEL_GUTTER_PX;
  const above = at.top - PANEL_DROP_PX - PANEL_GUTTER_PX;
  // Its whole height, however short it was held the last time it opened: its items, its padding
  // and its border.
  const whole = box.scrollHeight + box.offsetHeight - box.clientHeight;
  const over = whole > below && above > below;
  const tallest = Math.max(PANEL_SHORTEST_PX, over ? above : below);
  const top = over ? at.top - PANEL_DROP_PX - Math.min(whole, tallest) : at.bottom + PANEL_DROP_PX;
  box.style.left = `${Math.max(PANEL_GUTTER_PX, Math.min(at.left - PANEL_INSET_PX, room))}px`;
  box.style.top = `${Math.max(PANEL_GUTTER_PX, top)}px`;
  box.style.maxHeight = `${tallest}px`;
}

/** Closes a list: the browser's popover, or the list its button shows by hand where there is none. */
function hideList(box: HTMLElement | null, setOpen: (open: boolean) => void): void {
  if (!POPOVERS) {
    setOpen(false);
    return;
  }
  if (box?.matches(":popover-open") === true) {
    box.hidePopover();
  }
}

/** A list a button opens: whether it is open, and the ways to open and close it. */
export interface ListPopover {
  readonly open: boolean;
  readonly show: () => void;
  readonly hide: () => void;
  /** Opens it where it is closed, and closes it where it is open. */
  readonly toggle: () => void;
}

/**
 * The list `panel` (with `popover="auto"`, and `hidden` where there are no popovers) that the
 * button `anchor` opens (with `popoverTarget` naming it, so that a click on the button is not a
 * click outside that closes the list first). Placed under the button when it opens; closed when
 * the page scrolls under it or the window changes, which would leave it where the button no
 * longer is, and when the window loses the focus, as it does to a click in a plugin's frame,
 * which the page never sees.
 */
export function useListPopover(
  anchor: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
): ListPopover {
  const [open, setOpen] = useState(false);
  // Shown here rather than by the browser, and placed at once, before anything is painted: the
  // list has its width only once it shows, and a list placed before that, then again once the
  // browser said it opened, could stand out of the window in between.
  const show = () => {
    const box = panel.current;
    if (box === null) {
      return;
    }
    if (!POPOVERS) {
      setOpen(true);
      return;
    }
    if (!box.matches(":popover-open")) {
      box.showPopover();
      place(anchor.current, box);
    }
  };
  const hide = () => hideList(panel.current, setOpen);
  const toggle = () => {
    const shown = POPOVERS ? panel.current?.matches(":popover-open") === true : open;
    if (shown) {
      hide();
    } else {
      show();
    }
  };
  useEffect(() => {
    const box = panel.current;
    if (box === null) {
      return;
    }
    const onToggle = (event: Event) => {
      setOpen((event as ToggleEvent).newState === "open");
    };
    // Heard from the start rather than once the page knows it opened, which comes a moment after
    // it shows. A scroll within the list is the list's own.
    const close = (event: Event) => {
      const shown = POPOVERS ? box.matches(":popover-open") : !box.hidden;
      const within =
        event.type === "scroll" && event.target instanceof Node && box.contains(event.target);
      if (shown && !within) {
        hideList(box, setOpen);
      }
    };
    box.addEventListener("toggle", onToggle);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("blur", close);
    return () => {
      box.removeEventListener("toggle", onToggle);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("blur", close);
    };
  }, [panel]);
  useEffect(() => {
    // Shown by the button itself where the browser has no popover: placed now that it shows.
    if (open && !POPOVERS) {
      place(anchor.current, panel.current);
    }
  }, [open, anchor, panel]);
  return { open, show, hide, toggle };
}
