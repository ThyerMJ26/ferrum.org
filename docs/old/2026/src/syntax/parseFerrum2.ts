import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"
import { Loc, Token, showLoc, locMerge, showPos, locMatch } from "../syntax/token.js"
import {
    ExprLoc, eLambda, eLambdaMaybe, eLambdaNo, eLambdaYes, eLambdaOption,
    eAs, eApply, eVar, ePrim, eTypeAnnot, eTermBrackets, eTypeBrackets, DeclLoc,
    eList, DeclTypeBidir, showExp, eTypeAs,
    Decl,
    Expr,
    exprTransform,
    exprTransform2PairList,
    TorT,
    ApplyOp
} from "../syntax/expr.js"
import { ParseState } from "../syntax/parse.js"
import { Fixity, operatorParser, MkOpExpr, OpCompare, OperatorTableBuilder, OperatorTable, mkOperatorTable, OperatorTableQuery, OpDefn } from "./operator.js"


// TODO Move these into the ParseState interface.
function parseToken(ps: ParseState, tag: string, val: any, seeAlsoToken: Token | null): unit {
    const tok = ps.take()
    if (tok.tag !== tag || tok.value !== val) {
        const seeAlsoMsg = seeAlsoToken === null ? "" :
            `, see also (${JSON.stringify(seeAlsoToken.value)}) (${showLoc(seeAlsoToken.loc)})`
        throw new Error(`unexpected token at (${showLoc(tok.loc)}), got (${tok.tag} ${JSON.stringify(tok.value)}), expected (${tag} ${JSON.stringify(val)}) ${seeAlsoMsg}`)
    }
}

function tryParseToken(ps: ParseState, tag: string, val: any): boolean {
    const tok = ps.peek()
    if (tok.tag !== tag || tok.value !== val) {
        return false
    }
    else {
        ps.pos++
        return true
    }
}



// If user-definable operators were supported, then it would make sense to lookup operator names in the environment.
// const USE_EPRIMS = false // use eVar
// As it is, operator names all correspond to built-in primitive names, and bypass the environment lookup
const USE_EPRIMS = true // use ePrim

export function mkOpInfix(tort: TorT, opDefn: FerrumOpDefn, loc: Loc, arg1: ExprLoc, arg2: ExprLoc): ExprLoc {
    let show = (a: any) => JSON.stringify(a)
    if (arg1 === undefined) {
        throw new Error(`mkApplyOp, undefined arg1, ${show(name)}, ${show(loc)}`)
    }
    let loc2 = locMerge(arg1.loc, arg2.loc)
    const locA = { loc: loc2 }
    switch (opDefn.nameA) {
        case "->":
            return eLambda(locA, arg1, arg2)
        case "=>": // lambda-yes
            return eLambdaYes(locA, arg1, arg2)
        case "|->": // |-> lambda-no
            return eLambdaNo(locA, arg1, arg2)
        case "|=>": // |=> lambda-maybe
            return eLambdaMaybe(locA, arg1, arg2)
        case ":":
            // if (arg2.tag === "EAs") {
            //     return eTypeAs(loc2, arg1, arg2.name, arg2.expr)
            // }
            return eTypeAnnot(locA, arg1, arg2)
        case "@": {
            if (arg1.tag === "EVar") {
                return eAs(locA, arg1.name, arg2)
            }
            else {
                throw new Error(`expected identifier to left of @ as-symbol at (${showLoc(loc)})`)
            }
        }
        case "|>":
            return eApply(locA, arg2, arg1, "|>")
        case "<|":
            return eApply(locA, arg1, arg2, "<|")
        default: {
            const nameP = opDefn.nameP[tort]
            assert.isDefined(nameP)
            if (USE_EPRIMS) {
                let loc3 = { loc: locMerge(arg1.loc, arg2.loc) }
                let arg3 = ePrim(loc3, nameP, [arg1, arg2])
                return arg3
            }
            else {
                let loc3 = locMerge(loc, arg1.loc)
                let arg3 = eApply({ loc: loc2 }, eApply({ loc: loc3 }, eVar({ loc }, nameP), arg1), arg2)
                return arg3
            }
        }
    }
}

function mkOpPrefix(tort: TorT, opDefn: FerrumOpDefn, loc: Loc, arg1: ExprLoc): ExprLoc {
    switch (opDefn.nameC) {
        case "->": {
            // let unitArg: Expr = { tag: "EDatum", value: null, loc: loc }
            let unitArg: ExprLoc = { tag: "EList", exprs: [], tail: null, loc: loc }
            const loc2 = locMerge(loc, arg1.loc)
            return eLambda({ loc: loc2 }, unitArg, arg1)
        }
        default: {
            const nameP = opDefn.nameP[tort]
            assert.isDefined(nameP)
            if (USE_EPRIMS) {
                let loc3 = locMerge(loc, arg1.loc)
                let arg3 = ePrim({ loc: loc3 }, nameP, [arg1])
                return arg3
            }
            else {
                let arg3 = eApply({ loc: loc }, eVar({ loc: loc }, nameP), arg1)
                return arg3
            }
        }
    }
}

function mkOpPostfix(tort: TorT, opDefn: FerrumOpDefn, loc: Loc, arg1: ExprLoc): ExprLoc {
    switch (opDefn.nameC) {
        default: {
            const nameP = opDefn.nameP[tort]
            assert.isDefined(nameP)
            if (USE_EPRIMS) {
                let loc2 = locMerge(loc, arg1.loc)
                let arg2 = ePrim({ loc: loc2 }, nameP, [arg1])
                return arg2
            }
            else {
                let arg2 = eApply({ loc: arg1.loc }, eVar({ loc }, nameP), arg1)
                return arg2
            }
        }
    }
}


const mkOp: MkOpExpr<FerrumRuleName> = {
    mkApply(op: ApplyOp, func: ExprLoc, arg: ExprLoc): ExprLoc {
        const loc = locMerge(func.loc, arg.loc)
        const arg2: ExprLoc = { tag: "EApply", loc: loc, func, arg, op: "" }
        return arg2
    },
    mkInfix(tort, opDefn, opLoc, lhs, rhs) {
        const loc = locMerge(lhs.loc, rhs.loc)
        return mkOpInfix(tort, opDefn, loc, lhs, rhs)
    },
    mkPostfix(tort, opDefn, opLoc, lhs) {
        return mkOpPostfix(tort, opDefn, opLoc, lhs)
    },
    mkPrefix(tort, opDefn, opLoc, rhs) {
        return mkOpPrefix(tort, opDefn, opLoc, rhs)
    },
    mkParseError(errorLoc, errorMsg) {
        throw new Error(`Operator Parser Error at (${showLoc(errorLoc)}): ${errorMsg}`)
        // TODO Incorporate errors in the AST and continue parsing.
        return ePrim({ loc: errorLoc }, errorMsg, [])
    }
}

type FerrumRuleName =
    | "As"
    // | "Juxtaposed" TODO ? Implicit juxtaposed application ?
    | "Bool" | "Bool_And" | "Bool_Or"
    | "Arith" | "Arith_Negate" | "Arith_Power" | "Arith_Mult" | "Arith_AddSub"
    | "Rel"
    | "Set" | "Set_Rc" | "Set_Inter" | "Set_Union"
    | "Colon"
    | "Expr" // Simple expression, excluding lambdas.
    | "Pipe_Fwd" | "Pipe_Bwd"
    | "Abs"
    | "PostSeq"


type FerrumOperName =
    | "@"
    // | "" TODO ? Implicit juxtaposed application ?
    | "&&" | "||"
    | "+" | "-" | "*"
    | "<" | "<=" | "==" | ">=" | ">"
    | "\\" | "&" | "|"
    | ":"
    | "|>" | "<|" | "<$"
    | "->" | "=>" | "|->" | "|=>"
    | "|-" | "|="
    | "$?"

type FerrumOpDefn = OpDefn<FerrumRuleName>

function mkFerrumOperatorTable(): OperatorTableQuery<FerrumRuleName, FerrumOperName> {
    const ot = mkOperatorTable<FerrumRuleName, FerrumOperName>()

    /*** Rules ***/

    ot.opRule("As", "None", [])

    // If this were Haskell, the "@" symbol would bind more tightly than juxtposed apply,
    // for example:
    //   merge x@(x0:xs) y@(y0:ys) = ...
    // This syntax doesn't currently occur in Ferrum, so the issue doesn't (yet?) arise.
    // ( "@" can only occur in patterns, and applications can never occur (directly) in patterns. )

    // TODO ? Treat juxtaposed apply as just another operator ? 
    // TODO   This could be done with a simple additional pass to 
    // TODO     insert implicit application operators between adjacent non-symbols in an expression list.
    // TODO       (and between postfix operators and non-symbols).
    // ot.opRule("Juxtaposed", "Left", ["As"])

    ot.opRule("Bool_And", "Left", [])
    ot.opRule("Bool_Or", "Left", ["Bool_And"])
    ot.opRule("Bool", "None", ["Bool_Or"])

    ot.opRule("Set_Rc", "None", [])
    ot.opRule("Set_Inter", "Left", [])
    ot.opRule("Set_Union", "Left", ["Set_Inter"])
    ot.opRule("Set", "None", ["Set_Rc", "Set_Inter", "Set_Union"])

    ot.opRule("Arith_Negate", "Left", [])
    ot.opRule("Arith_Power", "Right", ["Arith_Negate"])
    ot.opRule("Arith_Mult", "Left", ["Arith_Power"])
    ot.opRule("Arith_AddSub", "Left", ["Arith_Mult"])
    ot.opRule("Arith", "None", ["Arith_AddSub"])

    ot.opRule("Rel", "None", ["Arith"])

    ot.opRule("Expr", "None", ["Bool", "Arith", "Rel", "Set", "As"])

    ot.syRule("Pipe_Bwd", ["Expr"], ["Pipe_Bwd", "As", "Abs"])
    ot.syRule("Pipe_Fwd", ["Pipe_Fwd", "Expr"], ["Pipe_Bwd", "Abs"])
    ot.syRule("PostSeq", [], [])

    ot.opRule("Colon", "None", ["Expr", "Pipe_Fwd", "Pipe_Bwd"])
    ot.syRule("Abs", ["As"], ["Abs", "Colon", "PostSeq"])


    /*** Operators ***/

    ot.addInfix("@"  /**/, "Tm", null, "As")

    // TODO ? The juxtaposed apply "operator".
    // ot.addInfix(""  /**/, "Tm", "Ty", "Apply")

    // More arithmetic operators, not yet implemented.
    // ot.addPrefix("-"  /**/, "Tm", null, "Arith_Negate")
    // ot.addInfix("**"  /**/, "Tm", null, "Arith_Power")

    ot.addInfix("*"  /**/, "Tm", null, "Arith_Mult")
    ot.addInfix("+"  /**/, "Tm", null, "Arith_AddSub")
    ot.addInfix("-"  /**/, "Tm", null, "Arith_AddSub")

    ot.addInfix("==" /**/, "Tm", null, "Rel")
    ot.addInfix(">"  /**/, "Tm", null, "Rel")
    ot.addInfix(">=" /**/, "Tm", null, "Rel")
    ot.addInfix("<"  /**/, "Tm", null, "Rel")
    ot.addInfix("<=" /**/, "Tm", null, "Rel")

    ot.addInfix("&&" /**/, "Tm", null, "Bool_And")
    ot.addInfix("||" /**/, "Tm", null, "Bool_Or")


    ot.addInfix("\\" /**/, null, "Ty", "Set_Rc")
    ot.addInfix("&"  /**/, null, "Ty", "Set_Inter")
    ot.addInfix("|"  /**/, null, "Ty", "Set_Union")

    ot.addInfix(":"  /**/, "Tm", null, "Colon")

    ot.addInfix("<|"  /**/, "Tm", null, "Pipe_Bwd")
    ot.addInfix("|>"  /**/, "Tm", null, "Pipe_Fwd")
    ot.addInfix("<$"  /**/, "Tm", null, "Pipe_Bwd")
    ot.addPostfix("$?" /**/, "Tm", null, "PostSeq")

    // TODO ? Rather than implement "$?" as a postfix operator,
    // TODO ?   implement it as an infix operator which
    // TODO ?   binds more tightly than application on its right hand-side ?
    // TODO ? The block-until "$?" primitive can either be seen as:
    // TODO ?   - a unary primitive which reduces to the identify function, or
    // TODO ?   - a binary primitive which reduces to its second argument.
    // TODO ? The arity of the operators becomes the arity of the primitives,
    // TODO ?   either way works, is one preferable over the other ?

    ot.addPrefix("->"   /**/, "Tm", null, "Abs")
    ot.addInfix("->"  /**/, "Tm", null, "Abs")
    ot.addInfix("=>"  /**/, "Tm", null, "Abs")
    ot.addInfix("|->" /**/, "Tm", null, "Abs")
    ot.addInfix("|=>" /**/, "Tm", null, "Abs")

    // TODO ? Rename these as "?-"" and "?="", they aren't meant to look like turnstiles.
    ot.addInfix("|-" /**/, "Tm", null, "Abs")
    ot.addInfix("|=" /**/, "Tm", null, "Abs")

    ot.update()

    return ot
}

const ferrumOperatorTable = mkFerrumOperatorTable()








function parseExpr(ps: ParseState, seeAlsoToken: Token | null = null): ExprLoc {
    const allowLet = true
    let expr = tryParseExprPart(ps, allowLet)

    let seeAlsoMsg = ""
    if (seeAlsoToken !== null) {
        // seeAlsoMsg = `, see also ${JSON.stringify(seeAlsoToken)}`
        seeAlsoMsg = `, see also (${JSON.stringify(seeAlsoToken.value)}) (${showLoc(seeAlsoToken.loc)})`
        // seeAlsoMsg = `, see also (${JSON.stringify(seeAlsoToken.value)}) (${showPos(seeAlsoToken.loc.range.start)})`
    }

    if (expr === null) {
        const tok = ps.peek()
        throw new Error(`failed to parse expression at (${showLoc(tok.loc)}) got (${tok.tag} ${JSON.stringify(tok.value)}) ${seeAlsoMsg}`)
    }

    const opArgs = []
    do {
        opArgs.push(expr)
        const allowLet = expr.tag === "ESym"
        expr = tryParseExprPart(ps, allowLet)
    }
    while (expr !== null)

    const tort = ps.peekTorT()

    const result = operatorParser(ferrumOperatorTable, mkOp, tort, opArgs)
    return result
}

function tryParseExprPart(ps: ParseState, allowLet: boolean): ExprLoc | null {
    if (ps.eof()) {
        return null
    }
    let tok = ps.peek()
    switch (tok.tag) {
        case "integer":
        case "string":
            ps.take()
            return { tag: "EDatum", value: tok.value, loc: tok.loc }
        case "ident": {
            ps.take()
            let expr1: ExprLoc = { tag: "EVar", name: tok.value, loc: tok.loc }
            return expr1
        }
        case "keyword": {
            switch (tok.value) {
                case "let": {
                    if (!allowLet) {
                        return null
                    }
                    let decls: DeclLoc[] = []
                    let loc1 = ps.srcLoc()
                    while (tryParseToken(ps, "keyword", "let")) {
                        let letToken = ps.prev()
                        let pat = parseExpr(ps, tok)
                        parseToken(ps, "keysym", "=", letToken)
                        let defn = parseExpr(ps, tok)
                        parseToken(ps, "separator", ";", letToken)
                        decls.push([pat, defn])
                    }
                    let body = parseExpr(ps, tok)
                    let loc2 = ps.srcLoc()
                    return { tag: "ELet", decls: decls, expr: body, loc: locMerge(loc1, loc2) }
                }
                default:
                    throw new Error("missing case")
            }
        }
        case "separator":
            switch (tok.value) {
                case "(": {
                    ps.take()
                    ps.pushTorT("Term")
                    let loc1 = ps.srcLoc2()
                    let expr = parseExpr(ps)
                    parseToken(ps, "separator", ")", tok)
                    ps.popTorT("Term")
                    let loc2 = ps.srcLoc2()
                    return eTermBrackets({ loc: locMerge(loc1, loc2) }, expr)
                }
                case "{": {
                    ps.take()
                    ps.pushTorT("Type")
                    let loc1 = ps.srcLoc2()
                    let expr = parseExpr(ps)
                    parseToken(ps, "separator", "}", tok)
                    ps.popTorT("Type")
                    let loc2 = ps.srcLoc2()
                    let typeBrackets = eTypeBrackets({ loc: locMerge(loc1, loc2) }, expr)
                    return typeBrackets
                }
                case "[": {
                    ps.take()
                    let elems: ExprLoc[] = []
                    let tail: ExprLoc | null = null
                    let loc1 = ps.srcLoc2()
                    if (tryParseToken(ps, "separator", "]")) {
                        let loc2 = ps.srcLoc2()
                        return { tag: "EList", exprs: [], tail: null, loc: locMerge(loc1, loc2) }
                    }
                    while (true) {
                        let expr = parseExpr(ps)
                        elems.push(expr)
                        if (tryParseToken(ps, "separator", "]")) {
                            let loc2 = ps.srcLoc2()
                            return { tag: "EList", exprs: elems, tail: tail, loc: locMerge(loc1, loc2) }
                        }
                        else if (tryParseToken(ps, "separator", ",,")) {
                            let tail = parseExpr(ps)
                            parseToken(ps, "separator", "]", tok)
                            let loc2 = ps.srcLoc2()
                            return { tag: "EList", exprs: elems, tail: tail, loc: locMerge(loc1, loc2) }
                        }
                        else {
                            parseToken(ps, "separator", ",", tok)
                            if (tryParseToken(ps, "keysym", "...")) {
                                let tail = parseExpr(ps)
                                parseToken(ps, "separator", "]", tok)
                                let loc2 = ps.srcLoc2()
                                return { tag: "EList", exprs: elems, tail: tail, loc: locMerge(loc1, loc2) }
                            }
                        }
                    }
                }
                default:
                    return null
            }
        case "keysym":
            return null
        case "symbol": {
            ps.take()
            let expr1: ExprLoc = { tag: "ESym", name: tok.value, loc: tok.loc }
            return expr1
        }
        case "eof":
            return null
        default:
            throw new Error(`missing case (${tok.tag})`)
    }
}

function parseDecls(ps: ParseState): DeclLoc[] {
    let decls: DeclLoc[] = []
    while (tryParseToken(ps, "keyword", "let")) {
        let letToken = ps.prev()
        let pat = parseExpr(ps)
        parseToken(ps, "keysym", "=", letToken)
        let defn = parseExpr(ps)
        parseToken(ps, "separator", ";", letToken)
        decls.push([pat, defn])
    }
    return decls
}

function convertTokens(tokens: Token[]) {
    let fakeOperators = ["->", "=>", "@", ":", "|->", "|=>"]
    tokens.forEach(tok => {
        if (tok.tag === "keysym" && fakeOperators.indexOf(tok.value) !== -1) {
            tok.tag = "symbol"
        }
    })
}


export function parseFile(ps: ParseState, language: string | null): DeclLoc[] {
    switch (language) {
        case "Ferrum/0.1":
        case "ferrum/0.1": {
            convertTokens(ps.input)
            ps.pushTorT("Term")
            let decls = parseDecls(ps)
            ps.popTorT("Term")
            decls = stripNonSemanticBrackets_decls(decls)
            if (!tryParseToken(ps, "eof", null)) {
                // if (!ps.eof()) {
                // throw new Error(`failed to parse to end of file, reached ${showLoc(ps.srcLoc())}`)
                throw new Error(`failed to parse to end of file, reached ${showLoc(ps.peek().loc)}`)
            }
            return decls
        }
        default:
            throw new Error(`unknown language ${language}`)
    }
}


function parseExp(ps: ParseState, language: string | null, tort: TorT): ExprLoc {
    switch (language) {
        case "Ferrum/0.1":
        case "ferrum/0.1":
        case "ferrum/test/0.1":
        case "ferrum/proj/0.1": {
            convertTokens(ps.input)
            ps.pushTorT(tort)
            let exp = parseExpr(ps)
            ps.popTorT(tort)
            if (tort) {
                exp = stripNonSemanticBrackets_expr(exp, tort)
            }
            return exp
        }
        default:
            throw new Error(`unknown language ${language}`)
    }
}

export const parseTerm = (ps: ParseState, language: string | null) => {
    const result = parseExp(ps, language, "Term")
    return result
}
export const parseType = (ps: ParseState, language: string | null) => parseExp(ps, language, "Type")


export function stripNonSemanticBrackets_expr<T>(expr: Expr<T>, tort: TorT = "Term"): Expr<T> {

    // return expr

    switch (tort) {
        case "Term":
            return stripTerm(expr)
        case "Type":
            return stripType(expr)
    }

    function stripTerm(expr: Expr<T>): Expr<T> {
        switch (expr.tag) {
            case "ETermBrackets":
                return stripTerm(expr.expr)
            case "ETypeBrackets":
                return exprTransform(expr, { expr: stripType })
            default:
                return exprTransform(expr, { expr: stripTerm })
        }
    }

    function stripType(expr: Expr<T>): Expr<T> {
        switch (expr.tag) {
            case "ETermBrackets":
                return exprTransform(expr, { expr: stripTerm })
            case "ETypeBrackets":
                return stripType(expr.expr)
            default:
                return exprTransform(expr, { expr: stripType })
        }
    }

}

// If let-bindings are permitted within type-brackets,
//   then this function will need to take and pass on a TorT argument too.
export function stripNonSemanticBrackets_decls<T>(decls: Decl<T>[]): Decl<T>[] {
    return exprTransform2PairList(decls, { expr: stripNonSemanticBrackets_expr })
}

