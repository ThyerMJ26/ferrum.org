import { unit } from "../utils/unit.js";
import { assert } from "../utils/assert.js";
import { mkEnv } from "../utils/env.js";

import {
    Addr, Depth, TypeAddr, TyPrim0, Heap,
    depthInc, false0, depthZero, DirectAddr,
    isAddrNo, addrNo, AddrQ, Visitor, isAddrYes, VisitorWithDefaults,
    Addr_of_TmLambda, depthMax2, depthMax, NodeWalker,
    WorS,
    weak,
    strong,
    TyOp2_Concrete,
    assumeIsDirect,
    formStrong,
    TargetForm, assumeIsType,
    GraphEnvRo,
    GraphEnvRw,
    AddrReserved,
} from "../graph/graph-heap2.js";
import { DeclTypeGraph, ExprTypeGraph, Instantiate } from "../graph/graph-instantiate.js"
import { readbackData } from "../graph/graph-readback.js";
import { prettyFerrum } from "../syntax/pretty-ferrum.js";
import { showGraph } from "../graph/graph-show.js";
import { TiStructuralFuncs } from "./graph-ti-structural.js";
import { tiIsFalse, tiIsTrue } from "../graph/graph-ti.js";
import { nilLoc } from "../syntax/token.js";
import { SubstEnv, Substitute } from "./graph-substitute.js";
import { GraphPredicates } from "../graph/graph-predicates.js";
import { GraphApply } from "./graph-apply.js";
import { isAlpha, scan2Fe } from "../syntax/scan.js";
import { ParseState } from "../syntax/parse.js";
import { parseTerm, parseType } from "../syntax/parseFerrum2.js";
import { mkGraphBuilder } from "./graph-builder.js";


// TODO ? Actions which drop references (beneath lambdas) need someway to record these as obligations.
// TODO ?   The expression (x -> hd [3, f x]) (which may only come into existence dynamically)
// TODO ?   cannot just reduce to (x -> 3) 
// TODO ?   but it can reduce to (x -> let _ = f x; 3)
// TODO ? Handling this correctly during reduction is noisy, tedious, distracting and error-prone.
// TODO ? For now the issue is ignored here.
// TODO ? There is however enough info in the overwritten nodes to recover any dropped obligations during read-back.
// TODO ? The issue is also currently being ignored by the read-back code.
// TODO ? This would be a big no-no for a semantics-preserving heuristics-based optimization.
// TODO ? However, there are no heuristics here, the specializer does what it is told, nothing more, nothing less.
// TODO ? So perhaps it is okay to silently drop potentially non-terminating computations at specialization-time ?
// TODO ? Termination is the user's responsibility.




// type ArBlocked = null  // Node cannot be reduced, but try again after further substitutions.
// type ArFail = false    // Node cannot be reduced and never will (a term-level error, presumably a type-check failed somewhere).
// type ArMark = true     // Node is already in reduced form, the caller just needs to mark it as such (can only happen at the type-level, { Int | Str }).

// TODO ? A more compact for of ActionResult: 
// type ArBlocked = -3 & AddrReserved
// type ArFail = -4 & AddrReserved
// type ArMark = -5 & AddrReserved

const arBlocked = null
const arFail = false
const arMark = true

// TODO ? A more compact for of ActionResult: 
// const arBlocked /**/: -3 & AddrReserved = -3
// const arFail    /**/: -4 & AddrReserved = -4
// const arMark    /**/: -5 & AddrReserved = -5


type ArUpdate  /**/ = Addr             // Node reduced to this.
type ArBlocked /**/ = typeof arBlocked // Node cannot be reduced, but try again after further substitutions.
type ArFail    /**/ = typeof arFail    // Node cannot be reduced and never will (a term-level error, presumably a type-check failed somewhere).
type ArMark    /**/ = typeof arMark    // Node is already in reduced form, the caller just needs to mark it as such (can only happen at the type-level, { Int | Str }).


export type ActionResult = ArUpdate | ArBlocked | ArFail | ArMark


export function isArUpdate(ar: ActionResult): ar is Addr {
    return typeof ar === "number"
}

// TODO ? Rather than pass in depth and form separately,
// TODO ?   pass in an instance of the new GraphBuilder interface ?
type Action = (depth: Depth, args: Addr[], targetForm: TargetForm) => ActionResult

type TypeAction = Action

export type Builtin = {
    name: string, // The name used in the concrete syntax and AST (such as: +, &, Fix)
    nameG: string, // The name used in the Graph (such as: (+), {&}, Fix)
    arity: number,
    paramStrengths: WorS[],
    term?: Addr,
    type: TypeAddr,
    action: Action,
}

export type Builtins = Map<string, Builtin>

type Datum = null | boolean | number | string

export interface Primitives {
    readonly builtinTmOps: Map<string, Builtin>
    readonly builtinTyOps: Map<string, Builtin>
    decls: DeclTypeGraph[]
    get(nameG: string): Builtin | null
    getByAddr(addr: Addr): Builtin | null
    init(h: Heap, subst: Substitute, inst: Instantiate, predicates: GraphPredicates, tis: TiStructuralFuncs, ga: GraphApply): unit
    env(): GraphEnvRo
}

export type InitPrims = (h: Heap, inst: Instantiate, env: GraphEnvRw) => unit
export function mkPrims(): Primitives {

    const builtinsG: Map<string, Builtin> = new Map
    const builtinsByAddr: Map<Addr, Builtin> = new Map
    const builtinTmOps: Map<string, Builtin> = new Map
    const builtinTyOps: Map<string, Builtin> = new Map
    const decls: DeclTypeGraph[] = []
    let primEnv: GraphEnvRo | null = null


    function get(nameG: string): Builtin | null {
        if (builtinsG.has(nameG)) {
            const builtin = builtinsG.get(nameG)!
            return builtin
        }
        return null
    }

    function getByAddr(addr: Addr): Builtin | null {
        const builtin = builtinsByAddr.get(addr)
        return builtin ?? null
    }

    function env(): GraphEnvRo {
        assert.isTrue(primEnv !== null)
        return primEnv
    }

    const primitives: Primitives = {
        builtinTmOps,
        builtinTyOps,
        decls,
        // getTmOp,
        // getTyOp,
        get,
        getByAddr,
        init,
        env,
    }

    function init(h: Heap, subst: Substitute, inst: Instantiate, predicates: GraphPredicates, tis: TiStructuralFuncs, ga: GraphApply): unit {

        const env: GraphEnvRw = mkEnv()

        const {
            tyOp1, tyOp2, isTyOp, arg0_ty, arg1_ty,
            tyPrim0, tyPrim1, tyPrim2, tyPrim3, isTyPrim,
            isPrim,
            tmOp1, tmOp2, isTmOp, arg0_tm, arg1_tm,
            tyPair, isTyPair, hd_ty, tl_ty,
            tyFun, isTyFun, no_ty, yes_ty, dom_ty, cod_ty,
            isTySingleStr, value_ty,
            tmLam, isTmLam, pat_tm, body_tm,
        } = h


        const typeType = h.tyPrim0("Type", depthZero)

        let defPrimitiveType = (name: TyPrim0): TypeAddr => {
            const type = h.tyPrim0(name, depthZero)
            env.set(name, type)
            return type
        }

        let defType = (name: string, defn: string): TypeAddr => {
            let expTokens = scan2Fe("", defn, null, [])
            let expPS = new ParseState(expTokens)
            let parseExpr = parseType(expPS, "ferrum/0.1")
            const performTypeCheck = true
            let type = inst.instType(primitives, env, depthZero, parseExpr, typeType, performTypeCheck)
            return type
        }

        let parseTy = (typeStr: string): TypeAddr => {
            let expTokens = scan2Fe("", typeStr, null, [])
            let expPS = new ParseState(expTokens)
            let parsedExp = parseType(expPS, "ferrum/0.1")
            const performTypeCheck = true
            let type = inst.instType(primitives, env, depthZero, parsedExp, typeType, performTypeCheck)
            return type
        }

        let parseTm = (typeStr: string): Addr => {
            let expTokens = scan2Fe("", typeStr, null, [])
            let expPS = new ParseState(expTokens)
            let parsedExp = parseType(expPS, "ferrum/0.1")
            const performTypeCheck = true
            let type = inst.instTerm(primitives, env, depthZero, parsedExp, typeType, performTypeCheck)
            return type
        }

        // We cannot call this until the cyclic dependency involving the "{\\}" primitive has been resolved.
        // This currently happens in graph-ti-calc.ts mkTiCalcFuncs.
        // Calling identityFunc repeatedly seems a bit wasteful.
        // TODO ? Resolve the "{\\}" cycle earlier ?
        // const identityFunc = parseTm("(x : X @ Any) -> x")
        const identityFunc = () => parseTm("(x : X @ Any) -> x")


        defPrimitiveType("Void")
        const tyNil = defPrimitiveType("Nil")
        const tyBool = defPrimitiveType("Bool")
        const tyInt = defPrimitiveType("Int")
        const tyChar = defPrimitiveType("Char")
        const tyStr = defPrimitiveType("Str")
        const tyAny = defPrimitiveType("Any")
        const tyAll = defPrimitiveType("All")
        const tyUnknown = defPrimitiveType("Unknown")
        defPrimitiveType("Type")


        function instBuiltin(builtin: Builtin): Addr {
            const numLambdas = builtin.arity
            const args: Addr[] = []
            let builtinTy = builtin.type
            const funcTys: TypeAddr[] = []
            for (let i = 0; i != numLambdas; i++) {
                funcTys.push(builtinTy)
                const argDepth = i + 1 as Depth
                const argTy = h.tyPrim1("Dom", builtinTy, argDepth)
                const argTy2 = h.tyOp2("{<:}", h.tyVar(argDepth), argTy, argDepth)
                const argTm = addrNo
                builtinTy = h.tyApply(builtinTy, argTy2, argDepth)
                const varArg = h.tmVar([], argDepth, argTy2)
                args.push(varArg)
            }
            const opDepth = numLambdas as Depth

            let op2: Addr
            switch (builtin.arity) {
                case 1:
                    op2 = h.tmOp1(builtin.nameG, args[0], opDepth, builtinTy)
                    break
                case 2:
                    op2 = h.tmOp2(builtin.nameG, args[0], args[1], opDepth, builtinTy)
                    break
                default:
                    assert.unreachable()
            }

            let lambda = op2
            funcTys.reverse()
            for (let i = 0; i != numLambdas; i++) {
                const lamDepth = numLambdas - (i + 1) as Depth
                lambda = h.tmLam(false0, false0, args.at(-1 - i)!, lambda, lamDepth, funcTys[i])
            }
            builtin.term = lambda
            return lambda
        }


        // TODO ? Allow paramStrengths to be a simple numeric arity.
        // TODO ? In most cases all paramStrengths are weak.
        function builtinId(name: string, paramStrengths: WorS[], type: TypeAddr, action: Action): unit {
            const arity = paramStrengths.length
            // The "name" must be an identifier, not an operator with a symbolic name.
            assert.isTrue(isAlpha(name[0]))
            const nameG = name
            // const tmOp: Builtin = { name, nameG, tag, arity, paramStrengths, type, action }
            const builtin: Builtin = { name, nameG, arity, paramStrengths, type, action }
            assert.isTrue(!builtinsG.has(nameG))
            builtinsG.set(nameG, builtin)
            builtinTmOps.set(name, builtin)
            // An identifier has the same meaning whether it is in term-brackets or type-brackets.
            // Any identifier without type "Type" will be useless directly in type-brackets, 
            //   but that's a matter for the type-checker to report.
            builtinTyOps.set(name, builtin)
            // const tm = inst.instBuiltin(builtin)
            const tm = instBuiltin(builtin)
            builtinsByAddr.set(tm, builtin)
            const synTy = h.typeOf(tm)
            const ctxTy = tyAny
            const patRc = h.tyPrim0("Void", depthZero)
            const defnRc = h.tyOp2("{\\}", ctxTy, synTy, depthZero)
            env.set(name, tm)
            const pat: ExprTypeGraph = { tag: "EVar", loc: nilLoc, name, tm, synTy, ctxTy: synTy, rc: patRc, torp: "Pat" }
            // TODO ? have "instBuiltin" build and return an ExprTypeGraph expression too ?
            const defn: ExprTypeGraph = { tag: "EVar", loc: nilLoc, name, tm, synTy, ctxTy, rc: defnRc, torp: "Term" }
            decls.push([pat, defn])
        }
        function builtinTermOp(name: string, paramStrengths: WorS[], type: TypeAddr, action: Action) {
            const arity = paramStrengths.length
            const nameG = `(${name})`
            const builtin: Builtin = { name, nameG, arity, paramStrengths, type, action }
            assert.isTrue(!builtinsG.has(nameG))
            builtinsG.set(nameG, builtin)
            builtinTmOps.set(name, builtin)
            builtinTmOps.set(nameG, builtin)
            instBuiltin(builtin)
        }
        function builtinTypeOp1(name: string, paramStrengths: WorS[], type: TypeAddr, action: TypeAction) {
            const arity = paramStrengths.length
            const nameG = `{${name}}`
            const builtin: Builtin = { name, nameG, arity, paramStrengths, type, action }
            assert.isTrue(!builtinsG.has(nameG))
            builtinsG.set(nameG, builtin)
            builtinTyOps.set(name, builtin)
            instBuiltin(builtin)
        }
        function builtinTypeOp2(name: TyOp2_Concrete, paramStrengths: WorS[], type: TypeAddr, action: TypeAction) {
            const arity = paramStrengths.length
            const nameG = `{${name}}`
            const builtin: Builtin = { name, nameG, arity, paramStrengths, type, action }
            assert.isTrue(!builtinsG.has(nameG))
            builtinsG.set(nameG, builtin)
            builtinTyOps.set(name, builtin)
            builtinTyOps.set(nameG, builtin)
            instBuiltin(builtin)
        }

        function builtinTODO(name: string, paramStrengths: WorS[], type: TypeAddr): unit {
            builtinId(name, paramStrengths, type, () => {
                console.error(`GraphPrimitives, TODO (${JSON.stringify(name)})`)
                return null
            })
        }

        const isReducedToType = h.isReducedToType
        const isNotType = tis.isNotType

        const tyPairAnyAny = h.tyPair(h.tyPrim0("Any", depthZero), h.tyPrim0("Any", depthZero), depthZero)

        // returns true only if "a" is definitely not a pair (semantically)
        function isNotTyPair(a: Addr): boolean {
            assumeIsType(a)
            const rc = tis.tiStructuralRelComp(a, tyPairAnyAny)
            return tiIsTrue(rc)
        }
        function isTyInhabited(a: TypeAddr): boolean {
            const rc = tis.tiStructural(a)
            return tiIsTrue(rc)
        }

        const dOf = h.directAddrOf

        function isTyFreeOfUnknowns(a: TypeAddr): boolean {
            return !predicates.tyContainsUnknown(a)
        }

        function isVarUsed(varDepth: Depth, a: Addr, checkTmVar = true, checkTyVar = true): boolean {
            assert.isTrue(checkTmVar || checkTyVar)

            let varFound = false
            const done = new Set<Addr>

            const walker: NodeWalker = {
                child(addr) {
                    addr = dOf(addr)
                    const ty = h.typeAt(addr)
                    h.nodeGuide(visitor, addr)
                    h.nodeGuide(visitor, ty)
                }
            }

            const visitor: Visitor<unit> = h.mkVisitor({
                tm(addr): unit {
                    if (varFound) return
                    addr = dOf(addr)
                    if (h.depthOf(addr) >= varDepth) {
                        h.nodeWalkOnce(done, walker, addr)
                    }
                },
                tmVar(addr): unit {
                    if (!checkTmVar) return
                    addr = dOf(addr)
                    if (h.depthOf(addr) === varDepth) {
                        varFound = true
                    }
                },
                tyVar(addr): unit {
                    if (!checkTyVar) return
                    addr = dOf(addr)
                    if (h.depthOf(addr) === varDepth) {
                        varFound = true
                    }
                },
            })
            h.nodeWalkOnce(done, walker, a)
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

        function unrollRecursiveType(aAddr: Addr_of_TmLambda): TypeAddr & DirectAddr {
            const a = dOf(aAddr)
            const depth = h.depthOf(aAddr)
            const varDepth = depthInc(depth)
            const env: SubstEnv = new Map
            const fixA = tyPrim1("Fix", a, depth)
            env.set(h.pathKey_root, fixA)
            const aBody = dOf(body_tm(a))
            const result = subst.substTmTy(depth, varDepth, env, typeType, aBody)
            assumeIsType(result)
            return result as TypeAddr & DirectAddr
        }


        builtinTypeOp2("|", [weak, weak], parseTy("Type -> Type -> Type"), (depth, [a0, b0]): ActionResult => {
            const a = dOf(a0)
            const b = dOf(b0)

            assumeIsType(a)
            assumeIsType(b)

            if (a === b) return a

            // TODO use tiStructuralRelComp to determine if A or B completely subsumes the other ?

            if (h.isPrim("Error", a)) return b0
            if (h.isPrim("Error", b)) return a0

            if (h.isPrim("{<:}", a)) {
                const a_sub = dOf(h.arg0_ty(a))
                const a_sup = dOf(h.arg1_ty(a))
                if (a_sub === b) return a
                if (a_sup === b) return b
                const sub = h.tyOp2("{|}", a_sub, b, depth)
                const sup = h.tyOp2("{|}", a_sup, b, depth)
                return h.tyOp2("{<:}", sub, sup, depth)
            }
            if (h.isPrim("{:>}", a)) {
                const a_sup = dOf(h.arg0_ty(a))
                const a_sub = dOf(h.arg1_ty(a))
                if (a_sub === b) return a
                if (a_sup === b) return a
                const sub = h.tyOp2("{|}", a_sub, b, depth)
                const sup = h.tyOp2("{|}", a_sup, b, depth)
                return h.tyOp2("{:>}", sup, sub, depth)
            }
            if (h.isPrim("{<:}", b)) {
                const b_sub = dOf(h.arg0_ty(b))
                const b_sup = dOf(h.arg1_ty(b))
                if (b_sub === a) return b
                if (b_sup === a) return a
                const sub = h.tyOp2("{|}", a, b_sub, depth)
                const sup = h.tyOp2("{|}", a, b_sup, depth)
                return h.tyOp2("{<:}", sub, sup, depth)
            }
            if (h.isPrim("{:>}", b)) {
                const b_sup = dOf(h.arg0_ty(b))
                const b_sub = dOf(h.arg1_ty(b))
                if (b_sub === a) return b
                if (b_sup === a) return b
                const sub = h.tyOp2("{|}", a, b_sub, depth)
                const sup = h.tyOp2("{|}", a, b_sup, depth)
                return h.tyOp2("{:>}", sup, sub, depth)
            }

            if (h.isPrim("Any", a) || h.isPrim("Any", b)) return h.tyPrim0("Any", depthZero)
            if (h.isTyVoid(a)) return b
            if (h.isTyVoid(b)) return a
            if (h.isPrim("Nil", a) && h.isPrim("Nil", b)) return a
            if (h.isPrim("Bool", a) && h.isPrim("Bool", b)) return a
            if (h.isPrim("Int", a) && h.isPrim("Int", b)) return a
            if (h.isPrim("Str", a) && h.isPrim("Str", b)) return a
            if (h.isPrim("Str", a) && h.isPrim("Char", b)) return a
            if (h.isPrim("Char", a) && h.isPrim("Str", b)) return b
            if (h.isPrim("Type", a) && h.isPrim("Type", b)) return a

            if (h.isTyPair(a) && h.isTyPair(b)) {
                return null
            }


            if (isPrim("List", a) && isPrim("List", b)) {
                return tyPrim1("List", tyOp2("{|}", tyPrim1("Elem", a, depth), tyPrim1("Elem", b, depth), depth), depth)
            }
            if (isPrim("List", a) && isPrim("Nil", b)) {
                return a
            }
            if (isPrim("Nil", a) && isPrim("List", b)) {
                return b
            }
            if (isPrim("List", a) && h.isTyPair(b)) {
                const aElem = h.arg0_ty(a)
                const bTl = dOf(h.tl_ty(b))
                if (isPrim("List", bTl)) {
                    const bHd = h.hd_ty(b)
                    const bTlElem = h.arg0_ty(bTl)
                    return tyPrim1("List", tyOp2("{|}", aElem, tyOp2("{|}", bHd, bTlElem, depth), depth), depth)
                }
            }

            // TODO

            // if (a.tag === "TPair" && a.tl.tag === "TList" && b.tag === "TList") return listT(unionTypes(unionTypes(a.hd, a.tl.elem), b.elem))

            if (isTyPair(a)) {
                const aTl = dOf(tl_ty(a))
                if (isPrim("List", aTl) && h.isPrim("List", b)) {
                    const bElem = arg0_ty(b)
                    const aHd = hd_ty(a)
                    const aTlElem = arg0_ty(aTl)
                    return tyPrim1("List", tyOp2("{|}", aHd, tyOp2("{|}", aTlElem, bElem, depth), depth), depth)
                }
            }

            // if (a.tag === "TFun" && b.tag === "TFun") {
            //     // TODO ? leave unreduced ?
            //     //   sometimes its useful to leave the members of a union explictly enumerated, (and somethings it is the opposite of useful)
            //     //   perhaps leave the degree of precision here as the users responsibility via type anotations?
            //     return funT(intersectTypes(a.argType, b.argType), unionTypes(a.resultType, b.resultType))
            // }

            // if (isTyFun(a) && isTyFun(b) && isAddrNo(no_ty(a)) && isAddrNo(yes_ty(a)) && isAddrNo(no_ty(b)) && isAddrNo(yes_ty(b))) return () => {
            //     const aDom = dOf(dom_ty(a))
            //     const aCod = dOf(cod_ty(a))
            //     const bDom = dOf(dom_ty(b))
            //     const bCod = dOf(cod_ty(b))
            //     assert.todo("handle function depth correctly")
            //     // TODO If either function is polymorphic or dependent, 
            //     // TODO   then the domain and codomain need to be brought to the same level before they can be intersected/unioned.
            //     // return tyFun(addrNo, addrNo, tyOp2("&", aDom, bDom), tyOp2("|", aCod, bCod), depth)
            // }

            if (isTyFun(a) && isTyFun(b)) {
                // TODO handle the no/yes parts correctly
                return null
            }


            // if (a.tag === 'TNil' && b.tag === 'TPair' && b.tl.tag === 'TList') {
            //     return b.tl
            // }

            if (isPrim("Nil", a) && isTyPair(b)) {
                const bTl = dOf(tl_ty(b))
                if (isPrim("List", bTl)) {
                    return bTl
                }
            }

            // if (a.tag === 'TPair' && a.tl.tag === 'TList' && b.tag === 'TNil') {
            //     return a.tl
            // }

            if (isTyPair(a)) {
                const aTl = dOf(tl_ty(a))
                if (isPrim("List", aTl) && isPrim("Nil", b)) {
                    return aTl
                }
            }

            // if (a.tag === 'TRule' && a.name === 'unionT') {
            //     if (equalType(a.args[0], b) || equalType(a.args[1], b)) {
            //         return a;
            //     }
            // }

            if (isPrim("{|}", a)) {
                const a0 = dOf(arg0_ty(a))
                const a1 = dOf(arg1_ty(a))
                if (a0 === b || a1 === b) return a
            }

            // if (b.tag === 'TRule' && b.name === 'unionT') {
            //     if (equalType(a, b.args[0]) || equalType(a, b.args[1])) {
            //         return b;
            //     }
            // }

            if (isPrim("{|}", b)) {
                const b0 = dOf(arg0_ty(b))
                const b1 = dOf(arg1_ty(b))
                if (a === b0 || a === b1) return a
            }

            // if (a.tag === 'TSingle' && b.tag === 'TSingle' && a.val === b.val) {
            //     return a
            // }

            if (isTySingleStr(a) && isTySingleStr(b) && value_ty(a) === value_ty(b)) {
                return a
            }

            // // TODO don't assume a TSingle is always a string
            // // TODO handle alternative/arbitrary singleton types
            // if (a.tag === 'TSingle' && b.tag === 'TStr') {
            //     return b
            // }
            // if (a.tag === 'TStr' && b.tag === 'TSingle') {
            //     return a
            // }

            if (isTySingleStr(a) && isPrim("Str", b)) {
                return b
            }
            if (isPrim("Str", a) && isTySingleStr(b)) {
                return a
            }

            // if (b.tag === "TRule" && b.name === "relcompT" && b.args[0].tag === "TAny") {
            //     let ty1 = typeRelComp(b.args[1], a)
            //     let ty2 = typeRelComp(anyT, ty1)
            //     return ty2
            // }

            // { A | { Any \ B1 } } --> { Any \ { B1 \ A } }
            if (isPrim("{\\}", b)) {
                const b0 = dOf(arg0_ty(b))
                if (isPrim("Any", b0)) {
                    const b1 = dOf(arg1_ty(b))
                    const ty1 = tyOp2("{\\}", b1, a, depth)
                    const ty2 = tyOp2("{\\}", b0, ty1, depth)
                    return ty2
                }
            }

            // // if { A \ B0 } in uninhabited
            // // then
            // // { A | { B0 \ B1 } } ==> { B0 \ { B1 \ A } } 
            // if (b.tag === "TRule" && b.name === "relcompT") {
            //     let rc0 = tiStructuralRelComp(a, b.args[0])
            //     if (tiIsFalse(rc0)) {
            //         let ty1 = typeRelComp(b.args[1], a)
            //         let ty2 = typeRelComp(b.args[0], ty1)
            //         return ty2
            //     }
            // }


            // if { A \ B0 } in uninhabited
            // then
            // { A | { B0 \ B1 } } --> { B0 \ { B1 \ A } } 
            if (isPrim("{\\}", b)) {
                const b0 = dOf(arg0_ty(b))
                const rc = tis.tiStructuralRelComp(a, b0)
                if (tiIsFalse(rc)) {
                    const b1 = dOf(arg1_ty(b))
                    const ty1 = tyOp2("{\\}", b1, a, depth)
                    const ty2 = tyOp2("{\\}", b0, ty1, depth)
                    return ty2
                }
            }


            // // // keep unions nested to the right
            // // // so 
            // // //   { { A | B } | C }
            // // // becomes
            // // //   { A | B | C }
            // // if (a.tag==="TRule" && a.name==="unionT") {
            // //     let elems: Type[] = []
            // //     while (a.tag==="TRule" && a.name==="unionT") {
            // //         elems.push(a.args[0])
            // //         a = a.args[1]
            // //     }
            // //     elems.push(a)
            // //     let result = elems.reduceRight( ((ty, elem) => ruleT("unionT", [elem, ty])), b )
            // //     return result
            // // }


            if (h.isTyVoid(a)) return b0
            if (h.isTyVoid(b)) return a0

            if (isReducedToType(a) && isReducedToType(b)) {
                return true
            }
            if (isNotType(a) || isNotType(b)) {
                return false
            }
            return null
        })
        builtinTypeOp2("&", [weak, weak], parseTy("Type -> Type -> Type"), (depth, [aAddr, bAddr]): ActionResult => {

            const a = h.directAddrOf(aAddr)
            const b = h.directAddrOf(bAddr)

            assumeIsType(a)
            assumeIsType(b)

            if (a === b) return a

            if (isPrim("Error", a)) return a
            if (isPrim("Error", b)) return b


            // if (a.tag === "TSelf" && b.tag === "TSelf") {
            //     let fvA = typeFreeVars(a)
            //     let fvB = typeFreeVars(b)
            //     let v = uniqName(a.name, [...fvA, ...fvB])
            //     let a2 = substType(a.body, a.name, varT(v), true)
            //     let b2 = substType(b.body, b.name, varT(v), true)
            //     let body = ti(a2, b2)
            //     // if (body===null) {
            //     //     return null
            //     // }
            //     return selfT(v, body)
            // }

            if (isPrim("Self", a) && isPrim("Self", b)) {
                const a0 = dOf(arg0_ty(a))
                const b0 = dOf(arg0_ty(b))
                if (h.isTmLam(a0) && h.isTmLam(b0)) {
                    const aDepth = h.depthOf(a)
                    const bDepth = h.depthOf(b)
                    const aLamDepth = h.depthOf(a0)
                    const bLamDepth = h.depthOf(b0)
                    const aBody = h.body_tm(a0)
                    const bBody = h.body_tm(b0)
                    const resultDepth = Math.max(aDepth, bDepth) as Depth
                    const selfVar = h.tyVar(depthInc(resultDepth))
                    const env: SubstEnv = new Map
                    env.set(h.pathKey_root, selfVar)
                    const a2 = subst.substTmTy(resultDepth, depthInc(aLamDepth), env, typeType, aBody)
                    const b2 = subst.substTmTy(resultDepth, depthInc(bLamDepth), env, typeType, bBody)
                    assumeIsType(a2)
                    assumeIsType(b2)
                    const body = tyOp2("{&}", a2, b2, depth)
                    // TODO fix the Self tyFun/tmLam change, the graph-types Self is different to the original tree-types Self
                    const selfLam = tyFun(addrNo, addrNo, selfVar, body, resultDepth)
                    return tyPrim1("Self", selfLam, depth)
                }
            }


            // if (a.tag === 'TSelf') {
            //     let fvA = typeFreeVars(a)
            //     let fvB = typeFreeVars(b)
            //     let v = uniqName(a.name, [...fvA, ...fvB])
            //     let body = ti(substType(a.body, a.name, subT(varT(v), b), true), b)
            //     // if (body===null) {
            //     //     return null
            //     // }
            //     let result = selfT(v, body)
            //     return result
            // }

            if (isPrim("Self", a)) {
                const a0 = dOf(arg0_ty(a))
                if (h.isTmLam(a0)) {
                    const aPatTy = h.typeOf(dOf(pat_tm(a0))) // TODO ? Do we really want this "dOf" here ?
                    const aLamDepth = h.depthOf(a0)
                    const aBody = h.body_tm(a0)
                    const resultDepth = depth
                    const selfVarDepth = depthInc(resultDepth)
                    const selfVarTy = tyOp2("{<:}", tyOp2("{&}", aPatTy, b, depth), b, depth)
                    const selfVar = h.tmVar([], selfVarDepth, selfVarTy)
                    const a2 = h.tmApply(a0, selfVar, selfVarDepth)
                    assumeIsType(a2)
                    const body = tyOp2("{&}", a2, b, selfVarDepth)
                    const selfLamTy = tyFun(addrNo, addrNo, selfVarTy, typeType, resultDepth)
                    const selfLam = tmLam(false0, false0, selfVar, body, resultDepth, selfLamTy)
                    return tyPrim1("Self", selfLam, depth)
                }
            }


            // if (b.tag === 'TSelf') {
            //     let fvA = typeFreeVars(a)
            //     let fvB = typeFreeVars(b)
            //     let v = uniqName(b.name, [...fvA, ...fvB])
            //     let body = ti(substType(b.body, b.name, subT(varT(v), a), true), a)
            //     // if (body===null) {
            //     //     return null
            //     // }
            //     let result = selfT(v, body)
            //     return result
            // }

            if (isPrim("Self", b)) {
                const b0 = dOf(arg0_ty(b))
                if (h.isTmLam(b0)) {
                    const bDepth = h.depthOf(b)
                    const bPatTy = h.typeOf(dOf(pat_tm(b0))) // TODO ? Do we really want this "dOf" here ?
                    const resultDepth = depth
                    const selfVarDepth = depthInc(resultDepth)
                    const selfVarTy = tyOp2("{<:}", tyOp2("{&}", a, bPatTy, depth), a, depth)
                    const selfVar = h.tmVar([], selfVarDepth, selfVarTy)
                    const b2 = h.tmApply(b0, selfVar, selfVarDepth)
                    assumeIsType(b2)
                    const body = tyOp2("{&}", a, b2, depth)
                    const selfLamTy = tyFun(addrNo, addrNo, selfVarTy, typeType, resultDepth)
                    const selfLam = tmLam(false0, false0, selfVar, body, resultDepth, selfLamTy)
                    return tyPrim1("Self", selfLam, depth)
                }
            }


            // if (a.tag === 'TSub') {
            //     if (equalType(a.type, b))
            //         return a
            //     if (equalType(a.super, b))
            //         return a
            //     let t1 = ti(a.type, b)
            //     let t2 = ti(a.super, b)
            //     // if (t1===null || t2===null) {
            //     //     return null
            //     // }
            //     return subT(t1, t2)
            // }

            if (isPrim("{<:}", a)) {
                const aSub = dOf(arg0_ty(a))
                const aSup = dOf(arg1_ty(a))
                if (aSub === b) return a
                if (aSup === b) return a
                const tSub = tyOp2("{&}", aSub, b, depth)
                const tSup = tyOp2("{&}", aSup, b, depth)
                const t = tyOp2("{<:}", tSub, tSup, depth)
                return t
            }


            // if (a.tag === 'TSuper') {
            //     if (equalType(a.type, b))
            //         return a
            //     if (equalType(a.sub, b))
            //         return b
            //     let t1 = ti(a.type, b)
            //     let t2 = ti(a.sub, b)
            //     return superT(t1, t2)
            // }

            if (isPrim("{:>}", a)) {
                const aSup = dOf(arg0_ty(a))
                const aSub = dOf(arg1_ty(a))
                if (aSup === b) return a
                if (aSub === b) return b
                const tSup = tyOp2("{&}", aSup, b, depth)
                const tSub = tyOp2("{&}", aSub, b, depth)
                const t = tyOp2("{:>}", tSup, tSub, depth)
                return t
            }

            // if (b.tag === 'TSub') {
            //     if (equalType(a, b.type))
            //         return b
            //     if (equalType(a, b.super))
            //         return b
            //     // if (equalObjects(a, b.super))
            //     //     return b
            //     let t1 = ti(a, b.type)
            //     let t2 = ti(a, b.super)
            //     // if (t2.tag==="TVoid") {
            //     //     return t2
            //     // }
            //     return subT(t1, t2)
            // }

            if (isPrim("{<:}", b)) {
                const bSub = dOf(arg0_ty(b))
                const bSup = dOf(arg1_ty(b))
                if (bSub === a) return b
                if (bSup === a) return b
                const tSub = tyOp2("{&}", a, bSub, depth)
                const tSup = tyOp2("{&}", a, bSup, depth)
                const t = tyOp2("{<:}", tSub, tSup, depth)
                return t
            }

            // if (b.tag === 'TSuper') {
            //     if (equalType(a, b.type))
            //         return b
            //     if (equalType(a, b.sub))
            //         return a
            //     let t1 = ti(a, b.type)
            //     let t2 = ti(a, b.sub)
            //     return superT(t1, t2)
            // }

            if (isPrim("{:>}", b)) {
                const bSup = dOf(arg0_ty(b))
                const bSub = dOf(arg1_ty(b))
                if (bSup === a) return b
                if (bSub === a) return a
                const tSup = tyOp2("{&}", a, bSup, depth)
                const tSub = tyOp2("{&}", a, bSub, depth)
                const t = tyOp2("{:>}", tSup, tSub, depth)
                return t
            }


            // if (a.tag === "TAny") return b
            // if (b.tag === "TAny") return a
            if (isPrim("Any", a)) return b
            if (isPrim("Any", b)) return a

            // if (a.tag === "TVoid") return voidT
            // if (b.tag === "TVoid") return voidT
            if (isPrim("Void", a)) return a
            if (isPrim("Void", b)) return b


            // if (a.tag === "TNil" && b.tag === "TNil") return nilT
            if (isPrim("Nil", a) && isPrim("Nil", b)) return a
            // if (a.tag === "TBool" && b.tag === "TBool") return boolT
            if (isPrim("Bool", a) && isPrim("Bool", b)) return a
            // if (a.tag === "TInt" && b.tag === "TInt") return intT
            if (isPrim("Int", a) && isPrim("Int", b)) return a
            // if (a.tag === "TStr" && b.tag === "TStr") return strT
            if (isPrim("Str", a) && isPrim("Str", b)) return a
            // if (a.tag === "TStr" && b.tag === "TChar") return charT
            if (isPrim("Str", a) && isPrim("Char", b)) return b
            // if (a.tag === "TChar" && b.tag === "TStr") return charT
            if (isPrim("Char", a) && isPrim("Str", b)) return a
            // if (a.tag === "TType" && b.tag === "TType") return typeT
            if (isPrim("Type", a) && isPrim("Type", b)) return a


            // // TODO ? check for bounded-variation / regular-recursion before unrolling ?
            // // TODO ? better to leave an intersection unreduced than fail to terminate ?
            // let a1: Type = a
            // if (a1.tag === "TRec") {
            //     a1 = unrollRecursiveType(a1)
            // }
            // let b1: Type = b
            // if (b1.tag === "TRec") {
            //     b1 = unrollRecursiveType(b1)
            // }

            let aPossiblyUnrolled: TypeAddr & DirectAddr = a
            let bPossiblyUnrolled: TypeAddr & DirectAddr = b

            if (isPrim("Fix", a)) {
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    aPossiblyUnrolled = unrollRecursiveType(aLam)
                }
            }
            if (isPrim("Fix", b)) {
                const bLam = dOf(arg0_ty(b))
                if (isTmLam(bLam)) {
                    bPossiblyUnrolled = unrollRecursiveType(bLam)
                }
            }

            {
                const a = aPossiblyUnrolled
                const b = bPossiblyUnrolled

                // if (a1.tag === "TPair" && b1.tag === "TPair") {
                //     // these void-tests are required for the type intersection used in matching case-expression patterns to work correctly
                //     // the intersection of { ["A", Int] | ["B", Str] } with { ["A", Any] } reduces to { [ "A", Int ] }
                //     let h = ti(a1.hd, b1.hd)
                //     if (h.tag === 'TVoid') {
                //         return voidT
                //     }
                //     let t = ti(a1.tl, b1.tl)
                //     if (t.tag === 'TVoid') {
                //         return voidT
                //     }
                //     return pairT(h, t)
                // }

                // // if (a1.tag === "TPair" && b1.tag === "TPair") {
                // //     let h = tti(a1.hd, b1.hd)
                // //     let t = tti(a1.tl, b1.tl)
                // //     if (h === null || t === null) {
                // //         console.log(`FAILED TO INTERSECT PAIRS`)
                // //         console.log(`  A: ${showType2(a)}`)
                // //         console.log(`  B: ${showType2(b)}`)
                // //         return null
                // //     }
                // //     else if (h.tag === "TVoid" || t.tag === "TVoid") {
                // //         // these void-tests are required for the type intersection used in matching case-expression patterns to work correctly
                // //         // the intersection of { ["A", Int] | ["B", Str] } with { ["A", Any] } reduces to { [ "A", Int ] }
                // //         return voidT
                // //     }
                // //     else {
                // //         return pairT(h, t)
                // //     }
                // // }
                if (isTyPair(a) && isTyPair(b)) {

                    // TODO ? Rather than reducing intersections to Void here,
                    // TODO ?   it might be better to only do this when intersection unions.
                    // TODO ? If we can then always proceed to intersect pairs with pairs,
                    // TODO ?   this stops the evaluation of dependent tails getting stuck checking if the head intersection reduces to Void.
                    // TODO ? We want to be able to reduce:
                    // TODO ?   (Tl { [A ,, B] & (Self <| (v1 : V1 @ Type) -> { [C ,, D] }) })
                    // TODO ? Without blocking on checking if { A & C } is inhabited or not.
                    // TODO ? This occurs when calulating context types. 
                    // TODO ?   But if A and C aren't compatible, 
                    // TODO ?     then an error will be found when type checking the head of the tuple.
                    // TODO ? The type-checker is able to check things (graph-ti-rules) 
                    // TODO ?   that cannot be checked by the reduction rules (graph-primitives) alone.

                    const a_hd = dOf(hd_ty(a))
                    const a_tl = dOf(tl_ty(a))
                    const b_hd = dOf(hd_ty(b))
                    const b_tl = dOf(tl_ty(b))

                    const inHd = tyOp2("{&}", a_hd, b_hd, depth)
                    const inTl = tyOp2("{&}", a_tl, b_tl, depth)

                    // const hdTi = tis.tiStructuralIntersect(a_hd, b_hd)
                    // const tlTi = tis.tiStructuralIntersect(a_tl, b_tl)

                    const hdTi = tis.tiStructuralIntersectAssumeArgsInhabited(a_hd, b_hd)
                    const tlTi = tis.tiStructuralIntersectAssumeArgsInhabited(a_tl, b_tl)

                    let hdIsVoid = tiIsFalse(hdTi)
                    let tlIsVoid = tiIsFalse(tlTi)

                    // // Allow the intersect to reduce if intersecting with Any
                    // hdIsVoid &&= !(isTyOp("Any", a_hd) || isTyOp("Any", b_hd))
                    // tlIsVoid &&= !(isTyOp("Any", a_tl) || isTyOp("Any", b_tl))

                    if (hdIsVoid || tlIsVoid) {
                        // the result is uninhabited
                        // might as well reduce to Void now, 
                        // rather than creating a tyPair we already know is uninhabited
                        return tyPrim0("Void", depthZero)
                    }
                    else if (tiIsTrue(hdTi) && tiIsTrue(tlTi)) {
                        // the result is inhabited
                        return tyPair(inHd, inTl, depth)
                    }
                    else {
                        // the result inhabitation is unknown
                        // should we leave the intersection unreduced ?
                        return null
                        // or just pair the types together anyway ?
                        // return () => tyPair(inHd, inTl)
                        // neither result is wrong, but which is best ?
                    }
                }


                // if (a1.tag === "TList" && b1.tag === "TList") {
                //     return listT(ti(typeElem(a), typeElem(b)))
                // }
                if (isPrim("List", a) && isPrim("List", b)) {
                    const aElem = dOf(arg0_ty(a))
                    const bElem = dOf(arg0_ty(b))
                    const tElem = tyOp2("{&}", aElem, bElem, depth)
                    const t = tyPrim1("List", tElem, depth)
                    return t
                }

                // if (a1.tag === "TList" && b1.tag === "TNil") return nilT
                // if (a1.tag === "TNil" && b1.tag === "TList") return nilT
                if (isPrim("Nil", a) && isPrim("List", b)) return a
                if (isPrim("List", a) && isPrim("Nil", b)) return b


                // if (a1.tag === "TPair" && b1.tag === "TNil") return voidT
                // if (a1.tag === "TNil" && b1.tag === "TPair") return voidT
                if (isTyPair(a) && isPrim("Nil", b)) return tyPrim0("Void", depthZero)
                if (isPrim("Nil", a) && isTyPair(b)) return tyPrim0("Void", depthZero)

                // // if (a.tag === "TFun" && b.tag === "TFun") {
                // //     // TODO ? leave this unreduced ?
                // //     // currently this throws away info, e.g:
                // //     //   { {Int->Str} & {Str->Int} }
                // //     // is more informative than
                // //     //   { {Int|Str} -> {Str|Int} }
                // //     if (!USE_AS_TYPES) {
                // //         return funT(unionTypes(a.argType, b.argType), intersectTypes(a.resultType, b.resultType))
                // //     }
                // // }
                // if (a.tag === "TFun" && b.tag === "TFun") {
                //     // return ruleT("intersectT", [a, b])
                //     if (a.argType.tag === "TVoid" && b.argType.tag === "TVoid") {
                //         return funT(voidT, intersectTypes(a.resultType, b.resultType))
                //     }
                //     else if (a.argType.tag === "TVoid") {
                //         return b
                //     }
                //     else if (b.argType.tag === "TVoid") {
                //         return a
                //     }
                //     else {
                //         // leave unreduced, the type may represent an overloaded function
                //         return ruleT("intersectT", [a, b])
                //     }
                // }
                if (isTyFun(a) && isTyFun(b) && isAddrNo(no_ty(a)) && isAddrNo(yes_ty(a)) && isAddrNo(no_ty(b)) && isAddrNo(yes_ty(b))) {
                    const aDomVoid = isPrim("Void", a)
                    const bDomVoid = isPrim("Void", b)
                    // const aDomVoid = tiIsFalse(tis.tiStructural(dOf(dom_ty(a))))
                    // const bDomVoid = tiIsFalse(tis.tiStructural(dOf(dom_ty(b))))
                    if (aDomVoid && bDomVoid) {
                        const aCod = dOf(cod_ty(a))
                        const bCod = dOf(cod_ty(b))
                        assert.todo("handle function depth correctly")
                        // return () => tyFun(addrNo, addrNo, tyOp0("Void"), tyOp2("&", aCod, bCod))
                    }
                    if (aDomVoid) {
                        return b
                    }
                    if (bDomVoid) {
                        return a
                    }
                    return null
                }
                if (isTyFun(a) && isTyFun(b)) {
                    // TODO handle the no/yes parts correctly
                    return null
                }


                // if (a.tag === 'TSingle' && b.tag === 'TSingle') {
                //     return a.val === b.val ? a : voidT
                // }
                if (h.isTySingleStr(a) && h.isTySingleStr(b)) {
                    const aVal = h.value_ty(a)
                    const bVal = h.value_ty(b)
                    if (aVal === bVal) {
                        return a
                    }
                    else {
                        return h.tyPrim0("Void", depthZero)
                    }
                }

                // // TODO don't assume a TSingle is always a string
                // // TODO handle alternative/arbitrary singleton types
                // if (a.tag === 'TSingle' && b.tag === 'TStr') {
                //     return a
                // }
                if (isTySingleStr(a) && isPrim("Str", b)) {
                    return a
                }

                // if (a.tag === 'TStr' && b.tag === 'TSingle') {
                //     return b
                // }
                if (isPrim("Str", a) && isTySingleStr(b)) {
                    return b
                }

                if (isTySingleStr(a) && isPrim("Char", b)) {
                    const value = h.value_ty(a)
                    return value.length === 1 ? a : h.tyPrim0("Void", depthZero)
                }
                if (isPrim("Char", a) && isTySingleStr(b)) {
                    const value = h.value_ty(b)
                    return value.length === 1 ? b : h.tyPrim0("Void", depth)
                }


                // if (a.tag === 'TPair' && b.tag === 'TList') {
                //     return tti(a, pairT(b.elem, b))
                // }
                if (isTyPair(a) && isPrim("List", b)) {
                    const b_elem = arg0_ty(b)
                    const a_hd = hd_ty(a)
                    const a_tl = tl_ty(a)
                    const hd = tyOp2("{&}", a_hd, b_elem, depth)
                    const tl = tyOp2("{&}", a_tl, b, depth)
                    const result = tyPair(hd, tl, depth)
                    return result
                }

                // if (a.tag === 'TList' && b.tag === 'TPair') {
                //     return tti(pairT(a.elem, a), b)
                // }
                if (isPrim("List", a) && isTyPair(b)) {
                    const a_elem = arg0_ty(a)
                    const b_hd = hd_ty(b)
                    const b_tl = tl_ty(b)
                    const hd = tyOp2("{&}", a_elem, b_hd, depth)
                    const tl = tyOp2("{&}", a, b_tl, depth)
                    const result = tyPair(hd, tl, depth)
                    return result
                }

                // // these have been helpful in some situations (match in fe4a),
                // // and seem benign.
                // // if (a.tag === 'TRule' && b.tag === 'TPair') {
                // //     return tti(pairT(typeHd(a),typeTl(a)), b)
                // // }
                // // if (a.tag === 'TRule' && b.tag === 'TList') {
                // //     return tti(pairT(typeHd(a),typeTl(a)), pairT(b.elem, b))
                // // }


                // if (a.tag === 'TRule' && b.tag === 'TRule' && a.name === b.name) {
                //     switch (a.name) {
                //         case 'domainT':
                //             // assert (a.args.length===1)
                //             return ruleT(a.name, [ti(a.args[0], b.args[0])])
                //     }
                // }
                if (isPrim("Dom", a) && isPrim("Dom", b)) {
                    const a0 = dOf(arg0_ty(a))
                    const b0 = dOf(arg0_ty(b))
                    const t0 = tyOp2("{&}", a0, b0, depth)
                    const t = tyPrim1("Dom", t0, depth)
                    return t
                }

                // if (a1.tag === 'TRule' && a1.name === 'unionT') {
                //     // TODO ? is this safe, do we need to track void types ?
                //     // or else we risk Tl {[Void, Int]} not being Void but Int
                //     // i.e. we shouldn't be able to take the tail of a type which has a Void head
                //     return unionTypes(ti(a1.args[0], b), ti(a1.args[1], b))
                // }
                if (isPrim("{|}", a)) {
                    const a0 = dOf(arg0_ty(a))
                    const a1 = dOf(arg1_ty(a))
                    const a0_b = tyOp2("{&}", a0, b, depth)
                    const a1_b = tyOp2("{&}", a1, b, depth)
                    const t = tyOp2("{|}", a0_b, a1_b, depth)
                    return t
                }


                // if (b1.tag === 'TRule' && b1.name === 'unionT') {
                //     // TODO ? is this safe, do we need to track void types ?
                //     // or else we risk Tl {[Void, Int]} not being Void but Int
                //     // i.e. we shouldn't be able to take the tail of a type which has a Void head
                //     return unionTypes(ti(a, b1.args[0]), ti(a, b1.args[1]))
                // }
                if (isPrim("{|}", b)) {
                    const b0 = dOf(arg0_ty(b))
                    const b1 = dOf(arg1_ty(b))
                    const a_b0 = tyOp2("{&}", a, b0, depth)
                    const a_b1 = tyOp2("{&}", a, b1, depth)
                    const t = tyOp2("{|}", a_b0, a_b1, depth)
                    return t
                }

                // // we can count TSingle as disjoint here, as it will be if we reach this far
                // let disjointTypes = ["TInt", "TBool", "TType", "TFun", "TStr", "TChar", "TSingle", "TNil"]
                // if (disjointTypes.indexOf(a.tag) !== -1 && disjointTypes.indexOf(b.tag) !== -1 && a.tag !== b.tag) {
                //     return voidT
                // }
                const isDisjoint1 = h.isTyPrimOneOf2(["Int", "Bool", "Type", "Str", "Char", "Nil"])
                const isDisjoint2 = (a: AddrQ) => isTySingleStr(a) || isTyFun(a) || isDisjoint1(a)
                if (isDisjoint1(a) && isDisjoint1(b)) {
                    if (h.name_ty(a) === h.name_ty(b)) {
                        return a
                    }
                    else {
                        return tyPrim0("Void", depthZero)
                    }
                }
                if (isDisjoint2(a) && isDisjoint2(b)) {
                    // { TySingleStr & TySingleStr } and { TyFun & TyFun } have been handled earlier, 
                    // These types must be disjoint, so the intersection is void.
                    return tyPrim0("Void", depthZero)
                }


                // if (disjointTypes.indexOf(a.tag) !== -1 && b.tag === 'TPair') {
                //     return voidT
                // }
                if (isDisjoint2(a) && isTyPair(b)) return tyPrim0("Void", depthZero)

                // if (a.tag === 'TPair' && disjointTypes.indexOf(b.tag) !== -1) {
                //     return voidT
                // }
                if (isTyPair(a) && isDisjoint2(b)) return tyPrim0("Void", depthZero)

                // if (disjointTypes.indexOf(a.tag) !== -1 && b.tag === 'TList') {
                //     return voidT
                // }
                if (isDisjoint2(a) && isPrim("List", b)) return tyPrim0("Void", depthZero)

                // if (a.tag === 'TList' && disjointTypes.indexOf(b.tag) !== -1) {
                //     return voidT
                // }
                if (isPrim("List", a) && isDisjoint2(b)) return tyPrim0("Void", depthZero)

                // if (equalType(pairT(typeHd(a, true), typeTl(a, true)), b)) {
                //     return b
                // }
                // if (equalType(a, pairT(typeHd(b, true), typeTl(b, true)))) {
                //     return a
                // }

                // if (b.tag === "TRule" && b.name === "relcompT") {

                //     let b1: Type = b
                //     let bs: Type[] = []
                //     while (b1.tag === "TRule" && b1.name === "relcompT") {
                //         bs.push(b1.args[1])
                //         b1 = b1.args[0]
                //     }
                //     // if (b1.tag === "TAny") {

                //     let bUn = unionTypeList(bs)
                //     let abIn = intersectTypes(a, b1)
                //     // let aRc = typeRelComp(a, bUn)
                //     let aRc = typeRelComp(abIn, bUn)

                //     // console.log("INTERSECT NEG")
                //     // console.log(`  A: ${showType2(a)}`)
                //     // console.log(`  B: ${showType2(b)}`)
                //     // console.log(`  U: ${showType2(bUn)}`)
                //     // console.log(`  R: ${showType2(aRc)}`)

                //     return aRc
                //     // }

                //     // if (equalType(a, b1)) {
                //     //     return b
                //     // }

                // }

                // // // { A & { B0 \ B1 } }
                // // if (b.tag === "TRule" && b.name === "relcompT" && equalType(a, b.args[0])) {
                // //     // TODO look for nested relcomp
                // //     // { A & { { { B0 \ B1 } \ B2 } \ B3 } }
                // //     return b
                // // }

                // // { A & [(Hd A) <: B, ...Any] } --> { A <: [B, ...Any] }
                // if (a.tag === "TVar" && b.tag === "TPair" && b.tl.tag === "TAny" && b.hd.tag === "TSub") {
                //     if (tiIsFalse(tiStructuralRelComp(typeHd(a), b.hd.type))) {
                //         return subT(a, pairT(b.hd.super, anyT))
                //     }
                // }

            }


            if (isReducedToType(a) && isReducedToType(b)) {
                return true
            }
            if (isNotType(a) || isNotType(b)) {
                return false
            }
            return null
        })

        // // TODO ? A Pair constructor that has responsibility for checking the inhabitation of the Hd and Tl.
        // // TODO ? Typically, it is when intersecting types that we need to have uninhabited pairs reduce to Void.
        // // TODO ? So have the &-operator use this, and remove the need for the Hd and Tl operators to check.
        // builtinId("Pair", [weak, weak], parseType("Type -> Type -> Type"), (depth, [hdAddr, tlAddr]): ActionResult => {
        //     assert.todo("Do we need this?")
        //     return null
        // })

        // // TODO ? A custom operator for pattern-matching ?
        // // TODO ? Currently intersection is used, 
        // // TODO ?   but checking if { Arg & Pat } is inhabited involves checking if ARG is inhabited,
        // // TODO ?   This is more work than needed, too often unknown, and results in the messy KnownInhabited technique being used.
        // // TODO ?   We really only want to assume the Arg is inhabited for the duration of the intersection/pat-match.
        // // TODO ? A custom operator might be the simplest way to achieve this.
        // // TODO ? The main (only) difference is/should be that { [V1 ,, V2] & [V1 ,, Any] } can be reduced to a pair.
        // // TODO ? We are only checking if the intersection has caused the result to be uninhabited, 
        // // TODO ?   not if the arguments were uninhabited to begin with.
        // builtinTypeOp2("&?", [weak, weak], type_type_to_type, (depth, [aAddr, bAddr]): ActionResult => {
        //     assert.todo("Do we need this?")
        //     assumeIsType(aAddr)
        //     assumeIsType(bAddr)
        //     // return () => tyOp2("&", aAddr, bAddr)
        //     return null
        // })



        builtinTypeOp2("\\", [weak, weak], parseTy("Type -> Type -> Type"), (depth, [aAddr, bAddr]): ActionResult => {
            const a = h.directAddrOf(aAddr)
            const b = h.directAddrOf(bAddr)

            assumeIsType(a)
            assumeIsType(b)

            // if (a.tag === 'TVoid' || b.tag === 'TAny') {
            //     return voidT
            // }
            if (isPrim("Void", a) || isPrim("Any", b)) {
                return tyPrim0("Void", depthZero)
            }

            // if (equalType(a, b)) {
            //     return voidT
            // }
            if (equalTypes(a, b)) return tyPrim0("Void", depthZero)


            // if (b.tag === 'TVoid') {
            //     return a
            // }
            if (isPrim("Void", b)) {
                return a
            }

            // if (a.tag === "TError") {
            //     return errorT
            // }
            if (isPrim("Error", a)) {
                return a
            }

            // if (b.tag === "TError") {
            //     console.log("I can't imagine we'll ever get here")
            //     // throw new Error("I can't imagine we'll ever get here")
            //     // currently, every type implicitly contains error
            //     // so there's no way to represent a type with just Error removed
            //     // ? so pretend Error behaves like Void and just return A ?
            //     // we're actually doing that implicitly everywhere, e.g.
            //     //   { {Int|Bool} \ Bool }
            //     // reduces to {Int}, still with an implicit Error, 
            //     // even through there's implicitly an Error in Bool
            //     return a
            // }
            if (isPrim("Error", b)) {
                return a
            }


            // if (a.tag === 'TSub') {
            //     if (equalType(a.type, b))
            //         return voidT
            //     if (equalType(a.super, b))
            //         return voidT
            //     let t1 = rc(a.type, b)
            //     let t2 = rc(a.super, b)
            //     return subT(t1, t2)
            // }
            if (isPrim("{<:}", a)) {
                const aSub = dOf(arg0_ty(a))
                const aSup = dOf(arg1_ty(a))
                if (equalTypes(aSub, b)) return tyPrim0("Void", depthZero)
                if (equalTypes(aSup, b)) return tyPrim0("Void", depthZero)
                const rSub = tyOp2("{\\}", aSub, b, depth)
                const rSup = tyOp2("{\\}", aSup, b, depth)
                const result = tyOp2("{<:}", rSub, rSup, depth)
                return result
            }

            // if (a.tag === 'TSuper') {
            //     if (equalType(a.type, b))
            //         return voidT
            //     let t1 = rc(a.type, b)
            //     let t2 = rc(a.sub, b)
            //     return superT(t1, t2)
            // }
            if (isPrim("{:>}", a)) {
                const aSup = dOf(arg0_ty(a))
                const aSub = dOf(arg1_ty(a))
                if (equalTypes(aSup, b)) return tyPrim0("Void", depthZero)
                const rSup = tyOp2("{\\}", aSup, b, depth)
                const rSub = tyOp2("{\\}", aSub, b, depth)
                const result = tyOp2("{<:}", rSup, rSub, depth)
                return result
            }

            // // TODO ? b.tag==="TSuper" ?

            // if (a.tag === "TPair" && b.tag === "TPair") {
            //     let rcH = rc(a.hd, b.hd)
            //     let rcT = rc(a.tl, b.tl)
            //     let pH = pairT(rcH, a.tl)
            //     let pT = pairT(a.hd, rcT)
            //     let result = unionTypes(pH, pT)
            //     return result
            // }
            // { [ aHd ,, aTl] \ [ bHd ,, bTl ] } --> { [ aHd \ bHd ,, aTl ] | [ aHd ,, aTl \ bTl ] }
            if (isTyPair(a) && isTyPair(b)) {
                const aHd = dOf(hd_ty(a))
                const aTl = dOf(tl_ty(a))
                const bHd = dOf(hd_ty(b))
                const bTl = dOf(tl_ty(b))
                const rcH = tyOp2("{\\}", aHd, bHd, depth)
                const rcT = tyOp2("{\\}", aTl, bTl, depth)
                const pH = tyPair(rcH, aTl, depth)
                const pT = tyPair(aHd, rcT, depth)
                return tyOp2("{|}", pH, pT, depth)
            }

            // if (a.tag === "TList" && b.tag === "TPair") {
            //     let rcH = rc(a.elem, b.hd)
            //     let rcT = rc(a, b.tl)
            //     let pH = pairT(rcH, a)
            //     let pT = pairT(a.elem, rcT)
            //     let result = unionTypeList([pH, pT, nilT])
            //     return result
            // }
            if (isPrim("List", a) && isTyPair(b)) {
                const aElem = dOf(arg0_ty(a))
                const bHd = dOf(hd_ty(b))
                const bTl = dOf(tl_ty(b))
                const rcH = tyOp2("{\\}", aElem, bHd, depth)
                const rcT = tyOp2("{\\}", a, bTl, depth)
                const pH = tyPair(rcH, a, depth)
                const pT = tyPair(aElem, rcT, depth)
                const t = tyOp2("{|}", pH, tyOp2("{|}", pT, tyPrim0("Nil", depthZero), depth), depth)
                return t
            }

            // if (a.tag === "TList" && b.tag === "TList") {
            //     let elem = rc(a.elem, b.elem)
            //     return rc(listT(elem), nilT)
            // }
            if (isPrim("List", a) && isPrim("List", b)) {
                const aElem = dOf(arg0_ty(a))
                const bElem = dOf(arg0_ty(b))
                const tElem = tyOp2("{\\}", aElem, bElem, depth)
                const tList = tyPrim1("List", tElem, depth)
                const t = tyOp2("{\\}", tList, tyPrim0("Nil", depthZero), depth)
                // this version is probably preferable
                // const t = tyPair(tElem, tList)
                return t
            }

            // if (a.tag === "TNil" && b.tag === "TList") {
            //     return voidT
            // }
            if (isPrim("Nil", a) && isPrim("List", b)) return tyPrim0("Void", depthZero)

            // if (a.tag === "TList" && b.tag === "TNil") {
            //     return pairT(a.elem, a)
            // }
            if (isPrim("List", a) && isPrim("Nil", b)) {
                const aElem = dOf(arg0_ty(a))
                return tyPair(aElem, a, depth)
            }

            // if (a.tag === "TPair" && b.tag === "TNil") {
            //     return a
            // }
            if (isTyPair(a) && isPrim("Nil", b)) return a

            // if (a.tag === "TNil" && b.tag === "TPair") {
            //     return a
            // }
            if (isPrim("Nil", a) && isTyPair(b)) return a

            // if (a.tag === 'TRule' && a.name === 'unionT') {
            //     let u0 = rc(a.args[0], b)
            //     let u1 = rc(a.args[1], b)
            //     return unionTypes(u0, u1)
            // }
            if (isPrim("{|}", a)) {
                const a0 = dOf(arg0_ty(a))
                const a1 = dOf(arg1_ty(a))
                const u0 = tyOp2("{\\}", a0, b, depth)
                const u1 = tyOp2("{\\}", a1, b, depth)
                const t = tyOp2("{|}", u0, u1, depth)
                return t
            }

            // if (b.tag === 'TRule' && b.name === 'unionT') {
            //     return rc(rc(a, b.args[0]), b.args[1])
            // }
            if (isPrim("{|}", b)) {
                const b0 = dOf(arg0_ty(b))
                const b1 = dOf(arg1_ty(b))
                const rc0 = tyOp2("{\\}", a, b0, depth)
                const rc1 = tyOp2("{\\}", rc0, b1, depth)
                return rc1
            }

            // if (a.tag === 'TSingle' && b.tag === 'TSingle') {
            //     if (a.val === b.val) {
            //         return voidT
            //     }
            //     else {
            //         return a
            //     }
            // }
            if (isTySingleStr(a) && isTySingleStr(b)) {
                const aVal = value_ty(a)
                const bVal = value_ty(b)
                const t = aVal === bVal ? tyPrim0("Void", depthZero) : a
                return t
            }

            // if (a.tag === 'TStr' && b.tag === 'TChar') {
            //     // an empty string, or a string with length at least 2
            //     // leave unreduced for now
            //     ruleT("relcompT", [a, b])
            // }
            if (isPrim("Str", a) && isPrim("Char", b)) return null

            // if (a.tag === 'TChar' && b.tag === 'TStr') {
            //     return voidT
            // }
            if (isPrim("Char", a) && isPrim("Str", b)) return tyPrim0("Void", depthZero)


            // if (a.tag === 'TFun' && b.tag === 'TFun') {
            //     // TODO ? probably need to union together three different cases to 
            //     // TODO ?   reduce this correctly
            //     return ruleT("relcompT", [a, b])
            // }
            if (isTyFun(a) && isTyFun(b)) return null

            // // TODO don't assume a TSingle is always a string
            // // TODO handle alternative/arbitrary singleton types
            // if (a.tag === 'TSingle' && b.tag === 'TStr') {
            //     return voidT
            // }
            if (isTySingleStr(a) && isPrim("Str", b)) return tyPrim0("Void", depthZero)

            // if (a.tag === 'TSingleType' && b.tag === 'TType') {
            //     return voidT
            // }
            if (isTySingleStr(a) && isPrim("Type", b)) return tyPrim0("Void", depthZero)

            // let disjointTypes = ["TInt", "TBool", "TType", "TFun", "TStr", "TChar", "TNil"]
            // if (disjointTypes.indexOf(a.tag) !== -1 && disjointTypes.indexOf(b.tag) !== -1) {
            //     return a.tag === b.tag ? voidT : a
            // }
            const isDisjoint1 = h.isTyPrimOneOf2(["Int", "Bool", "Type", "Str", "Char", "Nil"])
            const isDisjoint2 = (a: AddrQ) => isTySingleStr(a) || isTyFun(a) || isDisjoint1(a)
            if (isDisjoint1(a) && isDisjoint1(b)) {
                if (h.name_ty(a) === h.name_ty(b)) {
                    return tyPrim0("Void", depthZero)
                }
                else {
                    return a
                }
            }
            if (isDisjoint2(a) && isDisjoint2(b)) {
                // { TySingleStr \ TySingleStr } and { TyFun \ TyFun } have been handled earlier, 
                // These types must be disjoint, so A remains intact.
                return a
            }

            // if ((a.tag === "TList" || a.tag === "TPair") && disjointTypes.indexOf(b.tag) !== -1) {
            //     return a
            // }
            if ((isPrim("List", a) || isTyPair(a)) && isDisjoint2(b)) return a

            // // TODO ? handle { (Rec A) \ (Rec B) }
            // if (a.tag === "TRec") {
            //     let a1 = unrollRecursiveType(a)
            //     return typeRelComp(a1, b)
            // }
            // if (b.tag === "TRec") {
            //     let b1 = unrollRecursiveType(b)
            //     return typeRelComp(a, b1)
            // }
            if (isPrim("Fix", a)) {
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    const aUnrolled = unrollRecursiveType(aLam)
                    const rc = tyOp2("{\\}", aUnrolled, b, depth)
                    return rc
                }
            }
            if (isPrim("Fix", b)) {
                const bLam = dOf(arg0_ty(b))
                if (isTmLam(bLam)) {
                    const bUnrolled = unrollRecursiveType(bLam)
                    const rc = tyOp2("{\\}", a, bUnrolled, depth)
                    return rc
                }
            }


            // if (b.tag === "TRule" && b.name === "relcompT" && b.args[0].tag === "TAny") {
            //     let t1 = intersectTypes(a, b.args[1])
            //     return t1
            // }
            if (isPrim("{\\}", b)) {
                const b0 = dOf(arg0_ty(b))
                if (isPrim("Any", b0)) {
                    const b1 = dOf(arg1_ty(b))
                    const t = tyOp2("{&}", a, b1, depth)
                    return t
                }
            }



            if (isReducedToType(a) && isReducedToType(b)) {
                return true
            }
            // if (isNotType(a) || isNotType(b)) {
            //     return false
            // }
            return null
        })

        builtinTypeOp2("<:", [weak, weak], parseTy("Type -> Type -> Type"), (depth, [a0, b0]) => {

            const a = h.directAddrOf(a0)
            const b = h.directAddrOf(b0)

            assumeIsType(a)
            assumeIsType(b)

            if (tiIsFalse(tis.tiStructuralRelComp(a, b)) && tiIsFalse(tis.tiStructuralRelComp(b, a))) {
                // If A and B are structurally equivalent, just return A.
                return a
            }

            // if (equalObjects(type, super1) || type.tag === 'TSub' && equalObjects(type.super, super1)) {
            //     return type
            // }
            if (a === b) return a
            if (isPrim("{<:}", a)) {
                const aSup = h.directAddrOf(arg1_ty(a))
                if (aSup === b) return a
            }

            // if (super1.tag === 'TSub' && equalObjects(type, super1.type)) {
            //     return super1
            // }
            if (isPrim("{<:}", b)) {
                const bSub = dOf(arg0_ty(b))
                if (a === bSub) return b
            }

            // if (super1.tag === 'TAny' /* && typeIsClosed(type)*/) {
            //     return type
            // }
            if (h.isTyAny(b)) return a

            // if (super1.tag === 'TUnknown') {
            //     return type
            // }
            if (isPrim("Unknown", b)) return a

            // if (type.tag === 'TSingle' && super1.tag === 'TStr') {
            //     return type
            // }
            if (isTySingleStr(a) && isPrim("Str", b)) return a

            // if (super1.tag === "TSub") {
            //     // Keep the super-most type at the root of the type.
            //     // This ensures the rules related to self-ref super-types are invoked
            //     //   as needed when projecting from sub-types of self-ref types.
            //     // e.g. { Tail { A <: B <: SomeSelfRefType } }
            //     return subT(subT(type, super1.type), super1.super)
            // }
            if (isPrim("{<:}", b)) {
                const bSub = dOf(arg0_ty(b))
                const bSup = dOf(arg1_ty(b))
                return tyOp2("{<:}", tyOp2("{<:}", a, bSub, depth), bSup, depth)
            }

            // if (super1.tag === "TVoid") {
            //     // console.log("VOID SUPER-TYPE")
            //     return voidT
            // }
            if (isPrim("Void", b)) return b

            // // if (super1.tag==="TRule" && super1.name==="intersectT") {
            // //     return intersectT(subT(type, super1.args[0]), subT(type, super1.args[1]))
            // // }


            if (isReducedToType(a) && isReducedToType(b)) {
                return true
            }
            if (isNotType(a) || isNotType(b)) {
                return false
            }

            return null
        })

        builtinTypeOp2(":>", [weak, weak], parseTy("Type -> Type -> Type"), (depth, [a0, b0]) => {

            const a = h.directAddrOf(a0)
            const b = h.directAddrOf(b0)

            // if (equalType(type, sub) || type.tag === 'TSuper' && equalType(type.sub, sub)) {
            //     return type
            // }
            if (a === b) return a
            if (isPrim("{:>}", a)) {
                const aSub = h.directAddrOf(arg1_ty(a))
                if (aSub === b) return a
            }

            // if (sub.tag === 'TVoid' /* && typeIsClosed(type)*/) {
            //     return type
            // }
            if (isPrim("Void", b)) return a

            // if (type.tag === 'TAny') {
            //     return type
            // }
            if (isPrim("Any", a)) return a

            if (isPrim("Any", b)) return b

            if (isReducedToType(a) && isReducedToType(b)) {
                return true
            }
            if (isNotType(a) || isNotType(b)) {
                return false
            }

            return null
        })


        builtinId("Hd", [weak], parseTy("Type -> Type"), (depth, [a0]/*, ki*/) => {
            // ki = kiTrue
            const a = h.directAddrOf(a0)
            if (h.isTyPair(a) /*&& (ki || tiIsTrue(tis.tiStructural(h.tl_ty(a))))*/) {
                return h.hd_ty(a)
            }
            if (h.isPrim("List", a)) return h.arg0_ty(a)
            if (h.isPrim("Any", a)) return a
            if (h.isPrim("Void", a)) return a
            if (h.isPrim("Error", a)) return a
            if (h.isPrim("Nil", a)) return h.tyPrim0("Void", depthZero)
            if (h.isPrim("{<:}", a)) {
                const a0 = h.arg0_ty(a)
                const a1 = h.arg1_ty(a)
                return h.tyOp2("{<:}", h.tyHead(a0, depth), h.tyHead(a1, depth), depth)
            }
            if (h.isPrim("{:>}", a)) {
                const a_sup = h.arg0_ty(a)
                const a_sub = h.arg1_ty(a)
                return h.tyOp2("{:>}", h.tyHead(a_sup, depth), h.tyHead(a_sub, depth), depth)
            }
            if (h.isPrim("{|}", a)) {
                const a0 = h.arg0_ty(a)
                const a1 = h.arg1_ty(a)
                return h.tyOp2("{|}", h.tyHead(a0, depth), h.tyHead(a1, depth), depth)
            }
            if (h.isPrim("Fix", a)) {
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    // const aLamBody = dOf(body_tm(aLam))
                    const aUnroll = unrollRecursiveType(aLam)
                    const result = tyPrim1("Hd", aUnroll, depth)
                    return result
                }
            }

            if (h.isPrim("Self", a)) {
                // TODO ? When computing the Hd/Tl of a self-dependent type,
                // TODO ?   use the user-provided type of the lambda-var, rather than substituting Unknown into the body.

                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    // The result makes reference to the original Self,
                    //   so needs to exist at the same depth.
                    const lamDepth = depth
                    const varDepth = depthInc(lamDepth)
                    const unknownVarTy = h.tyVar(varDepth)
                    const unknownTy = h.tyOp2("{<:}", unknownVarTy, a, varDepth)
                    const unknownTm = unknownTerm(unknownTy, varDepth)
                    const selfUnknownTm = h.tmApply(aLam, unknownTm, varDepth)
                    assumeIsType(selfUnknownTm)
                    const tlUnknownTm = h.tyPrim1("Tl", selfUnknownTm, varDepth, h.tyPrim1("Tl", a, varDepth))
                    const self2Var = h.tmVar([], varDepth, h.tyPrim1("Hd", a, varDepth))
                    const pairUnknownTy = h.tyPair(h.tyPrim1("Tl", a, varDepth), tlUnknownTm, varDepth)
                    const pairUnknownTm = unknownTerm(pairUnknownTy)
                    const self2Body = h.tmApply(aLam, pairUnknownTm, varDepth)
                    assumeIsType(self2Body)
                    const tlSelf2Body = h.tyPrim1("Hd", self2Body, varDepth)
                    const self2Lam = h.tmLam(false0, false0, self2Var, tlSelf2Body, lamDepth, typeType)
                    const self2 = h.tyPrim1("Self", self2Lam, lamDepth)
                    return self2
                }
                return null
            }


            if (isNotTyPair(a)) {
                return h.tyPrim0("Void", depthZero)
            }
            if (h.isTyVar(a)) {
                return null
            }
            if (h.isPrim("Unknown", a)) {
                return a
            }

            if (isNotType(a)) {
                return false
            }
            return null
        })
        builtinId("Tl", [weak], parseTy("Type -> Type"), (depth, [a0]/*, ki*/): ActionResult => {
            // ki = kiTrue
            const a = h.directAddrOf(a0)
            if (h.isTyPair(a) /* && (ki || isTyInhabited(h.hd_ty(a)))*/) {
                return h.tl_ty(a)
            }
            if (h.isPrim("List", a)) return a
            if (h.isPrim("Any", a)) return a
            if (h.isPrim("Void", a)) return a
            if (h.isPrim("Error", a)) return a
            if (h.isPrim("Nil", a)) return h.tyPrim0("Void", depthZero)
            if (h.isPrim("{<:}", a)) {
                const a0 = h.arg0_ty(a)
                const a1 = h.arg1_ty(a)
                // TODO handle { ... <: (Self ...) }
                return h.tyOp2("{<:}", h.tyTail(a0, depth), h.tyTail(a1, depth), depth)
            }
            if (h.isPrim("{:>}", a)) {
                const a0 = h.arg0_ty(a)
                const a1 = h.arg1_ty(a)
                return h.tyOp2("{:>}", h.tyTail(a0, depth), h.tyTail(a1, depth), depth)
            }
            if (h.isPrim("{|}", a)) {
                const a0 = h.arg0_ty(a)
                const a1 = h.arg1_ty(a)
                return h.tyOp2("{|}", h.tyTail(a0, depth), h.tyTail(a1, depth), depth)
            }
            if (h.isPrim("Fix", a)) {
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    // const aLamBody = dOf(body_tm(aLam))
                    const aUnroll = unrollRecursiveType(aLam)
                    const result = tyPrim1("Tl", aUnroll, depth)
                    return result
                }
            }


            if (h.isPrim("Self", a)) {
                // TODO ? When computing the Hd/Tl of a self-dependent type,
                // TODO ?   use the user-provided type of the lambda-var, rather than substituting Unknown into the body.
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    const lamDepth = depth
                    const varDepth = depthInc(lamDepth)
                    const unknownVarTy = h.tyVar(varDepth)
                    const unknownTy = h.tyOp2("{<:}", unknownVarTy, a, varDepth)
                    const unknownTm = unknownTerm(unknownTy, varDepth)
                    const selfUnknownTm = h.tmApply(aLam, unknownTm, varDepth)
                    assumeIsType(selfUnknownTm)
                    const hdUnknownTm = h.tyPrim1("Hd", selfUnknownTm, varDepth, h.tyPrim1("Hd", a, varDepth))
                    const tlUnknownTm = h.tmVar([], varDepth, h.tyPrim1("Tl", a, varDepth))
                    const self2Var = h.tmVar([], varDepth, h.tyPrim1("Tl", a, varDepth))
                    const pairUnknownTy = h.tyPair(hdUnknownTm, h.tyPrim1("Tl", a, varDepth), varDepth)
                    const pairUnknownTm = unknownTerm(pairUnknownTy)
                    const self2Body = h.tmApply(aLam, pairUnknownTm, varDepth)
                    assumeIsType(self2Body)
                    const tlSelf2Body = h.tyPrim1("Tl", self2Body, varDepth)
                    const self2Lam = h.tmLam(false0, false0, self2Var, tlSelf2Body, lamDepth, typeType)
                    const self2 = h.tyPrim1("Self", self2Lam, depth)
                    return self2
                }
                return null
            }


            if (isNotTyPair(a)) {
                return h.tyPrim0("Void", depthZero)
            }
            if (h.isTyVar(a)) {
                return null
            }
            if (h.isPrim("Unknown", a)) {
                return a
            }

            if (isNotType(a)) {
                return false
            }
            return null
        })



        builtinId("Elem", [weak], parseTy("Type -> Type"), (depth, [a0]) => {
            const a = h.directAddrOf(a0)

            // TODO

            assumeIsType(a)


            // if (tiIsFalse(tiStructural(arg))) {
            //     return voidT
            // }
            if (tiIsFalse(tis.tiStructural(a))) {
                return tyPrim0("Void", depthZero)
            }

            // switch (arg.tag) {
            //     case "TList":
            //         return arg.elem
            if (isPrim("List", a)) {
                const aElem = dOf(arg0_ty(a))
                return aElem
            }

            //     case "TNil":
            //         return voidT
            if (isPrim("Nil", a)) {
                return tyPrim0("Void", depthZero)
            }

            //     case "TPair": {
            //         let hd = arg.hd
            //         let [ok1, tl] = reduceTypeRule(ruleName, [arg.tl])
            //         let [ok2, u] = reduceTypeRule("unionT", [hd, tl])
            //         return u
            //     }
            if (isTyPair(a)) {
                const aHd = dOf(hd_ty(a))
                const aTl = dOf(tl_ty(a))
                const aTlElem = tyPrim1("Elem", aTl, depth)
                const aElem = tyOp2("{|}", aHd, aTlElem, depth)
                return aElem
            }

            //     case "TAny":
            //         return anyT
            if (isPrim("Any", a)) {
                return tyPrim0("Any", depthZero)
            }

            //     case "TVoid":
            //         return voidT
            if (isPrim("Void", a)) {
                return tyPrim0("Void", depthZero)
            }

            //     case "TError":
            //         return errorT
            if (isPrim("Error", a)) {
                return tyPrim0("Error", depthZero)
            }

            //     case 'TSub': {
            //         let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            //         let [ok2, t2] = reduceTypeRule(ruleName, [arg.super])
            //         if (TRACK_TYPE_INHABITATION) {
            //             if (tiIsTrue(tiStructural(arg.type)) && tiIsTrue(tiStructural(t2))) {
            //                 t1 = knownInhabited(t1)
            //                 t2 = knownInhabited(t2)
            //                 let result = subT(t1, t2)
            //                 result = knownInhabited(result)
            //                 return result
            //             }
            //         }
            //         return subT(t1, t2)
            //     }
            if (isPrim("{<:}", a)) {
                const aSub = dOf(arg0_ty(a))
                const aSup = dOf(arg1_ty(a))
                const aSubElem = tyPrim1("Elem", aSub, depth)
                const aSupElem = tyPrim1("Elem", aSup, depth)
                const result = tyOp2("{<:}", aSubElem, aSupElem, depth)
                return result
            }

            //     case 'TSuper': {
            //         let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            //         let [ok2, t2] = reduceTypeRule(ruleName, [arg.sub])
            //         return superT(t1, t2)
            //     }
            if (isPrim("{:>}", a)) {
                const aSup = dOf(arg0_ty(a))
                const aSub = dOf(arg1_ty(a))
                const aSupElem = tyPrim1("Elem", aSup, depth)
                const aSubElem = tyPrim1("Elem", aSub, depth)
                const result = tyOp2("{:>}", aSupElem, aSubElem, depth)
                return result
            }

            //     case "TRec": {
            //         let [ok, ty] = reduceTypeRule(ruleName, [unrollRecursiveType(arg)])
            //         return ty
            //     }
            if (isPrim("Fix", a)) {
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    const aLamBody = dOf(body_tm(aLam))
                    const aUnroll = unrollRecursiveType(aLam)
                    const result = tyPrim1("Elem", aUnroll, depth)
                    return result
                }
            }


            //     case "TType":
            //         return voidT
            if (isPrim("Type", a)) {
                return tyPrim0("Void", depthZero)
            }

            //     case "TAs":
            //         return typeElem(arg.type)

            //     case "TSelf": {
            //         let ty = unknownT
            //         // let ty = anyT
            //         // let ty = knownInhabited(unknownT)
            //         let arg_type = substType(arg.body, arg.name, ty, true)
            //         return typeElem(arg_type)
            //     }
            if (isPrim("Self", a)) {
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    const lamDepth = h.depthOf(aLam)
                    const varDepth = depthInc(lamDepth)
                    const env: SubstEnv = new Map
                    const ty = tyPrim0("Unknown", depthZero)
                    const aBody = dOf(body_tm(aLam))
                    const aUnroll = subst.substTmTy(lamDepth, varDepth, env, ty, aBody)
                    assumeIsType(aUnroll)
                    const result = tyPrim1("Elem", aUnroll, depth)
                    return result
                }
            }

            //     case "TUnknown":
            //         return unknownT
            if (isPrim("Error", a)) {
                return tyPrim0("Error", depthZero)
            }

            //     case "TRule": {
            //         switch (arg.name) {
            //             case "unionT": {
            //                 let [ok1, t1] = reduceTypeRule(ruleName, [arg.args[0]])
            //                 let [ok2, t2] = reduceTypeRule(ruleName, [arg.args[1]])
            //                 return unionTypes(t1, t2)
            //             }
            //         }
            //     }
            // }
            if (isPrim("{|}", a)) {
                const a0 = dOf(arg0_ty(a))
                const a1 = dOf(arg1_ty(a))
                const a0Elem = tyPrim1("Elem", a0, depth)
                const a1Elem = tyPrim1("Elem", a1, depth)
                const result = tyOp2("{|}", a0Elem, a1Elem, depth)
                return result
            }



            if (isReducedToType(a)) {
                return true
            }
            if (isNotType(a)) {
                return false
            }

            return null
        })




        builtinId("Dom", [weak], parseTy("Type -> Type"), (depth, args): ActionResult => {
            const a = h.directAddrOf(args[0])



            // case "TFun": {
            //     let dom = convertPatTypeClosed(arg.argType)
            //     if (dom.tag === "TTerm" || dom.tag === "TTermVar") {
            //         // the term part of a TTerm is not permitted/intended to narrow the type
            //         // e.g. 
            //         //     { {i:Int} -> ... } 
            //         // "i" could be any Int
            //         // but 
            //         //     { {5: Int} -> ... }
            //         // doesn't make sense, should be caught as a type error already
            //         dom = dom.type
            //     }
            //     return dom
            // }
            if (h.isTyFun(a)) {
                // TODO substitute something in for the parameter
                // if the domain depth is deeper than the TyFun depth, then is contains the TyVar
                // TODO construct a (Self ...) type
                {
                    const dom = h.directAddrOf(h.dom_ty(a))
                    const funDepth = h.depthOf(a)
                    const varDepth = depthInc(funDepth)
                    const domDepth = h.depthOf(dom)
                    if (domDepth <= funDepth) {
                        return dom
                    }
                    if (isTyVarNotUsed(varDepth, dom)) {
                        // The variable is not present, but the depth is too deep to just return as-is.
                        // Substituting "Unknown" for the not-present variable will bring the graph to a usable depth.
                        // TODO ? Just fall-through and return a (Self <| a -> ...), 
                        // TODO ?   make it the Self-operator's responsibility to remove itself if nothing uses the bound variable.
                        const result = subst.substTmTy(funDepth, varDepth, new Map, tyPrim0("Unknown", depthZero), dom)
                        return result
                    }
                    if (h.isPrim("{<:}", dom)) {
                        const sub = h.directAddrOf(h.arg0_ty(dom))
                        const sup = h.directAddrOf(h.arg1_ty(dom))
                        if (h.isTyVar(sub)) {
                            const depthOfVar = h.depthOf(sub)
                            if (depthOfVar === funDepth + 1) {
                                return sup
                            }
                            // else {
                            //     return h.tyOp1("Self", dom, depthOfFun)
                            // }
                        }
                    }

                    // const selfLam = h.tmLam(false0, false0, h.tmVar([], depthInc(funDepth), typeType), dom, funDepth, typeType)
                    const selfTyVar = h.tyVar(depthInc(funDepth), typeType)
                    const selfTmVar = h.tmVar([], depthInc(funDepth), selfTyVar)
                    const selfLamTy = h.tyFun(addrNo, addrNo, selfTyVar, typeType, funDepth)
                    const selfLam = h.tmLam(false0, false0, selfTmVar, dom, funDepth, selfLamTy)
                    return h.tyPrim1("Self", selfLam, depth)
                }
            }



            // // switch sub-type <-> super-type when accessing function domain
            // case 'TSub': {
            //     let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            //     let [ok2, t2] = reduceTypeRule(ruleName, [arg.super])
            //     return superT(t1, t2)
            // }
            if (h.isPrim("{<:}", a)) {
                return h.tyOp2("{:>}", h.tyPrim1("Dom", h.arg0_ty(a), depth), h.tyPrim1("Dom", h.arg1_ty(a), depth), depth)
            }


            // case 'TSuper': {
            //     let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            //     let [ok2, t2] = reduceTypeRule(ruleName, [arg.sub])
            //     return subT(t1, t2)
            // }
            if (h.isPrim("{:>}", a)) {
                return h.tyOp2("{<:}", h.tyPrim1("Dom", h.arg0_ty(a), depth), h.tyPrim1("Dom", h.arg1_ty(a), depth), depth)
            }

            // case 'TAny':
            //     // there is no value we can definitely call this function with
            //     return voidT
            if (h.isPrim("Any", a)) {
                return h.tyPrim0("Void", depthZero)
            }

            // case 'TVoid':
            //     // Void is all things to all people, so can be called with anything
            //     return anyT
            if (h.isPrim("Void", a)) {
                return h.tyPrim0("Any", depthZero)
            }

            // case "TError":
            //     return anyT
            if (h.isPrim("Error", a)) {
                return h.tyPrim0("Error", depthZero)
            }

            // case "TRec":
            //     return typeDom(unrollRecursiveType(arg))
            if (isPrim("Fix", a)) {
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    const aLamBody = dOf(body_tm(aLam))
                    const aUnroll = unrollRecursiveType(aLam)
                    const result = tyPrim1("Dom", aUnroll, depth)
                    return result
                }
            }

            // case "TSelf": {
            //     let ty = unknownT
            //     // let ty = anyT
            //     // let ty = knownInhabited(unknownT)
            //     let f = substType(arg.body, arg.name, ty, true)
            //     let d = typeDom(f)
            //     return d
            // }
            if (isPrim("Self", a)) {
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    const lamDepth = h.depthOf(aLam)
                    const varDepth = depthInc(lamDepth)
                    const env: SubstEnv = new Map
                    const ty = tyPrim0("Unknown", depthZero)
                    const aBody = dOf(body_tm(aLam))

                    // const aUnroll = subst.substTmTy(lamDepth, varDepth, env, ty, aBody)
                    // assumeIsType(aUnroll)
                    // const result = tyOp1("Dom", aUnroll)
                    // return result

                    // perform the Dom under the self-lambda, and re-enclose within a new self-lambda.
                    assumeIsType(aBody)
                    const self2Body = tyPrim1("Dom", aBody, varDepth)
                    const self2VarTy = tyAny
                    const self2Var = h.tmVar([], varDepth, self2VarTy)
                    const self2Lam = tmLam(false0, false0, self2Var, self2Body, lamDepth, tyFun(addrNo, addrNo, tyAny, typeType, depthZero))
                    const self2 = tyPrim1("Self", self2Lam, depth)
                    return self2
                }
            }


            // case "TAs": {
            //     return typeDom(arg.type)
            // }
            // case "TRule": {
            //     switch (arg.name) {
            //         case "intersectT": {
            //             let [ok1, t1] = reduceTypeRule("domainT", [arg.args[0]])
            //             let [ok2, t2] = reduceTypeRule("domainT", [arg.args[1]])
            //             let [ok3, t3] = reduceTypeRule("unionT", [t1, t2])
            //             return t3
            //         }
            if (isPrim("{&}", a)) {
                const a0Dom = tyPrim1("Dom", dOf(arg0_ty(a)), depth)
                const a1Dom = tyPrim1("Dom", dOf(arg1_ty(a)), depth)
                const result = tyOp2("{|}", a0Dom, a1Dom, depth)
                return result
            }

            //         case "unionT": {
            //             let [ok1, t1] = reduceTypeRule("domainT", [arg.args[0]])
            //             let [ok2, t2] = reduceTypeRule("domainT", [arg.args[1]])
            //             let [ok3, t3] = reduceTypeRule("intersectT", [t1, t2])
            //             return t3
            //         }
            //     }
            // }
            if (isPrim("{|}", a)) {
                const a0Dom = tyPrim1("Dom", dOf(arg0_ty(a)), depth)
                const a1Dom = tyPrim1("Dom", dOf(arg1_ty(a)), depth)
                const result = tyOp2("{&}", a0Dom, a1Dom, depth)
                return result
            }


            if (isReducedToType(a)) {
                return true
            }
            if (isNotType(a)) {
                return false
            }

            return null
        })

        builtinId("Cod", [weak], parseTy("Type -> Type"), (depth, args) => {
            // const a = heap.deref(args[0]).node
            // if (a.tag === "TyFun") {
            //     // TODO substitute something in for the parameter
            //     return () => a.cod
            // }

            const a = h.directAddrOf(args[0])


            // case "TFun": {
            //     let env = matchTypes(arg.argType, convertPatTypeClosed(arg.argType))
            //     let codomain = substTypeEnv(arg.resultType, env, true)
            //     return codomain
            // }
            if (h.isTyFun(a)) {
                // return () => h.tyApply(a, h.dom_ty(a))
                const argTm = addrNo
                return h.tyApply(a, h.tyPrim1("Dom", a, depth))
            }

            // case 'TSub': {
            //     let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            //     // TODO ? perhaps, instead of taking the Codomain of the super-type,
            //     // TODO ?   apply the domain of the sub-type to the super-type ?
            //     // let [ok2, t2] = reduceTypeRule(ruleName, [arg.super])
            //     // return subT(t1, t2)
            //     // A sub-type of a function may have broader domain than the super-type.
            //     // The sub-type may have a narrower codomain than the super-type, where the domains match.
            //     // For the parts of the sub-types domain which lie outside the super-types domain,
            //     //   the sub-types codmain need not have any relationship with the super-types codomain.
            //     // This is why the subT(t1, t2) line has been commented out above.
            //     // Generally rather than asking for the codomain of a function, 
            //     //   it is more precise to ask what a function would return for a given input.
            //     // i.e. use {F A} instead of (Codomain F)
            //     return t1
            //     // TODO ? Perhaps we should compare the domains of the sub and super types ?
            //     // TODO ? If the domain of the sub-type is no broader than the super-type (despite being allowed to be),
            //     // TODO ?   then it is valid to assume that the codomain of the sub-type is also a sub-type of the codomain of the super-type.
            //     // TODO ? In that particular case it would be valid to reinstate the subT(t1,t2) line above.
            //     // TODO ? Things see fine as they are for now though.
            // }
            if (h.isPrim("{<:}", a)) {
                const sub = dOf(h.arg0_ty(a))
                const sup = dOf(h.arg1_ty(a))
                // if (h.isTyFun(sup)) { // TODO ? Do we need this test ?
                //     // return () => h.tyApply(sup, h.tyOp1("Cod", sub))
                //     return () => h.tyApply(sup, h.tyOp1("Dom", sub))
                // }
                return h.tyPrim1("Cod", sub, depth)
            }

            // case 'TSuper': {
            //     let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            //     let [ok2, t2] = reduceTypeRule(ruleName, [arg.sub])
            //     return superT(t1, t2)
            //     // return t1
            // }
            if (h.isPrim("{:>}", a)) {
                const sup = dOf(h.arg0_ty(a))
                const sub = dOf(h.arg1_ty(a))
                const supCod = tyPrim1("Cod", sup, depth)
                const subCod = tyPrim1("Cod", sub, depth)
                return tyOp2("{:>}", supCod, subCod, depth)
            }

            // case "TAny":
            //     return anyT
            if (h.isPrim("Any", a)) {
                return h.tyPrim0("Any", depthZero)
            }

            // case "TVoid":
            //     return voidT
            if (h.isPrim("Void", a)) {
                return h.tyPrim0("Void", depthZero)
            }

            // case "TError":
            //     return errorT
            if (h.isPrim("Error", a)) {
                return h.tyPrim0("Error", depthZero)
            }

            // case 'TRule':
            //     switch (arg.name) {
            //         case 'intersectT':
            //             // return intersectTypes(typeRng(arg.args[0]), typeRng(arg.args[1]))
            //             return unionTypes(typeRng(arg.args[0]), typeRng(arg.args[1]))
            if (isPrim("{&}", a)) {
                const a0Cod = tyPrim1("Cod", dOf(arg0_ty(a)), depth)
                const a1Cod = tyPrim1("Cod", dOf(arg1_ty(a)), depth)
                const result = tyOp2("{|}", a0Cod, a1Cod, depth)
                return result
            }

            //         case 'unionT':
            //             return unionTypes(typeRng(arg.args[0]), typeRng(arg.args[1]))
            if (isPrim("{|}", a)) {
                const a0Cod = tyPrim1("Cod", dOf(arg0_ty(a)), depth)
                const a1Cod = tyPrim1("Cod", dOf(arg1_ty(a)), depth)
                const result = tyOp2("{|}", a0Cod, a1Cod, depth)
                return result
            }

            // case "TRec":
            //     return typeRng(unrollRecursiveType(arg))
            if (isPrim("Fix", a)) {
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    const aLamBody = dOf(body_tm(aLam))
                    const aUnroll = unrollRecursiveType(aLam)
                    const result = tyPrim1("Cod", aUnroll, depth)
                    return result
                }
            }


            // case "TSelf": {
            //     let ty = unknownT
            //     // let ty = anyT
            //     // let ty = knownInhabited(unknownT)
            //     let f = substType(arg.body, arg.name, ty, true)
            //     let r = typeRng(f)
            //     return r
            // }
            if (isPrim("Self", a)) {
                const aLam = dOf(arg0_ty(a))
                if (isTmLam(aLam)) {
                    const lamDepth = h.depthOf(aLam)
                    const varDepth = depthInc(lamDepth)
                    const env: SubstEnv = new Map
                    const ty = tyPrim0("Unknown", depthZero)
                    const aBody = dOf(body_tm(aLam))
                    const aUnroll = subst.substTmTy(lamDepth, varDepth, env, ty, aBody)
                    assumeIsType(aUnroll)
                    const result = tyPrim1("Cod", aUnroll, depth)
                    return result
                }
            }




            if (isReducedToType(a)) {
                return true
            }
            if (isNotType(a)) {
                return false
            }

            return null
        })


        // The "termOf" function is not intended be used directly by the user.
        // Conceptually, "termOf" returns every term within a type, each in its own parallel world.
        // So long as it is only used with singleton types, we can stick to a single conventional world.
        // If applied to anything else, it refuses to reduce.
        builtinId("termOf", [weak], parseTy("{ A : Type } -> A"), (depth, [a0]): ActionResult => {
            const a = h.directAddrOf(a0)
            if (isPrim("Single", a)) {
                const arg = h.directAddrOf(h.arg0_of(a))
                return arg
            }
            if (isTySingleStr(a)) {
                const value = h.value_ty(a)
                const term = h.tmDatum(value, depthZero, a)
                return term
            }
            return null
        })

        builtinId("Single", [weak], parseTy("Any -> Type"), () => {
            // "Single" acts as a type-constructor.
            return true
        })


        builtinId("Apply", [weak, weak], parseTy("Type -> Type -> Type"), (depth, [funcTyAddr, argTyAddr]): ActionResult => {
            const func = h.directAddrOf(funcTyAddr)
            const argTm = addrNo // This is a non-dependent type application.
            const argTy = h.directAddrOf(argTyAddr)
            assumeIsType(func)
            assumeIsType(argTy)

            return ga.apply_funTy_argTy(depth, func, argTy)
        })


        builtinId("InverseApply", [weak, weak], parseTy("Type -> Type -> Type"), (depth, [funcAddr, argAddr]): ActionResult => {

            const func = dOf(funcAddr)
            const arg = dOf(argAddr)

            assumeIsType(func)
            assumeIsType(arg)

            if (isTyFun(func)) {
                // const dom = dom_ty(func)
                const dom = tyPrim1("Dom", func, depth)
                // Just return the domain for now,
                // TODO Check the no-domain and yes-domain
                // TODO ? Check how the codomain relates to the co-argument (inside, overlap, disjoint)
                // TODO ?   inside => return the domain.  (the function can be relied upon to return a result within the co-argument-type)
                // TODO ?   disjoint => return void.      (there's no value this function can be called with which will result in a value within the co-argument type)
                // TODO ?   overlap => return Unknown ? (or just leave unreduced)

                // The result of InverseApply on a plain function should be
                //   the domain intersected with one of Any, Unknown or Void,
                //   depending on the relationship between the codomain and the coargument.
                //   So
                //     (InverseApply { D -> C } A)
                //   Reduces to
                //     D & { (Hd { [Any ,, { C \ A } -> Void ] }) | (Hd { [Unknown ,, A & C] }) }

                // { D & Unknown } is still potentially useful as a synthesized type (not sure we'll ever need it to be though).
                // { D & Unknown } is useless as a context type, as nothing can be seen to fit within an Unknown.

                return dom
            }

            if (h.isPrim("Self", func) && h.isTyFun(arg)) {
                const funcSelfLam = h.directAddrOf(h.arg0_ty(func))
                if (h.isTmLam(funcSelfLam)) {
                    const funcSelfBody = h.directAddrOf(h.body_tm(funcSelfLam))
                    const selfLamVarDepth = depthInc(h.depthOf(funcSelfLam))
                    const fun1Depth = depth
                    const var1Depth = depthInc(fun1Depth)
                    const var1Ty = h.tyVar(var1Depth)
                    const var1Tm = h.tmVar([], var1Depth, var1Ty)
                    const fun1 = h.tyFun(addrNo, addrNo, h.tyPrim1("Dom", var1Ty, var1Depth), arg, fun1Depth)
                    const appDepth = depth
                    const substEnv: SubstEnv = new Map
                    const selfVar = h.tmVar([], var1Depth, fun1)
                    substEnv.set(h.pathKey_root, selfVar)
                    const fun2 = subst.substTmTy(appDepth, selfLamVarDepth, substEnv, fun1, funcSelfBody) as TypeAddr
                    const self2Body = fun2
                    const self2Lam = h.tmLam(false0, false0, var1Tm, self2Body, fun1Depth, h.tyFun(addrNo, addrNo, h.tyPrim0("Any", depthZero), h.tyPrim0("Type", depthZero), depthZero))
                    const self2 = h.tyPrim1("Self", self2Lam, depth, h.tyPrim0("Type", depthZero))
                    assumeIsType(self2)
                    const domSelf = h.tyPrim1("Dom", self2, depth)
                    return domSelf
                }
            }


            if (isPrim("{<:}", func)) {
                const fSub = dOf(arg0_ty(func))
                const fSup = dOf(arg1_ty(func))
                const fSubIa = tyPrim2("InverseApply", fSub, arg, depth)
                const fSupIa = tyPrim2("InverseApply", fSup, arg, depth)
                const result = tyOp2("{:>}", fSubIa, fSupIa, depth)
                return result
            }

            if (isPrim("{&}", func)) {
                const funA = dOf(arg0_ty(func))
                const funB = dOf(arg1_ty(func))
                if (isTyFun(funA) && isTyFun(funB)) {
                    const codA = dOf(cod_ty(funA))
                    const codB = dOf(cod_ty(funB))
                    const domA = dOf(dom_ty(funA))
                    const domB = dOf(dom_ty(funB))
                    const rcA = tis.tiStructuralRelComp(codA, arg)
                    const rcB = tis.tiStructuralRelComp(codB, arg)
                    if (tiIsFalse(rcA) && tiIsFalse(rcB)) {
                        return tyOp2("{|}", domA, domB, depth)
                    }
                    if (tiIsFalse(rcA) && tiIsTrue(rcB)) {
                        return domA
                    }
                    if (tiIsTrue(rcA) && tiIsFalse(rcB)) {
                        return domB
                    }
                }
            }

            if (isPrim("Any", arg)) {
                const domF = tyPrim1("Dom", func, depth)
                return domF
            }

            return null
        })


        // const primType_if = defType("Type_if", "Bool -> K @ [ -> Any, -> Any] -> (Cod (Hd K)) | (Cod (Hd (Tl K)))")
        const primType_if = defType("Type_if", "Bool -> K @ [ -> Any, -> Any] -> (Hd K) [] | (Hd (Tl K)) []")
        // const primType_if = defType("Type_if", "Bool -> K @ [ -> Any, -> Any] -> (Codomain (Elem K))")
        // const primType_if = defType("Type_if", "Bool -> K @ [ -> Any, -> Any] -> (Elem K) []")
        // const primType_if = tyUnknown

        const nilTerm = h.tmDatum(null)
        env.set("nil", nilTerm)
        const breakTerm = h.tmDatum("break")
        env.set("break", breakTerm)
        const continueTerm = h.tmDatum("continue")
        env.set("continue", continueTerm)

        env.set("true", h.tmDatum(true))
        env.set("false", h.tmDatum(false))

        // We should only ever encounter an "unknown" term within a type,
        //   it shouldn't be available to users.
        function unknownTerm(ty: TypeAddr, depth?: Depth): Addr {
            depth ??= h.depthOf(ty)
            return h.tmOp0("unknown", depth, ty)

        }


        function mkBoolBoolToBool(name: string, op: (a: boolean, b: boolean) => boolean): unit {
            builtinTermOp(name, [weak, weak], parseTy("Bool -> Bool -> Bool"), (depth, [a, b]): ActionResult => {
                const aTm = dOf(a)
                const bTm = dOf(b)
                if (h.isTmDatum(aTm) && h.isTmDatum(bTm)) {
                    const aVal = h.datum_tm(aTm)
                    const bVal = h.datum_tm(bTm)
                    if (typeof (aVal) === "boolean" && typeof (bVal) === "boolean") {
                        return h.tmDatum(op(aVal, bVal))
                    }
                    return false
                }
                // TODO if A or B is reduced to something clearly not a datum, return false.
                return null
            })
        }


        function nodeIsValue(a0: Addr): boolean {
            const a = h.directAddrOf(a0)
            if (h.isTmDatum(a) || h.isTmPair(a) || h.isTmLam(a)) {
                return true
            }
            else if (h.isReducedToType(a)) {
                return true
            }
            else {
                return false
            }
        }

        function derefTuple2(addr: Addr, result: Addr[]): boolean {
            const a = dOf(addr)
            if (!h.isTmPair(a)) return false
            const b = dOf(h.tl_tm(a))
            if (!h.isTmPair(b)) return false
            const c = dOf(h.tl_tm(b))
            if (!h.isTmDatum(c)) return false
            const aHd = dOf(h.hd_tm(a))
            const bHd = dOf(h.hd_tm(b))
            result.push(aHd, bHd)
            return true
        }

        function datumEq(a0: Addr, b0: Addr): boolean | null {
            const a = dOf(a0)
            const b = dOf(b0)
            if (!(nodeIsValue(a) && nodeIsValue(b))) {
                return null
            }
            else {
                if (!(h.isTmDatum(a) && h.isTmDatum(b))) {
                    return false
                }
                else {
                    const aVal = h.datum_tm(a)
                    const bVal = h.datum_tm(b)
                    return aVal === bVal
                }
            }
        }

        function dataEq(aAddr: Addr, bAddr: Addr): boolean | null {
            const a = dOf(aAddr)
            const b = dOf(bAddr)
            if (!(nodeIsValue(a) && nodeIsValue(b))) {
                return null
            }
            if (h.isTmDatum(a) && h.isTmDatum(b)) {
                return h.datum_tm(a) === h.datum_tm(b)
            }
            if (h.isTmPair(a) && h.isTmPair(b)) {
                const hdEq = dataEq(h.hd_tm(a), h.hd_tm(b))
                const tlEq = dataEq(h.tl_tm(a), h.tl_tm(b))
                // TODO ? We could potentially return early if one of hdEq or tlEq is false, and reduction of the other is blocked.
                // TODO ? This would only make a difference when reducing beneath lambdas.
                // TODO ? This could be useful, but we should be careful not to change the termination semantics.
                // TODO ?   ( Need to add an addr to the relevant lambda indicating that 
                // TODO ?     the previously blocked addresses must still be evaluated (after sufficient subsequent substitution), 
                // TODO ?     even though they cannot be reached.
                // TODO ?   )
                // TODO ? Alternatively, termination is the user's responsibility.
                if (hdEq === true && tlEq === true) {
                    return true
                }
                if (hdEq === false && tlEq === false) {
                    return false
                }
            }
            if (h.isTmDatum(a) || h.isTmPair(a) || h.isTmDatum(b) || h.isTmPair(b)) {
                return false
            }
            // any comparison involving only functions and types, remains unreduced / blocked
            return null
        }


        function mkOpDatum2(name: string, aJsTypeOf: string, bJsTypeOf: string, aType: string, bType: string, resultType: string, op: (a: Datum, b: Datum) => Datum): unit {
            const aTy = parseTy(aType)
            const bTy = parseTy(bType)
            const resultTy = parseTy(resultType)
            // const opTy = inst.tyFun(depthZero, null, null, aTy, inst.tyFun(depthZero, null, null, bTy, resultTy))
            const opTy = h.tyFun(addrNo, addrNo, aTy, h.tyFun(addrNo, addrNo, bTy, resultTy, depthZero), depthZero)
            builtinTermOp(name, [weak, weak], opTy, (depth, [a0, b0]) => {
                const a = dOf(a0)
                const b = dOf(b0)
                if (h.isTmDatum(a) && h.isTmDatum(b)) {
                    const aVal = h.datum_tm(a)
                    const bVal = h.datum_tm(b)
                    if (typeof (aVal) === aJsTypeOf && typeof (bVal) === bJsTypeOf) {
                        const result = op(aVal, bVal)
                        // TODO ? Sanity check. We could check that the dynamic "result" fits within the static "resultTy"
                        return h.tmDatum(result, depth, resultTy)
                    }
                }
                return null
            })
        }

        function mkDatum1Action(aJsTypeOf: string, op: (a: Datum) => Datum): Action {
            return (depth, [a0]) => {
                const a = dOf(a0)
                if (h.isTmDatum(a)) {
                    const aVal = h.datum_tm(a)
                    if (typeof (aVal) === aJsTypeOf) {
                        const result = op(aVal)
                        return h.tmDatum(result)
                    }
                }
                return null
            }
        }

        function mkDatum2Action(aJsTypeOf: string, bJsTypeOf: string, op: (a: Datum, b: Datum) => Datum): Action {
            return (depth, [a0, b0]) => {
                const a = dOf(a0)
                const b = dOf(b0)
                if (h.isTmDatum(a) && h.isTmDatum(b)) {
                    const aVal = h.datum_tm(a)
                    const bVal = h.datum_tm(b)
                    if (typeof (aVal) === aJsTypeOf && typeof (bVal) === bJsTypeOf) {
                        const result = op(aVal, bVal)
                        return h.tmDatum(result)
                    }
                }
                return null
            }
        }

        // { { a : Int } -> { b : Int } -> (Single (a + b)) <: Int }
        // { { a : Int } -> { b : Int } -> _ <: Int }
        // { A @ Int -> B @ Int -> A + B <: Int }
        builtinTermOp("+", [weak, weak], parseTy("Int -> Int -> Int"), mkDatum2Action("number", "number", (a: any, b: any) => a + b))
        builtinTermOp("-", [weak, weak], parseTy("Int -> Int -> Int"), mkDatum2Action("number", "number", (a: any, b: any) => a - b))
        builtinTermOp("*", [weak, weak], parseTy("Int -> Int -> Int"), mkDatum2Action("number", "number", (a: any, b: any) => a * b))

        builtinTermOp("<", [weak, weak], parseTy("Int -> Int -> Bool"), mkDatum2Action("number", "number", (a: any, b: any) => a < b))
        builtinTermOp(">", [weak, weak], parseTy("Int -> Int -> Bool"), mkDatum2Action("number", "number", (a: any, b: any) => a > b))
        builtinTermOp("<=", [weak, weak], parseTy("Int -> Int -> Bool"), mkDatum2Action("number", "number", (a: any, b: any) => a <= b))
        builtinTermOp(">=", [weak, weak], parseTy("Int -> Int -> Bool"), mkDatum2Action("number", "number", (a: any, b: any) => a >= b))



        // TODO These operators are unconventionally strict in their second argument.
        // TODO ? We could
        // TODO ?   - Add support for non-strict operators, by modifying findNextRedex.
        // TODO ?       (The support needed for this isn't so different from the support needed for specialization operators).
        // TODO ?       This would be tricky to handle during read-back though. 
        // TODO ?   - Or switch from using:
        // TODO ?       a && b && c
        // TODO ?     to 
        // TODO ?       and [a, -> b, -> c]
        // TODO ?     When non-strict/short-circuited behaviour is desired.
        // TODO ?      This makes the behaviour uniform, only a lambda can delay computation.
        mkBoolBoolToBool("&&", (a, b) => a && b)
        mkBoolBoolToBool("||", (a, b) => a || b)

        builtinTermOp("==", [weak, weak], parseTy("Any -> Any -> Bool"), (depth, [a, b]) => {
            const result = dataEq(a, b)
            if (result === null) {
                return null
            }
            return h.tmDatum(result)
        })
        builtinTermOp("|-", [weak, weak], parseTy("Bool -> A @ Any -> [] | A"), (depth, [a0, b0]) => {
            const a = dOf(a0)
            const b = dOf(b0)
            if (h.isTmDatum(a)) {
                const aVal = h.datum_tm(a)
                if (aVal === true) return b
                if (aVal === false) return nilTerm
            }

            return null
        })
        builtinTermOp("|=", [weak, weak], parseTy("Bool -> A @ Any -> [] | [A]"), (depth, [a0, b0]) => {
            const a = dOf(a0)
            const b = dOf(b0)
            if (h.isTmDatum(a)) {
                const aVal = h.datum_tm(a)
                if (aVal === true) return h.tmPair(b, nilTerm, depth)
                if (aVal === false) return nilTerm
            }
            return null
        })

        builtinId("hd", [weak], parseTy("A @ [Any ,, Any] -> (Hd A)"), (depth, [a0]) => {
            const a = dOf(a0)
            if (h.isTmPair(a)) {
                return h.hd_tm(a)
            }
            return null
        })
        builtinId("tl", [weak], parseTy("A @ [Any ,, Any] -> (Tl A)"), (depth, [a0]) => {
            const a = dOf(a0)
            if (h.isTmPair(a)) {
                return h.tl_tm(a)
            }
            return null
        })


        builtinId("List", [weak], parseTy("Type -> Type"), (depth, [elemAddr]) => {
            const elem = dOf(elemAddr)
            if (h.isReducedToType(elem)) {
                return true
            }
            if (nodeIsValue(elem)) {
                return false
            }
            return null
        })


        builtinId("TupleMap", [weak, weak], parseTy("Type -> Type -> Type"), () => null)
        builtinId("unionT", [weak, weak], parseTy("Type -> Type -> Type"), () => null)
        builtinId("intersectT", [weak, weak], parseTy("Type -> Type -> Type"), () => null)
        // builtinId("Union", [weak], parseType("(List Type) -> Type"), () => null)
        builtinId("Inverse", [weak], parseTy("Type -> Type"), () => null)

        builtinId("if", [weak, weak], primType_if, (depth, [a0, b0], targetForm): ActionResult => {
            const a = dOf(a0)
            const b = dOf(b0)
            if (h.isTmDatum(a)) {
                const aVal = h.datum_tm(a)
                if (typeof (aVal) !== "boolean") return false
                if (h.isTmPair(b)) {
                    const c = dOf(h.tl_tm(b))
                    const bHd = dOf(h.hd_tm(b))
                    if (h.isTmPair(c)) {
                        const cHd = dOf(h.hd_tm(c))
                        if (aVal === true) {
                            return subst.tryApply(depth, bHd, nilTerm, targetForm)
                        }
                        if (aVal === false) {
                            return subst.tryApply(depth, cHd, nilTerm, targetForm)
                        }
                        assert.unreachable()
                    }
                }
            }
            return null
        })

        builtinId("if2", [weak, weak], primType_if, (depth, [a0, b0], targetForm): ActionResult => {
            const a = dOf(a0)
            const b = dOf(b0)
            if (h.isTmDatum(a)) {
                const aVal = h.datum_tm(a)
                if (typeof (aVal) !== "boolean") return false
                if (h.isTmPair(b)) {
                    const c = dOf(h.tl_tm(b))
                    const bHd = dOf(h.hd_tm(b))
                    if (h.isTmPair(c)) {
                        const cHd = dOf(h.hd_tm(c))
                        if (aVal === true) {
                            return subst.tryApply(depth, bHd, nilTerm, targetForm)
                        }
                        if (aVal === false) {
                            return subst.tryApply(depth, cHd, nilTerm, targetForm)
                        }
                        assert.unreachable()
                    }
                }
            }
            return null
        })

        function mkIfPrim(op: (a: DirectAddr) => boolean | null): Action {
            return (depth, [a0, b0]): ActionResult => {
                const a = dOf(a0)
                const b = dOf(b0)
                if ((h.isTmDatum(a) || h.isTmPair(a) || h.isTmLam(a)) && h.isTmPair(b)) {
                    const bHd = dOf(h.hd_tm(b))
                    const c = dOf(h.tl_tm(b))
                    if (h.isTmPair(c)) {
                        const cHd = dOf(h.hd_tm(c))
                        const opResult = op(a)
                        // const opResult = !op(a) // deliberate bug
                        if (opResult === true) {
                            return subst.tryApply(depth, bHd, a)
                        }
                        else {
                            return subst.tryApply(depth, cHd, a)
                        }
                    }
                }
                return null
            }
        }

        builtinId("ifNil", [weak, weak], parseTy("A @ Any -> K @ [-> Any, { A \\ Nil } -> Any] -> (Hd K) [] | (Hd (Tl K)) { A \\ [] }"),
            mkIfPrim((a: DirectAddr) => h.isTmDatum(a) && h.datum_tm(a) === null)
        )

        builtinId("ifPair", [weak, weak], parseTy("A @ Any -> K @ [[Any ,, Any] -> Any, { A \\ [Any ,, Any] } -> Any] -> (Hd K) [(Hd A), (Hd (Tl A))] | (Hd (Tl K)) { A \\ [Any ,, Any] }"),
            mkIfPrim((a: DirectAddr) => h.isTmPair(a))
        )

        builtinId("ifStr", [weak, weak], parseTy("A @ Any -> K @ [Str -> Any, { A \\ Str } -> Any] -> (Hd K) Str | (Hd (Tl K)) { A \\ Str }"),
            mkIfPrim((a: DirectAddr) => h.isTmDatum(a) && typeof (h.datum_tm(a)) === "string")
        )

        builtinId("ifInt", [weak, weak], parseTy("A @ Any -> K @ [Int -> Any, { A \\ Int } -> Any] -> (Hd K) Int | (Hd (Tl K)) { A \\ Int }"),
            mkIfPrim((a: DirectAddr) => h.isTmDatum(a) && typeof (h.datum_tm(a)) === "number")
        )

        builtinId("ifBool", [weak, weak], parseTy("A @ Any -> K @ [Bool -> Any, { A \\ Bool } -> Any] -> (Hd K) Bool | (Hd (Tl K)) { A \\ Bool }"),
            mkIfPrim((a: DirectAddr) => h.isTmDatum(a) && typeof (h.datum_tm(a)) === "boolean")
        )

        builtinId("Fix", [strong], parseTy("{ Type -> Type } -> Type"), (depth, [argAddr]) => {
            const arg = dOf(argAddr)

            if (isTmLam(arg)) {
                const fixLam = arg
                const fixVarDepth = depthInc(h.depthOf(fixLam))
                const fixBody = dOf(body_tm(fixLam))
                if (isVarUsed(fixVarDepth, fixBody)) {
                    // If either the tmVar or tyVar is used, leave the Fix-operator as-is.
                    return true
                }
                else {
                    // Otherwise we can safely substitutute nothing through the body
                    //   so as to bring the body to a usable depth.
                    const env: SubstEnv = new Map
                    const ty = h.tyPrim0("Unknown", depthZero)
                    const result = subst.substTmTy(depth, fixVarDepth, env, ty, fixBody)
                    return result
                }
            }

            if (h.isTmApply(arg) || h.isPrim(null, arg) || h.isTmVar(arg)) {
                // The argument will presumably reduce to a tmLam when sufficient variable substitutions enable further reduction.
                return null
            }

            return false
        })

        builtinId("Self", [strong], parseTy("{ Void -> Type } -> Type"), (depth, [arg0]) => {
            const arg = dOf(arg0)

            if (isTmLam(arg)) {
                const selfLam = arg
                const selfVarDepth = depthInc(h.depthOf(selfLam))
                const selfBody = dOf(body_tm(selfLam))
                if (isVarUsed(selfVarDepth, selfBody)) {
                    // If either the tmVar or tyVar is used, leave the Self-operator as-is.
                    return true
                }
                else {
                    // Otherwise we can safely substitutute nothing through the body
                    //   so as to bring the body to a usable depth.
                    const env: SubstEnv = new Map
                    const ty = h.tyPrim0("Unknown", depthZero)
                    const result = subst.substTmTy(depth, selfVarDepth, env, ty, selfBody)
                    return result
                }
            }

            if (h.isTmApply(arg) || h.isPrim(null, arg) || h.isTmVar(arg)) {
                // The argument will presumably reduce to a tmLam when sufficient variable substitutions enable further reduction.
                return null
            }

            return false

        })

        // fix f = x -> f (fix f) x
        builtinId("fix", [weak], parseTy("{ F @ { { Any -> Void } -> (Dom F) } -> (Cod F) }"), (depth, [f]) => {
            {
                const fDepth = h.depthOf(f)
                const fTy = h.typeOf(f)
                const fDom = h.tyDom(fTy, fDepth)
                const xDepth = depthInc(fDepth)
                const x = h.tmVar([], xDepth, h.tyDom(fDom, xDepth))          //                x
                const fix_f = h.tmOp1("fix", f, xDepth, fTy)                  //         fix f
                const f_fixf = h.tmApply(f, fix_f, xDepth)                    //      f (fix f)
                const ffixf_x = h.tmApply(f_fixf, x, xDepth)                  //      f (fix f) x
                const lam = h.tmLam(false0, false0, x, ffixf_x, fDepth, fDom) // x -> f (fix f) x
                return lam
            }
        })

        // A blocking variant of "fix".
        // Reduction blocks until "x" is more interesting than a variable.
        // fix f x = f (x -> fix f x) x
        // builtinId("fix2", [weak, weak], parseTy("{ F @ { { Any -> Void } -> (Dom F) } -> (Cod F) }"), (depth, [f, x0]) => {
        //     if (!isReduced(x0)) {
        //         return null
        //     }

        //     const fTy = h.typeOf(f)
        //     const fDom = h.tyDom(fTy, depth)
        //     const xDepth = depthInc(depth)

        //     const x = h.tmVar([], xDepth, h.tyDom(fDom, xDepth))                //                x
        //     const fix_f_x = h.tmOp2("fix2", f, x, xDepth, fTy)                  //          fix f x
        //     const x_fixfx = h.tmLam(false0, false0, x, fix_f_x, depth, fDom)    //    (x -> fix f x)
        //     const f_xfixfx = h.tmApply(f, x_fixfx, depth)                       //  f (x -> fix f x) 
        //     const fxfixfx_x0 = h.tmApply(f_xfixfx, x0, depth)                   //  f (x -> fix f x) x0

        //     return fxfixfx_x0
        // })


        builtinId("fix2", [weak, weak], parseTy("{ F @ { { Any -> Void } -> (Dom F) } -> (Cod F) }"), (depth, [f, x0], form) => {
            if (!isReduced(x0)) {
                return null
            }

            const gb = mkGraphBuilder(h, depth, form)
            const fTy = h.typeOf(f)
            const fDom = gb.tyDom(fTy)

            const x_fixfx = gb.tmLam(false0, false0, gb => {
                const x = gb.tmVar([], gb.tyDom(fDom))                    //                x
                const fix_f_x = gb.tmOp2("fix2", f, x, fTy)               //          fix f x
                return [x, fix_f_x]                                       //    (x -> fix f x)
            }, fDom)

            const f_xfixfx = gb.tmApply(f, x_fixfx)                       //  f (x -> fix f x) 
            const fxfixfx_x0 = gb.tmApply(f_xfixfx, x0)                   //  f (x -> fix f x) x0

            return fxfixfx_x0
        })


        // Or:
        // fix f = x -> f ((x $? fix) f) x
        // We risk creating a cycle if "fix f" is reduced within the definition of "fix",
        //   (due to memoization).
        // We can either prevent cycles from being created, 
        //   or accomodate them when they are.
        // For example, 
        //   when reading back code, we can break cycles by reading back unevaluated cdde,
        //     at the point that the cycle is detected.


        const grLoopTy = parseTy(`
            {  A @ { ["break", Any] | ["continue", Any] } 
            -> { (Hd (Tl { A & ["continue", Any] })) -> A }
            -> (Hd (Tl { A & ["break", Any] }))
            }
        `)
        builtinId("grLoop", [weak, weak], grLoopTy, (depth, args) => {
            const tuple: Addr[] = []
            if (derefTuple2(args[0], tuple)) {
                if (datumEq(tuple[0], breakTerm)) {
                    return tuple[1]
                }
                if (datumEq(tuple[0], continueTerm)) {
                    const next = h.tmApply(args[1], tuple[1], depth)
                    const loop = h.tmOp2("grLoop", next, args[1], depth, grLoopTy)
                    return loop
                }
            }
            return null
        })


        function tmTuple2(elem0: Addr, elem1: Addr, depth: Depth): Addr {
            const pair1 = h.tmPair(elem1, nilTerm, depth)
            const pair2 = h.tmPair(elem0, pair1, depth)
            return pair2
        }

        builtinId("break", [weak], parseTy('A @ Any -> ["break", A]'), (depth, args) => {
            {
                const breakTuple = tmTuple2(breakTerm, args[0], depth)
                return breakTuple
            }
        })
        builtinId("continue", [weak], parseTy('A @ Any -> ["continue", A]'), (depth, args) => {
            {
                const continueTuple = tmTuple2(continueTerm, args[0], depth)
                return continueTuple

            }
        })
        // { name: "jsStrCat", arity: 1, type: 0, action: () => null },
        // { name: "strAdd", arity: 2, type: 0, action: opDatum2 },
        // mkOpDatum2("strAdd", "string", "string", "Str", "Str", "Str", (a: any, b: any) => a + b)
        builtinId("strAdd", [weak, weak], parseTy("Str -> Str -> Str"), (depth, [a0, b0]) => {
            const a = dOf(a0)
            const b = dOf(b0)
            if (h.isTmDatum(a) && h.isTmDatum(b)) {
                const aVal = h.datum_tm(a)
                const bVal = h.datum_tm(b)
                if (typeof (aVal) === "string" && typeof (bVal) === "string") {
                    const result = aVal + bVal
                    // TODO ? Sanity check. We could check that the dynamic "result" fits within the static "resultTy"
                    return h.tmDatum(result, depth, tyStr)
                }
            }
            return null
        })
        builtinId("strLen", [weak], parseTy("Str -> Int"), () => null)
        builtinId("error", [weak], parseTy("Any -> Void"), () => null)
        builtinId("unknownVariable", [weak], parseTy("Str -> Any"), () => null)
        builtinId("unknownPrimitive", [weak], parseTy("Str -> Any -> Any"), () => null)
        builtinId("trace", [weak, weak], parseTy("Any -> A @ Any -> A"), () => null)
        builtinId("show", [weak], parseTy("Any -> Str"), (depth, args) => {
            if (depth !== 0) {
                return null
            }
            {
                const dataExpr = readbackData(h, args[0])
                const dataStr = prettyFerrum(dataExpr)
                return h.tmDatum(dataStr, depthZero, tyStr)
            }
        })

        // TODO ? Rename: charToInt
        builtinId("strOrd", [weak], parseTy("Str -> Int"), mkDatum1Action("string", (a: any) => a.charCodeAt(0)))
        // TODO ? Rename: charFromInt
        builtinId("strChr", [weak], parseTy("Int -> Char"), mkDatum1Action("number", (a: any) => String.fromCharCode(a)))


        builtinTermOp("<$", [weak, weak], parseTy("F @ { Void -> Any } -> X @ (Dom F) -> F X"), (depth, [a0, b0]) => {
            const a = h.directAddrOf(a0)
            const b = h.directAddrOf(b0)

            const resultS = subst.tryApply(depth, a, b, formStrong)

            return resultS
        })

        builtinTermOp("$!", [strong], parseTy("F @ { Void -> Any } -> F"), (depth, [a0]) => {
            const a = h.directAddrOf(a0)
            if (h.formOf(a) === formStrong) {
                return a
            }
            return null
        })


        function isReduced(a0: Addr): boolean {
            const a = h.directAddrOf(a0)
            const tag = h.nodeTag(a)
            switch (tag) {
                case "TmDatum":
                case "TmPair":
                case "TmLambda":
                    return true

                case "TmApply":
                case "TmVar":
                case "Prim":
                    return false

                case "TmAs":
                case "TmTyAnnot":
                    // We shouldn't encounter these here.
                    assert.impossible("?")

                case "TySingleStr":
                case "TyPair":
                case "TyFun":
                    return true

                case "TyApply":
                case "TyVar":
                    // This type might reduce further.
                    return false

                default:
                    assert.noMissingCases(tag)
            }

        }

        // Ferrum's blockUntil function behaves much-like Haskell's seq function.
        // However, the motivation is different.
        //   blockUntil provides control over the order of evaluation beneath lambdas.
        const blockUntil: Action = (depth, [a0]) => {
            const a = h.directAddrOf(a0)
            if (isReduced(a0)) {
                return identityFunc()
            }
            else {
                return null
            }
        }

        builtinId("blockUntil", [weak], parseTy("Any -> X @ Any -> X"), blockUntil)
        builtinTermOp("_$?", [weak], parseTy("Any -> X @ Any -> X"), blockUntil)



        builtinId("Primitive", [weak], parseTy("Str -> Type"), (depth, [a0]) => {
            const a = h.directAddrOf(a0)
            if (h.isTmDatum(a)) {
                const name = h.datum_tm(a)
                if (typeof name === "string") {
                    if (primEnv!.has(name)) {
                        const addr = primEnv!.get(name)
                        if (addr !== undefined) {
                            const ty = h.typeOf(addr)
                            return ty
                        }
                    }
                    else {
                        console.error(`Unknown graph-primitive (Primitive ${JSON.stringify(name)})`)
                        return false
                    }
                }
            }
            return null
        })

        builtinId("primitive", [weak], parseTy("{ P : Str } -> (Primitive P)"), (depth, [a0]) => {
            const a = h.directAddrOf(a0)
            if (h.isTmDatum(a)) {
                const name = h.datum_tm(a)
                if (typeof name === "string") {
                    if (primEnv!.has(name)) {
                        const addr = primEnv!.get(name)
                        if (addr !== undefined) {
                            return addr
                        }
                    }
                    else {
                        console.error(`Unknown graph-primitive (primitive ${JSON.stringify(name)})`)
                        return false
                    }
                }
            }
            return null
        })

        // These are needed by code in fe4-prelude.fe
        builtinTODO("jsStrJoin",    /**/[weak, weak], parseTy('{ Str -> (List Str) -> Str }'))
        builtinTODO("not",          /**/[weak], parseTy('{ Bool -> Bool }'))
        builtinTODO("strCharAt",    /**/[weak, weak], parseTy('{ Str -> Int -> Char }'))
        builtinTODO("strCharAtMb",  /**/[weak, weak], parseTy('{ Str -> Int -> [] | [Char] }'))
        builtinTODO("trace2",       /**/[weak, weak], parseTy('{ Any -> K @ { -> Any} -> K [] }'))


        function primTODO(name: string, type?: string): [string, string] {
            const typeAnnot = type === undefined ? "" : ` : ${type}`
            // We can either generate a runtime-error if this unknown primitive is ever actually used.
            return [name, `(a -> error ["TODO implement (${name})"]) ${typeAnnot}`]
            // Or we can generate a runtime call to "primitive",
            //   we may not have a graph-reduction implementation of this primitive, 
            //   but the runtime might have it implemented.
            // return [name, `(a -> primitive ${JSON.stringify(name)}) ${typeAnnot}`]
        }

        const declStrs = [
            ["break", '((a : A @ Any) -> ["break", a]) : { A @ Any -> ["break", A] }'],
            ["continue", '((a: A @ Any) -> ["continue", a]) : { A @ Any -> ["continue", A] }'],

            ["loop1", `
                (  (body : L @ { Void -> ["break", Any] | ["continue", (Dom L)] }) 
                -> (initVal : S @ (Dom L))             
                -> 
                   grLoop (continue initVal : { ["break", (Hd (Tl { (Cod L) & ["break", Any] }))] | ["continue", (Dom L)] }) body
                ) -- : 
                  -- {  L @ { Void -> ["break", Any] | ["continue", (Dom L)] }
                  -- -> S @ (Dom L) 
                  -- -> (Hd (Tl { ["break", Any] & L S }))
                  -- }
            `],

            ["loop2", `
                (  (initVal: S @ Any) 
                -> (body: L @ { S -> ["break", Any] | ["continue", (Dom L)]}) 
                -> grLoop (continue initVal) body
                ) : { S @ Any -> L @ { S -> ["break", Any] | ["continue", (Dom L)]} -> (Hd (Tl { L S & ["break", Any] })) }
            `],

            ["jsStrCat", "(a : List Str) -> loop1 ([x : List Str, y : Str] -> ifNil x [ -> break y, [x1,,xs] -> continue [xs, strAdd y x1]]) [a, \"\"]"],
            ["char_concat", "jsStrCat"],
            ["matchList", "ifNil"],
            ["matchMaybe", "ifNil"],
            ["testIsNil", "ifNil"],
            ["Single", "a -> Type"],
            ["castT", "(a : Any) -> (a : Void)"],
            ["Domain", "Dom"],
            ["Codomain", "Cod"],
            ["SelfT", "(f : { Type -> Type }) -> Self <| (a : A @ Any) -> f A"],

            // TODO ? Provide a stronger connection between corresponding the term-level and type-level functions/operators.
            // ["Hd", "Single hd"],        
            // ["Tl", "Single tl"],

            primTODO("relCompT"),

            // These are needed by code in fe4-prelude.fe
            // primTODO("jsStrJoin",    /**/  '{ Str -> (List Str) -> Str }'),
            // primTODO("not",          /**/  '{ Bool -> Bool }'),
            // primTODO("strCharAt",    /**/  '{ Str -> Int -> Char }'),
            // primTODO("strCharAtMb",  /**/  '{ Str -> Int -> [] | [Char] }'),
            // primTODO("trace2",       /**/  '{ Any -> K @ { -> Any} -> K [] }'),


            // // All of these either need adding here or removing elsewhere
            // primTODO("grWhile"),
            // primTODO("ifType"),
            // // primTODO("jsEval"),
            // // primTODO("jsEvalMaybe"),
            // primTODO("primMkArrayFastAccessNoCopy"),
            // primTODO("primMkArrayFastAccessSlowCopy"),
            // primTODO("primAssoc1MkEphemeral"),
            // primTODO("primAssoc1MkPersistent"),
            // primTODO("primHpsCall"),
            // primTODO("primHpsDo"),
            // primTODO("primHpsDoK"),
            // primTODO("primHpsHandlerMk"),
            // primTODO("primHpsK"),
            // primTODO("show2"),
            // primTODO("showType"),
            // primTODO("tail"),

            // primTODO("ioDoPrim"),

        ]


        for (const [name, defn] of declStrs) {
            let defnTokens = scan2Fe("", defn, null, [])
            let defnPS = new ParseState(defnTokens)
            let defnExpr = parseTerm(defnPS, "ferrum/0.1")
            try {
                const ctxTy = tyAny
                const performTypeCheck = true
                const tm = inst.instTerm(primitives, env, depthZero, defnExpr, ctxTy, performTypeCheck)
                const synTy = h.typeOf(tm)
                const rc = tyPrim0("Void", depthZero)
                env.set(name, tm)
                // TODO place the source defn and instantiate expr somewhere in the "primitives",
                // TODO so as to view it in the IDE

                const pat: ExprTypeGraph = { tag: "EVar", loc: nilLoc, name, tm, synTy, ctxTy: synTy, rc, torp: "Pat" }
                // TODO ? have "instBuiltin" build and return an ExprTypeGraph expression too ?
                const defn = defnExpr as ExprTypeGraph
                decls.push([pat, defn])

            }
            catch (exc) {
                console.error(`Instantiation Exception: ${JSON.stringify(exc)}`)
                console.error("Instantiation Heap\n")
                console.error(showGraph(h, null, true).join("\n"))
                throw exc
            }
        }

        primEnv = env.freeze()

    }


    return primitives


}

