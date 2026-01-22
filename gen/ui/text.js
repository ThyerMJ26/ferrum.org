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
export function uiText(style, text) {
    if (style === null) {
        return text;
    }
    else {
        return { style, items: [text] };
    }
}
export function uiTextAnnot(style, text, annot) {
    if (style === null) {
        return { annot, items: [text] };
    }
    else {
        return { annot, style, items: [text] };
    }
}
export const uiTextA = uiTextAnnot;
export function uiTextS(style, ...items) {
    return { style, items };
}
export function uiTextI(id, ...items) {
    if (items.length === 0)
        return { id };
    if (items.length === 1 && typeof items[0] !== "string" && items[0].id === undefined)
        return { id, ...items[0] };
    return { id, items };
}
export function uiTextList(...texts) {
    return { items: texts };
}
export function uiTextLength(text) {
    if (typeof text === "string") {
        return text.length;
    }
    if (text.items === undefined) {
        return 0;
    }
    return text.items.reduce((totalLen, item) => totalLen + uiTextLength(item), 0);
}
export function uiTextToStr(text) {
    const segments = [];
    toStr(text);
    return segments.join("");
    function toStr(text) {
        if (typeof text === "string") {
            segments.push(text);
            return;
        }
        text.items?.forEach(item => {
            toStr(item);
        });
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
//# sourceMappingURL=text.js.map