// TODO ? A better (less tedious) API for building graphs ?
import { assert } from "../utils/assert.js";
import { depthInc, } from "./graph-heap2.js";
class GraphBuilderImpl {
    _h;
    _depth;
    _form;
    constructor(heap, depth, form) {
        this._h = heap;
        this._depth = depth;
        this._form = form;
    }
    heap() {
        return this._h;
    }
    depth() {
        return this._depth;
    }
    form() {
        return this._form;
    }
    tmLam(no, yes, patBodyCb, type) {
        const [pat, bod] = this.deeper(patBodyCb);
        return this._h.tmLam(no, yes, pat, bod, this._depth, type, this._form);
    }
    tyFun(no, yes, domCodCb, type) {
        const [dom, cod] = this.deeper(domCodCb);
        return this._h.tyFun(no, yes, dom, cod, this._depth, type, this._form);
    }
    deeper(cb) {
        const gb = new GraphBuilderImpl(this._h, depthInc(this._depth), this._form);
        return cb(gb);
    }
    tyVar(type) {
        return this._h.tyVar(this._depth, type, this._form);
    }
    tyApply(func, argTm, argTy, depth, type) {
        return this._h.tyApply(func, argTy, this._depth, type, this._form);
    }
    tyPrim0(name, type) {
        return this._h.tyPrim0(name, this._depth, type, this._form);
    }
    tyPrim1(name, arg0, type) {
        return this._h.tyPrim1(name, arg0, this._depth, type, this._form);
    }
    tyPrim2(name, arg0, arg1, type) {
        return this._h.tyPrim2(name, arg0, arg1, this._depth, type, this._form);
    }
    tyPrim3(name, arg0, arg1, arg2, type) {
        return this._h.tyPrim3(name, arg0, arg1, arg2, this._depth, type, this._form);
    }
    tyOp1(name, arg0, type) {
        return this._h.tyOp1(name, arg0, this._depth, type, this._form);
    }
    tyOp2(name, arg0, arg1, type) {
        return this._h.tyOp2(name, arg0, arg1, this._depth, type, this._form);
    }
    tyCon1(name, arg0, type) {
        return this._h.tyCon1(name, arg0, this._depth, type, this._form);
    }
    tyCon2(name, arg0, arg1, type) {
        return this._h.tyCon2(name, arg0, arg1, this._depth, type, this._form);
    }
    tySingleStr(name) {
        return this._h.tySingleStr(name);
    }
    tyPair(hd, tl, type) {
        return this._h.tyPair(hd, tl, this._depth, type, this._form);
    }
    tyUnion(a, b, type) {
        return this._h.tyUnion(a, b, this._depth, type, this._form);
    }
    tyIntersect(a, b, type) {
        return this._h.tyIntersect(a, b, this._depth, type, this._form);
    }
    tyRelComp(a, b, type) {
        return this._h.tyRelComp(a, b, this._depth, type, this._form);
    }
    tyHead(pairTy, type) {
        return this._h.tyHead(pairTy, this._depth, type, this._form);
    }
    tyTail(pairTy, type) {
        return this._h.tyTail(pairTy, this._depth, type, this._form);
    }
    tyDom(funTy, type) {
        return this._h.tyDom(funTy, this._depth, type, this._form);
    }
    tyCod(funTy, type) {
        return this._h.tyCod(funTy, this._depth, type, this._form);
    }
    tyElem(listTy, type) {
        return this._h.tyElem(listTy, this._depth, type, this._form);
    }
    prim(name, args, type) {
        return this._h.prim(name, args, this._depth, type, this._form);
    }
    tmVar(path, type) {
        return this._h.tmVar(path, this._depth, type, this._form);
    }
    tmAs(var1, pat, type) {
        return this._h.tmAs(var1, pat, this._depth, type, this._form);
    }
    tmDatum(datum, depth, type) {
        return this._h.tmDatum(datum, this._depth);
    }
    tmPair(hd, tl, type) {
        return this._h.tmPair(hd, tl, this._depth, type, this._form);
    }
    tmApply(fun, arg, type) {
        return this._h.tmApply(fun, arg, this._depth, type, this._form);
    }
    tmPrim(name, args, type) {
        return this._h.tmPrim(name, args, this._depth, type, this._form);
    }
    tmOp0(name, type) {
        return this._h.tmOp0(name, this._depth, type, this._form);
    }
    tmOp1(name, arg0, type) {
        return this._h.tmOp1(name, arg0, this._depth, type, this._form);
    }
    tmOp2(name, arg0, arg1, type) {
        return this._h.tmOp2(name, arg0, arg1, this._depth, type, this._form);
    }
    tmTyAnnot(term, type) {
        return this._h.tmTyAnnot(term, this._depth, type, this._form);
    }
}
export function mkGraphBuilder(h, depth, form) {
    return new GraphBuilderImpl(h, depth, form);
}
// TODO ? A fully-lazy variant.
// TODO ? ( Better called a fully-shared variant, there's nothing lazy going on. 
// TODO ?   In fact this let binds things earlier in outer scopes, 
// TODO ?     so risks non-termination.
// TODO ? )
// TODO ? Build nodes at the shallowest permitted depth.
// This would make it easy to experiment with different approaches 
//   and use different approaches in different places.
export function mkGraphBuilder_fullyShared(h, d) {
    assert.todo();
}
//# sourceMappingURL=graph-builder.js.map