
import { assert } from "../utils/assert.js"

import { applyClosure, applyPrimitive, Value as EvValue } from "./eval.js"
import { FeValue, TypeDefn } from "../runtime/runtime-core.js"

// In the non-graph code, there are currently two ways in which values are represented.
//   - Value (eval.ts): 
//       Tagged JSON values used by an interpreter when type-checking with tree-types.
//   - FeValue (runtime-core.ts) :
//       Untagged values, and nested 2-tuples, used by the generated JS code.

// It might be worth using a common interface and single implementation.
// Using the same representation would remove the currrent need to implement some of the primitives twice,
//   once for the interpreter and once for the generated code.
// Using an interface based implementation makes it possible to:
//   change the underlying representation, and
//   use multiple representations concurrently. 
// For example, using linked-lists and contiguous lists as needed, 
//   so not require/assume nested 2-tuples ([1, [2, [3, null]]]) are always used for pairs.
// Using a class-based approach might actually suit the V8 JIT better.
//   Currently generated functions risk looking overly mega-morphic.
// It would probably be better for the JIT to compile each function once, 
//   and not go looking for opportunites to specialize which aren't there.
// ( V8 is unlikely to understand whether a function taking ([1, [2, [3, null]]]),
//     will take a 3-tuple or linked-list of integers, in general )


// Obstacles:
//   - The memoization code only works with JSON values conforming to the Data (memoize.ts) type.
//       Without memoization, type-checking goes much slower.
//       A way to specify (de)serialization methods could be added so work with non-plain Data/JSON values.
//   - The requirements for type-values is quite different for the interpreter and the codegen runtime.
//       We could nevertheless use the same representation.

// The two cases are just too different to unify.
// We need closures with a readable stack and expression ASTin order for memoization to work.
// A generated function can't be memoized, there's no data there, it's too opaque.




// Interface

// export type Value = {
//     isNil(): boolean
//     isBool(): boolean
//     isInt(): boolean
//     isStr(): boolean
//     isPair(): boolean
//     isFunc(): boolean
//     isType(): boolean

//     asNil(): null
//     asBool(): boolean
//     asInt(): number
//     asStr(): string

//     hd(): Value
//     tl(): Value
//     apply(arg: Value): Value

//     asType(): Type
// }

// export type Type = {
//     prim(): string
//     arity(): number
//     arg(pos: number): Value
// }

type Value = FeValue | EvValue

export type MkValue = {
    nil(): Value
    bool(a: boolean): Value
    int(a: number): Value
    str(a: string): Value
    pair(h: Value, t: Value): Value
    func(f: (a: Value) => Value): Value
    type(prim: string, ...args: Value[]): Value
}

export const mkValue: MkValue = {
    nil(): Value { assert.todo() },
    bool(a: boolean): Value { assert.todo() },
    int(a: number): Value { assert.todo() },
    str(a: string): Value { assert.todo() },
    pair(h: Value, t: Value): Value { assert.todo() },
    func(f: (a: Value) => Value): Value { assert.todo() },
    type(prim: string, ...args: Value[]): Value { assert.todo() },
}


// A function-interface.
// This makes it possible to still memoize the type-checking functions.

function value_isTag<T extends EvValue["tag"]>(a: Value, tag: T): a is EvValue & { tag: T } {
    return ( true 
        && a !== null 
        && ! (a instanceof Array) 
        && ! (a instanceof TypeDefn) 
        && typeof a === "object" 
        && a.tag === tag 
    )
}

function value_isNil(a: Value): boolean {
    return ( false 
        || a === null 
        || value_isTag(a, "atomic") && a.value === null
    )
} 
function value_isBool(a: Value): boolean {
    return ( false
        || typeof a === "boolean" 
        || value_isTag(a, "atomic") && typeof a.value === "boolean" 
    )
} 
function value_isInt(a: Value): boolean {
    return ( false
        || typeof a === "number" 
        || value_isTag(a, "atomic") && typeof a.value === "number" 
    )
} 
function value_isStr(a: Value): boolean {
    return ( false
        || typeof a === "string" 
        || value_isTag(a, "atomic") && typeof a.value === "string" 
    )
} 
function value_isPair(a: Value): boolean {
    return ( false
        || a instanceof Array 
        || value_isTag(a, "pair")
    )
} 
function value_isFunc(a: Value): boolean {
    return ( false
        || a instanceof Function
        || value_isTag(a, "closure")
        || value_isTag(a, "closureJust")
        || value_isTag(a, "closureMaybe")
        || value_isTag(a, "closureNothing")
        || value_isTag(a, "primitive2")
    )
} 
function value_isType(a: Value): boolean {
    return ( false
        || a instanceof TypeDefn
        || value_isTag(a, "type")
    )
} 
function value_asNil(a: Value): null {
    if (a === null) return null
    if (value_isTag(a, "atomic") && a.value === null) return null
    assert.unreachable()
}

function value_asBool(a: Value): boolean {
    if (typeof a === "boolean") return a
    if (value_isTag(a, "atomic") && typeof a.value === "boolean") return a.value
    assert.unreachable()
} 
function value_asInt(a: Value): number {
    if (typeof a === "number") return a
    if (value_isTag(a, "atomic") && typeof a.value === "number") return a.value
    assert.unreachable()
} 
function value_asStr(a: Value): string {
    if (typeof a === "string") return a
    if (value_isTag(a, "atomic") && typeof a.value === "string") return a.value
    assert.unreachable()
} 
function value_hd(a: Value): Value {
    if (a instanceof Array) return a[0]
    if (value_isTag(a, "pair")) return a.head
    assert.unreachable()
} 
function value_tl(a: Value): Value {
    if (a instanceof Array) return a[1]
    if (value_isTag(a, "pair")) return a.tail
    assert.unreachable()
} 
function value_apply(f: Value, a: Value): Value {
    if (f instanceof Function) return f(a as never)
    if (value_isTag(f, "closure") || value_isTag(f, "closureJust") || value_isTag(f, "closureMaybe") || value_isTag(f, "closureNothing")) {
        return applyClosure(f, a as EvValue, null)
    }
    if (value_isTag(f, "primitive2")) {
        return applyPrimitive(f, a as EvValue, null)
    }
    assert.unreachable()
} 

// function value_asType(a: Value): Type {
//     assert.todo()
// } 








// Impementation

// class ValueImpl implements Value {
//     isNil(): boolean { assert.todo() }
//     isBool(): boolean { assert.todo() }
//     isInt(): boolean { assert.todo() }
//     isStr(): boolean { assert.todo() }
//     isPair(): boolean { assert.todo() }
//     isFunc(): boolean { assert.todo() }
//     isType(): boolean { assert.todo() }

//     asNil(): null { assert.todo() }
//     asBool(): boolean { assert.todo() }
//     asInt(): number { assert.todo() }
//     asStr(): string { assert.todo() }

//     hd(): Value { assert.todo() }
//     tl(): Value { assert.todo() }
//     apply(arg: Value): Value { assert.todo() }

//     asType(): Type { assert.todo() }
// }


