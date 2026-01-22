

// TODO ? Switch from 1-based to 0-based indexing for line and column numbers
// TODO ?   Doing  lineStarts arithmetic with 1-based indexing involves substracting 1 everywhere.
// TODO ? Is that worse or better than using the same indexing as used in editors ?

import { assert } from "../utils/assert.js"

//#region Pos

export type Pos = {
    line: number
    col: number
    pos: number
}

class PosObj implements Pos {
    line: number
    col: number
    pos: number
    constructor(line: number, col: number, pos: number) {
        this.line = line
        this.col = col
        this.pos = pos
    }
    toString() {
        return `${this.line}:${this.col}:${this.pos}`
    }

}

export function mkPos(line: number, col: number, pos: number): Pos {
    // return { line: line, col: col, pos: pos }
    return new PosObj(line, col, pos)
}

// TODO ? How important is the "pos" field within nilPos ?
// TODO ? Can we just fix it at 0 without breaking anything ?
export const nilPos = mkPos(0, 0, 1)
export const nilPos0 = mkPos(0, 0, 0)

export function posCopy(p: Pos): Pos {
    // return { ...p }
    return new PosObj(p.line, p.col, p.pos)
}

export function showPos(pos: Pos): string {
    return `Pos(${pos.line},${pos.col})`
}



//#endregion Pos



//#region Loc


export type Loc = {
    filename: string
    begin: Pos
    end: Pos
    lineStarts: Pos[] | null
}

class LocObj implements Loc {
    filename: string
    begin: Pos
    end: Pos
    lineStarts: null | Pos[]
    constructor(filename: string, begin: Pos, end: Pos, lineStarts?: Pos[]) {
        this.filename = filename
        this.begin = begin
        this.end = end
        this.lineStarts = lineStarts ?? null
    }
    toString() {
        const b = this.begin
        const e = this.end
        const filename = this.filename === "" ? "" : `${this.filename}:`
        const begin = `${b.line}:${b.col}`
        const end = b.line === e.line ? `${e.col}` : `${e.line}:${e.col}`
        return `${filename}${begin}-${end}`
    }
}


export function mkLoc(filename: string, begin: Pos, end: Pos, lineStarts?: Pos[]): Loc {
    return new LocObj(filename, begin, end, lineStarts)
}

export const nilLoc = mkLoc("", nilPos, nilPos)


export function showLoc(loc: Loc | null): string {
    if (loc === null) {
        return "<NilLoc>"
    }
    else {
        let begin = loc.begin
        let end = loc.end
        return `("${loc.filename}":,(${begin.line},${begin.col}),(${end.line},${end.col}))`
    }
}


export function locMerge(a: Loc, b: Loc): Loc {
    assert.isTrue(a.filename === b.filename)
    let begin = a.begin.pos <= b.begin.pos ? a.begin : b.begin
    let end = b.end.pos >= a.end.pos ? b.end : a.end
    return mkLoc(a.filename, begin, end)
}

export function locContains(loc1: Loc, loc2: Loc): boolean {
    return (loc1.filename === loc2.filename
        && loc1.begin.line <= loc2.begin.line
        && loc1.begin.col <= loc2.begin.col
        && loc1.end.line >= loc2.end.line
        && loc1.end.col >= loc2.end.col
    )
}

export function locMatch(loc: Loc, filename: string | null, beginLine: number | null, beginCol: number | null, endLine: number | null, endCol: number | null): boolean {
    if (filename !== null && filename !== loc.filename) return false
    if (beginLine !== null && beginLine !== loc.begin.line) return false
    if (beginCol !== null && beginCol !== loc.begin.col) return false
    if (endLine !== null && endLine !== loc.end.line) return false
    if (endCol !== null && endCol !== loc.end.col) return false
    return true
}

//#endregion Loc



//#region Token

export type TokenTag = "keyword" | "ident" | "symbol" | "keysym" | "separator" | "integer" | "string" | "eof"

export type Token = {
    tag: TokenTag
    value: any
    loc: Loc
}

class TokenObj implements Token {
    tag: TokenTag
    value: any
    loc: Loc
    constructor(tag: TokenTag, value: any, loc: Loc) {
        this.tag = tag
        this.value = value
        this.loc = loc
    }
    toString() {
        switch (this.tag) {
            case "string":
                return JSON.stringify(this.value)
            case "symbol":
            case "keyword":
            case "ident":
            case "keysym":
            case "separator":
            case "integer":
                return `${this.value}`
            case "eof":
                return "<EOF>"
            default:
                assert.noMissingCases(this.tag)

        }
    }
}

export function mkToken(tag: TokenTag, value: any, filename: string | undefined, begin: Pos, end: Pos, lineStarts?: Pos[]): Token {
    filename ??= ""
    const loc = mkLoc(filename, begin, end, lineStarts)
    // return { tag, value, loc }
    return new TokenObj(tag, value, loc)
}

//#endregion Token


// TODO ? Use "Source" instead of manually passing lineStarts around ?
export type Source = {
    // name: string | null // TODO ? do we want an associated name/filename ?
    lineStarts: Pos[] | null
    contents: string
}

