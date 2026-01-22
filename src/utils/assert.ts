
type Assert = {
    // ok(value: boolean, msg?: Msg): asserts value,
    isTrue(value: boolean, msg?: Msg): asserts value,
    // isTrue(value: boolean, msg?: Msg): asserts value is true,
    allTrue<A, T extends A>(predicate: Predicate<A, T>, value: A[], msg?: Msg): asserts value is T[]
    isFalse(value: boolean, msg?: Msg): asserts value is false,
    isNotNull<T>(value: T | null, msg?: Msg): asserts value is T,
    isDefined<T>(value: T | undefined, msg?: Msg): asserts value is T,
    impossible(msg?: Msg): never,
    unreachable(msg?: Msg): never,
    todo(msg?: Msg): never,
    breakpoint(msg?: Msg): void,
    noMissingCases(arg: never): never,
}

export const assert: Assert = {
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
} as const

type Msg = string | (() => string) | undefined

function getMsg(msg: Msg): string {
    switch (typeof msg) {
        case "function":
            msg = msg()
            break
        case "undefined":
            msg = ""
            break
        case "string":
            break
        default:
            assert.noMissingCases(msg)
    }
    return msg
}


export function isTrue(value: boolean, msg?: Msg): asserts value is true {
    if (value !== true) {
        console.error(`Assertion Failed: (${getMsg(msg)})`)
        throw new Error(`Assertion Failed: (${getMsg(msg)})`)
    }
}

type Predicate<A, T extends A> = {
    (a: A): a is T
}

export function allTrue<A, T extends A>(predicate: Predicate<A, T>, value: A[], msg?: Msg): asserts value is T[] {
    if (!value.every(predicate)) {
        console.error(`Assertion Failed: (${getMsg(msg)})`)
        throw new Error(`Assertion Failed: (${getMsg(msg)})`)
    }
}

export function isFalse(value: boolean, msg?: Msg): asserts value is false {
    if (value !== false) {
        console.error(`Assertion Failed: (${getMsg(msg)})`)
        throw new Error(`Assertion Failed: (${getMsg(msg)})`)
    }
}

export function isNotNull<T>(value: T | null, msg?: Msg): asserts value is T {
    if (value === null) {
        console.error(`Assertion Failed: (${getMsg(msg)})`)
        throw new Error(`Assertion Failed: (${getMsg(msg)})`)
    }
}

export function isDefined<T>(value: T | undefined, msg?: Msg): asserts value is T {
    if (value === undefined) {
        console.error(`Assertion Failed: (${getMsg(msg)})`)
        throw new Error(`Assertion Failed: (${getMsg(msg)})`)
    }
}

export function impossible(msg: Msg = ""): never {
    console.error(`But, That's IMPOSSIBLE !!! (${getMsg(msg)})`)
    throw new Error(`But, That's IMPOSSIBLE !!! (${getMsg(msg)})`)
}

export function unreachable(msg: Msg = ""): never {
    console.error(`Unreachable code has been reached !!! (${getMsg(msg)})`)
    throw new Error(`Unreachable code has been reached !!! (${getMsg(msg)})`)
}

export function todo(msg: Msg = ""): never {
    console.error(`TODO !!! (${getMsg(msg)})`)
    throw new Error(`TODO !!! (${getMsg(msg)})`)
}

export function breakpoint(msg: Msg = ""): void {
    console.error(`Breakpoint Reached: ${getMsg(msg)}`)
}


function reportMissingCaseError(msg: Msg): never {
    console.error(`Missing Case: ${getMsg(msg)}`)
    throw new Error(`Missing Case: ${getMsg(msg)}`)
}

// a compile-time missing case check
export function noMissingCases(arg: never): never {
    reportMissingCaseError(`${arg}`)
}

// // a run-time missing case check
// export function noMissingCasesRt(arg: any): never {
//     reportMissingCaseError(`${arg}`)
// }

