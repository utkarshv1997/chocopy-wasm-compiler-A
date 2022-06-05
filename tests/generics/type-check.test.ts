import "mocha";
import { expect } from "chai";
import { assertTCFail, assertTC, assertPrint } from '../asserts.test';
import {augmentTEnv, emptyGlobalTypeEnv, tc, resolveClassTypeParams} from  '../../type-check';
import { Annotation, Program, Type, TypeVar, BinOp } from '../../ast';
import { NONE, NUM, BOOL, CLASS, TYPEVAR, PyZero, PyNone, PyInt } from '../../utils';

describe('Generics Type-Checker Tests', () => {
  it('should add type-variables to the global environment', () => {
    let [tcProgram, tcGlobalEnv] = tc(emptyGlobalTypeEnv(), {
      funs: [], inits: [], classes: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}},
    }); 

    expect(tcProgram).to.deep.equal({
      funs: [], inits: [], classes: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      a: {type: NONE, src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}},
    });
    expect(tcGlobalEnv.typevars.get('T')).to.deep.equal(['T']);
  });

  it('should throw an error on duplicate type-var identifier', () => {
    expect(() => tc(emptyGlobalTypeEnv(), {
      funs: [], inits: [], classes: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        {name: 'T', canonicalName: 'T2', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}},
    })).to.throw(); 
  });

  it('should resolve type parameter annotations to type variables in a class - 0', () => {
    let env = emptyGlobalTypeEnv(); 

    let program: Program<Annotation> = {
      funs: [], inits: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [],
          typeParams: ['T'],
          super: new Map(),
          a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}},
    };

    const newEnv = augmentTEnv(env, program);

    let resolvedCls = resolveClassTypeParams(newEnv, program.classes[0], 'test');
    expect(resolvedCls).to.deep.equal({
      name: 'Box',
      fields: [{name: 'x', type: TYPEVAR('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
      methods: [],
      typeParams: ['T'],
      super: new Map(),
      a: {eolLoc: {row: 0, col: 0, srcIdx: 0}},
    });

    const [fieldsTy, methodsTy, _] = newEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
  });

  it('should resolve type parameter annotations to type variables in a class - 1', () => {
    let env = emptyGlobalTypeEnv(); 

    let program: Program<Annotation> = {
      funs: [], inits: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [
            {name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
            {name: 'y', type: CLASS('Rat'), value: {tag: "none"}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
          ],
          methods: [],
          typeParams: ['T'],
          super: new Map(),
          a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ]
    };

    const newEnv = augmentTEnv(env, program);

    let resolvedCls = resolveClassTypeParams(newEnv, program.classes[0], 'test');
    expect(resolvedCls).to.deep.equal({
      name: 'Box',
      fields: [
        {name: 'x', type: TYPEVAR('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        {name: 'y', type: CLASS('Rat'), value: {tag: "none"}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      methods: [],
      typeParams: ['T'],
      super: new Map(),
      a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
    });


    const [fieldsTy, methodsTy, _] = newEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(fieldsTy.get('y')).to.deep.equal(CLASS('Rat'));
  });

  it('should resolve type parameter annotations to type variables in a class - 2', () => {
    let env = emptyGlobalTypeEnv(); 

    let program: Program<Annotation> = {
      funs: [], inits: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: []}
      ],
      classes: [
        {
          name: 'Box',
          fields: [
            {name: 'x', type: CLASS('T'), value: PyZero()},
          ],
          methods: [
            {
              name: 'get',
              parameters: [{name: 'self', type: CLASS('Box', [CLASS('T')])}],
              ret: CLASS('T'),
              inits: [],
              body: [{tag: 'return', value: {'tag': 'lookup', obj: {tag: 'id', name: 'self'}, field: 'x'}}],
              nonlocals: [],
              children: [],
            },
          ],
          typeParams: ['T'],
          super: new Map()
        }
      ]
    };

    const newEnv = augmentTEnv(env, program);

    let resolvedCls = resolveClassTypeParams(newEnv, program.classes[0], 'test');
    expect(resolvedCls).to.deep.equal({
      name: 'Box',
      fields: [
        {name: 'x', type: TYPEVAR('T'), value: PyZero()},
      ],
      methods: [
        {
          name: 'get',
          parameters: [{name: 'self', type: CLASS('Box', [TYPEVAR('T')])}],
          ret: TYPEVAR('T'),
          inits: [],
          body: [{tag: 'return', value: {'tag': 'lookup', obj: {tag: 'id', name: 'self'}, field: 'x'}}],
          nonlocals: [],
          children: [],
        },
      ],
      typeParams: ['T'],
      super: new Map()
    });

    const [fieldsTy, methodsTy, _] = newEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(methodsTy.get('get')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], TYPEVAR('T')]);
  });

  it('should resolve type parameter annotations to type variables in a class - 3', () => {
    let env = emptyGlobalTypeEnv(); 

    let program: Program<Annotation> = {
      funs: [], inits: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: []}
      ],
      classes: [
        {
          name: 'Box',
          fields: [
            {name: 'x', type: CLASS('T'), value: PyZero()},
          ],
          methods: [
            {
              name: 'get',
              parameters: [{name: 'self', type: CLASS('Box', [CLASS('T')])}],
              ret: CLASS('T'),
              inits: [
                {name: 'v', type: CLASS('T'), value: PyZero()},
              ],
              body: [
                {tag: 'return', value: {'tag': 'lookup', obj: {tag: 'id', name: 'self'}, field: 'x'}}
              ],
              nonlocals: [],
              children: [],
            },
          ],
          typeParams: ['T'],
          super: new Map()
        }
      ]
    };

    const newEnv = augmentTEnv(env, program);

    let resolvedCls = resolveClassTypeParams(newEnv, program.classes[0], 'test');
    expect(resolvedCls).to.deep.equal({
      name: 'Box',
      fields: [
        {name: 'x', type: TYPEVAR('T'), value: PyZero()},
      ],
      methods: [
        {
          name: 'get',
          parameters: [{name: 'self', type: CLASS('Box', [TYPEVAR('T')])}],
          ret: TYPEVAR('T'),
          inits: [
            {name: 'v', type: TYPEVAR('T'), value: PyZero()},
          ],
          body: [{tag: 'return', value: {'tag': 'lookup', obj: {tag: 'id', name: 'self'}, field: 'x'}}],
          nonlocals: [],
          children: [],
        },
      ],
      typeParams: ['T'],
      super: new Map()
    });

    const [fieldsTy, methodsTy, _] = newEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(methodsTy.get('get')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], TYPEVAR('T')]);
  });

  it('should typecheck generic class with one field and __init__ method', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [], inits: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    let [tcProgram, tcGlobalEnv] = tc(env, program);
    expect(tcProgram).to.deep.equal({
      funs: [], inits: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: TYPEVAR('T'), value: PyZero(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: NONE, inits: [], body: [], nonlocals:       [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
        } 
      ],
      a: {src: 'test', type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
    });

    const [fieldsTy, methodsTy, _] = tcGlobalEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(methodsTy.get('__init__')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], NONE]);
  });

  it('should throw an error when a generic class uses a type-variable that was not in its parameters', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [], inits: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        {name: 'U', canonicalName: 'U', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},{name: 'y', type: CLASS('U'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}} ],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [] , nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    expect(() => tc(env, program)).to.throw()
  });

  it('should throw an error when a generic class is parameterized by undefined type-variable', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [], inits: [], stmts: [],
      typeVarInits: [
        {name: 'U', canonicalName: 'U', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [] }
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        },
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    expect(() => tc(env, program)).to.throw()
  });

  it('should typecheck generic class with one field and a method', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [], inits: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: CLASS('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    let [tcProgram, tcGlobalEnv] = tc(env, program);
    expect(tcProgram).to.deep.equal({
      funs: [], inits: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: TYPEVAR('T'), value: PyZero(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: TYPEVAR('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {type: CLASS('Box', [TYPEVAR('T')]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [],
            a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
        } 
      ],
      a: {src: 'test', type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
    });

    const [fieldsTy, methodsTy, _] = tcGlobalEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(methodsTy.get('__init__')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], NONE]);
    expect(methodsTy.get('get')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], TYPEVAR('T')]);
  });

  it('should typecheck generic class type annotation', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: CLASS('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}}
            ], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "b", type: CLASS('Box', [NUM]), value: {tag: "none", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      stmts: [],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    let [tcProgram, tcGlobalEnv] = tc(env, program);
    expect(tcProgram).to.deep.equal({
      funs: [], stmts: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: TYPEVAR('T'), value: PyZero(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: TYPEVAR('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {type: CLASS('Box', [TYPEVAR('T')]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}},
        } 
      ],
      inits: [
        { name: "b", type: CLASS('Box', [NUM]), value: {tag: "none", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
    });

    const [fieldsTy, methodsTy, _] = tcGlobalEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(methodsTy.get('__init__')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], NONE]);
    expect(methodsTy.get('get')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], TYPEVAR('T')]);
    const globals = tcGlobalEnv.globals.get('b');
    expect(globals).to.deep.equal(CLASS('Box', [NUM]));
  });

  it('should enforce generic class type parameter number', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: CLASS('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "b", type: CLASS('Box', [BOOL, NUM]), value: {tag: "none"}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
      ],
      stmts: [],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    expect(() => tc(env, program)).to.throw();
  });

  it('should ensure generic class fields are initialized with __ZERO__', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: {tag: 'none'}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: CLASS('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'], super: new Map(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "b", type: CLASS('Box', [BOOL]), value: {tag: "none"}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
      ],
      stmts: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    expect(() => tc(env, program)).to.throw();
  });

  it('shouldnt allow "is" operator in generic class fields that are unconstrained', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "isNone", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: BOOL, inits: [], body: [
              {tag: "return", value: {tag: 'binop', op: BinOp.Is, left: {tag: "lookup", obj: {tag: "id", name: "self", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, right: { tag: "literal", value: {tag: "none"}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'], super: new Map(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
      ],
      stmts: [], a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    expect(() => tc(env, program)).to.throw();
  });

  var desAnno : Annotation = { type: { name: "Box", params: [{ tag: "number" }], tag: "class"} };
  it('should typecheck generic class object creation', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: CLASS('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'], super: new Map(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "b", type: CLASS('Box', [NUM]), value: {tag: "none"}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
      ],
      stmts: [
        { tag: "assign", 
          destruct: {
            isSimple: true,
            vars: [
              { target: { tag: "id", name: "b" },
                ignorable: false,
                star: false }]
        },
        value: {tag: "call", fn: {tag: "id", name: "Box", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, arguments: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, 
        a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    let [tcProgram, tcGlobalEnv] = tc(env, program);
    expect(tcProgram).to.deep.equal({
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: TYPEVAR('T'), value: PyZero(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: TYPEVAR('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {type: CLASS('Box', [TYPEVAR('T')]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'], super: new Map(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "b", type: CLASS('Box', [NUM]), value: {tag: "none"}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} },
      ],
      stmts: [
        { tag: "assign", destruct: {
          a: desAnno, 
          isSimple: true,
          vars: [
            { a: desAnno,
              target: { tag: "id", name: "b", a: desAnno },
              ignorable: false,
              star: false }]
        }, 
        value: {tag: "construct", name: "Box", a: {type: CLASS('Box', [NUM]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
    });

    const [fieldsTy, methodsTy, _] = tcGlobalEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(methodsTy.get('__init__')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], NONE]);
    expect(methodsTy.get('get')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], TYPEVAR('T')]);
    const globals = tcGlobalEnv.globals.get('b');
    expect(globals).to.deep.equal(CLASS('Box', [NUM]));
  });

  it('should typecheck generic class object field assignment', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: CLASS('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'], super: new Map(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "b", type: CLASS('Box', [NUM]), value: {tag: "none"} , a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      stmts: [
        { tag: "assign", 
          destruct: {
            a: desAnno,
            isSimple: true,
            vars: [
              { a: desAnno,
                target: { tag: "id", name: "b", a: desAnno },
                ignorable: false,
                star: false }]
        },
        value: {tag: "call", fn: {tag: "id", name: "Box", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, arguments: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, 
        a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        { tag: "field-assign", obj: {tag: "id", name: "b", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", value: {tag: "literal", value: {tag: "num", value: "10" as any}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    let [tcProgram, tcGlobalEnv] = tc(env, program);
    expect(tcProgram).to.deep.equal({
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: TYPEVAR('T'), value: PyZero(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: TYPEVAR('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {type: CLASS('Box', [TYPEVAR('T')]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'], super: new Map(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "b", type: CLASS('Box', [NUM]), value: {tag: "none"} , a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      stmts: [
        { tag: "assign", destruct: {
          a: desAnno,
          isSimple: true,
          vars: [
            { a: desAnno,
              target: { tag: "id", name: "b", a: desAnno },
              ignorable: false,
              star: false }]
        }, 
        value: {tag: "construct", name: "Box", a: {type: CLASS('Box', [NUM]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        { tag: "field-assign", obj: {tag: "id", name: "b", a: {type: CLASS('Box', [NUM]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", value: {tag: "literal", value: {tag: "num", value: "10" as any}, a: {type: NUM, eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
    });
    
    const [fieldsTy, methodsTy, _] = tcGlobalEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(methodsTy.get('__init__')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], NONE]);
    expect(methodsTy.get('get')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], TYPEVAR('T')]);
    const globals = tcGlobalEnv.globals.get('b');
    expect(globals).to.deep.equal(CLASS('Box', [NUM]));
  });

  it('should typecheck generic class object field lookup', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: CLASS('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "n", type: NUM, value: {tag: "num", value: "0" as any} , a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        { name: "b", type: CLASS('Box', [NUM]), value: {tag: "none"} , a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      stmts: [
        { tag: "assign", 
          destruct: {
            a: desAnno,
            isSimple: true,
            vars: [
              { a: desAnno,
                target: { tag: "id", name: "b", a: desAnno, },
                ignorable: false,
                star: false }]
          },
        value: {tag: "call", fn: {tag: "id", name: "Box", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, arguments: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, 
        a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        { tag: "assign", 
          destruct: {
            a: { type: { tag : "number" } },
            isSimple: true,
            vars: [
              { a: { type: { tag : "number" } },
                target: { tag: "id", name: "n", a: { type: { tag : "number" } }, },
                ignorable: false,
                star: false }]
          },
        value: {tag: "lookup", obj: {tag: "id", name: "b", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    let [tcProgram, tcGlobalEnv] = tc(env, program);
    expect(tcProgram).to.deep.equal({
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: TYPEVAR('T'), value: PyZero(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: TYPEVAR('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {type: CLASS('Box', [TYPEVAR('T')]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'], super: new Map(),
          a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "n", type: NUM, value: {tag: "num", value: "0" as any} , a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        { name: "b", type: CLASS('Box', [NUM]), value: {tag: "none"} , a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      stmts: [
        { tag: "assign", destruct: {
          a: desAnno,
          isSimple: true,
          vars: [
            { a: desAnno,
              target: { tag: "id", name: "b", a: desAnno, },
              ignorable: false,
              star: false }]
        }, 
        value: {tag: "construct", name: "Box", a: {type: CLASS('Box', [NUM]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        { tag: "assign", destruct: {
          a: { type: { tag : "number" } },
          isSimple: true,
          vars: [
            { a: { type: { tag : "number" } },
              target: { tag: "id", name: "n", a: { type: { tag : "number" } }, },
              ignorable: false,
              star: false }]
        }, 
        value: {tag: "lookup", obj: {tag: "id", name: "b", a: {type: CLASS('Box', [NUM]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {type: NUM, eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
    });

    const [fieldsTy, methodsTy, _] = tcGlobalEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(methodsTy.get('__init__')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], NONE]);
    expect(methodsTy.get('get')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], TYPEVAR('T')]);
    const globals = tcGlobalEnv.globals.get('b');
    expect(globals).to.deep.equal(CLASS('Box', [NUM]));
  });

  it('should typecheck generic class object method call', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: CLASS('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'], super: new Map(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "n", type: NUM, value: {tag: "num", value: "0" as any}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
        { name: "b", type: CLASS('Box', [NUM]), value: {tag: "none"}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
      ],
      stmts: [
        { tag: "assign", 
          destruct: {
            isSimple: true,
            vars: [
              { target: { tag: "id", name: "b" },
                ignorable: false,
                star: false }]
          },
        value: {tag: "call", fn: {tag: "id", name: "Box", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, arguments: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, 
        a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        { tag: "assign", 
          destruct: {
            isSimple: true,
            vars: [
              { target: { tag: "id", name: "n" },
                ignorable: false,
                star: false }]
        },
        value: {tag: "method-call", obj: {tag: "id", name: "b", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, method: "get", arguments: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, 
        a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    let [tcProgram, tcGlobalEnv] = tc(env, program);
    expect(tcProgram).to.deep.equal({
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: TYPEVAR('T'), value: PyZero(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: TYPEVAR('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {type: CLASS('Box', [TYPEVAR('T')]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'], super: new Map(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "n", type: NUM, value: {tag: "num", value: "0" as any}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} },
        { name: "b", type: CLASS('Box', [NUM]), value: {tag: "none"}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} },
      ],
      stmts: [
        { tag: "assign", destruct: {
          a: desAnno,
          isSimple: true,
          vars: [
            { a: desAnno,
              target: { tag: "id", name: "b", a: desAnno },
              ignorable: false,
              star: false }]
        }, 
        value: {tag: "construct", name: "Box", a: {type: CLASS('Box', [NUM]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        { tag: "assign", destruct: {
          a: { type: { tag: "number" } },
          isSimple: true,
          vars: [
            { a: { type: { tag: "number" } },
              target: { tag: "id", name: "n", a: { type: { tag: "number" } } },
              ignorable: false,
              star: false }]
        }, 
        value: {tag: "method-call", obj: {tag: "id", name: "b", a: {type: CLASS('Box', [NUM]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, method: "get", arguments: [], a: {type: NUM, eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
    });

    const [fieldsTy, methodsTy, _] = tcGlobalEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(methodsTy.get('__init__')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], NONE]);
    expect(methodsTy.get('get')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], TYPEVAR('T')]);
    const globals = tcGlobalEnv.globals.get('b');
    expect(globals).to.deep.equal(CLASS('Box', [NUM]));
  });

  var desAnnoComplex : Annotation = { type: { name: "Box", params: [{ name: "Box", params: [{ tag: "number" }], tag: "class" }], tag: "class"} };
  it('should typecheck generic class object field assignment with generic type constructor', () => {
    let env = emptyGlobalTypeEnv();
    let program: Program<Annotation> = {
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: CLASS('T'), value: PyZero(), a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} },
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [CLASS('T')]) }], ret: CLASS('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "b", type: CLASS('Box', [CLASS('Box', [NUM])]), value: {tag: "none"}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      stmts: [
        { tag: "assign", destruct: {
          isSimple: true,
          vars: [
            { target: { tag: "id", name: "b" },
              ignorable: false,
              star: false }]
          }, 
        value: {tag: "call", fn: {tag: "id", name: "Box"}, arguments: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        { tag: "field-assign", obj: {tag: "id", name: "b", a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", value: {tag: "call", fn: {tag: "id", name: "Box"}, arguments: [], a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', eolLoc: {row: 0, col: 0, srcIdx: 0}}
    }; 

    let [tcProgram, tcGlobalEnv] = tc(env, program);
    expect(tcProgram).to.deep.equal({
      funs: [],
      typeVarInits: [
        {name: 'T', canonicalName: 'T', types: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}
      ],
      classes: [
        {
          name: 'Box',
          fields: [{name: 'x', type: TYPEVAR('T'), value: PyZero(), a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}}],
          methods: [
            { name: "__init__", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: NONE, inits: [], body: [], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
            { name: "get", parameters: [{ name: "self", type: CLASS('Box', [TYPEVAR('T')]) }], ret: TYPEVAR('T'), inits: [], body: [
              {tag: "return", value: {tag: "lookup", obj: {tag: "id", name: "self", a: {type: CLASS('Box', [TYPEVAR('T')]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: TYPEVAR('T'), eolLoc: {row: 0, col: 0, srcIdx: 0}}}
            ], nonlocals: [], children: [], a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}} }
          ],
          typeParams: ['T'],
          super: new Map(),
          a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
        }
      ],
      inits: [
        { name: "b", type: CLASS('Box', [CLASS('Box', [NUM])]), value: {tag: "none"}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      stmts: [
        { tag: "assign", destruct: {
          a: desAnnoComplex,
          isSimple: true,
          vars: [
            { a: desAnnoComplex,
              target: { tag: "id", name: "b", a: desAnnoComplex },
              ignorable: false,
              star: false }]
        },
        value: {tag: "construct", name: "Box", a: {type: CLASS('Box', [CLASS('Box', [NUM])]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
        { tag: "field-assign", obj: {tag: "id", name: "b", a: {type: CLASS('Box', [CLASS('Box', [NUM])]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, field: "x", value: {tag: "construct", name: "Box", a: {type: CLASS('Box', [NUM]), eolLoc: {row: 0, col: 0, srcIdx: 0}}}, a: {type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}},
      ],
      a: {src: 'test', type: NONE, eolLoc: {row: 0, col: 0, srcIdx: 0}}
    });

    const [fieldsTy, methodsTy, _] = tcGlobalEnv.classes.get('Box');
    expect(fieldsTy.get('x')).to.deep.equal(TYPEVAR('T'));
    expect(methodsTy.get('__init__')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], NONE]);
    expect(methodsTy.get('get')).to.deep.equal([[CLASS('Box', [TYPEVAR('T')])], TYPEVAR('T')]);
    const globals = tcGlobalEnv.globals.get('b');
    expect(globals).to.deep.equal(CLASS('Box', [CLASS('Box', [NUM])]));
  })
});

describe('Generics/Inheritance introp tests', () => {
    assertTC('should type-check class with a generic superclass', `
      T = TypeVar('T')
      class SuperBox(Generic[T]):
        sv: T = __ZERO__ 

      class Box(Generic[T], SuperBox[T]):
        v: T = __ZERO__
    `, NONE);

    assertTC('should type-check class with a generic superclass with concrete instantiation - 1', `
      T = TypeVar('T')
      U = TypeVar('U')
      class SuperBox(Generic[T, U]):
        sv: T = __ZERO__ 

      class Box(Generic[T], SuperBox[int, bool]):
        v: T = __ZERO__
    `, NONE);

    assertTCFail('should check that generic superclass has correct number of type-arguments', `
      T = TypeVar('T')
      U = TypeVar('U')
      class SuperBox(Generic[T, U]):
        sv: T = __ZERO__ 

      class Box(Generic[T], SuperBox[T]):
        v: T = __ZERO__
    `);

    assertTCFail('should check that generic superclass arguments are valid classes', `
      T = TypeVar('T')
      U = TypeVar('U')
      class SuperBox(Generic[T, U]):
        sv: T = __ZERO__ 

      class Box(Generic[T], SuperBox[int, Something]):
        v: T = __ZERO__
    `);

    assertTCFail('should check that generic superclass arguments use valid type-parameters as arguments', `
      T = TypeVar('T')
      U = TypeVar('U')
      class SuperBox(Generic[T, U]):
        sv: T = __ZERO__ 

      class Box(Generic[T], SuperBox[U, int]):
        v: T = __ZERO__
    `);

    assertTC(`should type-check generic superclass field lookup - 0`, `
      T = TypeVar('T')

      class SuperBox(Generic[T]):
        sv: T = __ZERO__ 

      class Box(Generic[T], SuperBox[T]):
        v: T = __ZERO__


      b : Box[int] = None
      b = Box()
      b.sv 
    `, NUM);

    assertTC(`should type-check generic superclass field lookup - 1`, `
      T = TypeVar('T')
      U = TypeVar('U')
      V = TypeVar('V')

      class SuperSuperBox(Generic[V]):
        ssv: V = __ZERO__

      class SuperBox(Generic[T, V], SuperSuperBox[V]):
        sv: T = __ZERO__ 

      class Box(Generic[T, U, V], SuperBox[U, T]):
        v: T = __ZERO__


      b : Box[int, bool, bool] = None
      b = Box()
      b.ssv 
    `, NUM);

    assertTC(`should type-check generic superclass field lookup - 2`, `
      T = TypeVar('T')

      class SuperBox(Generic[T]):
        sv: T = __ZERO__ 

      class Box(SuperBox[int]):
        v: bool = False


      b : Box = None
      b = Box()
      b.sv 
    `, NUM);

    assertTC(`should type-check generic superclass method call - 0`, `
      T = TypeVar('T')
      U = TypeVar('U')
      V = TypeVar('V')

      class SuperBox(Generic[T, V]):
        sv: T = __ZERO__ 

        def foo(self: SuperBox[T, V], t: T, v: V) -> T:
          self.sv = t
          return t

      class Box(Generic[T, U, V], SuperBox[U, T]):
        v: T = __ZERO__

        def bar(self: Box[T, U, V], u: U, v: V) -> U:
          return u


      b : Box[int, bool, bool] = None
      b = Box()
      b.foo(True, 5) 
    `, BOOL);

    assertTC(`should type-check generic superclass method call - 1`, `
      T = TypeVar('T')
      U = TypeVar('U')
      V = TypeVar('V')

      class SuperBox(Generic[T, V]):
        sv: T = __ZERO__ 

        def foo(self: SuperBox[T, V], t: T, v: V) -> T:
          self.sv = t
          return t

      class Box(Generic[T, U, V], SuperBox[U, T]):
        v: T = __ZERO__

        def bar(self: Box[T, U, V], u: U, v: V) -> U:
          return u


      b : Box[int, bool, bool] = None
      b = Box()
      b.foo(b.bar(True, False), 5) 
    `, BOOL);

    assertTCFail(`should type-check generic superclass-subclass assignability - 1`, `
      T = TypeVar('T')

      class SuperBox(Generic[T]):
        sv: T = __ZERO__      

      class Box(Generic[T], SuperBox[T]):
        v: T = __ZERO__

      sb: SuperBox[bool] = None
      b: Box[int] = None

      b = Box()
      sb = b
    `);

    assertTCFail(`should type-check generic superclass-subclass assignability - 1`, `
      T = TypeVar('T')

      class SuperBox(Generic[T]):
        sv: T = __ZERO__      

      class Box(Generic[T], SuperBox[bool]):
        v: T = __ZERO__

      sb: SuperBox[int] = None
      b: Box[int] = None

      b = Box()
      sb = b
    `);
});

describe('Generic Functions as Methods', () => {
  assertTC(`should type-check non-generic class with generic function as method`, `
      T = TypeVar('T')

      class Box():
        v: int = 0

        def bar(self: Box, t: T) -> T:
          return t


      b : Box = None
      b = Box()
      b.bar(1)
      b.bar(True) 
    `, BOOL);

  assertTC(`should type-check generic class with generic function as method`, `
      T = TypeVar('T')
      U = TypeVar('U')

      class Box(Generic[T]):
        v: T = __ZERO__

        def bar(self: Box[T], u: U) -> U:
          return u


      b : Box[bool] = None
      b = Box()
      b.bar(True)     
      b.bar(1)
  `, NUM);

  assertTCFail(`should type-check and error when generic function as method uses previously unused typevar for return type`, `
      T = TypeVar('T')
      U = TypeVar('U')
      V = TypeVar('V')

      class Box(Generic[T]):
        v: T = __ZERO__

        def bar(self: Box[T], u: U) -> V:
          v: V = __ZERO__
          return v


      b : Box[bool] = None
      b = Box()
      b.bar(True)     
      b.bar(1)
  `);

  assertTC(`should type-check generic class with generic function as method and callable`, `
      T = TypeVar('T')
      U = TypeVar('U')

      class Box(Generic[T]):
        v: T = __ZERO__

        def map(self: Box[T], f: Callable[[T], U]) -> Box[U]:
          b : Box[U] = None
          b = Box()
          b.v = f(self.v)
          return b


      b : Box[int] = None
      f : Callable[[int], bool] = None
      b = Box()
      b.map(mklambda(Callable[[int], bool], lambda x: x % 2 == 0)).v
  `, BOOL);
});
