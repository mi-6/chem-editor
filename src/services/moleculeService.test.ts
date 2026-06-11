import { describe, expect, it, vi } from 'vitest';

import { moleculeService } from './moleculeService';

describe('moleculeService standalone mode', () => {
  it('does not call localhost backend unless VITE_CHEM_API_BASE_URL is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await moleculeService.analyzeWorkspace({ smiles: 'COc1cc(C=O)ccc1O' });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.smiles).toBe('COc1cc(C=O)ccc1O');

    fetchSpy.mockRestore();
  });

  it('uses parsed OpenSMILES atoms for local highlight matching', async () => {
    const result = await moleculeService.highlightSubstructure('CCc1c[nH]c2ccc(OC)cc12', '[nH]');

    expect(result.source).toBe('local fallback');
    expect(result.num_matches).toBeGreaterThan(0);
  });
});
