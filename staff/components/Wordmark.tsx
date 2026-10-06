// The MAHI wordmark with the app's cyan echo behind it, as on the website and in the app.
// The one place in the portal that uses capitals and wide letter spacing: it's the brand.
export function Wordmark({ size = 'large' }: { size?: 'large' | 'small' }) {
  const text =
    size === 'large'
      ? 'text-f48 leading-l38 tracking-t10'
      : 'text-f20 leading-l22 tracking-t4';
  const echo = size === 'large' ? 'top-o4 left-o4' : 'top-o3 left-o3';
  return (
    <div role="img" aria-label="Mahi" className="relative inline-block">
      <span
        aria-hidden="true"
        className={`absolute ${echo} ${text} font-bold text-accent select-none`}
      >
        MAHI
      </span>
      <span aria-hidden="true" className={`relative ${text} font-bold text-ink-deep select-none`}>
        MAHI
      </span>
    </div>
  );
}
