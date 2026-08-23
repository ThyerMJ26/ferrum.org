
import * as process from "node:process"
import * as path from "node:path"

import { assert } from "../utils/assert.js"

import { setIo } from "../io/io.js"
import { mkIoNodeJs } from "../io/io-nodejs.js"

// import { wuiAppRunnerHttp, wuiAppRunnerHttp2 } from "../ui/app-server-http.js"
// import { wuiAppRunnerHttp2 } from "../ui/app-server-http.js"
import { serveAppWebsite } from "../site/serve-single-app-website.js"


function main() {
    setIo(mkIoNodeJs(new URL("file:///")))
    const args = process.argv.slice(2)
    assert.isTrue(args.length === 2)

    // TODO Switch over to using the new schema-based cmdline parser.
    // TODO   and have this handle details such as relative to absolve path conversion where needed.

    const port = parseInt(args[0])
    assert.isTrue(!isNaN(port))
    // File-paths in the app are resolved relative to the directory passed into the mkIo function above.
    // Relative file-paths must be resolved, as the concept of a current-directory has no meaning within the app.
    const testFile = path.resolve(args[1])

    // wuiAppRunnerHttp(port, ideApp, [testFile])


    serveAppWebsite(port, "/ts/gen/ide/ide-app.js", "ideApp", [testFile])


}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    main()
}

