import { assert } from "../utils/assert.js";
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
};
function isTagAbnormal(tag) {
    return tag in abnormalTagTypes;
}
function typeOfTag(tag) {
    if (isTagAbnormal(tag)) {
        return abnormalTagTypes[tag];
    }
    return "normal";
}
export function cssDefn(name, style) {
    return {
        name: name,
        style
    };
}
//#endregion
//#region Rendering
export function escapeText(text, tt) {
    switch (tt) {
        case "void":
            assert.impossible();
        case "raw":
            // This is overly cautious, but should be fine in practice.
            assert.isTrue(text.search("</") === -1);
            return text;
        case "escape":
        case "normal":
        case undefined:
            return text.replace(/[<>&]/g, (c) => {
                const c2 = {
                    "<": "&lt;",
                    ">": "&gt;",
                    "&": "&amp;",
                }[c];
                assert.isTrue(c2 !== undefined);
                return c2;
            });
        default:
            assert.noMissingCases(tt);
    }
}
function escapeAttrs(attrs) {
    const aParts = [];
    for (const [k, val] of Object.entries(attrs)) {
        const val2 = val.replace(/[\"\\\n]/g, v => {
            const v2 = {
                "\"": "&quot;",
                "\\": "&Backslash;",
                "\n": "&NewLine;",
            }[v];
            assert.isTrue(v2 !== undefined);
            return v2;
        });
        aParts.push(` ${k}="${val2}"`);
    }
    const aTxt = aParts.join("");
    return aTxt;
}
export function htmlRender(html) {
    const lines = [];
    function hr(html) {
        const [tag, attrs, ...contents] = html;
        const aTxt = escapeAttrs(attrs);
        const tt = typeOfTag(tag);
        switch (tt) {
            case "void":
                assert.isTrue(contents.length === 0);
                lines.push(`<${tag}${aTxt}>`);
                break;
            case "raw":
            case "escape":
            case "normal":
            case undefined:
                lines.push(`<${tag}${aTxt}>`);
                for (const content of contents) {
                    switch (typeof content) {
                        case "string":
                            lines.push(escapeText(content, tt));
                            break;
                        case "object":
                            hr(content);
                            break;
                        default:
                            assert.noMissingCases(content);
                    }
                }
                lines.push(`</${tag}>`);
                break;
            default:
                assert.noMissingCases(tt);
        }
    }
    hr(html);
    return lines;
}
function bgColor(color) {
    switch (color) {
        case "Black": return "lightgray";
        case "Red": return "pink";
        case "Green": return "lightgreen";
        case "Yellow": return "yellow";
        case "Blue": return "lightblue";
        case "Magenta": return "magenta";
        case "Cyan": return "lightcyan";
        case "White": return "white";
        default:
            assert.noMissingCases(color);
    }
}
function fgColor(color) {
    switch (color) {
        case "Black": return "black";
        case "Red": return "red";
        case "Green": return "green";
        // case "Yellow": return "brown"
        case "Yellow": return "orange";
        // case "Yellow": return "#C09000"
        case "Blue": return "blue";
        case "Magenta": return "magenta";
        case "Cyan": return "cyan";
        case "White": return "darkgray";
        default:
            assert.noMissingCases(color);
    }
}
// TODO Share this with browser.ts.
// TODO It is (or was) a copy,
// TODO   it risks getting out of sync.
export function mkUiStyle(styleMap, s, nameHint) {
    const key = JSON.stringify(s);
    if (styleMap.has(key)) {
        return styleMap.get(key);
    }
    let style = "";
    // let family = "MyMono-regular"
    // let family = "sans-serif"
    let family = "monospace";
    // let family = "monospace, monospace"
    style += `font-size: 1rem;`;
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
        case -1:
            style += "opacity: 0.5;";
            break;
        case 0:
            style += "font-weight: normal;";
            break;
        case 1:
            style += "font-weight: bold;";
            break;
    }
    if (family !== undefined) {
        style += `font-family: ${family};`;
    }
    if (s.fg !== undefined) {
        style += `color: ${fgColor(s.fg)};`;
    }
    if (s.bg !== undefined) {
        style += `background-color: ${bgColor(s.bg)};`;
    }
    if (s.italic === 1) {
        style += "font-style: italic;";
    }
    let decor = [];
    if (s.strike === 1) {
        decor.push("line-through");
    }
    if (s.under ?? 0 > 1) {
        decor.push("underline");
    }
    if (decor.length !== 0) {
        style += `text-decoration-line: ${decor.join(" ")}`;
    }
    // if (ts.under === 2) {
    //     style += "text-decoration-style: double;"
    // }
    const num = styleMap.size;
    const nameHint2 = nameHint === null ? "" : `_${nameHint}`;
    const cssName = `css${num}${nameHint2}`;
    const cssDefn = style;
    // const cssDefn = [
    //     `{ // ${key}`,
    //     `}`,
    // ].map(a => `  ${a}\n`).join("")
    const pageStyle = {
        uiStyle: s,
        key,
        cssName,
        cssDefn,
    };
    styleMap.set(key, pageStyle);
    return pageStyle;
}
export function camelCase_to_kebabCase(prop) {
    return prop.replace(/([A-Z])/g, '-$1').toLowerCase();
}
export function htmlBuild(styleLines, htmlLines, cb) {
    function textToHtml(text) {
        if (typeof text === "string") {
            htmlLines.push(escapeText(text));
        }
        else {
            if ("items" in text && text.items !== undefined) {
                if ("style" in text) {
                    assert.isTrue(typeof text.style === "object", "TODO Handle UiStyleNum numbers");
                    // const ps = mkUiStyle(styles, text.style, null)
                    const ts = sb.textStyle(text.style);
                    htmlLines.push(`<span class=${ts}>`);
                    assert.isTrue(text.items instanceof Array);
                }
                for (const item of text.items) {
                    textToHtml(item);
                }
                if ("style" in text) {
                    htmlLines.push("</span>");
                }
            }
        }
    }
    function elemToHtml(tag, attrs, cb) {
        if (typeOfTag(tag) === "void") {
            htmlLines.push(`<${tag}${escapeAttrs(attrs)}>`);
        }
        else {
            htmlLines.push(`<${tag}${escapeAttrs(attrs)}>`);
            cb?.apply(null);
            htmlLines.push(`</${tag}>`);
        }
    }
    function elemToHtml2(tag, ...args) {
        let attrs;
        let cb;
        if (args.length > 0 && (typeof args[0] === "string" || args[0] instanceof Array)) {
            let arg = args.shift();
            if (arg instanceof Array) {
                assert.isTrue(arg.every(a => typeof a === "string"));
                arg = arg.join(" ");
            }
            attrs = { class: arg };
        }
        if (args.length > 0 && !(args[0] instanceof Function)) {
            attrs = args.shift();
        }
        if (args.length > 0 && args[0] instanceof Function) {
            cb = args.shift();
        }
        assert.isTrue(args.length === 0);
        elemToHtml(tag, attrs ?? {}, cb);
    }
    const styleMap = new Map;
    function cssStyle(s) {
        const name = `s${styleLines.length}`;
        const defns = Object.entries(s).map(([k, v]) => `${camelCase_to_kebabCase(k)}: ${v};`);
        styleLines.push(`.${name} { ${defns.join(" ")} }`);
        return name;
    }
    function textStyle(s, nameHint) {
        const ps = mkUiStyle(styleMap, s, nameHint ?? null);
        styleLines.push(`.${ps.cssName} { ${ps.cssDefn} }`);
        return ps.cssName;
    }
    const hb = {
        text: textToHtml,
        elem: elemToHtml2,
    };
    const sb = {
        cssStyle,
        textStyle,
    };
    cb(sb, hb);
}
//#endregion
//# sourceMappingURL=html.js.map