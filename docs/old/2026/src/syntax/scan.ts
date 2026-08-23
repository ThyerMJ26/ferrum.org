
import { Token, Pos, showPos, showLoc, Loc, nilLoc, mkPos, TokenTag, mkToken, posCopy } from "../syntax/token.js"
import { logger_log } from "../utils/logger.js"

function isElem(item: string, candidates: string[]): boolean {
    return candidates.indexOf(item) >= 0
}

let keywords = ["if", "then", "else", "in", "let", "where", "do", "infix", "infixl", "infixr", "prefix", "postfix", "case", "of"]
let separators = ['(', ')', ',', ';', '[', ']', '`', '{', '}', ',']
let symbols = ['!', '#', '$', '%', '&', '*', '+', '.', '/', '<', '=', '>', '?', '@', '\\', '^', '|', '-', '~', ':']
let keysyms = ["=", "\\", "->", "<-", "@", ":", "=>", "...", "~>", "~~>", "|->", "|-->", "$!", "$?", "<|", "|>"]

let keywordsFe = ["let"]
// let keysymsFe = ["=", "->", "<-", "@", ":", "=>", "...", "~>", "~~>", "|->", "|-->", "$!", "$?", "<|", "|>"]
let keysymsFe = ["=", "@", ":", "...", "->", "=>", "|->", "|=>"]


export function isUpper(ch: string): boolean {
    return (ch >= "A" && ch <= "Z")
}

function isLower(ch: string): boolean {
    return (ch >= "a" && ch <= "z")
}

export function isAlpha(ch: string): boolean {
    return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z")
}

export function isNum(ch: string): boolean {
    return (ch >= "0" && ch <= "9")
}
export function isAlphanum(ch: string): boolean {
    return isAlpha(ch) || isNum(ch)
}
export function isAlphaUS(ch: string): boolean {
    return isAlpha(ch) || ch === "_"
}
function isAlphanumUSP(ch: string): boolean {
    return isAlphanum(ch) || ch === "_" || ch === "'"
}
export function isAlphanumUS(ch: string): boolean {
    return isAlphanum(ch) || ch === "_"
}
export function isSymbol(ch: string) {
    return symbols.indexOf(ch) !== -1
}
export function isSeparator(ch: string) {
    return separators.indexOf(ch) !== -1
}

export function scan(filename: string, input: string, offsetPos: Pos | null = null, language: string | null = null): Token[] {
    switch (language) {
        // case null:
        // case "":
        //     return scan2(filename, input, offsetPos)
        case "ferrum/0.1":
            return scan2Fe(filename, input, offsetPos, [])
        default:
            throw new Error(`scan: unkown language ${language}`)
    }
    // return scanCompare(filename, input, offsetPos)
}

export function scanCompare(filename: string, input: string, offsetPos: Pos | null = null): Token[] {
    let tokens1 = scan1(filename, input, offsetPos)
    let tokens2 = scan2(filename, input, offsetPos)
    // let tokens2 = scanner(filename, input, offsetPos)

    let len = Math.max(tokens1.length, tokens2.length)

    for (let i = 0; i !== len; i++) {
        let tok1: Token | null = null
        let tok2: Token | null = null
        let tok1Str = ""
        let tok2Str = ""
        let match = " "
        let match2 = " "
        let loc1 = "-"
        let loc2 = "-"
        if (i < tokens1.length) {
            tok1 = tokens1[i]
            tok1Str = `${tok1.tag.padEnd(6)} ${JSON.stringify(tok1.value).slice(0, 10).padEnd(10)}`
            loc1 = showLoc(tok1.loc)
        }
        if (i < tokens2.length) {
            tok2 = tokens2[i]
            tok2Str = `${tok2.tag.padEnd(6)} ${JSON.stringify(tok2.value).slice(0, 10).padEnd(10)}`
            loc2 = showLoc(tok2.loc)
        }
        if (tok1 !== null && tok2 !== null) {
            // match = tok1.tag === tok2.tag && tok1.value === tok2.value ? "=" : "X"
            if (tok1.tag === tok2.tag && tok1.value === tok2.value) {
                match = "="
                match2 = showLoc(tok1.loc) === showLoc(tok2.loc) ? "=" : "X"
            }
            else {
                match = "X"
            }
        }

        let iStr = JSON.stringify(i).padStart(4)
        console.log(`Tok ${match}${match2} ${iStr} ${tok1Str.padEnd(20)} ${tok2Str.padEnd(20)} ${loc1} ${loc2}`)
    }

    return tokens2
}

export function scan1(filename: string, input: string, offsetPos: Pos | null = null): Token[] {
    let result: Token[] = []
    // let pos = 0
    // let line = 1
    // let col = 1

    let pos = mkPos(1, 1, 0)
    let startPos = posCopy(pos)

    let startLine = 0, startCol = 0 // TODO recod start+end of token

    function output(tag: TokenTag, value: any) {
        logger_log("scan", 1, "Token", pos.line, pos.col, tag, value)
        //        result.push(token.mkToken(tag, value, token.mkPos(filename, line, col, pos), token.mkPos(filename, line, col, pos)))
        let pos2 = posCopy(pos)
        let startPos2 = posCopy(startPos)
        if (offsetPos !== null) {
            startPos2.line += offsetPos.line - 1
            startPos2.col += offsetPos.col - 1
            pos2.line += offsetPos.line - 1
            pos2.col += offsetPos.col - 1
        }
        let tok: Token = mkToken(tag, value, filename, startPos2, pos2, [])
        result.push(tok)
    }

    while (pos.pos < input.length) {
        startPos = posCopy(pos)
        let ch: string = input.charAt(pos.pos)
        logger_log("scan", 1, "Pos ", pos.pos, pos.line, pos.col, "Ch", ch)
        if (ch === " ") {
            pos.pos += 1
            pos.col += 1
        }
        else if (ch === "-" && pos.pos + 1 < input.length && input.charAt(pos.pos + 1) === "-" && (pos.pos + 2 === input.length || !isSymbol(input.charAt(pos.pos + 2)))) {
            pos.pos += 2
            pos.col += 2
            while (pos.pos < input.length && !isElem(input.charAt(pos.pos), ['\n', '\r'])) {
                pos.pos += 1
                pos.col += 1
            }
        }
        else if (ch === "\n" || ch === "\r") {
            pos.pos += 1
            pos.col = 1
            pos.line += 1
            if (pos.pos < input.length) {
                let ch2 = input.charAt(pos.pos)
                if ((ch2 === "\n" || ch2 === "\r") && ch2 !== ch) {
                    pos.pos += 1 // treat CRLF/LFCR as a single newline
                }
            }
        }
        else if (ch === '"' || ch === "'") {

            if (input.slice(pos.pos, pos.pos + 3) === '"""') {
                // TODO decide on precise rules for multi-line strings
                // tidy up implementation
                pos.pos += 3
                pos.col += 3
                pos.pos += 1
                let indent = pos.col

                let lines = []
                let start = pos.pos - 1
                let end = input.indexOf('\n', pos.pos)
                let line = input.slice(start, end)
                lines.push(line)
                pos.pos = end
                pos.line += 1
                pos.col = 1

                let finished = 0
                while (!finished) {
                    let start1 = pos.pos
                    let end = input.indexOf('\n', start1)
                    line = input.slice(start1, end)
                    let margin = line.slice(0, indent - 1)
                    if (margin.search('[^ ]') === -1) {
                        let content = line.slice(indent - 1)
                        lines.push(content)
                        pos.pos = end + 1
                        pos.line += 1
                        pos.col = 1
                        continue
                    }
                    else if (line.search('^[ ]*"""[ ]*$') === -1) {
                        throw new Error(`invalid end of multi-line string ${filename}: (${pos.line}, ${pos.col})`)
                    }
                    else {
                        pos.pos = end + 1
                        pos.line += 1
                        pos.col = 0
                        break
                    }
                }
                lines.push("")
                output("string", lines.join('\n'))
            }
            else {
                let ch1 = ch
                let str = ""
                pos.pos += 1
                pos.col += 1
                ch = input.charAt(pos.pos)
                while (ch !== ch1) {
                    if (isElem(ch, ['\n', '\r'])) {
                        throw new Error(`unterminated string, end of line: ${filename}:${pos.line},${pos.col}`)
                    }
                    if (pos.pos === input.length) {
                        throw new Error(`unterminated string, end of file: ${filename}:${pos.line},${pos.col}`)
                    }
                    if (ch === "\\") {
                        pos.pos += 1
                        pos.col += 1
                        ch = input.charAt(pos.pos)
                        if (isElem(ch, ['\n', '\r'])) {
                            throw new Error(`unterminated string, end of line: ${filename}:${pos.line},${pos.col}`)
                        }
                        if (pos.pos === input.length) {
                            throw new Error(`unterminated string, end of file: ${filename}:${pos.line},${pos.col}`)
                        }
                        switch (ch) {
                            case 'n': ch = "\n"; break
                            case 't': ch = "\t"; break
                            case '\\': ch = "\\"; break
                            case '\'': ch = "'"; break
                            case '"': ch = "\""; break
                        }
                    }
                    str += ch
                    pos.pos += 1
                    pos.col += 1
                    ch = input.charAt(pos.pos)
                }
                pos.pos += 1
                pos.col += 1
                output("string", str)
            }
        }
        else if (isAlphaUS(ch)) {
            let word = ""
            while (pos.pos < input.length && isAlphanumUSP(input.charAt(pos.pos))) {
                word += input.charAt(pos.pos)
                pos.pos += 1
                pos.col += 1
            }
            let tag: TokenTag = isElem(word, keywords) ? "keyword" : "ident"
            output(tag, word)
        }
        else if (isNum(ch)) {
            let num = 0
            while (pos.pos < input.length && isNum(input.charAt(pos.pos))) {
                num *= 10
                num += input.charCodeAt(pos.pos) - "0".charCodeAt(0)
                pos.pos += 1
                pos.col += 1
            }
            output("integer", num)
        }
        else if (isElem(ch, symbols)) {
            startPos = posCopy(pos)
            let sym = ""
            while (pos.pos < input.length && isElem(ch, symbols)) {
                sym += ch
                pos.pos += 1
                pos.col += 1
                ch = input.charAt(pos.pos)
            }
            let tag: TokenTag = isElem(sym, keysyms) ? "keysym" : "symbol"
            output(tag, sym)
        }
        else if (isElem(ch, separators)) {
            pos.pos += 1
            pos.col += 1
            output("separator", ch)
        }
        else {
            throw new Error(`unexpected character (${filename}:${pos.line},${pos.col}) ${JSON.stringify(ch)}`)
        }
    }

    output("eof", null)
    return result
}






export function scan2(filename: string, input: string, offsetPos: Pos | null = null): Token[] {
    let toks = scan2a(filename, input, offsetPos, keywords, keysyms, [])
    return toks
}


export function scan2Fe(filename: string, input: string, offsetPos: Pos | null = null, lineStarts: Pos[] = []): Token[] {
    let toks = scan2a(filename, input, offsetPos, keywordsFe, keysymsFe, lineStarts)
    // return toks
    let toks2 = toks.map(tok => {
        // in ferrum/0.1 "if" is no longer a keyword
        // however the code-generators doesn't yet know this (and still supports earlier code)
        // this temporary hack is the simplest way to not need to 
        // modify/update the code generator just yet.
        if (tok.tag === "ident" && tok.value === "if") {
            let tok2: Token = { ...tok, tag: "ident", value: "if2" }
            return tok2
        }
        return tok
    })
    return toks2
}

export function scan2a(filename: string, input: string, offsetPos: Pos | null, keywords: string[], keysyms: string[], inputLineStarts: Pos[] | null): Token[] {
    let result: Token[] = []
    // let pos = mkPos2(1, 1, 0)
    offsetPos ??= mkPos(1, 1, 0)
    // let pos = { ...offsetPos }
    // let startPos = { ...pos }

    let pos = posCopy(offsetPos)
    let startPos = posCopy(pos)


    function output(tag: TokenTag, value: any, tokenLineStarts?: Pos[]) {
        logger_log("scan", 1, "Token", pos.line, pos.col, tag, value)
        const pos2 = posCopy(pos)
        const startPos2 = posCopy(startPos)
        if (inputLineStarts !== null && inputLineStarts.length !== 0) {
            if (pos.line - 1 >= inputLineStarts.length) {
                throw new Error("scan2a: inputs has more lines than indicated by inputLineStarts")
            }
            startPos2.line = inputLineStarts[startPos.line - 1].line
            startPos2.col += inputLineStarts[startPos.line - 1].col - 1
            startPos2.pos = inputLineStarts[startPos.line - 1].pos + startPos.col - 1
            pos2.line = inputLineStarts[pos.line - 1].line
            pos2.col += inputLineStarts[pos.line - 1].col - 1
            pos2.pos = inputLineStarts[pos.line - 1].pos + pos.col - 1
        }
        // if (offsetPos !== null) {
        //     startPos2.line += offsetPos.line - 1
        //     startPos2.col += offsetPos.col - 1
        //     startPos2.pos += offsetPos.pos
        //     pos2.line += offsetPos.line - 1
        //     pos2.col += offsetPos.col - 1
        //     pos2.pos += offsetPos.pos
        //     // throw new Error("offsetPos is deprecated")
        // }
        if (tokenLineStarts === undefined) {
            tokenLineStarts = []
        }
        else {
            // TODO combine tokenLineStarts with inputLineStarts
        }
        let tok: Token = mkToken(tag, value, filename, startPos2, pos2, tokenLineStarts)
        result.push(tok)
    }

    function advancePos(num: number): string {
        for (let i = 0; i !== num; i++) {
            if (pos.pos === input.length) {
                break
            }
            // let ch: string = input.charAt(pos.pos)
            let ch = input.charAt(pos.pos)
            pos.pos += 1
            if (ch === "\n") {
                pos.line += 1
                pos.col = 1
            }
            else if (ch === "\r") {
                // pos.line += 1
                // pos.col = 1
                // if (pos.pos < input.length && input.charAt(pos.pos) === "\n") {
                //     if (inputLineStarts === undefined || inputLineStarts.length === 0) {
                //         pos.pos += 1
                //     }
                //     else {
                //         pos.pos = inputLineStarts[pos.line].pos
                //     }
                // }
                throw new Error("This looks buggy and untested")
            }
            else {
                pos.col += 1
            }
        }
        let ch = input.charAt(pos.pos)
        return ch
    }

    function tryScanLiteral(str: string, then?: () => boolean): boolean {
        const origPos = posCopy(pos)
        if (pos.pos + str.length <= input.length && input.slice(pos.pos, pos.pos + str.length) === str) {
            advancePos(str.length)
            if (then === undefined || then()) {
                return true
            }
        }
        pos = posCopy(origPos)
        return false
    }

    function optScanLiteral(str: string, then?: () => boolean): boolean {
        let origPos = posCopy(pos)
        if (pos.pos + str.length <= input.length && input.slice(pos.pos, pos.pos + str.length) === str) {
            advancePos(str.length)
            if (then === undefined || then()) {
                return true
            }
        }
        pos = posCopy(origPos)
        return true
    }

    function tryScanTest(test: (ch: string) => boolean): boolean {
        let origPos = posCopy(pos)
        let ch = input.charAt(pos.pos)
        if (test(ch)) {
            advancePos(1)
            return true
        }
        pos = posCopy(origPos)
        return false
    }

    // scan everything in the input
    while (pos.pos < input.length) {
        // first, handle rules that only apply at the start of a line 
        // i.e. verbatim quotes, and the whitespace indentation leading up to them.
        let lineStartPos = posCopy(pos)
        startPos = posCopy(pos)
        let ch: string = input.charAt(pos.pos)
        // ch = input.charAt(pos.pos)
        while (tryScanLiteral(" ") || tryScanLiteral("\t")) {
            // skip whitespace at start of line
        }
        startPos = posCopy(pos)
        if (tryScanLiteral('"""')) {
            while (tryScanLiteral(" ") || tryScanLiteral("\t")) {
                // skip whitespace after opening verbatim quote
            }
            if (!(tryScanLiteral("\n") || (tryScanLiteral("\r") && optScanLiteral("\n")))) {
                throw new Error(`invalid start of verbatim quote, triple quote characters must be on a line on their own (${showPos(pos)})`)
            }
            let indent = input.slice(lineStartPos.pos, startPos.pos)
            let marginCol = indent.length
            let marginChar: string | null = null
            let lineStarts: Pos[] = []
            let content = ""
            let firstLine = true
            let finishedVerbatimQuote = false
            while (!finishedVerbatimQuote) {
                // handle the lines within a verbatim quote
                ch = input.charAt(pos.pos)
                while (pos.col - 1 < indent.length && ch !== "\n" && ch !== "\r") {
                    let expectedCh = indent.charAt(pos.col - 1)
                    if (ch !== " " && ch !== "\t") {
                        throw new Error(`invalid indentation character in verbatim string (${JSON.stringify(ch)}) at (${showPos(pos)}), expected(${JSON.stringify(expectedCh)})`)
                    }
                    else if (ch !== expectedCh) {
                        throw new Error(`inconsistent indentation character in verbatim string (${JSON.stringify(ch)}) at (${showPos(pos)}), expected(${JSON.stringify(expectedCh)})`)
                    }
                    else {
                        ch = advancePos(1)
                    }
                }
                if (ch === '"') {
                    // check for closing triple quote, starting in the margin column
                    if (input.slice(pos.pos, pos.pos + 3) === '"""') {
                        ch = advancePos(3)
                        output("string", content, lineStarts)
                        while (pos.pos < input.length && (ch === " " || ch === "\t")) {
                            ch = advancePos(1)
                        }
                        if (ch !== "" && ch !== "\n" && ch !== "\r") {
                            throw new Error(`invalid character after closing verbatim quotes (${JSON.stringify(ch)}) at (${showPos(pos)}), only whitespace is permitted on same line as closing verbatim quotes`)
                        }
                        finishedVerbatimQuote = true
                        break
                    }
                    else {
                        throw new Error(`invalid closing verbatim quote at (${showPos(pos)}) expected triple quote (""")`)
                    }
                }
                if (!firstLine) {
                    content += "\n"
                }
                firstLine = false
                if (ch === "" || ch === "\n" || ch === "\r") {
                    // we've reached the end of this line early (before reaching the margin column or any verbatim content), nothing more to do
                    ch = advancePos(1)
                    lineStarts.push(posCopy(pos))
                    continue
                }

                if (ch !== " " && ch !== "\t") {
                    throw new Error(`invalid character in verbatim string margin (${JSON.stringify(ch)}) at (${showPos(pos)}), expected space or tab`)
                }
                if (marginChar === null) {
                    marginChar = ch
                }
                else if (ch !== marginChar) {
                    throw new Error(`inconsistent character in verbatim string margin (${JSON.stringify(ch)}) at (${showPos(pos)}), expected(${JSON.stringify(marginChar)})`)
                }
                ch = advancePos(1)
                // build a list of the starting positions of each line
                lineStarts.push(posCopy(pos))
                while (pos.pos < input.length && ch !== "\n" && ch !== "\r") {
                    content += ch
                    ch = advancePos(1)
                }
                if (pos.pos < input.length) {
                    ch = advancePos(1)
                }
            }
        }

        // secondly, handle everything remaing on the line,
        // (assuming verbatim quotes have been taken care of above)
        while (pos.pos < input.length) {
            ch = input.charAt(pos.pos)

            if (tryScanLiteral(" ") || tryScanLiteral("\t")) {
                // skip whitespace between tokens
            }
            else if (tryScanLiteral("\n") || tryScanLiteral("\r")) {
                // go round the outer loop back to the start-of-line handling code
                break
            }
            else if (tryScanLiteral("--", () => (pos.pos === input.length || !isSymbol(input.charAt(pos.pos))))) {
                while (pos.pos < input.length && !isElem(input.charAt(pos.pos), ['\n', '\r'])) {
                    // ignore everything to the end of the line
                    ch = advancePos(1)
                }
                break
            }
            else if (ch === '"' || ch === "'") {
                startPos = posCopy(pos)
                let ch1 = ch
                let str = ""
                ch = advancePos(1)
                while (ch !== ch1) {
                    if (isElem(ch, ['\n', '\r'])) {
                        throw new Error(`unterminated string, end of line: ${filename}:${pos.line},${pos.col}`)
                    }
                    if (pos.pos === input.length) {
                        throw new Error(`unterminated string, end of file: ${filename}:${pos.line},${pos.col}`)
                    }
                    if (ch === "\\") {
                        ch = advancePos(1)
                        if (isElem(ch, ['\n', '\r'])) {
                            throw new Error(`unterminated string, end of line: ${filename}:${pos.line},${pos.col}`)
                        }
                        if (pos.pos === input.length) {
                            throw new Error(`unterminated string, end of file: ${filename}:${pos.line},${pos.col}`)
                        }
                        switch (ch) {
                            case 'n': ch = "\n"; break
                            case 'r': ch = "\r"; break
                            case 't': ch = "\t"; break
                            case '\\': ch = "\\"; break
                            case '\'': ch = "'"; break
                            case '"': ch = "\""; break
                            case 'x': {
                                let ch1 = advancePos(1)
                                let ch2 = advancePos(1)
                                let val = parseInt(ch1 + ch2, 16)
                                if (Number.isNaN(val)) {
                                    throw new Error(`invalid hex escape sequence: ${filename}:${pos.line},${pos.col}`)
                                }
                                ch = String.fromCharCode(val)
                                // console.log("HEX", ch1, ch2, val, JSON.stringify(ch))
                                break
                            }
                            default:
                                throw new Error(`invalid escape sequence in string (\\${ch})`)
                        }
                    }
                    str += ch
                    ch = advancePos(1)
                }
                ch = advancePos(1)
                output("string", str)
            }
            else if (isAlphaUS(ch)) {
                startPos = posCopy(pos)
                let word = ""
                while (pos.pos < input.length && isAlphanumUSP(ch)) {
                    word += ch
                    ch = advancePos(1)
                }
                let tag: TokenTag = isElem(word, keywords) ? "keyword" : "ident"
                output(tag, word)
            }
            else if (isNum(ch)) {
                startPos = posCopy(pos)
                let num = 0
                while (pos.pos < input.length && isNum(ch)) {
                    num *= 10
                    num += ch.charCodeAt(0) - "0".charCodeAt(0)
                    ch = advancePos(1)
                }
                output("integer", num)
            }
            else if (isElem(ch, symbols)) {
                startPos = posCopy(pos)
                startPos = posCopy(pos)
                let sym = ""
                while (pos.pos < input.length && isElem(ch, symbols)) {
                    sym += ch
                    ch = advancePos(1)
                }
                let tag: TokenTag = isElem(sym, keysyms) ? "keysym" : "symbol"
                output(tag, sym)
            }
            else if (isElem(ch, separators)) {
                startPos = posCopy(pos)
                let sepCh = ch
                ch = advancePos(1)
                if (sepCh === "," && ch == ",") {
                    sepCh = ",,"
                    ch = advancePos(1)
                }
                output("separator", sepCh)
            }
            else {
                throw new Error(`unexpected character (${filename}:${pos.line},${pos.col}) ${JSON.stringify(ch)}`)
            }
        }
    }
    startPos = posCopy(pos)
    output("eof", null)
    return result
}









type FileHeader = {
    language: string | null
    contentStartPos: Pos
    // contents: string
    // pos: token.Pos
    // lineStarts?: Pos[]
}

function findNextLine(input: string): number | null {
    let i = 0
    while (i < input.length) {
        if (input.charAt(i) === "\r") {
            if (i < input.length + 1 && input.charAt(i + 1) === "\n") {
                return i + 2
            }
            else {
                return i + 1
            }
        }
        if (input.charAt(i) === "\n") {
            return i + 1
        }
        i++
    }
    return null
}

function scanFileStart(filename: string, input: string, offsetPos: Pos | null = null, lineStarts?: Pos[]): FileHeader {
    let pos = 0
    let line = 1
    let col = 1
    let input2 = input
    if (offsetPos !== null) {
        pos = offsetPos.pos
        line = offsetPos.line
        col = offsetPos.col
    }
    let language: string | null = null
    if (input2.startsWith("language")) {
        let offset = findNextLine(input2)
        if (offset === null) {
            throw new Error(`missing EOL`)
        }
        let languageLine = input2.slice(0, offset).trim()
        let languageLineParts = languageLine.split(" ")
        if (languageLineParts.length !== 2) {
            throw new Error(`expected one item after language directive, not (${languageLineParts.length})`)
        }
        language = languageLineParts[1]
        input2 = input2.slice(offset)
        pos += offset
        line += 1
    }
    else {
        // a "language" line is mandatory
        // TODO throw
    }
    // return { language: language, contents: input2, pos: { pos: pos, line: line, col: col, filename: filename }, lineStarts: lineStarts }
    // return { language: language, contentStartPos: { pos: pos, line: line, col: col, filename: filename } }
    return { language: language, contentStartPos: mkPos(line, col, pos) }
}

export function scanFile(filename: string, input: string, offsetPos: Pos | null = null, defaultLanguage: string | null = null, lineStarts?: Pos[]): [FileHeader, Token[]] {

    if (lineStarts === undefined) {
        lineStarts = []
    }

    let header = scanFileStart(filename, input, offsetPos, lineStarts)

    if (header.language === null) {
        header.language = defaultLanguage
    }

    switch (header.language) {
        // case null: {
        //     let tokens = scan(filename, header.contents, header.pos)
        //     return [header, tokens]
        // }
        case "Ferrum/0.1":
        case "ferrum/0.1":
        case "ferrum/test/0.1":
        case "ferrum/proj/0.1": {
            let tokens = scan2Fe(filename, input, header.contentStartPos, lineStarts)
            return [header, tokens]
        }
        default:
            throw new Error(`unknown language ${header.language}`)
    }

}



// type ScanStateName = "WS" | "SOL" | "WORD" | "SOLQ" | "VERBATIM" | "SYMBOL" | "SEPARATOR" | "NUMBER" | "EOF" | "ERROR" | "STRING"

// type ScanStateWs = ["WS"]
// type ScanStateComment = ["COMMENT"]
// type ScanStateSol = ["SOL", Pos, string]
// type ScanStateSolQ = ["SOLQ", Pos, string, string]
// type ScanStateVerbatim = ["VERBATIM", Pos, string, string | null, string, string]
// type ScanStateWord = ["WORD", Pos, string]
// type ScanStateSymbol = ["SYMBOL", Pos, string]
// type ScanStateSeparator = ["SEPARATOR", Pos, string]
// type ScanStateNumber = ["NUMBER", Pos, number]
// type ScanStateString = ["STRING", Pos, boolean, string]
// type ScanStateEof = ["EOF"]
// type ScanStateError = ["ERROR", Pos, string]

// type ScanState =
//     ScanStateWs |
//     ScanStateComment |
//     ScanStateSol |
//     ScanStateSolQ |
//     ScanStateVerbatim |
//     ScanStateWord |
//     ScanStateSymbol |
//     ScanStateSeparator |
//     ScanStateNumber |
//     ScanStateString |
//     ScanStateEof |
//     ScanStateError

// type ScanFuncResult = [boolean, ScanState, Token | null]
// type ScanFunc = (state: ScanState, pos: Pos, char: string | null) => ScanFuncResult

// function sfrAccept(nextState: ScanState): ScanFuncResult {
//     return [true, nextState, null]
// }

// function sfrAcceptEmit(nextState: ScanState, tok: Token): ScanFuncResult {
//     return [true, nextState, tok]
// }

// function sfrDefer(nextState: ScanState): ScanFuncResult {
//     return [false, nextState, null]
// }

// function sfrDeferEmit(nextState: ScanState, tok: Token): ScanFuncResult {
//     return [false, nextState, tok]
// }

// let wsChars = [" ", "\t", "\n", "\r"]
// let wsScanRule: ScanFunc = (state, pos, ch) => {
//     if (state[0] !== "WS") {
//         throw new Error(`bad state (${JSON.stringify(state)}), expected WS`)
//     }
//     if (ch === null) {
//         return sfrAccept(["EOF"])
//     }
//     else if (ch === "\n" || ch === "\r") {
//         return sfrAccept(["SOL", pos, ""])
//     }
//     else if (wsChars.indexOf(ch) !== -1) {
//         return sfrAccept(["WS"])
//     }
//     else if (isAlphaUS(ch)) {
//         return sfrAccept(["WORD", pos, ch])
//     }
//     else if (isNum(ch)) {
//         let digit = ch.charCodeAt(0) - "0".charCodeAt(0)
//         return sfrAccept(["NUMBER", pos, digit])
//     }
//     else if (isSymbol(ch)) {
//         return sfrAccept(["SYMBOL", pos, ch])
//     }
//     else if (isSeparator(ch)) {
//         return sfrAcceptEmit(["WS"], mkToken1("separator", ch, pos, pos))
//     }
//     else if (ch === '"' || ch === "'") {
//         return sfrAccept(["STRING", pos, false, ch])
//     }
//     else {
//         throw new Error(`unexpected input character (${ch}), current state: (${JSON.stringify(state)})`)
//     }
// }

// let commentScanRule: ScanFunc = (state, pos, ch) => {
//     if (state[0] !== "COMMENT") {
//         throw new Error(`bad state (${JSON.stringify(state)}), expected COMMENT`)
//     }
//     if (ch === null) {
//         return sfrDefer(["EOF"])
//     }
//     else if (ch === "\n" || ch === "\r") {
//         return [true, ["SOL", pos, ""], null]
//     }
//     else {
//         return sfrAccept(["COMMENT"])
//     }
// }

// let solScanRule: ScanFunc = (state, pos, ch) => {
//     if (state[0] !== "SOL") {
//         throw new Error(`bad state (${JSON.stringify(state)}), expected SOL`)
//     }
//     let [_, startPos, indent] = state
//     if (ch === ' ' || ch === "\t") {
//         return [true, ["SOL", startPos, indent + ch], null]
//     }
//     else if (ch === "\n" || ch === "\r") {
//         return [true, ["SOL", startPos, ""], null]
//     }
//     else if (ch === "\"") {
//         return [true, ["SOLQ", startPos, indent, ch], null]
//     }
//     else {
//         return [false, ["WS"], null]
//     }
// }

// let solQuoteScanRule: ScanFunc = (state, pos, ch) => {
//     if (state[0] !== "SOLQ") {
//         throw new Error(`bad state (${JSON.stringify(state)}), expected SOLQ`)
//     }
//     let [_, startPos, indent, quote] = state
//     if ((quote === '"' || quote === '""') && ch === '"') {
//         return [true, ["SOLQ", startPos, indent, quote + ch], null]
//     }
//     else if (quote === '"' && ch !== '"') {
//         // return [false, ["WS"], null]
//         return sfrDefer(["STRING", startPos, false, quote])
//     }
//     else if (quote === '""' && ch !== '"') {
//         return [false, ["WS"], mkToken1("string", "", startPos, pos)]
//     }
//     else if (quote === '"""') {
//         switch (ch) {
//             case " ":
//             case "\t":
//                 return [true, ["SOLQ", startPos, indent, quote], null]
//             case "\n":
//             case "\r":
//                 return [true, ["VERBATIM", startPos, indent, null, "", ""], null]
//             default:
//                 return [false, ["ERROR", pos, ""], null]
//         }
//     }
//     else if (ch === "\n" || ch === "\r") {
//         return [true, ["SOL", startPos, ""], null]
//     }
//     else if (ch === "\"") {
//         return [true, ["SOLQ", startPos, indent, ch], null]
//     }
//     else {
//         return [false, ["WS"], null]
//     }
// }

// let verbatimScanRule: ScanFunc = (state, pos, ch) => {
//     if (state[0] !== "VERBATIM") {
//         throw new Error(`bad state (${JSON.stringify(state)}), expected WORD`)
//     }
//     let [_, startPos, indent1, indent2, line, content] = state
//     if (ch !== "\n" && ch !== "\r") {
//         // keep accepting and accumulating characters until we get to the end of the line
//         return [true, ["VERBATIM", startPos, indent1, indent2, line + ch, content], null]
//     }
//     else {
//         // every line is prefixed with a newline, except the first one
//         let nl = pos.line === startPos.line + 1 ? "" : "\n"
//         if (line.length < indent1.length) {
//             if (line !== indent1.slice(0, line.length)) {
//                 return [false, ["ERROR", pos, ""], null]
//             }
//             else {
//                 return [true, ["VERBATIM", startPos, indent1, indent2, "", content + nl], null]
//             }
//         }
//         else if (line.length === indent1.length && indent2 !== null) {
//             if (line.charAt(indent1.length) !== indent2) {
//                 return [false, ["ERROR", pos, ""], null]
//             }
//             else {
//                 return [true, ["VERBATIM", startPos, indent1, indent2, "", content + nl], null]
//             }
//         }
//         else if (line.length >= indent1.length && indent2 === null) {
//             let spc = line[indent1.length]
//             if (spc !== ' ' && spc !== '\t') {
//                 return [false, ["ERROR", pos, ""], null]
//             }
//             indent2 = spc
//         }
//         if (line.length > indent1.length) {
//             line = line + ch
//             let indent = indent1 + indent2
//             if (line.slice(0, indent.length) === indent) {
//                 content = content + nl + line.slice(indent.length)
//                 return [true, ["VERBATIM", startPos, indent1, indent2, "", content], null]
//             }
//             else if (line.slice(0, indent1.length + 3) === (indent1 + '"""')) {
//                 if (line.slice(indent1.length + 3).replace(/ |\t|\n|\r/, "").length !== 0) {
//                     return [false, ["ERROR", pos, ""], null]
//                 }
//                 else {
//                     return [true, ["SOL", pos, ""], mkToken1("string", content, startPos, pos)]
//                 }
//             }
//             else {
//                 return [false, ["ERROR", pos, ""], null]
//             }
//         }
//         else {
//             throw new Error("impossible")
//         }
//     }
// }

// let wordScanRule: ScanFunc = (state, pos, ch) => {
//     if (state[0] !== "WORD") {
//         throw new Error(`bad state (${JSON.stringify(state)}), expected WORD`)
//     }
//     let [_, startPos, word] = state
//     if (ch !== null && isAlphanumUSP(ch)) {
//         return [true, ["WORD", pos, word + ch], null]
//     }
//     else {
//         let tag: tokenTagT = keywords.indexOf(word) === -1 ? "ident" : "keyword"
//         let tok = mkToken1(tag, word, startPos, pos)
//         return sfrDeferEmit(["WS"], tok)
//         // return [false, ["WS"], mkToken1("ident", word, startPos, pos)]
//     }
// }

// let symbolScanRule: ScanFunc = (state, pos, ch) => {
//     if (state[0] !== "SYMBOL") {
//         throw new Error(`bad state (${JSON.stringify(state)}), expected SYMBOL`)
//     }
//     let [_, startPos, symb] = state
//     if (ch !== null && isSymbol(ch)) {
//         return [true, ["SYMBOL", pos, symb + ch], null]
//     }
//     else {
//         if (symb.startsWith("--")) {
//             // TODO ? allow symbols that start with "--" but contains other characters too to be symbols ?
//             // TODO ? such as --> ? (like Haskell)
//             // TODO ? allow any number of dashes (>2) to start a comment ?
//             return sfrDefer(["COMMENT"])
//         }
//         else {
//             let tag: tokenTagT = keysyms.indexOf(symb) === -1 ? "symbol" : "keysym"
//             let tok = mkToken1(tag, symb, startPos, pos)
//             return sfrDeferEmit(["WS"], tok)
//             // return [false, ["WS"], tok]
//         }
//     }
// }

// let numberScanRule: ScanFunc = (state, pos, ch) => {
//     if (state[0] !== "NUMBER") {
//         throw new Error(`bad state (${JSON.stringify(state)}), expected NUMBER`)
//     }
//     let [_, startPos, num] = state
//     if (ch !== null && isNum(ch)) {
//         let digit = ch.charCodeAt(0) - "0".charCodeAt(0)
//         return [true, ["NUMBER", pos, num * 10 + digit], null]
//     }
//     else {
//         return [false, ["WS"], mkToken1("integer", num, startPos, pos)]
//     }
// }

// let stringScanRule: ScanFunc = (state, pos, ch) => {
//     if (state[0] !== "STRING") {
//         throw new Error(`bad state (${JSON.stringify(state)}), expected STRING`)
//     }
//     let [_, startPos, escape, str] = state
//     if (escape) {
//         switch (ch) {
//             case "n":
//                 return sfrAccept(["STRING", startPos, false, str + "\n"])
//             case "t":
//                 return sfrAccept(["STRING", startPos, false, str + "\t"])
//             case "\\":
//             case '"':
//             case "'":
//                 return sfrAccept(["STRING", startPos, false, str + ch])
//             default:
//                 return sfrDefer(["ERROR", pos, `invalid string escape sequence (${ch})`])
//         }
//     }
//     else {
//         switch (ch) {
//             case null:
//                 return sfrDefer(["ERROR", pos, ""])
//             case "\\":
//                 return sfrAccept(["STRING", startPos, true, str])
//             case "\n":
//             case "\r":
//                 return sfrDefer(["ERROR", pos, "unexpected end of line in string literal"])
//             case '"':
//             case "'":
//                 if (ch === str.charAt(0)) {
//                     return sfrAcceptEmit(["WS"], mkToken1("string", str.slice(1), startPos, pos))
//                 }
//             // else fall-through to default case
//             default:
//                 return sfrAccept(["STRING", startPos, false, str + ch])
//         }
//     }
// }

// let errorScanRule: ScanFunc = (state, pos, ch) => {
//     if (state[0] !== "ERROR") {
//         throw new Error(`bad state (${JSON.stringify(state)}), expected ERROR`)
//     }
//     if (ch === null) {
//         return sfrDefer(["EOF"])
//     }
//     else {
//         return sfrAccept(state)
//     }
// }

// let scanTable: { [name: string]: ScanFunc } = {
//     "WS": wsScanRule,
//     "COMMENT": commentScanRule,
//     "SOL": solScanRule,
//     "SOLQ": solQuoteScanRule,
//     "VERBATIM": verbatimScanRule,
//     "WORD": wordScanRule,
//     "SYMBOL": symbolScanRule,
//     "NUMBER": numberScanRule,
//     "STRING": stringScanRule,
//     "ERROR": errorScanRule,
// }

// function scanner(filename: string, input: string, offsetPos: Pos | null = null): Token[] {
//     let tokens: Token[] = []
//     let state: ScanState = ["WS"]
//     let inputPos = 0
//     let annotPos: Pos = { filename: filename, line: 1, col: 1, pos: 0 }
//     if (offsetPos !== null) {
//         annotPos = { filename: filename, line: offsetPos.line, col: offsetPos.col, pos: offsetPos.pos }
//     }
//     while (state[0] !== "EOF") {
//         let ch = inputPos < input.length ? input.charAt(inputPos) : null
//         if (!scanTable.hasOwnProperty(state[0])) {
//             throw new Error(`unhandled scan state (${state[0]})`)
//         }
//         let [ok, state2, tok] = scanTable[state[0]](state, annotPos, ch)
//         state = state2
//         if (state[0] === "ERROR") {
//             let [, errorPos, errorMsg] = state
//             throw new Error(`Scanner reached an error state at ${showPos(errorPos)}, (${errorMsg})`)
//         }
//         if (tok !== null) {
//             tokens.push(tok)
//         }
//         if (ok) {
//             // advance to next character
//             inputPos += 1
//             annotPos = { ...annotPos }
//             annotPos.pos += 1
//             annotPos.col += 1
//             let ch2 = inputPos < input.length ? input.charAt(inputPos) : null
//             switch (ch2) {
//                 case "\n":
//                     annotPos = { ...annotPos }
//                     annotPos.line += 1
//                     annotPos.col = 1
//                     break
//                 case "\r": {
//                     let ch3 = (inputPos + 1) < input.length ? input.charAt(inputPos + 1) : null
//                     if (ch3 === "\n") {
//                         annotPos = { ...annotPos }
//                         inputPos += 1
//                         annotPos.pos += 1
//                     }
//                     break
//                 }
//                 case null:
//                 default:
//                 // nothing to do
//             }
//         }
//         // else we go round again with the same character
//         // we should move into a state which can handle it
//         // TODO ? check for infinite looping ? 
//         // could only happen if there is a bug in the state transition functions
//     }

//     tokens.push(mkToken1("eof", null, annotPos, annotPos))
//     return tokens
// }





