// One-time operator tool: dry-run by default. Run with bun --env-file=.env scripts/rename-event-labels.ts [--apply].
// Executed → Completed, Accepted → Confirmed, retired categories → current ones. Backs up Events DB first.
import { renameLegacyEventLabels } from "../src/utils/event-planner.server";
console.log(JSON.stringify(await renameLegacyEventLabels(process.argv.includes("--apply")), null, 2));
