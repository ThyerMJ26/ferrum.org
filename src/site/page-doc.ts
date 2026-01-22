

import { assert } from "../utils/assert.js"
import { unit } from "../utils/unit.js"
import { UiText } from "../ui/text.js"

export type Page = {
    head: PageAttr
    body: PageDoc
}

export type PageAttr = {
    title: UiText
}

export type PageDoc = Doc

export type Doc =
    | UiText
    | Doc[]
    | { tag: "section", title: UiText, docs: Doc[] }
    | { tag: "para", sentences: Doc[] }
    | { tag: "list", items: Doc[] }
    | { tag: "defns", defns: Defn[] }
    // | { tag: "title", title: UiText }
    | { tag: "app-publish", instance: string }
    | { tag: "link-url", url: string, text?: UiText }
    | { tag: "link-file", file: string, text?: UiText }
    | { tag: "link-page", page: string, text?: UiText, desc?: Doc }


export type DocWalker = (doc: Doc) => unit

export function docTour(doc: Doc, walk: DocWalker): unit {
    if (doc instanceof Array) {
        doc.forEach(d => walk(d))
    }
    if (typeof doc === "object" && "tag" in doc) {
        switch (doc.tag) {
            case "section": doc.docs.forEach(d => walk(d)); break
            case "para": doc.sentences.forEach(d => walk(d)); break
            case "list": doc.items.forEach(d => walk(d)); break
            case "defns": doc.defns.forEach(({ defn }) => walk(defn)); break
            case "app-publish":
            case "link-url":
            case "link-file":
            case "link-page":
                break
            default:
                assert.noMissingCases(doc)
        }
    }
}

export function docTourRecursive(doc: Doc, walk: DocWalker): unit {
    docTour(doc, (d => {
        walk(d)
        docTourRecursive(d, walk)
    }))
}

export type Defn = {
    term: UiText
    defn: Doc
}

export type Defn2 = [UiText, Doc]


export type DocMaker = {
    // title(text: UiText): Doc
    section(title: UiText, docs: Doc[]): Doc
    para(para: Doc[]): Doc
    list(items: Doc[]): Doc
    defns(defns: Defn[]): Doc
    linkUrl(link: string, text?: UiText): Doc
    linkFile(file: string, text?: UiText): Doc
    linkPage(page: string, text?: UiText, desc?: Doc): Doc
    appPublish(instance: string): Doc
}


export const mkDoc: DocMaker = {
    // title: (title: UiText) => ({ tag: "title", title }),
    section: (title: UiText, docs: Doc[]) => ({ tag: "section", title, docs}),
    para: (para: Doc[]) => ({ tag: "para", sentences: para }),
    list: (items: Doc[]) => ({ tag: "list", items }),
    defns: (defns: Defn[]) => ({ tag: "defns", defns }),
    appPublish: (instance: string) => ({ tag: "app-publish", instance }),
    linkUrl: (url: string, text?: UiText) => ({ tag: "link-url", text, url }),
    linkFile: (file: string, text?: UiText) => ({ tag: "link-file", text, file }),
    linkPage: (page: string, text?: UiText, desc?: Doc) => ({ tag: "link-page", text, page, desc }),
}


// TODO ?
export type DocThunk = Doc | (() => unit)

export type DocBuilder = {
    add(doc: Doc): unit

    section(title: UiText, ...docs: Doc[]): Doc

    para(...para: Doc[]): Doc
    list(elems: Doc[]): Doc
    defns(defns: Defn2[]): Doc

    link_file(file: string, text?: UiText): Doc
    link_page(page: string, text?: UiText, desc?: Doc): Doc
    link_url(url: string, text?: UiText): Doc

    appPublish(appInstanceName: string): Doc
}

export type PageBuilder =
    & DocBuilder
    & {
        title(text: UiText): unit
    }

export function docBuild(cb: (b: DocBuilder) => unit): Doc {

    const roots: Set<Doc> = new Set

    function add(doc: Doc): Doc {
        roots.add(doc)
        return doc
    }

    const b: DocBuilder = {
        add: d => { add(d) },
        section: (title: UiText, ...docs: Doc[]) => {
            return add(mkDoc.section(title, docs))
        },
        para: (...para: Doc[]): Doc => {
            return add(mkDoc.para(para))
        },
        list: (elems: Doc[]): Doc => {
            return add(mkDoc.list(elems))
        },
        defns: (ds): Doc => {
            const ds1: Defn[] = ds.map(([term, defn]) => ({ term, defn }))
            return add(mkDoc.defns(ds1))
        },
        link_file(page, text): Doc {
            return add(mkDoc.linkFile(page, text))
        },
        link_page(page, text, desc): Doc {
            return add(mkDoc.linkPage(page, text, desc))
        },
        link_url(page, text): Doc {
            return add(mkDoc.linkUrl(page, text))
        },
        appPublish(appInstanceName): Doc {
            return add(mkDoc.appPublish(appInstanceName))
        },
    }

    cb(b)

    // Every Doc created by this builder is tentatively assumed to not be part of another.
    // After all the Docs have been created, we remove from "roots" any docs that are part of another.
    // Whatever is left, forms the final document.
    // This provides a convenient way to use this same builder in both an imperative and functional way.
    for (const r of roots) {
        docTourRecursive(r, d => {
            roots.delete(d)
        })
    }


    return [...roots]
}





export function pageBuild(cb: (b: PageBuilder) => unit): Page {

    let title: UiText = ""

    const doc = docBuild(db => {
        const pb: PageBuilder = {
            ...db,
            title: (text: UiText) => { title = text }
        }
        cb(pb)
    })

    const page: Page = { head: { title }, body: doc }

    return page
}

