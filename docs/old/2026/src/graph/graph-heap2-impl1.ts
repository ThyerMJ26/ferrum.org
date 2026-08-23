//#region Imports

import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"
import { equalObjects } from "../utils/equal-objects.js"


import {
    Datum,
    Addr, DirectAddr, Depth, depthZero, AddrMb, TypeAddr,
    Addr_of_TmApply, Addr_of_TmAs, Addr_of_TmDatum, Addr_of_TmLambda, Addr_of_TmOp,
    Addr_of_TmOp0, Addr_of_TmOp1, Addr_of_TmOp2, Addr_of_TmPair, Addr_of_TmVar, Addr_of_TyApply,
    Addr_of_TyCon, Addr_of_TyFun, Addr_of_TyOp, Addr_of_TyOp0,
    Addr_of_TyOp1, Addr_of_TyOp2, Addr_of_TyPair, Addr_of_TySingleStr, Addr_of_TyVar, Bool,
    DepthMb, Heap, Path, PathKey, PathSegment, TypeAddrMb,
    Visitor, NodeTransformer,
    isAddrNo, isAddrYes, addrNo, depthNo, AddrNo, Addr_of_TyPrim, VisitorWithDefaults,
    TyPrim0, TyPrim2TyTy, TyOp,
    TyOp1, TyOp2,
    TmOp2, TmOp1, TmOp,
    AddrIndirect,
    Form,
    TargetForm,
    Addr_of_TmTyAnnot,
    NodeWalker,
    NodeTransformerWithDefaults,
    Addr_of_HoleTmp,
    Addr_of_HoleBlack,
    Addr_of_TmPrim,
    Addr_of_TyPrim3,
    Addr_of_TyPrim2,
    Addr_of_TyPrim1,
    TyPrim1Tm,
    TyPrim1Ty,
    TyPrim2TyTm,
    Addr_of_TyPrim1Tm,
    Addr_of_TyPrim1Ty,
    Addr_of_TyPrim2TyTm,
    Addr_of_TyPrim0,
    TyPrim1,
    TyPrim2,
    TyPrim,
    TyPrim3,
    TmPrim,
    Addr_of_TmPrim0,
    Addr_of_TmPrim1,
    Addr_of_TmPrim2,
    Addr_of_TmPrim3,
    ReducedForm,
    formNone,
    formWeak,
    Prim,
    AddrQ,
    Addr_of_Prim,
    depthMax,
    TypeAddrTry,
    AddrTry,
    NodeTransformerTry,
    NodeTransformerTryWithDefaults,
    isAddrFail,
    addrFail,
    NodeTag,
    addrTypeType,
    isAddrOk,
    assumeIsDirect,
    TypeAddrMbTry,
    AddrMbTry,
} from "../graph/graph-heap2.js"


//#endregion



//#region Interface

// Array of Union of Structs
export function mkHeap_AoUoS(): Heap {

    type AddrMemo = {
        addr: AddrMb
        next: Map<Datum, AddrMemo> | null
    }
    const heap_addrMemo: AddrMemo = { addr: addrNo, next: null }

    const contents: Entry[] = []


    const typeOfType = heap_allocType(depthZero, { tag: "Prim", cons: false, name: "Type", args: [] }, addrTypeType, formWeak)
    assert.isTrue(typeOfType === addrTypeType)


    class PathObj {
        key: PathKey
        parent: PathObj | null
        segment: PathSegment
        hd: PathObj | null = null
        tl: PathObj | null = null
        constructor(parent: PathObj | null, segment: PathSegment, key: PathKey) {
            this.parent = parent
            this.segment = segment
            this.key = key
        }
    }

    const pathMap: Map<PathKey, PathObj> = new Map
    const pathKey_root = 0 as PathKey
    pathMap.set(pathKey_root, new PathObj(null, 0, pathKey_root))


    const h: Heap = {
        directAddrOf,
        indirectAddrsOf,
        update, isUpdated, updatedTo,
        depthOf,
        typeOf,
        formOf, targetFormOf,

        depthAt, typeAt, formAt,

        setForm,

        copyWithoutIndirections,

        prim, isPrim, name_of, cons_of, arg0_of, arg1_of, arg2_of, argN_of,


        tyPrim0, tyPrim1, tyPrim2, tyPrim3,
        isTyPrim, isTyPrim0, isTyPrim1, isTyPrim2, isTyPrim3,
        isTyOp, isTyOp1, isTyOp2,
        isTyPrimOneOf, isTyPrimOneOf2, isTyVoid, isTyNil, isTyList, isTyAny,
        name_ty, cons_ty, arg0_ty, arg1_ty, arg2_ty,

        tySingleStr, isTySingleStr, value_ty,

        tyPair, isTyPair, hd_ty, tl_ty,

        isReducedToType,
        nodeTagAttrsEqual, nodeTag, nodeArity, nodeChild,
        tyFun, isTyFun, no_ty, yes_ty, dom_ty, cod_ty,
        tyVar, isTyVar,

        tyApply, isTyApply, fun_ty, arg_ty,
        funTy_of, argTy_of,


        tyOp1, tyOp2,
        tyCon1, tyCon2,
        tyUnion,
        tyIntersect, tyRelComp, tyHead, tyTail, tyElem,
        tyDom, tyCod,

        tmLam, isTmLam, no_tm, yes_tm, pat_tm, body_tm,
        tmApply, isTmApply, fun_tm, arg_tm,
        tmDatum, isTmDatum, datum_tm,
        tmPair, isTmPair, hd_tm, tl_tm,
        tmVar, isTmVar, path_tm,
        tmPrim, isTmPrim,
        tmOp0, tmOp1, tmOp2,
        isTmOp, isTmOp1, isTmOp2,
        name_tm, arg0_tm, arg1_tm, arg2_tm,
        isTmPrim0, isTmPrim1, isTmPrim2, isTmPrim3,
        tmAs, isTmAs, var_tm, // pat_tm,

        tmTyAnnot, isTmTyAnnot, term_tm,


        pathKey_root,
        pathKey_hd, pathKey_tl,
        pathKey_next,
        pathKey_extend,
        pathKey_path,
        path_pathKey,

        mkVisitor, nodeGuide, nodeWalk, nodeWalkOnce,
        mkNodeTransformer, nodeTransform, nodeTransformMemoized,
        mkNodeTransformerTry, nodeTransformTry, nodeTransformMemoizedTry,


        showNode, showEntry, nodeAddrs,
        showForm_addr,
        allAddrs,
        chainAddrs,
        heapSize,
    }

    return h

    function showNode(addr: Addr): string {
        const entry = heap_get(addr)
        const value = entry.value!
        const node = value?.node ?? null

        const nodeStr = JSON.stringify(node)
        return nodeStr
    }
    function showEntry(addr: Addr): string {
        const entry = heap_get(addr)
        const value = entry.value!
        const node = value?.node ?? null

        const indirect = entry.indirect
        const depth = value.depth
        const type = value.ty
        const target = value.targetForm
        const form = value.form

        const nodeStr = JSON.stringify([indirect, depth, type, target, form, node])
        return nodeStr
    }
    function showForm_addr(addr: Addr) {
        const form = heap_get(addr).value!.form
        switch (form) {
            case "None": return "."
            case "Weak": return "W"
            case "Strong": return "S"
            case "Error": return "E"
            default:
                assert.noMissingCases(form)
        }
    }

    function nodeAddrs(addr: Addr): AddrMb[] {
        const node = heap_get(addr).value?.node
        if (node === undefined) {
            return []
        }
        const parts = nodeParts(node)
        return parts.addrs.map(a => a === null ? addrNo : a)
    }
    function allAddrs(): Addr[] {
        return Array.from({ length: heapSize() }, (_, i) => i as Addr)
    }
    function heapSize(): number {
        return nextAddr()
    }
    function nextAddr(): Addr {
        return contents.length as Addr
    }

    function chainAddrs(addr: Addr): Addr[] {
        const addrs: Addr[] = [addr]
        // Follow and collect the chain of indirections, if there are any.
        while (isUpdated(addr)) {
            addr = updatedTo(addr)
            addrs.push(addr)
        }
        return addrs
    }

    function visit<T>(visitor: Visitor<T>, addr: Addr): T {
        const v = visitor
        const value = heap_get(addr).value!
        const node = value.node
        switch (node.tag) {
            case "TmDatum":     /**/ return v.tmDatum     /**/(addr as Addr_of_TmDatum);
            case "TmPair":      /**/ return v.tmPair      /**/(addr as Addr_of_TmPair);
            case "TmApply":     /**/ return v.tmApply     /**/(addr as Addr_of_TmApply);
            case "TmLambda":    /**/ return v.tmLambda    /**/(addr as Addr_of_TmLambda);
            case "TmVar":       /**/ return v.tmVar       /**/(addr as Addr_of_TmVar);
            case "TmAs":        /**/ return v.tmAs        /**/(addr as Addr_of_TmAs);
            case "TmTyAnnot":   /**/ return v.tmTyAnnot   /**/(addr as Addr_of_TmTyAnnot);

            case "TySingleStr": /**/ return v.tySingleStr /**/(addr as Addr_of_TySingleStr);
            case "TyPair":      /**/ return v.tyPair      /**/(addr as Addr_of_TyPair);
            case "TyApply":     /**/ return v.tyApply     /**/(addr as Addr_of_TyApply);
            case "TyFun":       /**/ return v.tyFun       /**/(addr as Addr_of_TyFun);
            case "TyVar":       /**/ return v.tyVar       /**/(addr as Addr_of_TyVar);

            case "Prim":        /**/ return v.prim        /**/(addr as Addr_of_Prim);

            default:
                assert.noMissingCases(node)
        }
    }

    function nodeGuide<T>(visitor: Visitor<T>, addr: Addr): T {
        return visit(visitor, addr)
    }

    // function nodeGuideChildren<T>(visitor: Visitor<T>, addr: Addr): void {
    //     const children = nodeAddrs(addr)
    //     for (const child of children) {
    //         if (isAddrYes(child)) {
    //             nodeGuide(visitor, child)
    //         }
    //     }
    // }

    function nodeWalk(walker: NodeWalker, addr: Addr): unit {
        const node = heap_get(addr).value!.node
        const parts = nodeParts(node)
        for (const child of parts.addrs) {
            if (child !== null) {
                walker.child(child)
            }
        }
    }

    function nodeWalkOnce(done: Set<Addr>, walker: NodeWalker, addr: Addr): unit {
        const node = heap_get(addr).value!.node
        const parts = nodeParts(node)
        for (const child of parts.addrs) {
            if (child === null) continue
            if (done.has(child)) continue
            done.add(child)
            walker.child(child)
        }
    }


    function mkVisitor<T>(visitor: VisitorWithDefaults<T>): Visitor<T> {
        const v = visitor
        return {
            tmApply:     /**/ v.tmApply     /**/                          /**/ ?? v.tm,
            tmAs:        /**/ v.tmAs        /**/                          /**/ ?? v.tm,
            tmDatum:     /**/ v.tmDatum     /**/                          /**/ ?? v.tm,
            tmLambda:    /**/ v.tmLambda    /**/                          /**/ ?? v.tm,
            tmPair:      /**/ v.tmPair      /**/                          /**/ ?? v.tm,
            tmVar:       /**/ v.tmVar       /**/                          /**/ ?? v.tm,
            tmTyAnnot:   /**/ v.tmTyAnnot   /**/                          /**/ ?? v.tm,
            tyApply:     /**/ v.tyApply     /**/             /**/ ?? v.ty /**/ ?? v.tm,
            tyFun:       /**/ v.tyFun       /**/             /**/ ?? v.ty /**/ ?? v.tm,
            tyPair:      /**/ v.tyPair      /**/             /**/ ?? v.ty /**/ ?? v.tm,
            tySingleStr: /**/ v.tySingleStr /**/             /**/ ?? v.ty /**/ ?? v.tm,
            tyVar:       /**/ v.tyVar       /**/             /**/ ?? v.ty /**/ ?? v.tm,

            prim:        /**/ v.prim        /**/                          /**/ ?? v.tm,

        }
    }

    function mkNodeTransformer<T>(transformer: NodeTransformerWithDefaults): NodeTransformer {
        const t = transformer
        const t2: NodeTransformer = {
            depth: t.depth ?? (depth => depth),
            type: t.type ?? (type => type),
            targetForm: t.targetForm ?? (form => form),
            child: t.child ?? (child => child),
            childMb: t.childMb ?? (child => isAddrNo(child) ? addrNo : t2.child(child)),
            childTy: t.childTy ?? (child => t2.child(child) as TypeAddr),
            childTyMb: t.childTyMb ?? (child => isAddrNo(child) ? addrNo : t2.childTy(child)),
        }
        return t2
    }


    function nodeTransform(transformer: NodeTransformer, addr: TypeAddr): TypeAddr
    function nodeTransform(transformer: NodeTransformer, addr: Addr): Addr
    function nodeTransform(transformer: NodeTransformer, addr: Addr): Addr {
        const tr = transformer
        const value = heap_deref(addr)
        const ty = typeOf(addr)
        const depth = depthOf(addr)
        const targetForm = targetFormOf(addr)
        const node = value.node
        const tag = node.tag
        let node2: Node
        switch (tag) {
            case "TmDatum":
                node2 = { tag, value: node.value }
                break
            case "TmPair":
                node2 = { tag, hd: tr.child(node.hd), tl: tr.child(node.tl) }
                break
            case "TmApply":
                node2 = { tag, func: tr.child(node.func), arg: tr.child(node.arg) }
                break
            case "TmLambda":
                node2 = { tag, no: node.no, yes: node.yes, pat: tr.child(node.pat), body: tr.child(node.body) }
                break
            case "TmVar":
                node2 = { tag, path: node.path }
                break
            case "TmAs":
                node2 = { tag, var: tr.child(node.var), pat: tr.child(node.pat) }
                break
            case "TmTyAnnot":
                node2 = { tag, term: tr.child(node.term) }
                break
            case "TySingleStr":
                node2 = { tag, value: node.value }
                break
            case "TyPair":
                node2 = { tag, hd: tr.childTy(node.hd), tl: tr.childTy(node.tl) }
                break
            case "TyApply":
                node2 = { tag, func: tr.childTy(node.func), arg: tr.childTy(node.arg) }
                break
            case "TyFun":
                const no = translateTypeAddrMb(tr.childTyMb(translateTypeAddrMb(node.no)))
                const yes = translateTypeAddrMb(tr.childTyMb(translateTypeAddrMb(node.yes)))
                node2 = { tag, no, yes, dom: tr.childTy(node.dom), cod: tr.childTy(node.cod) }
                break
            case "TyVar":
                node2 = { tag }
                break


            case "Prim":
                node2 = { tag, cons: node.cons, name: node.name, args: node.args.map(a => tr.child(a)) }
                break

            default:
                assert.noMissingCases(tag)
        }
        const depth2 = tr.depth(depth)
        const ty2 = tr.type(ty)
        const targetForm2 = tr.targetForm(targetForm)
        const addr2 = heap_alloc(depth2, node2, ty2, targetForm2)
        return addr2
    }

    function nodeTransformMemoized(memo: Map<Addr, Addr>, transformer: NodeTransformer, addr: Addr): Addr
    function nodeTransformMemoized(memo: Map<Addr, Addr>, transformer: NodeTransformer, addr: TypeAddr): TypeAddr
    function nodeTransformMemoized(memo: Map<Addr, Addr>, transformer: NodeTransformer, addr: Addr): Addr {
        let addr2 = memo.get(addr)
        if (addr2 === undefined) {
            addr2 = nodeTransform(transformer, addr)
            memo.set(addr, addr2)
        }
        return addr2
    }










    function mkNodeTransformerTry<T>(transformer: NodeTransformerTryWithDefaults): NodeTransformerTry {
        const t = transformer
        const t2: NodeTransformerTry = {
            depth: t.depth ?? (depth => depth),
            type: t.type ?? (type => type),
            targetForm: t.targetForm ?? (form => form),
            child: t.child ?? (child => child),
            childMb: t.childMb ?? (child => isAddrNo(child) ? addrNo : t2.child(child)),
            childTy: t.childTy ?? (child => t2.child(child) as TypeAddr),
            childTyMb: t.childTyMb ?? (child => isAddrNo(child) ? addrNo : t2.childTy(child)),
        }
        return t2
    }


    function nodeTransformTry(transformer: NodeTransformer, addr: TypeAddr): TypeAddrTry
    function nodeTransformTry(transformer: NodeTransformer, addr: Addr): AddrTry
    function nodeTransformTry(transformer: NodeTransformer, addr: Addr): AddrTry {
        const tr = transformer
        // const value = heap_deref(addr)
        const value = heap_get(addr).value
        // const ty = typeOf(addr)
        const ty = directAddrOf(typeOf(addr))
        const depth = depthOf(addr)
        const targetForm = targetFormOf(addr)
        const node = value.node
        const tag = node.tag
        let node2: Node
        switch (tag) {
            case "TmDatum": {
                node2 = { tag, value: node.value }
                break
            }
            case "TmPair": {
                const hd = tr.child(node.hd); if (isAddrFail(hd)) return addrFail
                const tl = tr.child(node.tl); if (isAddrFail(tl)) return addrFail
                node2 = { tag, hd, tl }
                break
            }
            case "TmApply": {
                const func = tr.child(node.func); if (isAddrFail(func)) return addrFail
                const arg = tr.child(node.arg); if (isAddrFail(arg)) return addrFail
                node2 = { tag, func, arg }
                break
            }
            case "TmLambda": {
                const pat = tr.child(node.pat); if (isAddrFail(pat)) return addrFail
                const body = tr.child(node.body); if (isAddrFail(body)) return addrFail
                node2 = { tag, no: node.no, yes: node.yes, pat, body }
                break
            }
            case "TmVar": {
                node2 = { tag, path: node.path }
                break
            }
            case "TmAs": {
                const va = tr.child(node.var); if (isAddrFail(va)) return addrFail
                const pat = tr.child(node.pat); if (isAddrFail(pat)) return addrFail
                node2 = { tag, var: va, pat }
                break
            }
            case "TmTyAnnot": {
                const term = tr.child(node.term); if (isAddrFail(term)) return addrFail
                node2 = { tag, term }
                break
            }
            case "TySingleStr": {
                node2 = { tag, value: node.value }
                break
            }
            case "TyPair": {
                const hd = tr.childTy(node.hd); if (isAddrFail(hd)) return addrFail
                const tl = tr.childTy(node.tl); if (isAddrFail(tl)) return addrFail
                node2 = { tag, hd, tl }
                break
            }
            case "TyApply": {
                const func = tr.childTy(node.func); if (isAddrFail(func)) return addrFail
                const argTy = tr.childTy(node.arg); if (isAddrFail(argTy)) return addrFail
                node2 = { tag, func, arg: argTy }
                break
            }
            case "TyFun": {
                const no = tr.childTyMb(translateTypeAddrMb(node.no)); if (isAddrFail(no)) return addrFail
                const yes = tr.childTyMb(translateTypeAddrMb(node.yes)); if (isAddrFail(yes)) return addrFail
                const dom = tr.childTy(node.dom); if (isAddrFail(dom)) return addrFail
                const cod = tr.childTy(node.cod); if (isAddrFail(cod)) return addrFail
                node2 = { tag, no: translateTypeAddrMb(no), yes: translateTypeAddrMb(yes), dom, cod }
                break
            }
            case "TyVar": {
                node2 = { tag }
                break
            }

            case "Prim": {
                const args: Addr[] = []
                for (const arg of node.args) {
                    const argTry = tr.child(arg); if (isAddrFail(argTry)) return addrFail
                    args.push(argTry)

                }
                node2 = { tag, cons: node.cons, name: node.name, args }
                break
            }

            default:
                assert.noMissingCases(tag)
        }
        const depth2 = tr.depth(depth)
        const ty2 = tr.type(ty); if (isAddrFail(ty2)) return addrFail
        const targetForm2 = tr.targetForm(targetForm)
        const addr2 = heap_alloc(depth2, node2, ty2, targetForm2)
        return addr2
    }

    function nodeTransformMemoizedTry(memo: Map<Addr, AddrTry>, transformer: NodeTransformer, addr: Addr): AddrTry
    function nodeTransformMemoizedTry(memo: Map<Addr, AddrTry>, transformer: NodeTransformer, addr: TypeAddr): TypeAddrTry
    function nodeTransformMemoizedTry(memo: Map<Addr, AddrTry>, transformer: NodeTransformer, addr: Addr): AddrTry {
        let addr2 = memo.get(addr)
        if (addr2 === undefined) {
            addr2 = nodeTransformTry(transformer, addr)
            if (isAddrOk(addr2)) {
                memo.set(addr, addr2)
            }
        }
        return addr2
    }







    function depthAt(addr: Addr): Depth {
        return heap_get(addr).value!.depth
    }
    function typeAt(addr: Addr): TypeAddr {
        return heap_get(addr).value!.ty
    }
    function formAt(addr: Addr): Form {
        return heap_get(addr).value!.form
    }

    function directAddrOf<T extends Addr>(addr: T): T & DirectAddr {
        let entry = contents[addr]
        while (entry.indirect !== null) {
            addr = entry.indirect as T
            entry = contents[addr]
        }
        return addr as T & DirectAddr
    }

    // function indirectAddrsOf(addr: Addr): AddrIndirect[] {
    //     const result: AddrIndirect[] = []
    //     let entry = heap_get(addr)
    //     while (entry.indirect !== null) {
    //         result.push(addr as AddrIndirect)
    //         entry = heap_get(entry.indirect)
    //     }
    //     return result
    // }

    function indirectAddrsOf(addr: Addr): AddrIndirect[] {
        const result: AddrIndirect[] = []
        while (isUpdated(addr)) {
            result.push(addr)
            addr = updatedTo(addr)
        }
        return result
    }

    function copyWithoutIndirections<A extends Addr>(a: A): A & DirectAddr {
        const entry = heap_get(a)

        // This prunes the copying, we just return a previous result started from here.
        // Doing this can mean we end up returning a larger tree.
        // What is considered to be in a cycle, depends on our starting point.
        // The copy we are returning here was made from an empty "inStack" set.
        // In the presence of cycles, the intended behaviour is that we 
        //   fork-off into unreduced code, before revisiting the same node recursively.
        // It is possible here that the copied graph will contain a cycle-overlap,
        //   before the fork-off occurs.
        // It's not wrong, but the behaviour is not ideal.
        // Types that look essentially the same to the user, may look different internally,
        //   depending on the order the copying is performed in.
        // For decidable type-checks that should be of no consequence.
        // However it means the boundary of decidability is fuzzier than it otherwise would be,
        //   and seemingly dependent on things that are considered internal.
        if (entry.copy !== null) return entry.copy as A & DirectAddr

        // A slightly smarter approach would involve only caching results in which no back-tracking was needed.
        //   The downside of this is less caching in the presence of types with cycles, 
        //     (typical of objects, although those are constructed using "Fix", which doesn't directly reduce).
        // A more complex approach would involve identifying the start of cycles.
        // For cycles which involve the body of a lambda refering to the lambda, 
        //   the start is unambiguous,
        //   is this always the case, what about cycles at a level depth?

        const copyDepth = depthZero
        const memo = new Map<Addr, Addr>
        const inStack = new Set<Addr>

        function copy(addr: TypeAddr): TypeAddrTry
        function copy(addr: TypeAddrMb): TypeAddrMbTry
        function copy(addr: Addr): AddrTry
        function copy(addr: AddrMb): AddrMbTry
        function copy(addr: AddrMb): AddrMbTry {
            if (isAddrNo(addr)) {
                return addrNo
            }
            if (addr === addrTypeType) {
                // This handles the (Type : Type) cycle
                return addr
            }

            const entry = heap_get(addr)!
            if (entry.copy !== null) return entry.copy

            const entry2 = heap_get(h.directAddrOf(addr))!
            if (entry2.copy !== null) return entry2.copy

            const addrChain = h.chainAddrs(addr)

            const transformer: NodeTransformerTry = {
                depth:      /**/ depth => depth,
                type:       /**/ addr => copy(addr),
                targetForm: /**/ form => form,
                child:      /**/ addr => copy(addr),
                childMb:    /**/ addr => copy(addr),
                childTy:    /**/ addr => copy(addr),
                childTyMb:  /**/ addr => copy(addr),
            }

            // Copy the latest update to "addr" that doesn't result in a cycle.
            //   if a cycle is unavoidable, then return "addrFail", it is the caller's responsibility to backtrack further.
            let addrToCopy: Addr | undefined
            while ((addrToCopy = addrChain.pop()) !== undefined) {
                if (inStack.has(addrToCopy)) continue
                if (h.depthOf(addrToCopy) < copyDepth) return addr
                inStack.add(addrToCopy)
                if (inStack.size % 1000 === 0) {
                    console.log(`copyWithoutIndirections: stack-size: (${inStack.size})`)
                }
                const result = h.nodeTransformMemoizedTry(memo, transformer, addrToCopy)
                inStack.delete(addrToCopy)
                if (isAddrOk(result)) return result
            }
            return addrFail
        }

        const result = copy(a)

        // It should be impossible for the outermost transformation to fail.
        if (isAddrFail(result)) {
            assert.impossible("copyWithoutIndirections couldn't find a place to break the cycle.")
        }

        assumeIsDirect(result)

        const a2 = h.directAddrOf(a)
        if (h.formOf(a2) === h.targetFormOf(a2)) {
            // If the node we started is in its target-form,
            //   then cache the result.
            // We don't want to do this prematurely, 
            //   or we risk failing to correctly copy a shared node which has been copied and then reduced further.
            // The current approach to specialization of primitives involves:
            //   - first reducing to weak-form, 
            //   - attempting primitive reduction, 
            //   - if primitive reduction fails, reducde the primitive's arguments to strong-form. 
            // It might be simpler overall to not use this two-stage process.
            // This would require the user to be more aware of and involved with mitigating non-termination.
            // The user would need to place blockUntil ($?) calls in more places.

            // Also mixed-levels of reduction can occur if types involve terms beneath lambdas.
            // Type-checking will then result in terms beneath lambda being reduced which wouldn't otherwise have been.
            // It might be simplest overall to always reduce terms beneath lambdas.
            // This would then mean using strong-form everywhere, which amounts to normal-form.
            // This would further increase the places users would need to be aware of non-termination risks.
            // So the user would need to place blockUntil ($?) calls in even more places.

            entry.copy = result
        }

        return result as A & DirectAddr
    }


    function depthOf(addr: Addr): Depth {
        return heap_get(addr).value!.depth
    }

    function typeOf(addr: Addr): TypeAddr {
        const termValue = heap_get(addr).value!
        return termValue.ty
    }
    function formOf(addr: Addr): Form {
        return heap_get(addr).value?.form ?? formNone
    }
    function targetFormOf(addr: Addr): TargetForm {
        return heap_get(addr).value?.targetForm ?? formWeak
    }

    function update<A extends DirectAddr, B extends Addr>(from: A, to: B): unit {
        // if (from === 2047) debugger
        heap_link(from, to)
    }
    function isUpdated<T extends Addr>(addr: T): addr is T & AddrIndirect {
        const entry = heap_get(addr)
        return entry.indirect !== null
    }
    // function updatedTo(addr: AddrIndirect & TypeAddr): TypeAddr 
    function updatedTo(addr: AddrIndirect): Addr {
        const entry = heap_get(addr)
        assert.isTrue(entry.indirect !== null)
        return entry.indirect
    }

    function setForm(addr: DirectAddr, form: Form): unit {
        // if (addr === 2090) debugger
        heap_deref(addr).form = form
    }


    function defaultType_for_datum(value: Datum): TypeAddr {
        if (value === null) {
            return tyPrim0("Nil")
        }
        switch (typeof value) {
            case "string":
                // singleton strings
                // TODO later: singleton everything else
                return tySingleStr(value)
            case "number":
                return tyPrim0("Int")
            case "boolean":
                return tyPrim0("Bool")
            default:
                assert.impossible(`Unexpected datum type (${typeof value})`)
        }
    }


    function defaultType(type: TypeAddrMb): TypeAddr {
        if (type >= 0) return type as TypeAddr
        return addrTypeType
    }
    // // function translateTypeMb(type: TypeAddrMb): TypeAddr | null {
    // //     if (type >= 0) return type as TypeAddr
    // //     return null
    // // }
    // function translateTypeMb(type: TypeAddrMb): TypeAddr | null 
    // function translateTypeMb(type: TypeAddr | null): TypeAddrMb 
    // function translateTypeMb(type: TypeAddrMb | null): TypeAddrMb | null {
    //     if (type === null) return noAddr
    //     if (type >= 0) return type as TypeAddr
    //     return null
    // }

    function translateAddrMb<T extends AddrMb>(type: AddrMb): T | null
    function translateAddrMb<T extends AddrMb>(type: Addr | null): Exclude<T, AddrMb>
    function translateAddrMb<T extends AddrMb>(type: AddrMb | null): AddrMb | null {
        if (type === null) return addrNo
        if (type === addrNo) return null
        return type
    }
    function translateTypeAddrMb<T extends TypeAddrMb>(type: TypeAddrMb): Exclude<T, AddrNo> | null
    function translateTypeAddrMb<T extends TypeAddrMb>(type: Exclude<T, AddrNo> | null): T
    function translateTypeAddrMb<T extends TypeAddrMb>(type: TypeAddrMb | null): TypeAddrMb | null {
        if (type === null) return addrNo
        if (type === addrNo) return null
        return type
    }
    function translateBool(b: boolean): Bool
    function translateBool(b: Bool): boolean
    function translateBool(b: boolean | Bool): boolean | Bool {
        switch (b) {
            case 0: return false
            case 1: return true
            case false: return 0 as Bool
            case true: return 1 as Bool
            default: assert.impossible()
        }
    }


    function tyHead(pairTy: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, pairTy)
        type = defaultType(type)
        return heap_allocType(depth, { tag: "Prim", cons: false, name: "Hd", args: [pairTy] }, type, form)
    }
    function tyTail(pairTy: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, pairTy)
        type = defaultType(type)
        return heap_allocType(depth, { tag: "Prim", cons: false, name: "Tl", args: [pairTy] }, type, form)
    }


    function tyPair(hd: TypeAddr, tl: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, hd, tl)
        type = defaultType(type)
        let pairType = heap_allocType(depth, { tag: "TyPair", hd: hd, tl: tl }, type, form)
        return pairType
    }
    function tyUnion(a: TypeAddr, b: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, a, b)
        type = defaultType(type)
        return heap_allocType(depth, { tag: "Prim", cons: false, name: "{|}", args: [a, b] }, type, form)
    }
    function tyIntersect(a: TypeAddr, b: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, a, b)
        type = defaultType(type)
        return heap_allocType(depth, { tag: "Prim", cons: false, name: "{&}", args: [a, b] }, type, form)
    }
    function tyRelComp(a: TypeAddr, b: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, a, b)
        type = defaultType(type)
        return heap_allocType(depth, { tag: "Prim", cons: false, name: "{\\}", args: [a, b] }, type, form)
    }
    function tyFun(no: TypeAddrMb, yes: TypeAddrMb, dom: TypeAddr, cod: TypeAddr, depth: Depth, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        // depth = defaultDepth(depth, no, yes, dom, cod)
        type = defaultType(type)
        let funType = heap_allocType(depth, { tag: "TyFun", no: translateAddrMb(no), yes: translateAddrMb(yes), dom: dom, cod: cod }, type, form)
        type = defaultType(type)
        return funType
    }
    function tyDom(funTy: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        return tyPrim1("Dom", funTy, depth, type)
        // depth = maxDepth1(depth, funTy)
        // let domType = heap_allocType(depth, { tag: "TyOp1", name: "Dom", args: [funTy] }, type)
    }
    function tyCod(funTy: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        return tyPrim1("Cod", funTy, depth, type)
    }

    function tyElem(funTy: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        return tyPrim1("Elem", funTy, depth, type)
    }







    function tyApply(func: TypeAddr, argTy: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, func, argTy)
        type = defaultType(type)
        return heap_allocType(depth, { tag: "TyApply", func: func, arg: argTy }, type, form)
    }
    function isTyApply(ty: Addr): ty is Addr_of_TyApply {
        const a = getNode(ty)
        return a.tag === "TyApply"
    }
    function fun_ty(app: Addr_of_TyApply): TypeAddr {
        const a = getNode(app)
        assert.isTrue(a.tag === "TyApply")
        return a.func
    }
    function arg_ty(app: Addr_of_TyApply): TypeAddr {
        const a = getNode(app)
        assert.isTrue(a.tag === "TyApply")
        return a.arg
    }


    function funTy_of(app: Addr_of_TyApply): TypeAddr {
        const a = getNode(app)
        assert.isTrue(a.tag === "TyApply")
        return a.func
    }
    // function argTm_of(app: Addr_of_TyApply): AddrMb {
    //     const a = getNode(app)
    //     assert.isTrue(a.tag === "TyApply")
    //     // return a.argTm
    //     return addrNo
    // }
    function argTy_of(app: Addr_of_TyApply): TypeAddr {
        const a = getNode(app)
        assert.isTrue(a.tag === "TyApply")
        return a.arg
    }

    // function tyApplyTyTm(funTy: TypeAddr, argTm: Addr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo): TypeAddr {
    //     depth = defaultDepth(depth, funTy, argTm)
    //     type = defaultType(type)

    //     const argTy = typeOf(argTm)

    //     const applyTy = heap_allocType(depth, { tag: "Prim", cons: false, name: "ApplyTyTm", args: [funTy, argTm] }, type)
    //     // const applyTy = heap_allocType(depth, { tag: "TyApply", func: funTy, argTm, argTy }, type)

    //     // const applyTy = tyApply(funTy, argTm, argTy, depth, type)

    //     return applyTy
    // }



    // function maxDepth1(depth: DepthMb, a: Addr): Depth {
    //     if (depth >= 0) return depth as Depth
    //     return depthOf(a)
    // }
    // function maxDepth2(depth: DepthMb, a: Addr, b: Addr): Depth {
    //     if (depth >= 0) return depth as Depth
    //     return Math.max(depthOf(a), depthOf(b)) as Depth
    // }
    // // function maxDepth3(depth: DepthMb, a: Addr, b: Addr): Depth {
    // //     if (depth >= 0) return depth as Depth
    // //     return Math.max(depthOf(a), depthOf(b)) as Depth
    // // }
    // function maxDepth4(depth: DepthMb, a: Addr, b: Addr, c: Addr, d: Addr): Depth {
    //     if (depth >= 0) return depth as Depth
    //     return Math.max(depthOf(a), depthOf(b), depthOf(c), depthOf(d)) as Depth
    // }
    function defaultDepth(depth: DepthMb, ...addrs: AddrMb[]): Depth {
        if (depth >= 0) return depth as Depth
        let deepest = 0 as Depth
        for (let i = 0; i < addrs.length; i++) {
            const addr = addrs[i]
            if (isAddrYes(addr)) {
                // const depth = depthOf(addr)
                const depth = depthAt(addr)
                if (depth > deepest) {
                    deepest = depth
                }
            }
        }
        return deepest
    }

    function derefNode(addr: Addr): Node {
        return heap_deref(addr).node
    }
    function getNode(addr: Addr): Node {
        // return heap_get(addr).value!.node
        if (addr >= contents.length) {
            throw new Error(`Invalid addr (${addr})`)
        }
        return contents[addr].value.node
    }


    // Generic Term/Type Prim/Op primitive/builtin construction and access
    // function prim(name: TyPrim, args: Addr[], depth: Depth, type: TypeAddr): Addr_of_TyPrim 
    // function prim(name: Prim, args: Addr[], depth: Depth, type: TypeAddr): Addr_of_Prim
    function prim(name: Prim, args: Addr[], depth: Depth, type: TypeAddr, form: TargetForm = formWeak): Addr_of_Prim {
        return heap_alloc(depth, { tag: "Prim", cons: false, name, args } as any, type, form) as Addr_of_Prim
    }

    function isPrim(name: null, a: AddrQ): a is Addr_of_Prim
    function isPrim(name: TyPrim0, a: AddrQ): a is Addr_of_TyPrim0
    function isPrim(name: TyPrim1Tm, a: AddrQ): a is Addr_of_TyPrim1Tm
    function isPrim(name: TyPrim1Ty, a: AddrQ): a is Addr_of_TyPrim1Ty
    function isPrim(name: TyPrim2, a: AddrQ): a is Addr_of_TyPrim2
    function isPrim(name: TyPrim3, a: AddrQ): a is Addr_of_TyPrim3
    // function isPrim(name: TyPrim | null, a: AddrQ): boolean
    function isPrim(name: TyOp1, a: AddrQ): a is Addr_of_TyOp1
    function isPrim(name: TyOp2, a: AddrQ): a is Addr_of_TyOp2
    // function isPrim(name: TyOp | null, a: AddrQ): boolean
    function isPrim(name: string | null, addr: Addr): addr is Addr_of_TmPrim
    function isPrim(name: TmOp1, addr: Addr): addr is Addr_of_TmOp1
    function isPrim(name: TmOp2, addr: Addr): addr is Addr_of_TmOp2
    function isPrim(name: TmOp | null, addr: Addr): addr is Addr_of_TmOp // TODO ? Return boolean ?
    function isPrim(name: Prim | null, addr: Addr): boolean {
        const a = getNode(addr)
        return (a.tag === "Prim" && (name === null || name === a.name))
    }

    function name_of(addr: Addr_of_TyOp): string
    function name_of(addr: Addr_of_TyPrim): string
    function name_of(addr: Addr_of_TyOp | Addr_of_TyPrim): string
    function name_of(addr: Addr_of_TmOp): string
    function name_of(addr: Addr_of_Prim): string
    function name_of(addr: Addr) {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim")
        return a.name
    }

    function cons_of(addr: Addr_of_Prim): boolean {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim")
        return a.cons
    }

    function arg0_of(addr: Addr_of_TyPrim1Tm): Addr
    function arg0_of(addr: Addr_of_TyPrim1Ty): TypeAddr
    function arg0_of(addr: Addr_of_TyOp1 | Addr_of_TyPrim1): TypeAddr
    function arg0_of(addr: Addr_of_TyOp2 | Addr_of_TyPrim2): TypeAddr
    function arg0_of(addr: Addr_of_TyPrim3): Addr
    function arg0_of(addr: Addr_of_TmPrim): Addr
    function arg0_of(addr: Addr_of_TmOp1): Addr
    function arg0_of(addr: Addr_of_TmOp2): Addr
    function arg0_of(addr: Addr): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim" && a.args.length > 0)
        return a.args[0]!
    }

    function arg1_of(addr: Addr_of_TyOp2 | Addr_of_TyPrim2): TypeAddr
    function arg1_of(addr: Addr_of_TyPrim3): Addr
    function arg1_of(addr: Addr_of_TmPrim): Addr
    function arg1_of(addr: Addr_of_TmOp2): Addr
    function arg1_of(addr: Addr): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim" && a.args.length > 1)
        return a.args[1]!
    }

    function arg2_of(addr: Addr_of_TyPrim3): Addr
    function arg2_of(addr: Addr_of_TmPrim): Addr
    function arg2_of(addr: Addr): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim" && a.args.length > 2)
        return a.args[2]!
    }

    function argN_of(n: number, addr: Addr): Addr {
        const a = getNode(addr)
        assert.isTrue(isPrim(null, addr))
        assert.isTrue(a.tag === "Prim" && a.args.length > n)
        assert.isTrue(n < a.args.length)
        return a.args[n]
    }





    function tyPrim0(name: TyPrim0, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): Addr_of_TyPrim0 {
        depth = defaultDepth(depth)
        type = defaultType(type)
        return heap_alloc(depth, { tag: "Prim", cons: false, name, args: [] }, type, form) as Addr_of_TyPrim0
    }

    function tyPrim1(name: TyPrim1, arg0: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, arg0)
        type = defaultType(type)
        return heap_allocType(depth, { tag: "Prim", cons: false, name, args: [arg0] }, type, form)
    }
    function tyPrim2(name: TyPrim2, arg0: TypeAddr, arg1: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, arg0, arg1)
        type = defaultType(type)
        return heap_allocType(depth, { tag: "Prim", cons: false, name, args: [arg0, arg1] }, type, form)
    }
    function tyPrim3(name: TyPrim3, arg0: TypeAddr, arg1: TypeAddr, arg2: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, arg0, arg1)
        type = defaultType(type)
        return heap_allocType(depth, { tag: "Prim", cons: false, name, args: [arg0, arg1, arg2] }, type, form)
    }


    function tyOp1(name: TyOp1, arg0: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, arg0)
        type = defaultType(type)
        return heap_alloc(depth, { tag: "Prim", cons: false, name, args: [arg0] }, type, form) as TypeAddr
    }
    function tyOp2(name: TyOp2, arg0: TypeAddr, arg1: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, arg0, arg1)
        type = defaultType(type)
        return heap_alloc(depth, { tag: "Prim", cons: false, name, args: [arg0, arg1] }, type, form) as TypeAddr
    }

    // A type-constructor is now a type-operator that is considered fully-reduced, without actually being reduced.
    function tyCon1(name: TyOp1, arg0: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, arg0)
        type = defaultType(type)
        return heap_alloc(depth, { tag: "Prim", cons: true, name, args: [arg0] }, type, form) as TypeAddr
    }
    function tyCon2(name: TyOp2, arg0: TypeAddr, arg1: TypeAddr, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): TypeAddr {
        depth = defaultDepth(depth, arg0, arg1)
        type = defaultType(type)
        return heap_alloc(depth, { tag: "Prim", cons: true, name, args: [arg0, arg1] }, type, form) as TypeAddr
    }




    function isTyPrim(name: TyPrim0, addr: Addr): addr is Addr_of_TyPrim0
    function isTyPrim(name: TyPrim1Tm, addr: Addr): addr is Addr_of_TyPrim1Tm
    function isTyPrim(name: TyPrim1Ty, addr: Addr): addr is Addr_of_TyPrim1Ty
    function isTyPrim(name: TyPrim2, addr: Addr): addr is Addr_of_TyPrim2
    function isTyPrim(name: TyPrim3, addr: Addr): addr is Addr_of_TyPrim3
    function isTyPrim(name: TyPrim | null, addr: Addr): boolean {
        const a = getNode(addr)
        switch (a.tag) {
            case "Prim":
                return name === null || a.name === name
            default:
                return false
        }
    }

    function isTyPrim0(addr: Addr): addr is Addr_of_TyPrim1 {
        const a = getNode(addr)
        return a.tag === "Prim" && a.args.length === 0
    }
    function isTyPrim1(addr: Addr): addr is Addr_of_TyPrim1 {
        const a = getNode(addr)
        return a.tag === "Prim" && a.args.length === 1
    }
    function isTyPrim2(addr: Addr): addr is Addr_of_TyPrim2 {
        const a = getNode(addr)
        return a.tag === "Prim" && a.args.length === 2
    }
    function isTyPrim3(addr: Addr): addr is Addr_of_TyPrim3 {
        const a = getNode(addr)
        return a.tag === "Prim" && a.args.length === 3
    }


    function isTyOp(name: TyOp1, addr: Addr): addr is Addr_of_TyOp1
    function isTyOp(name: TyOp2, addr: Addr): addr is Addr_of_TyOp2
    function isTyOp(name: TyOp1 | TyOp2 | null, addr: Addr): boolean {
        const a = getNode(addr)
        switch (a.tag) {
            case "Prim":
                return name === null || a.name === name
            default:
                return false
        }
    }

    function isTyOp1(addr: Addr): addr is Addr_of_TyOp1 {
        const a = getNode(addr)
        return a.tag === "Prim" && a.args.length === 1
    }
    function isTyOp2(addr: Addr): addr is Addr_of_TyOp2 {
        const a = getNode(addr)
        return a.tag === "Prim" && a.args.length === 2
    }


    function isTyPrimOneOf(names: TyPrim[], addr: Addr): addr is Addr_of_TyPrim
    function isTyPrimOneOf(names: (TyPrim)[], addr: Addr): addr is Addr_of_TyPrim {
        const a = getNode(addr)
        return (a.tag === "Prim" && names.indexOf(a.name as TyPrim) !== -1)
    }

    function isTyPrimOneOf2(names: TyPrim[]): (addr: Addr) => addr is Addr_of_TyPrim
    function isTyPrimOneOf2(names: TyPrim[]): (addr: Addr) => addr is Addr_of_TyPrim {
        return function (addr: Addr): addr is Addr_of_TyPrim {
            const a = getNode(addr)
            return (a.tag === "Prim" && names.indexOf(a.name as TyPrim) !== -1)
        }
    }

    function name_ty(addr: Addr_of_TyPrim): string
    function name_ty(addr: Addr_of_TyOp0): string
    function name_ty(addr: Addr_of_TyOp1): string
    function name_ty(addr: Addr_of_TyOp2): string
    function name_ty(addr: Addr_of_TyCon): string
    function name_ty(addr: Addr_of_TyOp | Addr_of_TyCon | Addr_of_TyPrim): string {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim")
        return a.name
    }

    function cons_ty(addr: Addr_of_TyOp | Addr_of_TyPrim): boolean {
        const a = getNode(addr)
        switch (a.tag) {
            case "Prim":
                return a.cons
            default:
                return false
        }
    }

    function arg0_ty(addr: Addr_of_TyPrim1Tm): Addr
    function arg0_ty(addr: Addr_of_TyPrim1Ty): TypeAddr
    function arg0_ty(addr: Addr_of_TyPrim2): TypeAddr
    function arg0_ty(addr: Addr_of_TyPrim3): TypeAddr
    function arg0_ty(addr: Addr_of_TyOp1): TypeAddr
    function arg0_ty(addr: Addr_of_TyOp2): TypeAddr
    function arg0_ty(addr: Addr_of_TyPrim | Addr_of_TyOp): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim" && a.args.length > 0)
        return a.args[0]!
    }

    function arg1_ty(addr: Addr_of_TyPrim2): TypeAddr
    function arg1_ty(addr: Addr_of_TyPrim3): TypeAddr
    function arg1_ty(addr: Addr_of_TyOp2): TypeAddr
    function arg1_ty(addr: Addr_of_TyPrim | Addr_of_TyOp): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim" && a.args.length > 1)
        return a.args[1]!
    }

    function arg2_ty(addr: Addr_of_TyPrim3): TypeAddr
    function arg2_ty(addr: Addr_of_TyPrim | Addr_of_TyOp): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim" && a.args.length > 2)
        return a.args[2]!
    }


    function isTyFun(addr: Addr): addr is Addr_of_TyFun {
        const a = getNode(addr)
        return a.tag === "TyFun"
    }
    function no_ty(addr: Addr_of_TyFun): TypeAddrMb {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TyFun")
        return translateAddrMb(a.no)
    }
    function yes_ty(addr: Addr_of_TyFun): TypeAddrMb {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TyFun")
        return translateAddrMb(a.yes)
    }
    function dom_ty(addr: Addr_of_TyFun): TypeAddr {
        const a = getNode(addr)
        if (a.tag === "TyFun") {
            return a.dom
        }
        else {
            return tyDom(addr)
        }
    }
    function cod_ty(addr: Addr_of_TyFun): TypeAddr {
        const a = getNode(addr)
        // assert.isTrue(a.tag === "TyFun")
        if (a.tag === "TyFun") {
            return a.cod
        }
        else {
            return tyCod(addr)
        }
    }


    function tyVar(depth: Depth, type: TypeAddrMb, form: TargetForm = formWeak): Addr_of_TyVar {
        type = defaultType(type)
        return heap_allocType(depth, { tag: "TyVar" }, type, form) as Addr_of_TyVar
    }
    function isTyVar(addr: Addr): addr is Addr_of_TyVar {
        const a = getNode(addr)
        return a.tag === "TyVar"
    }


    function tmVar(path: number[], depth: Depth, type: TypeAddr, form: TargetForm = formWeak): Addr_of_TmVar {
        return heap_alloc(depth, { tag: "TmVar", path }, type, form) as Addr_of_TmVar
    }
    function isTmVar(addr: Addr): addr is Addr_of_TmVar {
        const a = getNode(addr)
        return a.tag === "TmVar"
    }
    function path_tm(addr: Addr_of_TmVar): number[] {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmVar")
        return a.path
    }

    function tmAs(var1: Addr, pat: Addr, depth: Depth, type: TypeAddr, form: TargetForm = formWeak): Addr_of_TmAs {
        return heap_alloc(depth, { tag: "TmAs", var: var1, pat }, type, form) as Addr_of_TmAs
    }
    function isTmAs(addr: Addr): addr is Addr_of_TmAs {
        const a = getNode(addr)
        return a.tag === "TmAs"
    }
    function var_tm(addr: Addr_of_TmAs): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmAs")
        return a.var
    }


    function tmLam(no: Bool, yes: Bool, pat: Addr, body: Addr, depth: Depth, type: TypeAddr, form: TargetForm = formWeak): Addr {
        return heap_alloc(depth, { tag: "TmLambda", no: translateBool(no), yes: translateBool(yes), pat, body }, type, form)
    }

    function isTmLam(addr: Addr): addr is Addr_of_TmLambda {
        const a = getNode(addr)
        return a.tag === "TmLambda"
    }
    function no_tm(addr: Addr_of_TmLambda): Bool {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmLambda")
        return translateBool(a.no)
    }
    function yes_tm(addr: Addr_of_TmLambda): Bool {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmLambda")
        return translateBool(a.yes)
    }

    function pat_tm(addr: Addr_of_TmAs): Addr
    function pat_tm(addr: Addr_of_TmLambda): Addr
    function pat_tm(addr: Addr_of_TmLambda | Addr_of_TmAs): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmLambda" || a.tag === "TmAs")
        return a.pat
    }
    function body_tm(addr: Addr_of_TmLambda): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmLambda")
        return a.body
    }


    function tmApply(fun: Addr, arg: Addr, depth: Depth, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): Addr_of_TmApply {
        if (isAddrNo(type)) {
            const funTy = typeOf(fun)
            // TODO ? Do we want to use the more precise dependent type application by default ?
            // TODO ? Check if funTy uses its term-var at the type-level.
            const argTm = addrNo
            const argTy = typeOf(arg)
            type = tyApply(funTy, argTy)
            // type = tyApplyTyTm(type_of(fun), arg)
        }
        return heap_alloc(depth, { tag: "TmApply", func: fun, arg }, type, form) as Addr_of_TmApply
    }
    function isTmApply(addr: Addr): addr is Addr_of_TmApply {
        const a = getNode(addr)
        return a.tag === "TmApply"
    }
    function fun_tm(addr: Addr_of_TmApply): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmApply")
        return a.func
    }
    function arg_tm(addr: Addr_of_TmApply): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmApply")
        return a.arg
    }

    function tmPair(hd: Addr, tl: Addr, depth: Depth, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): Addr_of_TmPair {
        if (isAddrNo(type)) {
            type = tyPair(typeOf(hd), typeOf(tl))
        }
        return heap_alloc(depth, { tag: "TmPair", hd, tl }, type, form) as Addr_of_TmPair
    }
    function isTmPair(addr: Addr): addr is Addr_of_TmPair {
        const a = getNode(addr)
        return a.tag === "TmPair"
    }
    function hd_tm(addr: Addr_of_TmPair): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmPair")
        return a.hd
    }
    function tl_tm(addr: Addr_of_TmPair): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmPair")
        return a.tl
    }

    function tmDatum(datum: Datum, depth: Depth = depthZero, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): Addr_of_TmDatum {
        if (isAddrNo(type)) {
            type = defaultType_for_datum(datum)
        }
        return heap_alloc(depth, { tag: "TmDatum", value: datum }, type, form) as Addr_of_TmDatum
    }
    function isTmDatum(addr: Addr): addr is Addr_of_TmDatum {
        const a = getNode(addr)
        return a.tag === "TmDatum"
    }
    function datum_tm(addr: Addr_of_TmDatum): Datum {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmDatum")
        return a.value
    }


    function tmPrim(name: string, args: Addr[], depth: Depth, type: TypeAddr, form: TargetForm = formWeak): Addr_of_TmPrim {
        return heap_alloc(depth, { tag: "Prim", name, cons: false, args: args }, type, form) as Addr_of_TmPrim
    }
    function isTmPrim(name: TmPrim | null, addr: Addr): addr is Addr_of_TmPrim {
        const a = getNode(addr)
        return (a.tag === "Prim") && (name === null || a.name === name)
    }
    function isTmPrim0(addr: Addr): addr is Addr_of_TmPrim0 {
        const a = getNode(addr)
        return (a.tag === "Prim") && (a.args.length === 0)
    }
    function isTmPrim1(addr: Addr): addr is Addr_of_TmPrim1 {
        const a = getNode(addr)
        return (a.tag === "Prim") && (a.args.length === 1)
    }
    function isTmPrim2(addr: Addr): addr is Addr_of_TmPrim2 {
        const a = getNode(addr)
        return (a.tag === "Prim") && (a.args.length === 2)
    }
    function isTmPrim3(addr: Addr): addr is Addr_of_TmPrim3 {
        const a = getNode(addr)
        return (a.tag === "Prim") && (a.args.length === 3)
    }


    function tmOp0(name: string, depth: Depth, type: TypeAddr, form: TargetForm = formWeak): Addr_of_TmOp0 {
        return heap_alloc(depth, { tag: "Prim", name, cons: false, args: [] }, type, form) as Addr_of_TmOp0
    }
    function tmOp1(name: string, arg0: Addr, depth: Depth, type: TypeAddr, form: TargetForm = formWeak): Addr_of_TmOp1 {
        return heap_alloc(depth, { tag: "Prim", name, cons: false, args: [arg0] }, type, form) as Addr_of_TmOp1
    }
    function tmOp2(name: string, arg0: Addr, arg1: Addr, depth: Depth, type: TypeAddr, form: TargetForm = formWeak): Addr_of_TmOp2 {
        return heap_alloc(depth, { tag: "Prim", name, cons: false, args: [arg0, arg1] }, type, form) as Addr_of_TmOp2
    }
    function isTmOp(name: TmOp1, addr: Addr): addr is Addr_of_TmOp1
    function isTmOp(name: TmOp2, addr: Addr): addr is Addr_of_TmOp2
    function isTmOp(name: TmOp | null, addr: Addr): addr is Addr_of_TmOp {
        const a = getNode(addr)
        return (a.tag === "Prim") && (name === null || a.name === name)
    }

    function isTmOp1(addr: Addr): addr is Addr_of_TmOp1 {
        const a = getNode(addr)
        return (a.tag === "Prim") && (a.args.length === 1)
    }
    function isTmOp2(addr: Addr): addr is Addr_of_TmOp2 {
        const a = getNode(addr)
        return (a.tag === "Prim") && (a.args.length === 2)
    }

    function name_tm(addr: Addr_of_TmOp | Addr_of_TmPrim): string {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim")
        return a.name
    }

    function arg0_tm(addr: Addr_of_TmOp | Addr_of_TmPrim): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim" && a.args.length > 0)
        return a.args[0]!
    }
    function arg1_tm(addr: Addr_of_TmOp | Addr_of_TmPrim): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim" && a.args.length > 0)
        return a.args[1]!
    }
    function arg2_tm(addr: Addr_of_TmOp | Addr_of_TmPrim): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "Prim" && a.args.length > 0)
        return a.args[2]!
    }

    function tmTyAnnot(term: Addr, depth: Depth, type: TypeAddr, form: TargetForm = formWeak): Addr_of_TmTyAnnot {
        return heap_alloc(depth, { tag: "TmTyAnnot", term }, type, form) as Addr_of_TmTyAnnot
    }
    function isTmTyAnnot(addr: Addr): addr is Addr_of_TmTyAnnot {
        const a = getNode(addr)
        return a.tag === "TmTyAnnot"
    }
    function term_tm(addr: Addr_of_TmTyAnnot): Addr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TmTyAnnot")
        return a.term
    }


    function isTyVoid(addr: Addr): addr is Addr_of_TyOp {
        return isTyPrim("Void", addr)
    }

    function tySingleStr(value: string, depth: DepthMb = depthNo, type: TypeAddrMb = addrNo, form: TargetForm = formWeak): Addr_of_TySingleStr {
        depth = defaultDepth(depth)
        type = defaultType(type)
        return heap_alloc(depth, { tag: "TySingleStr", value }, type, form) as Addr_of_TySingleStr
    }
    function isTySingleStr(addr: Addr): addr is Addr_of_TySingleStr {
        const a = getNode(addr)
        return a.tag === "TySingleStr"
    }
    function value_ty(addr: Addr_of_TySingleStr): string {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TySingleStr")
        return a.value
    }

    function isTyNil(addr: Addr): addr is Addr_of_TyOp {
        return isTyPrim("Nil", addr)
    }

    function isTyPair(addr: Addr): addr is Addr_of_TyPair {
        const a = getNode(addr)
        return a.tag === "TyPair"
    }
    function hd_ty(addr: Addr_of_TyPair): TypeAddr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TyPair")
        return a.hd
    }
    function tl_ty(addr: Addr_of_TyPair): TypeAddr {
        const a = getNode(addr)
        assert.isTrue(a.tag === "TyPair")
        return a.tl
    }


    function isTyList(addr: Addr): addr is Addr_of_TyOp1 {
        return isTyPrim("List", addr)
    }
    function isTyAny(addr: Addr): addr is Addr_of_TyOp {
        return isTyPrim("Any", addr)
    }

    function isVar(addr: Addr): boolean {
        const a = getNode(addr)
        return a.tag === "TyVar" || a.tag === "TmVar"
    }
    function isBindingForm(addr: Addr): addr is Addr_of_TyFun | Addr_of_TmLambda {
        const a = getNode(addr)
        return a.tag === "TyFun" || a.tag === "TmLambda"
    }


    function typeContainsUnknown(a: TypeAddr): boolean {
        // TODO Check for unknowns in the type
        // TODO We should probably memoize the result somewhere/somehow

        // TODO implement this / use isTyFreeOfUnknowns

        return false
    }

    function isReducedToType(addr: Addr): addr is TypeAddr {
        const a = getNode(addr)
        return a.tag.startsWith("Ty)")
    }


    function nodeTagAttrsEqual(a: AddrMb, b: AddrMb): boolean {
        if (isAddrNo(a) && isAddrNo(b)) {
            return true
        }
        if (isAddrNo(a) || isAddrNo(b)) {
            return false
        }

        // TODO ? Use "get" not "deref" ?
        // const aValue = heap.deref(a)
        // const bValue = heap.deref(b)
        const aValue = heap_get(a).value!
        const bValue = heap_get(b).value!

        if (aValue.node.tag !== bValue.node.tag) {
            return false
        }

        const { attrs: aAttrs } = nodeParts(aValue.node)
        const { attrs: bAttrs } = nodeParts(bValue.node)
        assert.isTrue(aAttrs.length === bAttrs.length)
        for (let i = 0; i !== aAttrs.length; i++) {
            const aAtVal = aAttrs[i][1]
            const bAtVal = bAttrs[i][1]
            if (aAtVal instanceof Array && bAtVal instanceof Array) {
                // This handles the "path" attribute in the TmVars.
                // TODO ? Switch to using path-keys everywhere ?
                if (aAtVal.length !== bAtVal.length) {
                    return false
                }
                for (let j = 0; j !== aAtVal.length; j++) {
                    if (aAtVal[j] !== bAtVal[j]) {
                        return false
                    }
                }
                return true
            }
            if (aAttrs[i][1] !== bAttrs[i][1]) {
                return false
            }
        }

        return true
    }

    function nodeTag(a: DirectAddr): NodeTag {
        const value = heap_get(a).value!
        return value.node.tag
    }

    // TODO Switch to taking DirectAddr, and don't use heap.deref.
    // TODO Following indirections is the caller's responsibility
    function nodeArity(a: Addr): number {
        // const node = heap.deref(a).node
        const node = getNode(a)
        const children = nodeParts(node).addrs
        return children.length
    }

    function nodeChild(a: Addr, n: number): AddrMb {
        // const node = heap.deref(a).node
        const node = getNode(a)
        const children = nodeParts(node).addrs
        assert.isTrue(n < children.length)
        return translateAddrMb(children[n])
    }



    // pathKey_root: PathKey
    function pathKey_next(key: PathKey, segment: PathSegment): PathKey {
        let keyNext = key
        if (segment < 0) {
            while (segment < 0) {
                keyNext = pathKey_tl(keyNext)
                segment += 1
            }
            return keyNext
        }
        else {
            while (segment > 0) {
                keyNext = pathKey_tl(keyNext)
                segment -= 1
            }
            keyNext = pathKey_hd(keyNext)
            return keyNext
        }
    }
    function pathKey_hd(key: PathKey): PathKey {
        assert.isTrue(pathMap.has(key))
        const pathObj = pathMap.get(key)!
        if (pathObj.hd === null) {
            const keyHd = pathMap.size as PathKey
            pathObj.hd = new PathObj(pathObj, 0, keyHd)
            pathMap.set(keyHd, pathObj.hd)
        }
        return pathObj.hd.key
    }
    function pathKey_tl(key: PathKey): PathKey {
        assert.isTrue(pathMap.has(key))
        const pathObj = pathMap.get(key)!
        if (pathObj.tl === null) {
            const keyTl = pathMap.size as PathKey
            pathObj.tl = new PathObj(pathObj, -1, keyTl)
            pathMap.set(keyTl, pathObj.tl)
        }
        return pathObj.tl.key
    }
    function pathKey_extend(init: PathKey, next: PathKey): PathKey {
        assert.todo()
    }
    function pathKey_path(path: Path): PathKey {
        let key = pathKey_root
        const path_length = path.length
        for (let i = 0; i !== path_length; i++) {
            key = pathKey_next(key, path[i])
        }
        return key
    }
    function path_pathKey(key: PathKey): Path {
        assert.isTrue(pathMap.has(key))
        let pathObj = pathMap.get(key)!
        const path: Path = []
        while (pathObj.parent !== null) {
            path.push(pathObj.segment)
            pathObj = pathObj.parent
        }
        path.reverse()
        return path
        // return path_compress(path)
    }

    function path_compress(path: Path): Path {
        if (path.length === 0) {
            return path
        }
        const result: Path = [path[0]]
        let pos = 1
        while (pos < path.length) {
            if (result[result.length - 1] < 0) {
                if (path[pos] < 0) {
                    result[result.length - 1] = path[pos] + result[result.length - 1]
                }
                else {
                    result[result.length - 1] = path[pos] - result[result.length - 1]
                }
            }
            else {
                result.push(path[pos])
            }
            pos += 1
        }
        return result
    }





    type NodeParts = { tag: string, attrs: [string, any][], addrs: (Addr | null)[] }

    function nodeParts(node: Node): NodeParts {
        switch (node.tag) {
            case "TmDatum":
                return { tag: node.tag, attrs: [["value", node.value]], addrs: [] }
            case "TmPair":
                return { tag: node.tag, attrs: [], addrs: [node.hd, node.tl] }
            case "TmApply":
                return { tag: node.tag, attrs: [], addrs: [node.func, node.arg] }
            case "TmLambda":
                return { tag: node.tag, attrs: [["no", node.no], ["yes", node.yes]], addrs: [node.pat, node.body] }
            case "TmVar":
                return { tag: node.tag, attrs: [["path", node.path]], addrs: [] }
            case "TmAs":
                return { tag: node.tag, attrs: [], addrs: [node.var, node.pat] }
            case "TmTyAnnot":
                return { tag: node.tag, attrs: [], addrs: [node.term] }

            case "TySingleStr":
                return { tag: node.tag, attrs: [["value", node.value]], addrs: [] }
            case "TyPair":
                return { tag: node.tag, attrs: [], addrs: [node.hd, node.tl] }
            case "TyApply":
                return { tag: node.tag, attrs: [], addrs: [node.func, node.arg] }
            case "TyFun":
                return { tag: node.tag, attrs: [], addrs: [node.no, node.yes, node.dom, node.cod] }
            case "TyVar":
                return { tag: node.tag, attrs: [], addrs: [] }

            case "Prim":
                return { tag: node.tag, attrs: [["name", node.name], ["cons", node.cons]], addrs: node.args }

            default:
                assert.noMissingCases(node)
        }
    }


    //#endregion



    //#region Implementation


    // Type operators have set-based semantics. 
    // Each type-operator (conceptually at least) has a corresponding term-level operator.
    //   for example: Hd / hd, (_+_) / {_+_}.
    // (if they existed) The term-level union/intersect/relcomp operators conceptually fork and prune parallel worlds.
    // (if they existed) The term-level dom/cod operators would 
    //   take a function and return every value that that function could accept/return, each value in its own parallel world.
    // Every term-level value trivially has a correspnding type-level type, by using the "Single" type-constructor.

    // Type constructors on the other hand are either:
    //   - primitive types, 
    //   - or, functions which construct types from either terms or types.

    // Primitive types could be considered either operators or constructors.
    //   for example (if such things existed):, 
    //    (2 * int) 
    //        would compute all even numbers, one in each parallel world.
    //    ( (2 * int) & (3 * int) ) 
    //         would compute 2 infinite sets of parallel worlds,
    //         and then prune them down to an infinite set of worlds containing multiples of 6.


    // // Primitives / 0-arity type-operators
    // export type TyOp0 = "Void" | "Nil" | "Bool" | "Int" | "Str" | "Any" | "All" | "Unknown" | "Type" | "Char" | "Error"

    // // Type operators that take one term as argument
    // export type TyOp1Tm = "Self" | "Fix" | "Single"
    // // Type operators that take one type as argument
    // export type TyOp1Ty = "List" | "Dom" | "Cod" | "Hd" | "Tl"
    // // export type TyOp1Ty = "Dom" | "Cod" | "Hd" | "Tl"
    // export type TyOp1 = TyOp1Tm | TyOp1Ty // | string

    // // Type operators that take two types as arguments
    // export type TyOp2TyTy = "|" | "&" | "\\" | "<:" | ":>"
    // export type TyOp2 = TyOp2TyTy // | string

    // export type TyOp = TyOp0 | TyOp1 | TyOp2

    // // A separate category for type-constructors.
    // //   These aren't type-operators in the same sense that ("|", "&" and "\\") are.
    // //   These are essentially unreducible terms (values of type "Type").

    // export type TyCon1Tm = TyOp0 | "Self" | "Fix" | "Single"
    // export type TyCon1Ty = "List" | "Elem"
    // export type TyCon1 = TyCon1Tm | TyCon1Ty
    // export type TyCon = TyCon1

    // export type TmOp1 = never
    // export type TmOp2 = "grLoop"
    // export type TmOp = TmOp1 | TmOp2

    type TmPrimitiveName<T extends string> = T & Uncapitalize<T>
    type TyPrimitiveName<T extends string> = T & Capitalize<T>
    type OpName<T extends string> = T & Capitalize<T> & Uncapitalize<T>
    type TmOpName<T extends OpName<string>> = T & `(${string})`
    type TyOpName<T extends OpName<string>> = T & `{${string}}`

    type TmPrimName = TmPrimitiveName<string> | TmOpName<OpName<string>>
    type TyPrimName = TyPrimitiveName<string> | TyOpName<OpName<string>>


    type TermNode0 =
        | { tag: "TmDatum", value: Datum }
        | { tag: "TmPair", hd: Addr, tl: Addr }
        | { tag: "TmApply", func: Addr, arg: Addr }
        | { tag: "TmLambda", no: boolean, yes: boolean, pat: Addr, body: Addr }
        | { tag: "TmVar", path: number[] }
        | { tag: "TmAs", var: Addr, pat: Addr }
        // TODO switch-over to using path-keys
        // | { tag: "TmVar", path: PathKey }
        // | { tag: "TmAs", path: PathKey, pat: Addr }

        | { tag: "Prim", cons: boolean, name: string, args: Addr[] }

        // | { tag: "HAt", path: number[], arg: Addr } // TODO a more concise way to project from a nested data-structure ? rather than long chains of hd/tl ops ?
        // TODO ? A term with a type-annotation
        // TODO ? Given subtyping isn't decidably transitive, losing type-annotations could introduce type-checking failures
        // TODO ? If we want type-checking of readback programs to succeed, 
        // TODO ?   readbacking back these annotations might make that possible 
        // TODO ?   (Need to be careful not to reduce them away prematurely).
        // | { tag: "TmTyAnnot", term: Addr, type: TypeAddr } // TODO ? remove the explicit "type", every node has a type, so this one is redundant.
        | { tag: "TmTyAnnot", term: Addr }

    // // ? Will a Tm node ever be known to denote an inhabited type, even though it has not yet reduced to a Ty node ?
    // // Probably not, this field is only here to keep the type-checkers happy.
    // //   Otherwises TypeScript reports an error when type-checking Ferrum's type-checker.
    // export type KnownInhabited = (0 | 1) & { __brand_KnownInhabited: never }
    // export const kiFalse = 0 as KnownInhabited
    // export const kiTrue = 1 as KnownInhabited

    type TermNode = TermNode0


    type TypeNode0 =
        | { tag: "TySingleStr", value: string } // Always a known (no reductions needed) string, for now. In future, a TyOp1 (or TmOp?) called "Single" should/will probably be used
        | { tag: "TyPair", hd: TypeAddr, tl: TypeAddr }
        | { tag: "TyApply", func: TypeAddr, arg: TypeAddr }
        | { tag: "TyFun", no: TypeAddr | null, yes: TypeAddr | null, dom: TypeAddr, cod: TypeAddr }
        | { tag: "TyVar" }

        | { tag: "Prim", cons: boolean, name: TyPrim0, args: [] }
        | { tag: "Prim", cons: boolean, name: TyPrim1, args: [Addr] }
        | { tag: "Prim", cons: boolean, name: TyPrim2, args: [Addr, Addr] }
        | { tag: "Prim", cons: boolean, name: TyPrim3, args: [Addr, Addr, Addr] }


    // TODO ? A type with a term-annotation
    // TODO ?   This is needed for some of the type-inhabitation rules.
    // TODO ?   term-annotations are currently used in the patterns of some function types.
    // | { tag: "TyTmAnnot", term: Addr, type: TypeAddr }
    // TODO ? Do we need this, or is it better to have a Self type in the domain of a function type.
    // | { tag: "TyAs", var: Addr, pat: Addr }
    // TODO Use a dedicated known-inhabitation node, rather than add a "ki" field to every node.
    //    | { tag: "TyKi", ty: TypeAddr }



    type TypeNode = TypeNode0

    // TODO ? Add "yes" and "no" fields to "TyFun" ? 
    // TODO ? Or maybe have separate "yes" and "no" domains ?
    // TODO ?   Or full domain and "no" domain ?
    // TODO     Or all three: full, yes, no domains, with yes being optional (use null or "Unknown") ?
    // TODO ?   This might help simplify some of the handling of intersected function types.
    // | { tag: "TyFun", no: Addr | null, yes: Addr | null, dom: Addr, cod: Addr }

    // TODO ? Add a canonical flag to TyOp ?
    // TODO ?   { Int | Str } doesn't reduce, but { Int | Any } does.
    // TODO ? The current operator reduction approach for terms needs to be improved for types.
    // TODO ? Perhaps better to disentangle operator instantiation from reduction.


    type PrimNode =
        | { tag: "Prim", cons: false, name: Prim, args: Addr[] }


    // // TODON'T
    // type HoleNode =
    //     | { tag: "HoleTmp" } // If we need to substitute into a hash-consing created indirect cycle, we'll need a temporary hole.
    //     | { tag: "HoleBlack" } // If hash-consig creates a direct cycle, it's best to avoid going into an infinite loop.

    // const nodeHoleTmp = { tag: "HoleTmp" } as const

    type Node =
        | TermNode
        | TypeNode
    // | PrimNode
    // | HoleNode

    // export type NodeTag_old = Node["tag"]



    // TODO ? Derive the TyOp?? types from data, so as to keep things in sync automatically ?
    function isTyOp1Name(name: string): name is TyOp1 {
        switch (name) {
            case "Self":
            case "Fix":
            case "Single":
            case "List":
            case "Dom":
            case "Cod":
            case "Hd":
            case "Tl":
                return true
            default:
                return false
        }
    }

    // export function isTyOp2Name(name: string): name is TyOp2 {
    //     switch (name) {
    //         case "|":
    //         case "&":
    //         case "\\":
    //         case "<:":
    //         case ":>":
    //             return true
    //         default:
    //             return false
    //     }
    // }

    function nodeToKey(n: Node, k: Datum[]): unit {
        k.push(n.tag)
        switch (n.tag) {
            case "TmDatum": k.push(n.value); break
            case "TmPair": k.push(n.hd, n.tl); break
            case "TmApply": k.push(n.func, n.arg); break
            case "TmLambda": k.push(n.yes, n.no, n.pat, n.body); break
            case "TmVar": k.push(...n.path); break
            case "TmAs": k.push(n.var, n.pat); break
            case "TmTyAnnot": k.push(n.term); break
            case "TySingleStr": k.push(n.value); break
            case "TyPair": k.push(n.hd, n.tl); break
            case "TyApply": k.push(n.func, n.arg); break
            case "TyFun": k.push(n.no, n.yes, n.dom, n.cod); break
            case "TyVar": break
            case "Prim": k.push(n.cons, n.name, ...n.args); break
            default:
                assert.noMissingCases(n)
        }
    }







    type Value = {
        // The first four fields (depth, node, ty, targetForm) must not change during reduction, or hash-consing will break.
        depth: Depth,
        node: Node,
        ty: TypeAddr,
        targetForm: TargetForm,
        // "form" starts as "None" and is updated during reduction
        // TODO ? In some (most?) cases, we can probably set "form" to its final form during instantiation/subsitution by consulting its children ?
        form: Form,
    }

    type Entry = { value: Value, indirect: Addr | null, copy: DirectAddr | null }




    // function heap_alloc(depth: Depth, node: Node, ty: TypeAddr, targetForm: TargetForm = formWeak): Addr {
    function heap_alloc(depth: Depth, node: Node, ty: TypeAddr, targetForm: TargetForm): Addr {

        if (contents.length > 0) {
            // The first entry in the heap is "Type" which is its own type.
            // We need to avoid dereferencing Type before it has even been allocated.
            // For all other nodes, the type of the node must have been allocated, 
            //   at an equal or shallower depth, before the node can be allocated.
            const tyDepth = heap_deref(ty).depth
            assert.isTrue(tyDepth <= depth, "Depth violation (alloc)")
        }

        // Zero-arity type-primitives are required to be at depth zero.
        // Otherwise assumptions made when comparing types will be violated.
        assert.isFalse(ty === 0 && depth !== 0 && node.tag === "Prim" && node.args.length === 0)

        const { addrs: children } = nodeParts(node)
        for (const child of children) {
            if (child !== null) {
                const childDepth = heap_get(child).value!.depth
                switch (node.tag) {
                    case "TmLambda":
                        assert.isTrue(childDepth <= depth + 1, "Depth violation (alloc)")
                        break
                    case "TyFun":
                        assert.isTrue(childDepth <= depth + 1, "Depth violation (alloc)")
                        break
                    default:
                        assert.isTrue(childDepth <= depth, "Depth violation (alloc)")
                }
            }
        }

        // This performs a simple form of hash-consing, (or perhaps map-consing would be a more accurate name)
        const key = [depth, ty, targetForm]
        nodeToKey(node, key)
        let addrMemo = heap_addrMemo
        for (const k of key) {
            if (addrMemo.next === null) {
                addrMemo.next = new Map
            }
            if (!addrMemo.next.has(k)) {
                addrMemo.next.set(k, { addr: addrNo, next: null })
            }
            addrMemo = addrMemo.next.get(k)!
        }
        if (isAddrNo(addrMemo.addr)) {
            const addr = nextAddr()
            addrMemo.addr = addr
            contents.push({ indirect: null, copy: null, value: { depth: depth, form: formNone, node, ty: ty, targetForm } })
        }
        // Perform a deep equals to check the addr contains the expected value.
        //   It could fail if new fields are added to Node but nodeToKey isn't updated.
        // This won't catch errors caused by new fields being added to Value,
        //   Some fields are permitted to change as reduction proceeds, and so are excluded from this comparison.
        {
            const value = heap_get(addrMemo.addr).value
            if (value === null || !equalObjects([value.depth, value.node, value.ty], [depth, node, ty])) {
                throw new Error(`!!! HashConsing FAILED !!!`)
            }
        }
        return addrMemo.addr
    }

    // function heap_allocType(depth: Depth, node: TypeNode, ty: TypeAddr, form: TargetForm = formWeak): TypeAddr {
    function heap_allocType(depth: Depth, node: TypeNode, ty: TypeAddr, form: TargetForm): TypeAddr {
        return heap_alloc(depth, node, ty, form) as TypeAddr
    }

    function heap_link(from: Addr, to: Addr): unit {

        to = directAddrOf(to)

        const fromDepth = heap_deref(from).depth
        const toDepth = heap_deref(to).depth

        if (!(toDepth <= fromDepth)) {
            console.error(`Depth violation (link ${from} -> ${to})`)
        }

        const fromEntry = contents[from]
        const toEntry = contents[to]

        if (from === to) {
            assert.impossible("A node must not link to itself")
            // Due to hash-consing, this could happen.
            // TODONT Create a black-hole node.
            // TODONT If this address is dereferenced, its better to return a black-hole, than to not return at all.
            // TODO Dereferencing needs to check for stack-cycles, 
            // TODO   and then take appropriate action,
            // TODO   such as reading-back the unreduced redex that lead to a cycle, rather than the cycle itself.
        }

        assert.isTrue(fromEntry.indirect === null, "Node has already been updated.")
        fromEntry.indirect = to
    }

    function heap_deref(addr0: Addr): Value {
        let addr = addr0
        let entry = contents[addr]
        while (entry.indirect !== null) {
            addr = entry.indirect
            entry = contents[addr]
        }
        if (entry.value === null) {
            throw new Error(`Unexpected hole encountered (${addr0} -> ${addr})`)
        }
        return entry.value
    }

    function heap_get(addr: Addr): Entry {
        if (addr >= contents.length) {
            throw new Error(`Invalid addr (${addr})`)
        }
        return contents[addr]

    }



}


//#endregion

