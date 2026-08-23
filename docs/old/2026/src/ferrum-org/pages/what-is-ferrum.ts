import { unit } from "../../utils/unit.js"
import { Page, Doc, pageBuild, mkDoc } from "../../site/page-doc.js"
import { PageModule } from "../../site/page-module.js"

const pageModule: PageModule = {
    page
}
export default pageModule


function page(): Page {
    return pageBuild((b): unit => {
        const { para: p, list: l } = b

        b.title("What is Ferrum?")

        p("Ferrum is the solution, when the problem is too many forms of abstraction.",
            "(Or at least, that is what it aspires to be.)"
        )

        // p("Ferrum is an experiment in using a single form of abstraction in-place of multiple forms.",
        // )

        // p("Ferrum is an experiment in using a smaller number of language features.",
        // )

        p("Programming languages often have more than one form of abstraction.",
            // "Macros, templates, functions, type-constructors, staging",
            "Examples include:", l([
                "Functions,",
                "macros,",
                "templates,",
                "generics,",
                "type-constructors,",
                "staging.",
                // "(and quoting and splicing)",
            ]),
            "New forms of abstraction can be added to a language for a number of reasons, two common ones are:",
            l(["Moving computation from run-time to compile-time,",
                ["Improving the expressiveness of the type-system,", "(which can be seen as moving error-detection from run-time to compile-time)."]
            ]),
            // "These can help with moving computation from run-time to compile-time.",
            // "For example, a generic grammar-taking parser written using macros or templates, can perform all the grammar-specific and input-independent work at compile-time.",
        )

        p("The downside of multiple forms of abstraction, is that you may then need to write the essentially same code multiple times.",
            "Abstractions are created to avoid repetition.",
            "But, the act of introducing a new form of abstraction, changes the very thing we are trying to abstract over.",
            "Each time we add a new form of abstraction to avoid one form of repetition we risk (or inevitably cause?) a new potential form of repetition.",
            "Ferrum aims to provide a single form of abstraction in such a way that there is no need to introduce further forms of abstraction.",
            // "(In the immortal words of Sean Connery (the overdressed haggis): \"The can be only one.\")",
        )

        p("Ferrum is unusual in a number of ways:", b.list([
            "Terms and types are abstracted over together,",
            "graph-reduction is performed beneath lambdas, and",
            "pattern-match failure can be handled by the caller.",
        ]))

        p("The benefits this brings are:",
            l([
                "For many purposes, functions can be used instead of macros,",
                "the same code can be used at run-time as compile-time,",
                "interpretive overhead can be specialized away,",
                "we don't need to keep adding new syntactic constructs each time the expressiveness of the type-system is increased.",
                ["language constructs can be defined using functions:",
                    l([
                        "Effect-handlers are just objects with asynchronous methods, ",
                        "objects are just functions with an intersected function type,",
                        "asynchronous methods/functions are just functions which take a continuation argument,",
                        "continuations are just functions."
                    ])],
            ]),
        )
        p("To provide better syntactic support for specific language constructs,",
            "(perhaps because writing everything in CPS (continuation-passing style) looks a bit odd),",
            "we can write an interpreter for an extended language, and specialize away the interpretive overhead."
        )

        p("Is this all too good to be true?",
            "Well, maybe.",
            "The fundamental tension between type-system expressability and decidability means we cannot have everything desirable simultaneously."
        )

        p("A language design cannot choose both expressability and decidability, but perhaps it can not choose at all.",
            "That is, the decision can be deferred to the user.",
            "We can have both, but not at the same time.",
            "When we want decidability, we must limit our expressiveness.",
            "When we want unbounded expressiveness, we must accept the type-checker might return \"unknown\".",
            // "Most type-checkers don't distinguish between known-wrong, and not-known-correct."
        )

        p("The ideal type-system should be able to decide everything we wish to express.",
            "Most (practically all) typed programming languages start with a decidable type-system with limited expressiveness.",
            "Often, these will then go on to gain greater expressiveness.",
            "For example adding polymorphic-types to Java/Go, or adding dependent-types to Haskell.",
            "Each time the expressiveness of a decidable language is increased, the syntax is typically modified.",
            "The things which cannot be decided simply cannot be expressed.",
            "This is both good and bad.",
            "It's good because; so long as we follow the syntax of the language, we'll either get a working program, or a definitive type-error.",
            "It's bad because; the things which cannot be decided, cannot even be written down.",
            "Without a valid notation, it becomes difficult to even talk about that which cannot currently be typed.",
        )

        p("A type-system can either: ", l([
            "Start decidable, and become more expressive (but never fully expressive), or",
            "start expressive, and become more decidable (but never fully decidable)."
        ]))

        p("Which is best?",
            "It depends.",
            "There's value in being able to switch between the two approaches without switching language.",
            "If you know you are programming within the capabilities of the type-checker, then a decidable approach is best.",
            "If you are exploring possible ways of expressing a program, an expressive approach might make sense.",
            "Sometimes it can be useful to approach a problem from both ends of a spectrum.",
            // 
            b.defns([
                ["Clarke’s Second Law:", "The only way of discovering the limits of the possible is to venture a little way past them into the impossible"]
            ]),
            "The impossible here is a fully decidable and fully expressive type-system.",
            "A fully expressive and partially decidable type-system is not impossible, it is an alternative, and underexplored, reality.",
        )



        p("What is the worst?",
            "Using a type-system to model problem-domain specific characteristics,",
            "only to spend much more time learning about and working-around the limits of a particular type-system,",
            "than understanding the actual problem-domain.",
            "(It's even worse, when the compiler has bugs in its lesser used parts).", // This can make people very wary about trying anything new.)"
        )

        p("Extending an expressive type-system to be be decidable is less intrusive than extending a decidable type-system to be more expressive.",
            "A type-checker for an expressive type-system ends up looking more like a model-checker than a conventional decidable type-checker.",
            "A type-system which is able to admit it doesn't know can be more helpful than a type-system that fails to distinguish between user-error and type-system limitation.",
        )

    })
}

