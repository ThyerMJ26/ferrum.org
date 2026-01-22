import * as fs from "node:fs";
import * as child_process from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";
import { assert } from "../utils/assert.js";
import { setIo } from "../io/io.js";
let vfs_used = false;
setIo(mkIoNodeJs_real(url.pathToFileURL("/")));
// export const mkIoNodeJs = mkIoNodeJs_dummy
export const mkIoNodeJs = mkIoNodeJs_real;
export function mkIoNodeJs_dummy(vfs_root) {
    return null;
}
export function mkIoNodeJs_real(vfs_root) {
    const io = {
        log(...args) {
            console.log(...args);
        },
        file_read(filename) {
            return fs.readFileSync(filename, "ascii");
        },
        file_write(filename, contents) {
            try {
                fs.writeFileSync(filename, contents);
            }
            catch (exc) {
                // TODO ? A more flexible way to handle/ignore errors ?
                console.error("Failed to write to file:", filename);
            }
        },
        file_rm(filename) {
            fs.rmSync(filename, { force: true });
        },
        file_open(filename, flags) {
            return fs.openSync(filename, flags);
        },
        fd_size(fd) {
            return fs.fstatSync(fd).size;
        },
        fd_read(fd, buffer, offset, length, position) {
            // assert.isTrue(!vfs_used)
            return fs.readSync(fd, buffer, offset, length, position);
        },
        fd_append(fd, buffer) {
            return fs.appendFileSync(fd, buffer, "ascii");
        },
        fd_close(fd) {
            return fs.closeSync(fd);
        },
        cmd_exec(cmd) {
            return child_process.execSync(cmd).toString();
        },
        path_basename(p) {
            return path.basename(p);
        },
        path_dirname(p) {
            return path.dirname(p);
        },
        path_join(...p) {
            return path.join(...p);
        },
        path_resolve(...p) {
            return path.resolve(...p);
        },
        // vfs_root(): URL {
        //     return vfs_root
        // },
        vfs_resolve(dirUrl, filePath) {
            vfs_used = true;
            dirUrl ??= vfs_root;
            assert.isTrue(dirUrl.href.startsWith(vfs_root.href));
            const fileUrl = encodeURI(filePath);
            const result = new URL(fileUrl, dirUrl);
            return result;
        },
        vfs_read(fileUrl) {
            vfs_used = true;
            assert.isTrue(fileUrl.href.startsWith(vfs_root.href));
            const filePath = url.fileURLToPath(fileUrl);
            return fs.promises.readFile(filePath, "ascii");
        },
    };
    return io;
}
// export function path_relative_resolve(aFile: string, bFile: string): string {
//     const aUrl = url_resolveFile("file:///", aFile)
//     const abUrl = url_resolveFile(aUrl, bFile)
//     const abFile = url.fileURLToPath(abUrl)
//     return abFile
// }
//# sourceMappingURL=io-nodejs.js.map