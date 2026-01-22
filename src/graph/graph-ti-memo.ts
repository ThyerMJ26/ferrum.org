import { Heap, TypeAddr } from "../graph/graph-heap2.js";
import { TiExpr, TiMemo, TiMemoEntry, TiMemoKey, TiVal, tiFalse, tiTrue, tiUnknown } from "../graph/graph-ti.js";

export type TiMemoFuncs = {
    tim: TiMemo,
    tieConst: (ti: TiVal) => TiExpr,
    tieRef: (tyA: TypeAddr) => TiExpr,
    tieAnd: (tyA: TiExpr, tyB: TiExpr) => TiExpr,
    tieAndImp: (tyA: TiExpr, tyB: TiExpr) => TiExpr,
    tieOr: (tyA: TiExpr, tyB: TiExpr) => TiExpr,
    tieOrImp: (tyA: TiExpr, tyB: TiExpr) => TiExpr,
    tieNot: (tyA: TiExpr) => TiExpr,
    tieFalse: TiExpr,
    tieTrue: TiExpr,
    tieUnknown: TiExpr,
    tieAndRefs: (tyA: TypeAddr, tyB: TypeAddr) => TiExpr,
    tieAndImpRefs: (tyA: TypeAddr, tyB: TypeAddr) => TiExpr,
    tieOrRefs: (tyA: TypeAddr, tyB: TypeAddr) => TiExpr,
    tieOrImpRefs: (tyA: TypeAddr, tyB: TypeAddr) => TiExpr,
    tieAndUnknown: (tyA: TypeAddr, tyB: TypeAddr) => TiExpr,
    tieOrUnknown: (tyA: TypeAddr, tyB: TypeAddr) => TiExpr,
    timKey: (ty: TypeAddr) => TiMemoKey,
}

export function mkTiMemoFuncs(tim: TiMemo): TiMemoFuncs {

    const tieFalse = tieConst(tiFalse)
    const tieTrue = tieConst(tiTrue)
    const tieUnknown = tieConst(tiUnknown)


    return {
        tim,
        tieConst,
        tieRef,
        tieAnd,
        tieAndImp,
        tieOr,
        tieOrImp,
        tieNot,
        tieFalse,
        tieTrue,
        tieUnknown,
        tieAndRefs,
        tieAndImpRefs,
        tieOrRefs,
        tieOrImpRefs,
        tieAndUnknown,
        tieOrUnknown,
        timKey,
    }

    function tieConst(ti: TiVal): TiExpr { return ({ tag: 'TiConst', value: ti }) }
    function tieRef(tyA: TypeAddr): TiExpr { return ({ tag: 'TiRef', ref: timKey(tyA) }) }
    function tieAnd(tyA: TiExpr, tyB: TiExpr): TiExpr { return ({ tag: 'TiAnd', a: tyA, b: tyB }) }
    function tieAndImp(tyA: TiExpr, tyB: TiExpr): TiExpr { return ({ tag: 'TiAndImp', a: tyA, b: tyB }) }
    function tieOr(tyA: TiExpr, tyB: TiExpr): TiExpr { return ({ tag: 'TiOr', a: tyA, b: tyB }) }
    function tieOrImp(tyA: TiExpr, tyB: TiExpr): TiExpr { return ({ tag: 'TiOrImp', a: tyA, b: tyB }) }
    function tieNot(tyA: TiExpr): TiExpr { return ({ tag: 'TiNot', a: tyA }) }

    function tieAndRefs(tyA: TypeAddr, tyB: TypeAddr): TiExpr { return ({ tag: 'TiAnd', a: tieRef(tyA), b: tieRef(tyB) }) }
    function tieAndImpRefs(tyA: TypeAddr, tyB: TypeAddr): TiExpr { return ({ tag: 'TiAndImp', a: tieRef(tyA), b: tieRef(tyB) }) }
    function tieOrRefs(tyA: TypeAddr, tyB: TypeAddr): TiExpr { return ({ tag: 'TiOr', a: tieRef(tyA), b: tieRef(tyB) }) }
    function tieOrImpRefs(tyA: TypeAddr, tyB: TypeAddr): TiExpr { return ({ tag: 'TiOrImp', a: tieRef(tyA), b: tieRef(tyB) }) }

    function tieAndUnknown(tyA: TypeAddr, tyB: TypeAddr): TiExpr {
        return ({ tag: 'TiAnd', a: { tag: 'TiAnd', a: tieRef(tyA), b: tieRef(tyB) }, b: tieUnknown })
    }

    function tieOrUnknown(tyA: TypeAddr, tyB: TypeAddr): TiExpr {
        return ({ tag: 'TiOr', a: { tag: 'TiOr', a: tieRef(tyA), b: tieRef(tyB) }, b: tieUnknown })
    }

    function timKey(ty: TypeAddr): TiMemoKey {
        const key = ty as TiMemoKey
        if (!tim.has(key)) {
            let entry: TiMemoEntry = { ty: key, value: null, exprs: null, cause: [] }
            tim.set(key, entry)
        }
        return key
    }

}

