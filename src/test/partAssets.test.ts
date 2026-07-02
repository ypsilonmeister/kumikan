import { describe, expect, it } from 'vitest';
import { partDisplay, partReading } from '../ui/partAssets';

describe('partAssets', () => {
  it('resolves radical parts with reading and image (辶 → しんにょう)', () => {
    const display = partDisplay('辶');
    expect(display.label).toBe('しんにょう');
    expect(display.reading).toBe('しんにょう');
    expect(display.imageUrl).toMatch(/parts\/shinnyou\.svg$/);
  });

  it('resolves plain kanji parts without reading or image (木)', () => {
    const display = partDisplay('木');
    expect(display.label).toBe('木');
    expect(display.reading).toBeUndefined();
    expect(display.imageUrl).toBeUndefined();
  });

  it('resolves reading-only parts without an image (さんずい)', () => {
    const display = partDisplay('さんずい');
    expect(display.label).toBe('さんずい');
    expect(display.imageUrl).toBeUndefined();
  });

  it('partReading returns the reading or null', () => {
    expect(partReading('辶')).toBe('しんにょう');
    expect(partReading('木')).toBeNull();
  });
});
