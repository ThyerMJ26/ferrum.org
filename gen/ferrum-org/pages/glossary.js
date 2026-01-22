import { definitions } from "../data/glossary-defs.js";
import { pageBuild } from "../../site/page-doc.js";
const pageModule = {
    page
};
export default pageModule;
export function page() {
    return pageBuild(b => {
        b.title("Glossary");
        b.section("", b.defns(definitions));
    });
}
//# sourceMappingURL=glossary.js.map