import * as url from "node:url"
import path from "node:path"

import { CmdLine, cmdLine_schemaMatch, parseCmdLine } from "../utils/cmdline.js"

import { getIo, setIo } from "../io/io.js"
import { mkIoNodeJs } from "../io/io-nodejs.js"

import { addPrimitives } from "../runtime/runtime-core.js"
import { primitivesNodeJs } from "../runtime/runtime-nodejs.js"

import { main2, runTestCmdLineSchema } from "./runtest-cmd.js"

export async function main() {
    setIo(mkIoNodeJs(url.pathToFileURL("/")))
    addPrimitives(primitivesNodeJs)

    let stdout: any = process.stdout
    if (typeof stdout._handle !== "undefined" && stdout._handle) {
        stdout._handle.setBlocking(true)
    }

    let cmdLineArgs = process.argv.slice(2)
    // console.log(JSON.stringify(args))

    let cmdLine = parseCmdLine(cmdLineArgs)
    let args = cmdLine.args

    if (args.length !== 1 && args.length !== 2) {
        // TODO ? read in multiple files ?
        console.log(`Incorrect number of arguments, expected 1 or 2, got ${args.length}`)
        process.exit(1)
    }

    const filename = path.resolve(args[0])
    const fileUrl = url.pathToFileURL(filename)

    const testDir = path.resolve(path.dirname(filename))
    const testDirUlr = url.pathToFileURL(testDir + "/")

    const testName = args.at(1) ?? null

    const cmdLineValues = cmdLine_schemaMatch(runTestCmdLineSchema, cmdLine)

    if (!cmdLineValues.ok) {
        console.error("Command Line Error:\n  " + cmdLineValues.errorMsgs.join("\n  "))
        process.exit(1)
    }

    await main2(cmdLineValues.values, testDirUlr, fileUrl, testName)
}




if (process.argv[1] === new URL(import.meta.url).pathname) {
    main()
}


