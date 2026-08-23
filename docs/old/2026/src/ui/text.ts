import { assert } from "../utils/assert.js"

export type UiStyleNum = number & { __brand_UiStyleNum: never }

export type UiColor =
    | "Black"
    | "Red"
    | "Green"
    | "Yellow"
    | "Blue"
    | "Magenta"
    | "Cyan"
    | "White"
// Use grey (bright black / dark white) as a default background ?
// All colours should be visible against a gray background ?
// | "Gray"

export type UiStyle = {
    fg?: UiColor
    bg?: UiColor
    weight?: -1 | 0 | 1
    italic?: 0 | 1
    under?: 0 | 1
    strike?: 0 | 1
    fixed?: 0 | 1 // TODO fixed-width
}

export type UiStyleDefns = { [_: string]: UiStyle }
export type UiStyleNums = { [_: string]: UiStyleNum }

export type UiStyleNumsFor<S extends UiStyleDefns> = {
    [K in keyof S]: UiStyleNum
}

export type UiTextId = number | string

export type UiText<A = never, I extends UiTextId = never> =
    | string // literal string
    | {
        id?: I
        // style?: UiStyleNum
        style?: UiStyle | UiStyleNum
        annot?: A
        items?: UiText<A, I>[]
    }

// // TODO ? Package all the UiText type-params into a single type ?
// export type UiTextT<A, I extends UiTextId> = {
//     // style: UiStyle
//     alloc: A
//     id: I
// }

// export type UiTextT2<T extends { alloc: any, id: number | string } = { alloc: never, id: never }> =
//     | string // literal string
//     | {
//         id?: T["id"]
//         style?: UiStyleNum
//         // style?: T["style"]
//         annot?: T["alloc"]
//         items?: UiTextT2<T>[]
//     }




// export type UiTextAnnot<A = never, I extends UiTextId = never> = UiText<A, I>


export function uiText(style: UiStyleNum | null, text: string): UiText {
    if (style === null) {
        return text
    }
    else {
        return { style, items: [text] }
    }
}

export function uiTextAnnot<A, I extends UiTextId>(style: UiStyleNum | null, text: string, annot: A): UiText<A, I> {
    if (style === null) {
        return { annot, items: [text] }
    }
    else {
        return { annot, style, items: [text] }
    }
}
export const uiTextA = uiTextAnnot


export function uiTextS<A, I extends UiTextId>(style: UiStyleNum | UiStyle, ...items: UiText<A, I>[]): UiText<A, I> {
    return { style, items }
}

export function uiTextI<A, I extends UiTextId>(id: I, ...items: UiText<A, I>[]): UiText<A, I> {
    if (items.length === 0) return { id }
    if (items.length === 1 && typeof items[0] !== "string" && items[0].id === undefined) return { id, ...items[0] }
    return { id, items }
}

export function uiTextList<A = never, I extends UiTextId = never>(...texts: UiText<A, I>[]): UiText<A, I> {
    return { items: texts }
}


export function uiTextLength<A>(text: UiText<A>): number {
    if (typeof text === "string") {
        return text.length
    }
    if (text.items === undefined) {
        return 0
    }
    return text.items.reduce((totalLen, item) => totalLen + uiTextLength(item), 0)
}

export function uiTextToStr<A>(text: UiText<A>): string {
    const segments: string[] = []
    toStr(text)
    return segments.join("")

    function toStr(text: UiText<A>): void {
        if (typeof text === "string") {
            segments.push(text)
            return
        }
        text.items?.forEach(item => {
            toStr(item)
        })
    }
}



// TODO ? A UiTextGrid ?
// TODO ?   Allow/require explicit horizontal/vertical tags ?
// TODO ?   This still makes partial updates efficient (so long as they align with the layout).
// TODO ?   It also saves computing just the right number of spaces needed for alignment,
// TODO ?     and makes it possible to use an arrangement of Div/Span elements to achive layout.

// export type UiTextGrid = string |
// [UiStyleNum, string] |
// ["H", ...UiTextTree[]] |
// ["V", ...UiTextTree[]]



