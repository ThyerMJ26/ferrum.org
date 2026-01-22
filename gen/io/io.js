import { assert } from "../utils/assert.js";
// TODO Instances of Io should be plumbed through where needed.
// TODO There shouldn't be a global concept of Io,
// TODO   whether accessed through a global-variable 
// TODO   or through the getIo/setIo functions.
let io;
export function getIo() {
    if (io === undefined) {
        console.error('The "getIo" function must only be called after the "setIo" function.');
    }
    assert.isTrue(io !== undefined, 'The "getIo" function must only be called after the "setIo" function.');
    return io;
}
export function setIo(ioImpl) {
    // if (ioImpl === null) return
    // // TODO Don't disable this, add checks in initApp to avoid calling this twice.
    // // TODO Long-term, don't use a global io variable.
    // assert.isTrue(io === undefined, 'The "setIo" function must be called at most once, typically at the start of "main".')
    io = ioImpl;
}
/** Resolves a directory name relative to a URL.
 *  Ensures the result ends in a "/".
 */
export function url_resolveDir(base, dir) {
    if (!dir.endsWith("/")) {
        dir += "/";
    }
    return new URL(encodeURI(dir), base);
}
export function url_resolveFile(base, file) {
    return new URL(encodeURI(file), base);
}
//# sourceMappingURL=io.js.map