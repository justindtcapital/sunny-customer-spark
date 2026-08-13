// Golden-file attribution test for BD/GTM email → activity.
// Fixtures mirror the real traffic patterns seen in the mailbox diagnostic:
// comma display names, Asana intake co-recipients, teammate forwards, reply chains.
// Run: npx tsx scripts/email-attribution.test.ts

import {
  parseAddressList,
  parseAddressOrDisplayList,
  isPlausibleAddress,
  sanitizeEmailToken,
} from "../src/lib/email-address";
import {
  isActivityTrackingMessage,
  isCalendarAppointmentMessage,
} from "../src/lib/email-activity";
import { extractForwardedHeaders } from "../src/lib/email-forward";
import { parseDtcMeetingSubject } from "../src/lib/meeting-subject";
import { enrichActivityFromThreadText } from "../src/lib/activity-thread-intel";
import { buildInternalConfig, isInternalEmail, isNoiseEmail } from "../src/lib/email-noise";
import { shouldCatalogAsCrmEvent } from "../src/lib/event-catalog";
import {
  formatEngagementSources,
  inferEngagementSource,
  mergeEngagementSources,
  parseEngagementSources,
} from "../src/lib/engagement-source";
import { threadToActivity, type GmailMessage } from "../src/utils/gmail.server";
import { parseActivity } from "../src/utils/asana.server";
import {
  canonicalizeActivities,
  dedupeAcrossSources,
  expandPersonViaCompany,
  normalizeSubjectKey,
  peopleEntriesFromNotes,
  peopleEmailsFromNotes,
  subjectTwinKey,
  threadIdFromNotes,
} from "../src/lib/activity-canonical";
import { matchActivitiesToContact, resolvePortcosMentioned } from "../src/lib/activity-match";
import {
  activityRequiresFollowUp,
  countNewSyncRows,
  syncKey,
} from "../src/utils/activity-sync.functions";
import { planThreadDedupe } from "../src/utils/gmail-notes-repair.server";
import type { AsanaActivity, Contact } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const INTERNAL = buildInternalConfig(
  "dt-capital.net",
  "chris.falloon@dell.com;julia.beech@dell.com",
);
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
check(
  "sanitizes leading paren on email",
  sanitizeEmailToken("(prabhat@openobserve.ai") === "prabhat@openobserve.ai",
);
check("rejects still-broken email tokens", sanitizeEmailToken("(prabhat") === "");
{
  const cleaned = peopleEntriesFromNotes("People: x <(prabhat@openobserve.ai>");
  check(
    "People entries sanitize paren email",
    cleaned.length === 1 && cleaned[0].email === "prabhat@openobserve.ai",
    JSON.stringify(cleaned),
  );
  check(
    "auto-source never keeps implausible emails",
    cleaned.every((p) => isPlausibleAddress(p.email)),
  );
}

console.log("— internal config —");
check("own domain is internal", isInternalEmail("me@dt-capital.net", INTERNAL));
check("listed teammate is internal", isInternalEmail("chris.falloon@dell.com", INTERNAL));
check("other dell person is external", !isInternalEmail("vrashank.j@dell.com", INTERNAL));

console.log("— non-person / room connector noise —");
check("zoomcrc meeting id is noise", isNoiseEmail("97132749933@zoomcrc.com"));
check("digit-only local is noise", isNoiseEmail("95576049481@anywhere.com"));
check("shared teams@ mailbox is noise", isNoiseEmail("teams@cvi.dell.com"));
check("real person is not noise", !isNoiseEmail("zachary.yaguda@nscale.com"));

console.log("— event catalog vs 1:1 meetings —");
check(
  "person <> person is not an event",
  !shouldCatalogAsCrmEvent("Julia (DTC) <> Rohit (Auditoria)"),
);
check("briefing is not an event", !shouldCatalogAsCrmEvent("Briefing - Mastercard"));
check(
  "GTM sync is not an event",
  !shouldCatalogAsCrmEvent("FW: DTC / Cequence - GTM Strategy Planning Session"),
);
check(
  "DTC meeting subject is not an event",
  !shouldCatalogAsCrmEvent("Flexor (Or) - DTC (Chris F) -Follow Up"),
);
check("dinner stays an event", shouldCatalogAsCrmEvent("Ai4 Dinner"));
check("BlackHat stays an event", shouldCatalogAsCrmEvent("BlackHat Happy Hour"));
check("Tech Week stays an event", shouldCatalogAsCrmEvent("NYC Tech Week"));

console.log("— engagement source inference —");
check(
  "working PortCo meeting → activity interaction",
  inferEngagementSource({
    name: "Cloudera for tetrate and Cequence",
    type: "Meeting",
    notes: "Outbound meeting\nChannel: calendar",
  }) === "activity interaction",
);
check(
  "dinner → event exposure",
  inferEngagementSource({ name: "Ai4 Dinner", type: "Meeting" }) === "event exposure",
);
check(
  "intro language → direct introduction",
  inferEngagementSource({
    name: "Introduced Halcyon to ACME",
    type: "Email",
  }) === "direct introduction",
);
check(
  "pitched on call → evangelized",
  inferEngagementSource({
    name: "Network call — pitched Tetrate",
    type: "Call",
  }) === "evangelized during network call",
);
check(
  "plain email → activity interaction",
  inferEngagementSource({
    name: "RE: Flexor follow up",
    type: "Email",
  }) === "activity interaction",
);

console.log("— engagement source multi-select —");
check(
  "parse joins semicolon list",
  formatEngagementSources(
    parseEngagementSources("activity interaction; event exposure"),
  ) === "event exposure; activity interaction",
);
check(
  "merge unions without dupes",
  formatEngagementSources(
    mergeEngagementSources(["activity interaction"], "event exposure"),
  ) === "event exposure; activity interaction",
);
check(
  "merge is idempotent",
  formatEngagementSources(
    mergeEngagementSources(["event exposure", "activity interaction"], "event exposure"),
  ) === "event exposure; activity interaction",
);

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
{
  const entries = peopleEntriesFromNotes(
    "Outbound email\nPeople: zachary.yaguda <zachary.yaguda@nscale.com>; Falloon, Chris <chris.falloon@dell.com>\n",
  );
  check(
    "People entries keep Zach name+email",
    entries.some(
      (p) => p.email === "zachary.yaguda@nscale.com" && /zachary/i.test(p.name),
    ),
    JSON.stringify(entries),
  );
  check(
    "People entries keep Chris despite comma name",
    entries.some((p) => p.email === "chris.falloon@dell.com"),
    JSON.stringify(entries),
  );
}

console.log("— attribution: teammate forwards a thread to the alias —");
const fwdBody = `FYI\n\n---------- Forwarded message ---------\nFrom: Ann Lee <ann@maxiq.ai>\nDate: Tue, Aug 11, 2026 at 9:04 AM\nSubject: MaxIQ > Dell DFS\nTo: Falloon, Chris <chris.falloon@dell.com>\n\nHi Chris, following up on the pilot.`;
const fwdParsed = extractForwardedHeaders(fwdBody, INTERNAL);
check("forward block parses", fwdParsed?.from?.email === "ann@maxiq.ai");
check("original From is external", fwdParsed?.fromIsInternal === false);
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
check(
  "self-forward of inbound touch logs Received (not Sent)",
  fwdAct.status === "Received",
  fwdAct.status,
);

console.log("— self-forward of our own outbound stays Sent —");
const fwdOutBody = `FYI\n\n---------- Forwarded message ---------\nFrom: Falloon, Chris <chris.falloon@dell.com>\nDate: Tue, Aug 11, 2026 at 9:04 AM\nSubject: MaxIQ > Dell DFS\nTo: Ann Lee <ann@maxiq.ai>\n\nAnn, looping you in.`;
const fwdOut = threadToActivity(
  [
    msg({
      subject: "FW: MaxIQ > Dell DFS",
      fromName: "Falloon, Chris",
      fromEmail: "chris.falloon@dell.com",
      toPeople: [{ name: "BD", email: "bd@dt-capital.net" }],
      toEmails: ["bd@dt-capital.net"],
      body: fwdOutBody,
    }),
  ],
  "BD",
  ALIASES,
  INTERNAL,
)!;
check("forwarded outbound stays Sent", fwdOut.status === "Sent", fwdOut.status);
check("person is the external To", fwdOut.person === "Ann Lee", fwdOut.person);

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
check("gid is stable on threadId", collapsed.gid === "gmail-t9", collapsed.gid);
check("thread id parseable from notes", threadIdFromNotes(collapsed.notes) === "t9");

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
check(
  "subject twin key",
  subjectTwinKey("a@x.com", "RE: Hello World") === "a@x.com|hello world",
);

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

console.log("— PortCo mention boundaries (Maven ≠ Mave) —");
{
  const act: AsanaActivity = {
    gid: "gmail-x",
    track: "GTM",
    name: "RE: DTC Maven - GTM discussion - global growth",
    completed: true,
  };
  const hit = resolvePortcosMentioned(act, ["Mave", "Maven", "Tetrate"]);
  check("Maven wins over substring Mave", hit.length === 1 && hit[0] === "Maven", JSON.stringify(hit));
  const onlyMave = resolvePortcosMentioned(act, ["Mave", "Tetrate"]);
  check(
    "Mave alone does not match subject Maven",
    onlyMave.length === 0,
    JSON.stringify(onlyMave),
  );
  const slash = resolvePortcosMentioned(
    { ...act, name: "NScale / tetrate / quali / akka" },
    ["Tetrate", "Quali", "Akka", "Mave"],
  );
  check(
    "slash list still matches whole names",
    slash.includes("Tetrate") && slash.includes("Quali") && slash.includes("Akka") && !slash.includes("Mave"),
    JSON.stringify(slash),
  );
}

console.log("— calendar appointment → Meeting + multi-PortCo —");
{
  const apptBody = `-----Original Appointment-----\nFrom: Kris <kris.bradley@dell.com>\n`;
  check(
    "Original Appointment body is calendar",
    isCalendarAppointmentMessage({
      subject: "RE: NScale - Dell Tech Capital / tetrate / quali / akka / distyl /",
      body: apptBody,
    }),
  );
  const apptAct = threadToActivity(
    [
      msg({
        id: "appt1",
        threadId: "appt1",
        subject: "RE: NScale - Dell Tech Capital / tetrate / quali / akka / distyl /",
        fromName: "Kris",
        fromEmail: "kris.bradley@dell.com",
        toPeople: [{ name: "Falloon, Chris", email: "chris.falloon@dell.com" }],
        toEmails: ["chris.falloon@dell.com"],
        ccPeople: [{ name: "BD", email: "bd@dt-capital.net" }],
        ccEmails: ["bd@dt-capital.net"],
        body: apptBody,
        snippet: "-----Original Appointment-----",
      }),
    ],
    "BD",
    ALIASES,
    INTERNAL,
  )!;
  check("appointment type is Meeting", apptAct.type === "Meeting", apptAct.type);
  check("notes say Meeting not Inbound email", /^Meeting/i.test(apptAct.notes || ""), apptAct.notes);
  check("appointment chrome not in notes body", !(apptAct.notes || "").includes("Original Appointment"));
  const multi = canonicalizeActivities(
    [apptAct],
    [] as Contact[],
    ["Tetrate", "Quali", "Akka", "Distyl", "NScale"],
  )[0];
  check(
    "all subject PortCos on company field",
    (multi.company || "").includes("Tetrate") &&
      (multi.company || "").includes("Quali") &&
      (multi.company || "").includes("Akka") &&
      (multi.company || "").includes("Distyl"),
    multi.company,
  );
}

console.log("— Flexor calendar: recover Or when headers are organizer-only —");
{
  const hints = parseDtcMeetingSubject("RE: Flexor (Or) - DTC (Chris F) -Follow Up");
  check("DTC subject company", hints.company === "Flexor", JSON.stringify(hints));
  check("DTC subject external", hints.externalName === "Or", hints.externalName);
  check("DTC subject owner hint", hints.ownerHint === "Chris F", hints.ownerHint);

  const displayTo = parseAddressOrDisplayList("Falloon, Chris; Or Zabludowski");
  check(
    "display-name To keeps Or",
    displayTo.some((a) => /or/i.test(a.name)),
    JSON.stringify(displayTo),
  );

  const apptBody = `-----Original Appointment-----
From: Falloon, Chris
Sent: Tuesday, July 21, 2026 8:29 AM
To: Falloon, Chris; Or Zabludowski
Cc: Beech, Julia
Subject: Flexor (Or) - DTC (Chris F) -Follow Up

When: Thursday, July 23, 2026 3:30 PM-4:00 PM.
Microsoft Teams meeting
Join: https://teams.microsoft.com/meet/21878833799168`;
  const parsedAppt = extractForwardedHeaders(apptBody, INTERNAL);
  check(
    "appointment To includes Or",
    (parsedAppt?.to || []).some((a) => /or zabludowski/i.test(a.name)),
    JSON.stringify(parsedAppt?.to),
  );
  check(
    "appointment Cc includes Julia",
    (parsedAppt?.cc || []).some((a) => /beech/i.test(a.name)),
    JSON.stringify(parsedAppt?.cc),
  );

  // Live Gmail copy: MIME headers only have Chris; body is Teams chrome (no To: Or).
  const flexorSubjectOnly = threadToActivity(
    [
      msg({
        id: "19ff373d43c18504",
        threadId: "19ff373d43c18504",
        subject: "RE: Flexor (Or) - DTC (Chris F) -Follow Up",
        fromName: "Falloon, Chris",
        fromEmail: "chris.falloon@dell.com",
        toPeople: [{ name: "Falloon, Chris", email: "chris.falloon@dell.com" }],
        toEmails: ["chris.falloon@dell.com"],
        body: `When: Thursday, July 23, 2026 3:30 PM-4:00 PM (UTC-08:00) Pacific Time.
Where: Microsoft Teams Meeting
Microsoft Teams meeting
Join: https://teams.microsoft.com/meet/21878833799168`,
        snippet: "Microsoft Teams meeting",
      }),
    ],
    "BD",
    ALIASES,
    INTERNAL,
  )!;
  check("Flexor subject-only type Meeting", flexorSubjectOnly.type === "Meeting");
  check(
    "Flexor subject-only Person is Or (not Chris)",
    flexorSubjectOnly.person === "Or",
    flexorSubjectOnly.person,
  );
  check(
    "Flexor notes People mentions Or",
    /People:.*\bOr\b/i.test(flexorSubjectOnly.notes || ""),
    flexorSubjectOnly.notes,
  );

  // When Outlook appointment headers ARE in the body, Prefer full name Or Zabludowski.
  const flexorWithBody = threadToActivity(
    [
      msg({
        id: "flexor-body",
        threadId: "flexor-body",
        subject: "RE: Flexor (Or) - DTC (Chris F) -Follow Up",
        fromName: "Falloon, Chris",
        fromEmail: "chris.falloon@dell.com",
        toPeople: [{ name: "Falloon, Chris", email: "chris.falloon@dell.com" }],
        toEmails: ["chris.falloon@dell.com"],
        body: apptBody,
        snippet: "-----Original Appointment-----",
      }),
    ],
    "BD",
    ALIASES,
    INTERNAL,
  )!;
  check(
    "Flexor body Person is Or Zabludowski",
    /or zabludowski/i.test(flexorWithBody.person || ""),
    flexorWithBody.person,
  );
  check(
    "Flexor body People includes Julia (internal name)",
    /Beech,\s*Julia|Julia/i.test(flexorWithBody.notes || ""),
    flexorWithBody.notes,
  );

  const contacts = [
    {
      id: "c1",
      name: "Or Zabludowski",
      email: "or@flexor.com",
      company: "Flexor",
    },
  ] as Contact[];
  const expanded = expandPersonViaCompany("Or", "Flexor", contacts);
  check("CRM expands Or → Or Zabludowski", expanded === "Or Zabludowski", expanded);
  const canon = canonicalizeActivities(
    [flexorSubjectOnly],
    contacts,
    ["Flexor"],
  )[0];
  check(
    "canonicalize Flexor Person full name",
    canon.person === "Or Zabludowski",
    canon.person,
  );
  check("canonicalize Flexor company", canon.company === "Flexor", canon.company);
}

console.log("— Asana intelligence layer (pasted threads) —");
{
  const apptNotes = `-----Original Appointment-----
From: Falloon, Chris
Sent: Tuesday, July 21, 2026 8:29 AM
To: Falloon, Chris; Or Zabludowski
Cc: Beech, Julia
Subject: Flexor (Or) - DTC (Chris F) -Follow Up

When: Thursday, July 23, 2026 3:30 PM-4:00 PM.
Microsoft Teams meeting
Join: https://teams.microsoft.com/meet/21878833799168`;

  const asanaEmptyPerson = parseActivity(
    {
      gid: "asana-flexor-1",
      name: "RE: Flexor (Or) - DTC (Chris F) -Follow Up",
      notes: apptNotes,
      permalink_url: "https://app.asana.com/0/1/asana-flexor-1",
      custom_fields: [],
    } as Parameters<typeof parseActivity>[0],
    "BD",
    { aliases: ALIASES, internal: INTERNAL },
  );
  check("Asana paste type Meeting", asanaEmptyPerson.type === "Meeting", asanaEmptyPerson.type);
  check(
    "Asana paste Person from thread (Or)",
    /or/i.test(asanaEmptyPerson.person || ""),
    asanaEmptyPerson.person,
  );
  check(
    "Asana paste People line present",
    /People:.*Or/i.test(asanaEmptyPerson.notes || ""),
    asanaEmptyPerson.notes,
  );
  check(
    "Asana paste notes budget keeps People",
    /^Outbound meeting|^Meeting/i.test(asanaEmptyPerson.notes || ""),
    asanaEmptyPerson.notes,
  );

  const asanaCurated = parseActivity(
    {
      gid: "asana-flexor-2",
      name: "RE: Flexor (Or) - DTC (Chris F) -Follow Up",
      notes: apptNotes,
      permalink_url: "https://app.asana.com/0/1/asana-flexor-2",
      custom_fields: [
        {
          gid: "f1",
          name: "Contact Person",
          type: "text",
          text_value: "Curated Contact",
          display_value: "Curated Contact",
        },
        {
          gid: "f2",
          name: "Portfolio Company",
          type: "text",
          text_value: "Flexor",
          display_value: "Flexor",
        },
      ],
    } as Parameters<typeof parseActivity>[0],
    "BD",
    { aliases: ALIASES, internal: INTERNAL },
  );
  check(
    "Asana curated Person kept",
    asanaCurated.person === "Curated Contact",
    asanaCurated.person,
  );
  check("Asana curated Company kept", asanaCurated.company === "Flexor", asanaCurated.company);
  check(
    "Asana curated still gets People line",
    /People:/i.test(asanaCurated.notes || ""),
    asanaCurated.notes,
  );

  const fwdIntel = enrichActivityFromThreadText(
    {
      subject: "FW: MaxIQ > Dell DFS",
      body: `FYI\n\n---------- Forwarded message ---------\nFrom: Ann Lee <ann@maxiq.ai>\nDate: Tue, Aug 11, 2026 at 9:04 AM\nSubject: MaxIQ > Dell DFS\nTo: Falloon, Chris <chris.falloon@dell.com>\n\nHi Chris.`,
      outboundHint: true,
      seedPeople: [
        { name: "Falloon, Chris", email: "chris.falloon@dell.com", role: "from" },
        { name: "BD", email: "bd@dt-capital.net", role: "to" },
      ],
    },
    ALIASES,
    INTERNAL,
  );
  check(
    "Asana/Gmail intel self-forward → Received",
    fwdIntel.status === "Received" && !fwdIntel.outbound,
    `${fwdIntel.status} outbound=${fwdIntel.outbound}`,
  );
  check(
    "Asana/Gmail intel recovers Ann",
    fwdIntel.person === "Ann Lee",
    fwdIntel.person,
  );
}

console.log("— activity subject classifier —");
check(
  "DTC GTM Discussion is activity",
  isActivityTrackingMessage({ subject: "DTC: MaxIQ — GTM Discussion" }),
);
check(
  "RE: DTC BD thread is activity",
  isActivityTrackingMessage({ subject: "RE: DTC: Bland.ai - BD Sync" }),
);
check(
  "plain industry news subject is not activity",
  !isActivityTrackingMessage({ subject: "FW: 451 Research: AI infra roundup" }),
);
check(
  "alias deliveredTo alone is activity",
  isActivityTrackingMessage(
    { subject: "hi", deliveredTo: ["bd@dt-capital.net"] },
    ALIASES,
  ),
);

console.log("— thread dedupe planner —");
{
  const plan = planThreadDedupe([
    {
      sheetRow: 2,
      email: "ann@maxiq.ai",
      date: "2026-08-10",
      note: "Inbound email\nGmail: https://mail.google.com/mail/u/0/#all/m1 · thread t9",
      ref: "gmail-m1",
    },
    {
      sheetRow: 3,
      email: "ann@maxiq.ai",
      date: "2026-08-12",
      note: "Outbound email\nGmail: https://mail.google.com/mail/u/0/#all/m3 · thread t9",
      ref: "gmail-m3",
    },
    {
      sheetRow: 4,
      email: "other@x.com",
      date: "2026-08-12",
      note: "Inbound email\nGmail: https://mail.google.com/mail/u/0/#all/m9 · thread t9",
      ref: "gmail-m9",
    },
  ]);
  check("keeps newest per contact+thread", plan.deleteRows.length === 1 && plan.deleteRows[0] === 2);
  check(
    "rewrites kept Source Ref to thread gid",
    plan.refUpdates.some((u) => u.sheetRow === 3 && u.value === "gmail-t9"),
  );
  check("other contact on same thread kept", !plan.deleteRows.includes(4));
}

console.log("— follow-up heuristic —");
{
  const now = Date.parse("2026-08-13T12:00:00Z");
  check(
    "old outbound needs follow-up",
    activityRequiresFollowUp({ status: "Sent", date: "2026-08-01" }, now, 7),
  );
  check(
    "recent outbound does not",
    !activityRequiresFollowUp({ status: "Sent", date: "2026-08-12" }, now, 7),
  );
  check(
    "inbound never auto follow-up",
    !activityRequiresFollowUp({ status: "Received", date: "2026-08-01" }, now, 7),
  );
}

console.log("— double-sync idempotency (same mailbox state) —");
{
  // Simulate two sync passes against identical threadToActivity output.
  const pass1 = threadToActivity(thread, "BD", ALIASES, INTERNAL)!;
  const pass2 = threadToActivity(thread, "BD", ALIASES, INTERNAL)!;
  check("builders emit identical gid", pass1.gid === pass2.gid && pass1.gid === "gmail-t9");
  const email = "dana@treeverse.io";
  const pairs = [{ email, gid: pass1.gid }];
  const afterFirst = new Set<string>();
  const firstNew = countNewSyncRows(pairs, afterFirst);
  afterFirst.add(syncKey(email, pass1.gid));
  const secondNew = countNewSyncRows([{ email, gid: pass2.gid }], afterFirst);
  check("first sync would log one row", firstNew === 1);
  check("second sync logs zero new rows", secondNew === 0);
}

console.log(failures === 0 ? "\nAll attribution checks passed." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
