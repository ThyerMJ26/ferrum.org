import { assert } from "./assert.js"

export type CmdOption = {
    readonly dashes: "-" | "--"
    readonly name: string,
    readonly value: string | null,
}

export type CmdLine = {
    readonly opts: CmdOption[],
    readonly args: string[]
}


export function parseOpt(arg: string): CmdOption | null {

    if (arg === "-" || arg === "--" || arg.startsWith("---")) {
        return null
    }
    let dashes: "-" | "--"
    if (arg.startsWith("--")) {
        dashes = "--"
    }
    else if (arg.startsWith("-")) {
        dashes = "-"
    }
    else {
        return null
    }

    const i = arg.indexOf("=", dashes.length)
    if (i === -1) {
        const name = arg.slice(dashes.length)
        return { dashes, name: arg, value: null }
    }
    else {
        const name = arg.slice(dashes.length, i)
        const value = arg.slice(i + 1)
        return { dashes, name, value }

    }
}

export function parseCmdLine(argv: string[]): CmdLine {
    const opts: CmdOption[] = []
    const args: string[] = []

    let i = 0
    let opt: CmdOption | null
    while (i < argv.length && (opt = parseOpt(argv[i]))) {
        opts.push(opt)
        ++i
    }
    while (i < argv.length) {
        args.push(argv[i])
        ++i
    }

    return { opts, args }
}


// CmdLine Schema definition and matching

export type CmdLine_SchemaPart_Flag = { tag: "OptFlag", name: string | string[] }
export type CmdLine_SchemaPart_Int = { tag: "OptInt", name: string | string[] }
export type CmdLine_SchemaPart_Str = { tag: "OptStr", name: string | string[] }
export type CmdLine_SchemaPart_OneOf<V extends readonly string[]> = { tag: "OptOneOf", name: string | string[], values: V }
// TODO ? Support multiple values ?
// TODO ?   Either same option multiple times, or single option with comma-separated values.

export type CmdLine_SchemaPart =
    | CmdLine_SchemaPart_Flag
    | CmdLine_SchemaPart_Int
    | CmdLine_SchemaPart_Str
    | CmdLine_SchemaPart_OneOf<readonly string[]>

export type CmdLine_Schema = { [name: string]: CmdLine_SchemaPart }

export type CmdLine_SchemaBuild = {
    flag(name: string): CmdLine_SchemaPart_Flag
    int(name: string): CmdLine_SchemaPart_Int
    str(name: string | string[]): CmdLine_SchemaPart_Str
    oneOf<V extends readonly string[]>(name: string | string[], values: V): CmdLine_SchemaPart_OneOf<V>
}

export type MkCmdLineSchema = (a: (b: CmdLine_SchemaBuild) => CmdLine_Schema) => CmdLine_Schema
export function mkCmdLineSchema<S extends CmdLine_Schema>(a: (b: CmdLine_SchemaBuild) => S): S {
    return a({
        flag(name: string): CmdLine_SchemaPart_Flag {
            return { tag: "OptFlag", name }
        },
        int(name: string): CmdLine_SchemaPart_Int {
            return { tag: "OptInt", name }
        },
        str(name: string | string[]): CmdLine_SchemaPart_Str {
            return { tag: "OptStr", name }
        },
        oneOf<V extends readonly string[]>(name: string | string[], values: V): CmdLine_SchemaPart_OneOf<V> {
            return { tag: "OptOneOf", name, values }
        }
    })
}
mkCmdLineSchema satisfies MkCmdLineSchema




export type CmdLine_TypeFor_SchemaPart<S extends CmdLine_SchemaPart> =
    S extends { tag: "OptFlag" } ? boolean :
    S extends { tag: "OptInt" } ? number :
    S extends { tag: "OptStr" } ? string :
    S extends { tag: "OptOneOf", values: infer V extends readonly string[] } ? V[number] :
    never

export type CmdLine_TypeFor_Schema<S extends CmdLine_Schema> =
    { [_ in keyof S]?: CmdLine_TypeFor_SchemaPart<S[_]> }





export type CmdLine_SchemaMatch_Result<S extends CmdLine_Schema> = {
    ok: boolean
    values: CmdLine_TypeFor_Schema<S>
    errorMsgs: string[]
}

export function cmdLine_schemaMatch<S extends CmdLine_Schema>(
    schema: S,
    cmdLine: CmdLine,
): CmdLine_SchemaMatch_Result<S> {

    const resultNames = new Map<string, string>
    for (const [name, part] of Object.entries(schema)) {
        if (typeof part.name === "string") {
            resultNames.set(part.name, name)
        }
        else {
            for (const part_name of part.name) {
                resultNames.set(part_name, name)
            }
        }
    }

    const result: CmdLine_SchemaMatch_Result<S> = {
        ok: false,
        values: {},
        errorMsgs: []
    }

    const result_values: { [_: string]: string | number | boolean | undefined | null } = result.values
    const optValues = new Map<string, string | null>

    // TODO ? Check for unexpected repeated use of the same option (result) name.
    for (const { name, value } of cmdLine.opts) {
        const rName = resultNames.get(name)
        if (rName !== undefined) {
            optValues.set(rName, value)
        }
        else {
            result.errorMsgs.push(`Unexpected option (${name})`)
        }
    }

    for (const [name, part] of Object.entries(schema)) {
        const value = optValues.get(name)
        if (value === undefined) continue
        switch (part.tag) {
            case "OptFlag":
                // TODO ? Make sure strVal is null, warn the user the value is ignored ?
                if (value !== null) {
                    result.errorMsgs.push(`Unexpected value for option (${name}), got (${JSON.stringify(value)}), but didn't expect any value.`)
                }
                else {
                    result_values[name] = true
                }
                break
            case "OptStr":
                if (value === null) {
                    result.errorMsgs.push(`Unexpected missing value for option (${name})`)
                }
                else {
                    result_values[name] = value
                }
                break
            case "OptInt":
                const intVal = Number(value)
                if (value === null || value === "" || intVal % 1 !== 0) {
                    result.errorMsgs.push(`Unexpected value for option (${name}), got (${JSON.stringify(value)}), but expected an integer.`)
                }
                else {
                    result_values[name] = intVal
                }
                break
            case "OptOneOf":
                if (value === null || part.values.indexOf(value) === -1) {
                    result.errorMsgs.push(`Unexpected value for option (${name}), got (${value}), but expected one of (${JSON.stringify(part.values)}).`)
                }
                else {
                    result_values[name] = value
                }
                break
            default:
                assert.noMissingCases(part)
        }
    }

    result.ok = result.errorMsgs.length === 0
    return result
}

