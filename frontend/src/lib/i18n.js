import { useSyncExternalStore } from "react";
import { loadFont, THAANA } from "@/lib/documents";

/**
 * The language a person reads the app in: English, or Dhivehi.
 *
 * Dhivehi is written in Thaana, right to left. Choosing it turns the page
 * round (html dir="rtl"): the rail, rows and arrows mirror, the Thaana face
 * leads, and every figure stays left to right (index.css, "Numbers never
 * move"). Words are looked up by their English, so a screen not yet
 * translated reads in English rather than breaking.
 *
 * The Dhivehi here is a first draft, to be read and corrected by someone who
 * writes Dhivehi every day before anyone relies on it.
 */

const KEY = "sentryfi.lang";
const listeners = new Set();

function read() {
  try {
    return localStorage.getItem(KEY) === "dv" ? "dv" : "en";
  } catch {
    return "en";
  }
}

let lang = read();

function apply(l) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = l === "dv" ? "dv" : "en";
  document.documentElement.dir = l === "dv" ? "rtl" : "ltr";
  if (l === "dv") loadFont(THAANA);
}
apply(lang);

export function setLang(l) {
  lang = l === "dv" ? "dv" : "en";
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* remembered for this visit only */
  }
  apply(lang);
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** A suggested Dhivehi word or phrase for each English one the app uses. */
const DV = {
  // the rail and the tab bar
  "Needs you": "ކުރަންޖެހޭ ކަންތައް",
  "What needs you": "ކުރަންޖެހޭ ކަންތައް",
  "The CFO": "ސީ.އެފް.އޯ",
  Figures: "އަދަދުތައް",
  Approvals: "ހުއްދަތައް",
  Inbox: "ލިބުނު މެސެޖުތައް",
  Customers: "ކަސްޓަމަރުން",
  "What's new": "އާ ކަންތައްތައް",
  Suppliers: "ސަޕްލަޔަރުން",
  "Buying and selling": "ގަތުމާއި ވިއްކުން",
  Invoices: "އިންވޮއިސްތައް",
  Bills: "ބިލުތައް",
  "Orders and quotes": "އޯޑަރުތަކާއި ކޯޓޭޝަންތައް",
  Payments: "ފައިސާ ދެއްކުން",
  "Expense claims": "ޚަރަދުގެ ކްލެއިމްތައް",
  Money: "ފައިސާ",
  "Bank and cash": "ބޭންކާއި ނަގުދު",
  Loans: "ލޯނުތައް",
  "Work and assets": "މަސައްކަތާއި މުދާ",
  Projects: "ޕްރޮޖެކްޓްތައް",
  Stock: "ސްޓޮކް",
  Shipments: "ޝިޕްމަންޓްތައް",
  "Fixed assets": "ދާއިމީ މުދާ",
  "The books": "ހިސާބު ފޮތްތައް",
  Statements: "ބަޔާންތައް",
  "GST return": "ޖީ.އެސް.ޓީ ރިޓަރން",
  Closing: "ބަންދުކުރުން",
  Company: "ކުންފުނި",
  "Branding and documents": "ބްރޭންޑާއި ލިޔެކިޔުން",
  "Bring history in": "ކުރީގެ ހިސާބު ގެނައުން",
  Settings: "ސެޓިންގްސް",
  "Sign out": "ނިކުމެވުން",
  Home: "ހޯމް",
  // the rail's sections and places (25 September 2026), drafts for a Dhivehi writer to check
  CFO: "ސީ.އެފް.އޯ",
  Analytics: "އެނަލިޓިކްސް",
  Sales: "ވިއްކުން",
  Quotes: "ކޯޓޭޝަންތައް",
  "Advance billing": "ކުރިން ނަގާ ފައިސާ",
  "Sales orders": "ސޭލްސް އޯޑަރުތައް",
  Purchases: "ގަތުން",
  "Purchase orders": "ޕަރޗޭސް އޯޑަރުތައް",
  Banking: "ބޭންކިންގ",
  "Bank & cash": "ބޭންކާއި ނަގުދު",
  Team: "ޓީމް",
  Payroll: "މުސާރަ",
  "My payslips": "އަހަރެންގެ މުސާރަ ސްލިޕް",
  Inventory: "ސްޓޮކް",
  Items: "އައިޓަމްތައް",
  Accounting: "ހިސާބު",
  Reports: "ރިޕޯޓުތައް",
  "All companies": "ހުރިހާ ކުންފުނިތައް",
  Branding: "ބްރޭންޑިންގ",
  "Import history": "ކުރީގެ ހިސާބު ގެނައުން",
  Record: "ލިޔުން",
  Bank: "ބޭންކް",
  More: "އިތުރު",
  // the greeting
  "Good morning": "ބާއްޖަވެރި ހެނދުނެއް",
  "Good afternoon": "ބާއްޖަވެރި މެންދުރެއް",
  "Good evening": "ބާއްޖަވެރި ހަވީރެއް",
  // Home
  "Cash and bank now": "މިހާރު ބޭންކާއި ނަގުދު",
  "It lasts": "ދެމިހުންނާނީ",
  "Owed to you": "ތިބާއަށް ލިބެންޖެހޭ",
  "You owe suppliers": "ސަޕްލަޔަރުންނަށް ދައްކަންޖެހޭ",
  "Spent this month": "މިމަހު ހޭދަކުރި",
  "GST to set aside": "ވަކިކޮށްބަހައްޓަންޖެހޭ ޖީ.އެސް.ޓީ",
  "Money out": "ބޭރަށް ދިޔަ ފައިސާ",
  "Where the cash is": "ނަގުދު ހުރި ތަންތަން",
  "Getting your books going": "ހިސާބު ފޮތްތައް ފެށުން",
  // More
  "The books ": "ހިސާބު ފޮތްތައް",
  "The company": "ކުންފުނި",
  You: "ތިބާ",
  Notifications: "ނޯޓިފިކޭޝަންތައް",
  Language: "ބަސް",
  Night: "ރޭގަނޑު",
  "Your assistant": "ތިބާގެ އެސިސްޓެންޓް",
};

/** The word in the reader's language; English where there is none yet. */
export const translate = (english, l = lang) => (l === "dv" && DV[english]) || english;

/** Re-renders when the language changes. */
export function useT() {
  const current = useSyncExternalStore(subscribe, () => lang, () => "en");
  return { lang: current, t: (s) => translate(s, current), setLang };
}
