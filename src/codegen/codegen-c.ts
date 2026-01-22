import { assert } from "../utils/assert.js"
import { equalObjects } from "../utils/equal-objects.js"
import { DeclTypeBidir, ExprTypeBidir, VarSet, VarTypeBidir, eList, eDatum, exprFreeVars } from "../syntax/expr.js"
import { locContains, showLoc } from "../syntax/token.js"
import { Type, typeHd, typeTl, typeDom, anyT, typeRng, ttiIsFalse, tiStructuralRelComp, strT, collectUnionTypes, typeIntersect0, pairT, intersectTypes, evalTypeAnnot, disjoinTypes, typeContainsTypeVar, applyTypes, typeFreeVars, substType, voidT, knownInhabited, collectIntersectTypes, funT, showType2, typeTupleMap, singleT } from "../tree/types.js"
import { MemoData, MemoMap, mk_MemoData } from "../tree/memoize.js"
import { isAlphanum, isAlphanumUS } from "../syntax/scan.js"
import { Env, evalNode } from "../tree/eval.js"

// const USE_MIXINS = false
const USE_MIXINS = true

const USE_UNBOXED_PARTIAL_ARGS = false
// const USE_UNBOXED_PARTIAL_ARGS = true

// const MAX_COMMENT_LENGTH = 80
const MAX_COMMENT_LENGTH = 200;


// TODO ? add declared stack depth to the CVar variable ?
type CVarT<T> =
    T & { tag: "CVar", name: string, repr?: CRepr, value?: CValue, depth: number }
type CVar = CVarT<{}>

export type CExprT<T> =
    CVarT<T>
    | T & { tag: "CCode", code: string }
    | T & { tag: "CInt", value: number }
    | T & { tag: "CStr", value: string }
    | T & { tag: "COp", opName: string, args: CExprT<T>[] }
    | T & { tag: "CCast", ty: CType, expr: CExprT<T> }
    | T & { tag: "CField", aggregate: CExprT<T>, field: string }
    | T & { tag: "CList", elems: CExprT<T>[] }
    | T & { tag: "CCall", func: CExprT<T>, args: CExprT<T>[] }
    | T & { tag: "CCommentExpr", comment: string, expr: CExprT<T> }
    | T & { tag: "CParens", expr: CExprT<T> }
    | T & { tag: "CAggregate", elems: CExprT<T>[], isConst: boolean, isVertical: boolean }
export type CExpr = CExprT<{}>

export type CStmtT<T> =
    // T & { tag: "CLet", name: CVarT<T>, defn: CExprT<T> }
    | T & { tag: "CVarDecl", ty: CType, var: CVarT<T>, defn?: CExprT<T> }
    | T & { tag: "CLetUndefined", names: CVarT<T>[] }
    | T & { tag: "CExprStmt", expr: CExprT<T> }
    | T & { tag: "CBlock", stmts: CStmtsT<T> }
    | T & { tag: "CIf", cond: CExprT<T>, then: CStmtsT<T> }
    | T & { tag: "CIfElse", cond: CExprT<T>, then: CStmtsT<T>, else: CStmtsT<T> }
    | T & { tag: "CWhile", cond: CExprT<T>, body: CStmtsT<T> }
    | T & { tag: "CDoWhile", body: CStmtsT<T>, cond: CExprT<T> }
    | T & { tag: "CReturn", expr: CExprT<T> }
    | T & { tag: "CCommentStmt", comment: string }
    | T & { tag: "CBreak" }
    | T & { tag: "CContinue" }
    | T & { tag: "CLabel", label: string }
    | T & { tag: "CGoto", label: string }
type CStmtsT<T> = CStmtT<T>[]
export type CStmt = CStmtT<{}>
type CStmts = CStmt[]
type CStmtCategory = "Usr" | "AuxH" | "AuxC"
type CCatStmt = [CStmtCategory, CStmt]
type CCatStmts = CCatStmt[]

type CDeclT<T> =
    // T & { tag: "CLet", name: string, value: CExprT<T> }
    | T & { tag: "CVarDecl", ty: CType, var: CVarT<T>, defn?: CExprT<T> }
    | T & { tag: "CFunc2", funcVar: CVar, dom: [string, CType][], cod: CType, body: CStmtsT<T> }
    | T & { tag: "CCommentStmt", comment: string }
    | T & { tag: "CStructDecl", name: string, fields: [string, CType][] }
    | T & { tag: "CTypeDefFuncPtr", name: CType, domRs: CType[], codR: CType }
    | T & { tag: "CTypeDef", name: CType, defn: CType }
    | T & { tag: "CExtern", ty: CType, name: string }
type CDecl = CDeclT<{}>
type CDecls = CDecl[]

type CType =
    { tag: "TName", name: string }
    | { tag: "TPtr", ty: CType }
    | { tag: "TArray", ty: CType, len?: number }
    | { tag: "TConst", ty: CType }
    | { tag: "TUnion", fields: [string, CType][] }
type CTypeName = CType & { tag: "TName" }

function tName(name: string): CTypeName { return { tag: "TName", name: name } }
function tPtr(ty: CType): CType { return { tag: "TPtr", ty: ty } }
function tArray(ty: CType, len?: number): CType { return { tag: "TArray", ty: ty, len: len } }
function tConst(ty: CType): CType { return { tag: "TConst", ty: ty } }
function tUnion(fields: [string, CType][]): CType { return { tag: "TUnion", fields: fields } }

let tAny: CType = tName("Any")
let tStr: CType = tName("Str")
let tType: CType = tName("Type")

let tVoid = tName("void")

let tVoidPtr      /**/ = /**/        tPtr(tVoid)
let tVoidPtrConst /**/ = /**/ tConst(tPtr(tVoid))

let tVoidConst         /**/ = /**/             tConst(tVoid)
let tVoidConstPtr      /**/ = /**/        tPtr(tConst(tVoid))
let tVoidConstPtrConst /**/ = /**/ tConst(tPtr(tConst(tVoid)))



type CReprFunc = {
    tag: "Func",
    funcCTy: CType,
    dom: CRepr[],
    cod: CRepr
    reprC: CExprRepr
}
type CReprClos = {
    tag: "Clos",
    closCTy: CType,
    funcCTy: CType,
    dom: CRepr[],
    cod: CRepr
    reprC: CExprRepr
}
type CReprFuncNull = {
    tag: "FuncNull",
    funcCTy: CType,
    dom: CRepr[],
    cod: CRepr
    reprC: CExprRepr
}

type CRepr =
    | { tag: "Any" }
    | CReprFunc
    | CReprClos
    | CReprFuncNull
    | { tag: "Tuple"      /**/, tupleCTy: CType     /**/, reprC: CExpr      /**/, elemReprs: CRepr[]   /**/ }
    | { tag: "List"       /**/, listCType: CType    /**/, reprC: CExpr      /**/, elemRepr: CRepr      /**/ }
    | { tag: "Maybe"      /**/, maybeCType: CType   /**/, reprC: CVarRepr   /**/, elemRepr: CRepr      /**/ }
    | { tag: "Yes"        /**/, yesCType: CType     /**/, reprC: CExpr      /**/, elemRepr: CRepr      /**/ }
    | { tag: "Single"     /**/, singleCType: CType  /**/, reprC: CExpr      /**/, value: string        /**/ }
    | { tag: "Union"      /**/, unionCType: CType   /**/, reprC: CExpr      /**/, altReprs: CRepr[]    /**/ }
    | { tag: "Intersect"  /**/, cType: CType        /**/, reprC: CExpr      /**/, reprs: CRepr[]       /**/ }
    | { tag: "Ptr"        /**/, ptrCType: CType     /**/, reprC: CVar       /**/, feTy: Type, destCType: CType   /**/ }
    | { tag: "TupleTail" }
    | { tag: "Nil" }
    | { tag: "Bool" }
    | { tag: "Int" }
    | { tag: "Str" }
    | { tag: "Char" }
    | { tag: "Type" }
    | { tag: "None" }
    | { tag: "Object" }


type CReprList = CRepr & { tag: "List" }
type CReprTuple = CRepr & { tag: "Tuple" }
type CReprYes = CRepr & { tag: "Yes" }
type CReprMaybe = CRepr & { tag: "Maybe" }
type CReprUnion = CRepr & { tag: "Union" }
type CReprIntersect = CRepr & { tag: "Intersect" }
type CReprPtr = CRepr & { tag: "Ptr" }
type CReprSingle = CRepr & { tag: "Single" }


let rAny: CRepr = { tag: "Any" }
let rNo: CRepr = { tag: "Nil" }
let rBool: CRepr = { tag: "Bool" }
let rInt: CRepr = { tag: "Int" }
let rStr: CRepr = { tag: "Str" }
let rChar: CRepr = { tag: "Char" }
let rType: CRepr = { tag: "Type" }
let rNone: CRepr = { tag: "None" }
let rTupleTail: CRepr = { tag: "TupleTail" }
let rObject: CRepr = { tag: "Object" }


function rFunc(ty: CType, domRs: CRepr[], codR: CRepr, reprC: CExprRepr): CReprFunc {
    return { tag: "Func", funcCTy: ty, dom: domRs, cod: codR, reprC: reprC }
}
function rClos(funcCTy: CType, closCTy: CType, domRs: CRepr[], codR: CRepr, reprC: CExprRepr): CReprClos {
    return { tag: "Clos", funcCTy: funcCTy, closCTy: closCTy, dom: domRs, cod: codR, reprC: reprC }
}
function rFuncNull(funcCTy: CType, domRs: CRepr[], codR: CRepr, reprC: CExprRepr): CReprFuncNull {
    return { tag: "FuncNull", funcCTy: funcCTy, dom: domRs, cod: codR, reprC: reprC }
}
function rTuple(ty: CType, reprC: CExpr, elems: CRepr[]): CReprTuple {
    return { tag: "Tuple", tupleCTy: ty, reprC: reprC, elemReprs: elems }
}
function rList(ty: CType, listReprExpr: CExpr, elemReprExpr: CExpr, elem: CRepr): CReprList {
    return { tag: "List", listCType: ty, reprC: listReprExpr, elemRepr: elem }
}
function rMaybe(ty: CType, elemRepr: CRepr, maybeRreprC: CVarRepr): CReprMaybe {
    return { tag: "Maybe", maybeCType: ty, elemRepr: elemRepr, reprC: maybeRreprC }
}
function rYes(ty: CType, elemRepr: CRepr, yesReprCExp: CExprOrCExprRepr): CReprYes {
    return { tag: "Yes", yesCType: ty, elemRepr: elemRepr, reprC: getExpr(yesReprCExp) }
}
function rUnion(ty: CType, unionReprExpr: CExpr, alts: CRepr[]): CReprUnion {
    return { tag: "Union", unionCType: ty, reprC: unionReprExpr, altReprs: alts }
}
function rPtr(ty: CType, ptrReprExpr: CVar, feTy: Type, destCType: CType): CReprPtr {
    return { tag: "Ptr", ptrCType: ty, reprC: ptrReprExpr, feTy: feTy, destCType: destCType }
}
function rSingle(ty: CType, singleReprExpr: CExpr, value: string): CReprSingle {
    return { tag: "Single", singleCType: ty, reprC: singleReprExpr, value: value }
}

// a CValue is an instance of a CRepr
type CValue =
    { tag: "VVar", var: CVar }
    | { tag: "VExpr", expr: CExpr }
    | { tag: "VClos", directFunc: CVar, closFunc: CVar, env: CVar[] }
    | { tag: "VPrim", dynName: string, natName: string }

type CExprRepr = {
    tag: "CExprRepr",
    expr: CExpr,
    repr: CRepr,
    // value?: CValue
}

type CVarRepr = CExprRepr & { tag: "CExprRepr", expr: { tag: "CVar" }, value?: { tag: "VVar" } }

type CExprOrCExprRepr = CExpr | CExprRepr
type CVarOrCVarRepr = CVar | CVarRepr

function anyVar(varC: CVar): CVarRepr {
    return {
        tag: "CExprRepr",
        expr: varC,
        repr: rAny,
    }
}
function anyExpr(expr: CExpr): CExprRepr {
    if (expr.tag === "CVar") {
        return anyVar(expr)
    }
    return {
        tag: "CExprRepr",
        expr: expr,
        repr: rAny,
    }
}
function noneExpr(exprC: CExpr): CExprRepr {
    return {
        tag: "CExprRepr",
        expr: exprC,
        repr: rNone,
    }
}
function natExpr(repr: CRepr, exprC: CExpr): CExprRepr {
    return {
        tag: "CExprRepr",
        expr: exprC,
        repr: repr,
    }
}
function natVar(repr: CRepr, varC: CVar): CVarRepr {
    return {
        tag: "CExprRepr",
        expr: varC,
        repr: repr,
    }
}
function erPrim(cb: CBuilder, natName: string, domRs: CRepr[], codR: CRepr): CVarRepr {
    let repr = createFuncRepr(cb, domRs, codR)
    return {
        tag: "CExprRepr",
        expr: cb.namedVar(repr, natName).expr,
        repr: repr,
    }
}

function toAny(cb: CBuilder, er: CExprRepr): CExprRepr {
    return reprConvertToAny(cb, er)
}
function toRepr(cb: CBuilder, repr: CRepr, er: CExprRepr): CExprRepr {
    return reprConvert(cb, repr, er)
}

function toVar(cb: CBuilder, er: CExprRepr): CVarRepr {
    if (er.expr.tag === "CVar") {
        return natVar(er.repr, er.expr)
    }
    else {
        let newVar = cb.freshVar(er.repr)
        cb.addStmts([cDeclConst(newVar, er)])
        return newVar
    }
}

function toVarAtDepth(cb: CBuilder, er: CExprRepr, depth: number): CVar {
    if (er.expr.tag === "CVar") {
        return er.expr
    }
    else {
        let newVar = cb.freshVar(er.repr, undefined, depth)
        cb.insertStmts(depth, [cDeclConst(newVar, er)])
        return newVar.expr
    }
}

// type Annotation = {
//     annot?: {
//         annotate_HandlerMk?: CVarRepr
//     }
// }

// type Annot_FeExpr = {
//     exprFe?: ExprTypeBidir
// }
// 
// export type CEnv = { [name: string]: CVarRepr & Annot_FeExpr }
export type CEnv = { [name: string]: CVarRepr }



const memoData = mk_MemoData()



function reprToCType(repr: CRepr): CType {
    switch (repr.tag) {
        case "None":
            throw new Error("no Repr for None")
        case "Any":
            return tName("Any")
        case "Nil":
            return tName("No")
        case "Bool":
            return tName("bool")
        case "Int":
            return tName("int")
        case "Str":
            return tName("Str")
        case "Char":
            return tName("Char")
        case "Type":
            return tName("Type")
        case "TupleTail":
            return tName("TupleTail")
        case "Object":
            return tName("Object")
        case "Tuple":
            return repr.tupleCTy
        case "Clos":
            return repr.closCTy
        case "FuncNull":
            return repr.funcCTy
        case "Func":
            return repr.funcCTy
        case "List":
            return repr.listCType
        case "Yes":
            return repr.yesCType
        case "Maybe":
            return repr.maybeCType
        case "Union":
            return repr.unionCType
        case "Ptr":
            return repr.ptrCType
        case "Single":
            return repr.singleCType
        default:
            throw new Error("missing case")
    }
}

function reprToReprExpr(repr: CRepr): CExpr {
    switch (repr.tag) {
        case "None":
            throw new Error("no ReprExpr for 'None'")
        case "Nil":
            return cCode("&noRepr.base")
        case "Bool":
            return cCode("&boolRepr.base")
        case "Int":
            return cCode("&intRepr.base")
        case "Str":
            return cCode("&strRepr.base")
        case "Char":
            return cCode("&charRepr.base")
        case "Type":
            return cCode("&typeRepr.base")
        case "Object":
            return cCode("&objectRepr.base")
        case "Tuple":
            return cOp("&_", [cField(repr.reprC, "base")])
        case "TupleTail":
            return cCode("&tupleTailRepr.base")
        case "List":
            return repr.reprC
        case "Maybe":
            return cOp("&_", [cField(repr.reprC, "base")])
        case "Yes":
            // a "yes" value uses the same C type as its element,
            // we need to keep careful track of the Repr 
            // so as not to confuse the "yes" for its element
            return cOp("&_", [cField(repr.reprC, "base")])
        case "Clos":
        case "Func":
        case "FuncNull":
            return cOp("&_", [cField(repr.reprC.expr, "base")])
        case "Any":
            return cCode("&anyRepr.base")
        case "Union":
            return cOp("&_", [cField(repr.reprC, "base")])
        case "Ptr":
            return cOp("&_", [cField(repr.reprC, "base")])
        case "Single":
            return cOp("&_", [cField(repr.reprC, "base")])
        default:
            throw new Error(`missing case $ {repr.tag}`)
    }
}


function reprConvertFromAny(cb: CBuilder, to: CRepr, exp0: CExprOrCExprRepr): CExprRepr {
    let exp: CExpr
    if (exp0.tag === "CExprRepr") {
        if (exp0.repr.tag !== "Any") {
            throw new Error("Any Repr expected")
        }
        exp = exp0.expr
    }
    else {
        exp = exp0
    }
    switch (to.tag) {
        case "Any":
            return anyExpr(exp)
        case "Bool":
            return natExpr(to, cCall(cCode("any_to_bool"), [exp]))
        case "Int":
            return natExpr(to, cCall(cCode("any_to_int"), [exp]))
        case "Str":
            return natExpr(to, cCall(cCode("any_to_str"), [exp]))
        case "Char":
            return natExpr(to, cCall(cCode("any_to_char"), [exp]))
        case "Single": {
            let voidPtr = cCall(cCode("any_to_value_ptr"), [exp, cOp("&_", [cOp(".", [to.reprC, cCode("base")])])])
            let valC = cOp("*_", [cCast(tPtr(reprToCType(to)), voidPtr)])
            return natExpr(to, valC)
        }
        case "Nil": {
            let nilC = cCall(cCode("any_to_nil"), [exp])
            return natExpr(to, nilC)
        }
        case "Type":
            return natExpr(to, cCall(cCode("any_to_type"), [exp]))
        case "Tuple": {
            let tupleR = createTupleRepr(cb, to.elemReprs)
            let tupleVoidPtr = cCall(cCode("any_to_tuple"), [cOp("&_", [tupleR.reprC]), exp])
            let tupleVal = cOp("*_", [cCast(tPtr(tupleR.tupleCTy), tupleVoidPtr)])
            return natExpr(to, tupleVal)
        }
        case "List": {
            let listRepr: CReprList = createListRepr(cb, to.elemRepr)
            let listExpr = cCast(listRepr.listCType, cAggregate([cCall(cCode("any_to_list"), [reprToReprExpr(to.elemRepr), exp])]))
            return natExpr(to, listExpr)
        }
        case "Yes": {
            let yesVal = reprConvertFromAny(cb, to.elemRepr, cCall(cCode("any_head"), [exp]))
            return yesVal
        }
        case "Maybe": {
            let tupleVoidPtr = cCall(cCode("any_to_value_ptr"), [exp, cOp("&_", [cOp(".", [to.reprC, cCode("base")])])])
            let valC = cOp("*_", [cCast(tPtr(reprToCType(to)), tupleVoidPtr)])
            return natExpr(to, valC)
        }
        // case "Func": {
        //     throw new Error("impossible")
        // }
        case "Clos": {
            createClosRepr(cb, to.dom, to.cod)
            let closEnv = cCall(cCode("any_func_to_clos_env"), [exp])
            let closExpr = cCast(to.closCTy, cAggregate([cOp(".", [to.reprC, cCode("apply_ds")]), closEnv]))
            return natExpr(to, closExpr)
        }
        case "Union": {
            let unionVar = cb.freshVar(to)
            cb.addStmts([cDeclVarUndefined(unionVar)])
            cb.addStmts([cExprStmt(cCall(cCode("any_to_union"), [exp, cAddrOf(to.reprC), cAddrOf(unionVar)]))])
            return unionVar
        }
        case "Ptr": {
            let recRepr = cb.memoMaps.recBodyReprMemo.get(to.feTy)
            if (recRepr === undefined) {
                throw new Error("failed to find repr for pointer to recursive type")
            }
            let a = reprConvertFromAny(cb, recRepr, exp)
            let a2 = toVar(cb, a)
            let b = cCall(cCode("mallocValue"), [reprToReprExpr(recRepr), cAddrOf(a2)])
            let c = cCast(reprToCType(to), b)
            return natExpr(to, c)
        }
        case "Object": {
            let voidPtr = cCall(cCode("any_to_value_ptr"), [exp, reprToReprExpr(to)])
            let valC = cOp("*_", [cCast(tPtr(reprToCType(to)), voidPtr)])
            return natExpr(to, valC)
        }

        default:
            throw new Error(`unhandled repr conversion Any -> (${JSON.stringify(to)})`)
    }
}

function reprConvertToAny(cb: CBuilder, exp: CExprRepr): CExprRepr {
    let from = exp.repr
    switch (from.tag) {
        case "None":
            throw new Error("cannot convert None Repr")
        case "Any":
            return exp
        case "Nil":
            return anyExpr(cCall(cCode("any_from_nil"), [exp]))
        case "Bool":
            return anyExpr(cCall(cCode("any_from_bool"), [exp]))
        case "Int":
            return anyExpr(cCall(cCode("any_from_int"), [exp]))
        case "Str":
            return anyExpr(cCall(cCode("any_from_str"), [exp]))
        case "Char":
            return anyExpr(cCall(cCode("any_from_value"), [reprToReprExpr(from), cAddrOf(toVar(cb, exp))]))
        case "Single":
            return anyExpr(cCall(cCode("any_from_str"), [cField(from.reprC, "value")]))
        case "Type":
            return anyExpr(cCall(cCode("any_from_type"), [exp]))
        case "Func": {
            let funcRepr = createFuncRepr(cb, from.dom, from.cod)
            let anyFunc = cCall(cCode("any_from_func"), [cAddrOf(funcRepr.reprC), exp])
            return anyExpr(anyFunc)
        }
        case "Clos": {
            let funcRepr = createClosRepr(cb, from.dom, from.cod)
            let clos = toVar(cb, exp)
            let anyFunc = cCall(cCode("any_from_clos"), [cAddrOf(funcRepr.reprC), cField(clos, "func"), cField(clos, "env")])
            return anyExpr(anyFunc)
        }
        case "FuncNull": {
            let funcNullRepr = createFuncNullRepr(cb, from.dom, from.cod)
            let anyFunc = cCall(cCode("any_from_func_null"), [cAddrOf(funcNullRepr.reprC), exp])
            return anyExpr(anyFunc)
        }
        case "Tuple": {
            let tupleR = createTupleRepr(cb, from.elemReprs);
            let reprC = cOp("&_", [tupleR.reprC]);
            let expVar = exp
            if (expVar.expr.tag !== "CVar") {
                expVar = toVar(cb, exp)
            }
            let data = cOp("&_", [expVar])
            return anyExpr(cCall(cCode("any_from_tuple"), [reprC, data]))
        }
        case "List": {
            let listRepr = createListRepr(cb, from.elemRepr);
            let repr = reprToReprExpr(listRepr)
            let data = cOp(".", [exp, cCode("elems")])
            return anyExpr(cCall(cCode("any_from_list"), [repr, data]))
        }
        case "Yes": {
            // let yesRepr = createYesRepr(cb, from.elemRepr)
            // let repr = cAddrOf(yesRepr.reprC)
            let repr = cAddrOf(from.reprC)
            return anyExpr(cCall(cCode("any_from_yes"), [repr, cAddrOf(toVar(cb, exp))]))
        }
        case "Maybe": {
            let maybeRepr = createMaybeRepr(cb, from)
            let repr = cAddrOf(maybeRepr.reprC)
            return anyExpr(cCall(cCode("any_from_maybe"), [repr, cAddrOf(toVar(cb, exp))]))
        }
        case "Union": {
            // let unionRepr = createUnionRepr(cb, from)
            // let repr = cAddrOf(from.reprC)
            // return anyExpr(cCall(cCode("any_from_union"), [repr, cAddrOf(toVar(cb, exp))]))            
            let repr = reprToReprExpr(from)
            return anyExpr(cCall(cCode("any_from_value"), [repr, cAddrOf(toVar(cb, exp))]))
        }
        case "Ptr": {
            let repr = cb.memoMaps.recBodyReprMemo.get(from.feTy)
            if (repr === undefined) {
                throw new Error("failed to find repr for pointer to recursive type")
            }
            let a = natExpr(repr, cOp("*_", [exp]))
            let b = reprConvertToAny(cb, a)
            return b
        }
        case "Object":
        case "TupleTail": {
            let repr = reprToReprExpr(from)
            return anyExpr(cCall(cCode("any_from_value"), [repr, cAddrOf(toVar(cb, exp))]))
        }
        default:
            throw new Error(`unhandled repr conversion (${JSON.stringify(from)}) -> Any`)
    }
}

function reprConvert(cb: CBuilder, to: CRepr, exp: CExprRepr): CExprRepr {
    let from = exp.repr
    if (equalObjects(from, to)) {
        return exp
    }
    if (to.tag === "List" && to.elemRepr.tag === "Any") {
        cb.addStmts([cCommentStmt("toRepr List Any")])
    }
    if (from.tag === "Any") {
        return reprConvertFromAny(cb, to, exp)
    }
    else if (to.tag === "Any") {
        return reprConvertToAny(cb, exp)
    }
    // if (from.tag === "Tuple" && to.tag === "Tuple") {
    //     // This can happen when using a narrow type in a broader context,
    //     //   such as using { [Int, Bool] } where { [Any, Any] } is expected.
    //     // This doesn't currently happen very often, 
    //     //   but could be made more efficient than this 
    //     //   over dynamifying implementation
    //     // console.log("REPR CONVERSION: TUPLE -> TUPLE")
    //     let exp2 = reprConvertToDyn(cb, exp);
    //     let exp3 = reprConvertFromDyn(cb, to, exp2)
    //     return exp3
    // }

    // else if (from.tag === "Func" && to.tag === "Clos") {
    //     // TODO ? create a conversion function so that functions can be used where a closure is permitted/expected ?
    //     // TODO we can achieve the same thing (less efficiently) by boxing the function (as a boxed closure) and unboxing a closure
    //     let funcRef = cCall(cCode("adapt_function3"), [cOp("&_", [from.reprC]), exp])
    //     let closVal = cCast(to.closCTy, cAggregate([cOp(".", [to.reprC, cCode("funcAdaptorInv")]), funcRef]))
    //     return natExpr(to, closVal)
    // }

    else if (from.tag === "Yes" && to.tag === "Maybe") {
        let elemFrR = reprTupleProjection(cb, from, 0)!
        let elemToR = reprTupleProjection(cb, to, 0)!
        let elemER = reprConvert(cb, elemToR, natExpr(elemFrR, exp.expr))
        let mbVal = cCast(to.maybeCType, cAggregate([cCode("true"), elemER]))
        return natExpr(to, mbVal)
    }
    else if (from.tag === "Nil" && to.tag === "Maybe") {
        // we make no use of the exp.expr here,
        // if we want to maintain a connection between values returned 
        // and computations performed, we should output something indicating
        // that exp.expr is being consumed here.
        // that is: which particular "no" are we using to construct this "maybe" ?
        let mbVal = cCast(to.maybeCType, cAggregate([cCode("false")]))
        return natExpr(to, mbVal)
    }
    // else if (to.tag === "Nil") {
    //     // we make no use of the exp.expr here (or even expr.repr),
    //     // if we want to maintain a connection between values returned 
    //     // and computations performed, we should output something indicating
    //     // that exp.expr is being consumed here
    //     let noVal = reprConvertFromNil(cb, to)
    //     return noVal
    // }
    else if (from.tag === "Single" && to.tag === "Str") {
        return natExpr(to, cOp(".", [from.reprC, cCode("value")]))
    }
    else if (to.tag === "Union") {
        for (let i = 0; i != to.altReprs.length; i++) {
            if (equalObjects(from, to.altReprs[i])) {
                cb.addStmts([cCommentStmt("Union constructed from statically known Repr")])
                let exp2 = toVar(cb, exp)
                // let un = cCast(reprToCType(to), cAggregate([cAggregate([cInt(i), cCall(cCode("mallocValue"), [reprToReprExpr(from), cAddrOf(exp2)])])]))
                let un = cCast(reprToCType(to), cAggregate([cInt(i), cCode(`.value._${i} = ${cShowExpr(exp2.expr)}`)]))
                return toVar(cb, natExpr(to, un))
            }
        }
        //if (from.tag === "Tuple") {
        //   call union_tuple
        // } else
        {
            cb.addStmts([cCommentStmt("Union constructed from dynamically known Repr")])
            let exp2 = reprConvertToAny(cb, exp);
            let exp3 = reprConvertFromAny(cb, to, exp2)
            return exp3
        }
    }
    else if (from.tag === "FuncNull" && to.tag === "Clos" && equalObjects([from.dom, from.cod], [to.dom, to.cod])) {
        // cb.addStmts([cCommentStmt("reprConvert: FuncNull -> Clos")])
        let clos = cCast(reprToCType(to), cAggregate([exp, cCode("NULL")]))
        return natExpr(to, clos)
    }

    let exp2 = reprConvertToAny(cb, exp);
    let exp3 = reprConvertFromAny(cb, to, exp2)
    return exp3

}

function reprSimplify(repr: CRepr): CRepr {
    return repr

    // TODO ? just return Any, check it works and that we can still dynamify everything
    // return rAny

    // This was used to limit the range of representations that might be encountered.
    // This was useful when new representation were added that couldn't yet be handled everywhere needed.
    // All current representations can now be handled in all places needed,
    //   so this simplification/dynamification is no longer needed
}


function reprParts(repr: CRepr): [number | null, CRepr[] | string] {
    switch (repr.tag) {
        case "Func":
            return [repr.dom.length, [...repr.dom, repr.cod]]
        case "Clos":
            return [repr.dom.length, [...repr.dom, repr.cod]]
        case "FuncNull":
            return [repr.dom.length, [...repr.dom, repr.cod]]
        case "Tuple":
            return [repr.elemReprs.length, repr.elemReprs]
        case "List":
            return [null, [repr.elemRepr]]
        case "Maybe":
            return [null, [repr.elemRepr]]
        case "Yes":
            return [null, [repr.elemRepr]]
        case "Union":
            return [repr.altReprs.length, repr.altReprs]
        case "Ptr":
            return [null, showType2(repr.feTy)]
        case "Single":
            return [null, repr.value]
        case "Any":
        case "Nil":
        case "Bool":
        case "Int":
        case "Str":
        case "Char":
        case "Type":
        case "None":
        case "Object":
            return [null, []]
        default:
            throw new Error("missing case")
    }
}


function reprsToTypeName(depth: number, label: string, arity: number | null, reprs: CRepr[] | string): string {
    label = label.slice(0, 2)
    if (typeof reprs === "string") {
        let singleValue = stringToNameHint(10, "", reprs)
        return [label, singleValue].join("_")
    }
    else if (depth === 0) {
        // let typeNames = reprs.map(r => cShowType(reprToCType(r)))
        let typeNames = reprs.map(r => r.tag === "None" ? "NONE" : cShowType(reprToCType(r)))
        let uniquePrefixes = typeNames.map(tn => tn.split("_")[0])
        if (arity !== null) {
            // label = `${label}_${arity}`
            label = `${label}${arity}`
        }
        let result = [label, ...uniquePrefixes].join("_")
        return result
    }
    else {
        let typeNames = reprs.map(r => {
            let [arity, parts] = reprParts(r)
            return reprsToTypeName(depth - 1, r.tag, arity, parts)
        })
        if (arity !== null) {
            // label = `${label}_${arity}`
            label = `${label}${arity}`
        }
        let result = [label, ...typeNames].join("_")
        return result
    }

}


// type AdaptedVars = MemoMap<CVar, CVarRepr>
type AdaptedVars = MemoMap<CVar, CVar>
type CCtx = [CStmts, CEnv, AdaptedVars]

type CBuilderMemoMaps = {
    funcReprMemo: MemoMap<[CRepr[], CRepr], CReprFunc>
    closReprMemo: MemoMap<[CRepr[], CRepr], CReprClos>
    funcNullReprMemo: MemoMap<[CRepr[], CRepr], CReprFuncNull>
    tupleReprMemo: MemoMap<CRepr[], CReprTuple>
    yesReprMemo: MemoMap<CRepr, CReprYes>
    maybeReprMemo: MemoMap<CRepr, CReprMaybe>
    listReprMemo: MemoMap<CRepr, CReprList>
    unionReprMemo: MemoMap<CRepr[], CReprUnion>
    intersectReprMemo: MemoMap<Type[], CReprIntersect>
    ptrReprMemo: MemoMap<CRepr, CReprPtr>
    recReprMemo: MemoMap<Type, CReprPtr>
    recBodyReprMemo: MemoMap<Type, CRepr>
    singleReprMemo: MemoMap<string, CReprSingle>

    adaptSD: MemoMap<[boolean, CRepr[], CRepr], CVarRepr>
    adaptDS: MemoMap<[boolean, CRepr[], CRepr], CVarRepr>

    reprMemo_cgDone: MemoMap<CRepr, null>
}

export class CBuilder {
    gNameSrc: number = 1
    gDecls: CDecl[] = []
    gInitStmts: CCatStmts = []
    ctxStack: CCtx[] = []
    declsAuxH: string[] = []
    declsAuxC: string[] = []
    declsUsr: string[] = []
    init: string[] = []
    envC: CEnv = {}
    staticStrings: { [_: string]: CVarRepr } = {}
    // globalAdaptedVars: AdaptedVars = memoData.mkMemoMap()
    pendingReprCodeGen: CRepr[] = []

    memoMaps: CBuilderMemoMaps = {
        // funcTypeMemo3: memoData.mkMemoMap(),
        funcReprMemo: memoData.mkMemoMap(),
        closReprMemo: memoData.mkMemoMap(),
        funcNullReprMemo: memoData.mkMemoMap(),
        tupleReprMemo: memoData.mkMemoMap(),
        yesReprMemo: memoData.mkMemoMap(),
        maybeReprMemo: memoData.mkMemoMap(),
        listReprMemo: memoData.mkMemoMap(),
        unionReprMemo: memoData.mkMemoMap(),
        intersectReprMemo: memoData.mkMemoMap(),
        ptrReprMemo: memoData.mkMemoMap(),
        recReprMemo: memoData.mkMemoMap(),
        recBodyReprMemo: memoData.mkMemoMap(),
        singleReprMemo: memoData.mkMemoMap(),

        adaptSD: memoData.mkMemoMap(),
        adaptDS: memoData.mkMemoMap(),

        reprMemo_cgDone: memoData.mkMemoMap(),

        // TODO ptrReprMemo - raw-pointers
        // TODO boxReprMemo - a resource header (ref-count) and a value
        // TODO refReprMemo - ref-counted/managed pointers, a ptr to a box
    }


    repr_ListStr: CRepr
    repr_MaybeChar: CRepr
    repr_ListChar: CRepr
    // repr_ObjectMk: CRepr
    repr_FunAnyAny: CRepr

    // TODO ? associate each CVar with a CCtx, so as to be able to retrospectively add new conversions for variable representations ?
    // TODO ? probably best to use an integer index into ctxStack, not a direct CCtx reference, so as to survive the cloning process
    // best to convert a native repr to a Dyn repr once early in a shallow context, 
    // rather than potentially many times later in deeper contexts (if-braches, while-loops),
    // so long as the conversion is cheap and benign (it might not be needed at all, depending on control flow)
    cVarStack: VarSet[] = [{}]
    constructor() {
        buildCommonString(this, commonStrings)

        this.repr_ListStr = createListRepr(this, rStr, "ListStr")
        this.repr_MaybeChar = createMaybeRepr(this, rChar, "MaybeChar")
        this.repr_ListChar = createListRepr(this, rChar, "ListChar")
        // this.repr_ObjectMk = createClosRepr(this, [rAny], rObject, "ObjectMk")
        this.repr_FunAnyAny = createClosRepr(this, [rAny], rAny, "FunAnyAny")
    }

    clone(): CBuilder {
        let that = new CBuilder()
        that.gNameSrc = this.gNameSrc
        that.gDecls = [...this.gDecls]
        that.gInitStmts = [...this.gInitStmts]
        that.declsAuxH = this.declsAuxH.slice()
        that.declsAuxC = this.declsAuxC.slice()
        that.declsUsr = this.declsUsr.slice()
        that.init = this.init.slice()
        that.envC = { ...this.envC }
        that.pendingReprCodeGen = this.pendingReprCodeGen.slice()

        // shallow-copy all the memo-maps
        let mmEntries: [string, MemoMap<any, any>][] = Object.entries(this.memoMaps)
        let mmEntries2: [string, MemoMap<any, any>][] = mmEntries.map(([k, v]) => [k, v.clone()])
        let mmObj: { [_: string]: MemoMap<any, any> } = Object.fromEntries(mmEntries2)
        that.memoMaps = mmObj as CBuilderMemoMaps

        that.cVarStack = this.cVarStack.map(vs => ({ ...vs }))
        return that
    }
    getEnv(): CEnv {
        return (this.ctxStack.length === 0)
            ? this.envC
            : this.ctxStack.at(-1)![1]
    }
    pushNewCtx() {
        let cEnv = { ...this.getEnv() }
        let adaptedVars: AdaptedVars = memoData.mkMemoMap()
        this.ctxStack.push([[], cEnv, adaptedVars])
        this.cVarStack.push({})
    }
    popCtx(): CCtx {
        let ctx = this.ctxStack.pop()
        if (ctx === undefined) {
            throw new Error(`context stack is empty`)
        }
        let poppedCVars = this.cVarStack.pop()
        if (poppedCVars === undefined) {
            throw new Error(`variable stack is empty`)
        }
        return ctx
    }
    // getAdaptedVars(depth: number): AdaptedVars {
    //     if (depth === 0) {
    //         return this.globalAdaptedVars
    //     }
    //     else {
    //         return this.ctxStack[depth - 1][2]
    //     }
    // }
    freshVar(repr: CRepr, nameHint?: string, depth?: number): CVarRepr {
        if (depth === undefined) {
            depth = this.cVarStack.length - 1
        }
        if (depth >= this.cVarStack.length) {
            throw new Error(`freshVar: invalid depth: depth(${depth}) >= this.cVarStack.length(${this.cVarStack.length})`)
        }
        let ext = (nameHint === undefined) ? "" : `_${nameHint}`
        let name = `u${this.gNameSrc}${ext}`
        // if (name === "u152") {
        //     console.log("BREAK")
        // }
        this.gNameSrc++
        let varC = cVar(name, depth)
        let vr = natVar(repr, varC)
        this.cVarStack[depth][name] = null
        return vr
    }
    namedVar(repr: CRepr, name: string): CVarRepr {
        let varC = cVar(name, this.ctxStack.length)
        let vr = natVar(repr, varC)
        this.cVarStack[this.cVarStack.length - 1][name] = null
        return vr
    }
    namedVars(repr: CRepr, name: string, num: number): CVarRepr[] {
        let vs: CVarRepr[] = []
        for (let i = 0; i !== num; i++) {
            vs.push(this.namedVar(repr, `${name}${i}`))
        }
        return vs
    }
    freshType(nameHint?: string): CTypeName {
        let ext = (nameHint === undefined) ? "" : nameHint.startsWith("_") ? nameHint : `_${nameHint}`
        let name = `U${this.gNameSrc}${ext}`
        this.gNameSrc++
        let ty = tName(name)
        return ty
    }
    namedType(name: string): CType {
        this.gNameSrc++
        let ty = tName(name)
        return ty
    }
    freshReprType(tag: string, arity: number | null, args: CRepr[] | string, name?: string): [CVarRepr, CType] {
        let ty
        if (name === undefined) {
            name = reprsToTypeName(1, tag, arity, args)
            ty = this.freshType(name)
        }
        else {
            if (name.startsWith("_")) {
                ty = this.freshType(name.slice(1))
            }
            else {
                ty = this.namedType(name)
            }
        }
        let typeName = cShowType(ty)
        // use the same name for the Repr metadata, but with a lower case first character
        // let varName = "u" + typeName.slice(1)
        let varName = typeName[0].toLowerCase() + typeName.slice(1)
        let v = this.namedVar(rNone, varName)
        return [v, ty]
    }
    isGlobal(): boolean {
        let result = this.ctxStack.length === 0
        return result
    }
    isGlobalVar(vr: CVarRepr): boolean {
        // TODO we can now just check the vr.expr.depth === 0
        return vr.expr.name in this.cVarStack[0]
    }
    isLocalVar(vr: CVarRepr): boolean {
        return vr.expr.name in this.cVarStack[this.cVarStack.length - 1]
    }
    getCatStrings(cat: CStmtCategory): string[] {
        switch (cat) {
            case "Usr":
                return this.declsUsr
            case "AuxH":
                return this.declsAuxH
            case "AuxC":
                return this.declsAuxC
            default:
                throw new Error("unknown category")
        }
    }
    printDecl(cat: CStmtCategory, decl: CDecl) {
        let outStrings = this.getCatStrings(cat)
        cShowDecl(outStrings, "", decl)
    }
    printInitStmt(stmt: CStmt) {
        cShowStmt(this.init, "", stmt)
    }
    addGlobalStmts(cat: CStmtCategory, newStmts: (CStmt | CDecl)[]): void {
        newStmts.forEach(s => {
            if (s.tag === "CCommentStmt") {
                this.gDecls.push(s)
                this.printDecl(cat, s)
                this.gInitStmts.push([cat, s])
                this.printInitStmt(s)
            }
            else if (s.tag === "CVarDecl" || s.tag == "CFunc2" || s.tag == "CStructDecl" || s.tag == "CTypeDefFuncPtr" || s.tag == "CTypeDef") {
                if (s.tag === "CVarDecl") {
                    this.addGlobalStmts("AuxH", [cExprStmt(cCode(`extern ${cShowType(s.ty, s.var.name)}`))])
                    this.printDecl("AuxH", cExtern(s.ty, s.var.name))
                }
                if (s.tag === "CVarDecl" && s.defn !== undefined) {
                    if (s.defn.tag === "CAggregate" && s.defn.isConst) {
                        this.printDecl(cat, s)
                        this.gDecls.push(s)
                    }
                    else {
                        let s1 = cVarDeclUndefined(s.ty, s.var)
                        let s2 = cAssignStmt(s.var, s.defn)
                        this.gDecls.push(s1)
                        this.gInitStmts.push([cat, s2])
                        this.printDecl(cat, s1)
                        let comment = ` // = ${cShowExpr(s.defn)}`
                        let outStrings = this.getCatStrings(cat)
                        outStrings[outStrings.length - 1] += comment
                        this.printInitStmt(s2)
                    }
                }
                else {
                    this.printDecl(cat, s)
                    this.gDecls.push(s)
                }
            }
            else {
                this.gInitStmts.push([cat, s as CStmt])
                this.printInitStmt(s as CStmt)
            }
        })
    }
    addStmts(newStmts: CStmts): void {
        if (this.ctxStack.length === 0) {
            this.addGlobalStmts("Usr", newStmts)
        }
        else {
            let currentStmts = this.ctxStack.at(-1)![0]
            currentStmts.push(...newStmts)
        }
    }
    insertStmts(depth: number, newStmts: CStmts): void {
        if (depth === 0) {
            this.addGlobalStmts("Usr", newStmts)
        }
        else {
            this.ctxStack[depth - 1][0].push(...newStmts)
        }
    }
    staticString(value: string): CVarRepr {
        if (value in this.staticStrings) {
            return this.staticStrings[value]
        }
        else {
            let nameHint = "STR_"
            for (let i = 0; i != value.length && i < 40; i++) {
                let ch = value.charAt(i)
                let code = ch.charCodeAt(0)
                if (code < 0 || code > 127) {
                    throw new Error(`unexpected non-ASCII character (${code}, ${JSON.stringify(ch)})`)
                }
                if (isAlphanumUS(ch)) {
                    nameHint = nameHint + ch
                }
            }
            let stringVar = this.freshVar(rStr, nameHint, 0)
            this.addGlobalStmts("AuxC", [cVarDecl(tConst(reprToCType(stringVar.repr)), stringVar, cAggregateConst([cCode("true"), cInt(value.length), cStr(value)]))])
            this.staticStrings[value] = stringVar
            return stringVar
        }

    }

}

function stringToNameHint(maxLen: number, unprintableChar: string, value: string): string {
    let nameHint = ""
    let prevPrintable = false
    for (let i = 0; i != value.length && i < maxLen; i++) {
        let ch = value.charAt(i)
        let code = ch.charCodeAt(0)
        if (code < 0 || code > 127) {
            throw new Error(`unexpected non-ASCII character (${code}, ${JSON.stringify(ch)})`)
        }
        let isPrintable = isAlphanum(ch)
        if (isPrintable) {
            nameHint += ch
        }
        else if (!isPrintable && prevPrintable) {
            nameHint += unprintableChar
        }
        prevPrintable = isPrintable
    }
    return nameHint
}

let commonStrings = [
    "break", "continue",
    "length", "get", "set", "extend", "slice", "snapshot",
    "persistent", "ephemeral", "copy"
]

function buildCommonString(cb: CBuilder, strs: string[]) {
    strs.forEach(s => {
        let strVar = cb.namedVar(rStr, `STR_${s}`)
        cb.staticStrings[s] = strVar
        cb.addGlobalStmts("AuxC", [cVarDecl(tConst(reprToCType(strVar.repr)), strVar, cAggregateConst([cCode("true"), cInt(s.length), cStr(s)]))])
    })
}

type CPrims = { [name: string]: CExprRepr }

export let primCb = new CBuilder()

let typeConsUnary = erPrim(primCb, "TypeConsUnary", [rType], rType)
let typeConsBinary = erPrim(primCb, "TypeConsBinary", [rType, rType], rType)
let typeConsFuncAny = erPrim(primCb, "TypeConsFuncAny", [rAny], rType)
let typeConsFuncStr = erPrim(primCb, "TypeConsFuncStr", [rStr], rType)

let prims: CPrims = {
    "(+)": erPrim(primCb, "add", [rInt, rInt], rInt),
    "(-)": erPrim(primCb, "sub", [rInt, rInt], rInt),
    "(*)": erPrim(primCb, "mul", [rInt, rInt], rInt),
    "(==)": erPrim(primCb, "any_eq", [rAny, rAny], rBool),
    "(>)": erPrim(primCb, "gt", [rInt, rInt], rBool),
    "(<)": erPrim(primCb, "lt", [rInt, rInt], rBool),
    "(>=)": erPrim(primCb, "gte", [rInt, rInt], rBool),
    "(<=)": erPrim(primCb, "lte", [rInt, rInt], rBool),
    "(|=)": erPrim(primCb, "any_noOrYesA", [rBool, rAny], rAny),  // "?="  noOrYesA { Bool -> A @ -> { No | (Yes A) } }
    "(|-)": erPrim(primCb, "any_noOrA", [rBool, rAny], rAny),     // "?-"  noOrA    { Bool -> A @ -> { No |      A  } }
    "(&&)": erPrim(primCb, "boolAnd", [rBool, rBool], rBool),
    "(||)": erPrim(primCb, "boolOr", [rBool, rBool], rBool),
    "break": erPrim(primCb, "any_break", [rAny], rAny),
    "continue": erPrim(primCb, "any_continue", [rAny], rAny),
    "Union": typeConsFuncAny,
    "if": erPrim(primCb, "any_if", [rBool, rAny], rAny),
    "if2": erPrim(primCb, "any_if", [rBool, rAny], rAny),
    "true": natExpr(rBool, cCode("true")),
    "false": natExpr(rBool, cCode("false")),
    "not": erPrim(primCb, "not_", [rBool], rBool),

    "Type": natExpr(rType, cCode("(Type){}")),
    "unionT": typeConsBinary,
    "intersectT": typeConsBinary,
    "relCompT": typeConsBinary,
    "Inverse": typeConsUnary,
    "InverseApply": typeConsBinary,
    "Fix": typeConsFuncAny,
    "Single": typeConsFuncStr,
    "TupleMap": typeConsBinary,
    "Fun": typeConsBinary,

    "Self": typeConsFuncAny,
    "SelfT": typeConsFuncAny,
    "Domain": typeConsUnary,
    "Codomain": typeConsUnary,

    "List": typeConsUnary,
    "Hd": typeConsUnary,
    "Tl": typeConsUnary,
    "Elem": typeConsUnary,

    "Void": natExpr(rType, cCode("(Type){}")),
    "Nil": natExpr(rType, cCode("(Type){}")),
    "Bool": natExpr(rType, cCode("(Type){}")),
    "Int": natExpr(rType, cCode("(Type){}")),
    "Str": natExpr(rType, cCode("(Type){}")),
    "Char": natExpr(rType, cCode("(Type){}")),
    "Any": natExpr(rType, cCode("(Type){}")),
    "Unknown": natExpr(rType, cCode("(Type){}")),

    "fix": erPrim(primCb, "fix", [rAny, rAny], rAny),
    // TODO Handle the new "fix2" primitive.
    // "fix2": erPrim(primCb, "fix2", [rAny, rAny], rAny),

    "ifNil": erPrim(primCb, "any_ifNil", [rAny, rAny], rAny),
    "testIsNil": erPrim(primCb, "any_ifNil", [rAny, rAny], rAny),
    "matchList": erPrim(primCb, "any_ifNil", [rAny, rAny], rAny),
    "matchMaybe": erPrim(primCb, "any_ifNil", [rAny, rAny], rAny),
    "ifBool": erPrim(primCb, "any_ifBool", [rAny, rAny], rAny),
    "ifInt": erPrim(primCb, "any_ifInt", [rAny, rAny], rAny),
    "ifStr": erPrim(primCb, "any_ifStr", [rAny, rAny], rAny),
    "testIsStr": erPrim(primCb, "any_ifStr", [rAny, rAny], rAny),
    "ifPair": erPrim(primCb, "any_ifPair", [rAny, rAny], rAny),
    "ifType": erPrim(primCb, "any_ifType", [rAny, rAny], rAny),

    "strAdd": erPrim(primCb, "strAdd", [rStr, rStr], rStr),
    "strLen": erPrim(primCb, "strLen", [rStr], rInt),
    "jsStrCat": erPrim(primCb, "strCat", [primCb.repr_ListStr], rStr),
    "jsStrJoin": erPrim(primCb, "strJoin", [rStr, primCb.repr_ListStr], rStr),
    "strCharAt": erPrim(primCb, "strCharAt", [rStr, rInt], rStr),
    "strCharAtMb": erPrim(primCb, "strCharAtMb", [rStr, rInt], primCb.repr_MaybeChar),
    "strChr": erPrim(primCb, "strChr", [rInt], rStr),
    "strOrd": erPrim(primCb, "strOrd", [rStr], rInt),
    "char_concat": erPrim(primCb, "char_concat", [primCb.repr_ListChar], rStr),

    "loop1": erPrim(primCb, "any_loopOne", [rAny, rAny], rAny),
    "loop2": erPrim(primCb, "any_loopTwo", [rAny, rAny], rAny),

    "grLoop": erPrim(primCb, "any_grLoop", [rAny, rAny], rAny),
    "grWhile": erPrim(primCb, "any_grWhile", [rAny, rAny, rAny], rAny),

    "unknownVariable": erPrim(primCb, "any_unknownVariable", [rStr], rAny),
    "unknownPrimitive": erPrim(primCb, "any_unknownPrimitive", [rStr], rAny),

    "hd": erPrim(primCb, "any_head", [rAny], rAny),
    "head": erPrim(primCb, "any_head", [rAny], rAny),
    "tl": erPrim(primCb, "any_tail", [rAny], rAny),
    "tail": erPrim(primCb, "any_tail", [rAny], rAny),

    "castT": erPrim(primCb, "any_identity", [rAny], rAny),
    "trace": erPrim(primCb, "any_trace", [rAny, rAny], rAny),
    "trace2": erPrim(primCb, "any_traceTwo", [rAny, rAny], rAny),
    "show": erPrim(primCb, "any_show", [rAny], rAny),
    "show2": erPrim(primCb, "any_show", [rAny], rAny),
    "showType": erPrim(primCb, "any_show", [rAny], rAny),
    "error": erPrim(primCb, "any_error", [rAny], rAny),

    "ioDoPrim": anyExpr(cCode("ioDoPrimCurried")),

    "jsEval": erPrim(primCb, "any_jsEval", [rAny], rAny),
    "jsEvalMaybe": erPrim(primCb, "any_jsEvalMaybe", [rAny], rAny),

    "primMkArrayFastAccessNoCopy": erPrim(primCb, "primMkArrayFastAccessNoCopy", [rAny, rAny], rAny),
    "primMkArrayFastAccessSlowCopy": erPrim(primCb, "primMkArrayFastAccessSlowCopy", [rAny, rAny], rAny),

    "primAssoc1MkEphemeral": erPrim(primCb, "primAssoc1MkEphemeral", [rAny], rAny),
    "primAssoc1MkPersistent": erPrim(primCb, "primAssoc1MkPersistent", [rAny], rAny),

    "primHpsCall": erPrim(primCb, "primHpsCall", [rAny, rAny], rAny),
    "primHpsDo": erPrim(primCb, "primHpsDo", [rAny, rAny], rAny),
    "primHpsHandlerMk": erPrim(primCb, "primHpsHandlerMk", [rAny, rAny], rAny),

    "Primitive": erPrim(primCb, "any_Primitive", [rStr], rType),
    "primitive": erPrim(primCb, "any_primitive", [rStr], rAny),

};

codegen_reprs(primCb)
codegen_c_primitive(primCb)

let boundPrimVars: VarSet = {}
Object.keys(prims).forEach(k => {
    boundPrimVars[k] = null
})


function getExpr(a: CExprOrCExprRepr): CExpr {
    if (a.tag === "CExprRepr") {
        return a.expr
    }
    else {
        return a
    }
}
function getExprs(exprs: CExprOrCExprRepr[]): CExpr[] {
    return exprs.map(e => getExpr(e))
}
function getVar(a: CVarOrCVarRepr): CVar {
    if (a.tag === "CExprRepr") {
        return a.expr
    }
    else {
        return a
    }
}

function cCode(code: string): CExpr { return { tag: "CCode", code: code } }
function cVar(name: string, depth: number): CVar { return { tag: "CVar", name: name, depth: depth } }
function cInt(value: number): CExpr { return { tag: "CInt", value: value } }
function cStr(value: string): CExpr { return { tag: "CStr", value: value } }
function cOp(opName: string, args: CExprOrCExprRepr[]): CExpr { return { tag: "COp", opName: opName, args: getExprs(args) } }
function cCast(ty: CType, expr: CExprOrCExprRepr): CExpr { return { tag: "CCast", ty: ty, expr: getExpr(expr) } }
function cField(aggregate: CExprOrCExprRepr, field: string): CExpr { return { tag: "CField", aggregate: getExpr(aggregate), field: field } }
function cList(elems: CExprOrCExprRepr[]): CExpr { return { tag: "CList", elems: getExprs(elems) } }
function cCall(func: CExprOrCExprRepr, args: CExprOrCExprRepr[]): CExpr { return { tag: "CCall", func: getExpr(func), args: getExprs(args) } }
function cCommentExpr(comment: string, expr: CExprOrCExprRepr): CExpr { return { tag: "CCommentExpr", comment: comment, expr: getExpr(expr) } }
function cParens(expr: CExprOrCExprRepr): CExpr { return { tag: "CParens", expr: getExpr(expr) } }
function cAggregate(elems: CExprOrCExprRepr[]): CExpr { return { tag: "CAggregate", elems: getExprs(elems), isConst: false, isVertical: false } }
function cAggregateVert(elems: CExprOrCExprRepr[]): CExpr { return { tag: "CAggregate", elems: getExprs(elems), isConst: false, isVertical: true } }
function cAggregateConst(elems: CExprOrCExprRepr[]): CExpr { return { tag: "CAggregate", elems: getExprs(elems), isConst: true, isVertical: false } }

function cExprStmt(expr: CExprOrCExprRepr): CStmt { return { tag: "CExprStmt", expr: getExpr(expr) } }
function cIf(cond: CExprOrCExprRepr, then: CStmts): CStmt { return { tag: "CIf", cond: getExpr(cond), then: then } }
function cIfElse(cond: CExprOrCExprRepr, then: CStmts, els: CStmts): CStmt { return { tag: "CIfElse", cond: getExpr(cond), then: then, else: els } }
function cWhile(cond: CExprOrCExprRepr, body: CStmts): CStmt { return { tag: "CWhile", cond: getExpr(cond), body: body } }
function cDoWhile(body: CStmts, cond: CExprOrCExprRepr): CStmt { return { tag: "CDoWhile", body: body, cond: getExpr(cond) } }
function cReturn(expr: CExprOrCExprRepr): CStmt { return { tag: "CReturn", expr: getExpr(expr) } }
function cCommentStmt(comment: string): CStmt & CDecl { return { tag: "CCommentStmt", comment: comment } }
function cBreak(): CStmt { return { tag: "CBreak" } }
function cContinue(): CStmt { return { tag: "CContinue" } }
function cAssignStmt(lhs: CExprOrCExprRepr, rhs: CExprOrCExprRepr): CStmt { return cExprStmt(cOp("=", [lhs, rhs])) }
function cLabel(label: string): CStmt { return { tag: "CLabel", label: label } }
function cGoto(label: string): CStmt { return { tag: "CGoto", label: label } }
function cBlock(stmts: CStmts): CStmt { return { tag: "CBlock", stmts: stmts } }

function cFunc(name: CVarOrCVarRepr, dom: [string, CType][], cod: CType, body: CStmts): CDecl { return { tag: "CFunc2", funcVar: getVar(name), dom: dom, cod: cod, body: body } }
function cVarDecl(ty: CType, varC: CVarOrCVarRepr, defn: CExprOrCExprRepr): CDecl & CStmt { return { tag: "CVarDecl", ty: ty, var: getVar(varC), defn: getExpr(defn) } }
function cVarDeclUndefined(ty: CType, varC: CVarOrCVarRepr): CDecl & CStmt { return { tag: "CVarDecl", ty: ty, var: getVar(varC) } }
function cStructDecl(name: string, fields: [string, CType][]): CDecl { return { tag: "CStructDecl", name: name, fields: fields } }
function cTypeDefFuncPtr(ty: CType, domRs: CType[], codR: CType): CDecl { return { tag: "CTypeDefFuncPtr", name: ty, domRs: domRs, codR: codR } }
function cTypeDef(name: CType, defn: CType): CDecl { return { tag: "CTypeDef", name: name, defn: defn } }
function cExtern(ty: CType, name: string): CDecl { return { tag: "CExtern", ty: ty, name: name } }

function cAddrOf(expr: CExprOrCExprRepr): CExpr {
    return cOp("&_", [expr])
}

function cDeclVar(varC: CVarRepr, defn: CExprOrCExprRepr): CDecl & CStmt {
    let ty = reprToCType(varC.repr)
    let result = cVarDecl(ty, varC, defn)
    return result
}
function cDeclVarUndefined(varC: CVarRepr): CDecl & CStmt {
    let ty = reprToCType(varC.repr)
    let result = cVarDeclUndefined(ty, varC)
    return result
}

function cDeclConst(varC: CVarRepr, defn: CExprOrCExprRepr): CDecl & CStmt {
    let ty = reprToCType(varC.repr)
    if (varC.expr.depth !== 0) {
        ty = tConst(ty)
    }
    let result = cVarDecl(ty, varC, defn)
    return result
}



function cbDeclVar(cb: CBuilder, varC: CVarRepr, defn: CExprRepr): CDecl & CStmt {
    let ty = reprToCType(varC.repr)
    let defn2 = toRepr(cb, varC.repr, defn)
    let result = cVarDecl(ty, varC, defn2)
    return result
}

function cbAssignStmt(cb: CBuilder, lhs: CExprRepr, rhs: CExprRepr): CStmt {
    return cExprStmt(cOp("=", [lhs, toRepr(cb, lhs.repr, rhs)]))
}



function rootPatName(pat: ExprTypeBidir): string | undefined {
    switch (pat.tag) {
        case "EVar":
            return pat.name
        case "EAs":
            return pat.name
        case "EType":
            return rootPatName(pat.expr)
        default:
            return undefined
    }
}


let patMatFail_fatalError: CStmts = [cExprStmt(cCall(cCode("fatalError"), [cStr("pattern match failure / type-error")]))]
let patMatFail_break: CStmts = [cBreak()]


function patMatFail_returnNil(cb: CBuilder, repr: CRepr): CStmts {
    let no = reprConvertFromNil(cb, repr)
    return [cReturn(no)]
}

function patMatFail_goto(label: string): CStmts {
    return [cGoto(label)]
}

// return true if there is any possibility this pattern might match
// return false if there is no possibility
// by reusing the cgc_pat_mat function, 
//   this implementation does more work than is needed here,
//   but this saves duplicating (and keeping in sync) the logic, 
function can_pat_mat(cb: CBuilder, ty: Type, varC2: CVarRepr, pat: ExprTypeBidir): boolean {
    let failStmts: CStmts = []
    let ok
    cb.pushNewCtx()
    {
        ok = cgc_pat_mat(cb, ty, varC2, pat, failStmts)
    }
    let [stmts,] = cb.popCtx()
    // let ok = stmts.length !== 0
    return ok
}

function cgc_pat_mat(cb: CBuilder, ty: Type, varC: CVarRepr, pat: ExprTypeBidir, failStmts: CStmts): boolean {
    function cg(ty: Type, varC: CVarRepr, pat: ExprTypeBidir): boolean {

        // if (varC.expr.name === "u3419_dt") {
        //     console.log("BREAK HERE")
        // }

        switch (pat.tag) {
            case "EDatum": {
                if (varC.repr.tag === "Single" && pat.ty1.tag === "TSingle" && varC.repr.value !== pat.ty1.val) {
                    return false
                }
                // skip redundant checks
                if (pat.ty1.tag === "TSingle" && ty.tag === "TSingle") {
                    return true
                    // TODO the above return is fine, assuming everything type-checked ok
                    // TODO ? add a dynamic value-check anyway ?
                    // TODO ?   it might be useful to run type-check failing code too.
                }
                let cond: CExpr = cOp("!", [cg_eq(cb, varC, cgc_expr(cb, pat))])
                cb.addStmts([cIf(cond, failStmts)])
                return true
            }
            case "EVar": {
                cb.getEnv()[pat.name] = varC
                return true
            }
            case "EAs":
                cb.getEnv()[pat.name] = varC
                let ok = cg(ty, varC, pat.expr)
                return ok
            case "EList": {
                // TODO Remove redundant dependent checks.
                // TODO Simple cases are handled, but dependent cases are not.
                // TODO Such as, if the first value in a tuple 
                // TODO   determins the length of the tuple,
                // TODO   as is typical with sum-product types,
                // TODO   then, this code still generates too many "isPair" checks
                switch (varC.repr.tag) {
                    case "Any": {
                        let listVar = varC
                        let tyL = ty
                        let ok = true
                        pat.exprs.forEach(p => {
                            let cond: CExpr = cOp("!", [cCall(cCode("any_isPair"), [listVar])])
                            // if (!(tyL.tag === "TPair" || (tyL.tag === "TAs" && tyL.type.tag === "TPair"))) {
                            //     cb.addStmts([cIf(cond, failStmts)])
                            // }
                            if ((tyL.tag !== "TPair" && (tyL.tag !== "TAs" || tyL.type.tag !== "TPair"))) {
                                cb.addStmts([cIf(cond, failStmts)])
                            }
                            let hdVar = cb.freshVar(rAny, rootPatName(p))
                            let tlVar = cb.freshVar(rAny)
                            let tyE = typeHd(tyL)
                            cb.addStmts([cDeclVar(hdVar, cCall(cCode("any_head"), [listVar]))])
                            cb.addStmts([cDeclVar(tlVar, cCall(cCode("any_tail"), [listVar]))])
                            ok &&= cg(tyE, hdVar, p)
                            listVar = tlVar
                            tyL = typeTl(tyL)
                        })
                        if (pat.tail === null) {
                            if (tyL.tag !== "TNil") {
                                let cond: CExpr = cOp("!", [cCall(cCode("any_isNil"), [listVar])])
                                cb.addStmts([cIf(cond, failStmts)])
                            }
                        }
                        else {
                            ok &&= cg(tyL, listVar, pat.tail)
                        }
                        return ok
                    }
                    case "TupleTail": {
                        let a = anyExpr(cCall(cCode("any_from_value"), [reprToReprExpr(rTupleTail), cAddrOf(varC)]))
                        let b = toVar(cb, a)
                        let ok = cg(ty, b, pat)
                        return ok
                    }
                    case "Tuple": {
                        let tyL = ty
                        let fields = varC.repr.elemReprs

                        if (fields.length !== pat.exprs.length && pat.tail === null) {
                            cb.addStmts(failStmts)
                            return false
                        }

                        let ok = true
                        pat.exprs.forEach((p, i) => {
                            let hdVar = cb.freshVar(fields[i], rootPatName(p))
                            let varTy = reprToCType(reprSimplify(fields[i]))
                            cb.addStmts([cDeclConst(hdVar, cField(varC, `_${i}`))])
                            let tyE = typeHd(tyL)
                            ok &&= cg(tyE, hdVar, p)
                            tyL = typeTl(tyL)
                        })
                        if (pat.tail === null) {
                            // TODO Check the tuple tail as expected.
                            // TODO This is probably only a problem if running type-check failing code,
                            // TODO   but that might be a useful ability.
                            // if (tyL.tag !== "TNil") {
                            //     let cond: CExpr = cOp("!", [cCall(cCode("isNil"), [listVar.expr])])
                            //     cb.addStmts([cIf(cond, failStmts)])
                            // }
                        }

                        // else {
                        //     let tupleTailVar = cb.freshVar(rDyn)
                        //     let tupleTail = cCall(cCode("rTupleTail"), [cOp("&_", [varC.repr.reprC]), cOp("&_", [varC]), cInt(pat.exprs.length)])
                        //     cb.addStmts([cDeclConst(tupleTailVar, tupleTail)])
                        //     cg(tyL, tupleTailVar, pat.tail)
                        // }

                        else {
                            // TODO We should be able to represent a tuple-tail with the same C-type as the whole tuple,
                            // TODO   much like yes-tuples use the same C-type as their element
                            // TODO The adaption to an Any form then only need be done if the value is subsequently used in an dynamic-context.
                            // TODO For now, just converting to dynamic-form immediately

                            let tupleTailVar = cb.freshVar(rTupleTail)
                            let tupleTail = cCall(cCode("tuple_tail"), [reprToReprExpr(varC.repr), cInt(pat.exprs.length), cOp("&_", [varC])])
                            // if (pat.tail.tag === "EVar" && pat.tail.name === "_") {
                            //     return
                            // }
                            cb.addStmts([cDeclConst(tupleTailVar, tupleTail)])
                            ok &&= cg(tyL, tupleTailVar, pat.tail)
                        }

                        return ok
                    }
                    case "List": {
                        // TODO ? we can just use a list-length check here, and avoid lots of isPair checks ?
                        let tyL = ty
                        let fieldR = varC.repr.elemRepr
                        let listVar = cb.freshVar(varC.repr)
                        cb.addStmts([cDeclVar(listVar, varC)])
                        let ok = true
                        pat.exprs.forEach((p, i) => {
                            let cond: CExpr = cOp("!", [cg_isPair(cb, listVar)])
                            // if (!(tyL.tag === "TPair" || (tyL.tag === "TAs" && tyL.type.tag === "TPair"))) {
                            //     cb.addStmts([cIf(cond, failStmts)])
                            // }
                            if ((tyL.tag !== "TPair" && (tyL.tag !== "TAs" || tyL.type.tag !== "TPair"))) {
                                cb.addStmts([cIf(cond, failStmts)])
                            }
                            let hdVar = cb.freshVar(fieldR, rootPatName(p))
                            let varTy = reprToCType(reprSimplify(fieldR))
                            cb.addStmts([cDeclConst(hdVar, cg_head(cb, listVar))])
                            cb.addStmts([cAssignStmt(listVar, cg_tail(cb, listVar))])
                            let tyE = typeHd(tyL)
                            ok &&= cg(tyE, hdVar, p)
                            tyL = typeTl(tyL)
                        })
                        if (pat.tail === null) {
                            if (tyL.tag !== "TNil") {
                                let cond: CExpr = cOp("!", [cg_isNil(cb, listVar)])
                                cb.addStmts([cIf(cond, failStmts)])
                            }
                        }
                        else {
                            let tupleTailVar = cb.freshVar(varC.repr)
                            cb.addStmts([cDeclConst(tupleTailVar, listVar)])
                            ok &&= cg(tyL, tupleTailVar, pat.tail)
                        }
                        return ok
                    }
                    case "Nil": {
                        // let cond = cOp("!", [cg_isNil(cb, varC)])
                        // cb.addStmts([cIf(cond, failStmts)])
                        // the above statements are redundant, but
                        // we need to output a statement, otherwise 
                        // the very-simple technique "can_pat_mat" uses to detect pat-mat failure concludes the pat-mat failed
                        cb.addStmts([cCommentStmt(`assert (${varC.expr.name} == [])`)])
                        return true
                    }
                    case "Yes": {
                        if (pat.exprs.length == 1) {
                            let field = varC.repr.elemRepr
                            let hdVar = cb.freshVar(field, rootPatName(pat.exprs[0]))
                            let varTy = reprToCType(reprSimplify(field))
                            cb.addStmts([cDeclConst(hdVar, varC)])
                            let tyE = typeHd(ty)
                            let ok = cg(tyE, hdVar, pat.exprs[0])
                            return ok
                        }
                        else {
                            cb.addStmts(failStmts)
                            return false
                        }
                    }
                    case "Maybe": {
                        if (pat.exprs.length == 0) {
                            let cond = cOp("!", [cg_isNil(cb, varC)])
                            cb.addStmts([cIf(cond, failStmts)])
                            return true
                        }
                        else if (pat.exprs.length == 1) {
                            let cond = cg_isNil(cb, varC)
                            cb.addStmts([cIf(cond, failStmts)])
                            let field = varC.repr.elemRepr
                            let hdVar = cb.freshVar(field, rootPatName(pat.exprs[0]))
                            let varTy = reprToCType(reprSimplify(field))
                            let valueC = natExpr(field, cField(varC, "value"))
                            cb.addStmts([cDeclConst(hdVar, valueC)])
                            let tyE = typeHd(ty)
                            let ok = cg(tyE, hdVar, pat.exprs[0])
                            return ok
                        }
                        else {
                            cb.addStmts(failStmts)
                            return false
                        }
                    }
                    case "Union": {
                        // generate matches for every alternative
                        //   typically only one should be able to match, and it should be clear at compile-time

                        // in the general-case
                        //   need a general-purpose repr-polymorphic implementation of head and tail
                        // in the typical-case
                        //   the types should rule out all but one repr,
                        //   and then a repr-specific match can be used with the one repr

                        // if (pat.loc.filename === "fe4-codegen-js.fe" && pat.loc.range.start.line===271 && pat.loc.range.start.col===22) {
                        //     console.log("BREAK HERE")
                        // }

                        let candidateReprs: [number, CExprRepr][] = []
                        varC.repr.altReprs.forEach((vr, i) => {
                            if (candidateReprs.length > 1) {
                                return
                            }
                            let unionValue = natExpr(vr, cField(cField(varC.expr, "value"), `_${i}`))
                            let unionVar = natVar(vr, cVar("<FAKE-VAR>", -1))
                            let ok = can_pat_mat(cb, ty, unionVar, pat)
                            if (ok) {
                                candidateReprs.push([i, unionValue])
                            }
                        })

                        if (candidateReprs.length === 0) {
                            // throw new Error("cgc_pat_mat: var-repr failed to match any of the union-reprs")
                            // if we've been called via can_pat_mat, than failing to match is not an error
                            return false
                        }
                        if (candidateReprs.length === 1) {
                            let [expectedTag, unionValue] = candidateReprs[0]
                            let actualTag = cField(varC.expr, "tag")
                            let cond = cOp("!=", [actualTag, cInt(expectedTag)])
                            cb.addStmts([cIf(cond, failStmts)])
                            let varC2 = toVar(cb, unionValue)
                            // TODO ? it should be possible to tighten the "ty" type here,
                            // TODO ?   so that fewer redendant runtime-checks are performed.
                            let ok = cg(ty, varC2, pat)
                            return ok
                        }
                        else {
                            let varC2 = toVar(cb, toAny(cb, varC))
                            let ok = cg(ty, varC2, pat)
                            return ok
                        }
                    }
                    case "Ptr": {
                        let repr = cb.memoMaps.recBodyReprMemo.get(varC.repr.feTy)
                        if (repr === undefined) {
                            throw new Error("failed to find repr for pointer to recursive type")
                        }
                        let varC2 = toVar(cb, natExpr(repr, cOp("*_", [varC])))
                        let ok = cg(ty, varC2, pat)
                        return ok
                    }
                    case "Func":
                    case "Clos":
                    case "Single":
                    case "Bool":
                    case "Int":
                    case "Str":
                    case "Type":
                        cb.addStmts(failStmts)
                        return false
                    default:
                        throw new Error(`cg_pat_mat: unhandled tuple repr (${varC.repr.tag})`)
                }
            }
            case "EType": {
                if (pat.type.tag === "EAs") {
                    let tyVarC = cb.freshVar(rType, pat.type.name);
                    // TODO ? do we want to construct and pass some representation of the types around ?
                    cb.addStmts([cDeclConst(tyVarC, cCast(tType, cAggregate([])))])
                    cb.getEnv()[pat.type.name] = tyVarC
                }
                let ok = cg(ty, varC, pat.expr)
                return ok
            }
            default:
                throw new Error(`missing case (${pat.tag})`)
        }
    }
    let ok = cg(ty, varC, pat)
    return ok
}

// function reprIntersect(a: CRepr, b: CRepr): bool {
//     switch (a.tag) {
//         case "Any":
//             return true
//         case "Bool":
//         case "Int":
//         case "Type":
//             return a.tag === b.tag
//         case "Str":
//             return b.tag === "Str" || b.tag === "Char" || b.tag === "Single"
//         case "Char":
//             return b.tag === "Str" || b.tag === "Char" || (b.tag === "Single" && b.value.length === 1)
//         case "Single":
//             return b.tag === "Str" || b.tag === "Char" || (b.tag === "Single" && b.value === a.value)
//         case "Nil":
//             return b.tag === "Nil" || b.tag === "Maybe" || b.tag === "List" || b.tag === "Tuple" && b.elemReprs.length === 0
//         case "Yes":
//             return b.tag === "Yes" || b.tag === "Maybe" || b.tag === "List" || b.tag === "Tuple" && b.elemReprs.length === 1
//         case "Maybe":
//             return b.tag === "Nil" || b.tag === "Yes" || b.tag === "Maybe" || b.tag === "List" || b.tag === "Tuple" && (b.elemReprs.length === 0 || b.elemReprs.length === 1)
//         case "Tuple":
//             return (
//                 (a.elemReprs.length === 0 && (b.tag === "Nil" || b.tag === "Maybe")
//                     || (a.elemReprs.length === 1 && (b.tag === "Yes" || b.tag === "Maybe"))
//                     || b.tag === "Tuple")

//             )
//         case "List":
//             return b.tag === "Nil" || b.tag === "Yes" || b.tag === "List" || b.tag === "Maybe" || b.tag === "Tuple"
//         case "Union":
//         case "TupleTail":
//         case "Func":
//         case "Clos":
//         case "None":
//             throw new Error("invalid case")
//         default:
//             throw new Error("missing case")
//     }
// }

type ReprEnv = { [_: string]: CRepr }

function defaultReprForType(cb: CBuilder, ty: Type, env?: ReprEnv, targetRepr?: CRepr, nameHint?: string): CRepr {
    if (targetRepr !== undefined) {
        return targetRepr
    }

    if (env === undefined) {
        env = {}
    }

    // if (typeContainsTypeVar(ty)) {
    //     return rAny
    // }
    // if (typeFreeVars(ty).length !== 0) {
    //     return rAny
    // }

    switch (ty.tag) {
        case "TVar": {
            let repr = env[ty.name]
            if (repr !== undefined) {
                return repr
            }
            else {
                return rAny
            }
        }
        case "TNil":
            return rNo
        case "TBool":
            return rBool
        case "TInt":
            return rInt
        case "TStr":
            return rStr
        case "TChar":
            return rChar
        case "TType":
        case "TSingleType":
            return rType
        case "TSingle": {
            let singleR = createSingleRepr(cb, ty.val)
            return singleR
        }
        case "TPair": {
            if (ty.tl.tag === "TNil") {
                let elemTargetRepr = undefined
                let elemR = defaultReprForType(cb, ty.hd, env, elemTargetRepr)
                let yesR = createYesRepr(cb, elemR)
                return yesR
            }
            let elemsR: CRepr[] = []
            while (ty.tag === "TPair") {
                let r = defaultReprForType(cb, ty.hd, env)
                elemsR.push(r)
                ty = ty.tl
            }
            if (ty.tag === "TNil") {
                let tupleR = createTupleRepr(cb, elemsR, nameHint)
                return tupleR
            }
            else {
                // Not a well formed tuple, but some other arrangement of pairs.
                // We could construct a range of nested native pair structs.
                // This case is less common so ignore for now.
                // return rDyn
                return rAny
            }
        }
        case "TList": {
            let elemR = defaultReprForType(cb, ty.elem, env)
            let listRepr = createListRepr(cb, elemR, nameHint)
            return listRepr
        }
        case "TRec": {
            let result = createRecursiveRepr(cb, ty, nameHint)
            return result
        }
        case "TFun": {
            let domRs: CRepr[] = []
            let ty2: Type = ty
            while (ty2.tag === "TFun") {
                // let domR = defaultReprForType(cb, ty2.argType)
                let domR = defaultReprForType(cb, ty2.argType, env)
                domRs.push(domR)
                ty2 = ty2.resultType
            }
            // let codR = defaultReprForType(cb, ty2)
            let codR = defaultReprForType(cb, ty2, env)
            let funcR = createClosRepr(cb, domRs, codR)
            return funcR
        }
        case "TAs": {
            // return defaultReprForType(cb, ty.type)
            // Just using "Any" for polymorphic functions works better in practice
            // This avoids converting (for example) a (List Int) to (List Any) upfront.
            // Converting the elements as needed is slightly faster.
            return rAny
        }
        case "TRule": {
            switch (ty.name) {
                case "unionT": {
                    if (ty.args.length === 2) {
                        let maybeValTy
                        if (ty.args[0].tag === "TNil" && ty.args[1].tag === "TPair" && ty.args[1].tl.tag === "TNil") {
                            maybeValTy = ty.args[1].hd
                        }
                        if (ty.args[1].tag === "TNil" && ty.args[0].tag === "TPair" && ty.args[0].tl.tag === "TNil") {
                            maybeValTy = ty.args[0].hd
                        }
                        if (maybeValTy !== undefined) {
                            let valRepr = defaultReprForType(cb, maybeValTy, env)
                            let maybeValRepr = createMaybeRepr(cb, valRepr)
                            return maybeValRepr
                        }
                        // else fall-through
                    }
                    if (ttiIsFalse(tiStructuralRelComp(ty, strT))) {
                        return rStr
                        // else fall-through
                    }
                    let altTys: Type[] = []
                    collectUnionTypes(ty, altTys)
                    altTys = disjoinTypes(altTys)
                    if (altTys.length === 1) {
                        return defaultReprForType(cb, altTys[0], env)
                    }
                    if (altTys.length > 1) {
                        let altReprs = altTys.map(t => defaultReprForType(cb, t, env))
                        // TODO ? simplify/shorten/reorder the list of reprs ?
                        // TODO ?   sometimes the same Repr appears more than once in the list 
                        // TODO ?     (this can thwart logic expecting/hoping for a unique Repr for a given lambda-maybe case).
                        // TODO ?   sometimes less specific Reprs occur earlier in the list than more specific Reprs
                        // TODO ?     (not sure how much of a problem this is/will be in practice)

                        let anyAnys = altReprs.filter(r => r.tag === "Any").length !== 0
                        if (anyAnys) {
                            return rAny
                        }

                        let unionRepr = createUnionRepr(cb, altReprs, nameHint)
                        return unionRepr
                    }
                    return rAny
                }
                // case "intersectT": {
                //     let inTys: Type[] = []
                //     collectIntersectTypes(ty, inTys)
                //     if (inTys.length === 1) {
                //         return defaultReprForType(cb, inTys[0], env)
                //     }
                //     if (inTys.length > 1) {
                //         let inReprs = inTys.map(t => defaultReprForType(cb, t, env))
                //         // if not every intersected type is clearly a function type, then just use an Any repr
                //         for (let ty of inTys) {
                //             if (!tiIsFalse(tiStructuralRelComp(ty, funT(voidT, anyT)))) {
                //                 return rAny
                //             }
                //         }
                //         let intersectRepr = createIntersectRepr(cb, inTys, nameHint)
                //         return intersectRepr
                //     }
                //     return rAny
                // }
                default:
                // fall-through
            }
        }

        default:
            return rAny
    }
}


function addReprComment(cb: CBuilder, msg: string, attrs: any[], reprs: CRepr[]): void {
    // cb.addGlobalStmts("AuxC", [cCommentStmt(`ReprComment: ${msg}: ${JSON.stringify(attrs)} ${JSON.stringify(reprs)}`)])
    // cb.addGlobalStmts("AuxC", [cCommentStmt(`ReprComment: ${msg}`)])
    // let commentText = `${msg}: ${JSON.stringify(attrs)} ${JSON.stringify(reprs)}`
    let reprLabels = reprs.map(r => cShowType(reprToCType(r)).split("_")[0])
    let commentText = `${msg}: ${JSON.stringify(attrs)} [${reprLabels.join(", ")}]`
    // if (commentText.length > 1000) {
    //     commentText = `(OVERSIZED ${commentText.length}) ${commentText}`
    // }
    // else {
    //     commentText = `(${commentText.length}) ${commentText}`
    // }
    cb.addGlobalStmts("AuxH", [cCommentStmt(`ReprComment: ${commentText}`)])
    cb.addGlobalStmts("AuxC", [cCommentStmt(`ReprComment: ${commentText}`)])
}

function createFuncRepr(cb: CBuilder, domRs: CRepr[], codR: CRepr): CReprFunc {
    let memoKey: [CRepr[], CRepr] = [domRs, codR]
    let result = cb.memoMaps.funcReprMemo.get(memoKey)
    if (result !== undefined) {
        return result
    }

    let [reprC, funcTypeV] = cb.freshReprType("Func", domRs.length, [...domRs, codR])
    let domCTy = domRs.map(r => reprToCType(r))
    let codCTy = reprToCType(codR)
    cb.addGlobalStmts("AuxH", [cTypeDefFuncPtr(funcTypeV, domCTy, codCTy)])

    result = rFunc(funcTypeV, domRs, codR, reprC)
    cb.pendingReprCodeGen.push(result)
    cb.memoMaps.funcReprMemo.set(memoKey, result)
    return result
}

function createFuncRepr_codegen(cb: CBuilder, funcRepr: CReprFunc) {
    let domRs = funcRepr.dom
    let codR = funcRepr.cod

    let domReprC = cAggregate(domRs.map(r => reprToReprExpr(r)))
    let codReprC = reprToReprExpr(codR)

    let hasEnv = false
    let funcApply_sd = createFunctionApplySD(cb, hasEnv, domRs, codR);
    let funcApply_ds = cCode("NULL");

    cb.addGlobalStmts("AuxC", [cVarDecl(tConst(tName("ReprFunc")), funcRepr.reprC.expr as CVar, cAggregateConst([
        cAggregate([cCode("Repr_Func"), cCall(cCode("sizeof"), [cCode(cShowType(funcRepr.funcCTy))])]),
        cInt(domRs.length),
        cCast(tName(`Repr[${domRs.length}]`), domReprC),
        codReprC,
        funcApply_sd,
        funcApply_ds
    ]))])

}


function createClosRepr(cb: CBuilder, domRs: CRepr[], codR: CRepr, nameHint?: string): CReprClos {
    let memoKey: [CRepr[], CRepr] = [domRs, codR]
    let result = cb.memoMaps.closReprMemo.get(memoKey)
    if (result !== undefined) {
        return result
    }

    let [, funcTypeV] = cb.freshReprType("Func", domRs.length, [...domRs, codR])
    let [reprC, closTypeV] = cb.freshReprType("Clos", domRs.length, [...domRs, codR], nameHint)
    let domCTy = domRs.map(r => reprToCType(r))
    let codCTy = reprToCType(codR)
    cb.addGlobalStmts("AuxH", [cTypeDefFuncPtr(funcTypeV, [tVoidConstPtrConst, ...domCTy], codCTy)])
    cb.addGlobalStmts("AuxH", [cStructDecl(cShowType(closTypeV),
        [["func", funcTypeV],
        ["env", tVoidConstPtr],
        ])])

    result = rClos(funcTypeV, closTypeV, domRs, codR, reprC)
    cb.pendingReprCodeGen.push(result)
    cb.memoMaps.closReprMemo.set(memoKey, result)
    return result
}


function createClosRepr_codegen(cb: CBuilder, closRepr: CReprClos) {
    let domRs = closRepr.dom
    let codR = closRepr.cod

    let domReprC = cAggregate(domRs.map(r => reprToReprExpr(r)))
    let codReprC = reprToReprExpr(codR)

    let hasEnv = true
    let funcApply_sd = createFunctionApplySD(cb, hasEnv, domRs, codR);
    let funcApply_ds = createFunctionApplyDS(cb, hasEnv, domRs, codR);

    cb.addGlobalStmts("AuxC", [cVarDecl(tConst(tName("ReprClos")), closRepr.reprC.expr as CVar, cAggregateConst([
        cAggregate([cCode("Repr_Clos"), cCall(cCode("sizeof"), [cCode(cShowType(closRepr.closCTy))])]),
        cInt(domRs.length),
        cCast(tName(`Repr[${domRs.length}]`), domReprC),
        codReprC,
        funcApply_sd,
        funcApply_ds
    ]))])

    return closRepr
}

function createFuncNullRepr(cb: CBuilder, domRs: CRepr[], codR: CRepr): CReprFuncNull {
    let memoKey: [CRepr[], CRepr] = [domRs, codR]
    let result = cb.memoMaps.funcNullReprMemo.get(memoKey)
    if (result !== undefined) {
        return result
    }

    let [, funcTypeV] = cb.freshReprType("Func", domRs.length, [...domRs, codR])
    let [reprC, closTypeV] = cb.freshReprType("Clos", domRs.length, [...domRs, codR])
    let domCTy = domRs.map(r => reprToCType(r))
    let codCTy = reprToCType(codR)
    cb.addGlobalStmts("AuxH", [cTypeDefFuncPtr(funcTypeV, [tVoidConstPtrConst, ...domCTy], codCTy)])

    result = rFuncNull(funcTypeV, domRs, codR, reprC)
    cb.pendingReprCodeGen.push(result)
    cb.memoMaps.funcNullReprMemo.set(memoKey, result)
    return result
}


function createFuncNullRepr_codegen(cb: CBuilder, closRepr: CReprFuncNull) {
    let domRs = closRepr.dom
    let codR = closRepr.cod

    let domReprC = cAggregate(domRs.map(r => reprToReprExpr(r)))
    let codReprC = reprToReprExpr(codR)

    let hasEnv = true
    let funcApply_sd = createFunctionApplySD(cb, hasEnv, domRs, codR);
    let funcApply_ds = cCode("NULL");

    cb.addGlobalStmts("AuxC", [cVarDecl(tConst(tName("ReprFuncNull")), closRepr.reprC.expr as CVar, cAggregateConst([
        cAggregate([cCode("Repr_FuncNull"), cCall(cCode("sizeof"), [cCode(cShowType(closRepr.funcCTy))])]),
        cInt(domRs.length),
        cCast(tName(`Repr[${domRs.length}]`), domReprC),
        codReprC,
        funcApply_sd,
        funcApply_ds
    ]))])

    return closRepr
}

function createFunctionApplySD(cb: CBuilder, hasEnv: boolean, domR: CRepr[], codR: CRepr): CVarRepr {
    let memoKey: [boolean, CRepr[], CRepr] = [hasEnv, domR, codR]
    let result = cb.memoMaps.adaptSD.get(memoKey)
    if (result !== undefined) {
        return result
    }

    addReprComment(cb, "ApplySD", [hasEnv], [...domR, codR])
    let [reprC, funcTypeV] = cb.freshReprType("Func", domR.length, [...domR, codR])
    let domCTy = domR.map(r => reprToCType(r))
    let codCTy = reprToCType(codR)
    let envPtrMb: [CType] | [] = hasEnv ? [tVoidConstPtrConst] : []
    cb.addGlobalStmts("AuxH", [cTypeDefFuncPtr(funcTypeV, [...envPtrMb, ...domCTy], codCTy)])

    let argVars: CVarRepr[] = []
    domR.forEach((r, i) => {
        let v = cb.namedVar(r, `arg_${i}`)
        argVars.push(v)
    })
    let funcVar = cb.namedVar(rNone, "func")
    let closEnvVar = cb.namedVar(rNone, "closEnv")
    let args: CVarRepr[] = argVars.slice()
    if (hasEnv) {
        args.unshift(closEnvVar)
    }

    let funcApplySD = cb.freshVar(rNone)
    cb.pushNewCtx()
    {
        domR.slice(0, -1).forEach((r, i) => {
            cb.addStmts([cDeclConst(argVars[i], reprConvertFromAny(cb, r, cOp("[]", [cCode("partialArgs"), cInt(i)])))])
        })
        cb.addStmts([cDeclConst(argVars[domR.length - 1], reprConvertFromAny(cb, domR.at(-1)!, cCode("lastArg")))])

        let codT = reprToCType(reprSimplify(codR))
        cb.addStmts([cVarDecl(funcTypeV, funcVar, cCode("func0"))])
        let resultVar = cb.namedVar(codR, "result")
        cb.addStmts([cDeclConst(resultVar, cCall(funcVar, args))])
        cb.addStmts([cReturn(reprConvertToAny(cb, resultVar))])
    }
    let [stmts,] = cb.popCtx()
    let adaptF = cFunc(funcApplySD, [["func0", tVoidConstPtrConst], ["closEnv", tVoidConstPtrConst], ["partialArgs", tArray(tAny)], ["lastArg", tAny]], tAny, stmts)
    cb.addGlobalStmts("AuxC", [adaptF])

    result = funcApplySD
    cb.memoMaps.adaptSD.set(memoKey, result)
    return result
}

function createFunctionApplyDS(cb: CBuilder, hasEnv: true, domRs: CRepr[], codR: CRepr): CVarRepr {
    let memoKey: [boolean, CRepr[], CRepr] = [hasEnv, domRs, codR]
    let result = cb.memoMaps.adaptDS.get(memoKey)
    if (result !== undefined) {
        return result
    }

    addReprComment(cb, "ApplyDS", [], [...domRs, codR])

    let argVars: CVarRepr[] = []
    domRs.forEach((r, i) => {
        let v = cb.namedVar(r, `arg_${i}`)
        argVars.push(v)
    })

    let closEnvVar = cb.namedVar(rNone, "closEnv")
    let args: CVarRepr[] = argVars.slice()

    let adaptInv = cb.freshVar(rNone, "applyDS")

    cb.pushNewCtx()
    {
        let argVars: CVarRepr[] = []
        domRs.forEach((r, i) => {
            let v = cb.namedVar(r, `arg_${i}`)
            argVars.push(v)
        })
        let envVar = cb.freshVar(rNone, "env2");
        cb.addStmts([cVarDecl(tPtr(tName("AnyFuncClosEnv")), envVar, cCast(tPtr(tName("AnyFuncClosEnv")), closEnvVar))])
        let callVar = cb.namedVar(rAny, "func");
        cb.addStmts([cDeclConst(callVar, cOp("->", [envVar, cCode("func")]))])
        argVars.forEach((a, i) => {
            let applyVar = cb.namedVar(rAny, `app${i + 1}`);
            let arg = reprConvertToAny(cb, a)
            cb.addStmts([cDeclConst(applyVar, cCall(cCode("any_call"), [callVar, arg]))])
            callVar = applyVar
        })
        let resultVar = cb.namedVar(codR, "result2");
        cb.addStmts([cDeclConst(resultVar, toRepr(cb, codR, callVar))])
        cb.addStmts([cReturn(resultVar)])
    }
    let [adaptInvStmts,] = cb.popCtx()

    let argParams: [string, CType][] = args.map(a => [a.expr.name, reprToCType(a.repr)])
    argParams.unshift([closEnvVar.expr.name, tVoidPtrConst])
    let adaptInvDecl = cFunc(adaptInv, argParams, reprToCType(codR), adaptInvStmts)
    cb.addGlobalStmts("AuxC", [adaptInvDecl])

    result = adaptInv
    cb.memoMaps.adaptDS.set(memoKey, result)
    return result
}




function repr_codegen(cb: CBuilder, repr: CRepr) {
    switch (repr.tag) {
        case "Func": {
            createFuncRepr_codegen(cb, repr)
            break
        }
        case "Clos": {
            createClosRepr_codegen(cb, repr)
            break
        }
        case "FuncNull": {
            createFuncNullRepr_codegen(cb, repr)
            break
        }
        default:
        // no cg needed
    }
}


function cgc_lambda3(cb: CBuilder, expr: ExprTypeBidir, nameHint?: string, targetRepr?: CRepr): CExprRepr {
    switch (expr.tag) {
        case "ELambda":
        case "ELambdaYes":
        case "ELambdaNo":
        case "ELambdaMaybe": {
            // collect all the parameters that cannot fail pattern-matching (assuming they type-checked ok)
            let initParams: [ExprTypeBidir, Type][] = []
            let lastLambda: ExprTypeBidir = expr
            let body: ExprTypeBidir = lastLambda.body
            let targetBodyRepr: CRepr | undefined = reprCod(targetRepr)
            while (lastLambda.tag === "ELambda") {
                body = lastLambda.body
                let pat = lastLambda.pat
                initParams.push([pat, pat.ty1]) // TODO switch to using the context-type (ty2)
                // initParams.push([pat, pat.ty2!]) // TODO switch to using the context-type (ty2)
                if (lastLambda.body.tag === "ELambda") {
                    targetBodyRepr = reprCod(targetBodyRepr)
                }
                lastLambda = lastLambda.body
            }
            let lastParamMb: [[ExprTypeBidir, Type]] | [] = []
            if (lastLambda.tag === "ELambdaYes" || lastLambda.tag === "ELambdaNo" || lastLambda.tag === "ELambdaMaybe") {
                body = lastLambda.body
                targetBodyRepr = reprCod(targetBodyRepr)
                let pat = lastLambda.pat
                // lastParamMb = [[pat, typeDom(lastLambda.ty1)]]
                // using the context-type (ty2) here keeps the Repr just broad enough to
                // handle values that have the correct type, but fail pattern matching
                lastParamMb = [[pat, typeDom(lastLambda.ty2!)]]
            }


            let boundVars: VarSet = { ...boundPrimVars }
            // extend the boundVars with any global vars currently in the env
            Object.keys(cb.getEnv()).forEach((name) => {
                let vr = cb.getEnv()[name]
                if (cb.isGlobalVar(vr)) {
                    boundVars[name] = null
                }
            })
            let freeVars: VarSet = {}
            exprFreeVars("Term", expr, boundVars, freeVars)
            // closEnv maps from ferrum variable to C variables with corresponding representation
            let closEnv: [string, CVarRepr][] =
                Object.keys(freeVars).map(v => {
                    if (v in cb.getEnv()) {
                        let varC = cb.getEnv()[v]
                        return [v, varC]
                    }
                    else {
                        // throw new Error(`unknown variable ${v}`)
                        console.log(`ERROR UNKNOWN VARIABLE: cgc_expr: unknown variable (${v}) at (${showLoc(expr.loc)})`);
                        return [v, cb.namedVar(rAny, `TODO_${v}`)]
                    }
                })

            // funcInitStmts contains the statements reading the values out of the closure environment, such as "int u12_a = env->u12_a"
            let funcInitStmts = closEnv.map(([name, vr]) => cDeclConst(vr, cOp("->", [cCode("env"), vr])))

            let bodyR = defaultReprForType(cb, body.ty1, undefined, targetBodyRepr)
            let codR = bodyR
            if (lastLambda.tag === "ELambdaMaybe") {
                codR = createMaybeRepr(cb, codR)
            }
            if (lastLambda.tag === "ELambdaYes") {
                codR = createYesRepr(cb, codR)
            }
            if (lastLambda.tag === "ELambdaNo") {
                codR = reprUnionNil(cb, codR)
            }
            let codCTy = reprToCType(codR)

            let paramVRs: CVarRepr[] = []

            let returnVar = cb.freshVar(codR, "returnVar")
            let scAssignReturnVar = scAssign(returnVar)
            if (lastLambda.tag === "ELambdaYes" || lastLambda.tag === "ELambdaMaybe") {
                scAssignReturnVar = scYes(scAssignReturnVar)
            }
            cb.pushNewCtx()
            {
                cb.addStmts(funcInitStmts)

                initParams.forEach(([p, ty]) => {
                    let paramR = defaultReprForType(cb, ty)
                    let paramVar = cb.freshVar(paramR, rootPatName(p))
                    paramVRs.push(paramVar)
                    let patMatFailStmts = patMatFail_fatalError
                    // generate all the tests and assignments needed in pattern matching
                    cgc_pat_mat(cb, ty, paramVar, p, patMatFailStmts)
                });
                lastParamMb.forEach(([p, ty]) => {
                    let paramR = defaultReprForType(cb, ty)
                    let paramVar = cb.freshVar(paramR, rootPatName(p))
                    paramVRs.push(paramVar)
                    let patMatFailStmts =
                        (lastLambda.tag === "ELambdaNo" || lastLambda.tag === "ELambdaMaybe")
                            ? patMatFail_returnNil(cb, codR)
                            : patMatFail_fatalError
                    // generate all the tests and assignments needed in pattern matching
                    cgc_pat_mat(cb, ty, paramVar, p, patMatFailStmts)
                })

                cb.addStmts([cDeclVarUndefined(returnVar)])
                cgc_stmt_stmt(cb, body, scAssignReturnVar)
            }
            let [funcBodyStmts,] = cb.popCtx()
            funcBodyStmts.push(cReturn(returnVar))

            cb.addGlobalStmts("Usr", [cCommentStmt(showLoc(expr.loc))])
            cb.addGlobalStmts("AuxH", [cCommentStmt(showLoc(expr.loc))])
            cb.addGlobalStmts("AuxC", [cCommentStmt(showLoc(expr.loc))])

            let domRs = paramVRs.map(vr => vr.repr)
            let domVR: [string, CType][] = paramVRs.map(vr => [vr.expr.name, reprToCType(vr.repr)])

            // if a closure environment struct is needed, 
            //   add a global struct declaration
            //   add a schema describing the struct
            //   prepend an additional env argument to the underlying native function
            //   build a closure value
            let hasEnv = closEnv.length !== 0
            // let hasEnv = true
            if (hasEnv) {

                let funcR = createClosRepr(cb, domRs, codR)
                // the new name for the generated function
                let funcVar = cb.freshVar(funcR, nameHint)

                let closEnvStructName = `Env_${funcVar.expr.name}`
                let closEnvFields: [string, CType][] =
                    closEnv.map(([name,]) => {
                        let fieldName = cb.getEnv()[name].expr.name
                        return [fieldName, reprToCType(reprSimplify(cb.getEnv()[name].repr))]
                    })
                closEnvFields.unshift(["hdr", tName("Header")])
                let closEnvCTy = tPtr(tName(closEnvStructName))
                domVR.unshift(["env", closEnvCTy])

                // TODO ? use a tuple for the environment ?
                // TODO ?   this would save repeatedly creating structs with the same field types,
                // TODO ?   but it would also mean the field names were no longer based on the specific names in a user-written function
                let envStructName = cb.namedVar(rNone, `${closEnvStructName}_Schema`)
                cb.addGlobalStmts("AuxH", [cStructDecl(closEnvStructName, closEnvFields)])
                let fields: CExpr[] = closEnv.map(([v, vr]) => {
                    let tySc = reprToReprExpr(vr.repr)
                    return cAggregate([cStr(v), tySc, cCode(`offsetof(${closEnvStructName},${vr.expr.name})`)])
                })
                let agg = cAggregateConst([
                    cStr(closEnvStructName),
                    cCall(cCode("sizeof"), [cCode(closEnvStructName)]),
                    cInt(fields.length),
                    cCast(tName("Field[]"), cAggregate(fields))
                ])
                cb.addGlobalStmts("AuxC", [cVarDecl(tName("Schema"), envStructName, agg)])

                let closVars: CExpr[] = closEnv.map(([v, vr]) => vr.expr)
                closVars.unshift(cAggregate([cOp("&_", [envStructName])]))

                let envVar = cb.freshVar(rAny);
                cb.addStmts([cExprStmt(cCall(cCode("MALLOC"), [cCode(closEnvStructName), envVar, cAggregate(closVars)]))])
                let closVar = cb.freshVar(funcR);
                let closRepr = funcR as CReprClos
                let closValue =
                    cCast(closRepr.closCTy,
                        cAggregate([
                            cCast(closRepr.funcCTy, funcVar),
                            envVar
                        ])
                    )
                cb.addStmts([cDeclConst(closVar, closValue)])
                // then add the native/uncurried implementation of the function
                let funcDeclNatVR = cFunc(funcVar, domVR, codCTy, funcBodyStmts)
                cb.addGlobalStmts("Usr", [funcDeclNatVR])
                return closVar

            }
            // else {
            //     let funcR = createFuncRepr(cb, domRs, codR)
            //     // the new name for the generated function
            //     let funcVar = cb.freshVar(funcR, nameHint)

            //     // then add the native/uncurried implementation of the function
            //     let funcDeclNatVR = cFunc(funcVar, domVR, codCTy, funcBodyStmts)
            //     cb.addGlobalStmts("Usr", [funcDeclNatVR])
            //     return funcVar
            // }
            else {
                let funcR = createFuncNullRepr(cb, domRs, codR)
                // the new name for the generated function
                let funcVar = cb.freshVar(funcR, nameHint)

                domVR.unshift(["env", tVoidConstPtrConst])

                // then add the native/uncurried implementation of the function
                let funcDeclNatVR = cFunc(funcVar, domVR, codCTy, funcBodyStmts)
                cb.addGlobalStmts("Usr", [funcDeclNatVR])
                return funcVar
            }
        }
        default: {
            throw new Error("impossible")
        }
    }
}



type StmtCtx =
    | { tag: "ScSkip" }
    | { tag: "ScAssign", var: CVarRepr }
    | { tag: "ScBreak", sc: StmtCtx }
    | { tag: "ScContinue", sc: StmtCtx }
    | { tag: "ScBreakContinue", breakSc: StmtCtx, continueSc: StmtCtx }
    | { tag: "ScGoto", sc: StmtCtx, label: string }
    | { tag: "ScYes", sc: StmtCtx }
    | { tag: "ScNo", sc: StmtCtx }
    | { tag: "ScMaybe", yesSc: StmtCtx, noSc: StmtCtx }
// TODO ? Enable early pat-mat testing on the result of a while-loop ?
// TODO ? This would enable a while-loop to perform an early exit, in place.
// TODO ?   much like a "break" statement in a "loop"-loop.
// TODO ? Currently, if a while-loop needs to make an early exit with a result, 
// TODO ?   it must succeed in starting a new iteration, which then fails on the next iteration.
// TODO ?     while [ x, [] ] <| 
// TODO ?     [ [x0 ,, xs] , [] ] |=> // lambda-yes, whatever we do after this point, 
// TODO ?                             // we are definitely going to start a new loop iteration after this one
// TODO ?     if (...) 
// TODO ?     [ -> [ [], [x0] ] // early-exit, if we've found the "x" we are looking for
// TODO ?     , -> [ xs, []   ] // or else, keep searching
// TODO ?     ]
// | { tag: "ScPatTest", pat: ExprTypeBidir, passSc: StmtCtx, failSc: StmtCtx }

// true => definitely ends with a jump
// false => some (or all) paths don't end with a jump
function sc_endsWithJump(sc: StmtCtx): boolean {
    let ewj = sc_endsWithJump
    switch (sc.tag) {
        case "ScSkip":
        case "ScAssign":
            return false
        case "ScBreak":
        case "ScContinue":
        case "ScBreakContinue":
        case "ScGoto":
            return true
        case "ScYes":
        case "ScNo":
            return ewj(sc.sc)
        case "ScMaybe":
            return ewj(sc.yesSc) && ewj(sc.noSc)
        default:
            throw new Error("missing case")
    }
}

function scSkip(): StmtCtx { return { tag: "ScSkip" } }
function scAssign(va: CVarRepr): StmtCtx { return { tag: "ScAssign", var: va } }
function scBreak(sc: StmtCtx): StmtCtx { return { tag: "ScBreak", sc: sc } }
function scContinue(sc: StmtCtx): StmtCtx { return { tag: "ScContinue", sc: sc } }
function scBreakContinue(breakSc: StmtCtx, continueSc: StmtCtx): StmtCtx { return { tag: "ScBreakContinue", breakSc: breakSc, continueSc: continueSc } }
// function scGoto(sc: StmtCtx, label: string): StmtCtx { return { tag: "ScGoto", sc: sc, label: label } }
function scMaybe(yesSc: StmtCtx, noSc: StmtCtx): StmtCtx { return { tag: "ScMaybe", yesSc: yesSc, noSc: noSc } }

function scGoto(sc: StmtCtx, label: string): StmtCtx {
    // there's no point adding a goto-stmt after control
    // has already branched off somewhere else
    // for example, no point jumping to the end of a match,
    // if we have already used break/continue to jump to 
    // somewhere in an outer loop directly containing that match.
    if (sc_endsWithJump(sc)) {
        return sc
    }
    else {
        return { tag: "ScGoto", sc: sc, label: label }
    }
}


function scYes(sc: StmtCtx): StmtCtx {
    switch (sc.tag) {
        case "ScMaybe":
            return sc.yesSc
        case "ScSkip":
        case "ScAssign":
        case "ScBreak":
        case "ScContinue":
        case "ScGoto":
        case "ScYes":
        case "ScNo":
        case "ScBreakContinue":
            return { tag: "ScYes", sc: sc }
        default:
            throw new Error("missing case")
    }
}

function scNo(sc: StmtCtx): StmtCtx {
    switch (sc.tag) {
        case "ScMaybe":
            return sc.noSc
        case "ScSkip":
        case "ScAssign":
        case "ScBreak":
        case "ScContinue":
        case "ScGoto":
        case "ScYes":
        case "ScNo":
            return { tag: "ScNo", sc: sc }
        default:
            throw new Error("missing case")
    }
}

function getTargetReprFromStmtCtx(cb: CBuilder, stmtCtx: StmtCtx): CRepr {
    let gtr = (sc: StmtCtx) => getTargetReprFromStmtCtx(cb, sc)
    switch (stmtCtx.tag) {
        case "ScAssign":
            return stmtCtx.var.repr
        case "ScBreak":
            return gtr(stmtCtx.sc)
        case "ScContinue":
            return gtr(stmtCtx.sc)
        case "ScBreakContinue": {
            let breakRepr = gtr(stmtCtx.breakSc)
            let breakTupleRepr = createTupleRepr(cb, [createSingleRepr(cb, "break"), breakRepr])
            let continueRepr = gtr(stmtCtx.continueSc)
            let continueTupleRepr = createTupleRepr(cb, [createSingleRepr(cb, "continue"), continueRepr])
            let breakOrContionueRepr = createUnionRepr(cb, [breakTupleRepr, continueTupleRepr])
            return breakOrContionueRepr
        }
        case "ScYes": {
            let repr = reprTupleProjection(cb, gtr(stmtCtx.sc), 0)!
            return repr
        }
        case "ScSkip":
            return rNo
        case "ScMaybe": {
            let yesRepr = gtr(stmtCtx.yesSc)
            let noRepr = gtr(stmtCtx.noSc)
            // the noRepr is either "Nil", or a repr containing a "nil" value
            let maybeRepr = createMaybeRepr(cb, yesRepr)
            return maybeRepr
        }
        case "ScNo":
        case "ScGoto":
            return gtr(stmtCtx.sc)
        default:
            throw new Error("missing case")
    }
}


function sc_close(cb: CBuilder, stmtCtx: StmtCtx, expr: CExprRepr): void {
    let scc = (sc: StmtCtx, er: CExprRepr) => sc_close(cb, sc, er)
    switch (stmtCtx.tag) {
        case "ScSkip": {
            // ignore the expr, (presumably we are consuming a no)
            // and do nothing
            return
        }
        case "ScAssign": {
            cb.addStmts([cbAssignStmt(cb, stmtCtx.var, expr)])
            return
        }
        case "ScBreak": {
            scc(stmtCtx.sc, expr)
            cb.addStmts([cBreak()])
            return
        }
        case "ScContinue": {
            scc(stmtCtx.sc, expr)
            cb.addStmts([cContinue()])
            return
        }
        case "ScMaybe": {
            if (expr.repr.tag === "Yes") {
                // if "expr" can only be a "yes" value, then use the "yes" StmtCtx unconditionally
                let rhs = natExpr(expr.repr.elemRepr, expr.expr)
                scc(stmtCtx.yesSc, rhs)
            }
            else if (expr.repr.tag === "Tuple" && expr.repr.elemReprs.length == 1) {
                // if "expr" can only be a "yes" value, then generate the assignment and goto "yes" statements unconditionally
                let rhs = natExpr(expr.repr.elemReprs[0], cField(expr, "_0"))
                scc(stmtCtx.yesSc, rhs)
            }
            else if (expr.repr.tag === "Nil" || expr.expr.tag === "CCall" && expr.expr.func.tag === "CCode" && expr.expr.func.code === "rNil") {
                // if "expr" can only be a "no" value, then generate the goto "no" statement unconditionally
                scc(stmtCtx.noSc, expr)
            }
            else {
                // otherwise, generate a conditional statement which will determine which label to goto at runtime
                let rhs2 = toVar(cb, expr)
                cb.addStmts([cCommentStmt("Dynamic ScMaybe")])
                // let thenStmts = [cGoto(stmtCtx.noLabel)]
                cb.pushNewCtx()
                {
                    scc(stmtCtx.noSc, rhs2)
                }
                let [thenStmts,] = cb.popCtx()
                cb.pushNewCtx()
                {
                    let rhs = cg_head(cb, rhs2)
                    scc(stmtCtx.yesSc, rhs)
                }
                let [elseStmts,] = cb.popCtx()
                cb.addStmts([cIfElse(
                    cg_isNil(cb, rhs2),
                    thenStmts,
                    elseStmts
                )])
            }
            return
        }
        case "ScBreakContinue": {
            let rhs2 = toVar(cb, expr)
            cb.addStmts([cCommentStmt("Dynamic Loop ScBreakContinue")])

            cb.pushNewCtx()
            {
                let rhs = cg_head(cb, cg_tail(cb, rhs2))
                scc(stmtCtx.breakSc, rhs)
            }
            let [thenStmts,] = cb.popCtx()
            cb.pushNewCtx()
            {
                let rhs = cg_head(cb, cg_tail(cb, rhs2))
                scc(stmtCtx.continueSc, rhs)
            }
            let [elseStmts,] = cb.popCtx()
            cb.addStmts([cIfElse(
                cg_eq(cb, cg_head(cb, rhs2), cb.staticStrings["break"]),
                thenStmts,
                elseStmts
            )])

            return
        }
        case "ScGoto":
            scc(stmtCtx.sc, expr)
            cb.addStmts([cGoto(stmtCtx.label)])
            return
        case "ScYes": {
            let yesVar = cg_yes(cb, expr)
            scc(stmtCtx.sc, yesVar)
            return
        }
        case "ScNo": {
            // whatever repr expr has, it must be a "no" value
            // TODO ? add comment that we are consuming it ?
            let noVal = cg_no(cb)
            scc(stmtCtx.sc, noVal)
            return
        }

        default:
            throw new Error(`missing case ($ {stmtCtx.tag})`)
    }
}

type CgStmtResult = ((cb: CBuilder, stmtCtx: StmtCtx) => void) | null
type CgExprResult = CExprRepr | null
type CgStmtApplyFunc = (cb: CBuilder, funcName: string, args: ExprTypeBidir[]) => CgStmtResult
type CgStmtExprFunc = (cb: CBuilder, expr: ExprTypeBidir) => CgStmtResult
type CgExprApplyFunc = (cb: CBuilder, funcName: string, args: ExprTypeBidir[]) => CgExprResult

function stmt_if(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgStmtResult {
    if (funcName === "if2" && args.length === 2
        && args[1].tag === "EList" && args[1].exprs.length === 2
        && args[1].exprs[0].tag === "ELambda" && args[1].exprs[1].tag === "ELambda") {

        let thenBody = args[1].exprs[0].body
        let elseBody = args[1].exprs[1].body

        // TODO ? plumb through a target Repr along with the StmtCtx
        // TODO ?   currently the branches of "if" expressions often have a dynamic repr
        return (cb: CBuilder, stmtCtx: StmtCtx) => {
            let cond = cgc_expr(cb, args[0])
            let cond2 = toRepr(cb, rBool, cond)

            cb.pushNewCtx()
            {
                cgc_stmt_stmt(cb, thenBody, stmtCtx)
            }
            let [stmtsOutT,] = cb.popCtx()

            cb.pushNewCtx()
            {
                cgc_stmt_stmt(cb, elseBody, stmtCtx)
            }
            let [stmtsOutF,] = cb.popCtx()

            cb.addStmts([cIfElse(cond2, stmtsOutT, stmtsOutF)])

            return
        }
    }
    else {
        return null
    }
}

function stmt_ifNil(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgStmtResult {
    if (funcName === "ifNil" && args.length === 2
        && args[1].tag === "EList" && args[1].exprs.length === 2
        && args[1].exprs[0].tag === "ELambda" && args[1].exprs[1].tag === "ELambda") {

        let thenLam = args[1].exprs[0]
        let elseLam = args[1].exprs[1]
        let thenBody = args[1].exprs[0].body
        let elseBody = args[1].exprs[1].body
        let thenPat = args[1].exprs[0].pat
        let elsePat = args[1].exprs[1].pat

        return (cb: CBuilder, stmtCtx: StmtCtx) => {
            let cond = cgc_expr(cb, args[0])

            let condVar = toVar(cb, cond)

            cb.pushNewCtx()
            {
                cgc_pat_mat(cb, typeDom(thenLam.ty1), condVar, thenPat, patMatFail_fatalError)
                cgc_stmt_stmt(cb, thenBody, stmtCtx)
            }
            let [stmtsOutT,] = cb.popCtx()

            cb.pushNewCtx()
            {
                cgc_pat_mat(cb, typeDom(elseLam.ty1), condVar, elsePat, patMatFail_fatalError)
                cgc_stmt_stmt(cb, elseBody, stmtCtx)
            }
            let [stmtsOutF,] = cb.popCtx()

            cb.addStmts([cIfElse(cg_isNil(cb, condVar), stmtsOutT, stmtsOutF)])

            return
        }
    }
    else {
        return null
    }
}


function stmt_while(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgStmtResult {
    if (funcName === "while" && args.length === 2 && args[1].tag == "ELambdaMaybe") {
        let initVal = args[0]
        let loopLam = args[1]
        let loopPat = args[1].pat
        let loopBody = args[1].body

        return (cb: CBuilder, stmtCtx: StmtCtx) => {

            let initValC = cgc_expr(cb, initVal)
            let loopVarRepr = defaultReprForType(cb, typeDom(loopLam.ty2!))
            let loopVar = cb.freshVar(loopVarRepr, "loopVar")
            cb.addStmts([cbDeclVar(cb, loopVar, initValC)])

            let whileBodySc = scContinue(scAssign(loopVar))
            cb.pushNewCtx()
            {
                // we can either pattern-match against what a while-loop body can accept
                // cgc_pat_mat(cb, typeDom(loopLam.ty1), targetVar2, loopPat, patMatFail_break)
                // or we can pattern-match against what a while-loop body is obligated to accept
                cgc_pat_mat(cb, typeDom(loopLam.ty2!), loopVar, loopPat, patMatFail_break)
                // the second approach results in fewer redundant runtime checks

                cgc_stmt_stmt(cb, loopBody, whileBodySc)
            }
            let [patBodyStmtsC,] = cb.popCtx()

            let whileC = cWhile(cCode("true"), patBodyStmtsC)
            cb.addStmts([whileC])

            sc_close(cb, stmtCtx, loopVar)
            return
        }
    }
    else {
        return null
    }
}

function stmt_while2(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgStmtResult {
    if (funcName === "while" && args.length === 2 && args[1].tag == "ELambda") {
        let initVal = args[0]
        let loopLam = args[1]
        let loopPat = args[1].pat
        let loopBody = args[1].body

        return (cb: CBuilder, stmtCtx: StmtCtx) => {

            let initValC = cgc_expr(cb, initVal)
            let loopVar = cb.freshVar(defaultReprForType(cb, initVal.ty1), "loopVar")
            cb.addStmts([cbDeclVar(cb, loopVar, initValC)])

            let loopBodySc = scMaybe(scContinue(scAssign(loopVar)), scBreak(scSkip()))
            cb.pushNewCtx()
            {
                cgc_pat_mat(cb, typeDom(loopLam.ty2!), loopVar, loopPat, patMatFail_fatalError)
                cgc_stmt_stmt(cb, loopBody, loopBodySc)
            }
            let [patBodyStmtsC,] = cb.popCtx()

            let whileC = cWhile(cCode("true"), patBodyStmtsC)
            cb.addStmts([whileC])

            sc_close(cb, stmtCtx, loopVar)
            return
        }
    }
    else {
        return null
    }
}

function stmt_loop2(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgStmtResult {
    if (funcName === "loop2" && args.length === 2 && args[1].tag === "ELambda") {
        let initVal = args[0]
        let loopLam = args[1]
        let loopPat = args[1].pat
        let loopBody = args[1].body
        return (cb: CBuilder, stmtCtx: StmtCtx) => {
            cb.addStmts([cCommentStmt("loop2 begin")])
            let initValC = cgc_expr(cb, initVal)
            // let bodyTy = typeRng(loopLam.ty1)
            let bodyTy = applyTypes(loopLam.ty1, initVal.ty1)
            let breakTy = typeHd(typeTl(intersectTypes(bodyTy, pairT(singleT("break"), anyT))))
            let breakVar = cb.freshVar(defaultReprForType(cb, breakTy), "breakVar")
            let continueRepr = initValC.repr
            let continueVar = cb.freshVar(continueRepr, "continueVar")
            cb.addStmts(
                [cDeclVarUndefined(breakVar),
                cbDeclVar(cb, continueVar, initValC),
                ])

            let loopBodySc = scBreakContinue(scBreak(scAssign(breakVar)), scContinue(scAssign(continueVar)))
            cb.pushNewCtx()
            {
                cgc_pat_mat(cb, typeDom(loopLam.ty2!), continueVar, loopPat, patMatFail_fatalError)
                cgc_stmt_stmt(cb, loopBody, loopBodySc)
            }
            let [patBodyStmtsC,] = cb.popCtx()

            let whileC = cWhile(cCode("true"), patBodyStmtsC)
            cb.addStmts([whileC])

            cb.addStmts([cCommentStmt("loop2 end")])

            sc_close(cb, stmtCtx, breakVar)
            return
        }
    }
    else {
        return null;
    }
}



function stmt_forFoldLeft(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgStmtResult {
    if (funcName === "forFoldLeft" && args.length === 3 && args[2].tag == "ELambda" && args[2].body.tag == "ELambda") {
        let zVal = args[0]
        let xVals = args[1]
        let loopLam1 = args[2]
        let loopLam2 = args[2].body
        let zPat = loopLam1.pat
        let x1Pat = loopLam2.pat
        let loopBody = args[2].body.body

        return (cb: CBuilder, stmtCtx: StmtCtx) => {

            let zRepr = defaultReprForType(cb, zVal.ty1)
            let xRepr = defaultReprForType(cb, xVals.ty1)
            let x1Repr = reprListElem(xRepr)
            let zValC = toRepr(cb, zRepr, cgc_expr(cb, zVal))
            let xValsC = cgc_expr(cb, xVals)

            let zVar = cb.freshVar(zRepr, "z")
            let xVar = cb.freshVar(xRepr, "x")
            let x1Var = cb.freshVar(x1Repr, "x1")

            cb.addStmts(
                [cCommentStmt("stmt_forFoldLeft"),
                cDeclVar(zVar, zValC),
                cDeclVar(xVar, xValsC),
                cVarDeclUndefined(reprToCType(x1Repr), x1Var),
                ])

            let bodySc = scAssign(zVar)
            cb.pushNewCtx()
            {
                cb.addStmts(
                    [cIf(cg_isNil(cb, xVar), [cBreak()]),
                    cAssignStmt(x1Var, cg_head(cb, xVar)),
                    cAssignStmt(xVar, cg_tail(cb, xVar))
                    ])
                cgc_pat_mat(cb, typeDom(loopLam1.ty2!), zVar, zPat, patMatFail_fatalError)
                cgc_pat_mat(cb, typeHd(typeDom(loopLam2.ty2!)), x1Var, x1Pat, patMatFail_fatalError)
                cgc_stmt_stmt(cb, loopBody, bodySc)
            }
            let [patBodyStmtsC,] = cb.popCtx()

            let whileC = cWhile(cCode("true"), patBodyStmtsC)
            cb.addStmts([whileC])

            sc_close(cb, stmtCtx, zVar)
            return
        }
    }
    else {
        return null
    }
}


function stmt_match(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgStmtResult {
    if (funcName === "match" && args.length === 2 && args[1].tag === "EList" && args[1].tail === null) {
        let arg0 = args[0]
        let cases = args[1]
        return (cb: CBuilder, stmtCtx: StmtCtx) => {
            let argC = toVar(cb, cgc_expr(cb, arg0))

            let doneLabel = cb.freshVar(rNone, "match_done").expr.name
            let caseLabel = cb.freshVar(rNone, "first_case_0").expr.name
            cases.exprs.forEach((c, i) => {
                cb.addStmts([
                    cLabel(caseLabel),
                ])
                let label = i + 1 == cases.exprs.length ? "fail_case" : "next_case"
                caseLabel = cb.freshVar(rNone, `${label}_${i + 1}`).expr.name
                if (c.tag === "ELambdaMaybe") {
                    cb.pushNewCtx()
                    {
                        cgc_pat_mat(cb, arg0.ty1, argC, c.pat, patMatFail_goto(caseLabel))
                        let caseStmtCtx = scGoto(stmtCtx, doneLabel)
                        cgc_stmt_stmt(cb, c.body, caseStmtCtx)
                    }
                    let [stmts,] = cb.popCtx()
                    cb.addStmts([cBlock(stmts)])
                }
                else if (c.tag === "ELambdaYes") {
                    cb.pushNewCtx()
                    {
                        cgc_pat_mat(cb, arg0.ty1, argC, c.pat, patMatFail_fatalError)
                        let caseStmtCtx = scGoto(stmtCtx, doneLabel)
                        cgc_stmt_stmt(cb, c.body, caseStmtCtx)
                    }
                    let [stmts,] = cb.popCtx()
                    cb.addStmts([cBlock(stmts)])
                }
                else if (c.tag === "ELambdaNo") {
                    cb.pushNewCtx()
                    {
                        cgc_pat_mat(cb, arg0.ty1, argC, c.pat, patMatFail_goto(caseLabel))
                        let caseStmtCtx = scMaybe(scGoto(stmtCtx, doneLabel), scGoto(scSkip(), caseLabel))
                        cgc_stmt_stmt(cb, c.body, caseStmtCtx)
                    }
                    let [stmts,] = cb.popCtx()
                    cb.addStmts([cBlock(stmts)])
                }
                else if (c.tag === "ELambda") {
                    cb.pushNewCtx()
                    {
                        cgc_pat_mat(cb, arg0.ty1, argC, c.pat, patMatFail_fatalError)
                        let caseStmtCtx = scMaybe(scGoto(stmtCtx, doneLabel), scGoto(scSkip(), caseLabel))
                        cgc_stmt_stmt(cb, c.body, caseStmtCtx)
                    }
                    let [stmts,] = cb.popCtx()
                    cb.addStmts([cBlock(stmts)])
                }
                else {
                    let caseStmtCtx = scMaybe(scGoto(stmtCtx, doneLabel), scGoto(scSkip(), caseLabel))
                    cb.pushNewCtx()
                    {
                        let func = toVar(cb, cgc_expr(cb, c))
                        let resultMb = toVar(cb, cgc_call(cb, func, [argC]))
                        sc_close(cb, caseStmtCtx, resultMb)
                    }
                    let [stmts,] = cb.popCtx()
                    cb.addStmts([cBlock(stmts)])
                }
            })
            cb.addStmts([
                cLabel(caseLabel),
            ])

            cb.addStmts([
                cExprStmt(cCall(cCode("fatalError"), [cStr(`match failed: (${showLoc(arg0.loc)})`)])),
                cLabel(doneLabel),
            ])
        }
    }
    else {
        return null
    }
}

function stmt_guardTrue(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgStmtResult {
    if (funcName === "guardTrue" && args.length === 2 && args[1].tag === "ELambdaYes") {
        let cond = args[0]
        let then = args[1]
        return (cb: CBuilder, stmtCtx: StmtCtx) => {
            let condVar = toRepr(cb, rBool, toVar(cb, cgc_expr(cb, cond)))

            let trueStmtCtx = scYes(stmtCtx)
            cb.pushNewCtx()
            {
                cgc_stmt_stmt(cb, then.body, trueStmtCtx)
            }
            let [thenStmts,] = cb.popCtx()

            let falseStmtCtx = scNo(stmtCtx)
            cb.pushNewCtx()
            {
                let nil = reprConvertFromNil(cb, rNo)
                sc_close(cb, falseStmtCtx, nil)
            }
            let [elseStmts,] = cb.popCtx()

            cb.addStmts([
                cIfElse(condVar, thenStmts, elseStmts)
            ])
        }
    }
    else {
        return null
    }
}

// function stmt_annotate_HandlerMk(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgStmtResult {
//     if (funcName === "annotate_HandlerMk" && args.length === 1) {
//         return (cb: CBuilder, stmtCtx: StmtCtx) => {

//             // TODO generate an object-implementation of the handler,
//             // TODO   save the name of this somewhere it can be found when hpsDo is encountered.
//             // TODO handle the action annotations too (hFunc0, etc)

//             // cb.addStmts([cCommentStmt(`stmt_annotate_HandlerMk ${showLoc(args[0].loc)}`)])
//             // let func = cb.getEnv()[funcName]
//             // let argsC = args.map(a => cgc_expr(cb, a))
//             // let callC = cgc_call(cb, func, argsC)
//             // sc_close(cb, stmtCtx, callC)

//             let handlerMk = toVar(cb, cgc_expr(cb, args[0]))
//             let objMkVar = cb.freshVar(cb.repr_ObjectMk, "objMk")
//             let objMkDefn = cCall(cCode("objectMk_from_handlerMk"), [toRepr(cb, cb.repr_FunAnyAny, handlerMk)])

//             cb.addGlobalStmts("AuxC", [cDeclVar(objMkVar, objMkDefn)])



//             cb.addStmts([cCommentStmt(`stmt_annotate_HandlerMk ${showLoc(args[0].loc)} ${handlerMk.expr.name} ${objMkVar.expr.name}`)])

//             let handlerMk_objMk: CExprRepr & Annotation =
//                 { ...handlerMk, annot: { annotate_HandlerMk: objMkVar } }

//             sc_close(cb, stmtCtx, handlerMk_objMk)


//         }
//     }
//     else {
//         return null
//     }
// }


let cgStmt_apply_funcs: CgStmtApplyFunc[] = [
    stmt_if,
    stmt_ifNil,
    stmt_while,
    stmt_while2,
    stmt_loop2,
    stmt_forFoldLeft,
    stmt_match,
    stmt_guardTrue,
    // stmt_annotate_HandlerMk,
    // TODO add support for 
    //   match, map, forEach, (and other polymorphic functions)
    //   CPS-style code
    //   Array and Assoc objects/handlers
]

let cgStmt_expr_funcs: CgStmtExprFunc[] = [
    // stmt_lambda
]

function isStringyRepr(repr: CRepr): boolean {
    return repr.tag === "Str" || repr.tag === "Single" || repr.tag === "Char"
}

function cg_eq(cb: CBuilder, lhs: CExprRepr, rhs: CExprRepr): CExprRepr {
    if (lhs.repr.tag === "Bool" && rhs.repr.tag === "Bool") {
        return natExpr(rBool, cOp("==", [lhs, rhs]))
    }
    else if (lhs.repr.tag === "Int" && rhs.repr.tag === "Int") {
        return natExpr(rBool, cOp("==", [lhs, rhs]))
    }
    else if (lhs.repr.tag === "Char" && rhs.repr.tag === "Char") {
        return natExpr(rBool, cCall(cCode("char_eq"), [lhs, rhs]))
    }
    else if (lhs.repr.tag === "Single" && lhs.repr.value.length === 1 && rhs.repr.tag === "Char") {
        let lhs2 = cCast(tName("Char"), cAggregate([cCode(cQuoteStr("'", lhs.repr.value))]))
        return natExpr(rBool, cCall(cCode("char_eq"), [lhs2, rhs]))
    }
    else if (lhs.repr.tag === "Char" && rhs.repr.tag === "Single" && rhs.repr.value.length === 1) {
        let rhs2 = cCast(tName("Char"), cAggregate([cCode(cQuoteStr("'", rhs.repr.value))]))
        return natExpr(rBool, cCall(cCode("char_eq"), [lhs, rhs2]))
    }
    else if (isStringyRepr(lhs.repr) && rhs.repr.tag === "Char") {
        let lhsStr = toRepr(cb, rStr, lhs)
        return natExpr(rBool, cCall(cCode("str_char_eq"), [lhsStr, rhs]))
    }
    else if (lhs.repr.tag === "Char" && isStringyRepr(rhs.repr)) {
        let rhsStr = toRepr(cb, rStr, rhs)
        return natExpr(rBool, cCall(cCode("str_char_eq"), [rhsStr, lhs]))
    }
    else if (isStringyRepr(lhs.repr) && isStringyRepr(rhs.repr)) {
        let lhsStr = toRepr(cb, rStr, lhs)
        let rhsStr = toRepr(cb, rStr, rhs)
        return natExpr(rBool, cCall(cCode("strEq"), [lhsStr, rhsStr]))
    }
    else {
        lhs = toAny(cb, lhs)
        rhs = toAny(cb, rhs)
        return natExpr(rBool, cCall(cCode("any_eq"), [lhs, rhs]))
    }
}

// wrap whatever arg is in a yes-tuple
function cg_yes(cb: CBuilder, arg: CExprRepr): CExprRepr {
    cb.addStmts([cCommentStmt(`cg_yes`)])
    let yesRepr = createYesRepr(cb, arg.repr)
    let yesVal = natExpr(yesRepr, arg.expr)
    let yesVar = toVar(cb, yesVal)
    return yesVar
}

// return no unconditionally
function cg_no(cb: CBuilder): CExprRepr {
    cb.addStmts([cCommentStmt(`cg_no`)])
    let noVal = reprConvertFromNil(cb, rNo)
    return noVal
    // let noVal = toRepr(cb, rNo, arg)
    // let noVar = toVar(cb, noVal)
    // return noVar
}

function cg_isNil(cb: CBuilder, arg: CExprRepr): CExprRepr {
    switch (arg.repr.tag) {
        case "List":
            return natExpr(rBool, cCall(cCode("list_isNil"), [cField(arg, "elems")]))
        case "Maybe":
            return natExpr(rBool, cOp("!", [cField(arg, "isYes")]))
        default:
            return natExpr(rBool, cCall(cCode("any_isNil"), [toAny(cb, arg)]))
    }
}
function cg_isPair(cb: CBuilder, arg: CExprRepr): CExprRepr {
    switch (arg.repr.tag) {
        case "List":
            return natExpr(rBool, cCall(cCode("list_isPair"), [cField(arg, "elems")]))
        case "Maybe":
            return natExpr(rBool, cField(arg, "isYes"))
        default:
            return natExpr(rBool, cCall(cCode("any_isPair"), [toAny(cb, arg)]))
    }
}
function cg_head(cb: CBuilder, arg: CExprRepr): CExprRepr {
    switch (arg.repr.tag) {
        case "List": {
            let elemRepr = arg.repr.elemRepr
            let h = cCall(cCode("list_head"), [reprToReprExpr(elemRepr), cField(arg, "elems")]);
            h = cOp("*_", [cCast(tPtr(reprToCType(elemRepr)), h)])
            return natExpr(elemRepr, h)
        }
        case "Maybe": {
            // TODO ? assert arg.isYes = true ?
            let elemRepr = arg.repr.elemRepr
            let h = cField(arg, "value");
            return natExpr(elemRepr, h)
        }
        default:
            return anyExpr(cCall(cCode("any_head"), [toAny(cb, arg)]))
    }
}
function cg_tail(cb: CBuilder, arg: CExprRepr): CExprRepr {
    switch (arg.repr.tag) {
        case "List": {
            let t = cCall(cCode("list_tail"), [reprToReprExpr(arg.repr.elemRepr), cField(arg, "elems")]);
            t = cCast(reprToCType(arg.repr), cAggregate([t]))
            return natExpr(arg.repr, t)
        }
        default:
            return anyExpr(cCall(cCode("any_tail"), [toAny(cb, arg)]))
    }
}


function isStringyType(ty: Type): boolean {
    return ty.tag === "TStr" || ty.tag === "TSingle"
    // TODO ? use a structural Ti relComp comparison ?
}

function expr_eq(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgExprResult {
    if (funcName === "==" && args.length === 2) {
        let a0 = cgc_expr(cb, args[0])
        let a1 = cgc_expr(cb, args[1])

        // we could just call cg_eq here
        //   but in some cases using the type has more precise info than the repr
        // ( this is/was partly/mostly due to the primitives using more approximate reprs than types )

        if (args[0].ty1.tag === "TBool" && args[1].ty1.tag === "TBool") {
            a0 = reprConvert(cb, rBool, a0)
            a1 = reprConvert(cb, rBool, a1)
            return natExpr(rBool, cOp("==", [a0, a1]))
        }
        else if (args[0].ty1.tag === "TInt" && args[1].ty1.tag === "TInt") {
            a0 = reprConvert(cb, rInt, a0)
            a1 = reprConvert(cb, rInt, a1)
            return natExpr(rBool, cOp("==", [a0, a1]))
        }
        else if (isStringyType(args[0].ty1) && isStringyType(args[1].ty1)) {
            a0 = reprConvert(cb, rStr, a0)
            a1 = reprConvert(cb, rStr, a1)
            return natExpr(rBool, cCall(cCode("strEq"), [a0, a1]))
        }
        else {
            return cg_eq(cb, a0, a1)
            // a0 = reprConvertToDyn(cb, a0)
            // a1 = reprConvertToDyn(cb, a1)
            // return natExpr(rBool, cCall(cCode("eq"), [a0, a1]))
        }
    }
    return null
}

function expr_length(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgExprResult {
    if (funcName === "length" && args.length === 1) {
        let a0 = cgc_expr(cb, args[0])
        if (a0.repr.tag === "List") {
            return natExpr(rInt, cCall(cCode("list_length"), [cField(a0, "elems")]))
        }
    }
    return null
}

function expr_reverse(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgExprResult {
    if (funcName === "reverse" && args.length === 1) {
        let a0 = cgc_expr(cb, args[0])
        if (a0.repr.tag === "List") {
            let aRev = cCall(cCode("list_reverse"), [reprToReprExpr(a0.repr.elemRepr), cField(a0, "elems")])
            return natExpr(a0.repr, cCast(reprToCType(a0.repr), cAggregate([aRev])))
        }
    }
    return null
}

function expr_lookup(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgExprResult {
    if (funcName === "lookup" && args.length === 2) {
        let a0 = cgc_expr(cb, args[0])
        let a1 = cgc_expr(cb, args[1])
        if (a1.repr.tag === "List") {
            let kvRepr = a1.repr.elemRepr
            let vRepr = reprTupleProjection(cb, kvRepr, 1)!
            let vMbRepr = createMaybeRepr(cb, vRepr)
            a0 = toRepr(cb, rStr, a0)
            let vMb = cCall(cCode("list_lookup"), [reprToReprExpr(kvRepr), reprToReprExpr(vMbRepr), a0, cField(a1, "elems")])
            let vMb2 = cOp("*_", [cCast(tPtr(reprToCType(vMbRepr)), vMb)])
            if (kvRepr.tag === "Any") {
                // this still gets triggered by the tdLookup function in fe4-runtest.fe
                // as it is not clear enough that the key type is Str
                // ( this is why lookupAny is temporarily being used there instead )
                console.log("BREAK")
            }
            return natExpr(vMbRepr, vMb2)
        }
    }
    return null
}

let cgExpr_apply_funcs: CgExprApplyFunc[] = [
    expr_eq,
    expr_length,
    expr_reverse,
    expr_lookup,
    // expr_hpsDo,
]

// // these annot function all behave as identity functions and can be ignored
// let annotFuncNames = ["hFunc0", "hFunc1", "hFunc2", "hFunc3"]
// let hpsActionFuncs = ["hpsAction0", "hpsAction1", "hpsAction2", "hpsAction3", "hpsAction4", "hpsAction5"]

// function isAnnotFunc(expr: ExprTypeBidir): boolean {
//     // let result = (expr.tag === "EVar" && annotFuncNames.indexOf(expr.name) !== -1)
//     let result = (expr.tag === "EVar" && (annotFuncNames.indexOf(expr.name) !== -1 || hpsActionFuncs.indexOf(expr.name) !== -1))
//     return result
// }

// function isHpsActionFunc(expr: ExprTypeBidir): boolean {
//     let result = (expr.tag === "EVar" && hpsActionFuncs.indexOf(expr.name) !== -1)
//     return result
// }

// function hps_skip_annot_funcs(expr0: ExprTypeBidir): ExprTypeBidir {
//     let expr = expr0
//     while (true) {
//         switch (expr.tag) {
//             case "EApply":
//                 if (isAnnotFunc(expr.func)) {
//                     expr = expr.arg
//                     continue
//                 }
//                 else {
//                     break
//                 }
//             default:
//                 // throw new Error("hps_skip_annot_funcs: failed")
//                 break
//         }
//         break
//     }
//     return expr
// }

// function hps_param_body_split(expr0: ExprTypeBidir): [ExprTypeBidir[], ExprTypeBidir, ExprTypeBidir] {
//     let expr = expr0
//     let params: ExprTypeBidir[] = []

//     while (true) {
//         switch (expr.tag) {
//             case "ELambda":
//                 // TODO don't hard-code "k"
//                 // TODO for hpsAction{0,1,2,3} function, we'll encounter a "handler" pattern too
//                 // TODO best to handle these things after the split
//                 // TODO or, best to use types to determine where we are, and what lambda this is
//                 if (rootPatName(expr.arg) === "k") {
//                     // expr = expr.body
//                     return [params, expr.arg, expr.body]
//                     break
//                 }
//                 else {
//                     params.push(expr.arg)
//                     expr = expr.body
//                     continue
//                 }
//             case "EApply":
//                 if (isAnnotFunc(expr.func)) {
//                     expr = expr.arg
//                     continue
//                 }
//                 else {
//                     // break
//                 }
//             default:
//                 throw new Error("hps_param_body_split: failed")
//         }
//         break
//     }

//     // return [params, expr]
// }

// function expr_hpsDo(cb: CBuilder, funcName: string, args: ExprTypeBidir[]): CgExprResult {
//     if (funcName === "hpsDo" && args.length === 3 && args[1].tag === "EVar") {
//         let [tyFe, actionFe, handlerFe] = args
//         let ty = cgc_expr(cb, args[0])
//         let actionC = cgc_expr(cb, args[1])
//         let handlerC = cgc_expr(cb, args[2])
//         cb.addStmts([cCommentStmt(`expr_hpsDo: ${cShowExpr(ty.expr)} ${cShowExpr(actionC.expr)} ${cShowExpr(handlerC.expr)}`)])
//         let a1_annot = actionC as CExprRepr & Annot_FeExpr
//         if (a1_annot.exprFe !== undefined) {
//             // cb.addStmts([cCommentStmt(`expr_hpsDo: ${JSON.stringify(ex.showExp(a1_annot.exprFe))}`)])
//             cb.addStmts([cCommentStmt(`expr_hpsDo: exprFe annot found`)])

//             let actionSyncVarC = cg_hps_sync(cb, actionFe)
//             // ignore the result for now, the cg_sync_hps function is still WIP

//             cb.addStmts([cCommentStmt(`expr_hpsDo: actionSync ${cShowExpr(actionSyncVarC.expr)}`)])

//         }

//         // fallback to using the async implementation
//         let func = cb.getEnv()["hpsDo"]
//         let result = cgc_call(cb, func, [ty, actionC, handlerC])
//         return result
//     }
//     return null
// }

// type StmtCtxMap = { [name: string]: StmtCtx }

// function hps_loop(cb: CBuilder, scm: StmtCtxMap, objectVar: CVarRepr, initVal: ExprTypeBidir, loopLambda: ExprTypeBidir, k: ExprTypeBidir): boolean {
//     if (loopLambda.tag === "ELambda" && loopLambda.body.tag === "ELambda" && loopLambda.body.body.tag === "ELambda") {
//         let loopPat = loopLambda.arg
//         let kBreak = rootPatName(loopLambda.body.arg)
//         let kContinue = rootPatName(loopLambda.body.body.arg)
//         let loopBody = loopLambda.body.body.body

//         if (kBreak === undefined || kContinue === undefined) {
//             return false
//         }

//         if (k.tag === "ELambda") {
//             let nextPat = k.arg
//             let nextStmt = k.body

//             let initValC = toRepr(cb, rAny, cgc_expr(cb, initVal))
//             let breakVar = cb.freshVar(rAny, "breakVar")
//             let continueVar = cb.freshVar(rAny, "continueVar")
//             let loopVar = cb.freshVar(rAny, "loopVar")

//             cb.pushNewCtx()
//             {
//                 cb.addStmts([cAssignStmt(loopVar, continueVar)])
//                 cgc_pat_mat(cb, anyT, loopVar, loopPat, patMatFail_break)
//                 let scm2 = { ...scm }
//                 scm2[kBreak] = scAssign(breakVar)
//                 scm2[kContinue] = scAssign(continueVar)
//                 cgc_hps_stmt(cb, loopBody, scm2, objectVar)
//             }
//             let [stmts,] = cb.popCtx()

//             cb.addStmts([
//                 cDeclVarUndefined(loopVar),
//                 cDeclVarUndefined(breakVar),
//                 cDeclVarUndefined(continueVar),
//                 cAssignStmt(continueVar, initValC),
//                 cWhile(cCode("true"), [
//                     ...stmts
//                 ])
//             ])

//             cgc_pat_mat(cb, anyT, breakVar, nextPat, patMatFail_fatalError)

//             let ok = cgc_hps_stmt(cb, nextStmt, scm, objectVar)

//             return ok
//         }
//     }
//     return false
// }

// function hps_match(cb: CBuilder, scm: StmtCtxMap, objectVar: CVarRepr, val: ExprTypeBidir, branches: ExprTypeBidir[]): boolean {
//     cb.addStmts([cCommentStmt("hps_match: TODO")])

//     let arg0 = val
//     let cases = { exprs: branches }
//     // TODO don't hard-code "k"
//     let stmtCtx = scm["k"]
//     let argC = toVar(cb, cgc_expr(cb, arg0))

//     let doneLabel = cb.freshVar(rNone, "match_done").expr.name
//     let caseLabel = cb.freshVar(rNone, "first_case_0").expr.name
//     cases.exprs.forEach((c, i) => {
//         cb.addStmts([
//             cLabel(caseLabel),
//         ])
//         let label = i + 1 == cases.exprs.length ? "fail_case" : "next_case"
//         caseLabel = cb.freshVar(rNone, `${label}_${i + 1}`).expr.name
//         if (c.tag === "ELambdaMaybe") {
//             cb.pushNewCtx()
//             {
//                 cgc_pat_mat(cb, arg0.ty1, argC, c.arg, patMatFail_goto(caseLabel))
//                 let caseStmtCtx = scGoto(stmtCtx, doneLabel)
//                 // cgc_hps_stmt(cb, c.body, scm, objectVar)
//             }
//             let [stmts,] = cb.popCtx()
//             cb.addStmts([cBlock(stmts)])
//         }
//         else if (c.tag === "ELambdaYes") {
//             cb.pushNewCtx()
//             {
//                 cgc_pat_mat(cb, arg0.ty1, argC, c.arg, patMatFail_fatalError)
//                 let caseStmtCtx = scGoto(stmtCtx, doneLabel)
//                 // cgc_hps_stmt(cb, c.body, scm, objectVar)
//             }
//             let [stmts,] = cb.popCtx()
//             cb.addStmts([cBlock(stmts)])
//         }
//         else if (c.tag === "ELambdaNo") {
//             cb.pushNewCtx()
//             {
//                 cgc_pat_mat(cb, arg0.ty1, argC, c.arg, patMatFail_goto(caseLabel))
//                 let caseStmtCtx = scMaybe(scGoto(stmtCtx, doneLabel), scGoto(scSkip(), caseLabel))
//                 // cgc_hps_stmt(cb, c.body, scm, objectVar)
//             }
//             let [stmts,] = cb.popCtx()
//             cb.addStmts([cBlock(stmts)])
//         }
//         else if (c.tag === "ELambda") {
//             cb.pushNewCtx()
//             {
//                 cgc_pat_mat(cb, arg0.ty1, argC, c.arg, patMatFail_fatalError)
//                 let caseStmtCtx = scMaybe(scGoto(stmtCtx, doneLabel), scGoto(scSkip(), caseLabel))
//                 // cgc_hps_stmt(cb, c.body, scm, objectVar)
//             }
//             let [stmts,] = cb.popCtx()
//             cb.addStmts([cBlock(stmts)])
//         }
//         else {
//             let caseStmtCtx = scMaybe(scGoto(stmtCtx, doneLabel), scGoto(scSkip(), caseLabel))
//             cb.pushNewCtx()
//             {
//                 let func = toVar(cb, cgc_expr(cb, c))
//                 let resultMb = toVar(cb, cgc_call(cb, func, [argC]))
//                 sc_close(cb, caseStmtCtx, resultMb)
//             }
//             let [stmts,] = cb.popCtx()
//             cb.addStmts([cBlock(stmts)])
//         }
//     })
//     cb.addStmts([
//         cLabel(caseLabel),
//     ])

//     cb.addStmts([
//         cExprStmt(cCall(cCode("fatalError"), [cStr(`match failed: (${showLoc(arg0.loc)})`)])),
//         cLabel(doneLabel),
//     ])


//     return true
// }

// function cgc_hps_stmt(cb: CBuilder, expr: ExprTypeBidir, scm: StmtCtxMap, objectVar: CVarRepr): boolean {
//     let chs = (expr: ExprTypeBidir, scm: StmtCtxMap) => cgc_hps_stmt(cb, expr, scm, objectVar)

//     // we can remove this env-assignment once the continuation-call below handles things
//     // (without this, the lookup of "k" fails)
//     // cb.getEnv()["k"] = prims["error"] as CVarRepr
//     // cgc_stmt_stmt(cb, expr, scm["k"])

//     // TODO let bindings
//     // TODO hLoop2
//     // TODO action call
//     // TODO "match" without a following continuation
//     // TODO continuation call
//     // TODO error call
//     // TODO 
//     // TODO 
//     // TODO 

//     let args: ExprTypeBidir[] = []
//     let func: ExprTypeBidir = expr
//     while (func.tag === "EApply") {
//         args.unshift(func.arg)
//         func = func.func
//     }
//     let lastArg = args.at(-1)

//     // hLoop2 call
//     if (func.tag === "EVar" && func.name === "hLoop2" && args.length === 3) {
//         let [initVal, loopLambda, k] = args
//         let ok = hps_loop(cb, scm, objectVar, initVal, loopLambda, k)
//         return ok
//     }
//     // // hLoop2 call
//     // else if (func.tag === "EVar" && func.name === "hLoop2" && args.length === 3) {
//     //     let [initVal, loopLambda, k] = args
//     //     if (loopLambda.tag === "ELambda" && loopLambda.body.tag === "ELambda" && loopLambda.body.body.tag === "ELambda") {
//     //         let loopPat = loopLambda.arg
//     //         let kBreak = rootPatName(loopLambda.body.arg)
//     //         let kContinue = rootPatName(loopLambda.body.body.arg)
//     //         let loopBody = loopLambda.body.body.body

//     //         if (kBreak === undefined || kContinue === undefined) {
//     //             return false
//     //         }

//     //         if (k.tag === "ELambda") {
//     //             let nextPat = k.arg
//     //             let nextStmt = k.body

//     //             let initValC = toRepr(cb, rAny, cgc_expr(cb, initVal))
//     //             let breakVar = cb.freshVar(rAny, "breakVar")
//     //             let continueVar = cb.freshVar(rAny, "continueVar")
//     //             let loopVar = cb.freshVar(rAny, "loopVar")

//     //             cb.pushNewCtx()
//     //             {
//     //                 cb.addStmts([cAssignStmt(loopVar, continueVar)])
//     //                 cgc_pat_mat(cb, anyT, loopVar, loopPat, patMatFail_break)
//     //                 let scm2 = { ...scm }
//     //                 scm2[kBreak] = scAssign(breakVar)
//     //                 scm2[kContinue] = scAssign(continueVar)
//     //                 chs(loopBody, scm2)
//     //             }
//     //             let [stmts,] = cb.popCtx()

//     //             cb.addStmts([
//     //                 cDeclVarUndefined(loopVar),
//     //                 cDeclVarUndefined(breakVar),
//     //                 cDeclVarUndefined(continueVar),
//     //                 cAssignStmt(continueVar, initValC),
//     //                 cWhile(cCode("true"), [
//     //                     ...stmts
//     //                 ])
//     //             ])

//     //             cgc_pat_mat(cb, anyT, breakVar, nextPat, patMatFail_fatalError)

//     //             let ok = chs(nextStmt, scm)

//     //             return ok
//     //         }
//     //     }
//     //     return false
//     // }
//     // TODO handle match call without a following k
//     else if (func.tag === "EVar" && func.name === "match" && args.length === 2 && args[1].tag === "EList") {
//         let [val, branches] = args

//         let ok = hps_match(cb, scm, objectVar, val, branches.exprs)

//         return ok
//     }

//     // else if (isHpsActionFunc(func)) {
//     //     let actionVar = cg_hps_action(cb, args[0])
//     // }

//     // action call
//     // else if (expr.tag === "EApply" && expr.arg.tag === "ELambda") {
//     //     // let args: ExprTypeBidir[] = []
//     //     // let func: ExprTypeBidir = expr
//     //     // while (func.tag === "EApply") {
//     //     //     args.push(func.arg)
//     //     //     func = func.func
//     //     // }
//     //     if (func.tag !== "EVar") {
//     //         throw new Error("only direct function calls supported for now")
//     //     }
//     //     let funcSync = cg_hps_sync(cb, func)
//     //     let argsC = args.map(a => cgc_expr(cb, a))
//     //     let callC = cgc_call(cb, funcSync, argsC)
//     //     // TODO use the correct type, not anyT
//     //     cgc_pat_mat(cb, anyT, toVar(cb, callC), expr.arg.arg, patMatFail_fatalError)
//     //     return true
//     // }
//     // action call
//     else if (lastArg !== undefined && lastArg.tag === "ELambda") {
//         let args2 = args.slice(0, -1)
//         if (func.tag !== "EVar") {
//             throw new Error("only direct function calls supported for now")
//         }
//         let funcSync = cg_hps_sync(cb, func)
//         let argsC = args2.map(a => cgc_expr(cb, a))
//         let callC = cgc_call(cb, funcSync, argsC)
//         // TODO use the correct type, not anyT
//         cgc_pat_mat(cb, anyT, toVar(cb, callC), lastArg.arg, patMatFail_fatalError)
//         let ok = chs(lastArg.body, scm)
//         return ok
//     }
//     // continuation call
//     else if (expr.tag === "EApply" && expr.func.tag === "EVar" && scm[expr.func.name] !== undefined) {
//         let sc = scm[expr.func.name]
//         let argC = cgc_expr_stmt(cb, expr.arg)
//         sc_close(cb, sc, argC)
//         return true
//     }
//     // let-binding
//     else if (expr.tag === "ELet") {
//         expr.decls.forEach(d => {
//             let [pat, defn] = d
//             let defnVar = toVar(cb, cgc_expr(cb, defn))
//             cgc_pat_mat(cb, anyT, defnVar, pat, patMatFail_fatalError)
//         })
//         let ok = chs(expr.expr, scm)
//         return ok
//     }
//     // handler-call
//     // else if (expr.tag === "EApply" && expr.func.tag === "EApply" && expr.func.func.tag === "EApply" && rootPatName(expr.func.func.func) === handlerName) {
//     //     let methodName = cgc_expr(cb, expr.func.func.arg)
//     //     let methodArgs = cgc_expr(cb, expr.func.arg)
//     //     let objCallResult = toVar(cb, cgc_call(cb, objectVar, [methodName, methodArgs]))
//     //     let obj2 = cg_head(cb, objCallResult)
//     //     // TODO overwrite the original object with obj2
//     //     // TODO we should only be able to reach this point in synchronous code if 
//     //     // TODO something, somewhere, further up the stack ensures a singly-held object is passed down
//     //     // TODO   it's not (shouldn't be) possible for a user to call synchronous/linear code directly

//     //     // TODO implement a ReprObject, that handles this in-place update of the object internally, 
//     //     // TODO when called as an object from synchronous/linear code,
//     //     // TODO if it's called via a ReprClos, or an Any, then the ReprObject's own adapter function should take care of copying as needed
//     //     let returnValue = cg_head(cb, cg_tail(cb, objCallResult))
//     //     cb.addStmts([cReturn(returnValue)])
//     //     return true
//     // }
//     // unhandled
//     else {
//         cb.addStmts([cCommentStmt(`cgc_hps_stmt: unhandled code structure ${showLoc(expr.loc)}`)])
//         // unfortunatetly there's no fallback method
//         // there's no general way to convert arbitrary continuation control-flow to local-only control-flow
//         // unless, perhaps, we switch to step-style here, and trampoline anything/everything not handled earlier
//         // not needed for now
//         return false
//     }

// }

// // // we probably don't need this function at all
// // // it will end up so similar to cg_hps_sync, that we might as well 
// // // place the handling of hpsAction{0,1,2,3} functions in there
// // function cg_hps_action1(cb: CBuilder, action: ExprTypeBidir): CVarRepr {
// //     if (action.tag !== "EApply" || !isAnnotFunc(action.func)) {
// //         throw new Error("cg_hps_action: expected an action func")
// //     }

// //     let body = action.arg
// //     let pats: ExprTypeBidir[] = []
// //     while (body.tag === "ELambda") {
// //         pats.push(body.arg)
// //         body = body.body
// //     }

// //     if (pats.length < 2) {
// //         throw new Error("cg_hps_action: require at least 'k' and 'handler' patterns")
// //     }

// //     let handlerPat = pats.pop()!
// //     let kPat = pats.pop()!

// //     let argNameReprs: [string, CRepr][] = pats.map(p => [rootPatName(p)!, defaultReprForType(cb, p.ty1)])
// //     argNameReprs.unshift(["object", rObject])

// //     let argReprs = argNameReprs.map(([name, repr]) => repr)
// //     let argNameTypes: [string, CType][] = argNameReprs.map(([name, repr]) => [name, reprToCType(repr)])
// //     let returnRepr = defaultReprForType(cb, kPat.ty1)
// //     let returnType = reprToCType(returnRepr)
// //     let funcR = createFuncRepr(cb, argReprs, returnRepr)
// //     let funcVar = cb.freshVar(funcR)

// //     let returnVar = cb.freshVar(returnRepr, "returnVar")

// //     let scm: StmtCtxMap = {}
// //     scm[rootPatName(kPat)!] = scAssign(returnVar)
// //     cb.pushNewCtx()
// //     {
// //         // cgc_hps_stmt(cb, body, scm)
// //     }
// //     let [stmts,] = cb.popCtx()

// //     let funcC = cFunc(funcVar, argNameTypes, returnType, stmts)
// //     cb.addGlobalStmts("Usr", [funcC])
// //     return funcVar
// // }

// function cg_hps_action(cb: CBuilder, action: VarTypeBidir, actionVarC: CVarRepr, params: ExprTypeBidir[], kPat: ExprTypeBidir, actionPat: ExprTypeBidir, actionBody: ExprTypeBidir): CVarRepr {
//     let handlerName = rootPatName(actionPat)
//     if (handlerName === undefined) {
//         throw new Error("cg_hps_action: handler must have a name")
//     }

//     let paramsVarC: CVarRepr[] = []
//     for (let p of params) {
//         let pVarC = cb.freshVar(rAny)
//         paramsVarC.push(pVarC)
//         cgc_pat_mat(cb, anyT, actionVarC, p, patMatFail_fatalError)
//         // cgc_pat_mat(cb, anyT, pVarC, p, patMatFail_fatalError)
//     }

//     let paramRs = params.map(p => defaultReprForType(cb, p.ty1))
//     paramRs.unshift(rObject)
//     // let resultR = defaultReprForType(cb, typeDom(kPat.ty1))
//     let resultR = rAny

//     // TODO we should be able to retrive funcR from closR, rather than calling two create???Repr functions
//     let funcR = createFuncRepr(cb, paramRs, resultR)
//     let closR = createClosRepr(cb, paramRs, resultR)

//     // TODO use the depth of the definition to determine what stack depth to place the sync-version at

//     let depth = actionVarC.expr.depth
//     let varSyncC = cb.freshVar(funcR, `SYNC_Action_${action.name}`, depth)

//     let objectVar = cb.freshVar(resultR, "objectPtr")
//     // let objectTy = tPtr(tAny)
//     let objectTy = tAny

//     cb.pushNewCtx()
//     {
//         let returnVar = cb.freshVar(resultR, "returnVar")
//         // cb.addStmts([cDeclVarUndefined(returnVar)])
//         // TODO the use of "{}" here is just to keep the code compiling
//         // TODO still need to make sure the variable actually gets assigned to
//         // cb.addStmts([cDeclVar(returnVar, cCode("{}"))])

//         let expr = actionBody
//         if (expr.tag === "EApply" && expr.func.tag === "EApply" && expr.func.func.tag === "EApply" && rootPatName(expr.func.func.func) === handlerName) {
//             let methodName = cgc_expr(cb, expr.func.func.arg)
//             let methodArgs = cgc_expr(cb, expr.func.arg)
//             let objCallResult = toVar(cb, cgc_call(cb, objectVar, [methodName, methodArgs]))
//             let obj2 = cg_head(cb, objCallResult)
//             let returnValue = cg_head(cb, cg_tail(cb, objCallResult))
//             let obj2Var = cb.freshVar(rAny, "obj2")
//             cb.addStmts([
//                 cbDeclVar(cb, obj2Var, obj2),
//                 cbDeclVar(cb, returnVar, returnValue),
//                 cCommentStmt("TODO: update objectPtr with obj2"),
//                 cReturn(returnVar)
//             ])
//         }
//     }
//     let [stmtsC,] = cb.popCtx()

//     let syncStmts: CStmts = [
//         ...stmtsC,
//     ]

//     let paramTs: [string, CType][] = params.map((p, i) => [rootPatName(p)!, reprToCType(defaultReprForType(cb, p.ty1))])
//     paramTs.unshift([objectVar.expr.name, objectTy])
//     let resultT = reprToCType(resultR)

//     let funcDecl = cFunc(varSyncC, paramTs, resultT, syncStmts)

//     let envVar = cCode("NULL")

//     let closValue =
//         cCast(closR.closCTy,
//             cAggregate([
//                 cCast(closR.funcCTy, varSyncC),
//                 envVar
//             ])
//         )

//     let closVar = cb.freshVar(closR, `SYNC_Clos_${action.name}`, depth)

//     cb.addStmts([cDeclConst(closVar, closValue)])

//     cb.addGlobalStmts("Usr", [funcDecl])

//     return closVar
// }

// // takes the definition of an handler-taking async function, and generates an object-taking sync function
// function cg_hps_sync(cb: CBuilder, action: VarTypeBidir): CVarRepr {
//     // TODO generate synchronous C code from hps Fe code

//     let actionVarC = cb.getEnv()[action.name]
//     let action_annot = actionVarC as CExprRepr & Annot_FeExpr
//     if (action_annot.exprFe === undefined) {
//         throw new Error("cg_hps_sync: action_annot defn missing")
//     }
//     let action_defn = action_annot.exprFe
//     // TODO keep a record of whether we should expect to see a "handler" pattern or not
//     // TODO   that is, do we pass an hpsAction{0,1,2,3} annotation
//     action_defn = hps_skip_annot_funcs(action_defn)

//     let recVarName: string | null = null
//     if (action_defn.tag === "EApply" && action_defn.func.tag === "EVar" && action_defn.func.name === "rec" && action_defn.arg.tag === "ELambda") {
//         let name = rootPatName(action_defn.arg.arg)
//         if (name === undefined) {
//             throw new Error("cg_hps_sync: failed to find rec <| name ->")
//         }
//         recVarName = name
//         action_defn = action_defn.arg.body
//     }

//     let [params, kPat, body] = hps_param_body_split(action_defn)
//     // TODO after the split, peel off the "k" pattern and, if expected, the "handler" pattern

//     // let handlerName: string | null = null

//     // if (body.tag === "ELambda") {
//     //     let handlerNameU = rootPatName(body.arg)
//     //     if (handlerNameU===undefined) {
//     //         throw new Error("cg_hps_sync: handler must have a name")
//     //     }
//     //     handlerName = handlerNameU
//     //     body = body.body
//     // }

//     if (body.tag === "ELambda") {
//         // if the first thing we see inside the async function is a lambda, 
//         // then the function is working directly with the handler
//         let actionFunc = cg_hps_action(cb, action, actionVarC, params, kPat, body.arg, body.body)
//         return actionFunc
//     }

//     // TODO Need to handle parameter pat-binding correctly.
//     // TODO Currently hParseExpr calls hTryParseExpr directly and
//     // TODO   hTryParseExpr calls hParseExpr indirectly via a parameter.
//     // TODO Calling HPS functions indirectly isn't currently implemented,
//     // TODO   but the present problem is it is not even aparent it is an indirect call
//     // TODO The code treats it as a direct call, and goes into an infinite loop

//     let paramsVarC: CVarRepr[] = []
//     for (let p of params) {
//         let pVarC = cb.freshVar(rAny)
//         paramsVarC.push(pVarC)
//         cgc_pat_mat(cb, anyT, actionVarC, p, patMatFail_fatalError)
//     }

//     let paramRs = params.map(p => defaultReprForType(cb, p.ty1))
//     paramRs.unshift(rObject)
//     // let resultR = defaultReprForType(cb, typeDom(kPat.ty1))
//     let resultR = rAny

//     // TODO we should be able to retrive funcR from closR, rather than calling two create???Repr functions
//     let funcR = createFuncRepr(cb, paramRs, resultR)
//     let closR = createClosRepr(cb, paramRs, resultR)

//     // TODO use the depth of the definition to determine what stack depth to place the sync-version at

//     let depth = actionVarC.expr.depth
//     // TODO replace rInt with a suitable CRepr for a sync-handler/object function
//     let varSyncC = cb.freshVar(funcR, `SYNC_Func_${action.name}`, depth)

//     // TODO ? suspend/resume stack ?
//     // TODO ?   swap out the stack above depth, 
//     // TODO ?   so as to only access variables at depth "depth" or below
//     // TODO ?   and so as to insert things at the right depth
//     // TODO ?   swap it back where we are done

//     let objectVar = cb.freshVar(resultR, "objectPtr")
//     // let objectTy = tPtr(tAny)
//     let objectTy = tAny

//     cb.pushNewCtx()
//     {
//         let returnVar = cb.freshVar(resultR, "returnVar")
//         // cb.addStmts([cDeclVarUndefined(returnVar)])
//         // TODO the use of "{}" here is just to keep the code compiling
//         // TODO still need to make sure the variable actually gets assigned to
//         // cb.addStmts([cDeclVar(returnVar, cCode("{}"))])
//         cb.addStmts([cDeclVarUndefined(returnVar)])
//         // cb.getEnv()["k"] = prims["error"] as CVarRepr
//         // cgc_stmt_stmt(cb, body, scAssign(returnVar))
//         let sc = scAssign(returnVar)
//         let scm: StmtCtxMap = { k: sc }
//         cgc_hps_stmt(cb, body, scm, objectVar)
//         cb.addStmts([cReturn(returnVar)])
//     }
//     let [stmtsC,] = cb.popCtx()

//     let syncStmts: CStmts = [
//         // cDeclVarUndefined(varSyncC),
//         ...stmtsC,
//         cExprStmt(cCall(cCode("fatalError"), [cCode('"cg_hps_sync: TODO"')]))
//     ]

//     // let paramTs: [string, CType][] = paramRs.map((p, i) => [`_${i}`, reprToCType(p)])
//     let paramTs: [string, CType][] = params.map((p, i) => [rootPatName(p)!, reprToCType(defaultReprForType(cb, p.ty1))])
//     // let paramTs: [string, CType][] = params.map((p, i) => [cb.getEnv()[rootPatName(p)!].expr.name, reprToCType(defaultReprForType(cb, p.ty1))])
//     paramTs.unshift([objectVar.expr.name, objectTy])
//     let resultT = reprToCType(resultR)

//     let funcDecl = cFunc(varSyncC, paramTs, resultT, syncStmts)

//     let envVar = cCode("NULL")

//     let closValue =
//         cCast(closR.closCTy,
//             cAggregate([
//                 cCast(closR.funcCTy, varSyncC),
//                 envVar
//             ])
//         )

//     let closVar = cb.freshVar(closR, `SYNC_Clos_${action.name}`, depth)

//     cb.addStmts([cDeclConst(closVar, closValue)])

//     cb.addGlobalStmts("Usr", [funcDecl])



//     // TODO generate the body of the sync-handler/object function


//     // cb.insertStmts(depth, syncStmts)
//     // return varSyncC
//     return closVar
// }







function getFuncArgs_OrNull(cb: CBuilder, expr: ExprTypeBidir): [string, ExprTypeBidir[]] | null {
    let args: ExprTypeBidir[] = []
    let expr2 = expr
    while (expr2.tag === "EApply") {
        args.unshift(expr2.arg)
        expr2 = expr2.func
    }
    let funcName: string | undefined
    if (expr2.tag === "EVar" && args.length !== 0) {
        funcName = expr2.name
        return [funcName, args]
    }
    else {
        return null
    }
}

function cgFuncArgs_OrNull(cb: CBuilder, expr: ExprTypeBidir): CgExprResult {
    let apply_func = getFuncArgs_OrNull(cb, expr)
    if (apply_func === null) {
        return null
    }
    let [funcName, args] = apply_func
    for (let i = 0; i !== cgExpr_apply_funcs.length; i++) {
        let expr_func = cgExpr_apply_funcs[i]
        let exprCMb = expr_func(cb, funcName, args)
        if (exprCMb !== null) {
            return exprCMb
        }
        // TODO ? handle surplus arguments
        // TODO ?   the expr_??? fnuctions can fail if given too many arguments
        // TODO ?   for example, if the result lookup is function which is immediately applied
    }
    return null
}



function find_stmt_func(cb: CBuilder, expr: ExprTypeBidir): CgStmtResult | null {
    let args: ExprTypeBidir[] = []
    let expr2 = expr
    while (expr2.tag === "EApply") {
        args.unshift(expr2.arg)
        expr2 = expr2.func
    }
    let funcName: string | undefined
    if (expr2.tag === "EVar") {
        funcName = expr2.name
    }

    if (funcName !== undefined && args.length !== 0) {
        for (let i = 0; i !== cgStmt_apply_funcs.length; i++) {
            let cgsf = cgStmt_apply_funcs[i]
            let cgsResult = cgsf(cb, funcName, args)
            if (cgsResult !== null) {
                return cgsResult
            }
        }
    }

    for (let i = 0; i !== cgStmt_expr_funcs.length; i++) {
        let cgsf = cgStmt_expr_funcs[i]
        let cgsResult = cgsf(cb, expr)
        if (cgsResult !== null) {
            return cgsResult
        }
    }

    return null
}

type CtxFunc = (cb: CBuilder, stmtCtx: StmtCtx, expr: ExprTypeBidir) => boolean

function ctx_loop_break_continue(cb: CBuilder, stmtCtx: StmtCtx, expr: ExprTypeBidir): boolean {
    if (stmtCtx.tag !== "ScBreakContinue") {
        return false
    }
    if (expr.tag === "EApply" && expr.func.tag === "EVar" && expr.func.name === "break") {
        let targetRepr = getTargetReprFromStmtCtx(cb, stmtCtx.breakSc)
        let exprC = cgc_expr_stmt(cb, expr.arg, targetRepr)
        sc_close(cb, stmtCtx.breakSc, exprC)
        return true
    }
    if (expr.tag === "EApply" && expr.func.tag === "EVar" && expr.func.name === "continue") {
        let targetRepr = getTargetReprFromStmtCtx(cb, stmtCtx.continueSc)
        let exprC = cgc_expr_stmt(cb, expr.arg, targetRepr)
        sc_close(cb, stmtCtx.continueSc, exprC)
        return true
    }
    if (expr.tag === "EApply" && expr.func.tag === "EVar" && expr.func.name === "error") {
        let exprC = cgc_expr_stmt(cb, expr)
        cb.addStmts([cExprStmt(exprC), cCommentStmt("unreachable")])
        return true
    }
    return false
}

// function ctx_goto_loop_break_continue(cb: CBuilder, stmtCtx: StmtCtx, expr: ExprTypeBidir): boolean {
//     if (stmtCtx.tag === "ScGoto" && stmtCtx.sc.tag === "ScBreakContinue") {
//         return ctx_loop_break_continue(cb, stmtCtx.sc, expr)
//     }
//     return false
// }

let ctx_funcs: CtxFunc[] = [
    ctx_loop_break_continue,
    // ctx_goto_loop_break_continue
]

function tryCtxFunc(cb: CBuilder, stmtCtx: StmtCtx, expr: ExprTypeBidir): boolean {
    for (let i = 0; i != ctx_funcs.length; i++) {
        let func = ctx_funcs[i]
        let ok = func(cb, stmtCtx, expr)
        if (ok) {
            return true
        }
    }
    return false
}

// from an expr-context, generate statements, if possible, otherwise fallback to expression generation
function cgc_expr_stmt(cb: CBuilder, expr: ExprTypeBidir, targetRepr?: CRepr): CExprRepr {

    let stmt_func = find_stmt_func(cb, expr)
    if (stmt_func !== null) {
        // TODO ? use targetRepr ?
        let varR = defaultReprForType(cb, expr.ty1)
        let resultVar = cb.freshVar(varR)
        cb.addStmts([cVarDeclUndefined(reprToCType(varR), resultVar)])
        let stmtCtx = scAssign(resultVar)
        stmt_func(cb, stmtCtx)
        return resultVar
    }
    else {
        // if no mixin handled the code, fallback to expression oriented codegen
        let exprC = cgc_expr_base(cb, expr, targetRepr)
        return exprC
    }
}

function getLambdaOrNull(expr: ExprTypeBidir): ExprTypeBidir | null {
    switch (expr.tag) {
        case "ELambda":
        case "ELambdaNo":
        case "ELambdaYes":
        case "ELambdaMaybe":
            return expr
        case "ETermBrackets":
            return getLambdaOrNull(expr.expr)
        case "EType":
            return getLambdaOrNull(expr.expr)
        default:
            return null
    }
}

// From a decl-context, generate statements/declarations, if possible, otherwise fallback to expression generation.
function cgc_decl_stmt(cb: CBuilder, defn: ExprTypeBidir, pat: ExprTypeBidir, env?: Env): void {
    // use type names from the source code in the generated code
    if (pat.tag === "EVar" && env !== undefined) {
        // If there is there is top-level name-shadowing of type-defns,
        //   then this will only find one of those definitions, (possibly not the one being defined here).
        // The other will end up with the generated structural name,
        //   even though it has a name in the source code.
        // Not expecting this to occur in practice, but should be more careful in fe-in-fe
        let val = env[pat.name]
        if (val !== undefined) {
            let [node, ty] = val
            if (ty.tag === "TType" || ty.tag === "TSingleType") {
                let tyVal = evalNode(node)
                if (tyVal.tag === "type") {
                    let repr = defaultReprForType(cb, tyVal.type, undefined, undefined, "_" + pat.name)
                    // ignore the result, the function is only called to get first-dibs on the name used for the type
                }
            }
        }
    }

    let targetRepr = defaultReprForType(cb, pat.ty1)
    let nameHint = rootPatName(pat)

    let lamExpr = getLambdaOrNull(defn)
    if (lamExpr !== null) {
        let exprC = cgc_lambda3(cb, lamExpr, nameHint, targetRepr)
        if (nameHint !== undefined && exprC.expr.tag === "CVar") {
            // cb.getEnv()[nameHint] = exprC as CVarRepr
            let varC = exprC as CVarRepr
            // let varC2: CVarRepr & Annot_FeExpr = { ...varC, exprFe: lamExpr }
            cb.getEnv()[nameHint] = varC
        }
    }
    else {
        let stmt_func = find_stmt_func(cb, defn)
        if (stmt_func !== null) {
            let varR = defaultReprForType(cb, defn.ty1, undefined, targetRepr)
            let varC = cb.freshVar(varR)
            cb.addStmts([cVarDeclUndefined(reprToCType(varR), varC)])
            let stmtCtx = scAssign(varC)
            stmt_func(cb, stmtCtx)
            cgc_pat_mat(cb, pat.ty1, varC, pat, patMatFail_fatalError)
        }
        else {
            // if no mixin handled the code, fallback to expression oriented codegen
            let defnC = cgc_expr_base(cb, defn, targetRepr)
            // use a Repr determined by the pattern type
            // let patR = targetRepr
            // or, use a Repr determined by the codgen of the defn
            let patR = defnC.repr
            let varC = cb.freshVar(patR, nameHint)
            let patTy = reprToCType(patR)
            let defnC2 = toRepr(cb, patR, defnC)
            cb.addStmts([cDeclConst(varC, defnC2)])
            cgc_pat_mat(cb, pat.ty1, varC, pat, patMatFail_fatalError)
        }
    }

    if (nameHint !== undefined) {
        let varC = cb.getEnv()[nameHint]
        // let varC2: CVarRepr & Annot_FeExpr = { ...varC, exprFe: defn }
        cb.getEnv()[nameHint] = varC
    }
}

function cgc_stmt_apply_func_inline(cb: CBuilder, sc: StmtCtx, func: ExprTypeBidir, arg: ExprTypeBidir): void {
    switch (func.tag) {
        case "ELambda": {
            let sc2 = sc
            let ty = arg.ty1
            let argC = cgc_expr_stmt(cb, arg)
            let v = toVar(cb, argC)
            let p = func.pat
            let failStmts = patMatFail_fatalError
            cgc_pat_mat(cb, ty, v, p, failStmts)
            cgc_stmt_stmt(cb, func.body, sc2)
            break
        }
        case "ELambdaYes": {
            let sc2 = scYes(sc)
            let ty = arg.ty1
            let argC = cgc_expr_stmt(cb, arg)
            let v = toVar(cb, argC)
            let p = func.pat
            let failStmts = patMatFail_fatalError
            cgc_pat_mat(cb, ty, v, p, failStmts)
            cgc_stmt_stmt(cb, func.body, sc2)
            break
        }
        case "ELambdaNo": {
            let sc2 = sc
            let ty = arg.ty1
            let argC = cgc_expr_stmt(cb, arg)
            let v = toVar(cb, argC)
            let p = func.pat
            cb.pushNewCtx()
            {
                sc_close(cb, sc, natExpr(rNo, cCode("(No){}")))
            }
            let [failStmts,] = cb.popCtx()
            cgc_pat_mat(cb, ty, v, p, failStmts)
            cgc_stmt_stmt(cb, func.body, sc2)
            break
        }
        case "ELambdaMaybe": {
            let sc2 = scYes(sc)
            let ty = arg.ty1
            let argC = cgc_expr_stmt(cb, arg)
            let v = toVar(cb, argC)
            let p = func.pat
            cb.pushNewCtx()
            {
                sc_close(cb, sc, natExpr(rNo, cCode("(No){}")))
            }
            let [failStmts,] = cb.popCtx()
            cgc_pat_mat(cb, ty, v, p, failStmts)
            cgc_stmt_stmt(cb, func.body, sc2)
            break
        }
        default:
            throw new Error("missing case")
    }
}

// from a stmt-context generate further nested statements, if possible, otherwise generate an expression and pass it to the stmtCtx continuation
function cgc_stmt_stmt(cb: CBuilder, expr: ExprTypeBidir, stmtCtx: StmtCtx): void {

    while (expr.tag === "ELet") {
        cgc_decls(cb, expr.decls)
        expr = expr.expr
    }

    let stmt_func = find_stmt_func(cb, expr)
    if (stmt_func !== null) {
        stmt_func(cb, stmtCtx)
        return
    }

    // this checks if the function body is syntactically within the current statement,
    // we'll need a different criterea than this for code that's been read-back from a graph.
    // such as the ref-count being 1, or the function not being let-bound.
    if (expr.tag === "EApply" && expr.func.tag.startsWith("ELambda") && locContains(expr.loc, expr.func.loc)) {
        cgc_stmt_apply_func_inline(cb, stmtCtx, expr.func, expr.arg)
        return
    }

    // before moving from a statement-context to an expression-context,
    // check for complementary expr and stmt-contexts first

    let ok = tryCtxFunc(cb, stmtCtx, expr)
    if (ok) {
        return
    }

    // if no mixin handled the code, fallback to expression oriented codegen
    let targetRepr = getTargetReprFromStmtCtx(cb, stmtCtx)
    let exprC = cgc_expr_base(cb, expr, targetRepr)
    sc_close(cb, stmtCtx, exprC)
    return
}



function createTupleRepr(cb: CBuilder, elemReprs: CRepr[], nameHint?: string): CReprTuple {
    let memoKey: CRepr[] = elemReprs
    let tupleR: CReprTuple | undefined = cb.memoMaps.tupleReprMemo.get(memoKey)
    if (tupleR !== undefined) {
        return tupleR
    }

    if (elemReprs.length === 0) {
        // consider using a noRepr
    }
    if (elemReprs.length === 1) {
        // consider using a yesRepr
    }

    let [tupleType, structName] = cb.freshReprType("Tuple", elemReprs.length, elemReprs, nameHint)

    addReprComment(cb, "Tuple", [], elemReprs)

    // TODO no need to include fields for singleton types,
    // TODO   as long as the adaptor/schema can recover the singleton value when needed.
    let fields: [string, CType][] = elemReprs.map((r, i) => [`_${i}`, reprToCType(r)])

    cb.addGlobalStmts("AuxH", [cStructDecl(cShowType(structName), fields)])

    let fieldsC: CExpr[] = elemReprs.map((r, i) => {
        let tySc = reprToReprExpr(r)
        return cAggregate([cStr(`_${i}`), tySc, cCode(`offsetof(${cShowType(structName)},${`_${i}`})`)])
    })

    let agg = cAggregateConst([
        cStr(cShowType(structName)),
        cCall(cCode("sizeof"), [cCode(cShowType(structName))]),
        cInt(fields.length),
        cCast(tName("Field[]"), cAggregateVert(fieldsC))
    ])

    let tupleTypeAgg = cAggregateConst([
        cAggregate([cCode("Repr_Tuple"), cCall(cCode("sizeof"), [cCode(cShowType(structName))])]),
        cOp("&_", [cCast(tName("Schema"), agg)]),
    ])
    cb.addGlobalStmts("AuxC", [cVarDecl(tConst(tName("ReprTuple")), tupleType, tupleTypeAgg)])

    // generate/memoize/reuse struct definition for tuple type
    // generate native->dynamic tuple adaptor metadata/schema

    let typeName = tupleType.expr
    let tupleR2 = rTuple(structName, typeName, elemReprs)

    cb.memoMaps.tupleReprMemo.set(memoKey, tupleR2)

    return tupleR2
}

function createMaybeRepr(cb: CBuilder, valRepr: CRepr, nameHint?: string): CReprMaybe {

    let memoKey: CRepr = valRepr
    let maybeR: CReprMaybe | undefined = cb.memoMaps.maybeReprMemo.get(memoKey)
    if (maybeR !== undefined) {
        return maybeR
    }

    let [maybeRepr, maybeName] = cb.freshReprType("Maybe", null, [valRepr], nameHint)

    cb.addGlobalStmts("AuxH", [cStructDecl(cShowType(maybeName),
        [["isYes", tName("bool")],
        ["value", reprToCType(valRepr)]
        ])])

    let maybeReprAgg = cAggregateConst([
        cAggregate([cCode("Repr_Maybe"), cCall(cCode("sizeof"), [cCode(cShowType(maybeName))])]),
        reprToReprExpr(valRepr),
        cCode(`offsetof(${cShowType(maybeName)},value)`)
    ])
    cb.addGlobalStmts("AuxC", [cVarDecl(tConst(tName("ReprMaybe")), maybeRepr, maybeReprAgg)])

    let maybeR2 = rMaybe(maybeName, valRepr, maybeRepr)

    cb.memoMaps.maybeReprMemo.set(memoKey, maybeR2)
    return maybeR2
}


function createYesRepr(cb: CBuilder, elemRepr: CRepr): CReprYes {
    let memoKey: CRepr = elemRepr
    let yesR: CReprYes | undefined = cb.memoMaps.yesReprMemo.get(memoKey)
    if (yesR !== undefined) {
        return yesR
    }

    let [yesReprCExp, typedefTy] = cb.freshReprType("Yes", null, [elemRepr])

    addReprComment(cb, "Yes", [], [elemRepr])

    let elemReprCExp = reprToReprExpr(elemRepr)

    let yesTypeAgg = cAggregateConst([
        cAggregate([cCode("Repr_Yes"), cCall(cCode("sizeof"), [cCode(cShowType(typedefTy))])]),
        elemReprCExp
    ])
    cb.addGlobalStmts("AuxH", [cTypeDef(typedefTy, reprToCType(elemRepr))])
    cb.addGlobalStmts("AuxC", [cVarDecl(tConst(tName("ReprYes")), yesReprCExp, yesTypeAgg)])

    let yesR2 = rYes(typedefTy, elemRepr, yesReprCExp)

    cb.memoMaps.yesReprMemo.set(memoKey, yesR2)

    return yesR2
}


function createListRepr(cb: CBuilder, elemRepr: CRepr, nameHint?: string): CReprList {
    let memoKey: CRepr = elemRepr
    let listTy: CReprList | undefined = cb.memoMaps.listReprMemo.get(memoKey)
    if (listTy !== undefined) {
        return listTy
    }

    let [listReprExpr, listCType] = cb.freshReprType("List", null, [elemRepr], nameHint)
    let listReprExpr2 = cOp("&_", [cOp(".", [listReprExpr, cCode("base")])])
    let elemReprExpr = reprToReprExpr(elemRepr)

    addReprComment(cb, "List", [], [elemRepr])
    let fields: [string, CType][] = [["elems", tName("List")]]
    cb.addGlobalStmts("AuxH", [cStructDecl(cShowType(listCType), fields)])

    let listTypeAgg = cAggregateConst([
        cAggregate([cCode("Repr_List"), cCall(cCode("sizeof"), [cCode("List")])]),
        elemReprExpr
    ])
    cb.addGlobalStmts("AuxC", [cVarDecl(tConst(tName("ReprList")), listReprExpr, listTypeAgg)])

    let listTy2: CReprList = rList(listCType, listReprExpr2, elemReprExpr, elemRepr)
    cb.memoMaps.listReprMemo.set(memoKey, listTy2)

    return listTy2
}


// function createUnionRepr1(cb: CBuilder, altReprs: CRepr[], nameHint?: string): CReprUnion {
//     let memoKey: CRepr[] = altReprs
//     let unionR: CReprUnion | undefined = cb.memoMaps.unionReprMemo.get(memoKey)
//     if (unionR !== undefined) {
//         return unionR
//     }

//     let [unionReprExpr, unionCType] = cb.freshReprType("Union", altReprs.length, altReprs, nameHint)

//     addReprComment(cb, "Union", [], altReprs)
//     let fields: [string, CType][] = [["value", tName("Union")]]
//     cb.addGlobalStmts("AuxC", [cStructDecl(cShowType(unionCType), fields)])

//     let unionReprAgg = cAggregateConst([
//         cAggregateConst([cCode("Repr_Union"), cCall(cCode("sizeof"), [cCode("Union")])]),
//         cInt(altReprs.length),
//         cCast(tArray(tName("Repr"), altReprs.length), cAggregateVert(altReprs.map(r => reprToReprExpr(r))))
//     ])
//     cb.addGlobalStmts("AuxC", [cVarDecl(tConst(tName("ReprUnion")), unionReprExpr, unionReprAgg)])

//     let listTy2: CReprUnion = rUnion(unionCType, unionReprExpr.expr, altReprs)
//     cb.memoMaps.unionReprMemo.set(memoKey, listTy2)

//     return listTy2
// }

function createUnionRepr(cb: CBuilder, altReprs: CRepr[], nameHint?: string, useMemoMap: boolean = true): CReprUnion {
    let memoKey: CRepr[] = altReprs
    if (useMemoMap) {
        let unionR: CReprUnion | undefined = cb.memoMaps.unionReprMemo.get(memoKey)
        if (unionR !== undefined) {
            return unionR
        }
    }

    let [unionReprExpr, unionCType] = cb.freshReprType("Union", altReprs.length, altReprs, nameHint)

    addReprComment(cb, "Union", [], altReprs)
    let unionFields: [string, CType][] = []
    altReprs.forEach((r, i) => {
        unionFields.push([`_${i}`, reprToCType(r)])
    })
    let fields: [string, CType][] = [["tag", tName("int")], ["value", tUnion(unionFields)]]
    cb.addGlobalStmts("AuxH", [cStructDecl(cShowType(unionCType), fields)])

    let unionReprAgg = cAggregateConst([
        cAggregateConst([cCode("Repr_Union"), cCall(cCode("sizeof"), [cCode(cShowType(unionCType))])]),
        cInt(altReprs.length),
        cCast(tArray(tName("Repr"), altReprs.length), cAggregateVert(altReprs.map(r => reprToReprExpr(r)))),
        cCode(`offsetof(${cShowType(unionCType)},value)`)

    ])
    cb.addGlobalStmts("AuxC", [cVarDecl(tConst(tName("ReprUnion")), unionReprExpr, unionReprAgg)])

    let listTy2: CReprUnion = rUnion(unionCType, unionReprExpr.expr, altReprs)
    if (useMemoMap) {
        cb.memoMaps.unionReprMemo.set(memoKey, listTy2)
    }

    return listTy2
}

// // TODO ? add and "env" argument ? 
// // TODO ? or substitute-in a definition for the recursion-var when we descend into the recurion-body ?
// function createIntersectRepr(cb: CBuilder, tys: Type[], nameHint?: string): CReprIntersect {
//     let memoKey: Type[] = tys
//     let intersectR: CReprIntersect | undefined = cb.memoMaps.intersectReprMemo.get(memoKey)
//     if (intersectR !== undefined) {
//         return intersectR
//     }
//     let reprs: CRepr[] = []
//     for (let ty of tys) {

//         let domRs: CRepr[] = []
//         let ty2: Type = ty
//         while (ty2.tag === "TFun") {
//             let domR = defaultReprForType(cb, ty2.argType)
//             // let domR = defaultReprForType(cb, ty2.argType, env)
//             domRs.push(domR)
//             ty2 = ty2.resultType
//         }
//         let codR = defaultReprForType(cb, ty2)
//         // let codR = defaultReprForType(cb, ty2, env)
//         let funcR = createClosRepr_init(cb, domRs, codR)
//         reprs.push(funcR)
//     }

//     let [typeC, typeR] = cb.freshReprType("In", reprs.length, reprs, nameHint)

//     let inR: CReprIntersect = { tag: "Intersect", cType: typeR, reprC: typeC.expr, reprs: reprs };

//     cb.memoMaps.intersectReprMemo.set(memoKey, inR)
//     return inR

// }

function createPtrRepr_init(cb: CBuilder, ty: Type, nameHint?: string): CReprPtr {

    let [ptrReprExpr, ptrCType] = cb.freshReprType("Rec", null, [], nameHint)
    let destCType = cb.freshType(nameHint)
    let destPtrTy = tPtr(tName(`struct ${cShowType(destCType)}`))
    addReprComment(cb, "Ptr", [showType2(ty)], [])
    cb.addGlobalStmts("AuxH", [cTypeDef(ptrCType, destPtrTy)])

    let ptrReprAgg = cAggregateConst([
        cAggregateConst([cCode("Repr_Ptr"), cCall(cCode("sizeof"), [cCode(cShowType(ptrCType))])]),
        cCode("NULL") // incomplete, we don't have the repr for the destination type yet
    ])
    cb.addGlobalStmts("AuxC", [cVarDecl(tName("ReprPtr"), ptrReprExpr, ptrReprAgg)])

    let recRepr1 = rPtr(ptrCType, ptrReprExpr.expr, ty, destCType)
    return recRepr1
}

function createPtrRepr_complete(cb: CBuilder, ptrRepr: CReprPtr, destRepr: CRepr) {

    addReprComment(cb, "Ptr", [], [destRepr]);

    // patch-up the incomplete ptr-repr with the now known destination repr
    // TODO ? we can probably remove the need for this, now that everything has an "extern" declaration in AuxH
    cb.addGlobalStmts("AuxC", [cAssignStmt(cField(ptrRepr.reprC, "valueRepr"), reprToReprExpr(destRepr))])
}

function createRecursiveRepr(cb: CBuilder, tyRec: Type & { tag: "TRec" }, nameHint?: string): CRepr {

    tyRec = knownInhabited(tyRec) as Type & { tag: "TRec" }
    let memoKey: Type = tyRec
    let recR: CReprPtr | undefined = cb.memoMaps.recReprMemo.get(memoKey)
    if (recR !== undefined) {
        return recR
    }

    let recRepr = createPtrRepr_init(cb, tyRec, nameHint)
    cb.memoMaps.recReprMemo.set(memoKey, recRepr)

    let bodyCType = recRepr.destCType

    let env: { [_: string]: CRepr } = {}
    env[tyRec.name] = recRepr
    // Don't use tyRec.body directly, substitute the whole rec-type into the body, 
    //   so that the recursive type will apear as itself, not a TVar
    // This enables the repr to be looked up in the recReprMemo
    // let bodyTy = tyRec.body
    let bodyTy = substType(tyRec.body, tyRec.name, tyRec, true)
    let bodyTypeName = cShowType(bodyCType)
    let bodyRepr = defaultReprForType(cb, bodyTy, env, undefined, bodyTypeName)

    // if (bodyRepr.tag === "Any") {
    //     // The generated forward pointer typedef/declaration 
    //     //   assumes the destination of the pointer is a struct.
    //     // If the body of the recursive type degeneratated into being an "Any",
    //     //   then just use an Any for the whole recursive definition
    //     return rAny
    // }

    // alternatively, if the bodyRepr.cType doesn't match the provided nameHint (because it is just an Any, or for any other reason),
    //   create a 1-entry union type with the expected type name, containing the type with the unexpected type name.
    if (cShowType(reprToCType(bodyRepr)) !== bodyTypeName) {
        bodyRepr = createUnionRepr(cb, [bodyRepr], bodyTypeName, false)
    }

    createPtrRepr_complete(cb, recRepr, bodyRepr)
    cb.memoMaps.recBodyReprMemo.set(memoKey, bodyRepr)

    return recRepr
}

function createSingleRepr(cb: CBuilder, value: string): CReprSingle {
    let memoKey: string = value
    let singleR: CReprSingle | undefined = cb.memoMaps.singleReprMemo.get(memoKey)
    if (singleR !== undefined) {
        return singleR
    }

    // TODO ? do we want the string value mangled into the type name ?
    // TODO ? do we even want to declare a fresh type for every singleton string ?
    let [singleReprExpr, singleCType] = cb.freshReprType("Single", null, value)

    addReprComment(cb, "Single", [value], [])
    let fields: [string, CType][] = []
    cb.addGlobalStmts("AuxH", [cStructDecl(cShowType(singleCType), fields)])

    let strC = cb.staticString(value)

    let singleReprAgg = cAggregateConst([
        cAggregateConst([cCode("Repr_Single"), cCall(cCode("sizeof"), [cCode(cShowType(singleCType))])]),
        strC,
    ])
    cb.addGlobalStmts("AuxC", [cVarDecl(tConst(tName("ReprSingle")), singleReprExpr, singleReprAgg)])

    let listTy2: CReprSingle = rSingle(singleCType, singleReprExpr.expr, value)
    cb.memoMaps.singleReprMemo.set(memoKey, listTy2)

    return listTy2
}



function reprTupleProjection(cb: CBuilder, repr: CRepr | undefined, pos: number): CRepr | undefined {
    if (repr === undefined) {
        return undefined
    }
    switch (repr.tag) {
        case "Any":
            return rAny
        case "Func":
        case "Clos":
            return undefined
        case "Tuple":
            return repr.elemReprs[pos]
        case "List":
            return repr.elemRepr
        case "Maybe":
            if (pos !== 0) {
                throw new Error(`invalid position in a maybe-tuple (${pos})`)
            }
            return repr.elemRepr
        case "Yes": {
            if (pos !== 0) {
                throw new Error(`invalid position in a yes-tuple (${pos})`)
                // ? or perhaps the project should be passed on to the element
                //   since they have the same C-type ?
            }
            return repr.elemRepr
        }
        case "Nil":
        case "Bool":
        case "Int":
        case "Str":
        case "None":
            return undefined
        case "Union":
            // TODO ? can we do better here ?
            // TODO ?   might end up creating new Union Reprs,
            // TODO ?   this isn't / shouldn't be a case that needs to be optimized for
            return undefined
        case "Ptr": {
            let recRepr = cb.memoMaps.recBodyReprMemo.get(repr.feTy)
            if (repr === undefined) {
                throw new Error("failed to find repr for pointer to recursive type")
            }
            return reprTupleProjection(cb, recRepr, pos)
        }
        default:
            throw new Error(`missing case (${repr.tag})`)
    }
}

function reprTail(repr: CRepr | undefined): CRepr | undefined {
    if (repr === undefined) {
        return undefined
    }
    switch (repr.tag) {
        case "Any":
            return rAny
        case "Func":
        case "Clos":
            return undefined
        case "Tuple":
            return rTupleTail
        case "TupleTail":
            return rTupleTail
        case "List":
            return repr
        case "Maybe":
            return rNo
        case "Yes": {
            return rNo
        }
        case "Nil":
        case "Bool":
        case "Int":
        case "Str":
        case "None":
            return undefined
        case "Union":
            // TODO ? can we do better here ?
            // TODO ?   might end up creating new Union Reprs,
            // TODO ?   this isn't / shouldn't be a case that needs to be optimized for
            return undefined
        default:
            throw new Error(`missing case (${repr.tag})`)
    }
}

function reprListElem(repr: CRepr | undefined): CRepr {
    if (repr === undefined) {
        return rAny
    }
    switch (repr.tag) {
        case "Func":
        case "Clos":
            return rAny
        case "Tuple":
            // TODO union together all the tuple element reprs
            return repr.elemReprs[0]
        case "List":
            return repr.elemRepr
        case "Maybe":
            return repr.elemRepr
        case "Yes":
            return repr.elemRepr
        case "Nil":
        case "Bool":
        case "Int":
        case "Str":
        case "None":
        case "Any":
            return rAny
        default:
            throw new Error("missing case")
    }
}

function reprCod(repr: CRepr | undefined): CRepr | undefined {
    if (repr === undefined) {
        return undefined
    }
    switch (repr.tag) {
        case "Func":
        case "Clos":
            if (repr.dom.length === 1) {
                return repr.cod
            }
            else {
                // TODO ? construct the partially-applied function-type ?
                return undefined
            }
        default:
            return undefined
    }
}

function reprContainsNil(repr: CRepr): boolean {
    switch (repr.tag) {
        case "Any":
        case "List":
        case "Maybe":
        case "Nil":
            return true
        case "Func":
        case "Clos":
        case "Yes":
        case "Bool":
        case "Int":
        case "Str":
        case "Type":
            return false
        case "Tuple":
            return (repr.elemReprs.length === 0)
        case "TupleTail":
            // TODO This should probably return true.
            // TODO   Now that TupleTails are more dynamic,
            // TODO   the offset can easily be advanced to the end of the tuple, without changing the Repr
            return false
        case "Union":
            for (let i = 0; i !== repr.altReprs.length; i += 1) {
                if (reprContainsNil(repr.altReprs[i])) {
                    return true
                }
            }
            return false
        case "Single":
            return false
        case "None":
            throw new Error("invalid case")
        default:
            throw new Error("missing case")
    }
}

function reprUnionNil(cb: CBuilder, repr: CRepr): CRepr {
    if (reprContainsNil(repr)) {
        return repr
    }
    else {
        // TODO ? check if the repr is a yes-repr, if so return a maybe-repr ?
        let unionRepr = createUnionRepr(cb, [repr, rNo])
        return unionRepr
    }
}

function reprConvertFromNil(cb: CBuilder, repr: CRepr): CExprRepr {
    switch (repr.tag) {
        case "Any": {
            let nil: CExprRepr = anyExpr(cCall(cCode("any_nil"), []))
            return nil
        }
        case "List": {
            let nil = natExpr(repr, cCast(repr.listCType, cAggregate([cCode("NULL"), cInt(0)])))
            return nil
        }
        case "Maybe": {
            let nil = natExpr(repr, (cCast(repr.maybeCType, cAggregate([cCode("false")]))))
            return nil
        }
        case "Nil": {
            let nil = natExpr(repr, (cCast(tName("No"), cAggregate([]))))
            return nil
        }
        case "Func":
        case "Clos":
        case "Yes":
        case "Bool":
        case "Int":
        case "Str":
        case "Type":
        case "TupleTail":
            // We could now return a nil here.
            // It is unlikely that we'll ever need to though.
            throw new Error("invalid repr")
        case "Tuple": {
            if (repr.elemReprs.length !== 0) {
                throw new Error("invalid repr")
            }
            else {
                let nil = natExpr(repr, (cCast(reprToCType(repr), cAggregate([]))))
                return nil
            }
        }
        case "Union":
            for (let i = 0; i !== repr.altReprs.length; i += 1) {
                if (reprContainsNil(repr.altReprs[i])) {
                    let altRepr = repr.altReprs[i]
                    let nil1 = reprConvertFromNil(cb, altRepr)
                    let nil3 = natExpr(repr, cCast(reprToCType(repr), cAggregate([cInt(i), cCode(`.value._${i} = ${cShowExpr(nil1.expr)}`)])))
                    return nil3
                }
            }
            // else this union cannot represent a nil
            throw new Error("invalid repr")
        case "Single":
        case "None":
            throw new Error("invalid repr")
        default:
            throw new Error("missing case")
    }

}

function cgc_tuple(cb: CBuilder, elems: ExprTypeBidir[], targetRepr?: CRepr): CExprRepr {

    let elemReprs: CRepr[] = []
    let elemsC: CExprRepr[] = []
    elems.forEach((e, pos) => {
        let elemTargetRepr = reprTupleProjection(cb, targetRepr, pos)
        let repr = defaultReprForType(cb, e.ty1, undefined, elemTargetRepr)
        let expr1 = cgc_expr(cb, e, repr)
        let expr2 = toRepr(cb, repr, expr1)
        elemReprs.push(repr)
        elemsC.push(expr2)
    })

    let tupleR = createTupleRepr(cb, elemReprs)

    let tupleExpr = cCast(tupleR.tupleCTy, cAggregate(elemsC))

    let tupleVar = cb.freshVar(tupleR)
    cb.addStmts([cDeclConst(tupleVar, tupleExpr)])

    // return a native expression together with enough CRepr info for the caller to construct a dynamic form if needed
    return tupleVar
}


function cgc_list2(cb: CBuilder, elems: ExprTypeBidir, targetRepr?: CRepr): CExprRepr {

    if (elems.tag !== "EList") {
        throw new Error("expected a list")
    }

    let listR
    if (targetRepr?.tag === "List") {
        listR = targetRepr
    }
    else {
        // listR = defaultReprForType(cb, elems.ty1)
        listR = defaultReprForType(cb, elems.ty2!)
    }

    let listRepr: CReprList = createListRepr(cb, reprListElem(listR))

    let listVar = cb.freshVar(listRepr, "list")
    if (elems.tail === null) {
        cb.addStmts([cDeclVar(listVar, cCast(listRepr.listCType, cAggregate([cAggregate([cCode("NULL"), cInt(0)])])))])
    }
    else {
        let listTail = cgc_expr(cb, elems.tail)
        cb.addStmts([cbDeclVar(cb, listVar, listTail)])
    }

    let elemsAgg = cAggregate(elems.exprs.map(e => toRepr(cb, listRepr.elemRepr, cgc_expr(cb, e))))

    cb.addStmts([
        cAssignStmt(cField(listVar, "elems"),
            cCall(cCode("list_prependN"),
                [reprToReprExpr(listRepr.elemRepr),
                cField(listVar, "elems"),
                cInt(elems.exprs.length),
                cCast(tArray(reprToCType(listRepr.elemRepr), elems.exprs.length), elemsAgg)
                ]))])

    // return a native expression together with enough CRepr info for the caller to construct a dynamic form if needed
    return listVar
}

function cgc_call(cb: CBuilder, func: CExprRepr, args: CExprRepr[]): CExprRepr {
    let funcC = func
    let funcR = func.repr
    if (funcR.tag === "Func" && funcR.dom.length === args.length) {
        let funcVar = toVar(cb, funcC)
        let domR = funcR.dom
        let codR = funcR.cod
        let argsC: CExprRepr[] = []
        for (let i = 0; i !== domR.length; i++) {
            let argC = args[i]
            argsC.push(toRepr(cb, domR[i], argC))
        }
        let callC = cCall(funcVar, argsC)
        // callC = cCommentExpr("DirectCall:Func", callC)
        return natExpr(codR, callC)
    }
    else if (funcR.tag === "Clos" && funcR.dom.length === args.length) {
        let closVar = toVar(cb, funcC)
        let domR = funcR.dom
        let codR = funcR.cod
        let argsC: CExprRepr[] = []
        for (let i = 0; i !== domR.length; i++) {
            let argC = args[i]
            argsC.push(toRepr(cb, domR[i], argC))
        }
        let callC = cCall(cField(closVar, "func"), [cField(closVar, "env"), ...argsC])
        // callC = cCommentExpr("DirectCall:Clos", callC)
        return natExpr(codR, callC)
    }
    else if (funcR.tag === "FuncNull" && funcR.dom.length === args.length) {
        let funcVar = toVar(cb, funcC)
        let domR = funcR.dom
        let codR = funcR.cod
        let argsC: CExprRepr[] = []
        for (let i = 0; i !== domR.length; i++) {
            let argC = args[i]
            argsC.push(toRepr(cb, domR[i], argC))
        }
        let callC = cCall(funcVar, [cCode("NULL"), ...argsC])
        // callC = cCommentExpr("DirectCall:FuncNull", callC)
        return natExpr(codR, callC)
    }
    else {
        let result: CExprRepr = func
        args.forEach(arg => {
            result = anyExpr(cCall(cCode("any_call"), [toAny(cb, result), toAny(cb, arg)]))
        })
        return result
    }

}

function cgc_expr(cb: CBuilder, expr: ExprTypeBidir, targetRepr?: CRepr): CExprRepr {
    if (USE_MIXINS) {
        let result = cgc_expr_stmt(cb, expr, targetRepr)
        return result
    }
    else {
        return cgc_expr_base(cb, expr, targetRepr)
    }
}

function cgc_expr_base(cb: CBuilder, expr: ExprTypeBidir, targetRepr?: CRepr): CExprRepr {
    let cg = (expr: ExprTypeBidir, targetRepr?: CRepr) => cgc_expr(cb, expr, targetRepr)
    switch (expr.tag) {
        case "EVar":
            if (expr.name in cb.getEnv()) {
                return cb.getEnv()[expr.name]
            }
            else if (expr.name in prims) {
                return prims[expr.name]
            }
            else {
                // throw new Error(`cgc_expr: unknown variable (${expr.name})`)
                console.log(`ERROR UNKNOWN VARIABLE: cgc_expr: unknown variable (${expr.name}) at (${showLoc(expr.loc)})`);
                return anyExpr(cCode(`TODO_${expr.name}`))
            }
        case "EDatum": {
            switch (typeof expr.value) {
                case "number":
                    return natExpr(rInt, cInt(expr.value))
                case "string": {
                    let singleR = createSingleRepr(cb, expr.value)
                    let strVar = natExpr(singleR, cCast(singleR.singleCType, cAggregate([])))
                    return strVar
                }
                case "boolean":
                    return natExpr(rBool, expr.value ? cCode("true") : cCode("false"))
                case "object":
                    if (expr.value !== null) throw new Error("impossible")
                    let nilR = defaultReprForType(cb, expr.ty2!)
                    if (nilR.tag === "List") {
                        return natExpr(nilR, cCast(reprToCType(nilR), cAggregate([cAggregate([cCode("NULL"), cInt(0)])])))
                    }
                    else {
                        return natExpr(rNo, cCast(tName("No"), cAggregate([])))
                    }
                default:
                    throw new Error("impossible")
            }
        }
        case "EList": {
            if (expr.exprs.length === 0 && expr.tail === null) {
                let nilR = defaultReprForType(cb, expr.ty1, undefined, targetRepr)
                if (nilR.tag === "List") {
                    return natExpr(nilR, cCast(reprToCType(nilR), cAggregate([cAggregate([cCode("NULL"), cInt(0)])])))
                }
                else {
                    return natExpr(rNo, cCast(tName("No"), cAggregate([])))
                }
            }
            if (expr.exprs.length === 1 && expr.tail === null) {
                let elemTargetRepr = reprTupleProjection(cb, targetRepr, 0)
                let elemEr = cgc_expr(cb, expr.exprs[0], elemTargetRepr)
                let yesR = createYesRepr(cb, elemEr.repr)
                let yesElemEr = natExpr(yesR, elemEr.expr)
                return yesElemEr
            }
            if (expr.exprs.length !== 0 && (expr.ty1.tag === "TList" || expr.ty2?.tag === "TList" || targetRepr?.tag === "List")) {
                // if (expr.tail === null || expr.tail.ty1.tag === "TList") 
                {
                    let list: CExprRepr = cgc_list2(cb, expr, targetRepr)
                    return list
                }
                // else {
                //     let list: CExprRepr = cgc_list(cb, expr)
                //     return list
                // }
            }
            // if (expr.tail === null && expr.exprs.length !== 0 && (expr.ty1.tag === "TList" || expr.ty2?.tag === "TList")) {
            //     let list: CExprRepr = cgc_list(cb, expr)
            //     return list
            // }
            // // TODO handle list constructing expressions, such as [ 1, 2, 3 ,, numbers ] : List Int
            // if (expr.tail?.ty1?.tag === "TList" && expr.exprs.length !== 0 && (expr.ty1.tag === "TList" || expr.ty2?.tag === "TList")) {
            //     let list: CExprRepr = cgc_list2(cb, expr)
            //     return list
            // }
            if (expr.tail === null && expr.exprs.length !== 0) {
                let tuple: CExprRepr = cgc_tuple(cb, expr.exprs, targetRepr)
                return tuple
            }


            let listC = anyExpr(cCall(cCode("any_from_value"), [reprToReprExpr(rNo), cAddrOf(cCast(tName("No"), cAggregate([])))]))
            if (expr.tail !== null) {
                listC = toAny(cb, cg(expr.tail))
            }
            let elemsC = expr.exprs.map(e => cg(e))
            elemsC.reverse()
            elemsC.forEach(eC => {
                listC = anyExpr(cCall(cCode("any_pair"), [toAny(cb, eC), listC]))
            })
            return listC
        }
        case "EApply": {

            // This provides special-handling for calls to "primitive".
            // These can occur in primitives files (fe4-primitives.fe), and (in the future) in code that's been read back from a graph-representation.
            // Without this, every primitive function would use the Any representation.
            // This special-handling won't be needed if/when more general support for dependent representations is added.
            if (true
                && expr.tag === "EApply"
                && expr.func.tag === "EVar"
                && expr.func.name === "primitive"
                && expr.arg.tag === "EDatum"
                && typeof expr.arg.value === "string"
            ) {
                const prim = prims[expr.arg.value]
                assert.isTrue(prim !== undefined)
                if (prim === undefined) {
                    console.error(`Unknown primitive (${expr.arg.value}).`)
                }
                return prim
            }

            let exprCMb = cgFuncArgs_OrNull(cb, expr)
            if (exprCMb !== null) {
                return exprCMb
            }

            let args: ExprTypeBidir[] = []
            let expr2: ExprTypeBidir = expr
            while (expr2.tag === "EApply") {
                args.unshift(expr2.arg)
                expr2 = expr2.func
            }

            let funcC = cg(expr2)

            // let funcR = funcC.repr
            // if (funcR.tag === "Clos") {
            //     console.log("A Closure!")
            // }

            let argsC = args.map(arg => cg(arg))
            let result = cgc_call(cb, funcC, argsC)
            return result
        }
        case "EPrim": {
            const prim = prims[expr.name]
            if (prim === undefined) {
                throw new Error(`Unknown operator (${expr.name})`)
            }
            let argsC = expr.args.map(arg => cg(arg))
            let result = cgc_call(cb, prim, argsC)
            return result
        }
        case "ELambda":
        case "ELambdaYes":
        case "ELambdaNo":
        case "ELambdaMaybe":
            let closure2 = cgc_lambda3(cb, expr)
            return closure2

        case "ETermBrackets": {
            return cg(expr.expr, targetRepr)
        }
        case "ETypeBrackets":
            return natExpr(rType, cCast(tType, cAggregate([])))

        case "EType":
            return cg(expr.expr, targetRepr)

        case "ELet": {
            cgc_decls(cb, expr.decls)
            let exprC = cgc_expr(cb, expr.expr)
            return exprC
        }
        default:
            throw new Error(`missing case ${expr.tag}`)

    }
}

// function cgc_decl_local(cb: CBuilder, decl: DeclTypeBidir): void {
//     let [pat, defn] = decl
//     let defnC = toDyn(cb, cgc_expr(cb, defn))
//     let varC = cb.freshVar(rDyn, rootPatName(pat))
//     cb.addStmts([cLet(varC.expr, defnC)])
//     cgc_pat_mat(cb, pat.ty1, varC, pat, patMatFail_fatalError)
// }

// function cgc_decl_local(cb: CBuilder, decl: DeclTypeBidir): void {
//     let [pat, defn] = decl
//     let defnC = cgc_expr(cb, defn)
//     let patR = reprSimplify(defaultReprForType(cb, pat.ty1))
//     let varC = cb.freshVar(patR, rootPatName(pat))
//     let patTy = reprToCType(reprSimplify(defaultReprForType(cb, pat.ty1)))
//     let defnC2 = reprConvert(cb, defnC.repr, patR, defnC.expr)
//     cb.addStmts([cVarDecl(patTy, varC.expr, defnC2)])
//     cgc_pat_mat(cb, pat.ty1, varC, pat, patMatFail_fatalError)
// }

function cgc_decl_local(cb: CBuilder, decl: DeclTypeBidir, env?: Env): void {
    let [pat, defn] = decl
    cgc_decl_stmt(cb, defn, pat, env)
}

// function cgc_decl_global(cb: CBuilder, decl: DeclTypeBidir): void {
//     // TODO assert that the context stack is empty ?
//     let [pat, defn] = decl
//     let patName = rootPatName(pat)
//     // TODO make this more general / less special-casey
//     // TODO   currently global let bindings of functions and integer-typed expressions get more informative names,
//     // TODO   everything else should have informative names too
//     // if (patName !== undefined && defn.tag === "ELambda") {
//     if (patName !== undefined && defn.tag.startsWith("ELambda")) {
//         let defnC = cgc_lambda3(cb, defn, patName)
//         // TODO this cast from CValueRepr to CVarRepr is wrong
//         // TODO   but we can get away with it,
//         // TODO   and it should become true once converting between representations is handled better
//         // TODO   (perform the conversions as needed, and cache the results for functions and other globals)
//         cb.getEnv()[patName] = defnC as CVarRepr
//     }
//     else {
//         let defnC = cgc_expr(cb, defn)
//         let defnR = defnC.repr
//         if (pat.tag === "EType") {
//             pat = pat.expr
//         }
//         let simpleReprs = ["Int", "Bool"]
//         // let simpleReprs = ["Int", "Bool", "Tuple"]
//         if ((pat.tag === "EVar" || pat.tag === "EAs") && simpleReprs.indexOf(defnR.tag) !== -1) {
//             let varC = cb.freshVar(defnR, rootPatName(pat))
//             cb.getEnv()[pat.name] = natVar(defnR, varC.expr)
//             cb.addGlobalStmts([cVarDecl(reprToCType(defnR), varC.expr, toRepr(cb, defnC, defnR))])
//             if (pat.tag === "EAs") {
//                 cgc_pat_mat(cb, pat.ty1, varC, pat.expr, patMatFail_fatalError)
//             }
//         }
//         else {
//             let varC = cb.freshVar(rDyn, rootPatName(pat))
//             cb.addGlobalStmts([cVarDecl(tRef, varC.expr, toDyn(cb, defnC))])
//             cgc_pat_mat(cb, pat.ty1, varC, pat, patMatFail_fatalError)
//         }
//     }
// }


function cgc_decl(cb: CBuilder, decl: DeclTypeBidir, env?: Env): void {
    // if (cb.isGlobal()) {
    //     cgc_decl_global(cb, decl)
    // }
    // else 
    {
        cgc_decl_local(cb, decl, env)
    }
}

function cgc_decls(cb: CBuilder, decls: DeclTypeBidir[], env?: Env): void {
    decls.forEach(d => {
        cgc_decl(cb, d, env)
    })
}


function cQuoteStr(q: "'" | '"', s: string) {
    let chars: string[] = []
    let len = s.length
    for (let i = 0; i !== len; i++) {
        let c = s.charAt(i)
        let cNum = c.charCodeAt(0)
        let c2

        if (c === '"') {
            c2 = "\\\""
        }
        else if (c === '\\') {
            c2 = "\\\\"
        }
        else if (32 <= cNum && cNum <= 126) {
            c2 = c
        }
        // control characters can end up in literal strings when entire source files are encoded into string literals
        else if (c === '\t') {
            c2 = "\\t"
        }
        else if (c === '\n') {
            c2 = "\\n"
        }
        else if (c === '\r') {
            c2 = "\\r"
        }
        // or when non-printable characters are explictly written (in escaped form) 
        // in the literal strings (such as terminal escape codes)
        else if (cNum <= 127) {
            let hexChars = "0123456789ABCDEF";
            let hi = hexChars.charAt((cNum >> 4) & 0x0F)
            let lo = hexChars.charAt(cNum & 0x0F)
            c2 = `\\x${hi}${lo}`
        }
        else {
            // TODO use unicode syntax for chars > 127 (or 255?)
            // throw new Error("TODO unicode in a C string")
            // not actually expecting to encounter non-ASCII characters here though
            throw new Error(`unexpected non-ASCII character (${JSON.stringify(c)}, ${cNum})`)
        }
        chars.push(c2)
    }
    return `${q}${chars.join("")}${q}`

}

// // const MAX_COMMENT_LENGTH = 80
// const MAX_COMMENT_LENGTH = 200;

function limitCommentLength(c: string): string {
    // const MAX_COMMENT_LENGTH = 200
    if (c.length > MAX_COMMENT_LENGTH) {
        c = c.slice(0, MAX_COMMENT_LENGTH) + "..."
    }
    return c
}

function cShowExpr(expr: CExpr): string {
    let s = cShowExpr
    if (expr === undefined) {
        return "UNDEFINED"
    }
    switch (expr.tag) {
        case "CCode":
            return expr.code
        case "CVar":
            return expr.name
        case "CInt":
            return JSON.stringify(expr.value)
        case "CStr": {
            // return JSON.stringify(expr.value)
            // stringify doesn't always generate suitable output for C source files
            // in particular the terminal escape sequences in fe4-runtest.fe cause problems
            return cQuoteStr('"', expr.value)
        }
        case "COp": {
            let a = expr.args.map(arg => s(arg))
            switch (expr.opName) {
                case "+":
                // case "=":
                case "==":
                case "!=":
                    return `(${a[0]}) ${expr.opName} (${a[1]})`
                case "=":
                    return `${a[0]} ${expr.opName} ${a[1]}`
                case "!":
                    return `!(${a[0]})`
                case "()":
                    return `(${a[0]})${a[1]}`
                case "[]":
                    return `${a[0]}[${a[1]}]`
                case ".":
                    return `${a[0]}.${a[1]}`
                case "->":
                    return `${a[0]}->${a[1]}`
                case "&_":
                    return `(&${a[0]})`
                case "*_":
                    return `*${a[0]}`
                default:
                    throw new Error(`unknown/unhandled operator ${expr.opName}`)
            }
        }
        case "CCast":
            return `(${cShowType(expr.ty)})${cShowExpr(expr.expr)}`
        case "CField":
            // TODO ? get rid of this, we can just use cOp(".", [a, f])
            return `(${s(expr.aggregate)}).${expr.field}`
        case "CCall":
            return `${s(expr.func)}(${expr.args.map(a => s(a)).join(", ")})`
        case "CAggregate":
            if (expr.isVertical) {
                return `\n    { ${expr.elems.map(e => s(e)).join("\n    , ")}\n    }`
            }
            else {
                return `{${expr.elems.map(e => s(e)).join(", ")}}`
            }
        case "CCommentExpr":
            let comment = limitCommentLength(expr.comment)
            return `(/* ${comment} */ ${s(expr.expr)})`
        default:
            throw new Error(`missing tag (${expr.tag})`)
    }
}

function cShowStmt(out: string[], indent: string, stmt: CStmt) {
    let indent2 = indent + "    "
    switch (stmt.tag) {
        case "CReturn":
            out.push(`${indent}return ${cShowExpr(stmt.expr)};`)
            return
        case "CBlock": {
            out.push(`${indent}{`)
            cShowStmts(out, indent2, stmt.stmts)
            out.push(`${indent}}`)
            return
        }
        case "CIf": {
            out.push(`${indent}if (${cShowExpr(stmt.cond)}) {`)
            cShowStmts(out, indent2, stmt.then)
            out.push(`${indent}}`)
            return
        }
        case "CIfElse": {
            out.push(`${indent}if (${cShowExpr(stmt.cond)}) {`)
            cShowStmts(out, indent2, stmt.then)
            out.push(`${indent}}`)
            out.push(`${indent}else {`)
            cShowStmts(out, indent2, stmt.else)
            out.push(`${indent}}`)
            return
        }
        case "CExprStmt":
            out.push(`${indent}${cShowExpr(stmt.expr)};`)
            return
        case "CVarDecl":
            if (stmt.defn !== undefined) {
                out.push(`${indent}${cShowType(stmt.ty, stmt.var.name)} = ${cShowExpr(stmt.defn)};`)
            }
            else {
                out.push(`${indent}${cShowType(stmt.ty, stmt.var.name)};`)
            }
            return
        case "CWhile":
            out.push(`${indent}while (${cShowExpr(stmt.cond)}) {`)
            cShowStmts(out, indent2, stmt.body)
            out.push(`${indent}}`)
            return
        case "CBreak":
            out.push(`${indent}break;`)
            return
        case "CContinue":
            out.push(`${indent}continue;`)
            return
        case "CLabel":
            // out.push(`${indent}/* LABEL */`)
            // out.push(`${indent}${stmt.label}:`)
            out.push(`${indent}${stmt.label}: /* LABEL */`)
            return
        case "CGoto":
            out.push(`${indent}goto ${stmt.label};`)
            return

        case "CCommentStmt":
            let comment = limitCommentLength(stmt.comment)
            out.push(`${indent}// ${comment}`)
            break

        case "CLetUndefined":
        case "CDoWhile":
        default:
            throw new Error(`missing tag (${stmt.tag})`)
    }
}

function cShowStmts(out: string[], indent: string, stmts: CStmts) {
    stmts.flatMap(s => cShowStmt(out, indent, s))
}


function cShowDecl(out: string[], indent: string, decl: CDecl) {
    switch (decl.tag) {
        case "CFunc2": {
            let domStr = decl.dom.map(([n, r]) => {
                return `${cShowType(r, n)}`
            }).join(", ")
            let codStr = cShowType(decl.cod)
            out.push(`${codStr} ${decl.funcVar.name} (${domStr}) {`)
            decl.body.forEach(d => {
                cShowStmt(out, "    ", d)
            })
            out.push(`}`)
            break
        }
        case "CCommentStmt":
            let comment = limitCommentLength(decl.comment)
            out.push(`${indent}// ${comment}`)
            break
        case "CVarDecl":
            if (decl.defn !== undefined) {
                out.push(`${indent}${cShowType(decl.ty, decl.var.name)} = ${cShowExpr(decl.defn)};`)
            }
            else {
                out.push(`${indent}${cShowType(decl.ty, decl.var.name)};`)
            }
            break
        case "CStructDecl": {
            out.push(`typedef struct ${decl.name} {`)
            decl.fields.forEach(([name, ty]) => {
                out.push(`    ${cShowType(ty, name)};`)
            })
            out.push(`} ${decl.name};`)
            break
        }
        case "CTypeDefFuncPtr": {
            let ret = cShowType(decl.codR)
            let params = decl.domRs.map(r => cShowType(r))
            out.push(`typedef ${ret} (*${cShowType(decl.name)})(${params.join(", ")});`)
            break
        }
        case "CTypeDef": {
            if (decl.name.tag !== "TName") {
                throw new Error("can only typedef type names")
            }
            let ret = cShowType(decl.defn, decl.name.name)
            out.push(`typedef ${ret};`)
            break
        }
        case "CExtern": {
            out.push(`${indent}extern ${cShowType(decl.ty, decl.name)};`)
            break
        }

        default:
            throw new Error(`unknown tag ($ {decl.tag})`)
    }
}

function cShowType(ty: CType, name?: string | CVar): string {
    let cst = cShowType
    if (name === undefined) {
        switch (ty.tag) {
            case "TName":
                return ty.name
            case "TPtr":
                return `${cst(ty.ty)} *`
            case "TArray":
                return `${cst(ty.ty)}[${ty.len || ""}]`
            case "TConst":
                // return `const ${cst(ty.ty)}`
                // stick the "const" on the RHS of the type
                //   otherwise 
                //     tConst(tPtr(...)) 
                //   produces the same result as
                //     tPtr(tConst(...))
                // but they have different meanings
                return `${cst(ty.ty)} const`
            case "TUnion": {
                let fields = ty.fields.map(([name, ty]) => `${name}: ${cShowType(ty)}`)
                let result = ["union {", ...fields, "}"].join("\n        ")
                return result
            }
            default:
                throw new Error("missing case")
        }
    }
    else {
        // TODO handle the difference between C types and declarators correctly,
        // TODO   this code may well not handle all cases
        if (typeof name !== "string") {
            name = name.name
        }
        switch (ty.tag) {
            case "TName":
                return `${ty.name} ${name}`
            case "TPtr":
                return `${cst(ty.ty)} * ${name}`
            case "TArray":
                return `${cst(ty.ty)} ${name} [${ty.len || ""}]`
            case "TConst":
                // return `const ${cst(ty.ty)} ${name}`
                // see above
                return `${cst(ty.ty)} const ${name}`
            case "TUnion": {
                let fields = ty.fields.map(([name, ty]) => `    ${cShowType(ty, name)};\n    `)
                let result = ["union {\n    ", ...fields, `} ${name}`].join("")
                return result
            }
            default:
                throw new Error("missing case")
        }
    }
}

// This implements the "primitive" primitive.
export function codegen_c_primitive(cb: CBuilder): void {
    const s: CStmts = []

    for (const [name, defn] of Object.entries(prims)) {
        const nameQ = cQuoteStr('"', name)
        s.push(cIf(cCode(`strcmp(name.data, ${nameQ})==0`), [
            cReturn(reprConvertToAny(cb, defn))
        ]))
    }
    s.push(cExprStmt(cCode('fatalError("any_primitive: unknown primitive: %s.", name.data)')))

    const primName = cb.namedVar(rStr, "any_primitive")
    const primFunc: CDecl = cFunc(primName, [["name", tStr]], tAny, s)
    cb.addGlobalStmts("AuxC", [primFunc])
}


export function codegen_c_expr(cb: CBuilder, expr: ExprTypeBidir): [string[], string] {
    let exprStr
    cb.pushNewCtx()
    {
        let exprC = toAny(cb, cgc_expr(cb, expr))
        exprStr = cShowExpr(exprC.expr)
    }
    let [stmtsOut] = cb.popCtx()
    let stmtsStrs: string[] = []
    cShowStmts(stmtsStrs, "", stmtsOut)
    return [stmtsStrs, exprStr]
}

export function codegen_c_stmts(cb: CBuilder, decls: DeclTypeBidir[], env?: Env): void {
    for (const decl of decls) {
        cgc_decl(cb, decl, env)
    }
}

export function codegen_reprs(cb: CBuilder) {
    cb.pendingReprCodeGen.forEach(r => {
        if (cb.memoMaps.reprMemo_cgDone.get(r) === undefined) {
            repr_codegen(cb, r)
            cb.memoMaps.reprMemo_cgDone.set(r, null)
        }
    })
    cb.pendingReprCodeGen = []
}
