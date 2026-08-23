import { unit } from "../../utils/unit.js"
import { definitions } from "../data/glossary-defs.js"
import { PageModule } from "../../site/page-module.js"
import { Defn2, Page, pageBuild } from "../../site/page-doc.js"

const pageModule: PageModule = {
    page 
}
export default pageModule


export function page(): Page {
    return pageBuild(b => {
        b.title("Glossary");

        b.section("",
            b.defns(definitions)
        )
    })
}

