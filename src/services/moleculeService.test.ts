import { describe, expect, it, vi } from 'vitest';

import { moleculeService } from './moleculeService';

describe('moleculeService backend fallback mode', () => {
  it('tries the MolVis API backend by default and falls back to local analysis when unavailable', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('backend offline'));

    const result = await moleculeService.analyzeWorkspace({ smiles: 'COc1cc(C=O)ccc1O' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/analyze',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.smiles).toBe('COc1cc(C=O)ccc1O');
    expect(result.source).toBe('local fallback');
    expect(result.source_error).toBe('backend offline');

    fetchSpy.mockRestore();
  });

  it('uses parsed OpenSMILES atoms for local highlight matching', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('backend offline'));

    const result = await moleculeService.highlightSubstructure('CCc1c[nH]c2ccc(OC)cc12', '[nH]');

    expect(result.source).toBe('local fallback');
    expect(result.num_matches).toBeGreaterThan(0);

    fetchSpy.mockRestore();
  });
});
