# Maldives tax and statutory reference (Sentryfi domain notes)

**Last researched: 22 September 2026.**

This is the domain reference behind Sentryfi's Maldivian tax features: what the law actually says, where the figure comes from, and what each rule forces the ledger to store. It is written for the engineer building the GST return, the import-cost posting, the payroll run and the year-end pack — not as tax advice. Every rate, threshold and date below carries an inline link to the source it came from. Where a figure is likely to move, or where the source is a professional firm rather than the law itself, that is said in the line. Anything not verified is collected in "To confirm with a Maldivian accountant" at the end. Nothing here is invented: if a number is not in a source, it is not in this document.

Currency: MVR is the Maldivian rufiyaa. Tourism-sector taxes are generally charged and paid in US dollars; general-sector taxes in rufiyaa.

---

## 1. GST — the basics

Goods and Services Tax is charged under the [Goods and Services Tax Act (Law Number 10/2011)](https://www.mira.gov.mv/Legislations/View/Goods-And-Services-Act-consolidated) on "the value of goods and services **supplied in the Maldives**" from 2 October 2011 onwards ([MIRA, GST overview](https://www.mira.gov.mv/Pages/View/gst)). It is administered by MIRA, not Customs.

The law splits GST into two sectors ([MIRA](https://www.mira.gov.mv/Pages/View/gst)):

- **TGST (tourism goods and services)** — supplies by tourist resorts, integrated tourist resorts, tourist hotels, resort hotels, hotels, tourist guesthouses, tourist vessels, picnic islands, private islands and yacht marinas licensed by the Ministry of Tourism; dive schools, shops, spas and water-sports operations sited on a tourist establishment (excluding staff-only shops and cafés); travel agents; agents serving foreign tourist vessels; and domestic air transport sold to non-Maldivians.
- **GGST (general goods and services)** — everything else.

### Current rates

| Sector | Rate | In force from |
|---|---|---|
| General (GGST) | 8% | 1 January 2023 |
| Tourism (TGST) | 17% | 1 July 2025 |

### Full rate history

| Period | GGST | TGST |
|---|---|---|
| 1 November 2014 – 31 December 2022 | 6% | 12% |
| 1 January 2023 – 30 June 2025 | 8% | 16% |
| 1 July 2025 onwards | 8% | 17% |

Source for the whole table: [MIRA GST overview](https://www.mira.gov.mv/Pages/View/gst). The 8%/16% step came from the Sixth Amendment to the GST Act ([MIRA news, GST rate change from 1 January 2023](https://www.mira.gov.mv/ContentItems/View/newsgstratechange)); the 17% TGST came from the Seventh Amendment ([MIRA circular on the TGST rate change](https://www.mira.gov.mv/ContentItems/View/circular-issued-changes-to-tgst-rate), and [Crowe Maldives, TGST rate to increase from 1 July 2025](https://www.crowe.com/mv/insights/tgst-rate-to-increase-from-1-july-2025)). An Eighth Amendment to the GST Act has since been ratified ([CTL Strategies](https://www.ctlstrategies.com/latest/eighth-amendment-to-the-gst-act/)); its contents were not verified in this pass — see the confirm list.

Rates before 1 November 2014 (GST began at 3.5% in 2011 and moved in steps) were not verified here and are not stated.

**What this means for the ledger.** Rates must be date-effective, not a constant: every tax line needs a rate resolved from the *time of supply*, with 6/12, 8/16 and 8/17 all reachable for historical documents. Sector is a property of the supplier's registration, not of the product, so a tenant business on a resort is TGST on all of its supplies. Store the rate applied on the line, not only the rate code, so a reprint of a 2024 invoice still prints 16%.

---

## 2. Is GST charged at the point of import? — No

**Plainly: the Maldives does not charge GST at the border. GST is charged only when goods or services are supplied *in the Maldives*.** The charging language in the Act is "goods and services supplied in the Maldives" ([MIRA](https://www.mira.gov.mv/Pages/View/gst)) — importation is not itself a taxable event. What importation triggers is a *registration* obligation: a person who imports goods into the Maldives must register for GST regardless of turnover, i.e. the MVR 1 million threshold does not apply to them ([CTL Strategies, "An overview of Goods & Services Tax in the Maldives", 2021](https://www.ctlstrategies.com/wp-content/uploads/2021/04/20210404_Overview-of-GST.pdf); same rule in [Riza & Co, Maldives GST guide](https://rcolawyers.com/guides/4-maldives-goods-and-services-tax/)).

The input-tax rules confirm the design from the other side: input tax cannot be claimed "if the good or service is **not supplied in the Maldives**" ([MIRA, Input Tax](https://www.mira.gov.mv/Pages/View/gstinputtax)). A foreign supplier's invoice carries no Maldivian GST, so there is nothing to claim.

Some freight-forwarder blogs state that Maldives Customs collects GST at the border and computes it on value plus duty. That is not supported by any MIRA or Customs source found in this research, and it contradicts the Act's charging language and the input-tax rule above. Treat those pages as wrong.

**Consequences for the cost of imported goods.** Because there is no import GST:

- There is **no import GST to reclaim**. Nothing on the Customs assessment is recoverable input tax.
- Import duty, Customs charges, freight, insurance, port handling, storage and clearing-agent fees are all **part of the cost of the goods**, not tax assets. They land in inventory cost (or expense), and they push up the margin needed on resale.
- GST first appears when the importer sells onward domestically, at the full 8% (or 17%) on the selling price — with no offsetting credit for anything paid at the border. The only input tax an importer recovers is GST charged by *Maldivian* GST-registered suppliers (port charges, local haulage, agent fees billed with GST).

**What this means for the ledger.** Import cost posting must be a landed-cost routine, not a tax routine: duty and Customs fees capitalise into inventory, and the only GST-bearing lines on a clearing-agent invoice are the Maldivian services (MPL charges, agency fees), which carry 8% GGST. Never model a "reverse charge" or an "import VAT" account for goods — there is no such thing here. Guard the import workflow so a user cannot code a duty payment to an input-tax account.

---

## 3. GST registration

Registration is required within 30 days of the first of these occurring ([CTL Strategies](https://www.ctlstrategies.com/wp-content/uploads/2021/04/20210404_Overview-of-GST.pdf)):

1. the value of goods and services supplied in the past 12 months exceeded **MVR 1,000,000**;
2. the estimated value of supplies for the next 12 months exceeds **MVR 1,000,000**;
3. the person **imports goods** into the Maldives — no threshold;
4. the person carries on a **taxable activity in the tourism sector** — no threshold.

Businesses below the threshold may register **voluntarily** ([CTL Strategies](https://www.ctlstrategies.com/wp-content/uploads/2021/04/20210404_Overview-of-GST.pdf)). Registration uses [MIRA 105](https://www.mira.gov.mv/Forms/View/mira-105-GST-Registration-20.1), normally through MIRAconnect; tourism-sector and general-sector activities are registered separately ([MIRA registration guide](https://mira.gov.mv/Guides/View/gst_registration_requirements-ig)).

A "taxable activity" is a business carried on continuously or permanently supplying goods or services; employment under an employment contract is not a taxable activity ([CTL Strategies](https://www.ctlstrategies.com/wp-content/uploads/2021/04/20210404_Overview-of-GST.pdf)).

**What this means for the ledger.** The entity record needs: TIN, GST registration number(s), sector(s), registration date and taxable period. An importing client is GST-registered even at tiny turnover, so onboarding must ask "do you import?" before it asks about turnover. Two registrations means two return streams from one set of books — the chart of accounts has to keep the sectors separable.

---

## 4. Taxable, exempt and zero-rated supplies

**Standard-rated:** everything that is not zero-rated or exempt ([MIRA, How does GST work?](https://www.mira.gov.mv/Pages/View/gsthow)).

**Zero-rated** — still a taxable supply, rate 0%, input tax *is* recoverable, and a tax invoice must still be raised to another registered person ([MIRA, Zero-rated goods and services](https://www.mira.gov.mv/Pages/View/gstzerorated)). Three categories:

1. the essential goods in Schedule 1 of the GST Act (22 types): rice, sugar and flour; salt; milk; cooking oil; eggs; tea leaves; deep-sea and reef fish, fish packed in the Maldives, rihaakuru; potatoes and onions; curry-paste ingredients (cumin, fennel, coriander seed, turmeric, garlic, ginger, chilli, chilli powder, cinnamon, cardamom, peppercorn and similar); dhiyaahakuru, kaashi, kurun'baa, rukuraa and kurolhi; carrots, cabbage, beans and tomatoes; fruits; bread, buns and rusk; baby food; baby and adult diapers; cooking gas, diesel and petrol; sanitary napkins, tampons, menstrual cups and similar products;
2. goods and services **exported** from the Maldives;
3. transfer of a business as a **going concern**.

Note the traps inside category 1: kerosene, jet fuel and lubricating oils are **not** zero-rated even though cooking gas, diesel and petrol are ([MIRA](https://www.mira.gov.mv/Pages/View/gstzerorated)). Detailed conditions are in MIRA guides G807 (zero-rated goods and services) and G821 (GST food guide).

**Exempt** — outside GST, supplier charges nothing, **must not raise a tax invoice**, and **cannot recover input tax** on the related costs ([MIRA, Exempt goods and services](https://www.mira.gov.mv/Pages/View/gstexempt)): electricity, water and sewerage; postal service; education by a registered institution; health services by a registered provider; approved drugs and medical devices sold by a registered pharmacy; sale by a charity of donated goods and services; financial services; **rent from the lease of immovable property**; international transportation; goods and services exempted by another law; fines; flats, land and buildings sold under a government social-housing scheme; daycare by registered providers. Conditions are in MIRA guide G823.

Exempt and zero-rated supplies must both still be recorded and reported on the GST return ([MIRA](https://www.mira.gov.mv/Pages/View/gstexempt), [MIRA](https://www.mira.gov.mv/Pages/View/gstzerorated)).

**What this means for the ledger.** Tax codes need at least five states — standard 8%, standard 17%, zero-rated, exempt, and out-of-scope — because MIRA's own penalty ruling requires records that let the classification of each good or service be ascertained ([MIRA, Penalties for non-compliance with the GST Act and Regulation](https://www.mira.gov.mv/Legislations/View/Penalties-for-non-compliance)). Exempt is not zero: a supplier of exempt goods must be blocked from raising a *tax* invoice and from claiming the related input tax, which means input tax needs an apportionment path for mixed businesses. Property rent being exempt matters for almost every Maldivian landlord client.

---

## 5. Time of supply

GST is charged at the earlier of the issue of the tax invoice or the receipt of full or partial payment ([Riza & Co](https://rcolawyers.com/guides/4-maldives-goods-and-services-tax/)). MIRA applied exactly this test to the 1 July 2025 TGST change: the new rate applies where the time of supply — the earlier of invoice date or payment date — falls on or after that date ([MIRA circular](https://www.mira.gov.mv/ContentItems/View/circular-issued-changes-to-tgst-rate); [Crowe Maldives](https://www.crowe.com/mv/insights/tgst-rate-to-increase-from-1-july-2025)).

**What this means for the ledger.** Every taxable document carries a computed `time_of_supply = min(invoice_date, first_payment_date)`, and that field — not the posting date and not the delivery date — drives both the rate lookup and the taxable period it falls into. Deposits and prepayments trigger GST on the part paid.

---

## 6. Tax invoices

Where a registered person supplies another registered person, a tax invoice must be issued within 28 days of the customer requesting it ([MIRA, Tax invoice](https://www.mira.gov.mv/Pages/View/gsttaxinvoice)). It must show:

- the words **"Tax Invoice"**, prominently;
- name, address and **TIN of the supplier**;
- name, address and **TIN of the customer**;
- invoice number — pre-printed or software-generated;
- date of issue;
- quantity and description of the goods, or description of the services;
- value **excluding** tax;
- **tax charged**;
- total **including** tax, or a statement that the price includes tax.

A valid tax invoice is a precondition for the customer's input-tax claim ([MIRA, Input tax](https://www.mira.gov.mv/Pages/View/gstinputtax)).

**What this means for the ledger.** The invoice template is a compliance artefact: those nine fields are mandatory and the numbering must be system-generated and gapless. Customer TIN becomes a required field for B2B sales, so the contact record needs it validated at invoice time rather than at year end. Exempt supplies must render as a plain invoice with the "Tax Invoice" wording suppressed.

---

## 7. Input tax

Input tax is the GST paid to another GST-registered person on purchases made for the business, claimed on the GST return ([MIRA, Input tax](https://www.mira.gov.mv/Pages/View/gstinputtax)). It **cannot** be claimed where:

- it was incurred on goods or services obtained **before registration**;
- the good or service is **not supplied in the Maldives**;
- the claimant does **not hold a valid tax invoice** from the supplier;
- **12 months** have passed since the end of the taxable period in which it could first have been claimed;
- it was incurred for the supply of **exempt** goods and services.

Excess input tax over output tax is **not** an overpayment and is **not refunded**: it may only be set off against output tax of later taxable periods ([MIRA](https://www.mira.gov.mv/Pages/View/gstinputtax), and the same in [MIRA, How does GST work?](https://www.mira.gov.mv/Pages/View/gsthow)).

**What this means for the ledger.** A GST credit balance is a carry-forward asset with no refund path — do not model it as a receivable from MIRA. The 12-month rule needs an age check on unclaimed input tax, with a warning before it expires. Purchases without a valid tax invoice must be capable of being posted with the GST *in cost* rather than in the input-tax account, and pre-registration purchases must default that way.

---

## 8. Filing, the return and the statements

**Taxable period** ([MIRA, Taxable period](https://www.mira.gov.mv/Pages/View/gsttaxableperiod)):

- average taxable sales **over MVR 1 million per month** → monthly;
- otherwise → **quarterly**, on calendar quarters (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec), with the option to request monthly instead.

Taxable sales for this test include standard-rated and zero-rated sales.

**Deadline.** The return must be filed and the GST paid by the **28th of the month following the end of the taxable period** — so 28 April, 28 July, 28 October and 28 January for quarterly filers. If the deadline falls on a weekend or public holiday, it moves to the next working day. A return is required even if the business was inactive ([MIRA, Do I need to file a GST return?](https://www.mira.gov.mv/Pages/View/gstreturn)).

**Forms** ([MIRA, How to file a GST return](https://www.mira.gov.mv/Pages/View/gsthowto)):

- **MIRA 205** — GST return, general goods and services;
- **MIRA 206** — GST return, tourism goods and services;
- **Input Tax Statement** and **Output Tax Statement** — filed with the return; MIRA publishes separate "how to complete" guides for each.

Filing is online through MIRAconnect. Over-the-counter filing is allowed only for general-sector registrations with annual income of **MVR 5 million or less**. A nil return can be filed through VaaruPay ([MIRA](https://www.mira.gov.mv/Pages/View/gsthowto)).

Claiming input tax requires filing the input tax statement with the return ([MIRA, How does GST work?](https://www.mira.gov.mv/Pages/View/gsthow)).

**What this means for the ledger.** The GST module must emit three artefacts per period, not one: the return plus the input and output tax statements, which are transaction-level listings — so every GST line needs counterparty name, TIN, invoice number and date retained and exportable. Nil returns still have to be produced. The monthly/quarterly switch is driven by a rolling average of taxable sales, so the system should watch that average and flag when a client crosses MVR 1 million.

---

## 9. Corrections, penalties and interest

**Corrections.** MIRA operates an amended-return mechanism through MIRAconnect, but the exact statutory window and the treatment of an understated return were not verified in this pass — see the confirm list.

**Fines.** Reported by a Maldivian firm as MVR 50 per day plus 0.5% of the tax payable for late filing, and 0.05% per day of the unpaid tax for late payment ([Apex Law LLP](https://apexlaw.co/avoiding-tax-penalties-what-employees-and-employers-in-maldives-need-to-know/)). These sit under the Tax Administration Act and its Regulation ([MIRA, Tax Administration Regulation (consolidated)](https://www.mira.gov.mv/Legislations/View/Tax-Administration-Regulation-consolidated)); the primary sections were not read, so treat the exact percentages as firm-sourced rather than law-verified. MIRA publishes a [GST fine calculator](https://www.mira.gov.mv/Pages/View/gstfinecalculator) and an [income tax fine calculator](https://www.mira.gov.mv/Pages/View/ictfinecalculator).

**GST-specific penalties.** Breach of a requirement of the GST Regulation attracts a penalty of up to **MVR 2,000** unless another tax law prescribes one; failure to keep records in a way that lets the GST classification of each good or service be ascertained, and failure to rectify identified non-compliance after a MIRA visit, are each penalised at **MVR 2,000**, waived if rectified within 15 days of the notice ([MIRA, Penalties for non-compliance with the GST Act and Regulation](https://www.mira.gov.mv/Legislations/View/Penalties-for-non-compliance)). Note that this ruling's text still refers to the old 6%/12% rates, so it predates the 2023 change; the penalty amounts appear unaffected.

**Record retention.** Accounting records and supporting documents must be kept for a minimum of **five years** from the end of the taxable period, or longer if MIRA directs ([Legal 500 Maldives tax guide, 2025, by S&A Lawyers](https://www.legal500.com/guides/chapter/maldives-tax/)).

**What this means for the ledger.** Late-filing exposure is a per-day accrual, so the system should be able to compute and show it. Amendments must produce an auditable restatement of a filed period rather than silently reopening it: lock a period on filing, and require a correction document that carries the original period reference. Retention means no hard-deletes of documents inside five years.

---

## 10. Customs: duty and the border

**The law.** Imports are dutiable under the [Export Import Act of the Maldives (Law Number 31/79)](https://faolex.fao.org/docs/pdf/mdv88998.pdf), administered by [Maldives Customs Service](https://www.customs.gov.mv/). The Act is heavily amended — the 19th Amendment was ratified in 2024 ([President's Office](https://presidency.gov.mv/Press/Article/31996)) — so the duty schedule in force must always be read from the current tariff, never from memory.

**Duty base.** Ad valorem duties are levied on the **CIF value** — cost, insurance and freight ([WTO Trade Policy Review, Maldives](https://www.wto.org/english/tratop_e/tpr_e/s110-3_e.doc)). Declarations are lodged with a commercial invoice priced on FOB terms plus separate evidence of freight and insurance, from which Customs builds the CIF value ([Maldives Customs, documents required](https://www.customs.gov.mv/Business/Importers/dec-documents-required)).

**Duty types.** Duty may be **ad valorem**, **specific**, or a combination ([Export Import Act](https://faolex.fao.org/docs/pdf/mdv88998.pdf)). Ad valorem rates historically ran from 0% for essentials upward, with specific duties used for items such as cigarettes (a per-stick rate replacing an ad valorem rate in 2000) ([WTO Trade Policy Review](https://www.wto.org/english/tratop_e/tpr_e/s110-3_e.doc)). The current band structure and the top rates were not verified against the live tariff in this pass and are not stated here.

**Classification.** The tariff follows the WCO **Harmonized System**; classification and duty allocation are handled by the Valuation and Tariff Section of Maldives Customs ([US ITA, Maldives import tariffs](https://www.trade.gov/country-commercial-guides/maldives-import-tariffs)). Current rates are published in the [Maldives Customs tariff service](https://www.customs.gov.mv/eServices/tariff).

**Exemptions and concessions.** The President may grant duty-free importation of items used for an economically productive activity for up to ten years ([WTO Trade Policy Review](https://www.wto.org/english/tratop_e/tpr_e/s110-3_e.doc)); the general categories are summarised by [Riza & Co, Import duty exemptions in Maldives](https://rcolawyers.com/guides/4-import-duty-exemptions-in-maldives/). A **new policy on exemptions for economically significant activities was gazetted on 24 February 2026** by the Ministry of Economic Development and Trade, setting out how full or partial exemptions from import duty, royalties and revenue fees are granted — covering capital equipment, spares, raw materials and operational supplies for qualifying activities; boat building and vessel repair; fisheries; agricultural inputs by SMEs; activities that cut import dependence or expand exports and employment; tourism investment including renovations exceeding 25% of original value; resort development in Haa Alifu, Haa Dhaalu, Shaviyani, Thaa, Laamu and Addu; and marine fuel for bunkering by licensed Maldivian businesses. Applicants must be registered under the Business Registration Act, or be councils or state institutions ([Corporate Maldives, February 2026](https://corporatemaldives.com/govt-outlines-policy-on-import-duty-and-fee-exemptions-for-key-economic-activities/)).

**Declaration process.** The Goods Declaration is lodged electronically through the Customs portal (ASYCUDA World) by the importer or a **licensed Customs broker**, with commercial invoice, packing list, bill of lading / airway bill / courier waybill, pre-valuation form, evidence of buyer and seller costs, insurance policy where insured, proof of transport cost to the customs port, payment evidence, pro-forma invoice or purchase order, written buyer–seller agreements, certificate of origin where preferential rates are claimed, and any government permits for regulated goods ([Maldives Customs](https://www.customs.gov.mv/Business/Importers/dec-documents-required)). The general procedural rules are in the [Customs General Regulation](https://www.customs.gov.mv/d/Customs%20Regulations%20English.pdf).

**Other Customs charges.** Customs levies fees and charges beyond duty — declaration and processing, examination, overtime and similar — which can apply to a consignment even where the duty rate is 0%. The current schedule of those fees was not retrieved in this pass; see the confirm list.

**What this means for the ledger.** An import needs its own document type: HS code per line, CIF build-up (goods + freight + insurance), duty type (ad valorem or specific), duty amount, Customs fees, and a link to the declaration number. Duty must be allocable across lines to give a true landed unit cost — pro-rata on CIF value is the sane default. Exemption status belongs on the shipment, with the approval reference stored, because an exemption is audited later. And no part of this posts to a GST account (section 2).

---

## 11. Port and local charges in Malé

A clearing agent's invoice for a Malé import typically carries three families of cost.

**Maldives Ports Limited (MPL), Malé Commercial Harbour.** Rates are published in the [MPL tariff book](https://port.mv/tariff/MPL_TariffBook_2501.pdf) (the January 2025 edition was used here — MPL reissues it, so check the edition). The heads are stevedoring (ship to jetty), handling (jetty to storage), wharfage (use of berth and fixtures) and storage. Examples from that edition:

- **Stevedoring**, laden container: **USD 195.50** for a 20ft and **USD 391.00** for a 40ft, GST-exclusive (USD 211.14 and USD 422.28 with 8% GST). MPL moved stevedoring billing to US dollars from 1 April 2024 ([Corporate Maldives](https://corporatemaldives.com/mpl-switches-stevedoring-fees-to-us-dollars/)).
- **Handling** FCL: **MVR 1,722.70** for a 20ft, **MVR 3,445.40** for a 40ft, GST-exclusive.
- **Wharfage**: **MVR 1,168.98** per 20ft FCL, **MVR 2,337.95** per 40ft, GST-exclusive.
- **Storage**: **MVR 805.00** per day for a 20ft laden container, **MVR 1,610.00** for a 40ft, after a **10-day free storage period** counted from the day after the discharge date, excluding port holidays. Clear on day 10 and no storage is charged; clear on day 11 and the whole free allowance is forfeited.

Note that MPL prints every rate twice — GST-exclusive and "GST 8% inclusive" — which confirms that port services are standard-rated GGST supplies and therefore recoverable input tax for a registered importer.

**Shipping line / agent charges.** Delivery order and documentation fees are set by the carrier, not by law. Published examples for Maldives destination: a **delivery order fee of USD 25** and a **destination documentation fee of USD 50** collected from the consignee ([Maersk, Maldives import information](https://www.maersk.com/local-information/imea/maldives/import)). Carriers also charge **import demurrage and detention** on their own tariffs, which they revise — Maersk announced a Maldives import demurrage increase in August 2024 ([Maersk](https://www.maersk.com/news/articles/2024/08/29/tariff-increase-import-demurrage-charge-in-maldives)); Hapag-Lloyd and CMA CGM publish their own Maldives D&D tariffs ([Hapag-Lloyd](https://www.hapag-lloyd.com/content/dam/website/downloads/detention_demurrage/MV_MHD.pdf)). Treat all of these as per-carrier data, not constants.

**Clearing agent's own fees.** The broker's charge for lodging the declaration is commercial and additional to duty and port charges.

**What this means for the ledger.** Model a shipment as a cost container that absorbs duty, Customs fees, MPL charges, carrier fees, demurrage and agent fees, then releases them into inventory cost. MPL and local agent lines carry recoverable 8% GST; foreign carrier charges billed from abroad do not. Demurrage is the number a client will want alerting on — the free-storage clock (10 days from discharge, port holidays excluded) is worth implementing as a countdown on the shipment record, because day 11 costs the entire free period.

---

## 12. Income tax

Income tax is levied under the [Income Tax Act (Law Number 25/2019)](https://www.mira.gov.mv/Legislations/View/Incometaxact) ([English text](https://trade.gov.mv/wp-content/uploads/2023/05/income-tax-act-25-2019-en.pdf)), gazetted 17 December 2019, in force from 1 January 2020, with remuneration brought in from 1 April 2020. It replaced the Business Profit Tax and Bank Profit Tax regimes. Residents are taxed on worldwide income; non-residents and temporary residents on Maldives-source income only ([MIRA, Companies overview](https://www.mira.gov.mv/Pages/View/ictcompanies)).

**Corporate rates** ([MIRA](https://www.mira.gov.mv/Pages/View/ictcompanies)):

| Taxable income in the accounting period | Rate |
|---|---|
| Not exceeding MVR 500,000 | 0% |
| More than MVR 500,000 | 15% |

**Banks** — commercial banks licensed under the Maldives Banking Act are a separate class of taxable person and pay **25%** of total taxable income, with no 0% band ([MIRA, Banks](https://www.mira.gov.mv/Pages/View/ictbanks)).

Non-resident international transport operators are taxed at 2% of gross Maldives-source income ([Legal 500 Maldives tax guide](https://www.legal500.com/guides/chapter/maldives-tax/)).

**Tax year** — the calendar year, 1 January to 31 December ([Legal 500](https://www.legal500.com/guides/chapter/maldives-tax/)).

**Deadlines** — Section 42 of the Act ([Income Tax Act](https://trade.gov.mv/wp-content/uploads/2023/05/income-tax-act-25-2019-en.pdf)):

| Obligation | Due |
|---|---|
| First interim payment and first interim return | **31 July** of the tax year |
| Second interim payment and second interim return | **31 January** of the following year |
| Final payment and final tax return | **30 June** of the following year |

**Interim payments** are each computed from the prior year's liability (Section 43). No interim payment or interim return is required where the total interim payment would be **not more than MVR 20,000**, or where the previous year's tax was not more than MVR 20,000 (Section 49). Where a taxpayer self-estimates and the estimate proves more than 20% short, the shortfall is treated as an unpaid interim payment (Section 43).

**Deductions.** Expenditure is deductible if wholly and exclusively incurred to generate total income ([Riza & Co, Maldives income tax](https://rcolawyers.com/guides/5-maldives-income-tax/)). Specific limits in the Act ([text](https://trade.gov.mv/wp-content/uploads/2023/05/income-tax-act-25-2019-en.pdf)):

- **Head office expenses** charged to a Maldivian permanent establishment: capped at **3% of the PE's total income** from the general course of business (Section 24).
- Interest paid to non-approved lenders is capped, reported by [Legal 500](https://www.legal500.com/guides/chapter/maldives-tax/) at 6% per annum — the underlying section was not read; see the confirm list.

**Non-deductible** (Section 32): domestic or private expenditure (including maintenance of a residence, commuting, ordinary work clothing, and non-business education); capital expenditure other than as allowed; expenditure to derive exempt income under Section 12; **income tax** payable in or outside the Maldives; **input tax deductible** under the GST Act; provisions; **fines** for breach of any law; bribes; most life-insurance premiums (key-person policies excepted); partners' capital interest and distributed partnership profit; excessive compensation; employee or non-resident withholding tax deducted but not paid to MIRA; and pre-commencement expenditure.

**Capital allowances.** Accounting depreciation and amortisation are not deductible; a capital allowance under Section 25 is claimed instead ([Legal 500](https://www.legal500.com/guides/chapter/maldives-tax/)). Section 25 delegates the asset classes, valuation methods and **rates** to the Income Tax Regulation ([Act text](https://trade.gov.mv/wp-content/uploads/2023/05/income-tax-act-25-2019-en.pdf)), including balancing charges and allowances on disposal. **The rates themselves were not verified in this pass** — they live in the Regulation, not the Act. See the confirm list.

**Losses.** Business losses are carried forward for **not more than 5 years** from the end of the accounting period in which they arose, deducted oldest first, and — for an unlisted company — only if the same shareholders continuously hold more than 50% of the ordinary share capital across the period (Section 33). There is no group relief ([Legal 500](https://www.legal500.com/guides/chapter/maldives-tax/)).

**Transfer pricing.** Section 67 requires taxable income to be computed on **arm's length terms** for transactions between associates, regardless of the actual arrangement. The Maldives uses the three-tier documentation model — **master file, local file and country-by-country report** — under Section 68 and the Transfer Pricing Regulation ([MIRA, Transfer pricing](https://www.mira.gov.mv/Pages/View/Transfer_Pricing)). Advance pricing agreements and a mutual agreement procedure are available ([MIRA, APA](https://www.mira.gov.mv/Pages/View/Advance_Pricing_Agreement)).

**Thin capitalisation** (Section 71). Interest deductible is capped at the taxpayer's **interest capacity = 30% of tax-EBITDA**; disallowed interest carries forward up to **10 years**. The rule excludes banks, insurers, finance-leasing and housing-finance businesses and MMA-licensed non-bank financial institutions, micro/small/medium enterprises under Law 6/2013, and majority state-owned enterprises. Interest paid to a Maldivian licensed bank or to those licensed financial businesses is outside the cap ([Act text](https://trade.gov.mv/wp-content/uploads/2023/05/income-tax-act-25-2019-en.pdf)).

**Individuals and freelancers.** Individuals — including sole traders and freelancers earning business income — are taxed on the same banded scale ([MIRA, Individuals](https://www.mira.gov.mv/Pages/View/ictindividuals)):

| Taxable income in the accounting period | Rate |
|---|---|
| Not exceeding MVR 720,000 | 0% |
| MVR 720,001 – 1,200,000 | 5.5% |
| MVR 1,200,001 – 1,800,000 | 8% |
| MVR 1,800,001 – 2,400,000 | 12% |
| Above MVR 2,400,000 | 15% |

Individuals follow the same 31 July / 31 January / 30 June cycle. Income tax payment must be made online through MIRAconnect where annual income is **MVR 20 million or more**; below that, over-the-counter payment is allowed ([MIRA](https://www.mira.gov.mv/Pages/View/ictindividualspayment)).

**Employee withholding tax (EWT).** An employer must deduct EWT from remuneration and pay it to MIRA; "employees" here includes company directors and partners of a partnership, and remuneration includes benefits in kind. EWT began 1 April 2020. Monthly brackets ([MIRA income tax FAQ](https://www.mira.gov.mv/Pages/View/FAQ_IncomeTax)):

| Monthly remuneration | Rate |
|---|---|
| Not exceeding MVR 60,000 | 0% |
| MVR 60,001 – 100,000 | 5.5% |
| MVR 100,001 – 150,000 | 8% |
| MVR 150,001 – 200,000 | 12% |
| Above MVR 200,000 | 15% |

EWT is not a separate tax — it is income tax collected at source ([MIRA](https://www.mira.gov.mv/Pages/View/FAQ_IncomeTax)). The filing deadline for the EWT return was not verified here; see the confirm list.

**What this means for the ledger.** The tax engine needs three filing events per year, not one, with the interim amounts derived from the prior year's assessed tax and a MVR 20,000 de-minimis test. Capital allowances mean a fixed-asset register that runs a tax basis separate from the book basis, with balancing adjustments on disposal — the book depreciation number is never the tax number. Loss carry-forward needs vintage tracking with a 5-year clock and a shareholder-continuity flag for unlisted companies. Section 32 turns several common postings into add-backs the system should compute automatically: fines, income tax, input tax already claimed, unpaid withholding tax, private expenditure. Thin capitalisation needs tax-EBITDA as a derived figure and a 10-year interest carry-forward register. Payroll must run the monthly EWT bands over remuneration including benefits in kind, and include directors and partners.

---

## 13. Withholding tax on payments to non-residents

Non-resident withholding tax (NWT) is imposed by Section 55 of the Income Tax Act. The obligation to withhold and remit sits with the **payer carrying on business in the Maldives** ([MIRA, Non-resident withholding tax](https://www.mira.gov.mv/Pages/View/nwtoverview)).

| Payment to a non-resident | Rate |
|---|---|
| Rent of immovable property in the Maldives | 10% |
| Royalty | 10% |
| Interest (except to a CG-approved bank or non-bank financial institution) | 10% |
| Dividends | 10% |
| Fees for technical services | 10% |
| Commissions for services provided in the Maldives | 10% |
| Public entertainers performing in the Maldives | 10% |
| Research and development carried out in the Maldives | 10% |
| Insurance premium | 10% |
| Income received by a contractor | **5%** |

NWT is generally a **final tax** where the income is not that of a Maldivian permanent establishment. Recipients of property rent, entertainers and R&D providers may elect to file a return instead.

**When it is paid.** The NWT return **MIRA 602** must be filed and the tax paid by the **15th of the month following the month in which the payment was made** to the non-resident. The return is filed online through MIRAconnect only, and a return is due even where the income is exempt or relieved by treaty (with no payment). Payers whose functional currency is MVR prepare the return in MVR and may pay in MVR or USD; payers with another functional currency prepare and pay in USD ([MIRA](https://www.mira.gov.mv/Pages/View/nwtoverview)).

**Certificates.** The payer must give the non-resident a withholding tax certificate before **30 April** of the tax year following the one the certificate relates to; certificates are generated from MIRAconnect ([MIRA](https://www.mira.gov.mv/Pages/View/nwtoverview)).

NWT is not deducted by state offices, on payments under the National Social Health Insurance Act, or on income exempted by Section 12 ([MIRA](https://www.mira.gov.mv/Pages/View/nwtoverview)).

A separate **capital gains withholding tax at 10%** also exists ([MIRA, CGWT](https://www.mira.gov.mv/Pages/View/cgwt); [Riza & Co](https://rcolawyers.com/guides/5-maldives-income-tax/)); its mechanics were not researched here.

**What this means for the ledger.** Supplier records need a residency flag and a payment-category flag, because the rate is driven by the *nature of the payment*, not the supplier. Withholding must be computed at payment date, accrue to a liability, and drive a monthly MIRA 602 due on the 15th — a different clock from GST's 28th. Unpaid NWT that has been deducted is non-deductible for income tax (Section 32), so the system should flag deducted-but-unremitted balances at year end. Certificate generation by 30 April should be a scheduled obligation.

---

## 14. Other levies a business may meet

**Green tax.** Payable by tourists staying in resorts, integrated resorts, resort hotels, tourist hotels, hotels, guesthouses and tourist vessels. From **1 January 2025**: **USD 12 per day** for resorts, integrated resorts, resort hotels, tourist vessels, and for hotels/tourist hotels/guesthouses that are on an uninhabited island or have more than 50 registered rooms; **USD 6 per day** for hotels, tourist hotels and guesthouses on an inhabited island with 50 or fewer registered rooms. The previous rates (1 January 2023 – 31 December 2024) were USD 6 and USD 3. Children under two are exempt from 1 January 2025. The green tax return is filed and paid **monthly, by the 28th of the following month, in US dollars**, through MIRAconnect. Establishments are auto-registered when the Ministry of Tourism issues the operating licence; for foreign tourist vessels the local agent registers and files. Excess green tax collected must be refunded to the guest before the filing deadline or paid over to MIRA ([MIRA, Green tax](https://www.mira.gov.mv/Pages/View/whatisgreentax); see also the [MIRA circular on the 2025 rates](https://www.mira.gov.mv/ContentItems/View/circular-re-changes-to-grt-rates-on-20250101-news)).

**Airport taxes and fees.** Under the Airport Taxes and Fees Act. **Departure tax** and **Airport Development Fee (ADF)** both apply; the old Airport Service Charge was repealed on 31 December 2021. From **1 December 2024**, each of ADF and departure tax is charged per departing passenger at: economy **USD 12** Maldivian / **USD 50** foreign; business **USD 120**; first **USD 240**; private jet **USD 480**. Airlines collect on scheduled flights; airport operators collect for charters and private jets. Filing is on **MIRA 530**, monthly, by the **28th of the following month**, in USD. Transit passengers and diplomats are exempt; children under two are exempt from departure tax ([MIRA, Airport taxes and fees](https://www.mira.gov.mv/Pages/View/whatisairporttaxesandfees)).

**Company annual fee to the Registrar.** The old annual fee — MVR 10,000 for public and MVR 2,000 for private companies — was levied until **31 December 2023** and has been repealed. The Companies Act (Law Number 7/2023), in force from 1 January 2024, abolished the annual fee and replaced it with service fees for applications to the Registrar of Companies ([Riza & Co, Guide on the Maldives Companies Act 2023](https://rcolawyers.com/wp-content/uploads/2024/06/Guide-on-Maldives-Companies-Act-2023.pdf); [Lawrbit summary](https://www.lawrbit.com/article/company-law-of-maldives-a-recent-overview/); MIRA still documents the historical fee at [Company annual fee](https://www.mira.gov.mv/Pages/View/companyannualfee)).

**Work permit fee for expatriate staff.** **MVR 350 per employee per month**, payable by the **employer**, paid online, for a minimum of one month and up to the expiry of the passport or contract ([MIRA, Work permit fee FAQ](https://www.mira.gov.mv/Pages/View/FAQ_WorkPermitFee)). A **quota fee of MVR 2,000** is reported alongside it, with exemptions for some businesses under the current regulation ([Atoll Times](https://atolltimes.mv/post/business/9742)) — firm/press-sourced, not law-verified. Employment of expatriates is governed by the Regulation on Employment of Foreigners ([text](https://trade.gov.mv/wp-content/uploads/Regulation-on-Foreign-Employment.pdf)), and work visas moved to an e-Visa system administered through [Xpat](https://xpat.egov.mv/).

**Plastic bag fee.** MVR 2 per bag, reported effective 18 April 2023 ([Legal 500](https://www.legal500.com/guides/chapter/maldives-tax/); MIRA page: [Plastic bag fee](https://www.mira.gov.mv/Pages/View/plasticbagfee)). Retailers collect and remit it.

**Tourism land rent**, **duty free royalty**, **service charge**, **vehicle fee**, **vessel fee** and **Zakat al-Mal** are separate MIRA-administered charges with their own returns ([MIRA, Tourism land rent](https://www.mira.gov.mv/Pages/View/tourismlandrent), [Duty free royalty](https://www.mira.gov.mv/Pages/View/dutyfreeroyalty), [Service charge](https://www.mira.gov.mv/Pages/View/servicecharge), [Vehicle fee](https://www.mira.gov.mv/Pages/View/vehiclefee1), [Vessel fee](https://www.mira.gov.mv/Pages/View/vesselfee)). Tourism land rent is paid quarterly, within 30 days of quarter end ([Legal 500](https://www.legal500.com/guides/chapter/maldives-tax/)).

**Bank and financial levies.** The main one is the **25% income tax rate on banks** ([MIRA](https://www.mira.gov.mv/Pages/View/ictbanks)). A 3% **remittance tax** on money remitted abroad by expatriates was introduced in 2016 ([Edition.mv](https://edition.mv/prince_harry/728); [MIRA guide R833](https://www.mira.gov.mv/Files/GetFile/97fe5f20-4494-496d-80b3-082cbfe9f932)); its current status was not confirmed — see the confirm list.

**What this means for the ledger.** Sentryfi's calendar cannot assume one filing rhythm. GST, green tax and ATF all land on the 28th; NWT lands on the 15th; income tax lands on 31 July, 31 January and 30 June; pension on the 15th. Green tax and ATF are USD obligations computed per guest-night or per passenger — they are driven by operational counts, not by ledger values, so they need their own data feed. Per-head recurring costs (work permit fee at MVR 350 per expatriate per month) should be generated from the employee register, not keyed monthly.

---

## 15. Pension — Maldives Retirement Pension Scheme

The MRPS is a mandatory defined-contribution scheme administered by the [Maldives Pension Administration Office](https://pension.gov.mv/en/mrps). The **employee contributes 7%** of pensionable wage and the **employer contributes 7%** ([MPAO](https://pension.gov.mv/en/mrps)).

The employer handles everything administratively: enrolling employees, submitting the Statement of Pension Contribution, and paying the contributions ([MPAO, employer FAQ](https://old.pension.gov.mv/en/faq/employers)). Payment is due **before the 15th of the month following the month of the salary payment** ([MPAO](https://old.pension.gov.mv/en/faq/employers)). Employers must keep salary sheets, the Statement of Pension Contribution or other reports sent to the Pension Office, and employment contracts for at least **6 years** ([MPAO](https://old.pension.gov.mv/en/faq/employers)) — a longer retention than the five years tax law requires.

The definition of "pensionable wage" and the treatment of expatriate staff were not verified in this pass — see the confirm list.

**What this means for the ledger.** Payroll produces two employer-side obligations per month — EWT (income tax) and the 7% + 7% pension — on different bases and different deadlines. Pensionable wage is its own payroll field: do not reuse gross pay or the EWT base until the definition is confirmed. Contribution records need a six-year retention rule, which is the longest retention obligation in this document and should set the system-wide floor.

---

## 16. Bookkeeping obligations

**What to keep.** Accounting records and the documents supporting the figures declared in the returns ([Riza & Co](https://rcolawyers.com/guides/4-maldives-goods-and-services-tax/)). For GST specifically, revenue records must be kept in a way that lets the GST classification of each good or service be ascertained — exempt, out of scope, zero-rated or standard-rated — and failure to do so is penalised ([MIRA, Penalties for non-compliance with the GST Act and Regulation](https://www.mira.gov.mv/Legislations/View/Penalties-for-non-compliance)). Tax invoices must carry the nine particulars in section 6 above ([MIRA](https://www.mira.gov.mv/Pages/View/gsttaxinvoice)), and a supplier of exempt goods must not raise a tax invoice at all ([MIRA](https://www.mira.gov.mv/Pages/View/gstexempt)). A deregistering importer must submit an account of imported goods held at deregistration ([CTL Strategies](https://www.ctlstrategies.com/wp-content/uploads/2021/04/20210404_Overview-of-GST.pdf)).

**How long.** **Five years** from the end of the taxable period for tax records, or longer if MIRA directs ([Legal 500](https://www.legal500.com/guides/chapter/maldives-tax/)); **six years** for pension records ([MPAO](https://old.pension.gov.mv/en/faq/employers)).

**Currency.** Functional currency drives the return currency: for NWT, payers with an MVR functional currency file in MVR and may pay in MVR or USD, while payers with another functional currency file and pay in USD ([MIRA](https://www.mira.gov.mv/Pages/View/nwtoverview)). Green tax and airport taxes must be paid in US dollars ([MIRA](https://www.mira.gov.mv/Pages/View/whatisgreentax), [MIRA](https://www.mira.gov.mv/Pages/View/whatisairporttaxesandfees)). TGST is associated with the tourism sector's US-dollar trade ([Riza & Co](https://rcolawyers.com/guides/4-maldives-goods-and-services-tax/)).

**Language and approved standards.** MIRA publishes lists of [approved accounting standards](https://www.mira.gov.mv/Pages/View/accstandards), [recognised professional accountancy bodies](https://www.mira.gov.mv/Pages/View/professionalaccountancybodies) and [approved auditors](https://www.mira.gov.mv/Pages/View/list_of_approved_auditors). The record-keeping language requirement (Dhivehi vs English) was not verified in this pass — see the confirm list.

**What this means for the ledger.** Retention floor is six years, deletes are soft, and audit trails are immutable. Every revenue line needs a persisted GST classification, not a derived one, so a historical period can be re-proved. Multi-currency is not optional: an entity's functional currency has to be a first-class setting that decides return currency and payment currency per tax, with MVR/USD both live in the same ledger. Document storage should hold the source artefacts — tax invoices, Customs declarations, SPC submissions — linked to the transactions they support, because the supporting document is the compliance obligation, not just the posting.

---

## To confirm with a Maldivian accountant

Everything below was either not found in an authoritative source, or found only in a secondary source, during this research pass.

1. **Eighth Amendment to the GST Act** — what it changed and from when ([CTL Strategies notes its ratification](https://www.ctlstrategies.com/latest/eighth-amendment-to-the-gst-act/) but the contents were not read).
2. **GST rates before 1 November 2014** — the 2011–2014 steps are deliberately omitted.
3. **Corrections/amended returns** — the statutory window for amending a filed GST or income tax return, and whether a voluntary correction reduces the penalty.
4. **Exact fines under the Tax Administration Act** — the MVR 50/day + 0.5% filing fine and 0.05%/day payment fine are firm-sourced, not read from the Act or Regulation.
5. **Capital allowance rates and asset classes** — Section 25 delegates them to the Income Tax Regulation; the rates were not obtained.
6. **The 6% per annum cap on interest paid to non-approved lenders** — reported by Legal 500; the underlying section was not read.
7. **EWT return filing deadline and form number** — not verified.
8. **Customs fees and charges other than duty** — the current schedule (declaration, processing, examination, overtime) and which apply at a 0% duty rate.
9. **Current duty band structure and top ad valorem rates** — only historical WTO figures were found; read the live tariff.
10. **Quota fee of MVR 2,000 and its exemptions** — press-sourced only.
11. **Remittance tax (3%)** — whether it is still in force after the Income Tax Act.
12. **Pensionable wage definition** and whether expatriate employees are covered by the MRPS.
13. **Record-keeping language** — whether records may be kept in English only.
14. **Capital gains withholding tax** mechanics — rate confirmed at 10%, rules not researched.
15. **MPL tariff edition currency** — the figures here are from the January 2025 tariff book; confirm the edition in force before using them in a quote.


---

## The import cost stack, read off real documents (23 September 2026)

The owner supplied a customs assessment notice, an EMS customs declaration, a supplier's commercial invoice and a clearing agent's invoice. These are what an importing business here actually pays, in the order the papers arrive. Nothing in this section is inferred from a blog: each line was read off a document.

**From the supplier (Axis Link LLC-FZ, Dubai, INV-2512033, 31 August 2026)**
- Goods: AED 286.00, which the invoice itself also states as USD 78.14.
- VAT at 5% shown as nil — an export from the UAE is zero-rated, so there is no foreign tax to recover and nothing to add to cost.
- Terms: 60 days credit. The rate that matters for the books is the rate on the invoice date; the rate on the day it is actually paid produces an exchange difference, and with 60-day terms that gap is normal rather than exceptional.

**From the carrier (EMS / Emirates Post CN22, AWB EE617320583AE)**
- Service charge AED 216.00, and a declared value of AED 50.00 against a commercial invoice of AED 286.00. A declaration that disagrees with the invoice is a risk the product should raise, not smooth over: Customs values the goods itself, and the gap is the kind of thing that turns into a query.

**From Customs (Assessment Notice A 3494, 6 September 2026)**
- Customs valued the consignment at CIF MVR 1,392.48 — its own figure, not the invoice converted. The product must record the assessed CIF as well as the invoice, because duty and fees are computed on the assessed figure and the two rarely agree.
- Duty: nil for this commodity. **Duty-free does not mean charge-free.**
- Processing charge MVR 13.00 and non-registration processing fee MVR 130.15; total MVR 143.15.

**From the clearing agent (Real Zone LLP, INV-171-2026, cleared at MPL)**
- Form set MVR 125.00, customs process MVR 200.00, clearance and labour MVR 4,500.00, service charge 1.5% MVR 72.38; total MVR 4,897.38, no GST charged.
- This is the line item that dominates a small shipment, and it is the one nobody budgets for.

### What this means for the ledger

The cost types a Maldivian import needs, offered as a checklist on every shipment: supplier goods; foreign freight; insurance; customs duty; customs processing and revenue fees; non-registration fee where it applies; clearing agent charges (documentation, customs processing, clearance and labour, their service charge); port and storage; inland transport. All of them are the cost of the goods. None of them carries recoverable GST at the border, and clearing services may carry GST or not depending on whether the agent is registered — which the supplier record should know.

Two figures must be stored that systems usually discard: the **assessed CIF** from the notice, and the **declared value** on the carrier's declaration. Keeping them lets the product say "Customs valued this 16% above your invoice" and "your courier declared MVR 230 against an invoice of MVR 1,200", which are exactly the two questions an owner gets asked later and cannot answer.
