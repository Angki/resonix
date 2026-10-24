import { describe, it, expect, vi } from 'vitest';
import { requestSeek, subscribeToSeek } from './playbackBus';

describe('playbackBus', () => {
  it('delivers seek requests to every active subscriber', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeToSeek(first);
    const unsubscribeSecond = subscribeToSeek(second);

    const handled = requestSeek(42);

    expect(handled).toBe(true);
    expect(first).toHaveBeenCalledWith(42);
    expect(second).toHaveBeenCalledWith(42);

    unsubscribeFirst();
    unsubscribeSecond();
  });

  it('stops delivering after unsubscribe', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToSeek(handler);

    unsubscribe();
    const handled = requestSeek(10);

    expect(handled).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns false when no audio engine is listening', () => {
    expect(requestSeek(5)).toBe(false);
  });
});
