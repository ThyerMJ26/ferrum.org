/**
 *
 */
import { assert } from "../utils/assert.js";
export class FuelExhausted extends Error {
}
export function fuelMk(capacity) {
    return new FuelImpl(capacity, 1);
}
export function fuelInfinite() {
    return new FuelImpl(1_000_000_000, 0);
}
let nextFuelId = 1;
class FuelImpl {
    id;
    _capacity;
    _level;
    _stepSize;
    started;
    _exhausted = false;
    constructor(initVal, stepSize) {
        assert.isTrue(initVal >= 0 && Number.isInteger(initVal));
        this.id = nextFuelId++;
        this._capacity = initVal;
        this._stepSize = stepSize;
        this._level = initVal;
        this.started = false;
    }
    refill() {
        this._level = this._capacity;
        this._exhausted = false;
    }
    // jettison(): void {
    //     // this._level = 0
    //     // A jettisoned fuel tank is even more empty than an exhausted the fuel tank.
    //     // Even if more fuel becomes available in the same server-call, we want to return early, not refuel.
    //     this._level = -1
    // }
    // add(extra: number): void {
    //     this._level += extra
    // }
    use() {
        if (this._level <= 0) {
            this._exhausted = true;
            throw new FuelExhausted("Fuel Exhausted");
        }
        assert.isTrue(this._level >= 0);
        if (this._level === 0) {
            return false;
            // TODO ? Separate checking and using fuel,
            // TODO ?   if a user fail to check first, complain.
            // throw FuelExhaustedError
        }
        this._level -= this._stepSize;
        return true;
    }
}
//# sourceMappingURL=fuel.js.map