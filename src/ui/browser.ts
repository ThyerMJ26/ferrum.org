
/** This file contains:
 *    - A DOM based implementation of UiText
 *    - The client-side parts of the HTML implementation of the UI views.     
 *    - The HTTP-specific networking code to connect to the server.
 *  
 *  TODO ?
 *    - split this into HTTP-specific and HTTP-independent parts.
 *    - In principle, it should be possible to run the client-side parts of the UI views on the server.
 */


import { unit } from "../utils/unit.js";
import { assert } from "../utils/assert.js";
import { HtmlT, HtmlAttrs, HtmlTag, CssStyle } from "./html.js"
import { WuiResponseMsg, WuiRequestMsg, Pane, ViewNum, WuiRequestWrapper, WuiResponseWrapper, Tab } from "./protocol.js";
import { UiText, UiStyle, UiColor, UiStyleNum, UiTextId } from "./text.js";
import { App, ViewCtx as ui_ViewCtx } from "./app-ui.js";
import { setIo } from "../io/io.js";
import { mkIoBrowser } from "../io/io-browser.js";
import { AppIo, mkWui } from "./app-server.js";
import { mkReactive } from "./reactive.js";

//#region Html Css

type Html = HtmlT<HTMLElement>

function mkHtml<T extends HtmlTag>(
    [tag, attrs, ...children]: [T, HtmlAttrs, ...(Html | string | HTMLElement)[]]): HTMLElementTagNameMap[T] {
    const obj = document.createElement(tag);
    for (const [name, val] of Object.entries(attrs)) {
        obj.setAttribute(name, val);
    }
    for (const child of children) {
        if (child instanceof Array) {
            obj.append(mkHtml(child))
        }
        else {
            obj.append(child);
        }
    }
    return obj;
}


type CssName = string & { __brand_CssName: never }

let nextCssId = 1
function mkCss(nameHint: string, style: string): string {
    const id = `css${nextCssId++}_${nameHint}`
    let styleSheet = document.styleSheets[0]
    styleSheet.insertRule(`.${id} { ${style} }`, styleSheet.cssRules.length)
    return id
}
function mkCss2(nameHint: string, styleObj: { [_: string]: string }): string {
    const styleStr = Object.entries(styleObj).map(([key, val]) => `${key}: ${val}`).join(";\n")
    return mkCss(nameHint, styleStr)
}

// type CssStyle = { [K in keyof CSSStyleDeclaration]?: CSSStyleDeclaration[K] extends string ? CSSStyleDeclaration[K] : never }
function mkCss3(nameHint: string, styleObj: CssStyle): string {
    const id = `css${nextCssId++}_${nameHint}`
    let styleSheet = document.styleSheets[0]
    const ruleNum = styleSheet.cssRules.length
    styleSheet.insertRule(`.${id} { }`, ruleNum)
    const rule = styleSheet.cssRules[ruleNum] as CSSStyleRule
    // Object.assign(rule.style, styleObj)
    for (const k in styleObj) {
        const v = styleObj[k]
        if (v === undefined) {
            continue
        }
        rule.style[k] = v
    }
    return id
}

const uiStyleCssMap: Map<UiStyleNum, CssName> = new Map

// Ideally this would ensure all the colour names below are correct.
// Unfortuantely it evaluates to "string"
type CssColor = CSSStyleDeclaration["color"]

function bgColor(color: UiColor): CssColor {
    switch (color) {
        case "Black": return "lightgray"
        case "Red": return "pink"
        case "Green": return "lightgreen"
        case "Yellow": return "yellow"
        case "Blue": return "lightblue"
        case "Magenta": return "magenta"
        case "Cyan": return "lightcyan"
        case "White": return "white"
        default:
            assert.noMissingCases(color)
    }
}

function fgColor(color: UiColor): CssColor {
    switch (color) {
        case "Black": return "black"
        case "Red": return "red"
        case "Green": return "green"
        // case "Yellow": return "brown"
        case "Yellow": return "orange"
        // case "Yellow": return "#C09000"
        case "Blue": return "blue"
        case "Magenta": return "magenta"
        case "Cyan": return "cyan"
        case "White": return "darkgray"
        default:
            assert.noMissingCases(color)
    }
}

function mkUiStyle(num: UiStyleNum, s: UiStyle, nameHint: string | null): CssName {
    let style = ""

    // let family = "MyMono-regular"
    // let family = "sans-serif"
    let family = "monospace"
    // let family = "monospace, monospace"
    style += `font-size: 1rem;`

    // Using font-weight like this works: 
    //   -         with the default sans-serif font in Firefox and Epiphany
    //   - but not with the default sans-serif font in Chromium.
    // It seems there's no weight lighter than 400 available.
    // ( monospace seems to have a light-variant in Firefox, Chromium and Epiphany )
    // switch (s.weight) {
    //     case -1: style += "font-weight: 100;"; break
    //     case 0: style += "font-weight: 400;"; break
    //     case 1: style += "font-weight: 700;"; break
    // }
    // // Using an explicit font seems more reliable, but requires using external fonts
    // switch (s.weight) {
    //     case -1: family = "WuiFont-faint"; break
    //     case 0: family = "WuiFont-regular"; break
    //     case 1: family = "WuiFont-bold"; break
    // }
    // Alternatively, use opacity to achieve faintness (so as not to require external fonts)
    //   This also makes the strike-through appear faint, which looks better / more consistent.
    switch (s.weight) {
        case -1: style += "opacity: 0.5;"; break
        case 0: style += "font-weight: normal;"; break
        case 1: style += "font-weight: bold;"; break
    }

    if (family !== undefined) {
        style += `font-family: ${family};`
    }

    if (s.fg !== undefined) {
        style += `color: ${fgColor(s.fg)};`
    }
    if (s.bg !== undefined) {
        style += `background-color: ${bgColor(s.bg)};`
    }
    if (s.italic === 1) {
        style += "font-style: italic;"
    }
    let decor = []
    if (s.strike === 1) {
        decor.push("line-through")
    }
    if (s.under ?? 0 > 1) {
        decor.push("underline")
    }
    if (decor.length !== 0) {
        style += `text-decoration-line: ${decor.join(" ")}`
    }
    // if (ts.under === 2) {
    //     style += "text-decoration-style: double;"
    // }

    let nameHint2 = `${num}`
    if (nameHint !== null) {
        nameHint2 += `_${nameHint}`
    }
    const css = mkCss(nameHint2, style) as CssName
    uiStyleCssMap.set(num, css)
    return css
}

function textStyleToCss(ts: UiStyleNum): string {
    const css = uiStyleCssMap.get(ts)
    assert.isTrue(css !== undefined, "Unexpected unknown style")
    return css
}

function textToHtml<A, I extends UiTextId>(text: UiText<A, I>, cls?: string, annots: Map<HTMLSpanElement, A> | null = null, ids: Map<I, HTMLSpanElement> | null = null): HTMLElement {
    const attrs: { [_: string]: string } = cls === undefined ? {} : { class: cls }
    if (typeof text === "string") {
        return mkHtml(["span", attrs, text])
    }
    else {
        const result = mkHtml(["span", {}])
        if (text.style !== undefined) {
            assert.isTrue(typeof text.style === "number", "TODO: Handle UiStyle objects")
            result.setAttribute("class", textStyleToCss(text.style))
        }
        if (text.annot !== undefined && annots !== null) {
            annots.set(result, text.annot)
        }
        if (text.id !== undefined && ids !== null) {
            ids.set(text.id, result)
        }
        if (text.items !== undefined) {
            for (const item of text.items) {
                result.append(textToHtml(item, cls, annots, ids))
            }
        }

        return result
    }
}

//#endregion



//#region API

type Client = {
    notify(): unit
}

export function mkClient(exchangeMsgs: ExchangeMsgs, topDiv: string): Client {

    const session: Session = {
        topDiv,
        sendMsg: sendMsgDirect,
        views: new Map,
        sessionViews: mkSessionViews(),
    }

    function sendMsgDirect(reqMsg: WuiRequestMsg): unit {
        const respMsgs: WuiResponseMsg[] = []
        exchangeMsgs([reqMsg], respMsgs)
        handleResponse(respMsgs, session)
    }
    sendMsgDirect({ tag: "init" })

    function notify(): unit {
        const respMsgs: WuiResponseMsg[] = []
        exchangeMsgs([], respMsgs)
        handleResponse(respMsgs, session)
    }

    return { notify }
}


export function initApp(app: App, args: string[], topDiv: string, vfsRoot?: string) {


    topDiv ??= "topDiv"
    vfsRoot ??= "/"

    // TODO It might be desirable for apps to have app-specific vfs roots.
    // TODO For now though "setIo", must be called once with a single root for every app.
    // TODO ? Long-term, don't use a global io variable. Plumb though an app-specific io everywhere it's needed. ?
    // setIo(mkIoBrowser(new URL(vfsRoot, window.location.href)))

    const srcDir = ""
    const store = new Map
    const appIo: AppIo = {
        console_log: (...msgs) => { console.log(...msgs) },
        readPersistentFile() { return },
        writePersistentFile() { /* no-op */ },
    }
    const rctv = mkReactive(store, (...msgs) => { console.log(...msgs) }, notify)
    const wui = mkWui(new Map, rctv, appIo)

    function exchangeMsgs(reqMsgs: WuiRequestMsg[], respMsgs: WuiResponseMsg[]): unit {
        wui.exchangeMsgs(reqMsgs, respMsgs)
    }

    function notify(): unit {
        (client).notify()
    }

    const viewNum = wui.allocViewNum()
    const viewCtx: ui_ViewCtx = { viewNum, visible: wui.x.state<boolean>(null, true).r() }
    app.mk(wui, viewCtx, args, appIo)

    wui.initApp(viewNum)
    const client = mkClient(exchangeMsgs, topDiv)
    // const server = mkServer(notify)

}






//#endregion



//#region Protocol

// --- Server request + response communication ---

const sessionViews_schema = {
    textViews:   /**/ (_: TextView) => null,
    editorViews: /**/ (_: EditorView) => null,
    listviews:   /**/ (_: ListView) => null,
    tableviews:  /**/ (_: TableView) => null,
    panelviews:  /**/ (_: PanelView) => null,
    tabbedViews: /**/ (_: TabbedView) => null,
} as const

type SessionViews = {
    [K in keyof typeof sessionViews_schema]: Map<ViewNum, (typeof sessionViews_schema)[K] extends (_: infer T) => null ? T : never>
}

function mkSessionViews(): SessionViews {
    const result = Object.fromEntries(Object.entries(sessionViews_schema).map(
        ([name, _]) => [name, new Map]
    ))
    return result as SessionViews
}

type Session = {
    topDiv: string
    views: Map<ViewNum, View>
    sendMsg: SendMsg
    sessionViews: SessionViews
}


// TODO ? Enable multiple http-based apps to run concurrently ?
// TODO ? The state below needs to be collected together into a http-specific session type.

// TODO Ensure there's no more than one serverCall in progress at any time, 
// TODO   so as to ensure event are sequenced consistently on both client and server.
let reqMsgInProgress = false
const reqMsgQueue: WuiRequestMsg[] = []
let notificationWaiting = false
let eventSource: EventSource | null = null

type SendMsg = (req: WuiRequestMsg) => unit

type ExchangeMsgs = (reqMsgs: WuiRequestMsg[], respMsgs: WuiResponseMsg[]) => unit

export function initHttp() {

    const topDiv = "topDiv"
    const session: Session = {
        topDiv,
        sendMsg: sendMsgHttp,
        views: new Map,
        sessionViews: mkSessionViews(),
    }

    function sendMsgHttp(req: WuiRequestMsg): unit {
        console.log(`Sending msg: ${JSON.stringify(req)}`)
        reqMsgQueue.push(req)
        const topDiv = "topDiv"
        exchangeMsgsHttp(null, session)
    }

    sendMsgHttp({ tag: "init" })


    // All Wui response messages arrive via the exchangeMsgs "POST" request,
    //   no Wui response messages are sent over the event-stream, only notifications.
    // To avoid handling messages out of order, 
    //   it is simplest to have them all delivered over the same route.
    // We could require all response messages to arrive over the event-stream 
    //   (it would be more efficient for spontaneous updates, but not for synchronous updates),
    //   but sticking with the exchangeMsgs "POST" request approach is good enough for now.
}

export function initApp2(topDivId: string, appInstanceName: string, app: App, args: string[]) {
    return initApp(app, args, topDivId)
}


let serverId = "unknown"
let sessionId = "new"

const postUrl = new URL(window.location.href)
const sseUrl = new URL(window.location.href)
sseUrl.searchParams.set("event-stream", "")

function setServerSession(newServerId: string, newSessionId: string): unit {
    serverId = newServerId
    sessionId = newSessionId
    postUrl.searchParams.set("serverId", serverId)
    postUrl.searchParams.set("sessionId", sessionId)
    sseUrl.searchParams.set("serverId", serverId)
    sseUrl.searchParams.set("sessionId", sessionId)
}
setServerSession(serverId, sessionId)


function exchangeMsgsHttp(appInstanceName: string | null, session: Session) {
    if (reqMsgInProgress) {
        return
    }
    reqMsgInProgress = true
    notificationWaiting = false
    const method = "POST";
    const headers = { "Content-Type": "application/json" }
    const wuiRequest: WuiRequestWrapper = {
        // appInstanceName: null, 
        requests: reqMsgQueue
    }
    const body = JSON.stringify(wuiRequest)
    reqMsgQueue.length = 0
    fetch(postUrl, { method, headers, body }).then(httpResp => {
        if (httpResp.status !== 200) {
            console.error(`Fetch: unexpected response ${httpResp.status} ${httpResp.statusText}`)
            return
        }
        httpResp.json().then(rsp => {
            const response: WuiResponseWrapper = rsp

            if (response.serverId !== undefined && response.sessionId !== undefined) {
                setServerSession(response.serverId, response.sessionId)
                // Initiate the event-stream request here, using the newly available sessionId ?
                if (eventSource === null) {
                    eventSource = new EventSource(sseUrl)
                    eventSource.addEventListener("message", () => {
                        notificationWaiting = true
                        exchangeMsgsHttp(appInstanceName, session)
                    })
                }
            }

            handleResponse(response.responses, session)
            // Setting a value on a textarea can trigger a selection change event,
            //   which in turn can cause a new value to be set on the textarea. 
            //   This can result in an endless cycle of updates.
            // The code below doesn't solve that,
            //   but checking if a selection has actually changed does.
            // if (reqMsgQueue.length !== numUserInitiatedReqMsgs) {
            //     assert.isTrue(reqMsgQueue.length > numUserInitiatedReqMsgs)
            //     // If the number of req msgs has grown while processing the responses,
            //     //   then, these non-user initiated requests are to be discarded. 
            //     // This can happen when the Text View received a setText response, 
            //     //   this can trigger an erroneous selectionchange request.
            //     console.log(`Discarding non-user initiated req msgs: ${reqMsgQueue.length - numUserInitiatedReqMsgs} = (${reqMsgQueue.length} - ${numUserInitiatedReqMsgs})`)
            //     reqMsgQueue.length = numUserInitiatedReqMsgs
            // }
            reqMsgInProgress = false
            if (reqMsgQueue.length !== 0 || notificationWaiting) {
                exchangeMsgsHttp(appInstanceName, session)
            }
        })
    })
}

function registerView2<V extends View>(session: Session, registry: Map<ViewNum, V>, view: V): undefined {
    assert.isTrue(registry.get(view.viewNum) === undefined)
    registry.set(view.viewNum, view)
    session.views.set(view.viewNum, view)
}

function registerView4<V extends keyof SessionViews>(
    session: Session,
    v: V,
    view: SessionViews[V] extends Map<ViewNum, infer V extends View> ? V : never
): undefined {
    const registry = session.sessionViews![v] as Map<ViewNum, View>
    assert.isTrue(registry.get(view.viewNum) === undefined)
    registry.set(view.viewNum, view)
    session.views.set(view.viewNum, view)
}

function getView2<V extends View>(registry: Map<ViewNum, V>, viewNum: ViewNum): V {
    const view = registry.get(viewNum)
    assert.isTrue(view !== undefined)
    return view
}

function getView4<V extends keyof SessionViews>(session: Session, v: V, viewNum: ViewNum):
    SessionViews[V] extends Map<ViewNum, infer V extends View> ? V : never //
{
    type R = SessionViews[V] extends Map<ViewNum, infer V extends View> ? V : never
    const view = session.sessionViews![v].get(viewNum)!
    assert.isTrue(view !== undefined)
    return view as R
}


async function asyncYield() {
    return new Promise(resolve => setTimeout(resolve, 1));
}

export function handleResponse(responseList: WuiResponseMsg[], session: Session) {
    const { topDiv, sendMsg } = session
    console.log(`Response Number: ${responseList.length}`)
    for (let r of responseList) {
        try {
            console.log(`Response ${JSON.stringify(r).slice(0, 40)}`)
            switch (r.tag) {
                case "reset": {
                    clearAllViews(session, topDiv)
                    break
                }
                case "setRootView":
                    setRootView(session, r.rootView, topDiv)
                    break

                // Text3 View
                case "mkTextView": {
                    const view = createTextView({ session, sendMsg, viewNum: r.viewNum })
                    registerView4(session, "textViews", view)
                    break
                }
                case "textText": {
                    getView4(session, "textViews", r.viewNum)!.setText(r.text)
                    break
                }
                case "textPart":
                    getView4(session, "textViews", r.viewNum)!.setPart(r.id, r.value)
                    break

                // Editor View
                case "mkEditor": {
                    registerView4(session, "editorViews", createEditorView({ session, sendMsg, viewNum: r.viewNum }))
                    break
                }
                case "editorText": {
                    getView4(session, "editorViews", r.viewNum).setText(r.text)
                    break
                }
                case "editorHighlight": {
                    getView4(session, "editorViews", r.viewNum).setHighlight(r.from, r.to)
                    break
                }

                // List View
                case "createListView": {
                    registerView4(session, "listviews", createListView({ session, sendMsg, viewNum: r.viewNum }))
                    break
                }
                case "listviewSetRows": {
                    getView4(session, "listviews", r.viewNum).setRows(r.rows)
                    break
                }
                case "listviewSelectRow": {
                    getView4(session, "listviews", r.viewNum).setSelectedRow(r.row)
                    break
                }

                // Table View
                case "createTableView": {
                    registerView4(session, "tableviews", createTableView({ session, sendMsg, viewNum: r.viewNum }))
                    break
                }
                case "tableViewSetHeadings":
                case "tableViewSetContents":
                case "tableViewSelectRow": {
                    getView4(session, "tableviews", r.viewNum).recvMsg(r)
                    break
                }

                // Panel View
                case "createPanelView": {
                    registerView4(session, "panelviews", createPanelView({ session, sendMsg, viewNum: r.viewNum }))
                    break
                }
                case "panelView_addPane": {
                    getView4(session, "panelviews", r.viewNum).addPane(r.pane)
                    break
                }
                case "panelviewSetVisible": {
                    getView4(session, "panelviews", r.viewNum).setVisible(r.pane, r.visible)
                    break
                }

                // Tabbed View
                case "createTabbedView":
                    registerView4(session, "tabbedViews", createTabbedView({ session, sendMsg, viewNum: r.viewNum }))
                    break
                case "tabbedView_addTab":
                    getView4(session, "tabbedViews", r.viewNum).addTab(r.tab)
                    break
                case "tabbedView_setVisible":
                    getView4(session, "tabbedViews", r.viewNum).setVisible(r.tab, r.visible)
                    break

                // Main Page
                case "createStyle": {
                    mkUiStyle(r.styleNum, r.styleDefn, r.nameHint)
                    break
                }
                default:
                    assert.noMissingCases(r)
                // console.log(`TODO: handleResponse $ {r.tag}`)
            }

            // For diagnostic purposes,
            //   this yields to the browser, so that the effects of DOM changes can be seen.
            // It's more informative (when things go wrong) to yield,
            //   but more efficient not to.
            // await new Promise(resolve => setTimeout(resolve, 1));
            // await asyncYield()
        }
        catch (exc) {
            // console.error(`handleResponse: exception: ${JSON.stringify(exc)}`)
            console.error(`handleResponse: exception: ${exc}`)
        }
    }
}

//#endregion



//#region Registration

// --- View registration ---

interface View {
    viewNum: ViewNum
    root: HTMLElement
}

//#endregion




//#region Generic
// --- Generic View-supporting code ---



function ensureVisible(elem: HTMLElement, syncScroll: HTMLElement[]) {
    const scrollAncestor = elem.offsetParent
    if (scrollAncestor === null || !(scrollAncestor instanceof HTMLElement)) {
        // throw Error(`No scroll ancestor found ${r.viewNum}, ${elem}`)
        // This fires sometimes, possibly only when the containing "div" is hidden
        // console.error(`No scroll ancestor found ${viewNum}, ${elem}`)
        // console.error(`No scroll ancestor found $ {viewNum}, ${elem}`, elem)
        return
    }
    // TODO ? What if the scrollAncestor also has a scrollAncestor ?
    // TODO ? Perhaps "ensureVisible" should invoke itself recursively up the DOM tree. ?


    // Vertical 
    const scrollTopMax = elem.offsetTop
    const scrollTopMin = elem.offsetTop + elem.offsetHeight - scrollAncestor.offsetHeight
    scrollAncestor.scrollTop = Math.max(scrollTopMin, Math.min(scrollTopMax, scrollAncestor.scrollTop))

    // Horizontal
    const elemFits_withoutPanning = elem.offsetLeft + elem.offsetWidth < scrollAncestor.offsetWidth
    const elemFits_atAll = elem.offsetWidth < scrollAncestor.offsetWidth
    // if (elem.offsetLeft + elem.offsetWidth < scrollAncestor.offsetWidth) {
    if (elemFits_withoutPanning) {
        // if the elem can be visible without panning, then keep the view left
        scrollAncestor.scrollLeft = 0
    }
    else if (scrollAncestor.scrollLeft > elem.offsetLeft) {
        // scroll left, if needed, just far enough to see the left side of the elem
        scrollAncestor.scrollLeft = elem.offsetLeft
    }
    else if (scrollAncestor.scrollLeft + scrollAncestor.offsetWidth < elem.offsetLeft + elem.offsetWidth) {
        // scroll right, if needed
        if (elemFits_atAll) {
            // just far enough to see the whole element
            scrollAncestor.scrollLeft = elem.offsetLeft + elem.offsetWidth - scrollAncestor.offsetWidth
        }
        else {
            // or, if the element cannot be fully shown, scroll right a bit less, prioritizing seeing the left side
            scrollAncestor.scrollLeft = elem.offsetLeft
        }
    }

    // Sync 
    for (let syncElem of syncScroll) {
        syncElem.scrollTop = scrollAncestor.scrollTop
        syncElem.scrollLeft = scrollAncestor.scrollLeft
    }

}

// const ensureVisible_verticalBelow = (elem: HTMLElement, below: HTMLElement | null) => {
//     const scrollAncestor = elem.offsetParent
//     if (scrollAncestor === null || !(scrollAncestor instanceof HTMLElement)) {
//         return
//     }
//     const elemBound = elem.getBoundingClientRect()
//     const scrollBound = scrollAncestor.getBoundingClientRect()
//     const belowBound_bottom = below?.getBoundingClientRect().bottom ?? scrollBound.top
//     const below_offsetHeight = below === null ? 0 : below.offsetHeight

//     if (elemBound.top < belowBound_bottom) {
//         scrollAncestor.scrollTop = elem.offsetTop - below_offsetHeight
//     }
//     if (elemBound.bottom > scrollBound.bottom) {
//         scrollAncestor.scrollTop = elem.offsetTop + elem.offsetHeight - (scrollAncestor.offsetHeight - below_offsetHeight)
//     }
// }

function ensureVisible_verticalBelow(elem: HTMLElement, below: HTMLElement | null) {
    const scrollAncestor = elem.offsetParent
    if (scrollAncestor === null || !(scrollAncestor instanceof HTMLElement)) {
        return
    }
    const below_offsetHeight = below === null ? 0 : below.offsetHeight

    const scrollTopMax = elem.offsetTop - below_offsetHeight
    const scrollTopMin = elem.offsetTop + elem.offsetHeight - (scrollAncestor.offsetHeight - below_offsetHeight)

    scrollAncestor.scrollTop = Math.max(scrollTopMin, Math.min(scrollTopMax, scrollAncestor.scrollTop))
}


type CaretPosition = {
    offsetNode: Node
    offset: number
}

function caretPositionFromPoint(x: number, y: number): CaretPosition | null {
    const doc = document as any
    if (doc.caretPositionFromPoint !== undefined) {
        // Gecko (Firefox) / W3C
        return doc.caretPositionFromPoint(x, y)
    }
    else if (doc.caretRangeFromPoint !== undefined) {
        // Blink (Chromium) / WebKit (Ephiphany)
        const range = doc.caretRangeFromPoint(x, y)
        if (range === null) {
            return null
        }
        return { offsetNode: range.startContainer, offset: range.startOffset }
    }
    return null
}

type ViewCtx = {
    session: Session
    viewNum: ViewNum
    sendMsg: SendMsg
}

//#endregion



//#region Text View

interface TextView extends View {
    setText(text: UiText<any, UiTextId>): unit
    setPart(id: number | string, value: UiText<number | string, UiTextId>): unit
}

function createTextView(viewCtx: ViewCtx): TextView {
    const view = new TextViewImpl(viewCtx)
    return view
}

class TextViewImpl implements TextView {

    viewNum: ViewNum
    root: HTMLDivElement
    textDiv: HTMLDivElement
    annots: Map<HTMLSpanElement, number | string> = new Map
    ids: Map<number | string, HTMLSpanElement> = new Map

    static css_text = mkCss("tv_div1", [
        "position: absolute;",
        "overflow-x: scroll;",
        "overflow-y: scroll;",
        "white-space: pre;",
        "width: 100%;",
        "height: 100%;",
        "font-size: 1rem;",
        "line-height: 1.3rem;",
        "font-family: monospace;",
        "margin: 0;",
        "border: 0;",
        "padding: 0;",
    ].join("\n"))

    static css_scroll = mkCss("tv_scroll", [
        "position: relative;",
        "overflow: clip;",
        "width: 100%;",
        "height: 100%;",
    ].join("\n"))

    constructor(viewCtx: ViewCtx) {
        this.viewNum = viewCtx.viewNum
        this.textDiv = mkHtml(["div", { class: TextViewImpl.css_text }])
        this.root = mkHtml(["div", { class: TextViewImpl.css_scroll }, this.textDiv])

        this.textDiv.addEventListener("click", (evt) => {
            let annot
            if (evt.target !== null && evt.target instanceof HTMLSpanElement) {
                let target: HTMLElement | null = evt.target
                annot = this.annots.get(evt.target)
                while (annot === undefined && target instanceof HTMLSpanElement) {
                    annot = this.annots.get(target)
                    target = target.parentElement
                }
            }
            if (annot !== undefined) {
                viewCtx.sendMsg({ tag: "textClick3", viewNum: viewCtx.viewNum, annot: annot ?? null })
            }
        })
    }

    setText(text: UiText<any>): unit {
        this.annots.clear()
        const span = textToHtml(text, undefined, this.annots, this.ids)
        this.textDiv.replaceChildren(span)
    }

    setPart(id: number | string, value: UiText<number | string>): unit {
        const oldSpan = this.ids.get(id)
        const span = textToHtml(value, undefined, this.annots, this.ids)
        this.ids.set(id, span)
        if (oldSpan !== undefined) {
            oldSpan.replaceWith(span)
        }
    }
}

//#endregion



//#region Editor View


interface EditorView extends View {
    setText(text: string): unit
    setHighlight(from: number, to: number): unit
}

function createEditorView(viewCtx: ViewCtx): EditorView {
    const view = new EditorViewImpl(viewCtx)
    return view
}

class EditorViewImpl implements EditorView {

    viewNum: ViewNum
    root: HTMLDivElement

    textarea: HTMLTextAreaElement
    highlight: HTMLDivElement

    selectionStart: number = 0
    selectionEnd: number = 0
    // selectionDirection: "none" | "forward" | "backward" = "none"


    static css_textarea = mkCss("tv_textarea", [
        "z-index: 1;",
        "position: absolute;",
        "resize: none;",
        "width: 100%;",
        "height: 100%;",
        // "opacity: 0.5;",
        "background: transparent;",
        "font-size: 1rem;",
        "line-height: 1.3rem;",
        "font-family: monospace;",
        "color: blue;",
        "margin: 0;",
        "border: 0;",
        "padding: 0;",
    ].join("\n"))

    static css_div1 = mkCss("tv_div1", [
        "z-index: 0;",
        "position: absolute;",
        "overflow-x: scroll;",
        "overflow-y: scroll;",
        "white-space: pre;",
        "width: 100%;",
        "height: 100%;",
        "font-size: 1rem;",
        "line-height: 1.3rem;",
        "font-family: monospace;",
        "color: red;",
        "margin: 0;",
        "border: 0;",
        "padding: 0;",
    ].join("\n"))

    static css_highlight = mkCss("tv_highlight", [
        "position: relative;",
        "overflow: clip;",
        "width: 100%;",
        "height: 100%;",
    ].join("\n"))

    constructor(viewCtx: ViewCtx) {
        this.viewNum = viewCtx.viewNum

        this.textarea = mkHtml(["textarea", {
            "wrap": "off",
            "readonly": "",
            "class": EditorViewImpl.css_textarea,
        }])

        this.highlight = mkHtml(["div", { class: EditorViewImpl.css_div1 }])

        const textareaHighlight = mkHtml(["div", { class: EditorViewImpl.css_highlight }])

        textareaHighlight.append(this.textarea, this.highlight)
        this.root = textareaHighlight

        this.textarea.addEventListener("scroll", () => {
            this.highlight.scrollTop = this.textarea.scrollTop
            this.highlight.scrollLeft = this.textarea.scrollLeft
        })

        this.textarea.addEventListener("click", (evt) => {
            const { selectionStart, selectionEnd, selectionDirection } = this.textarea
            if (selectionStart !== selectionEnd) {
                // This is a selection, not a click.
                return
            }
            viewCtx.sendMsg({ tag: "editorClick", viewNum: viewCtx.viewNum, pos: selectionStart })
        })

        this.textarea.addEventListener("selectionchange", (evt) => {
            const { selectionStart, selectionEnd, selectionDirection } = this.textarea
            if (selectionStart === this.selectionStart && selectionEnd === this.selectionEnd) {
                // ignore the change if there isn't actually a change
                return
            }
            this.selectionStart = selectionStart
            this.selectionEnd = selectionEnd
            if (selectionStart === selectionEnd) {
                // This is a click, not a selection.
                return
            }
            viewCtx.sendMsg({ tag: "editorSelection", viewNum: viewCtx.viewNum, from: selectionStart, to: selectionEnd })
        })
    }

    setText(text: string): unit {
        // save the selection range
        const { selectionStart, selectionEnd, selectionDirection } = this.textarea
        this.textarea.value = text + "\n"
        // restore the selection range, (otherwise the selection gets moved to the end.)
        this.textarea.setSelectionRange(selectionStart, selectionEnd, selectionDirection)
        this.highlight.replaceChildren()
    }

    static css_bg_highlight = mkCss("tv_bg_highlight", "background-color: lightblue;")

    setHighlight(from: number, to: number): unit {

        const text = this.textarea.value
        const textBefore = text.slice(0, from)
        const textHigh = text.slice(from, to)
        const textAfter = text.slice(to)

        const elemHigh = mkHtml(["span", { class: EditorViewImpl.css_bg_highlight }])

        elemHigh.replaceChildren(textHigh)
        this.highlight.replaceChildren(textBefore, elemHigh, textAfter, "\n")
        ensureVisible(elemHigh, [this.textarea])
    }
    // TODO move the "textareaHighlight" implementation code from "handleResponse" to here

    // TODO switch to using style classes rather than style attributes

}

//#endregion



//#region List View

interface ListView extends View {
    setRows: (rows: string[]) => unit
    setSelectedRow: (selectedRow: number | null) => unit
}

function createListView(viewCtx: ViewCtx): ListView {
    const listView = new ListViewImpl(viewCtx)
    return listView
}

class ListViewImpl implements ListView {

    viewCtx: ViewCtx
    viewNum: ViewNum
    root: HTMLDivElement

    rowSelected: number | null = null
    rowElems: HTMLElement[] = []
    list1: HTMLDivElement
    list2: HTMLDivElement
    scroll1: HTMLDivElement
    scroll2: HTMLDivElement

    static css_list1 = mkCss3("lv_list1", {
        display: "grid",
        gridTemplateColumns: "auto",
        gridAutoRows: "auto",
        gridGap: "1px",
        border: "1px solid black",
    })

    static css_list2 = mkCss2("lv_list2", {
        width: "100%", height: "100%"
    })

    static css_scroll1 = mkCss2("lv_scroll1", {
        position: "absolute",
        overflow: "scroll",
        width: "100%",
        height: "100%",
    })

    static css_scroll2 = mkCss2("lv_scroll2", {
        display: "block",
        position: "relative",
        // overflow: "clip",
        width: "100%",
        height: "100%",
        border: "1px solid black",
    })

    constructor(viewCtx: ViewCtx) {

        this.viewCtx = viewCtx
        this.viewNum = viewCtx.viewNum


        this.list1 = mkHtml(["div", { class: ListViewImpl.css_list1, tabIndex: "0" }])

        this.list2 = mkHtml(["div", { class: ListViewImpl.css_list2 }])
        this.list2.append(this.list1)

        this.scroll1 = mkHtml(["div", { class: ListViewImpl.css_scroll1 }])
        this.scroll1.append(this.list2)

        this.scroll2 = mkHtml(["div", { class: ListViewImpl.css_scroll2 }])
        this.scroll2.append(this.scroll1)

        this.list2.addEventListener("keydown", (ev) => {
            switch (ev.key) {
                case "ArrowUp":
                    ev.preventDefault()
                    viewCtx.sendMsg({ tag: "up", viewNum: viewCtx.viewNum })
                    break
                case "ArrowDown":
                    ev.preventDefault()
                    viewCtx.sendMsg({ tag: "down", viewNum: viewCtx.viewNum })
                    break
                default:
                // do nothing
            }
        })

        this.root = this.scroll2
    }

    setRowBackground(row: number | null, color: string): unit {
        if (row === null) {
            return
        }
        const elem = this.rowElems.at(row)
        if (elem === undefined) {
            // throw new Error("impossible?")
            // this can happen if the app changed the rows but not the selection
            return
        }
        elem.style.background = color
    }
    ensureVisibleSelectedRow(): unit {
        if (this.rowSelected === null) {
            return
        }
        const elem = this.rowElems.at(this.rowSelected)
        if (elem === undefined) {
            // throw new Error("impossible?")
            // this can happen if the app changed the rows but not the selection
            return
        }
        ensureVisible(elem, [])
    }

    static background_plain = "white"
    static background_highlight = "lightblue"
    static mkRowStyle = (nameHint: string, bg: string) => mkCss(`rowStyle_${nameHint}`, `background: ${bg}; white-space: pre; font-family: monospace; font-size: 1rem;`)
    static rowCss_plain = ListViewImpl.mkRowStyle("plain", ListViewImpl.background_plain)
    static rowCss_highlight = ListViewImpl.mkRowStyle("highlight", ListViewImpl.background_highlight)

    setRows(rows: string[]): unit {
        this.rowElems.length = 0
        for (const r of rows) {
            const rNum = this.rowElems.length
            let bg = rNum === this.rowSelected ? ListViewImpl.rowCss_highlight : ListViewImpl.rowCss_plain
            const h = mkHtml(["div", { class: bg }])
            h.innerText = r
            const viewNum = this.viewNum
            h.addEventListener("click", () => {
                let rowClicked = rNum
                this.viewCtx.sendMsg({ tag: "selected", viewNum, row: rowClicked })
            })
            this.rowElems.push(h)
            if (this.rowElems.length > 10000) {
                console.error("Too many rows in list.")
                break
            }
        }
        this.list1.replaceChildren(...this.rowElems)
        this.ensureVisibleSelectedRow()
    }
    setSelectedRow(selectedRow: number | null): unit {
        this.setRowBackground(this.rowSelected, "white")
        this.rowSelected = selectedRow
        this.setRowBackground(this.rowSelected, "lightblue")
        this.ensureVisibleSelectedRow()
    }
}

//#endregion



//#region Table View


interface TableView extends View {
    // setRows: (rows: string[]) => unit
    // setSelectedRow: (selectedRow: number | null) => unit
    recvMsg(msg: WuiResponseMsg): unit
}

function createTableView(viewCtx: ViewCtx): TableView {
    const tableView = new TableViewImpl(viewCtx)
    return tableView
}

class TableViewImpl implements TableView {

    viewNum: ViewNum
    root: HTMLDivElement

    headings: string[] = []
    contents: UiText[][] = []
    rowSelected: number | null = null
    headingElems: HTMLElement[] = []
    contentElems: HTMLElement[][] = []
    cellData: Map<EventTarget, { row: number, col: number }> = new Map

    list1: HTMLDivElement

    static css_list1 = mkCss3("tbv_list1", {
        display: "grid",
        gridTemplateColumns: "auto",
        gridAutoRows: "auto",
        gridGap: "1px",
        border: "1px solid black",
    })

    static css_scrollInner = mkCss2("tbv_scrollInner", {
        position: "absolute",
        overflow: "scroll",
        width: "100%",
        height: "100%",
    })

    static css_scrollOuter = mkCss2("tbv_scrollOuter", {
        display: "block",
        position: "relative",
        // overflow: "clip",
        width: "100%",
        height: "100%",
        border: "1px solid black",
    })

    static css_header = mkCss3("tbv_header", {
        position: "sticky",
        top: "0",
        fontWeight: "bold",
        background: "lightgrey",
    })

    constructor(viewCtx: ViewCtx) {

        this.viewNum = viewCtx.viewNum

        this.list1 = mkHtml(
            ["div", { class: TableViewImpl.css_list1, tabIndex: "0" }])

        this.root = mkHtml(
            ["div", { class: TableViewImpl.css_scrollOuter },
                ["div", { class: TableViewImpl.css_scrollInner },
                    this.list1]])

        this.list1.addEventListener("keydown", (ev) => {
            switch (ev.key) {
                case "ArrowUp":
                    ev.preventDefault()
                    viewCtx.sendMsg({ tag: "up", viewNum: viewCtx.viewNum })
                    break
                case "ArrowDown":
                    ev.preventDefault()
                    viewCtx.sendMsg({ tag: "down", viewNum: viewCtx.viewNum })
                    break
                default:
                // do nothing
            }
        })

        this.list1.addEventListener("click", (event) => {
            if (!(event.target !== null && event.target instanceof HTMLElement)) {
                return
            }
            let target = event.target
            let nextTarget: HTMLElement | null = target

            // We either need to put all the cell child elements into the cellData map,
            // or check the parents of the clicked elements, as is done here:
            let cellData
            do {
                target = nextTarget
                cellData = this.cellData.get(target)
                nextTarget = target.parentElement
            } while (cellData === undefined && nextTarget !== null)

            if (cellData === undefined) {
                return
            }
            let cp = caretPositionFromPoint(event.pageX, event.pageY)
            // TODO account for any preceeding sibling spans when calculating the "pos"
            const pos = cp?.offset ?? -1
            viewCtx.sendMsg({ tag: "tableViewClick", viewNum: viewCtx.viewNum, row: cellData.row, col: cellData.col, pos })
        })

    }

    recvMsg(msg: WuiResponseMsg): unit {
        switch (msg.tag) {
            case "tableViewSetHeadings":
                this.setHeadings(msg.headings)
                break
            case "tableViewSetContents":
                this.setContents(msg.contents)
                break
            case "tableViewSelectRow":
                this.setSelectedRow(msg.row)
                break
            default:
                assert.impossible("Missing case?")
        }
    }

    setRowClass(row: number | null, cls: string, present: boolean) {
        if (row === null) {
            return
        }
        const rowElems = this.contentElems.at(row) ?? []
        for (const elem of rowElems) {
            if (elem === undefined) {
                // throw new Error("impossible?")
                // this can happen if the app changed the rows but not the selection
                return
            }
            if (present) {
                elem.classList.add(cls)
            }
            else {
                elem.classList.remove(cls)
            }
        }
    }
    ensureVisibleSelectedRow() {
        if (this.rowSelected === null) {
            return
        }
        const rowElems = this.contentElems.at(this.rowSelected) ?? []
        const elem = rowElems.at(0)
        if (elem === undefined) {
            // throw new Error("impossible?")
            // this can happen if the app changed the rows but not the selection
            return
        }
        const below = this.headingElems[0] ?? null
        ensureVisible_verticalBelow(elem, below)
    }

    static background_plain = "white"
    static background_highlight = "lightblue"
    static mkRowStyle = (nameHint: string, bg: string) => mkCss(`rowStyle_${nameHint}`, `background: ${bg}; white-space: pre; font-family: monospace; font-size: 1rem;`)
    // static mkRowStyle = (nameHint: string, bg: string) => mkCss(`rowStyle_${nameHint}`, `background: ${bg}; white-space: pre; padding-right: 1em;`)
    static rowCss_plain = TableViewImpl.mkRowStyle("plain", TableViewImpl.background_plain)
    static rowCss_highlight = TableViewImpl.mkRowStyle("highlight", TableViewImpl.background_highlight)

    // static cellCss = mkCss("cell", "white-space: pre; padding-right: 1em;")
    static cellCss = mkCss("cell", "white-space: pre; font-family: monospace;  font-size: 1rem; padding-right: 1em;")
    // static headingCss = mkCss("cell", "white-space: pre; padding-right: 1ch;")
    static headingCss = mkCss("cell", "white-space: pre; padding-right: 1em;")

    setHeadings(headings: string[]) {
        this.headings = headings
        this.updateHtml()
    }
    setContents(contents: UiText[][]) {
        this.contents = contents
        this.updateHtml()
    }
    updateHtml() {
        const This = TableViewImpl
        this.contentElems.length = 0
        this.cellData.clear()
        this.list1.style.gridTemplateColumns = this.headings.map(h => "minmax(auto, max-content)").join(" ")
        for (const row of this.contents) {
            const rNum = this.contentElems.length
            let bg = rNum === this.rowSelected ? This.rowCss_highlight : This.rowCss_plain
            const rowElems: HTMLElement[] = []
            for (let col = 0; col < this.headings.length; col++) {
                const h = textToHtml(row[col] ?? "")
                // const h = textToHtml(row[col], bg)
                // TODO use a css class for these styles
                // h.style.paddingRight = "1em"
                // h.style.whiteSpace = "pre"
                h.classList.add(This.cellCss)
                this.cellData.set(h, { row: rNum, col })
                rowElems.push(h)
            }
            this.contentElems.push(rowElems)
        }
        this.headingElems = this.headings.map(h => mkHtml(["span", { class: This.css_header }, h]))
        // TODO use a css class for this padding
        // this.headingElems.map(h => h.style.paddingRight = "1ch")
        this.headingElems.map(h => h.classList.add(This.headingCss))
        const newChildren = [...this.headingElems, ...this.contentElems.flat()]
        if (newChildren.length > 10000) {
            console.error("Too many entries in table.")
            newChildren.length = 10000

        }
        this.list1.replaceChildren(...newChildren)
        this.ensureVisibleSelectedRow()
    }
    setSelectedRow(selectedRow: number | null) {
        this.setRowClass(this.rowSelected, TableViewImpl.rowCss_plain, true)
        this.setRowClass(this.rowSelected, TableViewImpl.rowCss_highlight, false)
        this.rowSelected = selectedRow
        this.setRowClass(this.rowSelected, TableViewImpl.rowCss_plain, false)
        this.setRowClass(this.rowSelected, TableViewImpl.rowCss_highlight, true)
        this.ensureVisibleSelectedRow()
    }
}

//#endregion



//#region Panel View

interface PanelView extends View {
    viewNum: ViewNum
    root: HTMLElement
    setVisible: (pane: string, visible: boolean) => unit
    addPane(pane: Pane): unit
}

function createPanelView(viewCtx: ViewCtx): PanelView {
    const panelView = new PanelViewImpl(viewCtx)
    return panelView
}

class PanelViewImpl implements PanelView {

    viewCtx: ViewCtx
    viewNum: ViewNum
    root: HTMLElement
    flexDiv: HTMLElement

    paneElems: Map<string, HTMLElement> = new Map

    static css_hdr = mkCss2("pv_hdr", {
        "flex-grow": "0",
        "background-color": "lightgray",
        border: "1px solid black",
        width: "100%",
    })

    static css_content = mkCss2("pv_content", {
        display: "block",
        "flex-grow": "1",
        background: "white",
        width: "100%",
        height: "100%",
        overflow: "clip"
    })

    static css_div1 = mkCss2("pv_div1", {
        display: "block",
        position: "relative",
        overflow: "clip",
        border: "1px solid black",

    })
    static css_div2 = mkCss2("pv_div2", {
        display: "flex",
        "flex-direction": "column",
        width: "100%",
        height: "100%",

    })

    constructor(viewCtx: ViewCtx) {
        this.viewCtx = viewCtx
        this.viewNum = viewCtx.viewNum

        this.flexDiv = mkHtml(
            ["div", { class: PanelViewImpl.css_div2 }])

        this.root = mkHtml(
            ["div", { class: PanelViewImpl.css_div1 },
                this.flexDiv
            ]
        )
    }

    addPane(pane: Pane): unit {
        const p = pane
        let hdrElem = mkHtml(["div", { class: PanelViewImpl.css_hdr }, p.name])
        const visible = p.visible
        let paneDefn = getView2(this.viewCtx.session.views, p.view).root
        let contentElem = mkHtml(["div", { class: PanelViewImpl.css_content }, paneDefn])
        contentElem.style.display = visible ? "block" : "none"
        this.paneElems.set(p.name, contentElem)
        hdrElem.addEventListener("click", () => {
            this.viewCtx.sendMsg({ tag: "panelviewClick", viewNum: this.viewNum, pane: p.name })
        })
        this.flexDiv.appendChild(hdrElem)
        this.flexDiv.appendChild(contentElem)
    }

    setVisible(pane: string, visible: boolean): unit {
        const paneElem = this.paneElems.get(pane)
        if (paneElem === undefined) {
            throw new Error("Unknown pane.")
        }
        const display = visible ? "block" : "none"
        paneElem.style.display = display
    }

}



//#endregion



//#region Tabbed View

interface TabbedView extends View {
    viewNum: ViewNum
    root: HTMLElement
    setVisible: (tab: string, visible: boolean) => unit
    addTab(tab: Tab): unit
}

function createTabbedView(viewCtx: ViewCtx): TabbedView {
    const tabbedView = new TabbedViewImpl(viewCtx)
    return tabbedView
}

class TabbedViewImpl implements TabbedView {

    viewCtx: ViewCtx
    viewNum: ViewNum
    root: HTMLElement
    toggles: HTMLElement
    tabs: HTMLElement
    tabsMap: Map<string, HTMLElement> = new Map

    static css_page = mkCss("page",
        ["display: grid;"
            , "grid-template-areas:"
            , "    \"toggles tabs\";"
            , "grid-template-columns: auto 1fr;"
            , "grid-template-rows: auto;"
            , "border: 5px solid gray;"
            // , "border: 1px solid gray;"
            , "padding: 0px;"
            , "width: 100%;"
            , "height: 100%;"
        ].join("\n"))

    static css_toggles = mkCss("toggles",
        ["grid-area: toggles;"
            // , "// padding: 5px;"
            , "padding: 1px;"
            , "background-color: darkgray;"
            , "display: grid;"
            , "grid-auto-columns: auto;"
            , "grid-auto-rows: auto;"
            , "place-content: start;"
        ].join("\n"))

    static css_tabs = mkCss("tabs",
        ["grid-area: tabs;"
            // , "// padding: 5px;"
            , "padding: 1px;"
            , "background-color: lightgray;"
            , "display: grid;"
            // , "// grid-template-columns: auto;"
            , "grid-auto-columns: 1fr;"
            , "grid-auto-rows: auto;"
            , "grid-auto-flow: column;"
            , "justify-content: stretch;"
            , "align-content: stretch;"
        ].join("\n"))

    static css_tabHdr = mkCss("tabHdr", "border: 1px solid black; width: 100%;")

    static css_tab = mkCss("tab", [
        "display: grid;",
        // "overflow: clip;",
        "grid-template-columns: 1fr;",
        "grid-template-rows: auto 1fr;",
        "justify-content: stretch;",
        "align-content: stretch;",
        "width: 100%;",
        "height: 100%;",
        "border: 1px solid black;",
    ].join("\n"))

    static css_tabHidden = mkCss("tab", [
        "display: none;",
    ].join("\n"))


    constructor(viewCtx: ViewCtx) {
        this.viewCtx = viewCtx
        this.viewNum = viewCtx.viewNum
        this.root = mkHtml(["div", {}])
        this.toggles = mkHtml(["div", { "class": TabbedViewImpl.css_toggles }])
        this.tabs = mkHtml(["div", { "class": TabbedViewImpl.css_tabs }])
        this.root = mkHtml(["div", { "class": TabbedViewImpl.css_page }, this.toggles, this.tabs])

    }

    addTab(tab: Tab): unit {
        const tabName = tab.name
        const viewNum = tab.view
        let buttonW = mkHtml(["input",
            {
                "type": "submit",
                "value": tabName,
                "style": "text-align: left"
            }])
        buttonW.addEventListener("click", () => {
            this.viewCtx.sendMsg({ tag: "tabbedViewClick", viewNum: this.viewNum, tab: tabName })
        })
        this.toggles.append(buttonW)

        let tabW = mkHtml(["div", { "class": TabbedViewImpl.css_tab }, ["div", { "class": TabbedViewImpl.css_tabHdr }, tabName], getView2(this.viewCtx.session.views, viewNum).root])
        this.tabs.append(tabW)
        this.tabsMap.set(tabName, tabW)
    }
    setVisible(tabName: string, visible: boolean): unit {
        const tab = this.tabsMap.get(tabName)
        if (tab === undefined) {
            throw new Error("Unknown tab.")
        }
        tab.style.display = visible ? "grid" : "none"
        // if (visible) { 
        //     tab.classList.add(tabScHidden)
        // }
        // else {
        //     tab.classList.remove(tabScHidden)
        // }
    }
}


const topDivs = new Map<string, View | null>

function clearAllViews(session: Session, topDiv: string) {
    const rootView = topDivs.get(topDiv) ?? null

    if (rootView === null) return
    rootView.root.replaceWith(mkHtml(["div", { id: topDiv }]))
    topDivs.set(topDiv, null)
    session.views.clear()
    Object.entries(session.sessionViews).forEach(([name, views]) => {
        views.clear()
    })
}

function setRootView(session: Session, viewNum: ViewNum, topDiv: string) {
    const rootView = topDivs.get(topDiv) ?? null
    const newRootView = getView2(session.views, viewNum)
    if (rootView === null) {
        const rootDiv = document.getElementById(topDiv)!
        rootDiv.replaceWith(newRootView.root)
    }
    else {
        rootView.root.replaceWith(newRootView.root)
    }
    topDivs.set(topDiv, newRootView)
}



//#endregion
