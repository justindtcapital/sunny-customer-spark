// Golden-file attribution test for BD/GTM email → activity.
// Fixtures mirror the real traffic patterns seen in the mailbox diagnostic:
// comma display names, Asana intake co-recipients, teammate forwards, reply chains.
// Run: npx tsx scripts/email-attribution.test.ts

import { parseAddressList, isPlausibleAddress } from "../src/lib/email-address";
import { extractForwardedHeaders } from "../src/lib/email-forward";
import { buildInternalConfig, isInternalEmail } from "../src/lib/email-noise";
import { threadToActivity, type GmailMessage } from "../src/utils/gmail.server";
import {
  canonicalizeActivities,
  dedupeAcrossSources,
  normalizeSubjectKey,
  peopleEmailsFromNotes,
} from "../src/lib/activity-canonical";
import { matchActivitiesToContact } from "../src/lib/activity-match";
import type { AsanaActivity, Contact } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const INTERNAL = buildInternalConfig("dt-capital.net", "chris.falloon@dell.com");
const ALIASES = new Set(["bd@dt-capital.net"]);

function msg(over: Partial<GmailMessage>): GmailMessage {
  return {
    id: "m1",
    threadId: "t1",
    subject: "Subject",
    fromName: "",
    fromEmail: "",
    toEmails: [],
    ccEmails: [],
    toPeople: [],
    ccPeople: [],
    deliveredTo: [],
    date: Date.parse("2026-08-12T14:00:00Z"),
    dateLabel: "2026-08-12",
    snippet: "",
    body: "",
    links: [],
    attachments: [],
    permalink: "https://mail.google.com/mail/u/0/#all/m1",
    ...over,
  };
}

console.log("— address list parsing —");
const parsed = parseAddressList(
  '"Jain, Vrashank" <vrashank.j@dell.com>, Ann Lee <ann@maxiq.ai>, garbage-token',
);
check("quoted comma name stays one entry", parsed.length === 2, JSON.stringify(parsed));
check("display name preserved", parsed[0].name === "Jain, Vrashank", parsed[0].name);
check("email lowercased", parsed[0].email === "vrashank.j@dell.com");
check("invalid token dropped", !parsed.some((p) => p.email.includes("garbage")));
check("bare address parses", parseAddressList("a.b@acme.com")[0].email === "a.b@acme.com");
check("shape filter rejects junk", !isPlausibleAddress("jain"));

console.log("— internal config —");
check("own domain is internal", isInternalEmail("me@dt-capital.net", INTERNAL));
check("listed teammate is internal", isInternalEmail("chris.falloon@dell.com", INTERNAL));
check("other dell person is external", !isInternalEmail("vrashank.j@dell.com", INTERNAL));

console.log("— attribution: teammate mails contact with alias CC'd —");
const outboundAct = threadToActivity(
  [
    msg({
      subject: "MaxIQ > Dell DFS",
      fromName: "Falloon, Chris",
      fromEmail: "chris.falloon@dell.com",
      toPeople: [{ name: "Jain, Vrashank", email: "vrashank.j@dell.com" }],
      toEmails: ["vrashank.j@dell.com"],
      ccPeople: [{ name: "BD", email: "bd@dt-capital.net" }],
      ccEmails: ["bd@dt-capital.net"],
    }),
  ],
  "BD",
  ALIASES,
  INTERNAL,
)!;
check("person is the external contact", outboundAct.person === "Jain, Vrashank", outboundAct.person);
check("owner is the teammate", outboundAct.owner === "chris.falloon@dell.com", outboundAct.owner);
check("direction is outbound", outboundAct.status === "Sent", outboundAct.status);
check(
  "People line carries the contact email",
  peopleEmailsFromNotes(outboundAct.notes).includes("vrashank.j@dell.com"),
);

console.log("— attribution: teammate forwards a thread to the alias —");
const fwdBody = `FYI\n\n---------- Forwarded message ---------\nFrom: Ann Lee <ann@maxiq.ai>\nDate: Tue, Aug 11, 2026 at 9:04 AM\nSubject: MaxIQ > Dell DFS\nTo: Falloon, Chris <chris.falloon@dell.com>\n\nHi Chris, following up on the pilot.`;
check("forward block parses", extractForwardedHeaders(fwdBody)?.from?.email === "ann@maxiq.ai");
const fwdAct = threadToActivity(
  [
    msg({
      subject: "FW: MaxIQ > Dell DFS",
      fromName: "Falloon, Chris",
      fromEmail: "chris.falloon@dell.com",
      toPeople: [{ name: "BD", email: "bd@dt-capital.net" }],
      toEmails: ["bd@dt-capital.net"],
      body: fwdBody,
    }),
  ],
  "BD",
  ALIASES,
  INTERNAL,
)!;
check("forwarded contact recovered", fwdAct.person === "Ann Lee", fwdAct.person);
check("forwarder stays owner", fwdAct.owner === "chris.falloon@dell.com", fwdAct.owner);

console.log("— thread collapse —");
const thread = [1, 2, 3, 4].map((i) =>
  msg({
    id: `m${i}`,
    threadId: "t9",
    subject: i === 1 ? "Treeverse intro" : "RE: Treeverse intro",
    fromName: "Dana Wu",
    fromEmail: "dana@treeverse.io",
    toPeople: [{ name: "BD", email: "bd@dt-capital.net" }],
    toEmails: ["bd@dt-capital.net"],
    date: Date.parse(`2026-08-0${i}T10:00:00Z`),
    dateLabel: `2026-08-0${i}`,
  }),
);
const collapsed = threadToActivity(thread, "BD", ALIASES, INTERNAL)!;
check("newest message wins", collapsed.date === "2026-08-04", collapsed.date);
check("inbound from external", collapsed.status === "Received");
check("notes cite the thread", (collapsed.notes || "").includes("thread t9"));

console.log("— notes budget protects the People line —");
const manyCc = Array.from({ length: 60 }, (_, i) => ({
  name: `Person Number ${i}`,
  email: `person${i}@bigco.com`,
}));
const bigAct = threadToActivity(
  [
    msg({
      fromName: "Dana Wu",
      fromEmail: "dana@treeverse.io",
      toPeople: [{ name: "BD", email: "bd@dt-capital.net" }],
      toEmails: ["bd@dt-capital.net"],
      ccPeople: manyCc,
      ccEmails: manyCc.map((c) => c.email),
      snippet: "x".repeat(2000),
    }),
  ],
  "BD",
  ALIASES,
  INTERNAL,
)!;
check(
  "primary email survives a huge Cc list",
  peopleEmailsFromNotes(bigAct.notes).includes("dana@treeverse.io"),
);

console.log("— canonicalization —");
const contacts: Contact[] = [
  {
    urid: "u1",
    name: "Vrashank Jain",
    email: "vrashank.j@dell.com",
    company: "Dell Financial Services",
  } as Contact,
];
const canon = canonicalizeActivities([outboundAct], contacts, ["MaxIQ", "Treeverse"]);
check("person uses CRM spelling", canon[0].person === "Vrashank Jain", canon[0].person);
check("company comes from content", canon[0].company === "MaxIQ", canon[0].company);

console.log("— cross-source dedupe —");
const asanaTwin: AsanaActivity = {
  gid: "123",
  track: "BD",
  name: "MaxIQ > Dell DFS",
  date: "2026-08-12",
  completed: true,
};
const deduped = dedupeAcrossSources([asanaTwin, outboundAct]);
check("gmail twin dropped", deduped.dropped === 1 && deduped.activities.length === 1);
check("asana record kept", !deduped.activities[0].gid.startsWith("gmail-"));
check("subject key strips RE:/FW:", normalizeSubjectKey("FW: RE: Deal — X") === "deal x");

console.log("— token-exact contact match —");
const near: Contact = { urid: "u2", name: "Jo", email: "jo@x.com", company: "X" } as Contact;
const act: AsanaActivity = {
  gid: "gmail-1",
  track: "BD",
  name: "hi",
  completed: true,
  notes: "Inbound email\nPeople: JJo <jjo@x.com>",
};
check("substring near-miss no longer matches", matchActivitiesToContact([act], near).length === 0);
check(
  "exact address matches",
  matchActivitiesToContact([{ ...act, notes: "People: Jo <jo@x.com>" }], near).length === 1,
);

console.log(failures === 0 ? "\nAll attribution checks passed." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
