import { describe, expect, it } from 'vitest';
import { githubSlug, headingText, slugify } from '../src/slug.js';

describe('headingText', () => {
  it.each([
    ['## Design overview', 'Design overview'],
    ['### Create — `POST /api/todos`', 'Create — POST /api/todos'],
    ['###### Deep   ', 'Deep'],
  ])('%s → %s', (line, expected) => {
    expect(headingText(line)).toBe(expected);
  });
});

describe('slugify', () => {
  it.each([
    ['Design overview', 'design-overview'],
    ['Create — POST /api/todos', 'create-post-api-todos'],
    ['View — GET /api/todos/{id}', 'view-get-api-todos-id'],
    ['Lost update, prevented', 'lost-update-prevented'],
    ['  --Édition 2--  ', 'dition-2'],
    ['—', ''],
  ])('%s → %s', (text, expected) => {
    expect(slugify(text)).toBe(expected);
  });
});

describe('githubSlug', () => {
  it.each([
    ['Design overview', 'design-overview'],
    ['Create — POST /api/todos', 'create--post-apitodos'],
    ['View — GET /api/todos/{id}', 'view--get-apitodosid'],
    ['Lost update, prevented', 'lost-update-prevented'],
    ['snake_case Édition', 'snake_case-édition'],
  ])('%s → %s', (text, expected) => {
    expect(githubSlug(text)).toBe(expected);
  });
});
