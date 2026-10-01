// The MAHI wordmark with the app's cyan echo behind it (AppHeader.tsx / WelcomeScreen.tsx).
// The one place on the site that uses capitals and wide letter spacing: it's the brand.
export function Wordmark() {
  return (
    <div role="img" aria-label="Mahi" className="relative inline-block">
      <span
        aria-hidden="true"
        className="absolute top-o4 left-o4 text-f48 leading-l38 font-bold tracking-t10 text-accent select-none"
      >
        MAHI
      </span>
      <span
        aria-hidden="true"
        className="relative text-f48 leading-l38 font-bold tracking-t10 text-ink-deep select-none"
      >
        MAHI
      </span>
    </div>
  );
}
