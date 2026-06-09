import { useEffect, useState } from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import CircularProgress from '@mui/material/CircularProgress';
import { Alert, Box, Button, IconButton, Stack, TextField, Typography } from '@mui/material';

import { sanitizeSvg } from '@/lib/sanitize';
import type { WorkspaceArtifact } from '@/lib/commandTypes';
import { moleculeService } from '@/services/moleculeService';
import { newClientId } from '@/features/chat/chatArtifacts';
import { checkMolfile, cleanMolfile, molfileToSmiles, smilesToMolfile } from './ketcherService';


export function KetcherEditorPanel({
  onApplyMolecule,
  onCancel,
  onPreviewArtifact,
  smiles,
}: {
  onApplyMolecule?: (payload: { molfile: string; smiles: string }) => void;
  onCancel: () => void;
  onPreviewArtifact: (artifact: WorkspaceArtifact) => void;
  smiles: string;
}) {
  const [draftSmiles, setDraftSmiles] = useState(smiles);
  const [draftMolfile, setDraftMolfile] = useState('');
  const [previewSvg, setPreviewSvg] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [editorError, setEditorError] = useState('');
  const [confirmApply, setConfirmApply] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    setDraftSmiles(smiles);
    setConfirmApply(false);
  }, [smiles]);

  useEffect(() => {
    // Debounced preview generation
    const candidate = draftSmiles.trim();
    if (!candidate) {
      setPreviewSvg('');
      setDraftMolfile('');
      setStatus('idle');
      setEditorError('');
      return;
    }
    setStatus('checking');
    setEditorError('');
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      withTimeout(smilesToMolfile(candidate), 3500)
        .then((molfile) => cleanMolfile(molfile).catch(() => molfile))
        .then(async (molfile) => {
          const canonical = await molfileToSmiles(molfile).catch(() => candidate);
          const checks = await checkMolfile(molfile).catch(() => ({}));
          const blockingCheck = Object.values(checks).find((value) => String(value || '').trim());
          const result = await moleculeService.analyzeWorkspace({ smiles: canonical, molfile });
          return { blockingCheck, canonical, molfile, result };
        })
        .then((result) => {
          if (result.blockingCheck) {
            setEditorError(String(result.blockingCheck));
          }
          setDraftMolfile(result.molfile);
          setPreviewSvg(result.result.structure_2d || '');
          setStatus('valid');
        })
        .catch(async (error) => {
          try {
            const result = await moleculeService.analyzeWorkspace({ smiles: candidate });
            setDraftMolfile(result.molfile || '');
            setPreviewSvg(result.structure_2d || '');
            setEditorError('');
            setStatus('valid');
          } catch {
            setDraftMolfile('');
            setPreviewSvg('');
            setEditorError(error instanceof Error ? error.message : 'Ketcher could not parse this structure.');
            setStatus('invalid');
          }
        })
        .finally(() => {
          setPreviewLoading(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [draftSmiles]);

  const applyPreview = () => {
    const candidate = draftSmiles.trim();
    if (!candidate || status !== 'valid' || !draftMolfile) return;
    onPreviewArtifact({
      id: newClientId('artifact'),
      kind: 'edited_molecule_preview',
      title: 'Edited molecule preview',
      summary: `Ketcher-powered edit preview staged for ${candidate}. Apply only after confirmation.`,
      data: {
        molfile: draftMolfile,
        smiles: candidate,
        svg: previewSvg,
      },
      provenance: ['Ketcher Standalone', 'Indigo', 'RDKit'],
      source_tool: 'ketcher.editor',
      created_at: new Date().toISOString(),
    });
  };

  const applyToActiveMolecule = () => {
    if (!confirmApply) {
      setConfirmApply(true);
      return;
    }
    if (status === 'valid' && draftMolfile && draftSmiles.trim()) {
      onApplyMolecule?.({ molfile: draftMolfile, smiles: draftSmiles.trim() });
    }
  };

  return (
    <Box sx={shellSx}>
      <Box sx={headerSx}>
        <Box>
          <Typography sx={eyebrowSx}>Ketcher-powered editor</Typography>
          <Typography sx={titleSx}>SMILES/Molfile preview and conversion</Typography>
        </Box>
        <IconButton aria-label="Close editor" onClick={onCancel} sx={closeButtonSx}>
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
      <Box sx={bodySx}>
        {editorError ? <Alert severity="warning" sx={alertSx}>{editorError}</Alert> : null}
        <Box sx={controlPanelSx}>
          <TextField
            label="SMILES"
            onChange={(event) => setDraftSmiles(event.target.value)}
            size="small"
            value={draftSmiles}
            sx={fieldSx}
          />
          <Stack direction="row" spacing={0.55} sx={actionsSx}>
            <Button aria-label="Save preview artifact" disabled={status !== 'valid'} onClick={applyPreview} sx={primaryButtonSx}>
              Save preview
            </Button>
            <Button disabled={status !== 'valid'} onClick={applyToActiveMolecule} sx={confirmApply ? dangerButtonSx : secondaryButtonSx}>
              {confirmApply ? 'Confirm' : 'Apply'}
            </Button>
            <Button disabled={draftSmiles === smiles} onClick={() => { setDraftSmiles(smiles); setConfirmApply(false); }} sx={secondaryButtonSx}>
              Reset
            </Button>
            <Button onClick={onCancel} sx={secondaryButtonSx}>
              Cancel
            </Button>
          </Stack>
        </Box>
        <Box sx={previewSx}>
          {previewLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <CircularProgress size={24} />
            </Box>
          ) : previewSvg ? (
            <Box sx={svgSx} dangerouslySetInnerHTML={{ __html: sanitizeSvg(previewSvg) }} />
          ) : (
            <Typography sx={hintSx}>{status === 'invalid' ? 'Invalid structure' : 'Preview appears here'}</Typography>
          )}
          {/* Action buttons */}
          {previewSvg && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 1, justifyContent: 'center' }}>
              <Button
                startIcon={<DownloadIcon />}
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(previewSvg);
                  link.download = 'structure.svg';
                  link.click();
                }}
                size="small"
                sx={secondaryButtonSx}
              >
                SVG
              </Button>
              <IconButton
                aria-label="Copy SMILES"
                onClick={() => {
                  navigator.clipboard.writeText(draftSmiles.trim());
                }}
                size="small"
                sx={secondaryButtonSx}
              >
                <ContentCopyIcon />
              </IconButton>
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Ketcher conversion timed out.')), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

const shellSx = {
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  gap: 0.75,
  p: { xs: 0.8, md: 0.95 },
  border: 'none',
  borderRadius: 0.9,
  bgcolor: '#ffffff',
} as const;

const headerSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 0.8,
} as const;

const eyebrowSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.64rem',
  fontWeight: 860,
  textTransform: 'uppercase',
} as const;

const titleSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.88rem',
  fontWeight: 880,
} as const;

const closeButtonSx = {
  width: 30,
  height: 30,
  borderRadius: 0.7,
  bgcolor: '#ffffff',
  border: '1px solid rgba(20, 32, 51, 0.08)',
  color: 'var(--molvis-muted)',
  '&:hover': {
    bgcolor: '#f7f9fc',
    color: 'var(--molvis-text)',
  },
} as const;

const bodySx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'minmax(240px, 320px) minmax(0, 1fr)' },
  gridTemplateRows: { xs: 'auto minmax(260px, 1fr)', md: 'minmax(0, 1fr)' },
  alignItems: 'start',
  gap: { xs: 0.75, md: 0.85 },
  minHeight: 0,
} as const;

const alertSx = {
  gridColumn: '1 / -1',
  borderRadius: 0.55,
} as const;

const controlPanelSx = {
  display: 'grid',
  gap: 0.8,
  alignContent: 'start',
  p: { xs: 0, md: 0.1 },
} as const;

const fieldSx = {
  bgcolor: '#ffffff',
  '& .MuiOutlinedInput-root': {
    borderRadius: 0.85,
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(20, 32, 51, 0.10)',
  },
} as const;

const previewSx = {
  width: '100%',
  minHeight: { xs: 260, md: 420 },
  height: { xs: 'auto', md: '100%' },
  display: 'grid',
  placeItems: 'center',
  border: '1px solid rgba(20, 32, 51, 0.06)',
  borderRadius: 0.9,
  background: 'rgba(255, 255, 255, 0.6)',
  backdropFilter: 'blur(8px)',
  overflow: 'hidden',
} as const;

const svgSx = {
  width: '100%',
  maxWidth: 560,
  p: 1.2,
  '& svg': {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
  '& svg path, & svg line': {
    strokeWidth: 2.2,
  },
} as const;

const hintSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.72rem',
  fontWeight: 720,
} as const;

const actionsSx = {
  justifyContent: 'flex-start',
  flexWrap: 'wrap',
} as const;

const primaryButtonSx = {
  minHeight: 36,
  borderRadius: 0.75,
  px: 1.15,
  bgcolor: 'var(--molvis-accent)',
  color: '#ffffff',
  textTransform: 'none',
  fontSize: '0.74rem',
  fontWeight: 820,
  '&:hover': { bgcolor: 'var(--molvis-accent-strong)' },
} as const;

const secondaryButtonSx = {
  minHeight: 36,
  borderRadius: 0.75,
  px: 1.05,
  color: 'var(--molvis-text)',
  textTransform: 'none',
  fontSize: '0.74rem',
  fontWeight: 780,
  '&:hover': { bgcolor: '#f6f8fc' },
} as const;

const dangerButtonSx = {
  ...secondaryButtonSx,
  bgcolor: '#fff1f0',
  color: '#b42318',
  border: '1px solid rgba(180, 35, 24, 0.16)',
} as const;
