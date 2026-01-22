import { assert } from "../utils/assert.js";
// "Type" is always at address zero.
export const addrTypeType = 0;
export const depthZero = 0;
export function depthInc(depth, shift = 1) {
    return depth + shift;
}
export function depthMax2(a, b) {
    return a >= b ? a : b;
}
export function depthMax(...depths) {
    let result = depthZero;
    for (const depth of depths) {
        result = depth > result ? depth : result;
    }
    return result;
}
export const false0 = 0;
export const true1 = 1;
export function booleanToBool(a) {
    return a ? true1 : false0;
}
export const depthNo = -1;
export const addrNo = -1;
export function isAddrYes(addrMb) {
    return addrMb >= 0;
}
export function isAddrNo(addrMb) {
    return addrMb === addrNo;
}
export const addrFail = -2;
export function isAddrOk(addrTry) {
    return addrTry !== addrFail;
}
export function isAddrMbOk(addrTry) {
    return addrTry !== addrFail;
}
export function isAddrFail(addrTry) {
    return addrTry === addrFail;
}
// export type NodeWalkerWithDefaults = {
//     child(addr: Addr): void
//     childMb?(addr: AddrMb): void
//     childTy?(addr: TypeAddr): void
//     childTyMb?(addr: TypeAddrMb): void
// }
export function assumeIsType(addr) {
    return;
}
export function assumeIsDirect(addr) {
    return;
}
export const formNone = "None";
export const formError = "Error";
export const formWeak = "Weak";
export const formStrong = "Strong";
formNone;
formError;
formWeak;
formStrong;
export const weak = "Weak";
export const strong = "Strong";
function formToInt(form) {
    switch (form) {
        case "None": return 0;
        case "Weak": return 1;
        case "Strong": return 2;
        case "Error": return 3;
        default: assert.noMissingCases(form);
    }
}
function formFromInt(form) {
    switch (form) {
        case 0: return "None";
        case 1: return "Weak";
        case 2: return "Strong";
        case 3: return "Error";
        default: assert.unreachable();
    }
}
export function formMin(a, b) {
    // if (a === formNone) return a
    // if (b === formNone) return b
    // if (a === formWeak) return a
    // if (b === formWeak) return b
    // if (a === formStrong) return a
    // if (b === formStrong) return b
    // if (a === formError) return a
    // if (b === formError) return b
    // assert.unreachable()
    return formFromInt(Math.min(formToInt(a), formToInt(b)));
}
export function formMax(a, b) {
    // if (a === formError) return a
    // if (b === formError) return b
    // if (a === formStrong) return a
    // if (b === formStrong) return b
    // if (a === formWeak) return a
    // if (b === formWeak) return b
    // if (a === formNone) return a
    // if (b === formNone) return b
    // assert.unreachable()
    return formFromInt(Math.max(formToInt(a), formToInt(b)));
}
// export function formMerge(a: Form, b: Form): Form {
//     if (a === formError || b === formError) return formError
//     return formMin(a, b)
// }
export function formGte(a, b) {
    return formToInt(a) >= formToInt(b);
}
export function formLt(a, b) {
    return formToInt(a) < formToInt(b);
}
export function isTyOp2Name_Concrete(name) {
    switch (name) {
        case "|":
        case "&":
        case "\\":
        case "<:":
        case ":>":
            return true;
        default:
            return false;
    }
}
export function isTyOp2Name(name) {
    switch (name) {
        case "{|}":
        case "{&}":
        case "{\\}":
        case "{<:}":
        case "{:>}":
            return true;
        default:
            return false;
    }
}
//# sourceMappingURL=graph-heap2.js.map