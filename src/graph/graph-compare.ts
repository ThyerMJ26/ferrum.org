import { assert } from "../utils/assert.js"
// import { kiFalse } from "./graph-heap.js";
import { Addr, Addr_of_TmVar, Depth, Heap, Visitor, NodeTransformer, TypeAddr, isAddrNo, depthZero, AddrMb, NodeTransformerTry, AddrTry, addrFail, isAddrOk, TypeAddrTry, TypeAddrMbTry, TypeAddrMb, AddrMbTry, addrNo, isAddrFail, addrTypeType, depthMax2 } from "../graph/graph-heap2.js";


// TODO ? Rather than only using copyWithoutIndirections on the arguments in function calls,
// TODO     use it on every redex just before it is reduced. ?

// TODO ? Mark copied nodes as copied, so as to limit the extent of traversal when copying things. ?
// TODO     Whether a node is considered copied partly depends on the starting point,
// TODO     due to the way cycles are handled.
// TODO     Stopping copying when a "copied" flag is found, could result in indirections being left.
// TODO     The gains might still be a net win, but the result would be harder to reason about.
// TODO   Or we could use a "copied-without-backtracking" flag, for the common(?) case where no cycles are involved.

// If it wasn't for memoization, it wouldn't be possible for cycles to exist in the heap 
//   (other than the very initial (Type : Type) cycle at address zero).
// Any other cycles which come into existence, do so during reduction, 
//   so there will always be an indirection node at which cycles can be broken.
// The copyWithoutIndirections functions squeezes out indirections, 
//   but is careful not to squeeze out indirections which form a cycle.
// This enables the read-back algorithm to read-back a valid AST without cycles.

export function graphCompare(h: Heap, a: Addr, b: Addr): boolean {
    // The history contained within indirections hinders simple graph-comparisons.
    // Copying a graph without the indirections provides a simple way to compare graphs.
    const a1 = h.copyWithoutIndirections(a)
    const b1 = h.copyWithoutIndirections(b)
    return a1 === b1
}

