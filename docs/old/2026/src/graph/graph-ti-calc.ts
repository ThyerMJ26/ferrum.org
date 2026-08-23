import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"
import { showExpr, TorP } from "../syntax/expr.js"
import { Addr, DirectAddr, Heap, TypeAddr, addrTypeType, assumeIsType, depthMax, depthZero, formStrong, formWeak } from "../graph/graph-heap2.js"
import { Instantiate } from "../graph/graph-instantiate.js"
import { GraphReduce } from "./graph-reduction.js"
import { tiIsTrue, tiIsUnknown, tiNot, tiIsKnown, tiIsFalse, TiRules, TiMemo, TiExpr, TiVal, tiFalse, tiTrue, tiUnknown, TiMemoKey, TiMemoEntry, TiCause, tiContradiction, tiIsContradiction, tiInternalError, tieInternalError } from "../graph/graph-ti.js"
import { TiStructuralFuncs } from "./graph-ti-structural.js"
import { graphShowExpr } from "../graph/graph-show.js";
import { Loc, locMatch, showLoc } from "../syntax/token.js"
import { GraphMonitor } from "../graph/code-table.js"
import { Fuel, FuelExhausted, fuelInfinite, fuelMk } from "../ui/fuel.js"
import { TiMemoFuncs } from "./graph-ti-memo.js"


export type TiCalcFuncs = {
    typeCheck: (torp: TorP, synTy: TypeAddr, ctxTy: TypeAddr, loc: Loc) => TiVal
    typeInhabCheck: (rc: TypeAddr, loc?: Loc) => TiVal | null
    tiShowCause: (ty: TypeAddr, log: (line: string) => unit) => unit
    tiSummaryGraph(ty: TypeAddr): Map<TiMemoKey, TiMemoEntry>
    showTiExpr(tie: TiExpr): string
    tiEvalExpr(tie: TiExpr): [TiVal | null, TiCause]
}

export const mkTiCalcFuncs = (h: Heap, gr: GraphReduce, timf: TiMemoFuncs, tis: TiStructuralFuncs, tiRules: TiRules, monitor: GraphMonitor): TiCalcFuncs => {

    const {
        depthOf,
        directAddrOf,
    } = h

    const tim = timf.tim

    const typeType = addrTypeType


    // This manual insertion into the type-inhabitation memotable (tim),
    //   breaks a cyclic dependency which occurs when defining type-level primitives.
    // The type of the {\} primitive is instantiated before the primitive is defined.
    // So calculating { Type \ Type } will fail with an unknown primitive error.
    const rcTypeType = h.tyCon2("{\\}", typeType, typeType, depthZero, typeType)
    tim.set(rcTypeType, { ty: timf.timKey(rcTypeType), value: tiFalse, exprs: [], cause: [] })


    const showExpr = (addr: Addr) => graphShowExpr(h, addr)

    const timKey = (ty: TypeAddr): TiMemoKey => {
        const key = ty as TiMemoKey
        if (!tim.has(key)) {
            let entry: TiMemoEntry = { ty: key, value: null, exprs: null, cause: [] }
            tim.set(key, entry)
        }
        return key
    }


    // TODO ? report the maximum iterations/expansions actually performed, 
    // TODO ?   after each test-run, or even for each sub-expression in the program.
    // values above 50/1500 are sufficient (at the time of writing this comment)
    const maxIterations = 100
    const maxExpansions = 3000

    let tiCalcIndent = ""

    // let tiConsoleLog = (mkMsg : () => string) => { console.log (mkMsg()) }
    const tiConsoleLog = (mkMsg: () => string) => { }

    const tiStats = {
        totalIterCount: 0,
        totalExpansionCount: 0
    }


    return {
        typeCheck,
        typeInhabCheck,
        tiShowCause,
        tiSummaryGraph,
        showTiExpr,
        tiEvalExpr,
    }

    function typeCheck(torp: TorP, synTy: TypeAddr, ctxTy: TypeAddr, loc: Loc): TiVal {

        const [ty1, ty2] = torp === "Term" ? [synTy, ctxTy] : [ctxTy, synTy]
        const depth = depthMax(depthOf(ty1), depthOf(ty2))

        try {
            // // A quick structural check.
            // let tiVal = tiStructuralRelComp(ty1, ty2)
            // if (tiIsKnown(tiVal)) {
            //     return tiVal
            // }
            // assert.isTrue(tiIsUnknown(tiVal))

            // Invoke the full type-checker.
            // This produces better diagnostics, 
            //   so is preferable to the quick-structural check in the event of a type-error.
            const tiVal = tiCalc(h.tyCon2("{\\}", ty1, ty2, depth))
            return tiVal
        }
        catch (exc) {
            if (exc instanceof FuelExhausted) {
                throw exc
            }
            console.error(`Internal Error: (${showLoc(loc)}) typeCheckSome: ${exc}`)
            // something catastrophic has happened
            // return tiContradiction()
            return tiInternalError()
        }
    }

    function typeInhabCheck(rc: TypeAddr, loc?: Loc): TiVal | null {
        const key1 = timKey(rc)
        const entry = tim.get(key1)!
        return entry.value
    }

    function tiEvalExpr(tie: TiExpr): [TiVal | null, TiCause] {
        // TODO ? Assign the result to tie.value ? (this is currently done by the caller anyway).
        const tiEval = tiEvalExpr
        switch (tie.tag) {
            case "TiConst": {
                return [tie.value, []]
            }
            case "TiRef": {
                return [tim.get(tie.ref)!.value, [tie.ref]]
            }
            case "TiAnd": {
                let [a1, aCause] = tiEval(tie.a)
                let [b1, bCause] = tiEval(tie.b)
                let a = a1 === null ? tiUnknown : a1
                let b = b1 === null ? tiUnknown : b1
                if (tiIsContradiction(a)) {
                    return [a, aCause]
                }
                if (tiIsContradiction(b)) {
                    return [b, bCause]
                }
                if (tiIsFalse(a) || tiIsFalse(b)) {
                    return [tiFalse, tiIsFalse(a) ? aCause : bCause]
                }
                else if (tiIsTrue(a) && tiIsTrue(b)) {
                    return [tiTrue, [aCause, bCause]]
                }
                else if (a1 === null || b1 === null) {
                    return [null, []]
                }
                else {
                    return [tiUnknown, [aCause, bCause]]
                }
            }
            case "TiAndImp": {
                let [a1, aCause] = tiEval(tie.a)
                let [b1, bCause] = tiEval(tie.b)
                let a = a1 === null ? tiUnknown : a1
                let b = b1 === null ? tiUnknown : b1
                if (tiIsContradiction(a)) {
                    return [a, aCause]
                }
                if (tiIsContradiction(b)) {
                    return [b, bCause]
                }
                if (tiIsTrue(a) && tiIsFalse(b)) {
                    return [(tiContradiction()), [aCause, bCause]]
                }
                else if (tiIsTrue(a)) {
                    return [tiTrue, aCause]
                }
                if (tiIsFalse(b)) {
                    return [tiFalse, bCause]
                }
                else if (tiIsFalse(a)) {
                    return [tiFalse, aCause]
                }
                else if (a1 === null || b1 === null) {
                    return [null, []]
                }
                else {
                    return [tiUnknown, [aCause, bCause]]
                }
            }
            case "TiOr": {
                let [a1, aCause] = tiEval(tie.a)
                let [b1, bCause] = tiEval(tie.b)
                let a = a1 === null ? tiUnknown : a1
                let b = b1 === null ? tiUnknown : b1
                if (tiIsContradiction(a)) {
                    return [a, aCause]
                }
                if (tiIsContradiction(b)) {
                    return [b, bCause]
                }
                if (tiIsTrue(a) || tiIsTrue(b)) {
                    return [tiTrue, [tiIsTrue(a) ? aCause : bCause]]
                }
                else if (tiIsFalse(a) && tiIsFalse(b)) {
                    return [tiFalse, [aCause, bCause]]
                }
                else if (a1 === null || b1 === null) {
                    return [null, []]
                }
                else {
                    return [tiUnknown, [aCause, bCause]]
                }
            }
            case "TiOrImp": {
                let [a1, aCause] = tiEval(tie.a)
                let [b1, bCause] = tiEval(tie.b)
                let a = a1 === null ? tiUnknown : a1
                let b = b1 === null ? tiUnknown : b1
                if (tiIsContradiction(a)) {
                    return [a, aCause]
                }
                if (tiIsContradiction(b)) {
                    return [b, bCause]
                }
                if (tiIsTrue(a) && tiIsFalse(b)) {
                    return [tiContradiction(), [aCause, bCause]]
                }
                if (tiIsTrue(a)) {
                    return [tiTrue, [aCause]]
                }
                else if (tiIsFalse(b)) {
                    return [tiFalse, [bCause]]
                }
                else if (tiIsTrue(b)) {
                    return [tiTrue, [bCause]]
                }
                else if (a1 === null || b1 === null) {
                    return [null, []]
                }
                else {
                    return [tiUnknown, [aCause, bCause]]
                }
            }
            case "TiNot": {
                const [a1, aCause] = tiEval(tie.a)
                const a = a1 === null ? tiUnknown : a1
                if (tiIsContradiction(a)) {
                    return [a, aCause]
                }
                return [tiNot(a), aCause]
            }

            default:
                throw new Error(`unhandled case $ {tie.tag}`)
        }
    }

    function tiMergeValues(vals: (TiVal | null)[]): [TiVal | null, number[]] {
        let result: TiVal = tiUnknown
        let anyNulls = false
        const causeKnown: number[] = []
        const causeUnknown: number[] = []
        const causeContradiction: number[] = []
        vals.forEach((val, i) => {
            if (val !== null) {
                if (tiIsContradiction(val)) {
                    causeContradiction.push(i)
                }
                else {
                    if (tiIsKnown(val)) {
                        causeKnown.push(i)
                    }
                    if (tiIsUnknown(val)) {
                        causeUnknown.push(i)
                    }
                }
                result = [result[0] || val[0], result[1] || val[1]]
            }
            else {
                anyNulls = true
            }
        })
        if (tiIsContradiction(result)) {
            if (causeContradiction.length === 0) {
                // If the result is a contradiction, but we don't know of a direct causal reason, then include all the knowns.
                // Different rules must be contradicting each other, without any individually declaring a contradiction.
                return [result, causeKnown]
            }
            else {
                // If we have a cause, then a we can localize the problem to within individual rule(s).
                // TODO ? We could concatenate the causes for "known" too ?
                return [result, causeContradiction]
            }
        }
        if (tiIsKnown(result)) {
            // We've got a definite true/false result, so return that,
            //   even though not all rules may have been fully evaluated.
            // For causality tracking purposes, just return the first cause ? 
            //   (prunes the causality tree, while still retaining enough info to justify the result)
            //   (makes the causality tree a bit shorter, but not much)
            // return [result, [causeKnown[0]]]
            return [result, causeKnown]
        }
        else if (anyNulls) {
            // Return null, if there is the possibility that,
            //   on a future evaluation, the result may change from unknown to known.
            return [null, []]
        }
        else {
            // Otherwise, all rule expressions have been evaluated, there's no point trying again,
            //   the result is unknown and always will be.
            return [tiUnknown, causeUnknown]
        }
    }


    function tiExprChildren(tie: TiExpr): TiMemoKey[] {
        let tic = tiExprChildren
        switch (tie.tag) {
            case "TiConst":
                return []
            case "TiRef":
                return [tie.ref]
            case "TiNot":
                return [...tic(tie.a)]
            case "TiAnd":
            case "TiAndImp":
            case "TiOr":
            case "TiOrImp":
                return [...tic(tie.a), ...tic(tie.b)]
            default:
                assert.noMissingCases(tie)
        }
    }

    // Traverse a type-inhabitation rule graph from a given type-inhabitation memo key,
    // returns:
    //     - a list of fringe nodes to expand,
    //     - a list of nodes that reach these fringe nodes, they might become reducible.
    function tiNext(tyKey: TiMemoKey): [TiMemoKey[], TiMemoKey[]] {
        const resultExpand: TiMemoKey[] = []
        const resultReduce: TiMemoKey[] = []
        const visited: { [key: string]: null } = {}
        const todo: [TiMemoKey, TiMemoKey[] | null][] = [[tyKey, null]]
        while (todo.length !== 0) {
            let [key, children] = todo.pop()!
            const entry = tim.get(key)!
            if (children === null && visited.hasOwnProperty(key)) {
                continue
            }
            visited[key] = null
            if (entry.value !== null) {
                continue
            }
            if (entry.exprs === null) {
                resultExpand.push(key)
                resultReduce.push(key)
                continue
            }
            if (children === null) {
                const childList = entry.exprs.map(([ruleName, exp]) => tiExprChildren(exp))
                const strList: TiMemoKey[] = []
                children = strList.concat(...childList)
            }
            if (children.length === 0) {
                resultReduce.push(key)
            }
            else {
                const nextChild = children.shift()!
                todo.push([key, children])
                todo.push([nextChild, null])
            }
        }
        return [resultExpand, resultReduce]
    }


    // TODO Append to an optional list of heap address deltas, so as to only perform the UI updates needed.
    function tiCalc(ty: TypeAddr): TiVal {
        let oldIndent = tiCalcIndent
        tiCalcIndent = `${tiCalcIndent}    `
        let indent = tiCalcIndent
        try {
            const key1 = timKey(ty)
            const entry = tim.get(key1)!
            tiConsoleLog(() => `${indent}TI Calc Key: #${entry.ty} ${showExpr(entry.ty)}`)
            let iterCount = 0
            let expansionCount = 0
            calcLoop: while (entry.value === null) {
                let [toExpand, toReduce] = tiNext(key1)
                tiConsoleLog(() => `${indent}ToExpand: ${toExpand.map(t => `#${tim.get(t)!.ty}`).join(" ")}`)
                tiConsoleLog(() => `${indent}ToReduce: ${toReduce.map(t => `#${tim.get(t)!.ty}`).join(" ")}`)
                for (const key of toExpand) {
                    const entry = tim.get(key)!
                    gr.reduce(entry.ty)

                    tiConsoleLog(() => `${indent}Expanding Key : #${entry.ty} ${showExpr(entry.ty)}`)

                    // We must fully perform expansion, before calling any monitor function (which might throw a FuelExhausted exception).
                    // The tiNext function is not able to work-out where to resume a half-expanded entry.
                    entry.exprs = []
                    for (const [ruleName, ruleDefn] of tiRules) {
                        try {
                            const typeAddr = directAddrOf(entry.ty)
                            const expr = ruleDefn(typeAddr)
                            if (expr.tag === 'TiConst' && !tiIsContradiction(expr.value) && tiIsUnknown(expr.value)) {
                                // If this rule tells us nothing, move on to the next one.
                                continue
                            }
                            // let childNums = tiExprChildren(expr).map(c => `#${tim.get(c)!.ty}`).join(" ")
                            // tiConsoleLog(() => `${indent}          Expr: ${ruleName} ${childNums} => ${JSON.stringify(expr)}`)
                            tiConsoleLog(() => `${indent}          Expr: ${ruleName} => ${showTiExpr(expr)}`)
                            entry.exprs.push([ruleName, expr])
                        }
                        catch (exc) {
                            if (exc instanceof FuelExhausted) {
                                // Nothing should be throwing a FuelExhausted exception here
                                console.error(`TypeCheck FuelExhausted during Expansion: Rule (${ruleName}) ${exc}`)
                                throw exc
                            }
                            console.error(`TypeCheck: Rule (${ruleName}) Exception: ${exc}`)
                            if (exc instanceof Error) {
                                console.error(`TypeCheck: Rule (${ruleName}) Exception: cause:`, exc.cause)
                                console.error(`TypeCheck: Rule (${ruleName}) Exception: message:`, exc.message)
                                console.error(`TypeCheck: Rule (${ruleName}) Exception: name:`, exc.name)
                                console.error(`TypeCheck: Rule (${ruleName}) Exception: stack:`, exc.stack)
                            }
                            entry.exprs.push([ruleName, tieInternalError()])
                            // return tiInternalError
                        }
                    }
                    expansionCount += 1
                }

                monitor.tiExpansion(entry.ty)

                let anythingReduced = false
                for (const key of toReduce) {
                    const entry = tim.get(key)!
                    assert.isNotNull(entry.exprs)
                    const expr_values: [string, TiExpr, [TiVal | null, TiCause]][] = entry.exprs.map(([ruleName, exp]) => {
                        let result: [string, TiExpr, [TiVal | null, TiCause]] = [ruleName, exp, tiEvalExpr(exp)]
                        let value = result[2][0]
                        if (value !== null) {
                            exp.value = value
                            exp.cause = result[2][1]
                        }
                        return result
                    })
                    const values = expr_values.map(([rn, expr, [vals, causes]]) => vals)
                    const [value, cause] = tiMergeValues(values)
                    if (value !== null) {
                        tiConsoleLog(() => `${indent}Reduced Key   : #${entry.ty} ${showExpr(entry.ty)}`)
                        tiConsoleLog(() => `${indent}        Value : ${tiSymbol(value)}`)
                        for (const [ruleName, expr, [v, _]] of expr_values) {
                            if (v !== null && !tiIsContradiction(v) && tiIsKnown(v)) {
                                tiConsoleLog(() => `${indent}        Value : ${tiSymbol(v)} ${ruleName} ${showTiExpr(expr)}`)
                            }
                        }
                        entry.value = value
                        anythingReduced = true
                        monitor.tiReduction(entry.ty)
                    }
                    if (cause.length !== 0) {
                        entry.cause.push(...cause)
                    }
                }
                if (toExpand.length === 0 && !anythingReduced) {
                    // We've reached an unproductive fixed-point.
                    // Mark everything as unknown.
                    // Anything remaining unreduced must be part of a cycle, 
                    //   so the normal evaluation mechanism won't manage to propagate the results in the usual way.
                    for (const key of toReduce) {
                        const entry = tim.get(key)!
                        entry.value = tiUnknown
                    }
                    for (const key of toReduce) {
                        const entry = tim.get(key)!
                        entry.value = tiUnknown
                        const values = entry.exprs!.map(([_, exp]) => {
                            let [value, cause] = tiEvalExpr(exp)
                            exp.cause = cause
                            return value
                        })
                        const [value, cause] = tiMergeValues(values)
                        entry.cause = cause
                    }
                    break
                }
                iterCount += 1
                if (iterCount > maxIterations) {
                    throw new Error(`TOO MANY ITERATIONS (${iterCount} > ${maxIterations})`)
                }
                if (expansionCount > maxExpansions) {
                    // console.log(`TOO MANY EXPANSIONS (${expansionCount} > ${maxExpansions})`)
                    // return tiUnknown
                    throw new Error(`TOO MANY EXPANSIONS (${expansionCount} > ${maxExpansions})`)
                }
            }
            tiStats.totalIterCount += iterCount
            tiStats.totalExpansionCount += expansionCount
            tiConsoleLog(() => `${indent}TI Calc Result: ${tiSymbol(entry.value)}`)
            if (entry.value === null) {
                return tiUnknown
            }
            return entry.value
        }
        finally {
            tiCalcIndent = oldIndent
        }
    }

    function showTiExpr(tie: TiExpr): string {
        let stie = (tie: TiExpr): string => showTiExpr(tie)
        switch (tie.tag) {
            case "TiConst":
                return tiSymbol(tie.value)
            case "TiRef": {
                const key = tim.get(tie.ref)!.ty
                const key2 = h.directAddrOf(key)
                return `#${key2}`
            }
            case "TiNot":
                return `Not(${stie(tie.a)})`
            case "TiAnd":
                return `(${stie(tie.a)} && ${stie(tie.b)})`
            case "TiAndImp":
                return `(${stie(tie.a)} &&-> ${stie(tie.b)})`
            case "TiOr":
                return `(${stie(tie.a)} || ${stie(tie.b)})`
            case "TiOrImp":
                return `(${stie(tie.a)} ||-> ${stie(tie.b)})`
            default:
                assert.noMissingCases(tie)

        }
    }

    function flattenCause(cause: TiCause): TiMemoKey[] {
        if (cause instanceof Array) {
            const result: TiMemoKey[] = []
            for (const c of cause) {
                result.push(...flattenCause(c))
            }
            return result
        }
        return [cause]
    }

    function tiShowCause(ty: TypeAddr, log: (line: string) => unit): unit {
        const todo: [TiMemoKey, number][] = []
        const key1 = timKey(ty)
        todo.push([key1, 0])
        const visited: { [key: string]: null } = {}
        while (todo.length !== 0) {
            const [key, depth] = todo.pop()!
            const entry = tim.get(key)!
            const indent = "".padEnd(6)
            const typeNumStr = `${entry.ty}`.padEnd(6)
            if (visited.hasOwnProperty(key)) {
                // We've already visited this type.
                // log(`${indent} #${typeNumStr} ${tiSymbol(entry.value)} ...`)
                continue
            }
            visited[key] = null

            log(`${indent} #${typeNumStr} ${tiSymbol(entry.value)} ${showExpr(entry.ty)}`)
            for (const cause of entry.cause) {
                if (entry.exprs !== null) {
                    const cause2 = entry.exprs[cause][1].cause
                    const ruleName = entry.exprs[cause][0]
                    let childNums = ""
                    if (cause2 !== undefined) {
                        let cause3 = flattenCause(cause2)
                        childNums = cause3.map(c => `#${tim.get(c)!.ty}`).join(" ")
                        for (const c of cause3.reverse()) {
                            // Only push causes of unknowns if there are children.
                            // let children = tim.get(c)!.exprs
                            // if (children !== null && children.length > 0)
                            {
                                todo.push([c, depth + 1])
                            }
                        }
                    }
                    if ((entry.value !== null && (tiIsContradiction(entry.value) || tiIsKnown(entry.value))) || childNums.length > 0) {
                        // log(`${indent} #${entry.ty} => ${tiSymbol(entry.value)} ${ruleName} ${childNums}`)
                        // log(`${indent} #${typeNumStr} ${tiSymbol(entry.value)}     ${ruleName} ${showTIExpr(entry.exprs[cause][1])}`)
                        log(`${indent}         ${tiSymbol(entry.value)}     ${ruleName} ${showTiExpr(entry.exprs[cause][1])}`)
                    }
                }
            }
        }
    }


    function tiSummaryGraph(ty: TypeAddr): Map<TiMemoKey, TiMemoEntry> {
        const summaryGraph = new Map<TiMemoKey, TiMemoEntry>()
        const todo: TiMemoKey[] = []
        const key1 = timKey(ty)
        todo.push(key1)
        const visited: Map<number, null> = new Map
        while (todo.length !== 0) {
            let key = todo.pop()!
            let entry = tim.get(key)!
            if (visited.has(key)) {
                continue
            }
            visited.set(key, null)

            summaryGraph.set(key, entry)
            if (entry.exprs !== null) {
                for (const [ruleName, expr] of entry.exprs) {
                    let children = tiExprChildren(expr)
                    todo.push(...children)
                }
            }
        }
        return summaryGraph
    }


    function tiSymbol(ti: TiVal | null): string {
        if (ti === null) {
            return "-" // un-evaluated
        }
        let f = ti[0] ? 1 : 0
        let t = ti[1] ? 2 : 0
        switch (f + t) {
            case 0: return "." // unknown
            case 1: return "0" // is void
            case 2: return "1" // is non-void
            case 3: return "X" // contradiction
            default: assert.impossible()
        }
    }


}

