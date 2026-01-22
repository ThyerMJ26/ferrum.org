import { ExprLoc, Expr, LocField, exprFreeVars, showExpConcise, TorT, TorP, Decl, eList, isLambdaExpr, isPatTypeAnnotated, exprAddNilLoc } from "../syntax/expr.js";
import {
    Datum,
    Addr, TypeAddr, Heap, TypeAddrMb, isAddrYes, addrNo, Depth, DepthShift, depthInc,
    TyPrim0, TyOp1, TyOp2,
    booleanToBool,
    depthZero,
    depthMax2,
    false0,
    NodeTransformer,
    TyPrim1Tm,
    isAddrNo,
    AddrNo,
    TyPrim2,
    TyPrim1,
    isTyOp2Name,
    isTyOp2Name_Concrete,
    formWeak,
    addrTypeType,
    AddrMb,
    assumeIsType,
    GraphEnvR,
    GraphEnvRw,
} from "../graph/graph-heap2.js";
import { Builtin, Builtins, InitPrims, Primitives } from "./graph-primitives.js"
import { Type, applyTypes, showType2, termVarT } from "../tree/types.js";
import { assert } from "../utils/assert.js";
import { Loc, locMatch } from "../syntax/token.js";
// import { assumeIsType } from "../graph/graph-ti.js";
import { isAlpha } from "../syntax/scan.js";
import { Graph } from "../graph/code-table.js";
import { GraphReduce } from "./graph-reduction.js";
import { TiCalcFuncs } from "./graph-ti-calc.js";
import { GraphPredicates } from "../graph/graph-predicates.js";


export type ExprTypeGraph = Expr<LocField & { tm: Addr, synTy: TypeAddr, ctxTy: TypeAddr, rc: TypeAddr, torp: TorP }>
export type DeclTypeGraph = [ExprTypeGraph, ExprTypeGraph]

export type VarBinding = { name: string, addr: Addr, loc?: Loc }
export type PatBinding = { vars: VarBinding[], addr: Addr, loc?: Loc }

export type Binding = { name: string, addr: Addr }
export type Bindings = Binding[]

export interface Instantiate {
    instTerm(prims: Primitives, env: GraphEnvR, depth: Depth, expr: ExprLoc, ctxTy: Addr, performTypeCheck: boolean): Addr
    instType(prims: Primitives, env: GraphEnvR, depth: Depth, expr: ExprLoc, ctxTy: Addr, performTypeCheck: boolean): TypeAddr

    // instDecl(prims: Primitives, env: GraphEnvRw, depth: Depth, pat: Expr, defn: Expr): Addr
    // // TODO Instead of taking an EnvRw, take read and write Envs separately, 
    // // TODO   make it the responsibility of the caller to merge the result.
    // // instDecl(prims: Primitives, envR: GraphEnvR, envW: GraphEnvW, depth: Depth, pat: Expr, defn: Expr): Addr

    instDecl(prims: Primitives, env: GraphEnvRw, depth: Depth, pat: ExprLoc, defn: ExprLoc, performTypeCheck: boolean): Bindings

    // for temporary compatibility between tree-types and graph-types
    instTypeValue(prims: Primitives, env: GraphEnvR, depth: Depth, type: Type): TypeAddr
}



export function mkInstantiate(h: Heap, gr: GraphReduce, pred: GraphPredicates, ti: TiCalcFuncs): Instantiate {

    const tyType = addrTypeType
    const tyUnknown = h.tyPrim0("Unknown", depthZero)
    const tyVoid = h.tyPrim0("Void", depthZero)
    const tyNil = h.tyPrim0("Nil", depthZero)
    const tyBool = h.tyPrim0("Bool", depthZero)
    const tyInt = h.tyPrim0("Int", depthZero)
    const tyChar = h.tyPrim0("Char", depthZero)
    const tyStr = h.tyPrim0("Str", depthZero)
    const tyAny = h.tyPrim0("Any", depthZero)
    const tyAll = h.tyPrim0("All", depthZero)
    const tyError = h.tyPrim0("Error", depthZero)


    return {
        instTerm,
        instType,
        instDecl,
        instTypeValue,
    }

    function tyHead(pairTy: TypeAddr, depth: Depth): TypeAddr
    function tyHead(pairTy: AddrNo, depth: Depth): AddrNo
    function tyHead(pairTy: TypeAddrMb, depth: Depth): TypeAddrMb
    function tyHead(pairTy: TypeAddrMb, depth: Depth): TypeAddrMb {
        if (isAddrNo(pairTy)) return addrNo
        // Checking for common patterns to avoid needlessly instantiating primitives
        //   seems like a good idea.
        // However it can lead to addresses changing if/when a (runtest) test is re-instantiated.
        // This happens if a term isn't yet reduced to a pair the first time a test instantiated, 
        //   but is the second time.
        // const pairTy1 = h.directAddrOf(pairTy)
        // if (h.isTyPair(pairTy1)) {
        //     return h.hd_ty(pairTy1)
        // }
        // if (h.isTyPrim("Any", pairTy1)) {
        //     return pairTy1
        // }
        // return h.tyPrim1("Hd", pairTy1)
        return h.tyPrim1("Hd", pairTy, depth)
    }

    function tyTail(pairTy: TypeAddr, depth: Depth): TypeAddr
    function tyTail(pairTy: AddrNo, depth: Depth): AddrNo
    function tyTail(pairTy: TypeAddrMb, depth: Depth): TypeAddrMb
    function tyTail(pairTy: TypeAddrMb, depth: Depth): TypeAddrMb {
        if (isAddrNo(pairTy)) return addrNo
        return h.tyPrim1("Tl", pairTy, depth)
    }

    function typeOfDatum(value: Datum): TypeAddr {
        if (value === null) {
            return tyNil
        }
        switch (typeof value) {
            case "string":
                // singleton strings
                // TODO later: singleton everything else
                return h.tySingleStr(value)
            case "number":
                return tyInt
            case "boolean":
                return tyBool
            default:
                throw new Error(`Unexpected datum type (${typeof value})`)
        }
    }

    function applyFunTy(depth: Depth, funTy: TypeAddr, argTm: Addr, argTy: TypeAddr): TypeAddr {

        // gr.reduceAll(funTy, formWeak)
        // gr.reduceAll(argTy, formWeak)

        // funTy = h.directAddrOf(funTy)
        argTy = h.directAddrOf(argTy)

        if (argTy === addrTypeType) {
            // If the argument term is a type, then give it a singleton type.
            // In future literal types should default to having singleton types anyway.
            // But for now, this is the most expedient way to get back to a more
            //   set-based approach to type-applications.
            argTy = h.tyPrim1("Single", argTm, depth)
        }

        const result = h.tyApply(funTy, argTy, depth)
        return result
    }


    // This replaces the (<var> @ <pattern>) nodes with just the (<pattern>) part.
    // This makes it possible to calculate a more precise context type for a lambda's body.
    function patToTerm(pat: Addr): Addr {

        const transformer = h.mkNodeTransformer({
            child(addr): Addr {
                addr = h.directAddrOf(addr)
                return h.nodeGuide(visitor, addr)
            },
        })

        const visitor = h.mkVisitor<Addr>({
            tmDatum(addr) {
                return addr
            },
            tmVar(addr) {
                return addr
            },
            tmPair(addr) {
                return h.nodeTransform(transformer, addr)
            },
            tmAs(addr) {
                const pat = h.directAddrOf(h.pat_tm(addr))
                return h.nodeTransform(transformer, pat)
            },
            tmTyAnnot(addr) {
                return h.nodeTransform(transformer, addr)
            },
            tm(addr) {
                assert.unreachable()
            },
        })

        const term = h.nodeGuide(visitor, pat)

        return term
    }

    function addDummyTypes(expr: ExprTypeGraph) {
        // This adds types to placate the runtest code, and to make explicit which things aren't really being typed.
        // It's clearer than just supressing checks on anything without a type.
        // This is only used when operators are used in place of applications
        // TODO Avoid needing to do this.
        expr.synTy = tyError
        expr.ctxTy = tyError
        expr.rc = h.tyPrim0("Void", depthZero)
        expr.torp = "Term"
    }

    // for temporary compatibility between tree-types and graph-types
    function instTypeValue(prims: Primitives, env: GraphEnvR, depth: Depth, type: Type): TypeAddr {
        switch (type.tag) {
            case "TVoid":
                return tyVoid
            case "TNil":
                return tyNil
            case "TBool":
                return tyBool
            case "TInt":
                return tyInt
            case "TChar":
                return tyChar
            case "TStr":
                return tyStr
            // case "TPair":
            // case "TList":
            // case "TFun":
            case "TAny":
                return tyAny
            case "TSub":
            case "TSuper":
            case "TType":
            case "TSingle":
            case "TAs":
            case "TRec":
            case "TSelf":
            case "TVar":
            case "TRule":
            case "TUnknown":
            case "TError":
            case "TTerm":
            case "TTermVar":
            case "TSingleType":
            case "TSingleTermVar":
            default:
                throw new Error(`missing case (${type.tag})`)
        }
    }


    // TODO ? Instantiate partially and fully applied primitives more directly ?
    // TODO ? That is, without always resorting to fully eta-expanding the primitive.

    // instBuiltinApply(depth: Depth, builtin: Builtin, args0: Addr[], ctxTy: Addr): Addr {
    //     const args = [...args0]
    //     if (args0.length < builtin.arity) {
    //         // there are an insufficient number of args
    //         const numLambdas = builtin.arity - args0.length
    //         for (let i = 0; i != numLambdas; i++) {
    //             const varArg = this.heap.alloc(i + 1, { tag: "HVar" }, 0, 0)
    //             args.push(varArg)
    //         }
    //         const op = this.heap.alloc(depth + numLambdas, { tag: "TmOp", name: builtin.name, args: args }, 0, 0)
    //         let lambda = op
    //         for (let i = 0; i != numLambdas; i++) {
    //             lambda = this.heap.alloc(depth + numLambdas - 1 - i, { tag: "HLambda", body: lambda }, 0, 0)
    //         }
    //         return lambda
    //     }
    //     else {
    //         // there are a sufficient, and possibly surplus, number of args
    //         const sufficientArgs = args.slice(0, builtin.arity)
    //         const surplusArgs = args.slice(builtin.arity, undefined)
    //         let synTy = builtin.type
    //         for (const arg of sufficientArgs) {
    //             synTy = this.tyApply(synTy, this.heap.synTypeOf(arg))
    //         }
    //         const op = this.heap.alloc(depth, { tag: "TmOp", name: builtin.name, args: sufficientArgs }, synTy, ctxTy)
    //         let apply = op
    //         for (const arg of surplusArgs) {
    //             apply = this.heap.alloc(depth, { tag: "TmApply", func: apply, arg: arg }, 0, 0)
    //         }
    //         return apply
    //     }
    // }

    // instBuiltinApply(prims: Primitives, env: Env, depth: Depth, name: string, args0: Expr[], ctxTy: Addr): Addr {
    //     // const args = [...args0]
    //     const builtin = prims.getTerm(name)
    //     if (builtin === null) {
    //         throw new Error(`Unknown builtin (${name})`)
    //     }
    //     if (args0.length < builtin.arity) {
    //         // there are an insufficient number of args
    //         const numLambdas = builtin.arity - args0.length
    //         const args: Addr[] = []
    //         let builtinCtxTy = builtin.type
    //         for (let i = 0; i != args0.length; i++) {
    //             const argCtxTy = this.tyDom(depth, builtinCtxTy)
    //             builtinCtxTy = this.tyCod(depth, builtinCtxTy)
    //             const arg = this.instTerm(prims, this.env, depth, args0[i], argCtxTy)
    //             args.push(arg)
    //         }
    //         for (let i = 0; i != numLambdas; i++) {
    //             const varArg = this.heap.alloc(i + 1, { tag: "HVar" }, 0)
    //             // const varArg = this.heap.alloc(depth + i + 1, { tag: "TmVar", path: [] }, 0, 0)
    //             args.push(varArg)
    //         }
    //         const op = this.heap.alloc(depth + numLambdas, { tag: "TmOp", name: builtin.name, args: args }, 0)
    //         let lambda = op
    //         for (let i = 0; i != numLambdas; i++) {
    //             lambda = this.heap.alloc(depth + numLambdas - 1 - i, { tag: "HLambda", body: lambda }, 0)
    //             // lambda = this.heap.alloc(depth + numLambdas - 1 - i, { tag: "TmLambda", no: false, yes: false, pat: args.at(-1 - i)!, body: lambda }, 0, 0)
    //         }
    //         return lambda
    //     }
    //     else {
    //         // there are a sufficient, and possibly surplus, number of args
    //         // const args: Addr[] = []
    //         // for (const arg of args0) {
    //         //     const argTerm = this.instTerm(depth, builtins, this.env, ctxTy, arg)
    //         //     args.push(argTerm)
    //         // }
    //         const sufficientArgExprs = args0.slice(0, builtin.arity)
    //         const surplusArgExprs = args0.slice(builtin.arity, undefined)
    //         const sufficientArgTerms: Addr[] = []
    //         const surplusArgTerms: Addr[] = []
    //         let builtinCtxTy = builtin.type
    //         for (const argExpr of sufficientArgExprs) {
    //             const argCtxTy = this.tyDom(depth, builtinCtxTy)
    //             builtinCtxTy = this.tyCod(depth, builtinCtxTy)
    //             const argTerm = this.instTerm(prims, env, depth, argExpr, argCtxTy)
    //             sufficientArgTerms.push(argTerm)
    //         }
    //         for (const argExpr of surplusArgExprs) {
    //             // TODO calculate the argCtxTy correctly, using the domain of the result of applying the builtin
    //             const argCtxTy = this.tyAny
    //             const argTerm = this.instTerm(prims, this.env, depth, argExpr, argCtxTy)
    //             surplusArgTerms.push(argTerm)
    //         }
    //         let synTy = builtin.type
    //         for (const arg of sufficientArgTerms) {
    //             synTy = this.tyApply(depth, synTy, this.heap.synTypeOf(arg))
    //         }
    //         const op = this.heap.alloc(depth, { tag: "TmOp", name: builtin.name, args: sufficientArgTerms }, synTy)
    //         let apply = op
    //         for (const arg of surplusArgTerms) {
    //             apply = this.heap.alloc(depth, { tag: "TmApply", func: apply, arg: arg }, 0)
    //         }
    //         return apply
    //     }
    // }


    // function instBuiltin(builtin: Builtin): Addr {
    //     // if (builtin.name === "break") {
    //     //     assert.breakpoint()
    //     // }

    //     const numLambdas = builtin.arity
    //     const args: Addr[] = []
    //     let builtinTy = builtin.type
    //     const funcTys: TypeAddr[] = []
    //     for (let i = 0; i != numLambdas; i++) {
    //         funcTys.push(builtinTy)
    //         const argDepth = i + 1 as Depth
    //         const argTy = h.tyPrim1("Dom", builtinTy)
    //         const argTy2 = h.tyOp2("{<:}", h.tyVar(argDepth), argTy)
    //         builtinTy = h.tyApply(builtinTy, argTy2, argDepth)
    //         const varArg = h.tmVar([], argDepth, argTy2)
    //         args.push(varArg)
    //     }
    //     const opDepth = numLambdas as Depth

    //     let op2: Addr
    //     // assert.isTrue(builtin.tag === "Prim")
    //     switch (builtin.arity) {
    //         case 1:
    //             op2 = h.tmOp1(builtin.nameG, args[0], opDepth, builtinTy)
    //             break
    //         case 2:
    //             op2 = h.tmOp2(builtin.nameG, args[0], args[1], opDepth, builtinTy)
    //             break
    //         default:
    //             assert.unreachable()
    //     }

    //     let lambda = op2
    //     funcTys.reverse()
    //     for (let i = 0; i != numLambdas; i++) {
    //         const lamDepth = numLambdas - (i + 1) as Depth
    //         lambda = h.tmLam(false0, false0, args.at(-1 - i)!, lambda, lamDepth, funcTys[i])
    //     }

    //     builtin.term = lambda
    //     return lambda
    // }



    /** Returns the type of a pattern without instantiating the pattern. */
    // TODO ? Combine this with instPat ?
    // TODO ?   Make the "defn" argument of instPat nullable to indicate we aren't instantiating anything yet ?
    function typeLetPat(prims: Primitives, env: GraphEnvR, depth: Depth, path: number[], pat: ExprLoc, ctxTy: TypeAddr, performTypeCheck: boolean): TypeAddr {
        return tlp(path, pat, ctxTy)

        function tlp(path: number[], pat: ExprLoc, ctxTy: TypeAddr): TypeAddr {
            switch (pat.tag) {
                case "EVar": {
                    return ctxTy
                }
                case "EAs": {
                    const synTy = tlp(path, pat.expr, ctxTy)
                    return synTy
                }
                case "EDatum": {
                    const synTy = typeOfDatum(pat.value)
                    return synTy
                }
                case "ETermBrackets": {
                    const synTy = tlp(path, pat.expr, ctxTy)
                    return synTy
                }
                case "EType": {
                    // The type annotation is still in a term-bracket context, until it explicitly uses type-brackets 
                    const tyTy = instTerm(prims, env, depth, pat.type, ctxTy, performTypeCheck) as TypeAddr
                    const synTy = tlp(path, pat.expr, tyTy)
                    return synTy
                }
                case "EList": {
                    const numElems = pat.exprs.length

                    let listCtxTy = ctxTy
                    const elemCtxTys: TypeAddr[] = []
                    for (const p of pat.exprs) {
                        const elemCtxTy = h.tyPrim1("Hd", listCtxTy, depth)
                        listCtxTy = h.tyPrim1("Tl", listCtxTy, depth)
                        elemCtxTys.push(elemCtxTy)
                    }
                    const tailCtxTy = listCtxTy

                    let tailSynTy: TypeAddr
                    if (pat.tail === null) {
                        tailSynTy = tyNil
                    }
                    else {
                        const path2 = [...path, 0 - numElems]
                        tailSynTy = tlp(path2, pat.tail, tailCtxTy)
                    }

                    let listSynTy = tailSynTy

                    pat.exprs.slice().reverse().forEach((p, i) => {
                        const elemCtxTy = elemCtxTys[i]
                        const elemSynTy = tlp([...path, numElems - i - 1], p, elemCtxTy)
                        // TODO intersect the elemSynTy with the elemCtxTy
                        listSynTy = h.tyPair(elemSynTy, listSynTy, depth)
                    })
                    return listSynTy
                }
                case "ELambda":
                case "EApply":
                case "ELet":
                case "EPair":
                case "ETypeAs":
                case "ELambdaMaybe":
                case "ELambdaNo":
                case "ELambdaYes":
                case "ETypeBrackets":
                case "ESym":
                case "EPrim":
                    assert.impossible()
                default:
                    assert.noMissingCases(pat)
            }
        }
    }

    // TODO ? Permit or forbid patterns from referencing the same variables that they bind ?
    // TODO ? For example:
    // TODO ?   let [A : Type, b : A] = [Int, 3];
    // TODO ? should perhaps be best written:
    // TODO ?   let [A, b]: (Self <| [A: Type, b: Any] -> [Type, A]) = [Int, 3];
    // TODO ? Overlaps between the set of variables bound and the set of variables referenced could be resolved by one of:
    // TODO ?   - All variables are read before any are bound, much like with the definitions.
    // TODO ?   - A variable reference occuring after (or anywhere?) a variable binding (of the same name), references that binding, and a Self type is automatically constructed as needed.
    // TODO ?   - Forbid any overlap in the same pattern, require the user to write an explicit Self type when they need to.
    // TODO ? Forbidding overlap seems best, it keeps the other options open, but its probably best not to choose any of the possible "permit" solutions anyway.    
    // TODO ?   Not least because it would be easy to forget/miscommunicate/misunderstand which of multiple possibly options apply.

    // TODO ? Or, permit use only after definition and allow shadowing, much like multiple separate let bindings.
    // TODO ?   (let a = 1; let a = 2; let a = 3; a + a + a) ~~> 9
    // TODO ? So
    // TODO ?   (let [a, a, a] = [1, 2, 3]; a + a + a) ~~> 9
    // TODO ? If multiple use of the same variable means anything, perhaps it should mean this.
    // TODO ? ( Whether it means anything, can be decided later / left to a style-checker ).

    // TODO ? We still want/need to evaluate a syn-type for the pat, 
    // TODO ?   (to use as a ctx-type for the defn),
    // TODO ?   before we bind any of the variables in the pattern.

    // TODO ? Ideally let-patterns and lambda-patterns should behave similarly.

    function instLetPat(prims: Primitives, env: GraphEnvRw, depth: Depth, pat: ExprLoc, defn: Addr, ctxTy: TypeAddr, isCtxAnnot: boolean, performTypeCheck: boolean): Bindings {

        const bindings: Bindings = []

        ilp(pat, defn, ctxTy, isCtxAnnot)

        return bindings

        function ilp(pat: ExprLoc, defn: Addr, ctxTy: TypeAddr, isCtxAnnot: boolean): TypeAddr {
            const patSynTy = ilp2(pat, defn, ctxTy, isCtxAnnot)
            const pat2 = pat as ExprTypeGraph
            pat2.tm = defn
            pat2.ctxTy = ctxTy
            if (isCtxAnnot) {
                pat2.ctxTy = h.tyOp2("{&}", ctxTy, patSynTy, depth)
            }
            pat2.synTy = patSynTy
            pat2.rc = h.tyCon2("{\\}", pat2.ctxTy, pat2.synTy, depth)
            pat2.torp = "Pat"

            if (performTypeCheck) {
                gr.reduce(pat2.synTy)
                gr.reduce(pat2.ctxTy)
                ti.typeCheck("Pat", pat2.synTy, pat2.ctxTy, pat2.loc)
            }


            return patSynTy
        }

        function ilp2(pat: ExprLoc, defn: Addr, ctxTy: TypeAddr, isCtxAnnot: boolean): TypeAddr {
            switch (pat.tag) {
                case "EVar": {
                    env.set(pat.name, defn)
                    bindings.push({ name: pat.name, addr: defn })
                    let synTy = ctxTy
                    return synTy
                }
                case "EAs": {
                    const synTy = ilp(pat.expr, defn, ctxTy, isCtxAnnot)
                    env.set(pat.name, defn)
                    bindings.push({ name: pat.name, addr: defn })
                    return synTy
                }
                case "ETermBrackets": {
                    const synTy = ilp(pat.expr, defn, ctxTy, isCtxAnnot)
                    return synTy
                }
                case "EList": {
                    let listTm = defn
                    let listCtxTy = ctxTy
                    const elemTys: TypeAddr[] = []
                    for (let elemPat of pat.exprs) {
                        let elemCtxTy = h.tyPrim1("Hd", listCtxTy, depth)
                        let elemAddr = h.tmOp1("hd", listTm, depth, elemCtxTy)
                        const elemTy = ilp(elemPat, elemAddr, elemCtxTy, isCtxAnnot)
                        elemTys.push(elemTy)
                        listCtxTy = h.tyPrim1("Tl", listCtxTy, depth)
                        listTm = h.tmOp1("tl", listTm, depth, listCtxTy)
                    }
                    const tailSynTy = pat.tail === null ? tyNil : ilp(pat.tail, listTm, listCtxTy, isCtxAnnot)
                    const listSynTy = elemTys.reduceRight((listTy, elemTy) => h.tyPair(elemTy, listTy, depth), tailSynTy)
                    return listSynTy
                }
                case "ETypeBrackets": {
                    assert.todo(`TODO: handle type brackets within a pattern`)
                }

                case "EType": {
                    // TODO ? Instantiate an explicit TmTyAnnot node ?
                    // TODO ? Code which type-checked correctly may no longer type-check if annotations are removed.
                    // TODO ?   If   { A \ B } and { B \ C } are both Void,
                    // TOOD ?   Then { A \ C } cannot be anything other than Void,
                    // TODO ?   But that doesn't mean it can be seen to be Void (although it does mean it cannot be seen to not be Void).
                    // TODO This won't be an issue for instantiate-time type-checking.
                    // TODO This would only be an issue if we wish to perform type-checking a second time (such as after read-back).

                    const tyAnnotTm = instTerm(prims, env, depth, pat.type, tyType, performTypeCheck)
                    assumeIsType(tyAnnotTm)

                    // If this is a type-annotation within a type-annotation,
                    //   then intersect the types.
                    // If this is the first/outer-most annotation, 
                    //   then forget the context, and just use this annotation.
                    const ctxTy2 =
                        isCtxAnnot
                            ? h.tyOp2("{&}", ctxTy, tyAnnotTm, depth)
                            : tyAnnotTm

                    const defn2 = h.tmTyAnnot(defn, depth, tyAnnotTm)
                    const isCtxAnnot2 = true
                    const synTy = ilp(pat.expr, defn2, ctxTy2, isCtxAnnot2)
                    return synTy
                }
                case "EDatum": {
                    // TODO ? Do we need to handle let-pat-match failure case
                    // TODO ? The need for this should only occur if type-checking failed.
                    const synTy = typeOfDatum(pat.value)
                    return synTy
                }

                case "ELambda":
                case "EApply":
                case "ELet":
                case "EPair":
                case "ELambdaMaybe":
                case "ELambdaNo":
                case "ELambdaYes":
                case "ESym":
                case "EPrim":
                case "ETypeAs":
                    assert.unreachable(`Invalid expression tag in pattern (${pat.tag}).`)
                default:
                    assert.noMissingCases(pat)
            }
        }
    }

    /** Returns the type of a guard pattern. 
        This ignores type annotations as types cannot influence the behaviour of guards, or terms in general. */
    function typeLambdaPat(prims: Primitives, env: GraphEnvR, depth: Depth, path: number[], pat: ExprLoc, performTypeCheck: boolean): TypeAddr {
        const tp = (path: number[], pat: ExprLoc) => typeLambdaPat(prims, env, depth, path, pat, performTypeCheck)
        switch (pat.tag) {
            case "EVar": {
                return tyAny
            }
            case "EAs": {
                const synTy = tp(path, pat.expr)
                return synTy
            }
            case "EDatum": {
                const synTy = typeOfDatum(pat.value)
                return synTy
            }
            case "ETermBrackets": {
                const synTy = tp(path, pat.expr)
                return synTy
            }
            case "EType": {
                // The type annotation is still in a term-bracket context, until it explicitly uses type-brackets 
                let tyAnnot
                let tyName: string | null
                let env2
                if (pat.type.tag === "EAs") {
                    tyName = pat.type.name
                    tyAnnot = pat.type.expr
                    env2 = env.clone()
                    // TODO get this type right
                    env2.set(tyName, tyType)
                }
                else {
                    tyName = null
                    tyAnnot = pat.type
                    env2 = env
                }
                // Instantiate but ignore the type annoations
                const tyTy = instTerm(prims, env2, depth, tyAnnot, tyType, performTypeCheck)
                const synTy = tp(path, pat.expr)
                return synTy
            }
            case "EList": {
                const numElems = pat.exprs.length
                const tailSynTy = pat.tail === null ? tyNil : tp([...path, 0 - numElems], pat.tail)
                let listSynTy = tailSynTy

                pat.exprs.slice().reverse().forEach((p, i) => {
                    const elemSynTy = tp([...path, numElems - i - 1], p)
                    listSynTy = h.tyPair(elemSynTy, listSynTy, depth)
                })
                return listSynTy
            }
            // case "EPair": {
            //     const elems: Expr[] = []
            //     let list: Expr = pat
            //     while (list.tag === "EPair") {
            //         elems.push(list.hd)
            //         list = list.tl
            //     }
            //
            //     return tp(path, { tag: "EList", exprs: elems, tail: list, loc: pat.loc })
            // }
            default:
                throw new Error(`Missing case (${pat.tag})`)

        }

    }


    function instLambdaPat(
        prims: Primitives, env: GraphEnvRw, depth: Depth, path: number[],
        pat0: ExprLoc, tyVar: TypeAddrMb,
        ctxTy: TypeAddr, isCtxAnnot: boolean, performTypeCheck: boolean
    ): Addr {
        const noTyVar = addrNo

        const patAddr = ilp(path, pat0, tyVar, ctxTy, isCtxAnnot)
        return patAddr

        function ilp(path: number[], pat0: ExprLoc, tyVar: TypeAddrMb, ctxTy: TypeAddr, isCtxAnnot: boolean): Addr {
            const patAddr = ilp2(path, pat0, tyVar, ctxTy, isCtxAnnot)
            const pat2 = pat0 as ExprTypeGraph
            pat2.synTy = h.typeOf(patAddr)
            pat2.ctxTy = ctxTy
            if (isCtxAnnot) {
                pat2.ctxTy = h.tyOp2("{&}", pat2.ctxTy, pat2.synTy, depth)
            }
            pat2.rc = h.tyCon2("{\\}", pat2.ctxTy, pat2.synTy, depth)
            pat2.torp = "Pat"

            if (performTypeCheck) {
                gr.reduce(pat2.synTy)
                gr.reduce(pat2.ctxTy)
                ti.typeCheck("Pat", pat2.synTy, pat2.ctxTy, pat2.loc)
            }

            return patAddr
        }

        function ilp2(path: number[], pat0: ExprLoc, tyVar: TypeAddrMb, ctxTy: TypeAddr, isCtxAnnot: boolean): Addr {
            const pat = pat0 as ExprTypeGraph
            switch (pat.tag) {
                case "EVar": {
                    const patVarAddr = h.tmVar(path, depth, ctxTy)
                    let ctxTy2 = ctxTy
                    if (isAddrYes(tyVar)) {
                        ctxTy2 = h.tyOp2("{<:}", tyVar, ctxTy2, depth)
                    }
                    const defnVarAddr = h.tmVar(path, depth, ctxTy2)
                    env.set(pat.name, defnVarAddr)
                    return patVarAddr
                }
                case "EAs": {
                    const varAddr = h.tmVar(path, depth, ctxTy)
                    const patAddr = ilp(path, pat.expr, tyVar, ctxTy, isCtxAnnot)
                    const asAddr = h.tmAs(varAddr, patAddr, depth, ctxTy)
                    env.set(pat.name, varAddr)
                    return asAddr
                }
                case "EDatum": {
                    const datumAddr = h.tmDatum(pat.value)
                    return datumAddr
                }
                case "ETermBrackets": {
                    const patAddr = ilp(path, pat.expr, tyVar, ctxTy, isCtxAnnot)
                    return patAddr
                }
                case "EType": {
                    const annotTy = instTerm(prims, env, depth, pat.type, tyType, performTypeCheck)
                    assumeIsType(annotTy)
                    // If this is a type-annotation within a type-annotation,
                    //   then intersect the types.
                    // If this is the first/outer-most annotation, 
                    //   then forget the context, and just use this annotation.
                    const ctxTy2 =
                        isCtxAnnot
                            ? h.tyOp2("{&}", ctxTy, annotTy, depth)
                            : annotTy
                    const isCtxAnnot2 = true
                    const patAddr = ilp(path, pat.expr, noTyVar, ctxTy2, isCtxAnnot2)
                    const patTy = h.typeOf(patAddr)
                    const patAnnotIntersectTy = h.tyOp2("{&}", patTy, annotTy, depth)
                    const annotAddr = h.tmTyAnnot(patAddr, depth, patAnnotIntersectTy)
                    return annotAddr
                }
                case "EList": {
                    const numElems = pat.exprs.length
                    let listCtxTy = ctxTy
                    let listTyVar = tyVar
                    const elemCtxTys: TypeAddr[] = []
                    const elemTyVars: TypeAddrMb[] = []
                    for (const elem of pat.exprs) {
                        const elemCtxTy = h.tyPrim1("Hd", listCtxTy, depth)
                        const elemSynTy = typeLambdaPat(prims, env, depth, path, elem, performTypeCheck)
                        elemCtxTys.push(elemCtxTy)
                        const elemTyVar = tyHead(listTyVar, depth)
                        elemTyVars.push(elemTyVar)
                        listCtxTy = h.tyOp2("{&}", listCtxTy, h.tyPair(elemSynTy, tyAny, depth), depth)
                        listCtxTy = h.tyPrim1("Tl", listCtxTy, depth)
                        listTyVar = tyTail(listTyVar, depth)
                    }

                    let listPat =
                        pat.tail === null
                            ? h.tmDatum(null)
                            : ilp([...path, 0 - numElems], pat.tail, listTyVar, listCtxTy, isCtxAnnot)

                    pat.exprs.slice().reverse().forEach((p, i) => {
                        const elemAddr = ilp([...path, numElems - i - 1], p, elemTyVars[numElems - i - 1], elemCtxTys[numElems - i - 1], isCtxAnnot)
                        listPat = h.tmPair(elemAddr, listPat, depth)
                    })
                    return listPat
                }
                // case "EPair": {
                // Readback expressions currently contain EPairs not ELists.
                // This attempt to reuse the EList case code above doesn't work because the synTy+ctxTy annotations are 
                //   added to the new EList node and not the original EPair nodes.
                //     const elems: Expr[] = []
                //     let list: Expr = pat
                //     while (list.tag === "EPair") {
                //         elems.push(list.hd)
                //         list = list.tl
                //     }
                //     const listPat: Expr = { tag: "EList", exprs: elems, tail: list, loc: pat.loc }
                //     return instLambdaPat(env, depth, path, listPat, tyVar, ctxTy, isCtxAnnot)
                // }
                default:
                    throw new Error(`missing case (${pat.tag})`)

            }
        }
    }


    function instTerm(prims: Primitives, env: GraphEnvR, depth: Depth, expr: ExprLoc, ctxTy: TypeAddr, performTypeCheck: boolean): Addr {

        const term = instTerm1(env, depth, expr, ctxTy)
        return term

        function instTerm1(env: GraphEnvR, depth: Depth, expr: ExprLoc, ctxTy: TypeAddr): Addr {
            const term = instTerm2(env, depth, expr, ctxTy)
            const expr2 = expr as ExprTypeGraph
            expr2.tm = term
            expr2.synTy = h.typeOf(term)
            expr2.ctxTy = ctxTy
            expr2.rc = h.tyCon2("{\\}", expr2.synTy, expr2.ctxTy, depth)
            expr2.torp = "Term"

            // Reducing the syn+ctx types during instantiation means their values can be used to decide how future types are instantiated.
            // Specifically, how precise a context type should be used.
            // More precise context types means more type annotations can be ommitted by the user.
            // But precise types which cannot be reduced, can clog up the works, in such a way that no user added type-annotation can unclog.
            // Also, a type reduced to a function type can be checked for use of a term variable in a type,
            //   If we know a function has a non-dependent type, we can use the simple "Apply" primitive to calculate its return type.
            //   Otherwise we need the more complex/verbose "ApplyTyTm" primitive, which means having terms referenced from types just in case they are needed.
            // (These opportunities are not currently being exploited)
            if (performTypeCheck) {
                gr.reduce(expr2.synTy)
                gr.reduce(expr2.ctxTy)
            }
            // Performing type-checking during instantiation can make it possible to supress any cascades of errors.
            // (This opportunity isn't currently being exploited)
            if (performTypeCheck) {
                ti.typeCheck("Term", expr2.synTy, expr2.ctxTy, expr2.loc)
            }

            return term
        }

        function instTerm2(env: GraphEnvR, depth: Depth, expr: ExprLoc, ctxTy: TypeAddr): Addr {
            // if (locMatch(expr.loc, null, 276, 34, 276, 47)) {
            //     assert.breakpoint()
            // }

            switch (expr.tag) {
                case "EVar": {
                    const builtin = prims.get(expr.name)
                    // if (builtin !== null) {
                    //     // const op = this.instBuiltinApply(depth, builtins, builtin, env, [], ctxTy)
                    //     const op = instBuiltin(builtin)
                    //     return op
                    // }
                    if (builtin !== null && builtin.term !== undefined) {
                        return builtin.term
                    }
                    if (env.has(expr.name)) {
                        const term = env.get(expr.name)
                        return term
                    }
                    else {
                        // throw new Error(`unknown variable (${expr.name})`)
                        const varNameTm = h.tmDatum(expr.name)
                        const op = h.tmOp1("unknownVariable", varNameTm, depth, tyAny)
                        console.error(`Missing Graph Primitive (GraphInst): (${expr.name})`)
                        return op
                    }
                }
                case "ELet": {
                    const env2 = env.clone()
                    for (let [pat, defn] of expr.decls) {
                        const patSynTy = typeLetPat(prims, env2, depth, [], pat, tyAny, performTypeCheck)
                        const defnCtxTy = patSynTy
                        let defnTm = instTerm1(env2, depth, defn, defnCtxTy)
                        // TODO ? Should we reduce (top-level) terms during instantiation ?
                        // TODO ? This works, but isn't required.  
                        // if (depth === 0) {
                        //     gr.reduce(defnTm)
                        //     defnTm = h.copyWithoutIndirections(defnTm)
                        // }
                        const patCtxTy = h.typeOf(defnTm)
                        const isCtxAnnot = false
                        instLetPat(prims, env2, depth, pat, defnTm, patCtxTy, isCtxAnnot, performTypeCheck)
                    }
                    const term = instTerm1(env2, depth, expr.expr, ctxTy)
                    return term
                }
                case "EDatum": {
                    const datumTerm = h.tmDatum(expr.value)
                    return datumTerm
                }
                case "EList": {
                    let tailCtxTy = ctxTy
                    let elemTerms: Addr[] = []
                    // const pairCtxTys: Addr[] = []
                    for (const elem of expr.exprs) {
                        const elemCtxTy = h.tyPrim1("Hd", tailCtxTy, depth)
                        const elemTerm = instTerm1(env, depth, elem, elemCtxTy)
                        elemTerms.push(elemTerm)
                        // pairCtxTys.push(tailCtxTy)

                        // Computing this intersection helps provide a more precise context type for the tail of the list.
                        // This makes a difference when the tail type depends on the head type.
                        // This would be needed to get the fe4a/codec-pair test passing.
                        // Not performing the intersection is still valid,
                        //   the extra precision that would have been checked in the tail will instead be checked when the whole pair is checked.
                        // Ideally we would use the extra precision when it is easy to come by, and not when it isn't.
                        //   We would either need to be computing types at instantiation time, in order to choose early,
                        //   or have a mechanism to defer the choice, if we only reduce the types later.
                        // A new ternary (or quaternary) operator that takes a TI value and some types would help.
                        //   This would also need changes to the findNextRedex and reduction code.
                        // tailCtxTy = this_.h.tyOp2("&", tailCtxTy, this_.h.tyPair(elemSynTy, this_.h.tyOp0("Any")))

                        tailCtxTy = h.tyPrim1("Tl", tailCtxTy, depth)
                    }
                    let tailTerm =
                        expr.tail === null
                            ? h.tmDatum(null)
                            : instTerm1(env, depth, expr.tail, tailCtxTy)

                    elemTerms.slice().reverse().forEach((elemTerm, i) => {
                        const pairSynTy = h.tyPair(h.typeOf(elemTerm), h.typeOf(tailTerm), depth)
                        // const pairCtxTy = pairCtxTys[i]
                        tailTerm = h.tmPair(elemTerm, tailTerm, depth, pairSynTy)
                    })
                    return tailTerm
                }
                // case "EPair": {
                //     const hdCtxTy = this_.tyHead(depth, ctxTy)
                //     const hdTm = instTerm1(env, depth, expr.hd, hdCtxTy)
                //     const tlCtxTy = this_.tyTail(depth, ctxTy)
                //     const tlTm = instTerm1(env, depth, expr.tl, tlCtxTy)
                //     const pairTm = this_.h.tmPair(hdTm, tlTm, depth)
                //     return pairTm
                // }
                case "EPrim": {
                    const builtin = prims.get(expr.name)
                    if (builtin === null) {
                        // throw new Error(`Unknown operator (${expr.defn.name})`)
                        const opNameTm = h.tmDatum(expr.name, depthZero, tyStr)
                        const argsList = eList({ loc: expr.loc }, expr.args)
                        const argsListTm = instTerm1(env, depth, argsList, tyAny)
                        const op = h.tmOp2("unknownPrimitive", opNameTm, argsListTm, depth, tyAny)
                        return op
                    }
                    let opTy = builtin.type
                    const args: Addr[] = []
                    for (const arg of expr.args) {
                        const argCtxTy = h.tyPrim1("Dom", opTy, depth)
                        const argTm = instTerm1(env, depth, arg, argCtxTy)
                        args.push(argTm)

                        // opTy = h.tyApplyTyTm(opTy, argTm, depth)

                        const argTy = h.typeOf(argTm)

                        // // opTy = pred.isDependentFunTy(opTy) === false
                        // //     ? h.tyApply(opTy, addrNo, argTy, depth)
                        // //     : h.tyApply(opTy, argTm, argTy, depth)

                        opTy = applyFunTy(depth, opTy, argTm, argTy)

                        // // opTy = h.tyApply(opTy, addrNo, argTy, depth)
                        // // opTy = h.tyApply(opTy, argTm, argTy, depth)
                    }

                    const opDepth = depth
                    const builtinTy = opTy
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

                    return op2

                }
                case "EApply": {
                    // Check if we are applying a built-in ?
                    // Use (1 + 2), avoid needless terms like ((v1 -> v2 -> v1 + v2) 1 2)

                    const appArgExprs: [ExprTypeGraph, ExprTypeGraph][] = []
                    let exp: ExprTypeGraph = expr as ExprTypeGraph
                    while (exp.tag === "EApply") {
                        appArgExprs.push([exp, exp.arg])
                        exp = exp.func
                    }
                    appArgExprs.reverse()
                    let builtin: Builtin | null = null
                    if (exp.tag === "EVar" && env.has(exp.name)) {
                        const addr = env.get(exp.name)
                        builtin = prims.getByAddr(addr)
                        if (builtin === null) {
                            builtin = prims.get(exp.name)
                        }
                    }

                    if (builtin !== null && appArgExprs.length === builtin.arity) {
                        assert.isTrue(exp.tag === "EVar")

                        let opSynTy = builtin.type
                        const argAddrs: Addr[] = []
                        exp.tm = builtin.term as Addr
                        exp.synTy = builtin.type
                        exp.ctxTy = tyAny
                        exp.rc = tyVoid
                        exp.torp = "Term"

                        let opCtxTy = tyAny
                        for (const [app, arg] of appArgExprs) {
                            const argCtxTy = h.tyPrim1("Dom", opSynTy, depth)
                            const argTm = instTerm1(env, depth, arg, argCtxTy)
                            argAddrs.push(argTm)
                            const argTy = h.typeOf(argTm)
                            opSynTy = applyFunTy(depth, opSynTy, argTm, argTy)
                            app.synTy = opSynTy
                            app.ctxTy = tyAny
                            app.torp = "Term"
                        }

                        const opDepth = depth
                        const builtinTy = opSynTy
                        let op2: Addr

                        switch (builtin.arity) {
                            case 1:
                                op2 = h.tmOp1(builtin.nameG, argAddrs[0], opDepth, builtinTy)
                                break
                            case 2:
                                op2 = h.tmOp2(builtin.nameG, argAddrs[0], argAddrs[1], opDepth, builtinTy)
                                break
                            default:
                                assert.unreachable()
                        }

                        return op2
                    }


                    // This funCtxTy is too demanding.
                    //   The term in the function position of this application needn't return something within the ctxTy for any argument,
                    //     only for arguments it is going to be called with by this particular applications.
                    //   A better type would be { argSynTy -> appCtxTy },
                    //     but the synthesized type of the term in the argument position won't be known until after the function term has been instantiated.
                    // TODO ? Use holes so as to be able to instantiate the function and argument in a mutually/recursively dependent way ?
                    // TODO ?   (maybe later, for now just get this to work the same way tree-types work).
                    // const funcCtxTy = this_.tyFun(depth, null, null, this_.tyVoid, ctxTy)

                    switch (expr.op) {
                        case "":
                        case "<|": {
                            // Using { Void -> Any } Seems like a lost opportunity to use contextual information, 
                            //   but it worked well enough for tree types to be mostly usable.
                            const funcCtxTy = h.tyFun(addrNo, addrNo, tyVoid, tyAny, depth)
                            const funTm = instTerm1(env, depth, expr.func, funcCtxTy)
                            const funTy = h.typeOf(funTm)
                            const funcSynTy = h.directAddrOf(h.typeOf(funTm))

                            // The tree-type special-cases don't work if the function/argument types are unevaluated.
                            // Do we want to evaluate the graph as we instantiate, 
                            //   or finish instantiation before starting on reduction ?

                            // Instead, use syntax to determine how precise the context type for the argument should be.
                            const argCtxTy =
                                isLambdaExpr(expr.arg) && !isPatTypeAnnotated(expr.arg.pat)
                                    ? h.tyPrim2("InverseApply", funcSynTy, ctxTy, depth)
                                    : h.tyPrim1("Dom", funcSynTy, depth)

                            const argTm = instTerm1(env, depth, expr.arg, argCtxTy)
                            const argTy = h.typeOf(argTm)

                            // const applyTy = h.tyApplyTyTm(h.typeOf(funTm), argTm, depth)

                            // const applyTy = h.tyApplyTyTm(funTy, argTm, depth)

                            // // gr.reduceAll(funTy, formWeak)
                            const applyTy = applyFunTy(depth, funTy, argTm, argTy)
                            // // const applyTy = h.tyApply(funTy, argTm, argTy, depth)

                            const applyTm = h.tmApply(funTm, argTm, depth, applyTy)
                            return applyTm
                        }
                        case "|>": {
                            const argCtxTy = tyAny
                            const argTerm = instTerm1(env, depth, expr.arg, argCtxTy)
                            const funcCtxTy = h.tyFun(addrNo, addrNo, h.typeOf(argTerm), tyAny, depth)
                            const funcTerm = instTerm1(env, depth, expr.func, funcCtxTy)

                            // const applyTy = h.tyApplyTyTm(h.typeOf(funcTerm), argTerm, depth)

                            const funTy = h.typeOf(funcTerm)
                            // // gr.reduceAll(funTy, formWeak)
                            const applyTy = applyFunTy(depth, funTy, argTerm, h.typeOf(argTerm))

                            const applyTm = h.tmApply(funcTerm, argTerm, depth, applyTy)
                            return applyTm
                        }
                        default:
                            assert.noMissingCases(expr.op)
                    }
                }

                case "ELambda":
                case "ELambdaMaybe":
                case "ELambdaYes":
                case "ELambdaNo": {

                    const no = booleanToBool(expr.tag === "ELambdaNo" || expr.tag === "ELambdaMaybe")
                    const yes = booleanToBool(expr.tag === "ELambdaYes" || expr.tag === "ELambdaMaybe")
                    const varDepth = depthInc(depth)

                    // Guarded-lambdas ( |-> and |=> ) and polymorphic-lambdas ( (a : A @ ...) -> ...)
                    //   are handled separately.
                    // Ideally these two concepts should be orthogonal, 
                    //   but so far the need has not arisen,
                    //   and in practice, at least while getting things first working, 
                    //   it's easier to consider (and debug) them separately.

                    if (no) {
                        const patCtxTy = h.tyPrim1("Dom", ctxTy, depth)
                        const patGuardTy = typeLambdaPat(prims, env, varDepth, [], expr.pat, performTypeCheck)
                        const pat_yes = h.tyOp2("{&}", patCtxTy, patGuardTy, varDepth)
                        const pat_no = h.tyOp2("{\\}", patCtxTy, patGuardTy, varDepth)
                        const env2 = env.clone()
                        const isCtxAnnot = false
                        const patAddr = instLambdaPat(prims, env2, varDepth, [], expr.pat, addrNo, pat_yes, isCtxAnnot, performTypeCheck)

                        // The patSynTy type can be too narrow here, we want the full domain, not just the part that matches.
                        // let bodyCtxTy = h.tyApply(ctxTy, patSynTy)
                        // The patCtxTy type can also be too narrow, as it doesn't account for any widening type-annotations on the pattern.
                        // It's unusual to use type-annotations on a pattern guard though (possibly they should be banned to avoid confusion).
                        const argTm = addrNo
                        let bodyCtxTy = h.tyApply(ctxTy, patCtxTy)

                        if (yes) {
                            bodyCtxTy = h.tyHead(bodyCtxTy, depth)
                        }
                        let bodyTerm = instTerm1(env2, varDepth, expr.body, bodyCtxTy)
                        let bodySynTy = h.typeOf(bodyTerm)
                        if (yes) {
                            bodySynTy = h.tyPair(bodySynTy, tyNil, varDepth)
                        }
                        bodySynTy = h.tyOp2("{|}", bodySynTy, tyNil, varDepth)

                        // The type of a LambdaNo function is 
                        //  { { D&M -> C } & { D\M -> [] } <: { D -> C | [] } }
                        // The type of a LambdaMaybe function is 
                        //  { { D&M -> [C] } & { D\M -> [] } <: { D -> [C] | [] } }

                        // TODO ? switch to these, use "Any" as the codomain of the super-type, similar to the tree-types ?
                        // The type of a LambdaNo function is 
                        //  { { D&M -> C } & { D\M -> [] } <: { D -> Any } }
                        // The type of a LambdaMaybe function is 
                        //  { { D&M -> [C] } & { D\M -> [] } <: { D -> Any } }

                        const funTy = h.tyFun(pat_no, pat_yes, patCtxTy, bodySynTy, depth)
                        const funTm = h.tmLam(no, yes, patAddr, bodyTerm, depth, funTy)
                        return funTm


                    }
                    else {

                        let expr_pat1 = expr.pat
                        if (expr_pat1.tag === "ETermBrackets") {
                            addDummyTypes(expr_pat1 as ExprTypeGraph)
                            expr_pat1 = expr_pat1.expr
                        }

                        const [expr_pat, tyVarName, tyVarType] =
                            expr_pat1.tag === "EType" && expr_pat1.type.tag === "EAs"
                                ? [expr_pat1.expr, expr_pat1.type.name, expr_pat1.type.expr]
                                : [expr_pat1, null, null]


                        if (expr_pat1.tag === "EType" && expr_pat1.type.tag === "EAs") {
                            addDummyTypes(expr_pat1 as ExprTypeGraph)
                            addDummyTypes(expr_pat1.type as ExprTypeGraph)
                            addDummyTypes(expr_pat1.expr as ExprTypeGraph)
                        }

                        const env2 = env.clone()
                        const patCtxTy = h.tyPrim1("Dom", ctxTy, depth)
                        const patGuardTy = typeLambdaPat(prims, env, varDepth, [], expr.pat, performTypeCheck)
                        const pat_yes = yes ? h.tyOp2("{&}", patCtxTy, patGuardTy, varDepth) : addrNo

                        const tyVar = h.tyVar(varDepth)
                        let bodyCtxTy: TypeAddr
                        let patTerm: Addr

                        if (tyVarName !== null) {
                            env2.set(tyVarName, tyVar)
                        }
                        else {
                            // Using a default name here is a temporary accomodation
                            //   for the readback code which isn't using an EAs expr where it should.
                            env2.set(`V${varDepth}`, tyVar)
                        }

                        const patCtxTy2 = tyVarType === null ? patCtxTy : instTerm(prims, env2, varDepth, tyVarType, tyType, performTypeCheck)
                        assumeIsType(patCtxTy2)
                        const isCtxAnnot = false
                        const patAddr = instLambdaPat(
                            prims, env2, varDepth, [],
                            expr_pat, tyVarName === null ? addrNo : tyVar,
                            patCtxTy2, isCtxAnnot, performTypeCheck
                        )

                        const patSynTy = h.typeOf(patAddr)

                        // Change the @-bound variable name to include the sub-type relation
                        if (tyVarName !== null) {
                            env2.set(tyVarName, h.tyOp2("{<:}", tyVar, patCtxTy2, varDepth))
                        }

                        const patSynTy2 = tyVarName === null ? h.typeOf(patAddr) : h.tyOp2("{<:}", tyVar, h.typeOf(patAddr), varDepth)

                        // patTerm = h.copy(patToTerm(patAddr), patSynTy2)
                        // TODO ? Make ApplyTyTm a 3-place primitive [funTy, argTm, argTy]
                        // TODO ?   so as not to need to glue the argTm/argTy together with a tmTyAnnot node.
                        patTerm = h.tmTyAnnot(patToTerm(patAddr), varDepth, patSynTy2)

                        // TODO ? Check if the ctxTy function type actually uses the term-value at the type-level,
                        // TODO ?   if not, we can use a simple "Apply" so as not to have the "ApplyTyTm" hold on to terms needlessly.



                        // TODO This should be changed over to using applyFunTy
                        // TODO However this results in the examples/power test failing.
                        // TODO   This would pass if sufficient reduction under lambdas was being performed, but its not, this is s a bug.
                        // TODO   Performing more reduction under lambdas reveals further bugs in the handling of cyclic graphs.
                        // TODO   Primitive nodes are being marked as reduced when they shouldn't be.
                        // TODO   This can occur when the argument of a primitive is already on the stack.
                        // TODO   We still need to attempt to reduce such primitives,
                        // TODO     but mustn't mark them as any further reduced than their arguments.
                        // bodyCtxTy = h.tyApplyTyTm(ctxTy, patTerm, varDepth)
                        bodyCtxTy = applyFunTy(varDepth, ctxTy, patTerm, patSynTy2)

                        if (yes) {
                            bodyCtxTy = h.tyPrim1("Hd", bodyCtxTy, varDepth)
                        }
                        let bodyTerm = instTerm1(env2, varDepth, expr.body, bodyCtxTy)
                        let bodySynTy = h.typeOf(bodyTerm)
                        if (yes) {
                            bodySynTy = h.tyPair(bodySynTy, tyNil, varDepth)
                        }

                        const lamSynTy = h.tyFun(addrNo, pat_yes, patSynTy, bodySynTy, depth)
                        const lambdaTerm = h.tmLam(no, yes, patAddr, bodyTerm, depth, lamSynTy)
                        return lambdaTerm
                    }
                }
                case "ETypeBrackets": {
                    const tyTm = instType(prims, env, depth, expr.expr, tyType, performTypeCheck)
                    return tyTm
                }
                case "EType": {
                    const ty = instTerm1(env, depth, expr.type, tyType) as TypeAddr
                    const tm = instTerm1(env, depth, expr.expr, ty)
                    return h.tmTyAnnot(tm, depth, ty)
                }
                case "ETermBrackets":
                    return instTerm1(env, depth, expr.expr, ctxTy)

                case "EAs":
                case "ESym":
                default:
                    throw new Error(`unhandled case (${expr.tag})`)
            }
        }

    }

    function instType(prims: Primitives, env: GraphEnvR, depth: Depth, expr0: ExprLoc, ctxTy: TypeAddr, performTypeCheck: boolean): TypeAddr {
        // TODO The ctxTy is currently always "Type"
        // TODO ? Add support for sub-types (power-sets) ?
        // TODO ?   { Key @ Int -> ... } ArgType
        // TODO ? The context for the ArgType is (SubType Int)

        const ty = instType1(env, depth, expr0, ctxTy)
        return ty

        function instType1(env: GraphEnvR, depth: Depth, expr: ExprLoc, ctxTy: TypeAddr): TypeAddr {
            const type = instType2(env, depth, expr, ctxTy)
            // this.mapping.set(expr, type)
            const expr2 = expr as ExprTypeGraph
            expr2.tm = type
            expr2.synTy = h.typeOf(type)
            expr2.ctxTy = ctxTy
            expr2.rc = h.tyCon2("{\\}", expr2.synTy, expr2.ctxTy, depth)
            expr2.torp = "Term" // all types are implicitly also terms

            if (performTypeCheck) {
                gr.reduce(expr2.synTy)
                gr.reduce(expr2.ctxTy)
                ti.typeCheck("Term", expr2.synTy, expr2.ctxTy, expr2.loc)
            }

            return type
        }


        function instType2(env: GraphEnvR, depth: Depth, expr0: ExprLoc, ctxTy: TypeAddr): TypeAddr {
            const expr = expr0 as ExprTypeGraph
            switch (expr.tag) {
                case "EVar": {
                    const type = env.get(expr.name)
                    assumeIsType(type)
                    if (type === undefined) {
                        throw new Error(`unknown variable (${expr.name})`)
                    }
                    return type
                }
                case "ELambda": {
                    const varDepth = depthInc(depth)
                    if (expr.pat.tag === "EAs") {
                        // A polymorphic function
                        // { TyVar @ DomainType -> CodomainType }
                        const env2 = env.clone()
                        const tyVar = h.tyVar(varDepth, tyType)

                        expr.pat.synTy = tyType
                        expr.pat.ctxTy = tyType
                        expr.pat.rc = h.tyPrim0("Void", depthZero)
                        expr.pat.torp = "Pat"

                        env2.set(expr.pat.name, tyVar)
                        let dom = instType1(env2, varDepth, expr.pat.expr, tyType)
                        const dom2 = h.tyOp2("{<:}", tyVar, dom, varDepth)
                        env2.set(expr.pat.name, dom2)
                        let cod = instType1(env2, varDepth, expr.body, tyType)
                        let funTy = h.tyFun(addrNo, addrNo, dom, cod, depth)
                        return funTy
                    }
                    // else if (expr.pat.tag === "ETypeBrackets" && expr.pat.expr.tag === "EType" && expr.pat.expr.expr.tag === "EVar") {
                    else if (expr.pat.tag === "EType" && expr.pat.expr.tag === "EVar") {
                        // A dependent function
                        // This makes the argument term available at the type-level.
                        // { { tmVar : DomainType } -> CodomainType }
                        // { { T : Type } -> CodomainType }
                        // { { x : Int } -> CodomainType }

                        // TODO annotate the termVar with the annotated type, which need not be "Type".
                        const tmVar = h.tmVar([], varDepth, tyType)

                        expr.pat.synTy = tyType
                        expr.pat.ctxTy = tyType
                        expr.rc = h.tyPrim0("Void", depthZero)
                        expr.pat.torp = "Pat"

                        expr.pat.expr.synTy = tyType
                        expr.pat.expr.ctxTy = tyType
                        expr.pat.expr.rc = h.tyPrim0("Void", depthZero)
                        expr.pat.expr.torp = "Pat"

                        // const expr_pat_expr = expr.pat.expr
                        const expr_pat_expr = expr.pat
                        assert.isTrue(expr_pat_expr.tag === "EType")
                        assert.isTrue(expr_pat_expr.expr.tag === "EVar")

                        // expr.pat.expr.expr.synTy = tyType
                        // expr.pat.expr.expr.ctxTy = tyType
                        // expr.pat.expr.expr.rc = h.tyPrim0("Void", depthZero)
                        // expr.pat.expr.expr.torp = "Pat"

                        const env2 = env.clone()
                        env2.set(expr_pat_expr.expr.name, tmVar)
                        let dom = instType1(env2, varDepth, expr_pat_expr.type, tyType)
                        let cod = instType1(env2, varDepth, expr.body, tyType)
                        let funTy = h.tyFun(addrNo, addrNo, dom, cod, depth)
                        return funTy
                    }
                    else {
                        // Non-polymorphic non-dependent function type, the codomain make no reference to the domain.
                        // { DomainType -> CodomainType }
                        const env2 = env
                        const pat = expr.pat
                        let dom = instType1(env2, varDepth, pat, tyType)
                        let cod = instType1(env2, varDepth, expr.body, tyType)
                        let funTy = h.tyFun(addrNo, addrNo, dom, cod, depth)
                        return funTy
                    }
                }
                // case "EAs": {
                //     // TODO handle the as-binding correctly
                //     let ty = instType1(env, depth, expr.expr, ctxTy)
                //     const tyVar = h.tyVar(depth, tyType)
                //     env.set(expr.name, tyVar)
                //     return ty
                // }
                case "ETypeBrackets": {
                    let ty = instType1(env, depth, expr.expr, tyType)
                    return ty
                }
                case "EApply": {
                    const funcTy = instType1(env, depth, expr.func, tyType)
                    // TODO Check the syntax of the argument.
                    // TODO   { F       A   }   is a non-dependent type-application
                    // TODO   { F { a : A } }   is a     dependent type-application
                    const argTm = addrNo
                    const argTy = instType1(env, depth, expr.arg, tyType)
                    const applyTy = h.tyApply(funcTy, argTy, depth)
                    return applyTy
                }
                case "EPrim": {
                    const opName = expr.name
                    if (isAlpha(opName)) {
                        const type = env.get(opName) as TypeAddr
                        if (type === undefined) {
                            throw new Error(`unknown variable (${opName})`)
                        }
                        return type
                    }
                    const builtin = prims.get(expr.name)
                    if (builtin === null) {
                        throw new Error(`Unknown operator (${expr.name})`)
                    }
                    if (expr.args.length !== builtin.arity) {
                        throw new Error(`Incorrect number of operands (${expr.args.length} /= ${builtin.arity}) for operator (${expr.name})`)
                    }
                    let opTy = builtin.type
                    const args: TypeAddr[] = []
                    for (const arg of expr.args) {
                        const argCtxTy = h.tyPrim1("Dom", opTy, depth)
                        const argTy = instType1(env, depth, arg, argCtxTy)
                        args.push(argTy)
                        // // opTy = this.tyApply(depth, opTy, this.tyOf(argTm))
                        // opTy = h.tyApplyTyTm(opTy, argTm, depth)
                        // TODO Check if opTy uses its term-var at the type-level.
                        // TODO If so, use the argument term in the type-application.
                        // const argTm = addrNo
                        // opTy = applyFunTy(depth, opTy, argTm, argTy)

                        opTy = h.tyApply(opTy, argTy)
                    }
                    if (builtin.arity !== 2) {
                        throw new Error("TODO?")
                    }
                    // assert.isTrue(isTyOp2Name_Concrete(expr.name))
                    // const op = h.tyOp2(`{${expr.name}}`, args[0], args[1], depth, opTy)
                    assert.isTrue(isTyOp2Name(expr.name))
                    const op = h.tyOp2(`${expr.name}`, args[0], args[1], depth, opTy)
                    return op
                }
                case "ETermBrackets": {
                    const termTy = instTerm(prims, env, depth, expr.expr, tyType, performTypeCheck)
                    assumeIsType(termTy)
                    return termTy
                }
                case "EDatum": {
                    return typeOfDatum(expr.value)
                }
                case "EList": {
                    const elemTys: TypeAddr[] = []
                    for (const elem of expr.exprs) {
                        const elemTy = instType1(env, depth, elem, tyType)
                        elemTys.push(elemTy)
                    }
                    const tailTy = expr.tail === null ? tyNil : instType1(env, depth, expr.tail, tyType)
                    const listTy = elemTys.reduceRight((listTy, elemTy) => h.tyPair(elemTy, listTy, depth), tailTy)
                    return listTy
                }
                // case "EPair": {
                //     const hdTy = instType1(env, depth, expr.hd, ctxTy)
                //     const tlTy = instType1(env, depth, expr.tl, ctxTy)
                //     const pairTy = this.h.tyPair(hdTy, tlTy)
                //     return pairTy
                // }
                // case "EType": {
                //     // A term-annotation on a type.
                //     // Outside of a pattern, this amounts to a term-check on a type, dual to a type-check on a term.
                //     const annotTy = instType1(env, depth, expr.type, ctxTy)
                //     // We're still within type-brackets until we encounter explicit term-brackets
                //     // However, the new annotTy context type is not neccessarily "Type", perhaps need to pass in a ctxTy to instType after all.
                //     // Not currently expecting to enounter a term-annotaion outside of a pattern.
                //     const annotTm = instType1(env, depth, expr.expr, annotTy)
                //     // TODO ? Instantiate an explicit term/type annotation node ?
                //     return annotTy
                // }
                case "EType":
                case "ELet":
                case "ELambdaMaybe":
                case "ELambdaNo":
                case "ELambdaYes":
                case "ESym":
                case "EAs":
                case "EPair":
                case "ETypeAs":
                    assert.unreachable()
                default:
                    assert.noMissingCases(expr)
            }
        }
    }


    function instDecl(prims: Primitives, env: GraphEnvRw, depth: Depth, pat: ExprLoc, defn: ExprLoc, performTypeCheck: boolean): Bindings {
        const patSynTy = typeLetPat(prims, env, depth, [], pat, tyAny, performTypeCheck)
        const defnCtxTy = patSynTy
        let defnTm = instTerm(prims, env, depth, defn, defnCtxTy, performTypeCheck)
        const patCtxTy = h.typeOf(defnTm)
        const isCtxAnnot = false
        const bindings = instLetPat(prims, env, depth, pat, defnTm, patCtxTy, isCtxAnnot, performTypeCheck)
        return bindings
    }


}



