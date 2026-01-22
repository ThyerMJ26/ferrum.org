import { unit } from "../utils/unit.js"
import { Page, Doc, DocMaker } from "./page-doc.js"

export type PageModule = {
    page?: () => Page
}
