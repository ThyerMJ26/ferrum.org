/* This custom loader reloads dynamically imported files within specified directories.
   When any files within a specified directory is imported, 
     this loader adds a "?seqId=X" query parameter.
   The X value used is the maximum of all previously seen "seqId" query params.

   To use, the following lines need to be executed:

     import { register } from 'node:module';
     const dirs: string[] = ... // a list of one or more dir urls that this loader is responsible for.
     register("./page-loader.js", import.meta.url, dirs)
*/

import * as node_url from "node:url"

import { isBuiltin, LoadFnOutput, LoadHookContext, ResolveFnOutput, ResolveHookContext } from 'node:module';
import { dirname } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import * as fs from "node:fs"

import { unit} from "../utils/unit.js"
import { url_resolveDir } from "../io/io.js";

let maxSeqId = 0

let watchedDirs: string[] = []

export async function initialize(wd: string[]): Promise<unit> {
    watchedDirs = wd
}

export async function resolve(
    url: string,
    context: ResolveHookContext,
    nextResolve: (specifier: string, context?: Partial<ResolveHookContext>,) => ResolveFnOutput | Promise<ResolveFnOutput>
): Promise<ResolveFnOutput> {
    // console.log("CUSTOM RESOLVER", url)

    const nextResult = await nextResolve(url, context)

    let addSeqId = false
    for (const wd of watchedDirs) {
        if (nextResult.url.startsWith(wd)) {
            addSeqId = true
        }
    }


    if (!addSeqId) {
        return nextResult        
    }

    const url2 = new URL(nextResult.url)
    const seqIdStr = url2.searchParams.get("seqId")
    const seqId = seqIdStr === null ? 0 : parseInt(seqIdStr)
    if (seqId > maxSeqId) {
        maxSeqId = seqId
    }
    url2.searchParams.set("seqId", `${maxSeqId}`)
    nextResult.url = url2.toString()
    return nextResult
}

export async function load(
    url: string, context: LoadHookContext, 
    nextLoad: (url: string, context?: Partial<LoadHookContext>,) => LoadFnOutput | Promise<LoadFnOutput>
): Promise<LoadFnOutput> {
    // console.log("CUSTOM LOADER", url)
    const filename = fileURLToPath(url)
    const source = await fs.promises.readFile(filename)
    return {
        format: "module",
        shortCircuit: true,
        source
    }
}

