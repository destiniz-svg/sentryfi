# Payroll: the rules, where they come from, and what is still to confirm

Researched 24 September 2026. The rules live as dated data in `backend/src/ledger/payrollRules.js`, one pack per country, like the GST rates in `ledger/tax.js`. Every rate here is to be confirmed by the company's accountant before a first run is filed. The open questions are listed at the end of each country and in `to-confirm.md`.

## Maldives

| Rule | As built | Source |
|---|---|---|
| Employee withholding tax (EWT) | Monthly bands: 0% to MVR 60,000; 5.5% to 100,000; 8% to 150,000; 12% to 200,000; 15% above. Each band is taxed at its own rate. In force from 1 April 2020. | Income Tax Act 25/2019 s.54 (trade.gov.mv PDF); mira.gov.mv EWT pages |
| Pension first | The employee's own MRPS contribution comes off before EWT is worked out. The employer's share is not taxed. | ITA s.54(c); MIRA individual deductions |
| What is taxed | Salary, wages, allowances, overtime, service charge, benefits, and payments on joining or leaving. There is no payroll exemption for housing, meals or medical. | ITA s.79(u), s.12 |
| Expatriates | Taxed on the same bands, on Maldivian-source pay. | ITA s.10(c), s.11 |
| Return | MIRA 601 on MIRAconnect with the employee information sheet, by the 15th of the next month. | ITA s.58; mira.gov.mv Forms |
| Pension (MRPS) | 7% from the employee and 7% from the employer, on the basic wage in the contract. Allowances, overtime and service charge are not included. Maldivians aged 16 to 65 are in it by law; expatriates may join if the employer agrees. Paid to the Pension Office through Koshaaru by the 15th. | Pension Act 8/2009 s.14–15; pension.gov.mv; IOPS country profile 2025 |
| Minimum wage | From 1 January 2022, for Maldivians only: small business MVR 4,500, medium MVR 7,000, large MVR 8,000. Tourism always pays the medium rate. Checked as a warning, not a block. | trade.gov.mv minimum wage publication; mmtv.mv |
| Overtime | 1.25 times the hourly rate on normal days; 1.5 times on Fridays and public holidays. The hourly rate is the monthly wage over 208 hours, which is the basis of the published hourly minimum (4,500 / 208 = 21.63). | Employment Act 2/2008 s.37 |
| Deductions | Loans, advances, housing and goods need the employee's written consent, and together may be at most a third of the wage. Above that the run warns. | EA s.55(b) |
| Payslip | Gross, each deduction with its reason, and the net. | EA s.54 |
| Final pay | Everything owed, with unused annual leave, within 7 days of leaving. | EA s.57 |
| Annual leave | 30 days a year after a year's service. | EA s.39 |
| Service charge | At least 10% is charged. The employer may keep up to 1% of what was collected as an admin fee; the rest is shared equally among the staff who contribute, and last month's pool is paid by the end of this month. It is taxed, and it is not pensionable. | EA s.52; LRA Service Charge Regulation, 16 March 2021 |
| Expatriate costs | Work permit fee MVR 350 a month and quota fee MVR 2,000 a year are employer costs recorded as bills, not payroll deductions. Salaries must be paid into a bank account in the employee's name. | mira.gov.mv work permit FAQ; xpat.egov.mv |

**To confirm (Maldives):**
- The exact columns of the MIRA 601 information sheet; Sentryfi's schedule is an approximation until then.
- The annual withholding reconciliation return: its name and form.
- The Pension Office's contribution file format for Koshaaru.
- The current late-payment penalties for EWT and pension.
- How business size is defined for the minimum wage.
- Whether the service-charge bill of April 2026 has become law. It would require paying service charge in the currency collected.
- Whether the 3% remittance tax is still in force. Banks collect it, not payroll.
- How long payroll records must be kept (5 years is assumed).

## United Arab Emirates (mainland)

| Rule | As built | Source |
|---|---|---|
| Income tax | None. | — |
| Wage Protection System | Wages are due by the 1st of the next month under Ministerial Resolution 340/2026, from 1 June 2026. The salary information file (SIF) has one EDR line per person and an SCR control line. | Morgan Lewis on MR 340/2026; DIB WPS file guide; Zoho UAE academy |
| Gratuity | Set aside monthly for everyone not in a state pension: 21 days' basic a year for the first five years, then 30 days. Capped at two years' wage. | Decree-Law 33/2021 Art. 51; u.ae |
| GPSSA pension (Emiratis) | Registered from 31 October 2023: 11% employee, 15% employer, with the government paying 2.5% of the employer's share when the contribution salary is under AED 20,000. Registered earlier: 5% employee, 12.5% employer, 2.5% government. Charged on basic plus pensionable allowances, capped at AED 70,000. Due by the 15th. | Decree-Law 57/2023; gpssa.gov.ae |
| Overtime | +25%, or +50% between 10pm and 4am; +50% for work on a rest day. The hourly rate is the daily wage (monthly × 12 / 365) over 8 hours. | u.ae working hours |
| Deductions | At most 50% of the wage in total; loans at most 20%. | Decree-Law 33/2021 Art. 25 (secondary source) |
| Minimum wage | AED 6,000 for Emiratis from 1 January 2026. There is no general minimum. | MOHRE, December 2025 |
| Final pay | Within 14 days of the contract ending. | Art. 53 |

**To confirm (UAE):**
- The record order in the SIF (SCR first or last) for the company's bank.
- Whether the WPS 85% rule caps deductions.
- Whether the Nafis change of September 2026 removes the government's 2.5% share.
- Whether the daily wage for gratuity is basic ÷ 30.
- ADPF rates for Emiratis in Abu Dhabi.

## Design sources

The design research for the pay run flow drew on:
- Gusto's review-and-submit step and its approvals.
- Keka's checklist for the run.
- Zoho Payroll's pay run statuses.
- Staffology's variance report.
- Rippling's anomaly flags.
- Bayzat's WPS file and bulk adjustments.
- greytHR's loans and arrears.
- PayFit's live draft payslip.
- Xero's pay run journal.

Local Maldivian products surveyed: Fusion HR (Intek), Keplar, MiHCM, People Factor, Smart HR and Voyon Folks.
