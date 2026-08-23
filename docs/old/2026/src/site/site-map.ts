import * as fs from "node:fs"
import * as path from "node:path";
import * as url from "node:url";

import { assert } from "../utils/assert.js"
import { SiteDefnFiles, WebsiteEntry } from "./website-builder.js"


export function htmlSiteMap(sf: SiteDefnFiles): string[] {
    const lines: string[] = []

    for (const [u, entry] of sf.urlMap) {
        switch (entry.tag) {
            case "file":
                lines.push(`File: <a href="${entry.urlPath}">${entry.srcFile}</a>`)
                break
            case "page":
                lines.push(`Page: <a href="${entry.urlPath}">${entry.srcFile}</a>`)
                break
            case "app":
                lines.push(`App2: <a href="${entry.urlPath}">${entry.instanceName}</a>`)
                break
            case "sitemap":
                lines.push(`SiteMap: <a href="${entry.urlPath}">SiteMap</a>`)
                break
            default:
                assert.noMissingCases(entry)
        }
    }

    const lines2 = lines.map(l => l + "<br>\n")

    return lines2
}

const defaultOpen: WebsiteEntry["tag"][] = ["Render", "AppPublish"]

export function htmlSiteMap2(sf: SiteDefnFiles): string[] {


    const initLines = [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        "<meta charset=\"utf-8\">",
        "<link rel='icon' href='data:,'>",
        "<title>",
        `Site Map`,
        "</title>",
        "</head>",
        "<body>",
    ]

    const smLines: string[] = []
    for (const { entry: siteEntry, urlMap } of sf.entries) {
        const open = defaultOpen.indexOf(siteEntry.tag) === -1 ? "" : " open"
        smLines.push(`<details${open}><summary>${JSON.stringify(siteEntry)}</summary>`)
        for (const [u, entry] of urlMap) {
            switch (entry.tag) {
                case "file":
                    smLines.push(`File: <a href="${entry.urlPath}">${entry.srcFile}</a>`)
                    break
                case "page":
                    smLines.push(`Page: <a href="${entry.urlPath}">${entry.srcFile}</a>`)
                    break
                case "app":
                    smLines.push(`App2: <a href="${entry.urlPath}">${entry.instanceName}</a>`)
                    break
                case "sitemap":
                    smLines.push(`SiteMap: <a href="${entry.urlPath}">SiteMap</a>`)
                    break
                default:
                    assert.noMissingCases(entry)
            }
        }
        smLines.push("</details>")
    }

    const result = [
        ...initLines,
        ...smLines.map(l => l + "<br>")
    ]

    return result

    // return smLines
}

