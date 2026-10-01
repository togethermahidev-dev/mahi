import { SiteFooter } from './_components/SiteFooter';
import { WaitlistForm } from './_components/WaitlistForm';
import { Wordmark } from './_components/Wordmark';

const STEPS = [
  {
    title: 'Post',
    body: 'When a friend tags you, answer within 48 hours with a workout photo, taken with your front and back camera at once.',
  },
  {
    title: 'Tag',
    body: "Every post tags three friends. They've got 48 hours to answer with a workout of their own, and their feed stays locked until they do.",
  },
  {
    title: 'Keep each other going',
    body: "Every answer adds one to your streak and earns points. It's easier to turn up when your friends are counting on you.",
  },
];

export default function Home() {
  return (
    <>
      <main className="mx-auto flex max-w-z800 flex-col gap-s64 px-s24 pt-s48 pb-s64 md:gap-s80 md:pt-s80 md:pb-s96">
        <section className="grid items-center gap-s40 md:grid-cols-2 md:gap-s48">
          <div className="flex flex-col items-start gap-s24">
            <Wordmark />
            <h1 className="mt-s8 text-f32 leading-l38 font-bold text-ink-deep">
              Work out when a friend tags you, and keep each other honest.
            </h1>
            <p className="text-f17 leading-l28 text-ios-grey-dark">
              Mahi is a fitness accountability app. When a friend tags you, you&apos;ve got 48 hours
              to answer with a workout photo, and every answer adds to your streak. Coming to iPhone
              and Android.
            </p>
          </div>

          <div className="rounded-r24 border-w1 border-off-white bg-white p-s24 shadow-b12 md:p-s32">
            <h2 className="text-f22 leading-l28 font-bold text-ink-deep">Join the waitlist</h2>
            <p className="mt-s6 mb-s24 text-f15 leading-l22 text-ios-grey-dark">
              Be one of the first to try Mahi. We&apos;ll email you when it&apos;s ready.
            </p>
            <WaitlistForm />
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="flex flex-col gap-s24">
          <h2 id="how-it-works" className="text-f22 leading-l28 font-bold text-ink-deep">
            How it works
          </h2>
          <ol className="grid gap-s16 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-s12 rounded-r20 bg-surface-light p-s20">
                <span
                  aria-hidden="true"
                  className="flex size-z32 items-center justify-center rounded-pill bg-ink-deep text-f15 leading-l20 font-bold text-white"
                >
                  {i + 1}
                </span>
                <h3 className="text-f18 leading-l24 font-semi-bold text-ink-deep">{step.title}</h3>
                <p className="text-f15 leading-l22 text-ios-grey-dark">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
