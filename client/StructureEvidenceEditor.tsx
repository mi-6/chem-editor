import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import { Alert, Box, Button, Chip, Divider, Stack, TextField, Typography } from '@mui/material';

import { moleculeService } from '@/services/moleculeService';
import { getApiErrorMessage } from '@/utils/apiError';
import type { StructurePayload, WorkspaceEditorHandle } from './StructureEditorPanel';
import type { AtomContributionPropertyName } from '@/features/workspace/types';

interface StructureEvidenceEditorProps {
  acceptedSmiles: string;
  heatmapSvg?: string | null;
  invalidMessage?: string | null;
  onOpenStructureFile: () => void;
  onChangeShapProperty?: (property: AtomContributionPropertyName) => void;
  onSyncStructure?: (payload: StructurePayload) => void | Promise<void>;
  shapError?: string | null;
  shapRawContributions?: number[];
  shapProperty?: AtomContributionPropertyName;
  shapStatus?: 'idle' | 'running' | 'ready' | 'error';
  structureSvg?: string | null;
}

type BondOrder = 1 | 2 | 3;

type SketchAtom = {
  element: string;
  id: number;
  x: number;
  y: number;
};

type SketchBond = {
  from: number;
  id: number;
  order: BondOrder;
  to: number;
};

type FragmentOption = {
  custom?: boolean;
  description: string;
  id: string;
  label: string;
  smiles: string;
};

const FRAGMENT_LIBRARY_STORAGE_KEY = 'molvis-playground-fragment-library-v1';

const defaultFragmentLibrary: FragmentOption[] = [
  {
    description: 'Insert one carbon into the selected bond.',
    id: 'methylene',
    label: '+CH2',
    smiles: '[*:1]C[*:2]',
  },
  {
    description: 'Insert an ether oxygen into the selected bond.',
    id: 'ether',
    label: '+O',
    smiles: '[*:1]O[*:2]',
  },
  {
    description: 'Insert an amine linker into the selected bond.',
    id: 'amine',
    label: '+NH',
    smiles: '[*:1]N[*:2]',
  },
  {
    description: 'Insert a phenyl spacer into the selected bond.',
    id: 'phenyl',
    label: 'Phenyl',
    smiles: '[*:1]c1ccccc1[*:2]',
  },
];

const shapProperties: Array<{ label: string; value: AtomContributionPropertyName }> = [
  { label: 'tPSA', value: 'tpsa' },
  { label: 'LogP', value: 'logp' },
  { label: 'Weight', value: 'molecular_weight' },
  { label: 'HBD', value: 'hbd' },
  { label: 'HBA', value: 'hba' },
];

function getShapPropertyLabel(value: AtomContributionPropertyName) {
  return shapProperties.find((property) => property.value === value)?.label || value;
}

const atomPalette = ['C', 'N', 'O', 'S', 'F', 'Cl', 'Br'];
const MIN_CANVAS_SCALE = 0.55;
const MAX_CANVAS_SCALE = 2.4;
const CANVAS_SCALE_STEP = 0.16;

function isMolfile(value: string) {
  return /V2000|V3000|M {2}END/.test(value);
}

function normalizeSmiles(value: string) {
  return value.trim().split(/\s+/)[0] || '';
}

function normalizeFragmentInput(value: string) {
  return value.trim();
}

function isInsertionReadyFragment(value: string) {
  const fragment = normalizeFragmentInput(value);
  return (
    (fragment.includes('[*:1]') && fragment.includes('[*:2]')) ||
    looksLikeSmiles(fragment)
  );
}

function readCustomFragmentLibrary(): FragmentOption[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(FRAGMENT_LIBRARY_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => (
        typeof item?.id === 'string' &&
        typeof item?.label === 'string' &&
        typeof item?.smiles === 'string'
      ))
      .map((item) => ({
        custom: true,
        description:
          typeof item.description === 'string' ? item.description : 'Saved custom fragment.',
        id: item.id,
        label: item.label,
        smiles: item.smiles,
      }));
  } catch {
    return [];
  }
}

function persistCustomFragmentLibrary(fragments: FragmentOption[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    FRAGMENT_LIBRARY_STORAGE_KEY,
    JSON.stringify(
      fragments.map((fragment) => ({
        description: fragment.description,
        id: fragment.id,
        label: fragment.label,
        smiles: fragment.smiles,
      })),
    ),
  );
}

function looksLikeSmiles(value: string) {
  const candidate = normalizeSmiles(value);
  return (
    /^[A-Za-z0-9@+\-[\]()=#$\\/%.]+$/.test(candidate) &&
    (/[=#()[\]0-9]/.test(candidate) || /^[A-Z]/.test(candidate))
  );
}

function normalizePayload(payload: StructurePayload): StructurePayload {
  const smiles = normalizeSmiles(payload.smiles || '');
  const molfile = (payload.molfile || '');
  return smiles ? { smiles, molfile: '' } : { smiles: '', molfile };
}

function formatMolNumber(value: number) {
  return value.toFixed(4).padStart(10, ' ');
}

function buildSketchMolfile(atoms: SketchAtom[], bonds: SketchBond[]) {
  if (!atoms.length) {
    return '';
  }

  const atomIndex = new Map(atoms.map((atom, index) => [atom.id, index + 1]));
  const atomLines = atoms.map((atom) => {
    const x = (atom.x - 420) / 44;
    const y = (320 - atom.y) / 44;
    return `${formatMolNumber(x)}${formatMolNumber(y)}${formatMolNumber(0)} ${atom.element.padEnd(3, ' ')} 0  0  0  0  0  0  0  0  0  0  0  0`;
  });
  const bondLines = bonds
    .filter((bond) => atomIndex.has(bond.from) && atomIndex.has(bond.to))
    .map((bond) => `${String(atomIndex.get(bond.from)).padStart(3, ' ')}${String(atomIndex.get(bond.to)).padStart(3, ' ')}${String(bond.order).padStart(3, ' ')}  0  0  0  0`);

  return [
    'MolVis live sketch',
    '  MolVis',
    '',
    `${String(atoms.length).padStart(3, ' ')}${String(bondLines.length).padStart(3, ' ')}  0  0  0  0            999 V2000`,
    ...atomLines,
    ...bondLines,
    'M  END',
  ].join('\n');
}

function parseMolfileSketch(molfile: string): { atoms: SketchAtom[]; bonds: SketchBond[] } | null {
  const lines = molfile.split(/\r?\n/);
  const counts = lines[3];
  if (!counts) {
    return null;
  }

  const atomCount = Number.parseInt(counts.slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(counts.slice(3, 6).trim(), 10);
  if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount) || atomCount <= 0) {
    return null;
  }

  const atoms = lines.slice(4, 4 + atomCount).map((line, index) => {
    const parts = line.trim().split(/\s+/);
    const x = Number.parseFloat(parts[0] || '0');
    const y = Number.parseFloat(parts[1] || '0');
    return {
      element: parts[3] || 'C',
      id: index + 1,
      x: x * 44 + 420,
      y: 320 - y * 44,
    };
  });
  const bonds: SketchBond[] = lines.slice(4 + atomCount, 4 + atomCount + bondCount).map((line, index) => {
    const from = Number.parseInt(line.slice(0, 3).trim(), 10);
    const to = Number.parseInt(line.slice(3, 6).trim(), 10);
    const order = Number.parseInt(line.slice(6, 9).trim(), 10);
    const parsedOrder: BondOrder = order === 2 || order === 3 ? order : 1;
    return {
      from,
      id: index + 1,
      order: parsedOrder,
      to,
    };
  });

  return { atoms, bonds };
}

function sketchFromSmiles(smiles: string): { atoms: SketchAtom[]; bonds: SketchBond[] } | null {
  const tokens = normalizeSmiles(smiles).match(/Br|Cl|[A-Z][a-z]?/g) || [];
  const elements = tokens.filter((token) => atomPalette.includes(token) || ['P', 'I'].includes(token));
  if (!elements.length) {
    return null;
  }

  const spacing = 70;
  const startX = 420 - ((elements.length - 1) * spacing) / 2;
  const atoms = elements.map((element, index) => ({
    element,
    id: index + 1,
    x: startX + index * spacing,
    y: 320,
  }));
  const bonds = atoms.slice(1).map((atom, index) => ({
    from: atoms[index].id,
    id: index + 1,
    order: smiles.includes('=') && index === 0 ? 2 as BondOrder : 1 as BondOrder,
    to: atom.id,
  }));

  return { atoms, bonds };
}

function getSvgPoint(event: React.MouseEvent<SVGSVGElement> | React.WheelEvent<SVGSVGElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 840,
    y: ((event.clientY - rect.top) / rect.height) * 640,
  };
}

function getSvgClientPoint(event: React.MouseEvent<SVGSVGElement>) {
  return { x: event.clientX, y: event.clientY };
}

function distance(point: { x: number; y: number }, atom: SketchAtom) {
  return Math.hypot(point.x - atom.x, point.y - atom.y);
}

function clampCanvasScale(value: number) {
  return Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, value));
}

function getAtomGradId(element: string) {
  switch (element) {
    case 'C': return 'carbonGrad';
    case 'O': return 'oxygenGrad';
    case 'N': return 'nitrogenGrad';
    case 'H': return 'hydrogenGrad';
    case 'S': return 'sulfurGrad';
    case 'F':
    case 'Cl':
    case 'Br':
    case 'I': return 'halogenGrad';
    case 'P': return 'phosphorusGrad';
    default: return 'defaultGrad';
  }
}

function getAtomTextColor(element: string) {
  return element === 'H' ? '#0f172a' : '#ffffff';
}

function contributionColor(value: number | undefined, fallback: string) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  const magnitude = Math.min(1, Math.abs(value));
  if (value >= 0) {
    return `rgba(255, ${Math.round(245 - 95 * magnitude)}, ${Math.round(238 - 130 * magnitude)}, 0.96)`;
  }
  return `rgba(${Math.round(238 - 120 * magnitude)}, ${Math.round(245 - 45 * magnitude)}, 255, 0.96)`;
}

export const StructureEvidenceEditor = forwardRef<
  WorkspaceEditorHandle,
  StructureEvidenceEditorProps
>(function StructureEvidenceEditor({
  acceptedSmiles,
  heatmapSvg = null,
  invalidMessage,
  onChangeShapProperty,
  onOpenStructureFile,
  onSyncStructure,
  shapError = null,
  shapProperty = 'tpsa',
  shapRawContributions = [],
  shapStatus = 'idle',
  structureSvg = null,
}, ref) {
  void heatmapSvg;
  void shapError;
  void shapStatus;
  void structureSvg;
  const highlightRequestRef = useRef(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [currentPayload, setCurrentPayload] = useState<StructurePayload>({
    smiles: acceptedSmiles,
    molfile: '',
  });
  const [fragmentInput, setFragmentInput] = useState('CCO');
  const [customFragments, setCustomFragments] = useState<FragmentOption[]>(readCustomFragmentLibrary);
  const [selectedBondId, setSelectedBondId] = useState<number | null>(null);
  const [highlightPreview, setHighlightPreview] = useState<{
    matchedAtoms: number[];
    matchedContributions?: Array<{ atom_index: number; normalized: number; raw: number }>;
    numMatches: number;
    propertyName?: string;
    query: string;
    atomContributionSvg?: string;
    svg: string;
  } | null>(null);
  const [sketchAtoms, setSketchAtoms] = useState<SketchAtom[]>([
    { element: 'C', id: 1, x: 360, y: 270 },
    { element: 'C', id: 2, x: 430, y: 270 },
    { element: 'O', id: 3, x: 500, y: 270 },
  ]);
  const [sketchBonds, setSketchBonds] = useState<SketchBond[]>([
    { from: 1, id: 1, order: 1, to: 2 },
    { from: 2, id: 2, order: 1, to: 3 },
  ]);
  const [selectedAtomId, setSelectedAtomId] = useState<number | null>(2);
  const [selectedElement, setSelectedElement] = useState('C');
  const [selectedBondOrder, setSelectedBondOrder] = useState<BondOrder>(1);
  const [dragAtomId, setDragAtomId] = useState<number | null>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [canvasScale, setCanvasScale] = useState(0.86);
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [sketchDirty, setSketchDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [highlightBusy, setHighlightBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fragmentError, setFragmentError] = useState<string | null>(null);
  const [fragmentStatus, setFragmentStatus] = useState<string | null>(null);
  const [fragmentBusyId, setFragmentBusyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const panStartRef = useRef<{ clientX: number; clientY: number; offsetX: number; offsetY: number } | null>(null);
  const didPanRef = useRef(false);
  const sketchMolfile = useMemo(
    () => buildSketchMolfile(sketchAtoms, sketchBonds),
    [sketchAtoms, sketchBonds],
  );
  const fragmentLibrary = useMemo(
    () => [...defaultFragmentLibrary, ...customFragments],
    [customFragments],
  );
  const currentWorkingPayload = useMemo(() => {
    if (sketchAtoms.length && (sketchDirty || (!currentPayload.smiles && !currentPayload.molfile))) {
      return normalizePayload({ smiles: '', molfile: sketchMolfile });
    }

    return normalizePayload(currentPayload);
  }, [currentPayload, sketchAtoms.length, sketchDirty, sketchMolfile]);
  const normalizedFragmentQuery = normalizeFragmentInput(fragmentInput);
  const hasCurrentStructure = Boolean(currentWorkingPayload.smiles || currentWorkingPayload.molfile);
  const currentStructureKey = `${currentWorkingPayload.smiles || ''}|${currentWorkingPayload.molfile || ''}`;
  const selectedBondIndex = useMemo(
    () => sketchBonds.findIndex((bond) => bond.id === selectedBondId),
    [selectedBondId, sketchBonds],
  );
  const displayHighlightPreview =
    normalizedFragmentQuery && hasCurrentStructure ? highlightPreview : null;

  const projectToCanvas = useCallback((point: { x: number; y: number }) => ({
    x: (point.x - canvasOffset.x) / canvasScale,
    y: (point.y - canvasOffset.y) / canvasScale,
  }), [canvasOffset.x, canvasOffset.y, canvasScale]);

  const updateCanvasScale = useCallback((nextScale: number, focusPoint?: { x: number; y: number }) => {
    const clampedScale = clampCanvasScale(nextScale);
    setCanvasScale((currentScale) => {
      if (Math.abs(clampedScale - currentScale) < 0.001) {
        return currentScale;
      }

      if (focusPoint) {
        setCanvasOffset((currentOffset) => {
          const worldPoint = {
            x: (focusPoint.x - currentOffset.x) / currentScale,
            y: (focusPoint.y - currentOffset.y) / currentScale,
          };

          return {
            x: focusPoint.x - worldPoint.x * clampedScale,
            y: focusPoint.y - worldPoint.y * clampedScale,
          };
        });
      }

      return clampedScale;
    });
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const nextScale =
        canvasScale + (event.deltaY < 0 ? CANVAS_SCALE_STEP : -CANVAS_SCALE_STEP);
      
      const rect = svgEl.getBoundingClientRect();
      const point = {
        x: ((event.clientX - rect.left) / rect.width) * 840,
        y: ((event.clientY - rect.top) / rect.height) * 640,
      };
      
      updateCanvasScale(nextScale, point);
    };

    svgEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svgEl.removeEventListener('wheel', handleWheel);
    };
  }, [canvasScale, updateCanvasScale]);

  const resetCanvasView = useCallback(() => {
    setCanvasScale(0.86);
    setCanvasOffset({ x: 0, y: 0 });
  }, []);

  const matchedSketchAtoms = useMemo(
    () => new Set(displayHighlightPreview?.matchedAtoms.map((atomIndex) => sketchAtoms[atomIndex]?.id).filter(Boolean)),
    [displayHighlightPreview?.matchedAtoms, sketchAtoms],
  );
  const sketchContributionById = useMemo(() => {
    const values = new Map<number, number>();
    displayHighlightPreview?.matchedContributions?.forEach((item) => {
      const atom = sketchAtoms[item.atom_index];
      if (atom) {
        values.set(atom.id, item.normalized);
      }
    });
    if (!values.size && shapRawContributions.length) {
      shapRawContributions.forEach((raw, atomIndex) => {
        const atom = sketchAtoms[atomIndex];
        if (atom) {
          values.set(atom.id, raw);
        }
      });
    }
    return values;
  }, [displayHighlightPreview?.matchedContributions, shapRawContributions, sketchAtoms]);

  useEffect(() => {
    if (!acceptedSmiles) {
      return;
    }
    void loadStructure(acceptedSmiles);
  }, [acceptedSmiles]);

  const analyzePayload = async (payload: StructurePayload) => {
    const normalized = normalizePayload(payload);
    const analysis = await moleculeService.analyzeWorkspace(normalized);
    return {
      payload: {
        smiles: analysis.smiles || normalized.smiles,
        molfile: analysis.molfile || normalized.molfile,
      },
      svg: analysis.structure_2d || null,
    };
  };

  const loadSketchFromMolfile = (molfile?: string) => {
    const parsed = molfile ? parseMolfileSketch(molfile) : null;
    if (!parsed) {
      return;
    }
    setSketchAtoms(parsed.atoms);
    setSketchBonds(parsed.bonds);
    setSelectedAtomId(parsed.atoms[0]?.id || null);
    setSelectedBondId(null);
    setSketchDirty(false);
  };

  const loadSketchFromSmiles = (smiles?: string) => {
    const parsed = smiles ? sketchFromSmiles(smiles) : null;
    if (!parsed) {
      setSketchAtoms([]);
      setSketchBonds([]);
      setSelectedAtomId(null);
      setSelectedBondId(null);
      setSketchDirty(false);
      return;
    }

    setSketchAtoms(parsed.atoms);
    setSketchBonds(parsed.bonds);
    setSelectedAtomId(parsed.atoms[0]?.id || null);
    setSelectedBondId(null);
    setSketchDirty(false);
  };

  const loadStructure = async (structure: string) => {
    const isMol = isMolfile(structure);
    const cleaned = isMol ? structure : structure.trim();
    setError(null);
    setFragmentError(null);
    setFragmentStatus(null);

    if (!cleaned) {
      setCurrentPayload({ smiles: '', molfile: '' });
      setHighlightPreview(null);
      return;
    }

    const payload = isMol
      ? { smiles: '', molfile: cleaned }
      : { smiles: normalizeSmiles(cleaned), molfile: '' };

    try {
      const analyzed = await analyzePayload(payload);
      setCurrentPayload(analyzed.payload);
      if (analyzed.payload.molfile) {
        loadSketchFromMolfile(analyzed.payload.molfile);
      } else {
        loadSketchFromSmiles(analyzed.payload.smiles);
      }
    } catch {
      setCurrentPayload(payload);
      if (payload.molfile) {
        loadSketchFromMolfile(payload.molfile);
      } else {
        loadSketchFromSmiles(payload.smiles);
      }
    }
  };

  const clear = async () => {
    setCurrentPayload({ smiles: '', molfile: '' });
    setHighlightPreview(null);
    setFragmentInput('CCO');
    setSketchAtoms([]);
    setSketchBonds([]);
    setSelectedAtomId(null);
    setSelectedBondId(null);
    setSketchDirty(false);
    setError(null);
    setFragmentError(null);
    setFragmentStatus(null);
    setStatusMessage(null);
  };

  const exportStructure = async () => currentWorkingPayload;

  useImperativeHandle(ref, () => ({
    clear,
    exportStructure,
    loadStructure,
  }));



  const syncSketchStructure = async () => {
    if (!sketchMolfile) {
      setError('Draw at least one atom before syncing.');
      return;
    }

    setBusy(true);
    setError(null);
    setStatusMessage(null);

    try {
      const analyzed = await analyzePayload({ smiles: '', molfile: sketchMolfile });
      setCurrentPayload({ smiles: analyzed.payload.smiles, molfile: '' });
      setSketchDirty(false);
      setSelectedBondId(null);
      await onSyncStructure?.({ smiles: analyzed.payload.smiles, molfile: sketchMolfile });
      setStatusMessage('Structure editor synced. Atom contribution and fragment analysis now use the drawn structure.');
    } catch (syncError) {
      setError(getApiErrorMessage(syncError, 'The edited structure could not be converted into a molecule.'));
    } finally {
      setBusy(false);
    }
  };

  const addOrConnectAtom = (point: { x: number; y: number }) => {
    const hitAtom = sketchAtoms.find((atom) => distance(point, atom) <= 22);

    if (hitAtom) {
      if (selectedAtomId === hitAtom.id) {
        if (hitAtom.element !== selectedElement) {
          setSketchAtoms((current) =>
            current.map((a) => (a.id === hitAtom.id ? { ...a, element: selectedElement } : a)),
          );
          setSketchDirty(true);
        } else {
          setSelectedAtomId(null);
        }
        return;
      }

      if (selectedAtomId && selectedAtomId !== hitAtom.id) {
        const alreadyBonded = sketchBonds.some(
          (bond) =>
            (bond.from === selectedAtomId && bond.to === hitAtom.id) ||
            (bond.from === hitAtom.id && bond.to === selectedAtomId),
        );
        if (!alreadyBonded) {
          setSketchBonds((current) => [
            ...current,
            {
              from: selectedAtomId,
              id: Math.max(0, ...current.map((bond) => bond.id)) + 1,
              order: selectedBondOrder,
              to: hitAtom.id,
            },
          ]);
          setSketchDirty(true);
          setSelectedBondId(null);
        }
      }
      setSelectedAtomId(hitAtom.id);
      return;
    }

    const nextAtomId = Math.max(0, ...sketchAtoms.map((atom) => atom.id)) + 1;
    setSketchAtoms((current) => [
      ...current,
      {
        element: selectedElement,
        id: nextAtomId,
        x: point.x,
        y: point.y,
      },
    ]);
    setSketchDirty(true);

    if (selectedAtomId) {
      setSketchBonds((current) => [
        ...current,
        {
          from: selectedAtomId,
          id: Math.max(0, ...current.map((bond) => bond.id)) + 1,
          order: selectedBondOrder,
          to: nextAtomId,
        },
      ]);
    }
    setSelectedAtomId(nextAtomId);
    setSelectedBondId(null);
  };

  const deleteSelectedAtom = () => {
    if (!selectedAtomId) {
      return;
    }

    setSketchAtoms((current) => current.filter((atom) => atom.id !== selectedAtomId));
    setSketchBonds((current) =>
      current.filter((bond) => bond.from !== selectedAtomId && bond.to !== selectedAtomId),
    );
    setSelectedAtomId(null);
    setSelectedBondId(null);
    setSketchDirty(true);
  };

  const runHighlightPreview = useCallback(async (queryOverride?: string) => {
    const query = normalizeFragmentInput(queryOverride ?? fragmentInput);
    const targetSmiles = currentWorkingPayload.smiles;
    const targetMolfile = currentWorkingPayload.molfile;
    const requestId = ++highlightRequestRef.current;

    if (!query) {
      setHighlightPreview(null);
      setFragmentError(null);
      setFragmentStatus('Type a fragment like CCC, CCO, O, or c1ccccc1 to preview it on the current molecule.');
      return;
    }
    if (!targetSmiles && !targetMolfile) {
      setHighlightPreview(null);
      setFragmentError(null);
      setFragmentStatus('Load or draw a molecule first so the fragment preview knows what to match.');
      return;
    }

    setHighlightBusy(true);
    setFragmentError(null);

    try {
      const result = await moleculeService.highlightSubstructure(targetMolfile ? '' : targetSmiles, query, {
        molfile: targetMolfile || undefined,
        propertyName: shapProperty,
      });

      if (requestId !== highlightRequestRef.current) {
        return;
      }

      if (result.error) {
        setHighlightPreview(null);
        setFragmentError(result.error);
        setFragmentStatus(null);
        return;
      }

      setHighlightPreview({
        matchedContributions: result.matched_contributions,
        matchedAtoms: result.matched_atoms,
        numMatches: result.num_matches,
        propertyName: result.property_name,
        query,
        atomContributionSvg: result.atom_contribution_svg,
        svg: result.highlighted_svg,
      });

      if (result.num_matches > 0) {
        setFragmentStatus(
          `${getShapPropertyLabel(shapProperty)} view: ${query} matches ${result.matched_atoms.length} atom${result.matched_atoms.length === 1 ? '' : 's'} across ${result.num_matches} hit${result.num_matches === 1 ? '' : 's'}.`,
        );
        return;
      }

      setFragmentStatus(`${getShapPropertyLabel(shapProperty)} view: no matches found for ${query} on the current molecule.`);
    } catch (highlightError) {
      if (requestId !== highlightRequestRef.current) {
        return;
      }
      setHighlightPreview(null);
      setFragmentError(
        getApiErrorMessage(highlightError, 'That fragment could not be highlighted on the current molecule.'),
      );
      setFragmentStatus(null);
    } finally {
      if (requestId === highlightRequestRef.current) {
        setHighlightBusy(false);
      }
    }
  }, [currentWorkingPayload, fragmentInput, shapProperty]);

  const saveCustomFragment = () => {
    const smiles = normalizeFragmentInput(fragmentInput);
    if (!smiles) {
      setFragmentError('Type a fragment first, for example CCC or [*:1]O[*:2].');
      return;
    }

    const label = smiles;
    const nextFragment: FragmentOption = {
      custom: true,
      description: `Custom fragment: ${smiles}`,
      id: `custom-${Date.now()}`,
      label,
      smiles,
    };

    setCustomFragments((current) => {
      const next = [...current.filter((fragment) => fragment.smiles !== smiles), nextFragment];
      persistCustomFragmentLibrary(next);
      return next;
    });
    setFragmentError(null);
    setFragmentStatus(`${label} saved to your fragment library.`);
  };

  const removeCustomFragment = (fragmentId: string) => {
    setCustomFragments((current) => {
      const next = current.filter((fragment) => fragment.id !== fragmentId);
      persistCustomFragmentLibrary(next);
      return next;
    });
    setFragmentStatus('Fragment removed from your saved library.');
  };

  const insertFragment = async (fragment: FragmentOption) => {
    const payload = currentWorkingPayload;
    if (!payload.smiles && !payload.molfile) {
      try {
        await loadStructure(fragment.smiles);
        setFragmentStatus(`Loaded fragment ${fragment.label} as the active structure.`);
      } catch (loadError) {
        setFragmentError('Failed to load the fragment structure.');
      }
      return;
    }

    if (!isInsertionReadyFragment(fragment.smiles)) {
      setFragmentError('Type a fragment SMILES such as O, CCO, or [*:1]O[*:2] before inserting it.');
      return;
    }

    setFragmentBusyId(fragment.id);
    setFragmentError(null);
    setFragmentStatus(null);

    try {
      const result = await moleculeService.insertFragment({
        fragment_id: fragment.id,
        fragment_label: fragment.label,
        fragment_smiles: fragment.smiles,
        molfile: payload.molfile || undefined,
        selected_bond_index: selectedBondIndex >= 0 ? selectedBondIndex : undefined,
        smiles: payload.smiles || undefined,
      });

      await loadStructure(result.molfile || result.smiles);
      setSelectedBondId(null);
      setFragmentStatus(
        result.used_fallback_bond
          ? `${result.fragment_label} inserted using the best available bond. Updating the analysis workspace...`
          : `${result.fragment_label} inserted into bond ${result.selected_bond_index + 1}. Updating the analysis workspace...`,
      );
      await onSyncStructure?.({
        designEdit: {
          afterSmiles: result.smiles,
          beforeMolfile: payload.molfile || undefined,
          beforeSmiles: payload.smiles,
          fragmentLabel: result.fragment_label,
        },
        molfile: result.molfile,
        smiles: result.smiles,
      });
      setFragmentStatus(`${result.fragment_label} inserted. 2D atom contribution evidence is refreshed.`);
    } catch (insertError) {
      try {
        await loadStructure(fragment.smiles);
        setFragmentStatus(`Fallback: Loaded fragment ${fragment.label} as the active structure.`);
      } catch (loadError) {
        setFragmentError(
          getApiErrorMessage(insertError, 'Fragment insertion failed. Select a valid bond and try again.'),
        );
      }
    } finally {
      setFragmentBusyId(null);
    }
  };

  useEffect(() => {
    if (!normalizedFragmentQuery || !hasCurrentStructure) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runHighlightPreview(normalizedFragmentQuery);
    }, 320);

    return () => window.clearTimeout(timer);
  }, [currentStructureKey, normalizedFragmentQuery, hasCurrentStructure, runHighlightPreview, shapProperty]);

  return (
    <Box sx={shellSx}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={0.55} sx={topBarSx}>
        <Stack direction="row" spacing={0.4} useFlexGap flexWrap="wrap" sx={{ flex: 1, alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ color: 'var(--molvis-text)', fontSize: '0.82rem', fontWeight: 780, mr: 1.5 }}>
            Evidence Properties
          </Typography>
          {shapProperties.map((property) => (
            <Chip
              key={property.value}
              label={property.label}
              color={shapProperty === property.value ? 'primary' : 'default'}
              onClick={() => onChangeShapProperty?.(property.value)}
              sx={chipSx}
            />
          ))}
        </Stack>
        <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center', justifyContent: { xs: 'flex-start', lg: 'flex-end' } }}>
          <Button
            variant="outlined"
            startIcon={<UploadFileRoundedIcon />}
            onClick={onOpenStructureFile}
            sx={secondaryButtonSx}
          >
            Upload
          </Button>
        </Stack>
      </Stack>

      {invalidMessage || error ? (
        <Alert severity="warning" sx={alertSx}>
          {invalidMessage || error}
        </Alert>
      ) : null}

      {statusMessage ? <Typography sx={statusLineSx}>{statusMessage}</Typography> : null}

      <Box sx={workspaceGridSx}>
        <Box sx={viewerPanelSx}>
          {/* Top/Center Docked Fragment panel */}
          <Box sx={fragmentPanelSx}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.8} sx={fragmentControlRowSx}>
              <Stack direction="row" spacing={0.55} sx={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
                <Chip
                  label={selectedBondIndex >= 0 ? `Bond ${selectedBondIndex + 1}` : 'Auto bond'}
                  color={selectedBondIndex >= 0 ? 'primary' : 'default'}
                  sx={selectedBondChipSx}
                />
                <TextField
                  value={fragmentInput}
                  onChange={(event) => {
                    setFragmentInput(event.target.value);
                    if (fragmentError) {
                      setFragmentError(null);
                    }
                  }}
                  placeholder="Fragment: O, CCO, c1ccccc1, [*:1]O[*:2]"
                  size="small"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void runHighlightPreview();
                    }
                  }}
                  sx={fragmentInputSx}
                />
              </Stack>
              <Stack direction="row" spacing={0.55} useFlexGap flexWrap="wrap">
                <Button
                  variant="outlined"
                  disabled={highlightBusy}
                  onClick={() => {
                    void runHighlightPreview();
                  }}
                  sx={miniButtonSx}
                >
                  {highlightBusy ? 'Highlighting' : 'Highlight'}
                </Button>
                <Button
                  variant="contained"
                  disabled={
                    fragmentBusyId !== null ||
                    !isInsertionReadyFragment(fragmentInput) ||
                    !normalizeFragmentInput(fragmentInput)
                  }
                  onClick={() => {
                    void insertFragment({
                      custom: true,
                      description: `Custom fragment: ${normalizeFragmentInput(fragmentInput)}`,
                      id: 'draft-fragment',
                      label: normalizeFragmentInput(fragmentInput),
                      smiles: normalizeFragmentInput(fragmentInput),
                    });
                  }}
                  sx={miniPrimaryButtonSx}
                >
                  {fragmentBusyId ? 'Applying edit' : 'Apply edit'}
                </Button>
                <Button
                  variant="text"
                  disabled={!normalizeFragmentInput(fragmentInput)}
                  onClick={saveCustomFragment}
                  sx={miniTextButtonSx}
                >
                  Save fragment
                </Button>
              </Stack>
            </Stack>
            <Stack direction="row" spacing={0.55} useFlexGap flexWrap="wrap" sx={savedFragmentRowSx}>
              {fragmentLibrary.map((fragment) => (
                <Chip
                  key={fragment.id}
                  clickable
                  label={fragmentBusyId === fragment.id ? 'Inserting' : fragment.label}
                  onClick={() => {
                    setFragmentInput(fragment.smiles);
                    if (isInsertionReadyFragment(fragment.smiles)) {
                      void insertFragment(fragment);
                      return;
                    }
                    void runHighlightPreview(fragment.smiles);
                  }}
                  onDelete={fragment.custom ? () => removeCustomFragment(fragment.id) : undefined}
                  disabled={fragmentBusyId !== null}
                  sx={fragmentChipSx}
                  title={fragment.description}
                />
              ))}
            </Stack>
            {fragmentError ? (
              <Typography variant="caption" sx={fragmentErrorSx}>
                {fragmentError}
              </Typography>
            ) : null}
            {fragmentStatus ? (
              <Typography variant="caption" sx={fragmentStatusSx}>
                {fragmentStatus}
              </Typography>
            ) : null}
          </Box>

          <Box sx={svgStageSx}>
            <Box
              sx={{
                minHeight: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.45,
                borderRadius: 0,
                border: 'none',
                background: '#ffffff',
                p: 0,
                position: 'relative',
                height: '100%',
                '& > svg': {
                  width: '100%',
                  minHeight: { xs: 520, md: 640 },
                  flex: 1,
                  borderRadius: 1.1,
                  border: 'none',
                  boxShadow: 'none',
                },
              }}
            >
              {/* Left Drawing Toolbar */}
              <Box sx={leftToolbarSx}>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ width: '100%', justifyContent: 'center', p: 0.2 }}>
                  {atomPalette.map((element) => (
                    <Chip
                      key={element}
                      label={element}
                      color={selectedElement === element ? 'primary' : 'default'}
                      onClick={() => setSelectedElement(element)}
                      sx={{
                        ...chipSx,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        '& .MuiChip-label': { px: 0 },
                      }}
                    />
                  ))}
                </Stack>
                <Divider sx={{ my: 0.5, width: '90%' }} />
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ width: '100%', justifyContent: 'center', p: 0.2 }}>
                  {[1, 2, 3].map((order) => (
                    <Chip
                      key={order}
                      label={order === 1 ? '1x' : order === 2 ? '2x' : '3x'}
                      color={selectedBondOrder === order ? 'primary' : 'default'}
                      onClick={() => setSelectedBondOrder(order as BondOrder)}
                      sx={{
                        ...chipSx,
                        width: 28,
                        height: 24,
                        borderRadius: 0.5,
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        '& .MuiChip-label': { px: 0 },
                      }}
                    />
                  ))}
                </Stack>
                <Divider sx={{ my: 0.5, width: '90%' }} />
                <Stack spacing={0.75} sx={{ width: '100%', alignItems: 'center' }}>
                  <Button
                    variant="contained"
                    disabled={busy || !sketchAtoms.length}
                    onClick={() => {
                      void syncSketchStructure();
                    }}
                    sx={{ ...leftToolbarButtonSx, bgcolor: 'var(--molvis-accent)', color: '#ffffff' }}
                    title="Sync structure to workspace"
                  >
                    <SyncRoundedIcon sx={{ fontSize: 18 }} />
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={!selectedAtomId}
                    onClick={deleteSelectedAtom}
                    sx={leftToolbarButtonSx}
                    title="Delete selected atom"
                  >
                    <DeleteRoundedIcon sx={{ fontSize: 18 }} />
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      void clear();
                    }}
                    sx={leftToolbarButtonSx}
                    title="Clear canvas"
                  >
                    <RestartAltRoundedIcon sx={{ fontSize: 18 }} />
                  </Button>
                </Stack>
              </Box>

                <svg
                  viewBox="0 0 840 640"
                  role="img"
                  aria-label="Live molecule sketcher"
                  onClick={(event) => {
                    if (dragAtomId || didPanRef.current) {
                      didPanRef.current = false;
                      return;
                    }
                    addOrConnectAtom(projectToCanvas(getSvgPoint(event)));
                  }}
                  onMouseDown={(event) => {
                    if (event.button !== 0 || dragAtomId) {
                      return;
                    }
                    const point = getSvgClientPoint(event);
                    panStartRef.current = {
                      clientX: point.x,
                      clientY: point.y,
                      offsetX: canvasOffset.x,
                      offsetY: canvasOffset.y,
                    };
                    didPanRef.current = false;
                  }}
                  onMouseMove={(event) => {
                    if (dragAtomId) {
                      const point = projectToCanvas(getSvgPoint(event));
                      setSketchDirty(true);
                      setSketchAtoms((current) =>
                        current.map((atom) =>
                          atom.id === dragAtomId
                            ? {
                                ...atom,
                                x: point.x,
                                y: point.y,
                              }
                            : atom,
                        ),
                      );
                      return;
                    }

                    if (!panStartRef.current) {
                      return;
                    }

                    const point = getSvgClientPoint(event);
                    const nextOffset = {
                      x: panStartRef.current.offsetX + (point.x - panStartRef.current.clientX),
                      y: panStartRef.current.offsetY + (point.y - panStartRef.current.clientY),
                    };
                    if (
                      Math.abs(point.x - panStartRef.current.clientX) > 2 ||
                      Math.abs(point.y - panStartRef.current.clientY) > 2
                    ) {
                      didPanRef.current = true;
                      setIsPanningCanvas(true);
                    }
                    setCanvasOffset(nextOffset);
                  }}
                  onMouseUp={() => {
                    setDragAtomId(null);
                    panStartRef.current = null;
                    setIsPanningCanvas(false);
                  }}
                  onMouseLeave={() => {
                    setDragAtomId(null);
                    panStartRef.current = null;
                    setIsPanningCanvas(false);
                  }}
                  ref={svgRef}
                  style={{ cursor: dragAtomId ? 'grabbing' : isPanningCanvas ? 'grabbing' : 'grab' }}
                >
                  <rect width="840" height="640" fill="url(#canvasBg)" />
                  <rect width="840" height="640" fill="url(#sketchGrid)" />
                  <defs>
                    <radialGradient id="canvasBg" cx="50%" cy="50%" r="70%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#f8fafc" />
                    </radialGradient>
                    <pattern id="sketchGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                      <circle cx="12" cy="12" r="1.1" fill="#cbd5e1" />
                    </pattern>
                    <linearGradient id="carbonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#475569" />
                      <stop offset="100%" stopColor="#1e293b" />
                    </linearGradient>
                    <linearGradient id="oxygenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f87171" />
                      <stop offset="100%" stopColor="#dc2626" />
                    </linearGradient>
                    <linearGradient id="nitrogenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                    <linearGradient id="hydrogenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#cbd5e1" />
                    </linearGradient>
                    <linearGradient id="sulfurGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#fbbf24" />
                      <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <linearGradient id="halogenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="phosphorusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#c084fc" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                    <linearGradient id="defaultGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#94a3b8" />
                      <stop offset="100%" stopColor="#64748b" />
                    </linearGradient>
                    <filter id="atomGlow" x="-80%" y="-80%" width="260%" height="260%">
                      <feGaussianBlur stdDeviation="8" result="blur" />
                      <feColorMatrix
                        in="blur"
                        type="matrix"
                        values="0 0 0 0 0.23 0 0 0 0 0.51 0 0 0 0 1 0 0 0 0.75 0"
                      />
                      <feMerge>
                        <feMergeNode />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <g transform={`translate(${canvasOffset.x} ${canvasOffset.y})`}>
                  <g transform={`scale(${canvasScale})`}>
                  {sketchBonds.map((bond) => {
                    const from = sketchAtoms.find((atom) => atom.id === bond.from);
                    const to = sketchAtoms.find((atom) => atom.id === bond.to);
                    if (!from || !to) {
                      return null;
                    }
                    const active = bond.id === selectedBondId;
                    const dx = to.x - from.x;
                    const dy = to.y - from.y;
                    const len = Math.max(1, Math.hypot(dx, dy));
                    const ox = (-dy / len) * 5;
                    const oy = (dx / len) * 5;
                    const offsets = bond.order === 1 ? [0] : bond.order === 2 ? [-1, 1] : [-1.6, 0, 1.6];
                    return (
                      <g
                        key={bond.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedBondId((current) => (current === bond.id ? null : bond.id));
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke="transparent"
                          strokeLinecap="round"
                          strokeWidth="18"
                        />
                        {offsets.map((offset) => (
                          <line
                            key={offset}
                            x1={from.x + ox * offset}
                            y1={from.y + oy * offset}
                            x2={to.x + ox * offset}
                            y2={to.y + oy * offset}
                            stroke={active ? '#2958ff' : '#475569'}
                            strokeLinecap="round"
                            strokeWidth={active ? 4.5 : 3}
                          />
                        ))}
                      </g>
                    );
                  })}
                  {sketchAtoms.map((atom) => {
                    const selected = atom.id === selectedAtomId;
                    const matched = matchedSketchAtoms.has(atom.id);
                    const contribution = sketchContributionById.get(atom.id);
                    const hasContrib = typeof contribution === 'number' && !Number.isNaN(contribution);
                    return (
                      <g
                        key={atom.id}
                        filter={selected || matched || hasContrib ? 'url(#atomGlow)' : undefined}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          setSelectedAtomId(atom.id);
                          setSelectedBondId(null);
                          setDragAtomId(atom.id);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          addOrConnectAtom({ x: atom.x, y: atom.y });
                        }}
                        style={{ cursor: dragAtomId === atom.id ? 'grabbing' : 'grab' }}
                      >
                        <circle
                          cx={atom.x}
                          cy={atom.y}
                          r={matched ? 21 : 17}
                          fill={contributionColor(contribution, `url(#${getAtomGradId(atom.element)})`)}
                          stroke={matched ? '#f97316' : selected ? '#2958ff' : 'rgba(15, 23, 42, 0.15)'}
                          strokeWidth={matched ? 4 : selected ? 3.5 : 2}
                        />
                        <text
                          x={atom.x}
                          y={atom.y + 5}
                          textAnchor="middle"
                          fontFamily='"Space Grotesk", "Segoe UI", sans-serif'
                          fontSize="14"
                          fontWeight="800"
                          fill={hasContrib ? '#0f172a' : getAtomTextColor(atom.element)}
                        >
                          {atom.element}
                        </text>
                      </g>
                    );
                  })}
                  </g>
                  </g>
                </svg>
                <Stack direction="row" spacing={0.5} sx={zoomControlsSx}>
                  <Button
                    variant="outlined"
                    onClick={() => updateCanvasScale(canvasScale - CANVAS_SCALE_STEP, { x: 420, y: 270 })}
                    sx={zoomButtonSx}
                  >
                    -
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={resetCanvasView}
                    sx={zoomReadoutButtonSx}
                  >
                    {Math.round(canvasScale * 100)}%
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => updateCanvasScale(canvasScale + CANVAS_SCALE_STEP, { x: 420, y: 270 })}
                    sx={zoomButtonSx}
                  >
                    +
                  </Button>
                </Stack>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
});

const shellSx = {
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 0.35,
  height: '100%',
  borderRadius: 0,
  border: 'none',
  background: '#ffffff',
  p: { xs: 0.35, md: 0.4 },
  overflow: 'hidden',
} as const;

const topBarSx = {
  alignItems: { xs: 'stretch', lg: 'center' },
  justifyContent: 'space-between',
  gap: { xs: 0.5, lg: 0.55 },
  minHeight: 38,
} as const;



const workspaceGridSx = {
  minHeight: 0,
  flex: 1,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 0,
} as const;

const viewerPanelSx = {
  minHeight: { xs: 520, md: 720 },
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 0,
  border: 'none',
  background: '#ffffff',
  overflow: 'hidden',
  boxShadow: 'none',
} as const;

const svgStageSx = {
  minHeight: 0,
  flex: 1,
  p: 0,
  background: '#ffffff',
  position: 'relative',
} as const;

const leftToolbarSx = {
  position: 'absolute',
  top: { xs: 8, md: 12 },
  left: { xs: 8, md: 12 },
  zIndex: 2,
  display: 'flex',
  flexDirection: 'column',
  gap: 0.5,
  p: 0.85,
  borderRadius: 0.8,
  border: '1px solid rgba(20, 32, 51, 0.08)',
  background: 'rgba(255, 255, 255, 0.95)',
  boxShadow: '0 8px 24px rgba(20, 32, 51, 0.08)',
  backdropFilter: 'blur(12px)',
  width: 76,
  alignItems: 'center',
} as const;

const fragmentPanelSx = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  p: 1.75,
  borderBottom: '1px solid #e2e8f0',
  bgcolor: '#ffffff',
  color: 'var(--molvis-text)',
  borderRadius: 0,
} as const;

const leftToolbarButtonSx = {
  width: 36,
  height: 36,
  minWidth: 36,
  borderRadius: '4px',
  p: 0,
  color: 'var(--molvis-text)',
  borderColor: 'rgba(20, 32, 51, 0.12)',
} as const;

const miniButtonSx = {
  minHeight: 30,
  borderRadius: '4px',
  border: '1.5px solid #cbd5e1',
  color: '#334155',
  fontSize: '0.72rem',
  fontWeight: 720,
  px: 1.25,
  textTransform: 'none',
  transition: 'all 0.15s ease',
  '&:hover': {
    backgroundColor: '#f1f5f9',
    borderColor: '#94a3b8',
    color: '#0f172a',
  },
} as const;

const miniPrimaryButtonSx = {
  minHeight: 30,
  borderRadius: '4px',
  bgcolor: 'var(--molvis-accent)',
  color: '#ffffff',
  fontSize: '0.72rem',
  fontWeight: 760,
  px: 1.35,
  textTransform: 'none',
  transition: 'all 0.15s ease',
  border: 'none',
  '&:hover': {
    bgcolor: 'var(--molvis-accent-strong)',
    boxShadow: '0 2px 8px rgba(41, 88, 255, 0.25)',
  },
} as const;

const miniTextButtonSx = {
  minHeight: 30,
  borderRadius: '4px',
  color: '#64748b',
  fontSize: '0.72rem',
  fontWeight: 720,
  px: 1.25,
  textTransform: 'none',
  transition: 'all 0.15s ease',
  '&:hover': {
    color: '#334155',
    backgroundColor: '#f1f5f9',
  },
} as const;

const fragmentInputSx = {
  minWidth: { xs: '100%', sm: 200, lg: 240 },
  flex: 1,
  '& .MuiOutlinedInput-root': {
    minHeight: 30,
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    fontSize: '0.82rem',
    color: 'var(--molvis-text)',
    '& fieldset': {
      borderColor: '#cbd5e1',
      borderWidth: '1.5px',
    },
    '&:hover fieldset': {
      borderColor: '#94a3b8',
    },
    '&.Mui-focused fieldset': {
      borderColor: 'var(--molvis-accent)',
    },
  },
} as const;

const fragmentControlRowSx = {
  alignItems: { xs: 'stretch', lg: 'center' },
  justifyContent: 'space-between',
  gap: 0.55,
} as const;

const savedFragmentRowSx = {
  alignItems: 'center',
  borderTop: '1px solid rgba(20, 32, 51, 0.08)',
  pt: 0.55,
  gap: 0.5,
} as const;



const secondaryButtonSx = {
  minHeight: 32,
  borderRadius: '4px',
  borderColor: 'rgba(226, 232, 240, 0.8)',
  color: 'var(--molvis-text)',
  fontSize: '0.76rem',
  fontWeight: 760,
  px: 1.1,
  textTransform: 'none',
  transition: 'all 0.2s ease',
  border: '1.5px solid',
  '&:hover': {
    backgroundColor: '#fafbfc',
    borderColor: 'rgba(226, 232, 240, 1)',
  },
} as const;

const alertSx = {
  borderRadius: '4px',
  border: '1px solid rgba(226, 232, 240, 0.6)',
} as const;

const statusLineSx = {
  color: '#2563eb',
  fontSize: '0.8rem',
  fontWeight: 600,
  px: 0.2,
} as const;

const chipSx = {
  fontWeight: 780,
  fontSize: '0.68rem',
  height: 28,
  borderRadius: '4px',
  border: '1.5px solid rgba(226, 232, 240, 0.7)',
  '& .MuiChip-label': {
    px: 1,
  },
} as const;

const selectedBondChipSx = {
  fontWeight: 780,
  fontSize: '0.68rem',
  height: 28,
  borderRadius: '4px',
  border: '1.5px solid var(--molvis-accent)',
  backgroundColor: 'rgba(41, 88, 255, 0.08)',
  color: 'var(--molvis-accent)',
  '& .MuiChip-label': {
    px: 1,
  },
} as const;

const fragmentChipSx = {
  fontWeight: 720,
  fontSize: '0.7rem',
  height: 28,
  borderRadius: '4px',
  border: '1px solid #cbd5e1',
  backgroundColor: '#f1f5f9',
  color: '#334155',
  transition: 'all 0.15s ease',
  '&:hover': {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    color: '#0f172a',
  },
  '& .MuiChip-label': {
    px: 0.8,
  },
} as const;

const fragmentErrorSx = {
  color: '#b91c1c',
  lineHeight: 1.4,
  fontWeight: 600,
  fontSize: '0.8rem',
} as const;

const fragmentStatusSx = {
  color: '#1d4ed8',
  lineHeight: 1.4,
  fontWeight: 600,
  fontSize: '0.8rem',
} as const;

const zoomControlsSx = {
  position: 'absolute',
  right: { xs: 12, md: 16 },
  bottom: { xs: 12, md: 16 },
  zIndex: 2,
  borderRadius: 2,
  bgcolor: 'rgba(15, 23, 42, 0.82)',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.35)',
  p: 0.32,
  border: '1px solid rgba(255, 255, 255, 0.08)',
  backdropFilter: 'blur(16px)',
  gap: 0.3,
  display: 'flex',
} as const;

const zoomButtonSx = {
  minWidth: 34,
  minHeight: 34,
  px: 0,
  borderRadius: 0.8,
  borderColor: 'rgba(255, 255, 255, 0.15)',
  color: '#cbd5e1',
  fontSize: '1rem',
  fontWeight: 700,
  transition: 'all 0.2s ease',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
    color: '#ffffff',
  },
} as const;

const zoomReadoutButtonSx = {
  minWidth: 56,
  minHeight: 34,
  px: 0.5,
  borderRadius: 0.8,
  borderColor: 'rgba(255, 255, 255, 0.15)',
  color: '#cbd5e1',
  fontSize: '0.8rem',
  fontWeight: 700,
  transition: 'all 0.2s ease',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
    color: '#ffffff',
  },
} as const;
