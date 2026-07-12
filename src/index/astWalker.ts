import { parseProgram } from './parser';
import { buildUseMap, resolveTypeName, UseItem } from './nameResolver';
import {
  DeclKind,
  FileSymbols,
  IndexedMethod,
  IndexedType,
  Range,
  UseMap,
  Visibility,
} from './types';

/** php-parser loc: 1-based line, 0-based column. Convert to a zero-based Range. */
function locToRange(loc: any): Range {
  if (!loc) {
    return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  }
  return {
    start: { line: loc.start.line - 1, character: loc.start.column },
    end: { line: loc.end.line - 1, character: loc.end.column },
  };
}

function identName(id: any): string {
  return typeof id === 'string' ? id : id?.name ?? '';
}

/** Parse a file and return its declared types with fully-resolved references. */
export function analyzeFile(code: string, filePath: string): FileSymbols {
  const ast = parseProgram(code, filePath);
  const types: IndexedType[] = [];
  processStatements(ast?.children ?? [], '', types, filePath);
  return { filePath, types };
}

function processStatements(
  statements: any[],
  namespace: string,
  types: IndexedType[],
  filePath: string,
): void {
  const useItems: UseItem[] = [];
  let useMap: UseMap = buildUseMap(useItems);

  for (const node of statements) {
    switch (node?.kind) {
      case 'namespace':
        processStatements(node.children ?? [], node.name ?? '', types, filePath);
        break;
      case 'usegroup':
        // Grouped imports (`use App\Foo\{Bar, Baz as B}`) carry the shared prefix
        // on the group node; plain imports leave it null and put the full name on
        // each item.
        for (const item of node.items ?? []) {
          const name = node.name ? `${node.name}\\${item.name}` : item.name;
          useItems.push({ name, alias: item.alias ? identName(item.alias) : undefined });
        }
        useMap = buildUseMap(useItems);
        break;
      case 'class':
      case 'interface':
      case 'trait':
      case 'enum':
        types.push(buildType(node, namespace, useMap, filePath));
        break;
      default:
        break;
    }
  }
}

function buildType(node: any, namespace: string, useMap: UseMap, filePath: string): IndexedType {
  const name = identName(node.name);
  const fqn = namespace ? `${namespace}\\${name}` : name;

  const resolve = (ref: any): string =>
    resolveTypeName(identName(ref), ref?.resolution ?? 'uqn', namespace, useMap);

  const extendsRefs = node.extends
    ? (Array.isArray(node.extends) ? node.extends : [node.extends]).map(resolve)
    : [];
  const implementsRefs = (node.implements ?? []).map(resolve);

  const members: any[] = node.body ?? node.children ?? [];
  const usesTraits: string[] = [];
  const methods: IndexedMethod[] = [];

  for (const member of members) {
    if (member?.kind === 'traituse') {
      for (const traitRef of member.traits ?? []) {
        usesTraits.push(resolve(traitRef));
      }
    } else if (member?.kind === 'method') {
      methods.push({
        name: identName(member.name),
        ownerFqn: fqn,
        filePath,
        nameRange: locToRange(member.name?.loc ?? member.loc),
        visibility: (member.visibility || 'public') as Visibility,
        isAbstract: !!member.isAbstract,
        isStatic: !!member.isStatic,
      });
    }
  }

  return {
    fqn,
    kind: node.kind as DeclKind,
    name,
    filePath,
    nameRange: locToRange(node.name?.loc ?? node.loc),
    isAbstract: !!node.isAbstract,
    extends: extendsRefs,
    implements: implementsRefs,
    usesTraits,
    methods,
  };
}
