import { describe, expect, it } from 'vitest';
import { ambientForHour } from '@/lib/ambient';

describe('ambientForHour', () => {
  it('usa o tom mais frio na madrugada', () => {
    expect(ambientForHour(0, false).top).toContain('hsl(258');
  });

  it('usa o tom mais quente ao meio-dia', () => {
    expect(ambientForHour(12, false).top).toContain('hsl(318');
  });

  it('volta ao tom frio à meia-noite seguinte', () => {
    expect(ambientForHour(0, false).top).toBe(ambientForHour(24, false).top);
  });

  it('intensifica a opacidade durante o foco', () => {
    const normal = ambientForHour(12, false);
    const focusing = ambientForHour(12, true);
    expect(focusing.top).not.toBe(normal.top);
    expect(focusing.top).toContain('0.22');
  });

  it('produz cores hsl válidas em qualquer hora', () => {
    for (let h = 0; h < 24; h += 1) {
      const { top, bottom } = ambientForHour(h, false);
      expect(top).toMatch(/^hsl\(\d+ \d+% \d+% \/ [\d.]+\)$/);
      expect(bottom).toMatch(/^hsl\(\d+ \d+% \d+% \/ [\d.]+\)$/);
    }
  });
});
