import { assert } from "../utils/assert.js";
import { assumeIsDirect, depthInc, depthZero, isAddrNo, isAddrYes } from "../graph/graph-heap2.js";
import { anyT, applyT, boolT, charT, errorT, funT, intT, listT, nilT, pairT, recT, ruleT, selfT, singleT, strT, subT, superT, typeDom, typeHd, typeT, typeTl, unknownT, varT, voidT } from "../tree/types.js";
import { prettyFerrum } from "../syntax/pretty-ferrum.js";
function scopedRefCount(h, rootDepth, rbAssoc, addr) {
    const initCtx = [];
    for (let d = 0; d <= rootDepth; d++) {
        initCtx.push({ depth: rootDepth, addr: null });
    }
    const todo = [[initCtx, addr]];
    const globalRcs = new Map;
    const scopedRcs = new Map([[null, globalRcs]]);
    while (todo.length !== 0) {
        const [ctx0, addr0] = todo.pop();
        if (isAddrNo(addr0)) {
            continue;
        }
        let ctx = [...ctx0];
        const addr = h.directAddrOf(addr0);
        const rb = rbAssoc.get(addr);
        if (rb !== undefined) {
            continue;
        }
        const depth = h.depthOf(addr);
        while (ctx.length !== 0 && ctx.at(-1).depth > depth) {
            ctx.pop();
        }
        if (ctx.length === 0 || ctx.at(-1).depth > depth) {
            throw new Error("bad ctx");
        }
        const ctxAddr = ctx.at(-1).addr;
        const rcs = scopedRcs.get(ctxAddr);
        let rc = rcs?.get(addr) ?? 0;
        rcs?.set(addr, rc + 1);
        let newCtxMb = null;
        if (rc === 0) {
            let childCtx;
            if (h.isTmLam(addr) || h.isTyFun(addr)) {
                const varDepth = depthInc(depth);
                newCtxMb = { depth: varDepth, addr: addr };
                // childCtx = [newCtxMb, ...ctx]
                childCtx = [...ctx, newCtxMb];
                scopedRcs.set(addr, new Map);
            }
            else {
                newCtxMb = null;
                childCtx = ctx;
            }
            const addrs = h.nodeAddrs(addr);
            const more = addrs.map(a => [childCtx, a]);
            todo.push(...more);
        }
    }
    // for (const [addr, rc] of scopedRcs.entries()) {
    //     console.log("ScopedRc", addr, rc.entries())
    // }
    return scopedRcs;
}
function isWorthSharing(h, addr) {
    const arity = h.nodeArity(addr);
    return arity > 0;
}
export function calcAddrsToLetBind(h, rootDepth, rbAssoc, addr) {
    const rcsAs = scopedRefCount(h, rootDepth, rbAssoc, addr);
    const rcsB = new Map;
    const rcsBs = new Map([[null, rcsB]]);
    const initCtx = [];
    for (let d = 0; d <= rootDepth; d++) {
        initCtx.push({ depth: rootDepth, addr: null });
    }
    const todo = [[initCtx, addr]];
    const alb = new Map;
    while (todo.length !== 0) {
        const [ctx0, addr0] = todo.pop();
        if (isAddrNo(addr0)) {
            continue;
        }
        const ctx = [...ctx0];
        const addr = h.directAddrOf(addr0);
        if (h.isTmLam(addr) || h.isTyFun(addr)) {
            rcsBs.set(addr, new Map);
        }
        const rb = rbAssoc.get(addr);
        if (rb !== undefined) {
            continue;
        }
        const depth = h.depthOf(addr);
        while (ctx.length !== 0 && ctx.at(-1).depth > depth) {
            ctx.pop();
        }
        if (ctx.length === 0 || ctx.at(-1).depth > depth) {
            throw new Error("bad ctx");
        }
        const ctxAddr = ctx.at(-1).addr;
        let childCtx;
        if (h.isTmLam(addr) || h.isTyFun(addr)) {
            const varDepth = depthInc(depth);
            let newCtxMb = { depth: varDepth, addr: addr };
            childCtx = [...ctx, newCtxMb];
        }
        else {
            childCtx = [...ctx];
        }
        const rcsA = rcsAs.get(ctxAddr);
        const rcsB = rcsBs.get(ctxAddr);
        if (rcsA === undefined || rcsB === undefined) {
            throw new Error("panic: expected ctxAddr in map");
        }
        const rcA = rcsA.get(addr) ?? 0;
        const rcB = rcsB.get(addr) ?? 0;
        rcsB.set(addr, rcB + 1);
        if (rcA === rcB + 1) {
            const addrs = h.nodeAddrs(addr);
            const more = addrs.map(a => [childCtx, a]);
            // const more: TodoItem[] = parts.addrs.flatMap(a => a === null ? [] : [[childCtx, a]])
            todo.push(...more);
        }
        const ctxDepth = ctx.at(-1).depth;
        if (isWorthSharing(h, addr) && (rcA === rcB + 1) && (rcA > 1 || depth < ctxDepth)) {
            const prevLb = alb.get(ctxAddr);
            // assert.isFalse(ctxAddr === null && h.depthAt(addr) > 0)
            // if (addr === 1858) assert.breakpoint("1858")
            if (prevLb === undefined) {
                alb.set(ctxAddr, [addr]);
            }
            else {
                prevLb.push(addr);
            }
        }
    }
    // for (const [addr, addrs] of alb.entries()) {
    //     console.log("ALB", addr, addrs)
    // }
    return alb;
}
function bracket(tmTyIn, tmTyOut, expr) {
    if (tmTyIn === tmTyOut) {
        return expr;
    }
    if (tmTyIn === "Term") {
        return { tag: "ETermBrackets", expr: expr, addr: expr.addr };
    }
    if (tmTyIn === "Type") {
        return { tag: "ETypeBrackets", expr: expr, addr: expr.addr };
    }
    assert.unreachable();
}
function readbackTmVar(h, annotAddr, addr, env) {
    // TODO Take whatever mapping-annotations we can get from the instantiation phase,
    //        use this to find the variable names used in the original source where possible.
    // TODO Use the names from the rbLamEnv, once it is fully populated.
    const depth = h.depthOf(addr);
    const path = h.path_tm(addr);
    const varName = `v${depth}_${path.map(p => p < 0 ? `${-p}d` : `${p}a`).join("_")}`;
    return { tag: "EVar", name: varName, addr: annotAddr };
}
// NOTE: readbackTyVar reads back type-variables by constructing "(typeOf tmVar)" expressions.
// NOTE: This is because the type-vars are not currently being bound in the read-back function patterns.
// TODO? Always bind type-vars in lambda-patterns ? 
//         This would get noisy and distracting, because they are mostly not needed.
// TODO? Only include the type-vars in the lambda-patterns when needed ? 
//         This makes more sense, it requires checking for type-var occurences.
//         Doing this as-needed would be more expensive than a pre-pass which could avoid revisiting nested lambdas.
function readbackTyVar(h, addrAnnot, addr, env) {
    // NOTE: The varName here matches the name returned by "readbackVarName" for term-vars.
    // TODO: A less fragile way to keep the naming scheme in sync.
    // TODO: Rather than add this cleverness / hackiness here, 
    // TODO:   it would be better to place the variable term and type names in rbLamEnv.
    const depth = h.depthOf(addr);
    const varName = `v${depth}_`;
    const tmVarAddr = h.tmVar([], depth, addr);
    const tmVar = { tag: "EVar", name: varName, addr: tmVarAddr };
    const tyVar = { tag: "EPrim", name: "typeOf", args: [tmVar], addr: addrAnnot };
    return tyVar;
}
export function readbackExpr(h, addr) {
    const rbLetVars = new Map;
    const rbLamVars = new Map;
    const expr = readback(h, rbLetVars, rbLamVars, "Term", addr);
    return expr;
}
// TODO ? Seperate readbackTerm and readbackType functions (within the same class) ?
// TODO ?   readbackTerm returns an ExprTypeBidir
// TODO ?   readbackType returns a Type, suitable for use in annotating the ExprTypeBidir
// TODO Use the RbEnvLam, this is needed when the depth of "addr0" is not 0.
// TODO Take an RbEnvLet also, and use this to prune readback of things we already have names for.
export function readback0(h, rbLetEnv0, rbLamEnv, unreduced, tmTyCtx, addr0) {
    // rbLetEnv is for top-level bindings.
    //   We prune readback when we reach an address with a top-level name.
    const rbLetEnv = rbLetEnv0;
    // rbAssoc is for locally bound names at depth-zero.
    //   A let-expression needs to be built to bind these.
    const rbAssoc = new Map;
    const rootDepth = depthZero;
    // const alb = calcAddrsToLetBind(h, rootDepth, rbAssoc, addr0)
    const alb = calcAddrsToLetBind(h, rootDepth, rbLetEnv, addr0);
    const inStack = new Set;
    function addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, tmTyCtx, addr0) {
        // const addr = heap.directAddrOf(addr0)
        const addr = addr0;
        // TODO Check is worth sharing, 
        // TODO Datums such as nil are picking up whatever name was last bound to them,
        // TODO   which works, but looks a bit odd.
        // const rb = rbAssoc.get(addr)
        // const rb = rbLetEnv.get(addr) 
        // Check the global env first, then any local zeroDepth bindings.
        const rb = rbLetEnv.get(addr) ?? rbAssoc.get(addr);
        if (rb !== undefined) {
            return { tag: "EVar", name: rb, addr };
        }
        // TODO Handle cycles correctly (see copyWithoutIndirections)
        if (inStack.has(addr0)) {
            return { tag: "EDatum", value: `*** CYCLE ${addr} ***`, addr };
        }
        inStack.add(addr0);
        const result = addrToExpr(rbLetEnv, rbLamEnv, rbAssoc, tmTyCtx, addr);
        inStack.delete(addr);
        return result;
    }
    function addrToPat(addr0) {
        const addr = h.directAddrOf(addr0);
        // If/when pattern reduction is implemented, and we wish to readback unreduced or partially-reduced patterns,
        //   then we should call assumeIsDirect, not directAddrOf
        // assumeIsDirect(addr)
        // TODO Stop using nodeTags, use the new nodeGuide/nodeVisitor
        const nodeTag = h.nodeTag(addr);
        const depth = h.depthOf(addr);
        // The address we use to annotate the resulting Expr.
        // const addrAnnot = addr
        const addrAnnot = addr0;
        switch (nodeTag) {
            case "TmDatum": {
                assert.isTrue(h.isTmDatum(addr));
                return bracket("Term", tmTyCtx, { tag: "EDatum", value: h.datum_tm(addr), addr: addrAnnot });
            }
            case "TyVar": {
                assert.isTrue(h.isTyVar(addr));
                return readbackTyVar(h, addrAnnot, addr, rbLamEnv);
            }
            case "TmVar": {
                assert.isTrue(h.isTmVar(addr));
                return readbackTmVar(h, addrAnnot, addr, rbLamEnv);
            }
            case "TmAs": {
                assert.isTrue(h.isTmAs(addr));
                const tmVar = h.directAddrOf(h.var_tm(addr));
                assert.isTrue(h.isTmVar(tmVar));
                const varExpr = readbackTmVar(h, addrAnnot, tmVar, rbLamEnv);
                const varName = varExpr.name;
                const pat = addrToPat(h.pat_tm(addr));
                return { tag: "EAs", name: varName, expr: pat, addr: addrAnnot };
            }
            case "TmPair": {
                assert.isTrue(h.isTmPair(addr));
                const hdExp = addrToPat(h.hd_tm(addr));
                const tlExp = addrToPat(h.tl_tm(addr));
                return { tag: "EPair", hd: hdExp, tl: tlExp, addr: addrAnnot };
            }
            case "TmTyAnnot": {
                assert.isTrue(h.isTmTyAnnot(addr));
                const tmExp = addrToPat(h.term_tm(addr));
                return tmExp;
            }
            case "TmApply":
            case "TmLambda":
            case "TySingleStr":
            case "TyPair":
            case "TyApply":
            case "TyFun":
            case "Prim":
                assert.impossible();
            default:
                assert.noMissingCases(nodeTag);
        }
    }
    function addrToExpr(rbLetEnv, rbLamEnv, rbAssoc, tmTyCtx, addr0) {
        let addr1 = addr0;
        while (h.isUpdated(addr1) && !unreduced.has(addr1)) {
            addr1 = h.updatedTo(addr1);
        }
        const addr = addr1;
        // If we are pretending that "addr" is an unreduced indirection, 
        //   then lets also pretend it's a direct address.
        // ( this pacifies the parts of the HeapIface which help prevent accidental use of indirect addresses )
        assumeIsDirect(addr);
        // TODO Stop using nodeTags, use the new nodeGuide/nodeVisitor
        const nodeTag = h.nodeTag(addr);
        const depth = h.depthOf(addr);
        // The address we use to annotate the resulting Expr.
        // const addrAnnot = addr
        const addrAnnot = addr0;
        switch (nodeTag) {
            case "TmDatum": {
                assert.isTrue(h.isTmDatum(addr));
                const value = h.datum_tm(addr);
                // if (value === "DIGIT")
                //     assert.breakpoint()
                return bracket("Term", tmTyCtx, { tag: "EDatum", value, addr: addrAnnot });
            }
            case "TyVar": {
                // let varName = readbackVarName(h, addr0, rbLamEnv)
                // // TODO ? Construct a sub-type here ? { <var> <: <domain> } ?
                // // TODO ? Or expect that to already be in the env ?
                // return { tag: "EVar", name: varName, addr: addrAnnot }
                assert.isTrue(h.isTyVar(addr));
                return readbackTyVar(h, addrAnnot, addr, rbLamEnv);
            }
            case "TmVar": {
                assert.isTrue(h.isTmVar(addr));
                return readbackTmVar(h, addrAnnot, addr, rbLamEnv);
            }
            case "TmAs": {
                assert.isTrue(h.isTmAs(addr));
                // Currently the "var_tm" field of a tmAs will always be a direct reference to a actual tmVar.
                // In future, when pattern-reduction is implemented, some things will change:
                //   This call to directAddrOf will no longer be redundant.
                //   This call to directAddrOf will still (I think) always return an actual tmVar, assuming pattern-reduction goes as planned.
                const tmVar = h.directAddrOf(h.var_tm(addr));
                assert.isTrue(h.isTmVar(tmVar));
                const varExpr = readbackTmVar(h, addrAnnot, tmVar, rbLamEnv);
                const varName = varExpr.name;
                const pat = addrToExpr(rbLetEnv, rbLamEnv, rbAssoc, tmTyCtx, h.pat_tm(addr));
                return { tag: "EAs", name: varName, expr: pat, addr: addrAnnot };
            }
            case "TmLambda": {
                assert.isTrue(h.isTmLam(addr));
                const letBindings = alb.get(addr);
                assert.isTrue(h.isTmLam(addr));
                const no = h.no_tm(addr);
                const yes = h.yes_tm(addr);
                const lambdaTag = yes ? no ? "ELambdaMaybe" : "ELambdaYes" : no ? "ELambdaNo" : "ELambda";
                const varDepth = depthInc(depth);
                if (letBindings === undefined) {
                    const patExpr = addrToPat(h.pat_tm(addr));
                    const bodyExpr = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Term", h.body_tm(addr));
                    return bracket("Term", tmTyCtx, { tag: lambdaTag, pat: patExpr, body: bodyExpr, addr: addrAnnot });
                }
                const henv = new Map();
                const rbLetEnv2 = new Map(rbLetEnv);
                letBindings.slice().reverse().forEach((lb, idx) => {
                    const letVarName = `v${varDepth}_${idx + 1}`;
                    henv.set(lb, letVarName);
                    rbLetEnv2.set(lb, letVarName);
                });
                const decls = [...henv].map(([addr, name]) => {
                    const expr = addrToExpr(rbLetEnv2, rbLamEnv, rbAssoc, tmTyCtx, addr);
                    const decl = [{ tag: "EVar", name: name, addr: addrAnnot }, expr];
                    return decl;
                });
                const patExpr = addrToPat(h.pat_tm(addr));
                const bodyExp = addrToExprOrName(rbLetEnv2, rbLamEnv, rbAssoc, "Term", h.body_tm(addr));
                return bracket("Term", tmTyCtx, { tag: lambdaTag, pat: patExpr, body: { tag: "ELet", decls: decls, expr: bodyExp, addr: h.body_tm(addr) }, addr: addrAnnot });
            }
            case "TmApply": {
                assert.isTrue(h.isTmApply(addr));
                const funcExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Term", h.fun_tm(addr));
                const argExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Term", h.arg_tm(addr));
                return bracket("Term", tmTyCtx, { tag: "EApply", func: funcExp, arg: argExp, op: "", addr: addrAnnot });
            }
            case "TmPair": {
                assert.isTrue(h.isTmPair(addr));
                // TODO ? Traverse the tail and read back as an EList.
                // TODO ? Although, using a single EList instead or nested EPairs,
                // TODO ?   means fewer/insufficient Exprs to place Addrs on.
                // TODO ? It is probably best to leave conversion from nested EPairs to an EList to the caller.
                const hdExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Term", h.hd_tm(addr));
                const tlExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Term", h.tl_tm(addr));
                return bracket("Term", tmTyCtx, { tag: "EPair", hd: hdExp, tl: tlExp, addr: addrAnnot });
            }
            case "TmTyAnnot": {
                assert.isTrue(h.isTmTyAnnot(addr));
                const tmExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Term", h.term_tm(addr));
                const tyExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Term", h.typeOf(addr));
                return bracket("Term", tmTyCtx, { tag: "EType", expr: tmExp, type: tyExp, addr: addrAnnot });
            }
            case "TySingleStr": {
                assert.isTrue(h.isTySingleStr(addr));
                return bracket("Type", tmTyCtx, { tag: "EDatum", value: h.value_ty(addr), addr: addrAnnot });
            }
            case "Prim": {
                assert.isTrue(h.isPrim(null, addr));
                const args = [];
                const numArgs = h.nodeArity(addr);
                for (let i = 0; i !== numArgs; i++) {
                    const a = h.nodeChild(addr, i);
                    assert.isTrue(isAddrYes(a));
                    args.push(addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Term", a));
                }
                // TODO Stop conflating operators and primitives.
                return bracket("Term", tmTyCtx, { tag: "EPrim", name: h.name_of(addr), args, addr: addrAnnot });
            }
            case "TyFun": {
                assert.isTrue(h.isTyFun(addr));
                // TODO Need to insert an "EAs" Expr if any reference is made to the domain type.
                const tyFunDepth = h.depthOf(addr);
                const tyVarDepth = depthInc(tyFunDepth);
                const tmVarName = `v${tyVarDepth}_${addr}`;
                const tyVarName = `V${tyVarDepth}_${addr}`;
                const rbLamEnv2 = new Map(rbLamEnv);
                rbLamEnv2.set(tyVarDepth, [tmVarName, tyVarName]);
                let domExpr = addrToExprOrName(rbLetEnv, rbLamEnv2, rbAssoc, "Type", h.dom_ty(addr));
                const codExpr = addrToExprOrName(rbLetEnv, rbLamEnv2, rbAssoc, "Type", h.cod_ty(addr));
                assert.isTrue(h.isTyFun(addr));
                const dom = h.dom_ty(addr);
                const cod = h.cod_ty(addr);
                const domDepth = h.depthOf(dom);
                const codDepth = h.depthOf(cod);
                if (domDepth === tyVarDepth || codDepth === tyVarDepth) {
                    const varName = `V${tyVarDepth}_${addr}`;
                    domExpr = { tag: "EAs", name: varName, expr: domExpr, addr: addrAnnot };
                }
                return bracket("Type", tmTyCtx, { tag: "ELambda", pat: domExpr, body: codExpr, addr: addrAnnot });
            }
            case "TyPair": {
                assert.isTrue(h.isTyPair(addr));
                // TODO ? Traverse the tail and read back as an EList ?
                // TODO ? ( See comments on TmPair )
                const hdExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Type", h.hd_ty(addr));
                const tlExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Type", h.tl_ty(addr));
                return bracket("Type", tmTyCtx, { tag: "EPair", hd: hdExp, tl: tlExp, addr: addrAnnot });
            }
            case "TyApply": {
                assert.isTrue(h.isTyApply(addr));
                const funcExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Type", h.fun_ty(addr));
                const argExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Type", h.arg_ty(addr));
                return bracket("Type", tmTyCtx, { tag: "EApply", func: funcExp, arg: argExp, op: "", addr: addrAnnot });
            }
            default:
                assert.noMissingCases(nodeTag);
        }
    }
    // const addr = h.directAddrOf(addr0)
    const addr = addr0;
    assumeIsDirect(addr);
    // assert.isTrue(h.depthAt(addr) === 0)
    const letBindings = alb.get(null);
    // const letBindings = alb.get(addr)
    if (letBindings === undefined) {
        const expr = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, "Term", addr);
        return bracket("Term", tmTyCtx, expr);
    }
    const decls = [];
    letBindings.forEach((lb, idx) => {
        const letVarName = `v${rootDepth}_${idx + 1}`;
        const expr = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, tmTyCtx, lb);
        const decl = [{ tag: "EVar", name: letVarName, addr: lb }, expr];
        decls.push(decl);
        // We can't add this here, these inner let-bindings won't be visible at the top-level.
        // rbLetEnv.set(lb, letVarName)
        rbAssoc.set(lb, letVarName);
    });
    const bodyExp = addrToExprOrName(rbLetEnv, rbLamEnv, rbAssoc, tmTyCtx, addr);
    return bracket("Term", tmTyCtx, { tag: "ELet", decls: decls, expr: bodyExp, addr });
}
export function readback(h, rbLetEnv, rbLamEnv, tmTyCtx, addr0) {
    return readback0(h, rbLetEnv, rbLamEnv, new Set, tmTyCtx, addr0);
}
export function readbackData(h, addr0) {
    const rbData = (addr) => readbackData(h, addr);
    const addr = h.directAddrOf(addr0);
    if (h.isTmDatum(addr)) {
        return { tag: "EDatum", value: h.datum_tm(addr) };
    }
    if (h.isTmPair(addr)) {
        return { tag: "EPair", hd: rbData(h.hd_tm(addr)), tl: rbData(h.tl_tm(addr)) };
    }
    if (h.isTmTyAnnot(addr)) {
        return rbData(h.term_tm(addr));
    }
    return { tag: "EDatum", value: `#${h.showNode(addr)}#` };
}
const ruleNameTranslation = {
    "Dom": "domainT",
    "Cod": "rangeT",
    "Hd": "hdT",
    "Tl": "tlT",
    "{|}": "unionT",
    "{&}": "intersectT",
    "{\\}": "relcompT",
    "primitive": "primitiveT"
    // "<:": "subT"
    // "List": "listT",
};
export function readbackTypeOrNull(h, letEnv, lamEnv, addr) {
    try {
        return readbackType(h, letEnv, lamEnv, addr);
    }
    catch (exc) {
        return null;
    }
}
// TODO ? This only exists/existed as a bridge to help develop graph-types alongside tree-types.
// TODO ? It should be thrown away sometime soon.
export function readbackType(h, letEnv, lamEnv, addr0) {
    const rb = (addr) => readbackType(h, letEnv, lamEnv, addr);
    const addr = h.directAddrOf(addr0);
    const depth = h.depthOf(addr);
    const nodeTag = h.nodeTag(addr);
    switch (nodeTag) {
        case "TmVar":
            assert.isTrue(h.isTmVar(addr));
            const tmTyVars = lamEnv.get(depth);
            if (tmTyVars === undefined) {
                return varT(`Unknown_TmVar_At_Depth_${depth}`);
            }
            else {
                const [tmVar, tyVar] = tmTyVars;
                const path = h.path_tm(addr);
                if (path.length !== 0) {
                    return varT(`TmVar_${depth}_PATH_${path.map(p => `${p}`).join("_")}`);
                }
                return varT(tmVar);
            }
        case "TmApply":
        case "TmLambda":
        case "TmDatum":
        case "TmPair":
        case "TmAs": {
            // The old tree-type code doesn't support arbitrary expressions within types,
            //   but in order to return something informative and not crash,
            //   this shoves a string into a variable.
            // const expr = readback(heap, new Map, "Term", addr)
            const expr = readback(h, letEnv, lamEnv, "Term", addr);
            // const exprStr = showExpConcise(expr)
            const exprStr = prettyFerrum(expr);
            // return varT(`***EXPR_${exprStr}_***`)
            return varT(`( ${exprStr} )`);
        }
        case "TmTyAnnot":
            assert.todo("Do we ever get here?");
        case "TyVar": {
            const varName = lamEnv.get(depth);
            if (varName === undefined) {
                // return varT(`V_${value.depth}`)
                return varT(`Unknown_TyVar_At_Depth_${depth}`);
                // throw new Error(`No variable name for depth (${value.depth})`)
            }
            return varT(varName[1]);
        }
        case "TySingleStr":
            assert.isTrue(h.isTySingleStr(addr));
            const value = h.value_ty(addr);
            if (value === null) {
                return nilT;
            }
            switch (typeof value) {
                case "string":
                    return singleT(value);
                case "number":
                    return intT;
                case "boolean":
                    return boolT;
                default:
                    throw new Error(`missing case`);
            }
        case "TyPair":
            assert.isTrue(h.isTyPair(addr));
            return pairT(rb(h.hd_ty(addr)), rb(h.tl_ty(addr)));
        case "TyApply":
            assert.isTrue(h.isTyApply(addr));
            return applyT(rb(h.fun_ty(addr)), rb(h.arg_ty(addr)));
        case "TyFun": {
            assert.isTrue(h.isTyFun(addr));
            const varDepth = depthInc(depth);
            const lamEnv2 = new Map(lamEnv);
            const tmVar = `v${varDepth}_${addr}`;
            const tyVar = `V${varDepth}_${addr}`;
            const varName = [tmVar, tyVar];
            lamEnv2.set(varDepth, varName);
            const domTy = readbackType(h, letEnv, lamEnv2, h.dom_ty(addr));
            const codTy = readbackType(h, letEnv, lamEnv2, h.cod_ty(addr));
            // TODO ? Only use the polymorphic funPT if the type-variable is actually used.
            // return funPT(varName[1], domTy, codTy)
            return funT(domTy, codTy);
        }
        case "Prim": {
            switch (h.nodeArity(addr)) {
                case 0:
                    assert.isTrue(h.isTyPrim(null, addr));
                    const name = h.name_ty(addr);
                    switch (name) {
                        case "Any":
                            return anyT;
                        case "Type":
                            return typeT;
                        case "Str":
                            return strT;
                        case "Char":
                            return charT;
                        case "Int":
                            return intT;
                        case "Bool":
                            return boolT;
                        case "Nil":
                            return nilT;
                        case "Void":
                            return voidT;
                        case "Unknown":
                            return unknownT;
                        case "Error":
                            return errorT;
                        default:
                            // return varT(`( Unknown type primitive (${name}) )`)
                            throw new Error(`Unknown type primitive (${name})`);
                    }
                    break;
                case 1: {
                    assert.isTrue(h.isTyPrim1(addr));
                    const arity = h.nodeArity(addr);
                    const name = h.name_ty(addr);
                    switch (name) {
                        case "List":
                            assert.isTrue(h.isTyPrim("List", addr));
                            return listT(rb(h.arg0_ty(addr)));
                        case "Elem":
                            assert.isTrue(h.isTyPrim("Elem", addr));
                            return ruleT("elemT", [rb(h.arg0_ty(addr))]);
                        case "Dom":
                            assert.isTrue(h.isTyPrim("Dom", addr));
                            return typeDom(rb(h.arg0_ty(addr)));
                        case "Hd":
                            assert.isTrue(h.isTyPrim("Hd", addr));
                            return typeHd(rb(h.arg0_ty(addr)));
                        case "Tl":
                            assert.isTrue(h.isTyPrim("Tl", addr));
                            return typeTl(rb(h.arg0_ty(addr)));
                        case "Single": {
                            assert.isTrue(h.isTyPrim("Single", addr));
                            const valueExpr = readbackData(h, h.arg0_ty(addr));
                            switch (valueExpr.tag) {
                                case "EDatum":
                                    return singleT(valueExpr.value);
                                default:
                                    assert.todo(`compute single value`);
                            }
                        }
                        case "Self": {
                            assert.isTrue(h.isTyPrim("Self", addr));
                            const lamAddr = h.directAddrOf(h.arg0_ty(addr));
                            const lamDepth = h.depthOf(lamAddr);
                            const varDepth = depthInc(lamDepth);
                            if (h.isTmLam(lamAddr)) {
                                const lamEnv2 = new Map(lamEnv);
                                const selfVarName = [`v${varDepth}_${lamAddr}`, `V${varDepth}_${lamAddr}`];
                                lamEnv2.set(varDepth, selfVarName);
                                const body = readbackType(h, letEnv, lamEnv2, h.body_tm(lamAddr));
                                return selfT(selfVarName[0], body);
                            }
                            else {
                                // So long as the argument to "Self" has been reduced,
                                //   this is not possible with any of the code currently accepted by the tree-type type-checker.
                                // None of the types currently in use can be blocked on term-level variables,
                                //   so the arg must reduce to a lambda.
                                // (this could change in the future, but not while this readbackType function is still in use)
                                assert.impossible("?");
                            }
                        }
                        case "Fix": {
                            assert.isTrue(h.isTyPrim("Fix", addr));
                            const lamAddr = h.directAddrOf(h.arg0_ty(addr));
                            const lamDepth = h.depthOf(lamAddr);
                            const varDepth = depthInc(lamDepth);
                            if (h.isTmLam(lamAddr)) {
                                const lamEnv2 = new Map(lamEnv);
                                const selfVarName = [`v${varDepth}_${lamAddr}`, `V${varDepth}_${lamAddr}`];
                                lamEnv2.set(varDepth, selfVarName);
                                const body = readbackType(h, letEnv, lamEnv2, h.body_tm(lamAddr));
                                return recT(selfVarName[0], body);
                            }
                            else {
                                // So long as the argument to "Fix" has been reduced,
                                //   this is not possible with any of the code currently accepted by the tree-type type-checker.
                                // None of the types currently in use can be blocked on term-level variables,
                                //   so the arg must reduce to a lambda.
                                // (this could change in the future, but not while this readbackType function is still in use)
                                assert.impossible("?");
                            }
                        }
                        default: {
                            const ruleName = ruleNameTranslation[name];
                            if (ruleName === undefined) {
                                // return varT("*** `Unknown ruleName: (${node.name}) ***")
                                throw new Error(`Unknown ruleName: (${name})`);
                            }
                            return ruleT(ruleName, [rb(h.arg0_ty(addr))]);
                        }
                    }
                }
                case 2: {
                    assert.isTrue(h.isTyOp2(addr));
                    const name = h.name_ty(addr);
                    switch (name) {
                        case "{<:}":
                            assert.isTrue(h.isTyOp("{<:}", addr));
                            return subT(rb(h.arg0_ty(addr)), rb(h.arg1_ty(addr)));
                        case "{:>}":
                            assert.isTrue(h.isTyOp("{:>}", addr));
                            return superT(rb(h.arg0_ty(addr)), rb(h.arg1_ty(addr)));
                        default: {
                            const ruleName = ruleNameTranslation[name];
                            if (ruleName === undefined) {
                                // throw new Error(`Unknown ruleName: (${name})`)
                                assert.isTrue(h.isTyPrim2(addr));
                                const func = varT(name);
                                const arg0 = rb(h.arg0_ty(addr));
                                const arg1 = rb(h.arg1_ty(addr));
                                return applyT(applyT(func, arg0), arg1);
                            }
                            return ruleT(ruleName, [rb(h.arg0_ty(addr)), rb(h.arg1_ty(addr))]);
                        }
                    }
                }
                case 3: {
                    assert.isTrue(h.isTyPrim3(addr));
                    const name = h.name_ty(addr);
                    const func = varT(name);
                    const arg0 = rb(h.arg0_ty(addr));
                    const arg1 = rb(h.arg1_ty(addr));
                    const arg2 = rb(h.arg2_ty(addr));
                    return applyT(applyT(applyT(func, arg0), arg1), arg2);
                }
                default:
                    assert.unreachable("No primitive takes this many args.");
            }
        }
        default:
            assert.noMissingCases(nodeTag);
    }
}
//# sourceMappingURL=graph-readback.js.map