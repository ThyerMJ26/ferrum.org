import { assert } from "../utils/assert.js";
export const tiUnknown = [false, false];
export const tiDontKnow = [false, false]; // TODO ? Distinguish between don't know and can't know ?
export const tiCantKnow = [false, false]; // TODO ?
export const tiFalse = [true, false];
export const tiTrue = [false, true];
export const tiContradiction = () => {
    assert.breakpoint("Contradiction Created");
    return [true, true];
};
export const tiInternalError = () => tiContradiction();
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
export const tiKnown = (ti) => {
    return ti ? tiTrue : tiFalse;
};
export const tieConst = (ti) => ({ tag: 'TiConst', value: ti });
export const tieFalse = tieConst(tiFalse);
export const tieTrue = tieConst(tiTrue);
export const tieUnknown = tieConst(tiUnknown);
export const tieContradiction = () => tieConst(tiContradiction());
export const tieInternalError = () => tieConst(tiInternalError());
// export function TypeInhabitationContradictionDetected(msg = ""): unit {
export function TypeInhabitationContradictionDetected(msg = "") {
    console.error(`Type Inhabitation Contradiction Detected: ${msg}`);
    throw new Error(`Type Inhabitation Contradiction Detected: ${msg}`);
}
export function tiAnd([aF, aT], [bF, bT]) {
    return [aF || bF, aT && bT];
}
export function tiAndImp(a, b) {
    if (tiIsTrue(a) && tiIsFalse(b)) {
        TypeInhabitationContradictionDetected();
        return tiContradiction();
    }
    else if (tiIsTrue(a)) {
        return tiTrue;
    }
    else if (tiIsFalse(b)) {
        return tiFalse;
    }
    else {
        return tiAnd(a, b);
    }
}
export function tiOr([aF, aT], [bF, bT]) {
    return [aF && bF, aT || bT];
}
export function tiOrImp(a, b) {
    if (tiIsTrue(a) && tiIsFalse(b)) {
        TypeInhabitationContradictionDetected();
        return tiContradiction();
    }
    else if (tiIsTrue(a)) {
        return tiTrue;
    }
    else if (tiIsFalse(b)) {
        return tiFalse;
    }
    else {
        return tiOr(a, b);
    }
}
export function tiNot([aF, aT]) {
    return [aT, aF];
}
// Any code which wishes to handle contradictions, 
//   should check for contradictions first,
//   before querying a TiVal in any other way.
export function tiIsFalse([aF, aT]) {
    if (aF && aT) {
        TypeInhabitationContradictionDetected();
    }
    return aF;
}
export function tiIsTrue([aF, aT]) {
    if (aF && aT) {
        TypeInhabitationContradictionDetected();
    }
    return aT;
}
export function tiIsUnknown([aF, aT]) {
    if (aF && aT) {
        TypeInhabitationContradictionDetected();
    }
    return !aF && !aT;
}
export function tiIsKnown([aF, aT]) {
    if (aF && aT) {
        TypeInhabitationContradictionDetected();
    }
    return aF || aT;
}
export function tiIsContradiction([aF, aT]) {
    const result = aF && aT;
    if (result) {
        assert.breakpoint("Contradiction Detected");
    }
    return result;
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
//# sourceMappingURL=graph-ti.js.map