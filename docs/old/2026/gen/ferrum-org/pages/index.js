import { pageBuild } from "../../site/page-doc.js";
const pageModule = {
    page
};
export default pageModule;
function page() {
    return pageBuild(b => {
        const { para: p, defns, list, link_page, link_url } = b;
        b.title("Ferrum");
        b.section("", defns([
            ["A language:", ["Functional with set-theoretic first-class types."]],
            ["An implementation:", ["A specializing translator (a specialator)."]],
            ["An experimental work-in-progress", []],
        ]));
        p(["The repository contains details of the implementation:", link_url("https://github.com/ThyerMJ26/ferrum")]);
        p("The pages on this website explain the language.");
        // list([
        //     link_page("./tutorial.js", "Tutorial (Work-in-Progress)"),
        //     link_page("./glossary.js", "Glossary (Work-in-Progress)")
        // ])
        link_page("./what-is-ferrum.js", "What is Ferrum");
        link_page("./motivation.js", "Motivation", [
            "Why a new programming language?"
        ]);
        link_page("./betteridge-says-no.js", "Sets, types, and paradox.");
        // link_page("./tutorial.js", "Tutorial (Work-in-Progress)")
        link_page("./glossary.js", "Glossary (Work-in-Progress)");
    });
}
//# sourceMappingURL=index.js.map