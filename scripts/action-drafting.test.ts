import { describe, expect, it } from "vitest";
import { actionStyle, canonicalActionNames, withActionPortcos } from "../src/lib/action-drafting";

describe("Action with V.I.C. drafting", () => {
  it("uses confirmed company spelling without replacing other companies", () => {
    expect(canonicalActionNames("aka and TAGNTRAC, not Akamai", ["Aka", "TagnTrac"])).toBe("Aka and TagnTrac, not Akamai");
  });
  it("appends approved company details exactly once across refinements", () => {
    const list = [{ name: "Aka", website: "https://aka.ai", summary: "Approved description." }];
    const once = withActionPortcos("Hello", list, ["Aka"]);
    expect(once.body).toBe("Hello\n\n• Aka (https://aka.ai) – Approved description.\n");
    expect(withActionPortcos(once.body, list, ["Aka"]).body).toBe(once.body);
  });
  it("does not invent descriptions for missing companies", () => {
    expect(withActionPortcos("Hello", [], ["Aka"])).toEqual({ body: "Hello", missing: ["Aka"] });
  });
  it("supports formal short form", () => {
    expect(actionStyle("formal", "short")).toBe("Professional, formal tone. Short form: concise, under 170 words.");
  });
  it("supports informal long form without a conflicting short limit", () => {
    expect(actionStyle("informal", "long")).toBe("Conversational, informal tone. Long form: detailed paragraphs, without inventing facts.");
  });
});