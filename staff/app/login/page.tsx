import { SignInForm } from './SignInForm';

// No sign-up: staff accounts are ordinary Mahi accounts added to staff_users by the owner.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-s16">
      <div className="w-full max-w-z360">
        <h1 className="text-f24 font-bold">Mahi staff</h1>
        <p className="mt-s4 text-f14 text-grey888">Sign in with your Mahi account.</p>
        {reason === 'not-staff' && (
          <p role="alert" className="mt-s16 rounded-r8 bg-surface-light p-s12 text-f14 text-danger-deep">
            You were signed out: this account isn&apos;t on the staff list.
          </p>
        )}
        <SignInForm next={next ?? ''} />
      </div>
    </main>
  );
}
