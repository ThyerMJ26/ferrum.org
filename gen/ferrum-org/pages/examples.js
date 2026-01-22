import { pageBuild } from "../../site/page-doc.js";
const pm = {
    page
};
export default pm;
export function page() {
    return pageBuild(b => {
        b.title("Examples");
        b.para("Ex");
        b.appPublish("EX-1");
        b.para("fe4-.test.fe");
        b.appPublish("IDE-1");
        b.para("fe4a.test.fe");
        b.appPublish("IDE-2");
    });
}
//# sourceMappingURL=examples.js.map