// import * as fs from "node:fs"
// import * as path from "node:path";
// import * as url from "node:url";

// import { assert } from "../utils/assert.js"
// import { findFiles } from "../utils/find-files.js";
// import { FileEntry, PageEntry, WebsiteBuilder } from "./website-builder.js";
// import { PageModule } from "./page-module.js";
// import { io, url_resolveDir, url_resolveFile } from "../io/io.js";
// import { CmdLine, parseCmdLine } from "../utils/cmdline.js";
// import { RequestHandler } from "./site-server.js";
// import { PageHtmlCtx, PageHtmlOptions, pageToHtml } from "./page-html.js";


// export type AppDefns = Map<string, { defnName: string, fileName: string, fnName: string }>
// export type AppInstances = Map<string, { instanceName: string, defnName: string, args: string[], instance?: RequestHandler }>
// export type AppPublications = Map<string, { urlPath: string, instanceName: string, requestHandler?: RequestHandler }>

// // export type FileEntry = { tag: "file", srcFile: string, dstFile: string, urlPath: URL, mime: string }
// export type FileMap = Map<string, FileEntry>

// // Export the website for use with a static-server.
// export function exportSite(topDir: string, outDir: string): WebsiteBuilder {

//     console.log("EXPORTING Website ...")

//     const srcFileMap = new Map<string, FileEntry>
//     const dstFileMap = new Map<string, FileEntry>

//     const pageMap = new Map<string, PageEntry>

//     const appDefnMap: AppDefns = new Map
//     const appInstMap: AppInstances = new Map
//     const appPubsMap: AppPublications = new Map

//     let sitemap: string

//     return {
//         staticFiles(url, dir, fileExtn, mime) {
//             console.log("Static", url, dir, fileExtn, mime)

//             const ctx = {
//                 srcDir: path.join(topDir, dir),
//                 dstDir: path.join(outDir, url),
//                 dstUrl: url_resolveDir("http://.", url)
//             }
//             findFiles(ctx.srcDir, fileExtn, ctx, {
//                 dir({ srcDir, dstDir, dstUrl }, dirName) {
//                     return {
//                         srcDir: path.join(srcDir, dirName),
//                         dstDir: path.join(dstDir, dirName),
//                         // dstUrl: new URL(encodeURI(dirName), dstUrl)
//                         dstUrl: url_resolveDir(dstUrl, dirName)
//                     }
//                 },
//                 file({ srcDir, dstDir, dstUrl }, fileName) {
//                     const srcFile = path.join(srcDir, fileName)
//                     const dstFile = path.join(dstDir, fileName)
//                     const fileEntry: FileEntry = { tag: "file", srcFile, filePath: dstFile, urlPath: url_resolveFile(dstUrl, fileName).pathname, mime }
//                     if (srcFileMap.has(srcFile)) {
//                         // One src associated with mutiple dsts is harmless.
//                         // But, we only make a record of the first one.
//                     }
//                     else {
//                         srcFileMap.set(srcFile, fileEntry)
//                     }
//                     if (dstFileMap.has(dstFile)) {
//                         // One dst associated multiple srrc is ambiguous.
//                         // Ignore second and subsequent definitions of the same destination file.
//                         console.error("Multiple definitions")
//                     }
//                     else {
//                         dstFileMap.set(dstFile, fileEntry)
//                     }
//                     dstFileMap.set(dstFile, fileEntry)
//                     fs.mkdirSync(dstDir, { recursive: true })
//                     fs.copyFileSync(srcFile, dstFile)
//                     console.log("Copied", srcFile, "-> ", dstFile)
//                 },
//             })
//         },
//         async renderPages(urlPath, dir) {
//             console.log("Render", urlPath, dir)

//             const ctx = {
//                 srcDir: path.join(topDir, dir),
//                 dstDir: path.join(outDir, urlPath)
//             }
//             findFiles(ctx.srcDir, ".js", ctx, {
//                 dir({ srcDir, dstDir }, dirName) {
//                     return {
//                         srcDir: path.join(srcDir, dirName),
//                         dstDir: path.join(dstDir, dirName)
//                     }
//                 },
//                 file({ srcDir, dstDir }, fileName) {
//                     const srcFile = path.join(srcDir, fileName)
//                     const dstFile = path.join(dstDir, `${path.parse(fileName).name}.html`)

//                     new Promise(async () => {
//                         const importUrl = new URL(url.pathToFileURL(srcFile))
//                         const pageModule = (await import(importUrl.toString())).default as PageModule

//                         if (pageModule.page2 !== undefined) {
//                             const page = pageModule.page2()
//                             const ctx: PageHtmlCtx = { topDir, srcFileMap, pageMap, appDefns: appDefnMap, appInstances: appInstMap, nextTopDivNum: 1 }
//                             const opts: PageHtmlOptions = {
//                                 importAppScripts: true, // TODO? Only import the app scripts if the page actually uses them?
//                                 importReloadScript: false,
//                             }
//                             const lines = pageToHtml(ctx, opts, page)
//                             const dstContents = lines.join("\n")
//                             fs.mkdirSync(dstDir, { recursive: true })
//                             fs.writeFileSync(dstFile, dstContents)
//                         }
//                         else {
//                             console.error("Failed to render page:", srcFile)
//                         }

//                     })
//                 },
//             })
//         },

//         // app(url, jsUrl, jsDir, appFileName, appFuncName, args) {
//         //     console.log("App", url)

//         //     // TODO Do we want to load apps dynamically, much like the pages?

//         //     function mod(module: string): string {
//         //         return JSON.stringify(path.join(jsUrl, module))
//         //     }

//         //     const dstContents = [
//         //         "<!DOCTYPE html>",
//         //         "<html>",
//         //         "<head>",
//         //         "<meta charset=\"utf-8\">",
//         //         "<link rel='icon' href='data:,'>",
//         //         "<title>",
//         //         "LOCAL Ferrum WebIDE(TS)",
//         //         "</title>",
//         //         "<style>",
//         //         "html { box-sizing: border-box; }",
//         //         "*, *:before, *:after { box-sizing: inherit; }",
//         //         "body { margin: 0; width: 100vw; height: 100vh; font-family: sans-serif; }",
//         //         "</style>",
//         //         "</head>",
//         //         "<body id=body>",
//         //         "<div id=topDiv></div>",
//         //         "<script type='module'>",
//         //         "",
//         //         `  import { setIo } from ${mod("io/io.js")}`,
//         //         `  import { mkIoBrowser } from ${mod("io/io-browser.js")}`,
//         //         `  import { initApp } from ${mod("ui/browser.js")}`,
//         //         `  import { ${appFuncName} as app } from ${mod(appFileName)}`,
//         //         `  setIo(mkIoBrowser(new URL("/", window.location.href)))`,
//         //         `  initApp(app, ${JSON.stringify(args)})`,
//         //         "",
//         //         "",
//         //         "</script>",
//         //         "</body>",
//         //         "</html>",
//         //     ].join("\n")

//         //     try {
//         //         const dstFile = path.join(outDir, url)
//         //         fs.mkdirSync(path.dirname(dstFile), { recursive: true })
//         //         fs.writeFileSync(dstFile, dstContents)
//         //     }
//         //     catch (exc) {
//         //         console.error(`Write failed: ${exc}`)
//         //     }

//         // },

//         appDefine(appDefnName, appFilename, appFnName) {
//             appDefnMap.set(appDefnName, { defnName: appDefnName, fileName: appFilename, fnName: appFnName })
//         },
//         appInstantiate(appInstanceName, appDefnName, args) {
//             appInstMap.set(appInstanceName, { instanceName: appInstanceName, defnName: appDefnName, args: args })
//         },
//         appPublish(urlPath, appInstanceName) {
//             appPubsMap.set(urlPath, { urlPath: urlPath, instanceName: appInstanceName })

//             // TODO export the app here

//             console.log("App2", urlPath)

//             // TODO Do we want to load apps dynamically, much like the pages?


//             let appInstEntry = appInstMap.get(appInstanceName)
//             assert.isTrue(appInstEntry !== undefined)

//             const { defnName, args } = appInstEntry
//             const appDefnEntry = appDefnMap.get(defnName)
//             assert.isTrue(appDefnEntry !== undefined)
//             const { fileName, fnName } = appDefnEntry
//             const fullFileName = path.join(outDir, fileName)
//             // const fileEntry = dstFileMap.get(fullFileName) 
//             // assert.isTrue(fileEntry !== undefined)

//             const cmdLine: CmdLine = parseCmdLine(args)


//             // const appModule = await import(path.join(fileEntry.filename))
//             // const app2 = appModule[fnName] as App2
//             // const appRequestHandler = appServer(cmdLine, app2)
//             // appInstEntry.instance = appRequestHandler



//             function mod(module: string): string {
//                 // return JSON.stringify(path.join(urlPath, module))

//                 const srcFile = path.join(topDir, module)
//                 const fileEntry = srcFileMap.get(srcFile)
//                 if (fileEntry !== undefined) {
//                     return JSON.stringify(fileEntry.urlPath)
//                 }
//                 assert.unreachable()
//             }

//             const dstContents = [
//                 "<!DOCTYPE html>",
//                 "<html>",
//                 "<head>",
//                 "<meta charset=\"utf-8\">",
//                 "<link rel='icon' href='data:,'>",
//                 "<title>",
//                 `LOCAL App2 (${appInstanceName} / ${defnName})`,
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
//                 "",
//                 `  import { setIo } from ${mod("ts/gen/io/io.js")}`,
//                 `  import { mkIoBrowser } from ${mod("ts/gen/io/io-browser.js")}`,
//                 `  import { initApp } from ${mod("ts/gen/ui/browser.js")}`,
//                 `  import { ${fnName} as app } from ${mod(fileName)}`,
//                 `  setIo(mkIoBrowser(new URL("/", window.location.href)))`,
//                 `  initApp(app, ${JSON.stringify(args)})`,
//                 "",
//                 "",
//                 "</script>",
//                 "</body>",
//                 "</html>",
//             ].join("\n")

//             try {
//                 // TODO ? Don't use path.join here, use "new URL" and urlPathToFile. ?
//                 const dstFile = path.join(outDir, urlPath)
//                 fs.mkdirSync(path.dirname(dstFile), { recursive: true })
//                 fs.writeFileSync(dstFile, dstContents)
//             }
//             catch (exc) {
//                 console.error(`Write failed: ${exc}`)
//             }
//         },

//         sitemap(urlPath) {
//             sitemap = urlPath
//         },

//         watch(fileDir) {
//             // Ignore, we're running in batch-mode.
//         },
//     }


// }

