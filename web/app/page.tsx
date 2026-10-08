import { SiteFooter } from './_components/SiteFooter';
import { WaitlistForm } from './_components/WaitlistForm';
import { Wordmark } from './_components/Wordmark';

const STEPS = [
  {
    title: 'Post',
    body: 'Take a photo of your view with the back camera, then a selfie. Your first workout needs no tags. After that, you post when a friend tags you, within 48 hours.',
  },
  {
    title: 'Tag',
    body: "When you answer a tag, you pick 3 friends you're holding accountable. They've got 48 hours to post a workout back, and posting is what keeps their feed open.",
  },
  {
    title: 'Keep each other going',
    body: "Each post that answers a tag earns one Mahi point. Miss a tag and your points go back to 0, but your best stays. It's easier to turn up when your friends are counting on you.",
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
              Work out with your friends, one tag at a time.
            </h1>
            <p className="text-f17 leading-l28 text-ios-grey-dark">
              Mahi is a fitness accountability app. Start by showing up: your first workout needs no
              tags. After that, friends tag you and you&apos;ve got 48 hours to answer with any workout.
              Any workout counts: the gym, a run, a walk, a class or stretching at home. Coming to
              iPhone and Android.
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
