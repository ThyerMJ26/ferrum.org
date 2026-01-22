import path from "node:path";
import fs from "node:fs";
export function findFiles(topDir, extn, ctx, cb) {
    try {
        find(ctx, topDir);
    }
    catch (exc) {
        console.error(`findFiles failed: (${topDir}) (${exc})`);
        return;
    }
    return;
    function find(ctx, dir) {
        const dirContents = fs.readdirSync(dir);
        for (const file of dirContents) {
            const filePath = path.join(dir, file);
            const stats = fs.lstatSync(filePath);
            if (stats.isFile()) {
                if (path.extname(file) === extn) {
                    cb.file(ctx, file);
                }
            }
            else if (stats.isDirectory()) {
                const ctx2 = cb.dir(ctx, file);
                find(ctx2, filePath);
            }
            else {
                // Ignore whatever this is (it could be a block device, character device, FIFO, socket, or symbolic-link).
            }
        }
    }
}
//# sourceMappingURL=find-files.js.map