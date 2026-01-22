// TODO ? Switch from 1-based to 0-based indexing for line and column numbers
// TODO ?   Doing  lineStarts arithmetic with 1-based indexing involves substracting 1 everywhere.
// TODO ? Is that worse or better than using the same indexing as used in editors ?
import { assert } from "../utils/assert.js";
class PosObj {
    line;
    col;
    pos;
    constructor(line, col, pos) {
        this.line = line;
        this.col = col;
        this.pos = pos;
    }
    toString() {
        return `${this.line}:${this.col}:${this.pos}`;
    }
}
export function mkPos(line, col, pos) {
    // return { line: line, col: col, pos: pos }
    return new PosObj(line, col, pos);
}
// TODO ? How important is the "pos" field within nilPos ?
// TODO ? Can we just fix it at 0 without breaking anything ?
export const nilPos = mkPos(0, 0, 1);
export const nilPos0 = mkPos(0, 0, 0);
export function posCopy(p) {
    // return { ...p }
    return new PosObj(p.line, p.col, p.pos);
}
export function showPos(pos) {
    return `Pos(${pos.line},${pos.col})`;
}
class LocObj {
    filename;
    begin;
    end;
    lineStarts;
    constructor(filename, begin, end, lineStarts) {
        this.filename = filename;
        this.begin = begin;
        this.end = end;
        this.lineStarts = lineStarts ?? null;
    }
    toString() {
        const b = this.begin;
        const e = this.end;
        const filename = this.filename === "" ? "" : `${this.filename}:`;
        const begin = `${b.line}:${b.col}`;
        const end = b.line === e.line ? `${e.col}` : `${e.line}:${e.col}`;
        return `${filename}${begin}-${end}`;
    }
}
export function mkLoc(filename, begin, end, lineStarts) {
    return new LocObj(filename, begin, end, lineStarts);
}
export const nilLoc = mkLoc("", nilPos, nilPos);
export function showLoc(loc) {
    if (loc === null) {
        return "<NilLoc>";
    }
    else {
        let begin = loc.begin;
        let end = loc.end;
        return `("${loc.filename}":,(${begin.line},${begin.col}),(${end.line},${end.col}))`;
    }
}
export function locMerge(a, b) {
    assert.isTrue(a.filename === b.filename);
    let begin = a.begin.pos <= b.begin.pos ? a.begin : b.begin;
    let end = b.end.pos >= a.end.pos ? b.end : a.end;
    return mkLoc(a.filename, begin, end);
}
export function locContains(loc1, loc2) {
    return (loc1.filename === loc2.filename
        && loc1.begin.line <= loc2.begin.line
        && loc1.begin.col <= loc2.begin.col
        && loc1.end.line >= loc2.end.line
        && loc1.end.col >= loc2.end.col);
}
export function locMatch(loc, filename, beginLine, beginCol, endLine, endCol) {
    if (filename !== null && filename !== loc.filename)
        return false;
    if (beginLine !== null && beginLine !== loc.begin.line)
        return false;
    if (beginCol !== null && beginCol !== loc.begin.col)
        return false;
    if (endLine !== null && endLine !== loc.end.line)
        return false;
    if (endCol !== null && endCol !== loc.end.col)
        return false;
    return true;
}
class TokenObj {
    tag;
    value;
    loc;
    constructor(tag, value, loc) {
        this.tag = tag;
        this.value = value;
        this.loc = loc;
    }
    toString() {
        switch (this.tag) {
            case "string":
                return JSON.stringify(this.value);
            case "symbol":
            case "keyword":
            case "ident":
            case "keysym":
            case "separator":
            case "integer":
                return `${this.value}`;
            case "eof":
                return "<EOF>";
            default:
                assert.noMissingCases(this.tag);
        }
    }
}
export function mkToken(tag, value, filename, begin, end, lineStarts) {
    filename ??= "";
    const loc = mkLoc(filename, begin, end, lineStarts);
    // return { tag, value, loc }
    return new TokenObj(tag, value, loc);
}
//# sourceMappingURL=token.js.map