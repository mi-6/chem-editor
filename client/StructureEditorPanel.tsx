import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DrawRoundedIcon from '@mui/icons-material/DrawRounded';
import KeyboardCommandKeyRoundedIcon from '@mui/icons-material/KeyboardCommandKeyRounded';

export interface StructurePayload {
  designEdit?: {
    afterSmiles: string;
    beforeMolfile?: string;
    beforeSmiles: string;
    fragmentLabel: string;
  };
  smiles: string;
  molfile: string;
}

export interface WorkspaceEditorHandle {
  clear: () => Promise<void>;
  exportStructure: () => Promise<StructurePayload>;
  loadStructure: (structure: string) => Promise<void>;
}

interface StructureEditorPanelProps {
  acceptedSmiles?: string;
  explainOverlaySvg?: string | null;
  invalidMessage?: string | null;
  onStructureChange: (payload: StructurePayload) => void | Promise<void>;
}

type StructureMode = 'smiles' | 'molfile';

function isMolfile(value: string) {
  return /V2000|V3000|M {2}END/.test(value);
}

function normalizeSmiles(value: string) {
  return value.trim().split(/\s+/)[0] || '';
}

function detectMode(value: string): StructureMode {
  return isMolfile(value) ? 'molfile' : 'smiles';
}

function toPayload(value: string, mode: StructureMode): StructurePayload {
  const trimmed = value.trim();
  if (!trimmed) {
    return { smiles: '', molfile: '' };
  }

  if (mode === 'molfile' || isMolfile(trimmed)) {
    return {
      smiles: '',
      molfile: trimmed,
    };
  }

  return {
    smiles: normalizeSmiles(trimmed),
    molfile: '',
  };
}

export const StructureEditorPanel = forwardRef<
  WorkspaceEditorHandle,
  StructureEditorPanelProps
>(function StructureEditorPanel(
  { acceptedSmiles, explainOverlaySvg, invalidMessage, onStructureChange },
  ref,
) {
  const [editorError, setEditorError] = useState<string | null>(null);
  const [structureInput, setStructureInput] = useState('');

  const overlayMarkup = useMemo(
    () =>
      explainOverlaySvg ? { __html: explainOverlaySvg.replace(/<\?xml.*?\?>/, '') } : null,
    [explainOverlaySvg],
  );

  const structureMode = useMemo(
    () => detectMode(structureInput),
    [structureInput],
  );

  const loadStructure = useCallback(async (structure: string) => {
    setStructureInput(structure.trim());
    setEditorError(null);
  }, []);

  const clearEditor = useCallback(async () => {
    setStructureInput('');
    setEditorError(null);
  }, []);

  const exportStructure = useCallback(
    async () => toPayload(structureInput, structureMode),
    [structureInput, structureMode],
  );

  const commitStructure = async () => {
    const payload = await exportStructure();
    if (!payload.smiles && !payload.molfile) {
      setEditorError('Paste a SMILES string or molfile block before applying it.');
      return payload;
    }

    setEditorError(null);
    await onStructureChange(payload);
    return payload;
  };

  useImperativeHandle(
    ref,
    () => ({
      clear: clearEditor,
      exportStructure,
      loadStructure,
    }),
    [clearEditor, exportStructure, loadStructure],
  );

  return (
    <Box sx={panelSx}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={titleSx}>
            Structure editor
          </Typography>
          <Typography variant="body2" sx={descriptionSx}>
            Work in raw text when you need speed. Paste one structure, keep the canvas visible,
            and apply only when the edit is ready to inspect.
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap">
          <Box sx={statusPillSx}>
            <DrawRoundedIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {structureMode === 'molfile' ? 'Molfile block' : 'SMILES input'}
            </Typography>
          </Box>
          <Box sx={shortcutPillSx}>
            <KeyboardCommandKeyRoundedIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Ctrl+Enter to apply
            </Typography>
          </Box>
        </Stack>
      </Stack>

      {invalidMessage ? (
        <Alert severity="warning" sx={alertSx}>
          {invalidMessage}
        </Alert>
      ) : null}

      {editorError ? (
        <Alert severity="error" sx={alertSx}>
          {editorError}
        </Alert>
      ) : null}

      <Box sx={editorShellSx}>
        <textarea
          aria-label="Structure editor"
          placeholder={'SMILES example: CC(=O)OC1=CC=CC=C1C(=O)O\n\nor paste a MOL/SDF block here'}
          value={structureInput}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            setStructureInput(event.target.value);
            if (editorError) {
              setEditorError(null);
            }
          }}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              void commitStructure();
            }
          }}
          style={textareaStyle(structureMode)}
        />
      </Box>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={0.8}
        alignItems={{ xs: 'stretch', sm: 'center' }}
      >
        <Button
          variant="contained"
          startIcon={<AutorenewRoundedIcon />}
          onClick={() => {
            void commitStructure();
          }}
          sx={applyButtonSx}
        >
          Apply to workspace
        </Button>
        <Button
          variant="outlined"
          startIcon={<DeleteOutlineRoundedIcon />}
          onClick={() => {
            void clearEditor();
          }}
          sx={clearButtonSx}
        >
          Clear
        </Button>
        <Box sx={acceptedInlineSx}>
          <Typography variant="caption" sx={metaLabelSx}>
            Accepted
          </Typography>
          <Typography variant="body2" sx={acceptedValueSx}>
            {acceptedSmiles || 'Nothing yet'}
          </Typography>
        </Box>
      </Stack>

      {overlayMarkup ? (
        <Box sx={overlayPanelSx}>
          <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: 'var(--molvis-muted)' }}>
            Latest explainability overlay
          </Typography>
          <Box
            aria-hidden
            sx={overlayCanvasSx}
            dangerouslySetInnerHTML={overlayMarkup}
          />
        </Box>
      ) : null}
    </Box>
  );
});

const panelSx = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0.85,
  minHeight: 0,
  borderRadius: 1.75,
  border: '1px solid var(--molvis-border-soft)',
  background:
    'linear-gradient(180deg, #fbfcff 0%, #f6f8fd 100%)',
  p: { xs: 0.9, md: 1 },
} as const;

const titleSx = {
  color: 'var(--molvis-text)',
  fontWeight: 700,
} as const;

const descriptionSx = {
  color: 'var(--molvis-muted)',
  mt: 0.35,
  maxWidth: 520,
  lineHeight: 1.6,
} as const;

const statusPillSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.55,
  px: 0.85,
  py: 0.42,
  borderRadius: 1.05,
  border: '1px solid var(--molvis-border-soft)',
  backgroundColor: '#ffffff',
  color: 'var(--molvis-text)',
} as const;

const shortcutPillSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.55,
  px: 0.82,
  py: 0.42,
  borderRadius: 1.05,
  border: '1px solid rgba(41, 88, 255, 0.14)',
  backgroundColor: '#f5f8ff',
  color: 'var(--molvis-accent)',
} as const;

const alertSx = {
  border: '1px solid var(--molvis-border)',
  borderRadius: 1.5,
  backgroundColor: '#ffffff',
} as const;

const metaLabelSx = {
  color: 'var(--molvis-muted)',
  display: 'block',
} as const;

const acceptedValueSx = {
  color: 'var(--molvis-text)',
  fontWeight: 700,
  mt: 0.3,
  fontFamily: '"IBM Plex Mono", monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const editorShellSx = {
  display: 'grid',
  borderRadius: 1.5,
  border: '1px solid var(--molvis-border)',
  backgroundColor: '#ffffff',
  p: 0.55,
} as const;

const applyButtonSx = {
  minHeight: 42,
  borderRadius: 1.2,
  bgcolor: 'var(--molvis-accent)',
  '&:hover': {
    bgcolor: 'var(--molvis-accent-strong)',
  },
} as const;

const clearButtonSx = {
  minHeight: 42,
  borderRadius: 1.2,
  borderColor: 'var(--molvis-border)',
  color: 'var(--molvis-text)',
} as const;

const acceptedInlineSx = {
  flex: 1,
  minWidth: 0,
  alignSelf: 'center',
} as const;

const overlayPanelSx = {
  borderRadius: 1.3,
  border: '1px solid var(--molvis-border-soft)',
  backgroundColor: '#f8fafc',
  p: 0.85,
} as const;

const overlayCanvasSx = {
  minHeight: 120,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& svg': {
    maxWidth: '100%',
    height: 'auto',
  },
} as const;

function textareaStyle(structureMode: StructureMode) {
  return {
    boxSizing: 'border-box' as const,
    display: 'block',
    width: '100%',
    height: structureMode === 'molfile' ? '190px' : '92px',
    maxHeight: '240px',
    resize: 'vertical' as const,
    borderRadius: '12px',
    border: '1px solid var(--molvis-border)',
    backgroundColor: '#ffffff',
    padding: '14px 14px 12px',
    color: 'var(--molvis-text)',
    outline: 'none',
    fontFamily:
      structureMode === 'molfile'
        ? 'Consolas, "SFMono-Regular", Menlo, monospace'
        : '"IBM Plex Mono", monospace',
    fontSize: structureMode === 'molfile' ? '0.82rem' : '0.94rem',
    lineHeight: '1.55',
    transition: 'border-color 140ms ease, box-shadow 140ms ease',
    boxShadow: 'inset 0 1px 2px rgba(17, 24, 39, 0.03)',
  };
}
