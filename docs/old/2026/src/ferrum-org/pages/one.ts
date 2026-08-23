
import { uiText, uiTextS } from "../../ui/text.js";
import { unit } from "../../utils/unit.js"
import { Page, pageBuild } from "../../site/page-doc.js";
import { PageModule } from "../../site/page-module.js";

const pageModule: PageModule = {
    page
}
export default pageModule

export function page(): Page {
    return pageBuild(b => {
        b.title("Page 123 ");


        b.list([
            "A pure functional programming language.",
            "A specializing translator.",
            "A specialator.",
        ]);

        b.para("My first paragraph.");
        b.para("My second paragraph.");

        b.para(`
        XYZ 123 567896 asdasd asdfs
        `);

        b.para(uiTextS({ weight: 1 }, "A", "apple"));
        b.para(uiTextS({ italic: 1 }, "B", "burdock"));
        b.para(uiTextS({ strike: 1 }, "C", "cider"));
        b.para(uiTextS({ under: 1 }, "D", "dandelion"));

        return
    })

}

