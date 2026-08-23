import * as url from "node:url"
import * as child_process from "node:child_process"
import * as process from "node:process"
import * as path from "node:path"
import * as fs from "node:fs";

// Utils
import { assert } from "../utils/assert.js"
import { parseCmdLine } from "../utils/cmdline.js";

//Io
import { setIo } from "../io/io.js";
import { mkIoNodeJs } from "../io/io-nodejs.js";

// Syntax
import * as token from "../syntax/token.js"
import * as scan from "../syntax/scan.js";
import * as expr from "../syntax/expr.js"
import * as project from "../syntax/project.js"

// Tree
import * as types from "../tree/types.js";

// Graph
import { CodeTable, mkCodeTable } from "../graph/code-table.js";

// Codegen
import * as codegen_c from "../codegen/codegen-c.js";
import { getTypeMemoData } from "../tree/types.js";


// import * as runtest from"./runtest.js";



function writeLine(strm: fs.WriteStream): (line: string) => void {
    return function (line: string) {
        strm.write(`${line}\n`)
    }
}

async function main() {
    setIo(mkIoNodeJs(url.pathToFileURL("/")))
    let args = process.argv.slice(2)
    // console.log(JSON.stringify(args))
    let cmdLine = parseCmdLine(args)
    // console.log(JSON.stringify(cmdLine))

    let proj: project.Project | null = null
    let ct: CodeTable = mkCodeTable({})

    let outputFilename: string | null = null
    let projectFilename: string | null = null

    for (const { name, value } of cmdLine.opts) {
        switch (name) {
            case 'project':
                if (value === null) {
                    throw new Error("missing project filename")
                }
                // projectFilename = value
                // proj = project.readProject(path.basename(projectFilename), run.mkReadFile(projectFilename))
                projectFilename = path.resolve(value)
                proj = await project.readProject(url.pathToFileURL(projectFilename))

                // type-check the declarations
                let funcMemoFilename = "memo-data.tmp"
                let memo = getTypeMemoData()
                memo.loadFromFile(funcMemoFilename)


                for (const part of proj.parts) {
                    switch (part.tag) {
                        case "text": {
                            const contents = proj.contents.get(part.filename)!
                            ct = ct.addText(part.name, part.name, part.filename, contents)
                            break
                        }
                        case "code":
                        case "source": {
                            const contents = proj.contents.get(part.filename)!
                            ct = ct.addCode(part.filename, part.filename, null, contents)
                            break
                        }
                        default:
                            assert.noMissingCases(part)
                    }
                }
                ct.typeCheckTr()

                memo.saveToFile()
                break
            case 'output-filename':
                if (value === null) {
                    throw new Error("missing output filename")
                }
                outputFilename = value
                break;
            default:
                throw new Error(`unknown option: ${name}`)
        }
    }

    if (cmdLine.args.length === 0) {
        throw new Error("Expected a command name")
    }

    const command_name = cmdLine.args[0]

    const subCmdLine = parseCmdLine(cmdLine.args.slice(1))

    switch (command_name) {

        case "compile-sync":
        case "compile-async": {
            if (subCmdLine.args.length !== 1) {
                throw new Error(`codegen: expected one arguments, got (${subCmdLine.args.length}) (${JSON.stringify(subCmdLine.args)})`)
            }
            if (proj === null) {
                throw new Error(`codegen: project required`)
            }
            if (outputFilename === null) {
                throw new Error(`codegen: outputFilename required`)
            }
            let mode = command_name === "compile-async" ? "Async" : "Sync"
            let outputFileC = `${outputFilename}.c`
            let outputFileExe = `${outputFilename}.exe`
            let mainFnName = subCmdLine.args[0];
            let mainFnAst = expr.eVar({ loc: token.nilLoc }, mainFnName)

            let cBuilder: codegen_c.CBuilder = codegen_c.primCb.clone()

            const declsTy = ct.allDecls()
            const env = ct.fullEnvT()

            codegen_c.codegen_c_stmts(cBuilder, declsTy, env)
            let mainFnTy = types.typeExprBidir(mainFnAst, types.anyT, env, true)
            let [stmtsC, mainFnC] = codegen_c.codegen_c_expr(cBuilder, mainFnTy)
            // let [globalDeclsC, initC] = [cBuilder.decls, cBuilder.init]
            codegen_c.codegen_reprs(cBuilder)
            let ioDo = mode === "Async" ? `ioDoAsyncProxy (${mainFnC})` : `any_call(ioDoPrimCurried, ${mainFnC})`
            let programCodeC =
                [``
                    , `#define SAFETY_CHECK_ERROR(a) (0)`
                    , `#define SAFETY_CHECK_OK(a) (1)`
                    , `#include "runtime.h"`
                    , ``
                    , `/*** Auxiliary Code Header ***/`
                    , ``
                    , `${cBuilder.declsAuxH.join("\n")}`
                    , ``
                    , `/*** Auxiliary Code Implementation ***/`
                    , ``
                    , `${cBuilder.declsAuxC.join("\n")}`
                    , ``
                    , `/*** Runtime ***/`
                    , `#include "runtime.c"`
                    , ``
                    , `/*** User Code ***/`
                    , ``
                    , `${cBuilder.declsUsr.join("\n")}`
                    , ``
                    , `/*** Main ***/`
                    , ``
                    , `int main (int argc, const char *argv[]) {`
                    , `    initPrimitives(argc, argv);`
                    , `    ${cBuilder.init.join("\n    ")}`
                    , `    ${stmtsC.join("\n    ")}`
                    , ``
                    // , `    call(p.ioDoPrim, ${mainFnC});`
                    // , `    ioDoAsyncProxy (${mainFnC});`
                    , `    ${ioDo};`
                    , ``
                    , `    printDiagnostics();`
                    , `    return 0;`
                    , `}`
                    , ``
                ].join("\n");
            let standaloneC = programCodeC
            fs.rmSync(`gen/${outputFileC}`, { force: true })
            fs.writeFileSync(`gen/${outputFileC}`, standaloneC)

            // All warnings are promoted to errors, 
            //   except the following, which are ignored.
            const ignore = [
                "trigraphs",
                "unused-variable",
                "unused-but-set-variable",
                "unused-label",
                "maybe-uninitialized", // this seems to be misfiring 
            ]

            try {
                let compiler_args = [
                    "gcc",
                    // "-g",
                    // "-rdynamic", // needed when using printBacktrace
                    // "-O3", // all optimization levels work
                    // "-O2",
                    "-O1", // this works, is faster to compile and doesn't run much slower
                    // "-pg",
                    // "-fsanitize=address", 
                    "-fno-omit-frame-pointer",
                    "-Wall", ...ignore.map(ig => `-Wno-${ig}`),
                    "-Werror",
                    `-o gen/${outputFileExe}`,
                    "-I ../c/runtime",
                    "-lgc",
                    "-lgccpp",
                    // "-lgctba",
                    "-lstdc++",
                    // "../../langs/c/runtime.c",
                    "../c/runtime/ordered-map.cc",
                    `gen/${outputFileC}`
                ]
                child_process.execSync(compiler_args.join(" "))
            } catch (exc) {
                throw new Error(`Code Compilation Failed ${exc}`)
            }

            break
        }

        default:
            throw new Error(`Unknown command: ${command_name}`)

    }


}

try {
    main()
}
catch (exc) {
    console.log(exc)
}
