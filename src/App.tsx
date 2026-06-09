import { useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';

import { StructureEvidenceEditor } from '../client/StructureEvidenceEditor';
import type { StructurePayload } from '../client/StructureEditorPanel';
import type { AtomContributionPropertyName } from './features/workspace/types';

const propertyLabels: Record<AtomContributionPropertyName, string> = {
  hba: 'HBA',
  hbd: 'HBD',
  logp: 'LogP',
  molecular_weight: 'Weight',
  tpsa: 'tPSA',
};

export function App() {
  const [smiles, setSmiles] = useState('CCO');
  const [status, setStatus] = useState('Ready');
  const [shapProperty, setShapProperty] = useState<AtomContributionPropertyName>('logp');

  async function handleSync(payload: StructurePayload) {
    const next = payload.smiles || 'molfile structure';
    setSmiles(next);
    setStatus(`Synced ${next}`);
  }

  function handlePropertyChange(property: AtomContributionPropertyName) {
    setShapProperty(property);
    setStatus(`Evidence property: ${propertyLabels[property]}`);
  }

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'var(--molvis-bg)', p: { xs: 1, md: 2 } }}>
      <Stack spacing={1.5} sx={{ height: 'calc(100dvh - 32px)' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--molvis-text)' }}>
            Chem Editor
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--molvis-muted)' }}>
            {status} · {smiles}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <StructureEvidenceEditor
            acceptedSmiles={smiles}
            onChangeShapProperty={handlePropertyChange}
            onOpenStructureFile={() => setStatus('File upload is not enabled in standalone mode.')}
            onSyncStructure={handleSync}
            shapProperty={shapProperty}
          />
        </Box>
      </Stack>
    </Box>
  );
}
