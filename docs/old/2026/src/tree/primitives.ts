
import {
    node, atomicValue, closureValue, typeValue, evalNode, printValue, pairValue, Node, Env, patMatch, evalExpr,
    showMbLoc, Value, PairValue, showValueFe, primValue2, declarePrimitives,
    applyPrimitive,
    EnvEntry,
    lookupPrimEnv,
    PrimTable,
} from "../tree/eval.js"
import { logger_log } from "../utils/logger.js"
import { assert } from "../utils/assert.js"

import {
    nilT, boolT, intT, strT, anyT, pairT, listT, funT, funPT, funDT, varT, voidT, ruleT, typeT, singleT, unionTypes, ioWorldT, errorT,
    hdT, tlT, rangeT, domainT, unionT, intersectT, relcompT, applyT, singleTermVarT, singleTypeT, Type, tuple2T, maybeT, charT,
    unknownT,
    recT, selfT,
    typeTupleMap,
    typeDom, typeRng,
    intersectTypes, typeRelComp1,
    typeHd, typeTl, typeElem,
    typeInverse, typeInverseApply, applyTypes,
} from "../tree/types.js";
import { eVar } from "../syntax/expr.js";

// import { runtimeUtils, primitivesCore } from "../runtime/runtime-core.js"

let loopType =
    funPT("L", funT(voidT, unionTypes(tuple2T(singleT('break'), anyT), tuple2T(singleT('continue'), ruleT("domainT", [varT("L")])))),
        funPT("S", ruleT("domainT", [varT("L")]),
            hdT(tlT(ruleT("intersectT", [tuple2T(singleT('break'), anyT), ruleT("applyT", [varT("L"), varT("S")])])))))

let loop2Type =
    funPT("A", anyT
        , funPT("B", funT(varT("A"), unionT(tuple2T(singleT("break"), anyT), tuple2T(singleT("continue"), varT("A"))))
            , hdT(tlT(intersectT(applyT(varT("B"), varT("A")), pairT(singleT("break"), anyT))))
        )
    )
let breakType = funPT("T", anyT, tuple2T(singleT('break'), varT('T')))
let continueType = funPT("T", anyT, tuple2T(singleT('continue'), varT('T')))


function apply(f: Node, x: Node): Node {
    let a1 = evalNode(f)
    if (a1.tag === 'closure') {
        let pm = patMatch(x, a1.argPat)
        if (pm !== null) {
            let newEnv = { ...a1.env, ...pm }
            return evalExpr(a1.expr, newEnv)
        }
        else {
            throw new Error(`pattern match failure at: (${showMbLoc(a1.expr)}), value: (${showValueFe(x)})`)
        }
    }
    else if (a1.tag === 'primitive2') {
        const result = applyPrimitive(a1, x, null)
        return result
    }
    else {
        throw new Error(`expected function as argument, not: ${JSON.stringify(a1)}`)
    }
}

function mkUnaryFunction2(f: (_: any) => any) {
    return (args: Node[]) => {
        let [a] = args
        let na = evalNode(a)
        if (na.tag === "atomic") {
            return node(atomicValue(f(na.value)))
        }
        else {
            throw new Error("unary function applied to non-atomic value")
        }
    }
}


function mkBinaryFunction2(f: (a: any, b: any) => any) {
    return (args: Node[]) => {
        let [a, b] = args
        let na = evalNode(a)
        let nb = evalNode(b)
        if (na.tag !== "atomic") {
            throw new Error("binary function applied to non-atomic value")
        }
        if (nb.tag !== "atomic") {
            throw new Error("binary function applied to non-atomic value")
        }
        return node(atomicValue(f(na.value, nb.value)))
    }
}


function eqPrim2(args: Node[]): Node {
    let [a, b] = args
    let na = evalNode(a)
    let nb = evalNode(b)
    if (na.tag === "atomic" && nb.tag === "atomic") {
        // console.log(`Comparing ${JSON.stringify(na.value)} == ${JSON.stringify(nb.value)}`)
        return node(atomicValue(na.value === nb.value))
    }
    else if (na.tag === "atomic" || nb.tag === "atomic") {
        return node(atomicValue(false))
    }
    else {
        throw new Error(`invalid equality test, at least one argument must be an atomic value (${na.tag}, ${nb.tag})`)
    }
}


function mkProjecttionPrim(f: (a: PairValue) => Node) {
    return (args: Node[]) => {
        let [a] = args
        let na = evalNode(a)
        if (na.tag !== "pair") {
            throw new Error(`expected pair`)
        }
        let result = f(na)
        return result
    }
}

function if2Prim2(args: Node[]): Node {
    let [c, k] = args
    let c2 = evalNode(c)
    if (c2.tag !== "atomic" || typeof c2.value !== "boolean") {
        throw new Error("expected a boolean")
    }
    let nb = evalNode(k)
    if (nb.tag !== "pair") {
        throw new Error("invalid continuations")
    }
    let nb2 = evalNode(nb.tail)
    if (nb2.tag !== "pair") {
        throw new Error("invalid continuations")
    }
    let kTrue = nb.head
    let kFalse = nb2.head
    if (c2.value === true) {
        return apply(kTrue, node(atomicValue(null)))
    }
    else if (c2.value === false) {
        return apply(kFalse, node(atomicValue(null)))
    }
    else {
        throw new Error("expected boolean")
    }
}

function tracePrim2(args: Node[]): Node {
    let [a, b] = args
    let msg = "Trace: " + showValueFe(a)
    return b
}

function errorPrim2(args: Node[]): Node {
    let [a] = args
    let value = showValueFe(a)
    logger_log("primitives", 1, `Error: ${value}`)
    throw new Error(`Error: ${value}`)
}

function showPrim2(args: Node[]): Node {
    let [a] = args
    let txt = showValueFe(a)
    return node(atomicValue(txt))
}

function showPrimFe(args: Node[]): Node {
    let [a] = args
    let txt = showValueFe(a)
    return node(atomicValue(txt))
}

function showTypePrim(args: Node[]): Node {
    let [a] = args
    let txt = JSON.stringify(a)
    return node(atomicValue(txt))
}


function mkConstPrim(a: any) {
    return (args: Node[]) => {
        return node(atomicValue(a))
    }
}

function applyPrim2(args: Node[]): Node {
    const [a, b] = args
    return apply(a, b)
}

// A non-blocking implementation of the block-until primitive.
function blockUntilPrim(args: Node[]): Node {
    const [a] = args
    // Ignore the argument, and return the identity function.
    const x = eVar({ loc: null }, "a")
    return node(closureValue({}, x, x))
}

function mkTypePrim(ty: Type) {
    return (args: Node[]) => {
        return node(typeValue(ty))
    }
}

function mkTypeFuncPrim(tyFun: (a: Type) => Type) {
    return (args: Node[]) => {
        let [a] = args
        let a1 = evalNode(a);
        if (a1.tag === 'type') {
            return node(typeValue(tyFun(a1.type)))
        }
        else {
            throw new Error(`expected function type as argument, not: ${JSON.stringify(a1)}`)
        }
    }
}

function mkTypeFunc2Prim(tyFun: (a: Type, b: Type) => Type) {
    return (args: Node[]) => {
        let [a, b] = args
        let a1 = evalNode(a);
        let b1 = evalNode(b);
        if (a1.tag === 'type' && b1.tag === 'type') {
            return node(typeValue(tyFun(a1.type, b1.type)))
        }
        else {
            throw new Error(`expected function type as argument, not: ${JSON.stringify(a1)}`)
        }
    }
}

function unionTypeListPrim(args: Node[]): Node {
    let [a] = args
    let a1 = evalNode(a)
    let rT = voidT
    let typeList: Type[] = []
    while (a1.tag === 'pair') {
        let hV = evalNode(a1.head)
        if (hV.tag === 'type') {
            typeList.push(hV.type)
        }
        else {
            throw new Error(`expected type`)
        }
        a1 = evalNode(a1.tail)
    }
    if (a1.tag !== 'atomic' || a1.value !== null) {
        throw new Error(`expected null at end of list`)
    }
    typeList.reverse().forEach((ty: Type) => {
        rT = unionTypes(ty, rT)

    })
    return node(typeValue(rT)) // ruleT("unionT", [aT, bT]
}

function variantTypePrim3(args: Node[]): Node {
    let [a, b] = args
    let a1 = evalNode(a)
    if (a1.tag === "atomic" && typeof (a1.value) === "string") {
        let aT = singleT(a1.value)
        let aName = a1.value
        let b1 = evalNode(b)
        if (b1.tag === 'type') {
            let bT = b1.type
            // let vT = types.reduceTypeRule('variantT', [aT, bT, voidT])
            let vT: Type
            vT = pairT(singleT(aName), bT)
            return node(typeValue(vT))
        }
        else {
            throw new Error(`expected type as argument, not: ${JSON.stringify(b1)}`)
        }
    }
    else {
        throw new Error(`expected string as argument, not: ${JSON.stringify(a1)}`)
    }
}

function singleTypePrim2(args: Node[]): Node {
    let [a] = args
    // const a_value = a.value
    // const a_value = a
    const a_value = evalNode(a)
    if (a_value.tag === "blocked") {
        // return "Type" instead of "(Single a)",
        // this is overly approximate, but it's better than 
        // throwing a blocked-value exception when trying to evaluate "a"
        return node(typeValue(typeT))
    }
    let a1 = evalNode(a)
    if (a1.tag === "atomic" && typeof (a1.value) === "string") {
        return node(typeValue(singleT(a1.value)))
    }
    else if (a1.tag === "type" && a1.type.tag === "TSingle") {
        // allow singleT to be applied to singleT types
        // TODO should we really need this, seems like a work-around for a value/type-leval issue somewhere else
        return a
    }
    else if (a1.tag === "type" && a1.type.tag === "TSingleTermVar") {
        return a
    }
    else if (a1.tag === "termVar") {
        return node(typeValue(singleTermVarT(a1.varName)))
    }
    else {
        throw new Error(`expected string as argument, not: ${JSON.stringify(a1)}`)
    }
}

function fixTypePrim2(args: Node[]): Node {
    let [a] = args
    let a1 = evalNode(a)
    if (a1.tag === 'closure') {
        let arg = a1.argPat
        if (arg.tag === "ETermBrackets") {
            arg = arg.expr
        }
        if (arg.tag === "EType") {
            arg = arg.expr
        }
        if (arg.tag === "EVar") {
            let recName = arg.name
            let env2 = { ...a1.env }
            env2[recName] = [node(typeValue(varT(recName))), typeT]
            let body = evalExpr(a1.expr, env2)
            let bodyVal = evalNode(body)
            if (bodyVal.tag === 'type') {
                return node(typeValue(recT(recName, bodyVal.type)))
            }
            else {
                throw new Error(`Fix: expected type value`)
            }
        }
        else {
            throw new Error(`Fix: expected single variable pattern`)
        }
    }
    else {
        throw new Error(`Fix: expected closure`)
    }
}

function selfTypePrim2(args: Node[]): Node {
    let [a] = args
    let a1 = evalNode(a)
    if (a1.tag === 'closure') {
        let arg = a1.argPat
        if (arg.tag === "EType") {
            arg = arg.expr
        }
        if (arg.tag === "EVar") {
            let recName = arg.name
            let env2 = { ...a1.env }
            env2[recName] = [node(typeValue(varT(recName))), typeT]
            let body = evalExpr(a1.expr, env2)
            let bodyVal = evalNode(body)
            if (bodyVal.tag === 'type') {
                // console.log("selfTypePrim2: ", showType2(bodyVal.type))
                return node(typeValue(selfT(recName, bodyVal.type)))
            }
            else {
                throw new Error(`Self: expected type value`)
            }
        }
        else {
            throw new Error(`Self: expected single variable pattern`)
        }
    }
    else {
        throw new Error(`Self: expected closure`)
    }
}

function selfTypePrim2b(args: Node[]): Node {
    let [a] = args
    let a1 = evalNode(a)
    if (a1.tag === 'closure') {
        let arg = a1.argPat
        if (arg.tag === "EType") {
            arg = arg.expr
        }
        if (arg.tag === "ETermBrackets" && arg.expr.tag === "EType" && arg.expr.type.tag === "EAs") {
            let recName = arg.expr.type.name
            let env2 = { ...a1.env }
            env2[recName] = [node(typeValue(varT(recName))), typeT]
            let body = evalExpr(a1.expr, env2)
            let bodyVal = evalNode(body)
            if (bodyVal.tag === 'type') {
                // console.log("selfTypePrim2: ", showType2(bodyVal.type))
                return node(typeValue(selfT(recName, bodyVal.type)))
            }
            else {
                throw new Error(`Self: expected type value`)
            }
        }
        else {
            throw new Error(`Self: expected single variable pattern`)
        }
    }
    else {
        throw new Error(`Self: expected closure`)
    }
}

function tupleMapPrim(args: Node[]): Node {
    let [f, t] = args
    let f1 = evalNode(f)
    let t1 = evalNode(t)
    if (f1.tag === 'type' && t1.tag === 'type') {
        let ty: Type = typeTupleMap(f1.type, t1.type)
        return node(typeValue(ty))
    }
    else {
        throw new Error(`TupleMap: expected two type arguments, not (${f1.tag}, ${t1.tag})`)
    }
}

// experimental
// function seqApplyPrim(args: Node[]): Node {
//     let [a, b] = args
//     let a1 = evalNode(a)
//     if (a1.tag !== "closure" && a1.tag !== "primitive2") {
//         throw new Error(`seqApplyPrim: expected closure, not (${a1.tag})`)
//     }
//     let b1 = evalNode(b)
//     if (b1.tag !== "type") {
//         throw new Error(`seqApplyPrim: expected type, not (${b1.tag})`)
//     }
//     let result = node(ev.typeValue(seqApplyT(a1, b1.type)))
//     return result
// }


function fixPrim2(args: Node[]): Node {
    let [a, b] = args
    let fix = node(primValue2("fix", 2, []))
    return apply(apply(a, apply(fix, a)), b)
}

function loopPrim2(args: Node[]): Node {
    let [a, b] = args
    let a1 = evalNode(a)
    if (a1.tag === 'closure') {

        let action = 'continue'
        let state = b
        while (action === 'continue') {
            let stepResult = evalNode(apply(a, state))
            if (stepResult.tag === 'pair') {
                let actionNode = evalNode(stepResult.head)
                if (actionNode.tag === 'atomic' && typeof actionNode.value === 'string') {
                    action = actionNode.value
                }
                else {
                    throw new Error("string action expected")
                }
                let stepResultTl = evalNode(stepResult.tail)
                if (stepResultTl.tag === "pair") {
                    state = stepResultTl.head
                }
                else {
                    throw new Error("pair expected")
                }
            }
        }
        if (action !== 'break') {
            throw new Error("action must be either 'continue' or 'break'")
        }
        return state
    }
    else {
        throw new Error(`expected function as argument, not: ${JSON.stringify(a1)}`)
    }
}

function loop2Prim2(args: Node[]): Node {
    let [a, b] = args
    let result = loopPrim2([b, a])
    return result
}

function breakPrim2(args: Node[]): Node {
    let [a] = args
    return node(pairValue(node(atomicValue('break')), node(pairValue(a, node(atomicValue(null))))))
}

function continuePrim2(args: Node[]): Node {
    let [a] = args
    return node(pairValue(node(atomicValue('continue')), node(pairValue(a, node(atomicValue(null))))))
}


// // We shouldn't really need to evaluate generated JS code during type-checking.
// function jsEvalPrim2(args: Node[]): Node {
//     let [input] = args
//     let fnCode7 = `return ${input};\n`
//     let func7 = new Function('rt', '_', fnCode7)
//     let result7 = func7(runtimeUtils, primitivesCore)
//     return node(atomicValue(result7))
// }

// function jsEvalMaybePrim2(args: Node[]): Node {
//     let result
//     try {
//         result = jsEvalPrim2(args)
//     }
//     catch {
//         return node(atomicValue(null))
//     }
//     return node(pairValue(result, node(atomicValue(null))))
// }

function todoPrim2(name: string) {
    return (args: Node[]): Node => {
        let [a] = args
        throw new Error(`TODO: this primitive (${name}) is not implemented yet`)
    }
}


function mkIfPrim(testFunc: (a: Value) => boolean) {
    return (args: Node[]) => {
        let [a, b] = args
        let a1 = evalNode(a)
        let b1 = evalNode(b)
        if (b1.tag !== 'pair') { throw new Error(`expected pair`) }
        let b2 = evalNode(b1.head)
        if (b2.tag !== 'closure') { throw new Error(`expected function`) }
        let b3 = evalNode(b1.tail)
        if (b3.tag !== 'pair') { throw new Error(`expected pair`) }
        let b4 = evalNode(b3.head)
        if (b4.tag !== 'closure') { throw new Error(`expected function`) }
        // if (a1.tag === 'atomic' && typeof a1 === "string") {
        if (testFunc(a1)) {
            return apply(b1.head, a)
        }
        else {
            return apply(b3.head, a)
        }
    }
}

function collectListElems(a: Node): Value[] {
    let a2 = evalNode(a)
    let elems: Value[] = []
    while (a2.tag === "pair") {
        let h = evalNode(a2.head)
        elems.push(h)
        a2 = evalNode(a2.tail)
    }
    if (a2.tag !== "atomic" || a2.value !== null) {
        throw new Error(`expected a nil at end of list, not (${JSON.stringify(a2)})`)
    }
    return elems
}

let strCatPrim = (args: Node[]): Node => {
    let [a] = args
    let a2 = evalNode(a)
    let elems: Value[] = collectListElems(a)
    let elemStrs = elems.map(el => {
        if (el.tag !== "atomic" || typeof (el.value) !== "string") {
            throw new Error(`expected a string in list, not (${JSON.stringify(el)})`)
        }
        return el.value
    })
    let resultStr = elemStrs.join("")
    return node(atomicValue(resultStr))
}

let strJoinPrim = (args: Node[]): Node => {
    let [a, b] = args
    let a2 = evalNode(a)
    if (a2.tag !== "atomic" || typeof (a2.value) !== "string") {
        throw new Error(`expected a string, not (${JSON.stringify(a2)})`)
    }
    let delimStr = a2.value
    let elems: Value[] = collectListElems(b)
    let elemStrs = elems.map(el => {
        if (el.tag !== "atomic" || typeof (el.value) !== "string") {
            throw new Error(`expected a string in list, not (${JSON.stringify(el)})`)
        }
        return el.value
    })
    let resultStr = elemStrs.join(delimStr)
    return node(atomicValue(resultStr))
}

let hpsDoK = (args: Node[]): Node => {
    let [result, handler] = args
    return node(pairValue(handler, node(pairValue(result, node(atomicValue(null))))))
}

let prim_hpsDo = (args: Node[]): Node => {
    let [action, handler] = args
    let k = node(primValue2("primHpsDoK", 2, []))
    let result = apply(apply(action, k), handler)
    return result
}

let prim_hpsCallK = (args: Node[]): Node => {
    let [result, handler] = args
    return result
}

let prim_hpsCall = (args: Node[]): Node => {
    let [action, handler] = args
    let k = node(primValue2("primHpsCallK", 2, []))
    let result = apply(apply(action, k), handler)
    return result
}

let prim_hpsHandlerMk = (args: Node[]): Node => {
    let [handlerMk, initState] = args
    let result = apply(handlerMk, initState)
    return result
}

// This implements the "Primitive" primitive.
// Primitive : { Str -> Type }
function primitiveTy(args: Node[]): Node {
    const [nameN] = args
    const nameV = evalNode(nameN)
    assert.isTrue(nameV.tag === "atomic" && typeof nameV.value === "string")
    const name = nameV.value
    const primEntry = lookupPrimEnv(name)
    if (primEntry === null) {
        throw new Error(`Unknown primitive (${name})`)
    }
    return node(typeValue(primEntry[1]))
}

// This implements the "primitive" primitive.
// primitive : { { name : Str } -> (Primitive name) }
function primitiveTm(args: Node[]): Node {
    const [nameN] = args
    const nameV = evalNode(nameN)
    assert.isTrue(nameV.tag === "atomic" && typeof nameV.value === "string")
    const name = nameV.value
    const primEntry = lookupPrimEnv(name)
    if (primEntry === null) {
        throw new Error(`Unknown primitive (${name})`)
    }
    return primEntry[0]
}

const primTable: PrimTable = {

    "(+)": [2, mkBinaryFunction2((a, b) => a + b), funT(intT, funT(intT, intT))],
    "(-)": [2, mkBinaryFunction2((a, b) => a - b), funT(intT, funT(intT, intT))],
    "(*)": [2, mkBinaryFunction2((a, b) => a * b), funT(intT, funT(intT, intT))],
    "(==)": [2, eqPrim2, funT(anyT, funT(anyT, boolT))],
    "(>)": [2, mkBinaryFunction2((a, b) => a > b), funT(anyT, funT(anyT, boolT))],
    "(>=)": [2, mkBinaryFunction2((a, b) => a >= b), funT(anyT, funT(anyT, boolT))],
    "(<)": [2, mkBinaryFunction2((a, b) => a < b), funT(anyT, funT(anyT, boolT))],
    "(<=)": [2, mkBinaryFunction2((a, b) => a <= b), funT(anyT, funT(anyT, boolT))],

    "not": [1, mkUnaryFunction2((a) => !a), funT(boolT, boolT)],
    "(&&)": [2, mkBinaryFunction2((a, b) => a && b), funT(boolT, funT(boolT, boolT))],
    "(||)": [2, mkBinaryFunction2((a, b) => a || b), funT(boolT, funT(boolT, boolT))],

    "(|-)": [2, mkBinaryFunction2((a, b) => a ? b : null), funT(boolT, funPT("A", anyT, unionT(nilT, varT("A"))))],
    "(|=)": [2, mkBinaryFunction2((a, b) => a ? [b, null] : null), funT(boolT, funPT("A", anyT, unionT(nilT, pairT(varT("A"), nilT))))],


    "head": [1, mkProjecttionPrim((a: PairValue) => a.head), funPT("X", pairT(anyT, anyT), ruleT("hdT", [varT("X")]))],
    "tail": [1, mkProjecttionPrim((a: PairValue) => a.tail), funPT("X", pairT(anyT, anyT), ruleT("tlT", [varT("X")]))],
    "hd": [1, mkProjecttionPrim((a: PairValue) => a.head), funPT("X", pairT(anyT, anyT), ruleT("hdT", [varT("X")]))],
    "tl": [1, mkProjecttionPrim((a: PairValue) => a.tail), funPT("X", pairT(anyT, anyT), ruleT("tlT", [varT("X")]))],

    "if": [2, if2Prim2, funT(boolT, funPT("K", pairT(funT(nilT, anyT), pairT(funT(nilT, anyT), nilT)),
        ruleT("rangeT", [ruleT("elemT", [varT("K")])])))],
    "if2": [2, if2Prim2, funT(boolT, funPT("K", pairT(funT(nilT, anyT), pairT(funT(nilT, anyT), nilT)),
        ruleT("rangeT", [ruleT("elemT", [varT("K")])])))],

    "trace": [2, tracePrim2, funT(anyT, funPT("T", anyT, varT("T")))],
    "trace2": [2, tracePrim2, funT(anyT, funPT("T", funT(nilT, anyT), rangeT(varT("T"))))],
    "error": [1, errorPrim2, funT(anyT, errorT)],
    "show": [1, showPrim2, funT(anyT, strT)],
    "show2": [1, showPrimFe, funT(anyT, strT)],
    "showType": [1, showTypePrim, funT(typeT, strT)],
    "false": [0, mkConstPrim(false), boolT],
    "true": [0, mkConstPrim(true), boolT],


    // Specializing application.
    // There is (currently) no runtime specialization, 
    //   so this is implemented as conventional application)
    "(<$)": [2, applyPrim2, funPT("F", funT(voidT, anyT), funPT("A", ruleT('domainT', [varT('F')]), ruleT('applyT', [varT('F'), varT('A')])))],
    // block-reduction-until, so as to conditionally stop-specializing.
    // This can just immediately return the identity function,
    //   as no specialization (currently) occurs at runtime.
    "(_$?)": [1, blockUntilPrim, funT(anyT, funPT("X", anyT, varT("X")))],


    "{|}": [2, mkTypeFunc2Prim(unionTypes), funT(typeT, funT(typeT, typeT))],
    "{&}": [2, mkTypeFunc2Prim(intersectTypes), funT(typeT, funT(typeT, typeT))],
    "{\\}": [2, mkTypeFunc2Prim(typeRelComp1), funT(typeT, funT(typeT, typeT))],
    "Single": [1, singleTypePrim2, funDT("S", strT, singleTypeT(singleTermVarT("S")))],

    "Any": [0, mkTypePrim(anyT), typeT],
    "All": [0, mkTypePrim(anyT), typeT], // just reusing Any for All for now.
    "Void": [0, mkTypePrim(voidT), typeT],
    "Nil": [0, mkTypePrim(nilT), singleTypeT(nilT)],
    "Int": [0, mkTypePrim(intT), singleTypeT(intT)],
    "Str": [0, mkTypePrim(strT), singleTypeT(strT)],
    "Char": [0, mkTypePrim(charT), singleTypeT(charT)],
    "Bool": [0, mkTypePrim(boolT), singleTypeT(boolT)],
    "Domain": [1, mkTypeFuncPrim(typeDom), funT(typeT, typeT)],
    "Dom": [1, mkTypeFuncPrim(typeDom), funT(typeT, typeT)],
    "Codomain": [1, mkTypeFuncPrim(typeRng), funT(typeT, typeT)],
    "Cod": [1, mkTypeFuncPrim(typeRng), funT(typeT, typeT)],
    "Inverse": [1, mkTypeFuncPrim(typeInverse), funT(typeT, typeT)],
    "InverseApply": [2, mkTypeFunc2Prim(typeInverseApply), funT(typeT, funT(typeT, typeT))],
    "Fun": [2, mkTypeFunc2Prim(funT), funT(typeT, funT(typeT, typeT))],
    "Union": [1, unionTypeListPrim, funT(listT(typeT), typeT)],
    "List": [1, mkTypeFuncPrim(listT), funDT("T", typeT, singleTypeT(listT(varT("T"))))],
    "Hd": [1, mkTypeFuncPrim(typeHd), funT(typeT, typeT)],
    "Tl": [1, mkTypeFuncPrim(typeTl), funT(typeT, typeT)],
    "Elem": [1, mkTypeFuncPrim(typeElem), funT(typeT, typeT)],
    "Type": [0, mkTypePrim(typeT), typeT],
    "Unknown": [0, mkTypePrim(unknownT), typeT],
    "Error": [0, mkTypePrim(errorT), typeT],
    "Variant": [2, variantTypePrim3, funT(strT, funT(typeT, typeT))],

    "Fix": [1, fixTypePrim2, funT(funT(typeT, typeT), typeT)],
    "Self": [1, selfTypePrim2b, funT(funT(voidT, typeT), typeT)],
    "SelfT": [1, selfTypePrim2, funT(funT(typeT, typeT), typeT)],

    "TupleMap": [2, tupleMapPrim, funT(typeT, funT(typeT, typeT))],

    "coerceT": [1, mkTypeFuncPrim(a => a), funT(anyT, voidT)],
    // "castT": [1, mkTypeFuncPrim(a => a), funT(anyT, voidT)], 
    "castT": [1, (([a]: Node[]) => a), funT(anyT, voidT)],

    // TODO make cast be explicit about types
    // "cast": [castTypePrim2, funHT("A", typeT, funHT("B", typeT, funT(varT("A"), varT("B")))), 'prim'],

    "typeOf": [1, mkUnaryFunction2(a => null), funT(anyT, typeT)],

    "fix": [2, fixPrim2
        , funPT("F"
            , funT(funT(anyT, voidT), ruleT('domainT', [varT('F')]))
            , ruleT('rangeT', [varT('F')]))
    ],
    "fix2": [2, fixPrim2
        , funPT("F"
            , funT(funT(anyT, voidT), ruleT('domainT', [varT('F')]))
            , ruleT('rangeT', [varT('F')]))
    ],

    "loop1": [2, loopPrim2, loopType],
    "loop2": [2, loop2Prim2, loop2Type],
    "break": [1, breakPrim2, breakType],
    "continue": [1, continuePrim2, continueType],

    "grLoop": [2, todoPrim2("grLoop"), funT(anyT, voidT)], // TODO correct types
    "grWhile": [2, todoPrim2("grWhile"), funT(anyT, voidT)],

    "unknownVariable": [1, todoPrim2("unknownVariable"), funT(strT, anyT)],
    "unknownPrimitive": [2, todoPrim2("unknownPrimitive"), funT(strT, funT(anyT, anyT))],

    // "jsEval": [1, jsEvalPrim2, funT(strT, anyT)],
    // "jsEvalMaybe": [1, jsEvalMaybePrim2, funT(strT, unionT(nilT, pairT(anyT, nilT)))],

    "jsEval": [1, todoPrim2("jsEval"), funT(strT, anyT)],
    "jsEvalMaybe": [1, todoPrim2("jsEvalMaybe"), funT(strT, unionT(nilT, pairT(anyT, nilT)))],

    // fe4 io
    "ioDoPrim": [1, todoPrim2("ioDoPrim"), funT(voidT, anyT)],

    "primMkArrayFastAccessSlowCopy": [1, todoPrim2("primMkArrayFastAccessSlowCopy"), funT(voidT, anyT)],
    "primMkArrayFastAccessNoCopy": [1, todoPrim2("primMkArrayFastAccessNoCopy"), funT(voidT, anyT)],

    "primAssoc1MkPersistent": [1, todoPrim2("primAssoc1MkPersistent"), funT(voidT, anyT)],
    "primAssoc1MkEphemeral": [1, todoPrim2("primAssoc1MkEphemeral"), funT(voidT, anyT)],


    "ifNil": [2, mkIfPrim(a => a.tag === 'atomic' && a.value === null),
        funPT("V", anyT,
            funPT("K", pairT(funT(nilT, anyT), pairT(funT(ruleT("relcompT", [varT("V"), nilT]), anyT), nilT)),
                ruleT("unionT", [ruleT("rangeT", [ruleT("hdT", [varT("K")])]), ruleT("rangeT", [ruleT("hdT", [ruleT("tlT", [varT("K")])])])])))],

    "ifInt": [2, mkIfPrim(a => a.tag === 'atomic' && typeof a.value === "number"),
        funPT("V", anyT,
            funPT("K", pairT(funT(intT, anyT), pairT(funT(ruleT("relcompT", [varT("V"), intT]), anyT), nilT)),
                ruleT("unionT", [ruleT("rangeT", [ruleT("hdT", [varT("K")])]), ruleT("rangeT", [ruleT("hdT", [ruleT("tlT", [varT("K")])])])])))],

    "ifBool": [2, mkIfPrim(a => a.tag === 'atomic' && typeof a.value === "boolean"),
        funPT("V", anyT,
            funPT("K", pairT(funT(boolT, anyT), pairT(funT(relcompT(varT("V"), boolT), anyT), nilT)),
                unionT(applyT(hdT(varT("K")), boolT), applyT(hdT(tlT(varT("K"))), relcompT(varT("V"), boolT)))))],

    "ifStr": [2, mkIfPrim(a => a.tag === 'atomic' && typeof a.value === "string"),
        funPT("V", anyT,
            funPT("K", pairT(funT(strT, anyT), pairT(funT(relcompT(varT("V"), strT), anyT), nilT)),
                unionT(applyT(hdT(varT("K")), strT), applyT(hdT(tlT(varT("K"))), relcompT(varT("V"), strT)))))],

    "ifPair": [2, mkIfPrim(a => a.tag === 'pair'),
        funPT("V", anyT,
            funPT("K", pairT(funT(pairT(anyT, anyT), anyT), pairT(funT(relcompT(varT("V"), pairT(anyT, anyT)), anyT), nilT)),
                unionT(applyT(hdT(varT("K")), pairT(anyT, anyT)), applyT(hdT(tlT(varT("K"))), relcompT(varT("V"), pairT(anyT, anyT))))))],

    "ifType": [2, mkIfPrim(a => a.tag === 'type'),
        funPT("V", anyT,
            funPT("K", pairT(funT(typeT, anyT), pairT(funT(relcompT(varT("V"), typeT), anyT), nilT)),
                unionT(applyT(hdT(varT("K")), typeT), applyT(hdT(tlT(varT("K"))), relcompT(varT("V"), typeT)))))],


    "strOrd": [1, mkUnaryFunction2((a) => a.charCodeAt(0)), funT(strT, intT)],
    "strChr": [1, mkUnaryFunction2((a) => String.fromCharCode(a)), funT(intT, charT)],
    "strLen": [1, mkUnaryFunction2((a) => a.length), funT(strT, intT)],
    "strAdd": [2, mkBinaryFunction2((a, b) => a + b), funT(strT, funT(strT, strT))],
    "strCharAt": [2, mkBinaryFunction2((a, b) => a.charAt(b)), funT(strT, funT(intT, strT))],
    "strCharAtMb": [2, mkBinaryFunction2((a, b) => a.charAt(b)), funT(strT, funT(intT, maybeT(charT)))],

    "jsStrCat": [1, strCatPrim, funT(listT(strT), strT)],
    "jsStrJoin": [2, strJoinPrim, funT(strT, funT(listT(strT), strT))],
    "char_concat": [1, strCatPrim, funT(listT(charT), strT)],

    "primHpsDoK": [2, hpsDoK, funT(voidT, anyT)],
    "primHpsDo": [2, prim_hpsDo, funT(voidT, anyT)],
    "primHpsK": [2, prim_hpsCallK, funT(voidT, anyT)],
    "primHpsCall": [2, prim_hpsCall, funT(voidT, anyT)],
    "primHpsHandlerMk": [2, prim_hpsHandlerMk, funT(voidT, anyT)],

    "Primitive": [1, primitiveTy, funT(strT, typeT)],
    "primitive": [1, primitiveTm, funDT("P", strT, ruleT("primitiveT", [varT("P")]))],
}

// declarePrimitives(primTable)



export function initPrimitives() {
    declarePrimitives(primTable)
}


