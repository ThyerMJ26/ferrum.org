import { assert } from "../utils/assert.js"
import { unit } from "../utils/unit.js"

import { JsNameSrc } from "../codegen/codegen2.js";
import { EAs, EVar } from "../syntax/expr.js";
import { ExprAddr } from "../graph/graph-readback.js";

// add type-representation to the environment
// export type JsEnvTy = { [name: string]: string }


//#region Js Constructors

type Datum = string | number | boolean | null

export type JsExpr =
    { tag: "JsVar", name: string }
    | { tag: "JsDatum", datum: Datum }
    | { tag: "JsOp", opName: string, args: JsExpr[] }
    // | { tag: "JsInstanceOf", expr: JsExpr, class: string }
    // | { tag: "JsAssignExpr", lhs: JsExpr, rhs: JsExpr }  // TODO ? could just use JsOp for this ?
    // | { tag: "JsIndex", array: JsExpr, index: JsExpr }       // TODO ? ditto
    | { tag: "JsList", elems: (JsExpr | undefined)[] }
    | { tag: "JsCall", func: JsExpr, args: JsExpr[] }
    | { tag: "JsMethod", object: JsExpr, method: string }
    | { tag: "JsLambdaExpr", params: JsExpr[], body: JsExpr }
    | { tag: "JsLambdaStmt", params: JsExpr[], body: JsStmts }
    | { tag: "JsCommentExpr", comment: string, expr: JsExpr }
    | { tag: "JsParens", expr: JsExpr }
    | { tag: "JsObject", methods: [string, JsExpr][] }

// This is for absent elements in a list.
// TODO Be consistent in how a missing expression is represented.
// export type JsExprMb = JsExpr | null | undefined
export type JsExprMb =
    | JsExpr
    | null | undefined
    | { tag: "JsMissing" }


export type JsStmt =
    { tag: "JsLet", pat: JsExpr, defn: JsExpr } // TODO ? make definition optional ?
    | { tag: "JsLetUndefined", names: string[] }
    | { tag: "JsExpr", expr: JsExpr }
    // | { tag: "JsAssign", lhs: JsExpr, rhs: JsExpr }  // TODO make assignment an expression
    | { tag: "JsIf", cond: JsExpr, then: JsStmts }
    | { tag: "JsIfElse", cond: JsExpr, then: JsStmts, else: JsStmts }
    | { tag: "JsWhile", cond: JsExpr, body: JsStmts }
    | { tag: "JsDoWhile", body: JsStmts, cond: JsExpr }
    | { tag: "JsReturn", expr: JsExpr }
    | { tag: "JsCommentStmt", comment: string }
    | { tag: "JsBreak" }
    | { tag: "JsContinue" }

export type JsStmts = JsStmt[]

export type JsCtx = [JsExpr, number];

// const jsDefaultCtx = [["JsParens",["JsDatum", []]], 1];
export const jsDefaultCtx: JsCtx = [jsParens(jsDatum(null)), 1];


export function jsDatum(datum: Datum): JsExpr {
    return { tag: "JsDatum", datum: datum }
}
export function jsVar(name: string): JsExpr {
    return { tag: "JsVar", name: name }
}
export function jsCall(func: JsExpr, args: JsExpr[]): JsExpr {
    return { tag: "JsCall", func: func, args: args }
}
export function jsOp(opName: string, args: JsExpr[]): JsExpr {
    return { tag: "JsOp", opName: opName, args: args }
}
export function jsParens(expr: JsExpr): JsExpr {
    return { tag: "JsParens", expr }
}

export function jsLambdaExpr(params: JsExpr[], body: JsExpr): JsExpr {
    return { tag: "JsLambdaExpr", params: params, body: body }
}

export function jsLambdaStmt(params: JsExpr[], body: JsStmts): JsExpr {
    return { tag: "JsLambdaStmt", params: params, body: body }
}

export function jsList(elems: (JsExpr | undefined)[]): JsExpr {
    return { tag: "JsList", elems: elems }
}
export function jsExprStmt(exp: JsExpr): JsStmt {
    return { tag: "JsExpr", expr: exp }
}
export function jsReturn(exp: JsExpr): JsStmt {
    return { tag: "JsReturn", expr: exp }
}
export function jsLet(pat: JsExpr, defn: JsExpr): JsStmt {
    return { tag: "JsLet", pat: pat, defn: defn }
}
export function jsMethod(obj: JsExpr, meth: string): JsExpr {
    return { tag: "JsMethod", object: obj, method: meth }
}


export function freshVarJs(name: string, jsNameSrc: JsNameSrc): string {
    let varJs = `u${jsNameSrc.id}_${name}`
    jsNameSrc.id += 1
    return varJs
}

export function isJsLambda(exp: JsExpr): boolean {
    switch (exp.tag) {
        case "JsLambdaExpr":
            return true
        case "JsLambdaStmt":
            return true
        default:
            return false
    }
}

export function isJsExprYes(exp: JsExprMb): exp is JsExpr {
    return exp !== undefined && exp !== null && exp.tag !== "JsMissing"
}

//#endregion



//#region Js Print 1


export function jsExpr_print(expr: JsExpr): string {
    let p = jsExpr_print
    switch (expr.tag) {
        case "JsVar":
            return expr.name
        case "JsDatum":
            return JSON.stringify(expr.datum)
        case "JsList": {
            let elemsTxt = expr.elems.map(e => e === undefined ? "" : jsExpr_print(e))
            return `[${elemsTxt.join(",")}]`
        }
        case "JsCall": {
            let funTxt = jsExpr_print(expr.func)
            let argsTxt = expr.args.map(a => jsExpr_print(a))
            if (expr.func.tag === "JsLambdaExpr" || expr.func.tag === "JsLambdaStmt") {
                return `(${funTxt})(${argsTxt.join(",")})`
            }
            else {
                return `${funTxt}(${argsTxt.join(",")})`
            }
        }
        case "JsOp": {
            if (expr.args.length === 2) {
                return `(${p(expr.args[0])} ${expr.opName} ${p(expr.args[1])})`
            }
            else {
                throw new Error(`unexpected number of arguments (${expr.args.length})`)
            }
        }
        case "JsLambdaExpr": {
            let patsTxt = expr.params.map(a => p(a))
            let bodyTxt = p(expr.body)
            return `(${patsTxt.join(",")}) => (${bodyTxt})`
        }
        case "JsLambdaStmt": {
            let patsTxt = expr.params.map(a => p(a))
            let out: [number, string][] = []
            jsStmts_print(0, expr.body, out)
            return `(${patsTxt.join(",")}) => {${out.map(([i, s]) => s).join(" ")}}`
        }
        case "JsMethod": {
            let obj = p(expr.object)
            if (isJsLambda(expr.object)) {
                obj = `(${obj})`
            }
            return `${obj}.${expr.method}`
        }
        default:
            throw new Error(`missing case ${expr.tag}`)
    }
}

export function jsStmt_print(indent: number, stmt: JsStmt, lines: [number, string][]): unit {
    let pe = jsExpr_print
    switch (stmt.tag) {
        case "JsExpr":
            lines.push([indent, `${pe(stmt.expr)};`])
            break
        case "JsLet": {
            lines.push([indent, `let ${pe(stmt.pat)} = ${pe(stmt.defn)};`])
            break
        }
        case "JsReturn": {
            lines.push([indent, `return ${pe(stmt.expr)};`])
            break
        }
        default:
            throw new Error(`missing case ${stmt.tag}`)
    }
}

export function jsStmts_print(indent: number, stmts: JsStmts, lines: [number, string][]): unit {
    stmts.forEach(stmt => {
        jsStmt_print(indent, stmt, lines)
    })
}


//#endregion



//#region Js Print 2


export function freshVarName(v: EVar | EAs, jsNameSrc: JsNameSrc): string {
    const v2 = v as EVar & ExprAddr
    const a = v2.addr === undefined ? "" : `_a${v2.addr}`
    let varJs = `u${jsNameSrc.id}${a}_${v.name}`
    jsNameSrc.id += 1
    return varJs
}

export function jsExpr_print2(indent: number, expr: JsExpr): string {
    const pe = (expr: JsExpr) => jsExpr_print2(indent, expr)
    const ps = jsStmts_print2
    switch (expr.tag) {
        case "JsVar":
            return expr.name
        case "JsDatum":
            return JSON.stringify(expr.datum)
        case "JsList": {
            let elemsTxt = expr.elems.map(e => e === undefined ? "" : pe(e))
            return `[${elemsTxt.join(",")}]`
        }
        case "JsCall": {
            let funTxt = pe(expr.func)
            let argsTxt = expr.args.map(a => pe(a))
            if (expr.func.tag === "JsLambdaExpr" || expr.func.tag === "JsLambdaStmt") {
                return `(${funTxt})(${argsTxt.join(",")})`
            }
            else {
                return `${funTxt}(${argsTxt.join(",")})`
            }
        }
        case "JsOp": {
            if (expr.args.length === 2) {
                return `(${pe(expr.args[0])} ${expr.opName} ${pe(expr.args[1])})`
            }
            else {
                throw new Error(`unexpected number of arguments (${expr.args.length})`)
            }
        }
        case "JsLambdaExpr": {
            let patsTxt = expr.params.map(a => pe(a))
            let bodyTxt = pe(expr.body)
            return `(${patsTxt.join(",")}) => (${bodyTxt})`
        }
        case "JsLambdaStmt": {
            let patsTxt = expr.params.map(a => pe(a))
            let out: [number, string][] = []
            ps(indent + 1, expr.body, out)
            // return `(${patsTxt.join(",")}) => {${out.map(([i, s]) => s).join(" ")}}`

            return [
                `(${patsTxt.join(",")}) => {`,
                ...out.map(([i, s]) => " ".repeat(i * 4) + s),
                `}`
            ].join("\n")

        }
        case "JsMethod": {
            let obj = pe(expr.object)
            if (isJsLambda(expr.object)) {
                obj = `(${obj})`
            }
            return `${obj}.${expr.method}`
        }
        case "JsCommentExpr":
        case "JsParens":
        case "JsObject":
            assert.todo("?")
        default:
            assert.noMissingCases(expr)
    }
}


export function jsStmt_print2(indent: number, stmt: JsStmt, lines: [number, string][]): unit {
    const pe = (expr: JsExpr) => jsExpr_print2(indent, expr)
    switch (stmt.tag) {
        case "JsExpr":
            lines.push([indent, `${pe(stmt.expr)};`])
            break
        case "JsLet": {
            lines.push([indent, `let ${pe(stmt.pat)} = ${pe(stmt.defn)};`])
            break
        }
        case "JsReturn": {
            lines.push([indent, `return (${pe(stmt.expr)});`])
            break
        }
        case "JsLetUndefined":
        case "JsIf":
        case "JsIfElse":
        case "JsWhile":
        case "JsDoWhile":
        case "JsCommentStmt":
        case "JsBreak":
        case "JsContinue":
            assert.todo("?")
        default:
            assert.noMissingCases(stmt)
    }
}

export function jsStmts_print2(indent: number, stmts: JsStmts, lines: [number, string][]): unit {
    stmts.forEach(stmt => {
        jsStmt_print2(indent, stmt, lines)
    })
}

export function jsStmts_print3(stmts: JsStmts, lines: string[]): unit {
    const indentLines: [number, string][] = []
    jsStmts_print2(0, stmts, indentLines)
    for (const [indent, text] of indentLines) {
        lines.push(" ".repeat(indent * 4) + text)
    }
    // const result = lines.map(([indent, text]) => " ".repeat(indent * 4) + text)
    // return result
}


//#endregion