
// Utils
import { unit } from "../utils/unit.js"
import { assert } from "../utils/assert.js"
import { mkEnv } from "../utils/env.js"

// Syntax
import {
    DeclLoc, DeclTypeBidir, eDatum, eTypeAnnot, EVar, eVar, ExprLoc, exprAddNilLoc, ExprTree, ExprTypeBidir, showExp2, showExpConcise, visitAll, visitChildren, visitParentOrChildren
} from "../syntax/expr.js"
import { scan2Fe, scanFile } from "../syntax/scan.js"
import { ParseState } from "../syntax/parse.js"
import { parseTerm, parseType, parseFile } from "../syntax/parseFerrum2.js"
import { locMatch, mkLoc, mkPos, nilLoc, Pos, showLoc } from "../syntax/token.js"
import { prettyFerrum } from "../syntax/pretty-ferrum.js"

// Tree
import { Env, getPrimEnv } from "../tree/eval.js"
import { anyT, maxTypeCheckResult, showTypeWithoutSubSuperBounds, trimEnviron, TypeCheckResult, typeDeclBidir, typeExprBidir } from "../tree/types.js"
import { initPrimitives } from "../tree/primitives.js"

// Graph
import { Addr, depthZero, Heap, TypeAddr, GraphEnvR, GraphEnvRw, GraphEnvRo, assumeIsType } from "../graph/graph-heap2.js"
import { mkHeap_AoUoS } from "./graph-heap2-impl1.js"
import { Bindings, DeclTypeGraph, ExprTypeGraph, Instantiate, mkInstantiate } from "../graph/graph-instantiate.js"
import { Primitives, mkPrims } from "./graph-primitives.js"
import { GraphReduce, mkGraphReduce } from "./graph-reduction.js"
import { ShowFuncs, mkShow, showGraph } from "../graph/graph-show.js"
import { tiIsContradiction, tiIsTrue, tiIsFalse, tiIsUnknown, TiRules, TiVal } from "../graph/graph-ti.js"
import { TiCalcFuncs, mkTiCalcFuncs } from "./graph-ti-calc.js"
import { TiMemoFuncs, mkTiMemoFuncs } from "./graph-ti-memo.js"
import { mkTiRules } from "./graph-ti-rules.js"
import { TiStructuralFuncs, mkTiStructuralFuncs } from "./graph-ti-structural.js"
import { ExprAddr, RbLamEnv, RbLetEnv, readback, readbackExpr, readbackType } from "../graph/graph-readback.js"
import { mkSubstitute, Substitute } from "./graph-substitute.js"
import { GraphPredicates, graphPredicatesMk } from "../graph/graph-predicates.js"
import { GraphApply, mkGraphApply } from "./graph-apply.js"

// Codegen
import { CodeRunner, codeRunnerMakers, CodeRunnerName } from "../codegen/code-runners.js"

//#region TcSummary

export type TcSummary = {
    pass: number,
    unknown: number,
    fail: number,
    internalError: number,
    null: number
    undefined: number
}

export function tcsZero(): TcSummary {
    return { pass: 0, unknown: 0, fail: 0, internalError: 0, null: 0, undefined: 0 }
}

export function tcsAdd(total: TcSummary, tcs: TcSummary) {
    total.pass += tcs.pass
    total.unknown += tcs.unknown
    total.fail += tcs.fail
    total.internalError += tcs.internalError
    total.null += tcs.null
    total.undefined += tcs.undefined
}

export function tcSummariseTree2(expr: ExprTree<ExprTypeBidir>): TcSummary {
    const tcs = tcsZero()
    visitParentOrChildren(expr, function visit(field, expr: ExprTypeBidir) {
        switch (expr.tc) {
            case "ok": tcs.pass++; break
            case "unproven": tcs.unknown++; break
            case "error": tcs.fail++; break
            // case null: break
            // case null: tcs.unknown++; break
            case null: tcs.null++; break
            case undefined: tcs.undefined++; break
            default:
                // tcs.unknown++; break
                assert.noMissingCases(expr.tc)
        }
        visitChildren(expr, visit)
    })
    return tcs
}

export function tcSummariseGraph2(g: Graph, expr: ExprTree<ExprTypeGraph>): TcSummary {
    const tcs = tcsZero()
    visitParentOrChildren(expr, function visit(field, expr: ExprTypeGraph) {
        const e2 = expr as ExprLoc as ExprTypeGraph
        if (e2.torp !== undefined && e2.synTy !== undefined && e2.ctxTy !== undefined) {
            // if (locMatch(e2.loc, null, 1, 8, 1, 11)) { 
            //     assert.breakpoint()
            // }

            // We can either type-check every expression we visit.
            // const tiVal = g.ti.typeCheck2(e2.torp, e2.synTy, e2.ctxTy, e2.loc)
            // Or only use type-check results which have already been computed.
            const tiVal = g.ti.typeInhabCheck(e2.rc, e2.loc)

            // if (tiIsContradiction(tiVal)) {
            //     // console.log(`TCS2: ${showLoc(e2.loc)} ${JSON.stringify(tiVal)}`)
            // }
            if (tiVal === null) tcs.null++
            else if (tiIsContradiction(tiVal)) tcs.internalError++
            else if (tiIsTrue(tiVal)) tcs.fail++
            else if (tiIsUnknown(tiVal)) tcs.unknown++
            else if (tiIsFalse(tiVal)) tcs.pass++
            else assert.impossible("Unexpected case")
        }
        visitChildren(expr, visit)
    })
    return tcs
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

] as const

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
] as const

export type GraphMode = (typeof graphMode_short)[number] | (typeof graphMode_long)[number]

export function isGraphMode(mode: string | null): mode is GraphMode {
    const short: readonly (string | null)[] = graphMode_short
    const long: readonly (string | null)[] = graphMode_long
    return short.indexOf(mode) !== -1 || long.indexOf(mode) !== -1
}


export type CodeOptions = {
    tyT: boolean,  // use tree-types
    tyG: boolean,  // use graph-types
    inst: boolean, // perform instantiation
    grD: boolean,  // graph-reduce top-level declarations
    grE: boolean,  // graph-reduce the test-file "expect" expression
    cg: CodeRunnerName
}


// CodeRunnerKey is a string which helps in reusing the code-runner generated code.
// The CodeRunnerName and CodeOptions fields which change the way in which code is generated are mangled into the key.
export type CodeRunnerKey = string & { __brand_CodeRunnerKey: never }

function codeOptions_codeRunnerKey(co: CodeOptions): CodeRunnerKey {
    return `${co.cg}-${co.inst}-${co.grD}` as CodeRunnerKey
    // A belt-and-braces alternative, just include everything in the key.
    // return JSON.stringify(co) as CodeRunnerKey
}


//#region CodeTable

// CodeTable computes and retains values (such as types, and generated code) derived from the source.
//   There are two axis to this:
//     - (vertical)   Source order: Project Decls -> Test Decls -> Test Exprs
//     - (horizontal) Phase  order: Types -> Specialization -> Readback -> CodeGen (Js, C, ...)
//   We could fully compute each source entry (row) before moving on to the next row.
//     This can improve sharing when the same project is used by many tests.
//     But this can mean doing a lot of codegen before type-checking is finished (its usually preferable know about type errors earlier).
//   We could fully compute each phase (column) before moving on to the next column.
//     This can be less good for sharing, if the project values are snapshotted when the test decls are first type-checked (which is now before project codegen),
//       this will result in lots of duplicated codegen effort.
//   Instead the row/column entries are computed (and retained) as-needed, 
//     sharing project codegen results, even when this is occurs after test type-checking.
// 


export type TypeCheckTr_Callback = {
    pre_decl: (decl: DeclLoc) => undefined
    // TODO ?
    // post_decl?: (decl: DeclTy) => undefined
}

export type CodeTable = {

    addCode(name: string, filename: string, language: string | null, source: string): CodeTable
    addText(name: string, varname: string, filename: string, source: string): CodeTable

    typeCheckTr(cb?: TypeCheckTr_Callback): unit
    instantiate(performTypeCheck: boolean): unit
    allDecls_accum(declsTy: DeclTypeBidir[]): unit
    allDecls(): DeclTypeBidir[]
    typeCheckGr(): boolean
    tcSummaryTr(): TcSummary
    tcSummaryGr(): TcSummary

    tcSummaryTr_expr(expr: ExprTree<ExprTypeBidir>): TcSummary
    tcSummaryGr_expr(expr: ExprTree<ExprTypeGraph>): TcSummary
    codegen(co: CodeOptions): unit
    typeCheckTr_expr(expr: ExprLoc): ExprTypeBidir

    typeExpr(exp: ExprLoc): ExprTypeBidir
    typeExprStr(expStr: string, lineStarts?: Pos[]): ExprTypeBidir
    instantiate_expr(expr: ExprLoc): ExprTypeGraph
    instantiate_exprStr(language: string | null, src: string, lineStarts?: Pos[]): ExprTypeGraph
    typeCheckGr_expr(expr: ExprLoc): ExprTypeGraph
    typeCheckGr_expr_tiVal(expr: ExprLoc): TiVal | null
    coderun_exprList(co: CodeOptions, exprList: ExprLoc[]): string[]

    name(): string
    source(): string | null
    decls(): DeclLoc[]
    declsTy(): DeclTypeBidir[]

    primitives(): EVar[]
    rows(): CodeTableRow[]

    fullEnvT(): Env
    fullEnvG(): GraphEnvRo
    primAddr(name: string): Addr | null


    codeRunner(co: CodeOptions): CodeRunner
    graph(): Graph
}


// TODO ? Separate CodeTable and CodeTableRow ?
// TODO They are almost, but not quite, the same thing.
// TODO   A CodeTable without any rows is still a CodeTable, despite not being a CodeTableRow.
// TODO   Rows each have a name, but not the overall table.
// TODO   The table has a full/accumulated environment, so do the individual rows.
// TODO     (rows don't have environments, that was a mistake)
export type CodeTableRow = CodeTable

// Tables are nodes, rows are edges between tables/nodes.
//   A row is solely concerned with transition to a table from its immediately preceeding table.
//   A table is the accumulation of all rows that lead to it.


// TODO ? A place for things which are common to all related code-tables.
type CodeTableCommon = {
    _prims: EVar[]
    g: Graph
}


class CodeTableImpl implements CodeTable, CodeTableRow {

    // The prims and graph will always be the same for all related/connected code-tables.
    // TODO ? Group these into their own object ?
    _prims: EVar[] = []
    g: Graph

    _name: string
    _decls: DeclLoc[]
    _source: string | null = null
    _prev: CodeTableImpl | null

    _declsTy: DeclTypeBidir[] | null = null
    _fullEnv: Env = {}
    _localEnv: Env = {}
    _fullEnvG: GraphEnvRo | null = null
    _bindings: Bindings[] = []
    // TODO ? // declsGr: DeclTypeGraph[]

    isInstantiated = false
    typeCheckGr_done = false

    _rbLetEnv: RbLetEnv | null = null
    _rbDecls: DeclLoc[] | null = null

    crs: Map<CodeRunnerKey, CodeRunner> = new Map


    constructor(prev: CodeTableImpl | null, g: Graph | null, name: string, decls: DeclLoc[]) {
        assert.isTrue(prev === null || g === null)
        assert.isTrue(prev !== null || g !== null)
        this._prev = prev
        this._name = name
        this._decls = decls
        this._fullEnv = { ...prev?._fullEnv }

        this.g = g ?? prev!.g
    }

    // "rowName" is the name of the new CodeTable row.
    // "filename" is used in the token locations.
    // The two names can be the same, but don't need to be.
    addCode(rowName: string, filename: string, language: string, source: string): CodeTable {
        let [header, toks] = scanFile(filename, source, null, language, undefined)
        let ps = new ParseState(toks)
        let decls = parseFile(ps, header.language)
        const ct = new CodeTableImpl(this, null, rowName, decls)
        ct._source = source ?? null
        return ct
    }

    addText(rowName: string, varName: string, filename: string, source: string): CodeTable {
        const lines = source.split("\n")
        const last = lines.at(-1) ?? ""
        const begin = mkPos(1, 1, 0)
        const end = mkPos(lines.length, last.length + 1, source.length)
        const loc = mkLoc(filename, begin, end)

        const pat = eTypeAnnot({ loc: nilLoc }, eVar({ loc: nilLoc }, varName), eVar({ loc: nilLoc }, "Str"))
        const defn = eDatum({ loc }, source)
        const ct = new CodeTableImpl(this, null, rowName, [[pat, defn]])
        ct._source = source ?? null
        return ct
    }

    log(col: string, ...msgs: string[]): unit {
        console.log("CT", this.name(), col, ...msgs)
    }

    typeCheckTr(cb?: TypeCheckTr_Callback): unit {
        if (this._declsTy !== null) return
        if (this._prev !== null) {
            this._prev.typeCheckTr()
            Object.assign(this._fullEnv, this._prev._fullEnv)
        }

        this.log("typeCheckTr")

        this._declsTy = []
        for (const decl of this._decls) {
            if (cb?.pre_decl) {
                cb.pre_decl(decl)
            }
            const trimEnv = trimEnviron(decl, this._fullEnv)
            const [declTy, declEnv] = typeDeclBidir(decl, trimEnv, true)

            // this._declsTy.push(declTy)
            this._declsTy.push(decl as DeclTypeBidir)

            Object.assign(this._fullEnv, declEnv)
            Object.assign(this._localEnv, declEnv)
        }
    }
    instantiate(performTypeCheck: boolean): unit {
        if (this.isInstantiated) {
            return
        }
        let fullEnvG: GraphEnvRw
        if (this._prev !== null) {
            this._prev.instantiate(performTypeCheck)
            assert.isTrue(this._prev._fullEnvG !== null)
            fullEnvG = this._prev._fullEnvG.clone()
        }
        else {
            fullEnvG = this.g.primitives.env().clone()
        }

        this.log("instantiate")

        for (const [pat, defn] of this.declsTy()) {
            const bindings = this.g.inst.instDecl(this.g.primitives, fullEnvG, depthZero, pat, defn, performTypeCheck)
            // TODO We need to collect typed and untyped instantiations separately.
            this._bindings.push(bindings)
        }
        // TODO We separate environments for typed and untyped instantiations.
        this._fullEnvG = fullEnvG.freeze()
        // this._localEnvG = localEnvG.freeze()
        this.isInstantiated = true
    }
    readback(): DeclLoc[] {
        // TODO handle reading back reduced and unreduced versions, according to co.grDecls, or take a parameter.
        if (this._rbDecls !== null) return this._rbDecls
        if (this._prev !== null) this._prev.readback()

        this.log("readback")

        const decls2: DeclLoc[] = []
        // const rbLetEnv = this._prev === null ? new Map : new Map(this._prev._rbLetEnv)

        const rbLetEnv = new Map(this._prev?._rbLetEnv)


        for (const patBind of this._bindings) {
            for (const { name, addr } of patBind) {
                // if (name === "scanSimple")
                //     assert.breakpoint()
                const rbLamEnv: RbLamEnv = new Map
                // TODO If co.grDecls is false, readback should readback the unreduced code.
                const defn = readback(this.g.heap, rbLetEnv, rbLamEnv, "Term", addr)
                const defnLoc = exprAddNilLoc(defn)
                // // const v = eVar(nilLoc, name)
                // const v: ExprAddr & Expr & EVar = {tag: "EVar", name, addr, loc: nilLoc }
                // const declRb: Decl = [v, defnLoc]
                const declRb: DeclLoc = [eVar({ loc: nilLoc }, name), defnLoc]
                decls2.push(declRb)
                rbLetEnv.set(addr, name)
            }
        }
        // cr.addDeclsAst(decls2)

        this._rbDecls = decls2
        this._rbLetEnv = rbLetEnv

        return decls2
    }
    allDecls_accum(declsTy: DeclTypeBidir[]): unit {
        if (this._prev !== null) {
            this._prev.allDecls_accum(declsTy)
        }
        this.typeCheckTr()
        assert.isTrue(this._declsTy !== null)
        declsTy.push(...this._declsTy)
    }
    allDecls(): DeclTypeBidir[] {
        const declsTy: DeclTypeBidir[] = []
        this.allDecls_accum(declsTy)
        return declsTy
    }
    typeCheckGr(): boolean {
        if (this.typeCheckGr_done) {
            return true
        }
        const performTypeCheck = true
        this.instantiate(performTypeCheck)
        if (this._prev !== null) {
            this._prev.typeCheckGr()
        }

        this.log("typeCheckGr")

        visitAll("", this.declsTy(), null, (field, e: ExprTree<ExprLoc>) => {
            if (e instanceof Array) {
                return
            }
            assert.isTrue(this.g !== null)
            // const e2 = e
            const e2 = e as ExprTypeGraph & ExprTypeBidir
            // const tc_graph = this.g.ti.typeCheck(e2.torp, e2.synTy as TypeAddr, e2.ctxTy as TypeAddr, e2.loc)
            // if (locMatch(e2.loc, null, 5,14, 9,11)) { 
            //     assert.breakpoint()
            // }
            const tc_graph = this.g.ti.typeCheck(e2.torp, e2.synTy as TypeAddr, e2.ctxTy as TypeAddr, e2.loc)
            // if (tiIsContradiction(tc_graph)) {
            // console.log(`TC2: ${showLoc(e2.loc)} ${JSON.stringify(tc_graph)}`)
            // }
        })

        this.typeCheckGr_done = true
        return true // all done, no more fuel required
    }

    tcSummaryTr(): TcSummary {
        const tcsGraph = tcSummariseTree2(this.declsTy())
        return tcsGraph
    }
    tcSummaryGr(): TcSummary {
        this.typeCheckGr()
        const tcsGraph = tcSummariseGraph2(this.graph(), this.allDecls() as ExprTree<any> as ExprTree<ExprTypeGraph>)
        return tcsGraph
    }

    // tcSummaryTr_allDecls(): [DeclTypeBidir, TcSummary][] {
    //     assert.todo()
    // }
    // tcSummaryGr_allDecls(fuel: number): [DeclTypeGraph, TcSummary][] {
    //     assert.todo()
    // }

    tcSummaryTr_expr(expr: ExprTree<ExprTypeBidir>): TcSummary {
        // this.typeCheckTr()
        const tcs = tcSummariseTree2(expr)
        return tcs
    }
    tcSummaryGr_expr(expr: ExprTree<ExprTypeGraph>): TcSummary {
        // const fuel = fuel_r.read()
        // if (fuel.isStopped() || fuel.isExhausted()) return tcsZero()
        // this.typeCheckGr(fuel_r)
        // this.typeCheckGr_expr(expr, fuel)
        assert.isTrue(this.g !== null)
        const tcs = tcSummariseGraph2(this.g, expr)
        return tcs
    }


    specialize(): boolean {
        assert.todo()
    }
    codegen(co: CodeOptions): unit {
        const crk = codeOptions_codeRunnerKey(co)
        let cr = this.crs.get(crk)
        if (cr !== undefined) {
            return
        }
        if (this._prev !== null) {
            this._prev.codegen(co)
            cr = this._prev.crs.get(crk)!.clone()
        }
        else {
            cr = codeRunnerMakers[co.cg]()

        }
        this.typeCheckTr()

        this.crs.set(crk, cr)

        if (this._prev === null) {
            // Don't generate code for the first row of the code-table.
            return
        }

        if (!co.inst) {
            this.log("codegen")
            cr.addDeclsAst(this.declsTy())
        }
        else {
            this.instantiate(co.tyG)
            assert.isTrue(this.g !== null)
            assert.isTrue(this._fullEnvG !== null)

            for (const d0 of this.decls()) {
                const d = d0 as DeclTypeGraph
                assert.isTrue(d[1].tm !== undefined)
                this.g.gr.reduce(d[1].tm)
            }

            const rbDecls = this.readback()
            this.log("codegen")
            cr.addDeclsAst(rbDecls)
        }

        // this.crs.set(crk, cr)
    }
    typeCheckTr_expr(expr: ExprLoc): ExprTypeBidir {
        this.typeCheckTr()
        assert.todo()
    }
    typeExpr(exp: ExprLoc): ExprTypeBidir {
        const topLevel = true
        const exp2 = typeExprBidir(exp, anyT, this.fullEnvT(), topLevel)
        // return exp2
        return exp as ExprTypeBidir
    }
    typeExprStr(expStr: string, lineStarts?: Pos[]): ExprTypeBidir {
        this.typeCheckTr()
        let expTokens = scan2Fe("", expStr, null, lineStarts)
        let expPS = new ParseState(expTokens)
        let expAst = parseTerm(expPS, "ferrum/0.1")

        const topLevel = true
        return typeExprBidir(expAst, anyT, this.fullEnvT(), topLevel)
    }
    instantiate_expr(expr: ExprLoc): ExprTypeGraph {
        const performTypeCheck = true
        this.instantiate(performTypeCheck)
        assert.isTrue(this.g !== null)
        assert.isNotNull(this._fullEnvG)
        const anyTy = this.primAddr("Any")!
        const exprG = this.g.inst.instTerm(this.g.primitives, this._fullEnvG, depthZero, expr, anyTy, performTypeCheck)
        // return exprG
        return expr as ExprTypeGraph
    }
    instantiate_exprStr(language: string | null, expStr: string, lineStarts: Pos[]): ExprTypeGraph {
        this.typeCheckTr()
        let expTokens = scan2Fe("", expStr, null, lineStarts)
        let expPS = new ParseState(expTokens)
        let expAst = parseTerm(expPS, language ?? "ferrum/0.1")

        const exprG = this.instantiate_expr(expAst)
        return exprG
    }
    typeCheckGr_expr(expr: ExprLoc): ExprTypeGraph {
        this.typeCheckGr()
        assert.todo()
    }
    typeCheckGr_expr_tiVal(e: ExprTypeGraph): TiVal | null {
        assert.isTrue(this.g !== null)
        // const tiVal = this.g?.ti.typeCheck2(e.torp, e.synTy, e.ctxTy, e.loc)
        const tiVal = this.g?.ti.typeInhabCheck(e.rc, e.loc)
        return tiVal
    }
    coderun_exprList(co: CodeOptions, exprList: ExprLoc[]): string[] {
        const crk = codeOptions_codeRunnerKey(co)
        this.codegen(co)
        const cr = this.crs.get(crk)!

        const req = cr.requirements()

        if (req.typesT === true) {
            for (const expr of exprList) {
                typeExprBidir(expr, anyT, this.fullEnvT(), true)
            }
        }
        if (req.typesG === true) {
            // TODO No code-generators need this yet.
            assert.todo("Instantiate the expressions, so as to annotate the AST with graph-types.")
        }

        const result = cr.evaluateAndShowList(exprList)
        return result
    }
    prev(): CodeTable | null {
        return this._prev
    }
    name(): string {
        return this._name
    }
    source(): string | null {
        return this._source
    }
    root(): CodeTableImpl {
        let root: CodeTableImpl = this
        while (root._prev !== null) {
            root = root._prev
        }
        return root
    }
    primitives(): EVar[] {
        return this.root()._prims
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
    rows(): CodeTableRow[] {
        // This returns all but the first row.
        // The first row corresponds to the empty table.
        // It is all that exists before any calls to addCode/addText are called.
        const rows: CodeTableRow[] = []
        let ct: CodeTableImpl = this
        while (ct._prev !== null) {
            rows.push(ct)
            ct = ct._prev
        }
        rows.reverse()
        return rows
    }
    decls(): DeclLoc[] {
        return this._decls
    }
    declsTy(): DeclTypeBidir[] {
        this.typeCheckTr()
        assert.isTrue(this._declsTy !== null)
        return this._declsTy
    }
    fullEnvT(): Env {
        this.typeCheckTr()
        assert.isTrue(this._fullEnv !== null)
        return this._fullEnv
    }


    fullEnvG(): GraphEnvRo {
        const performTypeCheck = true
        this.instantiate(performTypeCheck)
        assert.isNotNull(this._fullEnvG)
        return this._fullEnvG
    }


    primAddr(name: string): Addr | null {
        // this.instantiate()
        assert.isTrue(this.g !== null)
        // const builtin = this.g.primitives.get(name)
        // if (builtin !== null && builtin.term !== undefined) {
        //     return builtin.term
        // }
        // return null

        const env = this.g.primitives.env()
        if (env.has(name)) {
            return env.get(name)
        }
        return null
    }

    codeRunner(co: CodeOptions): CodeRunner {
        const crk = codeOptions_codeRunnerKey(co)
        this.codegen(co)
        return this.crs.get(crk)!
    }
    graph(): Graph {
        // TODO ? Create the graph/heap when needed ?
        // TODO ?   The null-ness of the graph is currently used to indicate if instantiation has taken place.
        // TODO ?   Perhaps need a separate flag to indicate instantiation
        // TODO ? Or maybe, incorporate whatever the direct access to Graph is being used for into the CodeTable
        // this.instantiate()
        assert.isTrue(this.g !== null)
        return this.g
    }
}

type CodeTableOpts = {
    monitor?: GraphMonitor

    // TODO ? Allow user-specifiable alternative primitives ?
    // TODO For now, all fresh code-tables are created with the default "<primitives>" at the root.
    // primitives?: true

    // TODO ? Give callers more control over how code-tables are constructed. ?
    // TODO For now, all code-tables share the same underlying heap, as this makes debug/diagnostics simpler.
    // shareHeapWith?: CodeTable | null
}

export function mkCodeTable(opts: CodeTableOpts): CodeTable {

    let g: Graph = globalGraph
    if (opts.monitor !== undefined) {
        g = Object.create(GraphPrototype)
        graphInit(g, { heap: globalHeap, monitor: opts.monitor })
    }

    const ct = new CodeTableImpl(null, g, "<primitives>", [])

    initPrimitives()

    // const initEnv = getPrimEnv()
    const primEnv = getPrimEnv()
    const initEnv: Env = {} // { "primitive": primEnv.primitive }

    const essential: string[] = [
        "primitive",
        "(+)", "(-)", "(*)",
        "(==)", "(>)", "(>=)", "(<)", "(<=)",
        "(&&)", "(||)",
        "(<$)", "(_$?)",
        "(|-)", "(|=)",
        "{&}", "{|}", "{\\}",
    ]
    for (const p of essential) {
        initEnv[p] = primEnv[p]

        const pat = eVar({ loc: nilLoc }, p)

        const gp = g.primitives.get(p) ?? g.primitives.get(`(${p})`)!

        const tyVoid = ct.primAddr("Void")!
        assumeIsType(tyVoid)

        const pat2: ExprTypeGraph & EVar = { ...pat as ExprTypeGraph & EVar, tm: gp?.term!, synTy: gp.type, ctxTy: gp.type, torp: "Term", rc: tyVoid }

        // ct._decls.push([pat2, pat2])
        ct._prims.push(pat2)
    }

    // TODO Stop using localEnv
    ct._localEnv = initEnv
    ct._fullEnv = initEnv
    return ct
}


//#endregion





//#region Graph


export type GraphMonitor = {
    graphReduction(addr: Addr, tag: "Beta" | "Delta" | "Mark"): unit
    tiExpansion(addr: Addr): unit
    tiReduction(addr: Addr): unit
}

export const graphMonitorNop: GraphMonitor = {
    graphReduction(addr, tag) { },
    tiExpansion(addr) { },
    tiReduction(addr) { },
}

export type Graph = {
    monitor: GraphMonitor
    heap: Heap
    subst: Substitute
    inst: Instantiate
    pred: GraphPredicates
    tis: TiStructuralFuncs
    ga: GraphApply
    primitives: Primitives
    gr: GraphReduce
    tim: TiMemoFuncs
    tiRules: TiRules
    ti: TiCalcFuncs
    show: ShowFuncs
}

// GraphPrototype exists purely for diagnostic use in the NodeJs REPL.
// The methods are not intended to be called from within the code base.
const GraphPrototype = {
    showRb(addr: Addr): string {
        const g = this as Graph & typeof GraphPrototype
        const rbLetEnv: RbLetEnv = new Map
        const rbLamEnv: RbLamEnv = new Map
        const expr = readback(g.heap, rbLetEnv, rbLamEnv, "Term", addr)
        return prettyFerrum(expr)
    },
    showAddrs(addr: Addr): string {
        const g = this as Graph & typeof GraphPrototype
        const addrs: Addr[] = [addr]
        // Follow and collect the chain of indirections, if there are any.
        while (g.heap.isUpdated(addr)) {
            addr = g.heap.updatedTo(addr)
            addrs.push(addr)
        }
        return addrs.join(" -> ")
    },
    showGraph(addr: Addr, showTypes = false, showOrig = false, followIndirection = true): string {
        const g = this as Graph & typeof GraphPrototype
        const lines = showGraph(g.heap, [addr], showTypes, showOrig, followIndirection)
        return lines.join("\n")
    },
    showNode(addr: Addr): string {
        const g = this as Graph & typeof GraphPrototype
        return g.heap.showNode(addr)
    },
    showEntry(addr: Addr): string {
        const g = this as Graph & typeof GraphPrototype
        return g.heap.showEntry(addr)
    },
}


type GraphOptions = {
    heap?: Heap,
    monitor?: GraphMonitor
}

function graphInit(g: Graph, opts: GraphOptions): unit {

    let initialized = false
    let monitor = graphMonitorNop

    if (opts.monitor !== undefined) {
        const mon = opts.monitor
        monitor = {
            graphReduction(addr, tag) {
                if (!initialized) return
                mon.graphReduction(addr, tag)
            },
            tiExpansion(addr) {
                if (!initialized) return
                mon.tiExpansion(addr)
            },
            tiReduction(addr) {
                if (!initialized) return
                mon.tiReduction(addr)
            },
        }
    }

    g.heap = opts.heap ?? mkHeap_AoUoS()
    g.monitor = monitor
    g.tim = mkTiMemoFuncs(new Map)

    g.primitives = mkPrims()
    g.subst = mkSubstitute(g.heap)
    g.pred = graphPredicatesMk(g.heap)

    g.tis = mkTiStructuralFuncs(g.heap, g.pred)
    g.tiRules = mkTiRules(g.heap, g.tim, g.pred, g.tis)
    g.ga = mkGraphApply(g.heap, g.subst, g.pred, g.tis)
    g.gr = mkGraphReduce(g.heap, g.subst, g.primitives, g.ga, monitor)
    g.ti = mkTiCalcFuncs(g.heap, g.gr, g.tim, g.tis, g.tiRules, monitor)
    g.show = mkShow(g.heap)

    g.inst = mkInstantiate(g.heap, g.gr, g.pred, g.ti)

    g.primitives.init(g.heap, g.subst, g.inst, g.pred, g.tis, g.ga)

    initialized = true


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


const globalHeap = mkHeap_AoUoS()
const globalGraph = Object.create(GraphPrototype);
// const globalGraph = new GraphImpl(mkHeap_AoUoS(), graphMonitorNop);
(globalThis as any as { gg: Graph }).gg = globalGraph
graphInit(globalGraph, { heap: globalHeap });



//#endregion




