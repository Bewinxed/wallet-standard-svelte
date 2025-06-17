// Setup file for vitest
import { vi } from 'vitest';
import { untrack } from 'svelte';

// Mock browser APIs if needed
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Ensure Svelte's reactivity system is properly initialized
beforeEach(() => {
  // Reset any Svelte runtime state
  untrack(() => {});
});