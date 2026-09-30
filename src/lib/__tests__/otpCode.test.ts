import { sanitiseOtp } from '../otpCode';

describe('sanitiseOtp', () => {
  it('keeps typed digits', () => {
    expect(sanitiseOtp('123', 6)).toBe('123');
  });

  it('drops spaces, dashes and letters from a pasted or autofilled code', () => {
    expect(sanitiseOtp('123 456', 6)).toBe('123456');
    expect(sanitiseOtp('123-456', 6)).toBe('123456');
    expect(sanitiseOtp('Code: 12a3456', 6)).toBe('123456');
  });

  it('never goes past the code length', () => {
    expect(sanitiseOtp('12345678', 6)).toBe('123456');
  });

  it('is empty for nothing', () => {
    expect(sanitiseOtp('', 6)).toBe('');
    expect(sanitiseOtp('abc', 6)).toBe('');
  });
});
