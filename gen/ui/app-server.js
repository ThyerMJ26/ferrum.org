/** This file contains the network-independent parts of the app-server.
 *  It can be used with both the app-client and app-server running in the browser,
 *    or with the app-server running behind an http-server.
 */
import { assert } from "../utils/assert.js";
import { ww_createTabdedView, ww_createTextView2 } from "./app-views.js";
import { ww_createEditorView, ww_createListView, ww_createTableView, ww_createPanelView, } from "./app-views.js";
export function mkWui(persistentState, reactive, appIo) {
    let nextIdNum = 100;
    const views = new Map;
    const uiStyles = [];
    const newStyleMsgs = [];
    const serverStartTime = Date.now();
    let numRequestsStarted = 0;
    let numRequestsFinished = 0;
    let numReactiveCycles = 0;
    const wui = {
        // Reactive
        x: reactive,
        // Ui view instantiation
        tabbedView: createTabbedView,
        panelView: createPanelView,
        textView: createTextView,
        textView2: createTextView2,
        editorView: createEditorView,
        listView: createListView,
        tableView: createTableView,
        style: createStyle,
        styles: createStyles,
        // Wui initialization
        initApp,
        // Wui persistence
        setPersistentState,
        // Wui view implementation
        allocViewNum: allocIdNum,
        registerViewImpl,
        // diagnostics
        log,
        // Protocol-specific <-> protocol-independent connection
        exchangeMsgs,
    };
    appIo.readPersistentFile();
    let rootView;
    return wui;
    function exchangeMsgs(recvMsgsIn, sendMsgsOut) {
        sendMsgsOut.push(...newStyleMsgs);
        newStyleMsgs.length = 0;
        try {
            for (const reqMsg of recvMsgsIn) {
                handleRequest(reqMsg, sendMsgsOut);
            }
            numReactiveCycles += 1;
            reactive.runUntilStable();
            appIo.writePersistentFile();
        }
        catch (exc) {
            console.error(`Request failed ${exc}`);
        }
        rootView.impl.collectResponses(sendMsgsOut);
    }
    // TODO ? Allocate different id-types from the same id-source in a type-correct way.
    // function allocIdNum<Id extends number>(): Id { ... }
    function allocIdNum() {
        const result = nextIdNum;
        nextIdNum += 1;
        return result;
    }
    // TODO ? take the app as an argument,
    // TODO ?   or, equivalently, a suspended call that constructs the app
    function initApp(viewNum) {
        numReactiveCycles += 1;
        reactive.runUntilStable();
        const view = views.get(viewNum);
        assert.isTrue(view !== undefined);
        rootView = view;
    }
    function registerViewImpl(impl) {
        views.set(impl.viewCtx.viewNum, impl);
        return impl;
    }
    function setPersistentState(name, value) {
        persistentState.set(name, value);
    }
    function createTextView(textSignal0) {
        // const txv = ww_createTextView(wui, textSignal0)
        // return txv
        const args = {
            text: textSignal0,
            parts: reactive.state(null, new Map).r()
        };
        return (viewCtx) => ww_createTextView2(wui, args, viewCtx);
    }
    function createTextView2(args) {
        return (viewCtx) => ww_createTextView2(wui, args, viewCtx);
    }
    function createEditorView(textSignal0, highlightSignal0) {
        const txv = ww_createEditorView(wui, textSignal0, highlightSignal0);
        return txv;
    }
    function createListView(rows, selection, cb) {
        const lv = ww_createListView(wui, rows, selection, cb);
        return lv;
    }
    function createTableView(headings, contents, selection, cb) {
        return (viewCtx) => {
            const tbv = ww_createTableView(wui, viewCtx, headings, contents, selection, cb);
            return tbv;
        };
    }
    function createTabbedView(name) {
        // The "name" is currently ignored.
        return ww_createTabdedView(wui);
    }
    function createPanelView(name) {
        return ww_createPanelView(wui, name);
    }
    function createStyle(style, nameHint = null) {
        const styleNum = allocIdNum();
        uiStyles.push([styleNum, style, nameHint]);
        const msg = { tag: "createStyle", styleNum: styleNum, styleDefn: style, nameHint };
        newStyleMsgs.push(msg);
        return styleNum;
    }
    function createStyles(styles, nameHint) {
        const result = Object.fromEntries(Object.entries(styles).map(([name, defn]) => [name, createStyle(defn, nameHint === undefined ? name : `${nameHint}_${name}`)]));
        return result;
    }
    function prepareInit(responseMsgs) {
        responseMsgs.push({ tag: "reset" });
        for (const [num, defn, name] of uiStyles) {
            responseMsgs.push({ tag: "createStyle", styleNum: num, styleDefn: defn, nameHint: name });
        }
        rootView.impl.init();
        rootView.impl.collectResponses(responseMsgs);
        responseMsgs.push({ tag: "setRootView", rootView: rootView.impl.viewCtx.viewNum });
    }
    function handleRequest(req, responseMsgs) {
        switch (req.tag) {
            case "init": {
                prepareInit(responseMsgs);
                break;
            }
            case "selected":
            case "up":
            case "down":
            case "textClick3":
            case "textSelection3":
            case "editorClick":
            case "editorSelection":
            case "editorChanged":
            case "tableViewClick":
            case "panelviewClick":
            case "tabbedViewClick": {
                const view = views.get(req.viewNum);
                if (view === undefined) {
                    throw new Error(`Unknown view (${req.viewNum}).`);
                }
                // reactive.startDiagnosticCollection
                view.deliverRequest(req);
                break;
            }
            default:
                assert.noMissingCases(req);
        }
    }
    function showTime() {
        const now = Date.now();
        const t = now - serverStartTime;
        const t2 = Math.floor(t / 100);
        const result = (t2 / 10).toFixed(1);
        return result;
    }
    function log(...args) {
        const numRequestsInProgress = numRequestsStarted - numRequestsFinished;
        console.log(`ui.log [${showTime()}, ${numRequestsStarted}, ${numRequestsInProgress}, ${numReactiveCycles}]:`, ...args);
    }
}
//# sourceMappingURL=app-server.js.map