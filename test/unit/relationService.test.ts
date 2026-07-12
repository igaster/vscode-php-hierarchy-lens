import * as assert from 'assert';
import { PhpIndex } from '../../src/index/phpIndex';
import { analyzeFile } from '../../src/index/astWalker';
import { RelationService } from '../../src/relations/relationService';
import { IndexedMethod, IndexedType } from '../../src/index/types';

// Mirrors the screenshot exactly (global namespace).
const CODE = `<?php
interface DummyInterface {
    public function interfaceMethod();
}
class BaseClasss implements DummyInterface {
    use HelperTrait;
    public function interfaceMethod() {}
    public function otherMethod() {}
    private function secret() {}
}
class ChildClasss extends BaseClasss implements DummyInterface {
    public function interfaceMethod() {}
    public function otherMethod() {}
}
trait HelperTrait {
    public function help() {}
}
`;

function setup(): { index: PhpIndex; rel: RelationService } {
  const index = new PhpIndex();
  index.setFile('/proj/a.php', analyzeFile(CODE, '/proj/a.php').types);
  return { index, rel: new RelationService(index) };
}

function type(index: PhpIndex, fqn: string): IndexedType {
  const t = index.getType(fqn);
  assert.ok(t, `missing type ${fqn}`);
  return t;
}

function method(index: PhpIndex, fqn: string, name: string): IndexedMethod {
  const m = type(index, fqn).methods.find((x) => x.name === name);
  assert.ok(m, `missing method ${fqn}::${name}`);
  return m;
}

function count(list: unknown[]): number {
  return list.length;
}

describe('RelationService', () => {
  it('interface: 2 implementations', () => {
    const { index, rel } = setup();
    assert.strictEqual(count(rel.getImplementations(type(index, 'DummyInterface'))), 2);
  });

  it('interface method: 2 implementations', () => {
    const { index, rel } = setup();
    const impls = rel.getImplementationsOfMethod(method(index, 'DummyInterface', 'interfaceMethod'));
    assert.deepStrictEqual(impls.map((m) => m.ownerFqn).sort(), ['BaseClasss', 'ChildClasss']);
  });

  it('base class: 1 inheritor', () => {
    const { index, rel } = setup();
    assert.deepStrictEqual(rel.getInheritors(type(index, 'BaseClasss')).map((t) => t.name), ['ChildClasss']);
  });

  it('base method overridden below: 1 override', () => {
    const { index, rel } = setup();
    const overrides = rel.getOverrides(method(index, 'BaseClasss', 'otherMethod'));
    assert.deepStrictEqual(overrides.map((m) => m.ownerFqn), ['ChildClasss']);
  });

  it('private method has no overrides', () => {
    const { index, rel } = setup();
    assert.strictEqual(count(rel.getOverrides(method(index, 'BaseClasss', 'secret'))), 0);
  });

  it('base method implementing an interface: prototype is "implements" the interface method', () => {
    const { index, rel } = setup();
    const proto = rel.getPrototype(method(index, 'BaseClasss', 'interfaceMethod'));
    assert.ok(proto);
    assert.strictEqual(proto.relation, 'implements');
    assert.strictEqual(proto.method.ownerFqn, 'DummyInterface');
  });

  it('child method overriding a concrete parent method: prototype is "overrides"', () => {
    const { index, rel } = setup();
    const proto = rel.getPrototype(method(index, 'ChildClasss', 'otherMethod'));
    assert.ok(proto);
    assert.strictEqual(proto.relation, 'overrides');
    assert.strictEqual(proto.method.ownerFqn, 'BaseClasss');
  });

  it('child method that both overrides and implements: interface contract wins ("implements")', () => {
    const { index, rel } = setup();
    const proto = rel.getPrototype(method(index, 'ChildClasss', 'interfaceMethod'));
    assert.ok(proto);
    assert.strictEqual(proto.relation, 'implements');
    assert.strictEqual(proto.method.ownerFqn, 'DummyInterface');
  });

  it('method with no base declaration has no prototype', () => {
    const { index, rel } = setup();
    assert.strictEqual(rel.getPrototype(method(index, 'BaseClasss', 'otherMethod')), undefined);
  });

  it('class super types include both parent class and implemented interface', () => {
    const { index, rel } = setup();
    const supers = rel.getSuperTypes(type(index, 'ChildClasss')).map((t) => t.name).sort();
    assert.deepStrictEqual(supers, ['BaseClasss', 'DummyInterface']);
  });

  it('trait: used by 1 class', () => {
    const { index, rel } = setup();
    assert.deepStrictEqual(rel.getTraitUsers(type(index, 'HelperTrait')).map((t) => t.name), ['BaseClasss']);
  });

  it('counts a sub-interface as an implementation of its parent interface', () => {
    const index = new PhpIndex();
    index.setFile('/p/a.php', analyzeFile('<?php interface A {} interface B extends A {}', '/p/a.php').types);
    const rel = new RelationService(index);
    assert.ok(
      rel.getImplementations(index.getType('A')!).some((t) => t.name === 'B'),
      'B extends A should count toward A',
    );
  });

  it('counts an enum implementing an interface as an implementation', () => {
    const index = new PhpIndex();
    index.setFile('/p/a.php', analyzeFile('<?php interface A {} enum E implements A { case X; }', '/p/a.php').types);
    const rel = new RelationService(index);
    assert.ok(rel.getImplementations(index.getType('A')!).some((t) => t.name === 'E'));
  });
});
