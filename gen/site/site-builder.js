export function siteBuild(cb) {
    const siteDefn = [];
    const sb = {
        staticFiles(urlPath, dir, fileExtn, mime) {
            siteDefn.push({ tag: "Static", urlPath, fileDir: dir, fileExtn, mime });
        },
        async renderPages(urlPath, dir) {
            siteDefn.push({ tag: "Render", urlPath, fileDir: dir });
        },
        appDefine(appDefnName, appFilename, appFnName) {
            siteDefn.push({ tag: "AppDefine", appDefnName, appFilename, appFnName });
        },
        appInstantiate(appInstanceName, appDefnName, args) {
            siteDefn.push({ tag: "AppInstantiate", appInstanceName, appDefnName, args });
        },
        appPublish(urlPath, appInstanceName) {
            siteDefn.push({ tag: "AppPublish", urlPath, appInstanceName });
        },
        sitemap(urlPath) {
            siteDefn.push({ tag: "SiteMap", urlPath });
        },
        watch(fileDir) {
            siteDefn.push({ tag: "Watch", fileDir });
        },
    };
    cb(sb);
    return siteDefn;
}
//# sourceMappingURL=site-builder.js.map