import { UseMap } from './types';

export interface UseItem {
  /** Imported FQN as written, without a leading backslash. */
  name: string;
  /** Optional alias identifier. */
  alias?: string;
}

function shortName(fqn: string): string {
  const parts = fqn.split('\\');
  return parts[parts.length - 1];
}

/** Build an alias/short-name -> FQN map from a file's `use` statements. */
export function buildUseMap(items: UseItem[]): UseMap {
  const map: UseMap = new Map();
  for (const item of items) {
    const key = (item.alias ?? shortName(item.name)).toLowerCase();
    map.set(key, item.name.replace(/^\\/, ''));
  }
  return map;
}

/**
 * Resolve a type reference to a canonical FQN (no leading backslash).
 *
 * `resolution` is php-parser's classification of the written name:
 *  - 'fqn' — fully qualified (had a leading backslash)
 *  - 'qn'  — qualified (contains a backslash, no leading one)
 *  - 'uqn' — unqualified (single segment)
 *  - 'rn'  — relative (`namespace\...`)
 */
export function resolveTypeName(
  written: string,
  resolution: string,
  namespace: string,
  useMap: UseMap,
): string {
  const ns = namespace.replace(/^\\/, '');

  if (resolution === 'fqn') {
    return written.replace(/^\\/, '');
  }

  if (resolution === 'rn') {
    // `namespace\Foo` -> current namespace + `\Foo`
    const rest = written.replace(/^namespace\\?/, '');
    return ns ? (rest ? `${ns}\\${rest}` : ns) : rest;
  }

  const firstSegment = written.split('\\')[0];
  const aliased = useMap.get(firstSegment.toLowerCase());

  if (resolution === 'uqn') {
    if (aliased) {
      return aliased;
    }
    return ns ? `${ns}\\${written}` : written;
  }

  // 'qn' (or anything else): qualified name
  if (aliased) {
    const rest = written.slice(firstSegment.length); // includes leading '\'
    return `${aliased}${rest}`;
  }
  return ns ? `${ns}\\${written}` : written;
}
