/* This custom loader reloads dynamically imported files within specified directories.
   When any files within a specified directory is imported,
     this loader adds a "?seqId=X" query parameter.
   The X value used is the maximum of all previously seen "seqId" query params.

   To use, the following lines need to be executed:

     import { register } from 'node:module';
     const dirs: string[] = ... // a list of one or more dir urls that this loader is responsible for.
     register("./page-loader.js", import.meta.url, dirs)
*/
import { fileURLToPath } from 'node:url';
import * as fs from "node:fs";
let maxSeqId = 0;
let watchedDirs = [];
export async function initialize(wd) {
    watchedDirs = wd;
}
export async function resolve(url, context, nextResolve) {
    // console.log("CUSTOM RESOLVER", url)
    const nextResult = await nextResolve(url, context);
    let addSeqId = false;
    for (const wd of watchedDirs) {
        if (nextResult.url.startsWith(wd)) {
            addSeqId = true;
        }
    }
    if (!addSeqId) {
        return nextResult;
    }
    const url2 = new URL(nextResult.url);
    const seqIdStr = url2.searchParams.get("seqId");
    const seqId = seqIdStr === null ? 0 : parseInt(seqIdStr);
    if (seqId > maxSeqId) {
        maxSeqId = seqId;
    }
    url2.searchParams.set("seqId", `${maxSeqId}`);
    nextResult.url = url2.toString();
    return nextResult;
}
export async function load(url, context, nextLoad) {
    // console.log("CUSTOM LOADER", url)
    const filename = fileURLToPath(url);
    const source = await fs.promises.readFile(filename);
    return {
        format: "module",
        shortCircuit: true,
        source
    };
}
//# sourceMappingURL=page-loader.js.map