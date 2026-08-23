import { assert } from "../utils/assert.js";
const zeroStamp = 0;
class Wire {
    // TODO ? Tag the wires ?
    // TODO ? Each wire is:
    // TODO ?   - either actively read    (the value is pulled through), 
    // TODO ?   - or     actively written (the value is pushed through).
    // TODO ? However, it is always possible to infer this from 
    // TODO ?   the readability and writability of the upstream and downstream nodes, respectively.
    // tag: "Push" | "Pull"
    upstream;
    downstream;
    prevOp = "Write";
    value = undefined;
    delta;
    writeStamp = zeroStamp;
    readStamp = zeroStamp;
    constructor(upstream, downstream) {
        this.upstream = upstream;
        this.downstream = downstream;
    }
}
// | "transient" | "resolved" | "pull" | "push" | "external"
class NodeBaseImpl {
    upstreamWires = new Map;
    downstreamWires = new Map;
    tag;
    num;
    name;
    valid = false;
    timestamp = -1;
    ric;
    constructor(tag, num, name, ric) {
        this.tag = tag;
        this.num = num;
        this.name = name;
        this.ric = ric;
    }
    diagnosticName() {
        let name = `S${this.tag[0]}${this.num}`;
        // let name = `S${this.tag[0]}${this.tag.at(-1)}${this.num}`
        if (this.name !== null) {
            name += `_${this.name}`;
        }
        return name;
    }
    invalidateDownstream() {
        // Prune the invalidation traversal, if the signal is already invalid.
        if (!this.valid) {
            return;
        }
        // Prune the invalidation traversal, if the signal is in the process of being evaluated
        if (this.ric.inNodeStack(this)) {
            return;
        }
        const pruneUnreadWires = this.isReadable();
        for (const [s, w] of this.downstreamWires) {
            // We only need to propagate this to downstream signals/listeners
            //   that read the previous value
            // We only do this pruning if the value was pulled through the wire (actively read), not pushed (actively written).
            // Values that are pushed are assumed to be implicitly immediately read by the state (or push) signal downstream.
            //   (Possibly implicitly read wires should be immediately marked as (prevOp = "Read"), then we wouldn't need this pruneUnreadWires condition)
            if (pruneUnreadWires && w.prevOp === "Write") {
                continue;
            }
            if (this.ric.inNodeStack(s)) {
                continue;
            }
            // console.log(`Invalidating signal: (${this.diagnosticName()}) -> (${s.diagnosticName()})`)
            // this.ric.addDiagnosticInfo(this.diagnosticName(), s.diagnosticName(), "invalidate")
            s.invalidateDownstream();
            s.valid = false;
        }
    }
}
class NodeReadableImpl extends NodeBaseImpl {
    initVal;
    value;
    constructor(tag, num, name, ric, initVal) {
        super(tag, num, name, ric);
        this.initVal = initVal;
        this.value = initVal;
    }
    r() { return this; }
    isReadable() { return true; }
    read() {
        this.update();
        const wire = this.ric.getWire_connectIfNeeded(this);
        if (wire !== null) {
            wire.prevOp = "Read";
            // console.log(`${this.diagnosticName()} -get-> ${wire.downstream.diagnosticName()}`)
            // this.ric.addDiagnosticInfo(this.diagnosticName(), wire.downstream.diagnosticName(), "read", JSON.stringify(this.value))
        }
        return this.value;
    }
    delta() {
        this.update();
        const wire = this.ric.getWire_connectIfNeeded(this);
        if (wire !== null) {
            wire.prevOp = "Read";
            // console.log(`${this.diagnosticName()} -get-> ${wire.downstream.diagnosticName()}`)
            // this.ric.addDiagnosticInfo(this.diagnosticName(), wire.downstream.diagnosticName(), "delta", JSON.stringify(wire.delta))
            return wire.delta;
        }
        return undefined;
    }
    fresh() {
        this.update();
        const wire = this.ric.getWire_connectIfNeeded(this);
        if (wire !== null) {
            const prevOp = wire.prevOp;
            wire.prevOp = "Read";
            const result = prevOp === "Write";
            // console.log(`${this.diagnosticName()} -get-> ${wire.downstream.diagnosticName()}`)
            // this.ric.addDiagnosticInfo(this.diagnosticName(), wire.downstream.diagnosticName(), "active", JSON.stringify(result))
            return result;
        }
        return true;
    }
}
class NodeStateImpl extends NodeReadableImpl {
    constructor(tag, num, name, ric, initVal) {
        super(tag, num, name, ric, initVal);
    }
    w() { return this; }
    rw() { return this; }
    isWritable() { return true; }
    isEffectful() { return false; }
    writablePorts() { return [this.w()]; }
    update() {
        if (!this.valid) {
            this.ric.nodeStack_pushPop(this, () => {
                for (const [o,] of this.upstreamWires) {
                    o.update();
                }
            });
            this.valid = true;
        }
    }
    write(value, delta) {
        const writer = this.ric.nodeStack_peek();
        assert.isTrue(writer === null || writer instanceof NodeProcessImpl);
        if (writer !== null) {
            // console.log(`${writer.diagnosticName()} -set-> ${this.diagnosticName()}`)
            // this.ric.addDiagnosticInfo(writer.diagnosticName(), this.diagnosticName(), "write", JSON.stringify(value))
            if (writer.downstreamWires.get(this) === undefined) {
                console.error(`Bad write from process signal (S${writer.num}): attempt to set signal (S${this.num}) without declaring it upfront.`);
                throw new Error(`Bad write from process signal (S${writer.num}): attempt to set signal (S${this.num}) without declaring it upfront.`);
            }
        }
        else {
            // console.log(`"EXTERNAL" -set-> ${this.diagnosticName()}`)
            // this.ric.addDiagnosticInfo("", this.diagnosticName(), "write", JSON.stringify(value))
        }
        const writeTimestamp = Math.max(0, writer?.timestamp) ?? this.ric.getNewTimestamp();
        if (writeTimestamp < this.timestamp) {
            // If this is a write from the past, return early.
            // We can safely ignore this write.
            return;
        }
        if (writeTimestamp === this.timestamp) {
            console.error(`Warning multiple writes to the same signal (${this.diagnosticName()}) have the same timestamp (${this.timestamp}), the correct value to use is ambiguous.`);
            // We could return early here, or continue.
            // Both are wrong!
            // TODO ? Or set the value back to the initial value, this avoids favouring either of the "wrong" values ?
            // this.value = value
            this.value = this.initVal;
        }
        else {
            this.value = value;
        }
        this.valid = true;
        this.timestamp = writeTimestamp;
        if (this.name !== null) {
            this.ric.persistentState.set(this.name, this.value);
        }
        this.invalidateDownstream();
        // TODO ? invalidateDownstream could just as well be implemented in the mkReactive function.
        // TODO ?   There's no real need for it to be overridable.
        // this.ric.invalidateDownstream(this)
        for (const [, d] of this.downstreamWires) {
            if (d.prevOp === "Read") {
                // If the previous value or delta was read, then this next delta can be used.
                d.delta = delta;
            }
            else {
                // If the previous value and delta were ignored, then this delta cannot be used.
                //   (unless there is a delta-compressor available)
                d.delta = undefined;
            }
            d.prevOp = "Write";
        }
    }
}
class NodeComputeImpl extends NodeReadableImpl {
    compute;
    constructor(tag, num, name, ric, initVal, compute) {
        super(tag, num, name, ric, initVal);
        this.compute = compute;
    }
    isWritable() { return false; }
    isEffectful() { return false; }
    writablePorts() { return []; }
    update() {
        if (this.valid) {
            return;
        }
        this.ric.nodeStack_pushPop(this, () => {
            try {
                this.value = this.compute();
            }
            catch (exc) {
                console.error(`Reactive Computation Callback failed: ${exc}`);
                // If the computation throws an exception, 
                //   revert to using the very initial value (typically something benign such as null or [])
                // This should be better than limping on with the app/ui in an inconsistent old/new state.
                this.value = this.initVal;
            }
        });
        for (const [, d] of this.downstreamWires) {
            d.prevOp = "Write";
        }
        this.valid = true;
    }
}
class NodeProcessImpl extends NodeBaseImpl {
    callback;
    constructor(tag, num, name, ric, callback) {
        super(tag, num, name, ric);
        this.callback = callback;
    }
    isReadable() { return false; }
    isWritable() { return false; }
    isEffectful() { return false; }
    writablePorts() { return []; }
    update() {
        if (this.valid) {
            return;
        }
        this.ric.nodeStack_pushPop(this, () => {
            this.callback();
        });
        this.valid = true;
    }
}
class NodeEffectImpl extends NodeProcessImpl {
    isEffectful() { return true; }
    invalidateDownstream() {
        this.ric.scheduleEffect(this);
    }
}
export function mkReactive(persistentState, log, notify) {
    // let diagnosticInfo: DiagnosticInfo[] | null = null
    let diagnosticInfo = [];
    function addDiagnosticInfo(src, dst, label, comment) {
        if (diagnosticInfo === null) {
            return;
        }
        diagnosticInfo.push({ tag: "comment", comment: `${nodeStack.map(s => s.diagnosticName()).join(" ")}` });
        diagnosticInfo.push({ tag: "edge", src, dst, label, comment });
    }
    const effectNodes = [];
    let pendingEffects = [];
    let pendingEffectsInProgress = [];
    const nodeNames = new Set;
    const nodes = [];
    const nodeStack = [];
    const nextTaskQ = [];
    const laterTaskQ = [];
    const delayedTaskQ = [];
    // The browser and NodeJS setTimeout functions differ in what they return.
    //   (this should work as-is, so long the timer timeoutID is only used in calls to clearTimeout, and nothing else.)
    let delayedTask_timerId = null;
    let delayedTask_nextTime = null;
    let delayedTask_nextDelay = null;
    // let laterTasks_immediateId: NodeJS.Immediate | null = null
    // Using a 0ms setTimeout instead of setimmediate, so as to get this running in the browser.
    let laterTasks_immediateId = null;
    function addDelayedTask(node, delayMs, callback) {
        const now = Date.now();
        const time = now + delayMs;
        const task = { node, time, callback };
        // Place the new task in the queue
        //   after  tasks which are due later   than this new task, and
        //   before tasks which are due earlier than this new task.
        // We can either search from the start, skipping past later tasks, to find the first earlier (if any).
        const pos = delayedTaskQ.findIndex((t) => t.time < time);
        // Or start from the end, skipping past earlier tasks, to find the last (last from the end, first from the start) earlier task (if any).
        // let pos = delayedTaskQ.length
        // while (pos > 0 && delayedTaskQ[pos-1].time < time) { --pos }
        if (pos === -1 || pos === delayedTaskQ.length) {
            delayedTaskQ.push(task);
        }
        else {
            delayedTaskQ.splice(pos, 0, task);
        }
    }
    let timestamp = 0;
    const reactiveImplCallback = {
        inNodeStack,
        scheduleEffect,
        nodeStack_pushPop,
        nodeStack_peek,
        getWire_connectIfNeeded,
        persistentState,
        addDiagnosticInfo,
        getNewTimestamp,
    };
    const reactive = {
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
    };
    return reactive;
    function getNewTimestamp() {
        timestamp += 1;
        return timestamp;
    }
    function nodeStack_peek() {
        return nodeStack.at(-1) ?? null;
    }
    function nodeStack_pushPop(node, fn /*, excHandler?: () => unit */) {
        assert.isTrue(!inNodeStack(node), () => {
            const chain = [...nodeStack, node].map(s => s.diagnosticName()).join(" -> ");
            return `SignalStack: cyclic dependency detected (${chain})`;
        });
        nodeStack.push(node);
        try {
            fn();
        }
        catch (exc) {
            console.error(`Callback failed: ${exc}`);
            // if (excHandler !== undefined) {
            //     excHandler()
            // }
        }
        finally {
            const popped = nodeStack.pop();
            assert.isTrue(popped === node, `NodeStack: mismatch between node pushed and node popped`);
        }
    }
    function inNodeStack(node) {
        // TODO ? use an "inProgress" flag in each signal, rather than scanning the stack ?
        return nodeStack.indexOf(node) !== -1;
    }
    function scheduleEffect(effect) {
        // console.log("scheduleEffect: ", effect.diagnosticName())
        assert.isTrue(effect.downstreamWires.size === 0);
        // TODO ? Don't use/abuse "valid" for this ?
        // TODO ?   Have a separate "isScheduled" flag ?
        if (effect.valid) {
            effect.valid = false;
            pendingEffects.push(effect);
        }
    }
    function connectNodes(up, dn) {
        const dnWire = up.downstreamWires.get(dn);
        const upWire = dn.upstreamWires.get(up);
        assert.isTrue(upWire === dnWire, "connectNodes: inconsistent wiring detected");
        assert.isTrue(upWire === undefined, "connectNodes: already connected");
        const wire = new Wire(up, dn);
        up.downstreamWires.set(dn, wire);
        dn.upstreamWires.set(up, wire);
        return wire;
    }
    function getWire_connectIfNeeded(up) {
        const dn = nodeStack_peek(); // as SignalProcessImpl
        assert.isTrue(dn === null || dn instanceof NodeProcessImpl || dn instanceof NodeComputeImpl);
        if (up === null || dn === null) {
            return null;
        }
        const dnWire = up.downstreamWires.get(dn);
        const upWire = dn.upstreamWires.get(up);
        assert.isTrue(upWire === dnWire, "getWire_connectIfNeeded: inconsistent wiring detected");
        if (upWire === undefined) {
            return connectNodes(up, dn);
        }
        dn.timestamp = Math.max(0, dn.timestamp, up.timestamp);
        return upWire;
    }
    function registerNodeName(name) {
        if (name === null) {
            return;
        }
        if (nodeNames.has(name)) {
            throw new Error(`Signal name (${name}) is already in use.`);
        }
        nodeNames.add(name);
    }
    function state(name, initVal) {
        registerNodeName(name);
        const nodeNum = nodes.length;
        if (name !== null) {
            // TODO Decouple: 
            // TODO   - node names being used for info/diagnostic reasons,
            // TODO   - and names being given as a means of persistence.
            // TODO ? Decouple persistence from reactive completely ?
            // TODO ?   Have an external means of persistence that is passed nodes states to persist ?
            initVal = persistentState.get(name) ?? initVal;
        }
        const node = new NodeStateImpl("state", nodeNum, name, reactiveImplCallback, initVal);
        // node.valid = false
        nodes.push(node);
        return node;
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
    function compute(name, value, compute) {
        registerNodeName(name);
        const nodeNum = nodes.length;
        const node = new NodeComputeImpl("compute", nodeNum, name, reactiveImplCallback, value, compute);
        nodes.push(node);
        return node;
    }
    function process(name, downstream, callback) {
        registerNodeName(name);
        const nodeNum = nodes.length;
        const process = new NodeProcessImpl("process", nodeNum, name, reactiveImplCallback, callback);
        nodes.push(process);
        // State nodes that are downstream from the process node must be explicitly declared.
        // Upstream state nodes can be auto-tracked/wired.
        // That is: "read"s are wired automatically, "write"s must be declared upfront.
        for (const port of downstream) {
            // At present all ports are actually nodes in disguise.
            // This is an implementation detail.
            // If this implementation detail ever changes, 
            //   the code on the next line will need changing too.
            const node = port;
            nodeStack_pushPop(node, () => {
                connectNodes(process, node);
            });
        }
        return process;
    }
    function effect(name, callback) {
        registerNodeName(name);
        const nodeNum = nodes.length;
        const effect = new NodeEffectImpl("effect", nodeNum, name, reactiveImplCallback, callback);
        nodes.push(effect);
        effectNodes.push(effect);
        pendingEffects.push(effect);
        return effect;
    }
    function next(callback) {
        const node = nodeStack_peek();
        assert.isTrue(node !== null && node instanceof NodeEffectImpl, "next must be called from an effectful signal.");
        nextTaskQ.push({ node: node, callback });
    }
    function later(callback) {
        const node = nodeStack_peek();
        // assert.isTrue(signal !== null && signal instanceof SignalEffectImpl, "later must be called from an effectful signal.")
        assert.isTrue(node === null || node instanceof NodeEffectImpl, "later must be called from an effectful signal.");
        laterTaskQ.push({ node: node, callback });
    }
    function delay(delayMs, callback) {
        const node = nodeStack_peek();
        assert.isTrue(node !== null && node instanceof NodeEffectImpl, "delay must be called from an effectful signal.");
        const time = Date.now() + delayMs;
        addDelayedTask(node, delayMs, callback);
    }
    function runNextTasks() {
        for (const task of nextTaskQ) {
            task.callback();
        }
        nextTaskQ.length = 0;
    }
    function runLaterTasks() {
        const workQ = laterTaskQ.splice(0);
        for (const task of workQ) {
            const p = task.callback();
            if (p instanceof Promise) {
                p.then(() => {
                    // After the promise completes,
                    //   we must execute "runUntilStable(); notify()", but, ideally, not more often than needed.
                    // Conditionally scheduling another call to "runLaterTasks()" achieves this.
                    if (laterTasks_immediateId === null) {
                        later(() => { });
                        delayedTasks_schedule();
                    }
                });
            }
        }
        runUntilStable();
        notify();
    }
    // TODO Check and perform the delayed effects.
    // TODO   This should occur after the immediate effects have been communicated back to the client.
    // TODO   Either the delayed effects need to occur concurrently, between client-requests, ( or screen-updates ),
    // TODO     and then sent back to the client using a server-sent event (SSE).
    // TODO   Or, if the client is busy-polling, the delayed effects can be performed at the start of the next request / poll.
    function runDelayedTasks() {
        const now = Date.now();
        // console.log(`${currentTime()} runDelayedTasks: ${delayedTaskQ.length}`)
        log(`runDelayedTasks: ${delayedTaskQ.length}`);
        let task;
        while ((task = delayedTaskQ.pop()) && task.time <= now) {
            task.callback();
        }
        runUntilStable();
        notify();
        delayedTasks_schedule();
    }
    // TODO Take notify as an argument to mkReactive rather than plumb it through to runDelayedTasks and runLaterTasks.
    // TODO It's the same notification function, it doesn't change.
    function delayedTasks_schedule() {
        if (delayedTaskQ.length === 0 && laterTaskQ.length === 0) {
            return;
        }
        if (delayedTaskQ.length !== 0) {
            const earliest = delayedTaskQ[delayedTaskQ.length - 1].time;
            // TODO ? Before stopping and restarting the timeout, check if we're just setting it to the same time. ?
            delayedTasks_stop();
            const now = Date.now();
            const delay = earliest - now;
            delayedTask_timerId = setTimeout(() => {
                delayedTask_timerId = null;
                runDelayedTasks();
            }, delay);
            delayedTask_nextTime = earliest;
            delayedTask_nextDelay = delay;
            // console.log(`${currentTime()} delayedEffects_schedule, ${delay}`)
        }
        if (laterTaskQ.length !== 0) {
            clearTimeout(laterTasks_immediateId ?? undefined);
            laterTasks_immediateId = setTimeout(() => {
                laterTasks_immediateId = null;
                runLaterTasks();
            }, 0);
        }
    }
    function delayedTasks_stop() {
        if (delayedTask_timerId !== null) {
            clearTimeout(delayedTask_timerId);
            delayedTask_timerId = null;
            delayedTask_nextTime = null;
            delayedTask_nextDelay = null;
        }
    }
    function runOnce() {
        // In the process of calling the callbacks, signals can become invalidated and listeners become pending again.
        // We need to make sure not to be emptying the same pending list that we're adding to.
        // TODO Until delayed writes in signals are implemented, 
        // TODO   writes should now be sufficiently well tracked that this loop is only ever executed once ?
        pendingEffectsInProgress = pendingEffects;
        pendingEffects = [];
        // console.log("Notify: ", pendingListenersInProgress.map(l => l.num))
        while (pendingEffectsInProgress.length !== 0) {
            const o = pendingEffectsInProgress.pop();
            if (!o.valid && o.callback !== null) {
                o.valid = true;
                if (nodeStack.length !== 0) {
                    throw new Error("impossible?");
                }
                const callback = o.callback;
                nodeStack_pushPop(o, () => {
                    try {
                        callback();
                    }
                    catch (exc) {
                        console.error(`Node callback failed: ${exc}`);
                    }
                });
            }
        }
        return pendingEffects.length === 0;
    }
    function runUntilStable() {
        let countIters = 0;
        let countNodes = 0;
        const updates = new Map;
        // diagnosticInfo = []
        try {
            do {
                runNextTasks();
                // let max = 0
                const done = new Set;
                do {
                    // pendingOutputs = pendingOutputs.filter(o => o.valid === false)
                    // pendingOutputs = [...new Set(pendingOutputs)]
                    countNodes += pendingEffects.length;
                    countIters += 1;
                    // console.log(`Process Signals: ${pendingOutputs.map(o => o.num)}`)
                    // console.log(`Process Signals: ${pendingOutputs.map(o => o.name)}`)
                    // console.log(`Process Signals Count: Iters (${countIters}) Signals (${countSignals}/${outputSignals.length})`)
                    // pendingEffects.forEach(o => updates.set(o, (updates.get(o) ?? 0) + 1))
                    for (const node of pendingEffects) {
                        if (done.has(node)) {
                            const location = null;
                            console.error(`Internal Error: Node (${node.diagnosticName()}, ${JSON.stringify(location)}) updated multiple times in the same reactive propagation cycle.`);
                        }
                        done.add(node);
                    }
                    runOnce();
                    // max = [...updates.values()].reduce((a, b) => Math.max(a, b), 0)
                    // if (max > 1) {
                    //     console.error(`Too many nodes processed`)
                    // }
                } while (pendingEffects.length !== 0);
                // } while (pendingEffects.length !== 0 && max <= 1)
                // if (max > 1) {
                //     console.error(`Too many nodes processed`)
                // }
            } while (nextTaskQ.length !== 0);
        }
        finally {
            if (diagnosticInfo !== null && diagnosticInfo.length !== 0) {
                const edges = diagnosticInfo.map((info) => {
                    switch (info.tag) {
                        case "edge": {
                            const { src, dst, label, comment } = info;
                            const comment2 = comment === undefined ? "" : `// ${comment.slice(0, 20)}`;
                            return `${JSON.stringify(src)} -> ${JSON.stringify(dst)} [label=${JSON.stringify(label)}]; ${comment2}`;
                        }
                        case "comment": {
                            const { comment } = info;
                            return `// ${comment}`;
                        }
                        default:
                            assert.noMissingCases(info);
                    }
                });
                // TODO ? Take fs_writeFileSync as a param ?
                // fs.writeFileSync("nodes-processed.gv", [
                //     "digraph {",
                //     ...edges,
                //     "}",
                //     "",
                // ].join("\n"))
            }
            // diagnosticInfo = null
            diagnosticInfo = [];
        }
        // for (const [signal, count] of updates) {
        //     if (count > 1) {
        //         let location = ""
        //         console.error(`Signal (${signal.diagnosticName()}, ${JSON.stringify(location)}) updated multiple times (${count})`)
        //     }
        // }
        const max = [...updates.values()].reduce((a, b) => Math.max(a, b), 0);
        log(`Process Nodes: Iters (${countIters}) Nodes (${countNodes}/${effectNodes.length}/${nodes.length}) Max (${max})`);
        // console.log(`Process Signals Updates: ${updates.size} ${[...updates.entries()].map(([s, c]) => `${s.num}: ${c} `).join(", ")}`)
        // if (max > 1) {
        //     throw new Error(`Curious: runUntilStable: max(${max})`)
        //     // console.log(`Curious: runUntilStable: max(${max})`)
        // }
        delayedTasks_schedule();
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
export function zeroPadNum(width, num) {
    let result = `${num}`;
    result = result.padStart(width, "0");
    return result;
}
export function currentTime() {
    const now = new Date();
    return `[${zeroPadNum(2, now.getHours())}:${zeroPadNum(2, now.getMinutes())}:${zeroPadNum(2, now.getSeconds())}.${zeroPadNum(3, now.getMilliseconds())}]`;
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
//# sourceMappingURL=reactive.js.map