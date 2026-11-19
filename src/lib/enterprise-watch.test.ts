import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/types";
import { enterpriseWatchList, isWatchedStory, storyNamesCompany, todaysWatchBatch } from "./enterprise-watch";

const person = (company: string, temperature: Contact["temperature"], extra: Partial<Contact> = {}): Contact =>
  ({ id: `${company}-${temperature}-${Math.random()}`, name: "A Person", company, temperature, email: "", ...extra }) as Contact;

describe("enterpriseWatchList", () => {
  it("watches Council, Hot and Warm companies but not Cold-only ones", () => {
    const list = enterpriseWatchList(
      [person("NVIDIA", "Hot"), person("Walmart", "Warm"), person("Acme Bank", "Council"), person("ColdCo", "Cold")],
      { portcoNames: [] },
    );
    expect(list.map((c) => c.name).sort()).toEqual(["Acme Bank", "NVIDIA", "Walmart"]);
  });

  it("leaves out PortCos and Dell", () => {
    const list = enterpriseWatchList(
      [person("Cequence", "Hot"), person("Dell Technologies", "Hot"), person("Siemens", "Warm")],
      { portcoNames: ["Cequence"] },
    );
    expect(list.map((c) => c.name)).toEqual(["Siemens"]);
  });

  it("groups spelling variants and ranks Council above Hot above Warm", () => {
    const list = enterpriseWatchList(
      [person("Nvidia Corp.", "Warm"), person("NVIDIA", "Warm"), person("Target", "Hot"), person("Pfizer", "Council")],
      { portcoNames: [] },
    );
    expect(list.map((c) => [c.name, c.score])).toEqual([["Pfizer", 3], ["NVIDIA", 2], ["Target", 2]]);
  });

  it("leaves out investor firms", () => {
    const list = enterpriseWatchList([person("Sienna Venture Capital", "Hot"), person("Capital One", "Warm")], { portcoNames: [] });
    expect(list.map((c) => c.name)).toEqual(["Capital One"]);
  });

  it("only Hot and Warm when Council is not a watched level", () => {
    const list = enterpriseWatchList([person("Pfizer", "Council"), person("Target", "Hot")], { portcoNames: [], levels: ["Hot", "Warm"] });
    expect(list.map((c) => c.name)).toEqual(["Target"]);
  });
});

describe("todaysWatchBatch", () => {
  it("covers every company across consecutive days", () => {
    const list = Array.from({ length: 45 }, (_, i) => i);
    const seen = new Set<number>();
    for (let d = 0; d < 3; d++) for (const x of todaysWatchBatch(list, { now: d * 86_400_000, batchSize: 20 })) seen.add(x);
    expect(seen.size).toBe(45);
  });
});

describe("isWatchedStory", () => {
  const opts = { watchNames: ["Publicis Sapient", "NVIDIA"], portcoNames: ["Cequence"] };
  it("keeps a watched company's own announcement", () => {
    expect(isWatchedStory({ company: "NVIDIA", text: "Nvidia names a new CFO" }, opts)).toBe(true);
  });
  it("drops another company's news filed under a watched company", () => {
    expect(isWatchedStory({ company: "Publicis Sapient", text: "Salesforce announced Copilotforce with Microsoft" }, opts)).toBe(false);
  });
  it("drops stories about companies outside the watch", () => {
    expect(isWatchedStory({ company: "Salesforce", text: "Salesforce announced Copilotforce" }, opts)).toBe(false);
  });
});

describe("storyNamesCompany", () => {
  it("accepts a story that names its company, even with a suffix", () => {
    expect(storyNamesCompany({ company: "Q2 Holdings", text: "Jonathan Price named Co-CEO of Q2 Holdings" })).toBe(true);
  });
  it("rejects a story about someone else", () => {
    expect(storyNamesCompany({ company: "AWS", text: "Redis released a Vercel AI SDK package" })).toBe(false);
  });
});
