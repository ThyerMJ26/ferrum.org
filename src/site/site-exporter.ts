import * as fs from "node:fs"
import * as path from "node:path";
import * as url from "node:url";

import { unit } from "../utils/unit.js";
import { assert } from "../utils/assert.js"
import { SiteDefn, siteFiles, SiteDefnFiles, FileEntry, PageEntry, AppEntry, SiteMapEntry } from "./website-builder.js";
import { url_resolveDir } from "../io/io.js";
// import { mkHtmlBuilder } from "./page-builder.js";
import { PageHtmlCtx, PageHtmlOptions, pageToHtml } from "./page-html.js";
import { PageModule } from "./page-module.js";
import { CmdLine, parseCmdLine } from "../utils/cmdline.js";
import { htmlSiteMap2 } from "./site-map.js";


export async function siteExport(sd: SiteDefn, topDir: string, outDir: string): Promise<unit> {

    const sf = siteFiles(topDir, sd)

    let sitemapContents: string | undefined

    for (const entry of sf.urlMap.values()) {
        switch (entry.tag) {
            case "file":
                exportFile(entry)
                break
            case "page":
                await exportPage(entry)
                break
            case "app":
                exportApp(entry)
                break
            case "sitemap":
                exportSitemap(entry)
                break
            default:
                assert.noMissingCases(entry)
        }
    }

    return

    // Static files
    function exportFile(s: FileEntry): unit {
        const srcFile = path.join(sf.topDir, s.srcFile)
        const dstFile = path.join(outDir, s.filePath)
        const dstDir = path.dirname(dstFile)
        fs.mkdirSync(dstDir, { recursive: true })
        fs.copyFileSync(srcFile, dstFile)
        console.log("Copied", srcFile, "-> ", dstFile)
    }

    // Rendered Pages
    async function exportPage(p: PageEntry): Promise<unit> {
        const srcFile = path.join(sf.topDir, p.srcFile)
        const dstFile = path.join(outDir, p.filePath)
        const dstDir = path.dirname(dstFile)

        const importUrl = new URL(url.pathToFileURL(srcFile))
        const pageModule = (await import(importUrl.toString())).default as PageModule

        if (!(pageModule && typeof pageModule === "object")) {
            console.error(`Failed to import page (${importUrl.pathname})`)
            return
        }

        if ("page" in pageModule && pageModule.page) {
            const page = pageModule.page()
            const ctx: PageHtmlCtx = {
                srcFile: p.srcFile,
                topDir: sf.topDir,
                fileMap: sf.fileMap,
                pageMap: sf.pageMap,
                appDefns: sf.appDefnMap,
                appInstances: sf.appInstMap,
                numApps: 0
            }

            const opts: PageHtmlOptions = {
                // importAppScripts: true,
                // importReloadScript: false,
            }

            const lines = pageToHtml(ctx, opts, page)
            const dstContents = lines.join("\n")
            fs.mkdirSync(dstDir, { recursive: true })
            fs.writeFileSync(dstFile, dstContents)
        }
        else {
            console.error("Failed to render page:", p.srcFile)
        }
    }

    function exportApp(appPub: AppEntry): unit {

        const appInstanceName = appPub.instanceName
        const appInstMap = sf.appInstMap
        const appDefnMap = sf.appDefnMap
        const topDir = sf.topDir
        const srcFileMap = sf.fileMap
        const urlPath = appPub.urlPath

        console.log("App2", urlPath)

        // TODO ? Do we want to load apps dynamically, much like the pages ?
        // TODO ? Check the "fnName" actually exists in the "fileName" module ?

        let appInstEntry = appInstMap.get(appInstanceName)
        assert.isTrue(appInstEntry !== undefined)

        const { defnName, args } = appInstEntry
        const appDefnEntry = appDefnMap.get(defnName)
        assert.isTrue(appDefnEntry !== undefined)
        const { fileName, fnName } = appDefnEntry
        const fullFileName = path.join(outDir, fileName)

        const cmdLine: CmdLine = parseCmdLine(args)

        function mod(module: string): string {
            // const srcFile = path.join(topDir, module)
            const srcFile = module
            const fileEntry = srcFileMap.get(srcFile)
            if (fileEntry !== undefined) {
                return JSON.stringify(fileEntry[0].urlPath)
            }
            assert.unreachable()
        }

        const dstContents = [
            "<!DOCTYPE html>",
            "<html>",
            "<head>",
            "<meta charset=\"utf-8\">",
            "<link rel='icon' href='data:,'>",
            "<title>",
            `LOCAL App2 (${appInstanceName} / ${defnName})`,
            "</title>",
            "<style>",
            "html { box-sizing: border-box; }",
            "*, *:before, *:after { box-sizing: inherit; }",
            "body { margin: 0; width: 100vw; height: 100vh; font-family: sans-serif; }",
            "</style>",
            "</head>",
            "<body id=body>",
            "<div id=topDiv></div>",
            "<script type='module'>",
            "",
            `  import { setIo } from ${mod("/ts/gen/io/io.js")}`,
            `  import { mkIoBrowser } from ${mod("/ts/gen/io/io-browser.js")}`,
            `  setIo(mkIoBrowser(new URL("/", window.location.href)))`,
            "",
            "</script>",
            // setIo needs to be run before any code calls getIo.
            // Splitting the the script-elements helps.
            // TODO stop using global Io.
            "<script type='module'>",
            "",
            `  import { initApp } from ${mod("/ts/gen/ui/browser.js")}`,
            `  import { ${fnName} as app } from ${mod(fileName)}`,
            `  initApp(app, ${JSON.stringify(args)})`,
            "",
            "</script>",
            "</body>",
            "</html>",
        ].join("\n")

        try {
            // TODO ? Don't use path.join here, use "new URL" and urlPathToFile. ?
            const dstFile = path.join(outDir, urlPath)
            fs.mkdirSync(path.dirname(dstFile), { recursive: true })
            fs.writeFileSync(dstFile, dstContents)
        }
        catch (exc) {
            console.error(`Write failed: ${exc}`)
        }
    }

    function exportSitemap(entry: SiteMapEntry): unit {
        const dstFile = path.join(outDir, entry.filePath)
        fs.mkdirSync(path.dirname(dstFile), { recursive: true })
        if (sitemapContents === undefined) {
            const smLines = htmlSiteMap2(sf)
            sitemapContents = smLines.join("\n")
        }
        fs.writeFileSync(dstFile, sitemapContents)
    }

}

