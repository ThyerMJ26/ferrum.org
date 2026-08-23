
import { assert } from "../utils/assert.js"
import { Addr, Depth, Heap, Visitor, depthInc, isAddrYes } from "../graph/graph-heap2.js"

function reportError(errMsg: string) {
    console.error(errMsg)
    // throw new Error(errMsg)
}

export function check (h: Heap, rootAddr: Addr): boolean {
    const rootDepth = h.depthAt(rootAddr)
    let ok = true
    const done: Set<Addr> = new Set
    const todo: [Addr | null, Addr | null, Depth][] = [[null, rootAddr, rootDepth]]
    while (todo.length !== 0) {
        const [parentAddr, addr, expectedDepth] = todo.pop()!
        if (addr === null) {
            continue
        }
        const valueDepth = h.depthAt(addr)
        if (valueDepth < 0) {
            reportError(`Bad Depth (${valueDepth}) at addr (${addr})`)
            ok = false
        }
        if (parentAddr !== null && valueDepth > expectedDepth) {
            reportError(`Bad Depth (${valueDepth} > ${expectedDepth}) at addr (${parentAddr} -> ${addr})`)
            ok = false
        }
        if (done.has(addr)) {
            continue
        }
        done.add(addr)

        // Check both original values and (indirections to) updated values .
        if (h.isUpdated(addr)) {
            const nextAddr = h.updatedTo(addr)
            todo.push([addr, nextAddr, valueDepth])
        }
        // Check the type of each node
        const typeAddr = h.typeAt(addr)
        todo.push([addr, typeAddr, valueDepth])

        const visitor: Visitor<void> = h.mkVisitor({
            tmVar(addr) {
                const varDepth = h.depthOf(addr)
                if (valueDepth === 0) {
                    reportError(`Bad Depth (${valueDepth}) at addr (${addr}): Escaped variable (${h.showNode(addr)})`)
                    ok = false
                }
            },
            tyVar(addr) {
                const varDepth = h.depthOf(addr)
                if (valueDepth === 0) {
                    reportError(`Bad Depth (${valueDepth}) at addr (${addr}): Escaped variable (${h.showNode(addr)})`)
                    ok = false
                }
            },
            tmLambda(addr) {
                const varDepth = depthInc(h.depthOf(addr))
                const pat = h.pat_tm(addr)
                const body = h.body_tm(addr)
                todo.push([addr, body, varDepth], [addr, pat, varDepth])
            },
            tyFun(addr) {
                const funDepth = h.depthOf(addr)
                const varDepth = depthInc(funDepth)
                // TODO ? Is the domain depth allowed to be deeper than the function depth ? 
                // TODO ?   Should the use of Self types in function domains be explicit or implicit ?
                // TODO ?   Allowing the domain to be deeper than the function makes it possible to delineate the scope more clearly.
                // TODO ?   Do we need to delineate this scope ?
                // TODO ?   It seems more consistent to do, and should be easy enough.
                // TODO ?   The additional work required is to add a (Self ...) wrapper (when needed) around the domain when extracting the domain.
                // TODO ?   A quick check of the depth is all that is needed in order to know if the Self wrapper needs to be added.
                const dom = h.dom_ty(addr)
                const cod = h.cod_ty(addr)
                todo.push([addr, cod, varDepth], [addr, dom, varDepth])
            },
            tm (addr) {
                for (const child of h.nodeAddrs(addr)) {
                    // const depth = h.depthOfIndirect(addr)
                    const depth = h.depthAt(addr)
                    if (isAddrYes(child)) {
                        todo.push([addr, child, depth])
                    }
                }
            }
        })

        h.nodeGuide(visitor, addr)
    }
    // assert.isTrue(ok)
    return ok
}


