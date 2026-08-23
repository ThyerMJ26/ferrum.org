export function equalObjects<T extends Object>(a: T, b: T): boolean {
    if (a === b) {
        return true
    }
    else if (typeof a === 'object' && typeof b === 'object') {
        let fields = { ...Object.getOwnPropertyNames(a), ...Object.getOwnPropertyNames(b) }
        for (const f in a) {
            if (a.hasOwnProperty(f)) {
                if (!b.hasOwnProperty(f)) {
                    return false
                }
                if (!equalObjects(a[f] as Object, b[f] as Object)) {
                    return false
                }
            }
        }
        for (const f in b) {
            if (b.hasOwnProperty(f)) {
                if (!a.hasOwnProperty(f)) {
                    return false
                }
            }
        }
        return true
    }
    else {
        return false
    }
}

// This looks more type-correct, 
//   but different compilers and IDEs disagree
//   in different ways at different times and in different places.
// export function equalObjects<T extends any>(a: T, b: T): boolean {
//     if (a === b) {
//         return true
//     }
//     else if (typeof a === 'object' && typeof b === 'object') {
//         let fields = { ...Object.getOwnPropertyNames(a), ...Object.getOwnPropertyNames(b) }
//         for (const f in a) {
//             if (a.hasOwnProperty(f)) {
//                 if (b === null || !b.hasOwnProperty(f)) {
//                     return false
//                 }
//                 if (!equalObjects(a[f], b[f])) {
//                     return false
//                 }
//             }
//         }
//         for (const f in b) {
//             if (b.hasOwnProperty(f)) {
//                 if (a === null || !a.hasOwnProperty(f)) {
//                     return false
//                 }
//             }
//         }
//         return true
//     }
//     else {
//         return false
//     }
// }


