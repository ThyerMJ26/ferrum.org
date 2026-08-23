import { assert } from "../utils/assert.js";
import { addrNo, formError, formGte, formLt, formMin as formMin, formStrong, formWeak, isAddrNo } from "../graph/graph-heap2.js";
import { readback } from "../graph/graph-readback.js";
import { showGraph } from "../graph/graph-show.js";
import { mkPrettyFerrum2, p2Show2, prettyFerrum, prettyFerrumStyleDefns } from "../syntax/pretty-ferrum.js";
import { check } from "./graph-check.js";
import { isArUpdate } from "./graph-primitives.js";
import { uiTextToStr } from "../ui/text.js";
import { createDummyStyles } from "../ui/app-ui.js";
// const gr_console_log = console.log
const gr_console_log = (...args) => { };
export function mkGraphReduce(h, subst, primitives, ga, monitor) {
    const prettyFerrumStyleNums = createDummyStyles(prettyFerrumStyleDefns, "");
    function showExpr(expr) {
        const idExprMap = new Map;
        const exprIdMap = new Map;
        const addrIdsMap = new Map;
        const idTextMap = new Map;
        const pf = mkPrettyFerrum2(40, 40, prettyFerrumStyleNums, idExprMap, exprIdMap, addrIdsMap);
        const exprD = pf.pExpr(expr);
        const exprTxt = p2Show2(prettyFerrumStyleNums.std, exprD.doc, idTextMap);
        const exprStr = uiTextToStr(exprTxt);
        return exprStr;
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
    function printHeap(count, rootAddr) {
        console.log(`\n\nCount: ${count}`);
        const ok = check(h, rootAddr);
        console.log(`CHECK-${ok}`);
        console.log(showGraph(h, [rootAddr]).join("\n"));
        // const rbLetVars: RbLetEnv = new Map
        const rbLetVars = new Map;
        const rbLamVars = new Map;
        const expr = readback(h, rbLetVars, rbLamVars, "Term", rootAddr);
        const exprStr = prettyFerrum(expr);
        console.log("Expr: ", exprStr);
        console.log(showExpr(expr));
    }
    // This calculates the form that should be assigned to a reduced node.
    function mergeFormsOf(limitForm, ...addrs) {
        let resultForm = limitForm;
        for (let addr of addrs) {
            if (isAddrNo(addr))
                continue;
            addr = h.directAddrOf(addr);
            let form = h.formOf(addr);
            if (form === h.targetFormOf(addr)) {
                // A node being reduced to its target form is as good as being reduced to strong form.
                form = formStrong;
            }
            if (form === formError)
                return formError;
            resultForm = formMin(resultForm, form);
        }
        return resultForm;
    }
    function reduce(addr) {
        const inStack = new Set;
        function red1(addr, contextForm, limitForm) {
            if (isAddrNo(addr))
                return addrNo;
            if (inStack.size > 1000) {
                // if (inStack.size > 10000) {
                // if (inStack.size > 100000) {
                console.error(`Large Stack`);
                throw new Error("Suspiciously large stack");
            }
            let nextAddr = h.directAddrOf(addr);
            let currentForm = h.formOf(nextAddr);
            let targetForm = h.targetFormOf(nextAddr);
            do {
                if (contextForm === formWeak && limitForm === formStrong && targetForm === formStrong) {
                    // If we're transitioning from a weak region to a strong region,
                    //   then reduce the node first to weak form, then to strong form.
                    const resultW = red1(addr, formStrong, formWeak);
                    const resultS = red1(addr, formStrong, formStrong);
                    return resultS;
                }
                else {
                    addr = h.directAddrOf(nextAddr);
                    if (inStack.has(addr))
                        return addr;
                    inStack.add(addr);
                    nextAddr = red2(addr, limitForm);
                    inStack.delete(addr);
                    currentForm = h.formOf(nextAddr);
                    targetForm = h.targetFormOf(nextAddr);
                }
            } while (formLt(currentForm, formMin(limitForm, targetForm)) && nextAddr !== addr);
            return nextAddr;
        }
        function red2(addr, limitForm) {
            const currentForm = h.formOf(addr);
            const targetForm = h.targetFormOf(addr);
            const limitTargetForm = formMin(limitForm, targetForm);
            if (formGte(currentForm, limitTargetForm))
                return addr;
            const result = h.nodeGuide({
                tmDatum(addr) {
                    h.setForm(addr, limitTargetForm);
                    return addr;
                },
                tmPair(addr) {
                    const hd = red1(h.hd_tm(addr), targetForm, limitForm);
                    const tl = red1(h.tl_tm(addr), targetForm, limitForm);
                    const newForm = mergeFormsOf(limitTargetForm, hd, tl);
                    h.setForm(addr, newForm);
                    return addr;
                },
                tmApply(addr) {
                    const fun = red1(h.fun_tm(addr), targetForm, limitForm);
                    const arg = red1(h.arg_tm(addr), targetForm, limitForm);
                    const depth = h.depthOf(addr);
                    const resultAddrMb = subst.tryApply(depth, fun, arg, targetForm);
                    // if (isAddrYes(resultAddrMb)) {
                    if (resultAddrMb !== null) {
                        h.update(addr, resultAddrMb);
                        return resultAddrMb;
                    }
                    const newForm = mergeFormsOf(limitTargetForm, fun, arg);
                    h.setForm(addr, newForm);
                    return addr;
                },
                tmLambda(addr) {
                    if (limitTargetForm === formStrong) {
                        const pat = h.pat_tm(addr);
                        const bod = h.body_tm(addr);
                        red1(pat, targetForm, formWeak);
                        red1(bod, targetForm, formWeak);
                        red1(pat, targetForm, formStrong);
                        red1(bod, targetForm, formStrong);
                        const newForm = mergeFormsOf(limitTargetForm, bod); // TODO ? Add "pat" ?
                        h.setForm(addr, newForm);
                    }
                    else {
                        h.setForm(addr, formWeak);
                    }
                    return addr;
                },
                tmVar(addr) {
                    h.setForm(addr, limitTargetForm);
                    return addr;
                },
                tmAs(addr) {
                    // assert.impossible("As-terms can only occur in patterns.")
                    // TODO ? We might need this when pattern-reduction is implemented ?
                    assert.todo("? Add support for pattern-reduction ?");
                },
                tmTyAnnot(addr) {
                    const tmAddr = h.term_tm(addr);
                    const result = red1(tmAddr, targetForm, limitForm);
                    h.update(addr, result);
                    return result;
                },
                tySingleStr(addr) {
                    h.setForm(addr, limitTargetForm);
                    return addr;
                },
                tyPair(addr) {
                    const hd = red1(h.hd_ty(addr), targetForm, limitForm);
                    const tl = red1(h.tl_ty(addr), targetForm, limitForm);
                    const newForm = mergeFormsOf(limitTargetForm, hd, tl);
                    h.setForm(addr, newForm);
                    return addr;
                },
                tyFun(addr) {
                    const dom = red1(h.dom_ty(addr), targetForm, limitForm);
                    const cod = red1(h.cod_ty(addr), targetForm, limitForm);
                    const newForm = mergeFormsOf(limitTargetForm, dom, cod);
                    h.setForm(addr, newForm);
                    return addr;
                },
                tyVar(addr) {
                    h.setForm(addr, limitTargetForm);
                    return addr;
                },
                tyApply(addr) {
                    const depth = h.depthOf(addr);
                    const nodeTag = h.nodeTag(addr);
                    const form = formWeak;
                    const funTy = red1(h.funTy_of(addr), targetForm, limitForm);
                    const argTy = red1(h.argTy_of(addr), targetForm, limitForm);
                    const result = ga.apply_funTy_argTy(depth, funTy, argTy);
                    if (result === null) {
                        gr_console_log(`Mark Reduction (${nodeTag}) at (${addr})`);
                        const newForm = mergeFormsOf(limitTargetForm, funTy, argTy);
                        h.setForm(addr, form);
                        monitor.graphReduction(addr, "Mark");
                        return addr;
                    }
                    assert.isTrue(isArUpdate(result));
                    gr_console_log(`Beta Reduction at (${addr})`);
                    h.update(addr, result);
                    monitor.graphReduction(addr, "Beta");
                    return result;
                },
                prim(addr) {
                    const depth = h.depthOf(addr);
                    const nodeTag = h.nodeTag(addr);
                    const numArgs = h.nodeArity(addr);
                    if (numArgs === 0) {
                        gr_console_log(`Mark Reduction (${nodeTag}) at (${addr})`);
                        h.setForm(addr, limitTargetForm);
                        monitor.graphReduction(addr, "Mark");
                        return addr;
                    }
                    const nodeName = h.name_of(addr);
                    const nodeArgs = h.nodeAddrs(addr);
                    const nodeArgs2 = [];
                    for (const nodeArg of nodeArgs) {
                        red1(nodeArg, targetForm, limitForm);
                        const arg2 = h.copyWithoutIndirections(nodeArg);
                        nodeArgs2.push(arg2);
                    }
                    const builtin = primitives.get(nodeName);
                    // TODO check arity
                    if (builtin === null) {
                        throw new Error(`Unknown primitive (${nodeName})`);
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
                    const copiedArgs = [...nodeArgs];
                    let argsCopied = false;
                    for (let i = 0; i != numArgs; ++i) {
                        const paramStrength = builtin.paramStrengths[i];
                        const arg = h.directAddrOf(nodeArgs[i]);
                        const argTargetForm = h.targetFormOf(arg);
                        if (paramStrength === formStrong && argTargetForm === formWeak && h.isTmLam(arg)) {
                            // If this primitive requires this argument to be in strong-form,
                            //   but the argument is on-target to only be reduced to weak-form,
                            //   then make a copy of the argument, with the target-form set to strong.
                            // This is only done if the argument is a lambda.
                            const lamS = subst.strongLambda(arg);
                            if (lamS !== arg) {
                                copiedArgs[i] = lamS;
                                argsCopied = true;
                            }
                        }
                    }
                    if (argsCopied) {
                        // Create a new primitive node with strengthened arguments.
                        const addr2 = h.prim(builtin.nameG, copiedArgs, h.depthOf(addr), h.typeOf(addr));
                        h.update(addr, addr2);
                        monitor.graphReduction(addr, "Delta");
                        return addr2;
                    }
                    const isCons = h.cons_of(addr);
                    const result = isCons // If this is a constructor node, then don't call the builtin action, 
                        ? true //   the constructor/operator just needs to be marked as reduced.
                        : builtin.action(depth, nodeArgs2, targetForm);
                    switch (result) {
                        case null:
                        case true:
                            gr_console_log(`Mark Reduction (${nodeName}), addr (${addr}), depth (${depth})`);
                            h.setForm(addr, limitTargetForm);
                            monitor.graphReduction(addr, "Mark");
                            // Copying is done here so as to get the benefit of cacheing.
                            // We still return null/true, and not the copied address.
                            h.copyWithoutIndirections(addr);
                            return addr;
                        case false:
                            h.setForm(addr, formError);
                            monitor.graphReduction(addr, "Mark");
                            return addr;
                        default:
                            assert.isTrue(typeof result === "number");
                            // if (typeof result === "number") {
                            gr_console_log(`Delta Reduction (${nodeName}) at (${addr})`);
                            h.update(addr, result);
                            monitor.graphReduction(addr, "Delta");
                            return result;
                            break;
                    }
                },
            }, addr);
            return result;
        }
        red1(addr, formWeak, formStrong);
    }
    const gr = {
        reduce,
    };
    return gr;
}
//# sourceMappingURL=graph-reduction.js.map