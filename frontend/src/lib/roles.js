/** What each role is called, and what it may do, in plain words. */
export const ROLE_TEXT = {
  administrator: { label: "Owner / administrator", does: "Everything, including people and settings" },
  accountant: { label: "Accountant", does: "Keeps and closes the books, approves, runs petty cash" },
  manager: { label: "Manager", does: "Records bills and invoices, reads the figures" },
  approver: { label: "Approver", does: "Approves what others record" },
  viewer: { label: "Viewer", does: "Reads the figures, changes nothing" },
  auditor: { label: "Auditor", does: "Reads everything, including the trail" },
  site_staff: { label: "Site staff", does: "Photographs bills and runs the cash tin handed to them" },
  cash_holder: { label: "Cash holder", does: "Runs the cash tin handed to them, nothing else" },
  procurement: { label: "Procurement", does: "Orders and receives" },
};
