import { describe, expect, it } from 'vitest';
import { AVAILABLE_COMMANDS, autocomplete } from './autcomplete.js';

describe('autocomplete', () => {
  it('returns null for empty input', () => {
    expect(autocomplete('')).toBeNull();
  });

  it('completes unique prefix to full command', () => {
    expect(autocomplete('/ini')).toBe('/init');
  });

  it('completes "ch" to "check"', () => {
    expect(autocomplete('/ch')).toBe('/check');
  });

  it('returns common prefix for multiple matches', () => {
    const result = autocomplete('/task');
    expect(result).toBe('/task ');
  });

  it('returns null when input already matches a command exactly', () => {
    const result = autocomplete('/init');
    expect(result).toBeNull();
  });

  it('completes multi-word commands', () => {
    const result = autocomplete('/task cr');
    expect(result).toBe('/task create');
  });

  it('completes bug subcommands', () => {
    const result = autocomplete('/bug li');
    expect(result).toBe('/bug list');
  });

  it('returns null for no matching commands', () => {
    const result = autocomplete('/xyz');
    expect(result).toBeNull();
  });

  it('completes context subcommands', () => {
    const result = autocomplete('/context b');
    expect(result).toBe('/context build');
  });

  it('completes regression subcommands', () => {
    const result = autocomplete('/regression r');
    expect(result).toBe('/regression run');
  });
});

describe('AVAILABLE_COMMANDS', () => {
  it('contains all expected top-level commands', () => {
    const topLevel = [...new Set(AVAILABLE_COMMANDS.map((c) => c.split(' ')[0]))];
    expect(topLevel).toContain('/init');
    expect(topLevel).toContain('/scan');
    expect(topLevel).toContain('/check');
    expect(topLevel).toContain('/task');
    expect(topLevel).toContain('/bug');
    expect(topLevel).toContain('/adr');
    expect(topLevel).toContain('/context');
    expect(topLevel).toContain('/brief');
    expect(topLevel).toContain('/regression');
    expect(topLevel).toContain('/help');
    expect(topLevel).toContain('/clear');
    expect(topLevel).toContain('/exit');
  });
});
