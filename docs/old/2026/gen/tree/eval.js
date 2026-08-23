import { assert } from "../utils/assert.js";
import { getIo } from "../io/io.js";
// Syntax
import { showLoc } from "../syntax/token.js";
import { exprStripLoc } from "../syntax/expr.js";
// Tree
import { anyT, evalTypeBrackets } from "../tree/types.js";
// Takes an expression about to be used to build a closure
// Returns a copy with the locations removed 
// Removing the locations improves memoization opportunities
//   at the cost of some diagnostic info.
// In practice, typical type-error locations get reported okay,
//   but any errors in term-level code that is evaluated at type-checking time
//   will no longer have location info
// If needed, the trade-off can be reversed by twiddling the comments
function stripClosureLoc(expr) {
    // return expr
    // return e.exprNullifyLocation(expr)
    return exprStripLoc(expr);
}
function withLoc(expr) {
    // return e.exprAddNilLoc(expr)
    let expr2 = expr;
    return expr2;
}
export function showMbLoc(e) {
    if (e.loc === null) {
        return `Expr Location Stripped on (${e.tag})`;
    }
    if (e.loc === undefined) {
        return `Expr Location Missing on (${e.tag})`;
    }
    return showLoc(e.loc);
}
// This was a brief experiment in keeping a distinction between Nodes and Values,
//   so as to facilitate moving to a new common value representation.
// Need to stick to using simple JSON/Data values for now, 
//   so as to keep the memoization code working.
// export type Node = {
//     toValue(): Value
// }
// class NodeImpl {
//     value: Value
//     constructor(value: Value) {
//         this.value = value
//     }
//     toValue(): Value {
//         return this.value
//     }
// }
export function node(value) {
    // return { indirect: null, value: value }
    return value;
    // return new NodeImpl(value)
}
export function atomicValue(value) {
    let v = { tag: "atomic", value: value };
    return v;
}
export function typeValue(type) {
    let v = { tag: "type", type: type };
    return v;
}
export function blockedValue(name) {
    let v = { tag: "blocked", name: name };
    return v;
}
// export function blockedPrimitive(name: string): BlockedValue {
//     let v: BlockedValue = { tag: "blocked", name: name };
//     return v;
// }
export function pairValue(h, t) {
    let v = { tag: "pair", head: h, tail: t };
    return v;
}
export function closureValue(env, argPat, expr) {
    let sl = stripClosureLoc;
    let v = { tag: "closure", env: env, argPat: sl(argPat), expr: sl(expr) };
    return v;
}
function closureMaybeValue(env, argPat, expr) {
    let sl = stripClosureLoc;
    let v = { tag: "closureMaybe", env: env, argPat: sl(argPat), expr: sl(expr) };
    return v;
}
function closureNothingValue(env, argPat, expr) {
    let sl = stripClosureLoc;
    let v = { tag: "closureNothing", env: env, argPat: sl(argPat), expr: sl(expr) };
    return v;
}
function closureJustValue(env, argPat, expr) {
    let sl = stripClosureLoc;
    let v = { tag: "closureJust", env: env, argPat: sl(argPat), expr: sl(expr) };
    return v;
}
export function primValue2(name, arity, args) {
    let v = { tag: "primitive2", name: name, arity: arity, args: args };
    return v;
}
export function termVarValue(varName) {
    let v = { tag: "termVar", varName: varName };
    return v;
}
export class BlockedValueException {
    blockedValue;
    error;
    constructor(blockedValue) {
        this.error = new Error();
        this.blockedValue = blockedValue;
    }
}
export function lookupVar(name, env) {
    const io = getIo();
    if (!env.hasOwnProperty(name)) {
        // logger.log("eval", 1, `unknown variable in variable lookup: ${name}`)
        io.log(`unknown variable in variable lookup: ${name}`);
        // return [node(holeValue),neverT]
        // return [node(typeValue(varT(name))),neverT]
        throw new Error(`unknown variable: ${name} in env: ${env}`);
    }
    else {
        return env[name];
    }
}
export function evalNode(node) {
    // const node_value = node.value
    const node_value = node;
    // const node_value = node.toValue()
    // TODO ? Don't throw, allow blocked values to propagate ?
    if (node_value.tag === "blocked") {
        let err = new BlockedValueException(blockedValue(node_value.name));
        throw err;
    }
    return node_value;
}
function nodeToJs(node) {
    let v = evalNode(node);
    if (v.tag === "pair") {
        let h = nodeToJs(v.head);
        let t = nodeToJs(v.tail);
        return [h, t];
    }
    else if (v.tag === "atomic") {
        return v.value;
    }
    else {
        throw new Error("non-data value in nodeToJs");
    }
}
// TODO We can probably get rid of printValue.
// TODO It made more sense when the language was lazy,
// TODO It makes it possible to see some output, as evaluation is still progressing (or diverging).
function println(a) {
    console.log(a);
}
export function printValue(node, bracketsNeeded) {
    let v = evalNode(node);
    if (v.tag === "pair") {
        if (bracketsNeeded)
            println("(");
        let h = printValue(v.head, true);
        println(",");
        let t = printValue(v.tail, false);
        if (bracketsNeeded)
            println(")");
        if (bracketsNeeded)
            return `(${h},${t})`;
        else
            return `${h},${t}`;
    }
    else if (v.tag === "atomic") {
        let r;
        if (v.value === null) {
            r = "()";
        }
        else {
            r = JSON.stringify(v.value);
        }
        println(r);
        return r;
    }
    else {
        println(`#${v.tag}`);
        return `#${v.tag}`;
    }
}
export function showValueFe(node) {
    let n = node;
    let v = evalNode(n);
    if (v.tag === "pair") {
        let result = "[" + showValueFe(v.head);
        n = v.tail;
        v = evalNode(n);
        while (v.tag === "pair") {
            result += "," + showValueFe(v.head);
            n = v.tail;
            v = evalNode(n);
        }
        if (v.tag !== "atomic" || v.value !== null) {
            result += ",," + showValueFe(n);
        }
        result += "]";
        return result;
    }
    else if (v.tag === "atomic") {
        if (v.value === null) {
            return "[]";
        }
        else {
            return JSON.stringify(v.value);
        }
    }
    else {
        return `#${v.tag}`;
    }
}
function evalDecls(decls, env) {
    let newEnv = { ...env };
    for (let [pattern, defn] of decls) {
        let ty = anyT;
        let val = evalExpr(defn, newEnv);
        let pm = patMatch(val, pattern);
        if (pm !== null) {
            newEnv = { ...newEnv, ...pm };
        }
    }
    return newEnv;
}
export function evalExpr(expr, env) {
    try {
        switch (expr.tag) {
            case "EApply": {
                let func = evalNode(evalExpr(expr.func, env));
                let arg = evalExpr(expr.arg, env);
                switch (func.tag) {
                    case "closure":
                    case "closureMaybe":
                    case "closureNothing":
                    case "closureJust":
                        return applyClosure(func, arg, expr.loc);
                    case "primitive2":
                        return applyPrimitive(func, arg, expr.loc);
                    default:
                        throw new Error(`bad function application, expected a closure or primitive, not (${func.tag})`);
                }
            }
            case "ELambda": {
                return node(closureValue(env, expr.pat, expr.body));
            }
            case "ELambdaMaybe": {
                return node(closureMaybeValue(env, expr.pat, expr.body));
            }
            case "ELambdaNo": {
                let body = expr.body;
                return node(closureNothingValue(env, expr.pat, expr.body));
            }
            case "ELambdaYes": {
                let body = expr.body;
                return node(closureJustValue(env, expr.pat, expr.body));
            }
            case "ETypeBrackets": {
                let tval = evalTypeBrackets(withLoc(expr.expr), env);
                return node(typeValue(tval));
            }
            case "EVar": {
                let v2 = lookupVar(expr.name, env);
                return v2[0];
            }
            case "ELet": {
                let newEnv = evalDecls(expr.decls, env);
                return evalExpr(expr.expr, newEnv);
            }
            case "EDatum": {
                return node(atomicValue(expr.value));
            }
            case "EPair": {
                return node(pairValue(evalExpr(expr.hd, env), evalExpr(expr.tl, env)));
            }
            case "EType": {
                return evalExpr(expr.expr, env);
            }
            case "EList": {
                let tail = expr.tail === null ? node(atomicValue(null)) : evalExpr(expr.tail, env);
                return expr.exprs.map(e => evalExpr(e, env)).reduceRight((t, e) => node(pairValue(e, t)), tail);
            }
            case "ETermBrackets":
                return evalExpr(expr.expr, env);
            case "EPrim": {
                let [arity, prim, type] = lookupPrimTable(expr.name);
                let result;
                if (expr.args.length === arity) {
                    const args = expr.args.map(a => evalExpr(a, env));
                    result = prim(args);
                }
                else {
                    throw new Error(`Incorrect number of operands (${expr.args.length}) for operator (${expr.name}, ${arity})`);
                }
                return result;
            }
            default:
                throw new Error(`missing case: ${JSON.stringify(expr)}`);
        }
    }
    catch (err) {
        if (!(err instanceof BlockedValueException)) {
            let name = "";
            if (expr.tag === "EApply" && expr.func.tag === "EVar") {
                name = expr.func.name;
            }
            let e2 = expr;
            if (e2.loc !== null) {
                let loc = e2.loc;
                console.log(`Error ${loc.filename}: ${JSON.stringify(loc.begin)} - ${JSON.stringify(loc.end)}: ${name}`);
            }
            else {
                console.log(`Error : ${name}`);
            }
        }
        throw err;
    }
}
export function applyClosure(func, arg, loc) {
    const pm = patMatch(arg, func.argPat);
    switch (func.tag) {
        case "closure": {
            // let pm = patMatch(arg, func.argPat)
            if (pm !== null) {
                let newEnv = { ...func.env, ...pm };
                return evalExpr(func.expr, newEnv);
            }
            else {
                throw new Error(`pattern match failure at: (${showLoc(loc)}), value: (${showValueFe(arg)})`);
            }
        }
        case "closureMaybe": {
            // let pm = patMatch(arg, func.argPat)
            if (pm !== null) {
                let newEnv = { ...func.env, ...pm };
                let result = evalExpr(func.expr, newEnv);
                return node(pairValue(result, node(atomicValue(null))));
            }
            else {
                return node(atomicValue(null));
            }
        }
        case "closureNothing": {
            // let pm = patMatch(arg, func.argPat)
            if (pm !== null) {
                let newEnv = { ...func.env, ...pm };
                let result = evalExpr(func.expr, newEnv);
                return result;
            }
            else {
                return node(atomicValue(null));
            }
        }
        case "closureJust": {
            // let pm = patMatch(arg, func.argPat)
            if (pm !== null) {
                let newEnv = { ...func.env, ...pm };
                let result = evalExpr(func.expr, newEnv);
                return node(pairValue(result, node(atomicValue(null))));
            }
            else {
                throw new Error(`pattern match failure at: (${showLoc(loc)}), value: (${showValueFe(arg)})`);
            }
        }
        default:
            assert.noMissingCases(func);
    }
}
export function applyPrimitive(func, arg, loc) {
    let args = [...func.args, arg];
    let [arity, prim, type] = lookupPrimTable(func.name);
    let result;
    if (args.length === arity) {
        result = prim(args);
    }
    else {
        result = node({ ...func, args: args });
    }
    return result;
}
export function patMatch(value, pat) {
    let v = evalNode(value);
    switch (pat.tag) {
        case "ETermBrackets": {
            let pm = patMatch(value, pat.expr);
            return pm;
        }
        case "EAs": {
            let pm = patMatch(value, pat.expr);
            if (pm !== null) {
                let env = { ...pm };
                env[pat.name] = [value, anyT];
                return env;
            }
            else {
                return null;
            }
        }
        case "EList": {
            let v2 = value;
            let env = {};
            for (let p of pat.exprs) {
                let v3 = evalNode(v2);
                if (v3.tag === "pair") {
                    let pm = patMatch(v3.head, p);
                    if (pm !== null) {
                        v2 = v3.tail;
                        env = { ...env, ...pm };
                    }
                    else {
                        return null;
                    }
                }
                else {
                    return null;
                }
            }
            if (pat.tail === null) {
                let v3 = evalNode(v2);
                if (v3.tag === "atomic" && v3.value === null) {
                    return env;
                }
                else {
                    return null;
                }
            }
            else {
                let pm = patMatch(v2, pat.tail);
                if (pm !== null) {
                    return { ...env, ...pm };
                }
                else {
                    return null;
                }
            }
        }
        case "EDatum":
            if (v.tag === "atomic" && v.value === pat.value) {
                return {};
            }
            else {
                return null;
            }
        case "EPair": {
            if (v.tag === "pair") {
                let hd = patMatch(v.head, pat.hd);
                let tl = patMatch(v.tail, pat.tl);
                if (hd !== null && tl !== null) {
                    return { ...hd, ...tl };
                }
                else {
                    return null;
                }
            }
            else {
                return null;
            }
        }
        case "EVar": {
            let env = {};
            env[pat.name] = [value, anyT];
            return env;
        }
        case "EType":
        case "ETypeAs":
            return patMatch(value, pat.expr);
        case "EApply":
        case "ELambda":
        case "ELet":
            throw new Error(`invalid expression in pattern (${pat.tag}) (${showMbLoc(pat)}) `);
        default:
            throw new Error(`missing case ${pat.tag}`);
    }
}
// primEnv is an Env, and so can be referenced by closure values.
// Values are memoized so as to make repeated runs of the type-checker faster.
// So primEnv must be a simple JSON value, with no functions.
// primTable contains the actual implementations of the primitives.
// The actions are looked up only when we have sufficient arguments to fully apply.
let primTable = null;
let primEnv = null;
export function declarePrimitives(prims) {
    // This function is only intended to be called once.
    // However, it can be called a second time when the 
    //   website-server page-reload functionality is active.
    // Pages can contains apps, and apps need the primitives.
    // Ideally there should be a better delineation in what 
    //   is being reloaded/reinitialized and what isn't.
    // For now, just returning early here is sufficient.
    if (primTable !== null && primEnv !== null) {
        return;
    }
    assert.isTrue(primTable === null);
    assert.isTrue(primEnv === null);
    primTable = prims;
    const env = {};
    for (const [name, [arity, action, type]] of Object.entries(prims)) {
        let primNode;
        if (arity === 0) {
            primNode = action([]);
        }
        else {
            let primValue = primValue2(name, arity, []);
            primNode = node(primValue);
        }
        env[name] = [primNode, type];
    }
    // NOTE: Using freeze here has implications for REALIAS_IMMUTABLE_DATA in memoize.ts.
    Object.freeze(env);
    primEnv = env;
}
export function lookupPrimTable(name) {
    assert.isTrue(primTable !== null);
    return primTable[name];
}
export function getPrimEnv() {
    assert.isTrue(primEnv !== null);
    return primEnv;
}
export function lookupPrimEnv(name) {
    assert.isTrue(primEnv !== null);
    if (Object.hasOwn(primEnv, name)) {
        return primEnv[name];
    }
    else {
        return null;
    }
}
export function isPrimName(name) {
    assert.isTrue(primTable !== null);
    return Object.hasOwn(primTable, name);
}
//# sourceMappingURL=eval.js.map