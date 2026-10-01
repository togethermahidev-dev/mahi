export function SiteFooter() {
  return (
    <footer className="border-t-w1 border-off-white">
      <div className="mx-auto flex max-w-z800 flex-col gap-s8 px-s24 py-s32 text-f14 leading-l20 text-ios-grey-dark md:flex-row md:justify-between">
        <p>© {new Date().getFullYear()} Mahi</p>
        <p>We&apos;ll only use your email to tell you when Mahi&apos;s ready.</p>
      </div>
    </footer>
  );
}
