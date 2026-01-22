import { UiStyle, UiStyleNum, UiText, UiTextId } from "./text.js"

export type ViewNum = number

export type WuiId = {
    id: string
}
export type Key = { key: string, altKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean }

export type Pane = { name: string, view: ViewNum, visible: boolean }
export type Tab = { name: string, view: ViewNum, visible: boolean }

export type WuiRequestMsg =
    | { tag: "init" }
    // | { tag: "ack" } // TODO ? Acknowledge receipt of a notification ? 
    // | { tag: "ack", seqId: number } // TODO ? Acknowledge receipt of a specific notification ? 
    // Text3 View
    | { tag: "textClick3", viewNum: ViewNum, annot: number | string }
    | { tag: "textSelection3", viewNum: ViewNum, from: number, to: number }
    // Text View
    | { tag: "editorClick", viewNum: ViewNum, pos: number }
    | { tag: "editorSelection", viewNum: ViewNum, from: number, to: number }
    | { tag: "editorChanged", viewNum: ViewNum, value: string }
    // List View
    | { tag: "selected", viewNum: ViewNum, row: number | null }
    | { tag: "down", viewNum: ViewNum }
    | { tag: "up", viewNum: ViewNum }
    // Table View
    | { tag: "tableViewClick", viewNum: ViewNum, row: number, col: number, pos: number }
    // Panel View
    | { tag: "panelviewClick", viewNum: ViewNum, pane: string }
    // Tabbed View
    | { tag: "tabbedViewClick", viewNum: ViewNum, tab: string }



export type WuiResponseMsg =
    | { tag: "reset" }
    | { tag: "setRootView", rootView: ViewNum }
    // Text3 View
    | { tag: "mkTextView", viewNum: ViewNum }
    | { tag: "textText", viewNum: ViewNum, text: UiText<number | string, UiTextId> }
    | { tag: "textPart", viewNum: ViewNum, id: number | string, value: UiText<number | string, UiTextId> }
    // Editor View
    | { tag: "mkEditor", viewNum: ViewNum }
    | { tag: "editorText", viewNum: ViewNum, text: string }
    | { tag: "editorHighlight", viewNum: ViewNum, from: number, to: number }
    // List View
    | { tag: "createListView", viewNum: ViewNum }
    | { tag: "listviewSetRows", viewNum: ViewNum, rows: string[] }
    | { tag: "listviewSelectRow", viewNum: ViewNum, row: number | null }
    // Table View
    | { tag: "createTableView", viewNum: ViewNum }
    | { tag: "tableViewSetHeadings", viewNum: ViewNum, headings: string[] }
    | { tag: "tableViewSetContents", viewNum: ViewNum, contents: UiText[][] }
    | { tag: "tableViewSelectRow", viewNum: ViewNum, row: number | null }
    // Panel View
    | { tag: "createPanelView", viewNum: ViewNum }
    | { tag: "panelView_addPane", viewNum: ViewNum, pane: Pane }
    | { tag: "panelviewSetVisible", viewNum: ViewNum, pane: string, visible: boolean }
    // Tabbed View
    | { tag: "createTabbedView", viewNum: ViewNum }
    | { tag: "tabbedView_addTab", viewNum: ViewNum, tab: Tab }
    | { tag: "tabbedView_setVisible", viewNum: ViewNum, tab: string, visible: boolean }
    // Style
    | { tag: "createStyle", styleNum: UiStyleNum, styleDefn: UiStyle, nameHint: string | null }


// TODO ? A type for the things which can be sent through an SSE event-stream ?
// export type WuiNotificationMsg =
// | { tag: "notify" }
// | { tag: "notify", seqId: number }


export type WuiRequestWrapper = {
    requests: WuiRequestMsg[],
}

export type WuiResponseWrapper = {
    serverId?: string,
    sessionId?: string,
    responses: WuiResponseMsg[],
}



