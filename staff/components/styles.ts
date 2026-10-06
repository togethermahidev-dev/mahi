// Shared class lists, all token classes from web/app/tokens.css. Every tappable thing is at least
// 44 high (min-h-z44), the size a finger needs.

export const inputClass =
  'min-h-z44 w-full rounded-r8 border-w1 border-off-white bg-white px-s12 py-s8 text-f16 font-regular text-ink-deep';

export const buttonBase =
  'inline-flex min-h-z44 items-center justify-center gap-s6 rounded-r8 px-s16 py-s8 text-f14 font-semi-bold disabled:bg-grey999 disabled:text-white';

export const primaryButtonClass = `${buttonBase} bg-ink-deep text-white`;
export const secondaryButtonClass = `${buttonBase} border-w1 border-off-white bg-white text-ink-deep`;
export const dangerButtonClass = `${buttonBase} bg-danger-deep text-white`;

export const cardClass = 'rounded-r12 border-w1 border-off-white bg-white p-s16';

export const linkClass = 'font-semi-bold text-accent-text underline';

/** A filter chip; `on` is the chosen one (filled, and marked with a tick for more than colour). */
export function chipClass(on: boolean): string {
  return `inline-flex min-h-z44 items-center gap-s4 rounded-pill border-w1 px-s14 text-f14 font-semi-bold ${
    on ? 'border-ink-deep bg-ink-deep text-white' : 'border-off-white bg-white text-ink-deep'
  }`;
}
