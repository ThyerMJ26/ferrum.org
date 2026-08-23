

import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"

import { Token } from "../syntax/token.js"
import { ExprLoc, DeclLoc, TorT } from "../syntax/expr.js"
import { Loc } from "../syntax/token.js"


export class ParseState {
    input: Token[]
    pos: number

    tortStack: TorT[] = []

    // TODO Take an error reporting callback, so as to handle errors better.
    constructor(input: Token[]) {
        this.input = input
        this.pos = 0
    }
    peek(): Token {
        if (!(this.pos < this.input.length)) throw new Error("past end of input")
        return this.input[this.pos]
    }
    take(): Token {
        if (!(this.pos < this.input.length)) throw new Error("past end of input")
        let token = this.input[this.pos]
        this.pos++
        return token
    }
    prev(): Token {
        if (this.pos === 0) {
            throw new Error("cannot call prev until a token has been parsed")
        }
        else {
            return this.input[this.pos - 1]
        }
    }
    eof(): boolean {
        return this.pos >= this.input.length
    }
    srcLoc(): Loc {
        return this.input[this.pos].loc
    }
    srcLoc2(): Loc {
        if (this.pos === 0) {
            throw new Error("cannot call srcLoc2 until a token has been parsed")
        }
        else {
            return this.input[this.pos - 1].loc
        }
    }
    // tokenMatchTag(lookAhead: number, tag: string): boolean {
    //     if (this.pos + lookAhead >= this.input.length) {
    //         return false
    //     }
    //     let tok = this.input[this.pos + lookAhead]
    //     if (tok.tag === tag) {
    //         return true
    //     }
    //     return false
    // }
    // tokenMatch(lookAhead: number, tag: string, value: any): boolean {
    //     if (this.pos + lookAhead >= this.input.length) {
    //         return false
    //     }
    //     let tok = this.input[this.pos + lookAhead]
    //     if (tok.tag === tag && tok.value === value) {
    //         return true
    //     }
    //     return false
    // }

    // TODO Move this TorT pushing/popping out of the ParseState interface.
    pushTorT(tort: TorT): unit {
        this.tortStack.push(tort)
    }
    peekTorT(): TorT {
        const result = this.tortStack.at(-1)
        assert.isTrue(result !== undefined)
        return result
    }
    popTorT(tort: TorT): unit {
        assert.isTrue(this.tortStack.length !== 0)
        assert.isTrue(this.tortStack.at(-1) === tort)
        this.tortStack.pop()
    }
}


