import { useEffect, useState } from 'react';

/**
 * The device time, refreshed every second while `on`, so a live countdown ticks. Off, it stops
 * (nothing re-renders every second for nothing).
 */
export function useSecondTick(on: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}
