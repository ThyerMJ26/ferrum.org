
// import * as process from "node:process"


let verbosity: { [verbose: string]: number } = {
    "run": 2,
    "parse": 1,
    "scan": 1,
    "primitives": 2,
    "types": 2,
    "eval": 2,
}

let verbose = false

function setVerbose() {
    verbose = true
}

function log(scope: string, level: number, ...args: any[]) {
    if (!verbose) {
        return
    }
    if (!(scope in verbosity)) {
        console.error(`Logger warning, unknown scope ${scope}`)
        verbosity[scope] = 1
    }

    if (level < verbosity[scope]) {
        process.stderr.write("Log:")
        for (let a of args) {
            process.stderr.write(` ${a}`)
        }
        process.stderr.write("\n")
    }
}

const logger_log = log

export { logger_log, setVerbose }

