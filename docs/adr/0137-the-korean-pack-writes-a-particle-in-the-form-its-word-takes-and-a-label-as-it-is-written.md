# ADR-0137: The Korean pack writes a particle in the form its word takes, and a label as it is written

- Status: Accepted
- Date: 2026-11-17
- Adds to [ADR-0012](0012-the-pages-speak-the-persons-language-from-packs-that-ship-with-the-package.md) (the pages speak the person's language from packs): how the Korean pack writes a sentence that carries a word it does not know beforehand.

## Context

Three Korean particles take one of two forms by the sound the word before them ends in: the one that marks what is acted on, the one that marks who acts, and the one that marks what a thing becomes or goes through. A sentence of the pack that carries a name, a title or a field wrote both forms, the second in brackets, since it could not know the word; a sentence that moves a task from one state to another did so twice. Sixty-six sentences did, most of them the feed's, so the history of one task showed the two forms twenty-five times; a few carried a word the pack itself supplies, whose form was known all along. The two forms also broke across the end of a line.

A small label, a field's name or a fact's, is set in capitals. Korean has none, so in a Korean label the capitals touched only the Latin words in it: "GITHUB" in a label, beside "GitHub" in the sentence under it.

And the pack called a task by two words, the loan word in nine places and the Korean one in eighty.

## Decision

1. **A sentence writes the form its word takes.** `i18n/particles.ts` says how a word ends when it is read aloud and gives the word with its particle: `asObject`, `asSubject`, `asWay`. A syllable of Hangul says how it ends; a digit is read by its name; what closes a word without being read, a quote or a bracket, is read past.
2. **A Latin word is read as Korean reads a loan word**, by its last letters: `l` as the liquid, after which the third particle keeps its short form; `m`, `n` and `ng` as a consonant; a short vowel before `b`, `k`, `p` or `t`, and `ck`, as a consonant; anything else as a vowel. This is a guess, right for the common endings and wrong for some words, and a wrong form after a name reads better than both forms after every name.
3. **A small label is cased by `--sc-label-case`**: `uppercase`, and `none` on a page in Korean, where the tracking is already off.
4. **A task is called by the Korean word** in every sentence of the pack.

## Consequences

- The Korean pack imports a module of its own language's grammar, the first of the kind. A pack of another language with forms that follow the word does the same beside it.
- A name the guess reads wrong gets the other form: one that ends in a letter that is not sounded, for instance. The helper is where that is mended, by its tests.
- A part that sets its own label in capitals reads the token, so a new part is right in Korean without knowing of it.
- Rejected: sentences rewritten to need no particle (possible for some, as a noun phrase in place of a sentence, and stiff as a feed read line after line); both forms kept (what this decision ends); asking a language library for the reading of a Latin word (a dependency for a guess that would still be a guess).
