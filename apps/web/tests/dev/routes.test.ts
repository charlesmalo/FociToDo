import { describe, expect, it } from 'vitest';
import { DECISIONS_INDEX, TABS, routeFromHash } from '../../src/dev/routes';

describe('routeFromHash', () => {
  it('defaults to the overview', () => {
    expect(routeFromHash('')).toEqual({ tab: 'overview', path: 'README.md' });
    expect(routeFromHash('#nonsense')).toEqual({ tab: 'overview', path: 'README.md' });
  });

  it.each(TABS.map((tab) => [tab.id, tab.path]))('selects the %s tab', (id, path) => {
    expect(routeFromHash(`#${id}`)).toEqual({ tab: id, path });
  });

  it('opens a single decision record', () => {
    expect(routeFromHash('#decisions/0004-optimistic-locking-with-etags')).toEqual({
      tab: 'decisions',
      path: 'docs/decisions/0004-optimistic-locking-with-etags.md',
    });
  });

  it('decodes the hash', () => {
    expect(routeFromHash('#%61pi')).toEqual({ tab: 'api', path: 'docs/api.md' });
  });

  it('falls back to the overview for a malformed hash', () => {
    expect(routeFromHash('#%E0%A4%A')).toEqual({ tab: 'overview', path: 'README.md' });
  });

  it('points the decisions tab at the index', () => {
    expect(routeFromHash('#decisions').path).toBe(DECISIONS_INDEX);
  });
});
