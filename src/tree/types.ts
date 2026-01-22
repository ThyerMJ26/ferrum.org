//#region Imports and Globals

import { assert } from "../utils/assert.js";
import { equalObjects } from "../utils/equal-objects.js";

import {
    ExprLoc, Expr, ExprType, ExprTypeBidir, ExprTree, assumeExprIsTyped, Output,
    showExpConcise, Decl, LocField, VarSet, patBindVars, exprFreeVars, DeclTypeBidir, visitAll
} from "../syntax/expr.js";
import {
    evalExpr, evalNode, Env, Node, AtomicValue, node, atomicValue,
    blockedValue, typeValue, termVarValue, Value, BlockedValueException,
    lookupPrimEnv
} from "../tree/eval.js";
import { showLoc, Loc, nilLoc } from "../syntax/token.js";
import { MemoData, MemoID, mk_MemoData } from "../tree/memoize.js"
import { isAlphaUS } from "../syntax/scan.js"


// const ALL_FUNC_TYPES_INHABITED = true
const ALL_FUNC_TYPES_INHABITED = false

const ASSUME_ALL_PAIRS_INHABITED = false
// const ASSUME_ALL_PAIRS_INHABITED = true

const PUSH_PROJECTTION_THROUGH_INTERSECTION = false
// const PUSH_PROJECTTION_THROUGH_INTERSECTION = true

// const TRACK_TYPE_INHABITATION = false
const TRACK_TYPE_INHABITATION = true

const UNKNOWN_VARS_TYPE_ERROR = false
// const UNKNOWN_VARS_TYPE_ERROR = true

//#endregion



//#region Progress

let prevTime = Date.now()
let nextProgressLine: string | null = null
const showProgressVerbosity = 0
// const showProgressVerbosity = 1
// const showProgressVerbosity = 3
const showProgressBefore = true
const showProgressAfter = true

export function flushProgressReport() {
    let currentTime = Date.now()
    if (nextProgressLine !== null) {
        let timeDiff = currentTime - prevTime
        let timeTxt = (timeDiff == 0 ? "" : `${timeDiff}`).padStart(6)
        console.log(`Progress [ ${timeTxt} ] ${nextProgressLine}`)
        nextProgressLine = null
    }
    prevTime = currentTime
}

function reportProgress(level: number, text: string, loc: Loc) {
    flushProgressReport()
    if (level <= showProgressVerbosity) {
        if (loc.filename !== "fe4-prelude.fe") {
            // console.log("NOT PRELUDE")
        }
        let progressLine = `${text.padEnd(10)} ${showLoc(loc)}`
        if (showProgressBefore) {
            let timeTxt = ".".padEnd(6)
            console.log(`Progress [ ${timeTxt} ] ${progressLine}`)
        }
        if (showProgressAfter) {
            nextProgressLine = progressLine
        }
    }
}

//#endregion



// #region Constructors and Utils


// Single is the subset of types which can be used in a SingleT type
// we could expand this to included arbitrary values,
// but for now, it is just intended for use with enum-like strings
export type Single = string

export type RuleName =
    "hdT" | "tlT"
    | "elemT" | "tupleMapT"
    | "unionT" | "intersectT" | "relcompT"
    | "domainT" | "rangeT" | "applyT" | "inverseT" | "inverseApplyT"
    | "ioWorld"
    | "primitiveT"
// | "seqT" // experimental



// // TODO ? add ki to every type ?
// export type TVar = { tag: "TVar", name: string, ki: boolean }
// export type TFun = { tag: "TFun", argType: Type, resultType: Type }
// export type TRule = { tag: "TRule", name: RuleName, args: Type[] }
// export type TInt = { tag: "TInt" }
// export type TStr = { tag: "TStr" }
// export type TBool = { tag: "TBool" }
// export type TNil = { tag: "TNil" }
// export type TPair = { tag: "TPair", hd: Type, tl: Type }
// export type TList = { tag: "TList", elem: Type }
// export type TAny = { tag: "TAny" }
// export type TVoid = { tag: "TVoid" }
// export type TAs = { tag: "TAs", name: string, type: Type }
// export type TSub = { tag: "TSub", type: Type, super: Type }
// export type TSuper = { tag: "TSuper", type: Type, sub: Type }
// export type TType = { tag: "TType" }
// export type TSingle = { tag: "TSingle", val: Single }
// export type TRec = { tag: "TRec", name: string, body: Type }
// export type TSelf = { tag: "TSelf", name: string, body: Type }
// export type TUnknown = { tag: "TUnknown" } // use unknown types for destructuring self-ref types
// export type TError = { tag: "TError" }
// // TError is used to suppress a cascade of errors, once one has been identified
// // TError is both universally acceptable and universally satisfiable
// // TError is considered inhabited so that expresions such as (Tail {[Error, Int]}) can return a non-void result.
// // This helps keep type-checking going in other parts of a list that may contain independent type-check errors of their own.
// // TODO ? For now Error is implicitly part of every type, much like Void.
// // TODO ? In future we might want to forbid errors, or provide the user the option to forbid errors

// // TODO ? 
// // TODO ? A type annotated with a term ?
// // TODO ?   dual to a term being annotated with a type.
// // TODO ? Might enable Fix and Self to be unified
// // TODO ? e.g.:
// // TODO ?     Self { A -> ... A ... } 
// // TODO ? becomes
// // TODO ?     Fix { {a:A} -> ... {a:_} ... }
// // TODO ? where {a:_} indicates the most precise type that can be given to the term (a),
// // TODO ? i.e. the singleton type containing only (a).
// // TODO ? using {a:_} within Fix gives  an unspecified least fixed point of a type (there are many least fixed points)
// // TODO ? using A     within Fix gives _the_        greatest fixed point of a type (there is only one greatest fixed point)
// // TODO ? 
// // TODO ? Perhaps define Self in terms of Fix:
// // TODO ?   Self MyTypeDefn = Fix { {a:A} -> MyTypeDefn {a:_} }
// // TODO ? 
// // TODO ? Maybe/Probably best to keep the Self notation, it seems simpler in practice.
// // TODO ? 
// export type TTerm = { tag: "TTerm", term: Expr }

// export type Type =
//     TVoid | TNil | TBool | TInt | TStr | TPair | TList | TFun | TAny
//     | TSub | TSuper | TType | TSingle
//     | TAs | TRec | TSelf | TVar
//     | TRule
//     | TUnknown
//     | TError


// TODO ? add ki to every type ?
export type TVarT<T> = T & { tag: "TVar", name: string, ki: boolean }
export type TFunT<T> = T & { tag: "TFun", argType: TypeT<T>, resultType: TypeT<T> }
export type TRuleT<T> = T & { tag: "TRule", name: RuleName, args: TypeT<T>[] }
export type TIntT<T> = T & { tag: "TInt" }
export type TCharT<T> = T & { tag: "TChar" }
export type TStrT<T> = T & { tag: "TStr" }
export type TBoolT<T> = T & { tag: "TBool" }
export type TNilT<T> = T & { tag: "TNil" }
export type TPairT<T> = T & { tag: "TPair", hd: TypeT<T>, tl: TypeT<T> }
export type TListT<T> = T & { tag: "TList", elem: TypeT<T> }
export type TAnyT<T> = T & { tag: "TAny" }
export type TVoidT<T> = T & { tag: "TVoid" }
export type TAsT<T> = T & { tag: "TAs", name: string, type: TypeT<T> }
export type TSubT<T> = T & { tag: "TSub", type: TypeT<T>, super: TypeT<T> }
export type TSuperT<T> = T & { tag: "TSuper", type: TypeT<T>, sub: TypeT<T> }
export type TTypeT<T> = T & { tag: "TType" }
export type TSingleT<T> = T & { tag: "TSingle", val: Single }
export type TRecT<T> = T & { tag: "TRec", name: string, body: TypeT<T> }
export type TSelfT<T> = T & { tag: "TSelf", name: string, body: TypeT<T> }
// // export type TSeqApplyT<T> = T & { tag: "TSeqApply", func: ex.ELambda<{}>, arg: TypeT<T> }
// // export type TSeqApplyT<T> = T & { tag: "TSeqApply", func: ev.ClosureValue | ev.PrimValue2, arg: ev.Node }
// export type TSeqApplyT<T> = T & { tag: "TSeqApply", func: ev.ClosureValue | ev.PrimValue2, arg: TypeT<T> }
export type TUnknownT<T> = T & { tag: "TUnknown" } // use unknown types for destructuring self-ref types
export type TErrorT<T> = T & { tag: "TError" }
// TError is used to suppress a cascade of errors, once one has been identified
// TError is both universally acceptable and universally satisfiable
// TError is considered inhabited so that expresions such as (Tail {[Error, Int]}) can return a non-void result.
// This helps keep type-checking going in other parts of a list that may contain independent type-check errors of their own.
// TODO ? For now Error is implicitly part of every type, much like Void.
// TODO ? In future we might want to forbid errors, or provide the user the option to forbid errors

// TODO ? 
// TODO ? A type annotated with a term ?
// TODO ?   dual to a term being annotated with a type.
// TODO ? Might enable Fix and Self to be unified
// TODO ? e.g.:
// TODO ?     Self { A -> ... A ... } 
// TODO ? becomes
// TODO ?     Fix { {a:A} -> ... {a:_} ... }
// TODO ? where {a:_} indicates the most precise type that can be given to the term (a),
// TODO ? i.e. the singleton type containing only (a).
// TODO ? using {a:_} within Fix gives  an unspecified least fixed point of a type (there are many least fixed points)
// TODO ? using A     within Fix gives _the_        greatest fixed point of a type (there is only one greatest fixed point)
// TODO ? 
// TODO ? Perhaps define Self in terms of Fix:
// TODO ?   Self MyTypeDefn = Fix { {a:A} -> MyTypeDefn {a:_} }
// TODO ? 
// TODO ? Maybe/Probably best to keep the Self notation, it seems simpler in practice.
// TODO ? 
export type TTermT<T> = T & { tag: "TTerm", term: ExprLoc, type: TypeT<T> }
export type TSingleTypeT<T> = T & { tag: "TSingleType", val: TypeT<T> }
export type TSingleTermVarT<T> = T & { tag: "TSingleTermVar", varName: string }

// TODO ? addr TTermVarT ?
//     export type TTermVarT<T> = T & { tag: "TTerm", varName: string, type: TypeT<T> }
// TTerm containing a Term means it also contains a location which impedes memoization on edited files.
// Is TTermVar sufficient for current purposes ?
// Is TTerm more general than currently needed ?

export type TTermVarT<T> = T & { tag: "TTermVar", varName: string, type: TypeT<T> }


export type TypeT<T> =
    TVoidT<T> | TNilT<T> | TBoolT<T> | TIntT<T> | TCharT<T> | TStrT<T> | TPairT<T> | TListT<T> | TFunT<T> | TAnyT<T>
    | TSubT<T> | TSuperT<T> | TTypeT<T> | TSingleT<T>
    | TAsT<T> | TRecT<T> | TSelfT<T> | TVarT<T>
    | TRuleT<T>
    | TUnknownT<T>
    | TErrorT<T>
    // | TSeqApplyT<T>
    | TTermT<T>
    | TTermVarT<T>
    | TSingleTypeT<T>
    | TSingleTermVarT<T>

type KnownInhabited = { ki: boolean }

// export type Type = TypeT<{}>
export type Type = TypeT<KnownInhabited>


// let typeMemoData: memo.MemoData = memo.memoCreate()
let typeMemoData: MemoData = mk_MemoData()

export function getTypeMemoData(): MemoData {
    return typeMemoData
}

function hcTy(ty: Type): Type {
    // return ty
    // let ty2 = memo.hashCons(typeMemoData, ty)
    let ty2 = typeMemoData.hashCons(ty)
    return ty2
}

// const kiFalse = {}
// const kiFalse = { ki: false }
// const kiTrue = { ki: true }

function addKnownInhabited(ty: TypeT<{}>, ki: boolean): TypeT<KnownInhabited> {
    let ty2 = { ...ty } as Type
    if (TRACK_TYPE_INHABITATION) {
        ty2.ki = ki
    }
    else {
        ty2.ki = false
    }
    ty2 = hcTy(ty2)
    return ty2
}

export function knownInhabited(ty: TypeT<{}>): TypeT<KnownInhabited> {
    switch (ty.tag) {
        case "TAs":
            return addKnownInhabited({ ...ty, type: knownInhabited(ty.type) }, true)
        case "TPair":
            return addKnownInhabited({ ...ty, hd: knownInhabited(ty.hd), tl: knownInhabited(ty.tl) }, true)
        case "TSub":
            return addKnownInhabited({ ...ty, type: knownInhabited(ty.type), super: knownInhabited(ty.super) }, true)
        case "TSuper":
            return addKnownInhabited({ ...ty, type: knownInhabited(ty.type), sub: ty.sub }, true)
        // case "TRule": {
        //     switch (ty.name) {
        //         case "intersectT": {
        //             let args = ty.args.map(ty2 => knownInhabited(ty2))
        //             return addKnownInhabited({ ...ty, args: args }, true)
        //         }
        //         case "tlT":
        //         case "hdT": {
        //             let args = ty.args.map(ty2 => knownInhabited(ty2))
        //             return addKnownInhabited({ ...ty, args: args }, true)
        //         }
        //         default:
        //             return addKnownInhabited(ty, true)
        //     }
        // }
        case "TRule": {
            switch (ty.name) {
                case "intersectT":
                case "tlT":
                case "hdT": {
                    let args = ty.args.map(ty2 => knownInhabited(ty2))
                    let [, ty3] = reduceTypeRule(ty.name, args)
                    return addKnownInhabited(ty3, true)
                }
                default:
                    return addKnownInhabited(ty, true)
            }
        }
        default:
            return addKnownInhabited(ty, true)
    }
}

function notKnownInhabited(ty: TypeT<{}>): TypeT<KnownInhabited> {
    return addKnownInhabited(ty, false)
}

function typeParts2(type: Type | Type[]): [string, string[], string[]] {
    if (type instanceof Array) {
        let children = Object.keys(type)
        // return ["[]", ["length"], children]
        // return ["Array", ["length"], children]
        return ["Array", [], children]
    }
    else {
        switch (type.tag) {
            case "TAny":
            case "TBool":
            case "TInt":
            case "TVoid":
            case "TNil":
            case "TChar":
            case "TStr":
            case "TType":
                return [type.tag, [], []]
            case "TFun":
                return [type.tag, [], ["argType", "resultType"]]
            case "TList":
                return [type.tag, [], ["elem"]]
            case "TPair":
                return [type.tag, [], ["hd", "tl"]]
            case "TRule":
                return [type.tag, ["name"], ["args"]]
            case "TSub":
                return [type.tag, [], ["type", "super"]]
            case "TSuper":
                return [type.tag, [], ["type", "sub"]]
            case "TVar":
                return [type.tag, ["name"], []]
            // case "TVar":
            //     return [type.tag, ["name", "ki"], []]
            case "TSingle":
                return [type.tag, ["val"], []]
            case "TRec":
            case "TSelf":
                return [type.tag, ["name"], ["body"]]
            case "TAs":
                return [type.tag, ["name"], ["type"]]
            case "TUnknown":
            case "TError":
                return [type.tag, [], []]
            // case "TSeqApply":
            //     return [type.tag, ["func"], ["arg"]]
            case "TTerm":
                return [type.tag, ["term"], ["type"]]
            case "TTermVar":
                return [type.tag, ["varName"], ["type"]]
            case "TSingleType":
                return [type.tag, [], ["val"]]
            case "TSingleTermVar":
                return [type.tag, ["varName"], []]
            default:
                throw new Error(`missing case: $ {type.tag}`)
        }
    }
}

function showTypeParts(type: Type): string {
    let [tag, fields, children] = typeParts2(type)
    let tyObj = type as any
    return `(${tag},[${fields.map(f => tyObj[f]).join(",")}],[${children.map(c => showTypeParts(tyObj[c])).join(",")}])`
}

export function showTypeDiff(out: Output, typ1: Type, typ2: Type): void {
    type Item = [number, string, Type | Type[], boolean]
    type Todo = Item[]
    let todo1: Todo = [[0, "", typ1, true]]
    let todo2: Todo = [[0, "", typ2, true]]

    function todoExpandTop(todo: Todo, inSync: boolean) {
        let [depth, fieldName, typ, _inSync] = todo.pop()!
        let [tag, attr, children] = typeParts2(typ)
        children.reverse().forEach(childName => {
            let childTy: Type | Type[] = (typ as any)[childName]
            todo.push([depth + 1, childName, childTy, inSync])
        })
    }

    function showItem(item: Item): string {
        let [depth, field, ty, inSync] = item
        let result = ""
        while (result.length < depth * 2) {
            result += " "
        }
        let [tag, attrs, children] = typeParts2(ty)
        result += `${field} = ${tag} ${attrs.map(a => (JSON.stringify((ty as any)[a]))).join(" ")}`
        return result
    }

    while (todo1.length !== 0 && todo2.length !== 0) {
        let top1 = todo1[todo1.length - 1]
        let top2 = todo2[todo2.length - 1]
        let [d1, f1, t1, inSync1] = top1
        let [d2, f2, t2, inSync2] = top2

        let [tag1, attrs1, children1] = typeParts2(t1)
        let [tag2, attrs2, children2] = typeParts2(t2)

        let vals1 = attrs1.map(a => (t1 as any)[a])
        let vals2 = attrs2.map(a => (t2 as any)[a])

        if (inSync1 && !inSync2) {
            let str2 = showItem(top2)
            out.line(".", 19)
            out.line(str2, 20)
            todoExpandTop(todo2, false)
        }
        else if (!inSync1 && inSync2) {
            let str1 = showItem(top1)
            out.line(str1, 0)
            out.line(".", 19)
            todoExpandTop(todo1, false)
        }
        else {
            let inSync = inSync1 && inSync2 && tag1 === tag2 && equalObjects(attrs1, attrs2) && equalObjects(vals1, vals2)
            let str1 = showItem(top1)
            let str2 = showItem(top2)
            let symbol: string
            if (inSync) {
                // we're still in sync
                symbol = "="
            }
            else if (inSync1 && inSync2 && !inSync) {
                // we've only just gone out of sync
                symbol = "X"
            }
            else {
                // we weren't in-sync to begin with
                symbol = "."
            }
            out.line(str1, 0)
            out.line(symbol, 19)
            out.line(str2, 20)
            todoExpandTop(todo1, inSync)
            todoExpandTop(todo2, inSync)
        }
    }
    while (todo1.length !== 0) {
        let item = todo1[todo1.length - 1]
        let str = showItem(item)
        out.line(str, 0)
        out.line(".", 19)
        todoExpandTop(todo1, false)
    }
    while (todo2.length !== 0) {
        let item = todo2[todo2.length - 1]
        let str = showItem(item)
        out.line(".", 19)
        out.line(str, 20)
        todoExpandTop(todo2, false)
    }
}

function findOpElems_All(ty: Type, opName: RuleName): Type[] {
    let result: Type[] = []
    let todo: Type[] = [ty]
    while (todo.length !== 0) {
        let elem = todo.pop()!
        if (elem.tag === "TRule" && elem.name === opName) {
            todo.push(elem.args[1])
            todo.push(elem.args[0])
        }
        else {
            result.push(elem)
        }
    }
    return result
}

function findOpElems_Left(ty: Type, opName: RuleName): Type[] {
    let result: Type[] = []
    while (ty.tag === "TRule" && ty.name === opName) {
        result.push(ty.args[0])
        ty = ty.args[1]
    }
    result.push(ty)
    return result
}

function findOpElems_Right(ty: Type, opName: RuleName): Type[] {
    let result: Type[] = []
    while (ty.tag === "TRule" && ty.name === opName) {
        result.push(ty.args[1])
        ty = ty.args[0]
    }
    result.push(ty)
    result = result.reverse()
    return result
}

export function showType3(type: Type, maxDepth: number | null = null, next?: ((t: Type) => Type), showInhabitedFlag: boolean = true): string {

    if (next !== undefined) {
        type = next(type)
    }

    let currentDepth = 0

    function st(ty: Type): string {
        currentDepth++
        let result: string
        if (maxDepth !== null && currentDepth > maxDepth) {
            result = "<...>"
        }
        else {
            if (next !== undefined) {
                ty = next(ty)
            }
            result = st1(ty)
        }
        currentDepth--
        return result
    }

    function st1(type: Type): string {
        switch (type.tag) {
            case "TInt":
                return "Int"
            case "TChar":
                return "Char"
            case "TStr":
                return "Str"
            case "TBool":
                return "Bool"
            case "TNil":
                return "[]"
            case "TAny":
                return "Any"
            case "TVoid":
                return "Void"
            case "TVar": {
                let inhabitedFlag = ""
                if (TRACK_TYPE_INHABITATION && showInhabitedFlag) {
                    // inhabitedFlag = type.ki ? "#" : ""
                    inhabitedFlag = type.ki ? "#" : "?"
                }
                return `${inhabitedFlag}${type.name}`
            }
            case "TFun": {
                let parts: string[] = []
                while (type.tag === "TFun") {
                    parts.push(st(type.argType))
                    type = type.resultType
                }
                parts.push(st(type))
                return `{ ${parts.join(" -> ")} }`
            }
            case "TPair": {
                let elems: string[] = []
                while (type.tag === "TPair") {
                    let elem = st(type.hd)
                    elems.push(elem)
                    type = type.tl
                }
                // let tail = type.tag === "TNil" ? "" : `, ...${st(type)}`
                let tail = type.tag === "TNil" ? "" : ` ,, ${st(type)}`
                return `{ [${elems.join(", ")}${tail}] }`
            }
            case "TList":
                return `{(List ${st(type.elem)})}`
            case "TRule":
                switch (type.name) {
                    case "applyT": {
                        let args: string[] = []
                        while (type.tag === "TRule" && type.name === "applyT") {
                            let f = st(type.args[1])
                            args.unshift(f)
                            type = type.args[0]
                        }
                        let fun = st(type)
                        let parts = [fun, ...args]
                        return `{ ${parts.join(" ")} }`
                    }
                    case "domainT":
                        return `(Domain ${st(type.args[0])})`
                    case "elemT":
                        return `(Elem ${st(type.args[0])})`
                    case "tupleMapT":
                        return `(TupleMap ${st(type.args[0])} ${st(type.args[1])})`
                    case "hdT":
                        return `(Hd ${st(type.args[0])})`
                    case "rangeT":
                        return `(Codomain ${st(type.args[0])})`
                    case "tlT":
                        return `(Tl ${st(type.args[0])})`
                    case "inverseT":
                        return `(Inverse ${st(type.args[0])})`
                    case "inverseApplyT":
                        return `(InverseApply ${st(type.args[0])} ${st(type.args[1])})`
                    case "relcompT": {
                        let parts: string[] = []
                        while (type.tag === "TRule" && type.name === "relcompT") {
                            parts.unshift(st(type.args[1]))
                            type = type.args[0]
                        }
                        parts.unshift(st(type))
                        return `{ ${parts.join(" \\ ")} }`
                    }
                    case "unionT": {
                        // TODO ? flatten this further, given we know union is associative ?
                        let parts: string[] = []


                        // parts = findOpElems_All(type, "unionT").map(ty => st(ty)) 
                        parts = findOpElems_Right(type, "unionT").map(ty => st(ty))

                        return `{ ${parts.join(" | ")} }`
                    }
                    case "intersectT": {
                        let parts: string[] = []
                        while (type.tag === "TRule" && type.name === "intersectT") {
                            parts.push(st(type.args[0]))
                            type = type.args[1]
                        }
                        parts.push(st(type))
                        return `{ ${parts.join(" & ")} }`
                    }
                    case "ioWorld":
                        return "{IO}"
                    // case "seqT":
                    //     return `(Seq ${st(type.args[0])} ${st(type.args[1])})`
                    case "primitiveT":
                        return `(primitive ${st(type.args[0])})`

                    default:
                        // return `${type.name} [${type.args.map(a => st(a)).join(",")}]`
                        throw new Error(`missing case $ {type.name}`)
                }
            case "TSub": {
                let parts: string[] = []
                while (type.tag === "TSub") {
                    parts.push(st(type.type))
                    type = type.super
                }
                parts.push(st(type))
                return `{${parts.join(" <: ")}}`
            }
            case "TSuper": {
                let parts: string[] = []
                while (type.tag === "TSuper") {
                    parts.push(st(type.type))
                    type = type.sub
                }
                parts.push(st(type))
                return `{${parts.join(" :> ")}}`
            }
            case "TType":
                return "Type"
            case "TSingle":
                return `{${JSON.stringify(type.val)}}`
            case "TRec":
                // return `{${type.name} @-> ${st(type.body)}}`
                // return `(Rec {${type.name} -> ${st(type.body)}})`
                return `(Fix (${type.name} -> ${st(type.body)}))`
            case "TSelf":
                // return `{${type.name}.. @-> ${st(type.body)}}`
                // return `(Self {${type.name} -> ${st(type.body)}})`
                return `(Self (_ : (${type.name} @ Type) -> ${st(type.body)})))`
            case "TAs":
                // return `{${type.name} @ ${st(type.type)}}`
                return `${type.name} @ ${st(type.type)}`
            case "TUnknown":
                return `{?}`
            case "TError":
                return `{ERROR}`
            // case "TSeqApply":
            //     // return `(SeqApply ${JSON.stringify(type.func)} ${JSON.stringify(type.arg)})`
            //     // return `(SeqApply ${JSON.stringify(type.func.tag)} ${JSON.stringify(type.arg.value.tag)})`
            //     return `(SeqApply ${JSON.stringify(type.func.tag)} ${st(type.arg)})`
            case "TTerm":
                // return `{${JSON.stringify(type.term)} : ${st(type.type)}}`
                return `{${showExpConcise(type.term)} : ${st(type.type)}}`
            case "TTermVar":
                // return `{${JSON.stringify(type.term)} : ${st(type.type)}}`
                return `{${type.varName} : ${st(type.type)}}`
            case "TSingleTermVar":
                // return `{${JSON.stringify(type.term)} : ${st(type.type)}}`
                return `(Single ${type.varName})`
            // return `(SingleTermVar ${type.varName})`

            case "TSingleType":
                // return `{${JSON.stringify(type.term)} : ${st(type.type)}}`
                return `(SingleType ${st(type.val)})`


            default:
                throw new Error(`missing case for $ {type.tag}`)
        }
    }

    return st(type)
}

function showType2full(type: Type): string {
    return showType3(type, null)
}

export function showType2(type: Type, next?: ((t: Type) => Type), showInhabitedFlag: boolean = true): string {
    return showType3(type, 10, next, showInhabitedFlag)
}


type DisplayTree =
    { tag: "Leaf", value: string | null }
    // | { tag: "Branch", open: string, close: string, separator: string, children: DisplayTree[] }
    | { tag: "Branch", children: [string, DisplayTree][] }

function convertTypeToDisplayTree(ty: Type, maxDepth: number | null): DisplayTree {
    let leaf = (value: string): DisplayTree => ({ tag: "Leaf", value: value })
    // let branch = (open: string, separator: string, close: string, children: DisplayTree[]): DisplayTree => 
    //     ({ tag: "Branch", open: open, separator: separator, close: close, children: children })
    let branch = (children: [string, DisplayTree][]): DisplayTree =>
        ({ tag: "Branch", children: children })
    let zipBrackets = (open: string, separator: string, close: string, children: DisplayTree[]): [string, DisplayTree][] => {
        if (children.length === 0) {
            return []
        }
        else {
            let elems: [string, DisplayTree][] = []
            elems.push([open, children[0]])
            children.slice(1).forEach(c => {
                elems.push([separator, c])
            })
            elems.push([close, leaf("")])
            return elems
        }
    }
    function convert(ty: Type, depth: number): DisplayTree {
        let conv = (ty: Type) => convert(ty, depth + 1)
        if (maxDepth !== null && depth > maxDepth) {
            return { tag: "Leaf", value: null }
        }
        let inhabitedFlag = ""
        if (TRACK_TYPE_INHABITATION) {
            // inhabitedFlag = type.ki ? "#" : ""
            inhabitedFlag = ty.ki ? "#" : "?"
        }

        switch (ty.tag) {
            case "TInt":
                return leaf("Int")
            case "TChar":
                return leaf("Char")
            case "TStr":
                return leaf("Str")
            case "TBool":
                return leaf("Bool")
            case "TNil":
                return leaf("[]")
            case "TAny":
                return leaf("Any")
            case "TVoid":
                return leaf("Void")
            case "TVar": {
                return leaf(`${inhabitedFlag}${ty.name}`)
            }
            case "TFun": {
                let parts: DisplayTree[] = []
                while (ty.tag === "TFun") {
                    parts.push(conv(ty.argType))
                    ty = ty.resultType
                }
                parts.push(conv(ty))
                // return branch(zipBrackets("{", "->", "}", parts))
                return branch(zipBrackets(`${inhabitedFlag}{`, "->", "}", parts))
                // return branch("{", "->", "}", parts)
            }
            // case "TPair": {
            //     let elems: DisplayTree[] = []
            //     while (ty.tag === "TPair") {
            //         let elem = conv(ty.hd)
            //         elems.push(elem)
            //         ty = ty.tl
            //     }
            //     if (ty.tag!=="TNil") {
            //         let tail = leaf(`...${conv(ty)}`)
            //         elems.push(tail)
            //     }
            //     return branch(zipBrackets("[", ",", "]", elems))
            // }
            case "TPair": {
                let elems: [string, DisplayTree][] = []
                let label = `${inhabitedFlag}[`
                while (ty.tag === "TPair") {
                    let elem = conv(ty.hd)
                    elems.push([label, elem])
                    ty = ty.tl
                    label = ","
                }
                if (ty.tag !== "TNil") {
                    let tail = conv(ty)
                    // let tail = leaf(`...${conv(ty)}`)
                    elems.push([",...", tail])
                }
                elems.push(["]", leaf("")])
                return branch(elems)
            }
            case "TList": {
                return branch(zipBrackets(`${inhabitedFlag}{(List`, "", ")}", [conv(ty.elem)]))
            }
            case "TRule":
                switch (ty.name) {
                    case "applyT": {
                        let args: DisplayTree[] = []
                        while (ty.tag === "TRule" && ty.name === "applyT") {
                            let f = conv(ty.args[1])
                            args.unshift(f)
                            ty = ty.args[0]
                        }
                        let fun = conv(ty)
                        let parts = [fun, ...args]
                        return branch(zipBrackets(`${inhabitedFlag}{`, " ", "}", parts))
                    }
                    case "domainT":
                        return branch(zipBrackets(`${inhabitedFlag}(Domain`, "", ")", [conv(ty.args[0])]))

                    case "elemT":
                        return branch(zipBrackets(`${inhabitedFlag}(Elem`, "", ")", [conv(ty.args[0])]))
                    case "tupleMapT":
                        return branch(zipBrackets(`${inhabitedFlag}(TupleMap`, "", ")", [conv(ty.args[0]), conv(ty.args[1])]))
                    case "hdT":
                        return branch(zipBrackets(`${inhabitedFlag}(Hd`, "", ")", [conv(ty.args[0])]))
                    case "rangeT":
                        return branch(zipBrackets(`${inhabitedFlag}(Codomain`, "", ")", [conv(ty.args[0])]))
                    case "tlT":
                        return branch(zipBrackets(`${inhabitedFlag}(Tl`, "", ")", [conv(ty.args[0])]))
                    case "inverseT":
                        return branch(zipBrackets(`${inhabitedFlag}(Inverse`, "", ")", [conv(ty.args[0])]))
                    case "relcompT": {
                        let parts: DisplayTree[] = []
                        while (ty.tag === "TRule" && ty.name === "relcompT") {
                            parts.unshift(conv(ty.args[1]))
                            ty = ty.args[0]
                        }
                        parts.unshift(conv(ty))
                        return branch(zipBrackets(`${inhabitedFlag}{`, "\\", "}", parts))
                    }
                    case "unionT": {
                        let parts: DisplayTree[] = []
                        while (ty.tag === "TRule" && ty.name === "unionT") {
                            parts.push(conv(ty.args[0]))
                            ty = ty.args[1]
                        }
                        parts.push(conv(ty))
                        return branch(zipBrackets(`${inhabitedFlag}{`, "|", "}", parts))
                    }
                    case "intersectT": {
                        let parts: DisplayTree[] = []
                        while (ty.tag === "TRule" && ty.name === "intersectT") {
                            parts.push(conv(ty.args[0]))
                            ty = ty.args[1]
                        }
                        parts.push(conv(ty))
                        return branch(zipBrackets(`${inhabitedFlag}{`, "&", "}", parts))
                    }
                    case "ioWorld":
                        return leaf("{IO}")
                    // case "seqT":
                    //     return branch(zipBrackets(`${inhabitedFlag}(Seq`, "", ")", [conv(ty.args[0]), conv(ty.args[1])]))

                    default:
                        // return `${type.name} [${type.args.map(a => st(a)).join(",")}]`
                        throw new Error(`missing case $ {ty.name}`)
                }
            case "TSub": {
                let parts: DisplayTree[] = []
                while (ty.tag === "TSub") {
                    parts.push(conv(ty.type))
                    ty = ty.super
                }
                parts.push(conv(ty))
                return branch(zipBrackets(`${inhabitedFlag}{`, "<:", "}", parts))
            }
            case "TSuper": {
                let parts: DisplayTree[] = []
                while (ty.tag === "TSuper") {
                    parts.push(conv(ty.type))
                    ty = ty.sub
                }
                parts.push(conv(ty))
                return branch(zipBrackets(`${inhabitedFlag}{`, ":>", "}", parts))
            }
            case "TType":
                return leaf("Type")
            case "TSingle":
                return leaf(`{${JSON.stringify(ty.val)}}`)
            case "TRec":
                return branch(zipBrackets(`${inhabitedFlag}(Rec`, "->", ")", [leaf(ty.name), conv(ty.body)]))
            case "TSelf":
                return branch(zipBrackets(`${inhabitedFlag}(Self`, "->", ")", [leaf(ty.name), conv(ty.body)]))
            case "TAs":
                return branch(zipBrackets(`${inhabitedFlag}{`, "@", "}", [leaf(ty.name), conv(ty.type)]))
            case "TUnknown":
                return leaf(`${inhabitedFlag}{?}`)
            case "TError":
                return leaf(`{ERROR}`)
            // case "TSeqApply":
            //     return branch(zipBrackets("(SeqApply", " ", ")", [leaf("_"), conv(ty.arg)]))
            case "TTerm": {
                if (ty.term.tag === "EType" && ty.term.expr.tag === "EVar") {
                    return branch(zipBrackets(`${inhabitedFlag}{`, ":", "}", [leaf(ty.term.expr.name), conv(ty.type)]))
                }
                else {
                    // return branch(zipBrackets(`${inhabitedFlag}{`, ":", "}", [leaf("<term>"), conv(ty.type)]))
                    return branch(zipBrackets(`${inhabitedFlag}{`, ":", "}", [leaf(showExpConcise(ty.term)), conv(ty.type)]))
                }
            }
            case "TTermVar": {
                return branch(zipBrackets(`${inhabitedFlag}{`, ":", "}", [leaf(ty.varName), conv(ty.type)]))
            }
            case "TSingleTermVar": {
                // return branch(zipBrackets(`${inhabitedFlag}{`, ":", "}", [leaf(ty.varName), leaf("_")]))
                return leaf(`(Single ${ty.varName})`)
                // return leaf(`(SingleTermVar ${ty.varName})`)
            }
            case "TSingleType": {
                return branch(zipBrackets("(SingleType", "", ")", [conv(ty.val)]))
            }
            default:
                throw new Error(`missing case for $ {type.tag}`)

        }
    }
    return convert(ty, 0)
}

function showDisplayTree(dt: DisplayTree, maxDepth: number | null, maxWidth: number | null): string[] {
    let show = showDisplayTree
    let maxDepth1 = maxDepth === null ? null : maxDepth + 1
    switch (dt.tag) {
        case "Leaf": {
            if (dt.value === null) {
                return ["<...>"]
            }
            else {
                return [dt.value]
            }
        }
        case "Branch": {
            let parts: [string, string[]][] = dt.children.map(c => [c[0], show(c[1], maxDepth1, maxWidth)])
            let allFlat = parts.every(p => p[1].length === 1)
            if (allFlat) {
                let parts2 = ([] as string[]).concat(...parts.map(p => [p[0], ...p[1]]))
                let result = parts2.join(" ")
                if (maxWidth === null || result.length < maxWidth) {
                    return [result]
                }
            }
            let lines: string[] = []
            parts.forEach((part, i) => {
                // lines.push(part[0])
                let label = part[0].padEnd(4)
                let indent = "".padEnd(label.length)
                lines.push(`${label} ${part[1][0]}`)
                part[1].slice(1).forEach(p => {
                    lines.push(`${indent} ${p}`)
                })
            })
            return lines
        }
        default:
            throw new Error("missing case")
    }
}

export function showType4(ty: Type, maxDepth: number | null, maxWidth: number | null): string {
    let dt = convertTypeToDisplayTree(ty, maxDepth)
    let lines = showDisplayTree(dt, maxDepth, maxWidth)
    let result = lines.join("\n")
    return result
}

export function showType5(ty: Type, indent: number, maxDepth: number | null, maxWidth: number | null): string {
    let dt = convertTypeToDisplayTree(ty, maxDepth)
    let lines = showDisplayTree(dt, maxDepth, maxWidth)
    let indentStr = " ".repeat(indent)
    let result = lines.map(l => indentStr + l).join("\n")
    return result
}












// export const typeT: Type = { ...kiTrue, ...{ tag: "TType" } }
// export const boolT: Type = { ...kiTrue, ...{ tag: "TBool" } }
// export const intT: Type = { ...kiTrue, ...{ tag: "TInt" } }
// export const strT: Type = { ...kiTrue, ...{ tag: "TStr" } }
// export const anyT: Type = { ...kiTrue, ...{ tag: "TAny" } }
// export const voidT: Type = { ...kiFalse, ...{ tag: "TVoid" } }
// export const nilT: Type = { ...kiTrue, ...{ tag: "TNil" } }
// export const unknownT: Type = { ...kiFalse, ... { tag: "TUnknown" } }
// export const errorT: Type =  { ...kiFalse, ...{ tag: "TError" } }

export const typeT: Type = knownInhabited({ tag: "TType" })
export const boolT: Type = knownInhabited({ tag: "TBool" })
export const intT: Type = knownInhabited({ tag: "TInt" })
export const charT: Type = knownInhabited({ tag: "TChar" })
export const strT: Type = knownInhabited({ tag: "TStr" })
export const anyT: Type = knownInhabited({ tag: "TAny" })
export const nilT: Type = knownInhabited({ tag: "TNil" })

export const voidT: Type = notKnownInhabited({ tag: "TVoid" })
export const unknownT: Type = notKnownInhabited({ tag: "TUnknown" })
export const errorT: Type = notKnownInhabited({ tag: "TError" })

export const ioWorldT: Type = ruleT("ioWorld", [])

export let relcompT = (a: Type, b: Type) => ruleT("relcompT", [a, b])
export let unionT = (a: Type, b: Type) => ruleT("unionT", [a, b])
export let maybeT = (a: Type) => ruleT("unionT", [nilT, pairT(a, nilT)])
export let intersectT = (a: Type, b: Type) => ruleT("intersectT", [a, b])
export let applyT = (a: Type, b: Type) => ruleT("applyT", [a, b])
export let rangeT = (a: Type) => ruleT("rangeT", [a])
export let domainT = (a: Type) => ruleT("domainT", [a])
export let hdT = (a: Type) => ruleT("hdT", [a])
export let tlT = (a: Type) => ruleT("tlT", [a])

// monomorphic functions
export function funT(argT: Type, resultT: Type): Type {
    return notKnownInhabited({ tag: "TFun", argType: argT, resultType: resultT })
}

// polymorphic functions
export function funPT(argTypeName: string, argT: Type, resultT: Type): Type {
    return notKnownInhabited({ tag: "TFun", argType: asT(argTypeName, selfT(argTypeName, argT)), resultType: resultT })
}

// dependent type functions
export function funDT(tyVar: string, argT: Type, resultT: Type): Type {
    return notKnownInhabited({ tag: "TFun", argType: termVarT(tyVar, argT), resultType: resultT })
}


// export function varT(v: string): Type {
//     return { tag: "TVar", name: v }
// }
export function varT(v: string, ki: boolean = false): Type {
    if (!TRACK_TYPE_INHABITATION) {
        ki = false
    }
    return hcTy({ tag: "TVar", name: v, ki: ki })
}

export function asVarT(v: string): Type {
    return varT(v, true)
}

export function pairT(h: Type, t: Type): Type {
    // if either part of a pair is void, the whole type is void.
    // doing this somewhere is required to make intersecting sum-product types have the required narrowing effect.
    // however, we shouldn't do it everywhere, 
    // specifically we mustn't do it in the argument part of a function
    // { [Int, Void] -> Any } is a valid funcion type, and mustn't be reduced to { Void -> Any }
    // CORRECTION, [Int, Void] should reduce to Void, even when used in a function domain.
    // the function intended above should instead be written
    // F@{ [Int, (Hd (Tl (Domain F)))] -> Any }
    if (h.tag === "TVoid" || t.tag === "TVoid") {
        return voidT
    }
    if (h.tag === "TSingleType" && t.tag === "TSingleType") {
        return singleTypeT(pairT(h.val, t.val))
    }
    let ki = h.ki && t.ki
    return hcTy({ ki: ki, tag: "TPair", hd: h, tl: t })
}

export function tuple2T(a: Type, b: Type): Type {
    return pairT(a, pairT(b, nilT))
}

export function listT(e: Type): Type {
    return knownInhabited({ tag: "TList", elem: e })
}

export function ruleT(name: RuleName, args: Type[]): Type {
    return notKnownInhabited({ tag: "TRule", name: name, args: args })
}

export function asT(typeName: string, type: Type): Type {
    // if (type.tag==="TAs" && type.name===typeName) {
    //     return type
    // }
    if (type.tag === "TAs") {
        throw new Error("nested as-types not yet supported")
    }
    return addKnownInhabited({ tag: "TAs", name: typeName, type: type }, type.ki)
}

// a type annotated with a term
export function termT(term: ExprLoc, type: Type): Type {
    return notKnownInhabited({ tag: "TTerm", term: term, type: type })
}

// a type annotated with a term variable
export function termVarT(varName: string, type: Type): Type {
    return notKnownInhabited({ tag: "TTermVar", varName: varName, type: type })
}


export function subT(type: Type, super1: Type): Type {
    // if (equalType(type, super1) || type.tag === "TSub" && equalType(type.super, super1)) {
    //     return type
    // }

    // console.log("subT sub   :", showType2(type))
    // console.log("subT super :", showType2(super1))

    if (equalObjects(type, super1) || type.tag === "TSub" && equalObjects(type.super, super1)) {
        return type
    }
    if (super1.tag === "TSub" && equalObjects(type, super1.type)) {
        return super1
    }
    if (super1.tag === "TAny" /* && typeIsClosed(type)*/) {
        return type
    }
    if (super1.tag === "TUnknown") {
        return type
    }
    if (type.tag === "TSingle" && super1.tag === "TStr") {
        return type
    }

    if (super1.tag === "TSub") {
        // Keep the super-most type at the root of the type.
        // This ensures the rules related to self-ref super-types are invoked
        //   as needed when projecting from sub-types of self-ref types.
        // e.g. { Tail { A <: B <: SomeSelfRefType } }
        return subT(subT(type, super1.type), super1.super)
    }

    if (super1.tag === "TVoid") {
        // console.log("VOID SUPER-TYPE")
        return voidT
    }

    // if (super1.tag==="TRule" && super1.name==="intersectT") {
    //     return intersectT(subT(type, super1.args[0]), subT(type, super1.args[1]))
    // }

    return addKnownInhabited({ tag: "TSub", type: type, super: super1 }, type.ki)
}

export function superT(type: Type, sub: Type): Type {

    // console.log("superT sub   :", showType2(sub))
    // console.log("superT super :", showType2(type))

    if (equalType(type, sub) || type.tag === "TSuper" && equalType(type.sub, sub)) {
        return type
    }
    if (sub.tag === "TVoid" /* && typeIsClosed(type)*/) {
        return type
    }
    if (type.tag === "TAny") {
        return type
    }
    // TODO ?
    // if (type.tag === "TVoid") {
    //     return voidT
    // }
    return addKnownInhabited({ tag: "TSuper", type: type, sub: sub }, type.ki)
}


export function singleT(val: Single): Type {
    return knownInhabited({ tag: "TSingle", val: val })
}

export function singleTermVarT(varName: string): Type {
    return knownInhabited({ tag: "TSingleTermVar", varName: varName })
}

export function singleTypeT(val: Type): Type {
    return knownInhabited({ tag: "TSingleType", val: val })
    // return notKnownInhabited({ tag: "TSingleType", val: val })
}

export function recT(name: string, body: Type): Type {
    let fv = typeFreeVars(body)
    if (body.tag === "TRec") {
        console.log("TRec nested")
        // return { tag: "TRec", name: name, body: substType(body.body, body.name, varT(name), false) }
    }
    if (fv.indexOf(name) === -1) {
        return body
    }
    else {
        return addKnownInhabited({ tag: "TRec", name: name, body: body }, body.ki)
    }
}

export function selfT(name: string, body: Type): Type {
    let fv = typeFreeVars(body)
    if (body.tag === "TSelf") {
        console.log("TSelf nested")
        // return { tag: "TSelf", name: name, body: substType(body.body, body.name, varT(name), false) }
    }
    if (fv.indexOf(name) === -1) {
        return body
    }
    else {
        return notKnownInhabited({ tag: "TSelf", name: name, body: body })
    }
}

//  // export function seqApplyT(func: ex.ELambda<{}>, arg: Type): Type {
//  //     let result: TSeqApplyT<{}> = { tag: "TSeqApply", func: func, arg: arg }
//  //     let result2 = notKnownInhabited(result)
//  //     return result2
//  // }
//  // export function seqApplyT(func: ev.ClosureValue | ev.PrimValue2, argNode: Node): Type {
//  // let arg = ev.evalNode(argNode)
//  // if (arg.tag !== "type") {
//  //     throw new Error(`seqApplyT, arg: expected type, not (${arg.tag})`)
//  // }
//  export function seqApplyT(func: ev.ClosureValue | ev.PrimValue2, arg: Type): Type {
//      let argType = arg
//      let argNode = node(typeValue(argType))
//      switch (argType.tag) {
//          // case "TAny":
//          // case "TPair": {
//          //     let node: ev.Node = ev.applyClosure (func, argNode)
//          //     let result: ev.Value = ev.evalNode(node)
//          //     if (result.tag !== "type") {
//          //         throw new Error(`seqApplyT, result: expected type, not (${result.tag})`)
//          //     }
//          //     return result.type
//          // }
//          default:
//          case "TRule": {
//              let result: TSeqApplyT<{}> = { tag: "TSeqApply", func: func, arg: argType }
//              let result2 = notKnownInhabited(result)
//              return result2
//          }
//          // default:
//          // throw new Error(`missing case ${arg.tag}`)
//      }
//  }


export function lit(value: any): ExprLoc {
    return { tag: "EDatum", value: value, loc: nilLoc }
}





// return the names that will be bound when this type-pattern is bound
function typePatBoundVars(ty: Type): string[] {
    switch (ty.tag) {
        case "TAs": {
            let bv = typePatBoundVars(ty.type)
            bv.push(ty.name)
            return bv
        }
        case "TPair": {
            let bv1 = typePatBoundVars(ty.hd)
            let bv2 = typePatBoundVars(ty.tl)
            return [...bv1, ...bv2]
        }

        default:
            return []
        // throw new Error(`unexpected case ${ty.tag}`)
    }
}

export function typeFreeVars(ty: Type): string[] {
    let result: string[] = []
    typeFreeVars1(ty, [], result)
    return result
}


function typeFreeVars1(ty: Type, boundVars: string[], freeVars: string[]): void {
    switch (ty.tag) {
        case "TAny":
        case "TInt":
        case "TChar":
        case "TStr":
        case "TBool":
        case "TNil":
        case "TVoid":
            break
        case "TVar":
            if (boundVars.indexOf(ty.name) === -1 && freeVars.indexOf(ty.name) === -1) {
                freeVars.push(ty.name)
            }
            return
        case "TFun": {
            typeFreeVars1(ty.argType, boundVars, freeVars)
            let bvs = typePatBoundVars(ty.argType)
            let boundVars2 = [...bvs, ...boundVars]
            typeFreeVars1(ty.resultType, boundVars2, freeVars)
            return
        }
        case "TPair":
            typeFreeVars1(ty.hd, boundVars, freeVars)
            typeFreeVars1(ty.tl, boundVars, freeVars)
            return
        case "TList":
            typeFreeVars1(ty.elem, boundVars, freeVars)
            return
        case "TRule":
            ty.args.forEach(ty2 => {
                typeFreeVars1(ty2, boundVars, freeVars)
            })
            return
        case "TSub":
            typeFreeVars1(ty.super, boundVars, freeVars)
            typeFreeVars1(ty.type, boundVars, freeVars)
            return
        case "TSuper":
            typeFreeVars1(ty.sub, boundVars, freeVars)
            typeFreeVars1(ty.type, boundVars, freeVars)
            return
        case "TType":
        case "TSingle":
        case "TUnknown":
        case "TError":
            return
        case "TRec": {
            let boundVars2 = [ty.name, ...boundVars]
            typeFreeVars1(ty.body, boundVars2, freeVars)
            return
        }
        case "TSelf": {
            let boundVars2 = [ty.name, ...boundVars]
            typeFreeVars1(ty.body, boundVars2, freeVars)
            return
        }
        case "TAs": {
            let boundVars2 = [ty.name, ...boundVars]
            typeFreeVars1(ty.type, boundVars2, freeVars)
            return
        }
        // case "TSeqApply": {
        //     // TODO ? find free type-vars in func ?
        //     // typeFreeVars1(ty.func, boundVars, freeVars)
        //     typeFreeVars1(ty.arg, boundVars, freeVars)
        //     return
        // }

        case "TTerm":
        case "TTermVar":
        // TODO ? what should we do with term-variables within a type ?
        case "TSingleType":
            return
        case "TSingleTermVar":
            freeVars.push(ty.varName)
            return
        default:
            throw new Error(`missing case for $ {ty.tag}`)
    }
}





function typeIsClosed(ty: Type): boolean {
    let vars = typeFreeVars(ty)
    return vars.length === 0
}

function typeNameOccursIn(typeName: string, ty: Type): boolean {
    let vars = typeFreeVars(ty)
    return vars.indexOf(typeName) !== -1
}

// return name, or name$<number> such that it does not occur within varNames
function uniqName(name: string, varNames: string[]): string {
    let n = 0
    let origName = name
    while (varNames.indexOf(name) !== -1) {
        n++
        name = `${origName}$${n}`
    }
    return name
}

// TODO ?
// use singleT for more than just string values
function typeOfValue(value: any): Type {
    switch (typeof (value)) {
        case "boolean":
            return boolT
        case "function":
            return funT(voidT, anyT)
        case "number":
            return intT
        case "string":
            // return strT
            if (value.length === 1) {
                // this should be fine, as long as we never use single-character strings are singleton-types
                return charT
            }
            return singleT(value)
        case "object":
        case "symbol":
        case "undefined":
        default:
            if (value === null) {
                return nilT
            }
            throw new Error(`unexpected value ${JSON.stringify(value)}`)
    }
}




// Returns a type that satisfies the given pattern.
function typeMaybePat(pat: ExprLoc): Type {
    switch (pat.tag) {
        case "EDatum":
            return typeOfValue(pat.value)
        case "EVar":
            return anyT
        case "EList": {
            let elemsTy = pat.exprs.map(typeMaybePat)
            let tailTy = pat.tail === null ? nilT : typeMaybePat(pat.tail)
            let ty = elemsTy.reduceRight((list, elem) => pairT(elem, list), tailTy)
            return ty
        }
        case "ETermBrackets":
            return typeMaybePat(pat.expr)
        case "EType":
            return typeMaybePat(pat.expr)
        case "EAs":
            return typeMaybePat(pat.expr)

        default:
            throw new Error(`missing case ${pat.tag}`)
    }
}




function getTypeOrError(expr: ExprTypeBidir): Type {
    switch (expr.tc) {
        case null:
        case "ok":
            return expr.ty1
        // case "warn":
        case "unproven":
            // if (ignoreUnproven) {
            //     return expr.ty1
            // }
            // else {
            return errorT
        // }
        case "error":
            // If an error has already been detected, 
            //   suppress a cascade of further errors,
            //   by returning a universally acceptable and universally satisfiable type.
            return errorT

        default:
            throw new Error(`missing case ${expr.tc}`)
    }
}


// Takes a declarations and environment, 
// Return an environment containing only the referenced variables.
// This increases opportunities for memoization as changes in earlier source files
//   now no longer automatically cause a change to the arguments passed
//   to the type-checker for later source files.
export function trimEnviron(expr_decl: Decl<LocField>, env: Env): Env {
    let [pat, defn] = expr_decl
    let freeVars: VarSet = {}
    let boundVars: VarSet = {}
    // for (let name in env) {
    //     boundVars[name] = null
    // }
    let patVars: VarSet = {}
    patBindVars("Term", pat, boundVars, freeVars, patVars)
    exprFreeVars("Term", defn, boundVars, freeVars)
    let env2: Env = {}
    for (let name in env) {
        // Kepp the freeVars and all operators (operators aren't currently collected into freeVars)
        if (name in freeVars || !isAlphaUS(name[0])) {
            env2[name] = env[name]
        }
        else {
            // console.log(`Trimmed ${name}`)
        }
    }
    return env2
}





//#endregion



//#region Reduction



export function nodeToType(node: Node): Type {
    let val: Value = evalNode(node)
    if (val.tag === "type") {
        return val.type
    }
    else if (val.tag === "termVar") {
        return singleTermVarT(val.varName)
    }
    else {
        throw new Error(`expected type, not: ${JSON.stringify(val.tag)}`)
    }
}

function unrollRecursiveType(ty: TRecT<KnownInhabited>): Type {
    if (ty.body.tag === "TRec") {
        throw new Error("Error: directly nested recursive type")
    }
    let ty2 = substType(ty.body, ty.name, ty, false)
    return ty2
}


// type ReductionCache = { [key: string]: ([boolean, Type] | null) }
// let reductionCache: ReductionCache = {}

let reductionInProgress: Map<MemoID, string | null> = new Map()
let reductionMemo: Map<MemoID, [boolean, Type]> = new Map()
// let rmd: memo.MemoData = memo.memoCreate()
let rmd: MemoData = mk_MemoData()



export let useReductionMemo = true

let nextRecursiveTypeName = 1
function genRecursiveTypeName(): string {
    let result = `$RecVar$${nextRecursiveTypeName}`
    nextRecursiveTypeName++
    return result
}

let rtrDepth = 0

const TIE_RECUSIVE_TYPE_KNOT = false

export let reduceTypeRule = typeMemoData.memoizeFunction("red", reduceTypeRule1)
// export let reduceTypeRule = reduceTypeRule1

export function reduceTypeRule1(ruleName: RuleName, args: Type[]): [boolean, Type] {
    // let key = `${ruleName} [${args.map(showTypeParts).join(", ")}]`
    args = rmd.hashCons(args)
    let key2 = rmd.getMemoID([ruleName, args]);

    rtrDepth++

    // console.log(`${rtrDepth} Reduce: Start: ${ruleName} ${args.map(showType2).join(" ")}`)

    let rmResult = reductionMemo.get(key2)
    if (useReductionMemo && rmResult !== undefined) {

        // console.log(`${rtrDepth} Reduce: End(memoized): ${ruleName} ${showType2(rmResult[1])}`)
        rtrDepth--
        return rmResult
    }
    if (reductionInProgress.has(key2)) {
        if (TIE_RECUSIVE_TYPE_KNOT) {
            let recVar = genRecursiveTypeName()
            reductionInProgress.set(key2, recVar)
            // console.log(`${rtrDepth} Reduce: End(inProgress): ${ruleName} ${recVar}`)
            rtrDepth--
            return [true, varT(recVar)]
        }
        else {
            return [true, unknownT]
        }
    }

    // if (reductionCache.hasOwnProperty(key)) {
    //     let result = reductionCache[key]
    //     if (result === null) {
    //         // we are trying to reduce a rule which is already in progress
    //         // the result of this rule reduction evidently depends on its own result
    //         //TODO ? form a recursive data-type ?
    //         // for now just returning unknown is sufficient for all current tests
    //         return [true, unknownT]
    //     }
    //     else {
    //         return result
    //     }
    // }

    // reductionCache[key] = null
    reductionInProgress.set(key2, null)

    function rtr(): Type | null {
        // let ki = false
        // if (TRACK_TYPE_INHABITATION) {
        //     ki = args[0].ki
        // }
        switch (ruleName) {
            case "hdT":
                if (args.length === 1) {
                    return typeHd(args[0])
                }
                else {
                    throw new Error(`incorrect number of arguments to ${ruleName}, expected ${1}, got ${args.length}`)
                }
                break
            case "tlT":
                if (args.length === 1) {
                    let arg = args[0]
                    return typeTl(arg)
                }
                else {
                    throw new Error(`incorrect number of arguments to ${ruleName}, expected ${1}, got ${args.length}`)
                }
                break
            case "unionT": {
                let result = voidT
                for (let arg of args) {
                    result = unionTypes(result, arg)
                }
                return result
            }
            // case "intersectT": {
            //     let result = anyT
            //     for (let arg of args) {
            //         result = intersectTypes1(result, arg)
            //     }
            //     return result
            // }
            case "intersectT": {
                let result = tryTypeIntersect(args[0], args[1])
                return result
            }
            case "relcompT": {
                if (args.length === 2) {
                    return typeRelComp(args[0], args[1])
                }
                else {
                    throw new Error(`incorrect number of arguments to ${ruleName}, expected ${2}, got ${args.length}`)
                }
                break
            }
            case "elemT": {
                if (args.length === 1) {
                    let arg = args[0]
                    return typeElem(arg)
                }
                break
            }
            case "tupleMapT": {
                if (args.length === 2) {
                    return typeTupleMap(args[0], args[1])
                }
                break
            }
            case "domainT":
                if (args.length === 1) {
                    let arg = args[0]
                    return typeDom(arg)
                }
                break
            case "rangeT":
                if (args.length === 1) {
                    let arg = args[0]
                    return typeRng(arg)
                }
                break

            case "applyT": {
                let rT = applyTypes(args[0], args[1])
                return rT
            }
            case "inverseT":
                return typeInverse(args[0])
            case "ioWorld":
                return ioWorldT
            case "primitiveT": {
                const a = args[0]
                if (a.tag === "TSingle") {
                    const name = a.val
                    const entry = lookupPrimEnv(name)
                    if (entry === null) {
                        console.error(`Unknown primitive (${name})`)
                        throw new Error(`Unknown primitive (${name})`)
                        return voidT
                    }
                    return entry[1]
                }
                break
            }
            // case "asT":
            //     if (args.length === 2) {
            //         return typeAs1(args[0], args[1])
            //     }
            //     else {
            //         throw new Error(`incorrect number of arguments to ${ruleName}, expected ${2}, got ${args.length}`)
            //     }

            default:
                throw new Error(`unknown type rule ${ruleName}`)
        }
        return notKnownInhabited({ tag: "TRule", name: ruleName, args: args })
    }

    let resultTy = rtr()
    let result: [boolean, Type]
    if (resultTy === null) {
        result = [false, ruleT(ruleName, args)]
    }
    else {
        result = [true, resultTy]
    }
    // reductionCache[key] = result
    reductionMemo.set(key2, result)
    let recVar = reductionInProgress.get(key2)
    reductionInProgress.delete(key2)
    if (recVar === undefined) {
        throw new Error("impossible")
    }
    if (recVar !== null && TIE_RECUSIVE_TYPE_KNOT) {
        result[1] = recT(recVar, result[1])
        // console.log(`${rtrDepth} Reduce: End(recursive): ${ruleName} ${recVar} ${showType2(result[1])}`)
    }
    // console.log(`${rtrDepth} Reduce: End: ${ruleName} ${showType2(result[1])}`)
    rtrDepth--
    return result
}


export function substType(ty: Type, varName: string, value: Type, simplify: boolean): Type {
    let env: Env = {}
    env[varName] = [node(typeValue(value)), typeT]
    return substTypeEnv(ty, env, simplify)
}

export type FreeVars = { [name: string]: null }

// evaluate type immediately to the right of a type colon
export function evalTypeAnnot(expr: ExprLoc, env: Env): Type {
    switch (expr.tag) {
        case "EAs": {
            let env2 = { ...env }
            env2[expr.name] = [node(typeValue(asVarT(expr.name))), typeT]
            let body = evalTypeAnnot(expr.expr, env2)
            let result = asT(expr.name, selfT(expr.name, body))
            return result
        }

        // case "EVar": {
        //     if (!env.hasOwnProperty(expr.name)) {
        //         throw new Error(`unknown variable (${env.name})`)
        //     }
        //     let [val, ty] = env[expr.name]
        //     // if (ty.tag!=="TType") {
        //     //     // throw new Error(`expected type variable here, not (${showType2(ty)})`)
        //     //     return ty
        //     // }
        //     let ty2 = nodeToType(val)
        //     return ty2
        // }

        // case "EApply": {
        //     let func = evalTypeAnnot(expr.func, env)
        //     let arg = evalTypeAnnot(expr.arg, env)
        //     let result = applyTypes(func, arg)
        //     return result
        // }
        default: {
            let val = evalExpr(expr, env)
            let ty = nodeToType(val)
            return ty
        }
    }
}

// function substTypeVars(expr: Expr, env: Env): Type {
//     throw new Error("TODO")
// }




// evaluate type within type-brackets,
// e.g { Int -> Int } -- abstraction type
// or { A B } -- application type
export function evalTypeBrackets(expr: ExprLoc, env: Env): Type {
    switch (expr.tag) {
        case "EDatum": {
            let ty = typeOfValue(expr.value)
            return ty
        }
        case "ELambda": {
            let argTy
            let env2 = { ...env }
            // TODO use matchType rather than explicitly looking for a EAs tag here
            if (expr.pat.tag === "EAs") {
                let argTyName = expr.pat.name
                env2[argTyName] = [node(typeValue(asVarT(argTyName))), typeT]
                let argTyBody = evalTypeBrackets(expr.pat.expr, env2)
                let argTyRef = subT(asVarT(argTyName), selfT(argTyName, argTyBody))
                argTy = asT(argTyName, selfT(argTyName, argTyBody))
                env2[argTyName] = [node(typeValue(argTyRef)), typeT]
            }
            // else if (expr.pat.tag === "ETypeBrackets" && expr.pat.expr.tag === "EType") {
            else if (expr.pat.tag === "EType") {
                // const expr_pat_expr = expr.pat.expr
                const expr_pat_expr = expr.pat
                assert.isTrue(expr_pat_expr.tag === "EType")
                let argTyTy = evalTypeBrackets(expr_pat_expr.type, env)
                switch (expr_pat_expr.expr.tag) {
                    case "EVar": {
                        let argName = expr_pat_expr.expr.name
                        if (argTyTy.tag === "TType") {
                            // if (argTyTy.tag === "TType" || argTyTy.tag === "TSingleType") {
                            let argTm = typeValue(varT(argName))
                            env2[argName] = [node(argTm), argTyTy]
                            argTy = termT(expr_pat_expr.expr, argTyTy)
                        }
                        else {
                            let argTm = termVarValue(argName)
                            // env2[argName] = [node(typeValue(varT(argName))), argTyTy]
                            // argTy = termT(expr.arg.expr.expr, argTyTy)
                            argTy = termVarT(argName, argTyTy)
                            env2[argName] = [node(argTm), argTy]
                        }
                        break
                    }
                    default:
                        throw new Error(`unhandled case ${expr_pat_expr.tag}`)
                }

            }
            else {
                argTy = evalTypeBrackets(expr.pat, env)
            }
            let resultTy = evalTypeBrackets(expr.body, env2)
            return funT(argTy, resultTy)
        }
        case "EApply": {
            let func = evalTypeBrackets(expr.func, env)
            let arg = evalTypeBrackets(expr.arg, env)
            let app = applyTypes(func, arg)
            return app
        }
        case "EList": {
            let elemsTy = expr.exprs.map(e => evalTypeBrackets(e, env))
            let tailTy = expr.tail === null ? nilT : evalTypeBrackets(expr.tail, env)
            let ty = elemsTy.reduceRight((list, elem) => pairT(elem, list), tailTy)
            return ty
        }
        case "ETermBrackets": {
            let node = evalExpr(expr, env)
            let val = evalNode(node)
            let ty = val.tag === "type" ? val.type : errorT
            return ty
        }
        case "EVar": {
            if (!env.hasOwnProperty(expr.name)) {
                if (UNKNOWN_VARS_TYPE_ERROR) {
                    console.log(`unknown variable (${expr.name}) at (${showLoc(expr.loc)})`)
                    return errorT
                }
                throw new Error(`unknown variable (${expr.name}) at (${showLoc(expr.loc)})`)
            }
            let [node, _] = env[expr.name]
            let val = evalNode(node)
            let ty = val.tag === "type" ? val.type : errorT
            return ty
        }
        case "EAs": {
            let env2 = { ...env }
            env2[expr.name] = [node(typeValue(asVarT(expr.name))), typeT]
            let bodyTy = evalTypeBrackets(expr.expr, env2)
            let ty = asT(expr.name, bodyTy)
            return ty
        }
        case "ETypeBrackets": {
            let ty = evalTypeBrackets(expr.expr, env)
            return ty
        }
        case "EType": {
            // a type, annotated with a term
            // ignore the term for now
            // let val = evalExpr(expr.expr, env)
            let typ = evalTypeBrackets(expr.type, env)
            return typ
        }
        case "EPrim": {
            const args = expr.args.map(a => evalTypeBrackets(a, env))
            switch (expr.name) {
                case "{|}":
                    return unionTypes(args[0], args[1])
                case "{&}":
                    return intersectTypes(args[0], args[1])
                case "{\\}":
                    return typeRelComp(args[0], args[1])
                default:
                    throw new Error(`Unknown type operator (${expr.name})`)
            }
        }
        default:
            // return evalTypeAnnot(expr, env)
            throw new Error(`unexpected case ${expr.tag}`)
    }
}


// return the environment that results from binding pat to ty
export function matchTypes(pat: Type, ty: Type): Env {
    switch (pat.tag) {
        case "TAs": {
            let env = matchTypes(pat.type, ty)
            env[pat.name] = [node(typeValue(ty)), typeT]
            return env
        }
        case "TTerm": {
            // if (!(ty.tag==="TType" || (ty.tag==="TTerm" && ty.type.tag==="TType"))) {
            //     throw new Error ("only Type is currently allowed as the type in a term-annotation")
            // }
            let term = pat.term
            if (pat.term.tag === "EType") {
                term = pat.term.expr
            }
            // else {
            //     throw new Error ("expected term/type annotation here")
            // }
            if (term.tag !== "EVar") {
                throw new Error("expected a variable name here")
            }
            let env = matchTypes(pat.type, ty)
            switch (term.tag) {
                case "EVar":
                    switch (ty.tag) {
                        case "TSingleType":
                            env[term.name] = [node(typeValue(ty.val)), typeT]
                            break
                        default:
                            env[term.name] = [node(typeValue(varT(term.name))), typeT]
                            break
                    }
                    return env
                default:
                    throw new Error(`unhandled case ${pat.term.tag}`)
            }
        }
        case "TTermVar": {
            let env = matchTypes(pat.type, ty)
            switch (ty.tag) {
                case "TSingleType": {
                    env[pat.varName] = [node(typeValue(ty.val)), typeT]
                    break
                }
                case "TTermVar": {
                    env[pat.varName] = [node(termVarValue(ty.varName)), ty.type]
                    break
                }
                case "TSingle": {
                    // env[pat.varName] = [node(typeValue(singleT(ty.val))), strT]
                    env[pat.varName] = [node(typeValue(ty)), strT]
                    break

                }
                default: {
                    env[pat.varName] = [node(typeValue(varT(pat.varName))), typeT]
                    break
                }
            }
            return env
        }
        case "TSingleTermVar": {
            if (ty.tag === "TSingle") {
                let env: Env = {}
                env[pat.varName] = [node(termVarValue(ty.val)), ty]
                return env
            }
            else if (ty.tag === "TSingleTermVar") {
                let env: Env = {}
                env[pat.varName] = [node(termVarValue(ty.varName)), ty]
                return env
            }
            // else if (ty.tag === "TVoid") {
            //     // TODO why do we get here?
            //     let env: Env = {}
            //     let voidSingletonValue = "***VOID***"
            //     env[pat.varName] = [node(termVarValue(voidSingletonValue)), ty]
            //     return env
            // }
            // else if (ty.tag === "TError") {
            //     // TODO why do we get here?
            //     let env: Env = {}
            //     let voidSingletonValue = "***ERROR***"
            //     env[pat.varName] = [node(termVarValue(voidSingletonValue)), ty]
            //     return env
            // }
            else {
                throw new Error(`expected a singleton-string argument, not ${ty.tag}`)
            }
        }

        case "TPair":
        // TODO ? handle nested type-patterns ?

        case "TSelf":
        case "TList":
        case "TRec":
        // TODO ? handle matching / unification with recursive types ?
        case "TFun":
        case "TAny":
        case "TBool":
        case "TInt":
        case "TVoid":
        case "TNil":
        case "TRule":
        case "TSingle":
        case "TChar":
        case "TStr":
        case "TSub":
        case "TSuper":
        case "TType":
        case "TVar":
        case "TError":
        case "TUnknown":
            return {}
        default:
            throw new Error(`missing case $ {pat.tag}`)
    }
}


// return the free vars that will be bound when pat is bound
function patBoundVars(pat: Type): FreeVars {
    let env = matchTypes(pat, voidT)
    let freeVars: FreeVars = {}
    for (let v of Object.keys(env)) {
        freeVars[v] = null
    }
    return freeVars
}






// closePatType is used to remove any self-refering type that appears in a sub-type position
// e.g. 
//    (Self { A -> A <: B })
// becomes
//    B
// and 
//    (Self { A -> [(Hd A) <: B, (Hd A) -> C]})
// becomes
//    (Self { A-> [B, (Hd A) -> C]})
// function closePatType1(name: string, ty: Type): Type {
//     function cpt(path: Type, ty: Type): Type {
//         // if (equalType(path, ty)) {
//         //     return anyT
//         // }
//         if (equalTypes2(path, ty, false)) {
//             return anyT
//         }
//         switch (ty.tag) {
//             case "TVar":
//                 return ty
//             case "TSub": {
//                 if (equalTypes2(path, ty.type, false)) {
//                     // return ty.super
//                     return cpt(path, ty.super)
//                 }
//                 else {
//                     let ty1 = cpt(path, ty.type)
//                     let ty2 = cpt(path, ty.super)
//                     return subT(ty1, ty2)
//                 }
//             }
//             case "TPair": {
//                 let tyH = cpt(ruleT("hdT", [path]), ty.hd)
//                 let tyT = cpt(ruleT("tlT", [path]), ty.tl)
//                 return pairT(tyH, tyT)
//             }

//             default:
//                 // return cptOther(ty)
//                 return ty
//         }
//     }
//     // let ty2 = cpt(varT(name), ty)
//     let ty2 = cpt(asVarT(name), ty)
//     // ty2 = asT(name, ty2)
//     console.log(`CLOSE 1: ${name} ${showType2(ty)}`)
//     console.log(`CLOSE 2: ${showType2(ty2)}`)

//     return ty2
//     // return ty
// }

function closePatType(name: string, ty: Type): Type {
    function cpt(path: Type, pathTy: Type, ty: Type): Type {
        // if (equalType(path, ty)) {
        //     return anyT
        // }
        if (equalTypes2(path, ty, false)) {
            return pathTy
        }
        switch (ty.tag) {
            case "TVar":
                return ty
            case "TSub": {
                let superTy = cpt(path, pathTy, ty.super)
                let typeTy = cpt(path, superTy, ty.type)
                return subT(typeTy, superTy)
            }
            case "TPair": {
                let tyH = cpt(ruleT("hdT", [path]), ruleT("hdT", [pathTy]), ty.hd)
                let tyT = cpt(ruleT("tlT", [path]), ruleT("tlT", [pathTy]), ty.tl)
                return pairT(tyH, tyT)
            }

            default:
                // return cptOther(ty)
                return ty
        }
    }
    // let ty2 = cpt(varT(name), ty)
    let ty2 = cpt(asVarT(name), anyT, ty)
    // ty2 = asT(name, ty2)
    // console.log(`CLOSE 1: ${name} ${showType2(ty)}`)
    // console.log(`CLOSE 2: ${showType2(ty2)}`)

    return ty2
    // return ty
}







export function convertPatTypeClosed(pat: Type): Type {
    switch (pat.tag) {
        case "TAs":
            return convertPatTypeClosed(pat.type)
        case "TPair": {
            let hd = convertPatTypeClosed(pat.hd)
            let tl = convertPatTypeClosed(pat.tl)
            return pairT(hd, tl)
        }
        // TODO ?
        // case "TSub" ???
        default:
            return pat
    }
}

// export function convertPatTypeClosed2(pat: Type): Type {
//     switch (pat.tag) {
//         case "TAs":
//             return subT(unknownT, convertPatTypeClosed(pat.type))
//         case "TPair": {
//             let hd = convertPatTypeClosed(pat.hd)
//             let tl = convertPatTypeClosed(pat.tl)
//             return pairT(hd, tl)
//         }
//         default:
//             return pat
//     }
// }

// convert a pattern type to an open-type
// A@... becomes A <: ...
// TODO ? handle type-polarity, depending on where the pattern came from ?
function convertPatTypeOpen(ty: Type): Type {
    switch (ty.tag) {
        case "TAs": {
            let ty2 = convertPatTypeOpen(ty.type)
            return subT(asVarT(ty.name), ty2)
        }
        default:
            // TODO inspect further into pattern
            return ty
    }
}


function substTypeEnv(ty: Type, env: Env, simplify: boolean): Type {
    return substTypeEnv1(ty, env, {}, simplify)
}


function substTypeEnv1(ty: Type, env: Env, freeVars: FreeVars, simplify: boolean): Type {

    if (Object.keys(env).length === 0) {
        return ty
    }

    simplify = true
    // simplify = false

    let ste = (ty: Type, env: Env, freeVars: FreeVars): Type => {

        // console.log("substTypeEnv1 ty :", showType2(ty))
        // Object.entries(env).forEach(([k, [v, _]]) => {
        //     console.log(`substTypeEnv1 env ${k} :`, showType2(nodeToType(v)))
        // })

        let result = ste2(ty, env, freeVars)

        // console.log("substTypeEnv1 result : ", showType2(result))

        return result
    }

    let ste2 = (ty: Type, env: Env, freeVars: FreeVars): Type => {

        switch (ty.tag) {
            case "TVar":
                if (env.hasOwnProperty(ty.name)) {
                    let [val, _] = env[ty.name]
                    let ty2 = nodeToType(val)
                    return ty2
                }
                else {
                    return ty
                }
            case "TAny":
            case "TInt":
            case "TChar":
            case "TStr":
            case "TBool":
            case "TNil":
            case "TVoid":
            case "TSingle":
                return ty
            case "TPair": {
                let h = ste(ty.hd, env, freeVars)
                let t = ste(ty.tl, env, freeVars)
                return pairT(h, t)
                // return { tag: "TPair", hd: substTypeEnv1(ty.hd, env, freeVars, simplify), tl: substTypeEnv1(ty.tl, env, freeVars, simplify) }
            }
            case "TFun": {
                let aTy = ty.argType
                let rTy = ty.resultType

                // if (aTy.tag === "TAs") {
                //     console.log(`APPLYING POLYTYPE ${aTy.name}`)
                //     if (aTy.name === "KG" && env.hasOwnProperty("KG")) {
                //         // console.log(`APPLY KG ${JSON.stringify(env["KG"][0])}`)
                //         console.log(`APPLY KG ${showType2(nodeToType(env["KG"][0]))}`)
                //     }
                // }

                let boundVars = patBoundVars(aTy)
                env = { ...env }
                for (const bv in boundVars) {
                    let isSubstVar = env.hasOwnProperty(bv)
                    let isFreeVar = freeVars.hasOwnProperty(bv)
                    if (isSubstVar) {
                        delete env[bv]
                    }
                    if (isFreeVar) {
                        let freshVarName = uniqName(bv, Object.getOwnPropertyNames(freeVars))
                        env[bv] = [node(typeValue(varT(freshVarName))), typeT]
                    }
                    if (isSubstVar && isFreeVar) {
                        throw new Error("CURIOUS")
                    }
                }

                aTy = ste(aTy, env, freeVars)
                // we need something here to handle the 'method Store "get"' application in the fe4a/method-dispatch test
                // if (aTy.tag === "TAs") {
                //     // env[aTy.name] = [node(typeValue(subT(varT(aTy.name), aTy.type))), typeT]
                //     env[aTy.name] = [node(typeValue(aTy.type)), typeT]
                // }
                rTy = ste(rTy, env, freeVars)
                return { ...ty, argType: aTy, resultType: rTy }
            }
            case "TList": {
                let elem = ste(ty.elem, env, freeVars)
                return listT(elem)
                // return { tag: "TList", elem: substTypeEnv1(ty.elem, env, freeVars, simplify) }
            }
            case "TRule": {
                let args: Type[] = []
                for (let arg of ty.args) {
                    args.push(ste(arg, env, freeVars))
                }
                if (simplify) {
                    let [resultOk, resultTy] = reduceTypeRule(ty.name, args)
                    // TODO ? try to put nested type rules into disjunctive normal form ?
                    // TODO ?   unions, then intersections, then negation ({Any \ A})
                    // TODO ?   possibly best handled in the constructors after reductions have been done
                    return resultTy
                }
                else {
                    return ruleT(ty.name, args)
                }
            }
            case "TSub": {
                let t1 = ste(ty.type, env, freeVars)
                let t2 = ste(ty.super, env, freeVars)
                return subT(t1, t2)
            }
            case "TSuper": {
                let t1 = ste(ty.type, env, freeVars)
                let t2 = ste(ty.sub, env, freeVars)
                return superT(t1, t2)
            }

            case "TType":
                return ty

            case "TRec": {
                let val = env[ty.name]
                if (val !== undefined) {
                    env = { ...env }
                    delete env[ty.name]
                }
                return recT(ty.name, ste(ty.body, env, freeVars))
            }
            case "TSelf": {
                let val = env[ty.name]
                if (val !== undefined) {
                    env = { ...env }
                    delete env[ty.name]
                }
                return selfT(ty.name, ste(ty.body, env, freeVars))
            }
            case "TAs": {
                let val = env[ty.name]
                if (val !== undefined) {
                    env = { ...env }
                    delete env[ty.name]
                }
                return asT(ty.name, ste(ty.type, env, freeVars))
            }
            case "TUnknown":
            case "TError":
                return ty

            case "TTerm":
                // TODO ? do we need to / should we substitute into the term ?
                return ty

            case "TTermVar":
                // TODO ? do we need to / should we substitute into the term ?
                return ty

            case "TSingleType":
                return singleTypeT(ste(ty.val, env, freeVars))

            case "TSingleTermVar": {
                // TODO ? do we need to / should we substitute into the term ?
                if (env.hasOwnProperty(ty.varName)) {
                    let [val, _] = env[ty.varName]
                    // const val_value = val.value
                    // const val_value = val
                    const val_value = evalNode(val)
                    if (val_value.tag === "termVar") {
                        let ty2 = singleTermVarT(val_value.varName)
                        return ty2
                    }
                    else if (val_value.tag === "type" && val_value.type.tag === "TSingle") {
                        // let ty2 = singleT(val_value.type.val)
                        let ty2 = val_value.type
                        return ty2
                    }
                    else if (val_value.tag === "type" && val_value.type.tag === "TVar") {
                        // this is a work-around, the value should really be a termVar or type/TSingle, but not a type/TVar
                        // TODO fixup whatever caused the wrong value in the env passed in to substTypeEnv
                        let ty2 = singleTermVarT(val_value.type.name)
                        return ty2
                    }
                    else {
                        // let valStr = val_value.tag
                        let valStr = JSON.stringify(val_value)
                        throw new Error(`substTypeEnv : TSingleTermVar pattern must be substituted with a termVar or singleT, not a (${valStr}) `)
                    }
                    // let ty2 = nodeToType(val)
                    // return ty2
                }
                else {
                    return ty
                }
            }

            // case "TSeqApply":
            //     ty.arg
            //     return seqApplyT(ty.func, substTypeEnv1(ty.arg, env, freeVars, simplify))
            default:
                throw new Error(`unknown type $ {ty.tag} ${showType2(ty)}`)
        }
    }

    let result = ste(ty, env, freeVars)
    return result
}


// let mfr = memo.mfrCreate()
// export let applyTypes = memo.memoFunc(mfr, applyTypes1)
export let applyTypes = applyTypes1

export function applyTypes1(func: Type, arg: Type, checkDomain = true): Type {

    checkDomain = false


    switch (func.tag) {

        case "TAs":
            return applyTypes(func.type, arg)

        case "TRec":
            return applyTypes(unrollRecursiveType(func), arg)

        case "TSelf": {
            // compute the result "under" the self-ref binding,
            //   and then reapply the self-ref binding
            let fvF = typeFreeVars(func)
            let fvA = typeFreeVars(arg)
            let selfName = uniqName(func.name, [...fvF, ...fvA])
            // let dom = superT(typeDom(func.body), arg)
            // let dom = superT(arg, typeDom(func.body))
            // let dom = unionTypes(arg, typeDom(func.body))
            // let dom = unionTypes(arg, typeDom(func))
            let dom = arg
            let f = substType(func.body, func.name, funT(dom, varT(selfName)), true)
            let app = selfT(selfName, applyTypes(f, arg, false))

            // console.log("APPLY SELF func : ", showType2(func))
            // console.log("APPLY SELF arg  : ", showType2(arg))
            // console.log("APPLY SELF dom  : ", showType2(dom))
            // console.log("APPLY SELF f    : ", showType2(f))
            // console.log("APPLY SELF app  : ", showType2(app))

            return app
        }

        // case "TFun": {
        //     // let outsideDomain = typeRelComp0(arg, func.argType)
        //     // let odTI = tiCalc(globalTIMemo, outsideDomain)
        //     // if (tiIsTrue(odTI)) {
        //     //     return anyT
        //     // }
        //     // else 
        //     // if (tiIsFalse(odTI)) 
        //     {
        //         arg = knownInhabited(arg)
        //         let env = matchTypes(func.argType, arg)
        //         let appTyp = substTypeEnv(func.resultType, env, true)
        //         return appTyp
        //     }
        //     // else {
        //     //     return ruleT("applyT", [func, arg])
        //     // }
        // }

        // case "TFun": {
        //     if (checkDomain) {
        //         let outsideDomain = typeRelComp0(arg, func.argType)
        //         let odTI = tiCalc(globalTIMemo, outsideDomain)
        //         if (tiIsTrue(odTI)) {
        //             return unknownT
        //         }
        //         else
        //             if (tiIsFalse(odTI)) {
        //                 arg = knownInhabited(arg)
        //                 let env = matchTypes(func.argType, arg)
        //                 let appTyp = substTypeEnv(func.resultType, env, true)
        //                 return appTyp
        //             }
        //             else {
        //                 return ruleT("applyT", [func, arg])
        //             }
        //     }
        //     else {
        //         arg = knownInhabited(arg)
        //         let env = matchTypes(func.argType, arg)
        //         let appTyp = substTypeEnv(func.resultType, env, true)
        //         return appTyp
        //     }
        // }

        case "TFun": {
            arg = knownInhabited(arg)
            let env = matchTypes(func.argType, arg)
            let appTyp = substTypeEnv(func.resultType, env, true)
            let anyCodomain = voidT
            if (checkDomain) {
                // if the argument type is broader that the function's domain type, 
                // then the codomain could contain anything
                // we can't easily check for this, so we express this as a type-expression
                //    { ( Hd {[Any, ...{(Domain Func) \ Arg}]} ) }
                // the expression will either reduce to Void or Any, depending on whether the 
                // argument type contains values outside of the function domains type
                // we leave it to the full type-checker to determine the result if/when needed.

                let od = typeRelComp(arg, func.argType)
                let odTi = tiStructural(od)
                if (ttiIsTrue(odTi)) {
                    appTyp = anyT
                }
                else if (ttiIsFalse(odTi)) {
                    // appTyp = appTyp
                }
                else {
                    anyCodomain = typeHd(pairT(anyT, typeRelComp(arg, func.argType)))
                    appTyp = unionTypes(appTyp, anyCodomain)
                }

            }
            return appTyp
        }

        case "TAny": {
            let appTyp = anyT
            return appTyp
        }
        case "TSub": {
            let func_super = func.super
            if (func.super.tag === "TSelf") {
                func_super = substType(func.super.body, func.super.name, func.type, true)
                // func_super = subT(varT(func.super.name), func_super)
            }
            // This was used to handle applying subtypes of an intersected function type
            //   when trying to type the dispatch function used for creating object functions.
            // This wasn't sufficient in itself.  
            // Maybe it wll be useful in another attept to type/type-check the dispatch function,
            //   or maybe another approach will be more successful.
            // Either way, it's not needed for now.
            // 
            // else if (func.super.tag==="TRule" && func.super.name==="intersectT") {

            //     if (arg.tag === "TRule" && arg.name === "unionT") {
            //         let t1 = applyTypes(func, arg.args[0])
            //         let t2 = applyTypes(func, arg.args[1])
            //         return unionTypes(t1, t2)
            //     }


            //     let func1 = subT(func.type, func.super.args[0])
            //     let func2 = subT(func.type, func.super.args[1])
            //     // let func3 = intersectT(func1, func2)
            //     // return applyTypes(func3, arg)
            //     // let app1 = applyTypes(func1, arg)
            //     // let app2 = applyTypes(func2, arg)
            //     // let app1 = hdT(pairT(applyTypes(func1, arg),relcompT(arg, typeDom(func1))))
            //     // let app2 = hdT(pairT(applyTypes(func2, arg),relcompT(arg, typeDom(func2))))
            //     // return unionTypes(app1, app2)

            //     // let dom1 = typeDom(func1)
            //     // let dom2 = typeDom(func2)
            //     let dom1 = typeDom(func.super.args[0])
            //     let dom2 = typeDom(func.super.args[1])
            //     let inTy1 = intersectTypes(arg, dom1)
            //     let inTy2 = intersectTypes(arg, dom2)
            //     let in1 = tiStructural(inTy1, false)
            //     let in2 = tiStructural(inTy2, false)
            //     let appSub = applyTypes(func.type, arg)
            //     if (tiIsFalse(in1) && tiIsFalse(in2)) {
            //         return unknownT
            //     }
            //     if (/*tiIsTrue(in1) &&*/ tiIsFalse(in2)) {
            //         // let app1 = applyTypes(func1, arg)
            //         let app1 = applyTypes(func.super.args[0], arg)
            //         return subT(appSub, app1)
            //     }
            //     else if (tiIsFalse(in1)/* && tiIsTrue(in2)*/) {
            //         // let app2 = applyTypes(func2, arg)
            //         let app2 = applyTypes(func.super.args[1], arg)
            //         return subT(appSub, app2)
            //     }
            //     else if (tiIsTrue(in1) && tiIsTrue(in2)) {
            //         let app1 = applyTypes(func.super.args[0], arg)
            //         let app2 = applyTypes(func.super.args[1], arg)
            //         let app3 = unionTypes(app1, app2)
            //         return subT(appSub, app3)
            //     }
            // }

            // TODO ? check if the arg is outside the domain of the super-type ?
            // TODO ?   the sub-type may have a broader domain than the super-type,
            // TODO ?   if it does then the sub-type relationship on the result will not hold.
            // TODO ? e.g.
            // TODO ?    { { F <: G } A }
            // TODO ? does not imply that
            // TODO ?    { { F A } <: { G A } }
            // TODO ? or maybe we should ensure { G A } reduces to Unknown (or should it be Any?) when A is outside the domain of G
            // e.g.      
            //        { { { F @ Any -> F } <: { Int -> Int } } Str }
            // should reduce to
            //        { Str <: Any }    (or just {Str})
            // rather than the current
            //        { Str <: Int }

            let t1 = applyTypes(func.type, arg)
            let t2 = applyTypes(func_super, arg)
            let ty = subT(t1, t2)
            // let ty = t1
            return ty
        }
        case "TSuper": {
            let t1 = applyTypes(func.type, arg)
            let t2 = applyTypes(func.sub, arg)
            let ty = superT(t1, t2)
            return ty
        }

        case "TVar": {
            if (arg.tag === "TSub") {
                let t1 = applyTypes(func, arg.type)
                let t2 = applyTypes(func, arg.super)
                let ty = subT(t1, t2)
                return ty
            }
            if (arg.tag === "TSuper") {
                let t1 = applyTypes(func, arg.type)
                let t2 = applyTypes(func, arg.sub)
                let ty = superT(t1, t2)
                return ty
            }
            // reduce { A { (Inverse A) B } } to B
            // do we want to do this here, or add some more general type-inhabitation rule ?
            // what about sub/super-type relationships ?
            // if (arg.tag==="TRule" && arg.name==="inverseT" && arg.args[0].tag==="TVar" && func.name===arg.args[0].name) {
            //     return arg.args[1]
            // }
            if (arg.tag === "TRule" && arg.name === "applyT"
                && arg.args[0].tag === "TRule" && arg.args[0].name === "inverseT"
                && arg.args[0].args[0].tag === "TVar"
                && func.name === arg.args[0].args[0].name) {
                let t1 = arg.args[1]
                let t2 = rangeT(func)
                return intersectT(t1, t2)
            }
            // build an unreduced applyT rule
            // postpone reduction until more type-substitutions
            // result in sufficient info being known
            let appTyp = ruleT("applyT", [func, arg])
            return appTyp
        }

        case "TRule": {
            // TODO ? use a smarter type-equality test ?
            // if (arg.tag === "TRule" && arg.name === "domainT" && equalType(func, arg.args[0])) {
            //     // the arg matches the function domain, but is no more precise,
            //     // so no info is lost by simplifying this to just the range of the function
            //     let appTyp = ruleT("rangeT", [func])
            //     return appTyp
            // }
            switch (func.name) {
                case "intersectT": {
                    if (arg.tag === "TRule" && arg.name === "unionT") {
                        let t1 = applyTypes(func, arg.args[0])
                        let t2 = applyTypes(func, arg.args[1])
                        return unionTypes(t1, t2)
                    }

                    // console.log(`APPLY Fun: ${showType2(func)}`)
                    // console.log(`APPLY Arg: ${showType2(arg)}`)


                    // if the argument type is outside the domain (od) of
                    // an overloaded part of the function type,
                    // then that part of the function type doesn't contribute
                    // to the result type.  
                    let dom = typeDom(func)
                    // let odTI = tiStructuralRelComp(arg, dom, true)
                    let dom1 = typeDom(func.args[0])
                    let dom2 = typeDom(func.args[1])
                    // let odTI1 = tiStructuralRelComp(arg, dom1, true)
                    // let odTI2 = tiStructuralRelComp(arg, dom2, true)
                    // let in1 = tiStructuralIntersect(arg, dom1, true)
                    // let in2 = tiStructuralIntersect(arg, dom2, true)
                    let inTy1 = intersectTypes(arg, dom1)
                    let inTy2 = intersectTypes(arg, dom2)
                    // TODO currently, for the purposes of resolving overloaded function calls
                    // TODO we assume all type-vars are inhabited.
                    // TODO this seems to work but feels presumptuous,
                    // TODO perhaps listing and passing in which specific
                    // TODO type-variables we can assume to be inhabited would be
                    // TODO more defensible.
                    // TODO e.g. any type variables bounds in the process of calling
                    // TODO the function can be assumed to be inhabited by the argument at least.

                    // let in1 = tiStructural(inTy1, true)
                    // let in2 = tiStructural(inTy2, true)

                    let in1 = tiStructural(inTy1, false)
                    let in2 = tiStructural(inTy2, false)

                    // let app1 = applyTypes(func.args[0], arg)
                    // let app2 = applyTypes(func.args[1], arg)

                    let result: Type
                    // if (tiIsTrue(odTI)) {
                    //     return anyT
                    // }

                    // if (tiIsTrue(in1) && tiIsFalse(in2)) {
                    //     result = app1
                    // }
                    // else if (tiIsFalse(in1) && tiIsTrue(in2)) {
                    //     result = app2
                    // }
                    // else if (tiIsTrue(in1) && tiIsTrue(in2)) {
                    //     result = unionTypes(app1, app2)
                    // }


                    if (ttiIsFalse(in1) && ttiIsFalse(in2)) {
                        // We should only get here if an overloaded function has been
                        // called incorrectly with an argument outside of its domain.
                        // Given something invalid has happed, we could return Void (or Error) here,
                        // but returning Unknown is less likely to cause subsequent confusion.
                        // Best not to give terms the type Error, unless we have definitely marked the error.
                        // Relying on the deduction there must have been an error, risks latent bugs.
                        result = unknownT
                    }
                    if (/*tiIsTrue(in1) &&*/ ttiIsFalse(in2)) {
                        // Rather than checking that the intersection between 
                        // the argument and one domain are definitely inhabited,
                        // we check that the alternatives are definitely uninhabited.
                        let app1 = applyTypes(func.args[0], arg)
                        result = app1
                    }
                    else if (ttiIsFalse(in1)/* && tiIsTrue(in2)*/) {
                        let app2 = applyTypes(func.args[1], arg)
                        result = app2
                    }
                    else if (ttiIsTrue(in1) && ttiIsTrue(in2)) {
                        let app1 = applyTypes(func.args[0], arg)
                        let app2 = applyTypes(func.args[1], arg)
                        result = unionTypes(app1, app2)
                    }


                    // if (tiIsFalse(in1) && tiIsFalse(in2)) {
                    //     return anyT
                    // }

                    // if (tiIsTrue(odTI1) && tiIsTrue(odTI2)) {
                    //     return anyT
                    // }
                    // if (tiIsTrue(odTI1) && tiIsFalse(odTI2)) {
                    //     return app2
                    // }
                    // if (tiIsTrue(odTI2) && tiIsFalse(odTI1)) {
                    //     return app1
                    // }
                    // if (tiIsFalse(odTI1) && tiIsFalse(odTI2)) {
                    //     return intersectTypes(app1, app2)
                    // }

                    else {
                        result = ruleT("applyT", [func, arg])
                    }

                    // let st = showType2
                    let st = (ty: Type) => showType4(ty, null, 160)

                    // console.log("OVERLOADED FUNCTION CALL")
                    // console.log(`  Arg :   ${st(arg)}`)
                    // console.log(`  Dom1:   ${tiSymbol(in1)} ${st(dom1)}`)
                    // console.log(`  Dom2:   ${tiSymbol(in2)} ${st(dom2)}`)
                    // console.log(`  inTy1:  ${tiSymbol(in1)} ${st(inTy1)}`)
                    // console.log(`  inTy2:  ${tiSymbol(in2)} ${st(inTy2)}`)
                    // console.log(`  Func1:  ${tiSymbol(in1)} ${st(func.args[0])}`)
                    // console.log(`  Func2:  ${tiSymbol(in2)} ${st(func.args[1])}`)
                    // console.log(`  Result: ${st(result)}`)
                    return result
                }

                case "unionT": {
                    let u1 = applyTypes(func.args[0], arg)
                    let u2 = applyTypes(func.args[1], arg)
                    return unionTypes(u1, u2)
                }

                case "inverseT": {
                    let func2 = func.args[0]
                    if (func2.tag === "TRec") {
                        func2 = unrollRecursiveType(func2)
                    }
                    if (func2.tag === "TFun" && func2.argType.tag !== "TAs") {
                        return func2.argType
                    }
                    else if (func2.tag === "TRule" && func2.name === "intersectT") {
                        let cod1 = typeRng(func2.args[0])
                        let cod2 = typeRng(func2.args[1])
                        let rc1 = tiStructuralRelComp(cod1, arg)
                        let rc2 = tiStructuralRelComp(cod2, arg)
                        let dom1 = ttiIsFalse(rc1) ? typeDom(func2.args[0]) : voidT
                        let dom2 = ttiIsFalse(rc2) ? typeDom(func2.args[1]) : voidT
                        return unionTypes(dom1, dom2)
                    }
                    else {
                        return applyT(func, arg)
                    }

                }

                default: {
                    if (arg.tag === "TSub") {
                        let t1 = applyTypes(func, arg.type)
                        let t2 = applyTypes(func, arg.super)
                        let ty = subT(t1, t2)
                        return ty
                    }
                    if (arg.tag === "TSuper") {
                        let t1 = applyTypes(func, arg.type)
                        let t2 = applyTypes(func, arg.sub)
                        let ty = superT(t1, t2)
                        return ty
                    }
                    // build an unreduced applyT rule
                    // postpone reduction until more type-substitutions
                    // result in sufficient info being known
                    let appTyp = ruleT("applyT", [func, arg])
                    return appTyp
                }
            }

        }
        case "TVoid":
            // if you call an impossible function
            // you get an impossible result
            // TODO but why are we calling impossible functions ?
            // return voidT
            return unknownT

        case "TUnknown":
            return unknownT
        case "TError":
            return errorT

        case "TInt": // str, list, bool etc...
        case "TChar":
        case "TStr":
        case "TPair":
        case "TBool":
        case "TList":
        case "TType":
        case "TSingle":
        case "TNil":
            // we should only return Error if we have definitely marked the error, not just deduced there must have been an error
            // return errorT
            // we could legitimately return Void here, as the set of possible values we could return is empty,
            // but one slip elsewhere, and returning Void here will make it seem like we've done the impossible
            // return voidT
            // therefore rather than returning the most acceptable type, return the most stubborn/objectionable type.
            return unknownT
        // ((f: Int) (x: Int)) can't possibly return any value,
        //   it has type { Int Int } which therefore should reduce to Void.
        // Currently throwing an error, as not expecting to write anything 
        //   which result would make us get here, but voidT is probably the correct result.
        case "TTerm":
        case "TTermVar":
        case "TSingleType":
        case "TSingleTermVar":
            assert.todo(`applyTypes: Unhandled tag (${func.tag}).`)
            // return unknownT
        default:
            assert.noMissingCases(func)
    }
}


export function typeErrorDetected(expr: ExprLoc): void {
    console.log(`Type Error Detected at: (${showLoc(expr.loc)})`)
}

type TypeErrorReporter = (expr: ExprLoc) => void


//#endregion



//#region Simple Types


// // takes an expression,
// // returns a rebuilt expresion with a calculated type added to every node
// export function typeExpr(expr: Expr, env: Env, topLevel: boolean, err: TypeErrorReporter | null): ExprType {
//     let ignoreUnproven = false
//     try {
//         reportProgress(3, "Simple", expr.loc)
//         switch (expr.tag) {
//             case "EAs": {
//                 let env2 = { ...env }
//                 // TODO ? check we're in a (function argument) type-context, dont't do this for values (or outside function argument types)
//                 env2[expr.name] = [node(typeValue(asVarT(expr.name))), typeT]
//                 let ex_ty = typeExpr(expr.expr, env2, topLevel, err)
//                 let ex3: ExprType = { tag: "EAs", name: expr.name, expr: ex_ty, loc: expr.loc, ty: ex_ty.ty }
//                 return ex3
//             }
//             case "EApply": {
//                 let argPos = expr.arg.loc.range.start
//                 // if (argPos.line === 266 && argPos.col === 63) {
//                 //     console.log("BREAK HERE")
//                 // }
//                 let funcExp = typeExpr(expr.func, env, topLevel, err)
//                 let argExp = typeExpr(expr.arg, env, topLevel, err)
//                 let ty = applyTypes(funcExp.ty, argExp.ty)
//                 let tc = typeCheck(argExp.ty, typeDom(funcExp.ty), expr.loc)
//                 let expr_type: ExprType = { tag: "EApply", func: funcExp, arg: argExp, loc: expr.loc, ty: ty, op: expr.op }
//                 if (tc !== null) {
//                     expr_type.tc = tc
//                     if (tc !== "ok" && err !== null) {
//                         err(expr)
//                     }
//                 }
//                 return expr_type
//             }
//             case "ELambda": {
//                 // let [pat2, env2] = typePatBind(expr.arg, [node(blockedValue("lambda")), anyT], env, false, "neg")
//                 // let [pat2, env2] = typePatBind(expr.arg, node(blockedValue("lambda")), voidT, env, false, false)

//                 // let [pat2, env2] = typePatBind(expr.arg, node(blockedValue("lambda")), anyT, env, false, false)
//                 let [pat2, env2] = typePatBind2(expr.pat, node(blockedValue("lambda")), null, null, env, false)

//                 let newEnv = { ...env, ...env2 }

//                 let bodyExp = typeExpr(expr.body, newEnv, false, err)
//                 let lamTyp: Type = funT(pat2.ty, bodyExp.ty)

//                 let lamExp: ExprType = { tag: "ELambda", pat: pat2, body: bodyExp, loc: expr.loc, ty: lamTyp }
//                 return lamExp
//             }
//             case "ELambdaMaybe": {
//                 let [pat2, env2] = typePatBind2(expr.pat, node(blockedValue("lambda")), null, null, env, false)

//                 let newEnv = { ...env, ...env2 }

//                 let bodyExp = typeExpr(expr.body, newEnv, false, err)
//                 let lamTyp1: Type = funT(pat2.ty, pairT(bodyExp.ty, nilT))
//                 let maybePatTy = typeMaybePat(expr.pat)
//                 let lamTyp2: Type = funT(typeRelComp(anyT, maybePatTy), nilT)
//                 let lamTyp: Type = intersectTypes(lamTyp1, lamTyp2)

//                 // let lamExp: ExprType = { tag: "ELambda", arg: pat2, body: bodyExp, loc: expr.loc, ty: lamTyp }
//                 let lamExp: ExprType = { tag: "ELambdaMaybe", pat: pat2, body: bodyExp, loc: expr.loc, ty: lamTyp }
//                 return lamExp
//             }
//             // case "TLambda": {
//             //     let argTy = typeExpr(expr.pat, env, topLevel, err)
//             //     let newEnv = { ...env }
//             //     // TODO ? call splitTypeBindings here, instead of explicitly testing for EAlias ?
//             //     if (argTy.tag === "EAs") {
//             //         newEnv[argTy.name] = [node(typeValue(asVarT(argTy.name))), typeT]
//             //     }
//             //     let bodyTy = typeExpr(expr.body, newEnv, topLevel, err)
//             //     let tlamExp: ExprType = { tag: "TLambda", pat: argTy, body: bodyTy, loc: expr.loc, ty: typeT }
//             //     return tlamExp
//             // }
//             case "ELet": {
//                 let [decls, newEnv] = typeDecls(expr.decls, env, topLevel, err)
//                 // TODO / REDO - check function body types against let-bound function return types
//                 let bodyExp = typeExpr(expr.expr, newEnv, topLevel, err)
//                 let letExp: ExprType = { tag: "ELet", decls: decls, expr: bodyExp, loc: expr.loc, ty: bodyExp.ty }
//                 return letExp
//             }
//             case "EDatum": {
//                 let litTyp = typeOfValue(expr.value)
//                 return { ...expr, ty: litTyp }
//             }
//             // case "ETuple": {
//             //     let exprs = expr.exprs.map(e => typeExpr(e, env, topLevel, err))
//             //     let types = exprs.map(e => e.ty)
//             //     let ty = types.reduceRight((t, e) => ({ tag: "TPair", hd: e, tl: t }))
//             //     let tupleExpTy: ExprType = { tag: "ETuple", exprs: exprs, loc: expr.loc, ty: ty }
//             //     return tupleExpTy
//             // }
//             case "EList": {
//                 let exprs = expr.exprs.map(e => typeExpr(e, env, topLevel, err))
//                 let elemTypes = exprs.map(e => e.ty)
//                 // let tailExpr:ExprType|null = null
//                 // let tailType: Type = nilT
//                 // if (expr.tail !== null) {
//                 //     tailExpr = typeExpr(expr.tail, env, topLevel, err)
//                 //     tailType = tailExpr.ty
//                 // }
//                 let tailExpr = expr.tail === null ? null : typeExpr(expr.tail, env, topLevel, err)
//                 let tailType = tailExpr === null ? nilT : tailExpr.ty
//                 // let ty = elemTypes.reduceRight((t, e) => ({ tag: "TPair", hd: e, tl: t }), tailType)
//                 let ty = elemTypes.reduceRight((t, e) => (pairT(e, t)), tailType)
//                 let tupleExpTy: ExprType = { tag: "EList", exprs: exprs, tail: tailExpr, loc: expr.loc, ty: ty }
//                 return tupleExpTy
//             }
//             case "EType": {
//                 let exprExp = typeExpr(expr.expr, env, topLevel, err)
//                 let typeExp = typeExpr(expr.type, env, topLevel, err)
//                 let typeT = evalTypeAnnot(expr.type, env)
//                 let tc = typeCheck(exprExp.ty, typeT, expr.loc)
//                 if (tc !== "ok" && err !== null) {
//                     err(expr)
//                 }
//                 let result: ExprType = { tag: "EType", expr: exprExp, type: typeExp, loc: expr.loc, ty: typeT, tc: tc }
//                 return result
//             }
//             case "EVar": {
//                 if (!env.hasOwnProperty(expr.name)) {
//                     if (UNKNOWN_VARS_TYPE_ERROR) {
//                         console.log(`unknown variable (${expr.name}) at (${showLoc(expr.loc)})`)
//                         return { ...expr, ty: errorT, tc: "error" }
//                     }
//                     throw new Error(`unknown variable (${expr.name}) at (${showLoc(expr.loc)})`)
//                 }
//                 let [varVal, varTyp] = env[expr.name]
//                 // if (varTyp.tag === "TType") {
//                 //     let varTyp2 = nodeToType(varVal)
//                 //     varTyp = subT(varT(expr.name), varTyp2)
//                 // }
//                 return { ...expr, ty: varTyp }
//             }
//             // case "ECase": {
//             //     let val: Node = node(blockedValue("case"))
//             //     if (topLevel) {
//             //         val = evalExpr(expr.expr, env)
//             //     }
//             //     let caseExp = typeExpr(expr.expr, env, topLevel, err)
//             //     let caseTy = voidT
//             //     let caseAlts: [ExprType, ExprType][] = expr.alts.map(([pat, defn]) => {
//             //         let [patTy, env2] = typePatBind2(pat, val, null, null, env, topLevel)
//             //         let patTy2 = intersectTypes(patTy.ty, caseExp.ty)
//             //         // if this case branch is taken, then we know that patTy2 is inhabited
//             //         // this seems valid, but we don't seem to need it
//             //         // patTy2 = knownInhabited(patTy2)
//             //         let [pat3, env3] = typePatBind2(pat, val, null, patTy2, env, topLevel)
//             //         let newEnv = { ...env, ...env3 }
//             //         let defnTy = typeExpr(defn, newEnv, topLevel, err)
//             //         caseTy = unionTypes(caseTy, defnTy.ty)
//             //         return [pat3, defnTy]
//             //     })
//             //     return { tag: "ECase", expr: caseExp, alts: caseAlts, loc: expr.loc, ty: caseTy }
//             // }
//             case "ETypeBrackets": {
//                 let ty = typeType(expr.expr, env, topLevel, err)
//                 return { tag: "ETypeBrackets", expr: ty, loc: expr.loc, ty: typeT }
//             }
//             case "ETermBrackets": {
//                 let ty = typeExpr(expr.expr, env, topLevel, err)
//                 return { tag: "ETermBrackets", expr: ty, loc: expr.loc, ty: ty.ty }
//             }
//             default:
//                 throw new Error(`unknown expr ${JSON.stringify(expr)}`)
//         }
//     }
//     catch (err) {
//         let name = ""
//         if (expr.tag === "EApply" && expr.func.tag === "EVar") {
//             name = expr.func.name
//         }
//         console.log(`Error ${expr.loc.filename}: ${JSON.stringify(expr.loc.range.start)} - ${JSON.stringify(expr.loc.range.end)}: ${name}`)
//         throw err
//     }
// }

// export function typeType(expr: Expr, env: Env, topLevel: boolean, err: TypeErrorReporter | null): ExprType {
//     switch (expr.tag) {
//         case "EDatum": {
//             let ty = typeOfValue(expr.value)
//             return { ...expr, ty: ty }
//         }
//         case "EVar": {
//             if (!env.hasOwnProperty(expr.name)) {
//                 if (UNKNOWN_VARS_TYPE_ERROR) {
//                     console.log(`unknown variable (${expr.name}) at (${showLoc(expr.loc)})`)
//                     return { ...expr, ty: errorT, tc: "error" }
//                 }
//                 throw new Error(`unknown variable (${expr.name}) at (${showLoc(expr.loc)})`)
//             }
//             let [ty, tyT] = env[expr.name]
//             let tc: TypeCheckResult = tyT.tag === "TType" || tyT.tag === "TSingleType" ? "ok" : "error"
//             return { tag: "EVar", name: expr.name, loc: expr.loc, ty: tyT, tc: tc }
//         }
//         case "ELambda": {
//             let argTy = typeType(expr.pat, env, topLevel, err)
//             let newEnv = { ...env }
//             // TODO ? call splitTypeBindings here, instead of explicitly testing for EAlias ?
//             if (argTy.tag === "EAs") {
//                 newEnv[argTy.name] = [node(typeValue(asVarT(argTy.name))), typeT]
//             }
//             let bodyTy = typeType(expr.body, newEnv, topLevel, err)
//             let tlamExp: ExprType = { tag: "ELambda", pat: argTy, body: bodyTy, loc: expr.loc, ty: typeT }
//             return tlamExp
//         }
//         case "ETermBrackets": {
//             let expr2 = typeExpr(expr.expr, env, topLevel, err)
//             let tc: TypeCheckResult = expr2.ty.tag === "TType" || expr2.ty.tag === "TSingleType" ? "ok" : "error"
//             return { ...expr, expr: expr2, ty: typeT, tc: tc }
//         }
//         case "EList": {
//             let elems = expr.exprs.map(exp => typeType(exp, env, topLevel, err))
//             let tail = expr.tail === null ? null : typeType(expr.tail, env, topLevel, err)
//             let elemsTy = elems.map(e => e.ty)
//             let tailTy = tail === null ? nilT : tail.ty
//             let ty = elemsTy.reduceRight((list, elem) => pairT(elem, list), tailTy)
//             return { ...expr, exprs: elems, tail: tail, ty: ty }
//         }
//         case "EApply": {
//             let func = typeType(expr.func, env, topLevel, err)
//             let arg = typeType(expr.arg, env, topLevel, err)
//             return { ...expr, func: func, arg: arg, ty: typeT }
//         }
//         case "EAs": {
//             let env2 = { ...env }
//             env2[expr.name] = [node(typeValue(asVarT(expr.name))), typeT]
//             let ty = typeType(expr.expr, env2, topLevel, err)
//             return { ...expr, expr: ty, ty: typeT }
//         }
//         case "ETypeBrackets": {
//             let expr2 = typeType(expr.expr, env, topLevel, err)
//             return { ...expr, expr: expr2, ty: typeT }
//         }
//         default:
//             throw new Error(`missing case ${expr.tag}`)
//     }
// }

// export function typeDecl_noErrorHandler(expr_decl: ex.DeclT<ex.Loc>, env: Env, topLevel: boolean): [ex.DeclType, Env] {
//     return typeDecl(expr_decl, env, topLevel, null)
// }

// export function typeDecl(expr_decl: ex.DeclT<ex.Loc>, env: Env, topLevel: boolean, err: TypeErrorReporter | null): [ex.DeclType, Env] {
//     let newEnv = { ...env }
//     let [pattern, defn] = expr_decl
//     reportProgress(topLevel ? 1 : 2, "Simple", pattern.loc)
//     let declExp = typeExpr(defn, newEnv, topLevel, err)
//     // let valTy: ev.NodeType = [node(blockedValue("let")), declExp.ty]
//     let val: Node = node(blockedValue("let"))
//     if (topLevel) {
//         val = evalExpr(defn, newEnv)
//     }
//     // let [pat2, env2] = typePatBind(pattern, val, declExp.ty, newEnv, topLevel, true)
//     let [pat2, env2] = typePatBind2(pattern, val, declExp.ty, null, newEnv, topLevel)
//     newEnv = { ...newEnv, ...env2 }

//     return [[pat2, declExp], newEnv]
// }

// export function typeDecls(expr_decls: ex.DeclT<ex.Loc>[], env: Env, topLevel: boolean, err: TypeErrorReporter | null): [ex.DeclType[], Env] {
//     let newEnv = { ...env }
//     let decls: ex.DeclType[] = []
//     for (let expr_decl of expr_decls) {
//         let pat2, declExp
//         [[pat2, declExp], newEnv] = typeDecl(expr_decl, newEnv, topLevel, err)
//         decls.push([pat2, declExp])
//     }

//     return [decls, newEnv]
// }



// function forgetKnownInhabitation(ty: Type): Type {
//     throw new Error("TODO")
// }



// // annotate types on a pattern (lambda,let,case), and return an environment containing the new bindings
// function typePatBind2(pat: Expr, val: Node | null, valTy: Type | null, annotTy: Type | null, env: Env, topLevel: boolean): [ExprType, Env] {
//     let ignoreUnproven = false
//     if (valTy !== null && annotTy !== null) {
//         throw new Error("oops")
//     }

//     switch (pat.tag) {
//         case "ETermBrackets": {
//             let pat2 = typePatBind2(pat.expr, val, valTy, annotTy, env, topLevel)
//             return pat2
//         }
//         case "ELit": {
//             let ty = typeOfValue(pat.value)
//             // ty = intersectTypes(ty, inTy)
//             let tc = typeCheckPat(ty)
//             if (annotTy !== null) {
//                 let tc1 = typeCheck(ty, annotTy, pat.loc)
//                 tc = maxTypeCheckResult([tc, tc1])
//             }
//             if (valTy !== null) {
//                 let tc2 = typeCheck(ty, valTy, pat.loc)
//                 tc = maxTypeCheckResult([tc, tc2])
//             }
//             return [{ ...pat, ty: ty, tc: tc }, {}]
//         }
//         case "EVar": {
//             let ty = anyT
//             if (annotTy !== null) {
//                 ty = annotTy
//             }
//             else if (valTy !== null) {
//                 ty = valTy
//             }
//             ty = knownInhabited(ty)
//             let env2: Env = {}
//             if (val === null) {
//                 val = node(blockedValue("var"))
//             }
//             env2[pat.name] = [val, ty]
//             let tc = typeCheckPat(ty)
//             if (valTy !== null) {
//                 let tc2 = typeCheck(valTy, ty, pat.loc)
//                 tc = maxTypeCheckResult([tc, tc2])
//             }
//             // return [{ ...pat, ty: ty, tc: tc }, env2]
//             return [{ ...pat, ty: ty }, env2]
//         }
//         case "EAs": {
//             let [pat2, env2] = typePatBind2(pat.expr, val, valTy, annotTy, env, topLevel)
//             let ty = pat2.ty
//             if (annotTy !== null) {
//                 ty = intersectTypes(ty, annotTy)
//                 // ty = typeAs(ty, annotTy)
//             }
//             else if (valTy !== null) {
//                 ty = intersectTypes(ty, valTy)
//             }
//             ty = knownInhabited(ty)
//             let tc = typeCheckPat(ty)
//             if (annotTy !== null) {
//                 let tc1 = typeCheck(ty, annotTy, pat.loc)
//                 tc = maxTypeCheckResult([tc, tc1])
//             }
//             if (valTy !== null) {
//                 let tc2 = typeCheck(ty, valTy, pat.loc)
//                 tc = maxTypeCheckResult([tc, tc2])
//             }

//             env2 = { ...env2 }
//             env2[pat.name] = [node(blockedValue(pat.name)), ty]
//             // return [{ ...pat, expr: pat2, ty: ty, tc: tc }, env2]
//             return [{ ...pat, expr: pat2, ty: ty }, env2]
//         }
//         case "EType": {

//             let patTypeExpr = typeExpr(pat.type, env, topLevel, null)
//             let typeAnnot = evalTypeAnnot(patTypeExpr, env)
//             typeAnnot = knownInhabited(typeAnnot)

//             if (annotTy !== null) {
//                 typeAnnot = intersectTypes(typeAnnot, annotTy)
//             }

//             let typeAnnotOpen = convertPatTypeOpen(typeAnnot)
//             let typeAnnotClosed = convertPatTypeClosed(typeAnnot)

//             // calculate the type of the term
//             let [patBind, envBind] = typePatBind2(pat.expr, val, null, typeAnnotOpen, env, topLevel)

//             // close back over the computed type of the term
//             let ty2 = patBind.ty
//             let ty: Type
//             let envResult: Env
//             if (typeAnnot.tag === "TAs") {
//                 // this will only work for as-type bindings at the root
//                 // TODO ? allow nested as-type patterns ?
//                 ty2 = closePatType(typeAnnot.name, ty2)
//                 ty2 = selfT(typeAnnot.name, ty2)
//                 ty = intersectTypes(typeAnnot.type, ty2)
//                 // ty = typeAs(typeAnnot.type, ty2)
//                 ty = knownInhabited(ty)
//                 ty = asT(typeAnnot.name, ty)

//                 envResult = matchTypes(ty, convertPatTypeOpen(ty))
//                 envResult = { ...envResult, ...envBind }
//             }
//             else {
//                 ty = intersectTypes(typeAnnot, ty2)
//                 ty = knownInhabited(ty)
//                 envResult = { ...envBind }
//             }

//             // TODO ? surely this should use typeAnnotClosed ?
//             // TODO ? where is this env going, perhaps we need two versions
//             // TODO ?   one using open types one closed ?
//             // let envResult = matchTypes(typeAnnot, typeAnnotOpen)
//             // let envResult = matchTypes(ty2, convertPatTypeOpen(ty2))
//             // envResult = { ...envResult, ...envBind }

//             // let ty = intersectTypes(typeAnnot, ty2)
//             // let ty = ty2


//             let tc = typeCheckPat(ty)
//             if (valTy !== null) {
//                 let tc1 = typeCheck(valTy, ty, pat.loc)
//                 tc = maxTypeCheckResult([tc, tc1])
//             }
//             let patResult: ExprType = { ...pat, expr: patBind, type: patTypeExpr, ty: ty, tc: tc }
//             return [patResult, envResult]
//         }

//         case "EList": {
//             let env2: Env = {}
//             let anTy = annotTy
//             let vaTy = valTy
//             let v: Node | null = val
//             let elems = pat.exprs.map(child => {
//                 // let hdAnTy = anTy === null ? null : typeHd(anTy, true)
//                 // let hdVaTy = vaTy === null ? null : typeHd(vaTy, true)
//                 let hdAnTy = anTy === null ? null : knownInhabited(typeHd(anTy, true))
//                 let hdVaTy = vaTy === null ? null : knownInhabited(typeHd(vaTy, true))

//                 let hdV = valueHd(v, topLevel)

//                 let [pat3, env3] = typePatBind2(child, hdV, hdVaTy, hdAnTy, env, topLevel)

//                 env2 = { ...env2, ...env3 }

//                 // anTy = anTy === null ? null : typeTl(anTy, true)
//                 // vaTy = vaTy === null ? null : typeTl(vaTy, true)
//                 anTy = anTy === null ? null : knownInhabited(typeTl(anTy, true))
//                 vaTy = vaTy === null ? null : knownInhabited(typeTl(vaTy, true))
//                 v = valueTl(v, topLevel)
//                 // conTy = typeTl(intersectTypes(conTy, pairT(pat3.ty, anyT)))

//                 return pat3
//             })
//             let tailPat: ExprType | null = null
//             let tailType: Type = nilT
//             if (pat.tail !== null) {
//                 let [tailPat2, env4] = typePatBind2(pat.tail, v, vaTy, anTy, env, topLevel)
//                 tailPat = tailPat2
//                 env2 = { ...env2, ...env4 }
//                 // tailType = tailPat.ty
//                 tailType = knownInhabited(tailPat.ty)
//             }
//             let synTy = elems.reduceRight((result, elem) => pairT(elem.ty, result), tailType);
//             let pat4: ExprType = { ...pat, exprs: elems, tail: tailPat, ty: synTy }
//             return [pat4, env2]
//         }

//         case "ELambda":
//         // case "TLambda":
//         case "EApply":
//         // case "ECase":
//         case "ELet":
//             throw new Error(`unhandled case ${pat.tag}, invalid pattern`)
//         default:
//             throw new Error(`missing case $ {pat.tag}`)
//     }
// }



//#endregion



//#region TypeFuns

const memoFuns_noMemo = {
    typeDom,
    typeHd,
    typeTl,
    substType,
    nodeToType,
    evalExpr,
    applyTypes,

    typeFreeVars,
    typeMaybePat,
    intersectTypes,
    evalTypeAnnot,
    unionTypes: unionTypes1,
    typeRelComp: typeRelComp1,
    matchTypes,
    valueHd,
    valueTl,

    convertPatTypeOpen,
    convertPatTypeClosed,
    closePatType,
}

const memoFuns_memo = {
    typeDom: typeMemoData.memoizeFunction("td", typeDom),
    typeHd: typeMemoData.memoizeFunction("th", typeHd),
    typeTl: typeMemoData.memoizeFunction("tt", typeTl),
    substType: typeMemoData.memoizeFunction("st", substType),
    nodeToType: typeMemoData.memoizeFunction("ntt", nodeToType),
    evalExpr: typeMemoData.memoizeFunction("ee", evalExpr),
    applyTypes: typeMemoData.memoizeFunction("at", applyTypes),

    typeFreeVars: typeMemoData.memoizeFunction("tfv", typeFreeVars),
    typeMaybePat: typeMemoData.memoizeFunction("tmp", typeMaybePat),
    intersectTypes: typeMemoData.memoizeFunction("it", intersectTypes),
    evalTypeAnnot: typeMemoData.memoizeFunction("eta", evalTypeAnnot),
    unionTypes: typeMemoData.memoizeFunction("ut", unionTypes1),
    typeRelComp: typeMemoData.memoizeFunction("trc", typeRelComp1),
    matchTypes: typeMemoData.memoizeFunction("mt", matchTypes),
    valueHd: typeMemoData.memoizeFunction("vh", valueHd),
    valueTl: typeMemoData.memoizeFunction("vt", valueTl),

    convertPatTypeOpen: typeMemoData.memoizeFunction("cpto", convertPatTypeOpen),
    convertPatTypeClosed: typeMemoData.memoizeFunction("cptc", convertPatTypeClosed),
    closePatType: typeMemoData.memoizeFunction("cpt", closePatType),
}

// const mf = memoFuns_noMemo
const mf = memoFuns_memo

//#endregion



//#region Bidir Types


// -----+------+--------------------
// TorT | TorP | function
// -----+------+--------------------
// Term | Term | typeExprBidir
// Term | Pat  | typePatBindBidir
// Type | Term | typeTypeBidir
// Type | Pat  | typeTypePatBindBidir
// -----+------+--------------------

type EnvMb = Env | null

function envAppend(a: Env, b: EnvMb): Env
function envAppend(a: EnvMb, b: EnvMb): EnvMb
function envAppend(a: EnvMb, b: EnvMb): EnvMb {
    if (a === null) return b
    if (b === null) return a
    return { ...a, ...b }
}

// const envEmpty = {}
const envEmpty: EnvMb = null

/** Takes an expression.
    Returns a rebuilt expresion with calculated bidirectional (synthesized+context) types added to every node */
export function typeExprBidir(expr: ExprLoc, contextTy: Type, env: Env, topLevel: boolean): ExprTypeBidir {
    const teb = typeExprBidir

    function returnResult(ty1: Type): ExprTypeBidir {
        const tc = typeCheck(ty1, contextTy, expr.loc)
        // Assign the type annotations to the original expr
        const expr2 = expr as ExprTypeBidir
        expr2.ty1 = ty1
        expr2.ty2 = contextTy
        expr2.tc = tc
        return expr2
    }

    try {
        reportProgress(3, "Bidir", expr.loc)

        switch (expr.tag) {
            case "EAs": {
                // TODO Handling of this "EAs" node should be moved into the "EType" branch of the typePatBindBidir function.
                let env2 = { ...env }
                // TODO ? check we're in a (function argument) type-context, dont't do this for values (or outside function argument types)
                env2[expr.name] = [node(typeValue(asVarT(expr.name))), typeT]
                let ex_ty = teb(expr.expr, contextTy, env2, topLevel)
                const ty1 = getTypeOrError(ex_ty)
                // let ex3: ExprTypeBidir = { ...expr, expr: ex_ty, ty1, ty2: contextTy }
                // result = ex3
                return returnResult(ty1)
            }
            case "EApply": {
                switch (expr.op) {
                    case "":
                    case "<|": {
                        let funcCtx = funT(voidT, anyT)
                        let funcExp = teb(expr.func, funcCtx, env, topLevel)
                        let funcTy = getTypeOrError(funcExp)
                        let argCtx = mf.typeDom(getTypeOrError(funcExp))

                        if (contextTy.tag === "TFun" && funcTy.tag === "TSelf" && funcTy.body.tag === "TFun") {
                            argCtx = mf.typeDom(mf.substType(funcTy.body, funcTy.name, funT(domainT(varT(funcTy.name)), contextTy), false))
                        }

                        let argExp = teb(expr.arg, argCtx, env, topLevel)
                        let argTy = getTypeOrError(argExp)
                        if (funcTy.tag === "TFun" && funcTy.argType.tag === "TTerm" && (argTy.tag === "TType" || argTy.tag === "TSingleType")) {
                            argTy = singleTypeT(mf.nodeToType(mf.evalExpr(argExp, env)))
                        }
                        if (funcTy.tag === "TFun" && funcTy.argType.tag === "TTermVar" && (argTy.tag === "TType" || argTy.tag === "TSingleType")) {
                            argTy = singleTypeT(mf.nodeToType(mf.evalExpr(argExp, env)))
                        }

                        let ty1 = mf.applyTypes(funcTy, argTy)
                        // let expr_type: ExprTypeBidir = { ...expr, func: funcExp, arg: argExp, ty1: ty1, ty2: contextTy }
                        // result = expr_type
                        return returnResult(ty1)
                    }
                    case "|>": {
                        let argCtx = anyT
                        let argExp = teb(expr.arg, argCtx, env, topLevel)

                        let funcCtx = funT(getTypeOrError(argExp), anyT)
                        let funcExp = teb(expr.func, funcCtx, env, topLevel)

                        let funcTy = getTypeOrError(funcExp)
                        let argTy = getTypeOrError(argExp)

                        if (funcTy.tag === "TFun" && funcTy.argType.tag === "TTerm" && (argTy.tag === "TType" || argTy.tag === "TSingleType")) {
                            argTy = singleTypeT(mf.nodeToType(mf.evalExpr(argExp, env)))
                        }
                        if (funcTy.tag === "TFun" && funcTy.argType.tag === "TTermVar" && (argTy.tag === "TType" || argTy.tag === "TSingleType")) {
                            argTy = singleTypeT(mf.nodeToType(mf.evalExpr(argExp, env)))
                        }

                        let ty1 = mf.applyTypes(funcTy, argTy)
                        // let expr_type: ExprTypeBidir = { ...expr, func: funcExp, arg: argExp, ty1: ty1, ty2: contextTy }
                        // result = expr_type
                        return returnResult(ty1)
                        break
                    }
                    default:
                        assert.noMissingCases(expr.op)
                }
                break
            }
            case "ELambda": {
                let argVal = node(blockedValue("lambda"))
                let arg = expr.pat
                if (arg.tag === "ETermBrackets") {
                    arg = arg.expr
                }
                // For simple parametric polymorphism: let f = (T: Type) -> ...
                if (arg.tag === "EType" && arg.type.tag === "EVar" && (arg.type.name === "type" || arg.type.name === "Type") && arg.expr.tag === "EVar") {
                    // TODO Handle this special case more generally
                    //   when we properly support evaluation beneath lambdas / evaluation of open-terms.
                    argVal = node(typeValue(varT(arg.expr.name)))
                }
                // More complex forms of polymorphism: let f = (T: { ... }) -> ...
                //   might need supprt evaluation beneath lambdas / evaluation of open-terms

                // For singleton-string based dependent-types, 
                //   handle "(key : Str) -> " as a special case.
                if (arg.tag === "EType" && arg.expr.tag === "EVar" && arg.type.tag === "EVar" && arg.type.name === "Str") {
                    argVal = node(termVarValue(arg.expr.name))
                }

                let argTy = typeDom(contextTy)

                if (argTy.tag === "TType" && arg.tag === "EVar") {
                    argVal = node(typeValue(singleTermVarT(arg.name)))
                }

                // This ensures that uninferred unannotated funtion arguments default to having type Any.
                // Very tempted to allow them to default to Void, as it removes the need for this special case.
                // Using type Any might seem more natural at first, 
                //   but there's not much use for a monomorphic function with argument type of Any anyway.
                let argTy2: Type | null = argTy
                if (argTy.tag === "TVoid") {
                    argTy2 = null
                }

                // let [pat2, env2] = tf.typePatBindBidir(expr.pat, argVal, argTy2, null, env1, false)
                // let newEnv = { ...env, ...env2 }
                const env2 = typePatBindBidir(expr.pat, argVal, argTy2, null, env, false)
                assumeExprIsTyped(expr.pat)
                const pat2 = expr.pat
                const newEnv = envAppend(env, env2) /* const newEnv = { ...env, ...env2 } */

                let argTypeRef = mf.convertPatTypeOpen(pat2.ty1)
                let bodyTy = mf.applyTypes(contextTy, argTypeRef, false)
                let bodyExp = teb(expr.body, bodyTy, newEnv, false)

                let lamArgTyp = getTypeOrError(pat2)
                // For singleton-string based dependent-types, 
                //   handle "(key : Str) -> " as a special case.
                if (arg.tag === "EType" && arg.expr.tag === "EVar" && arg.type.tag === "EVar" && arg.type.name === "Str") {
                    let varName = arg.expr.name
                    // Check if the argument term-var name is used within the type of the lambda-body.
                    if (mf.typeFreeVars(bodyExp.ty1).indexOf(varName) !== -1) {
                        lamArgTyp = termVarT(varName, strT)
                    }
                }

                let lamTyp = funT(lamArgTyp, getTypeOrError(bodyExp))
                const ty1 = lamTyp

                // let lamExp: ExprTypeBidir = { ...expr, pat: pat2, body: bodyExp, ty1, ty2: contextTy }
                // result = lamExp
                return returnResult(ty1)
            }
            case "ELambdaYes": {
                let argVal = node(blockedValue("lambda"))
                {
                    let pat = expr.pat
                    if (pat.tag === "ETermBrackets") {
                        pat = pat.expr
                    }
                    // For simple parametric polymorphism: let f = (T: Type) -> ...
                    if (pat.tag === "EType" && pat.type.tag === "EVar" && (pat.type.name === "type" || pat.type.name === "Type") && pat.expr.tag === "EVar") {
                        argVal = node(typeValue(varT(pat.expr.name)))
                    }
                }

                let argTy = mf.typeDom(contextTy)

                let argTy2: Type | null = argTy
                if (argTy.tag === "TVoid") {
                    argTy2 = null
                }
                // let [pat2, env2] = tf.typePatBindBidir(expr.pat, argVal, argTy2, null, env1, false)
                // let newEnv = { ...env, ...env2 }
                let env2 = typePatBindBidir(expr.pat, argVal, argTy2, null, env, false)
                assumeExprIsTyped(expr.pat)
                const pat2 = expr.pat
                const newEnv = envAppend(env, env2) /* const newEnv = { ...env, ...env2 } */

                let argTypeRef = mf.convertPatTypeOpen(pat2.ty1)

                let bodyTy = mf.applyTypes(contextTy, argTypeRef, false)
                let bodyTy2 = mf.typeHd(bodyTy)

                let bodyExp = teb(expr.body, bodyTy2, newEnv, false)

                let lamTyp = funT(getTypeOrError(pat2), pairT(getTypeOrError(bodyExp), nilT))
                const ty1 = lamTyp

                // let lamExp: ExprTypeBidir = { ...expr, pat: pat2, body: bodyExp, ty1: lamTyp, ty2: contextTy }
                // result = lamExp
                return returnResult(ty1)
            }
            case "ELambdaMaybe": {
                // TODO ? Check any type annotations on the maybe-func haven't over-constrained the domain.
                // TODO ? The maybe-func must handle anything the value part of the pattern says it will match.

                let maybePatTy = mf.typeMaybePat(expr.pat)
                let domTy = mf.typeDom(contextTy)
                let argRefTy = mf.intersectTypes(domTy, maybePatTy)

                // let [pat2, env2] = tf.typePatBindBidir(expr.pat, node(blockedValue("lambda")), null, argRefTy, env1, false)
                // let newEnv = { ...env, ...env2 }
                let env2 = typePatBindBidir(expr.pat, node(blockedValue("lambda")), null, argRefTy, env, false)
                assumeExprIsTyped(expr.pat)
                const pat2 = expr.pat
                const newEnv = envAppend(env, env2) /* const newEnv = { ...env, ...env2 } */


                let bodyTy = mf.typeHd(mf.applyTypes(contextTy, domTy))
                let bodyExp = teb(expr.body, bodyTy, newEnv, false)
                let lamTyp1: Type = funT(getTypeOrError(pat2), pairT(getTypeOrError(bodyExp), nilT))
                let lamTyp2: Type = funT(mf.typeRelComp(domTy, maybePatTy), nilT)
                let lamTyp: Type = mf.intersectTypes(lamTyp1, lamTyp2)

                let superCodomainTyp: Type = mf.unionTypes(nilT, pairT(anyT, nilT))
                let lamSubTyp: Type = subT(lamTyp, funT(domTy, superCodomainTyp))


                // The type of a LambdaMaybe function is 
                //   { { { { D & M -> [R] } & { D \ M -> [] } } <: { D -> [] | [Any] } }
                // where the type variables mean: D=domain, M=match, R=result
                // The subtyping makes the domain of the function more explicit.
                // Without this, type checking a call to a LambdaMaybe would require computing the inhabitation of:
                //    { A \ { { D & M } | { D \ M } } }
                // which gets needlessly and excesively complicated for some types.
                // The super-type could be given the more precise type:
                //    { D -> [] | [R] }
                // but this makes type-checking very slow, probably the type sizes are exploding somewhere for some reason.
                // Fortunately, just using { [] | [Any] } is sufficient for current purposes.

                const ty1 = lamSubTyp
                // let lamExp: ExprTypeBidir = { tag: "ELambdaMaybe", pat: pat2, body: bodyExp, loc: expr.loc, ty1: lamSubTyp, ty2: contextTy }
                // result = lamExp
                return returnResult(ty1)
            }
            case "ELambdaNo": {
                let maybePatTy = mf.typeMaybePat(expr.pat)
                let domTy = mf.typeDom(contextTy)
                let argRefTy = mf.intersectTypes(domTy, maybePatTy)

                // let [pat2, env2] = tf.typePatBindBidir(expr.pat, node(blockedValue("lambda")), null, argRefTy, env1, false)
                // let newEnv = { ...env, ...env2 }
                let env2 = typePatBindBidir(expr.pat, node(blockedValue("lambda")), null, argRefTy, env, false)
                assumeExprIsTyped(expr.pat)
                const pat2 = expr.pat
                const newEnv = envAppend(env, env2) /* const newEnv = { ...env, ...env2 } */


                let bodyTy = mf.applyTypes(contextTy, argRefTy) // TODO ? replace argRefTy with domTy ? (as was needed in ELambdaMaybe)
                let bodyExp = teb(expr.body, bodyTy, newEnv, false)
                let lamTyp1: Type = funT(getTypeOrError(pat2), getTypeOrError(bodyExp))
                let lamTyp2: Type = funT(mf.typeRelComp(domTy, maybePatTy), nilT)
                let lamTyp: Type = mf.intersectTypes(lamTyp1, lamTyp2)

                let superCodomainTyp: Type = mf.unionTypes(nilT, anyT)
                let lamSubTyp: Type = subT(lamTyp, funT(domTy, superCodomainTyp))

                // The type of a LambdaNo function is 
                //   { { { { D&M -> R } & { D\M -> [] } } <: { D -> [] | Any } }
                //   { { { { D&M -> R } & { D\M -> [] } } <: { D ->      Any } }   (could simplify to this)
                //   { { { { D&M -> R } & { D\M -> [] } } <: { D -> [] | R   } }   (or perhaps use this ?)
                // where the type variables mean: D=domain, M=match, R=result
                // The subtyping make the domain of the function more explicit.
                // Without this, type checking a call to a LambdaNo would require computing the inhabitation of:
                //    { A \ { {D&M} | {D\M} } }
                // which gets needlessly and excesively complicated for some types.

                const ty1 = lamSubTyp
                // let lamExp: ExprTypeBidir = { tag: "ELambdaNo", pat: pat2, body: bodyExp, loc: expr.loc, ty1: lamSubTyp, ty2: contextTy }
                // result = lamExp
                return returnResult(ty1)
            }
            case "ELet": {
                let [decls, newEnv] = typeDeclsBidir(expr.decls, env, topLevel) // TODO ? Revert to not appending to env1 in-place ?
                // TODO / REDO - check function body types against let-bound function return types
                let bodyExp = teb(expr.expr, contextTy, newEnv, topLevel)
                const ty1 = getTypeOrError(bodyExp)
                // let letExp: ExprTypeBidir = { ...expr, decls: decls, expr: bodyExp, ty1, ty2: bodyExp.ty2 }
                // result = letExp
                return returnResult(ty1)
            }
            case "EDatum": {
                let litTyp = typeOfValue(expr.value)
                const ty1 = litTyp
                // let ex3 = { ...expr, ty1: litTyp, ty2: contextTy }
                // result = ex3
                return returnResult(ty1)
            }
            case "EList": {
                let conTy = contextTy
                let exprs = expr.exprs.map(e => {
                    let elem = teb(e, mf.typeHd(conTy, true), env, topLevel)

                    if (elem.tc === "ok") {
                        // If the head type-checked ok, then refine our expectations of the tail type accordingly.
                        if (conTy.tag === "TSelf" && elem.ty1.tag === "TSingleType") {
                            conTy = mf.typeTl(mf.substType(conTy.body, conTy.name, pairT(elem.ty1.val, anyT), false))
                        }
                        else {
                            conTy = mf.typeTl(mf.intersectTypes(conTy, pairT(elem.ty1, anyT)), true)
                        }
                    }
                    else {
                        // Otherwise, type-check the tail indedependently of the type of the head.
                        conTy = mf.typeTl(conTy, true)
                    }
                    return elem
                })
                let types1 = exprs.map(e => getTypeOrError(e))
                let tailExpr: ExprTypeBidir | null = null
                let tailType: Type = nilT
                if (expr.tail !== null) {
                    tailExpr = teb(expr.tail, conTy, env, topLevel)
                    tailType = getTypeOrError(tailExpr)
                }
                let ty1 = types1.reduceRight((t, e) => pairT(e, t), tailType)
                // let tupleExpTy: ExprTypeBidir = { ...expr, exprs: exprs, tail: tailExpr, ty1: ty1, ty2: contextTy }
                // result = tupleExpTy
                return returnResult(ty1)
            }
            case "EType": {
                let typeExp = teb(expr.type, typeT, env, topLevel)
                let tyTy = mf.evalTypeAnnot(expr.type, env)
                let exprExp = teb(expr.expr, tyTy, env, topLevel)
                const ty1 = tyTy
                // let ex3: ExprTypeBidir = { ...expr, expr: exprExp, type: typeExp, ty1: tyTy, ty2: contextTy }
                // result = ex3
                return returnResult(ty1)
            }
            case "EVar": {
                if (!env.hasOwnProperty(expr.name)) {
                    if (UNKNOWN_VARS_TYPE_ERROR) {
                        console.log(`unknown variable (${expr.name}) at (${showLoc(expr.loc)})`)
                        // result = { ...expr, ty1: errorT, ty2: contextTy }
                        return returnResult(errorT)
                    }
                    throw new Error(`unknown variable (${expr.name}) at (${showLoc(expr.loc)})`)
                }
                let varTyp = env[expr.name][1]
                const ty1 = varTyp
                // let ex3 = { ...expr, ty1: varTyp, ty2: contextTy }
                // result = ex3
                return returnResult(ty1)
            }
            case "EPrim": {
                let op = env[expr.name]
                if (op === undefined) {
                    throw new Error(`Unknown operator (${expr.name})`)
                }
                let opTy = op[1]
                const argTys: ExprTypeBidir[] = []
                for (const arg of expr.args) {
                    const argCtxTy = mf.typeDom(opTy)
                    const argTy = teb(arg, argCtxTy, env, topLevel)
                    argTys.push(argTy)
                    opTy = mf.applyTypes(opTy, argTy.ty1)
                }
                const ty1 = opTy
                // const appliedOp: ExprTypeBidir = { ...expr, args: argTys, ty1: opTy, ty2: contextTy }
                // result = appliedOp
                return returnResult(ty1)
            }

            case "ETermBrackets": {
                let exp = teb(expr.expr, contextTy, env, topLevel)
                const ty1 = exp.ty1
                return returnResult(ty1)
                // return returnResult({ tag: "ETermBrackets", expr: exp, loc: expr.loc, ty1: exp.ty1, ty2: exp.ty2 })
                // return exp
            }
            case "ETypeBrackets": {
                let ty = typeTypeBidir(expr.expr, env, topLevel)
                const ty1 = ty.ty1
                return returnResult(ty1)
                // return returnResult({ tag: "ETypeBrackets", expr: ty, loc: expr.loc, ty1: ty.ty1, ty2: typeT, tc: "ok" })
            }

            case "EPair":
            case "ETypeAs":
            case "ESym":
            case "EAs":
                assert.impossible("We shouldn't encounter one of these here.")

            default:
                assert.noMissingCases(expr)
                throw new Error(`unknown expr ${JSON.stringify(expr)}`)
        }

    }
    catch (err) {
        let name = ""
        if (expr.tag === "EApply" && expr.func.tag === "EVar") {
            name = expr.func.name
        }
        console.log(`Error ${expr.loc.filename}: ${JSON.stringify(expr.loc.begin)} - ${JSON.stringify(expr.loc.end)}: ${name}`)
        throw err
    }
}


/** Annotates types on a pattern (lambda,let), and returns an environment containing the new bindings. */
function typePatBindBidir(pat: ExprLoc, val: Node | null, valTy: Type | null, annotTy: Type | null, env: Env, topLevel: boolean): EnvMb {
    let tpb = (pat: ExprLoc, val: Node | null, valTy: Type | null, annotTy: Type | null) =>
        typePatBindBidir(pat, val, valTy, annotTy, env, topLevel)

    if (valTy !== null && annotTy !== null) {
        throw new Error("oops")
    }

    let conTy = anyT
    if (valTy !== null) {
        conTy = valTy
    }
    if (annotTy !== null) {
        conTy = annotTy
    }

    function assignType(ty1: Type, ty2: Type | null = null): void {
        let tc1 = typeCheckPat(ty1)
        let tc = tc1
        if (ty2 !== null) {
            let tc2 = typeCheck(ty2, ty1, pat.loc)
            tc = maxTypeCheckResult([tc1, tc2])
        }
        // copy the result back onto the original pattern
        const pat2 = pat as ExprTypeBidir
        pat2.ty1 = ty1
        pat2.ty2 = ty2
        pat2.tc = tc
    }

    switch (pat.tag) {
        case "ETermBrackets": {
            let env2 = tpb(pat.expr, val, valTy, annotTy)
            assumeExprIsTyped(pat)
            assignType(pat.expr.ty1, pat.expr.ty2)
            return env2
        }
        case "EDatum": {
            let ty = typeOfValue(pat.value)
            let ty2 = anyT
            if (annotTy !== null) {
                ty2 = annotTy
            }
            else if (valTy !== null) {
                ty2 = valTy
            }

            assignType(ty, ty2)
            return envEmpty
            // return returnResult([{ ...pat, ty1: ty, ty2: ty2, tc: undefined }, {}])
        }
        case "EVar": {
            let ty = anyT
            if (annotTy !== null) {
                ty = annotTy
            }
            else if (valTy !== null) {
                ty = valTy
            }
            ty = knownInhabited(ty)
            let env2 = envEmpty
            if (val === null && ty.tag === "TType") {
                val = node(typeValue(varT(pat.name)))
            }
            else
                if (val === null) {
                    val = node(blockedValue("var"))
                }
            if (val !== null) { // TODO ? Remove this condition ?
                env2 = { [pat.name]: [val, ty] }
            }

            assignType(ty, ty)
            return env2
            // return returnResult([{ ...pat, ty1: ty, ty2: ty, tc: undefined }, env2])
        }
        case "EAs": {
            let env2 = tpb(pat.expr, val, valTy, annotTy)
            assumeExprIsTyped(pat.expr)
            let ty = pat.expr.ty1
            let ty2 = anyT
            if (annotTy !== null) {
                ty2 = mf.intersectTypes(ty, annotTy)
            }
            else if (valTy !== null) {
                ty2 = mf.intersectTypes(ty, valTy)
            }
            ty = mf.intersectTypes(ty, ty2)
            ty = knownInhabited(ty)
            let tc = typeCheckPat(ty)
            let tc2 = typeCheck(ty, ty2, pat.loc)
            tc = maxTypeCheckResult([tc, tc2])

            env2 = { ...env2 }
            // if (val !== null) { // TODO ? Make this unconditional ?
            env2[pat.name] = [node(blockedValue(pat.name)), ty]
            // }
            // TODO ? use val here ?
            // env2[pat.name] = [val, ty]
            assignType(ty, ty)
            return env2
            // return returnResult([{ ...pat, expr: pat2, ty1: ty, ty2: ty, tc: tc }, env2])
        }
        case "EType": {
            let patTypeExpr = typeExprBidir(pat.type, typeT, env, topLevel)
            let typeAnnot = mf.evalTypeAnnot(patTypeExpr, env)
            typeAnnot = knownInhabited(typeAnnot)

            if (annotTy !== null) {
                typeAnnot = mf.intersectTypes(typeAnnot, annotTy)
            }

            let typeAnnotOpen = mf.convertPatTypeOpen(typeAnnot)
            // let typeAnnotClosed = mf.convertPatTypeClosed(typeAnnot)

            // Calculate the type of the term.
            let envBind = tpb(pat.expr, val, null, typeAnnotOpen)
            assumeExprIsTyped(pat)

            // Close back over the computed type of the term.
            let ty2 = pat.expr.ty1
            let ty: Type
            let envResult: Env
            if (typeAnnot.tag === "TAs") {
                ty2 = mf.closePatType(typeAnnot.name, ty2)
                ty2 = selfT(typeAnnot.name, ty2)
                ty = mf.intersectTypes(typeAnnot.type, ty2)
                ty = asT(typeAnnot.name, ty)
                ty = knownInhabited(ty)
                envResult = mf.matchTypes(ty, mf.convertPatTypeOpen(ty))
                envResult = { ...envResult, ...envBind }
            }
            else {
                ty = mf.intersectTypes(typeAnnot, ty2)
                ty = knownInhabited(ty)
                envResult = { ...envBind }
            }

            // let patResult: ExprTypeBidir = { ...pat, expr: patBind, type: patTypeExpr, ty1: ty, ty2: valTy }
            assignType(ty, valTy)
            return envResult
        }
        // case "ETypeAs": {
        //     const pat2 = ex.eTypeAnnot(pat.loc, pat.expr, ex.eAs(pat.loc, pat.name, pat.type))
        //     return tpb(pat2, val, valTy, annotTy, env, topLevel)
        // }
        case "EList": {
            let env2: Env = {}
            let anTy = annotTy
            let vaTy = valTy
            let v: Node | null = val
            let elems = pat.exprs.map(child => {
                let hdAnTy = anTy === null ? null : knownInhabited(typeHd(anTy, true))
                let hdVaTy = vaTy === null ? null : knownInhabited(typeHd(vaTy, true))
                let hdV = mf.valueHd(v, topLevel)
                let env3 = tpb(child, hdV, hdVaTy, hdAnTy)
                assumeExprIsTyped(child)
                const pat3 = child
                env2 = { ...env2, ...env3 }
                anTy = anTy === null ? null : knownInhabited(mf.typeTl(mf.intersectTypes(anTy, pairT(pat3.ty1, anyT)), true))
                vaTy = vaTy === null ? null : knownInhabited(mf.typeTl(mf.intersectTypes(vaTy, pairT(pat3.ty1, anyT)), true))
                v = mf.valueTl(v, topLevel)
                return pat3
            })
            let tailPat: ExprTypeBidir | null = null
            let tailType: Type = nilT
            if (pat.tail !== null) {
                const env4 = tpb(pat.tail, v, vaTy, anTy)
                assumeExprIsTyped(pat.tail)
                const tailPat2 = pat.tail
                tailPat = tailPat2
                env2 = { ...env2, ...env4 }
                tailType = tailPat.ty1
                tailType = knownInhabited(tailType)
            }
            let synTy = elems.reduceRight((result, elem) => pairT(elem.ty1, result), tailType);
            synTy = knownInhabited(synTy)
            conTy = mf.intersectTypes(conTy, synTy)
            conTy = knownInhabited(conTy)
            // let pat4: ExprTypeBidir = { ...pat, exprs: elems, tail: tailPat, ty1: synTy, ty2: conTy }
            assignType(synTy, conTy)
            return env2
        }
        case "ELambda":
        case "EApply":
        case "ELet":
        case "EPair":
        case "ETypeAs":
        case "ELambdaMaybe":
        case "ELambdaNo":
        case "ELambdaYes":
        case "ETypeBrackets":
        case "ESym":
        case "EPrim":
            throw new Error(`unhandled case (${pat.tag}) at (${showLoc(pat.loc)}), invalid pattern`)
        default:
            assert.noMissingCases(pat)
            throw new Error(`missing case ${pat.tag} ${showLoc(pat.loc)}`)
    }
}


// const USE_TYPE_PAT_BIND = true
/** Used to type the pattern side of a type-lambda
      { <pat> -> ... }
      { <name> @ <pat> -> ... }
      { <pat> : Type -> ... }
      { <pat> : Str -> ... }
 */
// function typeTypePatBindBidir(expr: Expr, env: Env, topLevel: boolean): [ExprTypeBidir, Env] {
function typeTypePatBindBidir(expr: ExprLoc, env: Env, topLevel: boolean): EnvMb {

    const ttpbb = (expr: ExprLoc) => typeTypePatBindBidir(expr, env, topLevel)

    function assignType(ty1: Type, ty2?: Type, tc?: TypeCheckResult | null): ExprTypeBidir {
        ty2 ??= typeT
        if (tc === undefined) {
            tc = typeCheck(ty1, ty2, expr.loc)
        }
        // copy the result back onto the original pattern
        const expr2 = expr as ExprTypeBidir
        expr2.ty1 = ty1
        expr2.ty2 = ty2
        expr2.tc = tc
        return expr2
    }


    // TODO check correct/consistent handling of env variable
    switch (expr.tag) {
        case "EType": {
            let type = typeTypeBidir(expr.type, env, topLevel)
            if (expr.type.tag === "EVar" && expr.type.name === "Type") {
                let env2 = typePatBindBidir(expr.expr, null, null, typeT, env, topLevel)
                const ty1 = typeT
                const ty2 = typeT
                // let result: ExprTypeBidir = { ...expr, expr: term, type: type, ty1: typeT, ty2: typeT, tc: null }
                assignType(ty1, ty2)
                return env2
            }
            else if (expr.type.tag === "EVar" && expr.type.name === "Str") {
                // let [term, env2] = typePatBindBidir(expr.expr, null, null, strT, env, topLevel)
                let env2 = typePatBindBidir(expr.expr, null, null, strT, env, topLevel)
                const ty1 = strT
                const ty2 = strT
                // let result: ExprTypeBidir = { ...expr, expr: term, type: type, ty1: strT, ty2: strT, tc: null }
                assignType(ty1, ty2)
                return env2
            }
            else {
                throw new Error(`unhandled case ${type.ty1.tag}`)
            }
        }
        case "EAs": {
            let env2: Env = {}
            env2[expr.name] = [node(typeValue(asVarT(expr.name))), typeT]
            const newEnv = envAppend(env, env2) /* const newEnv = { ...env, ...env2 } */
            let body = typeTypeBidir(expr.expr, newEnv, topLevel)
            const ty1 = typeT
            const ty2 = typeT
            assignType(ty1, ty2)
            return env2
            // return returnResult([{ ...expr, expr: body, ty1: typeT, ty2: typeT, tc: null }, env2])
        }
        case "EDatum": {
            let ty = typeOfValue(expr.value)
            const ty1 = typeT
            const ty2 = typeT
            assignType(ty1, ty2)
            return envEmpty
            // return returnResult([{ ...expr, ty1: typeT, ty2: typeT, tc: null }, {}])
        }
        case "EVar": {
            if (!env.hasOwnProperty(expr.name)) {
                if (UNKNOWN_VARS_TYPE_ERROR) {
                    console.log(`unknown variable (${expr.name}) at (${showLoc(expr.loc)})`)
                    assignType(errorT, typeT, "error")
                    return envEmpty
                    // return returnResult([{ ...expr, ty1: errorT, ty2: typeT, tc: "error" }, {}])
                }
                throw new Error(`unknown variable (${expr.name}) at (${showLoc(expr.loc)})`)
            }
            let [ty, tyT] = env[expr.name]
            let tc: TypeCheckResult = tyT.tag === "TType" || tyT.tag === "TSingleType" ? "ok" : "error"
            const ty1 = tyT
            const ty2 = typeT
            assignType(ty1, ty2, tc)
            return envEmpty
            // return returnResult([{ tag: "EVar", name: expr.name, loc: expr.loc, ty1: tyT, ty2: typeT, tc: tc }, {}])
        }
        case "EList": {
            let elems = expr.exprs.map(exp => typeTypeBidir(exp, env, topLevel))
            let tail = expr.tail === null ? null : typeTypeBidir(expr.tail, env, topLevel)
            // We could use a more precise sub-type of type for "ty1",
            //   such as a compound singleton type.
            // But that's not currently supported.
            const ty1 = typeT
            const ty2 = typeT
            assignType(ty1, ty2)
            return envEmpty
            // return returnResult([{ ...expr, exprs: elems, tail: tail, ty1, ty2: typeT, tc: null }, {}])
        }
        case "ETermBrackets": {
            let expr2 = typeExprBidir(expr.expr, typeT, env, topLevel)
            let tc: TypeCheckResult = expr2.ty1.tag === "TType" || expr2.ty1.tag === "TSingleType" ? "ok" : "error"
            const ty1 = expr2.ty1
            const ty2 = typeT
            assignType(ty1, ty2, tc)
            return envEmpty
            // return returnResult([{ ...expr, expr: expr2, ty1: expr2.ty1, ty2: typeT, tc: tc }, {}])
        }
        case "ETypeBrackets": {
            // let [expr2, env2] = ttpbb(expr.expr, env, topLevel)
            let env2 = ttpbb(expr.expr)
            // const env2 = env
            const ty1 = typeT
            const ty2 = typeT
            assignType(ty1, ty2)
            return env2
            // return returnResult([{ ...expr, expr: expr2, ty1: typeT, ty2: typeT, tc: null }, env2])
        }
        case "ELambda": {
            // let [argTy, env2] = ttpbb(expr.pat, env, topLevel)
            let env2 = ttpbb(expr.pat)
            const newEnv = envAppend(env, env2) /* const newEnv = { ...env, ...env2 } */
            // TODO ? Call splitTypeBindings here, instead of explicitly testing for EAs ?
            if (expr.pat.tag === "EAs") {
                newEnv[expr.pat.name] = [node(typeValue(asVarT(expr.pat.name))), typeT]
            }
            let bodyTy = typeTypeBidir(expr.body, newEnv, topLevel)
            const ty1 = typeT
            const ty2 = typeT
            // let tlamExp: ExprTypeBidir = { tag: "ELambda", pat: argTy, body: bodyTy, loc: expr.loc, ty1: typeT, ty2: typeT, tc: null }
            assignType(ty1, ty2)
            return env2
        }
        case "EApply": {
            let env2 = ttpbb(expr.func)
            let env3 = ttpbb(expr.arg)
            assumeExprIsTyped(expr)
            let appTy = mf.applyTypes(expr.func.ty1, expr.arg.ty1)
            const ty1 = appTy
            const ty2 = typeT
            // let app: ExprTypeBidir = { ...expr, func: funcTy, arg: argTy, ty1: appTy, ty2: typeT }
            assignType(ty1, ty2, null)
            return envEmpty
        }
        case "EPrim": {
            const args = expr.args.map(a => typeTypeBidir(a, env, topLevel))
            const ty1 = typeT
            const ty2 = typeT
            assignType(ty1, ty2)
            return envEmpty
            // return returnResult([{ ...expr, args, ty1: typeT, ty2: typeT, tc: null }, {}])
        }
        case "ELet":
        case "EPair":
        case "ETypeAs":
        case "ELambdaMaybe":
        case "ELambdaNo":
        case "ELambdaYes":
        case "ESym":
            assert.impossible()
        default:
            assert.noMissingCases(expr)
            throw new Error(`typeTypePatBindBidir: missing case ${expr.tag}`)
    }
}


/** Adds type annotations to expressions within type-brackets */
function typeTypeBidir(expr: ExprLoc, env: Env, topLevel: boolean): ExprTypeBidir {
    const ttb = typeTypeBidir
    function returnResult2(ty1: Type, tc?: TypeCheckResult | null): ExprTypeBidir {
        const ty2 = typeT
        tc ??= typeCheck(ty1, ty2, expr.loc)
        const expr2 = expr as ExprTypeBidir
        expr2.ty1 = ty1
        expr2.ty2 = ty2
        expr2.tc = tc
        return expr2
    }
    switch (expr.tag) {
        case "EDatum": {
            let ty = typeOfValue(expr.value)
            let ty1 = singleTypeT(ty)
            return returnResult2(ty1)
            // return { ...expr, ty1: ty1, ty2: typeT, tc: null }
        }
        case "EVar": {
            if (!env.hasOwnProperty(expr.name)) {
                if (UNKNOWN_VARS_TYPE_ERROR) {
                    console.log(`Unknown variable (${expr.name}) at (${showLoc(expr.loc)}).`)
                    return returnResult2(errorT, "error")
                    // return { ...expr, ty1: errorT, ty2: typeT, tc: "error" }
                }
                throw new Error(`Unknown variable (${expr.name}) at (${showLoc(expr.loc)}).`)
            }
            let [ty, tyT] = env[expr.name]
            let tc: TypeCheckResult = tyT.tag === "TType" || tyT.tag === "TSingleType" ? "ok" : "error"
            return returnResult2(tyT, tc)
            // return { tag: "EVar", name: expr.name, loc: expr.loc, ty1: tyT, ty2: typeT, tc: tc }
        }
        case "ELambda": {
            // if (!USE_TYPE_PAT_BIND) {
            //     let argTy = ttb(expr.pat, env, topLevel)
            //     let newEnv = { ...env }
            //     // TODO ? Call splitTypeBindings here, instead of explicitly testing for EAs ?
            //     if (argTy.tag === "EAs") {
            //         newEnv[argTy.name] = [node(typeValue(asVarT(argTy.name))), typeT]
            //     }
            //     let bodyTy = ttb(expr.body, newEnv, topLevel)
            //     let tlamExp: ExprTypeBidir = { tag: "ELambda", pat: argTy, body: bodyTy, loc: expr.loc, ty1: typeT, ty2: typeT, tc: null }
            //     return tlamExp
            // }
            // else 
            {
                let env2 = typeTypePatBindBidir(expr.pat, env, topLevel)
                assumeExprIsTyped(expr.pat)
                const argTy = expr.pat
                const newEnv = envAppend(env, env2) /* const newEnv = { ...env, ...env2 } */
                // TODO ? Call splitTypeBindings here, instead of explicitly testing for EAs ?
                if (argTy.tag === "EAs") {
                    newEnv[argTy.name] = [node(typeValue(asVarT(argTy.name))), typeT]
                }

                ttb(expr.body, newEnv, topLevel)
                return returnResult2(typeT, null)
                // let tlamExp: ExprTypeBidir = { tag: "ELambda", pat: argTy, body: bodyTy, loc: expr.loc, ty1: typeT, ty2: typeT, tc: null }
                // return tlamExp
            }
        }
        case "ETermBrackets": {
            let expr2 = typeExprBidir(expr.expr, typeT, env, topLevel)
            let tc: TypeCheckResult = expr2.ty1.tag === "TType" || expr2.ty1.tag === "TSingleType" ? "ok" : "error"
            return returnResult2(expr2.ty1, tc)
            // return { ...expr, expr: expr2, ty1: expr2.ty1, ty2: typeT, tc: tc }
        }
        case "EList": {
            let elems = expr.exprs.map(exp => ttb(exp, env, topLevel))
            let tail = expr.tail === null ? null : ttb(expr.tail, env, topLevel)

            let ty: Type = tail === null ? singleTypeT(nilT) : tail?.ty1
            ty = elems.reduceRight((ty, elem) => {
                if (ty.tag === "TSingleType" && elem.ty1.tag === "TSingleType") {
                    return singleTypeT(pairT(elem.ty1.val, ty.val))
                }
                else {
                    return typeT
                }
            }, ty)

            return returnResult2(ty, null)
            // return { ...expr, exprs: elems, tail: tail, ty1: ty, ty2: typeT, tc: null }
        }
        case "EApply": {
            let func = ttb(expr.func, env, topLevel)
            let arg = ttb(expr.arg, env, topLevel)
            return returnResult2(typeT, null)
            // return { ...expr, func: func, arg: arg, ty1: typeT, ty2: typeT, tc: null }
        }
        case "EAs": {
            let env2 = { ...env }
            env2[expr.name] = [node(typeValue(asVarT(expr.name))), typeT]
            let body = ttb(expr.expr, env2, topLevel)
            return returnResult2(typeT, null)
            // return { ...expr, expr: body, ty1: typeT, ty2: typeT, tc: null }
        }
        case "ETypeBrackets": {
            let expr2 = ttb(expr.expr, env, topLevel)
            return returnResult2(typeT, null)
            // return { ...expr, expr: expr2, ty1: typeT, ty2: typeT, tc: null }
        }
        case "EPrim": {
            const args = expr.args.map(a => ttb(a, env, topLevel))
            return returnResult2(typeT, null)
            // return { ...expr, args, ty1: typeT, ty2: typeT, tc: null }
        }
        case "ELet":
        case "EPair":
        case "EType":
        case "ETypeAs":
        case "ELambdaMaybe":
        case "ELambdaNo":
        case "ELambdaYes":
        case "ESym":
            assert.impossible()
        default:
            assert.noMissingCases(expr)
    }
}


export function typeDeclBidir(expr_decl: Decl<LocField>, env: Env, topLevel: boolean): [DeclTypeBidir, Env] {
    let [pat, defn] = expr_decl
    reportProgress(topLevel ? 1 : 2, "Bidir", pat.loc)

    let trimmedEnv = trimEnviron(expr_decl, env)
    let envIgnore = typePatBindBidir(pat, null, null, null, trimmedEnv, topLevel)
    assumeExprIsTyped(pat)
    let declExp = typeExprBidir(defn, pat.ty1, trimmedEnv, topLevel)

    let declVal: Node = node(blockedValue("let"))
    let declTy: Type = getTypeOrError(declExp)
    if (topLevel) {
        declVal = mf.evalExpr(defn, trimmedEnv)
    }

    // let [pat3A, newEnvEntries] = typePatBindBidir(pattern, declVal, declTy, null, trimmedEnv0, topLevel)
    let newEnvEntries = typePatBindBidir(pat, declVal, declTy, null, trimmedEnv, topLevel)

    return [[pat, declExp], newEnvEntries ?? {}]
}


function typeDeclsBidir(expr_decls: Decl<LocField>[], env: Env, topLevel: boolean): [DeclTypeBidir[], Env] {
    let newEnv = { ...env }
    let decls: DeclTypeBidir[] = []
    for (let expr_decl of expr_decls) {
        let [[pat3A, declExp], newEnvEntries] = typeDeclBidir(expr_decl, newEnv, topLevel)
        decls.push([pat3A, declExp])
        Object.assign(newEnv, newEnvEntries)
    }

    return [decls, newEnv]
}




//#endregion



//#region Type Checking


// export type TypeCheckResult = "ok" | "warn" | "error"
// export type TypeCheckResult = "ok" | "unknown" | "error"
export type TypeCheckResult = "ok" | "unproven" | "error"

export function tcLevel(a: TypeCheckResult): number {
    switch (a) {
        case "ok": return 0
        // case "warn": return 1
        case "unproven": return 1
        case "error": return 2
        default: throw new Error(`missing case ${a}`)
    }
}

export function tcName(a: number): TypeCheckResult {
    switch (a) {
        case 0: return "ok"
        // case 1: return "warn"
        case 1: return "unproven"
        case 2: return "error"
        default: throw new Error(`missing case ${a}`)
    }
}


export function maxTypeCheckResult(a: (TypeCheckResult | null)[]): TypeCheckResult {
    let resultLevel = 0
    for (let t of a) {
        if (t !== null && tcLevel(t) > resultLevel) {
            resultLevel = tcLevel(t)
        }
    }
    return tcName(resultLevel)
}

function minTypeCheckResult(a: (TypeCheckResult | null)[]): TypeCheckResult {
    let resultLevel = 2
    for (let t of a) {
        if (t !== null && tcLevel(t) < resultLevel) {
            resultLevel = tcLevel(t)
        }
    }
    return tcName(resultLevel)
}

// // checks if we can use an "a" as a "b"
// function typeCheck2(a: Type, b: Type): TypeCheckResult {
//     let isOk = tiIsFalse(tiCalc(globalTIMemo, typeRelComp0(a, b)))
//     if (isOk) {
//         return "ok"
//     }
//     // let isWarn = !tiIsFalse(tiCalc(globalTIMemo, typeIntersect0(a, b)))
//     let isWarn = false
//     if (isWarn) {
//         // let isOk = tiIsFalse(tiCalc({}, typeRelComp0(a, b)))
//         let isOk = tiIsFalse(tiCalc(newTiMap(), typeRelComp0(a, b)))
//         // let isWarn = !tiIsFalse(tiCalc({}, typeIntersect0(a, b)))
//         return "warn"
//     }
//     else {
//         // let isOk = tiIsFalse(tiCalc({}, typeRelComp0(a, b)))
//         let isOk = tiIsFalse(tiCalc(newTiMap(), typeRelComp0(a, b)))
//         // let isWarn = !tiIsFalse(tiCalc({}, typeIntersect0(a, b)))
//         return "error"
//     }
// }

// checks if we can use an "a" as a "b"
function typeCheck2_noMemo(a: Type, b: Type): TypeCheckResult {
    let ti = tiCalc(globalTIMemo, typeRelComp0(a, b))
    let isOk = ttiIsFalse(ti)
    let isUnproven = t(ti)
    if (isOk) {
        return "ok"
    }
    else if (isUnproven) {
        return "unproven"
    }
    else {
        return "error"
    }
}

// let typeCheck2 = typeCheck2_noMemo
let typeCheck2 = typeMemoData.memoizeFunction("tc", typeCheck2_noMemo)


export function typeCheck(a: Type, b: Type, loc: Loc | null): TypeCheckResult {
    // b = knownInhabited(b)
    let tc2 = typeCheck2(a, b)
    // if (tc2 === "error" || (tc2 === "unproven" && !ignoreUnproven)) {
    if (tc2 === "error" || tc2 === "unproven") {
        let locTxt = loc === null ? "" : showLoc(loc)
        console.log(`TYPE CHECK ERROR (${tc2}) ${locTxt}`)
        console.log(`    A: ${showType2(a)}`)
        console.log(`    B: ${showType2(b)}`)

        console.log("*** A ***")
        console.log(showType4(a, null, 120))
        console.log("*** B ***")
        console.log(showType4(b, null, 120))

        // let isOk = tiIsFalse(tiCalc(newTiMap(), typeRelComp0(a, b)))
        console.log("CAUSE {A \\ B}")
        tiShowCause(globalTIMemo, typeRelComp0(a, b), console.log)
        // console.log("CAUSE {A & B}")
        // tiShowCause(globalTIMemo, typeIntersect0(a, b))
    }
    // else {
    //     console.log("*** A ***")
    //     console.log(showType4(a, null, 120))
    //     console.log("*** B ***")
    //     console.log(showType4(b, null, 120))
    //     console.log("CAUSE {A \\ B}")
    //     tiShowCause(globalTIMemo, typeRelComp0(a, b))
    // }
    return tc2
}

export function typeCheckTorP(torp: "Term" | "Pat", ty1: Type, ty2: Type, loc: Loc | null): TypeCheckResult {
    switch (torp) {
        case "Term":
            return typeCheck(ty1, ty2, loc)
        case "Pat":
            return typeCheck(ty2, ty1, loc)
        default:
            throw new Error("missing case")
    }
}


// Report a type error if the type pattern is obviously uninhabited.
// If the type pattern is maybe uninhabited, that's okay,
//   any consequential error will still get caught.
// Catching errors here isn't stictly needed, but should help 
//   with error report locality when there is very obviously an error.
function typeCheckPat(ty: Type): TypeCheckResult | null {
    // check for VERY obvious uninhabitation
    let tc: TypeCheckResult = ty.tag === "TVoid" ? "error" : "ok"
    return tc

    // check for slightly less obvious structural signs of uninhabitation
    // 
    // this might be preferable, but currently causes the definition of
    // init_env in fe3-eval.fe problems as it contains the castT function with type { Any -> Void }
    // which is uninhabited, making the whole environment uninhabited.
    // if the cast function is changed to { {A:Type} -> {B:Type} -> A -> B }
    // then we should still be able to use the cast function in the environment.
    // partially applied versions of cast would still be permitted,
    // they could still be invalid, so long as they're not obviously invalid.
    // Casting should be banned by default anyway.

    // let ti = tiStructural(ty)
    // if (tiIsTrue(ti)) {
    //     return "ok"
    // }
    // else if (tiIsFalse(ti)) {
    //     return "error"
    // }
    // else {
    //     return null
    // }

    // let tc: TypeCheckResult = tiIsFalse(tiStructural(ty)) ? "error" : "ok"
    // return tc
}



//#endregion



//#region TI Constructors + Utils

type TypeInhabited = [boolean, boolean] // [is void, is not-void]
type TIValue = TypeInhabited

const ttiUnknown: TypeInhabited = [false, false]
const ttiDontKnow: TypeInhabited = [false, false] // TODO ? distinguish between don't know and can't know ?
const ttiCantKnow: TypeInhabited = [false, false] // TODO ?
const ttiFalse: TypeInhabited = [true, false]
const ttiTrue: TypeInhabited = [false, true]
const ttiContradiction: TypeInhabited = [true, true]
function ttiKnown(ti: boolean): TypeInhabited {
    return ti ? ttiTrue : ttiFalse
}

function TypeInhabitationContradictionDetected(msg = ""): void {
    throw new Error("Type Inhabitation Contradiction Detected")
    // console.log(`Type Inhabitation Contradiction Detected ${msg}`)

}

function ttiAnd([aF, aT]: TypeInhabited, [bF, bT]: TypeInhabited): TypeInhabited {
    return [aF || bF, aT && bT]
}
function ttiAndImp(a: TypeInhabited, b: TypeInhabited): TypeInhabited {
    if (ttiIsTrue(a) && ttiIsFalse(b)) {
        TypeInhabitationContradictionDetected()
        return ttiContradiction
    }
    else if (ttiIsTrue(a)) {
        return ttiTrue
    }
    else if (ttiIsFalse(b)) {
        return ttiFalse
    }
    else {
        return ttiAnd(a, b)
    }
}

function ttiOr([aF, aT]: TypeInhabited, [bF, bT]: TypeInhabited): TypeInhabited {
    return [aF && bF, aT || bT]
}
function ttiOrImp(a: TypeInhabited, b: TypeInhabited): TypeInhabited {
    if (ttiIsTrue(a) && ttiIsFalse(b)) {
        TypeInhabitationContradictionDetected()
        return ttiContradiction
    }
    else if (ttiIsTrue(a)) {
        return ttiTrue
    }
    else if (ttiIsFalse(b)) {
        return ttiFalse
    }
    else {
        return ttiOr(a, b)
    }
}

function ttiNot([aF, aT]: TypeInhabited): TypeInhabited {
    // return [!aF, !aT]
    return [aT, aF]
}


export function ttiIsFalse([tF, tT]: TypeInhabited): boolean {
    if (tF && tT) {
        TypeInhabitationContradictionDetected()
    }

    return tF
}

function ttiIsTrue([tF, tT]: TypeInhabited): boolean {
    if (tF && tT) {
        TypeInhabitationContradictionDetected()
    }
    return tT
}
function t([tF, tT]: TypeInhabited): boolean {
    if (tF && tT) {
        TypeInhabitationContradictionDetected()
    }
    return !tF && !tT
}
function ttiIsKnown([tF, tT]: TypeInhabited): boolean {
    if (tF && tT) {
        TypeInhabitationContradictionDetected()
    }
    return tF || tT
}


// Type Inhabitation Rules

// type TIMemoKey = string
export type TIMemoKey = MemoID

type TIRuleName = string
type TIExprList = [TIRuleName, TIExpr][]
// export type TIMemoEntry = { ty: Type, typeName: TIMemoKey, typeNum: number, value: TypeInhabited | null, exprs: TIExprList | null, cause: number[] }
export type TIMemoEntry = { /*ty: Type,*/ typeName: TIMemoKey, typeNum: number, value: TypeInhabited | null, exprs: TIExprList | null, cause: number[] }
// TODO ? remove typeNum ?
// TODO ? rename typeName to typeId ?

// type TIMemo = { [typeName: string]: TIMemoEntry }
// type TIMemo = Map<string, TIMemoEntry>
export type TIMemo = Map<TIMemoKey, TIMemoEntry>

type TICause = TIMemoKey | TICause[]

type TIExprConst = { tag: "Const", result: TypeInhabited, cause?: TICause }
type TIExprRef = { tag: "Ref", result?: TypeInhabited, cause?: TICause, a: TIMemoKey }
type TIExprAnd = { tag: "And", result?: TypeInhabited, cause?: TICause, a: TIExpr, b: TIExpr }
type TIExprAndImp = { tag: "AndImp", result?: TypeInhabited, cause?: TICause, a: TIExpr, b: TIExpr }
type TIExprOr = { tag: "Or", result?: TypeInhabited, cause?: TICause, a: TIExpr, b: TIExpr }
type TIExprOrImp = { tag: "OrImp", result?: TypeInhabited, cause?: TICause, a: TIExpr, b: TIExpr }
type TIExprNot = { tag: "Not", result?: TypeInhabited, cause?: TICause, a: TIExpr }
export type TIExpr =
    TIExprConst
    | TIExprRef
    | TIExprAnd | TIExprAndImp
    | TIExprOr | TIExprOrImp
    | TIExprNot


function u2n(a: any) {
    if (a === undefined) {
        a = null
    }
    return a
}

function n2u(a: any) {
    if (a === null) {
        a = undefined
    }
    return a
}

// function dehydrateTiEntry(e: TIMemoEntry): memo.Data {
//     return [e.typeName, e.value, e.exprs === null ? null : e.exprs.map(([name, exp]) => [name, dehydrateTiExpr(exp)]), e.cause]
// }

// function rehydrateTiEntry(d: memo.Data): TIMemoEntry {
//     let [name, value, exprs, cause] = d as memo.MemoData[]
//     let name2 = name as unknown as TIMemoKey
//     let value2 = value as unknown as TypeInhabited | null
//     let exprs2 = exprs as unknown as TIExprList | null
//     let cause2 = cause as unknown as number[]
//     // let result: TIMemoEntry = { ty: unknownT, typeName: name2, typeNum: -1, value: value2, exprs: exprs2, cause: cause2 }
//     let result: TIMemoEntry = { typeName: name2, typeNum: -1, value: value2, exprs: exprs2, cause: cause2 }
//     return result
// }


// function dehydrateTiExpr(e: TIExpr): memo.Data {
//     let dte = dehydrateTiExpr
//     switch (e.tag) {
//         case "And":
//             return ["a", u2n(e.result), u2n(e.cause), dte(e.a), dte(e.b)]
//         case "AndImp":
//             return ["ai", u2n(e.result), u2n(e.cause), dte(e.a), dte(e.b)]
//         case "Const":
//             return ["c", e.result, u2n(e.cause)]
//         case "Not":
//             return ["n", u2n(e.result), u2n(e.cause), dte(e.a)]
//         case "Or":
//             return ["o", u2n(e.result), u2n(e.cause), dte(e.a), dte(e.b)]
//         case "OrImp":
//             return ["oi", u2n(e.result), u2n(e.cause), dte(e.a), dte(e.b)]
//         case "Ref":
//             return ["r", u2n(e.result), u2n(e.cause), e.a]
//         default:
//             throw new Error(`missing case: $ {e.tag}`)
//     }
// }

// function rehydrateTiExpr(d: memo.Data): TIExpr {
//     let rte = rehydrateTiExpr
//     d = d as [string, ...memo.Data[]]
//     switch (d[0]) {
//         case "a": {
//             let [tag, result, cause, a, b] = d
//             return { tag: "And", result: n2u(result), cause: n2u(cause), a: rte(a), b: rte(b) }
//         }
//         case "ai": {
//             let [tag, result, cause, a, b] = d
//             return { tag: "AndImp", result: n2u(result), cause: n2u(cause), a: rte(a), b: rte(b) }
//         }
//         case "c": {
//             let [tag, result, cause] = d
//             return { tag: "Const", result: n2u(result), cause: n2u(cause) }
//         }
//         case "n": {
//             let [tag, result, cause, a] = d
//             return { tag: "Not", result: n2u(result), cause: n2u(cause), a: rte(a) }
//         }
//         case "o": {
//             let [tag, result, cause, a, b] = d
//             return { tag: "Or", result: n2u(result), cause: n2u(cause), a: rte(a), b: rte(b) }
//         }
//         case "oi": {
//             let [tag, result, cause, a, b] = d
//             return { tag: "OrImp", result: n2u(result), cause: n2u(cause), a: rte(a), b: rte(b) }
//         }
//         case "r": {
//             let [tag, result, cause, a] = d
//             a = a as TIMemoKey
//             return { tag: "Ref", result: n2u(result), cause: n2u(cause), a: a }
//         }
//         default:
//             throw new Error(`missing case: ${d[0]}`)
//     }
// }

type TIRule = (tim: TIMemo, ty: Type) => TIExpr
type TIRules = (tim: TIMemo, ty: Type) => [string, TIExpr][]

let ttieConst = (ti: TypeInhabited): TIExpr => ({ tag: "Const", result: ti })
let ttieRef = (tim: TIMemo, tyA: Type): TIExpr => ({ tag: "Ref", a: timKey(tim, tyA) })
let ttieAnd = (tyA: TIExpr, tyB: TIExpr): TIExpr => ({ tag: "And", a: tyA, b: tyB })
let ttieAndImp = (tyA: TIExpr, tyB: TIExpr): TIExpr => ({ tag: "AndImp", a: tyA, b: tyB })
let ttieOr = (tyA: TIExpr, tyB: TIExpr): TIExpr => ({ tag: "Or", a: tyA, b: tyB })
let ttieOrImp = (tyA: TIExpr, tyB: TIExpr): TIExpr => ({ tag: "OrImp", a: tyA, b: tyB })
let ttieNot = (tyA: TIExpr): TIExpr => ({ tag: "Not", a: tyA })

let ttieFalse = ttieConst(ttiFalse)
let ttieTrue = ttieConst(ttiTrue)
let ttieUnknown = ttieConst(ttiUnknown)

let ttieAndRefs = (tim: TIMemo, tyA: Type, tyB: Type): TIExpr => ({ tag: "And", a: ttieRef(tim, tyA), b: ttieRef(tim, tyB) })
let ttieAndImpRefs = (tim: TIMemo, tyA: Type, tyB: Type): TIExpr => ({ tag: "AndImp", a: ttieRef(tim, tyA), b: ttieRef(tim, tyB) })
let ttieOrRefs = (tim: TIMemo, tyA: Type, tyB: Type): TIExpr => ({ tag: "Or", a: ttieRef(tim, tyA), b: ttieRef(tim, tyB) })
let ttieOrImpRefs = (tim: TIMemo, tyA: Type, tyB: Type): TIExpr => ({ tag: "OrImp", a: ttieRef(tim, tyA), b: ttieRef(tim, tyB) })


let ttieAndUnknown = (tim: TIMemo, tyA: Type, tyB: Type): TIExpr =>
    ({ tag: "And", a: { tag: "And", a: ttieRef(tim, tyA), b: ttieRef(tim, tyB) }, b: ttieConst(ttiUnknown) })

let ttieOrUnknown = (tim: TIMemo, tyA: Type, tyB: Type): TIExpr =>
    ({ tag: "Or", a: { tag: "Or", a: ttieRef(tim, tyA), b: ttieRef(tim, tyB) }, b: ttieConst(ttiUnknown) })


export function timGet(tim: TIMemo, key: TIMemoKey) {
    // return tim[key]
    return tim.get(key)
}
function timSet(tim: TIMemo, key: TIMemoKey, entry: TIMemoEntry) {
    // return tim[key] = entry
    return tim.set(key, entry)
}
function timSize(tim: TIMemo) {
    // return Object.keys(tim).length
    return tim.size
}
function timHas(tim: TIMemo, key: TIMemoKey) {
    // return tim.hasOwnProperty(key)
    return tim.has(key)
}

function newTiMap() {
    // return {}
    return new Map()
}
export let globalTIMemo: TIMemo = newTiMap()

// export function clearGlobalTIMemo() {
//     // globalTIMemo = {}
//     // globalTIMemo.clear
//     globalTIMemo = newTiMap()
// }

// export function setGlobalTIMemo(tiMemo: TIMemo) {
//     // globalTIMemo = {}
//     // globalTIMemo.clear
//     globalTIMemo = tiMemo
// }

// export function getGlobalTIMemo(): TIMemo {
//     return globalTIMemo
// }

// export function convertMapToKvList<K, V>(m: Map<K, V>): [K, V][] {
//     let l: [K, V][] = []
//     m.forEach((value, key) => {
//         l.push([key, value])
//     })
//     return l
// }

// export function convertKvListToMap<K, V>(l: [K, V][]): Map<K, V> {
//     let m: Map<K, V> = new Map()
//     l.forEach(([key, value]) => {
//         m.set(key, value)
//     });
//     return m
// }

// export function dealiasTiMemo(tim: TIMemo): TIMemo {
//     let tim2: TIMemo = new Map()
//     tim.forEach((value, key) => {
//         let value2 = value
//         tim2.set(key, value2)
//     })
//     return tim2
// }


//#endregion



//#region TI Structural

// Performs a quick structural test for inhabitation
// This is used when user written code calls Hd or Tl so as to avoid prematurely projecting from a potentially void pair.
// E.g. if we know nothing about the type A, then the type expression
//   Tl {[A, Int]}
// should remain unreduced until we know if A is inhabited or not
function tiStructural(ty: Type, assumeVarsInhabited = false): TypeInhabited {
    let result = tiStructural1(ty, assumeVarsInhabited)
    if (ttiIsFalse(result) && ty.tag !== "TVoid") {
        console.log(`CURIOUS ${showType2(ty)}`)
    }
    return result
}

function tiStructural1(ty: Type, assumeVarsInhabited = false): TypeInhabited {
    let tis = (ty: Type) => tiStructural(ty, assumeVarsInhabited)
    if (TRACK_TYPE_INHABITATION) {
        if (ty.ki) {
            return ttiTrue
        }
    }
    switch (ty.tag) {
        case "TAny":
        case "TBool":
        case "TInt":
        case "TList":
        case "TNil":
        case "TChar":
        case "TStr":
        case "TSingle":
        case "TType":
        case "TError":
            return ttiTrue
        case "TVoid":
            return ttiFalse
        case "TUnknown":
            // return assumeVarsInhabited ? tiTrue : tiUnknown
            // TODO shouldn't we just always return tiUnknown here ?
            return ttiUnknown
        case "TVar":
            return assumeVarsInhabited ? ttiTrue : ttiUnknown
        // return assumeVarsInhabited || ty.ki ? tiTrue : tiUnknown
        case "TPair":
            return ttiAnd(tis(ty.hd), tis(ty.tl))
        case "TSub":
            return ttiAndImp(tis(ty.type), tis(ty.super))
        case "TSuper":
            return ttiOrImp(tis(ty.sub), tis(ty.type))
        case "TSelf":
        case "TRec":
            return tis(ty.body)

        case "TRule": {
            switch (ty.name) {
                case "unionT":
                    return ttiOr(tis(ty.args[0]), tis(ty.args[1]))
                case "intersectT":
                    return tiStructuralIntersect(ty.args[0], ty.args[1])
                case "relcompT":
                    return tiStructuralRelComp(ty.args[0], ty.args[1])
                case "ioWorld":
                    return ttiTrue
                case "domainT":
                case "rangeT":
                    return assumeVarsInhabited ? ttiTrue : ttiUnknown
                // TODO we should be able to do better than assume.
                // TODO   e.g.
                // TODO      (Domain { A# <: {Void->Any}})
                // TODO   can be seen to be inhabited
                // TODO   since we can see both A# is inhabited, and that it is valid to ask it's domain.
                // TODO knowing either of these two things alone isn't sufficient
                default:
                    return ttiUnknown
            }
        }

        case "TFun":
            if (ALL_FUNC_TYPES_INHABITED) {
                // consider all function types inhabited, as functions are not required to be total/terminate without error
                // to do otherwise would make calculating the domain or codomain of a function even more complicated than
                // calculating the head or tail of a potentially uninhabited pair.
                // we're not trying to implement a theorem prover here, just maintain confluence.
                return ttiTrue
            }
            else {
                // since functions are not required to be total, all function types are, in a sense, inhabited.
                // however, it may be more useful to have the type-inhabitation rules for functions
                //   depend on the argument type of the function, as this makes it possible to express
                //   type-inhabitation inversion/negation in a type expression.
                // This can be useful when defining more precise types.
                let tiArg = tis(ty.argType)
                let tiResult = tis(ty.resultType)
                return ttiOr(ttiNot(tiArg), tiResult)
            }

        case "TAs":
            return tis(ty.type)

        // case "TSeqApply":
        //     return tiUnknown

        case "TTermVar":
            return ttiUnknown

        default:
            throw new Error(`missing case $ {ty.tag}`)
    }
}


let structuralRule: TIRule = (tim: TIMemo, ty: Type) => {
    let ti = tiStructural1(ty)
    return ttieConst(ti)
}

let structuralRefRule: TIRule = (tim: TIMemo, ty: Type) => {
    switch (ty.tag) {
        case "TAny":
        case "TBool":
        case "TInt":
        case "TList":
        case "TNil":
        case "TSingle":
        case "TChar":
        case "TStr":
        case "TType":
        case "TError":
            return ttieConst(ttiTrue)
        case "TVoid":
            return ttieConst(ttiFalse)
        case "TPair":
            return ttieAndRefs(tim, ty.hd, ty.tl)
        case "TSub":
            return ttieAndImpRefs(tim, ty.type, ty.super)
        case "TSuper":
            return ttieOrImpRefs(tim, ty.sub, ty.type)
        case "TVar":
            return ttieConst(ttiUnknown)
        // return tieConst(ty.ki ? tiTrue : tiUnknown)

        case "TFun":
            if (ALL_FUNC_TYPES_INHABITED) {
                // TODO ? this is undecidable in general
                // TODO ? do we want/need to report unknown/false for some/more cases
                // e.g. { A@(Void->Any) -> { (Rng A) -> (Dom A) } } is uninhabited
                // so we could report tiFalse, but will currently report tiUnknown
                // return tieRef(tim, ty.resultType)
                return ttieConst(ttiTrue)
            }
            else {
                return ttieOr(ttieNot(ttieRef(tim, ty.argType)), ttieRef(tim, ty.resultType))
            }

        case "TRule": {
            switch (ty.name) {
                case "hdT":
                case "tlT":
                    return ttieRef(tim, ty.args[0])
                default:
                    return ttieConst(ttiUnknown)
            }
        }


        default:
            return ttieConst(ttiUnknown)
    }
}

export function tiStructuralRelComp(a: Type, b: Type, assumeVarsInhabited = false): TypeInhabited {
    let tis = (ty: Type) => tiStructural(ty, assumeVarsInhabited)
    let tisRc = (a: Type, b: Type) => tiStructuralRelComp(a, b, assumeVarsInhabited)
    let tisIn = (a: Type, b: Type) => tiStructuralIntersect(a, b, assumeVarsInhabited)

    if (equalType(a, b)) {
        return ttiFalse
    }
    // TODO ? handle sub/super types ?


    if (a.tag === "TTermVar" && b.tag === "TTermVar") {
        // we don't need this yet
        throw new Error(`TODO tisRc TTermVar TTermVar`)
    }

    if (a.tag === "TTermVar" && b.tag !== "TTermVar") {
        return tisRc(a.type, b)
    }

    if (a.tag === "TError" || b.tag === "TError") {
        // TError is universally accepting and universally acceptable
        return ttiFalse
    }
    if (a.tag === "TVoid" || b.tag === "TAny") {
        return ttiFalse
    }
    if (a.tag === "TSingle" && b.tag === "TStr") {
        return ttiFalse
    }
    if (a.tag === "TSingleType" && b.tag === "TType") {
        return ttiFalse
    }
    if (a.tag === "TSingleTermVar" && b.tag === "TStr") {
        return ttiFalse
    }
    if (a.tag === "TSingle" && b.tag === "TSingle") {
        return a.val === b.val ? ttiFalse : ttiTrue
    }
    if (a.tag === "TStr" && b.tag === "TChar") {
        return ttiTrue
    }
    if (a.tag === "TChar" && b.tag === "TStr") {
        return ttiFalse
    }
    if (a.tag === "TFun" && b.tag === "TFun") {
        return ttiUnknown
    }
    if (b.tag === "TVoid") {
        return tis(a)
    }
    if (a.tag === "TVar" && b.tag === "TVar") {
        return a.name === b.name ? ttiFalse : ttiUnknown
    }
    // we can count TSingle as disjoint here, as it will be if we reach this far
    let disjointTypes = ["TInt", "TBool", "TType", "TFun", "TStr", "TChar", "TSingle", "TNil"]
    if (disjointTypes.indexOf(a.tag) !== -1 && disjointTypes.indexOf(b.tag) !== -1) {
        return a.tag === b.tag ? ttiFalse : ttiTrue
    }
    if (a.tag === "TPair" && b.tag === "TPair") {
        let tiHd = tisRc(a.hd, b.hd)
        let tiTl = tisRc(a.tl, b.tl)
        return ttiOr(tiHd, tiTl)
    }
    if (a.tag === "TList" && b.tag === "TList") {
        return tisRc(a.elem, b.elem)
    }

    if (a.tag === "TPair" && b.tag === "TList") {
        return ttiOr(tisRc(a.hd, b.elem), tisRc(a.tl, b))
    }
    if (a.tag === "TList" && b.tag === "TPair") {
        // return tiOr(tisRc(a.elem, b.hd), tisRc(a, b.tl))
        return ttiTrue
    }

    if (a.tag === "TNil" && b.tag === "TList") {
        return ttiFalse
    }
    if (a.tag === "TList" && b.tag === "TNil") {
        return tis(a.elem)
    }

    if (a.tag === "TNil" && b.tag === "TPair") {
        return ttiTrue
    }
    if (a.tag === "TPair" && b.tag === "TNil") {
        return tis(a)
    }

    let nonPair = ["TAny", "TBool", "TType", "TFun", "TStr", "TChar", "TSingle", "TNil"]
    if (nonPair.indexOf(a.tag) !== -1 && b.tag === "TPair") {
        return ttiTrue
    }

    if (a.tag === "TRule" && a.name === "unionT") {
        let ti1 = tisRc(a.args[0], b)
        let ti2 = tisRc(a.args[1], b)
        return ttiOr(ti1, ti2)
    }

    if (b.tag === "TRule" && b.name === "relcompT" && b.args[0].tag === "TAny") {
        return tisIn(a, b.args[1])
    }

    // if (a.tag==="TStr" && b.tag==="TSingle") {
    //     // TODO make this work with any finite type b
    //     // TODO ? perhaps best done with a test for finiteness ?
    //     return tiTrue
    // }

    if (a.tag === "TRule" && b.tag === "TRule" && a.name === b.name) {
        switch (a.name) {
            case "hdT":
                return tisRc(a.args[0], b.args[0])
            default:
            // fall-through
        }
    }

    if (a.tag === "TSuper") {
        let ti1 = tisRc(a.type, b)
        let ti2 = tisRc(a.sub, b)
        return ttiOrImp(ti1, ti2)
    }


    return ttiUnknown
}

function tiStructuralIntersect(a: Type, b: Type, assumeVarsInhabited = false): TypeInhabited {
    let tis = (ty: Type) => tiStructural(ty, assumeVarsInhabited)
    let tisRc = (a: Type, b: Type) => tiStructuralRelComp(a, b, assumeVarsInhabited)
    let tisIn = (a: Type, b: Type) => tiStructuralIntersect(a, b, assumeVarsInhabited)

    if (equalType(a, b)) {
        return tis(a)
    }

    if (a.tag === "TPair" && b.tag === "TPair") {
        let hd = tisIn(a.hd, b.hd)
        let tl = tisIn(a.tl, b.tl)
        return ttiAnd(hd, tl)
    }
    if (a.tag === "TNil" && b.tag === "TNil") {
        return ttiTrue
    }
    // if (a.tag === "TSingle" && b.tag === "TSingle" && a.val === b.val) {
    //     return tiTrue
    // }
    if (a.tag === "TSingle" && b.tag === "TSingle") {
        return a.val === b.val ? ttiTrue : ttiFalse
    }
    if (a.tag === "TSingle" && b.tag === "TStr") {
        return ttiTrue
    }
    if (a.tag === "TStr" && b.tag === "TSingle") {
        return ttiTrue
    }
    if (a.tag === "TStr" && b.tag === "TChar") {
        return ttiTrue
    }
    if (a.tag === "TChar" && b.tag === "TStr") {
        return ttiTrue
    }
    if (a.tag === "TAny") {
        return tis(b)
    }
    if (b.tag === "TAny") {
        return tis(a)
    }
    if (a.tag === "TList" && b.tag === "TNil") {
        return ttiTrue
    }
    if (a.tag === "TNil" && b.tag === "TList") {
        return ttiTrue
    }
    if (a.tag === "TPair" && b.tag === "TNil") {
        return ttiFalse
    }
    if (a.tag === "TNil" && b.tag === "TPair") {
        return ttiFalse
    }
    if (a.tag === "TList" && b.tag === "TPair") {
        let ti1 = tisIn(a.elem, b.hd)
        let ti2 = tisIn(a, b.tl)
        return ttiAnd(ti1, ti2)
    }
    if (a.tag === "TPair" && b.tag === "TList") {
        let ti1 = tisIn(a.hd, b.elem)
        let ti2 = tisIn(a.tl, b)
        return ttiAnd(ti1, ti2)
    }

    if (b.tag === "TRule" && b.name === "relcompT" && b.args[0].tag === "TAny") {
        return tisRc(a, b.args[1])
    }

    if (a.tag === "TRule" && a.name === "unionT") {
        let ti1 = tisIn(a.args[0], b)
        let ti2 = tisIn(a.args[1], b)
        return ttiOr(ti1, ti2)
    }

    // we can count TSingle as disjoint here, as it will be if we reach this far
    let disjointTypes = ["TInt", "TBool", "TType", "TStr", "TChar", "TSingle", "TNil"]
    if (disjointTypes.indexOf(a.tag) !== -1 && disjointTypes.indexOf(b.tag) !== -1) {
        return a.tag === b.tag ? ttiTrue : ttiFalse
    }
    if (a.tag === "TPair" && disjointTypes.indexOf(b.tag) !== -1) {
        return ttiFalse
    }
    if (disjointTypes.indexOf(a.tag) !== -1 && b.tag === "TPair") {
        return ttiFalse
    }

    if (a.tag === "TRec") {
        return tisIn(a.body, b)
    }
    if (b.tag === "TRec") {
        return tisIn(a, b.body)
    }

    // TODO add rules for remaining type constructs

    return ttiUnknown

}

//#endregion



//#region TI Rules



// { A \ B }
let relCompRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TError" || b.tag === "TError") {
            return ttieConst(ttiFalse)
        }
        if (a.tag === "TVoid" || b.tag === "TAny") {
            return ttieConst(ttiFalse)
        }
        if (equalType(a, b)) {
            return ttieConst(ttiFalse)
        }
        if (TRACK_TYPE_INHABITATION && equalType(knownInhabited(a), b)) {
            return ttieConst(ttiFalse)
        }
        if (TRACK_TYPE_INHABITATION && equalType(knownInhabited(a), knownInhabited(b))) {
            return ttieConst(ttiFalse)
        }
        if (a.tag === "TSingle" && b.tag === "TStr") {
            return ttieConst(ttiFalse)
        }
        if (a.tag === "TSingle" && b.tag === "TSingle") {
            return ttieConst(a.val === b.val ? ttiFalse : ttiTrue)
        }
        if (a.tag === "TStr" && b.tag === "TChar") {
            return ttieTrue
        }
        if (a.tag === "TChar" && b.tag === "TStr") {
            return ttieFalse
        }
        if (a.tag === "TFun" && b.tag === "TFun") {
            return ttieConst(ttiUnknown)
        }
        if (b.tag === "TVoid") {
            return ttieRef(tim, a)
        }
        if (a.tag === "TVar" && b.tag === "TVar") {
            return ttieConst(a.name === b.name ? ttiFalse : ttiUnknown)
        }
        // we can count TSingle as disjoint here, as it will be if we reach this far
        let disjointTypes = ["TInt", "TBool", "TType", "TFun", "TStr", "TChar", "TSingle", "TNil"]
        if (disjointTypes.indexOf(a.tag) !== -1 && disjointTypes.indexOf(b.tag) !== -1) {
            return ttieConst(a.tag === b.tag ? ttiFalse : ttiTrue)
        }
    }
    return ttieConst(ttiUnknown)
}


// { A \ {B \ C} }
let rcRelCompBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, bc] = ty.args
        if (bc.tag === "TRule" && bc.name === "relcompT") {
            let [b, c] = bc.args
            let ti1 = ttieRef(tim, typeRelComp(a, b))
            let ty2 = intersectTypes(a, c)
            let ti2 = ttieRef(tim, ty2)
            let ti = ttieOr(ti1, ti2)
            // console.log("RELCOMP B")
            // console.log(`  A: ${showType2(a)}`)
            // console.log(`  B: ${showType2(b)}`)
            // console.log(`  C: ${showType2(c)}`)
            // console.log(`  T: ${showType2(ty2)}`)
            return ti
            // TODO ?
            // return  tieRef(tim, typeRelComp(typeUnion0(a, c), b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A \ { Any \ B1 \ ... \ Bn } }
let rcAnyRelCompBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        let b1 = b
        if (b1.tag !== "TRule" || b1.name !== "relcompT") {
            return ttieConst(ttiUnknown)
        }
        let bs: Type[] = []
        while (b1.tag === "TRule" && b1.name === "relcompT") {
            bs.push(b1.args[1])
            b1 = b1.args[0]
        }
        if (b1.tag !== "TAny") {
            return ttieConst(ttiUnknown)
        }

        let bUn = unionTypeList(bs)
        let aIn = intersectTypes(a, bUn)

        // console.log("RELCOMP ANY B")
        // console.log(`  T: ${showType2(ty)}`)
        // console.log(`  A: ${showType2(a)}`)
        // console.log(`  B: ${showType2(b)}`)
        // console.log(`  U: ${showType2(bUn)}`)
        // console.log(`  I: ${showType2(aIn)}`)

        return ttieRef(tim, aIn)
    }
    return ttieConst(ttiUnknown)
}

// { { A \ B } \ C} }
let rcRelCompARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [ab, c] = ty.args
        if (ab.tag === "TRule" && ab.name === "relcompT") {
            let [a, b] = ab.args
            let ti1 = ttieRef(tim, typeRelComp0(a, typeUnion0(b, c)))
            return ti1
        }
    }
    return ttieConst(ttiUnknown)
}



// { A & B }
let intersectRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (equalType(a, b)) {
            return ttieRef(tim, a)
        }
        if (a.tag === "TAny") {
            return ttieRef(tim, b)
        }
        if (b.tag === "TAny") {
            return ttieRef(tim, a)
        }
        if (a.tag === "TVoid" || b.tag === "TVoid") {
            return ttieConst(ttiFalse)
        }
        if (a.tag === "TSingle" && b.tag === "TStr") {
            return ttieConst(ttiTrue)
        }
        if (a.tag === "TStr" && b.tag === "TSingle") {
            return ttieConst(ttiTrue)
        }
        if (a.tag === "TSingle" && b.tag === "TSingle") {
            return ttieConst(a.val === b.val ? ttiTrue : ttiFalse)
        }
        if (a.tag === "TStr" && b.tag === "TChar") {
            return ttieTrue
        }
        if (a.tag === "TChar" && b.tag === "TStr") {
            return ttieTrue
        }
        if (a.tag === "TFun" && b.tag === "TFun") {
            return ttieConst(ttiUnknown)
        }
        // we can count TSingle as disjoint here, as it will be if we reach this far
        let disjointTypes = ["TInt", "TBool", "TType", "TFun", "TStr", "TChar", "TSingle", "TNil"]
        if (disjointTypes.indexOf(a.tag) !== -1 && disjointTypes.indexOf(b.tag) !== -1) {
            return ttieConst(a.tag === b.tag ? ttiTrue : ttiFalse)
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A0 | A1 } \ B }
let rcUnionARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "unionT") {
            return ttieOrRefs(tim, typeRelComp0(a.args[0], b), typeRelComp0(a.args[1], b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A \ { B0 | B1 } }
let rcUnionBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TRule" && b.name === "unionT") {
            return ttieAndUnknown(tim, typeRelComp0(a, b.args[0]), typeRelComp0(a, b.args[1]))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A.single \ { B0 | B1 } }
let rc_SingleA_UnionB_Rule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TSingle" && b.tag === "TRule" && b.name === "unionT") {
            return ttieAndRefs(tim, typeRelComp0(a, b.args[0]), typeRelComp0(a, b.args[1]))
        }
    }
    return ttieUnknown
}

// // { A \ { [_,..._] | [_,..._] } }
// let rcUnionPairBRule: TIRule = (tim: TIMemo, ty: Type) => {
//     if (ty.tag === "TRule" && ty.name === "relcompT") {
//         let [a, b] = ty.args
//         if (b.tag === "TRule" && b.name === "unionT" && b.args[0].tag==="TPair" && b.args[1].tag==="TPair") {
//             return tieRef(tim, typeRelComp0(a, pairT(typeUnion0(b.args[0].hd, b.args[1].hd), typeUnion0(b.args[0].tl, b.args[1].tl))))
//         }
//     }
//     return tieConst(tiUnknown)
// }

// // { A \ { [_,..._] | [_,..._] } }
// let rcUnionB2Rule: TIRule = (tim: TIMemo, ty: Type) => {
//     if (ty.tag === "TRule" && ty.name === "relcompT") {
//         let [a, b] = ty.args
//         if (b.tag === "TRule" && b.name === "unionT") {
//             return tieRef(tim, typeRelComp0(a, unionTypes(b.args[0], b.args[1])))
//         }
//     }
//     return tieConst(tiUnknown)
// }


// { A \ { B | { C \ D }  } } -> { { A | D } \ { B \ C } }
let rcUnionRelCompBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TRule" && b.name === "unionT" && b.args[1].tag === "TRule" && b.args[1].name === "relcompT") {
            return ttieRef(tim, typeRelComp0(typeUnion0(a, b.args[1].args[1]), typeUnion0(b.args[0], b.args[1].args[0])))
        }
        if (b.tag === "TRule" && b.name === "unionT" && b.args[0].tag === "TRule" && b.args[0].name === "relcompT") {
            return ttieRef(tim, typeRelComp0(typeUnion0(a, b.args[0].args[1]), typeUnion0(b.args[1], b.args[0].args[0])))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A0 | A1 } & B }
let inUnionARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "unionT") {
            return ttieOrRefs(tim, typeIntersect0(a.args[0], b), typeIntersect0(a.args[1], b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A & { B0 | B1 } }
let inUnionBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (b.tag === "TRule" && b.name === "unionT") {
            return ttieOrRefs(tim, typeIntersect0(a, b.args[0]), typeIntersect0(a, b.args[1]))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A0 & A1 } \ B }
let rcIntersectARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "intersectT") {
            // return tieAndRefs(tim, typeRelComp0(a.args[0], b), typeRelComp0(a.args[1], b))
            return ttieAndUnknown(tim, typeRelComp0(a.args[0], b), typeRelComp0(a.args[1], b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A \ { B0 & B1 } }
let rcIntersectBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TRule" && b.name === "intersectT") {
            // return tieOrUnknown(tim, typeRelComp0(a, b.args[0]), typeRelComp0(a, b.args[1]))
            let t1 = ttieRef(tim, typeRelComp0(a, b.args[0]))
            let t2 = ttieRef(tim, typeRelComp0(a, b.args[1]))
            return ttieOr(t1, t2)
            // return tieOr(tieUnknown, tieOr(t1, t2))
            // return tieOrRefs(tim, typeRelComp0(a, b.args[0]), typeRelComp0(a, b.args[1]))
        }
    }
    return ttieConst(ttiUnknown)
}


// { (Codomain { A0 & A1 }) \ B }
let rcCodomainIntersectARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "rangeT" && a.args[0].tag === "TRule" && a.args[0].name === "intersectT") {
            return ttieAndRefs(tim, typeRelComp0(typeRng(a.args[0].args[1]), b), typeRelComp0(typeRng(a.args[0].args[1]), b))
        }
    }
    return ttieConst(ttiUnknown)
}



// { A \ [B0, ...B1] }
let rcPairBRule: TIRule = (tim: TIMemo, ty: Type) => {
    // if (ty.tag === "TRule" && ty.name === "relcompT") {
    //     let [a, b] = ty.args
    //     if (b.tag === "TPair") {
    //         let tiA = tieRef(tim, a)
    //         let tiRc = tieOrRefs(tim, typeRelComp0(typeHd(a, true), b.hd), typeRelComp0(typeTl(a, true), b.tl))
    //         return tieAnd(tiA, tiRc)
    //         // return tiRc
    //     }
    // }
    return ttieConst(ttiUnknown)
}

// { [A0, ...A1] \ [B0, ...B1] }
let rcPairPairRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TPair" && b.tag === "TPair") {
            return ttieOrRefs(tim, typeRelComp0(a.hd, b.hd), typeRelComp0(a.tl, b.tl))
        }
    }
    return ttieConst(ttiUnknown)
}

// { [A0, ...A1] \ (List (Elem B)) }
let rcPairListRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TPair" && b.tag === "TList") {
            return ttieOrRefs(tim, typeRelComp0(a.hd, b.elem), typeRelComp0(a.tl, b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { (List (Elem A)) \ [B0, ...B1] }
let rcListPairRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TList" && b.tag === "TPair") {
            return ttieConst(ttiTrue)
            // return tieOrRefs(tim, typeRelComp0(a.elem, b.hd), typeRelComp0(a, b.tl))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A \ (List B.elem) }
let rcListBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TList") {
            return ttieRef(tim, typeRelComp0(typeElem(a), b.elem))
        }
    }
    return ttieConst(ttiUnknown)
}

// { (List A.elem) \ (List B.elem) }
let rcListListRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TList" && b.tag === "TList") {
            return ttieRef(tim, typeRelComp0(a.elem, b.elem))
        }
    }
    return ttieConst(ttiUnknown)
}

// { (List A.elem) \ (Rec B.body) }
let rcListRecRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TList" && b.tag === "TRec") {
            let aFV = typeFreeVars(a)
            let name = uniqName(b.name, aFV)
            let a2 = recT(name, ruleT("unionT", [nilT, pairT(a.elem, varT(name))]))
            return ttieRef(tim, typeRelComp0(a2, b))
        }
    }
    return ttieConst(ttiUnknown)
}

// ultimately we want list types and recursive types to be the same thing
// possibly with an indirection node indicating/recording how a particular recursive type was defined
// (mostly for diagnostic purposes)
// this rule is correct, and an attempt to make list types and recursive types more interchangable,
// but its not needed for now.
// // { (Rec A.body) \ (List B.elem) }
// let rcRecListRule: TIRule = (tim: TIMemo, ty: Type) => {
//     if (ty.tag === "TRule" && ty.name === "relcompT") {
//         let [a, b] = ty.args
//         if (a.tag === "TRec" && b.tag === "TList") {
//             let bFV = typeFreeVars(b)
//             let name = uniqName(a.name, bFV)
//             let b2 = recT(name, ruleT("unionT", [nilT, pairT(b.elem, varT(name))]))
//             return tieRef(tim, typeRelComp0(a, b2))
//         }
//     }
//     return tieConst(tiUnknown)
// }

// { [] \ (List (Elem B)) }
let rcNilListRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TNil" && b.tag === "TList") {
            return ttieConst(ttiFalse)
        }
    }
    return ttieConst(ttiUnknown)
}


// this seems like a very specific rule.
// if the Elem function can be implemented in user-space, 
// by adding a simple form of type-matching unification to the language,
// (just enough to implement Elem and similar functions)
// then hopefully rules like this won't be needed.
// or indeed any rules specific to List either.

// { (Elem (Tail A)) \ (Elem B) }
let rcElemTailElemRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "elemT" && a.args[0].tag === "TRule" && a.args[0].name === "tlT" && b.tag === "TRule" && b.name === "elemT") {
            return ttieAnd(ttieRef(tim, typeRelComp0(a.args[0].args[0], b.args[0])), ttieUnknown)
        }
    }
    return ttieConst(ttiUnknown)
}

// { (Head A) \ (Elem B) }
let rcHeadElemRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "hdT" && b.tag === "TRule" && b.name === "elemT") {
            return ttieAnd(ttieRef(tim, typeRelComp0(a.args[0], b.args[0])), ttieUnknown)
        }
    }
    return ttieConst(ttiUnknown)
}


// rcHeadPairARule
// this rules takes the head of a pair when it would otherwise be unsafe.
// it is safe here, as it is on the LHS of a relative complement.
// even if the tail of the pair makes the whole pair uninhabited
// the result given by this rule based on tentatively assuming the pair was inhabited will still stand.
// this rule will only return tiFalse or tiUnknown, 
// it will never claim for certain that the type is definitely inhabited.

// TODO ? improve the rcHeadPairARule so that it can check for the (Head [....]) patterns at the tip of the application spine
// i.e. { { Head [a0H,...a0T] a1 a2 } \ B }
// this would enable the matchMaybe function to work better, for now the match function is working better than matchMaybe so perhaps we don't need this.
// match works better than matchMaybe in some situations because match takes the Elem of a list where as matchMaybe uses Head and Tail.
// Head and Tail can get blocked where Elem doesn't because they check for type inhabitation first.
// If we tracked which variables we can assume are inhabited (because we're in the body of a function which takes them),
// then this particular need to reduce Head on the LHS of a relative complement probably wouldn't arise.

// // { (Hd [_, ..._]) \ B }
// let rcHeadPairARule: TIRule = (tim: TIMemo, ty: Type) => {
//     if (ty.tag === "TRule" && ty.name === "relcompT") {
//         let [a, b] = ty.args
//         if (a.tag === "TRule" && a.name === "hdT" && a.args[0].tag==="TPair") {
//             return tieAnd(tieRef(tim, typeRelComp0(a.args[0].hd, b)), tieUnknown)
//         }
//     }
//     return tieConst(tiUnknown)
// }

// // { (Tl [_, ..._]) \ B }
// let rcTailPairARule: TIRule = (tim: TIMemo, ty: Type) => {
//     if (ty.tag === "TRule" && ty.name === "relcompT") {
//         let [a, b] = ty.args
//         if (a.tag === "TRule" && a.name === "tlT" && a.args[0].tag==="TPair") {
//             return tieAnd(tieRef(tim, typeRelComp0(a.args[0].tl, b)), tieUnknown)
//         }
//     }
//     return tieConst(tiUnknown)
// }


// { { A.type <: List _ } \ (List (Elem B)) }
let rcSubListRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TSub" && a.super.tag === "TList" && b.tag === "TList") {
            // return tieRef(tim, typeRelComp0(typeElem(a.type), b.elem))
            return ttieRef(tim, typeRelComp0(subT(typeElem(a.type), a.super.elem), b.elem))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A <: [_, ..._] } \ B@[_, ..._] }
let rcSubPairRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TSub" && a.super.tag === "TPair" && b.tag === "TPair") {
            let h = ttieRef(tim, typeRelComp0(subT(typeHd(a.type), a.super.hd), b.hd))
            let t = ttieRef(tim, typeRelComp0(subT(typeTl(a.type), a.super.tl), b.tl))
            return ttieOr(h, t)
        }
    }
    return ttieConst(ttiUnknown)
}

// { [A.hd, ...A.tl] & [B.hd, ...B.tl] }
let inPairPairRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (a.tag === "TPair" && b.tag === "TPair") {
            return ttieAndRefs(tim, typeIntersect0(a.hd, b.hd), typeIntersect0(a.tl, b.tl))
        }
    }
    return ttieConst(ttiUnknown)
}



// { { A.type <: A.super } \ B }
let rcSubARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TSub") {
            return ttieAndImpRefs(tim, typeRelComp0(a.type, b), typeRelComp0(a.super, b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A.type <: (Self { A -> A.super } } \ B }
let rcSubSelfARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TSub" && a.super.tag === "TSelf") {
            let a2 = substType(a.super.body, a.super.name, a.type, false)
            return ttieRef(tim, typeRelComp0(a2, b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A \ { B.type <: B.super } }
let rcSubBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TSub") {
            return ttieOrImpRefs(tim, typeRelComp0(a, b.super), typeRelComp0(a, b.type))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A.type :> A.sub } \ B }
let rcSuperARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TSuper") {
            // not TI{A.type \ B} implies not TI{A.sub \ B}
            // so TI{A.sub \ B} implies TI{A.type \ B}
            return ttieOrImpRefs(tim, typeRelComp0(a.sub, b), typeRelComp0(a.type, b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A \ { B.type :> B.sub } }
let rcSuperBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TSuper") {
            return ttieAndImpRefs(tim, typeRelComp0(a, b.type), typeRelComp0(a, b.sub))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { a.type <: a.super } & b }
let inSubARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (a.tag === "TSub") {
            return ttieAndImpRefs(tim, typeIntersect0(a.type, b), typeIntersect0(a.super, b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { a & { b.type <: b.super } }
let inSubBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (b.tag === "TSub") {
            return ttieAndImpRefs(tim, typeIntersect0(a, b.type), typeIntersect0(a, b.super))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { a.type :> a.sub } & b }
let inSuperARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (a.tag === "TSuper") {
            return ttieOrImpRefs(tim, typeIntersect0(a.sub, b), typeIntersect0(a.type, b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { a & { b.type :> b.sub } }
let inSuperBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (b.tag === "TSuper") {
            return ttieOrImpRefs(tim, typeIntersect0(a, b.sub), typeIntersect0(a, b.type))
        }
    }
    return ttieConst(ttiUnknown)
}


// { { A @-> A.body } \ B }
let rcRecARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRec") {
            return ttieRef(tim, typeRelComp0(unrollRecursiveType(a), b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A \ { B @-> B.body } }
let rcRecBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TRec") {
            return ttieRef(tim, typeRelComp0(a, unrollRecursiveType(b)))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A @-> A.body } \ { B @-> B.body } }
let rcRecRecRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRec" && b.tag === "TRec") {
            let fvA = typeFreeVars(a)
            let fvB = typeFreeVars(b)
            let v = uniqName(a.name, [...fvA, ...fvB])
            let a2 = substType(a.body, a.name, varT(v), false)
            let b2 = substType(b.body, b.name, varT(v), false)
            return ttieRef(tim, typeRelComp0(a2, b2))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A @-> A.body } & B }
let inRecARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (a.tag === "TRec") {
            return ttieRef(tim, typeIntersect0(unrollRecursiveType(a), b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A & { B @-> B.body } }
let inRecBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (b.tag === "TRec") {
            return ttieRef(tim, typeIntersect0(a, unrollRecursiveType(b)))
        }
    }
    return ttieConst(ttiUnknown)
}

// TODO ?
// // { { A @-> A.body } & { B @-> B.body } }
// let inRecRecRule: TIRule = (tim: TIMemo, ty: Type) => {
//     if (ty.tag === "TRule" && ty.name === "intersectT") {
//         let [a, b] = ty.args
//         if (b.tag === "TRec") {
//             return tieRef(tim, typeIntersect0(a, unrollRecursiveType(b)))
//         }
//     }
//     return tieConst(tiUnknown)
// }



// { { A.dom -> A.rng } \ { B.dom -> B.rng } }
let rcFuncRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TFun" && b.tag === "TFun") {
            let tDom: Type = notKnownInhabited({ tag: "TRule", name: "relcompT", args: [b.argType, a.argType] })
            let app = applyTypes(a, convertPatTypeOpen(b.argType))
            // let env = matchTypes(a.argType, convertPatTypeOpen(b.argType))
            // let app = substTypeEnv(a.resultType, env, true)
            let tRng: Type = notKnownInhabited({ tag: "TRule", name: "relcompT", args: [app, b.resultType] })
            return ttieOrRefs(tim, tDom, tRng)
        }
    }
    return ttieConst(ttiUnknown)
}


// TODO don't just assume A is a function, this rule currently gives the wrong result if A is Any
// { A \ { B.dom -> B.rng } }
let rcFuncBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TFun") {
            // if (a.tag === "TFun" && b.tag === "TFun") {
            let aFun = typeRelComp0(a, funT(voidT, anyT))
            let tDom: Type = notKnownInhabited({ tag: "TRule", name: "relcompT", args: [b.argType, typeDom(a)] })
            let app = applyTypes(a, convertPatTypeOpen(b.argType), false)
            let tRng: Type = notKnownInhabited({ tag: "TRule", name: "relcompT", args: [app, b.resultType] })
            // return tieOr(tieRef(tim, aFun), tieOrRefs(tim, tDom, tRng))
            return ttieOrRefs(tim, tDom, tRng)
        }
    }
    return ttieConst(ttiUnknown)
}

// { A \ { { B1.dom -> B1.rng } & { B2.dom -> B2.rng }} }
let rcFuncIntersectBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TRule" && b.name === "intersectT") {
            // TODO probably need to be sure that B1.dom and B2.dom are disjoint for this to be valid
            let t1 = typeRelComp0(a, b.args[0])
            let t2 = typeRelComp0(a, b.args[1])
            return ttieOrRefs(tim, t1, t2)
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A.dom -> A.rng } & { B.dom -> B.rng } }
let inFuncRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        let [a, b] = ty.args
        if (a.tag === "TFun" && b.tag === "TFun") {
            let appA = applyTypes(a, convertPatTypeOpen(b.argType))
            let appB = applyTypes(b, convertPatTypeOpen(a.argType))

            let tRngA: Type = notKnownInhabited({ tag: "TRule", name: "relcompT", args: [appA, b.resultType] })
            let tRngB: Type = notKnownInhabited({ tag: "TRule", name: "relcompT", args: [appB, a.resultType] })

            return ttieOrRefs(tim, tRngA, tRngB)
        }
    }
    return ttieConst(ttiUnknown)
}


// { { A.dom -> A.rng } \ { B.type :> B.sub } }
let funcSuperRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        // TODO should probably check that B.sub is a function type
        if (a.tag === "TFun" && b.tag === "TSuper") {
            // This check is needed to when type-checking CPS-style code
            // Is there a sensible bound to the number of permutations
            // of type-level constructs that might need to be checked for?
            // TODO handle polymorphic case, not critical for now
            let d = typeRelComp0(typeDom(b), typeDom(a))
            let r = typeRelComp0(typeRng(a), typeRng(b))
            return ttieOrRefs(tim, d, r)
        }
    }
    return ttieConst(ttiUnknown)
}

// { [A.hd, ...A.tl] } \ { B.type :> [B.sub.hd, ...B.sub.tl] } }
let pairSuperRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TPair" && b.tag === "TSuper" && b.sub.tag === "TPair") {
            // let h = typeRelComp0(a.hd, typeHd(b))
            // let t = typeRelComp0(a.tl, typeTl(b))
            // TODO we shouldn't just assume the B type is inhabted
            let h = typeRelComp0(a.hd, typeHd(b, true))
            let t = typeRelComp0(a.tl, typeTl(b, true))
            return ttieOrRefs(tim, h, t)
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A.func A.arg } \ B }
let rcApplyARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "applyT") {
            // return tieOne(tim, typeRelComp0(ruleT("rangeT", [a.args[0]]), b))
            return ttieRef(tim, typeRelComp0(applyTypes(a.args[0], a.args[1]), b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A.func A.arg } \ B }
let rcApplyA2Rule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "applyT") {
            return ttieRef(tim, typeRelComp0(ruleT("rangeT", [a.args[0]]), b))
            // return tieOne(tim, typeRelComp0(applyTypes(a.args[0], a.args[1]), b))
        }
    }
    return ttieConst(ttiUnknown)
}

// // { { A.func A.arg } \ { B.func B.arg } }
// let rcApplyApplyRule: TIRule = (tim: TIMemo, ty: Type) => {
//     if (ty.tag === "TRule" && ty.name === "relcompT") {
//         let [a, b] = ty.args
//         // TODO better type-equality checking on arguments, check { { A.arg \ B.arg } | { B.arg \ A.arg } }
//         // TODO covariant and contravariant versions, 
//         if (a.tag === "TRule" && a.name === "applyT" && b.tag === "TRule" && b.name === "applyT" && equalType(a.args[1], b.args[1])) {
//             return tieRef(tim, typeRelComp0(a.args[0], b.args[0]))
//         }
//     }
//     return tieConst(tiUnknown)
// }

// // { { A.func A.arg } \ { B.func B.arg } }
// let rcApplyApplyRule: TIRule = (tim: TIMemo, ty: Type) => {
//     if (ty.tag === "TRule" && ty.name === "relcompT") {
//         let [a, b] = ty.args
//         if (a.tag === "TRule" && a.name === "applyT" && b.tag === "TRule" && b.name === "applyT") { 
//             let t2 = tieRef(tim, typeRelComp0(a.args[0], b.args[0]))
//             let t3 = tieOr(t2, tieRef(tim, typeRelComp0(a.args[1], b.args[1])))
//             let t4 = tieOr(t3, tieRef(tim, typeRelComp0(b.args[1], a.args[1])))
//             let t5 = tieAnd(t4, tieConst(tiUnknown))
//             return t5
//         }
//     }
//     return tieConst(tiUnknown)
// }


// Type-appication is effectively always covariant, and never contravariant.
// Type-application applies all possible term-values within a type.
// Using a subset of those values could never produce a value that wasn't already in the originally produced larger set. 
// So even if some/all of the function term-values in the type are contravariant,
//   type-application behaves in a covariant way.

// { { A.func A.arg } \ { B.func B.arg } }
let rcApplyApplyRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "applyT" && b.tag === "TRule" && b.name === "applyT") {
            let funcTie = ttieRef(tim, typeRelComp0(a.args[0], b.args[0]))
            let argTie = ttieRef(tim, typeRelComp0(a.args[1], b.args[1]))
            let applyTie = ttieAnd(ttieOr(funcTie, argTie), ttieUnknown)
            return applyTie
        }
    }
    return ttieUnknown
}

// { A \ { B.func.1 & B.func.2 } B.arg } ->
// { A \ { (Hd (Tl {[B.func.1.dom & B.arg, B.func.1.cod]})) }))  | (Hd (Tl {[B.func.2.dom & B.arg, B.func.2.cod]})) })) } }
let rcApplyIntersectyRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TRule" && b.name === "applyT" && b.args[0].tag === "TRule" && b.args[0].name === "intersectT"
            && b.args[0].args[0].tag === "TFun" && b.args[0].args[1].tag === "TFun") {

            let fun1 = b.args[0].args[0]
            let dom1 = fun1.argType
            let cod1 = fun1.resultType
            let fun2 = b.args[0].args[1]
            let dom2 = fun2.argType
            let cod2 = fun2.resultType
            let arg = b.args[1]

            // let ti1 = tlT(pairT(intersectT(dom1, arg), cod1))
            // let ti2 = tlT(pairT(intersectT(dom2, arg), cod2))

            // NOTE The ti1/ti2 types above are more minimal and natural
            // NOTE    they are defined the way below so as to match what is needed in the fe4d/dispatch1 test
            // TODO Make the type-check less sensitive to the particular form
            // TODO In practice, we might not need this rule at all, 
            // TODO   depending on how well other approaches work-out
            let ti1 = hdT(tlT(pairT(intersectT(dom1, arg), pairT(cod1, nilT))))
            let ti2 = hdT(tlT(pairT(intersectT(dom2, arg), pairT(cod2, nilT))))

            let rc = relcompT(a, unionT(ti1, ti2))

            return ttieRef(tim, rc)
        }
    }
    return ttieUnknown
}

let rcRuleRuleRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && b.tag === "TRule" && a.name === b.name && a.args.length === b.args.length) {
            switch (a.args.length) {
                case 0:
                    if (a.name === "ioWorld") {
                        return ttieConst(ttiFalse)
                    }
                    break
                case 1:
                    if (["hdT", "tlT", "elemT", "rangeT"].indexOf(a.name) !== -1) {
                        // covariant
                        return ttieRef(tim, typeRelComp0(a.args[0], b.args[0]))
                    }
                    if (["domainT"].indexOf(a.name) !== -1) {
                        // contravariant
                        return ttieRef(tim, typeRelComp0(b.args[0], a.args[0]))
                    }
                    break
                default:
                    return ttieConst(ttiUnknown)

            }

        }
    }
    return ttieConst(ttiUnknown)

}

// { { A @ A.type } \ B }
let rcAliasARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TAs") {
            return ttieRef(tim, typeRelComp0(convertPatTypeClosed(a), b))
        }
    }
    return ttieConst(ttiUnknown)
}

// { A \ { B @ B.type } }
let rcAliasBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TAs") {
            // TODO ? make alias-types and self-types orthogonal and remove the conversion ?
            return ttieRef(tim, typeRelComp0(a, convertPatTypeClosed(b)))
        }
    }
    return ttieConst(ttiUnknown)
}

// TODO (re)unify self-ref types with recursive types
// { { A.. @-> A.type } \ B }
let rcSelfARule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TSelf") {
            // let a1 = substType(a.body, a.name, unknownT, true)
            let a1 = substType(a.body, a.name, anyT, true)
            return ttieRef(tim, typeRelComp0(a1, b))
        }
    }
    return ttieConst(ttiUnknown)
}

// TODO (re)unify self-ref types with recursive types
// { A \ { B.. @-> B.type } }
let rcSelfBRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TSelf") {
            // console.log("rcSelfBRule a  : ", showType2(a))
            // console.log("rcSelfBRule b  : ", showType2(b))
            let b2 = substType(b.body, b.name, subT(a, b), true)
            // console.log("rcSelfBRule b2 : ", showType2(b2))
            return ttieRef(tim, typeRelComp0(a, b2))

            // The subT above is dangerous, it can create TI contradictions.
            // In practice this only seems to occur when there are other errors in the program anyway.
            // Perhaps we need to allow TI contradictions to propagate and not abort as soon as they are encountered.
            // The TI contradiction detector is currently the best defense against buggy TI-rules.
            // If contradictions are allowed to propagate, 
            //   it becomes harder to determine if a bug is caused by the source-code being type-checked or a TI-rule.
            // Perhaps it makes sense to mark where/when TI contradiction might be expected,
            //   that is, any types which are directly or indirectly influenced by the 
            //   construction of the subT above.

        }
    }
    return ttieConst(ttiUnknown)
}

// { [A_hd ,, A_tl] \ (Self (B_tyVar -> B_type) } }
let rcPairSelfRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TPair" && a.hd.tag === "TSingleType" && b.tag === "TSelf") {
            // let hdTi = typeRelComp0(a.hd, typeHd(b))
            let hdVal = a.hd.val
            let b2 = substType(b.body, b.name, pairT(hdVal, anyT), true)
            return ttieRef(tim, typeRelComp0(a, b2))
        }
    }
    return ttieConst(ttiUnknown)
}

// { { A.. @-> A.type } \ { B.. @-> B.type } }
let rcSelfSelfRule: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TSelf" && b.tag === "TSelf") {
            let fvA = typeFreeVars(a)
            let fvB = typeFreeVars(b)
            let v = uniqName(a.name, [...fvA, ...fvB])
            let a2 = substType(a.body, a.name, varT(v), true)
            let b2 = substType(b.body, b.name, varT(v), true)
            return ttieRef(tim, typeRelComp0(a2, b2))
        }
    }
    return ttieConst(ttiUnknown)
}


// // { A \ B } =>  Unknown && { Any \ B }
// let rcNegate: TIRule = (tim: TIMemo, ty: Type) => {
//     if (ty.tag === "TRule" && ty.name === "relcompT") {
//         let [a, b] = ty.args
//         let ti1 = tieRef(tim, typeRelComp(anyT, b))
//         // let ti2 = tieAnd(tieUnknown, tieNot(ti1))
//         let ti2 = tieAnd(tieUnknown, ti1)
//         return ti2
//     }
//     return tieUnknown
// }

// if B is uninhabited, then (Dom B) is Any and the whole relcomp is uninhabited
// { A \ (Dom B) }
let rcDomainB: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (b.tag === "TRule" && b.name === "domainT") {
            let ti1 = ttieAnd(ttieUnknown, ttieRef(tim, b.args[0]))
            return ti1
        }
    }
    return ttieUnknown
}

// { (Hd A) \ B }
let rcHeadA: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "hdT") {
            let ti1 = ttieAnd(ttieUnknown, ttieRef(tim, a.args[0]))
            return ti1
        }
    }
    return ttieUnknown
}

// { (Hd A) \ B } --> { A \ (B::Any) }
let rcHeadA2: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name === "hdT") {
            let ti1 = ttieRef(tim, relcompT(a.args[0], pairT(b, anyT)))
            return ti1
        }
    }
    return ttieUnknown
}

// { {A:Type} \ Type }
let rcTermType: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TTerm" && b.tag === "TType") {
            return ttieFalse
        }
        if (a.tag === "TTermVar" && b.tag === "TType") {
            return ttieFalse
        }
    }
    return ttieUnknown
}

// { {(Inverse A) _} \ (Domain B) } --> { B \ A }
let rcApplyInverseDomain: TIRule = (tim: TIMemo, ty: Type) => {
    if (ty.tag === "TRule" && ty.name === "relcompT") {
        let [a, b] = ty.args
        if (a.tag === "TRule" && a.name == "applyT" && a.args[0].tag === "TRule" && a.args[0].name === "inverseT"
            && b.tag === "TRule" && b.name === "domainT") {
            let a1 = a.args[0].args[0]
            let b1 = b.args[0]
            let result = ttieRef(tim, relcompT(b1, a1)) // contravariant relationship
            // should probably && the result with unknown
            // we can't assume the application of (Inverse A) is inhabited
            result = ttieAnd(ttieUnknown, result)
            return result
        }
    }
    return ttieUnknown
}


// TODO ? { A \ (Tl B) } // require B to be inhabited ?
// TODO ? { A \ (Dom B) } // require B to be inhabited ?
// TODO ? { A \ (Cod B) } // require B to be inhabited ?
// TODO ? { (Dom A) \ B } // require A to be inhabited ?
// TODO ? { (Cod A) \ B } // require A to be inhabited ?


let tiRules1: TIRules = (tim: TIMemo, ty: Type): [string, TIExpr][] => [
    ["StructuralRef", structuralRefRule(tim, ty)],
    ["Structural", structuralRule(tim, ty)],
    ["RelComp", relCompRule(tim, ty)],
    ["rcRelCompA", rcRelCompARule(tim, ty)],
    ["rcRelCompB", rcRelCompBRule(tim, ty)],
    ["rcAnyRelCompB", rcAnyRelCompBRule(tim, ty)],
    ["rcRuleRule", rcRuleRuleRule(tim, ty)],
    ["rcFunc", rcFuncRule(tim, ty)],
    ["rcFuncB", rcFuncBRule(tim, ty)],
    ["rcFuncIntersectB", rcFuncIntersectBRule(tim, ty)],
    ["rcFuncSuper", funcSuperRule(tim, ty)],
    ["rcPairSuper", pairSuperRule(tim, ty)],
    ["rcApplyARule", rcApplyARule(tim, ty)],
    ["rcApplyA2Rule", rcApplyA2Rule(tim, ty)],
    ["rcApplyApplyRule", rcApplyApplyRule(tim, ty)],
    ["rcApplyIntersectyRule", rcApplyIntersectyRule(tim, ty)],
    ["rcUnionA", rcUnionARule(tim, ty)],
    ["rcUnionB", rcUnionBRule(tim, ty)],
    ["rcSingleAUnionB", rc_SingleA_UnionB_Rule(tim, ty)],
    // ["rcUnionPairB", rcUnionB2Rule(tim, ty)],
    // ["rcUnionRelCompB", rcUnionRelCompBRule(tim, ty)],
    ["rcIntersectA", rcIntersectARule(tim, ty)],
    ["rcIntersectB", rcIntersectBRule(tim, ty)],
    // ["rcIntersectIntersect", rcIntersectIntersectRule(tim, ty)],
    ["rcCodomainIntersectA", rcCodomainIntersectARule(tim, ty)],
    // ["PairB", rcPairBRule(tim, ty)],
    ["rcPairPair", rcPairPairRule(tim, ty)],
    ["rcPairList", rcPairListRule(tim, ty)],
    // ["rcListPair", rcListPairRule(tim, ty)],
    ["rcListList", rcListListRule(tim, ty)],
    ["rcListRec", rcListRecRule(tim, ty)],
    // ["rcRecList", rcRecListRule(tim, ty)],
    ["rcNilList", rcNilListRule(tim, ty)],
    ["rcElemTailElem", rcElemTailElemRule(tim, ty)],
    ["rcHeadElem", rcHeadElemRule(tim, ty)],

    // ["rcHeadPairA", rcHeadPairARule(tim, ty)],
    // ["rcTailPairA", rcTailPairARule(tim, ty)],

    ["rcSubList", rcSubListRule(tim, ty)],
    ["rcSubPair", rcSubPairRule(tim, ty)],
    ["rcSubA", rcSubARule(tim, ty)],
    ["rcSubSelfA", rcSubSelfARule(tim, ty)],
    ["rcSubB", rcSubBRule(tim, ty)],
    ["rcSuperA", rcSuperARule(tim, ty)],
    ["rcSuperB", rcSuperBRule(tim, ty)],

    ["rcRecA", rcRecARule(tim, ty)],
    ["rcRecB", rcRecBRule(tim, ty)],
    ["rcRecRec", rcRecRecRule(tim, ty)],

    ["rcAliasA", rcAliasARule(tim, ty)],
    ["rcAliasB", rcAliasBRule(tim, ty)],

    ["rcSelfA", rcSelfARule(tim, ty)],
    ["rcSelfB", rcSelfBRule(tim, ty)],
    ["rcPairSelf", rcPairSelfRule(tim, ty)],
    ["rcSelfSelf", rcSelfSelfRule(tim, ty)],

    // rules concerned with Void/Any types,
    // used to get to types such as { A | (Hd [Any, B]) }
    // which occur when checking an argument lies within a function's domain
    // the result is either { A | Void } or { A | Any }
    // or more simply A or Any
    // depending on the inhabitation of B
    ["rcDomainB", rcDomainB(tim, ty)],
    ["rcHeadA", rcHeadA(tim, ty)],


    ["rcHeadA2", rcHeadA2(tim, ty)],

    ["rcTermType", rcTermType(tim, ty)],

    ["rcApplyInverseDomain", rcApplyInverseDomain(tim, ty)],


    // This rule seems to be finding contradictions in other rules
    // TODO remove contradictions
    // ["rcNegate", rcNegate(tim, ty)],

    // ["Intersect", intersectRule(tim, ty)],
    // ["inFunc", inFuncRule(tim, ty)],
    // ["inSubA", inSubARule(tim, ty)],
    // ["inSubB", inSubBRule(tim, ty)],
    // ["inSuperA", inSuperARule(tim, ty)],
    // ["inSuperB", inSuperBRule(tim, ty)],
    // ["inRecA", inRecARule(tim, ty)],
    // ["inRecB", inRecBRule(tim, ty)],
    // ["inUnionA", inUnionARule(tim, ty)],
    // ["inUnionB", inUnionBRule(tim, ty)],
    // ["inPairPair", inPairPairRule(tim, ty)],
]

// TODO ? add approximate widening/narrowing rules
// TODO ? go looking for things to approximate on either side of a relative complement ?
// TODO ? nope, we are already doing that in effect with the current rules.

// TODO ? go looking for things which become reducible with more type-inhabitation knowledge ?

// TODO ? compare types with Any/Void so as to simplify analysis checking solely for inhabitation
//   this would help with examples such as:
//       { Int \ { Int & (Domain (Hd { [Any, ...{ { Int -> Int } \ {F @ (Self {F -> { Void -> (Domain #F) }})} }] })) } }
//   which occur if we checking the domains during function type application

let tiRules2: TIRules = (tim: TIMemo, ty: Type): [string, TIExpr][] => {
    let rules = tiRules1(tim, ty)
    let rules2 = rules.filter(([name, tie]) => tie.tag !== "Const" || !t(tie.result))
    return rules2
}

let tiRules = tiRules2


//#endregion



//#region TI Algorithm


function tiEvalExpr(tim: TIMemo, tie: TIExpr): [TypeInhabited | null, TICause] {
    // TODO ? assign the result to tie.result ?
    let tiEval = tiEvalExpr
    switch (tie.tag) {
        case "Const": {
            return [tie.result, []]
        }
        case "Ref": {
            // return [tim[tie.a].value, [tie.a]]
            return [timGet(tim, tie.a)!.value, [tie.a]]
        }
        case "And": {
            let [a1, aCause] = tiEval(tim, tie.a)
            let [b1, bCause] = tiEval(tim, tie.b)
            let a = a1 === null ? ttiUnknown : a1
            let b = b1 === null ? ttiUnknown : b1
            if (ttiIsFalse(a) || ttiIsFalse(b)) {
                return [ttiFalse, ttiIsFalse(a) ? aCause : bCause]
            }
            else if (ttiIsTrue(a) && ttiIsTrue(b)) {
                return [ttiTrue, [aCause, bCause]]
            }
            else if (a1 === null || b1 === null) {
                return [null, []]
            }
            else {
                return [ttiUnknown, [aCause, bCause]]
            }
        }
        case "AndImp": {
            let [a1, aCause] = tiEval(tim, tie.a)
            let [b1, bCause] = tiEval(tim, tie.b)
            let a = a1 === null ? ttiUnknown : a1
            let b = b1 === null ? ttiUnknown : b1
            if (ttiIsTrue(a) && ttiIsFalse(b)) {
                return [ttiContradiction, [aCause, bCause]]
            }
            else if (ttiIsTrue(a)) {
                return [ttiTrue, aCause]
            }
            if (ttiIsFalse(b)) {
                return [ttiFalse, bCause]
            }
            else if (ttiIsFalse(a)) {
                return [ttiFalse, aCause]
            }
            else if (a1 === null || b1 === null) {
                return [null, []]
            }
            else {
                return [ttiUnknown, [aCause, bCause]]
            }
        }
        case "Or": {
            let [a1, aCause] = tiEval(tim, tie.a)
            let [b1, bCause] = tiEval(tim, tie.b)
            let a = a1 === null ? ttiUnknown : a1
            let b = b1 === null ? ttiUnknown : b1
            if (ttiIsTrue(a) || ttiIsTrue(b)) {
                // let refs = tiIsTrue(a) ? [tie.a] : [tie.b]
                return [ttiTrue, [ttiIsTrue(a) ? aCause : bCause]]
            }
            else if (ttiIsFalse(a) && ttiIsFalse(b)) {
                return [ttiFalse, [aCause, bCause]]
            }
            else if (a1 === null || b1 === null) {
                return [null, []]
            }
            else {
                return [ttiUnknown, [aCause, bCause]]
            }
        }
        case "OrImp": {
            let [a1, aCause] = tiEval(tim, tie.a)
            let [b1, bCause] = tiEval(tim, tie.b)
            let a = a1 === null ? ttiUnknown : a1
            let b = b1 === null ? ttiUnknown : b1
            if (ttiIsTrue(a) && ttiIsFalse(b)) {
                return [ttiContradiction, [aCause, bCause]]
            }
            if (ttiIsTrue(a)) {
                return [ttiTrue, [aCause]]
            }
            else if (ttiIsFalse(b)) {
                return [ttiFalse, [bCause]]
            }
            else if (ttiIsTrue(b)) {
                return [ttiTrue, [bCause]]
            }
            else if (a1 === null || b1 === null) {
                return [null, []]
            }
            else {
                return [ttiUnknown, [aCause, bCause]]
            }
        }
        case "Not": {
            let [a1, aCause] = tiEval(tim, tie.a)
            let a = a1 === null ? ttiUnknown : a1
            return [ttiNot(a), aCause]
        }

        default:
            throw new Error(`unhandled case $ {tie.tag}`)
    }
}





function tiMergeValues(vals: (TypeInhabited | null)[]): [TypeInhabited | null, number[]] {
    let result: TypeInhabited = ttiUnknown
    let anyNulls = false
    let causeKnown: number[] = []
    let causeUnknown: number[] = []
    vals.forEach((val, i) => {
        if (val !== null) {
            if (ttiIsKnown(val)) {
                causeKnown.push(i)
            }
            if (t(val)) {
                causeUnknown.push(i)
            }
            result = [result[0] || val[0], result[1] || val[1]]
            if (result[0] && result[1]) {
                // TypeInhabitationContradictionDetected(`${JSON.stringify(causeKnown)} ${causeKnown.map(i => tiRules[i][0]).join(" ")}`)
                TypeInhabitationContradictionDetected(`${JSON.stringify(causeKnown)} `)
            }
        }
        else {
            anyNulls = true
        }
    })
    if (ttiIsKnown(result)) {
        // We've got a definite true/false result, so return that,
        //   even though not all rules may have been fully evaluated.
        // For causality tracking purposes, just return the first cause ? 
        //   (prunes the causality tree, while still retaining enough info to justify the result)
        //   (makes the causality tree a bit shorter, but not much)
        // return [result, [causeKnown[0]]]
        return [result, causeKnown]
    }
    else if (anyNulls) {
        // Return null, if there is the possibility that on a
        //   future evaluation, the result may change from unknown to known.
        return [null, []]
    }
    else {
        // Otherwise, all rule expressions have been evaluated, there's no point trying again,
        //   the result is unknown and always will be.
        return [ttiUnknown, causeUnknown]
    }
}

// let tiMemoData = memo.memoCreate()
let tiMemoData = typeMemoData

// export function setTiMemoData (memo: memo.MemoData): void {
//     tiMemoData = memo
// }

// export function getTiMemoData (): memo.MemoData {
//     return tiMemoData
// }


function timKey(tim: TIMemo, ty: Type): TIMemoKey {
    // let key = showType2full(ty)
    // let key = JSON.stringify(ty)
    // let key = showTypeParts(ty)

    ty = tiMemoData.hashCons(ty)
    let key = tiMemoData.getMemoID(ty)

    // if (!tim.hasOwnProperty(key)) {
    if (!timHas(tim, key)) {
        // let typeNum = Object.keys(tim).length
        let typeNum = timSize(tim)
        // let entry: TIMemoEntry = { ty: ty, typeName: key, typeNum: typeNum, value: null, exprs: null, cause: [] }
        let entry: TIMemoEntry = { typeName: key, typeNum: typeNum, value: null, exprs: null, cause: [] }
        // tim[key] = entry
        timSet(tim, key, entry)
    }
    return key
}


function tiExprChildren(tie: TIExpr): TIMemoKey[] {
    let tic = tiExprChildren
    switch (tie.tag) {
        case "Const":
            return []
        case "Ref":
            return [tie.a]
        case "Not":
            return [...tic(tie.a)]
        case "And":
        case "AndImp":
        case "Or":
        case "OrImp":
            return [...tic(tie.a), ...tic(tie.b)]
        default:
            throw new Error(`missing case $ {exp.tag}`)
    }
}

// Traverse a type-inhabitation rule graph from a given type-inhabitation memo key,
// return:
//     - a list of fringe nodes to expand,
//     - a list of nodes that reach these fringe nodes, they might become reducible
function tiNext(tim: TIMemo, tyKey: TIMemoKey): [TIMemoKey[], TIMemoKey[]] {
    let resultExpand: TIMemoKey[] = []
    let resultReduce: TIMemoKey[] = []
    let visited: { [key: string]: null } = {}
    let todo: [TIMemoKey, TIMemoKey[] | null][] = [[tyKey, null]]
    while (todo.length !== 0) {
        let [key, children] = todo.pop()!
        // let entry = tim[key]!
        let entry = timGet(tim, key)!
        if (children === null && visited.hasOwnProperty(key)) {
            continue
        }
        visited[key] = null
        if (entry.value !== null) {
            continue
        }
        if (entry.exprs === null) {
            resultExpand.push(key)
            resultReduce.push(key)
            continue
        }
        if (children === null) {
            let childList = entry.exprs.map(([ruleName, exp]) => tiExprChildren(exp))
            let strList: TIMemoKey[] = []
            children = strList.concat(...childList)
        }
        if (children.length === 0) {
            resultReduce.push(key)
        }
        else {
            let nextChild = children.shift()!
            todo.push([key, children])
            todo.push([nextChild, null])
        }
    }
    return [resultExpand, resultReduce]
}

// TODO ? report the maximum iterations/expansions actually performed, 
// TODO ?   after each test-run, or even for each sub-expression in the program.
// values above 50/1500 are sufficient (at the time of writing this comment)
let maxIterations = 100
let maxExpansions = 3000

let tiCalcIndent = ""

// let tiConsoleLog = console.log
// let tiConsoleLog = (...args: any[]) => { }

// let tiConsoleLog = (mkMsg : () => string) => { console.log (mkMsg()) }
let tiConsoleLog = (mkMsg: () => string) => { }

export let tiStats = {
    totalIterCount: 0,
    totalExpansionCount: 0
}

function tiCalc(tim: TIMemo, ty: Type): TypeInhabited {
    let oldIndent = tiCalcIndent
    tiCalcIndent = `${tiCalcIndent}    `
    let indent = tiCalcIndent
    try {
        let key1 = timKey(tim, ty)
        // let entry = tim[key1]
        let entry = timGet(tim, key1)!
        // let entryTy = entry.ty
        let entryTy = typeMemoData.getData(entry.typeName) as Type
        tiConsoleLog(() => `${indent}TI Calc Key: #${entry.typeNum} ${showType2(entryTy)}`)
        let iterCount = 0
        let expansionCount = 0
        while (entry.value === null) {
            let [toExpand, toReduce] = tiNext(tim, key1)
            // tiConsoleLog(`${indent}ToExpand: ${toExpand.map(t => `#${tim[t].typeNum}`).join(" ")}`)
            tiConsoleLog(() => `${indent}ToExpand: ${toExpand.map(t => `#${timGet(tim, t)!.typeNum}`).join(" ")}`)
            // tiConsoleLog(`${indent}ToReduce: ${toReduce.map(t => `#${tim[t].typeNum}`).join(" ")}`)
            tiConsoleLog(() => `${indent}ToReduce: ${toReduce.map(t => `#${timGet(tim, t)!.typeNum}`).join(" ")}`)
            toExpand.forEach(key => {
                // let entry = tim[key]
                let entry = timGet(tim, key)!
                // let entryTy = entry.ty
                let entryTy = typeMemoData.getData(entry.typeName) as Type
                tiConsoleLog(() => `${indent}Expanding Key : #${entry.typeNum} ${showType2(entryTy)}`)
                entry.exprs = tiRules(tim, entryTy).map(([ruleName, expr], i) => {
                    let cs = tiExprChildren(expr)
                    // let childNums = cs.map(c => `#${tim[c].typeNum}`).join(" ")
                    let childNums = cs.map(c => `#${timGet(tim, c)!.typeNum}`).join(" ")
                    if (expr.tag !== "Const" || !t(expr.result)) {
                        // tiConsoleLog(`${indent}          Expr: ${ruleName} ${childNums} => ${JSON.stringify(expr)}`)
                        tiConsoleLog(() => `${indent}          Expr: ${ruleName} => ${showTIExpr(tim, expr)}`)
                    }
                    return [ruleName, expr]
                })

                expansionCount += 1
            })
            let anythingReduced = false
            toReduce.forEach(key => {
                // let entry = tim[key]
                let entry = timGet(tim, key)!
                if (entry.exprs === null) {
                    console.log(`impossible, ${entry.typeNum} ${JSON.stringify(entry)}`)
                }
                let expr_values: [string, TIExpr, [TypeInhabited | null, TICause]][] = entry.exprs!.map(([ruleName, exp]) => {
                    let result: [string, TIExpr, [TypeInhabited | null, TICause]] = [ruleName, exp, tiEvalExpr(tim, exp)]
                    let value = result[2][0]
                    if (value !== null) {
                        exp.result = value
                        exp.cause = result[2][1]
                    }
                    return result
                })
                let values = expr_values.map(([rn, expr, [vals, causes]]) => vals)
                let [value, cause] = tiMergeValues(values)
                if (value !== null) {
                    // let entryType = entry.ty
                    let entryType = typeMemoData.getData(entry.typeName) as Type
                    tiConsoleLog(() => `${indent}Reduced Key   : #${entry.typeNum} ${showType2(entryType)}`)
                    tiConsoleLog(() => `${indent}        Value : ${tiSymbol(value)}`)
                    expr_values.forEach(([ruleName, expr, [v, _]]) => {
                        if (v !== null && !t(v)) {
                            tiConsoleLog(() => `${indent}        Value : ${tiSymbol(v)} ${ruleName} ${showTIExpr(tim, expr)}`)
                        }
                    })
                    entry.value = value
                    anythingReduced = true
                }
                if (cause.length !== 0) {
                    entry.cause.push(...cause)
                }
            })
            if (toExpand.length === 0 && !anythingReduced) {
                // We've reached an unproductive fixed-point
                // Mark everything as unknown.
                // Anything remaining unreduced must be part of a cycle, 
                //   so the normal evaluation mechanism won't manage to propagate the results in the usual way
                toReduce.forEach(key => {
                    // let entry = tim[key]
                    let entry = timGet(tim, key)!
                    entry.value = ttiUnknown
                })
                toReduce.forEach(key => {
                    // let entry = tim[key]
                    let entry = timGet(tim, key)!
                    entry.value = ttiUnknown
                    let values = entry.exprs!.map(([_, exp]) => {
                        let [value, cause] = tiEvalExpr(tim, exp)
                        exp.cause = cause
                        return value
                    })
                    let [value, cause] = tiMergeValues(values)
                    entry.cause = cause
                })
                break
            }
            iterCount += 1
            if (iterCount > maxIterations) {
                throw new Error(`TOO MANY ITERATIONS (${iterCount} > ${maxIterations})`)
            }
            if (expansionCount > maxExpansions) {
                // console.log(`TOO MANY EXPANSIONS (${expansionCount} > ${maxExpansions})`)
                // return tiUnknown
                throw new Error(`TOO MANY EXPANSIONS (${expansionCount} > ${maxExpansions})`)
            }
        }
        tiStats.totalIterCount += iterCount
        tiStats.totalExpansionCount += expansionCount
        tiConsoleLog(() => `${indent}TI Calc Result: ${tiSymbol(entry.value)}`)
        if (entry.value === null) {
            return ttiUnknown
        }
        return entry.value
    }
    finally {
        tiCalcIndent = oldIndent
    }
}

export function showTIExpr(tim: TIMemo, tie: TIExpr): string {
    let stie = (tie: TIExpr): string => showTIExpr(tim, tie)
    switch (tie.tag) {
        case "Const":
            return tiSymbol(tie.result)
        case "Ref":
            // return `#${tim[tie.a].typeNum}`
            return `#${timGet(tim, tie.a)!.typeNum}`
        case "Not":
            return `Not(${stie(tie.a)})`
        case "And":
            return `(${stie(tie.a)} && ${stie(tie.b)})`
        case "AndImp":
            return `(${stie(tie.a)} &&-> ${stie(tie.b)})`
        case "Or":
            return `(${stie(tie.a)} || ${stie(tie.b)})`
        case "OrImp":
            return `(${stie(tie.a)} ||-> ${stie(tie.b)})`
        default:
            throw new Error(`missing case $ {tie.tag}`)

    }
}

function flattenCause(cause: TICause): TIMemoKey[] {
    if (cause instanceof Array) {
        let result: TIMemoKey[] = []
        cause.forEach(c => {
            result.push(...flattenCause(c))
        })
        return result
    }
    return [cause]
}

export function tiShowCause(tim: TIMemo, ty: Type, log: (line: string) => void) {
    let todo: [TIMemoKey, number][] = []
    let key1 = timKey(tim, ty)
    todo.push([key1, 0])
    let visited: { [key: string]: null } = {}
    while (todo.length !== 0) {
        let [key, depth] = todo.pop()!
        // let entry = tim[key]!
        let entry = timGet(tim, key)!
        // let indent = " ".repeat(depth * 4)
        // let indent = `    ${depth}`.padEnd(6)
        let indent = "".padEnd(6)
        let typeNumStr = `${entry.typeNum}`.padEnd(6)
        if (visited.hasOwnProperty(key)) {
            // we've already visited this type
            // log(`${indent} #${typeNumStr} ${tiSymbol(entry.value)} ...`)
            continue
        }
        visited[key] = null
        let ruleName = ""
        let childNums = ""

        // let entryTy = entry.ty
        let entryTy = typeMemoData.getData(entry.typeName) as Type

        log(`${indent} #${typeNumStr} ${tiSymbol(entry.value)} ${showType2(entryTy)}`)
        //  log(showType4(entry.ty, null, 80))
        log(showType4(entryTy, 4, 80))
        entry.cause.forEach((cause: number) => {
            if (entry.exprs !== null) {
                let ruleName = entry.exprs[cause][0]
                let cause2 = entry.exprs[cause][1].cause
                if (cause2 !== undefined) {
                    let cause3 = flattenCause(cause2)
                    // childNums = cause3.map(c => `#${tim[c].typeNum}`).join(" ")
                    childNums = cause3.map(c => `#${timGet(tim, c)!.typeNum}`).join(" ")
                    cause3.reverse().forEach(c => {
                        // only push causes of unknowns if there are children
                        // let children = tim[c].exprs
                        let children = timGet(tim, c)!.exprs
                        // if (children !== null && children.length > 0)
                        {
                            todo.push([c, depth + 1])
                        }
                    })
                }
                if ((entry.value !== null && ttiIsKnown(entry.value)) || childNums.length > 0) {
                    // log(`${indent} #${entry.typeNum} => ${tiSymbol(entry.value)} ${ruleName} ${childNums}`)
                    // log(`${indent} #${typeNumStr} ${tiSymbol(entry.value)}     ${ruleName} ${showTIExpr(tim, entry.exprs[cause][1])}`)
                    log(`${indent}         ${tiSymbol(entry.value)}     ${ruleName} ${showTIExpr(tim, entry.exprs[cause][1])}`)
                }
            }
        })
    }
}


export function tiSummaryGraph(tim: TIMemo, ty: Type): Map<TIMemoKey, TIMemoEntry> {
    let summaryGraph = new Map<TIMemoKey, TIMemoEntry>()
    let todo: TIMemoKey[] = []
    let key1 = timKey(tim, ty)
    todo.push(key1)
    let visited: Map<number, null> = new Map
    while (todo.length !== 0) {
        let key = todo.pop()!
        let entry = timGet(tim, key)!
        if (visited.has(key)) {
            continue
        }
        visited.set(key, null)

        summaryGraph.set(key, entry)
        if (entry.exprs !== null) {
            entry.exprs.forEach(([ruleName, expr]) => {
                let children = tiExprChildren(expr)
                todo.push(...children)
            });
        }
    }
    return summaryGraph
}




export function tiSymbol(ti: TypeInhabited | null): string {
    if (ti === null) {
        return "-" // un-evaluated
    }
    let f = ti[0] ? 1 : 0
    let t = ti[1] ? 2 : 0
    switch (f + t) {
        case 0: return "." // unknown
        case 1: return "0" // is void
        case 2: return "1" // is non-void
        case 3: return "X" // contradiction
        default: throw new Error("impossible")
    }
}


//#endregion



//#region Term Primitives


function valueHd(val: Node | null, topLevel: boolean): Node | null {
    if (val === null) {
        return null
    }
    if (!topLevel) {
        return node(blockedValue("valudHd"))
    }
    let v2 = evalNode(val)
    if (v2.tag !== "pair") {
        throw new Error(`unabled to deconstruct pair/tuple/list`)
    }
    return v2.head
}

function valueTl(val: Node | null, topLevel: boolean): Node | null {
    if (val === null) {
        return null
    }
    if (!topLevel) {
        return node(blockedValue("valudHd"))
    }
    let v2 = evalNode(val)
    if (v2.tag !== "pair") {
        throw new Error(`unabled to deconstruct pair/tuple/list`)
    }
    return v2.tail
}


//#endregion



//#region Type Primitives



let hdDepth = 0
export function typeHd(t: Type, ki = false): Type {
    hdDepth += 1
    let result = typeHd1(t, ki)
    hdDepth -= 1
    // let indent = "  ".repeat(hdDepth)
    // console.log(`Type Hd    ${hdDepth}: ${indent}${showType4(t, 8, 180)}`)
    // console.log(`Type Hd => ${hdDepth}: ${indent}${showType4(result, 8, 180)}`)
    return result
}

export function typeHd1(t: Type, ki = false): Type {
    if (ASSUME_ALL_PAIRS_INHABITED) {
        ki = true
    }
    let ruleName = "hdT"
    let arg = t
    // we should be able to do this, except, with this rule, the cast function in the init_env in fe3-eval.fe make the whole environment uninhabited
    // TODO a better cast function
    // if (tiIsFalse(tiStructural(arg))) {
    //     return voidT
    // }
    switch (arg.tag) {
        case "TPair":
            if (ki || ttiIsTrue(tiStructural(arg.tl))) {
                return arg.hd
            }
            else {
                return ruleT("hdT", [t])
            }
        case "TList":
            return arg.elem
        case "TAny":
            return anyT
        case "TVoid":
            return voidT
        case "TError":
            return errorT
        case "TNil":
            return voidT
        case "TSub": {
            let t1 = typeHd(arg.type, ki)
            let t2 = typeHd(arg.super, ki)
            // if we can see that the sub-type is inhabited,
            // then it is safe to treat the super-type as inhabited
            if (TRACK_TYPE_INHABITATION) {
                if (ttiIsTrue(tiStructural(arg.type)) && ttiIsTrue(tiStructural(t2))) {
                    t1 = knownInhabited(t1)
                    t2 = knownInhabited(t2)
                    let result = subT(t1, t2)
                    result = knownInhabited(result)
                    return result
                }
                return subT(t1, t2)
            }
            return subT(t1, t2)
        }
        case "TSuper": {
            let t2 = typeHd(arg.sub, ki)
            let ki2 = ki
            if (TRACK_TYPE_INHABITATION) {
                ki2 = ki || ttiIsTrue(tiStructural(t2))
            }
            let t1 = typeHd(arg.type, ki2)
            return superT(t1, t2)
        }

        case "TRule": {
            switch (arg.name) {
                case "unionT":
                    // return unionTypeList(arg.args.map(a => typeHd(a, ki)))
                    // Even if we know that the overall union is inhabited,
                    //  this doesn't tell us that each of the types that make up the union
                    //  are inhabited.
                    // Obviously, at least one of them must be, but we don't know which.
                    return unionTypeList(arg.args.map(a => typeHd(a, false)))
                case "intersectT":
                    // TODO remove this rule
                    //   pushing the Hd through an intersection can't really be safe
                    if (PUSH_PROJECTTION_THROUGH_INTERSECTION) {
                        return intersectTypeList(arg.args.map(a => typeHd(a, ki)))
                    }
                    else {
                        // pushing a Hd through an intersection is not
                        // generally safe, as the tail is lost, and 
                        // the intersection between the tails may have
                        // narrowed the intersection of the heads.
                        // e.g. 
                        // (Hd { {["A", Int] | ["B", Str]} & [Str, Str] })
                        // However it is safe if the tail doesn't restrict the head
                        // This needs more thought, it's needed to make the codec-pair
                        // test pass in bidirectional mode (it works anyway in simple mode)
                        // but this test isn't really rigorous enough to be valid
                        // (and making it more rigorous makes the codec-pair test fail)

                        // let [a,b] = arg.args
                        // let safe = tiIsFalse(tiStructural(typeRelComp0(typeTl(a), typeTl(b, true))))
                        // if (safe) {
                        //     return intersectTypes(typeHd(a), typeHd(b))
                        // }
                    }
                // if (ki) {
                //     return intersectTypeList(arg.args.map(a => typeHd(a, ki)))
                // }
                default:
                    // return ruleT("hdT", [t])
                    return addKnownInhabited(ruleT("hdT", [t]), ki)
            }
        }
        case "TRec":
            return typeHd(unrollRecursiveType(arg), ki)
        case "TSelf": {

            // // substutute an Unknown in for the self-ref type
            // // we can either use a bare unknown with subsequent reductions
            // // or an subtyped unknown with no subsequent reductions
            // // we risk an infinite cycle of substutions and reductions if we do both
            // // maybe lazy type substitution/reduction would make sense?
            // // In principle, we could substitute in a unique fresh variable for the unknown
            // // this would enable the parts of the self-ref type to play nicely together.

            // // let arg_type = substType(arg.body, arg.name, subT(unknownT, arg), false)
            // let arg_type = substType(arg.body, arg.name, unknownT, true)

            // // we can just substitute in "Any"
            // // the trick to handling dependent relationships is to intersect with known values,
            // // taking the "Hd" or "Tl" in isolation can be simple 
            // // so long as we are not expecting to pair them together again and get something that still fits.
            // let arg_type = substType(arg.body, arg.name, anyT, true)
            // let result = typeHd(arg_type, ki)
            // return result

            // substituting "Any" for the self-var loses precision needlessly,
            // in particular it loses any dependencies that are contained solely within/between the head part of the pair.
            // converting
            //   Self <| A -> ...A...
            // to
            //   Self <| A -> Hd { ...{ [A ,, Any] }... }
            // retains more precision in the head, but still loses precision in the tail.
            // but, using:
            //   Self <| A -> Hd { ...{ [A ,, Unknown] }... }
            // is correct as far as it goes, without losing precision
            // ( using Unknown loses precision in one sense, but not in another,
            //   we aren't widening the tail type to accept things it doesn't,
            //   but we aren't keeping it narrow enough to be accepted by anything either
            // )
            let tl_type = knownInhabited(unknownT)
            let arg_type = substType(arg.body, arg.name, pairT(varT(arg.name), tl_type), true)
            let hd_type = typeHd(arg_type, ki)
            let result = selfT(arg.name, hd_type)
            return result

        }

        case "TInt":
        case "TSingle":
        case "TSingleTermVar":
        // assume singleton types are always strings (or at least datums) for now, so no possibility of being a pair
        case "TStr":
        case "TChar":
        case "TBool":
        case "TType":
        case "TFun":
            return voidT
        case "TAs":
            return typeHd(arg.type, ki)
        case "TVar":
            // return ruleT("hdT", [t])
            return addKnownInhabited(ruleT("hdT", [t]), ki)
        case "TUnknown":
            return unknownT

        case "TSingleType":
            return singleTypeT(typeHd(arg.val))


        default:
            throw new Error(`missing case $ {arg.tag}`)
    }
}

// TODO Make recursive calls go via reduceTypeRule again
// TODO   so as to prevent potential trivial non-termination.
// TODO e.g. 
// TODO    (Tl {Fix {A->A}})
// TODO should return Unknown
export function typeTl(t: Type, ki = false): Type {
    if (ASSUME_ALL_PAIRS_INHABITED) {
        ki = true
    }
    let ruleName = "tlT"
    let arg = t
    // if (tiIsFalse(tiStructural(arg))) {
    //     return voidT
    // }
    switch (arg.tag) {
        case "TPair": {
            let hdInhabited = tiStructural(arg.hd)
            if (ki || ttiIsTrue(hdInhabited)) {
                return arg.tl
            }
            else if (ttiIsFalse(hdInhabited)) {
                return voidT
            }
            else {
                return ruleT("tlT", [t])
            }
        }
        case "TList":
            return arg
        case "TAny":
            return anyT
        case "TVoid":
            return voidT
        case "TError":
            return errorT
        case "TNil":
            return voidT
        case "TSub": {
            // TODO add the equivalent of this rule to the other type-projecting functions too (Hd, Elem, Dom, Rng)
            if (arg.super.tag === "TSelf") {
                // let unknownSelf = substType(arg.super.body, arg.super.name, subT(unknownT, arg.super), true)
                // let unknownSelf = substType(arg.super.body, arg.super.name, unknownT, true)
                // return typeTl(substType(arg.super.body, arg.super.name, subT(arg.type, unknownSelf), false), ki)
                let unknownSelf = substType(arg.super.body, arg.super.name, anyT, true)
                return typeTl(substType(arg.super.body, arg.super.name, arg.type, false), ki)
            }
            else {
                let t1 = typeTl(arg.type, ki)
                let t2 = typeTl(arg.super, ki)
                let ki2 = ki
                if (TRACK_TYPE_INHABITATION) {
                    if (ttiIsTrue(tiStructural(arg.type)) && ttiIsTrue(tiStructural(t2))) {
                        t1 = knownInhabited(t1)
                        t2 = knownInhabited(t2)
                        let result = subT(t1, t2)
                        result = knownInhabited(result)
                        return result
                    }
                    ki2 = ki2 || ttiIsTrue(tiStructural(t1))
                }
                // let t2 = typeTl(arg.super, ki2)
                return subT(t1, t2)
            }
        }
        case "TSuper": {
            let t1 = typeTl(arg.type, ki)
            let t2 = typeTl(arg.sub, ki)
            return superT(t1, t2)
        }

        case "TRule": {
            switch (arg.name) {
                case "unionT":
                    // return unionTypeList(arg.args.map(a => typeTl(a, ki)))
                    // Even if we know that the overall union is inhabited,
                    //  this doesn't tell us that each of the types that make up the union
                    //  are inhabited.
                    // Obviously, at least one of them must be, but we don't know which.
                    return unionTypeList(arg.args.map(a => typeTl(a, false)))
                case "intersectT":
                    // TODO remove this rule
                    //   pushing the Tl through an intersection can't really be safe
                    if (PUSH_PROJECTTION_THROUGH_INTERSECTION) {
                        return intersectTypeList(arg.args.map(a => typeTl(a, ki)))
                    }
                // if (ki) {
                //     return intersectTypeList(arg.args.map(a => typeTl(a, ki)))
                // }
            }
            break
        }
        case "TRec":
            return typeTl(unrollRecursiveType(arg), ki)
        case "TInt":
        case "TSingle":
        case "TStr":
        case "TChar":
        case "TBool":
        case "TType":
            return voidT
        case "TAs":
            return typeTl(arg.type, ki)
        case "TSelf": {
            // // substutute an Unknown in for the self-ref type

            // // let arg_type = substType(arg.body, arg.name, subT(unknownT, arg), false)

            // let arg_type = substType(arg.body, arg.name, unknownT, true)
            // let result = typeTl(arg_type, ki)

            // // let arg_type2 = substType(arg.body, arg.name, arg_type, true)
            // // let result = typeTl(arg_type2, ki)

            // // see comments in typeHd for why it is okay to
            // //  substitute an "Any" into a "Self" type
            // // let ty = unknownT
            // let ty = anyT
            // // let ty = knownInhabited(unknownT)
            // let arg_type = substType(arg.body, arg.name, ty, true)
            // let result = typeTl(arg_type, ki)

            let hd_type = knownInhabited(unknownT)
            let arg_type = substType(arg.body, arg.name, pairT(hd_type, varT(arg.name)), true)
            let tl_type = typeTl(arg_type, ki)
            let result = selfT(arg.name, tl_type)

            return result

        }
    }
    // return ruleT("tlT", [arg])
    return addKnownInhabited(ruleT("tlT", [arg]), ki)
}


export function typeElem(t: Type): Type {
    let ruleName: RuleName = "elemT"
    let arg = t
    if (ttiIsFalse(tiStructural(arg))) {
        return voidT
    }
    switch (arg.tag) {
        case "TList":
            return arg.elem
        case "TNil":
            return voidT
        case "TPair": {
            let hd = arg.hd
            let [ok1, tl] = reduceTypeRule(ruleName, [arg.tl])
            let [ok2, u] = reduceTypeRule("unionT", [hd, tl])
            return u
        }
        case "TAny":
            return anyT
        case "TVoid":
            return voidT
        case "TError":
            return errorT
        case "TSub": {
            let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            let [ok2, t2] = reduceTypeRule(ruleName, [arg.super])
            if (TRACK_TYPE_INHABITATION) {
                if (ttiIsTrue(tiStructural(arg.type)) && ttiIsTrue(tiStructural(t2))) {
                    t1 = knownInhabited(t1)
                    t2 = knownInhabited(t2)
                    let result = subT(t1, t2)
                    result = knownInhabited(result)
                    return result
                }
            }
            return subT(t1, t2)
        }
        case "TSuper": {
            let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            let [ok2, t2] = reduceTypeRule(ruleName, [arg.sub])
            return superT(t1, t2)
        }
        case "TRec": {
            let [ok, ty] = reduceTypeRule(ruleName, [unrollRecursiveType(arg)])
            return ty
        }
        case "TType":
            return voidT

        case "TAs":
            return typeElem(arg.type)

        case "TSelf": {
            let ty = unknownT
            // let ty = anyT
            // let ty = knownInhabited(unknownT)
            let arg_type = substType(arg.body, arg.name, ty, true)
            return typeElem(arg_type)
        }
        case "TUnknown":
            return unknownT
        case "TRule": {
            switch (arg.name) {
                case "unionT": {
                    let [ok1, t1] = reduceTypeRule(ruleName, [arg.args[0]])
                    let [ok2, t2] = reduceTypeRule(ruleName, [arg.args[1]])
                    return unionTypes(t1, t2)
                }
            }
        }
    }
    return ruleT("elemT", [arg])
}

// return the result of tuple-mapping intersected function type "F" over tuple-type "T"
export function typeTupleMap(f: Type, t: Type): Type {
    let ruleName: RuleName = "tupleMapT"
    // console.log(`TupleMap F: ${showType2(f)}`)
    // console.log(`TupleMap T: ${showType2(t)}`)
    switch (t.tag) {
        case "TPair": {
            // return pairT(applyT(f, typeHd(t)), typeTupleMap(f, typeTl(t)))
            return pairT(applyTypes(f, typeHd(t)), typeTupleMap(f, typeTl(t)))
        }
        case "TNil": {
            return nilT
        }
        case "TSub": {
            return subT(typeTupleMap(f, t.type), typeTupleMap(f, t.super))
        }
        default: {
            return ruleT("tupleMapT", [f, t])
        }
    }
}

export function typeDom(t: Type): Type {
    let dom = typeDom1(t)
    return dom
}

export function typeDom1(t: Type): Type {
    let ruleName: RuleName = "domainT"
    let arg = t
    switch (arg.tag) {
        case "TFun": {
            let dom = convertPatTypeClosed(arg.argType)
            if (dom.tag === "TTerm" || dom.tag === "TTermVar") {
                // the term part of a TTerm is not permitted/intended to narrow the type
                // e.g. 
                //     { {i:Int} -> ... } 
                // "i" could be any Int
                // but 
                //     { {5: Int} -> ... }
                // doesn't make sense, should be caught as a type error already
                dom = dom.type
            }
            return dom
        }

        // switch sub-type <-> super-type when accessing function domain
        case "TSub": {
            let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            let [ok2, t2] = reduceTypeRule(ruleName, [arg.super])
            return superT(t1, t2)
        }
        case "TSuper": {
            let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            let [ok2, t2] = reduceTypeRule(ruleName, [arg.sub])
            return subT(t1, t2)
        }

        case "TAny":
            // there is no value we can definitely call this function with
            return voidT
        case "TVoid":
            // Void is all things to all people, so can be called with anything
            return anyT
        case "TError":
            return anyT

        case "TRec":
            return typeDom(unrollRecursiveType(arg))

        case "TSelf": {
            let ty = unknownT
            // let ty = anyT
            // let ty = knownInhabited(unknownT)
            let f = substType(arg.body, arg.name, ty, true)
            let d = typeDom(f)
            return d
        }

        case "TAs": {
            return typeDom(arg.type)
        }
        case "TRule": {
            switch (arg.name) {
                case "intersectT": {
                    let [ok1, t1] = reduceTypeRule("domainT", [arg.args[0]])
                    let [ok2, t2] = reduceTypeRule("domainT", [arg.args[1]])
                    let [ok3, t3] = reduceTypeRule("unionT", [t1, t2])
                    return t3
                }
                case "unionT": {
                    let [ok1, t1] = reduceTypeRule("domainT", [arg.args[0]])
                    let [ok2, t2] = reduceTypeRule("domainT", [arg.args[1]])
                    let [ok3, t3] = reduceTypeRule("intersectT", [t1, t2])
                    return t3
                }

            }
        }

    }
    return ruleT("domainT", [arg])
}

export function typeRng(t: Type): Type {
    let rng = typeRng1(t)
    return rng
}


export function typeRng1(t: Type): Type {
    let ruleName: RuleName = "rangeT"
    let arg = t
    switch (arg.tag) {
        case "TFun": {
            let env = matchTypes(arg.argType, convertPatTypeClosed(arg.argType))
            let codomain = substTypeEnv(arg.resultType, env, true)
            return codomain
        }
        case "TSub": {
            let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            // TODO ? perhaps, instead of taking the Codomain of the super-type,
            // TODO ?   apply the domain of the sub-type to the super-type ?
            // let [ok2, t2] = reduceTypeRule(ruleName, [arg.super])
            // return subT(t1, t2)
            // A sub-type of a function may have broader domain than the super-type.
            // The sub-type may have a narrower codomain than the super-type, where the domains match.
            // For the parts of the sub-types domain which lie outside the super-types domain,
            //   the sub-types codmain need not have any relationship with the super-types codomain.
            // This is why the subT(t1, t2) line has been commented out above.
            // Generally rather than asking for the codomain of a function, 
            //   it is more precise to ask what a function would return for a given input.
            // i.e. use {F A} instead of (Codomain F)
            return t1
            // TODO ? Perhaps we should compare the domains of the sub and super types ?
            // TODO ? If the domain of the sub-type is no broader than the super-type (despite being allowed to be),
            // TODO ?   then it is valid to assume that the codomain of the sub-type is also a sub-type of the codomain of the super-type.
            // TODO ? In that particular case it would be valid to reinstate the subT(t1,t2) line above.
            // TODO ? Things see fine as they are for now though.
        }
        case "TSuper": {
            let [ok1, t1] = reduceTypeRule(ruleName, [arg.type])
            let [ok2, t2] = reduceTypeRule(ruleName, [arg.sub])
            return superT(t1, t2)
            // return t1
        }
        case "TAny":
            return anyT
        case "TVoid":
            return voidT
        case "TError":
            return errorT
        case "TRule":
            switch (arg.name) {
                case "intersectT":
                    // return intersectTypes(typeRng(arg.args[0]), typeRng(arg.args[1]))
                    return unionTypes(typeRng(arg.args[0]), typeRng(arg.args[1]))
                case "unionT":
                    return unionTypes(typeRng(arg.args[0]), typeRng(arg.args[1]))
            }
            break
        case "TRec":
            return typeRng(unrollRecursiveType(arg))


        case "TSelf": {
            let ty = unknownT
            // let ty = anyT
            // let ty = knownInhabited(unknownT)
            let f = substType(arg.body, arg.name, ty, true)
            let r = typeRng(f)
            return r
        }
        case "TAs": {
            return typeRng(arg.type)
        }
    }
    return ruleT("rangeT", [arg])
}

function isPolymorphic(a: TFunT<{}>): boolean {
    // TODO revisit this if we permit nestes as-patterns
    return a.argType.tag === "TAs"
}

export function typeInverse(a: Type): Type {
    switch (a.tag) {
        case "TFun":
            if (isPolymorphic(a)) {
                // any attempt to calculate the inverse of a polymorphic function
                // remains unreduced
                break
            }
            else {
                return funT(a.resultType, a.argType)
            }
        case "TRule": {
            switch (a.name) {
                case "intersectT": {
                    return ruleT("intersectT", a.args.map(typeInverse))
                }
                default:
                    break
            }
            break
        }
        default:
            break
    }
    return ruleT("inverseT", [a])
}

export function typeInverseApply(a: Type, b: Type): Type {
    // TODO invert A and apply ((A~) B)
    // return ruleT("inverseApplyT", [a, b])
    return applyTypes(typeInverse(a), b)
}




function typeContainsUnknown_noMemo(ty: Type | Type[]): boolean {
    let [tag, fields, children] = typeParts2(ty)
    if (tag === "TUnknown") {
        return true
    }
    for (let child of children) {
        if (typeContainsUnknown((ty as any)[child])) {
            return true
        }
    }
    return false
}
//  let typeContainsUnknown = typeContainsUnknown_noMemo
let typeContainsUnknown = typeMemoData.memoizeFunction("tcu", typeContainsUnknown_noMemo)

// TODO ? would it be better to have sufficient type inhabitation rules
// TODO ?   to not need this fall-back method of testing ?
function equalType1(a: Type, b: Type): boolean {
    // EXPERIMENT
    // return false
    // let rcAB = typeRelComp(a, b)
    // let rcBA = typeRelComp(b, a)
    // return rcAB.tag === "TVoid" && rcBA.tag === "TVoid"

    if (typeContainsUnknown(a) || typeContainsUnknown(b)) {
        return false
    }
    return equalObjects<Type>(a, b)
}

function equalTypes2(a: Type, b: Type, checkKi: boolean): boolean {
    let [aTag, aFields, aElems] = typeParts2(a)
    let [bTag, bFields, bElems] = typeParts2(b)
    if (aTag !== bTag) {
        return false
    }
    if (checkKi && a.ki !== b.ki) {
        return false
    }
    if (aTag === "TUnknown" || bTag === "TUnknown") {
        return false
    }
    if (aFields.length !== bFields.length) {
        throw new Error("impossible")
        // return false
    }
    for (let i = 0; i !== aFields.length; i++) {
        if (aFields[i] !== bFields[i]) {
            throw new Error("impossible")
            // return false
        }
        let fieldName = aFields[i]
        let aFieldVal = (a as any)[fieldName]
        let bFieldVal = (b as any)[fieldName]
        // TODO the "term" in a "TTerm" is an object, this equality test doesn't currently account for that.
        // all other type fields are primitive types, the "term" field is the only field with object type.
        // possibly this only ever worked because the hash-consing ensured object identity corresponded to value identity ?
        if (aFieldVal !== bFieldVal) {
            return false
        }
    }
    if (aElems.length !== bElems.length) {
        throw new Error("impossible")
        // return false
    }
    for (let i = 0; i !== aElems.length; i++) {
        if (aElems[i] !== bElems[i]) {
            throw new Error("impossible")
            // return false
        }
        let elemName = aElems[i]
        let aElem = (a as any)[elemName]
        let bElem = (b as any)[elemName]
        if (!equalTypes2(aElem, bElem, checkKi)) {
            return false
        }
    }
    return true
}

// let equalType = equalType1
// let equalType = (a: Type, b: Type) => equalTypes2(a, b, true)

let equalType_noMemo = (a: Type, b: Type) => {
    let et1 = equalType1(a, b)
    let et2 = equalTypes2(a, b, true)
    if (et1 !== et2) {
        console.log(`EQUAL TYPE ERROR ${et1} ${et2}`)
        console.log("A:", showType2(a))
        console.log("B:", showType2(b))
        throw new Error("HALT")
    }
    return et1
}

// let equalType = equalType_noMemo
// let equalType = memo.memoizeFunction(typeMemoData, "eqt", equalType_noMemo)
let equalType = typeMemoData.memoizeFunction("eqt", equalType1)


function typeContainsTypeVar_noMemo(ty: Type | Type[]): boolean {
    let [tag, fields, children] = typeParts2(ty)
    if (tag === "TVar" || tag === "TAs") {
        return true
    }
    for (let child of children) {
        if (typeContainsTypeVar((ty as any)[child])) {
            return true
        }
    }
    return false
}
export let typeContainsTypeVar = typeMemoData.memoizeFunction("tctv", typeContainsTypeVar_noMemo)


export function typeRelComp0(a: Type, b: Type): Type {
    return ruleT("relcompT", [a, b])
}

let typeRelComp = typeRelComp1

// compute the relative-complement of A and B: { A \ B }
// i.e. the type that contains everything that is in A, but not in B
export function typeRelComp1(a: Type, b: Type): Type {
    let rc = typeRelComp1

    if (a.tag === "TVoid" || b.tag === "TAny") {
        return voidT
    }
    if (b.tag === "TVoid") {
        return a
    }
    if (a.tag === "TError") {
        return errorT
    }
    if (b.tag === "TError") {
        console.log("I can't imagine we'll ever get here")
        // throw new Error("I can't imagine we'll ever get here")
        // currently, every type implicitly contains error
        // so there's no way to represent a type with just Error removed
        // ? so pretend Error behaves like Void and just return A ?
        // we're actually doing that implicitly everywhere, e.g.
        //   { {Int|Bool} \ Bool }
        // reduces to {Int}, still with an implicit Error, 
        // even through there's implicitly an Error in Bool
        return a
    }


    if (equalType(a, b)) {
        return voidT
    }

    if (a.tag === "TSub") {
        if (equalType(a.type, b))
            return voidT
        if (equalType(a.super, b))
            return voidT
        let t1 = rc(a.type, b)
        let t2 = rc(a.super, b)
        return subT(t1, t2)
    }
    if (a.tag === "TSuper") {
        if (equalType(a.type, b))
            return voidT
        let t1 = rc(a.type, b)
        let t2 = rc(a.sub, b)
        return superT(t1, t2)
    }
    // TODO ? b.tag==="TSuper" ?

    if (a.tag === "TPair" && b.tag === "TPair") {
        let rcH = rc(a.hd, b.hd)
        let rcT = rc(a.tl, b.tl)
        let pH = pairT(rcH, a.tl)
        let pT = pairT(a.hd, rcT)
        let result = unionTypes(pH, pT)
        return result
    }

    if (a.tag === "TList" && b.tag === "TPair") {
        let rcH = rc(a.elem, b.hd)
        let rcT = rc(a, b.tl)
        let pH = pairT(rcH, a)
        let pT = pairT(a.elem, rcT)
        let result = unionTypeList([pH, pT, nilT])
        return result
    }


    if (a.tag === "TList" && b.tag === "TList") {
        let elem = rc(a.elem, b.elem)
        return rc(listT(elem), nilT)
    }

    if (a.tag === "TNil" && b.tag === "TList") {
        return voidT
    }

    if (a.tag === "TList" && b.tag === "TNil") {
        return pairT(a.elem, a)
    }


    if (a.tag === "TPair" && b.tag === "TNil") {
        return a
    }
    if (a.tag === "TNil" && b.tag === "TPair") {
        return a
    }

    if (a.tag === "TRule" && a.name === "unionT") {
        let u0 = rc(a.args[0], b)
        let u1 = rc(a.args[1], b)
        return unionTypes(u0, u1)
    }

    if (b.tag === "TRule" && b.name === "unionT") {
        return rc(rc(a, b.args[0]), b.args[1])
    }

    if (a.tag === "TSingle" && b.tag === "TSingle") {
        if (a.val === b.val) {
            return voidT
        }
        else {
            return a
        }
    }

    if (a.tag === "TStr" && b.tag === "TChar") {
        // an empty string, or a string with length at least 2
        // leave unreduced for now
        ruleT("relcompT", [a, b])
    }
    if (a.tag === "TChar" && b.tag === "TStr") {
        return voidT
    }


    if (a.tag === "TFun" && b.tag === "TFun") {
        // TODO ? probably need to union together three different cases to 
        // TODO ?   reduce this correctly
        return ruleT("relcompT", [a, b])
    }

    // TODO don't assume a TSingle is always a string
    // TODO handle alternative/arbitrary singleton types
    if (a.tag === "TSingle" && b.tag === "TStr") {
        return voidT
    }

    if (a.tag === "TSingleType" && b.tag === "TType") {
        return voidT
    }

    let disjointTypes = ["TInt", "TBool", "TType", "TFun", "TStr", "TChar", "TNil"]
    if (disjointTypes.indexOf(a.tag) !== -1 && disjointTypes.indexOf(b.tag) !== -1) {
        return a.tag === b.tag ? voidT : a
    }

    if ((a.tag === "TList" || a.tag === "TPair") && disjointTypes.indexOf(b.tag) !== -1) {
        return a
    }

    // TODO ? handle { (Rec A) \ (Rec B) }
    if (a.tag === "TRec") {
        let a1 = unrollRecursiveType(a)
        return typeRelComp(a1, b)
    }
    if (b.tag === "TRec") {
        let b1 = unrollRecursiveType(b)
        return typeRelComp(a, b1)
    }

    if (b.tag === "TRule" && b.name === "relcompT" && b.args[0].tag === "TAny") {
        let t1 = intersectTypes(a, b.args[1])
        return t1
    }


    return ruleT("relcompT", [a, b])
}



export let unionTypes = unionTypes1

// export function unionTypes3(a: Type, b: Type): Type {
//     return typeRelComp(anyT, typeRelComp(typeRelComp(anyT, a), b))
// }

export function typeUnion0(a: Type, b: Type): Type {
    return ruleT("unionT", [a, b])
}

export function unionTypes1(a: Type, b: Type): Type {

    if (equalType(a, b)) {
        return a
    }
    if (a.tag === "TError") {
        return b
    }
    if (b.tag === "TError") {
        return a
    }

    // TODO something sensible with recursive types

    if (a.tag === "TSub") {
        if (equalType(a.type, b))
            return a
        if (equalType(a.super, b))
            return b
        let t1 = unionTypes(a.type, b)
        let t2 = unionTypes(a.super, b)
        return subT(t1, t2)
    }
    if (a.tag === "TSuper") {
        if (equalType(a.type, b))
            return a
        if (equalType(a.sub, b))
            return a
        let t1 = unionTypes(a.type, b)
        let t2 = unionTypes(a.sub, b)
        return superT(t1, t2)
    }
    if (b.tag === "TSub") {
        if (equalType(a, b.type))
            return b
        if (equalType(a, b.super))
            return a
        let t1 = unionTypes(a, b.type)
        let t2 = unionTypes(a, b.super)
        return subT(t1, t2)
    }
    if (b.tag === "TSuper") {
        if (equalType(a, b.type))
            return b
        if (equalType(a, b.sub))
            return b
        let t1 = unionTypes(a, b.type)
        let t2 = unionTypes(a, b.sub)
        return superT(t1, t2)
    }

    if (a.tag === "TAny" || b.tag === "TAny") return anyT
    if (a.tag === "TVoid") return b
    if (b.tag === "TVoid") return a
    if (a.tag === "TNil" && b.tag === "TNil") return nilT
    if (a.tag === "TBool" && b.tag === "TBool") return boolT
    if (a.tag === "TInt" && b.tag === "TInt") return intT
    if (a.tag === "TStr" && b.tag === "TStr") return strT
    if (a.tag === "TStr" && b.tag === "TChar") return strT
    if (a.tag === "TChar" && b.tag === "TStr") return strT
    if (a.tag === "TType" && b.tag === "TType") return typeT
    if (a.tag === "TPair" && b.tag === "TPair") {
        // TODO ? check if either side is uninhabited ?
        return ruleT("unionT", [a, b])
    }
    if (a.tag === "TList" && b.tag === "TList") return listT(unionTypes(a.elem, b.elem))
    if (a.tag === "TList" && b.tag === "TNil") return a
    if (a.tag === "TNil" && b.tag === "TList") return b
    if (a.tag === "TList" && b.tag === "TPair" && b.tl.tag === "TList") return listT(unionTypes(a.elem, unionTypes(b.hd, b.tl.elem)))
    if (a.tag === "TPair" && a.tl.tag === "TList" && b.tag === "TList") return listT(unionTypes(unionTypes(a.hd, a.tl.elem), b.elem))
    if (a.tag === "TFun" && b.tag === "TFun") {
        // TODO ? leave unreduced ?
        //   sometimes its useful to leave the members of a union explictly enumerated, (and somethings it is the opposite of useful)
        //   perhaps leave the degree of precision here as the users responsibility via type anotations?
        return funT(intersectTypes(a.argType, b.argType), unionTypes(a.resultType, b.resultType))
    }

    if (a.tag === "TNil" && b.tag === "TPair" && b.tl.tag === "TList") {
        return b.tl
    }
    if (a.tag === "TPair" && a.tl.tag === "TList" && b.tag === "TNil") {
        return a.tl
    }

    if (a.tag === "TRule" && a.name === "unionT") {
        if (equalType(a.args[0], b) || equalType(a.args[1], b)) {
            return a;
        }
    }

    if (b.tag === "TRule" && b.name === "unionT") {
        if (equalType(a, b.args[0]) || equalType(a, b.args[1])) {
            return b;
        }
    }

    if (a.tag === "TSingle" && b.tag === "TSingle" && a.val === b.val) {
        return a
    }
    // TODO don't assume a TSingle is always a string
    // TODO handle alternative/arbitrary singleton types
    if (a.tag === "TSingle" && b.tag === "TStr") {
        return b
    }
    if (a.tag === "TStr" && b.tag === "TSingle") {
        return a
    }

    if (b.tag === "TRule" && b.name === "relcompT" && b.args[0].tag === "TAny") {
        let ty1 = typeRelComp(b.args[1], a)
        let ty2 = typeRelComp(anyT, ty1)
        return ty2
    }

    // if { A \ B0 } in uninhabited
    // then
    // { A | { B0 \ B1 } } ==> { B0 \ { B1 \ A } } 
    if (b.tag === "TRule" && b.name === "relcompT") {
        let rc0 = tiStructuralRelComp(a, b.args[0])
        if (ttiIsFalse(rc0)) {
            let ty1 = typeRelComp(b.args[1], a)
            let ty2 = typeRelComp(b.args[0], ty1)
            return ty2
        }
    }

    // // keep unions nested to the right
    // // so 
    // //   { { A | B } | C }
    // // becomes
    // //   { A | B | C }
    // if (a.tag==="TRule" && a.name==="unionT") {
    //     let elems: Type[] = []
    //     while (a.tag==="TRule" && a.name==="unionT") {
    //         elems.push(a.args[0])
    //         a = a.args[1]
    //     }
    //     elems.push(a)
    //     let result = elems.reduceRight( ((ty, elem) => ruleT("unionT", [elem, ty])), b )
    //     return result
    // }

    return ruleT("unionT", [a, b])
}

export function unionTypeList(args: Type[]): Type {
    let result = voidT
    args.forEach(arg => {
        result = unionTypes(result, arg)
    })
    return result
}


function tryTypeIntersect(a: Type, b: Type): Type | null {
    // let tti = (a: Type, b: Type): [boolean, Type] => {
    //     let [ok,ty] = reduceTypeRule("tryIntersectT", [a, b])
    //     return [ok, ty]
    // }

    let tti = (a: Type, b: Type): Type | null => {
        let [ok, ty] = reduceTypeRule("intersectT", [a, b])
        return ok ? ty : null
    }
    let ti = (a: Type, b: Type): Type => {
        let t = tti(a, b)
        return t !== null ? t : ruleT("intersectT", [a, b])
    }
    if (equalType(a, b)) {
        return a
    }
    if (TRACK_TYPE_INHABITATION) {
        if (equalType(notKnownInhabited(a), notKnownInhabited(b))) {
            let result = addKnownInhabited(a, a.ki || b.ki)
            return result
        }
    }

    if (a.tag === "TError" || b.tag === "TError") {
        return errorT
    }

    if (a.tag === "TSelf" && b.tag === "TSelf") {
        let fvA = typeFreeVars(a)
        let fvB = typeFreeVars(b)
        let v = uniqName(a.name, [...fvA, ...fvB])
        let a2 = substType(a.body, a.name, varT(v), true)
        let b2 = substType(b.body, b.name, varT(v), true)
        let body = ti(a2, b2)
        // if (body===null) {
        //     return null
        // }
        return selfT(v, body)
    }

    if (a.tag === "TSelf") {
        let fvA = typeFreeVars(a)
        let fvB = typeFreeVars(b)
        let v = uniqName(a.name, [...fvA, ...fvB])
        let body = ti(substType(a.body, a.name, subT(varT(v), b), true), b)
        // if (body===null) {
        //     return null
        // }
        let result = selfT(v, body)
        return result
    }

    if (b.tag === "TSelf") {
        let fvA = typeFreeVars(a)
        let fvB = typeFreeVars(b)
        let v = uniqName(b.name, [...fvA, ...fvB])
        let body = ti(substType(b.body, b.name, subT(varT(v), a), true), a)
        // if (body===null) {
        //     return null
        // }
        let result = selfT(v, body)
        return result
    }

    if (a.tag === "TAs" && b.tag === "TAs") {
        if (a.name === b.name) {
            let t1 = ti(a.type, b.type)
            return asT(a.name, t1)
        }
        else {
            // this could cause problems, as we don't currently handle nested as patterns,
            // we could continue with the intersect here, but it could cause problems
            // later on as the nested as-pattern wouldn't be bound when used.
            throw new Error("oh dear")
        }
    }

    if (a.tag === "TAs") {
        let t1 = ti(a.type, b)
        return asT(a.name, t1)
    }
    if (b.tag === "TAs") {
        let t1 = ti(a, b.type)
        return asT(b.name, t1)
    }


    if (a.tag === "TSub") {
        if (equalType(a.type, b))
            return a
        if (equalType(a.super, b))
            return a
        let t1 = ti(a.type, b)
        let t2 = ti(a.super, b)
        // if (t1===null || t2===null) {
        //     return null
        // }
        return subT(t1, t2)
    }
    if (a.tag === "TSuper") {
        if (equalType(a.type, b))
            return a
        if (equalType(a.sub, b))
            return b
        let t1 = ti(a.type, b)
        let t2 = ti(a.sub, b)
        return superT(t1, t2)
    }
    if (b.tag === "TSub") {
        if (equalType(a, b.type))
            return b
        if (equalType(a, b.super))
            return b
        // if (equalObjects(a, b.super))
        //     return b
        let t1 = ti(a, b.type)
        let t2 = ti(a, b.super)
        // if (t2.tag==="TVoid") {
        //     return t2
        // }
        return subT(t1, t2)
    }
    if (b.tag === "TSuper") {
        if (equalType(a, b.type))
            return b
        if (equalType(a, b.sub))
            return a
        let t1 = ti(a, b.type)
        let t2 = ti(a, b.sub)
        return superT(t1, t2)
    }

    if (a.tag === "TAny") return b
    if (b.tag === "TAny") return a
    if (a.tag === "TVoid") return voidT
    if (b.tag === "TVoid") return voidT


    if (a.tag === "TNil" && b.tag === "TNil") return nilT
    if (a.tag === "TBool" && b.tag === "TBool") return boolT
    if (a.tag === "TInt" && b.tag === "TInt") return intT
    if (a.tag === "TStr" && b.tag === "TStr") return strT
    if (a.tag === "TStr" && b.tag === "TChar") return charT
    if (a.tag === "TChar" && b.tag === "TStr") return charT
    if (a.tag === "TType" && b.tag === "TType") return typeT

    // TODO ? check for bounded-variation / regular-recursion before unrolling ?
    // TODO ? better to leave an intersection unreduced than fail to terminate ?
    let a1: Type = a
    if (a1.tag === "TRec") {
        a1 = unrollRecursiveType(a1)
    }
    let b1: Type = b
    if (b1.tag === "TRec") {
        b1 = unrollRecursiveType(b1)
    }

    if (a1.tag === "TPair" && b1.tag === "TPair") {
        // these void-tests are required for the type intersection used in matching case-expression patterns to work correctly
        // the intersection of { ["A", Int] | ["B", Str] } with { ["A", Any] } reduces to { [ "A", Int ] }
        let h = ti(a1.hd, b1.hd)
        if (h.tag === "TVoid") {
            return voidT
        }
        let t = ti(a1.tl, b1.tl)
        if (t.tag === "TVoid") {
            return voidT
        }
        return pairT(h, t)
    }

    // if (a1.tag === "TPair" && b1.tag === "TPair") {
    //     let h = tti(a1.hd, b1.hd)
    //     let t = tti(a1.tl, b1.tl)
    //     if (h === null || t === null) {
    //         console.log(`FAILED TO INTERSECT PAIRS`)
    //         console.log(`  A: ${showType2(a)}`)
    //         console.log(`  B: ${showType2(b)}`)
    //         return null
    //     }
    //     else if (h.tag === "TVoid" || t.tag === "TVoid") {
    //         // these void-tests are required for the type intersection used in matching case-expression patterns to work correctly
    //         // the intersection of { ["A", Int] | ["B", Str] } with { ["A", Any] } reduces to { [ "A", Int ] }
    //         return voidT
    //     }
    //     else {
    //         return pairT(h, t)
    //     }
    // }


    if (a1.tag === "TList" && b1.tag === "TList") {
        return listT(ti(typeElem(a), typeElem(b)))
    }

    if (a1.tag === "TList" && b1.tag === "TNil") return nilT
    if (a1.tag === "TNil" && b1.tag === "TList") return nilT

    if (a1.tag === "TPair" && b1.tag === "TNil") return voidT
    if (a1.tag === "TNil" && b1.tag === "TPair") return voidT

    // if (a.tag === "TFun" && b.tag === "TFun") {
    //     // TODO ? leave this unreduced ?
    //     // currently this throws away info, e.g:
    //     //   { {Int->Str} & {Str->Int} }
    //     // is more informative than
    //     //   { {Int|Str} -> {Str|Int} }
    //     if (!USE_AS_TYPES) {
    //         return funT(unionTypes(a.argType, b.argType), intersectTypes(a.resultType, b.resultType))
    //     }
    // }
    if (a.tag === "TFun" && b.tag === "TFun") {
        // return ruleT("intersectT", [a, b])
        if (a.argType.tag === "TVoid" && b.argType.tag === "TVoid") {
            return funT(voidT, intersectTypes(a.resultType, b.resultType))
        }
        else if (a.argType.tag === "TVoid") {
            return b
        }
        else if (b.argType.tag === "TVoid") {
            return a
        }
        else {
            // leave unreduced, the type may represent an overloaded function
            return ruleT("intersectT", [a, b])
        }
    }
    if (a.tag === "TSingle" && b.tag === "TSingle") {
        return a.val === b.val ? a : voidT
    }
    // TODO don't assume a TSingle is always a string
    // TODO handle alternative/arbitrary singleton types
    if (a.tag === "TSingle" && b.tag === "TStr") {
        return a
    }
    if (a.tag === "TStr" && b.tag === "TSingle") {
        return b
    }

    if (a.tag === "TPair" && b.tag === "TList") {
        return tti(a, pairT(b.elem, b))
    }
    if (a.tag === "TList" && b.tag === "TPair") {
        return tti(pairT(a.elem, a), b)
    }

    // these have been helpful in some situations (match in fe4a),
    // and seem benign.
    // if (a.tag === "TRule" && b.tag === "TPair") {
    //     return tti(pairT(typeHd(a),typeTl(a)), b)
    // }
    // if (a.tag === "TRule" && b.tag === "TList") {
    //     return tti(pairT(typeHd(a),typeTl(a)), pairT(b.elem, b))
    // }


    if (a.tag === "TRule" && b.tag === "TRule" && a.name === b.name) {
        switch (a.name) {
            case "domainT":
                // assert (a.args.length===1)
                return ruleT(a.name, [ti(a.args[0], b.args[0])])
        }
    }
    if (a1.tag === "TRule" && a1.name === "unionT") {
        // TODO ? is this safe, do we need to track void types ?
        // or else we risk Tl {[Void, Int]} not being Void but Int
        // i.e. we shouldn't be able to take the tail of a type which has a Void head
        return unionTypes(ti(a1.args[0], b), ti(a1.args[1], b))
    }

    if (b1.tag === "TRule" && b1.name === "unionT") {
        // TODO ? is this safe, do we need to track void types ?
        // or else we risk Tl {[Void, Int]} not being Void but Int
        // i.e. we shouldn't be able to take the tail of a type which has a Void head
        return unionTypes(ti(a, b1.args[0]), ti(a, b1.args[1]))
    }

    // we can count TSingle as disjoint here, as it will be if we reach this far
    let disjointTypes = ["TInt", "TBool", "TType", "TFun", "TStr", "TChar", "TSingle", "TNil"]
    if (disjointTypes.indexOf(a.tag) !== -1 && disjointTypes.indexOf(b.tag) !== -1 && a.tag !== b.tag) {
        return voidT
    }

    if (disjointTypes.indexOf(a.tag) !== -1 && b.tag === "TPair") {
        return voidT
    }
    if (a.tag === "TPair" && disjointTypes.indexOf(b.tag) !== -1) {
        return voidT
    }

    if (disjointTypes.indexOf(a.tag) !== -1 && b.tag === "TList") {
        return voidT
    }
    if (a.tag === "TList" && disjointTypes.indexOf(b.tag) !== -1) {
        return voidT
    }

    if (equalType(pairT(typeHd(a, true), typeTl(a, true)), b)) {
        return b
    }

    if (equalType(a, pairT(typeHd(b, true), typeTl(b, true)))) {
        return a
    }

    if (b.tag === "TRule" && b.name === "relcompT") {

        let b1: Type = b
        let bs: Type[] = []
        while (b1.tag === "TRule" && b1.name === "relcompT") {
            bs.push(b1.args[1])
            b1 = b1.args[0]
        }
        // if (b1.tag === "TAny") {

        let bUn = unionTypeList(bs)
        let abIn = intersectTypes(a, b1)
        // let aRc = typeRelComp(a, bUn)
        let aRc = typeRelComp(abIn, bUn)

        // console.log("INTERSECT NEG")
        // console.log(`  A: ${showType2(a)}`)
        // console.log(`  B: ${showType2(b)}`)
        // console.log(`  U: ${showType2(bUn)}`)
        // console.log(`  R: ${showType2(aRc)}`)

        return aRc
        // }

        // if (equalType(a, b1)) {
        //     return b
        // }

    }

    // // { A & { B0 \ B1 } }
    // if (b.tag === "TRule" && b.name === "relcompT" && equalType(a, b.args[0])) {
    //     // TODO look for nested relcomp
    //     // { A & { { { B0 \ B1 } \ B2 } \ B3 } }
    //     return b
    // }

    // { A & [(Hd A) <: B, ...Any] } --> { A <: [B, ...Any] }
    if (a.tag === "TVar" && b.tag === "TPair" && b.tl.tag === "TAny" && b.hd.tag === "TSub") {
        if (ttiIsFalse(tiStructuralRelComp(typeHd(a), b.hd.type))) {
            return subT(a, pairT(b.hd.super, anyT))
        }
    }


    // return ruleT("intersectT", [a, b])
    return null
}

export function intersectTypes(a: Type, b: Type): Type {
    // let [ok, ty] = reduceTypeRule("intersectT", [a, b])
    let [ok, ty] = reduceTypeRule("intersectT", [a, b])
    return ty
    // return intersectTypes1(a, b)
}

// export function intersectTypes3(a: Type, b: Type): Type {
//     return typeRelComp(a, typeRelComp(anyT, b))
// }

export function typeIntersect0(a: Type, b: Type): Type {
    // return ruleT("intersectT", [a, b])
    return ruleT("intersectT", [a, b])
}


function intersectTypeList(args: Type[]): Type {
    let result = anyT
    args.forEach(arg => {
        result = intersectTypes(result, arg)
    })
    return result
}






//#endregion



//#region Utils (external)
// Utilities used by code in other files





// export function countTypeErrors(exp: ExprTree<{ tc?: string | null }>): { [_: string]: number } {
//     let result: { [_: string]: number } = { ok: 0, error: 0, unproven: 0 }
//     let call = (field: any, exp: ex.ExprTree<{}>) => {
//         if (exp instanceof Array) {
//             return
//         }
//         let tc: string = (exp as ExprType).tc as string
//         if (tc !== undefined) {
//             if (result[tc] === undefined)
//                 result[tc] = 0
//             result[tc] += 1
//             let loc = (exp as Expr).loc
//             if (loc === undefined || loc === null) {
//                 loc = tk.nullLocation
//             }
//             if (tc === "error") {
//                 console.log(`TypeCheck Error at ${tk.showLoc(loc)}`)
//             }
//             if (tc === "unproven") {
//                 console.log(`TypeCheck Unproven  at ${tk.showLoc(loc)}`)
//             }
//         }
//     }
//     ex.visitAll("", exp, null, call)
//     return result
// }

export function countTypeErrors(exp: ExprTree<Expr<{ tc?: TypeCheckResult | null }>>): { [K in TypeCheckResult]: number } {
    let result = { ok: 0, error: 0, unproven: 0 }
    let call = (field: any, exp: ExprTree<Expr<{ tc?: TypeCheckResult | null }>>) => {
        if (exp instanceof Array) {
            return
        }
        let tc = exp.tc
        if (tc !== undefined && tc !== null) {
            if (result[tc] === undefined)
                result[tc] = 0
            result[tc] += 1
            let loc = (exp as ExprLoc).loc
            if (loc === undefined || loc === null) {
                loc = nilLoc
            }
            if (tc === "error") {
                console.log(`TypeCheck Error at ${showLoc(loc)}`)
            }
            if (tc === "unproven") {
                console.log(`TypeCheck Unproven  at ${showLoc(loc)}`)
            }
        }
    }
    visitAll("", exp, null, call)
    return result
}


export function collectTypeErrors<T>(exp: ExprTree<T>): Expr<T>[] {
    let result: Expr<T>[] = []
    let call = (field: any, exp: ExprTree<T>) => {
        if (exp instanceof Array) {
            return
        }
        let tc: string = (exp as ExprType).tc as string
        // if (tc === "error" || (tc==="unknown" && ! IGNORE_UNPROVEN_TYPE_ERRORS)) {
        // if (tc === "error" || (tc === "unproven" && !ignoreUnproven)) {
        if (tc === "error" || tc === "unproven") {
            let loc = (exp as ExprLoc).loc
            if (loc === undefined) {
                loc = nilLoc
            }
            result.push(exp)
        }
    }
    // ex.visitAll("", exp, call, null)
    visitAll("", exp, null, call)
    return result
}


export function collectUnionTypes(ty: Type, result: Type[]): void {
    let cut = collectUnionTypes
    if (ty.tag === "TRule" && ty.name === "unionT") {
        cut(ty.args[0], result)
        cut(ty.args[1], result)
    }
    else {
        result.push(ty)
    }
}

export function collectIntersectTypes(ty: Type, result: Type[]): void {
    let cit = collectIntersectTypes
    if (ty.tag === "TRule" && ty.name === "intersectT") {
        cit(ty.args[0], result)
        cit(ty.args[1], result)
    }
    else {
        result.push(ty)
    }
}

export function disjoinTypes0(tys: Type[]): Type[] {
    let result: Type[] = []
    tys.forEach(ty1 => {
        for (let i = 0; i !== result.length; i++) {
            let ty2 = result[i]
            if (!ttiIsFalse(tiStructuralIntersect(ty1, ty2))) {
                if (equalType(ty1, ty2)) {
                    // We've found a duplicate.
                    return
                }
                else {
                    if (ttiIsFalse(tiStructuralRelComp(ty1, ty2))) {
                        // The new type adds nothing to this existing type.
                        return
                    }
                    else if (ttiIsFalse(tiStructuralRelComp(ty2, ty1))) {
                        // The new type subsumes an existing type.
                        // Replace the existing type.
                        result[i] = ty1
                        return
                    }
                    else {
                        // There's a potential non-equal and non-subsumed overlap.
                        // We could compute a non-union least-upper-bound, but
                        //   just replace the type with Any for now
                        result[i] = anyT
                        return
                    }
                }
            }
        }
        // If we get here, then ty1 is a disjoint from all the types currently in result.
        result.push(ty1)
    })
    return result
}


export function disjoinTypes(tys: Type[]): Type[] {
    let prevLength
    do {
        prevLength = tys.length
        tys = disjoinTypes0(tys)
    }
    while (tys.length < prevLength)
    return tys
}

export function typeRemoveSuperSub(ty: Type): Type {
    let trss = typeRemoveSuperSub
    switch (ty.tag) {
        case "TSub":
        case "TSuper":
            return trss(ty.type)
        case "TVoid":
        case "TNil":
        case "TBool":
        case "TInt":
        case "TChar":
        case "TStr":
        case "TAny":
        case "TType":
        case "TSingle":
        case "TVar":
        case "TUnknown":
        case "TError":
            return ty
        case "TPair":
            return pairT(trss(ty.hd), trss(ty.tl))
        case "TList":
            return listT(trss(ty.elem))
        case "TFun":
            return funT(trss(ty.argType), trss(ty.resultType))
        case "TAs":
            return asT(ty.name, trss(ty.type))
        case "TRec":
        case "TSelf":
            return recT(ty.name, trss(ty.body))
        case "TRule":
            return ruleT(ty.name, ty.args.map(t => trss(t)))
        case "TTerm":
            return termT(ty.term, trss(ty.type))
        case "TTermVar":
            return termVarT(ty.varName, trss(ty.type))
        case "TSingleType":
            return singleTypeT(trss(ty.val))
        case "TSingleTermVar":
            return singleTermVarT(ty.varName)
        default:
            throw new Error(`missing case $ {ty.tag}`)
    }
}

export function showTypeWithoutSubSuperBounds1(ty: Type): string {
    let ty2 = typeRemoveSuperSub(ty)
    let result = showType2(ty2)
    return result
}

export function showTypeWithoutSubSuperBounds(ty: Type): string {
    let next = (t: Type): Type => {
        switch (t.tag) {
            case "TSub":
            case "TSuper": {
                return next(t.type)
            }
            default: {
                return t
            }
        }
    }
    let result = showType2(ty, next, false)
    return result
}

//#endregion




