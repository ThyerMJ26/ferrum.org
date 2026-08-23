
/** This file provides the server-side part of the HTML implementation of all the UI views.
 *  ( The corresponding client-side code is currently in browser.ts )
 */

import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"

import { Reactive, PortW, PortRw, PortR } from "./reactive.js"
import { EditorView, EditorViewCallback, ListView, ListViewCallback, PanelView, TabbedView, TableView, TableViewCallback, TextView3, TextViewArgs, TextViewCallback3, View, ViewCtx } from "./app-ui.js"
import { } from "./app-ui.js"
import { WuiResponseMsg, WuiRequestMsg, ViewNum } from "./protocol.js"
import { UiText, UiTextId, uiText, uiTextList } from "./text.js"
import { UiStyleNum } from "./text.js"
import { Wui } from "./app-server.js"

type U = ViewImpl
export type ViewImpl = View<U> & {
    viewCtx: ViewCtx
    children: View<U>[]
    init: () => unit
    deliverRequest(req: WuiRequestMsg): unit
    collectResponses(rsps: WuiResponseMsg[]): unit
}


//#region Utils 

type RspObj = { [_: string]: WuiResponseMsg[] }

function mkRspObj<RO extends RspObj>(rspObj: RO): { [K in keyof RO]: WuiResponseMsg[] } {
    return rspObj
}

// TODO ? Provide more control over the order in which messages are sent ?
// TODO   This looks like it will just use the field-order which will be alphabetical more non-numeric fields.
function collectRspObj(responses: WuiResponseMsg[], rspObj: RspObj): unit {
    for (let field in rspObj) {
        responses.push(...rspObj[field])
        rspObj[field].length = 0
    }
}

//#endregion






//#region Text

// --- Text View ---

// export function ww_createTextView(wui: Wui, textSignal0?: PortR<UiText<any>>) {
//     const textSignal = textSignal0 ?? wui.x.state<UiText<any>>(null, "").rw()

//     return (viewCtx: ViewCtx): TextView3<U> => {
//         const viewNum = viewCtx.viewNum

//         const rspObj = mkRspObj({
//             init: [],
//             text: [],
//             high: []
//         })

//         wui.x.effect(null, () => {
//             if (viewCtx.visible.read()) {
//                 // When the TextView becomes visible again, send the contents.
//                 if (textSignal.fresh()) {
//                     const text = textSignal.read()
//                     rspObj.text = [{ tag: "textText", viewNum: viewCtx.viewNum, text: text }]
//                 }
//             }
//         })

//         class TextViewImpl implements TextView3<U>, ViewImpl {
//             impl: ViewImpl
//             viewCtx = viewCtx
//             children = []
//             cb: TextViewCallback3 | null = null
//             constructor() {
//                 this.impl = this
//             }
//             init(): unit {
//                 rspObj.init = [{ tag: "mkTextView", viewNum }]
//                 rspObj.text = [{ tag: "textText", viewNum, text: textSignal.read() }]
//             }
//             deliverRequest(req: WuiRequestMsg): unit {
//                 if (this.cb === null) {
//                     return
//                 }
//                 switch (req.tag) {
//                     case "textClick3":
//                         if (this.cb.click !== undefined) {
//                             this.cb.click(req.annot)
//                         }
//                         break
//                     // case "textSelection":
//                     //     if (this.cb.selected !== undefined) {
//                     //         this.cb.selected(req.from, req.to)
//                     //     }
//                     //     break
//                     default:
//                         throw new Error("Unexpected request")
//                 }
//             }
//             collectResponses(responses: WuiResponseMsg[]): unit {
//                 collectRspObj(responses, rspObj)
//             }
//             writablePorts = () => []
//             callback(cb: TextViewCallback3): unit {
//                 // This currently just replaces any existing callback object
//                 // TODO ? Alloc multiple callbacks to be called ?
//                 // TODO ? Merge old and new callbacks ?
//                 this.cb = cb
//             }
//         }
//         const textview = new TextViewImpl
//         wui.registerViewImpl(textview)
//         return textview

//     }
// }

export function ww_createTextView2<
    A extends number | string,
    I extends UiTextId
>(
    wui: Wui, args: TextViewArgs<A, I>, viewCtx: ViewCtx
): TextView3<U> {
    const textSignal = args.text

    const viewNum = viewCtx.viewNum

    const rspObj = mkRspObj({
        init: [],
        parts: [],
        text: [],
    })

    wui.x.effect(null, () => {
        if (viewCtx.visible.read()) {
            // When the TextView becomes visible again, send the contents.
            if (textSignal.fresh()) {
                const text = textSignal.read()
                rspObj.text = [{ tag: "textText", viewNum: viewCtx.viewNum, text }]
            }
            // The parts must be sent/resent after text.
            // TODO Calls to fresh immediately after calls to read/delta/fresh will always return false.
            // TODO We either need to fix this test, or change the behaviour of fresh.
            //  ( before the symptoms become apparent. )
            if (textSignal.fresh() || args.parts.fresh()) {
                const parts = args.parts.read()
                rspObj.text = []
                for (const [id, value] of parts) {
                    rspObj.text.push({ tag: "textPart", viewNum: viewCtx.viewNum, id, value })
                }
            }
        }
    })

    class TextViewImpl implements TextView3<U>, ViewImpl {
        impl: ViewImpl
        viewCtx = viewCtx
        children = []
        cb: TextViewCallback3 | null = null
        constructor() {
            this.impl = this
        }
        init(): unit {
            rspObj.init = [{ tag: "mkTextView", viewNum }]
            rspObj.parts = []
            for (const [id, value] of args.parts.read()) {
                rspObj.parts.push({ tag: "textPart", viewNum, id, value })
            }
            rspObj.text = [{ tag: "textText", viewNum, text: textSignal.read() }]
        }
        deliverRequest(req: WuiRequestMsg): unit {
            if (this.cb === null) {
                return
            }
            switch (req.tag) {
                case "textClick3":
                    if (this.cb.click !== undefined) {
                        this.cb.click(req.annot)
                    }
                    break
                // case "textSelection":
                //     if (this.cb.selected !== undefined) {
                //         this.cb.selected(req.from, req.to)
                //     }
                //     break
                default:
                    throw new Error("Unexpected request")
            }
        }
        collectResponses(responses: WuiResponseMsg[]): unit {
            // collectRspObj(responses, rspObj)
            // The parts must be sent/resent after text.
            responses.push(...rspObj.init.splice(0))
            responses.push(...rspObj.text.splice(0))
            responses.push(...rspObj.parts.splice(0))
        }
        writablePorts = () => []
        callback(cb: TextViewCallback3): unit {
            // This currently just replaces any existing callback object
            // TODO ? Alloc multiple callbacks to be called ?
            // TODO ? Merge old and new callbacks ?
            this.cb = cb
        }
    }
    const textview = new TextViewImpl
    wui.registerViewImpl(textview)
    return textview


}

//#endregion


//#region Editor

// --- Editor View ---

export function ww_createEditorView(wui: Wui, textSignal0: PortRw<string>, highlightSignal0?: PortR<[number, number] | null>) {
    const textSignal = textSignal0 ?? wui.x.state<string>(null, "").rw()
    const highlightSignal = highlightSignal0 ?? wui.x.state<[number, number] | null>(null, null).rw()
    return (viewCtx: ViewCtx): EditorView<U> => {
        const viewNum = viewCtx.viewNum

        const rspObj = mkRspObj({
            init: [],
            text: [],
            high: []
        })

        wui.x.effect(null, () => {
            if (viewCtx.visible.read()) {
                // When the View becomes visible again, send the contents.
                if (textSignal.r().fresh()) {
                    const text = textSignal.r().read()
                    rspObj.text = [{ tag: "editorText", viewNum: viewCtx.viewNum, text }]
                }
                if (highlightSignal.fresh()) {
                    const highlight = highlightSignal.read()
                    if (highlight !== null) {
                        const [from, to] = highlight
                        rspObj.high = [{ tag: "editorHighlight", viewNum: viewCtx.viewNum, from, to }]
                    }
                }
            }
        })

        class EditorViewImpl implements EditorView<U>, ViewImpl {
            impl: ViewImpl
            viewCtx = viewCtx
            children = []
            cb: EditorViewCallback | null = null
            constructor() {
                this.impl = this
            }
            init(): unit {
                rspObj.init = [{ tag: "mkEditor", viewNum }]
                rspObj.text = [{ tag: "editorText", viewNum, text: textSignal.r().read() }]
                const highlight = highlightSignal.read()
                if (highlight !== null) {
                    const [from, to] = highlight
                    rspObj.high = [{ tag: "editorHighlight", viewNum, from, to }]
                }
            }
            deliverRequest(req: WuiRequestMsg): unit {
                if (this.cb === null) return
                switch (req.tag) {
                    case "editorClick":
                        if (this.cb.click !== undefined) {
                            this.cb.click(req.pos)
                        }
                        break
                    case "editorSelection":
                        if (this.cb.selected !== undefined) {
                            this.cb.selected(req.from, req.to)
                        }
                        break
                    default:
                        assert.impossible(`Unexpected request (${JSON.stringify(req)})`)
                    // throw new Error("Unexpected request")
                }
            }
            collectResponses(responses: WuiResponseMsg[]): unit {
                collectRspObj(responses, rspObj)
            }

            writablePorts = () => []
            callback(cb: EditorViewCallback): unit {
                assert.isTrue(this.cb === null)
                // If we permit a second call to callback,
                //   should it replace the first, or add to it?
                this.cb = cb
            }
        }
        const view = new EditorViewImpl
        wui.registerViewImpl(view)
        return view

    }
}

//#endregion



//#region List


// --- List View ---

// TODO ? make generic, and take an additional (show: T => string) function ?
// TODO ? make selection work with "T" instead of "number" ? this is more useful for consumers ?
// TODO ?   but how well will this work with persistence, numbers are easier to persist ?

export function ww_createListView(
    wui: Wui,
    rowsSignal: PortR<string[]>,
    selection: PortRw<number | null>,
    cb: ListViewCallback
) {
    return (viewCtx: ViewCtx): ListView<U> => {

        const viewNum = viewCtx.viewNum

        const rspObj = mkRspObj({
            init: [],
            setRows: [],
            selectRow: [],
        })

        wui.x.effect(null, () => {
            if (viewCtx.visible.read()) {
                if (rowsSignal.fresh()) {
                    rspObj.setRows = [{ tag: "listviewSetRows", viewNum: viewCtx.viewNum, rows: rowsSignal.read() }]
                }
                const rowSelected = selection.read()
                if (rowSelected === undefined) {
                    console.log("WAT!")
                }
                rspObj.selectRow = [{ tag: "listviewSelectRow", viewNum: viewCtx.viewNum, row: rowSelected }]
            }
            else {
                // console.log("View not visible.")
            }
        })

        const moveSelection = (change: number) => {
            let s = selection.read()
            if (s === null) {
                return
            }
            s += change
            s = Math.max(0, (Math.min(s, rowsSignal.read().length - 1)))
            selection.write(s)
        }
        class ListViewImpl implements ListView<U>, ViewImpl {
            impl: U = this
            viewCtx = viewCtx
            children = []
            writablePorts = () => []
            init(): unit {
                rspObj.init = [
                    { tag: "createListView", viewNum },
                    { tag: "listviewSetRows", viewNum, rows: rowsSignal.read() },
                    { tag: "listviewSelectRow", viewNum: viewNum, row: selection.read() },
                ]
                rspObj.setRows = [{ tag: "listviewSetRows", viewNum: viewNum, rows: rowsSignal.read() }]
                rspObj.selectRow = [{ tag: "listviewSelectRow", viewNum: viewNum, row: selection.read() }]
            }
            deliverRequest(req: WuiRequestMsg): unit {
                switch (req.tag) {
                    case "selected":
                        // console.log("LIST SELECT")
                        selection.write(req.row)
                        // cb.selected(req.row)
                        break
                    case "up":
                        // console.log("LIST UP")
                        moveSelection(-1)
                        break
                    case "down":
                        // console.log("LIST DOWN")
                        moveSelection(+1)
                        break
                    default:
                        throw new Error("Unexpected request")
                }
            }
            collectResponses(responses: WuiResponseMsg[]): unit {
                collectRspObj(responses, rspObj)
            }

            // setRows: (rows0) => {
            //     // rows = rows0
            //     // wui.send({ tag: "listviewSetRows", viewNum, rows })
            // },
            // setSelected: (row) => {
            //     // selectedRow = row
            //     // wui.send({ tag: "listviewSelectRow", viewNum, row: selectedRow })
            // }
        }

        const listview = new ListViewImpl

        wui.registerViewImpl(listview)
        return listview
    }
}


//#endregion



//#region Table


// --- Table View ---

export function ww_createTableView(
    wui: Wui, viewCtx: ViewCtx,
    headings: PortR<string[]>,
    contents: PortR<UiText[][]>,
    selection: PortRw<number | null>,
    cb: TableViewCallback,
): TableView<U> {

    const rspObj = mkRspObj({
        init: [],
        setContents: [],
        selectRow: [],
    })

    wui.x.effect(null, () => {
        if (viewCtx.visible.read()) {
            if (contents.fresh()) {
                rspObj.setContents = [{ tag: "tableViewSetContents", viewNum: viewNum, contents: contents.read() }]
            }
            const rowSelected = selection.read()
            rspObj.selectRow = [{ tag: "tableViewSelectRow", viewNum: viewNum, row: rowSelected }]
        }
        else {
            // console.log("View not visible.")
        }
    })

    const viewNum = viewCtx.viewNum

    class TableViewImpl implements TableView<U>, ViewImpl {
        viewCtx = viewCtx
        impl: ViewImpl = this
        children: View<U>[] = []
        writablePorts = () => []

        init(): unit {
            rspObj.init = [
                { tag: "createTableView", viewNum },
                { tag: "tableViewSetHeadings", viewNum, headings: headings.read() },
                { tag: "tableViewSetContents", viewNum, contents: contents.read() },
            ]
            rspObj.setContents = [{ tag: "tableViewSetContents", viewNum: viewNum, contents: contents.read() }]
            rspObj.selectRow = [{ tag: "tableViewSelectRow", viewNum: viewNum, row: selection.read() }]

        }

        moveSelection(change: number): unit {
            let s = selection.read()
            if (s === null) {
                return
            }
            s += change
            s = Math.max(0, (Math.min(s, contents.read().length - 1)))
            selection.write(s)
        }

        deliverRequest(req: WuiRequestMsg): unit {
            switch (req.tag) {
                case "tableViewClick":
                    // console.log(`TableViewClick: ${JSON.stringify(req)}`)
                    selection.write(req.row)
                    if (cb.clicked !== undefined) {
                        cb.clicked(req.row, req.col, req.pos)
                    }
                    break
                case "up":
                    this.moveSelection(-1)
                    break
                case "down":
                    this.moveSelection(+1)
                    break

                default:
                    throw new Error("Unexpected callback.")
            }
        }

        collectResponses(responses: WuiResponseMsg[]): unit {
            collectRspObj(responses, rspObj)
        }

    }


    const tableView = new TableViewImpl
    wui.registerViewImpl(tableView)

    return tableView


}


//#endregion



//#region Panel



// --- Panel View ---

// TODO ? Enable the toggle-state of the child panes to be kept in (a) signal(s) passed in to the create function ?
// TODO ?   An array of signals of bools
// TODO ?   or a single signal containing an array of bools
// TODO ?   or a single signal containing an array of signals of bools

// TODO ? Allow the child panes themselves to be passed in via a signal ?

export function ww_createPanelView(wui: Wui, name: string) {
    return (viewCtx: ViewCtx): PanelView<U> => {

        const viewNum = viewCtx.viewNum

        type PaneInfo = {
            name: string
            view: ViewImpl
            visible: PortRw<boolean>
        }

        const rspObj_init = mkRspObj({
            init: [],
        })

        const rspObj = mkRspObj({
            addPane: [],
            setVisible: [],
        })

        class PanelViewImpl implements PanelView<U>, ViewImpl {
            impl = this
            children: View<U>[] = []
            viewCtx = viewCtx
            writablePorts = () => [] // this list will need to contain the toggle-signals, if these signals are ever to be controlled externally (which they probably won't)
            panesMap: Map<string, PaneInfo> = new Map
            init(): unit {
                rspObj_init.init = [{ tag: "createPanelView", viewNum }]
                rspObj.addPane = []
                for (const [name, p] of this.panesMap) {
                    p.view.init()
                    const pane = { name: p.name, view: p.view.viewCtx.viewNum, visible: p.visible.read() }
                    rspObj.addPane.push({ tag: "panelView_addPane", viewNum, pane })
                    rspObj.setVisible.push({ tag: "panelviewSetVisible", viewNum, pane: p.name, visible: p.visible.read() })
                }
            }
            deliverRequest(req: WuiRequestMsg): unit {
                switch (req.tag) {
                    case "panelviewClick": {
                        const pane = this.panesMap.get(req.pane)
                        if (pane === undefined) {
                            throw new Error("Unknown pane.")
                        }
                        let visible = pane.visible.read()
                        visible = !visible
                        pane.visible.write(visible)
                        break
                    }
                    default:
                        throw new Error("Unexpected callback.")
                }
            }
            collectResponses(responses: WuiResponseMsg[]): unit {
                collectRspObj(responses, rspObj_init)
                for (const [_, p] of this.panesMap) {
                    p.view.collectResponses(responses)
                }
                collectRspObj(responses, rspObj)
            }

            addPane<V extends View<U>>(paneName: string, defn: (_: ViewCtx) => V, visibleToggle?: PortRw<boolean>): V {
                if (visibleToggle === undefined) {
                    visibleToggle = wui.x.state(`PaneVisible2_${name}_${paneName}`, true).rw()
                }
                const visibleToggle2 = visibleToggle

                const visibleAnd = wui.x.compute<boolean>(null, true, () => {
                    const value = viewCtx.visible.read() && visibleToggle2.read()
                    return value
                })

                const paneViewNum = wui.allocViewNum()
                const paneViewCtx: ViewCtx = {
                    viewNum: paneViewNum,
                    visible: visibleAnd.r()
                }
                const view = defn(paneViewCtx)
                this.children.push(view)
                this.panesMap.set(paneName, { name: paneName, view: view.impl, visible: visibleToggle })
                wui.x.effect(null, () => {
                    rspObj.setVisible.push({ tag: "panelviewSetVisible", viewNum: viewNum, pane: paneName, visible: visibleAnd.r().read() })
                })
                return view
            }
        }

        const panelView = new PanelViewImpl

        wui.registerViewImpl(panelView)
        return panelView
    }
}

//#endregion



//#region Tabbed View


export function ww_createTabdedView(wui: Wui) {

    return (viewCtx: ViewCtx): TabbedView<U> => {
        const viewNum = viewCtx.viewNum

        type TabInfo = {
            name: string
            view: ViewImpl
            visible: PortRw<boolean>
        }

        const rspObj_init = mkRspObj({
            init: [],
        })
        const rspObj = mkRspObj({
            addTab: [],
            setVisible: [],
        })

        wui.x.effect(null, () => {
            if (viewCtx.visible.read()) {
                // When the View becomes visible again, send the contents.
            }
        })

        class TabbedViewImpl implements TabbedView<U>, ViewImpl {
            impl: ViewImpl
            viewCtx = viewCtx
            children: View<U>[] = []
            cb: EditorViewCallback | null = null
            tabsMap: Map<string, TabInfo> = new Map
            constructor() {
                this.impl = this
            }
            init(): unit {
                // rspObj.init = [{ tag: "createTabbedView", viewNum: viewNum }]

                rspObj_init.init = [{ tag: "createTabbedView", viewNum }]
                rspObj.addTab = []
                for (const [name, t] of this.tabsMap) {
                    t.view.init()
                    const tab = { name: t.name, view: t.view.viewCtx.viewNum, visible: t.visible.read() }
                    rspObj.addTab.push({ tag: "tabbedView_addTab", viewNum, tab })
                    rspObj.setVisible.push({ tag: "tabbedView_setVisible", viewNum, tab: t.name, visible: t.visible.read() })
                }
            }
            deliverRequest(req: WuiRequestMsg): unit {
                switch (req.tag) {
                    case "tabbedViewClick": {
                        const tab = this.tabsMap.get(req.tab)
                        if (tab === undefined) {
                            throw new Error(`Unknown tab (${req.tab}).`)
                        }
                        let visible = tab.visible.read()
                        visible = !visible
                        tab.visible.write(visible)
                        break
                    }
                    default:
                        throw new Error(`Unexpected callback (${req.tag}).`)
                }
            }
            collectResponses(responses: WuiResponseMsg[]): unit {
                // collectRspObj(responses, rspObj_init)
                // collectRspObj(responses, rspObj)

                collectRspObj(responses, rspObj_init)
                for (const [_, t] of this.tabsMap) {
                    t.view.collectResponses(responses)
                }
                collectRspObj(responses, rspObj)
            }

            writablePorts = () => []
            callback(cb: EditorViewCallback): unit {
                assert.isTrue(this.cb === null)
                // If we permit a second call to callback,
                //   should it replace the first, or add to it?
                this.cb = cb
            }

            addTab<V extends View<U>>(tabName: string, defn: (_: ViewCtx) => V, visibleToggle?: PortRw<boolean>): V {
                if (visibleToggle === undefined) {
                    visibleToggle = wui.x.state(`TabVisible2_${tabName}`, true).rw()
                }
                const visibleToggle2 = visibleToggle

                const visibleAnd = wui.x.compute<boolean>(null, true, () => {
                    const value = viewCtx.visible.read() && visibleToggle2.read()
                    return value
                })

                const tabViewNum = wui.allocViewNum()
                const paneViewCtx: ViewCtx = {
                    viewNum: tabViewNum,
                    visible: visibleAnd.r()
                }
                const view = defn(paneViewCtx)
                this.children.push(view)
                this.tabsMap.set(tabName, { name: tabName, view: view.impl, visible: visibleToggle })
                wui.x.effect(null, () => {
                    rspObj.setVisible.push({ tag: "tabbedView_setVisible", viewNum, tab: tabName, visible: visibleAnd.r().read() })
                })
                return view
            }

        }

        const view = new TabbedViewImpl
        wui.registerViewImpl(view)
        return view

    }
}



//#endregion



//#region Annotated Text


// --- Clickable Text ---

// --- Annotated Text ---


// export function uiTextAnnot_find<A>(text: UiText<A>, pos: number): A | undefined {
//     if (typeof text === "string") {
//         return
//     }
//     // TODO ? A faster method of indexing ?
//     for (const [style, segment, annot] of text) {
//         if (pos < segment.length) {
//             return annot
//         }
//         pos -= segment.length
//     }
//     return
// }

// export function uiTextAnnot_stripAnnots<A>(text: UiText<A>): UiText {
//     if (typeof text === "string") {
//         return uiText(null, text)
//     }
//     return uiTextList(...text.map(([style, segment, annot]) => uiText(style, segment)))
// }

// export function uiText_stripStyles(text: UiText): string {
//     if (typeof text === "string") {
//         return text
//     }
//     return text.map(([style, segment]) => segment).join("")
// }

//#endregion
