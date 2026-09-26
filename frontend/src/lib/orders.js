/** Where an order stands, said for buying and for selling. */
export const ORDER_STATUS = {
  awaiting_approval: { tone: "accent", buy: "Waiting for approval", sell: "Waiting for approval" },
  open: { tone: "neutral", buy: "Ordered", sell: "Ordered" },
  part_delivered: { tone: "accent", buy: "Part arrived", sell: "Part gone out" },
  delivered: { tone: "accent", buy: "Arrived, to bill", sell: "Gone out, to invoice" },
  invoiced: { tone: "accent", buy: "Billed, to arrive", sell: "Invoiced, to go out" },
  done: { tone: "success", buy: "Done", sell: "Done" },
  cancelled: { tone: "neutral", buy: "Cancelled", sell: "Cancelled" },
  quoted: { tone: "accent", buy: "Quoted", sell: "Quoted, waiting for an answer" },
  accepted: { tone: "success", buy: "Accepted", sell: "Accepted" },
  declined: { tone: "neutral", buy: "Declined", sell: "Declined" },
  expired: { tone: "neutral", buy: "Expired", sell: "Past its date" },
};

/** Where an expense claim stands. */
export const CLAIM_STATUS = {
  draft: { tone: "neutral", label: "Not sent" },
  submitted: { tone: "accent", label: "Waiting for approval" },
  approved: { tone: "accent", label: "Approved, to pay back" },
  part_paid: { tone: "accent", label: "Part paid back" },
  paid: { tone: "success", label: "Paid back" },
  rejected: { tone: "danger", label: "Not approved" },
};
