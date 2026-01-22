import { assert } from "../utils/assert.js"
import { Io, setIo } from "../io/io.js"

const local_disk: Map<string, string> = new Map

export function mkIoBrowser (vfs_root: URL) {
    const ioBrowser: Io = {
        log(...args: string[]): void {
            assert.todo()
        },
        file_read(filename) {
            const contents = local_disk.get(filename) ?? ""
            return contents
        },
        file_write(filename, contents) {
            local_disk.set(filename, contents)
            return
            // assert.todo()
        },
        file_rm(filename) {
            return
            // assert.todo()
        },
        file_open(filename, flags) {
            return 0
            // assert.todo()
        },
        fd_size(fd) {
            return 0
            // assert.todo()
        },
        fd_read(fd, buffer, offset, length, position) {
            return 0
            // assert.todo()
        },
        fd_append(fd, buffer) {
            return
            // assert.todo()
        },
        fd_close(fd) {
            return
            // assert.todo()
        },
        cmd_exec(cmd) {
            // return
            assert.todo("Cannot launch processes from the browser.")
        },
        path_basename(p) {
            // return ""
            assert.todo()
        },
        path_dirname(p) {
            return ""
            // assert.todo()
        },
        path_join(...p) {
            // return ""
            assert.todo()
        },
        path_resolve(...p) {
            // return ""
            assert.todo()
        },
        // vfs_root() {
        //     return vfs_root
        // },
        vfs_resolve(dirUrl, filePath) {
            dirUrl ??= vfs_root
            assert.isTrue(dirUrl.href.startsWith(vfs_root.href))
            const fileUrl = encodeURI(filePath)
            const result = new URL(fileUrl, dirUrl)
            return result
        },
        async vfs_read(fileUrl) {
            assert.isTrue(fileUrl.href.startsWith(vfs_root.href))
            const response = await fetch(fileUrl)
            // TODO Check the response status code.
            // TODO We don't want to be mixing up a 404 error message with a Ferrum source code.
            return response.text()
        },
    }
    
    return ioBrowser
}

