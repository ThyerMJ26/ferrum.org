import * as fs from "node:fs"
import * as path from "node:path"
import * as url from "node:url";
import * as http from "node:http"

import { unit } from "../utils/unit.js";
import { CmdLine, parseCmdLine } from "../utils/cmdline.js";
import { assert } from "../utils/assert.js"
import { siteFiles, WebsiteBuilder } from "../site/website-builder.js";
// import { exportSite } from "../site/website-exporter.js";
import { PageModule } from "../site/page-module.js";
// import { serveSite, showAddrInfo } from "../site/website-server.js";
import { setIo } from "../io/io.js";
import { mkIoNodeJs } from "../io/io-nodejs.js";
import { siteBuild } from "../site/site-builder.js";
import { siteExport } from "../site/site-exporter.js";
import { siteServe } from "../site/site-server.js";

// We're in "ts/gen/site", the root is three levels up.
export const topDir = url.fileURLToPath(import.meta.resolve("../../.."))

function ferrumOrg(w: WebsiteBuilder): unit {
    w.staticFiles("/gen",   /**/ "/ts/gen", /**/ ".js",  /**/ "text/javascript")
    w.staticFiles("/gen",   /**/ "/ts/gen", /**/ ".map", /**/ "application/json")
    w.staticFiles("/src",   /**/ "/ts/src", /**/ ".ts",  /**/ "text/plain")
    w.staticFiles("/fe",    /**/ "/fe",     /**/ ".fe",  /**/ "text/plain")
    w.staticFiles("/tests", /**/ "/tests",  /**/ ".fe",  /**/ "text/plain")

    w.renderPages("/", "/ts/gen/ferrum-org/pages")

    // const testFile = "tests/fe4-.test.fe"
    // const testFile = "tests/fe4a.test.fe"
    // const testFile = "tests/fe4b-prelude.test.fe"
    // w.app("/ide.html", "ts/gen", "ui/webide-app.js", "webideApp", [`--ferrumDir=${topDir}`, path.join(topDir, testFile)])
    // const args = [`--ferrumDir=${topDir}`, path.join(topDir, testFile)]
    // const args = [testFile]
    // w.app("/apps/ide.html", "/gen", "ts/gen", "ide/ide-app.js", "ideApp", args)

    w.appDefine("IDE", "/ts/gen/ide/ide-app.js", "ideApp")
    w.appInstantiate("IDE-1", "IDE", ["tests/short.test.fe"])
    w.appPublish("/apps2/ide1.html", "IDE-1")

    // w.appInstantiate("IDE-2", "IDE", ["tests/fe4a.test.fe"])
    // w.appPublish("/apps2/ide2.html", "IDE-2")

    // old-style apps, no longer supported
    // w.app("/apps/examples.html", "/gen", "ts/gen", "site/apps/examples-app.js", "examplesApp", [])

    w.appDefine("EX", "/ts/gen/ferrum-org/apps/examples-app.js", "examplesApp")
    w.appInstantiate("EX-1", "EX", [])
    w.appPublish("/apps2/examples.html", "EX-1")

    w.sitemap("/sitemap.html")

    w.watch("/ts/gen/ferrum-org")
}

// export function exportFerrumOrg(outDir: string) {
//     try {
//         fs.mkdirSync(outDir)
//     }
//     catch (exc) {
//         console.error("Failed to create directory:", outDir)
//         console.error("Delete it first if it already exists.")
//         console.error("Exception:", (exc as Error).message)
//         process.exit(1)
//     }
//     const exporter = exportSite(topDir, outDir)
//     ferrumOrg(exporter)
// }

export async function exportFerrumOrg_b(outDir: string) {
    try {
        fs.mkdirSync(outDir)
    }
    catch (exc) {
        console.error("Failed to create directory:", outDir)
        console.error("Delete it first if it already exists.")
        console.error("Exception:", (exc as Error).message)
        process.exit(1)
    }

    const siteDefn = siteBuild(ferrumOrg)
    // const files = siteFiles(topDir, siteDefn)
    await siteExport(siteDefn, topDir, outDir)
    console.log("Site Export Done.")
}

// export function serveFerrumOrg(portNum: number) {
//     const siteServer = serveSite(topDir)
//     ferrumOrg(siteServer.wsb)
//     siteServer.update()
//     const httpServer = http.createServer(siteServer.requestHandler)
//     // const host = undefined // for remote access
//     const host = "localhost" // for local access
//     httpServer.listen({ port: portNum, host }, () => {
//         const info = httpServer.address()
//         if (info && typeof info === "object") {
//             console.log("Listening:", `http://${showAddrInfo(info)}/`)
//         }
//         else {
//             console.log("Listening:", httpServer.address())
//         }
//     })
// }

export async function serveFerrumOrg_b(portNum: number) {
    const siteDefn = siteBuild(ferrumOrg)
    await siteServe(siteDefn, topDir, portNum)
    console.log("Site Serve Done.")
}


function main() {
    setIo(mkIoNodeJs(new URL("../../../", import.meta.url)))
    const args = process.argv.slice(2)
    console.log(args)
    console.log("TOP DIR:", topDir)
    switch (args[0]) {
        // case "export":
        //     exportFerrumOrg(args[1])
        //     break
        case "export-b":
            exportFerrumOrg_b(args[1])
            break
        // case "serve":
        //     serveFerrumOrg(Number(args[1] ?? 0))
        //     break
        case "serve-b":
            serveFerrumOrg_b(Number(args[1] ?? 0))
            break
        default:
            console.error("Unknown command:", args[0])
            process.exit(1)
    }
}


if (process.argv[1] === new URL(import.meta.url).pathname) {
    main()
}
