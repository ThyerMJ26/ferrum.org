import * as path from "path";
import { url_resolveDir, url_resolveFile } from "../io/io.js";
import { assert } from "../utils/assert.js";
import { findFiles } from "../utils/find-files.js";
export function siteFiles(topDir, defn) {
    const siteFiles = {
        topDir,
        entries: [],
        urlMap: new Map,
        appDefnMap: new Map,
        appInstMap: new Map,
        fileMap: new Map,
        pageMap: new Map,
        // appMap: new Map,
        sitemap: [],
        watch: [],
    };
    function addUrlEntry(urlPath, entry) {
        if (siteFiles.urlMap.has(urlPath)) {
            console.error(`Warning: Ignoring redefinition of: ${urlPath}`);
        }
        else {
            siteFiles.urlMap.set(urlPath, entry);
        }
    }
    for (const entry of defn) {
        const sdf = { entry: entry, urlMap: new Map };
        siteFiles.entries.push(sdf);
        switch (entry.tag) {
            case "Static": {
                const { fileDir, urlPath, fileExtn, mime } = entry;
                const ctx = {
                    srcDir: fileDir,
                    dstDir: urlPath,
                    urlDir: url_resolveDir("http://.", urlPath)
                };
                const findDir = path.join(topDir, ctx.srcDir);
                findFiles(findDir, fileExtn, ctx, {
                    dir({ srcDir, dstDir, urlDir: dstUrl }, dirName) {
                        return {
                            srcDir: path.join(srcDir, dirName),
                            dstDir: path.join(dstDir, dirName),
                            urlDir: url_resolveDir(dstUrl, dirName)
                        };
                    },
                    file({ srcDir, dstDir, urlDir: urlDir }, fileName) {
                        const srcFile = path.join(srcDir, fileName);
                        const dstFile = path.join(dstDir, fileName);
                        const urlFile = url_resolveFile(urlDir, fileName).pathname;
                        const fileEntry = { tag: "file", urlPath: urlFile, srcFile, filePath: dstFile, mime };
                        sdf.urlMap.set(urlFile, fileEntry);
                        addUrlEntry(urlFile, fileEntry);
                        const entries = siteFiles.fileMap.get(srcFile) ?? [];
                        entries.push(fileEntry);
                        siteFiles.fileMap.set(srcFile, entries);
                    }
                });
                break;
            }
            case "Render": {
                const { urlPath, fileDir } = entry;
                const ctx = {
                    srcDir: fileDir,
                    dstDir: "",
                    urlDir: url_resolveDir("http://.", urlPath)
                };
                const findDir = path.join(topDir, ctx.srcDir);
                findFiles(findDir, ".js", ctx, {
                    dir({ srcDir, dstDir, urlDir }, dirName) {
                        return {
                            srcDir: path.join(srcDir, dirName),
                            dstDir: path.join(dstDir, dirName),
                            urlDir: url_resolveDir(urlDir, dirName)
                        };
                    },
                    file({ srcDir, dstDir, urlDir }, fileName) {
                        const srcFile = path.join(srcDir, fileName);
                        const htmlFile = `${path.parse(fileName).name}.html`;
                        const filePath = path.join(dstDir, htmlFile);
                        const urlPath = url_resolveFile(urlDir, htmlFile).pathname;
                        const entry = { tag: "page", urlPath, filePath, srcFile };
                        sdf.urlMap.set(urlPath, entry);
                        addUrlEntry(urlPath, entry);
                        const entries = siteFiles.pageMap.get(srcFile) ?? [];
                        entries.push(entry);
                        siteFiles.pageMap.set(srcFile, entries);
                    },
                });
                break;
            }
            case "AppDefine":
                siteFiles.appDefnMap.set(entry.appDefnName, { defnName: entry.appDefnName, fileName: entry.appFilename, fnName: entry.appFnName });
                break;
            case "AppInstantiate":
                siteFiles.appInstMap.set(entry.appInstanceName, { instanceName: entry.appInstanceName, defnName: entry.appDefnName, args: entry.args });
                break;
            case "AppPublish": {
                const urlFile = url_resolveFile("http://.", entry.urlPath).pathname;
                const dstFile = path.join(topDir, entry.urlPath);
                const appEntry = { tag: "app", urlPath: urlFile, filePath: dstFile, instanceName: entry.appInstanceName };
                sdf.urlMap.set(urlFile, appEntry);
                addUrlEntry(urlFile, appEntry);
                break;
            }
            case "SiteMap": {
                siteFiles.sitemap.push(entry.urlPath);
                const urlFile = url_resolveFile("http://.", entry.urlPath).pathname;
                const sitemapEntry = { urlPath: urlFile, filePath: urlFile, tag: "sitemap" };
                siteFiles.urlMap.set(urlFile, sitemapEntry);
                sdf.urlMap.set(urlFile, sitemapEntry);
                break;
            }
            case "Watch":
                siteFiles.watch.push(entry.fileDir);
                break;
            default:
                assert.noMissingCases(entry);
        }
    }
    return siteFiles;
}
//# sourceMappingURL=website-builder.js.map