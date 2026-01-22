import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"
import { UiColor, UiStyle, UiText, uiTextToStr } from "./text.js";

//#region HTML

export type HtmlTag = keyof HTMLElementTagNameMap

type TagType = "void" | "raw" | "escape" | "normal"

const abnormalTagTypes = {
    area: "void",
    base: "void",
    br: "void",
    col: "void",
    embed: "void",
    hr: "void",
    img: "void",
    input: "void",
    link: "void",
    meta: "void",
    source: "void",
    track: "void",
    wbr: "void",
    script: "raw",
    style: "raw",
    textarea: "escape",
    title: "escape",
} satisfies { [_ in HtmlTag]?: TagType }
type AbnormalTagTypes = typeof abnormalTagTypes
type AbnormalTag = keyof AbnormalTagTypes

function isTagAbnormal(tag: HtmlTag): tag is AbnormalTag {
    return tag in abnormalTagTypes
}

function typeOfTag(tag: HtmlTag): TagType {
    if (isTagAbnormal(tag)) {
        return abnormalTagTypes[tag]
    }
    return "normal"
}


type TagOf<T extends TagType> = keyof ({ [k in keyof AbnormalTagTypes as AbnormalTagTypes[k] extends T ? k : never]: T })

export type VoidTag = TagOf<"void">
export type RawTag = TagOf<"raw">
export type EscapeTag = TagOf<"escape">
export type NormalTag = Exclude<HtmlTag, keyof AbnormalTagTypes>


// It's tempting to use
//    type HtmlAttrs = { [_ in HtmlTag]: string; }
// or even
//    type HtmlAttrs<T extends keyof HTMLElementTagNameMap> = { [K in keyof HTMLElementTagNameMap]: HTMLElementTagNameMap[T][K]; }
// This would provide a form of name-checking for valid HTML attributes.
// The camelCase/kebab-case difference between properties and attributes can be handled,
//   but there are a number of complications:
//     - there are exceptions to the naming conversion (class/className),
//     - the types of properties and attributes can differ (boolean/id properties),
//     - properties and attributes can have different behaviours (<input checked>).
export type HtmlAttrs = { [_: string]: string; }

// Server-side, this is pure JSON data.
// Client-side, it can contain HTMLElements pointing into the DOM.
export type HtmlT<T> =
    | [VoidTag, HtmlAttrs]
    | [RawTag, HtmlAttrs, string]
    | [EscapeTag, HtmlAttrs, string]
    | [NormalTag, HtmlAttrs, ...(T | HtmlT<T> | string)[]];

type Html = HtmlT<never>


//#endregion



//#region CSS


export type CssName = string & { __brand_CssName: never }

export type CssStyle = { [K in keyof CSSStyleDeclaration]?: CSSStyleDeclaration[K] extends string ? CSSStyleDeclaration[K] : never }
export type CssDefn = { name: CssName, style: CssStyle }


export function cssDefn(name: string, style: CssStyle): CssDefn {
    return {
        name: name as CssName,
        style
    }
}

//#endregion



//#region Rendering


export function escapeText(text: string, tt?: TagType): string {
    switch (tt) {
        case "void":
            assert.impossible()
        case "raw":
            // This is overly cautious, but should be fine in practice.
            assert.isTrue(text.search("</") === -1)
            return text
        case "escape":
        case "normal":
        case undefined:
            return text.replace(/[<>&]/g, (c) => {
                const c2 = {
                    "<": "&lt;",
                    ">": "&gt;",
                    "&": "&amp;",
                }[c]
                assert.isTrue(c2 !== undefined)
                return c2
            })
        default:
            assert.noMissingCases(tt)
    }
}

function escapeAttrs(attrs: HtmlAttrs): string {
    const aParts: string[] = []
    for (const [k, val] of Object.entries(attrs)) {
        const val2 = val.replace(/[\"\\\n]/g, v => {
            const v2 = {
                "\"": "&quot;",
                "\\": "&Backslash;",
                "\n": "&NewLine;",
            }[v]
            assert.isTrue(v2 !== undefined)
            return v2
        })
        aParts.push(` ${k}="${val2}"`)
    }
    const aTxt = aParts.join("")
    return aTxt
}

export function htmlRender(html: Html): string[] {
    const lines: string[] = []
    function hr(html: Html): unit {
        const [tag, attrs, ...contents] = html
        const aTxt = escapeAttrs(attrs)
        const tt = typeOfTag(tag)
        switch (tt) {
            case "void":
                assert.isTrue(contents.length === 0)
                lines.push(`<${tag}${aTxt}>`)
                break
            case "raw":
            case "escape":
            case "normal":
            case undefined:
                lines.push(`<${tag}${aTxt}>`)
                for (const content of contents) {
                    switch (typeof content) {
                        case "string":
                            lines.push(escapeText(content, tt))
                            break
                        case "object":
                            hr(content)
                            break
                        default:
                            assert.noMissingCases(content)
                    }
                }
                lines.push(`</${tag}>`)
                break
            default:
                assert.noMissingCases(tt)
        }
    }

    hr(html)

    return lines
}

//#endregion



//#region Building


export type StyleBuilder = {
    textStyle(style: UiStyle, nameHint?: string): CssName
    cssStyle(style: CssStyle, nameHint?: string): CssName
}

export type HtmlBuilder = {
    text(text: UiText): unit

    elem(tag: HtmlTag): unit
    elem(tag: HtmlTag, cb: () => unit): unit
    elem(tag: HtmlTag, attrs: HtmlAttrs | CssName | CssName[]): unit
    elem(tag: HtmlTag, attrs: HtmlAttrs | CssName | CssName[], cb: () => unit): unit

    // TODO ? Allow a chunk of HTML to be added in one go ?
    // html(h: Html): unit
}



// Ideally this would ensure all the colour names below are correct.
// Unfortuantely it evaluates to "string"
type CssColor = CSSStyleDeclaration["color"]

function bgColor(color: UiColor): CssColor {
    switch (color) {
        case "Black": return "lightgray"
        case "Red": return "pink"
        case "Green": return "lightgreen"
        case "Yellow": return "yellow"
        case "Blue": return "lightblue"
        case "Magenta": return "magenta"
        case "Cyan": return "lightcyan"
        case "White": return "white"
        default:
            assert.noMissingCases(color)
    }
}

function fgColor(color: UiColor): CssColor {
    switch (color) {
        case "Black": return "black"
        case "Red": return "red"
        case "Green": return "green"
        // case "Yellow": return "brown"
        case "Yellow": return "orange"
        // case "Yellow": return "#C09000"
        case "Blue": return "blue"
        case "Magenta": return "magenta"
        case "Cyan": return "cyan"
        case "White": return "darkgray"
        default:
            assert.noMissingCases(color)
    }
}


type StyleKey = string
type Style = {
    key: StyleKey
    uiStyle: UiStyle
    cssName: string
    cssDefn: string
}
type StyleMap = Map<StyleKey, Style>

// TODO Share this with browser.ts.
// TODO It is (or was) a copy,
// TODO   it risks getting out of sync.
export function mkUiStyle(styleMap: StyleMap, s: UiStyle, nameHint: string | null): Style {
    const key = JSON.stringify(s)

    if (styleMap.has(key)) {
        return styleMap.get(key)!
    }

    let style = ""

    // let family = "MyMono-regular"
    // let family = "sans-serif"
    let family = "monospace"
    // let family = "monospace, monospace"
    style += `font-size: 1rem;`

    // Using font-weight like this works: 
    //   -         with the default sans-serif font in Firefox and Epiphany
    //   - but not with the default sans-serif font in Chromium.
    // It seems there's no weight lighter than 400 available.
    // ( monospace seems to have a light-variant in Firefox, Chromium and Epiphany )
    // switch (s.weight) {
    //     case -1: style += "font-weight: 100;"; break
    //     case 0: style += "font-weight: 400;"; break
    //     case 1: style += "font-weight: 700;"; break
    // }
    // // Using an explicit font seems more reliable, but requires using external fonts
    // switch (s.weight) {
    //     case -1: family = "WuiFont-faint"; break
    //     case 0: family = "WuiFont-regular"; break
    //     case 1: family = "WuiFont-bold"; break
    // }
    // Alternatively, use opacity to achieve faintness (so as not to require external fonts)
    //   This also makes the strike-through appear faint, which looks better / more consistent.
    switch (s.weight) {
        case -1: style += "opacity: 0.5;"; break
        case 0: style += "font-weight: normal;"; break
        case 1: style += "font-weight: bold;"; break
    }

    if (family !== undefined) {
        style += `font-family: ${family};`
    }

    if (s.fg !== undefined) {
        style += `color: ${fgColor(s.fg)};`
    }
    if (s.bg !== undefined) {
        style += `background-color: ${bgColor(s.bg)};`
    }
    if (s.italic === 1) {
        style += "font-style: italic;"
    }
    let decor = []
    if (s.strike === 1) {
        decor.push("line-through")
    }
    if (s.under ?? 0 > 1) {
        decor.push("underline")
    }
    if (decor.length !== 0) {
        style += `text-decoration-line: ${decor.join(" ")}`
    }
    // if (ts.under === 2) {
    //     style += "text-decoration-style: double;"
    // }

    const num = styleMap.size
    const nameHint2 = nameHint === null ? "" : `_${nameHint}`

    const cssName = `css${num}${nameHint2}`
    const cssDefn = style
    // const cssDefn = [
    //     `{ // ${key}`,
    //     `}`,
    // ].map(a => `  ${a}\n`).join("")


    const pageStyle: Style = {
        uiStyle: s,
        key,
        cssName,
        cssDefn,
    }

    styleMap.set(key, pageStyle)

    return pageStyle
}

export function camelCase_to_kebabCase(prop: string): string {
    return prop.replace(/([A-Z])/g, '-$1').toLowerCase();
}

export function htmlBuild(styleLines: string[], htmlLines: string[], cb: (sb: StyleBuilder, hb: HtmlBuilder) => unit): unit {

    function textToHtml(text: UiText): unit {
        if (typeof text === "string") {
            htmlLines.push(escapeText(text))
        }
        else {
            if ("items" in text && text.items !== undefined) {
                if ("style" in text) {
                    assert.isTrue(typeof text.style === "object", "TODO Handle UiStyleNum numbers")
                    // const ps = mkUiStyle(styles, text.style, null)
                    const ts = sb.textStyle(text.style)
                    htmlLines.push(`<span class=${ts}>`)
                    assert.isTrue(text.items instanceof Array)
                }
                for (const item of text.items) {
                    textToHtml(item)
                }
                if ("style" in text) {
                    htmlLines.push("</span>")
                }
            }
        }

    }

    function elemToHtml(tag: HtmlTag, attrs: HtmlAttrs, cb?: () => unit): unit {
        if (typeOfTag(tag) === "void") {
            htmlLines.push(`<${tag}${escapeAttrs(attrs)}>`)
        }
        else {
            htmlLines.push(`<${tag}${escapeAttrs(attrs)}>`)
            cb?.apply(null)
            htmlLines.push(`</${tag}>`)
        }
    }

    function elemToHtml2(tag: HtmlTag): unit
    function elemToHtml2(tag: HtmlTag, cb: () => unit): unit
    function elemToHtml2(tag: HtmlTag, attrs: HtmlAttrs | string): unit
    function elemToHtml2(tag: HtmlTag, attrs: HtmlAttrs | string, cb: () => unit): unit
    function elemToHtml2(tag: HtmlTag, ...args: any[]): unit {
        let attrs: HtmlAttrs | undefined
        let cb: (() => unit) | undefined
        if (args.length > 0 && (typeof args[0] === "string" || args[0] instanceof Array)) {
            let arg: string | string[] = args.shift()
            if (arg instanceof Array) {
                assert.isTrue(arg.every(a => typeof a === "string"))
                arg = arg.join(" ")
            }
            attrs = { class: arg }
        }
        if (args.length > 0 && !(args[0] instanceof Function)) {
            attrs = args.shift()
        }
        if (args.length > 0 && args[0] instanceof Function) {
            cb = args.shift()
        }
        assert.isTrue(args.length === 0)
        elemToHtml(tag, attrs ?? {}, cb)
    }

    const styleMap: StyleMap = new Map

    function cssStyle(s: CssStyle): CssName {
        const name = `s${styleLines.length}`
        const defns = Object.entries(s).map(([k, v]) => `${camelCase_to_kebabCase(k)}: ${v};`)
        styleLines.push(`.${name} { ${defns.join(" ")} }`)
        return name as CssName
    }
    function textStyle(s: UiStyle, nameHint?: string): CssName {
        const ps = mkUiStyle(styleMap, s, nameHint ?? null)
        styleLines.push(`.${ps.cssName} { ${ps.cssDefn} }`)
        return ps.cssName as CssName
    }

    const hb: HtmlBuilder = {
        text: textToHtml,
        elem: elemToHtml2,
    }

    const sb: StyleBuilder = {
        cssStyle,
        textStyle,
    }

    cb(sb, hb)

}

//#endregion
