import { unit } from "../../utils/unit.js";
import { AppIo } from "../../ui/app-server.js";
import { App, Ui, View, ViewCtx } from "../../ui/app-ui.js";


export const examplesApp: App = {
    mk: examplesApp_mk
}

export function examplesApp_mk<U>(ui: Ui<U>, viewCtx: ViewCtx, args: string[], appIo: AppIo): unit {

    // ui.addTab("Demo1", ui.createPanelView("One"), true )
    // ui.addTab("Demo2", ui.createPanelView("Two"), false )
    // ui.addTab("Demo3", ui.createPanelView("Three"), false )

    // const tabbedView = ui.addTab("Demo4", ui.createTabbedView("Demo"), true )   
    const tabbedView = ui.tabbedView("Demo")(viewCtx)

    const visible1 = ui.x.state<boolean>(null, true).rw()
    const visible2 = ui.x.state<boolean>(null, true).rw()
    tabbedView.addTab("DemoA", ui.panelView("A"), visible1 )
    tabbedView.addTab("DemoB", ui.panelView("B"), visible2 )
    tabbedView.addTab("DemoC", ui.panelView("C"), visible2 )

    return

}

