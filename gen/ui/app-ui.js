/** This file defines the UI interface for apps.
 *  There's nothing HTML specific here.
 *  In principle the interface could be implemented for use in a TUI or GUI.
 *  For now, only WUIs are supported, but the possibility that that might change, helps keep this HTML-independent.
 */
// // TODO ? change App to take a CmdLine arguments instead of string[] ?
// export type App<S extends CmdLine_Schema> = {
//     cmdLineSchema: S,
//     mk: <U>(ui: Ui<U>, viewCtx: ViewCtx, args: CmdLine_TypeFor_Schema<S>, appIo: AppIo) => unit
// }
export function createDummyStyles(styles, nameHint) {
    const result = Object.fromEntries(Object.entries(styles).map(([name, defn]) => [name, 0]));
    return result;
}
//# sourceMappingURL=app-ui.js.map