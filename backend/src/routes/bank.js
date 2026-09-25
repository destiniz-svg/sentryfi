const express = require("express");
const { z } = require("zod");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { requireCompany, requireCan } = require("../middleware/company");
const { asCompany } = require("../ledger/session");
const { formatLaari } = require("../ledger/money");
const bank = require("../ledger/bank");
const reconcile = require("../ledger/reconcile");
const fx = require("../ledger/fx");
const revalue = require("../ledger/revalue");
const { today: localToday } = require("../ledger/today");

/** Bank accounts and tins, and money moving between them. Every balance is read from the journal. */

const router = express.Router();
router.use(requireAuth, requireCompany);

const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "A currency is three letters, like USD.");
const newBank = z.object({
  name: z.string().trim().min(2, "A bank account needs a name.").max(80),
  currency: currency.nullish(),
  // Every bank account has one, and it is what tells two at one bank apart.
  accountNo: z.string({ error: "What is its account number?" }).trim().min(4, "What is its account number?").max(40).regex(/^[0-9A-Za-z -]*$/, "An account number is letters and digits."),
});

const newTransfer = z.object({
  fromId: z.string().uuid("Where does it come from?"),
  toId: z.string().uuid("Where does it go?"),
  amount: z.union([z.string().trim().min(1), z.number()]),
  amountFc: z.union([z.string().trim().min(1), z.number()]).nullish(),
  note: z.string().trim().max(300).nullish(),
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullish(),
  clientRef: z.string().uuid().nullish(),
});

router.get(
  "/",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const { places, said } = await asCompany(req, async (client) => {
      const places = await bank.places(client, { companyId: req.companyId });
      // What the bank itself says: the closing balance on its last statement
      // day, beside what the books say on that same day.
      const said = {};
      for (const p of places.filter((x) => x.kind === "bank" && !x.foreign)) {
        const s = await bank.bankSays(client, { companyId: req.companyId, accountId: p.id });
        if (s) said[p.id] = { on: s.on, bank: formatLaari(s.bank), books: formatLaari(s.books), difference: formatLaari(s.bank - s.books), agrees: s.bank === s.books };
      }
      return { places, said };
    });
    res.json({
      places: places.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        accountNo: p.bank_account_no || null,
        kind: p.kind,
        currency: p.currency,
        foreign: p.foreign,
        balance: formatLaari(p.balance),
        balanceFc: p.foreign ? formatLaari(p.balanceFc) : undefined,
        overdrawn: p.balance < 0n,
        editable: p.kind === "bank" && p.untouched,
        statement: p.kind === "bank" ? { lines: p.lines, waiting: p.waiting, said: said[p.id] || null } : undefined,
      })),
    });
  })
);

router.post(
  "/",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const parsed = newBank.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      const account = await asCompany(req, (client) =>
        bank.openBank(client, { companyId: req.companyId, ...parsed.data })
      );
      res.status(201).json({ account: { id: account.id, code: account.code, name: account.name, currency: account.currency.trim(), accountNo: account.accountNo } });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

router.get(
  "/archived",
  requireCan("read"),
  asyncHandler(async (req, res) => res.json({ accounts: await asCompany(req, (client) => bank.archivedBanks(client, { companyId: req.companyId })) }))
);

for (const [path, act] of [["archive", "archiveBank"], ["restore", "restoreBank"]]) {
  router.post(
    `/:id/${path}`,
    requireCan("manage_settings"),
    asyncHandler(async (req, res) => {
      try {
        res.json(await asCompany(req, (client) => bank[act](client, { companyId: req.companyId, accountId: req.params.id })));
      } catch (err) {
        throw ApiError.badRequest(err.message);
      }
    })
  );
}

router.patch(
  "/:id",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const parsed = newBank.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      res.json({ account: await asCompany(req, (client) => bank.editBank(client, { companyId: req.companyId, accountId: req.params.id, ...parsed.data })) });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

router.patch(
  "/:id/number",
  requireCan("manage_settings"),
  asyncHandler(async (req, res) => {
    const parsed = newBank.shape.accountNo.safeParse(req.body?.accountNo ?? "");
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      res.json(await asCompany(req, (client) => bank.setNumber(client, { companyId: req.companyId, accountId: req.params.id, accountNo: parsed.data })));
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

// Rates as people recorded them. The latest on or before a date is offered
// for the next foreign document; nothing already recorded changes with it.
const newRate = z.object({
  currency,
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  rate: z.union([z.string().trim(), z.number()]).transform(String),
  source: z.string().trim().max(120).nullish(),
});

router.get(
  "/rates",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const cur = currency.safeParse(req.query.currency || "");
    if (!cur.success) throw ApiError.badRequest(cur.error.issues[0].message);
    const on = /^\d{4}-\d{2}-\d{2}$/.test(req.query.on || "") ? req.query.on : null;
    const found = await asCompany(req, async (client) => ({
      base: await fx.baseCurrency(client, { companyId: req.companyId }),
      latest: await fx.rateOn(client, { companyId: req.companyId, currency: cur.data, on }),
    }));
    res.json({ currency: cur.data, ...found });
  })
);

router.post(
  "/rates",
  requireCan("approve", "adjust"),
  asyncHandler(async (req, res) => {
    const parsed = newRate.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      await asCompany(req, (client) =>
        fx.recordRate(client, { companyId: req.companyId, userId: req.user.id, ...parsed.data })
      );
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
    res.status(201).json({ ok: true });
  })
);

router.post(
  "/transfer",
  requireCan("approve", "adjust"),
  asyncHandler(async (req, res) => {
    const parsed = newTransfer.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      const result = await asCompany(req, (client) =>
        bank.transfer(client, { companyId: req.companyId, userId: req.user.id, ...parsed.data })
      );
      res.status(result.alreadyHad ? 200 : 201).json({
        entryId: result.entry.id,
        entryNo: String(result.entry.entryNo),
        alreadyHad: result.alreadyHad,
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/**
 * A statement file, as the bank sent it. The body is the CSV itself, not JSON
 * wrapped around it: it can be megabytes, and it should reach the parser
 * byte for byte.
 */
router.post(
  "/:accountId/statement",
  requireCan("approve", "adjust"),
  express.text({ type: () => true, limit: "10mb" }),
  asyncHandler(async (req, res) => {
    if (typeof req.body !== "string" || !req.body.trim()) throw ApiError.badRequest("That file has nothing in it.");
    try {
      const r = await asCompany(req, (client) =>
        bank.importStatement(client, {
          companyId: req.companyId,
          userId: req.user.id,
          accountId: req.params.accountId,
          text: req.body,
        })
      );
      res.status(201).json({
        ...r,
        balance: {
          ...r.balance,
          opening: r.balance.opening === null ? null : formatLaari(r.balance.opening),
          closing: r.balance.closing === null ? null : formatLaari(r.balance.closing),
        },
      });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/* ------------------------------------------------- foreign money at a month end */

const wireItem = (i) => ({
  account: i.name,
  code: i.code,
  currency: i.currency,
  held: formatLaari(i.fc),
  carried: formatLaari(i.carried),
  rate: i.rate,
  worth: i.worth === null ? null : formatLaari(i.worth),
  move: i.move === null ? null : formatLaari(i.move),
});

/** What restating foreign money at a month end would move, at recorded rates or those given. */
router.get(
  "/revalue",
  requireCan("read"),
  asyncHandler(async (req, res) => {
    const through = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.through || "")) ? req.query.through : localToday();
    const p = await asCompany(req, (client) => revalue.preview(client, { companyId: req.companyId, through }));
    res.json({ on: p.on, missing: p.missing, items: p.items.map(wireItem) });
  })
);

router.post(
  "/revalue",
  requireCan("adjust"),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Which month end?"), rates: z.record(z.string().regex(/^[A-Z]{3}$/), z.string().trim()).default({}) })
      .safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    try {
      const r = await asCompany(req, (client) => revalue.revalue(client, { ...parsed.data, companyId: req.companyId, userId: req.user.id }));
      res.json({ on: r.on, entryNo: r.entryNo && String(r.entryNo), net: formatLaari(r.net), gain: r.net > 0n, items: r.items.map(wireItem) });
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

/* ------------------------------------------------- what the bank shows that the books do not */

const uuid = z.string().uuid();
const ask = requireCan("approve", "adjust");

const lineOut = (l, ideas) => ({
  id: l.id,
  on: l.posted_on,
  kind: l.kind,
  who: l.who,
  remark: l.remark,
  ref: l.bank_ref,
  channel: l.channel,
  flag: l.flag,
  moneyIn: BigInt(l.credit_laari) > 0n,
  amount: formatLaari(BigInt(l.credit_laari) > 0n ? BigInt(l.credit_laari) : BigInt(l.debit_laari)),
  status: l.status,
  note: l.note,
  ...ideas,
});

/** The questions still open for one bank account, biggest money first, and the accounts an answer can name. */
router.get(
  "/:accountId/waiting",
  ask,
  asyncHandler(async (req, res) => {
    const data = await asCompany(req, async (client) => {
      const groups = await reconcile.groups(client, { companyId: req.companyId, accountId: req.params.accountId });
      const { rows: counts } = await client.query(
        `SELECT status, count(*)::int AS n FROM bank_statement_lines
          WHERE company_id = $1 AND account_id = $2 GROUP BY status`,
        [req.companyId, req.params.accountId]
      );
      const { rows: accounts } = await client.query(
        `SELECT id, code, name, type FROM accounts
          WHERE company_id = $1 AND archived_at IS NULL AND id <> $2
          ORDER BY CASE type WHEN 'expense' THEN 0 WHEN 'income' THEN 1 WHEN 'liability' THEN 2 WHEN 'asset' THEN 3 ELSE 4 END, code`,
        [req.companyId, req.params.accountId]
      );
      // The statement is in the account's own currency, so its sums are said in it.
      const { rows: cur } = await client.query("SELECT COALESCE(trim(a.currency), trim(c.base_currency)) AS cur FROM accounts a JOIN companies c ON c.id = a.company_id WHERE a.id = $1 AND a.company_id = $2", [req.params.accountId, req.companyId]);
      return { groups, counts, accounts, currency: cur[0]?.cur || "MVR" };
    });
    res.json({
      currency: data.currency,
      groups: data.groups,
      counts: Object.fromEntries(data.counts.map((c) => [c.status, c.n])),
      accounts: data.accounts,
    });
  })
);

/** The lines behind one question, each with what the books could say about it. */
router.get(
  "/:accountId/waiting/lines",
  ask,
  asyncHandler(async (req, res) => {
    const status = ["open", "set_aside"].includes(req.query.status) ? req.query.status : "open";
    const lines = await asCompany(req, (client) =>
      reconcile.linesOf(client, {
        companyId: req.companyId,
        accountId: req.params.accountId,
        who: String(req.query.who || ""),
        moneyIn: req.query.moneyIn === "true",
        status,
      })
    );
    res.json({ lines: lines.map(({ line, ...ideas }) => lineOut(line, ideas)) });
  })
);

/** What has been answered, newest first. */
router.get(
  "/:accountId/answered",
  ask,
  asyncHandler(async (req, res) => {
    const rows = await asCompany(req, (client) =>
      reconcile.recent(client, { companyId: req.companyId, accountId: req.params.accountId })
    );
    res.json({ lines: rows.map((l) => ({ ...lineOut(l, {}), entryNo: l.entry_no ? String(l.entry_no) : null })) });
  })
);

/** Every answer goes through here, so a refusal always reads the same way. */
const answer = (fn) =>
  asyncHandler(async (req, res) => {
    try {
      const out = await asCompany(req, (client) =>
        // Who and where come from the session, never the body: a body naming
        // another user or company must not be able to speak for them.
        fn(client, { ...req.body, companyId: req.companyId, userId: req.user.id, lineId: req.params.id })
      );
      res.json(out);
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  });

const lineBody = (shape) => (req, _res, next) => {
  const parsed = shape.safeParse(req.body ?? {});
  if (!parsed.success) return next(ApiError.badRequest(parsed.error.issues[0].message));
  req.body = parsed.data;
  next();
};

router.post("/lines/:id/link", ask, lineBody(z.object({ entryId: uuid, note: z.string().trim().max(300).nullish() })), answer(reconcile.link));
router.post(
  "/lines/:id/post",
  ask,
  lineBody(z.object({ accountId: uuid, counterpartyId: uuid.nullish(), note: z.string().trim().max(300).nullish() })),
  answer(reconcile.post)
);
router.post("/lines/:id/receive", ask, lineBody(z.object({ invoiceId: uuid })), answer(reconcile.receiveAgainst));
router.post("/lines/:id/pay-bill", ask, lineBody(z.object({ billId: uuid })), answer(reconcile.payBill));
router.post("/lines/:id/set-aside", ask, lineBody(z.object({ note: z.string().trim().max(300).nullish() })), answer(reconcile.setAside));
router.post("/lines/:id/undo", ask, lineBody(z.object({})), answer(reconcile.undo));

/** Everything owed to one payee, answered the same way in one go. */
router.post(
  "/:accountId/group",
  ask,
  lineBody(z.object({ who: z.string().trim().max(300), moneyIn: z.boolean(), accountId: uuid, note: z.string().trim().max(300).nullish() })),
  asyncHandler(async (req, res) => {
    try {
      const out = await asCompany(req, (client) =>
        reconcile.postGroup(client, {
          ...req.body,
          companyId: req.companyId,
          userId: req.user.id,
          bankId: req.params.accountId,
        })
      );
      res.json(out);
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

router.post(
  "/:accountId/group/set-aside",
  ask,
  lineBody(z.object({ who: z.string().trim().max(300), moneyIn: z.boolean(), note: z.string().trim().max(300).nullish() })),
  asyncHandler(async (req, res) => {
    try {
      res.json(
        await asCompany(req, (client) =>
          reconcile.setAsideGroup(client, { ...req.body, companyId: req.companyId, userId: req.user.id, bankId: req.params.accountId })
        )
      );
    } catch (err) {
      throw ApiError.badRequest(err.message);
    }
  })
);

module.exports = router;
