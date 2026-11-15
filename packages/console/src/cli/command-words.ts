import { hasForbiddenCodePoint } from "../text.js";

// The lines the commands print for a person or an agent to run, a path of a pack or a folder
// among their words: spelled so that bash and PowerShell both run them as they are, since an
// agent runs what it is told in whichever of the two it has.

/** A word bash and PowerShell both take as it is: no character either reads as more than a letter, and no `@` first, which PowerShell reads as a variable spread. */
const PLAIN_WORD = /^[\w./+:=-][\w./@+:=-]*$/;
/** A single quote, as PowerShell reads one: its curly forms close a quoted word too. */
const SINGLE_QUOTE = /['\u2018-\u201b]/;
/** What either shell reads inside double quotes: `$`, a backtick, a double quote of any form, a backslash, `!`. */
const READ_IN_DOUBLE_QUOTES = /[$`"\u201c-\u201e\\!]/;

/**
 * A word of a line printed for a person or an agent to run, spelled so that bash and PowerShell
 * both take it whole as it is, expanding nothing in it: as it is where it is plain, else in
 * single quotes, inside which neither reads anything. A single quote has no spelling inside
 * those that both take (bash ends the word there; PowerShell doubles it, which bash reads as two
 * words joined into one), so a word that holds one is in double quotes, inside which neither
 * reads anything of a word without `$`, a backtick, a double quote, a backslash or `!`. Nothing
 * for a word that holds a single quote and one of those, which no one spelling keeps whole in
 * both, nor for one with a character that does not show or makes it look like another.
 */
export function commandWord(word: string): string | undefined {
  if (word.length === 0 || hasForbiddenCodePoint(word)) {
    return undefined;
  }
  if (PLAIN_WORD.test(word)) {
    return word;
  }
  if (!SINGLE_QUOTE.test(word)) {
    return `'${word}'`;
  }
  return READ_IN_DOUBLE_QUOTES.test(word) ? undefined : `"${word}"`;
}

/**
 * Words as one line printed for a person or an agent to run, after `command`, the command's own
 * words, each spelled as `commandWord` spells it; nothing where one of them has no spelling that
 * bash and PowerShell both take whole.
 */
export function commandLine(command: string, words: readonly string[]): string | undefined {
  const spelled: string[] = [];
  for (const word of words) {
    const one = commandWord(word);
    if (one === undefined) {
      return undefined;
    }
    spelled.push(one);
  }
  return [command, ...spelled].join(" ");
}

/** Why a line is not printed for a person or an agent to run, said in its place. */
export const NO_LINE_TO_RUN =
  "No line is printed to run: a word of it holds a single quote with a $, a backtick, a double quote, a backslash or a !, or a character that does not show, and no one spelling keeps such a word whole in both bash and PowerShell.";
