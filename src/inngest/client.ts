import { Inngest } from "inngest";

/** App id shown in the Inngest dashboard / Lovable connector. */
export const inngest = new Inngest({
  id: "venture-pulse",
  // Local dev talks to the Inngest dev server; deployed builds always use
  // Inngest Cloud (a leftover INNGEST_DEV=1 secret kept jobs from running live).
  isDev: process.env["NODE_ENV"] === "development",
});
