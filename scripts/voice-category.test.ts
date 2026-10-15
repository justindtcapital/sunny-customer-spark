import { describe, it, expect } from "vitest";
import { detectVoiceCategory, voiceTitle } from "../src/lib/voice-category";

describe("detectVoiceCategory", () => {
  it("network update", () => expect(detectVoiceCategory("Network update: met Sarah")).toBe("Network"));
  it("workstream update", () => expect(detectVoiceCategory("workstream update for Maven")).toBe("Workstream"));
  it("go-to-market update", () => expect(detectVoiceCategory("Go to market update on Dell pilot")).toBe("GTM"));
  it("BD update", () => expect(detectVoiceCategory("business development update")).toBe("BD"));
  it("portco ops", () => expect(detectVoiceCategory("Port dev ops update on board prep")).toBe("PortCo Ops"));
  it("portco update is not a category", () => expect(detectVoiceCategory("PortCo update, Maven raised")).toBeNull());
});

describe("voiceTitle", () => {
  it("PortCo - Category - Summary", () => expect(voiceTitle(["MavenAGI"], "GTM", "Dell pilot moving to procurement.")).toBe("MavenAGI - GTM - Dell pilot moving to procurement"));
  it("network carries NWK", () => expect(voiceTitle([], "Network", "Coffee with Sarah")).toBe("NWK Network - Coffee with Sarah"));
});
