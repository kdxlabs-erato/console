import { describe, expect, it } from "vitest";
import { asObject, asSubject, asWay } from "./particles.js";

describe("the Korean particles of two forms", () => {
  it("follows the last syllable of a Korean word", () => {
    expect(asObject("작업자")).toBe("작업자를");
    expect(asObject("이름")).toBe("이름을");
    expect(asSubject("메신저")).toBe("메신저가");
    expect(asSubject("인사")).toBe("인사가");
    expect(asSubject("결정")).toBe("결정이");
    expect(asWay("진행 중")).toBe("진행 중으로");
    expect(asWay("완료")).toBe("완료로");
    expect(asWay("준비됨")).toBe("준비됨으로");
  });

  it("writes 로 after ㄹ", () => {
    expect(asWay("서울")).toBe("서울로");
    expect(asObject("서울")).toBe("서울을");
  });

  it("reads past what closes the word", () => {
    expect(asObject('"로고를 남길까"')).toBe('"로고를 남길까"를');
    expect(asSubject('"새 노트북"')).toBe('"새 노트북"이');
    expect(asObject("목표 (1분기)")).toBe("목표 (1분기)를");
    // A decision's question ends with its mark, and is said by the word before it.
    expect(asObject('"이 안으로 승인?"')).toBe('"이 안으로 승인?"을');
    expect(asObject("로고를 남길까요?")).toBe("로고를 남길까요?를");
    expect(asSubject("출시!")).toBe("출시!가");
    expect(asSubject("마감？")).toBe("마감？이");
  });

  it("reads a digit by its name", () => {
    expect(asObject("#3")).toBe("#3을");
    expect(asObject("#2")).toBe("#2를");
    expect(asWay("v1")).toBe("v1로");
    expect(asWay("0.5.6")).toBe("0.5.6으로");
  });

  it("reads a Latin word as a loan word is read", () => {
    expect(asObject("Carol")).toBe("Carol을");
    expect(asObject("acme-mira")).toBe("acme-mira를");
    expect(asObject("bob")).toBe("bob을");
    expect(asSubject("Slack")).toBe("Slack이");
    expect(asObject("Website relaunch")).toBe("Website relaunch를");
    expect(asWay("high")).toBe("high로");
    expect(asWay("medium")).toBe("medium으로");
    expect(asWay("admin")).toBe("admin으로");
    expect(asWay("sonnet")).toBe("sonnet으로");
  });

  it("takes an empty word as ending in a vowel", () => {
    expect(asObject("")).toBe("를");
  });
});
