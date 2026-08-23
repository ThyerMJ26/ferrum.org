
import * as fs from "node:fs"
import * as fsp from "node:fs/promises"
import * as http from "node:http"

import { assert } from "../utils/assert.js"
import { JsData, FeData, feData_fromJson, feData_toJson, showValueFerrum2, primitivesCore, runtimeUtils } from "../runtime/runtime-core.js"


let console_log = console.log
// let console_log = console.error

export function errorObjToData(err: any) {
    // TODO ? return a key-value list ?
    return JSON.stringify(err)
}


type IoId = number
type IoTag = string
type IoEntry = [IoTag, any]
type IoTable = Map<IoId, IoEntry>

export type ReqRespJs = [JsData, (_: JsData) => Promise<ReqRespJs>]
export type ReqRespFe = [FeData, [(_: FeData) => Promise<ReqRespFe>, null]]

export const adaptReqResp0 = (rrFe: ReqRespFe): ReqRespJs => {
    const [req, [kResp,]] = rrFe
    const rrJs: ReqRespJs =
        [feData_toJson(req),
        (resp: JsData) => new Promise(async (ok, fail) => ok(adaptReqResp0(await kResp(feData_fromJson(resp)))))]
    return rrJs
}

export const adaptReqResp = (rrFe: ReqRespFe): Promise<ReqRespJs> => {
    return new Promise((ok, fail) => ok(adaptReqResp0(rrFe)))
}

// TODO ?
type IoReqResp =
    | ["readFile"]

export let mkIoDoAsyncFe = (cmdLineArgs: string[]) => {
    const ioDo = mkIoDoAsyncJs(cmdLineArgs)

    let ioDoAsync = async (rrFe: ReqRespFe): Promise<void> => {
        const rrJs = adaptReqResp(rrFe)
        ioDo(rrJs)
    }
    return ioDoAsync
}

export let mkIoDoAsyncJs = (cmdLineArgs: string[]) => {

    let ioTable: IoTable = new Map
    let maxIoId = 16
    let nextIoId = 0

    let ioState = new Map()

    function showTable() {
        for (let [id, [tag, obj]] of ioTable.entries()) {
            console_log(`Io Id ${id} ${tag}`)
        }
    }

    function ioIdAlloc(tag: string, obj: any) {
        let ioId = nextIoId
        while (ioTable.has(ioId)) {
            ioId = (ioId === maxIoId ? 0 : ioId) + 1
            if (ioId === nextIoId) {
                throw new Error("all Io Ids are allocated")
            }
        }
        ioTable.set(ioId, [tag, obj])
        nextIoId = (ioId === maxIoId ? 0 : ioId) + 1
        showTable()
        return ioId
    }
    function ioIdGet(ioId: IoId, tag: IoTag) {
        let entry = ioTable.get(ioId)
        if (entry === undefined) {
            showTable()
            throw new Error(`invalid ioId ${ioId}`)
        }
        if (entry[0] !== tag) {
            showTable()
            throw new Error(`incorrect ioId tag (${entry[0]} != ${tag})`)
        }
        return entry[1]
    }
    function ioIdFree(ioId: IoId, tag: IoTag) {
        let entry = ioTable.get(ioId)
        if (entry === undefined) {
            showTable()
            throw new Error(`unallocated ioId (${ioId}), expected (${tag})`)
        }
        if (entry[0] !== tag) {
            showTable()
            throw new Error(`incorrect ioId (${ioId}) tag (${entry[0]} != ${tag})`)
        }
        ioTable.delete(ioId)
    }

    // Deno.addSignalListener("SIGINT", () => {
    //     console_log("\ninterrupted!\n");
    //     Deno.exit();
    // });
    process.on('SIGINT', function () {
        console_log("\nInterrupted!\n");
        process.exit();
    })

    // TODO add some form of error handling

    let ioDoAsync = async (rr: Promise<ReqRespJs>): Promise<void> => {
        // let [req, respK] = dataAdaptor.toJs(rr)
        let [request, respK] = await rr
        let req: any = request
        const [reqName,] = req
        console_log("IO Request", JSON.stringify(req).slice(0, 40))
        async function callK(resp: JsData) {
            console_log("IO Response", resp)
            // let respFe = dataAdaptor.fromJs(resp)
            return ioDoAsync(respK(resp))
        }
        switch (reqName) {
            case "readFile": {
                let [, filename] = req
                fsp.readFile(filename).then(async resp => {
                    // console_log(`IO Read ${req[1][0]} ${JSON.stringify(resp).slice(0, 80)}`)
                    console_log(`IO Read ${filename}`)
                    ioDoAsync(respK(resp.toString()))
                })
                return
            }
            case "readFile2": {
                let [, filename] = req
                fsp.readFile(filename).then(async contents => {
                    // console_log(`IO Read ${req[1][0]} ${JSON.stringify(resp).slice(0, 80)}`)
                    console_log(`IO Read ${filename}`)
                    let resp = ["Ok", contents.toString()]
                    ioDoAsync(respK(resp))
                }).catch(async err => {
                    let resp = ["Error", errorObjToData(err)]
                    ioDoAsync(respK(resp))
                })
                return
            }
            case "writeFile": {
                let [, filename, contents] = req
                fsp.writeFile(filename, contents).then(async () => {
                    // console_log(`IO Write ${filename} ${JSON.stringify(contents).slice(0, 80)}`)
                    console_log(`IO Write ${filename}`)
                    ioDoAsync(respK([]))
                })
                return
            }
            case "print": {
                let [, text] = req
                let text2 = "IO Print " + showValueFerrum2(text)
                process.stdout.write(text2 + "\n")
                //   console_log(`IO Print ${text2}`)
                ioDoAsync(respK([]))
                return
            }
            case "getArgs": {
                let resp = cmdLineArgs
                console_log(`IO GetArgs ${JSON.stringify(resp)}`)
                ioDoAsync(respK(resp))
                return
            }
            case "done":
            case "exit": {
                // console_log(`IO Exit ${JSON.stringify(req[1][0])}`)
                // let result = req[1][0]
                let [, result] = req
                console_log(`IO Exit ${JSON.stringify(result)}`)
                // TODO something with the result, perhaps call a continuation passed in to mkIoAsync
                throw new Error(`IO Exit (${result})`)
                // process.exit(result)
                return
            }
            case "httpServerCreate": {
                const serverObj = http.createServer()
                const serverNum = ioIdAlloc("server", serverObj)
                const resp = [serverNum]
                callK(resp)
                return
            }
            case "httpServerListen": {
                const [, serverNum, host, port] = req as [string, number, string, number]
                const serverObj = ioIdGet(serverNum, "server") as http.Server
                serverObj.listen(port, host)
                const resp: JsData = []
                callK(resp)
                return
            }
            case "httpServerRecvRequest": {
                const [, serverNum,] = req as [string, number]
                const serverObj = ioIdGet(serverNum, "server") as http.Server
                serverObj.once("request", (httpReq, httpResp) => {
                    const reqRespObj = { req: httpReq, resp: httpResp }
                    const reqRespNum = ioIdAlloc("httpReq", reqRespObj)
                    const ioResp = [reqRespNum]
                    callK(ioResp)
                })
                return
            }
            case "httpServerSendResponse": {
                const [, reqRespNum, headers, body] = req as [string, number, [string, string][], string]
                const reqRespObj = ioIdGet(reqRespNum, "httpReq") // as HttpReqResp
                for (const [hdrName, hdrValue] of headers) {
                    reqRespObj.resp.setHeader(hdrName, hdrValue)
                }
                reqRespObj.resp.end(body)
                const resp: JsData = []
                ioIdFree(reqRespNum, "httpReq")
                callK(resp)
                return
            }
            case "httpReqMethod": {
                let [, httpReqIoId] = req
                let httpReq = ioIdGet(httpReqIoId, "httpReq")
                let resp = [httpReq.req.method]
                // return ioDoAsync(respK(listJsToFe(resp)))
                callK(resp)
                return
            }
            case "httpReqUrlPathname": {
                let [, httpReqIoId] = req
                let httpReq = ioIdGet(httpReqIoId, "httpReq")
                let url = new URL(httpReq.req.url)
                let resp = [url.pathname]
                // return ioDoAsync(respK(listJsToFe(resp)))
                callK(resp)
                return
            }
            case "httpReqUrlQueryParams": {
                let [, httpReqIoId] = req
                let httpReq = ioIdGet(httpReqIoId, "httpReq")
                let url = new URL(httpReq.req.url)
                let queryParams = new URLSearchParams(url.search)
                let resp = [...queryParams] // [...queryParams].map(a => listJsToFe(a))
                // return ioDoAsync(respK(listJsToFe(resp)))
                callK(resp)
                return
            }
            case "httpReqData": {
                let [, httpReqIoId] = req
                let chunks: Buffer[] = []
                let httpReq = ioIdGet(httpReqIoId, "httpReq")
                httpReq.req.on("data", (chunk: Buffer) => {
                    chunks.push(chunk)
                }).on("end", () => {
                    let body = Buffer.concat(chunks).toString()
                    let json = JSON.parse(body)
                    let resp = [json]
                    callK(resp)
                })
                return
            }
            case "httpReqFDN": {
                throw new Error("TODO")
            }
            case "httpReqFormData": {
                throw new Error("TODO")
            }
            case "httpRespond": {
                let [, httpReqIoId, httpHeaders, httpResp] = req
                let httpReq = ioIdGet(httpReqIoId, "httpReq")
                let httpHeadersObj: { [_: string]: string } = {}
                for (const [key, val] of httpHeaders) {
                    httpHeadersObj[key] = val
                }
                let httpRespObj = new Response(httpResp, { headers: httpHeadersObj })
                ioIdFree(httpReqIoId, "httpReq")
                httpReq.resp.respondWith(httpRespObj).then(() => {
                    let resp: JsData = []
                    callK(resp)
                })
                return
            }
            case "get": {
                let [, key, mkInitVal] = req
                let val = ioState.get(key)
                if (val === undefined) {
                    val = mkInitVal(null)
                }
                callK(val)
                return
            }
            case "set": {
                let [, key, val] = req
                ioState.set(key, val)
                callK([])
                return
            }
            default:
                throw new Error(`Unknown IO request (${reqName})`)
        }
    }
    return ioDoAsync
}


let ioDoPrim1 = (cmdLineArgs: string[]) => (rr: ReqRespFe) => {
    let result = 0
    let resp
    let ioState = new Map()
    while (true) {
        let [req, [respK, _]] = rr as any
        switch (req[0]) {
            case "readFile": {
                let [filename] = req[1]
                resp = fs.readFileSync(filename, "ascii");
                //   resp = jsio.readFile(filename);
                // console_log(`IO Read ${req[1][0]} ${JSON.stringify(resp).slice(0, 80)}`)
                console_log(`IO Read ${req[1][0]}`)
                break
            }
            case "readFile2": {
                let [filename] = req[1]
                try {
                    console_log(`IO Read ${req[1][0]}`)
                    const contents = fs.readFileSync(filename, "ascii");
                    resp = ["Ok", [contents, null]]
                }
                catch (exc) {
                    resp = ["Error", [errorObjToData(exc), null]]
                }
                break
            }
            case "writeFile": {
                let [filename, [contents]] = req[1]
                // console_log(`IO Write ${filename} ${JSON.stringify(contents).slice(0, 80)}`)
                console_log(`IO Write ${filename}`)
                fs.writeFileSync(filename, contents);
                //   jsio.writeFile(filename, contents);
                resp = null
                break
            }
            case "print": {
                //console_log(`IO Print ${req[1][0]}`)
                // console_log(`IO Print ${JSON.stringify(req[1][0])}`)
                console_log(`IO Print ${showValueFerrum2(req[1][0])}`)
                //   let text = "IO Print " + showValueFerrum2(req[1][0])
                //   jsio.print(text)
                resp = null
                break
            }
            // case "getArgs": {
            //     // let argv = process.argv.slice(2);
            //     let argv = jsio.args();
            //     // console_log("ARGS", JSON.stringify(argv))
            //     resp = null
            //     argv.reverse().forEach(arg => {
            //         resp = [arg, resp]
            //     })
            //     console_log(`IO GetArgs ${JSON.stringify(resp)}`)
            //     break
            // }
            case "getArgs": {
                resp = feData_fromJson(cmdLineArgs)
                console_log(`IO GetArgs ${JSON.stringify(resp)}`)
                break
            }
            case "getEnvVar": {
                const [, [envVarName,]] = req
                const envVarValueJs = process.env[envVarName]
                const envVarValueFe = envVarValueJs === undefined ? null : [envVarValueJs, null]
                resp = envVarValueFe
                console_log(`IO GetEnvVar (${envVarName} = ${envVarValueJs})`)
                break
            }

            //   case "getFerrumDir": {
            //       resp = path.join(new URL(import.meta.url).pathname, "../../../..")
            //       console_log(`IO GetFerrumDir ${JSON.stringify(resp)}`)
            //       resp = [resp, null]
            //       break
            //   }

            //   case "getFerrumDir": {
            //       // The fe4-ferrum.fe code copy-pastes the runtime2.js file contents into generated output files.
            //       // This started causing problems when the generated code was at a different level in the hierarchy than the original,
            //       //   as the "../../.." like constructions no longer worked.
            //       // This new approch of dropping everything after the last "src" segment will work,
            //       //   as long as the generated code is located beneath the same "src" directory.
            //       // TODO ? perhaps copy-pasting runtime2.js isn't the best idea ?
            //       // TODO ? or perhaps the runtime should be invoked with its location, and not rely on "import.meta.url" ?
            //       const pathParts = new URL(import.meta.url).pathname.split("/")
            //       while (pathParts.length !== 0 && pathParts.at(-1) !== "src") {
            //         pathParts.pop()
            //       }
            //       if (pathParts.length === 0) {
            //         throw new Error(`getFerrumDir: "src" segment not found in path ${JSON.stringify(pathParts)}`)
            //       }
            //       resp = pathParts.join("/")
            //       console_log(`IO GetFerrumDir ${JSON.stringify(resp)}`)
            //       resp = [resp, null]
            //       break
            //   }

            case "get": {
                let [key, [mkInitVal,]] = req[1]
                // TODO hash-cons the key
                let val = ioState.get(key)
                if (val === undefined) {
                    val = mkInitVal(null)
                }
                resp = val
                break
            }
            case "set": {
                let [key, [val,]] = req[1]
                // TODO hash-cons the key
                ioState.set(key, val)
                resp = null
                break
            }

            case "done":
            case "exit": {
                console_log(`IO Exit ${JSON.stringify(req[1][0])}`)
                result = req[1][0]
                break
            }
            default:
                throw new Error(`unknown IO request (${req[0]})`)
        }
        if (respK === null) {
            break
        }
        rr = respK(resp)
    }
    return result
}

export const ioDoPrim = ioDoPrim1(process.argv.slice(2))

export const flush = () => { process.stdout.write("", () => { }); process.stderr.write("", () => { }) }

function primJsEval(input: string) {

    // There a four ways we could handle import paths in generated code files:
    //   - Static imports with hard-coded relative paths.
    //   - Static imports with build-time generated absolute paths, based on where this runtime.js file is.
    //   - Static imports with build-time generated absolute paths, based on the build-time value of the ferrumDir environment variable.
    //   - Dynamic imports using run-time generated absolute (or relative?) paths based on the run-time value of the ferrumDir environment variable.

    // Trade-offs involve:
    //   - Can generated files be moved after they've been built.
    //   - Is the user obligated to setting the ferrumDir environment variable.
    //   - Will the contents of the generated file differ based on where the repo has been checked out (makes diffing two builds more noisy).
    //   - If the generated code is loaded into an IDE, will the IDE resolve the imports in a helpful way (less likely with dynamic imports).


    // const ferrumDir = process.env["ferrumDir"]
    const ferrumDir = import.meta.resolve("../..")
    assert.isTrue(ferrumDir !== undefined)

    const header = [
        `import { primitivesCore, runtimeUtils } from "${ferrumDir}/ts/gen/runtime/runtime-core.js"`,
        `import { primitivesNodeJs } from "${ferrumDir}/ts/gen/runtime/runtime-nodejs.js"`,
        `const rt = runtimeUtils`,
        `const p = { ...primitivesCore, ...primitivesNodeJs }`,
        `const func = function(rt, _) {`
    ]
    const body =
        `return (${input});\n`
    const footer = [
        `}`,
        `const result = func(rt, p)`,
        `console.log(JSON.stringify(result))`,
        "", ""
    ]

    // The standalone code is written out in a form which can be directly executed by NodeJs.
    // This is done purely for diagnostic/debugging purposes.
    const standalone = [...header, body, ...footer].join("\n")
    fs.writeFileSync(`tmp-gen-primJsEval.mjs`, standalone)

    // Rather than launching NodeJs to execute the standalone code, 
    //   we can generate a function directly and call that.
    const func = new Function('rt', '_', body)
    const primitives = { ...primitivesCore, ...primitivesNodeJs }
    const result = func(runtimeUtils, primitives)

    return result
}

function primJsEvalMaybe(input: string) {
    let result
    try {
        result = primJsEval(input)
    }
    catch (exc) {
        console_log("JsEvalMaybe Crash", exc)
        return null
    }
    return [result, null]
}


export const primitivesNodeJs = {
    ioDoPrim1,
    ioDoPrim,
    jsEval: primJsEval,
    jsEvalMaybe: primJsEvalMaybe,
}


