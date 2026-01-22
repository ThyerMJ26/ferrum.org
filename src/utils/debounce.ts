import { unit } from "./unit.js"

export function debounceCallback(delayMs: number, cb: () => unit) {
    let isPending = false
    function cb2() {
        if (isPending) {
            return
        }
        isPending = true
        setTimeout(() => {
            isPending = false
            cb()
        }, delayMs)
    }
    return cb2
}

