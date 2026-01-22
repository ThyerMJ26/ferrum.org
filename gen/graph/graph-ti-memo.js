import { tiFalse, tiTrue, tiUnknown } from "../graph/graph-ti.js";
export function mkTiMemoFuncs(tim) {
    const tieFalse = tieConst(tiFalse);
    const tieTrue = tieConst(tiTrue);
    const tieUnknown = tieConst(tiUnknown);
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
    };
    function tieConst(ti) { return ({ tag: 'TiConst', value: ti }); }
    function tieRef(tyA) { return ({ tag: 'TiRef', ref: timKey(tyA) }); }
    function tieAnd(tyA, tyB) { return ({ tag: 'TiAnd', a: tyA, b: tyB }); }
    function tieAndImp(tyA, tyB) { return ({ tag: 'TiAndImp', a: tyA, b: tyB }); }
    function tieOr(tyA, tyB) { return ({ tag: 'TiOr', a: tyA, b: tyB }); }
    function tieOrImp(tyA, tyB) { return ({ tag: 'TiOrImp', a: tyA, b: tyB }); }
    function tieNot(tyA) { return ({ tag: 'TiNot', a: tyA }); }
    function tieAndRefs(tyA, tyB) { return ({ tag: 'TiAnd', a: tieRef(tyA), b: tieRef(tyB) }); }
    function tieAndImpRefs(tyA, tyB) { return ({ tag: 'TiAndImp', a: tieRef(tyA), b: tieRef(tyB) }); }
    function tieOrRefs(tyA, tyB) { return ({ tag: 'TiOr', a: tieRef(tyA), b: tieRef(tyB) }); }
    function tieOrImpRefs(tyA, tyB) { return ({ tag: 'TiOrImp', a: tieRef(tyA), b: tieRef(tyB) }); }
    function tieAndUnknown(tyA, tyB) {
        return ({ tag: 'TiAnd', a: { tag: 'TiAnd', a: tieRef(tyA), b: tieRef(tyB) }, b: tieUnknown });
    }
    function tieOrUnknown(tyA, tyB) {
        return ({ tag: 'TiOr', a: { tag: 'TiOr', a: tieRef(tyA), b: tieRef(tyB) }, b: tieUnknown });
    }
    function timKey(ty) {
        const key = ty;
        if (!tim.has(key)) {
            let entry = { ty: key, value: null, exprs: null, cause: [] };
            tim.set(key, entry);
        }
        return key;
    }
}
//# sourceMappingURL=graph-ti-memo.js.map