import { assert } from "../utils/assert.js";
import { applyClosure, applyPrimitive } from "./eval.js";
import { TypeDefn } from "../runtime/runtime-core.js";
export const mkValue = {
    nil() { assert.todo(); },
    bool(a) { assert.todo(); },
    int(a) { assert.todo(); },
    str(a) { assert.todo(); },
    pair(h, t) { assert.todo(); },
    func(f) { assert.todo(); },
    type(prim, ...args) { assert.todo(); },
};
// A function-interface.
// This makes it possible to still memoize the type-checking functions.
function value_isTag(a, tag) {
    return (true
        && a !== null
        && !(a instanceof Array)
        && !(a instanceof TypeDefn)
        && typeof a === "object"
        && a.tag === tag);
}
function value_isNil(a) {
    return (false
        || a === null
        || value_isTag(a, "atomic") && a.value === null);
}
function value_isBool(a) {
    return (false
        || typeof a === "boolean"
        || value_isTag(a, "atomic") && typeof a.value === "boolean");
}
function value_isInt(a) {
    return (false
        || typeof a === "number"
        || value_isTag(a, "atomic") && typeof a.value === "number");
}
function value_isStr(a) {
    return (false
        || typeof a === "string"
        || value_isTag(a, "atomic") && typeof a.value === "string");
}
function value_isPair(a) {
    return (false
        || a instanceof Array
        || value_isTag(a, "pair"));
}
function value_isFunc(a) {
    return (false
        || a instanceof Function
        || value_isTag(a, "closure")
        || value_isTag(a, "closureJust")
        || value_isTag(a, "closureMaybe")
        || value_isTag(a, "closureNothing")
        || value_isTag(a, "primitive2"));
}
function value_isType(a) {
    return (false
        || a instanceof TypeDefn
        || value_isTag(a, "type"));
}
function value_asNil(a) {
    if (a === null)
        return null;
    if (value_isTag(a, "atomic") && a.value === null)
        return null;
    assert.unreachable();
}
function value_asBool(a) {
    if (typeof a === "boolean")
        return a;
    if (value_isTag(a, "atomic") && typeof a.value === "boolean")
        return a.value;
    assert.unreachable();
}
function value_asInt(a) {
    if (typeof a === "number")
        return a;
    if (value_isTag(a, "atomic") && typeof a.value === "number")
        return a.value;
    assert.unreachable();
}
function value_asStr(a) {
    if (typeof a === "string")
        return a;
    if (value_isTag(a, "atomic") && typeof a.value === "string")
        return a.value;
    assert.unreachable();
}
function value_hd(a) {
    if (a instanceof Array)
        return a[0];
    if (value_isTag(a, "pair"))
        return a.head;
    assert.unreachable();
}
function value_tl(a) {
    if (a instanceof Array)
        return a[1];
    if (value_isTag(a, "pair"))
        return a.tail;
    assert.unreachable();
}
function value_apply(f, a) {
    if (f instanceof Function)
        return f(a);
    if (value_isTag(f, "closure") || value_isTag(f, "closureJust") || value_isTag(f, "closureMaybe") || value_isTag(f, "closureNothing")) {
        return applyClosure(f, a, null);
    }
    if (value_isTag(f, "primitive2")) {
        return applyPrimitive(f, a, null);
    }
    assert.unreachable();
}
// function value_asType(a: Value): Type {
//     assert.todo()
// } 
// Impementation
// class ValueImpl implements Value {
//     isNil(): boolean { assert.todo() }
//     isBool(): boolean { assert.todo() }
//     isInt(): boolean { assert.todo() }
//     isStr(): boolean { assert.todo() }
//     isPair(): boolean { assert.todo() }
//     isFunc(): boolean { assert.todo() }
//     isType(): boolean { assert.todo() }
//     asNil(): null { assert.todo() }
//     asBool(): boolean { assert.todo() }
//     asInt(): number { assert.todo() }
//     asStr(): string { assert.todo() }
//     hd(): Value { assert.todo() }
//     tl(): Value { assert.todo() }
//     apply(arg: Value): Value { assert.todo() }
//     asType(): Type { assert.todo() }
// }
//# sourceMappingURL=value.js.map