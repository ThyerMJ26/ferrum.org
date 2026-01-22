import { assert } from "../utils/assert.js";
import { depthInc, isAddrNo, assumeIsType } from "../graph/graph-heap2.js";
import { isUpper } from "../syntax/scan.js";
const defaultStackLimit = 1000;
export function graphPredicatesMk(h) {
    const dOf = h.directAddrOf;
    return {
        tyContainsUnknown,
        termEqual: (aMb, bMb, unEqUn) => termEqual(defaultStackLimit, aMb, bMb, unEqUn),
        isTyFreeOfUnknowns,
        isVarUsed,
        isVarNotUsed,
        isTyVarUsed,
        isTyVarNotUsed,
        isTmVarUsed,
        equalTypes,
        isDependentFunTy,
    };
    function tyContainsUnknown(ty) {
        let containsUnknown = false;
        const done = new Set;
        const walker = {
            child(addr) {
                if (containsUnknown)
                    return;
                h.nodeGuide(visitor, addr);
            },
        };
        const visitor = h.mkVisitor({
            tm(addr) {
                h.nodeWalkOnce(done, walker, addr);
            },
            // tyPrim0(addr) {
            //     if (h.name_ty(addr) === "Unknown") {
            //         containsUnknown = true
            //     }
            //     else {
            //         h.nodeWalkOnce(done, walker, addr)
            //     }
            // },
            prim(addr) {
                if (h.name_of(addr) === "Unknown") {
                    containsUnknown = true;
                }
                else {
                    h.nodeWalkOnce(done, walker, addr);
                }
            },
        });
        h.nodeGuide(visitor, ty);
        return containsUnknown;
    }
    // A structural term-equality.
    // This ignores diffrerences in indirections and type-annotations.
    function termEqual(sl, aMb, bMb, unknownEqualsUnknown) {
        if (sl === 0)
            return null;
        if (isAddrNo(aMb) && isAddrNo(bMb)) {
            return true;
        }
        if (isAddrNo(aMb) || isAddrNo(bMb)) {
            return false;
        }
        const a = h.directAddrOf(aMb);
        const b = h.directAddrOf(bMb);
        if (unknownEqualsUnknown) {
            if (a === b) {
                return true;
            }
        }
        else {
            if (h.isTyPrim("Unknown", a) || h.isTyPrim("Unknown", b)) {
                return false;
            }
        }
        if (h.depthOf(a) !== h.depthOf(b)) {
            return false;
        }
        if (!h.nodeTagAttrsEqual(a, b)) {
            return false;
        }
        const aArity = h.nodeArity(a);
        const bArity = h.nodeArity(b);
        assert.isTrue(aArity === bArity);
        if (h.isTyPrim(null, a) && aArity === 0) {
            const name = h.name_of(a);
            if (isUpper(name[0]) || name[0] === "{") {
                // Lots of places in the code assume an equality check between disjoint zero-arity type constructors tells us they are different.
                // This should be fine, but if they ever differ only in depth, confusion will occur.
                // In practice they should always be at depth zero.
                assert.isTrue(h.depthOf(a) === 0);
            }
        }
        for (let i = 0; i !== aArity; i++) {
            const aChild = h.nodeChild(a, i);
            const bChild = h.nodeChild(b, i);
            // if (!termEqual(sl - 1, aChild, bChild, unknownEqualsUnknown)) {
            //     return false
            // }
            const iEq = termEqual(sl - 1, aChild, bChild, unknownEqualsUnknown);
            switch (iEq) {
                case null: return null;
                case false: return false;
                case true: continue;
                default: assert.noMissingCases(iEq);
            }
        }
        return true;
    }
    function isTyFreeOfUnknowns(a) {
        return !tyContainsUnknown(a);
    }
    // TODO Make sure we visit types as well as terms.
    // TODO Avoid repeatedly visiting the same sub-graphs, this is a DAG not a tree.
    function isVarUsed(varDepth, a, checkTmVar = true, checkTyVar = true) {
        let varFound = false;
        assert.isTrue(checkTmVar || checkTyVar);
        const done = new Set;
        const walker = {
            child(addr) {
                addr = dOf(addr);
                h.nodeGuide(visitor, addr);
            }
        };
        const visitor = h.mkVisitor({
            tm(addr) {
                if (varFound)
                    return;
                addr = dOf(addr);
                if (h.depthOf(addr) >= varDepth) {
                    h.nodeWalkOnce(done, walker, addr);
                }
            },
            tmVar(addr) {
                if (!checkTmVar)
                    return;
                addr = dOf(addr);
                if (h.depthOf(addr) === varDepth) {
                    varFound = true;
                }
            },
            tyVar(addr) {
                if (!checkTyVar)
                    return;
                addr = dOf(addr);
                if (h.depthOf(addr) === varDepth) {
                    varFound = true;
                }
            },
        });
        h.nodeGuide(visitor, a);
        return varFound;
    }
    function isVarNotUsed(varDepth, a) {
        return !isVarUsed(varDepth, a);
    }
    function isTyVarUsed(varDepth, a) {
        return isVarUsed(varDepth, a, false, true);
    }
    function isTyVarNotUsed(varDepth, a) {
        return !isTyVarUsed(varDepth, a);
    }
    function isTmVarUsed(varDepth, a) {
        return isVarUsed(varDepth, a, true, false);
    }
    function equalTypes(a, b) {
        return a === b && isTyFreeOfUnknowns(a);
    }
    function isDependentFunTy(a0) {
        const idft = isDependentFunTy;
        const a = h.directAddrOf(a0);
        if (h.isTyFun(a)) {
            const varDepth = depthInc(h.depthOf(a));
            const tmVarUsed = isTmVarUsed(varDepth, h.cod_ty(a));
            return tmVarUsed;
        }
        if (h.isTyVar(a)) {
            return false;
        }
        if (h.isPrim("{<:}", a)) {
            const r0 = idft(h.arg0_of(a));
            const r1 = idft(h.arg1_of(a));
            // const r = troolAnd(r0, r1)
            const r = troolOr(r0, r1);
            // TODO Use troolAndImp ?
            return r;
        }
        if (h.isPrim("{:>}", a)) {
            const r0 = idft(h.arg0_of(a));
            const r1 = idft(h.arg1_of(a));
            // const r = troolAnd(r0, r1)
            const r = troolOr(r0, r1);
            // TODO Use troolAndImp ?
            return r;
        }
        if (h.isPrim("Fix", a)) {
            const fixLam = h.directAddrOf(h.arg0_of(a));
            if (h.isTmLam(fixLam)) {
                const fixBody = h.body_tm(fixLam);
                assumeIsType(fixBody);
                const r = idft(fixBody);
                return r;
            }
        }
        if (h.isPrim("Self", a)) {
            const selfLam = h.directAddrOf(h.arg0_of(a));
            if (h.isTmLam(selfLam)) {
                const selfBody = h.body_tm(selfLam);
                assumeIsType(selfBody);
                const r = idft(selfBody);
                return r;
            }
        }
        if (h.isPrim("{&}", a) || h.isPrim("{|}", a)) {
            const r0 = idft(h.arg0_of(a));
            const r1 = idft(h.arg1_of(a));
            const r = troolOr(r0, r1);
            return r;
        }
        return null;
        // // If this isn't yet a function type, but could in future reduce to one, return null.
        // if (!h.isTyFun(a)) return null
        // // TODO ? If this is not a function type, and will never become one,
        // // TODO ?   return false
        // // TODO ? For example, an Int is not a function type, so definitely not a dependent function type.
        // const varDepth = depthInc(h.depthOf(a))
        // const tmVarUsed = isTmVarUsed(varDepth, h.cod_ty(a))
        // return tmVarUsed
    }
}
function troolAnd(a, b) {
    if (a === true && b === true)
        return true;
    if (a === false || b === false)
        return false;
    return null;
}
function troolOr(a, b) {
    if (a === true || b === true)
        return true;
    if (a === false && b === false)
        return false;
    return null;
}
//# sourceMappingURL=graph-predicates.js.map