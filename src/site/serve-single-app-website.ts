import * as url from "node:url"

import { unit } from "../utils/unit.js"

import { siteBuild } from "./site-builder.js"
import { siteServe } from "./site-server.js"
import { SiteDefn } from "./website-builder.js"

// We're in "ts/gen/ui", the root is three levels up.
export const topDir = url.fileURLToPath(import.meta.resolve("../../.."))


// This serves a website with a single app at "/", along with the static JS+TS files.
export function serveAppWebsite(port: number, appFilename: string, appFnName: string, args: string[]): unit {

    const siteDefn: SiteDefn = siteBuild(b => {
        b.staticFiles("/gen", "/ts/gen", ".js",  /**/ "text/javascript")
        b.staticFiles("/gen", "/ts/gen", ".map", /**/ "application/json")
        b.staticFiles("/src", "/ts/src", ".ts",  /**/ "text/plain")
        b.appDefine("APP", appFilename, appFnName)
        b.appInstantiate("APP-1", "APP", args)
        b.appPublish("/index.html", "APP-1")
    })

    siteServe(siteDefn, topDir, port)
}


