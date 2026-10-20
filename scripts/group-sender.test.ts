import { resolveGroupSender } from "../src/utils/gmail.server";
import { expect, test } from "vitest";
test("group", () => {
  expect(resolveGroupSender({ name: "'Beech, Julia' via GTM Tracking", email: "gtm-tracking@dt-capital.net" }, "julia.beech@dell.com", '"Beech, Julia" <julia.beech@dell.com>')).toEqual({ name: "Beech, Julia", email: "julia.beech@dell.com" });
  expect(resolveGroupSender({ name: "Bob", email: "bob@x.com" }, "", "")).toEqual({ name: "Bob", email: "bob@x.com" });
});
