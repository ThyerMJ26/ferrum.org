import { assert } from "../utils/assert.js";
import { depthInc, isAddrNo, depthZero, formStrong, formWeak, assumeIsType, isAddrOk, addrFail, depthNo, } from "../graph/graph-heap2.js";
export function mkSubstitute(h) {
    const { directAddrOf, depthOf, typeOf, tyPrim0, isTyPrim, isTyOp, isTyPrimOneOf, isTyPrimOneOf2, isTyVoid, isTyNil, isTyList, isTyAny, name_ty, arg0_ty, arg1_ty, 
    // isTyCon,
    isTySingleStr, value_ty, tyPair, isTyPair, hd_ty, tl_ty, tyFun, isTyFun, no_ty, yes_ty, dom_ty, cod_ty, tyVar, isTyVar, tyApply, isTyApply, fun_ty, arg_ty, tyOp1, tyOp2, 
    // tyCon1, 
    tyUnion, tyIntersect, tyRelComp, tyHead, tyTail, tyDom, tyCod, tmLam, isTmLam, no_tm, yes_tm, pat_tm, body_tm, tmApply, isTmApply, fun_tm, arg_tm, tmDatum, isTmDatum, datum_tm, tmPair, isTmPair, hd_tm, tl_tm, tmVar, isTmVar, path_tm, tmOp1, tmOp2, isTmOp, arg0_tm, arg1_tm, tmAs, isTmAs, var_tm, // pat_tm,
    tmTyAnnot, isTmTyAnnot, term_tm, pathKey_root, pathKey_hd, pathKey_tl, pathKey_next, pathKey_extend, pathKey_path, path_pathKey, mkVisitor, nodeTransformMemoized, nodeGuide, } = h;
    return {
        tryPatMatch,
        substTmTy,
        tryApply,
        strongLambda,
    };
    // TODO ? An unconditional "patMatch" function which works even when the argument is insufficiently evaluated to determine a match.
    // TODO ?   Rather than fail to match a pair, it adds calls to hd/tl around the argument.
    // TODO ? This would be used for lambda/lambda-yes functions.
    // TODO ? And the existing "tryPatMatch" is for the lambda-no/lambda-maybe functions.
    // TODO ? Or we could add a "failWithNo" argument to "tryPatMatch".
    // Returns true/false to indicate success/failure.
    // Returns null to indicate insufficient info, this can occur when reducing open-terms.
    function tryPatMatch(appDepth, varDepth, pat, value, env) {
        // We only copy the nodes at the expectedValueDepth (or deeper if a lambda is encountered),
        // Nodes at shallower depths remain shared.
        const expectedValueDepth = appDepth;
        // Indirections store the history of a node's reductions.
        // Copying without that history increases opportunities for memoization,
        // And makes navigating reductions in the IDE clearer.
        //   (otherwise it looks like each value is being computed from scratch every time it is used).
        value = h.copyWithoutIndirections(value);
        return tpm(pathKey_root, pat, value);
        function tpm(key, pat0, value) {
            const valueTm = directAddrOf(value);
            const pat = directAddrOf(pat0);
            const patDepth = depthOf(pat);
            if (isTmVar(pat)) {
                if (patDepth !== varDepth) {
                    // Check the depth.
                    // TODO Currently there is no syntax to express bound variables within patterns, 
                    // TODO   all variables within patterns are binding-occurences.
                    // TODO So in practice we should only encounter variables at the expected depth here.
                    // TODO However that could change in the future, 
                    // TODO   if the syntax is updated to allow references to already bound variables to be included in patterns.
                    assert.impossible(`tryPatMatch: Variable at unexpected depth (${patDepth} /= ${varDepth})`);
                }
                env.set(key, value);
                return true;
            }
            else if (isTmAs(pat)) {
                const asVar = var_tm(pat);
                const asPat = pat_tm(pat);
                const varOk = tpm(key, asVar, value);
                const patOk = tpm(key, asPat, value);
                if (varOk === true && patOk === true)
                    return true;
                if (varOk === false || patOk === false)
                    return false;
                return null;
            }
            else if (isTmTyAnnot(pat)) {
                const annotTm = term_tm(pat);
                const annotOk = tpm(key, annotTm, value);
                if (annotOk === true)
                    return true;
                if (annotOk === false)
                    return false;
                return null;
            }
            else if (isTmDatum(pat)) {
                if (isTmDatum(valueTm)) {
                    return datum_tm(valueTm) === datum_tm(pat);
                }
                else if (isTmPair(valueTm)) {
                    return false;
                }
                return null;
            }
            else if (isTmPair(pat)) {
                if (isTmPair(valueTm)) {
                    const hdOk = tpm(pathKey_hd(key), hd_tm(pat), hd_tm(valueTm));
                    const tlOk = tpm(pathKey_tl(key), tl_tm(pat), tl_tm(valueTm));
                    if (hdOk === true && tlOk === true)
                        return true;
                    if (hdOk === false || tlOk === false)
                        return false;
                    // This can determine a match failure before the value has been fully evaluated.
                    // Need to make sure we don't change the termination characteristics.
                    // Or do we, termination is the user's responsibility.
                }
                else if (isTmDatum(valueTm)) {
                    return false;
                }
                return null;
            }
            return null;
        }
    }
    function substTmTy(appDepth, varDepth, tmEnv, ty, body0, newTargetForm = formWeak) {
        assert.isTrue(varDepth > 0);
        const memo = new Map;
        const inStack = new Set;
        const visitor = mkVisitor({
            tmVar: (addr) => {
                const addrDepth = depthOf(addr);
                if (addrDepth < varDepth) {
                    return addr;
                }
                if (addrDepth === varDepth) {
                    const path = path_tm(addr);
                    const pathKey = pathKey_path(path);
                    if (tmEnv !== null) {
                        if (tmEnv.has(pathKey)) {
                            return tmEnv.get(pathKey);
                        }
                        // TODO ? Apply hd/tl primitives to the nearest available variable in the environment ?
                        // TODO ?   (nearest, as in, same root lambda-variable with longest prefix of the path, so as to use the fewest additional hd/tl calls)
                        // TODO ? So long as tryPatMatch is always used before substTmTy, then this shouldn't be needed,
                        // TODO ?   but in future it might be desirable to apply non-failable functions (lambda/lambda-yes) to arguments 
                        // TODO ?   before the arguments are sufficiently reducible to match the functions pattern.
                    }
                    else {
                        if (path.length === 0) {
                            const tyDepth = h.depthOf(ty);
                            return h.tmOp1("termOf", ty, tyDepth, ty);
                        }
                    }
                    // The variable wasn't in the env, 
                    //   so build a chain of hd/tl calls from the root var.
                    assert.isTrue(tmEnv !== null && tmEnv.has(pathKey_root));
                    let result = tmEnv.get(pathKey_root);
                    let resultTy = ty;
                    assumeIsType(resultTy);
                    for (const segment of path) {
                        let numTls = Math.abs(segment);
                        let numHds = segment < 0 ? 0 : 1;
                        while (numTls-- !== 0) {
                            resultTy = h.tyTail(resultTy, depthNo);
                            assumeIsType(resultTy);
                            result = h.tmOp1("tl", result, appDepth, resultTy);
                        }
                        while (numHds-- !== 0) {
                            resultTy = h.tyHead(resultTy, depthNo);
                            assumeIsType(resultTy);
                            result = h.tmOp1("hd", result, appDepth, resultTy);
                        }
                    }
                    return result;
                }
                return h.nodeTransformMemoizedTry(memo, transformer, addr);
            },
            tyVar: (addr) => {
                const addrDepth = depthOf(addr);
                if (addrDepth < varDepth) {
                    return addr;
                }
                if (addrDepth === varDepth) {
                    return ty;
                }
                return h.nodeTransformMemoizedTry(memo, transformer, addr);
            },
            tm: (addr) => {
                if (depthOf(addr) < varDepth) {
                    return addr;
                }
                inStack.add(addr);
                const result = h.nodeTransformMemoizedTry(memo, transformer, addr);
                inStack.delete(addr);
                return result;
            },
        });
        const depthShift = appDepth - varDepth;
        function transform(child) {
            const addrChain = h.chainAddrs(child);
            let addrToSubst;
            while ((addrToSubst = addrChain.pop()) !== undefined) {
                if (inStack.has(addrToSubst))
                    continue;
                if (h.depthOf(addrToSubst) < varDepth)
                    return addrToSubst;
                inStack.add(addrToSubst);
                if (inStack.size % 1000 === 0) {
                    console.log(`substTmTy2: stack-size: (${inStack.size})`);
                }
                const result = nodeGuide(visitor, addrToSubst);
                inStack.delete(addrToSubst);
                if (isAddrOk(result))
                    return result;
            }
            return addrFail;
        }
        const transformer = {
            depth: (depth) => {
                if (depth < varDepth) {
                    assert.impossible("?"); // we should leave out-of-scope nodes untouched
                    return depth;
                }
                else {
                    return depthInc(depth, depthShift);
                }
            },
            type: addr => transform(addr),
            targetForm: form => newTargetForm,
            child: addr => transform(addr),
            childMb: addr => isAddrNo(addr) ? addr : transform(addr),
            childTy: addr => transform(addr),
            childTyMb: addr => isAddrNo(addr) ? addr : transform(addr),
        };
        const body = directAddrOf(body0);
        const result = nodeGuide(visitor, body);
        assert.isTrue(isAddrOk(result));
        return result;
    }
    // TODO Distinguish between:
    // TODO   - application temporarily failed, but could succeed in future (when more variables have been substituted), and
    // TODO   - application permanently failed, no further substitutions could possibly make the pat-match match, (and returning "no" is not expected).
    function tryApply(depth, func, arg, newTargetForm) {
        const funcTm = h.directAddrOf(func);
        if (h.isTmLam(funcTm)) {
            const funcDepth = h.depthOf(funcTm);
            const varDepth = depthInc(funcDepth);
            const funcPat = h.pat_tm(funcTm);
            const funcNo = h.no_tm(funcTm);
            const funcYes = h.yes_tm(funcTm);
            const funcBody = h.body_tm(funcTm);
            const envMatch2 = new Map;
            const matchOk2 = tryPatMatch(depth, varDepth, funcPat, arg, envMatch2);
            switch (matchOk2) {
                case false: {
                    if (funcNo) {
                        {
                            const noTm = h.tmDatum(null);
                            return noTm;
                        }
                    }
                    else {
                        // Unexpected pat-match fail (there must be a type-error).
                        // TODO mark-permanent reduction failures as an error
                        return null;
                        // TODO
                        // return false
                    }
                }
                case true: {
                    {
                        let result2 = substTmTy(depth, varDepth, envMatch2, h.typeOf(arg), funcBody, newTargetForm);
                        let result = result2;
                        if (funcYes) {
                            const nilTm = h.tmDatum(null);
                            const yesTy = h.tyPair(h.typeOf(result), h.tyPrim0("Nil", depthZero), depth);
                            result = h.tmPair(result, nilTm, depth, yesTy);
                        }
                        return result;
                    }
                }
                case null: { // too early (insufficient info) to tell if match will succeed or fail
                    return null;
                }
                default:
                    throw new Error("missing case");
            }
        }
        else {
            // else, the function has not yet been reduced to a lambda
            return null;
        }
    }
    // Copy a lambda+body with every node's target form set to "Strong".
    // If the lambda already has a "Strong" target form, them it can be returned as-is.
    function strongLambda(addr) {
        if (h.targetFormOf(addr) === formStrong) {
            // This assumes that if a lambda has a strong target-form then so do all the nodes in its body.
            // This should be true in practice.
            return addr;
        }
        const lamDepth = h.depthOf(addr);
        const body = directAddrOf(h.body_tm(addr));
        const memo = new Map;
        // TODO ? If we encounter a cycle, we should break the cycle by backtracking the last followed indirection.
        // TODO     Similar to how copyWithoutIndirections handles cycles.
        // TODO ? This hasn't been a problem yet though.
        // const inStack = new Set<Addr>
        const visitor = mkVisitor({
            tm: (addr) => {
                if (depthOf(addr) <= lamDepth) {
                    return addr;
                }
                return nodeTransformMemoized(memo, transformer, addr);
            },
        });
        const transformer = {
            depth: depth => depth,
            type: addr => nodeGuide(visitor, h.directAddrOf(addr)),
            targetForm: form => formStrong,
            child: addr => nodeGuide(visitor, h.directAddrOf(addr)),
            childTy: addr => nodeGuide(visitor, h.directAddrOf(addr)),
            childMb: addr => isAddrNo(addr) ? addr : nodeGuide(visitor, h.directAddrOf(addr)),
            childTyMb: addr => isAddrNo(addr) ? addr : nodeGuide(visitor, h.directAddrOf(addr)),
        };
        const lamS = nodeTransformMemoized(memo, transformer, addr);
        return lamS;
    }
}
//# sourceMappingURL=graph-substitute.js.map