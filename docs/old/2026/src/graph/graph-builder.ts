// TODO ? A better (less tedious) API for building graphs ?


import { assert } from "../utils/assert.js"
import { unit } from "../utils/unit.js"
import {
    Addr, Addr_of_Prim, Addr_of_TmApply, Addr_of_TmAs, Addr_of_TmDatum, Addr_of_TmOp0, Addr_of_TmOp1, Addr_of_TmOp2,
    Addr_of_TmPair, Addr_of_TmPrim, Addr_of_TmTyAnnot, Addr_of_TmVar, Addr_of_TyPrim0, Addr_of_TySingleStr, Addr_of_TyVar,
    AddrMb, Bool, Depth, Heap, Prim, TyOp1, TyOp2, TypeAddr, TypeAddrMb, TyPrim0, TyPrim1, TyPrim1Tm, TyPrim1Ty, TyPrim2, TyPrim3,
    Datum,
    TargetForm,
    depthZero,
    depthInc,
} from "./graph-heap2.js"


export type GraphBuilder = {

    heap(): Heap
    depth(): Depth
    form(): TargetForm


    // For simple/typical use:
    //   Functions for constructing TmLam and TyFun nodes.
    //   These provide a new GraphBuilder to build their bodies at a deeper depth.
    tmLam(no: Bool, yes: Bool, patBodyCb: (gb: GraphBuilder) => [Addr, Addr], type: TypeAddr): Addr
    tyFun(no: TypeAddrMb, yes: TypeAddrMb, domCodCb: (gb: GraphBuilder) => [TypeAddr, TypeAddr], type?: TypeAddr): TypeAddr

    // For more advanced use:
    //   Provides a generic function for constructing nodes at a deeper depth.
    // This is perhaps best kept as an implementation details.
    // deeper<T=unit>(cb: (gb: GraphBuilder) => T): T

    // These are the constructor functions from GraphHeap, but with the "depth" parameter removed.
    // The depth can/will be specified once in the call to mkGraphBuilder, rather than repeatedly for every node.
    tyVar(type?: TypeAddrMb): Addr_of_TyVar
    tyApply(func: TypeAddr, argTy: TypeAddr, type?: TypeAddrMb): TypeAddr

    // Generic Term/Type Prim/Op primitive/builtin construction and access
    // prim(name: TyPrim, args: Addr[], type: TypeAddr): Addr_of_TyPrim
    prim(name: Prim, args: Addr[], type: TypeAddr): Addr_of_Prim

    tyPrim0(name: TyPrim0, type?: TypeAddrMb): Addr_of_TyPrim0
    tyPrim1(name: TyPrim1Tm, arg0: Addr, type?: TypeAddrMb): TypeAddr
    tyPrim1(name: TyPrim1Ty, arg0: TypeAddr, type?: TypeAddrMb): TypeAddr
    // tyPrim1(name: TyPrim1, arg0: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyPrim2(name: TyPrim2, arg0: TypeAddr, arg1: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyPrim3(name: TyPrim3, arg0: TypeAddr, arg1: TypeAddr, arg2: TypeAddr, type?: TypeAddrMb): TypeAddr

    tyOp1(name: TyOp1, arg0: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyOp2(name: TyOp2, arg0: TypeAddr, arg1: TypeAddr, type?: TypeAddrMb): TypeAddr

    tyCon1(name: TyOp1, arg0: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyCon2(name: TyOp2, arg0: TypeAddr, arg1: TypeAddr, type?: TypeAddrMb): TypeAddr


    tySingleStr(name: string): Addr_of_TySingleStr
    tyPair(hd: TypeAddr, tl: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyUnion(a: TypeAddr, b: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyIntersect(a: TypeAddr, b: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyRelComp(a: TypeAddr, b: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyHead(pairTy: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyTail(pairTy: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyDom(funTy: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyCod(funTy: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyElem(listTy: TypeAddr, type?: TypeAddrMb): TypeAddr


    tmVar(path: number[], type: TypeAddr): Addr_of_TmVar
    tmAs(var1: Addr, pat: Addr, type: TypeAddr): Addr_of_TmAs
    tmDatum(datum: Datum, depth?: Depth, type?: TypeAddr): Addr_of_TmDatum
    tmPair(hd: Addr, tl: Addr, type?: TypeAddr): Addr_of_TmPair
    tmApply(fun: Addr, arg: Addr, type?: TypeAddr): Addr_of_TmApply

    tmPrim(name: string, args: Addr[], type: TypeAddr): Addr_of_TmPrim
    tmOp0(name: string, type: TypeAddr): Addr_of_TmOp0
    tmOp1(name: string, arg0: Addr, type: TypeAddr): Addr_of_TmOp1
    tmOp2(name: string, arg0: Addr, arg1: Addr, type: TypeAddr): Addr_of_TmOp2


    tmTyAnnot(term: Addr, type: TypeAddr): Addr_of_TmTyAnnot
}


class GraphBuilderImpl implements GraphBuilder {

    _h: Heap
    _depth: Depth
    _form: TargetForm

    constructor(heap: Heap, depth: Depth, form: TargetForm) {
        this._h = heap
        this._depth = depth
        this._form = form
    }

    heap(): Heap {
        return this._h
    }
    depth(): Depth {
        return this._depth
    }
    form(): TargetForm {
        return this._form
    }
    tmLam(no: Bool, yes: Bool, patBodyCb: (gb: GraphBuilder) => [Addr, Addr], type: TypeAddr): Addr {
        const [pat, bod] = this.deeper(patBodyCb)
        return this._h.tmLam(no, yes, pat, bod, this._depth, type, this._form)
    }
    tyFun(no: TypeAddrMb, yes: TypeAddrMb, domCodCb: (gb: GraphBuilder) => [TypeAddr, TypeAddr], type?: TypeAddr): TypeAddr {
        const [dom, cod] = this.deeper(domCodCb)
        return this._h.tyFun(no, yes, dom, cod, this._depth, type, this._form)
    }
    deeper<T = undefined>(cb: (gb: GraphBuilder) => T): T {
        const gb = new GraphBuilderImpl(this._h, depthInc(this._depth), this._form)
        return cb(gb)
    }
    tyVar(type?: TypeAddrMb): Addr_of_TyVar {
        return this._h.tyVar(this._depth, type, this._form)
    }
    tyApply(func: TypeAddr, argTm: AddrMb, argTy: TypeAddr, depth?: Depth, type?: TypeAddrMb): TypeAddr {
        return this._h.tyApply(func, argTy, this._depth, type, this._form)
    }
    tyPrim0(name: TyPrim0, type?: TypeAddr): Addr_of_TyPrim0 {
        return this._h.tyPrim0(name, this._depth, type, this._form)
    }
    tyPrim1(name: TyPrim1Tm, arg0: Addr, type?: TypeAddrMb): TypeAddr
    tyPrim1(name: TyPrim1Ty, arg0: TypeAddr, type?: TypeAddrMb): TypeAddr
    tyPrim1(name: TyPrim1, arg0: Addr, type?: TypeAddrMb): TypeAddr
    tyPrim1(name: TyPrim1Tm & TyPrim1Ty, arg0: Addr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyPrim1(name, arg0, this._depth, type, this._form)
    }
    tyPrim2(name: TyPrim2, arg0: TypeAddr, arg1: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyPrim2(name, arg0, arg1, this._depth, type, this._form)
    }
    tyPrim3(name: TyPrim3, arg0: TypeAddr, arg1: TypeAddr, arg2: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyPrim3(name, arg0, arg1, arg2, this._depth, type, this._form)
    }
    tyOp1(name: TyOp1, arg0: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyOp1(name, arg0, this._depth, type, this._form)
    }
    tyOp2(name: TyOp2, arg0: TypeAddr, arg1: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyOp2(name, arg0, arg1, this._depth, type, this._form)
    }
    tyCon1(name: TyOp1, arg0: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyCon1(name, arg0, this._depth, type, this._form)
    }
    tyCon2(name: TyOp2, arg0: TypeAddr, arg1: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyCon2(name, arg0, arg1, this._depth, type, this._form)
    }
    tySingleStr(name: string): Addr_of_TySingleStr {
        return this._h.tySingleStr(name)
    }
    tyPair(hd: TypeAddr, tl: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyPair(hd, tl, this._depth, type, this._form)
    }
    tyUnion(a: TypeAddr, b: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyUnion(a, b, this._depth, type, this._form)
    }
    tyIntersect(a: TypeAddr, b: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyIntersect(a, b, this._depth, type, this._form)
    }
    tyRelComp(a: TypeAddr, b: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyRelComp(a, b, this._depth, type, this._form)
    }
    tyHead(pairTy: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyHead(pairTy, this._depth, type, this._form)
    }
    tyTail(pairTy: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyTail(pairTy, this._depth, type, this._form)
    }
    tyDom(funTy: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyDom(funTy, this._depth, type, this._form)
    }
    tyCod(funTy: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyCod(funTy, this._depth, type, this._form)
    }
    tyElem(listTy: TypeAddr, type?: TypeAddrMb): TypeAddr {
        return this._h.tyElem(listTy, this._depth, type, this._form)
    }
    prim(name: Prim, args: Addr[], type: TypeAddr): Addr_of_Prim {
        return this._h.prim(name, args, this._depth, type, this._form)
    }
    tmVar(path: number[], type: TypeAddr): Addr_of_TmVar {
        return this._h.tmVar(path, this._depth, type, this._form)
    }
    tmAs(var1: Addr, pat: Addr, type: TypeAddr): Addr_of_TmAs {
        return this._h.tmAs(var1, pat, this._depth, type, this._form)
    }
    tmDatum(datum: Datum, depth?: Depth, type?: TypeAddr): Addr_of_TmDatum {
        return this._h.tmDatum(datum, this._depth)
    }
    tmPair(hd: Addr, tl: Addr, type?: TypeAddr): Addr_of_TmPair {
        return this._h.tmPair(hd, tl, this._depth, type, this._form)
    }
    tmApply(fun: Addr, arg: Addr, type?: TypeAddr): Addr_of_TmApply {
        return this._h.tmApply(fun, arg, this._depth, type, this._form)
    }
    tmPrim(name: string, args: Addr[], type: TypeAddr): Addr_of_TmPrim {
        return this._h.tmPrim(name, args, this._depth, type, this._form)
    }
    tmOp0(name: string, type: TypeAddr): Addr_of_TmOp0 {
        return this._h.tmOp0(name, this._depth, type, this._form)
    }
    tmOp1(name: string, arg0: Addr, type: TypeAddr): Addr_of_TmOp1 {
        return this._h.tmOp1(name, arg0, this._depth, type, this._form)
    }
    tmOp2(name: string, arg0: Addr, arg1: Addr, type: TypeAddr): Addr_of_TmOp2 {
        return this._h.tmOp2(name, arg0, arg1, this._depth, type, this._form)
    }
    tmTyAnnot(term: Addr, type: TypeAddr): Addr_of_TmTyAnnot {
        return this._h.tmTyAnnot(term, this._depth, type, this._form)
    }
}


export function mkGraphBuilder(h: Heap, depth: Depth, form: TargetForm): GraphBuilder {
    return new GraphBuilderImpl(h, depth, form)
}





// TODO ? A fully-lazy variant.
// TODO ? ( Better called a fully-shared variant, there's nothing lazy going on. 
// TODO ?   In fact this let binds things earlier in outer scopes, 
// TODO ?     so risks non-termination.
// TODO ? )
// TODO ? Build nodes at the shallowest permitted depth.
// This would make it easy to experiment with different approaches 
//   and use different approaches in different places.
export function mkGraphBuilder_fullyShared(h: Heap, d: Depth): GraphBuilder {
    assert.todo()
}



