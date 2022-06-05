import { Annotation, stringifyOp, Stmt, Expr, Type, UniOp, BinOp, Literal, Program, FunDef, VarInit, Class, ClassT, Callable, TypeVar, Parameter, DestructuringAssignment, Assignable, AssignVar } from './ast';
import { NUM, BOOL, NONE, CLASS, CALLABLE, TYPEVAR, LIST } from './utils';
import { fullSrcLine, drawSquiggly } from './errors';

// I ❤️ TypeScript: https://github.com/microsoft/TypeScript/issues/13965

function bigintSafeStringify(thing : any) {
  return JSON.stringify(thing, (key, value) => typeof value === "bigint" ? value.toString() : value)
}

export class TypeCheckError extends Error {
  __proto__: Error;
  a?: Annotation | undefined;
  errMsg: string;

  constructor(SRC?: string, message?: string, a?: Annotation) {
    const fromLoc = a?.fromLoc;
    const endLoc = a?.endLoc;
    const eolLoc = a?.eolLoc;
    const trueProto = new.target.prototype;
    const loc = (a) ? ` on line ${fromLoc.row} at col ${fromLoc.col}` : '';
    const src = (a) ? fullSrcLine(SRC, fromLoc.srcIdx, fromLoc.col, eolLoc.srcIdx) : '';
    // TODO: how to draw squigglies if the error spans multiple lines?
    const squiggly = (a) ? drawSquiggly(fromLoc.row, endLoc.row, fromLoc.col, endLoc.col) : '';
    const msg = `\n\n${src}\n${squiggly}`;
    const res = "TYPE ERROR: " + message + loc + msg;
    super(res);
    this.a = (a) ?? undefined;
    this.errMsg = res;


    // Alternatively use Object.setPrototypeOf if you have an ES6 environment.
    this.__proto__ = trueProto;
  }

  public getA(): Annotation | undefined {
    return this.a;
  }

  public getErrMsg(): string {
    return this.errMsg;
  }

}

export type GlobalTypeEnv = {
  globals: Map<string, Type>,
  functions: Map<string, [Array<Type>, Type]>,
  classes: Map<string, [Map<string, Type>, Map<string, [Array<Type>, Type]>, Map<string,Array<Type>>, Array<string>]>,
  typevars: Map<string, [string]>
}

export type LocalTypeEnv = {
  vars: Map<string, Type>;
  expectedRet: Type;
  actualRet: Type;
  topLevel: Boolean;
};

const copyLocals = (locals: LocalTypeEnv): LocalTypeEnv => {
  return {
    ...locals,
    vars: new Map(locals.vars)
  }
}
const copyGlobals = (env: GlobalTypeEnv): GlobalTypeEnv => {
  return {
    globals: new Map(env.globals),
    functions: new Map(env.functions),
    classes: new Map(env.classes),
    typevars: new Map(env.typevars)
  };
}

export type NonlocalTypeEnv = LocalTypeEnv["vars"]

const defaultGlobalFunctions = new Map();
defaultGlobalFunctions.set("abs", [[NUM], NUM]);
defaultGlobalFunctions.set("max", [[NUM, NUM], NUM]);
defaultGlobalFunctions.set("min", [[NUM, NUM], NUM]);
defaultGlobalFunctions.set("pow", [[NUM, NUM], NUM]);
defaultGlobalFunctions.set("print", [[CLASS("object")], NUM]);
defaultGlobalFunctions.set("len", [[LIST(NUM)], NUM]);

export const defaultTypeEnv = {
  globals: new Map(),
  functions: defaultGlobalFunctions,
  classes: new Map(),
  typevars: new Map()
};

export function emptyGlobalTypeEnv(): GlobalTypeEnv {
  return {
    globals: new Map(),
    functions: new Map(),
    classes: new Map(),
    typevars: new Map()
  };
}

export function emptyLocalTypeEnv(): LocalTypeEnv {
  return {
    vars: new Map(),
    expectedRet: NONE,
    actualRet: NONE,
    topLevel: true,
  };
}

// combine the elements of two arrays into an array of tuples.
// DANGER: throws an error if argument arrays don't have the same length.
function zip<A, B>(l1: Array<A>, l2: Array<B>) : Array<[A, B]> {
  if(l1.length !== l2.length) {
    throw new TypeCheckError(`Tried to zip two arrays of different length`);
  }
  return l1.map((el, i) => [el, l2[i]]); 
}

export type TypeError = {
  message: string
}

export function equalCallable(t1: Callable, t2: Callable): boolean {
  return t1.params.length === t2.params.length &&
    t1.params.every((param, i) => equalType(param, t2.params[i])) && equalType(t1.ret, t2.ret);
}

// Check if a list of type-parameters are equal.
export function equalTypeParams(params1: Type[], params2: Type[]) : boolean {
  if(params1.length !== params2.length) {
    return false;
  }

  return zip(params1, params2).reduce((isEqual, [p1, p2]) => {
    return isEqual && equalType(p1, p2);
  }, true);
}

export function equalType(t1: Type, t2: Type) : boolean {
  return (
    (t1.tag === t2.tag && (t1.tag === NUM.tag || t1.tag === BOOL.tag || t1.tag === NONE.tag)) ||
    (t1.tag === "class" && t2.tag === "class" && t1.name === t2.name && equalTypeParams(t1.params, t2.params)) ||
    (t1.tag === "callable" && t2.tag === "callable" && equalCallable(t1, t2)) ||
    (t1.tag === "typevar" && t2.tag === "typevar" && t1.name === t2.name) ||
    (t1.tag === "list" && t2.tag === "list" && equalType(t1.itemType, t2.itemType)) ||
    (t1.tag === "empty" && t2.tag === "list") ||
    (t1.tag === "list" && t2.tag === "empty")

  );
}

export function isNoneOrClassOrCallable(t: Type) {
  return t.tag === "none" || t.tag === "class" || t.tag === "callable";
}

export function isSubClass(env: GlobalTypeEnv, t1: Type, t2: Type): boolean {
  if (t1.tag === "class" && t2.tag === "class") {
    const superclasses : Type[] = []
    getSuperclasses(env, t1, superclasses)
    return superclasses.some(t => equalType(t2, t));
  } else {
    return t1.tag === "none" && t2.tag === "class"
  }
}
const object_type_tags = ["class", "list", "callable"]
export function isSubtype(env: GlobalTypeEnv, t1: Type, t2: Type): boolean {
  return equalType(t1, t2) || (t1.tag === "none" && object_type_tags.includes(t2.tag)) || (t1.tag === "empty" && t2.tag === "list") || isSubClass(env, t1, t2);
}


export function isAssignable(env: GlobalTypeEnv, t1: Type, t2: Type): boolean {
  return isSubtype(env, t1, t2);
}

export function join(env: GlobalTypeEnv, t1: Type, t2: Type): Type {
  return NONE
}

// Test if a type is valid and does not have any undefined/non-existent
// classes and that all instantiated type-parameters are valid.
export function isValidType(env: GlobalTypeEnv, t: Type) : boolean {
  // primitive types are valid types.
  if(t.tag === "number" || t.tag === "bool" || t.tag === "none" || t.tag === "empty") {
    return true;
  }

  // TODO: haven't taken the time to understand what either is, 
  // but considering it always valid for now.
  if(t.tag === "either") {
    return true;
  }

  // TODO: type-variables always valid types in this context ?
  if(t.tag === "typevar") {
    return true; 
  }

  if(t.tag === "callable") {
    return t.params.every(p => isValidType(env, p)) && isValidType(env, t.ret);
  }

  if(t.tag === "list") {
    return isValidType(env, t.itemType);
  }

  // TODO: handle all other newer non-class types here

  // At this point we know t is a CLASS
  if(!env.classes.has(t.name)) {
    return false;  
  }
  
  let [_fieldsTy, _methodsTy, _, typeparams] = env.classes.get(t.name);

  if(t.params.length !== typeparams.length) {
    return false; 
  }

  return zip(typeparams, t.params).reduce((isValid, [typevar, typeparam]) => {
    return isValid && isValidType(env, typeparam);
  }, true);
}

// Populate the instantiated type-parameters of the class type objTy in
// field type fieldTy. This replaces typevars in fieldTy with their concrete
// instantiations from objTy. Uninstantiated type-parameters are left as typevars.
export function specializeFieldType(env: GlobalTypeEnv, objTy: Type, fieldTy: Type) : Type {
  if(objTy.tag !== "class") {
    // TODO: should we throw an error here ?
    // Don't think this should ever happen unless
    // something is really wrong.
    return fieldTy;
  }

  if(objTy.params.length === 0) {
    // classes without type parameters
    // do not need and specialization.
    return fieldTy;
  }

  // get a list of type-parameters of the class.
  let [_fields, _methods, _, typeparams] = env.classes.get(objTy.name);

  // create a mapping from the type-parameter name to the corresponding instantiated type.
  let map = new Map(zip(typeparams, objTy.params)); //.filter(([_typevar, typeparam]) => typeparam.tag !== "typevar"));
  return specializeType(map, fieldTy);
}

// Populate the instantiated type-parameters of the class type objTy in
// the method type given by argTypes and retType.
export function specializeMethodType(env: GlobalTypeEnv, objTy: Type, [argTypes, retType]: [Type[], Type]) : [Type[], Type] {
  if(objTy.tag !== "class") {
    // TODO: should we throw an error here ?
    // Don't think this should ever happen unless
    // something is really wrong.
    return [argTypes, retType];
  }

  if(objTy.params.length === 0) {
    // classes without type parameters
    // do not need any specialization.
    return [argTypes, retType];
  }

  let [_fields, _methods, _, typeparams] = env.classes.get(objTy.name);
  let map = new Map(zip(typeparams, objTy.params));

  let specializedRetType = specializeType(map, retType);
  let specializedArgTypes = argTypes.map(argType => specializeType(map, argType));

  return [specializedArgTypes, specializedRetType];
}

// Replace typevars based on the environment mapping the typevars
// to their current instantiated types.
export function specializeType(env: Map<string, Type>, t: Type) : Type {
  // primitive types cannot be specialized any further.
  if(t.tag === "either" || t.tag === "none" || t.tag === "bool" || t.tag === "number" || t.tag === "empty") {
    return t;
  } 

  if(t.tag === "typevar") {
    if(!env.has(t.name)) {
      // Uninstantiated typevars are left as is.
      return t;
    }
    return env.get(t.name);
  }

  if(t.tag === "callable") {
    let specializedParams = t.params.map(p => specializeType(env, p));
    let specializedRet = specializeType(env, t.ret);
    return CALLABLE(specializedParams, specializedRet);
  }

  if(t.tag === "list") {
    let specializedItemType = specializeType(env, t.itemType);
    return LIST(specializedItemType);
  }

  // at this point t has to be a class type
  let specializedParams = t.params.map(p => specializeType(env, p));
  return CLASS(t.name, specializedParams);
}

export function augmentTEnv(env: GlobalTypeEnv, program: Program<Annotation>): GlobalTypeEnv {
  const newGlobs = new Map(env.globals);
  const newFuns = new Map(env.functions);
  const newClasses = new Map(env.classes);
  const newTypevars = new Map(env.typevars);
  const subclassTosuperclass = new Map<string, string[]>();

  program.inits.forEach(init => newGlobs.set(init.name, init.type));
  program.funs.forEach(fun => newGlobs.set(fun.name, CALLABLE(fun.parameters.map(p => p.type), fun.ret)));
  program.classes.forEach(cls => {
    const fields = new Map();
    const methods = new Map();
    cls.fields.forEach(field => fields.set(field.name, field.type));
    cls.methods.forEach(method => methods.set(method.name, [method.parameters.map(p => p.type), method.ret]));
    const typeParams = cls.typeParams;
    newClasses.set(cls.name, [fields, methods, typifySuperclassTypeArguments(cls.super), [...typeParams]]);
    subclassTosuperclass.set(cls.name, [ ...cls.super.keys() ])
  });

  augmentInheritance(subclassTosuperclass, newClasses, program)

  program.typeVarInits.forEach(tv => {
    if(newGlobs.has(tv.name) || newTypevars.has(tv.name) || newClasses.has(tv.name)) {
      throw new TypeCheckError(`Duplicate identifier '${tv.name}' for type-variable`);
    }
    newTypevars.set(tv.name, [tv.canonicalName]);
  });
  return { globals: newGlobs, functions: newFuns, classes: newClasses, typevars: newTypevars };
}

// Convert type-arguments to superclasses from strings to actual types. These will be checked for
// actual validity later.
function typifySuperclassTypeArguments(sups: Map<string, Array<string>>) : Map<string, Array<Type>> {
  return new Map(Array.from(sups.entries()).map(([name, args]) => {
    let tArgs = args.map(arg => {
      switch(arg) {
        case "int":
          return NUM;
        case "bool":
          return BOOL;
        default:
          return CLASS(arg);
      }
    });

    return [name, tArgs];
  }));
}

export function collectTypeVarsInGenericFuncDef(env: GlobalTypeEnv, type: Type) : string[] {
  if (type.tag === "class" && env.typevars.has(type.name)) {
    return [type.name];
  }

  if (type.tag === "callable") {
    // Letting return be as is, it'll throw an error if type var is not one from the params
    return [...type.params.map(p => collectTypeVarsInGenericFuncDef(env, p)).flat(), ...collectTypeVarsInGenericFuncDef(env, type.ret)];
  }

  return [];
}

export function recResolveType(env: GlobalTypeEnv, typ: Type) : Type {
  if (typ.tag === "class" && env.typevars.has(typ.name)) {
    return { tag: "typevar", name: typ.name };
  }

  if (typ.tag === "class" && typ.params.length > 0) {
    const tParams = typ.params.map(p => recResolveType(env, p));
    return { ...typ, params: tParams }
  }

  if (typ.tag === "callable") {
    const tParams = typ.params.map(p => recResolveType(env, p));
    const tRet = recResolveType(env, typ.ret);
    return { ...typ, params: tParams, ret: tRet };
  }

  return typ;
}

export function resolveFuncGenericTypes(env: GlobalTypeEnv) {
  env.globals.forEach((v, k) => {
    if (v.tag === "callable") {
      const tParams = v.params.map(p => recResolveType(env, p));
      const tRet = recResolveType(env, v.ret);
      env.globals.set(k, { ...v, params: tParams, ret: tRet });
    }
  })
}
 
export function augmentInheritance(subclassTosuperclass : Map<string, string[]>, newClasses : Map<string, [Map<string, Type>, Map<string, [Array<Type>, Type]>, Map<string,Array<Type>>, Array<string>]>, program : Program<Annotation>) {
  for (let entry of Array.from(subclassTosuperclass.entries())) {
    let sub = entry[0];
    let sup = entry[1];
    const superclasses : Array<string> = []
    
    const oldsub = newClasses.get(sub)
    if (sup[0] === "object") {
      superclasses.push("object")
    } else {
      sup.forEach(supcls => {
        // Check if superclass exists
        if (program.classes.find(cls => cls.name === supcls) === undefined)
           throw new TypeCheckError(`Superclass ${supcls} does not exist`);
        superclasses.push(program.classes.find(cls => cls.name === supcls).name)
      });
    }
  }
}

export function tc(env: GlobalTypeEnv, program: Program<Annotation>): [Program<Annotation>, GlobalTypeEnv] {
  const SRC = program.a.src;
  const locals = emptyLocalTypeEnv();
  const newEnv = augmentTEnv(env, program);
  const tTypeVars = program.typeVarInits.map(tv => tcTypeVars(newEnv, tv, SRC));
  const tInits = program.inits.map(init => tcInit(newEnv, init, SRC));
  resolveFuncGenericTypes(newEnv);

  // Resolve class typevars before typechecking
  // all classes to avoid ordering dependencies with
  // superclasses.
  const rClasses = program.classes.map(cls => {
      return resolveClassTypeParams(newEnv, cls, SRC)
  });
  const tClasses = rClasses.map(cls => {
    if(cls.typeParams.length === 0) {
      return tcClass(newEnv, cls, SRC);
    } else {
      return tcGenericClass(newEnv, cls, SRC);
    }
  });
  const tDefs = program.funs.map(fun => {
    const typeVars = fun.parameters.map(p => collectTypeVarsInGenericFuncDef(newEnv, p.type)).flat();
    if (typeVars.length > 0) {
      return tcGenericDef(newEnv, fun, typeVars, new Map(), SRC);
    } else {
      return tcDef(newEnv, fun, new Map(), SRC);
    }
  });
  
  // program.inits.forEach(init => env.globals.set(init.name, tcInit(init)));
  // program.funs.forEach(fun => env.functions.set(fun.name, [fun.parameters.map(p => p.type), fun.ret]));
  // program.funs.forEach(fun => tcDef(env, fun));
  // Strategy here is to allow tcBlock to populate the locals, then copy to the
  // global env afterwards (tcBlock changes locals)
  const tBody = tcBlock(newEnv, locals, program.stmts, SRC);
  var lastTyp: Type = NONE;
  if (tBody.length) {
    lastTyp = tBody[tBody.length - 1].a.type;
  }
  // TODO(joe): check for assignment in existing env vs. new declaration
  // and look for assignment consistency
  for (let name of locals.vars.keys()) {
    newEnv.globals.set(name, locals.vars.get(name));
  }

  const aprogram = { a: { ...program.a, type: lastTyp }, inits: tInits, funs: tDefs, classes: tClasses, stmts: tBody, typeVarInits: tTypeVars };
  return [aprogram, newEnv];
}

export function tcInit(env: GlobalTypeEnv, init: VarInit<Annotation>, SRC: string): VarInit<Annotation> {
  if(!isValidType(env, init.type)) {
    throw new TypeCheckError(SRC, `Invalid type annotation '${bigintSafeStringify(init.type)}' for '${init.name}'`, init.a);
  }

  if(init.type.tag === "typevar") {
    if(init.value.tag !== "zero") {
      throw new TypeCheckError(SRC, `Generic variables must be initialized with __ZERO__`, init.value.a);
    }

    return { ...init, a: { ...init.a, type: NONE } };
  }

  const valTyp = tcLiteral(init.value);
  if (isAssignable(env, valTyp, init.type)) {
    return { ...init, a: { ...init.a, type: NONE } };
  } else {
    throw new TypeCheckError(SRC, `Expected type ${bigintSafeStringify(init.type.tag)}; got type ${bigintSafeStringify(valTyp.tag)}`, init.value.a);
  }
}

export function tcGenericDef(env : GlobalTypeEnv, fun : FunDef<Annotation>, typeVars: string[], nonlocalEnv: NonlocalTypeEnv, SRC: string) : FunDef<Annotation> {
  let rDef = resolveFunDefTypeParams(typeVars, fun);
  env.globals.set(rDef.name, CALLABLE(rDef.parameters.map(p => p.type), rDef.ret));
  return tcDef(env, rDef, nonlocalEnv, SRC);
}

export function tcDef(env : GlobalTypeEnv, fun : FunDef<Annotation>, nonlocalEnv: NonlocalTypeEnv, SRC: string) : FunDef<Annotation> {
  var locals = emptyLocalTypeEnv();
  locals.vars.set(fun.name, CALLABLE(fun.parameters.map(x => x.type), fun.ret));
  locals.expectedRet = fun.ret;
  locals.topLevel = false;

  fun.parameters.forEach(p => {
    if(!isValidType(env, p.type)) {
      throw new TypeCheckError(SRC, `Invalid type annotation '${bigintSafeStringify(p.type)}' for parameter '${p.name}' in function '${fun.name}'`, p.a);
    }
    locals.vars.set(p.name, p.type)
  });
  var nonlocals = fun.nonlocals.map(init => ({ name: init.name, a: { ...init.a, type: nonlocalEnv.get(init.name) }}));
  fun.parameters.forEach(p => locals.vars.set(p.name, p.type));
  fun.inits.forEach(init => locals.vars.set(init.name, tcInit(env, init, SRC).type));
  nonlocals.forEach(init => locals.vars.set(init.name, init.a.type));
  var envCopy = copyGlobals(env);
  fun.children.forEach(f => envCopy.functions.set(f.name, [f.parameters.map(x => x.type), f.ret]));
  var children = fun.children.map(f => tcDef(envCopy, f, locals.vars, SRC));
  fun.children.forEach(child => locals.vars.set(child.name, CALLABLE(child.parameters.map(x => x.type), child.ret)));
  
  const tBody = tcBlock(envCopy, locals, fun.body, SRC);
  if (!isAssignable(envCopy, locals.actualRet, locals.expectedRet))
    // TODO: what locations to be reported here?
    throw new TypeCheckError(SRC, `expected return type of block: ${bigintSafeStringify(locals.expectedRet)} does not match actual return type: ${bigintSafeStringify(locals.actualRet)}`)
  return {...fun, a: { ...fun.a, type: NONE }, body: tBody, nonlocals, children};
}

// Generic classes are type-checked by treating all typevars as completely unconstrained
// types that we do not know anything about.
export function tcGenericClass(env: GlobalTypeEnv, cls: Class<Annotation>, SRC: string) : Class<Annotation> {
  // ensure all type parameters are defined as type variables
  cls.typeParams.forEach(param => {
    if(!env.typevars.has(param)) {
      throw new TypeCheckError(SRC, `undefined type variable ${param} used in definition of class ${cls.name}`, cls.a);
    }
  });

  return tcClass(env, cls, SRC);
}

export function resolveClassTypeParams(env: GlobalTypeEnv, cls: Class<Annotation>, SRC: string) : Class<Annotation> { 
  let [fieldsTy, methodsTy, superCls, typeparams] = env.classes.get(cls.name);

  let newSuperCls = new Map(Array.from(superCls.entries()).map(([name, args]) => {
    if(name === 'object') {
      return [name, args];
    }
    let nameClsEnv = env.classes.get(name);
    if(nameClsEnv[3].length !== args.length) {
        throw new TypeCheckError(SRC, `Incorrect number of type-arguments to superclass ${name}, expected ${nameClsEnv[3].length} got ${args.length}`, cls.a);
    }
    let newArgs = args.map(arg => {
      let newArg: Type = resolveTypeTypeParams(cls.typeParams, arg);
      if(newArg.tag === "class" && !env.classes.has(newArg.name)) {
        throw new TypeCheckError(SRC, `Class ${newArg.name} used as type-argument to superclass ${name} does not exist`, cls.a);
      }
      return newArg;
    });

    return [name, newArgs];
  }));


  let newFieldsTy = new Map(Array.from(fieldsTy.entries()).map(([name, type]) => {
    let newType = resolveTypeTypeParams(cls.typeParams, type);
    return [name, newType];
  }));

  let newMethodsTy: Map<string, [Type[], Type]> = new Map(Array.from(methodsTy.entries()).map(([name, [params, ret]]) => {

    const usedtypeVars = params.map(p => collectTypeVarsInGenericFuncDef(env, p)).flat();
    const classTypeVars = cls.typeParams;
    const allowedTypeVars = Array.from(new Set([...classTypeVars, ...usedtypeVars]));

    let newParams = params.map(p => {
      let newP = resolveTypeTypeParams(allowedTypeVars, p);
      return newP;
    });
    let newRet = resolveTypeTypeParams(allowedTypeVars, ret); 
    return [name, [newParams, newRet]];
  }));

  env.classes.set(cls.name, [newFieldsTy, newMethodsTy, newSuperCls, typeparams]);

  let newFields = cls.fields.map(field => resolveVarInitTypeParams(cls.typeParams, field));
  let newMethods = cls.methods.map(method => {
    const usedtypeVars = method.parameters.map(p => collectTypeVarsInGenericFuncDef(env, p.type)).flat();
    const classTypeVars = cls.typeParams;
    const allowedTypeVars = Array.from(new Set([...classTypeVars, ...usedtypeVars]));
    return resolveFunDefTypeParams(allowedTypeVars, method);
  });

  return {...cls, fields: newFields, methods: newMethods};
}

export function resolveVarInitTypeParams(env: string[], init: VarInit<Annotation>) : VarInit<Annotation> {
  let newType = resolveTypeTypeParams(env, init.type);
  return {...init, type: newType};
}

export function resolveFunDefTypeParams(env: string[], fun: FunDef<Annotation>) : FunDef<Annotation> {
  let newParameters = fun.parameters.map(p => resolveParameterTypeParams(env, p));
  let newRet = resolveTypeTypeParams(env, fun.ret);
  let newInits = fun.inits.map(i => resolveVarInitTypeParams(env, i));

  return {...fun, ret: newRet, parameters: newParameters, inits: newInits};
}

export function resolveParameterTypeParams(env: string[], param: Parameter<Annotation>) : Parameter<Annotation> {
  let newType = resolveTypeTypeParams(env, param.type);
  return {...param, type: newType}
}

export function resolveTypeTypeParams(env: string[], type: Type) : Type {
  switch(type.tag) {
    case "number":
    case "bool":
    case "none":
    case "either":
    case "empty":
      return type;
    case "list":
      let ritemType = resolveTypeTypeParams(env, type.itemType);
    return LIST(ritemType);
    case "class":
      if(env.indexOf(type.name) !== -1) {
        // TODO: throw an error here if type-params are not empty
        // shouldn't allow typevars to have type-params ?
        return TYPEVAR(type.name);
      }
      let newParams: Type[]= type.params.map((p) => {
        let newType = resolveTypeTypeParams(env, p);
        return newType;
      });
      return {...type, params: newParams};  
    case "callable":
      let rret = resolveTypeTypeParams(env, type.ret);
      let rparams = type.params.map(p => resolveTypeTypeParams(env, p));
      return {...type, ret: rret, params: rparams};
  }

  
}

export function tcTypeVars(env: GlobalTypeEnv, tv: TypeVar<Annotation>, SRC: string) : TypeVar<Annotation> {
  return {...tv, a: {...tv.a, type: NONE}};
}

export function tcClass(env: GlobalTypeEnv, cls: Class<Annotation>, SRC: string): Class<Annotation> {
  const tFields : VarInit<Annotation>[] = []
  tcFields(env, cls, tFields, SRC)
  const tMethods = cls.methods.map(method => tcDef(env, method, new Map(), SRC));
  const init = cls.methods.find(method => method.name === "__init__") // we'll always find __init__
  const tParams = cls.typeParams.map(TYPEVAR);
  if (init.parameters.length !== 1 ||
    init.parameters[0].name !== "self" ||
    !equalType(init.parameters[0].type, CLASS(cls.name, tParams)) ||
    init.ret !== NONE) {
    const reason = (init.parameters.length !== 1) ? `${init.parameters.length} parameters` :
      (init.parameters[0].name !== "self") ? `parameter name ${init.parameters[0].name}` :
        (!equalType(init.parameters[0].type, CLASS(cls.name))) ? `parameter type ${bigintSafeStringify(init.parameters[0].type.tag)}` :
          (init.ret !== NONE) ? `return type ${bigintSafeStringify(init.ret.tag)}` : "unknown reason";

    throw new TypeCheckError(SRC, `__init__ takes 1 parameter \`self\` of the same type of the class \`${cls.name}\` with return type of \`None\`, got ${reason}`, init.a);
  }
  return { a: { ...cls.a, type: NONE }, name: cls.name, fields: tFields, methods: tMethods, typeParams: cls.typeParams, super: cls.super };
}


export function tcFields(env: GlobalTypeEnv, cls : Class<Annotation>, tFields : VarInit<Annotation>[], SRC : string) {
  const superclasses = env.classes.get(cls.name)[2]

  // Check if superclass fields are redefined in subclass
  const superclassFields = new Map()
  getSuperclassFields(env, CLASS(cls.name, cls.typeParams.map(TYPEVAR)), superclassFields)

  cls.fields.forEach(field => {
    if (superclassFields.has(field.name))
      throw new TypeCheckError(`Field ${field.name} redefined in subclass`);
  });

  // Push all fields of current class
  tFields.push(...cls.fields.map(field => tcInit(env, field, SRC)));
}

export function getSuperclasses(env: GlobalTypeEnv, subclass: ClassT, classes: Array<Type>) {
  if (subclass.name === "object") {
    classes.push(CLASS("object"))
    return
  }    

  const subclassEnv = env.classes.get(subclass.name);
  const superclasses: Map<string, Array<Type>> = subclassEnv[2];
  const typeparams = subclassEnv[3];
  let map = new Map(zip(typeparams, subclass.params))

  superclasses.forEach((params, cls) => {
    if (cls !== "object") {
      let superclass = specializeType(map, CLASS(cls, params));
      classes.push(superclass)
    }
  })
  superclasses.forEach((params, cls) => {
    let superclass = specializeType(map, CLASS(cls, params));
    //@ts-ignore we know CLASS always specializes to CLASS
    getSuperclasses(env, superclass, classes)
  })
}

export function getSuperclassFields(env: GlobalTypeEnv, subclass: ClassT, fields: Map<string, Type>) {
  if (subclass.name === "object")
    return
  else {
    const subclassEnv = env.classes.get(subclass.name);
    const superclasses: Map<string, Array<Type>> = subclassEnv[2];
    const typeparams = subclassEnv[3];
    let map = new Map(zip(typeparams, subclass.params));
    superclasses.forEach((params, cls) => {
      if (cls !== "object") {
        let superclass = specializeType(map, CLASS(cls, params));
        const clsfields = env.classes.get(cls)[0]
        clsfields.forEach((value, key) => fields.set(key, specializeFieldType(env, superclass, value)));
      }
    })

    superclasses.forEach((params, cls) => {
      let superclass = specializeType(map, CLASS(cls, params));
      //@ts-ignore we know CLASS always specializes to CLASS
      getSuperclassFields(env, superclass, fields)
    })
  }
}

export function getSuperclassMethods(env: GlobalTypeEnv, subclass: ClassT, methods: Map<string, [Array<Type>, Type]>) {
  if (subclass.name === "object")
    return
  else {
    const subclassEnv = env.classes.get(subclass.name);
    const superclasses: Map<string, Array<Type>> = subclassEnv[2];
    const typeparams = subclassEnv[3];
    let map = new Map(zip(typeparams, subclass.params))
    superclasses.forEach((params, cls) => {
      if (cls !== "object") {
        let superclass = specializeType(map, CLASS(cls, params));
        const clsmethods = env.classes.get(cls)[1]
        clsmethods.forEach((value, key) => methods.set(key, specializeMethodType(env, superclass, value)));
      }
    })
    superclasses.forEach((params, cls) => {
      let superclass = specializeType(map, CLASS(cls, params));
      //@ts-ignore we know CLASS always specializes to CLASS
      getSuperclassMethods(env, superclass, methods)
    })
  }
}

export function tcBlock(env: GlobalTypeEnv, locals: LocalTypeEnv, stmts: Array<Stmt<Annotation>>, SRC: string): Array<Stmt<Annotation>> {
  var tStmts = stmts.map(stmt => tcStmt(env, locals, stmt, SRC));
  return tStmts;
}

export function tcAssignable(env : GlobalTypeEnv, locals : LocalTypeEnv, assignable : Assignable<Annotation>, SRC: string) : Assignable<Annotation> {
  var expr : Expr<Annotation> = { ...assignable };
  var typedExpr = tcExpr(env, locals, expr, SRC);
  switch(typedExpr.tag) {
    case "id":
      var typedAss : Assignable<Annotation> = { ...typedExpr };
      return typedAss;
    case "lookup":
      if (typedExpr.obj.a.type.tag !== "class") 
        throw new TypeCheckError(SRC, "field assignments require an object");
      if (!env.classes.has(typedExpr.obj.a.type.name)) 
        throw new TypeCheckError(SRC, "field assignment on an unknown class");
      const [fields, _] = env.classes.get(typedExpr.obj.a.type.name);
      if (!fields.has(typedExpr.field)) 
        throw new TypeCheckError(SRC, `could not find field ${typedExpr.field} in class ${typedExpr.obj.a.type.name}`);
      var typedAss : Assignable<Annotation> = { ...typedExpr };
      return typedAss;
    default:
      throw new TypeCheckError(SRC, `unimplemented type checking for assignment: ${assignable}`);
  }
}

export function tcDestructuringAssignment(env : GlobalTypeEnv, locals : LocalTypeEnv, destruct : DestructuringAssignment<Annotation>, SRC: string) : [DestructuringAssignment<Annotation>, boolean] {
  if(destruct.isSimple) {
    if(destruct.vars.length != 1) {
      throw new TypeCheckError(SRC, `variable number mismatch, expected 1, got ${destruct.vars.length}`);
    }
    if(destruct.vars[0].star) {
      throw new TypeCheckError(SRC, 'starred assignment target must be in a list or tuple');
    }
    var typedAss : Assignable<Annotation> = tcAssignable(env, locals, destruct.vars[0].target, SRC);
    var variable: AssignVar<Annotation> = { ...destruct.vars[0], target: typedAss, a: typedAss.a };
    return [{ ...destruct, vars: [variable], a: variable.a }, false];
  } else {
    // there should be more than 0 elements at left
    if(destruct.vars.length == 0) {
      throw new TypeCheckError(SRC, `variable number mismatch, expected more than 1, got 0`);
    }
    var hasStar = false;
    var typedVars : AssignVar<Annotation>[] = [];
    for(var v of destruct.vars) {
      if(v.star) {
        if(hasStar) {
          throw new TypeCheckError(SRC, `there could not be more than 1 star expression in assignment`);
        }
        hasStar = true;
      }
      var typedAss : Assignable<Annotation> = tcAssignable(env, locals, v.target, SRC);
      var variable: AssignVar<Annotation> = { ...v, target: typedAss, a: typedAss.a }; 
      typedVars.push(variable);
    }
    return [{ ...destruct, vars: typedVars, a: { ...destruct.a, type: NONE } }, hasStar];
  }
}

export function tcStmt(env: GlobalTypeEnv, locals: LocalTypeEnv, stmt: Stmt<Annotation>, SRC: string): Stmt<Annotation> {
  switch(stmt.tag) {
    case "assign":
      const [tDestruct, hasStar] = tcDestructuringAssignment(env, locals, stmt.destruct, SRC);
      const tValExpr = tcExpr(env, locals, stmt.value, SRC);
      if(tDestruct.isSimple) {
        // TODO: this is an ugly temporary hack for generic constructor
        // calls until explicit annotations are supported.
        // Until then constructors for generic classes are properly checked only
        // when directly assigned to variables and will fail in unexpected ways otherwise.
        if(tDestruct.a.type.tag === 'class' && tDestruct.a.type.params.length !== 0 && tValExpr.a.type.tag === 'class' && tValExpr.a.type.name === tDestruct.a.type.name && tValExpr.tag === 'construct') {
          // it would have been impossible for the inner type-checking
          // code to properly infer and fill in the type parameters for
          // the constructor call. So we copy it from the type of the variable
          // we are assigning to.
          tValExpr.a.type.params = [...tDestruct.a.type.params];
        }
        if(!isAssignable(env, tValExpr.a.type, tDestruct.a.type)) {
          throw new TypeCheckError(SRC, `Assignment value should have assignable type to type ${bigintSafeStringify(tDestruct.a.type.tag)}, got ${bigintSafeStringify(tValExpr.a.type.tag)}`, tValExpr.a);
        }
      }else if(!tDestruct.isSimple && tValExpr.tag === "array-expr") {
        // for plain destructure like a, b, c = 1, 2, 3
        // we can perform type check
        if(!hasStar && tDestruct.vars.length != tValExpr.elements.length) {
          throw new TypeCheckError(`value number mismatch, expected ${tDestruct.vars.length} values, but got ${tValExpr.elements.length}`);
        } else if(hasStar && tDestruct.vars.length-1 > tValExpr.elements.length) {
          throw new TypeCheckError(`not enough values to unpack (expected at least ${tDestruct.vars.length-1}, got ${tValExpr.elements.length})`);
        }
        for(var i=0; i<tDestruct.vars.length; i++) {
          if(tDestruct.vars[i].ignorable) {
            continue;
          }
          if(!isAssignable(env, tValExpr.elements[i].a.type, tDestruct.vars[i].a.type)) {
            throw new TypeCheckError(`Non-assignable types: ${tValExpr.elements[i].a} to ${tDestruct.vars[i].a}`);
          }
        }
      } else if(!tDestruct.isSimple && (tValExpr.tag === "call" || tValExpr.tag === "method-call" || tValExpr.tag === "id")) {
        // the expr should be iterable, which means the return type should be an iterator
        // but there is no such a type currently, so
        // TODO: add specific logic then
        if(tValExpr.a.type.tag != "class" || tValExpr.a.type.name != "iterator") {
          throw new TypeCheckError(`cannot unpack non-iterable ${JSON.stringify(tValExpr.a, null, 2)} object`)
        } else {
          var rightType = env.classes.get('iterator')[1].get('next')[1];
          for(var i=0; i<tDestruct.vars.length; i++) {
            if(tDestruct.vars[i].ignorable) {
              continue;
            }
            if(!isAssignable(env, rightType, tDestruct.vars[i].a.type)) {
              throw new TypeCheckError(`Non-assignable types: ${rightType} to ${tDestruct.vars[i].a}`);
            }
          }
        }
        // other checks should be pushed to runtime
      } else if(!tDestruct.isSimple) {
        // TODO: support other types like list, tuple, which are plain formatted, we could also perform type check
        if(tValExpr.a != CLASS('iterator')) {
          throw new TypeCheckError(`cannot unpack non-iterable ${tValExpr.a} object`)
        }
      }
      return {a: { ...stmt.a, type: NONE }, tag: stmt.tag, destruct: tDestruct, value: tValExpr};
    case "expr":
      const tExpr = tcExpr(env, locals, stmt.expr, SRC);
      return { a: tExpr.a, tag: stmt.tag, expr: tExpr };
    case "if":
      var tCond = tcExpr(env, locals, stmt.cond, SRC);
      const tThn = tcBlock(env, locals, stmt.thn, SRC);
      const thnTyp = locals.actualRet;
      locals.actualRet = NONE;
      const tEls = tcBlock(env, locals, stmt.els, SRC);
      const elsTyp = locals.actualRet;
      if (tCond.a.type !== BOOL)
        throw new TypeCheckError(SRC, `Condition Expression Must be have type "bool", got ${bigintSafeStringify(tCond.a.type.tag)}`, tCond.a);
      if (thnTyp !== elsTyp)
        locals.actualRet = { tag: "either", left: thnTyp, right: elsTyp }
      return { a: { ...stmt.a, type: thnTyp }, tag: stmt.tag, cond: tCond, thn: tThn, els: tEls };
    case "return":
      if (locals.topLevel)
      // TODO: error reporting for checking returns
        throw new TypeCheckError(SRC, "cannot return outside of functions");
      const tRet = tcExpr(env, locals, stmt.value, SRC);
      if (!isAssignable(env, tRet.a.type, locals.expectedRet))
        throw new TypeCheckError(SRC, "expected return type `" + (locals.expectedRet as any).tag + "`; got type `" + (tRet.a.type as any).tag + "`",
          stmt.a); // returning the loc of the entire return statement here because the retExpr might be empty
      locals.actualRet = tRet.a.type;
      return { a: tRet.a, tag: stmt.tag, value: tRet };
    case "while":
      var tCond = tcExpr(env, locals, stmt.cond, SRC);
      const tBody = tcBlock(env, locals, stmt.body, SRC);
      if (!equalType(tCond.a.type, BOOL))
        throw new TypeCheckError(SRC, `Condition Expression Must be a bool, got ${bigintSafeStringify(tCond.a.type.tag)}`, tCond.a);
      return { a: { ...stmt.a, type: NONE }, tag: stmt.tag, cond: tCond, body: tBody };
    case "pass":
      return { a: { ...stmt.a, type: NONE }, tag: stmt.tag };
    case "break":
    case "continue":
      return {a: { ...stmt.a, type: NONE }, tag: stmt.tag};
    case "for":
      var tIterator = tcIterator(env, locals, stmt.iterator)
      var tValObject = tcExpr(env, locals, stmt.values, SRC);
      if (tValObject.a.type.tag !== "class") 
        throw new TypeCheckError(SRC, "values require an object");
      if (!env.classes.has(tValObject.a.type.name)) 
        throw new TypeCheckError(SRC, "values on an unknown class");
      const [__, methods] = env.classes.get(tValObject.a.type.name);
      getSuperclassMethods(env, tValObject.a.type, methods)
      if(!(methods.has("hasnext")) || methods.get("hasnext")[1].tag != BOOL.tag)
        throw new TypeCheckError(SRC, "iterable class must have hasnext method with boolean return type");
      if(!(methods.has("next"))) { throw new TypeCheckError(SRC, "No next method"); }
      const methodType = specializeMethodType(env, tValObject.a.type, methods.get("next"));
      if(!equalType(methodType[1],tIterator)) {
        throw new TypeCheckError(SRC, "iterable class must have next method with same return type as iterator");
      }
      if(!(methods.has("reset")) || methods.get("reset")[1].tag != NONE.tag)
        throw new TypeCheckError(SRC, "iterable class must have reset method with none return type");
      const tforBody = tcBlock(env, locals, stmt.body, SRC);
      return {a: {...stmt.a, type: tIterator}, tag: stmt.tag, iterator:stmt.iterator, values: tValObject, body: tforBody }
    case "field-assign":
      var tObj = tcExpr(env, locals, stmt.obj, SRC);
      const tVal = tcExpr(env, locals, stmt.value, SRC);
      if (tObj.a.type.tag !== "class")
        throw new TypeCheckError(SRC, `field assignments require an object, got ${bigintSafeStringify(tObj.a.type.tag)}`, tObj.a);
      if (!env.classes.has(tObj.a.type.name))
        throw new TypeCheckError(SRC, `field assignment on an unknown class \`${tObj.a.type.name}\``, tObj.a);
      const [fields, _] = env.classes.get(tObj.a.type.name);
      getSuperclassFields(env, tObj.a.type, fields) // will add super class fields to 'fields' map
      if (!fields.has(stmt.field))
        throw new TypeCheckError(SRC, `could not find field \`${stmt.field}\` in class \`${tObj.a.type.name}\``, stmt.a);

      let fieldTy = specializeFieldType(env, tObj.a.type, fields.get(stmt.field));

      // TODO: this is an ugly temporary hack for generic constructor
      // calls until explicit annotations are supported.
      // Until then constructors for generic classes are properly checked only
      // when directly assigned to fields and will fail in unexpected ways otherwise.
      if(fieldTy.tag === "class" && fieldTy.params.length !== 0 && tVal.a.type.tag === 'class' && tVal.a.type.name === fieldTy.name && tVal.tag === 'construct') {
        // it would have been impossible for the inner type-checking
        // code to properly infer and fill in the type parameters for
        // the constructor call. So we copy it from the type of the field
        // we are assigning to.
        tVal.a.type.params = [...fieldTy.params]; 
      }

      if (!isAssignable(env, tVal.a.type, fieldTy))
        throw new TypeCheckError(SRC, `field \`${stmt.field}\` expected type: ${bigintSafeStringify(fields.get(stmt.field).tag)}, got value of type ${bigintSafeStringify(tVal.a.type.tag)}`,
          tVal.a);
      return { ...stmt, a: { ...stmt.a, type: NONE }, obj: tObj, value: tVal };
    case "index-assign":
      const tList = tcExpr(env, locals, stmt.obj, SRC)
      if (tList.a.type.tag !== "list")
        throw new TypeCheckError("index assignments require an list");
      const tIndex = tcExpr(env, locals, stmt.index, SRC);
      if (tIndex.a.type.tag !== "number")
        throw new TypeCheckError(`index is of non-integer type \'${tIndex.a.type.tag}\'`);
      const tValue = tcExpr(env, locals, stmt.value, SRC);
      const expectType = tList.a.type.itemType;
      if (!isAssignable(env, expectType, tValue.a.type))
        throw new TypeCheckError("Non-assignable types");

      return {a: { ...stmt.a, type: NONE }, tag: stmt.tag, obj: tList, index: tIndex, value: tValue}
  }
}

export function tcExpr(env: GlobalTypeEnv, locals: LocalTypeEnv, expr: Expr<Annotation>, SRC: string): Expr<Annotation> {
  switch (expr.tag) {
    case "literal":
      return { ...expr, a: { ...expr.a, type: tcLiteral(expr.value) } };
    case "binop":
      const tLeft = tcExpr(env, locals, expr.left, SRC);
      const tRight = tcExpr(env, locals, expr.right, SRC);
      const tBin = { ...expr, left: tLeft, right: tRight };
      switch (expr.op) {
        case BinOp.Plus:
          // List concatenation
          if(tLeft.a.type.tag === "empty" || tLeft.a.type.tag === "list" || tRight.a.type.tag === "empty" || tRight.a.type.tag === "list") {
            if(tLeft.a.type.tag === "empty") {
              if(tRight.a.type.tag === "empty") return {...expr, a: tLeft.a};
              else return {...expr, a: tRight.a};
            } else if(tRight.a.type.tag === "empty") {
              return {...expr, a: tLeft.a};
            } else if(equalType(tLeft.a.type, tRight.a.type)) {
              return {...expr, a: tLeft.a};
            } else {
              var leftType = tLeft.a.type.tag === "list"? tLeft.a.type.tag + "[" + tLeft.a.type.itemType + "]": tLeft.a.type.tag;
              var rightType = tRight.a.type.tag === "list"? tRight.a.type.tag + "[" + tRight.a.type.itemType + "]": tRight.a.type.tag;
              throw new TypeCheckError(`Cannot concatenate ${rightType} to ${leftType}`);
            }
          }
        case BinOp.Minus:
        case BinOp.Mul:
        case BinOp.IDiv:
        case BinOp.Mod:
          if (equalType(tLeft.a.type, NUM) && equalType(tRight.a.type, NUM)) { return { ...tBin, a: { ...expr.a, type: NUM } } }
          else { throw new TypeCheckError(SRC, `Binary operator \`${stringifyOp(expr.op)}\` expects type "number" on both sides, got ${bigintSafeStringify(tLeft.a.type.tag)} and ${bigintSafeStringify(tRight.a.type.tag)}`,
            expr.a); }
        case BinOp.Eq:
        case BinOp.Neq:
          if (tLeft.a.type.tag === "class" || tRight.a.type.tag === "class") throw new TypeCheckError(SRC, "cannot apply operator '==' on class types")
          if(tLeft.a.type.tag === "typevar" || tRight.a.type.tag === "typevar") throw new TypeCheckError(SRC, "cannot apply operator '==' on unconstrained type parameters")
          if (equalType(tLeft.a.type, tRight.a.type)) { return { ...tBin, a: { ...expr.a, type: BOOL } }; }
          else { throw new TypeCheckError(SRC, `Binary operator \`${stringifyOp(expr.op)}\` expects the same type on both sides, got ${bigintSafeStringify(tLeft.a.type.tag)} and ${bigintSafeStringify(tRight.a.type.tag)}`,
            expr.a); }
        case BinOp.Lte:
        case BinOp.Gte:
        case BinOp.Lt:
        case BinOp.Gt:
          if (equalType(tLeft.a.type, NUM) && equalType(tRight.a.type, NUM)) { return { ...tBin, a: { ...expr.a, type: BOOL } }; }
          else { throw new TypeCheckError(SRC, `Binary operator \`${stringifyOp(expr.op)}\` expects type "number" on both sides, got ${bigintSafeStringify(tLeft.a.type.tag)} and ${bigintSafeStringify(tRight.a.type.tag)}`,
          expr.a); }
        case BinOp.And:
        case BinOp.Or:
          if (equalType(tLeft.a.type, BOOL) && equalType(tRight.a.type, BOOL)) { return { ...tBin, a: { ...expr.a, type: BOOL } }; }
          else { throw new TypeCheckError(SRC, `Binary operator \`${stringifyOp(expr.op)}\` expects type "bool" on both sides, got ${bigintSafeStringify(tLeft.a.type.tag)} and ${bigintSafeStringify(tRight.a.type.tag)}`,
          expr.a); }
        case BinOp.Is:
          if(!isNoneOrClassOrCallable(tLeft.a.type) || !isNoneOrClassOrCallable(tRight.a.type))
            throw new TypeCheckError(SRC, `Binary operator \`${stringifyOp(expr.op)}\` expects type "class", "none", or "callable" on both sides, got ${bigintSafeStringify(tLeft.a.type.tag)} and ${bigintSafeStringify(tRight.a.type.tag)}`,
            expr.a);
          return { ...tBin, a: { ...expr.a, type: BOOL } };
      }
    case "uniop":
      const tExpr = tcExpr(env, locals, expr.expr, SRC);
      const tUni = { ...expr, a: tExpr.a, expr: tExpr }
      switch (expr.op) {
        case UniOp.Neg:
          if (equalType(tExpr.a.type, NUM)) { return tUni }
          else { throw new TypeCheckError(SRC, `Unary operator \`${stringifyOp(expr.op)}\` expects type "number", got ${bigintSafeStringify(tExpr.a.type.tag)}`,
          expr.a); }
        case UniOp.Not:
          if (equalType(tExpr.a.type, BOOL)) { return tUni }
          else { throw new TypeCheckError(SRC, `Unary operator \`${stringifyOp(expr.op)}\` expects type "bool", got ${bigintSafeStringify(tExpr.a.type.tag)}`,
          expr.a); }
      }
    case "id":
      if(expr.name === '_') {
        // ignorable
        return {a: { ...expr.a, type: NONE }, ...expr};
      }
      if (locals.vars.has(expr.name)) {
        return { ...expr, a: { ...expr.a, type: locals.vars.get(expr.name) } };
      } else if (env.globals.has(expr.name)) {
        return { ...expr, a: { ...expr.a, type: env.globals.get(expr.name) } };
      } else {
        throw new TypeCheckError(SRC, "Unbound id: " + expr.name, expr.a);
      }
    case "lambda":
      if (expr.params.length !== expr.type.params.length) {
        throw new TypeCheckError("Mismatch in number of parameters: " + expr.type.params.length + " != " + expr.params.length);
      }
      const lambdaLocals = copyLocals(locals);
      expr.params.forEach((param, i) => {
        lambdaLocals.vars.set(param, expr.type.params[i]);
      })
      let ret = tcExpr(env, lambdaLocals, expr.expr, SRC);
      if (!isAssignable(env, ret.a.type, expr.type.ret)) {
        throw new TypeCheckError("Expected type " + bigintSafeStringify(expr.type.ret) + " in lambda, got type " + bigintSafeStringify(ret.a.type.tag));
      }
      return {a: { ...expr.a, type: expr.type }, tag: "lambda", params: expr.params, type: expr.type, expr: ret}
    case "builtin1":
      // TODO: type check `len` after lists are implemented
      if (expr.name === "print") {
        const tArg = tcExpr(env, locals, expr.arg, SRC);
        
        if (!equalType(tArg.a.type, NUM) && !equalType(tArg.a.type, BOOL) && !equalType(tArg.a.type, NONE)) {
           throw new TypeCheckError(SRC, `print() expects types "int" or "bool" or "none" as the argument, got ${bigintSafeStringify(tArg.a.type.tag)}`, tArg.a);
        }
        return { ...expr, a: tArg.a, arg: tArg };
      } else if (env.functions.has(expr.name)) {
        const [[expectedArgTyp], retTyp] = env.functions.get(expr.name);
        const tArg = tcExpr(env, locals, expr.arg, SRC);

        if (isAssignable(env, tArg.a.type, expectedArgTyp)) {
          return { ...expr, a: { ...expr.a, type: retTyp }, arg: tArg };
        } else {
          throw new TypeCheckError(SRC, `Function call expects an argument of type ${bigintSafeStringify(expectedArgTyp.tag)}, got ${bigintSafeStringify(tArg.a.type.tag)}`,
            expr.a);
        }
      } else {
        throw new TypeCheckError(SRC, "Undefined function: " + expr.name, expr.a);
      }
    case "builtin2":
      if (env.functions.has(expr.name)) {
        const [[leftTyp, rightTyp], retTyp] = env.functions.get(expr.name);
        const tLeftArg = tcExpr(env, locals, expr.left, SRC);
        const tRightArg = tcExpr(env, locals, expr.right, SRC);
        if (isAssignable(env, leftTyp, tLeftArg.a.type) && isAssignable(env, rightTyp, tRightArg.a.type)) {
          return { ...expr, a: { ...expr.a, type: retTyp }, left: tLeftArg, right: tRightArg };
        } else {
          throw new TypeCheckError(SRC, `Function call expects arguments of types ${bigintSafeStringify(leftTyp.tag)} and ${bigintSafeStringify(rightTyp.tag)}, got ${bigintSafeStringify(tLeftArg.a.type.tag)} and ${bigintSafeStringify(tRightArg.a.type.tag)}`,
            expr.a);
        }
      } else {
        throw new TypeCheckError(SRC, "Undefined function: " + expr.name, expr.a);
      }
    case "call":
      if (expr.fn.tag === "id" && env.classes.has(expr.fn.name)) {
        // surprise surprise this is actually a constructor
        const tConstruct: Expr<Annotation> = { a: { ...expr.a, type: CLASS(expr.fn.name) }, tag: "construct", name: expr.fn.name };
        const [_, methods] = env.classes.get(expr.fn.name);
        if (methods.has("__init__")) {
          const [initArgs, initRet] = methods.get("__init__");
          if (expr.arguments.length !== initArgs.length - 1)
            throw new TypeCheckError(SRC, `__init__ takes 1 parameter \`self\` of the same type of the class \`${expr.fn.name}\` with return type of \`None\`, got ${expr.arguments.length} parameters`, expr.a);
          if (initRet !== NONE)
            throw new TypeCheckError(SRC, `__init__ takes 1 parameter \`self\` of the same type of the class \`${expr.fn.name}\` with return type of \`None\`, gotreturn type ${bigintSafeStringify(initRet.tag)}`, expr.a);
          return tConstruct;
        } else {
          return tConstruct;
        }
      } else {
        const newFn = tcExpr(env, locals, expr.fn, SRC);
        if(newFn.a.type.tag !== "callable") {
          throw new TypeCheckError("Cannot call non-callable expression");
        }
        const tArgs = expr.arguments.map(arg => tcExpr(env, locals, arg, SRC));
        const tenv : Map<string, Type> = new Map();
        
        if (newFn.a.type.params.length === expr.arguments.length &&
          newFn.a.type.params.every((param, i) => checkAssignabilityOfFuncCallLocalParams(env, tenv, param, tArgs[i].a.type))) {
          let ret = locals.topLevel && newFn.a.type.ret.tag === "typevar" ? tenv.get(newFn.a.type.ret.name) : newFn.a.type.ret;
          return {...expr, a: {...expr.a, type: ret}, arguments: tArgs, fn: newFn};
        } else {
          const tArgsStr = tArgs.map(tArg => bigintSafeStringify(tArg.a.type.tag)).join(", ");
          const argTypesStr = newFn.a.type.params.map(argType => bigintSafeStringify(argType.tag)).join(", ");
          throw new TypeCheckError(SRC, `Function call expects arguments of types [${argTypesStr}], got [${tArgsStr}]`, expr.a);
        }
      }
    case "lookup":
      var tObj = tcExpr(env, locals, expr.obj, SRC);
      if (tObj.a.type.tag === "class") {
        if (env.classes.has(tObj.a.type.name)) {
          const superclassfields = new Map()
          const [fields, _, superclass] = env.classes.get(tObj.a.type.name);
          getSuperclassFields(env, tObj.a.type, superclassfields)
          if (fields.has(expr.field)) {
            return { ...expr, a: { ...expr.a, type: specializeFieldType(env, tObj.a.type, fields.get(expr.field)) }, obj: tObj };
          } else if (superclassfields.has(expr.field)) {
            return { ...expr, a: { ...expr.a, type: specializeFieldType(env, tObj.a.type, superclassfields.get(expr.field)) }, obj: tObj };
          } else {
            throw new TypeCheckError(SRC, `could not find field ${expr.field} in class ${tObj.a.type.name}`, expr.a);
          }
        } else {
          throw new TypeCheckError(SRC, `field lookup on an unknown class ${tObj.a.type.name}`, expr.a);
        }
      } else {
        throw new TypeCheckError(SRC, `field lookups require an object of type "class", got ${bigintSafeStringify(tObj.a.type.tag)}`, expr.a);
      }
    case "index":
      var tObj = tcExpr(env, locals, expr.obj, SRC);
      if(tObj.a.type.tag === "empty") {
        return { ...expr, a: tObj.a};
      } else if(tObj.a.type.tag === "list") {
        var tIndex = tcExpr(env, locals, expr.index, SRC);
        if(tIndex.a.type !== NUM) {
          throw new TypeCheckError(`index is of non-integer type \'${tIndex.a.type.tag}\'`);
        }
        return { ...expr, a: {...tObj.a, type: tObj.a.type.itemType}};
      } else {
        // For other features that use index
        throw new TypeCheckError(`unsupported index operation`);
      }
    case "slice":
      var tObj = tcExpr(env, locals, expr.obj, SRC);
      if(tObj.a.type.tag == "list") {
        var tStart = undefined;
        var tEnd = undefined;
        if(expr.index_s !== undefined) {
          tStart = tcExpr(env, locals, expr.index_s, SRC);
          if(tStart.a.type !== NUM)
            throw new TypeCheckError(`index is of non-integer type \'${tStart.a.type.tag}\'`);
        }
        if(expr.index_e !== undefined) {
          tEnd = tcExpr(env, locals, expr.index_e, SRC);
          if(tEnd.a.type !== NUM)
            throw new TypeCheckError(`index is of non-integer type \'${tEnd.a.type.tag}\'`);
        }
        return { ...expr, a: tObj.a, index_s: tStart, index_e: tEnd };
      } else if(tObj.a.type.tag === "empty") {
        return { ...expr, a: {...expr.a, type: {tag: "empty"}} };
      } else {
        // For other features that use slice syntax
        throw new TypeCheckError(`unsupported slice operation`);
      }
    case "method-call":
      var tObj = tcExpr(env, locals, expr.obj, SRC);
      var tArgs = expr.arguments.map(arg => tcExpr(env, locals, arg, SRC));
      if (tObj.a.type.tag === "class") {
        if (env.classes.has(tObj.a.type.name)) {
          const [_, methods] = env.classes.get(tObj.a.type.name);
          const superclassmethods = new Map()
          getSuperclassMethods(env, tObj.a.type, superclassmethods)

          if (methods.has(expr.method)) {
            const [methodArgs, methodRet] = specializeMethodType(env, tObj.a.type, methods.get(expr.method));
            const realArgs = [tObj].concat(tArgs);
            const tenv : Map<string, Type> = new Map();
            if (methodArgs.length === realArgs.length &&
              methodArgs.every((argTyp, i) =>  checkAssignabilityOfFuncCallLocalParams(env, tenv, argTyp, realArgs[i].a.type))) {
              let ret = specializeType(tenv, methodRet);
              return { ...expr, a: { ...expr.a, type: ret }, obj: tObj, arguments: tArgs };
            } else {
              const argTypesStr = methodArgs.map(argType => bigintSafeStringify(argType.tag)).join(", ");
              const tArgsStr = realArgs.map(tArg => bigintSafeStringify(tArg.a.type.tag)).join(", ");
              throw new TypeCheckError(SRC, `Method call ${expr.method} expects arguments of types [${argTypesStr}], got [${tArgsStr}]`,
              expr.a);
            }
          } else if(superclassmethods.has(expr.method)) {
            const [methodArgs, methodRet] = superclassmethods.get(expr.method);
            const realArgs = [tObj].concat(tArgs);
            if (methodArgs.length === realArgs.length &&
              methodArgs.every((argTyp: Type, i: number) => isAssignable(env, realArgs[i].a.type, argTyp))) {
              return { ...expr, a: { ...expr.a, type: methodRet }, obj: tObj, arguments: tArgs };
            } else {
              const argTypesStr = methodArgs.map((argType: { tag: any; }) => JSON.stringify(argType.tag)).join(", ");
              const tArgsStr = realArgs.map(tArg => JSON.stringify(tArg.a.type.tag)).join(", ");
              throw new TypeCheckError(SRC, `Method call ${expr.method} expects arguments of types [${argTypesStr}], got [${tArgsStr}]`,
              expr.a);
            }
          } else {
            throw new TypeCheckError(SRC, `could not found method ${expr.method} in class ${tObj.a.type.name}`,
            expr.a);
          }
        } else {
          throw new TypeCheckError(SRC, `method call on an unknown class ${tObj.a.type.name}`, expr.a);
        }
      } else {
        throw new TypeCheckError(SRC, `method calls require an object of type "class", got ${bigintSafeStringify(tObj.a.type.tag)}`, expr.a);
      }
    case "array-expr":
      const arrayExpr = expr.elements.map((element) => tcExpr(env, locals, element, SRC));
      return { ...expr, a: { ...expr.a, type: NONE }, elements: arrayExpr };
    case "list-comp":
      // check if iterable is instance of class
      const iterable = tcExpr(env, locals, expr.iterable,SRC);
      if (iterable.a.type.tag === "class"){
        const classData = env.classes.get(iterable.a.type.name);
        // check if next and hasNext methods are there
        if (!classData[1].has("next") || !classData[1].has("hasNext"))
          throw new Error("TYPE ERROR: Class of the instance must have next() and hasNext() methods");
        // need to create a local env for elem to be inside comprehension only
        var loc = locals;
        if (expr.elem.tag === "id"){
          loc.vars.set(expr.elem.name, NUM);
          const elem = {...expr.elem, a: {...expr, type: NUM}};
          const left = tcExpr(env, loc, expr.left,SRC);
          var cond;
          if (expr.cond)
            cond = tcExpr(env, loc, expr.cond,SRC);
          if (cond && cond.a.type.tag !== "bool")
            throw new Error("TYPE ERROR: comprehension if condition must return bool")
          return {...expr, left, elem, cond, iterable, a: {...expr, type: CLASS(iterable.a.type.name)}};
        }
        else
          throw new Error("TYPE ERROR: elem has to be an id");
      }
      else
        throw new Error("TYPE ERROR: Iterable must be an instance of a class");  
    case "if-expr":
      var tThn = tcExpr(env, locals, expr.thn, SRC);
      var tCond = tcExpr(env, locals, expr.cond, SRC);
      var tEls = tcExpr(env, locals, expr.els, SRC);
      if(!equalType(tCond.a.type, BOOL)) throw new TypeCheckError(SRC, "Condition Expression Must be a bool", expr.a);
      //TODO (Michael Maddy, Closures): Might not work for inheritence...
      if(!equalType(tThn.a.type, tEls.a.type)) throw new TypeCheckError(SRC, `if-expr type mismatch: ${bigintSafeStringify(tThn.a)} is not the same as ${bigintSafeStringify(tEls.a)}`, expr.a);
      //Instead the type could be either the type of thn or els, and not error if they are not the same type.
      // var newType = join(env, tThn.a, tEls.a)
      return {...expr, a: tThn.a, cond: tCond, thn: tThn, els: tEls};
    case "construct-list":
      const tItems = expr.items.map((item) => tcExpr(env, locals, item, SRC));
      // Get first non-empty type
      const listType = tItems.find((item) => item.a.type.tag !== "empty");
      if(tItems.length > 0) {
        if(listType === undefined) {
          return { ...expr, a: {...expr.a, type: {tag: "list", itemType: {tag: "empty"}}}, items: tItems };
        } else if(tItems.every((item) => isAssignable(env, listType.a.type, item.a.type))) {
          return { ...expr, a: {...expr.a, type: {tag: "list", itemType: listType.a.type}}, items: tItems };
        } else {
          throw new TypeCheckError(`List constructor type mismatch` + bigintSafeStringify(listType) + bigintSafeStringify(tItems));
        }
      }
      return { ...expr, a: {...expr.a, type: {tag: "empty"}}, items: tItems };
    default: throw new TypeCheckError(SRC, `unimplemented type checking for expr: ${expr}`, expr.a);
  }
}

export function doGenericFuncParamTypeMatching(tenv : Map<string, Type>, pType: Type, argType: Type) {
  if (pType.tag === "typevar") {
    if (!tenv.has(pType.name)) {
      tenv.set(pType.name, argType);
    }
  }

  if (pType.tag === "class" && pType.params.length > 0) {
    if (argType.tag !== "class" || argType.params.length !== pType.params.length) {
      // Error here, essentially if Box[T] is expected and int/bool/class with no incorrect # of params is passed?
      throw new TypeCheckError();
    }
    pType.params.forEach((p, i) => doGenericFuncParamTypeMatching(tenv, p, argType.params[i]));
  }

  if (pType.tag === "callable") {
    if (argType.tag !== "callable") {
      throw new TypeCheckError();
    }
    pType.params.forEach((p, i) => doGenericFuncParamTypeMatching(tenv, p, argType.params[i]));
    doGenericFuncParamTypeMatching(tenv, pType.ret, argType.ret);
  }
}

export function checkAssignabilityOfFuncCallLocalParams(env: GlobalTypeEnv, tenv : Map<string, Type>, pType : Type, argType : Type) : boolean {
  if (pType.tag === "typevar" || (pType.tag === "class" && pType.params.length > 0) || pType.tag === "callable") {
    doGenericFuncParamTypeMatching(tenv, pType, argType);
    
    const sType = specializeType(tenv, pType);
    return isAssignable(env, argType, sType);
  }
  
  return isAssignable(env, argType, pType);
}

// function to return the type of iterator in for-loop. Finds the string in globals/locals and returns its type
// Will be extended to include tuples etc in later commits
export function tcIterator(env : GlobalTypeEnv, locals : LocalTypeEnv, iterator: string): Type{
  if (locals.vars.has(iterator))
   return locals.vars.get(iterator) 
  else if (env.globals.has(iterator))
     return env.globals.get(iterator)
   throw new TypeCheckError(`Undefined iterator`)
}

export function tcLiteral(literal : Literal<Annotation>) {
    switch(literal.tag) {
        case "bool": return BOOL;
        case "num": return NUM;
        case "none": return NONE;
    }
}
