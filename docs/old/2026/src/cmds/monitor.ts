import * as fs from 'node:fs';
import * as path from "node:path"
import * as url from "node:url"
import * as process from "node:process"
import * as tty from "node:tty"

import { assert } from "../utils/assert.js"
import * as cl from "../utils/cmdline.js"
import * as project from "../syntax/project.js"
import * as types from "../tree/types.js"
import * as eval1 from "../tree/eval.js"
import * as token from "../syntax/token.js"
import * as expr from "../syntax/expr.js"
import { debounceCallback } from '../utils/debounce.js';
import { CodeTable, mkCodeTable } from '../graph/code-table.js';
import { setIo } from '../io/io.js';
import { mkIoNodeJs } from '../io/io-nodejs.js';
import { getTypeMemoData, showType5 } from '../tree/types.js';


type WatchProjectState = {
    projFilename: string
    ct: CodeTable
    errorList: [string, string][]
    currentError: number
    write: (msg: string) => undefined


}

function mkWatchProjectState(
    projFilename: string,
    write: (msg: string) => undefined,
): WatchProjectState {
    return {
        projFilename,
        ct: mkCodeTable({}),
        errorList: [],
        currentError: 0,
        write,
    }
}

function showCurrentError(wsp: WatchProjectState) {
    if (wsp.currentError >= wsp.errorList.length) {
        console.log("No more errors")
        return
    }
    let [short, long] = wsp.errorList[wsp.currentError]
    console.log(`Error #${wsp.currentError + 1}`)
    console.log(long)
}
function listErrors(wsp: WatchProjectState) {
    wsp.errorList.forEach(([short, long], errNum) => {
        console.log(`#${errNum + 1} ${short}`)
    })
}
function showTopErrors(wsp: WatchProjectState) {
    if (wsp.errorList.length == 0) {
        return
    }
    let topErrors = wsp.errorList.slice(0, 10)
    console.log(`Errors 1-${topErrors.length} of ${wsp.errorList.length}`)
    topErrors.forEach(([short, long], errNum) => {
        console.log(`#${errNum + 1} ${short}`)
    })
}

function handleInput(wsp: WatchProjectState, keyBuf: Buffer<ArrayBufferLike>) {
    let key = keyBuf.toString()
    let keyData: number[] = []
    for (let i = 0; i !== key.length; ++i) {
        keyData.push(key.charCodeAt(i))
    }

    switch (key) {
        case "\x03":
            process.exit();
        case "1":
            wsp.currentError = 0
            showCurrentError(wsp)
            break
        case "n":
            wsp.currentError += 1
            showCurrentError(wsp)
            break
        case "s":
            showCurrentError(wsp)
            break
        case "l":
            listErrors(wsp)
            break
        case "r":
            refresh(wsp)
            break
        case "t":
            showTopErrors(wsp)
            break
        default:
            console.log("Unexpected Key Press")
            console.log(`  keyData: ${keyData}`);
            console.log(`  key: ${JSON.stringify(key)}`);
    }

}



const memo = getTypeMemoData()
// const typeDeclBidir2_memoized = memo.memoizeFunction("tdb", types.typeDeclBidir)

async function refresh(wsp: WatchProjectState) {

    // TODO Provide a TTY oriented implementation of UiText,
    // TODO   so as to keep these low-levels details contained.
    const vt = {
        red: "\x1B[31m",
        green: "\x1B[32m",
        attrReset: "\x1B[0m"
    }
    const errorRed = `${vt.red}Error${vt.attrReset}`

    try {
        wsp.errorList = []
        console.log("Project Loading Starting")
        let proj
        try {
            // proj = project.readProject(path.basename(projFilename), run.mkReadFile(projFilename))
            proj = await project.readProject(url.pathToFileURL(wsp.projFilename))
        } catch (exc) {
            let errMsg = `Project Loading ${errorRed}: \n    ${exc}`
            wsp.errorList.push([errMsg, errMsg])
            console.log(errMsg)
            return
        }
        console.log("Project Loading Finished")

        // for (let part of proj.parts) {
        //     console.log(`PROJECT: ${JSON.stringify(part)}`)
        // }

        // for (let decl of proj.decls) {
        //     let [pat, defn] = decl
        //     let patStr = showExpConcise(pat)
        //     console.log(`DECL: ${JSON.stringify(patStr)}`)
        // }

        // let envBidir: eval1.Env = { ...initEnv }
        // let declsTypedBidir: expr.DeclTypeBidir[] = []

        let maxWidths: { [field: string]: number } = {}
        let showStr = (field: string, value: string): string => {
            let width = value.length
            let maxWidth = maxWidths[field]
            if (maxWidth === undefined || maxWidth < width) {
                maxWidth = width
                maxWidths[field] = width
            }
            return value.padEnd(maxWidth)
        }
        let showInt = (field: string, value0: number): string => {
            let value = JSON.stringify(value0)
            let width = value.length
            let maxWidth = maxWidths[field]
            if (maxWidth === undefined || maxWidth < width) {
                maxWidth = width
                maxWidths[field] = width
            }
            return value.padStart(maxWidth)
        }
        let showLoc = (loc: token.Loc): string => {
            return `${showStr("file", loc.filename)} : (${showInt("sl", loc.begin.line)}, ${showInt("sc", loc.begin.col)})-(${showInt("el", loc.end.line)}, ${showInt("ec", loc.end.col)})}`
        }
        let showLoc2 = (loc: token.Loc): string => {
            // output click-able links
            // TODO Use the project path here, not this hard-coded path.
            let filepath = path.resolve("../../fe/" + loc.filename)
            return `${filepath}:${loc.begin.line}:${loc.begin.col}`
        }

        console.log("Type Checking Starting")

        let count = 0
        //     // stdout.write("\x1b7")
        wsp.write(`Type Checking #${count++}`)

        //     // stdout.write("\x1b8")
        //     // stdout.write("\x1b[K")
        
        let ct = mkCodeTable({})

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
                    ct.typeCheckTr({
                        pre_decl: (decl) => {
                            wsp.write("\r" + `Type Checking #${count++} ${showLoc(decl[0].loc)}`)
                        }
                    })
                    break
                }
                default:
                    assert.noMissingCases(part)
            }
        }

        console.log("")
        console.log("Type Checking Finished")
        console.log("")
        // memo.saveToFile()

        const errors = types.collectTypeErrors(ct.allDecls())
        for (const err of errors) {
            // console.log(`ERROR: (${err.tc}) ${token.showLoc(err.loc)}`)
            // console.log(`ERROR: ${showLoc(err.loc)}`)
            let locMsg = `${errorRed}: ${showLoc(err.loc)}    ${showLoc2(err.loc)}`
            let errMsg = [
                locMsg,
                `    Synthesized:`,
                showType5(err.ty1, 8, null, 120),
                `    Context:`,
                err.ty2 === null ? "NULL" : showType5(err.ty2, 8, null, 120),
            ].join("\n");
            // console.log(errMsg)
            wsp.errorList.push([locMsg, errMsg])
        }



        // listErrors()
        showTopErrors(wsp)

        if (errors.length === 0) {
            console.log(`${vt.green}No Errors${vt.attrReset}`)
        }
    }
    catch (exc) {
        let errMsg = `${errorRed}: Ignoring Exception: ${exc}`
        console.log(errMsg)
        wsp.errorList.push([errMsg, errMsg])
    }

}


function main() {
    setIo(mkIoNodeJs(url.pathToFileURL("/")))
    let cmdLineArgs = process.argv.slice(2)
    // console.log(JSON.stringify(args))

    let cmdLine = cl.parseCmdLine(cmdLineArgs)
    let args = cmdLine.args
    let opts = cmdLine.opts

    if (args.length !== 1) {
        console.log(`Incorrect number of arguments, expected 1, got ${args.length}`)
        process.exit(1)
    }
    const projFilename = args[0]


    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }

    // stdout.write is used instead of console.log, so that the output can be overwritten / updated in-place.
    // Writes to stdout can go missing in VSCode,
    //   unless {"outputCapture": "std"} or {"console": "integratedTerminal"} is used in the launch config

    const write = process.stdout.isTTY
        ? (msg: string): undefined => { process.stdout.write(msg) }
        : (msg: string): undefined => { console.log(msg) }

    const wsp = mkWatchProjectState(projFilename, write)

    let funcMemoFilename = "memo-data.tmp"
    console.log("Memo Loading Starting")
    memo.loadFromFile(funcMemoFilename)
    console.log("Memo Loading Finished")

    process.stdin.on('data', (keyBuf) => {
        handleInput(wsp, keyBuf)
    })

    const dir = path.dirname(projFilename)
    fs.watch(dir, { recursive: true }, debounceCallback(10, () => {
        refresh(wsp)
    }));

    refresh(wsp)
}


if (process.argv[1] === new URL(import.meta.url).pathname) {
    main()
}

