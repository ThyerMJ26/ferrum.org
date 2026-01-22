import { assert } from "../utils/assert.js";
import { nilLoc, nilPos0 } from "../syntax/token.js";
import { showType4 } from "../tree/types.js";
import { mkLoc } from "./token.js";
// let showType = showType2
let showType = (ty) => showType4(ty, null, null);
export function eAs(annot, name, expr) {
    return { tag: "EAs", ...annot, name: name, expr: expr };
}
export function eVar(annot, name) {
    return { tag: "EVar", ...annot, name: name };
}
export function eDatum(annot, value) {
    return { tag: "EDatum", ...annot, value: value };
}
export function eApply(annot, func, arg, op) {
    if (op === undefined) {
        op = "";
    }
    return { tag: "EApply", ...annot, func: func, arg: arg, op };
}
export function eLet(annot, decls, expr) {
    return { tag: "ELet", ...annot, decls: decls, expr: expr };
}
export function eLambda(annot, arg, body) {
    return { tag: "ELambda", ...annot, pat: arg, body: body };
}
export function eLambdaMaybe(annot, arg, body) {
    return { tag: "ELambdaMaybe", ...annot, pat: arg, body: body };
}
export function eLambdaNo(annot, arg, body) {
    return { tag: "ELambdaNo", ...annot, pat: arg, body: body };
}
export function eLambdaYes(annot, arg, body) {
    return { tag: "ELambdaYes", ...annot, pat: arg, body: body };
}
export let eLambdaOption = eLambdaMaybe;
export function eSym(annot, name) {
    return { tag: "ESym", ...annot, name: name };
}
export function ePrim(annot, name, args) {
    return { tag: "EPrim", ...annot, name, args: args };
}
// export function tLambda(loc: Location, arg: Expr, body: Expr): Expr {
//     return { tag: "TLambda", loc: loc, pat: arg, body: body }
// }
export function eTuple(annot, elems) {
    if (elems.length === 0) {
        return eDatum(annot, null);
    }
    else {
        // return { tag: "ETuple", loc: loc, exprs: elems }
        return { tag: "EList", ...annot, exprs: elems.slice(0, elems.length - 1), tail: elems[elems.length - 1] };
    }
}
export function eList(annot, elems, tail = null) {
    if (elems.length === 0) {
        return eDatum(annot, null);
    }
    else {
        return { tag: "EList", ...annot, exprs: elems, tail: tail };
    }
}
export function eTermBrackets(annot, expr) {
    return { tag: "ETermBrackets", ...annot, expr: expr };
}
export function eTypeBrackets(annot, expr) {
    return { tag: "ETypeBrackets", ...annot, expr: expr };
}
export function eTypeAnnot(annot, term, type) {
    return { tag: "EType", ...annot, expr: term, type: type };
}
export function eTypeAs(annot, term, name, type) {
    return eTypeAnnot(annot, term, eAs(annot, name, type));
    // return { tag: "ETypeAs", loc: loc, expr: term, name, type }
}
export function lambdaOp(lambdaExpr) {
    switch (lambdaExpr.tag) {
        case "ELambda":
            return "->";
        case "ELambdaYes":
            return "=>";
        case "ELambdaNo":
            return "|->";
        case "ELambdaMaybe":
            return "|=>";
        default:
            assert.noMissingCases(lambdaExpr);
    }
}
export function isLambdaExpr(expr) {
    switch (expr.tag) {
        case "ELambda":
        case "ELambdaYes":
        case "ELambdaNo":
        case "ELambdaMaybe":
            return true;
        default:
            return false;
    }
}
export function isPatTypeAnnotated(pat) {
    const ipta = isPatTypeAnnotated;
    switch (pat.tag) {
        case "EType":
        case "ETypeAs":
            return true;
        case "EVar":
        case "EDatum":
            return false;
        case "ETermBrackets":
        case "ETypeBrackets":
        case "EAs":
            return ipta(pat.expr);
        case "EPair":
            return ipta(pat.hd) || ipta(pat.tl);
        case "EList":
            for (const elem of pat.exprs) {
                if (ipta(elem)) {
                    return true;
                }
            }
            if (pat.tail !== null) {
                return ipta(pat.tail);
            }
            return false;
        default:
            assert.unreachable();
    }
}
export function assumeExprIsTyped(expr) {
    return;
}
// This provides a quick way to check and cast an Expr to a ExprTypeBidir.
// This is used by the code-runners, some of which require types, 
//   but the CodeRunner interface doesn't guarantee that type-checking has been done.
export function isExprTyped(expr) {
    const exprTy = expr;
    return exprTy.ty1 !== undefined && exprTy.ty2 !== undefined;
}
export function isDeclTyped(decl) {
    const [pat, defn] = decl;
    return isExprTyped(pat) && isExprTyped(defn);
}
// export function isExprTypeChecked(expr: Expr): expr is ExprTypeBidir {
//     const exprTy = expr as ExprTypeBidir
//     return exprTy.ty1 !== undefined && exprTy.ty2 !== undefined && exprTy.tc !== undefined
// }
export function exprParts(exp) {
    switch (exp.tag) {
        case "EAs":
            return [exp.tag, ["name"], ["expr"]];
        case "EApply":
            return [exp.tag, [], ["func", "arg"]];
        case "ELambda":
            return [exp.tag, [], ["pat", "body"]];
        case "ELambdaMaybe":
            return [exp.tag, [], ["pat", "body"]];
        case "ELambdaNo":
            return [exp.tag, [], ["pat", "body"]];
        case "ELambdaYes":
            return [exp.tag, [], ["pat", "body"]];
        case "ELet":
            // return [expr.tag, [], ["expr", "decls"]]
            return [exp.tag, [], ["decls", "expr"]];
        case "EDatum":
            return [exp.tag, ["value"], []];
        case "EPair":
            return [exp.tag, [], ["hd", "tl"]];
        case "EType":
            return [exp.tag, [], ["expr", "type"]];
        case "ETypeAs":
            return [exp.tag, ["name"], ["expr", "type"]];
        case "EVar":
            return [exp.tag, ["name"], []];
        case "EList":
            return [exp.tag, [], exp.tail === null ? ["exprs"] : ["exprs", "tail"]];
        case "ETypeBrackets":
            return [exp.tag, [], ["expr"]];
        case "ETermBrackets":
            return [exp.tag, [], ["expr"]];
        case "EPrim":
            return [exp.tag, ["name"], ["args"]];
        default:
            throw new Error(`missing case $ {expr.tag}`);
    }
}
export function exprChildTorT(exp, field) {
    switch (exp.tag) {
        case "ETypeBrackets": return "Type";
        case "ETermBrackets": return "Term";
        default: return null;
    }
}
export function exprChildTorP(exp, field) {
    switch (exp.tag) {
        case "ELambda":
        case "ELambdaYes":
        case "ELambdaNo":
        case "ELambdaMaybe":
            return field === "pat" ? "Pat" : "Term";
        default: return null;
    }
}
export function exprTransform2List(expr, transform) {
    return expr.map(e => transform.expr(e));
}
export function exprTransform2PairList(decls, transform) {
    return decls.map(([p, d]) => [transform.expr(p), transform.expr(d)]);
}
export function exprTransform(expr, transform) {
    let e = expr;
    const r = (expr) => transform.expr(expr);
    let rn = (e) => (e === null ? null : r(e));
    let rle = (e) => exprTransform2List(e, transform);
    let rlp = (p) => exprTransform2PairList(p, transform);
    switch (e.tag) {
        case "EAs":
            return { ...e, expr: r(e.expr) };
        case "EApply":
            return { ...e, func: r(e.func), arg: r(e.arg) };
        case "ELambda":
        case "ELambdaMaybe":
        case "ELambdaNo":
        case "ELambdaYes":
            return { ...e, pat: r(e.pat), body: r(e.body) };
        case "ELet":
            return { ...e, decls: rlp(e.decls), expr: (r(e.expr)) };
        case "EDatum":
            return { ...e };
        case "EPair":
            return { ...e, hd: r(e.hd), tl: r(e.tl) };
        case "EType":
            return { ...e, expr: r(e.expr), type: r(e.type) };
        case "ETypeAs":
            return { ...e, expr: r(e.expr), type: r(e.type) };
        case "EVar":
            return { ...e };
        case "EList":
            return { ...e, exprs: rle(e.exprs), tail: rn(e.tail) };
        case "ETypeBrackets":
            return { ...e, expr: r(e.expr) };
        case "ETermBrackets":
            return { ...e, expr: r(e.expr) };
        case "EPrim":
            return { ...e, args: rle(e.args) };
        case "ESym":
            // NOTE: symbols only exist before operator precedence is resolved.
            // TODO: ? Use distinct and more precise types for before and after operator precedence resolution ?
            assert.impossible();
        default:
            assert.noMissingCases(e);
    }
}
export function exprTourList(expr, walk) {
    expr.map(e => exprTour(e, walk));
}
export function exprTourPairList(decls, walk) {
    decls.map(([p, d]) => [walk.expr(p), walk.expr(d)]);
}
export function exprTour(expr, walk) {
    let e = expr;
    const r = (expr) => walk.expr(expr);
    let rn = (e) => (e === null ? null : r(e));
    let rle = (e) => exprTourList(e, walk);
    let rlp = (p) => exprTourPairList(p, walk);
    switch (e.tag) {
        case "EAs":
            r(e.expr);
            break;
        case "EApply":
            r(e.func);
            r(e.arg);
            break;
        case "ELambda":
        case "ELambdaMaybe":
        case "ELambdaNo":
        case "ELambdaYes":
            r(e.pat);
            r(e.body);
            break;
        case "ELet":
            rlp(e.decls);
            r(e.expr);
            break;
        case "EDatum":
            break;
        case "EPair":
            r(e.hd);
            r(e.tl);
            break;
        case "EType":
            r(e.expr);
            r(e.type);
            break;
        case "ETypeAs":
            r(e.expr);
            r(e.type);
            break;
        case "EVar":
            break;
        case "EList":
            rle(e.exprs);
            rn(e.tail);
            break;
        case "ETypeBrackets":
            r(e.expr);
            break;
        case "ETermBrackets":
            r(e.expr);
            break;
        case "EPrim":
            rle(e.args);
            break;
        default:
            throw new Error(`missing case $ {expr.tag}`);
    }
}
/** A medium-depth copy.
    Creates fresh objects for all of the expressions (and arrays of expressions).
    Reuses any other reachable objects (locations, types, anything else unknown). */
export function exprCopy(expr) {
    return copy(expr);
    function copy(exp) {
        return exprTransform(exp, {
            expr: e => copy(e),
        });
    }
}
export function visitExpr(expr, visitor) {
    return ["", [], []];
}
export function getExprLoc(expr) {
    if (expr.loc === null) {
        // return { filename: "", range: { start: mkPos2(0, 0, 0), end: mkPos2(0, 0, 0) }, lineStarts: [] }
        return mkLoc("", nilPos0, nilPos0);
    }
    else {
        return expr.loc;
    }
}
export function visitAll(field, exp, pre, post) {
    if (pre !== null) {
        pre(field, exp);
    }
    if (exp instanceof Array) {
        exp.forEach((child, index) => {
            // pre(index, child)
            visitAll(index, child, pre, post);
            // post(index, child)
        });
    }
    else {
        exprParts(exp)[2].forEach((name) => {
            let child = exp[name];
            // pre(name, child)
            visitAll(name, child, pre, post);
            // post(name, child)
        });
    }
    if (post !== null) {
        post(field, exp);
    }
}
export function visitAllExpr(tort, torp, field, exp, pre, post) {
    if (pre !== null) {
        pre(tort, torp, field, exp);
    }
    for (const name of exprParts(exp)[2]) {
        let child = exp[name];
        switch (exp.tag) {
            case "ELet":
                visitAllDecls(tort, torp, exp.decls, pre, post);
                break;
            case "EList":
                visitAllExprList(tort, torp, exp.exprs, pre, post);
                if (exp.tail !== null) {
                    visitAllExpr(tort, torp, "tail", exp.tail, pre, post);
                }
                break;
            case "EPrim":
                visitAllExprList(tort, torp, exp.args, pre, post);
                break;
            default:
                const tort2 = exprChildTorT(exp, name) ?? tort;
                const torp2 = exprChildTorP(exp, name) ?? torp;
                visitAllExpr(tort2, torp2, name, child, pre, post);
        }
    }
    if (post !== null) {
        post(tort, torp, field, exp);
    }
}
export function visitAllExprList(tort, torp, exprs, pre, post) {
    for (let i = 0; i != exprs.length; i++) {
        const expr = exprs[i];
        visitAllExpr(tort, torp, i, expr, pre, post);
    }
}
// TODO ? Rename to declsTourAll ?
export function visitAllDecls(tort, torp, decls, pre, post) {
    for (let i = 0; i !== decls.length; i++) {
        const [pat, defn] = decls[i];
        visitAllExpr(tort, "Pat", i, pat, pre, post);
        visitAllExpr(tort, "Term", i, defn, pre, post);
    }
}
export function visitArray(fields, exp, visit) {
    if (exp instanceof Array) {
        exp.forEach((child, index) => {
            let fields2 = [...fields, index];
            visitArray(fields2, child, visit);
        });
    }
    else {
        visit(fields, exp);
    }
}
// TODO ? Rename to exprTreeTour ?
export function visitChildren(exp, visit) {
    if (exp instanceof Array) {
        visitArray([], exp, visit);
    }
    else {
        exprParts(exp)[2].forEach((name) => {
            let child = exp[name];
            if (child instanceof Array) {
                visitArray([name], child, visit);
            }
            else {
                visit([name], child);
            }
        });
    }
}
// TODO ? Rename to exprTreeTour ?
export function visitParentOrChildren(exp, visit) {
    if (exp instanceof Array) {
        visitArray([], exp, visit);
    }
    else {
        visit([], exp);
    }
}
export class Output {
    lines1 = [""];
    nextLine = "";
    nextMargin = "";
    level = 0;
    // spacesPerIndent = 4
    spacesPerIndent = 1;
    marginWidth = 8;
    indentStack = [0];
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
        this.lines1.push(this.nextMargin.padEnd(this.marginWidth) + this.nextLine);
        this.nextLine = "";
        this.nextMargin = "";
    }
    endLine() {
        if (this.nextLine.length > 0) {
            this.flush();
        }
    }
    line(line, level = null, margin) {
        if (level === null) {
            level = this.level;
        }
        else {
            level *= 4;
        }
        if (this.nextLine.length >= level * this.spacesPerIndent) {
            this.flush();
        }
        this.nextLine = this.nextLine.padEnd(level * this.spacesPerIndent);
        this.nextLine += line;
        if (margin !== undefined) {
            this.nextMargin = margin;
        }
    }
    add(line) {
        this.nextLine += line;
    }
    indent(num = 1) {
        this.indentStack.push(this.level);
        this.level += num;
        // this.level += 1
    }
    outdent(num = 1) {
        // this.level -= num
        const level = this.indentStack.pop();
        assert.isTrue(level !== undefined);
        this.level = level;
    }
    indentLine(line, level = null, margin) {
        this.indentStack.push(this.level);
        this.line(line, level, margin);
        this.level += 1 + (line.length + this.spacesPerIndent - 1) / this.spacesPerIndent;
    }
    getLines() {
        this.flush();
        return this.lines1;
    }
}
function showLocNum(n, width) {
    let result = JSON.stringify(n);
    while (result.length < width) {
        result = ` ${result}`;
    }
    return result;
}
function showExprLoc(loc) {
    // if (loc === undefined || loc.range === undefined) {
    //     return ""
    // }
    let margin = `${showLocNum(loc.begin.line, 3)},${showLocNum(loc.begin.col, 3)}`;
    return margin;
}
export function showExpr2(out, expr, fields1, fields2) {
    if (out.level > 40) {
        out.line("...");
        return;
    }
    let line = "";
    line += expr.tag;
    for (let field of fields1) {
        let f1 = JSON.stringify(expr[field]);
        if (f1.length >= 30) {
            f1 = `${f1.slice(0, 20)}...`;
        }
        line += ` ${f1}`;
    }
    out.line(line);
    if (expr.hasOwnProperty("tc")) {
        let expr2 = expr;
        if (expr2.tc !== null && expr2.tc !== undefined) {
            let errSym = `#${expr2.tc.charAt(0).toUpperCase()}`;
            if (errSym !== "#O")
                errSym = `-${errSym}`;
            else
                errSym = ` ${errSym}`;
            out.line(errSym, 31);
        }
    }
    if (expr.hasOwnProperty("ty")) {
        let expr2 = expr;
        out.line(showType(expr2.ty), 33);
    }
    for (let field of fields2) {
        let child = expr[field];
        let margin = showExprLoc(child);
        // out.line(`${field} = `, null, margin)
        // out.indent(2)
        out.indentLine(`${field} = `, null, margin);
        showExpr1(out, child, showExpr2);
        out.outdent(2);
    }
}
function mkShowExprLine(ty, tc) {
    function showExprLine(out, expr, fields1, fields2) {
        if (out.level > 120) {
            out.line("...");
            return;
        }
        let line = "";
        line += expr.tag;
        for (let field of fields1) {
            let f1 = JSON.stringify(expr[field]);
            if (f1.length >= 30) {
                f1 = `${f1.slice(0, 20)}...`;
            }
            line += ` ${f1}`;
        }
        out.line(line, null, showExprLoc(expr.loc));
        if (expr.hasOwnProperty(tc)) {
            let expr2 = expr;
            if (expr2[tc] !== null && expr2[tc] !== undefined) {
                let errSym = `#${expr2[tc].charAt(0).toUpperCase()}`;
                if (errSym !== "#O")
                    errSym = `-${errSym}`;
                else
                    errSym = ` ${errSym}`;
                out.line(errSym, 31);
            }
        }
        if (expr.hasOwnProperty(ty)) {
            let expr2 = expr;
            if (expr2[ty] !== null) {
                out.line(showType((expr2)[ty]), 33);
            }
        }
        for (let field of fields2) {
            let child = expr[field];
            let margin = `${showLocNum(child.loc.range.start.line, 3)},${showLocNum(child.loc.range.start.col, 3)}`;
            // out.line(`${field} = `, null, margin)
            // out.indent(2)
            out.indentLine(`${field} = `, null, margin);
            showExpr1(out, child, showExprLine);
            out.outdent(2);
        }
        out.endLine();
    }
    return showExprLine;
}
function showDecls(out, decls, showExprLine) {
    // out.line("decls =")
    // out.indent(2)
    out.indentLine("decls =");
    for (let [pat, expr] of decls) {
        // out.line("pat = ", null, showLoc(pat.loc))
        // out.indent(2)
        out.indentLine("pat = ", null, showExprLoc(pat.loc));
        showExpr1(out, pat, showExprLine);
        out.outdent(2);
        // out.line("val = ", null, showLoc(expr.loc))
        // out.indent(2)
        out.indentLine("val = ", null, showExprLoc(expr.loc));
        showExpr1(out, expr, showExprLine);
        out.outdent(2);
    }
    out.outdent(2);
    out.endLine();
}
function showAlts(out, decls, showExprLine) {
    // out.line("alts =")
    // out.indent(2)
    out.indentLine("alts =");
    for (let [pat, expr] of decls) {
        // out.line("pat = ", null, showLoc(pat.loc))
        // out.indent(2)
        out.indentLine("pat = ", null, showExprLoc(pat.loc));
        showExpr1(out, pat, showExprLine);
        out.outdent(2);
        // out.line("val = ", null, showLoc(expr.loc))
        // out.indent(2)
        out.indentLine("val = ", null, showExprLoc(expr.loc));
        showExpr1(out, expr, showExprLine);
        out.outdent(2);
    }
    out.outdent(2);
    out.endLine();
}
function showList(out, label, elems, showExprLine) {
    // out.line(`${label} =`)
    // out.indent(2)
    // out.indentLine(`${label} =`)
    out.indentLine(`${label}`);
    elems.forEach((elem, i) => {
        // out.line(`${i} `, null, showLoc(elem.loc))
        // out.indent(1)
        out.indentLine(`${i} `, null, showExprLoc(elem.loc));
        showExpr1(out, elem, showExprLine);
        out.outdent(1);
    });
    out.outdent(2);
    out.endLine();
}
export function showExpr1(out, expr, showExprLine) {
    if (expr instanceof Array) {
        showList(out, "[]", expr, showExprLine);
        return;
    }
    switch (expr.tag) {
        case "ETermBrackets":
            showExprLine(out, expr, [], ["expr"]);
            break;
        case "ETypeBrackets":
            showExprLine(out, expr, [], ["expr"]);
            break;
        case "EAs":
            showExprLine(out, expr, ["name"], ["expr"]);
            break;
        case "EVar":
            showExprLine(out, expr, ["name"], []);
            break;
        case "ELambda":
            showExprLine(out, expr, [], ["pat", "body"]);
            break;
        case "ELambdaMaybe":
            showExprLine(out, expr, [], ["pat", "body"]);
            break;
        case "ELambdaNo":
            showExprLine(out, expr, [], ["pat", "body"]);
            break;
        case "ELambdaYes":
            showExprLine(out, expr, [], ["pat", "body"]);
            break;
        case "EApply":
            showExprLine(out, expr, [], ["func", "arg"]);
            break;
        case "EDatum":
            showExprLine(out, expr, ["value"], []);
            break;
        case "ELet":
            showExprLine(out, expr, [], ["expr"]);
            showDecls(out, expr.decls, showExprLine);
            break;
        case "EPair":
            showExprLine(out, expr, [], ["hd", "tl"]);
            break;
        case "EType":
            showExprLine(out, expr, [], ["expr", "type"]);
            break;
        case "ETypeAs":
            showExprLine(out, expr, ["name"], ["expr", "type"]);
            break;
        case "ECase":
            showExprLine(out, expr, [], ["expr"]);
            showAlts(out, expr.alts, showExprLine);
            break;
        case "EList":
            showExprLine(out, expr, [], expr.tail === null ? [] : ["tail"]);
            showList(out, "list", expr.exprs, showExprLine);
            break;
        case "ETuple":
            showExprLine(out, expr, [], []);
            showList(out, "tuple", expr.exprs, showExprLine);
            break;
        case "EPrim":
            showExprLine(out, expr, ["defn"], []);
            showList(out, "op", expr.args, showExprLine);
            break;
        default:
            throw new Error(`unknown expr ${expr.tag}`);
    }
}
export function showExprTree(out, expr) {
    return showExpr1(out, expr, showExpr2);
}
export function showExpr(out, expr) {
    return showExpr1(out, expr, showExpr2);
}
// export function showExprTy(out: Output, expr: ExprTree<{tc?:TypeAnnot|null}>): void {
export function showExprTy(out, expr) {
    return showExpr1(out, expr, mkShowExprLine("ty", "tc"));
}
export function showExprTy1(out, expr) {
    return showExpr1(out, expr, mkShowExprLine("ty1", "tc"));
}
export function showExprTy2(out, expr) {
    return showExpr1(out, expr, mkShowExprLine("ty2", "tc"));
}
export function showExp(expr) {
    let out = new Output();
    out.level = 2;
    showExpr(out, expr);
    return out.getLines().join("\n");
}
export function showExp2(expr, label, show) {
    let out = new Output();
    console.log(label);
    out.level = 2;
    show(out, expr);
    return out.getLines().join("\n");
}
export function showExprConcise(out, expr, fields1, fields2) {
    if (out.level > 40) {
        out.line("...");
        return;
    }
    let line = "(";
    line += expr.tag;
    for (let field of fields1) {
        let f1 = JSON.stringify(expr[field]);
        if (f1.length >= 30) {
            f1 = `${f1.slice(0, 20)}...`;
        }
        line += ` ${f1}`;
    }
    out.add(line);
    for (let field of fields2) {
        let child = expr[field];
        out.line(`${field} = `, null);
        showExpr1(out, child, showExprConcise);
    }
    out.add(")");
}
export function showExpConcise(expr) {
    let out = new Output();
    out.spacesPerIndent = 0;
    out.marginWidth = 0;
    out.level = 0;
    showExpr1(out, expr, showExprConcise);
    return out.getLines().join(" ");
}
// This returns the free variables of an expression
// This is used to trim the environment before type-checking
// Having the environment only contains the variables which are needed
//   improves memoization opportunities.
// This code works, but is a little special-casey.
// It wouldn't handled an EAs nested beneath multiple brackets.
// These don't/haven't occur/ed in practice, so this is sufficient for now.
export function exprFreeVars(ctx, exp, boundVars, freeVars) {
    let efv = exprFreeVars;
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
                        let patVars = {};
                        patBindVars(ctx, exp.pat.expr, boundVars, freeVars, patVars);
                        patVars[exp.pat.type.name] = null;
                        let boundVars2 = { ...boundVars, ...patVars };
                        efv(ctx, exp.pat.type.expr, boundVars2, freeVars);
                        efv(ctx, exp.body, boundVars2, freeVars);
                        break;
                    }
                    else if (exp.pat.tag === "ETypeAs") {
                        let patVars = {};
                        patBindVars(ctx, exp.pat.expr, boundVars, freeVars, patVars);
                        patVars[exp.pat.name] = null;
                        let boundVars2 = { ...boundVars, ...patVars };
                        efv(ctx, exp.pat.type, boundVars2, freeVars);
                        efv(ctx, exp.body, boundVars2, freeVars);
                        break;
                    }
                    else {
                        let patVars = {};
                        patBindVars(ctx, exp.pat, boundVars, freeVars, patVars);
                        let freeVars2 = {};
                        let boundVars2 = { ...boundVars, ...patVars };
                        efv(ctx, exp.body, boundVars2, freeVars);
                        break;
                    }
                }
                case "Type": {
                    if (exp.pat.tag === "EAs") {
                        let boundVars2 = { ...boundVars };
                        boundVars2[exp.pat.name] = null;
                        efv(ctx, exp.pat.expr, boundVars2, freeVars);
                        efv(ctx, exp.body, boundVars2, freeVars);
                    }
                    else {
                        efv(ctx, exp.pat, boundVars, freeVars);
                        efv(ctx, exp.body, boundVars, freeVars);
                    }
                    break;
                }
                default:
                    throw new Error("missing case");
            }
            break;
        }
        case "ELet": {
            let boundVars2 = { ...boundVars };
            exp.decls.forEach(([pat, defn]) => {
                let patVars = {};
                patBindVars(ctx, pat, boundVars2, freeVars, patVars);
                efv(ctx, defn, boundVars2, freeVars);
                boundVars2 = { ...boundVars2, ...patVars };
            });
            efv(ctx, exp.expr, boundVars2, freeVars);
            break;
        }
        case "EVar": {
            if (!(exp.name in boundVars)) {
                freeVars[exp.name] = null;
            }
            break;
        }
        case "ETermBrackets":
            efv("Term", exp.expr, boundVars, freeVars);
            break;
        case "ETypeBrackets":
            efv("Type", exp.expr, boundVars, freeVars);
            break;
        // handle all these cases with a visit call
        case "EApply":
        case "EList":
        case "EDatum":
        case "EPrim":
        case "EPair":
        case "ESym":
        // case "ETypeAs":
        case "EType": {
            visitChildren(exp, (field, childExpr) => efv(ctx, childExpr, boundVars, freeVars));
            break;
        }
        case "ETypeAs": {
            const exp2 = eTypeAnnot({ loc: nilLoc }, exprAddNilLoc(exp.expr), eAs({ loc: nilLoc }, exp.name, exprAddNilLoc(exp.type)));
            return efv(ctx, exp2, boundVars, freeVars);
            // assert.impossible("This can only exist with in a lambda-pat, not an arbitrary expr")
            // break       
        }
        // we should only encounter "EAs" in a pattern binding position
        case "EAs":
        default: {
            let loc = exp.loc;
            throw new Error(`freeVars: unhandled/missing case ${exp.tag} ${showExprLoc(loc)}`);
        }
    }
}
export function patBindVars(ctx, exp, boundVars, freeVars, patVars) {
    let pbv = patBindVars;
    switch (exp.tag) {
        case "EVar": {
            patVars[exp.name] = null;
            break;
        }
        case "EAs": {
            patVars[exp.name] = null;
            pbv(ctx, exp.expr, boundVars, freeVars, patVars);
            break;
        }
        case "EList": {
            exp.exprs.forEach(elem => {
                pbv(ctx, elem, boundVars, freeVars, patVars);
            });
            if (exp.tail !== null) {
                pbv(ctx, exp.tail, boundVars, freeVars, patVars);
            }
            break;
        }
        case "EType": {
            pbv(ctx, exp.expr, boundVars, freeVars, patVars);
            let tyAnnot = exp.type;
            if (tyAnnot.tag === "ETypeBrackets") {
                tyAnnot = tyAnnot.expr;
            }
            if (tyAnnot.tag === "EAs") {
                patVars[tyAnnot.name] = null;
                exprFreeVars(ctx, tyAnnot.expr, boundVars, freeVars);
            }
            else {
                exprFreeVars(ctx, exp.type, boundVars, freeVars);
            }
            break;
        }
        case "ETypeAs": {
            const exp2 = eTypeAnnot({ loc: nilLoc }, exprAddNilLoc(exp.expr), eAs({ loc: nilLoc }, exp.name, exprAddNilLoc(exp.type)));
            pbv(ctx, exp2, boundVars, freeVars, patVars);
            break;
        }
        case "ETermBrackets": {
            pbv("Term", exp.expr, boundVars, freeVars, patVars);
            break;
        }
        case "ETypeBrackets": {
            if (exp.expr.tag === "EAs") {
                let boundVars2 = { ...boundVars };
                boundVars2[exp.expr.name] = null;
                patVars[exp.expr.name] = null;
                pbv("Type", exp.expr.expr, boundVars, freeVars, patVars);
            }
            else {
                pbv("Type", exp.expr, boundVars, freeVars, patVars);
            }
            break;
        }
        // other cases can be handled by exprFreeVars
        default: {
            exprFreeVars(ctx, exp, boundVars, freeVars);
            break;
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
export function exprStripLoc(e) {
    return strip(e);
    function strip(e) {
        const e2 = exprTransform(e, {
            expr: e => strip(e)
        });
        e2.loc = null;
        return e2;
    }
}
export function declsStripLoc(decls) {
    let s = exprStripLoc;
    return decls.map(([p, d]) => [s(p), s(d)]);
}
export function exprAddNilLoc(expr) {
    return addLoc(expr);
    function addLoc(e) {
        const e2 = exprTransform(e, {
            expr: e => addLoc(e)
        });
        e2.loc = nilLoc;
        return e2;
    }
}
//# sourceMappingURL=expr.js.map