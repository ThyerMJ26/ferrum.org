

import { assert } from "../utils/assert.js"
import { getIo } from "../io/io.js"
import { EDatum, LocField } from "./expr.js"
import { ParseState } from "./parse.js"
import { parseTerm } from "./parseFerrum2.js"
import { ProjectPart } from "./project.js"
import { scanFile } from "./scan.js"
import { Loc, Pos, showLoc } from "./token.js"


//#region Read Tests

export type TdCheck =
    | { tag: "typeCheckOk", loc: Loc, expr: string, lineStarts?: Pos[] }
    | { tag: "typeCheckFail", loc: Loc, expr: string, lineStarts?: Pos[] }
    | { tag: "expectType", loc: Loc, expr: string, lineStarts?: Pos[], expect: string }
    | { tag: "expectTerm", loc: Loc, expr: string, lineStarts?: Pos[], expect: string }
    | { tag: "expectValue", loc: Loc, expr: string, lineStarts?: Pos[], expect: string }
    | { tag: "expectNumErrors", loc: Loc, expr: string, lineStarts?: Pos[], expect: number }
    // Old-style multiple checks with a common <expr>:
    //     ["expect", <expr>, "value", ... "type", ... "errors", ...]
    //   are split into separate checks.
    | { tag: "expect value", loc: Loc, expr: string, lineStarts?: Pos[], expect: string }
    | { tag: "expect type", loc: Loc, expr: string, lineStarts?: Pos[], expect: string }
    | { tag: "expect errors", loc: Loc, expr: string, lineStarts?: Pos[], expect: number }



export type TdExpect = [string, Pos[], string | null, string | null, number | null]

export type TestDefn = {
    loc: Loc,
    name: string,
    project: string | undefined,
    project_parts: ProjectPart[],
    language: string | null
    decls: [string, Pos[]][],
    type_checks: string[],
    expected_type_errors: number
    expected_type_oks: undefined | number
    expects: TdExpect[]
    checks: TdCheck[]
}

let tdFieldArity: { [name: string]: number | null } = {
    "name": 1,
    "language": 1,
    "project": 1,
    "primitives": 1,
    "expr": 1,
    "decls": 1,
    "type_check": 1,
    "expected_type_errors": 1,
    "expected_type_oks": 1,
    "expect": null,
    "expectValue": 2,
    "expectTerm": 2,
    "expectType": 2,
    "expectNumErrors": 2,
    "typeCheckOk": 1,
    "typeCheckFail": 1,
    "typeCheckDeclsOk": 1,
}


function strLineStarts(exp: EDatum<LocField>): Pos[] {
    if (exp.loc.lineStarts !== null) {
        // This is a verbatim multi-line string, return the start of each line.
        return exp.loc.lineStarts
    }
    else {
        // This is not a verbatim multi-line string,
        // ( but it might be a string containing escaped newlines within it.
        //   TODO ? Return the start of lines beyond just the first ?
        // )
        return [exp.loc.begin]
    }
}

export async function readTestDefns(fileUrl: URL): Promise<TestDefn[]> {
    const io = getIo()
    let testDefnList: TestDefn[] = []

    let fileContents = await io.vfs_read(fileUrl)
    let [header, tokens] = scanFile(fileUrl.pathname, fileContents)
    let ps = new ParseState(tokens)

    let pExp = parseTerm(ps, header.language)
    let exp = pExp

    if (exp.tag !== "EList") {
        throw new Error("A list of tests is expected.")
    }

    for (let exp2 of exp.exprs) {

        let testDefn: TestDefn = {
            loc: exp2.loc,
            name: "",
            project: undefined,
            project_parts: [],
            language: null,
            decls: [],
            type_checks: [],
            expected_type_errors: 0,
            expected_type_oks: undefined,
            expects: [],
            checks: []
        }

        if (exp2.tag !== "EList") {
            throw new Error(`Expected a list, not (${exp2.tag}) at (${showLoc(exp.loc)}).`)
        }
        for (let exp3 of exp2.exprs) {

            if (exp3.tag !== "EList") {
                throw new Error(`Expected a list at (${showLoc(exp3.loc)}).`)
            }
            let nonLiterals = exp3.exprs.filter(e => e.tag !== "EDatum")
            if (nonLiterals.length !== 0) {
                throw new Error(`Expected a list of literals at (${showLoc(exp3.loc)}), first non-literal at ($${showLoc(nonLiterals[0].loc)}).`)
            }
            if (exp3.exprs.length < 2) {
                throw new Error(`Expected at least two items in list at (${showLoc(exp3.loc)}).`)
            }

            let items = exp3.exprs as EDatum<LocField>[]
            const loc = exp3.loc
            let fieldName = items[0].value
            let fieldValue = items[1].value
            if (!tdFieldArity.hasOwnProperty(fieldName)) {
                throw new Error(`Invalid field name (${fieldName}) at (${showLoc(items[0].loc)}), expected one of (${Object.getOwnPropertyNames(tdFieldArity).join(", ")}).`)
            }

            let numArgs = items.length - 1
            let arity = tdFieldArity[fieldName]
            if (arity !== null && numArgs !== arity) {
                throw new Error(`Incorrect number of arguments (${numArgs}) for field (${fieldName}) at (${showLoc(items[0].loc)}), expected (${arity}).`)
            }
            switch (fieldName) {
                case "name":
                    testDefn.name = fieldValue
                    break;
                case "language":
                    testDefn.language = fieldValue
                    break
                case "project":
                    testDefn.project = fieldValue
                    break;
                case "primitives":
                    testDefn.project_parts.push({tag: "code", filename: fieldValue})
                    break
                case "decls": {
                    let lineStarts = strLineStarts(items[1])
                    testDefn.decls.push([fieldValue, lineStarts])
                    break;
                }
                case "type_check":
                    testDefn.type_checks.push(fieldValue)
                    break
                case "expected_type_errors":
                    testDefn.expected_type_errors = fieldValue
                    break;
                case "expected_type_oks":
                    testDefn.expected_type_oks = fieldValue
                    break;
                case "expect": {
                    if (numArgs < 3 || numArgs % 2 !== 1) {
                        throw new Error(`Incorrect number of args (${numArgs}) to "expect", expected odd number >= 3.`)
                    }
                    let expr = items[1].value
                    const lineStarts = strLineStarts(items[1])
                    let args = items.slice(2)
                    let expectedValue: string | null = null
                    let expectedType: string | null = null
                    let expectedErrors: number | null = null
                    while (args.length !== 0) {
                        let key = args.shift()!
                        let valTk = args.shift()!
                        let val = valTk.value
                        switch (key.value) {
                            case "value":
                                if (typeof (val) !== "string") {
                                    throw new Error(`Expected a string at (${showLoc(valTk.loc)}).`)
                                }
                                if (expectedValue !== null) {
                                    throw new Error(`Multiple "value" expectations not expected at (${showLoc(key.loc)}).`)
                                }
                                expectedValue = val
                                testDefn.checks.push({ tag: "expect value", loc, expr, lineStarts, expect: expectedValue })
                                break
                            case "type":
                                if (typeof (val) !== "string") {
                                    throw new Error(`Expected a string at (${showLoc(valTk.loc)}).`)
                                }
                                if (expectedType !== null) {
                                    throw new Error(`Multiple "type" expectations not expected at (${showLoc(key.loc)}).`)
                                }
                                expectedType = val
                                testDefn.checks.push({ tag: "expect type", loc, expr, lineStarts, expect: expectedType })
                                break
                            case "errors":
                                if (typeof (val) !== "number") {
                                    throw new Error(`Expected a number at (${showLoc(valTk.loc)}).`)
                                }
                                if (expectedErrors !== null) {
                                    throw new Error(`Multiple "errors" expectations not expected at (${showLoc(key.loc)}).`)
                                }
                                expectedErrors = val
                                testDefn.checks.push({ tag: "expect errors", loc, expr, lineStarts, expect: expectedErrors })
                                break
                            default:
                                throw new Error(`Unexpected expectation (${key.value}) at (${showLoc(key.loc)}), expected one of (key, value, errors).`)
                        }
                    }
                    testDefn.expects.push([expr, lineStarts, expectedValue, expectedType, expectedErrors])
                    break
                }
                case "expectValue":
                case "expectTerm": {
                    let expr = items[1].value
                    const lineStarts = strLineStarts(items[1])
                    let expectedValue = items[2].value
                    if (typeof (expectedValue) !== "string") {
                        throw new Error(`Expected a string at (${showLoc(items[2].loc)}).`)
                    }
                    testDefn.expects.push([expr, lineStarts, expectedValue, null, null])
                    testDefn.checks.push({ tag: fieldName, loc, expr, lineStarts, expect: expectedValue })
                    break
                }
                case "expectType": {
                    let expr = items[1].value
                    const lineStarts = strLineStarts(items[1])
                    let expectedType = items[2].value
                    if (typeof (expectedType) !== "string") {
                        throw new Error(`Expected a string at (${showLoc(items[2].loc)}).`)
                    }
                    testDefn.expects.push([expr, lineStarts, null, expectedType, null])
                    testDefn.checks.push({ tag: "expectType", loc, expr, lineStarts, expect: expectedType })
                    break
                }
                case "expectNumErrors": {
                    let expr = items[1].value
                    const lineStarts = strLineStarts(items[1])
                    let expectedNumErrors = items[2].value
                    if (typeof (expectedNumErrors) !== "number") {
                        throw new Error(`Expected a number at (${showLoc(items[2].loc)}).`)
                    }
                    testDefn.expects.push([expr, lineStarts, null, null, expectedNumErrors])
                    testDefn.checks.push({ tag: "expectNumErrors", loc, expr, lineStarts, expect: expectedNumErrors })
                    break
                }
                case "typeCheckOk": {
                    let expr = items[1].value
                    testDefn.checks.push({ tag: "typeCheckOk", loc, expr })
                    break
                }
                case "typeCheckFail": {
                    let expr = items[1].value
                    testDefn.checks.push({ tag: "typeCheckFail", loc, expr })
                    break
                }
                case "typeCheckDeclsOk": {
                    break
                }
                default:
                    throw new Error(`Unknown field name (${fieldName}) at (${showLoc(items[0].loc)}).`)
            }
        }
        if (testDefn.type_checks.length === 0) {
            testDefn.type_checks = ["simple", "bidir"]
        }
        testDefnList.push(testDefn)
    }

    return testDefnList
}

//#endregion


