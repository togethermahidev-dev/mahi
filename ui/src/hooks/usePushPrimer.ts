import { useEffect, useState } from 'react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { PUSH_PRIMER_DELAY_MS, pushPrimerPending, shouldShowPushPrimer } from '@/lib/pushPrimer';
import { usePushStore } from '@/store';
import { useCoachBlock } from '@/hooks/useCoachMarks';

export interface UsePushPrimerResult {
  /** Show the notifications page now. */
  visible: boolean;
  /** The page still has to show on this device (onboarding isn't done until it has). */
  pending: boolean;
  /** Turn on (true) or Not now (false) was tapped. Resolves once the page can close. */
  answer: (allow: boolean) => Promise<void>;
}

/**
 * The full-screen "turn on notifications" page, the last onboarding page: once per device, behind
 * `push-core`, only when the phone has not been asked yet, and only once the earlier onboarding
 * pages are out of the way (rules: src/lib/pushPrimer.ts).
 */
export function usePushPrimer(pagesBeforeSettled: boolean): UsePushPrimerResult {
  const flagOn = useFeatureFlag('push-core');
  const permission = usePushStore((s) => s.permission);
  const primerAnswered = usePushStore((s) => s.primerAnswered);
  const answer = usePushStore((s) => s.answerPrimer);

  const pending = pushPrimerPending({ flagOn, permission, primerAnswered });
  const wanted = shouldShowPushPrimer({ flagOn, permission, primerAnswered, pagesBeforeSettled });

  // No one-time tip shows while the page is on its way or up.
  useCoachBlock(wanted);

  // A beat after the last thing on screen has gone: a page can't open while another is closing.
  const [delayPassed, setDelayPassed] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    const timer = setTimeout(() => setDelayPassed(true), PUSH_PRIMER_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setDelayPassed(false);
    };
  }, [wanted]);

  return { visible: wanted && delayPassed, pending, answer };
}
