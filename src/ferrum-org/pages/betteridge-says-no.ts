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

        b.title("Can Russel's Paradox be resolved without throwing the baby out with the bathwater? <br> Betteridge says no, but is he right?")

        b.section("Paradox",
            b.defns([
                ["Russel's Paradox", "Does the set of all sets that don't contain themselves, contain itself?"],
                ["Betteridge's Law", "Any headline posed as a question can be answered no."],
                ["Liar Paradox", "This sentence is false."],
                ["Quine's Paradox", '"yields falsehood when preceded by its quotation" yields falsehood when preceded by its quotation.'],
            ]),

            p(
                "Russel's Paradox demonstrates that unrestricted set-theory can lead to contradictions.",
                "Similarly, unrestricted logical statements, such as the Liar Paradox, can lead to contradictions.",
                "To make set-theory consistent (free of contradictions), restrictions must be imposed.",
            )),
        b.section("Set Theory",
            p(
                "This is the problematic construction:",
                "{ x | x ∉ x }",
                "Different set-theories forbid it on different grounds.",
                // "Zermelo–Fraenkel (ZF) requires every set to be constructed with reference to an already existing set.",
                `Zermelo–Fraenkel (ZF) forbids this because "x" is not drawn from an already existing set.`,
                // `Quine's New Foundations (NF) places the restriction on the use of "x" on both sides of the negated set-membership (∉) operator.`,
                `Quine's New Foundations (NF) forbids this because "x" is used on both sides of the negated set-membership "∉" operator. (In NF terms, the predicate "x ∉ x" is not stratified)`,
                "Whichever rules are used to prevent contradictions, will also forbid some otherwise non-problematic constructions.",
                "For example, NF permits the universal set, whereas ZF forbids it.",
                "(Examples of sets permited in ZF but not NF exist, but are a bit more involved.)"
            ))
        // p(
        //     "Using rules to prevent set theoretic contradictions is similar to using rules to prevent logical contradictions.",
        // ),
        b.section("Type Theory",
            p(
                "Type-theory was invented to stop philosopher's talking nonsense.",
                "At first glance, the problem with the Liar Paradox is self-reference.",
                "Quine's paradox demonstrates that contradictions can arise without self-reference.",
                "Type theory can prevent the construction of such contradictory sentences.",
                "However, as with set theory, any specific type theory will forbid meaningful terms as well as contradictory ones."
            ))

        b.section("Computation", p(
            "As well as contradictory/meaningless sets and sentences, we can have contradictory programs:",
            "function f() { return !f(); }",
            "If this function returns true, it returns false, and if it returns false, it returns true.",
            "Type systems for most programming languages don't concern themselves with termination.",
            "Type theory, on the other hand, does.",
        ),
            p(
                "The dividng line between sense and nonsense appears to be the same as the dividing line between total (always terminating) and partial (sometimes non-terminating) functions.",
                "Programmers are already accustomed to being responsible for ensuring their programs terminate."
            ),
            p(
                "Perhaps we can be less rigid in forbidding problematic sets by defining a permitted set, as a set with a total predicate function.",
                "This isn't a decidable definitions, because the halting problem isn't decidable.",
                "NF provides one particular way of ensuring only total predicates can be formed.",
                "But if we need more expressability, any method of proving that a predicate is total is valid."
            )
        )

        b.section("Theorem Proving",
            p(
                "Theorem proving and type-checking have a close correspondence.",
                "However, Ferrum's type-system is primarily inteded to be useful for programming, and specializing and translating code.",
                "A type-check is only a valid proof if termination is also proved.",
                "Languages for theorem provers typically ensure only terminating programs can be written.",
                "Ferrum could be equipped with primitives which only allow you to write terminating programs.",
                "Ferrum's type-system could be refined to treat total-functions as a subtype of partial-functions.",
                "At present, termination is left as the responsibility of the programmer.",
            ),
        )

        b.section("So, is the headline true?",
            p("The headline is neither true, nor false, nor true, nor false, nor true, nor false, nor true, nor false, nor true, nor false, nor true, nor false, ...",
            // p("The headline is neither true, nor false, nor true, nor false, nor true, nor false, nor true, nor false, ...",
                "Some questions just don't have answers.",
                "(Or, whatever answer there is, it is neither true nor false.)"),
        )

        // Sound and Complete
        // Not everything can be decided, but can it even be expressed.
        //   No: meaning I'm sure it's a no.
        // vs
        //   No: meaning, I'm not sure it's a yes.

        // Should everything expressable be decidable?
        // Unspeakable truths.


        // b.section("Decidability", p(
        //     "",
        // ))

        // b.section("Expressability", p(
        //     "",
        // ))

    })
}