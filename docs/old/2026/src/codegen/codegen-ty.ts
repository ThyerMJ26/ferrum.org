// Experiment with using types to better inform code-generation
// For example, 
//   - typical lambda-maybes used when matching against values with a sum-product type,
//       should only need to compare the tag, not the length of or values of any of the remaining elements in the tuple
// Sticking with a simple "dynamic" representation for now
// Work in progress

// Syntax
import { concreteJsOpName } from "../syntax/operator.js";
import { isAlpha } from "../syntax/scan.js";
import { DeclTypeBidir, ExprLoc, ExprTypeBidir } from "../syntax/expr.js";
// Tree
import { isPrimName } from "../tree/eval.js";
import { anyT, pairT, showType2, ttiIsFalse, tiStructuralRelComp, Type, typeDom, typeHd, typeTl, unknownT } from "../tree/types.js";
// CodeGen
import { jsCall, jsDatum, JsExpr, jsLambdaExpr, jsList, jsOp, jsVar, JsStmt, JsStmts, freshVarJs, jsReturn, jsLambdaStmt, jsMethod, jsLet, jsExpr_print, jsStmts_print } from "./codegen-js.js";
import { JsEnv, JsNameSrc } from "./codegen2.js";

// TODO add type-representation to the environment
export type JsEnvTy = { [name: string]: string }


function cgty_pat(pat: ExprTypeBidir, jsEnv: JsEnvTy, jsNameSrc: JsNameSrc): [JsExpr | undefined, [string, JsExpr][]] {
    let asPats: [string, JsExpr][] = []
    function cg8_pat(pat: ExprLoc): JsExpr | undefined {
        switch (pat.tag) {
            case "EDatum": {
                return undefined
            }
            case "EVar": {
                // TODO handle wildcard
                let varJs = freshVarJs(pat.name, jsNameSrc)
                jsEnv[pat.name] = varJs
                return jsVar(varJs)
            }
            case "EAs": {
                let varJs = freshVarJs(pat.name, jsNameSrc)
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
            case "ETermBrackets": {
                return cg8_pat(pat.expr)
            }
            case "EType": {
                return cg8_pat(pat.expr)
            }

            default:
                throw new Error(`missing case ${pat.tag}`)
        }
    }
    let result = cg8_pat(pat)
    return [result, asPats]
}

function typeIsPair(ty: Type) {
    return ttiIsFalse(tiStructuralRelComp(ty, pairT(anyT, anyT), true))
}

function cgty_mat(ty: Type, pat: ExprTypeBidir, jsEnv: JsEnvTy, jsNameSrc: JsNameSrc): JsExpr | undefined {
    let tyU = unknownT
    switch (pat.tag) {
        case "EDatum": {
            // if (pat.ty1.tag==="TSingle" && pat.ty2?.tag==="TSingle") {
            if (pat.ty1.tag === "TSingle" && ty.tag === "TSingle") {
                // no point matching against a values which couldn't possibly be anything else
                // such as the nil at the end of a tuple
                return undefined
            }
            return jsDatum(pat.value)
        }
        case "EVar": {
            return undefined
        }
        case "EAs": {
            return cgty_mat(ty, pat.expr, jsEnv, jsNameSrc)
        }
        // case "EList": {
        //     let elems: (JsExpr | undefined)[] = []
        //     pat.exprs.forEach(p => {
        //         let patJs = cgty_mat(tyU, p, jsEnv, jsNameSrc)
        //         elems.push(patJs)
        //     })
        //     let tlPat: JsExpr | undefined = jsDatum(null)
        //     if (pat.tail !== null) {
        //         tlPat = cgty_mat(tyU, pat.tail, jsEnv, jsNameSrc)
        //     }
        //     let result = tlPat
        //     elems.reverse()
        //     elems.forEach(e => {
        //         result = jsList([e, result])
        //     })
        //     return result
        // }
        case "EList": {
            let elems: [(JsExpr | undefined), Type][] = []
            let tyL = ty
            pat.exprs.forEach(p => {
                // console.log(`tyL1: ${showType2(tyL)}`)
                let tyE = typeHd(tyL)
                // console.log(`tyE: ${showType2(tyE)}`)
                let patJs = cgty_mat(tyE, p, jsEnv, jsNameSrc)
                elems.push([patJs, tyL])
                tyL = typeTl(tyL)
                // console.log(`tyL2: ${showType2(tyL)}`)
            })
            let tlPat: JsExpr | undefined = jsDatum(null)
            // console.log(`tyL: (${JSON.stringify(tyL)})`)
            // if (pat.tail === null && tyL.tag === "TSingle" && tyL.val === null) {
            if (pat.tail === null && tyL.tag === "TNil") {
                tlPat = undefined
            }
            else if (pat.tail !== null) {
                tlPat = cgty_mat(tyL, pat.tail, jsEnv, jsNameSrc)
            }
            let result = tlPat
            elems.reverse()
            elems.forEach(([e, tyL]) => {
                if (result === undefined && e === undefined && typeIsPair(tyL) && tyL.tag !== "TError") {
                    // if (result === undefined && e === undefined) {
                    result = undefined
                }
                else {
                    result = jsList([e, result])
                }
            })
            return result
        }
        case "ETermBrackets": {
            return cgty_mat(ty, pat.expr, jsEnv, jsNameSrc)
        }
        case "EType": {
            return cgty_mat(ty, pat.expr, jsEnv, jsNameSrc)
        }

        default:
            throw new Error(`missing case ${pat.tag}`)
    }
}


function cgty_asPats2(asPats: [string, JsExpr][], exprJs: JsExpr): JsExpr {
    let result = asPats.reduce((result, [name, pat]) => {
        return jsCall(jsVar("rt.as"), [jsVar(name), jsLambdaExpr([pat], result)])
    }, exprJs)
    return result
}

function cgty_expr(exp: ExprTypeBidir, jsEnv: JsEnvTy, jsNameSrc: JsNameSrc): JsExpr {
    // function cgty_expr(exp: ex.Expr, jsEnv: cg.JsEnv, jsNameSrc: JsNameSrc): JsExpr {
    let cg = (e: ExprTypeBidir) => cgty_expr(e, jsEnv, jsNameSrc)
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
                // throw new Error(`unknown variable (${exp.name})`)
                return jsVar(exp.name)
            }
        }
        case "EDatum":
            return jsDatum(exp.value)
        case "EApply": {
            let args: ExprTypeBidir[] = []
            while (exp.tag === 'EApply') {
                args.unshift(exp.arg)
                exp = exp.func
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
            let [patJs, patEAs] = cgty_pat(exp.pat, jsEnv2, jsNameSrc)
            // let patEAs = cg8_asPats(exp.arg)
            let bodyJs = cgty_expr(exp.body, jsEnv2, jsNameSrc)
            bodyJs = cgty_asPats2(patEAs, bodyJs)
            let paramsJs = patJs === undefined ? [] : [patJs]
            return jsLambdaExpr(paramsJs, bodyJs)
        }
        case "ELambdaYes": {
            let jsEnv2 = { ...jsEnv }
            let [patJs, patEAs] = cgty_pat(exp.pat, jsEnv2, jsNameSrc)
            let bodyJs = cgty_expr(exp.body, jsEnv2, jsNameSrc)
            bodyJs = jsList([bodyJs, jsDatum(null)])
            bodyJs = cgty_asPats2(patEAs, bodyJs)
            let paramsJs = patJs === undefined ? [] : [patJs]
            return jsLambdaExpr(paramsJs, bodyJs)
        }
        case "ELambdaMaybe": {
            let matJs = cgty_mat(typeDom(exp.ty1), exp.pat, jsEnv, jsNameSrc)
            let jsEnv2 = { ...jsEnv }
            let [patJs, patEAs] = cgty_pat(exp.pat, jsEnv2, jsNameSrc)
            let bodyJs = cgty_expr(exp.body, jsEnv2, jsNameSrc)
            // bodyJs = jsList([bodyJs, jsDatum(null)])
            bodyJs = cgty_asPats2(patEAs, bodyJs)
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
            let matJs = cgty_mat(typeDom(exp.ty1), exp.pat, jsEnv, jsNameSrc)
            let jsEnv2 = { ...jsEnv }
            let [patJs, patEAs] = cgty_pat(exp.pat, jsEnv2, jsNameSrc)
            let bodyJs = cgty_expr(exp.body, jsEnv2, jsNameSrc)
            bodyJs = cgty_asPats2(patEAs, bodyJs)
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
        case "ELet": {
            let stmtsJs = cgty_decls(exp.decls, jsEnv, jsNameSrc)
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
                let name = isAlpha(exp.name) ? `_.${exp.name}` : `_["${exp.name}"]`
                let opJs = jsVar(name)
                let result = exp.args.reduce((result, arg) => {
                    return jsCall(result, [cg(arg)])
                }, opJs)
                return result
            }
            else {
                throw new Error(`Unknown operator (${exp.name})`)
            }
        }
        default:
            throw new Error(`missing case ${exp.tag}`)
    }
}

function cgty_decls(decls: DeclTypeBidir[], jsEnv: JsEnv, jsNameSrc: JsNameSrc): JsStmts {
    let jsStmts: JsStmts = []
    decls.forEach(([pat, defn]) => {
        let defnJs = cgty_expr(defn, jsEnv, jsNameSrc)
        let [patJs, patEAs] = cgty_pat(pat, jsEnv, jsNameSrc)
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






export function codegen_ty_exprJs(exp: ExprTypeBidir, jsEnv: JsEnvTy, jsNameSrc: JsNameSrc): [string[], string] {
    let jsExpr = cgty_expr(exp, jsEnv, jsNameSrc)
    let exprJs = jsExpr_print(jsExpr)
    let stmtsJs = ["// codegen_ty_exprJs"]
    return [stmtsJs, exprJs]
}

export function codegen_ty_declsJs(decls: DeclTypeBidir[], jsEnv: JsEnvTy, jsNameSrc: JsNameSrc): string[] {
    let jsStmts = cgty_decls(decls, jsEnv, jsNameSrc)
    let indentStmtsJs: [number, string][] = []
    jsStmts_print(0, jsStmts, indentStmtsJs)
    let stmtsJs: string[] = ["// codegen_ty_declsJs"]
    indentStmtsJs.forEach(([indent, line]) => {
        stmtsJs.push(line.padStart(indent * 4))
    })
    return stmtsJs
}



