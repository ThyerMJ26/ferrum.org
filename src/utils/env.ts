// TODO An Environment whose implementation can be switched to using an immutable map without changing the interface.
// TODO Rather than calling 
// TODO   const env2 = new Map(env1)
// TODO We should use
// TODO   const env2 = env1.clone()
// TODO 
// TODO Whether this calls "new Map", or uses another technique is then an implementation detail.

// TODO ? try using immutable, save copying env maps
// import immutable from "npm:immutable"

// TODO ? Change the "Env" in "eval.ts" to this one. ?
// TODO ?   This requires changes to everything that uses the eval.ts/env as an object to use this interface instead.

import { assert } from "../utils/assert.js"

//#region Interface

export type EnvR<T> = {
    has: (name: string) => boolean
    get: (name: string) => T
    clone: () => EnvRw<T>
    toList: () => [string, T][]
}

export type EnvRo<T> = EnvR<T> & {
    __brand_ro: never
}

export type EnvW<T> = {
    set: (name: string, value: T) => void
    freeze(): EnvRo<T> // "set" must not be called after "freeze".
}
export type EnvRw<T> = EnvR<T> & EnvW<T> & {
    // TODO ? Make it easy to narrow the type ?
    // ro(): EnvRo<T>
    // wo(): EnvWo<T>
    // TODO ? Update mutiple entries at once ?
    // update(envR: EnvR<T>)

    // TODO ? Track changes,
    // TODO ? Returns a new interface to the same underlying Env,
    // TODO ?   but writes through the new interface are also forwarded on to the tracking env.
    // track(env: EnvW<T>): EnvRw
}
// export type Env<T> = EnvRw<T>

export function mkEnv<T>(): EnvRw<T> { 
    return new EnvImpl(new Map) 
}





// export function envFreeze<T>(env: EnvRw<T>): asserts env is EnvRo<T> {
//     env.freeze()
// }


//#endregion



//#region Implementation


class EnvImpl<T> implements EnvRw<T> {
    env: Map<string, T>
    frozen = false
    constructor(env: Map<string, T>) {
        this.env = new Map(env)
    }
    has(name: string) {
        const value = this.env.get(name)
        return (value !== undefined)
    }
    get(name: string) {
        const value = this.env.get(name)
        if (value === undefined) {
            throw new Error(`unknown variable (${name})`)
        }
        return value
    }
    set(name: string, value: T) {
        assert.isFalse(this.frozen, `"set" must not be called after "freeze"`)
        this.env.set(name, value)
    }
    clone() {
        return new EnvImpl(this.env)
    }
    freeze() /* : asserts this is EnvRo */ {
        this.frozen = true
        return this as any as EnvRo<T>
    }
    toList() {
        return [...this.env]
    }
}

//#endregion