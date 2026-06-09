import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { KetcherEditorPanel } from './KetcherEditorPanel';
import { molfileToSmiles, smilesToMolfile } from './ketcherService';
import { moleculeService } from '@/services/moleculeService';

vi.mock('./ketcherService', () => ({
  smilesToMolfile: vi.fn(() => Promise.resolve('MOCK MOLFILE')),
  cleanMolfile: vi.fn((molfile) => Promise.resolve(molfile)),
  molfileToSmiles: vi.fn(() => Promise.resolve('C')),
  checkMolfile: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@/services/moleculeService', () => ({
  moleculeService: {
    analyzeWorkspace: vi.fn(() => Promise.resolve({ structure_2d: '<svg></svg>' })),
  },
}));

describe('KetcherEditorPanel', () => {
  it('shows warning alert when input is invalid', async () => {
    (smilesToMolfile as any).mockRejectedValueOnce(new Error('Invalid SMILES'));
    (moleculeService.analyzeWorkspace as any).mockRejectedValueOnce(new Error('Invalid SMILES'));

    render(<KetcherEditorPanel onCancel={() => {}} onPreviewArtifact={() => {}} smiles="" />);

    fireEvent.change(screen.getByLabelText(/SMILES/i), { target: { value: 'invalid-smiles' } });

    await waitFor(() => {
      expect(screen.getByText(/Invalid SMILES/i)).toBeInTheDocument();
    });
  });

  it('creates an edited molecule preview artifact from a valid draft', async () => {
    const onPreviewArtifact = vi.fn();
    (molfileToSmiles as any).mockResolvedValueOnce('C');

    render(<KetcherEditorPanel onCancel={() => {}} onPreviewArtifact={onPreviewArtifact} smiles="" />);

    fireEvent.change(screen.getByLabelText(/SMILES/i), { target: { value: 'C' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save preview artifact/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Save preview artifact/i }));

    expect(onPreviewArtifact).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'edited_molecule_preview',
      data: expect.objectContaining({
        molfile: 'MOCK MOLFILE',
        smiles: 'C',
        svg: '<svg></svg>',
      }),
    }));
  });
});
