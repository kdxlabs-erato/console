import { describe, expect, it } from "vitest";
import { languagesFirst } from "../vocabulary.js";
import { en } from "./en.js";
import { chooseLanguage, DEFAULT_LANGUAGES, ENGLISH, KOREAN, packFor } from "./index.js";
import { ko } from "./ko.js";

/** Every key of a pack, dotted, with what kind of thing is at it. */
function shapeOf(value: unknown, prefix = ""): string[] {
  if (typeof value === "function") {
    return [`${prefix}:function/${value.length}`];
  }
  if (typeof value === "string") {
    return [`${prefix}:string`];
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .flatMap(([key, inner]) => shapeOf(inner, prefix === "" ? key : `${prefix}.${key}`))
      .sort();
  }
  return [`${prefix}:${typeof value}`];
}

describe("the language packs", () => {
  it("carry the same keys, with the same kinds of words at each", () => {
    const { tag: enTag, label: enLabel, ...english } = en;
    const { tag: koTag, label: koLabel, ...korean } = ko;
    expect(shapeOf(korean)).toEqual(shapeOf(english));
    expect([enTag, koTag]).toEqual(["en", "ko"]);
    expect([enLabel, koLabel]).toEqual(["English", "한국어"]);
    expect(DEFAULT_LANGUAGES.map((pack) => pack.tag)).toEqual(["en", "ko"]);
  });

  it("are chosen by the person, else by the browser, else English", () => {
    expect(chooseLanguage("ko", ["en-US"])).toBe(KOREAN);
    expect(chooseLanguage(null, ["fr-FR", "ko-KR", "en"])).toBe(KOREAN);
    expect(chooseLanguage(null, ["fr-FR"])).toBe(ENGLISH);
    expect(chooseLanguage("xx", [])).toBe(ENGLISH);
    expect(chooseLanguage(undefined, [], [KOREAN, ENGLISH])).toBe(KOREAN);
    // The workspace's language (ADR-0081): after the person's and the browser's, before English.
    expect(chooseLanguage(null, ["fr-FR"], DEFAULT_LANGUAGES, "ko")).toBe(KOREAN);
    expect(chooseLanguage(null, ["en-US"], DEFAULT_LANGUAGES, "ko")).toBe(ENGLISH);
    expect(chooseLanguage("en", ["fr-FR"], DEFAULT_LANGUAGES, "ko")).toBe(ENGLISH);
    expect(chooseLanguage(null, [], DEFAULT_LANGUAGES, "de")).toBe(ENGLISH);
    expect(chooseLanguage(null, [], DEFAULT_LANGUAGES, null)).toBe(ENGLISH);
    // What a plugin reads as the workspace's languages: the set one first.
    expect(languagesFirst("ko")).toEqual(["ko", "en"]);
    expect(languagesFirst("en")).toEqual(["en", "ko"]);
    expect(packFor("KO-kr", DEFAULT_LANGUAGES)).toBe(KOREAN);
    expect(packFor("", DEFAULT_LANGUAGES)).toBeUndefined();
    expect(packFor("de", DEFAULT_LANGUAGES)).toBeUndefined();
  });

  it("say the same thing in each language, with the parts in their own order", () => {
    expect(en.feed.event.memberAdded("alice", "web", "an owner")).toBe(
      "added alice to web as an owner",
    );
    expect(ko.feed.event.memberAdded("alice", "web", "소유자")).toBe(
      "alice를 web에 소유자로 추가했습니다",
    );
    expect(en.board.decisions(2)).toBe("2 decisions");
    expect(ko.board.decisions(2)).toBe("결정 2건");
  });

  it("writes the Korean word for a task with the particle its last syllable takes", () => {
    // The word for a task changed from one that ends in a vowel to one that ends in a
    // consonant (ADR-0137), and a sentence written out, not built from its parts, kept the
    // particle of the word before: 작업를, 작업가. No sentence of the pack reads so.
    const sentences = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : typeof value === "object" && value !== null
          ? Object.values(value).flatMap(sentences)
          : [];
    const wrong = /작업(를|가|는|와|로)(?![가-힣])/u;
    expect(sentences(ko).filter((sentence) => wrong.test(sentence))).toEqual([]);
    expect(sentences(ko).some((sentence) => sentence.includes("작업을 만들고"))).toBe(true);
    expect(sentences(ko).some((sentence) => sentence.includes("작업이 없습니다"))).toBe(true);
  });
});
