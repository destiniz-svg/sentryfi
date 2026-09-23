/**
 * Notifications. The properties: the same thing is said to a person once
 * (an hourly sweep can repeat itself safely); something at risk is said again
 * each day it is still true, something waiting once a week.
 */

import { describe, it, expect, afterAll } from "vitest";
import { inRollback, aCompanyWith, closePool } from "./setup";
import { assumeIdentity } from "../src/ledger/post";
import { notify, againEvery } from "../src/services/push";

afterAll(closePool);

describe("notifications", () => {
  it("says the same thing to a person once", () =>
    inRollback(async (client) => {
      const { companyId, userId } = await aCompanyWith(client);
      await assumeIdentity(client, { companyId, userId });
      const what = { companyId, userIds: [userId, userId], kind: "waiting", title: "PO-0001 waits for your approval", href: "/approvals", dedupeKey: "order:1" };
      expect((await notify(client, what)).length).toBe(1);
      expect((await notify(client, what)).length).toBe(0);
      expect((await notify(client, { ...what, dedupeKey: "order:2" })).length).toBe(1);
      const { rows } = await client.query("SELECT title, read_at FROM notifications WHERE company_id = $1 AND user_id = $2", [companyId, userId]);
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.read_at === null)).toBe(true);
    }));

  it("repeats what is at risk daily and what is waiting weekly", () => {
    expect(againEvery("money_at_risk", "2026-09-23")).toBe("2026-09-23");
    expect(againEvery("blocked", "2026-09-24")).toBe("2026-09-24");
    // Wednesday and the Sunday after are the same week, from Monday 21st.
    expect(againEvery("waiting", "2026-09-23")).toBe("week of 2026-09-21");
    expect(againEvery("ageing", "2026-09-27")).toBe("week of 2026-09-21");
    expect(againEvery("waiting", "2026-09-28")).toBe("week of 2026-09-28");
  });
});
