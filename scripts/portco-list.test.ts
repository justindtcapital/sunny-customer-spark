import { describe, expect, it } from "vitest";
import { appendPortcoList, formatPortcoList, parsePortcoList } from "../src/lib/portco-list";

const csv = `Company Name,Website,Focus Area(s),HQ,Summary,Ownership % FD
Akka,https://akka.io/,AI Platform,"San Francisco, USA","Akka provides a platform for building agentic systems. It also does streams.",5%
MavenAGI,https://mavenagi.com/,AI,"Boston","AI customer service agents for the enterprise.",2%`;

describe("PortCo List", () => {
  it("uses the file's name, website and first summary sentence only", () => {
    const list = parsePortcoList(csv);
    expect(list[0]).toEqual({ name: "Akka", website: "https://akka.io/", summary: "Akka provides a platform for building agentic systems." });
  });
  it("formats one bullet per PortCo and flags names missing from the file", () => {
    const r = formatPortcoList(parsePortcoList(csv), ["Maven AGI", "Unknown Co"]);
    expect(r.text).toBe("• MavenAGI (https://mavenagi.com/) – AI customer service agents for the enterprise.");
    expect(r.missing).toEqual(["Unknown Co"]);
  });
  it("appends the list after the email body", () => {
    expect(appendPortcoList("Thanks,\nChris\n\n", "• A")).toBe("Thanks,\nChris\n\n• A\n");
  });
});
