/**
 * What changed in Sentryfi, release by release: the one source for the
 * What's new page, the app's version, and the notification each release sends.
 *
 * Every build that goes live adds a release here, newest first, with the next
 * version: the minor number for new things (1.13), the patch number for fixes
 * alone (1.12.1). The build itself is the commit Railway deployed, so a
 * version and a build together name exactly what someone is running.
 *
 * Each item: area (where it lives), kind (new, improved or fixed), a title and
 * one or two plain sentences, and where it opens in the app.
 *
 * The bell hears about releases in a weekly round-up. Mark a release
 * `headline: true` only for something big enough to announce the day it
 * ships. An item may say `need` (a capability, or null for everyone) when
 * where it opens does not already say who it concerns.
 */
const RELEASES = [
  {
    version: "1.33.0",
    date: "2026-09-26",
    title: "Send and arrive, and stock used on a job",
    summary: "Stock sent to another place is on the way until someone there says what came. Stock used on a project or department carries its cost there.",
    items: [
      { area: "Stock", kind: "new", title: "On the way until it arrives", body: "Sending stock to another place puts it on the way. Whoever is there taps It arrived and says how many came; anything short needs a reason and is written off at average cost. Tick It's there already for a move across the yard.", href: "/stock" },
      { area: "Stock", kind: "new", title: "Use on a job", body: "Take stock out for a project or a department. It leaves at average cost, and the project or department carries that cost. Taking it from a site fills in the site's project.", href: "/stock" },
    ],
  },
  {
    version: "1.32.0",
    date: "2026-09-26",
    title: "Stock places, for real",
    summary: "Say what kind of place each one is and who looks after it, tie a site to its project, and receive bills and deliveries straight into it.",
    items: [
      { area: "Stock", kind: "new", title: "Kinds of place, and who is in charge", body: "A place can be a store, godown, outlet, site, factory or vehicle, with a person in charge. A site can belong to a project. Tap a place on the Stock page to change it.", href: "/stock" },
      { area: "Bills", kind: "new", title: "Goods come into a named place", body: "When a bill has stock on it, say where the goods came in. A delivery against a purchase order can say so too, and the bill from that order follows it.", href: "/bills" },
    ],
  },
  {
    version: "1.31.0",
    date: "2026-09-26",
    title: "Costs passed on, and repeating bills",
    summary: "Mark a cost for a customer and it waits on their next invoice, with your markup. Rent and other regular bills are drafted on their date.",
    items: [
      { area: "Sales", kind: "new", title: "Charge a cost to a customer", body: "On a bill's split or a claim's line, choose the customer it is for and a markup. Once the bill is in the books or the claim approved, the customer's next invoice offers it at cost plus markup, to add with one tap.", href: "/invoices/new" },
      { area: "Bills", kind: "new", title: "Repeating bills", body: "Rent, internet and other regular bills are drafted on their date, on their kind of cost, for you to check and put in the books.", href: "/bills" },
    ],
  },
  {
    version: "1.30.2",
    date: "2026-09-26",
    title: "A quote's lines, as quoted",
    summary: "A quote shows its lines as quoted; what was invoiced from it shows in its job.",
    items: [
      { area: "Sales", kind: "fixed", title: "A quote's lines, as quoted", body: "A quote's lines no longer show gone-out and invoiced columns at nought; what was invoiced shows in its job above them.", href: "/orders?kind=quote" },
    ],
  },
  {
    version: "1.30.1",
    date: "2026-09-26",
    title: "Invoice in parts, straight away",
    summary: "Choosing to invoice in parts instead of the whole draft opens the form with the order's figures already up to date.",
    items: [
      { area: "Sales", kind: "fixed", title: "The part form, with fresh figures", body: "After the whole draft is discarded, the form waits for the order's new figures, so what it takes and what is left show at once.", href: "/orders?kind=sale" },
    ],
  },
  {
    version: "1.30.0",
    date: "2026-09-26",
    title: "Invoice a job in parts",
    summary: "Invoice a sales order a part at a time, by percentage or amount, named for its milestone. What is left shows on the order and on its quote.",
    items: [
      { area: "Sales", kind: "new", title: "Invoice a part", body: "On a sales order, Invoice a part drafts an invoice for a percentage of the whole job or an amount, with a milestone name such as Deposit or Handover. Each part takes its share of every line, and the last takes exactly what is left.", href: "/orders?kind=sale" },
      { area: "Sales", kind: "improved", title: "What is left, on the quote", body: "A sales order shows what is left to invoice and lists its invoices. An accepted quote shows its job: invoiced so far and what is left.", href: "/orders?kind=quote" },
    ],
  },
  {
    version: "1.29.0",
    date: "2026-09-26",
    title: "An accepted quote drafts its invoice",
    summary: "When a quote is accepted, its invoice is drafted for you to check and send. Nothing goes to the customer until someone sends it.",
    items: [
      { area: "Sales", kind: "new", title: "Accepted quotes draft their invoice", body: "Accepting a quote, in the office or through the customer's link, makes its sales order and drafts the invoice with the same lines. The people who record are told, and the invoice waits for a person to check and send it.", href: "/invoices" },
      { area: "Sales", kind: "improved", title: "Invoiced, to go out", body: "A sales order invoiced before its goods leave says so, and is done once they have gone out.", href: "/orders?kind=sale" },
    ],
  },
  {
    version: "1.28.0",
    date: "2026-09-26",
    title: "Duplicate",
    summary: "Start a quote, invoice or order from one you already made: the same customer and lines, a new number, today's date.",
    items: [
      { area: "Sales", kind: "new", title: "Duplicate an invoice or quote", body: "Duplicate on any invoice, quote or sales order opens a new one filled in from it. Nothing is saved until you check it and save; the customer's reference and the dates are left for you.", href: "/invoices" },
      { area: "Buying", kind: "new", title: "Duplicate a purchase order", body: "Order the same things from the same supplier again from the order's page or its document.", href: "/orders?kind=purchase" },
    ],
  },
  {
    version: "1.27.4",
    date: "2026-09-26",
    title: "Customers always get the current page",
    summary: "A link you send now always opens the current version of the page, never an older copy kept on the customer's phone.",
    items: [
      { area: "Sales", kind: "fixed", title: "Links open the current page", body: "A customer's page, a shared document, an invitation or a password reset could open from a copy the phone kept from an earlier visit, running older code than the server, such as a quote's Accept that asked for a name before the fix. They now always load fresh.", href: "/orders?kind=quote" },
    ],
  },
  {
    version: "1.27.3",
    date: "2026-09-26",
    title: "Accepting a quote in one tap",
    summary: "On the customer's page, accepting a quote no longer waits on a name nobody asked for, and the page keeps itself up to date.",
    items: [
      { area: "Sales", kind: "fixed", title: "One tap to accept", body: "The customer's name is filled in when they accept or decline a quote, so Yes, accept it works at once. Before, the button stayed grey until a name was typed, with nothing to say so.", href: "/orders?kind=quote" },
      { area: "Sales", kind: "fixed", title: "The customer's page stays current", body: "It looks again whenever the customer comes back to it, so it never shows figures from before a change.", href: "/orders?kind=quote" },
      { area: "Sales", kind: "fixed", title: "Your GST number in the right place", body: "On the customer's page your GST number now sits under your company name, not under theirs.", href: "/orders?kind=quote" },
    ],
  },
  {
    version: "1.27.2",
    date: "2026-09-26",
    title: "Quotes answered from the link",
    summary: "A quote the customer accepts from their link shows as accepted without reloading, says who accepted it, and the customer agrees to the total on the paper.",
    items: [
      { area: "Sales", kind: "fixed", title: "The quote updates itself", body: "A quote left open while the customer answers from their link now changes to accepted or declined on its own, within a few seconds, and on coming back to the tab. Before, it kept offering Accepted and Declined until the page was reloaded.", href: "/orders?kind=quote" },
      { area: "Sales", kind: "new", title: "Who answered, and how", body: "Beside its status a quote now says who accepted or declined it, whether from the link or marked in the office, when, and the reason they gave.", href: "/orders?kind=quote" },
      { area: "Sales", kind: "fixed", title: "The customer agrees to the right total", body: "On the customer's page a quote showed its total before GST, while the quotation itself showed it with GST. Both now show the total with GST, so the figure they accept is the one on the paper.", href: "/orders?kind=quote" },
    ],
  },
  {
    version: "1.27.1",
    date: "2026-09-26",
    title: "Shortcuts in Settings, and by role",
    summary: "Change your Record shortcuts in Settings too, and an administrator decides which shortcuts each role may have.",
    items: [
      { area: "Settings", kind: "new", title: "Record shortcuts in Settings", body: "Settings, under You, has your Record shortcuts: the same list as the Edit on the Record sheet.", href: "/settings?tab=shortcuts" },
      { area: "Settings", kind: "new", title: "Which shortcuts each role gets", body: "In Settings, People, an administrator can untick a shortcut for a role, and it leaves the Record button of everyone in it. A role is only ever offered what its permissions allow.", href: "/settings?tab=people" },
      { area: "Phone", kind: "fixed", title: "Site staff can photograph bills from Record", body: "Photograph a bill and Say it now show for everyone who may put a bill in, including site staff, and Type in a bill and Claim expenses are on the sheet from the start.", href: "/dashboard" },
    ],
  },
  {
    version: "1.27",
    date: "2026-09-26",
    title: "Your own Record shortcuts",
    summary: "Choose what sits on the phone's Record button under Photograph and Say it, in your own order, and it follows you to every device.",
    items: [
      { area: "Phone", kind: "new", title: "Shortcuts you choose", body: "Tap Record, then Edit beside Shortcuts. Add a quote, a purchase order, a claim, a new customer, supplier or item, or a bill typed in, take off what you never use, and put them in your order. Photograph a bill and Say it always stay at the top.", href: "/dashboard" },
      { area: "Phone", kind: "improved", title: "Straight into the form", body: "A shortcut opens the form itself, not the list it lives in.", href: "/dashboard" },
    ],
  },
  {
    version: "1.26.2",
    date: "2026-09-26",
    title: "The conversation beside the document",
    summary: "On a wide screen an invoice and its team conversation sit side by side, so nobody scrolls past the paper to talk about it.",
    items: [
      { area: "Sales", kind: "improved", title: "Talk beside the paper", body: "On a laptop or bigger, the team conversation, questions and attachments sit to the right of any invoice, quote or order, and stay in view as you scroll the document. On a phone they stay underneath.", href: "/invoices" },
    ],
  },
  {
    version: "1.26.1",
    date: "2026-09-25",
    title: "Tax invoices MIRA accepts",
    summary: "An invoice says what it still needs to be a complete MIRA tax invoice, and always shows quantities.",
    items: [
      { area: "Sales", kind: "new", title: "What a tax invoice still needs", body: "Above a tax invoice, a note lists any of the particulars MIRA asks for that your books do not have yet: your TIN and address, and the customer's address and TIN. It is never printed.", href: "/invoices" },
      { area: "Sales", kind: "fixed", title: "Quantities always shown", body: "A design could hide the quantity column; on a tax invoice it now always shows, as MIRA requires. A customer with only a GST number on record now has it printed as their TIN.", href: "/invoices" },
    ],
  },
  {
    version: "1.26",
    date: "2026-09-25",
    title: "Each item knows its GST",
    summary: "Items are standard, zero-rated or exempt, and an invoice or bill takes its GST from the items on it.",
    items: [
      { area: "Items", kind: "new", title: "GST on every item", body: "Say whether an item is standard, zero-rated or exempt, as MIRA asks each good or service to be classed. Leave it as Not sure and it is worked out from the item's name, and marked as a suggestion until you pick one.", href: "/stock" },
      { area: "Sales", kind: "new", title: "GST follows the items", body: "Rice and flour on an invoice make it zero-rated without asking. Items of different classes on one invoice or bill are pointed out, so they go on separate ones.", href: "/invoices/new" },
      { area: "Bills", kind: "new", title: "Zero-rated and exempt bills", body: "A bill can now be recorded as zero-rated or exempt, as well as with GST included, added on top, or none.", href: "/bills" },
    ],
  },
  {
    version: "1.25.2",
    date: "2026-09-25",
    title: "Fits an unfolded phone",
    summary: "On a foldable opened out, cards no longer run off the right edge, and the tab bar stays a comfortable size.",
    items: [
      { area: "Everywhere", kind: "fixed", title: "Cards stay on the screen", body: "A long name or a wide control could push a whole card past the right edge on a foldable opened out, as on the withholding tax section. Every list and card now fits the screen it is on.", href: "/tax" },
      { area: "Everywhere", kind: "fixed", title: "A tab bar that does not stretch", body: "On a wider phone screen the bar along the bottom stays centred at thumb size instead of spreading edge to edge.", href: "/" },
    ],
  },
  {
    version: "1.25.1",
    date: "2026-09-25",
    title: "The button takes you to what is missing",
    summary: "On a new invoice, quote or order, the button that says what is missing now opens that step.",
    items: [
      { area: "Sales", kind: "fixed", title: "“Who is it for?” opens the customer list", body: "Until everything is there, the button at the top says what is missing: tap it for the customer list, then the items, then the terms. When all of it is there, it saves.", href: "/invoices/new" },
    ],
  },
  {
    version: "1.25",
    date: "2026-09-25",
    title: "Quotes, orders and bills, one question at a time",
    summary: "The way an invoice is raised now works for quotes, sales and purchase orders, and bills typed in by item.",
    items: [
      { area: "Sales", kind: "improved", title: "Quotes and sales orders, item by item", body: "Choose the customer, add products or services one after another with how many and at what price, then how long it is good for or when it goes out, then notes.", href: "/orders?kind=quote" },
      { area: "Purchases", kind: "improved", title: "Purchase orders, item by item", body: "The same steps from the supplier's side, at your usual cost, then when it should arrive.", href: "/orders?kind=purchase" },
      { area: "Purchases", kind: "new", title: "Enter a bill by its items", body: "Beside photographing it, Enter items takes the supplier, each item and its cost, how the GST was quoted, the terms and the bill number. Counted stock on it is received with the bill.", href: "/bills" },
    ],
  },
  {
    version: "1.24",
    date: "2026-09-25",
    title: "An invoice, one question at a time",
    summary: "Choose the customer, add items one by one, then GST, terms and anything else, and the invoice opens ready.",
    items: [
      { area: "Sales", kind: "new", title: "Add items one after another", body: "Pick products or services, say how many and at what rate, and the list comes back for the next. What is on it so far shows below, with its total.", href: "/invoices/new" },
      { area: "Sales", kind: "improved", title: "GST, terms, then done", body: "After the items it asks how GST is charged, when it is due, and anything else like their PO. Create invoice saves it and opens it. The number and date fill themselves.", href: "/invoices/new" },
    ],
  },
  {
    version: "1.23",
    date: "2026-09-25",
    title: "One list for bills and invoices, every step in view",
    summary: "Money on a phone now shows the same list as the Bills and Invoices pages: the subject, the number, and each next step as a button, with no swiping.",
    items: [
      { area: "Sales", kind: "improved", title: "Invoices in Money, with every step", body: "Money in, Credit note, Put in the books and Discard are on each invoice, as on the Invoices page.", href: "/money?view=invoices" },
      { area: "Purchases", kind: "improved", title: "Bills in Money, with every step", body: "Put in the books, What it was for, and the rest under ⋯, as on the Bills page.", href: "/money" },
      { area: "Sales", kind: "fixed", title: "Invoices, bills and orders back to their list", body: "The day-by-day swipe list from 1.19 is gone. These pages show the list with its buttons again, on every screen.", href: "/invoices" },
    ],
  },
  {
    version: "1.22",
    date: "2026-09-25",
    title: "Archive a bank account",
    summary: "A bank account that is closed or never used can be put away, and brought back.",
    items: [
      { area: "Bank", kind: "new", title: "Archive a bank account", body: "When nothing is left in it and no statement line is waiting, tap Archive. Its history stays in the books, and Restore brings it back from Archived.", href: "/bank" },
    ],
  },
  {
    version: "1.21",
    date: "2026-09-25",
    title: "Put a bank account right before it is used",
    summary: "A bank account with nothing recorded in it yet can be edited: its name, currency and account number.",
    items: [
      { area: "Bank", kind: "new", title: "Edit an unused bank account", body: "Opened it in the wrong currency, or mistyped the number? Until something is recorded in it, tap Edit and change it. Once it has records, it stays as it is.", href: "/bank" },
    ],
  },
  {
    version: "1.20",
    date: "2026-09-25",
    title: "Every bank account, by its number",
    summary: "Hold two or three accounts at one bank in one currency. Each has its account number, and that is what tells them apart.",
    items: [
      { area: "Bank", kind: "new", title: "Several accounts at one bank", body: "Pick the bank, the currency and the account number. It is named for you, like BML MVR ··1111, and Open and add another keeps the bank for the next one.", href: "/bank" },
      { area: "Bank", kind: "improved", title: "Add a number to an existing account", body: "An account opened before numbers were asked for says so, and takes its number in one step.", href: "/bank" },
    ],
  },
  {
    version: "1.19",
    date: "2026-09-25",
    title: "One list, everywhere you hold it",
    summary: "Invoices, bills and orders on a phone or tablet now read like Money: one card a day, and the next step a swipe away.",
    items: [
      { area: "Sales", kind: "improved", title: "Invoices by day, with a swipe", body: "On a phone or tablet, invoices run by day. Swipe one left to put it in the books, take money in, or write a credit note.", href: "/invoices" },
      { area: "Purchases", kind: "improved", title: "Bills by day, with a swipe", body: "Swipe a bill left to put it in the books, say what it was for, or void it.", href: "/bills" },
      { area: "Purchases", kind: "improved", title: "Orders and quotes by day", body: "Orders and quotes are grouped by the day they were made, newest first.", href: "/orders" },
    ],
  },
  {
    version: "1.18.1",
    date: "2026-09-25",
    title: "See what you type on a phone",
    summary: "Pop-up panels now sit above the phone keyboard, so the field you are typing in stays in view.",
    items: [
      { area: "Everywhere", kind: "fixed", title: "The keyboard no longer hides the field", body: "Choosing a customer, adding an item, searching and every other panel now moves up with the keyboard, so you can see what you write.", href: "/invoices/new" },
    ],
  },
  {
    version: "1.18",
    date: "2026-09-25",
    title: "Not on the list? Add it where you are",
    summary: "Search for an item or service that isn't there and add it on the spot. It is kept for next time, and so is any unit you write.",
    items: [
      { area: "Sales", kind: "new", title: "Add a new item or service from the invoice", body: "Type what it is. If it isn't in your items, add it with its unit and price. It goes on the line and is kept in Items for next time.", href: "/invoices/new" },
      { area: "Purchases", kind: "improved", title: "Orders search your items too", body: "Quotes and orders now search your items instead of a long dropdown, and add a missing one on the spot, with its usual cost on a purchase order.", href: "/orders" },
      { area: "Items", kind: "new", title: "Your own units", body: "Write any unit, such as dhoni load, length or m². Every unit you use on an item, invoice or order is offered next time, most used first.", href: "/stock" },
      { area: "Sales", kind: "improved", title: "Add a customer while taking an advance", body: "Money paid in advance now picks the customer from your list, and adds a new one on the spot.", href: "/advances" },
    ],
  },
  {
    version: "1.17",
    date: "2026-09-25",
    title: "New documents ask in order: who, what, which terms",
    summary: "Invoices, quotes, orders, proformas, retainers and bills open on your customer or supplier list, then what it is for, then the terms, with a note at the end.",
    items: [
      { area: "Sales", kind: "improved", title: "Choose the customer from your list", body: "A new invoice opens on your customers, searchable, with a new one added in a tap. Picking one moves you on to your items and services.", href: "/invoices/new" },
      { area: "Sales", kind: "new", title: "Payment terms in one tap", body: "On receipt, 7, 15, 30, 45 or 60 days, end of month, or a date. A customer's usual terms come already chosen; when they have none, you are asked, and can keep the answer as theirs.", href: "/invoices/new" },
      { area: "Sales", kind: "improved", title: "Quotes, orders, proformas and retainers, the same way", body: "Each asks who, then what, then its own question: how long a quote is valid, when an order is expected, or when a proforma is due.", href: "/orders" },
      { area: "Purchases", kind: "improved", title: "Bills from your supplier list, with their terms", body: "Recording a bill picks the supplier from your list, even from a scanned paper, and sets the due date from their usual terms.", href: "/bills" },
      { area: "Documents", kind: "new", title: "A note on each document", body: "A word to the customer on an invoice, proforma, retainer or order, printed above your usual notes.", href: "/invoices/new" },
    ],
  },
  {
    version: "1.16",
    date: "2026-09-25",
    title: "What's new, easier to read",
    summary: "The latest release up top, filters in two tidy rows, and every change opens with one tap.",
    items: [
      { area: "App", kind: "improved", title: "What's new, easier to read", body: "The newest release leads in its own card. Areas sit in one row you swipe sideways, and each change is a row you tap to open where it lives.", href: "/whats-new" },
    ],
  },
  {
    version: "1.15",
    date: "2026-09-25",
    title: "Settings, reorganised",
    summary: "Settings is now a short list in three groups, each with a line saying what is inside.",
    items: [
      { area: "App", kind: "improved", title: "Settings, reorganised", body: "Your company, Connections and You, each setting with an icon and a line saying what it holds. On a phone, tap one to open it and Settings to go back; on a computer, the list stays beside what you open.", href: "/settings" },
    ],
  },
  {
    version: "1.14",
    date: "2026-09-25",
    title: "Release news in a weekly round-up",
    summary: "What changed now reaches you once a week, only what concerns you, and new places are marked in the menu.",
    items: [
      { area: "App", kind: "improved", title: "A weekly round-up", body: "Instead of a note for every release, one notification each Sunday with what changed that week. Big releases still arrive the day they ship.", href: "/whats-new" },
      { area: "App", kind: "improved", title: "Only what concerns you", body: "You hear about changes your role can use: payroll news reaches those who run payroll, not everyone.", href: "/inbox" },
      { area: "App", kind: "new", title: "New in the menu", body: "A small mark beside places in the menu that changed since you last opened them.", href: "/whats-new" },
    ],
  },
  {
    version: "1.13",
    date: "2026-09-25",
    title: "What's new, and a version on every build",
    summary: "This page, with every release since the first, and a note in the bell when a new one arrives.",
    items: [
      { area: "App", kind: "new", title: "What's new", body: "Every release, searchable and filtered by area and by new, improved or fixed. What arrived since you last looked is marked.", href: "/whats-new" },
      { area: "App", kind: "new", title: "A notification for each release", body: "When a release goes live, it arrives once in the bell and on phones with notifications on, and opens here.", href: "/inbox" },
      { area: "App", kind: "new", title: "Version and build", body: "The version and the exact build you are running, at the foot of the menu and at the top of this page.", href: "/whats-new" },
    ],
  },
  {
    version: "1.12",
    date: "2026-09-25",
    title: "Returns, opening balances, discounts and bundles",
    summary: "Seven things owners of small businesses asked for, after a look at what other apps offer.",
    items: [
      { area: "Purchases", kind: "new", title: "Purchase returns", body: "Send goods or a charge back to a supplier from the bill. What you owe, the stock and the GST claimed all come down, in the bill's own shares.", href: "/bills" },
      { area: "Sales", kind: "new", title: "Opening balances", body: "What a customer owed, or you owed a supplier, before Sentryfi. It ages and is paid like any invoice or bill, and is never counted as a sale, a purchase or GST.", href: "/contacts?side=customers" },
      { area: "Sales", kind: "new", title: "Discounts before GST", body: "A discount on an invoice comes off each line before GST, and the printed invoice says so on the line.", href: "/invoices/new" },
      { area: "Sales", kind: "new", title: "Delivery in one tap", body: "Add a delivery line to an invoice without typing it.", href: "/invoices/new" },
      { area: "Sales", kind: "new", title: "Late fees", body: "Charge a late fee on an overdue invoice, on its own invoice to the customer. GST on it is chosen each time until your accountant confirms it.", href: "/invoices" },
      { area: "Documents", kind: "new", title: "Your own numbers", body: "Choose how each document's number starts (ALT/INV-, QT-, PO-). The run carries on; nothing issued is renumbered.", href: "/settings?tab=numbers" },
      { area: "Banking", kind: "new", title: "What the bank says, beside the books", body: "Each bank account shows the closing balance on its last statement beside the books on that day, and says when they agree.", href: "/bank" },
      { area: "Items", kind: "new", title: "Bundles", body: "Several items sold as one line at their own price. Each part leaves stock at its own cost when the bundle sells.", href: "/stock" },
      { area: "Items", kind: "new", title: "Item photos", body: "A small photo on each item, made small on the phone before it is sent.", href: "/stock" },
    ],
  },
  {
    version: "1.11",
    date: "2026-09-25",
    title: "Reports in one place, and cash sales in one step",
    summary: "Every report grouped by the question it answers, six new ones, and units on every document.",
    items: [
      { area: "Reports", kind: "new", title: "Reports", body: "Every report in one place: how the business did, sales, purchases and spending, tax, bank and stock.", href: "/reports" },
      { area: "Reports", kind: "new", title: "Six new reports", body: "Sales by customer, sales by item, purchases by supplier, expenses by account, payments received and payments made, over any dates, and downloadable.", href: "/reports" },
      { area: "Sales", kind: "new", title: "Paid already?", body: "Mark a new invoice paid as you make it: it goes into the books and the money is recorded against it in one step.", href: "/invoices/new" },
      { area: "Documents", kind: "improved", title: "A unit on every line", body: "Quotes, orders, proformas, retainers and repeat billing take a unit per line (pcs, day, m³, bag, trip), with the common ones offered as you type.", href: "/orders?kind=quote" },
      { area: "Reports", kind: "fixed", title: "Analytics months stay put", body: "Tapping a month on the chart keeps the chart in place and shows that month's figures.", href: "/analytics" },
    ],
  },
  {
    version: "1.10",
    date: "2026-09-25",
    title: "Customers and suppliers",
    summary: "A page for every business you deal with, from either side of the money.",
    items: [
      { area: "Sales", kind: "new", title: "Customers", body: "What each customer owes and how late, how long they take to pay, what happened with them, the people there, and WhatsApp a tap away.", href: "/contacts?side=customers" },
      { area: "Purchases", kind: "new", title: "Suppliers", body: "What you owe each supplier, their bills and payments, and a warning when a bill shows a new bank account.", href: "/contacts?side=suppliers" },
      { area: "Sales", kind: "new", title: "Merge duplicates", body: "Fold two records of one business into one. Every figure follows; nothing in the books is changed.", href: "/contacts?side=customers" },
      { area: "Documents", kind: "new", title: "Papers on customers and suppliers", body: "A trade licence, a contract, a TRN certificate, kept on their record.", href: "/contacts?side=suppliers" },
      { area: "Sales", kind: "improved", title: "Ageing as one bar", body: "What is owed, by how late, drawn as one bar on Invoices and on each customer.", href: "/invoices" },
      { area: "Documents", kind: "fixed", title: "Printing on iPhone and Safari", body: "PDFs from an iPhone, an iPad or Safari no longer lose their right edge.", href: "/invoices" },
    ],
  },
  {
    version: "1.9",
    date: "2026-09-25",
    title: "Your team, talking on the record",
    summary: "Comments, @mentions and questions on every record, and an Inbox for what is said to you.",
    items: [
      { area: "Team", kind: "new", title: "Team conversations", body: "Comments on every invoice, bill, pay run, project and more. Type @ to bring someone in.", href: "/inbox" },
      { area: "Team", kind: "new", title: "Asks", body: "Turn a comment into a question for one person, open until they reply and done when either of you says so.", href: "/inbox" },
      { area: "Team", kind: "new", title: "Inbox", body: "Mentions, asks and comments in one place, with a daily email for what you missed.", href: "/inbox" },
      { area: "Documents", kind: "new", title: "Attach while creating", body: "Add files as you write an invoice, quote, order, proforma, credit note, project or shipment.", href: "/invoices/new" },
      { area: "App", kind: "improved", title: "Opens at once", body: "The app draws straight away from what it knew last time, then checks in the background.", href: "/dashboard" },
      { area: "App", kind: "fixed", title: "Screens after an update", body: "A screen that failed to load after an update now reloads itself once.", href: "/dashboard" },
    ],
  },
  {
    version: "1.8",
    date: "2026-09-25",
    title: "Send anything, attach anything",
    summary: "Every document by link, WhatsApp or email, and papers on every record.",
    items: [
      { area: "Documents", kind: "new", title: "Send any document", body: "A link to copy, WhatsApp, share or email, for every document you make.", href: "/invoices" },
      { area: "Team", kind: "new", title: "Payslips by link", body: "Each person's payslip as a private link, sent on WhatsApp or by email.", href: "/payroll" },
      { area: "Purchases", kind: "new", title: "Suppliers confirm orders", body: "A supplier confirms a purchase order from its link, with when it will come.", href: "/orders?kind=purchase" },
      { area: "App", kind: "new", title: "Approve by link", body: "Pass anything waiting for approval to the person who approves it.", href: "/approvals" },
      { area: "Sales", kind: "new", title: "Statements and reminders by themselves", body: "A monthly statement and reminders for late invoices, sent to customers when you turn them on.", href: "/settings?tab=customers" },
      { area: "Documents", kind: "new", title: "Attachments", body: "Drawings, timesheets and specs on invoices, quotes, orders, proformas, credit notes, shipments, projects and people.", href: "/invoices" },
      { area: "Sales", kind: "new", title: "Retainers and proformas", body: "Ask for money before the work, and turn it into the tax invoice when the work is done.", href: "/advances" },
      { area: "Sales", kind: "new", title: "A customer page that answers", body: "Customers ask about an invoice and accept a quote from their own page.", href: "/invoices" },
      { area: "App", kind: "improved", title: "Menus in sections", body: "Sales, Purchases, Banking, Team, Inventory, Projects and Accounting, named the way apps name them.", href: "/dashboard" },
    ],
  },
  {
    version: "1.7",
    date: "2026-09-24",
    title: "Payroll, and items",
    summary: "Pay people in the Maldives and the UAE, and keep items that are bought or sold.",
    items: [
      { area: "Team", kind: "new", title: "Payroll", body: "Pay runs with overtime, service charge, pension, advances and gratuity, payslips, and the bank, WPS, MIRA and pension files.", href: "/payroll" },
      { area: "Items", kind: "new", title: "Products and services", body: "Items that are counted in stock or not, sold or bought or both, each with its own income and cost account.", href: "/stock" },
    ],
  },
  {
    version: "1.6",
    date: "2026-09-24",
    title: "Smoother on phones",
    summary: "Fixes and polish across the app and the website.",
    items: [
      { area: "App", kind: "improved", title: "Open bills and invoices from Money", body: "On a phone, tap a bill or an invoice under Money to open it.", href: "/money" },
      { area: "Reports", kind: "improved", title: "Analytics lines up", body: "Analytics cards line up at every screen size.", href: "/analytics" },
      { area: "App", kind: "fixed", title: "No zoom on iPhone sign-in", body: "Signing in on an iPhone no longer zooms the app wider than the screen.", href: "/dashboard" },
      { area: "Website", kind: "improved", title: "Motion on phones", body: "The website moves on phones as it does at a desk.", href: "/" },
    ],
  },
  {
    version: "1.0",
    date: "2026-09-23",
    title: "The first release",
    summary: "A complete set of books for a business in the Maldives or the UAE, on a phone first.",
    items: [
      { area: "Purchases", kind: "new", title: "Bills from a photo or a voice note", body: "Photograph a bill, check what was read, confirm. Duplicates are caught before they are paid twice.", href: "/bills" },
      { area: "Sales", kind: "new", title: "Invoices, quotes and orders", body: "Quotes that become orders and invoices, repeat billing, credit notes and receipts.", href: "/invoices" },
      { area: "Banking", kind: "new", title: "Bank and cash", body: "Bank statements imported and matched, cash tins held by named people, money moved between them.", href: "/bank" },
      { area: "Reports", kind: "new", title: "The statements and the CFO", body: "Profit and loss, balance sheet and trial balance from the ledger, and a morning brief on cash and what needs you.", href: "/cfo" },
      { area: "Reports", kind: "new", title: "GST return", body: "The MIRA return and statements, or the UAE VAT 201, from the books.", href: "/tax" },
      { area: "Items", kind: "new", title: "Stock, shipments and projects", body: "Stock at average cost, the landed cost of an import, and projects with budgets, claims and retention.", href: "/projects" },
      { area: "App", kind: "new", title: "Roles, approvals and backups", body: "Who may do what in each company, spending limits and approvals, and nightly backups proven by a restore.", href: "/settings" },
    ],
  },
];

const current = () => ({ version: RELEASES[0].version, build: (process.env.RAILWAY_GIT_COMMIT_SHA || "local").slice(0, 7), date: RELEASES[0].date });

module.exports = { RELEASES, current };
