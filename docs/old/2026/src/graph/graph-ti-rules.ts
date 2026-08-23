import { assert } from "../utils/assert.js"
import {
    TypeAddr, Addr, Depth, depthInc, DepthShift,
    AddrQ, Addr_of_TyCon, Addr_of_TyFun,
    Heap, TypeAddrD, TypeAddrMb, false0, isAddrYes, addrNo,
    Addr_of_TyOp1,
    depthZero,
    Addr_of_TyPrim1,
    addrTypeType,
    assumeIsType,
} from "../graph/graph-heap2.js"
import {
    TiExpr, TiMemo, TiMemoEntry, TiMemoKey, TiRule, TiRules, tiContradiction, tiFalse, tiTrue, tiUnknown, tieFalse,
    tieInternalError, tieTrue, tieUnknown
} from "../graph/graph-ti.js"
import { tiStructuralRelComp, typeCheck } from "../tree/types.js"
import { TiMemoFuncs } from "./graph-ti-memo.js"
import { Instantiate } from "../graph/graph-instantiate.js"
import { SubstEnv, mkSubstitute } from "./graph-substitute.js"
import { mkTiStructuralFuncs, TiStructuralFuncs } from "./graph-ti-structural.js"
import { GraphPredicates } from "../graph/graph-predicates.js"
import { Primitives } from "./graph-primitives.js"

export function mkTiRules(
    h: Heap, tim: TiMemoFuncs, p: GraphPredicates, tis: TiStructuralFuncs,
): TiRules {

    const {
        directAddrOf,
        depthOf,

        tyPrim0, tyPrim1, tyPrim2,
        isTyPrim, isTyOp, isTyPrimOneOf, isTyPrimOneOf2, isTyVoid, isTyNil, isTyList, isTyAny,
        name_ty, arg0_ty, arg1_ty,

        isTySingleStr, value_ty,

        tyPair, isTyPair, hd_ty, tl_ty,

        tyFun, isTyFun, no_ty, yes_ty, dom_ty, cod_ty,
        tyVar, isTyVar,

        tmVar,
        tmLam, isTmLam, pat_tm, body_tm,

        tyApply, isTyApply, fun_ty, arg_ty,
        tmApply,

        tyOp1, tyOp2,
        tyHead, tyTail,
        tyDom, tyCod,
    } = h

    const tyRelComp   /**/ = (a: TypeAddr, b: TypeAddr, depth: Depth) => h.tyCon2("{\\}", a, b, depth)
    const tyUnion     /**/ = (a: TypeAddr, b: TypeAddr, depth: Depth) => h.tyCon2("{|}", a, b, depth)
    const tyIntersect /**/ = (a: TypeAddr, b: TypeAddr, depth: Depth) => h.tyCon2("{&}", a, b, depth)

    const dOf = h.directAddrOf
    const tyElem = (arg: TypeAddr, depth: Depth) => h.tyPrim1("Elem", arg, depth)
    const typeType = addrTypeType
    const tyPairAnyAny = tyPair(tyPrim0("Any", depthZero), tyPrim0("Any", depthZero), depthZero)

    function tySub(a: TypeAddr, b: TypeAddr, depth: Depth): TypeAddr {
        return tyOp2("{<:}", a, b, depth)
    }


    const {
        tieConst,
        tieRef,
        tieAnd,
        tieAndImp,
        tieOr,
        tieOrImp,
        tieNot,
        // tieFalse,
        // tieTrue,
        // tieUnknown,
        tieAndRefs,
        tieAndImpRefs,
        tieOrRefs,
        tieOrImpRefs,
        tieAndUnknown,
        tieOrUnknown,
        timKey,
    } = tim

    const subst = mkSubstitute(h)

    function substTy(appDepth: Depth, varDepth: Depth, arg: TypeAddr, body: TypeAddr): TypeAddr {
        // const env: SubstEnv = new Map
        const env = null
        let result = subst.substTmTy(appDepth, varDepth, env, arg, body) as TypeAddr
        return result
    }

    let tiRules: TiRules = [
        // ["Compute", computeRule],
        // ["StructuralRef", structuralRefRule(tim, ty)],
        // TODO ? Do we want to use the structural rules here ?
        // TODO ? They can work faster when they work,
        // TODO ?   but they produce worse diagnostics 
        // TODO ?   as they do too much in one go.
        ["Structural", structuralRule],
        ["RelComp", relCompRule],
        ["rcRelCompA", rcRelCompARule],
        ["rcRelCompB", rcRelCompBRule],
        // ["rcAnyRelCompB", rcAnyRelCompBRule],
        ["rcRuleRule", rcRuleRuleRule],
        ["rcFunc", rcFuncRule],
        // ["rcFuncB", rcFuncBRule],
        ["rcFuncIntersectB", rcFuncIntersectBRule],
        ["rcFuncSuper", funcSuperRule],
        ["rcPairSuper", pairSuperRule],
        ["rcApplyARule", rcApplyARule],
        ["rcApplyA2Rule", rcApplyA2Rule],
        ["rcApplyApplyRule", rcApplyApplyRule],
        ["rcApplyIntersectyRule", rcApplyIntersectyRule],
        ["rcUnionA", rcUnionARule],
        ["rcUnionB", rcUnionBRule],
        ["rc_SingleA_UnionB_Rule", rc_SingleA_UnionB_Rule],
        // // ["rcUnionPairB", rcUnionB2Rule],
        // // ["rcUnionRelCompB", rcUnionRelCompBRule],
        ["rcIntersectA", rcIntersectARule],
        ["rcIntersectB", rcIntersectBRule],
        // // ["rcIntersectIntersect", rcIntersectIntersectRule],
        ["rcCodomainIntersectA", rcCodomainIntersectARule],
        // ["rcPairA", rcPairARule],
        // ["rcPairB", rcPairBRule],
        ["rcPairPair", rcPairPairRule],
        ["rcPairList", rcPairListRule],
        // // ["rcListPair", rcListPairRule],
        ["rcListList", rcListListRule],
        ["rcListRec", rcListRecRule],
        // // ["rcRecList", rcRecListRule],
        ["rcNilList", rcNilListRule],
        ["rcElemTailElem", rcElemTailElemRule],
        ["rcHeadElem", rcHeadElemRule],

        // // ["rcHeadPairA", rcHeadPairARule],
        // // ["rcTailPairA", rcTailPairARule],

        ["rcSubList", rcSubListRule],
        ["rcSubPair", rcSubPairRule],
        ["rcSubA", rcSubARule],
        ["rcSubSelfA", rcSubSelfARule],
        ["rcSubB", rcSubBRule],
        ["rcSuperA", rcSuperARule],
        ["rcSuperB", rcSuperBRule],

        ["rcRecA", rcRecARule],
        ["rcRecB", rcRecBRule],
        ["rcRecRec", rcRecRecRule],

        ["rcSelfA", rcSelfARule],
        ["rcSelfB", rcSelfBRule],
        ["rcPairSelf", rcPairSelfRule],
        ["rcSelfSelf", rcSelfSelfRule],

        // The rules concerned with Void/Any types,
        //   are used to get to types such as { A | (Hd [Any ,, B]) }
        //   which occur when checking an argument lies within a function's domain.
        // The result is either { A | Void } or { A | Any },
        //   or more simply A or Any,
        //   depending on the inhabitation of B.
        ["rcDomainB", rcDomainB],
        ["rcHeadA", rcHeadA],

        ["rcHeadA2", rcHeadA2],

        ["rcAnnotA", rcAnnotA],
        ["rcAnnotB", rcAnnotB],

        // ["rcTermType", rcTermType],
        // ["rcApplyInverseDomain", rcApplyInverseDomain],

        // // This rule seems to be finding contradictions in other rules
        // // TODO remove contradictions
        // // ["rcNegate", rcNegate],

        // // ["Intersect", intersectRule],
        // // ["inFunc", inFuncRule],
        // // ["inSubA", inSubARule],
        // // ["inSubB", inSubBRule],
        // // ["inSuperA", inSuperARule],
        // // ["inSuperB", inSuperBRule],
        // // ["inRecA", inRecARule],
        // // ["inRecB", inRecBRule],
        // // ["inUnionA", inUnionARule],
        // // ["inUnionB", inUnionBRule],
        // // ["inPairPair", inPairPairRule],

        ["Union", unionRule],
        ["Pair", pairRule],
        ["Sub", subRule],
        ["SubPairA", subPairARule],
        ["SubPairB", subPairBRule],
    ]

    return tiRules


    function equalType(a: Addr, b: Addr): boolean | null {
        return p.termEqual(a, b, false)
    }

    function structuralRule(ty0: TypeAddr): TiExpr {
        const result = tis.tiStructural(ty0)
        return tieConst(result)
    }

    // { A \ B }
    function relCompRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))

            if (isTyPrim("Error", a) || isTyPrim("Error", b)) {
                return tieFalse
            }
            if (isTyPrim("Void", a) || isTyPrim("Any", b)) {
                return tieFalse
            }
            if (equalType(a, b)) {
                return tieFalse
            }
            if (isTyPrim("Single", a) && isTyPrim("Str", b)) {
                return tieFalse
            }
            if (isTySingleStr(a) && isTyPrim("Str", b)) {
                return tieFalse
            }
            if (isTySingleStr(a) && isTyPrim("Char", b)) {
                return value_ty(a).length === 1 ? tieFalse : tieTrue
            }
            if (isTyPrim("Str", a) && isTySingleStr(b)) {
                return tieTrue
            }
            if (isTySingleStr(a) && isTySingleStr(b)) {
                return tieConst(value_ty(a) === value_ty(b) ? tiFalse : tiTrue)
            }
            if (isTyPrim("Str", a) && isTyPrim("Char", b)) {
                return tieTrue
            }
            if (isTyPrim("Char", a) && isTyPrim("Str", b)) {
                return tieFalse
            }
            if (isTyFun(a) && isTyFun(b)) {
                return tieUnknown
            }
            if (isTyPrim("Void", b)) {
                return tieRef(a)
            }
            if (isTyVar(a) && isTyVar(b)) {
                return tieConst(depthOf(a) === depthOf(b) ? tiFalse : tiUnknown)
            }
            const disjointTyOps = ["Int", "Bool", "Type", "Str", "Char", "Nil"] as const
            if (isTyPrimOneOf(disjointTyOps, a) && isTyPrimOneOf(disjointTyOps, b)) {
                return tieConst(name_ty(a) === name_ty(b) ? tiFalse : tiTrue)
            }
            // We can count SingleStr as disjoint from Str here, as it will be if we reach this far.
            const disjointTypes = (a: AddrQ) => isTySingleStr(a) || isTyFun(a) || isTyPrimOneOf(disjointTyOps, a)
            if (isTyFun(a) && disjointTypes(b)) {
                // { TyFun \ TyFun } has been handled earlier, 
                // A and B must be disjoint, so B removes nothing from A.
                //   The only remaining question is A itself inhabited.
                return tieRef(a)
            }
            if (disjointTypes(a) && disjointTypes(b)) {
                // { TySingleStr \ TySingleStr } and { TyFun \ TyFun } have been handled earlier, 
                // so whatever is left, A and B must be different. 
                return tieTrue
            }
            if (isTyPrim("Any", a) && disjointTypes(b)) {
                return tieTrue
            }
            if (isTyNil(a) && isTyPair(b)) {
                return tieTrue
            }
            if (isTyPair(a) && isTyNil(b)) {
                return tieRef(a)
            }
        }
        return tieUnknown
    }


    // { A \ {B \ C } }
    function rcRelCompBRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const bc = dOf(arg1_ty(ty))
            if (isTyOp("{\\}", bc)) {
                const b = arg0_ty(bc)
                const c = arg1_ty(bc)
                let ti1 = tieRef(tyRelComp(a, b, depth))
                let ty2 = tyIntersect(a, c, depth)
                let ti2 = tieRef(ty2)
                let ti = tieOr(ti1, ti2)
                return ti
            }
        }
        return tieUnknown
    }

    // { A \ { Any \ B1 \ ... \ Bn } } -> { A & { B1 | ... | Bn } }
    function rcAnyRelCompBRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = arg0_ty(ty)
            const b = arg1_ty(ty)
            let b1 = dOf(b)
            if (isTyOp("{\\}", b1)) {
                return tieUnknown
            }
            const bs: TypeAddr[] = []
            while (isTyOp("{\\}", b1)) {
                bs.push(dOf(arg1_ty(b1)))
                b1 = dOf(arg0_ty(b1))
            }
            if (isTyPrim("Any", b1)) {
                return tieUnknown
            }

            const bUn = bs.reduceRight((un, ty1) => tyUnion(ty1, un, depth), tyPrim0("Nil", depthZero))
            const aIn = tyIntersect(a, bUn, depth)

            return tieRef(aIn)
        }
        return tieUnknown
    }

    // { { A \ B } \ C } } --> { A \ { B | C } }
    function rcRelCompARule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const ab = dOf(arg0_ty(ty))
            const c = dOf(arg1_ty(ty))
            if (isTyOp("{\\}", ab)) {
                const a = arg0_ty(ab)
                const b = arg1_ty(ab)
                let ti1 = tieRef(tyRelComp(a, tyUnion(b, c, depth), depth))
                return ti1
            }
        }
        return tieUnknown
    }

    // { A & B }
    function intersectRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (equalType(a, b)) {
                return tieRef(a)
            }
            if (isTyPrim("Any", a)) {
                return tieRef(b)
            }
            if (isTyPrim("Any", b)) {
                return tieRef(a)
            }
            if (isTyPrim("Void", a) || isTyPrim("Void", b)) {
                return tieFalse
            }
            if (isTySingleStr(a) && isTyPrim("Str", b)) {
                return tieTrue
            }
            if (isTyPrim("Str", a) && isTySingleStr(b)) {
                return tieTrue
            }
            if (isTySingleStr(a) && isTySingleStr(b)) {
                return tieConst(value_ty(a) === value_ty(b) ? tiTrue : tiFalse)
            }
            if (isTyPrim("Str", a) && isTyPrim("Char", b)) {
                return tieTrue
            }
            if (isTyPrim("Char", a) && isTyPrim("Str", b)) {
                return tieTrue
            }
            if (isTyFun(a) && isTyFun(b)) {
                return tieUnknown
            }
            // we can count TSingle as disjoint here, as it will be if we reach this far
            const isDisjoint1 = isTyPrimOneOf2(["Int", "Bool", "Type", "Str", "Char", "Nil"])
            const isDisjoint2 = (a: AddrQ) => isTySingleStr(a) || isTyFun(a) || isDisjoint1(a)
            if (isDisjoint1(a) && isDisjoint1(b)) {
                return tieConst(name_ty(a) === name_ty(b) ? tiTrue : tiFalse)
            }
            if (isDisjoint2(a) && isDisjoint2(b)) {
                // { TySingleStr & TySingleStr } and { TyFun & TyFun } have been handled earlier, 
                // These types must be disjoint, so the intersection is void.
                return tieFalse
            }

        }
        return tieUnknown
    }

    // { { A0 | A1 } \ B }
    function rcUnionARule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{|}", a)) {
                const a0 = dOf(arg0_ty(a))
                const a1 = dOf(arg1_ty(a))
                return tieOrRefs(tyRelComp(a0, b, depth), tyRelComp(a1, b, depth))
            }
        }
        return tieUnknown
    }

    // { A \ { B0 | B1 } }
    function rcUnionBRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{|}", b)) {
                const b0 = dOf(arg0_ty(b))
                const b1 = dOf(arg1_ty(b))
                return tieAndUnknown(tyRelComp(a, b0, depth), tyRelComp(a, b1, depth))
            }
        }
        return tieUnknown
    }

    // This rule helps distinguish between possible errors and definite errors.
    // If possible errors are treated the same as definite errors, then this rule is not needed.
    // But the "typeCheckFail" test checks for definite errors.
    // { A.single \ { B0 | B1 } }
    function rc_SingleA_UnionB_Rule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTySingleStr(a) && isTyOp("{|}", b)) {
                const b0 = dOf(arg0_ty(b))
                const b1 = dOf(arg1_ty(b))
                return tieAndRefs(tyRelComp(a, b0, depth), tyRelComp(a, b1, depth))
            }
        }
        return tieUnknown
    }

    // We need a more general version of the above.
    // If A might be a union, then we need to and-in an unknown (as is done in rcUnionBRule).
    //   otherwise parts of A might be outside B0 and different parts of A might be outside B1,
    //   and yet all of A lies within { B0 | B1 }.
    function rc_NonUnionA_UnionB_Rule(ty0: TypeAddr): TiExpr {
        assert.todo()
    }


    // { A \ { B  | { C   \ D   } } } -> { { A | D   } \ { B  \ C   } }
    // { A \ { B0 | { B10 \ B11 } } } -> { { A | B11 } \ { B0 \ B10 } }
    function rcUnionRelCompBRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{|}", b)) {
                const b0 = dOf(arg0_ty(b))
                const b1 = dOf(arg1_ty(b))
                if (isTyOp("{\\}", b1)) {
                    const b10 = dOf(arg0_ty(b1))
                    const b11 = dOf(arg1_ty(b1))
                    return tieRef(tyRelComp(tyUnion(a, b1, depth), tyUnion(b0, b10, depth), depth))
                }
                if (isTyOp("{\\}", b0)) {
                    const b00 = dOf(arg0_ty(b0))
                    const b01 = dOf(arg1_ty(b0))
                    return tieRef(tyRelComp(tyUnion(a, b01, depth), tyUnion(b1, b00, depth), depth))
                }
            }
        }
        return tieUnknown
    }

    // { { A0 | A1 } & B }
    function inUnionARule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{|}", a)) {
                const a0 = dOf(arg0_ty(a))
                const a1 = dOf(arg1_ty(a))
                return tieOrRefs(tyIntersect(a0, b, depth), tyIntersect(a1, b, depth))
            }
        }
        return tieUnknown
    }

    // { A & { B0 | B1 } }
    function inUnionBRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{|}", b)) {
                const b0 = dOf(arg0_ty(b))
                const b1 = dOf(arg1_ty(b))
                return tieOrRefs(tyIntersect(a, b0, depth), tyIntersect(a, b1, depth))
            }
        }
        return tieUnknown
    }

    // { { A0 & A1 } \ B }
    function rcIntersectARule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{&}", a)) {
                const a0 = dOf(arg0_ty(a))
                const a1 = dOf(arg1_ty(a))
                return tieAndUnknown(tyRelComp(a0, b, depth), tyRelComp(a1, b, depth))
            }
        }
        return tieUnknown
    }

    // { A \ { B0 & B1 } }
    function rcIntersectBRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{&}", b)) {
                const b0 = dOf(arg0_ty(b))
                const b1 = dOf(arg1_ty(b))
                let t1 = tieRef(tyRelComp(a, b0, depth))
                let t2 = tieRef(tyRelComp(a, b1, depth))
                return tieOr(t1, t2)
            }
        }
        return tieUnknown
    }


    // { (Codomain { A0 & A1 }) \ B }
    function rcCodomainIntersectARule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Cod", a)) {
                const a0 = dOf(arg0_ty(a))
                if (isTyOp("{&}", a0)) {
                    const a00 = dOf(arg0_ty(a0))
                    const a01 = dOf(arg1_ty(a0))
                    return tieAndRefs(tyRelComp(tyCod(a00, depth), b, depth), tyRelComp(tyCod(a01, depth), b, depth))
                }
            }
        }
        return tieUnknown
    }


    // { [A0 ,, A1] \ B }
    function rcPairARule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPair(a)) {
                const aHd = dOf(hd_ty(a))
                const aTl = dOf(tl_ty(a))
                const b2 = tyOp2("{&}", b, tyPair(aHd, tyPrim0("Any", depthZero), depth), depth)
                const bHd = dOf(tyHead(b2, depth))
                const bTl = dOf(tyTail(b2, depth))
                let result = tieOrRefs(tyRelComp(aHd, bHd, depth), tyRelComp(aTl, bTl, depth))
                // Make sure A is itself inhabited.
                result = tieAnd(tieRef(a), result)
                return result
            }
        }
        return tieUnknown
    }

    // { A \ [B0 ,, B1] }
    function rcPairBRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPair(b) /* && tis.isPairType(a) */) {
                const aHd = dOf(tyHead(a, depth))
                const aTl = dOf(tyTail(a, depth))
                const bHd = dOf(hd_ty(b))
                const bTl = dOf(tl_ty(b))
                let result = tieOrRefs(tyRelComp(aHd, bHd, depth), tyRelComp(aTl, bTl, depth))
                result = tieOr(result, tieRef(tyOp2("{\\}", a, tyPairAnyAny, depth)))
                // Make sure A is itself inhabited.
                result = tieAnd(tieRef(a), result)
                return result
            }
        }
        return tieUnknown
    }


    // { [A0, ...A1] \ [B0, ...B1] }
    function rcPairPairRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPair(a) && isTyPair(b)) {
                const aHd = dOf(hd_ty(a))
                const aTl = dOf(tl_ty(a))
                const bHd = dOf(hd_ty(b))
                const bTl = dOf(tl_ty(b))
                return tieOrRefs(tyRelComp(aHd, bHd, depth), tyRelComp(aTl, bTl, depth))
            }
        }
        return tieUnknown
    }

    // { [A0 ,, A1] \ (List (Elem B)) }
    function rcPairListRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPair(a) && isTyPrim("List", b)) {
                const aHd = dOf(hd_ty(a))
                const aTl = dOf(tl_ty(a))
                const bElem = dOf(arg0_ty(b))
                return tieOrRefs(tyRelComp(aHd, bElem, depth), tyRelComp(aTl, b, depth))
            }
        }
        return tieUnknown
    }

    // { (List (Elem A)) \ [B0 ,, B1] }
    function rcListPairRule(ty0: TypeAddr): TiExpr {
        const ty = dOf(ty0)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("List", a) && isTyPair(b)) {
                return tieTrue
            }
        }
        return tieUnknown
    }

    // { A \ (List B.elem) }
    function rcListBRule(ty0: TypeAddrD): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("List", b)) {
                return tieRef(tyRelComp(tyPrim1("Elem", a, depthZero), arg0_ty(b), depth))
            }
        }
        return tieUnknown
    }

    // { (List A.elem) \ (List B.elem) }
    function rcListListRule(ty0: TypeAddrD): TiExpr {
        const ty = dOf(ty0)
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("List", a) && isTyPrim("List", b)) {
                return tieRef(tyRelComp(tyElem(a, depth), tyElem(b, depth), depth))
            }
        }
        return tieUnknown
    }

    function maxDepth2(a: Addr, b: Addr): Depth {
        return Math.max(depthOf(a), depthOf(b)) as Depth
    }


    // { (List A.elem) \ (Rec B.body) }
    function rcListRecRule(ty0: TypeAddrD): TiExpr {
        const ty = dOf(ty0)
        // const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if ((isTyPrim("List", a) || isTyPrim("Nil", a)) && isTyPrim("Fix", b)) {
                const depth = maxDepth2(a, b)
                const lamDepth = depth
                const varDepth = depthInc(lamDepth)
                const nilTy = tyPrim0("Nil", depthZero)
                const pairTy = tyPair(tyElem(a, depth), tyVar(depthInc(depth)), varDepth)
                const unionTy = tyOp2("{|}", nilTy, pairTy, varDepth)
                const pat = tmVar([], varDepth, typeType)
                let fixTy = tyPrim1("Fix", tmLam(false0, false0, pat, unionTy, lamDepth, typeType), lamDepth)
                return tieRef(tyRelComp(fixTy, b, lamDepth))
            }
        }
        return tieUnknown
    }

    // { [] \ (List (Elem B)) }
    function rcNilListRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Nil", a) && isTyPrim("List", b)) {
                return tieFalse
            }
        }
        return tieUnknown
    }

    // { (Elem (Tail A)) \ (Elem B) }
    function rcElemTailElemRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Elem", a) && isTyPrim("Elem", b)) {
                const a0 = dOf(arg0_ty(a))
                if (isTyPrim("Tl", a0)) {
                    const a00 = arg0_ty(a0)
                    const b0 = arg0_ty(b)
                    return tieAnd(tieRef(tyRelComp(a00, b0, depth)), tieUnknown)
                }
            }
        }
        return tieUnknown
    }

    // { (Head A) \ (Elem B) }
    function rcHeadElemRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Hd", a) && isTyPrim("Elem", b)) {
                const a0 = dOf(arg0_ty(a))
                const b0 = dOf(arg0_ty(b))
                return tieAnd(tieRef(tyRelComp(a0, b0, depth)), tieUnknown)
            }
        }
        return tieUnknown
    }

    // { { A.type <: List _ } \ (List (Elem B)) }
    function rcSubListRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{<:}", a) && isTyPrim("List", b)) {
                const aSub = dOf(arg0_ty(a))
                const aSuper = dOf(arg1_ty(a))
                if (isTyPrim("List", aSuper)) {
                    const aSubElem = tyPrim1("Elem", aSub, depth)
                    const aSuperElem = arg0_ty(aSuper)
                    const bElem = arg0_ty(b)
                    return tieRef(tyRelComp(tyOp2("{<:}", aSubElem, aSuperElem, depth), bElem, depth))
                }
            }
        }
        return tieUnknown
    }

    // { { A <: [_ ,, _] } \ B@[_ ,, _] }
    function rcSubPairRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{<:}", a) && isTyPair(b)) {
                const aSub = dOf(arg0_ty(a))
                const aSuper = dOf(arg1_ty(a))
                if (isTyPair(aSuper)) {
                    const aSuperHd = tyPrim1("Hd", a, depth)
                    const aSuperTl = tyPrim1("Tl", a, depth)
                    const bHd = tyPrim1("Hd", b, depth)
                    const bTl = tyPrim1("Tl", b, depth)
                    const h = tieRef(tyRelComp(tyOp2("{<:}", tyPrim1("Hd", aSub, depth), aSuperHd, depth), bHd, depth))
                    const t = tieRef(tyRelComp(tyOp2("{<:}", tyPrim1("Tl", aSub, depth), aSuperTl, depth), bTl, depth))
                    return tieOr(h, t)
                }
            }
        }
        return tieUnknown
    }

    // { [A.hd ,, A.tl] & [B.hd ,, B.tl] }
    function inPairPairRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPair(a) && isTyPair(b)) {
                return tieAndRefs(tyOp2("{&}", tyPrim1("Hd", a, depth), tyPrim1("Hd", b, depth), depth), tyOp2("{&}", tyPrim1("Tl", a, depth), tyPrim1("Tl", b, depth), depth))
            }
        }
        return tieUnknown
    }

    // { { A.type <: A.super } \ B }
    function rcSubARule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{<:}", a)) {
                const aSub = dOf(arg0_ty(a))
                const aSuper = dOf(arg1_ty(a))
                return tieAndImpRefs(tyRelComp(aSub, b, depth), tyRelComp(aSuper, b, depth))
            }
        }
        return tieUnknown
    }

    // { { A.type <: (Self { A -> A.super } } \ B }
    function rcSubSelfARule(ty: TypeAddrD): TiExpr {
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{<:}", a)) {
                const aSub = dOf(arg0_ty(a))
                const aSuper = dOf(arg1_ty(a))
                if (isTyPrim("Self", aSuper)) {
                    const aSuper0 = dOf(arg0_ty(aSuper))
                    if (isTmLam(aSuper0)) {
                        const aSuper0Body = body_tm(aSuper0)
                        assumeIsType(aSuper0Body)
                        const depth = depthOf(ty)
                        const depthVar = depthInc(depthOf(aSuper0))
                        const a2 = substTy(depth, depthVar, aSub, aSuper0Body)
                        assumeIsType(a2)
                        return tieRef(tyRelComp(a2, b, depth))
                    }
                }
            }
        }
        return tieUnknown
    }

    // { A \ { B.type <: B.super } }
    function rcSubBRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{<:}", b)) {
                const bSub = dOf(arg0_ty(b))
                const bSuper = dOf(arg1_ty(b))
                return tieOrImpRefs(tyRelComp(a, bSuper, depth), tyRelComp(a, bSub, depth))
            }
        }
        return tieUnknown
    }

    // { { A.type :> A.sub } \ B }
    function rcSuperARule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{:>}", a)) {
                //    not TI{A.type \ B} implies not TI{A.sub  \ B}
                // so     TI{A.sub  \ B} implies     TI{A.type \ B}
                const aSuper = dOf(arg0_ty(a))
                const aSub = dOf(arg1_ty(a))
                return tieOrImpRefs(tyRelComp(aSub, b, depth), tyRelComp(aSuper, b, depth))
            }
        }
        return tieUnknown
    }

    // { A \ { B.type :> B.sub } }
    function rcSuperBRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{:>}", b)) {
                const bSuper = dOf(arg0_ty(b))
                const bSub = dOf(arg1_ty(b))
                return tieAndImpRefs(tyRelComp(a, bSuper, depth), tyRelComp(a, bSub, depth))
            }
        }
        return tieUnknown
    }

    // { { a.type <: a.super } & b }
    function inSubARule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{<:}", a)) {
                const aSub = dOf(arg0_ty(a))
                const aSuper = dOf(arg1_ty(a))
                return tieAndImpRefs(tyIntersect(aSub, b, depth), tyIntersect(aSuper, b, depth))
            }
        }
        return tieUnknown
    }

    // { a & { b.type <: b.super } }
    function inSubBRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{<:}", b)) {
                const bSub = dOf(arg0_ty(b))
                const bSuper = dOf(arg1_ty(b))
                return tieAndImpRefs(tyIntersect(a, bSub, depth), tyIntersect(a, bSuper, depth))
            }
        }
        return tieUnknown
    }

    // { { a.type :> a.sub } & b }
    function inSuperARule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{:>}", a)) {
                const aSuper = dOf(arg0_ty(a))
                const aSub = dOf(arg1_ty(a))
                return tieOrImpRefs(tyIntersect(aSub, b, depth), tyIntersect(aSuper, b, depth))
            }
        }
        return tieUnknown
    }

    // { a & { b.type :> b.sub } }
    function inSuperBRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{:>}", b)) {
                const bSuper = dOf(arg0_ty(b))
                const bSub = dOf(arg1_ty(b))
                return tieOrImpRefs(tyIntersect(a, bSub, depth), tyIntersect(a, bSuper, depth))
            }
        }
        return tieUnknown
    }


    // { { A @-> A.body } \ B }
    function rcRecARule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Fix", a)) {
                const a0 = dOf(arg0_ty(a))
                if (isTmLam(a0)) {
                    const a0Body = body_tm(a0)
                    assumeIsType(a0Body)
                    // const depth = depthOf(a)
                    const unrolled = tmApply(a0, a, depth)
                    assumeIsType(unrolled)
                    return tieRef(tyRelComp(unrolled, b, depth))
                }
            }
        }
        return tieUnknown
    }

    // { A \ { B @-> B.body } }
    function rcRecBRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Fix", b)) {
                const b0 = dOf(arg0_ty(b))
                if (isTmLam(b0)) {
                    const b0Body = body_tm(b0)
                    assumeIsType(b0Body)
                    // const depth = depthOf(b)
                    const unrolled = tmApply(b0, b, depth)
                    assumeIsType(unrolled)
                    return tieRef(tyRelComp(a, unrolled, depth))
                }
            }
        }
        return tieUnknown
    }

    // { { A @-> A.body } \ { B @-> B.body } }
    function rcRecRecRule(ty: TypeAddrD): TiExpr {
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Fix", a) && isTyPrim("Fix", b)) {
                const a0 = dOf(arg0_ty(a))
                const b0 = dOf(arg0_ty(b))
                if (isTmLam(a0) && isTmLam(b0)) {
                    const depth = depthOf(ty)
                    const depth1 = depthInc(depth)
                    const varTyNew = tyVar(depth1)

                    // We could perform these applications under a TyFun, 
                    //   this would ensure the varTyNew has a binder.
                    // But we don't really need to do that, 
                    //   the new var and application can exist at a deeper depth untethered.
                    const aApply = tmApply(a0, varTyNew, depth1)
                    const bApply = tmApply(b0, varTyNew, depth1)

                    assumeIsType(aApply)
                    assumeIsType(bApply)
                    return tieRef(tyRelComp(aApply, bApply, depth1))
                }
            }
        }
        return tieUnknown
    }

    function unrollRecursiveType(ty: Addr_of_TyCon): TypeAddr {
        assert.isTrue(isTyPrim("Fix", ty))
        const lam = dOf(arg0_ty(ty))
        assert.isTrue(isTmLam(lam))
        const depth = depthOf(ty)
        const depthVar = depthInc(depthOf(lam))
        const depthShift = depth - depthVar
        const body = dOf(body_tm(lam))
        assumeIsType(body)
        const unrolled = tmApply(lam, ty, depth)
        assumeIsType(unrolled)
        return unrolled
    }

    function tryUnrollRecursiveType(ty: Addr_of_TyPrim1): TypeAddrMb {
        if (!(isTyPrim("Fix", ty))) return addrNo
        const lam = dOf(arg0_ty(ty))
        if (!(isTmLam(lam))) return addrNo
        const depth = depthOf(ty)
        const depthVar = depthInc(depthOf(lam))
        const depthShift = depth - depthVar
        const body = dOf(body_tm(lam))
        assumeIsType(body)
        const unrolled = tmApply(lam, ty, depth)
        assumeIsType(unrolled)
        return unrolled
    }

    // { { A @-> A.body } & B }
    function inRecARule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Fix", a)) {
                const unrolledA = tryUnrollRecursiveType(a)
                if (isAddrYes(unrolledA)) {
                    return tieRef(tyIntersect(unrolledA, b, depth))
                }
            }
        }
        return tieUnknown
    }

    // { A & { B @-> B.body } }
    function inRecBRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Fix", b)) {
                const unrolledB = tryUnrollRecursiveType(b)
                if (isAddrYes(unrolledB)) {
                    return tieRef(tyIntersect(a, unrolledB, depth))
                }
            }
        }
        return tieUnknown
    }

    // { { A.dom -> A.cod } \ { B.dom -> B.cod } }
    function rcFuncRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyFun(a) && isTyFun(b)) {

                const aDepth = depthOf(a)
                const bDepth = depthOf(b)
                const aVarDepth = depthInc(aDepth)
                const bVarDepth = depthInc(bDepth)
                const varDepth = depthInc(depth)

                // We use tyPrim1("Dom", ..) here instead of h.dom_tm(...) 
                //   so as to ensure implicitly self-dependent domains get handled correctly.
                const domA = tyPrim1("Dom", a, aDepth)
                const domB = tyPrim1("Dom", b, bDepth)
                const domRc = tyRelComp(domB, domA, depth)

                const polyDomA = tySub(tyVar(aVarDepth), domA, aVarDepth)
                const polyDomB = tySub(tyVar(bVarDepth), domB, bVarDepth)

                // TODO Handle dependently-typed functions too.
                // TODO Specifically of the form:
                // TODO   { { State : Type } -> ...State... } 
                // TODO This a user this is a manual way to write SystemF style types,
                // TODO   but to Ferrum, it's a type that depends on a term, 
                // TODO   which, in this case, happens to be of type Type.

                const aCod = dOf(cod_ty(a))
                const aSubstEnv: SubstEnv = new Map
                aSubstEnv.set(h.pathKey_root, tmVar([], varDepth, polyDomB))
                const bCod = dOf(cod_ty(b))
                const bSubstEnv: SubstEnv = new Map
                bSubstEnv.set(h.pathKey_root, tmVar([], varDepth, polyDomB))
                const appA = subst.substTmTy(varDepth, aVarDepth, aSubstEnv, polyDomB, aCod) as TypeAddr
                const appB = subst.substTmTy(varDepth, bVarDepth, bSubstEnv, polyDomB, bCod) as TypeAddr

                const appRc = tyRelComp(appA, appB, varDepth)
                return tieOrRefs(domRc, appRc)
            }
        }
        return tieUnknown
    }

    function applyTypes(fun: TypeAddr, argTy: TypeAddr): TypeAddr {
        return tyApply(fun, argTy)
    }

    // { A \ { B.dom -> B.rng } }
    function rcFuncBRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty)) as Addr_of_TyFun
            const b = dOf(arg1_ty(ty))
            if (isTyFun(a) && isTyFun(b)) {
                const domA = dOf(dom_ty(a))
                const domB = dOf(dom_ty(b))
                const codB = dOf(cod_ty(b))
                let domRc = tyRelComp(domB, domA, depth)
                let app = applyTypes(a, domB)
                let codRc = tyRelComp(app, codB, depth)
                return tieOrRefs(domRc, codRc)
            }
        }
        return tieUnknown
    }

    // { A \ { { B0.dom -> B0.cod } & { B1.dom -> B1.cod }} }
    function rcFuncIntersectBRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyOp("{&}", b)) {
                // TODO Probably need to be sure that B0.dom and B1.dom are disjoint for this to be valid.
                const b0 = dOf(arg0_ty(b))
                const b1 = dOf(arg1_ty(b))
                let t1 = tyRelComp(a, b0, depth)
                let t2 = tyRelComp(a, b1, depth)
                return tieOrRefs(t1, t2)
            }
        }
        return tieUnknown
    }

    // { { A.dom -> A.rng } & { B.dom -> B.rng } }
    function inFuncRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{&}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyFun(a) && isTyFun(b)) {
                const domA = dOf(dom_ty(a))
                const domB = dOf(dom_ty(b))
                const codA = dOf(cod_ty(a))
                const codB = dOf(cod_ty(b))
                let appA = applyTypes(a, domA)
                let appB = applyTypes(b, domB)
                let codRcAB = tyRelComp(appA, codB, depth)
                let codRcBA = tyRelComp(appB, codA, depth)
                return tieOrRefs(codRcAB, codRcBA)
            }
        }
        return tieUnknown
    }


    // { { A.dom -> A.cod } \ { B.type :> B.sub } }
    function funcSuperRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty)) as Addr_of_TyFun
            // TODO Should probably check that B.sub is a function type.
            if (isTyFun(a) && isTyOp("{:>}", b)) {
                // This check is needed to when type-checking CPS-style code
                // TODO handle polymorphic case, not critical for now

                // TODO This rule is only correct is the A and B functions are at the same depth.
                // TODO Otherwise, we need to bring them to the same depth with a substitution of a new common variable,
                // TODO   but this is still TODO.

                const varDepth = depthInc(depth)
                const domA = dOf(dom_ty(a))
                const domB = dOf(dom_ty(b))
                const codA = dOf(cod_ty(a))
                const codB = dOf(cod_ty(b))
                let domRc = tyRelComp(domB, domA, varDepth)
                let codRc = tyRelComp(codA, codB, varDepth)
                return tieOrRefs(domRc, codRc)
            }
        }
        return tieUnknown
    }

    // { [A.hd, ...A.tl] } \ { B.type :> [B.sub.hd, ...B.sub.tl] } }
    function pairSuperRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPair(a) && isTyOp("{:>}", b)) {
                const bSuper = dOf(arg0_ty(b))
                const bSub = dOf(arg1_ty(b))

                if (isTyPair(bSub)) {
                    // TODO We shouldn't just assume the B type is inhabted.
                    const aHd = dOf(hd_ty(a))
                    const aTl = dOf(tl_ty(a))
                    let hdRc = tyRelComp(aHd, tyHead(b, depth), depth)
                    let tlRc = tyRelComp(aTl, tyTail(b, depth), depth)
                    return tieOrRefs(hdRc, tlRc)
                }
            }
        }
        return tieUnknown
    }

    // { { A.func A.arg } \ B }
    function rcApplyARule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyApply(a)) {
                const aFun = dOf(fun_ty(a))
                const aArg = dOf(arg_ty(a))
                return tieRef(tyRelComp(applyTypes(aFun, aArg), b, depth))
            }
        }
        return tieUnknown
    }

    // { { A.func A.arg } \ B }
    function rcApplyA2Rule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyApply(a)) {
                const aFun = dOf(fun_ty(a))
                const aArg = dOf(arg_ty(a))
                const aFunCod = tyPrim1("Cod", aFun, depth)
                return tieRef(tyRelComp(aFunCod, b, depth))
            }
        }
        return tieUnknown
    }

    // Type-appication is always covariant, and never contravariant.
    // Type-application applies all possible term-values within a type.
    // Using a subset of those values could never produce a value that wasn't already in the originally produced larger set. 
    // So even if some/all of the function term-values in the type are contravariant,
    //   type-application behaves in a covariant way.

    // { { A.func A.arg } \ { B.func B.arg } }
    function rcApplyApplyRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyApply(a) && isTyApply(b)) {
                const aFun = dOf(fun_ty(a))
                const aArg = dOf(arg_ty(a))
                const bFun = dOf(fun_ty(b))
                const bArg = dOf(arg_ty(b))
                const funcTie = tieRef(tyRelComp(aFun, bFun, depth))
                const argTie = tieRef(tyRelComp(aArg, bArg, depth))
                const applyTie = tieAnd(tieOr(funcTie, argTie), tieUnknown)
                return applyTie
            }
        }
        return tieUnknown
    }

    // { A \ { B.func.0 & B.func.1 } B.arg } ->
    // { A \ { (Hd (Tl {[B.func.0.dom & B.arg, B.func.0.cod]})) }))  | (Hd (Tl {[B.func.1.dom & B.arg, B.func.1.cod]})) })) } }
    function rcApplyIntersectyRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyApply(b)) {
                const bFun = dOf(fun_ty(b))
                const bArg = dOf(arg_ty(b))
                if (isTyOp("{&}", bFun)) {
                    const b0 = dOf(arg0_ty(bFun))
                    const b1 = dOf(arg1_ty(bFun))
                    if (isTyFun(b0) && isTyFun(b1)) {
                        const b0Dom = dom_ty(b0)
                        const b0Cod = cod_ty(b0)
                        const b1Dom = dom_ty(b1)
                        const b1Cod = cod_ty(b1)
                        const bArg = arg_ty(b)

                        // TODO Don't assume the A and B functions are at the same depth,
                        // TODO   bring them to the same depth with the substitution of a common variable.
                        const varDepth = depthInc(depth)

                        // let ti1 = tlT(pairT(intersectT(dom1, arg), cod1))
                        // let ti2 = tlT(pairT(intersectT(dom2, arg), cod2))

                        // NOTE The ti1/ti2 types above are more minimal and natural
                        // NOTE    they are defined the way below so as to match what is needed in the fe4d/dispatch1 test
                        // TODO Make the type-check less sensitive to the particular form
                        // TODO In practice, we might not need this rule at all, 
                        // TODO   depending on how well other approaches work-out

                        const ti1 = tyHead(tyTail(tyPair(tyIntersect(b0Dom, bArg, varDepth), tyPair(b0Cod, tyPrim0("Nil", depthZero), varDepth), varDepth), varDepth), varDepth)
                        const ti2 = tyHead(tyTail(tyPair(tyIntersect(b1Dom, bArg, varDepth), tyPair(b1Cod, tyPrim0("Nil", depthZero), varDepth), varDepth), varDepth), varDepth)
                        const rc = tyRelComp(a, tyUnion(ti1, ti2, varDepth), varDepth)

                        return tieRef(rc)
                    }
                }
            }
        }
        return tieUnknown
    }

    function rcRuleRuleRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))

            // covariant type-operators
            if (isTyPrim("Hd", a) && isTyPrim("Hd", b) || isTyPrim("Tl", a) && isTyPrim("Tl", b) || isTyPrim("Cod", a) && isTyPrim("Cod", b)) {
                const a0 = dOf(arg0_ty(a))
                const b0 = dOf(arg0_ty(b))
                return tieRef(tyRelComp(a0, b0, depth))
            }

            // covariant type-constructors
            if (isTyPrim("Elem", a) && isTyPrim("Elem", b)) {
                const a0 = dOf(arg0_ty(a))
                const b0 = dOf(arg0_ty(b))
                return tieRef(tyRelComp(a0, b0, depth))
            }

            // contravariant type-operators
            if (isTyPrim("Dom", a) && isTyPrim("Dom", b)) {
                const a0 = dOf(arg0_ty(a))
                const b0 = dOf(arg0_ty(b))
                return tieRef(tyRelComp(b0, a0, depth))
            }
        }
        return tieUnknown
    }


    // { { A.. @-> A.type } \ B }
    function rcSelfARule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Self", a)) {
                const a0 = dOf(arg0_ty(a))
                if (isTmLam(a0)) {
                    const a0pat = pat_tm(a0)
                    const a0body = body_tm(a0)
                    assumeIsType(a0body)
                    const depthVar = depthInc(depthOf(a0))
                    const env: SubstEnv = new Map
                    env.set(h.pathKey_root, tyPrim0("Any", depthZero))
                    let a1 = subst.substTmTy(depthOf(a), depthVar, env, addrTypeType, a0body) as TypeAddr

                    return tieRef(tyRelComp(a1, b, depth))
                }
            }
        }
        return tieUnknown
    }

    // { A \ { B.. @-> B.type } }
    function rcSelfBRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Self", b)) {
                const b0 = dOf(arg0_ty(b))
                if (isTmLam(b0)) {
                    const depth = depthOf(ty)
                    const depth1 = depthInc(depth)
                    const depthVar = depthInc(depthOf(b0))
                    const b0body = body_tm(b0)
                    assumeIsType(b0body)
                    const subAB = tyOp2("{<:}", a, b, depth1)
                    // This self-var is "untethered".
                    // We could place a binding TmLam above it, but we don't need to.
                    const subAbTm = tmVar([], depth1, subAB)
                    const env: SubstEnv = new Map
                    env.set(h.pathKey_root, subAbTm)
                    const bSubst = subst.substTmTy(depth1, depthVar, env, subAB, b0body)

                    // This use of tmApply should work, but it results in "bSubst" being at a deeper depth.
                    // This "rcFunc" rule doesn't currently seem to spot that functions that differ only in depth are in fact the same.
                    // const bSubst = tmApply(b0, subAbTm, depth1)
                    assumeIsType(bSubst)

                    return tieRef(tyRelComp(a, bSubst, depth1))

                    // The {<:} above is dangerous, it can create TI contradictions.
                    // In practice this only seems to occur when there are other errors in the program anyway.
                    // Perhaps we need to allow TI contradictions to propagate and not abort as soon as they are encountered.
                    // The TI contradiction detector is currently the best defense against buggy TI-rules.
                    // If contradictions are allowed to propagate, 
                    //   it becomes harder to determine if a bug is caused by the source-code being type-checked or a TI-rule.
                    // Perhaps it makes sense to mark where/when TI contradiction might be expected,
                    //   that is, any types which are directly or indirectly influenced by the 
                    //   construction of the {<:} above.
                }
            }
        }
        return tieUnknown
    }

    // { [A_hd ,, A_tl] \ (Self (B_tyVar -> B_type) } }
    function rcPairSelfRule(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPair(a) && isTyPrim("Self", b)) {
                const aHd = dOf(hd_ty(a))
                const aTl = dOf(hd_ty(a))
                const b0 = dOf(arg0_ty(b))
                if (isTySingleStr(aHd) && isTmLam(b0)) {
                    // TODO Make sure we only proceed if the b0 TmLam only uses type-variables, not term-variables.
                    // TODO   (or provide something at the term-level so as to use tmApply below).
                    // let hdTi = tyRelComp(a.hd, typeHd(b))
                    const hdVal = value_ty(aHd)
                    const b0body = body_tm(b0)
                    assumeIsType(b0body)
                    const depth = depthOf(b0)
                    const depthVar = depthInc(depthOf(b0))
                    const b2 = substTy(depth, depthVar, tyPair(aHd, tyPrim0("Any", depthZero), depth), b0body)
                    // We can only use tmApply here if we have something to use at the term-level.
                    // const b2 = tmApply(b0, tyPair(aHd, tyOp0("Any")), depth)
                    assumeIsType(b2)
                    return tieRef(tyRelComp(a, b2, depthVar))
                }
            }
        }
        return tieUnknown
    }

    // { { A.. @-> A.type } \ { B.. @-> B.type } }
    // { (Self (A.pat -> A.body)) \ (Self (B.pat -> B.body)) }
    function rcSelfSelfRule(ty: TypeAddrD): TiExpr {
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Self", a) && isTyPrim("Self", b)) {
                const a0 = dOf(arg0_ty(a))
                const b0 = dOf(arg0_ty(b))
                if (isTmLam(a0) && isTmLam(b0)) {
                    const depth = depthOf(ty)
                    const depth1 = depthInc(depth)
                    const newVarTy = tyVar(depth1)
                    const newVarTm = tmVar([], depth1, newVarTy)
                    const a0body = body_tm(a0)
                    const b0body = body_tm(b0)
                    assumeIsType(a0body)
                    assumeIsType(b0body)

                    const unrolledA = tmApply(a0, newVarTm, depth1)
                    const unrolledB = tmApply(b0, newVarTm, depth1)

                    assumeIsType(unrolledA)
                    assumeIsType(unrolledB)
                    return tieRef(tyRelComp(unrolledA, unrolledB, depth1))
                }
            }
        }
        return tieUnknown
    }


    // if B is uninhabited, then (Dom B) is Any and the whole relcomp is uninhabited
    // { A \ (Dom B) }
    function rcDomainB(ty: TypeAddrD): TiExpr {
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Dom", b)) {
                const b0 = arg0_ty(b)
                let ti1 = tieAnd(tieUnknown, tieRef(b0))
                return ti1
            }
        }
        return tieUnknown
    }

    // { (Hd A) \ B }
    function rcHeadA(ty: TypeAddrD): TiExpr {
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Hd", a)) {
                const a0 = arg0_ty(a)
                let ti1 = tieAnd(tieUnknown, tieRef(a0))
                return ti1
            }
        }
        return tieUnknown
    }

    // { (Hd A) \ B } --> { A \ (B::Any) }
    function rcHeadA2(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPrim("Hd", a)) {
                const a0 = arg0_ty(a)
                let ti1 = tieRef(tyRelComp(a0, tyPair(b, tyPrim0("Any", depthZero), depth), depth))
                return ti1
            }
        }
        return tieUnknown
    }

    // { (a: A) \ B } --> { a \ B }
    function rcAnnotA(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (h.isTmTyAnnot(a)) {
                const a0 = h.term_tm(a)
                assumeIsType(a0)
                let ti1 = tieRef(tyRelComp(a0, b, depth))
                return ti1
            }
        }
        return tieUnknown
    }

    // { A \ (b : B) } --> { A \ b }
    function rcAnnotB(ty: TypeAddrD): TiExpr {
        const depth = depthOf(ty)
        if (isTyOp("{\\}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (h.isTmTyAnnot(b)) {
                const b0 = h.term_tm(b)
                assumeIsType(b0)
                let ti1 = tieRef(tyRelComp(a, b0, depth))
                return ti1
            }
        }
        return tieUnknown
    }

    // // TODO ? Add a term-annotation type-node to the heap.
    // // { {A:Type} \ Type }
    // function rcTermType(ty: TypeAddrD): TiExpr {
    //     if (isTyOp("\\", ty)) {
    //         const a = dOf(arg0_ty(ty))
    //         const b = dOf(arg1_ty(ty))
    //         if (a.tag === "TTerm" && b.tag === "TType") {
    //             return tieFalse
    //         }
    //         if (a.tag === "TTermVar" && b.tag === "TType") {
    //             return tieFalse
    //         }
    //     }
    //     return tieUnknown
    // }

    // { A | B }
    function unionRule(tyAddr: TypeAddr): TiExpr {
        const ty = dOf(tyAddr)
        if (isTyOp("{|}", ty)) {
            const ty0 = dOf(arg0_ty(ty))
            const ty1 = dOf(arg1_ty(ty))
            return tieOrRefs(ty0, ty1)
        }
        return tieUnknown
    }

    // { [ A ,, B ] }
    function pairRule(tyAddr: TypeAddr): TiExpr {
        const ty = dOf(tyAddr)
        if (isTyPair(ty)) {
            const ty0 = dOf(hd_ty(ty))
            const ty1 = dOf(tl_ty(ty))
            return tieAndRefs(ty0, ty1)
        }
        return tieUnknown
    }

    // { A <: B }
    function subRule(tyAddr: TypeAddr): TiExpr {
        const ty = dOf(tyAddr)
        if (isTyOp("{<:}", ty)) {
            const sub = dOf(arg0_ty(ty))
            const sup = dOf(arg1_ty(ty))
            return tieAndImpRefs(sub, sup)
        }
        return tieUnknown
    }

    // { A <: [B0 ,, B1] }
    function subPairBRule(tyAddr: TypeAddr): TiExpr {
        const ty = dOf(tyAddr)
        const depth = depthOf(ty)
        if (isTyOp("{<:}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPair(b)) {
                const aHd = tyPrim1("Hd", a, depth)
                const aTl = tyPrim1("Tl", a, depth)
                const bHd = dOf(hd_ty(b))
                const bTl = dOf(tl_ty(b))
                const rHd = tyOp2("{<:}", aHd, bHd, depth)
                const rTl = tyOp2("{<:}", aTl, bTl, depth)
                return tieAndRefs(rHd, rTl)
            }
        }
        return tieUnknown
    }

    // { [A0 ,, A1] <: B }
    function subPairARule(tyAddr: TypeAddr): TiExpr {
        const ty = dOf(tyAddr)
        const depth = depthOf(ty)
        if (isTyOp("{<:}", ty)) {
            const a = dOf(arg0_ty(ty))
            const b = dOf(arg1_ty(ty))
            if (isTyPair(a)) {
                const aHd = dOf(hd_ty(a))
                const aTl = dOf(tl_ty(a))
                const bHd = tyPrim1("Hd", b, depth)
                const bTl = tyPrim1("Tl", b, depth)
                const rHd = tyOp2("{<:}", aHd, bHd, depth)
                const rTl = tyOp2("{<:}", aTl, bTl, depth)
                return tieAndRefs(rHd, rTl)
            }
        }
        return tieUnknown
    }



}










































































































