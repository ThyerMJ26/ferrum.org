import { assert } from "../utils/assert.js";
// Syntax
import { eDatum, eTypeAnnot, eVar, exprAddNilLoc, visitAll, visitChildren, visitParentOrChildren } from "../syntax/expr.js";
import { scan2Fe, scanFile } from "../syntax/scan.js";
import { ParseState } from "../syntax/parse.js";
import { parseTerm, parseFile } from "../syntax/parseFerrum2.js";
import { mkLoc, mkPos, nilLoc } from "../syntax/token.js";
import { prettyFerrum } from "../syntax/pretty-ferrum.js";
// Tree
import { getPrimEnv } from "../tree/eval.js";
import { anyT, trimEnviron, typeDeclBidir, typeExprBidir } from "../tree/types.js";
import { initPrimitives } from "../tree/primitives.js";
// Graph
import { depthZero, assumeIsType } from "../graph/graph-heap2.js";
import { mkHeap_AoUoS } from "./graph-heap2-impl1.js";
import { mkInstantiate } from "../graph/graph-instantiate.js";
import { mkPrims } from "./graph-primitives.js";
import { mkGraphReduce } from "./graph-reduction.js";
import { mkShow, showGraph } from "../graph/graph-show.js";
import { tiIsContradiction, tiIsTrue, tiIsFalse, tiIsUnknown } from "../graph/graph-ti.js";
import { mkTiCalcFuncs } from "./graph-ti-calc.js";
import { mkTiMemoFuncs } from "./graph-ti-memo.js";
import { mkTiRules } from "./graph-ti-rules.js";
import { mkTiStructuralFuncs } from "./graph-ti-structural.js";
import { readback } from "../graph/graph-readback.js";
import { mkSubstitute } from "./graph-substitute.js";
import { graphPredicatesMk } from "../graph/graph-predicates.js";
import { mkGraphApply } from "./graph-apply.js";
// Codegen
import { codeRunnerMakers } from "../codegen/code-runners.js";
export function tcsZero() {
    return { pass: 0, unknown: 0, fail: 0, internalError: 0, null: 0, undefined: 0 };
}
export function tcsAdd(total, tcs) {
    total.pass += tcs.pass;
    total.unknown += tcs.unknown;
    total.fail += tcs.fail;
    total.internalError += tcs.internalError;
    total.null += tcs.null;
    total.undefined += tcs.undefined;
}
export function tcSummariseTree2(expr) {
    const tcs = tcsZero();
    visitParentOrChildren(expr, function visit(field, expr) {
        switch (expr.tc) {
            case "ok":
                tcs.pass++;
                break;
            case "unproven":
                tcs.unknown++;
                break;
            case "error":
                tcs.fail++;
                break;
            // case null: break
            // case null: tcs.unknown++; break
            case null:
                tcs.null++;
                break;
            case undefined:
                tcs.undefined++;
                break;
            default:
                // tcs.unknown++; break
                assert.noMissingCases(expr.tc);
        }
        visitChildren(expr, visit);
    });
    return tcs;
}
export function tcSummariseGraph2(g, expr) {
    const tcs = tcsZero();
    visitParentOrChildren(expr, function visit(field, expr) {
        const e2 = expr;
        if (e2.torp !== undefined && e2.synTy !== undefined && e2.ctxTy !== undefined) {
            // if (locMatch(e2.loc, null, 1, 8, 1, 11)) { 
            //     assert.breakpoint()
            // }
            // We can either type-check every expression we visit.
            // const tiVal = g.ti.typeCheck2(e2.torp, e2.synTy, e2.ctxTy, e2.loc)
            // Or only use type-check results which have already been computed.
            const tiVal = g.ti.typeInhabCheck(e2.rc, e2.loc);
            // if (tiIsContradiction(tiVal)) {
            //     // console.log(`TCS2: ${showLoc(e2.loc)} ${JSON.stringify(tiVal)}`)
            // }
            if (tiVal === null)
                tcs.null++;
            else if (tiIsContradiction(tiVal))
                tcs.internalError++;
            else if (tiIsTrue(tiVal))
                tcs.fail++;
            else if (tiIsUnknown(tiVal))
                tcs.unknown++;
            else if (tiIsFalse(tiVal))
                tcs.pass++;
            else
                assert.impossible("Unexpected case");
        }
        visitChildren(expr, visit);
    });
    return tcs;
}
//#endregion
export const graphMode_short = [
    "B", // Bypass, don't use the heap at all.
    "I", // Instantiate the decls with "unknown" for every type, no graph-types or graph-reduction.
    "T", // Types
    "D", // Decls
    // "E", // Exprs 
    "TD",
    // "TE",
    "DE",
    "TDE",
    //     T => Instantiate the decls with types, graph-reduce and type-check the graph-types
    // not T => otherwise, use "Unknown" for every type, and skip type-checking 
    //              (equiv: use { Unknown \ Unknown } for every check, for which the TiVal will be TiUnknown)
    //
    //     D => Instantiate and graph-reduce each decl.
    //            if any specializing applications are encountered, graph-reduce them correctly.
    // not D => otherwise, instantiate, but no graph-reduction.
    //
    //     E => Instantiate, graph-reduce, readback the expect-expressions (or whatever expression it is whose value we need)
    //            pass the fully or partially reduced expression on to whichever code-runner is in use.
    // not E => otherwise, pass the expression directly to the code-runner.
    // Common uses
    // TD -  Intended default
    // T  -  See that the decls type-check before thinking about graph-reduction or specialization.
    // D  -  See that the term-level graph-reduction works correctly before thinking about types.
    // *E -  Just for stress testing the graph-reduction code and primitives.
    // E and TE are currently forbidden.
    // Reducing expressions without first reducing the declarations works,
    //   but it means operating in an oddly lazy way.
    // This seems more likely to cause problems and confusion than benefits.
];
export const graphMode_long = [
    "Bypass",
    "Inst",
    "Types",
    "Decls",
    // "Exprs",
    "TypesDecls",
    // "TypesExprs",
    "DeclsExprs",
    "TypesDeclsExprs",
];
export function isGraphMode(mode) {
    const short = graphMode_short;
    const long = graphMode_long;
    return short.indexOf(mode) !== -1 || long.indexOf(mode) !== -1;
}
function codeOptions_codeRunnerKey(co) {
    return `${co.cg}-${co.inst}-${co.grD}`;
    // A belt-and-braces alternative, just include everything in the key.
    // return JSON.stringify(co) as CodeRunnerKey
}
class CodeTableImpl {
    // The prims and graph will always be the same for all related/connected code-tables.
    // TODO ? Group these into their own object ?
    _prims = [];
    g;
    _name;
    _decls;
    _source = null;
    _prev;
    _declsTy = null;
    _fullEnv = {};
    _localEnv = {};
    _fullEnvG = null;
    _bindings = [];
    // TODO ? // declsGr: DeclTypeGraph[]
    isInstantiated = false;
    typeCheckGr_done = false;
    _rbLetEnv = null;
    _rbDecls = null;
    crs = new Map;
    constructor(prev, g, name, decls) {
        assert.isTrue(prev === null || g === null);
        assert.isTrue(prev !== null || g !== null);
        this._prev = prev;
        this._name = name;
        this._decls = decls;
        this._fullEnv = { ...prev?._fullEnv };
        this.g = g ?? prev.g;
    }
    // "rowName" is the name of the new CodeTable row.
    // "filename" is used in the token locations.
    // The two names can be the same, but don't need to be.
    addCode(rowName, filename, language, source) {
        let [header, toks] = scanFile(filename, source, null, language, undefined);
        let ps = new ParseState(toks);
        let decls = parseFile(ps, header.language);
        const ct = new CodeTableImpl(this, null, rowName, decls);
        ct._source = source ?? null;
        return ct;
    }
    addText(rowName, varName, filename, source) {
        const lines = source.split("\n");
        const last = lines.at(-1) ?? "";
        const begin = mkPos(1, 1, 0);
        const end = mkPos(lines.length, last.length + 1, source.length);
        const loc = mkLoc(filename, begin, end);
        const pat = eTypeAnnot({ loc: nilLoc }, eVar({ loc: nilLoc }, varName), eVar({ loc: nilLoc }, "Str"));
        const defn = eDatum({ loc }, source);
        const ct = new CodeTableImpl(this, null, rowName, [[pat, defn]]);
        ct._source = source ?? null;
        return ct;
    }
    log(col, ...msgs) {
        console.log("CT", this.name(), col, ...msgs);
    }
    typeCheckTr(cb) {
        if (this._declsTy !== null)
            return;
        if (this._prev !== null) {
            this._prev.typeCheckTr();
            Object.assign(this._fullEnv, this._prev._fullEnv);
        }
        this.log("typeCheckTr");
        this._declsTy = [];
        for (const decl of this._decls) {
            if (cb?.pre_decl) {
                cb.pre_decl(decl);
            }
            const trimEnv = trimEnviron(decl, this._fullEnv);
            const [declTy, declEnv] = typeDeclBidir(decl, trimEnv, true);
            // this._declsTy.push(declTy)
            this._declsTy.push(decl);
            Object.assign(this._fullEnv, declEnv);
            Object.assign(this._localEnv, declEnv);
        }
    }
    instantiate(performTypeCheck) {
        if (this.isInstantiated) {
            return;
        }
        let fullEnvG;
        if (this._prev !== null) {
            this._prev.instantiate(performTypeCheck);
            assert.isTrue(this._prev._fullEnvG !== null);
            fullEnvG = this._prev._fullEnvG.clone();
        }
        else {
            fullEnvG = this.g.primitives.env().clone();
        }
        this.log("instantiate");
        for (const [pat, defn] of this.declsTy()) {
            const bindings = this.g.inst.instDecl(this.g.primitives, fullEnvG, depthZero, pat, defn, performTypeCheck);
            // TODO We need to collect typed and untyped instantiations separately.
            this._bindings.push(bindings);
        }
        // TODO We separate environments for typed and untyped instantiations.
        this._fullEnvG = fullEnvG.freeze();
        // this._localEnvG = localEnvG.freeze()
        this.isInstantiated = true;
    }
    readback() {
        // TODO handle reading back reduced and unreduced versions, according to co.grDecls, or take a parameter.
        if (this._rbDecls !== null)
            return this._rbDecls;
        if (this._prev !== null)
            this._prev.readback();
        this.log("readback");
        const decls2 = [];
        // const rbLetEnv = this._prev === null ? new Map : new Map(this._prev._rbLetEnv)
        const rbLetEnv = new Map(this._prev?._rbLetEnv);
        for (const patBind of this._bindings) {
            for (const { name, addr } of patBind) {
                // if (name === "scanSimple")
                //     assert.breakpoint()
                const rbLamEnv = new Map;
                // TODO If co.grDecls is false, readback should readback the unreduced code.
                const defn = readback(this.g.heap, rbLetEnv, rbLamEnv, "Term", addr);
                const defnLoc = exprAddNilLoc(defn);
                // // const v = eVar(nilLoc, name)
                // const v: ExprAddr & Expr & EVar = {tag: "EVar", name, addr, loc: nilLoc }
                // const declRb: Decl = [v, defnLoc]
                const declRb = [eVar({ loc: nilLoc }, name), defnLoc];
                decls2.push(declRb);
                rbLetEnv.set(addr, name);
            }
        }
        // cr.addDeclsAst(decls2)
        this._rbDecls = decls2;
        this._rbLetEnv = rbLetEnv;
        return decls2;
    }
    allDecls_accum(declsTy) {
        if (this._prev !== null) {
            this._prev.allDecls_accum(declsTy);
        }
        this.typeCheckTr();
        assert.isTrue(this._declsTy !== null);
        declsTy.push(...this._declsTy);
    }
    allDecls() {
        const declsTy = [];
        this.allDecls_accum(declsTy);
        return declsTy;
    }
    typeCheckGr() {
        if (this.typeCheckGr_done) {
            return true;
        }
        const performTypeCheck = true;
        this.instantiate(performTypeCheck);
        if (this._prev !== null) {
            this._prev.typeCheckGr();
        }
        this.log("typeCheckGr");
        visitAll("", this.declsTy(), null, (field, e) => {
            if (e instanceof Array) {
                return;
            }
            assert.isTrue(this.g !== null);
            // const e2 = e
            const e2 = e;
            // const tc_graph = this.g.ti.typeCheck(e2.torp, e2.synTy as TypeAddr, e2.ctxTy as TypeAddr, e2.loc)
            // if (locMatch(e2.loc, null, 5,14, 9,11)) { 
            //     assert.breakpoint()
            // }
            const tc_graph = this.g.ti.typeCheck(e2.torp, e2.synTy, e2.ctxTy, e2.loc);
            // if (tiIsContradiction(tc_graph)) {
            // console.log(`TC2: ${showLoc(e2.loc)} ${JSON.stringify(tc_graph)}`)
            // }
        });
        this.typeCheckGr_done = true;
        return true; // all done, no more fuel required
    }
    tcSummaryTr() {
        const tcsGraph = tcSummariseTree2(this.declsTy());
        return tcsGraph;
    }
    tcSummaryGr() {
        this.typeCheckGr();
        const tcsGraph = tcSummariseGraph2(this.graph(), this.allDecls());
        return tcsGraph;
    }
    // tcSummaryTr_allDecls(): [DeclTypeBidir, TcSummary][] {
    //     assert.todo()
    // }
    // tcSummaryGr_allDecls(fuel: number): [DeclTypeGraph, TcSummary][] {
    //     assert.todo()
    // }
    tcSummaryTr_expr(expr) {
        // this.typeCheckTr()
        const tcs = tcSummariseTree2(expr);
        return tcs;
    }
    tcSummaryGr_expr(expr) {
        // const fuel = fuel_r.read()
        // if (fuel.isStopped() || fuel.isExhausted()) return tcsZero()
        // this.typeCheckGr(fuel_r)
        // this.typeCheckGr_expr(expr, fuel)
        assert.isTrue(this.g !== null);
        const tcs = tcSummariseGraph2(this.g, expr);
        return tcs;
    }
    specialize() {
        assert.todo();
    }
    codegen(co) {
        const crk = codeOptions_codeRunnerKey(co);
        let cr = this.crs.get(crk);
        if (cr !== undefined) {
            return;
        }
        if (this._prev !== null) {
            this._prev.codegen(co);
            cr = this._prev.crs.get(crk).clone();
        }
        else {
            cr = codeRunnerMakers[co.cg]();
        }
        this.typeCheckTr();
        this.crs.set(crk, cr);
        if (this._prev === null) {
            // Don't generate code for the first row of the code-table.
            return;
        }
        if (!co.inst) {
            this.log("codegen");
            cr.addDeclsAst(this.declsTy());
        }
        else {
            this.instantiate(co.tyG);
            assert.isTrue(this.g !== null);
            assert.isTrue(this._fullEnvG !== null);
            for (const d0 of this.decls()) {
                const d = d0;
                assert.isTrue(d[1].tm !== undefined);
                this.g.gr.reduce(d[1].tm);
            }
            const rbDecls = this.readback();
            this.log("codegen");
            cr.addDeclsAst(rbDecls);
        }
        // this.crs.set(crk, cr)
    }
    typeCheckTr_expr(expr) {
        this.typeCheckTr();
        assert.todo();
    }
    typeExpr(exp) {
        const topLevel = true;
        const exp2 = typeExprBidir(exp, anyT, this.fullEnvT(), topLevel);
        // return exp2
        return exp;
    }
    typeExprStr(expStr, lineStarts) {
        this.typeCheckTr();
        let expTokens = scan2Fe("", expStr, null, lineStarts);
        let expPS = new ParseState(expTokens);
        let expAst = parseTerm(expPS, "ferrum/0.1");
        const topLevel = true;
        return typeExprBidir(expAst, anyT, this.fullEnvT(), topLevel);
    }
    instantiate_expr(expr) {
        const performTypeCheck = true;
        this.instantiate(performTypeCheck);
        assert.isTrue(this.g !== null);
        assert.isNotNull(this._fullEnvG);
        const anyTy = this.primAddr("Any");
        const exprG = this.g.inst.instTerm(this.g.primitives, this._fullEnvG, depthZero, expr, anyTy, performTypeCheck);
        // return exprG
        return expr;
    }
    instantiate_exprStr(language, expStr, lineStarts) {
        this.typeCheckTr();
        let expTokens = scan2Fe("", expStr, null, lineStarts);
        let expPS = new ParseState(expTokens);
        let expAst = parseTerm(expPS, language ?? "ferrum/0.1");
        const exprG = this.instantiate_expr(expAst);
        return exprG;
    }
    typeCheckGr_expr(expr) {
        this.typeCheckGr();
        assert.todo();
    }
    typeCheckGr_expr_tiVal(e) {
        assert.isTrue(this.g !== null);
        // const tiVal = this.g?.ti.typeCheck2(e.torp, e.synTy, e.ctxTy, e.loc)
        const tiVal = this.g?.ti.typeInhabCheck(e.rc, e.loc);
        return tiVal;
    }
    coderun_exprList(co, exprList) {
        const crk = codeOptions_codeRunnerKey(co);
        this.codegen(co);
        const cr = this.crs.get(crk);
        const req = cr.requirements();
        if (req.typesT === true) {
            for (const expr of exprList) {
                typeExprBidir(expr, anyT, this.fullEnvT(), true);
            }
        }
        if (req.typesG === true) {
            // TODO No code-generators need this yet.
            assert.todo("Instantiate the expressions, so as to annotate the AST with graph-types.");
        }
        const result = cr.evaluateAndShowList(exprList);
        return result;
    }
    prev() {
        return this._prev;
    }
    name() {
        return this._name;
    }
    source() {
        return this._source;
    }
    root() {
        let root = this;
        while (root._prev !== null) {
            root = root._prev;
        }
        return root;
    }
    primitives() {
        return this.root()._prims;
    }
    // rows(): CodeTableRow[] {
    //     const rows: CodeTable[] = []
    //     let ct: CodeTable | null = this
    //     do {
    //         rows.push(ct)
    //         ct = ct.prev()
    //     } while (ct !== null)
    //     rows.reverse()
    //     return rows
    // }
    rows() {
        // This returns all but the first row.
        // The first row corresponds to the empty table.
        // It is all that exists before any calls to addCode/addText are called.
        const rows = [];
        let ct = this;
        while (ct._prev !== null) {
            rows.push(ct);
            ct = ct._prev;
        }
        rows.reverse();
        return rows;
    }
    decls() {
        return this._decls;
    }
    declsTy() {
        this.typeCheckTr();
        assert.isTrue(this._declsTy !== null);
        return this._declsTy;
    }
    fullEnvT() {
        this.typeCheckTr();
        assert.isTrue(this._fullEnv !== null);
        return this._fullEnv;
    }
    fullEnvG() {
        const performTypeCheck = true;
        this.instantiate(performTypeCheck);
        assert.isNotNull(this._fullEnvG);
        return this._fullEnvG;
    }
    primAddr(name) {
        // this.instantiate()
        assert.isTrue(this.g !== null);
        // const builtin = this.g.primitives.get(name)
        // if (builtin !== null && builtin.term !== undefined) {
        //     return builtin.term
        // }
        // return null
        const env = this.g.primitives.env();
        if (env.has(name)) {
            return env.get(name);
        }
        return null;
    }
    codeRunner(co) {
        const crk = codeOptions_codeRunnerKey(co);
        this.codegen(co);
        return this.crs.get(crk);
    }
    graph() {
        // TODO ? Create the graph/heap when needed ?
        // TODO ?   The null-ness of the graph is currently used to indicate if instantiation has taken place.
        // TODO ?   Perhaps need a separate flag to indicate instantiation
        // TODO ? Or maybe, incorporate whatever the direct access to Graph is being used for into the CodeTable
        // this.instantiate()
        assert.isTrue(this.g !== null);
        return this.g;
    }
}
export function mkCodeTable(opts) {
    let g = globalGraph;
    if (opts.monitor !== undefined) {
        g = Object.create(GraphPrototype);
        graphInit(g, { heap: globalHeap, monitor: opts.monitor });
    }
    const ct = new CodeTableImpl(null, g, "<primitives>", []);
    initPrimitives();
    // const initEnv = getPrimEnv()
    const primEnv = getPrimEnv();
    const initEnv = {}; // { "primitive": primEnv.primitive }
    const essential = [
        "primitive",
        "(+)", "(-)", "(*)",
        "(==)", "(>)", "(>=)", "(<)", "(<=)",
        "(&&)", "(||)",
        "(<$)", "(_$?)",
        "(|-)", "(|=)",
        "{&}", "{|}", "{\\}",
    ];
    for (const p of essential) {
        initEnv[p] = primEnv[p];
        const pat = eVar({ loc: nilLoc }, p);
        const gp = g.primitives.get(p) ?? g.primitives.get(`(${p})`);
        const tyVoid = ct.primAddr("Void");
        assumeIsType(tyVoid);
        const pat2 = { ...pat, tm: gp?.term, synTy: gp.type, ctxTy: gp.type, torp: "Term", rc: tyVoid };
        // ct._decls.push([pat2, pat2])
        ct._prims.push(pat2);
    }
    // TODO Stop using localEnv
    ct._localEnv = initEnv;
    ct._fullEnv = initEnv;
    return ct;
}
export const graphMonitorNop = {
    graphReduction(addr, tag) { },
    tiExpansion(addr) { },
    tiReduction(addr) { },
};
// GraphPrototype exists purely for diagnostic use in the NodeJs REPL.
// The methods are not intended to be called from within the code base.
const GraphPrototype = {
    showRb(addr) {
        const g = this;
        const rbLetEnv = new Map;
        const rbLamEnv = new Map;
        const expr = readback(g.heap, rbLetEnv, rbLamEnv, "Term", addr);
        return prettyFerrum(expr);
    },
    showAddrs(addr) {
        const g = this;
        const addrs = [addr];
        // Follow and collect the chain of indirections, if there are any.
        while (g.heap.isUpdated(addr)) {
            addr = g.heap.updatedTo(addr);
            addrs.push(addr);
        }
        return addrs.join(" -> ");
    },
    showGraph(addr, showTypes = false, showOrig = false, followIndirection = true) {
        const g = this;
        const lines = showGraph(g.heap, [addr], showTypes, showOrig, followIndirection);
        return lines.join("\n");
    },
    showNode(addr) {
        const g = this;
        return g.heap.showNode(addr);
    },
    showEntry(addr) {
        const g = this;
        return g.heap.showEntry(addr);
    },
};
function graphInit(g, opts) {
    let initialized = false;
    let monitor = graphMonitorNop;
    if (opts.monitor !== undefined) {
        const mon = opts.monitor;
        monitor = {
            graphReduction(addr, tag) {
                if (!initialized)
                    return;
                mon.graphReduction(addr, tag);
            },
            tiExpansion(addr) {
                if (!initialized)
                    return;
                mon.tiExpansion(addr);
            },
            tiReduction(addr) {
                if (!initialized)
                    return;
                mon.tiReduction(addr);
            },
        };
    }
    g.heap = opts.heap ?? mkHeap_AoUoS();
    g.monitor = monitor;
    g.tim = mkTiMemoFuncs(new Map);
    g.primitives = mkPrims();
    g.subst = mkSubstitute(g.heap);
    g.pred = graphPredicatesMk(g.heap);
    g.tis = mkTiStructuralFuncs(g.heap, g.pred);
    g.tiRules = mkTiRules(g.heap, g.tim, g.pred, g.tis);
    g.ga = mkGraphApply(g.heap, g.subst, g.pred, g.tis);
    g.gr = mkGraphReduce(g.heap, g.subst, g.primitives, g.ga, monitor);
    g.ti = mkTiCalcFuncs(g.heap, g.gr, g.tim, g.tis, g.tiRules, monitor);
    g.show = mkShow(g.heap);
    g.inst = mkInstantiate(g.heap, g.gr, g.pred, g.ti);
    g.primitives.init(g.heap, g.subst, g.inst, g.pred, g.tis, g.ga);
    initialized = true;
    // reportMissingPrimitives(initEnv, g.env, g.primitives)
}
// function reportMissingPrimitives(te: Env, ge: GraphEnv, gp: Primitives) {
//     for (const [name,] of Object.entries(te)) {
//         if (!(ge.has(name) || gp.getTmOp(name) || gp.getTyOp(name))) {
//             console.error(`Missing Graph Primitive (CodeTable): (${name})`)
//         }
//     }
// }
// function graph_copy(g: Graph): Graph {
//     return g
//     // const g2: Graph = Object.create(GraphPrototype)
//     // Object.assign(g2, {
//     //     monitor: g.monitor,
//     //     heap: g.heap,
//     //     // env: g.env.clone(),
//     //     env: g.env,
//     //     subst: g.subst,
//     //     inst: g.inst,
//     //     tis: g.tis,
//     //     primitives: g.primitives,
//     //     gr: g.gr,
//     //     tim: g.tim,
//     //     tiRules: g.tiRules,
//     //     ti: g.ti,
//     //     show: g.show,
//     // });
//     // return g2
// }
// Using a single common root code-table is the simplest way to ensure every address is unique.
// Every code-table which branches off this one will share the same underlying heap.
// Having multiple heaps can make bugs harder to diagnose.
//   Of course it's better not to have the bugs,
//   but its easier to diagnose bugs if each address can only have (at most) one possible value.
// Global-graph
//   This makes "gg" available in the REPL, regardless of which file/stack-context is current,
//   (so long as there isn't a local "gg" variable shadowing this one).
// globalEmptyCodeTable.instantiate();
// (globalThis as any as {gg: Graph}).gg = (globalEmptyCodeTable as CodeTableImpl).g!;
// Assigning to "gg" before initializing the graph 
//   makes "gg" available (for debug purposes) during initialization,
//   albeit in a semi-initialized state.
const globalHeap = mkHeap_AoUoS();
const globalGraph = Object.create(GraphPrototype);
// const globalGraph = new GraphImpl(mkHeap_AoUoS(), graphMonitorNop);
globalThis.gg = globalGraph;
graphInit(globalGraph, { heap: globalHeap });
//#endregion
//# sourceMappingURL=code-table.js.map