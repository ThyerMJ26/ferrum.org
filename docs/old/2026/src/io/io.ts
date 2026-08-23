import { assert } from "../utils/assert.js"

export type Io = {
    log(...args: string[]): void

    file_write(filename: string, contents: string): void
    file_read(filename: string): string
    file_rm(filename: string): void
    file_open(filename: string, flags: string): number

    fd_read(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null): number
    fd_append(fd: number, buffer: string | Uint8Array): void
    fd_size(fd: number): number
    fd_close(fd: number): void

    cmd_exec(cmd: string): string

    path_basename(p: string): string
    path_dirname(p: string): string
    path_join(...p: string[]): string
    path_resolve(...p: string[]): string

    // The vfs_ functions are intended for reading local files when running locally,
    // And for accessing files on the server, when running via a server.
    vfs_read(fileUrl: URL): Promise<string>

    // This behaves like url.resolve, not path.resolve.
    // Anything after the final "/" is assumed to be a filename and ignored.
    vfs_resolve(dirUrl: URL | null, filePath: string): URL

    // vfs_root(): URL

    // TODO ? NodeJS and browsers differ slightly, do we want to capture that here ?
    // task_immediate(cb: () => {}): number
    // task_delay(delay: number, cb: () => {}): number
    // task_cancel_immediate(id: number): void
    // task_cancel_delay(id: number): void
    // TODO ? Anything which assumes knowledge of a global concept of time should be treated as IO ?
    // now(): number
}

// TODO Instances of Io should be plumbed through where needed.
// TODO There shouldn't be a global concept of Io,
// TODO   whether accessed through a global-variable 
// TODO   or through the getIo/setIo functions.
let io: Io

export function getIo(): Io {
    if (io === undefined) {
        console.error('The "getIo" function must only be called after the "setIo" function.')
    }
    assert.isTrue(io !== undefined, 'The "getIo" function must only be called after the "setIo" function.')
    return io
}

export function setIo(ioImpl: Io): void {
    // if (ioImpl === null) return
    // // TODO Don't disable this, add checks in initApp to avoid calling this twice.
    // // TODO Long-term, don't use a global io variable.
    // assert.isTrue(io === undefined, 'The "setIo" function must be called at most once, typically at the start of "main".')
    io = ioImpl
}

/** Resolves a directory name relative to a URL.
 *  Ensures the result ends in a "/".
 */
export function url_resolveDir(base: URL | string, dir: string): URL {
    if (!dir.endsWith("/")) {
        dir += "/"
    }
    return new URL(encodeURI(dir), base)
}

export function url_resolveFile(base: URL | string, file: string): URL {
    return new URL(encodeURI(file), base)
}

