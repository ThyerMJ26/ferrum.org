
//#region Imports and Globals
import { unit } from "../utils/unit.js"
import { getIo, Io } from "../io/io.js"

const DEBUG_MEMO = false
// let DEBUG_MEMO = true

// If the original values used as arguments to memoized functions haven't been hash-consed at origin,
//   this option can help recover some sharing/aliasing. 
//   This helps improve performance (~2x faster).
// If the arguments have been heavily hash-consed (using MemoData.hashCons (typically via hcTy)), 
//   this barely makes a perceptible difference.
// This option interferes with the "Object.freeze(env)" call in primitives.ts.
// If values are frozen, attempting to realias will cause runtime exceptions.
const REALIAS_IMMUTABLE_DATA = false
// const REALIAS_IMMUTABLE_DATA = true

//#endregion



//#region Interface

export type MemoID = number
export type Scalar = null | boolean | number | string
export type Data = Scalar | Data[] | { [_: string]: Data }


export type MemoMap<K extends Data, V extends any> = {
    get: (key: K) => V | undefined
    set: (key: K, value: V) => unit
    clone: () => MemoMap<K, V>
}


export function mk_MemoData(): MemoData {
    return new MemoDataImpl
}

export type MemoData = {

    getMemoID(a: Data): MemoID 
    getData(id: MemoID): Data 

    hashCons<T extends Data>(a: T): T 
    memoizeFunction<D extends any[], R extends Data>(funcName: string, func: ((..._: D) => R)): (..._: D) => R 

    loadFromFile(filename: string): unit 
    saveToFile(): unit 

    // memo-maps don't have names, and aren't saved/loaded from files.
    // The need to persist memo-maps to disk hasn't arisen.
    mkMemoMap<K extends Data, V extends any>(entries?: Iterable<[MemoID, V]>): MemoMap<K, V> 
}


//#endregion



//#region Implementation

type MemoKey = MemoID[]
type MemoTreeElems = [MemoID | null, Map<MemoID, MemoTreeElems> | null]

class MemoTree {
    elems: MemoTreeElems = [null, null]
    clear() {
        this.elems = [null, null]
    }
    get(key: MemoKey): MemoID | undefined {
        let mt = this.elems
        for (let id of key) {
            let nextMt = mt[1]?.get(id)
            if (nextMt === undefined) {
                return undefined
            }
            mt = nextMt
        }
        if (mt === undefined || mt[0] === null) {
            return undefined
        }

        return mt[0]
    }
    set(key: MemoKey, val: MemoID): unit {
        let mt = this.elems
        for (let id of key) {
            if (mt[1] === null) {
                mt[1] = new Map()
            }
            let nextMt = mt[1].get(id)
            if (nextMt === undefined) {
                // nextMt = [null, new Map()]
                nextMt = [null, null]
                mt[1].set(id, nextMt)
            }
            mt = nextMt
        }
        if (mt === undefined) {
            throw new Error("impossible")
        }
        mt[0] = val
    }
    size(): number {
        let result = 0
        let todo = [this.elems]
        while (todo.length !== 0) {
            let [_, m] = todo.pop()!
            if (m !== null && m.size !== 0) {
                result += m.size
                // todo.push(...Array.from(m.values())) // this causes stack overflows
                m.forEach(elem => todo.push(elem) )
            }
        }
        return result
    }
}


type LogLine = 
    ["s", MemoID, Scalar]
    | ["a", MemoID, MemoKey]
    | ["o", MemoID, MemoKey]
    | ["f", string, MemoID, MemoID]
    | ["nextId", number]
    | ["#", ...Data[]]


class MemoDataImpl implements MemoData {
    nextId: MemoID = 1

    dataMemoIn: Map<Data, MemoID> = new Map()
    dataMemoOut: Map<MemoID, Data> = new Map()

    arrayMemo: MemoTree = new MemoTree()
    objectMemo: MemoTree = new MemoTree()

    funcMemo: Map<string, Map<MemoID, MemoID>> = new Map()
    funcStats: { [a: string]: [number, number] } = {}

    // A list of things that need saving, so as only append new things to the memo-file, not overwrite the whole thing everytime.
    toSave: LogLine[] = []
    filename: string | null = null

    // TODO Plumb this through, either:
    // TODO ?  - once when constructing a MemoData instance, or
    // TODO ?  - each time an Io related function is called ?
    io: Io = getIo()

    reset() {
        this.nextId = 1
        this.dataMemoIn.clear()
        this.dataMemoOut.clear()
        // this.scalarMemo.clear()
        this.arrayMemo = new MemoTree
        this.objectMemo = new MemoTree()
        Object.keys(this.funcMemo).forEach(key => {
            this.funcMemo.set(key, new Map())
        })
        Object.keys(this.funcStats).forEach((key => {
            this.funcStats[key] = [0,0]
        }))
        this.toSave.splice(0)
    }

    genId(): MemoID {
        return this.nextId++
    }
    dataToId(a: Data): MemoID {
        let [id, a2] = this.memoizeData(a)
        return id
    }
    idToData(id: MemoID): Data {
        let value = this.dataMemoOut.get(id)
        if (value === undefined) {
            throw new Error(`unknown memo id (${id}), expected (<${this.nextId})`)
        }
        return value
    }
    getMemoID(a: Data): MemoID {
        return this.dataToId(a)
    }
    getData(id: MemoID): Data {
        return this.idToData(id)
    }
    hashCons<T extends Data>(a: T): T {
        let [id, a2] = this.memoizeData(a)
        return a2 as unknown as T
    }
    memoizeFunction<D extends any[], R extends Data>(funcName: string, func: ((..._: D) => R)): (..._: D) => R {
        let memoTable = new Map<MemoID, MemoID>()
        let func2 = (...args: D) => {
            let argsMemoId = this.dataToId(args)
            let resultId = memoTable.get(argsMemoId)
            let debugMemoName = undefined
            if (DEBUG_MEMO && args[0] !== undefined && args[0][0] !== undefined && args[0][0].name) {
                debugMemoName = args[0][0].name
            }
            else if (DEBUG_MEMO && args[0] !== undefined && args[0][0] !== undefined && args[0][0].expr !== undefined && args[0][0].expr.name) {
                debugMemoName = args[0][0].expr.name
            }
            if (DEBUG_MEMO && debugMemoName !== undefined) {
                console.log(`DEBUG MEMO 1 ${debugMemoName} ${argsMemoId} ${resultId}`)
                // console.log(JSON.stringify(args))
            }
            if (debugMemoName==="strTranslate") {
                console.log(`DEBUG MEMO == ${debugMemoName} ==`)
                console.log(JSON.stringify(args))
            }
            if (resultId === undefined) {
                let result2 = func(...args) as unknown as Data
                resultId = this.dataToId(result2)
                memoTable.set(argsMemoId, resultId)
                this.toSave.push(["f", funcName, argsMemoId, resultId])
                this.funcStats[funcName][0]++
            }
            else {
                this.funcStats[funcName][1]++
            }
            if (DEBUG_MEMO && debugMemoName !== undefined) {
                console.log(`DEBUG MEMO 2 ${debugMemoName} ${argsMemoId} ${resultId}`)
            }
            let result = this.idToData(resultId) as unknown as R
            return result
        }

        if (this.funcMemo.has(funcName)) {
            throw new Error(`memoizeFunction: Cannot register the same name (${funcName}) twice.`)
            // memoTable = this.funcMemo.get(funcName)!
        }
        this.funcMemo.set(funcName, memoTable)
        this.funcStats[funcName] = [0, 0]
        return func2
    }

    mkMemoMap<K extends Data, V extends any>(entries?: Iterable<[MemoID, V]>): MemoMap<K, V> {
        let memoTable = new Map<MemoID, V>(entries)
        return {
            get: (key: K) => {
                let keyId = this.dataToId(key)
                let value = memoTable.get(keyId)
                return value
            },
            set: (key: K, value: V) => {
                let keyId = this.dataToId(key)
                memoTable.set(keyId, value)
            },
            clone: () => {
                return this.mkMemoMap(memoTable.entries())
            }
        }
    }

    loadLine(line: string): unit {
        if (line === "") {
            return
        }
        let items = JSON.parse(line)
        switch (items[0]) {
            case "#":
                break
            case "nextId":
                this.nextId = items[1]
                break
            case "s":
            case "scalar": {
                let [tag, id, val] = items
                this.dataMemoOut.set(id, val)
                this.dataMemoIn.set(val, id)
                break
            }
            case "a":
            case "array": {
                let [tag, id, keys] = items
                this.arrayMemo.set(keys, id)
                let arrayVal = keys.map((a: MemoID) => this.idToData(a))
                this.dataMemoOut.set(id, arrayVal)
                this.dataMemoIn.set(arrayVal, id)
                break
            }
            case "o":
            case "object": {
                let [tag, id, [namesArrayId, ...valueIds]] = items
                let names = this.idToData(namesArrayId) as string[]
                let values = valueIds.map((id: MemoID) => this.idToData(id))
                let keys = [namesArrayId, ...valueIds]
                this.objectMemo.set(keys, id)
                let objVal: { [a: string]: any } = {}
                if (names.length !== values.length) {
                    throw new Error("impossible")
                }
                for (let i = 0; i < names.length; i += 1) {
                    let name = names[i] as string
                    let val = values[i]
                    objVal[name] = val
                }
                this.dataMemoOut.set(id, objVal)
                this.dataMemoIn.set(objVal, id)
                break
            }
            case "f":
            case "func": {
                let [tag, funcName, argId, resultId] = items
                let funcMemo = this.funcMemo.get(items[1])
                if (funcMemo === undefined) {
                    funcMemo = new Map()
                    this.funcMemo.set(funcName, funcMemo)
                }
                funcMemo.set(argId, resultId)
                break
            }
            default:
                throw new Error(`unknown tag (${items[0]}) in memo file`)
        }

    }

    loadFromFile(filename: string): unit {
        try {
            this.filename = filename
            let fd = this.io.file_open(filename, "a+")
            const fileSize = this.io.fd_size(fd)
            // let fileStats = io.f_fstat(fd)
            // console.log("File Stats", JSON.stringify(fileStats))

            if (fileSize === 0) {
                return 
            }
            else {
                this.reset()
            }

            let maxRead = 1 << 20
            let bufferStr = ""
            let bufferBytes = Buffer.alloc(maxRead)
            let bytesread
            let position = 0
            do {
                bytesread = this.io.fd_read(fd, bufferBytes, 0, maxRead, position)
                bufferStr += bufferBytes.subarray(0, bytesread).toString()
                let lines = bufferStr.split("\n")
                let lastLine = lines[lines.length - 1]
                lines.pop()
                lines.forEach((line) => {
                    try {
                        this.loadLine(line)
                    }
                    catch (exc) {
                        let exc2 = exc as Error
                        console.log("failed to load memo line: ", exc2.message)
                        throw new Error("failed to load memo line: " + exc2.message)
                    }
                })
                bufferStr = lastLine
                position += bytesread
            }
            while (bytesread !== 0)
            this.io.fd_close(fd)
        }
        catch (exc) {
            let exc2 = exc as Error
            console.log("memo file read failed:", exc2.message)
            throw exc2
        }
    }

    saveToFile(): unit {
        const io = this.io
        if (this.filename===null) {
            throw new Error("load must be called first")
        }
        let fd = io.file_open(this.filename, "a")
        let maxWrite = 1 << 20
        let buffer = ""
        function log(...args: any[]) {
            let line = JSON.stringify(args) + "\n"
            if (buffer.length + line.length >= maxWrite) {
                io.fd_append(fd, buffer)
                buffer = ""
            }
            buffer += line
        }
        function flush() {
            io.fd_append(fd, buffer)
            io.fd_close(fd)
        }

        if (this.toSave.length === 0) {
            return
        }

        log("nextId", this.nextId)

        this.toSave.forEach(line => {
            log(...line)
        })
        // empty the toSave list, as all the entries have just been saved
        this.toSave.splice(0)

        // TODO ? move this header/footer info to after the log/toSave lines ? Only the latest version is valid, previous versions are invalidated
        // TODO skip writing this header/footer if there is nothing to save
        log("#", "memo cache")
        log("#", "next", this.nextId)
        log("#", "dataMemoIn", this.dataMemoIn.size)
        log("#", "dataMemoOut", this.dataMemoIn.size)
        // log("#", "scalar", this.scalarMemo.size)
        log("#", "array", this.arrayMemo.size())
        log("#", "object", this.objectMemo.size())
        // log("#", "array", this.arrayMemo.elems[1]?.size)
        // log("#", "object", this.objectMemo.elems[1]?.size)
        log("#", "stats", this.funcStats)

        flush()
    }

    // mtGetOrAdd(mt: MemoTree, key: MemoID[], val: Data): MemoID {
    //     let id = mt.get(key)
    //     if (id === undefined) {
    //         id = this.genId()
    //         mt.set(key, id)
    //         this.dataMemoIn.set(val, id)
    //         this.dataMemoOut.set(id, val)
    //     }
    //     // TODO ? return the existing value as well, if present
    //     // so as to stop using an identical but unmapped value
    //     return id
    // }

    addNewData(tag: "s"|"a"|"o", key: Scalar|MemoKey, val: Data): MemoID {
        let id = this.genId()
        this.dataMemoIn.set(val, id)
        this.dataMemoOut.set(id, val)
        let logLine = [tag, id, key] as LogLine
        this.toSave.push(logLine)
        return id
    }

    memoizeData(a: Data): [MemoID, Data] {
        let id = this.dataMemoIn.get(a)
        if (id !== undefined) {
            let data2 = this.dataMemoOut.get(id)
            if (data2 === undefined) {
                throw new Error("impossible")
            }
            return [id, data2]
        }
        else if (isScalar(a)) {
            // TODO we might not need to use the scalarMemo at all,
            // TODO   surely this is duplicating data already in the more general dataMemoIn table
            let a2 = a as Scalar
            // let id = this.scalarMemo.get(a2)
            let id = this.dataMemoIn.get(a2)
            if (id === undefined) {
                id = this.addNewData("s", a2, a2)
                // this.scalarMemo.set(a2, id)
            }
            return [id, a]
        }
        else if (a instanceof Array) {
            let key: MemoID[] = []
            a.forEach((val, i) => {
                let [id, val2] = this.memoizeData(val)
                key.push(id)
                if (REALIAS_IMMUTABLE_DATA) {
                    a[i] = val2
                }
            })
            let id = this.arrayMemo.get(key)
            if (id===undefined) {
                id = this.addNewData("a", key, a)
                this.arrayMemo.set(key, id)
            }
            // let id = this.mtGetOrAdd(this.arrayMemo, key, a)
            let a3 = this.dataMemoOut.get(id)
            if (a3 === undefined) {
                throw new Error("impossible")
            }
            return [id, a3]
        }
        else if (a instanceof Object) {
            let namesId = this.dataToId(Object.keys(a))
            let key = [namesId]
            Object.entries(a).forEach(([name, val]) => {
                // let name2 = memoizeData(memo, name)
                let [id, val2] = this.memoizeData(val)
                key.push(id)
                if (REALIAS_IMMUTABLE_DATA) {
                    a[name] = val2
                }
            })
            let id = this.objectMemo.get(key)
            if (id===undefined) {
                id = this.addNewData("o", key, a)
                this.objectMemo.set(key, id)
            }
            // let id = this.mtGetOrAdd(this.objectMemo, key, a)
            let a3 = this.dataMemoOut.get(id)
            if (a3 === undefined) {
                throw new Error("impossible")
            }
            return [id, a3]
        }
        else {
            throw new Error(`Memoization error, invalid data (${typeof (a)})`)
        }
    }

}


function isScalar(a: Data): boolean {
    switch (typeof a) {
        case "boolean":
        case "number":
        case "string":
            return true
        case "object":
            return a === null
        default:
            throw new Error(`isScalar: Unexpected argument type (${typeof a}).`)
    }
}


//#endregion

