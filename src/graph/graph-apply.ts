import { assert } from "../utils/assert.js"
import { Addr, Addr_of_TmLambda, addrNo, addrTypeType, assumeIsDirect, assumeIsType, Depth, depthInc, depthMax2, depthZero, DirectAddr, false0, Heap, TypeAddr } from "../graph/graph-heap2.js"
import { GraphPredicates } from "../graph/graph-predicates.js"
import { ActionResult } from "./graph-primitives.js"
import { SubstEnv, Substitute } from "./graph-substitute.js"
import { TiStructuralFuncs } from "./graph-ti-structural.js"
import { tiIsTrue } from "../graph/graph-ti.js"

export type GraphApply = {
    apply_funTy_argTy(depth: Depth, funTy: TypeAddr, argTy: TypeAddr): ActionResult
}

export function mkGraphApply(h: Heap, subst: Substitute, predicates: GraphPredicates, tis: TiStructuralFuncs): GraphApply {

    const dOf = h.directAddrOf
    const typeType = addrTypeType

    return {
        apply_funTy_argTy,
    }

    function unrollRecursiveType(aAddr: Addr_of_TmLambda): TypeAddr & DirectAddr {
        const a = dOf(aAddr)
        const depth = h.depthOf(aAddr)
        const varDepth = depthInc(depth)
        const env: SubstEnv = new Map
        const fixA = h.tyPrim1("Fix", a, depth)
        env.set(h.pathKey_root, fixA)
        const aBody = dOf(h.body_tm(a))
        const result = subst.substTmTy(depth, varDepth, env, typeType, aBody)
        assumeIsType(result)
        return result as TypeAddr & DirectAddr
    }

    // We should only ever encounter an "unknown" term within a type,
    //   it shouldn't be available to users.
    function unknownTerm(ty: TypeAddr, depth?: Depth): Addr {
        depth ??= h.depthOf(ty)
        return h.tmOp0("unknown", depth, ty)

    }


    function apply_funTy_argTy(depth: Depth, funTy: TypeAddr, argTy0: TypeAddr): ActionResult {

        const funcTyAddr = funTy
        const argTyAddr = argTy0

        assumeIsDirect(funcTyAddr)
        assumeIsDirect(argTyAddr)

        const func = h.directAddrOf(funcTyAddr)
        // const argTm = addrNo // This is a non-dependent type application.
        const argTy = h.directAddrOf(argTyAddr)
        assumeIsType(argTy)

        if (h.isTyFun(func)) {
            // TODO perform a structural TI-check, only return the cod if the arg can clearly be seen to be contained within the dom.
            // const appTy = funValue.node.cod
            const lamDepth = h.depthOf(func)
            const varDepth = depthInc(lamDepth)
            const depthShift = depth - varDepth
            const domTy = argTy
            // TODO If the domain contains a reference to the var, we need to substitute into the domain.
            // TODO First we need to instantiate the variable sub-type somewhere { <var> <: <domain> }
            // TODO ? or maybe use { <arg> <: <dom> } directly ?
            // const domTy = this.substTy(varDepth, depthShift, arg, funValue.node.dom)
            // const appTy = this.substTy(varDepth, depthShift, domTy, funValue.node.cod)

            const env: SubstEnv = new Map
            // TODO If the codomain contains the functions term-var, then we need to provide a new term-var in the subst-env.
            // TODO This new term-var would need to be bound by a new enclosing Self operator.
            // So
            //     { { { label : Str } -> [(Single label), (Single (strReverse label))] } { Str } }
            // reduces to 
            //     (Self <| (label : Str) -> { [(Single label), (Single (strReverse label))] })
            //   A self-dependent 2-tuple type of strings related in a specific way.



            const cod = h.cod_ty(func)

            // if (predicates.isTmVarUsed(varDepth, cod)) {
            //     // const argDepth = depthInc(depth)
            //     // const argTm = unknownTerm(domTy)
            //     // // Do we need termOf ? or is using "unknown" sufficient ?
            //     // env.set(h.pathKey_root, argTm)
            //     // const result = subst.substTmTy(depth, varDepth, env, domTy, cod)
            //     const result = subst.substTmTy(depth, varDepth, null, domTy, cod)
            //     return result
            // }
            // // env.set(this.h.pathKey_root, new-term-var)
            // const appTy2 = subst.substTmTy(depth, varDepth, env, domTy, cod) as TypeAddr

            const argTm = h.tmOp1("termOf", argTy, depth, argTy)
            env.set(h.pathKey_root, argTm)
            const appTy2 = subst.substTmTy(depth, varDepth, env, domTy, cod) as TypeAddr

            return appTy2
        }

        if (h.isTyAny(func)) {
            // return tyAny
            return h.tyPrim0("Any", depthZero)
        }


        if (h.isPrim("Self", func)) {
            const fun = h.directAddrOf(func)
            // arg = h.directAddrOf(arg)
            assert.isTrue(h.isPrim("Self", fun))
            const self1Lam = h.directAddrOf(h.arg0_ty(fun))
            if (h.isTmLam(self1Lam)) {
                const self1Body = h.directAddrOf(h.body_tm(self1Lam))
                const self1LamDepth = h.depthOf(self1Lam)
                const argDepth = h.depthOf(argTy)
                // const resultDepth = depth // use the expected (max permitted) depth
                const resultDepth = depthMax2(self1LamDepth, argDepth) // or use the least possible (fully-lazy) depth for increased sharing
                const appDepth = depthInc(resultDepth) // the application is to be performed under the new Self2
                const self1VarDepth = depthInc(self1LamDepth)
                const self2VarDepth = depthInc(resultDepth)
                const substTyVar = h.tyVar(self2VarDepth)
                const argToVar = h.tyFun(addrNo, addrNo, argTy, substTyVar, appDepth)
                // const self2Var = h.tmVar([], self2VarDepth, substTyVar)
                // const self2Var = h.tmVar([], self2VarDepth, arg)
                const self2Var = h.tmVar([], self2VarDepth, argToVar)
                const substEnv: SubstEnv = new Map
                substEnv.set(h.pathKey_root, self2Var)
                const self2Fun = subst.substTmTy(appDepth, self1VarDepth, substEnv, argToVar, self1Body) as TypeAddr
                // const applySelfBody = h.tyApply(self2Body, arg)
                // const var2 = h.tmVar([], self2VarDepth, arg)
                // const self2Apply = h.tmApply(self2Fun, self2Var, appDepth)
                // const self2Apply = h.tmApply(self2Fun, arg, appDepth)
                const self2Apply = h.tyApply(self2Fun, argTy, appDepth)
                const self2LamTy = h.tyFun(addrNo, addrNo, typeType, typeType, resultDepth) // TODO ? get the Dom and Cod type right
                const self2Lam = h.tmLam(false0, false0, self2Var, self2Apply, resultDepth, self2LamTy)
                // const result = h.tyOp1("Self", self2Apply)
                const result = h.tyPrim1("Self", self2Lam, depth)
                return result
            }
        }
        if (h.isPrim("Fix", func)) {

            const fun = h.directAddrOf(func)
            assert.isTrue(h.isPrim("Fix", fun))
            const fix1Lam = h.directAddrOf(h.arg0_ty(fun))
            if (h.isTmLam(fix1Lam)) {
                const func2 = unrollRecursiveType(fix1Lam)
                const apply2 = h.tyApply(func2, argTy)
                return apply2
            }
        }

        if (h.isPrim("{<:}", func)) {
            const funSub = h.arg0_ty(func)
            const funSup = h.arg1_ty(func)
            return h.tyOp2("{<:}", h.tyApply(funSub, argTy), h.tyApply(funSup, argTy), depth)
        }
        if (h.isPrim("{:>}", func)) {
            const funSup = h.arg0_ty(func)
            const funSub = h.arg1_ty(func)
            return h.tyOp2("{:>}", h.tyApply(funSup, argTy), h.tyApply(funSub, argTy), depth)
        }
        if (h.isPrim("{|}", func)) {
            const funA = h.arg0_ty(func)
            const funB = h.arg1_ty(func)
            return h.tyOp2("{|}", h.tyApply(funA, argTy), h.tyApply(funB, argTy), depth)
        }
        if (h.isPrim("{&}", func)) {
            const funA = h.directAddrOf(h.arg0_ty(func))
            const funB = h.directAddrOf(h.arg1_ty(func))
            if (h.isTyFun(funA) && h.isTyFun(funB)) {
                const domA = h.directAddrOf(h.dom_ty(funA))
                const domB = h.directAddrOf(h.dom_ty(funB))
                const rcA = tis.tiStructuralRelComp(argTy, domA)
                const rcB = tis.tiStructuralRelComp(argTy, domB)
                if (tiIsTrue(rcB)) {
                    return h.tyApply(funA, argTy)
                }
                if (tiIsTrue(rcA)) {
                    return h.tyApply(funB, argTy)
                }
                return null
            }
        }
        return null
    }

}