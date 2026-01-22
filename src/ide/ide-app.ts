

const USE_GRAPH_TYPES = true
// const USE_GRAPH_TYPES = false


//#region Imports

//
import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js";
import { getIo } from "../io/io.js"

// UI
import { PortRw, PortR, NodeState, PortW } from "../ui/reactive.js"
import { Ui, PanelView, App, TabbedView, View, ViewCtx } from "../ui/app-ui.js"
import { uiText, UiText, uiTextA, uiTextI, uiTextList, uiTextS } from "../ui/text.js";
import { Fuel, fuelMk } from "../ui/fuel.js";
import { AppIo } from "../ui/app-server.js";

// Syntax
import { locMatch } from "../syntax/token.js";
import {
    ExprLoc, exprParts, visitChildren, visitParentOrChildren, ExprTypeBidir, ExprTree, Expr, DeclTypeBidir, VarSet, patBindVars,
    EVar
} from "../syntax/expr.js";
import {
    ExprDoc, mkPrettyFerrum, mkPrettyFerrum2, p2Show2, prettyFerrum, prettyFerrum2, prettyFerrumStyleDefns, pShow
} from "../syntax/pretty-ferrum.js";
import { Project } from "../syntax/project.js";
import { readTestDefns, TdCheck, TestDefn } from "../syntax/test-defn.js";

// Tree
import {
    getTypeMemoData, globalTIMemo, showTIExpr, showType4, TIExpr, TIMemoEntry, TIMemoKey, tiShowCause, tiSummaryGraph, tiSymbol, Type, typeRelComp0
} from "../tree/types.js"
import { showMbLoc } from "../tree/eval.js";

// Graph
import { Addr, Depth, depthZero, formNone, formWeak, addrNo, TypeAddr } from "../graph/graph-heap2.js";
import { ExprTypeGraph } from "../graph/graph-instantiate.js";
import {
    collectHeapDisplayInfo, HeapShowInfo, heapStyleDefns, showGraph, showTi_addr, showTi_expr, showTi_ruleName, showTi_value, tiEntryStyleDefns
} from "../graph/graph-show.js";
import { ExprAddr, RbLamEnv, RbLetEnv, readback, readback0 } from "../graph/graph-readback.js";
import { tieUnknown, TiExpr, tiIsContradiction, tiIsFalse, tiIsTrue, tiIsUnknown, TiMemoEntry, TiMemoKey, tiUnknown, TiVal } from "../graph/graph-ti.js";
import { CodeTable, Graph, tcsAdd, tcSummariseTree2, tcSummariseGraph2, TcSummary, tcsZero, GraphMonitor, mkCodeTable } from "../graph/code-table.js";

// CodeGen
import { CodeRunnerName } from "../codegen/code-runners.js"

//
import { continueTest, mkOpts, OptsRw, showTestResultMnemonic, someTrueNoneFalse, startTest, TestResult, testResultMnemonicLabels, testResultMnemonics, truncateStr } from "../runtest/run-test.js";
import {
    // showTestResultMnemonic, testResultMnemonicLabels, testResultMnemonics,
    // Opts, OptsRw, mkOpts
} from "../cmds/runtest-cmd.js";


//#endregion



//#region Compute Utils

const computeListAt = <U, V>(ui: Ui<U>, listS: PortR<V[]>, idxS: PortR<number | null>) =>
    ui.x.compute(null, null, () => {
        const list = listS.read()
        const idx = idxS.read()
        if (idx === null) {
            return null
        }
        if (idx < 0 || idx >= list.length) {
            return null
        }
        const value = list[idx]
        return value
    })

const computeMap = <U, V, V2>(ui: Ui<U>, listS: PortR<V[]>, func: (a: V) => V2) =>
    ui.x.compute(null, [], () => {
        const list = listS.read()
        const list2 = list.map(a => func(a))
        return list2
    })

function computeFwd<U, X, Y>(ui: Ui<U>, y: Y, x: PortR<X>, func: (x: X) => Y): PortR<Y> {
    return ui.x.compute(null, y, () => func(x.read())).r()
}


function nullish<X, Y>(x: X | null | undefined, y: Y, f: (x: X) => Y): Y {
    if (x === null || x === undefined) {
        return y
    }
    return f(x)
}

function computeNullish<U, X, Y>(ui: Ui<U>, y: Y, x: PortR<X | null | undefined>, func: (x: X) => Y): PortR<Y> {
    return ui.x.compute(null, y, () => {
        const x2 = x.read()
        if (x2 === null || x2 === undefined) {
            return y
        }
        return func(x2)
    }).r()
}


//#endregion



//#region Tab Utils

const mkBlankTab = <U>(ui: Ui<U>, tabbed: TabbedView<U>, tabName: string): PanelView<U> => {
    // let panel = ui.addTab(tabName, ui.createPanelView(`BlankTab_${tabName}`), false)
    const panel = addTab(ui, tabbed, tabName, ui.panelView(`BlankTab_${tabName}`), false)
    return panel
}

function addTab<U>(ui: Ui<U>, tabbed: TabbedView<U>, name: string, mkPanelView: (ctx: ViewCtx) => PanelView<U>, visible: boolean): PanelView<U> {
    // const panelView = ui.addTab(name, mkPanelView, visible)    
    // return panelView
    const toggleState = ui.x.state(`TabVisible_${name}`, visible).rw()
    return tabbed.addTab(name, mkPanelView, toggleState)
}

//#endregion



//#region TestDefns


type TestDefnsTab = {
    testDefn: PortR<TestDefn | null>
    testResults: PortR<Map<TestDefn, TestResult>>
    project: Project | null,
}

function mkTestDefnsTab4<U>(
    ui: Ui<U>,
    tabbedView: TabbedView<U>,
    appIo: AppIo,
    testFileName: URL, codeRunnerName: CodeRunnerName,
    currentAddr: PortW<Addr | null>,
    fuel: Fuel,
    initCt: CodeTable,
): TestDefnsTab {
    const name = "4"
    const panel = addTab(ui, tabbedView, "TestDefns4", ui.panelView(`TestDefnsTab_${name}-2`), true)

    const testDefns: NodeState<TestDefn[]> = ui.x.state(null, [])

    // TODO ? The current use of testResults+testResultsSig does not fit within the spirit of the reactive approach.
    // TODO ?   We typically only want to update a single results within the Map at a time,
    // TODO ?     but achieve this by modifying something outside of the reactive DAG 
    // TODO ?       and using this to write the whole Map again.
    // TODO ? Alternatives?:
    // TODO ?   - Use a Map of TestDefn -> Signal<TestResult> ?
    // TODO ?       Downstream processes then need to listen to every entry within the Map, or at least the currently selected one.
    // TODO ?       This might need the introduction of a dynamic way to update the downstream signals of a process (currently these are statically declared).
    // TODO ?   - Perform the update in a delay call, so that it runs outside of the DAG propagation stage ?
    // TODO ?   - Wait for further bolts of inspiration ?
    const testResults = new Map<TestDefn, TestResult>
    const testResultsSig = ui.x.state(null, testResults)

    // TODO ? A pair of old+new signals ?
    // TODO ? A process reads the old signal and relevant other inputs and then writes the new signal.
    // TODO ? An effect runs at the end of the cycle and writes the new value back into the old signal, ready for the next cycle.
    // TODO ? This seems like conceptually the right solution,
    // TODO ?   it does mean either 
    // TODO ?     - copying the entire map on each update.
    // TODO ?     - using a persistent map so that old and new can differ efficiently.
    // TODO ?     - allow aliased mutable state and assume any leaking of info backwards in time is benign,
    // TODO ?         (any reads of the old value after the writing of the new signal, but still in the same cycle, could get the new value, which is incorrect but often harmless).
    // const testResultsSigOld = ui.x.state(null, testResults)
    // const testResultsSigNew = ui.x.state(null, testResults)


    const selection: PortRw<number | null> = ui.x.state(`testDefnsSelection-${name}`, null as number | null).rw()

    const testFileTxt = ui.x.state(null, "")
    const testFileHighlight = ui.x.state<[number, number] | null>(null, null)

    // let newTestDefns = readTestDefns(testFileName)
    // testDefns.w().write(newTestDefns)

    ui.x.later(async () => {
        let newTestDefns = await readTestDefns(testFileName)
        testDefns.w().write(newTestDefns)
        const testFileContents = await getIo().vfs_read(testFileName)
        testFileTxt.w().write(testFileContents)
    })

    const testDefnTableHeadings = ui.x.state(null, ["OkT", "OkG", "Name"]).r()
    const testDefnTableRows = computeMap(ui, testDefns.r(), td => {
        let okT = uiText(null, "")
        let okG: UiText = ""
        const tr = testResultsSig.r().read().get(td)
        if (tr !== undefined) {
            // okT = testResultMnemonic(tr)
            okT = troolMnemonic(
                someTrueNoneFalse(...tr.parts.map(trp =>
                    someTrueNoneFalse(trp.typeCheckT, trp.typeMatchT, trp.termMatchT, trp.valueMatch, trp.noExceptionThrown))))
            okG = troolMnemonic(
                someTrueNoneFalse(...tr.parts.map(trp =>
                    someTrueNoneFalse(trp.typeCheckG, trp.typeMatchG, trp.termMatchG, trp.valueMatch, trp.noExceptionThrown))))
        }
        return [okT, okG, uiText(null, td.name)]
    })

    const testDefnRows = computeMap(ui, testDefns.r(), td => td.name)
    const testDefn = computeListAt(ui, testDefns.r(), selection.r())
    const declText = ui.x.compute(null, "", () => {
        let td = testDefn.r().read()
        if (td === null) {
            return "no TestDefn selected"
        }
        else {
            return td.decls.map(d => d[0]).join("\n")
        }
    })

    let checksSelection = ui.x.state<number | null>(`checksSelection-${name}`, null)
    let checksRows = ui.x.compute(null, [] as string[], () => {
        let td = testDefn.r().read()
        if (td !== null) {
            let rows: string[] = td.expects.map(([td_expr, pos, expectedVal, expectedType, expectedErrors]) => td_expr)
            return rows
        }
        else {
            return []
        }
    })

    const styleNums = ui.styles({
        normal: {},
        pass: { fg: "Green" },
        fail: { fg: "Red" },
        // skip: { bg: "Yellow" },
        skip: {},
        sts: {},
        btn: { weight: 1 },
        btn_pressed: { weight: 1 },
        btn_inactive: { weight: -1 }
    })
    const s = styleNums


    const checksTableHdrs = ["Checks", "Val"]
    // const checksTableHdrs = ["Checks", "Tag", "Input", "Output"]
    const checksTableHeadings = ui.x.state(null, checksTableHdrs)
    const checksContentsTable = ui.x.compute<UiText[][]>(null, [], () => {
        let td = testDefn.r().read()
        // let rows: string[] = td?.expects.map(([td_expr, pos, expectedVal, expectedType, expectedErrors]) => td_expr) ?? []
        const expects = td?.expects ?? []
        const rows = checksRows.r().read()
        const s = styleNums
        // const tableRows: UiText[][] = rows.map<UiText[]>(c => [[[s.normal, c]]])
        const tableRows: UiText[][] = expects.map<UiText[]>(([td_expr, pos, expectedVal, expectedType, expectedErrors]) =>
            [uiText(s.normal, td_expr), uiText(s.normal, expectedVal ?? "")]
        )
        return tableRows
    })
    let checkRowSelected: NodeState<number | null> = ui.x.state("checksSelection-table", null)



    /*** Run ***/

    type Action = "start" | "stop" | "run-all" | "run-selected" | "clear-all" | "clear-selected"
    type Mode = "run-all" | "run-selected"
    type Part = "STATUS" | "MODE"

    const startedSig = ui.x.state(null, false) // Started or stopped.
    const runSig = ui.x.state("tdRun", false) // Running, or just ready to run.
    const continueSig = ui.x.state("tdContinue", false) // Proceed to continue running the test.
    const modeSig = ui.x.state<Mode>(null, "run-selected")
    const currentTestResults = ui.x.state<TestResult | null>(null, null)


    const runText: NodeState<UiText<Action, Part>> = ui.x.state("TestDefns_RunText", uiTextList<Action, Part>(

        uiTextS(s.sts, "Status: ", uiTextI("STATUS"), "\n"),
        uiTextS(s.sts, "Mode: ", uiTextI("MODE"), "\n"),

        uiText(s.sts, "\n"),
        uiTextA(s.btn, "  [Start]\n", "start"),
        uiTextA(s.btn, "  [Stop]\n", "stop"),
        uiText(s.sts, "\n"),
        uiTextA(s.btn, "  [Run All     ]\n", "run-all"),
        uiTextA(s.btn, "  [Run Selected]\n", "run-selected"),
        uiText(s.sts, "\n"),
        uiTextA(s.btn, "  [Clear All     ]\n", "clear-all"),
        uiTextA(s.btn, "  [Clear Selected]\n", "clear-selected"),
    ))

    const runPartsN = ui.x.compute<Map<Part, UiText<Action, Part>>>("TestDefns_RunPart", new Map, () => {
        return new Map<Part, UiText<Action, Part>>([
            ["STATUS", uiTextI("STATUS", uiText(s.sts, startedSig.r().read() ? continueSig.r().read() ? "Running" : "Ready" : "Stopped"))],
            ["MODE", uiTextI("MODE", uiText(s.sts, modeSig.r().read()))],
        ])
    })

    const runPane = panel.addPane("run", ui.textView2<Action, Part>({
        text: runText.r(),
        parts: runPartsN.r(),
    }))

    runPane.callback({
        click(annot) {
            const td = testDefn.r().read()
            const action = annot as Action
            switch (action) {
                case "start": {
                    startedSig.w().write(true)
                    // const f = runFuelSig.read()
                    // f.start()
                    // // Start with an empty fuel tank.
                    // // This produces a quick initial response followed by more substantial subsequent responses.
                    // f.jettison()
                    // runFuelSig.write(f)
                    break
                }
                case "stop":
                    startedSig.w().write(false)
                    // const f = runFuelSig.read()
                    // f.stop()
                    // runFuelSig.write(f)
                    break
                case "run-all":
                case "run-selected":
                    modeSig.w().write(action)
                    break
                case "clear-all":
                    testResults.clear()
                    testResultsSig.w().write(testResults)
                    break
                case "clear-selected":
                    if (td !== null) {
                        testResults.delete(td)
                        testResultsSig.w().write(testResults)
                    }
                    break
                default:
                    assert.noMissingCases(action)
            }
            // Whatever was clicked, schedule the test runner,
            // It's harmless (other than a brief Ready->Running->Ready flicker) to call the test runner when not needed.
            runSig.w().write(true)
        },
    })

    async function initTest(td: TestDefn): Promise<TestResult>
    async function initTest(td: null): Promise<null>
    async function initTest(td: TestDefn | null): Promise<TestResult | null>
    async function initTest(td: TestDefn | null): Promise<TestResult | null> {
        if (td !== null) {
            const tr = testResults.get(td)
            if (tr !== undefined) return tr
            console.log("TD Run", td.name)
            const opts: OptsRw = { useGraphTypes: USE_GRAPH_TYPES, mode: USE_GRAPH_TYPES ? "T" : "B" }
            // const opts: Opts = { useGraphTypes: true, useHeap: true, codegen: "GR" }
            const result = await startTest(initCt, td, mkOpts(opts), codeRunnerName, testFileName, false)
            // runSig.w().write(true)
            return result
        }
        return null
    }


    ui.x.effect(null, () => {
        const mode = modeSig.r().read()
        const run = runSig.r().read()
        const d = testDefn.r().read()
        const defns = testDefns.r().read()
        ui.x.later(async () => {
            const mode = modeSig.r().read()
            const run = runSig.r().read()
            const d = testDefn.r().read()
            const defns = testDefns.r().read()
            switch (mode) {
                case "run-selected": {
                    if (d === null) break
                    let tr = testResults.get(d)
                    if (tr === undefined) {
                        tr = await initTest(d)
                        testResults.set(d, tr)
                        testResultsSig.w().write(testResults)
                    }
                    if (!tr.finished) {
                        testResultsSig.w().write(testResults)
                        currentTestResults.w().write(tr)
                        continueSig.w().write(true)
                        return
                    }
                    continueSig.w().write(false)
                    break
                }
                case "run-all": {
                    let td: TestDefn | null = null
                    for (const d of defns) {
                        let tr = testResults.get(d)
                        if (tr === undefined) {
                            tr = await initTest(d)
                            testResults.set(d, tr)
                        }
                        if (!tr.finished) {
                            testResultsSig.w().write(testResults)
                            currentTestResults.w().write(tr)
                            continueSig.w().write(true)
                            return
                        }
                    }
                    continueSig.w().write(false)
                    break
                }
                default:
                    assert.noMissingCases(mode)
            }
        })
    })

    ui.x.effect(null, () => {
        const active = startedSig.r().read()
        const run = continueSig.r().read()
        const tr = currentTestResults.r().read()
        if (!active || !run || tr === null || tr.finished) return

        ui.x.later((): unit => {
            if (tr.finished === false) {
                fuel.refill()
                // TODO ? Take the FuelExhausted try-catch block out of "continueTest" and place it here ?
                // TODO ?   This would keep the concept of fuel-exhaution more localized.
                // TODO ?   However, it is useful to be able to distinguish between FuelExhaustion and 
                // TODO ?     genuine bugs/error which result in an exception.
                tr.finished = continueTest(tr)
                // if (tr.finished) {
                testResultsSig.w().write(testResults)
                // }
            }
            else {
                // continueSig.w().write(true)
            }
            runSig.w().write(true)
            return
        })

    })





    /*** Results ***/

    const testResult: PortR<TestResult | null> = ui.x.compute(null, null, () => {
        const td = testDefn.r().read()
        if (td === null) return null
        const trs = testResultsSig.r().read()
        const tr = trs.get(td)
        if (tr === undefined) return null
        return tr
    }).r()

    function testResultMnemonic(tr: TestResult): UiText {
        let numPassed = 0
        let numSkipped = 0
        let numFailed = 0
        for (const trp of tr.parts) {
            numPassed += trp.passed === true ? 1 : 0
            numSkipped += trp.passed === undefined ? 1 : 0
            numFailed += trp.passed === false ? 1 : 0
        }
        if (numFailed !== 0) {
            return uiText(s.fail, "X")
        }
        if (numPassed !== 0 && numSkipped === 0) {
            return uiText(s.pass, "/")
        }
        if (numPassed !== 0 && numSkipped !== 0) {
            return uiTextList(uiText(s.skip, "-"), uiText(s.pass, "/"))
        }
        return uiText(s.skip, "-")
    }

    function troolMnemonic(val: boolean | undefined): UiText {
        switch (val) {
            case true:
                return uiText(s.pass, "/")
            case false:
                return uiText(s.fail, "X")
            case undefined:
                return uiText(s.skip, "-")
            default:
                assert.noMissingCases(val)
        }
    }

    const resultsTableHdrs = ["OkT", "OkG", "Check", "Expr", "Expect", "Actual", ...testResultMnemonicLabels]
    const resultsTableHeadings = ui.x.state(null, resultsTableHdrs)
    const resultsContentsTable = ui.x.compute<UiText[][]>(null, [], () => {
        const td = testDefn.r().read()
        const tr = testResult.read()
        if (tr === null) return []
        const s = styleNums
        const tableRows: UiText[][] = tr.parts.map<UiText[]>((trp): UiText[] => {
            const pass = trp.typeCheckT === true && trp.passed === true
            const fail = trp.typeCheckT === false || trp.passed === false
            const msg: UiText = pass ? uiText(s.pass, "/") : fail ? uiText(s.fail, "X") : uiText(s.skip, "-")
            const okT = troolMnemonic(someTrueNoneFalse(trp.typeCheckT, trp.typeMatchT, trp.termMatchT, trp.valueMatch, trp.noExceptionThrown))
            const okG = troolMnemonic(someTrueNoneFalse(trp.typeCheckG, trp.typeMatchG, trp.termMatchG, trp.valueMatch, trp.noExceptionThrown))
            const check = trp.check?.tag ?? ""
            const expr = truncateStr(10, trp.check?.expr ?? "")
            const expect = (trp.check as TdCheck & { expect: string })?.expect ?? ""
            const actual = trp.actualValue ?? ""
            const passMn = showTestResultMnemonic(trp, true)
            const failMn = showTestResultMnemonic(trp, false)
            const expectAddrTxt = `${trp.expectAddr ?? "-"}`
            const actualAddrTxt = `${trp.actualAddr ?? "-"}`

            const resultMnParts = testResultMnemonics(trp).map(([mn, result]) => {
                switch (result) {
                    case true: return uiText(s.pass, "/")
                    case false: return uiText(s.fail, "X")
                    case undefined: return uiText(s.skip, " ")
                    default: assert.noMissingCases(result)
                }
            })
            const resultMn = uiTextList(...resultMnParts)
            return [
                okT, okG,
                check,
                uiText(s.normal, expr),
                expectAddrTxt,
                actualAddrTxt,
                ...resultMnParts
            ]
        })
        return tableRows
    })
    let resultsRowSelected: NodeState<number | null> = ui.x.state("resultsSelection-table", null)


    const testFileView = panel.addPane("contents", ui.editorView(testFileTxt.rw(), testFileHighlight.r()))
    // panel.addPane("defns (list)", ui.createListView(testDefnRows.r(), selection, { selected: () => { } }))
    panel.addPane("defns (table)", ui.tableView(testDefnTableHeadings, testDefnTableRows.r(), selection, {
        clicked(row, col, pos) {
            const selected = selection.read()
            let highlight: [number, number] | null = null
            if (selected !== null) {
                const testDefn = testDefns.r().read()[selected]
                if (testDefn !== undefined) {
                    const loc = testDefn.loc
                    highlight = [loc.begin.pos, loc.end.pos]
                }
            }
            testFileHighlight.w().write(highlight)

        },
    }))
    // panel.addPane("checks", ui.createListView(checksRows.r(), checksSelection.rw(), {}))
    // panel.addPane(
    //     "checks (table)",
    //     ui.createTableView(checksTableHeadings.r(), checksContentsTable.r(), checkRowSelected.rw(), {})
    // )
    panel.addPane(
        "results",
        ui.tableView(resultsTableHeadings.r(), resultsContentsTable.r(), resultsRowSelected.rw(), {
            clicked(row, col, pos) {
                const tr = testResult.read()
                let highlight: [number, number] | null = null
                if (tr !== null) {
                    const tp = tr.parts[row]
                    if (tp !== undefined) {
                        const loc = tp.check?.loc
                        if (loc !== undefined) {
                            highlight = [loc.begin.pos, loc.end.pos]
                        }
                    }
                    // Handle clicks on expect/actual Addrs
                    switch (col) {
                        case 4: // Expect
                            currentAddr.write(tp.expectAddr ?? null)
                            break
                        case 5: // Actual
                            currentAddr.write(tp.actualAddr ?? null)
                            break
                        default:
                        // skip
                    }

                }
                testFileHighlight.w().write(highlight)
            },
        })
    )


    return {
        testDefn: testDefn.r(),
        testResults: testResultsSig.r(),
        project: null,
    }

}



//#endregion



//#region Project


function mkProjectTab<U>(
    ui: Ui<U>,
    tabbedView: TabbedView<U>,
    projectState: PortR<Project | null>
) {
    const projectTxt2 = ui.x.state(null, "")
    ui.x.process(null, [projectTxt2], () => {
        const project = projectState.read()
        // ui.log("project contents", truncateStr(20, project?.fileContents ?? ""))
        projectTxt2.w().write(project?.fileContents ?? "")
    })

    const entriesRows = ui.x.compute(null, [] as string[], () => {
        const rows: string[] = []
        const project = projectState.read()
        if (project === null) {
            return rows
        }
        else {
            for (let entry of project.parts) {
                switch (entry.tag) {
                    case "source":
                        rows.push(`import code: ${entry.filename}`)
                        break
                    case "text":
                        rows.push(`bind text: ${entry.name} = ${entry.filename}`)
                        break
                    default:
                        throw new Error("unknown tag")
                }
            }
            return rows
        }
    })

    const entriesSelection: NodeState<number | null> = ui.x.state("projectTab", null)

    const sourceTxt2 = ui.x.state(null, "")
    ui.x.process(null, [sourceTxt2], () => {
        const project = projectState.read()
        const entryNum = entriesSelection.r().read()
        if (project === null || entryNum === null) {
            sourceTxt2.w().write("")
            return
        }
        sourceTxt2.w().write(project.contents.get(project.parts[entryNum]?.filename) ?? "")
    })

    const panel = addTab(ui, tabbedView, "Project", ui.panelView("ProjectTab"), false)
    panel.addPane("project", ui.editorView(projectTxt2.rw()))
    panel.addPane("entries", ui.listView(entriesRows.r(), entriesSelection.rw(), { selected: () => { } }))
    panel.addPane("source", ui.editorView(sourceTxt2.rw()))

    return
}

//#endregion



//#region Source4

type DeclEntry4 = {
    label: string,
    exprs: ExprTypeBidir[]
    addr: Addr | null
    tcT: TcSummary
    tcG: TcSummary
}

type SourceEntry4 = {
    label: string,
    source: string,
    decls: DeclEntry4[]
    tcT: TcSummary
    tcG: TcSummary
}

type SourceTab4<U> = {
    view: PanelView<U>,
    currentSource: PortR<SourceEntry4 | null>
    currentDecl: PortR<DeclEntry4 | null>,
    currentExpr: PortR<ExprTypeBidir | null>,
}


function mkSourceTab4<U>(
    ui: Ui<U>,
    tabbedView: TabbedView<U>,
    testResult: PortR<TestResult | null>,
    currentAddr: PortW<Addr | null>,
): SourceTab4<U> {

    const ctSig = ui.x.compute(null, null as CodeTable | null, () => {
        const tr = testResult.read()
        // return tr?.ct ?? null
        return tr?.testCt ?? null
    })

    const s = ui.styles({
        std: {},
        pass: { fg: "Green" },
        fail: { fg: "Red" },
        unkn: { bg: "Yellow" },
        internalError: { bg: "Magenta" },
        skip: {},
    })

    function tcMnemonic(val: TiVal | null): UiText {
        if (val === null) return uiText(null, " ")
        if (tiIsContradiction(val)) return uiText(s.internalError, "!!!")
        if (tiIsFalse(val)) return uiText(s.pass, "/")
        if (tiIsTrue(val)) return uiText(s.fail, "X")
        if (tiIsUnknown(val)) return uiText(s.unkn, "?")
        return uiTextList(uiText(s.internalError, "!"), uiText(s.unkn, "?"), uiText(s.internalError, "!"))
    }

    function tcsTextSingle(tcs: TcSummary): UiText {
        if (tcs.pass === 0 && tcs.unknown === 0 && tcs.fail === 0 && tcs.internalError === 0) return uiText(null, " ")
        if (tcs.internalError !== 0) return uiText(s.internalError, "!!!")
        if (tcs.fail !== 0) return uiText(s.fail, "X")
        if (tcs.unknown !== 0) return uiText(s.unkn, "?")
        if (tcs.pass !== 0) return uiText(s.pass, "/")
        return uiTextList(uiText(s.internalError, "!"), uiText(s.unkn, "?"), uiText(s.internalError, "!"))
    }
    function tcsTextMulti(tcs: TcSummary): UiText<never> {
        const result: UiText<never>[] = []
        if (tcs.internalError !== 0) result.push(uiText(s.internalError, "!!!"))
        if (tcs.fail !== 0) result.push(uiText(s.fail, "X"))
        if (tcs.unknown !== 0) result.push(uiText(s.unkn, "?"))
        if (tcs.pass !== 0) result.push(uiText(s.pass, "/"))
        if (tcs.null !== 0 || tcs.undefined !== 0) result.push(uiText(s.skip, "-"))
        return uiTextList<never>(...result)
    }
    const tcsText = tcsTextSingle
    // const tcsText = tcsTextMulti


    function patLabel(pat: ExprLoc): string {
        let freeVars: VarSet = {}
        let boundVars: VarSet = {}
        let patVars: VarSet = {}
        patBindVars("Term", pat, boundVars, freeVars, patVars)
        const label = [...Object.keys(patVars)].join(", ")
        return label
    }


    let panel = addTab(ui, tabbedView, "Source4", ui.panelView("SourceTab4"), true)



    const source4EntryListSig: PortR<SourceEntry4[]> = ui.x.compute<SourceEntry4[]>(null, [], () => {
        const tr = testResult.read()
        if (tr === null) {
            return []
        }
        const td = tr.testDefn

        const ct = ctSig.r().read()
        assert.isTrue(ct !== null)


        // TODO ? Use the code-tables for more stuff, don't make direct references to the graph ?
        const g = tr.ct.graph()

        let sourceEntryList: SourceEntry4[] = []



        const primDecls: DeclEntry4[] = []
        for (const primVar of ct.primitives()) {
            const primVar2 = primVar as ExprTypeGraph & EVar
            // const addr = ct.primAddr(name)
            const name = primVar2.name
            const addr = primVar2.tm ?? null
            const label = addr === null ? `${name} (TODO)` : `${name}`
            const exprs: ExprAddr[] = []
            if (g !== undefined && addr !== null) {
                const expr = readback0(g.heap, new Map, new Map, new Set, "Term", addr)
                visitParentOrChildren(expr, function visitor(field, exp) {
                    const exp2 = exp as Expr as ExprTypeGraph
                    exp2.tm = exp.addr
                    exp2.synTy = g.heap.typeOf(exp.addr)
                    exp2.ctxTy = tr.ct.primAddr("Any") as TypeAddr
                    exprs.push(exp)
                    visitChildren(exp, visitor)
                })
            }

            const declEntry: DeclEntry4 = {
                label,
                exprs: exprs as Expr[] as ExprTypeBidir[],
                addr,
                tcT: tcsZero(),
                tcG: tcsZero(),
            }
            // sourceEntry.decls.push(declEntry)
            primDecls.push(declEntry)
        }

        sourceEntryList.push({
            // label: ctRoot.name(),
            label: "<primitives>",
            source: "",
            decls: primDecls,
            tcT: tcsZero(),
            tcG: tcsZero(),
        })


        for (const row of ct.rows()) {
            const sourceContents = row.source() ?? tr.project?.contents.get(row.name()) ?? ""
            const sourceEntry: SourceEntry4 = {
                label: row.name(),
                source: sourceContents,
                decls: [],
                tcT: tcsZero(),
                tcG: tcsZero(),
            }

            // const decls = row.declsTy()
            const decls = row.decls() as DeclTypeBidir[]
            for (const decl of decls) {
                const [pat, defn] = decl
                const label = patLabel(pat)
                const defnG = defn as ExprTypeBidir & ExprTypeGraph
                const addr = defnG.tm ?? null
                const declEntry: DeclEntry4 = {
                    label,
                    exprs: [],
                    addr,
                    tcT: row.tcSummaryTr_expr(decl),
                    tcG: USE_GRAPH_TYPES ? row.tcSummaryGr_expr(decl as ExprTree<any> as ExprTree<ExprTypeGraph>) : tcsZero()
                }
                tcsAdd(sourceEntry.tcT, declEntry.tcT)
                tcsAdd(sourceEntry.tcG, declEntry.tcG)
                sourceEntry.decls.push(declEntry)
                visitChildren(decl, function visit(field, expr) {

                    // if (locMatch(expr.loc, "", 3,10,5,53)) {
                    //     assert.breakpoint()
                    // }

                    declEntry.exprs.push(expr)
                    visitChildren(expr, visit)
                })
            }
            sourceEntryList.push(sourceEntry)
        }


        if (td !== null) {

            for (const part of tr.parts) {
                if (part.check !== undefined && part.exprTy !== undefined) {
                    const exprG = part.exprTy as ExprTypeBidir & ExprTypeGraph
                    const addr = exprG.tm ?? null
                    // const declEntry: DeclEntry4 = { label: "_", exprs: [], addr, tcT: tcSummariseTree2(part.exprTy), tcG: tcSummariseGraph2(g, part.exprTy as ExprTree<any> as ExprTree<ExprTypeGraph>) }
                    const declEntry: DeclEntry4 = {
                        label: "_",
                        exprs: [],
                        addr,
                        // tcT: tcSummariseTree2(part.exprTy), 
                        // tcG: tcSummariseGraph2(g, part.exprTy as ExprTree<any> as ExprTree<ExprTypeGraph>) 
                        tcT: ct.tcSummaryTr_expr(part.exprTy),
                        tcG: USE_GRAPH_TYPES ? ct.tcSummaryGr_expr(part.exprTy as ExprTree<any> as ExprTree<ExprTypeGraph>) : tcsZero()
                    }
                    const sourceEntry: SourceEntry4 = {
                        label: `<${part.check.tag}>`,
                        decls: [declEntry],
                        source: part.check.expr,
                        // tcT: tcSummariseTree2(part.exprTy),
                        // tcG: tcSummariseGraph2(g, part.exprTy as ExprTree<any> as ExprTree<ExprTypeGraph>),
                        tcT: ct.tcSummaryTr_expr(part.exprTy),
                        tcG: USE_GRAPH_TYPES ? ct.tcSummaryGr_expr(part.exprTy as ExprTree<any> as ExprTree<ExprTypeGraph>) : tcsZero(),
                    }
                    sourceEntryList.push(sourceEntry)
                    visitParentOrChildren(part.exprTy, function visit(field, expr) {
                        declEntry.exprs.push(expr)
                        visitChildren(expr, visit)
                    })
                }
            }
        }

        return sourceEntryList
    }).r()


    const source3Headings = ui.x.state(null, ["T", "G", "Source"]).r()
    const source3Rows = ui.x.compute<SourceEntry4[]>(null, [], () => {
        // return source3EntryListSig.read()
        return source4EntryListSig.read()
    })
    const source3RowLabels = computeMap(ui, source3Rows.r(), (se) => {
        const okT = tcsText(se.tcT)
        const okG = tcsText(se.tcG)
        const filename = uiText(s.std, se.label)
        const row: UiText[] = [okT, okG, filename]
        return row
    }).r()
    const source3Selection = ui.x.state<number | null>("sourceSelection4", null).rw()
    const current3Source = computeListAt(ui, source3Rows.r(), source3Selection.r()).r()

    const decls3Headings = ui.x.state(null, ["T", "G", "Binds", "Addr"]).r()
    const decls3Rows = ui.x.compute<DeclEntry4[]>(null, [], () => {
        return current3Source.read()?.decls ?? []
    }).r()
    const decls3RowLabels = computeMap(ui, decls3Rows, (de) => {
        const okT = tcsText(de.tcT)
        const okG = tcsText(de.tcG)
        const label = uiText(s.std, de.label)
        const addr = uiText(s.std, `${de.addr}`)
        const row: UiText[] = [okT, okG, label, addr]
        return row
    }).r()
    const decls3Selection = ui.x.state<number | null>("declSelection4", null).rw()
    const current3Decl = computeListAt(ui, decls3Rows, decls3Selection.r()).r()

    const exprs3Headings = ui.x.state(null, ["T", "G", "Expr", "Addr", "Syn", "Ctx", "RC", "TorP", "Loc"]).r()
    const exprs3Rows = ui.x.compute<ExprTypeBidir[]>(null, [], () => {
        return current3Decl.read()?.exprs ?? []
    }).r()
    const exprs3RowLabels = computeMap(ui, exprs3Rows, (e) => {
        const ct = ctSig.r().read()
        assert.isTrue(ct !== null)
        let [tag, attrNames, children] = exprParts(e)
        let attrValues = attrNames.map((f => ` ${f}=${JSON.stringify((e as any)[f]).slice(0, 20)}`)).join("")
        let tcT: UiText
        switch (e.tc) {
            case "ok": tcT = uiText(s.pass, "/"); break
            case "error": tcT = uiText(s.fail, "X"); break
            case "unproven": tcT = uiText(s.unkn, "?"); break
            case null: tcT = uiText(s.skip, "-"); break
            case undefined: tcT = uiText(s.skip, "-"); break
            default: assert.unreachable()
        }
        let tcG: UiText = uiText(s.unkn, "?")
        const e2 = e as ExprTypeGraph & ExprTypeBidir
        if (e2.torp !== undefined && e2.synTy !== undefined && e2.ctxTy !== undefined) {
            // const tiVal = crGr.ti.typeCheck2(e2.torp, e2.synTy, e2.ctxTy, e2.loc)
            const tiVal = USE_GRAPH_TYPES ? ct.typeCheckGr_expr_tiVal(e2) : tiUnknown
            tcG = tcMnemonic(tiVal)
        }
        const eG = e as ExprTypeBidir & ExprTypeGraph
        const addr: UiText = uiText(s.std, `${eG.tm ?? "-"}`)
        const syn: UiText = uiText(s.std, `${eG.synTy ?? "-"}`)
        const ctx: UiText = uiText(s.std, `${eG.ctxTy ?? "-"}`)
        const rc = uiText(s.std, `${eG.rc ?? "-"}`)
        const torp = eG.torp === "Term" ? "T" : "P"
        const row: UiText[] = [tcT, tcG, uiText(s.std, `${tag} ${attrValues}`), addr, syn, ctx, rc, torp, uiText(s.std, showMbLoc(e))]
        return row
    }).r()
    const exprs3Selection = ui.x.state<number | null>("exprSelection4", null).rw()
    const current3Expr = computeListAt(ui, exprs3Rows, exprs3Selection.r()).r()

    const sourceTxt3 = ui.x.state(null, "")
    ui.x.process(null, [sourceTxt3], () => {
        sourceTxt3.w().write(current3Source.read()?.source ?? "")
    })

    // TODO Make the highlight respond to both expr and decl changes.
    // TODO   When the decl is changed, the whole decl should be highlighted.
    const highlight3 = ui.x.compute<null | [number, number]>(null, null, () => {
        let current = current3Expr.read()
        if (current3Decl.fresh()) {
            const decl = current3Decl.read()
            if (decl !== null && decl.exprs.length !== 0) {
                const first = decl.exprs.at(0)!
                const last = decl.exprs.at(-1)!
                if (first.loc === undefined || last.loc === undefined) {
                    return null
                }
                return [first.loc.begin.pos, last.loc.end.pos]
            }
        }
        if (current === null) return null
        let expr = current
        if (expr.loc === undefined) {
            return null
        }
        return [expr.loc.begin.pos, expr.loc.end.pos]
    })

    panel.addPane("source3", ui.tableView(source3Headings, source3RowLabels, source3Selection, {}))
    panel.addPane("decls3", ui.tableView(decls3Headings, decls3RowLabels, decls3Selection, {}))

    // ui.process(null, [current3Addr], () => {
    ui.x.process(null, [currentAddr], () => {
        const decl = current3Decl.read()
        if (decl === null) {
            return
        }
        currentAddr.write(decl.addr)
    })
    panel.addPane("exprs3", ui.tableView(exprs3Headings, exprs3RowLabels, exprs3Selection, {
        clicked(row, col, pos) {
            const expr = current3Expr.read() as ExprTypeGraph | null
            if (expr === null) {
                return
            }
            let addr: Addr | null = null
            switch (col) {
                case 0:
                case 1:
                case 2:
                case 3:
                    addr = expr.tm ?? null
                    break
                case 4:
                    addr = expr.synTy ?? null
                    break
                case 5:
                    addr = expr.ctxTy ?? null
                    break
                case 6:
                    addr = expr.rc ?? null
                    break
                default:
                    addr = null
            }
            currentAddr.write(addr)
        },
    }))
    panel.addPane("contents3", ui.editorView(sourceTxt3.rw(), highlight3.r()))

    return {
        view: panel,
        currentSource: current3Source,
        currentDecl: current3Decl,
        currentExpr: current3Expr,
    }
}


//#endregion



//#region Types (tree)



function mkTypesTab_tree<U>(
    ui: Ui<U>,
    tabbedView: TabbedView<U>,
    exprSig0: PortR<ExprTypeBidir | null>
): PanelView<U> {

    const exprSig = ui.x.compute(null, null, () => {
        const expr = exprSig0.read()
        if (expr === null || expr.ty1 === undefined || expr.ty2 === undefined) {
            return null
        }
        return expr
    }).r()


    let summaryGraph = ui.x.compute<Map<TIMemoKey, TIMemoEntry> | null>(null, null, () => {
        let expr = exprSig.read()
        if (expr !== null && expr.ty2 !== null) {
            // TODO need to know if this "expr" is an actual expression, or a pattern
            // for expressions (+ve location) use { Syn \ Ctx }, 
            // for patterns (-ve location) use { Ctx \ Syn } (the actual type must be at least as accepting as the expected type)
            let rc = typeRelComp0(expr.ty1, expr.ty2)
            let summaryGraph = tiSummaryGraph(globalTIMemo, rc)
            return summaryGraph
        }
        else {
            return null
        }
    })

    let summaryRowData = ui.x.compute<[TIMemoEntry, [string, TIExpr]][]>(null, [], () => {
        let expr = exprSig.read()
        let rows: [TIMemoEntry, [string, TIExpr]][] = []
        if (expr !== null && expr.ty2 !== null) {
            let graph = summaryGraph.r().read()
            if (graph !== null) {
                for (let [k, entry] of graph) {
                    if (entry.exprs !== null) {
                        for (let [ruleName, e] of entry.exprs) {
                            rows.push([entry, [ruleName, e]])
                        }
                    }
                }
            }
        }
        return rows
    })

    let summaryRowLabels = ui.x.compute<string[]>(null, [], () => {
        let rowData = summaryRowData.r().read()
        let labels = rowData.map(([entry, [ruleName, tiExpr]]) => {
            return `${entry.typeNum} -> ${tiSymbol(entry.value)}: ${ruleName} ${showTIExpr(globalTIMemo, tiExpr)} `
        })
        return labels
    })

    let summarySelection: NodeState<number | null> = ui.x.state("typeTab_tree", null)

    const prettyFerrumStyleNums = ui.styles(prettyFerrumStyleDefns)

    const errorsTxt = ui.x.compute(null, "", () => "")
    const termTxt = ui.x.compute(null, "", () => nullish(exprSig.read(), "", (e => prettyFerrum(e))))
    // const synTxt = ui.x.compute(null, "", () => nullish(exprSig.read(), "", (e => types.showType2(e.ty1))))
    // const ctxTxt = ui.x.compute(null, "", () => nullish(exprSig.read(), "", (e => types.showType2(e.ty1))))
    const synTxt = ui.x.compute(null, "", () => nullish(exprSig.read(), "", (e => showType4(e.ty1, 80, 4))))
    const ctxTxt = ui.x.compute(null, "", () => nullish(exprSig.read(), "", (e => e.ty2 ? showType4(e.ty2!, 80, 4) : "-")))

    const inhabTxt = ui.x.compute(null, "", () => {
        let expr = exprSig.read()
        let tiText: string[] = []
        if (expr !== null && expr.ty2 !== null) {
            // TODO need to know if this "expr" is an actual expression, or a pattern
            // for expressions (+ve location)
            let rc = typeRelComp0(expr.ty1, expr.ty2)
            // for patterns (-ve location)
            // let rc = types.typeRelComp0(expr.ty2, expr.ty1)
            let log = (line: string) => {
                tiText.push(line)
            }
            tiShowCause(globalTIMemo, rc, log)
        }
        return tiText.join("\n")
    })

    const typeTxt = ui.x.compute(null, "", () => nullish(exprSig.read(), "", (e => {
        let selection = summarySelection.r().read()
        let rows = summaryRowData.r().read()
        let graph = summaryGraph.r().read()
        let text = ""
        if (selection !== null && graph !== null && selection < rows.length) {
            let [entry, [ruleName, tiExpr]] = rows[selection]
            let ty = getTypeMemoData().getData(entry.typeName) as Type
            text = showType4(ty, 80, 4)
        }
        return text
    })))

    let panel = addTab(ui, tabbedView, "Types (Tree)", ui.panelView("TypesTab_tree"), false)
    panel.addPane("Errors2", ui.textView(errorsTxt.r()))
    panel.addPane("Term2", ui.textView(termTxt.r()))
    panel.addPane("Syn2", ui.textView(synTxt.r()))
    panel.addPane("Ctx2", ui.textView(ctxTxt.r()))
    panel.addPane("Inhab2", ui.textView(inhabTxt.r()))
    panel.addPane("SummaryGraph", ui.listView(summaryRowLabels.r(), summarySelection.rw(), {}))
    panel.addPane("Type", ui.textView(typeTxt.r()))

    return panel
}

//#endregion



//#region Types (graph)



function mkTypesTab_graph<U>(
    ui: Ui<U>,
    tabbedView: TabbedView<U>,
    exprState: PortR<ExprTypeBidir | null>, reductionSig: PortR<null>, graphSig: PortR<Graph>,
    currentAddr: PortW<Addr>
): PanelView<U> {

    const summaryGraph = ui.x.compute<Map<TiMemoKey, TiMemoEntry> | null>(null, null, () => {
        const expr = exprTypeGraph.r().read()
        if (expr === null) {
            return null
        }

        const g = graphSig.read()
        // console.log(`All Cause (${showLoc(expr)}:`)
        // cr.ti.tiShowCause(rc, console.log)

        const result = g.ti.tiSummaryGraph(expr.rc)
        return result
    })

    const summaryRowData = ui.x.compute<[TiMemoEntry, [string, TiExpr]][]>(null, [], () => {
        const expr = exprTypeGraph.r().read()
        if (expr === null) {
            return []
        }
        const rows: [TiMemoEntry, [string, TiExpr]][] = []
        const graph = summaryGraph.r().read()
        if (graph !== null) {
            for (const [k, entry] of graph) {
                if (entry.exprs !== null) {
                    if (entry.exprs.length === 0) {
                        // Make sure there's a least one summary row for each entry.
                        // If no rule matched it's still best to show something rather than nothing.
                        // This makes it possible see the type that didn't match any rules in the IDE.
                        rows.push([entry, ["", tieUnknown]])
                    }
                    else {
                        for (const [ruleName, e] of entry.exprs) {
                            rows.push([entry, [ruleName, e]])
                        }
                    }
                }
            }
        }
        return rows
    })

    let summaryRowLabels = ui.x.compute<string[]>(null, [], () => {
        let rowData = summaryRowData.r().read()
        const g = graphSig.read()
        let labels = rowData.map(([entry, [ruleName, tiExpr]]) => {
            const key = entry.ty
            const key2 = g.heap.directAddrOf(key)
            return `${key2} -> ${tiSymbol(entry.value)}: ${ruleName} ${g.ti.showTiExpr(tiExpr)} `
        })
        return labels
    })

    const tiEntryStyleNums = ui.styles(tiEntryStyleDefns, "TiEntry")

    const summaryTableHeadings = ui.x.state(null, ["Addr", "TiVal", "Rule", "TiExpr"])
    const summaryTableRows = ui.x.compute<UiText[][]>(null, [], () => {
        const rowData = summaryRowData.r().read()
        const g = graphSig.read()
        const labels = rowData.map(([entry, [ruleName, tiExpr]]) => {
            const key = entry.ty
            const key2 = g.heap.directAddrOf(key)
            // return [`${key2}`, types.tiSymbol(entry.value), ruleName, g.ti.showTiExpr(tiExpr)]
            const s = tiEntryStyleNums
            const val = g.ti.tiEvalExpr(tiExpr)[0]
            return [
                showTi_addr(s, entry.value, key2),
                showTi_value(s, val),
                showTi_ruleName(s, val, ruleName),
                showTi_expr(g.heap, g.tim.tim, s, tiExpr),
            ]
        })
        return labels
    })

    const summarySelection: NodeState<number | null> = ui.x.state("typeTab_graph", null)

    const selectedSummaryTi = computeListAt(ui, summaryRowData.r(), summarySelection.r())

    const exprTypeGraph = ui.x.compute(null, null as ExprTypeGraph | null, () => {
        reductionSig.read()
        let expr = exprState.read() as ExprTypeGraph | null

        // if (expr === null || expr.tm === undefined || expr.torp === undefined || expr.synTy === undefined || expr.ctxTy === undefined) {
        //     return null
        // }
        if (expr === null || expr.torp === undefined || expr.synTy === undefined || expr.ctxTy === undefined) {
            return null
        }

        return expr
    })

    const prettyFerrumStyleNums = ui.styles(prettyFerrumStyleDefns)

    const errorsTxt = ui.x.compute(null, "", () => "")
    const termTxt = ui.x.compute(null, "", () => nullish(exprTypeGraph.r().read(), "", (e => prettyFerrum(e))))
    const synTxt = ui.x.compute(null, "", () => {
        const g = graphSig.read()
        return nullish(exprTypeGraph.r().read(), "", (e => prettyFerrum2(readback(g.heap, new Map, new Map, "Term", e.synTy))))
    })
    const ctxTxt = ui.x.compute(null, "", () => {
        const g = graphSig.read()
        return nullish(exprTypeGraph.r().read(), "", (e => prettyFerrum2(readback(g.heap, new Map, new Map, "Term", e.ctxTy))))
    })

    const inhabTxt = ui.x.compute(null, "", () => {
        let expr = exprTypeGraph.r().read()
        if (expr === null) return ""
        let tiText: string[] = []
        const g = graphSig.read()
        let log = (line: string): unit => {
            tiText.push(line)
        }
        g.ti.tiShowCause(expr.rc, log)
        return tiText.join("\n")
    })

    const typeTxt = ui.x.compute(null, "", () => nullish(exprState.read(), "", (e => {
        reductionSig.read()
        let selection = summarySelection.r().read()
        let rows = summaryRowData.r().read()
        let graph = summaryGraph.r().read()
        let text = ""
        if (selection !== null && graph !== null && selection < rows.length) {
            let [entry, [ruleName, tiExpr]] = rows[selection]
            // let ty = types.getTypeMemoData().getData(entry.typeName) as types.Type
            // text = types.showType4(ty, 80, 4)
            const rbLetVars: RbLetEnv = new Map
            const rbLamVars: RbLamEnv = new Map
            const g = graphSig.read()
            const tyExp = readback(g.heap, rbLetVars, rbLamVars, "Term", entry.ty)
            text = prettyFerrum2(tyExp)
        }
        return text
    })))

    let panel = addTab(ui, tabbedView, "Types (Graph)", ui.panelView("TypesTab_graph"), false)
    panel.addPane("Errors2", ui.textView(errorsTxt.r()))
    panel.addPane("Term2", ui.textView(termTxt.r()))
    panel.addPane("Syn2", ui.textView(synTxt.r()))
    panel.addPane("Ctx2", ui.textView(ctxTxt.r()))
    panel.addPane("Inhab2", ui.textView(inhabTxt.r()))
    panel.addPane("SummaryGraph2", ui.listView(summaryRowLabels.r(), summarySelection.rw(), {}))
    panel.addPane("SummaryGraph3", ui.tableView(summaryTableHeadings.r(), summaryTableRows.r(), summarySelection.rw(), {
        clicked(row, col, pos) {
            const selected = selectedSummaryTi.r().read()
            if (selected !== null) {
                const [tiEntry, [ruleName, tiExpr]] = selected
                currentAddr.write(tiEntry.ty)
            }
        },
    }))
    panel.addPane("Type2", ui.textView(typeTxt.r()))

    return panel
}

//#endregion



//#region Heap

type HeapTab<U> = {
    panel: PanelView<U>
    heapRowAddr: PortR<Addr | null>
}

function mkHeapTab<U>(
    ui: Ui<U>,
    tabbedView: TabbedView<U>,
    testDefn: PortR<TestDefn | null>, reductionSig: PortR<null>,
    currentDecl: PortR<DeclEntry4 | null>, currentAddr: PortR<Addr | null>,
    graphSig: PortR<Graph>
): HeapTab<U> {

    const heapStyles = ui.styles(heapStyleDefns)

    let panel = addTab(ui, tabbedView, "Heap", ui.panelView("HeapTab"), false)


    /// -- Heap (Table) --

    const unreducedSig = ui.x.state<Set<Addr>>(null, new Set)


    // TODO improve the table content so as to help navigate type-errors
    // const heapDeclTableHdrs = ["Addr", "Ind", "Depth", "Type", "Form", "KI", "Value"]
    const heapDeclTableHdrs = ["Addr", "Ind", "Depth", "Type", "Target", "Form", "Value"]
    const heapDispInfo = ui.x.compute<HeapShowInfo[]>("heapDispInfo", [], () => {
        reductionSig.read()

        const addr = currentAddr.read()
        if (addr === null) {
            return []
        }

        const g = graphSig.read()
        const unreduced = unreducedSig.r().read()
        const info = collectHeapDisplayInfo(g.heap, [addr], unreduced, heapStyles, false)
        // const info = collectHeapDisplayInfo(g.heap2, [addr], unreduced, heapStyles, true)
        return info
    })
    let heapDeclRowSelectedTable: NodeState<number | null> = ui.x.state("heapDeclRowSelectedTable", null)
    const heapDeclTableHeadings = ui.x.state(null, heapDeclTableHdrs)

    const heapDeclContentsTable = ui.x.compute<UiText[][]>(null, [], () => {
        const info = heapDispInfo.r().read()
        // return info.map(i => [i.addrTxt, i.indirect, i.depth, i.tyAddr, i.form, i.ki, i.disp])
        return info.map(i => [i.addrTxt, i.indirect, i.depth, i.tyAddr, i.targetForm, i.form, i.disp])
    })

    const heapRowAddr = ui.x.state<Addr | null>(null, null)
    ui.x.process(null, [heapRowAddr], (): unit => {
        const rowNum = heapDeclRowSelectedTable.r().read()
        const info = heapDispInfo.r().read()
        if (rowNum === null || rowNum >= info.length) {
            return
        }
        heapRowAddr.w().write(info[rowNum].addr)
    })

    const heapRowAddr2 =
        computeFwd(ui, null,
            computeListAt(ui, heapDispInfo.r(), heapDeclRowSelectedTable.r()).r(),
            rowInfo => rowInfo?.addr ?? null
        )

    /// -- Heap (All) --
    const heapContentsAll = ui.x.compute<string[]>(null, [], () => {
        reductionSig.read()
        // const dl = declsList.r().read()
        const g = graphSig.read()
        const lines = showGraph(g.heap, null, true)
        return lines
    })
    let heapRowSelectedAll: NodeState<number | null> = ui.x.state("heapRowSelectedAll", null)

    /// -- Heap (Table) --
    // TODO improve the table content so as to help navigate type-errors
    // const heapTableHdrs = ["Addr", "Ind", "Depth", "Type", "Form", "KI", "Value"]
    const heapTableHdrs = ["Addr", "Ind", "Depth", "Type", "Target", "Form", "Value"]
    const heapContentsTable = ui.x.compute<UiText[][]>(null, [], () => {
        reductionSig.read()
        // const dl = declsList.r().read()
        // const lines = showGraph(cr.heap2, null, true)
        // return lines.map((line, idx) => [`${idx}`, line])
        const g = graphSig.read()
        const unreduced = new Set<Addr>
        const info = collectHeapDisplayInfo(g.heap, null, unreduced, heapStyles, true)
        // return info.map(i => [i.addrTxt, i.indirect, i.depth, i.tyAddr, i.form, i.ki, i.disp])
        return info.map(i => [i.addrTxt, i.indirect, i.depth, i.tyAddr, i.targetForm, i.form, i.disp])
    })
    let heapRowSelectedTable: NodeState<number | null> = ui.x.state("heapRowSelectedTable", null)
    const heapTableHeadings = ui.x.state(null, heapTableHdrs)




    // let heapDecls = panel.addPane("decls", ui.createListView(declsLabels.r(), heapDeclSelected.rw(), {}))
    // let heapEntries = panel.addPane("contents (decl)", ui.createListView(heapContents.r(), heapRowSelected.rw(), {}))
    let heapDeclEntriesTable = panel.addPane(
        "contents (decl table)",
        ui.tableView(heapDeclTableHeadings.r(), heapDeclContentsTable.r(), heapDeclRowSelectedTable.rw(), {
            clicked(row, col, pos) {
                switch (col) {
                    case 1: { // Indirection column
                        const info = heapDispInfo.r().read()
                        const addr = info[row]?.addr ?? null
                        if (addr !== null) {
                            const unreduced = unreducedSig.r().read()
                            if (unreduced.has(addr)) {
                                unreduced.delete(addr)
                            }
                            else {
                                unreduced.add(addr)
                            }
                            unreducedSig.w().write(unreduced)
                        }
                        break
                    }
                    case 4: { // Form column
                        const info = heapDispInfo.r().read()
                        const addr = info[row]?.addr ?? null
                        const g = graphSig.read()
                        const addr1 = g.heap.directAddrOf(addr)
                        g.heap.setForm(addr1, formNone)
                        // TODO clearing the form won't work alone, the node might not be reached
                        // TODO add the node to the list of nodes to reduce
                        // evalAddrsSig.w().write([addr])

                        break
                    }
                    default:
                    // ignore
                }
            }
        })
    )
    // // let heapEntriesAll = panel.addPane("contents (all)", ui.createListView(heapContentsAll.r(), heapRowSelectedAll.rw(), {}))
    // let heapEntriesTable = panel.addPane(
    //     "contents (table)",
    //     ui.createTableView(heapTableHeadings.r(), heapContentsTable.r(), heapRowSelectedTable.rw(), {})
    // )


    /// -- Readback --

    const prettyFerrumStyleNums = ui.styles(prettyFerrumStyleDefns)

    let heapReadbackExpr = ui.x.compute<ExprAddr | null>(null, null, () => {
        const de = currentDecl.read()
        if (de === null || de.addr === null) {
            return null
        }
        reductionSig.read()
        const rbLetVars: RbLetEnv = new Map
        const rbLamVars: RbLamEnv = new Map
        const g = graphSig.read()

        const addr = currentAddr.read()
        if (addr === null) {
            return null
        }

        const unreduced = unreducedSig.r().read()
        const expr = readback0(g.heap, rbLetVars, rbLamVars, unreduced, "Term", addr)

        return expr
    })

    const rbAstHeadings = ui.x.compute<string[]>(null, [], () => ["Expr", "Addr"]).r()
    const rbAstRowExprs = ui.x.compute<ExprAddr[]>(null, [], () => {
        const expr = heapReadbackExpr.r().read()
        if (expr === null) {
            return []
        }
        const rows: ExprAddr[] = [expr]
        visitChildren(expr, function visitor(field, exp) {
            rows.push(exp)
            visitChildren(exp, visitor)
        })
        return rows
    }).r()

    const rbAstRows = ui.x.compute<UiText[][]>(null, [], () => {
        const rowExprs = rbAstRowExprs.read()
        const rows: UiText[][] = []
        for (const exp of rowExprs) {
            let [tag, attrNames, children] = exprParts(exp)
            let attrValues = attrNames.map((f => ` ${f}=${JSON.stringify((exp as any)[f]).slice(0, 20)}`)).join("")
            const label = uiText(heapStyles.regular, `${tag} ${attrValues}`)
            const addr = uiText(null, `${exp.addr}`)
            rows.push([label, addr])
        }
        return rows
    }).r()

    const rbAstSelection = ui.x.state<number | null>(null, null)

    ui.x.process(null, [heapRowAddr], (): unit => {
        const rowNum = rbAstSelection.r().read()
        const info = rbAstRowExprs.read()
        if (rowNum === null || rowNum >= info.length) {
            return
        }
        heapRowAddr.w().write(info[rowNum].addr)
    })

    panel.addPane("readback (Ast)", ui.tableView(rbAstHeadings, rbAstRows, rbAstSelection.rw(), {}))


    let heapReadback = ui.x.compute<UiText<number>>(null, uiText(null, ""), () => {
        const expr = heapReadbackExpr.r().read()
        if (expr === null) {
            return uiText(null, "")
        }

        const selectedAddrs = new Set<Addr>
        const rowAddr = heapRowAddr.r().read()
        if (rowAddr !== null) {
            selectedAddrs.add(rowAddr)
        }

        const idExprMap: Map<number, ExprDoc> = new Map
        const exprIdMap: Map<ExprDoc, number> = new Map

        const pf = mkPrettyFerrum(40, 40, prettyFerrumStyleNums, selectedAddrs)
        // const pf = mkPrettyFerrum2(40, 40, prettyFerrumStyleNums, idExprMap, exprIdMap)


        const exprD = pf.pExpr(expr)
        const exprStr = pShow(prettyFerrumStyleNums.std, exprD.doc)
        return exprStr

    })

    panel.addPane("readback (pretty)", ui.textView(heapReadback.r()))

    let heapReadback2 = ui.x.compute<UiText<number>>(null, uiText(null, ""), () => {
        const expr = heapReadbackExpr.r().read()
        if (expr === null) {
            return uiText(null, "")
        }

        const rowAddr = heapRowAddr.r().read()
        // const selectedAddrs = new Set<Addr>
        // if (rowAddr !== null) {
        //     selectedAddrs.add(rowAddr)
        // }

        const idExprMap: Map<number, ExprDoc> = new Map
        const exprIdMap: Map<ExprDoc, number> = new Map
        const addrIdsMap: Map<Addr, number[]> = new Map
        const idTextMap: Map<number, UiText<number>> = new Map

        const pf = mkPrettyFerrum2(40, 40, prettyFerrumStyleNums, idExprMap, exprIdMap, addrIdsMap)
        const exprD = pf.pExpr(expr)
        const exprStr = p2Show2(prettyFerrumStyleNums.std, exprD.doc, idTextMap)

        if (rowAddr !== null) {
            const highlightIds = addrIdsMap.get(rowAddr) ?? []
            for (const id of highlightIds) {
                const text = idTextMap.get(id)
                if (text !== undefined && typeof text !== "string") {
                    text.style = prettyFerrumStyleNums.selected
                }
            }
        }

        return exprStr
    })

    panel.addPane("readback (pretty2)", ui.textView(heapReadback2.r()))

    return { panel, heapRowAddr: heapRowAddr.r() }
}

//#endregion



//#region Reduction



function mkReductionTab<U>(
    ui: Ui<U>,
    tabbedView: TabbedView<U>,
    runControlSig: PortRw<boolean>,
    stepControlSig: PortRw<boolean>,
    reductionCount: PortR<number>,
): PanelView<U> {
    const name = "Reduction"

    const s = ui.styles({
        sts: {},
        btn: { weight: 1 }
    }, "reduction_regular")

    let panel = addTab(ui, tabbedView, "Reduction", ui.panelView(`ReductionTab_${name}`), false)

    const statusAnnotTxt = ui.x.compute<UiText<string>>("RunControlText2", "", () => {
        let stepSize = 1
        const textA: UiText<string> = uiTextList(
            uiText(s.sts, "\n"),
            uiText(s.sts, `Reduction Count: ${reductionCount.read()}\n`),
            uiText(s.sts, "\n"),
            uiText(s.sts, `Status: ${runControlSig.read() ? "Running" : "Stopped"}\n`),
            uiText(s.sts, "\n"),
            uiText(s.btn, `  [Step Size    1] ${stepSize === 1 ? "Selected" : ""}\n`),
            uiText(s.btn, `  [Step Size   10] ${stepSize === 10 ? "Selected" : ""}\n`),
            uiText(s.btn, `  [Step Size  100] ${stepSize === 100 ? "Selected" : ""}\n`),
            uiText(s.btn, `  [Step Size 1000] ${stepSize === 1000 ? "Selected" : ""}\n`),
            uiText(s.sts, "\n"),
            uiTextA(s.btn, "  [Step]\n", "step"),
            uiTextA(s.btn, "  [Start]\n", "start"),
            uiTextA(s.btn, "  [Stop]\n", "stop"),
        )
        return textA
    })

    const statusPane = panel.addPane("status2", ui.textView(statusAnnotTxt.r()))
    statusPane.callback({
        click(annot) {
            const textA = statusAnnotTxt.r().read()
            switch (annot) {
                case null:
                    // An unknown something was clicked,
                    //   not sure we even want to receive such a message.
                    break
                case "step":
                    stepControlSig.write(true)
                    break
                case "start":
                    runControlSig.write(true);
                    stepControlSig.write(true)
                    break
                case "stop":
                    runControlSig.write(false);
                    stepControlSig.write(false)
                    break
                default:
                    assert.impossible("missing case")
            }
        },
    })

    return panel
}

//#endregion



//#region App




// TODO ?
// export function webideApp<U>(ui: Ui<U>, args: string[], update: Output<null>) {

export const ideApp: App = {
    mk: ideApp_mk
}

function ideApp_mk<U>(ui: Ui<U>, viewCtx: ViewCtx, args: string[], appIo: AppIo): undefined {

    // TODO Accept a viewCtx from called,
    // TODO   (or return a function which accepts a viewCtx)
    // const viewCtx = null as any as ViewCtx

    let ferrumDir0: string | null = null

    // let cmdLine = cl.parseCmdLine(args, false)
    // for (const [name, value] of cmdLine.command_options) {
    //     switch (name) {
    //         case "ferrumDir":
    //             ferrumDir0 = value
    //             break
    //         default:
    //             throw new Error(`Unknown command line option (${name})`)
    //     }
    // }
    // if (ferrumDir0 === null) {
    //     throw new Error(`A value for --ferrumDir is required`)
    // }
    // let ferrumDir: string = ferrumDir0

    // TODO Shift the command line handling and usage reporting to webide-run.ts.
    // TODO This part of the code no longer knows anything about the web.
    if (args.length !== 1) {
        throw new Error("Usage: webide <test-filename>")
    }
    let testFileName = args[0]

    const testFileUrl = getIo().vfs_resolve(null, testFileName)

    let funcMemoFilename = "memo-data.tmp"
    let memo = getTypeMemoData()
    memo.loadFromFile(funcMemoFilename)

    const currentAddr = ui.x.state<Addr | null>(null, null)

    const codeRunnerName = "8"
    // const codeRunnerName = "TY"
    // const codeRunnerName = "GR"

    // const initFuel = 10
    const initFuel = 1_000
    // const initFuel = 1_000_000
    const fuel = fuelMk(initFuel)

    function monitorFn(addr: Addr): undefined {
        fuel.use()
    }

    const monitorCb: GraphMonitor = {
        graphReduction: monitorFn,
        tiExpansion: monitorFn,
        tiReduction: monitorFn,
    }

    const emptyCt = mkCodeTable({ monitor: monitorCb })

    const tabbedView = ui.tabbedView("IDE")(viewCtx)

    const {
        testDefn: testDefnSelectedState,
        testResults,
    } = mkTestDefnsTab4(ui, tabbedView, appIo, testFileUrl, codeRunnerName, currentAddr.w(), fuel, emptyCt)

    const testResultSig = ui.x.compute(null, null, () => {
        const selection = testDefnSelectedState.read()
        if (selection === null) {
            return null
        }
        const tr = testResults.read().get(selection)
        return tr ?? null
    })


    const graphSig = ui.x.compute<Graph>("graphSig", emptyCt.graph(), () => {
        const tr = testResultSig.r().read()
        if (tr === null) {
            return emptyCt.graph()
        }
        return tr.ct.graph()
    })


    const projectState4 = ui.x.compute<Project | null>(null, null, () => {
        const tr = testResultSig.r().read()
        return tr?.project ?? null
    })


    mkProjectTab(ui, tabbedView, projectState4.r())
    // const exprSelection: SignalState<number | null> = ui.x.state("exprSelection", null)
    // const sourceSelection: SignalState<number | null> = ui.x.state("sourceSelection", null)
    // const exprSelection2: SignalState<number | null> = ui.x.state("exprSelection2", null)
    // const exprSelected: SignalState<ExprTypeBidir | null> = ui.x.state("exprSelected", null)


    const runControl = ui.x.state("runControl", false)
    const stepControl = ui.x.state(null, false)
    const reductionCount = ui.x.state(null, 0)

    // const heapUpdate = ui.x.state(null, null)
    // const stepSize = ui.x.state("stepSize", 0)


    const reductionSig = ui.x.state("reductionSig", null)

    const sourceTab4 = mkSourceTab4(ui, tabbedView, testResultSig.r(), currentAddr.w())
    const sourceTab = sourceTab4

    let heapTab: HeapTab<U> | null = null

    mkTypesTab_tree(ui, tabbedView, sourceTab.currentExpr)

    if (USE_GRAPH_TYPES) {
        mkTypesTab_graph(ui, tabbedView, sourceTab.currentExpr, reductionSig.r(), graphSig.r(), currentAddr.w())
        heapTab = mkHeapTab(ui, tabbedView, testDefnSelectedState, reductionSig.r(), sourceTab.currentDecl, currentAddr.r(), graphSig.r())
        mkReductionTab(ui, tabbedView, runControl.rw(), stepControl.rw(), reductionCount.r())
    }


    mkBlankTab(ui, tabbedView, "one")
    mkBlankTab(ui, tabbedView, "two")
    mkBlankTab(ui, tabbedView, "three")


    return
}

//#endregion

