import { assert } from "./assert.js";
export function parseOpt(arg) {
    if (arg === "-" || arg === "--" || arg.startsWith("---")) {
        return null;
    }
    let dashes;
    if (arg.startsWith("--")) {
        dashes = "--";
    }
    else if (arg.startsWith("-")) {
        dashes = "-";
    }
    else {
        return null;
    }
    const i = arg.indexOf("=", dashes.length);
    if (i === -1) {
        const name = arg.slice(dashes.length);
        return { dashes, name: arg, value: null };
    }
    else {
        const name = arg.slice(dashes.length, i);
        const value = arg.slice(i + 1);
        return { dashes, name, value };
    }
}
export function parseCmdLine(argv) {
    const opts = [];
    const args = [];
    let i = 0;
    let opt;
    while (i < argv.length && (opt = parseOpt(argv[i]))) {
        opts.push(opt);
        ++i;
    }
    while (i < argv.length) {
        args.push(argv[i]);
        ++i;
    }
    return { opts, args };
}
export function mkCmdLineSchema(a) {
    return a({
        flag(name) {
            return { tag: "OptFlag", name };
        },
        int(name) {
            return { tag: "OptInt", name };
        },
        str(name) {
            return { tag: "OptStr", name };
        },
        oneOf(name, values) {
            return { tag: "OptOneOf", name, values };
        }
    });
}
mkCmdLineSchema;
export function cmdLine_schemaMatch(schema, cmdLine) {
    const resultNames = new Map;
    for (const [name, part] of Object.entries(schema)) {
        if (typeof part.name === "string") {
            resultNames.set(part.name, name);
        }
        else {
            for (const part_name of part.name) {
                resultNames.set(part_name, name);
            }
        }
    }
    const result = {
        ok: false,
        values: {},
        errorMsgs: []
    };
    const result_values = result.values;
    const optValues = new Map;
    // TODO ? Check for unexpected repeated use of the same option (result) name.
    for (const { name, value } of cmdLine.opts) {
        const rName = resultNames.get(name);
        if (rName !== undefined) {
            optValues.set(rName, value);
        }
        else {
            result.errorMsgs.push(`Unexpected option (${name})`);
        }
    }
    for (const [name, part] of Object.entries(schema)) {
        const value = optValues.get(name);
        if (value === undefined)
            continue;
        switch (part.tag) {
            case "OptFlag":
                // TODO ? Make sure strVal is null, warn the user the value is ignored ?
                if (value !== null) {
                    result.errorMsgs.push(`Unexpected value for option (${name}), got (${JSON.stringify(value)}), but didn't expect any value.`);
                }
                else {
                    result_values[name] = true;
                }
                break;
            case "OptStr":
                if (value === null) {
                    result.errorMsgs.push(`Unexpected missing value for option (${name})`);
                }
                else {
                    result_values[name] = value;
                }
                break;
            case "OptInt":
                const intVal = Number(value);
                if (value === null || value === "" || intVal % 1 !== 0) {
                    result.errorMsgs.push(`Unexpected value for option (${name}), got (${JSON.stringify(value)}), but expected an integer.`);
                }
                else {
                    result_values[name] = intVal;
                }
                break;
            case "OptOneOf":
                if (value === null || part.values.indexOf(value) === -1) {
                    result.errorMsgs.push(`Unexpected value for option (${name}), got (${value}), but expected one of (${JSON.stringify(part.values)}).`);
                }
                else {
                    result_values[name] = value;
                }
                break;
            default:
                assert.noMissingCases(part);
        }
    }
    result.ok = result.errorMsgs.length === 0;
    return result;
}
//# sourceMappingURL=cmdline.js.map