
import { DeclLoc, DeclNoLoc, Decl, ExprLoc, Expr, isLambdaExpr, LambdaOp, lambdaOp, TorT } from "../syntax/expr.js"
import { isAlpha } from "../syntax/scan.js";
import { Loc, Pos } from "../syntax/token.js"
import { assert } from "../utils/assert.js"
import { UiStyle, UiStyleNumsFor, uiText, UiText, uiTextA, uiTextLength, uiTextList, uiTextToStr } from "../ui/text.js";
import { UiStyleNum } from "../ui/text.js";
import { Addr } from "../graph/graph-heap2.js";
import { ExprAddr } from "../graph/graph-readback.js";

export const prettyFerrum = (expr: Expr): string => {
    const p = prettyFerrum
    switch (expr.tag) {
        case "EVar":
            return expr.name
        case "EDatum": {
            if (expr.value === null) {
                return "[]"
            }
            else {
                return JSON.stringify(expr.value)
            }
        }
        case "EList": {
            const elems = expr.exprs.map(e => p(e))
            const tail = expr.tail === null ? "" : `,,${p(expr.tail)}`
            return `[${elems.join(",")}${tail}]`
        }
        case "EPair": {
            const elems: Expr[] = []
            while (expr.tag === "EPair") {
                elems.push(expr.hd)
                expr = expr.tl
            }
            const tail = expr.tag === "EDatum" && expr.value === null ? null : expr
            const list: Expr = { tag: "EList", exprs: elems, tail: tail }
            return p(list)
        }
        case "ELet": {
            if (expr.decls.length === 0) {
                return p(expr.expr)
            }
            const decls: string[] = expr.decls.map(([pat, defn]) => `${p(pat)}=${p(defn)};`)
            const body = p(expr.expr)
            return `let ${decls.join("")}${body}`
        }
        case "EApply": {
            let func: Expr = expr
            const args: Expr[] = []
            while (func.tag === "EApply") {
                args.push(func.arg)
                func = func.func
            }
            args.reverse()
            let applyStr = p(func)
            let argStrs = args.map(a => p(a))
            if (func.tag === "EVar" && !isAlpha(func.name)) {
                if (args.length < 2) {
                    // TODO handle unary operators
                    throw new Error(`Too few arguments (${args.length}) in call to (${func.name})`)
                }
                applyStr = `(${argStrs[0]} ${func.name} ${argStrs[1]})`
                argStrs.splice(0, 2)
            }
            while (argStrs.length !== 0) {
                applyStr = `${applyStr} ${argStrs.shift()}`
            }
            return applyStr

            // return `${p(expr.func)} ${p(expr.arg)}`
        }
        case "ELambda": {
            return `(${p(expr.pat)} -> ${p(expr.body)})`
        }
        case "ELambdaNo": {
            return `(${p(expr.pat)} |-> ${p(expr.body)})`
        }
        case "ELambdaYes": {
            return `(${p(expr.pat)} => ${p(expr.body)})`
        }
        case "ELambdaMaybe": {
            return `(${p(expr.pat)} |=> ${p(expr.body)})`
        }
        case "EAs": {
            return `(${expr.name} @ ${p(expr.expr)})`
        }
        case "ETermBrackets":
            return `(${p(expr.expr)})`
        case "ETypeBrackets":
            return `{ ${p(expr.expr)} }`
        case "EPrim":
            switch (expr.args.length) {
                case 0:
                    return `( ${expr.name} )`
                case 1:
                    return `( ${expr.name} ${p(expr.args[0])} )`
                case 2:
                    return `( ${p(expr.args[0])} ${expr.name} ${p(expr.args[1])} )`
                default:
                    throw new Error("TODO?")
            }
        case "EType":
            return `${p(expr.expr)} : ${p(expr.type)}`
        default:
            throw new Error(`Missing case (${expr.tag})`)
    }
}


const pFeIndentIncrement = 4;
const pMaxLineLen = 40;

// TODO ? Permit UiText annotations within pretty docs ?
// type DocAnnot = never

type PrettyItem<A> = UiText<A>

type PrettyIndent = number & { __Brand_PrettyIndent: never }
type PIndent = PrettyIndent;

type PrettyLine<A> = [PrettyIndent, PrettyItem<A>[]]

type PrettyDoc<A> = PrettyLine<A>[]
type Doc1<A = never> = PrettyDoc<A>

// TODO ? Switch to using a linked-list (with shared tails) of indents ?
// TODO ? This would make it possible to keep track of which indentaion columns are owned by which addrs/exprs.
type DocIndent<A> =
    | null
    | { parent: DocIndent<A>, column: number, annot?: A }

type Doc2<A> =
    | { tag: "H", column: number, length: number, isMultiLine: boolean, annot?: A, parts: Doc2<A>[] }
    | { tag: "V", column: number, length: number, isMultiLine: boolean, annot?: A, parts: Doc2<A>[] }
    | { tag: "T", column: number, length: number, isMultiLine: false, annot?: A, text: UiText<A> }


// The column on a compound node works hierarchically.
// Whereas docFirstColumn returns the column of the first text node found, regardless of hierarchy.
//   So for (1 + 2), the "+" may have a desired column of 0, 
//   but the "1" will then have a desired column of 4. (which means it might fit on the preceeding line)
function docFirstColumn<T>(doc: Doc2<T>): number {
    switch (doc.tag) {
        case "T":
            return doc.column
        case "H":
        case "V":
            assert.isTrue(doc.parts.length > 0)
            return docFirstColumn(doc.parts[0])
        default:
            assert.noMissingCases(doc)
    }
}

// type Doc<A=never> = Doc1<A>
// const pText = p1Text
// const pTextA = p1TextA
// const pIsMultiLine = p1IsMultiLine
// const pH = p1H
// const pV = p1V
// const pHV = p1HV
// const pFitsOnOneLine = p1FitsOnOneLine
// type DocAnnot = Doc1Annot
// type ExprDoc = ExprDoc1
// type DeclDoc = DeclDoc1
// export const pShow = (s: UiStyleNum, doc: Doc1Annot) => p1Show(s, doc)


type Doc<A = never> = Doc2<A>
const pText = p2Text
const pTextN = p2TextN
const pTextA = p2TextA
const pIsMultiLine = p2IsMultiLine
const pH = p2H
const pV = p2V
const pHV = p2HV
const pFitsOnOneLine = p2FitsOnOneLine
type DocAnnot = Doc2Annot
export type ExprDoc = ExprDoc2
export type DeclDoc = DeclDoc2
export const pShow = (s: UiStyleNum, doc: Doc2Annot) => {
    // const [txt, col] = p2Show(s, doc, "H", 0)
    // return txt
    return p2Show2(s, doc, new Map)
}

const indentZero = 0 as PIndent
function indentInc(indent: PIndent, levels: number = 1): PIndent {
    return indent + (levels * pFeIndentIncrement) as PIndent
}

type FeCtx = null | [ExprLoc["tag"], number] | ["Op", string, number];

type FeCtx2 =
    | { tag: "None" }
    | { tag: "Expr", exprTag: ExprLoc["tag"], childPos: number }
    | { tag: "Op", name: string, childPos: number };

export type PrettyFerrumStyleDefns = {
    std: UiStyle,
    selected: UiStyle,
}
export const prettyFerrumStyleDefns: PrettyFerrumStyleDefns = {
    std: { bg: "White" },
    // selected: { weight: 1 },
    selected: { bg: "Blue" },
    // selected: { bg: "Red" },
}
export type PrettyFerrumStyleNums = UiStyleNumsFor<PrettyFerrumStyleDefns>

// function pText(indent: PIndent, text: string): Doc {
//     return [[indent, [text]]]
// }

function p1Text<A = never>(indent: PIndent, style: UiStyleNum, text: string): Doc1<A> {
    return [[indent, [uiText(style, text)]]]
    // const txt = annot === undefined ? uiText(style, text) : uiTextA<A>(style, text, annot)
    // return [[indent, [txt]]]
}

function p1TextA<A>(indent: PIndent, style: UiStyleNum, text: string, annot: A): Doc1<A> {
    return [[indent, [uiTextA(style, text, annot)]]]
    // const txt = annot === undefined ? uiText(style, text) : uiTextA<A>(style, text, annot)
    // return [[indent, [txt]]]
}

function p2Text<A = never>(indent: PIndent, style: UiStyleNum, text: string): Doc2<A> {
    return { tag: "T", column: indent, length: text.length, isMultiLine: false, text: uiText(style, text) }
}

function p2TextN<A = never>(indent: PIndent, style: UiStyleNum, text: string): Doc2<A> {
    return { tag: "T", column: indent, length: text.length, isMultiLine: false, text: uiText(null, text) }
}

function p2TextA<A>(indent: PIndent, style: UiStyleNum, text: string, annot: A): Doc2<A> {
    return { tag: "T", column: indent, length: text.length, isMultiLine: false, text: uiTextA(style, text, annot) }
}

function p2TextAN<A>(indent: PIndent, style: UiStyleNum, text: string, annot: A): Doc2<A> {
    return { tag: "T", column: indent, length: text.length, isMultiLine: false, text: uiTextA(null, text, annot) }
}

function pA<A>(annot: A, doc: Doc2<A>): Doc2<A> {
    assert.isTrue(doc.annot === undefined)
    // doc.annot = annot
    // return doc
    return { annot, ...doc }
}

// let p3LeadingText : { Pretty3Indent -> Str -> PD } =
//     indent -> text ->
//     -- let text2 = while text <| text3 -> if (strLen text3 < p3IndentIncrement) [ -> [strAdd text3 " "], -> []];
//     let text2 = 
//         while text <| text3 -> 
//         if (strLen text3 < p3IndentIncrement) 
//         [ -> [strAdd text3 " "]
//         , -> []
//         ];
//     [ [indent, [text2]] ];
function p3LeadingText<A>
    (indent: PIndent, text: string): Doc<A> {
    assert.todo()
}

// const pNil: Doc<never> = []
// const pNil<A>: Doc<A> = []

function p1IsMultiLine<A>(doc: Doc1<A>): boolean {
    return doc.length > 1
}

function p2IsMultiLine<A>(doc: Doc2<A>): boolean {
    switch (doc.tag) {
        case "V":
            // TODO ? Take into account a vertical document might only require a single line ?
            // TODO ?   either because it only contains one part (which itself only required a single line),
            // TODO ?   or potentially because multiple parts can fit on the same line with out violating any of their indent/column requirements.
            // TODO ?   (such as a comma preceeding a list element).
            return true
        case "H":
            // TODO ? A horizontal document might nevertheless require multiple lines if any of the parts require multiple lines
            // TODO ?   so recurse into the parts ?
            // TODO ?   or include line count in the Doc2 definition.
            return false
        case "T":
            return false
        default:
            assert.noMissingCases(doc)
    }
}



// -- let p3IsSingleLine : { PD -> Bool } = 
// --     a ->
// --     length a == 1;


// The "aLen + 1" and "paddingWidth - 1" code below,
//   is adjusting for the fact spaces between items will be added later.
// TODO ? It might be simpler to add the spaces up front ?
function p1H<A>(...docs: Doc1<A>[]): Doc1<A> {
    const result: Doc1<A> = []
    for (const doc of docs) {
        if (doc.length === 0) {
            continue
        }
        // first line
        if (result.length === 0) {
            result.push(doc[0])
        }
        else {
            const last = result[result.length - 1];
            const endOfLine = last[0] + last[1].map(a => uiTextLength(a)).reduce((total, aLen) => total + aLen + 1, 0)
            const paddingWidth = p1IsMultiLine(doc) ? Math.max(0, doc[0][0] - endOfLine) : 0
            if (paddingWidth >= 0) {
                // If possible, append the first line of this (multi-line) doc onto the last line of the previous doc,
                // Add sufficient padding to bring the line to it's expected level of indentation.
                if (paddingWidth > 0) {
                    last[1].push(uiText(null, " ".repeat(paddingWidth - 1)))
                }
                last[1].push(...doc[0][1])
            }
            else {
                // If there's insufficient space (the line would be over-indented beyond its expected level of indentation),
                //   then start the next doc on a new line.
                result.push(doc[0])
            }
        }
        // remaining lines
        for (let i = 1; i < doc.length; i++) {
            const line = doc[i]
            result.push(line)
        }
    }
    return result
}


function p2H<A>(...docs: Doc2<A>[]): Doc2<A> {
    let isMultiLine = false
    let length = 0
    for (const doc of docs) {
        isMultiLine ||= doc.isMultiLine
        length += doc.length + 1
    }
    // The length includes a space between every part, not after every part, so remove the last space, if there is one.
    length = Math.max(0, length - 1)
    return { tag: "H", column: docs[0].column, length, isMultiLine, parts: docs }
}

function pHA<A>(annot: A, ...docs: Doc2<A>[]): Doc2<A> {
    const result = p2H(...docs)
    result.annot = annot
    return result
}


// function pHA<A>(annot: A, ...docs: Doc<A>[]): Doc<A> {
//     const result: Doc<A> = []
//     for (const doc of docs) {
//         if (doc.length === 0) {
//             continue
//         }
//         // first line
//         if (result.length === 0) {
//             result.push(doc[0])
//         }
//         else {
//             const last = result[result.length - 1];
//             const endOfLine = last[0] + last[1].map(a => uiTextLength(a)).reduce((total, aLen) => total + aLen + 1, 0)
//             const paddingWidth = pIsMultiLine(doc) ? Math.max(0, doc[0][0] - endOfLine) : 0
//             if (paddingWidth >= 0) {
//                 // If possible, append the first line of this (multi-line) doc onto the last line of the previous doc,
//                 // Add sufficient padding to bring the line to it's expected level of indentation.
//                 if (paddingWidth > 0) {
//                     last[1].push(uiText(null, " ".repeat(paddingWidth - 1)))
//                 }
//                 last[1].push(...doc[0][1])
//             }
//             else {
//                 // If there's insufficient space (the line would be over-indented beyond its expected level of indentation),
//                 //   then start the next doc on a new line.
//                 result.push(doc[0])
//             }
//         }
//         // remaining lines
//         for (let i = 1; i < doc.length; i++) {
//             const line = doc[i]
//             result.push(line)
//         }
//     }
//     return result
// }

function p1V<A>(...docs: Doc1<A>[]): Doc1<A> {
    return ([] as Doc1<A>).concat(...docs)
}

function p2V<A>(...docs: Doc2<A>[]): Doc2<A> {
    // let isMultiLine = false
    let isMultiLine = docs.length > 1
    // let isMultiLine = true
    let length = 0
    for (const doc of docs) {
        isMultiLine ||= doc.isMultiLine
        length += doc.length
    }
    // The length includes a space between every part, not after every part, so remove the last space, if there is one.
    length = Math.max(0, length - 1)
    return { tag: "V", column: docs[0].column, length, isMultiLine, parts: docs }
}


function pVA<A>(annot: A, ...docs: Doc1<A>[]): Doc1<A> {
    return ([] as Doc1<A>).concat(...docs)
}

function p2VA<A>(annot: A, ...docs: Doc2<A>[]): Doc2<A> {
    const result = p2V(...docs)
    result.annot = annot
    return result
}

// -- append a string onto the last item of the last line
// let p3A : { PD -> Str -> PD } =
//     pd -> addendum ->
//     ifNil (reverse pd)
//     [ [] ->
//         p3Text 0 addendum
//     , [lastLine ,, initLinesRev] ->
//         let [lastIndent, lastItems] = lastLine;
//         let lastItems2 = 
//             ifNil (reverse lastItems)
//             [ [] -> [addendum]
//             , [lastItem ,, initItemsRev] ->
//                 reverseOnto initItemsRev [strAdd lastItem addendum]
//             ];
//         let lastLine2 = [[lastIndent, lastItems2]];
//         reverseOnto initLinesRev lastLine2
//     ];

// function pA(doc: Doc, addendum: string): Doc {
//     if (doc.length === 0) {
//         return pText(0, addendum)
//     }
//     else {
//         const result = [...doc]
//         const last1 = result.pop()!
//         const last2: PrettyLine = [last1[0], [...last1[1], addendum]]
//         result.push(last2)
//         return result
//     }
// }

// let p3FitsOnOneLine : { (List PD) -> Int -> Bool } =
//     a -> punctLen ->
//     if (listAllFalse a p3IsMultiLine)
//     [ ->
//         let items = concat <| forMap a <| lines -> concat <| forMap lines <| [indent, itms] -> itms;
//         let len = sum <| map strLen items;
//         (len + punctLen) <= p3MaxLineLen
//     , -> 
//         false
//     ];
// TODO ? using the "punctLen" as above ?
function p1FitsOnOneLine<A>(docs: Doc1<A>[], punctLen: number = 0): boolean {
    let lineLen = 0
    for (const doc of docs) {
        if (doc.length === 0) {
            continue
        }
        if (doc.length > 1) {
            return false
        }
        lineLen += doc[0][1].reduce((totalLen, item) => totalLen + uiTextLength(item), 0)
        if (lineLen > pMaxLineLen) {
            return false
        }
    }
    return true
}

function p2FitsOnOneLine<A>(docs: Doc2<A>[], punctLen: number = 0): boolean {
    let lineLen = 0
    for (const doc of docs) {
        if (doc.isMultiLine) {
            return false
        }
        lineLen += doc.length
        if (lineLen > pMaxLineLen) {
            return false
        }
        lineLen += 1
    }
    return true
}


function p1HV<A>(...a: Doc<A>[]): Doc<A> {
    if (pFitsOnOneLine(a)) {
        return pH(...a)
    }
    else {
        return pV(...a)
    }
}

function p2HV<A>(...a: Doc2<A>[]): Doc2<A> {
    if (p2FitsOnOneLine(a)) {
        return p2H(...a)
    }
    else {
        return p2V(...a)
    }
}

function pHVA<A>(annot: A, ...a: Doc2<A>[]): Doc2<A> {
    if (pFitsOnOneLine(a)) {
        return pHA(annot, ...a)
    }
    else {
        return p2VA(annot, ...a)
    }
}


function pList<A>(indent: PIndent, style: UiStyleNum, [opn, sep, cls]: [string, string, string], docs: Doc<A>[]): Doc<A> {
    const pT = (text: string) => pText(indent, style, text)
    if (docs.length === 0) {
        return pH(pT(opn), pT(cls))
    }

    const first = pH(pT(opn), docs[0])
    const rest = docs.slice(1).map(doc => pH(pT(sep), doc))
    const last = pT(cls)

    return pHV(first, ...rest, last)
}

function p2List<A>(indent: PIndent, style: UiStyleNum, [opn, sep, cls]: [string, string, string], docs: Doc<A>[]): Doc<A> {
    const pT = (text: string) => pTextN(indent, style, text)
    if (docs.length === 0) {
        return pH(pT(opn), pT(cls))
    }

    const first = pH(pT(opn), docs[0])
    const rest = docs.slice(1).map(doc => pH(pT(sep), doc))
    const last = pT(cls)

    return pHV(first, ...rest, last)
}

// function p2List<A>(indent: PIndent, style: UiStyleNum, [opn, sep, cls]: [string, string, string], docs: Doc2<A>[]): Doc2<A> {
//     const pT = (text: string) => p2Text(indent, style, text)
//     if (docs.length === 0) {
//         return p2H(pT(opn), pT(cls))
//     }

//     const first = p2H(pT(opn), docs[0])
//     const rest = docs.slice(1).map(doc => p2H(pT(sep), doc))
//     const last = pT(cls)

//     return p2HV(first, ...rest, last)
// }

// let p3List2 : { Pretty3Indent -> [Str,Str,Str] -> (List PD) -> PD } =
//     indent -> [opn, sep, cls] -> pds ->
//     let p3T = p3Text indent;
//     match pds
//     [ [] |=>
//         p3H [p3T opn, p3T cls]
//     , [pd1 ,, pds2] |=>
//         let p3L = p3LeadingText indent;
//         let punctLen = strLen opn + ((strLen sep) * (length pds - 1)) + strLen cls;
//         if (p3FitsOnOneLine2 pds punctLen)
//         [ ->
//             p3H <| concat [ [p3H [p3T opn, pd1]], forMap pds2 <| pd -> p3H [p3T sep, pd], [p3T cls] ]
//         , ->
//             p3V <| concat [ [p3H [p3L opn, pd1]], forMap pds2 <| pd -> p3H [p3L sep, pd], [p3T cls] ]
//         ]
//     ];
function pList2(indent: PIndent, [opn, sep, cls]: [string, string, string], a: Doc[]): Doc {
    assert.todo()
}



function pFeList(indent: PIndent, style: UiStyleNum, elems: DocAnnot[], tail: DocAnnot | null): DocAnnot {
    const pT = (text: string) => pText(indent, style, text)
    if (elems.length === 0 && tail === null) {
        return pT("[]")
    }
    if (elems.length === 0 && tail !== null) {
        assert.impossible("a tail with no head")
        // Semantically 
        //     [ ,, a ]
        // could be considered the same as just
        //     a
        // ( much like "[...elems]" is the same as "elems" (modulo referential observability) in JS )
        // so we could just return "tail".
        // We should never encounter this situation in practice though.
    }

    const first = pH(pT("["), elems[0])
    const rest = elems.slice(1).map(elem => pH(pT(","), elem))
    const tailD: DocAnnot[] = tail === null ? [] : [pH(pT(",,"), tail)]
    const last = pT("]")
    return pHV(first, ...rest, ...tailD, last)
}

// TODO Implement something like the DisplayTree zipBrackets function (from types.ts), 
function pLabelList(elems: [string, Doc][]): Doc {
    assert.todo()
}
// TODO   but also build an ExprDoc as we go.
// TODO This takes
// TODO   - a list of 
// TODO     - labels, such as "[", ",", "(", "+"", "->",
// TODO     - connective expressions, such as EPair, EOp, ELambda,
// TODO     - element ExprDoc, the elements of a list, the patterns of a curried lambda
// TODO   - an optional tail, corresponding to an explicit list tail, or the body of a lambda
function pLabelList2(elems: [string, ExprLoc, ExprDoc][], tail: ExprDoc | null, build: (a: ExprDoc, b: ExprDoc) => ExprDoc): ExprDoc {
    assert.todo()
}


function pfParensNeeded(ctx: FeCtx, expr: Expr): boolean {
    if (ctx !== null && (ctx[0] === "ETermBrackets" || ctx[0] === "ETypeBrackets")) {
        return false
    }

    switch (expr.tag) {
        case "EVar":
        case "EDatum":
            return false
        case "EPrim":
            return expr.args.length !== 0
        case "EApply":
            return ctx !== null
        default:
            return true
    }
}

function pfParensNeeded2(ctx: FeCtx, expr: Expr): boolean {
    if (ctx !== null && (ctx[0] === "ETermBrackets" || ctx[0] === "ETypeBrackets")) {
        return false
    }

    switch (expr.tag) {
        case "EVar":
        case "EDatum":
            return false
        case "EPrim":
            // return expr.args.length !== 0
            // operators now always provide their own parens
            return false
        case "EApply":
            // return ctx !== null
            // applications now always provide their own parens
            return false
        case "ELambda":
            // return ctx !== null
            // lambdas now always provide their own parens
            return false
        case "ETermBrackets":
        case "ETypeBrackets":
            return false
        default:
            return true
    }
}

type ExprDocAnnot = number

type ExprDoc1 = Expr<{ id: number, doc: Doc<ExprDocAnnot> }>
type DeclDoc1 = [ExprDoc1, ExprDoc1]
type Doc1Annot = Doc1<ExprDocAnnot>

// type ExprDoc2Annot = number
type ExprDoc2 = Expr<{ id: number, doc: Doc2<ExprDocAnnot> }>
type DeclDoc2 = [ExprDoc2, ExprDoc2]
type Doc2Annot = Doc2<ExprDocAnnot>

// TODO ? Add locations to "expr" as we go ?
// TODO ? Or may return an ExprDoc ?
// TODO ?   then convert an ExprDoc to [Expr, string] in a subsequent pass ?

type PrettyFerrum = {
    pExpr(expr: Expr): ExprDoc
    pDecls(decls: DeclNoLoc[]): [DeclDoc[], DocAnnot]
}


// TODO Take the selected address (addresses ?).
// TODO Use the "selected" UiStyle for the expression readback for the selected address.
// TODO ? Allow multiple selected addresses ? 
// TODO ?   with different colours/styles for each ?
// TODO ?   have colours/styles intersect ?


// TODO ? Take an empty Id<->Expr Map, to be populated as the ExprDoc is generated
export function mkPrettyFerrum(maxIndent = 40, maxWidth = 40, styles: PrettyFerrumStyleNums, selected: Set<Addr>): PrettyFerrum {

    let nextId = 0

    return {
        pExpr: (expr: Expr) => pExpr(indentZero, styles, "Term", null, expr),
        pDecls: (decls: DeclNoLoc[]) => pfDecls0(indentZero, styles, "Term", decls)
    }

    // function exprDoc(expr: ExprDoc): ExprDoc {
    //     return expr
    // }

    function genId(): number {
        return nextId++
    }

    function pfDecls0(indent: PIndent, styles: PrettyFerrumStyleNums, tort: TorT, decls: Decl<any>[]): [DeclDoc[], DocAnnot] {
        const pT = (text: string) => pText(indent, styles.std, text)
        const declsD: DeclDoc[] = decls.map(decl => {
            const indent2 = indentInc(indent)
            const pT = (text: string) => pText(indent2, styles.std, text)
            const pE = (expr: ExprLoc) => pExpr0(indent2, styles, tort, null, expr)
            const [pat, defn] = decl
            const patDD = pE(pat)
            const defnDD = pE(defn)
            return [patDD, defnDD]
        })
        const declsDoc: DocAnnot = pV(...declsD.map(([pat, defn]) => pHV(pH(pT("let"), pat.doc, pT("=")), pH(defn.doc, pT(";")))))
        return [declsD, declsDoc]
    }

    function pExpr0(indent: PIndent, styles: PrettyFerrumStyleNums, tort: TorT, ctx: FeCtx, expr: Expr): ExprDoc {
        const needsParens = pfParensNeeded(ctx, expr)
        const indent2 = needsParens ? indentInc(indent) : indent
        let result = pExpr(indent2, styles, tort, ctx, expr)
        if (needsParens) {
            switch (tort) {
                case "Term": {
                    const resultDoc = pList(indent, styles.std, ["(", "", ")"], [result.doc])
                    // TODO ? Add an ETermBracket node to the AST ? probably a bad idea.
                    result = { ...result, doc: resultDoc }
                    break
                }
                case "Type": {
                    const resultDoc = pList(indent, styles.std, ["{", "", "}"], [result.doc])
                    // TODO ? Add an ETypeBracket node to the AST ? probably a bad idea.
                    result = { ...result, doc: resultDoc }
                    break
                }
                default:
                    assert.noMissingCases(tort)
            }
        }
        return result
    }
    function pExpr(indent: PIndent, styles: PrettyFerrumStyleNums, tort: TorT, ctx: FeCtx, expr: Expr): ExprDoc {
        const exprAddr = expr as ExprAddr
        if (exprAddr.addr !== undefined) {
            if (selected.has(exprAddr.addr)) {
                styles = { std: styles.selected, selected: styles.selected }
            }
        }
        const indent1 = indentInc(indent)
        const style = styles.std
        const pT = (text: string) => pText(indent, style, text)
        const pTA = (annot: ExprDocAnnot, text: string) => pTextA(indent, style, text, annot)
        const pE0 = (ctx: FeCtx, expr: Expr) => pExpr0(indent, styles, tort, ctx, expr);
        const pE1 = (ctx: FeCtx, expr: Expr) => pExpr0(indent1, styles, tort, ctx, expr);

        switch (expr.tag) {
            case "EVar": {
                const id = genId()
                return { ...expr, id, doc: pTA(id, expr.name) }
            }
            case "EApply": {
                const id = genId()
                const func = pE0([expr.tag, 0], expr.func)
                const arg = pE0([expr.tag, 1], expr.arg)
                // return { ...expr, id, func, arg, doc: pHVA(id, func.doc, arg.doc) }
                return { ...expr, id, func, arg, doc: pHV(func.doc, arg.doc) }
            }
            case "EDatum":
                const datumStr = expr.value === null ? "[]" : JSON.stringify(expr.value)
                return { ...expr, id: genId(), doc: pT(datumStr) }
            case "EPrim": {
                const indent2 = indentInc(indent)
                const args = expr.args.map((a, i) => pExpr0(indent2, styles, tort, ["Op", expr.name, i], a))
                if (isAlpha(expr.name)) {
                    const doc =
                        expr.args.length === 0
                            ? pT(expr.name)
                            : pHV(pT(expr.name), ...args.map(a => a.doc))
                    return { ...expr, id: genId(), args, doc }
                }
                else {
                    switch (expr.args.length) {
                        case 0: {
                            const doc = pHV(pT(expr.name))
                            return { ...expr, id: genId(), args, doc }
                        }
                        case 1: {
                            // --TODO handle prefix / postfix, assume prefix for now
                            const doc = pHV(pT(expr.name), args[0].doc)
                            return { ...expr, id: genId(), args, doc }
                        }
                        case 2: {
                            const doc = pHV(args[0].doc, pT(expr.name), args[1].doc)
                            return { ...expr, id: genId(), args, doc }
                        }
                        default:
                            assert.impossible("too many operator arguments")
                    }
                }
            }
            case "EType": {
                const tm = pE1([expr.tag, 0], expr.expr)
                const ty = pE1([expr.tag, 1], expr.type)
                const doc = pHV(tm.doc, pT(":"), ty.doc)
                return { ...expr, id: genId(), expr: tm, type: ty, doc }
            }
            case "EAs": {
                const name = pT(expr.name)
                const exp = pE1([expr.tag, 1], expr.expr)
                const doc = pHV(name, pT("@"), exp.doc)
                return { ...expr, id: genId(), expr: exp, doc }
            }
            case "EList": {
                const elems = expr.exprs.map((e, i) => pE1([expr.tag, i], e))
                const tl = expr.tail === null ? null : pE1([expr.tag, expr.exprs.length], expr.tail)
                const doc = pFeList(indent, style, elems.map(e => e.doc), tl?.doc ?? null)
                return { ...expr, id: genId(), exprs: elems, tail: tl, doc }
            }
            case "ELambda":
            case "ELambdaMaybe":
            case "ELambdaNo":
            case "ELambdaYes": {
                const pat = pE1([expr.tag, 0], expr.pat)
                const body = pE1([expr.tag, 1], expr.body)
                const doc = pHV(pat.doc, pT(lambdaOp(expr)), body.doc)
                return { ...expr, id: genId(), pat, body, doc }
            }
            case "ETermBrackets": {
                const exp = pExpr0(indent1, styles, "Term", null, expr.expr)
                const doc = pList(indent, styles.std, ["(", "", ")"], [exp.doc])
                return { ...expr, id: genId(), expr: exp, doc }
            }
            case "ETypeBrackets": {
                const exp = pExpr0(indent1, styles, "Type", null, expr.expr)
                const doc = pList(indent, styles.std, ["{", "", "}"], [exp.doc])
                return { ...expr, id: genId(), expr: exp, doc }
            }
            case "ELet": {
                const [declDocs, declsDoc] = pfDecls0(indent, styles, tort, expr.decls);
                const exp = pE0(null, expr.expr);
                const doc = pV(declsDoc, exp.doc)
                return { ...expr, id: genId(), decls: declDocs, expr: exp, doc }
            }
            // case "EPair": {
            //     const hd = pE1([expr.tag, 0], expr.hd)
            //     const tl = pE1([expr.tag, 1], expr.tl)
            //     const doc = pHV(pT("["), hd.doc, pT(",,"), tl.doc, pT("]"))
            //     return { ...expr, id: genId(), hd, tl, doc }
            // }
            case "EPair": {
                const pairElems: [Expr & { tag: "EPair" }, ExprDoc, UiStyleNum][] = []
                let list: Expr = expr
                let style = styles.std
                let listStyles = { std: styles.std, selected: styles.selected }
                while (list.tag === "EPair") {
                    const listEA = list as ExprAddr
                    if (listEA.addr !== undefined && selected.has(listEA.addr)) {
                        style = styles.selected
                        listStyles = { std: listStyles.selected, selected: listStyles.selected }
                    }
                    // const elem = pE1([expr.tag, 0], list.hd)
                    const elem = pExpr0(indent1, listStyles, tort, [expr.tag, 0], list.hd)
                    pairElems.push([list, elem, style])
                    list = list.tl
                }
                // TODO Determine upfront if the list is going to fit on one line,
                // TODO   then use pH or pV consistently.
                // TODO The current code makes multipe calls to pHV,
                // TODO   this breaks the intended bracket-aligning rules (matching brackets always being on either the same row or the column).
                const [lastPair, lastElem, lastStyle] = pairElems.pop()!
                let tl: ExprDoc
                let lastPairED: ExprDoc
                if (list.tag === "EDatum" && list.value === null) {
                    let tlStyle = lastStyle
                    const tlAddr = (list as ExprAddr).addr
                    if (tlAddr !== undefined && selected.has(tlAddr)) {
                        tlStyle = styles.selected
                    }
                    tl = { ...list, id: genId(), doc: pText<number>(indent, tlStyle, "]") }
                    const doc = pHV(lastElem.doc, tl.doc)
                    lastPairED = { ...lastPair, id: genId(), hd: lastElem, tl, doc }
                }
                else {
                    tl = pE1([expr.tag, 1], expr.tl)
                    const doc = pHV(lastElem.doc, pText(indent, lastStyle, ",,"), tl.doc, pText(indent, lastStyle, "]"))
                    lastPairED = { ...lastPair, id: genId(), hd: lastElem, tl, doc }
                }

                let listDoc = tl.doc
                let listED: ExprDoc = lastPairED
                let pairElem: (typeof pairElems)[0] | undefined
                if (pairElems.length === 0) {
                    listED.doc = pHV(pText(indent, style, "["), listED.doc)
                }
                else {
                    while (pairElem = pairElems.pop()) {
                        const [pairE, elemED, pairStyle] = pairElem
                        let doc: DocAnnot = pHV(elemED.doc, pText(indent, pairStyle, ","), listED.doc)
                        if (pairElems.length === 0) {
                            doc = pHV(pText(indent, pairStyle, "["), doc)
                        }
                        listED = { ...pairE, id: genId(), hd: elemED, tl: listED, doc }
                    }
                }
                return listED
            }
            case "ETypeAs":
            case "ESym":
                assert.impossible()
            default:
                assert.noMissingCases(expr)
        }
    }
}

function mapListPush<K, V>(m: Map<K, V[]>, k: K | undefined, v: V) {
    if (k === undefined) {
        return
    }
    if (m.has(k)) {
        m.get(k)!.push(v)
    }
    else {
        m.set(k, [v])
    }
}

function tortOpen(tort: TorT): string {
    switch (tort) {
        case "Term": return "("
        case "Type": return "{"
        default:
            assert.noMissingCases(tort)
    }
}

function tortClose(tort: TorT): string {
    switch (tort) {
        case "Term": return ")"
        case "Type": return "}"
        default:
            assert.noMissingCases(tort)
    }
}

// TODO ? Take an empty Id<->Expr Map, to be populated as the ExprDoc is generated
export function mkPrettyFerrum2(
    maxIndent = 40, maxWidth = 40,
    styles: PrettyFerrumStyleNums,
    idExprMap: Map<number, ExprDoc>, exprIdMap: Map<ExprDoc, number>, addrIdsMap: Map<Addr, number[]>):
    PrettyFerrum {

    let nextId = 0

    return {
        pExpr: (expr: Expr) => pExpr(indentZero, "Term", null, expr),
        pDecls: (decls: DeclNoLoc[]) => pfDecls0(indentZero, "Term", decls)
    }

    function genId(): number {
        return nextId++
    }

    function buildRight_ExprDoc(indent: PIndent,
        expr: Expr, opn: string, sep: string, cls: string,
        dn: (e: Expr) => [Expr | null, ExprDoc],
        up: (e: Expr, doc: Doc2<number>, edL: ExprDoc, edR: ExprDoc) => ExprDoc): ExprDoc {

        const style = styles.std // TODO remove styles

        const eds: [Expr, ExprDoc][] = []
        let expr2 = expr
        let [e, ed] = dn(expr2)
        let length = opn.length
        while (e !== null) {
            eds.push([expr2, ed])
            length += 1 + ed.doc.length + 1 + sep.length;
            expr2 = e;
            [e, ed] = dn(expr2)
        }

        length += 1 + ed.doc.length + 1 + cls.length
        const orient = length > pMaxLineLen ? "V" : "H"

        let rightDoc: Doc2<number> = ed.doc
        let exprDoc = ed

        eds.reverse()

        for (let i = 0; i !== eds.length; i++) {
            const [e, ed] = eds[i]
            const id = genId()
            const parts = [ed.doc, pTextN(indent, style, sep), rightDoc]
            if (i === 0) {
                // start with the close bracket
                parts.push(pTextN(indent, style, cls))
            }
            if (i === eds.length - 1) {
                // and build up to the open bracket
                parts.unshift(pTextN(indent, style, opn))
            }
            rightDoc = {
                tag: orient,
                column: indent,
                length: parts.reduce((totalLen, p) => totalLen + p.length, 0),
                isMultiLine: orient === "V",
                parts,
                annot: id,
            }
            exprDoc = up(e, rightDoc, ed, exprDoc)
            mapListPush(addrIdsMap, (e as ExprAddr).addr, id)
        }

        return exprDoc
    }

    function buildLeft_ExprDoc(indent: PIndent,
        expr: Expr, opn: string, sep: string, cls: string,
        dn: (e: Expr) => [Expr | null, ExprDoc],
        up: (e: Expr, doc: Doc2<number>, edL: ExprDoc, edR: ExprDoc) => ExprDoc): ExprDoc {

        const style = styles.std // TODO remove styles

        const eds: [Expr, ExprDoc][] = []
        let expr2 = expr
        let [e, ed] = dn(expr2)
        let length = opn.length
        while (e !== null) {
            eds.push([expr2, ed])
            length += 1 + ed.doc.length + 1 + sep.length;
            expr2 = e;
            [e, ed] = dn(expr2)
        }

        length += 1 + ed.doc.length + 1 + cls.length
        const orient = length > pMaxLineLen ? "V" : "H"

        let leftDoc: Doc2<number> = ed.doc
        let exprDoc = ed

        eds.reverse()

        for (let i = 0; i !== eds.length; i++) {
            const [e, ed] = eds[i]
            const id = genId()
            const parts = [leftDoc, pTextN(indent, style, sep), ed.doc]
            if (i === 0) {
                // start with the open bracket
                parts.unshift(pTextN(indent, style, opn))
            }
            if (i === eds.length - 1) {
                // and build up to the close bracket
                parts.push(pTextN(indent, style, cls))
            }
            leftDoc = {
                tag: orient,
                column: indent,
                length: parts.reduce((totalLen, p) => totalLen + p.length, 0),
                isMultiLine: orient === "V",
                parts,
                annot: id,
            }
            exprDoc = up(e, leftDoc, exprDoc, ed)
            mapListPush(addrIdsMap, (e as ExprAddr).addr, id)
        }

        return exprDoc
    }



    function pfDecls0(indent: PIndent, tort: TorT, decls: Decl<any>[]): [DeclDoc[], DocAnnot] {
        // const pT = (text: string) => pText(indent, styles.std, text)
        const pT = (text: string) => pTextN(indent, styles.std, text)
        const declsD: DeclDoc[] = decls.map(decl => {
            const indent2 = indentInc(indent)
            const pT = (text: string) => pTextN(indent2, styles.std, text)
            const pE = (expr: ExprLoc) => pExpr0(indent2, tort, null, expr)
            const [pat, defn] = decl
            const patDD = pE(pat)
            const defnDD = pE(defn)
            return [patDD, defnDD]
        })
        const declsDoc: DocAnnot = pV(...declsD.map(([pat, defn]) => pHV(pH(pT("let"), pat.doc, pT("=")), pH(defn.doc, pT(";")))))
        return [declsD, declsDoc]
    }

    function pExpr0(indent: PIndent, tort: TorT, ctx: FeCtx, expr: Expr): ExprDoc {
        const needsParens = pfParensNeeded2(ctx, expr)
        const indent2 = needsParens ? indentInc(indent) : indent
        let result = pExpr(indent2, tort, ctx, expr)
        if (needsParens) {
            switch (tort) {
                case "Term": {
                    const resultDoc = p2List(indent, styles.std, ["(", "", ")"], [result.doc])
                    // TODO ? Add an ETermBracket node to the AST ? probably a bad idea.
                    result = { ...result, doc: resultDoc }
                    break
                }
                case "Type": {
                    const resultDoc = p2List(indent, styles.std, ["{", "", "}"], [result.doc])
                    // TODO ? Add an ETypeBracket node to the AST ? probably a bad idea.
                    result = { ...result, doc: resultDoc }
                    break
                }
                default:
                    assert.noMissingCases(tort)
            }
        }
        return result
    }
    function pExpr(indent: PIndent, tort: TorT, ctx: FeCtx, expr: Expr): ExprDoc {
        const exprAddr = expr as ExprAddr
        const id = genId()
        if (exprAddr.addr !== undefined) {
            if (addrIdsMap.has(exprAddr.addr)) {
                addrIdsMap.get(exprAddr.addr)!.push(id)
            }
            else {
                addrIdsMap.set(exprAddr.addr, [id])
            }
        }
        const indent1 = indentInc(indent)
        const style = styles.std
        const pT = (text: string) => pTextN(indent, style, text)
        const pTA = (annot: ExprDocAnnot, text: string) => p2TextAN(indent, style, text, annot)
        const pE0 = (ctx: FeCtx, expr: Expr) => pExpr0(indent, tort, ctx, expr);
        const pE1 = (ctx: FeCtx, expr: Expr) => pExpr0(indent1, tort, ctx, expr);

        switch (expr.tag) {
            case "EVar": {
                return { ...expr, id, doc: pTA(id, expr.name) }
            }
            // case "EApply": {
            //     const func = pE0([expr.tag, 0], expr.func)
            //     const arg = pE0([expr.tag, 1], expr.arg)
            //     return { ...expr, id, func, arg, doc: pHVA(id, func.doc, arg.doc) }
            // }
            case "EApply": {
                const ed = buildLeft_ExprDoc(indent, expr, tortOpen(tort), " ", tortClose(tort),
                    (e: Expr) => {
                        return (e.tag === "EApply"
                            ? [e.func, pE1([e.tag, 1], e.arg)]
                            : [null, pE1(null, e)])
                    },
                    (e, doc, edL, edR) => {
                        assert.isTrue(e.tag === "EApply");
                        const id = genId()
                        mapListPush(addrIdsMap, (e as ExprAddr).addr, id)
                        return { ...e, func: edL, arg: edR, doc, id }
                    }
                )
                return ed
            }
            case "EDatum":
                const datumStr = expr.value === null ? "[]" : JSON.stringify(expr.value)
                return { ...expr, id, doc: pTA(id, datumStr) }
            case "EPrim": {
                const indent2 = indentInc(indent)
                const args = expr.args.map((a, i) => pExpr0(indent2, tort, ["Op", expr.name, i], a))
                if (isAlpha(expr.name)) {
                    const doc =
                        expr.args.length === 0
                            ? pTA(id, expr.name)
                            : pHVA(id, pT("("), pT(expr.name), ...args.map(a => a.doc), pT(")"))
                    return { ...expr, id, args, doc }
                }
                else {
                    const opn = tortOpen(tort)
                    const cls = tortClose(tort)
                    switch (expr.args.length) {
                        case 0: {
                            const doc = pHVA(id, pT(expr.name))
                            return { ...expr, id, args, doc }
                        }
                        case 1: {
                            // --TODO handle prefix / postfix, assume prefix for now
                            const doc = pHVA(id, pT(opn), pT(expr.name), args[0].doc, pT(cls))
                            return { ...expr, id, args, doc }
                        }
                        case 2: {
                            // TODO switch to using buildLeft_ExprDoc / buildRight_ExprDoc
                            const doc = pHVA(id, pT(opn), args[0].doc, pT(expr.name), args[1].doc, pT(cls))
                            return { ...expr, id, args, doc }
                        }
                        default:
                            assert.impossible("too many operator arguments")
                    }
                }
            }
            case "EType": {
                const tm = pE1([expr.tag, 0], expr.expr)
                const ty = pE1([expr.tag, 1], expr.type)
                const doc = pHVA(id, tm.doc, pT(":"), ty.doc)
                return { ...expr, id, expr: tm, type: ty, doc }
            }
            case "EAs": {
                const name = pT(expr.name)
                const exp = pE1([expr.tag, 1], expr.expr)
                const doc = pHVA(id, name, pT("@"), exp.doc)
                return { ...expr, id, expr: exp, doc }
            }
            case "EList": {
                const elems = expr.exprs.map((e, i) => pE1([expr.tag, i], e))
                const tl = expr.tail === null ? null : pE1([expr.tag, expr.exprs.length], expr.tail)
                const doc = pFeList(indent, style, elems.map(e => e.doc), tl?.doc ?? null)
                // TODO add annotations to the list, need to enable new ids to be generated for each pair within the list
                return { ...expr, id, exprs: elems, tail: tl, doc }
            }

            case "ELambda": {
                const ed = buildRight_ExprDoc(indent, expr, tortOpen(tort), "->", tortClose(tort),
                    (e: Expr) => {
                        return (e.tag === "ELambda"
                            ? [e.body, pE1([e.tag, 0], e.pat)]
                            : [null, pE1(null, e)])
                    },
                    (e, doc, edL, edR) => {
                        assert.isTrue(e.tag === "ELambda");
                        const id = genId()
                        mapListPush(addrIdsMap, (e as ExprAddr).addr, id)
                        return { ...e, pat: edL, body: edR, doc, id }
                    }
                )
                return ed
            }


            // case "ELambda":
            case "ELambdaMaybe":
            case "ELambdaNo":
            case "ELambdaYes": {
                const pat = pE1([expr.tag, 0], expr.pat)
                const body = pE1([expr.tag, 1], expr.body)
                const doc = pHVA(id, pat.doc, pT(lambdaOp(expr)), body.doc)
                return { ...expr, id, pat, body, doc }
            }
            case "ETermBrackets": {
                // TODO ? We don't really need to print these brackets,
                // TODO ? This node exists to change the context in which its internals are interpreted.
                // TODO ? Sufficient brackets will now be printed by the ELambda/EApply/EOp nodes.
                // TODO ? So stop printing these brackets ?
                const exp = pExpr0(indent1, "Term", null, expr.expr)
                const doc = p2List(indent, styles.std, ["(", "", ")"], [exp.doc])
                // TODO add annotations to the brackets
                return { ...expr, id, expr: exp, doc }
            }
            case "ETypeBrackets": {
                // TODO ? We don't really need to print these brackets,
                // TODO ? This node exists to change the context in which its internals are interpreted.
                // TODO ? Sufficient brackets will now be printed by the ELambda/EApply/EOp nodes.
                // TODO ? So stop printing these brackets ?
                const exp = pExpr0(indent1, "Type", null, expr.expr)
                const doc = p2List(indent, styles.std, ["{", "", "}"], [exp.doc])
                // TODO add annotations to the brackets
                return { ...expr, id, expr: exp, doc }
            }
            case "ELet": {
                const [declDocs, declsDoc] = pfDecls0(indent, tort, expr.decls);
                const exp = pE0(null, expr.expr);
                const doc = p2VA(id, declsDoc, exp.doc)
                return { ...expr, id, decls: declDocs, expr: exp, doc }
            }
            // case "EPair": {
            //     const hd = pE1([expr.tag, 0], expr.hd)
            //     const tl = pE1([expr.tag, 1], expr.tl)
            //     const doc = pHV(pT("["), hd.doc, pT(",,"), tl.doc, pT("]"))
            //     return { ...expr, id: genId(), hd, tl, doc }
            // }
            case "EPair": {
                const pairElems: [Expr & { tag: "EPair" }, ExprDoc, UiStyleNum][] = []
                let list: Expr = expr
                let style = styles.std
                let listStyles = { std: styles.std, selected: styles.selected }
                while (list.tag === "EPair") {
                    const listEA = list as ExprAddr
                    // if (listEA.addr !== undefined && selected.has(listEA.addr)) {
                    //     style = styles.selected
                    //     listStyles = { std: listStyles.selected, selected: listStyles.selected }
                    // }
                    // const elem = pE1([expr.tag, 0], list.hd)
                    const elem = pExpr0(indent1, tort, [expr.tag, 0], list.hd)
                    pairElems.push([list, elem, style])
                    list = list.tl
                }
                // TODO Determine upfront if the list is going to fit on one line,
                // TODO   then use pH or pV consistently.
                // TODO The current code makes multipe calls to pHV,
                // TODO   this breaks the intended bracket-aligning rules (matching brackets always being on either the same row or the column).
                const [lastPair, lastElem, lastStyle] = pairElems.pop()!
                let tl: ExprDoc
                let lastPairED: ExprDoc
                const isRegularList =
                    (tort === "Term" && list.tag === "EDatum" && list.value === null) ||
                    (tort === "Type" && list.tag === "EPrim" && list.name === "Nil")
                if (isRegularList) {
                    let tlStyle = lastStyle
                    const tlAddr = (list as ExprAddr).addr
                    // if (tlAddr !== undefined && selected.has(tlAddr)) {
                    //     tlStyle = styles.selected
                    // }
                    const tlId = genId()
                    const lastPairId = genId()
                    switch (list.tag) {
                        case "EDatum":
                            tl = { ...list, id: tlId, doc: p2TextAN<number>(indent, tlStyle, "]", tlId) }
                            break
                        case "EPrim":
                            tl = { ...list, args: [], id: tlId, doc: p2TextAN<number>(indent, tlStyle, "]", tlId) }
                            break
                        default:
                            assert.unreachable()
                    }
                    const doc = pHVA(lastPairId, lastElem.doc, tl.doc)
                    lastPairED = { ...lastPair, id: lastPairId, hd: lastElem, tl, doc }
                    mapListPush(addrIdsMap, (lastPair as ExprAddr).addr, lastPairId)
                    mapListPush(addrIdsMap, (tl as Expr as ExprAddr).addr, tlId)
                }
                else {
                    const lastPairId = genId()
                    tl = pE1([expr.tag, 1], expr.tl)
                    const doc = pHVA(lastPairId, lastElem.doc, pTextN(indent, lastStyle, ",,"), tl.doc, pText(indent, lastStyle, "]"))
                    lastPairED = { ...lastPair, id: lastPairId, hd: lastElem, tl, doc }
                    mapListPush(addrIdsMap, (lastPair as ExprAddr).addr, lastPairId)
                }

                let listDoc = tl.doc
                let listED: ExprDoc = lastPairED
                let pairElem: (typeof pairElems)[0] | undefined
                if (pairElems.length === 0) {
                    listED.doc = pHV(pTextN(indent, style, "["), listED.doc)
                }
                else {
                    while (pairElem = pairElems.pop()) {
                        const pairId = genId()
                        const [pairE, elemED, pairStyle] = pairElem
                        let doc: DocAnnot = pHV(elemED.doc, pTextN(indent, pairStyle, ","), listED.doc)
                        if (pairElems.length === 0) {
                            doc = pHV(pTextN(indent, pairStyle, "["), doc)
                        }
                        doc = pA(pairId, doc)
                        listED = { ...pairE, id: pairId, hd: elemED, tl: listED, doc }
                        mapListPush(addrIdsMap, (pairE as ExprAddr).addr, pairId)
                    }
                }
                return listED
            }
            case "ETypeAs":
            case "ESym":
                assert.impossible()
            default:
                assert.noMissingCases(expr)
        }
    }
}





// function addSpaces<A>(text: UiText<A>): UiText<A> {
//     if (typeof text === "string") {
//         return uiTextList<A>(text, " ")
//     }
//     else {
//         switch (text[0]) {
//             case "S":
//                 return ["S", text[1], addSpaces(text[2])]
//             case "A":
//                 return ["A", text[1], addSpaces(text[2])]
//             case "L": {
//                 const [, ...elems] = text
//                 return ["L", ...elems.flatMap((t) => [t, uiText(null, " ")])]
//             }
//             default:
//                 assert.noMissingCases(text[0])
//         }
//     }
// }

function addSpaces<A>(text: UiText<A>): UiText<A> {
    if (typeof text === "string") {
        return uiTextList<A>(text, " ")
    }
    else {
        const items = text.items?.flatMap((t) => [t, uiText(null, " ")])
        return { ...text, items }
    }
}



export function p1Show(s: UiStyleNum, doc: Doc1Annot): UiText<number> {
    const result: UiText<number>[] = []
    for (const [indent, items] of doc) {
        if (doc.length !== 1) {
            result.push(uiText(s, " ".repeat(indent)))
        }
        for (const item of items) {
            if (typeof item === "string") {
                result.push(uiText(s, item))
                result.push(uiText(s, " "))
            }
            else {
                result.push(addSpaces<number>(item))
            }
        }
        result.push(uiText(s, "\n"))
    }
    return uiTextList<number>(...result)
}

// export function p2Show(s: UiStyleNum, doc: Doc2Annot, ctx: "H" | "V", col: number): [UiText<number>, number] {
//     const result: UiText<number>[] = []

//     switch (ctx) {
//         case "H":
//             switch (doc.tag) {
//                 case "T":
//                     return [uiTextList(doc.text, " "), col + uiTextLength(doc.text) + 1]
//                 case "H": {
//                     // let first = true
//                     // let col2 = col
//                     for (const part of doc.parts) {
//                         // if (!first) {
//                         //     result.push(" ")
//                         // }
//                         let txt
//                         [txt, col] = p2Show(s, part, "H", col)
//                         result.push(txt)
//                         // result.push(" ")
//                         // col += 1
//                         // first = false
//                     }
//                     return [uiTextList(...result), col]
//                 }
//                 case "V": {
//                     for (const part of doc.parts) {
//                         // result.push("\n" + " ".repeat(part.column))
//                         // result.push(" ".repeat(part.column))
//                         if (part.column < col) {
//                             result.push("\n")
//                             col = 0
//                         }
//                         if (part.column > col) {
//                             result.push(" ".repeat(part.column - col))
//                             col = part.column
//                         }
//                         let txt
//                         [txt, col] = p2Show(s, part, "H", col)
//                         result.push(txt)
//                     }
//                     return [uiTextList(...result), col]
//                 }
//                 default:
//                     assert.noMissingCases(doc)
//             }
//         case "V":
//             assert.todo("?")
//         // switch (doc.tag) {
//         //     case "T":
//         //         return uiTextList(" ".repeat(doc.column), doc.text)
//         //     case "H":
//         //         return uiTextList(" ".repeat(doc.column)), p2Show(s, doc, "H")
//         //     case "V":
//         //         for (const part of doc.parts) {
//         //             // result.push(" ".repeat(part.column))
//         //             // result.push("\n" + " ".repeat(part.column))
//         //             result.push(p2Show(s, part, "V"))
//         //             result.push("\n")
//         //         }
//         //         return uiTextList(...result)
//         //     default:
//         //         assert.noMissingCases(doc)
//         // }
//         default:
//             assert.noMissingCases(ctx)
//     }
// }

export function p2Show2(s: UiStyleNum, doc: Doc2Annot, idTextMap: Map<number, UiText<number>>): UiText<number> {

    let col = 0

    return pShow(doc)

    function pShow(doc: Doc2Annot): UiText<number> {
        let result: UiText<number>
        switch (doc.tag) {
            case "T":
                col += uiTextLength(doc.text) + 1
                result = doc.text
                if (typeof doc.text !== "string" && doc.text.annot !== undefined) {
                    idTextMap.set(doc.text.annot, doc.text)
                }
                break
            case "H": {
                const resultParts: UiText<number>[] = []
                let first = true
                for (const part of doc.parts) {
                    if (!first) {
                        resultParts.push(" ")
                    }
                    first = false
                    resultParts.push(pShow(part))
                }
                result = uiTextList(...resultParts)
                break
            }
            case "V": {
                const resultParts: UiText<number>[] = []
                let first = true
                for (const part of doc.parts) {
                    if (!first) {
                        resultParts.push(" ")
                    }
                    first = false
                    // const partColumn = part.column
                    const partColumn = docFirstColumn(part)
                    if (partColumn < col) {
                        resultParts.push("\n")
                        col = 0
                    }
                    if (partColumn > col) {
                        const style = col === 0 ? s : null
                        const indentStr = uiText(style, " ".repeat(partColumn - col))
                        resultParts.push(indentStr)
                        col = partColumn
                    }
                    resultParts.push(pShow(part))
                }
                result = uiTextList(...resultParts)
                break
            }
            default:
                assert.noMissingCases(doc)
        }
        if (doc.annot !== undefined) {
            idTextMap.set(doc.annot, result)
        }
        return result
    }

}

export function prettyFerrum1(expr: Expr): string {
    // TODO Better handling of text styles.
    const styleZero = 0 as UiStyleNum
    const styles: PrettyFerrumStyleNums = { std: styleZero, selected: styleZero }
    const pf = mkPrettyFerrum(20, 20, styles, new Set)
    const exprD = pf.pExpr(expr)
    const exprTxt = p2Show2(styles.std, exprD.doc, new Map)
    const exprStr = uiTextToStr(exprTxt)
    return exprStr
}

export function prettyFerrum2(expr: Expr): string {
    // TODO Better handling of text styles.
    const styleZero = 0 as UiStyleNum
    const styles: PrettyFerrumStyleNums = { std: styleZero, selected: styleZero }

    const idExprMap: Map<number, ExprDoc> = new Map
    const exprIdMap: Map<ExprDoc, number> = new Map
    const addrIdsMap: Map<Addr, number[]> = new Map
    const idTextMap: Map<number, UiText<number>> = new Map

    const pf = mkPrettyFerrum2(40, 40, styles, idExprMap, exprIdMap, addrIdsMap)
    const exprD = pf.pExpr(expr)
    const exprTxt = p2Show2(styles.std, exprD.doc, idTextMap)
    const exprStr = uiTextToStr(exprTxt)
    return exprStr
}

