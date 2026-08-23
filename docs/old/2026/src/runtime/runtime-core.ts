
import { assert } from "../utils/assert.js"

let console_log = console.log
// let console_log = console.error



type FeNil = null
type FePair = [FeValue, FeValue]

type FeFunc<D extends FeValue = never, C extends FeValue = FeValue> = (a: D) => C
type FeType = TypeDefn

export type FeValue =
    | FeNil
    | boolean
    | number
    | string
    | FePair
    // | FeFunc<never>
    | ((a: never) => FeValue)
    | FeType


type FeNo = null
type FeYes<T extends FeValue> = [T, FeNil]
type FeMaybe<T extends FeValue = FeValue> = FeNo | [T, FeNil]
type FeList<T extends FeValue = FeValue> = FeNo | [T, FeList<T>]

type FeTuple<T extends FeValue[]> =
    T extends [infer First, ...infer Rest extends FeValue[]]
    ? [First, FeTuple<Rest>]
    : null

type FeTuple1 = FeTuple<[FeValue]>
type FeTuple2 = FeTuple<[FeValue, FeValue]>

export type FeData =
    | FeNil
    | boolean
    | number
    | string
    | [FeData, FeData]

export type JsData =
    | boolean
    | number
    | string
    | JsData[]



// let listJsToFe = (elems) => elems.reduceRight((list, elem) => [elem, list], null)

// This turns a FeList into a conventional JS list.
// The elements are untouched and remain as FeValues.
function feList_toList<T extends FeValue>(elems: FeList<T>): T[] {
    let result: T[] = []
    while (elems instanceof Array) {
        result.push(elems[0])
        elems = elems[1]
    }
    if (elems !== null) {
        throw new Error(`expected null at the end of a list, not (${elems})`)
    }
    return result
}

export function feData_fromJson(data: JsData): FeData {
    if (data instanceof Array) {
        let listFe: FeData = null
        for (const elemJs of data.slice().reverse()) {
            const elemFe = feData_fromJson(elemJs)
            listFe = [elemFe, listFe]
        }
        return listFe
    }
    else {
        // TODO ? check this is a valid form of data
        assert.isTrue(isDatum(data))
        return data
    }
}

export function feData_toJson(data: FeData): JsData {
    if (data === null) {
        return []
    }
    else if (data instanceof Array) {
        let listJs = []
        while (data instanceof Array) {
            let elemFe = data[0]
            let elemJs = feData_toJson(elemFe)
            listJs.push(elemJs)
            data = data[1]
        }
        if (data !== null) {
            throw new Error("Irregular list not supported")
        }
        return listJs
    }
    else {
        // TODO ? check this is a valid form of data
        assert.isTrue(isDatum(data))
        return data
    }
}


// export interface DataAdaptor<T> {
//     toJs: (data: T) => DataJs
//     fromJs: (data: DataJs) => T
// }

// export const identityDataAdaptor: DataAdaptor<DataJs> = {
//     toJs: (data: DataJs) => data,
//     fromJs: (data: DataJs) => data
// }

// export const ferrumDataAdaptor: DataAdaptor<DataFe> = {
//     toJs: (data: DataFe) => dataFeToJs2(data),
//     fromJs: (data: DataJs) => dataJsToFe2(data)
// }




// least fixed-point combinator
// const fix = (f) => (x) => f(fix(f))(x)
// let fix = (f) => {
//     let ff = (x) => 
//         f(ff)(x);
//     return f(ff)
// }
// this might be very slightly faster (or it might just be noise)
// let fix = (f: FeFunc<FeValue, FeFunc<FeValue>>) => {
//     const ff = (x: FeValue) => fff(x);
//     const fff = f(ff);
//     return fff
// }

// fix f = x -> f (fix f) x
function fix(f: FeFunc<FeValue, FeFunc<FeValue>>) {
    const ff = (x: FeValue) => fff(x);
    const fff = f(ff);
    return fff
}

// fix f x = f (x -> fix f x) x
const fix2 = (f: FeFunc<FeValue, FeFunc<FeValue>>) => (x: FeValue): FeValue => {
    return f(x => fix2(f)(x))(x)
}

// function fix(f: FeFunc<FeValue, FeFunc<FeValue>>) {
//     return (x: FeValue) => f(fix(f))(x)
// }


let loop1 = (f: FeFunc<FeValue, FeTuple2>) => (x: FeValue) => {
    let [tag, [value,]] = f(x)
    while (tag === 'continue') {
        [tag, [value,]] = f(value)
    }
    if (tag !== 'break') {
        throw new Error(`loop body must return either a "break" tag or a "continue" tag, not (${tag})`)
    }
    return value
}

let loop2 = (x: FeValue) => (f: FeFunc<FeValue, FeTuple2>) => loop1(f)(x)

let primContinue = (value: FeValue): FeValue => (['continue', [value, null]])
let primBreak = (value: FeValue): FeValue => (['break', [value, null]])

let grLoop = (v: FeTuple2, f: FeFunc<FeValue, FeTuple2>) => {
    let [tag, [value,]] = v
    while (tag === 'continue') {
        [tag, [value,]] = f(value)
    }
    if (tag !== 'break') {
        throw new Error(`loop body must return either a "break" tag or a "continue" tag, not (${tag})`)
    }
    return value
}

let grWhile = (a: FeMaybe, b: FeValue, f: FeFunc<FeValue, FeMaybe>) => {
    while (a !== null) {
        b = a[0]
        a = f(b)
    }
    return b
}



type FeArrayReq =
    | ["length", null]
    | ["get", [number, null]]
    | ["set", [number, [FeValue, null]]]
    | ["extend", [FeList, null]]
    | ["slice", [number, [number, null]]]
    | ["snapshot", null]

// function a(b: FeValue) { }
// // let b: ArrayReq = ["slice", [1, [2, null]]]
// let b2: Array = () => {throw new Error()}
// a(b2)

type FeArrayRsp = FeValue

type FeArray = (req: FeArrayReq) => [FeArray, [FeArrayRsp, FeNil]]


// TODO ? A more precise FeArray type ?
// type FeArray = 
//     & ((req: ["length"]) => [FeArray, [number, FeNil]])
//     & ((req: ["get", [number, null]]) => [FeArray, [FeValue, FeNil]])
//     & ((req: ["set", [number, [FeValue, null]]]) => [FeArray, [FeNil, FeNil]])
//     & ((req: ["extend", [FeList, null]]) => [FeArray, [FeNil, FeNil]])
//     & ((req: ["slice", [number, [number, null]]]) => [FeArray, [FeArray, FeNil]])
//     & ((req: ["snapshot", null]) => [FeArray, [FeFunc, FeNil]])





// TODO ? don't supply initial contents of list
// let primMkArrayFastAccessSlowCopy = (ty) => {
export let primMkArrayFastAccessSlowCopy = (ty: FeType) => (elems1: FeList): FeArray => {
    let elems: FeValue[] = []
    while (elems1 instanceof Array) {
        elems.push(elems1[0])
        elems1 = elems1[1]
    }
    let array = primMkArrayFastAccessSlowCopy2(elems)
    return array
}

let primMkArrayFastAccessSlowCopy2 = (elems: FeValue[]): FeArray => {
    if (elems === undefined) {
        console_log("WHAT!!!")
    }

    return (req: FeArrayReq) => {
        let elems2 = elems
        let result: FeArrayRsp
        // console_log("primArray request", JSON.stringify(req))
        switch (req[0]) {
            case "length": {
                result = elems.length
                break
            }
            case "get": {
                let pos = req[1][0]
                result = elems[pos]
                break
            }
            case "set": {
                let pos = req[1][0]
                let val = req[1][1][0]
                elems2 = [...elems]
                elems2[pos] = val
                result = null
                break
            }
            case "extend": {
                let elems3 = req[1][0]
                let elems4 = []
                while (elems3 instanceof Array) {
                    elems4.push(elems3[0])
                    elems3 = elems3[1]
                }
                elems2 = [...elems, ...elems4]
                result = null
                break
            }
            case "slice": {
                let newArrayElems = elems.slice(req[1][0], req[1][1][0])
                result = primMkArrayFastAccessSlowCopy2(newArrayElems)
                break
            }
            case "snapshot": {
                let newArrayElems = elems.slice(0, elems.length)
                result = (nil: FeNil) => primMkArrayFastAccessSlowCopy2(newArrayElems)
                break
            }
            default:
                throw new Error(`unknown Array request (${req[0]})`)
        }
        // console_log("primArray response", JSON.stringify(result))
        let array = primMkArrayFastAccessSlowCopy2(elems2)
        return [array, [result, null]]
    }
}

let primMkArrayFastAccessNoCopy = (ty: FeType) => (elems1: FeList): FeArray => {
    let elems = []
    while (elems1 instanceof Array) {
        elems.push(elems1[0])
        elems1 = elems1[1]
    }
    let seqId: [number] = [0]
    let array = primMkArrayFastAccessNoCopy2(elems, seqId)
    return array
}

let primMkArrayFastAccessNoCopy2 =
    (elems: FeValue[], seqId: [number]): FeArray => {
        let seqId2 = seqId[0];
        return (req: FeArrayReq) => {
            // console_log("primArrayNo request", seqId2, seqId[0], JSON.stringify(req))
            // if (seqId2 === 57) {
            //     console_log("oops")
            // }
            if (seqId2 !== seqId[0]) {
                throw new Error(`Runtime Error: stale array reference (${seqId2}) expected (${seqId[0]})`)
                // console_log(`Runtime Error: stale array reference (${seqId2}) expected (${seqId[0]})`)
            }
            // update the sequential counter for all operations ?
            // or just mutating changes ?
            seqId[0] += 1
            let elems2
            let result
            // console_log("primArrayNo request", JSON.stringify(req))
            switch (req[0]) {
                case "length": {
                    elems2 = elems
                    result = elems.length
                    break
                }
                case "get": {
                    let pos = req[1][0]
                    if (pos >= elems.length) {
                        throw new Error(`Runtime Error: array get: index (${pos}) out of bounds (${elems.length})`)
                    }
                    elems2 = elems
                    result = elems[pos]
                    break
                }
                case "set": {
                    let pos = req[1][0]
                    if (pos >= elems.length) {
                        throw new Error(`Runtime Error: array set: index (${pos}) out of bounds (${elems.length})`)
                    }
                    let val = req[1][1][0]
                    // elems2 = [...elems]
                    elems2 = elems
                    elems2[pos] = val
                    result = null
                    break
                }
                case "extend": {
                    let elems3 = req[1][0]
                    // let elems4 = []
                    let elems4 = elems
                    while (elems3 instanceof Array) {
                        elems4.push(elems3[0])
                        elems3 = elems3[1]
                    }
                    // elems2 = [...elems, ...elems4]
                    elems2 = elems4
                    result = null
                    break
                }
                case "slice": {
                    let newArrayElems = elems.slice(req[1][0], req[1][1][0])
                    elems2 = elems
                    result = primMkArrayFastAccessNoCopy2(newArrayElems, [0])
                    break
                }
                case "snapshot": {
                    // copy the elems once when we create the snapshot
                    let newArrayElems = [...elems]
                    // console_log(`ARRAY: snapshot_create ${newArrayElems.length}`)
                    result = (nil: FeNil) => {
                        // copy the elems again, each time the snapshot is restored
                        // ( the copies could sometimes be avoided if/when reference counts were/are available )
                        let newArrayElems2 = [...newArrayElems]
                        // console_log(`ARRAY: snapshot_restore ${newArrayElems2.length}`)
                        return primMkArrayFastAccessNoCopy2(newArrayElems2, [0])
                    }
                    elems2 = elems
                    break
                }
                default:
                    throw new Error(`unknown Array request (${req[0]})`)
            }
            // console_log("primArrayNo response", JSON.stringify(result))
            let array = primMkArrayFastAccessNoCopy2(elems2, seqId)
            return [array, [result, null]]
        }
    }



function isDatum(a: any) {
    switch (typeof a) {
        case "boolean":
        case "number":
        case "string":
            return true
        case "object":
            return a === null
        default:
            throw new Error(`unexpected argument type ${typeof a}`)
    }
}


// The HashCons.hashcons method allocates sequential ids for every unique FeData value it is called with.
// If it is called with the same value again, it returns the original value.
// Perhaps it should be called MapCons, but the use of maps is purely an implmentation detail.

type HashId = number
class HashCons {
    nextId = 1
    dataToId = new Map<FeData, HashId>()
    idToData = new Map<HashId, FeData>()
    pairToId = new Map<HashId, Map<HashId, HashId>>()
    hashCons(data: FeData): [HashId, FeData] {
        let id = this.dataToId.get(data)
        if (id !== undefined) {
            return [id, data]
        }
        if (isDatum(data)) {
            id = this.nextId++
            this.dataToId.set(data, id)
            this.idToData.set(id, data)
            return [id, data]
        }
        if ((data instanceof Array && data.length == 2)) {
            // TODO ? a non-recursive version, to stop the stack getting too big ?
            let [h, t] = data
            let [hId, h2] = this.hashCons(h)
            let [tId, t2] = this.hashCons(t)
            let hMap = this.pairToId.get(hId)
            if (hMap === undefined) {
                hMap = new Map()
                this.pairToId.set(hId, hMap)
            }
            let id = hMap.get(tId)
            if (id === undefined) {
                id = this.nextId++
                hMap.set(tId, id)
            }
            data = [h2, t2]
            id = this.pairToId.get(hId)!.get(tId)!
            this.dataToId.set(data, id)
            this.idToData.set(id, data)
            return [id, data]
        }
        else {
            throw new Error(`hashCons: expected a datum or pair, not (${data})`)
        }
    }
}

// type AssocReq =
//     | ["get", [FeData, FeNil]]
//     | ["set", [FeData, [FeData, FeNil]]]

// type AssocRsp =
//     | ((a: AssocReq[1]) => [Assoc, FeValue])

type FeAssoc =
    & ((r: "get"        /**/) => (a: FeTuple<[FeData          /**/]>) => FeTuple<[FeAssoc, FeValue /**/]>)
    & ((r: "set"        /**/) => (a: FeTuple<[FeData, FeMaybe /**/]>) => FeTuple<[FeAssoc, FeNil   /**/]>)
    & ((r: "persistent" /**/) => (a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>)
    & ((r: "ephemeral"  /**/) => (a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>)
    // & ((r: "copy"       /**/) => (a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>)

type AssocMethods = [
    ["get",        /**/ (a: FeTuple<[FeData          /**/]>) => FeTuple<[FeAssoc, FeValue /**/]>],
    ["set",        /**/ (a: FeTuple<[FeData, FeMaybe /**/]>) => FeTuple<[FeAssoc, FeNil   /**/]>],
    ["persistent", /**/ (a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>],
    ["ephemeral",  /**/ (a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>],
    // ["copy",       /**/ (a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>],
]

// TODO Move this into a type-utils.ts file ?
type Apply<F extends (a: never) => any, A> =
    Extract<
        F extends {
            (a: infer A1): infer R1;
            (a: infer A2): infer R2;
            (a: infer A3): infer R3;
            (a: infer A4): infer R4;
            (a: infer A5): infer R5;
            (a: infer A6): infer R6;
            (a: infer A7): infer R7;
            (a: infer A8): infer R8;
        }
        ? (
            | [A1, R1]
            | [A2, R2]
            | [A3, R3]
            | [A4, R4]
            | [A5, R5]
            | [A6, R6]
            | [A7, R7]
            | [A8, R8]
        )
        : never,
        [A, any]
    >[1]

type Domain<F extends (a: never) => any> =
    F extends {
        (a: infer A1): any;
        (a: infer A2): any;
        (a: infer A3): any;
        (a: infer A4): any;
        (a: infer A5): any;
        (a: infer A6): any;
        (a: infer A7): any;
        (a: infer A8): any;
    }
    ? (
        | A1
        | A2
        | A3
        | A4
        | A5
        | A6
        | A7
        | A8
    )
    : never





function method<O extends (r: never) => any, M extends Domain<O>>(m: Apply<O, M>): Apply<O, M> {
    return m
}

let mkAssocObj_persistent = (hashCons: HashCons, map: Map<HashId, FeValue>): FeAssoc => {

    return assoc

    function assoc(req: "get"):        /**/(a: FeTuple<[FeData          /**/]>) => FeTuple<[FeAssoc, FeValue /**/]>
    function assoc(req: "set"):        /**/(a: FeTuple<[FeData, FeMaybe /**/]>) => FeTuple<[FeAssoc, FeNil   /**/]>
    function assoc(req: "persistent"): /**/(a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>
    function assoc(req: "ephemeral"):  /**/(a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>
    // function assoc(req: "copy"):       /**/(a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>
    function assoc(req: AssocMethods[number][0]): AssocMethods[number][1]
    function assoc(req: AssocMethods[number][0]): AssocMethods[number][1] {

        switch (req) {
            case "get": {
                return method<FeAssoc, "get">(([key,]) => {
                    let [id,] = hashCons.hashCons(key)
                    let v = map.get(id)
                    let result: FeMaybe = v === undefined ? null : [v, null];
                    let assocObj = mkAssocObj_persistent(hashCons, map)
                    return [assocObj, [result, null]]
                })


            }
            case "set": {
                return method<FeAssoc, "set">(([key, [val,]]) => {
                    // copy-on-EVERY-write, beacuse we can't tell if the assoc is shared or not
                    let newMap = new Map(map.entries());
                    let [id,] = hashCons.hashCons(key)
                    if (val == null) {
                        newMap.delete(id)
                    }
                    else {
                        newMap.set(id, val[0])
                    }
                    let result = null
                    let assocObj = mkAssocObj_persistent(hashCons, newMap)
                    return [assocObj, [result, null]]
                })
            }
            case "persistent": {
                return method<FeAssoc, "persistent">(() => {
                    let assocObj = mkAssocObj_persistent(hashCons, map)
                    let result = assocObj
                    return [assocObj, [result, null]]
                })
            }
            case "ephemeral": {
                return method<FeAssoc, "ephemeral">(() => {
                    let newSeqId: [number] = [0]
                    let newMap = new Map(map.entries())
                    let result = mkAssocObj_ephemeral(hashCons, newMap, newSeqId)
                    let assocObj = mkAssocObj_persistent(hashCons, map)
                    return [assocObj, [result, null]]
                })
            }
            // case "copy": {
            //     let assocObj = mkAssocObj_persistent(hashCons, map)
            //     return [assocObj, [assocObj, null]]
            // }
            default:
                throw new Error(`primAssoc1MkCopyOnWrite/mkAssocObj unknown request ${req}`)
        }
    }
}

let mkAssocObj_ephemeral = (hashCons: HashCons, map: Map<HashId, FeValue>, seqId: [number]): FeAssoc => {
    let seqId2 = seqId[0];

    return assoc

    function assoc(req: "get"):        /**/(a: FeTuple<[FeData          /**/]>) => FeTuple<[FeAssoc, FeValue /**/]>
    function assoc(req: "set"):        /**/(a: FeTuple<[FeData, FeMaybe /**/]>) => FeTuple<[FeAssoc, FeNil   /**/]>
    function assoc(req: "persistent"): /**/(a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>
    function assoc(req: "ephemeral"):  /**/(a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>
    // function assoc(req: "copy"):       /**/(a: FeTuple<[                /**/]>) => FeTuple<[FeAssoc, FeAssoc   /**/]>

    function assoc(req: AssocMethods[number][0]): AssocMethods[number][1]
    function assoc(req: AssocMethods[number][0]): AssocMethods[number][1] {

        if (seqId2 !== seqId[0]) {
            throw new Error(`Runtime Error: stale assoc reference (${seqId2}) expected (${seqId[0]})`)
            // console_log(`Runtime Error: stale assoc reference (${seqId2}) expected (${seqId[0]})`)
        }
        // update the sequential counter for all operations
        seqId[0] += 1
        switch (req) {
            case "get": {
                return method<FeAssoc, "get">(([key,]) => {
                    let [id,] = hashCons.hashCons(key)
                    let v = map.get(id)
                    let result: FeMaybe = v === undefined ? null : [v, null];
                    let assocObj = mkAssocObj_ephemeral(hashCons, map, seqId)
                    return [assocObj, [result, null]]
                })
            }
            case "set": {
                return method<FeAssoc, "set">(([key, [val,]]) => {
                    let [id,] = hashCons.hashCons(key)
                    if (val === null) {
                        map.delete(id)
                    }
                    else {
                        map.set(id, val[0])
                    }
                    let result = null
                    let assocObj = mkAssocObj_ephemeral(hashCons, map, seqId)
                    return [assocObj, [result, null]]
                })
            }
            case "persistent": {
                return method<FeAssoc, "persistent">(() => {
                    let newMap = new Map(map.entries())
                    let result = mkAssocObj_persistent(hashCons, newMap)
                    let assocObj = mkAssocObj_ephemeral(hashCons, map, seqId)
                    return [assocObj, [result, null]]
                })
            }
            case "ephemeral": {
                return method<FeAssoc, "ephemeral">(() => {
                    let newSeqId: [number] = [0]
                    let newMap = new Map(map.entries())
                    let result = mkAssocObj_ephemeral(hashCons, newMap, newSeqId)
                    let assocObj = mkAssocObj_ephemeral(hashCons, map, seqId)
                    return [assocObj, [result, null]]
                })
            }
            // case "copy": {
            //     return () => {
            //         let newSeqId = [0]
            //         let newMap = new Map(map.entries())
            //         let result = mkAssocObj_ephemeral(hashCons, newMap, newSeqId)
            //         let assocObj = mkAssocObj_ephemeral(hashCons, map, seqId)
            //         return [assocObj, [result, null]]
            //     }
            // }
            default:
                throw new Error(`primAssoc1MkCopyOnSnapshot/mkAssocObj unknown request ${req}`)

        }
    }
}

let primAssoc1MkPersistent_data = (elems: FeList<FeTuple<[FeData, FeValue]>>) => {
    let hashCons = new HashCons();
    let elems2 = feList_toList(elems)
    let elems3 = elems2.map(([k, [v,]]): [number, FeValue] => {
        let [id,] = hashCons.hashCons(k)
        return [id, v]
    })
    let map = new Map(elems3);

    let assoc = mkAssocObj_persistent(hashCons, map)
    return assoc
}

let primAssoc1MkEphemeral_data = (elems: FeList<FeTuple<[FeData, FeValue]>>) => {
    let hashCons = new HashCons();
    let elems2 = feList_toList(elems)
    let elems3 = elems2.map(([k, [v,]]): [number, FeValue] => {
        let [id,] = hashCons.hashCons(k)
        return [id, v]
    })
    let map = new Map(elems3);
    let seqId: [number] = [0]

    let assoc = mkAssocObj_ephemeral(hashCons, map, seqId)
    return assoc
}



export function showValueFerrum(node: FeValue, forceToData = false): string {
    var v = node
    if (v instanceof Array) {
        let result: string = "[" + showValueFerrum(v[0], forceToData)
        v = v[1]
        while (v instanceof Array) {
            result += "," + showValueFerrum(v[0])
            v = v[1]
        }
        if (v !== null) {
            result += ",," + showValueFerrum(v, forceToData)
        }
        result += "]"
        return result
    }
    else if (v instanceof Function) {
        if (forceToData) {
            return '"!!! #Func !!!"'
        }
        else {
            return "#Func"
        }
    }
    else if (v instanceof TypeDefn) {
        if (forceToData) {
            return '"!!! #Type !!!"'
        }
        else {
            return "#Type"
        }
    }
    else if (v === null) {
        return "[]"
    }
    else if ((v as any) instanceof Object) {
        // We shouldn't ever get here.
        if (forceToData) {
            return '"!!! #Obj !!!"'
        }
        else {
            return "#Obj"
        }
    }
    else if (typeof v == "number" || typeof v == "string" || typeof v == "boolean") {
        return JSON.stringify(v)
    }
    else {
        throw new Error(`showValueFerrum: unexpected value (${typeof v} ${JSON.stringify(v)})`)
    }
}


export function showValueFerrum2(v: FeValue): string {
    if (typeof v === "string" && v.indexOf("\n") !== -1) {
        let v2 = v.split("\n").map(a => "    " + a).join("\n")
        let result = ['"""', v2, '"""', ""].join("\n")
        return result
    }
    else {
        return showValueFerrum(v)
    }
}


type Pattern = undefined | null | number | string | [Pattern, Pattern]

export function matchPat(value: FeValue, pattern: Pattern): boolean {
    if (pattern === undefined) {
        return true
    }
    else if (pattern instanceof Array) {
        return value instanceof Array && pattern.every((p, i) => matchPat(value[i], p))
    }
    else if (pattern === null || typeof pattern === 'number' || typeof pattern === 'string') {
        return value === pattern
    }
    else {
        throw new Error("missing case " + pattern)
        // throw new Error("missing case " + JSON.stringify(pattern))
    }
}

export function lambdaMaybe(pattern: Pattern, func: FeFunc<FeValue>) {
    return (v: FeValue) => {
        if (matchPat(v, pattern)) {
            return [func(v), null]
        }
        else {
            return null
        }
    }
}

export function lambdaNo(pattern: Pattern, func: FeFunc<FeValue>) {
    return (v: FeValue) => {
        if (matchPat(v, pattern)) {
            return func(v)
        }
        else {
            return null
        }
    }
}
export let lambdaNothing = lambdaNo

// function lambdaYes(pattern, func) {
//     return (v) => {
//         return [func(v), null]
//     }
// }

export function pgPair(a: FeValue, f: FeFunc<FeValue, FeFunc<FeValue, FeValue>>): FeValue {
    if (a instanceof Array) {
        return f(a[0])(a[1])
    }
    else {
        return null
    }
}

export function pgEq(a: FeValue, b: FeValue, f: FeFunc<FeValue>): FeValue {
    if (a === b) {
        return f(null)
    }
    else {
        return null
    }
}

// TODO use this for as-pattern matching, instead of requiring a statement context
// translate
//   a @ [b, c] -> ...
// into 
//   (a) => as ( a, [b, c] => (...) )
// instead of
//   (a) => { let [b, c] = a; return (...) }

export function as(a: FeValue, f: FeFunc<FeValue>): FeValue {
    return f(a)
}






type TypePrim = string
type TypeArg = TypeDefn

// Types used to be represented by null. (and some of the codegens still generate nulls for types).
// Now types have their own class.
// This is done for diagnostic purposes.
// Information is not intended to flow from the type-level to the term-level,
//   so this could go back to being opaque.
// Using null is not a good choice, as it is being used for Ferrum's no/nil/unit value.
// We could use "undefined" ?
export class TypeDefn {
    prim: TypePrim
    args: TypeArg[]
    constructor(op: TypePrim, args: TypeArg[]) {
        this.prim = op
        this.args = args
    }
}

function MkType(defn: string): FeType {
    // console_log(`MkType: ${defn}`)
    return new TypeDefn(defn, [])
}

function MkTypeOpLeft(op: string, args: TypeDefn[]): FeType {
    // console_log(`MkTypeOp: ${op} ${JSON.stringify(args)}`)
    if (args.length > 0 && op === args[0]?.prim) {
        let [first, ...rest] = args
        return new TypeDefn(op, [...first.args, ...rest])
    }
    else {
        return new TypeDefn(op, args)
    }
}

function tyStr(ty: FeType): string {
    if (ty instanceof TypeDefn) {
        if (ty.args.length === 0) {
            return ty.prim
        }
        else {

            return ty.args.join(` ${ty.prim} `)
        }
    }
    if (ty === null || ty === undefined) {
        return "{}"
    }
    throw new Error(`tyStr: Invalid Type (${JSON.stringify(ty)})`)
    // return `(Expected a type, not: ${showValueFerrum(ty)})`
}









function typeToStr(ty: FeType) {
    return tyStr(ty)
}

let hpsDo = (action: any) => (handler: any): any => {
    let actionProc =
        (Object.hasOwn(action, "Annot_hpsFunc")) ? action.Annot_hpsFunc :
            (Object.hasOwn(action, "Annot_hpsAction")) ? action.Annot_hpsAction :
                null
    let handlerObj =
        (Object.hasOwn(handler, "Annot_hpsHandler")) ? handler.Annot_hpsHandler :
            null
    let actionMsg = actionProc === null ? " actionFun" : " actionImp";
    let handlerMsg = handlerObj === null ? "handlerFun" : "handlerImp";
    // console_log("hpsDo", actionMsg, handlerMsg)

    if (actionProc !== null && handlerObj !== null) {
        let result = actionProc(handlerObj)
        // console_log("hpsDo/Imp", "RESULT", result)
        return [handler, [result, null]]
    }
    else if (actionProc === null && handlerObj !== null) {
        let k = (result: any) => (handler: any) => result
        let handler = convertHandler(handlerObj)
        let result = action(k)(handler)
        // console_log("hpsDo/FunImp", "RESULT", result)
        return [handler, [result, null]]
    }
    else {
        let k = (result: any) => (handler: any) => [handler, [result, null]]
        let [handler2, [result,]] = action(k)(handler)
        // console_log("hpsDo/Fun", "RESULT", actionProc===null, handlerObj===null, result)
        return [handler2, [result, null]]
    }
}

let hpsCall = (action: any) => (handler: any) => {
    let actionProc =
        (Object.hasOwn(action, "Annot_hpsFunc")) ? action.Annot_hpsFunc :
            (Object.hasOwn(action, "Annot_hpsAction")) ? action.Annot_hpsAction :
                null
    let handlerObj =
        (Object.hasOwn(handler, "Annot_hpsHandler")) ? handler.Annot_hpsHandler :
            null
    if (actionProc !== null && handlerObj !== null) {
        let result = actionProc(handlerObj)
        // console_log("hpsCall/Imp", "RESULT1", result)
        return result
    }
    else {
        let k = (result: any) => (handler: any) => result
        let result = action(k)(handler)
        // console_log("hpsCall/Fun", "RESULT2", result)
        return result
    }
}

// take an imperative-style handler-object, and make it suitable for use by a
// functional-style hps function, such as an hps function which hasn't been annotated or successfully converted to imperative-style
// TODO ? add a seqId to check for incorrect use ?
// TODO   currently, this seems to be able to mask errors which would otherwise be caught by the mkArrayNoCopy object
let convertHandler = (handlerObj: any) => {
    if (handlerObj instanceof Function) {
        throw new Error(`convertHandler called incorrectly, handlerObj is a function not an object`)
        // console_log(`convertHandler called incorrectly, handlerObj is a function not an object`)
        // return handlerObj
    }
    let handler = (reqName: any) => (reqArgs: any) => (k: any) => {
        let args = []
        while (reqArgs !== null) {
            if (!(reqArgs instanceof Array) || reqArgs.length !== 2) {
                throw new Error(`convertHandler: args: Expected null or cons, not: ${reqArgs}`)
            }
            args.push(reqArgs[0])
            reqArgs = reqArgs[1]
        }
        if (!Object.hasOwn(handlerObj, reqName)) {
            throw new Error(`invalid/unknown request-method (${reqName}) for handler (${handlerObj}), expected one of (${JSON.stringify(Object.keys(handlerObj))})`)
        }
        let result = handlerObj[reqName](...args)
        return k(result)(handler)
    }
    return handler
}

let hpsObjCall = (action: any) => (handlerObj: any, ...args: any[]) => {
    // TODO to catch potential bugs early,
    // TODO   assert that handlerObj is actually a handler object (need to add some indication of this in the codegen).
    let actionProc =
        (Object.hasOwn(action, "Annot_hpsFunc")) ? action.Annot_hpsFunc :
            (Object.hasOwn(action, "Annot_hpsAction")) ? action.Annot_hpsAction :
                null
    if (actionProc !== null) {
        let result = actionProc(handlerObj, ...args)
        // console_log("hpsObjCall/Imp", "RESULT1", result)
        return result
    }
    else {
        let k = (result: any) => (handler: any) => result
        let handler = convertHandler(handlerObj)
        for (let arg of args) {
            action = action(arg)
        }
        let result = action(k)(handler)
        // console_log("hpsObjCall/Fun", "RESULT2", result)
        return result
    }
}

let hpsHandlerMk = (handlerMk: any) => (initState: any) => {
    let handler = handlerMk(initState)
    if (Object.hasOwn(handlerMk, "Annot_hpsHandlerMk")) {
        handler.Annot_hpsHandler = handlerMk.Annot_hpsHandlerMk(initState)
    }
    return handler
}

let primitives2 = () => {

    let prims0: { [name: string]: FeValue } = {}
    let prims1: { [name: string]: ((a: any) => FeValue) } = prims0 as any
    let prims2: { [name: string]: ((a: any) => (b: any) => FeValue) } = prims0 as any
    let prims3: { [name: string]: ((a: any) => (b: any) => (c: any) => FeValue) } = prims0 as any


    prims1["inc"] = (n) => (n + 1)
    prims2["(+)"] = (a) => (b) => (a + b)
    prims2["(-)"] = (a) => (b) => (a - b)
    prims2["(*)"] = (a) => (b) => (a * b)
    prims2["(==)"] = (a) => (b) => a === b
    prims2["(>)"] = (a) => (b) => (a > b)
    prims2["(>=)"] = (a) => (b) => (a >= b)
    prims2["(<)"] = (a) => (b) => (a < b)
    prims2["(<=)"] = (a) => (b) => (a <= b)
    prims1["ord"] = (a) => (a.charCodeAt(0))
    prims1["chr"] = (a) => (String.fromCharCode(a))
    // prims1["!"] = (a) => (!a)
    prims1["not"] = (a) => (!a)
    prims2["(&&)"] = (a) => (b) => a && b
    prims2["(||)"] = (a) => (b) => a || b
    prims2["(|-)"] = (a) => (b) => a ? b : null
    prims2["(|=)"] = (a) => (b) => a ? [b, null] : null
    prims1["isPair"] = (a) => (Array.isArray(a))
    prims1["isNumber"] = (a) => (typeof a === 'number')
    prims1["isString"] = (a) => (typeof a === 'string')
    prims1["hd"] = (a) => (a[0])
    prims1["tl"] = (a) => (a[1])
    prims0.head = prims0.hd
    prims0.tail = prims0.tl
    prims2.if2 = (a) => (b) => a ? b[0](null) : b[1][0](null)
    prims2.if = prims2.if2
    prims0.startTraceTime = Date.now()
    prims0.prevTraceTime = prims0.startTraceTime
    prims2.trace2 = (a) => (b) => {
        // console_log("RuntimeTrace:\n" + showValueFerrum(a))
        // console_log("RuntimeTrace:\n" + showValueFerrum2(a))
        let traceTime = Date.now()
        let traceTimeDiff = traceTime - (prims0.prevTraceTime as number)
        prims0.prevTraceTime = traceTime
        let traceTimeSeconds = Math.floor((traceTime - (prims0.startTraceTime as number)) / 1000)
        let traceTimeDiffSeconds = Math.floor(traceTimeDiff / 1000)
        let traceTimeDiffMilliSeconds = traceTimeDiff
        // console_log(`RuntimeTrace [${traceTimeSeconds}, +${traceTimeDiffMilliSeconds}]:\n` + showValueFerrum2(a))
        // console_log(`RuntimeTrace []:\n` + showValueFerrum2(a))
        console.error(`RuntimeTrace []:\n` + showValueFerrum2(a))
        return b(null)
    }
    prims2.trace = (a) => (b) => {
        return prims2.trace2(a)(() => b)
    }
    prims1.error = (a) => {
        let value = showValueFerrum(a)
        console_log("Error: " + value)
        Error.stackTraceLimit = 1000
        let origPrepareStackTrace = Error.prepareStackTrace
        Error.prepareStackTrace = (error, stackTrace) => {
            // console_log(JSON.stringify(stackTrace))
            let lines: string[] = []
            stackTrace.forEach(se => {
                //   if (true) 
                // if (se.isEval())
                {
                    let name = se.getFunctionName()
                    if (name === "eval" || name == null) {
                        name = ""
                    }
                    let line = se.getLineNumber()?.toString().padStart(5)
                    let col = se.getColumnNumber()?.toString().padStart(3)
                    lines.push(`  [ ${line}, ${col} ]  ${name}`)
                }
                // console_log(se.getFunctionName(), se.getTypeName(), se.getEvalOrigin(), se.isEval())
            })
            return ("*** STACK *** \n" + lines.join("\n"))
        }
        console_log((new Error()).stack)
        Error.prepareStackTrace = origPrepareStackTrace
        // let callStack = (new Error()).stack
        // let stackEntries = callStack.split("\n")
        // // let re = new RegExp("anonymous")
        // let re2 = new RegExp(", (<anonymous>.*)\\)")
        // let re3 = new RegExp("at ([^ ]*) .*, (<anonymous>.*)\\)")
        // stackEntries.forEach(se => {
        //     // console_log(se)
        //     // let m = re.test(se)
        //     // let m2 = re2.test(se)
        //     // let m3 = se.match(re2)
        //     let m3 = se.match(re3)
        //     // console_log("   ", m, m2, m3)
        //     if (m3 !== null) {
        //         // console_log(se)
        //         let name = m3[1]
        //         let loc = m3[2]
        //         if (name==="eval") {
        //             name = ""
        //         }
        //         name = name.padEnd(20)
        //         console_log("   ", name, loc)
        //     }
        // })
        // console_log("JS Call Stack:", callStack)
        // console.trace("JS Call Stack2:")
        // console_log("Error: " + value)
        // process.stdout.write('', () => { }) // make sure everything is written out
        throw "Error: " + value
    }
    prims1.show = (a) => {
        var value = showValueFerrum(a)
        return value
    }
    prims1.show2 = (a) => {
        var value = showValueFerrum(a)
        return value
    }


    prims0.false = false
    prims0.true = true
    prims1.null = (a) => (a === null)

    // A non-specializing implementation of the specializing-application operator.
    prims2["(<$)"] = (a) => (b) => a(b)
    // A non-blocking implementation of the block-until operator.
    prims2["(_$?)"] = (a) => (b) => b


    prims2.strConcat = (a) => (b) => (a + b)
    prims1.explode = (input) => {
        var result: FeValue = null;
        for (var i = input.length - 1; i >= 0; i--) {
            result = [input.charAt(i), result];
        }
        return result;
    }


    prims0.MkType = MkType
    prims0.Type = MkType("Type")
    prims1.showType = (ty) => typeToStr(ty) // for diagnostic purposes only
    prims2.pair = (hdT) => (tlT) => MkType(`{ [${tyStr(hdT)} ,, ${tyStr(tlT)}] }`)
    prims1.List = (elemT) => MkType(`(List ${tyStr(elemT)})`)
    prims1.Elem = (listT) => MkType(`(Elem ${tyStr(listT)})`)
    prims2.Fun = (domT) => (codT) => MkType(`{ ${tyStr(domT)} -> ${tyStr(codT)} }}`)
    prims0.Any = MkType("Any")
    prims0.Void = MkType("Void")
    prims0.Int = MkType("Int")
    prims0.Str = MkType("Str")
    prims0.Bool = MkType("Bool")
    prims0.Nil = MkType("Nil")

    // TODO Get rid of these old-style lower-case type names.
    prims0.type = prims0.Type
    prims0.list = prims0.List
    prims0.any = prims0.Any
    prims0.never = prims0.Void
    prims0.void = prims0.Void
    prims0.int = prims0.Int
    prims0.str = prims0.Str
    prims0.bool = prims0.Bool

    prims1.Single = (value) => {
        if (typeof value === "string") {
            return MkType(`{ ${JSON.stringify(value)} }`)
        }
        else {
            throw new Error(`Single: expected a string, other singleton types not yet supported (${value})`)
        }
    }
    // legacy name, only needed to keep the fe3 tests passing
    prims0.singleT = prims0.Single


    prims2.unionT = (a) => (b) => MkTypeOpLeft("|", [a, b])
    prims2["{|}"] = (a) => (b) => MkTypeOpLeft("|", [a, b])
    prims2.intersectT = (a) => (b) => MkTypeOpLeft("&", [a, b])
    prims2["{&}"] = (a) => (b) => MkTypeOpLeft("&", [a, b])
    prims2.relcompT = (a) => (b) => MkTypeOpLeft("\\", [a, b])
    prims2["{\\}"] = (a) => (b) => MkTypeOpLeft("\\", [a, b])

    prims1.Union = (tl) => MkType("TODO")

    prims1.Domain = (t) => MkType(`(Domain ${tyStr(t)})`)
    prims1.Codomain = (t) => MkType(`(Codomain ${tyStr(t)})`)
    prims1.Inverse = (t) => MkType(`(Inverse ${tyStr(t)})`)
    prims2.InverseApply = (fun) => (coarg) => MkType(`(InverseApply ${tyStr(fun)} ${tyStr(coarg)})`)
    prims2.Variant = (name) => (type) => MkType("Variant Obsolete")
    prims1.Hd = (t) => MkType(`(Hd ${tyStr(t)})`)
    prims1.Tl = (t) => MkType(`(Tl ${tyStr(t)})`)
    prims1.Fix = (t) => {
        // TODO ? generate some unique id ?
        let varTy = MkType("A")
        let bodyTy = t(varTy)
        let resultTy = MkType(`(Fix (${tyStr(varTy)} -> ${tyStr(bodyTy)}))`)
        return resultTy
    }
    prims1.Self = (t) => {
        // TODO ? generate some unique id ?
        let varTy = MkType("A")
        let bodyTy = t(varTy)
        let resultTy = MkType(`(Self (${tyStr(varTy)} -> ${tyStr(bodyTy)}))`)
        return resultTy
    }
    prims1.SelfT = (t) => {
        // TODO ? generate some unique id ?
        // let varTy = MkType("A")
        // Semantically, every function is called with both an argument term and an argument type.
        // At runtime, the type can be ignored/discarded/erased
        // So we're calling this type-constructor with a term-variable only.
        let varTy = MkType("a")
        let bodyTy = t(varTy)
        let resultTy = MkType(`(Self (${tyStr(varTy)} -> ${tyStr(bodyTy)}))`)
        return resultTy
    }

    prims0.domain = prims0.Domain
    prims0.range = prims0.Codomain
    prims0.primInverse = prims0.Inverse
    prims0.primInverseApply = prims0.InverseApply
    prims0.hdT = prims0.Hd
    prims0.tlT = prims0.Tl



    // TODO change name from coerceT to castT
    prims2.coerceDT = (val) => (typ) => (val)
    prims1.coerceT = (val) => (val)
    prims2.castDT = (val) => (typ) => (val)
    prims1.castT = (val) => (val)
    prims1.typeOf = (a) => MkType(`(typeOf _)`)
    prims0.fix = fix
    prims0.fix2 = fix
    prims0.loop1 = loop1
    prims0.loop2 = loop2
    prims0.break = primBreak
    prims0.continue = primContinue

    prims2.grLoop = v => f => grLoop(v, f)
    prims3.grWhile = a => b => f => grWhile(a, b, f)



    prims2.testIsStr = (a) => ([t, [f, _]]) => (typeof a === "string" ? t(a) : f(a))
    prims2.testIsNil = (a) => ([t, [f, _]]) => (a === null ? t(a) : f(a))
    prims2.matchMaybe = (a) => ([t, [f, _]]) => (a === null ? t(a) : f(a))
    prims2.matchList = (a) => ([t, [f, _]]) => (a === null ? t(a) : f(a))

    prims2.ifNil = (a) => ([t, [f, _]]) => (a === null ? t(a) : f(a))
    prims2.ifBool = (a) => ([t, [f, _]]) => (typeof a === "boolean" ? t(a) : f(a))
    prims2.ifInt = (a) => ([t, [f, _]]) => (typeof a === "number" ? t(a) : f(a))
    prims2.ifStr = (a) => ([t, [f, _]]) => (typeof a === "string" ? t(a) : f(a))
    prims2.ifPair = (a) => ([t, [f, _]]) => (a instanceof Array ? t(a) : f(a))

    // Purely for diagnostic purposed.
    prims2.ifFunc = (a) => ([t, [f, _]]) => (a instanceof Function ? t(a) : f(a))
    prims2.ifType = (a) => ([t, [f, _]]) => (a instanceof TypeDefn ? t(a) : f(a))


    prims1.strOrd = (a) => a.charCodeAt(0)
    prims1.strChr = (a) => String.fromCharCode(a)
    prims1.strLen = (a) => a.length
    prims2.strAdd = (a) => (b) => a + b
    prims2.strCharAt = (a) => (b) => a.charAt(b)
    prims2.strCharAtMb = (a) => (b) => { let ch = a.charAt(b); return ch === "" ? null : [ch, null]; }

    prims2.jsStrJoin = (delim) => (parts) => {
        if (typeof (delim) !== "string") {
            throw new Error(`expected a string as delimiter, not (${JSON.stringify(delim)})`)
        }
        let elems = []
        while (parts instanceof Array) {
            let part = parts[0]
            if (typeof (part) !== "string") {
                throw new Error(`expected a string in list, not (${JSON.stringify(part)})`)
            }
            elems.push(part)
            parts = parts[1]
        }
        if (parts !== null) {
            throw new Error(`expected a nil at end of list, not (${JSON.stringify(parts)})`)
        }
        return elems.join(delim)
    }
    prims0.jsStrCat = prims1.jsStrJoin("")
    prims0.char_concat = prims1.jsStrJoin("")

    prims0.primMkArrayFastAccessSlowCopy = primMkArrayFastAccessSlowCopy
    prims0.primMkArrayFastAccessNoCopy = primMkArrayFastAccessNoCopy

    prims0.primAssoc1MkPersistent = primAssoc1MkPersistent_data;
    prims0.primAssoc1MkEphemeral = primAssoc1MkEphemeral_data;
    prims2.primHpsDo = hpsDo
    prims0.primHpsCall = hpsCall
    prims0.primHpsObjCall = hpsObjCall
    prims0.primHpsHandlerMk = hpsHandlerMk

    prims1.Primitive = (name) => null
    // prims1.primitive = (name) => primitivesCore[name]
    prims1.primitive = (name) => allPrims[name]

    return prims0
}


export let primitivesCore = primitives2();


export const runtimeUtils = {
    primAssoc1MkCopyOnWrite: primAssoc1MkPersistent_data,
    primAssoc1MkCopyOnSnapshot: primAssoc1MkEphemeral_data,
    primAssocMk: primAssoc1MkPersistent_data,
    showValueFerrum: showValueFerrum,
    showValueFerrum2: showValueFerrum2,
    matchPat,
    lambdaNothing: lambdaNo,
    lambdaNo,
    lambdaMaybe,
    // lambdaYes,
    pgPair,
    pgEq,
    as,
    primitivesCore,

} as const

// An appendable list of all primitives.
// This serves as a way to use the runtest code in both in the browser and in NodeJs.
// The saves parameterizing runtest and code-table with the set of primitive in use.
// TODO ? It might be better to plumb the primitives through runtest/code-table ?
export const allPrims = { ...primitivesCore }

export function addPrimitives(newPrims: { [name: string]: any }) {
    Object.assign(allPrims, newPrims)
}

