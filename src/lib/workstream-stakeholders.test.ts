import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/types";
import { addStakeholder, removeStakeholder, replaceStakeholder, resolveStakeholders, splitStakeholders } from "./workstream-stakeholders";

const person = (id: string, name: string, company: string, email = ""): Contact => ({ id, urid: id, name, company, email, title: "" }) as unknown as Contact;

const contacts = [
  person("1", "Jane Doe", "Dell Technologies", "jane.doe@dell.com"),
  person("2", "John Smith", "Acme", "john@acme.com"),
  person("3", "John Smith", "Dell Technologies", "john.smith@dell.com"),
  person("4", "Pat Lee", "Dell Technologies"),
  person("5", "Pat Lee", "Dell EMC"),
];

describe("Dell stakeholder links", () => {
  it("links a unique full-name match", () => {
    const [r] = resolveStakeholders("Jane Doe", contacts);
    expect(r?.status).toBe("linked");
    expect(r?.status === "linked" && r.contact.urid).toBe("1");
  });

  it("prefers the Dell record when two people share a name", () => {
    const [r] = resolveStakeholders("John Smith", contacts);
    expect(r?.status === "linked" && r.contact.urid).toBe("3");
  });

  it("leaves two Dell people with the same name for a human to pick", () => {
    const [r] = resolveStakeholders("Pat Lee", contacts);
    expect(r?.status).toBe("ambiguous");
  });

  it("never links a first name alone", () => {
    expect(resolveStakeholders("Jane", contacts)[0]?.status).toBe("unlinked");
  });

  it("links an email entry to its owner", () => {
    const [r] = resolveStakeholders("john.smith@dell.com", contacts);
    expect(r?.status === "linked" && r.contact.urid).toBe("3");
  });
});

describe("Dell stakeholder list edits", () => {
  it("reads legacy separators and drops repeats", () => {
    expect(splitStakeholders("Jane Doe; John Smith\njane doe")).toEqual(["Jane Doe", "John Smith"]);
  });

  it("adds, replaces and removes without touching the other names", () => {
    expect(addStakeholder("Jane Doe", "John Smith")).toBe("Jane Doe, John Smith");
    expect(addStakeholder("Jane Doe", "jane doe")).toBe("Jane Doe");
    expect(replaceStakeholder("Jane, John Smith", 0, "Jane Doe")).toBe("Jane Doe, John Smith");
    expect(removeStakeholder("Jane Doe, John Smith", 0)).toBe("John Smith");
  });
});
