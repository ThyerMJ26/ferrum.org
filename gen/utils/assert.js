export const assert = {
    isTrue,
    allTrue,
    isFalse,
    isNotNull,
    isDefined,
    impossible,
    unreachable,
    todo,
    breakpoint,
    noMissingCases,
};
function getMsg(msg) {
    switch (typeof msg) {
        case "function":
            msg = msg();
            break;
        case "undefined":
            msg = "";
            break;
        case "string":
            break;
        default:
            assert.noMissingCases(msg);
    }
    return msg;
}
export function isTrue(value, msg) {
    if (value !== true) {
        console.error(`Assertion Failed: (${getMsg(msg)})`);
        throw new Error(`Assertion Failed: (${getMsg(msg)})`);
    }
}
export function allTrue(predicate, value, msg) {
    if (!value.every(predicate)) {
        console.error(`Assertion Failed: (${getMsg(msg)})`);
        throw new Error(`Assertion Failed: (${getMsg(msg)})`);
    }
}
export function isFalse(value, msg) {
    if (value !== false) {
        console.error(`Assertion Failed: (${getMsg(msg)})`);
        throw new Error(`Assertion Failed: (${getMsg(msg)})`);
    }
}
export function isNotNull(value, msg) {
    if (value === null) {
        console.error(`Assertion Failed: (${getMsg(msg)})`);
        throw new Error(`Assertion Failed: (${getMsg(msg)})`);
    }
}
export function isDefined(value, msg) {
    if (value === undefined) {
        console.error(`Assertion Failed: (${getMsg(msg)})`);
        throw new Error(`Assertion Failed: (${getMsg(msg)})`);
    }
}
export function impossible(msg = "") {
    console.error(`But, That's IMPOSSIBLE !!! (${getMsg(msg)})`);
    throw new Error(`But, That's IMPOSSIBLE !!! (${getMsg(msg)})`);
}
export function unreachable(msg = "") {
    console.error(`Unreachable code has been reached !!! (${getMsg(msg)})`);
    throw new Error(`Unreachable code has been reached !!! (${getMsg(msg)})`);
}
export function todo(msg = "") {
    console.error(`TODO !!! (${getMsg(msg)})`);
    throw new Error(`TODO !!! (${getMsg(msg)})`);
}
export function breakpoint(msg = "") {
    console.error(`Breakpoint Reached: ${getMsg(msg)}`);
}
function reportMissingCaseError(msg) {
    console.error(`Missing Case: ${getMsg(msg)}`);
    throw new Error(`Missing Case: ${getMsg(msg)}`);
}
// a compile-time missing case check
export function noMissingCases(arg) {
    reportMissingCaseError(`${arg}`);
}
// // a run-time missing case check
// export function noMissingCasesRt(arg: any): never {
//     reportMissingCaseError(`${arg}`)
// }
//# sourceMappingURL=assert.js.map