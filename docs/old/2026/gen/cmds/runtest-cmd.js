//#region Imports
import { mkCmdLineSchema } from "../utils/cmdline.js";
import { readTestDefns } from "../syntax/test-defn.js";
import { getTypeMemoData } from "../tree/types.js";
import { graphMode_long, graphMode_short, isGraphMode, mkCodeTable } from "../graph/code-table.js";
// CodeGen
import { codeRunnerMakers } from "../codegen/code-runners.js";
//
import { mkOpts, runTest, showTestResultMnemonic, someTrueNoneFalse } from "../runtest/run-test.js";
//#endregion
//#region Main
export const memo = getTypeMemoData();
const codegens = ["8", "TY", "C", "NONE"];
export const runTestCmdLineSchema = mkCmdLineSchema((b) => ({
    // codegen:       /**/ b.str  /**/("codegen"),
    // codegen:       /**/ b.oneOf  /**/("codegen", ["8", "TY", "C", "NONE"] as const),
    codegen: /**/ b.oneOf /**/("codegen", codegens),
    showDecls: /**/ b.flag /**/("showDecls"),
    useGraphTypes: /**/ b.flag /**/("useGraphTypes"),
    showTypes: /**/ b.flag /**/("showTypes"),
    // graphMode:     /**/ b.str  /**/(["g", "graphMode"]),
    graphMode: /**/ b.oneOf /**/(["g", "graphMode"], [...graphMode_short, ...graphMode_long, "Direct", "InstRb"]),
}));
export async function main2(cmdLineValues, testDirUlr, fileUrl, testName) {
    let funcMemoFilename = "memo-data.tmp";
    memo.loadFromFile(funcMemoFilename);
    let opts = { mode: "Bypass" };
    // let opts: Opts = { mode: "TypesDecls" } // Intended default
    let mkCodeRunner;
    let codeRunnerName;
    let ferrumDir = null;
    const clv = cmdLineValues;
    if (clv.codegen !== undefined) {
        codeRunnerName = clv.codegen;
        opts.codegen = clv.codegen;
    }
    opts.showDecls = clv.showDecls;
    opts.useGraphTypes = clv.useGraphTypes;
    opts.showTypes = clv.showTypes;
    if (clv.graphMode !== undefined) {
        let mode = clv.graphMode;
        switch (mode) {
            case "Direct": // bypass the heap
                mode = "Bypass";
                break;
            case "InstRb": // instantiate and readback, use the read-back expression for codegen.
                mode = "Inst";
                break;
        }
        if (!isGraphMode(clv.graphMode)) {
            throw new Error(`Unknown graphMode value (${mode}).`);
        }
        opts.mode = clv.graphMode;
        if (mode.includes("T")) {
            opts.useGraphTypes = true;
        }
        if (mode.includes("D")) {
            opts.grDecls = true;
        }
        if (mode.includes("E")) {
            opts.grExpect = true;
        }
        if (mode === "I" || opts.grDecls || opts.grExpect) {
            opts.useHeap = true;
        }
    }
    codeRunnerName ??= "8";
    mkCodeRunner = codeRunnerMakers[codeRunnerName];
    let ok = false;
    try {
        ok = await main3(testDirUlr, fileUrl, testName, mkOpts(opts), codeRunnerName);
    }
    finally {
        memo.saveToFile();
        return ok;
    }
}
export async function main3(testDir, filename, testName, opts, codeRunnerName) {
    const initCt = mkCodeTable({});
    let testDefnList = await readTestDefns(filename);
    let testCount = 0;
    let testPasses = 0;
    let testResultsList = [];
    for (let td of testDefnList) {
        if (testName !== null && testName !== td.name) {
            continue;
        }
        console.log("-".repeat(20));
        console.log(`Running Test: ${td.name}`);
        let testResults = await runTest(initCt, td, opts, codeRunnerName, testDir);
        testResults.parts.forEach((trp, i) => {
            const ok = someTrueNoneFalse(trp.typeCheckT, trp.typeCheckG, trp.typeMatchT, trp.typeMatchG, trp.termMatchT, trp.termMatchG, trp.valueMatch, trp.noExceptionThrown) ?? false;
            if (ok) {
                testPasses += 1;
            }
            let td_name = td.name;
            if (testResults.parts.length > 1) {
                td_name = `${td.name}[${trp.partName}]`;
            }
            let annot = "";
            if (i == 0) {
                if (testResults.duration === null) {
                    annot = " null";
                }
                else {
                    annot = `${Math.floor(testResults.duration / 1000)}s`;
                }
            }
            testResultsList.push([td_name, trp, ok, annot]);
            testCount += 1;
        });
        console.log("-".repeat(20));
    }
    console.log();
    let maxNameLength = testResultsList.reduce((maxLen, [name]) => Math.max(name.length, maxLen), 10);
    let maxAnnotLength = testResultsList.reduce((maxLen, [, , , annot]) => Math.max(annot.length, maxLen), 1);
    testResultsList.forEach(([name, trp, ok, annot]) => {
        let trueMnemonic = showTestResultMnemonic(trp, true);
        let falseMnemonic = showTestResultMnemonic(trp, false);
        let name2 = name.padEnd(maxNameLength + 1);
        let annot2 = annot;
        if (annot !== "") {
            annot2 = `[ ${annot.padStart(maxAnnotLength)} ]`;
        }
        else {
            annot2 = " ".repeat(maxAnnotLength + 4);
        }
        switch (ok) {
            // case null:
            //     console.log(`--- Test SKIPPED ${name}`)
            //     break
            case true:
                console.log(`    PASS  ${annot2} ${name2} ${trueMnemonic} ${falseMnemonic}`);
                break;
            case false:
                console.log(`*** FAIL  ${annot2} ${name2} ${trueMnemonic} ${falseMnemonic}`);
                break;
            default:
                throw new Error(`Unknown result (${ok}).`);
        }
    });
    console.log();
    console.log(`Summary: ${testPasses} / ${testCount}`);
    console.log();
    const someRan = testCount !== 0;
    const allPassed = testPasses === testCount;
    if (!someRan) {
        console.log("***  NO TESTS RAN");
    }
    else if (allPassed) {
        console.log("     ALL TESTS PASSED");
    }
    else {
        console.log(`***  TEST FAILURES: ${testCount - testPasses}`);
    }
    return someRan && allPassed;
}
//#endregion
//# sourceMappingURL=runtest-cmd.js.map