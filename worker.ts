import { runScheduledReminders } from "./functions/lib/scheduled-delivery";
import type { Env } from "./functions/lib/types";

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledReminders(env));
  },
};
