import { useMemo, useState } from 'react';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import { Alert, Box, Button, Stack, TextField, Typography, IconButton } from '@mui/material';

import { StructureEvidenceEditor } from './StructureEvidenceEditor';
import type { StructurePayload } from './StructureEditorPanel';
import { createLocalCommandPlan, executeCommandPlan } from '@/lib/commandExecutor';
import type { CommandPlannerState } from '@/lib/commandTypes';
import { useMoleculeWorkspaceState } from '@/features/chat/hooks/useMoleculeWorkspaceState';

const suggestedCommands = [
  'add ethyl to benzene',
  'replace phenyl with pyridine',
  'apply preview',
];

const promptActions = [
  'Highlight CCO',
  'Sync structure',
  'Compare with active molecule',
];


export function EditorPage() {
  const molecule = useMoleculeWorkspaceState();
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>(['Editor ready. Draw, paste SMILES, or type an edit command.']);
  const [panelOpen, setPanelOpen] = useState(true);

  const plannerState = useMemo<CommandPlannerState>(() => ({
    atom_contribution_property: molecule.atomContributionProperty,
    has_preview: Boolean(molecule.previewResult),
    mode: molecule.mode,
    selected_atoms: molecule.selectedAtomIndices,
    selected_fragment_id: molecule.executionContext.selectedFragmentId,
    selected_query: molecule.executionContext.selectedQuery,
    smiles: molecule.smiles,
  }), [molecule]);

  const runEditorCommand = async () => {
    const instruction = command.trim();
    if (!instruction || busy) return;

    setBusy(true);
    setCommand('');
    setMessages((current) => [`You: ${instruction}`, ...current]);

    try {
      const plan = createLocalCommandPlan(instruction, plannerState);
      const message = await executeCommandPlan(plan, molecule.executionContext);
      setMessages((current) => [
        message.length ? message.join('\n') : plan.message,
        ...current,
      ]);
    } catch (error) {
      setMessages((current) => [
        error instanceof Error ? error.message : 'MolVis could not run that editor command.',
        ...current,
      ]);
    } finally {
      setBusy(false);
    }
  };

  const applyPreview = () => {
    const preview = molecule.previewResult;
    if (!preview?.after_smiles && !preview?.smiles) return;
    molecule.commitMolecule({
      molfile: preview.molfile || '',
      pdbContent: preview.after_pdb || '',
      smiles: preview.after_smiles || preview.smiles,
    });
    molecule.executionContext.setPreviewResult(null);
    setMessages((current) => [`Applied preview: ${preview.after_smiles || preview.smiles}`, ...current]);
  };

  const cancelPreview = () => {
    molecule.executionContext.setPreviewResult(null);
    setMessages((current) => ['Canceled preview.', ...current]);
  };

  const syncStructure = async (payload: StructurePayload) => {
    molecule.commitMolecule({
      molfile: payload.molfile || '',
      smiles: payload.smiles || molecule.smiles,
    });
    setMessages((current) => [`Synced structure: ${payload.smiles || 'molfile structure'}`, ...current]);
  };

  return (
    <Box sx={pageSx}>
      <Box sx={contentSx()}>
        <Box sx={editorShellSx}>
          <StructureEvidenceEditor
            acceptedSmiles={molecule.smiles}
            onOpenStructureFile={() => setMessages((current) => ['File upload is not available in this editor section yet.', ...current])}
            onSyncStructure={syncStructure}
            shapProperty="logp"
          />
        </Box>

        {panelOpen ? (
          <Box sx={chatPanelSx}>
            <Box sx={chatHeaderSx}>
              <Box sx={assistantIconSx}><ScienceRoundedIcon sx={{ fontSize: 17 }} /></Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={eyebrowSx}>Structure Editor</Typography>
                <Typography sx={titleSx}>{busy ? 'Running edit' : molecule.smiles || 'Ready'}</Typography>
              </Box>
              <Stack direction="row" spacing={0.15} sx={{ ml: 1, flexShrink: 0, alignItems: 'center' }}>
                <IconButton
                  size="small"
                  onClick={() => setPanelOpen(false)}
                  title="Close panel"
                  sx={{ p: 0.3, color: 'var(--molvis-muted)', '&:hover': { color: 'var(--molvis-text)' } }}
                >
                  <CloseRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>
            </Box>

            {molecule.previewResult ? (
              <Alert severity="info" sx={previewSx}>
                <Typography sx={previewTitleSx}>Preview staged</Typography>
                <Typography sx={previewSmilesSx}>{molecule.previewResult.after_smiles || molecule.previewResult.smiles}</Typography>
                <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
                  <Button onClick={applyPreview} startIcon={<CheckRoundedIcon />} sx={applyButtonSx}>Apply</Button>
                  <Button onClick={cancelPreview} startIcon={<CloseRoundedIcon />} sx={cancelButtonSx}>Cancel</Button>
                </Stack>
              </Alert>
            ) : null}

            <Box sx={composerDockSx}>
              <TextField
                multiline
                maxRows={3}
                minRows={2}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void runEditorCommand();
                  }
                }}
                placeholder="Try: add ethyl to benzene..."
                size="small"
                value={command}
                sx={commandFieldSx}
              />
              <Box sx={actionGridSx}>
                {promptActions.map((action) => (
                  <Button key={action} onClick={() => setCommand(action.toLowerCase())} sx={actionTileSx}>
                    {action}
                  </Button>
                ))}
              </Box>
              <Stack direction="row" spacing={0.45} useFlexGap flexWrap="wrap">
                {suggestedCommands.map((suggestion) => (
                  <Button key={suggestion} onClick={() => setCommand(suggestion)} sx={suggestionButtonSx}>
                    {suggestion}
                  </Button>
                ))}
              </Stack>
              <Button
                disabled={busy || !command.trim()}
                onClick={() => void runEditorCommand()}
                startIcon={<AutoFixHighRoundedIcon />}
                sx={primaryButtonSx}
              >
                Run edit
              </Button>
            </Box>


            <Box sx={messageListSx}>
              {messages.slice(0, 1).map((message, index) => (
                <Box key={`${message}-${index}`} sx={messageBubbleSx(message.startsWith('You:'))}>
                  <Typography sx={messageTextSx}>{message}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ) : (
          <Button
            onClick={() => setPanelOpen(true)}
            variant="contained"
            startIcon={<ScienceRoundedIcon sx={{ fontSize: 16 }} />}
            sx={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              bgcolor: '#14213d',
              color: '#ffffff',
              borderRadius: '4px 0px 0px 4px',
              px: 2,
              py: 1.5,
              fontSize: '0.7rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRight: 'none',
              '&:hover': {
                bgcolor: 'var(--molvis-accent)',
                boxShadow: '-4px 0 20px rgba(41, 88, 255, 0.3)',
              },
            }}
            title="Open structure editor"
          >
            Open Editor
          </Button>
        )}
      </Box>
    </Box>
  );
}

const pageSx = {
  height: '100%',
  minHeight: 0,
  p: { xs: 0, md: 0.35 },
  bgcolor: '#ffffff',
  overflow: 'hidden',
} as const;

const eyebrowSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.68rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
} as const;

const titleSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.74rem',
  fontFamily: '"IBM Plex Mono", monospace',
  fontWeight: 700,
  wordBreak: 'break-all',
  lineHeight: 1.3,
  maxHeight: 42,
  overflowY: 'auto',
  pr: 0.5,
} as const;

function contentSx() {
  return {
    height: '100%',
    minHeight: 0,
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
  } as const;
}

const chatPanelSx = {
  width: 320,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
  p: 1.5,
  borderLeft: '1px solid rgba(20, 32, 51, 0.08)',
  bgcolor: '#fafbfc',
  overflow: 'hidden',
  flexShrink: 0,
} as const;

const editorShellSx = {
  height: '100%',
  minHeight: 0,
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
  '& > div': {
    height: '100%',
    borderRadius: 0,
  },
} as const;

const previewTitleSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.82rem',
  fontWeight: 800,
} as const;

const previewSmilesSx = {
  color: 'var(--molvis-text)',
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: '0.74rem',
  fontWeight: 700,
  wordBreak: 'break-all',
} as const;

const applyButtonSx = {
  minHeight: 30,
  borderRadius: 0.6,
  bgcolor: '#166534',
  color: '#ffffff',
  fontSize: '0.72rem',
  fontWeight: 800,
  textTransform: 'none',
  '&:hover': { bgcolor: '#14532d' },
} as const;

const cancelButtonSx = {
  minHeight: 30,
  borderRadius: 0.6,
  color: 'var(--molvis-muted)',
  border: '1px solid rgba(20, 32, 51, 0.12)',
  fontSize: '0.72rem',
  fontWeight: 800,
  textTransform: 'none',
  '&:hover': { bgcolor: '#f1f5f9' },
} as const;

const chatHeaderSx = {
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: '32px minmax(0, 1fr)',
  alignItems: 'center',
  gap: 0.45,
  px: 0.05,
  pb: 0.15,
  borderBottom: '1px solid rgba(20, 32, 51, 0.06)',
} as const;

const assistantIconSx = {
  width: 32,
  height: 32,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 0.65,
  bgcolor: '#14213d',
  color: '#ffffff',
} as const;

const messageListSx = {
  minHeight: 0,
  maxHeight: 54,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 0.55,
  pr: 0.25,
} as const;

const actionGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 0.35,
} as const;

const actionTileSx = {
  minHeight: 28,
  justifyContent: 'center',
  px: 0.5,
  borderRadius: 0.55,
  border: '1px solid rgba(20, 32, 51, 0.08)',
  bgcolor: '#fbfcfe',
  color: 'var(--molvis-text)',
  textTransform: 'none',
  fontSize: '0.62rem',
  fontWeight: 700,
  '&:hover': {
    bgcolor: '#eef4ff',
    borderColor: 'rgba(41, 88, 255, 0.18)',
  },
} as const;

const messageBubbleSx = (isUser: boolean) => ({
  alignSelf: isUser ? 'flex-end' : 'flex-start',
  maxWidth: '96%',
  px: 0.65,
  py: 0.48,
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.7,
  bgcolor: isUser ? '#eef4ff' : '#fbfcfe',
});

const messageTextSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.76rem',
  fontWeight: 600,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
} as const;

const commandFieldSx = {
  '& .MuiInputBase-root': {
    bgcolor: '#ffffff',
    borderRadius: 0.65,
    fontSize: '0.75rem',
    '& fieldset': {
      borderColor: 'rgba(20, 32, 51, 0.10)',
    },
  },
} as const;

const primaryButtonSx = {
  minHeight: 36,
  borderRadius: 0.7,
  bgcolor: 'var(--molvis-accent)',
  color: '#ffffff',
  fontSize: '0.78rem',
  fontWeight: 800,
  textTransform: 'none',
  '&:hover': { bgcolor: 'var(--molvis-accent-strong)' },
} as const;

const composerDockSx = {
  display: 'grid',
  gap: 0.45,
} as const;

const suggestionButtonSx = {
  minHeight: 24,
  px: 0.5,
  borderRadius: 0.6,
  bgcolor: '#f3f6fb',
  color: 'var(--molvis-text)',
  textTransform: 'none',
  fontSize: '0.61rem',
  fontWeight: 700,
  '&:hover': { bgcolor: '#eaf0fb' },
} as const;

const previewSx = {
  borderRadius: 0.8,
  border: '1px solid rgba(37, 99, 235, 0.16)',
} as const;




