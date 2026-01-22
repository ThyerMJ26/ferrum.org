import { assert } from "../utils/assert.js";
export class ParseState {
    input;
    pos;
    tortStack = [];
    // TODO Take an error reporting callback, so as to handle errors better.
    constructor(input) {
        this.input = input;
        this.pos = 0;
    }
    peek() {
        if (!(this.pos < this.input.length))
            throw new Error("past end of input");
        return this.input[this.pos];
    }
    take() {
        if (!(this.pos < this.input.length))
            throw new Error("past end of input");
        let token = this.input[this.pos];
        this.pos++;
        return token;
    }
    prev() {
        if (this.pos === 0) {
            throw new Error("cannot call prev until a token has been parsed");
        }
        else {
            return this.input[this.pos - 1];
        }
    }
    eof() {
        return this.pos >= this.input.length;
    }
    srcLoc() {
        return this.input[this.pos].loc;
    }
    srcLoc2() {
        if (this.pos === 0) {
            throw new Error("cannot call srcLoc2 until a token has been parsed");
        }
        else {
            return this.input[this.pos - 1].loc;
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
    pushTorT(tort) {
        this.tortStack.push(tort);
    }
    peekTorT() {
        const result = this.tortStack.at(-1);
        assert.isTrue(result !== undefined);
        return result;
    }
    popTorT(tort) {
        assert.isTrue(this.tortStack.length !== 0);
        assert.isTrue(this.tortStack.at(-1) === tort);
        this.tortStack.pop();
    }
}
//# sourceMappingURL=parse.js.map