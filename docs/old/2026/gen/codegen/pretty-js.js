import { assert } from "../utils/assert.js";
import { isJsExprYes, jsParens, jsDatum } from "./codegen-js.js";
// const space = ""
const space = " ";
const pIndentIncrement = 4;
const pMaxLineSpan = 60; // The distance from the first to last visible characters in a line.
const pMaxLineIndent = 100;
const defaultCtx = { outerExpr: jsParens(jsDatum(null)), pos: 1 };
function mkCtx(outerExpr) {
    return (pos) => ({ outerExpr, pos: pos + 1 });
}
function pDoc(lines, span) {
    if (lines === undefined) {
        return { lines: [], span: 0 };
    }
    if (span === undefined) {
        span = 0;
        for (const line of lines) {
            for (const item of line.items) {
                switch (typeof item) {
                    case "string":
                        span += item.length + space.length;
                        break;
                    case "number":
                        // Ignore the column items.
                        break;
                    default:
                        assert.noMissingCases(item);
                }
            }
        }
    }
    return { lines, span };
}
function pLine(left, right, items) {
    return { left, right, items };
}
function pLineCopy(line) {
    return { ...line };
}
// This appends in place.
function pLineAppend(line, ...items) {
    for (const item of items) {
        switch (typeof item) {
            case "string":
                line.items.push(item);
                line.right += item.length + space.length;
                break;
            case "number":
                if (item > line.right) {
                    line.items.push(item);
                    line.right = item;
                }
                break;
            default:
                assert.noMissingCases(item);
        }
    }
}
// This is a simple and overly cautious implementation of needsParens.
function needsParens_simple(ctx, expr) {
    switch (expr.tag) {
        case "JsVar":
        case "JsDatum":
        case "JsList":
            // We mustn't place patterns in parentheses.
            return false;
        case "JsParens":
        // It's pointless to put parentheses in parentheses.
        default:
            // For everything else, it's safe to use parentheses.
            return true;
    }
}
function needsParens(ctx, expr) {
    const outerTag = ctx.outerExpr.tag;
    const pos = ctx.pos;
    switch (expr.tag) {
        case "JsVar":
        case "JsDatum":
        case "JsList":
        case "JsParens":
            return false;
        case "JsLambdaExpr":
        case "JsLambdaStmt":
            return (outerTag === "JsCall" && pos === 1);
        case "JsCall":
            return false;
        default:
            switch (outerTag) {
                case "JsList":
                case "JsParens":
                case "JsLambdaExpr":
                case "JsLambdaStmt":
                    return false;
                default:
                    return true;
            }
    }
}
// This version was ported from the fe-in-fe/fe4-codegen-js-pretty2.fe,
// It is probably best to delete it.
function needsParens2(ctx, expr) {
    const { outerExpr: { tag }, pos } = ctx;
    switch (tag) {
        case "JsVar":
        case "JsDatum":
        case "JsList":
        case "JsParens":
        case "JsLambdaExpr":
        case "JsLambdaStmt":
            return false;
        case "JsOp":
            switch (expr.tag) {
                case "JsCall": return false;
                default: return true;
            }
        case "JsCall":
            switch (expr.tag) {
                case "JsCall":
                case "JsList":
                    return false;
                case "JsLambdaExpr":
                    return pos === 1;
                case "JsLambdaStmt":
                    return pos === 1;
                default: return true;
            }
        case "JsObject":
            switch (expr.tag) {
                case "JsLambdaStmt":
                    return false;
                default: return true;
            }
        case "JsMethod":
            return true;
        case "JsCommentExpr":
            return true;
        default:
            assert.noMissingCases(tag);
    }
}
function pText(indent, text, trailing) {
    if (trailing !== undefined) {
        const textP = pDoc([pLine(indent, indent + text.length, [text])]);
        return pS(textP, ...trailing);
    }
    return pDoc([pLine(indent, indent + text.length, [text])]);
}
function pCompose(result, docs) {
    // const result: PD = pDoc([])
    let ownLast = false;
    for (const doc of docs) {
        if (doc.lines.length === 0)
            continue;
        result.span =
            result.span === null || doc.span === null
                ? null
                : result.span + doc.span;
        const prev = result;
        const next = doc;
        if (result.lines.length === 0) {
            result.lines.push(...next.lines);
            ownLast = false;
            continue;
        }
        const prevLast = prev.lines.at(-1);
        const nextFirst = next.lines[0];
        // There are three ways to handling the meeting of the last line of one document and the first line of the next document:
        //   - New-line, place the next line on a new-line.
        //   - Overlay, place the next line on top of the prev line, the prev line must end at an earlier column than the next line starts.
        //   - Append, place the next line on the end of the prev line, the column-positions of the added items may change.
        // Appending is only done when the user explicitly calls pSquash/pS.
        // This code will overlay the lines, or use new-lines.
        const lineSpan = (prevLast.right - prevLast.left) + (nextFirst.right - nextFirst.left);
        const spanOk = lineSpan < pMaxLineSpan;
        const indentOk = nextFirst.left < pMaxLineIndent;
        const columnsOk = prevLast.right <= nextFirst.left;
        // Overlay is allowed to continue, beyond the usual max-span limit, so long as the max-indent limit is not reached.
        // Without this we get line-breaks in places which look silly.
        // For very long lines, we still need some line-breaks though, in-order to limit right-margin overflow.
        // Excessive indenting will be handled during final formating, 
        //   the number of spaces prepended to lines will be capped.
        const canOverlay = columnsOk && (spanOk || indentOk);
        const useSameLine = canOverlay; // || canAppend
        if (useSameLine) {
            let last = prevLast;
            if (!ownLast) {
                result.lines.push(last = pLineCopy(result.lines.pop()));
                ownLast = true;
            }
            pLineAppend(last, nextFirst.left, ...nextFirst.items);
            if (next.lines.length > 1) {
                result.lines.push(...next.lines.slice(1));
                ownLast = false;
            }
        }
        else {
            // Otherwise, start the next document on a new line.
            result.lines.push(...next.lines);
        }
    }
    return result;
}
function pJ(...docs) {
    const result = pDoc();
    pCompose(result, docs);
    return result;
}
function pS(...docs) {
    let totalSpan = 0;
    for (const doc of docs) {
        if (doc.span === null) {
            totalSpan = null;
            break;
        }
        totalSpan += doc.span;
    }
    if (totalSpan !== null && totalSpan <= pMaxLineSpan) {
        const accum = pDoc();
        pCompose(accum, docs);
        return pSquash(accum);
    }
    else {
        const accum = pDoc();
        accum.span = null;
        pCompose(accum, docs);
        accum.span = null;
        return accum;
    }
}
// Squashing tries to place all the items in a document on the same line without exceeding the max-span limit.
// The desired column of the first item is retained, 
//   the desired column for the remaining items is dropped.
function pSquash(doc) {
    if (doc.lines.length === 0)
        return doc;
    const items = [];
    const left = doc.lines[0].left;
    let span = 0;
    for (const line of doc.lines) {
        for (const item of line.items) {
            switch (typeof item) {
                case "string":
                    items.push(item);
                    span += item.length + space.length;
                    if (span > pMaxLineSpan) {
                        assert.impossible("? This should have been checked at the document level ?");
                        return doc;
                    }
                case "number":
                    // Ignore column number items, we are squeezing everything together.
                    break;
                default:
                    assert.noMissingCases(item);
            }
        }
    }
    return pDoc([pLine(left, left + span, items)]);
}
function pList(indent, [opn, sep, cls], docs, trailing) {
    const pT = (text, trailing) => pText(indent, text, trailing);
    if (docs.length === 0)
        return pJ(pT(opn), pT(cls));
    const [first, ...rest] = docs;
    return pS(pT(opn), first, ...rest.flatMap(doc => [pT(sep), doc]), pT(cls, trailing));
}
function pParen(indent, doc, trailing) {
    const pT = (text, trailing) => pText(indent, text, trailing);
    return pS(pT("("), doc, pT(")", trailing));
}
function jsPrettyStmts(indent, stmts) {
    return pJ(...stmts.map(s => pS(jsPrettyStmt(indent, s))));
}
function jsPrettyStmtBlock(indent, stmts) {
    const indent2 = indent + pIndentIncrement;
    const pT = (text) => pText(indent, text);
    const stmts2 = stmts.map(s => jsPrettyStmt(indent2, s));
    return (pJ(pT("{"), ...stmts2, pT("}")));
}
function jsPrettyMaybe(indent, ctx, exprMaybe, trailing) {
    return (isJsExprYes(exprMaybe)
        ? jsPrettyExpr(indent, ctx, exprMaybe, trailing)
        : pDoc());
}
function jsPrettyStmt(indent, stmt) {
    const dispS = (indent, stmt) => jsPrettyStmt(indent, stmt);
    const indent2 = indent + pIndentIncrement;
    const dispE1 = (e, trailing) => jsPrettyExpr(indent, defaultCtx, e, trailing);
    const dispE = (e, trailing) => jsPrettyExpr(indent2, defaultCtx, e, trailing);
    const dispSS = (stmts) => jsPrettyStmts(indent, stmts);
    const dispSB = (stmts) => jsPrettyStmtBlock(indent, stmts);
    const pT = (text) => pText(indent, text);
    // TODO Take trailing as an argument, and append the semi-colon to that.
    // const trailing: PTrailing = [pT(";")]
    const trailing = [];
    switch (stmt.tag) {
        case "JsExpr":
            return dispE1(stmt.expr, trailing);
        case "JsLet":
            if (isJsExprYes(stmt.defn)) {
                return pS(pS(pT("let"), dispE(stmt.pat), pT("=")), dispE(stmt.defn, [pT(";"), ...trailing]));
            }
            return pS(pT("let"), dispE(stmt.pat, [pT(";"), ...trailing]));
        case "JsReturn":
            // return p3HV(sq, [pT("return ("), dispE(stmt.expr), pT(");")])
            return pS(pT("return ("), dispE(stmt.expr, [pT(");"), ...trailing]));
        case "JsLetUndefined":
        // p3HV [p3T "let ", p3T <| strJoin ", " vars, p3T "; "]
        case "JsIf":
        // // -- p3HV [p3T "if (", dispE cond, p3T ")", dispSB then]
        case "JsIfElse":
        //  p3V [p3HV [p3T "if (", dispE cond, p3T ")"], dispSB then, p3T "else", dispSB else]
        case "JsWhile":
        //  p3V [p3HV [p3T "while (", dispE cond, p3T ")"], dispSB body]
        case "JsDoWhile":
        // p3V [ p3T "do", dispSB body, p3T "while (", dispE cond, p3T ");"]
        case "JsCommentStmt":
        // p3T <| strCat ["/* ", msg, " */"];
        case "JsBreak":
        // p3T "break;"
        case "JsContinue":
            // p3T "continue;"
            assert.todo();
        default:
            assert.noMissingCases(stmt);
    }
}
function jsPrettyExpr(indent0, ctx, expr, trailing) {
    let result;
    if (needsParens(ctx, expr)) {
        const indent1 = indent0 + pIndentIncrement;
        result = jsPrettyExpr1(indent1, ctx, expr);
        result = pParen(indent0, result, trailing);
        return result;
    }
    else {
        result = jsPrettyExpr1(indent0, ctx, expr, trailing);
        return result;
    }
}
function jsPrettyExpr1(indent0, ctx0, expr, trailing) {
    const indent1 = indent0 + pIndentIncrement;
    const dispE0 = (ctx, e, trailing) => jsPrettyExpr(indent0, ctx, e, trailing);
    const dispE = (ctx, e, trailing) => jsPrettyExpr(indent1, ctx, e, trailing);
    const dispSS = (s) => jsPrettyStmts(indent1, s);
    const dispSB = (s) => jsPrettyStmtBlock(indent1, s);
    const dispM = (ctx, e, trailing) => jsPrettyMaybe(indent1, ctx, e, trailing);
    const pT = (text, trailing) => pText(indent0, text, trailing);
    const pos = mkCtx(expr);
    switch (expr.tag) {
        case "JsVar":
            return pT(expr.name, trailing);
        case "JsDatum":
            return pT(JSON.stringify(expr.datum), trailing);
        case "JsList": {
            let expTail = expr;
            const elems = [];
            while (true
                && isJsExprYes(expTail)
                && expTail.tag === "JsList"
                && expTail.elems.length === 2
                && isJsExprYes(expTail.elems[0])) {
                elems.push(expTail.elems[0]);
                expTail = expTail.elems[1];
            }
            if (elems.length === 0) {
                const elemsP = expr.elems.map(e => dispM(pos(0), e));
                return pList(indent0, ["[", ",", "]"], elemsP, trailing);
            }
            const elemDocs = [pT("["), dispE(pos(0), elems[0])];
            for (const e of elems.slice(1)) {
                elemDocs.push(pT(",["), dispE(pos(0), e));
            }
            const tailDoc = [pT(","), dispM(pos(0), expTail)];
            const clsDoc = pT("]".repeat(elems.length), trailing);
            const result = pJ(...elemDocs, ...tailDoc, clsDoc);
            return pS(result);
        }
        case "JsCall":
            if (true
                && expr.args.length === 0
                && expr.func.tag === "JsLambdaStmt"
                && expr.func.params.length === 0) {
                // This provides special-handling for statements brought into an expression context.
                // Aka IIFE/IILE (Immediately Invoked Function/Lambda Expressions).
                const func = expr.func;
                const bodyPP = dispSS(func.body);
                return pS(pT("(()=>{"), bodyPP, pT("})()", trailing));
            }
            if (expr.args.length === 0) {
                return pS(dispE0(pos(0), expr.func), pT("()", trailing));
            }
            if (expr.args.length === 1) {
                return pS(dispE0(pos(0), expr.func), pS(pT("("), dispE(pos(1), expr.args[0]), pT(")", trailing)));
            }
            const funcP = dispE0(pos(0), expr.func);
            const argsP = expr.args.map(a => dispE(pos(1), a));
            const [argFirstP, ...argsRestP] = argsP;
            return pS(funcP, pT("("), argFirstP, ...argsRestP.map(a => pJ(pT(", "), a)), pT(")", trailing));
        case "JsOp":
            if (expr.args.length === 2) {
                return pS(dispE(pos(0), expr.args[0]), pT(expr.opName), dispE(pos(1), expr.args[1], trailing));
            }
            if (expr.args.length === 3 && expr.opName === "?:") {
                return pS(dispE(pos(0), expr.args[0]), pT("?"), dispE(pos(1), expr.args[1]), pT(":"), dispE(pos(2), expr.args[1], trailing));
            }
            assert.todo(`Handler operator (${JSON.stringify(expr.opName)})`);
        case "JsLambdaExpr": {
            const lambdas = [];
            // const lambdas: (JsExpr & {tag: "JsLambdaExpr" | "JsLambdaStmt"})[] = []
            let e = expr;
            while (e.tag === "JsLambdaExpr") {
                lambdas.push(e);
                e = e.body;
            }
            // TODO Check for a JsLambdaStmt, we can absorb one into the list of lambdas above
            const paramsP = pS(pJ(...lambdas.map(lm => pS(pList(indent0, ["(", ",", ")=>"], lm.params.map(p => dispE(mkCtx(lm)(0), p)))))));
            // TODO Handle the body of either JsLambdaExpr or JsLambdaBody here.
            const bodyP = dispE(pos(1), lambdas.at(-1).body, trailing);
            return pS(paramsP, bodyP);
        }
        case "JsLambdaStmt": {
            const paramsPP = pList(indent0, ["(", ",", ")=>"], expr.params.map(p => dispE(pos(0), p)));
            // TODO ? Pass trailing into dispSB ?
            const bodyPP = dispSB(expr.body);
            const bodyPP2 = pS(bodyPP, bodyPP);
            return pS(paramsPP, bodyPP2);
        }
        case "JsMethod":
            // p3HV [dispE [js, 1] obj, p3T ".", p3T method]
            return pS(dispE(pos(0), expr.object), pT("."), pT(expr.method));
        case "JsCommentExpr":
            //  // -- TODO quote the msg in a way that ensures the comment doesn't terminate prematurely
            //  let comment = p3T <| strCat ["/* ", msg, " */"];
            //  p3HV [comment, dispE ctx expr]
            let comment = pT(["/* ", expr.comment, " */"].join(""));
            return pS(comment, dispE(ctx0, expr));
        case "JsParens":
            return pS(pT("("), dispE(pos(0), expr.expr), pT(")"));
        case "JsObject":
            // , ["JsObject", fields] |=>
            //     let fieldsP = 
            //         forMap fields <|
            //         [name, expr] ->
            //         p3H [p3T name, p3T ": ", dispE [js,1] expr];
            //     p3List2 indent ["{", ",", "}"] <| fieldsP
            const fieldsP = expr.methods.map(([name, expr]) => pJ(pT(name), pT(": "), dispE(pos(0), expr)));
            return pList(indent0, ["{", ",", "}"], fieldsP);
        default:
            assert.noMissingCases(expr);
    }
}
export function pretty_printJs(stmts, lines) {
    const pd = jsPrettyStmts(0, stmts);
    for (const line of pd.lines) {
        let col = line.left;
        const items = [];
        for (const item of line.items) {
            switch (typeof item) {
                case "string":
                    items.push(item, space);
                    col += item.length + space.length;
                    break;
                case "number":
                    if (item > col) {
                        items.push(" ".repeat(item - col));
                        col = item;
                    }
                    break;
                default:
                    assert.noMissingCases(item);
            }
        }
        const indent = Math.min(pMaxLineIndent, line.left);
        lines.push(" ".repeat(indent) + items.join(""));
    }
}
//# sourceMappingURL=pretty-js.js.map