import { assert } from "../utils/assert.js"
import { Addr, AddrMb, Depth, depthInc, DirectAddr, Heap, isAddrNo, isAddrYes, NodeWalker, TypeAddr, Visitor, assumeIsType } from "../graph/graph-heap2.js"
import { isUpper } from "../syntax/scan.js"
// import { assumeIsType } from "../graph/graph-ti.js"



export type GraphPredicates = {
    tyContainsUnknown(ty: TypeAddr): boolean
    termEqual(a: AddrMb, b: AddrMb, unknownEqualsUnknown: boolean): null | boolean

    isTyFreeOfUnknowns(a: TypeAddr): boolean
    isVarUsed(varDepth: Depth, a: Addr, checkTmVar?: boolean, checkTyVar?: boolean): boolean
    isVarNotUsed(varDepth: Depth, a: Addr): boolean
    isTyVarUsed(varDepth: Depth, a: Addr): boolean
    isTyVarNotUsed(varDepth: Depth, a: Addr): boolean
    isTmVarUsed(varDepth: Depth, a: Addr): boolean
    equalTypes(a: TypeAddr, b: TypeAddr): boolean

    isDependentFunTy(a: TypeAddr): boolean | null

}

// The termEqual function needs to handle cycles better.
// For now, limiting the stack-depth is sufficient.
// When the stack-depth is exceeded, null is returned.
type StackLimit = number
const defaultStackLimit = 1000

export function graphPredicatesMk(h: Heap): GraphPredicates {

    const dOf = h.directAddrOf

    return {
        tyContainsUnknown,
        termEqual: (aMb, bMb, unEqUn) => termEqual(defaultStackLimit, aMb, bMb, unEqUn)!,
        isTyFreeOfUnknowns,
        isVarUsed,
        isVarNotUsed,
        isTyVarUsed,
        isTyVarNotUsed,
        isTmVarUsed,
        equalTypes,
        isDependentFunTy,
    }

    function tyContainsUnknown(ty: TypeAddr): boolean {
        let containsUnknown = false

        const done = new Set<Addr>

        const walker: NodeWalker = {
            child(addr) {
                if (containsUnknown) return
                h.nodeGuide(visitor, addr)
            },
        }

        const visitor: Visitor<void> = h.mkVisitor({
            tm(addr) {
                h.nodeWalkOnce(done, walker, addr)
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
                    containsUnknown = true
                }
                else {
                    h.nodeWalkOnce(done, walker, addr)
                }
            },
        })

        h.nodeGuide(visitor, ty)
        return containsUnknown
    }

    // A structural term-equality.
    // This ignores diffrerences in indirections and type-annotations.
    function termEqual(sl: StackLimit, aMb: AddrMb, bMb: AddrMb, unknownEqualsUnknown: boolean): null | boolean {
        if (sl === 0) return null

        if (isAddrNo(aMb) && isAddrNo(bMb)) {
            return true
        }
        if (isAddrNo(aMb) || isAddrNo(bMb)) {
            return false
        }

        const a = h.directAddrOf(aMb)
        const b = h.directAddrOf(bMb)

        if (unknownEqualsUnknown) {
            if (a === b) {
                return true
            }
        }
        else {
            if (h.isTyPrim("Unknown", a) || h.isTyPrim("Unknown", b)) {
                return false
            }
        }

        if (h.depthOf(a) !== h.depthOf(b)) {
            return false
        }

        if (!h.nodeTagAttrsEqual(a, b)) {
            return false
        }

        const aArity = h.nodeArity(a)
        const bArity = h.nodeArity(b)
        assert.isTrue(aArity === bArity)

        if (h.isTyPrim(null, a) && aArity === 0) {
            const name = h.name_of(a)
            if (isUpper(name[0]) || name[0] === "{") {
                // Lots of places in the code assume an equality check between disjoint zero-arity type constructors tells us they are different.
                // This should be fine, but if they ever differ only in depth, confusion will occur.
                // In practice they should always be at depth zero.
                assert.isTrue(h.depthOf(a) === 0)
            }
        }

        for (let i = 0; i !== aArity; i++) {
            const aChild = h.nodeChild(a, i)
            const bChild = h.nodeChild(b, i)
            // if (!termEqual(sl - 1, aChild, bChild, unknownEqualsUnknown)) {
            //     return false
            // }
            const iEq = termEqual(sl - 1, aChild, bChild, unknownEqualsUnknown)
            switch (iEq) {
                case null: return null
                case false: return false
                case true: continue
                default: assert.noMissingCases(iEq)
            }
        }

        return true
    }


    function isTyFreeOfUnknowns(a: TypeAddr): boolean {
        return !tyContainsUnknown(a)
    }



    // TODO Make sure we visit types as well as terms.
    // TODO Avoid repeatedly visiting the same sub-graphs, this is a DAG not a tree.
    function isVarUsed(varDepth: Depth, a: Addr, checkTmVar: boolean = true, checkTyVar: boolean = true): boolean {
        let varFound = false
        assert.isTrue(checkTmVar || checkTyVar)

        const done = new Set<Addr>

        const walker: NodeWalker = {
            child(addr) {
                addr = dOf(addr)
                h.nodeGuide(visitor, addr)
            }
        }

        const visitor: Visitor<void> = h.mkVisitor({
            tm(addr) {
                if (varFound) return
                addr = dOf(addr)
                if (h.depthOf(addr) >= varDepth) {
                    h.nodeWalkOnce(done, walker, addr)
                }
            },
            tmVar(addr) {
                if (!checkTmVar) return
                addr = dOf(addr)
                if (h.depthOf(addr) === varDepth) {
                    varFound = true
                }
            },
            tyVar(addr) {
                if (!checkTyVar) return
                addr = dOf(addr)
                if (h.depthOf(addr) === varDepth) {
                    varFound = true
                }
            },
        })
        h.nodeGuide(visitor, a)
        return varFound
    }

    function isVarNotUsed(varDepth: Depth, a: Addr): boolean {
        return !isVarUsed(varDepth, a)
    }

    function isTyVarUsed(varDepth: Depth, a: Addr): boolean {
        return isVarUsed(varDepth, a, false, true)
    }
    function isTyVarNotUsed(varDepth: Depth, a: Addr): boolean {
        return !isTyVarUsed(varDepth, a)
    }

    function isTmVarUsed(varDepth: Depth, a: Addr): boolean {
        return isVarUsed(varDepth, a, true, false)
    }


    function equalTypes(a: TypeAddr, b: TypeAddr): boolean {
        return a === b && isTyFreeOfUnknowns(a)
    }


    function isDependentFunTy(a0: TypeAddr): boolean | null {
        const idft = isDependentFunTy
        const a = h.directAddrOf(a0)

        if (h.isTyFun(a)) {
            const varDepth = depthInc(h.depthOf(a))
            const tmVarUsed = isTmVarUsed(varDepth, h.cod_ty(a))
            return tmVarUsed
        }
        if (h.isTyVar(a)) {
            return false
        }
        if (h.isPrim("{<:}", a)) {
            const r0 = idft(h.arg0_of(a))
            const r1 = idft(h.arg1_of(a))
            // const r = troolAnd(r0, r1)
            const r = troolOr(r0, r1)
            // TODO Use troolAndImp ?
            return r
        }
        if (h.isPrim("{:>}", a)) {
            const r0 = idft(h.arg0_of(a))
            const r1 = idft(h.arg1_of(a))
            // const r = troolAnd(r0, r1)
            const r = troolOr(r0, r1)
            // TODO Use troolAndImp ?
            return r
        }
        if (h.isPrim("Fix", a)) {
            const fixLam = h.directAddrOf(h.arg0_of(a))
            if (h.isTmLam(fixLam)) {
                const fixBody = h.body_tm(fixLam)
                assumeIsType(fixBody)
                const r = idft(fixBody)
                return r
            }
        }
        if (h.isPrim("Self", a)) {
            const selfLam = h.directAddrOf(h.arg0_of(a))
            if (h.isTmLam(selfLam)) {
                const selfBody = h.body_tm(selfLam)
                assumeIsType(selfBody)
                const r = idft(selfBody)
                return r
            }
        }
        if (h.isPrim("{&}", a) || h.isPrim("{|}", a)) {
            const r0 = idft(h.arg0_of(a))
            const r1 = idft(h.arg1_of(a))
            const r = troolOr(r0, r1)
            return r
        }



        return null

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


type Trool = boolean | null

function troolAnd(a: Trool, b: Trool): Trool {
    if (a === true && b === true) return true
    if (a === false || b === false) return false
    return null
}

function troolOr(a: Trool, b: Trool): Trool {
    if (a === true || b === true) return true
    if (a === false && b === false) return false
    return null
}
