import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @anthropic-ai/sdk before importing the module under test
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}));

describe('ClaudeClient singleton', () => {
  // Re-import module fresh for each test to reset the module-level singleton
  beforeEach(() => {
    vi.resetModules();
  });

  it('getSharedClaudeClient returns the same instance on repeated calls', async () => {
    const { getSharedClaudeClient } = await import('./index.js');
    const a = getSharedClaudeClient();
    const b = getSharedClaudeClient();
    expect(a).toBe(b);
  });

  it('getSharedClaudeClient reads ANTHROPIC_API_KEY from env on first call', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    process.env['ANTHROPIC_API_KEY'] = 'test-key-123';
    delete process.env['CLAUDE_API_KEY'];

    const { getSharedClaudeClient } = await import('./index.js');
    getSharedClaudeClient();

    expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'test-key-123' }));
  });

  it('getSharedClaudeClient falls back to CLAUDE_API_KEY when ANTHROPIC_API_KEY is absent', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    delete process.env['ANTHROPIC_API_KEY'];
    process.env['CLAUDE_API_KEY'] = 'fallback-key';

    const { getSharedClaudeClient } = await import('./index.js');
    getSharedClaudeClient();

    expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'fallback-key' }));
  });

  it('getSharedClaudeClient returns a different instance from createClaudeClient', async () => {
    const { getSharedClaudeClient, createClaudeClient } = await import('./index.js');
    const shared = getSharedClaudeClient();
    const oneOff = createClaudeClient({ apiKey: 'x' });
    expect(shared).not.toBe(oneOff);
  });

  it('createPipeline returns a new ContentPipeline each call (fresh per-job state)', async () => {
    const { createPipeline } = await import('../pipeline/index.js');
    const p1 = createPipeline();
    const p2 = createPipeline();
    expect(p1).not.toBe(p2);
  });

  it('createPipeline does not throw when called without config', async () => {
    const { createPipeline } = await import('../pipeline/index.js');
    expect(() => createPipeline()).not.toThrow();
  });
});
