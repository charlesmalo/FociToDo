import { describe, expect, it } from 'vitest';
import { inlineRefs } from '../src/inlineRefs.js';

describe('inlineRefs', () => {
  it('replaces a nested ref, recursively', () => {
    const doc = {
      a: { $ref: '#/defs/outer' },
      defs: { outer: { inner: { $ref: '#/defs/leaf' } }, leaf: { type: 'string' } },
    };
    expect(inlineRefs(doc)).toEqual({
      a: { inner: { type: 'string' } },
      defs: { outer: { inner: { type: 'string' } }, leaf: { type: 'string' } },
    });
  });

  it('replaces a ref inside an array', () => {
    const doc = { list: [{ $ref: '#/defs/x' }, 1], defs: { x: { n: 1 } } };
    expect(inlineRefs(doc)).toMatchObject({ list: [{ n: 1 }, 1] });
  });

  it('follows a ref through an array index', () => {
    const doc = { a: { $ref: '#/list/0' }, list: [{ n: 1 }] };
    expect(inlineRefs(doc)).toMatchObject({ a: { n: 1 } });
  });

  it('keeps sibling keys, which override the referenced value', () => {
    const doc = {
      a: { $ref: '#/defs/x', description: 'mine' },
      defs: { x: { description: 'theirs', type: 'string' } },
    };
    expect(inlineRefs(doc)).toMatchObject({ a: { description: 'mine', type: 'string' } });
  });

  it('replaces a ref to a non-object value with that value', () => {
    expect(inlineRefs({ a: { $ref: '#/defs/n' }, defs: { n: 7 } })).toMatchObject({ a: 7 });
  });

  it('decodes ~1 and ~0 in pointers', () => {
    const doc = {
      a: { $ref: '#/paths/~1api~1todos/~0x' },
      paths: { '/api/todos': { '~x': { ok: true } } },
    };
    expect(inlineRefs(doc)).toMatchObject({ a: { ok: true } });
  });

  it('stops at a cycle and keeps the inner $ref', () => {
    const doc = {
      a: { $ref: '#/defs/Node' },
      defs: { Node: { next: { $ref: '#/defs/Node' }, v: 1 } },
    };
    expect(inlineRefs(doc)).toMatchObject({ a: { v: 1, next: { $ref: '#/defs/Node' } } });
  });

  it('throws on a missing target', () => {
    expect(() => inlineRefs({ a: { $ref: '#/defs/missing' } })).toThrow(
      'Unresolvable $ref: #/defs/missing',
    );
    expect(() => inlineRefs({ a: { $ref: '#/defs/x/deeper' }, defs: { x: 1 } })).toThrow(
      'Unresolvable $ref',
    );
  });

  it('leaves non-local refs untouched', () => {
    const doc = { a: { $ref: 'other.json#/x' }, b: { $ref: 5 } };
    expect(inlineRefs(doc)).toEqual(doc);
  });

  it('does not mutate its input', () => {
    const doc = { a: { $ref: '#/defs/x' }, defs: { x: { n: 1 } } };
    const copy = structuredClone(doc);
    const out = inlineRefs(doc) as { a: { n: number } };
    expect(doc).toEqual(copy);
    expect(out.a).not.toBe(doc.defs.x);
  });
});
