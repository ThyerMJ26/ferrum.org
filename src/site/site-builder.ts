import { assert } from "../utils/assert.js";
import { unit } from "../utils/unit.js";
import { SiteDefn, WebsiteBuilder } from "./website-builder.js";


export function siteBuild(cb: (_: WebsiteBuilder) => unit): SiteDefn {

    const siteDefn: SiteDefn = []

    const sb: WebsiteBuilder = {
        staticFiles(urlPath, dir, fileExtn, mime) {
            siteDefn.push({ tag: "Static", urlPath, fileDir: dir, fileExtn, mime })
        },
        async renderPages(urlPath, dir) {
            siteDefn.push({ tag: "Render", urlPath, fileDir: dir })
        },
        appDefine(appDefnName: string, appFilename: string, appFnName: string) {
            siteDefn.push({ tag: "AppDefine", appDefnName, appFilename, appFnName })
        },
        appInstantiate(appInstanceName: string, appDefnName: string, args: string[]) {
            siteDefn.push({ tag: "AppInstantiate", appInstanceName, appDefnName, args })
        },
        appPublish(urlPath: string, appInstanceName: string) {
            siteDefn.push({ tag: "AppPublish", urlPath, appInstanceName })
        },
        sitemap(urlPath) {
            siteDefn.push({ tag: "SiteMap", urlPath })
        },
        watch(fileDir) {
            siteDefn.push({ tag: "Watch", fileDir })
        },
    }

    cb(sb)

    return siteDefn
}