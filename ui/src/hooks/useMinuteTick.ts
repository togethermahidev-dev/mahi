import { useEffect, useState } from 'react';

/** The device time, refreshed every minute, so countdown text re-renders on its own. */
export function useMinuteTick(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
