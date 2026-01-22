/** This file defines the UI interface for apps.
 *  There's nothing HTML specific here.
 *  In principle the interface could be implemented for use in a TUI or GUI.
 *  For now, only WUIs are supported, but the possibility that that might change, helps keep this HTML-independent.
 */

import { unit } from "../utils/unit.js"

import { Reactive, PortW, WritablePortList, PortRw, PortR } from "./reactive.js"
import { ViewNum } from "./protocol.js"
import { UiStyle, UiStyleDefns, UiText, UiTextId } from "./text.js"
import { UiStyleNum } from "./text.js"
import { AppIo } from "./app-server.js"
import { CmdLine_Schema, CmdLine_TypeFor_Schema } from "../utils/cmdline.js"


// TODO ? Parameterize both Ui and ViewCtx (and everything else) with a T ?
// TODO ? The type will remain an unknown variable right up until the App is passed to an AppRunner. 
// TODO ? The AppRunner can then use its own ViewImpl for T.
export interface ViewCtx {
    viewNum: ViewNum,
    visible: PortR<boolean>
}

export interface View<U> {
    // viewCtx: ViewCtx
    readonly impl: U
    writablePorts(): WritablePortList
}

/*** Text3 ***/

export type TextViewArgs<A extends number | string, I extends UiTextId> = {
    text: PortR<UiText<A, I>>
    parts: PortR<Map<I, UiText<A, I>>>
    // TODO ? Move callback here ?
    // callback(cb: TextViewCallback3): unit
}

export interface TextView3<U> extends View<U> {
    callback(cb: TextViewCallback3): unit
}

export interface TextViewCallback3 {
    click?: (annot: number | string) => unit
    selected?: (from: number, to: number) => unit
}


/*** Editor ***/

export interface EditorView<U> extends View<U> {
    callback(cb: EditorViewCallback): unit
}

export interface EditorViewCallback {
    click?: (pos: number) => unit
    selected?: (from: number, to: number) => unit
    changed?: (text: string) => unit
}

/*** List ***/

export interface ListView<U> extends View<U> {
    // setRows: (rows: string[]) => unit
    // setSelected: (row: number | null) => unit
}
export interface ListViewCallback {
    // selected: (row: number | null) => unit
}

/*** Panel ***/

export interface PanelView<U> extends View<U> {
    addPane<V extends View<U>>(name: string, defn: (_: ViewCtx) => V, visible?: PortRw<boolean>): V
}

/*** Table ***/

export interface TableView<U> extends View<U> {
    // addPane<V extends View<U>>(name: string, defn: (_: ViewCtx) => V, visible?: SignalRW<boolean>): V
}
export interface TableViewCallback {
    clicked?(row: number, col: number, pos: number): unit
}

/*** Tabbed ***/

export type TabbedView<U> = View<U> & {
    addTab<V extends View<U>>(name: string, defn: (_: ViewCtx) => V, visible?: PortRw<boolean>): V
}
export type TabbedViewCallback = {
    // clicked?(row: number, col: number, pos: number): unit
}

/*** Ui ***/

export type Ui<U> = {
    x: Reactive

    tabbedView: (name: string) => (viewCtx: ViewCtx) => TabbedView<U>
    panelView: (name: string) => (viewCtx: ViewCtx) => PanelView<U>
    editorView: (textSignal0: PortRw<string>, highlightSignal0?: PortR<[number, number] | null>) => (_: ViewCtx) => EditorView<U>
    textView: (textSignal0: PortR<UiText<any>>) => (_: ViewCtx) => TextView3<U>
    textView2<A extends string | number, I extends UiTextId>(args: TextViewArgs<A, I>): (_: ViewCtx) => TextView3<U>
    listView: (rows: PortR<string[]>, selection: PortRw<number | null>, cb: ListViewCallback) => (_: ViewCtx) => ListView<U>
    tableView: (headings: PortR<string[]>, contents: PortR<UiText[][]>, selection: PortRw<number | null>, cb: TableViewCallback) => (_: ViewCtx) => ListView<U>
    style(style: UiStyle, nameHint?: string): UiStyleNum
    styles<S extends UiStyleDefns>(styles: S, nameHint?: string | null): { [K in keyof S]: UiStyleNum }

    log(...args: string[]): unit
}



// TODO ? Provide an update signal to the App
// TODO ?   If signals are to be processed between http calls,
// TODO ?     then it's useful to know when would be a good time to compute anything effectful.
// TODO ?   Without this, we would generate wasted effects, and perform wasted computation.
// export type App<U> = (ui: Ui<U>, args: string[], update: SignalR<null>) => unit


export type App = {
    // TODO
    // argsDefn: Args
    mk: <U>(ui: Ui<U>, viewCtx: ViewCtx, args: string[], appIo: AppIo) => unit
}
export type AppRunner2 = (app: App) => unit


// // TODO ? change App to take a CmdLine arguments instead of string[] ?
// export type App<S extends CmdLine_Schema> = {
//     cmdLineSchema: S,
//     mk: <U>(ui: Ui<U>, viewCtx: ViewCtx, args: CmdLine_TypeFor_Schema<S>, appIo: AppIo) => unit
// }


export function createDummyStyles<S extends UiStyleDefns>(styles: S, nameHint: string): { [K in keyof S]: UiStyleNum } {
    const result = Object.fromEntries(
        Object.entries(styles).map(
            ([name, defn]) =>
                [name, 0]
        )
    ) as { [K in keyof S]: UiStyleNum }

    return result
}
