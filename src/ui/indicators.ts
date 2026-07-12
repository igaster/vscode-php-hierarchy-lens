import { FileSymbols, IndexedMethod, IndexedType, Range } from '../index/types';
import { RelationService } from '../relations/relationService';

export type Direction = 'up' | 'down';

export type IndicatorKind =
  | 'implementations'
  | 'inheritors'
  | 'overrides'
  | 'parent'
  | 'traitUsages';

/** Enable/disable individual indicator kinds. Omitted kinds default to enabled. */
export type IndicatorOptions = Partial<Record<IndicatorKind, boolean>>;

export interface IndicatorTarget {
  filePath: string;
  range: Range;
  /** Human-readable name shown in the gutter hover (e.g. "App\\Foo" or "Foo::bar"). */
  label: string;
}

export interface Indicator {
  /** Name range of the declaration this indicator is anchored to. */
  anchor: Range;
  direction: Direction;
  kind: IndicatorKind;
  title: string;
  targets: IndicatorTarget[];
}

function shortName(fqn: string): string {
  const parts = fqn.split('\\');
  return parts[parts.length - 1];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function targetOfType(t: IndexedType): IndicatorTarget {
  return { filePath: t.filePath, range: t.nameRange, label: t.fqn };
}

function targetOfMethod(m: IndexedMethod): IndicatorTarget {
  return {
    filePath: m.filePath,
    range: m.nameRange,
    label: `${shortName(m.ownerFqn)}::${m.name}`,
  };
}

/**
 * Turn a file's declarations into the up/down indicators the UI renders as
 * CodeLens text and gutter icons. Pure and vscode-free so it can be unit-tested.
 */
export function buildIndicators(
  file: FileSymbols,
  rel: RelationService,
  options: IndicatorOptions = {},
): Indicator[] {
  const indicators: Indicator[] = [];

  for (const type of file.types) {
    addTypeIndicators(type, rel, indicators);
    for (const method of type.methods) {
      addMethodIndicators(type, method, rel, indicators);
    }
  }

  return indicators.filter((i) => options[i.kind] !== false);
}

function addTypeIndicators(type: IndexedType, rel: RelationService, out: Indicator[]): void {
  // Downward: who derives from this type.
  if (type.kind === 'interface') {
    const impls = rel.getImplementations(type);
    if (impls.length > 0) {
      out.push({
        anchor: type.nameRange,
        direction: 'down',
        kind: 'implementations',
        title: plural(impls.length, 'implementation'),
        targets: impls.map(targetOfType),
      });
    }
  } else if (type.kind === 'trait') {
    const users = rel.getTraitUsers(type);
    if (users.length > 0) {
      out.push({
        anchor: type.nameRange,
        direction: 'down',
        kind: 'traitUsages',
        title: `used by ${users.length}`,
        targets: users.map(targetOfType),
      });
    }
  } else {
    // class / enum
    const inheritors = rel.getInheritors(type);
    if (inheritors.length > 0) {
      out.push({
        anchor: type.nameRange,
        direction: 'down',
        kind: 'inheritors',
        title: plural(inheritors.length, 'inheritor'),
        targets: inheritors.map(targetOfType),
      });
    }
  }

  // Upward: the parent types this one extends/implements (classes, enums, and
  // sub-interfaces all have this; traits don't participate).
  if (type.kind !== 'trait') {
    const supers = rel.getSuperTypes(type);
    if (supers.length > 0) {
      out.push({
        anchor: type.nameRange,
        direction: 'up',
        kind: 'parent',
        title: superTitle(type),
        targets: supers.map(targetOfType),
      });
    }
  }
}

function superTitle(type: IndexedType): string {
  const parts: string[] = [];
  if (type.extends.length > 0) {
    parts.push(`extends ${type.extends.map(shortName).join(', ')}`);
  }
  if (type.implements.length > 0) {
    parts.push(`implements ${type.implements.map(shortName).join(', ')}`);
  }
  return parts.join(', ');
}

function addMethodIndicators(
  owner: IndexedType,
  method: IndexedMethod,
  rel: RelationService,
  out: Indicator[],
): void {
  // Downward: implementations (interface/abstract) or overrides (concrete).
  if (owner.kind === 'interface' || method.isAbstract) {
    const impls = rel.getImplementationsOfMethod(method);
    if (impls.length > 0) {
      out.push({
        anchor: method.nameRange,
        direction: 'down',
        kind: 'implementations',
        title: plural(impls.length, 'implementation'),
        targets: impls.map(targetOfMethod),
      });
    }
  } else {
    const overrides = rel.getOverrides(method);
    if (overrides.length > 0) {
      out.push({
        anchor: method.nameRange,
        direction: 'down',
        kind: 'overrides',
        title: plural(overrides.length, 'override'),
        targets: overrides.map(targetOfMethod),
      });
    }
  }

  // Upward: the base declaration this method implements or overrides.
  const proto = rel.getPrototype(method);
  if (proto) {
    out.push({
      anchor: method.nameRange,
      direction: 'up',
      kind: 'parent',
      title: `${proto.relation} ${shortName(proto.method.ownerFqn)}`,
      targets: [targetOfMethod(proto.method)],
    });
  }
}
