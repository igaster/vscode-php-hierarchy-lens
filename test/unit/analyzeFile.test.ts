import * as assert from 'assert';
import { analyzeFile } from '../../src/index/astWalker';
import { IndexedType } from '../../src/index/types';

const CODE = `<?php
namespace App\\Models;

use App\\Contracts\\DummyInterface as DI;

interface DummyInterface {
    public function interfaceMethod();
}

abstract class BaseClasss implements DI {
    use HelperTrait;
    public function interfaceMethod() {}
    abstract public function otherMethod();
    private function secret() {}
}

class ChildClasss extends BaseClasss implements DI {
    public function otherMethod() {}
}

trait HelperTrait {
    public function help() {}
}
`;

function byName(types: IndexedType[], name: string): IndexedType {
  const t = types.find((x) => x.name === name);
  assert.ok(t, `expected a type named ${name}`);
  return t;
}

describe('analyzeFile', () => {
  const { types } = analyzeFile(CODE, '/proj/models.php');

  it('finds every top-level type declaration', () => {
    assert.deepStrictEqual(
      types.map((t) => t.name).sort(),
      ['BaseClasss', 'ChildClasss', 'DummyInterface', 'HelperTrait'],
    );
  });

  it('assigns fully-qualified names using the current namespace', () => {
    assert.strictEqual(byName(types, 'BaseClasss').fqn, 'App\\Models\\BaseClasss');
    assert.strictEqual(byName(types, 'DummyInterface').fqn, 'App\\Models\\DummyInterface');
  });

  it('records the declaration kind', () => {
    assert.strictEqual(byName(types, 'DummyInterface').kind, 'interface');
    assert.strictEqual(byName(types, 'BaseClasss').kind, 'class');
    assert.strictEqual(byName(types, 'HelperTrait').kind, 'trait');
  });

  it('marks abstract classes', () => {
    assert.strictEqual(byName(types, 'BaseClasss').isAbstract, true);
    assert.strictEqual(byName(types, 'ChildClasss').isAbstract, false);
  });

  it('resolves implements to aliased FQNs', () => {
    assert.deepStrictEqual(byName(types, 'BaseClasss').implements, ['App\\Contracts\\DummyInterface']);
  });

  it('resolves extends to a namespaced FQN', () => {
    assert.deepStrictEqual(byName(types, 'ChildClasss').extends, ['App\\Models\\BaseClasss']);
  });

  it('resolves used traits', () => {
    assert.deepStrictEqual(byName(types, 'BaseClasss').usesTraits, ['App\\Models\\HelperTrait']);
  });

  it('captures methods with visibility and abstractness', () => {
    const base = byName(types, 'BaseClasss');
    const methodNames = base.methods.map((m) => m.name).sort();
    assert.deepStrictEqual(methodNames, ['interfaceMethod', 'otherMethod', 'secret']);
    const other = base.methods.find((m) => m.name === 'otherMethod')!;
    assert.strictEqual(other.isAbstract, true);
    const secret = base.methods.find((m) => m.name === 'secret')!;
    assert.strictEqual(secret.visibility, 'private');
  });

  it('records zero-based name ranges for methods', () => {
    const iface = byName(types, 'DummyInterface');
    const m = iface.methods[0];
    // `public function interfaceMethod();` is on source line 7 (1-based) => line 6 (0-based)
    assert.strictEqual(m.nameRange.start.line, 6);
    assert.strictEqual(m.name, 'interfaceMethod');
  });

  it('sets ownerFqn on methods', () => {
    const base = byName(types, 'BaseClasss');
    assert.strictEqual(base.methods[0].ownerFqn, 'App\\Models\\BaseClasss');
  });

  it('resolves grouped use imports using the group prefix', () => {
    const { types: t } = analyzeFile(
      "<?php\nnamespace App;\nuse App\\Contracts\\{Foo, Bar as Baz};\nclass C implements Foo, Baz {}\n",
      '/proj/c.php',
    );
    const c = t.find((x) => x.name === 'C')!;
    assert.deepStrictEqual(c.implements, ['App\\Contracts\\Foo', 'App\\Contracts\\Bar']);
  });

  it('indexes enums and resolves their implemented interfaces', () => {
    const { types: t } = analyzeFile(
      "<?php\nnamespace App;\nenum Status: string implements HasLabel { case A = 'a'; public function label() {} }\n",
      '/proj/e.php',
    );
    const e = t.find((x) => x.name === 'Status');
    assert.ok(e, 'enum should be indexed');
    assert.strictEqual(e!.kind, 'enum');
    assert.deepStrictEqual(e!.implements, ['App\\HasLabel']);
    assert.deepStrictEqual(e!.methods.map((m) => m.name), ['label']);
  });
});
