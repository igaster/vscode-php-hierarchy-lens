import { PhpIndex, fqnKey } from '../index/phpIndex';
import { IndexedMethod, IndexedType } from '../index/types';

export type PrototypeRelation = 'implements' | 'overrides';

export interface Prototype {
  method: IndexedMethod;
  relation: PrototypeRelation;
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function findMethod(type: IndexedType, name: string): IndexedMethod | undefined {
  return type.methods.find((m) => sameName(m.name, name));
}

/**
 * High-level relationship queries used by the CodeLens and gutter UI. All graph
 * walking (transitive descendants, ancestor chains, interface closures) lives
 * here; PhpIndex only stores direct edges.
 */
export class RelationService {
  constructor(private readonly index: PhpIndex) {}

  /** All transitive subclasses of a class. */
  getInheritors(type: IndexedType): IndexedType[] {
    return this.descendants(type);
  }

  /**
   * All types that conform to the given interface, transitively: classes/enums
   * that implement it, sub-interfaces that extend it, and their descendants.
   * Walks the reverse edges (implementors + subtypes) rather than scanning the
   * whole index.
   */
  getImplementations(iface: IndexedType): IndexedType[] {
    const seen = new Set<string>();
    const out: IndexedType[] = [];
    const stack: IndexedType[] = [
      ...this.index.directImplementors(iface.fqn),
      ...this.index.directSubclasses(iface.fqn),
    ];
    while (stack.length > 0) {
      const t = stack.pop()!;
      const key = fqnKey(t.fqn);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(t);
      stack.push(...this.index.directImplementors(t.fqn), ...this.index.directSubclasses(t.fqn));
    }
    return out;
  }

  /** Concrete methods that implement/override an interface or abstract method. */
  getImplementationsOfMethod(method: IndexedMethod): IndexedMethod[] {
    const owner = this.index.getType(method.ownerFqn);
    if (!owner) {
      return [];
    }
    const implementingTypes =
      owner.kind === 'interface' ? this.getImplementations(owner) : this.descendants(owner);
    const result: IndexedMethod[] = [];
    for (const t of implementingTypes) {
      const m = findMethod(t, method.name);
      if (m && !m.isAbstract) {
        result.push(m);
      }
    }
    return result;
  }

  /** Methods in subclasses that override the given method. */
  getOverrides(method: IndexedMethod): IndexedMethod[] {
    if (method.visibility === 'private') {
      return [];
    }
    const owner = this.index.getType(method.ownerFqn);
    if (!owner) {
      return [];
    }
    const result: IndexedMethod[] = [];
    for (const t of this.descendants(owner)) {
      const m = findMethod(t, method.name);
      if (m) {
        result.push(m);
      }
    }
    return result;
  }

  /** The base declaration a method implements or overrides, if any. */
  getPrototype(method: IndexedMethod): Prototype | undefined {
    if (method.visibility === 'private') {
      return undefined;
    }
    const owner = this.index.getType(method.ownerFqn);
    if (!owner) {
      return undefined;
    }

    // An interface contract takes priority ("implements").
    for (const ifaceKey of this.implementedInterfaceKeys(owner)) {
      const iface = this.index.getType(ifaceKey);
      const m = iface && findMethod(iface, method.name);
      if (m) {
        return { method: m, relation: 'implements' };
      }
    }

    // Otherwise the nearest ancestor class that declares it ("overrides").
    for (const ancestor of this.ancestorClasses(owner)) {
      const m = findMethod(ancestor, method.name);
      if (m) {
        return { method: m, relation: 'overrides' };
      }
    }

    // Finally, a used trait providing the method.
    for (const traitFqn of owner.usesTraits) {
      const trait = this.index.getType(traitFqn);
      const m = trait && findMethod(trait, method.name);
      if (m) {
        return { method: m, relation: 'overrides' };
      }
    }

    return undefined;
  }

  /** Direct parent types: extended class(es), implemented interfaces, and used traits. */
  getSuperTypes(type: IndexedType): IndexedType[] {
    const fqns = [...type.extends, ...type.implements, ...type.usesTraits];
    return fqns
      .map((f) => this.index.getType(f))
      .filter((t): t is IndexedType => t !== undefined);
  }

  getTraitUsers(trait: IndexedType): IndexedType[] {
    return this.index.directTraitUsers(trait.fqn);
  }

  // --- graph helpers -------------------------------------------------------

  /** Transitive subclasses of a type (classes extending it, directly or indirectly). */
  private descendants(type: IndexedType): IndexedType[] {
    const seen = new Set<string>();
    const out: IndexedType[] = [];
    const stack = [...this.index.directSubclasses(type.fqn)];
    while (stack.length > 0) {
      const t = stack.pop()!;
      const key = fqnKey(t.fqn);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(t);
      stack.push(...this.index.directSubclasses(t.fqn));
    }
    return out;
  }

  /** Ancestor classes walking up the `extends` chain, nearest first. */
  private ancestorClasses(type: IndexedType): IndexedType[] {
    const out: IndexedType[] = [];
    const seen = new Set<string>();
    let current: IndexedType | undefined = type;
    while (current) {
      const parentFqn: string | undefined = current.extends[0];
      if (!parentFqn) {
        break;
      }
      const key = fqnKey(parentFqn);
      if (seen.has(key)) {
        break;
      }
      seen.add(key);
      const parent = this.index.getType(parentFqn);
      if (!parent || parent.kind !== 'class') {
        break;
      }
      out.push(parent);
      current = parent;
    }
    return out;
  }

  /**
   * The set of interface FQN keys a type conforms to: its own `implements`, those
   * of every ancestor class, each expanded through interface `extends` closure.
   */
  private implementedInterfaceKeys(type: IndexedType): Set<string> {
    const result = new Set<string>();
    const classChain = [type, ...this.ancestorClasses(type)];
    const stack: string[] = [];
    for (const cls of classChain) {
      stack.push(...cls.implements);
    }
    while (stack.length > 0) {
      const fqn = stack.pop()!;
      const key = fqnKey(fqn);
      if (result.has(key)) {
        continue;
      }
      result.add(key);
      const iface = this.index.getType(fqn);
      if (iface) {
        stack.push(...iface.extends);
      }
    }
    return result;
  }
}
