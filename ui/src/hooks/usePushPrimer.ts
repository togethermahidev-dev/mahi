import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Camera } from 'expo-camera';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { PUSH_PRIMER_DELAY_MS, shouldShowPushPrimer } from '@/lib/pushPrimer';
import { usePushStore } from '@/store';
import { reportError } from '@/lib/sentry';

/**
 * Whether the phone's own camera question is out of the way (answered either way). The camera
 * screen asks it as soon as it opens; answering it brings the app back to the front, which is
 * when this looks again.
 */
function useCameraSettled(recheck: boolean): boolean {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      Camera.getCameraPermissionsAsync()
        .then((p) => {
          if (!cancelled) setSettled(p.status !== 'undetermined');
        })
        .catch((err) => {
          reportError(err, { flow: 'camera', action: 'getCameraPermissions', level: 'warning' });
          // Can't tell: don't hold the page back for ever.
          if (!cancelled) setSettled(true);
        });
    };
    check();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      foreground.remove();
    };
  }, [recheck]);

  return settled;
}

export interface UsePushPrimerResult {
  /** Show the notifications page now. */
  visible: boolean;
  /** One of the page's two buttons was tapped. Resolves once the page can close. */
  answer: (allow: boolean) => Promise<void>;
}

/**
 * The full-screen "turn on notifications" page: once per device, behind `push-core`, only when
 * the phone has not been asked yet, and only once the welcome cards and the phone's camera
 * question are out of the way (rules: src/lib/pushPrimer.ts).
 */
export function usePushPrimer(welcomeSettled: boolean): UsePushPrimerResult {
  const flagOn = useFeatureFlag('push-core');
  const permission = usePushStore((s) => s.permission);
  const primerAnswered = usePushStore((s) => s.primerAnswered);
  const answer = usePushStore((s) => s.answerPrimer);
  const cameraSettled = useCameraSettled(welcomeSettled);

  const wanted = shouldShowPushPrimer({
    flagOn,
    permission,
    primerAnswered,
    welcomeSettled,
    cameraSettled,
  });

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

  return { visible: wanted && delayPassed, answer };
}
