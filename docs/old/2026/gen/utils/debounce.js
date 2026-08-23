export function debounceCallback(delayMs, cb) {
    let isPending = false;
    function cb2() {
        if (isPending) {
            return;
        }
        isPending = true;
        setTimeout(() => {
            isPending = false;
            cb();
        }, delayMs);
    }
    return cb2;
}
//# sourceMappingURL=debounce.js.map