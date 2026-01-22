import { unit } from "../utils/unit.js";
import { assert } from "../utils/assert.js";
import {
    Addr, Addr_of_Prim, Addr_of_TmApply, Addr_of_TmAs, Addr_of_TmDatum, Addr_of_TmLambda, Addr_of_TmPair, Addr_of_TmTyAnnot, Addr_of_TmVar,
    Addr_of_TyApply, Addr_of_TyFun, Addr_of_TyPair, Addr_of_TySingleStr, Addr_of_TyVar,
    AddrMb, AddrNo, addrNo, ContextForm, Depth, depthZero, Form, formError, formGte, formLt, formMax, formMin as formMin, formNone, formStrong, formWeak,
    Heap, isAddrNo, isAddrYes, NodeWalker, strong, TargetForm, TypeAddr, Visitor, weak
} from "../graph/graph-heap2.js"
import { ExprAddr, RbLamEnv, RbLetEnv, readback } from "../graph/graph-readback.js";
import { showGraph } from "../graph/graph-show.js"
import { ExprDoc, mkPrettyFerrum2, p2Show2, prettyFerrum, prettyFerrumStyleDefns } from "../syntax/pretty-ferrum.js"
import { check } from "./graph-check.js"
import { ActionResult, Builtins, isArUpdate } from "./graph-primitives.js"
import { Instantiate } from "../graph/graph-instantiate.js";
import { Primitives } from "./graph-primitives.js";
import { showForm } from "../graph/graph-show.js";
import { Substitute } from "./graph-substitute.js";
import { UiText, uiTextToStr } from "../ui/text.js";
import { createDummyStyles } from "../ui/app-ui.js";
import { ExprLoc } from "../syntax/expr.js";
import { GraphMonitor } from "../graph/code-table.js";
import { Fuel, fuelMk } from "../ui/fuel.js";
import { GraphApply } from "./graph-apply.js";

// TODO ? Maintain an explicit stack, for diagnostic purposes.
// TODO ?   Currently the graph-reduction stack is stored implicitly in the JS stack.
// type StackEntry = {
//     addr: Addr,
//     form: TargetForm,
// }
// type Stack = StackEntry[]

export type GraphReduce = {
    reduce(addr: Addr): unit

    // TODO ? provide an Env of known addresses, for diagnostic purposes ?
    // reduce: (addr: Addr, env?: Env) => unit
}

// const gr_console_log = console.log
const gr_console_log = (...args: any[]) => { }

export function mkGraphReduce(h: Heap, subst: Substitute, primitives: Primitives, ga: GraphApply, monitor: GraphMonitor): GraphReduce {

    const prettyFerrumStyleNums = createDummyStyles(prettyFerrumStyleDefns, "")

    function showExpr(expr: ExprAddr) {

        const idExprMap: Map<number, ExprDoc> = new Map
        const exprIdMap: Map<ExprDoc, number> = new Map
        const addrIdsMap: Map<Addr, number[]> = new Map
        const idTextMap: Map<number, UiText<number>> = new Map

        const pf = mkPrettyFerrum2(40, 40, prettyFerrumStyleNums, idExprMap, exprIdMap, addrIdsMap)
        const exprD = pf.pExpr(expr)
        const exprTxt = p2Show2(prettyFerrumStyleNums.std, exprD.doc, idTextMap)
        const exprStr = uiTextToStr(exprTxt)
        return exprStr
    }

    // function printHeap(count: number, stack: Stack) {
    //     console.log(`\n\nCount: ${count}`)
    //     // console.log("Stack: ", JSON.stringify(stack))
    //     console.log("Stack: ", stack.map(([a, f]) => `${a}-${showForm(f)}`).join(", "))
    //     const ok = check(h, stack[0][0])
    //     console.log(`CHECK-${ok}`)
    //     console.log(showGraph(h, stack.map(([a, f]) => a)).join("\n"))
    //     const rootAddr = stack[0][0]
    //     // const rbLetVars: RbLetEnv = new Map
    //     const rbLamVars: RbLamEnv = new Map
    //     const expr = readback(h, rbLamVars, "Term", rootAddr)
    //     const exprStr = prettyFerrum(expr)
    //     console.log("Expr: ", exprStr)
    //     console.log(showExpr(expr))
    // }

    function printHeap(count: number, rootAddr: Addr) {
        console.log(`\n\nCount: ${count}`)
        const ok = check(h, rootAddr)
        console.log(`CHECK-${ok}`)
        console.log(showGraph(h, [rootAddr]).join("\n"))
        // const rbLetVars: RbLetEnv = new Map
        const rbLetVars: RbLetEnv = new Map
        const rbLamVars: RbLamEnv = new Map
        const expr = readback(h, rbLetVars, rbLamVars, "Term", rootAddr)
        const exprStr = prettyFerrum(expr)
        console.log("Expr: ", exprStr)
        console.log(showExpr(expr))
    }


    // This calculates the form that should be assigned to a reduced node.
    function mergeFormsOf(limitForm: Form, ...addrs: AddrMb[]): Form {
        let resultForm = limitForm
        for (let addr of addrs) {
            if (isAddrNo(addr)) continue
            addr = h.directAddrOf(addr)
            let form = h.formOf(addr)
            if (form === h.targetFormOf(addr)) {
                // A node being reduced to its target form is as good as being reduced to strong form.
                form = formStrong
            }
            if (form === formError) return formError
            resultForm = formMin(resultForm, form)
        }
        return resultForm
    }


    function reduce(addr: Addr): unit {

        const inStack = new Set<Addr>
        // TODO Maintain a stack list too, for diagnostic purposes ?
        // const stack = StackEntry[]

        function red1(addr: TypeAddr, contextForm: TargetForm, limitForm: TargetForm): TypeAddr
        function red1(addr: Addr, contextForm: TargetForm, limitForm: TargetForm): Addr
        function red1(addr: AddrMb, contextForm: TargetForm, limitForm: TargetForm): AddrMb
        function red1(addr: AddrMb, contextForm: TargetForm, limitForm: TargetForm): AddrMb {
            if (isAddrNo(addr)) return addrNo

            if (inStack.size > 1000) {
            // if (inStack.size > 10000) {
            // if (inStack.size > 100000) {
                console.error(`Large Stack`)
                throw new Error("Suspiciously large stack")
            }

            let nextAddr: Addr = h.directAddrOf(addr)
            let currentForm: Form = h.formOf(nextAddr)
            let targetForm: Form = h.targetFormOf(nextAddr)

            do {
                if (contextForm === formWeak && limitForm === formStrong && targetForm === formStrong) {
                    // If we're transitioning from a weak region to a strong region,
                    //   then reduce the node first to weak form, then to strong form.
                    const resultW = red1(addr, formStrong, formWeak)
                    const resultS = red1(addr, formStrong, formStrong)
                    return resultS
                }
                else {
                    addr = h.directAddrOf(nextAddr)
                    if (inStack.has(addr)) return addr
                    inStack.add(addr)
                    nextAddr = red2(addr, limitForm)
                    inStack.delete(addr)
                    currentForm = h.formOf(nextAddr)
                    targetForm = h.targetFormOf(nextAddr)
                }
            } while (formLt(currentForm, formMin(limitForm, targetForm)) && nextAddr !== addr)

            return nextAddr

        }

        function red2(addr: Addr, limitForm: TargetForm): Addr {

            const currentForm = h.formOf(addr)
            const targetForm = h.targetFormOf(addr)
            const limitTargetForm = formMin(limitForm, targetForm)

            if (formGte(currentForm, limitTargetForm)) return addr

            const result = h.nodeGuide<Addr>({
                tmDatum(addr: Addr_of_TmDatum) {
                    h.setForm(addr, limitTargetForm)
                    return addr
                },

                tmPair(addr: Addr_of_TmPair) {
                    const hd = red1(h.hd_tm(addr), targetForm, limitForm)
                    const tl = red1(h.tl_tm(addr), targetForm, limitForm)
                    const newForm = mergeFormsOf(limitTargetForm, hd, tl)
                    h.setForm(addr, newForm)
                    return addr
                },

                tmApply(addr: Addr_of_TmApply) {
                    const fun = red1(h.fun_tm(addr), targetForm, limitForm)
                    const arg = red1(h.arg_tm(addr), targetForm, limitForm)
                    const depth = h.depthOf(addr)
                    const resultAddrMb = subst.tryApply(depth, fun, arg, targetForm)
                    // if (isAddrYes(resultAddrMb)) {
                    if (resultAddrMb !== null) {
                        h.update(addr, resultAddrMb)
                        return resultAddrMb
                    }
                    const newForm = mergeFormsOf(limitTargetForm, fun, arg)
                    h.setForm(addr, newForm)
                    return addr
                },

                tmLambda(addr: Addr_of_TmLambda) {
                    if (limitTargetForm === formStrong) {
                        const pat = h.pat_tm(addr)
                        const bod = h.body_tm(addr)
                        red1(pat, targetForm, formWeak)
                        red1(bod, targetForm, formWeak)
                        red1(pat, targetForm, formStrong)
                        red1(bod, targetForm, formStrong)
                        const newForm = mergeFormsOf(limitTargetForm, bod) // TODO ? Add "pat" ?
                        h.setForm(addr, newForm)
                    }
                    else {
                        h.setForm(addr, formWeak)
                    }
                    return addr
                },

                tmVar(addr: Addr_of_TmVar) {
                    h.setForm(addr, limitTargetForm)
                    return addr
                },

                tmAs(addr: Addr_of_TmAs) {
                    // assert.impossible("As-terms can only occur in patterns.")
                    // TODO ? We might need this when pattern-reduction is implemented ?
                    assert.todo("? Add support for pattern-reduction ?")
                },

                tmTyAnnot(addr: Addr_of_TmTyAnnot) {
                    const tmAddr = h.term_tm(addr)
                    const result = red1(tmAddr, targetForm, limitForm)
                    h.update(addr, result)
                    return result
                },

                tySingleStr(addr: Addr_of_TySingleStr) {
                    h.setForm(addr, limitTargetForm)
                    return addr
                },

                tyPair(addr: Addr_of_TyPair) {
                    const hd = red1(h.hd_ty(addr), targetForm, limitForm)
                    const tl = red1(h.tl_ty(addr), targetForm, limitForm)
                    const newForm = mergeFormsOf(limitTargetForm, hd, tl)
                    h.setForm(addr, newForm)
                    return addr
                },

                tyFun(addr: Addr_of_TyFun) {
                    const dom = red1(h.dom_ty(addr), targetForm, limitForm)
                    const cod = red1(h.cod_ty(addr), targetForm, limitForm)
                    const newForm = mergeFormsOf(limitTargetForm, dom, cod)
                    h.setForm(addr, newForm)
                    return addr
                },

                tyVar(addr: Addr_of_TyVar) {
                    h.setForm(addr, limitTargetForm)
                    return addr
                },

                tyApply(addr: Addr_of_TyApply) {
                    const depth = h.depthOf(addr)
                    const nodeTag = h.nodeTag(addr)
                    const form = formWeak

                    const funTy = red1(h.funTy_of(addr), targetForm, limitForm)
                    const argTy = red1(h.argTy_of(addr), targetForm, limitForm)

                    const result = ga.apply_funTy_argTy(depth, funTy, argTy)

                    if (result === null) {
                        gr_console_log(`Mark Reduction (${nodeTag}) at (${addr})`)
                        const newForm = mergeFormsOf(limitTargetForm, funTy, argTy)
                        h.setForm(addr, form)
                        monitor.graphReduction(addr, "Mark")
                        return addr
                    }
                    assert.isTrue(isArUpdate(result))
                    gr_console_log(`Beta Reduction at (${addr})`)
                    h.update(addr, result)
                    monitor.graphReduction(addr, "Beta")
                    return result
                },

                prim(addr: Addr_of_Prim): Addr {

                    const depth = h.depthOf(addr)
                    const nodeTag = h.nodeTag(addr)

                    const numArgs = h.nodeArity(addr)

                    if (numArgs === 0) {
                        gr_console_log(`Mark Reduction (${nodeTag}) at (${addr})`)
                        h.setForm(addr, limitTargetForm)
                        monitor.graphReduction(addr, "Mark")
                        return addr
                    }

                    const nodeName = h.name_of(addr)
                    const nodeArgs: Addr[] = h.nodeAddrs(addr) as Addr[]
                    const nodeArgs2: Addr[] = []
                    for (const nodeArg of nodeArgs) {
                        red1(nodeArg, targetForm, limitForm)
                        const arg2 = h.copyWithoutIndirections(nodeArg)
                        nodeArgs2.push(arg2)
                    }

                    const builtin = primitives.get(nodeName)

                    // TODO check arity
                    if (builtin === null) {
                        throw new Error(`Unknown primitive (${nodeName})`)
                    }

                    // This copying of primitives and their arguments is done for the benefit of the Fix and Self primitive type-constructors.
                    // Fix and Self each take one argument which they require to be reduced to strong-form.
                    //   (Without this, type-checking gets stuck).
                    // Arguments to Fix and Self are typically written in-line (Fix <| A -> [Int ,, A]).
                    // However, the argument to Fix could be let-bound and used by in a strict but not strongly-strict context.
                    // Having Fix reduce such a shared lambda to strong-form would change the behaviour of code not expecting this.
                    // Given the memoization used, this would also affect graph that isn't explicitly shared by the user.
                    // In summary, we shouldn't reduce a node beyond its target-form, 
                    //   but we can copy a lambda-node with its body, using a stronger target-form in the copy.

                    const copiedArgs = [...nodeArgs]
                    let argsCopied = false
                    for (let i = 0; i != numArgs; ++i) {
                        const paramStrength = builtin.paramStrengths[i]
                        const arg = h.directAddrOf(nodeArgs[i])
                        const argTargetForm = h.targetFormOf(arg)
                        if (paramStrength === formStrong && argTargetForm === formWeak && h.isTmLam(arg)) {
                            // If this primitive requires this argument to be in strong-form,
                            //   but the argument is on-target to only be reduced to weak-form,
                            //   then make a copy of the argument, with the target-form set to strong.
                            // This is only done if the argument is a lambda.
                            const lamS = subst.strongLambda(arg)
                            if (lamS !== arg) {
                                copiedArgs[i] = lamS
                                argsCopied = true
                            }
                        }
                    }
                    if (argsCopied) {
                        // Create a new primitive node with strengthened arguments.
                        const addr2 = h.prim(builtin.nameG, copiedArgs, h.depthOf(addr), h.typeOf(addr))
                        h.update(addr, addr2)
                        monitor.graphReduction(addr, "Delta")
                        return addr2
                    }

                    const isCons = h.cons_of(addr)

                    const result =
                        isCons     // If this is a constructor node, then don't call the builtin action, 
                            ? true //   the constructor/operator just needs to be marked as reduced.
                            : builtin.action(depth, nodeArgs2, targetForm)

                    switch (result) {
                        case null:
                        case true:
                            gr_console_log(`Mark Reduction (${nodeName}), addr (${addr}), depth (${depth})`)
                            h.setForm(addr, limitTargetForm)
                            monitor.graphReduction(addr, "Mark")
                            // Copying is done here so as to get the benefit of cacheing.
                            // We still return null/true, and not the copied address.
                            h.copyWithoutIndirections(addr)
                            return addr
                        case false:
                            h.setForm(addr, formError)
                            monitor.graphReduction(addr, "Mark")
                            return addr
                        default:
                            assert.isTrue(typeof result === "number")
                            // if (typeof result === "number") {
                            gr_console_log(`Delta Reduction (${nodeName}) at (${addr})`)
                            h.update(addr, result)
                            monitor.graphReduction(addr, "Delta")
                            return result
                            break
                    }
                },

            }, addr)

            return result
        }

        red1(addr, formWeak, formStrong)

    }




    const gr: GraphReduce = {
        reduce,
    }

    return gr

}

