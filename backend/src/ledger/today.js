/**
 * Today where the books are kept, as YYYY-MM-DD.
 *
 * A server's clock runs in UTC, five hours behind Malé: between midnight and
 * five in the morning its date is still yesterday, and on the 1st of a month
 * last month. Everything that means "today" asks here instead.
 *
 * ponytail: one zone for everyone, the Maldives. A UAE company (UTC+4) is off
 * only between 23:00 and midnight its time; pass its zone when that matters.
 */
const today = (timeZone = "Indian/Maldives") => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());

module.exports = { today };
