// Core data model for the PHP relations index.
// This module is intentionally free of any `vscode` dependency so it can be
// unit-tested as plain Node code. The UI layer converts these into vscode types.

/** Zero-based editor position. */
export interface Pos {
  line: number;
  character: number;
}

export interface Range {
  start: Pos;
  end: Pos;
}

export type DeclKind = 'class' | 'interface' | 'trait' | 'enum';
export type Visibility = 'public' | 'protected' | 'private';

export interface IndexedMethod {
  name: string;
  /** FQN of the type declaring this method. */
  ownerFqn: string;
  filePath: string;
  /** Range of the method name identifier. */
  nameRange: Range;
  visibility: Visibility;
  isAbstract: boolean;
  isStatic: boolean;
}

export interface IndexedType {
  /** Canonical fully-qualified name, no leading backslash (e.g. "App\\Models\\User"). */
  fqn: string;
  kind: DeclKind;
  /** Short name (e.g. "User"). */
  name: string;
  filePath: string;
  /** Range of the type name identifier. */
  nameRange: Range;
  isAbstract: boolean;
  /** Resolved FQNs of parent types (class: 0-1, interface: many). */
  extends: string[];
  /** Resolved FQNs of implemented interfaces. */
  implements: string[];
  /** Resolved FQNs of used traits. */
  usesTraits: string[];
  methods: IndexedMethod[];
}

export interface FileSymbols {
  filePath: string;
  types: IndexedType[];
}

/** Map from a lowercased alias/short-name to a canonical FQN. */
export type UseMap = Map<string, string>;
