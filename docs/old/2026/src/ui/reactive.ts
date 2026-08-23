import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"

//#region Interface

type BrandNode = { __brand_ReactiveNode: never }
type BrandPortR = { __brand_ReactivePortR: never }
type BrandPortW = { __brand_ReactivePortW: never }
type BrandPortRW = { __brand_ReactivePortRW: never }


type Read<V, D = undefined> = {
    read(): V
    delta(): D | undefined
    // Is the produce we are about to consume fresh today (this delta-cycle).
    fresh(): boolean // has this value been written to since the last read
    // freshSupply, hot, present, occupied.
}

type Write<V, D = undefined> = WritablePorts & {
    write(value: V, delta?: D): unit
    // TODO ? Did the previous produce get consumed, or has it been ignored and gone stale.
    // stale(): boolean // has this value been read since the last write.
    // demand, gone, absent, empty, vacant, dormant.
}


export type PortR<V, D = undefined> = BrandPortR & Read<V, D>
export type PortW<V, D = undefined> = BrandPortW & Write<V, D>

// A PortRw implements the same methods as PortR and PortW, but not the branding.
// So we can call "port.read()" and "port.write(...)" directly,
//   but must call "port.r()" or "port.w()" when 
//   using a PortRW in a context where a narrower interface is expected.
export type PortRw<V, D = undefined> =
    & Read<V, D>
    & Write<V, D>
    & {
        r(): PortR<V, D>
        w(): PortW<V, D>
    }


export type WritablePortList = PortW<any>[]

export type WritablePorts = {
    writablePorts(): WritablePortList
}


export type Node =
    & BrandNode
    & {
        diagnosticName(): string
    }


// A NodeState implements the same methods as the PortR and PortW interfaces, but not the branding.
// This means we can call "node.read()" and "node.write(...)",
//   but we cannot pass a node where a port is expected.
// An explicit use of "node.r()" or "node.w()" must be made when a port is required.
export type NodeState<V, D = undefined> =
    & Node
    & WritablePorts
    & Read<V, D>
    & Write<V, D>
    & {
        w(): PortW<V, D>
        r(): PortR<V, D>
        rw(): PortRw<V, D>
    }



export type NodeCompute<V, D = undefined> =
    & Node
    & Read<V, D>
    & {
        r(): PortR<V, D>
    }

export type NodeReadable<V, D = undefined> =
    & Node
    & Read<V, D>
    & {
        r(): PortR<V, D>
    }

export type NodeProcess =
    & Node
    & {}


// An effect-node is a process-node which doesn't write to any ports/state-nodes,
//   and is permitted/expected to have imperative effects.
// Effect-nodes serve as the roots of a DAG of nodes.
// Any sub-graph which doesn't feed into an effect, 
//   cannot have any effect, and so need not be evaluated.
export type NodeEffect =
    & Node
    & {}



export type Reactive = {
    // states are passive, processes actively span the gaps between states.
    state: <V, D = undefined>(name: string | null, initVal: V) => NodeState<V, D>

    // TODO ? An input-signal ?
    // TODO ? Distinguish between inputs and states.
    // TODO ?   - Inputs can only be written to outside the DAG propagation process
    // TODO ?   - States can only be written to by process/push signals, withing the DAG propagation process.
    // TODO ? Currently a state-signal can be written to by either,
    // TODO ?   but this would make intent clearer.
    // input: <V, D = undefined>(name: string | null, initVal: V) => SignalInput<V, D>

    // // TODO ? A resolved signal, much like state, but able to handle multiple writers.
    // // TODO ?   Also, the write-value and read-value don't need to be of the same type.
    // resolved<W, R, WD = undefined, RD = undefined>(name: string | null, resolve: (us_wires: Wire<W,WD>[], ds_signal: SignalW<R, RD>) => unit): SignalResolved<W, R, WD, RD>

    // TODO ? A transient state ?
    // TODO ? Its value automatically resets to the initVal at the end of each propagation cycle.
    // TODO ?   (reading from this isn't so different from only reading the deltas of a conventional persistent state)
    // transient: <V, D = undefined>(name: string | null, initVal: V) => SignalState<V, D>



    // a process reads from upstream signals (states) and writes to downstream signals (states)
    // process: (name: string | null, downstream: SignalInputs[], callback: () => unit) => SignalProcess
    process(name: string | null, downstream: WritablePorts[], callback: () => unit): NodeProcess

    // Compute-signals are (conceptually): 
    //   A state combined with a process, where that process only writes to that one state.
    //   Or equivalently, a continuous-assignment (the state-signal write is mandatory).
    compute: <V>(name: string | null, value: V, compute: () => V) => NodeCompute<V>

    // // TODO ? A pull-signal ?
    // // TODO ?   Conceptually similar to a compute signal, 
    // // TODO ?     but able to make use of deltas, 
    // // TODO ?     and optional writes to the downstream signal
    // pull<V,D>(name: string | null, callback: (ds_signal: SignalW<V, D>) => unit): SignalPull<V,D>
    // // TODO ? Provide the callback with the previous value ?
    // // TODO ?   This could be used to avoid recomputation of things that haven't changed.
    // // TODO ?   It should only be used in a pure way.
    // pull<V,D>(name: string | null, callback: (ds_signal: SignalW<V, D>, prev: SignalR<V> | undefined) => unit): SignalPull<V,D>
    // // TODO ? Rather than provide the old copy back, permit arbitrary state to be maintained between calls ?
    // // TODO ?   This should still only be used in a pure way, such as for cacheing and memoization purposes.
    // pull<V,D>(name: string | null, callback: (ds_signal: SignalW<V, D>, state: any[]) => unit): SignalPull<V,D>


    // // TODO ? A push-signal ?
    // // TODO ?   Passively waits to be written to, actively computes and writes to downstream signals
    // push<V, D>(name: string | null, downstream: WritableSignals[], callback: (us_signal: SignalR<V,D>) => unit): SignalPush<V,D>
    // // TODO ? A resolved-push-signal ?
    // push<V, D>(name: string | null, downstream: WritableSignals[], callback: (us_wires: Wire<V,D>[]) => unit): SignalPush<V,D>

    // The "effect" function returns a signal. 
    //   Having one effect read from another passes no information, 
    //     but it enforces an evaluation ordering.
    //   Some output effects could be order sensitive (due to unknown/untracked external factors).
    //   Sometimes the simpler solution is to place order sensitive things in the same callback function.
    //   Or to make the code that called reactiveControl.runUntilStable() 
    //     responsible for the final collecting and ordering effectful things.
    // effect: (name: string | null, callback: () => unit) => SignalProcess
    effect(name: string | null, callback: () => unit): NodeEffect
    // TODO ? Rename "effect" to "output" ?
    // TODO ?   So read/writes occur between between nodes, within the DAG.
    // TODO ?   And inputs/outputs occur at ther upper/lower edges of the DAG, facilitating external communication.
    // TODO ? But all external communication is achieved through effects, 
    // TODO ?   so perhaps "effect" is the right name, even though it doesn't nicely mirror "input".
    effect(name: string | null, callback: () => unit): NodeEffect


    // Schedule a callback to run in the next DAG propagation cycle, but while still within the same runUntilStable call.
    // If we're computing a response to a client request, and more than one DAG propagation cycle is needed,
    //   this function's callback will run while the client response is still being prepared.
    // This can be used to compute responses to client requests that we want to go back to the client in the same synchronous req/resp call.
    next(callback: () => unit): unit

    // Schedule a callback to run immediately after all current synchronous calls complete
    //   (Implemented using setImmediate)
    // If we're about to do something which won't be instant,
    //   it might be best to give a quick synchronous response indicating something has started,
    //   followed by a not quite-so-quick async progress/finished response.
    later(callback: () => unit | Promise<unit>): unit

    // Schedule a callback to run after delayMs milliseconds
    //   (Implemented using setTimeout)
    delay(delayMs: number, callback: () => unit): unit


    // TODO ? readFresh ?
    // TODO ? Takes a list of signal-handler tuples,
    // TODO ?   calls the handlers for each signal that has a fresh value, in the order in which the values became fresh.
    // TODO ?     readFresh(handlers: [SignalR<V,D>, (value: T, delta: D) => unit][]): unit

    // TODO ? A means of performing work during the next server-call / screen-update.
    // TODO ?   There's no point computing lots of messages to send to the client if the earlier ones will be overwritten by later ones.
    // TODO ?   Perhaps the App should take an AppRunner provided SignalR<null> as input, triggered by every POST ?
}

export type ReactiveControl =
    & Reactive
    & {
        // startDiagnosticCollection
        runOnce(): boolean
        runUntilStable(): unit
        // TODO ? Only permit changes/updates (or any access) to state-signals (or any signals) when done from within a callback ?
        // TODO ?   Just as a safety check. 
        // TODO ? If utility code intended for use outside of the reactive DAG callbacks nevertheless gets called by such a callback,
        // TODO ?   the result will likely be an error about a process writing to to an undeclared state-signal,
        // TODO ?   but the error would better be reported as a process callback unexpectedly trying the use the ReactiveControl interface.
        // TODO ? Something like this is needed if the Reactive interface is to be polymorphic in its implmentation technique in future.
        // call<T>(callback: (r: Reactive<RCTV>) => T): T
        // TODO ? Require an external-signal to be declared, and call callbacks via the external-signal.
        // TODO ?   This then makes it possible to distinguish external writers if needed.
        // external(name: string | null): SignalExternal
    }


//#endregion


//#region Implementation


type ReactiveImplCallback = {
    inNodeStack(s: Node): boolean
    scheduleEffect(s: NodeProcess): unit
    nodeStack_pushPop(node: Node, fn: () => unit/*, excHandler?: () => unit */): unit
    getWire_connectIfNeeded(up: NodeBaseImpl): WireAny | null
    nodeStack_peek(): NodeBaseImpl | null
    persistentState: Map<string, any>
    addDiagnosticInfo(src: string, dst: string, label: string, comment?: string): unit
    getNewTimestamp(): number
}

// An OrderStamp is like a timestamp, but for ordering purposes, not timing purposes.
// OrderStamps might be renumbered intermittently, so they shouldn't be held on to.
type OrderStamp = number & { __brand_OrderStamp: never }
const zeroStamp = 0 as OrderStamp

class Wire<V, D> {
    // TODO ? Tag the wires ?
    // TODO ? Each wire is:
    // TODO ?   - either actively read    (the value is pulled through), 
    // TODO ?   - or     actively written (the value is pushed through).
    // TODO ? However, it is always possible to infer this from 
    // TODO ?   the readability and writability of the upstream and downstream nodes, respectively.
    // tag: "Push" | "Pull"
    upstream: NodeBaseImpl
    downstream: NodeBaseImpl
    prevOp: "Read" | "Write" = "Write"
    value: V = undefined as V
    delta: D | undefined
    writeStamp: OrderStamp = zeroStamp
    readStamp: OrderStamp = zeroStamp
    constructor(upstream: NodeBaseImpl, downstream: NodeBaseImpl) {
        this.upstream = upstream
        this.downstream = downstream
    }
}
type WireAny = Wire<any, any>


type NodeTag =
    | "state" | "compute" | "process" | "effect"
// | "transient" | "resolved" | "pull" | "push" | "external"

abstract class NodeBaseImpl implements Node {
    declare __brand_ReactiveNode: never
    abstract isReadable(): boolean
    abstract isWritable(): boolean
    abstract isEffectful(): boolean

    // // TODO ? use as??? methods instead of is??? methods ?
    // abstract asReadable():  SignalReadable<any, any> | null
    // abstract asWritable():  SignalWritable<any, any> | null
    // abstract asEffectful(): SignalEffectful | null

    abstract writablePorts(): WritablePortList
    abstract update(): unit

    upstreamWires: Map<NodeBaseImpl, WireAny> = new Map
    downstreamWires: Map<NodeBaseImpl, WireAny> = new Map

    tag: NodeTag
    num: number
    name: string | null
    valid = false
    timestamp = -1
    ric: ReactiveImplCallback
    constructor(tag: NodeTag, num: number, name: string | null, ric: ReactiveImplCallback) {
        this.tag = tag;
        this.num = num
        this.name = name
        this.ric = ric
    }
    diagnosticName(): string {
        let name = `S${this.tag[0]}${this.num}`
        // let name = `S${this.tag[0]}${this.tag.at(-1)}${this.num}`
        if (this.name !== null) {
            name += `_${this.name}`
        }
        return name
    }

    invalidateDownstream() {
        // Prune the invalidation traversal, if the signal is already invalid.
        if (!this.valid) {
            return
        }
        // Prune the invalidation traversal, if the signal is in the process of being evaluated
        if (this.ric.inNodeStack(this)) {
            return
        }
        const pruneUnreadWires = this.isReadable()
        for (const [s, w] of this.downstreamWires) {
            // We only need to propagate this to downstream signals/listeners
            //   that read the previous value
            // We only do this pruning if the value was pulled through the wire (actively read), not pushed (actively written).
            // Values that are pushed are assumed to be implicitly immediately read by the state (or push) signal downstream.
            //   (Possibly implicitly read wires should be immediately marked as (prevOp = "Read"), then we wouldn't need this pruneUnreadWires condition)
            if (pruneUnreadWires && w.prevOp === "Write") {
                continue
            }

            if (this.ric.inNodeStack(s)) {
                continue
            }

            // console.log(`Invalidating signal: (${this.diagnosticName()}) -> (${s.diagnosticName()})`)
            // this.ric.addDiagnosticInfo(this.diagnosticName(), s.diagnosticName(), "invalidate")

            s.invalidateDownstream()
            s.valid = false
        }
    }


}

abstract class NodeReadableImpl<V, D = undefined> extends NodeBaseImpl implements NodeReadable<V, D> {
    initVal: V
    value: V

    constructor(
        tag: NodeTag, num: number, name: string | null, ric: ReactiveImplCallback,
        initVal: V
    ) {
        super(tag, num, name, ric)
        this.initVal = initVal
        this.value = initVal
    }
    r() { return this as (typeof this) & BrandPortR }
    isReadable() { return true }

    read(): V {
        this.update()
        const wire = this.ric.getWire_connectIfNeeded(this)
        if (wire !== null) {
            wire.prevOp = "Read"
            // console.log(`${this.diagnosticName()} -get-> ${wire.downstream.diagnosticName()}`)
            // this.ric.addDiagnosticInfo(this.diagnosticName(), wire.downstream.diagnosticName(), "read", JSON.stringify(this.value))
        }
        return this.value
    }
    delta(): D | undefined {
        this.update()
        const wire = this.ric.getWire_connectIfNeeded(this)
        if (wire !== null) {
            wire.prevOp = "Read"
            // console.log(`${this.diagnosticName()} -get-> ${wire.downstream.diagnosticName()}`)
            // this.ric.addDiagnosticInfo(this.diagnosticName(), wire.downstream.diagnosticName(), "delta", JSON.stringify(wire.delta))
            return wire.delta
        }
        return undefined
    }
    fresh(): boolean {
        this.update()
        const wire = this.ric.getWire_connectIfNeeded(this)
        if (wire !== null) {
            const prevOp = wire.prevOp
            wire.prevOp = "Read"
            const result = prevOp === "Write"
            // console.log(`${this.diagnosticName()} -get-> ${wire.downstream.diagnosticName()}`)
            // this.ric.addDiagnosticInfo(this.diagnosticName(), wire.downstream.diagnosticName(), "active", JSON.stringify(result))
            return result
        }
        return true
    }

}

class NodeStateImpl<V, D = undefined> extends NodeReadableImpl<V, D> implements NodeState<V, D> {

    constructor(
        tag: NodeTag, num: number, name: string | null, ric: ReactiveImplCallback,
        initVal: V
    ) {
        super(tag, num, name, ric, initVal)
    }

    w() { return this as typeof this & BrandPortW }
    rw() { return this as typeof this & BrandPortRW }

    isWritable() { return true }
    isEffectful() { return false }
    writablePorts(): WritablePortList { return [this.w()] }

    update(): unit {
        if (!this.valid) {
            this.ric.nodeStack_pushPop(this, () => {
                for (const [o,] of this.upstreamWires) {
                    o.update()
                }
            })
            this.valid = true
        }
    }
    write(value: V, delta?: D): unit {
        const writer = this.ric.nodeStack_peek() as NodeProcessImpl
        assert.isTrue(writer === null || writer instanceof NodeProcessImpl)
        if (writer !== null) {
            // console.log(`${writer.diagnosticName()} -set-> ${this.diagnosticName()}`)
            // this.ric.addDiagnosticInfo(writer.diagnosticName(), this.diagnosticName(), "write", JSON.stringify(value))
            if (writer.downstreamWires.get(this) === undefined) {
                console.error(`Bad write from process signal (S${writer.num}): attempt to set signal (S${this.num}) without declaring it upfront.`)
                throw new Error(`Bad write from process signal (S${writer.num}): attempt to set signal (S${this.num}) without declaring it upfront.`)
            }
        }
        else {
            // console.log(`"EXTERNAL" -set-> ${this.diagnosticName()}`)
            // this.ric.addDiagnosticInfo("", this.diagnosticName(), "write", JSON.stringify(value))
        }

        const writeTimestamp: number = Math.max(0, writer?.timestamp) ?? this.ric.getNewTimestamp()

        if (writeTimestamp < this.timestamp) {
            // If this is a write from the past, return early.
            // We can safely ignore this write.
            return
        }
        if (writeTimestamp === this.timestamp) {
            console.error(`Warning multiple writes to the same signal (${this.diagnosticName()}) have the same timestamp (${this.timestamp}), the correct value to use is ambiguous.`)
            // We could return early here, or continue.
            // Both are wrong!
            // TODO ? Or set the value back to the initial value, this avoids favouring either of the "wrong" values ?
            // this.value = value
            this.value = this.initVal
        }
        else {
            this.value = value
        }

        this.valid = true
        this.timestamp = writeTimestamp

        if (this.name !== null) {
            this.ric.persistentState.set(this.name, this.value)
        }
        this.invalidateDownstream()
        // TODO ? invalidateDownstream could just as well be implemented in the mkReactive function.
        // TODO ?   There's no real need for it to be overridable.
        // this.ric.invalidateDownstream(this)
        for (const [, d] of this.downstreamWires) {
            if (d.prevOp === "Read") {
                // If the previous value or delta was read, then this next delta can be used.
                d.delta = delta
            }
            else {
                // If the previous value and delta were ignored, then this delta cannot be used.
                //   (unless there is a delta-compressor available)
                d.delta = undefined
            }
            d.prevOp = "Write"
        }
    }

}

class NodeComputeImpl<V> extends NodeReadableImpl<V, undefined> implements NodeCompute<V> {
    compute: () => V
    constructor(
        tag: NodeTag, num: number, name: string | null, ric: ReactiveImplCallback,
        initVal: V, compute: () => V
    ) {
        super(tag, num, name, ric, initVal)
        this.compute = compute

    }
    isWritable() { return false }
    isEffectful() { return false }
    writablePorts(): WritablePortList { return [] }
    update(): unit {
        if (this.valid) {
            return
        }
        this.ric.nodeStack_pushPop(this, () => {
            try {
                this.value = this.compute()
            }
            catch (exc) {
                console.error(`Reactive Computation Callback failed: ${exc}`)
                // If the computation throws an exception, 
                //   revert to using the very initial value (typically something benign such as null or [])
                // This should be better than limping on with the app/ui in an inconsistent old/new state.
                this.value = this.initVal
            }
        })
        for (const [, d] of this.downstreamWires) {
            d.prevOp = "Write"
        }
        this.valid = true
    }
}

class NodeProcessImpl extends NodeBaseImpl implements NodeProcess {

    callback: () => unit

    constructor(
        tag: NodeTag, num: number, name: string | null, ric: ReactiveImplCallback,
        callback: () => unit
    ) {
        super(tag, num, name, ric)
        this.callback = callback
    }

    isReadable() { return false }
    isWritable() { return false }
    isEffectful() { return false }
    writablePorts(): WritablePortList { return [] }

    update(): unit {
        if (this.valid) {
            return
        }
        this.ric.nodeStack_pushPop(this, () => {
            this.callback()
        })
        this.valid = true
    }
}

class NodeEffectImpl extends NodeProcessImpl implements NodeEffect {
    isEffectful() { return true }
    invalidateDownstream(): unit {
        this.ric.scheduleEffect(this)
    }
}


export function mkReactive(persistentState: Map<string, any>, log: (...args: string[]) => unit, notify: () => unit): ReactiveControl {

    type DiagnosticInfo =
        | { tag: "edge", src: string, dst: string, label: string, comment?: string }
        | { tag: "comment", comment: string }

    // let diagnosticInfo: DiagnosticInfo[] | null = null
    let diagnosticInfo: DiagnosticInfo[] | null = []

    function addDiagnosticInfo(src: string, dst: string, label: string, comment?: string): unit {
        if (diagnosticInfo === null) {
            return
        }
        diagnosticInfo.push({ tag: "comment", comment: `${nodeStack.map(s => s.diagnosticName()).join(" ")}` })
        diagnosticInfo.push({ tag: "edge", src, dst, label, comment })
    }

    const effectNodes: NodeProcessImpl[] = []
    let pendingEffects: NodeProcessImpl[] = []
    let pendingEffectsInProgress: NodeProcessImpl[] = []

    const nodeNames: Set<string> = new Set
    const nodes: NodeBaseImpl[] = []
    const nodeStack: NodeBaseImpl[] = []


    type TaskImmediate = {
        node: NodeEffectImpl | null
        callback: () => unit | Promise<unit>
    }
    type TaskDelayed = {
        node: NodeEffectImpl
        time: number
        callback: () => unit
    }
    const nextTaskQ: TaskImmediate[] = []
    const laterTaskQ: TaskImmediate[] = []
    const delayedTaskQ: TaskDelayed[] = []

    // The browser and NodeJS setTimeout functions differ in what they return.
    //   (this should work as-is, so long the timer timeoutID is only used in calls to clearTimeout, and nothing else.)
    let delayedTask_timerId: NodeJS.Timeout | null = null
    let delayedTask_nextTime: number | null = null
    let delayedTask_nextDelay: number | null = null

    // let laterTasks_immediateId: NodeJS.Immediate | null = null
    // Using a 0ms setTimeout instead of setimmediate, so as to get this running in the browser.
    let laterTasks_immediateId: NodeJS.Timeout | null = null


    function addDelayedTask(node: NodeEffectImpl, delayMs: number, callback: () => unit) {
        const now = Date.now()
        const time = now + delayMs
        const task: TaskDelayed = { node, time, callback }
        // Place the new task in the queue
        //   after  tasks which are due later   than this new task, and
        //   before tasks which are due earlier than this new task.
        // We can either search from the start, skipping past later tasks, to find the first earlier (if any).
        const pos = delayedTaskQ.findIndex((t) => t.time < time)
        // Or start from the end, skipping past earlier tasks, to find the last (last from the end, first from the start) earlier task (if any).
        // let pos = delayedTaskQ.length
        // while (pos > 0 && delayedTaskQ[pos-1].time < time) { --pos }
        if (pos === -1 || pos === delayedTaskQ.length) {
            delayedTaskQ.push(task)
        }
        else {
            delayedTaskQ.splice(pos, 0, task)
        }
    }


    let timestamp = 0

    const reactiveImplCallback: ReactiveImplCallback = {
        inNodeStack,
        scheduleEffect,
        nodeStack_pushPop,
        nodeStack_peek,
        getWire_connectIfNeeded,
        persistentState,
        addDiagnosticInfo,
        getNewTimestamp,
    }


    const reactive: ReactiveControl = {
        // Reactive:
        state,
        compute,
        process,
        effect,
        next,
        later,
        delay,

        // ReactiveControl:
        runOnce,
        runUntilStable,
    }

    return reactive


    function getNewTimestamp(): number {
        timestamp += 1
        return timestamp
    }

    function nodeStack_peek(): NodeBaseImpl | null {
        return nodeStack.at(-1) ?? null
    }

    function nodeStack_pushPop(node: NodeBaseImpl, fn: () => unit /*, excHandler?: () => unit */): unit {
        assert.isTrue(!inNodeStack(node), () => {
            const chain = [...nodeStack, node].map(s => s.diagnosticName()).join(" -> ")
            return `SignalStack: cyclic dependency detected (${chain})`
        })
        nodeStack.push(node)
        try {
            fn()
        }
        catch (exc) {
            console.error(`Callback failed: ${exc}`)
            // if (excHandler !== undefined) {
            //     excHandler()
            // }
        }
        finally {
            const popped = nodeStack.pop()
            assert.isTrue(popped === node, `NodeStack: mismatch between node pushed and node popped`)
        }
    }

    function inNodeStack(node: NodeBaseImpl): boolean {
        // TODO ? use an "inProgress" flag in each signal, rather than scanning the stack ?
        return nodeStack.indexOf(node) !== -1
    }

    function scheduleEffect(effect: NodeProcessImpl): unit {
        // console.log("scheduleEffect: ", effect.diagnosticName())
        assert.isTrue(effect.downstreamWires.size === 0)
        // TODO ? Don't use/abuse "valid" for this ?
        // TODO ?   Have a separate "isScheduled" flag ?
        if (effect.valid) {
            effect.valid = false
            pendingEffects.push(effect)
        }
    }

    function connectNodes(up: NodeBaseImpl, dn: NodeBaseImpl): WireAny {
        const dnWire = up.downstreamWires.get(dn)
        const upWire = dn.upstreamWires.get(up)
        assert.isTrue(upWire === dnWire, "connectNodes: inconsistent wiring detected")
        assert.isTrue(upWire === undefined, "connectNodes: already connected")
        const wire = new Wire(up, dn)
        up.downstreamWires.set(dn, wire)
        dn.upstreamWires.set(up, wire)
        return wire
    }

    function getWire_connectIfNeeded(up: NodeBaseImpl): WireAny | null {
        const dn = nodeStack_peek() // as SignalProcessImpl
        assert.isTrue(dn === null || dn instanceof NodeProcessImpl || dn instanceof NodeComputeImpl)
        if (up === null || dn === null) {
            return null
        }
        const dnWire = up.downstreamWires.get(dn)
        const upWire = dn.upstreamWires.get(up)
        assert.isTrue(upWire === dnWire, "getWire_connectIfNeeded: inconsistent wiring detected")
        if (upWire === undefined) {
            return connectNodes(up, dn)
        }
        dn.timestamp = Math.max(0, dn.timestamp, up.timestamp)
        return upWire
    }


    function registerNodeName(name: string | null) {
        if (name === null) {
            return
        }
        if (nodeNames.has(name)) {
            throw new Error(`Signal name (${name}) is already in use.`)
        }
        nodeNames.add(name)
    }

    function state<V, D = undefined>(name: string | null, initVal: V): NodeStateImpl<V, D> {
        registerNodeName(name)
        const nodeNum = nodes.length
        if (name !== null) {
            // TODO Decouple: 
            // TODO   - node names being used for info/diagnostic reasons,
            // TODO   - and names being given as a means of persistence.
            // TODO ? Decouple persistence from reactive completely ?
            // TODO ?   Have an external means of persistence that is passed nodes states to persist ?
            initVal = persistentState.get(name) ?? initVal
        }
        const node = new NodeStateImpl<V, D>("state", nodeNum, name, reactiveImplCallback, initVal)
        // node.valid = false
        nodes.push(node)
        return node
    }

    // We can create compute-signals out of state-signals and process-signals.
    // It means generating twice as many signals for computations.
    // It works, but it results in the contents of the signalStack looking a bit odd.
    //   And the generated diagnostics are more cluttered and less informative.
    // function compute<V>(name: string | null, value: V, compute: () => V): SignalStateImpl<V> {
    //     const stateSignal = state<V>(name, value)
    //     stateSignal.tag = "compute"
    //     function callback() {
    //         const result = compute()
    //         stateSignal.out().write(result)
    //     }
    //     const processSignal = process(name, [stateSignal], callback) as SignalProcessImpl
    //     return stateSignal
    // }

    function compute<V>(name: string | null, value: V, compute: () => V): NodeComputeImpl<V> {
        registerNodeName(name)
        const nodeNum = nodes.length
        const node = new NodeComputeImpl<V>("compute", nodeNum, name, reactiveImplCallback, value, compute)
        nodes.push(node)
        return node
    }

    function process(name: string | null, downstream: WritablePorts[], callback: () => unit): NodeProcess {
        registerNodeName(name)
        const nodeNum = nodes.length
        const process = new NodeProcessImpl("process", nodeNum, name, reactiveImplCallback, callback as () => undefined)
        nodes.push(process)

        // State nodes that are downstream from the process node must be explicitly declared.
        // Upstream state nodes can be auto-tracked/wired.
        // That is: "read"s are wired automatically, "write"s must be declared upfront.

        for (const port of downstream) {
            // At present all ports are actually nodes in disguise.
            // This is an implementation detail.
            // If this implementation detail ever changes, 
            //   the code on the next line will need changing too.
            const node = port as NodeBaseImpl
            nodeStack_pushPop(node, () => {
                connectNodes(process, node)
            })
        }


        return process
    }

    function effect(name: string | null, callback: () => unit): NodeProcessImpl {
        registerNodeName(name)
        const nodeNum = nodes.length
        const effect = new NodeEffectImpl("effect", nodeNum, name, reactiveImplCallback, callback as () => undefined)
        nodes.push(effect)
        effectNodes.push(effect)
        pendingEffects.push(effect)
        return effect
    }

    function next(callback: () => undefined): unit {
        const node = nodeStack_peek()
        assert.isTrue(node !== null && node instanceof NodeEffectImpl, "next must be called from an effectful signal.")
        nextTaskQ.push({ node: node, callback })
    }

    function later(callback: () => undefined): unit {
        const node = nodeStack_peek()
        // assert.isTrue(signal !== null && signal instanceof SignalEffectImpl, "later must be called from an effectful signal.")
        assert.isTrue(node === null || node instanceof NodeEffectImpl, "later must be called from an effectful signal.")
        laterTaskQ.push({ node: node, callback })
    }

    function delay(delayMs: number, callback: () => undefined): unit {
        const node = nodeStack_peek()
        assert.isTrue(node !== null && node instanceof NodeEffectImpl, "delay must be called from an effectful signal.")
        const time = Date.now() + delayMs
        addDelayedTask(node, delayMs, callback)
    }



    function runNextTasks(): unit {
        for (const task of nextTaskQ) {
            task.callback()
        }
        nextTaskQ.length = 0
    }

    function runLaterTasks(): unit {
        const workQ = laterTaskQ.splice(0)
        for (const task of workQ) {
            const p = task.callback()
            if (p instanceof Promise) {
                p.then(() => {
                    // After the promise completes,
                    //   we must execute "runUntilStable(); notify()", but, ideally, not more often than needed.
                    // Conditionally scheduling another call to "runLaterTasks()" achieves this.
                    if (laterTasks_immediateId === null) {
                        later(() => { })
                        delayedTasks_schedule()
                    }
                })
            }
        }
        runUntilStable()
        notify()
    }



    // TODO Check and perform the delayed effects.
    // TODO   This should occur after the immediate effects have been communicated back to the client.
    // TODO   Either the delayed effects need to occur concurrently, between client-requests, ( or screen-updates ),
    // TODO     and then sent back to the client using a server-sent event (SSE).
    // TODO   Or, if the client is busy-polling, the delayed effects can be performed at the start of the next request / poll.

    function runDelayedTasks(): unit {
        const now = Date.now()
        // console.log(`${currentTime()} runDelayedTasks: ${delayedTaskQ.length}`)
        log(`runDelayedTasks: ${delayedTaskQ.length}`)

        let task: TaskDelayed | undefined
        while ((task = delayedTaskQ.pop()) && task.time <= now) {
            task.callback()
        }

        runUntilStable()
        notify()
        delayedTasks_schedule()
    }

    // TODO Take notify as an argument to mkReactive rather than plumb it through to runDelayedTasks and runLaterTasks.
    // TODO It's the same notification function, it doesn't change.
    function delayedTasks_schedule(): unit {

        if (delayedTaskQ.length === 0 && laterTaskQ.length === 0) {
            return
        }

        if (delayedTaskQ.length !== 0) {
            const earliest = delayedTaskQ[delayedTaskQ.length - 1].time

            // TODO ? Before stopping and restarting the timeout, check if we're just setting it to the same time. ?
            delayedTasks_stop()
            const now = Date.now()

            const delay = earliest - now
            delayedTask_timerId = setTimeout(() => {
                delayedTask_timerId = null
                runDelayedTasks()
            }, delay)
            delayedTask_nextTime = earliest
            delayedTask_nextDelay = delay
            // console.log(`${currentTime()} delayedEffects_schedule, ${delay}`)
        }
        if (laterTaskQ.length !== 0) {
            clearTimeout(laterTasks_immediateId ?? undefined)
            laterTasks_immediateId = setTimeout(() => {
                laterTasks_immediateId = null
                runLaterTasks()
            }, 0)
        }
    }

    function delayedTasks_stop(): unit {
        if (delayedTask_timerId !== null) {
            clearTimeout(delayedTask_timerId)
            delayedTask_timerId = null
            delayedTask_nextTime = null
            delayedTask_nextDelay = null
        }
    }

    function runOnce(): boolean {
        // In the process of calling the callbacks, signals can become invalidated and listeners become pending again.
        // We need to make sure not to be emptying the same pending list that we're adding to.
        // TODO Until delayed writes in signals are implemented, 
        // TODO   writes should now be sufficiently well tracked that this loop is only ever executed once ?
        pendingEffectsInProgress = pendingEffects
        pendingEffects = []
        // console.log("Notify: ", pendingListenersInProgress.map(l => l.num))
        while (pendingEffectsInProgress.length !== 0) {
            const o = pendingEffectsInProgress.pop()!
            if (!o.valid && o.callback !== null) {
                o.valid = true
                if (nodeStack.length !== 0) {
                    throw new Error("impossible?")
                }
                const callback = o.callback
                nodeStack_pushPop(o, () => {
                    try {
                        callback()
                    }
                    catch (exc) {
                        console.error(`Node callback failed: ${exc}`)
                    }
                })
            }
        }
        return pendingEffects.length === 0
    }


    function runUntilStable(): unit {

        let countIters = 0
        let countNodes = 0

        const updates: Map<NodeBaseImpl, number> = new Map
        // diagnosticInfo = []
        try {
            do {
                runNextTasks()
                // let max = 0
                const done = new Set<Node>
                do {
                    // pendingOutputs = pendingOutputs.filter(o => o.valid === false)
                    // pendingOutputs = [...new Set(pendingOutputs)]
                    countNodes += pendingEffects.length
                    countIters += 1
                    // console.log(`Process Signals: ${pendingOutputs.map(o => o.num)}`)
                    // console.log(`Process Signals: ${pendingOutputs.map(o => o.name)}`)
                    // console.log(`Process Signals Count: Iters (${countIters}) Signals (${countSignals}/${outputSignals.length})`)
                    // pendingEffects.forEach(o => updates.set(o, (updates.get(o) ?? 0) + 1))
                    for (const node of pendingEffects) {
                        if (done.has(node)) {
                            const location = null
                            console.error(`Internal Error: Node (${node.diagnosticName()}, ${JSON.stringify(location)}) updated multiple times in the same reactive propagation cycle.`)
                        }
                        done.add(node)
                    }
                    runOnce()
                    // max = [...updates.values()].reduce((a, b) => Math.max(a, b), 0)
                    // if (max > 1) {
                    //     console.error(`Too many nodes processed`)
                    // }
                } while (pendingEffects.length !== 0)
                // } while (pendingEffects.length !== 0 && max <= 1)
                // if (max > 1) {
                //     console.error(`Too many nodes processed`)
                // }
            } while (nextTaskQ.length !== 0)
        }
        finally {
            if (diagnosticInfo !== null && diagnosticInfo.length !== 0) {
                const edges = diagnosticInfo.map((info) => {
                    switch (info.tag) {
                        case "edge": {
                            const { src, dst, label, comment } = info
                            const comment2 = comment === undefined ? "" : `// ${comment.slice(0, 20)}`
                            return `${JSON.stringify(src)} -> ${JSON.stringify(dst)} [label=${JSON.stringify(label)}]; ${comment2}`
                        }
                        case "comment": {
                            const { comment } = info
                            return `// ${comment}`
                        }
                        default:
                            assert.noMissingCases(info)
                    }
                })

                // TODO ? Take fs_writeFileSync as a param ?
                // fs.writeFileSync("nodes-processed.gv", [
                //     "digraph {",
                //     ...edges,
                //     "}",
                //     "",
                // ].join("\n"))
            }

            // diagnosticInfo = null
            diagnosticInfo = []
        }

        // for (const [signal, count] of updates) {
        //     if (count > 1) {
        //         let location = ""
        //         console.error(`Signal (${signal.diagnosticName()}, ${JSON.stringify(location)}) updated multiple times (${count})`)
        //     }
        // }

        const max = [...updates.values()].reduce((a, b) => Math.max(a, b), 0)
        log(`Process Nodes: Iters (${countIters}) Nodes (${countNodes}/${effectNodes.length}/${nodes.length}) Max (${max})`)
        // console.log(`Process Signals Updates: ${updates.size} ${[...updates.entries()].map(([s, c]) => `${s.num}: ${c} `).join(", ")}`)
        // if (max > 1) {
        //     throw new Error(`Curious: runUntilStable: max(${max})`)
        //     // console.log(`Curious: runUntilStable: max(${max})`)
        // }

        delayedTasks_schedule()
    }


    // function scheduleAllEffects() {
    //     for (const o of effectSignals) {
    //         scheduleEffect(o)
    //         // Forget if we've read the previous upstream values.
    //         // This forces isChanged to return true.
    //         // Without this, not all effects will be generated on a page refresh.
    //         for (const [s, w] of o.upstreamWires) {
    //             w.prevOp = "Write"
    //         }
    //     }
    // }
}


export function zeroPadNum(width: number, num: number): string {
    let result = `${num}`
    result = result.padStart(width, "0")
    return result
}

export function currentTime() {
    const now = new Date()
    return `[${zeroPadNum(2, now.getHours())}:${zeroPadNum(2, now.getMinutes())}:${zeroPadNum(2, now.getSeconds())}.${zeroPadNum(3, now.getMilliseconds())}]`
}



// // TODO ? A means of compressing rather than dropping unread deltas.
// // TODO ?   If the deltas compress well (such as a sequence of rotate (or permute) operations),
// // TODO ?     then this might be desirable.
//
// type DeltaCompressor<D> = {
//     nil: D // the delta that performs a no-op on a value
//     add(compressedDelta: D, newDelta: D): D
// }
//
// If a delta represents the differential of a value,
//   then a delta-compressor is close to being an integration.
// Adding up lots of little deltas, makes one-big delta 
//   (which might possibly fully define the value, if no remnants of the unknown/unspecified original value remain).


// TODO ? A resolved state-signal ? 
// TODO ? Currently, if there are multiple writes to the same signal in the same delta-cycle,
// TODO ?   the last write wins, the earlier writes will be overwritten before any further processing occurs.
// TODO ? But what is last? which order is used?  
// TODO ?   The batch processing of mutliple requests also has an impact on this. 
// TODO ?   In some circumstances, earlier writes could be processed after later writes.
// TODO ? We might want a different behaviour,
// TODO ?   such as:
// TODO ?     - take the max of all the drivers
// TODO ?     - collect/concat all the values
// TODO ?     - user-defined custom behaviour
// TODO ? Writes to a state from multiple processes could be banned.
// TODO ?   Instead additional processes to merge states would have to be written by the user.
// TODO ?   But that doesn't resolve the which-is-last issue.
// TODO ? Perhaps wires should keep track of which cycle they where last written to on (and read on?),
// TODO ?   and not just whether the "prevOp" was read or write ?



















//#endregion




