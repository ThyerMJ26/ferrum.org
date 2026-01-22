import { assert } from "../utils/assert.js";
import { locMerge } from "./token.js";
// These are the operators that mean (almost) the same in Ferrum and JS/C.
//   ( The "&&"" and "||"" operators are sometimes unconventionally strict in Ferrum and will be replaced with "and" and "or". )
export function concreteJsOpName(name) {
    switch (name) {
        case "(+)": return "+";
        case "(-)": return "-";
        case "(*)": return "*";
        case "(==)": return "==";
        case "(>)": return ">";
        case "(>=)": return ">=";
        case "(<)": return "<";
        case "(<=)": return "<=";
        case "(&&)": return "&&";
        case "(||)": return "||";
        default:
            return null;
    }
}
export function mkOperatorTable() {
    const rules = new Map;
    // maps concrete names to operator definitions
    const infixOps = new Map;
    const prefixOps = new Map;
    const postfixOps = new Map;
    // maps abstract names to operator definitions
    const abstractOps = new Map;
    // TODO ? maps primitive names to operator definitions
    // const primitiveOps: Map<string, OpDefn> = new Map
    function addOp(fixity, concreteOps, nameC, nameA, tm, ty, rule) {
        assert.isFalse(concreteOps.has(nameC));
        // All ops should be defined before any are compared.
        assert.isTrue(compare_memo.size === 0);
        const opDefn = {
            nameA,
            nameP: {
                Term: tm === "Tm" ? `(${nameA})` : undefined,
                Type: ty === "Ty" ? `{${nameA}}` : undefined,
            },
            nameC,
            fixity,
            rule,
        };
        concreteOps.set(nameC, opDefn);
        abstractOps.set(nameA, opDefn);
    }
    const main_precedence = new Map;
    const left_precedence = new Map;
    const right_precedence = new Map;
    // Updates the contents of a specified precedence table row by 
    //   dereferencing each entry in the specified row through the main table, and
    //   copying the contents from each corresponding main table row back into the specified row.
    function copyPrecedence(toTable, toRowName) {
        const toRow = toTable.get(toRowName);
        assert.isDefined(toRow);
        const oldSize = toRow.size;
        for (const fromRowName of toRow) {
            const fromRow = main_precedence.get(fromRowName);
            assert.isDefined(fromRow);
            for (const elem of fromRow) {
                toRow.add(elem);
            }
        }
        return toRow.size - oldSize;
    }
    function printTable(msg, table) {
        console.log(msg);
        for (const r of rules.values()) {
            const row = table.get(r.name) ?? [];
            console.log("  ", r.name.padEnd(20), ":", ...row.values());
        }
    }
    function computeTables() {
        // computeTables only expects to be called once.
        // We could support the incremental addition of new rules, 
        //   if user-defined operators are to be supported,
        //   but that's not currently the plan.
        assert.isTrue(left_precedence.size === 0 && right_precedence.size === 0);
        for (const r of rules.values()) {
            main_precedence.set(r.name, new Set(r.main_precedence));
            left_precedence.set(r.name, new Set(r.left_precedence));
            right_precedence.set(r.name, new Set(r.right_precedence));
        }
        // Compute the transitive closure of the main-precedence table.
        // let count = 0
        // printTable(`Main ${count}`, main_precedence)
        let numAdditions;
        do {
            numAdditions = 0;
            for (const r of rules.values()) {
                numAdditions += copyPrecedence(main_precedence, r.name);
            }
            // count += 1
            // printTable(`Main ${count}`, main_precedence)
        } while (numAdditions !== 0);
        for (const r of rules.values()) {
            copyPrecedence(left_precedence, r.name);
            copyPrecedence(right_precedence, r.name);
        }
        // printTable(`Left`, left_precedence)
        // printTable(`Right`, right_precedence)
        // Check every pair of rules upfront so as to check for contradictions.
        // (Doing this is optional.)
        for (const a of rules.values()) {
            for (const b of rules.values()) {
                compareMemoized(a.name, b.name);
            }
        }
    }
    // Given two operators, return which one, if either, binds tighter.
    function compare(lhs, rhs) {
        // Check if the left-precedence  of the RHS operator contains the LHS operator.
        // And   if the right-precedence of the LHS operator contains the RHS operator.
        const left = left_precedence.get(rhs)?.has(lhs);
        const right = right_precedence.get(lhs)?.has(rhs);
        assert.isDefined(left);
        assert.isDefined(right);
        if (left && right) {
            console.error(`Contradiction:  ${lhs} ${rhs}`);
            return "Contradiction";
        }
        assert.isFalse(left && right);
        const result = left ? "Left" :
            right ? "Right" :
                "None";
        return result;
    }
    // This memoization probably doesn't save much/any time.
    // It does provide an easy way to only print out diagnostics once for each pair of rules.
    // Either early, upfront, or later, in context.
    const compare_memo = new Map;
    function compareMemoized(lhs, rhs) {
        const key = `${lhs} ${rhs}`;
        let result = compare_memo.get(key);
        if (result === undefined) {
            result = compare(lhs, rhs);
            compare_memo.set(key, result);
            // console.log(`OP:   ${lhs.padEnd(20)} ${rhs.padEnd(20)} ${result}`)
        }
        return result;
    }
    function opRule(name, assoc, main_precedence) {
        const left_precedence = [...main_precedence];
        const right_precedence = [...main_precedence];
        switch (assoc) {
            case "Left":
                left_precedence.push(name);
                break;
            case "Right":
                right_precedence.push(name);
                break;
            case "None": break;
            default: assert.noMissingCases(assoc);
        }
        rules.set(name, { name, assoc, left_precedence, right_precedence, main_precedence });
    }
    function syRule(name, left_precedence, right_precedence) {
        rules.set(name, { name, left_precedence, right_precedence, main_precedence: [] });
    }
    return {
        /*** Build ***/
        addInfix(name, tm, ty, rule) {
            assert.isFalse(postfixOps.has(name), "An operator cannot be both infix and postfix.");
            addOp("Infix", infixOps, name, `${name}`, tm, ty, rule);
        },
        addPrefix(name, tm, ty, rule) {
            addOp("Prefix", prefixOps, name, `${name}_`, tm, ty, rule);
        },
        addPostfix(name, tm, ty, rule) {
            assert.isFalse(infixOps.has(name), "An operator cannot be both infix and postfix.");
            addOp("Postfix", postfixOps, name, `_${name}`, tm, ty, rule);
        },
        opRule,
        syRule,
        update() {
            computeTables();
        },
        /*** Query ***/
        getInfix(name) {
            const op = infixOps.get(name);
            return op;
        },
        getPrefix(name) {
            const op = prefixOps.get(name);
            return op;
        },
        getPostfix(name) {
            const op = postfixOps.get(name);
            return op;
        },
        compare(lhs, rhs) {
            if (rhs === null)
                return "Left";
            return compareMemoized(lhs, rhs);
        },
    };
}
export function operatorParser(ot, mkOp, tort, exprs) {
    // The opStack and argStack could be combined into a single stack.
    // That would be more conventional for an LR shift-reduce parser.
    //   We would then be comparing the top few elements of the stack with the right-hand sides of all the grammar production rules.
    // As it is, with simpler rules, we are only interested in the top-most operator,
    // Using separate stacks makes the top-most operator easier to access.
    // But we need to keep note of which stack we last pushed to,
    //   that's what the "juxtaposedApplyPossible" flag does.
    const opStack = [];
    const argStack = [];
    let juxtaposedApplyPossible = false;
    // This reduces any operators in the operator stack that bind more tightly than the given reference rhs opDefn.
    function reduce(rightOpDefn) {
        while (opStack.length !== 0) {
            let [leftOpLoc, leftOpDefn] = opStack[opStack.length - 1];
            const precedence = ot.compare(leftOpDefn.rule, rightOpDefn?.rule ?? null);
            switch (precedence) {
                case "None":
                case "Contradiction":
                    opStack.pop();
                    argStack.pop();
                    if (leftOpDefn.fixity === "Infix") {
                        argStack.pop();
                    }
                    const error = mkOp.mkParseError(leftOpLoc, `No precedence relationship exists between operators (${leftOpDefn.nameC}) and (${rightOpDefn?.nameC}).`);
                    argStack.push(error);
                    return;
                case "Right":
                    return;
                case "Left": {
                    switch (leftOpDefn.fixity) {
                        case "Prefix": {
                            let arg1 = argStack.pop() ?? mkOp.mkParseError(leftOpLoc, "Missing argument.");
                            opStack.pop();
                            const op = mkOp.mkPrefix(tort, leftOpDefn, leftOpLoc, arg1);
                            argStack.push(op);
                            break;
                        }
                        case "Infix": {
                            let arg2 = argStack.pop() ?? mkOp.mkParseError(leftOpLoc, "Missing argument.");
                            let arg1 = argStack.pop() ?? mkOp.mkParseError(leftOpLoc, "Missing argument.");
                            opStack.pop();
                            let op = mkOp.mkInfix(tort, leftOpDefn, leftOpLoc, arg1, arg2);
                            argStack.push(op);
                            break;
                        }
                        default:
                            assert.noMissingCases(leftOpDefn.fixity);
                    }
                    break;
                }
                default:
                    assert.noMissingCases(precedence);
            }
        }
    }
    for (const expr of exprs) {
        if (expr.tag === "ESym") {
            if (!juxtaposedApplyPossible) {
                const opDefn = ot.getPrefix(expr.name);
                if (opDefn === undefined) {
                    return mkOp.mkParseError(expr.loc, `Unknown prefix operator "${expr.name}".`);
                }
                opStack.push([expr.loc, opDefn]);
            }
            else {
                const opDefn = ot.getInfix(expr.name) ?? ot.getPostfix(expr.name);
                if (opDefn === undefined) {
                    return mkOp.mkParseError(expr.loc, `Unknown infix/postfix operator "${expr.name}".`);
                }
                switch (opDefn.fixity) {
                    case "Infix":
                        reduce(opDefn);
                        opStack.push([expr.loc, opDefn]);
                        juxtaposedApplyPossible = false;
                        break;
                    case "Postfix":
                        reduce(opDefn);
                        let arg1 = argStack.pop() ?? mkOp.mkParseError(expr.loc, "Missing argument.");
                        const op = mkOp.mkPostfix(tort, opDefn, expr.loc, arg1);
                        argStack.push(op);
                        // The postfix operator "$?" here:
                        //   a b $? b c
                        // means
                        //   (a b $?) b c
                        // This would be a terrible idea, 
                        //   if it wasn't for the fact that the "$?" operator
                        //   reduces to the identity function.
                        juxtaposedApplyPossible = true;
                        break;
                    default:
                        assert.noMissingCases(opDefn);
                }
            }
        }
        else {
            if (juxtaposedApplyPossible) {
                // TODO ? Rather than calling mkOp.mkAppy immediately (or at all) here,
                // TODO ?   we imagine we've just seen the juxtaposition operator "",
                // TODO ?   and then call mkOp.mkInfix("", ...) later.
                // TODO ? We then handle this juxtaposition operator much like any other operator,
                // TODO ?   looking it up in the user supplied operator-table.
                // TODO ? This shifts the meaning/precedence/associativity of juxtaposition from here 
                // TODO ?   to the operator-table (and mkOp.mkInfix("", ...)).
                // TODO ? Imagining juxtaposition operators on the fly seems cleaner than adding
                // TODO ?   an additional pass that inserts all the juxtaposition operators upfront.
                const fun = argStack.pop() ?? mkOp.mkParseError(expr.loc, "Missing argument.");
                const app = mkOp.mkApply("", fun, expr);
                argStack.push(app);
            }
            else {
                argStack.push(expr);
                juxtaposedApplyPossible = true;
            }
        }
    }
    reduce(null);
    if (argStack.length !== 1 || opStack.length !== 0) {
        const errorLoc = locMerge(exprs[0].loc, exprs[exprs.length - 1].loc);
        return mkOp.mkParseError(errorLoc, "Operator Parsing Failed.");
    }
    const result = argStack[0];
    return result;
}
//# sourceMappingURL=operator.js.map