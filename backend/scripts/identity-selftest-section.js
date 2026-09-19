/**
 * Who you are, and which books you are writing to.
 *
 * The ledger decides what exists from app.company_id, and until now nothing in
 * the API ever set it — so the whole engine was unreachable, and any query
 * against it would have come back empty. This proves the bridge: that a
 * request resolves to a company, that a person outside it is refused, that
 * roles decide what may be done, and that someone in two companies has to say
 * which one they mean rather than having it guessed.
 *
 * The middleware is exercised directly, with a request object stood up by
 * hand. That is deliberate: it tests the real function rather than a
 * re-description of it.
 */

const { resolveCompany, requireCan, rolesCan } = require("../src/middleware/company");

/** Resolves, and hands back the error instead of throwing, so both outcomes read the same. */
async function resolve(client, userId, asked = null) {
  try {
    return { ok: await resolveCompany(client, { userId, asked }), err: null };
  } catch (err) {
    return { ok: null, err };
  }
}

/** Runs a guard middleware against a request built from a resolution. */
function guard(middleware, req) {
  return new Promise((done) => middleware(req, {}, (err) => done(err || null)));
}

function reqFrom(resolved) {
  return {
    companyId: resolved.companyId,
    company: resolved.company,
    roles: resolved.roles,
    can: (a) => rolesCan(resolved.roles, a),
  };
}

async function testIdentity(client, ctx, { check }) {
  const { companyId, otherCompanyId, userId, outsiderId } = ctx;

  console.log("\n7. The request knows whose books it is touching");

  // ---- the role table ---------------------------------------------------

  check("an administrator may change settings", rolesCan(["administrator"], "manage_settings"));
  check("an accountant may adjust but not change settings",
    rolesCan(["accountant"], "adjust") && !rolesCan(["accountant"], "manage_settings"));
  check("a manager may record but not adjust",
    rolesCan(["manager"], "record") && !rolesCan(["manager"], "adjust"));
  check("an approver may approve but not record",
    rolesCan(["approver"], "approve") && !rolesCan(["approver"], "record"));
  check("a viewer may only read",
    rolesCan(["viewer"], "read") && !rolesCan(["viewer"], "record"));
  check("an auditor reads the trail and posts nothing",
    rolesCan(["auditor"], "read_trail") && !rolesCan(["auditor"], "record"));
  check("site staff may capture and nothing else",
    rolesCan(["site_staff"], "capture") && !rolesCan(["site_staff"], "read"));
  check("a cash holder may count their box", rolesCan(["cash_holder"], "count_cash"));
  check("a procurement officer may receive a delivery", rolesCan(["procurement"], "receive"));
  check("holding two roles grants the union of both",
    rolesCan(["viewer", "approver"], "approve") && rolesCan(["viewer", "approver"], "read"));

  // ---- resolving the company -------------------------------------------

  // The owner is an administrator of one company only, so far.
  // memberships is under FORCE row-level security, so even the table owner has
  // to say which company a row belongs to before writing it.
  await client.query("SELECT set_config('app.company_id', $1, true)", [companyId]);
  await client.query(
    `INSERT INTO memberships (user_id, company_id, role) VALUES ($1,$2,'administrator')`,
    [userId, companyId]
  );

  let r = await resolve(client, userId);
  check("one membership resolves without being asked which", r.err === null, r.err?.message);
  check("and it is the right company", r.ok?.companyId === companyId);
  check("with the role attached", r.ok?.roles.includes("administrator"));
  check("and the company's name and currency come with it",
    r.ok?.company.name?.includes("Altura") && r.ok?.company.baseCurrency === "MVR");

  // ---- somebody else's books -------------------------------------------

  r = await resolve(client, userId, otherCompanyId);
  check("asking for a company you are not in is refused", r.err !== null);
  check(
    "and the refusal does not confirm that company exists",
    r.err && !/not found|no such/i.test(r.err.message),
    r.err?.message
  );

  // ---- two companies, so say which --------------------------------------

  await client.query("SELECT set_config('app.company_id', $1, true)", [otherCompanyId]);
  await client.query(
    `INSERT INTO memberships (user_id, company_id, role) VALUES ($1,$2,'viewer')`,
    [userId, otherCompanyId]
  );

  r = await resolve(client, userId);
  check("belonging to two companies forces you to say which", r.err !== null, "it guessed instead");

  r = await resolve(client, userId, otherCompanyId);
  check("naming one you do belong to is accepted", r.err === null, r.err?.message);
  check(
    "and the role is the one from that company, not the other",
    r.ok?.roles.includes("viewer") && !r.ok?.roles.includes("administrator"),
    (r.ok?.roles || []).join(", ")
  );

  const viewerReq = reqFrom(r.ok);
  check("so administrator powers do not follow you across companies",
    viewerReq.can("manage_settings") === false);

  // ---- a member of nothing ----------------------------------------------

  const outsider = await resolve(client, outsiderId);
  check("somebody in no company at all is refused", outsider.err !== null);
  check("and is told what to do about it",
    outsider.err && /administrator/i.test(outsider.err.message), outsider.err?.message);

  // ---- the guard --------------------------------------------------------

  const recordErr = await guard(requireCan("record"), viewerReq);
  check("a viewer is stopped from recording", recordErr !== null);
  check(
    "and the refusal names the company it was about",
    recordErr && /Steva/i.test(recordErr.message),
    recordErr?.message
  );

  const readErr = await guard(requireCan("read"), viewerReq);
  check("while reading is allowed", readErr === null, readErr?.message);

  // An administrator in the other company is unaffected by any of this.
  const adminReq = reqFrom((await resolve(client, userId, companyId)).ok);
  const adminErr = await guard(requireCan("record"), adminReq);
  check("and the same person may still record in the company they administer",
    adminErr === null, adminErr?.message);
}

module.exports = { testIdentity };
