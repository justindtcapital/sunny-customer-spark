import { describe, expect, it } from "vitest";
import { campaignEmailBatches, joinAddresses, mailtoLink, type CampaignMember } from "./campaigns";
import { outlookComposeLinks } from "./action-draft-cache";

const m = (name: string, email: string, company: string): CampaignMember => ({
  campaignId: "c1", personKey: email || name, kind: "network", name, email, title: "CISO", company, linkedin: "",
  added: "", subject: "", body: "", sentChannel: "", sentDate: "", followUpOwner: "", followUpDue: "",
});
const people = [m("Ann Lee", "ann@acme.com", "Acme"), m("Bo Chan", "bo@acme.com", "ACME "), m("Cy Diaz", "cy@zeta.io", "Zeta"), m("No Mail", "", "Zeta")];
const template = { subject: "Hi {{first_name}}", body: "Hello {{first_name}} at {{company}}" };
const draftFor = (x: CampaignMember) => ({ subject: `Own ${x.name}`, body: `Own body ${x.name}` });

describe("Outlook address lists", () => {
  it("separates addresses with semicolons, never commas", () => {
    expect(joinAddresses(["a@x.com", "b@y.com"])).toBe("a@x.com;b@y.com");
    expect(mailtoLink(["a@x.com", "b@y.com"], "s", "b")).toMatch(/^mailto:a%40x\.com;b%40y\.com\?/);
    expect(mailtoLink(["a@x.com", "b@y.com"], "s", "b")).not.toContain(",");
    expect(outlookComposeLinks(["a@x.com", "b@y.com"], "s", "b").desktop).toMatch(/^mailto:a%40x\.com;b%40y\.com\?/);
  });
  it("puts BCC recipients in a bcc field separated by semicolons", () => {
    expect(mailtoLink(["me@d.com"], "s", "b", { bcc: ["a@x.com", "b@y.com"] })).toContain("bcc=a%40x.com;b%40y.com");
  });
});

describe("campaign send modes", () => {
  it("individual: one email per person with an address, using their own draft", () => {
    const { batches, skipped } = campaignEmailBatches(people, "individual", draftFor, template);
    expect(batches.map((b) => b.to)).toEqual([["ann@acme.com"], ["bo@acme.com"], ["cy@zeta.io"]]);
    expect(batches[0].subject).toBe("Own Ann Lee");
    expect(skipped).toBe(1);
  });
  it("company: people at the same company share one email and are greeted together", () => {
    const { batches } = campaignEmailBatches(people, "company", draftFor, template);
    expect(batches).toHaveLength(2);
    expect(batches[0].to).toEqual(["ann@acme.com", "bo@acme.com"]);
    expect(batches[0].body).toBe("Hello Ann and Bo at Acme");
    expect(batches[1].to).toEqual(["cy@zeta.io"]);
    expect(batches[1].body).toBe("Own body Cy Diaz");
  });
  it("bcc: one email to the sender with everyone blind-copied", () => {
    const { batches } = campaignEmailBatches(people, "bcc", draftFor, template, "chrisf@dt-capital.net");
    expect(batches).toHaveLength(1);
    expect(batches[0].to).toEqual(["chrisf@dt-capital.net"]);
    expect(batches[0].bcc).toEqual(["ann@acme.com", "bo@acme.com", "cy@zeta.io"]);
    expect(batches[0].body).toBe("Hello there at your company");
  });
});

describe("shared emails keep wording everyone shares", () => {
  it("uses a personalised subject when all people in the email have the same one", () => {
    const same = (x: CampaignMember) => ({ subject: "Connecting in LA", body: `Hi ${x.name}` });
    const { batches } = campaignEmailBatches(people, "company", same, { subject: "Connecting in {{city}}", body: "Hi {{first_name}}" });
    expect(batches[0].subject).toBe("Connecting in LA");
    expect(batches[0].body).toBe("Hi Ann and Bo");
  });
});
