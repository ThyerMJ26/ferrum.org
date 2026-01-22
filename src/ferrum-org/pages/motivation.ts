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

        b.title("What is the motivation behind Ferrum?")

        p("The Ferrum programming language exists to help reduce tedium in programming.",
            "Programming is all about reducing tedium in other domains, ",
            "but when it comes to reducing tedium in programming itself, ",
            "existing solutions always run out of steam, one way or another.")
        // TODO Stop writing blog-posts/web-pages directly in TypeScript, it's too tedious! 

        p("Many of the limits of existing solutions exist because:", l([
            "interpretive overhead is non-zero, and",
            "a fundamental tension exists between type-system expressability and decidability."
        ]))

        p("Ferrum provides:", l([
            "a way to specialize away interpretive overhead, and",
            "an expressive type-system.",
        ]))

        // p("ΛX.λx:X.x")

        b.section("Meta-programming",
            p(
                "Many programming language have features that help support meta-programming.",
                "Examples include:",
                l([
                    "templates,",
                    "macros,",
                    "reflection/introspection."
                ])
            ),

            p(
                "Templates and macros can enable computations to be moved to compile-time.",
                "The benefit of this is faster execution at run-time.",
                "The drawback is that code now needs to be written differently depending on when it is to be run.",
                "This can be a problem if we want to use that same code at different times.",
                "If there are two implementations, they risk getting out of sync."
            ),
            p(
                "Consider a parser.",
                "A parser can be written in an interpretive style to interpret the rules in the grammar.",
                "If this interpretation is done in templates or macros, the resulting parser will run without interpretive overhead.",
                "The downside is that the parsing algorithm can now only be given a new grammar at compile-time.",
                "It would not be possible to write a diagnostic tool for use during grammar development which used the same parser implementation."
            ),
            p(
                "The prospect of dynamic grammars may sound contrived.",
                "For a more concrete example, consider a parser for a binary format, such as an image or video file (or stream).",
                "Binary formats are often highly parameterized, for example, by colour depth.",
                "The header will contain the actualy parameters, the body then conforms to those parameters.",
                "Generating parsers for every possible parameterization may result in prohibitively large executables.",
                "Always consulting the parameters may result in prohibitively long execution time.",
                "Somewhere between the two is a tradeoff.",
                "But where may depend on external factors.",
                "For a diagnostic tool, flexability and universality is more important.",
                "For an embedded device, efficiency for a specific case is more important."
            ),
            p(
                "For a format with a stable specification, multiple implementations is a workable solution.",
                "But this isn't ideal.",
                "Not all formats are stable, and even those that are don't typically start as such."
            ),
            p(
                "Is it possible to write the code once, independently of how we wish to use it later?",
                "We may wish to specialize the code to some subset of its parameters.",
                "We may wish to run the code on the backend or frontend, inside a database, or target a GPU, NPU, FPGA, or ASIC.",
            ),
            p(
                "Why not capture all the fiddly details as data (for example as XML or JSON)?",
                "This is a common approach, used in many places.",
                "It starts off well, but fiddly details have an annoying habit of getting everywhere.",
                "The data format can become steadily more complex, and the numerous consumers of this format need to be kept in sync.",
                "What if we could write the code once and be done with it.",
                "Specialzing away functionality we don't need, and translating the result to whichever language we do need,",
                "will, in many cases, produce much the same code we would previously have had to write and maintain in multiple languages."
            ),
        )

        b.section("Data and Code",
            p("Here are some quotes regarding the use of data and code."),

            p("Show me the data, and I won't need the code:", l([
                "Fred Brooks: Show me your flowcharts and conceal your tables, and I shall continue to be mystified. Show me your tables, and I won’t usually need your flowcharts; they’ll be obvious.",
                "Rob Pike: Data dominates. If you’ve chosen the right data structures and organized things well, the algorithms will almost always be self-evident. Data structures, not algorithms, are central to programming.",
                "Linus Torvalds: Bad programmers worry about the code. Good programmers worry about data structures and their relationships.",
            ])),
            p(
                // "How can you know the meaning of data without the code that handles it:", 
                "The meaning is in the eye of the beholder:",
                l([
                    "Alan Kay: What is \"data\" without an interpreter (and when we send \"data\" somewhere, how can we send it so its meaning is preserved?).",
                ])),
            p("Principle of least power:", l([
                "W3C: Choose the least powerful language suitable for a given purpose.",
                "Tim Berners-Lee: The less powerful the language, the more you can do with the data stored in that language.",
            ])),


            p("So, which is best, data or code?",
                "When the relationship between data items is simple, the code is obvious.",
                "But data doesn't always stay simple.",
                "Imagine defining a questionaire definition language.",
                "Not all questions are relevant to all reponders, so we want a way to specify whether a question should asked or not.",
                "We could start by adding flags to questions to indicate which category of people they are relevant for.",
                "Before long, we might also add:", l([
                    "Boolean operations on flags,",
                    "numerical attributes and comparisons,",
                    "references to previously asked questions (current or historical),",
                    "a means of specifying repetition, if a question needs to be asked once for each occurence of something."
                ]),

                "It's probably best not to immediately jump to adding a turing-complete language to a data format (principle of least power).",
                "But as more and more constructs get added, capturing the meaning of these constructs becomes more important.",
                "This can be more problematic if the format is being extended by different people at different times, each with a different partial understanding of future needs.",
                "If there are multiple consumers of the data format, extending the format can be problematic.",
                "For example, if the format needs to be extended, the ideal solution might be to modify an existing construct, but if this requires modifying code maintained by different teams or different companies, it might be more expedient to add a new construct.",
                "The need to capture the meaning of data, in some machine-readable and manipulable way is all too easy to overlook.",
            ),
        )

        b.section("Code is Data", p(
            "Separating data from code makes it easier to use that same data with multiple code-bases.",
            "However, the code that consumes that data can also end up containing lots of problem-domain specific details that we shouldn't need to repeat.",
            "Just as it wouldn't make sense to directly write the same list of questions in multiple programming languages,",
            "we would ideally not write the code that consumes that data in multiple programming languages.",

            "Code is trivially data, as code is typically stored in text files.",
            "This doesn't make it amenable to maniplulation though.",
            "Ferrum is built on the premise that, the best way to manipulate problem-domain specific code, is to:",
                l(["Interpret it,", "specialize away the interpretive overhead, and","translate the result to whichever language we need."]),
            "",)

        )

        b.section("Component-specific data and code",
        // b.section("Domain-specific data and code",

            p(
                "Component-specific data includes things such as:", l([
                    "Register-maps used by hardware and software to communicate,",
                    "the names, positions and widths of fields within a protocol packet header,",
                    "the names, positions and widths of fields within a image file/segment,",
                    "the list of questions to ask in a survey."
                ])
            ),

            p(
                "Component-specific code includes things such as:", l([
                    "The read/write sequences needed to work with a specific hardware device,",
                    "the expected/permitted hardware responses (useful for generating testbenches, and possibly hardware too),",
                    "the steps needed to construct and process protocol packets,",
                    "the steps needed to reconstruct an image,",
                    "the steps needed to determine which question to ask next."
                ])
            ),

            p(
                "Component-specific data can be captured in JSON, or XML, or any of a number of widely supported formats.",
                "But what about component-specific code?",
                "What serves the purpose for code that JSON/XML serves for data?",
                "Ferrum aspires to be that language.",
                "Alternatively, a language that can be interpreted by Ferrum can be used."
            ))



        // b.section("Domain-specific and application-specific code boundaries", p(
        b.section("Component-specific and application-specific code boundaries", p(

            "The application code connects everything together for a specific purpose.",
            "There are multiple ways of connecting software components together, each with different trade-offs.",
            "Concurrency needs to be handled, and there are multiple approaches.",
            "These differences make it harder to write component-specific code in a way that can be reused.",
            "To some extent, differences can be abstracted over.",
            "For example, should a component write its output to memory, or directly call the next component?",
            "We can have both, at the cost of an indirect function call.",
            "An indirect function call might not sound a great expense, but we also incur lost opportunities for optimizations.",

            "The (intended) Ferrum solution is to use effect-handlers and specialization.",
            "This makes it possible to keep component-specific code decoupled, but generate tightly-coupled code that intermingles code from multiple components.",




            // // "For a more concrete example, consider a game-server.",

            // "For a more concrete example, consider a video streaming conversion application.",
            // "The domain-specific details include:", l([
            //     "The input and output video encoding formats (MPEG-x, H.26x, AV1/2)",
            //     "the input and output data sources/sinks (network, screen, filesystem, aerial, satellite dish)."
            // ]),

            // "Too much latency can make human communication feel unnatural.",
            // // "A low latency solution is desirable so as to keep interactive communication feeling natural,",
            // // "and so as not to hear a football goal next door before seeing it yourself."
            // "To minimize latency we need to combine knowledge of multiple parts of the system together.",
            // "To maximize maintainability and reusability, (and sanity), we need to keep everything separate.",

            // "For each byte output, there is a last dependent input byte required to compute this output.",
            // "Ideally, we want as little time to have passed as possible between receiving and sending these two bytes.",
            // "There is a whole design space of possible solutions to this.",
            // "Ideally we should be able to explore alternative solutions without getting bogged down in domain-specific details.",




        ))





        // b.section("What if interpretation were free?")

        // b.section("What if we could express any type?")

    })
}

function f(x: unknown): boolean {
    return typeof x === "string"
    // return x === null
}

