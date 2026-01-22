import { Defn2 } from "../../site/page-doc.js"
import { UiText } from "../../ui/text.js"

function def(name: string, ...text: UiText[]): Defn2 {
    // return { name, text, }
    return [name, text]
}

// TODO ? Allow multi-line definitions ?
// function def(name: string, text: UiText | UiText[]): Defn {
// function def(name: string, ...text: UiText[]): Defn {


export const definitions: Defn2[] = [
    def("", ""),
    def("[]",
        "Tuple-brackets.",
        "An empty-tuple is also known as: no, nil, unit, an empty-list.",
    ),
    def("[ a ,, b ]", "A pair."),
    def("[ a, b, c ]", "Equivalent to [ a ,, [ b ,, [ c ,, [] ] ] ]."),
    def("[ a, b ,, c ]", "Equivalent to [ a ,, [ b ,, c ] ]."),
    def("()", "Term-brackets"),
    def("{}", "Type-brackets"),
    def("->", "lambda"),
    def("=>", "lambda-yes"),
    def("|->", "lambda-no"),
    def("|=>", "lambda-maybe"),
    def("", ""),
    def("", ""),
    def("", ""),
    def("nil", "A value, typically used to denote the absence of another value, such as a pair."),
    def("pair", "A compound value, containing a head value and a tail value."),
    def("tuple", "A tail-nested arrangement of zero or more pair values terminated by a nil value."),
    def("list", "A tail-nested arrangement of zero or more pair values terminated by a nil value."),
    def("", ""),
    def("list", "TODO"),

    // def("Any", "A type which contains all the values that can be used with the ifBool and ifInt-like functions."),
    def("Any", "A type which contains all the recursively-discernable values."),
    def("All", "A type which contains all values."),
    def("Pair", "A type-constructor. (Pair A B) denotes the type containing pair values whose heads have type A and tails have type B."),
    def("Maybe", "A type-constructor. (Maybe A) denotes the type containing "),
    def("List", "A type-constructor."),
    def("", ""),

    def("discernable-value", "A value that can be used with the ifNil, ifBool, ifInt, isStr, ifPair functions."),
    def("Discernable", "A type that contains all the values in Nil, Bool, Int, Str and (Pair All All)."),
    // With a recursively discernable-value, we can recurse into the pairs and keep discerning all the way.
    def("DiscernableRecursive", "A type that contains all the values in Nil, Bool, Int, Str and (Pair Any Any)."),
    // TODO ? We only need the concept of sufficiently-discernable if functions and types are not considered discernable.
    // TODO ?   There doesn't seem to be a compelling reason to ban the term-level testing of functions and types though.
    // TODO ?   So long as pattern-matching against values of type "All" produces a type-level error.
    // def("sufficiently-discernable", "A value is sufficiently-discernable with respect to a pattern, if the pattern match can be decided without panic."),

    def("Bool", "A type that contains only the 'true' and 'false' values."),
    def("Int", "A type that contains all whole numbers."),
    def("Str", "A type that contains all string values."),
    def("Data", "A type that contains all the values in Nil, Bool, Int, Str and (Pair Data Data)."),
    def("", ""),
    def("", ""),
    def("literal", "Values of type Nil, Int, Str can be denoted using literal syntax ([], 123, \"ABC\")."),
    def("value", "A sufficiently reduced term."),
    def("data", "TODO"),
    def("term", "A graph-node which may or may not be reduced to a value."),
    def("type-term", "A graph-node which has or will reduce to a type-value."),
    def("type-value", "A term which reduced to a type-value.  Denotes a set of values."),
    def("type", "Ambiguously used for both type-terms and type-values."),
    def("Type", "The type containing all types."),
    def("term-brackets", "(), used for precedence, and to move from a type-context to a term-context."),
    def("type-brackets", "{}, used for precedence, and to move from a term-context to a type-context."),
    def("term-context", "A context in which operators and juxtaposition denote term-level operations, and literals denote term-level values."),
    def("type-context", "A context in which operators and juxtaposition denote type-level operations, and literals denote singleton-types."),
    def("", ""),

    def("no-tuple", "A tuple of length 0. Another name for nil."),
    def("yes-tuple", "A tuple of length 1."),
    def("lambda", "A nameless pattern-matching function. Pattern-match failure is considered a term-error, and so will cause a panic."),
    def("lambda-yes", "A lambda that wraps its result in a yes-tuple."),
    def("lambda-no", "A lambda that returns a no-tuple on pattern-match failure."),
    // Attempting to match a pattern with a function should possibly be considered a term-error (but probably not).
    // Attempting to match a pattern with a value of type "All" should definitely be considered type-error (when support for the the "All" type is added).
    def("lambda-maybe", "A lambda that returns a no-tuple on pattern-match failure, and wraps its result in a yes-tuple on pattern-match success."),
    def("type-error", "TODO"),
    def("term-error", "TODO"),
    def("panic", "A term-error at runtime causes a panic which halts the program."), // In future it should be possible to catch panics at the Io level.
    def("synthesized-type",
        "For compound terms, the type calculated for a term, based on its sub-terms.",
        "For term-variables, the type looked-up in the environment.",
        "For pattern-variables, the context-type is used.",
        "For literals, the singleton-type containing only that literal-value."
    ),
    def("context-type", "The type for a term calculated from its parent's context-type, and the synthesized types of zero or more of its siblings."),
    def("type-inhabitation", "A type is inhabited if it contains at least one term."),
    def("relative-complement", "TODO"),
    def("Void", "The type that contains no terms."),
    def("singleton-type", "A type that contains exactly one value."),
    def("Unit", "The type which contains only the unit value."),
    def("unit", "Another name for nil"),
    def("", ""),
    def("strong-form", "TODO"),
    def("weak-form", "TODO"),
    def("", ""),
    def("", ""),
    def("TorP", "Term or Pattern, terminology used internally"),
    def("TorT", "Term or Type, terminology used internally"),
]


