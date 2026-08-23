import * as fs from "node:fs"
import * as path from "node:path"
import * as url from "node:url";
import * as http from "node:http"
import * as node_module from "node:module"

import { unit } from "../utils/unit.js";
import { assert } from "../utils/assert.js"
import { mkIoNodeJs } from "../io/io-nodejs.js";
import { setIo, url_resolveDir } from "../io/io.js";

import { SiteDefn, siteFiles, SiteDefnFiles, PageEntry } from "./website-builder.js";
import { PageModule } from "./page-module.js";
import { CmdLine, parseCmdLine } from "../utils/cmdline.js";
import { App } from "../ui/app-ui.js";
import { htmlSiteMap2 } from "./site-map.js";
import { debounceCallback } from "../utils/debounce.js";
import { PageHtmlCtx, PageHtmlOptions, pageToHtml } from "./page-html.js";
import { appServer, showAddrInfo } from "./website-server.js";
import { Page } from "./page-doc.js";


// // TODO ? Make the server responsible for translating the typescript ?
// // import * as ts from "../node_modules/typescript/lib/typescript.js";
// import * as ts from "typescript/lib/typescript.js";



type LivePage = {
    page: PageEntry
    urlPath: string
    eventStream: http.ServerResponse
}

type RenderedPage = {
    htmlLines: string[]
    numApps: number
    // appInit: string[][] // code that needs to be in <script> elements.
}

export type RequestHandler = (request: http.IncomingMessage, response: http.ServerResponse) => Promise<unit>

export async function siteServe(sd: SiteDefn, topDir: string, portNum: number): Promise<unit> {

    let sf = siteFiles(topDir, sd)
    let siteFilesUpdateRequired = false

    // This custom loader ensures indirectly imported parts of a page are reread as needed.
    // Without this, the server will still work, and simple pages will still update.
    // But changes to parts of pages derived from sub-imports (such as glossary-defs.ts),
    //   will require the server to be restarted before being picked up. 
    // We only want to re-read watched files, not arbitrary files, 
    //   so the list of watched directories is passed to the page-loader.
    // Re-reading other files is not only wasteful, 
    //   it can lead to problems with global-vars, 
    //   in particular the IO state (which shouldn't be global, but plumbed through as needed, but it's still global for now.)
    const reloadDirs = sf.watch.map(w => url_resolveDir(url.pathToFileURL(topDir), w).toString())
    node_module.register("./page-loader.js", import.meta.url, { data: reloadDirs })

    const livePages = new Set<LivePage>
    const watchers = new Set<fs.FSWatcher>

    // The seqId is incremented each time a (debounced) change is detected within a watched directory.
    // It helps ensure we aren't reading an old cached version of the pages.
    let seqId = 1

    const appRequestHandlers = new Map<string, RequestHandler>


    async function renderPage(entry: PageEntry): Promise<RenderedPage> {
        const srcFile = path.join(topDir, entry.srcFile)
        const importUrl = url.pathToFileURL(srcFile)
        importUrl.searchParams.set("seqId", `${seqId}`)
        const pageModule = (await import(importUrl.toString())).default as PageModule
        if (pageModule.page !== undefined) {
            const page = pageModule.page()
            const ctx: PageHtmlCtx = {
                srcFile: entry.srcFile,
                topDir,
                fileMap: sf.fileMap,
                pageMap: sf.pageMap,
                appDefns: sf.appDefnMap,
                appInstances: sf.appInstMap,
                numApps: 0
            }
            const opts: PageHtmlOptions = {
                // By default, 
                //   use app-scripts for pages which contains apps.
                //   use the reload-script for pages which don't contain apps.
                // importAppScripts: true, 
                // importReloadScript: true,
                // importReloadScript: false,
            }

            const contents = pageToHtml(ctx, opts, page)
            return {
                htmlLines: contents,
                numApps: ctx.numApps,
            }
        }

        throw new Error(`Failed to render page: ${entry.srcFile}`)
    }

    const requestHandler: RequestHandler = async (request, response): Promise<unit> => {

        if (siteFilesUpdateRequired) {
            siteFilesUpdateRequired = false
            sf = siteFiles(topDir, sd)
        }

        if (request.url === undefined) {
            response.statusCode = 404
            response.end()
            return
        }

        // console.log("URL", request.url)

        const urlp = new URL(request.url, "http://.")
        let pathname = urlp.pathname
        if (pathname.endsWith("/")) {
            pathname += "index.html"
        }

        const entry = sf.urlMap.get(pathname)

        if (entry === undefined) {
            response.statusCode = 404
            response.end()
            return
        }

        switch (entry.tag) {
            case "file":
                try {
                    const contents = await fs.promises.readFile(path.join(topDir, entry.srcFile))
                    response.statusCode = 200
                    response.setHeader("content-type", entry.mime)
                    response.write(contents)
                    response.end()
                    return
                }
                catch (exc) {
                    response.statusCode = 404
                    response.setHeader("content-type", "text/plain")
                    // response.write(`Error: (${JSON.stringify(exc)})`)
                    console.log(`Server Get Error Url: (${JSON.stringify(request.url)})`)
                    console.log(`Server Get Error File: (${JSON.stringify(exc)})`)
                    response.end()
                    return
                }
            case "page": {

                if (urlp.searchParams.get("event-stream") !== null) {
                    assert.isTrue(request.headers.accept === "text/event-stream")
                    assert.isTrue(request.headers.accept.split(",").indexOf("text/event-stream") !== -1)
                    response.statusCode = 200
                    response.setHeader("content-type", "text/event-stream")
                    response.setHeader("cache-control", "no-cache")
                    response.setHeader("connection", "keep-alive")

                    response.write("id: 0\nevent: connected\ndata:\n\n")

                    // Close all previous event streams.
                    //   This is the simplest way to implement simple reliable predictable behaviour.
                    //   Albeit at the expense of only keeping the most recently loaded/reloaded page live.
                    for (const lp of livePages) {
                        // Close all current live pages
                        lp.eventStream.write("event: close\ndata:\n\n")
                    }

                    const livePage: LivePage = {
                        page: entry,
                        urlPath: urlp.pathname,
                        eventStream: response
                    }
                    livePages.add(livePage)
                    response.on("close", () => {
                        livePages.delete(livePage)
                    })

                    if (request.headers["last-event-id"] !== undefined) {
                        // If this is a reconnection, then send fresh contents.
                        renderPage(livePage.page).then(rp => {
                            if (rp.numApps === 0) {
                                const content = rp.htmlLines.join("\n")
                                livePage.eventStream.write(`event: replace\ndata: ${JSON.stringify(content)}\n\n`)
                            }
                            else {
                                livePage.eventStream.write(`event: reload\ndata:\n\n`)
                            }
                        })
                    }

                    // If too many event-streams are established simultaneously, 
                    //   browsers throttle connections to the server until the number of established connections drops again.
                    // Given event-streams are meant to be long-lived, 
                    //   this gives the impression of the server being unresponsive.
                    // The limit is configured in Firefox with this config param:
                    //     network.http.max-persistent-connections-per-server (default 6).
                    // Options:
                    //   - Only maintain a live connection on the most recently loaded/reloaded page.
                    //       - Add a status indicator to show when a page is connected / is no longer connected.
                    //   - Allow multiple, but evict least recently used when some server-side threshold is reached,
                    //       (but, the server doesn't know what the client-side limit is).
                    //   - Have the client-side browser-tabs cooperate in using a single event-stream for all pages,
                    //       (this is probably the best option).

                    return

                }

                try {
                    const rp = await renderPage(entry)
                    const contents = rp.htmlLines.join("\n")
                    response.statusCode = 200
                    response.setHeader("content-type", "text/html")
                    response.write(contents)
                    response.end()
                    return
                }
                catch (exc) {
                    response.statusCode = 404
                    response.setHeader("content-type", "text/plain")
                    response.write(`Failed to render page: (${JSON.stringify(request.url)})`)
                    console.log(`Failed to render page: (${JSON.stringify(request.url)})`)
                    response.end()
                    return
                }

            }

            case "app": {
                const appPubEntry = entry
                const srcFileMap = sf.fileMap
                const appDefnMap = sf.appDefnMap
                const appInstMap = sf.appInstMap

                const appInst = appInstMap.get(entry.instanceName)
                if (appInst === undefined) {
                    assert.todo("report error")
                }

                let appRequestHandler = appRequestHandlers.get(entry.instanceName)

                if (appRequestHandler === undefined) {

                    const { defnName, args } = appInst
                    const appDefnEntry = appDefnMap.get(defnName)
                    assert.isTrue(appDefnEntry !== undefined)
                    const { fileName, fnName } = appDefnEntry
                    const fileEntry = srcFileMap.get(fileName)
                    assert.isTrue(fileEntry !== undefined)

                    const cmdLine: CmdLine = parseCmdLine(args)

                    const appModule = await import(path.join(topDir, fileEntry[0].srcFile))
                    const app2 = appModule[fnName] as App
                    appRequestHandler = appServer(cmdLine, app2)
                    appRequestHandlers.set(entry.instanceName, appRequestHandler)
                }

                appRequestHandler(request, response)
                return
            }
            case "sitemap": {
                const lines = htmlSiteMap2(sf)
                const contents = lines.join("\n")
                response.statusCode = 200
                response.setHeader("content-type", "text/html")
                response.write(contents)
                response.end()
                return
            }
            default:
                assert.noMissingCases(entry)

        }

    }

    // This triggers page-reloads on all current live-pages,
    //   when any file within a watched directory changes.
    const fileChangeCallback = debounceCallback(10, () => {
        seqId++
        siteFilesUpdateRequired = true

        for (const lp of livePages) {
            renderPage(lp.page).then(rp => {
                // lp.eventStream.write(`event: replace\ndata: ${JSON.stringify(p)}\n\n`)
                if (rp.numApps === 0) {
                    const content = rp.htmlLines.join("\n")
                    lp.eventStream.write(`event: replace\ndata: ${JSON.stringify(content)}\n\n`)
                }
                else {
                    lp.eventStream.write(`event: reload\ndata:\n\n`)
                }
            }).catch(exc => {
                console.error("Live page update failed:", exc)
            })
        }
    })

    for (const w of sf.watch) {
        watchers.add(fs.watch(path.join(topDir, w), { recursive: true }, fileChangeCallback))
    }

    const httpServer = http.createServer(requestHandler)
    // const host = undefined // for remote access
    const host = "localhost" // for local access
    httpServer.listen({ port: portNum, host }, () => {
        const info = httpServer.address()
        if (info && typeof info === "object") {
            console.log("Listening:", `http://${showAddrInfo(info)}/`)
        }
        else {
            console.log("Listening:", httpServer.address())
        }
    })

}
