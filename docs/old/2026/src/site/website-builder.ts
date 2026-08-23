import * as http from "node:http"
import * as path from "path"

import { unit } from "../utils/unit.js"
import { url_resolveDir, url_resolveFile } from "../io/io.js"
import { assert } from "../utils/assert.js"
import { CmdLine, parseCmdLine } from "../utils/cmdline.js"
import { findFiles } from "../utils/find-files.js"

export type WebsiteEntry =
    | { tag: "Static", urlPath: string, fileDir: string, fileExtn: string, mime: string }
    | { tag: "Render", urlPath: string, fileDir: string }
    | { tag: "AppDefine", appDefnName: string, appFilename: string, appFnName: string }
    | { tag: "AppInstantiate", appInstanceName: string, appDefnName: string, args: string[] }
    | { tag: "AppPublish", urlPath: string, appInstanceName: string }
    | { tag: "SiteMap", urlPath: string }
    | { tag: "Watch", fileDir: string }

export type WebsiteDefn = WebsiteEntry[]
export type SiteDefn = WebsiteDefn

export type WebsiteBuilder = {
    staticFiles(urlPath: string, fileDir: string, fileExtn: string, mime: string): unit
    renderPages(urlPath: string, fileDir: string): Promise<unit>

    appDefine(appDefnName: string, appFilename: string, appFnName: string): unit
    appInstantiate(appInstanceName: string, appDefnName: string, args: string[]): unit
    appPublish(urlPath: string, appInstanceName: string): unit

    sitemap(urlPath: string): unit

    watch(fileDir: string): unit
}


export type RequestHandler = (request: http.IncomingMessage, response: http.ServerResponse) => Promise<unit>

// App{Defns,Instances} map from the {defn,instance}Name.
export type AppDefns = Map<string, { defnName: string, fileName: string, fnName: string }>
export type AppInstances = Map<string, { instanceName: string, defnName: string, args: string[] }>

// urlPath and filePath differ only in encoding.
// urlPath can be compared with incomming http requests,
// filePath can be used to write to the filesystem (when appended to outDir).
export type BaseEntry = { urlPath: string, filePath: string }

export type FileEntry = BaseEntry & { tag: "file", srcFile: string, mime: string }
export type PageEntry = BaseEntry & { tag: "page", srcFile: string }
export type AppEntry = BaseEntry & { tag: "app", instanceName: string }
export type SiteMapEntry = BaseEntry & { tag: "sitemap" }

export type UrlMapEntry =
    | FileEntry
    | PageEntry
    | AppEntry
    | SiteMapEntry


// {File,Page}Map maps from source-files.
// The relative location of files can be different in source and destination hierarchies,
//   (depending on how the user defines a site).
// We need the ability to go from a file's source location to its destination location.
export type FileMap = Map<string, FileEntry[]>
export type PageMap = Map<string, PageEntry[]>
// export type AppMap = Map<string, AppEntry>

// UrlMap maps from destination urls.
export type UrlMap = Map<string, UrlMapEntry>


export type SiteEntryFiles = {
    entry: WebsiteEntry
    urlMap: UrlMap
}

export type SiteDefnFiles = {
    topDir: string

    entries: SiteEntryFiles[]

    urlMap: UrlMap

    appDefnMap: AppDefns
    appInstMap: AppInstances

    fileMap: FileMap
    pageMap: PageMap
    // appMap: AppMap

    sitemap: string[]
    watch: string[]
}


export function siteFiles(topDir: string, defn: WebsiteDefn): SiteDefnFiles {

    const siteFiles: SiteDefnFiles = {
        topDir,

        entries: [],

        urlMap: new Map,

        appDefnMap: new Map,
        appInstMap: new Map,

        fileMap: new Map,
        pageMap: new Map,
        // appMap: new Map,

        sitemap: [],
        watch: [],
    }

    function addUrlEntry(urlPath: string, entry: UrlMapEntry): unit {
        if (siteFiles.urlMap.has(urlPath)) {
            console.error(`Warning: Ignoring redefinition of: ${urlPath}`)
        }
        else {
            siteFiles.urlMap.set(urlPath, entry)
        }
    }

    for (const entry of defn) {
        const sdf: SiteEntryFiles = { entry: entry, urlMap: new Map }
        siteFiles.entries.push(sdf)
        switch (entry.tag) {
            case "Static": {
                const { fileDir, urlPath, fileExtn, mime } = entry

                const ctx = {
                    srcDir: fileDir,
                    dstDir: urlPath,
                    urlDir: url_resolveDir("http://.", urlPath)
                }
                const findDir = path.join(topDir, ctx.srcDir)
                findFiles(findDir, fileExtn, ctx, {
                    dir({ srcDir, dstDir, urlDir: dstUrl }, dirName) {
                        return {
                            srcDir: path.join(srcDir, dirName),
                            dstDir: path.join(dstDir, dirName),
                            urlDir: url_resolveDir(dstUrl, dirName)
                        }
                    },
                    file({ srcDir, dstDir, urlDir: urlDir }, fileName) {
                        const srcFile = path.join(srcDir, fileName)
                        const dstFile = path.join(dstDir, fileName)
                        const urlFile = url_resolveFile(urlDir, fileName).pathname

                        const fileEntry: FileEntry = { tag: "file", urlPath: urlFile, srcFile, filePath: dstFile, mime }
                        sdf.urlMap.set(urlFile, fileEntry)
                        addUrlEntry(urlFile, fileEntry)

                        const entries = siteFiles.fileMap.get(srcFile) ?? []
                        entries.push(fileEntry)
                        siteFiles.fileMap.set(srcFile, entries)
                    }
                })
                break
            }
            case "Render": {
                const { urlPath, fileDir } = entry

                const ctx = {
                    srcDir: fileDir,
                    dstDir: "",
                    urlDir: url_resolveDir("http://.", urlPath)
                }
                const findDir = path.join(topDir, ctx.srcDir)
                findFiles(findDir, ".js", ctx, {
                    dir({ srcDir, dstDir, urlDir }, dirName) {
                        return {
                            srcDir: path.join(srcDir, dirName),
                            dstDir: path.join(dstDir, dirName),
                            urlDir: url_resolveDir(urlDir, dirName)
                        }
                    },
                    file({ srcDir, dstDir, urlDir }, fileName) {
                        const srcFile = path.join(srcDir, fileName)
                        const htmlFile = `${path.parse(fileName).name}.html`
                        const filePath = path.join(dstDir, htmlFile)
                        const urlPath = url_resolveFile(urlDir, htmlFile).pathname

                        const entry: PageEntry = { tag: "page", urlPath, filePath, srcFile }

                        sdf.urlMap.set(urlPath, entry)
                        addUrlEntry(urlPath, entry)

                        const entries = siteFiles.pageMap.get(srcFile) ?? []
                        entries.push(entry)
                        siteFiles.pageMap.set(srcFile, entries)


                    },
                })
                break
            }
            case "AppDefine":
                siteFiles.appDefnMap.set(entry.appDefnName, { defnName: entry.appDefnName, fileName: entry.appFilename, fnName: entry.appFnName })
                break
            case "AppInstantiate":
                siteFiles.appInstMap.set(entry.appInstanceName, { instanceName: entry.appInstanceName, defnName: entry.appDefnName, args: entry.args })
                break
            case "AppPublish": {
                const urlFile = url_resolveFile("http://.", entry.urlPath).pathname
                const dstFile = path.join(topDir, entry.urlPath)
                const appEntry: AppEntry = { tag: "app", urlPath: urlFile, filePath: dstFile, instanceName: entry.appInstanceName }
                sdf.urlMap.set(urlFile, appEntry)
                addUrlEntry(urlFile, appEntry)

                break
            }
            case "SiteMap": {
                siteFiles.sitemap.push(entry.urlPath)
                const urlFile = url_resolveFile("http://.", entry.urlPath).pathname
                const sitemapEntry: SiteMapEntry = { urlPath: urlFile, filePath: urlFile, tag: "sitemap" }
                siteFiles.urlMap.set(urlFile, sitemapEntry)
                sdf.urlMap.set(urlFile, sitemapEntry)
                break
            }
            case "Watch":
                siteFiles.watch.push(entry.fileDir)
                break
            default:
                assert.noMissingCases(entry)
        }
    }


    return siteFiles

}

