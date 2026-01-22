import path from "node:path";
import fs from "node:fs"

import { unit } from "./unit.js";

export type FindFilesCallback<C> = {
    dir(ctx: C, dirName: string): C,
    file(ctx: C, fileName: string): unit
}

// TODO ? Provide a more flexible filter mechanism ?
// TODO ?   currently the "extn" argument is mandatory and inflexible.
export type FindFilesFilter = {
    fileExtn: string
}

export function findFiles<C>(topDir: string, extn: string, ctx: C, cb: FindFilesCallback<C>): unit {

    try {
        find(ctx, topDir)
    }
    catch (exc) {
        console.error(`findFiles failed: (${topDir}) (${exc})`);
        return
    }
    return

    function find(ctx: C, dir: string) {
        const dirContents = fs.readdirSync(dir)
        for (const file of dirContents) {
            const filePath = path.join(dir, file)
            const stats = fs.lstatSync(filePath)
            if (stats.isFile()) {
                if (path.extname(file) === extn) {
                    cb.file(ctx, file)
                }
            }
            else if (stats.isDirectory()) {
                const ctx2 = cb.dir(ctx, file)
                find(ctx2, filePath)
            }
            else {
                // Ignore whatever this is (it could be a block device, character device, FIFO, socket, or symbolic-link).
            }
        }
    }
}


