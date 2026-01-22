import { assert } from "../utils/assert.js";
// const jsDefaultCtx = [["JsParens",["JsDatum", []]], 1];
export const jsDefaultCtx = [jsParens(jsDatum(null)), 1];
export function jsDatum(datum) {
    return { tag: "JsDatum", datum: datum };
}
export function jsVar(name) {
    return { tag: "JsVar", name: name };
}
export function jsCall(func, args) {
    return { tag: "JsCall", func: func, args: args };
}
export function jsOp(opName, args) {
    return { tag: "JsOp", opName: opName, args: args };
}
export function jsParens(expr) {
    return { tag: "JsParens", expr };
}
export function jsLambdaExpr(params, body) {
    return { tag: "JsLambdaExpr", params: params, body: body };
}
export function jsLambdaStmt(params, body) {
    return { tag: "JsLambdaStmt", params: params, body: body };
}
export function jsList(elems) {
    return { tag: "JsList", elems: elems };
}
export function jsExprStmt(exp) {
    return { tag: "JsExpr", expr: exp };
}
export function jsReturn(exp) {
    return { tag: "JsReturn", expr: exp };
}
export function jsLet(pat, defn) {
    return { tag: "JsLet", pat: pat, defn: defn };
}
export function jsMethod(obj, meth) {
    return { tag: "JsMethod", object: obj, method: meth };
}
export function freshVarJs(name, jsNameSrc) {
    let varJs = `u${jsNameSrc.id}_${name}`;
    jsNameSrc.id += 1;
    return varJs;
}
export function isJsLambda(exp) {
    switch (exp.tag) {
        case "JsLambdaExpr":
            return true;
        case "JsLambdaStmt":
            return true;
        default:
            return false;
    }
}
export function isJsExprYes(exp) {
    return exp !== undefined && exp !== null && exp.tag !== "JsMissing";
}
//#endregion
//#region Js Print 1
export function jsExpr_print(expr) {
    let p = jsExpr_print;
    switch (expr.tag) {
        case "JsVar":
            return expr.name;
        case "JsDatum":
            return JSON.stringify(expr.datum);
        case "JsList": {
            let elemsTxt = expr.elems.map(e => e === undefined ? "" : jsExpr_print(e));
            return `[${elemsTxt.join(",")}]`;
        }
        case "JsCall": {
            let funTxt = jsExpr_print(expr.func);
            let argsTxt = expr.args.map(a => jsExpr_print(a));
            if (expr.func.tag === "JsLambdaExpr" || expr.func.tag === "JsLambdaStmt") {
                return `(${funTxt})(${argsTxt.join(",")})`;
            }
            else {
                return `${funTxt}(${argsTxt.join(",")})`;
            }
        }
        case "JsOp": {
            if (expr.args.length === 2) {
                return `(${p(expr.args[0])} ${expr.opName} ${p(expr.args[1])})`;
            }
            else {
                throw new Error(`unexpected number of arguments (${expr.args.length})`);
            }
        }
        case "JsLambdaExpr": {
            let patsTxt = expr.params.map(a => p(a));
            let bodyTxt = p(expr.body);
            return `(${patsTxt.join(",")}) => (${bodyTxt})`;
        }
        case "JsLambdaStmt": {
            let patsTxt = expr.params.map(a => p(a));
            let out = [];
            jsStmts_print(0, expr.body, out);
            return `(${patsTxt.join(",")}) => {${out.map(([i, s]) => s).join(" ")}}`;
        }
        case "JsMethod": {
            let obj = p(expr.object);
            if (isJsLambda(expr.object)) {
                obj = `(${obj})`;
            }
            return `${obj}.${expr.method}`;
        }
        default:
            throw new Error(`missing case ${expr.tag}`);
    }
}
export function jsStmt_print(indent, stmt, lines) {
    let pe = jsExpr_print;
    switch (stmt.tag) {
        case "JsExpr":
            lines.push([indent, `${pe(stmt.expr)};`]);
            break;
        case "JsLet": {
            lines.push([indent, `let ${pe(stmt.pat)} = ${pe(stmt.defn)};`]);
            break;
        }
        case "JsReturn": {
            lines.push([indent, `return ${pe(stmt.expr)};`]);
            break;
        }
        default:
            throw new Error(`missing case ${stmt.tag}`);
    }
}
export function jsStmts_print(indent, stmts, lines) {
    stmts.forEach(stmt => {
        jsStmt_print(indent, stmt, lines);
    });
}
//#endregion
//#region Js Print 2
export function freshVarName(v, jsNameSrc) {
    const v2 = v;
    const a = v2.addr === undefined ? "" : `_a${v2.addr}`;
    let varJs = `u${jsNameSrc.id}${a}_${v.name}`;
    jsNameSrc.id += 1;
    return varJs;
}
export function jsExpr_print2(indent, expr) {
    const pe = (expr) => jsExpr_print2(indent, expr);
    const ps = jsStmts_print2;
    switch (expr.tag) {
        case "JsVar":
            return expr.name;
        case "JsDatum":
            return JSON.stringify(expr.datum);
        case "JsList": {
            let elemsTxt = expr.elems.map(e => e === undefined ? "" : pe(e));
            return `[${elemsTxt.join(",")}]`;
        }
        case "JsCall": {
            let funTxt = pe(expr.func);
            let argsTxt = expr.args.map(a => pe(a));
            if (expr.func.tag === "JsLambdaExpr" || expr.func.tag === "JsLambdaStmt") {
                return `(${funTxt})(${argsTxt.join(",")})`;
            }
            else {
                return `${funTxt}(${argsTxt.join(",")})`;
            }
        }
        case "JsOp": {
            if (expr.args.length === 2) {
                return `(${pe(expr.args[0])} ${expr.opName} ${pe(expr.args[1])})`;
            }
            else {
                throw new Error(`unexpected number of arguments (${expr.args.length})`);
            }
        }
        case "JsLambdaExpr": {
            let patsTxt = expr.params.map(a => pe(a));
            let bodyTxt = pe(expr.body);
            return `(${patsTxt.join(",")}) => (${bodyTxt})`;
        }
        case "JsLambdaStmt": {
            let patsTxt = expr.params.map(a => pe(a));
            let out = [];
            ps(indent + 1, expr.body, out);
            // return `(${patsTxt.join(",")}) => {${out.map(([i, s]) => s).join(" ")}}`
            return [
                `(${patsTxt.join(",")}) => {`,
                ...out.map(([i, s]) => " ".repeat(i * 4) + s),
                `}`
            ].join("\n");
        }
        case "JsMethod": {
            let obj = pe(expr.object);
            if (isJsLambda(expr.object)) {
                obj = `(${obj})`;
            }
            return `${obj}.${expr.method}`;
        }
        case "JsCommentExpr":
        case "JsParens":
        case "JsObject":
            assert.todo("?");
        default:
            assert.noMissingCases(expr);
    }
}
export function jsStmt_print2(indent, stmt, lines) {
    const pe = (expr) => jsExpr_print2(indent, expr);
    switch (stmt.tag) {
        case "JsExpr":
            lines.push([indent, `${pe(stmt.expr)};`]);
            break;
        case "JsLet": {
            lines.push([indent, `let ${pe(stmt.pat)} = ${pe(stmt.defn)};`]);
            break;
        }
        case "JsReturn": {
            lines.push([indent, `return (${pe(stmt.expr)});`]);
            break;
        }
        case "JsLetUndefined":
        case "JsIf":
        case "JsIfElse":
        case "JsWhile":
        case "JsDoWhile":
        case "JsCommentStmt":
        case "JsBreak":
        case "JsContinue":
            assert.todo("?");
        default:
            assert.noMissingCases(stmt);
    }
}
export function jsStmts_print2(indent, stmts, lines) {
    stmts.forEach(stmt => {
        jsStmt_print2(indent, stmt, lines);
    });
}
export function jsStmts_print3(stmts, lines) {
    const indentLines = [];
    jsStmts_print2(0, stmts, indentLines);
    for (const [indent, text] of indentLines) {
        lines.push(" ".repeat(indent * 4) + text);
    }
    // const result = lines.map(([indent, text]) => " ".repeat(indent * 4) + text)
    // return result
}
//#endregion
//# sourceMappingURL=codegen-js.js.map