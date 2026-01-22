// Utils
import { assert } from "../utils/assert.js"
// Syntax
import { concreteJsOpName } from "../syntax/operator.js";
import { isAlpha } from "../syntax/scan.js";
import { DeclLoc, eList, ExprLoc } from "../syntax/expr.js";
// Tree
import { isPrimName } from "../tree/eval.js";
// CodeGen
import { jsCall, jsDatum, JsExpr, jsLambdaExpr, jsList, jsOp, jsVar, JsStmt, JsStmts, freshVarJs, jsReturn, jsLambdaStmt, jsMethod, jsLet, jsStmts_print2, jsStmts_print3, freshVarName, jsExpr_print2 } from "./codegen-js.js";
import { locMatch } from "../syntax/token.js";
import { pretty_printJs } from "./pretty-js.js";

export type JsEnv = { [name: string]: string }
export type JsNameSrc = { 'id': number }


function cg8_pat(pat: ExprLoc, jsEnv: JsEnv, jsNameSrc: JsNameSrc): [JsExpr | undefined, [string, JsExpr][]] {
    let asPats: [string, JsExpr][] = []
    function cg8_pat(pat: ExprLoc): JsExpr | undefined {
        switch (pat.tag) {
            case "EDatum": {
                return undefined
            }
            case "EVar": {
                // TODO handle wildcard
                // let varJs = freshVarJs(pat.name, jsNameSrc)
                let varJs = freshVarName(pat, jsNameSrc)
                jsEnv[pat.name] = varJs
                return jsVar(varJs)
            }
            case "EAs": {
                // let varJs = freshVarJs(pat.name, jsNameSrc)
                let varJs = freshVarName(pat, jsNameSrc)
                jsEnv[pat.name] = varJs
                // descend into the pattern, so as to continue generating var names and extending the env
                let patJs = cg8_pat(pat.expr)
                if (patJs !== undefined) {
                    asPats.push([varJs, patJs])
                }
                return jsVar(varJs)
            }
            case "EList": {
                let elems: (JsExpr | undefined)[] = []
                pat.exprs.forEach(p => {
                    let patJs = cg8_pat(p)
                    elems.push(patJs)
                })
                let tlPat = undefined
                if (pat.tail !== null) {
                    tlPat = cg8_pat(pat.tail)
                }
                let result = tlPat
                elems.reverse()
                elems.forEach(e => {
                    result = jsList([e, result])
                })
                return result
            }
            case "EPair": {
                // TODO ? convert nested pairs into a single list, here or during/after graph-readback ?
                return cg8_pat(eList({ loc: pat.loc }, [pat.hd], pat.tl))
            }
            case "ETermBrackets": {
                return cg8_pat(pat.expr)
            }
            case "EType":
            case "ETypeAs": {
                return cg8_pat(pat.expr)
            }

            default:
                throw new Error(`missing case ${pat.tag}`)
        }
    }
    let result = cg8_pat(pat)
    return [result, asPats]
}


function cg8_mat(pat: ExprLoc, jsEnv: JsEnv, jsNameSrc: JsNameSrc): JsExpr | undefined {
    switch (pat.tag) {
        case "EDatum": {
            return jsDatum(pat.value)
        }
        case "EVar": {
            return undefined
        }
        case "EAs": {
            return cg8_mat(pat.expr, jsEnv, jsNameSrc)
        }
        case "EList": {
            let elems: (JsExpr | undefined)[] = []
            pat.exprs.forEach(p => {
                let patJs = cg8_mat(p, jsEnv, jsNameSrc)
                elems.push(patJs)
            })
            let tlPat: JsExpr | undefined = jsDatum(null)
            if (pat.tail !== null) {
                tlPat = cg8_mat(pat.tail, jsEnv, jsNameSrc)
            }
            let result = tlPat
            elems.reverse()
            elems.forEach(e => {
                result = jsList([e, result])
            })
            return result
        }
        case "EPair": {
            // TODO ? convert nested pairs into a single list, here or during/after graph-readback ?
            return cg8_mat(eList({ loc: pat.loc }, [pat.hd], pat.tl), jsEnv, jsNameSrc)
        }
        case "ETermBrackets": {
            return cg8_mat(pat.expr, jsEnv, jsNameSrc)
        }
        case "EType": {
            return cg8_mat(pat.expr, jsEnv, jsNameSrc)
        }

        default:
            throw new Error(`missing case ${pat.tag}`)
    }
}


function cg8_asPats2(asPats: [string, JsExpr][], exprJs: JsExpr): JsExpr {
    let result = asPats.reduce((result, [name, pat]) => {
        return jsCall(jsVar("rt.as"), [jsVar(name), jsLambdaExpr([pat], result)])
    }, exprJs)
    return result
}

function cg8_expr(exp: ExprLoc, jsEnv: JsEnv, jsNameSrc: JsNameSrc): JsExpr {
    let cg = (e: ExprLoc) => cg8_expr(e, jsEnv, jsNameSrc)
    switch (exp.tag) {
        case "EVar": {
            let varJs = jsEnv[exp.name]
            if (varJs !== undefined) {
                return jsVar(varJs)
            }
            // TODO ? Only the "primitive" primitive should be automatically in scope ?
            // else if (exp.name === "primitive") {
            else if (isPrimName(exp.name)) {
                let name = isAlpha(exp.name) ? `_.${exp.name}` : `_["${exp.name}"]`
                return jsVar(name)
            }
            else {
                throw new Error(`Unknown variable (${exp.name})`)
                // return jsVar(`UNKNOWN_${exp.name}`)
            }
        }
        case "EDatum":
            return jsDatum(exp.value)
        case "EApply": {
            let args: ExprLoc[] = []
            while (exp.tag === 'EApply') {
                args.unshift(exp.arg)
                exp = exp.func
            }

            // If the function is the blockUntil primitive, we can throw it away,
            //   and use the first argument as the function.
            if (exp.tag === "EPrim" && exp.name === "(_$?)") {
                exp = args.shift()!
            }

            let nameJs
            if (exp.tag === "EVar" && (nameJs = concreteJsOpName(exp.name)) !== null) {
                if (args.length === 2) {
                    return jsOp(nameJs, [cg(args[0]), cg(args[1])])
                }
                else {
                    throw new Error(`unexpected number of arguments (${args.length})`)
                }
            }
            else {
                let result = args.reduce((result, arg) => {
                    return jsCall(result, [cg(arg)])
                }, cg(exp))
                return result
            }
        }
        case "ELambda": {
            let jsEnv2 = { ...jsEnv }
            let [patJs, patEAs] = cg8_pat(exp.pat, jsEnv2, jsNameSrc)
            // let patEAs = cg8_asPats(exp.arg)
            let bodyJs = cg8_expr(exp.body, jsEnv2, jsNameSrc)
            bodyJs = cg8_asPats2(patEAs, bodyJs)
            let paramsJs = patJs === undefined ? [] : [patJs]
            return jsLambdaExpr(paramsJs, bodyJs)
        }
        case "ELambdaYes": {
            let jsEnv2 = { ...jsEnv }
            let [patJs, patEAs] = cg8_pat(exp.pat, jsEnv2, jsNameSrc)
            let bodyJs = cg8_expr(exp.body, jsEnv2, jsNameSrc)
            bodyJs = jsList([bodyJs, jsDatum(null)])
            bodyJs = cg8_asPats2(patEAs, bodyJs)
            let paramsJs = patJs === undefined ? [] : [patJs]
            return jsLambdaExpr(paramsJs, bodyJs)
        }
        case "ELambdaMaybe": {
            let matJs = cg8_mat(exp.pat, jsEnv, jsNameSrc)
            let jsEnv2 = { ...jsEnv }
            let [patJs, patEAs] = cg8_pat(exp.pat, jsEnv2, jsNameSrc)
            let bodyJs = cg8_expr(exp.body, jsEnv2, jsNameSrc)
            // bodyJs = jsList([bodyJs, jsDatum(null)])
            bodyJs = cg8_asPats2(patEAs, bodyJs)
            let paramsJs = patJs === undefined ? [] : [patJs]
            if (matJs !== undefined) {
                return jsCall(jsVar("rt.lambdaMaybe"), [matJs, jsLambdaExpr(paramsJs, bodyJs)])
            }
            else {
                // return jsLambdaExpr(paramsJs, bodyJs)
                return jsCall(jsVar("rt.lambdaMaybe"), [jsVar("undefined"), jsLambdaExpr(paramsJs, bodyJs)])
            }
        }
        case "ELambdaNo": {
            let matJs = cg8_mat(exp.pat, jsEnv, jsNameSrc)
            let jsEnv2 = { ...jsEnv }
            let [patJs, patEAs] = cg8_pat(exp.pat, jsEnv2, jsNameSrc)
            let bodyJs = cg8_expr(exp.body, jsEnv2, jsNameSrc)
            bodyJs = cg8_asPats2(patEAs, bodyJs)
            let paramsJs = patJs === undefined ? [] : [patJs]
            if (matJs !== undefined) {
                return jsCall(jsVar("rt.lambdaNo"), [matJs, jsLambdaExpr(paramsJs, bodyJs)])
            }
            else {
                return jsLambdaExpr(paramsJs, bodyJs)
            }
        }
        case "EList": {
            let tl = exp.tail === null ? jsDatum(null) : cg(exp.tail)
            let result = exp.exprs.reduceRight((result, elem) => {
                let elemJs = cg(elem)
                return jsList([elemJs, result])
            }, tl)
            return result
        }
        case "EPair": {
            // Read-back expressions can contain pairs.
            // TODO ? Convert nested pairs into a single list,
            // TODO ?   either here, or during readback, or somewhere in-between.
            return cg(eList({ loc: exp.loc }, [exp.hd], exp.tl))
            break
        }
        case "ELet": {
            let stmtsJs = cg8_decls(exp.decls, jsEnv, jsNameSrc)
            let expJs = cg(exp.expr)
            stmtsJs.push(jsReturn(expJs))
            return jsCall(jsLambdaStmt([], stmtsJs), [])
        }
        case "ETermBrackets": {
            return cg(exp.expr)
        }
        case "ETypeBrackets": {
            return jsDatum(null)
        }
        case "EType": {
            return cg(exp.expr)
        }
        case "EPrim": {
            const nameJs = concreteJsOpName(exp.name)
            if (nameJs !== null) {
                if (exp.args.length === 2) {
                    return jsOp(nameJs, [cg(exp.args[0]), cg(exp.args[1])])
                }
                else {
                    throw new Error(`unexpected number of arguments (${exp.args.length})`)
                }
            }
            else if (isPrimName(exp.name)) {
                const name2 = isAlpha(exp.name) ? `_.${exp.name}` : `_["${exp.name}"]`
                const opJs = jsVar(name2)
                const result = exp.args.reduce((result, arg) => {
                    return jsCall(result, [cg(arg)])
                }, opJs)
                return result
            }
            else {
                // throw new Error(`Unknown operator (${name})`)

                // TODO ? Just call "primitive" anyway, and report an unknown primitive at runtime ?
                const result = exp.args.reduce((result, arg) => {
                    return jsCall(result, [cg(arg)])
                }, jsVar(`_.primitive(${JSON.stringify(exp.name)})`))
                return result
            }
        }
        default:
            throw new Error(`missing case ${exp.tag}`)
    }
}

function cg8_decls(decls: DeclLoc[], jsEnv: JsEnv, jsNameSrc: JsNameSrc): JsStmts {
    let jsStmts: JsStmts = []
    decls.forEach(([pat, defn]) => {
        // if (pat.tag==="EVar" && pat.name === "scanSimple") assert.breakpoint()
        let defnJs = cg8_expr(defn, jsEnv, jsNameSrc)
        let [patJs, patEAs] = cg8_pat(pat, jsEnv, jsNameSrc)
        if (patJs !== undefined) {
            let letStmt = jsLet(patJs, defnJs)
            jsStmts.push(letStmt)
        }
        patEAs.reduceRight((n, [asVar, asPat]) => {
            let letStmt = jsLet(asPat, jsVar(asVar))
            jsStmts.push(letStmt)
            return null
        }, null)
    })
    return jsStmts
}





export function codegen8_exprJs(exp: ExprLoc, jsEnv: JsEnv, jsNameSrc: JsNameSrc): [string[], string] {
    let jsExpr = cg8_expr(exp, jsEnv, jsNameSrc)
    let exprJs = jsExpr_print2(0, jsExpr)
    let stmtsJs = ["// codegen8_exprJs"]
    return [stmtsJs, exprJs]
}

export function codegen8_declsJs(decls: DeclLoc[], jsEnv: JsEnv, jsNameSrc: JsNameSrc): string[] {
    let jsStmts = cg8_decls(decls, jsEnv, jsNameSrc)
    let stmtsJs: string[] = ["// codegen8_declsJs"]
    // jsStmts_print3(jsStmts, stmtsJs)
    pretty_printJs(jsStmts, stmtsJs)

    return stmtsJs
}




