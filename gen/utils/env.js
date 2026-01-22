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
import { assert } from "../utils/assert.js";
// export type Env<T> = EnvRw<T>
export function mkEnv() {
    return new EnvImpl(new Map);
}
// export function envFreeze<T>(env: EnvRw<T>): asserts env is EnvRo<T> {
//     env.freeze()
// }
//#endregion
//#region Implementation
class EnvImpl {
    env;
    frozen = false;
    constructor(env) {
        this.env = new Map(env);
    }
    has(name) {
        const value = this.env.get(name);
        return (value !== undefined);
    }
    get(name) {
        const value = this.env.get(name);
        if (value === undefined) {
            throw new Error(`unknown variable (${name})`);
        }
        return value;
    }
    set(name, value) {
        assert.isFalse(this.frozen, `"set" must not be called after "freeze"`);
        this.env.set(name, value);
    }
    clone() {
        return new EnvImpl(this.env);
    }
    freeze() {
        this.frozen = true;
        return this;
    }
    toList() {
        return [...this.env];
    }
}
//#endregion
//# sourceMappingURL=env.js.map