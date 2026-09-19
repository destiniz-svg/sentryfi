import Link from 'next/link';

const mark = (
  <svg width="44" height="44" viewBox="0 0 96 96" role="img" aria-label="Sentryfi">
    <circle cx="48" cy="48" r="34" fill="#F2C300" />
    <circle cx="48" cy="48" r="34" fill="none" stroke="#141414" strokeWidth="6" />
    <path d="M17.6 58 H78.4" stroke="#141414" strokeWidth="7" />
    <path d="M48 26 V58" stroke="#141414" strokeWidth="7" />
  </svg>
);

const surfaces = [
  {
    href: '/design/phone.html',
    kicker: 'Phone',
    title: 'Expense dashboard and capture',
    body:
      'Forty-five screens. Snap a bill, check what was read, confirm. Site cash boxes: what is left, ' +
      'spending with and without a bill, counting the box.',
  },
  {
    href: '/design/desktop.html',
    kicker: 'Desktop',
    title: 'The accounting suite',
    body:
      'The GST return with the checks that run before you file, and the accountant journal behind ' +
      'the plain words the phone shows.',
  },
];

export default function Home() {
  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="on-yellow"
        style={{
          background: 'var(--signal)',
          color: '#141414',
          padding: '28px 24px 26px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {mark}
          <span style={{ font: "600 30px/1 var(--body)", letterSpacing: '-0.03em' }}>Sentryfi</span>
        </div>
        <h1
          style={{
            margin: 0,
            font: "700 clamp(38px, 9vw, 68px)/0.96 var(--display)",
            textTransform: 'uppercase',
            maxWidth: '14ch',
          }}
        >
          Snap it. Record it. Done.
        </h1>
        <p style={{ margin: 0, font: "500 17px/1.45 var(--body)", maxWidth: '46ch' }}>
          A Maldives-native finance app for Altura Pvt Ltd. Photograph a bill, check what was read,
          confirm. A correct double-entry ledger keeps the books right without anyone reading the
          word debit.
        </p>
      </header>

      <section
        className="on-ink"
        style={{
          background: '#141414',
          color: '#FFFFFF',
          padding: '12px 24px',
          font: "500 15px/1.4 var(--body)",
        }}
      >
        Being built in the open. Nothing here records real money yet.
      </section>

      <section style={{ padding: '26px 24px 8px', flexGrow: 1 }}>
        <h2
          style={{
            margin: '0 0 4px',
            font: "700 14px var(--display)",
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--concrete)',
          }}
        >
          The design so far
        </h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: 760 }}>
          {surfaces.map((s) => (
            <li key={s.href} style={{ borderTop: '1px solid var(--hairline)' }}>
              <Link
                href={s.href}
                prefetch={false}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 16,
                  alignItems: 'center',
                  padding: '20px 0',
                  textDecoration: 'none',
                }}
              >
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span
                    style={{
                      font: "700 12px var(--display)",
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--concrete)',
                    }}
                  >
                    {s.kicker}
                  </span>
                  <span style={{ font: "600 20px var(--body)" }}>{s.title}</span>
                  <span style={{ font: "400 15px/1.45 var(--body)", color: 'var(--concrete)' }}>
                    {s.body}
                  </span>
                </span>
                <span aria-hidden="true" style={{ flexShrink: 0, display: 'flex' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p
          style={{
            font: "400 14px/1.45 var(--body)",
            color: 'var(--concrete)',
            borderTop: '1px solid var(--hairline)',
            paddingTop: 16,
            maxWidth: '62ch',
          }}
        >
          Every figure in those screens is illustrative. They are rendered from the prototype&apos;s
          own markup and logic, so what you see is what it draws.
        </p>
      </section>

      <footer
        style={{
          padding: '16px 24px 26px',
          borderTop: '2px solid var(--ink)',
          font: "700 12px var(--display)",
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--concrete)',
        }}
      >
        Altura Pvt Ltd · Male&apos;, Maldives
      </footer>
    </main>
  );
}
