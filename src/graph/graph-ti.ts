import { assert } from "../utils/assert.js"
import { Addr, DirectAddr, TypeAddr } from "../graph/graph-heap2.js"


export type TiMemoKey = TypeAddr & { __brand_TiMemoKey: never }
export type TiRuleName = string
export type TiExprList = [TiRuleName, TiExpr][]
export type TiMemoEntry = {
    ty: TypeAddr & TiMemoKey,
    value: TiVal | null,
    exprs: TiExprList | null,
    cause: number[]
}
export type TiMemo = Map<TypeAddr, TiMemoEntry>
export type TiCause = TiMemoKey | TiCause[]

export type TiVal = [boolean, boolean] // [known-uninhabited, known-inhabited]
// TODO ? Use a bit-pattern ?
// export type TiVal = number 

export type TiExpr =
    (
        | { tag: "TiConst",  /**/ value: TiVal }
        | { tag: "TiRef",    /**/ ref: TiMemoKey }
        | { tag: "TiAnd",    /**/ a: TiExpr, b: TiExpr }
        | { tag: "TiAndImp", /**/ a: TiExpr, b: TiExpr }
        | { tag: "TiOr",     /**/ a: TiExpr, b: TiExpr }
        | { tag: "TiOrImp",  /**/ a: TiExpr, b: TiExpr }
        | { tag: "TiNot",    /**/ a: TiExpr }
    )
    & { value?: TiVal, cause?: TiCause }

// TODO ? A sequential / short-circuit form of "or".
// TODO ?    | { tag: "TiOrSeq", a: TiExpr, b: TiExpr }
// TODO ? Only evaluate B if A is uninhabited.
// TODO ?   This should mean than B can safely contain assumptions that evaluate to contradictions,
// TODO ?     so long as these assumptions are first tested in A.
// TODO ?   Specifically when working with function codomains, 
// TODO ?     we can assume (B_dom <: A_dom) within the TiExpr for the codomain,
// TODO ?     so long as the TiExpr for the domain is { B_dom \ A_dom } (or something that implies it)
// TODO ? The current parallel behaviour is the (perhaps only) reason the "<:" operator appears risky.

export type TiExprVal = { expr: TiExpr, value: TiVal }

export type TiEdge = { ruleName: string, expr: TiExpr, value: TiVal }
export type TiNode = { ty: TiMemoKey, edges: TiEdge[], value: TiVal }

export type TiRule = [string, (ty: TiMemoKey & DirectAddr) => TiExpr]
export type TiRules = TiRule[]

export const tiUnknown: TiVal = [false, false]
export const tiDontKnow: TiVal = [false, false] // TODO ? Distinguish between don't know and can't know ?
export const tiCantKnow: TiVal = [false, false] // TODO ?
export const tiFalse: TiVal = [true, false]
export const tiTrue: TiVal = [false, true]

export const tiContradiction = (): TiVal => {
    assert.breakpoint("Contradiction Created")
    return [true, true]
}
export const tiInternalError = (): TiVal => tiContradiction()

// A contradiction can be caused by:
//   - a bad ti-rule (which might be user-definable by advanced users in future),
//       this could be caused by:
//       - two rules contradicting each other.
//       - a single rule calling TiOrImp/TiAndImp with contradictory arguments,
//             ( (TiTrue &&-> TiFalse) evaluates to TiContradiction ),
//   - a bad use of justTrustMeCast.
// An internal-error can be caused by bugs in the main implementation (so non-user-definable code).
// For now, at least, internal errors are represented as contradictions.
// In future all possible causes of internal errors should be removed.

export const tiKnown = (ti: boolean): TiVal => {
    return ti ? tiTrue : tiFalse
}

export const tieConst = (ti: TiVal): TiExpr => ({ tag: 'TiConst', value: ti })

export const tieFalse = tieConst(tiFalse)
export const tieTrue = tieConst(tiTrue)
export const tieUnknown = tieConst(tiUnknown)
export const tieContradiction = () => tieConst(tiContradiction())
export const tieInternalError = () => tieConst(tiInternalError())


// export function TypeInhabitationContradictionDetected(msg = ""): unit {
export function TypeInhabitationContradictionDetected(msg = ""): never {
    console.error(`Type Inhabitation Contradiction Detected: ${msg}`)
    throw new Error(`Type Inhabitation Contradiction Detected: ${msg}`)
}

export function tiAnd([aF, aT]: TiVal, [bF, bT]: TiVal): TiVal {
    return [aF || bF, aT && bT]
}
export function tiAndImp(a: TiVal, b: TiVal): TiVal {
    if (tiIsTrue(a) && tiIsFalse(b)) {
        TypeInhabitationContradictionDetected()
        return tiContradiction()
    }
    else if (tiIsTrue(a)) {
        return tiTrue
    }
    else if (tiIsFalse(b)) {
        return tiFalse
    }
    else {
        return tiAnd(a, b)
    }
}

export function tiOr([aF, aT]: TiVal, [bF, bT]: TiVal): TiVal {
    return [aF && bF, aT || bT]
}
export function tiOrImp(a: TiVal, b: TiVal): TiVal {
    if (tiIsTrue(a) && tiIsFalse(b)) {
        TypeInhabitationContradictionDetected()
        return tiContradiction()
    }
    else if (tiIsTrue(a)) {
        return tiTrue
    }
    else if (tiIsFalse(b)) {
        return tiFalse
    }
    else {
        return tiOr(a, b)
    }
}

export function tiNot([aF, aT]: TiVal): TiVal {
    return [aT, aF]
}


// Any code which wishes to handle contradictions, 
//   should check for contradictions first,
//   before querying a TiVal in any other way.

export function tiIsFalse([aF, aT]: TiVal): boolean {
    if (aF && aT) {
        TypeInhabitationContradictionDetected()
    }
    return aF
}

export function tiIsTrue([aF, aT]: TiVal): boolean {
    if (aF && aT) {
        TypeInhabitationContradictionDetected()
    }
    return aT
}
export function tiIsUnknown([aF, aT]: TiVal): boolean {
    if (aF && aT) {
        TypeInhabitationContradictionDetected()
    }
    return !aF && !aT
}
export function tiIsKnown([aF, aT]: TiVal): boolean {
    if (aF && aT) {
        TypeInhabitationContradictionDetected()
    }
    return aF || aT
}
export function tiIsContradiction([aF, aT]: TiVal): boolean {
    const result = aF && aT
    if (result) {
        assert.breakpoint("Contradiction Detected")
    }
    return result
}



// // Performs a quick structural test for inhabitation
// // This is used when user written code calls Hd or Tl so as to avoid prematurely projecting from a potentially void pair.
// // E.g. if we know nothing about the type A, then the type expression
// //   Tl {[A, Int]}
// // should remain unreduced until we know if A is inhabited or not
// function tiStructural(ty: Type, assumeVarsInhabited = false): TiVal {
//     let result = tiStructural1(ty, assumeVarsInhabited)
//     if (tiIsFalse(result) && ty.tag !== "TVoid") {
//         console.log(`CURIOUS ${showType2(ty)}`)
//     }
//     return result
// }


// export function assumeIsType(arg: Addr): asserts arg is TypeAddr {
//     return
// }
// export function assumeIsType2(a: Addr): TypeAddr {
//     assumeIsType(a)
//     return a
// }


