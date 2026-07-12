import { IndexedType } from './types';

/** PHP identifiers are case-insensitive; index everything by a lowercased key. */
export function fqnKey(fqn: string): string {
  return fqn.replace(/^\\/, '').toLowerCase();
}

/**
 * In-memory store of indexed PHP types with reverse lookups (who extends /
 * implements / uses a given type).
 *
 * Reverse maps are maintained **incrementally**: `setFile`/`removeFile` only
 * touch the edges of the file's own types (O(file)), never the whole workspace.
 * This keeps per-render re-indexing cheap, which matters because the CodeLens
 * and gutter providers re-seed the current file on every render.
 */
export class PhpIndex {
  private byKey = new Map<string, IndexedType>();
  private byFile = new Map<string, IndexedType[]>();

  private subclasses = new Map<string, IndexedType[]>();
  private implementors = new Map<string, IndexedType[]>();
  private traitUsers = new Map<string, IndexedType[]>();

  setFile(filePath: string, types: IndexedType[]): void {
    this.removeContributions(this.byFile.get(filePath));
    this.byFile.set(filePath, types);
    this.addContributions(types);
  }

  removeFile(filePath: string): void {
    this.removeContributions(this.byFile.get(filePath));
    this.byFile.delete(filePath);
  }

  getType(fqn: string): IndexedType | undefined {
    return this.byKey.get(fqnKey(fqn));
  }

  allTypes(): IndexedType[] {
    return [...this.byKey.values()];
  }

  directSubclasses(fqn: string): IndexedType[] {
    return this.subclasses.get(fqnKey(fqn)) ?? [];
  }

  directImplementors(fqn: string): IndexedType[] {
    return this.implementors.get(fqnKey(fqn)) ?? [];
  }

  directTraitUsers(fqn: string): IndexedType[] {
    return this.traitUsers.get(fqnKey(fqn)) ?? [];
  }

  private addContributions(types: IndexedType[] | undefined): void {
    if (!types) {
      return;
    }
    for (const type of types) {
      this.byKey.set(fqnKey(type.fqn), type);
      for (const parent of type.extends) {
        this.addEdge(this.subclasses, fqnKey(parent), type);
      }
      for (const iface of type.implements) {
        this.addEdge(this.implementors, fqnKey(iface), type);
      }
      for (const trait of type.usesTraits) {
        this.addEdge(this.traitUsers, fqnKey(trait), type);
      }
    }
  }

  private removeContributions(types: IndexedType[] | undefined): void {
    if (!types) {
      return;
    }
    for (const type of types) {
      const key = fqnKey(type.fqn);
      // Only drop the forward mapping if it still points at this exact instance
      // (another file may have since defined the same FQN).
      if (this.byKey.get(key) === type) {
        this.byKey.delete(key);
      }
      for (const parent of type.extends) {
        this.removeEdge(this.subclasses, fqnKey(parent), type);
      }
      for (const iface of type.implements) {
        this.removeEdge(this.implementors, fqnKey(iface), type);
      }
      for (const trait of type.usesTraits) {
        this.removeEdge(this.traitUsers, fqnKey(trait), type);
      }
    }
  }

  private addEdge(map: Map<string, IndexedType[]>, key: string, type: IndexedType): void {
    const list = map.get(key);
    if (list) {
      list.push(type);
    } else {
      map.set(key, [type]);
    }
  }

  private removeEdge(map: Map<string, IndexedType[]>, key: string, type: IndexedType): void {
    const list = map.get(key);
    if (!list) {
      return;
    }
    const filtered = list.filter((t) => t !== type);
    if (filtered.length > 0) {
      map.set(key, filtered);
    } else {
      map.delete(key);
    }
  }
}
