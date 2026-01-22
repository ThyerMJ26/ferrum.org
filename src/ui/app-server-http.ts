
// /** This file contains the http-specific parts of the app-server.
//  *  This serves a single app at the root URL.
//  *  For multiple apps, at different URLs, 
//  *    the website-builder (website-server.ts + website-exporter.ts) should be used.
//  */


// import * as http from "node:http"
// import * as net from "node:net"
// import * as url from "node:url"
// import * as path from "node:path"
// import * as fs from "node:fs"
// import * as node_process from "node:process"
// import * as crypto from "node:crypto"

// import { unit } from "../utils/unit.js"
// import { assert } from "../utils/assert.js"
// import { findFiles } from "../utils/find-files.js";

// import { io, setIo, url_resolveDir, url_resolveFile } from "../io/io.js"
// import { mkIoNodeJs } from "../io/io-nodejs.js"

// import { ViewNum, WuiRequestMsg, WuiResponseMsg, WuiRequestWrapper, WuiResponseWrapper } from "./protocol.js"
// import { mkReactive, ReactiveControl } from "./reactive.js"
// import { ViewCtx, App } from "./app-ui.js"
// import { ViewImpl } from "./app-views.js"

// // Import the http-independent parts of app-server
// import { AppIo, PersistentState, Wui, mkWui } from "./app-server.js"

// import { siteBuild } from "../site/site-builder.js"
// import { SiteDefn } from "../site/website-builder.js"
// import { siteServe } from "../site/site-server.js"

// // // TODO ? Make the server responsible for translating the typescript ?
// // // import * as ts from "../node_modules/typescript/lib/typescript.js";
// // import * as ts from "typescript/lib/typescript.js";




// type SessionInfo = {
//     serverId: string
//     sessionId: string
//     idSent: boolean
//     sessionNum: number
//     eventStream?: http.ServerResponse<http.IncomingMessage>
//     // TODO ? Keep track of unacknowledged notifications.
//     // notificationIsInProgress: boolean
// }


// export type RequestHandler = (request: http.IncomingMessage, response: http.ServerResponse) => Promise<unit>

// export type WuiServerHttp = {
//     requestHandler: RequestHandler
//     notify: () => unit
// }


// function mkWuiServerHttp(
//     rctv: ReactiveControl,
//     wui: Wui,
// ): WuiServerHttp {

//     const serverId = [node_process.pid, Date.now(), crypto.randomBytes(4).toString('hex')].join("-")

//     const sessions: Map<string, SessionInfo> = new Map
//     let nextSessionNum = 1

//     let currentSession: SessionInfo | null = null

//     let serverStartTime = Date.now()
//     let numRequestsStarted = 0
//     let numRequestsFinished = 0
//     let numReactiveCycles = 0

//     const requestHandlers = new Map<string, RequestHandler>

//     type FileEntry = { filename: string, mime: string }
//     const urlToFileMap = new Map<string, FileEntry>

//     function addFiles(url: string, dir: string, extn: string, mime: string): unit {
//         findFiles(dir, extn,
//             {
//                 url: url_resolveDir("http://.", url),
//                 dir: path.resolve(dir)
//             },
//             {
//                 dir({ url, dir }, dirName) {
//                     return {
//                         url: url_resolveDir(url, dirName),
//                         dir: path.join(dir, dirName)
//                     }
//                 },
//                 file({ url, dir }, fileName) {
//                     const url2 = url_resolveFile(url, fileName).pathname
//                     const file2 = path.join(dir, fileName)
//                     urlToFileMap.set(url2, { filename: file2, mime })
//                 },
//             }
//         )
//     }

//     addFiles("/gen", "../ts/gen", ".js",  /**/ "text/javascript")
//     addFiles("/gen", "../ts/gen", ".map", /**/ "application/json")
//     addFiles("/src", "../ts/src", ".ts",  /**/ "text/plain")

//     // TODO ? Generate the JS code for the server, rather than asume it has already been dome.
//     //     // const jsInput = fs.readFileSync(path.join(ferrumSrcSDir, "bootstrap/ts/", `${p.name}.ts`)).toString()
//     //     // const tsOutput = ts.transpileModule(jsInput, {
//     //     //     compilerOptions: {
//     //     //         module: ts.ModuleKind.ES2015,
//     //     //         sourceMap: true,
//     //     //     },
//     //     //     fileName: p.base
//     //     // })
//     //     // contents = tsOutput.outputText
//     //     // // TODO ? Keep hold of the source-map (tsOutput.sourceMapText), 
//     //     // // TODO ?   so as to be able to serve it up when requested ?





//     return {
//         requestHandler: requestHandler(),
//         notify,
//     }

//     async function handleGet(request: http.IncomingMessage, response: http.ServerResponse, session: SessionInfo | null): Promise<unit> {

//         if (request.url === undefined) return

//         const fileEntry = urlToFileMap.get(request.url)
//         if (fileEntry !== undefined) {
//             try {
//                 const contents = await fs.promises.readFile(fileEntry.filename)
//                 response.statusCode = 200
//                 response.setHeader("content-type", fileEntry.mime)
//                 response.write(contents)
//                 response.end()
//                 return
//             }
//             catch (exc) {
//                 response.statusCode = 404
//                 response.setHeader("content-type", "text/plain")
//                 // response.write(`Error: (${JSON.stringify(exc)})`)
//                 console.log(`Server Get Error Url: (${JSON.stringify(request.url)})`)
//                 console.log(`Server Get Error File: (${JSON.stringify(exc)})`)
//                 response.end()
//                 return

//             }
//         }

//         const handler = requestHandlers.get(request.url)
//         if (handler !== undefined) {
//             return handler(request, response)
//         }

//         if (request.url === "/") {

//             const body = [
//                 "<!DOCTYPE html>",
//                 "<html>",
//                 "<head>",
//                 "<meta charset=\"utf-8\">",
//                 "<link rel='icon' href='data:,'>",
//                 "<title>",
//                 "Ferrum WebIDE(TS)",  // TODO Abstract out the page name, we could be serving a different app.
//                 "</title>",
//                 "<style>",
//                 "html { box-sizing: border-box; }",
//                 "*, *:before, *:after { box-sizing: inherit; }",
//                 "body { margin: 0; width: 100vw; height: 100vh; font-family: sans-serif; }",
//                 "</style>",
//                 "</head>",
//                 "<body id=body>",
//                 "<div id=topDiv></div>",
//                 "<script type='module'>",
//                 "  import { initHttp } from '/gen/ui/browser.js'",
//                 "  initHttp()",
//                 "</script>",
//                 "</body>",
//                 "</html>",
//             ].join("\n")

//             response.statusCode = 200
//             response.setHeader("content-type", "text/html")
//             response.write(body)
//             response.end()
//             return
//         }
//         else {
//             const url = new URL(request.url!, "http://.")
//             const urlp = path.parse(url.pathname)

//             if (url.searchParams.get("event-stream") !== null) {
//                 if (currentSession === null || url.searchParams.get("sessionId") !== currentSession.sessionId) {
//                     response.statusCode = 409 // Conflict
//                     response.end()
//                     return
//                 }
//                 assert.isTrue(request.headers.accept === "text/event-stream")
//                 response.statusCode = 200
//                 response.setHeader("content-type", "text/event-stream")
//                 response.setHeader("cache-control", "no-cache")
//                 response.setHeader("connection", "keep-alive")
//                 currentSession.eventStream = response
//                 return
//             }
//         }

//         response.statusCode = 404
//         response.setHeader("content-type", "text/plain")
//         // response.write(`Error: (${JSON.stringify(exc)})`)
//         response.write(`Not Found: (${JSON.stringify(request.url)})`)
//         console.log(`Not Found: (${JSON.stringify(request.url)})`)
//         response.end()
//         return


//     }

//     async function handlePost(request: http.IncomingMessage, response: http.ServerResponse, session: SessionInfo | null): Promise<unit> {

//         if (session === null) {
//             // TODO A more appropriate status code.
//             response.statusCode = 200
//             response.setHeader("content-type", "text/html")
//             response.write("No session.")
//             response.end()
//             return
//         }

//         const bodyChunks: Buffer[] = []
//         for await (const chunk of request) {
//             bodyChunks.push(chunk)
//         }
//         const body = Buffer.concat(bodyChunks).toString();
//         const req = JSON.parse(body) as WuiRequestWrapper

//         const collectedResponses: WuiResponseMsg[] = []

//         let reqMsgs = req.requests
//         // console.log(`POST ${session.sessionNum} ${body}`)

//         wui.exchangeMsgs(reqMsgs, collectedResponses)

//         const resp: WuiResponseWrapper = { responses: collectedResponses }
//         if (!session.idSent) {
//             resp.serverId = session.serverId
//             resp.sessionId = session.sessionId
//             session.idSent = true
//         }
//         const responseBody = JSON.stringify(resp)
//         response.statusCode = 200
//         response.setHeader("content-type", "text/html")
//         response.write(responseBody)
//         response.end()

//         // If new delayedEffects have been scheduled, 
//         //   then resume the delayed-effect runner.
//         // (It might not need resuming, but redundant calls are harmless).


//         console.log("handlePost done")
//     }

//     function notify(): unit {
//         if (currentSession !== null && currentSession.eventStream !== undefined) {
//             // TODO ? Supress sending redundant notifications ?
//             // TODO ?   Resume sending notifications when the earlier ones have been acknowledged ?
//             // TODO ? Count how many notifications were supressed, 
//             // TODO ?   then use this to auto-tune how much work (such as graph-reduction steps) to do in one go ?

//             log("event stream notify")
//             const numRequestsInProgress = numRequestsStarted - numRequestsFinished
//             const msg = `ui.log [${showTime()}, ${numRequestsStarted}, ${numRequestsInProgress}, ${numReactiveCycles}]`
//             const dataMsg = `data: notify ${msg}\n\n`
//             // const dataMsg = `data: notify\n\n`

//             currentSession.eventStream.write(dataMsg)
//         }
//     }

//     function requestHandler(): RequestHandler {

//         return async (request: http.IncomingMessage, response: http.ServerResponse) => {

//             numRequestsStarted++

//             try {
//                 const url = new URL(request.url!, "http://.")
//                 const urlp = path.parse(url.pathname)
//                 const reqServerId = url.searchParams.get("serverId")
//                 let reqSessionId = url.searchParams.get("sessionId")

//                 if (reqServerId !== null && reqServerId !== "unknown" && reqServerId !== serverId) {
//                     // The server has been restarted since the client was last in contact.
//                     // The client needs to reinitialize.
//                     response.statusCode = 409 // Conflict
//                     response.end()
//                     return
//                 }

//                 if (reqSessionId === "new") {
//                     const sessionNum = nextSessionNum++
//                     const newSessionId = `${sessionNum}`
//                     reqSessionId = newSessionId
//                     const newSession: SessionInfo = { serverId, sessionId: newSessionId, idSent: false, sessionNum }
//                     sessions.set(newSessionId, newSession)
//                     currentSession = newSession
//                 }

//                 const session = reqSessionId !== null ? sessions.get(reqSessionId) ?? null : null

//                 console.log("Server:", request.method, request.url, request.headers.accept)

//                 if (session !== null && session !== currentSession) {
//                     // Only one (the most recent) session is supported at a time.
//                     response.statusCode = 409 // Conflict
//                     response.end()
//                     return
//                 }

//                 if (request.method === "GET") {
//                     // await wui.handleGet(request, response, session)
//                     await handleGet(request, response, session)
//                 }
//                 else if (request.method === "POST") {
//                     // await wui.handlePost(request, response, session)
//                     await handlePost(request, response, session)
//                 }
//                 else {
//                     throw new Error(`unhandled method ${request.method}`)
//                 }
//             }
//             catch (exc) {
//                 console.error(`Server Error: ${exc}`)
//                 // TODO Diagnose "Cannot set headers after they are sent to the client".
//                 // TODO Possibly related to a previous event-stream trying to re-establish a connection. 
//                 response.statusCode = 500
//                 response.end()
//                 return
//             }

//             numRequestsFinished++

//         };
//     }

//     function showTime() {
//         const now = Date.now()
//         const t = now - serverStartTime
//         const t2 = Math.floor(t / 100)
//         const result = (t2 / 10).toFixed(1)
//         return result
//     }

//     function log(...args: string[]): unit {
//         const numRequestsInProgress = numRequestsStarted - numRequestsFinished
//         console.log(`ui.log [${showTime()}, ${numRequestsStarted}, ${numRequestsInProgress}, ${numReactiveCycles}]:`, ...args)
//     }

// }

// type U = ViewImpl



// type CookieMap = Map<string, string>
// // TODO ? handle multiple cookies with the same name ?
// // type CookieMap = Map<string, string | string[]>

// function cookie_parse(cookieHdr: string | undefined): CookieMap {
//     const result: CookieMap = new Map
//     if (cookieHdr === undefined) {
//         return result
//     }
//     const parts = cookieHdr.split(";")
//     for (const part of parts) {
//         const delimIdx = part.indexOf("=")
//         assert.isTrue(delimIdx !== -1)
//         const name = part.slice(0, delimIdx)
//         const value = part.slice(delimIdx + 1)
//         result.set(name, value)
//     }
//     return result
// }


// // This is the original app-server.
// // It serves a single app at "/", along with static files.
// // The newer app-server in site/website-server.ts, when used with the site-server,
// //   is able to serve multiple apps at different URLs as specified by a SiteDefn.
// // TODO? Replace this single-use app-server with an invocation of the more general app-server ?
// export function appServer(app: App, args: string[]): RequestHandler {

//     // TODO Abstract out the filename, or even the whole persistence mechanism.
//     // TODO This wile is no longer app-specific, so "ide" doesn't belong here.
//     const persistentFilename = "webide.state"
//     const persistentState: Map<string, any> = new Map
//     const appIo: AppIo = {
//         console_log(...args: string[]) { console.log(...args) },
//         readPersistentFile(): unit {
//             let contents = ""
//             try {
//                 contents = fs.readFileSync(persistentFilename).toString()
//             }
//             catch (exc) {
//                 console.log(`File not found: (${persistentFilename})`)
//                 return
//             }
//             // const lines = contents.split("\n")
//             const lines = contents.split("\n").slice(0, -1)
//             for (const line of lines) {
//                 const [name, value] = JSON.parse(line)
//                 persistentState.set(name, value)
//             }
//             return
//         },
//         writePersistentFile() {
//             const lines: string[] = []
//             for (const [key, value] of persistentState.entries()) {
//                 lines.push(JSON.stringify([key, value]) + "\n")
//             }
//             const contents = lines.join("")
//             // console.log(`Writing state (${lines.length}):`, contents)
//             fs.writeFileSync(persistentFilename, contents)
//         },
//     }

//     function notify(): unit {
//         wuiServer.notify()
//     }

//     const rctv = mkReactive(persistentState, (...args) => { console.log(...args) }, notify)
//     const wui = mkWui(persistentState, rctv, appIo)
//     const wuiServer = mkWuiServerHttp(rctv, wui)

//     const viewNum = wui.allocViewNum()
//     const viewCtx: ViewCtx = { viewNum, visible: wui.x.state<boolean>(null, true).r() }
//     app.mk(wui, viewCtx, args, appIo)
//     wui.initApp(viewNum)

//     return wuiServer.requestHandler

//     // const updateSig = wui.state<null>(null, null)

//     // // TODO ? 
//     // // app(wui, args, updateSig)

//     // // TODO ? pass any remaining/unrecognized options onwards to the app ?
//     // app(wui, cmdLine.command_args)
//     // wui.initApp()

//     // return wui.requestHandler()

//     // TODO ?
//     // wui.initApp(ui => app(ui, args))
//     // TODO ? or perhaps ?
//     // mkWui(ferrumSrcSDir, persistentFilename, ui => app(ui, args))

// }

// export function showAddrInfo(info: net.AddressInfo): string {
//     const port = info.port
//     const addr = info.address
//     const addr2 = addr.includes(":") ? `[${addr}]` : addr
//     return `${addr2}:${port}`
// }

// export function wuiAppRunnerHttp(port: number, app: App, args: string[]): unit {

//     const requestHandler = appServer(app, args)
//     const server = http.createServer(requestHandler)

//     const opts: net.ListenOptions = {
//         host: "localhost", // local access only
//         port
//     }

//     console.log(`Starting HTTP server at: http://${opts.host}:${opts.port}/`);
//     server.listen(opts, () => {
//         const info = server.address()
//         if (info && typeof info === "object") {
//             console.log("Listening:", `http://${showAddrInfo(info)}/`)
//         }
//         else {
//             console.log("Listening:", server.address())
//         }
//     })
// }

// // We're in "ts/gen/ui", the root is three levels up.
// export const topDir = url.fileURLToPath(import.meta.resolve("../../.."))


// // This serves a website with a single app at "/", and the static JS+TS files.
// export function wuiAppRunnerHttp2(port: number, appFilename: string, appFnName: string, args: string[]): unit {

//     const siteDefn: SiteDefn = siteBuild(b => {
//         b.staticFiles("/gen", "ts/gen", ".js",  /**/ "text/javascript")
//         b.staticFiles("/gen", "ts/gen", ".map", /**/ "application/json")
//         b.staticFiles("/src", "ts/src", ".ts",  /**/ "text/plain")
//         b.appDefine("APP", appFilename, appFnName)
//         b.appInstantiate("APP-1", "APP", args)
//         b.appPublish("/", "APP-1")
//     })

//     siteServe(siteDefn, topDir, port)
// }

