import { assert } from "../utils/assert.js";
import { showExpr1 } from "../syntax/expr.js";
import { isAddrNo, isAddrYes } from "../graph/graph-heap2.js";
import { readbackExpr } from "../graph/graph-readback.js";
import { tiIsContradiction, tiIsFalse, tiIsTrue, tiIsUnknown } from "../graph/graph-ti.js";
import { prettyFerrum } from "../syntax/pretty-ferrum.js";
import { showLoc } from "../syntax/token.js";
import { uiText, uiTextList } from "../ui/text.js";
export function mkShow(heap) {
    return {
        showExprTySyn,
        showExprTyCtx,
    };
    // Traverse the expr and display the readback type on every expr node.
    function showExprTySyn(out, expr) {
        showExpr1(out, expr, mkShowExprLine2(heap, 'synTy', 'tc'));
    }
    function showExprTyCtx(out, expr) {
        showExpr1(out, expr, mkShowExprLine2(heap, 'ctxTy', 'tc'));
    }
}
export function mkShowExprLine2(heap, ty, tc) {
    function showExprLine(out, expr, fields1, fields2) {
        if (out.level > 120) {
            out.line("...");
            return;
        }
        let line = "";
        line += expr.tag;
        for (let field of fields1) {
            let f1 = JSON.stringify(expr[field]);
            if (f1.length >= 30) {
                f1 = `${f1.slice(0, 20)}...`;
            }
            line += ` ${f1}`;
        }
        const addr = expr?.tm;
        const addrStr = (addr === undefined ? "" : `${addr}`).padStart(4);
        const depthStr = (addr === undefined ? "" : `${heap.depthOf(addr)}`).padStart(4);
        out.line(line, null, `${depthStr} ${addrStr}  ${showLoc(expr.loc)}`);
        if (expr.hasOwnProperty(tc)) {
            let expr2 = expr;
            if (expr2[tc] !== null && expr2[tc] !== undefined) {
                let errSym = `#${expr2[tc].charAt(0).toUpperCase()}`;
                if (errSym !== '#O')
                    errSym = `-${errSym}`;
                else
                    errSym = ` ${errSym}`;
                out.line(errSym, 31);
            }
        }
        if (expr.hasOwnProperty(ty)) {
            const tyAddr = expr[ty];
            if (tyAddr !== null) {
                const addrStr = `${tyAddr}`.padStart(4);
                const depthStr = `${heap.depthOf(tyAddr)}`.padStart(4);
                const typeStr = `${depthStr} ${addrStr}  ${prettyFerrum(readbackExpr(heap, tyAddr))}`;
                out.line(typeStr, 32);
            }
        }
        for (let field of fields2) {
            let child = expr[field];
            let margin = `${showNum(child.loc.range.start.line, 3)},${showNum(child.loc.range.start.col, 3)}`;
            out.indentLine(`${field} = `, null, margin);
            showExpr1(out, child, showExprLine);
            out.outdent(2);
        }
        out.endLine();
    }
    return showExprLine;
}
export function showForm(form) {
    switch (form) {
        case "None": return ".";
        case "Error": return "E";
        case "Weak": return "W";
        case "Strong": return "S";
        default:
            assert.noMissingCases(form);
    }
}
function showNum(width, value) {
    let str = `${value}`;
    let pad = "";
    while (pad.length + str.length < width) {
        pad += " ";
    }
    return pad + str;
}
export const heapStyleDefns /*: UiStyleDefns */ = {
    regular: { weight: 0 },
    overwritten: { weight: -1, strike: 1 }, // for node values then have been overwritten with an indirection
};
export function collectHeapDisplayInfo(h, roots, unreduced, styles, showTypes = false) {
    roots ??= h.allAddrs();
    const todo = roots.slice().reverse().filter(a => isAddrYes(a));
    const done = new Set;
    const info = [];
    while (todo.length !== 0) {
        const addr = todo.pop();
        if (isAddrNo(addr) || done.has(addr)) {
            continue;
        }
        assert.isTrue(addr !== undefined);
        done.add(addr);
        // const inStack = roots.indexOf(addr) !== -1 ? ">" : " "
        const disp = h.showNode(addr);
        const followIndirect = h.isUpdated(addr) && !unreduced.has(addr);
        const valueStyle = followIndirect ? styles.overwritten : styles.regular;
        const indirectStyle = !followIndirect ? styles.overwritten : styles.regular;
        info.push({
            addr: addr,
            addrTxt: uiText(null, `${addr}`),
            // indirect: h.isUpdated(addr) ? [[indirectStyle, `${h.updatedTo(addr)} ${unreduced.has(addr) ? "-" : "+"}`]] : "",
            indirect: h.isUpdated(addr) ? uiText(indirectStyle, `${h.updatedTo(addr)}`) : uiText(null, ""),
            tyAddr: uiText(valueStyle, `${h.typeAt(addr)}`),
            depth: uiText(valueStyle, `${h.depthAt(addr)}`),
            targetForm: uiText(valueStyle, showForm(h.targetFormOf(addr))),
            form: uiText(valueStyle, h.showForm_addr(addr)),
            disp: uiText(valueStyle, disp)
        });
        if (followIndirect) {
            const addr2 = h.updatedTo(addr);
            assert.isTrue(addr2 !== undefined);
            todo.push(addr2);
        }
        else {
            const newAddrs = h.nodeAddrs(addr);
            for (const addr2 of newAddrs) {
                assert.isTrue(addr2 !== undefined);
            }
            todo.push(...newAddrs.slice().reverse());
            if (showTypes) {
                todo.push(h.typeAt(addr));
            }
        }
    }
    return info;
}
export function showGraph(h, roots, showTypes = false, showOrig = false, followIndirection = true) {
    roots ??= h.allAddrs();
    const todo = roots.slice().reverse().filter(a => isAddrYes(a));
    const done = new Set;
    const lines = [];
    while (todo.length !== 0) {
        const addr = todo.pop();
        if (isAddrNo(addr) || done.has(addr)) {
            continue;
        }
        assert.isTrue(addr !== undefined);
        done.add(addr);
        const inStack = roots.indexOf(addr) !== -1 ? ">" : " ";
        const showValue = showOrig || !h.isUpdated(addr);
        const addrStr = showNum(4, addr);
        const indiStr = h.isUpdated(addr) ? showNum(4, h.updatedTo(addr)) : " ".repeat(4);
        const deptStr = !showValue ? " ".repeat(4) : `${h.depthOf(addr)}`;
        const typeStr = !showValue ? " ".repeat(4) : showNum(4, h.typeOf(addr));
        const targStr = !showValue ? " ".repeat(4) : showForm(h.targetFormOf(addr));
        const formStr = !showValue ? " ".repeat(4) : showForm(h.formOf(addr));
        const valuStr = !showValue ? " ".repeat(4) : h.showNode(addr);
        lines.push(`${inStack} ${addrStr}: ${indiStr} ${deptStr} ${typeStr} ${targStr} ${formStr} ${valuStr}`);
        if (followIndirection && h.isUpdated(addr)) {
            todo.push(h.updatedTo(addr));
            if (showOrig) {
                const newAddrs = h.nodeAddrs(addr);
                todo.push(...newAddrs.slice().reverse());
            }
        }
        else {
            const newAddrs = h.nodeAddrs(addr);
            todo.push(...newAddrs.slice().reverse());
            if (showTypes) {
                todo.push(h.typeOf(addr));
            }
        }
    }
    return lines;
}
export function graphShowExpr(h, addr) {
    try {
        // TODO Fix bugs in the readback code.
        const expr = readbackExpr(h, addr);
        const exprStr = prettyFerrum(expr);
        return exprStr;
    }
    catch (exc) {
        return `graphShowExpr: Exception (${exc}).`;
    }
}
export const tiEntryStyleDefns = {
    plain: {},
    tiTrue: { fg: "Green" },
    tiFalse: { fg: "Red" },
    tiUnkn: { fg: "Yellow" },
    tiContra: { fg: "Magenta" },
    // tiUnkn: { bg: "Yellow" },
    // tiContra: { bg: "Magenta" },
};
tiEntryStyleDefns;
function tiValStyle(s, val) {
    if (val === null) {
        return s.plain;
    }
    if (tiIsContradiction(val)) {
        return s.tiContra;
    }
    if (tiIsTrue(val)) {
        return s.tiTrue;
    }
    if (tiIsFalse(val)) {
        return s.tiFalse;
    }
    if (tiIsUnknown(val)) {
        return s.tiUnkn;
    }
    assert.unreachable();
}
function tiValMnemonic(val) {
    if (val === null) {
        return "-";
    }
    if (tiIsContradiction(val)) {
        return "X";
    }
    if (tiIsTrue(val)) {
        return "1";
    }
    if (tiIsFalse(val)) {
        return "0";
    }
    if (tiIsUnknown(val)) {
        return "?";
    }
    assert.unreachable();
}
export function showTi_addr(s, val, addr) {
    return uiText(tiValStyle(s, val), `${addr}`);
}
export function showTi_value(s, val) {
    if (val === null) {
        return "-";
    }
    return uiText(tiValStyle(s, val), tiValMnemonic(val));
}
export function showTi_ruleName(s, val, ruleName) {
    if (val === null) {
        return ruleName;
    }
    return uiText(tiValStyle(s, val), ruleName);
}
export function showTi_expr(h, tim, s, tie) {
    function stie(tie) {
        switch (tie.tag) {
            case "TiConst":
                //return tiSymbol(tie.value)
                return showTi_value(s, tie.value);
            case "TiRef": {
                const entry = tim.get(tie.ref);
                const key = tim.get(tie.ref).ty;
                const key2 = h.directAddrOf(key);
                return showTi_addr(s, entry.value, key2);
            }
            case "TiNot":
                return uiTextList("Not ", stie(tie.a));
            case "TiAnd":
                return uiTextList("(", stie(tie.a), " && ", stie(tie.b), ")");
            case "TiAndImp":
                return uiTextList("(", stie(tie.a), " &&-> ", stie(tie.b), ")");
            case "TiOr":
                return uiTextList("(", stie(tie.a), " || ", stie(tie.b), ")");
            case "TiOrImp":
                return uiTextList("(", stie(tie.a), " ||-> ", stie(tie.b), ")");
            default:
                assert.noMissingCases(tie);
        }
    }
    return stie(tie);
}
//# sourceMappingURL=graph-show.js.map