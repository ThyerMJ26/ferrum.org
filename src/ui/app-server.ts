
/** This file contains the network-independent parts of the app-server.
 *  It can be used with both the app-client and app-server running in the browser,
 *    or with the app-server running behind an http-server.
 */

import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"

import { ViewNum, WuiRequestMsg, WuiResponseMsg, WuiRequestWrapper, WuiResponseWrapper } from "./protocol.js"
import { UiText, UiStyle, UiStyleDefns, UiStyleNum, UiTextId } from "./text.js"
import {
    Reactive, PortW, WritablePortList, WritablePorts, PortRw, PortR, NodeState,
    NodeCompute, zeroPadNum, ReactiveControl
} from "./reactive.js"
import { Ui, View, ListView, ListViewCallback, PanelView, ViewCtx, TableViewCallback, App, TabbedView, TextViewArgs, TextView3 } from "./app-ui.js"
import { ViewImpl, ww_createTabdedView, ww_createTextView2 } from "./app-views.js"
import {
    ww_createEditorView, ww_createListView,
    ww_createTableView, ww_createPanelView,
} from "./app-views.js"



export type Transport = {
    exchangeMsgs(recvMsgs: WuiRequestMsg[]): WuiResponseMsg[]
    notify(): unit
}

export type PersistentState = Map<string, any>

export type AppIo = {
    console_log(...a: string[]): unit
    readPersistentFile(): unit
    writePersistentFile(): unit
}

export type Wui = {
    x: Reactive

    initApp: (viewNum: ViewNum) => unit
    setPersistentState: (name: string, value: any) => unit

    allocViewNum: () => ViewNum

    registerViewImpl: <T extends ViewImpl>(impl: T) => T

    exchangeMsgs(recvMsgsIn: WuiRequestMsg[], sendMsgsOut: WuiResponseMsg[]): unit
}

type U = ViewImpl

export function mkWui(
    persistentState: Map<string, any>,
    reactive: ReactiveControl,
    appIo: AppIo,
): Ui<U> & Wui {
    let nextIdNum = 100

    const views: Map<ViewNum, ViewImpl> = new Map

    const uiStyles: [UiStyleNum, UiStyle, string | null][] = []
    const newStyleMsgs: WuiResponseMsg[] = []

    const serverStartTime = Date.now()
    let numRequestsStarted = 0
    let numRequestsFinished = 0
    let numReactiveCycles = 0


    const wui: Wui & Ui<U> = {
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

    let rootView: ViewImpl

    return wui

    function exchangeMsgs(recvMsgsIn: WuiRequestMsg[], sendMsgsOut: WuiResponseMsg[]): unit {

        sendMsgsOut.push(...newStyleMsgs)
        newStyleMsgs.length = 0

        try {
            for (const reqMsg of recvMsgsIn) {
                handleRequest(reqMsg, sendMsgsOut)
            }
            numReactiveCycles += 1
            reactive.runUntilStable()
            appIo.writePersistentFile()
        }
        catch (exc) {
            console.error(`Request failed ${exc}`)
        }

        rootView.impl.collectResponses(sendMsgsOut)
    }

    // TODO ? Allocate different id-types from the same id-source in a type-correct way.
    // function allocIdNum<Id extends number>(): Id { ... }

    function allocIdNum(): number {
        const result = nextIdNum
        nextIdNum += 1
        return result
    }

    // TODO ? take the app as an argument,
    // TODO ?   or, equivalently, a suspended call that constructs the app
    function initApp(viewNum: ViewNum): undefined {
        numReactiveCycles += 1
        reactive.runUntilStable()
        const view = views.get(viewNum)
        assert.isTrue(view !== undefined)
        rootView = view
    }

    function registerViewImpl<T extends ViewImpl>(impl: T): T {
        views.set(impl.viewCtx.viewNum, impl)
        return impl
    }

    function setPersistentState(name: string, value: any): unit {
        persistentState.set(name, value)
    }


    function createTextView(textSignal0: PortR<UiText<any>>) {
        // const txv = ww_createTextView(wui, textSignal0)
        // return txv

        const args: TextViewArgs<number, UiTextId> = {
            text: textSignal0,
            parts: reactive.state(null, new Map).r()
        }

        return (viewCtx: ViewCtx) => ww_createTextView2(wui, args, viewCtx)
    }

    function createTextView2<A extends number | string, I extends UiTextId>(args: TextViewArgs<A, I>): (viewCtx: ViewCtx) => TextView3<U> {
        return (viewCtx: ViewCtx) => ww_createTextView2(wui, args, viewCtx)
    }

    function createEditorView(textSignal0: PortRw<string>, highlightSignal0?: PortR<[number, number] | null>) {
        const txv = ww_createEditorView(wui, textSignal0, highlightSignal0)
        return txv
    }

    function createListView(rows: PortR<string[]>, selection: PortRw<number | null>, cb: ListViewCallback) {
        const lv = ww_createListView(wui, rows, selection, cb)
        return lv
    }
    function createTableView(headings: PortR<string[]>, contents: PortR<UiText[][]>, selection: PortRw<number | null>, cb: TableViewCallback) {
        return (viewCtx: ViewCtx) => {
            const tbv = ww_createTableView(wui, viewCtx, headings, contents, selection, cb)
            return tbv
        }
    }

    function createTabbedView(name: string): (viewCtx: ViewCtx) => TabbedView<U> {
        // The "name" is currently ignored.
        return ww_createTabdedView(wui)
    }

    function createPanelView(name: string): (viewCtx: ViewCtx) => PanelView<U> {
        return ww_createPanelView(wui, name)
    }


    function createStyle(style: UiStyle, nameHint: string | null = null): UiStyleNum {
        const styleNum = allocIdNum() as UiStyleNum
        uiStyles.push([styleNum, style, nameHint])
        const msg: WuiResponseMsg = { tag: "createStyle", styleNum: styleNum, styleDefn: style, nameHint }
        newStyleMsgs.push(msg)
        return styleNum
    }

    function createStyles<S extends UiStyleDefns>(styles: S, nameHint: string): { [K in keyof S]: UiStyleNum } {
        const result = Object.fromEntries(
            Object.entries(styles).map(
                ([name, defn]) =>
                    [name, createStyle(defn, nameHint === undefined ? name : `${nameHint}_${name}`)]
            )
        ) as { [K in keyof S]: UiStyleNum }

        return result
    }


    function prepareInit(responseMsgs: WuiResponseMsg[]) {
        responseMsgs.push({ tag: "reset" })

        for (const [num, defn, name] of uiStyles) {
            responseMsgs.push({ tag: "createStyle", styleNum: num, styleDefn: defn, nameHint: name })
        }

        rootView.impl.init()
        rootView.impl.collectResponses(responseMsgs)

        responseMsgs.push({ tag: "setRootView", rootView: rootView.impl.viewCtx.viewNum })
    }



    function handleRequest(req: WuiRequestMsg, responseMsgs: WuiResponseMsg[]): unit {

        switch (req.tag) {
            case "init": {
                prepareInit(responseMsgs)
                break
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
                const view = views.get(req.viewNum)
                if (view === undefined) {
                    throw new Error(`Unknown view (${req.viewNum}).`)
                }
                // reactive.startDiagnosticCollection
                view.deliverRequest(req)
                break
            }
            default:
                assert.noMissingCases(req)
        }

    }

    function showTime() {
        const now = Date.now()
        const t = now - serverStartTime
        const t2 = Math.floor(t / 100)
        const result = (t2 / 10).toFixed(1)
        return result
    }

    function log(...args: string[]): unit {
        const numRequestsInProgress = numRequestsStarted - numRequestsFinished
        console.log(`ui.log [${showTime()}, ${numRequestsStarted}, ${numRequestsInProgress}, ${numReactiveCycles}]:`, ...args)
    }

}

