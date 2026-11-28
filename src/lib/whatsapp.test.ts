import { describe, expect, it } from "vitest";
import {
  formatWhatsAppReply,
  isWhatsAppResetCommand,
  normalizeWhatsAppPhone,
  splitWhatsAppMessage,
  twimlMessage,
} from "./whatsapp";

describe("normalizeWhatsAppPhone", () => {
  it("normalizes Twilio whatsapp: prefixed E.164 numbers", () => {
    expect(normalizeWhatsAppPhone("whatsapp:+15558675309")).toBe("+15558675309");
    expect(normalizeWhatsAppPhone("WHATSAPP:+44 7700 900077")).toBe("+447700900077");
  });

  it("accepts formatted US 10-digit and 11-digit numbers", () => {
    expect(normalizeWhatsAppPhone("(555) 867-5309")).toBe("+15558675309");
    expect(normalizeWhatsAppPhone("1-555-867-5309")).toBe("+15558675309");
  });

  it("rejects empty, too short, or malformed values", () => {
    expect(normalizeWhatsAppPhone("")).toBeNull();
    expect(normalizeWhatsAppPhone("12345")).toBeNull();
    expect(normalizeWhatsAppPhone("+0123456789")).toBeNull();
    expect(normalizeWhatsAppPhone("not a phone")).toBeNull();
  });
});

describe("formatWhatsAppReply", () => {
  it("converts markdown bold, headings, and relative/absolute links for WhatsApp", () => {
    const md = "### Top Signal\n**Tetri** raised Series B — [View signal](/signals?open=abc) and [TechCrunch](https://tc.example/1).";
    expect(formatWhatsAppReply(md)).toBe(
      "*Top Signal*\n*Tetri* raised Series B — View signal (https://crm.dt-capital.net/signals?open=abc) and TechCrunch (https://tc.example/1).",
    );
  });
});

describe("splitWhatsAppMessage", () => {
  it("splits long text into chunks within maxLen on paragraph or word boundaries", () => {
    const p1 = "A".repeat(900);
    const p2 = "B".repeat(900);
    const chunks = splitWhatsAppMessage(`${p1}\n\n${p2}`, 1500);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(p1);
    expect(chunks[1]).toBe(p2);
  });
});

describe("twimlMessage & reset commands", () => {
  it("escapes XML special characters and emits empty Response when blank", () => {
    expect(twimlMessage()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response/>');
    expect(twimlMessage('Check <A & B> "now"')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Check &lt;A &amp; B&gt; &quot;now&quot;</Message></Response>',
    );
  });

  it("detects /new and reset commands case-insensitively", () => {
    expect(isWhatsAppResetCommand("/new")).toBe(true);
    expect(isWhatsAppResetCommand("New Chat")).toBe(true);
    expect(isWhatsAppResetCommand("reset")).toBe(true);
    expect(isWhatsAppResetCommand("what is new with Tetri?")).toBe(false);
  });
});