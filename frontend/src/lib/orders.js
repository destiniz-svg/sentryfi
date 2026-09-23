/** Where an order stands, said for buying and for selling. */
export const ORDER_STATUS = {
  awaiting_approval: { tone: "accent", buy: "Waiting for approval", sell: "Waiting for approval" },
  open: { tone: "neutral", buy: "Ordered", sell: "Ordered" },
  part_delivered: { tone: "accent", buy: "Part arrived", sell: "Part gone out" },
  delivered: { tone: "accent", buy: "Arrived, to bill", sell: "Gone out, to invoice" },
  done: { tone: "success", buy: "Done", sell: "Done" },
  cancelled: { tone: "neutral", buy: "Cancelled", sell: "Cancelled" },
};
