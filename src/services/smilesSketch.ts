export type BondOrder = 1 | 2 | 3;

export type SketchAtom = {
  aromatic?: boolean;
  atomClass?: number;
  charge?: number;
  chirality?: string;
  element: string;
  hydrogens?: number;
  id: number;
  isotope?: number;
  x: number;
  y: number;
};

export type SketchBond = {
  aromatic?: boolean;
  from: number;
  id: number;
  order: BondOrder;
  stereo?: '/' | '\\';
  to: number;
};

type ParsedAtom = Omit<SketchAtom, 'x' | 'y'>;

const organicSubset = new Set([
  'B',
  'Br',
  'C',
  'Cl',
  'Cu',
  'F',
  'H',
  'I',
  'N',
  'Na',
  'O',
  'P',
  'S',
]);

function normalizeSmiles(value: string) {
  return value.trim().split(/\s+/)[0] || '';
}

function normalizeElement(token: string) {
  if (!token) return '';
  return token[0].toUpperCase() + token.slice(1).toLowerCase();
}

function parseBracketAtom(content: string): Omit<ParsedAtom, 'id'> | null {
  const isotopeMatch = content.match(/^\d+/);
  let rest = isotopeMatch ? content.slice(isotopeMatch[0].length) : content;
  const match = rest.match(/^\*|^[A-Z][a-z]?|^[bcnops]/);
  if (!match) return null;
  if (match[0] === '*') return null;
  rest = rest.slice(match[0].length);
  const chiralityMatch = rest.match(/^@@?|^@TH[12]|^@AL[12]|^@SP[123]|^@TB(?:[1-9]|1\d|20)|^@OH(?:[1-9]|[12]\d|30)/);
  if (chiralityMatch) rest = rest.slice(chiralityMatch[0].length);
  const hydrogenMatch = rest.match(/^H(\d?)/);
  if (hydrogenMatch) rest = rest.slice(hydrogenMatch[0].length);
  const chargeMatch = rest.match(/^(\+\+|--)|^([+-])(\d+)?/);
  if (chargeMatch) rest = rest.slice(chargeMatch[0].length);
  const classMatch = rest.match(/^:(\d+)/);

  let charge = 0;
  if (chargeMatch?.[1]) {
    charge = chargeMatch[1] === '++' ? 2 : -2;
  } else if (chargeMatch?.[2]) {
    charge = (chargeMatch[2] === '+' ? 1 : -1) * Number(chargeMatch[3] || 1);
  }

  return {
    atomClass: classMatch ? Number(classMatch[1]) : undefined,
    aromatic: match[0] === match[0].toLowerCase(),
    charge: charge || undefined,
    chirality: chiralityMatch?.[0],
    element: normalizeElement(match[0]),
    hydrogens: hydrogenMatch ? Number(hydrogenMatch[1] || 1) : undefined,
    isotope: isotopeMatch ? Number(isotopeMatch[0]) : undefined,
  };
}

function findPath(bonds: SketchBond[], start: number, end: number): number[] | null {
  const queue: number[][] = [[start]];
  const visited = new Set<number>([start]);

  while (queue.length) {
    const path = queue.shift() || [];
    const current = path[path.length - 1];
    if (current === end) return path;

    bonds
      .filter((bond) => bond.from === current || bond.to === current)
      .map((bond) => (bond.from === current ? bond.to : bond.from))
      .forEach((next) => {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      });
  }

  return null;
}

function layoutGraph(
  atoms: ParsedAtom[],
  bonds: SketchBond[],
  ringPaths: number[][],
): { atoms: SketchAtom[]; bonds: SketchBond[] } {
  const positions = new Map<number, { x: number; y: number }>();
  const largestRing = ringPaths.slice().sort((left, right) => right.length - left.length)[0] || [];
  const ringSet = new Set(largestRing);
  const center = { x: 500, y: 320 };

  if (largestRing.length >= 3) {
    const radius = Math.max(86, largestRing.length * 15);
    largestRing.forEach((atomId, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / largestRing.length;
      positions.set(atomId, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    });
  }

  const adjacency = new Map<number, number[]>();
  bonds.forEach((bond) => {
    adjacency.set(bond.from, [...(adjacency.get(bond.from) || []), bond.to]);
    adjacency.set(bond.to, [...(adjacency.get(bond.to) || []), bond.from]);
  });

  const connectedComponents: number[][] = [];
  const componentVisited = new Set<number>();
  atoms.forEach((atom) => {
    if (componentVisited.has(atom.id)) return;
    const queue = [atom.id];
    const component: number[] = [];
    componentVisited.add(atom.id);
    while (queue.length) {
      const atomId = queue.shift() || 0;
      component.push(atomId);
      (adjacency.get(atomId) || []).forEach((next) => {
        if (!componentVisited.has(next)) {
          componentVisited.add(next);
          queue.push(next);
        }
      });
    }
    connectedComponents.push(component);
  });

  connectedComponents.forEach((component, componentIndex) => {
    if (component.some((atomId) => positions.has(atomId))) return;
    const y = 320 + componentIndex * 110;
    component.forEach((atomId, index) => {
      positions.set(atomId, { x: 260 + index * 76, y });
    });
  });

  const queue = Array.from(positions.keys());
  const visited = new Set(queue);
  while (queue.length) {
    const atomId = queue.shift() || 0;
    const origin = positions.get(atomId);
    if (!origin) continue;

    const openNeighbors = (adjacency.get(atomId) || []).filter((neighbor) => !visited.has(neighbor));
    const baseAngle = ringSet.has(atomId)
      ? Math.atan2(origin.y - center.y, origin.x - center.x)
      : 0;

    openNeighbors.forEach((neighbor, index) => {
      const spread = openNeighbors.length > 1 ? (index - (openNeighbors.length - 1) / 2) * 0.85 : 0;
      const angle = baseAngle + spread;
      positions.set(neighbor, {
        x: origin.x + Math.cos(angle) * 76,
        y: origin.y + Math.sin(angle) * 76,
      });
      visited.add(neighbor);
      queue.push(neighbor);
    });
  }

  return {
    atoms: atoms.map((atom, index) => ({
      ...atom,
      ...(positions.get(atom.id) || { x: 260 + index * 76, y: 320 }),
    })),
    bonds,
  };
}

export function sketchFromSmiles(smiles: string): { atoms: SketchAtom[]; bonds: SketchBond[] } | null {
  const source = normalizeSmiles(smiles);
  if (!source) return null;

  const atoms: ParsedAtom[] = [];
  const bonds: SketchBond[] = [];
  const branchStack: Array<number | null> = [];
  const ringOpenings = new Map<string, { atomId: number; order: BondOrder }>();
  const ringPaths: number[][] = [];
  let currentAtomId: number | null = null;
  let pendingBondOrder: BondOrder = 1;
  let pendingStereo: '/' | '\\' | undefined;

  const addAtom = (atomInput: Omit<ParsedAtom, 'id'>) => {
    if (!organicSubset.has(atomInput.element)) return;
    const atom = { ...atomInput, id: atoms.length + 1 };
    atoms.push(atom);
    if (currentAtomId) {
      const previousAtom = atoms.find((candidate) => candidate.id === currentAtomId);
      bonds.push({
        aromatic: Boolean(atom.aromatic && previousAtom?.aromatic && pendingBondOrder === 1),
        from: currentAtomId,
        id: bonds.length + 1,
        order: pendingBondOrder,
        stereo: pendingStereo,
        to: atom.id,
      });
    }
    currentAtomId = atom.id;
    pendingBondOrder = 1;
    pendingStereo = undefined;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const twoChar = source.slice(index, index + 2);

    if (char === '[') {
      const end = source.indexOf(']', index + 1);
      if (end < 0) continue;
      const parsed = parseBracketAtom(source.slice(index + 1, end));
      if (parsed) addAtom(parsed);
      index = end;
      continue;
    }
    if (char === '(') {
      branchStack.push(currentAtomId);
      continue;
    }
    if (char === ')') {
      currentAtomId = branchStack.pop() ?? currentAtomId;
      continue;
    }
    if (char === '.') {
      currentAtomId = null;
      pendingBondOrder = 1;
      pendingStereo = undefined;
      continue;
    }
    if (char === '=') {
      pendingBondOrder = 2;
      continue;
    }
    if (char === '#') {
      pendingBondOrder = 3;
      continue;
    }
    if (char === '-' || char === '/' || char === '\\' || char === '@') {
      if (char === '/' || char === '\\') {
        pendingStereo = char;
      }
      continue;
    }
    if (char === '%' && /\d{2}/.test(source.slice(index + 1, index + 3)) && currentAtomId) {
      const ringId = source.slice(index + 1, index + 3);
      const opening = ringOpenings.get(ringId);
      if (opening) {
        const path = findPath(bonds, opening.atomId, currentAtomId);
        bonds.push({
          aromatic: Boolean(atoms.find((atom) => atom.id === opening.atomId)?.aromatic && atoms.find((atom) => atom.id === currentAtomId)?.aromatic),
          from: opening.atomId,
          id: bonds.length + 1,
          order: pendingBondOrder || opening.order,
          stereo: pendingStereo,
          to: currentAtomId,
        });
        if (path) ringPaths.push(path);
        ringOpenings.delete(ringId);
      } else {
        ringOpenings.set(ringId, { atomId: currentAtomId, order: pendingBondOrder });
      }
      pendingBondOrder = 1;
      pendingStereo = undefined;
      index += 2;
      continue;
    }
    if (/\d/.test(char) && currentAtomId) {
      const opening = ringOpenings.get(char);
      if (opening) {
        const path = findPath(bonds, opening.atomId, currentAtomId);
        bonds.push({
          aromatic: Boolean(atoms.find((atom) => atom.id === opening.atomId)?.aromatic && atoms.find((atom) => atom.id === currentAtomId)?.aromatic),
          from: opening.atomId,
          id: bonds.length + 1,
          order: pendingBondOrder || opening.order,
          stereo: pendingStereo,
          to: currentAtomId,
        });
        if (path) ringPaths.push(path);
        ringOpenings.delete(char);
      } else {
        ringOpenings.set(char, { atomId: currentAtomId, order: pendingBondOrder });
      }
      pendingBondOrder = 1;
      pendingStereo = undefined;
      continue;
    }
    if (twoChar === 'Cl' || twoChar === 'Br' || twoChar === 'Cu') {
      addAtom({ aromatic: false, element: twoChar });
      index += 1;
      continue;
    }
    if (/[BCNOFPSI]/.test(char)) {
      addAtom({ aromatic: false, element: char });
      continue;
    }
    if (/[bcnops]/.test(char)) {
      addAtom({ aromatic: true, element: normalizeElement(char) });
    }
  }

  if (!atoms.length) return null;
  return layoutGraph(atoms, bonds, ringPaths);
}
