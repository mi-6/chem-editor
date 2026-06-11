export type BondOrder = 1 | 2 | 3;

export type SketchAtom = {
  aromatic?: boolean;
  element: string;
  id: number;
  x: number;
  y: number;
};

export type SketchBond = {
  from: number;
  id: number;
  order: BondOrder;
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

function parseBracketAtom(content: string) {
  const match = content.match(/^\*|^[A-Z][a-z]?|^[bcnops]/);
  if (!match) return null;
  if (match[0] === '*') return null;
  return {
    aromatic: match[0] === match[0].toLowerCase(),
    element: normalizeElement(match[0]),
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

  const addAtom = (element: string, aromatic = false) => {
    if (!organicSubset.has(element)) return;
    const atom = { aromatic, element, id: atoms.length + 1 };
    atoms.push(atom);
    if (currentAtomId) {
      bonds.push({
        from: currentAtomId,
        id: bonds.length + 1,
        order: pendingBondOrder,
        to: atom.id,
      });
    }
    currentAtomId = atom.id;
    pendingBondOrder = 1;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const twoChar = source.slice(index, index + 2);

    if (char === '[') {
      const end = source.indexOf(']', index + 1);
      if (end < 0) continue;
      const parsed = parseBracketAtom(source.slice(index + 1, end));
      if (parsed) addAtom(parsed.element, parsed.aromatic);
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
      continue;
    }
    if (char === '%' && /\d{2}/.test(source.slice(index + 1, index + 3)) && currentAtomId) {
      const ringId = source.slice(index + 1, index + 3);
      const opening = ringOpenings.get(ringId);
      if (opening) {
        const path = findPath(bonds, opening.atomId, currentAtomId);
        bonds.push({ from: opening.atomId, id: bonds.length + 1, order: pendingBondOrder || opening.order, to: currentAtomId });
        if (path) ringPaths.push(path);
        ringOpenings.delete(ringId);
      } else {
        ringOpenings.set(ringId, { atomId: currentAtomId, order: pendingBondOrder });
      }
      pendingBondOrder = 1;
      index += 2;
      continue;
    }
    if (/\d/.test(char) && currentAtomId) {
      const opening = ringOpenings.get(char);
      if (opening) {
        const path = findPath(bonds, opening.atomId, currentAtomId);
        bonds.push({ from: opening.atomId, id: bonds.length + 1, order: pendingBondOrder || opening.order, to: currentAtomId });
        if (path) ringPaths.push(path);
        ringOpenings.delete(char);
      } else {
        ringOpenings.set(char, { atomId: currentAtomId, order: pendingBondOrder });
      }
      pendingBondOrder = 1;
      continue;
    }
    if (twoChar === 'Cl' || twoChar === 'Br' || twoChar === 'Cu') {
      addAtom(twoChar);
      index += 1;
      continue;
    }
    if (/[BCNOFPSI]/.test(char)) {
      addAtom(char);
      continue;
    }
    if (/[bcnops]/.test(char)) {
      addAtom(normalizeElement(char), true);
    }
  }

  if (!atoms.length) return null;
  return layoutGraph(atoms, bonds, ringPaths);
}
