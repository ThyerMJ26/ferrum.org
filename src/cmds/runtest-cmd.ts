//#region Imports

// Utils
import { unit } from "../utils/unit.js";
import { assert } from "../utils/assert.js";
import { CmdLine, cmdLine_schemaMatch, mkCmdLineSchema, CmdLine_SchemaBuild, CmdLine_TypeFor_Schema, CmdLine_SchemaMatch_Result } from "../utils/cmdline.js"

// Io
import { getIo, setIo } from "../io/io.js"
import { Fuel, FuelExhausted } from "../ui/fuel.js";

// Syntax
import { locMatch, nilLoc, showLoc } from "../syntax/token.js"
import { scanFile } from "../syntax/scan.js";
import { EDatum, LocField, Output, showExp2, showExpConcise, showExprTree, showExprTy1, showExprTy2, TypeAnnotBidir } from "../syntax/expr.js"
import { ParseState } from "../syntax/parse.js"
import { parseTerm, parseType, parseFile } from "../syntax/parseFerrum2.js"
import { Project, projectClone, readProject, emptyProject } from "../syntax/project.js";
import { prettyFerrum } from "../syntax/pretty-ferrum.js"
import { DeclLoc, DeclTypeBidir, ExprLoc, Expr, ExprTree, ExprTypeBidir, exprCopy, showExp, showExpr, visitAll } from "../syntax/expr.js";
import { Pos, Loc } from "../syntax/token.js";
import { scan2Fe } from "../syntax/scan.js";
import { readTestDefns, TdCheck, TdExpect, TestDefn } from "../syntax/test-defn.js";

// Tree
import { } from "../tree/eval.js"
import { Env } from "../tree/eval.js";
import { anyT, collectTypeErrors, countTypeErrors, getTypeMemoData, maxTypeCheckResult, nodeToType, showType2, showType4, showTypeDiff, showTypeWithoutSubSuperBounds, Type, TypeCheckResult, typeDeclBidir, typeExprBidir, unknownT } from "../tree/types.js";

// Graph
import { Addr, Depth, Heap, TypeAddr, assumeIsType, depthZero, formStrong, formWeak } from "../graph/graph-heap2.js";
import { ExprTypeGraph } from "../graph/graph-instantiate.js";
import { RbLamEnv, readbackData, readbackExpr, readbackType } from "../graph/graph-readback.js";
import { ShowFuncs, mkShow, showForm, showGraph } from "../graph/graph-show.js";
import { CodeOptions, CodeRunnerKey, CodeTable, Graph, GraphMode, graphMode_long, graphMode_short, GraphMonitor, graphMonitorNop, isGraphMode, mkCodeTable, tcSummariseGraph2, tcSummariseTree2, TcSummary } from "../graph/code-table.js";
import { graphPredicatesMk } from "../graph/graph-predicates.js"

// CodeGen
import { CodeRunner, codeRunnerMakers, CodeRunnerName, MkCodeRunner } from "../codegen/code-runners.js";

//
import { mkOpts, Opts, OptsRw, runTest, showTestResultMnemonic, someTrueNoneFalse, TestResult, TestResultPart } from "../runtest/run-test.js";


//#endregion




//#region Main

export const memo = getTypeMemoData()



const codegens = ["8", "TY", "C", "NONE"] as const

export const runTestCmdLineSchema = mkCmdLineSchema((b: CmdLine_SchemaBuild) => ({
    // codegen:       /**/ b.str  /**/("codegen"),
    // codegen:       /**/ b.oneOf  /**/("codegen", ["8", "TY", "C", "NONE"] as const),
    codegen:       /**/ b.oneOf  /**/("codegen", codegens),
    showDecls:     /**/ b.flag   /**/("showDecls"),
    useGraphTypes: /**/ b.flag   /**/("useGraphTypes"),
    showTypes:     /**/ b.flag   /**/("showTypes"),
    // graphMode:     /**/ b.str  /**/(["g", "graphMode"]),
    graphMode:     /**/ b.oneOf  /**/(["g", "graphMode"], [...graphMode_short, ...graphMode_long, "Direct", "InstRb"] as const),
}))


export type RunTestCmdLine = CmdLine_TypeFor_Schema<typeof runTestCmdLineSchema>

export async function main2(cmdLineValues: RunTestCmdLine, testDirUlr: URL, fileUrl: URL, testName: string | null) {

    let funcMemoFilename = "memo-data.tmp"
    memo.loadFromFile(funcMemoFilename)

    let opts: OptsRw = { mode: "Bypass" }
    // let opts: Opts = { mode: "TypesDecls" } // Intended default
    let mkCodeRunner: MkCodeRunner | undefined
    let codeRunnerName: CodeRunnerName | undefined
    let ferrumDir: string | null = null

    const clv = cmdLineValues

    if (clv.codegen !== undefined) {
        codeRunnerName = clv.codegen
        opts.codegen = clv.codegen
    }

    opts.showDecls = clv.showDecls
    opts.useGraphTypes = clv.useGraphTypes
    opts.showTypes = clv.showTypes

    if (clv.graphMode !== undefined) {
        let mode = clv.graphMode
        switch (mode) {
            case "Direct": // bypass the heap
                mode = "Bypass"
                break
            case "InstRb": // instantiate and readback, use the read-back expression for codegen.
                mode = "Inst"
                break
        }

        if (!isGraphMode(clv.graphMode)) {
            throw new Error(`Unknown graphMode value (${mode}).`)
        }

        opts.mode = clv.graphMode

        if (mode.includes("T")) {
            opts.useGraphTypes = true
        }
        if (mode.includes("D")) {
            opts.grDecls = true
        }
        if (mode.includes("E")) {
            opts.grExpect = true
        }
        if (mode === "I" || opts.grDecls || opts.grExpect) {
            opts.useHeap = true
        }
    }


    codeRunnerName ??= "8"
    mkCodeRunner = codeRunnerMakers[codeRunnerName]

    try {
        await main3(testDirUlr, fileUrl, testName, mkOpts(opts), codeRunnerName)
    }
    finally {
        memo.saveToFile()
        console.log("\x07") // go beep at the end
        process.stdout.write("", () => { }) // make sure everything is written out
    }
}


export async function main3(testDir: URL, filename: URL, testName: string | null, opts: Opts, codeRunnerName: CodeRunnerName) {

    const initCt = mkCodeTable({})

    let testDefnList: TestDefn[] = await readTestDefns(filename)

    let testCount = 0
    let testPasses = 0
    let testResultsList: [string, TestResultPart, boolean, string][] = []
    for (let td of testDefnList) {
        if (testName !== null && testName !== td.name) {
            continue
        }
        console.log("-".repeat(20))
        console.log(`Running Test: ${td.name}`)

        let testResults: TestResult = await runTest(initCt, td, opts, codeRunnerName, testDir)

        testResults.parts.forEach((trp, i) => {
            const ok = someTrueNoneFalse(
                trp.typeCheckT,
                trp.typeCheckG,
                trp.typeMatchT,
                trp.typeMatchG,
                trp.termMatchT,
                trp.termMatchG,
                trp.valueMatch,
                trp.noExceptionThrown
            ) ?? false


            if (ok) {
                testPasses += 1
            }
            let td_name = td.name
            if (testResults.parts.length > 1) {
                td_name = `${td.name}[${trp.partName}]`
            }
            let annot = ""
            if (i == 0) {
                if (testResults.duration === null) {
                    annot = " null"
                } else {
                    annot = `${Math.floor(testResults.duration / 1000)}s`
                }
            }
            testResultsList.push([td_name, trp, ok, annot])
            testCount += 1
        })
        console.log("-".repeat(20))
    }

    console.log()
    let maxNameLength = testResultsList.reduce((maxLen, [name]) => Math.max(name.length, maxLen), 10)
    let maxAnnotLength = testResultsList.reduce((maxLen, [, , , annot]) => Math.max(annot.length, maxLen), 1)
    testResultsList.forEach(([name, trp, ok, annot]) => {
        let trueMnemonic = showTestResultMnemonic(trp, true)
        let falseMnemonic = showTestResultMnemonic(trp, false)
        let name2 = name.padEnd(maxNameLength + 1)
        let annot2 = annot
        if (annot !== "") {
            annot2 = `[ ${annot.padStart(maxAnnotLength)} ]`
        }
        else {
            annot2 = " ".repeat(maxAnnotLength + 4)
        }
        switch (ok) {
            // case null:
            //     console.log(`--- Test SKIPPED ${name}`)
            //     break
            case true:
                console.log(`    PASS  ${annot2} ${name2} ${trueMnemonic} ${falseMnemonic}`)
                break
            case false:
                console.log(`*** FAIL  ${annot2} ${name2} ${trueMnemonic} ${falseMnemonic}`)
                break
            default:
                throw new Error(`Unknown result (${ok}).`)
        }
    })

    console.log()
    console.log(`Summary: ${testPasses} / ${testCount}`)
    console.log()
    if (testCount === 0) {
        console.log("***  NO TESTS RAN")
    }
    else if (testPasses === testCount) {
        console.log("     ALL TESTS PASSED")
    }
    else {
        console.log(`***  TEST FAILURES: ${testCount - testPasses}`)
    }
}




//#endregion


