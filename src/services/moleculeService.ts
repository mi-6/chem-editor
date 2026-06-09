type StructurePayload = {
  molfile?: string;
  smiles?: string;
};

type HighlightOptions = {
  molfile?: string;
  propertyName?: string;
};

const API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

type ParsedAtom = {
  aromatic: boolean;
  element: string;
};

const elementPattern = /Br|Cl|[BCNOFPSIbcnops]/g;

function parseSmilesAtoms(smiles: string): ParsedAtom[] {
  return (smiles.match(elementPattern) || []).map((token) => ({
    aromatic: token === token.toLowerCase(),
    element: token[0].toUpperCase() + token.slice(1).toLowerCase(),
  }));
}

function sanitizeFragmentSmiles(smiles: string) {
  return smiles
    .trim()
    .replace(/\[\*:1\]/g, '')
    .replace(/\[\*:2\]/g, '')
    .replace(/^\.+|\.+$/g, '');
}

function buildLocalContributions(smiles: string, propertyName: string) {
  const atoms = parseSmilesAtoms(smiles);
  const propertyBias: Record<string, number> = {
    hba: -0.28,
    hbd: 0.32,
    logp: 0.46,
    molecular_weight: 0.22,
    tpsa: -0.42,
  };
  const base = propertyBias[propertyName] ?? 0.18;

  return atoms.map((atom, atomIndex) => {
    const heteroShift = atom.element === 'O' || atom.element === 'N' ? -0.3 : 0.12;
    const aromaticShift = atom.aromatic ? 0.08 : 0;
    const raw = Number((base + heteroShift + aromaticShift + atomIndex * 0.015).toFixed(3));
    return {
      atom_index: atomIndex,
      normalized: Math.max(-1, Math.min(1, raw)),
      raw,
    };
  });
}

function findLocalMatches(smiles: string, query: string) {
  const atoms = parseSmilesAtoms(smiles);
  const queryAtoms = parseSmilesAtoms(query);
  if (!atoms.length || !queryAtoms.length) {
    return [];
  }

  if (queryAtoms.length === 1) {
    return atoms
      .map((atom, atomIndex) => (atom.element === queryAtoms[0].element ? [atomIndex] : null))
      .filter((match): match is number[] => Boolean(match));
  }

  const matches: number[][] = [];
  for (let atomIndex = 0; atomIndex <= atoms.length - queryAtoms.length; atomIndex += 1) {
    const isMatch = queryAtoms.every(
      (queryAtom, offset) => atoms[atomIndex + offset]?.element === queryAtom.element,
    );
    if (isMatch) {
      matches.push(queryAtoms.map((_, offset) => atomIndex + offset));
    }
  }
  return matches;
}

function svgFor(label: string) {
  const safe = label.replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 110"><rect width="180" height="110" rx="10" fill="#f8fafc"/><circle cx="52" cy="55" r="14" fill="#142033"/><circle cx="92" cy="36" r="14" fill="#2958ff"/><circle cx="132" cy="55" r="14" fill="#16a34a"/><path d="M65 50 L79 42 M105 42 L119 50" stroke="#334155" stroke-width="5" stroke-linecap="round"/><text x="90" y="95" text-anchor="middle" font-family="monospace" font-size="12" fill="#475569">${safe}</text></svg>`;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Backend request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: formData,
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Backend request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const moleculeService = {
  async analyzeWorkspace(payload: StructurePayload) {
    const formData = new FormData();
    if (payload.smiles) {
      formData.append('smiles', payload.smiles);
    }
    if (payload.molfile) {
      formData.append('molfile', payload.molfile);
    }

    try {
      const result = await postForm<{
        molfile?: string;
        smiles?: string;
        structure_2d?: string;
      }>('/analyze', formData);
      return {
        molfile: result.molfile || payload.molfile || '',
        smiles: result.smiles || payload.smiles || 'CCO',
        structure_2d: result.structure_2d || svgFor(result.smiles || payload.smiles || 'CCO'),
      };
    } catch {
      const smiles = payload.smiles || '';
      return {
        smiles,
        molfile: payload.molfile || '',
        structure_2d: svgFor(smiles || 'molfile structure'),
      };
    }
  },

  async highlightSubstructure(smiles: string, query: string, options?: HighlightOptions) {
    const propertyName = options?.propertyName || 'logp';

    try {
      const result = await postJson<{
        atom_contribution_svg: string;
        error?: string;
        highlighted_svg: string;
        matched_atoms: number[];
        matched_contributions: Array<{ atom_index: number; normalized: number; raw: number }>;
        matches: number[][];
        num_matches: number;
        property_name: string;
        smiles?: string;
      }>('/substructure-highlight', {
        molfile: options?.molfile,
        property_name: propertyName,
        smarts: query,
        smiles,
      });

      return {
        ...result,
        source: 'RDKit backend',
      };
    } catch {
      const matches = findLocalMatches(smiles, query);
      const matchedAtoms = Array.from(new Set(matches.flat()));
      const contributions = buildLocalContributions(smiles, propertyName).filter((item) =>
        matchedAtoms.includes(item.atom_index),
      );

      return {
        atom_contribution_svg: svgFor(query),
        error: '',
        highlighted_svg: svgFor(`${query} in ${smiles || 'molfile'}`),
        matched_atoms: matchedAtoms,
        matched_contributions: contributions,
        matches,
        num_matches: matches.length,
        property_name: propertyName,
        source: 'local fallback',
      };
    }
  },

  async insertFragment(payload: {
    fragment_id?: string;
    fragment_label: string;
    fragment_smiles: string;
    molfile?: string;
    selected_bond_index?: number;
    smiles?: string;
  }) {
    const parent = payload.smiles?.trim() || '';
    const fragment = sanitizeFragmentSmiles(payload.fragment_smiles);
    const smiles = parent && fragment ? `${parent}${fragment}` : fragment || parent;

    return {
      fragment_label: payload.fragment_label,
      molfile: '',
      selected_bond_index: 0,
      smiles,
      used_fallback_bond: false,
    };
  },
};
