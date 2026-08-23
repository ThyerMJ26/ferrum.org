import { assert } from "../utils/assert.js"
import { Addr, AddrQ, addrTypeType, depthZero, Heap, TypeAddr, assumeIsType, DirectAddr, assumeIsDirect } from "../graph/graph-heap2.js"
import { GraphPredicates } from "../graph/graph-predicates.js"
import { TiVal, tiFalse, tiTrue, tiUnknown, tiAnd, tiAndImp, tiNot, tiOr, tiOrImp, tiContradiction, tiInternalError, tiIsTrue } from "../graph/graph-ti.js"

type StackLimit = number

export type TiStructuralFuncs = {
    tiStructural: (tyAddr: TypeAddr) => TiVal
    tiStructuralUnion: (aTy: TypeAddr, bTy: TypeAddr) => TiVal
    tiStructuralIntersect: (aTy: TypeAddr, bTy: TypeAddr) => TiVal
    tiStructuralIntersectAssumeArgsInhabited: (aTy: TypeAddr, bTy: TypeAddr) => TiVal
    tiStructuralRelComp: (aTy: TypeAddr, bTy: TypeAddr) => TiVal
    isNotType(a: Addr): boolean
    isPairType(a: Addr): boolean
}




export function mkTiStructuralFuncs(h: Heap, p: GraphPredicates): TiStructuralFuncs {

    // const dOf = h.directAddrOf

    // An alternative way to avoid cycles is to never follow indirections.
    // This might actually work and be sensible if copyWithoutIndirections has been called.
    // This works with all the fe-.test.fe, fe4a.test.fe, fe4b-prelude.test.fe tests.
    // The fe4b.test.fe tests were failing anyway (with graph-based types), 
    //   but they do run to completion without diverging.
    function dOf<A extends Addr>(a: A): A & DirectAddr { assumeIsDirect (a); return a }

    const {
        depthOf,

        tyPrim0,
        isTyPrim, isTyOp, isTyPrimOneOf, isTyPrimOneOf2, isTyVoid, isTyNil, isTyList, isTyAny,
        name_ty, arg0_ty, arg1_ty,

        isTySingleStr, value_ty,

        tyPair, isTyPair, hd_ty, tl_ty,

        tyFun, isTyFun, no_ty, yes_ty, dom_ty, cod_ty,
        tyVar, isTyVar,

        tmVar,
        tmLam, isTmLam, pat_tm, body_tm,

        tyApply, isTyApply, fun_ty, arg_ty,

        tyOp1, tyOp2,
        tyUnion, tyIntersect, tyRelComp,
        tyHead, tyTail,
        tyDom, tyCod,
    } = h

    const isPrim = isTyPrim
    const isPrims = isTyPrimOneOf
    const tyAny = tyPrim0("Any", depthZero)
    const tyPairAnyAny = tyPair(tyAny, tyAny, depthZero)

    const defaultStackLimit: StackLimit = 1000

    return {
        tiStructural: (ty0) => tiStructural(defaultStackLimit, ty0),
        tiStructuralUnion: (aTy, bTy) => tiStructuralUnion(defaultStackLimit, aTy, bTy),
        tiStructuralIntersect: (a0, b0) => tiStructuralIntersect(defaultStackLimit, a0, b0),
        tiStructuralIntersectAssumeArgsInhabited: (a0, b0) => tiStructuralIntersectAssumeArgsInhabited(defaultStackLimit, a0, b0),
        tiStructuralRelComp: (a0, b0) => tiStructuralRelComp(defaultStackLimit, a0, b0),
        isNotType,
        isPairType,
    }

    function equalType(a: Addr, b: Addr): boolean | null {
        return p.termEqual(a, b, false)
    }

    // Returns true only if "a" is definitely not a type.
    // If "a" is, or might be, a type, returns false.
    function isNotType(a0: Addr): boolean {
        const a = dOf(a0)
        assumeIsType(a)
        const rc = tiStructuralRelComp(defaultStackLimit, a, addrTypeType)
        return tiIsTrue(rc)
    }

    // TODO ? A faster version ?
    // TODO ? If this function is used a lot, using the more generic tiStructuralRelComp is needlessly slow.
    // Returns true if A is a pair and nothing else.
    function isPairType(a: TypeAddr): boolean {
        const rc = tiStructuralRelComp(defaultStackLimit, a, tyPairAnyAny)
        return tiIsTrue(rc)
    }

    function tiStructural(sl: StackLimit, ty0: TypeAddr): TiVal {
        if (sl === 0) return tiUnknown
        const ty = dOf(ty0)

        const tis = (ty: TypeAddr) => tiStructural(sl - 1, ty)
        const tisRc = (a: TypeAddr, b: TypeAddr) => tiStructuralRelComp(sl - 1, a, b)
        const tisIn = (a: TypeAddr, b: TypeAddr) => tiStructuralIntersect(sl - 1, a, b)


        if (isTySingleStr(ty)) {
            return tiTrue
        }
        if (isPrims(["Any", "All", "Nil", "Bool", "Int", "Char", "Str", "List", "Type", "Error"], ty)) {
            return tiTrue
        }
        if (isPrims(["Void"], ty)) {
            return tiFalse
        }
        if (isPrims(["Unknown"], ty)) {
            return tiUnknown
        }
        if (isTyVar(ty)) {
            // We can probably do better than tiUnknown here
            // TODO ? Lookup the binder in a passed in environment ?
            // TODO ?   In hash-consed graph, there's no longer a unique binder for a TmVar/TyVar.
            return tiUnknown
            // How dangerous is it to just return tiTrue ?
            // And why don't tree-types use this approach ?
            // return tiTrue
            // It should be safe to assume a TyVar within a function is inhabited.
            // If it's not, then the function that binds it is uncallable.
            // What's not safe is to assume a TmVar which contains a Type is inhabited.
            // The tree-type code didn't sufficiently distinguish these two cases.
        }
        if (isTyPair((ty))) {
            return tiAnd(tis(hd_ty(ty)), tis(tl_ty(ty)))
        }
        if (isTyOp("{<:}", ty)) {
            const subTy = arg0_ty(ty)
            const superTy = arg1_ty(ty)
            return tiAndImp(tis(subTy), tis(superTy))
        }
        if (isTyOp("{:>}", ty)) {
            const superTy = arg0_ty(ty)
            const subTy = arg1_ty(ty)
            return tiOrImp(tis(subTy), tis(superTy))
        }
        if (isTyPrim("Self", ty) || isTyPrim("Fix", ty)) {
            const func = dOf(arg0_ty(ty))
            // If the operator argument is a clearly a lambda, check the codomain is clearly inhabited.
            if (isTmLam(func)) {
                const body = body_tm(func)
                assumeIsType(body)
                return tis(body)
            }
            else {
                // If the operator argument has not yet been reduced yet, 
                //   then we don't know if it will return an inhabited type
                return tiUnknown
            }
            // If the operator argument reduced to something other than a TmLambda, 
            //   there must be a type error in the user code.
            // We could check for this and return tiFalse instead of the tiUnknown above, 
            //   the error will have already been found so returning tiFalse is not strictly needed. 
        }
        if (isTyOp("{|}", ty)) {
            return tiOr(tis(arg0_ty(ty)), tis(arg1_ty(ty)))
        }
        if (isTyOp("{&}", ty)) {
            return tisIn(arg0_ty(ty), arg1_ty(ty))
        }
        if (isTyOp("{\\}", ty)) {
            return tisRc(arg0_ty(ty), arg1_ty(ty))
        }
        if (isTyPrim("Dom", ty) || isTyPrim("Cod", ty)) {
            return tiUnknown
            // TODO We should be able to do better than return tiUnknown.
        }

        if (isTyFun(ty)) {
            // Substituting the domain into the codomain would give a more precise answer,
            // But to keep things structural and quick, we don't do that here.
            const tiDom = tis(dom_ty(ty))
            const tiCod = tis(cod_ty(ty))
            return tiOr(tiNot(tiDom), tiCod)
        }

        return tiUnknown
    }


    function tiStructuralUnion(sl: StackLimit, aTy: TypeAddr, bTy: TypeAddr): TiVal {
        if (sl === 0) return tiUnknown
        let tis = (ty: TypeAddr) => tiStructural(sl - 1, ty)
        return tiOr(tis(aTy), tis(bTy))
    }

    function tiStructuralRelComp(sl: StackLimit, a0: TypeAddr, b0: TypeAddr): TiVal {
        if (sl === 0) return tiUnknown
        let tis = (ty: TypeAddr) => tiStructural(sl - 1, ty)
        let tisRc = (a: TypeAddr, b: TypeAddr) => tiStructuralRelComp(sl - 1, a, b)
        let tisIn = (a: TypeAddr, b: TypeAddr) => tiStructuralIntersect(sl - 1, a, b)

        const a = dOf(a0)
        const b = dOf(b0)

        if (equalType(a, b)) {
            return tiFalse
        }

        if (isTyPrim("Error", a) || isPrim("Error", b)) {
            // "Error" is both universally accepting and universally acceptable
            return tiFalse
        }
        if (isPrim("Void", a) || isPrim("Any", b)) {
            return tiFalse
        }
        if (isTySingleStr(a) && isPrim("Str", b)) {
            return tiFalse
        }
        if (isTySingleStr(a) && isPrim("Char", b)) {
            return value_ty(a).length === 1 ? tiFalse : tiTrue
        }
        if (isTySingleStr(a) && isTySingleStr(b)) {
            return value_ty(a) === value_ty(b) ? tiFalse : tiTrue
        }
        if (isPrim("Str", a) && isPrim("Char", b)) {
            return tiTrue
        }
        if (isPrim("Char", a) && isPrim("Str", b)) {
            return tiFalse
        }
        if (isTyFun(a) && isTyFun(b)) {
            // We perform structural checks on both the domain and codomain, independently of each other.
            // If domRc and codRc are both uninhabited,
            //   then funRc is uninhabited (ok to use an A and a B).
            // If domRc is inhabited, then funRc is also inhabited (a type error).  
            // If codRc is inhabited, 
            //   we cannot say if funRc is inhabited or not.
            //   We need to known what the codomain of A reduces to when substituted with the domain of B before we can say that funRc is inhabited.
            //   But this requires more work than can be done with a quick structural check.
            //   So the use of (tiAnd (tiUnknown, ...)) limits the effective values used from codRc to tiFalse or tiUnknown (tiTrue becomes tiUnknown).
            const domRc = tisRc(dom_ty(b), dom_ty(a))
            const codRc = tisRc(cod_ty(a), cod_ty(b))
            const funRc = tiOr(domRc, tiAnd(tiUnknown, codRc))
            return funRc
        }
        if (isPrim("Void", b)) {
            return tis(a)
        }
        if (isTyVar(a) && isTyVar(b)) {
            return depthOf(a) === depthOf(b) ? tiFalse : tiUnknown
        }

        // We can count SingleStr and Str as disjoint here, as they will be if we reach this far.
        const isDisjoint = (a: AddrQ) =>
            isPrims(["Int", "Bool", "Type", "Str", "Char", "Nil"], a) ||
            isTySingleStr(a)
        if (isDisjoint(a) && isDisjoint(b)) {
            return equalType(a, b) ? tiFalse : tiTrue
        }

        if (isTyPair(a) && isTyPair(b)) {
            let tiHd = tisRc(hd_ty(a), hd_ty(b))
            let tiTl = tisRc(tl_ty(a), tl_ty(b))
            return tiOr(tiHd, tiTl)
        }
        if (isTyPrim("List", a) && isTyPrim("List", b)) {
            return tisRc(arg0_ty(a), arg0_ty(b))
        }
        if (isTyPair(a) && isTyList(b)) {
            return tiOr(tisRc(hd_ty(a), arg0_ty(b)), tisRc(tl_ty(a), b))
        }
        if (isTyList(a) && isTyPair(b)) {
            return tiTrue
        }
        if (isTyNil(a) && isTyList(b)) {
            return tiFalse
        }
        if (isTyList(a) && isTyNil(b)) {
            return tis(arg0_ty(a))
        }
        if (isTyNil(a) && isTyPair(b)) {
            return tiTrue
        }
        if (isTyPair(a) && isTyNil(b)) {
            return tis(a)
        }

        const isNonPair = (a: AddrQ) =>
            isPrims(["Any", "Bool", "Type", "Str", "Char", "Nil"], a) ||
            isTySingleStr(a) || isTyFun(a)
        if (isNonPair(a) && isTyPair(b)) {
            return tiTrue
        }


        if (isTyPrimOneOf(["{|}", "{\\}", "{&}"], a) && isTyPrim("Type", b)) {
            // These can only be types, so no need to descend into the arguments.
            return tiFalse
        }

        if (isTyOp("{|}", a)) {
            // TODO ? Traverse nested {|} operators and collect arguments, and remove cycles.
            // TODO ?   Cycles can form due to reduction and memoization.
            // TODO ? It might be better to find a more general solution to this.
            // TODO ?   Checking for identical, but nested calls to any of the tiStructural functions would be a start.
            // TODO ? Currently a stack-overflow can occur, with the same few arguments repeating in a cycle.

            // TODO ? This is supposed to be a structural test.
            // TODO ? When cycles are enountered, we could:
            // TODO ?   - return tiUnknown 
            // TODO ?   - return a "fail" value,
            // TODO ?       so as to indicate we should back-track through the most recently encountered indirection, 
            // TODO ?       and then continue down an unevaluated path
            // TODO ?         (much like how copyWithoutIndirections works).

            // TODO ? All the recusive calls to tis/tisRc/tisIn should go via the TI-memo table.
            // TODO ? With tree types there are two versions of the structural TI code, 
            // TODO ? One directly recurses, the other recurses via the TI-memo table.
            // TODO ? only that second approach makes sense when using graph-types.

            let ti1 = tisRc(arg0_ty(a), b)
            let ti2 = tisRc(arg1_ty(a), b)
            return tiOr(ti1, ti2)
        }
        if (isTyOp("{|}", b)) {
            const rc0 = tisRc(a, arg0_ty(b))
            const rc1 = tisRc(a, arg1_ty(b))
            return tiAnd(tiUnknown, tiAnd(rc0, rc1))
        }

        if (isTyOp("{\\}", b) && isPrim("Any", dOf(arg0_ty(b)))) {
            return tisIn(a, arg1_ty(b))
        }

        if (isTyOp("{:>}", a)) {
            const aSup = arg0_ty(a)
            const aSub = arg1_ty(a)
            let rcSup = tisRc(aSup, b)
            let rcSub = tisRc(aSub, b)
            // if aSub extends beyond B, then aSuper definitely does.
            return tiOrImp(rcSub, rcSup)
        }

        // TODO ? Handle {<:}
        // if (isOp("<:", a) && is("TyFun", b)) {
        //     const [a_type, a_super] = a.args
        //     return tiAndImp(tisRc(a_type, bTy), tisRc(a_super, bTy))
        // }

        return tiUnknown
    }

    function tiStructuralIntersect(sl: StackLimit, a0: TypeAddr, b0: TypeAddr): TiVal {
        if (sl === 0) return tiUnknown
        const a = dOf(a0)
        const b = dOf(b0)

        let tis = (ty: TypeAddr) => tiStructural(sl - 1, ty)
        let tisRc = (a: TypeAddr, b: TypeAddr) => tiStructuralRelComp(sl - 1, a, b)
        let tisIn = (a: TypeAddr, b: TypeAddr) => tiStructuralIntersect(sl - 1, a, b)

        if (equalType(a, b)) {
            return tis(a)
        }

        if (isPrim("Void", a) || isPrim("Void", b)) {
            return tiFalse
        }

        if (isTyPair(a) && isTyPair(b)) {
            let hd = tisIn(hd_ty(a), hd_ty(b))
            let tl = tisIn(tl_ty(a), tl_ty(b))
            return tiAnd(hd, tl)
        }
        if (isTyNil(a) && isTyNil(b)) {
            return tiTrue
        }
        if (isTySingleStr(a) && isTySingleStr(b)) {
            return value_ty(a) === value_ty(b) ? tiTrue : tiFalse
        }
        if (isTySingleStr(a) && isPrim("Str", b)) {
            return tiTrue
        }
        if (isPrim("Str", a) && isTySingleStr(b)) {
            return tiTrue
        }
        if (isPrim("Str", a) && isPrim("Char", b)) {
            return tiTrue
        }
        if (isPrim("Char", a) && isPrim("Str", b)) {
            return tiTrue
        }
        if (isPrim("Any", a)) {
            // TODO handle the difference between Any and All correctly
            return tis(b)
        }
        if (isPrim("Any", b)) {
            // TODO handle the difference between Any and All correctly
            return tis(a)
        }
        if (isTyList(a) && isTyNil(b)) {
            return tiTrue
        }
        if (isTyNil(a) && isTyList(b)) {
            return tiTrue
        }
        if (isTyPair(a) && isTyNil(b)) {
            return tiFalse
        }
        if (isTyNil(a) && isTyPair(b)) {
            return tiFalse
        }
        if (isTyList(a) && isTyPair(b)) {
            const elem = arg0_ty(a)
            const ti1 = tisIn(elem, hd_ty(b))
            const ti2 = tisIn(a, tl_ty(b))
            return tiAnd(ti1, ti2)
        }
        if (isTyPair(a) && isTyList(b)) {
            const elem = arg0_ty(b)
            const ti1 = tisIn(hd_ty(a), elem)
            const ti2 = tisIn(tl_ty(a), b)
            return tiAnd(ti1, ti2)
        }

        if (isTyOp("{\\}", b) && isPrim("Any", dOf(arg0_ty(b)))) {
            return tisRc(a, arg1_ty(b))
        }

        if (isTyOp("{|}", a)) {
            const ti1 = tisIn(arg0_ty(a), b)
            const ti2 = tisIn(arg1_ty(a), b)
            return tiOr(ti1, ti2)
        }

        // We can count SingleStr and Str as disjoint here, as they will be if we reach this far.
        const isDisjoint = (a: AddrQ) =>
            isTySingleStr(a) ||
            isPrims(["Int", "Bool", "Type", "Str", "Char", "Nil"], a)

        if (isTyPair(a) && isDisjoint(b)) {
            return tiFalse
        }
        if (isDisjoint(a) && isTyPair(b)) {
            return tiFalse
        }

        if (isTyPrim("Fix", a)) {
            const func = dOf(arg0_ty(a))
            if (isTmLam(func)) {
                const body = body_tm(func)
                assumeIsType(body)
                return tisIn(body, b)
            }
        }
        if (isTyPrim("Fix", b)) {
            const func = dOf(arg0_ty(b))
            if (isTmLam(func)) {
                const body = body_tm(func)
                assumeIsType(body)
                return tisIn(a, body)
            }
        }

        return tiUnknown
    }

    function tiStructuralIntersectAssumeArgsInhabited(sl: StackLimit, a0: TypeAddr, b0: TypeAddr): TiVal {
        if (sl === 0) return tiUnknown

        const a = dOf(a0)
        const b = dOf(b0)

        let tis = (ty: TypeAddr) => tiStructural(sl - 1, ty)
        let tisRc = (a: TypeAddr, b: TypeAddr) => tiStructuralRelComp(sl - 1, a, b)
        let tisInAai = (a: TypeAddr, b: TypeAddr) => tiStructuralIntersectAssumeArgsInhabited(sl - 1, a, b)

        if (equalType(a, b)) {
            return tiTrue
        }

        if (isPrim("Any", a) || isPrim("Any", b)) {
            // TODO handle the difference between Any and All correctly
            return tiTrue
        }

        if (isTyPair(a) && isTyPair(b)) {
            let hd = tisInAai(hd_ty(a), hd_ty(b))
            let tl = tisInAai(tl_ty(a), tl_ty(b))
            return tiAnd(hd, tl)
        }
        if (isTyNil(a) && isTyNil(b)) {
            return tiTrue
        }
        if (isTySingleStr(a) && isTySingleStr(b)) {
            return value_ty(a) === value_ty(b) ? tiTrue : tiFalse
        }
        if (isTySingleStr(a) && isPrim("Str", b)) {
            return tiTrue
        }
        if (isPrim("Str", a) && isTySingleStr(b)) {
            return tiTrue
        }
        if (isTySingleStr(a) && isPrim("Char", b) && h.value_ty(a).length === 1) {
            return tiTrue
        }
        if (isPrim("Char", a) && isTySingleStr(b) && h.value_ty(b).length === 1) {
            return tiTrue
        }
        if (isPrim("Str", a) && isPrim("Char", b)) {
            return tiTrue
        }
        if (isPrim("Char", a) && isPrim("Str", b)) {
            return tiTrue
        }
        if (isPrim("Any", a)) {
            // TODO handle the difference between Any and All correctly
            return tis(b)
        }
        if (isPrim("Any", b)) {
            // TODO handle the difference between Any and All correctly
            return tis(a)
        }
        if (isTyList(a) && isTyNil(b)) {
            return tiTrue
        }
        if (isTyNil(a) && isTyList(b)) {
            return tiTrue
        }
        if (isTyPair(a) && isTyNil(b)) {
            return tiFalse
        }
        if (isTyNil(a) && isTyPair(b)) {
            return tiFalse
        }
        if (isTyList(a) && isTyPair(b)) {
            const elem = arg0_ty(a)
            const ti1 = tisInAai(elem, hd_ty(b))
            const ti2 = tisInAai(a, tl_ty(b))
            return tiAnd(ti1, ti2)
        }
        if (isTyPair(a) && isTyList(b)) {
            const elem = arg0_ty(b)
            const ti1 = tisInAai(hd_ty(a), elem)
            const ti2 = tisInAai(tl_ty(a), b)
            return tiAnd(ti1, ti2)
        }

        if (isTyOp("{\\}", b) && isPrim("Any", dOf(arg0_ty(b)))) {
            // TODO ? Do we need an AssumeArgsInhabited variant of relative-complement too ?
            return tisRc(a, arg1_ty(b))
        }

        if (isTyOp("{|}", a)) {
            const ti1 = tisInAai(arg0_ty(a), b)
            const ti2 = tisInAai(arg1_ty(a), b)
            return tiOr(ti1, ti2)
        }

        if (isTyOp("{<:}", a)) {
            const ti0 = tisInAai(arg0_ty(a), b)
            const ti1 = tisRc(arg1_ty(a), b)
            return tiOrImp(tiNot(ti1), ti0)
        }
        if (isTyOp("{<:}", b)) {
            const ti0 = tisInAai(a, arg0_ty(b))
            const ti1 = tisRc(a, arg1_ty(b))
            return tiOrImp(tiNot(ti1), ti0)
        }
        if (isTyOp("{:>}", a)) {
            const ti0 = tisInAai(arg0_ty(a), b)
            const ti1 = tisInAai(arg1_ty(a), b)
            return tiOrImp(ti1, ti0)
        }
        if (isTyOp("{:>}", b)) {
            const ti0 = tisInAai(a, arg0_ty(b))
            const ti1 = tisInAai(a, arg1_ty(b))
            return tiOrImp(ti1, ti0)
        }

        // We can count SingleStr and Str as disjoint here, as they will be if we reach this far.
        const isDisjoint = (a: AddrQ) =>
            isTySingleStr(a) ||
            isPrims(["Int", "Bool", "Type", "Str", "Char", "Nil"], a)

        if (isTyPair(a) && isDisjoint(b)) {
            return tiFalse
        }
        if (isDisjoint(a) && isTyPair(b)) {
            return tiFalse
        }

        if (isTyPrim("Fix", a)) {
            const func = dOf(arg0_ty(a))
            if (isTmLam(func)) {
                const body = body_tm(func)
                assumeIsType(body)
                return tisInAai(body, b)
            }
        }
        if (isTyPrim("Fix", b)) {
            const func = dOf(arg0_ty(b))
            if (isTmLam(func)) {
                const body = body_tm(func)
                assumeIsType(body)
                return tisInAai(a, body)
            }
        }

        // Given how the tisInAai function is used, it should be safe to always return true here.
        // To be more accurate we should check that the two function don't contradict each other.
        if (isTyFun(a) && isTyFun(b)) {
            return tiTrue
        }

        return tiUnknown
    }


}



