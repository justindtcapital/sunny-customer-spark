import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { followUpEditSchema } from "@/lib/follow-up-edit";

const input = z.object({ id: z.string().min(1).max(300), edit: followUpEditSchema });
export const editFollowUpFn = createServerFn({ method: "POST" })
  .inputValidator((data: z.infer<typeof input>) => input.parse(data))
  .handler(async ({ data }) => {
    const { withDeadline } = await import("./request-deadline.server");
    const { saveFollowUpEdit } = await import("./follow-up-edit.server");
    const { teamMemberFor } = await import("@/lib/user-ownership");
    const owner = teamMemberFor(data.edit.owner);
    if (!owner) throw new Error("Choose a Venture Pulse teammate as the action owner.");
    return withDeadline("edit-follow-up", 55_000, async (step) => {
      step("saving task details");
      await saveFollowUpEdit(data.id, { ...data.edit, owner: owner.email });
      return { success: true };
    });
  });