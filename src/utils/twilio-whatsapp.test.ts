import { describe, expect, it } from "vitest";
import { computeTwilioSignature, verifyTwilioWebhookSignature } from "./twilio-whatsapp.server";

describe("Twilio webhook signature verification", () => {
  // Official test vector from Twilio's Webhook Security documentation.
  const officialUrl = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const officialParams = {
    To: "+18005551212",
    From: "+14158675309",
    Digits: "1234",
    CallSid: "CA1234567890ABCDE",
    Caller: "+14158675309",
  };

  it("matches Twilio's official HMAC-SHA1 base64 test vector", () => {
    expect(computeTwilioSignature("12345", officialUrl, officialParams)).toBe("RSOYDt4T1cUTdK1PDd93/VVr8B8=");
  });

  it("accepts a validly signed request and rejects tampered or unsigned requests", () => {
    const token = "test-auth-token";
    const url = "https://crm.dt-capital.net/api/public/twilio-whatsapp";
    const params = { From: "whatsapp:+15551234567", To: "whatsapp:+14155238886", Body: "Hi VIC", MessageSid: "SM123" };
    const sig = computeTwilioSignature(token, url, params);

    const validReq = new Request(url, { method: "POST", headers: { "x-twilio-signature": sig } });
    expect(verifyTwilioWebhookSignature(validReq, params, token)).toBe(true);

    const proxiedReq = new Request("http://internal.worker/api/public/twilio-whatsapp", {
      method: "POST",
      headers: { "x-twilio-signature": sig, "x-forwarded-host": "crm.dt-capital.net", "x-forwarded-proto": "https" },
    });
    expect(verifyTwilioWebhookSignature(proxiedReq, params, token)).toBe(true);

    const tampered = verifyTwilioWebhookSignature(validReq, { ...params, Body: "Tampered" }, token);
    expect(tampered).toBe(false);

    const unsignedReq = new Request(url, { method: "POST" });
    expect(verifyTwilioWebhookSignature(unsignedReq, params, token)).toBe(false);
  });
});