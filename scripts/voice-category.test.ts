import { describe, it, expect } from "vitest";
import { detectVoiceCategory, voiceTitle } from "../src/lib/voice-category";

describe("detectVoiceCategory", () => {
  it("network update", () => expect(detectVoiceCategory("Network update: met Sarah")).toBe("Network"));
  it("workstream update", () => expect(detectVoiceCategory("workstream update for Maven")).toBe("Workstream"));
  it("portco update", () => expect(detectVoiceCategory("PortCo update, MavenAGI raised")).toBe("PortCo"));
  it("go-to-market update", () => expect(detectVoiceCategory("Go to market update on Dell pilot")).toBe("GTM"));
  it("BD update", () => expect(detectVoiceCategory("business development update")).toBe("BD"));
  it("none", () => expect(detectVoiceCategory("met someone today")).toBeNull());
  it("network title carries NWK", () => expect(voiceTitle("Network", new Date(2026, 9, 15))).toContain("NWK"));
});
