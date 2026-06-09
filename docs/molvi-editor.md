# MolVis Editor Module

## 1. Module Overview

The MolVis Editor module is responsible for creating, editing, and validating small-molecule structures inside the MolVis workspace. It accepts SMILES strings, MDL molfiles, or structures drawn in Ketcher, validates them locally and against the MolVis backend, and produces a normalized `StructurePayload` (`smiles` + `molfile`) that other modules (visualization, generation, retrosynthesis) can consume. It does not perform property prediction, 3D rendering, or synthesis planning on its own.

## 2. Interface Definition

### Frontend components (React)

All components live under `client/` and are imported in the host app via the `@editor/*` path alias.

| Export | File | Purpose |
|--------|------|---------|
| `EditorPage` | `client/EditorPage.tsx` | Full-page editor route (`/editor`) with command input and structure canvas |
| `StructureEditorPanel` | `client/StructureEditorPanel.tsx` | Text-based SMILES / molfile editor with sync callbacks |
| `StructureEvidenceEditor` | `client/StructureEvidenceEditor.tsx` | Rich editor with SHAP overlay support, file paste, and sync controls |
| `KetcherEditorPanel` | `client/KetcherEditorPanel.tsx` | Modal Ketcher drawing surface with live 2D preview |
| `WorkspaceEditorHandle` | `client/StructureEditorPanel.tsx` | Imperative ref API: `loadStructure`, `exportStructure`, `clear` |

#### `StructurePayload` (shared output type)

```typescript
interface StructurePayload {
  smiles: string;    // Canonical or user-entered SMILES
  molfile: string;   // MDL mol block (V2000/V3000)
  designEdit?: {     // Optional fragment-edit metadata
    afterSmiles: string;
    beforeSmiles: string;
    beforeMolfile?: string;
    fragmentLabel: string;
  };
}
```

#### Component props

**`StructureEditorPanel`**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `onStructureChange` | `(payload: StructurePayload) => void \| Promise<void>` | Yes | Called whenever the user edits the structure |
| `acceptedSmiles` | `string` | No | Last validated SMILES shown as confirmation |
| `explainOverlaySvg` | `string \| null` | No | Optional SVG overlay (e.g. atom contribution heatmap) |
| `invalidMessage` | `string \| null` | No | External validation error to display |

**`KetcherEditorPanel`**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `smiles` | `string` | Yes | Initial structure |
| `onCancel` | `() => void` | Yes | Close handler |
| `onPreviewArtifact` | `(artifact: WorkspaceArtifact) => void` | Yes | Push preview artifact to workspace |
| `onApplyMolecule` | `(payload: { smiles: string; molfile: string }) => void` | No | Apply drawn structure to workspace |

### Local chemistry service (`client/ketcherService.ts`)

Browser-side conversions using Ketcher Standalone (no server round-trip required):

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `smilesToMolfile(smiles)` | SMILES string | MDL molfile string | Convert SMILES → mol |
| `molfileToSmiles(molfile)` | MDL molfile | SMILES string | Convert mol → canonical SMILES |
| `cleanMolfile(molfile)` | MDL molfile | MDL molfile | Ketcher structure cleanup |
| `checkMolfile(molfile)` | MDL molfile | Validation map | Checks valence, overlaps, pseudoatoms |

### Host-app dependencies

This module expects the following from the MolVis host application (not included in this repo):

| Dependency | Path alias | Used for |
|------------|------------|----------|
| API client | `@/services/api` | Authenticated HTTP |
| Molecule service | `@/services/moleculeService` | `analyzeWorkspace()` for 2D SVG + molfile validation |
| Command executor | `@/lib/commandExecutor` | Natural-language edit commands on `EditorPage` |
| Workspace hooks | `@/features/chat/hooks/useMoleculeWorkspaceState` | Shared molecule context on `EditorPage` |
| SVG sanitizer | `@/lib/sanitize` | Safe SVG rendering |

### Backend

The editor module has no dedicated server code in this repository. Structure validation and 2D SVG generation are delegated to the host MolVis API (`POST /api/v1/molecules/analyze` or equivalent workspace analyze endpoint via `moleculeService.analyzeWorkspace`).

## 3. Usage Example

### Minimal integration — text editor panel

```tsx
import { useState } from 'react';
import { StructureEditorPanel, type StructurePayload } from '@editor/StructureEditorPanel';

export function MyEditorHost() {
  const [structure, setStructure] = useState<StructurePayload>({ smiles: '', molfile: '' });

  return (
    <StructureEditorPanel
      acceptedSmiles={structure.smiles}
      onStructureChange={async (payload) => {
        setStructure(payload);
        // payload.smiles and payload.molfile are ready for downstream modules
      }}
    />
  );
}
```

**Expected result:** Typing `CC(=O)Oc1ccccc1C(=O)O` (aspirin) into the SMILES field triggers `onStructureChange` with a populated `smiles` field. After backend validation, `acceptedSmiles` reflects the canonical form.

### Ketcher draw flow

```tsx
import { KetcherEditorPanel } from '@editor/KetcherEditorPanel';

<KetcherEditorPanel
  smiles="c1ccccc1"
  onCancel={() => setOpen(false)}
  onPreviewArtifact={(artifact) => workspace.pushArtifact(artifact)}
  onApplyMolecule={({ smiles, molfile }) => {
    setCurrentStructure({ smiles, molfile });
    setOpen(false);
  }}
/>
```

**Expected result:** User draws benzene in Ketcher, sees a live 2D SVG preview, and on apply receives `{ smiles: 'c1ccccc1', molfile: '...' }`.

## 4. How to Extend

### Add a new input mode (e.g. SDF paste)

1. Edit `client/StructureEditorPanel.tsx` — add detection logic in `detectMode()` and parsing in `toPayload()`.
2. Do **not** change the `StructurePayload` shape without updating downstream consumers (visualization, generator).
3. If conversion requires server-side parsing, call `moleculeService` rather than adding backend code to this repo.

### Add Ketcher toolbar actions

1. Edit `client/KetcherEditorPanel.tsx` — add UI controls and wire them through `ketcherService.ts`.
2. Keep all Ketcher Standalone calls in `ketcherService.ts` so the panel stays a thin UI layer.

### Add editor commands (natural language)

1. Edit command patterns in the **host app** at `client/src/lib/commandExecutor.ts` (not in this repo).
2. `EditorPage.tsx` already calls `createLocalCommandPlan` / `executeCommandPlan` — extend the host command DSL, not the editor components directly.

### Conventions

- All new exports must be re-exported through the host app's Vite alias `@editor/*`.
- Props callbacks should accept `StructurePayload`, never raw strings alone.
- Always sanitize SVG content with `@/lib/sanitize` before rendering.

## 5. Known Limitations

- **Not standalone.** Requires the MolVis host app for routing, auth, API, and shared UI primitives (`@/` imports).
- **No dedicated backend** in this repository. Molfile generation for complex structures depends on the host `moleculeService`.
- **File upload on EditorPage** is stubbed (`onOpenStructureFile` shows a placeholder message). File import works in `StructureEvidenceEditor` via paste, not a full file-picker workflow on the dedicated editor page.
- **SDF multi-molecule files** are not supported; only single-structure SMILES/molfile input is handled.
- **Ketcher bundle size** is large (~20 MB). Lazy-load `KetcherEditorPanel` in the host app (already done in `ChatWorkspacePage`).
- **Real-time 2D → 3D sync** is not implemented inside this module; navigation to the visualization module must be wired in the host app.
- **Server-side editor routes** do not exist; all editing is client-side with optional backend validation.
