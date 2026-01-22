
import { assert } from "../utils/assert.js"
import { logger_log } from "../utils/logger.js"
import { nilLoc, Token, Loc, mkPos, mkLoc } from "./token.js"
import { scanFile } from "./scan.js"
import { ParseState } from "./parse.js"
import { parseTerm, parseType, parseFile } from "./parseFerrum2.js"
import { DeclLoc, ExprLoc } from "./expr.js"
import { getIo } from "../io/io.js"


export type ProjectText = { tag: 'text', name: string, filename: string }
export type ProjectSource = { tag: 'source' | "code", filename: string }
export type ProjectPart = ProjectText | ProjectSource

export type Project = {
    filename: string
    fileContents: string
    parts: ProjectPart[]
    contents: Map<string, string> // filename -> contents
}

export let emptyProject: Project = {
    filename: "",
    fileContents: "",
    parts: [],
    contents: new Map,
}

export function projectClone(p: Project): Project {
    return {
        filename: p.filename,
        fileContents: p.fileContents,
        parts: [...p.parts],
        contents: new Map(p.contents),
    }
}


type FDN = string | number | FDN[]

function FDN_parse(input: string): FDN {

    let [header, tokens] = scanFile("", input)
    let ps = new ParseState(tokens)
    let pExp = parseTerm(ps, header.language)

    function expToFdn(exp: ExprLoc): FDN {
        switch (exp.tag) {
            case "EDatum":
                return exp.value
            case "EList": {
                let items = exp.exprs.map(expToFdn)
                if (exp.tail !== null) {
                    throw new Error(`invalid tail in expression, expected nil`)
                }
                return items
            }
            default:
                throw new Error(`invalid expression tag (${exp.tag}), expected literal or list`)

        }
    }
    return expToFdn(pExp)
}

export async function readProject(projectFilename: URL): Promise<Project> {
    const io = getIo()
    // assert.isTrue(io.path_resolve(projectFilename) === projectFilename)
    let proj: Project = projectClone(emptyProject)
    proj.fileContents = await io.vfs_read(projectFilename)

    let p: any = FDN_parse(proj.fileContents);
    if (!(p instanceof Array) || p.length !== 2 || p[0] !== "project") {
        throw new Error("invalid project file")
    }
    let lines: string[][] = p[1]
    if (!(lines instanceof Array)) {
        throw new Error("invalid project file")
    }

    for (const line of lines) {
        if (line[0] === "source" || line[0] === "code" || line[0] === "primitives") {
            let filename = line[1]
            logger_log("run", 1, "source", filename)
            let fileContents = await io.vfs_read(io.vfs_resolve(projectFilename, filename))

            logger_log("run", 1, "fileContents", fileContents)
            proj.parts.push({ tag: 'source', filename: filename })
            proj.contents.set(filename, fileContents)
        }
        else if (line[0] === "text") {
            let varName = line[1]
            let filename = line[2]
            logger_log("run", 1, "text", varName, filename)
            let fileContents = await io.vfs_read(io.vfs_resolve(projectFilename, filename))
            proj.parts.push({ tag: 'text', name: varName, filename: filename })
            proj.contents.set(filename, fileContents)
        }
        else if (line[0] === "ignore") {
            // skip
        }
        else {
            throw new Error(`error: unknown tag ${line[0]}`);
        }
    }

    return proj
}

