import { assert } from "../utils/assert.js";
export function docTour(doc, walk) {
    if (doc instanceof Array) {
        doc.forEach(d => walk(d));
    }
    if (typeof doc === "object" && "tag" in doc) {
        switch (doc.tag) {
            case "section":
                doc.docs.forEach(d => walk(d));
                break;
            case "para":
                doc.sentences.forEach(d => walk(d));
                break;
            case "list":
                doc.items.forEach(d => walk(d));
                break;
            case "defns":
                doc.defns.forEach(({ defn }) => walk(defn));
                break;
            case "app-publish":
            case "link-url":
            case "link-file":
            case "link-page":
                break;
            default:
                assert.noMissingCases(doc);
        }
    }
}
export function docTourRecursive(doc, walk) {
    docTour(doc, (d => {
        walk(d);
        docTourRecursive(d, walk);
    }));
}
export const mkDoc = {
    // title: (title: UiText) => ({ tag: "title", title }),
    section: (title, docs) => ({ tag: "section", title, docs }),
    para: (para) => ({ tag: "para", sentences: para }),
    list: (items) => ({ tag: "list", items }),
    defns: (defns) => ({ tag: "defns", defns }),
    appPublish: (instance) => ({ tag: "app-publish", instance }),
    linkUrl: (url, text) => ({ tag: "link-url", text, url }),
    linkFile: (file, text) => ({ tag: "link-file", text, file }),
    linkPage: (page, text, desc) => ({ tag: "link-page", text, page, desc }),
};
export function docBuild(cb) {
    const roots = new Set;
    function add(doc) {
        roots.add(doc);
        return doc;
    }
    const b = {
        add: d => { add(d); },
        section: (title, ...docs) => {
            return add(mkDoc.section(title, docs));
        },
        para: (...para) => {
            return add(mkDoc.para(para));
        },
        list: (elems) => {
            return add(mkDoc.list(elems));
        },
        defns: (ds) => {
            const ds1 = ds.map(([term, defn]) => ({ term, defn }));
            return add(mkDoc.defns(ds1));
        },
        link_file(page, text) {
            return add(mkDoc.linkFile(page, text));
        },
        link_page(page, text, desc) {
            return add(mkDoc.linkPage(page, text, desc));
        },
        link_url(page, text) {
            return add(mkDoc.linkUrl(page, text));
        },
        appPublish(appInstanceName) {
            return add(mkDoc.appPublish(appInstanceName));
        },
    };
    cb(b);
    // Every Doc created by this builder is tentatively assumed to not be part of another.
    // After all the Docs have been created, we remove from "roots" any docs that are part of another.
    // Whatever is left, forms the final document.
    // This provides a convenient way to use this same builder in both an imperative and functional way.
    for (const r of roots) {
        docTourRecursive(r, d => {
            roots.delete(d);
        });
    }
    return [...roots];
}
export function pageBuild(cb) {
    let title = "";
    const doc = docBuild(db => {
        const pb = {
            ...db,
            title: (text) => { title = text; }
        };
        cb(pb);
    });
    const page = { head: { title }, body: doc };
    return page;
}
//# sourceMappingURL=page-doc.js.map