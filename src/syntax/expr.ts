
import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"
import { Loc, mkPos, nilLoc, nilPos0 } from "../syntax/token.js"
import { Type, showType2, showType4, TypeCheckResult } from "../tree/types.js"
import { mkLoc } from "./token.js"

export type TorT = "Term" | "Type"
export type TorP = "Term" | "Pat"


// let showType = showType2
let showType = (ty: Type) => showType4(ty, null, null)

export type ApplyOp = "" | "<|" | "|>"

export type EVar<T = {}> = T & { tag: "EVar", name: string }
export type ELambda<T> = T & { tag: "ELambda", pat: Expr<T>, body: Expr<T> }
export type ELambdaMaybe<T> = T & { tag: "ELambdaMaybe", pat: Expr<T>, body: Expr<T> }
export type ELambdaNo<T> = T & { tag: "ELambdaNo", pat: Expr<T>, body: Expr<T> }
export type ELambdaYes<T> = T & { tag: "ELambdaYes", pat: Expr<T>, body: Expr<T> }
export type EApply<T> = T & { tag: "EApply", func: Expr<T>, arg: Expr<T>, op: ApplyOp }
export type EDatum<T> = T & { tag: "EDatum", value: any }
export type ELet<T> = T & { tag: "ELet", decls: Decl<T>[], expr: Expr<T> }
export type EPair<T> = T & { tag: "EPair", hd: Expr<T>, tl: Expr<T> }
export type EType<T> = T & { tag: "EType", expr: Expr<T>, type: Expr<T> }
export type EAs<T = {}> = T & { tag: "EAs", name: string, expr: Expr<T> }
export type EList<T> = T & { tag: "EList", exprs: Expr<T>[], tail: Expr<T> | null }
export type ESym<T> = T & { tag: "ESym", name: string }
export type EPrim<T> = T & { tag: "EPrim", name: string, args: Expr<T>[] }

// TODO ? A single unified ELambda
// TODO ? Incorporate the type-as name in the lambda, 
// TODO ?   this should help reduce/remove the special-case handling of EAs nodes in various places.
export type ELambda2<T> = T & { tag: "ELambda", op: LambdaOp, patTm: Expr<T>, patTyName: EVar<T> | null, body: Expr<T> }

// TODO ? Provide a distinct node type for a three-place operator ( <expr> : <name> @ <type> ) ?
// TODO ? Only permit use of this at the root of lambda (and let?) patterns ?
export type ETypeAs<T> = T & { tag: "ETypeAs", expr: Expr<T>, name: string, type: Expr<T> }



// TODO ?
export type ETypeAnnot<T> = T & { tag: "ETypeAnnot", expr: Expr<T>, type: Expr<T> }
export type ETypeBrackets<T> = T & { tag: "ETypeBrackets", expr: Expr<T> }
export type ETermBrackets<T> = T & { tag: "ETermBrackets", expr: Expr<T> }


export type Decl<T> = [Expr<T>, Expr<T>]
export type Expr<T = {}> =
    EVar<T> | ELambda<T> | EApply<T> | EDatum<T> | ELet<T> | EPair<T>
    | EType<T> | EAs<T> | ETypeAs<T>
    | EList<T>
    | ELambdaMaybe<T> | ELambdaNo<T> | ELambdaYes<T>
    | ETermBrackets<T> | ETypeBrackets<T>
    | ESym<T> | EPrim<T>

export type AltT<T> = [Expr<T>, Expr<T>]

export function eAs<A extends {}>(annot: A, name: string, expr: Expr<A>): Expr<A> {
    return { tag: "EAs", ...annot, name: name, expr: expr }
}
export function eVar<A extends {}>(annot: A, name: string): Expr<A> {
    return { tag: "EVar", ...annot, name: name }
}
export function eDatum<A extends {}>(annot: A, value: any): Expr<A> {
    return { tag: "EDatum", ...annot, value: value }
}
export function eApply<A extends {}>(annot: A, func: Expr<A>, arg: Expr<A>, op?: ApplyOp): Expr<A> {
    if (op === undefined) {
        op = ""
    }
    return { tag: "EApply", ...annot, func: func, arg: arg, op }
}
export function eLet<A extends {}>(annot: A, decls: Decl<A>[], expr: Expr<A>): Expr<A> {
    return { tag: "ELet", ...annot, decls: decls, expr: expr }
}
export function eLambda<A extends {}>(annot: A, arg: Expr<A>, body: Expr<A>): Expr<A> {
    return { tag: "ELambda", ...annot, pat: arg, body: body }
}
export function eLambdaMaybe<A extends {}>(annot: A, arg: Expr<A>, body: Expr<A>): Expr<A> {
    return { tag: "ELambdaMaybe", ...annot, pat: arg, body: body }
}
export function eLambdaNo<A extends {}>(annot: A, arg: Expr<A>, body: Expr<A>): Expr<A> {
    return { tag: "ELambdaNo", ...annot, pat: arg, body: body }
}
export function eLambdaYes<A extends {}>(annot: A, arg: Expr<A>, body: Expr<A>): Expr<A> {
    return { tag: "ELambdaYes", ...annot, pat: arg, body: body }
}
export let eLambdaOption = eLambdaMaybe


export function eSym<A extends {}>(annot: A, name: string): Expr<A> {
    return { tag: "ESym", ...annot, name: name }
}

export function ePrim<A extends {}>(annot: A, name: string, args: Expr<A>[]): Expr<A> {
    return { tag: "EPrim", ...annot, name, args: args }
}


// export function tLambda(loc: Location, arg: Expr, body: Expr): Expr {
//     return { tag: "TLambda", loc: loc, pat: arg, body: body }
// }

export function eTuple<A extends {}>(annot: A, elems: Expr<A>[]): Expr<A> {
    if (elems.length === 0) {
        return eDatum(annot, null)
    }
    else {
        // return { tag: "ETuple", loc: loc, exprs: elems }
        return { tag: "EList", ...annot, exprs: elems.slice(0, elems.length - 1), tail: elems[elems.length - 1] }
    }
}

export function eList<A extends {}>(annot: A, elems: Expr<A>[], tail: Expr<A> | null = null): Expr<A> {
    if (elems.length === 0) {
        return eDatum(annot, null)
    }
    else {
        return { tag: "EList", ...annot, exprs: elems, tail: tail }
    }
}

export function eTermBrackets<A extends {}>(annot: A, expr: Expr<A>): Expr<A> {
    return { tag: "ETermBrackets", ...annot, expr: expr }
}

export function eTypeBrackets<A extends {}>(annot: A, expr: Expr<A>): Expr<A> {
    return { tag: "ETypeBrackets", ...annot, expr: expr }
}

export function eTypeAnnot<A extends {}>(annot: A, term: Expr<A>, type: Expr<A>): Expr<A> {
    return { tag: "EType", ...annot, expr: term, type: type }
}

export function eTypeAs<A extends {}>(annot: A, term: Expr<A>, name: string, type: Expr<A>): Expr<A> {
    return eTypeAnnot(annot, term, eAs(annot, name, type))
    // return { tag: "ETypeAs", loc: loc, expr: term, name, type }
}





export type LambdaExpr<T> =
    | ELambda<T>
    | ELambdaMaybe<T>
    | ELambdaNo<T>
    | ELambdaYes<T>

export type LambdaOp = "->" | "=>" | "|->" | "|=>"
export function lambdaOp<T>(lambdaExpr: LambdaExpr<T>): LambdaOp {
    switch (lambdaExpr.tag) {
        case "ELambda":
            return "->"
        case "ELambdaYes":
            return "=>"
        case "ELambdaNo":
            return "|->"
        case "ELambdaMaybe":
            return "|=>"
        default:
            assert.noMissingCases(lambdaExpr)
    }
}

export function isLambdaExpr<T>(expr: Expr<T>): expr is LambdaExpr<T> {
    switch (expr.tag) {
        case "ELambda":
        case "ELambdaYes":
        case "ELambdaNo":
        case "ELambdaMaybe":
            return true
        default:
            return false
    }
}

export function isPatTypeAnnotated<T>(pat: Expr<T>): boolean {
    const ipta = isPatTypeAnnotated
    switch (pat.tag) {
        case "EType":
        case "ETypeAs":
            return true
        case "EVar":
        case "EDatum":
            return false
        case "ETermBrackets":
        case "ETypeBrackets":
        case "EAs":
            return ipta(pat.expr)
        case "EPair":
            return ipta(pat.hd) || ipta(pat.tl)
        case "EList":
            for (const elem of pat.exprs) {
                if (ipta(elem)) {
                    return true
                }
            }
            if (pat.tail !== null) {
                return ipta(pat.tail)
            }
            return false
        default:
            assert.unreachable()
    }
}

// In the long run type such as {A+B} should be supported.
// This means the set of values the could be produced by adding elements of types A and B together.
// e.g. The sum of two 6-sided dice:
//   { (Integer 1 6) + (Integer 1 6) } reduces to (Integer 2 12)
// Giving a form of width propagation more precise than just tracking the bit-width.
// For now, only supporting special case handling of:
//   type union, intersection and relative-complement
// let typeOperators: { [name: string]: string } = {
//     "|": "unionT",
//     "&": "intersectT",
//     "\\": "relCompT"
// }

// export function convertTypeBrackets(loc: Location | null, expr: Expr, inBrackets = false): Expr {
//     if (loc === null) {
//         loc = expr.loc
//     }
//     let result: Expr
//     switch (expr.tag) {
//         case "EApply": {
//             let func = convertTypeBrackets(null, expr.func, true)
//             let arg = convertTypeBrackets(null, expr.arg, true)
//             if (func.tag === "EApply" && func.func.tag === "EVar" && typeOperators.hasOwnProperty(func.func.name)) {
//                 let opName = typeOperators[func.func.name]
//                 let opVar = eVar(func.func.loc, opName)
//                 let arg1 = eTypeBrackets(func.arg.loc, func.arg)
//                 let arg2 = eTypeBrackets(arg.loc, arg)
//                 return eTermBrackets(expr.loc, eApply(expr.loc, eApply(func.loc, opVar, arg1), arg2))
//             }
//             // result = expr
//             result = eApply(expr.loc, func, arg)
//             break
//         }
//         case "EVar": {
//             // variables stand for themselves 
//             // they have the same meaning in type-brackets as term-brackets
//             return expr
//             // result = expr 
//             // break
//         }
//         case "EDatum": {
//             if (expr.value === null) {
//                 result = expr
//             }
//             else if (typeof (expr.value) === "string") {
//                 result = expr
//             }
//             else {
//                 throw new Error(`invalid literal (${JSON.stringify(expr.value)}) in type-brackets at (${showLoc(loc)})`)
//             }
//             break
//         }
//         case "ELambda": {
//             let arg = convertTypeBrackets(null, expr.pat, true)
//             let body = convertTypeBrackets(null, expr.body, true)
//             result = eLambda(expr.loc, arg, body)
//             break
//         }
//         case "EList": {
//             let elems = expr.exprs.map(elem => convertTypeBrackets(null, elem, true))
//             let tail = eLit(expr.loc, null)
//             if (expr.tail !== null) {
//                 tail = convertTypeBrackets(null, expr.tail, true)
//             }
//             result = eList(expr.loc, elems, tail)
//             break
//         }
//         case "ETermBrackets": {
//             result = expr
//             break
//         }
//         case "ETypeBrackets": {
//             result = expr
//             // result = convertTypeBrackets(null, expr.expr)
//             break
//         }
//         case "EAs": {
//             let expr2 = convertTypeBrackets(null, expr.expr, true)
//             result = eAs(expr.loc, expr.name, expr2)
//             break
//         }
//         case "EType": {
//             let term = expr.expr
//             let type = convertTypeBrackets(null, expr.type, true)
//             result = eTypeAnnot(expr.loc, term, type)
//             break
//         }
//         case "EPrim": {
//             result = eOp(expr.loc, expr.defn, expr.args.map(a => convertTypeBrackets(null, a, true)))
//             break
//         }
//         default:
//             throw new Error(`missing case ${expr.tag}`)
//         //     return { tag: "ETypeBrackets", loc: loc, expr: expr }
//     }
//     if (!inBrackets) {
//         return { tag: "ETypeBrackets", loc: loc, expr: result }
//     }
//     else {
//         // avoid unneccessary nesting of type-brackets
//         return result
//     }
// }

export type LocField = { loc: Loc }
export type LocMbField = { loc: Loc | null }

// export type Expr = Expr<{}>
export type DeclNoLoc = Decl<{}>

export type ExprLoc = Expr<LocField>
export type DeclLoc = Decl<LocField>
export type AltLoc = AltT<LocField>

export type ExprMbLoc = Expr<LocMbField>
export type DeclMbLoc = Decl<LocMbField>
export type AltMbLoc = AltT<LocMbField>

type TypeAnnot = {
    ty: Type,
    tc?: TypeCheckResult | null
}
export type ExprType = Expr<LocField & TypeAnnot>
export type DeclType = Decl<LocField & TypeAnnot>


export type TypeAnnotBidir = {
    ty1: Type,  // synthesized
    ty2: Type | null,  // context
    tc?: TypeCheckResult | null
}
export type ExprTypeBidir = Expr<LocField & TypeAnnotBidir>
export type DeclTypeBidir = Decl<LocField & TypeAnnotBidir>

export type VarTypeBidir = ExprTypeBidir & { tag: "EVar" }

export function assumeExprIsTyped<T>(expr: ExprLoc): asserts expr is T & ExprTypeBidir {
    return
}

// This provides a quick way to check and cast an Expr to a ExprTypeBidir.
// This is used by the code-runners, some of which require types, 
//   but the CodeRunner interface doesn't guarantee that type-checking has been done.
export function isExprTyped(expr: ExprLoc): expr is ExprTypeBidir {
    const exprTy = expr as ExprTypeBidir
    return exprTy.ty1 !== undefined && exprTy.ty2 !== undefined
}
export function isDeclTyped(decl: DeclLoc): decl is DeclTypeBidir {
    const [pat, defn] = decl
    return isExprTyped(pat) && isExprTyped(defn)
}
// export function isExprTypeChecked(expr: Expr): expr is ExprTypeBidir {
//     const exprTy = expr as ExprTypeBidir
//     return exprTy.ty1 !== undefined && exprTy.ty2 !== undefined && exprTy.tc !== undefined
// }

export function exprParts<T>(exp: Expr<T>): [string, string[], string[]] {
    switch (exp.tag) {
        case "EAs":
            return [exp.tag, ["name"], ["expr"]]
        case "EApply":
            return [exp.tag, [], ["func", "arg"]]
        case "ELambda":
            return [exp.tag, [], ["pat", "body"]]
        case "ELambdaMaybe":
            return [exp.tag, [], ["pat", "body"]]
        case "ELambdaNo":
            return [exp.tag, [], ["pat", "body"]]
        case "ELambdaYes":
            return [exp.tag, [], ["pat", "body"]]
        case "ELet":
            // return [expr.tag, [], ["expr", "decls"]]
            return [exp.tag, [], ["decls", "expr"]]
        case "EDatum":
            return [exp.tag, ["value"], []]
        case "EPair":
            return [exp.tag, [], ["hd", "tl"]]
        case "EType":
            return [exp.tag, [], ["expr", "type"]]
        case "ETypeAs":
            return [exp.tag, ["name"], ["expr", "type"]]
        case "EVar":
            return [exp.tag, ["name"], []]
        case "EList":
            return [exp.tag, [], exp.tail === null ? ["exprs"] : ["exprs", "tail"]]
        case "ETypeBrackets":
            return [exp.tag, [], ["expr"]]
        case "ETermBrackets":
            return [exp.tag, [], ["expr"]]
        case "EPrim":
            return [exp.tag, ["name"], ["args"]]
        default:
            throw new Error(`missing case $ {expr.tag}`)
    }
}
export function exprChildTorT<T>(exp: Expr<T>, field: string): TorT | null {
    switch (exp.tag) {
        case "ETypeBrackets": return "Type"
        case "ETermBrackets": return "Term"
        default: return null
    }
}
export function exprChildTorP<T>(exp: Expr<T>, field: string): TorP | null {
    switch (exp.tag) {
        case "ELambda":
        case "ELambdaYes":
        case "ELambdaNo":
        case "ELambdaMaybe":
            return field === "pat" ? "Pat" : "Term"
        default: return null
    }
}

type TransformExpr<T1, T2> = (expr: Expr<T1>) => Expr<T2>

// export function exprList1Transform<T1, T2>(expr: ExprT<T1>[], transform: TransformExpr<T1, T2>): ExprT<T2>[] {
//     return expr.map(e => exprTransform(e, transform))
// }
// export function pairListTransform<T1, T2>(decls: [ExprT<T1>, ExprT<T1>][], transform: TransformExpr<T1, T2>): [ExprT<T1>, ExprT<T1>][] {
//     return decls.map(([p, d]) => [exprTransform(p, transform), exprTransform(d, transform)])
// }

// export function exprTransform<T1, T2>(expr: ExprT<T1>, transform: TransformExpr<T1, T2>): ExprT<T2> {
//     let e = expr
//     let t = transform
//     let r = (exp: ExprT<T1>) => exprTransform(exp, transform)
//     let rn = (e: ExprT<T1> | null) => (e === null ? null : r(e))
//     let rle = (e: ExprT<T1>[]) => exprList1Transform(e, transform)
//     let rlp = (p: [ExprT<T1>, ExprT<T1>][]) => pairListTransform<T1, T2>(p, transform)
//     switch (e.tag) {
//         case 'EAs':
//             return t({ ...e, expr: r(e.expr) })
//         case 'EApply':
//             return t({ ...e, func: r(e.func), arg: r(e.arg) })
//         case 'ELambda':
//         case 'ELambdaMaybe':
//         case "ELambdaNo":
//         case "ELambdaYes":
//             return t({ ...e, pat: r(e.pat), body: r(e.body) })
//         case "ELet":
//             return t({ ...e, decls: rlp(e.decls), expr: (r(e.expr)) })
//         case 'ELit':
//             return t({ ...e })
//         case 'EPair':
//             return t({ ...e, hd: r(e.hd), tl: r(e.tl) })
//         case 'EType':
//             return t({ ...e, expr: r(e.expr), type: r(e.type) })
//         case "ETypeAs":
//             return t({ ...e, expr: r(e.expr), type: r(e.type) })
//         case 'EVar':
//             return t({ ...e })
//         case 'EList':
//             return t({ ...e, exprs: rle(e.exprs), tail: rn(e.tail) })
//         case 'ETypeBrackets':
//             return t({ ...e, expr: r(e.expr) })
//         case 'ETermBrackets':
//             return t({ ...e, expr: r(e.expr) })
//         case "EPrim":
//             return t({ ...e, args: rle(e.args) })
//         default:
//             throw new Error(`missing case $ {expr.tag}`)
//     }
// }

export type ExprTransformer<T1, T2> = {
    expr(expr: Expr<T1>): Expr<T2>
    // TODO ? Handle locations ?
    // loc?(loc: Loc): Loc
    // TODO ? More specific handlers for list-elems and let-decls
    // exprList 
    // exprPairList

    term?(expr: Expr<T1>): Expr<T2>
    type?(expr: Expr<T1>): Expr<T2>
    pat_defn?(pat: Expr<T1>, defn: Expr<T1>): [Expr<T2>, Expr<T2>]

}

export type ExprWalker<T> = {
    expr(expr: Expr<T>): undefined
    // TODO ? Handle locations ?
    // loc?(loc: Loc): Loc
    // TODO ? More specific handlers for list-elems and let-decls
    // exprList 
    // exprPairList

    term?(expr: Expr<T>): undefined
    type?(expr: Expr<T>): undefined
    bind?(pat: Expr<T>, defn: Expr<T>): undefined
}

export function exprTransform2List<T1, T2>(expr: Expr<T1>[], transform: ExprTransformer<T1, T2>): Expr<T2>[] {
    return expr.map(e => transform.expr(e))
}
export function exprTransform2PairList<T1, T2>(decls: [Expr<T1>, Expr<T1>][], transform: ExprTransformer<T1, T2>): [Expr<T1>, Expr<T1>][] {
    return decls.map(([p, d]) => [transform.expr(p), transform.expr(d)])
}



export function exprTransform<T1, T2>(expr: Expr<T1>, transform: ExprTransformer<T1, T2>): Expr<T2> {
    let e = expr

    const r = (expr: Expr<T1>) => transform.expr(expr)
    let rn = (e: Expr<T1> | null) => (e === null ? null : r(e))
    let rle = (e: Expr<T1>[]) => exprTransform2List(e, transform)
    let rlp = (p: [Expr<T1>, Expr<T1>][]) => exprTransform2PairList<T1, T1>(p, transform)

    switch (e.tag) {
        case "EAs":
            return { ...e, expr: r(e.expr) }
        case "EApply":
            return { ...e, func: r(e.func), arg: r(e.arg) }
        case "ELambda":
        case "ELambdaMaybe":
        case "ELambdaNo":
        case "ELambdaYes":
            return { ...e, pat: r(e.pat), body: r(e.body) }
        case "ELet":
            return { ...e, decls: rlp(e.decls), expr: (r(e.expr)) }
        case "EDatum":
            return { ...e }
        case "EPair":
            return { ...e, hd: r(e.hd), tl: r(e.tl) }
        case "EType":
            return { ...e, expr: r(e.expr), type: r(e.type) }
        case "ETypeAs":
            return { ...e, expr: r(e.expr), type: r(e.type) }
        case "EVar":
            return { ...e }
        case "EList":
            return { ...e, exprs: rle(e.exprs), tail: rn(e.tail) }
        case "ETypeBrackets":
            return { ...e, expr: r(e.expr) }
        case "ETermBrackets":
            return { ...e, expr: r(e.expr) }
        case "EPrim":
            return { ...e, args: rle(e.args) }
        case "ESym":
            // NOTE: symbols only exist before operator precedence is resolved.
            // TODO: ? Use distinct and more precise types for before and after operator precedence resolution ?
            assert.impossible()
        default:
            assert.noMissingCases(e)
    }
}

export function exprTourList<T>(expr: Expr<T>[], walk: ExprWalker<T>): undefined {
    expr.map(e => exprTour(e, walk))
}
export function exprTourPairList<T>(decls: [Expr<T>, Expr<T>][], walk: ExprWalker<T>): undefined {
    decls.map(([p, d]) => [walk.expr(p), walk.expr(d)])
}

export function exprTour<T>(expr: Expr<T>, walk: ExprWalker<T>): undefined {
    let e = expr

    const r = (expr: Expr<T>) => walk.expr(expr)
    let rn = (e: Expr<T> | null) => (e === null ? null : r(e))
    let rle = (e: Expr<T>[]) => exprTourList(e, walk)
    let rlp = (p: [Expr<T>, Expr<T>][]) => exprTourPairList<T>(p, walk)

    switch (e.tag) {
        case "EAs":
            r(e.expr)
            break
        case "EApply":
            r(e.func)
            r(e.arg)
            break
        case "ELambda":
        case "ELambdaMaybe":
        case "ELambdaNo":
        case "ELambdaYes":
            r(e.pat)
            r(e.body)
            break
        case "ELet":
            rlp(e.decls)
            r(e.expr)
            break
        case "EDatum":
            break
        case "EPair":
            r(e.hd)
            r(e.tl)
            break
        case "EType":
            r(e.expr)
            r(e.type)
            break
        case "ETypeAs":
            r(e.expr)
            r(e.type)
            break
        case "EVar":
            break
        case "EList":
            rle(e.exprs)
            rn(e.tail)
            break
        case "ETypeBrackets":
            r(e.expr)
            break
        case "ETermBrackets":
            r(e.expr)
            break
        case "EPrim":
            rle(e.args)
            break
        default:
            throw new Error(`missing case $ {expr.tag}`)
    }
}

/** A medium-depth copy.
    Creates fresh objects for all of the expressions (and arrays of expressions).
    Reuses any other reachable objects (locations, types, anything else unknown). */

export function exprCopy<T>(expr: Expr<T>): Expr<T> {
    return copy(expr)
    function copy(exp: Expr<T>): Expr<T> {
        return exprTransform(exp, {
            expr: e => copy(e),
        })
    }
}

type visitK = () => [string, string, string[], visitK[]]

export function visitExpr<T>(expr: Expr<T>, visitor: visitK): [string, string[], visitK[]] {
    return ["", [], []]
}

export function getExprLoc(expr: ExprLoc): Loc {
    if (expr.loc === null) {
        // return { filename: "", range: { start: mkPos2(0, 0, 0), end: mkPos2(0, 0, 0) }, lineStarts: [] }
        return mkLoc("", nilPos0, nilPos0)
    }
    else {
        return expr.loc
    }
}

export type ExprTree<T> = Expr<T> | Expr<T>[] | Expr<T>[][] | Expr<T>[][][]

export type VisitCall<T> = (field: number | string, exp: ExprTree<T>) => void

export function visitAll<T>(field: number | string, exp: ExprTree<T>, pre: VisitCall<T> | null, post: VisitCall<T> | null): void {
    if (pre !== null) {
        pre(field, exp)
    }
    if (exp instanceof Array) {
        exp.forEach((child: ExprTree<T>, index: number) => {
            // pre(index, child)
            visitAll(index, child, pre, post)
            // post(index, child)
        })
    }
    else {
        exprParts(exp)[2].forEach((name) => {
            let child = (exp as any)[name]
            // pre(name, child)
            visitAll(name, child, pre, post)
            // post(name, child)

        })
    }
    if (post !== null) {
        post(field, exp)
    }
}

export type VisitCallExpr<T> = (tort: TorT, torp: TorP, field: number | string, exp: Expr<T>) => void
export function visitAllExpr<T>(tort: TorT, torp: TorP, field: number | string, exp: Expr<T>, pre: VisitCallExpr<T> | null, post: VisitCallExpr<T> | null): void {
    if (pre !== null) {
        pre(tort, torp, field, exp)
    }
    for (const name of exprParts(exp)[2]) {
        let child = (exp as any)[name]
        switch (exp.tag) {
            case "ELet":
                visitAllDecls(tort, torp, exp.decls, pre, post)
                break
            case "EList":
                visitAllExprList(tort, torp, exp.exprs, pre, post)
                if (exp.tail !== null) {
                    visitAllExpr(tort, torp, "tail", exp.tail, pre, post)
                }
                break
            case "EPrim":
                visitAllExprList(tort, torp, exp.args, pre, post)
                break
            default:
                const tort2 = exprChildTorT(exp, name) ?? tort
                const torp2 = exprChildTorP(exp, name) ?? torp
                visitAllExpr(tort2, torp2, name, child, pre, post)
        }

    }
    if (post !== null) {
        post(tort, torp, field, exp)
    }
}

export function visitAllExprList<T>(tort: TorT, torp: TorP, exprs: Expr<T>[], pre: VisitCallExpr<T> | null, post: VisitCallExpr<T> | null): void {
    for (let i = 0; i != exprs.length; i++) {
        const expr = exprs[i]
        visitAllExpr(tort, torp, i, expr, pre, post)
    }
}

// TODO ? Rename to declsTourAll ?
export function visitAllDecls<T>(tort: TorT, torp: TorP, decls: Decl<T>[], pre: VisitCallExpr<T> | null, post: VisitCallExpr<T> | null): void {
    for (let i = 0; i !== decls.length; i++) {
        const [pat, defn] = decls[i]
        visitAllExpr(tort, "Pat", i, pat, pre, post)
        visitAllExpr(tort, "Term", i, defn, pre, post)
    }
}

// TODO ? Rename to ExprWalker ?
export type VisitArrayCall<T> = (field: number[], exp: Expr<T>) => void
export type VisitExprCall<T> = (field: (number | string)[], exp: Expr<T>) => void


export function visitArray<T>(fields: (number | string)[], exp: ExprTree<T>, visit: VisitExprCall<T>): void {
    if (exp instanceof Array) {
        exp.forEach((child: ExprTree<T>, index: number) => {
            let fields2 = [...fields, index]
            visitArray(fields2, child, visit)
        })
    }
    else {
        visit(fields, exp)
    }
}


// TODO ? Rename to exprTreeTour ?
export function visitChildren<T>(exp: ExprTree<T>, visit: VisitExprCall<T>): void {
    if (exp instanceof Array) {
        visitArray([], exp, visit)
    }
    else {
        exprParts(exp)[2].forEach((name) => {
            let child = (exp as any)[name]
            if (child instanceof Array) {
                visitArray([name], child, visit)
            }
            else {
                visit([name], child)
            }
        })
    }
}

// TODO ? Rename to exprTreeTour ?
export function visitParentOrChildren<T>(exp: ExprTree<T>, visit: VisitExprCall<T>): void {
    if (exp instanceof Array) {
        visitArray([], exp, visit)
    }
    else {
        visit([], exp)
    }
}

export class Output {
    lines1: string[] = [""]
    nextLine: string = ""
    nextMargin: string = ""
    level: number = 0
    // spacesPerIndent = 4
    spacesPerIndent = 1
    marginWidth = 8
    indentStack: number[] = [0]
    // line(line: string, level: null | number = null, margin: string = "/**/"): void {
    //     if (level === null) {
    //         level = this.level
    //     }
    //     let lengthLastLine = this.lines[this.lines.length - 1].length
    //     if (lengthLastLine >= level * this.spacesPerIndent) {
    //         // this.lines.push("")
    //         this.lines.push(margin)
    //     }
    //     while (this.lines[this.lines.length - 1].length < level * this.spacesPerIndent) {
    //         this.lines[this.lines.length - 1] += " "
    //     }
    //     this.lines[this.lines.length - 1] += line
    // }
    // add(line: string): void {
    //     this.lines[this.lines.length - 1] += line
    // }
    flush() {
        this.lines1.push(this.nextMargin.padEnd(this.marginWidth) + this.nextLine)
        this.nextLine = ""
        this.nextMargin = ""
    }
    endLine() {
        if (this.nextLine.length > 0) {
            this.flush()
        }
    }
    line(line: string, level: null | number = null, margin?: string): void {
        if (level === null) {
            level = this.level
        }
        else {
            level *= 4
        }
        if (this.nextLine.length >= level * this.spacesPerIndent) {
            this.flush()
        }
        this.nextLine = this.nextLine.padEnd(level * this.spacesPerIndent)
        this.nextLine += line
        if (margin !== undefined) {
            this.nextMargin = margin
        }
    }
    add(line: string): void {
        this.nextLine += line
    }
    indent(num = 1) {
        this.indentStack.push(this.level)
        this.level += num
        // this.level += 1
    }
    outdent(num = 1) {
        // this.level -= num
        const level = this.indentStack.pop()
        assert.isTrue(level !== undefined)
        this.level = level
    }
    indentLine(line: string, level: null | number = null, margin?: string) {
        this.indentStack.push(this.level)
        this.line(line, level, margin)
        this.level += 1 + (line.length + this.spacesPerIndent - 1) / this.spacesPerIndent
    }
    getLines(): string[] {
        this.flush()
        return this.lines1
    }
}

function showLocNum(n: number, width: number): string {
    let result = JSON.stringify(n)
    while (result.length < width) {
        result = ` ${result}`
    }
    return result
}

function showExprLoc(loc: Loc): string {
    // if (loc === undefined || loc.range === undefined) {
    //     return ""
    // }
    let margin = `${showLocNum(loc.begin.line, 3)},${showLocNum(loc.begin.col, 3)}`
    return margin
}

export type ShowExprLine = (out: Output, expr: ExprLoc, fields1: string[], fields2: string[]) => unit

export function showExpr2(out: Output, expr: ExprLoc, fields1: string[], fields2: string[]): unit {
    if (out.level > 40) {
        out.line("...")
        return
    }
    let line = ""
    line += expr.tag
    for (let field of fields1) {
        let f1 = JSON.stringify((expr as any)[field])
        if (f1.length >= 30) {
            f1 = `${f1.slice(0, 20)}...`
        }
        line += ` ${f1}`
    }
    out.line(line)
    if (expr.hasOwnProperty("tc")) {
        let expr2 = expr as ExprType
        if (expr2.tc !== null && expr2.tc !== undefined) {
            let errSym = `#${expr2.tc.charAt(0).toUpperCase()}`
            if (errSym !== "#O")
                errSym = `-${errSym}`
            else
                errSym = ` ${errSym}`
            out.line(errSym, 31)
        }
    }
    if (expr.hasOwnProperty("ty")) {
        let expr2 = expr as ExprType
        out.line(showType(expr2.ty), 33)
    }
    for (let field of fields2) {
        let child = (expr as any)[field]
        let margin = showExprLoc(child)
        // out.line(`${field} = `, null, margin)
        // out.indent(2)
        out.indentLine(`${field} = `, null, margin)
        showExpr1(out, child, showExpr2)
        out.outdent(2)
    }
}

function mkShowExprLine(ty: string, tc: string) {
    function showExprLine(out: Output, expr: ExprLoc, fields1: string[], fields2: string[]): unit {
        if (out.level > 120) {
            out.line("...")
            return
        }
        let line = ""
        line += expr.tag
        for (let field of fields1) {
            let f1 = JSON.stringify((expr as any)[field])
            if (f1.length >= 30) {
                f1 = `${f1.slice(0, 20)}...`
            }
            line += ` ${f1}`
        }
        out.line(line, null, showExprLoc(expr.loc))
        if (expr.hasOwnProperty(tc)) {
            let expr2 = expr as ExprType
            if ((expr2 as any)[tc] !== null && (expr2 as any)[tc] !== undefined) {
                let errSym = `#${(expr2 as any)[tc].charAt(0).toUpperCase()}`
                if (errSym !== "#O")
                    errSym = `-${errSym}`
                else
                    errSym = ` ${errSym}`
                out.line(errSym, 31)
            }
        }
        if (expr.hasOwnProperty(ty)) {
            let expr2 = expr as any
            if (expr2[ty] !== null) {
                out.line(showType((expr2)[ty]), 33)
            }
        }
        for (let field of fields2) {
            let child = (expr as any)[field]
            let margin = `${showLocNum(child.loc.range.start.line, 3)},${showLocNum(child.loc.range.start.col, 3)}`
            // out.line(`${field} = `, null, margin)
            // out.indent(2)
            out.indentLine(`${field} = `, null, margin)
            showExpr1(out, child, showExprLine)
            out.outdent(2)
        }
        out.endLine()
    }
    return showExprLine
}

function showDecls(out: Output, decls: DeclLoc[], showExprLine: ShowExprLine): void {
    // out.line("decls =")
    // out.indent(2)
    out.indentLine("decls =")
    for (let [pat, expr] of decls) {
        // out.line("pat = ", null, showLoc(pat.loc))
        // out.indent(2)
        out.indentLine("pat = ", null, showExprLoc(pat.loc))
        showExpr1(out, pat, showExprLine)
        out.outdent(2)
        // out.line("val = ", null, showLoc(expr.loc))
        // out.indent(2)
        out.indentLine("val = ", null, showExprLoc(expr.loc))
        showExpr1(out, expr, showExprLine)
        out.outdent(2)
    }
    out.outdent(2)
    out.endLine()
}

function showAlts(out: Output, decls: DeclLoc[], showExprLine: ShowExprLine): void {
    // out.line("alts =")
    // out.indent(2)
    out.indentLine("alts =")
    for (let [pat, expr] of decls) {
        // out.line("pat = ", null, showLoc(pat.loc))
        // out.indent(2)
        out.indentLine("pat = ", null, showExprLoc(pat.loc))
        showExpr1(out, pat, showExprLine)
        out.outdent(2)
        // out.line("val = ", null, showLoc(expr.loc))
        // out.indent(2)
        out.indentLine("val = ", null, showExprLoc(expr.loc))
        showExpr1(out, expr, showExprLine)
        out.outdent(2)
    }
    out.outdent(2)
    out.endLine()
}

function showList(out: Output, label: string, elems: ExprLoc[], showExprLine: ShowExprLine): void {
    // out.line(`${label} =`)
    // out.indent(2)
    // out.indentLine(`${label} =`)
    out.indentLine(`${label}`)
    elems.forEach((elem, i) => {
        // out.line(`${i} `, null, showLoc(elem.loc))
        // out.indent(1)
        out.indentLine(`${i} `, null, showExprLoc(elem.loc))
        showExpr1(out, elem, showExprLine)
        out.outdent(1)
    })
    out.outdent(2)
    out.endLine()
}


export function showExpr1(out: Output, expr: ExprTree<any>, showExprLine: ShowExprLine): unit {
    if (expr instanceof Array) {
        showList(out, "[]", expr, showExprLine)
        return
    }
    switch (expr.tag) {
        case "ETermBrackets":
            showExprLine(out, expr, [], ["expr"])
            break
        case "ETypeBrackets":
            showExprLine(out, expr, [], ["expr"])
            break
        case "EAs":
            showExprLine(out, expr, ["name"], ["expr"])
            break
        case "EVar":
            showExprLine(out, expr, ["name"], [])
            break
        case "ELambda":
            showExprLine(out, expr, [], ["pat", "body"])
            break
        case "ELambdaMaybe":
            showExprLine(out, expr, [], ["pat", "body"])
            break
        case "ELambdaNo":
            showExprLine(out, expr, [], ["pat", "body"])
            break
        case "ELambdaYes":
            showExprLine(out, expr, [], ["pat", "body"])
            break
        case "EApply":
            showExprLine(out, expr, [], ["func", "arg"])
            break
        case "EDatum":
            showExprLine(out, expr, ["value"], [])
            break
        case "ELet":
            showExprLine(out, expr, [], ["expr"])
            showDecls(out, expr.decls, showExprLine)
            break
        case "EPair":
            showExprLine(out, expr, [], ["hd", "tl"])
            break
        case "EType":
            showExprLine(out, expr, [], ["expr", "type"])
            break
        case "ETypeAs":
            showExprLine(out, expr, ["name"], ["expr", "type"])
            break
        case "ECase":
            showExprLine(out, expr, [], ["expr"])
            showAlts(out, expr.alts, showExprLine)
            break
        case "EList":
            showExprLine(out, expr, [], expr.tail === null ? [] : ["tail"])
            showList(out, "list", expr.exprs, showExprLine)
            break
        case "ETuple":
            showExprLine(out, expr, [], [])
            showList(out, "tuple", expr.exprs, showExprLine)
            break
        case "EPrim":
            showExprLine(out, expr, ["defn"], [])
            showList(out, "op", expr.args, showExprLine)
            break
        default:
            throw new Error(`unknown expr ${expr.tag}`)
    }
}

export function showExprTree(out: Output, expr: ExprTree<any>): unit {
    return showExpr1(out, expr, showExpr2)
}

export function showExpr(out: Output, expr: Expr): unit {
    return showExpr1(out, expr, showExpr2)
}

// export function showExprTy(out: Output, expr: ExprTree<{tc?:TypeAnnot|null}>): void {
export function showExprTy(out: Output, expr: ExprTree<TypeAnnot>): unit {
    return showExpr1(out, expr, mkShowExprLine("ty", "tc"))
}

export function showExprTy1(out: Output, expr: ExprTree<TypeAnnotBidir>): unit {
    return showExpr1(out, expr, mkShowExprLine("ty1", "tc"))
}

export function showExprTy2(out: Output, expr: ExprTree<TypeAnnotBidir>): unit {
    return showExpr1(out, expr, mkShowExprLine("ty2", "tc"))
}

export function showExp(expr: Expr): string {
    let out = new Output()
    out.level = 2
    showExpr(out, expr)
    return out.getLines().join("\n")
}

export function showExp2<T>(expr: ExprTree<T>, label: string, show: (out: Output, expr: ExprTree<T>) => unit): string {
    let out = new Output()
    console.log(label)
    out.level = 2
    show(out, expr)
    return out.getLines().join("\n")
}



export function showExprConcise(out: Output, expr: ExprLoc, fields1: string[], fields2: string[]): unit {
    if (out.level > 40) {
        out.line("...")
        return
    }
    let line = "("
    line += expr.tag
    for (let field of fields1) {
        let f1 = JSON.stringify((expr as any)[field])
        if (f1.length >= 30) {
            f1 = `${f1.slice(0, 20)}...`
        }
        line += ` ${f1}`
    }
    out.add(line)
    for (let field of fields2) {
        let child = (expr as any)[field]
        out.line(`${field} = `, null)
        showExpr1(out, child, showExprConcise)
    }
    out.add(")")
}


export function showExpConcise(expr: Expr): string {
    let out = new Output()
    out.spacesPerIndent = 0
    out.marginWidth = 0
    out.level = 0
    showExpr1(out, expr, showExprConcise)
    return out.getLines().join(" ")
}


export type VarSet = { [name: string]: null };

type TermTypeCtx = "Term" | "Type"


// This returns the free variables of an expression
// This is used to trim the environment before type-checking
// Having the environment only contains the variables which are needed
//   improves memoization opportunities.
// This code works, but is a little special-casey.
// It wouldn't handled an EAs nested beneath multiple brackets.
// These don't/haven't occur/ed in practice, so this is sufficient for now.
export function exprFreeVars<T>(ctx: TermTypeCtx, exp: Expr<T>, boundVars: VarSet, freeVars: VarSet): void {
    let efv = exprFreeVars
    switch (exp.tag) {
        case "ELambda":
        case "ELambdaYes":
        case "ELambdaMaybe":
        case "ELambdaNo": {
            switch (ctx) {
                case "Term": {
                    // if (exp.arg.tag === "EAs") {
                    //     let patVars: VarSet = {}
                    //     patBindVars(ctx, exp.arg.expr, boundVars, freeVars, patVars)
                    //     let boundVars2 = { ...boundVars, ...patVars }
                    //     boundVars2[exp.arg.name] = null
                    //     efv(ctx, exp.body, boundVars2, freeVars)
                    //     break
                    // }
                    // else 
                    if (exp.pat.tag === "EType" && exp.pat.type.tag === "EAs") {
                        let patVars: VarSet = {}
                        patBindVars(ctx, exp.pat.expr, boundVars, freeVars, patVars)
                        patVars[exp.pat.type.name] = null
                        let boundVars2 = { ...boundVars, ...patVars }
                        efv(ctx, exp.pat.type.expr, boundVars2, freeVars)
                        efv(ctx, exp.body, boundVars2, freeVars)
                        break
                    }
                    else if (exp.pat.tag === "ETypeAs") {
                        let patVars: VarSet = {}
                        patBindVars(ctx, exp.pat.expr, boundVars, freeVars, patVars)
                        patVars[exp.pat.name] = null
                        let boundVars2 = { ...boundVars, ...patVars }
                        efv(ctx, exp.pat.type, boundVars2, freeVars)
                        efv(ctx, exp.body, boundVars2, freeVars)
                        break
                    }
                    else {
                        let patVars: VarSet = {}
                        patBindVars(ctx, exp.pat, boundVars, freeVars, patVars)
                        let freeVars2: VarSet = {}
                        let boundVars2 = { ...boundVars, ...patVars }
                        efv(ctx, exp.body, boundVars2, freeVars)
                        break
                    }
                }
                case "Type": {
                    if (exp.pat.tag === "EAs") {
                        let boundVars2 = { ...boundVars }
                        boundVars2[exp.pat.name] = null
                        efv(ctx, exp.pat.expr, boundVars2, freeVars)
                        efv(ctx, exp.body, boundVars2, freeVars)
                    }
                    else {
                        efv(ctx, exp.pat, boundVars, freeVars)
                        efv(ctx, exp.body, boundVars, freeVars)
                    }
                    break
                }
                default:
                    throw new Error("missing case")
            }
            break
        }

        case "ELet": {
            let boundVars2 = { ...boundVars }
            exp.decls.forEach(([pat, defn]) => {
                let patVars: VarSet = {}
                patBindVars(ctx, pat, boundVars2, freeVars, patVars)
                efv(ctx, defn, boundVars2, freeVars)
                boundVars2 = { ...boundVars2, ...patVars }
            })
            efv(ctx, exp.expr, boundVars2, freeVars)
            break
        }

        case "EVar": {
            if (!(exp.name in boundVars)) {
                freeVars[exp.name] = null
            }
            break
        }

        case "ETermBrackets":
            efv("Term", exp.expr, boundVars, freeVars)
            break
        case "ETypeBrackets":
            efv("Type", exp.expr, boundVars, freeVars)
            break

        // handle all these cases with a visit call
        case "EApply":
        case "EList":
        case "EDatum":
        case "EPrim":
        case "EPair":
        case "ESym":
        // case "ETypeAs":
        case "EType": {
            visitChildren(exp, (field: (number | string)[], childExpr: Expr<T>) => efv(ctx, childExpr, boundVars, freeVars))
            break
        }

        case "ETypeAs": {
            const exp2 = eTypeAnnot({ loc: nilLoc }, exprAddNilLoc(exp.expr), eAs({ loc: nilLoc }, exp.name, exprAddNilLoc(exp.type)))
            return efv(ctx, exp2, boundVars, freeVars)
            // assert.impossible("This can only exist with in a lambda-pat, not an arbitrary expr")
            // break       
        }

        // we should only encounter "EAs" in a pattern binding position
        case "EAs":
        default: {
            let loc = (exp as unknown as ExprLoc).loc
            throw new Error(`freeVars: unhandled/missing case ${exp.tag} ${showExprLoc(loc)}`)
        }
    }
}

export function patBindVars<T>(ctx: TermTypeCtx, exp: Expr<T>, boundVars: VarSet, freeVars: VarSet, patVars: VarSet): void {
    let pbv = patBindVars
    switch (exp.tag) {
        case "EVar": {
            patVars[exp.name] = null
            break
        }
        case "EAs": {
            patVars[exp.name] = null
            pbv(ctx, exp.expr, boundVars, freeVars, patVars)
            break
        }
        case "EList": {
            exp.exprs.forEach(elem => {
                pbv(ctx, elem, boundVars, freeVars, patVars)
            })
            if (exp.tail !== null) {
                pbv(ctx, exp.tail, boundVars, freeVars, patVars)
            }
            break
        }
        case "EType": {
            pbv(ctx, exp.expr, boundVars, freeVars, patVars)
            let tyAnnot = exp.type as Expr<T>
            if (tyAnnot.tag === "ETypeBrackets") {
                tyAnnot = tyAnnot.expr
            }
            if (tyAnnot.tag === "EAs") {
                patVars[tyAnnot.name] = null
                exprFreeVars(ctx, tyAnnot.expr, boundVars, freeVars)
            } else {
                exprFreeVars(ctx, exp.type, boundVars, freeVars)
            }
            break
        }
        case "ETypeAs": {
            const exp2 = eTypeAnnot({ loc: nilLoc }, exprAddNilLoc(exp.expr), eAs({ loc: nilLoc }, exp.name, exprAddNilLoc(exp.type)))
            pbv(ctx, exp2, boundVars, freeVars, patVars)
            break
        }
        case "ETermBrackets": {
            pbv("Term", exp.expr, boundVars, freeVars, patVars)
            break
        }
        case "ETypeBrackets": {
            if (exp.expr.tag === "EAs") {
                let boundVars2 = { ...boundVars }
                boundVars2[exp.expr.name] = null
                patVars[exp.expr.name] = null
                pbv("Type", exp.expr.expr, boundVars, freeVars, patVars)
            }
            else {
                pbv("Type", exp.expr, boundVars, freeVars, patVars)
            }
            break
        }

        // other cases can be handled by exprFreeVars
        default: {
            exprFreeVars(ctx, exp, boundVars, freeVars)
            break
        }

        // case "ELambda":
        // case "ELambdaYes":
        // case "ELambdaMaybe":
        // case "ELambdaNo": {
        //     // free and bound variables rules differ for lambdas depending on term/type context.
        //     // however, in both cases, neither can introduce new bindings to the outer context.
        //     // but they can make reference to free variables which is what we are collecting, doh
        //     switch (ctx) {
        //         case "Term":
        //         case "Type":
        //         default:
        //             throw new Error("missing case")
        //     }
        //     break
        // }
        // default:
        //     throw new Error(`missing case ${exp.tag}`)
    }
}



export function exprStripLoc(e: ExprLoc): ExprMbLoc {
    return strip(e)
    function strip(e: ExprMbLoc): ExprMbLoc {
        const e2 = exprTransform(e, {
            expr: e => strip(e)
        })
        e2.loc = null
        return e2
    }
}

export function declsStripLoc(decls: DeclLoc[]): DeclNoLoc[] {
    let s = exprStripLoc
    return decls.map(([p, d]) => [s(p), s(d)])
}

export function exprAddNilLoc(expr: Expr): ExprLoc {
    return addLoc(expr)
    function addLoc(e: Expr): ExprLoc {
        const e2 = exprTransform(e, {
            expr: e => addLoc(e)
        })
        e2.loc = nilLoc
        return e2
    }
}

