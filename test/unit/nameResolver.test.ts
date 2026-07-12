import * as assert from 'assert';
import { buildUseMap, resolveTypeName } from '../../src/index/nameResolver';

describe('nameResolver', () => {
  describe('buildUseMap', () => {
    it('keys unaliased imports by their lowercased short name', () => {
      const map = buildUseMap([{ name: 'App\\Other\\Thing' }]);
      assert.strictEqual(map.get('thing'), 'App\\Other\\Thing');
    });

    it('keys aliased imports by their lowercased alias', () => {
      const map = buildUseMap([{ name: 'App\\Contracts\\DummyInterface', alias: 'DI' }]);
      assert.strictEqual(map.get('di'), 'App\\Contracts\\DummyInterface');
      assert.strictEqual(map.get('dummyinterface'), undefined);
    });
  });

  describe('resolveTypeName', () => {
    const useMap = buildUseMap([
      { name: 'App\\Contracts\\DummyInterface', alias: 'DI' },
      { name: 'App\\Other\\Thing' },
    ]);

    it('resolves a fully-qualified name by stripping the leading backslash', () => {
      assert.strictEqual(resolveTypeName('\\App\\Base', 'fqn', 'App\\Models', useMap), 'App\\Base');
    });

    it('resolves an unqualified name via the use map (alias)', () => {
      assert.strictEqual(resolveTypeName('DI', 'uqn', 'App\\Models', useMap), 'App\\Contracts\\DummyInterface');
    });

    it('resolves an unqualified name via the use map (short name)', () => {
      assert.strictEqual(resolveTypeName('Thing', 'uqn', 'App\\Models', useMap), 'App\\Other\\Thing');
    });

    it('resolves an unqualified name not in the use map against the current namespace', () => {
      assert.strictEqual(resolveTypeName('BaseClasss', 'uqn', 'App\\Models', useMap), 'App\\Models\\BaseClasss');
    });

    it('resolves an unqualified name in the global namespace to itself', () => {
      assert.strictEqual(resolveTypeName('BaseClasss', 'uqn', '', useMap), 'BaseClasss');
    });

    it('resolves a qualified name using the use map for its first segment', () => {
      assert.strictEqual(resolveTypeName('DI\\Nested', 'qn', 'App\\Models', useMap), 'App\\Contracts\\DummyInterface\\Nested');
    });

    it('resolves a qualified name with an unknown first segment against the current namespace', () => {
      assert.strictEqual(resolveTypeName('Sub\\Foo', 'qn', 'App\\Models', useMap), 'App\\Models\\Sub\\Foo');
    });
  });
});
