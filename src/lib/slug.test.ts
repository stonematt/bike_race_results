/**
 * Slug generation and validation (issue #114). The properties that matter:
 * `slugify` produces the canonical shape from a real-world name, and `isSlug`
 * agrees with `SLUG_PATTERN` about what that shape is — the same shape
 * `club-config.ts` already uses for a rider or coach key.
 */

import { describe, expect, it } from 'vitest';
import { isSlug, slugify, SLUG_PATTERN } from './slug.ts';

describe('slugify', () => {
  it('lower-cases a plain name', () => {
    expect(slugify('Descenders')).toBe('descenders');
  });

  it('turns spaces into hyphens', () => {
    expect(slugify('Salem Composite Descenders')).toBe('salem-composite-descenders');
  });

  it('collapses punctuation runs into a single hyphen', () => {
    expect(slugify('JV -- Squad!!')).toBe('jv-squad');
  });

  it('strips apostrophes without leaving a stray hyphen behind', () => {
    expect(slugify("O'Brien's Squad")).toBe('o-brien-s-squad');
  });

  it('trims leading and trailing junk rather than hyphenating the edges', () => {
    expect(slugify('  !!Descenders!!  ')).toBe('descenders');
  });

  it('strips diacritics onto their base letter', () => {
    expect(slugify('Café Racers')).toBe('cafe-racers');
  });

  it('derives the empty string from an empty name', () => {
    expect(slugify('')).toBe('');
  });

  it('derives the empty string from a name with nothing sluggable in it', () => {
    expect(slugify('!!!')).toBe('');
  });

  it('collapses internal whitespace and hyphens together into one hyphen', () => {
    expect(slugify('JV  -  Squad')).toBe('jv-squad');
  });
});

describe('isSlug', () => {
  it('accepts a lower-case hyphenated slug', () => {
    expect(isSlug('descenders')).toBe(true);
    expect(isSlug('rider-a')).toBe(true);
    expect(isSlug('salem-composite-descenders')).toBe(true);
  });

  it('rejects the empty string', () => {
    expect(isSlug('')).toBe(false);
  });

  it('rejects upper-case letters', () => {
    expect(isSlug('Descenders')).toBe(false);
  });

  it('rejects a leading or trailing hyphen', () => {
    expect(isSlug('-descenders')).toBe(false);
    expect(isSlug('descenders-')).toBe(false);
  });

  it('rejects a doubled hyphen', () => {
    expect(isSlug('jv--squad')).toBe(false);
  });

  it('rejects a space or punctuation', () => {
    expect(isSlug('jv squad')).toBe(false);
    expect(isSlug("o'brien")).toBe(false);
  });

  it('is the same pattern SLUG_PATTERN exposes', () => {
    expect(isSlug('descenders')).toBe(SLUG_PATTERN.test('descenders'));
  });

  it('accepts every non-empty output slugify can produce', () => {
    const names = ['Descenders', 'Salem Composite Descenders', "O'Brien's Squad", 'Café Racers'];
    for (const name of names) {
      const slug = slugify(name);
      expect(slug).not.toBe('');
      expect(isSlug(slug)).toBe(true);
    }
  });
});
