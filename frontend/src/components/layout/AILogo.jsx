/**
 * The Sentryfi mark: a signal-yellow disc, an ink ring, a level line and the
 * sentry post standing on it. A sentry keeps watch; the app stands guard over
 * the books. Square-cornered world, so no shadow and no gradient.
 */
const AILogo = ({ size = 42 }) => {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ height: size + 6, width: size + 6 }}
      aria-label="Sentryfi"
    >
      <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="Sentryfi">
        <circle cx="48" cy="48" r="34" fill="#F2C300" />
        <circle cx="48" cy="48" r="34" fill="none" stroke="#141414" strokeWidth="6" />
        <path d="M17.6 58 H78.4" stroke="#141414" strokeWidth="7" />
        <path d="M48 26 V58" stroke="#141414" strokeWidth="7" />
      </svg>
    </div>
  );
};

export default AILogo;
