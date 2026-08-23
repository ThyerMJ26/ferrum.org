
//#region Run Tests

// Utils
import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"

// Syntax
import { ParseState } from "../syntax/parse.js"
import { parseTerm } from "../syntax/parseFerrum2.js"
import { prettyFerrum } from "../syntax/pretty-ferrum.js"
import { Project, projectClone, emptyProject, readProject } from "../syntax/project.js"
import { scan2Fe } from "../syntax/scan.js"
import { TdCheck, TdExpect, TestDefn } from "../syntax/test-defn.js"
import { Pos, showLoc, nilLoc } from "../syntax/token.js"
import { ExprLoc, ExprTypeBidir, DeclTypeBidir, ExprTree, LocField, TypeAnnotBidir, Output, visitAll, showExp2, showExprTy1, showExprTy2 } from "../syntax/expr.js"

// Tree
import { collectTypeErrors, showType4, showTypeDiff, showType2, countTypeErrors, showTypeWithoutSubSuperBounds, nodeToType, Type } from "../tree/types.js"

// Graph
import { CodeRunner, CodeRunnerName, MkCodeRunner } from "../codegen/code-runners.js"
import { CodeOptions, CodeTable, GraphMode, graphMode_long, graphMode_short, tcSummariseGraph2, tcSummariseTree2, TcSummary } from "../graph/code-table.js"
import { Addr, depthZero } from "../graph/graph-heap2.js"
import { ExprTypeGraph } from "../graph/graph-instantiate.js"
import { graphPredicatesMk } from "../graph/graph-predicates.js"
import { readbackData, readbackExpr, readbackType } from "../graph/graph-readback.js"

//
import { getIo } from "../io/io.js"
import { FuelExhausted } from "../ui/fuel.js"
// import { memo, Opts } from "../cmds/runtest.js"
import { mkCmdLineSchema, CmdLine_SchemaBuild, CmdLine_TypeFor_Schema } from "../utils/cmdline.js"


export type TestResultPart = {
    partName: string

    typeCheckT?: boolean
    typeCheckG?: boolean

    typeMatchT?: boolean
    typeMatchG?: boolean

    termMatchT?: boolean
    termMatchG?: boolean

    valueMatch?: boolean
    // TODO ? Perform various forms of evaluation within the same test run
    // valueMatchD?: boolean  // direct, by-pass the graph, codgen, run
    // valueMatchI?: boolean  // instantiate and readback, codgen, run
    // valueMatchS?: boolean  // instantiate, specialize, readback, codgen, run (intended use)
    // valueMatch?R: boolean   // instantiate, specialize, graph-reduce (the expect expr), readback, codgen, run (just for stress testing)
    // TODO ? Results for different ways of invoking the code-runners.
    // valueMatches?: Map<CodeRunnerKey, boolean>

    noExceptionThrown?: boolean
    passed?: boolean

    expect?: TdExpect
    check?: TdCheck
    expr?: ExprLoc
    exprTy?: ExprTypeBidir
    actualValue?: string

    expectAddr?: Addr
    actualAddr?: Addr
}

export type TestDecl = {
    declStr: string
    declLineStarts: Pos[]
    // declsTy: DeclTypeBidir[]
}

export type TestResult = {
    testName: string
    testDefn: TestDefn
    ct: CodeTable
    project: Project | null
    decls: TestDecl[]
    codeRunner: CodeRunner | null
    parts: TestResultPart[]
    duration: number | null

    // args
    opts: Opts
    codeRunnerName: CodeRunnerName
    testDir: URL
    useLineStarts: boolean

    // local vars
    co: CodeOptions
    startTime: number
    doBidir: boolean
    testCt: CodeTable
    //
    finished: boolean
}



export function truncateStr(maxLen: number, value: string): string {
    value = value.replaceAll("\n", " ")
    if (value.length < maxLen) {
        return value
    }
    return `${value.slice(0, maxLen - 3)}...`
}

let projectCache: { [name: string]: [Project, CodeTable] } = {}

export async function loadProjectForTestDefn2(td: TestDefn, testDir: URL, initCt: CodeTable): Promise<[Project, CodeTable]> {

    const io = getIo()
    // Tests which don't specify a primitives file, get the default primitives.
    // These default primtives are loaded using the project loading code.
    // const td_project = td.project ?? "<default>"

    // This was the original logic for handling tests with
    //   no specificed project (and so no specified primitives).
    const td_project = td.project
    if (td_project === undefined) {
        const proj = projectClone(emptyProject)
        return [proj, initCt]
    }

    let cachedProj = projectCache[td_project]
    if (cachedProj !== undefined) {
        return cachedProj
    }
    else {
        const ferrumDir = new URL(import.meta.resolve("../../.."))
        // const projFilename =
        //     td_project === "<default>"
        //         ? io.vfs_resolve(ferrumDir, "fe/defaults/default.proj.fe")
        //         : io.vfs_resolve(testDir, td_project)

        const projFilename = io.vfs_resolve(testDir, td_project)
        const proj = await readProject(projFilename)

        let projCt = initCt

        for (const part of proj.parts) {
            switch (part.tag) {
                case "text": {
                    const contents = proj.contents.get(part.filename)!
                    projCt = projCt.addText(part.name, part.name, part.filename, contents)
                    break
                }
                case "code":
                case "source": {
                    const contents = proj.contents.get(part.filename)!
                    projCt = projCt.addCode(part.filename, part.filename, null, contents)
                    break
                }
                default:
                    assert.noMissingCases(part)
            }
        }

        const result: [Project, CodeTable] = [proj, projCt]
        projectCache[td_project] = result
        return result
    }
}


function collectAndShowTypeErrors(decls: DeclTypeBidir[]): unit {
    let errors = collectTypeErrors(decls)
    errors.forEach(err => {
        console.log(`ERROR: (${err.tc}) ${showLoc(err.loc)}`)
        console.log(`Synthesized:`)
        console.log(showType4(err.ty1, null, 120))
        console.log(`Context:`)
        if (err.ty2 === null) {
            console.log("NULL")
        }
        else {
            console.log(showType4(err.ty2, null, 120))
        }
    })
}

function printTypeDiffReport(decls: DeclTypeBidir[]): unit {
    let call = (field: any, exp: ExprTree<LocField & TypeAnnotBidir>) => {
        if (exp instanceof Array) {
            return
        }
        let tc: string = (exp as ExprTypeBidir).tc as string
        if (tc !== undefined && tc !== "ok") {
            let exprTyped = (exp as ExprTypeBidir)
            let loc = exp.loc
            if (loc === undefined) {
                loc = nilLoc
            }
            let output = new Output()
            if (exp.ty2 !== null) {
                showTypeDiff(output, exp.ty1, exp.ty2)
            }
            console.log()
            console.log(`Type Report (${tc}), ${showLoc(loc)}`)
            console.log(`  Synthesized : ${showType2(exprTyped.ty1!)}`)
            if (exprTyped.ty2 !== null) {
                console.log(`  Context     : ${showType2(exprTyped.ty2!)}`)
            }
            console.log(output.getLines().join("\n"))
            console.log()
        }
    }
    visitAll("", decls, call, null)
}

// This behaves like a 3-valued-and for false/unknown values, but a 3-valued-or for true/unknown values.
// Absence of failure is not in-itself evidence of success, at least one element must be true.
// Alternatively, if we first remove all undefined inputs, 
//   the function acts like a 2-valued-and for a positive number of inputs,
//   and only returns undefined when called with no inputs.
export function someTrueNoneFalse(...elems: (boolean | undefined)[]): boolean | undefined {
    let someTrue = false
    let someFalse = false
    for (const elem of elems) {
        someTrue ||= elem === true
        someFalse ||= elem === false
    }
    // If any elem is false, return false.
    // Otherwise, if there is at least one true elem, return true.
    // Otherwise, every elem is undefined, return undefined,
    //   the test has not specifically passed or failed.
    return someFalse ? false : someTrue ? true : undefined
}

export async function startTest(initCt: CodeTable, td: TestDefn, opts: Opts, codeRunnerName: CodeRunnerName, testDir: URL, useLineStarts = true): Promise<TestResult> {
    const io = getIo()

    const co: CodeOptions = {
        tyT: true,
        tyG: opts.useGraphTypes,
        inst: opts.useHeap,
        grD: opts.grDecls,
        grE: opts.grExpect,
        cg: opts.codegen as CodeRunnerName
    }

    const startTime = Date.now()
    const doBidir = td.type_checks.indexOf("bidir") !== -1

    assert.isTrue(td.project_parts.length === 0 || td.project === undefined, `Either "project" or "primitives" can be specified, but not both.`)

    let proj: Project | null = null
    let testCt: CodeTable = initCt

    if (td.project !== undefined) {
        [proj, testCt] = await loadProjectForTestDefn2(td, testDir, initCt)
    }
    else {
        for (const part of td.project_parts) {
            switch (part.tag) {
                case "code":
                case "source":
                    const filename = io.vfs_resolve(testDir, part.filename)
                    const contents = await io.vfs_read(filename)
                    testCt = testCt.addCode(part.filename, part.filename, null, contents)
                    break
                case "text":
                    assert.unreachable()
                default:
                    assert.noMissingCases(part)
            }
        }
    }

    // const [proj, projCt] = await loadProjectForTestDefn2(td, testDir, initCt)

    const testResultDecls: TestDecl[] = []
    const testResultParts: TestResultPart[] = []

    // TODO ? Instead of a common part, have separate result parts for the project and decl(s) ?
    let testResultPartCommon: TestResultPart = { partName: "" }
    testResultParts.push(testResultPartCommon)

    // const decls: Decl[] = []

    for (let [td_decl, td_lineStarts] of td.decls) {

        // // TODO Most of this should now be done by the CodeTables.
        // // TODO ? Can we get rid of this, and just leave the "addCode" call ?
        // const lineStarts = useLineStarts ? td_lineStarts : undefined
        // let [header, toks] = scanFile("", td_decl, null, td.language, lineStarts)
        // let ps = new ParseState(toks)
        // let td_decls = parseFile(ps, header.language)
        // if (opts.showDecls) {
        //     console.log(showExp2(td_decls, "Decls:", showExprTree))
        // }
        // decls.push(...td_decls)

        testResultDecls.push({
            declStr: td_decl,
            declLineStarts: td_lineStarts,
        })

        // TODO ? pass td_lineStarts ?
        testCt = testCt.addCode("<decls>", "", td.language, td_decl)

    }

    let testResults: TestResult = {
        testName: td.name,
        testDefn: td,
        ct: testCt,
        project: proj,
        codeRunner: null,
        decls: testResultDecls,
        parts: testResultParts,
        duration: null,
        // Make args for startTest available to continueTest
        opts,
        useLineStarts,
        codeRunnerName,
        testDir,
        // Make local vars in startTest available to continueTest
        // cgTap,
        co,
        startTime,
        doBidir,
        testCt,

        finished: false,
    }


    for (const check of td.checks) {
        const checkName = truncateStr(10, check.expr)
        const trp: TestResultPart = { partName: checkName, check }
        console.log(`    Expression: ${check.expr}`)
        let expTokens = scan2Fe("", check.expr, null, check.lineStarts)
        let expPS = new ParseState(expTokens)
        let exp = parseTerm(expPS, td.language)
        trp.expr = exp
        testResults.parts.push(trp)
    }


    return testResults
}

export function continueTest(tr: TestResult): boolean {

    if (tr.finished) return true

    let projCt = tr.ct
    const opts = tr.opts
    const useLineStarts = tr.useLineStarts
    const codeRunnerName = tr.codeRunnerName
    const testDir = tr.testDir
    const td = tr.testDefn
    // const cgTap = tr.cgTap
    const startTime = tr.startTime
    const doBidir = tr.doBidir
    const doGraphTypes = opts.useGraphTypes
    const testResultPartCommon = tr.parts[0]
    const testCt = tr.testCt

    const testResults = tr

    try {
        testCt.typeCheckTr()
        // testCt.typeCheckGr(1)

        testResults.ct = testCt

        const codeRunner = testCt.codeRunner(tr.co)
        testResults.codeRunner = codeRunner

        // count, log, and report all the type-errors in the project declarations and test-file declarations
        let typeCheckOk = true

        let typeErrorCountBidir: { [_: string]: number } | null = null
        let tcsTree: TcSummary | null = null
        if (doBidir) {
            const allDecls = testCt.allDecls()
            typeErrorCountBidir = countTypeErrors(allDecls)
            // For the purposes runtest, when expecting type-checking to pass, 
            //   an unproven type-check is as bad as a failed type-check.
            // ( The WebIDE is more informative and shows them differently ).
            typeErrorCountBidir.error += typeErrorCountBidir.unproven
            collectAndShowTypeErrors(allDecls)
            tcsTree = testCt.tcSummaryTr()
        }
        let tcsGraph: TcSummary | null = null
        if (doGraphTypes) {
            tcsGraph = testCt.tcSummaryGr()
            // testCt.typeCheckGr(1)
            // tcsGraph = tcSummariseGraph2(testCt.graph(), testCt.allDecls() as ExprTree<any> as ExprTree<ExprTypeGraph>)
            // // tcsGraph = testCt.tcSummary()
        }

        if (doBidir && opts.showTypes) {
            // console.log(expr.showExp2(codeRunner.declsBidir, "Expr: ty1", expr.showExprTy1))
            // console.log(expr.showExp2(codeRunner.declsBidir, "Expr: ty2", expr.showExprTy2))
            // printTypeDiffReport(codeRunner.declsBidir)
            console.log(showExp2(testCt.allDecls(), "Expr: ty1", showExprTy1))
            console.log(showExp2(testCt.allDecls(), "Expr: ty2", showExprTy2))

            if (opts.useGraphTypes) {
                console.log("")
                // // console.log(showExp2(codeRunner.declsBidir as unknown as ExprTree<ExprTypeGraph>, "Expr: Syn", testCt.graph().show.showExprTySyn))
                // // console.log(showExp2(codeRunner.declsBidir as unknown as ExprTree<ExprTypeGraph>, "Expr: Ctx", testCt.graph().show.showExprTyCtx))
                // console.log(showExp2(testCt.declsTy() as unknown as ExprTree<ExprTypeGraph>, "Expr: Syn", testCt.graph().show.showExprTySyn))
                // console.log(showExp2(testCt.declsTy() as unknown as ExprTree<ExprTypeGraph>, "Expr: Ctx", testCt.graph().show.showExprTyCtx))
                console.log(showExp2(testCt.declsTy() as unknown as ExprTree<ExprTypeGraph>, "Expr: Syn", testCt.graph().show.showExprTySyn))
                console.log(showExp2(testCt.declsTy() as unknown as ExprTree<ExprTypeGraph>, "Expr: Ctx", testCt.graph().show.showExprTyCtx))
                console.log("")
            }
        }

        if (typeErrorCountBidir !== null) {
            console.log("  Type Checks Bidir (Declarations)")
            console.log(`      Error: ${typeErrorCountBidir.error} (expect ${td.expected_type_errors})`)
            console.log(`      OK:    ${typeErrorCountBidir.ok} (expect ${td.expected_type_oks})`)
        }

        if (typeErrorCountBidir !== null) {
            // This checks the number of type errors is the expected number.
            // TODO ? Check type-oks too ?
            // TODO ? There aren't currently any fe4 tests that have an expected number of type "ok"s to compare against.
            typeCheckOk = typeCheckOk && typeErrorCountBidir.error === td.expected_type_errors
            typeCheckOk = typeCheckOk && (typeErrorCountBidir.ok === td.expected_type_oks || td.expected_type_oks === undefined)
            testResultPartCommon.typeCheckT = typeErrorCountBidir.error === td.expected_type_errors
            testResultPartCommon.passed = testResultPartCommon.typeCheckT
        }
        if (tcsGraph !== null) {
            typeCheckOk = typeCheckOk && tcsGraph.fail === td.expected_type_errors
            typeCheckOk = typeCheckOk && (tcsGraph.pass === td.expected_type_oks || td.expected_type_oks === undefined)
            // TODO ? check for a specified expected number for tcsGraph.unknown too ?
            testResultPartCommon.typeCheckG = (true
                // The graph-based type-checking doesn't supress cascaded errors, but the tree-based approach does.
                // This results in different error counts, so for now, any non-zero error-count is considered equal to any other non-zero error-count.
                && (tcsGraph.fail + tcsGraph.unknown === 0) === (td.expected_type_errors === 0)
                // tcsGraph.unknown === 0 &&
                && tcsGraph.internalError === 0
                // && tcsGraph.null === 0
                // && tcsGraph.undefined === 0
            )
            // testResultPartCommon.passed = testResultPartCommon.typeCheckT
        }


        // It's best to perform the value evaluations in a batch, due to the way the code-generators work.
        // But it's also desirable to run the checks in the order in which they are written in the test file.
        // As a compromise, the code-gen and all value evaluation is done when the first value is needed.
        let isEvaluationDone = false
        function evaluateActualValues() {
            if (isEvaluationDone) return
            isEvaluationDone = true
            const expectExprs: ExprLoc[] = []
            // const expectExprs: ExprNoLoc[] = []
            const trps_withActualValues: TestResultPart[] = []
            for (const trp of testResults.parts) {
                if (trp.check !== undefined) {
                    assert.isTrue(trp.expr !== undefined)
                    const check = trp.check
                    switch (check.tag) {
                        case "expectValue":
                        case "expect value":
                            console.log(`    Expression: ${check.expr}`)
                            let expr: ExprLoc = trp.expr
                            if (opts.grExpect) {
                                const g = tr.ct.graph()
                                const tyAny = tr.ct.primAddr("Any")!
                                const performTypeCheck = true
                                const addr = g.inst.instTerm(g.primitives, tr.ct.fullEnvG(), depthZero, expr, tyAny, performTypeCheck)
                                g.gr.reduce(addr)
                                let expr2
                                if (opts.codegen === null || opts.codegen === "NONE") {
                                    // Use readbackData, if there is no code-runner (or the "NONE" code-runner is in use)
                                    expr2 = readbackData(g.heap, addr)
                                }
                                else {
                                    // Otherwise, use readbackExpr so as to give the code-runner the opportunity to evaluate
                                    //   any unreduced primitives.
                                    expr2 = readbackExpr(g.heap, addr)
                                }
                                expr = expr2 as ExprLoc
                            }
                            expectExprs.push(expr)
                            trps_withActualValues.push(trp)
                            break
                        default:
                            break
                    }
                }
            }
            const actualValues = testCt.coderun_exprList(tr.co, expectExprs)
            for (const [i, trp] of trps_withActualValues.entries()) {
                trp.actualValue = actualValues[i]
            }
        }



        for (const trp of testResults.parts) {
            if (trp.check !== undefined) {
                const check = trp.check
                const ct = testResults.ct
                const desc = truncateStr(40, check.expr)
                const exprTy = testCt.typeExprStr(check.expr, check.lineStarts)
                const typeErrorCountT = countTypeErrors(exprTy)
                // Treat unproven type-checks the same as failed type-checks.
                typeErrorCountT.error += typeErrorCountT.unproven
                // const typeErrorCountT = types.countTypeErrors(exprTy)["error"] + types.countTypeErrors(exprTy)["unproven"]
                // const exprGr = testCt.instantiate_exprStr(null, check.expr, check.lineStarts)
                const tcsTree = tcSummariseTree2(exprTy)
                // const tcsGraph = tcSummariseGraph2(testResults.ct.graph(), exprGr)
                // const typeErrorCountG = doGraphTypes ? tcsGraph.fail + tcsGraph.unknown + tcsGraph.internalError : null
                const typeErrorCount = typeErrorCountT // === 0 && ((typeErrorCountG ?? 0) === 0)
                trp.exprTy = exprTy
                // The expr should always type-check ok, 
                //   except when using "typeCheckFail",
                //   in which case trp.typeCheck will be overwritten
                trp.typeCheckT = typeErrorCountT.error === 0
                // trp.typeCheckG = typeErrorCountG === 0
                // trp.typeCheckG = doGraphTypes ? tcsGraph.pass !== 0 && tcsGraph.fail === 0 && tcsGraph.unknown === 0 && tcsGraph.internalError === 0 : undefined

                let tcsGraph: TcSummary | null = null
                if (doGraphTypes) {
                    const exprGr = testCt.instantiate_exprStr(null, check.expr, check.lineStarts)
                    tcsGraph = tcSummariseGraph2(testResults.ct.graph(), exprGr)
                    if (tcsGraph.pass !== 0 && tcsGraph.fail === 0 && tcsGraph.unknown === 0 && tcsGraph.internalError === 0) {
                        trp.typeCheckG = true
                        console.log(`typeCheck (${check.tag}) PASSED (G): ${desc}`)
                    }
                    else {
                        trp.typeCheckG = false
                        console.log(`typeCheck (${check.tag}) FAILED (G): ${desc}`)
                    }
                }

                switch (check.tag) {
                    case "typeCheckOk": {
                        if (typeErrorCountT.error === 0) {
                            console.log(`typeCheckOk PASSED (T): ${desc}`)
                        }
                        else {
                            console.log(`typeCheckOk FAILED (T): ${desc}`)
                        }
                        if (tcsGraph !== null) {
                            if (tcsGraph.pass !== 0 && tcsGraph.fail === 0 && tcsGraph.unknown === 0 && tcsGraph.internalError === 0) {
                                trp.typeCheckG = true
                                console.log(`typeCheckOk PASSED (G): ${desc}`)
                            }
                            else {
                                trp.typeCheckG = false
                                console.log(`typeCheckOk FAILED (G): ${desc}`)
                            }
                        }
                        trp.passed = someTrueNoneFalse(trp.typeCheckT, trp.typeCheckG)
                        break
                    }
                    case "typeCheckFail": {
                        if (typeErrorCountT.error !== 0) {
                            trp.passed = true
                            trp.typeCheckT = true
                            console.log(`typeCheckFail PASSED (T): ${desc}`)
                        }
                        else {
                            trp.passed = false
                            trp.typeCheckT = false
                            console.log(`typeCheckFail FAILED (T): ${desc}`)
                        }
                        if (tcsGraph !== null) {
                            // if (tcsGraph.fail !== 0 && tcsGraph.unknown === 0 && tcsGraph.internalError === 0) {
                            // The type-check is expected to clearly fail, with no unknowns and no internal-errors
                            if ((tcsGraph.fail + tcsGraph.unknown) !== 0 && tcsGraph.internalError === 0) {
                                // Treat unknowns as fails, it's less rigorous than requring a clear fail, 
                                //   but that level of rigour is not the priority right now.
                                //   ( the "rcPairA" rule only exists to provide that rigour, but it sometimes contradicts the "rcPairPair" rule ).
                                trp.typeCheckG = true
                                console.log(`typeCheckFail PASSED (G): ${desc}`)
                            }
                            else {
                                trp.typeCheckG = false
                                console.log(`typeCheckFail FAILED (G): ${desc}`)
                            }
                        }
                        break
                    }
                    case "expectType":
                    case "expect type": {
                        if (doBidir) {
                            assert.isTrue(trp.expr !== undefined)
                            const expTy = testCt.typeExpr(trp.expr)

                            if (doBidir && opts.showTypes) {
                                console.log(showExp2(expTy, "Expr: ty1", showExprTy1))
                                console.log(showExp2(expTy, "Expr: ty2", showExprTy2))
                                // printTypeDiffReport(codeRunner.declsBidir)
                                printTypeDiffReport(testCt.declsTy())
                            }

                            const expectedType = check.expect
                            const td_expr = check.expr
                            let actualType = showTypeWithoutSubSuperBounds(expTy.ty1)
                            console.log(`      Actual Type (Bidir): ${actualType}`)
                            if (expectedType !== null) {
                                console.log(`      Expected Type      : ${expectedType}`)
                                if (actualType === expectedType) {
                                    trp.passed = true
                                    console.log(`    Type Test PASSED ${td.name}[${td_expr}]`)
                                    console.log("      Actual:", actualType)
                                    trp.typeMatchT = true
                                }
                                else {
                                    trp.passed = false
                                    console.log(`    Type Test FAILED ${td.name}[${td_expr}]`)
                                    console.log("      Expected:", expectedType)
                                    console.log("        Actual:", actualType)
                                    trp.typeMatchT = false
                                }
                            }
                        }
                        if (doGraphTypes) {
                            assert.isTrue(trp.expr !== undefined)
                            const exprG = ct.instantiate_expr(trp.exprTy)
                            const rbLetEnv = new Map
                            const rbLamEnv = new Map
                            // g.gr.reduceAll(exprG.synTy, formWeak)
                            // g.gr.reduceAll(exprG.synTy, formStrongZero)
                            const g = ct.graph()
                            g.gr.reduce(exprG.tm)
                            g.gr.reduce(exprG.synTy)
                            const actualTypeTy = readbackType(g.heap, rbLetEnv, rbLamEnv, exprG.synTy)
                            const actualType = showTypeWithoutSubSuperBounds(actualTypeTy)

                            // TODO ? Switching from using a textual comparison to a graph comparison ?
                            // TODO ? Readback doesn't currently preserve source names, so expectType tests fail with graph-types.

                            const expectExpr = parseTerm(new ParseState(scan2Fe("", check.expect)), "ferrum/0.1")
                            const expectG = ct.instantiate_expr(expectExpr)
                            g.gr.reduce(expectG.tm)
                            // g.gr.reduceAll(expectG.tm, formWeak)
                            // g.gr.reduceAll(expectG.tm, formStrongZero)

                            // TODO We either need to ensure all type-annotations are reduced too,
                            // TODO   or copy the term with the type-annotations removed (set them to Error or Unknown).
                            // g.gr.reduceAllReachable(expectG.tm, formStrongZero)
                            // TODO ? Do we still need this, given types are now reduced during instantiation ?
                            // g.gr.reduceAllReachable(expectG.tm, formWeak)

                            // const expectTy = copyWithoutIndirections(g.heap2, depthZero, g.heap2.directAddrOf(expectG.tm))
                            // const actualTy = copyWithoutIndirections(g.heap2, depthZero, g.heap2.directAddrOf(exprG.synTy))

                            const expectTy = g.heap.directAddrOf(expectG.tm)
                            const actualTy = g.heap.directAddrOf(exprG.synTy)

                            // trp.expectAddr = expectTy
                            // trp.actualAddr = actualTy

                            trp.expectAddr = g.heap.copyWithoutIndirections(expectTy)
                            trp.actualAddr = g.heap.copyWithoutIndirections(actualTy)

                            const predicates = graphPredicatesMk(g.heap)

                            // if (actualType === check.expect) {
                            // if (actualTy === expectTy) {
                            // if (graphCompare(g.heap2, actualTy, expectTy)) {
                            if (predicates.termEqual(actualTy, expectTy, false)) {
                                trp.passed = true
                                console.log(`    Type Test PASSED ${td.name}[${check.expr}]`)
                                console.log("      Actual:", actualType)
                                trp.typeMatchG = true
                            }
                            else {
                                trp.passed = false
                                console.log(`    Type Test FAILED ${td.name}[${check.expr}]`)
                                console.log("      Expected:", check.expect)
                                console.log("        Actual:", actualType)
                                console.log("      Expected:", expectTy)
                                console.log("        Actual:", actualTy)
                                console.log("      Expected:", showTypeWithoutSubSuperBounds(readbackType(g.heap, rbLetEnv, rbLamEnv, expectTy)))
                                console.log("        Actual:", showTypeWithoutSubSuperBounds(readbackType(g.heap, rbLetEnv, rbLamEnv, actualTy)))
                                trp.typeMatchG = false
                            }
                        }
                        trp.passed = someTrueNoneFalse(trp.typeMatchT, trp.typeMatchG)
                        break
                    }

                    // Term comparison, performed after term-graph reduction, but before code generation and execution.
                    // Currently used to check the values of types used at the term-level.
                    // Will be used to check functions reduce as expected.
                    // Could in-principle be used to check arbitrary values, but long-running computations are best left until after codegen time.
                    case "expectTerm": {
                        const expectedValue = check.expect
                        const td_expr = check.expr
                        assert.isTrue(trp.expr?.tag === "EVar")


                        // let typeValue = codeRunner.lookupTypeValueOrNull(trp.expr.name)


                        let typeValue: Type | null = null
                        const envEntry = ct.fullEnvT()[trp.expr.name]
                        if (envEntry === undefined) {
                            typeValue = null
                        }
                        let [varVal, varTy] = envEntry
                        if (varTy.tag === "TType" || varTy.tag === "TSingleType") {
                            typeValue = nodeToType(varVal)
                        }



                        if (typeValue !== null) {
                            let actualValue = showType2(typeValue)
                            if (actualValue === expectedValue) {
                                console.log(`    Term (Type Value) Test PASSED (T) ${td.name}[${td_expr}]`)
                                console.log("      Actual:", actualValue)
                                trp.termMatchT = true
                            }
                            else {
                                console.log(`    Term (Type Value) Test FAILED (T) ${td.name}[${td_expr}]`)
                                console.log("      Expected:", expectedValue)
                                console.log("        Actual:", actualValue)
                                trp.termMatchT = false
                            }
                        }
                        if (doGraphTypes) {


                            // assert.isTrue(trp.expr !== undefined)
                            // const exprG = ct.instantiate_expr(trp.expr)
                            // const rbLamEnv = new Map
                            // const actualTmExpr = readbackExpr(ct.graph().heap2, exprG.tm)
                            // const actualTmStr = showExp(actualTmExpr)


                            assert.isTrue(trp.expr !== undefined)
                            const exprG = ct.instantiate_expr(trp.exprTy)
                            const rbLamEnv = new Map
                            const g = ct.graph()
                            // g.gr.reduceAll(exprG.synTy, formWeak)
                            // g.gr.reduceAll(exprG.synTy, formStrongZero)
                            // TODO ? Redude weak-then-strong
                            g.gr.reduce(exprG.tm)
                            // g.gr.reduceAll(exprG.tm, formStrong)
                            const actualTermTm = readbackExpr(g.heap, exprG.tm)
                            // const actualTmStr = expr.showExpConcise(actualTermTm)
                            const actualTmStr = prettyFerrum(actualTermTm)

                            const predicates = graphPredicatesMk(g.heap)

                            // TODO ? Switching from using a textual comparison to a graph comparison ?
                            // TODO ? Readback doesn't currently preserve source names, so expectType tests fail with graph-types.

                            const expectExpr = parseTerm(new ParseState(scan2Fe("", check.expect)), "ferrum/0.1")
                            const expectG = ct.instantiate_expr(expectExpr)
                            // g.gr.reduceAll(expectG.tm, formWeak)
                            // g.gr.reduceAll(expectG.tm, formStrongZero)

                            // TODO We either need to ensure all type-annotations are reduced too,
                            // TODO   or copy the term with the type-annotations removed (set them to Error or Unknown).
                            // g.gr.reduceAllReachable(expectG.tm, formStrongZero)
                            // g.gr.reduceAllReachable(exprG.tm, formStrongZero)

                            g.gr.reduce(expectG.tm)
                            g.gr.reduce(exprG.tm)

                            // const expectTy = copyWithoutIndirections(g.heap2, depthZero, g.heap2.directAddrOf(expectG.tm))
                            // const actualTy = copyWithoutIndirections(g.heap2, depthZero, g.heap2.directAddrOf(exprG.synTy))

                            const expectTm = g.heap.directAddrOf(expectG.tm)
                            const actualTm = g.heap.directAddrOf(exprG.tm)

                            // trp.expectAddr = expectTm
                            // trp.actualAddr = actualTm

                            trp.expectAddr = expectG.tm
                            trp.actualAddr = exprG.tm

                            // trp.expectAddr = copyWithoutIndirections(g.heap, depthZero, expectTm)
                            // trp.actualAddr = copyWithoutIndirections(g.heap, depthZero, actualTm)

                            // if (actualType === check.expect) {
                            // if (actualTy === expectTy) {
                            // if (actualTmStr === expectedValue) {
                            // if (graphCompare(g.heap2, actualTm, expectTm)) {
                            if (predicates.termEqual(actualTm, expectTm, false)) {
                                console.log(`    Term Test PASSED (G) ${td.name}[${td_expr}]`)
                                console.log("      Expected:", expectedValue)
                                console.log("      Actual:", actualTmStr)
                                trp.termMatchG = true
                            }
                            else {
                                console.log(`    Term Test FAILED (G) ${td.name}[${td_expr}]`)
                                console.log("      Expected:", expectedValue)
                                console.log("        Actual:", actualTmStr)
                                trp.termMatchG = false
                            }
                        }
                        trp.passed = someTrueNoneFalse(trp.termMatchT, trp.termMatchG)
                        break
                    }
                    case "expectValue":
                    case "expect value": {
                        assert.isTrue(trp.expr !== undefined)
                        evaluateActualValues()
                        assert.isTrue(trp.actualValue !== undefined, "Failed to evaluate test values.")
                        if (trp.actualValue === check.expect) {
                            trp.passed = true
                            console.log(`    Value Test PASSED ${td.name}[${check.expr}]`)
                            console.log("      Actual:", trp.actualValue)
                            trp.valueMatch = true
                        }
                        else {
                            trp.passed = false
                            console.log(`    Value Test FAILED ${td.name}[${check.expr}]`)
                            console.log("      Expected:", check.expect)
                            console.log("        Actual:", trp.actualValue)
                            trp.valueMatch = false
                        }
                        if (doGraphTypes) {
                            const exprG = ct.instantiate_expr(trp.exprTy)
                        }
                        break
                    }

                    // Currently "expected_type_errors" is used to check the number of type errors in the "decls" section.
                    // It would be more consistent with other past changes to be able to count+compare the number of type-errors,
                    //   in a specific expression.
                    case "expectNumErrors":
                    case "expect errors":
                        console.log(`TODO: (${check.tag})`)
                        assert.todo(`TODO: (${check.tag})`)
                        break

                    default:
                        assert.noMissingCases(check)
                    // assert.todo(`Missing case: (${check.tag})`)
                }
            }
        }

    }
    catch (exc) {
        if (exc instanceof FuelExhausted) {
            // The test hasn't finished.
            // This continueTest function should be called again.
            return false
        }
        let exc2 = exc as Error
        console.log("runTest Exception: \n", exc2)
        console.log(exc2.stack)
        testResultPartCommon.noExceptionThrown = false
    }

    let endTime = Date.now()
    testResults.duration = endTime - startTime

    return true
}

// useLineStarts indicates that we want to token locations to be relative to the containing file,
//     (rather than locations reseting to (1,1) each time the token scanner is invoked).
//   true  - is used by the "runtest" CLI command, this is useful for file-based viewing/editing.
//   false - is used by the IDE, this is useful when viewing one sub-part (decls) of the test-defns file at a time.
export async function runTest(initCt: CodeTable, td: TestDefn, opts: Opts, codeRunnerName: CodeRunnerName, testDir: URL, useLineStarts = true): Promise<TestResult> {
    const tr = await startTest(initCt, td, opts, codeRunnerName, testDir, useLineStarts)
    let finished = false
    while (!finished) {
        finished = continueTest(tr)
    }
    return tr
}



//#endregion



export function showTestResultMnemonic(tr: TestResultPart, ref: boolean) {
    let tct = tr.typeCheckT === ref ? "TyCT" : "    "
    let tcg = tr.typeCheckG === ref ? "TyCG" : "    "
    let tmt = tr.typeMatchT === ref ? "TyMT" : "    "
    let tmg = tr.typeMatchG === ref ? "TyMG" : "    "
    let tmmt = tr.termMatchT === ref ? "TmMT" : "    "
    let tmmg = tr.termMatchG === ref ? "TmMG" : "    "
    let vam = tr.valueMatch === ref ? "VaM" : "   "
    // TODO ? variants of VaM for each codegen used, allow multiple codegens in a single test run ?
    // TODO ? variants of VaM for each tap (Direct, Inst, Spec) used, allow multiple taps in a single test run ?
    let exc = tr.noExceptionThrown === ref ? "Exc" : "   "
    return `[ ${tct} ${tcg} ${tmt} ${tmg} ${tmmt} ${tmmg} ${vam} ${exc} ]`
}


export function testResultMnemonics(tr: TestResultPart): [string, boolean | undefined][] {
    return [
        ["TyCT", tr.typeCheckT],
        ["TyCG", tr.typeCheckG],
        ["TyMT", tr.typeMatchT],
        ["TyMG", tr.typeMatchG],
        ["TmMT", tr.termMatchT],
        ["TmMG", tr.termMatchG],
        ["VaM", tr.valueMatch],
        ["Exc", tr.noExceptionThrown],
    ]
}
// TODO These labels need to match the mnemonics in the function above.
// TODO There's probably a good way to enforce they stay in sync.
export const testResultMnemonicLabels = ["TyCT", "TyCG", "TyMT", "TyMG", "TmMT", "TmMG", "VaM", "Exc"]

export type Opts = {
    readonly codegen: string
    readonly showDecls: boolean
    readonly showTypes: boolean
    readonly mode: GraphMode
    readonly useHeap: boolean
    readonly grDecls: boolean
    readonly grSpecial: boolean
    readonly grExpect: boolean
    readonly useGraphTypes: boolean
}

export type OptsRw = { -readonly [K in keyof Opts]?: Opts[K] }

export function mkOpts(opts: OptsRw): Opts {
    return {
        codegen:       /**/ opts.codegen       /**/ ?? "8",
        showDecls:     /**/ opts.showDecls     /**/ ?? false,
        showTypes:     /**/ opts.showTypes     /**/ ?? false,
        mode:          /**/ opts.mode          /**/ ?? "Bypass",
        useHeap:       /**/ opts.useHeap       /**/ ?? false,
        grDecls:       /**/ opts.grDecls       /**/ ?? false,
        grSpecial:     /**/ opts.grSpecial     /**/ ?? false,
        grExpect:      /**/ opts.grExpect      /**/ ?? false,
        useGraphTypes: /**/ opts.useGraphTypes /**/ ?? false,
    }
}


