/** 
 * 
 */

import { assert } from "../utils/assert.js"

export class FuelExhausted extends Error {
}

export type Fuel = {
    refill(): void
    // jettison(): void
    // add(extra: number): void
    use(): boolean
    // TODO ? Separate checking and using ?
    // use(): void
    // isExhausted(): boolean
    // isAvailable(): boolean
    // TODO ? permit checking for a specific amount ?
    // isAvailable(needed: number): boolean
    // level(): number

    // stop(): void
    // start(): void
    // isStopped(): boolean
    // isStarted(): boolean
}

export function fuelMk(capacity: number): Fuel {
    return new FuelImpl(capacity, 1)
}
export function fuelInfinite(): Fuel {
    return new FuelImpl(1_000_000_000, 0)
}


let nextFuelId = 1

class FuelImpl implements Fuel {
    id: number 
    _capacity: number
    _level: number
    _stepSize: number
    started: boolean
    _exhausted: boolean = false
    constructor(initVal: number, stepSize: number) {
        assert.isTrue(initVal >= 0 && Number.isInteger(initVal))
        this.id = nextFuelId++
        this._capacity = initVal
        this._stepSize = stepSize
        this._level = initVal
        this.started = false
    }
    refill(): void {
        this._level = this._capacity
        this._exhausted = false
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
    use(): boolean {
        if (this._level <= 0) {
            this._exhausted = true
            throw new FuelExhausted("Fuel Exhausted")
        }
        assert.isTrue(this._level >= 0)
        if (this._level === 0) {
            return false
            // TODO ? Separate checking and using fuel,
            // TODO ?   if a user fail to check first, complain.
            // throw FuelExhaustedError
        }
        this._level -= this._stepSize
        return true
    }
    // isExhausted(): boolean {
    //     // return this._level <= 0
    //     return this._exhausted
    // }
    // isAvailable(): boolean {
    //     // TODO ? Does fuel need to be started / free-flowing in order to be considered available ?
    //     return this._level > 0
    // }
    // level(): number {
    //     return this._level
    // }
    // stop(): void {
    //     this.started = false
    // }
    // start(): void {
    //     this.started = true
    // }
    // isStarted(): boolean {
    //     return this.started
    // }
    // isStopped(): boolean {
    //     return !this.started
    // }
}

