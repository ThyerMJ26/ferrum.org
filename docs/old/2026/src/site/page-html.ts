import * as path from "node:path"

import { assert } from "../utils/assert.js"
import { unit } from "../utils/unit.js"
import { Doc, Page } from "./page-doc.js"
import { AppDefns, AppInstances, FileMap, PageMap } from "./website-builder.js"
import { UiColor, UiStyle, UiText, uiTextToStr } from "../ui/text.js"
import { cssDefn, CssDefn, CssName, CssStyle, escapeText, HtmlAttrs, htmlBuild } from "../ui/html.js"


export function docToHtml(ctx: PageHtmlCtx, styleLines: string[], bodyLines: string[], doc: Doc): unit {

    function mod(module: string): string {
        // const srcFile = path.join(ctx.topDir, module)
        const srcFile = module
        const fileEntry = ctx.fileMap.get(srcFile)
        if (fileEntry !== undefined) {
            return JSON.stringify(fileEntry[0].urlPath)
        }
        else {
            assert.unreachable()
        }
    }


    htmlBuild(styleLines, bodyLines, (s, h) => {

        const section = s.cssStyle({
            display: "flex",
            flexDirection: "column",
            marginBlockEnd: "1em",
            maxWidth: "100ch",
            marginLeft: "calc(50% - 50ch)"
        })
        const paragraph = s.cssStyle({
            display: "flex",
            flexDirection: "column",
            marginBlockEnd: "1em",
            maxWidth: "100ch",
            marginLeft: "calc(50% - 50ch)"
        })
        const firstSentence = s.cssStyle({
            marginLeft: "4ch",
            textIndent: "-4ch"
        })
        const subsequentSentence = s.cssStyle({
            marginLeft: "4ch",
            textIndent: "-2ch"
        })
        const linkDescription = s.cssStyle({
            textIndent: "4ch"
        })
        const listItem = s.cssStyle({
            textIndent: "0ch"
        })
        const list = s.cssStyle({
            maxWidth: "100ch",
            marginTop: "1ch",
            // marginLeft: "calc(50% - 50ch)",
            textIndent: "0ch",
            // paddingLeft: "2ch",
        })
        const textCol = s.cssStyle({
            maxWidth: "100ch",
            marginLeft: "calc(50% - 50ch)",
            // maxWidth: "100rem",
            // marginLeft: "calc(50% - 50rem)",
        })


        d2h(doc, true)
        return

        function d2h(doc: Doc, top: boolean = false): unit {

            // const claas: HtmlAttrs = top ? { class: textCol }  : {}
            const claas = top ? textCol : "" as CssName


            if (typeof doc === "string") {
                bodyLines.push(escapeText(doc))
                return
            }
            if (doc instanceof Array) {
                for (const d of doc) {
                    d2h(d, top)
                }
                return
            }
            if ("tag" in doc) {
                switch (doc.tag) {
                    case "section":
                        h.elem("section", section, () => {
                            if (doc.title !== "") {
                                h.elem("h2", () => {
                                    h.text(doc.title)
                                })
                            }
                            d2h(doc.docs)
                        })
                        break
                    case "para":
                        if (doc.sentences.length === 0) return
                        const [fst, ...rst] = doc.sentences
                        h.elem("div", paragraph, () => {
                            h.elem("span", firstSentence, () => {
                                d2h(fst)
                            })
                            for (const r of rst) {
                                h.elem("span", subsequentSentence, () => {
                                    d2h(r)
                                })
                            }
                            h.elem("br")
                        })
                        break
                    case "list":
                        // h.elem("ul", claas, () => {
                        h.elem("ul", list, () => {
                            for (const item of doc.items) {
                                h.elem("li", listItem, () => {
                                    // h.elem("li", () => {
                                    d2h(item)
                                })
                            }
                        })
                        break
                    case "defns":
                        h.elem("dl", list, () => {
                            for (const defn of doc.defns) {
                                h.elem("dt", () => {
                                    d2h(defn.term)
                                })
                                h.elem("dd", () => {
                                    d2h(defn.defn)
                                })
                            }
                        })
                        break
                    case "app-publish":

                        ctx.numApps++
                        const topDivNum = ctx.numApps
                        // TODO ? Include the instance name in the topDivId ?
                        const topDivId = `topDiv-${topDivNum}`

                        const appInstance = ctx.appInstances.get(doc.instance)
                        assert.isTrue(appInstance !== undefined)
                        const appDefn = ctx.appDefns.get(appInstance.defnName)
                        assert.isTrue(appDefn !== undefined)

                        const q = JSON.stringify

                        const appLines = [
                            // `<div style="margin-left:calc(50% - 45vw);width:90vw;height:50vh;"><div id=${topDivId}></div></div>`,
                            // `<div style="margin-left:calc(50% - 50vw);width:100vw;height:50vh;padding:2ch;">`,
                            `<div style="margin-left:0; width:100%; height:50vh; padding:2ch;">`,
                            `<div id=${topDivId} style="margin: 2ch;">`,
                            `</div></div>`,
                            "<script type='module'>",
                            `  import { initApp2 } from ${mod("/ts/gen/ui/browser.js")}`,
                            `  import { ${appDefn.fnName} as app } from ${mod(appDefn.fileName)}`,
                            `  initApp2(${q(topDivId)}, ${q(doc.instance)}, app, ${q(appInstance.args)})`,
                            "</script>",
                            // "</div>",
                        ]

                        bodyLines.push(...appLines)
                        break

                    case "link-page": {

                        const claas: HtmlAttrs = top ? { class: textCol } : {}
                        const elem = top ? "div" : "span"

                        h.elem(elem, () => {

                            const srcFile = path.resolve(path.dirname(ctx.srcFile), doc.page)
                            const entry = ctx.pageMap.get(srcFile)
                            if (entry !== undefined) {
                                const href = entry[0].urlPath
                                // h.elem("a", { href, class: textCol }, () => {
                                h.elem("a", { href, ...claas }, () => {
                                    const text = doc.text ?? href
                                    // TODO ? Use the title from the page itself ?
                                    // TODO ? We'll need to generate (or have generated) each page linked to so as to render this page.
                                    // TODO ? Generating precedes rendering, so this wouldn't be potentially cyclic.
                                    // const text = doc.text ?? title
                                    h.text(text)
                                })
                            }
                            else {
                                h.text(`(Bad Page Link: ${JSON.stringify(srcFile)})`)
                            }

                            const desc = doc.desc
                            if (desc !== undefined) {
                                h.elem("span", claas, () => {
                                    h.elem("div", [linkDescription, textCol], () => {
                                        d2h(desc)
                                    })
                                })
                            }

                        })

                        break
                    }
                    case "link-file":
                        const srcFile = path.resolve(path.dirname(ctx.srcFile), doc.file)

                        const entry = ctx.fileMap.get(srcFile)
                        if (entry !== undefined) {
                            const href = entry[0].urlPath
                            h.elem("a", { href }, () => {
                                const text = doc.text ?? href
                                h.text(text)
                            })
                        }
                        else {
                            h.text(`(Bad Link: ${JSON.stringify(doc)})`)
                        }
                        break
                        break
                    case "link-url":
                        const href = doc.url
                        h.elem("a", { href }, () => {
                            h.text(doc.text ?? href)
                        })
                        break
                    default:
                        assert.noMissingCases(doc)
                }
                return
            }

            // If we get this far, the only possibility left is that this is a UiText object.
            if ("items" in doc) {
                let clss = ""
                if ("style" in doc) {
                    assert.isTrue(typeof doc.style === "object", "TODO Handle UiStyleNum numbers")
                    const ts = s.textStyle(doc.style)
                    clss = ` class=${ts}`
                }
                bodyLines.push(`<span${clss}>`)
                if ("items" in doc) {
                    assert.isTrue(doc.items instanceof Array)
                    for (const item of doc.items) {
                        d2h(item)
                    }
                }
                bodyLines.push("</span>")
                return
            }
            else {
                // A UiText object with no items has nothing to render statically.
                // It might contain an "id" or "annot" field, but those are for use in dynamic situations.
            }


        }

    })

}



export type PageHtmlCtx = {
    srcFile: string // The file currently being rendered, needed for resolving relative page references.
    // TODO ? It might be simpler to include the whole of SiteFiles here, rather than repeat most of it anyway ?
    topDir: string,
    fileMap: FileMap,
    pageMap: PageMap,
    appDefns: AppDefns,
    appInstances: AppInstances
    numApps: number
}

export type PageHtmlOptions = {
    importReloadScript?: boolean
    importAppScripts?: boolean
}




export function pageToHtml(ctx: PageHtmlCtx, opts: PageHtmlOptions, page: Page): string[] {

    function mod(module: string): string {
        // const srcFile = path.join(ctx.topDir, module)
        // const fileEntry = ctx.srcFileMap.get(srcFile)
        const fileEntry = ctx.fileMap.get(module)
        if (fileEntry !== undefined) {
            return JSON.stringify(fileEntry[0].urlPath)
        }
        else {
            assert.unreachable()
        }
    }

    const styleLines: string[] = []
    const bodyLines: string[] = []

    docToHtml(ctx, styleLines, bodyLines, page.body)


    const lines: string[] = [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        '<meta charset="utf-8">',
        '<link rel="icon" href="data:,">',
        "<title>",
        uiTextToStr(page.head.title), // TODO html escapes
        "</title>",
        "<style>",
        "html { box-sizing: border-box; }",
        "*, *:before, *:after { box-sizing: inherit; }",
        // "body { font-family: sans-serif; max-width: 100ch; margin: auto; line-height: 1.5; }",
        // "body { margin: auto; width: 100vw; height: 100vh; font-family: sans-serif; max-width: 100ch; line-height: 1.5; }",
        "body { font-family: sans-serif; margin: auto; line-height: 1.5; }",
        // "h1 { margin-left: calc(50% - 50ch); max-width: 100ch; }",
        ...styleLines,
        "</style>",
        "</head>",
        "<body>",
        "<hr style='margin: 4ch'>"
    ]

    // By default, only include the app-scripts if there are apps within the page.
    if (opts.importAppScripts === true || opts.importAppScripts === undefined && ctx.numApps > 0) {
        lines.push(
            "<script type='module'>",
            `  import { setIo } from ${mod("/ts/gen/io/io.js")}`,
            `  import { mkIoBrowser } from ${mod("/ts/gen/io/io-browser.js")}`,
            `  setIo(mkIoBrowser(new URL('/', window.location.href)))`,
            "</script>",
        )
    }

    // By default, only include the reload-script if there are no apps within the page.
    //   Pages containing apps cannot be replaced in the same way, 
    //   as they contain <script> sections which won't get run.
    // To keep the page live, we need either:
    //   - something dumber, just reload the whole page, or
    //   - something smarter with special handling for the script sections.
    if (opts.importReloadScript === true || opts.importReloadScript === undefined && ctx.numApps === 0) {
        lines.push(
            `<script type="module">`,
            `import ${mod("/ts/gen/site/page-reload.js")}`,
            `</script>`
        )
    }

    if (typeof page.head.title === "string") {
        lines.push('<div style="margin-left: calc(50% - 50ch); width: 100ch;">')
        lines.push("<h1>")
        lines.push(page.head.title)
        lines.push("</h1>")
        lines.push("</div>")
    }

    lines.push(...bodyLines)
    // lines.push("<p style='height: 2ch'><hr><p>")
    lines.push("<hr style='margin: 4ch'>")

    return lines
}


