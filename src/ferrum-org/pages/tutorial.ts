import { Page, Doc, pageBuild, mkDoc } from "../../site/page-doc.js"
import { PageModule } from "../../site/page-module.js"

const pageModule: PageModule = {
    page
}
export default pageModule


function page(): Page {

    return pageBuild(b => {
        b.title("Tutorial")
    })
}

